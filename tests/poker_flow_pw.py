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
BTNS = '!!document.querySelector(".pokerp [data-a=fold]")'
def new_hand(pa, pb, H):
    return wait(pa, S('.h') + ' > %d && ' % H + S('.st') + " === 'preflop'", 60) and wait(pb, S('.h') + ' > %d && ' % H + S('.st') + " === 'preflop'", 30)
def play_hand(pa, pb, river):
    """check/call to the river; on the flop and the river the first to act bets the minimum; on the river the other `river`s"""
    t0 = time.time(); last = None
    while time.time() - t0 < 120:
        if ev(pa, S('.st') + " === 'none'"): return True
        for pg in (pa, pb):
            if not turn(pg): continue
            st, b = row(pg, 'st'), row(pg, 'b'); key = (row(pg, 'h'), st, b, row(pg, 'a'))
            if key == last: break
            mine_bet = ev(pg, '(function(){var s=%s,m=(s.se||[]).find(x=>x[1]===ASH.pid);return m?m[3]:0})()' % S(''))
            if st in ('flop', 'river') and b == 0:
                v = ev(pg, 'ASH._pokerView(%s)' % json.dumps(T)); act(pg, 'raise', v['min'])
            elif st == 'river' and b > mine_bet: act(pg, river)
            else: act(pg, 'call' if b > mine_bet else 'check')
            last = key; time.sleep(0.6); break
        time.sleep(0.25)
    return False
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 720, 'height': 480}); errs = []
    pa = open_page(ctx, URL % 1, errs, 'A'); ev(pa, 'ASH.core.cmd("me", {c: "look", name: "Ann"}); ASH.teleport(457, 30)'); time.sleep(4)
    pb = open_page(ctx, URL % 2, errs, 'B'); ev(pb, 'ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(458, 30)'); time.sleep(4)
    for pg in (pa, pb): ev(pg, 'ASH.give("coins", 5000)'); upstairs(pg)
    check(wait(pa, 'ASH.me.lv === 1', 40) and wait(pb, 'ASH.me.lv === 1', 40), 'both go up to the card room')
    check(wait(pa, 'ASH.net().amHost', 20), 'Ann deals the room (the host)')
    sit(pa, 0, 100); check(wait(pa, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30), 'Ann sits first and sets 1/2 stakes (buy-in 100)')
    sit(pb, 1, 100); check(wait(pb, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30), 'Ben sits')
    check(wait(pa, S('.st') + " === 'preflop'", 40) and wait(pb, S('.st') + " === 'preflop'", 40), 'a hand is dealt')
    check(row(pb, 'bg') == 2 and row(pb, 'mr') == 2, "Ben's game knows the big blind and the smallest raise: %s / %s" % (row(pb, 'bg'), row(pb, 'mr')))
    vb = ev(pb, 'ASH._pokerView(%s)' % json.dumps(T))
    check(vb['min'] == row(pb, 'b') + 2, "Ben's panel: the smallest raise is to %s (the bet %s + the big blind), not 50" % (vb['min'], row(pb, 'b')))
    # the turn ring is a clock: it runs down, and only the one to act hears the last ten seconds
    actor, other = (pa, pb) if turn(pa) else (pb, pa)
    f0 = ev(actor, '(ASH._pokerClock()[%s] || {}).t0' % json.dumps(T))
    check(f0 is not None and ev(other, '!!ASH._pokerClock()[%s]' % json.dumps(T)), 'both screens time the turn')
    check(wait(actor, '(ASH._pokerClock()[%s] || {}).beeped < 10' % json.dumps(T), 70), '  the one to act hears the last ten seconds')
    check(ev(other, '(ASH._pokerClock()[%s] || {beeped: 99}).beeped' % json.dumps(T)) == 99, '  the other hears nothing')
    if os.environ.get('SHOTS'): shot(actor, 'pk_timer_red')
    act(actor, 'call' if row(actor, 'b') > 0 else 'check'); time.sleep(1)
    # three hands called down on the river: the result comes, the buttons go, only the called hands are shown
    for n in range(3):
        H = row(pa, 'h')
        check(play_hand(pa, pb, 'call'), 'hand %d: played to the river and called' % row(pa, 'h'))
        check(wait(pa, S('.r'), 10) and wait(pb, S('.st') + " === 'none' && " + S('.r'), 10), '  both screens get the result')
        check(wait(pa, '!' + BTNS, 6) and wait(pb, '!' + BTNS, 6), '  and neither panel still offers Call / Fold / Raise')
        sd = row(pb, 'r')['sd'] if row(pb, 'r') else []
        check(len(sd) == 2, '  a called river: both hands are shown (%d)' % len(sd))
        if n < 2: check(new_hand(pa, pb, H), '  the table deals the next hand')
    # a river bet that is folded to: nobody shows
    H = row(pa, 'h'); check(new_hand(pa, pb, H), 'the next hand')
    check(play_hand(pa, pb, 'fold'), 'hand %d: a river bet, folded to' % row(pa, 'h'))
    check(wait(pb, S('.st') + " === 'none' && " + S('.r'), 10) and not (row(pb, 'r') or {}).get('sd'), '  uncalled: no hand is shown')
    for pg, nm in ((pa, 'Ann'), (pb, 'Ben')):
        up = ev(pg, '(ASH._pokerModel(%s).hands || []).filter(h => !h.down).map(h => h.ref)' % json.dumps(T)); mine = ev(pg, 'ASH.me.seat ? ASH.me.seat.s : -1')
        check(all(r == mine for r in up), "  %s's felt shows no one else's cards face up (%s)" % (nm, up))
    # Ben stands up: his stack goes back to his bag, and he sits straight back down
    st0 = chips(pb); c0 = coins(pb); stand(pb)
    check(wait(pb, '!ASH.me.seat', 10) and wait(pa, S('.se') + '.length === 1', 15), 'Ben stands up; the dealer has one chair taken')
    check(wait(pb, 'ASH.me.inv.reduce((n, s) => n + (s && s.id === "coins" ? s.n : 0), 0) === %d' % (c0 + st0), 15), "  his stack (%s) is back in his bag: %s -> %s" % (st0, c0, coins(pb)))
    sit(pb, 1, 100)
    check(wait(pb, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30) and wait(pa, S('.se') + '.length === 2', 15), '  Ben sits straight back down')
    check(wait(pb, S('.se') + '.some(x => x[1] === ASH.pid && x[2] > 0)', 20), '  with a fresh stack')
    # everyone leaves: the table is over; the next first sitter sets new stakes
    stand(pb); time.sleep(1); stand(pa)
    check(wait(pa, S('.se') + '.length === 0', 20) and wait(pb, S('.se') + '.length === 0', 20), 'both up: the table is empty on both screens')
    check(wait(pa, S('.buy') + ' === 0', 10), '  and has forgotten its stakes')
    sit(pb, 4, 1000)
    check(wait(pb, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30) and wait(pa, S('.buy') + ' === 1000', 20), 'Ben sits first at the empty table and sets new stakes (1000)')
    sit(pa, 0, 0); check(wait(pa, 'ASH.me.seat && ASH.me.seat.k === "pk"', 30), '  Ann joins at those stakes')
    check(wait(pa, S('.st') + " === 'preflop'", 40) and row(pa, 'bg') == 20, '  a new game is dealt at 10/20 (%s)' % row(pa, 'bg'))
    check(not errs, 'no console errors (%d)%s' % (len(errs), (': ' + errs[0][:200]) if errs else ''))
    b.close()
print('ALL OK' if not fails else '%d FAILED' % len(fails)); sys.exit(1 if fails else 0)
