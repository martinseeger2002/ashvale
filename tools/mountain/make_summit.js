/* make_summit.js -> data/atlas/wg_tables.json (a 'flatten' edit and the trail 'mt_summit') and tools/mountain/waypoints.json (summit,
   trails.summit): the top of the great mountain, where the wizard's tower stands (2026-10-18, the operator: "at the peak of the mountain
   from the pass should be a wizards tower with wizard quests and new items and lore").
   - a level crown at the summit, a little below the peak, for the tower and its yard (tag 'mountain_summit');
   - a trail up from the High Pass to it, as steep as the dangerous climb allows (it switchbacks where it must).
   The crown must be in the ground before the trail is searched, and the worldgen reads its edits once per process, so the search runs in
   a fresh process (this file again, with --trail). Game tiles (x east, y down).
     node tools/mountain/make_summit.js      (after make_trails.js; then node tools/mountain/make_tower.js) */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), WPP = path.join(__dirname, 'waypoints.json'), TAG = 'mountain_summit';
const CROWN = { r: 15, below: 4 };   /* the crown: 15 m round, 4 m under the peak */
if (process.argv[2] !== '--trail') {
  const TJ = JSON.parse(fs.readFileSync(TP, 'utf8')), WPJ = JSON.parse(fs.readFileSync(WPP, 'utf8')), pk = WPJ.peak;
  const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'globecfg.json'), 'utf8')).data;
  TJ.data.edits = (TJ.data.edits || []).filter(e => e.tag !== TAG); TJ.data.trails = (TJ.data.trails || []).filter(t => t.tag !== TAG);
  fs.writeFileSync(TP, JSON.stringify(TJ));
  const { W } = require('../castle/mask.js'), [OX, OY] = CFG.origin;
  const u = Array.from(W.toSphere(CFG.face, pk.x + 0.5 + OX, -(pk.y + 0.5 + OY))).map(v => +v.toFixed(9));
  TJ.data.edits.push({ op: 'flatten', u, r: CROWN.r, to: +(pk.h - CROWN.below).toFixed(2), tag: TAG });
  fs.writeFileSync(TP, JSON.stringify(TJ));
  console.log('crown: r %d m at (%d, %d), %s m', CROWN.r, pk.x, pk.y, (pk.h - CROWN.below).toFixed(1));
  const r = cp.spawnSync(process.execPath, ['--max-old-space-size=3000', __filename, '--trail'], { stdio: 'inherit' });
  process.exit(r.status);
} else {
  const { W, CFG } = require('../castle/mask.js'), [OX, OY] = CFG.origin;
  const A = require('./astar.js')(W, CFG), WPJ = JSON.parse(fs.readFileSync(WPP, 'utf8')), pk = WPJ.peak, pass = WPJ.waypoints.pass;
  /* the summit waypoint: the crown's edge nearest the pass, so the trail arrives at the yard and the tower keeps the middle */
  const d = Math.hypot(pass.x - pk.x, pass.y - pk.y), s = { x: Math.round(pk.x + (pass.x - pk.x) / d * (CROWN.r - 5)), y: Math.round(pk.y + (pass.y - pk.y) / d * (CROWN.r - 5)) };
  s.h = +A.hAt(s.x, s.y).toFixed(1);
  const pts = A.legs('summit', [pass, s], 0.45, false);
  const len = Math.round(pts.reduce((t, q, i) => i ? t + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0, 0));
  const TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
  TJ.data.trails = (TJ.data.trails || []).filter(t => t.tag !== TAG).concat([{ id: 'mt_summit', tag: TAG, face: CFG.face, w: 1.0, pts: pts.map(([x, y]) => [x + OX, y + OY]) }]);
  fs.writeFileSync(TP, JSON.stringify(TJ));
  WPJ.waypoints.summit = s; WPJ.trails.summit = pts; WPJ.crown = { x: pk.x, y: pk.y, r: CROWN.r, h: +(pk.h - CROWN.below).toFixed(2) };
  fs.writeFileSync(WPP, JSON.stringify(WPJ, null, 1));
  console.log('summit trail: %d m from the pass (%d, %d) %s m to the crown (%d, %d) %s m, %d points', len, pass.x, pass.y, pass.h, s.x, s.y, s.h, pts.length);
}
