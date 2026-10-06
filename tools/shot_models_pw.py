#!/home/you/.pyenv/versions/3.11.9/bin/python3
"""shot_models_pw.py - like shot_models.py but with Playwright Chromium (headless Firefox crashes on WebGL here).
Usage: python3 tools/shot_models_pw.py [view=chars ...]"""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tools', 'shots'); os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
views = sys.argv[1:] or ['view=chars', 'view=monsters', 'view=items', 'view=anim&t=0.3', 'view=anim&t=0.55']
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1400, 'height': 800}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    for v in views:
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/tools/models_view.html#{v}'); pg.reload(); pg.wait_for_timeout(3500)
        name = v.replace('view=', '').replace('&', '_').replace('=', '')
        pg.screenshot(path=os.path.join(OUT, name + '.png')); print(name, 'ok' if pg.evaluate('!!window.__ok') else 'NOT LOADED', errs[-3:])
    b.close()
srv.shutdown()
