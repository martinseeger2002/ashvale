"""Four players at one card table, as the operator plays it (2026-10-13): "it is still sometimes freezing up and not showing the
results of the hand to all the players"; "when a player stands up ... they should be removed from the game and the game
should go on. When they sit back down, they should wait until the next hand". A table row with four players is bigger
than a room message (500 B): it must arrive in pieces (netSendBig) on every screen.
  GPU=1 python3 tests/poker_many_pw.py   (server: python3 -m http.server 8731 in ~/ashvale3d)"""
import os, sys, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu'] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=many%d'
T = 'poker1'; S = lambda f='': 'ASH.core.pokerOf(%s)%s' % (json.dumps(T), f)
fails = []
DUMP = []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m, flush=True)
    if not c:
        fails.append(m)
        for f in DUMP: f()
def ev(pg, js): return pg.evaluate(js)
def wait(pg, js, t=30):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if ev(pg, js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
def act(pg, a): ev(pg, 'ASH.core.cmd("me", %s)' % json.dumps({'c': 'pact', 'a': a}))
def turn(pg): return bool(ev(pg, '!!(ASH.me.seat && ASH.me.seat.k === "pk" && %s === ASH.me.seat.s && %s !== "none")' % (S('.a'), S('.st'))))
def mybet(pg): return ev(pg, '(function(){var s=%s,m=(s.se||[]).find(x=>x[1]===ASH.pid);return m?m[3]:0})()' % S(''))
NAMES = ['Brannoc', 'Ysolde', 'Gwendolyn', 'Theodric']
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 640, 'height': 420}); errs = []; P = []
    for i, nm in enumerate(NAMES):
        pg = ctx.new_page(); tag = nm[0]
        pg.on('pageerror', lambda e, tag=tag: errs.append(tag + ' ' + str(e))); pg.on('console', lambda m, tag=tag: m.type == 'error' and errs.append(tag + ' ' + m.text))
        pg.goto(URL % i, wait_until='domcontentloaded', timeout=180000); wait(pg, '!!(window.ASH && ASH.core)', 120); time.sleep(1)
        ev(pg, 'ASH.hud.showHelp(false); ASH.core.cmd("me", {c: "look", name: %s}); ASH.give("coins", 5000); ASH.teleport(%d, 30)' % (json.dumps(nm), 456 + i % 3)); time.sleep(3)
        ev(pg, '(function(){var bi=ASH.core.M.buildingAt(ASH.me.x,ASH.me.y),B=ASH.core.M.buildings[bi];ASH.core.cmd("me",{c:"climb",dir:1,x:B.stairs[0],y:B.stairs[1]})})()')
        P.append(pg)
    check(all(wait(pg, 'ASH.me.lv === 1', 60) for pg in P), 'four players climb to the card room')
    seats = [0, 2, 4, 6]
    for pg, si in zip(P, seats):
        ev(pg, 'ASH.core.cmd("me", %s)' % json.dumps({'c': 'sit', 'table': T, 'seat': si, 'buy': 100})); time.sleep(1.5)
    check(all(wait(pg, 'ASH.me.seat && ASH.me.seat.k === "pk"', 40) for pg in P), 'all four sit at a 1/2 table')
    check(all(wait(pg, S('.st') + " !== 'none' && " + S('.se') + '.length === 4', 40) for pg in P), 'a four-handed hand is dealt on every screen')
    dealer = next(pg for pg in P if ev(pg, S('.mine')) == 1)
    def dump():
        for i, pg in enumerate(P):
            try: print('       %-9s seat %s h %s st %s a %s v %s mine %s pend %s btns %s myTurn %s room %s heard %s' % (NAMES[i], ev(pg, 'ASH.me.seat && ASH.me.seat.s'), ev(pg, S('.h')), ev(pg, S('.st')), ev(pg, S('.a')), ev(pg, S('.v')), ev(pg, S('.mine')), ev(pg, 'ASH._pokerView(%s).pending' % json.dumps(T)), ev(pg, '!!document.querySelector(".pokerp [data-a=fold]")'), ev(pg, 'ASH._pokerView(%s).myTurn' % json.dumps(T)), ev(pg, 'JSON.stringify(ASH.netHealth())'), ev(pg, 'JSON.stringify(ASH.net().host)')))
            except Exception as e: print('       dump error', e)
            try: print('         chat:', ev(pg, 'Array.from(document.querySelectorAll(".chat div")).slice(-3).map(d=>d.textContent).join(" | ")')[:300])
            except Exception: pass
    DUMP.append(dump)
    def play_out(skip=None, t=120):
        t0 = time.time()
        while time.time() - t0 < t:
            if ev(dealer, S('.st') + " === 'none'"): return True
            for pg in P:
                if pg is skip or not turn(pg) or ev(pg, 'ASH._pokerView(%s).pending' % json.dumps(T)): continue
                act(pg, 'call' if ev(pg, S('.b')) > mybet(pg) else 'check'); time.sleep(0.3)
            time.sleep(0.25)
        return False
    DEALT = '(function(){var s=%s,m=(s.se||[]).find(x=>x[1]===ASH.pid);return !!m && !!(m[4] & 8)})()' % S('')
    play_out()   # the first hand was dealt when the second player sat: the last two wait it out
    check(all(wait(pg, S('.st') + " === 'preflop' && " + DEALT, 60) for pg in P), 'the next hand deals all four in')
    check(all(wait(pg, "(function(){var s=%s,o=ASH.me.seat.s;return (s.hc||[]).some(h=>(h[0]|0)===o&&typeof h[1]==='number')})()" % S(''), 20) for pg in P),
          'every player has their own two cards')
    for n in range(2):
        check(play_out(), 'hand %d is played to the showdown' % ev(dealer, S('.h')))
        big = ev(dealer, 'JSON.stringify({Pk: [ASH.pokerNetRow(%s)]}).length' % json.dumps(T))
        print('     the result row on the wire: %d characters' % big)
        check(all(wait(pg, S('.st') + " === 'none' && " + S('.r') + ' && (' + S('.r.sd') + ' || []).length >= 2', 15) for pg in P),
              '  every screen gets the result, the called hands shown (%s)' % [ev(pg, '(' + S('.r && ') + S('.r.sd') + ' || []).length') for pg in P])
        check(all(wait(pg, '!document.querySelector(".pokerp [data-a=fold]")', 8) for pg in P), '  and no panel is left on Call / Fold / Raise')
        H = ev(dealer, S('.h'))
        check(all(wait(pg, S('.h') + ' > %d' % H, 60) for pg in P), '  the next hand comes to every screen')
    if big <= 500: print('     NOTE the row was small enough not to need splitting')
    # a player stands up mid-hand: removed, the hand goes on, and he waits for the next one to sit back in
    leaver = P[3]
    wait(dealer, S('.st') + " === 'preflop'", 30)
    for _ in range(20):
        if not turn(leaver): break
        time.sleep(0.5)
    ev(leaver, 'ASH.core.cmd("me", {c: "stand"})')
    check(wait(leaver, '!ASH.me.seat', 10), 'Theodric stands up in the middle of a hand')
    check(all(wait(pg, S('.se') + '.length === 3', 15) for pg in P[:3]), '  every other screen shows him gone')
    check(play_out(skip=leaver), '  the hand goes on without him to its end')
    check(all(wait(pg, S('.r'), 15) for pg in P[:3]), '  and the three who played see its result')
    wait(dealer, S('.st') + " === 'preflop'", 40)
    ev(leaver, 'ASH.core.cmd("me", %s)' % json.dumps({'c': 'sit', 'table': T, 'seat': 6, 'buy': 0}))
    check(wait(leaver, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30), 'he sits back down while a hand is running')
    h_sat, st_sat = ev(dealer, S('.h')), ev(dealer, S('.st'))
    if st_sat != 'none':
        time.sleep(2)
        check(not ev(leaver, '(function(){var s=%s,m=(s.se||[]).find(x=>x[1]===ASH.pid);return !!m && %s === %d && !!(m[4] & 8)})()' % (S(''), S('.h'), h_sat)), '  and waits: no cards for him in the hand already running (hand %d)' % h_sat)
    else: print('     (the hand had just ended when he sat: the waiting check needs a running hand)')
    H = ev(dealer, S('.h')); play_out()
    check(wait(leaver, S('.h') + ' > %d && ' % H + '(function(){var s=%s,m=(s.se||[]).find(x=>x[1]===ASH.pid);return !!m && (m[4] & 8)})()' % S(''), 60), '  the next hand deals him in')
    check(not errs, 'no console errors (%d)%s' % (len(errs), (': ' + errs[0][:200]) if errs else ''))
    b.close()
print('ALL OK' if not fails else '%d FAILED' % len(fails)); sys.exit(1 if fails else 0)
