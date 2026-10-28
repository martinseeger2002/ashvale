/* ASHVALE: the wheel (2026-10-20: the clubhouse's third floor; the 2026-10-18 single-zero simulation's table, wheel and ball).
   Its own module so it can be updated alone. The scene builds it (case 'gametable'); engtables.js seats players, takes their taps
   and plays the Bank's spins: the pocket is decided first, the ball is shown arriving at it.
   Frame: the footprint's middle at the origin, floor y 0, the wheel at the -x end, the players' rail +z, the dealer -z.
   build(THREE, kit) -> T: {group, body, hot: [felt], felt, areaAt(x, z) -> bet key | null, show(view), spin(n, done), update(dt, t), eyeY}
   view = {felt: {s: {key: amount}}, spots: {s: localX}} */
(function (G) {
  'use strict';
  /* 2026-10-21: "The players at the roulette table should be placed around the betting area ... You might have to make the roulette
     table a little bit bigger": the layout and the table a quarter bigger (L), on four tiles; the players along the layout and at its end */
  const L = 1.25, S = 0.8, FY = 0.78 * S, FX = 1.14 * L, FZ = 0.48 * L;
  const CW = 0.11 * L, CH = 0.13 * L, DH = 0.11 * L, GX0 = -0.32 * L, GX1 = GX0 + 12 * CW, ZB0 = GX0 - CW, COLX1 = GX1 + CW, ZN = 0.06 * L, ZTOP = ZN - 3 * CH;
  const WX = -0.80 * L, WZ = -0.03 * L, SEG = Math.PI * 2 / 37;
  const RT = 0.282, RP = 0.146, TRACK_Y = 0.055, POCKET_Y = 0.036, BALL_R = 0.0075, T1 = 4.2, T2 = 6.4, T_SETTLE = 7.6;
  const OUT = ['low', 'even', 'red', 'black', 'odd', 'high'];
  const cellN = (c, r) => 3 * c + r + 1, cellX = c => GX0 + (c + 0.5) * CW, rowZ = r => ZN - (r + 0.5) * CH;
  const key = (t, nums) => t + ':' + nums.slice().sort((a, b) => a - b).join('-');
  const wrap = a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  function rules() { return (G.ASH3D && G.ASH3D.get && G.ASH3D.get('wheelrules')) || (typeof require === 'function' ? require('./wheelrules.js') : null); }
  /* a tap at felt point (x, z) -> the bet it means (e: how near a line, in cells, counts as on it) - the simulation's mapping */
  function keyAt(x, z) {
    const e = 0.2, u = (x - GX0) / CW, v = (ZN - z) / CH;
    if (v < -e) {
      if (x < GX0 || x > GX1) return null; const c = Math.min(11, Math.floor(u));
      if (z < ZN + DH) return 'doz:' + (Math.floor(c / 4) + 1);
      if (z <= ZN + 2 * DH) return OUT[Math.floor(c / 2)] + ':';
      return null;
    }
    if (v > 3 || z < ZTOP) return null;
    if (u < -e) return x >= ZB0 ? 's:0' : null;
    if (u > 12) return x <= COLX1 ? 'col:' + (Math.max(0, Math.min(2, Math.floor(v))) + 1) : null;
    if (v < e) {
      if (u < e) return key('ff', [0, 1, 2, 3]);
      const k = Math.round(u);
      if (Math.abs(u - k) < e && k >= 1 && k <= 11) return key('sl', [0, 1, 2].flatMap(r => [cellN(k - 1, r), cellN(k, r)]));
      const c = Math.min(11, Math.floor(u)); return key('st', [0, 1, 2].map(r => cellN(c, r)));
    }
    const r = Math.min(2, Math.floor(v)), fr = v - r, c = Math.max(0, Math.min(11, Math.floor(u))), fu = u - c;
    let hb = 0; if (fr < e && r > 0) hb = r; else if (fr > 1 - e && r < 2) hb = r + 1;
    if (u < e) return hb ? key('tr', hb === 1 ? [0, 1, 2] : [0, 2, 3]) : key('sp', [0, cellN(0, r)]);
    let vb = 0; if (fu < e && c > 0) vb = c; else if (fu > 1 - e && c < 11) vb = c + 1;
    if (hb && vb) return key('co', [cellN(vb - 1, hb - 1), cellN(vb, hb - 1), cellN(vb - 1, hb), cellN(vb, hb)]);
    if (vb) return key('sp', [cellN(vb - 1, r), cellN(vb, r)]);
    if (hb) return key('sp', [cellN(c, hb - 1), cellN(c, hb)]);
    return 's:' + cellN(c, r);
  }
  function betPos(k) {   /* where a bet's coins sit */
    const R = rules(), t = k.slice(0, k.indexOf(':')), ns = R.numsOf(k), pos = n => [cellX((n - 1) / 3 | 0), rowZ((n - 1) % 3)];
    if (t === 'col') return [(GX1 + COLX1) / 2, rowZ((+k.split(':')[1] + 2) % 3)];
    if (t === 'doz') { const d = +k.split(':')[1]; return [GX0 + (d - 0.5) * 4 * CW, ZN + DH / 2]; }
    if (OUT.indexOf(t) >= 0) return [GX0 + (OUT.indexOf(t) + 0.5) * 2 * CW, ZN + DH * 1.5];
    if (t === 's' && ns[0] === 0) return [(ZB0 + GX0) / 2, (ZTOP + ZN) / 2];
    if (t === 'ff') return [GX0, ZN];
    if (t === 'tr') return [GX0, ns.indexOf(1) >= 0 ? ZN - CH : ZN - 2 * CH];
    if (t === 'sp' && ns[0] === 0) return [GX0, pos(ns[1])[1]];
    if (t === 'st' || t === 'sl') { const xs = ns.map(n => pos(n)[0]); return [(Math.min(...xs) + Math.max(...xs)) / 2, ZN]; }
    const ps = ns.map(pos); return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
  }
function railRect(ax, az) {   /* [Claude 2026-10-21] the rail's outside edge nearest a point (table metres): [x, z, outward nx, nz] - where someone standing there leans on it */
    return (x, z) => { let qx = Math.max(-ax, Math.min(ax, x)), qz = Math.max(-az, Math.min(az, z)), nx = x - qx, nz = z - qz;
      if (!nx && !nz) { const dx = ax - Math.abs(x), dz = az - Math.abs(z); if (dx < dz) { qx = Math.sign(x || 1) * ax; nx = Math.sign(x || 1); } else { qz = Math.sign(z || 1) * az; nz = Math.sign(z || 1); } }
      const l = Math.hypot(nx, nz) || 1; return [qx, qz, nx / l, nz / l]; };
  }
  function build(THREE, kit) {
    const R = rules(), REDS = new Set(R.REDS), WHEEL = R.WHEEL;
    const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const group = new THREE.Group(), table = new THREE.Group(); group.add(table);
    /* ---- the felt, painted */
    const K = 900, cv = document.createElement('canvas'); cv.width = Math.round(FX * 2 * K); cv.height = Math.round(FZ * 2 * K); const g = cv.getContext('2d');
    const X = x => (x + FX) * K, Z = z => (z + FZ) * K;
    g.fillStyle = '#1f5a3a'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#163f29'; g.beginPath(); g.arc(X(WX), Z(WZ), 0.345 * K, 0, 7); g.fill();
    const LINE = '#efe2c4'; g.strokeStyle = LINE; g.lineWidth = 4; g.textAlign = 'center'; g.textBaseline = 'middle';
    const box = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * K, (z1 - z0) * K);
    for (let cc = 0; cc < 12; cc++) for (let r = 0; r < 3; r++) {
      const n = cellN(cc, r), x0 = GX0 + cc * CW, z0 = ZN - (r + 1) * CH;
      g.fillStyle = REDS.has(n) ? '#a3222a' : '#17140f'; g.beginPath(); g.ellipse(X(x0 + CW / 2), Z(z0 + CH / 2), 0.042 * L * K, 0.05 * L * K, 0, 0, 7); g.fill();
      g.fillStyle = LINE; g.font = 'bold ' + (0.058 * L * K) + 'px Georgia, serif'; g.fillText(String(n), X(x0 + CW / 2), Z(z0 + CH / 2) + 3); box(x0, z0, x0 + CW, z0 + CH);
    }
    g.beginPath(); g.moveTo(X(GX0), Z(ZTOP)); g.lineTo(X(ZB0 + 0.03), Z(ZTOP)); g.lineTo(X(ZB0), Z((ZTOP + ZN) / 2)); g.lineTo(X(ZB0 + 0.03), Z(ZN)); g.lineTo(X(GX0), Z(ZN)); g.closePath();
    g.fillStyle = '#1d7a40'; g.fill(); g.stroke(); g.fillStyle = LINE; g.font = 'bold ' + (0.07 * L * K) + 'px Georgia, serif'; g.fillText('0', X((ZB0 + GX0) / 2 + 0.006), Z((ZTOP + ZN) / 2) + 3);
    g.font = 'bold ' + (0.03 * L * K) + 'px Georgia, serif';
    for (let r = 0; r < 3; r++) { const z0 = ZN - (r + 1) * CH; box(GX1, z0, COLX1, z0 + CH); g.fillStyle = LINE; g.fillText('2 to 1', X(GX1 + CW / 2), Z(z0 + CH / 2) + 2); }
    g.font = 'bold ' + (0.042 * L * K) + 'px Georgia, serif';
    for (let d = 0; d < 3; d++) { const x0 = GX0 + d * 4 * CW; box(x0, ZN, x0 + 4 * CW, ZN + DH); g.fillStyle = LINE; g.fillText(['1st 12', '2nd 12', '3rd 12'][d], X(x0 + 2 * CW), Z(ZN + DH / 2) + 3); }
    for (let i = 0; i < 6; i++) {
      const x0 = GX0 + i * 2 * CW, cx = X(x0 + CW), cz = Z(ZN + DH * 1.5); box(x0, ZN + DH, x0 + 2 * CW, ZN + 2 * DH);
      if (OUT[i] === 'red' || OUT[i] === 'black') { g.fillStyle = OUT[i] === 'red' ? '#a3222a' : '#17140f'; g.beginPath(); g.moveTo(cx - 0.07 * L * K, cz); g.lineTo(cx, cz - 0.035 * L * K); g.lineTo(cx + 0.07 * L * K, cz); g.lineTo(cx, cz + 0.035 * L * K); g.closePath(); g.fill(); }
      else { g.fillStyle = LINE; g.fillText({ low: '1-18', even: 'EVEN', odd: 'ODD', high: '19-36' }[OUT[i]], cx, cz + 3); }
    }
    g.fillStyle = 'rgba(239,226,196,.75)'; g.font = 'bold ' + (0.034 * L * K) + 'px Georgia, serif'; g.fillText('THE SALTMERE LINKS  ·  SINGLE ZERO', X(0.34 * L), Z(ZN + 2 * DH + 0.07 * L));
    g.font = 'bold ' + (0.026 * L * K) + 'px Georgia, serif'; g.fillText('Each bet 1 to 500 GOLD', X(0.34 * L), Z(ZN + 2 * DH + 0.115 * L));
    const tex = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2, FZ * 2), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 })   /* lit from the lantern above, day or night */); felt.rotation.x = -Math.PI / 2; felt.position.y = FY + 0.0005; table.add(felt);
    felt.userData.tb = { act: 'felt' };
    /* ---- the table */
    const woodM = lam('#5a3620'), padM = lam('#2a1712');
    const apron = new THREE.Mesh(new THREE.BoxGeometry(FX * 2 + 0.16, 0.1, FZ * 2 + 0.16), woodM); apron.position.y = FY - 0.05; table.add(apron);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, FY - 0.1, 0.09), woodM); leg.position.set(sx * (FX - 0.08), (FY - 0.1) / 2, sz * (FZ - 0.06)); table.add(leg); }
    const rail = (len, x, z, ry) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, len, 12), padM); m.rotation.z = Math.PI / 2; const q = new THREE.Group(); q.add(m); q.position.set(x, FY + 0.02, z); q.rotation.y = ry; table.add(q); };
    rail(FX * 2 + 0.16, 0, FZ + 0.045, 0); rail(FZ * 2 + 0.1, FX + 0.045, 0, Math.PI / 2); rail(FZ * 2 + 0.1, -FX - 0.045, 0, Math.PI / 2);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(FX * 2 + 0.16, 0.03, 0.07), woodM); edge.position.set(0, FY + 0.012, -FZ - 0.045); table.add(edge);
    const body = new THREE.Mesh(new THREE.BoxGeometry(FX * 2 + 0.2, FY + 0.1, FZ * 2 + 0.2), new THREE.MeshBasicMaterial({ visible: false })); body.position.y = (FY + 0.1) / 2; group.add(body);
    /* ---- the wheel: the bowl, the ball track, brass deflectors, the turning wheelhead with its 37 pockets in the real order */
    const wheel = new THREE.Group(); wheel.position.set(WX, FY, WZ); table.add(wheel);
    { const prof = [[0.198, 0.026], [0.225, 0.036], [0.262, 0.05], [0.29, 0.052], [0.3, 0.066], [0.33, 0.07], [0.336, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
      const bowlM = new THREE.MeshLambertMaterial({ color: '#6b3f1f', side: THREE.DoubleSide });   /* the bowl's profile as rings of open cones (no LatheGeometry in the game's three.js) */
      for (let i = 0; i + 1 < prof.length; i++) { const a0 = prof[i], a1 = prof[i + 1], h = Math.abs(a1.y - a0.y) || 0.002;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(a1.y >= a0.y ? a1.x : a0.x, a1.y >= a0.y ? a0.x : a1.x, h, 48, 1, true), bowlM); m.position.y = Math.min(a0.y, a1.y) + h / 2; wheel.add(m); }
      const track = new THREE.Mesh(new THREE.RingGeometry(0.262, 0.297, 48), new THREE.MeshLambertMaterial({ color: '#c9a06a', side: THREE.DoubleSide })); track.rotation.x = -Math.PI / 2; track.position.y = 0.0515; wheel.add(track);
      const brass = new THREE.MeshLambertMaterial({ color: 0xd4a84a });
      for (let i = 0; i < 8; i++) { const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.009), brass); const a = i * Math.PI / 4 + 0.2; d.scale.set(1, 0.5, 2.2); d.position.set(Math.cos(a) * 0.236, 0.044, -Math.sin(a) * 0.236); d.rotation.y = a; wheel.add(d); } }
    const rotor = new THREE.Group(); wheel.add(rotor);
    { const P = 768, c = document.createElement('canvas'); c.width = c.height = P; const q = c.getContext('2d'), C = P / 2, k = C / 0.2;
      q.fillStyle = '#7a4a25'; q.fillRect(0, 0, P, P);
      WHEEL.forEach((n, i) => {
        const a0 = i * SEG - SEG / 2, a1 = a0 + SEG, fill = n === 0 ? '#1d7a40' : REDS.has(n) ? '#a3222a' : '#17140f';
        for (const [ri, ro, f] of [[0.165, 0.2, fill], [0.122, 0.165, n === 0 ? '#166132' : REDS.has(n) ? '#861a21' : '#100e0a']]) { q.beginPath(); q.arc(C, C, ro * k, -a1, -a0); q.arc(C, C, ri * k, -a0, -a1, true); q.closePath(); q.fillStyle = f; q.fill(); }
        const tx = C + 0.183 * k * Math.cos(i * SEG), ty = C - 0.183 * k * Math.sin(i * SEG); q.save(); q.translate(tx, ty); q.rotate(-i * SEG + Math.PI / 2); q.fillStyle = '#f4ead2'; q.font = 'bold 26px Georgia, serif'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(String(n), 0, 2); q.restore();
      });
      q.strokeStyle = '#d9b25a'; q.lineWidth = 5; for (const r of [0.122, 0.165, 0.199]) { q.beginPath(); q.arc(C, C, r * k, 0, 7); q.stroke(); }
      const t = new THREE.CanvasTexture(c); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 64), new THREE.MeshLambertMaterial({ map: t })); face.rotation.x = -Math.PI / 2; face.position.y = 0.03; rotor.add(face);
      const silver = new THREE.MeshLambertMaterial({ color: 0xd8d4c8 });
      for (let i = 0; i < 37; i++) { const a = i * SEG + SEG / 2, f = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.01, 0.0025), silver); f.position.set(Math.cos(a) * 0.1435, 0.035, -Math.sin(a) * 0.1435); f.rotation.y = a; rotor.add(f); }
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.118, 0.034, 32), lam('#8a5a2e')); cone.position.y = 0.047; rotor.add(cone);
      const spinner = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.05, 10), silver); spinner.position.y = 0.075; rotor.add(spinner); }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 14, 10), new THREE.MeshLambertMaterial({ color: 0xf8f6f0 })); table.add(ball);

    { /* a lantern over the felt (the operator: the tables read at night too): its glass glows, no light of its own (cheap on phones) */
      const lan = new THREE.Group(); lan.name = 'lantern'; lan.position.set(0, 2.1, 0); table.add(lan);   /* (the scene hangs the room's light in it) */
      lan.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd28a })));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.09, 4), new THREE.MeshLambertMaterial({ color: 0x2a2016 })); cap.position.y = 0.14; cap.rotation.y = Math.PI / 4; lan.add(cap);
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x2a2016 })); ch.position.y = 0.43; lan.add(ch); }
    if (kit.wrap) kit.wrap(table);
    let rotA = 0, rotW = 0.35, run = null;
    const placeBall = (phi, r, y) => { const a = phi + rotA; ball.position.set(WX + Math.cos(a) * r, FY + y, WZ - Math.sin(a) * r); };
    let last = 0; { const a = WHEEL.indexOf(0) * SEG; placeBall(a - rotA, RP, POCKET_Y + BALL_R); }
    /* 2026-10-21: "the ball starts spinning backwards before it hits the part of the wheel that is spinning backwards. Can you fix the
       physics on that?" - on the track the ball keeps its own way round (the world's frame: it only slows, never turns back); from T1, as it
       drops to the turning wheelhead, its speed against the wheelhead dies away until it sits in its pocket and goes round with it. The launch
       speed is chosen at the spin so the run ends in the Bank's pocket (the wheelhead turns at a steady W_RUN through a spin). */
    const W_RUN = 2.4, V_DROP = -3.0, V_LAUNCH = -14;
    function ballAt(t) {
      const R0 = run, dT = T2 - T1;
      let phi;
      if (t <= T1) { const th = R0.th0 + R0.v0 * t + (V_DROP - R0.v0) * t * t / (2 * T1); phi = th - rotA; }   /* world angle, slowing evenly */
      else { const u = Math.min(1, (t - T1) / dT); phi = R0.ph1 + R0.r1 * dT * (1 - Math.pow(1 - u, 3)) / 3; }   /* against the wheelhead, dying away */
      let r = RT, y = TRACK_Y + BALL_R;
      if (t > T1) { const u = Math.min(1, (t - T1) / (T2 - T1)), e = u * u * (3 - 2 * u); r = RT + (RP - RT) * e; y = TRACK_Y + (POCKET_Y - TRACK_Y) * e + BALL_R;
        if (u > 0.35 && u < 1) { const b = (u - 0.35) / 0.65; y += 0.013 * Math.abs(Math.sin(b * Math.PI * 3)) * (1 - b); r += 0.01 * Math.sin(b * Math.PI * 3) * (1 - b); } }
      return [phi, r, y];
    }
    /* the spin: the number is the Bank's; the ball's run is shaped to finish in its pocket (the simulation's motion) */
    function spin(n, done, onLand) {
      const idx = WHEEL.indexOf(n), pa = idx * SEG; rotW = W_RUN;
      const th0 = Math.PI / 2, rA0 = rotA, r1 = V_DROP - W_RUN, dT = T2 - T1;
      /* the pocket angle reached: th0 + (v0 + V_DROP) T1 / 2 - (rA0 + W_RUN T1) + r1 dT / 3 = pa (mod 2 pi): solve for v0 nearest V_LAUNCH */
      const C = th0 + V_DROP * T1 / 2 - rA0 - W_RUN * T1 + r1 * dT / 3, base = 2 * (pa - C) / T1, step = 4 * Math.PI / T1;
      const v0 = base + Math.round((V_LAUNCH - base) / step) * step;
      const ph1 = th0 + (v0 + V_DROP) * T1 / 2 - (rA0 + W_RUN * T1);   /* where it is against the wheelhead as it drops */
      run = { n, pa, th0, v0, r1, ph1, t: 0, done, onLand };   /* onLand(n): the ball has dropped into its pocket */
    }
    function update(dt) {
      rotW += ((run ? 2.4 : 0.35) - rotW) * Math.min(1, dt * (run ? 0.2 : 0.4)); rotA = wrap(rotA + rotW * dt); rotor.rotation.y = rotA;
      if (run) { run.t += dt; if (run.t < T_SETTLE) { const b = ballAt(run.t); placeBall(b[0], b[1], b[2]); last = run.pa; if (run.t >= T2 && !run.shown) { run.shown = 1; if (run.onLand) run.onLand(run.n); } } else { placeBall(run.pa, RP, POCKET_Y + BALL_R); if (run.t >= T_SETTLE) { const d = run.done; run.done = null; if (d) d(); if (run.t > T_SETTLE + 3) run = null; } } }
      else placeBall(last, RP, POCKET_Y + BALL_R);   /* resting in its pocket, turning with the wheelhead */
    }
    let hold = 0;
    function focus(dt) {   /* the corner view (2026-10-21: "... and the ball on the wheel"): the wheelhead while the ball runs and a moment after it drops */
      if (run && run.t < T_SETTLE) hold = 3; else { hold -= dt || 0; if (hold <= 0) return null; }
      return { p: table.localToWorld(new THREE.Vector3(WX, FY, WZ)), r: 0.42 };
    }
    /* ---- GOLD on the felt */
    const coins = new THREE.Group(); table.add(coins);
    /* [Claude 2026-10-28] the operator: "Make one pile of coins for each player instead of scattered piles": a bet is ONE stack on its spot (taller for
       more GOLD, at most 12 coins, a third bigger than a coin in the hand so a bet reads from the view above, its amount larger too), not up to 60 coins in stacks of 8 laid out in a ring that spilled over the boxes round it */
    const nCoins = n => n <= 5 ? n : Math.min(12, Math.round(5 + 1.2 * Math.sqrt(n - 5)));
    const stack = (grp, k, seed) => { for (let i = 0; i < k; i++) kit.coinPile(grp, 1, 1, 0, i * 0.0075, 0, seed + i * 0.7); };
    function label(n) { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'rgba(43,29,20,.85)'; x.fillRect(6, 10, 116, 44);
      x.fillStyle = '#ffe08a'; x.font = 'bold 34px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 33);
      const t = new THREE.CanvasTexture(c); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); sp.scale.set(0.105, 0.0525, 1); sp.renderOrder = 5; return sp; }
    function show(v) {
      for (const c of coins.children.slice()) { c.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); coins.remove(c); }
      let k = 0;
      for (const s in (v.felt || {})) { const off = ((k++ % 6) - 2.5) * 0.012;
        for (const bk in v.felt[s]) { const n = v.felt[s][bk]; if (!(n > 0)) continue; const p = betPos(bk), grp = new THREE.Group(); grp.position.set(p[0] + off, FY, p[1] + off); grp.scale.setScalar(1.35); const c = nCoins(n); stack(grp, c, k);
          const l = label(n); l.position.set(0, 0.02, -0.06); grp.add(l);   /* beside the stack, toward the dealer: from above a label over it hid the coins */ coins.add(grp); } }
    }
    return { group, body, hot: [felt], felt, areaAt: (x, z) => (Math.abs(x) <= FX && Math.abs(z) <= FZ ? keyAt(x, z) : null), show, spin, update, focus, _run: () => run && { t: run.t, n: run.n, land: !!run.onLand, shown: !!run.shown }, dealerAt: [ZB0 - 0.04, -(FZ + 0.085 + 0.16)], rail: railRect(FX + 0.085, FZ + 0.085), eyeY: 1.5, bedY: FY, game: 'wheel' };
  }
  const API = { build, keyAt, betPos, S, FY };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('wheeltable', { api: 1, v: 1, needs: {} }, () => API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
