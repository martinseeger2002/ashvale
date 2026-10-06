"""Screenshots of the gathering content: the new trees, the back of the mine, the lake's fishing
spots, Tam's fishing tools, and a rod and a pot in use. Nothing here asserts much - it is for the eye.
Usage: python3 tools/shot_nodes_pw.py  (server: python3 -m http.server 8731 in ~/ashvale3d)
Shots in tests/shots/node_*.png"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&seed=nodes1'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
errs = []


def ev(pg, js): return pg.evaluate(js)


def shot(pg, name):
    p = os.path.join(OUT, 'node_' + name + '.png'); pg.screenshot(path=p); print('     shot', p)


def pose(pg, stand, target, pitch=0.32, dist=8.0, settle=1400):
    """stand on `stand` and look at `target`: a gather command turns the player to the node, which is
    exactly what a player does, so the camera lands over their shoulder at the tree or the water."""
    ev(pg, 'ASH.teleport(%d, %d)' % stand)
    ev(pg, 'ASH.core.cmd("me", {c:"gather", x:%d, y:%d})' % target)
    pg.wait_for_timeout(700)
    ev(pg, 'ASH.setCam(ASH.ents.get("p:me").yaw, %s, %s)' % (pitch, dist))
    pg.wait_for_timeout(settle)


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(4500)
    ev(pg, '(() => { const b = document.querySelector(".help .btn"); if (b) b.click(); return 1 })()'); pg.wait_for_timeout(700)
    for s, l in [('hitpoints', 25), ('woodcutting', 22), ('mining', 42), ('fishing', 42)]:
        ev(pg, 'ASH.setLevel("%s", %d)' % (s, l))
    ev(pg, 'ASH.give("hatchet", 1); ASH.give("pickaxe", 1); ASH.give("net", 1); ASH.give("fishing_rod", 1); ASH.give("lobster_pot", 1)')
    pg.wait_for_timeout(600)

    # 1. the wood from the path: maples through the middle, yews further north, willows in the wet
    ev(pg, 'ASH.teleport(24, 20)'); ev(pg, 'ASH.setCam(ASH.ents.get("p:me").yaw, 0.85, 20)'); pg.wait_for_timeout(2200)
    shot(pg, '01_whisperwood')

    # 2. a willow on the north bank of the village lake, close enough to read the hanging crown
    pose(pg, (38, 51), (38, 52), 0.22, 8.5); shot(pg, '02_willow')

    # 3. the mine: the new face in the far corner, past the copper and the tin
    pose(pg, (42, 43), (45, 42), 0.30, 7.0); shot(pg, '03_mine_mithril')

    # 4. the lake from the west bank: the spots show as rings on the water
    pose(pg, (36, 57), (37, 57), 0.42, 11.0); shot(pg, '04_lake_spots')

    # 5. Tam's shelves now carry a rod and a pot
    ev(pg, 'ASH.give("coins", 500); ASH.teleport(9, 44)'); pg.wait_for_timeout(700)
    ev(pg, 'ASH.core.cmd("me", {c:"npc", id:"tam", trade:1})'); pg.wait_for_timeout(2500)
    print('     shop open:', ev(pg, '!!ASH.hud.shopOpen'))
    shot(pg, '05_tam_fishing_tools')
    ev(pg, 'document.querySelector(".shop .x").click()'); pg.wait_for_timeout(400)

    # 6. a trout on the rod, mid-cast, from the west bank looking east over the water
    pose(pg, (36, 57), (37, 57), 0.40, 6.0, 2000); shot(pg, '06_rod_cast')
    print('     chat:', ev(pg, 'document.querySelector(".chat").innerText.split("\\n").slice(-3).join(" | ")'))

    # 7. the pot at the deep end of the east side, looking south over the same water
    pose(pg, (45, 55), (45, 56), 0.50, 6.0, 2400); shot(pg, '07_pot_deep')
    print('     chat:', ev(pg, 'document.querySelector(".chat").innerText.split("\\n").slice(-3).join(" | ")'))
    print('     pack:', ev(pg, 'ASH.me.inv.filter(Boolean).map(s => s.id + (s.n > 1 ? "x" + s.n : "")).join(" ")'))
    print('     console errors:', errs[:10])
    print('ALL OK' if not errs else 'FAILED: %d console errors' % len(errs))
    b.close()
