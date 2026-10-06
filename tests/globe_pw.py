#!/home/you/.pyenv/versions/3.11.9/bin/python3
"""Globe view check (GLOBE.md P0), headless Chromium + SwiftShader, straight from the file (no server needed).
  python3 tools/globe_view.py && tests/globe_pw.py
Checks: loads with no console errors, a click and a phone tap open the cell panel, drag rotates, pinch zooms, the
levels of detail switch, draw calls stay bounded. Shots in tests/shots/globe_*.png: LOOK at every one of them."""
import os, sys, time, json
from playwright.sync_api import sync_playwright

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'playtest', 'globe_view.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []


def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg); (None if c else fails.append(msg))


def shot(pg, name):
    p = os.path.join(OUT, 'globe_' + name + '.png'); pg.screenshot(path=p); print('     shot', p)


def settle(pg, timeout=60):
    """wait until every visible chunk is built and a frame has been drawn"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = pg.evaluate('GV.stats()')
        if s['pendingVisible'] == 0:
            pg.wait_for_timeout(400); return pg.evaluate('GV.stats()')
        pg.wait_for_timeout(200)
    return pg.evaluate('GV.stats()')


def stat_line(s):
    return 'level %s dist %.2f: %d draw calls, %d triangles drawn, %d fine chunks visible, %d coarse, %d built' % (
        s['level'], s['dist'], s['calls'], s['triangles'], s['visFine'], s['visCoarse'], s['builtFine'])


def desktop(p):
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    t0 = time.time(); pg.goto(URL)
    pg.wait_for_function('window.GV && GV.stats().frames > 0', timeout=60000)
    print('     loaded in %.1f s (globe %.0f ms, classes %.0f ms in the page)' % (time.time() - t0, pg.evaluate('GV.stats().msGlobe'), pg.evaluate('GV.stats().msClasses')))
    s = settle(pg); print('     ' + stat_line(s))
    check(s['level'] == 'far' and s['calls'] <= 14, 'whole globe: far level, %d draw calls' % s['calls'])
    shot(pg, '01_whole')
    # click the planet in the middle of the screen -> panel
    pg.mouse.click(640, 400); pg.wait_for_timeout(500)
    txt = pg.evaluate("document.querySelector('.gv .panel').innerText")
    vis = pg.evaluate("getComputedStyle(document.querySelector('.gv .panel')).display")
    check(vis == 'block' and 'Parcel' in txt and 'neighbours' in txt, 'click on a cell opens the panel: ' + txt.replace('\n', ' | ')[:160])
    sel = pg.evaluate('GV.stats().selected'); check(sel == pg.evaluate('GV.pick(640, 400)'), 'selected cell %s = the cell under the click' % sel)
    shot(pg, '02_panel')
    # neighbour chips select that neighbour
    pg.click('.gv .panel .nb span'); pg.wait_for_timeout(300)
    sel2 = pg.evaluate('GV.stats().selected')
    check(sel2 != sel and sel in pg.evaluate('GV.G.neighbors(%d)' % sel2), 'tapping a neighbour chip selects it (%s -> %s)' % (sel, sel2))
    # drag rotates
    lon0 = pg.evaluate('GV.cam.lon')
    pg.mouse.move(500, 400); pg.mouse.down(); pg.mouse.move(650, 420, steps=8); pg.mouse.up(); pg.wait_for_timeout(600)
    check(abs(pg.evaluate('GV.cam.lon') - lon0) > 5, 'mouse drag rotates the planet (lon %.1f -> %.1f)' % (lon0, pg.evaluate('GV.cam.lon')))
    # wheel zooms in -> mid level
    pg.evaluate('GV.select(null)')
    for _ in range(6): pg.mouse.wheel(0, -300); pg.wait_for_timeout(60)
    s = settle(pg); print('     ' + stat_line(s))
    check(s['dist'] < 2.0, 'wheel zooms in (dist %.2f, level %s)' % (s['dist'], s['level']))
    # core region
    pg.evaluate('GV.lookAt(GV.G.classes().coreCenter, 2.4)'); s = settle(pg); print('     ' + stat_line(s)); shot(pg, '03_core_region')
    pg.evaluate('GV.lookAt(GV.G.classes().coreCenter, 1.9)'); s = settle(pg); print('     ' + stat_line(s)); shot(pg, '03b_core_mid')
    edge = pg.evaluate('(function(){const G=GV.G,C=G.classes();let best=-1,bq=-2;const cc=G.center(C.coreCenter);for(let c=0;c<G.count;c++) if(C.codes[c]===1 && G.neighbors(c).some(m=>C.codes[m]!==1 && C.codes[m]!==4)){const p=G.center(c),q=p[0]*cc[0]+p[1]*cc[1]+p[2]*cc[2];if(q>bq){bq=q;best=c;}}return best;})()')
    pg.evaluate('GV.lookAt(%d, 1.35)' % edge); s = settle(pg); print('     ' + stat_line(s))
    check(s['level'] == 'near' and s['pendingVisible'] == 0 and s['calls'] < 120, 'core zoom: near level, %d draw calls' % s['calls'])
    shot(pg, '04_core_near')
    pg.evaluate('GV.lookAt(%d, 1.06)' % edge); s = settle(pg); print('     ' + stat_line(s))
    check(s['builtLines'] > 0, 'cell borders appear when zoomed in (%d border chunks built)' % s['builtLines'])
    shot(pg, '05_core_borders')
    # a pentagon peak, tap it on screen
    pent = pg.evaluate('(function(){const G=GV.G,cc=G.center(G.classes().coreCenter);let best=-1,bq=-2;for(let c=0;c<G.count;c++) if(G.isPentagon(c)){const p=G.center(c),q=p[0]*cc[0]+p[1]*cc[1]+p[2]*cc[2];if(q>bq){bq=q;best=c;}}return best;})()')
    pg.evaluate('GV.lookAt(%d, 1.045)' % pent); s = settle(pg); print('     ' + stat_line(s))
    xy = pg.evaluate('GV.screenOf(%d)' % pent)
    pg.mouse.click(xy['x'], xy['y']); pg.wait_for_timeout(500)
    txt = pg.evaluate("document.querySelector('.gv .panel').innerText")
    check('pentagon' in txt and 'peak' in txt and 'neighbours (5)' in txt, 'tap on the pentagon: ' + txt.replace('\n', ' | ')[:170])
    shot(pg, '06_pentagon')
    pg.evaluate('GV.select(null)'); pg.evaluate('GV.lookAt(%d, 1.18)' % pent); settle(pg); shot(pg, '07_pentagon_peaks')
    # the poles chunk and a diamond seam
    pg.evaluate('GV.lookAt(GV.G.NORTH, 1.12)'); s = settle(pg); shot(pg, '08_north_pole')
    check(not errs, 'desktop: no console errors ' + ('' if not errs else str(errs[:3])))
    stats = pg.evaluate('GV.stats()')
    b.close()
    return stats


def touch(cdp, kind, pts):
    cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})


def phone(p):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(URL); pg.wait_for_function('window.GV && GV.stats().frames > 0', timeout=60000)
    s = settle(pg); print('     phone ' + stat_line(s)); shot(pg, '10_phone_whole')
    cdp = ctx.new_cdp_session(pg)
    # one-finger drag rotates
    lon0 = pg.evaluate('GV.cam.lon')
    touch(cdp, 'touchStart', [(150, 420)])
    for k in range(1, 9): touch(cdp, 'touchMove', [(150 + k * 15, 420)]); pg.wait_for_timeout(16)
    touch(cdp, 'touchEnd', []); pg.wait_for_timeout(700)
    check(abs(pg.evaluate('GV.cam.lon') - lon0) > 5, 'phone: one-finger drag rotates (lon %.1f -> %.1f)' % (lon0, pg.evaluate('GV.cam.lon')))
    # pinch zooms
    d0 = pg.evaluate('GV.cam.dist')
    touch(cdp, 'touchStart', [(195 - 40, 420), (195 + 40, 420)])
    for k in range(1, 11): touch(cdp, 'touchMove', [(195 - 40 - k * 10, 420), (195 + 40 + k * 10, 420)]); pg.wait_for_timeout(16)
    touch(cdp, 'touchEnd', []); pg.wait_for_timeout(500)
    d1 = pg.evaluate('GV.cam.dist')
    check(d1 < d0 - 0.3, 'phone: pinch zooms in (dist %.2f -> %.2f)' % (d0, d1))
    s = settle(pg); print('     phone ' + stat_line(s))
    # tap a cell
    pg.touchscreen.tap(195, 400); pg.wait_for_timeout(600)
    txt = pg.evaluate("document.querySelector('.gv .panel').innerText")
    check('Parcel' in txt, 'phone: tap opens the panel: ' + txt.replace('\n', ' | ')[:120])
    shot(pg, '11_phone_panel')
    pg.evaluate('GV.select(null)'); pg.evaluate('GV.lookAt(GV.G.classes().coreCenter, 1.3)'); s = settle(pg)
    print('     phone ' + stat_line(s)); shot(pg, '12_phone_core')
    check(s['calls'] < 120, 'phone core zoom: %d draw calls' % s['calls'])
    check(not errs, 'phone: no console errors ' + ('' if not errs else str(errs[:3])))
    b.close()


with sync_playwright() as p:
    st = desktop(p)
    phone(p)
    print('     final stats: ' + json.dumps({k: st[k] for k in ('chunks', 'chunkCells', 'builtFine', 'triFineBuilt', 'triCoarse', 'trisPerFullChunk', 'triFineTotalEstimate')}))
print('FAILED: %d' % len(fails) if fails else 'all globe view checks passed')
sys.exit(1 if fails else 0)
