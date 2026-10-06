"""Screenshots of Elder Maren's quest cast (task 5): the five new monsters next to a plain player for scale, front and 3/4,
each group on its own, the three new head pieces close up, and the mushrooms as ground finds and 32 px icons.
Nothing here asserts much - it is for the eye.
Usage: python3 tools/shot_cast_pw.py  (server: nohup python3 -m http.server 8731 --bind 127.0.0.1 --directory ~/ashvale3d &)
Shots in tests/shots/cast_*.png"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(OUT, exist_ok=True)
BASE = 'http://127.0.0.1:8731/tools/models_view.html#'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
errs = []


def shot(pg, name, **kw):
    p = os.path.join(OUT, 'cast_' + name + '.png'); pg.screenshot(path=p, **kw); print('     shot', p)


def view(b, q, dsf=1, w=1440, h=900):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dsf)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(BASE + q); pg.wait_for_timeout(4000)
    return ctx, pg


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for name, q in [('01_cast_front', 'view=cast&front=1&t=0.7'),
                    ('02_cast_threequarter', 'view=cast&t=0.7'),
                    ('03_goblins_front', 'view=cast&only=player,goblin,goblin_shaman,goblin_chief&front=1&t=0.7'),
                    ('04_goblins_threequarter', 'view=cast&only=player,goblin,goblin_shaman,goblin_chief&t=0.7'),
                    ('05_wraith_lich_front', 'view=cast&only=player,wraith,lich&front=1&t=0.7'),
                    ('06_wraith_lich_threequarter', 'view=cast&only=player,wraith,lich&t=0.7'),
                    ('07_knight_front', 'view=cast&only=player,ash_knight&front=1&t=0.7'),
                    ('08_knight_threequarter', 'view=cast&only=player,ash_knight&t=0.7')]:
        ctx, pg = view(b, q)
        shot(pg, name)
        print('     ok flag:', pg.evaluate('__ok'), 'errors so far:', len(errs))
        ctx.close()

    # 9-11: the three quest head pieces, close up on the wearer's head (3x, cropped around the face)
    for name, who in [('09_head_shaman', 'goblin_shaman'), ('10_head_chief', 'goblin_chief'), ('11_head_lich', 'lich')]:
        ctx, pg = view(b, 'view=cast&only=player,' + who + '&front=1&t=0.7', dsf=3)
        shot(pg, name, clip={'x': 790, 'y': 80, 'width': 380, 'height': 400})
        ctx.close()

    # 12. the mushrooms on the ground; 13-14. the same five as 32 px icons; 15. the one-off kit
    ctx, pg = view(b, 'view=items&only=mushroom,chanterelle,porcini,fly_agaric,glowcap&t=0.7')
    shot(pg, '12_mushrooms_ground')
    shot(pg, '13_mushroom_icons', clip={'x': 1150, 'y': 4, 'width': 240, 'height': 46})
    ctx.close()
    ctx, pg = view(b, 'view=items&only=mushroom,chanterelle,porcini,fly_agaric,glowcap&t=0.7', dsf=4)
    shot(pg, '14_mushroom_icons_zoom', clip={'x': 1150, 'y': 4, 'width': 240, 'height': 46})
    ctx.close()
    ctx, pg = view(b, 'view=items&only=ghostlight,staff_verdant,hat_bonewrap,hat_ashshard,hat_ashcrown&t=0.7')
    shot(pg, '15_kit_ground')
    ctx.close()

    # 16-17: what only a close-up can judge - the wraith's legless hovering hem, the skull face, and the knight's plate tint
    ctx, pg = view(b, 'view=cast&only=wraith,lich&t=2.2', dsf=2)
    shot(pg, '16_wraith_lich_close', clip={'x': 420, 'y': 60, 'width': 600, 'height': 720})
    ctx.close()
    ctx, pg = view(b, 'view=cast&only=ash_knight&t=2.2', dsf=2)
    shot(pg, '17_knight_close', clip={'x': 480, 'y': 40, 'width': 480, 'height': 780})
    ctx.close()
    print('     console errors:', errs[:10])
    print('ALL OK' if not errs else 'FAILED: %d console errors' % len(errs))
    b.close()
