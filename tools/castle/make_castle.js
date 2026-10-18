/* make_castle.js -> data/zone.castle.json: the Lake Castle, full size, on the shore of East Lake ~450 m from Ashvale, compass
   north-east (2026-10-17, the operator: "move the lake castle to the north east of ashvale separated by a river with a
   bridge", then "I do not like how it was shrank down ... it can be a little further away like the same distance as
   saltmere so we can add content along the path"). The plan is the original castle of 2026-10-05 (Martin: "Build a castle
   complex on this natural land formation", "make it bigger"), unchanged in size:
     outer bailey (curtain walls, round towers, a barbican before the gatehouse) facing the road from Ashvale,
     inner ward round a five-storey keep, buildings in the bailey from the house kit, a well, the town portal and chest.
   Its waters are the world's own: tools/castle/make_waters.js lays West Lake, East Lake and the river between them into
   the terrain (data/atlas/wg_tables.json edits); the road from Ashvale (globecfg links) crosses the river on the bridge the
   worldgen builds by itself. Run make_waters.js first, then this.
   The plan below is written in the original plan frame (X0, Y0) and moved to game tiles (GX, GY) at the end, no mirroring:
   y runs down the map, so the gate (dir 'n') faces Ashvale.
   Object kinds drawn by src/castle.js: cwall {x,y,x2,y2} (one axis), ctower {x,y,r,h}, cgate {x,y,dir}, ckeep {x,y,w,h,floors};
   cstair and cdeck are walking data (src/world.js).
     node tools/castle/make_castle.js */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const { W: WG, CFG } = require('./mask.js');
const X0 = 3990, Y0 = -1724, W = 132, H = 102;   /* the plan frame (the original castle's), and the zone's size */
const GX = -72, GY = 446;                           /* game tiles of the zone's top-left corner: the castle's middle is near (7, 503), ~450 m from the square (Saltmere's distance) on dry ground */   /* the zone: the neck, the peninsula and the lake round it (Martin: "it could be a lot bigger", then "make it bigger") */
const TREES = 'TPOWMYUELQZDr';
/* the world's letters, so the zone meets the land round it; paths and roads of its own are drawn below */
const M = []; for (let y = 0; y < H; y++) { const r = []; for (let x = 0; x < W; x++) { const c = WG.tileAt(CFG.face, GX + x + CFG.origin[0], GY + y + CFG.origin[1]); r.push('pdcBv'.indexOf(c) >= 0 ? '.' : c); } M.push(r); }
const T = M.map(r => r.slice());
const at = (x, y) => (y >= Y0 && y < Y0 + H && x >= X0 && x < X0 + W) ? T[y - Y0][x - X0] : '~';
const set = (x, y, c) => { if (y >= Y0 && y < Y0 + H && x >= X0 && x < X0 + W) T[y - Y0][x - X0] = c; };
const objects = [], npcs = [];
/* --- the plan (the Atlas face frame; mirrored into game tiles at the end) */
const A = { x0: 4024, y0: -1706, x1: 4114, y1: -1664 };   /* outer bailey: 90 x 42 m over the peninsula's head and out into the shallows */
const B = { x0: 4038, y0: -1664, x1: 4092, y1: -1628 };   /* inner ward: 54 x 36 m over the tail (its north wall is the bailey's south wall) */
const GATE = { x: 4040, y: A.y0 };                          /* the gatehouse faces the mainland (the neck, north-west) */
const INNER = { x: 4065, y: A.y1 };                        /* the inner gate, bailey -> ward */
const PADS = [[A.x0 - 3, A.y0 - 3, A.x1 + 3, A.y1], [B.x0 - 3, A.y1, B.x1 + 3, B.y1 + 3], [GATE.x - 3, -1722, GATE.x + 4, A.y0]];
for (const [x0, y0, x1, y1] of PADS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  if (at(x, y) === '~' || at(x, y) === 's') { console.error('BLOCKED - water inside the castle ground at plan', x, y, '- move GX/GY or the lakes (make_waters.js)'); process.exit(1); }
  set(x, y, '.');
}
const deckCells = new Set();
/* out: the wall's outward side as [dx, dy] (the battlements face that way); [0, 0] = an inner wall (low parapets both sides) */
function wall(x, y, x2, y2, gaps, out) {
  objects.push({ k: 'cwall', x, y, x2, y2, gaps: gaps || [], out: out || [0, 0] });
  const dx = Math.sign(x2 - x), dy = Math.sign(y2 - y);
  for (let cx = x, cy = y; ; cx += dx, cy += dy) {
    const g = (gaps || []).some(([gx, gy]) => Math.abs(gx - cx) + Math.abs(gy - cy) <= 1);
    set(cx, cy, g ? 'p' : 'X'); if (!g) deckCells.add(cx + ',' + cy); else deckCells.delete(cx + ',' + cy);   /* a gate's passage stays at ground level: the walk stops either side */
    if (cx === x2 && cy === y2) break;
  }
}
const TOWERS = [];
function tower(x, y, r, h) {
  TOWERS.push({ x, y, r, h });
  const rt = r >= 3 ? r - 1.45 : 0.75;   /* a great tower keeps a broad turret with the walk round it; a lesser one a slim turret the walk passes */
  objects.push({ k: 'ctower', x, y, r, h, turret: rt });
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    const d2 = dx * dx + dy * dy; if (d2 > r * r + 0.5) continue;
    set(x + dx, y + dy, 'X'); if (d2 > (rt + 0.1) * (rt + 0.1)) deckCells.add((x + dx) + ',' + (y + dy)); else deckCells.delete((x + dx) + ',' + (y + dy));
  }
}
wall(A.x0, A.y0, A.x1, A.y0, [[GATE.x, GATE.y]], [0, -1]);
wall(A.x1, A.y0, A.x1, A.y1, null, [1, 0]);
wall(A.x0, A.y1, B.x0, A.y1, null, [0, 1]);                     /* the bailey's south wall west of the ward: outer */
wall(B.x0, A.y1, B.x1, A.y1, [[INNER.x, INNER.y]], [0, 0]);     /* between bailey and ward: inner */
wall(B.x1, A.y1, A.x1, A.y1, null, [0, 1]);                     /* east of the ward: outer */
wall(A.x0, A.y0, A.x0, A.y1, null, [-1, 0]);
wall(B.x0, B.y1, B.x1, B.y1, null, [0, 1]);
wall(B.x0, A.y1, B.x0, B.y1, null, [-1, 0]);
wall(B.x1, A.y1, B.x1, B.y1, null, [1, 0]);
for (const [x, y] of [[A.x0, A.y0], [A.x1, A.y0], [A.x1, A.y1], [A.x0, A.y1]]) tower(x, y, 3.2, 14.5);
for (const [x, y] of [[4058, A.y0], [4078, A.y0], [4096, A.y0], [A.x0, -1685], [A.x1, -1685], [4028 + 0, A.y1], [4103, A.y1]]) tower(x, y, 2.3, 8.5);
for (const [x, y] of [[B.x0, B.y1], [B.x1, B.y1]]) tower(x, y, 3.4, 16.5);
for (const [x, y] of [[4058, B.y1], [4074, B.y1], [B.x0, -1646], [B.x1, -1646]]) tower(x, y, 2.3, 9);
for (const dx of [-4, 4]) tower(GATE.x + dx, GATE.y, 2.5, 13);   /* the gate's twin flanking towers */
/* the barbican: an outer gate out on the road - twin towers and two short walls that make you pass a second gate */
const BAR = { y: A.y0 - 8 };
wall(GATE.x - 4, BAR.y, GATE.x - 4, A.y0 - 1, null, [-1, 0]); wall(GATE.x + 4, BAR.y, GATE.x + 4, A.y0 - 1, null, [1, 0]);
wall(GATE.x - 4, BAR.y, GATE.x + 4, BAR.y, [[GATE.x, BAR.y]], [0, -1]);
for (const dx of [-4, 4]) tower(GATE.x + dx, BAR.y, 2.2, 10);
objects.push({ k: 'cgate', x: GATE.x, y: BAR.y, dir: 'n', small: true });
for (let y = BAR.y + 1; y < A.y0 - 1; y++) for (let x = GATE.x - 3; x <= GATE.x + 3; x++) set(x, y, 'p');
for (const dx of [-4, 4]) tower(INNER.x + dx, INNER.y, 2.0, 9.5);   /* and the inner gate's */
objects.push({ k: 'cgate', x: GATE.x, y: GATE.y, dir: 'n' });
for (const dx of [-2, -1, 1, 2]) for (const dy of [-1, 0, 1]) set(GATE.x + dx, GATE.y + dy, 'X'); set(GATE.x, GATE.y - 1, 'p'); set(GATE.x, GATE.y + 1, 'p');
objects.push({ k: 'cgate', x: INNER.x, y: INNER.y, dir: 's', small: true });
/* the keep, in the ward: five storeys */
const K = { x: 4054, y: -1656, w: 22, h: 16 };
/* walk-in (Martin: "the door on the keep is closed so I can't go inside of it"): stone walls 'X', its floor 'i', the door open, five storeys of 3.2 m with stairs */
objects.push({ k: 'ckeep', x: K.x, y: K.y, w: K.w, h: K.h, floors: 5, lh: 3.2, enter: true, door: [INNER.x, K.y], donjon: { r: 4.2, h: 11 } });
for (let y = K.y; y < K.y + K.h; y++) for (let x = K.x; x < K.x + K.w; x++) set(x, y, (x === K.x || y === K.y || x === K.x + K.w - 1 || y === K.y + K.h - 1) ? 'X' : 'i');
set(INNER.x, K.y, 'i');
for (let y = A.y0 + 1; y < A.y1; y++) for (let x = A.x0 + 1; x < A.x1; x++) if (at(x, y) === '.') set(x, y, 'd');
for (let y = A.y1 + 1; y < B.y1; y++) for (let x = B.x0 + 1; x < B.x1; x++) if (at(x, y) === '.') set(x, y, 'd');
function house(o) {   /* the village's building kind: walls 'X', floor 'i', door 'i' (src/scene.js building()) */
  objects.push(o);
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) set(x, y, (x === o.x || y === o.y || x === o.x + o.w - 1 || y === o.y + o.h - 1) ? 'X' : 'i');
  set(o.door[0], o.door[1], 'i');
}
/* the road from the gate runs down x 4040-4041 to y ROADY, then east to the inner gate at 4065 and on to the keep: nothing stands on it */
const ROADY = -1690;
house({ k: 'house', x: 4027, y: -1700, w: 10, h: 6, door: [4031, -1695], roof: '#4a4f5a', wall: '#cfc4ad', enter: true, sign: 'Barracks', floors: 2 });
house({ k: 'house', x: 4046, y: -1701, w: 10, h: 6, door: [4050, -1696], roof: '#7a3b2a', wall: '#d6cbb2', enter: true, sign: 'Stables' });
house({ k: 'house', x: 4062, y: -1702, w: 9, h: 8, door: [4066, -1695], roof: '#5b4a8a', wall: '#e0d6c0', enter: true, sign: 'Chapel' });
house({ k: 'house', x: 4083, y: -1701, w: 8, h: 6, door: [4086, -1696], roof: '#7a5a2a', wall: '#d6cbb2', enter: true, sign: 'Granary' });
house({ k: 'smithy', x: 4100, y: -1701, w: 8, h: 6, door: [4103, -1696], roof: '#3f4248', wall: '#b9b0a0', enter: true, sign: 'Castle Forge' });
house({ k: 'house', x: 4027, y: -1684, w: 11, h: 8, door: [4037, -1680], roof: '#3f6a4a', wall: '#ddd2bb', enter: true, sign: 'Great Hall', floors: 2 });
house({ k: 'house', x: 4098, y: -1684, w: 10, h: 7, door: [4098, -1680], roof: '#6a3a3a', wall: '#d8c9a3', enter: true, sign: 'Kitchens' });
house({ k: 'house', x: 4078, y: -1680, w: 9, h: 6, door: [4082, -1680], roof: '#4a4f5a', wall: '#cfc4ad', enter: true, sign: 'Armoury', floors: 2 });
objects.push({ k: 'well', x: 4054, y: -1680, w: 2, h: 2 }); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(4054 + dx, -1680 + dy, 'X');
for (const [x, y] of [[4038, -1702], [4043, -1702], [4044, -1692], [4058, -1692], [4072, -1692], [4090, -1692], [4061, -1668], [4069, -1668], [4060, -1660], [4070, -1660], [4044, -1632], [4086, -1632]]) objects.push({ k: 'torch', x, y, w: 1, h: 1 });
/* the road: from the zone's top edge, where the road from Ashvale meets it, straight to the barbican's gate */
for (let y = Y0; y < BAR.y; y++) for (let x = GATE.x - 4; x <= GATE.x + 5; x++) { const c = at(x, y); if (Math.abs(x - GATE.x - 0.5) < 2 && c !== '~') set(x, y, 'p'); else if (TREES.indexOf(c) >= 0) set(x, y, '.'); }
for (let y = GATE.y + 1; y <= ROADY; y++) for (const d of [0, 1]) if (at(GATE.x + d, y) === 'd') set(GATE.x + d, y, 'p');
for (let x = GATE.x; x <= INNER.x; x++) for (const d of [0, 1]) if (at(x, ROADY + d) === 'd') set(x, ROADY + d, 'p');
for (let y = ROADY; y <= K.y - 1; y++) for (const d of [0, 1]) if (at(INNER.x + d, y) === 'd' || at(INNER.x + d, y) === '.') set(INNER.x + d, y, 'p');
/* --- a full town (Martin: "a chest and town portal and a kitchen where the player can cook and whatever else the castle needs
   to be a full-blown town") */
const PORTAL = { x: 4048, y: -1684, to: [4049, -1683] };      /* the town portal, by the road just inside the gate */
set(PORTAL.x, PORTAL.y, 'd'); set(PORTAL.to[0], PORTAL.to[1], 'd');
npcs.push({ id: 'castle_chest', name: 'Castle chest', look: 'chest', x: 4052, y: -1684, chest: true, examine: 'The castle chest. Everything you own from Ashvale is kept in your arcade wallet; this is where you see it.' });
const inside = (o, x, y) => x > o.x && y > o.y && x < o.x + o.w - 1 && y < o.y + o.h - 1;
const byName = n => objects.find(o => o.sign === n);
const KIT = byName('Kitchens'), FORGE = byName('Castle Forge'), GRAN = byName('Granary'), ARM = byName('Armoury'), HALL = byName('Great Hall');
objects.push({ k: 'range', x: KIT.x + 3, y: KIT.y + 1, w: 1, h: 1 }, { k: 'range', x: KIT.x + 6, y: KIT.y + 1, w: 1, h: 1 }, { k: 'table', x: KIT.x + 3, y: KIT.y + 4, w: 3, h: 1 }, { k: 'barrel', x: KIT.x + 8, y: KIT.y + 4, w: 1, h: 1 });
objects.push({ k: 'furnace', x: FORGE.x + 1, y: FORGE.y + 1, w: 2, h: 2 }, { k: 'anvil', x: FORGE.x + 4, y: FORGE.y + 3, w: 1, h: 1 }, { k: 'rack', x: FORGE.x + 5, y: FORGE.y + 1, w: 1, h: 1 });
objects.push({ k: 'shelf', x: GRAN.x + 1, y: GRAN.y + 1, w: 3, h: 1 }, { k: 'counter', x: GRAN.x + 2, y: GRAN.y + 3, w: 2, h: 1 }, { k: 'rack', x: ARM.x + 1, y: ARM.y + 1, w: 1, h: 1 }, { k: 'table', x: HALL.x + 2, y: HALL.y + 3, w: 6, h: 1 });
npcs.push({ id: 'castle_cook', name: 'Marta the cook', look: 'marta', x: KIT.x + 5, y: KIT.y + 3, shop: 'castle_kitchen', examine: 'Marta, who has cooked for the castle since before the castellan had his keys.' });
npcs.push({ id: 'castle_qm', name: 'Quartermaster Hale', look: 'hale', x: GRAN.x + 3, y: GRAN.y + 2, shop: 'castle_general', examine: 'Quartermaster Hale. Rope, nets, tinderboxes, bread: if the castle needs it, he counts it.' });
npcs.push({ id: 'castle_armourer', name: 'Armourer Voss', look: 'voss', x: ARM.x + 4, y: ARM.y + 3, shop: 'castle_armoury', examine: 'Armourer Voss, who keeps the watch in bowstrings and the gate guard in rivets.' });
/* fishing off the shore outside the walls (the lake around the castle) */
const fishing = [];
{
  const ok = c => '.pdiq,f'.indexOf(c) >= 0, seen = new Set([[GATE.x, GATE.y - 3].join(',')]), q = [[GATE.x, GATE.y - 3]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (!seen.has(k) && ok(at(nx, ny)) && !(nx > A.x0 && nx < A.x1 && ny > A.y0 && ny < B.y1)) { seen.add(k); q.push([nx, ny]); } } }
  const spots = [];
  for (const k of seen) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x + dx, y + dy) === '~' && at(x + 2 * dx, y + 2 * dy) === '~') spots.push([x + dx, y + dy]); }
  const kinds = [{ fish: 'shrimp_raw' }, { fish: 'salmon_raw', req: 30, xp: 350, tool: 'fishing_rod' }, { fish: 'shrimp_raw' }, { fish: 'salmon_raw', req: 30, xp: 350, tool: 'fishing_rod' }, { fish: 'shrimp_raw' }];   /* no trout: Ashvale's lake keeps the only trout marks (a quest is built on it) */
  for (const sp of spots) { if (fishing.length >= kinds.length) break; if (fishing.some(f => Math.hypot(f.x - sp[0], f.y - sp[1]) < 6)) continue; fishing.push(Object.assign({ x: sp[0], y: sp[1] }, kinds[fishing.length])); }
  console.log('fishing spots:', fishing.length);
}
npcs.push({ id: 'castellan', name: 'Castellan Brannoc', look: 'brannoc', guard: true, maxHit: 10, gear: { weapon: 'longsword_t2' }, x: INNER.x + 2, y: K.y - 2, examine: 'Castellan Brannoc, keeper of the lake castle. He has the keys, and he has had them for a long time.',
  lines: ['The lake keeps our back and the river keeps the road. The walls only have to argue with the bridge.', 'Walk the walls if you like; the steps are by the corners and either side of the gate.'] });
npcs.push({ id: 'gate_guard', name: 'Gate guard', look: 'ash_knight', guard: true, maxHit: 8, gear: { weapon: 'sword_t3', shield: 'shield_t2', head: 'helmet_t2' }, x: GATE.x + 2, y: GATE.y - 2, examine: 'A guard at the castle gate, leaning on a spear he has not needed in years.',
  lines: ['Welcome to the lake castle. Ashvale is back down the road, over the river bridge, south-west.', 'Mind the gatehouse, the portcullis sticks.'] });
/* steps up the inside of the walls: a flight of 4 rising along the wall; foot = the yard tile where it starts, top = the wall tile it reaches */
/* --- stairs you walk up (Martin: "they should be staircases like the terrain and I just walk up them"): raised ground,
   0.6 m a tile; ramps = [x, y, metres] (src/world.js liftAt); the wall walk and tower tops stand at LH */
const LH = 4.2, ramps = new Map();
const RISE = (k, n) => +((k + 1) * LH / (n + 1)).toFixed(2);
/* a broad staircase against a wall: `len` tiles rising along (ax, ay) from the foot at (x, y), `wide` tiles out into the yard along (px, py) */
function stair(x, y, ax, ay, px, py, len, wide) {
  const cells = [];
  for (let k = 0; k < len; k++) for (let w = 0; w < wide; w++) { const cx = x + ax * k + px * w, cy = y + ay * k + py * w; if (deckCells.has(cx + ',' + cy) || ramps.has(cx + ',' + cy) || 'dpq.,f'.indexOf(at(cx, cy)) < 0) { console.error('BLOCKED - a staircase runs into a tower, a wall or a building at', cx, cy); process.exit(1); } ramps.set(cx + ',' + cy, RISE(k, len)); set(cx, cy, 'X'); cells.push([cx, cy, RISE(k, len), w === wide - 1 ? 1 : 0]); }
  objects.push({ k: 'cstair', cells, ax, ay, px, py });
}
stair(GATE.x - 12, A.y0 + 1, 1, 0, 0, 1, 6, 2);     /* either side of the gate, rising towards it along the north wall */
stair(GATE.x + 12, A.y0 + 1, -1, 0, 0, 1, 6, 2);
stair(4092, A.y0 + 1, -1, 0, 0, 1, 6, 2);           /* the bailey's north-east */
stair(4032, A.y1 - 1, 1, 0, 0, -1, 6, 2);           /* the bailey's south wall, west */
stair(4100, A.y1 - 1, -1, 0, 0, -1, 6, 2);          /* and east */
stair(B.x0 + 1, B.y1 - 10, 0, -1, 1, 0, 6, 2);      /* the ward: up its west wall and its east wall (not behind the keep) */
stair(B.x1 - 1, B.y1 - 10, 0, -1, -1, 0, 6, 2);
/* spiral stairs inside the great towers: a door at the foot on the yard side, two steps up inside, out onto the top */
const CX0 = (A.x0 + A.x1) / 2, CY0 = (A.y0 + B.y1) / 2;
const isGround = (x, y) => 'dpq.,f'.indexOf(at(x, y)) >= 0 && !ramps.has(x + ',' + y);
for (const t of TOWERS) {
  if (t.r < 2.5) continue;
  const o = objects.find(q => q.k === 'ctower' && q.x === t.x && q.y === t.y);
  const ring = [...deckCells].map(k => k.split(',').map(Number)).filter(([x, y]) => Math.hypot(x - t.x, y - t.y) <= t.r + 0.6);
  const cand = ring.map(([x, y]) => { const g = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).find(([gx, gy]) => isGround(gx, gy)); return g ? [x, y, g, Math.hypot(g[0] - CX0, g[1] - CY0)] : null; }).filter(Boolean).sort((p, q) => p[3] - q[3]);
  if (!cand.length) continue;
  const [d1x, d1y, foot] = cand[0];
  const d2 = ring.filter(([x, y]) => Math.max(Math.abs(x - d1x), Math.abs(y - d1y)) === 1 && Math.hypot(x - foot[0], y - foot[1]) > Math.hypot(d1x - foot[0], d1y - foot[1])).sort((p, q) => Math.hypot(p[0] - t.x, p[1] - t.y) - Math.hypot(q[0] - t.x, q[1] - t.y))[0];
  if (!d2) continue;
  deckCells.delete(d1x + ',' + d1y); deckCells.delete(d2[0] + ',' + d2[1]);
  ramps.set(d1x + ',' + d1y, 1.4); ramps.set(d2[0] + ',' + d2[1], 2.8);
  /* the door stands on the first step (d1), facing the yard; a tap on it walks you up through the tower to a tile of the
     tower top beside the second step (Martin: "click on the door on the bottom level of the tower, you should go in it,
     come out the door accessing the wall") */
  const top = ring.filter(([x, y]) => deckCells.has(x + ',' + y) && Math.max(Math.abs(x - d2[0]), Math.abs(y - d2[1])) === 1).sort((p, q) => Math.hypot(p[0] - t.x, p[1] - t.y) - Math.hypot(q[0] - t.x, q[1] - t.y))[0];
  o.door = [foot[0] - d1x, foot[1] - d1y]; o.dtile = [d1x, d1y]; o.ttile = top || d2;
}
const liftAt = (x, y) => deckCells.has(x + ',' + y) ? LH : (ramps.get(x + ',' + y) || 0);
/* the walk itself must work: from the road outside the gate, every tile of the wall walk can be reached on foot over the
   stairs, with the game's own rule (src/core.js canStep: heights differ by 2.3 m or less; ground tiles must be open) */
{
  const STEP = 2.3, open = (x, y) => liftAt(x, y) > 0 || '.pdiq,f'.indexOf(at(x, y)) >= 0;
  const can = (x, y, dx, dy) => { const nx = x + dx, ny = y + dy, la = liftAt(x, y), ok1 = (a, b) => open(a, b) && Math.abs(liftAt(a, b) - la) <= STEP; return ok1(nx, ny) && (!dx || !dy || (ok1(x + dx, y) && ok1(x, y + dy))); };
  const seen = new Set([[GATE.x, GATE.y - 12].join(',')]), q = [[GATE.x, GATE.y - 12]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const k = (x + dx) + ',' + (y + dy); if (!seen.has(k) && can(x, y, dx, dy)) { seen.add(k); q.push([x + dx, y + dy]); } } }
  const cut = [...deckCells].filter(k => !seen.has(k));
  if (cut.length) { console.error('BLOCKED - %d wall-walk tiles cannot be walked to, e.g. %s', cut.length, cut.slice(0, 6).join(' ')); process.exit(1); }
  console.log('wall walk: %d tiles at %s m, %d stair tiles, all reachable on foot from the road', deckCells.size, LH, ramps.size);
}
objects.push({ k: 'cdeck', x: X0, y: Y0, w: W, h: H, lh: LH, cells: [...deckCells].map(k => k.split(',').map(Number)), ramps: [...ramps].map(([k, v]) => k.split(',').map(Number).concat([v])) });
/* watchmen with bows on the tower tops, looking out */
const watch = [[A.x0, A.y0, 'w1'], [A.x1, A.y0, 'w2'], [A.x1, A.y1, 'w3'], [A.x0, A.y1, 'w4'], [B.x0, B.y1, 'w5'], [B.x1, B.y1, 'w6'], [4058, A.y0, 'w7'], [4096, A.y0, 'w8'], [4074, B.y1, 'w9']];
for (const [x, y, id] of watch) {
  /* each walks a round of about 14 tiles of wall walk from his post, there and back (src/core.js patrolTick) */
  const cells = [...deckCells].map(k => k.split(',').map(Number));
  const start = cells.sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y))[0];
  const prev = new Map([[start.join(','), null]]), q = [start]; let end = start;
  while (q.length) { const c = q.shift(), d = (function depth(k) { let n = 0; while (prev.get(k)) { k = prev.get(k); n++; } return n; })(c.join(','));
    if (d >= 14) { end = c; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [c[0] + dx, c[1] + dy], k = n.join(','); if (deckCells.has(k) && !prev.has(k)) { prev.set(k, c.join(',')); q.push(n); } } }
  const route = []; for (let k = end.join(','); k; k = prev.get(k)) route.unshift(k.split(',').map(Number));
  npcs.push({ id: 'watch_' + id, name: 'Watchman', look: 'ash_knight', guard: true, maxHit: 6, x: start[0], y: start[1], patrol: route.length > 1 ? route : null, gear: { weapon: 'bow_t2', ammo: 'arrows_t1', head: 'helmet_t2' },
    examine: 'A watchman on the castle wall, bow strung, walking his round and looking out over the water.', lines: ['Nothing on the lake today. There never is. That is the job.', 'If you came over the water, I would have seen you an hour ago.'] });
}

/* check, in the Atlas frame before the mirror: every door, step foot and the keep's door must be reachable on foot from the road outside the gate */
{
  const ok = c => '.pdiq,f'.indexOf(c) >= 0, seen = new Set(), q = [[GATE.x, GATE.y - 3]], K2 = (x, y) => x + ',' + y;
  seen.add(K2(...q[0]));
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = K2(nx, ny); if (!seen.has(k) && ok(at(nx, ny))) { seen.add(k); q.push([nx, ny]); } } }
  const want = [['keep door (from the yard)', INNER.x, K.y - 1], ['portal', PORTAL.to[0], PORTAL.to[1]], ['chest side', 4052, -1683]].concat(objects.filter(o => o.door && o.k !== 'ckeep' && o.k !== 'ctower').map(o => [o.sign || o.k, o.door[0], o.door[1]]));
  const bad = want.filter(([n, x, y]) => !seen.has(K2(x, y)));
  if (bad.length) { console.error('BLOCKED - not reachable from the gate:', JSON.stringify(bad)); process.exit(1); }
  console.log('walk check: gate -> keep door, portal, chest and %d doors: all reachable', want.length - 3);
}
/* move the plan from its frame to game tiles: a shift, no mirror (y already runs down the map) */
const DX = GX - X0, DY = GY - Y0, mv = (x, y) => [x + DX, y + DY];
for (const o of objects) {
  if (o.k === 'cwall') { o.x += DX; o.y += DY; o.x2 += DX; o.y2 += DY; o.gaps = o.gaps.map(([x, y]) => mv(x, y)); }
  else if (o.k === 'ctower') { o.x += DX; o.y += DY; if (o.dtile) o.dtile = mv(...o.dtile); if (o.ttile) o.ttile = mv(...o.ttile); }   /* o.door is a direction */
  else if (o.k === 'cdeck') { o.x += DX; o.y += DY; o.cells = o.cells.map(([x, y]) => mv(x, y)); o.ramps = o.ramps.map(([x, y, l]) => mv(x, y).concat([l])); }
  else if (o.k === 'cstair') { o.cells = o.cells.map(([x, y, l, e]) => mv(x, y).concat([l, e])); }
  else { o.x += DX; o.y += DY; if (o.door) o.door = mv(...o.door); }
}
for (const n of npcs) { n.x += DX; n.y += DY; if (n.patrol) n.patrol = n.patrol.map(([x, y]) => mv(x, y)); }
for (const f of fishing) { f.x += DX; f.y += DY; }
{ /* the town portal goes in rules.json (portals are made from there, src/core.js) */
  const rp = path.join(ROOT, 'data', 'rules.json'), RJ = JSON.parse(fs.readFileSync(rp));
  const P = { id: 'castle', name: 'the Lake Castle', x: PORTAL.x + DX, y: PORTAL.y + DY, to: mv(...PORTAL.to) };   /* its stone: castle_stone (tools/make_data.py) */
  RJ.data.portals = (RJ.data.portals || []).filter(q => q.id !== 'castle').concat([P]); fs.writeFileSync(rp, JSON.stringify(RJ)); console.log('portal', JSON.stringify(P));
}
const zone = { ashvale3d: 'module', name: 'zone.castle', api: 1, v: 2, data: {
  name: 'Lake castle', level: 'safe', origin: [GX, GY], size: [W, H], ground: 'village', tiles: T.map(r => r.join('')), objects, npcs, spawns: [], fishing,
  weather: { kinds: { clear: 60, rain: 25, fog: 15 }, min: 300, max: 900 } } };
fs.writeFileSync(path.join(ROOT, 'data', 'zone.castle.json'), JSON.stringify(zone));
console.log('zone.castle: %d objects, %d npcs, %dx%d tiles at (%d, %d) game tiles', objects.length, npcs.length, W, H, GX, GY);
for (let y = 0; y < H; y += 2) console.log(T[y].filter((_, i) => i % 1 === 0).join(''));
