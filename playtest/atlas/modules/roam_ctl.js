/* ASHVALE Atlas: walking and camera at ground level (module roam_ctl, api 1). Same feel as the game (src/engine.js):
   tap / click walks there, a second tap within 300 ms near the same spot runs; drag turns the camera (and tilts it),
   pinch or the wheel zooms, a two-finger twist turns; arrow keys turn and tilt like the game; W A S D walk relative to
   the camera, R toggles running. Walk 1 tile per 0.6 s tick (1.67 m/s), run 2 (3.33 m/s), like the core.
   Paths: breadth-first search over 1 m tiles of the anchor plane (8 directions, no corner cutting), blocking letters from
   worldgen (trees, rocks, water, mountain rock, stones), then string-pulled so you walk straight where you can.
     const C = roam_ctl.create(R, {toast(msg), onMove()})
     C.walkTo(px, py, run)   C.walkDir(turns, metres, run)   C.stop()   C.cam {yaw, pitch, dist, ...}
     C.fly(dist0, dist1, pitch0, pitch1, seconds, done)   camera swoop (landing / flying up)
     C.sim(seconds)          advance walking + streaming without waiting for frames (tests)
     C.state()               {moving, running, blocked, reason, goal, travelled} */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1 };
  const WALK = 1 / 0.6, RUN = 2 / 0.6, PI = Math.PI;
  function create(R, opts) {
    const O = opts || {}, THREE = R.THREE, camera = R.camera, canvas = R.canvas, P = R.player;
    const PHONE = R.PHONE;
    const cam = { yaw: PI * 0.12, pitch: 0.92, dist: PHONE ? 9 : 11, tyaw: PI * 0.12, tpitch: 0.92, tdist: PHONE ? 9 : 11, keys: {}, fly: null, snap: true };
    const st = { moving: false, running: false, blocked: false, reason: '', goal: null, travelled: 0, path: [], pi: 0, runMode: false };
    const camT = new THREE.Vector3(), tg = new THREE.Vector3();
    const toast = O.toast || (() => {});

    /* ---- pathfinding ---- */
    const NMAX = 128, grid = new Int8Array(NMAX * NMAX), prev = new Int32Array(NMAX * NMAX), queue = new Int32Array(NMAX * NMAX);
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    function plan(tx, ty) {
      const sx = Math.floor(P.x), sy = Math.floor(P.y), gx = Math.floor(tx), gy = Math.floor(ty);
      const half = Math.min(NMAX / 2 - 2, Math.max(Math.abs(gx - sx), Math.abs(gy - sy)) + 12);
      const N = Math.min(NMAX, half * 2 + 1), ox = Math.floor((sx + gx) / 2) - (N >> 1), oy = Math.floor((sy + gy) / 2) - (N >> 1);
      grid.fill(-1, 0, N * N); prev.fill(-1, 0, N * N);
      const free = (ix, iy) => { if (ix < 0 || iy < 0 || ix >= N || iy >= N) return false; const k = iy * N + ix; if (grid[k] < 0) grid[k] = R.walkable(ox + ix + 0.5, oy + iy + 0.5) ? 1 : 0; return grid[k] === 1; };
      const s = (sy - oy) * N + (sx - ox);
      let qh = 0, qt = 0, best = s, bd = 1e9;
      queue[qt++] = s; prev[s] = s;
      const tix = gx - ox, tiy = gy - oy;
      while (qh < qt) {
        const k = queue[qh++], ix = k % N, iy = (k / N) | 0;
        const d = (ix - tix) * (ix - tix) + (iy - tiy) * (iy - tiy);
        if (d < bd) { bd = d; best = k; if (d === 0) break; }
        for (const [dx, dy] of DIRS) {
          const nx = ix + dx, ny = iy + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx; if (prev[nk] >= 0 || !free(nx, ny)) continue;
          if (dx && dy && (!free(ix + dx, iy) || !free(ix, iy + dy))) continue;
          prev[nk] = k; queue[qt++] = nk;
        }
      }
      const cells = [];
      for (let k = best; k !== s; k = prev[k]) cells.push(k);
      cells.reverse();
      const pts = cells.map(k => [ox + (k % N) + 0.5, oy + ((k / N) | 0) + 0.5]);
      if (bd === 0 && pts.length) { pts[pts.length - 1] = [tx, ty]; }
      return { pts, reached: bd === 0 };
    }
    function clearLine(ax, ay, bx, by) {
      const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.35);
      for (let k = 1; k <= n; k++) { const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t; if (!R.walkable(x, y) || !R.walkable(x + 0.3, y) || !R.walkable(x - 0.3, y) || !R.walkable(x, y + 0.3) || !R.walkable(x, y - 0.3)) return false; }
      return true;
    }
    function pull(pts) {
      const out = []; let cx = P.x, cy = P.y, i = 0;
      /* not standing on a clear line to the first cell: step to the centre of your own tile first */
      if (pts.length && !clearLine(cx, cy, pts[0][0], pts[0][1])) { cx = Math.floor(P.x) + 0.5; cy = Math.floor(P.y) + 0.5; out.push([cx, cy]); }
      while (i < pts.length) {
        let j = pts.length - 1;
        while (j > i && !clearLine(cx, cy, pts[j][0], pts[j][1])) j--;
        out.push(pts[j]); cx = pts[j][0]; cy = pts[j][1]; i = j + 1;
      }
      return out;
    }
    function why(px, py) {
      const L = R.tileAt(px, py);
      return L === '~' ? 'Deep water: you cannot swim there.' : L === '^' ? 'Too steep: the peaks cannot be climbed.' : L === 'K' ? 'A standing stone is in the way.' : 'Something is in the way.';
    }
    function walkTo(tx, ty, run) {
      st.runMode = !!run;
      const blockedGoal = !R.walkable(tx, ty), r = plan(tx, ty);
      st.goal = [tx, ty]; st.path = r.pts.length ? pull(r.pts) : []; st.pi = 0;
      st.blocked = !r.reached; st.reason = st.blocked ? (blockedGoal ? why(tx, ty) : 'You cannot get there from here.') : '';
      st.moving = st.path.length > 0; st.running = st.moving && st.runMode;
      if (st.blocked) toast(st.reason);
      return { reached: r.reached, steps: st.path.length, reason: st.reason };
    }
    function walkDir(turns, metres, run) {
      const a = turns * 2 * PI; return walkTo(P.x + Math.cos(a) * metres, P.y + Math.sin(a) * metres, run);
    }
    function stop() { st.path = []; st.moving = false; st.running = false; }

    /* ---- per frame ---- */
    const keysDir = [0, 0];
    function update(dt) {
      /* keys: W A S D walk relative to the camera */
      const k = cam.keys;
      keysDir[0] = (k.d || k.D ? 1 : 0) - (k.a || k.A ? 1 : 0); keysDir[1] = (k.w || k.W ? 1 : 0) - (k.s || k.S ? 1 : 0);
      if (keysDir[0] || keysDir[1]) {
        st.path = [];
        const fx = -Math.sin(cam.yaw), fy = Math.cos(cam.yaw), rx = Math.cos(cam.yaw), ry = Math.sin(cam.yaw);
        let dx = fx * keysDir[1] + rx * keysDir[0], dy = fy * keysDir[1] + ry * keysDir[0]; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
        const sp = (st.runMode ? RUN : WALK) * dt, nx = P.x + dx * sp, ny = P.y + dy * sp;
        if (R.walkable(nx, ny)) { P.x = nx; P.y = ny; } else if (R.walkable(nx, P.y)) P.x = nx; else if (R.walkable(P.x, ny)) P.y = ny;
        st.travelled += sp; st.moving = true; st.running = st.runMode; P.yaw = turnTo(P.yaw, Math.atan2(dx, -dy), dt);
      } else if (st.path.length && st.pi < st.path.length) {
        let left = (st.running ? RUN : WALK) * dt;
        while (left > 0 && st.pi < st.path.length) {
          const w = st.path[st.pi], dx = w[0] - P.x, dy = w[1] - P.y, d = Math.hypot(dx, dy);
          if (d < 1e-6) { st.pi++; continue; }
          const m = Math.min(d, left), nx = P.x + dx / d * m, ny = P.y + dy / d * m;
          if (!R.walkable(nx, ny)) {
            /* clipping a blocked corner: slide along one axis, else give up this path */
            if (R.walkable(nx, P.y)) P.x = nx; else if (R.walkable(P.x, ny)) P.y = ny; else { st.path = []; break; }
            left -= m; st.travelled += m; continue;
          }
          P.x = nx; P.y = ny; left -= m; st.travelled += m;
          P.yaw = turnTo(P.yaw, Math.atan2(dx, -dy), dt);
          if (m >= d) st.pi++;
        }
        st.moving = st.pi < st.path.length;
        if (!st.moving) st.running = false;
      } else { st.moving = false; st.running = false; }
      if (P.H) { const want = st.moving ? (st.running ? 'run' : 'walk') : 'idle'; if (want !== P.anim) { P.anim = want; P.H.play(want, { loop: true }); } }
      updateCamera(dt);
      if (O.onMove) O.onMove(dt);
    }
    function turnTo(a, b, dt) { let d = b - a; d = ((d + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; return a + d * Math.min(1, dt * 12); }
    function updateCamera(dt) {
      const k = cam.keys;
      if (k.ArrowLeft) cam.tyaw -= 2.2 * dt; if (k.ArrowRight) cam.tyaw += 2.2 * dt; if (k.ArrowUp) cam.tpitch += 1.2 * dt; if (k.ArrowDown) cam.tpitch -= 1.2 * dt;
      if (cam.fly) {
        const f = cam.fly; f.t += dt; const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
        cam.dist = cam.tdist = f.d0 + (f.d1 - f.d0) * e; cam.pitch = cam.tpitch = f.p0 + (f.p1 - f.p0) * e;
        if (u >= 1) { cam.fly = null; if (f.done) f.done(); }
      } else {
        cam.tpitch = Math.max(0.3, Math.min(1.42, cam.tpitch)); cam.tdist = Math.max(4.5, Math.min(30, cam.tdist));
      }
      const s = cam.snap ? 1 : Math.min(1, dt * 10);
      cam.yaw += (cam.tyaw - cam.yaw) * s; cam.pitch += (cam.tpitch - cam.pitch) * s; cam.dist += (cam.tdist - cam.dist) * s;
      tg.copy(P.obj.position); tg.y += 1.0;
      if (cam.snap) camT.copy(tg); else camT.lerp(tg, Math.min(1, dt * 12));
      cam.snap = false;
      camera.position.set(camT.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, camT.y + Math.sin(cam.pitch) * cam.dist, camT.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
      const F = R.frame, gy = R.heightAt(camera.position.x + F.ox, -camera.position.z + F.oy) + 0.6;
      if (camera.position.y < gy) camera.position.y = gy;
      camera.lookAt(camT);
    }
    function fly(d0, d1, p0, p1, sec, done) { cam.fly = { t: 0, dur: sec, d0, d1, p0, p1, done }; }
    R.onUpdate(update);
    R.onReanchor = (xf, th) => {
      const c = xf[0], s = xf[1], tx = xf[2], ty = xf[3], m = p => [c * p[0] - s * p[1] + tx, s * p[0] + c * p[1] + ty];
      st.path = st.path.map(m); if (st.goal) st.goal = m(st.goal);
      cam.yaw += th; cam.tyaw += th; cam.snap = true;
    };

    /* ---- input (the game's pointer rules) ---- */
    const ptrs = new Map(); let pinch = null, suppressTap = false, lastTap = null;
    function tapAt(cx, cy) {
      const now = performance.now();
      if (lastTap && now - lastTap.t < 300 && Math.hypot(cx - lastTap.x, cy - lastTap.y) < 40 && lastTap.goal) { walkTo(lastTap.goal[0], lastTap.goal[1], true); lastTap = null; return; }
      const g = R.pickGround(cx, cy); if (!g) return;
      walkTo(g.x, g.y, st.runMode);
      if (O.marker) O.marker(cx, cy);
      lastTap = { t: now, x: cx, y: cy, goal: [g.x, g.y] };
    }
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); const g = R.pickGround(e.clientX, e.clientY); if (g && O.examine) O.examine(g); });
    canvas.addEventListener('pointerdown', e => {
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, b: e.button, type: e.pointerType });
      if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2, dist: cam.tdist, yaw: cam.tyaw, pitch: cam.tpitch }; suppressTap = true; }
      else if (ptrs.size === 1) suppressTap = false;
    });
    canvas.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size >= 2 && pinch) {
        const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
        cam.tdist = pinch.dist * pinch.d / Math.max(20, d); let da = ang - pinch.ang; if (da > PI) da -= 2 * PI; if (da < -PI) da += 2 * PI;
        cam.tyaw = pinch.yaw - da; cam.tpitch = pinch.pitch + (my - pinch.my) * 0.005; return;
      }
      if (p.b === 1 || p.moved > (p.type === 'mouse' ? 5 : 9)) { cam.tyaw -= dx * 0.0085; cam.tpitch += dy * 0.006; }
    });
    const endPtr = e => {
      const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (!p || e.type === 'pointercancel') return;
      if (!suppressTap && p.moved < (p.type === 'mouse' ? 6 : 12) && p.b === 0 && ptrs.size === 0) tapAt(e.clientX, e.clientY);
      if (ptrs.size === 0) suppressTap = false;
    };
    canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.tdist *= e.deltaY > 0 ? 1.12 : 1 / 1.12; }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!R.isActive() || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      if (/^Arrow/.test(e.key) || /^[wasdWASD]$/.test(e.key)) { cam.keys[e.key] = true; e.preventDefault(); }
      if (e.key === 'r' || e.key === 'R') { st.runMode = !st.runMode; st.running = st.moving && st.runMode; toast(st.runMode ? 'Running' : 'Walking'); }
    });
    window.addEventListener('keyup', e => { cam.keys[e.key] = false; });
    window.addEventListener('blur', () => { cam.keys = {}; });

    function sim(sec) { const dt = 1 / 30; for (let t = 0; t < sec; t += dt) R.tick(dt, 3); }
    return {
      api: 1, cam, walkTo, walkDir, stop, fly, sim, update,
      setRun(on) { st.runMode = !!on; st.running = st.moving && st.runMode; }, snap() { cam.snap = true; },
      state: () => ({ moving: st.moving, running: st.running, runMode: st.runMode, blocked: st.blocked, reason: st.reason, goal: st.goal, travelled: st.travelled, waypoints: st.path.length - st.pi })
    };
  }
  const api = { api: 1, create };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('roam_ctl', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
