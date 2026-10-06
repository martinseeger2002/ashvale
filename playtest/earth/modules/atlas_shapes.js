/* ASHVALE Atlas: low-poly shape library (module atlas_shapes, api 1). Pure arrays (no three.js, no DOM): every prop the
   Atlas draws on the ground, in the game's flat-shaded style (src/scene.js shapes, slimmed for streaming). A shape is
   {p: Float32Array xyz, c: Uint8Array rgb, t: Uint8Array tint mask (1 = takes the per-instance tint), i: Uint16Array},
   faces wound counter-clockwise seen from outside (front faces), origin at the foot, +y up.
     const S = atlas_shapes.create(palette)   palette = the atlas_palette data module
     S.get(name)          tree_T tree_P tree_O tree_W tree_M tree_Y rock ore_R..ore_A stone ruin seam tuft fern flower
                          mushroom tent campfire ripple reed well
     S.box(...) / S.house(obj) build one-off shapes (buildings from set-piece objects)
     S.tris(name)         triangle count (budgets) */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1 };
  function rgb(h) { const v = parseInt(String(h).replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }

  function create(PAL) {
    /* a shape under construction: P positions, C colours, M tint mask, I indices */
    function Shape() { return { P: [], C: [], M: [], I: [] }; }
    function vert(S, x, y, z, col, tint) { S.P.push(x, y, z); S.C.push(col[0], col[1], col[2]); S.M.push(tint ? 1 : 0); return S.P.length / 3 - 1; }
    /* a triangle, flipped if needed so its normal points away from the reference point (cx, cy, cz) */
    function tri(S, a, b, c, cx, cy, cz) {
      const P = S.P, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (ax + P[b * 3] + P[c * 3]) / 3 - cx, my = (ay + P[b * 3 + 1] + P[c * 3 + 1]) / 3 - cy, mz = (az + P[b * 3 + 2] + P[c * 3 + 2]) / 3 - cz;
      if (nx * mx + ny * my + nz * mz < 0) S.I.push(a, c, b); else S.I.push(a, b, c);
    }
    /* open cylinder / frustum around the y axis (seg sides), optional top cap */
    function cyl(S, seg, rt, rb, h, x, y, z, col, tint, cap, a0) {
      const base = S.P.length / 3;
      for (let k = 0; k < seg; k++) { const a = (k / seg + (a0 || 0)) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); vert(S, x + s * rb, y, z + c * rb, col, tint); vert(S, x + s * rt, y + h, z + c * rt, col, tint); }
      for (let k = 0; k < seg; k++) {
        const b0 = base + k * 2, b1 = base + ((k + 1) % seg) * 2, my = y + h / 2;
        tri(S, b0, b1, b0 + 1, x, my, z); tri(S, b1, b1 + 1, b0 + 1, x, my, z);
      }
      if (cap && rt > 0) { const t = vert(S, x, y + h, z, col, tint); for (let k = 0; k < seg; k++) tri(S, t, base + k * 2 + 1, base + ((k + 1) % seg) * 2 + 1, x, y - 1, z); }
    }
    function cone(S, seg, r, h, x, y, z, col, tint, a0) {
      const base = S.P.length / 3, ap = vert(S, x, y + h, z, col, tint);
      for (let k = 0; k < seg; k++) { const a = (k / seg + (a0 || 0)) * Math.PI * 2; vert(S, x + Math.sin(a) * r, y, z + Math.cos(a) * r, col, tint); }
      for (let k = 0; k < seg; k++) tri(S, ap, base + 1 + k, base + 1 + (k + 1) % seg, x, y + h * 0.3, z);
    }
    const ICO = (function () {
      const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
      const l = Math.sqrt(1 + t * t);
      return { v: v.map(p => [p[0] / l, p[1] / l, p[2] / l]), f: [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]] };
    })();
    function ico(S, r, x, y, z, sx, sy, sz, col, tint) {
      const base = S.P.length / 3;
      for (const p of ICO.v) vert(S, x + p[0] * r * sx, y + p[1] * r * sy, z + p[2] * r * sz, col, tint);
      for (const f of ICO.f) tri(S, base + f[0], base + f[1], base + f[2], x, y, z);
    }
    function octa(S, r, x, y, z, col) {
      const b = S.P.length / 3, d = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
      for (const q of d) vert(S, x + q[0], y + q[1] * 1.3, z + q[2], col, false);
      for (const [a, bb, c] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]]) tri(S, b + a, b + bb, b + c, x, y, z);
    }
    function box(S, w, h, d, x, y, z, col, tint, ry) {
      const b = S.P.length / 3, cr = Math.cos(ry || 0), sr = Math.sin(ry || 0);
      for (let k = 0; k < 8; k++) { const lx = (k & 1 ? 0.5 : -0.5) * w, ly = (k & 2 ? 1 : 0) * h, lz = (k & 4 ? 0.5 : -0.5) * d; vert(S, x + lx * cr + lz * sr, y + ly, z - lx * sr + lz * cr, col, tint); }
      for (const [a, bb, c, dd] of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) { tri(S, b + a, b + bb, b + c, x, y + h / 2, z); tri(S, b + a, b + c, b + dd, x, y + h / 2, z); }
    }
    /* a gable roof: triangular prism along x, footprint w x d, ridge height rh, on top of y */
    function roof(S, w, d, rh, x, y, z, col, along) {
      const b = S.P.length / 3, hw = (along ? w : d) / 2 + 0.3, hd = (along ? d : w) / 2 + 0.3;
      const pts = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, rh, 0], [hw, rh, 0]];
      for (const q of pts) { const lx = along ? q[0] : q[2], lz = along ? q[2] : q[0]; vert(S, x + lx, y + q[1], z + lz, col, false); }
      for (const [a, bb, c] of [[0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [0, 4, 3], [1, 2, 5]]) tri(S, b + a, b + bb, b + c, x, y + rh * 0.3, z);
    }
    function ring(S, ri, ro, seg, y, col) {
      const b = S.P.length / 3;
      for (let k = 0; k < seg; k++) { const a = k / seg * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); vert(S, s * ri, y, c * ri, col, false); vert(S, s * ro, y, c * ro, col, false); }
      for (let k = 0; k < seg; k++) { const a = b + k * 2, n = b + ((k + 1) % seg) * 2; tri(S, a, a + 1, n, 0, y - 1, 0); tri(S, n, a + 1, n + 1, 0, y - 1, 0); }
    }
    function done(S) { return { p: new Float32Array(S.P), c: new Uint8Array(S.C), t: new Uint8Array(S.M), i: new Uint16Array(S.I), tris: S.I.length / 3 }; }

    const col = k => rgb(PAL[k] || k);
    const T = PAL.trees, LIB = {};
    const tr = k => [rgb(T[k][0]), rgb(T[k][1])];
    /* trees: the game's silhouettes (scene.js treeKinds) with fewer faces: one crown blob or two cones, 5-sided trunks */
    { const [tc, cc] = tr('T'), S = Shape(); cyl(S, 4, 0.09, 0.14, 1.05, 0, 0, 0, tc); ico(S, 0.66, 0.06, 1.4, 0.03, 1, 1.05, 1, cc, 1); LIB.tree_T = done(S); }
    { const [tc, cc] = tr('P'), S = Shape(); cyl(S, 4, 0.07, 0.11, 0.8, 0, 0, 0, tc); cone(S, 6, 0.62, 1.05, 0, 0.47, 0, cc, 1); cone(S, 6, 0.42, 0.95, 0, 1.2, 0, cc, 1); LIB.tree_P = done(S); }
    { const [tc, cc] = tr('O'), S = Shape(); cyl(S, 4, 0.14, 0.22, 1.1, 0, 0, 0, tc); ico(S, 0.82, 0, 1.5, 0, 1.2, 0.85, 1.15, cc, 1); LIB.tree_O = done(S); }
    { const [tc, cc] = tr('W'), S = Shape(); cyl(S, 4, 0.1, 0.18, 1.15, 0, 0, 0, tc); ico(S, 0.66, 0, 1.42, 0, 1.15, 0.55, 1.15, cc, 1);
      for (const [dx, dz] of [[0.52, 0.16], [-0.45, 0.25], [0, -0.5]]) cone(S, 3, 0.17, -0.62, dx, 1.43, dz, cc, 1); LIB.tree_W = done(S); }
    { const [tc, cc] = tr('M'), S = Shape(); cyl(S, 4, 0.1, 0.16, 1.05, 0, 0, 0, tc); ico(S, 0.72, 0, 1.38, 0, 1, 0.95, 1, cc, 1); LIB.tree_M = done(S); }
    { const [tc, cc] = tr('Y'), S = Shape(); cyl(S, 4, 0.12, 0.2, 1.0, 0, 0, 0, tc); cone(S, 6, 0.6, 1.3, 0, 0.75, 0, cc, 1); cone(S, 6, 0.42, 1.05, 0, 1.6, 0, cc, 1); LIB.tree_Y = done(S); }
    /* far trees (drawn beyond Q.full instead of the full ones): one low blob or cone on a 3-sided trunk, same colours */
    for (const k of ['T', 'O', 'W', 'M']) { const [tc, cc] = tr(k), S = Shape(), big = k === 'O' ? 1.2 : 1; cyl(S, 3, 0.08, 0.14, 0.9, 0, 0, 0, tc); octa(S, 0.72 * big, 0, 1.45, 0, cc); for (let q = S.M.length - 6; q < S.M.length; q++) S.M[q] = 1; LIB['far_' + k] = done(S); }
    for (const k of ['P', 'Y']) { const [tc, cc] = tr(k), S = Shape(); cyl(S, 3, 0.07, 0.11, 0.6, 0, 0, 0, tc); cone(S, 5, 0.6, 1.9, 0, 0.45, 0, cc, 1); LIB['far_' + k] = done(S); }
    { const S = Shape(), c = col('boulder'); ico(S, 0.57, 0, 0.3, 0, 1.1, 0.75, 1, c, 1); ico(S, 0.35, 0.34, 0.19, 0.24, 1, 1, 1, rgb('#8a857a'), 1); LIB.rock = done(S); }
    for (const L in PAL.ore) { const S = Shape(); ico(S, 0.42, 0, 0.22, 0, 1.1, 0.75, 1, col('#7a7468'), 1); ico(S, 0.26, 0.25, 0.14, 0.18, 1, 1, 1, col('#8a857a'), 1); for (let k = 0; k < 4; k++) octa(S, 0.09, Math.cos(k * 1.7) * 0.28, 0.3 + (k % 2) * 0.12, Math.sin(k * 1.7) * 0.26, rgb(PAL.ore[L])); LIB['ore_' + L] = done(S); }
    { const S = Shape(); cyl(S, 4, 0.16, 0.24, 1.35, 0, 0, 0, col('stone'), 1, true, 0.125); LIB.stone = done(S); }
    { const S = Shape(); box(S, 0.95, 1, 0.5, 0, 0, 0, col('ruin'), 1); LIB.ruin = done(S); }
    { const S = Shape(); cyl(S, 4, 0.1, 0.16, 0.85, 0, 0, 0, col('seam'), 0, true, 0.125); LIB.seam = done(S); }
    { const S = Shape(), c = col('fence'); box(S, 0.12, 0.76, 0.12, 0, 0, 0, c); LIB.post = done(S); }
    { const S = Shape(), c = rgb('#8a6a40'); for (const y of [0.25, 0.55]) box(S, 1.0, 0.07, 0.05, 0.5, y, 0, c); LIB.rail = done(S); }
    { const S = Shape(); cone(S, 5, 0.12, 0.2, 0, 0, 0, rgb(PAL.tuft[0]), 1); LIB.tuft = done(S); }
    { const S = Shape(), c = rgb(PAL.tuft[1]); cone(S, 3, 0.09, 0.3, -0.07, 0, 0, c, 1); cone(S, 3, 0.09, 0.26, 0.08, 0, 0.05, c, 1); cone(S, 3, 0.08, 0.22, 0, 0, -0.08, c, 1); LIB.fern = done(S); }
    { const S = Shape(); cone(S, 3, 0.02, 0.17, 0, 0, 0, col('stem')); octa(S, 0.05, 0, 0.19, 0, rgb('#ffffff')); for (let k = S.C.length - 18; k < S.C.length; k++) S.M[Math.floor(k / 3)] = 1; LIB.flower = done(S); }
    { const S = Shape(), m = PAL.mushroom; cyl(S, 5, 0.04, 0.05, 0.1, 0, 0, 0, rgb(m[0])); cone(S, 6, 0.12, 0.08, 0, 0.09, 0, rgb(m[1])); LIB.mushroom = done(S); }
    { const S = Shape(); cone(S, 4, 1.25, 1.6, 0, 0, 0, rgb(PAL.tent[0]), 1, 0.125); box(S, 0.4, 0.8, 0.06, 0, 0, 0.86, rgb('#2a2015')); LIB.tent = done(S); }
    { const S = Shape(), lg = col('log'); for (let k = 0; k < 4; k++) box(S, 0.7, 0.1, 0.1, 0, 0.03, 0, lg, 0, k * Math.PI / 4); for (let k = 0; k < 6; k++) box(S, 0.16, 0.14, 0.16, Math.cos(k) * 0.45, 0, Math.sin(k) * 0.45, rgb('#6a6a6a'));
      cone(S, 6, 0.22, 0.6, 0, 0.05, 0, col('flame')); cone(S, 5, 0.11, 0.35, 0, 0.05, 0, col('ember')); LIB.campfire = done(S); }
    { const S = Shape(); ring(S, 0.2, 0.27, 10, 0.03, col('ripple')); const S2 = S; LIB.ripple = done(S2); }
    { const S = Shape(), c = col('reed'); for (let k = 0; k < 4; k++) cone(S, 3, 0.03, 0.7 + 0.15 * (k % 2), Math.cos(k * 1.9) * 0.15, 0, Math.sin(k * 1.9) * 0.15, c); LIB.reed = done(S); }
    { const S = Shape(); cyl(S, 10, 0.8, 0.88, 0.65, 0, 0, 0, col('well'), 0, true); for (const s of [-1, 1]) box(S, 0.1, 1.5, 0.1, s * 0.72, 0.15, 0, col('log')); cone(S, 4, 1.25, 0.6, 0, 1.55, 0, col('roof'), 0, 0.125); LIB.well = done(S); }

    /* a set-piece building (house / shop / smithy) from its object record: walls, plinth, door, gable roof */
    function house(o) {
      const S = Shape(), w = o.w, d = o.h, FL = Math.max(1, Math.min(4, o.floors | 0)), WH = 1.8 * FL, wall = rgb(o.wall || PAL.wall), rf = rgb(o.roof || PAL.roof);
      box(S, w + 0.2, 0.5, d + 0.2, 0, -0.3, 0, col('plinth'));
      box(S, w, WH, d, 0, 0.2, 0, wall);
      box(S, 0.8, 1.25, 0.06, 0, 0.2, d / 2 + 0.02, col('door'));
      for (let f = 0; f < FL; f++) for (const sx of [-1, 1]) box(S, 0.55, 0.5, 0.06, sx * w * 0.28, 1.0 + f * 1.8, d / 2 + 0.02, rgb('#2a3a4a'));
      const along = w >= d; roof(S, w, d, (along ? d : w) * 0.42 + 0.25, 0, WH + 0.2, 0, rf, along);
      return done(S);
    }
    function oneBox(w, h, d, c) { const S = Shape(); box(S, w, h, d, 0, 0, 0, rgb(c)); return done(S); }
    return { api: 1, get: n => LIB[n], tris: n => LIB[n] ? LIB[n].tris : 0, names: Object.keys(LIB), house, box: oneBox, rgb };
  }
  const api = { api: 1, create };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('atlas_shapes', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
