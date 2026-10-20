/* ASHVALE 3D engine part: THE LILY RUN (2026-10-19). A fenced board on the trail into Saltmere (zone 'lilyrun'),
   sized to a pet frog: a cart road, a grass strip, a river of logs and turtles, five lily-pad homes. Pondkeeper Bram
   explains it; a player with a Doginal Frog steps into the booth and sets the frog down. Then the camera follows the frog
   from behind, the HUD becomes the arcade bar (hudlily), taps no longer walk, and the arrows / W A S D / the pad's buttons
   / a gamepad hop. Everyone at the rail sees the same run: the lanes are a function of {level, level start} (lilyrules),
   and the player's frog goes out as {lr}. A finished run goes to the @ashvale Bank, which keeps each name's best.
   install(K) -> { frame(now, dt), camera(cam3, dt), talk(), tap(), playing(), net(id, d), drop(id) } */
(function (G) {
  'use strict';
  const BRAM = 'Pondkeeper Bram';
  const X0 = 348, X1 = 361, Z0 = 104, Z1 = 117, BOOTH = [354, 102];   /* the board inside the fence (tiles), the booth's tile: off the trail, south of it past the grove (the operator: "not totally apparent") */
  function install(K) {
    const THREE = K.THREE, R = K.rules, CH = K.CHAR || 0.8, CELL = (X1 - X0) / R.COLS, S = CELL / 0.385;   /* a metre a hop (the operator: "a lot bigger" than the frog); S: sizes first drawn for a 0.385 m cell */
    const cx = c => X1 - (c + 0.5) * CELL, cz = r => Z0 + (r + 0.5) * CELL;   /* column 0 at the east: facing south, "right" is west */
    const MATS = new Map(), CLIP = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -X0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), X1)];
    if (K.renderer) K.renderer.localClippingEnabled = true;
    const mat = (c, clip) => { const k = c + (clip ? 'c' : ''); let m = MATS.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); if (clip) m.clippingPlanes = CLIP; MATS.set(k, m); } return m; };
    const mesh = (geo, c, clip) => { const m = new THREE.Mesh(geo, typeof c === 'string' ? mat(c, clip) : c); m.castShadow = true; m.receiveShadow = true; return m; };
    let board = null, Y = 0;
    /* ---------- the board (built once you are near) ---------- */
    function build() {
      const g = new THREE.Group(); let lo = Infinity, hi = -Infinity;
      for (let x = X0; x <= X1; x += 0.5) for (let z = Z0; z <= Z1; z += 0.5) { const h = K.heightAt(x, z); if (h < lo) lo = h; if (h > hi) hi = h; }
      Y = hi + 0.1;
      const base = mesh(new THREE.BoxGeometry(X1 - X0 + 0.16, Y - lo + 0.2, Z1 - Z0 + 0.16), '#6b4a2b'); base.position.set((X0 + X1) / 2, (Y + lo - 0.2) / 2 - 0.01, (Z0 + Z1) / 2); g.add(base);   /* a wooden bed, level, down to the ground */
      for (let r = 0; r < R.ROWS; r++) {
        const col = r === 0 || r === 6 ? '#6aa94c' : R.ROAD(r) ? '#55504a' : R.RIVER(r) ? '#3279b8' : '#3f7a33';
        const s = mesh(new THREE.BoxGeometry(X1 - X0, 0.02, CELL), col); s.position.set((X0 + X1) / 2, Y + 0.01 - (R.RIVER(r) ? 0.012 : 0), cz(r));   /* the river a little below the road and grass, still above the bed */ s.receiveShadow = true; g.add(s);
        if (R.ROAD(r) && r < 5) for (let i = 0; i < 9; i++) { const d = mesh(new THREE.BoxGeometry(CELL * 0.35, 0.005, 0.02 * S), '#e8e2c8'); d.position.set(X0 + (X1 - X0) * (i + 0.5) / 9, Y + 0.022, cz(r) + CELL / 2); g.add(d); }   /* lane lines */
      }
      for (const z of [Z0 + 6 * CELL, Z0 + 7 * CELL]) { const k = mesh(new THREE.BoxGeometry(X1 - X0, 0.05 * S, 0.05 * S), '#8a7350'); k.position.set((X0 + X1) / 2, Y + 0.0, z); g.add(k); }   /* the river's banks */
      /* the homes: a hedge with five bays, each a pool with a lily pad */
      const hz = cz(12);
      for (let c = 0; c < R.COLS; c++) {
        if (R.HOMES.indexOf(c) >= 0) { const w = mesh(new THREE.BoxGeometry(CELL, 0.02, CELL), '#3279b8'); w.position.set(cx(c), Y - 0.01, hz); g.add(w);
          const pad = mesh(new THREE.CylinderGeometry(CELL * 0.38, CELL * 0.38, 0.015, 10), '#4fa83a'); pad.position.set(cx(c), Y + 0.012, hz); g.add(pad);
          const fl = mesh(new THREE.IcosahedronGeometry(0.035 * S, 0), '#f3b6d3'); fl.position.set(cx(c) + CELL * 0.2, Y + 0.04 * S, hz - CELL * 0.15); g.add(fl); }
        else { const h = mesh(new THREE.BoxGeometry(CELL, 0.16 * S, CELL), '#2f6b2a'); h.position.set(cx(c), Y + 0.08 * S, hz); g.add(h); }
      }
      mountain(g, lo);
      /* what runs in the lanes: one model per piece, placed every frame */
      const lanes = {};
      for (let r = 1; r < R.ROWS; r++) {
        const L = R.LANES[r]; if (!L) continue;
        lanes[r] = L.at.map(([s, len], i) => { const m = piece(L, len, i, r); g.add(m); return m; });
      }
      K.scene.add(g);
      return { g, lanes, statues: [] };
    }
    /* THE MOUNTAIN (2026-10-19: "a fake mountain around the back 3/4 of the game with a fake tunnel that the cars come out of
       and a fake tunnel that the river flows from"): a model-railway mountain of rock cones round the far side and both sides; the
       front, by the booth, stays open. Each side has a tunnel mouth over the five road lanes and one over the river - the carts and
       logs are cut off at the board's edge, so they come out of one mountain and go into the other. */
    function mountain(g, lo) {
      let sd = 4242; const rnd = () => { sd = (sd * 1103515245 + 12345) >>> 0; return sd / 4294967296; };
      const ROCK = ['#7b7266', '#857b6d', '#6d665c', '#90867a'], TOP = ['#5d8a3f', '#6b9a48'];
      const zr = r => [Z0 + r * CELL, Z0 + (r + 1) * CELL];
      const road = [zr(1)[0], zr(5)[1]], river = [zr(7)[0], zr(11)[1]];
      const inMouth = z => (z > road[0] - 0.3 && z < road[1] + 0.3) || (z > river[0] - 0.3 && z < river[1] + 0.3);
      const cone = (x, z, r, h, c) => { const m = mesh(new THREE.ConeGeometry(r, h, 6 + Math.floor(rnd() * 3)), c); m.position.set(x, lo + h / 2 - 0.2, z); m.rotation.y = rnd() * 6.28; g.add(m); return m; };
      /* the ridge: the sides from the front corner to the back, then along the back */
      const pts = [];
      for (let z = Z0 + 0.4; z <= Z1 + 1.2; z += 0.85) { pts.push([X0 - 1.6, z, -1]); pts.push([X1 + 1.6, z, 1]); }
      for (let x = X0 - 1.2; x <= X1 + 1.2; x += 0.85) pts.push([x, Z1 + 1.7, 0]);
      for (const [x, z, side] of pts) {
        const back = side === 0, far = (z - Z0) / (Z1 - Z0);
        const mouth = !back && inMouth(z);
        const h = (mouth ? 3.4 : 2.2) + rnd() * 1.6 + (back ? 1.2 : far * 1.1);   /* higher toward the back; tall over a tunnel */
        const r = 1.1 + rnd() * 0.6, ox = mouth ? side * (1.1 + rnd() * 0.4) : side * (rnd() - 0.5) * 0.5;
        cone(x + ox, z + (back ? (rnd() - 0.2) * 0.6 : 0), r, h, ROCK[Math.floor(rnd() * ROCK.length)]);
        if (rnd() < 0.55) { const t = cone(x + ox + (rnd() - 0.5) * 0.6, z + (rnd() - 0.5) * 0.6, r * 0.55, h * 0.45, TOP[Math.floor(rnd() * 2)]); t.position.y = lo + h * 0.55; }   /* green on the shoulders */
        if (h > 4.6 && rnd() < 0.6) { const c = mesh(new THREE.ConeGeometry(r * 0.32, h * 0.22, 6), '#eef0f2'); c.position.set(x + ox, lo + h - 0.2 - h * 0.11 + 0.02, z); g.add(c); }   /* a little snow on the tallest */
      }
      /* the tunnel mouths, both sides: dark inside, a stone frame, rock over the top */
      const portal = (side, z0, z1, h, water) => {
        const ex = side < 0 ? X0 : X1, span = z1 - z0, zc = (z0 + z1) / 2, y0 = Y - (water ? 0.03 : 0);
        const dark = mesh(new THREE.BoxGeometry(1.4, h, span), '#14110f'); dark.position.set(ex + side * 0.72, y0 + h / 2, zc); g.add(dark);
        if (water) { const w = mesh(new THREE.BoxGeometry(1.4, 0.02, span), '#1f4f7a'); w.position.set(ex + side * 0.72, Y - 0.005, zc); g.add(w); }
        for (const z of [z0 - 0.17, z1 + 0.17]) { const pl = mesh(new THREE.BoxGeometry(0.5, h + 0.25, 0.34), '#9a9184'); pl.position.set(ex + side * 0.2, y0 + (h + 0.25) / 2, z); g.add(pl); }
        const top = mesh(new THREE.BoxGeometry(0.55, 0.4, span + 0.8), '#a59c8e'); top.position.set(ex + side * 0.2, y0 + h + 0.2, zc); g.add(top);
        const key = mesh(new THREE.BoxGeometry(0.58, 0.5, 0.4), '#b5ac9d'); key.position.set(ex + side * 0.2, y0 + h + 0.25, zc); g.add(key);
        const over = mesh(new THREE.BoxGeometry(1.8, 1.2, span + 0.9), '#7b7266'); over.position.set(ex + side * 1.05, y0 + h + 0.75, zc); g.add(over);   /* the rock over the mouth */
      };
      for (const side of [-1, 1]) { portal(side, road[0], road[1], 1.5, false); portal(side, river[0], river[1], 1.0, true); }
    }
    const CART = [['#b8402f', '#e9d9b0'], ['#2f6fb8', '#e9d9b0'], ['#d8a42a', '#3a2a1a'], ['#6a3fa0', '#e9d9b0'], ['#7a5a32', '#efe6cc']];
    function piece(L, len, i, r) {
      const p = new THREE.Group(), w = len * CELL;
      if (L.k === 'cart' || L.k === 'wagon') {
        const [body, top] = CART[L.look || 0];
        const b = mesh(new THREE.BoxGeometry(w * R.BODY, 0.1 * S, CELL * 0.55), body, true); b.position.y = 0.09 * S; p.add(b);   /* the body is what can hit (lilyrules BODY) */
        if (L.k === 'wagon') { const c = mesh(new THREE.CylinderGeometry(CELL * 0.27, CELL * 0.27, w * 0.7, 8, 1, false, 0, Math.PI), top, true); c.rotation.z = Math.PI / 2; c.rotation.x = Math.PI / 2; c.position.y = 0.14 * S; p.add(c); }
        else { const s = mesh(new THREE.BoxGeometry(w * 0.3, 0.08 * S, CELL * 0.45), top, true); s.position.set(w * 0.12, 0.17 * S, 0); p.add(s); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = mesh(new THREE.CylinderGeometry(0.045 * S, 0.045 * S, 0.03 * S, 8), '#2a211b', true); wh.rotation.x = Math.PI / 2; wh.position.set(sx * w * 0.3, 0.045 * S, sz * CELL * 0.3); p.add(wh); }
        p.rotation.y = L.dir > 0 ? Math.PI : 0;   /* the front toward where it goes */
      } else if (L.k === 'log') {
        const lg = mesh(new THREE.CylinderGeometry(CELL * 0.3, CELL * 0.3, w * 0.96, 9), '#7a5232', true); lg.rotation.z = Math.PI / 2; lg.position.y = 0.0; p.add(lg);
        for (const sx of [-1, 1]) { const e = mesh(new THREE.CylinderGeometry(CELL * 0.26, CELL * 0.26, 0.012, 9), '#c49a62', true); e.rotation.z = Math.PI / 2; e.position.set(sx * w * 0.48, 0, 0); p.add(e); }
      } else {
        for (let k = 0; k < len; k++) { const t = new THREE.Group(); t.position.x = (k - (len - 1) / 2) * CELL;
          const sh = mesh(new THREE.SphereGeometry(CELL * 0.36, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#3f7f3a', true); sh.scale.y = 0.6; t.add(sh);
          const hd = mesh(new THREE.IcosahedronGeometry(CELL * 0.11, 0), '#7fae5a', true); hd.position.set(L.dir < 0 ? CELL * 0.4 : -CELL * 0.4, 0.02, 0); t.add(hd); p.add(t); }
      }
      p.userData = { len, row: r, k: L.k };
      return p;
    }
    function placeLanes(lv, lt0, now) {
      const t = (now - lt0) / 1000;
      for (const r in board.lanes) {
        const ps = R.pieces(+r, t, lv), ms = board.lanes[r];
        for (let i = 0; i < ms.length; i++) { const p = ps[i], m = ms[i]; const on = p.x < R.COLS && p.x + p.len > 0; m.visible = on; if (!on) continue;
          m.position.set(X1 - (p.x + p.len / 2) * CELL, Y + (R.RIVER(+r) ? -0.005 * S - 0.07 * S * p.sunk : 0.02), cz(+r)); }
      }
    }
    /* ---------- frogs ---------- */
    function frogModel(A, seed) { const f = K.PET.buildFrog(THREE, A, seed); f.root.scale.multiplyScalar(CH); f.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); K.scene.add(f.root); return f; }
    function dropModel(f) { if (!f) return; K.scene.remove(f.root); }
    function statues(h, A) {   /* a frog sitting in each home it reached */
      for (const s of board.statues) dropModel(s); board.statues = [];
      for (let k = 0; k < R.HOMES.length; k++) if (h & (1 << k)) { const s = frogModel(A, 77 + k); s.root.position.set(cx(R.HOMES[k]), Y + 0.02, cz(12)); s.root.rotation.y = Math.PI; board.statues.push(s); }
    }
    /* ---------- the local run ---------- */
    let overAt = 0; const hits = [];   /* a finished run gives the booth back after a minute */
    let G1 = null, me = null, pend = null, view = null, lastNet = 0, lastHud = 0, deathT = 0, playing = false, startMs = 0, myFrog = null, prevBest = 0, heading = 0;
    const remotes = new Map();   /* id -> {g, at, f, A, c, r, hop} */
    function remoteActive() { const t = Date.now(); for (const [id, x] of remotes) if (t - x.at < 3500 && x.g && !x.g.over) return id; return null; }
    function send(force) {
      if (!K.netSend || !G1) return; const t = Date.now(); if (!force && t - lastNet < 1000) return; lastNet = t;
      K.netSend({ lr: { c: Math.round(G1.c * 100) / 100, r: G1.r, lv: G1.lv, lt0: G1.lt0, h: G1.h, s: G1.s, l: G1.l, d: G1.dead ? G1.deadKind : '', o: G1.over ? 1 : 0, n: myFrog.d.n, i: myFrog.d.i, t0: G1.t0 } });
    }
    function hop(dir) {
      if (!G1 || G1.over) return;
      const d = { u: [0, 1], d: [0, -1], l: [-1, 0], r: [1, 0] }[dir]; if (!d) return;
      if (R.hop(G1, d[0], d[1])) { heading = dir === 'u' ? 0 : dir === 'd' ? Math.PI : dir === 'l' ? Math.PI / 2 : -Math.PI / 2; send(true); }
    }
    function hudView() { const best = Math.max(prevBest, G1 ? G1.s : 0); return { score: G1 ? G1.s : 0, best, level: G1 ? G1.lv : 1, lives: G1 ? G1.l : 0, timer: G1 ? Math.max(0, G1.timer) / R.TIME : 0 }; }
    function myName() { const n = K.me && K.me.name; return n && /^@/.test(n) ? n : null; }
    function bestOf(name) { const s = K.core.scoresOf ? K.core.scoresOf('lily_run') : null; return s && name ? (s.names[name] | 0) : 0; }
    function begin() {
      G1 = R.newGame(Date.now()); startMs = Date.now(); deathT = 0;
      if (me) dropModel(me.f); me = { f: frogModel(myFrog.A, myFrog.d.n * 7919) };
      statues(0, myFrog.A); send(true);
    }
    /* one frog on the board at a time (the operator): the run that started first keeps it */
    function busySay() { K.hud.dialog(BRAM, ['Someone set their frog down just before you - the board is theirs. Watch from the rail; your turn is next!']); }
    async function start(fr) {
      if (remoteActive()) { pend = null; busySay(); return; }
      myFrog = fr; playing = true; pend = null;
      if (K.PET.away) K.PET.away(true);
      prevBest = bestOf(myName());
      const e = K.myEnt; e.tyaw = 0; if (K.playOnce) K.playOnce(e, 'pickup');   /* bending down to set the frog on the start bank */
      K.cam.save = { yaw: K.cam.yaw, pitch: K.cam.pitch, dist: K.cam.dist }; K.cam.mode = 'lilyrun';
      if (K.FPV) { e.root.visible = false; K.FPV.hid = true; }   /* the avatar stays in the booth for everyone else; the camera sits where it stands */
      begin();
      K.hud.lilyOpen(hudView(), { hop, quit: end, again: () => { if (remoteActive()) { end(); busySay(); return; } begin(); K.hud.lilyUpdate(hudView()); K.hud.lilyFlash('GO!', 'good'); } });
      K.hud.lilyFlash('GO!', 'good');
    }
    function finish() {   /* the run ended (or was left): the Bank keeps the best */
      if (!G1 || G1.posted) return; G1.posted = true;
      const nm = myName(), s = G1.s | 0;
      if (nm && s > 0 && K.bestTell) K.bestTell('lily_run', nm, s, Date.now() - startMs, G1.lv);
      return { score: s, best: Math.max(prevBest, s), newBest: s > prevBest, place: nm ? null : 'Sign in to the arcade to put your name on the board.' };
    }
    function end() {
      if (!playing) return;
      finish();
      playing = false; if (me) dropModel(me.f); me = null; G1 = null;
      if (board) statues(0, null);
      K.hud.lilyClose();
      const s = K.cam.save; K.cam.mode = null; if (s) { K.cam.yaw = K.cam.tyaw = s.yaw; K.cam.pitch = K.cam.tpitch = s.pitch; K.cam.dist = K.cam.tdist = s.dist; }
      if (K.camera) { K.camera.fov = 45; K.camera.updateProjectionMatrix(); }
      if (K.FPV) { K.myEnt.root.visible = true; K.FPV.hid = false; }
      if (K.PET.away) K.PET.away(false);
      if (K.netSend) K.netSend({ lr: null });
    }
    function step(dt) {
      const now = Date.now();
      for (const e of R.step(G1, dt, now)) {
        if (e.e === 'home') { K.hud.lilyFlash('HOME! +' + e.n, 'good'); statues(G1.h, myFrog.A); }
        else if (e.e === 'level') { K.hud.lilyFlash('LEVEL ' + e.lv + '! +1000', 'good'); statues(0, myFrog.A); }
        else if (e.e === 'life') K.hud.lilyFlash('EXTRA FROG!', 'good');
        else if (e.e === 'die' && e.kind === 'squash' && board && me) {   /* tests: how far the drawn frog was from the drawn cart that got it */
          let gap = Infinity; placeLanes(G1.lv, G1.lt0, now); for (const m of board.lanes[e.r] || []) if (m.visible) gap = Math.min(gap, Math.abs(m.position.x - cx(e.c)) - m.userData.len * CELL * R.BODY / 2);
          hits.push(+gap.toFixed(3)); if (hits.length > 20) hits.shift(); K.hud.lilyFlash('SQUASHED!', 'bad'); }
        else if (e.e === 'die') K.hud.lilyFlash({ squash: 'SQUASHED!', splash: 'SPLASH!', swept: 'SWEPT AWAY!', time: 'TOO SLOW!', bank: 'BONK!', taken: 'HOME TAKEN!' }[e.kind] || 'OOPS!', 'bad');
        else if (e.e === 'respawn') heading = 0;
        else if (e.e === 'over') { const o = finish(); K.hud.lilyOver(o); overAt = Date.now(); }
        if (e.e !== 'land' && e.e !== 'score') send(true);
      }
      send(false);
    }
    /* where a frog of a game is drawn this frame: the rules' column, the row (between rows mid-hop), the hop's progress */
    /* the height of what the frog stands on (the operator: "he looks like he is sinking into the log"): the board, or the top of the log or
       the turtle's shell under it - a diving turtle takes it down a little */
    function surfaceY(row, c, lv, lt0) {
      if (!R.RIVER(row)) return Y + 0.02;
      const t = (Date.now() - lt0) / 1000, m = c + 0.5;
      for (const p of R.pieces(row, t, lv)) if (m + 0.2 > p.x && m - 0.2 < p.x + p.len) {
        const base = Y - 0.005 * S - 0.07 * S * p.sunk;
        return R.LANES[row].k === 'log' ? base + CELL * 0.3 : base + CELL * 0.36 * 0.6;
      }
      return Y - 0.01;   /* in the water */
    }
    function drawFrog(f, g, dt, T, head) {
      const H = g.hop, u = H ? H.u : null, rr = H ? H.fr + (H.tr - H.fr) * H.u : g.r;
      const x = cx(g.c), z = cz(rr), lv = g.lv || 1, lt0 = g.lt0 || 0;
      const y = H ? surfaceY(H.fr, g.c, lv, lt0) + (surfaceY(H.tr, g.c, lv, lt0) - surfaceY(H.fr, g.c, lv, lt0)) * u : surfaceY(g.r, g.c, lv, lt0);
      f.root.position.set(x, y + (g.dead && (g.deadKind === 'splash' || g.deadKind === 'swept') ? -0.25 * Math.min(1, 1.3 - g.dead) : 0), z);
      f.root.rotation.y = head;
      const sq = g.dead && g.deadKind === 'squash' ? 0.2 : 1; f.root.scale.set(CH, CH * sq, CH);
      f.root.visible = !(g.dead && g.dead < 0.4);
      f.hopAt(u, false); f.setPose('idle'); f.update(dt, T, 0);
    }
    /* ---------- watching someone else's run ---------- */
    function remoteFrog(id, x) {
      if (x.f) return x.f;
      const A = (K.PET.traitsOf && K.PET.traitsOf(id)) || { Body: 'Pepe', Head: 'None', Eyes: 'None', Mouth: 'None', Clothes: 'None', Accessory: 'None', Background: 'Tan' };
      x.A = A; x.f = frogModel(A, (x.g.n || 1) * 7919); return x.f;
    }
    /* ---------- the keeper ---------- */
    let talking = false;
    async function talk() {
      if (playing || talking) return; talking = true;
      try {
        const fr = await K.PET.frogOf();
        const intro = ['Ho there, traveller! This is the Lily Run.', 'Set your frog down at the booth and get it home: over the cart road, across the river on the logs and the turtles, and into one of the five lily pads at the far end.', 'Fill all five and the carts and the current pick up. The best runs go on the board.'];
        if (!fr) { K.hud.dialog(BRAM, intro.concat(['You will need a frog of your own for this - a Doginal Frog in your wallet. Come back with one and the booth is yours!']), () => { talking = false; }); return; }
        const busy = remoteActive();
        if (busy) { K.hud.dialog(BRAM, ['Someone\'s frog is on the run just now. Watch from the rail - your turn is next!'], () => { talking = false; }); return; }
        const ask = () => K.hud.dialog(BRAM, ['Fancy a run? Doginal Frog #' + fr.d.n + ' looks ready to hop.'], pick => {
          if (pick === 'play') { talking = false; pend = { fr, t: performance.now() }; K.send({ c: 'walk', x: BOOTH[0], y: BOOTH[1] }); }
          else if (pick === 'board') { if (K.scoresAsk) K.scoresAsk(true); K.hud.dialog(BRAM, K.core.scoreRead('lily_run'), () => ask()); }
          else if (pick === 'how') K.hud.dialog(BRAM, ['Hop with the arrow keys or W A S D, the buttons on the screen, or a gamepad.', 'On the road, stay out of the carts\' way. On the river, only the logs and turtles hold you up - and the turtles dive now and then. Don\'t ride off the edge!', 'Each frog has its own time. A full lily pad is no home - pick an empty one. You have three frogs, and one more at 10,000.'], () => ask());
          else talking = false;
        }, [{ id: 'play', label: 'Set my frog down' }, { id: 'board', label: 'Leaderboard' }, { id: 'how', label: 'How to play' }, { id: 'no', label: 'Not now' }]);
        K.hud.dialog(BRAM, intro, () => ask());
      } catch (e) { talking = false; }
    }
    /* ---------- input while playing ---------- */
    const KEYS = { arrowup: 'u', w: 'u', arrowdown: 'd', s: 'd', arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r' };
    if (typeof window !== 'undefined') window.addEventListener('keydown', e => {
      if (!playing) return; const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
      const k = String(e.key || '').toLowerCase();
      if (k === 'escape') { e.preventDefault(); e.stopImmediatePropagation(); end(); return; }
      const d = KEYS[k]; if (!d) return; e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) hop(d);
    }, true);
    let padWas = {};
    function pollPad() {
      const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()).find(Boolean) : null; if (!gp) return;
      const ax = gp.axes || [], b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const now = { u: b(12) || ax[1] < -0.6, d: b(13) || ax[1] > 0.6, l: b(14) || ax[0] < -0.6, r: b(15) || ax[0] > 0.6 };
      for (const k in now) if (now[k] && !padWas[k]) hop(k);
      padWas = now;
    }
    /* ---------- every frame ---------- */
    let T = 0;
    function frame(nowMs, dt) {
      T += dt;
      const P = K.core.S.players[K.PID]; if (!P) return;
      if (!board) { if (Math.abs(P.x - (X0 + X1) / 2) < 60 && Math.abs(P.y - (Z0 + Z1) / 2) < 60 && K.heightAt) board = build(); else return; }
      if (playing && G1 && G1.over && Date.now() - overAt > 60000) end();
      if (pend && remoteActive()) { pend = null; busySay(); }
      if (pend) {   /* walking to the booth */
        if (P.x === BOOTH[0] && P.y === BOOTH[1] && !(P.path && P.path.length)) start(pend.fr);
        else if (performance.now() - pend.t > 20000) pend = null;
      }
      const now = Date.now(), rid = remoteActive();
      if (playing && G1) { pollPad(); step(dt); placeLanes(G1.lv, G1.lt0, now); drawFrog(me.f, G1, dt, T, heading);
        if (performance.now() - lastHud > 100) { lastHud = performance.now(); K.hud.lilyUpdate(hudView()); } }
      else if (rid) { const x = remotes.get(rid); placeLanes(x.g.lv, x.g.lt0, now); }
      else placeLanes(1, 0, now);   /* nobody playing: the lanes run anyway */
      for (const [id, x] of remotes) {
        const live = now - x.at < 3500 && !x.g.over;
        if (!live) { if (x.f) { dropModel(x.f); x.f = null; } if (now - x.at > 10000) remotes.delete(id); continue; }
        const f = remoteFrog(id, x);
        const want = x.g; if (x.c == null) { x.c = want.c; x.r = want.r; }
        if (want.r !== x.r || Math.abs(want.c - x.c) > 0.6) { x.hop = x.hop || { fc: x.c, fr: x.r, tc: want.c, tr: want.r, u: 0 }; }
        let g = { c: x.c, r: x.r, dead: want.d ? 0.8 : 0, deadKind: want.d || '', lv: want.lv, lt0: want.lt0 };
        if (x.hop) { x.hop.u = Math.min(1, x.hop.u + dt / R.HOP); g.hop = x.hop; g.c = x.hop.fc + (x.hop.tc - x.hop.fc) * x.hop.u; g.r = x.hop.fr; if (x.hop.u >= 1) { x.c = x.hop.tc; x.r = x.hop.tr; x.hop = null; } }
        else { x.c += (want.c - x.c) * Math.min(1, dt * 8); g.c = x.c; }
        drawFrog(f, g, dt, T, x.hop ? (x.hop.tr > x.hop.fr ? 0 : x.hop.tr < x.hop.fr ? Math.PI : x.hop.tc > x.hop.fc ? -Math.PI / 2 : Math.PI / 2) : 0);
        if (x.hHave !== want.h) { x.hHave = want.h; if (!playing) statues(want.h, x.A || {}); }
      }
    }
    /* the camera behind the frog, a little above, looking up the board */
    const camPos = new THREE.Vector3(), camAt = new THREE.Vector3(); let camFollow = 0.55;
    function camera(cam3, dt) {
      if (!playing || !me) return false;
      const p = me.f.root.position, onRiver = G1 && (G1.hop ? G1.hop.tr : G1.r) >= 7;   /* the river and the homes: follow all the way to the edge (the operator could not see his frog to hop it home) */
      camFollow += ((onRiver ? 1 : 0.55) - camFollow) * Math.min(1, dt * 3);   /* on a log or a turtle the camera rides with the frog (the operator); on the road, half-way to the board's middle so both edges stay in view */
      const mx = (X0 + X1) / 2 + (p.x - (X0 + X1) / 2) * camFollow;
      const want = new THREE.Vector3(mx, Y + 4.6, p.z - 3.4), look = new THREE.Vector3(mx, Y, p.z + 3.2);   /* above and behind the frog, over the booth, looking up the board */
      if (!camPos.lengthSq()) { camPos.copy(want); camAt.copy(look); }
      const k = Math.min(1, dt * (onRiver ? 10 : 6)); camPos.lerp(want, k); camAt.lerp(look, k);   /* riding: keep up with the current */
      cam3.position.copy(camPos); cam3.lookAt(camAt);
      if (cam3.fov !== 55) { cam3.fov = 55; cam3.updateProjectionMatrix(); }
      return true;
    }
    return {
      frame, camera, talk,
      tap: () => playing,                                /* taps never walk while the frog is on the board */
      playing: () => playing || !!pend,
      net(id, d) { if (!d) { const x = remotes.get(id); if (x) { if (x.f) dropModel(x.f); remotes.delete(id); } return; }
        if (typeof d !== 'object' || !(d.r >= 0 && d.r < R.ROWS) || !(d.c > -2 && d.c < R.COLS + 2) || !(d.lv >= 1 && d.lv < 100)) return;
        const x = remotes.get(id) || {}; x.g = { c: +d.c, r: d.r | 0, lv: d.lv | 0, lt0: +d.lt0 || 0, h: d.h & 31, s: d.s | 0, l: d.l | 0, d: typeof d.d === 'string' ? d.d.slice(0, 8) : '', over: !!d.o, n: d.n | 0, t0: +d.t0 || 0 }; x.at = Date.now(); remotes.set(id, x);
        if (playing && G1 && !G1.over && !x.g.over && x.g.t0 && (x.g.t0 < G1.t0 || (x.g.t0 === G1.t0 && String(id) < String(K.PID)))) { end(); busySay(); } },   /* two set down at once: the earlier keeps the board */
      drop(id) { this.net(id, null); },
      end,
      _state: () => ({ playing, pend: !!pend, g: G1 && { c: G1.c, r: G1.r, s: G1.s, l: G1.l, lv: G1.lv, h: G1.h, over: G1.over, dead: G1.dead }, board: !!board, Y, remotes: Array.from(remotes.keys()), hits: hits.slice() }),   /* tests */
      _hop: hop,
      _put(c, r) { if (G1) { G1.c = c; G1.r = r; G1.best = Math.max(G1.best, r); G1.hop = null; } },   /* tests: set the frog down on a row */
      _onPiece(row) { if (!G1) return null; const t = (Date.now() - G1.lt0) / 1000; const p = R.pieces(row, t, G1.lv).filter(q => q.x > 1 && q.x + q.len < R.COLS - 1 && q.sunk < 0.1).sort((a, b) => b.len - a.len)[0]; return p ? p.x + p.len / 2 - 0.5 + R.laneV(row, G1.lv) * 0.3 : null; },   /* tests: a column on a log or turtles in that row */
      _ndc() { if (!me || !K.camera) return null; const v = me.f.root.position.clone(); v.y += 0.1; v.project(K.camera); return [+v.x.toFixed(3), +v.y.toFixed(3)]; }   /* tests: where the frog is on the screen (-1..1) */
    };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('englily', { api: 1, v: 1, needs: {} }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
