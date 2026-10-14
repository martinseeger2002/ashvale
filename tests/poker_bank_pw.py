"""[Claude 2026-10-14] THE CARD TABLE'S GOLD THROUGH @ashvale - the game's side (the Bank's side: tests/bank_pk_test.py on .25).
The operator: "When the player buys in send that gold to the Ashvale wallet; when they cash out or stand up or lose connection, send
their remaining poker game balance back to them." Two games in one loopback room at a 100 GOLD table:
  - each seat carries a session number in the row (se[5]), the same on both screens;
  - each player's own game asks for its buy-in to go to @ashvale for exactly that seat (pkbuy '<table>:<gid>:<sn>', 100);
  - standing up, the dealer tells the Bank what that seat leaves with (pkout, the stack the row showed), and the player's own game
    says the same (pkcash) - one seat, one session, the same amount;
  - a guest whose page closes: the dealer still cashes it out to the Bank (pkout) once it has gone.
  python3 tests/poker_bank_pw.py   (server: python3 -m http.server 8731 in ~/ashvale3d; GPU=1 for a real GPU)"""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m); c or fails.append(m)
def ev(pg, js): return pg.evaluate(js)
def wait(pg, js, t=40):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if ev(pg, js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
T = 'poker1'; S = 'ASH.core.pokerOf(%s)' % json.dumps(T)
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=pbank%d'
ARGS = ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu'] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
def evs(pg, kind=None): return [e for e in ev(pg, 'window.__pkEv || []') if kind is None or e['e'] == kind]
def mysn(pg): return ev(pg, '(function(){var m=(%s.se||[]).find(x=>x[1]===ASH.pid);return m?m[5]:null})()' % S)
def chips(pg): return ev(pg, '(function(){var m=(%s.se||[]).find(x=>x[1]===ASH.pid);return m?m[2]:null})()' % S)
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=ARGS); errs = []
    ctx = b.new_context(viewport={'width': 760, 'height': 520})
    pages = []
    for i, nm in enumerate(['Ann', 'Ben']):
        pg = ctx.new_page(); pg.on('pageerror', lambda e, nm=nm: errs.append(nm + ' ' + str(e)))
        pg.goto(URL % i, wait_until='domcontentloaded', timeout=120000); wait(pg, '!!(window.ASH && ASH.core)', 90); time.sleep(1)
        ev(pg, 'window.__pkEv = []; ASH.hud.showHelp(false); ASH.core.cmd("me", {c: "look", name: %s}); ASH.teleport(%d, 30)' % (json.dumps(nm), 457 + i)); time.sleep(3)
        ev(pg, '(function(){var bi=ASH.core.M.buildingAt(ASH.me.x,ASH.me.y),B=ASH.core.M.buildings[bi];ASH.core.cmd("me",{c:"climb",dir:1,x:B.stairs[0],y:B.stairs[1]})})()')
        pages.append(pg)
    pa, pb = pages
    check(all(wait(pg, 'ASH.me.lv === 1', 60) for pg in pages), 'both up in the card room')
    for pg in pages: ev(pg, 'ASH.give("coins", 1000)')
    check(wait(pa, 'ASH.net().amHost', 30), 'Ann deals')
    ev(pa, 'ASH.core.cmd("me", {c:"sit", table:%s, seat:0, buy:100})' % json.dumps(T)); wait(pa, 'ASH.me.seat && ASH.me.seat.k==="pk"')
    ev(pb, 'ASH.core.cmd("me", {c:"sit", table:%s, seat:1, buy:0})' % json.dumps(T)); wait(pb, 'ASH.me.seat && ASH.me.seat.k==="pk"')
    check(wait(pa, '%s.st !== "none"' % S) and wait(pb, '(%s.se||[]).length === 2' % S), 'both seated, a hand is dealt')
    gid = ev(pa, '%s.gid|0' % S); sa, sb = mysn(pa), mysn(pb)
    check(bool(sa) and bool(sb) and sa != sb, 'each seat has its own session number (%s, %s)' % (sa, sb))
    check(ev(pb, '(function(){var s=%s;var m=(s.se||[]).find(x=>x[0]===0);return m?m[5]:null})()' % S) == sa, "Ben's screen shows Ann's seat with the same session number")
    wait(pa, 'window.__pkEv.some(e=>e.e==="pkbuy")', 10); wait(pb, 'window.__pkEv.some(e=>e.e==="pkbuy")', 10)
    ba, bb = evs(pa, 'pkbuy'), evs(pb, 'pkbuy')
    check(len(ba) == 1 and ba[0]['s'] == '%s:%d:%d' % (T, gid, sa) and ba[0]['n'] == 100, "Ann's game asks for her 100 GOLD to go to @ashvale for her seat: %s" % ba)
    check(len(bb) == 1 and bb[0]['s'] == '%s:%d:%d' % (T, gid, sb) and bb[0]['n'] == 100, "Ben's game the same for his: %s" % bb)
    # play a little, then Ben stands up
    for _ in range(10):
        for pg in pages:
            if ev(pg, '!!ASH.me.seat && %s.st!=="none" && %s.a === ASH.me.seat.s' % (S, S)): ev(pg, 'ASH.core.cmd("me", {c:"pact", a:"call"})'); time.sleep(1)
        time.sleep(0.5)
    wait(pa, '%s.st === "none"' % S, 60); time.sleep(1)
    left = chips(pb)
    ev(pb, 'ASH.core.cmd("me", {c:"stand"})')
    check(wait(pa, 'window.__pkEv.some(e=>e.e==="pkout" && e.s===%s)' % json.dumps('%s:%d:%d' % (T, gid, sb)), 20), 'Ben stands: the dealer tells the Bank about his seat')
    o = [e for e in evs(pa, 'pkout') if e['s'].endswith(':%d' % sb)]
    check(len(o) == 1 and o[0]['n'] == left, '  with the stack the row showed (%s, row %s)' % ([e['n'] for e in o], left))
    check(wait(pb, 'window.__pkEv.some(e=>e.e==="pkcash")', 20), "  and Ben's own game says the same (pkcash)")
    c = evs(pb, 'pkcash')
    check(len(c) == 1 and c[0]['s'] == o[0]['s'] and c[0]['n'] == o[0]['n'], '  same seat, same amount: %s' % c)
    # Ben sits again: a new session; then his page closes - the dealer cashes the seat out to the Bank once he has gone
    ev(pb, 'ASH.core.cmd("me", {c:"sit", table:%s, seat:1, buy:0})' % json.dumps(T)); wait(pb, 'ASH.me.seat && ASH.me.seat.k==="pk"', 30)
    wait(pb, '(function(){var m=(%s.se||[]).find(x=>x[1]===ASH.pid);return m && m[5] && m[5] !== %d})()' % (S, sb), 20)
    sb2 = mysn(pb)
    check(bool(sb2) and sb2 != sb, 'sitting again is a new session (%s)' % sb2)
    print('     DIAG sns before close', ev(pa, 'JSON.stringify(ASH.core.S.poker[%s].sns)' % json.dumps(T)))
    pb.close(); t0 = time.time()
    check(wait(pa, 'window.__pkEv.some(e=>e.e==="pkout" && e.s.endsWith(":"+%d))' % (sb2 or -1), 150), "Ben's page closes: the dealer cashes his seat out to the Bank (%.0f s)" % (time.time() - t0))
    if fails: print('     DIAG ann events', evs(pa)); print('     row', ev(pa, 'JSON.stringify({se:%s.se, co:%s.co, buy:%s.buy})' % (S, S, S)))
    ev(pa, 'ASH.core.cmd("me", {c:"stand"})')
    check(wait(pa, 'window.__pkEv.some(e=>e.e==="pkout" && e.s.endsWith(":"+%d))' % sa, 20), "Ann, the dealer, stands: her own seat goes to the Bank too")
    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, 'no page errors %s' % errs[:2])
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK'); sys.exit(1 if fails else 0)
