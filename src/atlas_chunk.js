/* ASHVALE Atlas: chunk builder (module atlas_chunk, api 1). Pure arrays, no three.js, no DOM: turns worldgen into the
   geometry of one 64 x 64 m ground chunk, in steps, so the Atlas can spread the work over frames (walking never waits).
     const B = atlas_chunk.create(W, shapes, palette)       W = worldgen instance, shapes = atlas_shapes.create(palette)
     const job = B.job(anchor, cx, cy)   chunk (cx, cy) of face `anchor`'s plane: planar [64cx, 64cx+64) x [64cy, 64cy+64)
     job.step()  -> true when finished (each step is a bounded piece: one lattice row, one 8 m band of tiles, ...)
     job.out     {pos Float32Array, col Uint8Array, idx Uint32Array, nTerrain, nLod0, nIdx (index counts), heights
                  Float32Array 33x33 (2 m grid, row = +y), lines Float32Array (parcel borders, xyz), tris, features, ms}
   Local coordinates of the output: x = planar x - 64cx, y = height, z = -(planar y - 64cy) (three.js: y up, z south).
   Ground colour = the four game tiles around each 2 m vertex (like scene.js blends tile colours at tile corners), tinted
   by class, sunk colours under water, rock and snow on the peaks. Props come from the tile letters (trees, boulders,
   ore, standing stones, tufts, ferns, flowers) and worldgen objects (houses, tents, campfires, fishing ripples).
   Index order: terrain + props always drawn (rocks, stones, buildings, camps) up to nLod0; then per 32 m quadrant
   (q = 0 west-south .. 3 east-north) its FAR trees (far[q]..far[q+1]: 40 % of the trees as 8-11 triangle shapes), then
   per quadrant its NEAR detail (quad[q]..quad[q+1]: every tree in full, tufts, ferns, flowers). Each quadrant draws
   either its far or its near range. */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1 };
  const SIZE = 64, SEG = 32, NV = (SEG + 1) * (SEG + 1);
  function h32(a, b, c) { let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return (h ^ (h >>> 15)) >>> 0; }
  const r01 = v => v / 4294967296;

  function create(W, S, PAL) {
    const rgb = S.rgb, TILE = {}, OREL = 'RNICGA';
    for (const k in PAL.tile) TILE[k] = rgb(PAL.tile[k]);
    const GRASS = TILE['.'], BED0 = rgb(PAL.bedShallow), BED1 = rgb(PAL.bedDeep), ROCK = rgb(PAL.rock), ROCKD = rgb(PAL.rockDark), SNOW = rgb(PAL.snow);
    const CT = PAL.classTint, TC = [CT.creator, CT.core, CT.wild, CT.creator, CT.creator];
    const TREE = { T: 'tree_T', P: 'tree_P', O: 'tree_O', W: 'tree_W', M: 'tree_M', Y: 'tree_Y', U: 'tree_U' };
    const FLW = PAL.flower.map(rgb), G = W.G, CEN = G.raw.centres, BORDER = rgb(PAL.border);

    function job(anchor, cx, cy) {
      const x0 = cx * SIZE, y0 = cy * SIZE, li = cx * SEG, lj = cy * SEG;
      const t0 = Date.now();
      const heights = new Float32Array(NV), tcol = new Uint8Array(NV * 3), pid = new Int32Array(NV), sph = new Float64Array(NV * 3);
      const feats = [], U = [0, 0, 0];
      let phase = 0, row = 0, band = 0;
      const J = { anchor, cx, cy, key: anchor + ':' + cx + ':' + cy, out: null, steps: 0 };
      /* f = [shape, x, z(local), y, scale, scaleY, rot, tint r g b, lod] */
      function add(shape, lx, lz, y, s, sy, rot, tr, tg, tb, lod) { feats.push(shape, lx, lz, y, s, sy, rot, tr, tg, tb, lod); }
      function vertexRow(j) {
        for (let i = 0; i <= SEG; i++) {
          const v = W.lattice(anchor, li + i, lj + j), k = j * (SEG + 1) + i, X = x0 + 2 * i, Y = y0 + 2 * j, h = v[0];
          heights[k] = h;
          let r = 0, g = 0, b = 0;
          for (let q = 0; q < 4; q++) { const c = TILE[W.tileAt(anchor, X - 1 + (q & 1), -Y - 1 + (q >> 1))] || GRASS; r += c[0]; g += c[1]; b += c[2]; }
          r /= 4; g /= 4; b /= 4;
          let tr = 0, tg = 0, tb = 0;
          for (let c = 0; c < 5; c++) { tr += v[6 + c] * TC[c][0]; tg += v[6 + c] * TC[c][1]; tb += v[6 + c] * TC[c][2]; }
          r *= tr; g *= tg; b *= tb;
          if (v[16] > 3.5) { r = 0xdc; g = 0xea; b = 0xf2; }   /* ice */
          else if (v[16] > 0.5) { const wc = rgb(PAL.water); r = wc[0] * 0.92; g = wc[1] * 0.95; b = wc[2]; }   /* a river, creek or lake: water at its own level */
          else if (h < 0.05) { const d = Math.min(1, Math.max(0, (0.05 - h) / 3)), bed = [BED0[0] + (BED1[0] - BED0[0]) * d, BED0[1] + (BED1[1] - BED0[1]) * d, BED0[2] + (BED1[2] - BED0[2]) * d], m = Math.min(1, (0.05 - h) * 3); r += (bed[0] - r) * m; g += (bed[1] - g) * m; b += (bed[2] - b) * m; }
          const pk = v[3];
          if (pk > 0.05) {
            const sn = Math.max(0, Math.min(1, (h - PAL.snowFrom) / 12)), rk = (h7(X, Y) < 0.5 ? ROCK : ROCKD), m = Math.min(1, pk * 1.6);
            const cr = rk[0] + (SNOW[0] - rk[0]) * sn, cg = rk[1] + (SNOW[1] - rk[1]) * sn, cb = rk[2] + (SNOW[2] - rk[2]) * sn;
            r += (cr - r) * m; g += (cg - g) * m; b += (cb - b) * m;
          }
          /* a real mountain (2026-10-03): above the tree line the ground turns to bare alpine rock, and only the
             high tops carry snow, in patches with a ragged edge */
          if (PAL.alpine && h > PAL.alpine[0]) {
            const m = Math.min(1, (h - PAL.alpine[0]) / (PAL.alpine[1] - PAL.alpine[0])) * 0.85, rk = h7(X, Y) < 0.5 ? ROCK : ROCKD;
            r += (rk[0] - r) * m; g += (rk[1] - g) * m; b += (rk[2] - b) * m;
          }
          if (PAL.snowLine) {
            const edge = PAL.snowLine + (r01(h32(X >> 3, Y >> 3, 0x5a0)) - 0.5) * 14 + (r01(h32(X >> 1, Y >> 1, 0x5a1)) - 0.5) * 4;
            if (h > edge - 3) { const m = Math.min(1, (h - edge + 3) / 6); r += (SNOW[0] - r) * m; g += (SNOW[1] - g) * m; b += (SNOW[2] - b) * m; }
          }
          const jt = 0.92 + 0.16 * r01(h32(li + i, lj + j, anchor));
          tcol[k * 3] = Math.min(255, r * jt); tcol[k * 3 + 1] = Math.min(255, g * jt); tcol[k * 3 + 2] = Math.min(255, b * jt);
          pid[k] = W.parcelAt(anchor, X, Y);
          W.toSphere(anchor, X, Y, U); sph[k * 3] = U[0]; sph[k * 3 + 1] = U[1]; sph[k * 3 + 2] = U[2];
        }
      }
      function h7(a, b) { return r01(h32(Math.floor(a), Math.floor(b), 7)); }
      const FLD = new Float64Array(17);
      function hAt(ax, ay) { return W.field(anchor, ax, ay, FLD)[0]; }
      function tileBand(b) {
        const ya = y0 + b * 8, yb = ya + 8;
        W.forTiles(anchor, x0, ya, x0 + SIZE, yb, (L, ax, ay, f, gx, gy) => {
          const hv = h32(gx, gy, f * 977 + 13), r = r01(hv), r2 = r01(h32(hv, 1, 2)), r3 = r01(h32(hv, 3, 4));
          const lx = ax - x0, lz = -(ay - y0);
          if (TREE[L]) {
            const jx = (r - 0.5) * 0.3, jz = (r2 - 0.5) * 0.3, s = 0.85 + r3 * 0.4, y = hAt(ax + jx, ay - jz) - 0.05, t = 0.94 + 0.12 * r2;
            add(TREE[L], lx + jx, lz + jz, y, s, s * (0.9 + 0.3 * r), r * 6.283, 255 * t, 255 * (0.96 + 0.08 * r3), 255 * t, 1);
            if (r3 < 0.4) add('far_' + L, lx + jx, lz + jz, y, s * 1.1, s * (0.9 + 0.3 * r), r * 6.283, 255 * t, 255 * (0.96 + 0.08 * r3), 255 * t, 2);
          } else if (L === 'r') add('rock', lx, lz, hAt(ax, ay), 1, 1, r * 6.283, 255, 255, 255, 0);
          else if (OREL.indexOf(L) >= 0) add('ore_' + L, lx, lz, hAt(ax, ay), 1, 1, r * 6.283, 255, 255, 255, 0);
          else if (L === 'K') {
            const f2 = W.field(anchor, ax, ay, FLD);
            if (f2[12] < 2.5) add('seam', lx, lz, f2[0] - 0.02, 1, 1, r * 6.283, 255, 255, 255, 0);
            else if (f2[5] > 0.2 && r2 < 0.5) add('ruin', lx, lz, f2[0] - 0.05, 1, 0.5 + 1.2 * r * r, Math.round(r3 * 4) * 1.5708, 255 * (0.9 + 0.1 * r), 255 * (0.9 + 0.1 * r), 255 * (0.9 + 0.1 * r), 0);
            else add('stone', lx, lz, f2[0] - 0.05, 1 + 0.3 * r, 0.8 + 0.6 * r2, r3 * 6.283, 255 * (0.9 + 0.1 * r), 255 * (0.9 + 0.1 * r), 255 * (0.9 + 0.1 * r), 0);
          } else if (L === '.') { if (r < 0.28) add('tuft', lx + (r2 - 0.5) * 0.6, lz + (r3 - 0.5) * 0.6, hAt(ax, ay), 0.9 + r3 * 0.6, 0.9 + r * 0.6, r * 9, 255 * (0.92 + 0.16 * r2), 255, 255 * (0.92 + 0.16 * r2), 1); }
          else if (L === ',') { if (r < 0.22) add('fern', lx + (r2 - 0.5) * 0.5, lz + (r3 - 0.5) * 0.5, hAt(ax, ay), 1, 1, r * 9, 255, 255, 255, 1); else if (r > 0.975) add('mushroom', lx, lz, hAt(ax, ay), 1, 1, r2 * 6, 255, 255, 255, 1); }
          else if (L === 'f') { for (let k = 0; k < 3; k++) { const q = r01(h32(hv, k, 9)), q2 = r01(h32(hv, k, 11)), c = FLW[h32(hv, k, 13) % FLW.length]; add('flower', lx - 0.3 + q * 0.6, lz - 0.3 + q2 * 0.6, hAt(ax, ay), 1, 1, q * 6, c[0], c[1], c[2], 1); } }
          else if (L === 'F') {
            const y = hAt(ax, ay); add('post', lx, lz, y, 1, 1, 0, 255, 255, 255, 0);
            if (f === anchor) { if (W.tileAt(f, gx + 1, gy) === 'F') add('rail', lx, lz, y, 1, 1, 0, 255, 255, 255, 0); if (W.tileAt(f, gx, gy + 1) === 'F') add('rail', lx, lz, y, 1, 1, -Math.PI / 2, 255, 255, 255, 0); }
          }
          else if (L === '~') { if (r < 0.05) { const f2 = W.field(anchor, ax, ay, FLD); if (f2[0] > -0.7 && f2[4] > 0.1) add('reed', lx, lz, f2[0], 1, 1, r2 * 6, 255, 255, 255, 1); } }
        });
      }
      function objects() {
        for (const o of W.objectsIn(anchor, x0, y0, x0 + SIZE, y0 + SIZE)) {
          const lx = o.x - x0, lz = -(o.y - y0), y = hAt(o.x, o.y), rot = Math.atan2(o.s, o.c);
          if (o.k === 'house' || o.k === 'shop' || o.k === 'smithy') add({ house: o }, lx, lz, y, 1, 1, rot, 255, 255, 255, 0);
          else if (o.k === 'tent') add('tent', lx, lz, y, 1, 1, rot, 255, 255, 255, 0);
          else if (o.k === 'campfire') add('campfire', lx, lz, y, 1, 1, rot, 255, 255, 255, 0);
          else if (o.k === 'well') add('well', lx, lz, y, 1, 1, rot, 255, 255, 255, 0);
          else if ((o.k === 'cwall' || o.k === 'ctower' || o.k === 'ckeep' || o.k === 'cgate') && S.castle) add({ castle: o }, lx, lz, y, 1, 1, rot, 255, 255, 255, 0);
          else if (o.k === 'fish') add('ripple', lx, lz, 0.01, 1.6, 1, 0, 255, 255, 255, 0);
        }
      }
      let lines = null;
      function borders() {
        const L = [];
        const cross = (ka, kb) => {
          const a = pid[ka], b = pid[kb]; if (a === b) return null;
          const dx = CEN[a * 3] - CEN[b * 3], dy = CEN[a * 3 + 1] - CEN[b * 3 + 1], dz = CEN[a * 3 + 2] - CEN[b * 3 + 2];
          const g0 = sph[ka * 3] * dx + sph[ka * 3 + 1] * dy + sph[ka * 3 + 2] * dz, g1 = sph[kb * 3] * dx + sph[kb * 3 + 1] * dy + sph[kb * 3 + 2] * dz;
          return Math.max(0, Math.min(1, g0 / (g0 - g1)));
        };
        const pts = [];
        for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
          const a = j * (SEG + 1) + i, b = a + 1, c = a + SEG + 1, d = c + 1;
          pts.length = 0;
          const e = [[a, b, 0, 0, 1, 0], [c, d, 0, 1, 1, 1], [a, c, 0, 0, 0, 1], [b, d, 1, 0, 1, 1]];
          for (const [p, q, u0, v0, u1, v1] of e) {
            const t = cross(p, q); if (t === null) continue;
            const u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t, h = heights[p] + (heights[q] - heights[p]) * t;
            pts.push((i + u) * 2, Math.max(h, 0) + 0.12, -(j + v) * 2);
          }
          const n = pts.length / 3;
          if (n === 2) L.push(pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]);
          else if (n > 2) { let mx = 0, my = 0, mz = 0; for (let k = 0; k < n; k++) { mx += pts[k * 3] / n; my += pts[k * 3 + 1] / n; mz += pts[k * 3 + 2] / n; } for (let k = 0; k < n; k++) L.push(mx, my, mz, pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]); }
        }
        lines = new Float32Array(L);
      }
      function assemble() {
        const nF = feats.length / 11, shapes = new Array(nF);
        let nv = NV, ni = SEG * SEG * 6;
        for (let k = 0; k < nF; k++) { const s = feats[k * 11]; const sh = typeof s === 'string' ? S.get(s) : s.castle ? S.castle(s.castle) : S.house(s.house); shapes[k] = sh; nv += sh.p.length / 3; ni += sh.i.length; }
        const pos = new Float32Array(nv * 3), col = new Uint8Array(nv * 3), idx = new Uint32Array(ni);
        for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) { const k = j * (SEG + 1) + i; pos[k * 3] = 2 * i; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = -2 * j; }
        col.set(tcol);
        let o = 0;
        for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
          const a = j * (SEG + 1) + i, b = a + 1, c = a + SEG + 1, d = c + 1;
          if ((i + j) & 1) { idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = b; idx[o++] = d; idx[o++] = c; }
          else { idx[o++] = a; idx[o++] = b; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = c; }
        }
        const nTerrain = o;
        let v = NV, nLod0 = o;
        const quad = new Uint32Array(5), far = new Uint32Array(5);
        /* pass 0 = always drawn; passes 1-4 = each 32 m quadrant's FAR trees; passes 5-8 = each quadrant's NEAR detail */
        for (let pass = 0; pass < 9; pass++) {
          if (pass >= 1 && pass <= 4) far[pass - 1] = o;
          if (pass >= 5) { if (pass === 5) far[4] = o; quad[pass - 5] = o; }
          const want = pass === 0 ? 0 : pass <= 4 ? 2 : 1, qq = pass === 0 ? -1 : (pass - 1) % 4;
          for (let k = 0; k < nF; k++) {
            const f = k * 11, lod = feats[f + 10];
            if (lod !== want || (qq >= 0 && ((feats[f + 1] >= 32 ? 1 : 0) + (feats[f + 2] <= -32 ? 2 : 0)) !== qq)) continue;
            const sh = shapes[k], lx = feats[f + 1], lz = feats[f + 2], y = feats[f + 3], s = feats[f + 4], sy = feats[f + 5], cr = Math.cos(feats[f + 6]), sr = Math.sin(feats[f + 6]);
            const tr = feats[f + 7] / 255, tg = feats[f + 8] / 255, tb = feats[f + 9] / 255, P = sh.p, C = sh.c, M = sh.t, n = P.length / 3;
            for (let q = 0; q < n; q++) {
              const px = P[q * 3] * s, pz = P[q * 3 + 2] * s, w = (v + q) * 3;
              pos[w] = lx + px * cr + pz * sr; pos[w + 1] = y + P[q * 3 + 1] * sy; pos[w + 2] = lz - px * sr + pz * cr;
              if (M[q]) {
                col[w] = Math.min(255, C[q * 3] * tr); col[w + 1] = Math.min(255, C[q * 3 + 1] * tg); col[w + 2] = Math.min(255, C[q * 3 + 2] * tb);
                /* snow on the crowns the higher a tree stands, most on the upper faces */
                if (PAL.treeSnow && y > PAL.treeSnow[0]) {
                  const m = Math.min(1, (y - PAL.treeSnow[0]) / (PAL.treeSnow[1] - PAL.treeSnow[0])) * (P[q * 3 + 1] > 0.9 ? 0.85 : 0.35);
                  col[w] += (SNOW[0] - col[w]) * m; col[w + 1] += (SNOW[1] - col[w + 1]) * m; col[w + 2] += (SNOW[2] - col[w + 2]) * m;
                }
              }
              else { col[w] = C[q * 3]; col[w + 1] = C[q * 3 + 1]; col[w + 2] = C[q * 3 + 2]; }
            }
            const I = sh.i; for (let q = 0; q < I.length; q++) idx[o++] = v + I[q];
            v += n;
          }
          if (pass === 0) nLod0 = o;
        }
        quad[4] = o;
        J.out = { pos, col, idx, nTerrain, nLod0, quad, far, nIdx: o, heights, lines, tris: o / 3, features: nF, ms: Date.now() - t0, steps: J.steps };
      }
      J.step = function () {
        J.steps++;
        if (phase === 0) { vertexRow(row++); if (row > SEG) phase = 1; return false; }
        if (phase === 1) { tileBand(band++); if (band >= SIZE / 8) phase = 2; return false; }
        if (phase === 2) { objects(); phase = 3; return false; }
        if (phase === 3) { borders(); phase = 4; return false; }
        if (phase === 4) { assemble(); phase = 5; return true; }
        return true;
      };
      J.run = function () { while (!J.step()); return J.out; };
      return J;
    }
    /* height on a built chunk's triangles (same split as the index buffer); lx, ly = planar metres inside the chunk */
    function meshHeight(heights, lx, ly) {
      const gx = Math.max(0, Math.min(SEG - 1e-9, lx / 2)), gy = Math.max(0, Math.min(SEG - 1e-9, ly / 2)), i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      const a = heights[j * (SEG + 1) + i], b = heights[j * (SEG + 1) + i + 1], c = heights[(j + 1) * (SEG + 1) + i], d = heights[(j + 1) * (SEG + 1) + i + 1];
      if ((i + j) & 1) return fx + fy <= 1 ? a + (b - a) * fx + (c - a) * fy : d + (c - d) * (1 - fx) + (b - d) * (1 - fy);
      return fx >= fy ? a + (b - a) * fx + (d - b) * fy : a + (d - c) * fx + (c - a) * fy;
    }
    return { api: 1, job, meshHeight, SIZE, SEG };
  }
  const api = { api: 1, create, SIZE, SEG };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('atlas_chunk', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
