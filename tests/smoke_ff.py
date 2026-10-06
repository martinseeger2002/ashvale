"""Smoke test in headless Firefox (selenium): load the page, wait, screenshot, report errors.
HOME must be the fxhome (snap Firefox cannot read /tmp). Usage: python3 tests/smoke_ff.py [url] [w] [h] [out.png]"""
import os, sys, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh'
w, h = int(sys.argv[2]) if len(sys.argv) > 2 else 1280, int(sys.argv[3]) if len(sys.argv) > 3 else 800
out = sys.argv[4] if len(sys.argv) > 4 else os.path.expanduser('~/ashvale3d_shots/smoke.png')
os.makedirs(os.path.dirname(out), exist_ok=True)
o = Options(); o.add_argument('-headless'); o.add_argument('--width=%d' % w); o.add_argument('--height=%d' % h)
o.set_preference('webgl.force-enabled', True)
for k, v in [(x.split('=')[0], x.split('=')[1]) for x in os.environ.get('FXPREFS', '').split(',') if x]: o.set_preference(k, v == 'true' if v in ('true', 'false') else v)
d = webdriver.Firefox(options=o, service=Service('/home/you/opt/firefox/geckodriver-wrap'))
try:
    d.set_window_size(w, h)
    d.get(url)
    time.sleep(6)
    print('errors:', d.execute_script('return window.__ashErrors'))
    print('ASH:', d.execute_script('return !!window.ASH && window.ASH.fps()'))
    d.save_screenshot(out)
    print('saved', out)
finally:
    d.quit()
