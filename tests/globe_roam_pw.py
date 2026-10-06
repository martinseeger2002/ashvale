#!/home/you/.pyenv/versions/3.11.9/bin/python3
"""ASHVALE Atlas check (the globe explorer), headless Chromium + SwiftShader, straight from the file (no server needed).
  python3 tools/globe_roam.py && tests/globe_roam_pw.py
Desktop: planet -> tap a parcel -> Walk here -> ground; land on the core; walk 300 m in a straight line across chunk
borders; walk across a face seam (and on until the anchor face changes); try to walk into a peak and into the sea
(both blocked); Parcels on/off; Fly up and back; the set-piece edges (Whisperwood and the village, every outer edge,
ground level and high). Phone (iPhone size, touch): tap, Walk here, tap-to-walk, double-tap run, drag, pinch, Fly up.
Draw calls and triangles are counted per frame from WebGL itself (every draw call, shadows included).
Shots: tests/shots/roam_*.png. LOOK at every one of them."""
import os, sys, time, json, math
from playwright.sync_api import sync_playwright

os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'playtest', 'globe_roam.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails, perf = [], {}
GLCOUNT = """(function(){const C=window.__gl={calls:0,tris:0};const tri=(m,n)=>m===4?n/3:m===5?n-2:0;
for(const P of [WebGL2RenderingContext.prototype,WebGLRenderingContext.prototype]){const de=P.drawElements,da=P.drawArrays,dei=P.drawElementsInstanced,dai=P.drawArraysInstanced;
P.drawElements=function(m,n,t,o){C.calls++;C.tris+=tri(m,n);return de.call(this,m,n,t,o)};P.drawArrays=function(m,f,n){C.calls++;C.tris+=tri(m,n);return da.call(this,m,f,n)};
if(dei)P.drawElementsInstanced=function(m,n,t,o,k){C.calls++;C.tris+=tri(m,n)*k;return dei.call(this,m,n,t,o,k)};if(dai)P.drawArraysInstanced=function(m,f,n,k){C.calls++;C.tris+=tri(m,n)*k;return dai.call(this,m,f,n,k)};}})();"""
HELPERS = """
window.__walk = function (tx, ty, run, maxS) {
  const C = ATLAS.C; const r = C.walkTo(tx, ty, !!run); let t = 0;
  while (C.state().moving && t < (maxS || 60)) { C.sim(0.5); t += 0.5; }
  return Object.assign({ took: t }, r, ATLAS.state());
};
window.__look = function (dx, dy, pitch, dist) { const c = ATLAS.C.cam; c.yaw = c.tyaw = Math.atan2(-dx, dy); c.pitch = c.tpitch = pitch; c.dist = c.tdist = dist; };
window.__frameCount = function (n) { return new Promise(res => { let k = 0; const s = [__gl.calls, __gl.tris]; const t0 = performance.now(); (function f() { if (++k > n) res({ calls: (__gl.calls - s[0]) / n, tris: (__gl.tris - s[1]) / n, fps: n * 1000 / (performance.now() - t0) }); else requestAnimationFrame(f); })(); }); };
"""


def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg); (None if c else fails.append(msg))


def shot(pg, name):
    p = os.path.join(OUT, 'roam_' + name + '.png'); pg.screenshot(path=p); print('     shot', p)


def settle(pg, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = pg.evaluate('ATLAS.stats()')
        if s['mode'] != 'ground' or (s['chunksPending'] == 0 and s['chunks'] >= 4 and not s['reanchoring'] and pg.evaluate('ATLAS.R.readyAround(ATLAS.R.Q.load - 8)')):
            pg.wait_for_timeout(250); return pg.evaluate('ATLAS.stats()')
        pg.wait_for_timeout(200)
    return pg.evaluate('ATLAS.stats()')


def measure(pg, name):
    settle(pg)
    pg.evaluate('__frameCount(5)')
    r = pg.evaluate('__frameCount(20)'); s = pg.evaluate('ATLAS.stats()')
    perf[name] = {'calls': round(r['calls']), 'tris': round(r['tris']), 'fps_swiftshader': round(r['fps'], 1), 'chunks': s['chunks'], 'trisLoaded': s['trisLoaded'],
                  'memMB': s['memMB'], 'chunkMsAvg': s['msAvg'], 'chunkMsMax': s['msMax']}
    print('     perf %-14s %4d calls %7d tris/frame  %5.1f fps (SwiftShader)  %2d chunks  build %.1f ms avg / %.1f max (CPU)' % (
        name, r['calls'], r['tris'], r['fps'], s['chunks'], s['msAvg'], s['msMax']))
    return perf[name]


def boot(pg):
    pg.add_init_script(GLCOUNT)
    t0 = time.time(); pg.goto(URL)
    pg.wait_for_function('window.ATLAS && ATLAS.V.stats().frames > 0', timeout=90000)
    pg.evaluate(HELPERS)
    print('     booted in %.1f s' % (time.time() - t0))


def find_js(pg, kind):
    return pg.evaluate("""(kind => {
      const A = ATLAS, G = A.V.G, W = A.W, C = G.classes(), cc = G.center(C.coreCenter);
      const near = c => { const p = G.center(c); return p[0] * cc[0] + p[1] * cc[1] + p[2] * cc[2]; };
      let best = -1, bq = -2;
      for (let c = 0; c < G.count; c += 1) {
        const cl = G.cls(c);
        if (kind === 'peak' && !G.isPentagon(c)) continue;
        if (kind === 'sea' && !(cl === 'sea' && G.neighbors(c).some(m => G.cls(m) !== 'sea' && G.cls(m) !== 'peak'))) continue;
        if (kind === 'meadow' && cl !== 'creator') continue;
        if (kind === 'coremeadow') { if (cl !== 'core' || c % 7 || near(c) > Math.cos(900 / G.radius_m)) continue; const p = G.planar(c), s = W.sample(p.face, p.x, p.y); if (s.biome !== 0 || s.forest > 0.05) continue; let open = 0; for (let k = 0; k < 24; k++) if (W.walkable(p.face, p.x + Math.cos(-0.5) * k * 13, p.y + Math.sin(-0.5) * k * 13)) open++; if (open < 22) continue; }
        if (kind === 'forest' && cl !== 'wild') continue;
        if (kind === 'meadow' || kind === 'forest') { if (c % 13) continue; const p = G.planar(c), s = W.sample(p.face, p.x, p.y); if (kind === 'meadow' ? (s.biome !== 0 || s.forest > 0.02) : s.biome !== 2) continue; }
        const q = near(c); if (q > bq) { bq = q; best = c; }
      }
      return best; })""" + "('" + kind + "')")


def desktop(p):
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    boot(pg)
    title = pg.evaluate("document.querySelector('.gv .title').innerText")
    check('ASHVALE Atlas' in title, 'planet view titled: ' + title.replace('\n', ' | '))
    pg.wait_for_timeout(800); shot(pg, '01_planet')
    # 1. tap a parcel near the core, Walk here
    pg.evaluate('ATLAS.V.lookAt(ATLAS.V.G.classes().coreCenter, 1.25)'); pg.wait_for_timeout(1500)
    pg.mouse.click(640, 400); pg.wait_for_timeout(500)
    txt = pg.evaluate("document.querySelector('.gv .panel').innerText")
    check('Walk here' in txt and 'Parcel' in txt, 'tap on the planet opens the parcel panel with Walk here')
    shot(pg, '02_panel')
    sel = pg.evaluate('ATLAS.V.stats().selected')
    pg.click('.gv .panel [data-u="walk"]')
    pg.wait_for_function("ATLAS.mode() === 'ground'", timeout=20000); pg.wait_for_timeout(900)
    shot(pg, '03_landing_dive')
    st = pg.evaluate('ATLAS.state()')
    dist_cells = pg.evaluate('(c => { const G = ATLAS.V.G, a = G.center(c), b = G.center(ATLAS.state().cell); return Math.acos(Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2])) * G.radius_m; })(%d)' % sel)
    check(st['mode'] == 'ground' and dist_cells < 700, 'Walk here: standing at ground level on parcel %d (on parcel %d, %.0f m from the chosen centre, %s)' % (sel, st['cell'], dist_cells, st['biome']))
    settle(pg); shot(pg, '04_landing')
    # 2. the core, 300 m in a straight line
    pg.click('.ah [data-a="core"]'); pg.wait_for_function("ATLAS.mode() === 'ground'", timeout=20000); pg.wait_for_timeout(2600)
    st = pg.evaluate('ATLAS.state()')
    check(st['cls'] == 'core' and st['biome'] == 'village', 'Core: landed in the Ashvale vale, in the village (%s, %s, parcel %d)' % (st['cls'], st['biome'], st['cell']))
    pg.evaluate('__look(0.4, -1, 0.5, 13)'); measure(pg, 'village'); shot(pg, '05_core_village')
    c = find_js(pg, 'coremeadow'); pg.evaluate('ATLAS.land(%d, true)' % c); settle(pg); st = pg.evaluate('ATLAS.state()')
    check(st['cls'] == 'core', 'a core parcel in the open vale: %d (%s, %s)' % (c, st['cls'], st['biome']))
    x0, y0 = st['px'], st['py']; ang = -0.5; dx, dy = math.cos(ang), math.sin(ang)
    chunks = set(); built0 = pg.evaluate('ATLAS.stats().built'); legs = 0
    along = 0
    while along < 305 and legs < 40:
        for side in (0, 20, -20, 40, -40, 60, -60):   # around a pond or a thicket, like a person would
            tx, ty = x0 + dx * (along + 25) - dy * side, y0 + dy * (along + 25) + dx * side
            r = pg.evaluate('__walk(%f, %f, true, 40)' % (tx, ty)); legs += 1
            a2 = (r['px'] - x0) * dx + (r['py'] - y0) * dy
            if a2 > along + 3: break
        chunks.add((math.floor(r['px'] / 64), math.floor(r['py'] / 64))); pg.wait_for_timeout(60)
        along = (r['px'] - x0) * dx + (r['py'] - y0) * dy
    st = pg.evaluate('ATLAS.state()')
    check(along >= 290, 'walked %.0f m along a straight heading across the vale (%d legs, %.0f m walked in total)' % (along, legs, st['travelled']))
    check(len(chunks) >= 4, 'crossed chunk borders: stood in %d different 64 m chunks, %d chunks built on the way' % (len(chunks), pg.evaluate('ATLAS.stats().built') - built0))
    pg.evaluate('__look(%f, %f, 0.55, 12)' % (dx, dy)); settle(pg); shot(pg, '06_after_300m')
    # 3. meadow and forest
    for kind, nm in (('meadow', '07_meadow'), ('forest', '08_forest')):
        c = find_js(pg, kind); pg.evaluate('ATLAS.land(%d, true)' % c)
        pg.evaluate('__look(0.7, 0.7, 0.42, 13)'); measure(pg, kind); st = pg.evaluate('ATLAS.state()')
        check(st['cls'] == ('creator' if kind == 'meadow' else 'wild'), '%s: parcel %d (%s, %s)' % (kind, st['cell'], st['cls'], st['biome']))
        shot(pg, nm)
    # 4. the sea: stand on the shore, can't walk in
    c = find_js(pg, 'sea'); pg.evaluate('ATLAS.land(%d, true)' % c); settle(pg)
    sea = pg.evaluate('(c => { const p = ATLAS.V.G.planar(c); return [p.face, p.x, p.y]; })(%d)' % c)
    st0 = pg.evaluate('ATLAS.state()')
    r = pg.evaluate('(() => { const s = ATLAS.state(); const q = %s; const W = ATLAS.W, xf = s.anchor === q[0] ? [1, 0, 0, 0] : W.xform(q[0], s.anchor); return __walk(xf[0] * q[1] - xf[1] * q[2] + xf[2], xf[1] * q[1] + xf[0] * q[2] + xf[3], false, 60); })()' % json.dumps(sea))
    check(r['blocked'] and 'water' in r['reason'] and r['tile'] != '~', 'sea: from the shore of parcel %d, walking into the sea is blocked ("%s"), standing on %s' % (c, r['reason'], r['tile']))
    pg.evaluate('(q => { const s = ATLAS.state(); __look(q[1] - s.px, q[2] - s.py, 0.38, 14); })(%s)' % json.dumps(sea)); settle(pg); shot(pg, '09_shore')
    # 5. a corner peak: land at its foot, can't climb
    c = find_js(pg, 'peak'); pg.evaluate('ATLAS.land(%d, true)' % c); settle(pg)
    pk = pg.evaluate('(c => { const p = ATLAS.V.G.planar(c); return [p.face, p.x, p.y]; })(%d)' % c)
    st0 = pg.evaluate('ATLAS.state()')
    d0 = math.hypot(st0['px'] - pk[1], st0['py'] - pk[2])
    r = pg.evaluate('__walk(%f, %f, false, 60)' % (pk[1], pk[2]))
    d1 = math.hypot(r['px'] - pk[1], r['py'] - pk[2])
    check(r['blocked'] and 'steep' in r['reason'].lower() and d1 > 600 and r['tile'] != '^', 'peak: from its foot (%.0f m from the corner) walking up is blocked ("%s"), stopped %.0f m from the corner' % (d0, r['reason'], d1))
    pg.evaluate('__look(%f, %f, 0.32, 16)' % (pk[1] - r['px'], pk[2] - r['py'])); measure(pg, 'peak'); shot(pg, '10_peak')
    # 6. a face seam: walk across, then on until the anchor face changes
    seam = pg.evaluate("""(() => { const W = ATLAS.W, f = W.coreSpawn().face;
      for (let k = 0; k < 3; k++) { const Q = W.faceCorners(f), a = Q[(k + 1) % 3], b = Q[(k + 2) % 3];
        for (let t = 0.2; t < 0.8; t += 0.004) { const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t, ox = Q[k][0] - px, oy = Q[k][1] - py, l = Math.hypot(ox, oy), nx = ox / l, ny = oy / l;
          let ok = true; for (let d = -30; d <= 30 && ok; d += 0.5) if (!W.walkable(f, px + nx * d, py + ny * d)) ok = false;
          if (ok) return { f, k, g: W.neighbourFace(f, k), px, py, nx, ny }; } } return null; })()""")
    check(seam is not None, 'found a walkable crossing of a face seam near the core: %s' % (json.dumps({k: seam[k] for k in ('f', 'g')}) if seam else 'none'))
    if seam:
        f, g, px, py, nx, ny = seam['f'], seam['g'], seam['px'], seam['py'], seam['nx'], seam['ny']
        pg.evaluate('ATLAS.land({face:%d, x:%f, y:%f}, true)' % (f, px + nx * 12, py + ny * 12)); settle(pg)
        pg.evaluate('__look(%f, %f, 0.5, 13)' % (-nx, -ny)); settle(pg); shot(pg, '11_seam_before')
        r = pg.evaluate('__walk(%f, %f, false, 60)' % (px - nx * 25, py - ny * 25))
        check(r['face'] == g and not r['blocked'], 'walked across the face %d / %d seam: now on face %d (anchor still %d, %.0f m from the edge)' % (f, g, r['face'], r['anchor'], r['seamD']))
        pg.evaluate('(a => { const c = ATLAS.C.cam; c.yaw = c.tyaw = Math.atan2(-a[0], a[1]) + 0.9; c.pitch = c.tpitch = 0.45; c.dist = c.tdist = 13; })([%f, %f])' % (nx, ny)); settle(pg); shot(pg, '12_seam_crossed')
        hs = pg.evaluate('(() => { const W = ATLAS.W, o = []; for (let d = -3; d <= 3; d += 0.25) o.push(W.height(%d, %f + %f * d, %f + %f * d)); return o; })()' % (f, px, nx, py, ny))
        step = max(abs(hs[i + 1] - hs[i]) for i in range(len(hs) - 1))
        check(step < 0.1, 'ground continuous across the seam (max step %.3f m per 0.25 m)' % step)
        sw0 = pg.evaluate('ATLAS.stats().swaps')
        for k in range(1, 8):
            r = pg.evaluate('__walk(%f, %f, true, 40)' % (px - nx * (25 + 25 * k), py - ny * (25 + 25 * k))); pg.wait_for_timeout(50)
        for _ in range(60):
            if pg.evaluate('ATLAS.stats().swaps') > sw0: break
            pg.evaluate('ATLAS.C.sim(0.5)'); pg.wait_for_timeout(100)
        st = pg.evaluate('ATLAS.state()')
        check(st['anchor'] == g and st['face'] == g, 'deep in face %d the ground re-anchored to it (anchor %d, %d swap)' % (g, st['anchor'], pg.evaluate('ATLAS.stats().swaps') - sw0))
        settle(pg); shot(pg, '13_seam_reanchored')
    # 7. parcel borders on/off
    pg.evaluate("(() => { const G = ATLAS.V.G, c = G.classes().coreCenter, a = G.planar(c), nb = G.neighbors(c).find(m => G.planar(m).face === a.face), b = G.planar(nb);"
                " ATLAS.land({ face: a.face, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 60 }, true, true); })()"); settle(pg)
    pg.click('.ah [data-a="lines"]'); pg.wait_for_timeout(400)
    nl = pg.evaluate('(() => { let n = 0; ATLAS.R.frame.group.traverse(o => { if (o.isLineSegments && o.visible) n++; }); return n; })()')
    lbl = pg.evaluate("document.querySelector('.ah [data-a=\"lines\"]').innerText")
    check(nl > 0 and 'on' in lbl, 'Parcels: on shows %d chunks of parcel borders (button "%s")' % (nl, lbl))
    pg.evaluate('__look(0.2, -1, 1.05, 30)'); settle(pg); shot(pg, '14_parcel_lines')
    pg.click('.ah [data-a="lines"]'); pg.wait_for_timeout(300)
    nl2 = pg.evaluate('(() => { let n = 0; ATLAS.R.frame.group.traverse(o => { if (o.isLineSegments && o.visible) n++; }); return n; })()')
    check(nl2 == 0, 'Parcels: off hides them')
    # 8. set-piece edges
    pieces = pg.evaluate('ATLAS.W.pieces()')
    for pc in pieces:
        for e in 'NSWE':
            mx, my = pc['x'] + pc['w'] / 2, pc['y'] + pc['h'] / 2
            ex, ey = {'N': (mx, pc['y']), 'S': (mx, pc['y'] + pc['h']), 'W': (pc['x'], my), 'E': (pc['x'] + pc['w'], my)}[e]
            out = {'N': (0, -1), 'S': (0, 1), 'W': (-1, 0), 'E': (1, 0)}[e]
            ox, oy = ex + out[0], ey + out[1]
            if any(q is not pc and q['x'] <= ox < q['x'] + q['w'] and q['y'] <= oy < q['y'] + q['h'] for q in pieces):
                continue
            # stand 7 m outside the edge (planar y = -game y), look back at the piece
            sx, sy = ex + out[0] * 7, -(ey + out[1] * 7)
            pg.evaluate('ATLAS.land({face:%d, x:%f, y:%f}, true, true)' % (pc['face'], sx, sy)); settle(pg)
            pg.evaluate('__look(%f, %f, 0.42, 14)' % (-out[0], out[1])); settle(pg); shot(pg, '20_edge_%s_%s_ground' % (pc['id'], e))
            pg.evaluate('__look(%f, %f, 1.15, 46)' % (-out[0], out[1])); settle(pg); shot(pg, '21_edge_%s_%s_high' % (pc['id'], e))
    # 9. fly up and back
    pg.click('.ah [data-a="fly"]'); pg.wait_for_function("ATLAS.mode() === 'planet'", timeout=20000); pg.wait_for_timeout(1500)
    sel = pg.evaluate('ATLAS.V.stats().selected'); txt = pg.evaluate("document.querySelector('.gv .panel').innerText")
    check(sel >= 0 and 'Walk here' in txt, 'Fly up: back on the planet, the parcel you stood on (%d) is selected' % sel)
    shot(pg, '15_flown_up')
    pg.click('.gv .panel [data-u="walk"]'); pg.wait_for_function("ATLAS.mode() === 'ground'", timeout=20000); pg.wait_for_timeout(2600)
    check(pg.evaluate('ATLAS.state().cell') == sel, 'and Walk here lands on it again')
    check(not errs, 'desktop: no console errors ' + ('' if not errs else str(errs[:3])))
    b.close()


def touch(cdp, kind, pts):
    cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})


def phone(p):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    boot(pg); cdp = ctx.new_cdp_session(pg)
    check(pg.evaluate('ATLAS.R.PHONE'), 'phone: low quality (no shadows, shorter view, pixel ratio 1.75)')
    pg.evaluate('ATLAS.V.lookAt(ATLAS.V.G.classes().coreCenter, 1.2)'); pg.wait_for_timeout(1500)
    pg.touchscreen.tap(195, 380); pg.wait_for_timeout(600)
    check('Walk here' in pg.evaluate("document.querySelector('.gv .panel').innerText"), 'phone: tap a parcel, the panel offers Walk here')
    shot(pg, '30_phone_panel')
    box = pg.evaluate("(() => { const r = document.querySelector('.gv .panel [data-u=\"walk\"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
    pg.touchscreen.tap(box[0], box[1])
    pg.wait_for_function("ATLAS.mode() === 'ground'", timeout=20000); pg.wait_for_timeout(2600)
    check(pg.evaluate("ATLAS.mode()") == 'ground', 'phone: Walk here lands at ground level')
    pg.evaluate("ATLAS.land('core', true)"); settle(pg)
    measure(pg, 'phone_village'); shot(pg, '31_phone_village')
    pg.touchscreen.tap(195, 560); pg.wait_for_timeout(300)
    s1 = pg.evaluate('ATLAS.state()')
    check(s1['moving'] and not s1['running'], 'phone: a tap on the ground walks (goal %s)' % s1['goal'])
    pg.touchscreen.tap(250, 300); pg.wait_for_timeout(120); pg.touchscreen.tap(250, 300); pg.wait_for_timeout(300)
    s2 = pg.evaluate('ATLAS.state()')
    check(s2['running'], 'phone: a double tap runs')
    y0 = pg.evaluate('ATLAS.C.cam.tyaw')
    touch(cdp, 'touchStart', [(120, 420)])
    for k in range(1, 9): touch(cdp, 'touchMove', [(120 + k * 18, 420)]); pg.wait_for_timeout(16)
    touch(cdp, 'touchEnd', []); pg.wait_for_timeout(300)
    check(abs(pg.evaluate('ATLAS.C.cam.tyaw') - y0) > 0.5, 'phone: one-finger drag turns the camera')
    d0 = pg.evaluate('ATLAS.C.cam.tdist')
    touch(cdp, 'touchStart', [(195 - 50, 420), (195 + 50, 420)])
    for k in range(1, 11): touch(cdp, 'touchMove', [(195 - 50 + k * 4, 420), (195 + 50 - k * 4, 420)]); pg.wait_for_timeout(16)
    touch(cdp, 'touchEnd', []); pg.wait_for_timeout(300)
    check(pg.evaluate('ATLAS.C.cam.tdist') > d0 * 1.2, 'phone: pinch zooms (out: %.1f -> %.1f)' % (d0, pg.evaluate('ATLAS.C.cam.tdist')))
    c = find_js(pg, 'forest'); pg.evaluate('ATLAS.land(%d, true)' % c); pg.evaluate('__look(0.7, 0.7, 0.5, 9)')
    measure(pg, 'phone_forest'); shot(pg, '32_phone_forest')
    box = pg.evaluate("(() => { const r = document.querySelector('.ah [data-a=\"fly\"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
    pg.touchscreen.tap(box[0], box[1]); pg.wait_for_function("ATLAS.mode() === 'planet'", timeout=20000); pg.wait_for_timeout(1200)
    check(pg.evaluate("ATLAS.mode()") == 'planet', 'phone: Fly up returns to the planet')
    shot(pg, '33_phone_flown_up')
    check(not errs, 'phone: no console errors ' + ('' if not errs else str(errs[:3])))
    b.close()


with sync_playwright() as p:
    desktop(p)
    phone(p)
print('     perf: ' + json.dumps(perf))
with open(os.path.join(OUT, 'roam_perf.json'), 'w') as f:
    json.dump(perf, f, indent=1)
print('FAILED: %d' % len(fails) if fails else 'all Atlas checks passed')
sys.exit(1 if fails else 0)
