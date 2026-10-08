'use strict';
/* the open globe (handoff/globe_net.md, 2026-10-08): anywhere on the planet is ground you can stand on; past a cut edge of
   the flat net you are carried to where the same ground lies natively. node tests/globe_cross_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js'), AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z))), globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
D.wg = AshWorld.seededWorldgen(WGM, AG, D);
const core = AshCore.create(D, { seed: 'cross' }), M = core.M, C = D.globecfg, OX = C.origin[0], OY = C.origin[1];
const N = D.wg.net(C.face), R = C.radius_m;
const vale = (px, py) => [Math.floor(px - OX), Math.floor(-py - OY)];
const sph = (x, y) => M.sphereAt(x + 0.5, y + 0.5);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * R;
/* far faces are ground too: the old 48 m fence round face 19 is gone */
let far = 0; for (let f = 0; f < 20; f++) { const t = N.TRI[f], v = vale((t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3); if (M.inWorld(v[0], v[1])) far++; }
ok(far === 20, 'the middle of every one of the 20 faces is in the world (' + far + ')');
ok(M.tileAt(24, 50) === D.zones[0].tiles[50 - D.zones[0].origin[1]][24 - D.zones[0].origin[0]], 'Ashvale is where it was, tile for tile');
/* a hawk past each cut edge is carried across to the same spot */
const p = core.addPlayer('h', { inv: [{ id: 'ring_hawk', n: 1 }] }); core.cmd('h', { c: 'equip', slot: 0 }); core.tick();
let tried = 0, good = 0, worst = 0;
for (let f = 0; f < 20; f++) for (let k = 0; k < 3; k++) { const g = D.wg.neighbourFace(f, k); if (N.isTree(f, g)) continue;
  const t = N.TRI[f], a = t[(k + 1) % 3], b = t[(k + 2) % 3], c = t[k], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = mx - c[0], dy = my - c[1], L = Math.hypot(dx, dy);
  const v = vale(mx + dx / L * 30, my + dy / L * 30); if (M.netGap(v[0], v[1]) < 25) continue; tried++;
  const before = sph(v[0], v[1]); p.x = v[0]; p.y = v[1]; p.path = []; let ev = null;
  for (let i = 0; i < 4 && !ev; i++) for (const e of core.tick()) if (e.e === 'cross' && e.p === 'h') ev = e;
  const after = ev ? sph(p.x, p.y) : null, d = after ? dist(before, after) : 1e9; worst = Math.max(worst, d);
  if (ev && M.netGap(p.x, p.y) === 0 && d < 6) good++; }
ok(tried === 22 && good === tried, 'past every one of the 22 cut-edge sides a hawk is carried across to the same ground (' + good + '/' + tried + ', worst ' + worst.toFixed(1) + ' m apart)');
{ let found = null; for (let f = 0; f < 20 && !found; f++) for (let k = 0; k < 3; k++) { const g = D.wg.neighbourFace(f, k); if (N.isTree(f, g)) continue; const t = N.TRI[f], a = t[(k + 1) % 3], b = t[(k + 2) % 3], c = t[k], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = mx - c[0], dy = my - c[1], L = Math.hypot(dx, dy); const v = vale(mx + dx / L * 400, my + dy / L * 400); if (M.netGap(v[0], v[1]) > 100) { found = v; break; } }
  ok(found && !M.inWorld(found[0], found[1]), 'the empty space far past a cut edge is no one\'s ground (you are carried across long before)'); }
/* across a seam players see each other: a point on the far side, relocated into my frame, is the same place on the planet */
{ let tried = 0, good = 0;
  for (let f = 0; f < 20; f++) for (let k = 0; k < 3; k++) { const g = D.wg.neighbourFace(f, k); if (N.isTree(f, g)) continue;
    const t = N.TRI[f], a = t[(k + 1) % 3], b = t[(k + 2) % 3], c = t[k], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = mx - c[0], dy = my - c[1], L = Math.hypot(dx, dy);
    const me = vale(mx - dx / L * 15, my - dy / L * 15), there = vale(mx + dx / L * 20, my + dy / L * 20), nat = M.netAcross(there[0], there[1]); if (!nat) continue; tried++;
    const q = M.netNear(nat.x + 0.5, nat.y + 0.5, me[0] + 0.5, me[1] + 0.5); if (!q) continue;
    const s1 = M.sphereAt(q[0], q[1]), s2 = M.sphereAt(nat.x + 0.5, nat.y + 0.5), d = dist(s1, s2), near = Math.hypot(q[0] - me[0], q[1] - me[1]);
    if (d < 2 && near < 60) good++; }
  ok(tried === 22 && good === tried, 'a player just across each of the 22 seam sides is drawn beside me, at their true place (' + good + '/' + tried + ')'); }
console.log(fails ? 'FAILED: ' + fails : 'ALL OK');
