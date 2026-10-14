"""(header kept from poker_flow_pw.py)
2026-10-12, playing a 1/2 card table with a friend: "calling on the river ... it just gets locked on the call fold
raise option"; "it shows the cards of people who folded"; "once you play on a table and leave it won't let you sit back
down"; "the game stays active even after all the players have left"; "the minimum bet on a one two blind says 50".
Two real games in one loopback room (Ann deals, Ben follows), played through those exact moments.
  python3 tests/poker_flow_pw.py   (server: python3 -m http.server 8731 in ~/ashvale3d)"""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'shots')
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

T = 'poker1'; TX, TY = 454, 28   # [Claude 2026-10-11] the west of the two big tables upstairs (its felt covers 454-455 x 28-29)
S = lambda f='': 'ASH.core.pokerOf(%s)%s' % (json.dumps(T), f)
def row(pg, field): return ev(pg, S('.' + field))
def turn(pg): return bool(ev(pg, '!!ASH.me.seat && ' + S('.a') + ' === ASH.me.seat.s'))
def click(pg, sel, ms=2500):
    try:
        pg.click(sel, timeout=ms); return True   # the panel redraws on every row, so this is looked up again on each try
    except Exception:
        return False
def upstairs(pg):   # what tapping the stairs sends: the climb act at the building's flight (the floor bar is gone)
    ev(pg, '(function(){var bi=ASH.core.M.buildingAt(ASH.me.x,ASH.me.y),B=ASH.core.M.buildings[bi];ASH.core.cmd("me",{c:"climb",dir:1,x:B.stairs[0],y:B.stairs[1]})})()')
def chips(pg):
    return ev(pg, '(function(){var s=ASH.core.pokerOf(%s),m=(s.se||[]).find(x=>x[1]===ASH.pid);return m?m[2]:null})()' % json.dumps(T))

from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu'] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=pflow%d'
def coins(pg): return ev(pg, 'ASH.me.inv.reduce((n, s) => n + (s && s.id === "coins" ? s.n : 0), 0)')
def seated(pg): return bool(ev(pg, '!!(ASH.me.seat && ASH.me.seat.k === "pk")'))
def chips(pg): return ev(pg, '(function(){var s=%s,m=(s.se||[]).find(x=>x[1]===ASH.pid);return m?m[2]:null})()' % S(''))
def act(pg, a, to=None): ev(pg, 'ASH.core.cmd("me", %s)' % json.dumps({'c': 'pact', 'a': a, **({'to': to} if to is not None else {})}))
def sit(pg, seat, buy): ev(pg, 'ASH.core.cmd("me", %s)' % json.dumps({'c': 'sit', 'table': T, 'seat': seat, 'buy': buy}))
def stand(pg): ev(pg, 'ASH.core.cmd("me", {c: "stand"})')

"""[Claude 2026-10-13] the operator: "If someone leaves a game, their timer stops and the game gets stuck" (@apple dealt, left mid-hand
with the turn on itself; @gx1 took the area over and the table sat on "@apple to act" for minutes). Two real games in one
loopback room:
  1. the DEALER leaves on its own turn: the one left takes over and the table is opened again (no deck travels), its chair free;
  2. a GUEST leaves on its turn: the dealer folds it on the clock and frees its chair (0.8.114 pokerPresence, ~45 s gone).
  SHOW=1 opens the browsers on the desktop (DISPLAY=:1) so it can be watched.  python3 tests/poker_leave_pw.py"""
SHOW = bool(os.environ.get('SHOW'))
def until_turn(pa, pb, who, t=90):
    """play the hand on until `who` (pa or pb) is to act: the other checks/calls"""
    t0 = time.time()
    while time.time() - t0 < t:
        for pg in (pa, pb):
            if ev(pg, S(".st") + " !== 'none' && " + S(".a") + " >= 0") and turn(pg):
                if pg is who: return True
                act(pg, 'call'); time.sleep(0.6)
        time.sleep(0.3)
    return False

with sync_playwright() as p:
    args = [] if SHOW else ARGS
    b = p.chromium.launch(headless=not SHOW, args=args); errs = []
    def pair(n):
        ca = cb = b.new_context(viewport={'width': 760, 'height': 520})   # one context: the loopback room is a BroadcastChannel
        pa = open_page(ca, URL % (10 + n), errs, 'A'); ev(pa, 'ASH.core.cmd("me", {c: "look", name: "Ann"}); ASH.teleport(457, 30)'); time.sleep(4)
        pb = open_page(cb, URL % (20 + n), errs, 'B'); ev(pb, 'ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(458, 30)'); time.sleep(4)
        for pg in (pa, pb): upstairs(pg)
        check(wait(pa, 'ASH.me.lv === 1', 40) and wait(pb, 'ASH.me.lv === 1', 40), 'both go up to the card room')
        check(wait(pa, 'ASH.net().amHost', 20), 'Ann deals the room (the host)')
        sit(pa, 0, 0); check(wait(pa, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30), 'Ann sits (free chips)')
        sit(pb, 1, 0); check(wait(pb, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30), 'Ben sits')
        check(wait(pa, S('.st') + " !== 'none'", 40) and wait(pb, S('.st') + " !== 'none'", 40), 'a hand is dealt')
        return ca, cb, pa, pb

    print('-- 1. the dealer leaves on its own turn')
    ca, cb, pa, pb = pair(1)
    check(until_turn(pa, pb, pa), 'the turn comes round to Ann (the dealer)')
    pa.close(); t0 = time.time()
    check(wait(pb, 'ASH.net().amHost', 40), '  Ben takes the area over (%.0f s)' % (time.time() - t0))
    ok = wait(pb, '!(%s.se || []).some(x => x[1] !== ASH.pid) && (%s.st === "none")' % (S(''), S('')), 90)
    check(ok, '  the table does not sit on "Ann to act": it is opened again, Ann gone from it (%.0f s)' % (time.time() - t0))
    if not ok: print('     row', ev(pb, 'JSON.stringify(%s)' % S('')) [:400]); print('     net', ev(pb, 'JSON.stringify(ASH.net())')[:300])
    sit(pb, 1, 0); check(wait(pb, 'ASH.me.seat && ASH.me.seat.k === "pk"', 20), '  and Ben can sit (or is still sat) at it')
    ca.close()

    print('-- 2. a guest leaves on its turn')
    ca, cb, pa, pb = pair(2)
    check(until_turn(pa, pb, pb), 'the turn comes round to Ben (a guest)')
    pb.close(); t0 = time.time()
    ok = wait(pa, '!(%s.se || []).some(x => x[1] !== ASH.pid)' % S(''), 120)
    check(ok, '  the dealer frees Ben\'s chair (%.0f s)' % (time.time() - t0))
    if not ok: print('     row', ev(pa, 'JSON.stringify(%s)' % S(''))[:400])
    ca.close()
    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, 'no page errors (%d)%s' % (len(errs), (': ' + errs[0][:200]) if errs else ''))
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
