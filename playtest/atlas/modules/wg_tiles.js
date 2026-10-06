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
  const META = { api: 1, v: 1, needs: { wg_geo: 1 } };
  function attach(ctx) {
    const g = ctx.geo, T = ctx.T, FQ = ctx.FQ, ADJ = ctx.ADJ, XF = ctx.XF, HGT = ctx.HGT, EDGE = ctx.EDGE, WATER = ctx.WATER, BLOCK = ctx.BLOCK;
    const PFL = { k: 1, dens: 0, sp: '' }, TF = new Float64Array(14), TB = new Float64Array(3), FB = new Float64Array(6), QB = new Float64Array(3);
    const TR = T.trees, RK = T.rocks, FL = T.flowers, SE = T.seam, CLEAR = T.paths.clear, LONE = T.forest.lone, SITE = T.sites.cell;
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
    function tileTrue(f, gx, gy) {
      const PI = ctx.PIECES;
      for (let k = 0; k < PI.length; k++) if (PI[k].face === f) { const L = ctx.pieceTile(PI[k], gx, gy); if (L) return L; }
      const cx = gx + 0.5, cy = -gy - 0.5;
      const st = ctx.siteOf(f, Math.floor(cx / SITE), Math.floor(cy / SITE));
      if (st) { const L = st.foot.get(ctx.tkey(gx, gy)); if (L) return L; }
      ctx.fieldTrue(f, cx, cy, TF);
      const h = TF[0];
      if (TF[12] < 3 && h > WATER + 0.1 && TF[3] < 0.1 && seamStone(f, gx, gy, cx, cy)) return 'K';
      if (h < WATER - 0.05) return '~';
      if (TF[3] > 0.1) return '^';
      const pd = PI.length ? ctx.pathDist(f, cx, cy) : 1e9;
      if (pd < 0) return 'p';
      if (TF[2] > 0.5 || (TF[2] > 0.3 && h < WATER + 0.3)) return 's';
      const hv = g.hash3(gx, gy, (f * 104729) ^ ctx.S.tl), r1 = g.u01(hv), r2 = g.u01(g.mix32(hv ^ 0x68e31da4));
      const clear = pd < CLEAR || TF[5] > 0.3;
      const forest = TF[1] + LONE * (1 - TF[9]);
      if (!clear && r1 < forest) {
        if (PI.length) { ctx.pieceFlora(f, cx, cy, PFL); if (PFL.sp && g.u01(g.mix32(hv ^ 0x3c6ef372)) >= PFL.k) return PFL.sp[Math.floor(r2 * PFL.sp.length)]; }
        if (TF[4] > 0.02 || TF[2] > 0.12 || (TF[9] > 0.12 && r2 < 0.5)) return TR.wet;
        const mix = TF[8] > 0.5 ? TR.wild : TF[7] > 0.5 ? TR.core : TR.creator;
        return mix[Math.floor(r2 * mix.length)];
      }
      if (!clear && r1 < forest + RK.base + RK.wild * TF[8] + (TF[11] > 2 ? RK.hills : 0)) return 'r';
      if (TF[1] > 0.12) return ',';
      if (pd < 1.2) return 'd';
      if (TF[7] > FL.core && r2 < FL.chance && g.vnoise(cx * FL.patchFreq, cy * FL.patchFreq, f, ctx.S.fl) > FL.patch) return 'f';
      return '.';
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
