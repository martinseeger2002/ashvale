/* make_waters.js -> data/atlas/wg_tables.json `edits`: the Lake Castle's waters, laid into the world's own terrain
   (2026-10-17, the operator: "the river should be a complete body of water like the rest of them on the world and should
   end and start from 2 larger bodies of water"). Two lakes and the river between them are editor 'water' strokes
   (src/wg_terrain.js editH: a bed under a level surface, read as river water everywhere - the game's tiles, the 3D
   ground, the Atlas), so they render and fish like the world's ponds. The river crosses the road from Ashvale; the road
   bridges it by itself (src/wg_paths.js bridges any stream up to BRIDGE m wide).
   Levels come from the natural ground: each lake sits just under the lowest point of its own shore, and the river steps
   down from the higher lake to the lower one, never above its banks.
   Coordinates are game tiles (x east on the map, y down the map). Strokes carry tag 'castle_water'; a re-run replaces them.
     node tools/castle/make_waters.js        (then node tools/castle/make_castle.js) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TAG = 'castle_water';
/* the natural ground first: take our old strokes out of the tables before the worldgen reads them */
const TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
TJ.data.edits = (TJ.data.edits || []).filter(e => e.tag !== TAG);
if (!TJ.data.edits.length) delete TJ.data.edits;
fs.writeFileSync(TP, JSON.stringify(TJ));
const { W, CFG } = require('./mask.js');
const [OX, OY] = CFG.origin, F = CFG.face;
const plane = (x, y) => [x + 0.5 + OX, -(y + 0.5 + OY)];                    /* game tile -> the face's plane (src/world.js onFace) */
const ground = (x, y) => W.sample(F, ...plane(x, y)).h;
const unit = (x, y) => Array.from(W.toSphere(F, ...plane(x, y))).map(v => +v.toFixed(9));
/* a seeded wobble so the shores are not circles */
let seed = 0x5eed1e;
const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
/* --- the plan */
const LAKES = [
  { name: 'West Lake', x: -250, y: 395, r: 46, lobes: 6 },
  { name: 'East Lake', x: 125, y: 470, r: 50, lobes: 7 },                      /* the castle's lake: its west shore ~30 m from the curtain wall */
];
/* the river's line, west lake -> east lake; it crosses the Ashvale road near (-34, 390) */
const RIVER = [[-205, 392], [-150, 381], [-90, 383], [-34, 390], [14, 402], [52, 424], [82, 452]];
const RIVER_R = 4.5;                                                          /* 9 m wide: under BRIDGE (14 m), so the road gets a bridge */
/* lake strokes: a main basin and lobes round it */
for (const L of LAKES) {
  L.strokes = [{ x: L.x, y: L.y, r: L.r }];
  for (let i = 0; i < L.lobes; i++) {
    const a = (i / L.lobes) * Math.PI * 2 + rnd() * 0.6, d = L.r * (0.45 + rnd() * 0.35), r = L.r * (0.35 + rnd() * 0.25);
    L.strokes.push({ x: Math.round(L.x + Math.cos(a) * d), y: Math.round(L.y + Math.sin(a) * d), r: Math.round(r) });
  }
  const inside = (x, y) => L.strokes.some(s => Math.hypot(x - s.x, y - s.y) < s.r);
  let lo = 1e9;
  for (const s of L.strokes) for (let k = 0; k < 48; k++) {                    /* the shore: just outside every stroke, where no other stroke is */
    const a = k / 48 * Math.PI * 2, x = s.x + Math.cos(a) * (s.r + 2), y = s.y + Math.sin(a) * (s.r + 2);
    if (!inside(x, y)) lo = Math.min(lo, ground(x, y));
  }
  L.level = +Math.max(0.15, lo - 0.15).toFixed(2);
}
/* the river: a Catmull-Rom curve through its points, a stroke every 2 m */
function curve(P, step) {
  const out = [], Q = [P[0]].concat(P, [P[P.length - 1]]);
  for (let i = 1; i < Q.length - 2; i++) {
    const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]], n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t, c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
const pts = curve(RIVER, 2);
const [src, dst] = LAKES[0].level >= LAKES[1].level ? [LAKES[0], LAKES[1]] : [LAKES[1], LAKES[0]];
const order = src === LAKES[0] ? pts : pts.slice().reverse();               /* downstream order */
let lv = src.level;
const river = order.map(([x, y]) => {
  let lo = 1e9; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; lo = Math.min(lo, ground(x + Math.cos(a) * (RIVER_R + 2), y + Math.sin(a) * (RIVER_R + 2))); }
  lv = Math.max(dst.level, Math.min(lv, lo - 0.15));                          /* downhill only, never under the lake it runs into */
  return { x: +x.toFixed(2), y: +y.toFixed(2), r: RIVER_R, to: +lv.toFixed(2) };
});
/* --- the strokes: lakes first, then the river from the higher end (a later stroke's surface wins where they overlap) */
const edits = [];
for (const L of [src, dst]) for (const s of L.strokes) edits.push({ op: 'water', u: unit(s.x, s.y), r: s.r, to: L.level, tag: TAG, name: L.name });
for (const s of river) edits.push({ op: 'water', u: unit(s.x, s.y), r: s.r, to: s.to, tag: TAG, name: 'Castle River' });
TJ.data.edits = (TJ.data.edits || []).concat(edits);
fs.writeFileSync(TP, JSON.stringify(TJ));
console.log('%s at %s m (%d strokes), %s at %s m (%d strokes); the river %d strokes, %s m -> %s m, flowing %s -> %s',
  LAKES[0].name, LAKES[0].level, LAKES[0].strokes.length, LAKES[1].name, LAKES[1].level, LAKES[1].strokes.length,
  river.length, river[0].to, river[river.length - 1].to, src.name, dst.name);
