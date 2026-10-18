/* make_trails.js -> data/atlas/wg_tables.json `trails` and tools/mountain/waypoints.json: the ways over the great mountain (2026-10-18).
   - the approach: from the granary yard by the castle's west wall, over the river (bridged where it crosses) to the trailhead;
   - the safe road: trailhead -> the foothill lodge -> the shrine on the north shoulder -> the hermit's ledge on the west shoulder
     -> down to the far side, never steeper than SAFE (it switchbacks);
   - the dangerous climb: trailhead -> straight up over the high pass near the summit, in the snow -> down to the far side, as steep as
     DANGER allows.
   Each leg is an A* search on a 2 m grid of the real ground (with tools/mountain/make_mountain.js's strokes in), the cost climbing with
   the grade and a hard limit on it; water is allowed only on the approach, dearly, so it crosses where the river is narrowest.
   src/wg_paths.js lays the trails as paths (and bridges), src/wg_tiles.js keeps them clear of the cliffs. Game tiles (x east, y down).
     node tools/mountain/make_trails.js      (after make_mountain.js) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TAG = 'mountain';
const TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
TJ.data.trails = (TJ.data.trails || []).filter(t => t.tag !== TAG);
fs.writeFileSync(TP, JSON.stringify(TJ));
const { W, CFG } = require('../castle/mask.js');
const [OX, OY] = CFG.origin, F = CFG.face;
const plane = (x, y) => [x + 0.5 + OX, -(y + 0.5 + OY)];
const A = require('./astar.js')(W, CFG), { route, thin, legs, hAt, HT, GX0, GY0, GW, GH, G2 } = A;   /* the ground and the search (tools/mountain/astar.js) */
let peak = { h: -1e9 }; for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (HT[j * GW + i] > peak.h) peak = { h: HT[j * GW + i], x: GX0 + i * G2, y: GY0 + j * G2 };
/* a waypoint: out from the summit at an angle (map degrees: 0 east, 90 down the map), the first point at or below a height */
const way = (deg, h) => { const a = deg * Math.PI / 180; for (let r = 4; r < 420; r += 2) { const x = peak.x + Math.cos(a) * r, y = peak.y + Math.sin(a) * r; if (hAt(x, y) <= h) return { x: Math.round(x), y: Math.round(y), h: +hAt(x, y).toFixed(1) }; } return null; };
const START = { x: -76, y: 486 };                         /* the granary yard, just outside the castle's west wall */
const toCastle = Math.atan2(START.y - peak.y, START.x - peak.x) * 180 / Math.PI;
const WP = {
  start: Object.assign({ h: +hAt(START.x, START.y).toFixed(1) }, START),
  trailhead: way(toCastle, 9), lodge: way(toCastle - 22, 28), shrine: way(toCastle - 62, 62), ledge: way(toCastle - 112, 88),
  pass: way(toCastle + 38, 124), farside: way(toCastle + 175, 7), warden: way(toCastle + 8, 16),
};
const SAFE = 0.25, DANGER = 0.45;
const approach = legs('approach', [WP.start, WP.trailhead], 0.3, true);
const safe = legs('safe', [WP.trailhead, WP.lodge, WP.shrine, WP.ledge, WP.farside], SAFE, false);
const danger = legs('danger', [WP.trailhead, WP.warden, WP.pass, WP.farside], DANGER, false);
const len = p => Math.round(p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0));
const vale = p => p.map(([x, y]) => [x + OX, y + OY]);
TJ.data.trails = (TJ.data.trails || []).concat([
  { id: 'mt_approach', tag: TAG, face: F, w: 1.4, pts: vale(approach) },
  { id: 'mt_safe', tag: TAG, face: F, w: 1.3, pts: vale(safe) },
  { id: 'mt_danger', tag: TAG, face: F, w: 1.0, pts: vale(danger) },
]);
fs.writeFileSync(TP, JSON.stringify(TJ));
fs.writeFileSync(path.join(__dirname, 'waypoints.json'), JSON.stringify({ peak, waypoints: WP, trails: { approach, safe, danger } }, null, 1));
console.log('summit %s m at (%d, %d)', peak.h.toFixed(0), peak.x, peak.y);
for (const [k, v] of Object.entries(WP)) console.log('  %s: (%d, %d) %s m', k, v.x, v.y, v.h);
console.log('trails: approach %d m, safe road %d m, dangerous climb %d m', len(approach), len(safe), len(danger));
