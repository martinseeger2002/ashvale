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
/* the ground on a 2 m grid */
const G2 = 2, GX0 = -720, GY0 = 440, GW = 340, GH = 330, HT = new Float32Array(GW * GH), WET = new Uint8Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const o = W.sample(F, ...plane(GX0 + i * G2, GY0 + j * G2)); HT[j * GW + i] = o.h; WET[j * GW + i] = (o.river === 3 && o.h < o.wl + 0.05) || o.h < W.WATER ? 1 : 0; }
const cell = (x, y) => [Math.round((x - GX0) / G2), Math.round((y - GY0) / G2)], hAt = (x, y) => { const [i, j] = cell(x, y); return HT[Math.max(0, Math.min(GH - 1, j)) * GW + Math.max(0, Math.min(GW - 1, i))]; };
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
/* A*: 8 neighbours; cost = run x (1 + 6 grade^2); grade over the limit is closed; water closed unless allowed (then dear) */
const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
function route(a, b, gmax, water) {
  const [si, sj] = cell(a.x, a.y), [ti, tj] = cell(b.x, b.y), N = GW * GH, gs = new Float32Array(N).fill(1e30), from = new Int32Array(N).fill(-1), heap = [];
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const x = 2 * i + 1, y = x + 1; let m = i; if (x < heap.length && heap[x][0] < heap[m][0]) m = x; if (y < heap.length && heap[y][0] < heap[m][0]) m = y; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const sk = sj * GW + si, tk = tj * GW + ti, closed = new Uint8Array(N); gs[sk] = 0; push(0, sk);
  while (heap.length) {
    const [, k] = pop(); if (k === tk) break;
    if (closed[k]) continue; closed[k] = 1;   /* each cell expanded once */
    const i = k % GW, j = (k - i) / GW;
    for (const [di, dj] of MOVES) {   /* 16 directions: with only 8 (45 degrees apart) no move runs near enough along a steep slope to stay gentle */
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const nk = nj * GW + ni, run = Math.hypot(di, dj) * G2, g = Math.abs(HT[nk] - HT[k]) / run;
      if (Math.abs(di) + Math.abs(dj) === 3 && (WET[j * GW + ni] || WET[nj * GW + i]) && !water) continue;
      if (g > gmax && nk !== tk) continue;
      if (WET[nk] && !water) continue;
      const ng = gs[k] + run * (1 + 6 * g * g) + (WET[nk] ? 40 : 0);
      if (!closed[nk] && ng < gs[nk]) { gs[nk] = ng; from[nk] = k; push(ng + Math.hypot(ni - ti, nj - tj) * G2, nk); }
    }
  }
  if (from[tk] < 0) throw new Error('no route ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b) + ' within grade ' + gmax);
  const pts = []; for (let k = tk; k >= 0; k = from[k]) { pts.push([GX0 + (k % GW) * G2, GY0 + Math.floor(k / GW) * G2]); if (k === sk) break; }
  return pts.reverse();
}
/* thin the route to a point every ~6 m, keeping its corners */
const thin = (pts) => { const out = [pts[0]]; let acc = 0; for (let q = 1; q < pts.length - 1; q++) { acc += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]); const turn = (pts[q + 1][0] - pts[q][0]) * (pts[q][1] - pts[q - 1][1]) !== (pts[q + 1][1] - pts[q][1]) * (pts[q][0] - pts[q - 1][0]); if (acc >= 6 || (turn && acc >= 3)) { out.push(pts[q]); acc = 0; } } out.push(pts[pts.length - 1]); return out; };
/* each leg as gentle as it can be: from the limit up in steps of 0.05 until a way is found (and say so) */
const legs = (name, list, gmax, water) => { let all = []; for (let q = 0; q + 1 < list.length; q++) { let r = null, g = gmax; for (; g <= gmax + 0.4 && !r; g += 0.05) { try { r = route(list[q], list[q + 1], g, water); } catch (e) { r = null; } } if (!r) throw new Error(name + ' leg ' + q + ' has no way at all'); if (g - 0.05 > gmax + 1e-6) console.log('  %s leg %d needed grade %s', name, q, (g - 0.05).toFixed(2)); all = all.concat(q ? r.slice(1) : r); } return thin(all); };
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
