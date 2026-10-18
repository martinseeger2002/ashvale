/* make_thornwatch.js -> data/zone.thornwatch.json, data/zone.redmoor.json, data/zone.hollowden.json (2026-10-18, the operator: an Ashvale
   rendition of a walled archers' camp on a moor and the den beneath it; people, monsters and the quest: tools/thornwatch/make_tw_extras.py,
   scenery kinds: tools/thornwatch/make_tw_decor.py).
     thornwatch   the camp, ~400 m west-south-west of Ashvale on open moorland: a 68 x 46 m stake palisade, one gate in the south wall
                  near its east corner opening on the moor trail. Inside, after the
                  reference layout: the bonfire in the middle with the chest above it and the caravan master beside it, the smith's
                  forge in a dirt yard against the back (north) wall half-closed by dry-stone walls, the captain's double pavilion
                  north-east of the fire with the archery butts beyond it, the peddler's wagon in the west corner, a soldier's tent west
                  of the fire, the healer by the gate, wagons and carts about, a dirt road from the fire down to the gate.
     redmoor      the moor south-east of the gate: the world's own ground with a dirt trail from the gate to the den, broken
                  fences, an old foundation, bones, boulders; quill rats, ashlings and moor walkers; Scout Briar by the den's mouth.
     hollowden    underground (zone flag `under`, in the empty space of the globe's flat net beside the Spider Cave): nine chambers
                  joined by winding passages - a loop through the middle and four dead ends, the deepest the lair of Cinderhide.
   Ground outside the walls is sampled from the world (tools/castle/mask.js), so the pieces sit in the land without a seam;.
     node tools/thornwatch/make_thornwatch.js     (after make_tw_extras.py; then python3 build.py) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
{ const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TJ = JSON.parse(fs.readFileSync(TP, 'utf8')); TJ.data.trails = (TJ.data.trails || []).filter(t => t.tag !== 'thornwatch'); fs.writeFileSync(TP, JSON.stringify(TJ)); }   /* our own trails out first: the world is sampled without them */
const { W, CFG } = require('../castle/mask.js');
const [OX, OY] = CFG.origin, F = CFG.face;
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'npc_lines.json'), 'utf8'));
const BLOCK = 'TPORNIr~FHXWMYCGAUSVJ^KZD';
let seed = 20261018; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const write = (id, data) => { fs.writeFileSync(path.join(ROOT, 'data', 'zone.' + id + '.json'), JSON.stringify({ ashvale3d: 'module', name: 'zone.' + id, api: 1, v: 1, data })); console.log('zone.%s: %dx%d, %d objects, %d npcs, %d spawns', id, data.size[0], data.size[1], data.objects.length, data.npcs.length, data.spawns.length); };
const grid = (w, h, f) => { const T = []; for (let y = 0; y < h; y++) { const r = []; for (let x = 0; x < w; x++) r.push(f(x, y)); T.push(r); } return T; };
const worldTile = (gx, gy) => W.tileAt(F, gx + OX, gy + OY);

/* SOLID SCENERY (2026-10-18: "make sure the players don't walk through objects and buildings"): every placed piece shuts the
   tiles its own parts stand on, worked out from the parts themselves, never typed by hand. A decor kind's parts are turned exactly as
   the scene turns them (src/scene.js decor(): the part's Euler YXZ, then the piece's ry about its tile centre + dx/dz); a part counts
   when it stands up off the ground and is not a rope or a light, and it shuts a tile it covers by at least SOLID_IN m on both axes.
   Parts flat on the ground (bones) are walked over, the gate's lintel under; the scene's own pieces (furnace,
   anvil, barrel, ...) shut their tile, or their w x h. */
const DECOR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'decor.json'), 'utf8')).data.kinds;
const WALK = new Set(['camp_gate', 'palisade', 'palisade_post', 'cavemouth', 'caveexit']);   /* shut by their own wall tiles, or the way in and out */
const SOLID_IN = 0.2;
function footprint(o) {
  if (WALK.has(o.k)) return [];
  const K = DECOR[o.k];
  if (!K) { const out = []; for (let y = 0; y < (o.h || 1); y++) for (let x = 0; x < (o.w || 1); x++) out.push([o.x + x, o.y + y]); return out; }
  const cx = o.x + 0.5 + (o.dx || 0), cz = o.y + 0.5 + (o.dz || 0), R = o.ry || 0, sc = o.s || 1, c = Math.cos(R), s = Math.sin(R), cells = new Map();
  for (const p of K.parts) {
    if (p[0] === 'glow') continue;
    const dims = [p[5], p[6], p[7]].sort((a, b) => a - b); if (dims[1] < 0.06) continue;   /* a rope, an arrow, a pole's thread */
    const pry = p[8] || 0, prx = p[9] || 0, prz = p[10] || 0;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, top = -1e9;
    for (const ux of [-0.5, 0.5]) for (const uy of [-0.5, 0.5]) for (const uz of [-0.5, 0.5]) {
      let X = ux * p[5], Y = uy * p[6], Z = uz * p[7];
      { const a = Math.cos(prz), b = Math.sin(prz); [X, Y] = [X * a - Y * b, X * b + Y * a]; }       /* Rz */
      { const a = Math.cos(prx), b = Math.sin(prx); [Y, Z] = [Y * a - Z * b, Y * b + Z * a]; }       /* Rx */
      { const a = Math.cos(pry), b = Math.sin(pry); [X, Z] = [X * a + Z * b, -X * b + Z * a]; }      /* Ry */
      const lx = X + p[2], lz = Z + p[4], wx = cx + (lx * c + lz * s) * sc, wz = cz + (-lx * s + lz * c) * sc;
      x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz); top = Math.max(top, (Y + p[3]) * sc);
    }
    if (top < 0.25) continue;   /* flat on the ground: walked over */
    for (let ty = Math.floor(z0); ty <= Math.floor(z1); ty++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++)
      if (Math.min(x1, tx + 1) - Math.max(x0, tx) >= SOLID_IN && Math.min(z1, ty + 1) - Math.max(z0, ty) >= SOLID_IN) cells.set(tx + ',' + ty, [tx, ty]);
  }
  return [...cells.values()];
}
/* shut every piece's tiles in a zone's grid; a tile with an npc or the way in/out on it stays open (and is reported) */
function stampSolid(Z) {
  const [ox, oy] = Z.origin, keep = new Set(Z.npcs.map(n => n.x + ',' + n.y)), shut = [];
  for (const o of Z.objects) if (o.k === 'cavemouth' || o.k === 'caveexit') keep.add(o.x + ',' + o.y);
  for (const o of Z.objects) for (const [x, y] of footprint(o)) {
    const lx = x - ox, ly = y - oy; if (ly < 0 || lx < 0 || ly >= Z.tiles.length || lx >= Z.tiles[0].length) { console.error('BLOCKED - %s at %d,%d stands over the edge of %s (%d,%d): it could not be made solid there', o.k, o.x, o.y, Z.name, x, y); process.exit(1); }
    if (keep.has(x + ',' + y)) { console.error('note: %s at %d,%d would shut %d,%d (someone stands there) - left open', o.k, o.x, o.y, x, y); continue; }
    if (Z.tiles[ly][lx] !== 'X') { Z.tiles[ly] = Z.tiles[ly].slice(0, lx) + 'X' + Z.tiles[ly].slice(lx + 1); shut.push(o.k); }
  }
  /* a monster's post or a person on a shut or unwalkable tile moves to the nearest open one (tests/core_test.js: every post can be
     walked to and swung at; every person stands on ground you can walk to) */
  const open = (lx, ly) => ly >= 0 && lx >= 0 && ly < Z.tiles.length && lx < Z.tiles[0].length && BLOCK.indexOf(Z.tiles[ly][lx]) < 0;
  const taken = new Set(Z.npcs.map(n => n.x + ',' + n.y));
  for (const e of Z.spawns.concat(Z.npcs)) {
    if (e.chest || open(e.x - ox, e.y - oy)) continue;
    let best = null; for (let r = 1; r < 8 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && open(e.x + dx - ox, e.y + dy - oy) && !taken.has((e.x + dx) + ',' + (e.y + dy))) { best = [e.x + dx, e.y + dy]; break; }
    if (best) { console.error('note: %s moved off a shut tile %d,%d -> %d,%d', e.m || e.id, e.x, e.y, best[0], best[1]); e.x = best[0]; e.y = best[1]; taken.add(best.join(',')); }
  }
  return shut.length;
}

/* ---------------- the camp ---------------- */
/* MOVED 2026-10-18 (the operator: "closer to Ashvale ... a cobblestone pathway connecting from our existing cobblestone"; he chose the site
   ~110 m east of the well, south of the Saltmere road): the camp is laid out in the reference's frame (gate in the south wall, forge
   against the north wall) and MIRRORED north-south into the zone, so its one gate faces the road; a cobbled spur runs from the gate
   up onto the road. set(), g() and the last pass over the pieces do the mirroring; every coordinate below is in the design frame. */
const CW = 76, CH = 54, CX0 = 76, CY0 = 54;             /* zone origin (game tiles): clear of the Saltmere road, which the worldgen routes round zones */
const PX0 = 4, PY0 = 4, PX1 = 71, PY1 = 49;               /* the palisade rectangle (design frame) */
const MY = d => 53 - d, PL0 = MY(PY1), PL1 = MY(PY0);     /* design row -> zone row; the palisade's rows in the zone (4 and 49) */
const GATE = [59, 62];                                     /* the gate's open tiles (design: south wall; in the world: north) */
const MOUTH = [292, 112];                                  /* the den's mouth on the moor */
const camp = (() => {
  const g = (x, y) => [x + CX0, MY(y) + CY0];
  const T = grid(CW, CH, (x, y) => {   /* zone rows here, not design rows */
    const inside = x > PX0 && x < PX1 && y > PL0 && y < PL1;
    if (inside) return rnd() < 0.3 ? ',' : '.';
    const c = worldTile(x + CX0, y + CY0);
    return (x >= PX0 - 2 && x <= PX1 + 2 && y >= PL0 - 2 && y <= PL1 + 2) ? (BLOCK.indexOf(c) >= 0 || c === 'p' || c === 'c' ? '.' : c) : (c === 'p' ? 'd' : c);   /* the road's cobbles stay */
  });
  const set = (x, y, c) => { const ly = MY(y); if (x >= 0 && ly >= 0 && x < CW && ly < CH) T[ly][x] = c; };
  const disc = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r * (0.75 + rnd() * 0.5)) set(x, y, c); };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  /* dirt: the bonfire yard, the forge yard, the peddler's corner, the healer's patch, the archery lane, and the road to the gate */
  disc(31.5, 28.5, 5, 'd'); rect(22, 5, 41, 12, 'd'); disc(31, 9, 6, 'd'); disc(11, 27, 4.5, 'd'); disc(63, 32, 4, 'd'); rect(56, 12, 68, 17, 'd'); disc(49, 18, 3, 'd');
  for (let t = 0; t <= 1; t += 0.01) { const x = 31.5 + (60.5 - 31.5) * t, y = 28.5 + (49.5 - 28.5) * t + Math.sin(t * Math.PI) * 2.5; disc(x, y, 1.6, 'd'); }
  /* the cobbled spur out of the gate to the zone's edge; beyond it the world lays the rest onto the road (SPUR below) */
  for (let x = GATE[0]; x <= GATE[1]; x++) for (let ly = PL0; ly >= 0; ly--) T[ly][x] = 'c';
  const O = [], N = [];
  /* the palisade: 2 m sections (rails on the inner side), posts at the corners, the gate's posts and lintel */
  for (let x = PX0; x <= PX1; x++) { set(x, PY0, 'X'); if (x < GATE[0] || x > GATE[1]) set(x, PY1, 'X'); }
  for (let y = PY0; y <= PY1; y++) { set(PX0, y, 'X'); set(PX1, y, 'X'); }
  for (let x = PX0 + 1; x + 1 < PX1; x += 2) {
    O.push({ k: 'palisade', x: g(x, PY0)[0], y: g(x, PY0)[1], dx: 0.5, ry: 0 });
    if (x + 1 < GATE[0] || x > GATE[1]) O.push({ k: 'palisade', x: g(x, PY1)[0], y: g(x, PY1)[1], dx: 0.5, ry: Math.PI });
  }
  O.push({ k: 'palisade', x: g(GATE[0] - 1, PY1)[0], y: g(0, PY1)[1], ry: Math.PI });   /* the odd tile beside the gate */
  for (let y = PY0 + 1; y + 1 < PY1; y += 2) { O.push({ k: 'palisade', x: g(PX0, y)[0], y: g(PX0, y)[1], dz: 0.5, ry: Math.PI / 2 }); O.push({ k: 'palisade', x: g(PX1, y)[0], y: g(PX1, y)[1], dz: 0.5, ry: -Math.PI / 2 }); }
  O.push({ k: 'palisade', x: g(PX0, PY1 - 1)[0], y: g(0, PY1 - 1)[1], ry: Math.PI / 2 }, { k: 'palisade', x: g(PX1, PY1 - 1)[0], y: g(0, PY1 - 1)[1], ry: -Math.PI / 2 });
  for (const [x, y] of [[PX0, PY0], [PX1, PY0], [PX0, PY1], [PX1, PY1]]) O.push({ k: 'palisade_post', x: g(x, y)[0], y: g(x, y)[1] });
  O.push({ k: 'camp_gate', x: g(GATE[0] + 1, PY1)[0], y: g(0, PY1)[1], dx: 0.5 });
  /* a placed piece and the tiles it shuts */
  const put = (k, x, y, extra) => { O.push(Object.assign({ k, x: g(x, y)[0], y: g(x, y)[1] }, extra || {})); };
  /* the bonfire, the chest above it, bedrolls round it */
  put('campfire', 31, 28); for (const [x, y] of [[29, 26], [34, 26], [29, 31], [34, 31]]) put('torch', x, y);
  put('bedroll', 27, 31, { ry: 0.5 }); put('bedroll', 35, 32, { ry: -0.6 }); put('bedroll', 36, 28, { ry: 1.4 });
  /* the forge yard against the back wall, half-closed by dry-stone walls */
  put('furnace', 25, 6, { w: 2, h: 2 }); put('anvil', 31, 8); put('rack', 35, 6); put('woodpile', 22, 9, { ry: Math.PI / 2 });
  put('barrel', 38, 6); put('barrel', 39, 7); put('crate', 39, 5); put('table', 28, 6);
  put('torch', 24, 11); put('torch', 38, 11);
  for (const x of [21, 23, 25]) put('dry_wall', x, 13, { dx: 0.5 }, [x, 13, x + 1, 13]);
  for (const x of [36, 38, 40]) put('dry_wall', x, 13, { dx: 0.5 }, [x, 13, x + 1, 13]);
  for (const y of [8, 10]) put('dry_wall', 20, y, { dz: 0.5, ry: Math.PI / 2 }, [20, y, 20, y + 1]);
  /* the captain's pavilion, its spear rack, and the archery lane east of it */
  put('pavilion', 48, 13, { dx: 0.5, dz: 0.5 }); put('torch', 44, 17); put('torch', 53, 17); put('spear_rack', 55, 15);
  for (const x of [59, 62, 65]) put('archery_butt', x, 9, null, [x, 9, x, 9]);
  put('barrel', 68, 7); put('crate', 69, 8);
  /* the peddler's corner: his wagon, a stall, his stock in crates */
  put('covered_wagon', 10, 24, { dx: 0.5, ry: 0.15 }); put('stall', 14, 27);
  put('crate', 7, 29); put('crate', 8, 30); put('barrel', 7, 31); put('torch', 14, 31);
  /* wagons and carts about the camp, the soldier's tent west of the fire */
  put('covered_wagon', 17, 9, { ry: -0.35 }); put('covered_wagon', 15, 44, { ry: 0.25 }); put('handcart', 47, 38, { ry: 0.7 });
  put('ridge_tent', 20, 31, { dx: 0.5, dz: 0.5 }); put('ridge_tent', 23, 37, { dz: 0.5, ry: 0.4 });
  /* the healer's patch by the gate: her table, her own tent, baskets */
  put('herb_table', 64, 30, { dx: 0.5 }); put('ridge_tent', 67, 35, { dz: 0.5, ry: Math.PI / 2 });
  put('basket', 61, 30); put('basket', 66, 31); put('torch', 60, 34); put('torch', 66, 28);
  /* old dry-stone walls the camp grew round, crates and barrels along the walls */
  for (const x of [38, 40]) put('dry_wall', x, 24, { dx: 0.5, ry: 0.1 }, [x, 24, x + 1, 24]);
  for (const x of [52, 54, 56]) put('dry_wall', x, 41, { dx: 0.5, ry: -0.05 }, [x, 41, x + 1, 41]);
  for (const x of [25, 27]) put('dry_wall', x, 42, { dx: 0.5 }, [x, 42, x + 1, 42]);
  for (const [k, x, y] of [['crate', 6, 6], ['barrel', 7, 6], ['crate', 6, 47], ['barrel', 6, 46], ['crate', 69, 47], ['barrel', 69, 46], ['crate', 44, 6], ['barrel', 45, 6], ['crate', 30, 47], ['barrel', 31, 47]]) put(k, x, y, null, [x, y, x, y]);
  for (const [x, y] of [[8, 13], [8, 38], [40, 33], [54, 25], [68, 22], [56, 46], [64, 46], [44, 46]]) put('torch', x, y);
  /* people */
  const npc = (id, name, look, x, y, extra) => N.push(Object.assign({ id, name, look, x: g(x, y)[0], y: g(x, y)[1] }, extra));
  npc('isolde', 'Mother Isolde', 'isolde', 63, 32, { talk: 'quest', quest: 'hollow_den', examine: 'Mother Isolde, eldest of the Thornwatch, who sees further with her eyes shut than most do with them open.' });
  npc('elin', 'Novice Elin', 'elin', 61, 32, { shop: 'thornwatch_herbs', examine: 'Novice Elin, keeping count of Mother Isolde\'s jars.' });
  npc('gwen', 'Gwen the smith', 'gwen', 31, 10, { shop: 'thornwatch_forge', examine: 'Gwen the smith, forearms like hams and burn scars like freckles.' });
  npc('fennick', 'Fennick the peddler', 'fennick', 12, 28, { shop: 'thornwatch_peddler', examine: 'Fennick the peddler. His prices go up when you look interested.' });
  npc('rhosyn', 'Captain Rhosyn', 'rhosyn', 47, 18, LINES.rhosyn);
  npc('tavish', 'Tavish the caravan master', 'tavish', 26, 23, LINES.tavish);
  npc('tw_chest', 'Thornwatch chest', 'chest', 31, 23, { chest: true, examine: 'The Sisters\' strongbox, iron-bound and chained to a stake. Everything you own from Ashvale is kept in your arcade wallet; this is where you see it.' });
  npc('sentry_w', 'Thornwatch sentry', 'thorn_sentry', 57, 47, LINES.sentry); npc('sentry_e', 'Thornwatch sentry', 'thorn_sentry2', 64, 47, LINES.sentry);
  /* the mirror, for the pieces: turned through pi - ry, dz the other way, and a w x h piece anchored at its new top row */
  for (const o of O) { o.ry = Math.PI - (o.ry || 0); if (o.dz) o.dz = -o.dz; if (!DECOR[o.k] && (o.h || 1) > 1) o.y -= o.h - 1; }
  return { name: 'Thornwatch Camp', level: 'safe', ownWays: true, origin: [CX0, CY0], size: [CW, CH], ground: 'grass', tiles: T.map(r => r.join('')), objects: O, npcs: N, spawns: [], fishing: [] };
})();

/* ---------------- the den (underground) ---------------- */
const DX0 = 24300, DY0 = 24000, DW = 96, DH = 72;
const ROOMS = { A: [8, 8, 4], B: [26, 14, 6], C: [46, 7, 4.5], D: [28, 36, 7.5], E: [10, 52, 5], F: [52, 28, 6], G: [76, 13, 5], H: [57, 52, 6], I: [82, 58, 8] };
const LINKS = [['A', 'B'], ['B', 'C'], ['B', 'D'], ['B', 'F'], ['D', 'F'], ['D', 'E'], ['F', 'G'], ['D', 'H'], ['H', 'I']];
const den = (() => {
  const g = (x, y) => [Math.round(x) + DX0, Math.round(y) + DY0];
  const T = grid(DW, DH, () => '^');
  const carve = (cx, cy, r) => { for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) if (x > 0 && y > 0 && x < DW - 1 && y < DH - 1 && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) T[y][x] = 'd'; };
  for (const k in ROOMS) { const [x, y, r] = ROOMS[k]; carve(x, y, r); for (let i = 0; i < 5; i++) { const a = rnd() * 6.283, d = r * (0.4 + rnd() * 0.5); carve(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.35 + rnd() * 0.3)); } }
  LINKS.forEach(([a, b], i) => {
    const [x0, y0] = ROOMS[a], [x1, y1] = ROOMS[b], L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L, bend = (rnd() - 0.5) * L * 0.45;
    for (let s = 0; s <= L * 3; s++) { const t = s / (L * 3), off = Math.sin(t * Math.PI) * bend + Math.sin(t * 9 + i) * 0.8; carve(x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off, 1.5 + 0.35 * Math.sin(t * 7 + i * 2)); }
  });
  const O = [], S = [], N = [];
  const ok = (x, y) => T[Math.round(y)] && T[Math.round(y)][Math.round(x)] === 'd';
  const near = (x, y) => { for (let r = 0; r < 6; r++) for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return [Math.round(px), Math.round(py)]; } return [Math.round(x), Math.round(y)]; };
  const put = (k, x, y, extra) => { const [px, py] = near(x, y); const [gx, gy] = g(px, py); O.push(Object.assign({ k, x: gx, y: gy }, extra || {})); return [px, py]; };
  const spawn = (m, room, n) => { const [cx, cy, r] = ROOMS[room]; for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = r * (0.2 + rnd() * 0.55), [px, py] = near(cx + Math.cos(a) * d, cy + Math.sin(a) * d); const [gx, gy] = g(px, py); S.push({ m, x: gx, y: gy }); } };
  /* the way out, right where you came down */
  O.push({ k: 'caveexit', x: g(5, 6)[0], y: g(5, 6)[1], to: [MOUTH[0] + 1, MOUTH[1] + 2], label: 'Climb back up', name: 'The way out' });
  /* braziers on tripods in every chamber (the shut tile under each), bones where things were eaten */
  for (const k in ROOMS) { const [x, y, r] = ROOMS[k]; put('tripod_brazier', x + r * 0.55, y - r * 0.45); if (r >= 6) put('tripod_brazier', x - r * 0.6, y + r * 0.4); }
  for (const [x, y] of [[24, 18], [44, 9], [30, 41], [12, 55], [55, 31], [78, 15], [60, 55], [80, 62], [85, 55], [20, 34]]) put('bone_pile', x, y, { ry: rnd() * 6 });
  /* who lives here: 18 ashlings, 3 firecallers, 8 walkers, 2 brutes, and Cinderhide (Mother Isolde's count) */
  spawn('den_ashling', 'B', 4); spawn('den_shaman', 'B', 1);
  spawn('den_brute', 'C', 1); spawn('den_ashling', 'C', 2);
  spawn('den_walker', 'D', 3); spawn('den_ashling', 'D', 3);
  spawn('den_ashling', 'E', 3); spawn('den_shaman', 'E', 1);
  spawn('den_ashling', 'F', 3); spawn('den_walker', 'F', 1);
  spawn('den_brute', 'G', 1); spawn('den_walker', 'G', 1);
  spawn('den_ashling', 'H', 3); spawn('den_shaman', 'H', 1); spawn('den_walker', 'H', 1);
  { const [x, y] = ROOMS.I, [gx, gy] = g(x, y); S.push({ m: 'cinderhide', x: gx, y: gy }); } spawn('den_walker', 'I', 2);
  return { name: 'The Hollow Den', level: '20-34', under: true, surface: MOUTH, surfaceOffset: [MOUTH[0] - DX0, MOUTH[1] - DY0], origin: [DX0, DY0], size: [DW, DH], ground: 'cave',
           tiles: T.map(r => r.join('')), objects: O, spawns: S, npcs: N, fishing: [], arrive: [DX0 + 7, DY0 + 8], weather: { none: true } };
})();

/* ---------------- the moor ---------------- */
function moor() {
  /* the open ground east and south-east of the camp, between it and the forest; the path from the spur comes in at its west edge
     past the pond (a world path, SPUR below), and its trail runs on east to the den's mouth. Places are given as game tiles (G) and converted. */
  const MW = 76, MH = 112, MX0 = 232, MY0 = 54;   /* 30 m and more east of the pond at 186-198, 84-96: zones level the land near
     their edges (wg_tables pieces.blend 20, pondKeep 30) and a pond there fills in; the camp keeps 30 m on the west (all 70 of its tiles kept) */   /* stops short of the pond at 344-356, 176-186 (the worldgen clears ponds near zones) */
  const g = (x, y) => [x + MX0, y + MY0], G = (gx, gy) => [gx - MX0, gy - MY0];
  const T = grid(MW, MH, (x, y) => { const c = worldTile(x + MX0, y + MY0); return c === 'p' ? 'd' : c; });
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < MW && y < MH) T[y][x] = c; };
  const pts = [[232, 121], [258, 127], [282, 124], [MOUTH[0], MOUTH[1] + 3]].map(([x, y]) => G(x, y));
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0); for (let s = 0; s <= L * 2; s++) { const t = s / (L * 2), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + (i > 2 ? Math.sin(t * Math.PI) * 2 : 0); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dy) <= 1 + (rnd() < 0.3)) set(Math.round(x + dx), Math.round(y + dy), 'd'); } }
  const free = (x, y) => T[y] && BLOCK.indexOf(T[y][x]) < 0 && T[y][x] !== 'd';
  const O = [], S = [], N = [];
  const put = (k, gx, gy, extra) => { const [x, y] = G(gx, gy); if (!T[y] || BLOCK.indexOf(T[y][x]) >= 0) return; O.push(Object.assign({ k, x: gx, y: gy }, extra || {})); };
  /* the den's mouth in a mound of rock, skull stones and braziers either side */
  const [mx, my] = G(MOUTH[0], MOUTH[1]);
  for (let y = my - 3; y <= my; y++) for (let x = mx - 3; x <= mx + 3; x++) if ((x - mx) ** 2 / 9 + (y - my + 0.5) ** 2 / 6 <= 1) set(x, y, 'R');
  for (let y = my + 1; y <= my + 3; y++) for (let x = mx - 1; x <= mx + 1; x++) set(x, y, 'd');
  O.push({ k: 'cavemouth', x: MOUTH[0], y: MOUTH[1], to: [DX0 + 7, DY0 + 8], label: 'Enter the den', name: 'The Hollow Den', say: 'You climb down into the warm dark. Somewhere ahead, something small giggles.',
           examine: 'A hole in a heap of boulders. The air coming out of it is warm, and smells of smoke and old meat.' });
  put('skull_stone', MOUTH[0] - 3, MOUTH[1] + 1, { ry: 0.4 }); put('skull_stone', MOUTH[0] + 3, MOUTH[1] + 1, { ry: -0.4 });
  put('tripod_brazier', MOUTH[0] - 2, MOUTH[1] + 3); put('tripod_brazier', MOUTH[0] + 2, MOUTH[1] + 3);
  put('bone_pile', MOUTH[0] - 5, MOUTH[1] + 4, { ry: 1 }); put('bone_pile', MOUTH[0] + 4, MOUTH[1] + 6, { ry: 3 });
  N.push(Object.assign({ id: 'briar', name: 'Scout Briar', look: 'briar', x: MOUTH[0] - 6, y: MOUTH[1] + 6 }, LINES.briar));
  /* broken fences, an old foundation, boulders and dead trees along the way */
  for (const [x, y, ry] of [[236, 104, 0.2], [239, 105, 0.3], [240, 116, -0.1], [243, 116, -0.15], [246, 117, 0.4], [270, 140, 1.2], [240, 134, 0.7]]) put('rail_fence', x, y, { ry });
  { const [fx0, fy0] = G(255, 98), [fx1, fy1] = G(263, 105);
    for (let x = fx0; x <= fx1; x++) for (const y of [fy0, fy1]) if (rnd() < 0.75) set(x, y, 'K');
    for (let y = fy0; y <= fy1; y++) for (const x of [fx0, fx1]) if (rnd() < 0.7) set(x, y, 'K'); }
  put('ruin_pillar', 255, 98); put('ruin_pillar', 263, 105); put('bone_pile', 259, 101, { ry: 2 });
  for (const [k, x, y] of [['boulders', 238, 138], ['boulders', 246, 141], ['boulders', 300, 100], ['dead_tree', 236, 95], ['dead_tree', 276, 150], ['dead_tree', 305, 90], ['fallen_log', 250, 135], ['broken_cart', 240, 112], ['bone_pile', 246, 124], ['bone_pile', 278, 130]])
    if (free(...G(x, y))) put(k, x, y, { ry: rnd() * 6 });
  /* the moor's creatures: rats in the grass, ashling packs by the ruins and the trail, walkers on the low ground */
  const sp = (m, gx, gy) => { const [x, y] = G(gx, gy); for (let r = 0; r < 5; r++) for (let k = 0; k < 8; k++) { const px = Math.round(x + Math.cos(k * 0.8) * r), py = Math.round(y + Math.sin(k * 0.8) * r); if (free(px, py)) { S.push({ m, x: g(px, py)[0], y: g(px, py)[1] }); return; } } };
  for (const [x, y] of [[240, 146], [236, 100], [240, 135], [300, 95]]) sp('quill_rat', x, y);
  for (const [x, y] of [[258, 108], [261, 110], [264, 108], [242, 150], [245, 152], [248, 150], [296, 140], [299, 142]]) sp('ashling', x, y);
  for (const [x, y] of [[240, 160], [252, 162], [285, 150], [300, 120]]) sp('moor_walker', x, y);
  return { name: 'The Red Moor', level: '14-18', ownWays: true, origin: [MX0, MY0], size: [MW, MH], ground: 'grass', tiles: T.map(r => r.join('')), objects: O, npcs: N, spawns: S, fishing: [] };
}
const MOOR = moor();
/* SPUR: between the zones and the road the world itself lays the way (hand-laid trails in data/atlas/wg_tables.json, tagged so a rerun
   replaces them): cobbles from the camp gate's spur up onto the Saltmere road (road: true, src/wg_paths.js), and a dirt path off it east
   to the Red Moor's trail. The road's own course is left alone: no zone comes within the router's reach of it. */
{
  const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TJ = JSON.parse(fs.readFileSync(TP, 'utf8')), gx = CX0 + GATE[0] + 1;
  let ry = CY0 - 1; while (ry > CY0 - 30 && worldTile(gx, ry) !== 'c') ry--;   /* the road's cobbles north of the gate */
  const T2 = (pts) => pts.map(([x, y]) => [x + OX, y + OY]);
  TJ.data.trails = (TJ.data.trails || []).filter(t => t.tag !== 'thornwatch').concat([
    { id: 'thornwatch_spur', tag: 'thornwatch', face: F, w: 2.4, road: true, pts: T2([[gx, CY0 + 1], [gx, ry]]) },
    { id: 'thornwatch_moor', tag: 'thornwatch', face: F, w: 1.2, pts: T2([[gx, CY0 - 3], [156, CY0 - 3], [160, CY0 + 1], [164, 70], [168, 100], [190, 110], [212, 118], [233, 121]]) }]);
  fs.writeFileSync(TP, JSON.stringify(TJ));
  console.log('trails: cobbled spur %d,%d -> %d,%d; moor path', gx, CY0, gx, ry);
}
const SOLIDS = [];   /* TW_SOLIDS=file: every solid piece and its tiles, for the walk-into-everything test (tests/thornwatch_solid_pw.py) */
for (const [id, Z] of [['thornwatch', camp], ['hollowden', den], ['redmoor', MOOR]]) {
  console.log('%s: %d tiles shut under scenery', id, stampSolid(Z)); write(id, Z);
  for (const o of Z.objects) { const t = footprint(o); if (t.length) SOLIDS.push({ zone: id, k: o.k, x: o.x, y: o.y, tiles: t }); }
}
if (process.env.TW_SOLIDS) fs.writeFileSync(process.env.TW_SOLIDS, JSON.stringify(SOLIDS));
