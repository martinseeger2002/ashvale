"""[Claude 2026-10-20] The golf swing on a phone (the operator's recording: after SWING the POWER and HIT taps never arrived). In a
phone context (touch): SWING starts the meter; a tap anywhere on the screen sets the power, another anywhere strikes; the ball
flies; a double touch counts once; and every stroke starts facing the pin.  python3 tests/golf_tap_pw.py  (PORT, HEADED=1)"""
import os, time, math
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
PORT = os.environ.get('PORT', '8775')
GS = 'ASH.golf()._state()'
with sync_playwright() as p:
    b = p.chromium.launch(headless=os.environ.get('HEADED') is None, args=['--use-angle=gl'] if os.environ.get('HEADED') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:%s/dist/ashvale3d.html?fresh&nocreator&loopback&seed=gtap&go=637,-117' % PORT, wait_until='domcontentloaded', timeout=120000)
    t0 = time.time()
    while time.time() - t0 < 120 and not pg.evaluate('!!(window.ASH && ASH.golf && ASH.golf())'): time.sleep(.5)
    time.sleep(6); pg.keyboard.press('Escape')
    pg.evaluate("(() => { ASH.me.inv[0] = { id: 'golf_standard', n: 1 }; ASH.give('coins', 100); ASH.golf()._begin({ rid: 'tap1', f: 'free', a: 0, m: [[ASH.golf()._me(), 'M', '', 1]] }); })()")
    time.sleep(4)
    s = pg.evaluate(GS); pin = s['pin'] if 'pin' in s and s['pin'] else pg.evaluate("ASH.golf()._state().pin")
    want = math.atan2(pin[1] - s['ball']['y'], pin[0] - s['ball']['x']) if pin else None
    check(want is not None and abs(math.atan2(math.sin(s['aim'] - want), math.cos(s['aim'] - want))) < 0.01, 'the stroke starts facing the pin')
    bb = pg.locator('.golfp .swingbtn').bounding_box(); bx, by = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
    pg.touchscreen.tap(bx, by); time.sleep(0.15)
    check(pg.evaluate(GS + ".phase") == 'rise', 'SWING starts the meter')
    time.sleep(0.5); pg.touchscreen.tap(195, 420); time.sleep(0.1)
    check(pg.evaluate(GS + ".phase") == 'fall', 'a tap anywhere on the screen sets the power (phase %s)' % pg.evaluate(GS + ".phase"))
    MK = "(() => { const m = document.querySelector('.golfp .swing .meter i:nth-of-type(7)') || document.querySelector('.golfp .gmark'), c = getComputedStyle(m), r = m.getBoundingClientRect(); return [+c.opacity, c.display, r.width, r.left]; })()"
    a = pg.evaluate(MK); time.sleep(0.4); b2 = pg.evaluate(MK)
    check(a[0] > 0.9 and b2[0] > 0.9 and a[1] != 'none' and b2[2] >= 4, 'the marker shows on the way back (opacity %s, width %s)' % (b2[0], b2[2]))
    check(b2[3] - a[3] > 10, 'the marker runs back across the meter (%d px)' % (b2[3] - a[3]))
    t0 = time.time()
    while pg.evaluate(GS + ".meter") > 1 and time.time() - t0 < 4: time.sleep(0.01)
    pg.touchscreen.tap(195, 300); time.sleep(0.2)
    ph = pg.evaluate(GS + ".phase")
    check(ph in ('go', 'fly'), 'a tap anywhere strikes (phase %s)' % ph)
    t0 = time.time()
    while pg.evaluate(GS + ".phase") != 'aim' and time.time() - t0 < 25: time.sleep(0.3)
    s2 = pg.evaluate(GS)
    check(s2['strokes'] == 1 and math.hypot(s2['ball']['x'] - s['ball']['x'], s2['ball']['y'] - s['ball']['y']) > 10, 'the ball flew and came to rest (one stroke)')
    pin2 = s2.get('pin') or pin; w2 = math.atan2(pin2[1] - s2['ball']['y'], pin2[0] - s2['ball']['x'])
    check(abs(math.atan2(math.sin(s2['aim'] - w2), math.cos(s2['aim'] - w2))) < 0.01, 'the next stroke faces the pin again')
    # 2026-10-20: after a swipe to another app and back, his avatar was gone for the rest of the round (the swipe tilted the
    # hidden orbit camera to first person, and first person hides your own avatar)
    pg.evaluate("ASH.setCam(null, 0.02, null)"); time.sleep(1.2)
    seen = pg.evaluate("ASH.golf()._meSeen()")
    check(seen.get('vis') and seen.get('inScene'), 'a camera tilted to first person mid-round still draws my avatar (%s)' % seen)
    pg.evaluate("ASH.setCam(null, 0.45, null)")
    # 2026-10-20 ("hard to click three times for a short putt"): a putt is two taps, start and strength
    ok = pg.evaluate("""(() => { const p = ASH.golf()._state().pin; for (let a = 0; a < 6.3; a += 0.3) { ASH.golf()._put(p[0] + Math.cos(a) * 2.5, p[1] + Math.sin(a) * 2.5); if (ASH.golf()._state().club === 'PT') return true; } return false; })()""")
    time.sleep(1); bb = pg.locator('.golfp .swingbtn').bounding_box(); bx, by = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
    check(ok and pg.locator('.golfp .swingbtn').inner_text().strip() == 'PUTT', 'on the green the button says PUTT')
    pg.touchscreen.tap(bx, by); time.sleep(0.4)
    check(pg.evaluate(GS + ".phase") == 'rise', 'the first tap starts the putt')
    pg.touchscreen.tap(195, 420); time.sleep(0.2)
    ph = pg.evaluate(GS + ".phase")
    check(ph in ('go', 'fly'), 'the second tap putts - no third tap (phase %s)' % ph)
    # 2026-10-20: "If somebody leaves the game, they should be transported back into the clubhouse"
    pg.evaluate("ASH.golf()._quit()"); time.sleep(2)
    me = pg.evaluate("(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); return [S.players[id].x, S.players[id].y]; })()")
    check(me == [635, -118] and not pg.evaluate("!!ASH.golf()._state()"), 'leaving the round puts you inside the clubhouse (%s)' % me)
    check(not errs, 'no page errors %s' % errs[:2])
    b.close()
print('ALL OK' if not fails else '%d FAILED' % len(fails))
