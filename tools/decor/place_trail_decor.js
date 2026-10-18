/* place_trail_decor.js -> data/atlas/wg_tables.json `decor` (tag 'trail_decor'): scenery along the great mountain's trails, the way
   back down to the Lake Castle above all (2026-10-18). Kinds from data/decor.json, chosen by the height of the ground: a farmer's and
   traveller's things by the castle and the river (fences, carts, caches, chopping stumps, benches), boulders, logs, ruins, shrines and
   standing stones on the slopes, and up in the snow the same stones with snow on them (palette 'snow'); a milestone every 120 m of the
   approach and the safe road. Each piece stands on open ground beside the trail, off every path, out of the camps, never nearer than
   9 m to another, turned to face the trail (or laid along it: fences, logs, flags). On the cliffs beside the mountain trails (tiles '^')
   only rock and dead wood (ROCKY). Seeded: a re-run lays the same.
     node --max-old-space-size=3000 tools/decor/place_trail_decor.js      (after tools/decor/make_decor_data.py; then python3 build.py) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TAG = 'trail_decor';
{ const TJ = JSON.parse(fs.readFileSync(TP, 'utf8')); TJ.data.decor = (TJ.data.decor || []).filter(d => d.tag !== TAG); fs.writeFileSync(TP, JSON.stringify(TJ)); }
const { W, CFG } = require('../castle/mask.js'), [OX, OY] = CFG.origin, F = CFG.face;
const WPJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'mountain', 'waypoints.json'), 'utf8')), TR = WPJ.trails, WP = WPJ.waypoints;
const KINDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'decor.json'), 'utf8')).data.kinds;
const HALF = { approach: 1.4, safe: 1.3, danger: 1.0, summit: 1.0 }, SNOWLINE = 75;
const ALONG = new Set(['rail_fence', 'fallen_log', 'prayer_flags']), ROCKY = ['boulders', 'boulders', 'boulders', 'boulders', 'dead_tree', 'dead_tree', 'standing_stone'];
const BANDS = [   /* [top of the band in metres, [kind, weight]...] */
  [14, [['rail_fence', 3], ['broken_cart', 1], ['supply_cache', 2], ['stump_axe', 2], ['stone_bench', 2], ['wayshrine', 1], ['lantern_post', 2], ['boulders', 1], ['fallen_log', 1]]],
  [SNOWLINE, [['boulders', 4], ['fallen_log', 2], ['dead_tree', 2], ['ruin_pillar', 1], ['wayshrine', 1], ['standing_stone', 1], ['stone_bench', 1], ['lantern_post', 1], ['prayer_flags', 1]]],
  [1e9, [['boulders', 4], ['prayer_flags', 2], ['standing_stone', 1], ['dead_tree', 2], ['lantern_post', 1], ['supply_cache', 1], ['ruin_pillar', 1]]],
];
const BLOCK = 'TPORNIr~FHXWMYCGAUSVJ^KZDpcdBi';
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const lenOf = pts => pts.reduce((s, q, i) => i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0, 0);
const at = (pts, d) => { d = Math.max(0, d); for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d <= L || i === pts.length - 1) { const k = L ? Math.min(1, d / L) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; } d -= L; } return pts[0]; };
const segD = (p, a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1))); return Math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ey * t); };
const clearOf = p => Math.min(...Object.entries(TR).map(([k, pts]) => Math.min(...pts.slice(1).map((q, i) => segD(p, pts[i], q))) - (HALF[k] || 1.2)));
const CAMPS = ['lodge', 'shrine', 'ledge', 'warden', 'pass', 'farside', 'summit', 'trailhead'].map(k => WP[k]).filter(Boolean).concat([{ x: WPJ.crown.x, y: WPJ.crown.y }]);
const placed = [], out = [], WHY = {}, why = k => { WHY[k] = (WHY[k] || 0) + 1; return false; };
const pick = (band, r) => { const L = BANDS.find(b => band <= b[0])[1], tot = L.reduce((s, x) => s + x[1], 0); let v = r * tot; for (const [k, w] of L) { if ((v -= w) < 0) return k; } return L[0][0]; };
function tryPut(kind, p, tang, r) {
  const tx = Math.floor(p[0]), ty = Math.floor(p[1]), c = [tx + 0.5, ty + 0.5];
  if (!KINDS[kind]) return false;
  const tl = W.tileAt(F, tx + OX, ty + OY);
  if (tl === '^') kind = ROCKY[Math.floor(r * ROCKY.length)];   /* on a cliff only rock and dead wood: the slope is steep under it */
  else if (BLOCK.indexOf(tl) >= 0) return why('tile ' + tl);
  if (clearOf(c) < 1.6) return why('on a path');
  if (CAMPS.some(q => Math.hypot(q.x - c[0], q.y - c[1]) < 15)) return why('camp');
  if (placed.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < 9)) return why('crowded');
  if (tx >= -72 && ty >= 446 && tx < 60 && ty < 548) return false;   /* the castle's own zone */
  const h = W.sample(F, tx + 0.5 + OX, -(ty + 0.5 + OY)).h; if (h < W.WATER + 0.4) return false;
  const near = clearOf(c) < 6;   /* beside the trail: face it, or lie along it */
  const toTrail = Math.atan2(-tang.nx, -tang.ny);
  const ry = ALONG.has(kind) ? Math.atan2(-tang.ty, tang.tx) : near ? toTrail + (r - 0.5) * 0.5 : r * Math.PI * 2;
  placed.push(c); out.push({ k: kind, face: F, x: tx + OX, y: ty + OY, ry: +ry.toFixed(3), pal: h > SNOWLINE ? 'snow' : 'temperate', s: +(0.9 + r * 0.25).toFixed(2), tag: TAG, h: +h.toFixed(1) });
  return true;
}
for (const name of ['approach', 'safe', 'danger', 'summit']) {
  const pts = TR[name]; if (!pts) continue;
  const L = lenOf(pts), R = rng(name.length * 7919 + Math.round(L));
  const tangAt = d => { const a = at(pts, d - 1), b = at(pts, d + 1), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l; return { tx, ty, nx: -ty, ny: tx }; };
  /* milestones first, on the side away from the lamps' (the left going up), every 120 m of the approach and the safe road */
  if (name === 'approach' || name === 'safe') for (let d = 60; d < L - 20; d += 120) { const t = tangAt(d), q = at(pts, d), o = HALF[name] + 2.0; tryPut('milestone', [q[0] + t.nx * o, q[1] + t.ny * o], t, 0.5) || tryPut('milestone', [q[0] - t.nx * o, q[1] - t.ny * o], { tx: t.tx, ty: t.ty, nx: -t.nx, ny: -t.ny }, 0.5); }
  let n = 0;
  for (let d = 12; d < L - 6; d += 14 + R() * 16) {
    const t = tangAt(d), q = at(pts, d), sd = R() < 0.5 ? -1 : 1, off = HALF[name] + 2.2 + R() * 2.4, r = R();
    const p = [q[0] + t.nx * sd * off, q[1] + t.ny * sd * off], tang = { tx: t.tx, ty: t.ty, nx: t.nx * sd, ny: t.ny * sd };
    const h = W.sample(F, Math.floor(p[0]) + 0.5 + OX, -(Math.floor(p[1]) + 0.5 + OY)).h;
    const r2 = R(); if (tryPut(pick(h, r), p, tang, r2) || tryPut(pick(h, r), [q[0] - t.nx * sd * off, q[1] - t.ny * sd * off], { tx: t.tx, ty: t.ty, nx: -tang.nx, ny: -tang.ny }, r2)) n++;   /* this side, else the other */
  }
  console.log('%s: %d m, %d pieces', name, Math.round(L), n);
}
const TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
TJ.data.decor = (TJ.data.decor || []).filter(d => d.tag !== TAG).concat(out.map(({ h, ...d }) => d));
fs.writeFileSync(TP, JSON.stringify(TJ));
const count = {}; for (const d of out) count[d.k] = (count[d.k] || 0) + 1;
console.log('%d pieces of scenery (%d in the snow): %s', out.length, out.filter(d => d.pal === 'snow').length, Object.entries(count).map(([k, v]) => k + ' ' + v).join(', '));
console.log('rejected:', JSON.stringify(WHY));
console.log('first on the approach:', JSON.stringify(out.filter(d => d.h < 14).slice(0, 3).map(d => [d.k, d.x - OX, d.y - OY])));
