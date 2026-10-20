/* make_thornwatch.js -> data/zone.thornwatch.json, data/zone.redmoor.json, data/zone.hollowden.json, data/zone.sistersbarrow.json (2026-10-18, the operator: an Ashvale
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
     sistersbarrow  the Thornwatch's burial ground south of the moor: an iron-railed yard of graves round the old sisters' tomb, the
                  risen dead and Sister Corva (Captain Rhosyn's quest, after the den).
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
const WALK = new Set(['camp_gate', 'palisade', 'palisade_post', 'cavemouth', 'caveexit', 'iron_fence', 'iron_gate', 'iron_post', 'abbey_wall', 'abbey_wall_broken', 'abbey_gate']);   /* shut by their own wall tiles, or the way in and out */
const SOLID_IN = 0.2;
const OWN = new Set(['gravestone', 'grave_cross', 'grave_old', 'dead_tree', 'ruin_pillar']);   /* thin stones and trunks: they shut their own tile whole, as the world's decor does (src/world.js stampDecor) */
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
  if (OWN.has(o.k)) cells.set(o.x + ',' + o.y, [o.x, o.y]);
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
const BARROW_TRAIL = [[258, 127], [259, 140], [262, 152], [263, 165]];   /* the moor trail's fork south, to the barrow's gate path */
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
  npc('isolde', 'Mother Isolde', 'isolde', 63, 32, { talk: 'quest', quest: 'hollow_den', quests: ['hollow_den', 'caged_seer', 'thorn_maiden'], examine: 'Mother Isolde, eldest of the Thornwatch, who sees further with her eyes shut than most do with them open.' });
  npc('elin', 'Novice Elin', 'elin', 61, 32, { shop: 'thornwatch_herbs', examine: 'Novice Elin, keeping count of Mother Isolde\'s jars.' });
  npc('gwen', 'Gwen the smith', 'gwen', 31, 10, { shop: 'thornwatch_forge', examine: 'Gwen the smith, forearms like hams and burn scars like freckles.' });
  npc('fennick', 'Fennick the peddler', 'fennick', 12, 28, { shop: 'thornwatch_peddler', examine: 'Fennick the peddler. His prices go up when you look interested.' });
  npc('rhosyn', 'Captain Rhosyn', 'rhosyn', 47, 18, Object.assign({ quest: 'sisters_barrow', quests: ['sisters_barrow', 'smiths_hammer'] }, LINES.rhosyn));   /* her quest opens once the den is cleared */
  npc('hollin', 'Old Hollin', 'hollin', 57, 28, Object.assign({ hideFlag: 'seer_freed', quest: 'drowned_tower' }, LINES.hollin));   /* by the fire once you have freed him (The Caged Seer) */
  npc('tavish', 'Tavish the caravan master', 'tavish', 26, 23, Object.assign({ openFlag: 'maiden_slain' }, LINES.tavish));   /* when the Maiden falls, the road east opens (The Thorn Maiden) */
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
  const trail = (P, bend) => { const pts = P.map(([x, y]) => G(x, y));
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0); for (let s = 0; s <= L * 2; s++) { const t = s / (L * 2), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + (bend(i) ? Math.sin(t * Math.PI) * 2 : 0); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dy) <= 1 + (rnd() < 0.3)) set(Math.round(x + dx), Math.round(y + dy), 'd'); } } };
  trail([[232, 121], [258, 127], [282, 124], [MOUTH[0], MOUTH[1] + 3]], i => i > 2);
  { const r0 = seed; trail(BARROW_TRAIL, () => false); seed = r0; }   /* the fork south to the Sisters' Barrow (seeded apart, so the den's side lays as before) */
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

/* ---------------- the Sisters' Barrow ---------------- */
/* (2026-10-18, the operator chose the site south of the moor) the Thornwatch's burial ground: the forest's edge south of the Red Moor, the
   moor trail's fork coming in at its north edge (BARROW_TRAIL) down to an iron-railed yard with an open double gate. Inside, rows of
   graves either side of a dirt aisle, a few dug open with bones spilled; in the middle the old sisters' tomb, a ring of broken pillars
   round a great slab between braziers, where Sister Corva keeps her post. The risen dead stand among the graves. Ground outside the
   railing is the world's own (sampled), so the trees run on into the forest. Places are game tiles. */
function barrow() {
  const BW = 76, BH = 74, BX0 = 232, BY0 = 166;   /* under the moor (its south edge is 166); 36 m and more from the pond at 344-356, 176-186 */
  const G = (gx, gy) => [gx - BX0, gy - BY0];
  const RX0 = 242, RY0 = 180, RX1 = 299, RY1 = 230, GATE = [262, 263];   /* the railing's tiles (a ring of X), the gate's two open tiles in the north side */
  const T = grid(BW, BH, (x, y) => { const gx = x + BX0, gy = y + BY0, c = worldTile(gx, gy);
    if (gx >= RX0 - 2 && gx <= RX1 + 2 && gy >= RY0 - 2 && gy <= RY1 + 2) return rnd() < 0.35 ? ',' : '.';   /* the yard, and a clearing round its railing */
    return c === 'p' || c === 'c' ? 'd' : c; });
  const set = (gx, gy, c) => { const [x, y] = G(gx, gy); if (x >= 0 && y >= 0 && x < BW && y < BH) T[y][x] = c; };
  const at = (gx, gy) => { const [x, y] = G(gx, gy); return T[y] && T[y][x]; };
  const O = [], S = [];
  const put = (k, gx, gy, extra) => O.push(Object.assign({ k, x: gx, y: gy }, extra || {}));
  /* the path: from the moor's fork at the north edge down to the gate, then the aisle south to the tomb */
  for (let gy = BY0; gy < RY0; gy++) { const wob = Math.round(Math.sin(gy * 0.5) * 0.6); for (const gx of [GATE[0] + wob, GATE[1] + wob]) set(gx, gy, 'd'); if (rnd() < 0.4) set(GATE[0] - 1 + wob, gy, 'd'); }
  for (let gy = RY0; gy <= 202; gy++) for (const gx of GATE) set(gx, gy, 'd');
  /* the way on south (2026-10-19, The Caged Seer): off the gate path west along the north railing, then down outside the west
     railing to the stone field below; the forest is cut back for it */
  for (let gx = 236; gx <= GATE[0]; gx++) for (const gy of [172, 173]) set(gx, gy, 'd');
  for (let gy = 172; gy < BY0 + BH; gy++) { const wob = Math.round(Math.sin(gy * 0.35) * 0.6); set(236 + wob, gy, 'd'); set(237 + wob, gy, 'd'); }
  /* the railing: X tiles all round but the gate, an iron section on each, stone piers at the corners, the double gate */
  const Q = Math.PI / 2;
  for (let gx = RX0; gx <= RX1; gx++) { if (!GATE.includes(gx)) { set(gx, RY0, 'X'); put('iron_fence', gx, RY0); } set(gx, RY1, 'X'); put('iron_fence', gx, RY1); }
  for (let gy = RY0 + 1; gy < RY1; gy++) { set(RX0, gy, 'X'); put('iron_fence', RX0, gy, { ry: Q }); set(RX1, gy, 'X'); put('iron_fence', RX1, gy, { ry: Q }); }
  for (const [gx, gy] of [[RX0, RY0], [RX1, RY0], [RX0, RY1], [RX1, RY1]]) put('iron_post', gx, gy);
  put('iron_gate', GATE[0], RY0, { dx: 0.5 }); put('lantern_post', GATE[0] - 2, RY0 - 2); put('lantern_post', GATE[1] + 2, RY0 - 2);
  /* the tomb in the middle: a dirt ring, broken pillars round the old slab, braziers either side, bones */
  const TC = [270, 206];
  for (let gy = TC[1] - 5; gy <= TC[1] + 5; gy++) for (let gx = TC[0] - 6; gx <= TC[0] + 6; gx++) if (((gx - TC[0]) / 6.5) ** 2 + ((gy - TC[1]) / 5.5) ** 2 <= 1) set(gx, gy, rnd() < 0.8 ? 'd' : ',');
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.2; if (k === 6) continue; put('ruin_pillar', Math.round(TC[0] + Math.cos(a) * 5), Math.round(TC[1] + Math.sin(a) * 4), { ry: rnd() * 6 }); }   /* one fallen: the way in from the aisle */
  put('grave_old', TC[0], TC[1], { s: 1.6, ry: 0 }); put('skull_stone', TC[0] - 2, TC[1] + 1, { ry: 0.3 }); put('skull_stone', TC[0] + 2, TC[1] + 1, { ry: -0.3 });
  put('tripod_brazier', TC[0] - 2, TC[1] - 2); put('tripod_brazier', TC[0] + 2, TC[1] - 2);
  put('bone_pile', TC[0] + 1, TC[1] + 3, { ry: 1.3 }); put('bone_pile', TC[0] - 3, TC[1] - 1, { ry: 4 });
  /* the graves: rows of them either side of the aisle and round the tomb, north to south; some dug open, their bones spilled out */
  const KINDS = ['gravestone', 'gravestone', 'gravestone', 'gravestone', 'grave_cross', 'grave_cross', 'grave_cross', 'grave_old', 'grave_old'];
  const nearTomb = (gx, gy) => ((gx - TC[0]) / 8.5) ** 2 + ((gy - TC[1]) / 7.5) ** 2 <= 1;
  let open = 0;
  for (let gy = RY0 + 4; gy <= RY1 - 4; gy += 3) for (let gx = RX0 + 3; gx <= RX1 - 3; gx += 3) {
    if (Math.abs(gx - GATE[0] - 0.5) < 3 && gy <= 202 || nearTomb(gx, gy) || rnd() < 0.12) continue;
    if (rnd() < 0.1) { set(gx, gy, 'd'); set(gx, gy + 1, 'd'); if (rnd() < 0.6) put('bone_pile', gx, gy + 1, { ry: rnd() * 6 }); open++; continue; }   /* dug open from below */
    put(KINDS[Math.floor(rnd() * KINDS.length)], gx, gy, { ry: +((rnd() - 0.5) * 0.25).toFixed(3), s: +(0.9 + rnd() * 0.15).toFixed(2) });
  }
  /* dead trees in the yard's corners, a few lanterns that still burn */
  for (const [gx, gy] of [[245, 183], [296, 184], [245, 227], [296, 226], [282, 196]]) { put('dead_tree', gx, gy, { ry: rnd() * 6 }); }
  /* the risen dead among the graves, and Corva at the tomb with her quiver full */
  const free = (gx, gy) => { const c = at(gx, gy); return c && BLOCK.indexOf(c) < 0 && !O.some(o => o.x === gx && o.y === gy); };
  const sp = (m, gx, gy, extra) => { for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) { const px = Math.round(gx + Math.cos(k * 0.8) * r), py = Math.round(gy + Math.sin(k * 0.8) * r); if (free(px, py)) { S.push(Object.assign({ m, x: px, y: py }, extra || {})); return; } } };
  for (const [gx, gy] of [[252, 188], [276, 188], [290, 190], [248, 199], [258, 204], [284, 203], [293, 210], [250, 214], [262, 216], [278, 216], [289, 221], [254, 225], [270, 224], [283, 227]]) sp('risen_dead', gx, gy);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.5; sp('risen_dead', Math.round(TC[0] + Math.cos(a) * 7), Math.round(TC[1] + Math.sin(a) * 6)); }   /* her flock, round the tomb: you fight them and her at once */
  sp('corva', TC[0], TC[1] + 2, { carry: { arrows_t4: 40 } });
  console.error('barrow: %d graves, %d dug open', O.filter(o => /^grave/.test(o.k)).length, open);
  return { name: "The Sisters' Barrow", level: '23-36', ownWays: true, origin: [BX0, BY0], size: [BW, BH], ground: 'grass', tiles: T.map(r => r.join('')), objects: O, npcs: [], spawns: S, fishing: [] };
}
const BARROW = barrow();

/* ---------------- The Caged Seer (2026-10-19, the operator: "add the rest of the chapters"; site south, his choice) ---------------- */
/* Mother Isolde's second errand, after the barrow: fetch the scroll from the hollow oak in the Gloamwood (touching the oak wakes
   Gnarlbark and his ashlings, a trial of your own), bring it to her to read, wake the Fivestones in the order it gives, step through
   the red ring they open into Emberfall, the burned village, and put down the cursed smith Bregan to free Old Hollin from his cage.
   Rakkas and his band keep the stones. Engine: mechanisms (hidden: their look is the decor on their tile), a portal gate that
   `need`s the last stone's flag, Hollin in the cage with goneFlag, Hollin in camp with hideFlag (tools/thornwatch/ACT_PLAN.md). */
const SF = { X0: 232, Y0: 240, W: 76, H: 76 }, RING = [268, 280];          /* the Fivestones: under the barrow */
const GW = { X0: 216, Y0: 316, W: 92, H: 86 }, OAK = [288, 386];           /* the Gloamwood: under the stone field */
const EF = { X0: 396, Y0: 296, W: 70, H: 60 }, EF_IN = [405, 326];         /* Emberfall: shut in by forest, east of them all; you arrive by its ring */
const STONES = [['hawk', 'Hawk'], ['hare', 'Hare'], ['hound', 'Hound'], ['heron', 'Heron'], ['hart', 'Hart']];
const STONE_ORDER = [0, 2, 4, 1, 3];   /* the scroll's order: round the ring as a five-pointed star */
function zoneKit(Z, fill) {   /* a world-sampled piece: tiles, set/at in game tiles, a winding dirt path, a clearing, a spawner */
  const G = (gx, gy) => [gx - Z.X0, gy - Z.Y0];
  const T = grid(Z.W, Z.H, (x, y) => fill ? fill(x + Z.X0, y + Z.Y0) : (c => c === 'p' || c === 'c' ? 'd' : c)(worldTile(x + Z.X0, y + Z.Y0)));
  const set = (gx, gy, c) => { const [x, y] = G(gx, gy); if (x >= 0 && y >= 0 && x < Z.W && y < Z.H) T[y][x] = c; };
  const at = (gx, gy) => { const [x, y] = G(gx, gy); return T[y] && T[y][x]; };
  const path = (P, w) => { for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], L = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s <= L * 2; s++) { const t = s / (L * 2), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (Math.abs(dx) + Math.abs(dy) <= w + (rnd() < 0.3)) set(Math.round(x + dx), Math.round(y + dy), 'd'); } } };
  const clearing = (cx, cy, rx, ry) => { for (let gy = Math.floor(cy - ry); gy <= cy + ry; gy++) for (let gx = Math.floor(cx - rx); gx <= cx + rx; gx++) if (((gx - cx) / rx) ** 2 + ((gy - cy) / ry) ** 2 <= 0.8 + rnd() * 0.35 && BLOCK.indexOf(at(gx, gy) || '.') >= 0) set(gx, gy, rnd() < 0.3 ? ',' : '.'); };
  const O = [], S = [], N = [];
  const free = (gx, gy) => { const c = at(gx, gy); return c && BLOCK.indexOf(c) < 0 && !O.some(o => Math.abs(o.x - gx) <= 1 && Math.abs(o.y - gy) <= 1); };
  const sp = (m, gx, gy, extra) => { for (let r = 0; r < 6; r++) for (let k = 0; k < 8; k++) { const px = Math.round(gx + Math.cos(k * 0.8) * r), py = Math.round(gy + Math.sin(k * 0.8) * r); if (free(px, py) && !S.some(e => e.x === px && e.y === py)) { S.push(Object.assign({ m, x: px, y: py }, extra || {})); return; } } console.error('no room for %s near %d,%d', m, gx, gy); };
  const put = (k, gx, gy, extra) => O.push(Object.assign({ k, x: gx, y: gy }, extra || {}));
  return { G, T, set, at, path, clearing, O, S, N, free, sp, put };
}

function fivestones() {
  const K = zoneKit(SF), { set, path, clearing, put, sp, O } = K;
  /* the way in from round the barrow, across the field to the ring, and on south to the wood */
  path([[236, 240], [240, 252], [252, 266], [262, 276]], 1);
  path([[270, 288], [262, 298], [254, 308], [252, 315]], 1);
  /* a stony field: the ring's ground cleared, grass between rocks, boulders and a few dead trees */
  clearing(RING[0], RING[1], 16, 14); for (let gy = RING[1] - 10; gy <= RING[1] + 10; gy++) for (let gx = RING[0] - 11; gx <= RING[0] + 11; gx++) if (((gx - RING[0]) / 11) ** 2 + ((gy - RING[1]) / 10) ** 2 <= 1 && BLOCK.indexOf(K.at(gx, gy) || '.') >= 0) set(gx, gy, rnd() < 0.3 ? ',' : '.');   /* the ring itself stands in the open
  for (let gy = SF.Y0 + 2; gy < SF.Y0 + SF.H - 2; gy++) for (let gx = SF.X0 + 2; gx < SF.X0 + SF.W - 2; gx++) if ('TPOMWY'.indexOf(K.at(gx, gy)) >= 0 && rnd() < 0.55) set(gx, gy, rnd() < 0.4 ? ',' : '.');   /* the forest thins out on the field */
  for (const [gx, gy] of [[246, 258], [284, 262], [292, 290], [250, 290], [280, 302], [296, 270], [258, 248], [240, 300]]) put('boulders', gx, gy, { ry: rnd() * 6 });
  for (const [gx, gy] of [[288, 250], [244, 276], [300, 304]]) put('dead_tree', gx, gy, { ry: rnd() * 6 });
  /* the five stones round the ring, each a mechanism under its stone: woken in the scroll's order, the last opens the ring */
  STONES.forEach(([id, name], i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 5, gx = Math.round(RING[0] + Math.cos(a) * 7), gy = Math.round(RING[1] + Math.sin(a) * 6), j = STONE_ORDER.indexOf(i);
    put('standing_stone', gx, gy, { ry: -a - Math.PI / 2 });
    O.push({ k: 'mechanism', id: 'fivestone_' + id, x: gx, y: gy, hidden: true, quest: 'caged_seer', step: 2, name: name + ' stone', label: 'Touch',
             flag: j < 4 ? 'fivestones_' + (j + 1) : 'stones_open', need: j ? ['fivestones_' + j] : [],
             shut: 'The ' + name.toLowerCase() + ' cut into the stone stays cold under your hand. Another stone must wake first.',
             done: 'The ' + name.toLowerCase() + ' stone is awake already, humming under your palm.',
             say: j < 4 ? 'The ' + name.toLowerCase() + ' cut into the stone flares blue under your hand. ' + (4 - j) + ' still sleep.' : 'The ' + name.toLowerCase() + ' flares, and all five stones answer. Between them the air tears open, red as a coal.',
             unlock: j === 4 ? 'The Fivestones are awake. A red ring of light now stands in the middle of the circle: it leads to Emberfall.' : undefined });
  });
  put('portalgate', RING[0], RING[1], { to: [EF_IN[0] + 1, EF_IN[1]], need: 'stones_open', color: '#d0402a', name: 'The red ring', label: 'Step through',
           shut: 'The red light stands dull and hard as glass. The stones are not awake.', say: 'You step through the red light. The air smells of smoke.' });
  /* Rakkas and his band keep the stones; walkers in the long grass */
  sp('rakkas', RING[0] + 3, RING[1] + 10); for (const [dx, dy] of [[0, 12], [5, 11], [-2, 13], [6, 14]]) sp('stone_ashling', RING[0] + dx, RING[1] + dy);
  for (const [gx, gy] of [[246, 262], [290, 258], [298, 296], [244, 296], [282, 306]]) sp('field_walker', gx, gy);
  for (const [gx, gy] of [[256, 258], [259, 260], [254, 261]]) sp('stone_ashling', gx, gy);
  return { name: 'The Fivestones', level: '27-42', ownWays: true, origin: [SF.X0, SF.Y0], size: [SF.W, SF.H], ground: 'grass', tiles: K.T.map(r => r.join('')), objects: O, npcs: K.N, spawns: K.S, fishing: [] };
}

function gloamwood() {
  const K = zoneKit(GW), { set, path, clearing, put, sp, O } = K;
  /* the forest left as it grows; a path in from the stone field winding down to the oak, and clearings where the packs sleep */
  path([[252, 316], [248, 330], [256, 342], [270, 352], [276, 366], [286, 378], [288, 383]], 1);
  clearing(OAK[0], OAK[1] + 1, 10, 9); clearing(250, 336, 5, 4); clearing(276, 360, 5, 4); clearing(236, 360, 6, 5); clearing(296, 340, 5, 5);
  path([[256, 342], [244, 352], [236, 360]], 0); path([[270, 352], [286, 346], [296, 340]], 0);
  put('hollow_oak', OAK[0], OAK[1], { s: 1.6 });
  /* the oak's mechanism stands at the mouth of the hollow, past its roots (the trunk and roots shut the oak's own tiles, and a mechanism is used from a tile beside it, never across a corner) */
  O.push({ k: 'mechanism', id: 'hollow_oak', x: OAK[0], y: OAK[1] + 3, hidden: true, quest: 'caged_seer', step: 1, flag: 'seer_scroll', name: 'The hollow oak', label: 'Reach into',
           summon: [{ m: 'gnarlbark', x: OAK[0] - 3, y: OAK[1] - 1 }, { m: 'grove_ashling', x: OAK[0] + 3, y: OAK[1] + 2 }, { m: 'thornback', x: OAK[0] - 4, y: OAK[1] + 3 }],   /* one of a kind each: a trial calls one per monster key (core.js summonFor) */
           kills: { gnarlbark: 1, grove_ashling: 1, thornback: 1 }, home: [OAK[0], OAK[1], 18],
           say: 'You reach into the hollow and the whole tree groans. The bark beside you splits, and something with a face of knots steps out of the trunk.',
           unlock: 'Gnarlbark falls back into the roots. From the hollow you draw a roll of bark-paper, tied with red thread. Take it to Mother Isolde.',
           done: 'The hollow is empty now. The scroll is with you.' });
  for (const [gx, gy] of [[OAK[0] - 4, OAK[1] + 4], [OAK[0] + 5, OAK[1] + 3]]) put('bone_pile', gx, gy, { ry: rnd() * 6 });
  for (const [gx, gy] of [[262, 346], [244, 336], [282, 372]]) put('fallen_log', gx, gy, { ry: rnd() * 6 });
  /* the wood's own: ashling packs in the clearings, thornbacks on the paths, gloom brutes in the deep */
  for (const [cx, cy] of [[250, 336], [236, 360], [296, 340]]) for (let k = 0; k < 3; k++) sp('grove_ashling', cx + (k - 1) * 2, cy + (k % 2));
  for (const [gx, gy] of [[256, 326], [272, 356], [262, 346], [282, 374]]) sp('thornback', gx, gy);
  for (const [gx, gy] of [[276, 360], [240, 362], [298, 344]]) sp('gloom_brute', gx, gy);
  return { name: 'The Gloamwood', level: '26-40', ownWays: true, origin: [GW.X0, GW.Y0], size: [GW.W, GW.H], ground: 'grass', tiles: K.T.map(r => r.join('')), objects: O, npcs: K.N, spawns: K.S, fishing: [] };
}

function emberfall() {
  /* a hamlet burned a month ago and still smouldering, shut in by forest so the only way in is the red ring: a square with the
     broken well, burned houses round it, the gibbet in the middle where they hung Hollin up to wait for the end */
  const ring = (gx, gy) => Math.min(gx - EF.X0, gy - EF.Y0, EF.X0 + EF.W - 1 - gx, EF.Y0 + EF.H - 1 - gy);
  const K = zoneKit(EF, (gx, gy) => ring(gx, gy) < 3 ? 'T' : ring(gx, gy) < 6 ? (rnd() < 0.5 ? 'T' : ',') : rnd() < 0.35 ? 'd' : rnd() < 0.5 ? ',' : '.');
  const { set, put, sp, O, N } = K, SQ = [431, 326];
  for (let gy = SQ[1] - 6; gy <= SQ[1] + 6; gy++) for (let gx = SQ[0] - 8; gx <= SQ[0] + 8; gx++) if (((gx - SQ[0]) / 8.5) ** 2 + ((gy - SQ[1]) / 6.5) ** 2 <= 1) set(gx, gy, 'd');
  K.path([[EF_IN[0] + 1, EF_IN[1]], [SQ[0] - 8, SQ[1]]], 1);
  /* the ring you arrive by, and back */
  put('portalgate', EF_IN[0], EF_IN[1], { to: [RING[0], RING[1] + 2], color: '#d0402a', name: 'The red ring', label: 'Step through', say: 'You step back through the red light into the cold of the stone field.' });
  /* the burned houses: walls of burned stone, two metres a section, a gap for the door, beams fallen in, embers */
  const house = (x0, y0, w, h, door) => {
    for (let gx = x0; gx < x0 + w; gx += 2) for (const [gy, side] of [[y0, 'n'], [y0 + h, 's']]) { if (door[0] === side && gx === door[1]) continue; if (rnd() < 0.85) put('burnt_wall', gx, gy, { dx: 0.5 }); }
    for (let gy = y0 + 1; gy < y0 + h; gy += 2) for (const [gx, side] of [[x0 - 1, 'w'], [x0 + w - 1, 'e']]) { if (door[0] === side && gy === door[1]) continue; if (rnd() < 0.85) put('burnt_wall', gx, gy, { dz: 0.5, ry: Math.PI / 2 }); }
    put('charred_beam', x0 + (w >> 1), y0 + (h >> 1), { ry: rnd() * 6 }); if (rnd() < 0.7) put('ember_heap', x0 + 2, y0 + 2, { ry: rnd() * 6 });
  };
  house(414, 306, 8, 6, ['s', 418]); house(428, 304, 8, 6, ['s', 432]); house(444, 308, 8, 6, ['s', 448]);
  house(416, 340, 8, 6, ['n', 420]); house(432, 342, 8, 6, ['n', 436]); house(448, 336, 8, 6, ['w', 339]);
  /* the square: the well, the gibbet with Hollin in it (the cage stands round him), braziers the dead keep lit */
  put('ruin_pillar', SQ[0] - 5, SQ[1] - 3, { ry: 0.7 }); put('ember_heap', SQ[0] + 6, SQ[1] + 3, { ry: 2 }); put('ember_heap', SQ[0] - 6, SQ[1] + 4, { ry: 4 });
  put('gibbet_cage', SQ[0], SQ[1]); put('tripod_brazier', SQ[0] - 3, SQ[1] + 2); put('tripod_brazier', SQ[0] + 3, SQ[1] + 2);
  N.push(Object.assign({ id: 'hollin_caged', name: 'Old Hollin', look: 'hollin_caged', x: SQ[0], y: SQ[1], goneFlag: 'seer_freed' }, LINES.hollin_caged));
  for (const [gx, gy] of [[426, 318], [440, 334], [452, 322], [420, 332], [446, 316]]) put('charred_beam', gx, gy, { ry: rnd() * 6 });
  for (const [gx, gy] of [[412, 318], [458, 330], [438, 350], [424, 300]]) put('dead_tree', gx, gy, { ry: rnd() * 6 });
  /* the dead of Emberfall, still burning; ashlings picking over the ruins; Bregan the smith at the gibbet */
  sp('bregan', SQ[0] + 2, SQ[1] + 4);
  for (const [gx, gy] of [[420, 314], [434, 314], [448, 318], [424, 336], [440, 338], [452, 330], [416, 324], [444, 326], [430, 334], [456, 314]]) sp('cinder_dead', gx, gy);
  for (const [gx, gy] of [[414, 330], [418, 330], [438, 320], [442, 320], [450, 344], [454, 346], [426, 344], [436, 318]]) sp('ember_ashling', gx, gy);
  return { name: 'Emberfall', level: '28-46', ownWays: true, origin: [EF.X0, EF.Y0], size: [EF.W, EF.H], ground: 'dirt', tiles: K.T.map(r => r.join('')), objects: O, npcs: N, spawns: K.S, fishing: [] };
}
const STONEFIELD = fivestones(), GLOAMWOOD = gloamwood(), EMBERFALL = emberfall();

/* ---------------- The Drowned Tower (2026-10-19, chapter 4) ---------------- */
/* Old Hollin's errand: south of the Gloamwood lies the Blackmere, a bog with a ruined tower sunk in it. Its cellars go down four
   levels; Countess Morwen, who drowned the village that stood here for her bath of youth, keeps the bottom one with her maids.
   The way on from the oak (laid with its own dice, so the wood and Emberfall above keep theirs) runs out of the Gloamwood's south-east
   corner into the bog. The cellars are one underground area (`under`), four levels side by side in the rock, joined by stairs. */
const BM = { X0: 296, Y0: 402, W: 110, H: 88 }, TOWER = [366, 448];
const TC = { X0: 24500, Y0: 24000, W: 172, H: 46 }, TC_LV = 4, TC_STEP = 42;
const TOWER_DOOR = [TOWER[0], TOWER[1] + 3];   /* the stair down, under the doorway's lintel; you stand on the tile below it */
function blackmere() {
  const K = zoneKit(BM), { set, at, path, put, sp, O } = K;
  /* the bog: the forest drowned to scrub and reed, mud between, black pools you walk round */
  for (let gy = BM.Y0; gy < BM.Y0 + BM.H; gy++) for (let gx = BM.X0; gx < BM.X0 + BM.W; gx++) { const c = at(gx, gy);
    if ('TPOMWY'.indexOf(c) >= 0 && rnd() < 0.8) set(gx, gy, rnd() < 0.55 ? 'd' : ','); else if (c === '.' || c === 'f' || c === 'F') set(gx, gy, rnd() < 0.55 ? 'd' : ','); }   /* mud and sour dark grass: no bright meadow (2026-10-19)
  path([[300, 402], [310, 414], [326, 424], [342, 436], [356, 446], [TOWER_DOOR[0], TOWER_DOOR[1] + 2]], 1);
  /* the tower's ground: firm stone round its foot */
  for (let gy = TOWER[1] - 6; gy <= TOWER[1] + 6; gy++) for (let gx = TOWER[0] - 6; gx <= TOWER[0] + 6; gx++) if ((gx - TOWER[0]) ** 2 + (gy - TOWER[1]) ** 2 <= 40) set(gx, gy, rnd() < 0.6 ? 'd' : ',');
  put('ruined_tower', TOWER[0], TOWER[1]);
  put('stairs', TOWER_DOOR[0], TOWER_DOOR[1], { to: [TC.X0 + 6, TC.Y0 + 6], name: 'Cellar stair', label: 'Go down', say: 'You go down the slick steps. Water drips somewhere below, and somebody hums.',
       examine: 'Stone steps going down into the tower\'s dark. The bottom ones are under water.' });
  /* bog pools (their tiles shut), reeds round them and along the path, dead trees */
  const onPath = (gx, gy) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (at(gx + dx, gy + dy) === 'd' && Math.abs(gx - TOWER[0]) + Math.abs(gy - TOWER[1]) > 12) return false; return true; };
  let pools = 0;
  for (const [gx, gy] of [[310, 432], [322, 446], [336, 412], [352, 420], [380, 418], [392, 436], [388, 462], [372, 474], [350, 470], [330, 466], [316, 456], [342, 456], [398, 410], [304, 476], [396, 480]]) {
    if (Math.hypot(gx - TOWER[0], gy - TOWER[1]) < 10) continue;
    put('bog_pool', gx, gy, { ry: rnd() * 6 }); pools++;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dy) < 2 || rnd() < 0.5) set(gx + dx, gy + dy, 'X');
    for (let k = 0; k < 3; k++) { const a = rnd() * 6.283, rx = Math.round(gx + Math.cos(a) * 3), ry = Math.round(gy + Math.sin(a) * 3); if (BLOCK.indexOf(at(rx, ry) || 'X') < 0 && at(rx, ry) !== 'd') put('reed_clump', rx, ry, { ry: rnd() * 6 }); }
  }
  for (const [gx, gy] of [[318, 420], [362, 430], [384, 450], [340, 480], [306, 444], [374, 412]]) if (BLOCK.indexOf(at(gx, gy) || 'X') < 0) put('dead_tree', gx, gy, { ry: rnd() * 6 });
  /* the bog's own: the drowned dead and the stalkers in the reeds */
  for (const [gx, gy] of [[316, 428], [330, 436], [346, 428], [360, 436], [378, 440], [356, 460], [336, 470], [384, 470]]) sp('mire_dead', gx, gy);
  for (const [gx, gy] of [[320, 440], [344, 418], [372, 424], [390, 446], [364, 470], [326, 458]]) sp('bog_stalker', gx, gy);
  console.error('blackmere: %d pools', pools);
  return { name: 'The Blackmere', level: '30-50', ownWays: true, origin: [BM.X0, BM.Y0], size: [BM.W, BM.H], ground: 'grass', tiles: K.T.map(r => r.join('')), objects: O, npcs: K.N, spawns: K.S, fishing: [] };
}
/* an underground run of levels side by side in the rock (C: X0, Y0, W, H, lv, step), each a run of rooms joined by passages: you come
   down a stair into the first room of a level and the stair on down is in its last; the stair up stands beside where you arrive.
   cfg: rooms (per level, [x0, y0, x1, y1] in the level's own frame), top (where the first stair up comes out), topName, topSay,
   downSay (per level), lit ('tripod_brazier' in a corner of every room), litter (a piece left in rooms, about 3 in 5), spawns
   ([key, level, room, n]), and the zone's name, level, surface. The tower's cellars and the abbey's crypts (2026-10-19). */
function deepLevels(C, cfg) {
  const g = (x, y) => [x + C.X0, y + C.Y0];
  const T = grid(C.W, C.H, () => '^');
  const carve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x > 0 && y > 0 && x < C.W - 1 && y < C.H - 1) T[y][x] = 'd'; };
  const O = [], S = [], N = [], ARR = [], DOWN = [], ROOMS = cfg.rooms;
  for (let l = 0; l < C.lv; l++) {
    const ox = 2 + l * C.step, R = ROOMS[l].map(([a, b, c, d]) => [a + ox, b, c + ox, d]);
    for (const r of R) carve(...r);
    for (let i = 1; i < R.length; i++) { const [a, b] = [R[i - 1], R[i]], ax = (a[0] + a[2]) >> 1, ay = (a[1] + a[3]) >> 1, bx = (b[0] + b[2]) >> 1, by = (b[1] + b[3]) >> 1;
      carve(Math.min(ax, bx), ay - 1, Math.max(ax, bx), ay); carve(bx - 1, Math.min(ay, by), bx, Math.max(ay, by)); }   /* an L-shaped passage, two wide */
    const f = R[0], last = R[R.length - 1];
    ARR.push([f[0] + 3, f[1] + 3]); DOWN.push([last[2] - 1, last[3] - 1]);
  }
  for (let l = 0; l < C.lv; l++) {
    const [ax, ay] = ARR[l], up = l ? DOWN[l - 1] : null;
    O.push(Object.assign({ k: 'stairsup', x: g(ax - 1, ay - 1)[0], y: g(ax - 1, ay - 1)[1], name: l ? 'Stair up' : cfg.topName, label: 'Go up',
      to: l ? g(up[0] - 1, up[1]) : cfg.top, say: l ? 'You climb back up a level.' : cfg.topSay }));
    if (l < C.lv - 1) { const [dx, dy] = DOWN[l]; O.push({ k: 'stairs', x: g(dx, dy)[0], y: g(dx, dy)[1], name: 'Stair down', label: 'Go down', to: g(ARR[l + 1][0], ARR[l + 1][1]),
      say: cfg.downSay[l + 1] || 'You go down.' }); }
  }
  /* a light in every room, and what was left lying there */
  /* a solid piece of litter (cfg.litterSolid: a stone coffin) never stands where a passage comes into the room: it would shut it */
  const corridorBy = (x, y, r) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const tx = x + dx, ty = y + dy; if (T[ty] && T[ty][tx] === 'd' && (tx < r[0] || tx > r[2] || ty < r[1] || ty > r[3])) return true; } return false; };
  for (let l = 0; l < C.lv; l++) for (const [a, b, c, d] of ROOMS[l]) { const ox = 2 + l * C.step; O.push({ k: 'tripod_brazier', x: g(c + ox - 1, b + 1)[0], y: g(c + ox - 1, b + 1)[1] });
    if (cfg.brighter) { O.push({ k: 'tripod_brazier', x: g(a + ox + 1, b + 1)[0], y: g(a + ox + 1, b + 1)[1] }); if (d - b > 12) for (let yy = b + 6; yy < d - 3; yy += 7) for (const xx of [a + ox + 1, c + ox - 1]) O.push({ k: 'tripod_brazier', x: g(xx, yy)[0], y: g(xx, yy)[1] }); }   /* two lights a room, and down the long halls' walls (2026-10-19: the first cellars were too dark to read) */
    if (rnd() < 0.6 && !(cfg.litterSolid && corridorBy(a + ox + 1, d - 1, [a + ox, b, c + ox, d]))) O.push({ k: cfg.litter, x: g(a + ox + 1, d - 1)[0], y: g(a + ox + 1, d - 1)[1], ry: cfg.litterSolid ? 0 : rnd() * 6 }); }
  /* who keeps each level */
  const sp = (m, l, room, n, extra) => { const ox = 2 + l * C.step, [a, b, c, d] = ROOMS[l][room]; for (let i = 0; i < n; i++) { let x, y, k = 0; do { x = a + ox + 1 + Math.floor(rnd() * (c - a - 1)); y = b + 1 + Math.floor(rnd() * (d - b - 1)); k++; } while (k < 30 && (T[y][x] !== 'd' || S.some(e => e.x === g(x, y)[0] && e.y === g(x, y)[1]) || O.some(o => o.x === g(x, y)[0] && o.y === g(x, y)[1]))); S.push(Object.assign({ m, x: g(x, y)[0], y: g(x, y)[1] }, extra || {})); } };
  for (const [m, l, room, n, extra] of cfg.spawns) sp(m, l, room, n, extra);
  return { name: cfg.name, level: cfg.level, under: true, surface: cfg.surface, surfaceOffset: [cfg.surface[0] - C.X0, cfg.surface[1] - C.Y0], origin: [C.X0, C.Y0], size: [C.W, C.H], ground: 'cave',
           tiles: T.map(r => r.join('')), objects: O, spawns: S, npcs: N, fishing: [], arrive: g(ARR[0][0], ARR[0][1]), weather: { none: true } };
}
function towerCellars() {
  /* four levels; level 4 is one long hall: Morwen and her maids */
  return deepLevels(Object.assign({ lv: TC_LV, step: TC_STEP }, TC), {
    rooms: [[[3, 3, 11, 10], [16, 4, 24, 11], [28, 3, 36, 12], [27, 20, 36, 28], [14, 22, 23, 30], [3, 30, 12, 40]],
            [[3, 3, 10, 11], [3, 18, 13, 26], [18, 14, 26, 22], [30, 4, 37, 12], [29, 24, 37, 32], [16, 33, 26, 41]],
            [[3, 3, 11, 9], [17, 3, 26, 10], [31, 3, 37, 14], [30, 21, 37, 30], [15, 18, 24, 27], [4, 22, 11, 41]],
            [[3, 3, 10, 9], [3, 15, 37, 40]]],
    top: [TOWER_DOOR[0], TOWER_DOOR[1] + 1], topName: 'Stair up to the bog', topSay: 'You climb out into the grey light of the bog.',
    downSay: ['', 'Deeper. The walls are wet, and warm.', 'Deeper still. The humming is louder.'], litter: 'bone_pile', brighter: true,
    spawns: [['tower_shade', 0, 1, 2], ['tower_shade', 0, 3, 2], ['bone_guard', 0, 4, 1], ['bone_guard', 0, 5, 1],
             ['tower_shade', 1, 1, 2], ['bone_guard', 1, 2, 2], ['tower_shade', 1, 4, 2], ['bone_guard', 1, 5, 1],
             ['bone_guard', 2, 1, 2], ['blood_maid', 2, 3, 2], ['tower_shade', 2, 4, 2], ['blood_maid', 2, 5, 1],
             ['morwen', 3, 1, 1], ['blood_maid', 3, 1, 4]],
    name: 'The Drowned Tower', level: '32-50', surface: TOWER_DOOR });
}
{ const r0 = seed; seed = 20261019; GLOAMWOOD_SOUTH(); seed = r0; }
function GLOAMWOOD_SOUTH() { /* the way out of the Gloamwood's south-east corner to the bog, cut into the wood's own tiles */
  const T = GLOAMWOOD.tiles.map(r => r.split('')), set = (gx, gy) => { const x = gx - GW.X0, y = gy - GW.Y0; if (T[y] && T[y][x] != null && T[y][x] !== 'X') T[y][x] = 'd'; };
  const P = [[290, 389], [294, 393], [298, 397], [300, 401]];
  for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; for (let s = 0; s <= 12; s++) { const x = x0 + (x1 - x0) * s / 12, y = y0 + (y1 - y0) * s / 12; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) set(Math.round(x + dx), Math.round(y + dy)); } }
  GLOAMWOOD.tiles = T.map(r => r.join(''));
}
const BLACKMERE = blackmere(), CELLARS = towerCellars();

/* ---------------- The Smith's Hammer and The Thorn Maiden (2026-10-19, chapters 5 and 6) ---------------- */
/* The Thornwatch abbey, fallen: south of the Blackmere, a walled compound on firm ground. The gate in the north wall; the outer yard
   with the abbey's town portal; the barracks against the west wall, where Gorrath the forgekeeper works the abbey forge with Gwen's
   hammer (chapter 5, Captain Rhosyn's errand); the cloister in the middle; the cathedral against the east wall, its crypt stair
   behind the altar going down four levels to Maelis, Maiden of Thorns (chapter 6, Mother Isolde's last errand). The bog's way south
   (BLACKMERE_SOUTH, laid without dice so the bog keeps its own) meets the abbey's north edge. */
const AB = { X0: 316, Y0: 490, W: 124, H: 108 }, AW = [330, 506, 426, 590], AGATE = [377, 378];
const BARRACKS = [334, 544, 360, 586], CLOISTER = [368, 548, 394, 574], CATHEDRAL = [400, 540, 424, 586];
const CRYPT_STAIR = [412, 582], ABBEY_PORTAL = [366, 514];
const CR = { X0: 24740, Y0: 24000, W: 172, H: 46, lv: 4, step: 42 };
function BLACKMERE_SOUTH() {
  const T = BLACKMERE.tiles.map(r => r.split('')), set = (gx, gy) => { const x = gx - BM.X0, y = gy - BM.Y0; if (T[y] && T[y][x] != null && T[y][x] !== 'X') T[y][x] = 'd'; };
  const P = [[TOWER_DOOR[0], TOWER_DOOR[1] + 3], [370, 466], [374, 478], [377, 489]];
  for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; for (let s = 0; s <= 16; s++) { const x = x0 + (x1 - x0) * s / 16, y = y0 + (y1 - y0) * s / 16; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) set(Math.round(x + dx), Math.round(y + dy)); } }
  BLACKMERE.tiles = T.map(r => r.join(''));
  BLACKMERE.objects = BLACKMERE.objects.filter(o => !(o.k === 'bog_pool' || o.k === 'reed_clump') || P.every(([x, y], i) => i === 0 || Math.hypot(o.x - x, o.y - y) > 3));   /* nothing standing in the new way */
}
BLACKMERE_SOUTH();
function abbey() {
  const K = zoneKit(AB), { set, at, put, sp, O, N } = K;
  const [WX0, WY0, WX1, WY1] = AW;
  /* inside the walls the ground is the abbey's own: paving round the buildings, grass in the yard and the garth */
  for (let gy = WY0; gy <= WY1; gy++) for (let gx = WX0; gx <= WX1; gx++) set(gx, gy, rnd() < 0.3 ? ',' : '.');
  for (let gy = AB.Y0; gy < WY0; gy++) for (let gx = AB.X0; gx < AB.X0 + AB.W; gx++) if ('TPOMWY'.indexOf(at(gx, gy)) >= 0 && rnd() < 0.6) set(gx, gy, ',');   /* the forest thins before the walls */
  K.path([[376, 490], [377, 498], [377.5, WY0 - 1]], 1);
  K.path([[377.5, WY0], [377.5, 530], [366, 540], [362, 556]], 1); K.path([[377.5, 530], [390, 540], [400, 562]], 1);   /* the yard's ways: to the barracks door and the cathedral door */
  /* walls: 2 m sections on a ring of shut tiles; a few broken (still shut: rubble) */
  const wall = (x0, y0, x1, y1, gaps, broken) => {
    const open = new Set(gaps.map(g => g.join(',')));
    for (let gx = x0; gx <= x1; gx++) for (const gy of [y0, y1]) if (!open.has(gx + ',' + gy)) set(gx, gy, 'X');
    for (let gy = y0; gy <= y1; gy++) for (const gx of [x0, x1]) if (!open.has(gx + ',' + gy)) set(gx, gy, 'X');
    for (let gx = x0; gx < x1; gx += 2) for (const [gy, ry] of [[y0, 0], [y1, Math.PI]]) if (!open.has(gx + ',' + gy) && !open.has((gx + 1) + ',' + gy)) put(rnd() < broken ? 'abbey_wall_broken' : 'abbey_wall', gx, gy, { dx: 0.5, ry });
    for (let gy = y0 + 1; gy < y1; gy += 2) for (const [gx, ry] of [[x0, Math.PI / 2], [x1, -Math.PI / 2]]) if (!open.has(gx + ',' + gy) && !open.has(gx + ',' + (gy + 1))) put(rnd() < broken ? 'abbey_wall_broken' : 'abbey_wall', gx, gy, { dz: 0.5, ry });
  };
  wall(WX0, WY0, WX1, WY1, [[AGATE[0], WY0], [AGATE[1], WY0]], 0.12);
  for (const gx of [AGATE[0] - 2, AGATE[0] - 1, AGATE[1] + 1, AGATE[1] + 2]) set(gx, WY0, 'X');
  put('abbey_gate', AGATE[0], WY0, { dx: 0.5 });
  N.push({ id: 'abbey_chest', name: 'Abbey chest', look: 'chest', x: ABBEY_PORTAL[0] + 2, y: ABBEY_PORTAL[1] - 1, chest: true, examine: 'The abbey\'s alms chest, the lock long since broken and mended by the Sisters. Everything you own from Ashvale is kept in your arcade wallet; this is where you see it.' });   /* every waypoint has a chest beside it */
  /* the barracks: a long hall against the west wall, its door in the east side; the forge at the north end, cots down the hall */
  const [BX0, BY0, BX1, BY1] = BARRACKS;
  wall(BX0, BY0, BX1, BY1, [[BX1, 556], [BX1, 557]], 0.05);
  for (let gy = BY0 + 1; gy < BY1; gy++) for (let gx = BX0 + 1; gx < BX1; gx++) set(gx, gy, rnd() < 0.7 ? 'd' : '.');
  put('furnace', 337, 547, { w: 2, h: 2 }); put('anvil', 342, 549); put('rack', 346, 546); put('barrel', 350, 546); put('barrel', 351, 547); put('woodpile', 337, 552, { ry: Math.PI / 2 });
  put('tripod_brazier', 348, 552); put('tripod_brazier', 340, 556);
  for (let gy = 562; gy <= 582; gy += 4) { put('bedroll', 337, gy, { ry: Math.PI / 2 }); put('bedroll', 356, gy, { ry: Math.PI / 2 }); }
  put('spear_rack', 346, 584); put('crate', 352, 584); put('bone_pile', 346, 570, { ry: 1.2 });
  /* the cloister: arches round the garth, a way through the middle of each side; a broken statue and braziers in the middle */
  const [CX0, CY0, CX1, CY1] = CLOISTER, cmx = (CX0 + CX1) >> 1, cmy = (CY0 + CY1) >> 1;
  for (let gx = CX0; gx < CX1; gx += 2) for (const [gy, ry] of [[CY0, 0], [CY1, Math.PI]]) if (Math.abs(gx + 1 - cmx) > 2) { put('cloister_arch', gx, gy, { dx: 0.5, ry }); }
  for (let gy = CY0 + 1; gy < CY1; gy += 2) for (const [gx, ry] of [[CX0, Math.PI / 2], [CX1, -Math.PI / 2]]) if (Math.abs(gy + 1 - cmy) > 2) put('cloister_arch', gx, gy, { dz: 0.5, ry });
  put('ruin_pillar', cmx, cmy, { s: 1.4, ry: 0.4 }); put('tripod_brazier', cmx - 3, cmy); put('tripod_brazier', cmx + 3, cmy);
  /* the cathedral: against the east wall, its door on the west side; pillars down the nave, the altar at the north end, the crypt stair at the south end */
  const [KX0, KY0, KX1, KY1] = CATHEDRAL;
  wall(KX0, KY0, KX1, KY1, [[KX0, 562], [KX0, 563]], 0.08);
  for (let gy = KY0 + 1; gy < KY1; gy++) for (let gx = KX0 + 1; gx < KX1; gx++) set(gx, gy, 'd');
  for (let gy = 548; gy <= 578; gy += 6) { put('ruin_pillar', 406, gy, { ry: rnd() * 6 }); put('ruin_pillar', 418, gy, { ry: rnd() * 6 }); }
  put('abbey_altar', 412, 544); put('tripod_brazier', 408, 544); put('tripod_brazier', 416, 544);
  put('stairs', CRYPT_STAIR[0], CRYPT_STAIR[1], { ry: Math.PI, to: [CR.X0 + 8, CR.Y0 + 6], name: 'Crypt stair', label: 'Go down', say: 'You go down into the abbey\'s crypts. The air is cold, and smells of roses.',
       examine: 'Steps going down behind the altar, into the crypts where the sisters were buried.' });
  for (const [gx, gy] of [[408, 584], [416, 584]]) put('sarcophagus', gx, gy, { ry: 0.05 });
  /* the yard: wells and carts left in the rout, a broken wall section here and there */
  put('broken_cart', 344, 520, { ry: 0.6 }); put('broken_cart', 410, 528, { ry: 2.4 }); put('boulders', 420, 512, { ry: 1 }); put('bone_pile', 388, 524, { ry: 2 }); put('dead_tree', 340, 534, { ry: 1 });
  for (const [gx, gy] of [[372, 512], [384, 512]]) put('torch', gx, gy);
  /* who walks here: the fallen sisters with their bows and the ghouls; Gorrath at his anvil; nothing within 14 m of the portal */
  for (const [gx, gy] of [[390, 534], [356, 536], [410, 536]]) sp('fallen_sister', gx, gy, { carry: { arrows_t4: 30 } });
  for (const [gx, gy] of [[348, 534], [400, 530], [420, 534], [384, 540]]) sp('abbey_ghoul', gx, gy);
  sp('gorrath', 343, 551);
  for (const [gx, gy] of [[340, 566], [350, 574], [344, 580], [352, 560], [338, 560], [356, 578]]) sp('abbey_ghoul', gx, gy);   /* the barracks are full: they slept here */
  for (const [gx, gy] of [[354, 562], [338, 576], [346, 558], [350, 582]]) sp('fallen_sister', gx, gy, { carry: { arrows_t4: 30 } });
  for (const [gx, gy] of [[380, 556], [388, 566]]) sp('abbey_ghoul', gx, gy);
  for (const [gx, gy] of [[412, 556], [410, 570]]) sp('fallen_sister', gx, gy, { carry: { arrows_t4: 30 } });
  for (const [gx, gy] of [[414, 562], [420, 576]]) sp('abbey_ghoul', gx, gy);
  return { name: 'The Thornwatch Abbey', level: '38-56', ownWays: true, origin: [AB.X0, AB.Y0], size: [AB.W, AB.H], ground: 'grass', tiles: K.T.map(r => r.join('')), objects: O, npcs: N, spawns: K.S, fishing: [] };
}
function crypts() {
  /* four levels of catacomb under the cathedral; level 4: the Maiden's chamber, a long nave with her thorn wraiths */
  return deepLevels(CR, {
    rooms: [[[3, 3, 12, 9], [17, 3, 24, 13], [28, 4, 37, 11], [30, 17, 37, 27], [17, 20, 25, 28], [3, 18, 11, 28], [4, 33, 14, 41], [22, 34, 34, 41]],
            [[3, 3, 9, 12], [3, 17, 12, 24], [16, 12, 24, 19], [28, 3, 37, 10], [29, 16, 37, 25], [20, 26, 27, 33], [4, 31, 13, 41], [28, 33, 37, 41]],
            [[3, 3, 13, 10], [18, 3, 26, 9], [31, 3, 37, 13], [30, 18, 37, 27], [18, 15, 26, 25], [3, 16, 12, 26], [5, 31, 16, 41], [24, 32, 36, 41]],
            [[3, 3, 10, 9], [3, 14, 37, 41]]],
    top: [CRYPT_STAIR[0], CRYPT_STAIR[1] + 1], topName: 'Stair up to the cathedral', topSay: 'You climb back up into the cathedral.',
    downSay: ['', 'Deeper. The roses smell stronger.', 'Deeper still. Thorns grow out of the walls here.', 'The last stair. Someone is singing.'], litter: 'sarcophagus', litterSolid: true, brighter: true,
    spawns: [['crypt_ghoul', 0, 1, 2], ['crypt_sister', 0, 2, 1, { carry: { arrows_t4: 30 } }], ['crypt_ghoul', 0, 4, 2], ['thorn_wraith', 0, 6, 1], ['crypt_ghoul', 0, 7, 2],
             ['thorn_wraith', 1, 1, 2], ['crypt_ghoul', 1, 2, 2], ['crypt_sister', 1, 4, 2, { carry: { arrows_t4: 30 } }], ['crypt_ghoul', 1, 6, 2], ['thorn_wraith', 1, 7, 1],
             ['crypt_sister', 2, 1, 1, { carry: { arrows_t4: 30 } }], ['thorn_wraith', 2, 3, 2], ['crypt_ghoul', 2, 4, 2], ['crypt_sister', 2, 5, 2, { carry: { arrows_t4: 30 } }], ['thorn_wraith', 2, 7, 2],
             ['maelis', 3, 1, 1], ['thorn_wraith', 3, 1, 4]],
    name: 'The Abbey Crypts', level: '40-60', surface: CRYPT_STAIR });
}
const ABBEY = abbey(), CRYPTS = crypts();
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
for (const [id, Z] of [['thornwatch', camp], ['hollowden', den], ['redmoor', MOOR], ['sistersbarrow', BARROW], ['fivestones', STONEFIELD], ['gloamwood', GLOAMWOOD], ['emberfall', EMBERFALL], ['blackmere', BLACKMERE], ['towercellars', CELLARS], ['abbey', ABBEY], ['crypts', CRYPTS]]) {
  console.log('%s: %d tiles shut under scenery', id, stampSolid(Z)); write(id, Z);
  for (const o of Z.objects) { const t = footprint(o); if (t.length) SOLIDS.push({ zone: id, k: o.k, x: o.x, y: o.y, tiles: t }); }
}
if (process.env.TW_SOLIDS) fs.writeFileSync(process.env.TW_SOLIDS, JSON.stringify(SOLIDS));
