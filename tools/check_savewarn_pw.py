#!/home/you/.pyenv/versions/3.11.9/bin/python3
"""The welcome card has to admit when it cannot save.

A page drawn inside a feed post's iframe gets no storage bridge (its parent carries no door script) and
no localStorage (sandboxed, no allow-same-origin), so engine.js falls to its memory store and the session
dies with the tab. It used to say so only in the diagnostics panel, which no player opens. So the card
says it - and this checks both halves, because a warning that always shows is as untrue as one that never
does:

  A normal browser tab: localStorage answers, the store is 'browser', the card must NOT warn.
  A sandboxed tab (localStorage throws, as it does in a feed post): the store is 'memory', the card MUST warn.

  python3 build.py --arcade --three-esm
  python3 -m http.server 8731 --bind 127.0.0.1 &        # if it is not already up
  ~/.pyenv/versions/3.11.9/bin/python3 tools/check_savewarn_pw.py
"""
import sys
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=savewarn'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage']
BLOCK = ("Object.defineProperty(window, 'localStorage', { configurable: true,"
         " get() { throw new DOMException('sandboxed', 'SecurityError'); } });")
NEEDS = 'cannot keep your progress'


def card(pg):
    for _ in range(60):
        if pg.evaluate("() => !!(window.ASH && ASH.hud && ASH.store)"):
            break
        pg.wait_for_timeout(500)
    pg.evaluate("() => { ASH.hud.showHelp(true); }")
    pg.wait_for_timeout(400)
    return pg.evaluate("() => document.querySelector('.help') ? document.querySelector('.help').innerText : ''"), \
        pg.evaluate("() => (ASH.store && ASH.store.backend) || ''")


bad = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for label, block, want in (('a browser tab', False, False), ('a sandboxed tab', True, True)):
        pg = b.new_context(viewport={'width': 1100, 'height': 720}).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        if block:
            pg.add_init_script(BLOCK)
        pg.goto(URL, wait_until='domcontentloaded')
        text, backend = card(pg)
        got = NEEDS in text
        print('%-16s store=%-8s warns=%s  (expected %s)' % (label, backend or '?', got, want), flush=True)
        if errs:
            print('   page errors:', errs[:3])
        if got != want:
            bad.append(label + (' warned when it should have stayed quiet' if got else ' stayed quiet while the save was going nowhere'))
        if want and not got:
            print('   card said:', ' '.join(text.split())[:400])
        pg.close()
    b.close()

if bad:
    print('FAILED: ' + '; '.join(bad))
    sys.exit(1)
print('OK: the card warns exactly where a save cannot be kept')
