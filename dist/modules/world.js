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
    /* THE OPEN GLOBE (handoff/globe_net.md, 2026-10-08): the vale frame is face FACE's plane, and the other 19 faces are laid
       into it as one flat net. onFace(vx, vy): the face a map point shows and where on that face's plane (vale y runs south). On
       FACE itself it is the identity, so everything there - the towns, every save - keeps its numbers. */
    const NET = WG && WG.net && !CFG.fenced ? WG.net(FACE) : null;
    function onFace(vx, vy) { const px = vx + OX, py = -(vy + OY); if (!NET) return [FACE, px, py]; const r = NET.toFace(px, py); return [r.f, r.x, r.y]; }
    const onF0 = (x0, y0, w, h) => !NET || [[0, 0], [w, 0], [0, h], [w, h], [w / 2, h / 2]].every(q => onFace(x0 + q[0], y0 + q[1])[0] === FACE);
    const fieldAt = (vx, vy) => { const q = onFace(vx, vy); return WG.field(q[0], q[1], q[2]); };
    /* the seeded sites (camps, ore, fishing) of a vale rectangle: FACE's as ever; another face's mapped through the net, only where
       that face is at home (none in the space past a cut edge, so nothing appears twice) */
    function netSites(x0, y0, x1, y1) {
      const id = (st) => st;
      if (onF0(x0, y0, x1 - x0 + 1, y1 - y0 + 1)) return WG.sites(FACE, x0 + OX, y0 + OY, x1 + OX, y1 + OY).map(id);
      const faces = new Set(); for (const q of [[x0, y0], [x1 + 1, y0], [x0, y1 + 1], [x1 + 1, y1 + 1], [(x0 + x1) / 2, (y0 + y1) / 2]]) faces.add(onFace(q[0], q[1])[0]);
      const out = [];
      for (const f of faces) {
        if (f === FACE) { for (const st of WG.sites(FACE, x0 + OX, y0 + OY, x1 + OX, y1 + OY)) if (NET.nearest(st.x + 0.5, -st.y - 0.5).f === FACE) out.push(st); continue; }
        let a = 1e30, b = 1e30, c = -1e30, d = -1e30;
        for (const q of [[x0, y0], [x1 + 1, y0], [x0, y1 + 1], [x1 + 1, y1 + 1]]) { const r = NET.toFace(q[0] + OX, -(q[1] + OY)); a = Math.min(a, r.x); c = Math.max(c, r.x); b = Math.min(b, -r.y); d = Math.max(d, -r.y); }
        const mv = (o) => { const p = NET.fromFace(f, o.x + 0.5, -o.y - 0.5); return Object.assign({}, o, { x: Math.floor(p[0]) - OX, y: Math.floor(-p[1]) - OY }); };
        for (const st of WG.sites(f, Math.floor(a), Math.floor(b), Math.ceil(c), Math.ceil(d))) {
          const m = mv(st); if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
          const n = NET.nearest(m.x + OX + 0.5, -(m.y + OY) - 0.5); if (n.f !== f || n.d > 0) continue;
          out.push(Object.assign(m, { spawns: (st.spawns || []).map(mv), objects: (st.objects || []).map(mv), fishing: (st.fishing || []).map(mv), nodes: (st.nodes || []).map(mv), shifted: 1 }));
        }
      }
      return out;
    }
    const fillFn = opts.fill || (WG ? (x0, y0, t, zi) => {
      const ROCK = 94;   /* '^' */
      if (onF0(x0, y0, CH, CH)) {
        const rows = WG.tiles(FACE, x0 + OX, y0 + OY, CH, CH);
        for (let y = 0; y < CH; y++) { const r = rows[y]; for (let x = 0; x < CH; x++) { const i = (y << SH) | x; if (!zi[i]) t[i] = underNear(x0 + x, y0 + y) ? ROCK : r.charCodeAt(x); } }
        return;
      }
      for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) { const i = (y << SH) | x; if (zi[i]) continue;   /* another face of the globe, through the net */
        const q = onFace(x0 + x + 0.5, y0 + y + 0.5); t[i] = underNear(x0 + x, y0 + y) ? ROCK : WG.tileAt(q[0], Math.floor(q[1]), Math.floor(-q[2])).charCodeAt(0); }
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
    /* one zone's content into the set-piece lists; returns what it added (area loading adds zones later: M.addZone) */
    function ingest(z) {
      const n0 = npcs.length, s0 = spawns.length, o0 = objects.length;
      pieces.push({ id: z.id, x0: z.origin[0], y0: z.origin[1], x1: z.origin[0] + z.size[0], y1: z.origin[1] + z.size[1], tiles: decks(z) });
      W = Math.max(W, z.origin[0] + z.size[0]); H = Math.max(H, z.origin[1] + z.size[1]);
      for (const n of z.npcs || []) npcs.push(Object.assign({ zone: z.id }, n));
      for (const s of z.spawns || []) spawns.push(Object.assign({ zone: z.id }, s));
      for (const o of z.objects || []) objects.push(Object.assign({ zone: z.id }, o));
      for (const f of z.fishing || []) { const k = key(f.x, f.y); nodes.set(k, { kind: 'fish', x: f.x, y: f.y, item: f.fish, req: f.req, xp: f.xp, tool: f.tool }); fixed.add(k); }
      if (z.respawn) respawn = z.respawn;
      return { npcs: npcs.slice(n0), spawns: spawns.slice(s0), objects: objects.slice(o0) };
    }
    for (const z of D.zones) ingest(z);
    /* ranges, altars, and a town's own campfires (2026-10-07: "You should also be able to cook on the campfire in the Indian village"): cook at a campfire as at one you lit */
    const ranges = (objs) => { for (const o of objs) if (o.k === 'range' || o.k === 'altar' || o.k === 'campfire') { const k = key(o.x, o.y); nodes.set(k, { kind: o.k === 'campfire' ? 'fire' : o.k, x: o.x, y: o.y, chapel: o.chapel || null }); fixed.add(k); } };
    ranges(objects);
    let minX = 0, minY = 0;
    for (const P of pieces) { if (P.x0 < minX) minX = P.x0; if (P.y0 < minY) minY = P.y0; }
    const B = opts.bounds || [minX, minY, W - minX, H - minY];   /* set pieces may sit south or west of the old map's corner */
    let inWorld = (x, y) => x >= B[0] && y >= B[1] && x < B[0] + B[2] && y < B[1] + B[3];
    if (WG && !opts.bounds && NET) {   /* the open globe: anywhere in the net, up to BAND metres past a cut edge (the core carries you across) */
      const BAND = CFG.band || 40; inWorld = (x, y) => NET.nearest(x + OX + 0.5, -(y + OY) - 0.5).d <= BAND;
    } else if (WG && !opts.bounds) {
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
    /* UNDERGROUND areas (zone flag `under`, 2026-10-07: the Spider Cave) lie outside the land, so nobody walks in from
       the surface; inside their rectangle you can walk (their own tiles decide where). Known from the zone index even
       before the area itself has loaded. */
    const UNDER = ((D.zoneIndex && D.zoneIndex.zones) || D.zones || []).filter(z => z.under).map(z => [z.origin[0], z.origin[1], z.origin[0] + z.size[0], z.origin[1] + z.size[1], z.id, z.style || null]);
    /* an underground area's style: null for a cave, 'wigwam' for the lodges of Ziibiing (round rooms under a bark dome, no rock) */
    const underStyle = (x, y) => { for (const u of UNDER) if (x >= u[0] && y >= u[1] && x < u[2] && y < u[3]) return u[5]; return null; };
    if (UNDER.length) { const land = inWorld; inWorld = (x, y) => land(x, y) || UNDER.some(u => x >= u[0] && y >= u[1] && x < u[2] && y < u[3]); }
    const underAt = (x, y) => { for (const u of UNDER) if (x >= u[0] && y >= u[1] && x < u[2] && y < u[3]) return u[4]; return null; };
    /* round an underground area: solid rock (32 tiles), so no sea or surface land shows beyond the cave's own walls */
    const UNDER_PAD = 32, underNear = (x, y) => { for (const u of UNDER) if (x >= u[0] - UNDER_PAD && y >= u[1] - UNDER_PAD && x < u[2] + UNDER_PAD && y < u[3] + UNDER_PAD) return true; return false; };
    /* walk-in buildings: walls stand on tile EDGES (bits N1 E2 S4 W8, set on both sides), the door edge is open;
       built once into sparse maps (inside the old map's rectangle, as before), then baked into each chunk as it fills */
    const wall = new Map(), inside = new Set(), open = new Set();
    /* the walk-in buildings with more than one storey, and the tile their stairs stand on (an inside corner, away from
       the door unless the object names one) */
    const STOREYED = [];
    const storeys = (objs) => { for (const o of objs) if (o.enter && (o.floors | 0) > 1) {
      let st = o.stairsAt;
      if (!st) { const dx = o.door ? o.door[0] : -9; st = [Math.abs(dx - (o.x + o.w - 2)) > 1 ? o.x + o.w - 2 : o.x + 1, o.y + 1]; }
      const alt = [st[0] - 1 > o.x ? st[0] - 1 : st[0] + 1, st[1]];   /* the flights alternate st / alt floor by floor (a switchback) */
      STOREYED.push({ x: o.x, y: o.y, w: o.w, h: o.h, floors: o.floors | 0, stairs: st, alt, lh: o.lh || null });   /* lh: a storey's height (the castle keep's are 3.2 m) */
    } };
    storeys(objects);
    /* raised walkable ground (kind 'cdeck', tools/castle/make_castle.js; 2026-10-05: walls "should be able to have a
       character walking on them", and the stairs "should be like the terrain and I just walk up them"): the wall walk and
       tower tops (o.cells) stand o.lh metres up, the stair tiles (o.ramps [x, y, metres]) in between. A step between two
       tiles is allowed when their heights differ by 2.3 m or less (src/core.js canStep), so you walk up the stairs onto
       the wall and cannot step off it into the yard. */
    const LIFT = new Map();
    const lifts = (objs) => { for (const o of objs) if (o.k === 'cdeck' && o.cells) { for (const c of o.cells) LIFT.set(c[0] + ',' + c[1], o.lh || 4.2); for (const r of o.ramps || []) LIFT.set(r[0] + ',' + r[1], r[2]); } };
    lifts(objects);
    const buildingAt = (x, y) => { for (let i = 0; i < STOREYED.length; i++) { const b = STOREYED[i]; if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return i; } return -1; };
    const inOld = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const wset = (x, y, b) => { const k = key(x, y); wall.set(k, (wall.get(k) || 0) | b); touched.add(k); };   /* anywhere: not only the old map's rectangle (the operator: walls you could walk through) */
    const wclr = (x, y, b) => { const k = key(x, y); wall.set(k, (wall.get(k) || 0) & ~b); touched.add(k); };
    const touched = new Set();   /* tile keys whose wall / inside / open state a zone set (baked into chunks below) */
    const walls = (objs, npcList) => { for (const o of objs) if (o.enter) {
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
    /* interior walls (2026-10-07: Saltmere town hall rooms): thin edge walls with an optional door gap */
    for (const o of objs) if (o.k === 'iwall') {
      const face = o.face || 'w', x0 = o.x, y0 = o.y, w = o.w || 1, h = o.h || 1, dk = o.door ? o.door[0] + ',' + o.door[1] : '';
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        if (x + ',' + y === dk) continue;
        if (face === 'w') { wset(x, y, 8); wset(x - 1, y, 2); }
        else if (face === 'e') { wset(x, y, 2); wset(x + 1, y, 8); }
        else if (face === 'n') { wset(x, y, 1); wset(x, y - 1, 4); }
        else { wset(x, y, 4); wset(x, y + 1, 1); }
      }
    }
    for (const n of npcList) open.add(key(n.x, n.y)); };   /* an NPC's own tile is never blocked */
    walls(objects, npcs);
    const HB = WG && WG.pieces().length ? WG.pieces()[0].hb : 0;
    const extras = new Map();   /* chunk key -> [[tile key, kind, value]] */
    const ext = (k, kind, v) => { const ck = key(kx(k) >> SH, ky(k) >> SH); if (!extras.has(ck)) extras.set(ck, []); extras.get(ck).push([k, kind, v]); };
    for (const [k, b] of wall) ext(k, 0, b);
    for (const k of inside) ext(k, 1, 0);
    for (const k of open) ext(k, 2, 0);

    /* ---- the chunk store */
    const chunks = new Map(), fillFns = [], grown = new Map();
    function stampGrown(c) {
      for (const k of grown.keys()) {
        const x = kx(k), y = ky(k);
        if ((x >> SH) !== c.cx || (y >> SH) !== c.cy) continue;
        const i = ci(x, y);
        c.fl[i] |= 1 | (SEE['P'.charCodeAt(0)] << 1);
        if (!nodes.has(k)) { const nd = NODE['P'.charCodeAt(0)]; if (nd) nodes.set(k, { kind: 'P', x, y, item: nd.item }); }
      }
    }
    fillFns.push(stampGrown);
    const cleared = new Map();
    function stampCleared(c) {
      for (const k of cleared.keys()) {
        const x = kx(k), y = ky(k);
        if ((x >> SH) !== c.cx || (y >> SH) !== c.cy) continue;
        const i = ci(x, y);
        c.t[i] = '.'.charCodeAt(0);
        c.fl[i] = 0;
        grown.delete(k);
        const nd = nodes.get(k);
        if (nd && 'TPOWMYELQ'.indexOf(nd.kind) >= 0 && !fixed.has(k)) nodes.delete(k);
      }
    }
    fillFns.push(stampCleared);
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
      if (WG) for (const st of netSites(x0, y0, x0 + CH - 1, y0 + CH - 1)) for (const f of st.fishing) {   /* seeded fishing spots */
        const fx = st.shifted ? f.x : f.x - OX, fy = st.shifted ? f.y : f.y - OY, k = key(fx, fy); if (!nodes.has(k)) { nodes.set(k, { kind: 'fish', x: fx, y: fy, item: f.fish, req: f.req, xp: f.xp, tool: f.tool }); fixed.add(k); }
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
    /* ICE (2026-10-07: lakes near the pole freeze in winter and you can walk on them; "not the ocean water that should remain
       liquid and so should ocean bays and the flowing river water should always remain open"). Each water tile is a lake (still), a
       river channel or the sea, from worldgen's own river flag and the planet's sea parcels; the engine says, by latitude, where
       it is frozen (setIce). A frozen lake tile does not block. */
    const ICE = { at: null, blocks: new Map(), kinds: new Map(), SB: null };
    function waterKind(x, y) {
      const k = x + ',' + y; let v = ICE.kinds.get(k); if (v) return v;
      v = 'lake';
      if (WG && WG.sample) { const q = onFace(x + 0.5, y + 0.5), s = WG.sample(q[0], q[1], q[2], ICE.SB || (ICE.SB = WG.newSample())); if (s.river >= 0.5) v = 'river'; else if (s.cls === 3) v = 'sea'; }
      if (ICE.kinds.size > 200000) ICE.kinds.clear();
      ICE.kinds.set(k, v); return v;
    }
    function latOf(x, y) { if (!WG || !WG.toSphere) return 0; const q = onFace(x + 0.5, y + 0.5), u = WG.toSphere(q[0], q[1], q[2]); return (CFG.north === -1 ? -1 : 1) * Math.asin(u[2] / Math.hypot(u[0], u[1], u[2])) * 180 / Math.PI; }   /* north: the world's (globecfg.north) */
    function iceAt(x, y) {
      if (!ICE.at) return false;
      const c = chunkAt(x, y), t = CHR[c.t[ci(x, y)]]; if (t !== '~' && t !== 'v') return false;
      const bk = (x >> 6) + ',' + (y >> 6); let f = ICE.blocks.get(bk); if (f == null) { f = !!ICE.at(latOf((x & ~63) + 32, (y & ~63) + 32)); ICE.blocks.set(bk, f); }
      return f && waterKind(x, y) === 'lake';
    }
    const setIce = fn => { ICE.at = fn || null; ICE.blocks.clear(); };
    const blocked = (x, y) => (chunkAt(x, y).fl[ci(x, y)] & 1) && !iceAt(x, y);
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
    const yard = (P) => {
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
    };
    if (YD) for (const P of pieces) yard(P);
    const pin = (P) => { for (let y = P.y0 >> SH; y <= (P.y1 - 1) >> SH; y++) for (let x = P.x0 >> SH; x <= (P.x1 - 1) >> SH; x++) chunkAt(x << SH, y << SH); };
    /* area loading (handoff/area_loading.md): a zone that arrives after the world was made. Its content joins the lists the
       same way createWorld's did; chunks already filled where it lies (worldgen land, no town) are dropped so they fill
       again with the town in them; its yard birds come after its own spawns, as at creation. Returns what it added (the
       core makes the monsters). A zone already here is ignored. */
    function addZone(z) {
      if (!z || pieces.some(P => P.id === z.id)) return null;
      touched.clear();
      const got = ingest(z), P = pieces[pieces.length - 1];
      ranges(got.objects); storeys(got.objects); lifts(got.objects); walls(got.objects, got.npcs);
      for (const n of got.npcs) touched.add(key(n.x, n.y));
      for (const o of got.objects) if (o.enter) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) touched.add(key(x, y));
      for (const k of touched) { if (wall.has(k)) ext(k, 0, wall.get(k)); if (inside.has(k)) ext(k, 1, 0); if (open.has(k)) ext(k, 2, 0); }
      /* drop every filled chunk the zone or its walls reach, with the nodes it made (fixed ones - fishing, ranges - stay) */
      const ck = new Set(); for (let y = P.y0 >> SH; y <= (P.y1 - 1) >> SH; y++) for (let x = P.x0 >> SH; x <= (P.x1 - 1) >> SH; x++) ck.add(key(x, y));
      for (const k of touched) ck.add(key(kx(k) >> SH, ky(k) >> SH));
      for (const k of ck) { const c = chunks.get(k); if (!c) continue; chunks.delete(k);
        for (let i = 0; i < CH * CH; i++) if (NODE[c.t[i]]) { const nk = key(c.x0 + (i & CM), c.y0 + (i >> SH)); if (!fixed.has(nk)) nodes.delete(nk); }
        if (c === lc) { lc = null; lcx = lcy = 0x7fffffff; } }
      pin(P);
      const s0 = spawns.length; if (YD) yard(P);
      return { id: z.id, npcs: got.npcs, spawns: got.spawns.concat(spawns.slice(s0)), objects: got.objects };
    }

    return {
      API, CH, cfg: CFG, key, kx, ky, W, H, pieces, npcs, spawns, objects, nodes, respawn: respawn || [Math.floor(W / 2), Math.floor(H / 2)],
      tileAt, blocked, losAt, wallAt, insideAt, zoneAt, nodeAt, inWorld, addZone, hasZone: (id) => pieces.some(P => P.id === id),
      regionOf: (x, y) => 'vale:' + FACE + ':' + Math.floor((x + GX) / REG) + ':' + Math.floor((y + GY) / REG),
      seeded: !!WG, inPiece: (x, y) => !!chunkAt(x, y).zi[ci(x, y)], underAt, underNear, underStyle, waterKind, iceAt, setIce, latOf,
      /* seeded land, in the vale frame: sites (camps, ore, fishing; ids and monster uids from worldgen), the ground height
         at a tile corner relative to the set pieces' base height (so the old map keeps its own heights), the biome */
      sitesIn(x0, y0, x1, y1) {
        if (!WG) return [];
        const mv = o => Object.assign({}, o, { x: o.x - OX, y: o.y - OY });
        return netSites(x0, y0, x1, y1).map(st => st.shifted ? st : Object.assign({}, st, { x: st.x - OX, y: st.y - OY, spawns: st.spawns.map(mv), objects: st.objects.map(mv), fishing: st.fishing.map(mv), nodes: st.nodes.map(mv) }));
      },
      roadTorchesIn(x0, y0, x1, y1) {   /* lamps along the trails between towns (sadfrog 2026-10-07) */
        if (!WG || !WG.roadObjects) return [];
        return WG.roadObjects(FACE, x0 + OX, y0 + OY, x1 + OX, y1 + OY).map(o => Object.assign({}, o, { x: o.x - OX, y: o.y - OY }));
      },
      groundH: (cx, cy) => WG ? fieldAt(cx, cy)[0] - HB : 0,
      snowH: WG ? (CFG.snowLine || 110) - HB : 1e9,   /* the snow line (2026-10-03) in groundH's frame; tree snow starts 55 m below it, alpine rock 22 m below */
      waterH: () => WG ? WG.WATER - HB : 0,
      /* the surface of a river or lake over this tile (worldgen's own level, in groundH's frame), or null where the
         world holds no such water (the sea, a set piece's pond or well) - 2026-10-04: "The water should always be flat" */
      waterSurf: (x, y) => { if (!WG) return null; const f = fieldAt(x + 0.5, y + 0.5); return f[16] > 0.5 && f[17] > WG.WATER + 0.05 ? f[17] - HB : null; },
      forestAt: (x, y) => WG ? fieldAt(x + 0.5, y + 0.5)[1] : 0,
      liftAt: (x, y) => LIFT.size ? (LIFT.get(x + ',' + y) || 0) : 0, lifts: LIFT.size,
      buildings: STOREYED, buildingAt, stairsOf: (i) => STOREYED[i] ? STOREYED[i].stairs : null,
      flightOf: (i, f) => { const b = STOREYED[i]; return !b ? null : (f % 2 && b.alt) ? b.alt : b.stairs; },   /* the tile of the flight from floor f up */   /* multi-storey walk-in buildings (the operator: stairs, upper floors) */
      climateAt: (x, y) => { if (!WG || !WG.climOf) return -1; const f = fieldAt(x + 0.5, y + 0.5); return WG.climOf(f[15], f[14]); },   /* the climate zone (worldgen) */
      coastAt: (x, y) => WG ? fieldAt(x + 0.5, y + 0.5)[9] : 0,
      chunk: (cx, cy) => chunkAt(cx << SH, cy << SH),
      onFill(fn) { fillFns.push(fn); for (const c of chunks.values()) fn(c); },
      /* a sapling that rooted in grass: the tile letter stays grass (so a rebuilt region does not also instance a tree)
         but the tile blocks walking and carries a pine node. Re-applied whenever the chunk fills again. */
      growTree(x, y) {
        const k = key(x, y); cleared.delete(k); grown.set(k, 1); stampGrown(chunkAt(x, y)); return true;
      },
      /* a stump that has stood an hour: the tree is gone, the tile is open grass, and a sapling can go there */
      clearTree(x, y) {
        const k = key(x, y); cleared.set(k, 1); grown.delete(k); stampCleared(chunkAt(x, y)); return true;
      },
      toFace: (x, y) => [FACE, x + OX, y + OY],
      sphereAt: (x, y) => { if (!WG || !WG.toSphere) return null; const q = onFace(x, y); return WG.toSphere(q[0], q[1], q[2]); },   /* continuous vale point -> unit sphere (any face) */
      netAcross: (x, y) => { if (!NET) return null; const r = NET.across(x + OX + 0.5, -(y + OY) - 0.5); return r ? { x: Math.floor(r.x) - OX, y: Math.floor(-r.y) - OY, turn: r.turn, f: r.f } : null; },   /* past a cut edge: where the same ground lies natively */
      netGap: (x, y) => NET ? NET.nearest(x + OX + 0.5, -(y + OY) - 0.5).d : 0,
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
    W.setSetPieces(W.piecesFromZones(pieceZones(D), C.face, C.origin[0], C.origin[1], { belt: C.belt || {}, links: C.links || [], groves: C.groves || [] }));
    return W;
  }
  /* the zones worldgen places, in a fixed order: with a zone index (area loading, handoff/area_loading.md) EVERY zone of the
     index, each as its full zone when it is loaded and as its stub (edge band + building pads) when not - worldgen reads
     nothing else outside a town, so the land around it is the same either way; without an index, the zones given */
  function pieceZones(D) {
    const ZI = D.zoneIndex && D.zoneIndex.zones; if (!ZI) return (D.zones || []).filter(z => !z.under);
    const have = new Map((D.zones || []).map(z => [z.id, z]));
    return ZI.filter(e => !e.under).map(e => have.get(e.id) || stubZone(e));   /* an underground area is not on the land */
  }
  function stubZone(e) { return { id: e.id, origin: e.origin, size: e.size, tiles: e.stub, objects: e.pads || [] }; }
  /* a zone that arrived after the world was made: worldgen gets its real inside (the stub's place in the list is kept) */
  function arriveWorldgen(W, D, z) {
    if (z && z.under) return false;   /* an underground area is not on the land */
    const C = Object.assign({}, DEF_CFG, D.globecfg || {});
    const sp = W.piecesFromZones([z], C.face, C.origin[0], C.origin[1], { belt: C.belt || {}, links: C.links || [], groves: C.groves || [] })[0];
    return W.replacePiece ? W.replacePiece(sp) : false;
  }
  const AshWorld = { API, V, CH, createWorld, seededWorldgen, pieceZones, stubZone, arriveWorldgen, key, kx, ky };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('world', { api: API, v: V }, () => AshWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = AshWorld;
  root.AshWorld = AshWorld;
})(typeof globalThis !== 'undefined' ? globalThis : this);
