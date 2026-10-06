"""Quick look: load the page in headless Chromium (SwiftShader WebGL), screenshot, print errors.
Usage: python3 tests/pw_smoke.py [query] [w] [h] [name] [js-to-run-after-load]"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(OUT, exist_ok=True)
qs = sys.argv[1] if len(sys.argv) > 1 else 'fresh'
w, h = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1280, 800)
name = sys.argv[4] if len(sys.argv) > 4 else 'smoke'
js = sys.argv[5] if len(sys.argv) > 5 else ''
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': w, 'height': h}); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type in ('error', 'warning') and errs.append(m.type + ' ' + m.text))
    pg.goto(os.environ.get('PAGE', 'http://127.0.0.1:8731/dist/ashvale3d.html') + '?' + qs); pg.wait_for_timeout(5000)
    if js:
        print('js ->', pg.evaluate(js)); pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(OUT, name + '.png'))
    print('fps frames', pg.evaluate('window.ASH && window.ASH.fps()'), 'errors:', errs[:12])
    b.close()
