/* astar.js - the great mountain's trail search (moved out of tools/mountain/make_trails.js 2026-10-18 for the summit trail, make_summit.js):
   the real ground on a 2 m grid and an A* over it whose cost climbs with the grade, with a hard limit on the grade. Game tiles (x east, y down).
     const A = require('./astar.js')(W, CFG); A.route(a, b, gmax, water); A.legs(name, [a, b, ...], gmax, water); A.hAt(x, y) */
'use strict';
module.exports = function (W, CFG) {
const [OX, OY] = CFG.origin, F = CFG.face;
const plane = (x, y) => [x + 0.5 + OX, -(y + 0.5 + OY)];
const G2 = 2, GX0 = -720, GY0 = 440, GW = 340, GH = 330, HT = new Float32Array(GW * GH), WET = new Uint8Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const o = W.sample(F, ...plane(GX0 + i * G2, GY0 + j * G2)); HT[j * GW + i] = o.h; WET[j * GW + i] = (o.river === 3 && o.h < o.wl + 0.05) || o.h < W.WATER ? 1 : 0; }
const cell = (x, y) => [Math.round((x - GX0) / G2), Math.round((y - GY0) / G2)], hAt = (x, y) => { const [i, j] = cell(x, y); return HT[Math.max(0, Math.min(GH - 1, j)) * GW + Math.max(0, Math.min(GW - 1, i))]; };
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
return { route, thin, legs, hAt, HT, GX0, GY0, GW, GH, G2 };
};
