"""candidate_live.py - boot the LIVE launcher (arcade, guest, headless Chromium) with the CANDIDATE release from dist/:
the arcade's registry lookup (/r/inscriptions) is answered with dist/registry.json as a newer version, unchanged modules
keep their live ids (chain/modules.json), changed ones are served from dist/modules under fake ids. So the launcher, the
baked loader, netretry and the engine run exactly as they will after the release, before anything is inscribed.
  python3 tests/live/candidate_live.py [--save-far] [--as TAG] [--js 'expression to print']
Exit 0 = booted with the candidate registry and no console errors."""
import sys, os, json, hashlib, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ST = json.load(open(os.path.join(HERE, 'chain', 'modules.json')))
REG = json.load(open(os.path.join(HERE, 'dist', 'registry.json')))
MOD = os.path.join(HERE, 'dist', 'modules')
THREE_ID = '374cfd2b2f114e9da4ade8add495fe8aa0b2b996a710fb538759a956f15f9539'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
def file_of(name, group):
    if group == 'parts': return os.path.join(MOD, 'part.' + name + '.json')
    if group == 'zones': return os.path.join(MOD, 'zone.' + name + '.json')
    if group == 'data': return os.path.join(MOD, name + '.json')
    return os.path.join(MOD, name + '.js')
served = {}   # fake id -> (path, content type)
def fill(key, path, e):
    live = ST['modules'].get(key)
    if live and live.get('sha') == sha(path): e['id'] = live['id']; return False
    fid = 'cand' + hashlib.sha256((key + sha(path)).encode()).hexdigest()[:60]
    served[fid] = (path, 'application/json' if path.endswith('.json') else 'application/javascript'); e['id'] = fid; return True
changed = []
for k, e in REG['modules'].items():
    if k == 'three': e.update({'id': THREE_ID, 'v': '0.160.0', 'api': 160, 'kind': 'esm'}); continue
    if k in ('data', 'zones', 'parts'):
        for n, sub in e.items():
            if fill(k + '/' + n, file_of(n, k), sub): changed.append(k + '/' + n)
    elif fill(k, file_of(k, ''), e): changed.append(k)
for k, e in (REG.get('lazy') or {}).items():
    for n, sub in e.items():
        if fill(k + '/' + n, file_of(n, k), sub): changed.append(k + '/' + n)
REG['version'] = ST['registry_version'] + 1000; REG['released'] = 'candidate'
print('candidate: %d changed modules served locally: %s' % (len(changed), ', '.join(changed)))
FAR = "localStorage.setItem('x', '1')"
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
js = sys.argv[sys.argv.index('--js') + 1] if '--js' in sys.argv else None
with sync_playwright() as p:
    AS = sys.argv[sys.argv.index('--as') + 1] if '--as' in sys.argv else None   # --as TAG: signed in as that test account (never ashvale), not a guest
    if AS:
        sys.path.insert(0, os.path.join(HERE, 'tools')); from live_play import PlayerBrowser
        PB = PlayerBrowser(AS); PB._p = p; PB.b = b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={'width': 1100, 'height': 650}, storage_state=PB.state); pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
        pg.goto('https://app.dogecoinarcade.com/join'); pg.wait_for_timeout(3000)
        if pg.locator('#in-tag').count() and pg.locator('#in-tag').is_visible():
            pw = json.load(open('/home/you/cartoon-toolkit/ghost-devs/secret/accounts.json'))[AS]['password']
            pg.fill('#in-tag', AS); pg.fill('#in-pw', pw); pg.click('#enter'); pg.wait_for_timeout(8000)
        errs = []
    else:
        b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 1100, 'height': 650}); pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: m.type == 'error' and 'cloudflareinsights' not in m.text and errs.append(m.text[:200]))
    def lookup(route):
        r = route.fetch(); L = r.json()
        route.fulfill(status=200, headers={'content-type': 'application/json', 'access-control-allow-origin': '*'}, body=json.dumps([{'id': 'candidate', 'json': REG}] + (L or [])))
    def content(route):
        fid = route.request.url.rsplit('/', 1)[-1]
        if fid in served: route.fulfill(status=200, headers={'content-type': served[fid][1], 'access-control-allow-origin': '*'}, body=open(served[fid][0], 'rb').read())
        else: route.fallback()
    ctx.route('**/r/inscriptions?creator=*', lookup)
    ctx.route('**/content/cand*', content)
    t0 = time.time()
    pg.goto('https://app.dogecoinarcade.com/inscriptions/' + ST['launcher'] + '/full')
    g = None
    for _ in range(120):
        for f in pg.frames:
            try:
                if f.evaluate('!!(window.ASH && window.ASH.me && window.ASH3D && ASH3D._values)'): g = f
            except Exception: pass
        if g: break
        pg.wait_for_timeout(1000)
    if not g: print('FAIL: the game did not boot', errs); sys.exit(1)
    print('in the world after %.1f s' % (time.time() - t0))
    time.sleep(4)
    info = g.evaluate("(() => { const v = ASH3D._values, r = v.$registry || {}; return {registry: r.version, released: r.released, lazy: Object.keys((r.lazy || {}).zones || {}), zones: window.ASH.zones ? ASH.zones() : null, early: v.netretry && v.netretry.early}; })()")
    print(json.dumps(info))
    if js: print('js:', g.evaluate(js))
    b.close()
print('console errors:', errs or 'none')
sys.exit(0 if info['registry'] == REG['version'] and not errs else 1)
