/* make_mountain.js -> data/atlas/wg_tables.json `edits`: the great mountain south-west of the Lake Castle (2026-10-18, the operator:
   "a skyrim styled navigable colossal mountain right behind the granary - we'll have to traverse it and its path and meet some npcs
   for quests along the way to get to another town we'll make later ... a dangerous path with monsters and a safe path with puzzle
   quests and light go and come back quests").
   The mountain is raised into the world's own terrain, so the game, the 3D ground and the Atlas all see it, and it wears the world's
   own snow above the snow line. It is a sum of small 'raise' strokes fitted to a target shape: one stroke wider than ~120 m breaks
   along a straight line in the worldgen (a single r=160+ raise showed a 20 m cliff at a fixed place), while r<=100 strokes blend
   cleanly. Strokes carry tag 'mountain'; a re-run replaces them. Game tiles (x east on the map, y down the map).
     node tools/mountain/make_mountain.js      (then node tools/mountain/make_zone.js) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TAG = 'mountain';
const TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
TJ.data.edits = (TJ.data.edits || []).filter(e => e.tag !== TAG);
fs.writeFileSync(TP, JSON.stringify(TJ));
const { W, CFG } = require('../castle/mask.js');
const [OX, OY] = CFG.origin, F = CFG.face;
const plane = (x, y) => [x + 0.5 + OX, -(y + 0.5 + OY)], unit = (x, y) => Array.from(W.toSphere(F, ...plane(x, y))).map(v => +v.toFixed(9));
/* the target: a broad massif, the summit, a north shoulder over the castle side, a west ridge towards the far valley */
/* Kept clear of the natural river's valley to the north-east (wg_terrain rivers: inside the valley the land only goes down, so a slope
   reaching into it is sheared off in a straight cliff along the river): the massif sits south-west, its north-east foot low. */
const BUMPS = [   /* x, y, radius, height (smooth bumps, summed) */
  [-390, 820, 210, 70], [-410, 810, 105, 85], [-330, 790, 80, 22], [-500, 850, 95, 40], [-370, 900, 90, 30], [-450, 760, 70, 25],
];
const kern = t => t >= 1 ? 0 : (1 - t * t) * (1 - t * t);
const target = (x, y) => BUMPS.reduce((s, [bx, by, r, h]) => s + h * kern(Math.hypot(x - bx, y - by) / r), 0);
/* strokes on a 40 m grid, r 95; dh fitted so the strokes' sum follows the target (three corrections on the grid) */
const SP = 40, R = 95, X0 = -640, X1 = -140, Y0 = 560, Y1 = 1060, grid = [];
for (let y = Y0; y <= Y1; y += SP) for (let x = X0; x <= X1; x += SP) if (target(x, y) > 1.5) grid.push({ x, y, dh: 0 });
const sumAt = (x, y) => grid.reduce((s, g) => s + g.dh * kern(Math.hypot(x - g.x, y - g.y) / R), 0);
const GAIN = (Math.PI * R * R / 3) / (SP * SP);
for (const g of grid) g.dh = target(g.x, g.y) / GAIN;
for (let it = 0; it < 3; it++) { const res = grid.map(g => target(g.x, g.y) - sumAt(g.x, g.y)); grid.forEach((g, i) => { g.dh = Math.max(0, g.dh + res[i] / GAIN * 0.9); }); }
const err = Math.max(...grid.map(g => Math.abs(target(g.x, g.y) - sumAt(g.x, g.y))));
TJ.data.edits = (TJ.data.edits || []).concat(grid.filter(g => g.dh > 0.05).map(g => ({ op: 'raise', u: unit(g.x, g.y), r: R, dh: +g.dh.toFixed(2), tag: TAG })));
fs.writeFileSync(TP, JSON.stringify(TJ));
console.log('mountain: %d strokes (r %d m on a %d m grid), target peak %s m, fit error %s m', grid.filter(g => g.dh > 0.05).length, R, SP, Math.max(...grid.map(g => target(g.x, g.y))).toFixed(0), err.toFixed(1));
