/* ASHVALE worldgen part: the land itself (module wg_terrain, api 1): class weights, heights, ponds, the corner peaks,
   shore sand and forest density at one point. Pure and deterministic like wg_geo; the numbers live in the data module
   wg_tables (data/atlas/wg_tables.json). attach(ctx) (after wg_geo and wg_paths) adds:
     newSample()                                   a reusable sample record (see worldgen.js for the fields)
     landInto(f, x, y, fb, out, usePieces)         fills `out` for TRUE face f, planar (x, y), fb = foldInto result
   How the class drives the land: the point is domain-warped (about +-70 m) and the nearest parcel and its ring give
   compact-support weights (blend over ~60 m), so parcels never show as hexagons on the ground. Each class has a base
   height, a share of the rolling meadow noise and of the hills noise; sea sinks to -3.8 m; ponds are rare round
   hollows; peak weight lifts a cliff, then a mountain rising toward the corner (radius 1.7 km). */
(function (root) {
  'use strict';
  const META = { api: 1, v: 2, needs: { wg_geo: 1 } };
  const C_CREATOR = 0, C_CORE = 1, C_WILD = 2, C_SEA = 3, C_PEAK = 4;

  function attach(ctx) {
    const g = ctx.geo, T = ctx.T, S = ctx.S, fbm = g.fbm, vnoise = g.vnoise, sstep = g.sstep, clamp01 = g.clamp01;
    const R = ctx.R, SP = ctx.SP, HGT = ctx.HGT, P = ctx.P, NB = ctx.NB, DEG = ctx.DEG, CODES = ctx.CODES;
    const WM = T.warp.m, WF = T.warp.freq, E = T.blend * SP * SP, R2 = 2 * R * R;
    const RO = T.rolling, HI = T.hills, RG = T.range, PO = T.pond, PK = T.peak, FO = T.forest, PC = T.pieces;
    const HC = T.heights.core, HR = T.heights.creator, HW = T.heights.wild, HS = T.heights.sea, HP = T.heights.peak;
    const U = new Float64Array(3), PFL = { k: 1, dens: 0, sp: '' };
    /* How many rings a cell is from everything the ranges must not touch: the base region, the corner peaks, the
       water. Hops, so the fade in is the same integer field in every engine; -1 means farther in than the fade needs,
       which is the same as very far. One pass per worldgen, like the class codes. */
    const POND_ABOVE = RG ? RG.pondAbove : 1;
    const hopF = RG ? new Int8Array(CODES.length).fill(-1) : null;
    if (RG) {
      const qF = new Int32Array(CODES.length), FAR = RG.inset + RG.fade;
      let qh = 0, qt = 0;
      for (let c = 0; c < CODES.length; c++) if (CODES[c] !== C_CREATOR && CODES[c] !== C_WILD) { hopF[c] = 0; qF[qt++] = c; }
      while (qh < qt) { const c = qF[qh++]; if (hopF[c] >= FAR) continue; for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (hopF[m] < 0) { hopF[m] = hopF[c] + 1; qF[qt++] = m; } } }
    }
    function newSample() { return { face: 0, x: 0, y: 0, ux: 0, uy: 0, uz: 0, h: 0, w: new Float64Array(5), cls: 0, cell: 0, forest: 0, sand: 0, peakS: 0, pond: 0, seamD: 0, site: 0, biome: 0, hills: 0, piece: 0, pieceId: '' }; }
    function landInto(f, x, y, fb, out, usePieces) {
      out.face = f; out.x = x; out.y = y;
      out.seamD = Math.max(0, Math.min(fb[3], fb[4], fb[5])) * HGT;
      ctx.bary2sphere(f, fb[3], fb[4], fb[5], U);
      const ux = U[0], uy = U[1], uz = U[2];
      out.ux = ux; out.uy = uy; out.uz = uz;
      const X = ux * R, Y = uy * R, Z = uz * R;
      let qx = X + (fbm(X, Y, Z, S.w1, WF, 2) - 0.5) * WM, qy = Y + (fbm(X, Y, Z, S.w2, WF, 2) - 0.5) * WM, qz = Z + (fbm(X, Y, Z, S.w3, WF, 2) - 0.5) * WM;
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz); qx /= ql; qy /= ql; qz /= ql;
      const c0 = ctx.nearest(qx, qy, qz);
      out.cell = c0;
      const w = out.w; w[0] = w[1] = w[2] = w[3] = w[4] = 0;
      const q0 = P[c0 * 3] * qx + P[c0 * 3 + 1] * qy + P[c0 * 3 + 2] * qz;
      let tot = 1; w[CODES[c0]] += 1;
      for (let k = 0; k < DEG[c0]; k++) {
        const m = NB[c0 * 6 + k], ex = R2 * (q0 - (P[m * 3] * qx + P[m * 3 + 1] * qy + P[m * 3 + 2] * qz));
        if (ex < E) { const t = 1 - ex / E, v = t * t * t; w[CODES[m]] += v; tot += v; }
      }
      for (let k = 0; k < 5; k++) w[k] /= tot;
      let cls = 0; for (let k = 1; k < 5; k++) if (w[k] > w[cls]) cls = k;
      out.cls = cls;
      const hm = (fbm(X, Y, Z, S.hm, RO.freq, 3) - 0.5) * RO.amp + (vnoise(X * RO.detailFreq, Y * RO.detailFreq, Z * RO.detailFreq, S.hd) - 0.5) * RO.detailAmp;
      const hills = Math.max(0, fbm(X, Y, Z, S.hh, HI.freq, 4) - HI.cut) * HI.amp;
      out.hills = hills;
      let h = w[C_CORE] * (HC[0] + HC[1] * hm + HC[2] * hills) + w[C_CREATOR] * (HR[0] + HR[1] * hm + HR[2] * hills) + w[C_WILD] * (HW[0] + HW[1] * hm + HW[2] * hills) +
        w[C_SEA] * (HS[0] + HS[1] * hm + HS[2] * hills) + w[C_PEAK] * (HP[0] + HP[1] * hm + HP[2] * hills);
      /* Mountain ranges away from the twelve corner peaks: ridges (crest lines, so they read as ranges and not as
         blobs) gathered into belts by a noise twelve times slower. A range fades in over the last of its distance to
         the base region, a peak or the water, so nothing ever rises out of the ground along a class boundary; inside
         those cells the allowance is exactly nothing and the land there is byte-for-byte what it was. */
      let rgAdd = 0;
      if (RG && RG.amp > 0) {
        const hp = hopF[out.cell], allow = hp < 0 ? 1 : clamp01((hp - RG.inset) / RG.fade);
        if (allow > 0) {
          const rv = 2 * fbm(X, Y, Z, S.rn, RG.freq, RG.oct) - 1, rn = 1 - rv * rv;
          const belt = sstep(RG.beltLo, RG.beltHi, fbm(X, Y, Z, S.rb, RG.beltFreq, 2));
          rgAdd = Math.max(0, rn * rn - RG.floor) * RG.amp * belt * allow;
          h += rgAdd;
        }
      }
      /* A pond is a hollow in the plain, so it stops being one as soon as the ground is range country - otherwise the
         dip to -1.3 m would cut a hole in a mountainside and leave a cliff where the hollow ended. Where there are no
         ranges the factor is exactly 1 and the ponds are the ponds that were already there. */
      let pond = sstep(PO.lo, PO.hi, vnoise(X * PO.freq, Y * PO.freq, Z * PO.freq, S.pd)) * clamp01(1 - 3 * w[C_SEA]) * clamp01(1 - 3 * w[C_PEAK]) *
        clamp01(1 - rgAdd / POND_ABOVE);
      /* set pieces: their base height inside (plus a little roll), blending over T.pieces.blend metres outside */
      let piece = 0, pieceH = 0;
      out.pieceId = '';
      const NP = usePieces ? ctx.PIECES.length : 0;
      for (let k = 0; k < NP; k++) {
        const pc = ctx.PIECES[k]; if (pc.face !== f) continue;
        const d = ctx.pieceDist(pc, x, y);
        if (d < PC.pondKeep) pond *= sstep(PC.pondKeep * 0.6, PC.pondKeep, d);
        if (d < PC.blend) { const k2 = sstep(PC.blend, 0, d); if (k2 > piece) { piece = k2; pieceH = pc.hb; } if (d === 0) out.pieceId = pc.id; }
      }
      out.pond = pond;
      if (pond > 0) h = h * (1 - pond) + PO.depth * pond;
      const peakS = sstep(PK.lo, PK.hi, w[C_PEAK]);
      out.peakS = peakS;
      if (peakS > 0) {
        const t = clamp01(1 - ctx.cornerDist(ux, uy, uz) / PK.radius), ridge = 1 - Math.abs(2 * fbm(X, Y, Z, S.rg, PK.ridgeFreq, 3) - 1);
        h = h * (1 - peakS) + (PK.base + PK.rise * t * t + PK.ridge * ridge) * peakS;
      }
      if (piece > 0) h = h * (1 - piece) + (pieceH + (vnoise(X * PC.noiseFreq, Y * PC.noiseFreq, Z * PC.noiseFreq, S.hd ^ 0x5bd1) - 0.5) * PC.noise) * piece;
      if (NP) h = ctx.waterCarve(f, x, y, h);
      out.piece = piece;
      out.h = h;
      out.sand = (clamp01(w[C_SEA] * 4) * sstep(1.3, 0.25, h) + pond * 0.6) * (1 - piece);
      const fd = fbm(X, Y, Z, S.fo, FO.freq, 3);
      let forest = w[C_CORE] * FO.core[0] * sstep(FO.core[1], FO.core[2], fd) + w[C_CREATOR] * FO.creator[0] * sstep(FO.creator[1], FO.creator[2], fd) +
        w[C_WILD] * FO.wild[0] * sstep(FO.wild[1], FO.wild[2], fd) + w[C_PEAK] * FO.peak[0] * sstep(FO.peak[1], FO.peak[2], fd);
      /* next to a set piece its own woods continue (same density) and fade into the seeded land */
      if (NP) { ctx.pieceFlora(f, x, y, PFL); if (PFL.k < 1) forest = PFL.dens * (1 - PFL.k) + forest * PFL.k; }
      forest *= clamp01((h - 0.35) * 2) * (1 - peakS) * (1 - pond);
      out.forest = forest;
      out.site = 0;
      return out;
    }
    Object.assign(ctx, { newSample, landInto });
    return ctx;
  }

  const api = { api: 1, attach };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('wg_terrain', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
