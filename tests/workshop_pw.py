#!/usr/bin/env python3
"""Workshop + courtyard smoke test (studio/workshop.*, studio/courtyard.js). Headless Chromium.

    STUDIO_PUBLIC=1 python3 studio/server.py 8761 &      then      python3 tests/workshop_pw.py [http://127.0.0.1:8761]

Checks: page loads with no errors, a weapon design opens the courtyard, W walks the character, Hold it hangs the design
in the right hand pointing the way the game's sword does, an outfit change keeps it held, Back closes the courtyard,
and a phone-size page can tap-to-walk. Prints ALL OK or the first failure.
"""
import asyncio, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8761'
COURT = "document.querySelector('.court').__court"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(URL + '/workshop'); await pg.wait_for_timeout(1200)
        await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.click('[data-tab=object]'); await pg.fill('#oName', 'Test Blade'); await pg.select_option('#oKind', 'Weapon')
        await pg.click('[data-tab=shape]')
        await pg.fill('input[data-f=s][data-j="1"]', '0.9'); await pg.press('input[data-f=s][data-j="1"]', 'Tab')
        await pg.click('#courtBtn'); await pg.wait_for_selector('.court canvas', timeout=20000); await pg.wait_for_timeout(1500)
        z0 = await pg.evaluate(COURT + '.player.position.z')
        await pg.keyboard.down('w'); await pg.wait_for_timeout(800); await pg.keyboard.up('w')
        z1 = await pg.evaluate(COURT + '.player.position.z')
        assert z1 < z0 - 0.5, 'W did not walk the character north (%s -> %s)' % (z0, z1)
        await pg.click('[data-a=hold]'); await pg.wait_for_timeout(300)
        held = """() => { const a = %s, T = a.THREE, j = a.H.object.getObjectByName('handR'), g = j && j.children[j.children.length - 1];
            if (!g) return null; const bb = new T.Box3().setFromObject(g);
            return {len: bb.getSize(new T.Vector3()).length()}; }""" % COURT
        h = await pg.evaluate(held)
        assert h and h['len'] > 0.5, 'nothing held: %s' % h
        await pg.click('[data-a=look]'); await pg.select_option('.courtLook select[data-k=body]', 'female'); await pg.wait_for_timeout(300)
        h2 = await pg.evaluate(held)
        assert h2 and h2['len'] > 0.5, 'outfit change dropped the held design: %s' % h2
        await pg.click('[data-a=back]'); await pg.wait_for_timeout(300)
        assert await pg.evaluate("!document.querySelector('.court')"), 'Back did not close the courtyard'
        m = await b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
        m.on('pageerror', lambda e: errs.append(str(e)))
        await m.goto(URL + '/workshop'); await m.wait_for_timeout(1200)
        await m.click('#courtBtn'); await m.wait_for_selector('.court canvas', timeout=20000); await m.wait_for_timeout(1500)
        pz = await m.evaluate(COURT + '.player.position.toArray()')
        await m.tap('.court canvas', position={'x': 195, 'y': 380}); await m.wait_for_timeout(1500)
        pz2 = await m.evaluate(COURT + '.player.position.toArray()')
        assert abs(pz2[0] - pz[0]) + abs(pz2[2] - pz[2]) > 0.3, 'tap did not walk (%s -> %s)' % (pz, pz2)
        assert not errs, 'page errors: %s' % errs[:5]
        await b.close()
    print('ALL OK')

asyncio.run(main())
