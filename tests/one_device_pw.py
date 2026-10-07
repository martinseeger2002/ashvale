"""one_device_pw.py - 2026-10-06: one device at a time, and the new-version notice. Local, ?loopback (two tabs on
one origin = two devices; ?loopaddr makes them the same player). Needs: python3 -m http.server 8731 in ~/ashvale3d.
  1. A opens, then B opens as the same player: A stops (notice up, offline, no saving), B plays on
  2. A taps Play here instead: A reloads and B stops
  3. a different player C in the same rooms is not touched
  4. a newer registry on the arcade: the gold banner shows and the game saved"""
import os, sys, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
U = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=one'
fails = []
def check(ok, what): print(('PASS ' if ok else 'FAIL ') + what, flush=True); ok or fails.append(what)
def shown(pg, cls): return pg.evaluate("(() => { const e = document.querySelector('.%s'); return !!e && getComputedStyle(e).display !== 'none'; })()" % cls)
def until(f, s=15):
    t0 = time.time()
    while time.time() - t0 < s:
        if f(): return True
        time.sleep(0.4)
    return False
with sync_playwright() as P:
    b = P.chromium.launch(); ctx = b.new_context(viewport={'width': 1000, 'height': 650}); errs = []
    def page(q):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(U + q, timeout=120000); pg.wait_for_function('window.ASH && ASH.oneDevice', timeout=120000); return pg
    A = page('a&loopaddr=nSAME'); until(lambda: A.evaluate('ASH.oneDevice().room'), 20)
    check(A.evaluate('ASH.oneDevice().room'), 'A joined its one-device room')
    C = page('c&loopaddr=nOTHER'); time.sleep(2)
    B = page('b&loopaddr=nSAME')
    check(until(lambda: shown(A, 'elsewhere')), 'A (older) shows "open on another device" once B opens')
    check(A.evaluate('ASH.oneDevice().stopped') and not A.evaluate('ASH.netHealth().online'), 'A stopped and left the network')
    check(not shown(B, 'elsewhere') and not B.evaluate('ASH.oneDevice().stopped'), 'B (newest) plays on')
    check(not shown(C, 'elsewhere') and not C.evaluate('ASH.oneDevice().stopped'), 'C, another player, is not touched')
    A.click('.elsewhere .btn'); A.wait_for_function('window.ASH && ASH.oneDevice', timeout=120000)
    check(until(lambda: shown(B, 'elsewhere')), 'after Play here instead on A, B stops')
    check(not A.evaluate('ASH.oneDevice().stopped'), 'A plays again')
    # new version: the arcade lists a registry one newer than ours
    v = C.evaluate('ASH.oneDevice().version'); check(v > 0, 'the page knows its registry version (%s)' % v)
    C.route('**/r/inscriptions*', lambda r: r.fulfill(status=200, content_type='application/json', body='[{"json":{"ashvale3d":"registry","loader":1,"version":%d}}]' % (v + 1)))
    C.evaluate('ASH.versionCheck()')
    check(until(lambda: shown(C, 'newver'), 8), 'the new-version banner shows')
    check('refresh your Games tab' in C.evaluate("document.querySelector('.newver').textContent"), 'it says to refresh the Games tab: %r' % C.evaluate("document.querySelector('.newver').textContent")[:140])
    C.screenshot(path='tests/shots/one_device_newver.png'); B.screenshot(path='tests/shots/one_device_elsewhere.png')
    check(not errs, 'no page errors %s' % errs[:3])
    b.close()
print('ALL PASS' if not fails else 'FAILED: %d' % len(fails)); sys.exit(1 if fails else 0)
