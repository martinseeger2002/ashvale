"""bank.py - the @ashvale Bank (handoff/bank_plan.md). 2026-10-04: everything a player holds lives in their own
arcade wallet; gear is one NFT per item, MINTED ON DEMAND by @ashvale; stackables are @ashvale tokens; GOLD is #26.

How it runs:
  - A headless Chromium signed in as @ashvale (tools/pw_send.py's state) opens the ASHVALE launcher in the arcade viewer
    and joins realtime room 'bank' (game 'ashvale'). The mesh proves every sender's address (player certificate checked
    by the node); guests are refused.
  - The game sends {t:'dep', v:1, id, items:{itemId: n}}: things the player carries that the wallet does not hold yet.
    The bank answers at once {t:'dep', id, to, ok, paid, note} and queues the delivery (chain/bank/bank.sqlite), so a
    restart never loses a promise. Requests are idempotent by (address, id).
  - Delivery, through the standalone wallet (tools/ashvale_wallet.py, no browser): a token GRANT straight to the player
    (one transaction per kind); gear: an @ashvale-held Armoury copy of that key is sent first, and when none is left a
    new copy is inscribed (same picture, copy number in a PNG text chunk so the bytes are new) and then sent.
  - Testnet trust: deposits are not proven (the referee path replaces that later). Caps per address per day bound it.
    Magical items (a Form trait, the Hawk rings) are never minted: only a copy back in @ashvale's hands (dropped, returned) is passed on.
Run:  python3 tools/bank/bank.py            (systemd user unit ashvale-bank)
      python3 tools/bank/bank.py --status   (queue summary)
Never prints @ashvale's words, password or keys."""
import sys, os, json, time, sqlite3, struct, zlib, threading, traceback, urllib.request
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(HERE, 'tools'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
APP = 'https://app.dogecoinarcade.com'
DB = os.path.join(HERE, 'chain', 'bank', 'bank.sqlite')
LOG = os.path.join(HERE, 'chain', 'bank', 'bank.log')
ASHVALE = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
YOURFIRST = 'ns3A7VS6DDaCoBvNFnayHeS9pysgi7Ukrf'   # @yourfirstname, on the same automation lists as @ashvale
BANK_PAGE = 'f0a8023a6c32854292243bb79ac9debacf00c3dac767e15f04551434db6a46ee'   # @ashvale's bank-room page: /r/realtime.js only
CAP_GEAR_DAY, CAP_UNITS_DAY, CAP_GOLD_DAY = 80, 5000, 200000   # per address per day (testnet bound on unproven deposits)

def log(*a):
    line = time.strftime('%Y-%m-%d %H:%M:%S ') + ' '.join(str(x) for x in a)
    print(line, flush=True)
    with open(LOG, 'a') as f: f.write(line + '\n')
def load_json(p): return json.load(open(os.path.join(HERE, p)))
ITEMS = load_json('data/items.json')['data']['items']
def assets(): return load_json('data/assets.json')['data']['items']
def token_ids():
    t = load_json('chain/resource_tokens.json') if os.path.exists(os.path.join(HERE, 'chain/resource_tokens.json')) else {}
    t['coins'] = 26; return t
def unique(k): return any(isinstance(a, dict) and a.get('trait_type') == 'Edition' for a in (ITEMS.get(k) or {}).get('attributes', []))   # a one-of-one: never minted again (2026-10-06)
def magical(k): return bool((ITEMS.get(k) or {}).get('form')) or any(a.get('trait_type') == 'Form' for a in (ITEMS.get(k) or {}).get('attributes', []) if isinstance(a, dict))

def db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=30); c.row_factory = sqlite3.Row
    c.executescript("""create table if not exists reqs(addr text, id text, items text, paid text, at real, primary key(addr, id));
        create table if not exists jobs(n integer primary key, addr text, item text, units integer, kind text, status text, tries integer default 0,
            txid text, piece text, err text, at real, done_at real, req text);
        create table if not exists given(piece text primary key, addr text, item text, at real);
        create table if not exists felled(x integer, y integer, by text, at real, primary key(x, y));   -- trees felled for good, shared (2026-10-05)
        create table if not exists wheres(addr text primary key, x integer, y integer, at real);   -- where each player last stood, for the Atlas (2026-10-06)
        create table if not exists drops(n integer primary key, addr text, item text, piece text, x integer, y integer, at real, taken_by text, taken_at real);
        create table if not exists ghosts(n integer primary key, addr text, item text, units integer, x integer, y integer, at real, left integer);   -- picked-up copies of drops somebody else already took (2026-10-06)""")
    for col in ('want', 'coll'):   # want: the exact piece (a pickup of a drop); coll: a quest reward's own collection
        try: c.execute('alter table jobs add column %s text' % col)
        except sqlite3.OperationalError: pass
    # persisted drops (2026-10-06): units (Gold and other tokens have no piece), live = shown to every player until
    # someone takes it, paid = the picker's piece has been handed out
    for col, ty in (('units', 'integer default 1'), ('live', 'integer default 0'), ('paid', 'integer default 0')):
        try: c.execute('alter table drops add column %s %s' % (col, ty))
        except sqlite3.OperationalError: pass
    return c

# ---------------------------------------------------------------- requests (from the room)
def handle_drop(c, addr, msg):
    """{t:'drop', items:[[itemId, piece]], x, y}: the exact pieces a player dropped (or died with), so whoever picks one up is
    paid THAT piece (2026-10-04: "it should be the exact same NFT"). v3 (2026-10-06: "items dropped by a player
    should persist in the @ashvale wallet in the exact same location until a player picks them up"): items are
    [itemId, piece or '', units] and the game only sends what its rules keep (Gold, stones, magical, worth 100+ GOLD); those are
    LIVE: held for no time limit and shown to every player who asks what lies near them ('ground?')"""
    x, y = int(msg.get('x') or 0), int(msg.get('y') or 0); live = 1 if (msg.get('v') or 0) >= 3 else 0
    for it in (msg.get('items') or [])[:40]:
        try: k, pc = str(it[0]), str(it[1] or ''); u = max(1, min(1000000, int(it[2]) if len(it) > 2 else 1))
        except (TypeError, IndexError, ValueError): continue
        if k not in ITEMS: continue
        if pc:
            if len(pc) != 64 or c.execute('select 1 from drops where piece=? and taken_by is null', (pc,)).fetchone(): continue
            c.execute('insert into drops(addr,item,piece,x,y,at,units,live) values(?,?,?,?,?,?,1,?)', (addr, k, pc, x, y, time.time(), live))
        elif live:   # a token (Gold...): an amount on a spot; the same kind dropped on the same spot again adds to it
            r = c.execute('select n from drops where item=? and piece is null and live=1 and taken_by is null and x=? and y=?', (k, x, y)).fetchone()
            if r: c.execute('update drops set units=units+?, at=? where n=?', (u, time.time(), r['n']))
            else: c.execute('insert into drops(addr,item,piece,x,y,at,units,live) values(?,?,null,?,?,?,?,1)', (addr, k, x, y, time.time(), u))
    c.commit(); log('DROP', addr, json.dumps(msg.get('items'))[:200], x, y, 'live' if live else '')
def handle_took(c, addr, msg):
    """{t:'took', id, n, x, y}: a player picked up a persisted drop. It leaves every other player's ground at once (the next
    'ground?' no longer lists it), and the picker's deposit is paid THAT piece. The dropper taking back its own: just gone."""
    try: k, x, y = str(msg['id']), int(msg['x']), int(msg['y'])
    except (KeyError, TypeError, ValueError): return None
    r = c.execute('select n, addr from drops where item=? and live=1 and taken_by is null and abs(x-?)<=2 and abs(y-?)<=2 order by abs(x-?)+abs(y-?), at limit 1',
                  (k, x, y, x, y)).fetchone()
    if r:
        c.execute('update drops set taken_by=?, taken_at=?, paid=? where n=?', (addr, time.time(), 1 if r['addr'] == addr else 0, r['n'])); c.commit()
        log('TOOK', addr, k, x, y, 'drop', r['n'], '(its own)' if r['addr'] == addr else '')
        return None
    # nothing untaken there, but a drop of it there was already taken by somebody: this was a GHOST (a copy an outdated game
    # kept showing - 2026-10-06 picked up the same 200 Gold again and again). Its units are not paid out on the next deposit.
    g = c.execute('select n, units from drops where item=? and live=1 and taken_by is not null and taken_by<>? and abs(x-?)<=2 and abs(y-?)<=2 and taken_at>? order by taken_at desc limit 1',
                  (k, addr, x, y, time.time() - 86400)).fetchone()
    if g:
        try: u = max(1, min(int(msg.get('n') or 1), g['units'] or 1))
        except (TypeError, ValueError): u = 1
        c.execute('insert into ghosts(addr,item,units,x,y,at,left) values(?,?,?,?,?,?,?)', (addr, k, u, x, y, time.time(), u)); c.commit()
        log('GHOST', addr, k, u, x, y, 'copy of drop', g['n'], '- not paid out')
    return None
def handle_ground(c, addr, msg):
    """'ground?' {x0, y0, x1, y1}: the persisted drops lying in that rectangle, for the game to show (in chunks: a room message
    is 512 bytes). Each item: [drop id, itemId, units, x, y]."""
    try: x0, y0, x1, y1 = (int(msg[k]) for k in ('x0', 'y0', 'x1', 'y1'))
    except (KeyError, TypeError, ValueError): return None
    if x1 - x0 > 400 or y1 - y0 > 400: return None
    rows = [[r['n'], r['item'], r['units'] or 1, r['x'], r['y']] for r in
            c.execute('select n, item, units, x, y from drops where live=1 and taken_by is null and x between ? and ? and y between ? and ? order by n', (x0, x1, y0, y1))]
    box, q = [x0, y0, x1, y1], str(msg.get('q') or '')[:12]
    log('GROUND?', addr, box, len(rows), 'live drops')
    chunks = [rows[i:i + 10] for i in range(0, len(rows), 10)] or [[]]
    return [{'t': 'ground', 'to': addr, 'q': q, 'box': box, 'i': i, 'of': len(chunks), 'items': ch} for i, ch in enumerate(chunks)]
def claim_drop(c, addr, k, at):
    """the piece of kind k dropped where this player picked one up (within 2 tiles): one it already said it took ('took'), else
    an untaken one - a live drop (persisted) at any age, an older-style drop within the hour"""
    for x, y in at:
        r = c.execute("""select n, piece from drops where item=? and piece is not null and addr<>? and abs(x-?)<=2 and abs(y-?)<=2 and
                         ((taken_by=? and paid=0) or (taken_by is null and (live=1 or at>?))) order by (taken_by is null), at limit 1""",
                      (k, addr, int(x), int(y), addr, time.time() - 3600)).fetchone()
        if r: c.execute('update drops set taken_by=?, taken_at=?, paid=1 where n=?', (addr, time.time(), r['n'])); return r['piece']
    return None
def claim_drop_any(c, addr, k):
    """no spot from the game: one it said it took, else the newest untaken older-style drop of kind k within the hour"""
    r = c.execute("""select n, piece from drops where item=? and piece is not null and addr<>? and
                     ((taken_by=? and paid=0) or (taken_by is null and live=0 and at>?)) order by (taken_by is null), at desc limit 1""",
                  (k, addr, addr, time.time() - 3600)).fetchone()
    if r: c.execute('update drops set taken_by=?, taken_at=?, paid=1 where n=?', (addr, time.time(), r['n'])); return r['piece']
    return None
def _flagged(j):
    """the Ashvale flag: required on a @yourfirstname piece, the same gate the game uses"""
    if not isinstance(j, dict): return False
    if j.get('game') == 'ashvale' or j.get('ashvale') is True: return True
    for a in j.get('attributes') or []:
        if not isinstance(a, dict): continue
        k = str(a.get('trait_type') or '').lower()
        if k in ('flag', 'game') and str(a.get('value') or '').lower() == 'ashvale': return True
    return False
def holdings(addr):
    """what this address holds on chain, by game item: {itemId: units} - gear by its Key (any @ashvale collection), tokens by id"""
    out, off = {}, 0
    while True:
        L = json.load(urllib.request.urlopen(APP + '/r/inscriptions/%s?limit=200&offset=%d' % (addr, off), timeout=60))
        for p in L or []:
            if p.get('creator') not in (ASHVALE, YOURFIRST) or p.get('held') is False or (p.get('owner') and p.get('owner') != addr): continue
            if p.get('creator') == YOURFIRST:
                ct = str(p.get('contenttype') or p.get('content_type') or '')
                if not _flagged(p.get('json') or {}) or (ct and ct != 'application/json'): continue
            j = p.get('json') or {}
            k = j.get('key') or next((a.get('value') for a in j.get('attributes', []) if a.get('trait_type') in ('Key', 'key')), None)
            if k: out[k] = out.get(k, 0) + 1
        if not L or len(L) < 200: break
        off += 200
    pid2item = {v: k for k, v in token_ids().items()}
    for b in json.load(urllib.request.urlopen(APP + '/r/balances/' + addr, timeout=60)) or []:
        if b.get('issuer') in (ASHVALE, YOURFIRST) and b.get('propertyid') in pid2item: out[pid2item[b['propertyid']]] = out.get(pid2item[b['propertyid']], 0) + int(b.get('units') or 0)
    return out
def handle_felled(c, addr, msg):
    """'fell': a player felled the tree at (x, y) - it stays down for everyone. 'felled?': which trees in a rectangle are down
    (answered in chunks: a room message is 512 bytes)"""
    if msg.get('t') == 'fell':
        try: x, y = int(msg['x']), int(msg['y'])
        except (KeyError, TypeError, ValueError): return None
        c.execute('insert or ignore into felled values(?,?,?,?)', (x, y, addr, time.time())); c.commit(); return None
    try: x0, y0, x1, y1 = (int(msg[k]) for k in ('x0', 'y0', 'x1', 'y1'))
    except (KeyError, TypeError, ValueError): return None
    if x1 - x0 > 400 or y1 - y0 > 400: return None
    cells = [[r['x'], r['y']] for r in c.execute('select x, y from felled where x between ? and ? and y between ? and ?', (x0, x1, y0, y1))]
    return [{'t': 'felled', 'to': addr, 'cells': cells[i:i + 30]} for i in range(0, len(cells), 30)]
def handle_where(c, addr, msg):
    """the Atlas's "you are here" (2026-10-06: players open the Atlas from the Games tab and should see a dot where they
    are). 'here' {x, y}: the game says where this player stands (sent as it saves, when they have moved or every 2 minutes,
    and as they leave). 'where?': the Atlas asks for its own player's spot; the answer goes to that address only."""
    if msg.get('t') == 'here':
        try: x, y = int(msg['x']), int(msg['y'])
        except (KeyError, TypeError, ValueError): return None
        if abs(x) > 10**7 or abs(y) > 10**7: return None
        c.execute('insert into wheres values(?,?,?,?) on conflict(addr) do update set x=excluded.x, y=excluded.y, at=excluded.at', (addr, x, y, time.time())); c.commit(); return None
    r = c.execute('select x, y, at from wheres where addr=?', (addr,)).fetchone()
    log('WHERE?', addr, 'unknown' if not r else (r['x'], r['y']))
    return {'t': 'where', 'to': addr, 'x': r['x'], 'y': r['y'], 'at': int(r['at'])} if r else {'t': 'where', 'to': addr, 'none': 1}
def handle(c, addr, msg):
    """-> reply dict (or a list of them). Queues jobs; never touches the chain itself."""
    if msg.get('t') == 'drop': handle_drop(c, addr, msg); return None
    if msg.get('t') == 'took': return handle_took(c, addr, msg)
    if msg.get('t') == 'ground?': return handle_ground(c, addr, msg)
    if msg.get('t') in ('fell', 'felled?'): return handle_felled(c, addr, msg)
    if msg.get('t') in ('here', 'where?'): return handle_where(c, addr, msg)
    rid = str(msg.get('id') or '')[:40]
    if not rid: return None
    old = c.execute('select paid from reqs where addr=? and id=?', (addr, rid)).fetchone()
    if old: return {'t': 'dep', 'id': rid, 'to': addr, 'ok': True, 'paid': json.loads(old['paid']), 'note': 'Already on its way.'}
    A, T = assets(), token_ids()
    since = time.time() - 86400
    used = {r['kind']: r['u'] for r in c.execute('select kind, sum(units) u from jobs where addr=? and at>? group by kind', (addr, since))}
    per_item = {r['item']: r['u'] for r in c.execute('select item, sum(units) u from jobs where addr=? and at>? group by item', (addr, since))}
    paid, refused, absorb = {}, [], []
    owed = {r['item']: r['u'] for r in c.execute("select item, sum(units) u from jobs where addr=? and status in ('queued','retry','failed') group by item", (addr,))}
    fresh = {}   # sent but NOT in a block yet (a confirmed one is already in `held`: counting it again lost the operator 4 chickens, 2026-10-04)
    for r in c.execute("select item, units, txid from jobs where addr=? and status='done' and done_at>?", (addr, time.time() - 3600)):
        try: conf = int((json.load(urllib.request.urlopen(APP + '/r/tx/' + r['txid'], timeout=20)) or {}).get('confirmations') or 0) if r['txid'] else 1
        except Exception: conf = 0
        if conf < 1: fresh[r['item']] = fresh.get(r['item'], 0) + r['units']
    # THE CHAIN CHECKS THE COUNT (2026-10-04: one game per device kept its own count and re-asked for tools it never saw).
    # The game says, per item, how many it carries, how many it shows in the chest and how many it used up; together
    # those must be more than the wallet holds (plus what is on its way) for anything new to be paid. A second steel helmet
    # is new (the operator: "if I have a steel helmet, I should be able to get a second"); a stale count is not, and is told to
    # let the wallet's units stand for what it carries (absorb). A game too old to say so counts as carrying what it asks for.
    try: held = holdings(addr)
    except Exception as e: log('HOLDINGS ERROR', addr, str(e)[:120]); return {'t': 'dep', 'id': rid, 'to': addr, 'ok': False, 'paid': {}, 'refused': list((msg.get('items') or {}).keys())[:20], 'note': 'The bank could not read your wallet just now; it will try again.'}
    carried = msg.get('carried') or {}
    for k, n in (msg.get('items') or {}).items():
        try: n = int(n)
        except (TypeError, ValueError): continue
        if n <= 0 or k not in ITEMS: continue
        a = A.get(k) or {}
        try: claim = (int(carried.get(k)) if k in carried else n) + int((msg.get('chest') or {}).get(k) or 0) + int((msg.get('spent') or {}).get(k) or 0)
        except (TypeError, ValueError): claim = n
        want = n; base = claim - held.get(k, 0)
        n = min(n, max(0, base - owed.get(k, 0) - fresh.get(k, 0)))   # only what no NFT or token of yours stands for yet
        for gr in c.execute('select n, left from ghosts where addr=? and item=? and left>0 order by n', (addr, k)).fetchall():   # ghost pickups are never paid
            if n <= 0: break
            cut = min(n, gr['left']); n -= cut; c.execute('update ghosts set left=left-? where n=?', (cut, gr['n'])); log('GHOST CUT', addr, k, cut)
        if base < want: absorb.append(k)   # the count itself is stale: the wallet's units stand for these (never because a delivery is merely on its way)
        if n <= 0: continue
        if k == 'coins':
            n = min(n, CAP_GOLD_DAY - per_item.get('coins', 0))
            kind = 'token'
        elif a.get('kind') == 'nft':
            n = min(n, CAP_GEAR_DAY - used.get('nft', 0)); kind = 'nft'
        elif T.get(k):
            n = min(n, CAP_UNITS_DAY - per_item.get(k, 0)); kind = 'token'
        else: refused.append(k); continue   # its token is not issued yet
        if n <= 0: refused.append(k); continue
        used[kind] = used.get(kind, 0) + n; per_item[k] = per_item.get(k, 0) + n; paid[k] = paid.get(k, 0) + n
        if kind == 'nft':
            at = [p for p in ((msg.get('from') or {}).get(k) or []) if isinstance(p, list) and len(p) == 2][:n]
            rc = str((msg.get('reward') or {}).get(k) or '')[:60] or None   # a quest reward (the operator: "its own collection")
            if rc and not rc.startswith('ASHVALE '): rc = None
            for i in range(n):
                want = claim_drop(c, addr, k, [at[i]]) if i < len(at) else claim_drop_any(c, addr, k)   # picked up off the ground: that exact piece
                coll = rc if i == 0 and not want else None
                c.execute("insert into jobs(addr,item,units,kind,status,at,req,want,coll) values(?,?,1,'nft','queued',?,?,?,?)", (addr, k, time.time(), rid, want, coll))
        else: c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,'token','queued',?,?)", (addr, k, n, time.time(), rid))
    c.execute('insert into reqs values(?,?,?,?,?)', (addr, rid, json.dumps(msg.get('items') or {}), json.dumps(paid), time.time())); c.commit()
    note = ''
    if paid: note = 'The @ashvale Bank is putting ' + str(sum(paid.values())) + ' thing' + ('s' if sum(paid.values()) != 1 else '') + ' in your wallet. Gear takes a few minutes.'
    if refused: note += (' ' if note else '') + 'Not banked: ' + ', '.join(ITEMS[k].get('name', k) for k in refused[:4]) + ('…' if len(refused) > 4 else '') + ' (magical, not on the chain yet, or over today\'s limit).'
    log('REQ', addr, rid, 'paid', json.dumps(paid), 'refused', refused)
    return {'t': 'dep', 'id': rid, 'to': addr, 'ok': bool(paid), 'paid': paid, 'refused': refused[:20], 'absorb': absorb[:20], 'note': note or 'Already in your wallet.'}

# ---------------------------------------------------------------- delivery (the wallet)
def held_pieces():
    """{key: [piece ids]} of Armoury copies @ashvale still holds, newest listing."""
    out, off = {}, 0
    while True:
        L = json.load(urllib.request.urlopen(APP + '/r/inscriptions/%s?limit=200&offset=%d' % (ASHVALE, off), timeout=60))
        for p in L or []:
            j = p.get('json') or {}
            if p.get('owner') not in (None, ASHVALE) or p.get('held') is False or j.get('collection') != 'ASHVALE Armoury': continue
            k = next((a.get('value') for a in j.get('attributes', []) if a.get('trait_type') == 'Key'), None)
            if k: out.setdefault(k, []).append((p.get('number') or 1e12, p['id']))
        if not L or len(L) < 200:
            return {k: [i for _, i in sorted(v)] for k, v in out.items()}   # lowest number first (the operator: recycle the oldest)
        off += 200
def png_with_text(png, key, text):
    """the same picture with a tEXt chunk added before IEND: new bytes, same image"""
    assert png[:8] == b'\x89PNG\r\n\x1a\n'
    i = png.rfind(b'IEND') - 4
    body = key.encode() + b'\x00' + text.encode()
    chunk = struct.pack('>I', len(body)) + b'tEXt' + body + struct.pack('>I', zlib.crc32(b'tEXt' + body) & 0xffffffff)
    return png[:i] + chunk + png[i:]
class Deliverer:
    def __init__(self):
        from ashvale_wallet import Wallet
        self.W = Wallet(); self.stock, self.stock_t = {}, 0
    def stock_for(self, c, k):
        if time.time() - self.stock_t > 300: self.stock, self.stock_t = held_pieces(), time.time()
        busy = {r['piece'] for r in c.execute('select piece from given where item=? and at>?', (k, time.time() - 900))}   # sent in the last 15 min (still listed as ours)
        busy |= {r['piece'] for r in c.execute("select piece from drops where item=? and piece is not null and ((taken_by is null and (live=1 or at>?)) or (taken_by is not null and paid=0))", (k, time.time() - 3600))}   # dropped: kept for whoever picks it up (a live one for ever)
        busy |= {r['want'] for r in c.execute("select want from jobs where item=? and want is not null and status in ('queued','retry')", (k,))}
        for pid in self.stock.get(k, []):   # lowest number first; a piece that came back to @ashvale is recycled
            if pid not in busy: return pid
        return None
    def mint(self, c, k, coll=None):
        """a new Armoury copy of k, inscribed by @ashvale; returns its inscription id once listed"""
        src = (self.stock.get(k) or [None])[0] or self.any_piece(k)
        icon = os.path.join(os.path.dirname(DB), 'icons', k + '.png')
        if src:
            png = urllib.request.urlopen(APP + '/content/' + src, timeout=60).read()
            meta = json.load(urllib.request.urlopen(APP + '/r/inscription/' + src, timeout=60)).get('json') or {}
        elif os.path.exists(icon):   # not in the Armoury (tools, packs, the frost staff...): the game's own icon, rendered by models.icon
            png, meta = open(icon, 'rb').read(), self.meta_of(k)
        else: raise RuntimeError('no picture for ' + k + ' to copy')
        n = c.execute("select count(*) from jobs where item=? and kind='nft' and status='done'", (k,)).fetchone()[0] + 1
        n += int((assets().get(k) or {}).get('copies') or 0)   # numbered on from the Armoury's own copies (the operator: "The stones should be numbered NFTs")
        attrs = [a for a in meta.get('attributes', []) if a.get('trait_type') != 'Copy'] + [{'trait_type': 'Copy', 'value': str(n)}]
        j = {'name': '%s #%d' % ((ITEMS.get(k) or {}).get('name', k), n), 'description': meta.get('description', ''), 'collection': coll or (assets().get(k) or {}).get('collection') or 'ASHVALE Armoury', 'attributes': attrs + ([{'trait_type': 'Quest', 'value': coll[8:]}] if coll else [])}   # the game's collection, or the quest's own
        p = os.path.join(os.path.dirname(DB), 'mint_%s_%d.png' % (k, n)); open(p, 'wb').write(png_with_text(png, 'ashvale', '%s minted %d %d' % (k, n, int(time.time()))))
        self.W.inscribe(p, json.dumps(j, separators=(',', ':')), 'image/png')
        import hashlib; want = hashlib.sha256(open(p, 'rb').read()).hexdigest()
        for _ in range(40):   # its id comes with the block
            time.sleep(30)
            L = json.load(urllib.request.urlopen(APP + '/r/inscriptions?creator=%s&limit=100' % ASHVALE, timeout=60))
            for q in L or []:
                if q.get('sha256') == want: return q['id']
        raise RuntimeError('minted ' + k + ' not listed after 20 minutes')
    def meta_of(self, k):
        v = ITEMS.get(k) or {}; b = v.get('bonus') or v.get('bonuses') or {}
        at = [{'trait_type': 'Key', 'value': k}, {'trait_type': 'Slot', 'value': v.get('slot') or v.get('category') or 'item'}]
        if v.get('tier') is not None: at.append({'trait_type': 'Tier', 'value': str(v['tier'])})
        for s in ('attack', 'strength', 'defence', 'ranged', 'magic'):
            if isinstance(b, dict) and b.get(s): at.append({'trait_type': s.capitalize(), 'value': str(b[s])})
        return {'description': 'ASHVALE Armoury: ' + v.get('name', k) + '. ' + (v.get('description') or '') + ' From the valley of Ashvale.', 'attributes': at}
    def any_piece(self, k):
        self.stock, self.stock_t = held_pieces(), time.time()
        if self.stock.get(k): return self.stock[k][0]
        L = json.load(urllib.request.urlopen(APP + '/r/inscriptions?creator=%s&limit=500' % ASHVALE, timeout=60))
        for q in L or []:
            j = q.get('json') or {}
            if j.get('collection') == 'ASHVALE Armoury' and any(a.get('trait_type') == 'Key' and a.get('value') == k for a in j.get('attributes', [])): return q['id']
        return None
    def run_one(self, c, job):
        k, addr = job['item'], job['addr']
        if job['kind'] == 'token':
            pid = token_ids().get(k)
            if not pid: raise RuntimeError('no token for ' + k)
            try: r = self.W.token_grant(pid, job['units'], addr)
            except RuntimeError as e:
                if 'issuer' in str(e).lower() or 'managed' in str(e).lower() or 'grant' in str(e).lower(): r = self.W.token_send(pid, job['units'], addr)   # a fixed-supply token (GOLD): from @ashvale's balance
                else: raise
            return (r or {}).get('txid'), None
        if job['want']:   # a pickup: that exact piece, once it is back with @ashvale
            self.stock, self.stock_t = held_pieces(), time.time()
            if job['want'] not in self.stock.get(k, []): raise RuntimeError('waiting for the dropped piece to come back to @ashvale')
            piece = job['want']
        elif job['coll']: piece = None   # a quest reward is always a fresh copy in the quest's collection
        else: piece = self.stock_for(c, k)
        if not piece and magical(k): raise RuntimeError('a magical item is never minted: waiting for a dropped one to come back to @ashvale')
        if not piece and unique(k): raise RuntimeError('a one-of-one is never minted: only the inscribed piece exists')   # (the operator's Hawk ring, 2026-10-04)
        piece = piece or self.mint(c, k, job['coll'])
        c.execute('insert or replace into given values(?,?,?,?)', (piece, addr, k, time.time())); c.commit()
        r = self.W.nft_send(piece, addr)
        return (r or {}).get('txid'), piece
def deliver_loop(stop):
    c = db(); D = Deliverer()
    while not stop.is_set():
        job = c.execute("select * from jobs where status='queued' or (status='retry' and at<?) order by n limit 1", (time.time(),)).fetchone()
        if not job: stop.wait(5); continue
        try:
            txid, piece = D.run_one(c, job)
            c.execute("update jobs set status='done', txid=?, piece=?, done_at=? where n=?", (txid, piece, time.time(), job['n'])); c.commit()
            log('PAID', job['addr'], job['item'], job['units'], txid)
        except Exception as e:
            t = job['tries'] + 1; msg = str(e)[:300]
            wait = 90 if ('mempool' in msg or 'too-long' in msg or 'enough' in msg.lower()) else 60 * min(30, 2 ** t)
            c.execute("update jobs set status=?, tries=?, err=?, at=? where n=?", ('failed' if t >= 12 else 'retry', t, msg, time.time() + wait, job['n'])); c.commit()
            log('RETRY' if t < 12 else 'FAILED', job['addr'], job['item'], job['units'], msg)
        stop.wait(2)

# ---------------------------------------------------------------- the room (Chromium as @ashvale)
JOIN = """async () => {
  if (window.__bank && window.__bank.online) return { online: true, me: window.__bank.me };
  const r = await window.arcade.realtime.join('bank', { game: 'ashvale' }); window.__bank = r; window.__bankQ = [];
  if (r.online) r.on('message', (data, p) => { window.__bankQ.push({ data, from: p ? { address: p.address || null, tag: p.tag || '', guest: !!p.guest } : null }); });
  if (r.online) r.on('closed', why => { window.__bankClosed = String(why || 'closed'); });
  return { online: r.online, why: r.why || null, me: r.me || null };
}"""
def room_loop(stop):
    from pw_send import AshvaleBrowser
    L = BANK_PAGE   # its own tiny page (chain/bank/bank_room.html), not the game: @ashvale never enters the world (2026-10-05: "@ashvale keeps popping into the game")
    c = db()
    while not stop.is_set():
        try:
            with AshvaleBrowser() as B:
                pg = B.pg; pg.goto(APP + '/inscriptions/' + L + '/full'); pg.wait_for_timeout(15000)
                fr = next(f for f in pg.frames if f.evaluate("!!(window.arcade && window.arcade.realtime)"))
                st = fr.evaluate(JOIN)
                if not st.get('online'): raise RuntimeError('room offline: %s' % st.get('why'))
                log('BANK OPEN in room bank as', (st.get('me') or {}).get('tag'))
                pg.set_viewport_size({'width': 96, 'height': 96})   # nobody watches this page: a tiny canvas keeps the game's drawing cheap
                t_rejoin = time.time()
                while not stop.is_set():
                    if fr.evaluate("window.__bankClosed || null"): raise RuntimeError('room closed')
                    for m in fr.evaluate("window.__bankQ.splice(0)"):
                        d, f = m.get('data') or {}, m.get('from') or {}
                        if not isinstance(d, dict) or d.get('t') not in ('dep', 'drop', 'fell', 'felled?', 'took', 'ground?', 'here', 'where?'): continue
                        if f.get('guest') or not f.get('address'): continue
                        try: rep = handle(c, f['address'], d)
                        except Exception: log('HANDLE ERROR', traceback.format_exc()[-400:]); rep = {'t': 'dep', 'id': d.get('id'), 'to': f['address'], 'ok': False, 'note': 'The bank hit an error; try again later.'}
                        for r1 in (rep if isinstance(rep, list) else [rep] if rep else []): fr.evaluate("o => window.__bank.send(o)", r1)
                    if time.time() - t_rejoin > 6 * 3600: raise RuntimeError('periodic reopen')   # keep the sign-in and cert fresh
                    stop.wait(1)
        except Exception as e:
            log('ROOM DOWN', str(e)[:200]); stop.wait(30)

if __name__ == '__main__':
    if '--status' in sys.argv:
        c = db()
        for r in c.execute('select status, kind, count(*) n, sum(units) u from jobs group by status, kind'): print(dict(r))
        for r in c.execute("select addr, item, units, err from jobs where status in ('retry','failed') order by n desc limit 10"): print(dict(r))
        sys.exit()
    stop = threading.Event()
    t = threading.Thread(target=deliver_loop, args=(stop,), daemon=True); t.start()
    try: room_loop(stop)
    finally: stop.set()
