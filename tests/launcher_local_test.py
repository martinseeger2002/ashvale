"""launcher_local_test.py - boots chain/launcher.html from `release_modular.py --local`: /content/<local id> serves each
module file, /content/<three id> the vendored three.js, /r/*.js the arcade mocks. Checks every module was FETCHED by id."""
import os, json, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
R = '/home/you/ashvale3d'; st = json.load(open(R + '/chain/modules_local.json'))
ids = {m['id']: None for m in st['modules'].values()}
MOD = R + '/dist/modules'
path_of = {}
for key, m in st['modules'].items():
    g, _, n = key.partition('/')
    path_of[m['id']] = MOD + '/' + (('part.' + n + '.json') if g == 'parts' else ('zone.' + n + '.json') if g == 'zones' else (n + '.json') if g == 'data' else (key + '.js'))
for r in st['registries']: path_of[r['id']] = R + '/chain/registry_v%d.json' % r['version']
THREE = '374cfd2b2f114e9da4ade8add495fe8aa0b2b996a710fb538759a956f15f9539'
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def send_file(self, p, ct):
        b = open(p, 'rb').read(); self.send_response(200); self.send_header('Content-Type', ct); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = self.path.split('?')[0]
        if u == '/content/' + THREE: return self.send_file(R + '/vendor/three.module.min.js', 'application/javascript')
        if u.startswith('/content/') and u[9:] in path_of:
            p = path_of[u[9:]]; return self.send_file(p, 'application/json' if p.endswith('.json') else 'application/javascript')
        if u.startswith('/r/inscriptions'): self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b'[]'); return
        if u in ('/r/realtime.js', '/r/swap.js', '/r/storage.js'):
            p = R + '/tests/arcade_mock' + u[2:]
            if os.path.exists(p): return self.send_file(p, 'application/javascript')
            self.send_response(404); self.end_headers(); return
        if u == '/launcher.html': return self.send_file(R + '/chain/launcher.html', 'text/html')
        self.send_response(404); self.end_headers()
srv = socketserver.TCPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1100, 'height': 650}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200]))
    pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/launcher.html'); pg.wait_for_timeout(9000)
    ok = pg.evaluate('!!window.ASH')
    rep = pg.evaluate('window.ASH3D && ASH3D.get && ASH3D.get("$report")') or []
    fetched = sum(1 for r in rep if r[2] == 'fetched'); total = len(rep)
    print('booted', ok, '| modules', total, 'fetched by id', fetched, '| page', [r for r in rep if r[2] != 'fetched'][:4])
    if ok:
        pg.evaluate("document.querySelector('.cc [data-a=done]') && document.querySelector('.cc [data-a=done]').click()"); pg.wait_for_timeout(1500)
        pg.screenshot(path=R + '/tests/shots/launcher_local.png')
    print('errors', [e for e in errs if 'favicon' not in e][:6])
    b.close()
srv.shutdown()
