"""[Claude 2026-10-20] The Saltmere Links clubhouse in a real browser (the operator: "Inside the clubhouse, there should be a town
portal and a bank chest. There should also be a chess board"; "a bank of [fortune] machines"): the scene builds the four
machines, you sit at one, the chess table seats you, the chest opens, and the portal offers Saltmere alone.
  PORT=8775 HEADED=1 python3 tests/clubhouse_pw.py   (server: python3 tests/serve.py 8775; SHOTS=dir for pictures)"""
import os, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
PORT = os.environ.get('PORT', '8775'); SHOTS = os.environ.get('SHOTS')
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&notut&loopback&seed=club&go=635,-118'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fortune_pw.py')).read()
BANK = SRC[SRC.index('BANK = r"""') + len('BANK = r"""'):]; BANK = BANK[:BANK.index('"""')]   # fortune_pw's signed-in wallet and Bank, in the page
fails = []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def wait(pg, js, t=30):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
with sync_playwright() as p:
    b = p.chromium.launch(headless=os.environ.get('HEADED') is None, args=ARGS if os.environ.get('HEADED') is None else ['--use-angle=gl'])
    pg = b.new_page(viewport={'width': 1100, 'height': 700}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until='domcontentloaded', timeout=120000)
    check(wait(pg, '!!(window.ASH && ASH.core && ASH.fortune && ASH.fortune())', 120), 'game up')
    pg.keyboard.press('Escape'); pg.evaluate('ASH.hud.showHelp && ASH.hud.showHelp(false)')
    check(wait(pg, 'ASH.me.x === 635 && ASH.me.y === -118', 20), 'standing in the clubhouse (%s)' % pg.evaluate('[ASH.me.x, ASH.me.y]'))
    check(wait(pg, '["lk1","lk2","lk3","lk4"].every(id => !!ASH.fortune()._machine(id))', 40), 'the scene built the four Fortune Engines')
    check(pg.evaluate('ASH.core.M.npcs.some(n => n.id === "portal_golf") && ASH.core.M.npcs.some(n => n.id === "links_chest")'), 'the portal and the chest are there')
    time.sleep(2)
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, 'clubhouse.png'))
    # the portal: touching it attunes you, and it offers Saltmere alone
    pg.evaluate('window.__chats = []; const h = ASH.hud.chat; ASH.hud.chat = (t, k) => { __chats.push(String(t)); return h(t, k); }')
    pg.evaluate('ASH.me.attuned = {ashvale: 1, saltmere: 1, castle: 1}; ASH.core.cmd("me", {c: "npc", id: "portal_golf"})')
    check(wait(pg, 'ASH.me.attuned.golf === 1', 20), 'touching the clubhouse portal attunes you')
    m = pg.evaluate('Array.from(document.querySelectorAll(".menu .y, .ctx .y, [class*=menu] .y")).map(n => n.textContent)')
    check('Saltmere' in m and 'Ashvale' not in m and 'the Lake Castle' not in m, 'its menu offers Saltmere alone: %s' % m)
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, 'clubhouse_portal.png'))
    pg.keyboard.press('Escape'); time.sleep(0.3)
    # the chest
    pg.evaluate('ASH.core.cmd("me", {c: "npc", id: "links_chest"})')
    check(wait(pg, '!!document.querySelector(".chest")', 20), 'the clubhouse chest opens the chest window')
    if SHOTS: time.sleep(0.8); pg.screenshot(path=os.path.join(SHOTS, 'clubhouse_chest.png'))
    pg.keyboard.press('Escape'); pg.evaluate('ASH.hud.closeChest && ASH.hud.closeChest()'); time.sleep(0.5)
    # a Fortune Engine: sit, then stand (signed in, as fortune_pw)
    pg.evaluate(BANK); pg.evaluate('ASH.give("coins", 2000)'); time.sleep(0.5)
    pg.evaluate('ASH.fortune().menu({kind: "fortune", id: "lk2"})[0].fn()')
    check(wait(pg, 'ASH.fortune().seated()', 40), 'you walk to lk2 and sit (%s)' % pg.evaluate('[ASH.me.x, ASH.me.y]'))
    check(pg.evaluate('[ASH.me.x, ASH.me.y]') == [633, -120], 'on its seat 633,-120')
    check(wait(pg, '!!document.querySelector(".fortp.bar")', 10), 'the Fortune Engine bar shows')
    if SHOTS: time.sleep(1.5); pg.screenshot(path=os.path.join(SHOTS, 'clubhouse_fortune.png'))
    pg.evaluate('ASH.fortune().standUp()'); check(wait(pg, '!ASH.fortune().seated()', 15), 'and stand up')
    time.sleep(1)
    # the chess table: sit (a friendly game, no stake)
    pg.evaluate('ASH.core.cmd("me", {c: "sit", table: "links1", seat: 0, stake: 0})')
    check(wait(pg, '!!ASH.me.seat && ASH.me.seat.t === "links1"', 40), 'the clubhouse chess table seats you (%s)' % pg.evaluate('[ASH.me.x, ASH.me.y, JSON.stringify(ASH.me.seat || null)]'))
    if SHOTS: time.sleep(2); pg.screenshot(path=os.path.join(SHOTS, 'clubhouse_chess.png'))
    check(not errs, 'no page errors %s' % errs[:3])
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
