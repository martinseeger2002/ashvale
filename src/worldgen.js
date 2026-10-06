/* ASHVALE worldgen v1 (module worldgen, api 1): seeded ground-level land for the globe (GLOBE.md sections 3, 5), in the
   game's own TILE LANGUAGE so the core can build its walk and sight maps from it exactly as from zone strings today.
   This file is the orchestrator; the work is in small modules (each one inscription): wg_geo (faces, unfolding, noise),
   wg_terrain (heights, classes, forest), wg_paths (set pieces + exit paths), wg_sites (camps, ore, fishing, ruins),
   wg_tiles (letters), and the numbers in the data module wg_tables (data/atlas/wg_tables.json).
   Pure: no three.js, no DOM, no clock, no Math.random; only + - * / sqrt floor imul decide anything, so every engine
   (node, browsers, QuickJS, a referee) gets bit-identical land. A new version bumps V and must keep v1 reproducible.

   const W = worldgen.createWorldgen(G, {seed, setPieces})   G = AshGlobe.createGlobe(...); seed defaults to G.seed
   COORDINATES: planar metres (x, y) of a face = the globe's face frame (origin at the centroid, seen from outside).
     Game tile (gx, gy) of a face covers x in [gx, gx+1), y in (-gy-1, -gy]: game x = east = x, game y = south = -y.
     Points beyond a face edge are unfolded into the neighbour (exact rigid map), so land reads continuously across seams.
   TILES: the core's letters (rules.json): . grass  , forest floor  f flowers  p path  d dirt  s sand  ~ water
     T P O W M Y trees  r boulder  R N I C G A ore  X tent footprint; NEW: ^ mountain rock, K standing stone / ruin wall /
     seam boundary stone (both block walking and sight). W.BLOCK / W.LOS list the blocking letters.
   API
     W.tileAt(face, gx, gy) / W.tiles(face, gx, gy, w, h) -> letter / [strings]   (a 64x64 chunk takes a few ms)
     W.sites(face, gx0, gy0, gx1, gy1)   [{id, face, kind, x, y, level, cls, monster?, spawns:[{m, x, y, uid, carry?}],
                                          objects:[{k, x, y, w, h}], nodes:[{x, y, t}], fishing:[{x, y, fish, req, xp, tool}]}]
                                          kinds: stones ruin standing_stone outcrop camp ore fishing; stable ids
     W.setSetPieces([{id, face, x, y, w, h, tiles, objects?, exits?, belt?}])   hand-made places win inside; their edges
                                          meet the seeded land without a seam: shared base height, 20 m height blend,
                                          edge woods continue at the same density and mix, 'p' and '~' runs continue as
                                          paths (forking) and streams (wg_paths.js)
     W.piecesFromZones(zones, face, gx, gy, {belt})   zone modules (data/zone.*.json) -> set pieces at game tile (gx, gy)
     W.sample(face, x, y, out?)          exact land at a point: {face, x, y (true face), ux, uy, uz, h, w[5] (creator, core,
                                          wild, sea, peak weights), cls, cell, forest, sand, peakS, pond, seamD, site,
                                          piece, hills, biome}   (W.BIOME names the biome codes)
     W.field(face, x, y, out?)           the same numbers interpolated from a cached 2 m lattice: Float64Array [h, forest,
                                          sand, peakS, pond, site, wCreator, wCore, wWild, wSea, wPeak, hills, seamD, piece]
     W.lattice(face, i, j)               exact cached sample at planar (2i, 2j), same layout (renderers use it)
     W.height(face, x, y)  W.walkable(face, x, y)  W.parcelAt(face, x, y)  W.coreSpawn()  W.dCore(face, x, y)
     W.fold(face, x, y) -> [face, x, y]  W.toSphere(face, x, y) -> [ux, uy, uz]  W.xform(f, g) -> [c, s, tx, ty]
     W.neighbourFace(f, k)  W.forTiles(face, x0, y0, x1, y1, fn)  W.objectsIn(face, x0, y0, x1, y1)
     W.WATER (0 m), W.BIOME, W.BLOCK, W.LOS, W.V, W.stats()
   Land rules: core = the Ashvale vale (meadows, woods in patches, ponds, stone circles, ruins, rat and wolf nests);
   creator = open meadow and forest; wild = dense woods on hills; sea = shore, shelf, deep water; peak = cliff, then a
   mountain rising to the corner. Classes blend over ~60 m with a +-70 m warp: no hexagon edges on the ground. */
(function (root) {
  'use strict';
  const API = 1, V = 1, WATER = 0;
  const META = { api: API, v: V, needs: { globe: 1, wg_geo: 1, wg_terrain: 1, wg_paths: 1, wg_sites: 1, wg_tiles: 1, wg_tables: 1 } };
  const BIOME = ['meadow', 'woods', 'deep woods', 'shore', 'shallows', 'deep water', 'rock', 'snow', 'site', 'hills', 'village'];
  const BLOCK = 'TPORNIr~FHXWMYCGA^K', LOS = 'TPORNIrHXWMYCGA^K';

  function make(deps) {
    const AG = deps.globe, geo = deps.wg_geo, T = deps.wg_tables;
    function createWorldgen(G, opts) {
      const O = opts || {};
      if (!G || !G.raw) throw new Error('worldgen: needs a globe (AshGlobe.createGlobe)');
      const seed = O.seed != null ? String(O.seed) : G.seed, S0 = geo.hashStr('worldgen1:' + seed);
      const sd = k => geo.mix32((S0 ^ Math.imul(k, 0x9e3779b9)) >>> 0);
      const ctx = { G, AshGlobe: AG, geo, T, WATER, BLOCK, seed,
        S: { w1: sd(1), w2: sd(2), w3: sd(3), hm: sd(4), hd: sd(5), hh: sd(6), pd: sd(7), fo: sd(8), rg: sd(9), tl: sd(10), st: sd(11), fl: sd(12), fi: sd(13), pa: sd(14), rn: sd(15), rb: sd(16), ps: sd(17), cm: sd(18), rv: sd(19) } };
      geo.attach(ctx); deps.wg_paths.attach(ctx); deps.wg_terrain.attach(ctx); deps.wg_sites.attach(ctx); deps.wg_tiles.attach(ctx);
      const SITE = T.sites.cell, NF = 18;   /* [17]: the water's own level where there is river or lake water (else the ground) */

      function finish(o) {
        const h = o.h;
        o.biome = o.piece >= 1 ? 10 : h < WATER - 0.3 ? 5 : h < WATER ? 4 : o.peakS > 0.1 ? (h > 70 ? 7 : 6) : o.sand > 0.35 ? 3 : o.site > 0.3 ? 8 :
          o.forest > 0.2 ? (o.w[2] > 0.5 ? 2 : 1) : o.hills > 2.5 && o.w[2] > 0.4 ? 9 : 0;
        return o;
      }
      /* exact sample of a TRUE-face point: land + site flattening + set-piece water dips */
      function sampleTrue(f, tx, ty, fb, out) {
        ctx.landInto(f, tx, ty, fb, out, ctx.PIECES.length > 0);
        const st = ctx.siteOf(f, Math.floor(tx / SITE), Math.floor(ty / SITE));
        if (st) {
          const dx = tx - st.x, dy = ty - st.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < st.r + 6) { const k = geo.sstep(st.r + 6, st.r - 2, d); out.h = out.h * (1 - k * 0.9) + st.base * k * 0.9; out.site = k; out.forest *= 1 - k; }
        }
        if (out.pieceId) {
          const pc = ctx.PIECE_BY_ID.get(out.pieceId), cx = Math.round(tx), cy = Math.round(-ty);
          let wet = 0;
          for (let k = 0; k < 4; k++) if (ctx.pieceTile(pc, cx - 1 + (k & 1), cy - 1 + (k >> 1)) === '~') wet++;
          if (!(ctx.seaPiece && ctx.seaPiece(pc))) { if (wet === 4) out.h = Math.min(out.h, pc.hb - 0.75); else if (wet) out.h = Math.min(out.h, pc.hb - 0.3); }   /* an inland pond only: a coastal town's water is the Atlas sea */
        }
        return finish(out);
      }
      const FB = new Float64Array(6), SMP = ctx.newSample();
      function sample(face, x, y, out) { ctx.foldInto(face, x, y, FB); return sampleTrue(FB[0], FB[1], FB[2], FB, out || SMP); }

      const LAT = new Map(), LS = ctx.newSample(), LFB = new Float64Array(6);
      function lattice(f, i, j) {
        const key = (f * 65536 + (i + 32768)) * 65536 + (j + 32768);
        let v = LAT.get(key);
        if (v) return v;
        ctx.foldInto(f, 2 * i, 2 * j, LFB);
        const s = sampleTrue(LFB[0], LFB[1], LFB[2], LFB, LS);
        v = new Float64Array(NF);
        v[0] = s.h; v[1] = s.forest; v[2] = s.sand; v[3] = s.peakS; v[4] = s.pond; v[5] = s.site;
        v[6] = s.w[0]; v[7] = s.w[1]; v[8] = s.w[2]; v[9] = s.w[3]; v[10] = s.w[4]; v[11] = s.hills; v[12] = s.seamD; v[13] = s.piece; v[14] = s.moist; v[15] = s.temp; v[16] = s.river; v[17] = s.river > 0.5 && s.wl > -1e8 ? s.wl : s.h;
        if (LAT.size > 150000) LAT.clear();
        LAT.set(key, v);
        return v;
      }
      function fieldTrue(f, x, y, out) {
        const gx = x / 2, gy = y / 2, i = Math.floor(gx), j = Math.floor(gy), tx = gx - i, ty = gy - j;
        const a = lattice(f, i, j), b = lattice(f, i + 1, j), c = lattice(f, i, j + 1), d = lattice(f, i + 1, j + 1);
        const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
        for (let k = 0; k < NF; k++) out[k] = a[k] * wa + b[k] * wb + c[k] * wc + d[k] * wd;
        /* the water level from the wet corners only, so a shore does not drag the surface down to the land */
        let ws = 0, ww = 0; if (a[16] > 0.5) { ws += a[17] * wa; ww += wa; } if (b[16] > 0.5) { ws += b[17] * wb; ww += wb; } if (c[16] > 0.5) { ws += c[17] * wc; ww += wc; } if (d[16] > 0.5) { ws += d[17] * wd; ww += wd; }
        out[17] = ww > 0 ? ws / ww : out[0];
        return out;
      }
      ctx.fieldTrue = fieldTrue;
      ctx.clearCaches = () => { LAT.clear(); ctx.clearSites(); };
      let EDL = T.edits || null, LASTPC = null;
      const setEdits = (list) => { EDL = list && list.length ? list.slice() : null; ctx.setEdits(EDL); ctx.clearCaches(); if (LASTPC) ctx.setSetPieces(LASTPC); ctx.clearCaches(); };   /* the world editor (the operator): the towns' pads follow the new ground */
      const FFB = new Float64Array(6), FLD = new Float64Array(NF);
      function field(face, x, y, out) { ctx.foldInto(face, x, y, FFB); return fieldTrue(FFB[0], FFB[1], FFB[2], out || FLD); }

      const PU = new Float64Array(3), PFB = new Float64Array(6);
      function parcelAt(face, x, y) { ctx.foldInto(face, x, y, PFB); ctx.bary2sphere(PFB[0], PFB[3], PFB[4], PFB[5], PU); return ctx.nearest(PU[0], PU[1], PU[2]); }
      function fold(face, x, y, out) { ctx.foldInto(face, x, y, PFB); out = out || [0, 0, 0]; out[0] = PFB[0]; out[1] = PFB[1]; out[2] = PFB[2]; return out; }
      function toSphere(face, x, y, out) { ctx.foldInto(face, x, y, PFB); ctx.bary2sphere(PFB[0], PFB[3], PFB[4], PFB[5], PU); out = out || [0, 0, 0]; out[0] = PU[0]; out[1] = PU[1]; out[2] = PU[2]; return out; }
      function coreSpawn() { const p = G.planar(ctx.CL.coreCenter); return { face: p.face, x: p.x, y: p.y }; }
      function dCore(face, x, y) { toSphere(face, x, y, PU); return ctx.coreDistU(PU[0], PU[1], PU[2]); }

      /* things to draw (set-piece objects, camp tents and fires, fishing spots) whose centres lie in the planar rect of
         `face`: [{k, x, y, w, h, c, s, face, fish?}] with (x, y) the centre in `face`'s plane, w x h metres along the
         rotated axes (c, s) = the rotation from the object's own face frame into `face`'s */
      function objectsIn(face, x0, y0, x1, y1) {
        const out = [], TB = new Float64Array(3);
        for (let pass = -1; pass < 3; pass++) {
          let gf = face, c = 1, s = 0, tx = 0, ty = 0;
          if (pass >= 0) {
            gf = ctx.ADJ[face * 3 + pass];
            ctx.baryInto(face, (x0 + x1) / 2, (y0 + y1) / 2, TB);
            if (TB[pass] * ctx.HGT > Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) / 2 + 80) continue;
            const o = (face * 3 + pass) * 4; c = ctx.XF[o]; s = ctx.XF[o + 1]; tx = ctx.XF[o + 2]; ty = ctx.XF[o + 3];
          }
          let gx0 = 1e30, gy0 = 1e30, gx1 = -1e30, gy1 = -1e30;
          for (let k = 0; k < 4; k++) {
            const px = k & 1 ? x1 : x0, py = k & 2 ? y1 : y0, qx = c * px - s * py + tx, qy = s * px + c * py + ty;
            if (qx < gx0) gx0 = qx; if (qx > gx1) gx1 = qx; if (qy < gy0) gy0 = qy; if (qy > gy1) gy1 = qy;
          }
          const add = (o, fish) => {
            const qx = o.x + o.w / 2, qy = -o.y - o.h / 2;
            const ax = pass < 0 ? qx : c * (qx - tx) + s * (qy - ty), ay = pass < 0 ? qy : -s * (qx - tx) + c * (qy - ty);
            if (ax < x0 || ax >= x1 || ay < y0 || ay >= y1) return;
            const r = Object.assign({}, o, { x: ax, y: ay, c, s: -s, face: gf, gx: o.x, gy: o.y });
            if (fish) r.fish = fish;
            out.push(r);
          };
          for (const pc of ctx.PIECES) if (pc.face === gf) for (const o of pc.objects) add(o);
          const tg0 = Math.floor(gx0), tg1 = Math.floor(gx1), tgy0 = Math.floor(-gy1), tgy1 = Math.floor(-gy0);
          for (const r of ctx.sites(gf, tg0, tgy0, tg1, tgy1)) {
            for (const o of r.objects) add(o);
            for (const fs of r.fishing) add({ k: 'fish', x: fs.x, y: fs.y, w: 1, h: 1 }, fs.fish);
          }
          /* sites whose centre is outside the rect can still have tents inside it */
          for (let sy = Math.floor(gy0 / SITE) - 1; sy <= Math.floor(gy1 / SITE) + 1; sy++) for (let sx = Math.floor(gx0 / SITE) - 1; sx <= Math.floor(gx1 / SITE) + 1; sx++) {
            const st = ctx.siteOf(gf, sx, sy); if (!st || !st.objects.length) continue;
            const tx2 = Math.floor(st.x), ty2 = Math.floor(-st.y);
            if (tx2 >= tg0 && tx2 <= tg1 && ty2 >= tgy0 && ty2 <= tgy1) continue;
            for (const o of st.objects) add(o);
          }
        }
        return out;
      }

      /* zone modules (data/zone.*.json: origin, size, tiles, objects in one shared map) -> set pieces placed with the
         shared map's (0, 0) at game tile (gx, gy) of `face`; opts.belt = {zoneId: metres of continuing woods} */
      const decks = (z) => { const L = (z.objects || []).filter(o => o.k === 'pier' || o.k === 'bridge'); if (!L.length) return z.tiles;   /* piers and bridges are assets: their decks are laid here (the operator) */
        const ox = z.origin[0], oy = z.origin[1], T = z.tiles.map(r => r.split(''));
        for (const o of L) for (let y = o.y; y < o.y + (o.h || 1); y++) for (let x = o.x; x < o.x + (o.w || 1); x++) { const r = T[y - oy]; if (r && x - ox >= 0 && x - ox < r.length) r[x - ox] = 'B'; }
        return T.map(r => r.join('')); };
      function piecesFromZones(zones, face, gx, gy, popts) {
        const belt = (popts && popts.belt) || {}, links = (popts && popts.links) || [];   /* links: [[fromId, toId]] trails between pieces */
        return zones.map(z => {
          const ox = z.origin[0], oy = z.origin[1], w = z.size[0], h = z.size[1];
          const objs = (z.objects || []).filter(o => o.x >= ox && o.y >= oy && o.x < ox + w && o.y < oy + h).map(o => Object.assign({}, o, { x: o.x + gx, y: o.y + gy }));
          return { id: z.id, face, x: gx + ox, y: gy + oy, w, h, tiles: decks(z), objects: objs, belt: belt[z.id] || 0, links: links.filter(l => l[0] === z.id).map(l => l[1]) };
        });
      }
      if (O.setPieces) { LASTPC = O.setPieces; ctx.setSetPieces(O.setPieces); }
      return {
        api: API, V, WATER, BIOME, BLOCK, LOS, seed, G, climOf: ctx.climOf || null, climate: ctx.climate || null, rivers: ctx.rivers || null, riverLines: () => ctx.rivers ? ctx.rivers.lines() : null,
        sample, newSample: ctx.newSample, field, lattice, height: (f, x, y) => sample(f, x, y, SMP).h,
        setEdits, edits: () => EDL,
        walkable: ctx.walkable, tileAt: ctx.tileAt, tiles: ctx.tiles, forTiles: ctx.forTiles, sites: ctx.sites, setSetPieces: (l) => { LASTPC = l; ctx.setSetPieces(l); }, piecesFromZones, objectsIn,
        parcelAt, fold, toSphere, xform: ctx.xform, coreSpawn, dCore,
        neighbourFace: (f, k) => ctx.ADJ[f * 3 + k], faceHeight: ctx.HGT, faceEdge: ctx.EDGE,
        faceCorners: f => [[ctx.FQ[f * 6], ctx.FQ[f * 6 + 1]], [ctx.FQ[f * 6 + 2], ctx.FQ[f * 6 + 3]], [ctx.FQ[f * 6 + 4], ctx.FQ[f * 6 + 5]]],
        pieces: () => ctx.PIECES.map(p => ({ id: p.id, face: p.face, x: p.x, y: p.y, w: p.w, h: p.h, hb: p.hb })),
        stats: () => ({ lattice: LAT.size, pathSegments: ctx.pathCount() })
      };
    }
    return { api: API, V, WATER, BIOME, BLOCK, LOS, createWorldgen };
  }

  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('worldgen', META, make);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = make({ globe: require('./globe.js'), wg_geo: require('./wg_geo.js'), wg_terrain: require('./wg_terrain.js'), wg_paths: require('./wg_paths.js'),
      wg_sites: require('./wg_sites.js'), wg_tiles: require('./wg_tiles.js'), wg_tables: require('../data/atlas/wg_tables.json').data });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
