"""[Claude 2026-10-14] the operator: "when I'm looking at another person's avatar their walking animation is not matching up with their
movement and their walking animation stops before they get to their final position and it looks like they ski to their final
position". Two games in one loopback room; Ben walks (and runs) back and forth while Ann samples, every frame, where she draws
him and what his legs do. Checks: the drawn body never travels while his legs stand still (sliding), and he stands once he stops.
  python3 tests/remote_walk_pw.py   (server: python3 -m http.server 8731 in ~/ashvale3d; HEADLESS=1 off-screen)"""
import os, sys, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c: fails.append(msg)
def wait(pg, js, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=rwalk%d'
SAMPLER = """(id) => new Promise(res => { const out = []; let t0 = performance.now();
  (function f(){ const v = ASH.remoteView(id); if (v) out.push([performance.now() - t0, v.x, v.z, v.anim]); if (performance.now() - t0 < 9000) requestAnimationFrame(f); else res(out); })(); })"""
with sync_playwright() as pw:
    br = pw.chromium.launch(headless=bool(os.environ.get('HEADLESS')), args=['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'])
    ctx = br.new_context(viewport={'width': 900, 'height': 600}); errs = []
    ann = ctx.new_page(); ann.on('pageerror', lambda e: errs.append('Ann ' + str(e)))
    ann.goto(URL % 1); wait(ann, '!!(window.ASH && ASH.core)', 90)
    with ctx.expect_page() as info: ann.evaluate('([u, f]) => window.open(u, "_blank", f)', [URL % 2, 'popup=1,left=900,top=1080,width=900,height=600'])
    bp = info.value; bp.on('pageerror', lambda e: errs.append('Ben ' + str(e)))
    wait(bp, '!!(window.ASH && ASH.core)', 90); time.sleep(2)
    for pg in (ann, bp): pg.evaluate('ASH.hud.showHelp(false)')
    x0, y0 = ann.evaluate('[ASH.me.x, ASH.me.y]'); bp.evaluate('ASH.teleport(%d, %d)' % (x0 + 2, y0)); time.sleep(1)
    bid = bp.evaluate('ASH.net().myId')
    ok = wait(ann, 'ASH.net().ids.includes(%s)' % json.dumps(bid), 30); check(ok, 'Ann hears Ben')
    if not ok: print('     Ann', ann.evaluate('JSON.stringify(ASH.net()).slice(0,400)'), '\n     Ben', bp.evaluate('JSON.stringify(ASH.net()).slice(0,400)'), ann.evaluate('[ASH.me.x,ASH.me.y]'), bp.evaluate('[ASH.me.x,ASH.me.y]'))
    for leg, (dx, run) in enumerate([(8, False), (-8, True), (6, False)]):
        bx, by = bp.evaluate('[ASH.me.x, ASH.me.y]')
        bp.evaluate('ASH.core.cmd("me", %s)' % json.dumps({'c': 'walk', 'x': bx + dx, 'y': by, 'run': run}))
        S = ann.evaluate(SAMPLER, bid)
        slide = 0; worst = 0; moved = 0; endIdle = None; last_move = 0
        for i in range(1, len(S)):
            d = abs(S[i][1] - S[i-1][1]) + abs(S[i][2] - S[i-1][2]); moved += d
            if d > 0.002: last_move = S[i][0]
            if d > 0.002 and S[i][3] not in ('walk', 'run'): slide += d
            else: worst = max(worst, slide) if S[i][3] in ('walk', 'run') else worst
        worst = max(worst, slide)
        stood = next((s[0] for s in S if s[0] > last_move and s[3] == 'idle'), None)
        anims = sorted(set(s[3] for s in S))
        print('     leg %d (%s %+d): drawn %.1f m, slid %.2f m with still legs, anims %s, last move %.0f ms, stood %s ms' % (leg + 1, 'run' if run else 'walk', dx, moved, slide, anims, last_move, stood and round(stood)))
        check(moved > abs(dx) * 0.8, 'leg %d: Ann draws Ben going the whole way' % (leg + 1))
        check(slide < 0.15, 'leg %d: Ben never slides with his legs still (%.2f m)' % (leg + 1, slide))
        check(('run' in anims) == run, 'leg %d: %s' % (leg + 1, 'he runs' if run else 'he walks, not runs'))
        check(stood is not None and stood - last_move < 600, 'leg %d: he stands once he has stopped' % (leg + 1))
    check(not errs, 'no page errors ' + ('; '.join(errs[:3])))
    br.close()
print('ALL OK' if not fails else '%d FAILED' % len(fails))
