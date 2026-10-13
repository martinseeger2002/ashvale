"""The loading screen (2026-10-13: "displayed until the game loads ... add a progress bar"). netretry.js, the first
module, puts up #ashload; the game claims it (openStore/start) and closes it after its first frame (ASH_LOAD.done); a
page that never starts the game (the Atlas) has it closed 3 s after the modules are in. Exercised with the real
src/netretry.js on a page with no WebGL, so it runs anywhere.   python3 tests/loadscreen_pw.py  (http.server 8731)"""
import os, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
SRC = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'netretry.js')).read()
def page(home=None):
    pre = ('window.ASH3D_HOME = %r;' % home) if home else ''
    return ('<!doctype html><html><head><meta charset="utf-8"><style>#boot{position:fixed;inset:0}</style></head><body><div id="ash"></div><div id="boot">Loading…</div>'
            '<script>' + pre + 'window.ASH3D = { LOADER: 1, _defs: {}, define: function (n, m, f) { this._defs[n] = { meta: m, factory: f }; } };</script>'
            '<script>' + SRC.replace('</script', '<\\/script') + '</script></body></html>')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-gpu']); errs = []
    def fresh(home=None):
        pg = b.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('http://ash.test/', lambda r: r.fulfill(body=page(home), content_type='text/html'))
        pg.route('http://ash.test/content/**', lambda r: r.fulfill(body='{}', content_type='application/json'))
        pg.route('http://ash.test/r/**', lambda r: r.fulfill(body='[{"json": {"ashvale3d": "registry", "version": 9, "modules": {"a": {"id": "1"}, "b": {"id": "2"}, "data": {"x": {"id": "3"}, "y": {"id": "4"}}}}}]', content_type='application/json'))
        pg.goto('http://ash.test/'); return pg
    S = lambda pg: pg.evaluate("(() => { const r = document.getElementById('ashload'); return r ? { title: r.querySelector('h1').textContent, say: r.querySelector('.say').textContent, w: parseFloat(r.querySelector('.fill').style.width) || 0, op: getComputedStyle(r).opacity } : null; })()")
    pg = fresh(); time.sleep(0.3); s = S(pg)
    check(s and s['title'].lower() == 'ashvale' and 'Loading Ashvale\u2026' in s['say'] and s['w'] > 0, 'the loading screen is up, Ashvale on it, the bar started: %s' % s)
    check(pg.evaluate("getComputedStyle(document.getElementById('boot')).visibility") == 'hidden', "the launcher's own text is hidden under it")
    for i in range(4): pg.evaluate("fetch('/content/%d')" % i)
    time.sleep(0.5); s2 = S(pg)
    check(s2['w'] > s['w'] and '4 of 4' in s2['say'], 'the module downloads move the bar (%.0f%% -> %.0f%%, "%s")' % (s['w'], s2['w'], s2['say']))
    pg.evaluate("ASH_LOAD.claimed = true; ASH_LOAD.set(0.75, 'Loading the land around you… 1 of 9'); window.ASH3D._values = {}")
    time.sleep(4); s3 = S(pg)
    check(s3 and s3['w'] >= 75 and 'land' in s3['say'], 'claimed by the game it stays up through the loading (%s)' % s3)
    pg.evaluate("ASH_LOAD.set(0.2, 'never backwards')"); check(S(pg)['w'] >= 75, 'the bar never goes backwards')
    pg.evaluate("ASH_LOAD.done()"); time.sleep(1.2)
    check(S(pg) is None, 'the first frame drawn: done() takes the screen away')
    pg2 = fresh(); pg2.evaluate("window.ASH3D._values = {}"); time.sleep(5)
    check(S(pg2) is None, 'a page that never starts the game (the Atlas) has it closed 3 s after the modules are in')
    pg3 = fresh('ziibiing'); time.sleep(0.3); s = S(pg3)
    check(s and s['title'].lower() == 'ziibiing' and 'Loading Ziibiing' in s['say'], 'the Ziibiing launcher says Ziibiing: %s' % s)
    pg3.evaluate("ASH_LOAD.claimed = true; document.getElementById('boot').textContent = 'ASHVALE could not start: test'"); time.sleep(0.3)
    check('could not start' in S(pg3)['say'], 'a start that fails shows its reason on the loading screen')
    if os.environ.get('SHOTS'): pg3.screenshot(path='tests/shots/loading_screen_error.png')
    pg.close()
    pg4 = fresh(); time.sleep(0.2); pg4.evaluate("ASH_LOAD.claimed = true; ASH_LOAD.set(0.42, 'Loading Ashvale… 120 of 295')"); time.sleep(0.4)
    if os.environ.get('SHOTS'): pg4.set_viewport_size({'width': 390, 'height': 760}); time.sleep(0.2); pg4.screenshot(path='tests/shots/loading_screen.png')
    check(not errs, 'no page errors (%s)' % errs[:2])
    b.close()
print('ALL OK' if not fails else '%d FAILED' % len(fails)); sys.exit(1 if fails else 0)
