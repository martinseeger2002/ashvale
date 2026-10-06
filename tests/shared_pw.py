"""SHARED WORLD test (v0.3): several real browser games in one zone room.
  python3 tests/shared_pw.py [loopback|arcade|all]   (loopback needs `python3 -m http.server 8731` in ~/ashvale3d)
Checks: one host is elected; every client shows the same monsters in the same places; A fights a wolf and B sees the
same wolf fight A and die; the drop shows for both and only one can take it; B's own attacks are resolved by the host
and B gets the XP; the host leaves mid-fight and the fight goes on under the new host; the zone repopulates only after it
was empty; three players kill the bandit leader together (each gets XP for their own damage, one kill, one drop);
the send budget holds. Screenshots: tests/shots/shared_*.png (two clients side by side, same wolf)."""
import os, sys, time, threading, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []
def check(c, msg): print(('ok   ' if c else 'FAIL ') + msg, flush=True); (None if c else fails.append(msg))
def wait(pg, js, t=30):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.3)
    return False

STRONG = 'ASH.hud.showHelp(false); for (const [s, l] of [["attack", 40], ["strength", 40], ["defence", 40], ["hitpoints", 45], ["ranged", 40]]) ASH.setLevel(s, l); ASH.core.cmd("me", {c: "retal", on: false})'
MOBS = 'JSON.stringify(ASH.core.S.mobs.filter(m => m.zone === "whisperwood").map(m => [m.uid, m.x, m.y, m.dead ? 1 : 0]))'
NEAR_WOLF = '(() => { const me = ASH.me; const w = ASH.core.S.mobs.filter(m => m.key === "wolf" && !m.dead && !(window.__used || []).includes(m.uid)).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0]; return w ? w.uid : null; })()'

def side_by_side(pages, name):
    from PIL import Image
    paths = []
    for i, pg in enumerate(pages):
        pth = os.path.join(OUT, '_sbs%d.png' % i); pg.screenshot(path=pth); paths.append(pth)
    ims = [Image.open(x) for x in paths]; W = sum(i.width for i in ims) + 8 * (len(ims) - 1)
    out = Image.new('RGB', (W, ims[0].height), (20, 20, 20)); x = 0
    for im in ims: out.paste(im, (x, 0)); x += im.width + 8
    pth = os.path.join(OUT, name); out.save(pth); print('     shot', pth)

def open_page(ctx, url, errs, tag):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(tag + ' PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(tag + ' ' + m.text))
    pg.goto(url, wait_until='domcontentloaded', timeout=120000); wait(pg, '!!(window.ASH && ASH.core)', 90); return pg

def session(b, url_for, label, sandbox=False):
    print('== shared world over', label)
    ctx = b.new_context(viewport={'width': 640, 'height': 420}); errs = []
    if sandbox: ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });")
    pa = open_page(ctx, url_for(0), errs, 'A'); pa.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "Ann"}); ASH.teleport(24, 30)'); time.sleep(3)
    pb = open_page(ctx, url_for(1), errs, 'B'); pb.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(25, 31)')
    ok = wait(pb, 'ASH.net().host && !ASH.net().amHost', 20) and wait(pa, 'ASH.net().amHost', 5)
    check(ok and pb.evaluate('ASH.net().host') == pa.evaluate('ASH.net().myId'), 'one host is elected (the player who was there first): ' + str(pb.evaluate('ASH.net().host')))
    time.sleep(3)
    ma, mb = json.loads(pa.evaluate(MOBS)), json.loads(pb.evaluate(MOBS))
    diff = max(max(abs(x[1] - y[1]), abs(x[2] - y[2])) for x, y in zip(ma, mb) if not x[3])
    deadmis = sum(1 for x, y in zip(ma, mb) if x[3] != y[3])
    check(diff <= 1 and deadmis == 0, 'both clients show the same monsters in the same places (worst gap %d tile, %d alive/dead mismatches)' % (diff, deadmis))
    # 1. A fights a wolf; B sees the same fight
    w1 = pa.evaluate(NEAR_WOLF); xa0, xb0 = pa.evaluate('ASH.me.xp.attack'), pb.evaluate('ASH.me.xp.attack')
    pa.evaluate('window.__used = [%d]; ASH.core.cmd("me", {c: "attack", uid: %d, run: true})' % (w1, w1)); pb.evaluate('window.__used = [%d]' % w1)
    seen_hurt = wait(pb, 'ASH.core.mobByUid(%d).hp < ASH.core.D.monsters.wolf.hp' % w1, 40)
    pb.evaluate('(() => { const m = ASH.core.mobByUid(%d); ASH.core.cmd("me", {c: "walk", x: m.x + 2, y: m.y + 1, run: true}); })()' % w1); time.sleep(2.5)
    for pg in (pa, pb): pg.evaluate('ASH.setCam(0.4, 0.75, 9)')
    time.sleep(0.6); side_by_side([pa, pb], 'shared_same_wolf.png')
    check(seen_hurt, 'B sees the wolf A is fighting lose hitpoints')
    dead = wait(pa, 'ASH.core.mobByUid(%d).dead > 0' % w1, 60) and wait(pb, 'ASH.core.mobByUid(%d).dead > 0' % w1, 10)
    check(dead, 'the wolf dies on both screens')
    check(pa.evaluate('ASH.me.xp.attack') > xa0 and pb.evaluate('ASH.me.xp.attack') == xb0, 'the XP goes to A (who hit it), none to B')
    # 2. the drop: both see it, only one gets it
    pelt = None
    if wait(pa, 'ASH.core.S.ground.some(g => g.id === "pelt")', 8):
        pelt = pa.evaluate('ASH.core.S.ground.find(g => g.id === "pelt").uid')
        check(wait(pb, 'ASH.core.S.ground.some(g => g.uid === %d)' % pelt, 6), 'the pelt lies on the ground for B too (same uid %d)' % pelt)
        time.sleep(0.8); side_by_side([pa, pb], 'shared_drop.png')
        pb.evaluate('ASH.core.cmd("me", {c: "take", uid: %d, run: true})' % pelt); pa.evaluate('ASH.core.cmd("me", {c: "take", uid: %d, run: true})' % pelt)
        wait(pb, 'ASH.core.invCount(ASH.me, "pelt") + 0 > 0 || !ASH.core.S.ground.some(g => g.uid === %d)' % pelt, 20); time.sleep(2)
        na, nb = pa.evaluate('ASH.core.invCount(ASH.me, "pelt")'), pb.evaluate('ASH.core.invCount(ASH.me, "pelt")')
        check(na + nb == 1 and not pa.evaluate('ASH.core.S.ground.some(g => g.uid === %d)' % pelt) and not pb.evaluate('ASH.core.S.ground.some(g => g.uid === %d)' % pelt), 'both ran for the pelt; exactly one got it (A %d, B %d) and it is gone for both' % (na, nb))
    else:
        check(False, 'the wolf dropped a pelt')
    # 3. B's own attack is resolved by the host; B gets the XP
    w2 = pb.evaluate(NEAR_WOLF); xb1, xa1 = pb.evaluate('ASH.me.xp.attack'), pa.evaluate('ASH.me.xp.attack')
    for pg in (pa, pb): pg.evaluate('window.__used = (window.__used || []).concat([%d])' % w2)
    pb.evaluate('ASH.core.cmd("me", {c: "attack", uid: %d, run: true})' % w2)
    check(wait(pb, 'ASH.core.mobByUid(%d).dead > 0' % w2, 70) and wait(pa, 'ASH.core.mobByUid(%d).dead > 0' % w2, 10), 'B kills a wolf in A\'s hosted world: dead on both screens')
    check(pb.evaluate('ASH.me.xp.attack') > xb1 and pa.evaluate('ASH.me.xp.attack') == xa1, 'B got the XP for its own damage (from the host\'s hit events); A got none')
    # 4. the host leaves mid-fight
    w3 = pb.evaluate(NEAR_WOLF); xb2 = pb.evaluate('ASH.me.xp.attack')
    pb.evaluate('ASH.core.cmd("me", {c: "attack", uid: %d, run: true})' % w3)
    wait(pb, 'ASH.core.mobByUid(%d).hp < ASH.core.D.monsters.wolf.hp' % w3, 40)
    stats_a = pa.evaluate('ASH.net().stats'); pa.close()
    check(wait(pb, 'ASH.net().amHost', 15), 'the host closed its tab mid-fight: B takes over as host')
    check(wait(pb, 'ASH.core.mobByUid(%d).dead > 0' % w3, 60) and pb.evaluate('ASH.me.xp.attack') > xb2, 'the fight goes on under the new host and the wolf dies')
    # 5. respawn only after the area was empty and someone comes back
    check(pb.evaluate('ASH.core.mobByUid(%d).dead > 0 && ASH.core.mobByUid(%d).dead > 0' % (w1, w2)), 'killed wolves stay dead while someone is in Whisperwood')
    t_left = pb.evaluate('ASH.core.S.t'); pb.evaluate('ASH.teleport(22, 52)')
    # 50+ game ticks with nobody there (a closed tab's avatar lingers until its 12 s timeout; a busy tab ticks slowly)
    time.sleep(3); wait(pb, 'ASH.core.S.t > (ASH.core.S.seen.whisperwood || 0) + 56', 150)
    pb.evaluate('ASH.teleport(24, 30)')
    check(wait(pb, '[%d, %d, %d].every(u => !ASH.core.mobByUid(u).dead)' % (w1, w2, w3), 15), 'Whisperwood empty for 34 s, then entered again: the wolves are back')
    stats_b = pb.evaluate('ASH.net().stats')
    for nm, st in (('A (host)', stats_a), ('B', stats_b)):
        print('     %s sends: %.2f/s average, max %d in 1 s, max %d in 2 s, dropped %d, queued now %s' % (nm, st['perSec'], st['max1s'], st['max2s'], st['dropped'], st.get('queued')))
    check(all(st['perSec'] <= 5 and st['max2s'] <= 10 and st['dropped'] == 0 for st in (stats_a, stats_b)), 'send budget held (<= 5/s average, <= 10 per 2 s, nothing dropped)')
    check(not errs, 'no console errors %s' % errs[:3])
    ctx.close()

def player_drop(b, url_for, label):
    """2026-10-01: "Make sure that if one player drops an item another player can pick it up." Both directions:
    the host drops for a non-host, and a non-host drops for the host. Each item appears on both screens, the dropper loses
    it, the taker gains it, and there's exactly one copy."""
    print('== a dropped item changes hands over', label)
    ctx = b.new_context(viewport={'width': 560, 'height': 380}); errs = []
    pa = open_page(ctx, url_for(20), errs, 'A'); pa.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "Ann"}); ASH.teleport(20, 52)'); time.sleep(3)
    pb = open_page(ctx, url_for(21), errs, 'B'); pb.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(21, 52)')
    wait(pb, 'ASH.net().host && !ASH.net().amHost', 20); wait(pa, 'ASH.net().amHost', 5); time.sleep(2)
    cnt = lambda pg, i: pg.evaluate('ASH.core.invCount(ASH.me, "%s") + (Object.values(ASH.me.eq).filter(e => e && e.id === "%s").length)' % (i, i))
    for giver, taker, item, who in ((pa, pb, 'sword_t1', 'host -> other'), (pb, pa, 'potion', 'other -> host')):
        giver.evaluate('ASH.give("%s", 1)' % item); time.sleep(0.5)
        g0, t0 = cnt(giver, item), cnt(taker, item)
        giver.evaluate('ASH.core.cmd("me", {c: "drop", slot: ASH.me.inv.findIndex(s => s && s.id === "%s")})' % item)
        js = '(() => { const g = ASH.core.S.ground.find(q => q.id === "%s"); return g ? g.uid : null; })()' % item
        okb = wait(taker, js + ' !== null', 15); oka = wait(giver, js + ' !== null', 5)
        check(okb and oka, '%s: the dropped %s shows on the ground for both players' % (who, item))
        uid = taker.evaluate(js)
        if uid is not None:
            taker.evaluate('ASH.core.cmd("me", {c: "take", uid: %d, run: true})' % uid)
            got = wait(taker, 'ASH.core.invCount(ASH.me, "%s") > %d' % (item, t0 - (0 if item != 'sword_t1' else 0)), 25)
            time.sleep(2)
            check(got and cnt(taker, item) == t0 + 1 and cnt(giver, item) == g0 - 1, '%s: the taker picked it up (taker %d->%d, dropper %d->%d)' % (who, t0, cnt(taker, item), g0, cnt(giver, item)))
            check(giver.evaluate(js) is None and taker.evaluate(js) is None, '%s: gone from the ground on both screens (one copy only)' % who)
    check(not [e for e in errs if 'favicon' not in e], 'no console errors (%s)' % errs[:3])
    ctx.close()


def drag_out_shared(b, url_for, label):
    """v0.4: A drags an item off the inventory over the world (a real mouse drag); B sees it and picks it up."""
    print('== drag-out drop seen by another player over', label)
    ctx = b.new_context(viewport={'width': 900, 'height': 600}); errs = []
    pa = open_page(ctx, url_for(30), errs, 'A'); pa.evaluate(STRONG + '; ASH.hud.setTab("inv"); ASH.teleport(20, 52)'); time.sleep(3)
    pb = open_page(ctx, url_for(31), errs, 'B'); pb.evaluate(STRONG + '; ASH.teleport(21, 52)')
    wait(pb, 'ASH.net().host && !ASH.net().amHost', 20); time.sleep(2)
    pa.evaluate('ASH.give("helmet_t2", 1)'); time.sleep(0.6)
    i = pa.evaluate('ASH.me.inv.findIndex(s => s && s.id === "helmet_t2")'); bb = pa.locator('.panel .inv .slot >> nth=%d' % i).bounding_box()
    x, y = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
    pa.mouse.move(x, y); pa.mouse.down(); pa.mouse.move(x - 20, y, steps=3); pa.mouse.move(250, 300, steps=10); pa.mouse.up()
    js = '(() => { const g = ASH.core.S.ground.find(q => q.id === "helmet_t2"); return g ? g.uid : null; })()'
    check(wait(pb, js + ' !== null', 15), 'A dragged the iron helm out of the inventory; it lies on the ground on B\'s screen')
    uid = pb.evaluate(js)
    if uid is not None:
        pb.evaluate('ASH.core.cmd("me", {c: "take", uid: %d, run: true})' % uid)
        check(wait(pb, 'ASH.core.invCount(ASH.me, "helmet_t2") === 1', 25) and wait(pa, js + ' === null', 10), 'B picked it up; it is gone from both screens')
    check(not errs, 'no console errors %s' % errs[:3])
    ctx.close()

def remote_tool(b, url_for, label):
    """2026-10-01: other players' items render wrong, especially while gathering. A fishes with a rod: B must draw
    A holding the rod (not the net, not a weapon), and A's gear must show on B even if B missed the equip message."""
    print('== remote tool + gear refresh over', label)
    ctx = b.new_context(viewport={'width': 900, 'height': 600}); errs = []
    pa = open_page(ctx, url_for(40), errs, 'A'); pa.evaluate(STRONG + '; ASH.teleport(20, 52)'); time.sleep(3)
    pb = open_page(ctx, url_for(41), errs, 'B'); pb.evaluate(STRONG + '; ASH.teleport(21, 52)')
    wait(pb, 'ASH.net().host', 20); time.sleep(2)
    rem = '[...ASH.ents.values()].filter(e => e.key && e.key.startsWith("r:"))[0]'
    pa.evaluate('(() => { const p = ASH.me; p.skilling = "fish"; p.toolId = "fishing_rod"; })()')
    check(wait(pb, '(%s || {H: {}}).H.tool === "fishing_rod"' % rem, 15), 'B draws A fishing with the rod in hand')
    pa.evaluate('(() => { const p = ASH.me; p.skilling = null; p.toolId = null; })()')
    check(wait(pb, '(%s || {H: {tool: 1}}).H.tool === null' % rem, 15), 'the rod goes away on B when A stops fishing')
    pb.evaluate('(() => { const r = %s; r.H.setGear({}); })()' % rem)   # B "missed" A's gear: the 10 s refresh must fix it
    pa.evaluate('ASH.give("helmet_t2", 1)'); time.sleep(0.3); pa.evaluate('ASH.core.cmd("me", {c: "equip", slot: ASH.me.inv.findIndex(s => s && s.id === "helmet_t2")})')
    time.sleep(1); pb.evaluate('(() => { const r = %s; r.H.setGear({}); })()' % rem)
    check(wait(pb, '(%s || {H: {gear: {}}}).H.gear.head === "helmet_t2"' % rem, 15), "A's helm reappears on B after B lost it (gear refresh)")
    check(not errs, 'no console errors %s' % errs[:3])
    ctx.close()

def return_after_away(b, url_for, label):
    """2026-10-02: A stays in a zone and kills a monster; B leaves, its own copy respawns the zone while away; B
    comes back: the host's state must win (the dead monster stays dead and off B's screen, nothing frozen)."""
    print('== returning player adopts the host\'s zone over', label)
    ctx = b.new_context(viewport={'width': 900, 'height': 600}); errs = []
    pa = open_page(ctx, url_for(50), errs, 'A'); pa.evaluate(STRONG + '; ASH.teleport(24, 30)'); time.sleep(3)
    pb = open_page(ctx, url_for(51), errs, 'B'); pb.evaluate(STRONG + '; ASH.teleport(25, 31)')
    wait(pb, 'ASH.net().host && !ASH.net().amHost', 20); time.sleep(2)
    uid = pa.evaluate('(() => { const z = ASH.core.S.mobs.find(m => !m.dead && m.zone === "whisperwood"); z.hp = 0; z.dead = ASH.core.S.t; return z.uid; })()')
    check(wait(pb, '(() => { const m = ASH.core.mobByUid(%d); return m && !!m.dead; })()' % uid, 15), 'B sees the monster A killed as dead')
    pb.evaluate('ASH.teleport(22, 52)'); time.sleep(40)   # away longer than the empty-zone respawn time
    pb.evaluate('ASH.teleport(25, 31)')
    ok = wait(pb, '(() => { const m = ASH.core.mobByUid(%d), e = ASH.ents.get("m:%d"); return m && !!m.dead && (!e || !e.root.visible); })()' % (uid, uid), 20)
    check(ok, 'B came back: the monster is still dead and not standing frozen on B\'s screen')
    check(pa.evaluate('ASH.net().amHost'), 'A (who stayed) is still the host')
    check(not errs, 'no console errors %s' % errs[:3])
    ctx.close()

def adjacent_zones(b, url_for, label):
    """2026-10-02: "when players move from one zone to the other, they disappear to anyone in the other zone. If the
    zones are adjacent then the player should be visible." One room per region, a host per area: A in the village and B in
    Whisperwood see each other and each other's moves; each area has its own host; A walks from the village into
    Whisperwood and B sees A the whole way; A shoots a Whisperwood wolf from the village (B hosts it): both screens agree."""
    print('== adjacent zones (one room per region, a host per area) over', label)
    ctx = b.new_context(viewport={'width': 640, 'height': 420}); errs = []
    pa = open_page(ctx, url_for(60), errs, 'A'); pa.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "Ann"}); ASH.teleport(22, 52)'); time.sleep(3)
    pb = open_page(ctx, url_for(61), errs, 'B'); pb.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(24, 30)')
    REM = '[...ASH.ents.values()].filter(e => e.key && e.key.startsWith("r:") && e.root.visible)'
    seen = wait(pa, REM + '.length === 1', 25) and wait(pb, REM + '.length === 1', 10)
    check(seen and pa.evaluate('ASH.net().area') == 'village' and pb.evaluate('ASH.net().area') == 'whisperwood', 'A in the village and B in Whisperwood see each other (%s / %s, room %s)' % (pa.evaluate('ASH.net().area'), pb.evaluate('ASH.net().area'), pa.evaluate('ASH.net().region')))
    ida, idb = pa.evaluate('ASH.net().myId'), pb.evaluate('ASH.net().myId')
    hosts_ok = wait(pa, 'ASH.net().hosts.village === %s && ASH.net().hosts.whisperwood === %s' % (json.dumps(ida), json.dumps(idb)), 15) and wait(pb, 'ASH.net().hosts.village === %s && ASH.net().hosts.whisperwood === %s' % (json.dumps(ida), json.dumps(idb)), 10)
    check(hosts_ok and pa.evaluate('ASH.net().amHost') and pb.evaluate('ASH.net().amHost'), 'a host per area: A hosts the village, B hosts Whisperwood, both agree (%s)' % pb.evaluate('JSON.stringify(ASH.net().hosts)'))
    gap = lambda viewer, mover: viewer.evaluate('(() => { const r = %s[0]; return r ? Math.hypot(r.root.position.x - %f, r.root.position.z - %f) : 99; })()' % ((REM,) + tuple(c + 0.5 for c in mover.evaluate('[ASH.me.x, ASH.me.y]'))))
    pb.evaluate('ASH.core.cmd("me", {c: "walk", x: 27, y: 28})'); time.sleep(4)
    pa.evaluate('ASH.core.cmd("me", {c: "walk", x: 30, y: 50})'); wait(pa, 'ASH.me.x === 30 && ASH.me.y === 50 && !ASH.me.path.length', 20); time.sleep(2)
    ga, gb = gap(pb, pa), gap(pa, pb)
    check(ga < 1.2 and gb < 1.2, 'positions update across the border: B draws A within %.2f m of A, A draws B within %.2f m of B' % (ga, gb))
    # A walks from the village up the path into Whisperwood; B watches every step
    mobs_b = json.loads(pb.evaluate(MOBS))
    pa.evaluate('ASH.core.cmd("me", {c: "walk", x: 24, y: 33})')
    # "sees A the whole way": B's avatar of A stays visible and is always where A was a moment ago (within 1.5 m of a tile
    # A stood on in the last 2.5 s: drawing runs ~0.4 s behind, plus one send interval and this busy machine's frame rate)
    samples, worst, lost, crossed, hist = 0, 0.0, 0, False, []
    t0 = time.time()
    while time.time() - t0 < 40:
        st = pa.evaluate('[ASH.me.x, ASH.me.y, ASH.net().area]'); now = time.time(); hist.append((now, st[0] + 0.5, st[1] + 0.5))
        crossed = crossed or st[2] == 'whisperwood'
        rp = pb.evaluate('(() => { const r = %s[0]; return r ? [r.root.position.x, r.root.position.z] : null; })()' % REM)
        if not rp: lost += 1
        else: worst = max(worst, min(((rp[0] - x) ** 2 + (rp[1] - y) ** 2) ** 0.5 for t_, x, y in hist if now - t_ <= 2.5))
        samples += 1
        if st[0] == 24 and st[1] == 33 and len(hist) > 3 and hist[-4][1:] == hist[-1][1:]: break
        time.sleep(0.25)
    time.sleep(1.5)
    check(crossed and lost == 0 and worst < 1.5, 'A walked from the village into Whisperwood and B saw A the whole way (%d samples, never lost, worst %.1f m from where A just was)' % (samples, worst))
    hw = wait(pb, 'ASH.net().hosts.whisperwood === %s' % json.dumps(ida), 10)
    check(hw and wait(pa, 'ASH.net().hosted.includes("whisperwood")', 5), 'A joined first, so A now hosts Whisperwood too; B follows it (the hand-over takes the state B kept)')
    time.sleep(2)
    ma, mb = json.loads(pa.evaluate(MOBS)), json.loads(pb.evaluate(MOBS))
    diff = max(max(abs(x[1] - y[1]), abs(x[2] - y[2])) for x, y in zip(ma, mb) if not x[3])
    check(diff <= 1 and [x[3] for x in ma] == [y[3] for y in mb] == [z[3] for z in mobs_b], 'after the hand-over both still show the same Whisperwood monsters (worst gap %d tile)' % diff)
    # cross-area fight: B goes back to host Whisperwood alone; A shoots a Whisperwood wolf from the village side of the border
    pa.evaluate('ASH.teleport(24, 41)'); time.sleep(2.5)
    check(wait(pb, 'ASH.net().hosts.whisperwood === %s' % json.dumps(idb), 10), 'A stepped back into the village: Whisperwood is B\'s again')
    pb.evaluate('ASH.teleport(21, 38)'); time.sleep(2.5)
    for pg in (pa, pb): pg.evaluate('ASH.hud.setTab(null); ASH.setCam(%s, 0.8, 11)' % ('0' if pg is pa else '3.14'))
    time.sleep(0.8); side_by_side([pa, pb], 'shared_adjacent.png')   # A (village) and B (Whisperwood) on both screens, across the border
    pa.evaluate('ASH.give("bow_t1", 1); ASH.give("arrows_t1", 200)'); time.sleep(0.5)
    pa.evaluate('ASH.core.cmd("me", {c: "equip", slot: ASH.me.inv.findIndex(s => s && s.id === "bow_t1")})'); time.sleep(0.8)
    pa.evaluate('ASH.core.cmd("me", {c: "equip", slot: ASH.me.inv.findIndex(s => s && s.id === "arrows_t1")})'); time.sleep(0.8)
    w = pb.evaluate('(() => { const m = ASH.core.S.mobs.find(m => m.key === "wolf" && !m.dead); m.x = m.sx = 24; m.y = m.sy = 37; m.wx = null; return m.uid; })()')
    wait(pa, '(() => { const m = ASH.core.mobByUid(%d); return m.x === 24 && m.y === 37; })()' % w, 10)
    xr = pa.evaluate('ASH.me.xp.ranged')
    pa.evaluate('ASH.core.cmd("me", {c: "attack", uid: %d})' % w)
    hurt_b = wait(pb, 'ASH.core.mobByUid(%d).hp < ASH.core.D.monsters.wolf.hp' % w, 30)
    dead = wait(pa, 'ASH.core.mobByUid(%d).dead > 0' % w, 60) and wait(pb, 'ASH.core.mobByUid(%d).dead > 0' % w, 10)
    check(hurt_b and dead and pa.evaluate('ASH.me.xp.ranged') > xr and pa.evaluate('ASH.net().area') == 'village', 'cross-area fight: A shot B\'s Whisperwood wolf from the village; B (its host) resolved it, it died on both screens, A got the XP')
    for nm, pg in (('A', pa), ('B', pb)):
        st = pg.evaluate('ASH.net().stats')
        check(st['perSec'] <= 5 and st['max2s'] <= 10 and st['dropped'] == 0, '%s send budget held (%.2f/s, max %d in 2 s, dropped %d)' % (nm, st['perSec'], st['max2s'], st['dropped']))
    check(not errs, 'no console errors %s' % errs[:3])
    ctx.close()

def neighbour_regions(b, url_for, label):
    """Neighbour rooms (2026-10-04, game-agnostic net.neighbours): A and B stand either side of a REGION border (two rooms).
    Each joins the other's room as a viewer and draws the other; neither becomes a puppet or a host in the other's room;
    moves show; when B walks far away the neighbour room is left and A stops drawing B."""
    print('== neighbour regions (viewers across a region border) over', label)
    ctx = b.new_context(viewport={'width': 640, 'height': 420}); errs = []
    pa = open_page(ctx, url_for(70), errs, 'A'); pa.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "Ann"})')
    bx, by = pa.evaluate('(() => { const R = ASH.core.regionOf, y = ASH.me.y; let x = ASH.me.x; const r0 = R(x, y); while (R(x, y) === r0) x++; return [x, y]; })()')
    pa.evaluate('ASH.teleport(%d, %d)' % (bx - 8, by)); time.sleep(3)
    pb = open_page(ctx, url_for(71), errs, 'B'); pb.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "Ben"}); ASH.teleport(%d, %d)' % (bx + 8, by))
    REM = '[...ASH.ents.values()].filter(e => e.key && e.key.startsWith("r:") && e.root.visible)'
    wait(pb, 'ASH.net().region === %s && !!ASH.net().room' % json.dumps(pb.evaluate('ASH.core.regionOf(%d, %d)' % (bx + 8, by))), 20)
    ra, rb = pa.evaluate('ASH.net().region'), pb.evaluate('ASH.net().region')
    print('     border x=%d y=%d; B stands at %s' % (bx, by, pb.evaluate('[ASH.me.x, ASH.me.y]')))
    check(ra and rb and ra != rb, 'A and B are in two different regions (rooms %s / %s), %d m apart' % (ra, rb, 16))
    seen = wait(pa, REM + '.length === 1', 30) and wait(pb, REM + '.length === 1', 15)
    check(seen and rb in pa.evaluate('ASH.net().neighbours') and ra in pb.evaluate('ASH.net().neighbours'), 'each viewed the other\'s room and draws the other (%s / %s)' % (pa.evaluate('ASH.net().neighbours'), pb.evaluate('ASH.net().neighbours')))
    ida, idb = pa.evaluate('ASH.net().myId'), pb.evaluate('ASH.net().myId')
    check(idb in pa.evaluate('ASH.net().viewers') and not pa.evaluate('!!ASH.core.S.players[%s]' % json.dumps(idb)) and idb not in pa.evaluate('Object.values(ASH.net().hosts)'), 'B is only a viewer on A\'s side: no puppet, never a host (hosts %s)' % pa.evaluate('JSON.stringify(ASH.net().hosts)'))
    check(pa.evaluate('ASH.net().amHost') and pb.evaluate('ASH.net().amHost'), 'each still hosts their own area')
    nm = pa.evaluate('%s[0].tag && %s[0].tag.textContent' % (REM, REM))
    check(nm and 'Ben' in nm, 'A sees B\'s name over the border: %s' % nm)
    pb.evaluate('ASH.core.cmd("me", {c: "walk", x: %d, y: %d})' % (bx + 4, by + 3)); wait(pb, 'ASH.me.x === %d && ASH.me.y === %d' % (bx + 4, by + 3), 20); time.sleep(3)
    g = pa.evaluate('(() => { const r = %s[0]; return r ? Math.hypot(r.root.position.x - %f, r.root.position.z - %f) : 99; })()' % (REM, bx + 4.5, by + 3.5))
    check(g < 1.5, 'B\'s move shows on A\'s screen across the border (%.2f m off)' % g)
    pa.evaluate('ASH.hud.setTab(null); ASH.setCam(0, 0.8, 14)'); pb.evaluate('ASH.hud.setTab(null); ASH.setCam(3.14, 0.8, 14)')
    time.sleep(0.8); side_by_side([pa, pb], 'shared_neighbours.png')
    pb.evaluate('ASH.teleport(%d, %d)' % (bx + 150, by))
    gone = wait(pa, REM + '.length === 0', 25) and wait(pb, 'ASH.net().neighbours.length === 0', 10)
    check(gone, 'B went far into its region: B left A\'s room and A stopped drawing B')
    for nm_, pg in (('A', pa), ('B', pb)):
        st = pg.evaluate('ASH.net().stats')
        check(st['perSec'] <= 5 and st['max2s'] <= 10 and st['dropped'] == 0, '%s send budget held with a neighbour room (%.2f/s, max %d in 2 s, dropped %d)' % (nm_, st['perSec'], st['max2s'], st['dropped']))
    check(not errs, 'no console errors %s' % errs[:3])
    ctx.close()

def three_on_leader(b, url_for, label):
    print('== three players on the bandit leader over', label)
    ctx = b.new_context(viewport={'width': 560, 'height': 380}); errs = []
    pages = []
    for i, (nm, x, y) in enumerate((('Ann', 16, 4), ('Ben', 17, 4), ('Cat', 18, 5))):
        pg = open_page(ctx, url_for(10 + i), errs, nm); pg.evaluate(STRONG + '; ASH.core.cmd("me", {c: "look", name: "%s"}); ASH.teleport(%d, %d)' % (nm, x, y)); pages.append(pg); time.sleep(1.5)
    pc = pages[2]; pc.evaluate('ASH.give("bow_t1", 1); ASH.give("arrows_t1", 200)'); time.sleep(0.5)
    pc.evaluate('ASH.core.cmd("me", {c: "equip", slot: ASH.me.inv.findIndex(s => s && s.id === "bow_t1")})'); time.sleep(0.8)
    pc.evaluate('ASH.core.cmd("me", {c: "equip", slot: ASH.me.inv.findIndex(s => s && s.id === "arrows_t1")})'); time.sleep(3)
    host = pages[0].evaluate('ASH.net().myId')
    # the host field each page shows converges a tick or two after it starts talking to that host, so wait for it;
    # the checks below (one mob, one HP trace, one drop pile) are what actually proves they share a world
    for _ in range(20):
        if all(pg.evaluate('ASH.net().host') == host for pg in pages): break
        time.sleep(1)
    check(all(pg.evaluate('ASH.net().host') == host for pg in pages), 'one host for all three')
    L = pages[0].evaluate('ASH.core.S.mobs.find(m => m.key === "bandit_leader").uid')
    xp0 = [pg.evaluate('ASH.me.xp.attack + ASH.me.xp.ranged') for pg in pages]
    for pg in pages: pg.evaluate('ASH.core.cmd("me", {c: "attack", uid: %d, run: true})' % L)
    hp_seen = [set() for _ in pages]
    t0 = time.time()
    while time.time() - t0 < 90 and not pages[0].evaluate('ASH.core.mobByUid(%d).dead > 0' % L):
        for k, pg in enumerate(pages): hp_seen[k].add(pg.evaluate('ASH.core.mobByUid(%d).hp' % L))
        for pg in pages: pg.evaluate('ASH.me.hp = Math.max(ASH.me.hp, 20)')
        if len(hp_seen[0]) == 4: side_by_side(pages, 'shared_three_on_leader.png')
        time.sleep(0.4)
    dead_all = all(wait(pg, 'ASH.core.mobByUid(%d).dead > 0' % L, 10) for pg in pages)
    check(dead_all, 'the bandit leader dies on all three screens')
    check(all(len(s) >= 3 for s in hp_seen), 'every client watched his HP fall step by step (%s)' % [sorted(s, reverse=True)[:6] for s in hp_seen])
    xp1 = [pg.evaluate('ASH.me.xp.attack + ASH.me.xp.ranged') for pg in pages]
    check(all(b_ > a_ for a_, b_ in zip(xp0, xp1)), 'each of the three got XP for their own damage: %s' % [b_ - a_ for a_, b_ in zip(xp0, xp1)])
    time.sleep(3)
    hx, hy = pages[0].evaluate('[ASH.core.mobByUid(%d).x, ASH.core.mobByUid(%d).y]' % (L, L))   # where the host had him fall
    piles = [sorted(pg.evaluate('ASH.core.S.ground.filter(g => g.x === %d && g.y === %d).map(g => g.uid)' % (hx, hy))) for pg in pages]
    check(piles[0] and piles[0] == piles[1] == piles[2], 'one kill, one drop pile, the same items for everyone: %s' % piles[0])
    check(not errs, 'no console errors %s' % errs[:3])
    ctx.close()

which = sys.argv[1] if len(sys.argv) > 1 else 'all'
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    if which == 'adjacent':   # just the adjacent-zones case
        adjacent_zones(b, lambda i: 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=z%d' % i, 'loopback')
    if which == 'neighbours':   # just the neighbour-regions case
        neighbour_regions(b, lambda i: 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&nb&seed=n%d' % i, 'loopback')
    if which == 'away':   # just the return-after-away case
        return_after_away(b, lambda i: 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=w%d' % i, 'loopback')
    if which in ('all', 'loopback'):
        U = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed='
        session(b, lambda i: U + 's%d' % i, 'loopback')
        three_on_leader(b, lambda i: U + 't%d' % i, 'loopback')
        player_drop(b, lambda i: U + 'd%d' % i, 'loopback')
        drag_out_shared(b, lambda i: U + 'g%d' % i, 'loopback')
        remote_tool(b, lambda i: U + 'r%d' % i, 'loopback')
        return_after_away(b, lambda i: U + 'w%d' % i, 'loopback')
        adjacent_zones(b, lambda i: U + 'z%d' % i, 'loopback')
        neighbour_regions(b, lambda i: U.replace('loopback&', 'loopback&nb&') + 'n%d' % i, 'loopback')
    if which in ('all', 'arcade'):
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'arcade_mock')); import server as mock
        srv = mock.serve(8736); threading.Thread(target=srv.serve_forever, daemon=True).start()
        session(b, lambda i: 'http://127.0.0.1:8736/?nocreator&seed=x%d' % i, 'arcade mock', sandbox=True)
        srv.shutdown()
    b.close()
print('FAILED: %d' % len(fails) if fails else 'ALL OK')
for f in fails: print('  -', f)
sys.exit(1 if fails else 0)
