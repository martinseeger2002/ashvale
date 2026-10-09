"""Phone bank: the old centred chest-and-bag window, with the same deposit and withdraw options."""
import os, sys
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/name/.cache/ms-playwright')
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8099/ashvale3d.html?fresh&nocreator&seed=bankphone'
OUT = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(OUT, exist_ok=True)
fails = []

def ok(c, m):
    print(('ok   ' if c else 'FAIL ') + m, flush=True)
    if not c:
        fails.append(m)

with sync_playwright() as P:
    b = P.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, timeout=180000)
    pg.wait_for_function('window.ASH && ASH.hud && ASH.chest', timeout=180000)
    pg.wait_for_timeout(1500)
    E = pg.evaluate
    ok(E('ASH.api ? true : !!ASH.hud'), 'the page booted')
    phone = E('(() => { const w = document.querySelector(".ash"); return { coarse: matchMedia("(pointer: coarse)").matches, w: innerWidth, h: innerHeight }; })()')
    ok(phone['coarse'] and min(phone['w'], phone['h']) < 600, 'this page is a phone (%s)' % phone)
    E("ASH.hud.showHelp(false)")
    E("""() => {
      for (let i = 0; i < 28; i++) ASH.me.inv[i] = null;
      ASH.me.inv[0] = { id: 'coins', n: 12 };
      ASH.me.eq = {};
      const W = ASH.walletState();
      W.address = 'bankphone'; W.status = 'ready';
      W.data = { address: 'bankphone', gear: {}, tokens: { logs: 8 }, gold: 12, raw: {}, pieces: [] };
    }""")
    E("ASH.hud.openChest()")
    pg.wait_for_timeout(500)
    box = E("""() => {
      const s = document.querySelector('.shop.chest');
      const r = s.getBoundingClientRect();
      const st = getComputedStyle(s);
      return { phone: s.classList.contains('phone'), w: r.width, left: r.left, right: r.right, vw: innerWidth,
        bag: s.querySelectorAll('[data-s]').length, chest: s.querySelectorAll('[data-t]').length,
        panel: !!document.querySelector('.panel.open'),
        btns: [...s.querySelectorAll('.btn')].map(b => b.textContent) };
    }""")
    ok(box['phone'], 'the chest uses the phone window')
    ok(box['w'] > 300 and box['right'] <= phone['w'] + 1 and box['left'] >= -1, 'the window fills the phone instead of a side strip (%s)' % box)
    ok(box['bag'] == 28 and box['chest'] >= 1, 'the bag sits in the window next to the chest (%s)' % box)
    ok(not box['panel'], 'the inventory panel stays shut so it does not cover the chest')
    ok('Withdraw all' in box['btns'] and 'Deposit inventory' in box['btns'] and 'Deposit worn equipment' in box['btns'], 'the same three buttons (%s)' % box['btns'])
    pg.screenshot(path=os.path.join(OUT, 'bank_phone.png'))
    slot = pg.locator('.shop [data-s="0"]')
    slot.click(button='right')
    pg.wait_for_timeout(300)
    opts = E("[...document.querySelectorAll('.ctx div')].map(d => d.textContent)")
    ok(any(o.startswith('Deposit N') for o in opts) and any(o.startswith('Deposit all') for o in opts), 'a bag stack offers Deposit N and Deposit all (%s)' % opts)
    pg.screenshot(path=os.path.join(OUT, 'bank_phone_deposit.png'))
    E("document.querySelector('.ctx').style.display='none'")
    cslot = pg.locator('.shop [data-t=logs]')
    cslot.click(button='right')
    pg.wait_for_timeout(300)
    opts = E("[...document.querySelectorAll('.ctx div')].map(d => d.textContent)")
    ok(any(o.startswith('Withdraw all') for o in opts) and any(o.startswith('Take N') for o in opts), 'a chest stack offers Withdraw all (%s)' % opts)
    ok(not errs, 'no page errors %s' % errs[:2])
    b.close()

print('ALL PASS' if not fails else 'FAILED: %d' % len(fails))
sys.exit(1 if fails else 0)
