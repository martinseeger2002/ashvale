"""[Claude 2026-10-22] the operator: "If you're disconnected from a golf game, you should have 120 seconds to reconnect. ... Like if you accidentally
close the application while playing a round of golf, you should be able to rejoin that game."
1. Solo: a reload mid-hole carries on the same round (hole, strokes, ball, card; no second green fee); a reload while the ball is in the
   air lands that shot.
2. A group of two for a 100 GOLD pot: Ben reloads on his turn; Ann's game says he lost connection and holds his seat (play waits on him);
   Ben's new page (a new room id) is back in the same round with the same stake, Ann's game takes him back under the new id, he plays on.
3. Ben closes the page and does not come back (the 2 min shortened to 8 s): Ann's game has him leave the round (as Leave does); a page
   opened after that does not take the round up and says it went on without him.
  (waits are long: on a loaded box a game window draws ~1 frame a second and a flight takes half a minute)
  python3 tests/golf_rejoin_pw.py   (server: python3 tests/serve.py 8775 in the tree; PORT; run HEADED=1 DISPLAY=:1 XAUTHORITY=/run/user/1000/gdm/Xauthority - headless SwiftShader is too slow for golf)"""
import os, time, math, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
def wait(pg, js, t=30):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
PORT = os.environ.get('PORT', '8775')
BASE = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?%snocreator&notut&loopback&seed=rj%s&go=636,-112'
GS = 'ASH.golf()._state()'
COINS = "ASH.me.inv.reduce((s, q) => s + (q && q.id === 'coins' ? q.n : 0), 0)"
CHAT = "(document.body.textContent || '')"   # (the chat log is hidden under the golf HUD)
UP = '!!(window.ASH && ASH.core && ASH.golf && ASH.golf())'
def st(pg): return pg.evaluate(GS)
def near(a, b): return a and b and abs(a['x'] - b['x']) < 0.02 and abs(a['y'] - b['y']) < 0.02
with sync_playwright() as p:
    b = p.chromium.launch(headless=os.environ.get('HEADED') is None, args=['--use-gl=egl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] if os.environ.get('HEADED') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']); errs = []
    def page(ctx, tag, init=''):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(tag + ' ' + str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'WebGL' not in m.text and print('   console', tag, m.text[:300]))
        pg.add_init_script("window.__pkEv = [];" + init)
        return pg
    # ---------------- 1. solo: reload mid-hole (its own browser context: its own storage, so the save and the game's own golf key)
    sctx = b.new_context(viewport={'width': 800, 'height': 560})
    S = page(sctx, 'solo'); S.goto(BASE % ('fresh&', 's'), wait_until='domcontentloaded', timeout=120000)
    check(wait(S, UP, 120), 'solo game up'); S.keyboard.press('Escape')
    S.evaluate("() => { ASH.me.name = 'Dee'; for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.me.inv[0] = { id: 'golf_standard', n: 1 }; ASH.give('coins', 100); }")
    S.evaluate("ASH.golf()._begin({ rid: 's' + Date.now().toString(36), f: 'free', a: 0, m: [[ASH.golf()._me(), 'Dee', '', 1]], nine: 'full' })")
    check(wait(S, GS + " && " + GS + ".phase === 'aim'", 15) and wait(S, COINS + " === 50", 5), 'solo round starts (the 50 GOLD fee paid)')
    S.evaluate("ASH.golf()._hole(1, 4)")
    check(wait(S, GS + ".hole === 1 && " + GS + ".phase === 'aim'", 10), 'on hole 2 after a 4 on hole 1')
    S.evaluate("ASH.golf()._shoot({ atPin: true, power: 0.5, impact: 0 })")
    check(wait(S, GS + ".phase === 'aim' && " + GS + ".k === 1", 120), 'one shot played on hole 2 (strokes %s)' % (st(S) or {}).get('strokes'))
    s0 = st(S); time.sleep(7)   # the game's own save (its 6 s tick) has the green fee paid
    check(S.evaluate("(k => !!k && k.r.rid === '%s' && k.r.hole === 1)(ASH.golf()._kept())" % s0['rid']), 'the round is kept in the store')
    S.goto(BASE % ('', 's'), wait_until='domcontentloaded', timeout=120000)   # the same page again, now loading its save (no ?fresh)
    check(wait(S, UP, 120), 'solo game back up after the reload'); S.keyboard.press('Escape')
    ok = wait(S, GS + " && " + GS + ".rid === '%s'" % s0['rid'], 30); s1 = st(S) or {}
    check(ok, 'the reloaded page carries on the same round (%s)' % s1.get('rid'))
    check(s1.get('hole') == 1 and s1.get('strokes') == s0['strokes'] and s1.get('k') == 1 and (s1.get('card') or [None])[0] == 4, 'same hole, strokes and card (hole %s, strokes %s, card %s)' % (s1.get('hole'), s1.get('strokes'), s1.get('card')))
    check(near(s1.get('ball'), s0['ball']), 'same ball position (%s / %s)' % (s1.get('ball'), s0['ball']))
    check(S.evaluate(COINS) == 50, 'no second green fee (pack %s)' % S.evaluate(COINS))
    check(wait(S, "/back in your round/i.test(" + CHAT + ")", 5), 'chat: back in your round')
    check(wait(S, "!!document.querySelector('.lay.golf') && !!document.querySelector('.golfp.swing')", 5), 'the golf HUD is back')
    S.evaluate("ASH.golf()._shoot({ atPin: true, power: 0.6, impact: 0 })")
    check(wait(S, GS + ".phase === 'fly'", 6), 'a shot in the air ...')
    S.goto(BASE % ('', 's'), wait_until='domcontentloaded', timeout=120000)
    check(wait(S, UP, 120), '... reload in mid-flight'); S.keyboard.press('Escape')
    ok = wait(S, GS + " && " + GS + ".rid === '%s' && (" % s0['rid'] + GS + ".phase === 'aim' || " + GS + ".phase === 'done')", 30); s2 = st(S) or {}
    check(ok and s2.get('strokes', 0) >= 2 and not near(s2.get('ball'), s0['ball']), 'that shot lands in the rejoined round (strokes %s, ball %s)' % (s2.get('strokes'), s2.get('ball')))
    S.evaluate("ASH.golf()._quit()")
    check(wait(S, "!ASH.golf()._state() && !ASH.golf()._kept()", 5), 'leaving: no round kept')
    sctx.close()
    # ---------------- 2. a group of two: Ben reloads and comes back within the 2 min
    ctx = b.new_context(viewport={'width': 640, 'height': 480})   # one browser context: the loopback room is a BroadcastChannel
    ann = page(ctx, 'ann', "window.ASH_GOLF_KEY = 'ashvale3d.golf.t.ann';"); ben = page(ctx, 'ben', "window.ASH_GOLF_KEY = 'ashvale3d.golf.t.ben';")
    for pg, i in ((ann, 'a'), (ben, 'b')):
        pg.goto(BASE % ('fresh&', i), wait_until='domcontentloaded', timeout=120000)
        check(wait(pg, UP, 120), 'game %s up' % i); pg.keyboard.press('Escape')
    for pg, nm in ((ann, 'Ann'), (ben, 'Ben')):
        pg.evaluate("n => { ASH.me.name = n; for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.me.inv[0] = { id: 'golf_standard', n: 1 }; ASH.give('coins', 5000); }", nm)
    ann.evaluate("ASH.golf()._openGroup('pot', 100)")
    check(wait(ben, "ASH.golf()._open().length > 0", 20), "Ben hears Ann's group")
    ben.evaluate("g => ASH.golf()._join(g)", ben.evaluate("ASH.golf()._open()[0].g"))
    check(wait(ann, "ASH.golf()._lobby() && ASH.golf()._lobby().m.length === 2", 20), 'two in the group')
    ann.evaluate("document.querySelector('.golfp.card button[data-id=go]').click()")
    okA = wait(ann, GS + " && " + GS + ".rid", 25); okB = wait(ben, GS + " && " + GS + ".rid", 25)
    check(okA and okB, 'the round starts on both')
    if not (okA and okB): b.close(); raise SystemExit(1)
    check(wait(ann, COINS + " === 4850", 10) and wait(ben, COINS + " === 4850", 10), 'stakes (100) and fees (50) out of both bags')
    A, B = st(ann)['sn'], st(ben)['sn']; rid = st(ann)['rid']
    check(wait(ann, GS + ".turn === %d" % A, 10) and wait(ben, GS + ".turn === %d" % A, 10), 'Ann tees off first')
    ann.bring_to_front(); ann.evaluate("ASH.golf()._shoot({ atPin: true, power: 0.5, impact: 0 })")   # (a page behind another draws no frames: its ball would hang in the air)
    ok = wait(ann, GS + ".turn === %d && " % B + GS + ".phase === 'aim'", 120) and wait(ben, GS + ".turn === %d" % B, 30)
    check(ok, "then it is Ben's turn on both")
    if not ok:
        for pg in (ann, ben): S0 = st(pg); print('   seat', S0['sn'], 'turn', S0['turn'], 'k', S0['k'], 'ph', S0['phase'], 'strokes', S0['strokes'], 'card', S0['card'], 'st', {k: {q: v.get(q) for q in ('n', 'k', 'ph', 'sw')} for k, v in (S0.get('st') or {}).items()})
    time.sleep(3)   # Ann's game has heard Ben's round token
    b0 = st(ben); me0 = ben.evaluate("ASH.golf()._me()")
    check(ann.evaluate(GS + ".tok[%d] === '%s'" % (B, b0['tk'])), "Ann's game knows Ben's round token")
    NB = [x[1] for x in st(ann)['m'] if x[3] == B][0]   # the name Ben's game goes by (its board name)
    ann.bring_to_front(); ben.goto('about:blank')   # the page goes (closed, or a reload): it comes back below as a new page, a new room id
    check(wait(ann, GS + ".away[%d] > 0" % B, 20), "Ann's game: Ben is gone, his seat held")
    check(wait(ann, "(t => t.indexOf(%s + ' lost connection - waiting up to 2 min') >= 0)(" % json.dumps(NB) + CHAT + ")", 5), 'Ann is told: "Ben lost connection - waiting up to 2 min"')
    check(wait(ann, "/lost connection - waiting up to \\d:\\d\\d/.test((document.querySelector('.golfp.waitm') || {}).textContent || '')", 5), "Ann's HUD: waiting on Ben with the time left (%s)" % ann.evaluate("(document.querySelector('.golfp.waitm') || {}).textContent"))
    check(not ann.evaluate(GS + ".quit[%d]" % B) and ann.evaluate(GS + ".turn") == B, 'Ben has not left: play waits on his shot')
    ben.goto(BASE % ('fresh&', 'b'), wait_until='domcontentloaded', timeout=120000)
    check(wait(ben, UP, 120), "Ben's game back up"); ben.keyboard.press('Escape'); ann.bring_to_front()
    ok = wait(ben, GS + " && " + GS + ".rid === '%s'" % rid, 40); b1 = st(ben) or {}
    check(ok, 'Ben is back in the same round')
    me1 = ben.evaluate("ASH.golf()._me()")
    check(me1 != me0, 'under a new room id (%s -> %s)' % (me0, me1))
    check(b1.get('sn') == B and b1.get('hole') == b0['hole'] and b1.get('strokes') == b0['strokes'] and b1.get('k') == b0['k'] and near(b1.get('ball'), b0['ball']), 'same seat, hole, strokes and ball')
    check(b1.get('buy') == 100 and b1.get('f') == 'pot' and len(b1.get('m') or []) == 2, 'same group and the same stake (pot, 100)')
    check(not ben.evaluate("__pkEv.some(e => e.e === 'pkbuy')"), 'no second stake sent')
    check(wait(ann, "(m => !!m && String(m[0]) === '%s')(%s.m.find(x => x[3] === %d))" % (me1, GS, B), 20), "Ann's game takes Ben back under his new id")
    check(wait(ann, "!(" + GS + ".away[%d])" % B, 5) and wait(ann, "(t => t.indexOf(%s + ' is back in the round') >= 0)(" % json.dumps(NB) + CHAT + ")", 5), 'Ann is told Ben is back')
    check(wait(ben, GS + ".turn === %d" % B, 15), "Ben's own game: his turn")
    k0 = ann.evaluate("(g => g ? g.k | 0 : 0)(%s.st[%d])" % (GS, B))
    ben.bring_to_front(); check(ben.evaluate("ASH.golf()._shoot({ atPin: true, power: 0.5, impact: 0 })"), 'Ben plays his shot')
    check(wait(ann, "(g => !!g && (g.k | 0) > %d)(%s.st[%d])" % (k0, GS, B), 120), "Ann's game sees Ben's shot land")
    check(wait(ben, GS + ".phase === 'aim'", 120) and wait(ann, "%s.turn === %s" % (GS, json.dumps(ben.evaluate(GS + ".turn"))), 10), 'both agree whose turn it is next')
    # ---------------- 3. Ben goes and does not come back: after the (shortened) wait he leaves the round
    for pg in (ann, ben): pg.evaluate("window.ASH_GOLF_REJOIN_MS = 8000")
    wait(ben, GS + ".phase === 'aim'", 120); time.sleep(1)
    ben.close(); ann.bring_to_front()
    check(wait(ann, GS + ".away[%d] > 0 || " % B + GS + ".quit[%d]" % B, 25), "Ann's game: Ben is gone")
    check(wait(ann, GS + ".quit[%d]" % B, 30), 'after the wait Ben leaves the round (quit)')
    check(wait(ann, "(t => t.indexOf(%s + ' did not come back within 8 s, so they leave the round and forfeit') >= 0)(" % json.dumps(NB) + CHAT + ")", 5), 'Ann is told Ben did not come back and forfeits')
    check(wait(ann, GS + ".turn === %d" % A, 10), 'play goes on with Ann')
    ben2 = page(ctx, 'ben2', "window.ASH_GOLF_KEY = 'ashvale3d.golf.t.ben'; window.ASH_GOLF_REJOIN_MS = 8000;")
    ben2.goto(BASE % ('fresh&', 'b'), wait_until='domcontentloaded', timeout=120000)
    check(wait(ben2, UP, 120), "Ben's new page up"); ben2.keyboard.press('Escape')
    check(wait(ben2, "/went on without you/.test(" + CHAT + ")", 20), 'Ben is told the round went on without him')
    check(not ben2.evaluate(GS) and not ben2.evaluate("ASH.golf()._kept()"), 'no round taken up, none kept')
    check(not errs, 'no page errors %s' % errs[:3])
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
