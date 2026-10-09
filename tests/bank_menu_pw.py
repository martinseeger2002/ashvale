"""Bank menu: Withdraw all beside the deposit buttons, Withdraw all on a chest item, Deposit N from the bag."""
import os, sys
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/name/.cache/ms-playwright')
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8099/ashvale3d.html?fresh&nocreator&seed=bankmenu'
OUT = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(OUT, exist_ok=True)
fails = []

def ok(c, m):
    print(('ok   ' if c else 'FAIL ') + m, flush=True)
    if not c:
        fails.append(m)

with sync_playwright() as P:
    b = P.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, timeout=120000)
    pg.wait_for_function('window.ASH && ASH.hud && ASH.chest', timeout=120000)
    pg.wait_for_timeout(1500)
    E = pg.evaluate
    E("ASH.hud.showHelp(false)")
    E("""() => {
      for (let i = 0; i < 28; i++) ASH.me.inv[i] = null;
      ASH.me.eq = {};
      const W = ASH.walletState();
      W.address = 'bankmenu'; W.status = 'ready';
      W.data = { address: 'bankmenu', gear: {}, tokens: { logs: 8 }, gold: 12, raw: {}, pieces: [] };
    }""")
    E("ASH.hud.openChest()")
    pg.wait_for_timeout(500)
    labels = E("[...document.querySelectorAll('.shop .btn')].map(b => b.textContent)")
    ok('Withdraw all' in labels and 'Deposit inventory' in labels, 'the chest has Deposit inventory and Withdraw all (%s)' % labels)
    pg.screenshot(path=os.path.join(OUT, 'bank_buttons.png'))
    box = pg.locator('.shop [data-t=logs]').bounding_box()
    pg.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, button='right')
    pg.wait_for_timeout(300)
    opts = E("[...document.querySelectorAll('.ctx div')].map(d => d.textContent)")
    ok(any(o.startswith('Withdraw all') for o in opts) and any(o.startswith('Take N') for o in opts), 'a chest stack offers Withdraw all (%s)' % opts)
    pg.screenshot(path=os.path.join(OUT, 'bank_withdraw_menu.png'))
    pg.locator('.ctx div', has_text='Withdraw all').click()
    pg.wait_for_timeout(400)
    ok(E("ASH.core.invCount(ASH.me, 'logs')") == 8 and E("ASH.chest.state().chest.logs || 0") == 0, 'Withdraw all logs empties that stack into the bag')
    pg.locator('.shop [data-wd=all]').click()
    pg.wait_for_timeout(400)
    ok(E("ASH.core.invCount(ASH.me, 'coins')") == 12 and not E("ASH.chest.state().chest.coins"), 'Withdraw all takes the rest of the chest')
    slot = E("ASH.me.inv.findIndex(s => s && s.id === 'coins')")
    ib = pg.locator('.panel .inv .slot[data-i="%d"]' % slot).bounding_box()
    pg.mouse.click(ib['x'] + ib['width'] / 2, ib['y'] + ib['height'] / 2, button='right')
    pg.wait_for_timeout(300)
    opts = E("[...document.querySelectorAll('.ctx div')].map(d => d.textContent)")
    ok(any(o.startswith('Deposit N') for o in opts) and any(o.startswith('Deposit all') for o in opts), 'the bag offers Deposit N and Deposit all (%s)' % opts)
    pg.screenshot(path=os.path.join(OUT, 'bank_deposit_menu.png'))
    pg.locator('.ctx div', has_text='Deposit N').click()
    pg.wait_for_timeout(300)
    ok(E("getComputedStyle(document.querySelector('.numpad')).display") == 'flex', 'Deposit N opens the number pad')
    pg.locator('.numpad [data-k="4"]').click()
    pg.locator('.numpad [data-k=ok]').click()
    pg.wait_for_timeout(400)
    ok(E("ASH.core.invCount(ASH.me, 'coins')") == 8 and E("ASH.chest.state().chest.coins") == 4, 'Deposit N puts 4 GOLD in the chest and leaves 8')
    pg.screenshot(path=os.path.join(OUT, 'bank_deposit_n.png'))
    ok(not errs, 'no page errors %s' % errs[:2])
    b.close()

print('ALL PASS' if not fails else 'FAILED: %d' % len(fails))
sys.exit(1 if fails else 0)
