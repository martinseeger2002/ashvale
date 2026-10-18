/* place_cemetery.js -> data/atlas/wg_tables.json (tag 'cemetery'): the Lake Castle's cemetery (2026-10-18, the operator: "put a quaint cemetery
   at -90, 533 with flowers and a metal fence around it, entrance towards the path").
   A 14 x 12 m yard on the open ground between the little wood and the West Lake, railed in iron (data/decor.json iron_fence, 1 m sections on
   the tile edges, stone piers at the corners), its open double gate in the north side facing the mountain approach trail, with a short
   footpath from the trail to the gate and a stone lantern either side of it. Inside: three rows of graves either side of an aisle from the
   gate (gravestones, crosses, an old slab or two; each blocks its tile), flower beds by the gate and along the south railing, a bench.
   The trees and rocks there are cleared (an editor 'trees' stroke). Writes `decor`, one `edits` stroke and one `trails` path, each tagged
   'cemetery' (a re-run replaces them). Seeded: a re-run lays the same. Game tiles (x east on the map, y down the map).
     node tools/decor/place_cemetery.js      (after tools/decor/make_decor_data.py; then python3 build.py) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TAG = 'cemetery';
const TJ = JSON.parse(fs.readFileSync(TP, 'utf8')), T = TJ.data;
T.decor = (T.decor || []).filter(d => d.tag !== TAG); T.edits = (T.edits || []).filter(e => e.tag !== TAG); T.trails = (T.trails || []).filter(t => t.tag !== TAG);
const { W, CFG } = require('../castle/mask.js'), [OX, OY] = CFG.origin, F = CFG.face;
const unit = (x, y) => Array.from(W.toSphere(F, x + 0.5 + OX, -(y + 0.5 + OY))).map(v => +v.toFixed(9));
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = rng(533090);
const A = -96, B = -83, C = 527, D = 538, GATE = [-91, -90];   /* the yard's tiles (inside the railing), the gate's two tiles in the north side */
const out = [], put = (k, x, y, o) => out.push(Object.assign({ k, face: F, x: x + OX, y: y + OY, ry: 0, pal: 'temperate' }, o || {}, { tag: TAG }));
const Q = Math.PI / 2;
/* the railing on the yard's edges: north and south sections lie along x, west and east along y */
for (let x = A; x <= B; x++) { if (!GATE.includes(x)) put('iron_fence', x, C, { dz: -0.5 }); put('iron_fence', x, D, { dz: 0.5 }); }
for (let y = C; y <= D; y++) { put('iron_fence', A, y, { ry: +Q.toFixed(4), dx: -0.5 }); put('iron_fence', B, y, { ry: +Q.toFixed(4), dx: 0.5 }); }
for (const [x, y, dx, dz] of [[A, C, -0.5, -0.5], [B, C, 0.5, -0.5], [A, D, -0.5, 0.5], [B, D, 0.5, 0.5]]) put('iron_post', x, y, { dx, dz });
put('iron_gate', GATE[0], C, { dx: 0.5, dz: -0.5 });   /* between the gate's two tiles, on the north edge; its leaves swing in */
put('lantern_post', GATE[0] - 1, C - 2); put('lantern_post', GATE[1] + 1, C - 2);
/* the graves: three rows either side of the aisle (x -92 .. -88), headstones to the north, mounds to the south */
const KINDS = ['gravestone', 'gravestone', 'gravestone', 'gravestone', 'gravestone', 'grave_cross', 'grave_cross', 'grave_cross', 'grave_old', 'grave_old'];
for (const y of [529, 532, 535]) for (const x of [-95, -93, -87, -85]) put(KINDS[Math.floor(R() * KINDS.length)], x, y, { ry: +((R() - 0.5) * 0.12).toFixed(3), s: +(0.9 + R() * 0.15).toFixed(2) });
/* flowers: either side of the aisle by the gate, along the south railing, by the bench */
for (const [x, y] of [[-92, 528], [-88, 528], [-95, 538], [-92, 538], [-88, 538], [-85, 538], [-84, 530], [-84, 536]]) put('flower_bed', x, y, { ry: +(R() * Math.PI).toFixed(3), s: +(0.85 + R() * 0.3).toFixed(2) });
put('stone_bench', -84, 533, { ry: +Q.toFixed(4) });
T.decor = T.decor.concat(out);
/* clear the trees and rocks over the yard (and a little round it) */
T.edits = T.edits.concat([{ op: 'trees', u: unit((A + B) / 2, (C + D) / 2), r: 20, s: 0, tag: TAG }]);
/* the footpath: from the nearest point of the mountain approach trail straight to the gate (its centre line on the gate's middle) */
const ap = (T.trails || []).find(t => t.id === 'mt_approach'), gx = GATE[1] + OX - 0.5, gy = C + OY - 1.5;   /* trail points are tile corners less a half */
let best = null; if (ap) for (let i = 1; i < ap.pts.length; i++) { const [ax, ay] = ap.pts[i - 1], [bx, by] = ap.pts[i], ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((gx - ax) * ex + (gy - ay) * ey) / (ex * ex + ey * ey || 1))), q = [ax + ex * t, ay + ey * t], d = Math.hypot(q[0] - gx, q[1] - gy); if (!best || d < best.d) best = { d, q }; }
if (best) T.trails.push({ id: 'cemetery_path', face: F, pts: [[+best.q[0].toFixed(2), +best.q[1].toFixed(2)], [gx, gy]], w: 0.9, tag: TAG });
fs.writeFileSync(TP, JSON.stringify(TJ));
console.log('cemetery: %d pieces (%d railing sections, %d graves), footpath %s m from the approach trail', out.length, out.filter(o => o.k === 'iron_fence').length, out.filter(o => /^grave/.test(o.k)).length, best ? best.d.toFixed(1) : '-');
