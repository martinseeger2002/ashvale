/* [Claude 2026-10-19] golfrules.js: a bot plays the Saltmere Links with good swings (power to the target, small impact
   errors) and should score near par; checks water drops, out of bounds, sand, putts holing, determinism.  node tests/golfrules_test.js */
const R = require('../src/golfrules.js'), D = require('../data/golf.course.json');
const C = R.makeCourse(D); let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
function rnd(seed) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); }
function play(setId, err, seed) {
  const r = rnd(seed); let total = 0; const card = [], kinds = {};
  for (const h of C.holes) {
    let b = { x: h.pts[0][0], y: h.pts[0][1] }, n = 0, done = false; const wind = R.windFor('t' + seed, h.n);
    while (!done && n < R.MAX_STROKES) {
      const clubId = R.pickClub(C, b, h.pin, setId), tgt = R.aimPoint(C, b, h, clubId, setId);
      const club = R.CLUBS.find(c => c.id === clubId), set = R.SETS[setId];
      const d = Math.hypot(tgt[0] - b.x, tgt[1] - b.y);
      let power;
      if (clubId === 'PT') {   // a player reads the green: try lines and weights, keep the one that finishes nearest
        let bestS = null, bd = 1e9; const a0 = Math.atan2(h.pin[1] - b.y, h.pin[0] - b.x), dd = Math.hypot(h.pin[0] - b.x, h.pin[1] - b.y);
        for (let da = -0.4; da <= 0.4; da += 0.02) for (let k = 0.8; k <= 1.6; k += 0.05) {
          const pw = Math.min(1, Math.sqrt(dd * k / R.PUTT_MAX)), t = R.shot(C, b, { club: 'PT', aim: a0 + da, power: pw, impact: 0, set: setId, pin: h.pin });
          const e = t.holed ? -1 : Math.hypot(t.end[0] - h.pin[0], t.end[1] - h.pin[1]); if (e < bd) { bd = e; bestS = [a0 + da, pw]; }
        }
        const s = R.shot(C, b, { club: 'PT', aim: bestS[0] + (r() - .5) * err * 0.06, power: bestS[1] * (1 + (r() - .5) * err * 0.15), impact: 0, set: setId, pin: h.pin });
        n += 1 + s.penalty; if (s.holed) done = true; else b = { x: s.at[0], y: s.at[1] }; continue;
      }
      else power = Math.min(1, d / (club.carry * set.dist * R.lieOf(C.surf(b.x, b.y), club) * (1 + club.roll)));
      // aim into the wind a little like a player would
      let aim = Math.atan2(tgt[1] - b.y, tgt[0] - b.x);
      const s = R.shot(C, b, { club: clubId, aim, power: Math.min(1, power + (r() - .5) * err * .1), impact: (r() - .5) * 2 * err, spin: 'none', set: setId, wind: clubId === 'PT' ? [0, 0] : wind, pin: h.pin });
      n += 1 + s.penalty; if (s.kind) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
      if (s.holed) done = true; else b = { x: s.at[0], y: s.at[1] };
    }
    card.push(n); total += n;
  }
  return { total, card, kinds };
}
const a = play('standard', 0.3, 1), b2 = play('standard', 0.3, 1);
ok(JSON.stringify(a) === JSON.stringify(b2), 'a round is a pure function of its swings');
for (const [set, err] of [['master', 0.15], ['standard', 0.4], ['starter', 0.8]]) {
  const rs = [1, 2, 3, 4, 5].map(s => play(set, err, s));
  const avg = rs.reduce((s, x) => s + x.total, 0) / rs.length;
  console.log(set, 'err', err, 'avg', avg.toFixed(1), 'cards', rs.map(x => x.total).join(' '), JSON.stringify(rs[0].kinds), rs[0].card.join(','));
}
const good = [1, 2, 3].map(s => play('master', 0.1, s).total);
ok(good.every(t => t >= 55 && t <= 90), 'a steady player on Master clubs scores within reach of par 71: ' + good);
// specific cases
const h18 = C.holes[17];
const wet = R.shot(C, { x: h18.pts[0][0], y: h18.pts[0][1] }, { club: 'SW', aim: Math.PI / 2 * 0 + Math.atan2(h18.pts[1][1] - h18.pts[0][1], h18.pts[1][0] - h18.pts[0][0]), power: 0.5, impact: 0, spin: 'none', set: 'standard', wind: [0, 0], pin: h18.pin });
ok(wet.kind === 'water' && wet.penalty === 1 && wet.drop && C.surf(wet.drop[0], wet.drop[1]) !== 'w', 'a short shot off the 18th tee finds the pond: one stroke, a dry drop (' + wet.kind + ')');
const g = C.holes[0]; const p0 = { x: g.pin[0] + 1.2, y: g.pin[1] };
const pt = R.shot(C, p0, { club: 'PT', aim: Math.PI, power: Math.sqrt(1.4 / R.PUTT_MAX), impact: 0, spin: 'none', set: 'standard', pin: g.pin });
console.log('short putt ends', pt.end.map(v => v.toFixed(2)), 'holed', pt.holed);
const hard = R.shot(C, p0, { club: 'PT', aim: Math.PI, power: 1, impact: 0, spin: 'none', set: 'standard', pin: g.pin });
ok(!hard.holed, 'a full-power putt from 1.2 m does not drop (too fast)');
// The operator: a Tap in inside 10 ft (as the HUD shows feet: metres x yd x 3) drops for one stroke; farther it is a plain putt
const ftm = 1 / (C.yd * 3), near = { x: g.pin[0] + 9.5 * ftm, y: g.pin[1] }, far = { x: g.pin[0] + 10.5 * ftm, y: g.pin[1] };
const tp = s => R.shot(C, s, { club: 'PT', tap: 1, aim: Math.PI, power: 0.3, impact: 0, spin: 'none', set: 'standard', pin: g.pin });
ok(R.canTap(C, near, g.pin) && tp(near).holed && tp(near).penalty === 0, 'a tap-in from 9.5 ft drops');
ok(!R.canTap(C, far, g.pin) && !tp(far).holed, 'no tap-in from 10.5 ft (a plain putt instead)');
ok(JSON.stringify(tp(near)) === JSON.stringify(tp(near)), 'a tap-in replays the same on every game');
process.exit(fails ? 1 : 0);
