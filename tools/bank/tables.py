"""tables.py - the @ashvale Bank's clubhouse tables (2026-10-20: "the craps table, the roulette table and the blackjack
table", two upper floors of the Saltmere Links clubhouse, SHARED ROUNDS: one roll / spin / dealer hand for everyone at a table,
the Bank runs the clock). Never name the games in public text: the dice table, the wheel, the twenty-one table.

Money is kept exactly as at the Fortune Engines (bank.py fe_*): a SITTING s = 'tb:<table>:<hex>' holds a credit; GOLD comes in
by deposits (tbin, credit at once, home only once the chain shows every deposit), goes out as GOLD jobs on a cash-out (tbout) or
when the sitting goes quiet with nothing on the felt. Bets leave the credit when they are placed; a round's settlement adds back
what the rules say (stake + winnings for a winner). Every change of a credit and of the table's state happens in ONE sqlite
transaction.

The rules are the game's own files, run by a node worker (tables_worker.js) that keeps no state: the Bank sends the table's
state and gets the new one back. Outcomes: a round secret is drawn when betting opens and only its sha256 goes out (the seal);
the roll / pocket is HMAC-SHA256(secret, '<table>:<round>') through the rules; the secret is revealed with the result. The
twenty-one shoe is shuffled from its own secret (sealed when the shoe starts, revealed when it is done).

Words from the game (all carry s, a sitting of the sender's own):
  tbin / tbinx {s, n, tx|id}   deposit (as fein / feinx)          tbsit {s, p}    take spot p (1-6) at that table
  tbbet {s, q, r, k, n}         a bet (k = the rules' key; twenty-one: 'main')   tbtake {s, q, r, k}   tbclear {s, q, r}
  tbins {s, q, r, y}            twenty-one insurance (y 1/0)       tbact {s, q, r, a}   twenty-one: hit stand double split surrender
  tbout {s}                     cash out (or leave once the felt is clear)       tb? {s} | {tbl}
q: the sitting's own counter (each word once: asked again, the same answer). r: the round the word is for.
Answers: {t:'tb', to, s, st, credit, spot, q?, err?}; the table's state goes to the whole bank room: {t:'tbs', tbl, ...}."""
import os, sys, re, json, time, hmac as _hmac, hashlib as _hashlib, subprocess, threading, select, sqlite3

B = None   # the bank module (bind())
def bind(bank_module): global B; B = bank_module
def hook(bank_module):
    """[Claude 2026-10-21] for the playtest server and the tests: a bank.py without tables_hooks.patch (this checkout's own copy) gets the
    same two hooks in-process - bound here, and handle() sends the tables' words to handle_tb. A patched bank is left as it is.
    (The playtest relaunched after a crash ran on the unpatched copy: no table ever answered, so nobody could bet - 2026-10-21.)"""
    if getattr(bank_module, 'TB', None) is not None: return bank_module
    bind(bank_module); h0 = bank_module.handle
    def handle(c, addr, msg):
        if isinstance(msg, dict) and msg.get('t') in TB_TYPES: return handle_tb(c, addr, msg)
        return h0(c, addr, msg)
    bank_module.handle = handle; bank_module.TB = sys.modules[__name__]
    return bank_module

TABLES = {'cd1': 'dice', 'cw1': 'wheel', 'cb1': 'twentyone', 'cb2': 'twentyone'}   # all four upstairs in the clubhouse, in a row (2026-10-20)
SPOTS = 6
SPOTS_AT = {'cb1': 7, 'cb2': 7}   # 2026-10-20: seven spots at twenty-one, "just like a regular blackjack game"
CLOCK = {'dice': {'bet': 20, 'show': 7}, 'wheel': {'bet': 25, 'show': 10}, 'twentyone': {'bet': 5, 'ins': 10, 'turn': 20, 'show': 6}}
def bet_s(game, who):   # 2026-10-21: twenty-one's countdown to the cards is 5 s for one player, a second more for each other player
    return CLOCK[game]['bet'] + (max(0, len(who) - 1) if game == 'twentyone' else 0)
TB_S = re.compile(r'tb:(%s):[0-9a-f]{8,32}' % '|'.join(TABLES))
TB_IDLE, TB_UNPROVEN = 15, 86400   # [Claude 2026-10-22] the operator: "If you're disconnected from one of the tables you should have 15 seconds to reconnect" (was 120); the game says it is there every 5 s
FAST = set()   # sittings whose game says it is there every 5 s (tb? v:2, from 0.8.174): only they are held to TB_IDLE; an older game (every 20 s) keeps TB_OLD
TB_OLD = 120
SEEN = {}   # sitting -> when the Bank last heard it (in memory: a heartbeat every 5 s must not cost a commit, 0.5 s each on .25's disk); written to tb.last at most every 30 s
ROOM = {'up': time.time()}   # since when the Bank's room has been joined (bank.py room_up); None while it is down: silence then is the room's, not the player's
def room_up(ok):
    if ok and ROOM['up'] is None: ROOM['up'] = time.time()
    elif not ok: ROOM['up'] = None
DEAL_S = 0.55   # seconds between cards in the game's deal (twentyonetable.js DEAL.gap)
TB_TYPES = ('tbin', 'tbinx', 'tbback', 'tbsit', 'tbbet', 'tbtake', 'tbclear', 'tbins', 'tbact', 'tbout', 'tb?')

# ---------- the rules worker
class Worker:
    def __init__(self): self.p = None; self.lock = threading.Lock(); self.n = 0
    def _start(self):
        here = os.path.dirname(os.path.abspath(__file__))
        self.p = subprocess.Popen(['node', os.path.join(here, 'tables_worker.js')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
    def call(self, game, op, **kw):
        with self.lock:
            for attempt in (1, 2):
                try:
                    if not self.p or self.p.poll() is not None: self._start()
                    self.n += 1; q = dict(kw, id=self.n, game=game, op=op)
                    self.p.stdin.write(json.dumps(q) + '\n'); self.p.stdin.flush()
                    r, _, _ = select.select([self.p.stdout], [], [], 10)
                    if not r: raise RuntimeError('the rules worker did not answer')
                    a = json.loads(self.p.stdout.readline())
                    if a.get('id') != self.n: raise RuntimeError('the rules worker answered out of turn')
                    return a
                except Exception as e:
                    try: self.p.kill()
                    except Exception: pass
                    self.p = None
                    if attempt == 2: raise
WORKER = Worker()
def rules(game, op, **kw):
    a = WORKER.call(game, op, **kw)
    if not a.get('ok'): raise RuleError(a.get('err') or 'refused')
    return a
class RuleError(Exception): pass

# ---------- the database
def tb_db(c):
    c.execute("""create table if not exists tb(s text primary key, addr text, tbl text, st text default 'open', credit integer default 0, cin integer default 0,
        spot integer, q integer default 0, res text, leaving integer default 0, played real, last real, at real, bet integer default 0, won integer default 0, paid integer, paid_at real, note text)""")
    c.execute('create table if not exists tbdep(id text primary key, s text, addr text, n integer, tx text unique, ok integer default 0, void integer default 0, at real)')
    c.execute("""create table if not exists tbt(tbl text primary key, game text, round integer default 0, phase text default 'idle', until real default 0,
        state text, sec text, shoe text, shoe_n integer default 0, seq integer default 0)""")
    c.execute('create table if not exists tbres(tbl text, round integer, res text, at real, primary key(tbl, round))')
def sitting(c, s): return c.execute('select * from tb where s=?', (s,)).fetchone()
def table_row(c, tbl):
    r = c.execute('select * from tbt where tbl=?', (tbl,)).fetchone()
    if not r:
        c.execute('insert into tbt(tbl, game, state) values(?,?,?)', (tbl, TABLES[tbl], json.dumps(new_state(TABLES[tbl])))); c.commit()
        r = c.execute('select * from tbt where tbl=?', (tbl,)).fetchone()
    return r
def new_state(game):
    if game == 'dice': return {'point': 0, 'seats': {}, 'shooter': 0, 'last': None, 'hist': []}
    if game == 'wheel': return {'bets': {}, 'last': None, 'hist': []}
    return {'bets': {}, 'R': None, 'shoe': None, 'pos': 0, 'cut': 0, 'last': None}
def sec_hash(sec): return _hashlib.sha256(sec.encode()).hexdigest()
def hmac_hex(sec, msg, blocks=1):
    return ''.join(_hmac.new(sec.encode(), ('%s:%d' % (msg, k) if blocks > 1 else msg).encode(), _hashlib.sha256).hexdigest() for k in range(blocks))

# ---------- what one sitting has on the felt
def felt_of(game, st, s):
    if game == 'dice':
        seat = st['seats'].get(s)
        return 0 if not seat else sum(seat['bets'].values()) + sum(c['amt'] + (c.get('odds') or 0) for c in seat['come']) + sum(c['amt'] for c in seat['dcome'])
    if game == 'wheel': return sum((st['bets'].get(s) or {}).values())
    n = st['bets'].get(s) or 0
    R = st.get('R')
    if R and s in R['spots'] and not R.get('settled'): n += sum(h['bet'] for h in R['spots'][s]['hands']) + (R['spots'][s].get('ins') or 0)
    return n

# ---------- the words for one player, and the table for the room
def sit_state(r, addr, **x):
    d = {'t': 'tb', 'to': addr, 's': r['s'], 'st': r['st'], 'credit': int(r['credit']), 'spot': r['spot'], 'q': int(r['q'])}
    if r['paid'] is not None: d['paid'] = int(r['paid'])
    d.update(x); return d
ROOM_MAX = 500   # the room carries at most 512 bytes a message (a little kept spare)
def _n(o): return len(json.dumps(o, separators=(',', ':')))
def pieces(d):
    """[Claude 2026-10-22] the table's word in the room's 512 bytes (the operator: "Bets aren't showing up on the roulette table" - every table word over
    512 bytes was refused by the room since the clock first ran, so no game heard the felt): small enough, it goes whole as before (every game
    version reads it); else a short 'tbs' (pc: how many pieces follow) and one 'tbp' a sitting - its seat, felt, result lines and pay, and its
    twenty-one hand - which the game (0.8.175) puts back together. A piece still too big loses its lines, then is left out (logged)."""
    if _n(d) <= ROOM_MAX: return [d]
    base = {k: v for k, v in d.items() if k not in ('seats', 'felt')}
    seats = d.get('seats') or {}; felt = d.get('felt') or {}; last = d.get('last'); hand = d.get('hand')
    by_s = {}
    for p, x in seats.items(): by_s.setdefault(x['s'], {})['p'] = p; by_s[x['s']]['seat'] = x
    for s_ in felt: by_s.setdefault(s_, {})
    if last:
        for k in ('lines', 'pay'):
            for s_ in (last.get(k) or {}): by_s.setdefault(s_, {})
        base['last'] = {k: v for k, v in last.items() if k not in ('lines', 'pay')}
    if hand:
        for s_ in (hand.get('spots') or {}): by_s.setdefault(s_, {})
        base['hand'] = {k: v for k, v in hand.items() if k != 'spots'}
    out = []
    for s_, x in by_s.items():
        q = {'t': 'tbp', 'tbl': d['tbl'], 'seq': d.get('seq'), 'r': d.get('r'), 's': s_}
        if 'p' in x: q['p'] = x['p']; q['seat'] = x['seat']
        if s_ in felt: q['felt'] = felt[s_]
        if hand and s_ in (hand.get('spots') or {}): q['hand'] = hand['spots'][s_]
        if last and s_ in (last.get('pay') or {}): q['pay'] = last['pay'][s_]
        if last and s_ in (last.get('lines') or {}): q['lines'] = last['lines'][s_]
        if _n(q) > ROOM_MAX: q.pop('lines', None)
        if _n(q) > ROOM_MAX: B.log('TB PIECE TOO BIG', d['tbl'], s_, _n(q)); continue
        out.append(q)
    base['pc'] = len(out)
    if _n(base) > ROOM_MAX:
        for k in ('hist', 'h', 'shoe_h'): base.pop(k, None)
        if _n(base) > ROOM_MAX and base.get('last'): base['last'] = {k: v for k, v in base['last'].items() if k != 'sec'}
    if _n(base) > ROOM_MAX: B.log('TB WORD TOO BIG', d['tbl'], _n(base)); return []
    return [base] + out
def public(c, tbl, extra=None):
    T = table_row(c, tbl); st = json.loads(T['state']); game = T['game']
    seats = {}
    for r in c.execute("select s, addr, spot, credit from tb where tbl=? and spot is not null and st in ('open','closing')", (tbl,)).fetchall():
        seats[str(r['spot'])] = {'s': r['s'], 'a': r['addr'], 'felt': felt_of(game, st, r['s']), 'credit': int(r['credit'])}
    d = {'t': 'tbs', 'tbl': tbl, 'game': game, 'r': int(T['round']), 'ph': T['phase'], 'left': max(0, round((T['until'] - time.time()) * 1000)), 'seats': seats, 'seq': int(T['seq'])}
    if T['phase'] == 'bet' and T['sec']: d['h'] = sec_hash(T['sec'])
    if game == 'dice': d.update(point=st['point'], felt={s: st['seats'][s] for s in st['seats']}, last=st.get('last'), hist=st.get('hist', [])[:10])
    elif game == 'wheel': d.update(felt=st['bets'], last=st.get('last'), hist=st.get('hist', [])[:12])
    else:
        R = st.get('R'); d.update(felt=st['bets'], last=st.get('last'), shoe_h=sec_hash(T['shoe']) if T['shoe'] else None, left_cards=(len(st['shoe']) - st['pos']) if st.get('shoe') else None)
        if R:
            dealer = R['dealer'] if R['phase'] in ('dealer', 'done') else R['dealer'][:1] + (['??'] if len(R['dealer']) > 1 else [])   # the hole card stays down until the dealer plays
            d['hand'] = {'ph': R['phase'], 'dealer': dealer, 'turn': R.get('turn'), 'spots': {s: {'hands': [{'cards': h['cards'], 'bet': h['bet'], 'done': h['done'], 'res': h.get('res'), 'split': h['split'], 'aces': h['aces'], 'doubled': h['doubled'], 'surr': h['surr']} for h in v['hands']], 'cur': v['cur'], 'ins': v['ins']} for s, v in R['spots'].items()}}
    if extra: d.update(extra)
    return d
def announce(c, tbl, extra=None):
    c.execute('update tbt set seq=seq+1 where tbl=?', (tbl,)); c.commit()
    B.OUTQ.extend(pieces(public(c, tbl, extra)))

# ---------- deposits (as fein / feinx: credit at once; a sitting goes home only once the chain shows all of them)
def tb_proven(c, s):
    oldest = None
    for d in c.execute('select * from tbdep where s=? and ok=0 and void=0', (s,)).fetchall():
        ok = False
        if d['tx']:
            try:
                L = sqlite3.connect('file:%s?mode=ro' % B.PK_LEDGER, uri=True, timeout=10)
                x = L.execute('select sender, reference, payload_hex, valid from arcade_tx where txid=?', (d['tx'],)).fetchone(); L.close()
                p = (x[2] or '') if x else ''
                ok = bool(x and x[3] and x[0] == d['addr'] and x[1] == B.ASHVALE and len(p) == 32 and int(p[0:8], 16) == 0 and int(p[8:16], 16) == 26 and int(p[16:32], 16) == int(d['n']))
                if not x and B.pool_proves(d['tx'], d['addr'], d['n'], 'TB'): continue
            except Exception as e: B.log('TB LEDGER READ FAILED', str(e)[:120])
        if ok: c.execute('update tbdep set ok=1 where id=? and s=?', (d['id'], s)); c.commit()
        else: oldest = min(oldest or d['at'], d['at'])
    return oldest is None, oldest
def tb_pay(c):
    """sittings cashed out whose deposits the chain shows: the credit goes home as GOLD"""
    now = time.time()
    for r in c.execute("select * from tb where st='closing'").fetchall():
        T = table_row(c, r['tbl'])
        if felt_of(T['game'], json.loads(T['state']), r['s']): continue   # bets still working: home once they are settled
        n = int(r['credit'])
        if n > 0:
            ok, oldest = tb_proven(c, r['s'])
            if not ok:
                if now - oldest > TB_UNPROVEN:
                    c.execute("update tb set st='held', note=?, spot=null where s=? and st='closing'", ('a deposit the chain never showed', r['s'])); c.commit(); B.log('TB HELD', r['addr'], r['s'], n, 'a deposit never on the chain')
                continue
        if not c.execute("update tb set st='paid', credit=0, spot=null, paid=coalesce(paid,0)+?, paid_at=? where s=? and st='closing' and credit=?", (n, now, r['s'], n)).rowcount: c.commit(); continue
        left = n
        while left > 0:
            u = min(left, B.BATCH_CAP); left -= u
            c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,'token','queued',?,?)", (r['addr'], 'coins', u, now, 'tb:' + r['s']))
        c.commit(); B.log('TB PAYS', r['addr'], r['s'], n, '(in %d, bet %d, won %d)' % (r['cin'], r['bet'], r['won']))
        B.OUTQ.append(sit_state(sitting(c, r['s']), r['addr']))
def deposit(c, addr, msg, r, s, t):
    now = time.time(); tx, did = str(msg.get('tx') or ''), str(msg.get('id') or '')
    if tx and not re.fullmatch(r'[0-9a-f]{64}', tx): return None
    if did and not re.fullmatch(r'[0-9a-z]{4,24}', did): return None
    did = did or tx[:24]
    if not did: return None
    d = c.execute('select * from tbdep where id=? and s=?', (did, s)).fetchone()
    if t == 'tbinx':   # the send failed: the GOLD is back in the pack, so this deposit never happened
        if d and not d['tx'] and not d['void'] and r:
            c.execute('update tbdep set void=1 where id=? and s=?', (did, s))
            if (r['played'] and r['played'] >= d['at']) or int(r['credit']) < int(d['n']):   # played on it: nothing of this sitting goes home without a human
                c.execute("update tb set st='held', note=? where s=?", ('deposit %s voided after it was played on' % did, s)); c.commit(); B.log('TB HELD', addr, s, 'deposit', did, d['n'], 'voided after play')
            else:
                c.execute('update tb set credit=credit-?, cin=cin-? where s=?', (d['n'], d['n'], s)); c.commit(); B.log('TB IN VOID', addr, s, d['n'], did)
            r = sitting(c, s)
        return sit_state(r, addr, id=did) if r else None
    try: n = int(msg.get('n'))
    except (TypeError, ValueError): return None
    if not (0 < n <= 10**7): return None
    if tx and c.execute('select 1 from tbdep where tx=? and id<>?', (tx, did)).fetchone(): return sit_state(r, addr, id=did, tx=tx) if r else None
    if d:
        if tx and not d['tx'] and not d['void'] and int(d['n']) == n: c.execute('update tbdep set tx=? where id=? and s=?', (tx, did, s)); c.commit(); B.log('TB IN SENT', addr, s, n, tx)
        return sit_state(r, addr, id=did, tx=tx or None)
    if not r: c.execute('insert into tb(s, addr, tbl, last, at) values(?,?,?,?,?)', (s, addr, s.split(':')[1], now, now))
    c.execute('insert into tbdep(id, s, addr, n, tx, at) values(?,?,?,?,?,?)', (did, s, addr, n, tx or None, now))
    c.execute("update tb set credit=credit+?, cin=cin+?, last=?, st=case when st='paid' then 'closing' else st end where s=?", (n, n, now, s)); c.commit()
    B.log('TB IN', addr, s, n, tx or '(send to follow)', did)
    r = sitting(c, s)
    if r['st'] != 'open': tb_pay(c); r = sitting(c, s)
    return sit_state(r, addr, id=did, tx=tx or None)

# ---------- one word from a player
LOCK = threading.RLock()   # [Claude 2026-10-22] the players' words and the clock thread take turns (Bank.tables_clock): a bet can never cross a roll or a deal
def handle_tb(c, addr, msg):
    with LOCK:
        try: return _handle_tb(c, addr, msg)
        except Exception: c.rollback(); raise   # never leave a half-done write open on the room's connection (the clock thread writes too)
def _handle_tb(c, addr, msg):
    tb_db(c); t = msg.get('t'); now = time.time()
    if t == 'tb?' and msg.get('tbl') in TABLES and not msg.get('s'): return pieces(public(c, msg['tbl']))
    s = str(msg.get('s') or '')
    if not TB_S.fullmatch(s): return None
    r = sitting(c, s)
    if r and r['addr'] != addr: B.log('TB NOT YOURS', addr, s, 'is', r['addr']); return None
    if t in ('tbin', 'tbinx'): return deposit(c, addr, msg, r, s, t)
    if t == 'tbback': return tb_back(c, addr, msg, r, s, now)
    if not r: return {'t': 'tb', 'to': addr, 's': s, 'st': 'none', 'credit': 0, 'spot': None, 'q': 0}
    SEEN[s] = now
    if (msg.get('v') or 1) >= 2: FAST.add(s)
    if now - (r['last'] or 0) > 30: c.execute('update tb set last=? where s=?', (now, s)); c.commit()
    tbl = r['tbl']; T = table_row(c, tbl); game = T['game']
    if t == 'tb?': return [sit_state(r, addr)] + pieces(public(c, tbl))
    if t == 'tbout':
        out = tb_leave(c, s); return sit_state(sitting(c, s), addr, **({'note': out} if out else {}))
    if t == 'tbsit':
        try: p = int(msg.get('p'))
        except (TypeError, ValueError): return None
        if r['st'] != 'open' or not (1 <= p <= SPOTS_AT.get(tbl, SPOTS)): return sit_state(r, addr, err='spot')
        if r['spot'] == p: return sit_state(r, addr)
        if r['spot'] is not None: return sit_state(r, addr, err='seated')
        if c.execute("select 1 from tb where tbl=? and spot=? and st in ('open','closing')", (tbl, p)).fetchone(): return sit_state(r, addr, err='taken')
        c.execute('update tb set spot=? where s=?', (p, s)); c.commit(); B.log('TB SIT', addr, s, 'spot', p)
        announce(c, tbl); return sit_state(sitting(c, s), addr)
    # the rest change the felt: once each, in order
    try: q = int(msg.get('q'))
    except (TypeError, ValueError): return None
    if q == r['q'] and r['res']: return json.loads(r['res'])
    if q != r['q'] + 1: return sit_state(r, addr, err='order')
    def done(rep, changed):
        c.execute('update tb set q=?, res=? where s=?', (q, json.dumps(rep), s)); c.commit()
        if changed: announce(c, tbl)
        return rep
    if r['st'] != 'open' or r['spot'] is None: return done(sit_state(r, addr, q=q, err='closed' if r['st'] != 'open' else 'spot'), False)
    try: rr = int(msg.get('r'))
    except (TypeError, ValueError): return None
    if rr != int(T['round']): return done(sit_state(r, addr, q=q, err='round'), False)
    st = json.loads(T['state']); credit = int(r['credit'])
    try:
        if t in ('tbbet', 'tbtake', 'tbclear'):
            if T['phase'] != 'bet': return done(sit_state(r, addr, q=q, err='closed for bets'), False)
            k = str(msg.get('k') or '')[:24]
            if t == 'tbbet':
                try: n = int(msg.get('n'))
                except (TypeError, ValueError): return None
                if game == 'dice':
                    a = rules('dice', 'bet', seat=st['seats'].get(s) or {'bets': {}, 'come': [], 'dcome': []}, point=st['point'], key=k, n=n, credit=credit); st['seats'][s] = a['seat']
                elif game == 'wheel':
                    a = rules('wheel', 'bet', bets=st['bets'].get(s) or {}, key=k, n=n, credit=credit); st['bets'][s] = a['bets']
                else:
                    have = st['bets'].get(s) or 0
                    if k != 'main' or have + n > 500 or n > credit: raise RuleError('Not enough credit for that bet.' if n > credit else 'The table limit is 500 GOLD.')
                    rules('twentyone', 'legalBet', n=have + n, credit=credit + have); st['bets'][s] = have + n; a = {'cost': n}
                cost = int(a['cost'])
                if cost <= 0 or cost > credit: raise RuleError('Not enough credit for that bet.')
                c.execute('update tbt set state=? where tbl=?', (json.dumps(st), tbl))
                c.execute('update tb set credit=credit-?, bet=bet+?, played=? where s=? and credit>=?', (cost, cost, now, s, cost))
                return done(sit_state(sitting(c, s), addr, q=q), True)
            # take one / clear
            if game == 'dice':
                seat = st['seats'].get(s)
                a = rules('dice', 'take' if t == 'tbtake' else 'clear', seat=seat, point=st['point'], key=k) if seat else {'back': 0, 'seat': None}
                if seat: st['seats'][s] = a['seat']
            elif game == 'wheel':
                a = rules('wheel', 'take' if t == 'tbtake' else 'clear', bets=st['bets'].get(s) or {}, key=k); st['bets'][s] = a['bets']
            else:
                a = {'back': st['bets'].pop(s, 0)}
            back = int(a['back'])
            c.execute('update tbt set state=? where tbl=?', (json.dumps(st), tbl))
            c.execute('update tb set credit=credit+?, bet=bet-? where s=?', (back, back, s))
            return done(sit_state(sitting(c, s), addr, q=q), back > 0)
        if game != 'twentyone' or t not in ('tbins', 'tbact'): return None
        R = st.get('R')
        if not R or s not in R['spots']: return done(sit_state(r, addr, q=q, err='not in this hand'), False)
        if t == 'tbins':
            if R['phase'] != 'insurance': return done(sit_state(r, addr, q=q, err='not now'), False)
            yes = bool(msg.get('y')) and credit >= R['spots'][s]['bet'] // 2
            a = rules('twentyone', 'insure', R=R, sn=s, yes=yes); st['R'] = a['R']; cost = int(a['cost'])
            c.execute('update tbt set state=? where tbl=?', (json.dumps(st), tbl))
            if cost: c.execute('update tb set credit=credit-?, bet=bet+?, played=? where s=? and credit>=?', (cost, cost, now, s, cost))
            rep = done(sit_state(sitting(c, s), addr, q=q), True); tb_step(c, tbl); return rep
        a_ = str(msg.get('a') or '')
        if R['phase'] != 'play' or R.get('turn') != s: return done(sit_state(r, addr, q=q, err='not your turn'), False)
        a = rules('twentyone', 'act', R=R, sn=s, a=a_, shoe=st['shoe'], pos=st['pos'], credit=credit)
        cost = int(a['cost'] or 0)
        if cost > credit: raise RuleError('Not enough credit.')
        st['R'], st['pos'] = a['R'], a['pos']
        c.execute('update tbt set state=?, until=? where tbl=?', (json.dumps(st), now + CLOCK['twentyone']['turn'], tbl))
        if cost: c.execute('update tb set credit=credit-?, bet=bet+?, played=? where s=? and credit>=?', (cost, cost, now, s, cost))
        rep = done(sit_state(sitting(c, s), addr, q=q), True); tb_step(c, tbl); return rep
    except RuleError as e:
        c.rollback(); return done(sit_state(sitting(c, s), addr, q=q, err=str(e)[:160]), False)

def tb_back(c, addr, msg, r, s, now):
    """[Claude 2026-10-22] coming back to a table (the operator: "If you leave the table with a bet on the table and you come back to the table that
    needs to be yours"; "If you're disconnected from one of the tables you should have 15 seconds to reconnect"). The game sends its new
    sitting s and the table; the Bank looks for this address's own sittings there:
    - one still OPEN (back within TB_IDLE, a reload): that one is yours again as it was - the answer names it ('for': s) and the game takes it up;
    - else one CLOSING with bets still working: those bets move into s with their stake (the old sitting: cin and bet both less the felt, its
      credit untouched and going home as the game already booked it; s: cin = bet = the felt), so every sitting's books still hold. Only
      when the old sitting's deposits are all proven (a felt moved out must never outrun its deposit). A twenty-one hand being played
      out stays where it is (it settles and goes home).
    Anything else: s is simply new (st none)."""
    tbl = str(msg.get('tbl') or '')
    if tbl not in TABLES: return None
    if r: return sit_state(r, addr)   # told twice
    try: p = int(msg.get('p'))
    except (TypeError, ValueError): p = None
    o = c.execute("select * from tb where addr=? and tbl=? and st='open' order by last desc limit 1", (addr, tbl)).fetchone()
    if o:
        SEEN[o['s']] = now; FAST.add(o['s']); c.execute('update tb set last=? where s=?', (now, o['s'])); c.commit()
        B.log('TB BACK', addr, o['s'], 'open again, spot', o['spot'])
        return sit_state(o, addr, **{'for': s})
    T = table_row(c, tbl); game = T['game']; st = json.loads(T['state'])
    for o in c.execute("select * from tb where addr=? and tbl=? and st='closing' order by last desc", (addr, tbl)).fetchall():
        F = felt_of(game, st, o['s'])
        if F <= 0: continue
        if game == 'twentyone': return {'t': 'tb', 'to': addr, 's': s, 'st': 'none', 'credit': 0, 'spot': None, 'q': 0, 'note': 'Your hand is being played out; what it makes comes home when it is over.'}
        ok, _ = tb_proven(c, o['s'])
        if not ok: return {'t': 'tb', 'to': addr, 's': s, 'st': 'none', 'credit': 0, 'spot': None, 'q': 0, 'note': 'Your last GOLD is still on its way to the Bank; your bets come back to you in a moment.'}
        if game == 'dice': st['seats'][s] = st['seats'].pop(o['s'])
        else: st['bets'][s] = st['bets'].pop(o['s'])
        c.execute('update tbt set state=? where tbl=?', (json.dumps(st), tbl))
        c.execute('update tb set cin=cin-?, bet=bet-?, spot=null where s=?', (F, F, o['s']))
        c.execute('insert into tb(s, addr, tbl, st, credit, cin, spot, q, last, at, bet, won) values(?,?,?,?,?,?,?,?,?,?,?,?)', (s, addr, tbl, 'open', 0, F, o['spot'], 0, now, now, F, 0))
        c.commit(); SEEN[s] = now; FAST.add(s)
        B.log('TB BACK', addr, s, 'bets still working', F, 'from', o['s'], 'spot', o['spot'])
        announce(c, tbl); tb_pay(c)
        return sit_state(sitting(c, s), addr, note='Your bets still working are yours again.')
    return {'t': 'tb', 'to': addr, 's': s, 'st': 'none', 'credit': 0, 'spot': None, 'q': 0}
def tb_leave(c, s):
    """cash out: what may come down comes back, the spot is freed once nothing is left working, then the credit goes home"""
    r = sitting(c, s)
    if not r or r['st'] != 'open': tb_pay(c); return None
    T = table_row(c, r['tbl']); st = json.loads(T['state']); game = T['game']; back = 0
    if T['phase'] == 'bet':
        try:
            if game == 'dice' and st['seats'].get(s): a = rules('dice', 'clear', seat=st['seats'][s], point=st['point']); st['seats'][s] = a['seat']; back = int(a['back'])
            elif game == 'wheel' and st['bets'].get(s): back = sum(st['bets'].pop(s).values())
            elif game == 'twentyone' and st['bets'].get(s): back = st['bets'].pop(s)
        except RuleError: back = 0
    c.execute('update tbt set state=? where tbl=?', (json.dumps(st), r['tbl']))
    c.execute("update tb set credit=credit+?, bet=bet-?, st='closing', leaving=1 where s=? and st='open'", (back, back, s)); c.commit()
    B.log('TB OUT', r['addr'], s, int(r['credit']) + back, 'still working' if felt_of(game, st, s) else '')
    announce(c, r['tbl']); tb_pay(c)
    return 'Your bets still working are settled first.' if felt_of(game, st, s) else None

# ---------- the clock: every table moves on by itself
def tb_tick(c):
    with LOCK: return _tb_tick(c)
def _tb_tick(c):
    tb_db(c); now = time.time()
    up = ROOM['up']
    if up is not None:   # gone quiet: nothing heard for TB_IDLE while the room was up - out as if they had left (bets in play settle, then the credit goes home)
        for r in c.execute("select s, last from tb where st='open'").fetchall():
            if now - max(r['last'] or 0, SEEN.get(r['s'], 0), up) > (TB_IDLE if r['s'] in FAST else max(TB_IDLE, TB_OLD)): B.log('TB GONE QUIET', r['s']); SEEN.pop(r['s'], None); FAST.discard(r['s']); tb_leave(c, r['s'])
    for tbl in TABLES:
        try: tb_step(c, tbl)
        except Exception as e: c.rollback(); B.log('TB STEP ERROR', tbl, repr(e)[:200])
    tb_pay(c)
def seated(c, tbl):
    return [(x['s'], x['spot']) for x in c.execute("select s, spot from tb where tbl=? and spot is not null and st in ('open','closing') order by spot", (tbl,)).fetchall()]
def credits(c, pays, why):
    for s, n in pays.items():
        n = int(n)
        if n: c.execute('update tb set credit=credit+?, won=won+? where s=?', (n, n, s))
def tb_step(c, tbl):
    T = table_row(c, tbl); game, ph, now = T['game'], T['phase'], time.time()
    st = json.loads(T['state']); who = seated(c, tbl); K = CLOCK[game]
    felt_any = any(felt_of(game, st, s) for s, _ in who) or (game == 'dice' and any(felt_of(game, st, s) for s in st['seats']))
    def go(phase, until, state=None, extra=None, **cols):
        sets = ['phase=?', 'until=?'] + ['%s=?' % k for k in cols]; vals = [phase, until] + list(cols.values())
        if state is not None: sets.append('state=?'); vals.append(json.dumps(state))
        c.execute('update tbt set %s where tbl=?' % ', '.join(sets), vals + [tbl]); announce(c, tbl, extra)
    if ph in ('idle', 'show'):
        if ph == 'show' and now < T['until']: return
        if not who and not felt_any:
            if ph != 'idle': go('idle', 0)
            return
        if game == 'twentyone': st['R'] = None; st['bets'] = {}
        if game == 'wheel': st['bets'] = {}
        if game == 'dice':   # someone who has left: their bets that may come down come back (only line and come bets keep working)
            for x in c.execute("select s from tb where tbl=? and st='closing'", (tbl,)).fetchall():
                if st['seats'].get(x['s']):
                    a = rules('dice', 'clear', seat=st['seats'][x['s']], point=st['point']); st['seats'][x['s']] = a['seat']
                    if a['back']: c.execute('update tb set credit=credit+?, bet=bet-? where s=?', (a['back'], a['back'], x['s']))
        go('bet', now + bet_s(game, who), st, round=int(T['round']) + 1, sec=os.urandom(32).hex()); return
    if ph == 'bet':
        if now < T['until']: return
        if not felt_any:
            if not who: go('idle', 0)
            else: c.execute('update tbt set until=? where tbl=?', (now + bet_s(game, who), tbl)); c.commit()   # nobody bet: betting stays open
            return
        res_key = '%s:%d' % (tbl, int(T['round']))
        if game == 'dice':
            a = rules('dice', 'roll', point=st['point'], seats=st['seats'], bytes=hmac_hex(T['sec'], res_key))
            credits(c, a['pay'], 'roll'); st['point'], st['seats'] = a['point'], a['seats']
            for s in [s for s in st['seats'] if not felt_of('dice', st, s)]: del st['seats'][s]
            st['last'] = {'dice': a['dice'], 'call': a['call'], 'lines': a['lines'], 'pay': a['pay'], 'sec': T['sec'], 'r': int(T['round'])}
            st['hist'] = ([sum(a['dice'])] + st.get('hist', []))[:20]
        elif game == 'wheel':
            a = rules('wheel', 'spin', seats=st['bets'], bytes=hmac_hex(T['sec'], res_key))
            credits(c, a['pay'], 'spin'); st['last'] = {'n': a['n'], 'colour': a['colour'], 'lines': a['lines'], 'pay': a['pay'], 'sec': T['sec'], 'r': int(T['round'])}
            st['hist'] = ([a['n']] + st.get('hist', []))[:20]; st['bets'] = {}
        else:
            shoe_sec, shoe_n = T['shoe'], int(T['shoe_n'])
            if not st.get('shoe') or st['pos'] >= st['cut']:
                old = shoe_sec; shoe_sec, shoe_n = os.urandom(32).hex(), shoe_n + 1
                a = rules('twentyone', 'shoe', bytes=hmac_hex(shoe_sec, '%s:shoe:%d' % (tbl, shoe_n), blocks=48))
                st['shoe'], st['pos'], st['cut'] = a['shoe'], 0, a['cut']
                if old: st['shoe_was'] = old   # the last shoe's secret, revealed
                c.execute('update tbt set shoe=?, shoe_n=? where tbl=?', (shoe_sec, shoe_n, tbl))
            spots = [[s, st['bets'][s]] for s, _ in who if st['bets'].get(s)]
            a = rules('twentyone', 'deal', spots=spots, shoe=st['shoe'], pos=st['pos'])
            st['R'], st['pos'] = a['R'], a['pos']; st['bets'] = {}
            c.execute('update tbt set state=? where tbl=?', (json.dumps(st), tbl)); c.commit()
            return tb_hand(c, tbl)
        c.execute('insert or replace into tbres values(?,?,?,?)', (tbl, int(T['round']), json.dumps(st['last']), now))
        go('show', now + K['show'], st); return
    if game == 'twentyone' and ph in ('insurance', 'play', 'dealer'): return tb_hand(c, tbl)
def tb_hand(c, tbl):
    """twenty-one after the deal: insurance (all at once), the spots in turn (the clock stands a spot that does not answer), the dealer, the pay"""
    T = table_row(c, tbl); st = json.loads(T['state']); R = st['R']; now = time.time(); K = CLOCK['twentyone']
    def save(phase, until):
        c.execute('update tbt set state=?, phase=?, until=? where tbl=?', (json.dumps(st), phase, until, tbl)); announce(c, tbl)
    # the game deals one card every DEAL_S (2026-10-21: "slow down the dealing animation"): the first clock after the deal waits for it
    if T['phase'] == 'bet': now += DEAL_S * (len(R['dealer']) + sum(len(h['cards']) for v in R['spots'].values() for h in v['hands']))
    for _ in range(64):
        ph = R['phase']
        if ph == 'insurance':
            if T['phase'] != 'insurance': return save('insurance', now + K['ins'])
            if now < T['until'] and not all(R['spots'][s]['ins'] is not None for s in R['order']): return
            R = st['R'] = rules('twentyone', 'insuranceDone', R=R)['R']; T = dict(T); T['phase'] = R['phase']
            if R['phase'] == 'play': return save('play', now + K['turn'])
            continue
        if ph == 'play':
            if T['phase'] != 'play': return save('play', now + K['turn'])
            if now < T['until']: return
            s = R['turn']; cr = int(sitting(c, s)['credit'])
            a = rules('twentyone', 'act', R=R, sn=s, a='stand', shoe=st['shoe'], pos=st['pos'], credit=cr)
            R = st['R'] = a['R']; st['pos'] = a['pos']; B.log('TB CLOCK STANDS', tbl, s)
            if R['phase'] == 'play': return save('play', now + K['turn'])
            continue
        if ph == 'dealer':
            a = rules('twentyone', 'dealer', R=R, shoe=st['shoe'], pos=st['pos']); R = st['R'] = a['R']; st['pos'] = a['pos']; continue
        if ph == 'done':
            a = rules('twentyone', 'settle', R=R); st['R'] = a['R']
            credits(c, a['pay'], 'hand')
            st['last'] = {'dealer': R['dealer'], 'total': a.get('dealer'), 'bj': a.get('dealerBJ'), 'lines': a['lines'], 'pay': a['pay'], 'r': int(T['round'])}
            c.execute('insert or replace into tbres values(?,?,?,?)', (tbl, int(T['round']), json.dumps(st['last']), now))
            return save('show', now + K['show'] + DEAL_S * max(0, len(R['dealer']) - 2))   # the dealer's draws are seen before the next bets
        return
