/* make_castle.js -> data/zone.castle.json: the Lake Castle, moved (2026-10-17, the operator: "move the lake castle to the north
   east of ashvale separated by a river and a bridge", "roughly around 65, 154"). Compass north-east of Ashvale is down the
   game grid (true north there points to game +x +y, src/engine.js trueNorth), so the castle stands ~100 m from the square
   past the south gate's woods. Half the old size: an outer bailey with the shops, an inner ward round the keep.
     - a river runs across the zone on the Ashvale side (its ends carry on as streams, src/wg_paths.js), the road crosses
       it on a bridge (a 'bridge' object: the deck is its B tiles) and runs on to the gatehouse;
     - a lake behind: it wraps the ward and the bailey's far side, fed by a channel from the river.
   Laid out in zone-local tiles (0..W-1, 0..H-1, game axes: x east on the map, y down the map) and moved to game tiles at
   the end. Object kinds drawn by src/castle.js: cwall {x,y,x2,y2} (one axis), ctower {x,y,r,h}, cgate {x,y,dir},
   ckeep {x,y,w,h,floors}; cstair and cdeck are walking data (src/world.js).
     node tools/castle/make_castle.js */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const { W: WG, CFG } = require('./mask.js');
const X0 = 17, Y0 = 116, W = 96, H = 80;   /* game tiles of the zone's top-left corner; the castle's middle is near (65, 154) */
const TREES = 'TPOWMYUELQZDr';
/* the ground: the world's own letters (grass, scrub, trees) so the zone meets the land round it; no paths, roads or water of its own */
const T = [];
for (let y = 0; y < H; y++) { const r = []; for (let x = 0; x < W; x++) { const c = WG.tileAt(CFG.face, X0 + x + CFG.origin[0], Y0 + y + CFG.origin[1]); r.push('pdcBv~s'.indexOf(c) >= 0 ? '.' : c); } T.push(r); }
const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < W) ? T[y][x] : '.';
const set = (x, y, c) => { if (y >= 0 && y < H && x >= 0 && x < W) T[y][x] = c; };
const objects = [], npcs = [];
/* --- the plan */
const A = { x0: 30, y0: 20, x1: 68, y1: 38 };   /* outer bailey: 39 x 19 m, its gate facing the river and Ashvale */
const B = { x0: 37, y0: 38, x1: 61, y1: 50 };   /* inner ward: 25 x 13 m (its top wall is the bailey's bottom wall) */
const GATE = { x: 48, y: A.y0 }, INNER = { x: 49, y: A.y1 };
const ROADX = 48;                                /* the road: 2 tiles (48-49) from the zone's top edge to the gate */
/* the river: 5 tiles of water with a sand bank either side, wandering a little, edge to edge */
const riverTop = x => 5 + Math.round(1.5 * Math.sin(x / 9));
for (let x = 0; x < W; x++) { const t = riverTop(x); set(x, t - 1, 's'); for (let k = 0; k < 5; k++) set(x, t + k, '~'); set(x, t + 5, 's'); }
/* the lake: an oval behind the castle, kept clear of the walls; a channel down from the river feeds it */
const CLEAR = { x0: A.x0 - 4, y0: A.y0 - 5, x1: A.x1 + 4, y1: B.y1 + 4 };
const inClear = (x, y) => x >= CLEAR.x0 && x <= CLEAR.x1 && y >= CLEAR.y0 && y <= CLEAR.y1;
const lake = (x, y) => ((x - 66) / 26) ** 2 + ((y - 58) / 15) ** 2 < 1 && !inClear(x, y);
const channel = (x, y) => x >= 80 && x <= 84 && y > riverTop(x) + 4 && y <= 52;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lake(x, y) || channel(x, y)) set(x, y, '~');
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) !== '~' && at(x, y) !== 's' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === '~' && y + dy > riverTop(x) + 5)) set(x, y, 's');   /* a sand shore round the lake */
/* no trees on the castle's ground, the road or the banks */
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (TREES.indexOf(at(x, y)) >= 0 && (inClear(x, y) || Math.abs(x - ROADX - 0.5) < 4 || [-2, -1, 1, 2].some(d => at(x + d, y) === '~' || at(x, y + d) === '~'))) set(x, y, '.');
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
wall(A.x0, A.y0, A.x0, A.y1, null, [-1, 0]);
wall(A.x0, A.y1, B.x0, A.y1, null, [0, 1]);                     /* the bailey's bottom wall beside the ward: outer */
wall(B.x0, A.y1, B.x1, A.y1, [[INNER.x, INNER.y]], [0, 0]);     /* between bailey and ward: inner */
wall(B.x1, A.y1, A.x1, A.y1, null, [0, 1]);
wall(B.x0, B.y1, B.x1, B.y1, null, [0, 1]);
wall(B.x0, A.y1, B.x0, B.y1, null, [-1, 0]);
wall(B.x1, A.y1, B.x1, B.y1, null, [1, 0]);
for (const [x, y] of [[A.x0, A.y0], [A.x1, A.y0], [A.x1, A.y1], [A.x0, A.y1]]) tower(x, y, 3.2, 12);
for (const [x, y] of [[A.x0, 29], [A.x1, 29]]) tower(x, y, 2.2, 8);
for (const [x, y] of [[B.x0, B.y1], [B.x1, B.y1]]) tower(x, y, 3.2, 14);
for (const dx of [-4, 4]) tower(GATE.x + dx, GATE.y, 2.5, 11);   /* the gate's twin flanking towers */
for (const dx of [-4, 4]) tower(INNER.x + dx, INNER.y, 2.0, 9);  /* and the inner gate's */
objects.push({ k: 'cgate', x: GATE.x, y: GATE.y, dir: 'n' });
for (const dx of [-2, -1, 1, 2]) for (const dy of [-1, 0, 1]) set(GATE.x + dx, GATE.y + dy, 'X'); set(GATE.x, GATE.y - 1, 'p'); set(GATE.x, GATE.y + 1, 'p');
objects.push({ k: 'cgate', x: INNER.x, y: INNER.y, dir: 'n', small: true });
/* the keep, in the ward: three storeys, walk-in */
const K = { x: 43, y: 41, w: 14, h: 8 };
objects.push({ k: 'ckeep', x: K.x, y: K.y, w: K.w, h: K.h, floors: 3, lh: 3.2, enter: true, door: [INNER.x, K.y], donjon: { r: 3, h: 8 } });
for (let y = K.y; y < K.y + K.h; y++) for (let x = K.x; x < K.x + K.w; x++) set(x, y, (x === K.x || y === K.y || x === K.x + K.w - 1 || y === K.y + K.h - 1) ? 'X' : 'i');
set(INNER.x, K.y, 'i');
for (let y = A.y0 + 1; y < A.y1; y++) for (let x = A.x0 + 1; x < A.x1; x++) if (at(x, y) !== 'X') set(x, y, 'd');
for (let y = A.y1 + 1; y < B.y1; y++) for (let x = B.x0 + 1; x < B.x1; x++) if (at(x, y) !== 'X' && at(x, y) !== 'i') set(x, y, 'd');
function house(o) {   /* the village's building kind: walls 'X', floor 'i', door 'i' (src/scene.js building()) */
  objects.push(o);
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) set(x, y, (x === o.x || y === o.y || x === o.x + o.w - 1 || y === o.y + o.h - 1) ? 'X' : 'i');
  set(o.door[0], o.door[1], 'i');
}
/* the bailey's row of buildings, doors onto the yard; the road (48-49) runs between them from the gate to the inner gate */
house({ k: 'house', x: 33, y: 24, w: 8, h: 6, door: [37, 29], roof: '#6a3a3a', wall: '#d8c9a3', enter: true, sign: 'Kitchens' });
house({ k: 'house', x: 41, y: 24, w: 6, h: 6, door: [44, 29], roof: '#7a5a2a', wall: '#d6cbb2', enter: true, sign: 'Granary' });
house({ k: 'house', x: 51, y: 24, w: 7, h: 6, door: [54, 29], roof: '#4a4f5a', wall: '#cfc4ad', enter: true, sign: 'Armoury' });
house({ k: 'smithy', x: 58, y: 24, w: 8, h: 6, door: [61, 29], roof: '#3f4248', wall: '#b9b0a0', enter: true, sign: 'Castle Forge' });
objects.push({ k: 'well', x: 38, y: 33, w: 2, h: 2 }); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(38 + dx, 33 + dy, 'X');
for (const [x, y] of [[46, 22], [51, 22], [46, 31], [51, 31], [46, 36], [52, 36], [41, 40], [58, 40], [GATE.x - 2, GATE.y - 3], [GATE.x + 3, GATE.y - 3]]) objects.push({ k: 'torch', x, y, w: 1, h: 1 });
/* the road: from the zone's top edge (where the cobbled road from Ashvale meets it, globecfg links) over the bridge to the gate,
   then through the bailey to the inner gate and the keep */
for (let y = 0; y < GATE.y - 1; y++) for (const x of [ROADX, ROADX + 1]) if (at(x, y) !== '~' && at(x, y) !== 's') set(x, y, 'p');
for (let y = GATE.y - 4; y < GATE.y - 1; y++) for (let x = ROADX - 2; x <= ROADX + 3; x++) set(x, y, 'p');   /* a little square before the gate */
for (let y = GATE.y + 1; y < INNER.y; y++) for (const x of [ROADX, ROADX + 1]) if (at(x, y) === 'd') set(x, y, 'p');
for (let y = INNER.y + 1; y < K.y; y++) for (const x of [INNER.x - 1, INNER.x]) if (at(x, y) === 'd') set(x, y, 'p');
/* the bridge: a deck 4 wide over the water and its banks where the road crosses (worldgen.js decks() lays its B tiles) */
{ let y0 = 1e9, y1 = -1e9; for (let x = ROADX - 1; x <= ROADX + 2; x++) for (let y = 0; y < GATE.y; y++) if (at(x, y) === '~' || at(x, y) === 's') { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  objects.push({ k: 'bridge', x: ROADX - 1, y: y0, w: 4, h: y1 - y0 + 1 }); for (let y = y0; y <= y1; y++) for (let x = ROADX - 1; x <= ROADX + 2; x++) set(x, y, 'B'); }
/* --- a full town (Martin: "a chest and town portal and a kitchen where the player can cook and whatever else the castle needs") */
const PORTAL = { x: 55, y: 33, to: [56, 34] };      /* the town portal, by the road inside the gate */
set(PORTAL.x, PORTAL.y, 'd'); set(PORTAL.to[0], PORTAL.to[1], 'd');
npcs.push({ id: 'castle_chest', name: 'Castle chest', look: 'chest', x: 59, y: 34, chest: true, examine: 'The castle chest. Everything you own from Ashvale is kept in your arcade wallet; this is where you see it.' });
const byName = n => objects.find(o => o.sign === n);
const KIT = byName('Kitchens'), FORGE = byName('Castle Forge'), GRAN = byName('Granary'), ARM = byName('Armoury');
objects.push({ k: 'range', x: KIT.x + 2, y: KIT.y + 1, w: 1, h: 1 }, { k: 'range', x: KIT.x + 5, y: KIT.y + 1, w: 1, h: 1 }, { k: 'table', x: KIT.x + 2, y: KIT.y + 3, w: 3, h: 1 }, { k: 'barrel', x: KIT.x + 6, y: KIT.y + 4, w: 1, h: 1 });
objects.push({ k: 'furnace', x: FORGE.x + 1, y: FORGE.y + 1, w: 2, h: 2 }, { k: 'anvil', x: FORGE.x + 4, y: FORGE.y + 3, w: 1, h: 1 }, { k: 'rack', x: FORGE.x + 5, y: FORGE.y + 1, w: 1, h: 1 });
objects.push({ k: 'shelf', x: GRAN.x + 1, y: GRAN.y + 1, w: 3, h: 1 }, { k: 'rack', x: ARM.x + 1, y: ARM.y + 1, w: 1, h: 1 });
npcs.push({ id: 'castle_cook', name: 'Marta the cook', look: 'marta', x: KIT.x + 4, y: KIT.y + 3, shop: 'castle_kitchen', examine: 'Marta, who has cooked for the castle since before the castellan had his keys.' });
npcs.push({ id: 'castle_qm', name: 'Quartermaster Hale', look: 'hale', x: GRAN.x + 2, y: GRAN.y + 3, shop: 'castle_general', examine: 'Quartermaster Hale. Rope, nets, tinderboxes, bread: if the castle needs it, he counts it.' });
npcs.push({ id: 'castle_armourer', name: 'Armourer Voss', look: 'voss', x: ARM.x + 3, y: ARM.y + 3, shop: 'castle_armoury', examine: 'Armourer Voss, who keeps the watch in bowstrings and the gate guard in rivets.' });
/* fishing off the shore outside the walls: the river and the lake */
const fishing = [];
{
  const ok = c => '.pdiqs,f'.indexOf(c) >= 0, seen = new Set([[GATE.x, GATE.y - 3].join(',')]), q = [[GATE.x, GATE.y - 3]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (!seen.has(k) && nx >= 0 && ny >= 0 && nx < W && ny < H && ok(at(nx, ny)) && !(nx > A.x0 && nx < A.x1 && ny > A.y0 && ny < B.y1)) { seen.add(k); q.push([nx, ny]); } } }
  const spots = [];
  for (const k of [...seen].sort()) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x + dx, y + dy) === '~' && at(x + 2 * dx, y + 2 * dy) === '~') spots.push([x + dx, y + dy]); }
  const kinds = [{ fish: 'shrimp_raw' }, { fish: 'salmon_raw', req: 30, xp: 350, tool: 'fishing_rod' }, { fish: 'shrimp_raw' }, { fish: 'salmon_raw', req: 30, xp: 350, tool: 'fishing_rod' }, { fish: 'shrimp_raw' }];   /* no trout: Ashvale's lake keeps the only trout marks (a quest is built on it) */
  for (const sp of spots) { if (fishing.length >= kinds.length) break; if (fishing.some(f => Math.hypot(f.x - sp[0], f.y - sp[1]) < 8)) continue; fishing.push(Object.assign({ x: sp[0], y: sp[1] }, kinds[fishing.length])); }
  console.log('fishing spots:', fishing.length);
}
npcs.push({ id: 'castellan', name: 'Castellan Brannoc', look: 'brannoc', guard: true, maxHit: 10, gear: { weapon: 'longsword_t2' }, x: INNER.x + 2, y: K.y - 2, examine: 'Castellan Brannoc, keeper of the lake castle. He has the keys, and he has had them for a long time.',
  lines: ['The river keeps the town side and the lake keeps the rest. The walls only have to argue with the bridge.', 'Walk the walls if you like; the steps are by the gate and in the ward.'] });
npcs.push({ id: 'gate_guard', name: 'Gate guard', look: 'ash_knight', guard: true, maxHit: 8, gear: { weapon: 'sword_t3', shield: 'shield_t2', head: 'helmet_t2' }, x: GATE.x + 2, y: GATE.y - 2, examine: 'A guard at the castle gate, leaning on a spear he has not needed in years.',
  lines: ['Welcome to the lake castle. Ashvale is back over the bridge, south-west.'] });
/* --- stairs you walk up (Martin: "they should be staircases like the terrain and I just walk up them"): raised ground;
   ramps = [x, y, metres] (src/world.js liftAt); the wall walk and tower tops stand at LH */
const LH = 4.2, ramps = new Map();
const RISE = (k, n) => +((k + 1) * LH / (n + 1)).toFixed(2);
/* a broad staircase against a wall: `len` tiles rising along (ax, ay) from the foot at (x, y), `wide` tiles out into the yard along (px, py) */
function stair(x, y, ax, ay, px, py, len, wide) {
  const cells = [];
  for (let k = 0; k < len; k++) for (let w = 0; w < wide; w++) { const cx = x + ax * k + px * w, cy = y + ay * k + py * w; if (deckCells.has(cx + ',' + cy) || ramps.has(cx + ',' + cy) || 'dpq.'.indexOf(at(cx, cy)) < 0) { console.error('BLOCKED - a staircase runs into a tower, a wall or a building at', cx, cy); process.exit(1); } ramps.set(cx + ',' + cy, RISE(k, len)); set(cx, cy, 'X'); cells.push([cx, cy, RISE(k, len), w === wide - 1 ? 1 : 0]); }
  objects.push({ k: 'cstair', cells, ax, ay, px, py });
}
stair(38, A.y0 + 1, 1, 0, 0, 1, 4, 2);     /* either side of the gate, rising towards it along the top wall */
stair(59, A.y0 + 1, -1, 0, 0, 1, 4, 2);
stair(B.x0 + 1, 45, 0, -1, 1, 0, 4, 2);    /* the ward: up its two side walls */
stair(B.x1 - 1, 45, 0, -1, -1, 0, 4, 2);
/* spiral stairs inside the great towers: a door at the foot on the yard side, two steps up inside, out onto the top */
const CX0 = (A.x0 + A.x1) / 2, CY0 = (A.y0 + B.y1) / 2;
const isGround = (x, y) => 'dpq.'.indexOf(at(x, y)) >= 0 && !ramps.has(x + ',' + y);
for (const t of TOWERS) {
  if (t.r < 2.5) continue;
  const o = objects.find(q => q.k === 'ctower' && q.x === t.x && q.y === t.y);
  const ring = [...deckCells].map(k => k.split(',').map(Number)).filter(([x, y]) => Math.hypot(x - t.x, y - t.y) <= t.r + 0.6);
  const cand = ring.map(([x, y]) => { const g = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).find(([gx, gy]) => isGround(gx, gy) && gx > A.x0 && gx < A.x1 && gy > A.y0 && gy < B.y1); return g ? [x, y, g, Math.hypot(g[0] - CX0, g[1] - CY0)] : null; }).filter(Boolean).sort((p, q) => p[3] - q[3]);
  if (!cand.length) continue;
  const [d1x, d1y, foot] = cand[0];
  const d2 = ring.filter(([x, y]) => Math.max(Math.abs(x - d1x), Math.abs(y - d1y)) === 1 && Math.hypot(x - foot[0], y - foot[1]) > Math.hypot(d1x - foot[0], d1y - foot[1])).sort((p, q) => Math.hypot(p[0] - t.x, p[1] - t.y) - Math.hypot(q[0] - t.x, q[1] - t.y))[0];
  if (!d2) continue;
  deckCells.delete(d1x + ',' + d1y); deckCells.delete(d2[0] + ',' + d2[1]);
  ramps.set(d1x + ',' + d1y, 1.4); ramps.set(d2[0] + ',' + d2[1], 2.8);
  const top = ring.filter(([x, y]) => deckCells.has(x + ',' + y) && Math.max(Math.abs(x - d2[0]), Math.abs(y - d2[1])) === 1).sort((p, q) => Math.hypot(p[0] - t.x, p[1] - t.y) - Math.hypot(q[0] - t.x, q[1] - t.y))[0];
  o.door = [foot[0] - d1x, foot[1] - d1y]; o.dtile = [d1x, d1y]; o.ttile = top || d2;
}
const liftAt = (x, y) => deckCells.has(x + ',' + y) ? LH : (ramps.get(x + ',' + y) || 0);
/* the walk itself must work: from the road outside the gate, every tile of the wall walk can be reached on foot over the
   stairs, with the game's own rule (src/core.js canStep: heights differ by 2.3 m or less; ground tiles must be open) */
{
  const STEP = 2.3, open = (x, y) => liftAt(x, y) > 0 || '.pdiqsB,f'.indexOf(at(x, y)) >= 0;
  const can = (x, y, dx, dy) => { const nx = x + dx, ny = y + dy, la = liftAt(x, y), ok1 = (a, b) => open(a, b) && Math.abs(liftAt(a, b) - la) <= STEP; return ok1(nx, ny) && (!dx || !dy || (ok1(x + dx, y) && ok1(x, y + dy))); };
  const seen = new Set([[GATE.x, GATE.y - 3].join(',')]), q = [[GATE.x, GATE.y - 3]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const k = (x + dx) + ',' + (y + dy); if (!seen.has(k) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && can(x, y, dx, dy)) { seen.add(k); q.push([x + dx, y + dy]); } } }
  const cut = [...deckCells].filter(k => !seen.has(k));
  if (cut.length) { console.error('BLOCKED - %d wall-walk tiles cannot be walked to, e.g. %s', cut.length, cut.slice(0, 6).join(' ')); process.exit(1); }
  if (!seen.has(ROADX + ',0')) { console.error('BLOCKED - the gate cannot be walked to from the road over the bridge'); process.exit(1); }
  console.log('wall walk: %d tiles at %s m, %d stair tiles, all reachable on foot from the bridge road', deckCells.size, LH, ramps.size);
}
objects.push({ k: 'cdeck', x: 0, y: 0, w: W, h: H, lh: LH, cells: [...deckCells].map(k => k.split(',').map(Number)), ramps: [...ramps].map(([k, v]) => k.split(',').map(Number).concat([v])) });
/* watchmen with bows on the towers, each walking a round of about 10 tiles of wall walk from his post, there and back (src/core.js patrolTick) */
const watch = [[A.x0, A.y0, 'w1'], [A.x1, A.y0, 'w2'], [A.x1, A.y1, 'w3'], [A.x0, A.y1, 'w4'], [B.x0, B.y1, 'w5'], [B.x1, B.y1, 'w6'], [GATE.x - 4, GATE.y, 'w7'], [GATE.x + 4, GATE.y, 'w8'], [A.x0, 29, 'w9'], [A.x1, 29, 'w10']];
for (const [x, y, id] of watch) {
  const cells = [...deckCells].map(k => k.split(',').map(Number));
  const start = cells.sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y))[0];
  const prev = new Map([[start.join(','), null]]), q = [start]; let end = start;
  while (q.length) { const c = q.shift(), d = (function depth(k) { let n = 0; while (prev.get(k)) { k = prev.get(k); n++; } return n; })(c.join(','));
    if (d >= 10) { end = c; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [c[0] + dx, c[1] + dy], k = n.join(','); if (deckCells.has(k) && !prev.has(k)) { prev.set(k, c.join(',')); q.push(n); } } }
  const route = []; for (let k = end.join(','); k; k = prev.get(k)) route.unshift(k.split(',').map(Number));
  npcs.push({ id: 'watch_' + id, name: 'Watchman', look: 'ash_knight', guard: true, maxHit: 6, x: start[0], y: start[1], patrol: route.length > 1 ? route : null, gear: { weapon: 'bow_t2', ammo: 'arrows_t1', head: 'helmet_t2' },
    examine: 'A watchman on the castle wall, bow strung, walking his round and looking out over the water.', lines: ['Nothing on the lake today. There never is. That is the job.', 'Anyone coming from Ashvale comes over that bridge, and I see them do it.'] });
}
/* check: every door, the portal, the chest and the keep's door must be reachable on foot from the road over the bridge */
{
  const ok = c => '.pdiqsB,f'.indexOf(c) >= 0, seen = new Set(), q = [[ROADX, 0]], K2 = (x, y) => x + ',' + y;
  seen.add(K2(...q[0]));
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = K2(nx, ny); if (!seen.has(k) && nx >= 0 && ny >= 0 && nx < W && ny < H && ok(at(nx, ny))) { seen.add(k); q.push([nx, ny]); } } }
  const want = [['keep door (from the yard)', INNER.x, K.y - 1], ['portal', PORTAL.to[0], PORTAL.to[1]], ['chest side', 58, 34]].concat(objects.filter(o => o.door && o.k !== 'ckeep' && o.k !== 'ctower').map(o => [o.sign || o.k, o.door[0], o.door[1]]));
  const bad = want.filter(([n, x, y]) => !seen.has(K2(x, y)));
  if (bad.length) { console.error('BLOCKED - not reachable from the bridge road:', JSON.stringify(bad)); process.exit(1); }
  console.log('walk check: bridge road -> gate, keep door, portal, chest and %d doors: all reachable', want.length - 3);
}
/* move the plan from zone-local tiles to game tiles */
const mv = (x, y) => [x + X0, y + Y0];
for (const o of objects) {
  if (o.k !== 'cstair') { o.x += X0; o.y += Y0; }
  if (o.k === 'cwall') { o.x2 += X0; o.y2 += Y0; o.gaps = o.gaps.map(([x, y]) => mv(x, y)); }
  else if (o.k === 'ctower') { if (o.dtile) o.dtile = mv(...o.dtile); if (o.ttile) o.ttile = mv(...o.ttile); }   /* o.door is a direction */
  else if (o.k === 'cdeck') { o.cells = o.cells.map(([x, y]) => mv(x, y)); o.ramps = o.ramps.map(([x, y, l]) => mv(x, y).concat([l])); }
  else if (o.k === 'cstair') { o.cells = o.cells.map(([x, y, l, e]) => mv(x, y).concat([l, e])); }
  else if (o.door) o.door = mv(...o.door);
}
for (const n of npcs) { n.x += X0; n.y += Y0; if (n.patrol) n.patrol = n.patrol.map(([x, y]) => mv(x, y)); }
for (const f of fishing) { f.x += X0; f.y += Y0; }
{ /* the town portal goes in rules.json (portals are made from there, src/core.js); its stone: castle_stone (tools/make_data.py) */
  const rp = path.join(ROOT, 'data', 'rules.json'), RJ = JSON.parse(fs.readFileSync(rp));
  const P = { id: 'castle', name: 'the Lake Castle', x: PORTAL.x + X0, y: PORTAL.y + Y0, to: mv(...PORTAL.to) };
  RJ.data.portals = (RJ.data.portals || []).filter(q => q.id !== 'castle').concat([P]); fs.writeFileSync(rp, JSON.stringify(RJ)); console.log('portal', JSON.stringify(P));
}
const zone = { ashvale3d: 'module', name: 'zone.castle', api: 1, v: 2, data: {
  name: 'Lake castle', level: 'safe', origin: [X0, Y0], size: [W, H], ground: 'village', tiles: T.map(r => r.join('')), objects, npcs, spawns: [], fishing,
  weather: { kinds: { clear: 60, rain: 25, fog: 15 }, min: 300, max: 900 } } };
fs.writeFileSync(path.join(ROOT, 'data', 'zone.castle.json'), JSON.stringify(zone));
console.log('zone.castle: %d objects, %d npcs, %dx%d tiles at (%d, %d) game tiles', objects.length, npcs.length, W, H, X0, Y0);
for (let y = 0; y < H; y++) console.log(T[y].join(''));
