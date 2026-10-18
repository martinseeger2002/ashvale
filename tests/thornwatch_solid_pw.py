#!/usr/bin/env python3
"""tests/thornwatch_solid_pw.py - nothing in Thornwatch Camp, the Red Moor or the Hollow Den can be walked through (2026-10-18:
"make sure the players don't walk through objects and buildings").

Two checks, in the real game page:
  1. every tile under a solid piece is blocked in the game's own map (core M.blocked), for all of them: the list comes from the zone tool
     (TW_SOLIDS=... node tools/thornwatch/make_thornwatch.js), so the tiles are worked out from the pieces' parts, not typed here;
  2. a walk straight through the big pieces (the pavilion, the wagons, the forge, the tents, the healer's table, the skull stones, the den's
     braziers): the player is put on one side and told to walk to the other, and no step of the way may land on the piece.
Usage (server: python3 tests/serve.py 8763 from the repo):
    TW_SOLIDS=/tmp/solids.json node tools/thornwatch/make_thornwatch.js && python3 build.py
    python3 -u tests/thornwatch_solid_pw.py /tmp/solids.json [port]"""
import json, sys
from playwright.sync_api import sync_playwright

SOL = json.load(open(sys.argv[1])); PORT = sys.argv[2] if len(sys.argv) > 2 else '8763'
URL = 'http://127.0.0.1:%s/dist/ashvale3d.html?fresh&nocreator&seed=solid1' % PORT
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage']
WALKS = ['pavilion', 'covered_wagon', 'furnace', 'ridge_tent', 'herb_table', 'skull_stone', 'tripod_brazier', 'handcart', 'archery_butt', 'stall']

fails = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 960, 'height': 600})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_function('window.ASH && ASH.me', timeout=120000); pg.wait_for_timeout(1500)
    pg.evaluate("for (const s of ['attack','strength','defence']) ASH.setLevel(s, 90); ASH.setLevel('hitpoints', 99)")
    # 1. every footprint tile blocked
    n = 0
    for o in SOL:
        pg.evaluate('ASH.teleport(%d, %d)' % (o['x'], o['y'] + 3)); pg.wait_for_timeout(120)
        open_ = pg.evaluate('(T) => T.filter(([x, y]) => !ASH.core.M.blocked(x, y))', o['tiles']); n += len(o['tiles'])
        if open_: fails.append('%s %s at %d,%d: open tiles %s' % (o['zone'], o['k'], o['x'], o['y'], open_))
    print('footprint tiles checked: %d in %d pieces, %d pieces with open tiles' % (n, len(SOL), len(fails)))
    # 2. walk straight through the big ones, from every side
    tested = 0
    for o in SOL:
        if o['k'] not in WALKS: continue
        xs = [t[0] for t in o['tiles']]; ys = [t[1] for t in o['tiles']]; cx = (min(xs) + max(xs)) // 2; cy = (min(ys) + max(ys)) // 2
        foot = set(map(tuple, o['tiles']))
        for (ax, ay, bx, by) in ((min(xs) - 2, cy, max(xs) + 2, cy), (cx, min(ys) - 2, cx, max(ys) + 2)):
            free = pg.evaluate('([a, b, c, d]) => !ASH.core.M.blocked(a, b) && !ASH.core.M.blocked(c, d)', [ax, ay, bx, by])
            if not free: continue
            pg.evaluate('ASH.teleport(%d, %d)' % (ax, ay)); pg.wait_for_timeout(400)
            pg.evaluate('ASH.core.cmd(ASH.pid, {c: "walk", x: %d, y: %d})' % (bx, by))
            seen = []
            for _ in range(60):
                pg.wait_for_timeout(150); at = tuple(pg.evaluate('[ASH.me.x, ASH.me.y]')); seen.append(at)
                if at == (bx, by): break
            bad = [s for s in seen if s in foot]
            tested += 1
            if bad: fails.append('walked THROUGH %s at %d,%d: steps %s' % (o['k'], o['x'], o['y'], bad))
            elif seen[-1] != (bx, by): print('  note: %s at %d,%d - did not arrive (%s), walked round as far as %s' % (o['k'], o['x'], o['y'], (bx, by), seen[-1]))
    print('walks through pieces: %d' % tested)
    print('page errors:', errs[:3])
    b.close()
print('\n'.join(fails) if fails else 'ALL SOLID')
sys.exit(1 if fails else 0)
