"""The poker table in a real browser (handoff/poker_plan.md M10): two games in one loopback room, at the felt in the
back of Saltmere's tap room. Ann takes a chair, the camera goes over the felt and the poker panel replaces the HUD; Ben
watches from the bar, then takes the chair beside her, and the table deals them a hand. They play it out through the
panel's buttons - a fold, then a hand with a raise in it, to the river - both screens agreeing at every step, the chips
in front of each chair and the cards on the felt being the same cards. Standing up gives the room back.
  python3 tests/poker_pw.py   (server: python3 -m http.server 8731 in ~/ashvale3d). Shots in tests/shots/pk_*.png"""
import os, sys, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=poker%d'
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

T = 'poker1'; TX, TY = 457, 29
S = lambda f='': 'ASH.core.pokerOf(%s)%s' % (json.dumps(T), f)
def row(pg, field): return ev(pg, S('.' + field))
def turn(pg): return bool(ev(pg, S('.a') + ' === ASH.me.seat.s'))
def click(pg, sel, ms=2500):
    try:
        pg.click(sel, timeout=ms); return True   # the panel redraws on every row, so this is looked up again on each try
    except Exception:
        return False
def chips(pg):
    return ev(pg, '(function(){var s=ASH.core.pokerOf(%s),m=(s.se||[]).find(x=>x[1]===ASH.pid);return m?m[2]:null})()' % json.dumps(T))

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 720, 'height': 480}); errs = []   # SwiftShader: a screenshot takes ~30 s at this size
    pa = open_page(ctx, URL % 1, errs, 'A'); ev(pa, 'ASH.core.cmd("me", {c: "look", name: "Ann"}); ASH.teleport(455, 29)'); time.sleep(4)
    check(wait(pa, 'ASH.me.x === 455 && ASH.me.y === 29 && ASH.zones().loaded.indexOf("saltmere") >= 0', 40), 'Ann stands in the tap room with Saltmere loaded')
    time.sleep(2); shot(pa, 'pk_01_room')
    check(ev(pa, '!!ASH.core.pokerTableById(%s)' % json.dumps(T)) and ev(pa, 'ASH.core.pokerTables().length') == 1, 'the poker table is in the loaded town')
    MESH0 = ev(pa, 'ASH.renderInfo().meshes')
    # 1. sit: the first tap option at a free table is the first chair
    check(tap(pa, 'tile', [TX, TY]), 'the felt can be tapped')
    check(wait(pa, 'ASH.me.seat && ASH.me.seat.t === %s && ASH.me.seat.k === "pk"' % json.dumps(T), 25), 'Ann sits down at the table')
    time.sleep(1.5)
    check(ev(pa, 'ASH.cam.mode') == 'poker', 'the view goes over her own side of the felt')
    check(ev(pa, '!ASH.ents.get("p:" + ASH.pid).root.visible'), 'her own head is out of the view')
    check(ev(pa, '!!document.querySelector(".pokerp")'), 'the poker panel is up')
    check(ev(pa, 'getComputedStyle(document.querySelector(".orbs")).display === "none"'), 'and the Ashvale HUD has stepped aside (the orbs are hidden)')
    check(ev(pa, 'ASH.ents.get("p:" + ASH.pid).loco') == 'sit', 'her avatar sits (what the others see)')
    check(bool(row(pa, 'mine')) and row(pa, 'o') == 'open', 'her table holds the felt and waits for players')
    check(len(row(pa, 'se')) == 1 and chips(pa) == 1000, 'she sits down with 1000 chips on the table')
    shot(pa, 'pk_02_seated')
    # 2. Ben arrives and watches from the bar
    pb = open_page(ctx, URL % 2, errs, 'B'); ev(pb, 'ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(460, 30)'); time.sleep(4)
    check(wait(pb, 'ASH.net().host && ASH.me.x === 460', 30), 'Ben is in the same room (%s hosts it)' % str(ev(pb, 'ASH.net().amHost')))
    REM = '[...ASH.ents.values()].filter(e => e.key && e.key.startsWith("r:") && e.root.visible)'
    check(wait(pb, REM + '.length === 1', 25), 'Ben sees Ann at the table')
    check(wait(pb, S('.se') + '.length === 1 && ' + S('.o') + ' === "open"', 15), "Ben's game knows a chair is taken and the table waits (the host's rows arrived)")
    time.sleep(1.5); shot(pb, 'pk_03_bystander')
    # 3. Ben takes the next free chair; the table deals
    check(tap(pb, 'tile', [TX, TY]), 'Ben taps the felt: the first free chair is the first line now')
    check(wait(pb, 'ASH.me.seat && ASH.me.seat.s === 1', 25), 'Ben takes the second chair')
    check(wait(pa, S('.o') + ' === "playing"', 40) and wait(pb, S('.o') + ' === "playing"', 40), 'the table deals a hand on both screens')
    check(row(pa, 'st') == 'preflop' and row(pb, 'st') == 'preflop', 'the first round, on both screens')
    check(row(pa, 'p') == 75 == row(pb, 'p') and row(pa, 'b') == 50 == row(pb, 'b'), 'the blinds are in the pot: 75 in, 50 to answer')
    check(row(pa, 'hc') and len(row(pa, 'hc')) == 2, 'Ann has been dealt two cards')
    check(ev(pa, 'document.querySelectorAll(".pokerp .cards .cd:not(.b)").length') == 2, 'her own two cards are face up in the panel')
    check(ev(pa, 'ASH.renderInfo().meshes') > MESH0 + 3, 'cards and chips are on the 3D felt (meshes %d -> %d)' % (MESH0, ev(pa, 'ASH.renderInfo().meshes')))
    time.sleep(1.5); shot(pa, 'pk_04_preflop'); shot(pb, 'pk_05_preflop_ben')
    # 4. the first to act folds; the other takes the blinds uncontested
    FOL = '!!document.querySelector(".pokerp [data-a=fold]")'
    first = None
    for _ in range(60):
        if ev(pa, FOL): first, second, fw, sw = pa, pb, 'Ann', 'Ben'; break
        if ev(pb, FOL): first, second, fw, sw = pb, pa, 'Ben', 'Ann'; break
        time.sleep(0.5)
    check(first is not None, '%s is first to act' % (fw if first else 'nobody'))
    check(click(first, '.pokerp [data-a=fold]'), '%s folds' % fw)
    check(wait(first, S('.st') + ' === "none" && ' + S('.r'), 20) and wait(second, S('.st') + ' === "none" && ' + S('.r'), 20), 'the hand is over on both screens')
    check(chips(second) == 1025 and chips(first) == 975, 'the other takes the blinds: 1025 against 975')
    check(row(first, 'p') == 0 and row(second, 'p') == 0, 'the pot has been paid out')
    check(('takes 75' in (ev(second, 'document.querySelector(".pokerp").textContent') or '')), 'the panel says who took it')
    time.sleep(1); shot(first, 'pk_06_folded'); shot(second, 'pk_07_folded_other')
    # 5. the table's own clock deals the next hand
    H = row(pa, 'h')
    check(wait(pa, S('.h') + ' > %s' % H, 60) and wait(pb, S('.o') + ' === "playing"', 60), 'the table deals the next hand by itself (hand %s)' % row(pa, 'h'))
    # 6. and this one is played through the panel: a raise, then the calls, to the river
    t0 = time.time(); steps = 0; raised = False
    while time.time() - t0 < 240 and steps < 80:
        if ev(pa, S('.st') + " === 'none'") and ev(pa, S('.r')): break
        acted = False
        for pg in (pa, pb):
            if not turn(pg): continue
            if not raised and row(pg, 'b') == 50 and row(pg, 'st') == 'preflop' and click(pg, '.pokerp [data-r]'):
                time.sleep(0.4)
                if click(pg, '.pokerp .rz [data-to]'): raised = True; steps += 1; acted = True; time.sleep(0.4); break
                continue
            if click(pg, '.pokerp [data-a=check]') or click(pg, '.pokerp [data-a=call]'):
                steps += 1; acted = True; time.sleep(0.4); break
        if not acted: time.sleep(0.5)
    check(raised, 'a raise went in through the panel (the raise list and an amount)')
    check(ev(pa, S('.st') + " === 'none'") and ev(pa, S('.r')), 'the hand ran to an end (%d actions, %ds)' % (steps, time.time() - t0))
    BOARD = row(pa, 'bo')
    check(len(BOARD) in (3, 4, 5), 'the board lies on the felt: %d cards' % len(BOARD))
    TOT = ev(pa, S('.se') + '.reduce((a,s)=>a+s[2],0) + ' + S('.p'))
    check(TOT == 2000, 'no chip is lost or invented on the way (the two seats and the pot hold %d)' % TOT)
    check(row(pa, 'h') == row(pb, 'h') and row(pa, 'p') == row(pb, 'p'), 'both screens end the hand with the same pot and the same hand count')
    time.sleep(1); shot(pa, 'pk_08_river')
    # 7. the panel of the other player shows only their own cards face up, and so does the state behind it
    check(ev(pb, 'document.querySelectorAll(".pokerp .cards .cd:not(.b)").length') in (0, 2), "Ben's panel shows at most his own cards face up")
    pr = pa if ev(pa, 'ASH.net().amHost') is False else pb   # the follower's copy is the one that gets redacted rows
    check(ev(pr, "(function(){var s=ASH.core.pokerOf(%s),own=ASH.me.seat?ASH.me.seat.s:-1,sh=(s.o==='playing'&&s.st==='none');"
                 "return (s.hc||[]).every(h=>(h[0]|0)===own||sh||(h[1]==null&&h[2]==null))})()" % json.dumps(T)),
          "the copy that follows the host carries no face for anyone but its own seat (the row is redacted where it lands - plan decision 4)")
    # 8. stand up: it asks first, and a hand in play folds
    check(click(pb, '.pokerp [data-a=stand]'), 'Ben asks to stand')
    check(wait(pb, 'getComputedStyle(document.querySelector(".help")).display === "block"', 10), 'standing up asks first (a confirm over the panel)')
    pb.click('.help [data-a=yes]')
    check(wait(pb, '!ASH.me.seat && ASH.cam.mode !== "poker" && !document.querySelector(".pokerp")', 15), 'Ben confirms: camera and HUD come back')
    check(wait(pb, 'getComputedStyle(document.querySelector(".orbs")).display !== "none"', 10), 'the orbs are back with the HUD')
    check(wait(pa, S('.se') + '.length === 1', 20), "Ann's screen knows Ben has left the table")
    time.sleep(1.5); shot(pb, 'pk_09_stood')
    check(click(pa, '.pokerp [data-a=stand]'), 'Ann asks to stand too')
    check(wait(pa, 'getComputedStyle(document.querySelector(".help")).display === "block"', 10), 'and is asked first')
    pa.click('.help [data-a=yes]')
    check(wait(pa, '!ASH.me.seat && ASH.cam.mode !== "poker"', 15) and wait(pa, S('.o') + ' === "open"', 20), 'the felt is open for the next pair')
    time.sleep(1.5); shot(pa, 'pk_10_after')
    bad = [e for e in errs if 'favicon' not in e]
    check(not bad, 'no console errors (%d)' % len(bad)); [print('     ', e[:160]) for e in bad[:8]]
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'all ok')
sys.exit(1 if fails else 0)
