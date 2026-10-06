"""shot_models.py - screenshots of tools/models_view.html views (chars, monsters, items, anim at several times) for review."""
import os, sys, time, threading, http.server, socketserver, functools
os.environ['HOME'] = '/home/you/cartoon-toolkit/ghost-devs/tools/fxhome'
from selenium import webdriver
from selenium.webdriver.firefox.service import Service
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tools', 'shots'); os.makedirs(OUT, exist_ok=True)
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
o = webdriver.FirefoxOptions(); o.add_argument('-headless'); o.set_preference('webgl.force-enabled', True); o.set_preference('webgl.disable-fail-if-major-performance-caveat', True); d = webdriver.Firefox(service=Service('/home/you/opt/firefox/geckodriver-wrap'), options=o); d.set_window_size(1200, 700)
views = sys.argv[1:] or ['view=chars', 'view=monsters', 'view=items', 'view=anim&t=0.3', 'view=anim&t=0.5']
try:
    for v in views:
        d.get(f'http://127.0.0.1:{srv.server_address[1]}/tools/models_view.html#{v}'); time.sleep(5)
        ok = d.execute_script('return !!window.__ok'); logs = d.execute_script('return window.__events ? window.__events.slice(0,8) : null')
        name = v.replace('view=', '').replace('&', '_').replace('=', '')
        d.save_screenshot(os.path.join(OUT, name + '.png')); print(name, 'ok' if ok else 'NOT LOADED', logs)
finally: d.quit(); srv.shutdown()
