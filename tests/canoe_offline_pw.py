"""canoe_offline_pw.py (2026-10-08): two in a canoe, one drops out of the game - their avatar rides on in the bow; if it
was the one steering, the other takes the stern; put ashore, they wait on the bank. Local, ?loopback (two tabs = two players).
Needs: python3 -m http.server 8731 in ~/ashvale3d."""
import time, json
from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
U = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=co'
fails = 0
def ok(c, m):
    global fails
    fails += not c; print(('PASS ' if c else 'FAIL ') + m)
def until(f, t):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if f(): return True
        except Exception: pass
        time.sleep(0.5)
    return False
with sync_playwright() as P:
    b = P.chromium.launch(args=ARGS); errs = []
    def page(tag, ctx):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(U + tag, wait_until='domcontentloaded', timeout=180000)
        until(lambda: pg.evaluate('!!(window.ASH && ASH.me)'), 60); time.sleep(5); pg.evaluate('ASH.hud.showHelp(false)'); return pg
    def chat(pg): return pg.evaluate("Array.from(document.querySelectorAll('#chat div, .chat div, .chatline')).map(e => e.innerText).join(' | ')")
    for round_, steer_drops in ((1, False), (2, True)):
        ctx = b.new_context(viewport={'width': 640, 'height': 400})
        A = page('a%d' % round_, ctx); A.evaluate('ASH.teleport(88, 619)'); time.sleep(3)
        B = page('b%d' % round_, ctx); B.evaluate('ASH.teleport(90, 619)'); time.sleep(4)
        S, Rd = (B, A) if steer_drops else (A, B)   # S steers, Rd rides; the one who drops: B
        S.evaluate("ASH.core.cmd(ASH.core.S.order[0], {c: 'board', x: 89, y: 621})")
        ok(until(lambda: S.evaluate('ASH.me.boat') == 1, 20), 'round %d: the steersman is in the canoe' % round_)
        time.sleep(3)
        until(lambda: Rd.evaluate("!!ASH.remotesInfo().find(r => r.boat === 1)"), 30)
        sid = Rd.evaluate("(ASH.remotesInfo().find(r => r.boat === 1) || {}).id")
        Rd.evaluate("id => ASH.core.cmd(ASH.core.S.order[0], {c: 'ride', pid: id})", sid)
        ok(until(lambda: Rd.evaluate('ASH.me.boat') == 2, 20), 'round %d: the second player gets in (no tools: paddling)' % round_)
        time.sleep(3)
        stay = A
        B.close()
        ok(until(lambda: any(r['offline'] for r in stay.evaluate('ASH.remotesInfo()')), 30), 'round %d: B drops out - A still has them aboard, offline' % round_)
        ok(stay.evaluate('ASH.me.boat') == 1, 'round %d: A %s' % (round_, 'took the stern and steers' if steer_drops else 'steers on'))
        x0 = stay.evaluate('ASH.me.x')
        stay.evaluate("ASH.core.cmd(ASH.core.S.order[0], {c: 'walk', x: ASH.me.x + 25, y: ASH.me.y + 6})"); time.sleep(10)
        ok(any(r['offline'] and r['boat'] == 2 for r in stay.evaluate('ASH.remotesInfo()')) and stay.evaluate('ASH.me.x') != x0, 'round %d: the canoe travels on with them seated in the bow' % round_)
        ok('dropped out' in chat(stay), 'round %d: A is told (%s)' % (round_, [l for l in chat(stay).split(' | ') if 'dropped' in l][:1]))
        ctx.close()
    print('errors', errs[:4]); b.close()
print('ALL PASS' if not fails else 'FAILED: %d' % fails)
