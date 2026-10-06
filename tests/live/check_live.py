"""check_live.py [launcher txid] - after a release: open the LIVE launcher on the arcade (as a guest, headless Chromium)
and print which registry version and which module versions it actually loaded. Compare with chain/modules.json.
  PLAYWRIGHT_BROWSERS_PATH=/home/you/.cache/ms-playwright python3 tests/live/check_live.py
Exit code 0 = it booted and loaded the newest registry in chain/modules.json; 1 = something is off (read the output)."""
import sys, os, json, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ST = json.load(open(os.path.join(HERE, 'chain', 'modules.json')))
TX = sys.argv[1] if len(sys.argv) > 1 else ST['launcher']
WANT = ST['registry_version']
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1100, 'height': 650}); errs = []
    pg.on('console', lambda m: m.type == 'error' and 'cloudflareinsights' not in m.text and errs.append(m.text[:160]))
    pg.goto('https://app.dogecoinarcade.com/inscriptions/' + TX + '/full')
    g = None
    for _ in range(60):
        for f in pg.frames:
            try:
                if f.evaluate('!!(window.ASH && window.ASH3D && ASH3D._values)'): g = f
            except Exception: pass
        if g: break
        pg.wait_for_timeout(1500)
    if not g: print('FAIL: the game did not boot', errs); sys.exit(1)
    info = g.evaluate("(() => { const v = ASH3D._values, r = v.$registry || {}; return {registry: r.version, released: r.released, report: v.$report}; })()")
    b.close()
print('registry loaded: v%s (released %s); newest in chain/modules.json: v%s' % (info['registry'], info['released'], WANT))
for name, ver, how in info['report'] or []: print('  %-16s v%-4s %s' % (name, ver, how))
print('console errors:', errs or 'none')
sys.exit(0 if info['registry'] == WANT and not errs else 1)
