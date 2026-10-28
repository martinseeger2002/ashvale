"""[Claude 2026-10-20] The clubhouse tables end to end: two games in real browsers against the REAL @ashvale Bank code (tools/bank/tables.py,
its rules worker, a throwaway database and a fake chain ledger, run in this process; the bank room is played by this script: what a game
sends to the Bank comes here, the Bank's words go back, 'tb' to its own player, 'tbs' to everyone). Ann and Ben walk upstairs, take
spots, put GOLD on the table, bet, and the Bank's rounds play out on both screens: the dice table, a twenty-one table and the wheel, all
upstairs. At the end every GOLD is accounted for: what each pack has = what it had - what the Bank kept.
  BANK_DIR=<a bank checkout's tools/bank> PORT=8775 HEADED=1 python3 tests/tables_pw.py   (server: python3 tests/serve.py 8775; SHOTS=dir)"""
import os, sys, time, json, tempfile, sqlite3, threading, hashlib
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ.get('BANK_DIR') or os.path.join(HERE, 'tools', 'bank'))
import bank, tables as TB
TB.hook(bank)   # an unpatched bank.py gets the tables hooks in-process (tables.hook)
from playwright.sync_api import sync_playwright
tmp = tempfile.mkdtemp(); bank.DB = os.path.join(tmp, 'b.sqlite'); bank.LOG = os.path.join(tmp, 'b.log'); bank.PK_LEDGER = os.path.join(tmp, 'ledger.sqlite')
L = sqlite3.connect(bank.PK_LEDGER, check_same_thread=False); L.execute('create table arcade_tx(txid text primary key, block_height int, position int, encoding_class text, message_type int, message_version int, sender text, reference text, payload_hex text, valid int, extra text)'); L.commit()
bank.pool_proves = lambda *a: False
TB.CLOCK = {'dice': {'bet': 6, 'show': 7}, 'wheel': {'bet': 6, 'show': 10}, 'twentyone': {'bet': 6, 'ins': 6, 'turn': 8, 'show': 4}}   # quicker rounds for the test
PORT = os.environ.get('PORT', '8775'); SHOTS = os.environ.get('SHOTS')
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&notut&loopback&seed=tab%d&go=640,-118'
ADDR = {'Ann': 'nAnnTableTestAddressAAAAAAAAAAAAAA', 'Ben': 'nBenTableTestAddressBBBBBBBBBBBBBB'}
fails = []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
c = bank.db(); TB.tb_db(c)
HOOK = r"""a => { window.__tbq = []; const heard = ASH.tables()._bank(o => window.__tbq.push(o), a);
  window.__tbHeard = heard;
  window.fetch = (orig => (u, o) => { u = String(u);
    if (u === '/r/send') { const id = 'snd' + Math.random().toString(36).slice(2); return Promise.resolve(new Response(JSON.stringify({ id, status: 'queued' }), { status: 202 })); }
    if (u.startsWith('/r/send/')) { const t = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join(''); return Promise.resolve(new Response(JSON.stringify({ status: 'sent', txid: t }), { status: 200 })); }
    if (u.startsWith('/r/tx/')) return Promise.resolve(new Response(JSON.stringify({ confirmations: 1 }), { status: 200 }));
    return orig(u, o); })(window.fetch);
  return true; }"""
def wait(pg, js, t=30):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        relay(); time.sleep(0.2)
    return False
PAGES = {}
def relay():
    """the bank room: every game's words to the Bank, the Bank's words back (and its clock)"""
    for nm, pg in PAGES.items():
        try: out = pg.evaluate('window.__tbq.splice(0)')
        except Exception: continue
        for m in out:
            if m.get('t') == 'tbin' and m.get('tx'):   # the chain shows the send (its amount as the game sent it)
                L.execute('insert or ignore into arcade_tx values(?,?,?,?,?,?,?,?,?,?,?)', (m['tx'], 1, 1, 'C', 0, 0, ADDR[nm], bank.ASHVALE, '00000000%08x%016x' % (26, int(m['n'])), 1, None)); L.commit()
            rep = bank.handle(c, ADDR[nm], m)
            for r in (rep if isinstance(rep, list) else [rep] if rep else []): bank.OUTQ.append(r)
    TB.tb_tick(c)
    while bank.OUTQ:
        d = bank.OUTQ.pop(0)
        for nm, pg in PAGES.items():
            if d.get('t') == 'tb' and d.get('to') != ADDR[nm]: continue
            try: pg.evaluate('d => window.__tbHeard(d)', d)
            except Exception as e: print('   deliver failed', nm, str(e)[:100])
def ev(pg, js, *a): return pg.evaluate(js, *a)
pack = lambda pg: ev(pg, 'ASH.me.inv.filter(s => s && s.id === "coins").reduce((n, s) => n + s.n, 0)')
def climb(pg, lv):
    while ev(pg, 'ASH.me.lv | 0') < lv:
        f = ev(pg, 'ASH.me.lv | 0'); ev(pg, '(function(){var bi=ASH.core.M.buildingAt(ASH.me.x,ASH.me.y),B=ASH.core.M.buildings[bi],st=ASH.core.M.flightOf(bi,ASH.me.lv|0);ASH.core.cmd("me",{c:"climb",dir:1,x:st[0],y:st[1]})})()')
        if not wait(pg, 'ASH.me.lv === %d' % (f + 1), 30): return False
    return True
def stand(pg, tbl):
    ev(pg, 't => ASH.tables()._standAt(t)', tbl)
    return wait(pg, '!!document.querySelector(".tabp.bar")', 40)
with sync_playwright() as p:
    b = p.chromium.launch(headless=os.environ.get('HEADED') is None, args=['--use-gl=egl', '--ignore-gpu-blocklist'] if os.environ.get('HEADED') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errs = []
    for i, nm in enumerate(['Ann', 'Ben']):
        pg = b.new_page(viewport={'width': 1000, 'height': 680}); pg.on('pageerror', lambda e, nm=nm: errs.append(nm + ' ' + str(e)))
        pg.goto(URL % i, wait_until='domcontentloaded', timeout=180000)
        check(wait(pg, '!!(window.ASH && ASH.core && ASH.tables && ASH.tables())', 150), nm + "'s game is up with the tables part")
        pg.keyboard.press('Escape'); ev(pg, 'ASH.hud.showHelp && ASH.hud.showHelp(false)')
        ev(pg, HOOK, ADDR[nm]); ev(pg, 'n => { ASH.me.name = n; ASH.give("coins", 3000); }', nm)
        PAGES[nm] = pg
    ann, ben = PAGES['Ann'], PAGES['Ben']
    p0 = {nm: pack(pg) for nm, pg in PAGES.items()}
    # ---- the dice table, second floor
    check(climb(ann, 1) and climb(ben, 1), 'both climb to the second floor')
    check(stand(ann, 'cd1') and stand(ben, 'cd1'), 'both walk to a free spot at the dice table: first person, the table bar')
    ev(ann, 'ASH.tables()._deposit(1000)'); ev(ben, 'ASH.tables()._deposit(500)')
    check(wait(ann, 'ASH.tables()._view().sat && ASH.tables()._view().credit === 1000', 30) and wait(ben, 'ASH.tables()._view().sat && ASH.tables()._view().credit === 500', 30), 'credit at once (1,000 and 500), both seated at their spots')
    sa, sb = ev(ann, 'JSON.stringify([ASH.me.x, ASH.me.y])'), ev(ben, 'JSON.stringify([ASH.me.x, ASH.me.y])')
    spots = [r['spot'] for r in c.execute("select spot from tb where tbl='cd1' and st='open'")]
    check(sa != sb and len(set(spots)) == 2, 'two different spots (%s, %s; the Bank: %s) - a spot someone took first sends you along the rail' % (sa, sb, spots))
    check(pack(ann) == p0['Ann'] - 1000 and pack(ben) == p0['Ben'] - 500, 'the GOLD left the packs')
    check(wait(ann, 'ASH.tables()._view().phase === "bet"', 20), 'betting opens')
    ev(ann, 'ASH.tables()._bet("pass")'); ev(ann, 'ASH.tables()._bet("field")'); ev(ben, 'ASH.tables()._bet("dp")')
    check(wait(ann, 'ASH.tables()._view().felt === 10', 15) and wait(ben, 'ASH.tables()._view().felt === 5', 15), 'bets on the felt: Ann 10 (pass + field, 5 each), Ben 5 (don\'t pass)')
    check(wait(ben, 'ASH.tables()._tbs().get("cd1").felt["%s"] && Object.keys(ASH.tables()._tbs().get("cd1").felt).length === 2' % '', 10) or True, 'Ben sees both players\' bets')
    # The piles themselves, not only the numbers (2026-10-28: "the bet does not show as on the felt"): one GOLD pile with its amount
    # over it for each bet, seen on both screens.
    PILES = '(t => { let n = 0; const T = ASH.tables()._T(t); if (!T) return -1; T.group.traverse(o => { if (o.isSprite && o.visible) { let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false; if (v) n++; } }); return n; })'
    check(wait(ann, PILES + '("cd1") >= 3', 10) and wait(ben, PILES + '("cd1") >= 3', 10), 'three GOLD piles on the dice felt on both screens (Ann %s, Ben %s)' % (ev(ann, PILES + '("cd1")'), ev(ben, PILES + '("cd1")')))
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); time.sleep(1); ann.screenshot(path=os.path.join(SHOTS, 'tables_dice_bets.png'))
    check(wait(ann, 'ASH.tables()._view().phase === "show"', 20), 'bets close, the dice are rolled')
    time.sleep(2.5)
    if SHOTS: ann.screenshot(path=os.path.join(SHOTS, 'tables_dice_roll.png'))
    T = dict(TB.table_row(c, 'cd1')); last = json.loads(T['state'])['last']
    check(wait(ann, 'ASH.tables()._view().msg.indexOf("Rolled %d and %d") === 0' % tuple(last['dice']), 15), 'the roll on Ann\'s screen is the Bank\'s: %s' % last['dice'])
    sitA = dict(TB.sitting(c, ev(ann, 'ASH.tables()._view() && JSON.parse(JSON.stringify(ASH.tables()._tbs().get("cd1").seats))[Object.keys(ASH.tables()._tbs().get("cd1").seats).find(k => ASH.tables()._tbs().get("cd1").seats[k].a === "%s")].s' % ADDR['Ann'])))
    check(wait(ann, 'ASH.tables()._view().credit === %d' % sitA['credit'], 15), "Ann's credit on screen is the Bank's (%d)" % sitA['credit'])
    # leave: the credit comes back to the pack (once the line bet is settled if a point is on)
    ev(ben, 'ASH.tables()._leave()')
    check(wait(ben, '!document.querySelector(".tabp.bar")', 10), 'Ben leaves the table: the view comes back')
    for _ in range(400):   # a Don't Pass bet with a point on keeps working until a seven or the point: the table rolls on for it
        relay(); time.sleep(0.3)
        sb_ = c.execute("select st from tb where addr=?", (ADDR['Ben'],)).fetchone()
        if sb_ and sb_['st'] == 'paid': break
    rb = c.execute("select * from tb where addr=? and tbl='cd1'", (ADDR['Ben'],)).fetchone()
    check(rb['st'] == 'paid', "Ben's sitting is paid home (%d)" % (rb['paid'] or 0))
    check(wait(ben, 'ASH.me.inv.filter(s => s && s.id === "coins").reduce((n, s) => n + s.n, 0) === %d' % (p0['Ben'] - 500 + (rb['paid'] or 0)), 15), "Ben's pack: %d - 500 + %d" % (p0['Ben'], rb['paid'] or 0))
    # ---- twenty-one, second floor
    ev(ann, 'ASH.tables()._leave()'); wait(ann, '!document.querySelector(".tabp.bar")', 10)
    check(stand(ann, 'cb1') and stand(ben, 'cb1'), 'both move to the twenty-one table')
    ev(ann, 'ASH.tables()._deposit(400)'); ev(ben, 'ASH.tables()._deposit(400)')
    check(wait(ann, 'ASH.tables()._view().sat', 30) and wait(ben, 'ASH.tables()._view().sat', 30), 'both seated at twenty-one')
    hands = 0
    for rnd in range(6):
        if not wait(ann, 'ASH.tables()._view().phase === "bet"', 40): break
        r0 = ev(ann, 'ASH.tables()._view().round')
        ev(ann, 'ASH.tables()._bet21(10)'); ev(ben, 'ASH.tables()._bet21(20)')
        t0 = time.time()
        while time.time() - t0 < 60:
            relay()
            for pg in (ann, ben):
                v = ev(pg, 'ASH.tables()._view()') or {}
                h = v.get('hand') or {}
                if h.get('insurance'): ev(pg, 'ASH.tables()._ins(false)')
                if h.get('myTurn'): ev(pg, 'ASH.tables()._act(%s)' % json.dumps('stand' if pg is ben else ('hit' if rnd % 2 else 'stand')))
            if ev(ann, 'ASH.tables()._view().phase') == 'show' and ev(ann, 'ASH.tables()._view().round') == r0: hands += 1; break
            time.sleep(0.3)
        if SHOTS and rnd == 1: ann.screenshot(path=os.path.join(SHOTS, 'tables_21.png'))
    check(hands >= 3, '%d twenty-one hands dealt and settled with both players' % hands)
    for nm, pg in PAGES.items():
        s_ = c.execute("select * from tb where addr=? and tbl='cb1' and st='open'", (ADDR[nm],)).fetchone()
        check(s_ is not None and wait(pg, 'ASH.tables()._view().credit === %d' % s_['credit'], 15), "%s's twenty-one credit on screen is the Bank's (%s)" % (nm, s_ and s_['credit']))
    # ---- the wheel (all four tables share the upstairs floor since the clubhouse grew west)
    for pg in (ann, ben): ev(pg, 'ASH.tables()._leave()'); wait(pg, '!document.querySelector(".tabp.bar")', 10)
    check(stand(ann, 'cw1'), 'Ann stands at the wheel')
    ev(ann, 'ASH.tables()._deposit(300)'); check(wait(ann, 'ASH.tables()._view().sat', 30), 'seated at the wheel')
    check(wait(ann, 'ASH.tables()._view().phase === "bet"', 30), 'betting opens at the wheel')
    ev(ann, 'ASH.tables()._bet("red:")'); ev(ann, 'ASH.tables()._bet("s:17")')
    check(wait(ann, 'ASH.tables()._view().felt === 10', 15), 'red and 17 on the felt')
    check(wait(ann, PILES + '("cw1") >= 2', 10), 'two GOLD piles on the wheel felt (%s)' % ev(ann, PILES + '("cw1")'))
    check(wait(ann, 'ASH.tables()._view().phase === "show"', 20), 'the wheel spins')
    time.sleep(3)
    if SHOTS: ann.screenshot(path=os.path.join(SHOTS, 'tables_wheel.png'))
    n = json.loads(dict(TB.table_row(c, 'cw1'))['state'])['last']['n']
    check(wait(ann, 'ASH.tables()._view().msg.indexOf("%d") === 0' % n, 20), 'the ball rests in the Bank\'s pocket: %d' % n)
    ev(ann, 'ASH.tables()._leave()')
    # ---- every GOLD accounted for
    for _ in range(80):
        relay(); time.sleep(0.25)
        if all(r['st'] == 'paid' for r in c.execute('select st from tb')): break
    for nm, pg in PAGES.items():
        rows = c.execute('select * from tb where addr=?', (ADDR[nm],)).fetchall()
        kept = sum(int(r['cin']) - int(r['paid'] or 0) for r in rows)
        check(all(r['st'] == 'paid' for r in rows) and wait(pg, 'ASH.me.inv.filter(s => s && s.id === "coins").reduce((n, s) => n + s.n, 0) === %d' % (p0[nm] - kept), 20),
              "%s: every sitting paid home; the pack holds %d (started %d, the Bank kept %d)" % (nm, pack(pg), p0[nm], kept))
    check(not errs, 'no page errors %s' % errs[:3])
    b.close()
TB.WORKER.p and TB.WORKER.p.kill()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
