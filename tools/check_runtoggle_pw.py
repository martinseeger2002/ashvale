"""check_runtoggle_pw.py - running can be left on, and Shift does the opposite while it is held.
@yourfirstname (AV16, via a tester 2026-10-03): "run as a toggle; holding shift does the opposite while
held". Today running is per gesture - a double-click upgrades one move (engine.js tapAt) - so every move
after a stop is a walk unless you click twice. This checks the four shapes of the rule at the one place it
is decided, by watching the command that reaches core rather than by measuring how far the character got
on a software-rendered machine:

    toggle off, plain click   -> walk     (what everyone does today, unchanged by default)
    toggle on,  plain click   -> run
    toggle on,  Shift held    -> walk     (the opposite, only while the key is down)
    toggle off, Shift held    -> run
    either,     double-click  -> run      (the operator's 2026-10-01 rule still stands)

  python3 build.py --arcade --three-esm
  python3 -m http.server 8731 --bind 127.0.0.1 &        # if it is not already up
  ~/.pyenv/versions/3.11.9/bin/python3 tools/check_runtoggle_pw.py
"""
import os, sys, json
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=runtoggle'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage']
SPY = ("() => { window.__cmds = []; const o = ASH.core.cmd;"
       " ASH.core.cmd = function (pid, c) { window.__cmds.push(JSON.stringify(c)); return o.apply(this, arguments); }; }")
bad = []


def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c:
        bad.append(msg)


def walk_cmd(pg, shift=False):
    """Click the ground to the right of the character and hand back the walk command that reached core."""
    pg.evaluate("() => { ASH.hud.setTab(null); window.__cmds = []; }")
    pg.wait_for_timeout(150)
    if shift:
        pg.keyboard.down('Shift')
    pos = pg.evaluate("() => ASH.screenOf('me')")
    pg.mouse.click(pos['x'] + 220, pos['y'] + 40)
    pg.wait_for_timeout(350)
    if shift:
        pg.keyboard.up('Shift')
    for j in reversed(pg.evaluate("() => window.__cmds")):
        c = json.loads(j)
        if c.get('c') == 'walk':
            return c
    return {}


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_context(viewport={'width': 1280, 'height': 800}).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until='domcontentloaded')
    for _ in range(60):
        if pg.evaluate("() => !!(window.ASH && ASH.core && ASH.me && !ASH.me.dead)"):
            break
        pg.wait_for_timeout(500)
    pg.evaluate(SPY)
    pg.evaluate("() => { ASH.hud.showHelp(false); }")

    c = walk_cmd(pg)
    check(c.get('run') is False, 'the default is still one click = walk: %s' % json.dumps(c))

    pg.evaluate("() => ASH.hud.setTab('settings')")
    pg.wait_for_timeout(400)
    btn = pg.query_selector('.panel [data-a=runtoggle]')
    check(btn is not None, 'Settings has a Run button')
    if btn:
        label = btn.inner_text()
        check('always' in label.lower() or 'double' in label.lower(), 'and it says which way it is: %r' % label)
        btn.click(); pg.wait_for_timeout(300)
        c = walk_cmd(pg)
        check(c.get('run') is True, 'with the toggle on, one click runs: %s' % json.dumps(c))
        c = walk_cmd(pg, shift=True)
        check(c.get('run') is False, 'with the toggle on, holding Shift walks: %s' % json.dumps(c))
        pg.evaluate("() => ASH.hud.setTab('settings')")
        pg.wait_for_timeout(300)
        pg.click('.panel [data-a=runtoggle]'); pg.wait_for_timeout(250)
        c = walk_cmd(pg, shift=True)
        check(c.get('run') is True, 'with the toggle off, holding Shift runs: %s' % json.dumps(c))
        pos = pg.evaluate("() => ASH.screenOf('me')")
        pg.mouse.click(pos['x'] + 220, pos['y'] + 40)
        pg.wait_for_timeout(80)
        pg.mouse.click(pos['x'] + 220, pos['y'] + 40)
        pg.wait_for_timeout(350)
        last = [json.loads(j) for j in pg.evaluate("() => window.__cmds") if json.loads(j).get('c') == 'walk']
        check(last and last[-1].get('run') is True, 'a double-click still runs: %s' % json.dumps(last[-1] if last else {}))
        saved = pg.evaluate("() => ASH.store.get('ashvale3d.settings.v1')") or ''
        check('runToggle' in saved, 'the choice is saved for next time: %s' % saved[:120])
    pg.close(); b.close()

if errs:
    print('   page errors:', errs[:3]); bad.append('page errors: %s' % errs[:3])
if bad:
    print('FAILED: %d' % len(bad)); sys.exit(1)
print('OK: one click runs exactly when the toggle says it should, and Shift flips it')
