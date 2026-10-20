"""[Claude 2026-10-19] THE SALTMERE LINKS (src/engolf.js, golfrules.js, golfcourse.js, hudgolf.js). Ann and Ben (a club set and
GOLF each) and Cal stand at the clubhouse. Checks: the course part is up; Fergus talks; Ann opens a group for a 100 GOLD pot,
Ben sees it and joins, Ann tees off: both rounds start with the golf HUD, the stakes leave the bags (pkbuy).
[Claude 2026-10-20] TURNS (the operator: "they need to take turns ... the farther alternate ... all players should view the active
player's shot"): on hole 1 Ann (first in the group) has the turn on both games; Ben's HUD says "Waiting: Ann is playing" and his
presses do nothing; Ann swings with Space through the meter, Ben's camera follows her ball in flight; then it is Ben's turn on
both games, he swings with mouse clicks on the swing button; then the farther ball plays on both games; both balls are put on
the green and putted out turn by turn (always the farther one, the same on both games); once both are in, both games go to
hole 2 together without a button, the lower score on hole 1 tees off first.
The rest of the 18 holes are written by the test hook: Ann 70, Ben 75 - both games give the Bank the same split (pkout per
seat: Ann 200, Ben 0) and each claims its own (pkcash), Ann's bag gets the pot.
Cal is on a phone (touch, 390x844): his solo round's swing button gets two touch taps at once (one press only), the power
tap, an immediate second tap (ignored: the strike waits for the marker to come back), then the strike tap: the ball flies.
Cal leaves: the HUD and camera come back; no page errors.
  python3 tests/golf_pw.py   (server: python3 tests/serve.py 8775 in the tree; HEADED=1 for a visible Chromium)"""
import os, time, json, math
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
def wait(pg, js, t=40):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
PORT = os.environ.get('PORT', '8775')
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&loopback&seed=golf%d&go=636,-112'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
GS = 'ASH.golf()._state()'
COINS = "ASH.me.inv.reduce((s, q) => s + (q && q.id === 'coins' ? q.n : 0), 0)"
def st(pg): return pg.evaluate(GS)
def swing3(pg, how, label):
    """the three presses through the meter: start, power high on the meter, strike when the marker is back near the line"""
    def go():
        if how == 'space': pg.keyboard.press('Space')
        else: pg.click('.golfp .swingbtn')
    go(); t0 = time.time()
    while st(pg)['phase'] == 'rise' and time.time() - t0 < 5:
        if st(pg)['meter'] > 70: break
        time.sleep(0.02)
    go(); check(st(pg)['phase'] == 'fall', label + ': the power press sets the power (phase fall)')
    t0 = time.time()
    while st(pg)['phase'] == 'fall' and time.time() - t0 < 4:
        if st(pg)['meter'] < 3: break
        time.sleep(0.015)
    go()
    check(wait(pg, GS + ".phase === 'go' || " + GS + ".phase === 'fly'", 3), label + ': the strike press swings')
with sync_playwright() as p:
    b = p.chromium.launch(headless=os.environ.get('HEADED') is None, args=ARGS if os.environ.get('HEADED') is None else ['--use-angle=gl']); errs = []
    ctx = b.new_context(viewport={'width': 1000, 'height': 640})
    phone = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    pages = []
    for i in range(3):
        pg = (ctx if i < 2 else phone).new_page(); pg.on('pageerror', lambda e, i=i: errs.append(str(i) + ' ' + str(e) + ' @ ' + str(getattr(e, 'stack', '') or '')[:300]))
        pg.goto(URL % i, wait_until='domcontentloaded', timeout=120000)
        check(wait(pg, '!!(window.ASH && ASH.core && ASH.golf && ASH.golf())', 120), 'game %d up with the golf part' % i)
        pg.keyboard.press('Escape'); pg.evaluate("window.__pkEv = []")
        pages.append(pg)
    ann, ben, cal = pages
    for pg, nm in ((ann, 'Ann'), (ben, 'Ben'), (cal, 'Cal')):
        pg.evaluate("n => { ASH.me.name = n; for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.me.inv[0] = { id: 'golf_standard', n: 1 }; ASH.give('coins', 5000); }", nm)
    check(ann.evaluate(COINS) == 5000, 'Ann has 5000 GOLD and a Standard set')
    # Fergus
    cal.evaluate("ASH.core.cmd(Object.keys(ASH.core.S.players).find(k => !ASH.core.S.players[k].puppet), { c: 'npc', id: 'fergus' })")
    check(wait(cal, "/Saltmere Links/.test((document.querySelector('.dlg') || {}).innerText || '')", 25), 'Fergus the starter talks')
    cal.evaluate("document.querySelector('.dlg') && document.querySelector('.dlg').click()"); time.sleep(0.3); cal.keyboard.press('Escape')
    # a group for a 100 GOLD pot
    ann.evaluate("ASH.golf()._openGroup('pot', 100)")
    check(wait(ben, "ASH.golf()._open().length > 0", 20), "Ben hears Ann's open group")
    g = ben.evaluate("ASH.golf()._open()[0].g")
    ben.evaluate("g => ASH.golf()._join(g)", g)
    check(wait(ann, "ASH.golf()._lobby() && ASH.golf()._lobby().m.length === 2", 20), 'Ben joins: two in the group')
    check(ann.evaluate("!!document.querySelector('.golfp.card button[data-id=go]')"), 'Ann has a Tee off button')
    ann.evaluate("document.querySelector('.golfp.card button[data-id=go]').click()")
    okA = wait(ann, GS + " && " + GS + ".rid", 25); okB = wait(ben, GS + " && " + GS + ".rid", 20)
    check(okA and okB, 'both rounds start (Ann %s, Ben %s) %s' % (okA, okB, errs[:2]))
    if not (okA and okB): print('   ann me', ann.evaluate('ASH.golf()._me()'), 'ben me', ben.evaluate('ASH.golf()._me()'), 'ann lobby', ann.evaluate('ASH.golf()._lobby()'), 'ben lobby', ben.evaluate('ASH.golf()._lobby()')); b.close(); raise SystemExit(1)
    check(ann.evaluate(GS + ".rid") == ben.evaluate(GS + ".rid"), 'the same round id on both')
    check(ann.evaluate("!!document.querySelector('.lay.golf') && !!document.querySelector('.golfp.swing')"), 'the golf HUD replaces the HUD')
    check(wait(ann, COINS + " === 4900", 10) and wait(ben, COINS + " === 4900", 10), 'the 100 GOLD stakes leave both bags')
    check(ann.evaluate("__pkEv.some(e => e.e === 'pkbuy' && /^golf:/.test(e.s) && e.n === 100)"), 'pkbuy: the stake goes to @ashvale')
    A, B = st(ann)['sn'], st(ben)['sn']
    NM = {x[3]: x[1] for x in st(ann)['m']}   # the names the games go by (the board name)
    WAITM = "(document.querySelector('.golfp.waitm') || {}).textContent === 'Waiting: ' + %s + ' is playing'"
    # ---- turns on hole 1
    check(wait(ann, GS + ".turn === %d" % A, 10) and wait(ben, GS + ".turn === %d" % A, 10), 'hole 1: Ann (first in the group) has the turn on both games')
    check(wait(ben, WAITM % json.dumps(NM[A]) + " && document.querySelector('.golfp.swing').classList.contains('off')", 10), "Ben's HUD: Waiting: %s is playing (meter off)" % NM[A])
    check(ann.evaluate("getComputedStyle(document.querySelector('.golfp.waitm')).display === 'none'"), "Ann's HUD has no waiting line")
    ben.evaluate("ASH.golf()._press()"); ben.click('.golfp .swingbtn'); ben.keyboard.press('Space'); time.sleep(0.3)
    check(st(ben)['phase'] == 'aim' and not ben.evaluate("ASH.golf()._shoot({})"), 'Ben cannot swing out of turn (press, click, Space, hook)')
    a0 = st(ann)['ball']
    # The operator: the waiting golfers stand round the one who plays, watching (behind the ball, across from the player)
    def watching(pg, who, ball, aim, t=8):
        t0 = time.time(); v = None
        while time.time() - t0 < t:
            v = pg.evaluate("s => ASH.golf()._avatarOf(s)", who)
            if v:
                dx, dz = v['x'] - ball['x'], v['z'] - ball['y']; d = math.hypot(dx, dz); along = dx * math.cos(aim) + dz * math.sin(aim)
                if 3 <= d <= 6 and along < 0 and v['pose'] == 'idle': return True, d, along
            time.sleep(0.25)
        return False, v, None
    aim = st(ann)['aim']
    for pg, nm in ((ben, "on Ben's game"), (ann, "on Ann's game")):
        ok, d, al = watching(pg, B, a0, aim)
        check(ok, "Ben's avatar watches Ann %s: %s m from her ball, %s m along the line (behind), idle" % (nm, d if not ok else round(d, 1), al if al is None else round(al, 1)))
    va = ann.evaluate("s => ASH.golf()._avatarOf(s)", A)
    check(va and math.hypot(va['x'] - a0['x'], va['z'] - a0['y']) < 1.5 and va['pose'] != 'idle', "Ann's avatar stands at her ball at address (%s)" % va)
    swing3(ann, 'space', 'Ann (Space)')
    check(wait(ann, GS + ".phase === 'fly'", 6), 'the swing plays and the ball flies')
    check(wait(ben, "ASH.golf()._remotes().length > 0", 10), "Ben's page draws Ann on the course")
    check(wait(ben, "(c => c && c.sn === %d && c.fly)(ASH.golf()._camTarget())" % A, 10), "Ben's camera follows Ann's ball in flight")
    check(wait(ann, GS + ".phase === 'aim' || " + GS + ".phase === 'done'", 25), 'the ball comes to rest')
    a1 = st(ann)['ball']; check(abs(a1['x'] - a0['x']) + abs(a1['y'] - a0['y']) > 5 and st(ann)['strokes'] >= 1 and st(ann)['k'] == 1, 'it went %.1f m' % (abs(a1['x'] - a0['x']) + abs(a1['y'] - a0['y'])))
    check(wait(ann, GS + ".turn === %d" % B, 10) and wait(ben, GS + ".turn === %d" % B, 10), "then Ben's turn (he has not teed off) on both games")
    check(wait(ann, WAITM % json.dumps(NM[B]) + " && ASH.golf()._camTarget().sn === %d" % B, 10), "Ann's HUD waits for Ben, her camera on Ben's ball")
    check(wait(ben, "ASH.golf()._camTarget().sn === %d && !ASH.golf()._camTarget().fly" % B, 10), "Ben's camera is back behind his own ball")
    check(not ann.evaluate("ASH.golf()._shoot({})"), 'Ann cannot play out of turn')
    sb0 = st(ben)
    ok, d, al = watching(ben, A, sb0['ball'], sb0['aim'])
    check(ok, "now Ann's avatar watches Ben (%s m, %s along the line)" % (d, al))
    vb = ben.evaluate("s => ASH.golf()._avatarOf(s)", B)
    check(vb and math.hypot(vb['x'] - sb0['ball']['x'], vb['z'] - sb0['ball']['y']) < 1.5 and vb['pose'] != 'idle', "Ben's avatar is back at his ball at address on his turn (%s)" % vb)
    if os.environ.get('SHOTS'):
        os.makedirs(os.environ['SHOTS'], exist_ok=True); time.sleep(1.5); ann.screenshot(path=os.path.join(os.environ['SHOTS'], 'golf_waiting.png'))
    swing3(ben, 'click', 'Ben (mouse clicks)')
    check(wait(ann, "(c => c && c.sn === %d && c.fly)(ASH.golf()._camTarget())" % B, 10), "Ann's camera follows Ben's ball in flight")
    check(wait(ben, "(s => (s.phase === 'aim' || s.phase === 'done') && s.k === 1)(%s)" % GS, 25), "Ben's ball comes to rest")
    def far():
        """the seat that should play: of those not holed, the ball farthest from the pin (ties: the tee order)"""
        sa, sb = st(ann), st(ben); pin = sa['pin']; best, bd = None, -1
        for s in [x for x in sa['order']]:
            S = sa if s == A else sb
            if len(S['card']) > S['hole']: continue
            d = math.hypot(pin[0] - round(S['ball']['x'], 2), pin[1] - round(S['ball']['y'], 2))
            if d > bd + 1e-9: bd, best = d, s
        return best
    time.sleep(0.5); f = far()
    check(f is not None and wait(ann, GS + ".turn === %d" % f, 10) and wait(ben, GS + ".turn === %d" % f, 10), 'both teed off: the farther ball (seat %s) plays next on both games' % f)
    # both balls onto the green, Ann the farther: then putt out in turns
    pin = st(ann)['pin']
    if len(st(ann)['card']) == 0 and len(st(ben)['card']) == 0:
        for pg, d in ((ann, 2.6), (ben, 1.4)):
            ok = pg.evaluate("""d => { const s = ASH.golf()._state(), p = s.pin;
              for (let a = 0; a < 6.3; a += 0.3) { const x = p[0] + Math.cos(a) * d, y = p[1] + Math.sin(a) * d; ASH.golf()._put(x, y); if (ASH.golf()._state().club === 'PT') return true; }
              return false; }""", d)
            check(ok, 'ball put on the green %.1f m from the pin' % d)
        check(wait(ann, GS + ".turn === %d" % A, 10) and wait(ben, GS + ".turn === %d" % A, 10), 'on the green: Ann is farther and putts first on both games')
    shots = 0; agree = True; farOk = True
    while shots < 24:
        sa, sb = st(ann), st(ben)
        if len(sa['card']) > 0 and len(sb['card']) > 0: break
        t0 = time.time()   # the shooter's game knows its new state a moment before the other hears it: wait for both to agree
        while (sa['turn'] != sb['turn'] or sa['turn'] is None) and time.time() - t0 < 5: time.sleep(0.2); sa, sb = st(ann), st(ben)
        if len(sa['card']) > 0 and len(sb['card']) > 0: break
        t = sa['turn']
        if t is None or t != sb['turn']: agree = False; print('   turn disagrees', sa['turn'], sb['turn']); continue
        exp = far()
        if exp != t: farOk = False; print('   turn', t, 'expected the farther', exp)
        pg = ann if t == A else ben; k0 = st(pg)['k']
        d = math.hypot(pin[0] - st(pg)['ball']['x'], pin[1] - st(pg)['ball']['y'])
        pw = min(1, math.sqrt(max(0.05, d * 1.15) / (6 if st(pg)['club'] == 'PT' and d < 4.5 else 22)))
        if not pg.evaluate("o => ASH.golf()._shoot(o)", {'atPin': True, 'power': pw}): time.sleep(0.3); continue
        shots += 1
        wait(pg, "(s => s.k === %d && (s.phase === 'aim' || s.phase === 'done'))(%s)" % (k0 + 1, GS), 25)
        time.sleep(0.4)
    check(agree, 'every putt: both games agree whose turn it is')
    check(farOk, 'every putt: the farther ball plays')
    sa, sb = st(ann), st(ben)
    check(len(sa['card']) == 1 and len(sb['card']) == 1, 'both hole out on hole 1 (Ann %s, Ben %s, %d putts)' % (sa['card'], sb['card'], shots))
    check(wait(ann, "!!document.querySelector('.golfp.card') && !document.querySelector('.golfp.card button')", 8), 'the scorecard shows (no button needed)')
    okA = wait(ann, GS + ".hole === 1", 15); okB = wait(ben, GS + ".hole === 1", 15)
    check(okA and okB, 'both games go to hole 2 together')
    c1a, c1b = st(ann)['card'][0], st(ben)['card'][0]; first = B if c1b < c1a else A
    check(wait(ann, GS + ".turn === %d" % first, 10) and wait(ben, GS + ".turn === %d" % first, 10), 'hole 2: the lower score on hole 1 tees off first (Ann %d, Ben %d -> seat %d)' % (c1a, c1b, first))
    # play it out: Ann 70, Ben 75
    for pg, tot in ((ann, 70), (ben, 75)):
        c1 = st(pg)['card'][0]; left = tot - c1; per = [left // 17 + (1 if i < left % 17 else 0) for i in range(17)]
        for i, n in enumerate(per): pg.evaluate("a => ASH.golf()._hole(a[0], a[1])", [i + 2, n]); time.sleep(0.05)
    check(sum(st(ann)['card']) == 70 and sum(st(ben)['card']) == 75, 'cards: Ann 70, Ben 75')
    check(wait(ann, GS + ".settled", 20) and wait(ben, GS + ".settled", 20), 'both games settle once both have finished')
    ev = ann.evaluate("__pkEv.filter(e => e.e === 'pkcash' || e.e === 'pkout')"); evb = ben.evaluate("__pkEv.filter(e => e.e === 'pkcash' || e.e === 'pkout')")
    print('   ann events', ev); print('   ben events', evb)
    check(wait(ann, COINS + " === 5100", 10), "Ann's bag gets the pot (5100)")
    check(ben.evaluate(COINS) == 4900, 'Ben is down his stake (4900)')
    check(wait(ann, "__pkEv.some(e => e.e === 'pkcash' && e.n === 200)", 10) and wait(ben, "__pkEv.some(e => e.e === 'pkcash' && e.n === 0)", 10),'each game claims its own share (pkcash 200 / 0)')
    # Cal on a phone: alone, touch taps on the swing button
    cal.evaluate("ASH.golf()._begin({ rid: 'c' + Date.now().toString(36), f: 'free', a: 0, m: [[ASH.golf()._me(), 'Cal', '', 1]] })")
    check(wait(cal, GS + " && " + GS + ".phase === 'aim' && " + GS + ".turn === 1", 10), 'Cal tees off alone (his turn)')
    check(cal.evaluate("getComputedStyle(document.querySelector('.golfp.waitm')).display === 'none' && !document.querySelector('.golfp.swing').classList.contains('off')"), 'solo: no waiting line, the meter is live')
    time.sleep(1.0)
    bx = cal.evaluate("(r => [r.left + r.width / 2, r.top + r.height / 2])(document.querySelector('.golfp .swingbtn').getBoundingClientRect())")
    n0 = cal.evaluate("ASH.golf()._presses()")
    cal.touchscreen.tap(bx[0], bx[1]); cal.touchscreen.tap(bx[0], bx[1])
    time.sleep(0.1)
    check(st(cal)['phase'] == 'rise' and cal.evaluate("ASH.golf()._presses()") == n0 + 1, 'touch: a double tap starts the swing once (phase %s)' % st(cal)['phase'])
    t0 = time.time()
    while st(cal)['phase'] == 'rise' and st(cal)['meter'] < 70 and time.time() - t0 < 4: time.sleep(0.02)
    cal.touchscreen.tap(bx[0], bx[1]); cal.touchscreen.tap(bx[0], bx[1])
    time.sleep(0.05)
    check(st(cal)['phase'] == 'fall', 'touch: the power tap sets the power and the tap right after it does not strike (phase %s)' % st(cal)['phase'])
    time.sleep(0.3)
    cal.touchscreen.tap(bx[0], bx[1])
    check(wait(cal, GS + ".phase === 'go' || " + GS + ".phase === 'fly'", 3), 'touch: the strike tap swings (three presses in all: %d)' % (cal.evaluate("ASH.golf()._presses()") - n0))
    check(wait(cal, GS + ".phase === 'fly'", 6), 'touch: the ball flies')
    if os.environ.get('SHOTS'):
        os.makedirs(os.environ['SHOTS'], exist_ok=True); time.sleep(2); cal.screenshot(path=os.path.join(os.environ['SHOTS'], 'golf_tee.png'))
    cal.evaluate("ASH.golf()._quit()")
    check(wait(cal, "!ASH.golf()._state() && !document.querySelector('.lay.golf')", 10), 'leaving the round: the HUD is back')
    check(not errs, 'no page errors ' + str(errs[:3]))
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
