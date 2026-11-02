"""[Claude 2026-11-01] the operator: "wherever you place your bet on the table, it is on that bet" and "the bet should only be paid or taken after the results
are shown". One real game at the dice table, no Bank (its words are fed in): every bet key at both ends of the table, six players at once, come bets
moved to their numbers: each stack must lie inside its own box. Then a throw: the credit and the bets must not move until the dice stop, whatever
words arrive meanwhile, and the wheel the same.   python3 tests/serve.py 8776 & PORT=8776 HEADED=1 python3 tests/dice_felt_pw.py"""
import json, os, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
PORT = os.environ.get('PORT', '8776'); SHOT = os.environ.get('SHOT')
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&notut&loopback&seed=felt&go=640,-118'
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); (None if c else fails.append(m))
def wait(pg, js, t=30):
    end = time.time() + t
    while time.time() < end:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.3)
    return False
CLIMB = '(function(){var bi=ASH.core.M.buildingAt(ASH.me.x,ASH.me.y),st=ASH.core.M.flightOf(bi,ASH.me.lv|0);ASH.core.cmd("me",{c:"climb",dir:1,x:st[0],y:st[1]})})()'
INSIDE = """(tbl) => { const T = ASH.tables()._T(tbl), A = T._areas, keys = [...new Set(A.map(a => a.key))], bad = []; let n = 0;
  const check = (key, want) => { for (const [x, z] of T._piles()) { n++; if (!A.some(a => want.includes(a.key) && x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1)) bad.push(key + ' at ' + x.toFixed(3) + ',' + z.toFixed(3)); } };
  for (const key of keys) for (const end of [-1, 1]) {
    T.show({ felt: { s: { bets: { [key]: 25 }, come: [], dcome: [] } }, spots: { s: end }, sides: {} }); check(key, [key]);
    const felt = {}, spots = {}; for (let i = 0; i < 6; i++) { felt['p' + i] = { bets: { [key]: 25 }, come: [], dcome: [] }; spots['p' + i] = end; }
    T.show({ felt, spots, sides: {} }); check(key + ' six players', [key]); }
  for (const c of [4, 5, 6, 8, 9, 10]) for (const end of [-1, 1]) {
    T.show({ felt: { s: { bets: {}, come: [{ n: c, amt: 10, odds: 5 }], dcome: [{ n: c, amt: 10 }] } }, spots: { s: end }, sides: {} }); check('moved to ' + c, ['place' + c]); }
  T.show({ felt: {}, spots: {} }); return { n, bad: bad.slice(0, 12), count: bad.length, keys: keys.length }; }"""
SHOW_ALL = """(tbl) => { const T = ASH.tables()._T(tbl), keys = [...new Set(T._areas.map(a => a.key))], bets = {}; for (const k of keys) if (!/pass|^dp|field|^come|^dc/.test(k)) bets[k] = 25;
  T.show({ felt: { s: { bets, come: [], dcome: [] } }, spots: { s: 1 }, sides: {} }); return Object.keys(bets).length; }"""
WORD = lambda r, ph, cred, felt, **x: dict(dict(t='tbs', tbl='TBL', seq=r * 10 + (x.pop('seq', 0)), r=r, ph=ph, left=9000, point=0, seats={'1': dict(s='SIT', credit=cred, felt=felt)}, felt={'SIT': dict(bets=dict(field=felt) if felt else {}, come=[], dcome=[])} if ph == 'bet' else {'SIT': dict(bets={}, come=[], dcome=[])}), **x)
def fill(o, tbl, s): return json.loads(json.dumps(o).replace('TBL', tbl).replace('SIT', s))
def throw(pg, tbl, game, last):
    pg.evaluate('t => ASH.tables()._standAt(t)', tbl)
    if not wait(pg, '!!document.querySelector(".tabp.bar")', 40): check(False, tbl + ': stood at the table'); return
    s = pg.evaluate('ASH.tables()._view() && 0 || ASH.tables()._sit && ASH.tables()._sit()') or pg.evaluate('ASH.tables()._s && ASH.tables()._s()')
    v = pg.evaluate('ASH.tables()._view()'); print('    ', {k: v.get(k) for k in ('sat', 'credit', 'felt', 'phase')}, 'sitting', s, flush=True)
    H = "(o) => window.__tbHeard(o)"; sp = pg.evaluate('ASH.tables()._tv().spot') + 1
    pg.evaluate(H, fill(dict(t='tb', s='SIT', st='open', credit=100, spot=sp), tbl, s))
    pg.evaluate(H, fill(WORD(5, 'bet', 80, 20), tbl, s).__class__(json.loads(json.dumps(fill(WORD(5, 'bet', 80, 20), tbl, s)).replace('"1": {"s"', '"%d": {"s"' % sp)))); pg.wait_for_timeout(300)
    v0 = pg.evaluate('ASH.tables()._view()'); check(v0['felt'] == 20, f'{game}: 20 on the felt before the throw: {v0["felt"]}, credit {v0["credit"]}')
    pg.evaluate(H, json.loads(json.dumps(fill(dict(WORD(6, 'show', 140, 0), last=last), tbl, s)).replace('"1": {"s"', '"%d": {"s"' % sp))); t0 = time.time(); pg.wait_for_timeout(300)
    pg.evaluate(H, fill(dict(t='tb', s='SIT', st='open', credit=140, spot=sp), tbl, s))
    pg.evaluate(H, json.loads(json.dumps(fill(WORD(6, 'show', 140, 0, seq=5), tbl, s)).replace('"1": {"s"', '"%d": {"s"' % sp))); pg.wait_for_timeout(500)
    a = pg.evaluate('ASH.tables()._view()'); check(a['credit'] == v0['credit'] and a['felt'] == 20, f'{game}: during the throw nothing moves: credit {a["credit"]}, felt {a["felt"]}')
    ok = wait(pg, 'ASH.tables()._view().credit === 140', 20); took = time.time() - t0
    z = pg.evaluate('ASH.tables()._view()'); check(ok and z['felt'] == 0, f'{game}: paid when it stopped, {took:.1f} s after the word: credit {z["credit"]}, felt {z["felt"]}')
    check(took > 1.5, f'{game}: the wait was the animation, not nothing ({took:.1f} s)')
    pg.evaluate('ASH.tables()._standUp ? ASH.tables()._standUp() : ASH.tables().standUp()'); pg.wait_for_timeout(800)
with sync_playwright() as p:
    b = p.chromium.launch(headless=os.environ.get('HEADED') is None, args=['--use-gl=egl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'])
    ctx = b.new_context(viewport={'width': 1000, 'height': 620}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, timeout=120000); check(wait(pg, '!!(window.ASH && ASH.core && ASH.tables && ASH.tables())', 150), 'the game is up')
    pg.keyboard.press('Escape'); pg.evaluate('ASH.hud.showHelp && ASH.hud.showHelp(false)')
    pg.evaluate("""a => { window.__tbq = []; window.__tbHeard = ASH.tables()._bank(o => window.__tbq.push(o), a); }""", 'nAnnTableTestAddressAAAAAAAAAAAAAA')
    tbs = pg.evaluate("ASH.core.M.objects.filter(o => o.k === 'gametable').map(o => [o.id, o.game, o.lv | 0, o.x, o.y])"); print('    ', tbs, flush=True)
    dice = next(t for t in tbs if t[1] == 'dice'); wheel = next(t for t in tbs if t[1] == 'wheel')
    pg.evaluate('(t) => ASH.core.cmd("me", {c: "tele", x: t[3], y: t[4]})', dice) if False else None
    print('    ', pg.evaluate('({ x: ASH.me.x, y: ASH.me.y, lv: ASH.me.lv | 0 })'), flush=True)
    for _ in range(3):
        if pg.evaluate('ASH.me.lv | 0') >= dice[2]: break
        f = pg.evaluate('ASH.me.lv | 0'); pg.evaluate(CLIMB); wait(pg, 'ASH.me.lv === %d' % (f + 1), 30)
    check(bool(wait(pg, 't => 0', 0.1) or True) and pg.evaluate('t => !!ASH.tables()._T(t)', dice[0]), 'the dice table is built')
    r = pg.evaluate(INSIDE, dice[0]); check(r['count'] == 0, f"every stack inside its own box: {r['n']} stacks over {r['keys']} bets, wrong {r['count']}: {r['bad']}")
    throw(pg, dice[0], 'dice', dict(r=6, dice=[3, 4], call='Seven!', lines={}, pay={}))
    throw(pg, wheel[0], 'wheel', dict(r=6, n=17, colour='black', lines={}, pay={}))
    if SHOT:
        pg.evaluate('t => ASH.tables()._standAt(t)', dice[0]); wait(pg, '!!document.querySelector(".tabp.bar")', 30); pg.evaluate("for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Cancel') b.click()"); print('     bets drawn', pg.evaluate(SHOW_ALL, dice[0]), flush=True); pg.evaluate("for (const e of document.querySelectorAll('.tabp')) e.style.display = 'none'"); pg.wait_for_timeout(1500)
        pg.screenshot(path=SHOT, timeout=30000)
    check(not errs, f'no page errors: {errs[:3]}')
print('FAILED %d' % len(fails) if fails else 'ALL OK', flush=True); os._exit(1 if fails else 0)
