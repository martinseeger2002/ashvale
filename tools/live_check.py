#!/home/you/.pyenv/versions/3.11.9/bin/python3
"""Ask the LIVE launcher page (the one on chain) which modules it actually pulled in, and whether the game starts.
The launcher bakes a registry and then looks for a newer one by @ashvale, so this is the only check that answers
"did the release land where players look" - chain/modules.json can say v3 while the page still runs the baked one.
Usage: tools/live_check.py [launcher-id]"""
import sys
from playwright.sync_api import sync_playwright

ID = sys.argv[1] if len(sys.argv) > 1 else 'c879bc1f5f3cfc1300b9f24252a47ce395028dc65fc78a0ab3004a9f272649f5'
URL = 'https://app.dogecoinarcade.com/content/' + ID + '?nocreator'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage']
errs = []

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_context(viewport={'width': 1280, 'height': 800}).new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(URL, wait_until='domcontentloaded')
    for _ in range(60):                                   # the launcher fetches the registry, then 100+ modules
        if pg.evaluate("() => !!window.ASH && !!window.ASH3D && !!ASH3D._defs && Object.keys(ASH3D._defs).length > 5"):
            break
        pg.wait_for_timeout(1000)
    print('booted:', pg.evaluate("() => !!window.ASH"))
    print('modules the page defined:', sorted(pg.evaluate("() => Object.keys(ASH3D._defs)")))
    print('three:', pg.evaluate("() => ASH3D._defs.three ? ASH3D._defs.three.meta.api : null"))
    print('weather module present:', pg.evaluate("() => !!(ASH3D._defs.weather)"))
    print('weather api:', pg.evaluate("() => { try { const W = ASH3D.get('weather'); return W && W.createWeather ? 'createWeather' : String(Object.keys(W)); } catch (e) { return 'GET FAILED ' + e.message; } }"))
    print('in the game:', pg.evaluate("() => ({ calls: ASH.info().calls, tris: ASH.info().tris, geos: ASH.info().geos })"))
    # stand in the village square with the shop roofs beyond it and make it snow, the way the shot harness does, so the
    # picture is of the weather module reading its own inscription - not of the character screen it started behind.
    pg.evaluate("() => { const b = document.querySelector('.help .btn'); if (b) b.click(); }")
    pg.wait_for_timeout(1200)
    pg.evaluate("() => { ASH.teleport(22, 50); }")
    pg.wait_for_timeout(2500)
    pg.evaluate("() => { ASH.setCam(3.14, 0.30, 12.0); ASH.weather('snow', 100, 100000); }")
    pg.wait_for_timeout(9000)                                  # the module's 4 s cross-fade, twice over, at ~10 fps
    print('weather hook:', pg.evaluate("() => { try { const W = ASH3D.get('weather'); return typeof ASH.weather; } catch (e) { return 'THREW ' + e.message; } }"))
    # the fog numbers are the module's own snow look (10/30 and a pale blue), so they say the module is driving the
    # scene even if a panel happens to be in front of the camera
    print('scene fog:', pg.evaluate("() => [ASH.scene.fog.near, ASH.scene.fog.far, ASH.scene.background.getHexString()]"))
    print('fps:', pg.evaluate("() => ASH.fps()"))
    pg.screenshot(path='/home/you/ashvale3d/tests/shots/live_launcher.png')
    print('console errors:', errs[:8])
    b.close()
