"""Screenshots of the five packs: worn (back and 3/4), under platebody/chainmail/cape/arrows, lying on
the ground, and the 32 px inventory icons. Nothing here asserts much - it is for the eye.
Usage: python3 tools/shot_packs_pw.py  (server: python3 -m http.server 8731 in ~/ashvale3d)
Shots in tests/shots/pack_*.png"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(OUT, exist_ok=True)
BASE = 'http://127.0.0.1:8731/tools/models_view.html#'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
errs = []


def shot(pg, name, **kw):
    p = os.path.join(OUT, 'pack_' + name + '.png'); pg.screenshot(path=p, **kw); print('     shot', p)


def view(b, q, dsf=1, w=1440, h=900):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dsf)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(BASE + q); pg.wait_for_timeout(4000)
    return ctx, pg


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for name, q in [('01_worn_back', 'view=packs&back=1&t=0.7'),
                    ('02_worn_threequarter', 'view=packs&t=0.7'),
                    ('03_front_straps', 'view=packs&front=1&t=0.7'),
                    ('04_platebody_back', 'view=packs&back=1&body=body_t5&t=0.7'),
                    ('05_chainmail_cape', 'view=packs&back=1&body=chain_t3&cape=cape_blue&t=0.7'),
                    ('06_arrows_quiver', 'view=packs&back=1&arrows=1&t=0.7')]:
        ctx, pg = view(b, q)
        shot(pg, name)
        print('     ok flag:', pg.evaluate('__ok'), 'errors so far:', len(errs))
        ctx.close()

    # 7. the five packs as they lie in a loot pile; 8. the same five as 32 px inventory icons
    ctx, pg = view(b, 'view=items&only=pack_t1,pack_t2,pack_t3,pack_t4,pack_t5&t=0.7')
    shot(pg, '07_ground')
    shot(pg, '08_icons32', clip={'x': 1150, 'y': 4, 'width': 240, 'height': 46})
    ctx.close()
    ctx, pg = view(b, 'view=items&only=pack_t1,pack_t2,pack_t3,pack_t4,pack_t5&t=0.7', dsf=4, w=1440, h=900)
    shot(pg, '09_icons_zoom', clip={'x': 1150, 'y': 4, 'width': 240, 'height': 46})
    ctx.close()
    print('     console errors:', errs[:10])
    print('ALL OK' if not errs else 'FAILED: %d console errors' % len(errs))
    b.close()
