/* [Claude 2026-11-03] golfrules.js against the swing and putt numbers measured in the GBC golf game (the operator: "emulate the
   mechanics ... our golf skill should be done by upgrading our clubs"). A flat test course: no trees, no slopes, so each
   number is the rule alone.  node tests/golf_gbc_test.js */
const R = require('../src/golfrules.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const W = 400, rows = [];
for (let j = 0; j < 40; j++) rows.push((j < 20 ? 'f' : 'g').repeat(W * 2));
const C = R.makeCourse({ box: [0, 0, W, 20], q: 2, rows, trees: [], holes: [{ n: 1, green: [200, 15], slope: [0, 0], swell: 0, pin: [390, 15], pts: [[0, 5]] }], yd: 4 });
const fw = { x: 10, y: 5 }, aim = 0;
const sh = (o) => R.shot(C, fw, Object.assign({ club: '1W', aim, power: 1, impact: 0, spin: 'none', set: 'standard', wind: [0, 0] }, o));
const carry = o => sh(o).carry;
const full = carry({});
ok(Math.abs(full - 57.5) < 0.01, 'a full Standard drive carries the club\'s full 57.5 m (' + full.toFixed(2) + ')');
/* power: GBC carry ~ power^1.5 (100% 202 yd, 80% 146, 50% 72, 30% 36) */
for (const [p, gbc] of [[0.8, 146 / 202], [0.5, 72 / 202], [0.3, 36 / 202]]) {
  const r = carry({ power: p }) / full; ok(Math.abs(r - gbc) < 0.05, `power ${p}: ${(r * 100).toFixed(0)}% of a full carry (GBC ${(gbc * 100).toFixed(0)}%)`);
}
/* impact: GBC Meet window - little lost inside, about a fifth at the edge, a mishit outside */
const loss = i => 1 - carry({ impact: i }) / full;
ok(loss(0.33) < 0.04 && loss(0.67) < 0.08, `inside the window a strike keeps its distance (1/3 out -${(loss(0.33) * 100).toFixed(1)}%, 2/3 out -${(loss(0.67) * 100).toFixed(1)}%)`);
ok(loss(1) > 0.15 && loss(1) < 0.27, `at the window's edge it loses about a fifth (-${(loss(1) * 100).toFixed(0)}%)`);
ok(Math.abs(carry({ impact: 1.3 }) / full - R.MISHIT) < 0.01, 'outside the window it is a mishit: a quarter of the distance');
/* Control: an edge strike bends by the set's share of the carry; better sets bend less */
const bend = set => { const s = sh({ impact: 1, set }); return Math.abs(s.end[1] - fw.y) / s.carry; };
const bends = ['starter', 'standard', 'pro', 'master'].map(bend);
ok(bends.every((b, i) => i === 0 || b < bends[i - 1]) && bends[0] > 0.05 && bends[3] < 0.025, 'Control by set at the window\'s edge: ' + bends.map(b => (b * 100).toFixed(1) + '%').join(' > '));
/* Meet: better sets have a wider window */
ok(['starter', 'standard', 'pro', 'master'].every((k, i, a) => i === 0 || R.SETS[k].window > R.SETS[a[i - 1]].window), 'Meet by set: the window widens with every set');
/* wind: a headwind costs about 2.4 times what a tailwind gives */
const tot = w => sh({ wind: w }).total, calm = tot([0, 0]);
const head = calm - tot([-7, 0]), tail = tot([7, 0]) - calm, cross = Math.abs(sh({ wind: [0, 7] }).end[1] - sh({}).end[1]);
ok(head > 0 && tail > 0 && head / tail > 1.9 && head / tail < 3, `into the wind -${head.toFixed(1)} m, down wind +${tail.toFixed(1)} m (x${(head / tail).toFixed(1)}; GBC 2.4)`);
ok(cross > head, `a crosswind moves it farther sideways (${cross.toFixed(1)} m) than a headwind takes off`);
/* putting: power x range rolls that far on a flat green; the ball runs out fast, then crawls */
const g = { x: 210, y: 15 };
for (const [range, p] of [['short', 0.5], ['long', 0.3], ['long', 0.8]]) {
  const t = R.shot(C, g, { club: 'PT', aim, power: p, impact: 0, range, set: 'standard', pin: [390, 15] }), want = R.PUTT[range] * p;
  ok(Math.abs(t.total - want) / want < 0.08, `a ${range} putt at ${p * 100}% rolls ${t.total.toFixed(2)} m (range x power = ${want.toFixed(2)})`);
}
{
  const t = R.shot(C, g, { club: 'PT', aim, power: 0.5, impact: 0, range: 'long', set: 'standard', pin: [390, 15] }), P = t.path, end = P[P.length - 1];
  const half = P.find(q => Math.hypot(q[0] - g.x, q[1] - g.y) >= t.total / 2);
  ok(half[3] < end[3] * 0.25, `it covers half its roll in the first ${(half[3] / end[3] * 100).toFixed(0)}% of the time (decays, then crawls)`);
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
