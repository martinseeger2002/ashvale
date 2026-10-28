/* ASHVALE: the dice table (2026-10-20: the clubhouse's second floor; the 2026-10-18 simulation's table, felt and payouts).
   Its own module so it can be updated alone. The scene builds it (case 'gametable', found by name '<game>table'); the shared
   engine part (engtables.js) seats players, takes their taps on the felt and plays the Bank's rolls on it.
   Frame: the footprint's middle at the origin, the floor at y 0, the long side along x, the players' rail +z, the dealer -z; the
   shooter throws from the +x end at the far (-x) wall. A 12-foot table in true metres (heights for people drawn at 0.8).
   build(THREE, kit) -> T: {group, body, hot: [felt], areaAt(x, z) -> bet key | null (local metres), show(view), roll(dice, k, done),
   update(dt, t), eyeY, keys: rules keys this felt offers}. view = {point, felt: {s: seat}, spots: {s: localX}} (seat as dicerules). */
(function (G) {
  'use strict';
  const S = 0.8, BED_L = 3.2, BED_W = 1.14, BED_Y = 0.78 * S, WALL_H = 0.2 * S, RAIL_W = 0.22, HL = BED_L / 2, HW = BED_W / 2, DIE = 0.022;
  /* 2026-10-21: "make the craps tables bigger so they're realistically size", "Make it a proportional size": a 12-foot casino table in
     true metres, as the twenty-one table (R 1.3) - outside 3.64 x 1.58 m, the bed 3.2 x 1.14; the rail stays at hip height for ASHVALE
     people (drawn at 0.8: hips 0.78 m, the padded rail top 0.83 m); dice of 22 mm, a casino die (19 mm) a touch larger to be seen */
  const FACE_AXIS = { 1: [0, 1, 0], 2: [1, 0, 0], 3: [0, 0, 1], 4: [0, 0, -1], 5: [-1, 0, 0], 6: [0, -1, 0] };
function railRect(ax, az) {   /* [Claude 2026-10-21] the rail's outside edge nearest a point (table metres): [x, z, outward nx, nz] - where someone standing there leans on it */
    return (x, z) => { let qx = Math.max(-ax, Math.min(ax, x)), qz = Math.max(-az, Math.min(az, z)), nx = x - qx, nz = z - qz;
      if (!nx && !nz) { const dx = ax - Math.abs(x), dz = az - Math.abs(z); if (dx < dz) { qx = Math.sign(x || 1) * ax; nx = Math.sign(x || 1); } else { qz = Math.sign(z || 1) * az; nz = Math.sign(z || 1); } }
      const l = Math.hypot(nx, nz) || 1; return [qx, qz, nx / l, nz / l]; };
  }
  function build(THREE, kit) {
    const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const group = new THREE.Group(), table = new THREE.Group(); group.add(table);
    const woodM = lam('#5a3620'), padM = lam('#2a1712');
    /* ---- the table: apron, legs, walls with padded rails, the diamond rubber at both ends */
    const apron = new THREE.Mesh(new THREE.BoxGeometry(BED_L + 2 * RAIL_W, 0.12, BED_W + 2 * RAIL_W), woodM); apron.position.y = BED_Y - 0.08; table.add(apron);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, BED_Y - 0.1, 0.1), woodM); leg.position.set(sx * (HL - 0.1), (BED_Y - 0.1) / 2, sz * (HW - 0.05)); table.add(leg); }
    const wall = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), woodM); m.position.set(x, BED_Y + WALL_H / 2, z); table.add(m); };
    wall(BED_L + 2 * RAIL_W, RAIL_W, 0, -HW - RAIL_W / 2); wall(BED_L + 2 * RAIL_W, RAIL_W, 0, HW + RAIL_W / 2); wall(RAIL_W, BED_W, -HL - RAIL_W / 2, 0); wall(RAIL_W, BED_W, HL + RAIL_W / 2, 0);
    const pad = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), padM); m.position.set(x, BED_Y + WALL_H + 0.025, z); table.add(m); };
    pad(BED_L + 2 * RAIL_W + 0.06, RAIL_W + 0.06, 0, -HW - RAIL_W / 2); pad(BED_L + 2 * RAIL_W + 0.06, RAIL_W + 0.06, 0, HW + RAIL_W / 2); pad(RAIL_W + 0.06, BED_W, -HL - RAIL_W / 2, 0); pad(RAIL_W + 0.06, BED_W, HL + RAIL_W / 2, 0);
    const rub = lam('#141414');
    for (const sx of [-1, 1]) for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.03, 4), rub); p.rotation.z = sx * Math.PI / 2; p.position.set(sx * (HL - 0.012), BED_Y + 0.04 + j * 0.06, -HW + 0.06 + i * (BED_W - 0.12) / 9); table.add(p); }
    /* ---- the felt (2026-10-21: "Find a real good craps layout on the Internet and copy it exactly", "so that the layout doesn't
       bleed onto itself"): the standard casino layout, drawn on a canvas - two mirrored halves round the propositions in the middle. Each
       half, from the dealer's side (-z) to the players' rail (+z): the place numbers (4 5 SIX 8 NINE 10) with the Don't Come bar at their
       inner end, COME, the FIELD (2 and 12 circled, pay double) with BIG 6 / 8 in the corner, the Don't Pass bar, and the PASS LINE along
       the rail; the pass line and the don't pass bar run on round the end of the table. The middle: Seven, the four hardways, the one-roll
       numbers 2 3 12 11 (dice drawn, as on the felt), Any 2 3 12. Every word is fitted inside its own box; AREAS are the boxes drawn. */
    const AREAS = [], TEX_W = 2048, TEX_H = Math.round(TEX_W * BED_W / BED_L);
    const cv = document.createElement('canvas'); cv.width = TEX_W; cv.height = TEX_H; const g = cv.getContext('2d');
    const px = x => (x + HL) / BED_L * TEX_W, pz = z => (z + HW) / BED_W * TEX_H, PPM = TEX_W / BED_L;
    const CREAM = '#f2ead8', GOLD = '#ffe08a', RED = '#ff6a5a', DARK = '#1a5c39', LINE = 5;
    function fit(text, X, Z, W, H, o) {   /* text (\n for lines) centred in the box X,Z,W,H (pixels), the largest size that fits with a margin;
         rot: turned (the end strips), sq: letters may be narrowed down to that much of their width before the size comes down (as felt lettering) */
      o = o || {}; const L = String(text).split('\n'), m = o.m != null ? o.m : 0.14, side = o.rot ? [H, W] : [W, H], w = side[0] * (1 - m), h = side[1] * (1 - m);
      let sz = Math.min(o.max || 999, h / (L.length * 1.08)), xs = 1;
      g.font = (o.w || 'bold') + ' ' + sz + 'px Georgia, serif'; const wid = Math.max(...L.map(l => g.measureText(l).width));
      if (wid > w) { xs = Math.max(o.sq || 1, w / wid); if (wid * xs > w) sz *= w / (wid * xs); }
      g.font = (o.w || 'bold') + ' ' + sz + 'px Georgia, serif'; g.fillStyle = o.color || CREAM; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(X + W / 2, Z + H / 2); if (o.rot) g.rotate(o.rot); g.scale(xs, 1);
      L.forEach((l, i) => g.fillText(l, 0, (i - (L.length - 1) / 2) * sz * 1.08)); g.restore(); return sz;
    }
    const box = (x0, x1, z0, z1, key, opt) => {   /* a box in bed metres: its fill, its outline, its key for taps */
      opt = opt || {}; const a = Math.min(x0, x1), b = Math.max(x0, x1); if (key) AREAS.push({ key, x0: a, x1: b, z0, z1 });
      const X = px(a), Z = pz(z0), W = px(b) - X, H = pz(z1) - Z;
      if (opt.fill) { g.fillStyle = opt.fill; g.fillRect(X, Z, W, H); }
      g.strokeStyle = CREAM; g.lineWidth = LINE; g.strokeRect(X + LINE / 2, Z + LINE / 2, W - LINE, H - LINE);
      return [X, Z, W, H];
    };
    function dieFace(cx, cy, s, n) {   /* a die seen from above, n pips (the hardways and one-roll boxes show the dice) */
      g.fillStyle = '#f7f2e6'; g.beginPath(); const r = s * 0.16; g.moveTo(cx - s / 2 + r, cy - s / 2); g.arcTo(cx + s / 2, cy - s / 2, cx + s / 2, cy + s / 2, r); g.arcTo(cx + s / 2, cy + s / 2, cx - s / 2, cy + s / 2, r); g.arcTo(cx - s / 2, cy + s / 2, cx - s / 2, cy - s / 2, r); g.arcTo(cx - s / 2, cy - s / 2, cx + s / 2, cy - s / 2, r); g.fill();
      g.fillStyle = '#b81c26'; const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n];
      for (const [u, v] of P) { g.beginPath(); g.arc(cx + u * s * 0.26, cy + v * s * 0.26, s * 0.09, 0, 7); g.fill(); }
    }
    function diceBox(x0, x1, z0, z1, key, d, pay, opt) {   /* a pair of dice and the payout under them */
      const [X, Z, W, H] = box(x0, x1, z0, z1, key, opt), s = Math.min(W * 0.3, H * 0.42);
      dieFace(X + W / 2 - s * 0.58, Z + H * 0.36, s, d[0]); dieFace(X + W / 2 + s * 0.58, Z + H * 0.36, s, d[1]);
      fit(pay, X, Z + H * 0.64, W, H * 0.34, { m: 0.22 });
    }
    g.fillStyle = '#1f6b43'; g.fillRect(0, 0, TEX_W, TEX_H);
    /* the measures (metres): a 12-foot table, a 10-foot-6 bed; place boxes 16 cm (6 1/4 in) wide as on a casino felt */
    const E = HL - 0.02, C0 = 0.32, PW = 0.13, DW = 0.09, BIG = 0.2, OC = E - PW - DW - BIG;   /* OC: the outer corner column (Don't Come bar over Big 6 / 8) */
    const ZT = -HW + 0.02, ZN = -0.2, ZC = 0.05, ZF = 0.28, ZD = 0.35, ZB = HW - 0.02;   /* numbers | come | field | don't pass | pass */
    const POINTS = [4, 5, 6, 8, 9, 10];
    for (const sx of [1, -1]) {   /* the two halves, mirrored; rot turns the end strips' words to read along them */
      const a = x => sx * x, rot = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      let r = box(a(C0), a(E - PW), ZD, ZB, 'pass'); fit('PASS LINE', ...r, { max: 78 });
      r = box(a(E - PW), a(E), ZT, ZB, 'pass'); fit('PASS LINE', r[0], r[1], r[2], r[3], { rot, m: 0.08, max: 60 });
      r = box(a(C0), a(E - PW - DW), ZF, ZD, 'dp'); fit("DON'T PASS BAR", ...r, { max: 40, m: 0.18 });
      r = box(a(E - PW - DW), a(E - PW), ZT, ZD, 'dp'); fit("DON'T PASS BAR", r[0], r[1], r[2], r[3], { rot, m: 0.12, max: 34 });
      r = box(a(OC), a(OC + BIG / 2), ZC, ZF, sx > 0 ? 'big6' : 'big8', { fill: DARK }); fit(sx > 0 ? '6' : '8', ...r, { color: RED, max: 120 });
      r = box(a(OC + BIG / 2), a(OC + BIG), ZC, ZF, sx > 0 ? 'big8' : 'big6', { fill: DARK }); fit(sx > 0 ? '8' : '6', ...r, { color: RED, max: 120 });
      { const [X, Z, W, H] = box(a(C0), a(OC), ZC, ZF, 'field');   /* the field: its numbers on top (2 and 12 ringed), FIELD under them */
        const nums = ['2', '3', '4', '9', '10', '11', '12'], cw = W * 0.9 / nums.length, top = Z + H * 0.08, rh = H * 0.42;
        nums.forEach((n, i) => { const cx = X + W * 0.05 + cw * (i + 0.5), cy = top + rh / 2;
          if (n === '2' || n === '12') { g.strokeStyle = GOLD; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, Math.min(cw, rh) * 0.46, 0, 7); g.stroke(); }
          fit(n, cx - cw / 2, top, cw, rh, { color: GOLD, m: 0.28 }); });
        fit('FIELD', X, Z + H * 0.52, W * 0.42, H * 0.42, { color: GOLD, m: 0.1 });
        fit('2 and 12\npay double', X + W * 0.48, Z + H * 0.52, W * 0.46, H * 0.44, { color: GOLD, m: 0.12, w: 'bold italic' }); }
      r = box(a(C0), a(E - PW - DW), ZN, ZC, 'come'); fit('COME', ...r, { color: RED, max: 150, m: 0.2 });
      r = box(a(OC), a(OC + BIG), ZT, ZN, 'dc'); fit("DON'T\nCOME\nBAR", ...r, { m: 0.18 });
      const bw = (OC - C0) / 6, NSZ = (pz(ZN) - pz(ZT)) * 0.42;   /* every number the same height, the words narrowed to fit, as on the felt */
      POINTS.forEach((n, i) => { const x0 = sx > 0 ? C0 + i * bw : OC - (i + 1) * bw;   /* read 4 5 SIX 8 NINE 10 from the players' side at both ends, as on a casino felt */
        r = box(a(x0), a(x0 + bw), ZT, ZN, 'place' + n); fit(n === 6 ? 'SIX' : n === 9 ? 'NINE' : String(n), ...r, { color: GOLD, m: 0.2, max: NSZ, sq: 0.5 }); });
    }
    { const x0 = -C0, x1 = C0, xm = 0, q = (x1 - x0) / 4;   /* the propositions, in front of the dealer */
      let r = box(x0, x1, -HW + 0.02, -0.45, 'any7', { fill: DARK }); fit('SEVEN   4 TO 1', ...r, { color: RED, m: 0.2 });
      diceBox(x0, xm, -0.45, -0.27, 'hard6', [3, 3], '9 TO 1'); diceBox(xm, x1, -0.45, -0.27, 'hard10', [5, 5], '7 TO 1');
      diceBox(x0, xm, -0.27, -0.09, 'hard8', [4, 4], '9 TO 1'); diceBox(xm, x1, -0.27, -0.09, 'hard4', [2, 2], '7 TO 1');
      [['three', [1, 2], '15 TO 1'], ['two', [1, 1], '30 TO 1'], ['twelve', [6, 6], '30 TO 1'], ['eleven', [5, 6], '15 TO 1']].forEach(([k, d, p], i) => diceBox(x0 + i * q, x0 + (i + 1) * q, -0.09, 0.11, k, d, p));
      r = box(x0, x1, 0.11, 0.21, 'anycraps', { fill: DARK }); fit('ANY 2 · 3 · 12   7 TO 1', ...r, { color: RED, m: 0.2 });
      g.globalAlpha = 0.5; fit('THE SALTMERE\nLINKS', px(x0), pz(0.26), px(x1) - px(x0), pz(0.52) - pz(0.26), { m: 0.12 }); g.globalAlpha = 1;
    }
    const tex = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(BED_L, BED_W), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 })   /* lit from the lantern above, day or night */); felt.rotation.x = -Math.PI / 2; felt.position.y = BED_Y; table.add(felt);
    felt.userData.tb = { act: 'felt' };
    const body = new THREE.Mesh(new THREE.BoxGeometry(BED_L + 2 * RAIL_W, BED_Y + WALL_H, BED_W + 2 * RAIL_W), new THREE.MeshBasicMaterial({ visible: false })); body.position.y = (BED_Y + WALL_H) / 2; group.add(body);

    { /* a lantern over the felt (the operator: the tables read at night too): its glass glows, no light of its own (cheap on phones) */
      const lan = new THREE.Group(); lan.name = 'lantern'; lan.position.set(0, 2.1, 0); table.add(lan);   /* (the scene hangs the room's light in it) */
      lan.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd28a })));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.09, 4), new THREE.MeshLambertMaterial({ color: 0x2a2016 })); cap.position.y = 0.14; cap.rotation.y = Math.PI / 4; lan.add(cap);
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x2a2016 })); ch.position.y = 0.43; lan.add(ch); }
    if (kit.wrap) kit.wrap(table);
    function areaAt(x, z) {   /* bed metres -> the key; the propositions first (they lie over nothing else) */
      if (Math.abs(x) > HL || Math.abs(z) > HW) return null;
      for (const a of AREAS) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return a.key;
      return null;
    }
    const centre = (key, near) => { const L = AREAS.filter(a => a.key === key); if (!L.length) return null;
      let a = L[0]; if (near != null) a = L.reduce((b, c) => Math.abs((c.x0 + c.x1) / 2 - near) < Math.abs((b.x0 + b.x1) / 2 - near) ? c : b);
      return [(a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2, a]; };
    const main = (key, x) => {   /* a line bet's long strip at the end of x (not the strip round the end of the table) */
      const L = AREAS.filter(a => a.key === key && (a.x0 + a.x1) / 2 * x >= 0); if (!L.length) return centre(key, x);
      const a = L.reduce((b, c) => (c.x1 - c.x0) > (b.x1 - b.x0) ? c : b); return [(a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2, a]; };
    /* ---- the puck: OFF in the Don't Come bar, ON on the point's box */
    const puckTex = on => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = on ? '#f2ead8' : '#141414'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
      x.fillStyle = on ? '#141414' : '#f2ead8'; x.font = 'bold 46px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(on ? 'ON' : 'OFF', 64, 66); const t = new THREE.CanvasTexture(c); return t; };
    const pON = puckTex(true), pOFF = puckTex(false), puckM = new THREE.MeshLambertMaterial({ map: pOFF });
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), [lam('#555'), puckM, lam('#555')]); table.add(puck);
    function setPuck(point) { const c = point ? centre('place' + point, HL) : centre('dc', HL); puckM.map = point ? pON : pOFF; puckM.needsUpdate = true; puck.position.set(c[0], BED_Y + 0.008, c[1] - 0.05); }
    setPuck(0);
    /* ---- GOLD on the felt: coin piles (the operator: a bigger wager, a bigger pile) with the amount over each */
    const coins = new THREE.Group(); table.add(coins);
    /* [Claude 2026-10-28] the operator: "Make one pile of coins for each player instead of scattered piles": a bet is ONE stack on its spot (taller for
       more GOLD, at most 12 coins), not up to 60 coins in stacks of 8 laid out in a ring that spilled over the boxes round it */
    const nCoins = n => n <= 5 ? n : Math.min(12, Math.round(5 + 1.2 * Math.sqrt(n - 5)));
    const stack = (grp, k, seed) => { for (let i = 0; i < k; i++) kit.coinPile(grp, 1, 1, 0, i * 0.0075, 0, seed + i * 0.7); };
    function label(n) { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'rgba(43,29,20,.85)'; x.fillRect(6, 10, 116, 44);
      x.fillStyle = '#ffe08a'; x.font = 'bold 34px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 33);
      const t = new THREE.CanvasTexture(c); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); sp.scale.set(0.09, 0.045, 1); sp.renderOrder = 5; return sp; }
    function pile(n, x, z, seed) { if (!(n > 0)) return; const grp = new THREE.Group(); grp.position.set(x, BED_Y, z); const k = nCoins(n); stack(grp, k, seed);
      const l = label(n); l.position.y = k * 0.0075 + 0.05; grp.add(l); coins.add(grp); }
    function clearCoins() { for (const c of coins.children.slice()) { c.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); coins.remove(c); } }
    function show(v) {
      clearCoins(); setPuck(v.point || 0);
      const LINE = { pass: 1, dp: 1, field: 1, come: 1, dc: 1 };
      let k = 0;
      for (const s in (v.felt || {})) {
        /* 2026-10-21: "Your bet needs to show up on the side of the table that you click on" - a bet lies at the end where it was
           tapped (the end of the player's spot for bets not tapped here: others', and come bets moved to their number) */
        const seat = v.felt[s], sx = v.spots && v.spots[s] != null ? v.spots[s] : 0, off = ((k++ % 6) - 2.5) * 0.035, sd = (v.sides || {})[s] || {};
        const at = key => sd[key] != null ? sd[key] : sx, endOf = x => (x < 0 ? -1 : 1) * HL * 0.6;   /* the middle of that end's half */
        for (const key in seat.bets || {}) {
          if (key === 'odds') { const ox = at('pass'), c = main('pass', ox); if (c) pile(seat.bets[key], c[0] + 0.12, c[1], 3); continue; }
          const two = AREAS.filter(a => a.key === key).length > 1, kx = at(key);
          const c = two ? (LINE[key] ? main(key, kx) : centre(key, endOf(kx))) : centre(key, null); if (!c) continue;
          const x = LINE[key] ? Math.max(c[2].x0 + 0.04, Math.min(c[2].x1 - 0.04, sd[key] != null ? kx : c[0])) : c[0] + off;
          pile(seat.bets[key], x, c[1] + (LINE[key] ? 0 : off * 0.6), k);
        }
        for (const c0 of seat.come || []) { const c = centre('place' + c0.n, endOf(at('come'))); if (c) { pile(c0.amt, c[0] + off, c[1] - 0.04, k); if (c0.odds) pile(c0.odds, c[0] + off + 0.03, c[1] - 0.02, k + 1); } }
        for (const c0 of seat.dcome || []) { const c = centre('place' + c0.n, endOf(at('dc'))); if (c) pile(c0.amt, c[0] + off, c[1] - 0.085, k); }
      }
    }
    /* ---- the dice: rounded red cubes with white pips; a recorded throw (dicethrows) played back, each die turned to the Bank's face */
    const dieM = new THREE.MeshLambertMaterial({ color: 0xc81e28 }), pipM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    function die() {
      const outer = new THREE.Group(), inner = new THREE.Group(); outer.add(inner);
      inner.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dieM));
      const pg = new THREE.CircleGeometry(0.09, 10);
      for (const f of [1, 2, 3, 4, 5, 6]) { const ax = new THREE.Vector3(...FACE_AXIS[f]), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax);
        for (const [u, v] of PIPS[f]) { const p = new THREE.Mesh(pg, pipM); p.position.set(u * 0.25, v * 0.25, 0.502).applyQuaternion(q); p.quaternion.copy(q); inner.add(p); } }
      outer.scale.setScalar(DIE); table.add(outer); return { outer, inner };
    }
    const dice = [die(), die()];
    function rest() { dice.forEach((d, i) => { d.outer.position.set(HL - 0.18, BED_Y + DIE / 2, HW - 0.2 + i * 0.07); d.outer.quaternion.identity(); d.inner.quaternion.identity(); }); }
    rest();
    let anim = null;
    function roll(want, k, done) {
      const TH = (G.ASH3D && G.ASH3D.get && G.ASH3D.get('dicethrows')) || null;
      if (!TH || !TH.THROWS.length) { dice.forEach((d, i) => { d.outer.position.set(-0.3 + i * 0.12, BED_Y + DIE / 2, 0); d.inner.quaternion.setFromUnitVectors(new THREE.Vector3(...FACE_AXIS[want[i]]), new THREE.Vector3(0, 1, 0)); }); if (done) done(); return; }
      const t = TH.THROWS[Math.abs(k | 0) % TH.THROWS.length];
      dice.forEach((d, i) => d.inner.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...FACE_AXIS[want[i]]), new THREE.Vector3(...FACE_AXIS[t.up[i]]))));
      anim = { t, fps: TH.FPS, at: 0, done, die: TH.DIE || 0.032, total: (want[0] | 0) + (want[1] | 0) };   /* the size the throws were baked with */
      gath = null; stick.visible = false;
    }
    /* [Claude 2026-10-22] the operator: "After the craps dice have settled the dealer should collect them with a stick so that the mini view can read the
       dice total": a moment after they stop, the stickman's hooked stick reaches out from the pit side, draws both dice side by side to the middle
       just inside the rail in front of them, and goes back; the corner view follows and then shows the pair, faces up, with the total */
    const stickM = new THREE.MeshLambertMaterial({ color: 0x7a4f2a }), stick = new THREE.Group(), shaftG = new THREE.CylinderGeometry(0.0055, 0.0055, 1, 6);
    shaftG.rotateX(Math.PI / 2); shaftG.translate(0, 0, 0.5);
    const shaft = new THREE.Mesh(shaftG, stickM), hook = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.01), stickM);
    stick.add(shaft); table.add(stick); table.add(hook); stick.visible = hook.visible = false;
    const HAND = new THREE.Vector3(0.12, BED_Y + 0.3, -(HW + RAIL_W + 0.02)), GZ = -HW + 0.13, _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3();
    let gath = null;
    const ease = u => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
    function stickTo(tip) { stick.position.copy(HAND); stick.lookAt(_a.copy(tip).applyMatrix4(table.matrixWorld)); stick.scale.set(1, 1, HAND.distanceTo(tip)); hook.position.copy(tip); hook.rotation.set(0, Math.atan2(tip.x - HAND.x, tip.z - HAND.z) + Math.PI / 2, 0); }
    function gather(dt) {
      const g = gath; if (!g) return; g.u += dt;
      const P0 = 0.6, P1 = 1.15, P2 = 2.15, P3 = 2.65, mid = _t.copy(g.from[0]).add(g.from[1]).multiplyScalar(0.5);
      const behind = _b.set(mid.x, BED_Y + 0.006, mid.z + 0.06);   /* the hook beyond the dice, on the far side from the dealer */
      if (g.u < P0) { stick.visible = hook.visible = false; return; }
      stick.visible = hook.visible = true; table.updateMatrixWorld(true);
      if (g.u < P1) { const k = ease((g.u - P0) / (P1 - P0)); stickTo(_a.set(0, 0, 0).lerpVectors(new THREE.Vector3(HAND.x, BED_Y + 0.05, -HW + 0.05), behind, k).clone()); return; }
      if (g.u < P2) { const k = ease((g.u - P1) / (P2 - P1));
        dice.forEach((d, i) => d.outer.position.lerpVectors(g.from[i], g.to[i], k));
        stickTo(new THREE.Vector3(0, 0, 0).lerpVectors(behind, new THREE.Vector3(0, BED_Y + 0.006, GZ + 0.06), k)); return; }
      if (g.u < P3) { const k = ease((g.u - P2) / (P3 - P2)); dice.forEach((d, i) => d.outer.position.copy(g.to[i])); stickTo(new THREE.Vector3(0, 0, 0).lerpVectors(new THREE.Vector3(0, BED_Y + 0.006, GZ + 0.06), new THREE.Vector3(HAND.x, BED_Y + 0.05, -HW + 0.02), k)); return; }
      stick.visible = hook.visible = false; g.done = true; hold = Math.max(hold, 3);
    }
    function update(dt) {
      if (gath && !gath.done) gather(dt || 0.016);
      if (!anim) return;
      anim.at += dt; const T = anim.t, fi = Math.min(T.n - 1, Math.floor(anim.at * anim.fps)), q = new THREE.Quaternion();
      for (let i = 0; i < 2; i++) { const o = (fi * 2 + i) * 7, f = T.f; dice[i].outer.position.set(f[o] / 1000, f[o + 1] / 1000 + (DIE - anim.die) / 2, f[o + 2] / 1000); q.set(f[o + 3] / 1000, f[o + 4] / 1000, f[o + 5] / 1000, f[o + 6] / 1000).normalize(); dice[i].outer.quaternion.copy(q); }
      if (fi >= T.n - 1) { const d = anim.done, tot = anim.total; anim = null; hold = 3.6;
        const y = dice[0].outer.position.y, from = dice.map(x => x.outer.position.clone());
        const to = from[0].x <= from[1].x ? [new THREE.Vector3(-0.036, y, GZ), new THREE.Vector3(0.036, y, GZ)] : [new THREE.Vector3(0.036, y, GZ), new THREE.Vector3(-0.036, y, GZ)];
        gath = { u: 0, from, to, total: tot };
        if (d) d(); }
    }
    let hold = 0; const _f = new THREE.Vector3();
    function focus(dt) {   /* the corner view (2026-10-21: "a mini view isometric view of ... the dice rolling"): where the dice are, while they roll and a moment after */
      if (!anim) { if (!gath || gath.done) hold -= dt || 0; if (hold <= 0) return null; }
      _f.copy(dice[0].outer.position).add(dice[1].outer.position).multiplyScalar(0.5); return { p: table.localToWorld(_f.clone()), r: gath && gath.done ? 0.075 : Math.max(0.16, dice[0].outer.position.distanceTo(dice[1].outer.position) / 2 + 0.1), label: gath && gath.done ? String(gath.total) : null };   /* both dice in the square, as close as that allows; once the stick has drawn them in, their total */
    }
    return { group, body, hot: [felt], felt, areaAt, show, roll, rest, update, focus, _gath: () => gath && { u: +gath.u.toFixed(2), done: !!gath.done, total: gath.total, stick: stick.visible, dice: dice.map(d => [+d.outer.position.x.toFixed(3), +d.outer.position.z.toFixed(3)]) }, rail: railRect(HL + RAIL_W + 0.03, HW + RAIL_W + 0.03), dealerAt: [0, -(HW + RAIL_W + 0.03 + 0.16)],   /* the stickman, mid-table on the pit side */ eyeY: 1.55, bedY: BED_Y, HL, HW, game: 'dice', half: C0 + 0.02 };   /* half: the two ends are one layout twice - the top-down view shows your end and the propositions (|x| < C0) */
  }
  const API = { build, S, BED_Y };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('dicetable', { api: 1, v: 1, needs: {} }, () => API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
