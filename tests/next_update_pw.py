"""next_update_pw.py - 2026-10-06: timber wolves at (-5, -160) (the Timber Wolf Den area), sounds heard only within
15 tiles (the pond at (270, 0) is checked by eye: flat at the water line). Needs: python3 -m http.server 8731 in ~/ashvale3d."""
import os, sys
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def ok(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
FAKE_AUDIO = """window.__gains = []; class FakeAC { constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
  resume() {} createGain() { const g = { gain: { _v: 0, set value(v) { this._v = v; }, get value() { return this._v; }, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; window.__gains.push(g); return g; }
  createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; } createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { frequency: { value: 0, setValueAtTime() {} }, Q: { value: 0 }, connect() {} }; } }
window.AudioContext = FakeAC; window.webkitAudioContext = FakeAC;"""
with sync_playwright() as P:
    b = P.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']); ctx = b.new_context(viewport={'width': 1000, 'height': 700}); ctx.add_init_script(FAKE_AUDIO)
    pg = ctx.new_page(); E = []; pg.on('pageerror', lambda e: E.append(str(e)))
    pg.goto('http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&seed=next', timeout=120000); pg.wait_for_function('window.ASH && ASH.me', timeout=120000); pg.wait_for_timeout(3000)
    pg.evaluate("ASH.hud.showHelp(false); ASH.settings.sound = true")
    # sounds by distance
    def played(at):
        pg.evaluate("window.__gains.length = 0"); pg.evaluate("ASH.sfxAt('hit', %s)" % at)
        return pg.evaluate("window.__gains.length ? window.__gains[0].gain.value : null")
    mx, my = pg.evaluate("[ASH.me.x, ASH.me.y]")
    v0, v10, v14, v20, vme = played('{x: %d, y: %d}' % (mx, my)), played('{x: %d, y: %d}' % (mx + 10, my)), played('{x: %d, y: %d}' % (mx + 14, my)), played('{x: %d, y: %d}' % (mx + 20, my)), played('null')
    ok(v0 and abs(v0 - 0.22) < 1e-6, 'a sound where you stand plays at full volume (%s)' % v0)
    ok(v10 and 0 < v10 < 0.22, '10 tiles away it is quieter (%s)' % v10)
    ok(v14 and v14 < v10, '14 tiles away quieter still (%s)' % v14)
    ok(v20 is None, '20 tiles away it is not played at all (%s)' % v20)
    ok(vme and abs(vme - 0.22) < 1e-6, 'your own sounds always play (%s)' % vme)
    # the wolves
    ok('wolfden' in pg.evaluate("ASH.zones().index"), 'the Timber Wolf Den is in the area index')
    pg.evaluate("ASH.teleport(-5, -158)"); pg.wait_for_timeout(12000)
    wolves = pg.evaluate("ASH.core.S.mobs.filter(m => m.key === 'timber_wolf' && Math.abs(m.x + 5) <= 12 && Math.abs(m.y + 160) <= 12).map(m => [m.sx, m.sy])")
    ok(len(wolves) == 4 and [-5, -160] in wolves, 'four timber wolves at the den, one on (-5, -160): %s' % wolves)
    ok(not E, 'no page errors %s' % E[:2])
    b.close()
print('ALL PASS' if not fails else 'FAILED %d' % len(fails)); sys.exit(1 if fails else 0)
