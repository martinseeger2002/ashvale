"""The Ghost Devs live inside Ashvale (2026-10-03): meet all seven in the village and prove
they are there, in their own bodies, answering with their own lines. Shots double as the promotional
still frame; the checks are the point.
Usage: python3 tools/shot_devs_pw.py  (build first: python3 build.py --arcade --three-esm;
server: python3 -m http.server 8731 --bind 127.0.0.1 in ~/ashvale3d)
Shots in tests/shots/devs_*.png"""
import json
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&seed=devs1'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
WALK = '.pfi'
DEVS = [('silas', 'I laid that well'), ('pip', 'You found a thing'), ('pax', 'Every colour'),
        ('modulus', 'I measured this street'), ('latency', 'North gate'), ('symmetry', 'I keep the things'),
        ('auditor', 'Ticket, please')]
zone = json.load(open(os.path.join(ROOT, 'data', 'zone.village.json')))['data']
TILES = zone['tiles']
tile = lambda x, y: TILES[y - zone['origin'][1]][x]
# stand a few tiles off, not shoulder to shoulder: from one tile the player's own back fills the frame
stands = {n['id']: next(((n['x'] + dx, n['y'] + dy) for d in (3, 4, 2) for dx, dy in ((0, d), (0, -d), (d, 0), (-d, 0))
                         if tile(n['x'] + dx, n['y'] + dy) in WALK),
                       next((n['x'] + dx, n['y'] + dy) for dx, dy in ((0, 1), (1, 0), (0, -1), (-1, 0))
                            if tile(n['x'] + dx, n['y'] + dy) in WALK))
          for n in zone['npcs'] if n['id'] in [d[0] for d in DEVS]}
errs, fails = [], []
ok = lambda c, m: (fails.append(m) if not c else print('ok  ', m))


def ev(pg, js): return pg.evaluate(js)


def shot(pg, name):
    p = os.path.join(OUT, 'devs_' + name + '.png'); pg.screenshot(path=p); print('     shot', p)


def sig(pg, key):
    """a fingerprint of the body the page actually built: triangles plus the colours on it. An npc whose
    `look` matches no part is drawn as Tam by models.js, silently - this is what catches that."""
    return tuple(ev(pg, '(() => { const e = ASH.ents.get("n:%s"); let t = 0; const c = new Set();'
                        ' e.root.traverse(o => { if (o.isMesh) {'
                        ' t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;'
                        ' if (o.material && o.material.color) c.add("#" + o.material.color.getHexString()); } });'
                        ' return [Math.round(t), [...c].sort().join(" ")]; })()' % key))


def meet(pg, did, first, stand, dist=9.0, pitch=0.45):
    """stand a few tiles off, Talk-to them (the player walks in first), and put the camera behind us with
    their face in the middle (the camera orbits the player, so the aim is the opposite of the way to them)."""
    ev(pg, 'ASH.teleport(%d, %d)' % stand)
    ev(pg, 'ASH.core.cmd("me", {c:"npc", id:"%s"})' % did)
    for _ in range(90):        # they are walking; the card is only up once the dialog event lands
        if ev(pg, '((document.querySelector(".dlg .nm")||{}).innerText||"").indexOf("%s") === 0' % did.capitalize()):
            break
        pg.wait_for_timeout(100)
    pg.wait_for_timeout(600)
    ev(pg, '(() => { const m = ASH.ents.get("p:me").root.position, n = ASH.ents.get("n:%s").root.position;'
           ' ASH.setCam(Math.atan2(-(n.x - m.x), -(n.z - m.z)), %s, %s); return 1 })()' % (did, pitch, dist))
    pg.wait_for_timeout(1200)
    name = ev(pg, '(document.querySelector(".dlg .nm")||{}).innerText||""')
    line = ev(pg, '(document.querySelector(".dlg .ln")||{}).innerText||""')
    shot(pg, did)
    ok(ev(pg, '!!ASH.ents.get("n:%s")' % did), did + ' stands in the village')
    ok(first in line, '%s says "%s"' % (did, line[:46]))
    ok(did.split('.')[0].capitalize() in name, '%s named on the card: %s' % (did, name))
    ev(pg, 'document.querySelector(".dlg").click()'); pg.wait_for_timeout(300)
    line2 = ev(pg, '(document.querySelector(".dlg .ln")||{}).innerText||""')
    ok(line2 and line2 != line, did + ' has a second line: ' + line2[:40])
    ev(pg, 'document.querySelector(".dlg").click()'); pg.wait_for_timeout(300)


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(4500)
    shot(pg, '00_landing_card')                       # the card a player sees first, now with the seven on it
    ok('Silas' in ev(pg, '(document.querySelector(".help")||{}).innerText||""'), 'the welcome card points at the devs')
    ev(pg, '(() => { const b = document.querySelector(".help .btn"); if (b) b.click(); return 1 })()')
    pg.wait_for_timeout(700)
    for did, first in DEVS:
        meet(pg, did, first, stands[did])
    bodies = {}
    for did, _ in DEVS:
        t, c = sig(pg, did)
        bodies[did] = (t, c)
        print('     %-8s %5d tris, %2d colours' % (did, t, len(c.split())))
    ok(len(set(bodies.values())) == len(DEVS), 'seven different bodies (%d different)' % len(set(bodies.values())))
    tam = sig(pg, 'tam')
    ok(all(b != tam for b in bodies.values()), 'none of the seven is the Tam fallback')
    # and the view a player gets on spawn: Pip two steps down the street from where they appear
    ev(pg, 'ASH.teleport(22, 52)'); ev(pg, 'ASH.setCam(Math.PI, 0.5, 12)')
    pg.wait_for_timeout(1800); shot(pg, '08_the_street')
    print('     console errors:', errs[:10])
    print('ALL OK' if not errs and not fails else 'FAILED: %d fails, %d console errors' % (len(fails), len(errs)))
    for f in fails: print('FAIL', f)
    b.close()
