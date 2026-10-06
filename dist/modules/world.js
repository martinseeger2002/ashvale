/* ASHVALE world (module `world`, api 1): the map the rules walk on, as a SPARSE CHUNK STORE (GLOBE.md P2).
   Before P2 the core merged every zone into one W x H array. Now the map is 64 x 64 tile chunks, filled on demand from
   the set pieces (today's zone modules, which keep their own coordinates) and, from P2 step B, from worldgen; filled
   chunks are cached and far, unused ones are dropped (least recently used; set-piece chunks stay). A chunk is a pure
   function of the data + its coordinates, so two games that fill the same chunk get identical tiles and replays hold.

   FRAMES. The core works in the VALE FRAME: integer tiles where the village and Whisperwood keep their old coordinates.
   The vale frame is the core face's tile frame (globecfg.face; x = east = planar x, y = south = -planar y, 1 tile = 1 m,
   as in worldgen) shifted by globecfg.origin, so a globe position is (face, origin + x, origin + y). Keeping the old
   numbers keeps every save, test and replay hash, and keeps render coordinates small near the spawn.
   AREAS (respawn, authority, weather): a set piece's tiles belong to its zone id ('village', 'whisperwood'); other land
   belongs to 128 m areas 'face:ax:ay' on the globecfg grid. REGIONS (one shared room each): 512 m squares on that grid,
   'vale:face:rx:ry'; both set pieces sit inside one region.

   const W = AshWorld.createWorld(DATA, {bounds?, fill?, maxChunks?})   DATA = {rules, zones, globecfg?}
     W.key(x, y) / W.kx(k) / W.ky(k)   packed tile key (a number, exact up to |x|, |y| < 2^24) and back
     W.tileAt(x, y)  W.blocked(x, y)  W.losAt(x, y)  W.wallAt(x, y)  W.insideAt(x, y)   tile letter, blocks walking,
                                       blocks sight, wall bits on tile edges (N1 E2 S4 W8), inside a walk-in building
     W.zoneAt(x, y)                    the area id (see above)          W.regionOf(x, y)   the room id
     W.inWorld(x, y)                   inside the playable bounds (P2 step A: the old map; step B: the base region)
     W.nodeAt(k)                       the static node at a tile key (tree, rock, fishing spot, range) or undefined
     W.npcs W.spawns W.objects W.nodes W.respawn W.W W.H W.pieces   set-piece content (W.W/W.H = the old map size)
     W.chunk(cx, cy) -> {cx, cy, x0, y0, t: Uint8Array letters, zi: Uint8Array piece index + 1 (0 = seeded), area}
     W.onFill(fn(chunk))               called once per newly filled chunk (site spawning hooks in here)
     W.toFace(x, y) -> [face, gx, gy]   W.fromFace(face, gx, gy) -> [x, y] | null   W.cfg   W.stats()
   opts.fill(x0, y0, t, zi) may write letters into t where zi is 0 (worldgen, step B); without it that land is the
   filler letter (an impassable tree), exactly like the old map's outside. */
(function (root) {
  'use strict';
  const API = 1, V = 1, SH = 6, CH = 64, CM = 63;
  const KOFF = 16777216, KSPAN = 33554432;
  const key = (x, y) => (y + KOFF) * KSPAN + (x + KOFF);
  const kx = k => (k % KSPAN) - KOFF, ky = k => Math.floor(k / KSPAN) - KOFF;
  const CHR = []; for (let i = 0; i < 256; i++) CHR.push(String.fromCharCode(i));
  const DEF_CFG = { seed: 'ashvale', n: 128, radius_m: 36110, face: 11, origin: [-24, 164], grid: [-216, -28], chunk: 64, area: 128, region: 512, belt: {} };

  function createWorld(D, opts) {
    opts = opts || {};
    const RT = D.rules.tiles, RN = D.rules.nodes || {}, CFG = Object.assign({}, DEF_CFG, D.globecfg || {});
    const FACE = CFG.face, OX = CFG.origin[0], OY = CFG.origin[1], GX = OX - CFG.grid[0], GY = OY - CFG.grid[1], AREA = CFG.area, REG = CFG.region;
    const FILL = (opts.filler || 'T').charCodeAt(0), MAXC = opts.maxChunks || 160;
    /* seeded land (P2 step B): D.wg = a worldgen instance with the set pieces placed (AshWorld.seededWorldgen). Its tiles
       fill every chunk outside the set pieces; without it the outside is the filler, as before. */
    const WG = D.wg || null;
    const fillFn = opts.fill || (WG ? (x0, y0, t, zi) => {
      const rows = WG.tiles(FACE, x0 + OX, y0 + OY, CH, CH);
      for (let y = 0; y < CH; y++) { const r = rows[y]; for (let x = 0; x < CH; x++) { const i = (y << SH) | x; if (!zi[i]) t[i] = r.charCodeAt(x); } }
    } : null);
    const BLK = new Uint8Array(256), SEE = new Uint8Array(256), NODE = [];
    for (const c of RT.block) BLK[c.charCodeAt(0)] = 1;
    for (const c of RT.los) SEE[c.charCodeAt(0)] = 1;
    for (let i = 0; i < 256; i++) NODE.push(RN[CHR[i]] ? RN[CHR[i]] : null);

    /* ---- set pieces: tiles, NPCs, spawns, objects, fixed nodes (fishing first, then ranges win over a tile's own node) */
    const pieces = [], npcs = [], spawns = [], objects = [], nodes = new Map(), fixed = new Set();
    let W = 0, H = 0, respawn = null;
    const decks = (z) => { const L = (z.objects || []).filter(o => o.k === 'pier' || o.k === 'bridge'); if (!L.length) return z.tiles;   /* piers and bridges are assets: their decks are laid here (the operator) */
      const ox = z.origin[0], oy = z.origin[1], T = z.tiles.map(r => r.split(''));
      for (const o of L) for (let y = o.y; y < o.y + (o.h || 1); y++) for (let x = o.x; x < o.x + (o.w || 1); x++) { const r = T[y - oy]; if (r && x - ox >= 0 && x - ox < r.length) r[x - ox] = 'B'; }
      return T.map(r => r.join('')); };
    for (const z of D.zones) {
      pieces.push({ id: z.id, x0: z.origin[0], y0: z.origin[1], x1: z.origin[0] + z.size[0], y1: z.origin[1] + z.size[1], tiles: decks(z) });
      W = Math.max(W, z.origin[0] + z.size[0]); H = Math.max(H, z.origin[1] + z.size[1]);
      for (const n of z.npcs || []) npcs.push(Object.assign({ zone: z.id }, n));
      for (const s of z.spawns || []) spawns.push(Object.assign({ zone: z.id }, s));
      for (const o of z.objects || []) objects.push(Object.assign({ zone: z.id }, o));
      for (const f of z.fishing || []) { const k = key(f.x, f.y); nodes.set(k, { kind: 'fish', x: f.x, y: f.y, item: f.fish, req: f.req, xp: f.xp, tool: f.tool }); fixed.add(k); }
      if (z.respawn) respawn = z.respawn;
    }
    for (const o of objects) if (o.k === 'range') { const k = key(o.x, o.y); nodes.set(k, { kind: 'range', x: o.x, y: o.y }); fixed.add(k); }
    const B = opts.bounds || [0, 0, W, H];
    let inWorld = (x, y) => x >= B[0] && y >= B[1] && x < B[0] + B[2] && y < B[1] + B[3];
    if (WG && !opts.bounds) {
      /* play is limited to the core face (decision for the first globe release, see handoff/globe_p2_status.md): its
         triangle in the vale frame, kept MARGIN metres inside each edge, so the seam strips and the neighbour faces are
         seen but not walked on until seam ports exist (GLOBE.md section 1) */
      const C = WG.faceCorners(FACE).map(q => [q[0] - OX, -q[1] - OY]), E = [], MARGIN = CFG.margin || 48;
      for (let k = 0; k < 3; k++) {
        const a = C[k], b = C[(k + 1) % 3], c = C[(k + 2) % 3]; let nx = a[1] - b[1], ny = b[0] - a[0];
        const L = Math.sqrt(nx * nx + ny * ny); nx /= L; ny /= L; if (nx * (c[0] - a[0]) + ny * (c[1] - a[1]) < 0) { nx = -nx; ny = -ny; }
        E.push([nx, ny, -(nx * a[0] + ny * a[1]) - MARGIN]);
      }
      inWorld = (x, y) => { const px = x + 0.5, py = y + 0.5; return E[0][0] * px + E[0][1] * py + E[0][2] >= 0 && E[1][0] * px + E[1][1] * py + E[1][2] >= 0 && E[2][0] * px + E[2][1] * py + E[2][2] >= 0; };
    }
    /* walk-in buildings: walls stand on tile EDGES (bits N1 E2 S4 W8, set on both sides), the door edge is open;
       built once into sparse maps (inside the old map's rectangle, as before), then baked into each chunk as it fills */
    const wall = new Map(), inside = new Set(), open = new Set();
    /* the walk-in buildings with more than one storey, and the tile their stairs stand on (an inside corner, away from
       the door unless the object names one) */
    const STOREYED = [];
    for (const o of objects) if (o.enter && (o.floors | 0) > 1) {
      let st = o.stairsAt;
      if (!st) { const dx = o.door ? o.door[0] : -9; st = [Math.abs(dx - (o.x + o.w - 2)) > 1 ? o.x + o.w - 2 : o.x + 1, o.y + 1]; }
      const alt = [st[0] - 1 > o.x ? st[0] - 1 : st[0] + 1, st[1]];   /* the flights alternate st / alt floor by floor (a switchback) */
      STOREYED.push({ x: o.x, y: o.y, w: o.w, h: o.h, floors: o.floors | 0, stairs: st, alt, lh: o.lh || null });   /* lh: a storey's height (the castle keep's are 3.2 m) */
    }
    /* raised walkable ground (kind 'cdeck', tools/castle/make_castle.js; 2026-10-05: walls "should be able to have a
       character walking on them", and the stairs "should be like the terrain and I just walk up them"): the wall walk and
       tower tops (o.cells) stand o.lh metres up, the stair tiles (o.ramps [x, y, metres]) in between. A step between two
       tiles is allowed when their heights differ by 2.3 m or less (src/core.js canStep), so you walk up the stairs onto
       the wall and cannot step off it into the yard. */
    const LIFT = new Map();
    for (const o of objects) if (o.k === 'cdeck' && o.cells) { for (const c of o.cells) LIFT.set(c[0] + ',' + c[1], o.lh || 4.2); for (const r of o.ramps || []) LIFT.set(r[0] + ',' + r[1], r[2]); }
    const buildingAt = (x, y) => { for (let i = 0; i < STOREYED.length; i++) { const b = STOREYED[i]; if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return i; } return -1; };
    const inOld = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const wset = (x, y, b) => { const k = key(x, y); wall.set(k, (wall.get(k) || 0) | b); };   /* anywhere: not only the old map's rectangle (the operator: walls you could walk through) */
    const wclr = (x, y, b) => { const k = key(x, y); wall.set(k, (wall.get(k) || 0) & ~b); };
    for (const o of objects) if (o.enter) {
      const x1 = o.x + o.w - 1, y1 = o.y + o.h - 1;
      for (let x = o.x; x <= x1; x++) { wset(x, o.y, 1); wset(x, o.y - 1, 4); wset(x, y1, 4); wset(x, y1 + 1, 1); }
      for (let y = o.y; y <= y1; y++) { wset(o.x, y, 8); wset(o.x - 1, y, 2); wset(x1, y, 2); wset(x1 + 1, y, 8); }
      if (o.door) {
        const [dx, dy] = o.door;
        if (dy === o.y) { wclr(dx, dy, 1); wclr(dx, dy - 1, 4); } else if (dy === y1) { wclr(dx, dy, 4); wclr(dx, dy + 1, 1); }
        else if (dx === o.x) { wclr(dx, dy, 8); wclr(dx - 1, dy, 2); } else { wclr(dx, dy, 2); wclr(dx + 1, dy, 8); }
      }
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) inside.add(key(x, y));   /* monsters never wander into buildings */
    }
    for (const n of npcs) open.add(key(n.x, n.y));   /* an NPC's own tile is never blocked */
    const HB = WG && WG.pieces().length ? WG.pieces()[0].hb : 0;
    const extras = new Map();   /* chunk key -> [[tile key, kind, value]] */
    const ext = (k, kind, v) => { const ck = key(kx(k) >> SH, ky(k) >> SH); if (!extras.has(ck)) extras.set(ck, []); extras.get(ck).push([k, kind, v]); };
    for (const [k, b] of wall) ext(k, 0, b);
    for (const k of inside) ext(k, 1, 0);
    for (const k of open) ext(k, 2, 0);

    /* ---- the chunk store */
    const chunks = new Map(), fillFns = [];
    let lcx = 0x7fffffff, lcy = 0x7fffffff, lc = null, clock = 0, filled = 0, dropped = 0;
    const areaId = (x, y) => FACE + ':' + Math.floor((x + GX) / AREA) + ':' + Math.floor((y + GY) / AREA);
    function fill(cx, cy) {
      const x0 = cx << SH, y0 = cy << SH, t = new Uint8Array(CH * CH).fill(FILL), fl = new Uint8Array(CH * CH), wl = new Uint8Array(CH * CH), zi = new Uint8Array(CH * CH);
      let pinned = false;
      for (let p = 0; p < pieces.length; p++) {
        const P = pieces[p], ax = Math.max(x0, P.x0), ay = Math.max(y0, P.y0), bx = Math.min(x0 + CH, P.x1), by = Math.min(y0 + CH, P.y1);
        if (ax >= bx || ay >= by) continue;
        pinned = true;
        for (let y = ay; y < by; y++) { const row = P.tiles[y - P.y0]; for (let x = ax; x < bx; x++) { const i = ((y - y0) << SH) | (x - x0); t[i] = row.charCodeAt(x - P.x0); zi[i] = p + 1; } }
      }
      if (fillFn) fillFn(x0, y0, t, zi);
      for (let i = 0; i < CH * CH; i++) { const c = t[i]; fl[i] = BLK[c] | (SEE[c] << 1); }
      for (const [k, kind, v] of extras.get(key(cx, cy)) || []) {
        const i = ((ky(k) & CM) << SH) | (kx(k) & CM);
        if (kind === 0) wl[i] = v; else if (kind === 1) fl[i] |= 4; else fl[i] &= ~1;
      }
      /* gathering nodes from the tile letters (trees, rocks); the filler around the old map has none */
      if (fillFn || pinned) for (let i = 0; i < CH * CH; i++) {
        const nd = NODE[t[i]]; if (!nd || (!zi[i] && !fillFn)) continue;
        const x = x0 + (i & CM), y = y0 + (i >> SH), k = key(x, y);
        if (!nodes.has(k)) nodes.set(k, { kind: CHR[t[i]], x, y, item: nd.item });
      }
      if (WG) for (const st of WG.sites(FACE, x0 + OX, y0 + OY, x0 + OX + CH - 1, y0 + OY + CH - 1)) for (const f of st.fishing) {   /* seeded fishing spots */
        const k = key(f.x - OX, f.y - OY); if (!nodes.has(k)) { nodes.set(k, { kind: 'fish', x: f.x - OX, y: f.y - OY, item: f.fish, req: f.req, xp: f.xp, tool: f.tool }); fixed.add(k); }
      }
      const c = { cx, cy, x0, y0, t, fl, wl, zi, area: areaId(x0, y0), pinned, used: ++clock };
      chunks.set(key(cx, cy), c); filled++;
      if (chunks.size > MAXC) trim();
      for (const fn of fillFns) fn(c);
      return c;
    }
    function trim() {   /* drop the least recently used chunks that hold no set piece, down to 3/4 of the limit */
      const L = Array.from(chunks.values()).filter(c => !c.pinned).sort((a, b) => a.used - b.used);
      for (let n = 0; n < L.length && chunks.size > (MAXC * 3 >> 2); n++) {
        const c = L[n]; if (c.used === clock) continue;
        chunks.delete(key(c.cx, c.cy)); dropped++;
        for (let i = 0; i < CH * CH; i++) if (NODE[c.t[i]]) { const k = key(c.x0 + (i & CM), c.y0 + (i >> SH)); if (!fixed.has(k)) nodes.delete(k); }
        if (c === lc) { lc = null; lcx = lcy = 0x7fffffff; }
      }
    }
    function chunkAt(x, y) {
      const cx = x >> SH, cy = y >> SH;
      if (cx === lcx && cy === lcy) return lc;
      let c = chunks.get(key(cx, cy)); if (!c) c = fill(cx, cy);
      c.used = ++clock; lcx = cx; lcy = cy; lc = c; return c;
    }
    const ci = (x, y) => ((y & CM) << SH) | (x & CM);
    const tileAt = (x, y) => CHR[chunkAt(x, y).t[ci(x, y)]];
    const blocked = (x, y) => chunkAt(x, y).fl[ci(x, y)] & 1;
    const losAt = (x, y) => (chunkAt(x, y).fl[ci(x, y)] >> 1) & 1;
    const insideAt = (x, y) => (chunkAt(x, y).fl[ci(x, y)] >> 2) & 1;
    const wallAt = (x, y) => chunkAt(x, y).wl[ci(x, y)];
    function zoneAt(x, y) { const c = chunkAt(x, y), z = c.zi[ci(x, y)]; return z ? pieces[z - 1].id : c.area; }
    function nodeAt(k) { chunkAt(kx(k), ky(k)); return nodes.get(k); }
    for (const P of pieces) for (let y = P.y0 >> SH; y <= (P.y1 - 1) >> SH; y++) for (let x = P.x0 >> SH; x <= (P.x1 - 1) >> SH; x++) chunkAt(x << SH, y << SH);   /* set pieces: filled now, kept */
    /* yard birds (2026-10-04: "chickens running around and flying around wherever there are buildings"): any set
       piece with buildings gets rules.yard.n birds per rules.yard.per buildings (a pair of houses, two hens), each on a
       free outdoor tile by one of the buildings. Deterministic from the building positions; added after every zone's
       own spawns, so the uids those already had do not move. */
    const YD = D.rules && D.rules.yard;
    if (YD) for (const P of pieces) {
      const bl = objects.filter(o => o.zone === P.id && YD.kinds.indexOf(o.k) >= 0).sort((a, b) => a.y - b.y || a.x - b.x);
      let made = 0;
      for (let i = YD.per - 1; i < bl.length && made < YD.max; i += YD.per) {
        const o = bl[i], w = o.w || 1, h = o.h || 1, ring = [];
        for (let x = o.x - 2; x <= o.x + w + 1; x++) ring.push([x, o.y - 2], [x, o.y + h + 1]);
        for (let y = o.y - 1; y <= o.y + h; y++) ring.push([o.x - 2, y], [o.x + w + 1, y]);
        for (let k = 0, t = (o.x * 7 + o.y * 13) % ring.length; k < YD.n && made < YD.max && t < (o.x * 7 + o.y * 13) % ring.length + ring.length; t++) {
          const [x, y] = ring[t % ring.length];
          if (zoneAt(x, y) !== P.id || blocked(x, y) || insideAt(x, y) || spawns.some(q => q.x === x && q.y === y)) continue;
          spawns.push({ zone: P.id, m: YD.birds[(i + k) % YD.birds.length], x, y }); k++; made++; t += 3;
        }
      }
    }

    return {
      API, CH, cfg: CFG, key, kx, ky, W, H, pieces, npcs, spawns, objects, nodes, respawn: respawn || [Math.floor(W / 2), Math.floor(H / 2)],
      tileAt, blocked, losAt, wallAt, insideAt, zoneAt, nodeAt, inWorld,
      regionOf: (x, y) => 'vale:' + FACE + ':' + Math.floor((x + GX) / REG) + ':' + Math.floor((y + GY) / REG),
      seeded: !!WG, inPiece: (x, y) => !!chunkAt(x, y).zi[ci(x, y)],
      /* seeded land, in the vale frame: sites (camps, ore, fishing; ids and monster uids from worldgen), the ground height
         at a tile corner relative to the set pieces' base height (so the old map keeps its own heights), the biome */
      sitesIn(x0, y0, x1, y1) {
        if (!WG) return [];
        const mv = o => Object.assign({}, o, { x: o.x - OX, y: o.y - OY });
        return WG.sites(FACE, x0 + OX, y0 + OY, x1 + OX, y1 + OY).map(st => Object.assign({}, st, { x: st.x - OX, y: st.y - OY, spawns: st.spawns.map(mv), objects: st.objects.map(mv), fishing: st.fishing.map(mv), nodes: st.nodes.map(mv) }));
      },
      groundH: (cx, cy) => WG ? WG.field(FACE, cx + OX, -(cy + OY))[0] - HB : 0,
      snowH: WG ? (CFG.snowLine || 110) - HB : 1e9,   /* the snow line (2026-10-03) in groundH's frame; tree snow starts 55 m below it, alpine rock 22 m below */
      waterH: () => WG ? WG.WATER - HB : 0,
      /* the surface of a river or lake over this tile (worldgen's own level, in groundH's frame), or null where the
         world holds no such water (the sea, a set piece's pond or well) - 2026-10-04: "The water should always be flat" */
      waterSurf: (x, y) => { if (!WG) return null; const f = WG.field(FACE, x + OX + 0.5, -(y + OY + 0.5)); return f[16] > 0.5 && f[17] > WG.WATER + 0.05 ? f[17] - HB : null; },
      forestAt: (x, y) => WG ? WG.field(FACE, x + OX + 0.5, -(y + OY + 0.5))[1] : 0,
      liftAt: (x, y) => LIFT.size ? (LIFT.get(x + ',' + y) || 0) : 0, lifts: LIFT.size,
      buildings: STOREYED, buildingAt, stairsOf: (i) => STOREYED[i] ? STOREYED[i].stairs : null,
      flightOf: (i, f) => { const b = STOREYED[i]; return !b ? null : (f % 2 && b.alt) ? b.alt : b.stairs; },   /* the tile of the flight from floor f up */   /* multi-storey walk-in buildings (the operator: stairs, upper floors) */
      climateAt: (x, y) => { if (!WG || !WG.climOf) return -1; const f = WG.field(FACE, x + OX + 0.5, -(y + OY + 0.5)); return WG.climOf(f[15], f[14]); },   /* the climate zone (worldgen) */
      coastAt: (x, y) => WG ? WG.field(FACE, x + OX + 0.5, -(y + OY + 0.5))[9] : 0,
      chunk: (cx, cy) => chunkAt(cx << SH, cy << SH),
      onFill(fn) { fillFns.push(fn); for (const c of chunks.values()) fn(c); },
      toFace: (x, y) => [FACE, x + OX, y + OY],
      fromFace: (f, gx, gy) => f === FACE ? [gx - OX, gy - OY] : null,
      stats: () => ({ chunks: chunks.size, filled, dropped, nodes: nodes.size })
    };
  }

  /* a worldgen instance for the game: the globe from globecfg, the set pieces (zone modules) placed at globecfg.origin
     with globecfg.belt metres of continuing woods. AshWorld.seededWorldgen(worldgenModule, AshGlobe, DATA) */
  function seededWorldgen(WGM, AG, D) {
    const C = Object.assign({}, DEF_CFG, D.globecfg || {});
    const G = AG.createGlobe({ n: C.n, radius_m: C.radius_m, seed: C.seed });
    const W = WGM.createWorldgen(G, { seed: C.seed });
    W.setSetPieces(W.piecesFromZones(D.zones, C.face, C.origin[0], C.origin[1], { belt: C.belt || {}, links: C.links || [] }));
    return W;
  }
  const AshWorld = { API, V, CH, createWorld, seededWorldgen, key, kx, ky };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('world', { api: API, v: V }, () => AshWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = AshWorld;
  root.AshWorld = AshWorld;
})(typeof globalThis !== 'undefined' ? globalThis : this);
