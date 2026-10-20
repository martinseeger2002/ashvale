"""[Claude 2026-10-19] The Lily Run camera keeps the frog on the screen (the operator: on a log it went off the edge of his phone's
screen and he could not hop it home). On a phone-sized portrait page, set the frog on a log near each side of each river row
and let the current carry it toward the edge: the frog stays inside the screen the whole ride.
  python3 tests/lilyrun_camera_pw.py   (server: python3 tests/serve.py 8731 in the tree)"""
import os, time, json, base64
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
PORT = os.environ.get('PORT', '8731')
FX = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'pet_frogs.json'))); ID = {v['number']: k for k, v in FX.items()}
def arcade(route):
    u = route.request.url; i = u.rsplit('/', 1)[-1]
    if i not in FX: return route.continue_()
    if '/r/collection-item/' in u: return route.fulfill(status=200, content_type='application/json', body=json.dumps({k: v for k, v in FX[i].items() if k not in ('png', 'type')} | {'inscription': i}))
    return route.fulfill(status=200, content_type=FX[i]['type'], body=base64.b64decode(FX[i]['png']))
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); ctx.route('**/r/collection-item/doge/*', arcade); ctx.route('**/content/*', arcade)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:%s/dist/ashvale3d.html?fresh&nocreator&loopback&seed=cam&go=354,99&pet=frog:4242:%s' % (PORT, ID[4242]), wait_until='domcontentloaded', timeout=120000)
    t0 = time.time()
    while time.time() - t0 < 90 and not pg.evaluate('!!(window.ASH && ASH.lily && ASH.lily())'): time.sleep(0.5)
    pg.evaluate("ASH.pet()._load('nCam')"); time.sleep(3); pg.keyboard.press('Escape')
    pg.evaluate("(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); ASH.core.cmd(id, { c: 'npc', id: 'bram' }); })()")
    for _ in range(16):
        time.sleep(0.6)
        if pg.evaluate("!!document.querySelector('.dlg [data-pick=play]')"): pg.evaluate("document.querySelector('.dlg [data-pick=play]').click()"); break
        pg.evaluate("document.querySelector('.dlg') && document.querySelector('.dlg').click()")
    t0 = time.time()
    while time.time() - t0 < 30 and not pg.evaluate("ASH.lily()._state().playing"): time.sleep(0.5)
    check(pg.evaluate("ASH.lily()._state().playing"), 'playing on a phone-sized page')
    worst = 0; rides = 0
    for row in (8, 9, 11, 12):
        for start in (3, 9):
            pg.evaluate("ASH.lily()._put(%d, %d)" % (start, row)); time.sleep(1.2)   # a test teleport: let the camera glide over first (play never jumps sideways)
            for _ in range(10):
                st = pg.evaluate("ASH.lily()._state().g"); nd = pg.evaluate("ASH.lily()._ndc()")
                if st['dead'] or st['over']: break
                if nd and not st['dead']: worst = max(worst, abs(nd[0])); rides += 1
                time.sleep(0.2)
            pg.keyboard.press('Escape') if False else None
            pg.evaluate("ASH.lily()._state().g && ASH.lily()._state().g.l < 1 ? 0 : 0")
    check(rides >= 8 and worst < 0.92, 'riding toward the edge, the frog stays on the screen (widest %.2f of the half-width, %d samples)' % (worst, rides))
    check(not errs, 'no page errors ' + str(errs[:2]))
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
