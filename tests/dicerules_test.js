/* [Claude 2026-10-20] the dice table's rules (src/dicerules.js): the 2026-10-18 simulation's fixed scenarios, money that only
   moves by the payouts over many random rolls, and each bet's house edge against the known figures.  node tests/dicerules_test.js */
'use strict';
const C = require('../src/dicerules.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
/* one player at the table with a credit, as the Bank keeps it */
function table() { const T = { point: 0, credit: 1000, seat: C.newSeat() };
  T.bet = (k, a) => { const e = C.legal(T.seat, T.point, k, a, T.credit); if (e) return e; T.credit -= C.bet(T.seat, T.point, k, a); return null; };
  T.roll = (a, b) => { const before = T.credit + C.onTable(T.seat); const r = C.settle(T.point, { me: T.seat }, a, b); T.point = r.point; T.credit += r.pay.me; return T.credit + C.onTable(T.seat) - before; };
  return T; }
{ const T = table();
  T.bet('pass', 10); T.bet('field', 10); T.bet('any7', 10);
  ok(T.roll(3, 4) === 40, 'come-out 7: pass +10, field -10, any7 +40');
  T.bet('pass', 10); T.roll(2, 4); ok(T.point === 6, 'come-out 6 sets the point');
  ok(T.bet('place6', 6) === null && T.bet('odds', 10) === null && T.bet('hard8', 10) === null, 'place 6, odds and hard 8 go down');
  ok(T.roll(5, 3) === -10, '8 easy: hard 8 loses 10, place 6 untouched');
  ok(T.roll(3, 3) === 29, '6 made: pass +10, odds 10 at 6:5 = +12, place 6 at 7:6 = +7');
  T.bet('pass', 10); T.roll(4, 5); T.bet('come', 5);
  ok(T.roll(6, 4) === 0 && T.seat.come.length === 1 && T.seat.come[0].n === 10, 'come travels to 10 (no money moves)');
  ok(T.bet('codds10', 15) === null && T.bet('codds10', 1) !== null, 'come odds up to 3x the come bet');
  ok(T.roll(1, 6) === -36, 'seven out: pass -10, come on 10 -5 and its odds -15, place 6 -6');
  ok(T.point === 0, 'the puck is off again');
}
{ const T = table();
  ok(T.bet('come', 5) !== null, 'no Come bet on the come-out');
  ok(T.bet('odds', 5) !== null, 'no odds without a point');
  T.bet('pass', 10); T.roll(2, 2);
  ok(T.bet('pass', 5) !== null && T.bet('dp', 5) !== null, 'no new line bets once the point is on');
  ok(!C.removable(T.seat, T.point, 'pass'), 'the Pass Line is a contract once the point is on');
  ok(T.bet('odds', 31) !== null && T.bet('odds', 30) === null, 'odds capped at 3x the line bet');
  const c0 = T.credit; ok(C.take(T.seat, T.point, 'odds') === 30 && (T.credit += 30, T.credit === c0 + 30), 'odds may come down');
  ok(T.bet('field', 501) !== null && T.bet('field', 2000) !== null, 'table limit 500 a bet');
  ok(T.bet('field', 0) !== null && T.bet('field', 2.5) !== null, 'whole GOLD only');
  ok(T.bet('hard4', 10) === null && T.roll(2, 2) === 10 + 70, 'the point 4 made the hard way: pass +10, hard 4 7:1 (stays up)');
  ok(T.seat.bets.hard4 === 10, 'hard 4 stays up after it wins');
  ok(T.roll(1, 1) === 0 && T.seat.bets.hard4 === 10, 'hard ways are off on the come-out: a 2 moves nothing, hard 4 stays');
  ok(T.roll(2, 5) === 0 && T.seat.bets.hard4 === 10, 'a come-out 7 does not take the hard 4 (off)');
}
ok(JSON.stringify(C.diceFrom([0, 255, 5])) === '[1,6]' && JSON.stringify(C.diceFrom([252, 253, 254, 255, 11, 17])) === '[6,6]' && C.diceFrom([255, 254]) === null, 'dice from the Bank\'s bytes, skipping 252-255');
/* [Claude 2026-11-01] the operator: "make sure all of the bets on the craps table work and are paid out correctly": every bet, every one of the 36 rolls, on
   the come-out and with each point on, against a table written here from the casino rules and not from dicerules.js. net = what the roll does to a
   100 GOLD bet (winnings, or -100); stays = the stake is still on the felt afterwards (with no money moved, or winnings paid on it). */
{ const WIN = { pl: { 4: 5 / 9, 5: 7 / 5, 6: 7 / 6, 8: 7 / 6, 9: 7 / 5, 10: 9 / 5 }, od: { 4: 2, 5: 3 / 2, 6: 6 / 5, 8: 6 / 5, 9: 3 / 2, 10: 2 } };
  WIN.pl[4] = 9 / 5;
  const CR = t => t === 2 || t === 3 || t === 12;
  const oracle = (key, point, a, b) => { const t = a + b, hard = a === b, out = (w) => ({ net: Math.floor(w * 100 + 1e-9), stays: false }), lose = { net: -100, stays: false }, stay = { net: 0, stays: true }, paid = w => ({ net: Math.floor(w * 100 + 1e-9), stays: true });
    switch (key) {
      case 'pass': if (!point) return t === 7 || t === 11 ? out(1) : CR(t) ? lose : stay; return t === point ? out(1) : t === 7 ? lose : stay;
      case 'dp': if (!point) return t === 2 || t === 3 ? out(1) : t === 12 ? out(0) : t === 7 || t === 11 ? lose : stay; return t === 7 ? out(1) : t === point ? lose : stay;
      case 'odds': return t === point ? out(WIN.od[point]) : t === 7 ? lose : stay;
      case 'field': return t === 2 || t === 12 ? out(2) : [3, 4, 9, 10, 11].includes(t) ? out(1) : lose;
      case 'any7': return t === 7 ? out(4) : lose;
      case 'anycraps': return CR(t) ? out(7) : lose;
      case 'two': return t === 2 ? out(30) : lose;
      case 'three': return t === 3 ? out(15) : lose;
      case 'eleven': return t === 11 ? out(15) : lose;
      case 'twelve': return t === 12 ? out(30) : lose;
      case 'big6': return t === 6 ? paid(1) : t === 7 ? lose : stay;
      case 'big8': return t === 8 ? paid(1) : t === 7 ? lose : stay;
    }
    if (/^place/.test(key)) { const n = +key.slice(5); if (!point) return stay; return t === n ? paid(WIN.pl[n]) : t === 7 ? lose : stay; }
    if (/^hard/.test(key)) { const n = +key.slice(4); if (!point) return stay; if (t === n && hard) return paid(n === 4 || n === 10 ? 7 : 9); return t === n || t === 7 ? lose : stay; }
    throw new Error(key); };
  const has = (S, k) => k in S.bets;
  let n = 0, bad = [];
  for (const point of [0, 4, 5, 6, 8, 9, 10]) for (const key of C.KEYS) { if (/^codds|^come$|^dc$/.test(key)) continue; if (key === 'odds' && !point) continue;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const S = C.newSeat(); S.bets[key] = 100; if (key === 'odds') S.bets.pass = 100;
      const r = C.settle(point, { me: S }, a, b), want = oracle(key, point, a, b);
      const extra = key === 'odds' ? oracle('pass', point, a, b) : null;
      const back = r.pay.me - (extra ? (extra.net > 0 ? 100 + extra.net : 0) : 0);
      const got = has(S, key) ? { net: back, stays: true } : { net: back > 0 ? back - 100 : back === 0 ? -100 : back, stays: false };
      if (got.net !== want.net || got.stays !== want.stays) bad.push([key, 'point', point, 'roll', a, b, JSON.stringify(got), JSON.stringify(want)].join(' '));
      n++; } }
  ok(!bad.length, 'every plain bet on every roll, come-out and each point: ' + n + ' cases' + (bad.length ? ', wrong: ' + bad.length + ': ' + bad.slice(0, 6).join(' | ') : ''));
  /* come and don't come, new and moved to a number */
  bad = []; n = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) { const t = a + b;
    for (const point of [4, 5, 6, 8, 9, 10]) {
      { const S = C.newSeat(); S.bets.come = 100; const r = C.settle(point, { me: S }, a, b); const w = t === 7 || t === 11 ? 200 : 0, m = !(t === 7 || t === 11 || t === 2 || t === 3 || t === 12); if (r.pay.me !== w || (S.come.length === 1) !== m || (m && S.come[0].n !== t)) bad.push('come ' + t); n++; }
      { const S = C.newSeat(); S.bets.dc = 100; const r = C.settle(point, { me: S }, a, b); const w = t === 2 || t === 3 ? 200 : t === 12 ? 100 : 0, m = [4, 5, 6, 8, 9, 10].includes(t); if (r.pay.me !== w || (S.dcome.length === 1) !== m) bad.push('dc ' + t); n++; }
      for (const c of [4, 5, 6, 8, 9, 10]) for (const comeOut of [false, true]) { const p = comeOut ? 0 : point, odd = { 4: 2, 5: 1.5, 6: 1.2, 8: 1.2, 9: 1.5, 10: 2 }[c] * 100;
        { const S = C.newSeat(); S.come.push({ n: c, amt: 100, odds: 100 }); const r = C.settle(p, { me: S }, a, b); const w = t === c ? 200 + (comeOut ? 100 : 100 + odd) : t === 7 ? (comeOut ? 100 : 0) : 0, gone = t === c || t === 7; if (r.pay.me !== w || (S.come.length === 0) !== gone) bad.push('moved come ' + c + ' on ' + t + (comeOut ? ' come-out' : '')); n++; }
        { const S = C.newSeat(); S.dcome.push({ n: c, amt: 100 }); const r = C.settle(p, { me: S }, a, b); const w = t === 7 ? 200 : 0, gone = t === c || t === 7; if (r.pay.me !== w || (S.dcome.length === 0) !== gone) bad.push('moved dc ' + c + ' on ' + t); n++; } } } }
  ok(!bad.length, 'come and don\'t come, new and moved, odds on and off: ' + n + ' cases' + (bad.length ? ': ' + bad.slice(0, 6).join(' | ') : ''));
  const T = table(); T.credit = 5000; T.bet('pass', 500); T.roll(2, 2);
  ok(T.bet('odds', 1500) === null, 'odds on a 500 line bet go up to three times it, past the 500 a bet limit');
  ok(T.bet('odds', 1) !== null, 'and no further');
}
/* random play: the money only moves by the payouts, and nothing goes negative */
{ let s = 7; const R = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const T = table(); T.credit = 1e7; let bad = 0;
  for (let i = 0; i < 20000; i++) {
    for (let k = 0; k < 3; k++) { const key = C.KEYS[Math.floor(R() * C.KEYS.length)]; T.bet(key, [1, 5, 6, 25][Math.floor(R() * 4)]); }
    if (R() < 0.1) for (const k of C.KEYS) if (C.removable(T.seat, T.point, k)) T.credit += C.take(T.seat, T.point, k);
    const a = 1 + Math.floor(R() * 6), b = 1 + Math.floor(R() * 6); T.roll(a, b);
    if (!Number.isInteger(T.credit) || T.credit < 0 || C.onTable(T.seat) < 0) bad++;
  }
  ok(!bad, 'twenty thousand random rolls: credit and the felt stay whole numbers, never negative');
}
/* the house edge of each bet, played alone many times, against the published figures (per bet resolved) */
function edge(key, n, setup) {
  let s = 99; const R = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; const die = () => 1 + Math.floor(R() * 6);
  let staked = 0, net = 0, done = 0;
  while (done < n) {
    const T = table(); T.credit = 1e9; if (setup) setup(T);
    const c0 = T.credit; if (T.bet(key, 30)) return NaN; staked += 30;
    let guard = 0; while (guard++ < 1000) { T.roll(die(), die()); const live = key === 'pass' || key === 'dp' ? T.seat.bets[key] : T.seat.bets[key]; if (!live) break; if (/^(place|hard|big)/.test(key) && T.credit !== c0 - 30 + 0 && T.credit > c0 - 30) { T.credit += C.take(T.seat, T.point, key) || 0; break; } }
    if (T.seat.bets[key]) T.credit += C.take(T.seat, T.point, key) || 0;
    net += T.credit - c0; done++;
  }
  return -net / staked;
}
const point6 = T => { T.point = 6; };
for (const [k, want, tol, setup] of [['pass', 0.0141, 0.006], ['dp', 0.0136, 0.006], ['field', 0.0556, 0.006], ['any7', 0.1667, 0.01], ['big6', 0.0909, 0.008],
  ['place6', 0.0152, 0.006, point6], ['place5', 0.04, 0.007, point6], ['place4', 0.0667, 0.008, point6], ['hard8', 0.0909, 0.012, point6], ['eleven', 0.1111, 0.02]]) {
  const e = edge(k, 300000, setup); ok(Math.abs(e - want) < tol, NAME(k) + ': house edge ' + (e * 100).toFixed(2) + '% (published ' + (want * 100).toFixed(2) + '%)');
}
function NAME(k) { return C.NAME(k); }
process.exit(fails ? 1 : 0);
