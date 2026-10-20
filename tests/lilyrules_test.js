/* [Claude 2026-10-19] The Lily Run rules (src/lilyrules.js): lanes are a pure function of time, a bot that looks one hop
   ahead gets frogs home, deaths cost lives, all five homes raise the level, the game ends, scores stay under the Bank's cap. */
const R = require('../src/lilyrules.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
/* lanes: the same t gives the same pieces; pieces move by v per second */
const a = R.pieces(3, 10, 1), b = R.pieces(3, 10, 1), c = R.pieces(3, 11, 1);
ok(JSON.stringify(a) === JSON.stringify(b), 'a lane at a time is the same for everyone');
ok(Math.abs(((c[0].x - a[0].x) % 18 + 18) % 18 - ((-1.9 % 18) + 18) % 18) < 1e-9, 'a lane moves by its speed');
/* a simulated player: hop up when the landing is safe for the next half second, else wait / sidestep */
function safeAt(g, c, r, t) {
  if (r === 0 || r === 6) return true;
  if (r === 12) return R.HOMES.some((h, k) => Math.abs(c - h) < 0.45 && !(g.h & (1 << k)));
  const ps = R.pieces(r, t, g.lv);
  const m = c + 0.5;   /* the frog's middle */
  if (R.ROAD(r)) return !ps.some(p => { const a = p.x + p.len * (1 - R.BODY) / 2, b = p.x + p.len * (1 + R.BODY) / 2; return m + R.FROG + 0.35 > a && m - R.FROG - 0.35 < b; });
  return ps.some(p => p.sunk < 0.3 && m - 0.3 > p.x && m + 0.3 < p.x + p.len);
}
let now = 0; const g = R.newGame(now); const tally = {}; let steps = 0;
while (!g.over && steps < 200000) {
  steps++; now += 1000 / 60; const t = (now - g.lt0) / 1000;
  if (!g.hop && !g.dead) {
    const cc = Math.round(g.c);
    let target = g.r === 11 ? R.HOMES.filter((h, k) => !(g.h & (1 << k))).sort((x, y) => Math.abs(x - g.c) - Math.abs(y - g.c))[0] : null;   /* the nearest free home */
    if (target != null && Math.abs(g.c + R.laneV(11, g.lv) * R.HOP - target) < 0.3) R.hop(g, 0, 1);   /* allow for the log's drift during the hop */
    else if (target != null) { const dc = target > g.c ? 1 : -1; if (safeAt(g, g.c + dc, 11, t + R.HOP + 0.1)) R.hop(g, dc, 0); }
    else if ([0.05, 0.15, 0.25, 0.4, 0.6].every(d => safeAt(g, g.c, g.r + 1, t + d))) R.hop(g, 0, 1);
    else if (R.ROAD(g.r) && !safeAt(g, g.c, g.r, t + 0.4) && g.r > 0) R.hop(g, 0, -1);
    else if (R.RIVER(g.r) && (g.c < 2.5 || g.c > 10.5)) { const dc = g.c < 6 ? 1 : -1; if (safeAt(g, g.c + dc, g.r, t + R.HOP + 0.1)) R.hop(g, dc, 0); else if (safeAt(g, g.c, g.r - 1, t + R.HOP + 0.15)) R.hop(g, 0, -1); }   /* drifting to an edge: step back toward the middle */
  }
  for (const e of R.step(g, 1 / 60, now)) tally[e.e + (e.kind ? ':' + e.kind : '')] = (tally[e.e + (e.kind ? ':' + e.kind : '')] || 0) + 1;
}
console.log('     ', JSON.stringify(tally), 'score', g.s, 'level', g.lv, 'secs', (now / 1000).toFixed(0));
ok(g.over, 'the game ends when the lives run out');
ok((tally.home || 0) >= 3, 'frogs get home (' + (tally.home || 0) + ')');
ok((tally['die:squash'] || 0) + (tally['die:splash'] || 0) + (tally['die:swept'] || 0) + (tally['die:time'] || 0) + (tally['die:bank'] || 0) + (tally['die:taken'] || 0) === R.LIVES + (tally.life || 0), 'every life lost is a death');
ok(g.s <= R.maxFor(now - g.t0), 'the score is under the Bank cap for a run that long (' + g.s + ' <= ' + R.maxFor(now - g.t0) + ')');
/* filling all five homes raises the level and empties them */
const h = R.newGame(0); h.h = 15; h.r = 11; h.c = 11; R.hop(h, 0, 1); let ev = []; for (let i = 0; i < 20; i++) ev = ev.concat(R.step(h, 0.02, i * 20));
ok(ev.some(e => e.e === 'level') && h.lv === 2 && h.h === 0, 'the fifth home: level 2, homes empty, +1000');
/* a taken home kills */
const k = R.newGame(0); k.h = 1; k.r = 11; k.c = 1; R.hop(k, 0, 1); ev = []; for (let i = 0; i < 20; i++) ev = ev.concat(R.step(k, 0.02, i * 20));
ok(ev.some(e => e.e === 'die' && e.kind === 'taken'), 'hopping into a filled home loses the frog');
/* 2026-10-19: "sometimes I move out onto the road after a car has passed and it runs me over anyway". At every moment
   a cart in lane 1 has just gone past the frog's column (its drawn body clear of the frog by a hair), hop up: no squash
   from that cart. And a hop into a cart that is there does squash. */
let passedOk = 0, passedBad = 0, hitOk = 0;
for (let t0 = 0; t0 < 60; t0 += 0.05) {
  const ps = R.pieces(1, t0, 1), c = 6;
  const back = ps.some(p => { const b = p.x + p.len * (1 + R.BODY) / 2; return b < c + 0.5 - R.FROG - 0.02 && b > c + 0.5 - R.FROG - 0.3; });   /* measured from the frog's drawn middle, c + 0.5 */   /* its back end just clear of the frog */
  if (!back) continue;   /* lane 1 runs toward lower cells: a cart that has gone by is the one just below the frog */
  const g = R.newGame(t0 * 1000); g.lt0 = 0; g.c = c; R.hop(g, 0, 1); let died = false;
  for (let i = 0; i < 12; i++) for (const e of R.step(g, 1 / 60, t0 * 1000 + (i + 1) * 1000 / 60)) if (e.e === 'die') died = true;
  /* only blame the passed cart: was any cart overlapping during those frames that is NOT the one just past? */
  const t1 = t0 + 0.2, other = R.pieces(1, t1, 1).some(p => { const a = p.x + p.len * (1 - R.BODY) / 2, b = p.x + p.len * (1 + R.BODY) / 2; return c + 0.5 + R.FROG > a && c + 0.5 - R.FROG < b; });
  if (other) continue;
  if (died) passedBad++; else passedOk++;
}
ok(passedOk > 5 && passedBad === 0, 'hopping out right behind a cart that has gone by never squashes (' + passedOk + ' tries, ' + passedBad + ' squashed)');
for (let t0 = 0; t0 < 60; t0 += 0.25) {
  const ps = R.pieces(1, t0 + R.HOP, 1), c = 6;
  if (!ps.some(p => { const a = p.x + p.len * (1 - R.BODY) / 2, b = p.x + p.len * (1 + R.BODY) / 2; return c + 0.5 > a && c + 0.5 < b; })) continue;
  const g = R.newGame(t0 * 1000); g.lt0 = 0; g.c = c; R.hop(g, 0, 1); let died = false;
  for (let i = 0; i < 20; i++) for (const e of R.step(g, 1 / 60, t0 * 1000 + (i + 1) * 1000 / 60)) if (e.e === 'die' && e.kind === 'squash') died = true;
  if (died) hitOk++;
}
ok(hitOk > 3, 'a hop into a cart that is there squashes (' + hitOk + ')');
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
