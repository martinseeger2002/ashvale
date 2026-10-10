"""Town guard: the first option is Talk-to, and the remarks come round to Lake Castle.
   The page is http://127.0.0.1:8099/ashvale3d.html
"""
import base64, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8099/ashvale3d.html?fresh&nocreator&seed=guardtalk'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []

def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c:
        fails.append(msg)

def shot(pg, name):
    p = os.path.join(OUT, 'guard_' + name + '.png')
    data = pg.context.new_cdp_session(pg).send('Page.captureScreenshot', {'format': 'png'})
    open(p, 'wb').write(base64.b64decode(data['data']))
    print('     shot', p)

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.set_default_timeout(60000)
        pg.goto(URL)
        pg.wait_for_function('window.ASH && ASH.me && ASH.hud')
        pg.wait_for_timeout(800)
        if pg.evaluate('!!document.querySelector(".help")'):
            pg.evaluate('document.querySelector(".help .btn").click()')
            pg.wait_for_timeout(300)
        pg.evaluate('''() => {
          ASH.teleport(25, 50);
          ASH.setCam(0.4, 1.0, 10);
        }''')
        pg.wait_for_timeout(600)
        opts = pg.evaluate('''() => {
          const s = ASH.screenOf('npc', 'guard_ash_1');
          if (!s) return null;
          const cv = document.querySelector('canvas.gl');
          cv.dispatchEvent(new MouseEvent('contextmenu', { clientX: s.x, clientY: s.y, bubbles: true, cancelable: true }));
          return [...document.querySelectorAll('.ctx .opt')].map(d => d.textContent);
        }''')
        print('menu', opts)
        check(opts and opts[0].startswith('Talk-to'), 'the first option on a town guard is Talk-to')
        check(opts and any(t.startswith('Attack') for t in opts), 'Attack is still there, after talk')
        shot(pg, 'menu')
        pg.evaluate('''() => {
          ASH.hud.hideMenu();
          ASH.me.watchAt = 11;
          ASH.core.cmd(ASH.pid, { c: 'npc', id: 'guard_ash_1' });
        }''')
        pg.wait_for_function('''() => {
          const d = document.querySelector('.dlg');
          return d && d.style.display !== 'none' && /Lake Castle/.test(d.textContent);
        }''')
        text = pg.evaluate('document.querySelector(".dlg").textContent')
        print('said', text)
        check('Lake Castle' in text, 'the guard mentions Lake Castle')
        shot(pg, 'castle')
        b.close()
    print(str(len(fails)) + ' FAILED' if fails else 'all passed')
    raise SystemExit(1 if fails else 0)

if __name__ == '__main__':
    main()
