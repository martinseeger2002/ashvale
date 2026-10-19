/* make_bridges.js -> data/atlas/wg_tables.json `trails[].bridges`: a stone bridge where a hand-laid trail fords a river the path code does
   not bridge by itself (2026-10-19, the operator: "make a bridge modeled after the ashvale to lake castle bridge in the similar manner on
   the lake castle to big mountain bridge"). src/wg_paths.js layBridges() bridges lake water and the sea's arms up to 14 m; a natural river's
   channel (worldgen river >= 1.5, standing above sea level) was walked straight through on bare bridge tiles. Each such run along a trail
   - wet from bank to bank, 2 m or more - becomes a span [ax, ay, bx, by] (face tiles) that wg_paths lays as the road's own bridge ('wbridge':
   the stone arch, its deck the walking surface, a torch at each bank and on the crest). Runs layBridges() already takes are left to it.
   Run after tools/mountain/make_trails.js (which writes the trails afresh).
     node tools/mountain/make_bridges.js      (then python3 build.py) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
const { W } = require('../castle/mask.js'), BRIDGE = 14;
for (const tr of TJ.data.trails || []) {
  delete tr.bridges;
  const P = (tr.pts || []).map(([x, y]) => [x + 0.5, -(y + 0.5)]), runs = []; let run = null;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let k = 0; k < n; k++) {
      const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n, s = W.sample(tr.face, x, y), wet = s.river >= 1.5 || s.h < W.WATER;
      if (wet) { if (!run) run = { a: [x, y], b: [x, y], lake: false }; run.b = [x, y]; if (s.river >= 3 || s.h < W.WATER) run.lake = true; }
      else if (run) { runs.push(run); run = null; }
    }
  }
  const spans = runs.filter(r => { const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); return L >= 2 && !(r.lake && L <= BRIDGE); })
    .map(r => [r.a[0] - 0.5, -r.a[1] - 0.5, r.b[0] - 0.5, -r.b[1] - 0.5].map(v => +v.toFixed(2)));
  if (spans.length) { tr.bridges = spans; console.log('%s: %s', tr.id, spans.map(s => Math.hypot(s[2] - s[0], s[3] - s[1]).toFixed(1) + ' m').join(', ')); }
}
fs.writeFileSync(TP, JSON.stringify(TJ));
