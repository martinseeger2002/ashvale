"""The chess park in a real browser (handoff/chess_park_plan.md, 2026-10-10): two games in one loopback room on
Saltmere's quay green. Ann sits down as White (her avatar walks to the south bench and sits, the camera swings over the
board, the chess panel replaces the HUD), Ben watches her from beside the table, then sits as Black; they play the
scholar's mate on the 3D board by tapping squares; both screens agree all the way, a bystander sees the pieces move.
  python3 tests/chess_pw.py      (server: python3 -m http.server 8731 in ~/ashvale3d). Shots in tests/shots/chess_*.png"""
import os, sys, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=chess%d'
fails = []
def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg);
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
def shot(pg, name):
    os.makedirs(OUT, exist_ok=True); p = os.path.join(OUT, name + '.png'); pg.screenshot(path=p, timeout=150000); print('     shot', p)
def tap(pg, kind, ident, button='left'):
    pos = ev(pg, 'ASH.screenOf(%s, %s)' % (json.dumps(kind), json.dumps(ident)))
    if not pos: return False
    pg.mouse.click(pos['x'], pos['y'], button=button); return True
def open_page(ctx, url, errs, tag):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(tag + ' PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(tag + ' ' + m.text))
    pg.goto(url, wait_until='domcontentloaded', timeout=120000); wait(pg, '!!(window.ASH && ASH.core)', 90)
    time.sleep(1); ev(pg, 'ASH.hud.showHelp(false)'); return pg   # the welcome card would take the first tap
TABLE = 'salt1'; TX, TY = 465, 35
FEN = 'ASH.core.chessOf(%s).fen' % json.dumps(TABLE)

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 720, 'height': 480}); errs = []   # SwiftShader: a screenshot takes ~30 s at this size
    pa = open_page(ctx, URL % 1, errs, 'A'); ev(pa, 'ASH.core.cmd("me", {c: "look", name: "Ann"}); ASH.teleport(468, 38)'); time.sleep(4)
    check(wait(pa, 'ASH.me.x === 468 && ASH.me.y === 38 && ASH.zones().loaded.indexOf("saltmere") >= 0', 40), 'Ann stands on the quay green with Saltmere loaded')
    time.sleep(2); shot(pa, 'chess_01_park')
    check(ev(pa, '!!ASH.core.tableById(%s)' % json.dumps(TABLE)) and ev(pa, 'ASH.core.tables().length') == 4, 'the four tables are in the loaded town')
    # 1. sit: the first tap option on a free table is the south bench (White)
    check(tap(pa, 'tile', [TX, TY]), 'the table can be tapped')
    check(wait(pa, 'ASH.me.seat && ASH.me.seat.t === %s && ASH.me.seat.s === 1' % json.dumps(TABLE), 25), 'Ann walks to the south bench and sits down as White')
    time.sleep(1.5)
    check(ev(pa, 'ASH.cam.mode') == 'chess' and ev(pa, 'ASH.camera.fov') > 41, 'first person over the board (fov %s)' % ev(pa, 'Math.round(ASH.camera.fov)'))
    check(ev(pa, '!ASH.ents.get("p:" + ASH.pid).root.visible'), 'your own head is out of the view')
    check(ev(pa, '!!document.querySelector(".chessp")'), 'the chess panel is up')
    check(ev(pa, '!!document.querySelector(".lay.chess") && getComputedStyle(document.querySelector(".orbs")).display === "none"'), 'and the Ashvale HUD has stepped aside (the orbs are hidden)')
    check(ev(pa, 'ASH.ents.get("p:" + ASH.pid).loco') == 'sit', 'her avatar sits (what the others see)')
    shot(pa, 'chess_02_seated_white')
    # 2. Ben arrives and watches from beside the table
    pb = open_page(ctx, URL % 2, errs, 'B'); ev(pb, 'ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(467, 37)'); time.sleep(4)
    check(wait(pb, 'ASH.net().host && ASH.me.x === 467', 30), 'Ben is in the same room, Ann hosts it (%s)' % str(ev(pb, 'ASH.net().amHost')))
    REM = '[...ASH.ents.values()].filter(e => e.key && e.key.startsWith("r:") && e.root.visible)'
    check(wait(pb, REM + '.length === 1', 25), 'Ben sees Ann at the table')
    check(wait(pb, 'ASH.core.chessOf(%s).w && ASH.core.chessOf(%s).status === "open"' % (json.dumps(TABLE), json.dumps(TABLE)), 15), "Ben's game knows Ann holds White and the table waits (host rows arrived)")
    time.sleep(1.5); shot(pb, 'chess_03_bystander')
    # 3. Ben sits as Black (second menu entry): the right-click menu
    check(tap(pb, 'tile', [TX, TY]), 'Ben taps the table: the free bench is the first line now that White is taken')
    check(wait(pb, 'ASH.me.seat && ASH.me.seat.s === 0', 25), 'Ben sits on the north bench as Black')
    check(wait(pb, 'ASH.core.chessOf(%s).status === "playing"' % json.dumps(TABLE), 15) and wait(pa, 'ASH.core.chessOf(%s).status === "playing"' % json.dumps(TABLE), 15), 'the game begins on both screens')
    time.sleep(1.5); shot(pb, 'chess_04_seated_black')
    # 4. the scholar's mate, by tapping squares
    def move(pg, who, frm, to, n):
        check(tap(pg, 'square', [TABLE, frm]), '%s taps %s' % (who, frm)); time.sleep(0.4)
        check(tap(pg, 'square', [TABLE, to]), '%s taps %s' % (who, to))
        return wait(pa, 'ASH.core.chessOf(%s).moves.length === %d' % (json.dumps(TABLE), n), 15) and wait(pb, 'ASH.core.chessOf(%s).moves.length === %d' % (json.dumps(TABLE), n), 15)
    PANEL_H = 'document.querySelector(".chessp").getBoundingClientRect().height'
    h0 = ev(pa, PANEL_H)
    check(move(pa, 'Ann', 'e2', 'e4', 1), '1. e4 is on both boards')
    time.sleep(0.8); shot(pa, 'chess_05_after_e4')
    check(move(pb, 'Ben', 'e7', 'e5', 2), '1... e5')
    check(move(pa, 'Ann', 'd1', 'h5', 3), '2. Qh5')
    check(move(pb, 'Ben', 'b8', 'c6', 4), '2... Nc6')
    check(move(pa, 'Ann', 'f1', 'c4', 5), '3. Bc4')
    check(move(pb, 'Ben', 'g8', 'f6', 6), '3... Nf6')
    check(ev(pa, FEN) == ev(pb, FEN), 'the two games hold the same position: ' + str(ev(pa, FEN))[:40])
    # [Claude 2026-10-16] the operator: "The move history should be moved to the unexpanded chat at the bottom and this HUD should
    #   not expand any further down that is because it is blocking chess pieces"
    chat = ev(pa, 'document.querySelector(".chat").textContent')
    check('1. e4 White' in chat and '3... Nf6 Black' in chat, 'every move is a line in the chat: ' + chat[-120:])
    check(not ev(pa, '!!document.querySelector(".chessp .mv")'), 'and no move list in the panel')
    check(ev(pa, PANEL_H) <= h0 + 2, 'the panel is no taller after six moves (%s -> %s px)' % (h0, ev(pa, PANEL_H)))
    check(move(pa, 'Ann', 'h5', 'f7', 7), '4. Qxf7#')
    check(wait(pa, 'ASH.core.chessOf(%s).status === "over"' % json.dumps(TABLE), 10) and ev(pa, 'ASH.core.chessOf(%s).result' % json.dumps(TABLE)) == '1-0', "checkmate: 1-0 on Ann's screen")
    check(wait(pb, 'ASH.core.chessOf(%s).status === "over"' % json.dumps(TABLE), 10) and ev(pb, 'ASH.core.chessOf(%s).result' % json.dumps(TABLE)) == '1-0', "and on Ben's")
    # [Claude 2026-10-11] a decided game counts once for its winner; [2026-10-12] the BANK is the only copy of the
    #    board, so what a page keeps is the winner's own record and it reports ONE win, never a count (the @tag is used
    #    when the game has one - a fresh dev page has a dev tag)
    WHO = "(ASH.me.tag ? '@' + String(ASH.me.tag).replace(/^@/, '') : ASH.me.name)"
    check(wait(pa, 'ASH.me.kills && ASH.me.kills.chess_wins === 1', 10), "Ann's page counts her win once on her own record (as %s) - that is what it tells the Bank" % ev(pa, WHO))
    check(not ev(pb, 'ASH.me.kills && ASH.me.kills.chess_wins'), 'and Ben, who lost, has no win to report')
    check(ev(pa, "ASH.core.setScores('chess_wins', {}), !ASH.core.scoresOf('chess_wins').top.some(r => r[0] === %s)" % WHO), 'and her page holds no board of its own: clear what the Bank answered and nothing of her win is left on it')
    check('Game over' in (ev(pa, 'document.querySelector(".chessp") && document.querySelector(".chessp").textContent') or ''), 'the panel says so')
    time.sleep(1); shot(pa, 'chess_06_mate_white'); shot(pb, 'chess_07_mate_black')
    # 5. standing up restores the view
    pb.click('.chessp [data-a=stand]'); time.sleep(0.5)
    check(ev(pb, 'getComputedStyle(document.querySelector(".help")).display === "block"'), 'Stand up asks first (a confirm, visible over the chess panel)')
    pb.click('.help [data-a=yes]')
    check(wait(pb, '!ASH.me.seat && ASH.cam.mode !== "chess" && !document.querySelector(".chessp")', 15), 'Ben confirms: camera and HUD come back')
    ev(pa, 'ASH.core.cmd("me", {c: "walk", x: 468, y: 38})'); time.sleep(1.5)
    check(ev(pa, '!!ASH.me.seat && ASH.cam.mode === "chess"'), 'a tap on the ground does NOT take Ann away from the table')
    pa.click('.chessp [data-a=stand]'); time.sleep(0.4); pa.click('.help [data-a=yes]')
    check(wait(pa, '!ASH.me.seat && ASH.cam.mode !== "chess"', 15), 'Ann stands up through the button and its confirm')
    check(wait(pa, 'ASH.core.chessOf(%s).status === "open"' % json.dumps(TABLE), 10), 'the table is open again for the next pair')
    time.sleep(1.5); shot(pa, 'chess_08_after')
    bad = [e for e in errs if 'favicon' not in e]
    check(not bad, 'no console errors (%d)' % len(bad)); [print('     ', e[:160]) for e in bad[:6]]
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'all ok')
sys.exit(1 if fails else 0)
