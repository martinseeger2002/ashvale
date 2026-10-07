"""chest_ui_pw.py - 2026-10-06: in the chest a tap moves a thing between the chest and the bag at once - a token asks
how many on the on-screen number pad, an NFT moves one; long-press / right-click: Move 1, Move N (number pad), Examine.
And on a phone the chat box rides above the keyboard and comes back down when it closes.
Needs: python3 -m http.server 8731 in ~/ashvale3d. Shots: tests/shots/chest_ui_*.png"""
import os, sys, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=chestui'
fails = []
def ok(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
with sync_playwright() as P:
    b = P.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, timeout=120000); pg.wait_for_function('window.ASH && ASH.chest', timeout=120000); pg.wait_for_timeout(3000)
    E = pg.evaluate
    E("ASH.hud.showHelp(false)")
    E("localStorage.removeItem('ashvale3d.chest.nUI')")
    E("(() => { for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.me.eq = {}; const W = ASH.walletState(); W.address = 'nUI'; W.status = 'ready'; W.data = { address: 'nUI', gear: { hat_featherband: ['a', 'b', 'c'] }, tokens: { logs: 50 }, gold: 100, raw: {}, pieces: [] }; })()")
    E("ASH.hud.openChest()"); pg.wait_for_timeout(600)
    bag = lambda k: E("ASH.core.invCount(ASH.me, '%s')" % k); chest = lambda: E("ASH.chest.state().chest")
    padOn = lambda: E("getComputedStyle(document.querySelector('.numpad')).display === 'flex'")
    # tap GOLD (a token): the number pad asks how many
    pg.tap('.shop [data-t=coins]'); pg.wait_for_timeout(300)
    ok(padOn(), 'tapping GOLD (a token) opens the number pad')
    ok('of 100' in E("document.querySelector('.numpad small').textContent"), 'the pad says how many there are (of 100)')
    pg.screenshot(path='tests/shots/chest_ui_numpad.png')
    for k in '25': pg.tap('.numpad [data-k="%s"]' % k)
    ok(E("document.querySelector('.numpad .v').textContent") == '25', 'the screen shows 25')
    pg.tap('.numpad [data-k=ok]'); pg.wait_for_timeout(300)
    ok(not padOn() and bag('coins') == 25 and chest().get('coins') == 75, 'OK: 25 GOLD into the bag, 75 left in the chest')
    # tap a headband (an NFT): one moves at once
    pg.tap('.shop [data-t=hat_featherband]'); pg.wait_for_timeout(300)
    ok(not padOn() and bag('hat_featherband') == 1 and chest().get('hat_featherband') == 2, 'tapping a Feather Headband (an NFT) moves one at once, no pad')
    # long-press logs: the menu
    box = pg.locator('.shop [data-t=logs]').bounding_box(); x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(200)
    opts = E("[...document.querySelectorAll('.ctx div')].map(d => d.textContent)")
    ok(any(o.startswith('Take 1') for o in opts) and any(o.startswith('Take N') for o in opts) and any(o.startswith('Examine') for o in opts), 'long-press on logs: Take 1, Take N, Examine (%s)' % opts)
    pg.screenshot(path='tests/shots/chest_ui_menu.png')
    pg.locator('.ctx div', has_text='Examine').click(); pg.wait_for_timeout(300)
    ok('Logs' in E("document.querySelector('.chat').innerText.split('\\n').slice(-1)[0]"), 'Examine prints about the logs in chat')
    pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(200)
    pg.locator('.ctx div', has_text='Take N').click(); pg.wait_for_timeout(300)
    ok(padOn(), 'Take N opens the number pad'); free = E("ASH.me.inv.filter(s => !s).length")
    ok(('%d fit in your bag' % free) in E("document.querySelector('.numpad small').textContent"), 'logs take a slot each: the pad says %d fit' % free)
    pg.tap('.numpad [data-k=max]'); pg.tap('.numpad [data-k=ok]'); pg.wait_for_timeout(300)
    ok(bag('logs') == free and chest().get('logs') == 50 - free, 'Max then OK: the bag is filled with %d logs, %d stay in the chest' % (free, 50 - free))
    li = E("ASH.me.inv.findIndex(q => q && q.id === 'logs')"); pg.tap('.shop [data-s="%d"]' % li); pg.wait_for_timeout(300)
    ok(padOn(), 'tapping logs in the bag (a token) asks how many'); pg.tap('.numpad [data-k=max]'); pg.tap('.numpad [data-k=ok]'); pg.wait_for_timeout(300)
    ok(bag('logs') == 0 and chest().get('logs') == 50, 'Max: all the logs go back')
    # bag side: tap the headband in the bag stores it; tap GOLD in the bag asks how many
    hb = E("ASH.me.inv.findIndex(q => q && q.id === 'hat_featherband')"); pg.tap('.shop [data-s="%d"]' % hb); pg.wait_for_timeout(300)
    ok(bag('hat_featherband') == 0 and chest().get('hat_featherband') == 3, 'tapping the headband in the bag puts it back in the chest')
    gi = E("ASH.me.inv.findIndex(q => q && q.id === 'coins')"); pg.tap('.shop [data-s="%d"]' % gi); pg.wait_for_timeout(300)
    ok(padOn(), 'tapping GOLD in the bag asks how many to store'); pg.tap('.numpad [data-k="5"]'); pg.tap('.numpad [data-k=ok]'); pg.wait_for_timeout(300)
    ok(bag('coins') == 20 and chest().get('coins') == 80, 'stored 5: 20 GOLD in the bag, 80 in the chest')
    # right-click on a computer-style click opens the same menu; Cancel closes the pad without moving anything
    pg.tap('.shop [data-t=coins]'); pg.tap('.numpad [data-k="9"]'); pg.tap('.numpad [data-k=cancel]'); pg.wait_for_timeout(200)
    ok(not padOn() and bag('coins') == 20, 'Cancel moves nothing')
    E("ASH.hud.closeChest()")
    # chat on a phone: the box goes up while the keyboard is open and back down when it closes
    on = E("document.querySelector('.say').classList.contains('on')"); ok(on, 'the chat box shows (online through loopback)')
    y0 = E("document.querySelector('.say input').getBoundingClientRect().top")
    pg.tap('.say input'); pg.set_viewport_size({'width': 412, 'height': 480}); pg.wait_for_timeout(900)   # the keyboard takes the bottom 380 px
    r = E("(() => { const r = document.querySelector('.say input').getBoundingClientRect(); return [r.top, r.bottom, innerHeight]; })()")
    ok(E("document.querySelector('.say').classList.contains('kb')") and r[1] <= r[2], 'keyboard open: the box sits above it (box bottom %d, visible %d; it was at %d)' % (r[1], r[2], y0))
    pg.screenshot(path='tests/shots/chest_ui_chat_kb.png')
    pg.set_viewport_size({'width': 412, 'height': 860}); pg.wait_for_timeout(700)
    ok(not E("document.querySelector('.say').classList.contains('kb')"), 'keyboard closed: the box goes back down')
    ok(abs(E("document.querySelector('.say input').getBoundingClientRect().top") - y0) < 4, 'back in its place')
    # a keyboard the page is not told about (inside the arcade's frame): the box goes to the top of the screen
    pg.tap('.say input'); pg.wait_for_timeout(1300)
    t = E("document.querySelector('.say input').getBoundingClientRect().top")
    ok(E("document.querySelector('.say').classList.contains('kb')") and t < 60, 'keyboard the page cannot see: the box moves to the top (%d px)' % t)
    E("document.querySelector('.say input').blur()"); pg.wait_for_timeout(200)
    ok(not E("document.querySelector('.say').classList.contains('kb')"), 'leaving the box puts it back down')
    ok(not errs, 'no page errors %s' % errs[:3])
    b.close()
print('ALL PASS' if not fails else 'FAILED: %d' % len(fails)); sys.exit(1 if fails else 0)
