"""render_icons.py KEY [KEY...] - the Bank's fallback icon for an item that has no Armoury piece to copy: the game page's own
model renderer (ASH.models.icon) through headless Chromium, written to chain/bank/icons/<key>.png (what bank.py mint() reads).
Needs the dev server: python3 -m http.server 8731 in ~/ashvale3d. 2026-10-12: flint, snare, tomahawk, dragon_cape."""
import os, time, base64, sys, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'chain', 'bank', 'icons'); KEYS = sys.argv[1:]   # this tree's chain/bank/icons (~/ashvale3d's in the main tree)
os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 720, 'height': 480})
    pg.goto('http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=icons', wait_until='domcontentloaded', timeout=120000)
    t0 = time.time()
    while time.time() - t0 < 90:
        try:
            if pg.evaluate('!!(window.ASH && ASH.models && ASH.models.icon)'): break
        except Exception: pass
        time.sleep(0.5)
    for k in KEYS:
        url = pg.evaluate('k => { try { return ASH.models.icon(k, 128) || null; } catch (e) { return "error: " + e; } }', k)
        if not url or str(url).startswith('error') or not str(url).startswith('data:image/png;base64,'): print(k, 'NO ICON', str(url)[:80]); continue
        data = base64.b64decode(url.split(',', 1)[1]); open(os.path.join(OUT, k + '.png'), 'wb').write(data); print(k, 'icon', len(data), 'bytes')
    b.close()
