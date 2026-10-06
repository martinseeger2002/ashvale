/* ASHVALE worldgen part: geometry and deterministic noise (module wg_geo, api 1). Pure maths, no three.js, no DOM, no
   clock, no Math.random; only + - * / sqrt floor and Math.imul decide anything, so results are bit-identical everywhere.
   Used by worldgen.js (the orchestrator), which calls attach(ctx) with ctx.G = a globe from AshGlobe.createGlobe.

   Exports: hashStr, mix32, hash3, u01, vnoise, fbm, sstep, clamp01, csin, ccos (turn-fraction sin/cos by polynomial)
   attach(ctx) adds to ctx:
     R, SP (cell spacing m), EDGE (face edge m), HGT (face height m), IV (icosahedron), FC (face corner ids), FQ (planar
     corners, 6 per face), ADJ (face across edge opposite corner k: ADJ[f*3+k]), XF (rigid maps f -> ADJ, 4 per edge)
     baryInto(f, x, y, out3)          barycentric of a planar point in face f's frame
     foldInto(f, x, y, out6)          undo the unfolding: [trueFace, x, y, b0, b1, b2]
     bary2sphere(f, b0, b1, b2, out3) the globe's projection (weights b - 0.25 b^3, normalised)
     nearest(x, y, z)                 nearest cell centre (downhill walk; warm start, exact answer)
     cornerDist(ux, uy, uz)           metres (chord) to the nearest of the 12 corners
     coreDistU(ux, uy, uz)            metres outside the reserved (core) land; 0 inside it
     xform(f, g)                      [c, s, tx, ty] maps f's plane into g's (g a neighbour) or null */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1 };
  function hashStr(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mix32(a) { a = Math.imul(a ^ (a >>> 16), 0x7feb352d); a = Math.imul(a ^ (a >>> 15), 0x846ca68b); return (a ^ (a >>> 16)) >>> 0; }
  function lat3(ix, iy, iz, s) { return mix32((Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ Math.imul(iz, 0xcb1ab31f) ^ s) >>> 0) / 4294967296; }
  function hash3(a, b, c) { return mix32((Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(mix32(b | 0), 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0); }
  const u01 = v => v / 4294967296;
  function vnoise(x, y, z, s) {
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const tx = x - fx, ty = y - fy, tz = z - fz;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty), uz = tz * tz * (3 - 2 * tz);
    const a = lat3(fx, fy, fz, s), b = lat3(fx + 1, fy, fz, s), c = lat3(fx, fy + 1, fz, s), d = lat3(fx + 1, fy + 1, fz, s);
    const e = lat3(fx, fy, fz + 1, s), f = lat3(fx + 1, fy, fz + 1, s), g = lat3(fx, fy + 1, fz + 1, s), h = lat3(fx + 1, fy + 1, fz + 1, s);
    const ab = a + (b - a) * ux, cd = c + (d - c) * ux, ef = e + (f - e) * ux, gh = g + (h - g) * ux;
    const l0 = ab + (cd - ab) * uy, l1 = ef + (gh - ef) * uy;
    return l0 + (l1 - l0) * uz;
  }
  /* fractal value noise on metres (freq in 1/m) */
  function fbm(x, y, z, s, freq, oct) {
    let sum = 0, amp = 1, tot = 0, f = freq;
    for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, z * f, (s + Math.imul(o, 0x9e3779b9)) >>> 0); tot += amp; amp *= 0.5; f *= 2.03; }
    return sum / tot;
  }
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  function sstep(a, b, v) { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
  function csin(a) { a = a - Math.floor(a); const x = (a < 0.5 ? a : a - 1) * 2 * 3.141592653589793; const x2 = x * x; return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156)))))); }
  function ccos(a) { return csin(a + 0.25); }

  function attach(ctx) {
    const G = ctx.G, AG = ctx.AshGlobe;
    const R = G.radius_m, EDGE = G.faceEdge_m, HGT = EDGE * Math.sqrt(3) / 2;
    const P = G.raw.centres, NB = G.raw.neighbours, DEG = G.raw.degree, CL = G.classes();
    const IV = AG.icosahedron(), K_WARP = 0.25;   /* the globe's projection constant (globe.js K_WARP); tested */
    const FC = [], FQ = new Float64Array(120), FDET = new Float64Array(20);
    for (let f = 0; f < 20; f++) {
      FC.push(G.faceCorners(f));
      const q = G.facePlanarCorners(f);
      for (let k = 0; k < 3; k++) { FQ[f * 6 + k * 2] = q[k][0]; FQ[f * 6 + k * 2 + 1] = q[k][1]; }
      FDET[f] = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]);
    }
    const ADJ = new Int8Array(60).fill(-1), XF = new Float64Array(240);
    for (let f = 0; f < 20; f++) for (let k = 0; k < 3; k++) {
      const ka = (k + 1) % 3, kb = (k + 2) % 3, a = FC[f][ka], b = FC[f][kb];
      for (let g = 0; g < 20; g++) {
        const ia = FC[g].indexOf(a), ib = FC[g].indexOf(b);
        if (g === f || ia < 0 || ib < 0) continue;
        ADJ[f * 3 + k] = g;
        const pax = FQ[f * 6 + ka * 2], pay = FQ[f * 6 + ka * 2 + 1], ux = FQ[f * 6 + kb * 2] - pax, uy = FQ[f * 6 + kb * 2 + 1] - pay;
        const qax = FQ[g * 6 + ia * 2], qay = FQ[g * 6 + ia * 2 + 1], vx = FQ[g * 6 + ib * 2] - qax, vy = FQ[g * 6 + ib * 2 + 1] - qay;
        const L2 = ux * ux + uy * uy, c = (ux * vx + uy * vy) / L2, s = (ux * vy - uy * vx) / L2, o = (f * 3 + k) * 4;
        XF[o] = c; XF[o + 1] = s; XF[o + 2] = qax - (c * pax - s * pay); XF[o + 3] = qay - (s * pax + c * pay);
      }
    }
    function baryInto(f, x, y, out) {
      const o = f * 6, x0 = FQ[o], y0 = FQ[o + 1], dx = x - x0, dy = y - y0;
      const b1 = (dx * (FQ[o + 5] - y0) - dy * (FQ[o + 4] - x0)) / FDET[f], b2 = ((FQ[o + 2] - x0) * dy - (FQ[o + 3] - y0) * dx) / FDET[f];
      out[0] = 1 - b1 - b2; out[1] = b1; out[2] = b2;
      return out;
    }
    function foldInto(f, x, y, out) {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let it = 0; it < 6; it++) {
        const o = f * 6, x0 = FQ[o], y0 = FQ[o + 1], dx = x - x0, dy = y - y0;
        b1 = (dx * (FQ[o + 5] - y0) - dy * (FQ[o + 4] - x0)) / FDET[f];
        b2 = ((FQ[o + 2] - x0) * dy - (FQ[o + 3] - y0) * dx) / FDET[f];
        b0 = 1 - b1 - b2;
        let k = 0, m = b0; if (b1 < m) { m = b1; k = 1; } if (b2 < m) { m = b2; k = 2; }
        if (m >= 0 || it === 5) break;
        const e = (f * 3 + k) * 4, nx = XF[e] * x - XF[e + 1] * y + XF[e + 2], ny = XF[e + 1] * x + XF[e] * y + XF[e + 3];
        f = ADJ[f * 3 + k]; x = nx; y = ny;
      }
      out[0] = f; out[1] = x; out[2] = y; out[3] = b0; out[4] = b1; out[5] = b2;
      return out;
    }
    const wk = b => b - K_WARP * b * b * b;
    function bary2sphere(f, b0, b1, b2, out) {
      const A = IV[FC[f][0]], B = IV[FC[f][1]], C = IV[FC[f][2]], w0 = wk(b0), w1 = wk(b1), w2 = wk(b2);
      const x = w0 * A[0] + w1 * B[0] + w2 * C[0], y = w0 * A[1] + w1 * B[1] + w2 * C[1], z = w0 * A[2] + w1 * B[2] + w2 * C[2];
      const l = Math.sqrt(x * x + y * y + z * z);
      out[0] = x / l; out[1] = y / l; out[2] = z / l;
      return out;
    }
    /* downhill walk to the nearest centre: exact on the geodesic grid (ties by lower id, like globe.cellAt); the warm
       start only changes the speed, never the answer */
    let last = -1;
    function nearest(x, y, z) {
      let c = last >= 0 ? last : G.cellAt([x, y, z]);
      for (let guard = 0; guard < 4096; guard++) {
        let best = c, bq = P[c * 3] * x + P[c * 3 + 1] * y + P[c * 3 + 2] * z;
        for (let k = 0, d = DEG[c]; k < d; k++) { const m = NB[c * 6 + k], q = P[m * 3] * x + P[m * 3 + 1] * y + P[m * 3 + 2] * z; if (q > bq || (q === bq && m < best)) { bq = q; best = m; } }
        if (best === c) break;
        c = best;
      }
      last = c;
      return c;
    }
    function cornerDist(ux, uy, uz) {
      let best = -2;
      for (let v = 0; v < 12; v++) { const q = IV[v][0] * ux + IV[v][1] * uy + IV[v][2] * uz; if (q > best) best = q; }
      return R * Math.sqrt(Math.max(0, 2 - 2 * best));
    }
    /* How far a point lies from the game's SETTLEMENTS - Ashvale and the harbour on its coast. The reserved land is a
       network spread over the whole globe now, so this is deliberately not the distance to the nearest reserved parcel:
       21 of those sit on all 20 faces, nothing on the map would be far from one, and the monster ladder, the ore sets
       and the fishing tables would flatten to the easiest rung everywhere. */
    const TOWNS = CL.coreHarbour >= 0 ? [CL.coreCenter, CL.coreHarbour] : [CL.coreCenter];
    const TN = TOWNS.map((c) => { const k = c * 3; return [P[k], P[k + 1], P[k + 2]]; });
    function coreDistU(ux, uy, uz) {
      let best = -2;
      for (let k = 0; k < TN.length; k++) { const q = ux * TN[k][0] + uy * TN[k][1] + uz * TN[k][2]; if (q > best) best = q; }
      return R * Math.sqrt(Math.max(0, 2 - 2 * best));
    }
    function xform(f, g) {
      for (let k = 0; k < 3; k++) if (ADJ[f * 3 + k] === g) { const o = (f * 3 + k) * 4; return [XF[o], XF[o + 1], XF[o + 2], XF[o + 3]]; }
      return null;
    }
    Object.assign(ctx, { R, SP: G.spacing_m, EDGE, HGT, IV, FC, FQ, ADJ, XF, P, NB, DEG, CODES: CL.codes, CL, baryInto, foldInto, bary2sphere, nearest, cornerDist, coreDistU, xform });
    return ctx;
  }

  const api = { api: 1, hashStr, mix32, hash3, u01, vnoise, fbm, sstep, clamp01, csin, ccos, attach };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('wg_geo', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
