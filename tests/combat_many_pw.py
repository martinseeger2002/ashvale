"""2026-10-12, playing a 1/2 card table with a friend: "calling on the river ... it just gets locked on the call fold
raise option"; "it shows the cards of people who folded"; "once you play on a table and leave it won't let you sit back
down"; "the game stays active even after all the players have left"; "the minimum bet on a one two blind says 50".
Two real games in one loopback room (Ann deals, Ben follows), played through those exact moments.
  python3 tests/poker_flow_pw.py   (server: python3 -m http.server 8731 in ~/ashvale3d)"""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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
ARGS = [] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=pflow%d'
def coins(pg): return ev(pg, 'ASH.me.inv.reduce((n, s) => n + (s && s.id === "coins" ? s.n : 0), 0)')
def seated(pg): return bool(ev(pg, '!!(ASH.me.seat && ASH.me.seat.k === "pk")'))
def chips(pg): return ev(pg, '(function(){var s=%s,m=(s.se||[]).find(x=>x[1]===ASH.pid);return m?m[2]:null})()' % S(''))
def act(pg, a, to=None): ev(pg, 'ASH.core.cmd("me", %s)' % json.dumps({'c': 'pact', 'a': a, **({'to': to} if to is not None else {})}))
def sit(pg, seat, buy): ev(pg, 'ASH.core.cmd("me", %s)' % json.dumps({'c': 'sit', 'table': T, 'seat': seat, 'buy': buy}))
def stand(pg): ev(pg, 'ASH.core.cmd("me", {c: "stand"})')

"""(helpers shared with the card-table tests) [Claude 2026-10-13] EIGHT AT ONE TABLE, watched (the operator: "Play multiple windows ... Up to eight players ... Arrange them on my
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

"""[Claude 2026-10-13] MONSTERS WITH SEVERAL PLAYERS, watched (the operator: "run playwright battling monsters with two or more players at
one time. Make sure monsters are attacking all players if attacked by more than one player alternating. Make sure a monster takes
damage from more than one player at once. Make sure all of the monsters are in the same locations for all of the players. Make sure
when a monster is killed by a player on one screen that that monster is seen dead by the player on the other screen. Make sure
there are no phantom monsters or monsters who are only visible to one of the players.")
PLAYERS (default 3, up to 8) real games in one loopback room, one window each, at the goblin camp in Whisperwood:
  1. every screen has the same monsters there (no phantoms, none missing), at the same places (within a tile or two);
  2. all of them attack the goblin chief: it is hurt by every player, and it turns on more than one of them;
  3. it dies: on every screen, within seconds; and afterwards the camp is the same on every screen again;
  4. then each player fights a goblin of its own, all at once, and the same checks hold for all of them.
  DISPLAY=:1 python3 tests/combat_many_pw.py   (HEADLESS=1 unseen; PLAYERS=n)"""
def host_of(pages): return next((pg for pg in live(pages) if ev(pg, 'ASH.net().amHost')), None)
NP = max(2, min(8, int(os.environ.get('PLAYERS', '3'))))
CAMP = (41, 24)
HOOK = """(function(){if(window.__cb)return;window.__cb=[];var c=ASH.core,o=c.tick;c.tick=function(){var r=o.apply(this,arguments);try{for(var e of (r||[]))if(e&&(e.e==='hit'||e.e==='attack'||e.e==='die'))window.__cb.push([e.e,e.src,e.dst,e.dmg|0,e.hp,c.S.t])}catch(x){}return r}})()"""
def mobs_near(pg, r=14):
    return ev(pg, '(function(){var o={};for(var m of ASH.core.S.mobs){if(Math.max(Math.abs(m.x-%d),Math.abs(m.y-%d))>%d)continue;o[m.uid]=[m.key,m.x,m.y,m.dead?1:0,m.hp]}return o})()' % (CAMP[0], CAMP[1], r))
def same_camp(pages, why, tol=2):
    """every screen: the same living monsters at the camp, each within tol tiles of where the host has it"""
    h = host_of(pages) or pages[0]; H = mobs_near(h); bad = []
    alive = lambda M: {u for u, v in M.items() if not v[3]}
    for pg in live(pages):
        if pg is h: continue
        M = mobs_near(pg)
        only_here = alive(M) - alive(H); missing = alive(H) - alive(M)
        if only_here or missing:   # a monster that has just died, spawned or walked in is allowed a moment: look again
            time.sleep(6); H = mobs_near(h); M = mobs_near(pg); only_here = alive(M) - alive(H); missing = alive(H) - alive(M)
        far = [u for u in alive(M) & alive(H) if max(abs(M[u][1] - H[u][1]), abs(M[u][2] - H[u][2])) > tol]
        if far:   # a host sends every monster again every 5 s: past one full snapshot it must agree
            time.sleep(6); H = mobs_near(h); M = mobs_near(pg)
            far = [u for u in alive(M) & alive(H) if max(abs(M[u][1] - H[u][1]), abs(M[u][2] - H[u][2])) > tol]
        dup = ev(pg, '(function(){var c={},o=[];for(var m of ASH.core.S.mobs){c[m.uid]=(c[m.uid]||0)+1}for(var k in c)if(c[k]>1)o.push(k+"x"+c[k]);return o})()')
        duph = ev(h, '(function(){var c={},o=[];for(var m of ASH.core.S.mobs){c[m.uid]=(c[m.uid]||0)+1}for(var k in c)if(c[k]>1)o.push(k+"x"+c[k]);return o})()')
        if dup or duph: bad.append('%s: the same monster twice here %s / on the host %s' % (NAMES[pages.index(pg)], dup[:6], duph[:6]))
        if far:
            for u in far[:3]:
                print('     drift %s: host %s zone %s auth-on-host %s | %s %s auth-here %s | host hosts %s' % (u, H[u][1:3], ev(h, 'ASH.core.mobByUid(%s).zone' % u), ev(h, 'ASH.core.isAuth(ASH.core.mobByUid(%s).zone)' % u), NAMES[pages.index(pg)], M[u][1:3], ev(pg, 'ASH.core.isAuth(ASH.core.mobByUid(%s).zone)' % u), ev(h, 'JSON.stringify(ASH.net().hosted)')))
        if only_here or missing or far: bad.append('%s: phantom %s missing %s moved %s' % (NAMES[pages.index(pg)], sorted(only_here)[:5], sorted(missing)[:5], [(u, M[u][1:3], H[u][1:3]) for u in far][:3]))
    check(not bad, '  %s: every screen has the same %d monsters at the camp, in the same places%s' % (why, len(alive(H)), (' - ' + '; '.join(bad)) if bad else ''))
    return not bad
def log(pg): return ev(pg, 'window.__cb || []')
def keep_alive(pages):   # only a fighter about to fall is patched up: the blows it takes still land and are counted
    for pg in live(pages):
        try: ev(pg, 'if (ASH.me.hp < 12 && !ASH.me.dead) ASH.me.hp = ASH.core.lv(ASH.me, "hitpoints")')
        except Exception: pass

with sync_playwright() as p:
    show = not os.environ.get('HEADLESS')
    b = p.chromium.launch(headless=not show, args=(['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] if show else ARGS)); errs = []
    ctx = b.new_context(no_viewport=True) if show else b.new_context(viewport={'width': 640, 'height': 540})
    cols = min(NP, 4); rows = (NP + 3) // 4
    W, H, TOP = SW // cols, (SH // 2) // rows, SH // 2; pages = []; first = None
    for i in range(NP):
        nm = NAMES[i]; url = URL % (380 + i)
        if not show or first is None:
            pg = open_page(ctx, url, errs, nm); first = pg
            if show: place(pg, 0, W, H, TOP)
        else:
            with ctx.expect_page() as info:
                first.evaluate('([u, f]) => window.open(u, "_blank", f)', [url, 'popup=1,left=%d,top=%d,width=%d,height=%d' % ((i % cols) * W, TOP + (i // cols) * H, W, H)])
            pg = info.value; pg.on('pageerror', lambda e, nm=nm: errs.append(nm + ' PAGEERROR ' + str(e))); pg.on('console', lambda m, nm=nm: m.type == 'error' and errs.append(nm + ' ' + m.text))
            wait(pg, '!!(window.ASH && ASH.core)', 90); time.sleep(1); ev(pg, 'ASH.hud.showHelp(false)'); place(pg, i, W, H, TOP)
        pages.append(pg)
        ev(pg, 'ASH.core.cmd("me", {c: "look", name: %s}); ASH.give("sword_t3", 1); ASH.teleport(%d, %d)' % (json.dumps(nm), CAMP[0] - 5 + i, CAMP[1] + 3)); time.sleep(1.5)
        # a fighter, not a fresh level-1 in its shirt: level ~40 in the fighting skills and the bronze-to-steel sword in hand
        ev(pg, '(function(){var me=ASH.me;for(var k of ["attack","strength","defence","hitpoints"])me.xp[k]=Math.max(me.xp[k]||0,400000);me.hp=ASH.core.lv(me,"hitpoints");var i=me.inv.findIndex(s=>s&&s.id==="sword_t3");if(i>=0)ASH.core.cmd("me",{c:"equip",slot:i})})()')
    for pg in pages: ev(pg, HOOK)
    time.sleep(6)
    h = host_of(pages); check(h is not None, 'the room has a host: %s' % (NAMES[pages.index(h)] if h else '-'))
    print('-- 1. the camp is the same on every screen')
    for k in range(3): same_camp(pages, 'look %d' % (k + 1)); time.sleep(2)

    SECTIONS = set(int(x) for x in os.environ.get('SECTIONS', '1,2,3,4,5').split(','))
    print('-- 2. everyone attacks the goblin chief')
    chief = ev(h, '(function(){var m=ASH.core.S.mobs.find(m=>m.key==="goblin_chief"&&!m.dead);return m?m.uid:null})()')
    check(chief is not None, '  the chief is there (uid %s) on the host' % chief)
    check(all(ev(pg, '!!ASH.core.mobByUid(%d)' % chief) for pg in pages), '  and the same chief (uid %s) on every screen' % chief)
    pid = {}
    for pg in pages: pid[NAMES[pages.index(pg)]] = ev(pg, 'ASH.net().myId')
    hp0 = ev(h, 'ASH.core.mobByUid(%d).hp' % chief); t0 = time.time()
    dead = False; prev = {}; lost = {}
    while time.time() - t0 < 120:
        for pg in pages:
            ev(pg, '(function(){var m=ASH.core.mobByUid(%d);if(m&&!m.dead&&!(ASH.me.act&&ASH.me.act.uid===%d))ASH.core.cmd("me",{c:"attack",uid:%d})})()' % (chief, chief, chief))
        for pg in pages:   # the blows each player takes, seen on its own screen as its own health going down
            nmx = NAMES[pages.index(pg)]; hpn = ev(pg, 'ASH.me.hp')
            if nmx in prev and hpn < prev[nmx]: lost[nmx] = lost.get(nmx, 0) + prev[nmx] - hpn
            prev[nmx] = hpn
        keep_alive(pages)
        for pg in pages: prev[NAMES[pages.index(pg)]] = ev(pg, 'ASH.me.hp')
        if ev(h, '!!ASH.core.mobByUid(%d).dead' % chief): dead = True; break
        time.sleep(1)
    L = log(h)
    hits = [e for e in L if e[0] == 'hit' and e[2] == chief]
    by = {}
    for e in hits: by[str(e[1])] = by.get(str(e[1]), 0) + 1
    dm = {}
    for e in hits: dm.setdefault(str(e[1]), []).append(e[3])
    print('     damage to the chief by player: %s' % {k: (len(v), sum(v), sum(1 for x in v if x > 0)) for k, v in dm.items()})
    print('     health each player lost, on its own screen: %s' % lost)
    check(sum(1 for v in lost.values() if v > 0) >= 1, '  its blows really land (health lost, on the players\' own screens): %s' % lost)
    check(len(by) >= min(NP, 2), '  the chief is hurt by %d different players (wanted %d+): %s' % (len(by), min(NP, 2), by))
    check(len(by) == NP, '  by every one of the %d: %s' % (NP, sorted(by)))
    tg = {}
    for e in L:
        if e[0] == 'attack' and e[1] == chief: tg[str(e[2])] = tg.get(str(e[2]), 0) + 1
    check(len(tg) == NP, '  and it turns on every one of them: %s' % tg)
    seq = [str(e[2]) for e in L if e[0] == 'attack' and e[1] == chief]
    sw = sum(1 for a, b2 in zip(seq, seq[1:]) if a != b2)
    print('     its targets in turn: %s (%d switches)' % (' '.join(s[-4:] for s in seq[:30]), sw))
    check(dead, '  the chief dies (%.0f s, hp was %s)' % (time.time() - t0, hp0))
    print('-- 3. the dead chief is dead everywhere')
    t1 = time.time()
    ok = all(wait(pg, '!ASH.core.mobByUid(%d) || !!ASH.core.mobByUid(%d).dead' % (chief, chief), 8) for pg in pages)
    check(ok, '  every screen shows the chief dead (%.1f s)' % (time.time() - t1))
    if not ok:
        for pg in pages: print('     %-4s' % NAMES[pages.index(pg)], ev(pg, 'JSON.stringify(ASH.core.mobByUid(%d))' % chief)[:200])
    killer = ev(h, 'ASH.core.mobByUid(%d).killer' % chief)
    print('     killed by', killer)
    time.sleep(3); same_camp(pages, 'after the kill')

    if 4 not in SECTIONS: gob = []
    else: print('-- 4. each player fights a goblin of its own, all at once')
    if 4 in SECTIONS: gob = ev(h, '(function(){return ASH.core.S.mobs.filter(m=>m.key==="goblin"&&!m.dead&&Math.max(Math.abs(m.x-%d),Math.abs(m.y-%d))<=14).map(m=>m.uid)})()' % CAMP)
    pairs = list(zip(pages, gob))
    check(len(pairs) >= 2, '  %d goblins for %d players' % (len(gob), NP))
    t2 = time.time(); done = set()
    while time.time() - t2 < 120 and len(done) < len(pairs):
        for pg, u in pairs:
            if u in done: continue
            if ev(h, '!!(ASH.core.mobByUid(%d)||{dead:1}).dead' % u): done.add(u); continue
            ev(pg, '(function(){var m=ASH.core.mobByUid(%d);if(m&&!m.dead&&!(ASH.me.act&&ASH.me.act.uid===%d))ASH.core.cmd("me",{c:"attack",uid:%d})})()' % (u, u, u))
        keep_alive(pages); time.sleep(1)
    check(len(done) == len(pairs), '  every goblin is killed by its own player (%d of %d, %.0f s)' % (len(done), len(pairs), time.time() - t2))
    ok = all(all(wait(pg, '!ASH.core.mobByUid(%d) || !!ASH.core.mobByUid(%d).dead' % (u, u), 8) for u in done) for pg in pages)
    check(ok, '  and every screen shows all of them dead')
    time.sleep(3); same_camp(pages, 'after the fights')
    fighters = pages[:3] if 5 in SECTIONS else []
    if fighters: print('-- 5. three of them go to the dragon and fight it')
    for i, pg in enumerate(fighters):   # dragon slayers: every fighting skill at 99
        ev(pg, '(function(){var me=ASH.me;for(var k of ["attack","strength","defence","hitpoints"])me.xp[k]=Math.max(me.xp[k]||0,130000000);me.hp=ASH.core.lv(me,"hitpoints")})()')
        ev(pg, 'ASH.teleport(%d, %d)' % (-55 + i, -97)); time.sleep(1)
    time.sleep(6)
    dh = host_of(pages) or h
    drg = None if not fighters else ev(dh, '(function(){var m=ASH.core.S.mobs.find(m=>m.key==="chain_dragon"&&!m.dead);return m?m.uid:null})()')
    if fighters: check(drg is not None and all(ev(pg, '!!ASH.core.mobByUid(%s)' % json.dumps(drg)) for pg in fighters), '  the dragon (uid %s) is on every fighter\'s screen' % drg)
    if drg is not None:
        hp_seen = []; t3 = time.time(); dead = False
        while time.time() - t3 < 480:
            for pg in fighters:
                ev(pg, '(function(){var m=ASH.core.mobByUid(%d);if(m&&!m.dead&&!(ASH.me.act&&ASH.me.act.uid===%d))ASH.core.cmd("me",{c:"attack",uid:%d})})()' % (drg, drg, drg))
            keep_alive(fighters)
            hp_seen.append([ev(pg, '(ASH.core.mobByUid(%d)||{}).hp' % drg) for pg in fighters])
            if ev(dh, '!!ASH.core.mobByUid(%d).dead' % drg): dead = True; break
            time.sleep(1)
        L = log(dh); hits = [e for e in L if e[0] == 'hit' and e[2] == drg]
        by = {}
        for e in hits: by[str(e[1])] = by.get(str(e[1]), 0) + (e[3] or 0)
        check(len([k for k, v in by.items() if v > 0]) == 3, '  the dragon is hurt by all three: %s' % by)
        seq = [str(e[2]) for e in L if e[0] == 'attack' and e[1] == drg]
        check(len(set(seq)) >= 3 or (len(seq) < 6 and len(set(seq)) >= 2), '  it turns on each of them in turn: %s' % ' '.join(x[-4:] for x in seq[:24]))
        spread = max((max(x) - min(x)) for x in hp_seen if None not in x) if hp_seen else 0
        check(spread <= 40, '  every screen shows about the same dragon health as the fight goes on (widest gap %s hp)' % spread)
        check(dead, '  the dragon dies (%.0f s)' % (time.time() - t3))
        ok = all(wait(pg, '!ASH.core.mobByUid(%d) || !!ASH.core.mobByUid(%d).dead' % (drg, drg), 8) for pg in pages)
        check(ok, '  and every screen shows it dead')
    errs = [e for e in errs if 'favicon' not in e and 'status of 404' not in e]
    check(not errs, 'no page errors (%d)%s' % (len(errs), (': ' + errs[0][:200]) if errs else ''))
    if show: time.sleep(4)
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
