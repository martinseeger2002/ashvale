"""Show the sapling rules in the live page: a path, a town, a person, and a door refuse a shoot; open grass takes one.
Usage: python3 tests/sapling_place_pw.py
Serves nothing itself. The page is http://127.0.0.1:8099/ashvale3d.html
"""
import os, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8099/ashvale3d.html?fresh&nocreator&seed=saplingplace'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []

def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c:
        fails.append(msg)

def shot(pg, name):
    p = os.path.join(OUT, 'sapling_' + name + '.png')
    pg.screenshot(path=p)
    print('     shot', p)

def ev(pg, js):
    return pg.evaluate(js)

FIND = r'''
() => {
  const c = ASH.core, me = ASH.me;
  const tile = (x, y) => c.M.tileAt(x, y);
  let road = null, town = null;
  for (let y = 40; y < 64 && (!road || !town); y++) for (let x = 0; x < 48; x++) {
    if (!road && tile(x, y) === 'p' && !c.M.blocked(x, y)) road = [x, y];
    if (!town && tile(x, y) === '.' && !c.M.blocked(x, y) && !c.nodeAt(c.idx(x, y))) town = [x, y];
  }
  let open = null;
  for (let y = -67; y <= -35 && !open; y++) for (let x = 181; x <= 213; x++) {
    if (tile(x, y) === '.' && c.canPlant(me, x, y)) open = [x, y];
  }
  return { road, town, vael: [197, -45], door: [48, 62], open };
}
'''

def stand_and_plant(pg, xy):
    pg.evaluate('''
      ([x, y]) => {
        const spots = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]];
        let sx = x, sy = y + 1;
        for (const [dx, dy] of spots) if (!ASH.core.M.blocked(x + dx, y + dy)) { sx = x + dx; sy = y + dy; break; }
        ASH.teleport(sx, sy);
        ASH.core.cmd(ASH.pid, { c: 'plant', x, y });
      }
    ''', xy)

def last_warn(pg):
    return ev(pg, '''() => {
      const lines = [...document.querySelectorAll('.chat div')];
      const w = lines.filter(d => d.className.indexOf('warn') >= 0);
      return (w.length ? w[w.length - 1] : lines[lines.length - 1] || {}).textContent || '';
    }''')

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('pageerror', lambda e: fails.append('PAGEERROR ' + str(e)))
        pg.goto(URL)
        pg.wait_for_function('window.ASH && ASH.me && ASH.core', timeout=30000)
        pg.wait_for_timeout(1200)
        if ev(pg, '!!document.querySelector(".help")'):
            pg.click('.help .btn')
            pg.wait_for_timeout(400)
        ev(pg, 'ASH.give("sapling", 6)')
        spots = ev(pg, FIND)
        print('spots', spots)
        cases = [
            ('path', spots['road'], 'path'),
            ('town', spots['town'], 'town'),
            ('vael', spots['vael'], 'Vael'),
            ('door', spots['door'], 'entrance'),
        ]
        for name, xy, word in cases:
            check(xy is not None, name + ' spot exists')
            if not xy:
                continue
            before = ev(pg, 'ASH.core.invCount(ASH.me, "sapling")')
            stand_and_plant(pg, xy)
            pg.wait_for_timeout(1800)
            text = last_warn(pg)
            check(word in text and ev(pg, 'ASH.core.invCount(ASH.me, "sapling")') == before, name + ' refused: ' + text)
            ev(pg, 'document.querySelector(".chat").classList.add("big")')
            ev(pg, 'ASH.setCam(0.4, 0.95, 14)')
            pg.wait_for_timeout(500)
            shot(pg, name)
        xy = spots['open']
        check(xy is not None, 'open grove grass exists')
        if xy:
            before = ev(pg, 'ASH.core.invCount(ASH.me, "sapling")')
            stand_and_plant(pg, xy)
            pg.wait_for_timeout(1800)
            text = ev(pg, '[...document.querySelectorAll(".chat div")].map(d => d.textContent).join(" | ")')
            planted = ev(pg, 'ASH.core.invCount(ASH.me, "sapling")') == before - 1
            check(planted and 'plant the sapling' in text, 'open grass took a sapling: ' + text[-180:])
            ev(pg, 'ASH.setCam(0.5, 0.85, 11)')
            pg.wait_for_timeout(600)
            shot(pg, 'grove')
        b.close()
    print(str(len(fails)) + ' FAILED' if fails else 'all passed')
    raise SystemExit(1 if fails else 0)

if __name__ == '__main__':
    main()
