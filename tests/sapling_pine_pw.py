"""A planted sapling is the same pine as the woods, small, and other players can receive it.
   After an hour it is a taller pine that does not match the pines around it, and it stays.
   Serves nothing itself. The page is http://127.0.0.1:8099/ashvale3d.html
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8099/ashvale3d.html?fresh&nocreator&seed=saplingpine'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []

def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c:
        fails.append(msg)

def shot(pg, name):
    p = os.path.join(OUT, 'pine_' + name + '.png')
    data = pg.context.new_cdp_session(pg).send('Page.captureScreenshot', {'format': 'png'})
    import base64
    open(p, 'wb').write(base64.b64decode(data['data']))
    print('     shot', p)

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.set_default_timeout(60000)
        pg.on('pageerror', lambda e: fails.append('PAGEERROR ' + str(e)))
        pg.goto(URL)
        pg.wait_for_function('window.ASH && ASH.me && ASH.core', timeout=30000)
        pg.wait_for_timeout(1500)
        if pg.evaluate('!!document.querySelector(".help")'):
            pg.evaluate('document.querySelector(".help .btn").click()')
            pg.wait_for_timeout(400)
        spot = pg.evaluate('''() => {
          const c = ASH.core;
          ASH.give('sapling', 2);
          const x = 168, y = -80;
          if (c.M.tileAt(x, y) === '.' && c.canPlant(ASH.me, x, y)) return { x, y, pine: [164, -88], n: 1 };
          return null;
        }''')
        print('spot', spot)
        check(spot is not None, 'open grass beside a pine')
        if not spot:
            b.close()
            print(str(len(fails)) + ' FAILED')
            raise SystemExit(1)
        pg.evaluate('''([x, y]) => {
          const spots = [[0, 4], [0, -4], [4, 0], [-4, 0], [3, 3]];
          let sx = x, sy = y + 4;
          for (const [dx, dy] of spots) if (!ASH.core.M.blocked(x + dx, y + dy)) { sx = x + dx; sy = y + dy; break; }
          ASH.teleport(sx, sy);
          ASH.core.cmd(ASH.pid, { c: 'plant', x, y });
          ASH.setCam(0.15, 1.05, 8);
        }''', [spot['x'], spot['y']])
        pg.wait_for_function('''([x, y]) => ASH.core.plantYoung(x, y)''', arg=[spot['x'], spot['y']])
        pg.wait_for_timeout(400)
        young = pg.evaluate('''([x, y]) => {
          const c = ASH.core, i = c.idx(x, y), pl = c.S.plants[i];
          let mesh = null;
          ASH.scene.traverse(o => { if (o.userData && o.userData.pine === 'P' && o.userData.young && o.position && Math.abs(o.position.x - (x + 0.5)) < 0.2) mesh = { scale: o.userData.scale, cones: o.children.filter(ch => ch.geometry && ch.geometry.type === 'ConeGeometry').length }; });
          const z = c.zoneOf(x, y);
          const friend = { saw: false };
          return { planted: !!(pl && !pl.grown), young: c.plantYoung(x, y), mesh, snap: c.plantSnap(z).some(r => r[0] === x && r[1] === y && r[3] === 0) };
        }''', [spot['x'], spot['y']])
        print('young', young)
        check(young['planted'] and young['young'] and young['snap'], 'the sapling is planted and listed for other players')
        check(young['mesh'] and young['mesh']['cones'] == 3 and abs(young['mesh']['scale'] - 0.5) < 0.01, 'the sapling is a small three-cone pine')
        shot(pg, 'sapling')
        pg.evaluate('ASH.core.S.t += 6000')
        pg.wait_for_timeout(1200)
        grown = pg.evaluate('''([x, y]) => {
          const c = ASH.core;
          const i = c.idx(x, y), pl = c.S.plants[i], nd = c.nodeAt(i);
          let mesh = null;
          ASH.scene.traverse(o => { if (o.userData && o.userData.pine === 'P' && !o.userData.young && o.position && Math.abs(o.position.x - (x + 0.5)) < 0.2) mesh = { scale: +o.userData.scale.toFixed(3), lean: +o.rotation.z.toFixed(3), cones: o.children.filter(ch => ch.geometry && ch.geometry.type === 'ConeGeometry').length }; });
          const near = [];
          for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
            if (!dx && !dy) continue;
            const q = c.nodeAt(c.idx(x + dx, y + dy));
            if (q && q.kind === 'P') near.push(q.x + ',' + q.y);
          }
          return { grew: !!(pl && pl.grown), grown: !!(pl && pl.grown), node: nd && nd.kind, blocked: c.M.blocked(x, y), mesh, near: near.length, up: c.plantYoung(x, y) };
        }''', [spot['x'], spot['y']])
        print('grown', grown)
        check(grown['grew'] and grown['grown'] and not grown['up'], 'the hour passes and the sapling becomes a tree that stays')
        check(grown['node'] == 'P' and grown['blocked'], 'the grown tree is a pine on the land, and you cannot walk through it')
        check(grown['mesh'] and grown['mesh']['cones'] == 3 and grown['mesh']['scale'] > 1.4, 'the grown pine uses the same cones and stands taller than the woods')
        shot(pg, 'grown')
        b.close()
    print(str(len(fails)) + ' FAILED' if fails else 'all passed')
    raise SystemExit(1 if fails else 0)

if __name__ == '__main__':
    main()
