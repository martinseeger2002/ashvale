"""2026-10-20: "a price per game and a selection for front nine or back nine ... 25 gold each player for the front nine or the
back nine or 50 gold each per player for the full 18". A solo back nine: the fee leaves the pack, the round starts on hole 10, the card
shows only the IN nine, and the round ends after hole 18; a front nine ends after hole 9; too little GOLD: no round.
  python3 tests/golf_nines_pw.py   (server: python3 tests/serve.py 8775 in the tree; HEADED=1 for a visible Chromium)"""
import os, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
def wait(pg, js, t=20):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.2)
    return False
PORT = os.environ.get('PORT', '8775')
GS = 'ASH.golf()._state()'
COINS = "ASH.me.inv.reduce((s, q) => s + (q && q.id === 'coins' ? q.n : 0), 0)"
SOLO = "nine => ASH.golf()._begin({ rid: 'n' + Date.now().toString(36), f: 'free', a: 0, m: [[ASH.golf()._me(), 'Dee', '', 1]], nine })"
with sync_playwright() as p:
    b = p.chromium.launch(headless=os.environ.get('HEADED') is None, args=['--use-angle=gl'] if os.environ.get('HEADED') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']); errs = []
    pg = b.new_page(viewport={'width': 1000, 'height': 640}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:%s/dist/ashvale3d.html?fresh&nocreator&loopback&seed=nines&go=636,-112' % PORT, wait_until='domcontentloaded', timeout=120000)
    check(wait(pg, '!!(window.ASH && ASH.golf && ASH.golf())', 120), 'game up with the golf part'); pg.keyboard.press('Escape')
    pg.evaluate("() => { for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.me.inv[0] = { id: 'golf_standard', n: 1 }; ASH.give('coins', 100); }")
    pg.evaluate(SOLO, 'back')
    check(wait(pg, GS + " && " + GS + ".hole === 9"), 'the back nine tees off on hole 10')
    check(wait(pg, COINS + " === 75", 5), 'the 25 GOLD green fee leaves the pack (%s)' % pg.evaluate(COINS))
    for i in range(10, 19): pg.evaluate("a => ASH.golf()._hole(a[0], a[1])", [i, 4]); time.sleep(0.05)
    check(wait(pg, "(s => !!s && s.card.filter(v => v > 0).length === 9)(" + GS + ")", 5), 'nine holes on the card (%s)' % (pg.evaluate(GS) or {}).get('card'))
    check(wait(pg, "!!document.querySelector('.golfp.card') && /IN/.test(document.querySelector('.golfp.card').innerText) && !/OUT/.test(document.querySelector('.golfp.card').innerText)", 8), 'the end card shows the IN nine only')
    pg.evaluate("ASH.golf()._quit()"); time.sleep(1)
    pg.evaluate(SOLO, 'front')
    check(wait(pg, GS + " && " + GS + ".hole === 0") and wait(pg, COINS + " === 50", 5), 'the front nine starts on hole 1 for 25 GOLD (%s left)' % pg.evaluate(COINS))
    for i in range(1, 10): pg.evaluate("a => ASH.golf()._hole(a[0], a[1])", [i, 5]); time.sleep(0.05)
    check(wait(pg, "!!document.querySelector('.golfp.card') && /OUT/.test(document.querySelector('.golfp.card').innerText) && !/IN/.test(document.querySelector('.golfp.card').innerText)", 8), 'the front nine ends after hole 9 (OUT only)')
    pg.evaluate("ASH.golf()._quit()"); time.sleep(1)
    pg.evaluate(SOLO, 'full')
    time.sleep(1.5)
    started = pg.evaluate("!!" + GS)
    check(started and wait(pg, COINS + " === 0", 5), 'all eighteen for 50 GOLD (pack %s)' % pg.evaluate(COINS))
    pg.evaluate("ASH.golf()._quit()"); time.sleep(1)
    pg.evaluate(SOLO, 'front'); time.sleep(1.5)
    check(not pg.evaluate("!!" + GS), 'no GOLD left: no round')
    check(not errs, 'no page errors ' + str(errs[:3]))
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
