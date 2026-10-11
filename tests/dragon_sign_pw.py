"""Wooden dragon-killer sign outside the ruined keep: total slain and a top 10.
   Serves nothing itself. The page is http://127.0.0.1:8099/ashvale3d.html
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8099/ashvale3d.html?fresh&nocreator&seed=dragonsign&go=-56,-93'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []

def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c:
        fails.append(msg)

def shot(pg, name):
    p = os.path.join(OUT, 'dragon_sign_' + name + '.png')
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
        pg.wait_for_timeout(1800)
        if pg.evaluate('!!document.querySelector(".help")'):
            pg.evaluate('document.querySelector(".help .btn").click()')
            pg.wait_for_timeout(400)
        info = pg.evaluate('''() => {
          const c = ASH.core, o = c.signAt(-56, -94);
          ASH.me.name = 'Wren';
          c.scoreKill('chain_dragon', 'Wren');
          c.scoreKill('chain_dragon', 'Wren');
          c.scoreKill('chain_dragon', 'Aldric');
          c.mergeScores('chain_dragon', { Maren: 4, Pip: 3, Iria: 2 });
          ASH.teleport(-54, -92);
          ASH.setCam(-0.45, 0.22, 8);
          if (ASH.paintScores) ASH.paintScores();
          return {
            sign: o && { x: o.x, y: o.y, k: o.k, face: o.face },
            zone: c.zoneOf(-56, -94),
            scores: c.scoresOf('chain_dragon'),
            read: c.scoreRead('chain_dragon'),
            board: c.scoreBoard('chain_dragon')
          };
        }''')
        print('info', info)
        check(info['sign'] and info['sign']['k'] == 'wsign', 'the sign object is in the keep')
        check(info['zone'] == 'dragonkeep', 'it sits in the ruined keep')
        check(info['scores']['total'] == 12 and info['scores']['top'][0][0] == 'Maren', 'total slain and top name')
        pg.wait_for_timeout(800)
        shot(pg, 'outside')
        chat = pg.evaluate('''() => {
          ASH.core.scoreRead('chain_dragon').forEach(l => ASH.hud.chat(l, 'sys'));
          const box = document.querySelector('.chat');
          return box ? box.innerText : document.body.innerText;
        }''')
        check('Maren' in chat and 'slain' in chat.lower(), 'Read shows the highscores including Maren')
        shot(pg, 'read')
        b.close()
    print(str(len(fails)) + ' FAILED' if fails else 'all ok')
    raise SystemExit(1 if fails else 0)

if __name__ == '__main__':
    main()
