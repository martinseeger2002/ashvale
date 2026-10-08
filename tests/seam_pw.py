"""seam_pw.py (2026-10-08: "can you fix those 11 seams?"): two players on the two sides of a cut edge of the open globe's
flat net see each other, each drawn beside the other. Local, ?loopback. Needs: python3 -m http.server 8731 in ~/ashvale3d."""
import time
from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
U = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=seam'
fails = 0
def ok(c, m):
    global fails
    fails += not c; print(('PASS ' if c else 'FAIL ') + m)
def until(f, t):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if f(): return True
        except Exception: pass
        time.sleep(1)
    return False
with sync_playwright() as P:
    b = P.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 480, 'height': 300}); errs = []
    def page(tag, go):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(U + tag + '&go=' + go, wait_until='domcontentloaded', timeout=180000)
        until(lambda: pg.evaluate('!!(window.ASH && ASH.me)'), 90); time.sleep(6); pg.evaluate('ASH.hud.showHelp(false)'); return pg
    A = page('a', '-13160,-29280')          # face 1, 40 m short of the seam
    a_at = A.evaluate('[ASH.me.x, ASH.me.y, ASH.core.M.netGap(ASH.me.x, ASH.me.y)]')
    far = A.evaluate('ASH.core.M.netAcross(-13130, -29286)')   # the ground just across, natively (face 10)
    B = page('b', '%d,%d' % (far['x'], far['y']))
    b_at = B.evaluate('[ASH.me.x, ASH.me.y]')
    print('A', a_at, 'B', b_at)
    ok(until(lambda: any(abs(r['at'][0] - a_at[0]) + abs(r['at'][1] - a_at[1]) < 80 for r in A.evaluate('ASH.remotesInfo()')), 60), 'A sees B beside them across the seam: %s' % A.evaluate('ASH.remotesInfo()'))
    ok(until(lambda: any(abs(r['at'][0] - b_at[0]) + abs(r['at'][1] - b_at[1]) < 80 for r in B.evaluate('ASH.remotesInfo()')), 60), 'B sees A beside them across the seam: %s' % B.evaluate('ASH.remotesInfo()'))
    print('errors', errs[:3]); b.close()
print('ALL PASS' if not fails else 'FAILED: %d' % fails)
