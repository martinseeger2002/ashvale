'use strict';
/* the flat net (handoff/globe_net.md): all 20 faces laid into face 19's plane. node tests/net_test.js */
const fs = require('fs'), path = require('path'), G0 = require('../src/globe.js'), AW = require('../src/worldgen.js');
const mod = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', n + '.json'), 'utf8')).data, cfg = mod('globecfg');
const W = AW.createWorldgen(G0.createGlobe(cfg), { seed: cfg.seed });
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const N = W.net(cfg.face);
ok(N.T.every(Boolean) && N.tree.size === 19, 'every face is placed, by 19 tree edges (' + N.tree.size + ')');
ok(N.T[cfg.face].join() === '1,0,0,0', 'face ' + cfg.face + ' is the plane itself: the vale frame keeps every number');
/* each face's centroid maps back to itself, and folds home to itself */
let good = 0; for (let f = 0; f < 20; f++) { const t = N.TRI[f], cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, r = N.toFace(cx, cy), h = W.fold(r.f, r.x, r.y); if (r.f === f && r.d === 0 && h[0] === f) good++; }
ok(good === 20, 'every placed triangle shows its own face (' + good + '/20)');
/* across a tree edge the land runs on: a point just inside the neighbour, seen from the parent face (folded), is the same place */
let seam = 0, seams = 0;
for (let f = 0; f < 20; f++) for (let k = 0; k < 3; k++) { const g = W.neighbourFace(f, k); if (!N.isTree(f, g) || f > g) continue; seams++;
  const tg = N.TRI[g], tf = N.TRI[f], sh = tg.filter(a => tf.some(b => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01));
  if (sh.length !== 2) continue;
  const mx = (sh[0][0] + sh[1][0]) / 2, my = (sh[0][1] + sh[1][1]) / 2, gc = [(tg[0][0] + tg[1][0] + tg[2][0]) / 3, (tg[0][1] + tg[1][1] + tg[2][1]) / 3], dx = gc[0] - mx, dy = gc[1] - my, L = Math.hypot(dx, dy);
  const p = [mx + dx / L * 30, my + dy / L * 30], viaG = N.toFace(p[0], p[1]), q = [N.T[f]].map(t => { const ddx = p[0] - t[2], ddy = p[1] - t[3]; return [t[0] * ddx + t[1] * ddy, -t[1] * ddx + t[0] * ddy]; })[0], viaF = W.fold(f, q[0], q[1]);
  const a = W.toSphere(viaG.f, viaG.x, viaG.y), b = W.toSphere(viaF[0], viaF[1], viaF[2]);
  if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * cfg.radius_m < 0.5) seam++; }
ok(seam === seams && seams === 19, 'across all ' + seams + ' tree edges the land runs on (' + seam + ' match within half a metre)');
/* past a cut edge: across() finds the same place natively, and the turn keeps a heading */
let cuts = 0, cutok = 0;
for (let f = 0; f < 20; f++) for (let k = 0; k < 3; k++) { const g = W.neighbourFace(f, k); if (N.isTree(f, g)) continue; cuts++;
  const t = N.TRI[f], a = t[(k + 1) % 3], b = t[(k + 2) % 3], c = t[k], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = mx - c[0], dy = my - c[1], L = Math.hypot(dx, dy);
  const p = [mx + dx / L * 25, my + dy / L * 25], r = N.across(p[0], p[1]); if (!r) continue;
  const s1 = (() => { const n = N.toFace(p[0], p[1]), h = W.fold(n.f, n.x, n.y); return W.toSphere(h[0], h[1], h[2]); })(), n2 = N.toFace(r.x, r.y), s2 = W.toSphere(n2.f, n2.x, n2.y);
  if (r.f === g && n2.f === g && n2.d === 0 && Math.hypot(s1[0] - s2[0], s1[1] - s2[1], s1[2] - s2[2]) * cfg.radius_m < 1) cutok++; }
ok(cuts === 22 && cutok === cuts, 'past each of the 11 cut edges (22 sides) the same ground is found natively in the net (' + cutok + '/' + cuts + ')');
console.log(fails ? 'FAILED: ' + fails : 'ALL OK');
