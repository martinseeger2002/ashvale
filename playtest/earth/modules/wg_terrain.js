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
  const META = { api: 1, v: 5, needs: { wg_geo: 1 } };
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
    const CM = T.climate; let CLIM = null;
    /* realistic topography (the operator: "the globe has to have a real realistic topography"): the land rises gently from
       its coast inland - coastal plains, then uplands, with plateaus and basins - so a continent is not a flat table
       with ridges standing on it. Per cell: rings from the sea. */
    const TP = T.topo, dSea = TP ? new Int16Array(CODES.length).fill(-1) : null;
    if (TP) { const qd = new Int32Array(CODES.length); let qh = 0, qt = 0; for (let c = 0; c < CODES.length; c++) if (CODES[c] === C_SEA) { dSea[c] = 0; qd[qt++] = c; }
      while (qh < qt) { const c = qd[qh++]; if (dSea[c] >= TP.rings) continue; for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (dSea[m] < 0) { dSea[m] = dSea[c] + 1; qd[qt++] = m; } } }
      for (let c = 0; c < CODES.length; c++) if (dSea[c] < 0) dSea[c] = TP.rings; }
    const RV = T.rivers; let RIV = null;
    /* the ranges' lines, from the seed: RG.count arcs anywhere on the sphere (the ones over the ocean add nothing) */
    const ARCS = [];
    if (RG && RG.count) {
      const rv = (k) => g.u01(g.mix32((S.rn ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0));
      /* ranges never cross (the operator: "the mountain ranges shouldn't crisscross"): a candidate is kept only if every
         point along it stays RG.sep metres from every range already kept; RG.tries candidates, RG.count kept at most */
      const distTo = (A, x, y, z) => {
        const along = Math.atan2(x * A.t[0] + y * A.t[1] + z * A.t[2], x * A.a[0] + y * A.a[1] + z * A.a[2]);
        const cl = Math.max(0, Math.min(A.len, along)), px = A.a[0] * Math.cos(cl) + A.t[0] * Math.sin(cl), py = A.a[1] * Math.cos(cl) + A.t[1] * Math.sin(cl), pz = A.a[2] * Math.cos(cl) + A.t[2] * Math.sin(cl);
        return Math.acos(Math.max(-1, Math.min(1, x * px + y * py + z * pz))) * R;
      };
      for (let i = 0; i < (RG.tries || RG.count) && ARCS.length < RG.count; i++) {
        const z = rv(i * 7) * 2 - 1, lo = rv(i * 7 + 1) * 2 * Math.PI, rr = Math.sqrt(1 - z * z);
        const a = [rr * Math.cos(lo), rr * Math.sin(lo), z];
        let ex = -a[1], ey = a[0], ez = 0; const el = Math.sqrt(ex * ex + ey * ey) || 1; ex /= el; ey /= el;
        const fx = a[1] * ez - a[2] * ey, fy = a[2] * ex - a[0] * ez, fz = a[0] * ey - a[1] * ex, th = rv(i * 7 + 2) * 2 * Math.PI;
        const t = [Math.cos(th) * ex + Math.sin(th) * fx, Math.cos(th) * ey + Math.sin(th) * fy, Math.cos(th) * ez + Math.sin(th) * fz];
        const nrm = [a[1] * t[2] - a[2] * t[1], a[2] * t[0] - a[0] * t[2], a[0] * t[1] - a[1] * t[0]];
        const len = (RG.lenMin + (RG.lenMax - RG.lenMin) * rv(i * 7 + 3)) / R;
        const cand = { a, t, n: nrm, len, taper: Math.min(len / 3, RG.taperM / R), h: 0.7 + 0.3 * rv(i * 7 + 4), side: rv(i * 7 + 5) < 0.75 ? 1 : 0 };
        let ok = true, onLand = 0;
        for (let m = 0; m <= 24 && ok; m++) {
          const al = len * m / 24, x = a[0] * Math.cos(al) + t[0] * Math.sin(al), y = a[1] * Math.cos(al) + t[1] * Math.sin(al), zz = a[2] * Math.cos(al) + t[2] * Math.sin(al);
          for (const B of ARCS) if (distTo(B, x, y, zz) < (RG.sep || 0)) { ok = false; break; }
          if (CODES[ctx.nearest(x, y, zz)] !== C_SEA) onLand++;
        }
        /* only ranges that run over land: the sea would swallow the rest, and the land would be left with too few */
        if (ok && onLand >= 25 * (RG.landFrac || 0)) ARCS.push(cand);
      }
    }
    const hopF = RG ? new Int8Array(CODES.length).fill(-1) : null;
    if (RG) {
      const qF = new Int32Array(CODES.length), FAR = RG.inset + RG.fade;
      let qh = 0, qt = 0;
      /* kept off: the water, the corner peaks, and the reserved land near the two towns (RG.townKeep rings); the rest of
         the reserved web may cross a range - it never turns to rock (below), so where a road meets a range it is a pass */
      const nearTown = new Int16Array(CODES.length).fill(-1), CLx = ctx.CL, KEEP = RG.townKeep || 0;
      if (KEEP > 0) { let h0 = 0, t0 = 0; for (const tc of [CLx.coreCenter, CLx.coreHarbour]) if (tc >= 0) { nearTown[tc] = 0; qF[t0++] = tc; }
        while (h0 < t0) { const c = qF[h0++]; if (nearTown[c] >= KEEP) continue; for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (nearTown[m] < 0) { nearTown[m] = nearTown[c] + 1; qF[t0++] = m; } } } }
      for (let c = 0; c < CODES.length; c++) if (CODES[c] === C_SEA || CODES[c] === C_PEAK || (CODES[c] === C_CORE && (KEEP ? nearTown[c] >= 0 : true))) { hopF[c] = 0; qF[qt++] = c; }
      while (qh < qt) { const c = qF[qh++]; if (hopF[c] >= FAR) continue; for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (hopF[m] < 0) { hopF[m] = hopF[c] + 1; qF[qt++] = m; } } }
    }
    function newSample() { return { face: 0, x: 0, y: 0, ux: 0, uy: 0, uz: 0, h: 0, w: new Float64Array(5), cls: 0, cell: 0, forest: 0, sand: 0, peakS: 0, pond: 0, seamD: 0, site: 0, biome: 0, hills: 0, piece: 0, pieceId: '', moist: 0.5, temp: 12, clim: 0, river: 0, wl: -1e9 }; }
    /* is a set piece on the coast? - sea cells of the globe at its corners or edge midpoints (once per piece) */
    function seaPiece(pc) {
      if (pc._sea !== undefined) return pc._sea;
      let sea = false; const FBs = new Float64Array(6), Us = new Float64Array(3);
      for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) {
        const px = pc.px0 + (pc.px1 - pc.px0) * ax, py = pc.py0 + (pc.py1 - pc.py0) * ay;
        ctx.foldInto(pc.face, px, py, FBs); ctx.bary2sphere(FBs[0], FBs[3], FBs[4], FBs[5], Us);
        const c = ctx.nearest(Us[0], Us[1], Us[2]);
        if (CODES[c] === C_SEA) sea = true; else for (let k = 0; k < DEG[c]; k++) if (CODES[NB[c * 6 + k]] === C_SEA) sea = true;
      }
      return (pc._sea = sea);
    }
    /* ---- hand edits (the world editor, 2026-10-04): strokes on the sphere, bucketed on a 3D grid of ~200 m so a
       sample only looks at the strokes near it; off while the climate is first worked out (EDIT_ON) */
    let EDITS = null, EDIT_ON = false, EDC = 0, EDT = 0, EDM = 0, EDW = -1e9, EDF = -1, EDFW = 0;
    const EG = 200 / R, CLIM_AT = [[12, 0.6], [12, 0.2], [12, 0.06], [28, 0.06], [26, 0.22], [27, 0.8], [1, 0.5], [-8, 0.3]];   /* a temperature and moisture inside each zone (climOf) */
    const ekey = (a, b, c) => ((a + 1024) * 2048 + (b + 1024)) * 2048 + (c + 1024);
    function setEdits(list) {
      EDITS = null; if (!list || !list.length) return;
      const m = new Map();
      list.forEach((e, i) => {
        const u = e.u, l = Math.hypot(u[0], u[1], u[2]) || 1, E = Object.assign({}, e, { u: [u[0] / l, u[1] / l, u[2] / l], r: Math.max(1, +e.r || 20), i }); E.reach = reach(E); const k = E.reach / R;
        for (let a = Math.floor((E.u[0] - k) / EG); a <= Math.floor((E.u[0] + k) / EG); a++) for (let b = Math.floor((E.u[1] - k) / EG); b <= Math.floor((E.u[1] + k) / EG); b++) for (let c = Math.floor((E.u[2] - k) / EG); c <= Math.floor((E.u[2] + k) / EG); c++) {
          const key = ekey(a, b, c); let L = m.get(key); if (!L) m.set(key, L = []); L.push(E);
        }
      });
      EDITS = m;
    }
    const fall = (t) => t >= 1 ? 0 : (1 - t * t) * (1 - t * t);
    /* a stroke's reach: a step's slopes run past its flat top */
    const reach = (e) => e.op === 'step' ? e.r + Math.max(1, +e.k || 8) : e.r;
    function editH(ux, uy, uz, h) {   /* the edited height; leaves the zone override (EDC weight, EDT/EDM) for the climate */
      EDC = 0; EDW = -1e9; EDFW = 0;
      const L = EDITS.get(ekey(Math.floor(ux / EG), Math.floor(uy / EG), Math.floor(uz / EG))); if (!L) return h;
      for (const e of L) {
        const dx = ux - e.u[0], dy = uy - e.u[1], dz = uz - e.u[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) * R; if (d >= e.reach) continue;
        const w = fall(d / e.r);
        if (e.op === 'step') {   /* a click of the SimCity-style raise/lower: a flat top of radius r, then a smooth slope `k` metres wide */
          const k = Math.max(1, +e.k || 8), t = Math.max(0, d - e.r) / k;
          if (t < 1) { const q = 1 - t; h += (+e.dh || 0) * q * q * (3 - 2 * q); }   /* smoothstep: no cliff at the edge (the operator: less drastic) */
          continue;
        }
        if (e.op === 'water') { const top = +e.to || 0; if (d < e.r) { h = Math.min(h, top - 0.4 - 1.6 * w); EDW = top; } continue; }   /* a pond / a stream: the bed under a level surface */
        if (e.op === 'trees') { const k = Math.min(1, w * 1.6); EDF = EDFW ? EDF + ((+e.s || 0) - EDF) * k : +e.s || 0; EDFW = Math.max(EDFW, k); continue; }
        if (e.op === 'raise' || e.op === 'lower') h += (e.op === 'lower' ? -Math.abs(+e.dh || 0) : Math.abs(+e.dh || 0)) * w;
        else if (e.op === 'flatten') h += ((+e.to || 0) - h) * Math.min(1, w * 1.6) * (e.s == null ? 1 : +e.s);
        else if (e.op === 'region' && CLIM_AT[e.clim | 0]) { const k = Math.min(1, w * 1.8), z = CLIM_AT[e.clim | 0]; EDT = EDC ? EDT + (z[0] - EDT) * k : z[0]; EDM = EDC ? EDM + (z[1] - EDM) * k : z[1]; EDC = Math.max(EDC, k); }
      }
      return h;
    }
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
      let mo = CLIM ? CLIM.m[c0] : 0.5, te = CLIM ? CLIM.t[c0] : 12, ds = dSea ? dSea[c0] : 0, le = RIV ? RIV.E[c0] : 0, ld = RIV ? RIV.LD[c0] : 0;
      for (let k = 0; k < DEG[c0]; k++) {
        const m = NB[c0 * 6 + k], ex = R2 * (q0 - (P[m * 3] * qx + P[m * 3 + 1] * qy + P[m * 3 + 2] * qz));
        if (ex < E) { const t = 1 - ex / E, v = t * t * t; w[CODES[m]] += v; tot += v; if (CLIM) { mo += v * CLIM.m[m]; te += v * CLIM.t[m]; } if (dSea) ds += v * dSea[m]; if (RIV) { le += v * RIV.E[m]; ld += v * RIV.LD[m]; } }
      }
      if (CLIM) { mo /= tot; te /= tot; }
      if (dSea) ds /= tot;
      if (RIV) { le /= tot; ld /= tot; }
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
      if (TP && w[C_SEA] < 0.999) {
        const up = sstep(0.4, TP.rings, ds) * TP.amp * (TP.plateau0 + TP.plateau1 * fbm(X, Y, Z, (S.hm ^ 0x7feb352d) >>> 0, TP.freq, 3));
        h += up * (1 - w[C_SEA]);
      }
      let rgAdd = 0;
      if (RG && RG.amp > 0) {
        const hp = hopF[out.cell], allow = hp < 0 ? 1 : clamp01((hp - RG.inset) / RG.fade);
        if (allow > 0) {
          /* ranges are LINES (the operator: "mountain ranges with passes and valleys", not single mountains): seeded
             great-circle arcs, meandering, each a main crest with lower parallel ridges either side so there are
             valleys between them; the ends taper; passes below cut saddles through the crests */
          let best = 0;
          for (let k = 0; k < ARCS.length; k++) {
            const A = ARCS[k];
            const along = Math.atan2(ux * A.t[0] + uy * A.t[1] + uz * A.t[2], ux * A.a[0] + uy * A.a[1] + uz * A.a[2]);
            if (along < -0.02 || along > A.len + 0.02) continue;
            const off = Math.asin(Math.max(-1, Math.min(1, ux * A.n[0] + uy * A.n[1] + uz * A.n[2]))) * R
              + (fbm(X, Y, Z, (S.rn + k * 7919) >>> 0, RG.wiggleFreq, 2) - 0.5) * RG.wiggle;
            const end = Math.min(1, Math.max(0, along) / A.taper, Math.max(0, A.len - along) / A.taper);
            if (RG.footW) { const fd = Math.abs(off) / RG.footW; if (fd < 1) { const fv = (1 - fd) * (1 - fd) * RG.footAmp / RG.amp * end; if (fv > best) best = fv; } }   /* foothills */
            for (let j = -A.side; j <= A.side; j++) {
              const d = Math.abs(off - j * RG.spacing) / RG.half;
              if (d >= 1) continue;
              const v = Math.pow(1 - d, 1.6) * (j === 0 ? 1 : 0.62) * A.h * end;
              if (v > best) best = v;
            }
          }
          rgAdd = best * RG.amp * allow;
          /* passes (the operator: "ranges should have valleys and passages"): a slow noise along the crest lines pulls a
             crest down to a saddle every few kilometres, low enough to walk over; between the ridges the ground
             stays valley floor */
          if (RG.passFreq) rgAdd *= 1 - RG.passDepth * (1 - sstep(RG.passLo, RG.passHi, fbm(X, Y, Z, S.ps, RG.passFreq, 2)));
          h += rgAdd;
        }
      }
      /* A pond is a hollow in the plain, so it stops being one as soon as the ground is range country - otherwise the
         dip to -1.3 m would cut a hole in a mountainside and leave a cliff where the hollow ended. Where there are no
         ranges the factor is exactly 1 and the ponds are the ponds that were already there. */
      let pond = sstep(PO.lo, PO.hi, vnoise(X * PO.freq, Y * PO.freq, Z * PO.freq, S.pd)) * clamp01(1 - 3 * w[C_SEA]) * clamp01(1 - 3 * w[C_PEAK]) *
        clamp01(1 - rgAdd / POND_ABOVE);
      /* set pieces: their base height inside (plus a little roll), blending over T.pieces.blend metres outside */
      let piece = 0, pieceH = 0, pierAt = 0, basin = 0;
      out.pieceId = '';
      const NP = usePieces ? ctx.PIECES.length : 0;
      for (let k = 0; k < NP; k++) {
        const pc = ctx.PIECES[k]; if (pc.face !== f) continue;
        const d = ctx.pieceDist(pc, x, y);
        if (d < PC.pondKeep) pond *= sstep(PC.pondKeep * 0.6, PC.pondKeep, d);
        if (d === 0) {
          out.pieceId = pc.id;
          /* a piece's own water keeps the land's height (Saltmere's harbour is real sea), and its piers stand on it */
          const L = ctx.pieceTile(pc, Math.floor(x), Math.floor(-y));
          if (L === '~') continue;   /* no dredged basin: a coastal town's water is the Atlas sea (the operator), an inland pond keeps its own depth */   /* only a coastal town's harbour is dredged to the sea; an inland pond keeps its own depth (Ashvale's fishing pond, v0.8.3) */
          if (L === 'B') { pierAt = 1; continue; }
        }
        if (d < PC.blend) { const k2 = sstep(PC.blend, 0, d); if (k2 > piece) { piece = k2; pieceH = pc.hb; } }
      }
      if (CLIM && CM.pond) pond *= CM.pond[climOf(te, mo)];   /* no ponds in the desert, few on dry grassland (the operator) */
      out.pond = pond;
      if (pond > 0) h = h * (1 - pond) + PO.depth * pond;
      let peakS = sstep(PK.lo, PK.hi, w[C_PEAK]);
      /* a range's high crest is bare rock and blocks, like a peak: so the ranges are walls with passes, not hills */
      const rock = RG && RG.rockHi ? sstep(RG.rockLo, RG.rockHi, rgAdd) * (1 - w[C_CORE]) * (RG.notchFreq ? sstep(RG.notchLo, RG.notchLo + 0.06, vnoise(X * RG.notchFreq, Y * RG.notchFreq, Z * RG.notchFreq, S.ps ^ 0x2c1b3c6d)) : 1) : 0;   /* walkable notches across the rocky crests (the operator) */
      if (peakS > 0) {
        const t = clamp01(1 - ctx.cornerDist(ux, uy, uz) / PK.radius), ridge = 1 - Math.abs(2 * fbm(X, Y, Z, S.rg, PK.ridgeFreq, 3) - 1);
        h = h * (1 - peakS) + (PK.base + PK.rise * t * t + PK.ridge * ridge) * peakS;
      }
      peakS = Math.max(peakS, rock * (1 - piece));
      out.peakS = peakS;
      /* the world editor's strokes, on the generated ground BEFORE the towns' building pads and the rivers, so a pad
         (sampled from this ground) and a river channel see the edited land once, not twice */
      if (EDIT_ON && EDITS) h = editH(ux, uy, uz, h); else { EDC = 0; EDFW = 0; EDW = -1e9; }
      /* inside a town the land keeps its own shape; only the building pads are levelled, blending over 4 m */
      if (piece > 0 && NP) for (let k = 0; k < NP; k++) {
        const pc = ctx.PIECES[k]; if (pc.face !== f || !pc.pads) continue;
        if (ctx.pieceDist(pc, x, y) > 6) continue;
        for (const pd of pc.pads) {
          const dx = Math.max(pd[0] - x, 0, x - pd[2]), dy = Math.max(pd[1] - y, 0, y - pd[3]), dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < 4) { const t = sstep(4, 0.5, dd); h = h * (1 - t) + pd[4] * t; }
        }
      }
      /* the rivers: a channel at its own water level, and the valley it has cut (the land only ever goes down) */
      out.river = 0; out.wl = -1e9;
      if (RIV) {
        let best = 1e9, wl = 0, wid = 0;
        /* the meander bends the land the river is drawn on (a domain warp), so the line stays one unbroken line */
        const mw = RV.meander / R, wx0 = ux + (fbm(X, Y, Z, S.rv, RV.meanderFreq, 2) - 0.5) * mw, wy0 = uy + (fbm(X, Y, Z, (S.rv ^ 0x68e31da4) >>> 0, RV.meanderFreq, 2) - 0.5) * mw, wz0 = uz + (fbm(X, Y, Z, (S.rv ^ 0xb5297a4d) >>> 0, RV.meanderFreq, 2) - 0.5) * mw;
        /* each river cell carries a smooth curve: from the midpoint with its main upstream cell, bending through the
           cell's centre, to the midpoint with the cell downstream - so a river flows round, not along the grid */
        const consider = (k) => {
          if (!RIV.river[k]) return;
          const d = RIV.down[k]; if (d < 0) return;
          const u0 = RIV.main[k] >= 0 ? RIV.main[k] : k, k3 = k * 3, d3 = d * 3, u3 = u0 * 3;
          const ax = (P[u3] + P[k3]) / 2, ay = (P[u3 + 1] + P[k3 + 1]) / 2, az = (P[u3 + 2] + P[k3 + 2]) / 2;
          const bx = (P[k3] + P[d3]) / 2, by = (P[k3 + 1] + P[d3 + 1]) / 2, bz = (P[k3 + 2] + P[d3 + 2]) / 2;
          const ea = (RIV.E[u0] + RIV.E[k]) / 2, eb = (RIV.E[k] + RIV.E[d]) / 2;
          let px0 = ax, py0 = ay, pz0 = az;
          for (let q = 1; q <= 8; q++) {
            const t1 = q / 8, s1 = 1 - t1, CTk = RIV.CT, cx = s1 * s1 * ax + 2 * s1 * t1 * CTk[k3] + t1 * t1 * bx, cy = s1 * s1 * ay + 2 * s1 * t1 * CTk[k3 + 1] + t1 * t1 * by, cz = s1 * s1 * az + 2 * s1 * t1 * CTk[k3 + 2] + t1 * t1 * bz;
            /* distance to the chord between two neighbouring points of the curve (no beads) */
            const sx = cx - px0, sy = cy - py0, sz = cz - pz0, tt = clamp01(((wx0 - px0) * sx + (wy0 - py0) * sy + (wz0 - pz0) * sz) / (sx * sx + sy * sy + sz * sz || 1));
            const dd = Math.sqrt((wx0 - px0 - sx * tt) ** 2 + (wy0 - py0 - sy * tt) ** 2 + (wz0 - pz0 - sz * tt) ** 2) * R;
            if (dd < best) { best = dd; wid = RIV.wOf(k); wl = ea + (eb - ea) * ((q - 1 + tt) / 8); }
            px0 = cx; py0 = cy; pz0 = cz;
          }
          /* a tributary (not the main stem of the cell below) runs on from its end into the main river's curve, so it
             joins it - the confluence */
          if (RIV.main[d] !== k) {
            const d2 = RIV.down[d]; if (d2 < 0) return;
            const um = RIV.main[d] >= 0 ? RIV.main[d] : d, um3 = um * 3, e3 = d2 * 3;
            const CQ = RIV ? RIV.CT : CT, qx = 0.25 * (P[um3] + P[d3]) / 2 + 0.5 * CQ[d3] + 0.25 * (P[d3] + P[e3]) / 2, qy = 0.25 * (P[um3 + 1] + P[d3 + 1]) / 2 + 0.5 * CQ[d3 + 1] + 0.25 * (P[d3 + 1] + P[e3 + 1]) / 2, qz = 0.25 * (P[um3 + 2] + P[d3 + 2]) / 2 + 0.5 * CQ[d3 + 2] + 0.25 * (P[d3 + 2] + P[e3 + 2]) / 2;
            const sx = qx - bx, sy = qy - by, sz = qz - bz, tt = clamp01(((wx0 - bx) * sx + (wy0 - by) * sy + (wz0 - bz) * sz) / (sx * sx + sy * sy + sz * sz || 1));
            const dd = Math.sqrt((wx0 - bx - sx * tt) ** 2 + (wy0 - by - sy * tt) ** 2 + (wz0 - bz - sz * tt) ** 2) * R;
            if (dd < best) { best = dd; wid = RIV.wOf(k); const eq = ((RIV.E[um] + RIV.E[d]) / 2 + RIV.E[d] * 2 + (RIV.E[d] + RIV.E[d2]) / 2) / 4; wl = eb + (Math.min(eb, eq) - eb) * tt; }
          }
        };
        consider(c0);
        for (let k = 0; k < DEG[c0]; k++) { const m = NB[c0 * 6 + k]; consider(m); const u2 = RIV.ups.get(m); if (u2) for (const q of u2) consider(q); }
        { const u2 = RIV.ups.get(c0); if (u2) for (const q of u2) consider(q); }
        if (best < 1e8) {
          const off = best;
          const half = wid / 2, surf = Math.max(ctx.WATER, wl - RV.sink), V = half * RV.valleyMul + RV.valleyAdd;
          if (off < V) {   /* through towns too: a town is built round its river (tools/make_zone_saltmere.mjs) */
            const wall = surf + 0.7 + Math.max(0, off - half) * RV.wallSlope;
            if (wall < h) h = wall;
            if (off < half) { h = Math.min(h, surf); out.river = wid >= RV.deep ? 2 : 1; out.wl = surf; }
          }
          /* a hollow the river runs through fills with its water (2026-10-04: "That entire cavern should be filled
             with water ... The water should always be flat"): ground near the river and below its surface is a lake at
             the river's own level, so water never drapes down a hollow's sides */
          if (off >= half && h < surf - 0.05 && off < Math.max(V, RV.fillDist != null ? RV.fillDist : 400)) { h = surf - 0.1; out.river = 3; out.wl = surf; }   /* flat, as a lake: its bed just under the skin (the game draws water over the bed) */
        }
      }
      /* a lake where the land holds water below its spill level; frozen where it is cold or high (walkable ice); none
         in the desert or on the steppe, where the water dries away to a salt flat */
      if (RIV && RV.lakeMin && ld > RV.lakeMin && h < le - 0.15 && !basin) {
        const cz0 = CLIM ? climOf(te - CM.lapse * le, mo) : 0;
        if (cz0 !== 3 && cz0 !== 2) {
          const frozen = (te - CM.lapse * le) < RV.iceT || le > (RG && RG.snowLine ? RG.snowLine - 15 : 1e9);
          h = le - 0.1; out.river = frozen ? 4 : 3; out.wl = le - 0.1;
        }
      }
      if (NP) h = ctx.waterCarve(f, x, y, h);
      if (basin && !out.river) h = Math.min(h, ctx.WATER - 1.6);   /* a town's harbour basin is dredged; its river keeps its own level */
      if (pierAt) h = Math.max(h, ctx.WATER + 0.3);   /* a pier deck */
      if (EDW > -1e8 && h < EDW) { out.river = 3; out.wl = EDW; h = Math.min(h, EDW - 0.4); }   /* an editor pond: a lake at its own surface */
      out.piece = piece;
      out.h = h;
      out.sand = (clamp01(w[C_SEA] * 4) * sstep(1.3, 0.25, h) + pond * 0.6) * (1 - piece);
      const fd = fbm(X, Y, Z, S.fo, FO.freq, 3);
      let forest = w[C_CORE] * FO.core[0] * sstep(FO.core[1], FO.core[2], fd) + w[C_CREATOR] * FO.creator[0] * sstep(FO.creator[1], FO.creator[2], fd) +
        w[C_WILD] * FO.wild[0] * sstep(FO.wild[1], FO.wild[2], fd) + w[C_PEAK] * FO.peak[0] * sstep(FO.peak[1], FO.peak[2], fd);
      /* next to a set piece its own woods continue (same density) and fade into the seeded land */
      forest = Math.min(T.forest.max || 1, forest);   /* the densest woods a little thinner (2026-10-06); a set piece's own woods still continue below */
      if (NP) { ctx.pieceFlora(f, x, y, PFL); if (PFL.k < 1) forest = PFL.dens * (1 - PFL.k) + forest * PFL.k; }
      if (NP && ctx.groveAt) { const GV = ctx.groveAt(f, x, y); if (GV) forest += (GV.dens - forest) * GV.k; }   /* a grove's woods (maple and birch by Ziibiing) */
      forest *= clamp01((h - 0.35) * 2) * (1 - peakS) * (1 - pond) * (RG && RG.treeLine ? 1 - sstep(RG.treeLine[0], RG.treeLine[1], h) : 1);   /* the tree line: the woods thin out and stop (the operator: like a real mountain) */
      /* the climate (the operator: "a desert region and all kinds of regions, according to how the weather would flow"):
         the zone from temperature (latitude, height) and moisture (carried in from the sea by the prevailing winds,
         wrung out by mountains), with a little noise so the borders wander */
      if (CLIM) {
        te -= CM.lapse * Math.max(0, h); mo += (fbm(X, Y, Z, S.cm, CM.jitFreq, 2) - 0.5) * CM.jit;
        if (CM.tJit) te += (fbm(X, Y, Z, (S.cm ^ 0x5bd1e995) >>> 0, CM.tJitFreq, 3) - 0.5) * CM.tJit * 2 + (fbm(X, Y, Z, (S.cm ^ 0x27d4eb2d) >>> 0, 0.003, 2) - 0.5) * 3;   /* borders wander, they are not lines of latitude */
        mo += (fbm(X, Y, Z, (S.cm ^ 0x165667b1) >>> 0, 0.004, 2) - 0.5) * 0.1;
        if (EDC > 0) { te += (EDT - te) * EDC; mo += (EDM - mo) * EDC; }   /* a region painted in the editor */
        const cz = climOf(te, mo);
        out.temp = te; out.moist = mo; out.clim = cz;
        forest *= CM.forest[cz];
        out.sand = Math.max(out.sand, CM.sand[cz] * (1 - piece) * clamp01(h * 2));
      } else { out.temp = 12; out.moist = 0.5; out.clim = 0; }
      if (EDFW > 0) forest = forest * (1 - EDFW) + EDF * EDFW;   /* trees planted or cleared in the editor */
      out.forest = forest;
      out.site = 0;
      return out;
    }
    /* ---- the climate, once per worldgen: per land cell its temperature and moisture ---- */
    function climOf(t, m) {
      if (t < CM.tundraT) return 7;
      if (t < CM.taigaT) return m > 0.25 ? 6 : 7;
      if (t < CM.warmT) return m < CM.steppeM ? 2 : m < CM.grassM ? 1 : 0;
      return m < CM.desertM ? 3 : m < CM.savannaM ? 4 : m < CM.rainM ? 0 : 5;
    }
    if (CM) {
      const N = CODES.length, hC = new Float32Array(N), sm = newSample(), fb = new Float64Array(6), Gq = ctx.G;
      for (let c = 0; c < N; c++) if (CODES[c] !== C_SEA) { const p = Gq.planar(c); ctx.foldInto(p.face, p.x, p.y, fb); hC[c] = landInto(p.face, p.x, p.y, fb, sm, false).h; }
      /* prevailing winds by latitude band: trade winds blow west (and toward the equator), westerlies east (and
         poleward), polar easterlies west; each cell takes its moisture from the neighbour upwind */
      const up = new Int32Array(N), tC = new Float32Array(N), mC = new Float32Array(N);
      for (let c = 0; c < N; c++) {
        const x = P[c * 3], y = P[c * 3 + 1], z = P[c * 3 + 2], lat = Math.asin(Math.max(-1, Math.min(1, z))), al = Math.abs(lat) * 180 / Math.PI;
        let ex = -y, ey = x, ez = 0; const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
        const nx = y * ez - z * ey, ny = z * ex - x * ez, nz = x * ey - y * ex, hemi = lat >= 0 ? 1 : -1;
        const e = al < 30 ? -1 : al < 60 ? 1 : -1, pole = al < 30 ? -hemi : al < 60 ? hemi : -hemi;
        const wx = e * ex + 0.35 * pole * nx, wy = e * ey + 0.35 * pole * ny, wz = 0.35 * pole * nz;
        let best = c, bd = -1e9;
        for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k], d = -((P[m * 3] - x) * wx + (P[m * 3 + 1] - y) * wy + (P[m * 3 + 2] - z) * wz); if (d > bd) { bd = d; best = m; } }
        up[c] = best;
        tC[c] = CM.t0 + CM.t1 * Math.pow(Math.cos(lat), CM.tp);
        mC[c] = CODES[c] === C_SEA ? 1 : 0;
      }
      for (let it = 0; it < CM.sweeps; it++) for (let c = 0; c < N; c++) {
        if (CODES[c] === C_SEA) continue;
        let base = mC[up[c]] * CM.decay;
        if (hC[c] > CM.shadowH) base *= CM.shadow;   /* the air climbs and rains out: little is left behind the ridge */
        let av = 0; for (let k = 0; k < DEG[c]; k++) av += mC[NB[c * 6 + k]]; av /= DEG[c];
        mC[c] = (1 - CM.mixN) * base + CM.mixN * av * CM.decay;
      }
      /* the sea moderates a coast's temperature */
      for (let c = 0; c < N; c++) if (CODES[c] !== C_SEA) { let sea = 0; for (let k = 0; k < DEG[c]; k++) if (CODES[NB[c * 6 + k]] === C_SEA) sea++; tC[c] += (CM.coastT - tC[c]) * 0.15 * sea / DEG[c]; }
      CLIM = { t: tC, m: mC, up };
      ctx.climate = CLIM; ctx.climOf = climOf; ctx.seaPiece = seaPiece;
      ctx.setEdits = setEdits;
      /* ---- rivers (the operator: "more streams and rivers ... mountain creeks should flow down from the mountains ... in
         valleys so it looks like the river created the valley"): every land cell drains to its lowest neighbour on a
         priority-flood filled surface (so every hollow spills toward the sea), rain (the climate's moisture, more in
         the hills) adds up downstream, and where enough has gathered there is a creek, then a river */
      if (RV) {
        const E = new Float32Array(N), down = new Int32Array(N).fill(-1), done = new Uint8Array(N), order = [];
        /* rivers go round Ashvale (its parcel and the ring round it stand high for the routing only), so the village
           stays dry and its gates stay open; Saltmere keeps the river that runs through it */
        const hR = Float32Array.from(hC); { const ac = ctx.CL.coreCenter; if (ac >= 0) { hR[ac] += 60; for (let k = 0; k < DEG[ac]; k++) hR[NB[ac * 6 + k]] += 60; } }
        const hp = [], hpush = (e, c) => { hp.push([e, c]); let i = hp.length - 1; while (i > 0) { const p2 = (i - 1) >> 1; if (hp[p2][0] <= hp[i][0]) break; const t2 = hp[p2]; hp[p2] = hp[i]; hp[i] = t2; i = p2; } };
        const hpop = () => { const top = hp[0], l = hp.pop(); if (hp.length) { hp[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < hp.length && hp[a][0] < hp[m][0]) m = a; if (b < hp.length && hp[b][0] < hp[m][0]) m = b; if (m === i) break; const t2 = hp[m]; hp[m] = hp[i]; hp[i] = t2; i = m; } } return top; };
        for (let c = 0; c < N; c++) if (CODES[c] === C_SEA) { let coast = false; for (let k = 0; k < DEG[c]; k++) if (CODES[NB[c * 6 + k]] !== C_SEA) coast = true; if (coast) { E[c] = 0; done[c] = 1; hpush(0, c); } }
        while (hp.length) {
          const [e, c] = hpop(); order.push(c);
          for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (done[m] || CODES[m] === C_SEA) continue; done[m] = 1; E[m] = Math.max(hR[m], e + 0.01); down[m] = c; hpush(E[m], m); }
        }
        const acc = new Float32Array(N);
        for (let i = order.length - 1; i >= 0; i--) { const c = order[i]; if (CODES[c] === C_SEA) continue; acc[c] += mC[c] * (1 + Math.max(0, hC[c]) / RV.hillRain); if (down[c] >= 0 && CODES[down[c]] !== C_SEA) acc[down[c]] += acc[c]; }
        const river = new Uint8Array(N), ups = new Map();
        for (let c = 0; c < N; c++) {
          if (CODES[c] === C_SEA || down[c] < 0) continue;
          if (acc[c] >= RV.river || (acc[c] >= RV.creek && hC[c] > RV.creekH) || acc[c] >= RV.creek * 2.2) {
            river[c] = 1; const d = down[c]; if (!ups.has(d)) ups.set(d, []); ups.get(d).push(c);
          }
        }
        /* a creek keeps flowing to the sea once it has started */
        for (let i = order.length - 1; i >= 0; i--) { const c = order[i]; if (river[c] && down[c] >= 0 && CODES[down[c]] !== C_SEA && !river[down[c]]) { river[down[c]] = 1; const d2 = down[down[c]]; if (d2 >= 0) { if (!ups.has(d2)) ups.set(d2, []); ups.get(d2).push(down[c]); } } }
        /* how far each river cell is from the sea along its own course: the last cells open out into a mouth */
        const toSea = new Int16Array(N).fill(-1);
        for (let i = 0; i < order.length; i++) { const c = order[i]; if (CODES[c] === C_SEA || !river[c]) continue; const d = down[c]; toSea[c] = d < 0 || CODES[d] === C_SEA ? 0 : (toSea[d] >= 0 ? toSea[d] + 1 : 50); }
        const wOf = (k) => { const base = Math.max(RV.wMin, Math.min(RV.wMax, RV.wMin * Math.pow(acc[k] / RV.creek, RV.wPow || 1)));   /* width follows the water: every tributary's flow adds to it (the operator); width ~ flow^0.53, as real rivers do */ return base * (1 + (RV.mouth || 0) * Math.max(0, 1 - toSea[k] / (RV.mouthCells || 2.5))); };
        /* each river cell's main upstream: the tributary carrying the most water, which the curve continues from */
        const main = new Int32Array(N).fill(-1);
        for (const [d2, list] of ups) { let b2 = -1; for (const q of list) if (river[q] && (b2 < 0 || acc[q] > acc[b2])) b2 = q; main[d2] = b2; }
        /* meanders: each river cell's curve bends through a control point pushed sideways from its centre by a seeded
           amount; the midpoints it joins its neighbours at stay put, so the river stays one unbroken line */
        const CT = new Float64Array(N * 3);
        for (let k = 0; k < N; k++) {
          const k3 = k * 3; CT[k3] = P[k3]; CT[k3 + 1] = P[k3 + 1]; CT[k3 + 2] = P[k3 + 2];
          if (!river[k] || down[k] < 0) continue;
          const d3 = down[k] * 3, u3 = (main[k] >= 0 ? main[k] : k) * 3;
          const cx = P[d3] - P[u3], cy = P[d3 + 1] - P[u3 + 1], cz = P[d3 + 2] - P[u3 + 2];
          let nx = cy * P[k3 + 2] - cz * P[k3 + 1], ny = cz * P[k3] - cx * P[k3 + 2], nz = cx * P[k3 + 1] - cy * P[k3]; const nl = Math.hypot(nx, ny, nz) || 1;
          const off = (g.u01(g.mix32((S.rv ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0)) - 0.5) * 2 * (RV.bend || 0) * SP / R;
          CT[k3] += nx / nl * off; CT[k3 + 1] += ny / nl * off; CT[k3 + 2] += nz / nl * off;
        }
        /* lakes: every hollow fills to its spill level (the operator), the depth of water each cell would hold */
        const LD = new Float32Array(N); for (let c = 0; c < N; c++) if (CODES[c] !== C_SEA) LD[c] = Math.max(0, E[c] - hR[c]);
        RIV = { E, down, acc, river, ups, main, toSea, wOf, CT, LD };
        /* the network as lines, for a map or a view from the air: each river cell's curve (the same curve the channel
           is carved along, with the meander's warp undone) as segments of unit vectors, with its water level and width */
        RIV.lines = () => {
          const pos = [], lv = [], wd = [], mw = RV.meander / R;
          const at = (cx, cy, cz, out) => {
            const X2 = cx * R, Y2 = cy * R, Z2 = cz * R;
            out[0] = cx - (fbm(X2, Y2, Z2, S.rv, RV.meanderFreq, 2) - 0.5) * mw; out[1] = cy - (fbm(X2, Y2, Z2, (S.rv ^ 0x68e31da4) >>> 0, RV.meanderFreq, 2) - 0.5) * mw; out[2] = cz - (fbm(X2, Y2, Z2, (S.rv ^ 0xb5297a4d) >>> 0, RV.meanderFreq, 2) - 0.5) * mw;
            const l = Math.hypot(out[0], out[1], out[2]); out[0] /= l; out[1] /= l; out[2] /= l; return out;
          };
          const A2 = [0, 0, 0], B2 = [0, 0, 0];
          for (let k = 0; k < N; k++) {
            if (!river[k] || down[k] < 0) continue;
            const d = down[k], u0 = main[k] >= 0 ? main[k] : k, k3 = k * 3, d3 = d * 3, u3 = u0 * 3;
            const ax = (P[u3] + P[k3]) / 2, ay = (P[u3 + 1] + P[k3 + 1]) / 2, az = (P[u3 + 2] + P[k3 + 2]) / 2, bx = (P[k3] + P[d3]) / 2, by = (P[k3 + 1] + P[d3 + 1]) / 2, bz = (P[k3 + 2] + P[d3 + 2]) / 2;
            const ea = (E[u0] + E[k]) / 2, eb = (E[k] + E[d]) / 2, w0 = wOf(k);
            at(ax, ay, az, A2);
            for (let q = 1; q <= 8; q++) {
              const t = q / 8, s1 = 1 - t; at(s1 * s1 * ax + 2 * s1 * t * CT[k3] + t * t * bx, s1 * s1 * ay + 2 * s1 * t * CT[k3 + 1] + t * t * by, s1 * s1 * az + 2 * s1 * t * CT[k3 + 2] + t * t * bz, B2);
              pos.push(A2[0], A2[1], A2[2], B2[0], B2[1], B2[2]);
              const l0 = Math.max(0, ea + (eb - ea) * (t - 1 / 8) - RV.sink), l1 = Math.max(0, ea + (eb - ea) * t - RV.sink);
              lv.push(l0, l1); wd.push(w0, w0);
              A2[0] = B2[0]; A2[1] = B2[1]; A2[2] = B2[2];
            }
            if (main[d] !== k && down[d] >= 0) {
              const d2 = down[d], um = main[d] >= 0 ? main[d] : d, um3 = um * 3, e3 = d2 * 3;
              const CQ = RIV ? RIV.CT : CT, qx = 0.25 * (P[um3] + P[d3]) / 2 + 0.5 * CQ[d3] + 0.25 * (P[d3] + P[e3]) / 2, qy = 0.25 * (P[um3 + 1] + P[d3 + 1]) / 2 + 0.5 * CQ[d3 + 1] + 0.25 * (P[d3 + 1] + P[e3 + 1]) / 2, qz = 0.25 * (P[um3 + 2] + P[d3 + 2]) / 2 + 0.5 * CQ[d3 + 2] + 0.25 * (P[d3 + 2] + P[e3 + 2]) / 2;
              const ql = Math.hypot(qx, qy, qz), bl = Math.hypot(bx, by, bz);
              pos.push(bx / bl, by / bl, bz / bl, qx / ql, qy / ql, qz / ql); lv.push(Math.max(0, eb - RV.sink), Math.max(0, Math.min(eb, E[d]) - RV.sink)); wd.push(w0, w0);
            }
          }
          return { pos: new Float32Array(pos), level: new Float32Array(lv), width: new Float32Array(wd) };
        };
        ctx.rivers = RIV;
      }
    }
    Object.assign(ctx, { newSample, landInto });
    ctx.setEdits = setEdits; setEdits(T.edits || null); EDIT_ON = true;   /* the editor's layer: on from here */
    return ctx;
  }

  const api = { api: 1, attach };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('wg_terrain', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
