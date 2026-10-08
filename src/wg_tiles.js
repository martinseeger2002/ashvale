/* ASHVALE worldgen part: the tile rules (module wg_tiles, api 1): from the land fields to the game's tile letters.
   Pure and deterministic. attach(ctx) (after the other parts; the orchestrator provides ctx.fieldTrue) adds:
     tileTrue(f, gx, gy)              letter of game tile (gx, gy) of TRUE face f
     tileAt(face, gx, gy)             same, folding a tile whose centre lies beyond the face edge into the neighbour
     tiles(face, gx, gy, w, h)        h strings of w letters (zone-string format)
     walkable(face, x, y)             the tile under a planar point does not block (ctx.BLOCK)
     forTiles(face, x0, y0, x1, y1, fn)   tiles of `face` and of its unfolded neighbours whose centres lie in the planar
                                      rect [x0,x1) x [y0,y1) of `face`: fn(letter, x, y, trueFace, gx, gy), (x, y) in
                                      `face`'s plane
   Order of the rules: set piece letter > site footprint > seam boundary stone (K every T.seam.every m on the edges a
   face owns, i.e. the lower face id) > water (~) > mountain (^) > path (p) > shore sand (s) > tree (T P O W M Y by
   class mix, W by water; density = the forest field, Whisperwood-like in woods) > boulder (r) > forest floor (,) >
   dirt beside paths (d) > flowers (f, patches in the vale) > grass (.). Every random pick hashes (face, gx, gy). */
(function (root) {
  'use strict';
  const META = { api: 1, v: 2, needs: { wg_geo: 1 } };
  function attach(ctx) {
    const g = ctx.geo, T = ctx.T, FQ = ctx.FQ, ADJ = ctx.ADJ, XF = ctx.XF, HGT = ctx.HGT, EDGE = ctx.EDGE, WATER = ctx.WATER, BLOCK = ctx.BLOCK;
    const PFL = { k: 1, dens: 0, sp: '' }, TF = new Float64Array(17), TB = new Float64Array(3), FB = new Float64Array(6), QB = new Float64Array(3);
    const CMT = T.climate && ctx.climOf ? T.climate : null, TR = T.trees, RK = T.rocks, FL = T.flowers, SE = T.seam, CLEAR = T.paths.clear, LONE = T.forest.lone, SITE = T.sites.cell;
    function seamStone(f, gx, gy, cx, cy) {
      ctx.baryInto(f, cx, cy, TB);
      for (let k = 0; k < 3; k++) {
        if (TB[k] * HGT > 2.5 || ADJ[f * 3 + k] < f) continue;
        const ka = (k + 1) % 3, kb = (k + 2) % 3, ax = FQ[f * 6 + ka * 2], ay = FQ[f * 6 + ka * 2 + 1];
        const ex = (FQ[f * 6 + kb * 2] - ax) / EDGE, ey = (FQ[f * 6 + kb * 2 + 1] - ay) / EDGE, m = Math.round(((cx - ax) * ex + (cy - ay) * ey) / SE.every);
        if (m < 1 || m * SE.every > EDGE - SE.every) continue;
        const ox = FQ[f * 6 + k * 2] - ax, oy = FQ[f * 6 + k * 2 + 1] - ay, on = ox * ex + oy * ey;
        let nx = ox - ex * on, ny = oy - ey * on; const nl = Math.sqrt(nx * nx + ny * ny); nx /= nl; ny /= nl;
        const mx = ax + ex * m * SE.every + nx * SE.inset, my = ay + ey * m * SE.every + ny * SE.inset;
        if (Math.floor(mx) === gx && Math.floor(-my) === gy) return true;
      }
      return false;
    }
    let FOREST_HIT = false;   /* set by baseTile: this tree came from the forest dice (only those may be cleared for a way through) */
    function baseTile(f, gx, gy) {
      FOREST_HIT = false;
      const PI = ctx.PIECES;
      for (let k = 0; k < PI.length; k++) if (PI[k].face === f) { const L = ctx.pieceTile(PI[k], gx, gy); if (L) {
        /* a coastal town's ground letters follow the Atlas ground: water below sea level, a drawn '~' on dry land is beach */
        if ('~s.,f'.indexOf(L) >= 0 && ctx.seaPiece && ctx.seaPiece(PI[k])) { ctx.fieldTrue(f, gx + 0.5, -gy - 0.5, TF); return TF[0] < WATER ? '~' : L === '~' ? 's' : L; }
        return L; } }
      const cx = gx + 0.5, cy = -gy - 0.5;
      const st = ctx.siteOf(f, Math.floor(cx / SITE), Math.floor(cy / SITE));
      if (st) { const L = st.foot.get(ctx.tkey(gx, gy)); if (L) return L; }
      ctx.fieldTrue(f, cx, cy, TF);
      const h = TF[0];
      if (TF[12] < 3 && h > WATER + 0.1 && TF[3] < 0.1 && seamStone(f, gx, gy, cx, cy)) return 'K';
      const pd = PI.length ? ctx.pathDist(f, cx, cy) : 1e9;
      /* rivers: a creek is shallow water you wade through ('v'); a river is deep ('~') but for a ford now and then, and a
         path over it is a bridge */
      if (TF[16] > 3.5) return 'J';   /* a frozen lake: ice you can walk on */
      if (TF[16] > 2.5) return pd < 0 && ctx.bridgeDist(f, cx, cy) < 0 ? 'B' : '~';   /* a lake */
      if (TF[16] > 0.5) {
        if (pd < 0 && TF[16] > 1.5) return 'B';
        if (TF[16] > 1.5 && g.vnoise(cx / 70, cy / 70, f, ctx.S.rv ^ 0x9e37) < 0.78) return '~';
        return 'v';
      }
      if (h < WATER - 0.05) return pd < 0 && ctx.bridgeDist(f, cx, cy) < 0 ? 'B' : '~';   /* a bridge: wg_paths lays one only across a stream */
      if (TF[3] > 0.1) return '^';
      if (pd < 0) return ctx.roadDist && ctx.roadDist(f, cx, cy) < 0 ? 'c' : 'p';   /* 'c': cobbles on a road between towns */
      if (TF[2] > 0.5 || (TF[2] > 0.3 && h < WATER + 0.3)) {
        /* the open desert: sand with a saguaro here and there (2026-10-06), never on a beach or a path */
        if (CMT && CMT.cactus && pd >= CLEAR && ctx.climOf(TF[15], TF[14]) === 3 && g.u01(g.hash3(gx, gy, (f * 7919) ^ ctx.S.tl ^ 0x5a17)) < CMT.cactus) { FOREST_HIT = true; return 'U'; }
        return 's';
      }
      const hv = g.hash3(gx, gy, (f * 104729) ^ ctx.S.tl), r1 = g.u01(hv), r2 = g.u01(g.mix32(hv ^ 0x68e31da4));
      const clear = pd < CLEAR || TF[5] > 0.3;
      const forest = TF[1] + LONE * (1 - TF[9]);
      if (!clear && r1 < forest) {
        FOREST_HIT = true;
        if (PI.length) { ctx.pieceFlora(f, cx, cy, PFL); if (PFL.sp && g.u01(g.mix32(hv ^ 0x3c6ef372)) >= PFL.k) { FOREST_HIT = false; return PFL.sp[Math.floor(r2 * PFL.sp.length)]; } }
        if (TF[4] > 0.02 || TF[2] > 0.12 || (TF[9] > 0.12 && r2 < 0.5)) return TR.wet;
        if (PI.length && ctx.groveAt) { const GV = ctx.groveAt(f, cx, cy); if (GV && g.u01(g.mix32(hv ^ 0x2545f491)) < GV.k) return GV.sp[Math.floor(r2 * GV.sp.length)]; }   /* in a grove: its own trees */
        /* the climate's own trees: pines in the taiga, broadleaf mixes in the rainforest (2026-10-03) */
        const zt = CMT ? CMT.trees[ctx.climOf(TF[15], TF[14])] : '';
        if (zt) return zt[Math.floor(r2 * zt.length)];
        const mix = TF[8] > 0.5 ? TR.wild : TF[7] > 0.5 ? TR.core : TR.creator;
        return mix[Math.floor(r2 * mix.length)];
      }
      if (!clear && r1 < forest + RK.base + RK.wild * TF[8] + (TF[11] > 2 ? RK.hills : 0)) return 'r';
      if (TF[1] > 0.12) return ',';
      if (pd < 1.2) return 'd';
      const zg = CMT ? CMT.ground[ctx.climOf(TF[15], TF[14])] : '.';
      if (zg !== '.') return zg;   /* dry grass on the steppe and savanna, sand in the desert, bare tundra */
      if (TF[7] > FL.core && r2 < FL.chance && g.vnoise(cx * FL.patchFreq, cy * FL.patchFreq, f, ctx.S.fl) > FL.patch) return 'f';
      return '.';
    }
    /* NO WALLED-IN GROUND (2026-10-06: "Animals keep getting stuck in the woods because there's no way out or
       through ... no encapsulated tiles"). Measured before: ~2,700 pockets of open ground fully ringed by trees around
       Ashvale alone. Walking is 4-connected (a diagonal step needs both side tiles open), so the land is cut into
       WAY x WAY cells of each face; each cell has a gate on each side (nearest the middle, where both cells are free of
       rock and water at the border), shared with the next cell.
       Every open tile of a cell is joined to its gates by clearing the fewest forest trees (0-1 search: open costs 0, a
       forest tree 1); since neighbouring cells meet at their gates, all of it joins up. Only trees from the forest dice
       are ever cleared - never water, rock, a set piece's own trees, a camp - and a cleared tree is forest floor (,).
       Pure and deterministic: a cell is worked out from its own tiles only, cached, and only a forest tree asks. */
    const WAY = 16, WAYS = new Map(), WAY_MAX = 4096;
    function wayCell(f, cx, cy) {
      const key = f + ':' + cx + ':' + cy; let m = WAYS.get(key);
      if (m) return m;
      const N = WAY, x0 = cx * N, y0 = cy * N, kind = new Uint8Array(N * N);   /* 0 open, 1 forest tree, 2 other block */
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const L = baseTile(f, x0 + i, y0 + j); kind[j * N + i] = BLOCK.indexOf(L) < 0 ? 0 : FOREST_HIT ? 1 : 2; }
      const clear = new Uint8Array(N * N), H = N >> 1, gates = [];
      /* a side's gate: the tile nearest its middle where neither this cell nor the next has rock, water or a set piece on its
         side of the border (both cells look at the same two rows, so they pick the same gate); a forest tree there is cleared */
      const hard = (gx, gy) => BLOCK.indexOf(baseTile(f, gx, gy)) >= 0 && !FOREST_HIT;
      for (const [vert, at, out] of [[false, 0, -1], [false, N - 1, N], [true, 0, -1], [true, N - 1, N]]) {
        for (let s = 0; s < N; s++) {
          const k = H + (s & 1 ? -((s + 1) >> 1) : s >> 1); if (k < 0 || k >= N) continue;
          const i = vert ? at : k, j = vert ? k : at, c = j * N + i;
          if (kind[c] === 2 || hard(x0 + (vert ? out : k), y0 + (vert ? k : out))) continue;
          if (kind[c] === 1) { kind[c] = 0; clear[c] = 1; }
          gates.push(c); break;
        }
      }
      const dist = new Int32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), dq = new Int32Array(4 * N * N);
      function grow(seed) {   /* 0-1 search from seed (open 0, forest tree 1), then clear the cheapest way to every open tile it can reach */
        let h = 2 * N * N, tl = h; dist[seed] = 0; from[seed] = -1; dq[tl++] = seed;
        while (h < tl) {
          const c = dq[h++], x = c % N, y = (c / N) | 0;
          for (let k = 0; k < 4; k++) {
            const a = x + (k === 0 ? 1 : k === 1 ? -1 : 0), b = y + (k === 2 ? 1 : k === 3 ? -1 : 0); if (a < 0 || b < 0 || a >= N || b >= N) continue;
            const n = b * N + a, w = kind[n]; if (w === 2) continue;
            const d = dist[c] + w; if (d >= dist[n]) continue;
            dist[n] = d; from[n] = c; if (w) dq[tl++] = n; else dq[--h] = n;
          }
        }
        for (let c = 0; c < N * N; c++) if (kind[c] === 0 && dist[c] > 0 && dist[c] < 1e9)
          for (let n = c; n >= 0 && dist[n] > 0; n = from[n]) { if (kind[n] === 1) { kind[n] = 0; clear[n] = 1; } dist[n] = 0; }
      }
      /* from the first gate; a gate that water or rock keeps apart from it starts its own (a lake can cut a cell in two) */
      for (const gt of gates) if (dist[gt] >= 1e9) grow(gt);
      if (!gates.length) for (let c = 0; c < N * N; c++) if (kind[c] === 0) { grow(c); break; }   /* gates all in water/rock: join the cell to its first open tile */
      if (WAYS.size >= WAY_MAX) WAYS.delete(WAYS.keys().next().value);
      WAYS.set(key, clear); return clear;
    }
    function tileTrue(f, gx, gy) {
      const L = baseTile(f, gx, gy);
      if (!FOREST_HIT) return L;
      const cx = Math.floor(gx / WAY), cy = Math.floor(gy / WAY);
      return wayCell(f, cx, cy)[(gy - cy * WAY) * WAY + (gx - cx * WAY)] ? (L === 'U' ? 's' : ',') : L;   /* a cleared cactus is sand again */
    }
    function tileAt(face, gx, gy) {
      ctx.foldInto(face, gx + 0.5, -gy - 0.5, FB);
      if (FB[0] === face) return tileTrue(face, gx, gy);
      return tileTrue(FB[0], Math.floor(FB[1]), Math.floor(-FB[2]));
    }
    function tiles(face, gx, gy, w, h) {
      const rows = [];
      for (let y = 0; y < h; y++) { let s = ''; for (let x = 0; x < w; x++) s += tileAt(face, gx + x, gy + y); rows.push(s); }
      return rows;
    }
    function walkable(face, x, y) {
      ctx.foldInto(face, x, y, FB);
      return BLOCK.indexOf(tileTrue(FB[0], Math.floor(FB[1]), Math.floor(-FB[2]))) < 0;
    }
    function forTiles(face, x0, y0, x1, y1, fn) {
      for (let pass = -1; pass < 3; pass++) {
        let gf = face, c = 1, s = 0, tx = 0, ty = 0;
        if (pass >= 0) {
          gf = ADJ[face * 3 + pass];
          const half = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) / 2;
          ctx.baryInto(face, (x0 + x1) / 2, (y0 + y1) / 2, TB);
          if (TB[pass] * HGT > half + 1) continue;
          const o = (face * 3 + pass) * 4; c = XF[o]; s = XF[o + 1]; tx = XF[o + 2]; ty = XF[o + 3];
        }
        let gx0 = 1e30, gy0 = 1e30, gx1 = -1e30, gy1 = -1e30;
        for (let k = 0; k < 4; k++) {
          const px = k & 1 ? x1 : x0, py = k & 2 ? y1 : y0, qx = c * px - s * py + tx, qy = s * px + c * py + ty;
          if (qx < gx0) gx0 = qx; if (qx > gx1) gx1 = qx; if (qy < gy0) gy0 = qy; if (qy > gy1) gy1 = qy;
        }
        const ix0 = Math.floor(gx0) - 1, ix1 = Math.floor(gx1) + 1, iy0 = Math.floor(-gy1) - 1, iy1 = Math.floor(-gy0) + 1;
        for (let gy = iy0; gy <= iy1; gy++) for (let gx = ix0; gx <= ix1; gx++) {
          const qx = gx + 0.5, qy = -gy - 0.5;
          ctx.baryInto(gf, qx, qy, QB);
          if (QB[0] < 0 || QB[1] < 0 || QB[2] < 0) continue;
          const ax = pass < 0 ? qx : c * (qx - tx) + s * (qy - ty), ay = pass < 0 ? qy : -s * (qx - tx) + c * (qy - ty);
          if (ax < x0 || ax >= x1 || ay < y0 || ay >= y1) continue;
          fn(tileTrue(gf, gx, gy), ax, ay, gf, gx, gy);
        }
      }
    }
    Object.assign(ctx, { tileTrue, tileAt, tiles, walkable, forTiles });
    return ctx;
  }
  const api = { api: 1, attach };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('wg_tiles', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
