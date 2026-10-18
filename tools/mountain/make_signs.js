/* make_signs.js -> data/atlas/wg_tables.json `trailSigns`: fingerposts on the great mountain's trails (2026-10-18, after the camps' notice
   boards showed the ruined keep's DRAGON KILLERS: a 'wsign' is a scoreboard, not a sign). Each post stands beside the trail, off every path,
   with an arm along each way out of that spot (its heading 15 m on along the trail, not the crow's line): at the granary yard (to the
   mountain, back to the castle), at the trailhead where the ways part (safe road, dangerous climb, Lake Castle) and at the Far Foot where
   they meet again. src/wg_paths.js lays them as signposts like the town roads' own. Game tiles (x east, y down), as waypoints.json.
     node tools/mountain/make_signs.js      (after make_trails.js) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'globecfg.json'), 'utf8')).data, [OX, OY] = CFG.origin;
const WPJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'waypoints.json'), 'utf8')), WP = WPJ.waypoints, TR = WPJ.trails;
const HALF = { approach: 1.4, safe: 1.3, danger: 1.0 };
const lenOf = pts => pts.reduce((s, q, i) => i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0, 0);
const at = (pts, d) => { d = Math.max(0, d); for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d <= L || i === pts.length - 1) { const k = L ? Math.min(1, d / L) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; } d -= L; } return pts[0]; };
const segD = (p, a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1))); return Math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ey * t); };
const clearOf = p => Math.min(...Object.entries(TR).map(([k, pts]) => Math.min(...pts.slice(1).map((q, i) => segD(p, pts[i], q))) - HALF[k]));
/* a way out of a spot: [label, trail, +1 on along it / -1 back along it, the distance along it the spot is at] */
function post(name, spot, ways) {
  /* the post: the nearest tile centre round the spot that is 1.4 to 3 m clear of every trail */
  let best = null;
  for (let r = 2; r <= 7 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const p = [Math.floor(spot[0]) + dx + 0.5, Math.floor(spot[1]) + dy + 0.5], c = clearOf(p);
    if (c >= 1.4 && c <= 3 && (!best || Math.hypot(dx, dy) < best.d)) best = { p, d: Math.hypot(dx, dy) };
  }
  if (!best) throw new Error('no room for the signpost at ' + name);
  const arms = ways.map(([t, k, dir, d0]) => { const q = at(TR[k], d0 + dir * 15); return { t, a: +Math.atan2(q[1] - best.p[1], q[0] - best.p[0]).toFixed(3) }; });
  return { id: name, face: CFG.face, x: Math.floor(best.p[0]) + OX, y: Math.floor(best.p[1]) + OY, arms };
}
const LA = lenOf(TR.approach), LS = lenOf(TR.safe), LD = lenOf(TR.danger);
const signs = [
  post('mt_granary', at(TR.approach, 6), [['The Mountain', 'approach', 1, 6], ['Lake Castle', 'approach', -1, 6]]),
  post('mt_trailhead', [WP.trailhead.x, WP.trailhead.y], [['Safe road', 'safe', 1, 0], ['Dangerous climb', 'danger', 1, 0], ['Lake Castle', 'approach', -1, LA]]),
  post('mt_farfoot', [WP.farside.x, WP.farside.y], [['Safe road', 'safe', -1, LS], ['Dangerous climb', 'danger', -1, LD]]),
];
const TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
TJ.data.trailSigns = signs;
fs.writeFileSync(TP, JSON.stringify(TJ));
for (const s of signs) console.log('%s at (%d, %d): %s', s.id, s.x - OX, s.y - OY, s.arms.map(a => a.t + ' ' + Math.round(a.a * 180 / Math.PI) + 'deg').join(', '));
