"""2026-10-12, playing a 1/2 card table with a friend: "calling on the river ... it just gets locked on the call fold
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
def turn(pg): return bool(ev(pg, S('.a') + ' === ASH.me.seat.s'))
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

"""(helpers shared with poker_eight_pw.py) [Claude 2026-10-13] EIGHT AT ONE TABLE, watched (the operator: "Play multiple windows ... Up to eight players ... Arrange them on my
desktop so that I can see them"; and "If someone leaves a game, their timer stops and the game gets stuck").
Eight real games in one loopback room, each in its own window tiled 4 x 2 over the desktop (DISPLAY=:1):
  1. all eight climb to the card room and sit at poker1; hands are played out (each acts on its own turn);
  2. the DEALER leaves on its own turn: the others take over and the table must not freeze on "... to act";
  3. everyone left sits again; a GUEST leaves on its turn: the dealer folds it on the clock and frees its chair.
  DISPLAY=:1 python3 tests/poker_eight_pw.py   (HEADLESS=1 to run unseen; PACE=seconds between actions, default 0.8)"""
NAMES = ['Ann', 'Ben', 'Cal', 'Dot', 'Eve', 'Fin', 'Gus', 'Hal']
PACE = float(os.environ.get('PACE', '0.8'))
SW, SH, COLS, ROWS = 2560, 2160, 4, 2
def place(pg, i, W, H, TOP):
    """the page's own window to its tile on the desktop"""
    try:
        s = pg.context.new_cdp_session(pg); w = s.send('Browser.getWindowForTarget')['windowId']
        s.send('Browser.setWindowBounds', {'windowId': w, 'bounds': {'windowState': 'normal'}})
        s.send('Browser.setWindowBounds', {'windowId': w, 'bounds': {'left': (i % COLS) * W, 'top': TOP + (i // COLS) * H, 'width': W, 'height': H}})
    except Exception as e: print('     (window not placed: %s)' % str(e)[:80])
def live(pages): return [pg for pg in pages if not pg.is_closed()]
def to_act(pages):
    """the page whose turn it is now, or None"""
    for pg in live(pages):
        try:
            if ev(pg, '!!ASH.me.seat && ' + S(".st") + " !== 'none' && " + S(".a") + ' === ASH.me.seat.s'): return pg
        except Exception: pass
    return None
def play(pages, until, t=180, leaver=None):
    """act for whoever is to act (mostly call/check, now and then a raise or a fold) until `until()` or `leaver` is to act"""
    import random
    t0 = time.time(); n = 0
    while time.time() - t0 < t:
        if until(): return True
        pg = to_act(pages)
        if pg is not None:
            if leaver is not None and pg is leaver: return True
            r = random.random()
            a = 'raise' if r < 0.12 else 'fold' if r < 0.2 else 'call'
            if a == 'raise': act(pg, 'raise', int(ev(pg, '(%s.mr|0)' % S('')) or 0) + int(ev(pg, '(%s.b|0)' % S('')) or 0))
            else: act(pg, a)
            n += 1; time.sleep(PACE)
        else: time.sleep(0.25)
    return False
def hands(pg): return ev(pg, '(%s.h|0)' % S(''))


"""[Claude 2026-10-13] THE STAND-UP CASES, watched in eight windows (the operator: "test different cases like when a player stands up
from a game and a new player wants to sit down in the seat that last player just stood up from. Or if somebody stands up when
it's their turn to act. Or if somebody stands up when they're the dealer. ... a player stands up from one seat and then sits
back down in another seat. Or when they are the dealer and it's their time to act.
Or if somebody stands up before their turn to act." and "If someone leaves a game, their timer stops and the game gets stuck").
Six sit (Ann..Fin), Gus and Hal wait to take the chairs that are given up. After every case: the hand goes on (the turn is never
left on an empty chair), the chair is free on every screen, and whoever sits in it next is dealt into the next hand.
  DISPLAY=:1 python3 tests/poker_cases_pw.py   (HEADLESS=1 unseen; CASES=1,2,... to pick; PACE=seconds per action)"""
import random
PK_CARD = 8
def host_of(pages):   # [Claude 2026-10-13] the game DEALING the table: elected in the table's own room (ASH.tables), else the area's host
    return next((pg for pg in live(pages) if ev(pg, '(ASH.tables && ASH.tables().tj[%s]) ? ASH.tables().deal[%s] === ASH.net().myId : ASH.net().amHost' % (json.dumps(T), json.dumps(T)))), None)
def seat_of(pg): return ev(pg, '(ASH.me.seat && ASH.me.seat.k === "pk") ? ASH.me.seat.s : -1')
def diag(pages, why):
    h = host_of(pages) or live(pages)[0]
    print('     DIAG (%s) on %s' % (why, NAMES[pages.index(h)]))
    print('     row ', ev(h, 'JSON.stringify((function(s){return {o:s.o,st:s.st,a:s.a,d:s.d,h:s.h,v:s.v,mine:s.mine,wt:s.wt,tt:s.tt,se:s.se}})(%s))' % S(''))[:600])
    print('     game', ev(h, '(function(){var t=ASH.core.pokerGame(%s);if(!t)return "none";return JSON.stringify({street:t.street,toAct:t.toAct,status:t.status,hand:t.hand,dealer:t.dealer,playable:t.playable&&t.playable(),seats:t.seats.map(s=>s&&[s.id,s.in?1:0,s.away?1:0,s.folded?1:0,s.chips])})})()' % json.dumps(T))[:700])
    print('     tick', ev(h, 'ASH.core.S.t'), 'host', ev(h, 'ASH.net().host'), 'sending', ev(h, 'JSON.stringify(ASH.net().stats)')[:300])
    for pg in live(pages):   # what each screen believes: its own seat, whose turn, which hand
        try: print('     %-4s' % NAMES[pages.index(pg)], ev(pg, 'JSON.stringify({pid: ASH.pid, seat: ASH.me.seat, a: %s.a, h: %s.h, st: %s.st, v: %s.v, mine: (((%s.se||[]).find(x=>x[1]===ASH.pid))||null)})' % ((S(''),) * 5))[:300])
        except Exception as e: print('     %-4s' % NAMES[pages.index(pg)], 'ERR', str(e)[:100])
def pick_turn(pages, want, t=240):
    """play on until the page to act satisfies want(pg); return it (None on timeout)"""
    t0 = time.time()
    while time.time() - t0 < t:
        pg = to_act(pages)
        if pg is not None:
            if want(pg): return pg
            r = random.random(); act(pg, 'fold' if r < 0.08 else 'call'); time.sleep(PACE)
        else: time.sleep(0.25)
    return None
def goes_on(pages, h, why, t=150):
    """the game goes on: the host's hand number passes the one now running"""
    hs = hands(h); ok = play(pages, lambda: hands(host_of(pages) or h) > hs, t)
    check(ok, '  the game goes on (%s): hand %d -> %d' % (why, hs, hands(host_of(pages) or h)))
    if not ok: diag(pages, why)
    return ok
def chair_free(pages, si, why, t=15):
    ok = all(wait(pg, '!(%s.se || []).some(x => x[0] === %d)' % (S(''), si), t) for pg in live(pages))
    check(ok, '  chair %d is free on every screen (%s)' % (si + 1, why))
    if not ok: diag(pages, 'chair %d' % (si + 1))
    return ok
def turn_moves(pages, si, why, t=12):
    h = host_of(pages)
    ok = wait(h, '%s.st === "none" || %s.a !== %d' % (S(''), S(''), si), t)
    check(ok, '  the turn does not wait on the empty chair (%s)' % why)
    if not ok: diag(pages, why)
def sit_in(pages, pg, si, why):
    sit(pg, si, 0)
    ok = wait(pg, 'ASH.me.seat && ASH.me.seat.k === "pk" && ASH.me.seat.s === %d' % si, 30)
    check(ok, '  %s sits in chair %d (%s)' % (NAMES[pages.index(pg)], si + 1, why))
    if not ok: diag(pages, 'sit'); return False
    h = host_of(pages); hs = hands(h)
    ok = play(pages, lambda: hands(host_of(pages) or h) > hs and ev(pg, '!!(((%s.se || []).find(x => x[1] === ASH.pid) || [])[4] & %d)' % (S(''), PK_CARD)), 150)
    check(ok, '  and is dealt into the next hand')
    if not ok: diag(pages, 'dealt in')
    return ok


"""[Claude 2026-10-13] STAKES AND BALANCES (the operator: "You should be testing with different stakes like with 100 gold and 1000 gold
make sure players balances are being paid out properly"). Four players in four windows; a round at a 100 GOLD buy-in and a round
at 1000: hands with calls, raises and folds; a player stands on its turn and buys in again, one stands before its turn, one moves
chairs; at the end everyone stands. Each game's own buy-in and cash-out messages are counted (a hook on its core), and:
  - every player's GOLD = what it had - its buy-ins + its cash-outs (nobody paid twice, nobody charged twice);
  - all the GOLD in the four bags + the house's cut (the table's rk) = the GOLD the four had before the round;
  - every buy-in was exactly the table's stake.
  DISPLAY=:1 python3 tests/poker_stakes_pw.py   (HEADLESS=1 unseen; STAKES=100,1000)"""
import re
N4 = NAMES[:4]
HOOK = """(function(){if(window.__pk)return;window.__pk=[];var h=ASH.hud,o=h.chat;h.chat=function(t){try{if(/buy in for|cash out|comes back to you|leave the table with nothing/.test(String(t||'')))window.__pk.push(String(t))}catch(x){}return o.apply(this,arguments)}})()"""   # what the player is told, from any path (host tick or a dealer's row)
def ledger(pg):
    """(buy-ins, cash-outs) this game has told its own player since the hook went in"""
    txt = ev(pg, 'window.__pk || []'); b = c = 0; nb = 0
    for t in txt:
        m = re.search(r'buy in for (\d+)', t)
        if m: b += int(m.group(1)); nb += 1; continue
        m = re.search(r'cash out (\d+)', t) or re.search(r'your (\d+) GOLD on it comes back', t)
        if m: c += int(m.group(1))
    return b, c, nb
def rake(pg): return int(ev(pg, '(%s.rk|0)' % S('')) or 0)

with sync_playwright() as p:
    show = not os.environ.get('HEADLESS')
    stakes = [int(x) for x in os.environ.get('STAKES', '100,1000').split(',')]
    b = p.chromium.launch(headless=not show, args=(['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] if show else ARGS)); errs = []   # a covered window must keep playing
    ctx = b.new_context(no_viewport=True) if show else b.new_context(viewport={'width': 640, 'height': 540})
    pages = []; W, H, TOP = SW // 4, SH // 2, SH // 2; first = None
    for i, nm in enumerate(N4):
        url = URL % (280 + i)
        if not show or first is None:
            pg = open_page(ctx, url, errs, nm); first = pg
            if show: place(pg, 0, W, H, TOP)
        else:
            with ctx.expect_page() as info:
                first.evaluate('([u, f]) => window.open(u, "_blank", f)', [url, 'popup=1,left=%d,top=%d,width=%d,height=%d' % (i * W, TOP, W, H)])
            pg = info.value; pg.on('pageerror', lambda e, nm=nm: errs.append(nm + ' PAGEERROR ' + str(e))); pg.on('console', lambda m, nm=nm: m.type == 'error' and errs.append(nm + ' ' + m.text))
            wait(pg, '!!(window.ASH && ASH.core)', 90); time.sleep(1); ev(pg, 'ASH.hud.showHelp(false)'); place(pg, i, W, H, TOP)
        pages.append(pg); ev(pg, 'ASH.core.cmd("me", {c: "look", name: %s}); ASH.teleport(%d, 30)' % (json.dumps(nm), 455 + i)); time.sleep(2)
    for pg in pages: upstairs(pg); time.sleep(0.4)
    check(all(wait(pg, 'ASH.me.lv === 1', 60) for pg in pages), 'all four go up to the card room')
    for pg in pages: ev(pg, 'ASH.give("coins", 20000)'); ev(pg, HOOK)
    hst = host_of(pages); check(hst is not None, 'the table has a dealer: %s' % (N4[pages.index(hst)] if hst else '-'))

    for B in stakes:
        print('-- a round at a buy-in of %d GOLD' % B)
        time.sleep(2)
        start = [coins(pg) for pg in pages]; led0 = [ledger(pg) for pg in pages]; rk0 = rake(hst)
        sit(pages[0], 0, B); ok = wait(pages[0], 'ASH.me.seat && ASH.me.seat.k === "pk"', 30)
        check(ok and wait(hst, '(%s.buy|0) === %d' % (S(''), B), 15), '  Ann sits first and sets the stakes: %d' % (ev(hst, '(%s.buy|0)' % S('')) or 0))
        for i, pg in enumerate(pages[1:], 1): sit(pg, i * 2, 0); time.sleep(0.5)
        check(all(wait(pg, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30) for pg in pages), '  the other three join at those stakes')
        check(all(wait(pg, '(function(){var c=ASH.me.inv.reduce((n,s)=>n+(s&&s.id==="coins"?s.n:0),0);return c === %d})()' % (start[i] - B), 15) for i, pg in enumerate(pages)), '  each paid exactly %d GOLD to sit: %s' % (B, [start[i] - coins(pg) for i, pg in enumerate(pages)]))
        h0 = hands(hst); play(pages, lambda: hands(hst) >= h0 + 2, 300)
        print('     two hands played (hand %d); stacks %s' % (hands(hst), ev(hst, 'JSON.stringify((%s.se||[]).map(x=>[x[0],x[2]]))' % S(''))))
        g = pick_turn(pages, lambda x: x is pages[2])
        if g: stand(g); time.sleep(2); sit(g, 4, 0); check(wait(g, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30), '  Cal stands on his turn (cashed out) and buys in again')
        pick_turn(pages, lambda x: x is not pages[3]); stand(pages[3]); time.sleep(2)
        sit(pages[3], 7, 0); check(wait(pages[3], 'ASH.me.seat && ASH.me.seat.s === 7', 30), '  Dot stands before her turn and sits in another chair (buying in again)')
        h1 = hands(hst); play(pages, lambda: hands(hst) >= h1 + 2, 300)
        print('     two more hands (hand %d); stacks %s' % (hands(hst), ev(hst, 'JSON.stringify((%s.se||[]).map(x=>[x[0],x[2]]))' % S(''))))
        for pg in pages:
            if seat_of(pg) >= 0: stand(pg); time.sleep(0.8)
        check(all(wait(pg, '!(ASH.me.seat && ASH.me.seat.k === "pk")', 30) for pg in pages), '  everyone stands up')
        check(wait(hst, '!(%s.se || []).length' % S(''), 30), '  the table is empty')
        time.sleep(3)
        end = [coins(pg) for pg in pages]; led1 = [ledger(pg) for pg in pages]; rk = rake(hst) - rk0
        for i, pg in enumerate(pages):
            bi, co, nb = led1[i][0] - led0[i][0], led1[i][1] - led0[i][1], led1[i][2] - led0[i][2]
            check(bi == B * nb and nb >= 1, '  %s: %d buy-in(s) of %d GOLD each (%d)' % (N4[i], nb, B, bi))
            check(end[i] == start[i] - bi + co, '  %s: %d - %d bought in + %d cashed out = %d, and the bag holds %d' % (N4[i], start[i], bi, co, start[i] - bi + co, end[i]))
        check(sum(end) + rk == sum(start), '  nothing made or lost: bags %d + house %d = %d, before %d' % (sum(end), rk, sum(end) + rk, sum(start)))
    errs = [e for e in errs if 'favicon' not in e and 'status of 404' not in e]   # a missing optional file (404) is not a game error
    check(not errs, 'no page errors (%d)%s' % (len(errs), (': ' + errs[0][:200]) if errs else ''))
    if show: time.sleep(4)
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
