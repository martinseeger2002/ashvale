/* ASHVALE 3D: the Fortune Engine (2026-10-16) - a steel cabinet with three mechanical reels, "made by a highly skilled
   crafts person and a wizard", four of them on the north wall of the Saltmere Tap's card room (tiles 453-456,25, lv 1), a
   chess-park bench in front of each. The reel strips and the pay table are the Wizard of Odds' 64-stop fruit machine (94.54%
   returned, 16.54% of spins win) with ASHVALE symbols. The @ashvale Bank holds the credit and decides every spin
   (tools/bank/bank.py handle_fe, which keeps the same tables); this module only draws the machine and turns its reels.
   build(THREE, {wrap}) -> machine M in its own frame (floor at y 0, the cabinet's back against the wall at z -0.42, the glass
   looking +z, the bench at z +0.95): M.group, M.body (the cabinet, to tap from the room), M.hot (the reels, the lever, the
   coin slot, the three stake knobs: what a seated player may tap), M.update(dt, t), M.spinTo(stops, done), M.pullLever(),
   M.feed(), M.show(credit, wager), M.knobs(k), M.mood({spinning, win, mine, low}), M.dropCoins(n), M.clearCoins(),
   M.eye(tall) -> {eye, look} in the machine's frame. Tables: STRIP, W, V2P, THREE_OF, STAKES, payOf(a, b, c), exact. */
(function (G) {
  'use strict';
  const STRIP = ['ruby', 'blank', 'dragon', 'blank', 'sword', 'blank', 'shield', 'blank', 'fish', 'blank', 'crown', 'blank', 'ruby', 'blank', 'dragon', 'blank', 'sword', 'blank', 'shield', 'blank', 'fish', 'blank'];
  const W = [
    [3, 2, 3, 2, 3, 2, 4, 2, 4, 5, 4, 5, 2, 2, 3, 2, 3, 2, 3, 2, 4, 2],
    [2, 3, 2, 3, 3, 3, 3, 3, 3, 5, 3, 5, 2, 3, 2, 3, 2, 3, 2, 3, 3, 3],
    [1, 3, 2, 3, 2, 3, 3, 3, 3, 8, 1, 7, 1, 3, 1, 3, 2, 3, 3, 3, 3, 3]];
  const NAME = { crown: 'Crown', ruby: 'Ruby', dragon: 'Dragon', sword: 'Sword', shield: 'Shield', fish: 'Fish', blank: 'Blank' };
  const THREE_OF = { crown: 5000, ruby: 1000, dragon: 200, sword: 100, shield: 50, fish: 25 };
  const STAKES = [1, 2, 3, 10, 20, 30, 100, 200, 300];
  const N = STRIP.length;
  const V2P = W.map(w => { const t = []; w.forEach((c, i) => { for (let k = 0; k < c; k++) t.push(i); }); return t; });
  function payOf(a, b, c) {
    if (a === b && b === c && THREE_OF[a]) return [THREE_OF[a], 'three-' + a];
    const n = (a === 'ruby') + (b === 'ruby') + (c === 'ruby');
    return n === 2 ? [10, 'two-ruby'] : n === 1 ? [2, 'one-ruby'] : [0, null];
  }
  const exact = (() => { const lines = {}; let tot = 0, hit = 0, ret = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) { const w = W[0][i] * W[1][j] * W[2][k], r = payOf(STRIP[i], STRIP[j], STRIP[k]); tot += w; if (r[0]) { hit += w; ret += w * r[0]; lines[r[1]] = (lines[r[1]] || 0) + w; } }
    return { lines, tot, hit, rtp: ret / tot }; })();

  /* ---------- the symbols, painted on a 100 x 100 box */
  function drawSym(ctx, s) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const stroke = (c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
    if (s === 'crown') {
      ctx.beginPath(); ctx.moveTo(16, 72); ctx.lineTo(20, 30); ctx.lineTo(35, 50); ctx.lineTo(50, 22); ctx.lineTo(65, 50); ctx.lineTo(80, 30); ctx.lineTo(84, 72); ctx.closePath();
      ctx.fillStyle = '#e0aa30'; ctx.fill(); stroke('#5a3d0e', 4);
      ctx.beginPath(); ctx.rect(16, 66, 68, 12); ctx.fillStyle = '#c98f1e'; ctx.fill(); stroke('#5a3d0e', 4);
      [[20, 28], [50, 20], [80, 28]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fillStyle = '#fff1c2'; ctx.fill(); stroke('#5a3d0e', 2.5); });
      [['#c0283b', 32], ['#2f6fb5', 50], ['#c0283b', 68]].forEach(([c, x]) => { ctx.beginPath(); ctx.arc(x, 72, 4.5, 0, 7); ctx.fillStyle = c; ctx.fill(); });
    } else if (s === 'ruby') {
      ctx.beginPath(); ctx.moveTo(34, 20); ctx.lineTo(66, 20); ctx.lineTo(84, 40); ctx.lineTo(50, 86); ctx.lineTo(16, 40); ctx.closePath(); ctx.fillStyle = '#c0283b'; ctx.fill(); stroke('#4a0812', 4);
      ctx.beginPath(); ctx.moveTo(16, 40); ctx.lineTo(84, 40); ctx.moveTo(34, 20); ctx.lineTo(42, 40); ctx.lineTo(50, 86); ctx.lineTo(58, 40); ctx.lineTo(66, 20); stroke('rgba(255,210,215,.6)', 2);
      ctx.beginPath(); ctx.moveTo(37, 25); ctx.lineTo(47, 25); ctx.lineTo(40, 36); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
    } else if (s === 'dragon') {
      ctx.beginPath(); ctx.moveTo(16, 86); ctx.quadraticCurveTo(14, 46, 38, 34); ctx.lineTo(48, 14); ctx.lineTo(54, 32); ctx.quadraticCurveTo(72, 32, 86, 46); ctx.lineTo(88, 55); ctx.lineTo(66, 59); ctx.lineTo(82, 68); ctx.lineTo(56, 70); ctx.quadraticCurveTo(44, 74, 42, 86); ctx.closePath();
      ctx.fillStyle = '#3f9a5a'; ctx.fill(); stroke('#123820', 4);
      ctx.beginPath(); ctx.moveTo(26, 44); ctx.lineTo(16, 38); ctx.lineTo(24, 52); ctx.moveTo(20, 58); ctx.lineTo(8, 56); ctx.lineTo(18, 68); ctx.fillStyle = '#2f7a47'; ctx.fill(); stroke('#123820', 2.5);
      ctx.beginPath(); ctx.ellipse(58, 43, 5.5, 4.5, 0, 0, 7); ctx.fillStyle = '#ffd23f'; ctx.fill(); stroke('#123820', 2);
      ctx.beginPath(); ctx.moveTo(58, 39); ctx.lineTo(58, 47); stroke('#111', 2);
      ctx.beginPath(); ctx.moveTo(70, 59); ctx.lineTo(72, 65); ctx.lineTo(74, 59.5); ctx.moveTo(62, 60); ctx.lineTo(64, 66); ctx.lineTo(66, 60); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (s === 'sword') {
      ctx.beginPath(); ctx.moveTo(45, 64); ctx.lineTo(45, 22); ctx.lineTo(50, 8); ctx.lineTo(55, 22); ctx.lineTo(55, 64); ctx.closePath(); ctx.fillStyle = '#d6dde1'; ctx.fill(); stroke('#3b4246', 3);
      ctx.beginPath(); ctx.moveTo(50, 20); ctx.lineTo(50, 60); stroke('#8a949a', 2);
      ctx.beginPath(); ctx.rect(28, 63, 44, 8); ctx.fillStyle = '#c99b46'; ctx.fill(); stroke('#6b4a14', 3);
      ctx.beginPath(); ctx.rect(45.5, 71, 9, 15); ctx.fillStyle = '#6b3f1d'; ctx.fill(); stroke('#3a210d', 2.5);
      ctx.beginPath(); ctx.arc(50, 90, 6, 0, 7); ctx.fillStyle = '#c99b46'; ctx.fill(); stroke('#6b4a14', 2.5);
    } else if (s === 'shield') {
      const path = () => { ctx.beginPath(); ctx.moveTo(22, 16); ctx.lineTo(78, 16); ctx.lineTo(78, 46); ctx.quadraticCurveTo(78, 74, 50, 90); ctx.quadraticCurveTo(22, 74, 22, 46); ctx.closePath(); };
      path(); ctx.fillStyle = '#2b5ea8'; ctx.fill(); ctx.save(); path(); ctx.clip(); ctx.fillStyle = '#e7c262'; ctx.fillRect(44, 8, 12, 90); ctx.fillRect(10, 38, 90, 12); ctx.restore();
      path(); stroke('#cfd6da', 6); path(); stroke('#2d3337', 2);
    } else if (s === 'fish') {
      ctx.beginPath(); ctx.moveTo(68, 52); ctx.lineTo(90, 34); ctx.lineTo(85, 52); ctx.lineTo(90, 70); ctx.closePath(); ctx.fillStyle = '#3d8799'; ctx.fill(); stroke('#173e48', 3);
      ctx.beginPath(); ctx.moveTo(38, 40); ctx.quadraticCurveTo(48, 26, 60, 40); ctx.fillStyle = '#3d8799'; ctx.fill(); stroke('#173e48', 2.5);
      ctx.beginPath(); ctx.ellipse(46, 53, 29, 16, 0, 0, 7); ctx.fillStyle = '#6fb3c6'; ctx.fill(); stroke('#173e48', 3.5);
      ctx.beginPath(); ctx.arc(28, 50, 4, 0, 7); ctx.fillStyle = '#111'; ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(50, 38); ctx.lineTo(55, 50); ctx.lineTo(50, 62); ctx.lineTo(45, 50); ctx.closePath(); ctx.fillStyle = 'rgba(120,98,60,.25)'; ctx.fill();
    }
  }
  /* a reel face is twice as wide as tall: ivory paper, a hairline at each edge, the symbol square in the middle */
  function faceCanvas(s, h) {
    const c = document.createElement('canvas'); c.width = h * 2; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#efe5cb'; x.fillRect(0, 0, c.width, h);
    x.fillStyle = 'rgba(110,86,50,.35)'; x.fillRect(0, 0, c.width, Math.max(1, h * 0.02)); x.fillRect(0, h - Math.max(1, h * 0.02), c.width, Math.max(1, h * 0.02));
    x.save(); x.translate(h / 2 + h * 0.05, h * 0.05); x.scale(h * 0.009, h * 0.009); drawSym(x, s); x.restore();
    return c;
  }
  let ICONS = null;
  function icons() { if (!ICONS) { ICONS = {}; for (const s in NAME) ICONS[s] = faceCanvas(s, 48).toDataURL(); } return ICONS; }

  /* ---------- the cabinet */
  const STEEL = 0x8e979d, STEEL_DK = 0x5b6266, IRON = 0x3a3f43, BRASS = 0xc99b46, BRASS_DK = 0x7a5a22, CAV = 0x17130f;
  const FACE_H = 0.08, DR = N * FACE_H / (2 * Math.PI), DW = 0.15;   /* 22 faces of 8 cm make a drum of r 0.28 m: three faces show */
  const AP = DR * Math.cos(Math.PI / N), CHORD = 2 * DR * Math.sin(Math.PI / N), STEP = 2 * Math.PI / N;
  const WIN_Y = 1.10, DRUM_Z = 0.15 - AP, BENCH_Z = 0.95;
  let SHARED = null;   /* the reel faces and the name plate: one set for every machine (marked shared, so a region's dispose keeps them) */
  function shared(THREE, wrap) {
    if (SHARED) return SHARED;
    const face = {};
    for (const s in NAME) { const t = new THREE.CanvasTexture(faceCanvas(s, 128)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      face[s] = wrap(new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.28 })); face[s].userData.shared = true; }
    const c = document.createElement('canvas'); c.width = 512; c.height = 88; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 88); g.addColorStop(0, '#e6c372'); g.addColorStop(0.55, '#b08333'); g.addColorStop(1, '#d4ad5c');
    x.fillStyle = g; x.fillRect(0, 0, 512, 88); x.strokeStyle = '#6b4a14'; x.lineWidth = 6; x.strokeRect(3, 3, 506, 82);
    x.fillStyle = '#2b2112'; x.font = 'bold 46px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('FORTUNE ENGINE', 256, 47);
    const pt = new THREE.CanvasTexture(c); pt.colorSpace = THREE.SRGBColorSpace;
    const plate = wrap(new THREE.MeshLambertMaterial({ map: pt })); plate.userData.shared = true;
    const coin = wrap(new THREE.MeshLambertMaterial({ color: 0xd4a63a, emissive: 0x6a4a10, emissiveIntensity: 0.4, flatShading: true })); coin.userData.shared = true;
    const motes = new THREE.PointsMaterial({ color: 0x9fdcf2, size: 0.007, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }); motes.userData.shared = true;
    const hidden = new THREE.MeshBasicMaterial({ visible: false }); hidden.userData.shared = true;
    SHARED = { face, plate, coin, motes, hidden, coinGeo: new THREE.CylinderGeometry(0.018, 0.018, 0.006, 10) };
    return SHARED;
  }
  /* the counter under the glass (the operator: "a credits and bet amount display on the machine so that a passer-by can look at it"):
     CREDIT and WAGER in blue spell-light numerals floating in a dark glass pane ("powered by a magic spell") */
  function sigil(x, cx, cy, r) {
    x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r * 0.7, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r * 0.7, cy); x.closePath();
    x.moveTo(cx, cy - r * 1.4); x.lineTo(cx, cy + r * 1.4); x.moveTo(cx - r * 0.5, cy - r * 0.6); x.lineTo(cx + r * 0.5, cy + r * 0.2); x.stroke();
  }
  function paintDisplay(D, credit, wager) {
    const x = D.c.getContext('2d'), W2 = D.c.width, H = D.c.height;
    const bg = x.createRadialGradient(W2 / 2, H / 2, 10, W2 / 2, H / 2, W2 * 0.6); bg.addColorStop(0, '#0e2333'); bg.addColorStop(1, '#03070c');
    x.fillStyle = bg; x.fillRect(0, 0, W2, H);
    x.strokeStyle = 'rgba(115,198,234,.10)'; x.lineWidth = 1;
    for (let k = 0; k < 9; k++) { x.beginPath(); x.moveTo(0, 18 + k * 14); x.bezierCurveTo(W2 * 0.3, 8 + k * 15, W2 * 0.7, 30 + k * 12, W2, 14 + k * 14); x.stroke(); }
    x.shadowColor = '#3aa6dc'; x.shadowBlur = 10; x.strokeStyle = 'rgba(159,220,242,.85)'; x.lineWidth = 2;
    x.strokeRect(5, 5, W2 - 10, H - 10); x.beginPath(); x.moveTo(338, 14); x.lineTo(338, H - 14); x.stroke();
    for (const [cx, cy] of [[16, 16], [W2 - 16, 16], [16, H - 16], [W2 - 16, H - 16]]) sigil(x, cx, cy, 6);
    x.font = 'bold 20px Georgia, serif'; x.fillStyle = '#9fdcf2'; x.textBaseline = 'alphabetic'; x.textAlign = 'left'; x.shadowBlur = 8;
    x.fillText('CREDIT', 34, 34); x.fillText('WAGER', 356, 34);
    x.font = 'bold 66px Georgia, serif'; x.textBaseline = 'middle'; x.textAlign = 'right';
    for (const [txt, rx] of [[credit.toLocaleString('en-US'), 322], [String(wager), 494]]) {
      x.shadowColor = '#3aa6dc'; x.shadowBlur = 26; x.fillStyle = '#7fd0f2'; x.fillText(txt, rx, 88);
      x.shadowBlur = 6; x.fillStyle = '#e8f8ff'; x.fillText(txt, rx, 88);
    }
    x.shadowBlur = 0; D.t.needsUpdate = true;
  }
  function gear(THREE, mesh, r, teeth) {
    const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(r, r, 0.012, teeth * 2), BRASS));
    for (let k = 0; k < teeth; k++) { const a = k / teeth * Math.PI * 2, t = mesh(new THREE.BoxGeometry(r * 0.28, 0.012, r * 0.22), BRASS, Math.cos(a) * r * 1.08, 0, Math.sin(a) * r * 1.08); t.rotation.y = -a; g.add(t); }
    g.add(mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.02, 8), BRASS_DK)); g.rotation.x = Math.PI / 2; return g;
  }

  function build(THREE, opts) {
    const wrap = (opts && opts.wrap) || (m => m), S = shared(THREE, wrap), cache = new Map();
    const lam = (color, o) => { const k = color + JSON.stringify(o || {}); if (!cache.has(k)) cache.set(k, wrap(new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, o || {})))); return cache.get(k); };
    const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, typeof mat === 'number' ? lam(mat) : mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = m.receiveShadow = true; return m; };
    const M = { group: new THREE.Group(), drums: [], pos: [0, 0, 0], gears: [], coins: [], feedC: [], hot: [], spin: null, spinning: false, win: 0, mine: false, low: false, pull: 0, clock: 0 };
    const g = M.group, box = (w, h, d, c, x, y, z) => { const m = mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z); g.add(m); return m; };
    /* body */
    box(0.78, 0.12, 0.68, IRON, 0, 0.06, -0.11);
    box(0.72, 0.66, 0.62, STEEL, 0, 0.45, -0.11);
    box(0.78, 0.04, 0.70, BRASS_DK, 0, 0.80, -0.09);
    box(0.76, 0.045, 0.2, BRASS_DK, 0, 0.80, 0.30);   /* the button shelf, out in front of the glass */
    for (const sx of [-1, 1]) box(0.03, 0.1, 0.12, BRASS, sx * 0.3, 0.73, 0.26);
    for (const sx of [-1, 1]) box(0.02, 0.62, 0.61, STEEL, sx * 0.35, 1.13, -0.115);
    box(0.70, 0.62, 0.02, CAV, 0, 1.13, -0.41);
    box(0.74, 0.03, 0.63, STEEL_DK, 0, 1.455, -0.11);
    box(0.72, 0.16, 0.04, STEEL, 0, 0.90, 0.17);
    box(0.72, 0.22, 0.04, STEEL, 0, 1.33, 0.17);
    for (const sx of [-1, 1]) box(0.09, 0.24, 0.04, STEEL, sx * 0.315, WIN_Y, 0.17);
    for (const [w, h, px, py] of [[0.58, 0.02, 0, WIN_Y + 0.13], [0.58, 0.02, 0, WIN_Y - 0.13], [0.02, 0.28, -0.28, WIN_Y], [0.02, 0.28, 0.28, WIN_Y]]) box(w, h, 0.05, BRASS, px, py, 0.175);
    const pay = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: 0xb8323f })); pay.position.set(0, WIN_Y, 0.158); g.add(pay);
    for (const sx of [-1, 1]) { const c = mesh(new THREE.ConeGeometry(0.018, 0.04, 4), BRASS, sx * 0.25, WIN_Y, 0.19); c.rotation.z = sx * Math.PI / 2; g.add(c); }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.26), new THREE.MeshLambertMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.10, depthWrite: false })); glass.position.set(0, WIN_Y, 0.162); g.add(glass);
    /* the three drums: 22 painted faces round each, turning about x */
    const faceGeo = new THREE.PlaneGeometry(DW, CHORD * 1.004);
    for (let r = 0; r < 3; r++) {
      const d = new THREE.Group(); d.position.set((r - 1) * 0.18, WIN_Y, DRUM_Z); g.add(d);
      for (let i = 0; i < N; i++) { const a = i * STEP, f = new THREE.Mesh(faceGeo, S.face[STRIP[i]]); f.position.set(0, AP * Math.sin(a), AP * Math.cos(a)); f.rotation.x = -a; d.add(f); }
      for (const sx of [-1, 1]) { const rim = mesh(new THREE.CylinderGeometry(DR * 1.03, DR * 1.03, 0.008, N), BRASS_DK, sx * (DW / 2 + 0.004), 0, 0); rim.rotation.z = Math.PI / 2; d.add(rim); }
      M.drums.push(d);
    }
    const axle = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.68, 6), IRON, 0, WIN_Y, DRUM_Z); axle.rotation.z = Math.PI / 2; g.add(axle);
    /* crest: an arch of steel, a brass ring, the wizard's orb, the name plate */
    const archShape = new THREE.Shape(); archShape.absarc(0, 0, 0.25, 0, Math.PI, false);
    g.add(mesh(new THREE.ExtrudeGeometry(archShape, { depth: 0.05, bevelEnabled: false, curveSegments: 7 }), STEEL, 0, 1.455, 0.10));
    g.add(mesh(new THREE.TorusGeometry(0.25, 0.014, 6, 14, Math.PI), BRASS, 0, 1.47, 0.15));
    g.add(mesh(new THREE.TorusGeometry(0.085, 0.014, 6, 16), BRASS, 0, 1.6, 0.16));
    M.orbMat = wrap(new THREE.MeshLambertMaterial({ color: 0x73c6ea, emissive: 0x3aa6dc, emissiveIntensity: 0.8, flatShading: true }));
    M.orb = mesh(new THREE.IcosahedronGeometry(0.065, 1), M.orbMat, 0, 1.6, 0.16); M.orb.castShadow = false; g.add(M.orb);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.076), S.plate); plate.position.set(0, 1.34, 0.191); g.add(plate);
    /* rune inlays down the front, lit by the same charm as the orb */
    M.runeMat = wrap(new THREE.MeshLambertMaterial({ color: 0x9fdcf2, emissive: 0x3aa6dc, emissiveIntensity: 0.5 }));
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(k % 2 ? 0.02 : 0.012, 0.05, 0.004), M.runeMat); r.position.set(sx * 0.31, 0.24 + k * 0.085, 0.201); g.add(r); }
    /* the works behind a brass grille */
    box(0.44, 0.24, 0.01, CAV, 0, 0.53, 0.203);
    for (const [gx, gr, gt] of [[-0.12, 0.068, 12], [0.005, 0.048, 9], [0.125, 0.068, 12]]) { const ge = gear(THREE, mesh, gr, gt); ge.position.set(gx, 0.53, 0.212); g.add(ge); M.gears.push(ge); }
    for (let k = 0; k < 9; k++) box(0.008, 0.24, 0.008, BRASS_DK, -0.2 + k * 0.05, 0.53, 0.226);
    for (const [w, h, px, py] of [[0.48, 0.02, 0, 0.66], [0.48, 0.02, 0, 0.40], [0.02, 0.28, -0.23, 0.53], [0.02, 0.28, 0.23, 0.53]]) box(w, h, 0.03, BRASS, px, py, 0.215);
    /* coin tray and chute */
    box(0.44, 0.03, 0.16, BRASS, 0, 0.17, 0.27); box(0.44, 0.08, 0.02, BRASS, 0, 0.21, 0.345);
    for (const sx of [-1, 1]) box(0.02, 0.08, 0.16, BRASS, sx * 0.21, 0.21, 0.27);
    box(0.12, 0.05, 0.01, 0x0d0b09, 0, 0.30, 0.203);
    /* stake knobs on the shelf (lit: the stake chosen) and the coin slot (it glows while the credit is too low to spin) */
    M.knobMats = [-0.09, 0, 0.09].map(kx => { const m = wrap(new THREE.MeshLambertMaterial({ color: 0x6b4a14, emissive: 0xffb030, emissiveIntensity: 0, flatShading: true })); g.add(mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.025, 10), m, kx, 0.835, 0.30)); return m; });
    M.slotMat = wrap(new THREE.MeshLambertMaterial({ color: BRASS, emissive: 0xffc040, emissiveIntensity: 0, flatShading: true }));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.09, 0.08), M.slotMat, 0.24, 0.867, 0.31));
    box(0.13, 0.012, 0.09, BRASS_DK, 0.24, 0.917, 0.31);
    box(0.012, 0.058, 0.006, CAV, 0.24, 0.87, 0.351);
    /* rivets */
    for (const [rx, ry] of [[-0.33, 1.42], [0.33, 1.42], [-0.33, 0.84], [0.33, 0.84], [-0.33, 0.16], [0.33, 0.16], [-0.33, 0.74], [0.33, 0.74]]) g.add(mesh(new THREE.IcosahedronGeometry(0.011, 0), 0xd7dde0, rx, ry, ry > 0.8 ? 0.19 : 0.2));
    /* the lever on the right side */
    { const h = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 10), STEEL_DK, 0.395, 1.0, -0.06); h.rotation.z = Math.PI / 2; g.add(h); }
    M.arm = new THREE.Group(); M.arm.position.set(0.44, 1.0, -0.06); g.add(M.arm);
    M.arm.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.42, 6), 0xc8ced2, 0, 0.21, 0));
    M.arm.add(mesh(new THREE.IcosahedronGeometry(0.042, 1), BRASS, 0, 0.44, 0));
    /* the spell-lit counter */
    { const c = document.createElement('canvas'); c.width = 512; c.height = 140;
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const mat = wrap(new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1 }));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.11), mat); m.position.set(-0.08, 0.90, 0.192); g.add(m);
      for (const [w, h, px, py] of [[0.42, 0.012, -0.08, 0.961], [0.42, 0.012, -0.08, 0.839], [0.012, 0.13, -0.286, 0.90], [0.012, 0.13, 0.126, 0.90]]) box(w, h, 0.012, BRASS, px, py, 0.194);
      const MOTES = 16, pos = new Float32Array(MOTES * 3), seed = [];
      for (let k = 0; k < MOTES; k++) seed.push({ x: -0.27 + Math.random() * 0.38, ph: Math.random(), sp: 0.5 + Math.random() * 0.7 });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, S.motes); pts.frustumCulled = false; g.add(pts);
      M.disp = { c, t, mat, pts, seed, surge: 0, credit: -1, wager: -1 }; }
    /* the bench (scene.js 'bench': a tarred plank on two sandstone blocks), in front of the machine on the seat tile */
    box(0.9, 0.06, 0.34, 0x4a3626, 0, 0.42, BENCH_Z); for (const dx of [-0.32, 0.32]) box(0.16, 0.4, 0.28, 0x9a8c78, dx, 0.2, BENCH_Z);
    /* what can be tapped: the whole cabinet from the room; seated, only the reels, the lever, the slot and the knobs */
    M.body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.75, 0.8), S.hidden); M.body.position.set(0.04, 0.88, -0.1); g.add(M.body);
    const hot = (w, h, d, x, y, z, act, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), S.hidden); m.position.set(x, y, z); m.userData.fe = { act, i }; g.add(m); M.hot.push(m); };
    hot(0.58, 0.28, 0.04, 0, WIN_Y, 0.18, 'spin');
    hot(0.13, 0.62, 0.16, 0.44, 1.22, -0.06, 'spin');
    hot(0.16, 0.12, 0.13, 0.24, 0.87, 0.32, 'slot');
    [-0.09, 0, 0.09].forEach((kx, i) => hot(0.08, 0.06, 0.09, kx, 0.84, 0.30, 'stake', i));

    M.show = (credit, wager) => {
      const D = M.disp; credit = Math.min(9999999, Math.max(0, Math.round(credit || 0))); wager = wager | 0 || 1;
      if (D.credit === credit && D.wager === wager) return;
      if (D.credit >= 0) D.surge = 1;
      D.credit = credit; D.wager = wager; paintDisplay(D, credit, wager);
    };
    M.knobs = k => M.knobMats.forEach((m, i) => { m.emissiveIntensity = i < k ? 0.9 : 0; });
    M.mood = o => { if ('mine' in o) M.mine = !!o.mine; if ('win' in o) M.win = o.win ? 1 : 0; if ('low' in o) M.low = !!o.low; };
    M.setStops = stops => { stops.forEach((p, r) => { M.pos[r] = p; M.drums[r].rotation.x = p * STEP; }); };
    /* turn the reels to these stops (painted positions 0-21), each a few turns, left reel first, a mechanical bump at the end */
    M.spinTo = (stops, done, quick) => {
      M.spin = stops.map((tg, r) => { const cur = ((Math.round(M.pos[r]) % N) + N) % N, d = ((tg - cur) % N + N) % N;
        return { from: Math.round(M.pos[r]), travel: (quick ? 1 : 3 + r) * N + d, t0: M.clock + (quick ? 0 : 0.26 + r * 0.09), dur: quick ? 0.45 : 1.5 + r * 0.48, live: true, last: 0 }; });
      M.spinning = true; M.onDone = done || null;
    };
    M.pullLever = () => { M.pull = 1; };
    M.feed = () => { for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(S.coinGeo, S.coin); c.rotation.z = Math.PI / 2; c.position.set(0.24, 0.87, 0.46); c.userData.t = k * 0.12; c.visible = false; g.add(c); M.feedC.push(c); } };
    M.dropCoins = n => { for (let k = 0; k < n; k++) { const c = new THREE.Mesh(S.coinGeo, S.coin); c.castShadow = true;
      c.position.set((Math.random() - 0.5) * 0.08, 0.30, 0.215); c.userData = { vy: 0, vz: 0.35 + Math.random() * 0.25, vx: (Math.random() - 0.5) * 0.5, t: k * 0.07, rest: 0.19 + Math.min(0.04, M.coins.length * 0.0012), spin: Math.random() * 6 };
      c.visible = false; g.add(c); M.coins.push(c); } };
    M.clearCoins = () => { M.coins.forEach(c => g.remove(c)); M.coins = []; };
    /* where a seated player's eye is, in the machine's frame: the bench's sitter (0.42 m seat + 0.72 m), looking at the glass;
       on a tall phone screen a little further back and lower so the cabinet's front fits */
    M.eye = tall => ({ eye: { x: tall ? 0.07 : 0, y: 1.14, z: tall ? 1.40 : BENCH_Z + 0.02 }, look: { x: tall ? 0.07 : 0, y: tall ? 0.88 : 0.98, z: 0.2 } });   /* a phone held upright: a shade right, so the lever shows */
    M.update = (dt, t) => {
      M.clock += dt;
      if (M.spinning && M.spin) {
        let live = false;
        M.spin.forEach((S2, r) => { if (!S2.live) return;
          const p = Math.min(1, Math.max(0, (M.clock - S2.t0) / S2.dur)), prev = Math.floor(M.pos[r]);
          const bounce = p > 0.86 ? 0.22 * Math.sin((p - 0.86) / 0.14 * Math.PI) : 0;
          M.pos[r] = S2.from + S2.travel * (1 - Math.pow(1 - p, 3)) + bounce;
          if (Math.floor(M.pos[r]) !== prev && M.clock - S2.last > 0.03) { S2.last = M.clock; if (M.onTick) M.onTick(); }
          if (p >= 1) { M.pos[r] = S2.from + S2.travel; S2.live = false; if (M.onClunk) M.onClunk(r); } else live = true;
          M.drums[r].rotation.x = M.pos[r] * STEP; });
        if (!live) { M.spinning = false; const d = M.onDone; M.onDone = null; if (d) d(); }
      }
      if (M.pull > 0) { M.pull = Math.max(0, M.pull - dt * 1.6); M.arm.rotation.x = Math.sin(Math.min(1, 1 - M.pull) * Math.PI) * 1.25; }
      if (M.spinning) M.gears.forEach((ge, i) => { ge.rotation.y += dt * (i === 1 ? -9 : 6); });
      M.orbMat.emissive.setHex(M.win ? 0xf0b030 : 0x3aa6dc); M.orbMat.color.setHex(M.win ? 0xffd27a : 0x73c6ea);
      M.orbMat.emissiveIntensity = M.spinning ? 1.4 + 0.6 * Math.sin(t * 12) : M.win ? 1.6 : (M.mine ? 0.9 : 0.6) + 0.15 * Math.sin(t * 1.7 + M.group.position.x);
      M.runeMat.emissiveIntensity = M.spinning ? 1.1 + 0.5 * Math.sin(t * 9) : M.win ? 1.2 : 0.45;
      M.orb.rotation.y += dt * (M.spinning ? 3 : 0.4);
      M.slotMat.emissiveIntensity = M.mine && M.low ? 0.45 + 0.45 * Math.sin(t * 5) : 0;
      { const D = M.disp; D.surge = Math.max(0, D.surge - dt * 1.8);
        D.mat.emissiveIntensity = 0.9 + 0.12 * Math.sin(t * 2.1 + M.group.position.x * 3) + 0.05 * Math.sin(t * 17 + M.group.position.x) + D.surge * 0.9;
        const P = D.pts.geometry.attributes.position;
        D.seed.forEach((m, k) => { const u = (m.ph + t * 0.18 * m.sp * (1 + D.surge * 2)) % 1; P.setXYZ(k, m.x + Math.sin(t * 1.3 + k) * 0.01, 0.85 + u * 0.13, 0.198 + u * 0.03); });
        P.needsUpdate = true; }
      for (const c of M.coins) { const u = c.userData; if (u.t > 0) { u.t -= dt; continue; } c.visible = true;
        if (c.position.y > u.rest) { u.vy -= 9.8 * dt; c.position.x = Math.max(-0.18, Math.min(0.18, c.position.x + u.vx * dt)); c.position.z = Math.min(0.32, c.position.z + u.vz * dt); c.position.y += u.vy * dt; c.rotation.x += u.spin * dt;
          if (c.position.y <= u.rest) { c.position.y = u.rest; c.rotation.set(0, Math.random() * 3, 0); } } }
      if (M.feedC.length) {
        for (const c of M.feedC) { const u = c.userData; if (u.t > 0) { u.t -= dt; continue; } c.visible = true; c.position.z -= dt * 0.3; if (c.position.z < 0.355 && !u.done) { u.done = true; if (M.onClink) M.onClink(); } }
        M.feedC = M.feedC.filter(c => { if (c.userData.done) { g.remove(c); return false; } return true; });
      }
    };
    M.setStops([0, 0, 0].map(() => Math.floor(Math.random() * N)));
    M.show(0, 1);
    return M;
  }

  const api = { api: 1, build, STRIP, W, V2P, NAME, THREE_OF, STAKES, payOf, exact, icons, STEP };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('fortune', { api: 1, v: 1 }, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = { STRIP, W, V2P, THREE_OF, STAKES, payOf, exact };
})(typeof globalThis !== 'undefined' ? globalThis : this);
