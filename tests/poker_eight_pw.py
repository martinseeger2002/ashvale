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

"""[Claude 2026-10-13] EIGHT AT ONE TABLE, watched (the operator: "Play multiple windows ... Up to eight players ... Arrange them on my
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

with sync_playwright() as p:
    show = not os.environ.get('HEADLESS')
    b = p.chromium.launch(headless=not show, args=(['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] if show else ARGS)); errs = []   # a covered window must keep playing
    ctx = b.new_context(no_viewport=True) if show else b.new_context(viewport={'width': 640, 'height': 540})   # one context: the loopback room is a BroadcastChannel
    pages = []
    W, H, TOP = SW // COLS, (SH // 2) // ROWS, SH // 2   # [Claude] the desktop is two 2560x1080 screens: the eight tile the lower (main) one
    first = None
    for i, nm in enumerate(NAMES):
        url = URL % (80 + i)
        if not show or first is None:
            pg = open_page(ctx, url, errs, nm); first = pg
            if show: place(pg, 0, W, H, TOP)
        else:   # a popup is its own window, placed where it is asked to be, and stays in the context (one loopback room)
            with ctx.expect_page() as info:
                first.evaluate('([u, f]) => window.open(u, "_blank", f)', [url, 'popup=1,left=%d,top=%d,width=%d,height=%d' % ((i % COLS) * W, TOP + (i // COLS) * H, W, H)])
            pg = info.value; pg.on('pageerror', lambda e, nm=nm: errs.append(nm + ' PAGEERROR ' + str(e))); pg.on('console', lambda m, nm=nm: m.type == 'error' and errs.append(nm + ' ' + m.text))
            wait(pg, '!!(window.ASH && ASH.core)', 90); time.sleep(1); ev(pg, 'ASH.hud.showHelp(false)')
            place(pg, i, W, H, TOP)
        pages.append(pg)
        ev(pg, 'ASH.core.cmd("me", {c: "look", name: %s}); ASH.teleport(%d, 30)' % (json.dumps(nm), 455 + i % 4)); time.sleep(2)
    print('-- 1. eight sit down and play')
    for pg in pages: upstairs(pg); time.sleep(0.5)
    check(all(wait(pg, 'ASH.me.lv === 1', 60) for pg in pages), 'all eight go up to the card room')
    host = next((pg for pg in pages if wait(pg, 'ASH.net().amHost', 2)), None)
    check(host is not None, 'one of them deals the room: %s' % (NAMES[pages.index(host)] if host else '-'))
    for i, pg in enumerate(pages): sit(pg, i, 0); time.sleep(0.6)
    check(all(wait(pg, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30) for pg in pages), 'all eight are sitting at one table')
    check(all(wait(pg, S('.st') + " !== 'none'", 60) for pg in pages), 'a hand is dealt to every screen')
    h0 = hands(host)
    check(play(pages, lambda: hands(host) >= h0 + 2, 300), 'two hands are played through at eight (hand %d)' % hands(host))

    print('-- 2. the dealer leaves on its own turn')
    check(play(pages, lambda: False, 240, leaver=host), '  the turn comes round to the dealer (%s)' % NAMES[pages.index(host)])
    gone = NAMES[pages.index(host)]; host.close(); t0 = time.time()
    rest = live(pages)
    nh = None; t1 = time.time()
    while time.time() - t1 < 40 and nh is None:
        nh = next((pg for pg in rest if ev(pg, 'ASH.net().amHost')), None); time.sleep(0.5)
    check(nh is not None, '  someone takes the dealing over: %s (%.0f s)' % (NAMES[pages.index(nh)] if nh else '-', time.time() - t0))
    hg = hands(rest[0])
    ok = play(rest, lambda: hands(rest[0]) > hg or ev(rest[0], '%s.st === "none" && !(%s.se || []).length' % (S(''), S(''))), 120)
    check(ok, '  the table does not freeze on %s: it plays on or is opened again (%.0f s)' % (gone, time.time() - t0))
    if not ok: print('     row', ev(rest[0], 'JSON.stringify(%s)' % S(''))[:500])

    print('-- 3. everyone left sits again; a guest leaves on its turn')
    for pg in rest:
        if not ev(pg, '!!(ASH.me.seat && ASH.me.seat.k === "pk")'): sit(pg, pages.index(pg), 0); time.sleep(0.6)
    check(all(wait(pg, 'ASH.me.seat && ASH.me.seat.k === "pk"', 40) for pg in rest), '  the seven are sitting again')
    check(wait(nh, S('.st') + " !== 'none'", 60), '  and a hand is dealt')
    guest = next(pg for pg in rest if pg is not nh)
    check(play(rest, lambda: False, 240, leaver=guest), '  the turn comes round to a guest (%s)' % NAMES[pages.index(guest)])
    gname = NAMES[pages.index(guest)]; gid = ev(guest, 'ASH.pid'); guest.close(); t0 = time.time()
    rest = live(pages)
    ok = play(rest, lambda: not ev(nh, '(%s.se || []).some(x => x[1] === %s)' % (S(''), json.dumps(gid))), 150)
    check(ok, '  the dealer frees %s\'s chair and the game goes on (%.0f s)' % (gname, time.time() - t0))
    h1 = hands(nh)
    check(play(rest, lambda: hands(nh) >= h1 + 1, 240), '  another hand is played at six (hand %d)' % hands(nh))
    errs = [e for e in errs if 'favicon' not in e and 'status of 404' not in e]   # a missing optional file (404) is not a game error
    check(not errs, 'no page errors (%d)%s' % (len(errs), (': ' + errs[0][:200]) if errs else ''))
    if show: time.sleep(5)
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
