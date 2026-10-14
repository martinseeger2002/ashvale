"""Solitaire at the card table (2026-10-13): the table's menu offers it; Klondike, draw one, one-tap moves, undo,
a new deal, Finish when every card is face up.   python3 tests/solitaire_pw.py   (server: python3 -m http.server 8731)"""
import os, sys, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu'] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto('http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=sol1'); pg.wait_for_function('!!(window.ASH && ASH.core)', timeout=120000); time.sleep(2)
    pg.evaluate('ASH.hud.showHelp(false); ASH.teleport(455, 31)'); time.sleep(5)
    pg.evaluate('(function(){var bi=ASH.core.M.buildingAt(457,30),B=ASH.core.M.buildings[bi];ASH.teleport(457,30);ASH.core.cmd("me",{c:"climb",dir:1,x:B.stairs[0],y:B.stairs[1]})})()')
    pg.wait_for_function('ASH.me.lv === 1', timeout=60000); time.sleep(1)
    opts = pg.evaluate("(ASH.menuAt ? null : null)")
    labels = pg.evaluate("(function(){ const T = ASH.core.pokerTableById('poker1'); const o = ASH.targetsAt ? null : null; return null; })()")
    pg.evaluate('ASH.solitaire()'); time.sleep(1)
    S = lambda: pg.evaluate('ASH.hud._sol()')
    s = S()
    check(pg.evaluate('!!document.querySelector(".solp")'), 'the Solitaire table opens')
    check(s and len(s['tab']) == 7 and sum(len(c) for c in s['tab']) == 28 and len(s['stock']) == 24, 'Klondike is dealt: 28 in seven columns, 24 in the stock')
    check(all(c[-1]['up'] for c in s['tab']) and sum(1 for c in s['tab'] for x in c if x['up']) == 7, 'the top card of each column is face up, the rest face down')
    check(pg.evaluate('document.querySelectorAll(".solp .cardx").length') >= 29 and 'data:image/png' in (pg.evaluate('document.querySelector(".solp .cardx").style.backgroundImage') or ''), 'the cards are drawn from the felt\'s own card art')
    pg.click('.solp [data-k="s"]'); time.sleep(0.2); s = S()
    check(len(s['waste']) == 1 and len(s['stock']) == 23 and s['waste'][0]['up'], 'tapping the deck turns a card onto the waste')
    for _ in range(23): pg.click('.solp [data-k="s"]')
    pg.click('.solp [data-k="s"]'); s = S()
    check(len(s['stock']) == 24 and not s['waste'], 'an empty deck turns the waste back over')
    pg.click('.solp [data-u]'); s = S()
    check(len(s['waste']) == 24 and not s['stock'], 'Undo takes back the last move')
    moved = 0
    for _ in range(60):   # play every one-tap move there is for a while
        before = json.dumps(S())
        for sel in ['.solp [data-k^="w:"]'] + ['.solp [data-k^="t%d:"]:last-of-type' % i for i in range(7)]:
            els = pg.query_selector_all(sel)
            if els: els[-1].click()
            if json.dumps(S()) != before: moved += 1; break
        else:
            pg.click('.solp [data-k="s"]')
    check(moved > 0, 'one-tap moves play cards (%d moves made)' % moved)
    # a game one move from won: Finish puts every card home and the table says so
    pg.evaluate("""(function(){ const s = ASH.hud._sol(); s.stock = []; s.waste = []; s.found = [[], [], [], []];
      for (let su = 0; su < 4; su++) for (let r = 0; r < 12; r++) { const c = (r === 0 ? 12 : r - 1) * 4 + su; s.found[su].push({ c, up: true }); }
      s.tab = [[{ c: 11 * 4 + 0, up: true }], [{ c: 11 * 4 + 1, up: true }], [{ c: 11 * 4 + 2, up: true }], [{ c: 11 * 4 + 3, up: true }], [], [], []]; s.won = false; })()""")
    pg.click('.solp [data-n]') if False else None
    pg.evaluate("document.querySelector('.solp [data-u]').click()") if False else None
    pg.evaluate("ASH.solitaire()"); time.sleep(0.3)
    check(pg.evaluate('!!document.querySelector(".solp [data-f]")'), 'every card face up: Finish is offered')
    pg.click('.solp [data-f]'); time.sleep(0.3)
    check(S()['won'] and 'You win' in pg.evaluate('document.querySelector(".solp .msg").textContent'), 'Finish plays every card home: You win!')
    pg.click('.solp [data-n]'); time.sleep(0.3)
    check(not S()['won'] and sum(len(c) for c in S()['tab']) == 28, 'New deal starts again')
    time.sleep(0.5); pg.screenshot(path='tests/shots/solitaire.png')
    pg.click('.solp [data-x]'); time.sleep(0.3)
    check(not pg.evaluate('!!document.querySelector(".solp")'), 'Close puts it away')
    check(not errs, 'no console errors (%d)%s' % (len(errs), (': ' + errs[0][:160]) if errs else ''))
    b.close()
print('ALL OK' if not fails else '%d FAILED' % len(fails)); sys.exit(1 if fails else 0)
