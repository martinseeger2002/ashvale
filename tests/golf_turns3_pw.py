"""[Claude 2026-10-20] the operator: "In party mode is not cycling through the players ... Each player should tee off one after the next
until all players have teed off. Then ... [the farthest ball] should go until all players have shot the entire way to the pin."
Three golfers in one group: every game agrees whose turn it is at every step; all three tee off first, in order; then always
the ball farthest from the pin; the hole ends with all three in.  python3 tests/golf_turns3_pw.py  (PORT, HEADED=1)"""
import os, time, math, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
PORT = os.environ.get('PORT', '8775'); GS = 'ASH.golf()._state()'
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&notut&loopback&seed=t3%d&go=636,-112'
def wait(pg, js, t=20):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.2)
    return False
with sync_playwright() as p:
    b = p.chromium.launch(headless=os.environ.get('HEADED') is None, args=['--use-angle=gl'] if os.environ.get('HEADED') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 640, 'height': 480}); pgs = []; errs = []
    for i in range(3):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(URL % i, wait_until='domcontentloaded', timeout=120000)
        check(wait(pg, '!!(window.ASH && ASH.golf && ASH.golf())', 120), 'game %d up' % i); pg.keyboard.press('Escape')
        pg.evaluate("n => { ASH.me.name = n; ASH.me.inv[0] = { id: 'golf_standard', n: 1 }; ASH.give('coins', 100); }", 'P%d' % i); pgs.append(pg)
    A = pgs[0]; A.evaluate("ASH.golf()._openGroup('free', 0)")
    for pg in pgs[1:]:
        check(wait(pg, "ASH.golf()._open().length > 0", 20), 'hears the open group'); pg.evaluate("g => ASH.golf()._join(g)", pg.evaluate("ASH.golf()._open()[0].g"))
    check(wait(A, "ASH.golf()._lobby() && ASH.golf()._lobby().m.length === 3", 20), 'three in the group')
    A.evaluate("document.querySelector('.golfp.card button[data-id=go]').click()")
    for i, pg in enumerate(pgs):
        okr = wait(pg, GS + " && " + GS + ".rid", 25); check(okr, 'round starts on game %d' % i)
        if not okr: print('   game', i, 'me', pg.evaluate('ASH.golf()._me()'), 'lobby', json.dumps(pg.evaluate('ASH.golf()._lobby()'))[:400], 'open', json.dumps(pg.evaluate('ASH.golf()._open()'))[:300])
    if fails: print('   host lobby', json.dumps(A.evaluate('ASH.golf()._lobby()'))[:400], 'host state m', json.dumps(A.evaluate(GS + ' && ' + GS + '.m'))); b.close(); raise SystemExit(1)
    who = {pg.evaluate(GS + ".sn"): pg for pg in pgs}; pin = A.evaluate(GS + ".pin")
    def turns(): return [pg.evaluate(GS + ".turn") for pg in pgs]
    def settle(t=20):   # every game agrees, nobody's ball in the air, and it stays so for 2 s (a landing reaches the others a moment later)
        t0 = time.time(); since = None; last = None
        while time.time() - t0 < t:
            T = turns(); calm = len(set(T)) == 1 and all(pg.evaluate(GS + ".phase") not in ('go', 'fly') for pg in pgs)
            if calm and T[0] == last and since is not None:
                if time.time() - since >= 2: return T[0]
            else: since = time.time(); last = T[0] if calm else None
            time.sleep(0.25)
        for pg in pgs:
            S = pg.evaluate(GS); print('   seat', S['sn'], 'turn', S['turn'], 'hole', S['hole'], 'k', S['k'], 'ph', S['phase'], 'ball', S['ball'], 'card', S['card'])
            for sn, g in (S.get('st') or {}).items(): print('      sees', sn, {k: g.get(k) for k in ('n', 'k', 'b', 'ph', 'c', 's', 'sw')})
            for r in S.get('rests') or []: print('      rest', r)
        return 'DISAGREE %s' % turns()
    teed = []; shots = 0; ok_far = True; ended = False
    while shots < 40:
        t = settle()
        if t is None: ended = True; break
        if isinstance(t, str): check(False, 'all games agree whose turn it is: ' + t); break
        st = {s: who[s].evaluate(GS) for s in who}
        if len(teed) < 3:
            check(t not in teed, 'tee shot %d: seat %s, who has not teed off yet' % (len(teed) + 1, t)); teed.append(t)
        else:
            left = [s for s in who if not (st[s]['card'][0] if len(st[s]['card']) else 0)]
            if not left:
                check(False, 'a turn (%s) while every golfer has holed out' % t)
                for q in pgs:
                    S = q.evaluate(GS); print('   seat', S['sn'], 'turn', S['turn'], 'k', S['k'], 'ph', S['phase'], 'strokes', S['strokes'], 'card', S['card'], 'cards', S.get('cards'))
                    for sn, g in (S.get('st') or {}).items(): print('      sees', sn, {k: g.get(k) for k in ('n', 'k', 'ph', 'c', 's', 'sw', 'd')})
                break
            d = {s: math.hypot(pin[0] - st[s]['ball']['x'], pin[1] - st[s]['ball']['y']) for s in left}
            far = max(d, key=d.get)
            if t != far and abs(d[t] - d[far]) > 0.01: ok_far = False; print('   turn %s at %.1f m but %s is farther (%.1f m)' % (t, d[t], far, d[far]))
        pg = who[t]; shots += 1
        dd = math.hypot(pin[0] - st[t]['ball']['x'], pin[1] - st[t]['ball']['y'])
        pw = 0.5 if st[t]['club'] != 'PT' else 1
        r = pg.evaluate("p => ASH.golf()._shoot({ atPin: true, power: p, impact: 0 })", pw)
        if not r:
            check(False, 'seat %s could shoot on its turn' % t)
            for q in pgs:
                S = q.evaluate(GS); print('   seat', S['sn'], 'turn', S['turn'], 'hole', S['hole'], 'k', S['k'], 'ph', S['phase'], 'strokes', S['strokes'], 'ball', S['ball'], 'card', S['card'])
                for sn, g in (S.get('st') or {}).items(): print('      sees', sn, {k: g.get(k) for k in ('n', 'k', 'b', 'ph', 'c', 's')})
            break
        wait(pg, GS + ".phase === 'fly'", 6)
    check(len(teed) == 3, 'all three teed off first, one after another: %s' % teed)
    check(ok_far, 'after the tee shots the ball farthest from the pin always played next')
    check(ended, 'the hole ends with all three in (%d shots)' % shots)
    check(not errs, 'no page errors %s' % errs[:2])
    b.close()
print('ALL OK' if not fails else '%d FAILED' % len(fails))
