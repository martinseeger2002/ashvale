"""A GOLD wager asks first (2026-10-15: "There should be a confirmation button when joining a game that has a
gold wager"). Ann sits at a chess table for a 100 GOLD stake (straight through the command); Ben taps the table: the
plain tap's "Sit down as Black (stake 100 GOLD)" opens a Yes/No box instead of sitting. "Not now" leaves him standing,
"Sit down" sits him. A friendly table sits straight away.
  python3 tests/wager_confirm_pw.py   (server: python3 tests/serve.py 8731, or python3 -m http.server 8731, in ~/ashvale3d)"""
import os, sys, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu'] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=wager%d'
fails = []
def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c: fails.append(msg)
def ev(pg, js): return pg.evaluate(js)
def wait(pg, js, timeout=30, step=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if ev(pg, js): return True
        except Exception: pass
        time.sleep(step)
    return False
def open_page(ctx, url, errs, tag):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(tag + ' PAGEERROR ' + str(e)))
    pg.goto(url, wait_until='domcontentloaded', timeout=120000); wait(pg, '!!(window.ASH && ASH.core)', 90)
    time.sleep(1); ev(pg, 'ASH.hud.showHelp(false)'); return pg
def tap(pg, kind, ident):
    pos = ev(pg, 'ASH.screenOf(%s, %s)' % (json.dumps(kind), json.dumps(ident)))
    if not pos: return False
    pg.mouse.click(pos['x'], pos['y']); return True
def box(pg): return ev(pg, '(function(){var h=document.querySelector(".help");return h&&h.style.display==="block"?h.innerText:""})()') or ''
def seated(pg): return bool(ev(pg, '!!(ASH.me.seat && ASH.me.seat.k !== "pk")'))

with sync_playwright() as p:
    b = p.chromium.launch(headless=not os.environ.get('DISPLAY') or bool(os.environ.get('HEADLESS')), args=ARGS)
    ctx = b.new_context(viewport={'width': 900, 'height': 700}); errs = []
    pa = open_page(ctx, URL % 1, errs, 'A'); ev(pa, 'ASH.core.cmd("me", {c: "look", name: "Ann"}); ASH.teleport(468, 38)'); time.sleep(4)
    T = 'salt1'                                    # the quay green's first table (as chess_pw.py)
    ev(pa, 'ASH.give("coins", 500)')
    ev(pa, 'ASH.core.cmd("me", %s)' % json.dumps({'c': 'sit', 'table': T, 'seat': 1, 'stake': 100}))
    check(wait(pa, '!!(ASH.me.seat)', 40), 'Ann sits as White at a staked table')
    pb = open_page(ctx, URL % 2, errs, 'B'); ev(pb, 'ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(467, 37)'); time.sleep(4)
    ev(pb, 'ASH.give("coins", 500)')
    check(wait(pb, 'ASH.core.chessOf(%s).stake === 100' % json.dumps(T), 40), 'Ben sees the table played for 100 GOLD')
    check(tap(pb, 'tile', [465, 35]), 'Ben taps the table')
    check(wait(pb, '(function(){var h=document.querySelector(".help");return h&&h.style.display==="block"&&/Play for 100 GOLD/.test(h.innerText)})()', 10), 'a Yes/No box asks before he plays for 100 GOLD')
    if os.environ.get('SHOT'): pb.screenshot(path=os.environ['SHOT'])
    time.sleep(2); check(not seated(pb), 'and nothing happened yet: he is still standing')
    pb.click('.help [data-a=no]'); time.sleep(3)
    check(not seated(pb) and not box(pb), '"Not now" leaves him standing, the box gone')
    tap(pb, 'tile', [465, 35]); wait(pb, '/Play for 100 GOLD/.test(document.querySelector(".help").innerText)', 10)
    pb.click('.help [data-a=yes]')
    check(wait(pb, '!!(ASH.me.seat)', 40), '"Sit down" sits him as Black')
    check(not [e for e in errs if 'PAGEERROR' in e], 'no page errors: %s' % errs[:3])
    b.close()
print('ALL OK' if not fails else 'FAILED: %d' % len(fails)); sys.exit(1 if fails else 0)
