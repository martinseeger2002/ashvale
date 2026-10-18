/* make_hill.js -> data/atlas/wg_tables.json `edits`: the hill between Ashvale and the Lake Castle (2026-10-18, the operator: "put a small
   mountain not nearly as steep as the other mountain between ashvale and the lake castle - starting right around 21,174 keep the cobble
   path but make it winding through - i mostly am just trying to break up the straight line road to the lake castle and make more
   geography conducive to new content later").
   Two knobs on one broad rise, the north-east one over the old straight road and the west one beside it, with a pass between; the road
   (globecfg links village > castle, style 'wind': src/wg_paths.js keeps a winding road under a cart's grade, by the waypoints written
   here as wg_tables roadVia) winds up into the pass and down again. Gentle: the steepest ground is under 0.5 m a metre, half the cliff rule's 0.75 (src/wg_tiles.js), so all of it is
   walkable grass and woods; no snow, no rock. Made like the great mountain (make_mountain.js): small 'raise' strokes fitted to a target
   shape, tag 'castle_hill' (a re-run replaces them). Game tiles (x east on the map, y down the map).
     node tools/mountain/make_hill.js      (then python3 build.py) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TAG = 'castle_hill';
const TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
TJ.data.edits = (TJ.data.edits || []).filter(e => e.tag !== TAG);
fs.writeFileSync(TP, JSON.stringify(TJ));
const { W, CFG } = require('../castle/mask.js');
const [OX, OY] = CFG.origin, F = CFG.face;
const plane = (x, y) => [x + 0.5 + OX, -(y + 0.5 + OY)], unit = (x, y) => Array.from(W.toSphere(F, ...plane(x, y))).map(v => +v.toFixed(9));
const BUMPS = [   /* x, y, radius, height (smooth bumps, summed); every one kept off the little ponds round about (a raised pond bed
                    reads as a pit of rock): (-106, 256), (74, 276), (10, 328), (140, 360) */
  [10, 240, 80, 4],     /* the broad rise, its north foot at the old road's 21,174 */
  [50, 192, 66, 15],    /* the north-east knob, over the old straight line */
  [-32, 250, 64, 15],   /* the west knob */
];
/* the road's way through (wg_tables roadVia "village>castle"): west of the north-east knob to the hill's foot, over the saddle between the
   knobs, east under the west knob, then back west past the pond to the old crossing of the castle's river. src/wg_paths.js searches each reach at a cart's grade. */
const VIA = [[4, 172], [9, 221], [32, 250], [-6, 300], [-12, 380]];   /* the saddle is 9, 221; the last, the old road's bridge over the castle's river */
const kern = t => t >= 1 ? 0 : (1 - t * t) * (1 - t * t);
const target = (x, y) => BUMPS.reduce((s, [bx, by, r, h]) => s + h * kern(Math.hypot(x - bx, y - by) / r), 0);
const SP = 16, R = 40, X0 = -140, X1 = 170, Y0 = 150, Y1 = 390, grid = [];
for (let y = Y0; y <= Y1; y += SP) for (let x = X0; x <= X1; x += SP) if (target(x, y) > 0.8) grid.push({ x, y, dh: 0 });
const sumAt = (x, y) => grid.reduce((s, g) => s + g.dh * kern(Math.hypot(x - g.x, y - g.y) / R), 0);
const GAIN = (Math.PI * R * R / 3) / (SP * SP);
for (const g of grid) g.dh = target(g.x, g.y) / GAIN;
for (let it = 0; it < 4; it++) { const res = grid.map(g => target(g.x, g.y) - sumAt(g.x, g.y)); grid.forEach((g, i) => { g.dh = Math.max(0, g.dh + res[i] / GAIN * 0.9); }); }
const err = Math.max(...grid.map(g => Math.abs(target(g.x, g.y) - sumAt(g.x, g.y))));
let steep = 0; for (let y = Y0; y <= Y1; y += 4) for (let x = X0; x <= X1; x += 4) steep = Math.max(steep, Math.hypot(sumAt(x + 1, y) - sumAt(x - 1, y), sumAt(x, y + 1) - sumAt(x, y - 1)) / 2);
TJ.data.roadVia = Object.assign({}, TJ.data.roadVia, { 'village>castle': VIA.map(([x, y]) => [x + OX, y + OY]) });
TJ.data.edits = (TJ.data.edits || []).concat(grid.filter(g => g.dh > 0.05).map(g => ({ op: 'raise', u: unit(g.x, g.y), r: R, dh: +g.dh.toFixed(2), tag: TAG })));
fs.writeFileSync(TP, JSON.stringify(TJ));
console.log('hill: %d strokes (r %d m on a %d m grid), top %s m over the land, fit error %s m, steepest %s m/m', grid.filter(g => g.dh > 0.05).length, R, SP, Math.max(...grid.map(g => sumAt(g.x, g.y))).toFixed(1), err.toFixed(1), steep.toFixed(2));
