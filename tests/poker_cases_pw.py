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
    print('     tick', ev(h, 'ASH.core.S.t'), 'tables', ev(h, 'JSON.stringify(ASH.tables ? ASH.tables() : null)')[:300], 'sending', ev(h, 'JSON.stringify(ASH.net().stats)')[:200])
    for pg in live(pages):   # what each screen believes: its own seat, whose turn, which hand
        try: print('     %-4s' % NAMES[pages.index(pg)], ev(pg, 'JSON.stringify({pid: ASH.pid, seat: ASH.me.seat, a: %s.a, h: %s.h, st: %s.st, v: %s.v, mine: (((%s.se||[]).find(x=>x[1]===ASH.pid))||null)})' % ((S(''),) * 5))[:300])
        except Exception as e: print('     %-4s' % NAMES[pages.index(pg)], 'ERR', str(e)[:100])
def back_in(pages):   # a player dealt out (a missed turn) presses Back, as a person would
    for pg in live(pages):
        try:
            if ev(pg, '!!(((%s.se || []).find(x => x[1] === ASH.pid) || [])[4] & 32)' % S('')): act(pg, 'back')
        except Exception: pass
def pick_turn(pages, want, t=240):
    """play on until the page to act satisfies want(pg); return it (None on timeout)"""
    t0 = time.time(); bk = 0
    while time.time() - t0 < t:
        if time.time() - bk > 5: bk = time.time(); back_in(pages)
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

with sync_playwright() as p:
    show = not os.environ.get('HEADLESS')
    want = set(int(x) for x in os.environ.get('CASES', '1,2,3,9,4,5,8,6,7').split(','))
    b = p.chromium.launch(headless=not show, args=(['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] if show else ARGS)); errs = []   # a covered window must keep playing
    ctx = b.new_context(no_viewport=True) if show else b.new_context(viewport={'width': 640, 'height': 540})
    pages = []; W, H, TOP = SW // COLS, (SH // 2) // ROWS, SH // 2; first = None
    for i, nm in enumerate(NAMES):
        url = URL % (180 + i)
        if not show or first is None:
            pg = open_page(ctx, url, errs, nm); first = pg
            if show: place(pg, 0, W, H, TOP)
        else:
            with ctx.expect_page() as info:
                first.evaluate('([u, f]) => window.open(u, "_blank", f)', [url, 'popup=1,left=%d,top=%d,width=%d,height=%d' % ((i % COLS) * W, TOP + (i // COLS) * H, W, H)])
            pg = info.value; pg.on('pageerror', lambda e, nm=nm: errs.append(nm + ' PAGEERROR ' + str(e))); pg.on('console', lambda m, nm=nm: m.type == 'error' and errs.append(nm + ' ' + m.text))
            wait(pg, '!!(window.ASH && ASH.core)', 90); time.sleep(1); ev(pg, 'ASH.hud.showHelp(false)'); place(pg, i, W, H, TOP)
        pages.append(pg); ev(pg, 'ASH.core.cmd("me", {c: "look", name: %s}); ASH.teleport(%d, 30)' % (json.dumps(nm), 455 + i % 4)); time.sleep(2)
    for pg in pages: upstairs(pg); time.sleep(0.4)
    check(all(wait(pg, 'ASH.me.lv === 1', 60) for pg in pages), 'all eight go up to the card room')
    for i, pg in enumerate(pages[:6]): sit(pg, i, 0); time.sleep(0.5)
    check(all(wait(pg, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30) for pg in pages[:6]), 'six sit down (Gus and Hal wait by the wall)')
    h = host_of(pages); check(h is not None, 'the table has a dealer: %s' % (NAMES[pages.index(h)] if h else '-'))
    check(wait(h, S('.st') + " !== 'none'", 60), 'a hand is dealt')
    deals = [ev(pg, '(ASH.tables && ASH.tables().deal[%s]) || null' % json.dumps(T)) for pg in pages]
    rooms = [ev(pg, '(ASH.tables ? ASH.tables().rooms : []).length') for pg in pages]
    check(len(set(deals)) == 1 and deals[0] and all(r >= 1 for r in rooms), 'every screen is in the table\'s own room and names the same dealer: %s rooms %s' % (deals, rooms))
    waiting = [pages[6], pages[7]]
    def guests(): hh = host_of(pages); return [pg for pg in live(pages) if pg is not hh and seat_of(pg) >= 0]
    def button(pg): return seat_of(pg) >= 0 and seat_of(pg) == ev(host_of(pages), '%s.d' % S(''))

    if 1 in want:
        print('-- 1. a guest stands up BEFORE its turn; Gus takes the chair')
        pg = pick_turn(pages, lambda x: True)   # someone is to act; the stander is another guest still in the hand, not the button
        cand = [g for g in guests() if g is not pg and not button(g) and ev(g, '!!(((%s.se || []).find(x => x[1] === ASH.pid) || [])[4] & 1)' % S(''))]
        if cand:
            g = cand[0]; si = seat_of(g); print('     %s stands from chair %d (to act: %s)' % (NAMES[pages.index(g)], si + 1, NAMES[pages.index(pg)]))
            stand(g); chair_free(pages, si, 'stood before its turn'); goes_on(pages, h, 'case 1')
            w = waiting.pop(0); sit_in(pages, w, si, 'the chair just given up'); waiting.append(g)
        else: check(False, 'case 1: no guest to stand')
    if 2 in want:
        print('-- 2. a guest stands up ON its turn; Hal takes the chair')
        g = pick_turn(pages, lambda x: x is not host_of(pages) and not button(x))
        if g:
            si = seat_of(g); print('     %s stands on its turn from chair %d' % (NAMES[pages.index(g)], si + 1))
            stand(g); turn_moves(pages, si, 'stood on its turn'); chair_free(pages, si, 'stood on its turn'); goes_on(pages, h, 'case 2')
            w = waiting.pop(0); sit_in(pages, w, si, 'the chair just given up'); waiting.append(g)
        else: check(False, 'case 2: the turn never came to a guest')
    if 3 in want:
        print('-- 3. the BUTTON (the dealer seat) stands up when it is not its turn; it sits straight back down')
        g = pick_turn(pages, lambda x: True)
        bt = next((x for x in guests() if button(x) and x is not g), None) or next((x for x in live(pages) if button(x) and x is not g), None)
        if bt:
            si = seat_of(bt); print('     %s (button, chair %d) stands' % (NAMES[pages.index(bt)], si + 1))
            stand(bt); chair_free(pages, si, 'the button stood up'); goes_on(pages, h, 'case 3')
            sit_in(pages, bt, si, 'back in the same chair')
        else: check(False, 'case 3: the button was the one to act; skipped')
    if 4 in want:
        print('-- 4. the BUTTON stands up ON its turn; Gus or Hal takes the chair')
        bt = pick_turn(pages, lambda x: button(x))
        if bt:
            si = seat_of(bt); print('     %s (button) stands on its turn from chair %d' % (NAMES[pages.index(bt)], si + 1))
            stand(bt); turn_moves(pages, si, 'the button stood on its turn'); chair_free(pages, si, 'the button on its turn'); goes_on(pages, h, 'case 4')
            w = waiting.pop(0); sit_in(pages, w, si, 'the button\'s chair'); waiting.append(bt)
        else: check(False, 'case 4: the turn never came to the button')
    if 5 in want:
        print('-- 5. the DEALER (the game dealing the table) stands up on its turn and sits back down')
        hh = host_of(pages); g = pick_turn(pages, lambda x: x is hh)
        if g:
            si = seat_of(g); stand(g); turn_moves(pages, si, 'the host stood on its turn'); chair_free(pages, si, 'the host stood'); goes_on(pages, h, 'case 5')
            sit_in(pages, g, si, 'the host back in its chair')
        else: check(False, 'case 5: the turn never came to the dealer'); diag(pages, 'case 5')
    if 6 in want:
        print('-- 6. a guest CLOSES its window on its turn')
        g = pick_turn(pages, lambda x: x is not host_of(pages))
        if g:
            si = seat_of(g); nm = NAMES[pages.index(g)]; g.close(); print('     %s is gone (chair %d)' % (nm, si + 1))
            turn_moves(pages, si, 'a guest left on its turn', 75); chair_free(pages, si, 'a guest left', 75); goes_on(pages, host_of(pages), 'case 6')
            w = next((x for x in live(pages) if seat_of(x) < 0), None)
            if w: sit_in(pages, w, si, 'the chair of the one who left')
    if 7 in want:
        print('-- 7. the DEALER closes its window on its turn')
        hh = host_of(pages); g = pick_turn(pages, lambda x: x is hh)
        if not g: check(False, 'case 7: the turn never came to the dealer'); diag(pages, 'case 7')
        if g:
            SEATLOG = "(function(){var m=ASH.me,v=m.seat;window.__seatlog=[];Object.defineProperty(m,'seat',{configurable:true,get(){return v},set(x){window.__seatlog.push([JSON.stringify(x),(new Error().stack||'').split('\\n').slice(2,6).map(l=>l.trim().replace(/https?:[^ )]*\\//g,'')).join(' < ')]);v=x}})})()"
            for x in live(pages):
                if x is not g: ev(x, SEATLOG)
            nm = NAMES[pages.index(g)]; g.close(); t0 = time.time(); print('     %s (the dealer) is gone' % nm)
            nh = None
            while time.time() - t0 < 40 and nh is None: nh = host_of(pages); time.sleep(0.5)
            check(nh is not None, '  %s takes the dealing over (%.0f s)' % (NAMES[pages.index(nh)] if nh else 'nobody', time.time() - t0))
            if nh is None: diag(pages, 'no new dealer'); nh = live(pages)[0]
            ok = wait(nh, '%s.mine === 1 && (%s.st === "none" || !!ASH.core.pokerGame(%s))' % (S(''), S(''), json.dumps(T)), 30)
            check(ok, '  the new dealer runs the table: the hand that cannot go on is dealt out, or (between hands) the table goes on as it stood')
            for x in live(pages): wait(x, '!(ASH.me.seat && ASH.me.seat.k === "pk")', 20)   # each screen hears the table was opened again
            for x in live(pages): sit(x, pages.index(x) % 8, 0); time.sleep(0.5)
            time.sleep(3); print('     the new dealer after the sits:'); diag(pages, 'after the sits')
            for x in live(pages):
                if ev(x, 'ASH.net().amHost'):
                    for l in ev(x, 'window.__seatlog || []'): print('     seat<-', l[0], '|', l[1][:260])
            ok = all(wait(x, 'ASH.me.seat && ASH.me.seat.k === "pk"', 40) for x in live(pages))
            ok = ok and wait(nh, '(%s.se || []).length === %d' % (S(''), len(live(pages))), 40)   # the dealer's own word, not each screen's belief
            check(ok, '  everyone left sits again, on the new dealer\'s table too (%d of %d)' % (len(ev(nh, '(%s.se || [])' % S(''))), len(live(pages))))
            if not ok: diag(pages, 'resit')
            ok = wait(nh, S('.st') + " !== 'none'", 60); check(ok, '  and a NEW hand is dealt by the new host')
            if not ok: diag(pages, 'new host deals')
            else: goes_on(pages, nh, 'case 7')
    if 8 in want:
        print('-- 8. two stand up at once, one of them on its turn; both chairs are taken again')
        g = pick_turn(pages, lambda x: x is not host_of(pages))
        other = next((x for x in guests() if x is not g), None)
        if g and other:
            s1, s2 = seat_of(g), seat_of(other); stand(g); stand(other)
            turn_moves(pages, s1, 'two stood'); chair_free(pages, s1, 'two stood'); chair_free(pages, s2, 'two stood')
            sit(g, s2, 0); sit(other, s1, 0)   # swapped chairs
            ok = wait(g, 'ASH.me.seat && ASH.me.seat.s === %d' % s2, 30) and wait(other, 'ASH.me.seat && ASH.me.seat.s === %d' % s1, 30)
            check(ok, '  they sit down again in each other\'s chairs'); goes_on(pages, host_of(pages), 'case 8')
    if 9 in want:
        print('-- 9. a player stands up mid-hand and sits down in ANOTHER, free chair')
        hh = host_of(pages); pg = pick_turn(pages, lambda x: True)
        g = next((x for x in guests() if x is not pg), None)
        taken = set(ev(hh, '(%s.se || []).map(x => x[0])' % S('')))
        free = next((i for i in range(8) if i not in taken), None)
        if g and free is not None:
            si = seat_of(g); print('     %s moves from chair %d to chair %d' % (NAMES[pages.index(g)], si + 1, free + 1))
            stand(g); chair_free(pages, si, 'it got up'); sit_in(pages, g, free, 'another chair')
            ok = all(wait(x, '(%s.se || []).filter(r => r[0] === %d || r[0] === %d).length === 1' % (S(''), si, free), 15) for x in live(pages))
            check(ok, '  every screen shows it in the new chair only (the old one stays free)')
            if not ok: diag(pages, 'moved chair')
        else: check(False, 'case 9: no guest or no free chair')
    errs = [e for e in errs if 'favicon' not in e and 'status of 404' not in e]   # a missing optional file (404) is not a game error
    check(not errs, 'no page errors (%d)%s' % (len(errs), (': ' + errs[0][:200]) if errs else ''))
    if show: time.sleep(4)
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
