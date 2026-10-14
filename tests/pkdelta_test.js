'use strict';
/* [Claude 2026-10-13] The card-table row as changes (engine.js pkDelta / pkMerge): over thousands of random rows, the row a
   screen rebuilds from the one it holds plus the delta is exactly the dealer's row - fields changed, removed, added, seats
   moved, log lines appended past the six kept. node tests/pkdelta_test.js */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');
const grab = name => { const i = src.indexOf('function ' + name + '('); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } };
const { pkDelta, pkMerge } = new Function(grab('pkDelta') + '\n' + grab('pkMerge') + '\nreturn { pkDelta, pkMerge };')();
let fails = 0, n = 0, smaller = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m); } };
let seed = 7; const rnd = k => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; };
const ids = ['me', 'nZNQpQuok8MhKsNznMQMv64QEFv68UuCCe', 'dev-abcde', 'nX4rpQ9ok8MhKsNznMQMv64QEFv68UuQQq', 'dev-zzzz1', 'dev-q1', 'dev-q2', 'dev-q3'];
let row = { t: 'poker1', v: 1, gid: 3, o: 'playing', st: 'preflop', a: 2, d: 0, h: 1, p: 75, b: 50, bo: [], buy: 1000, mr: 50, bg: 50, rk: 0, lc: 2, lg: ['Ann posts 25', 'Ben posts 50'], se: ids.map((id, i) => [i, id, 1000, 0, 9]), co: [], cseq: 0, r: null, hc: ids.map((_, i) => [i, null, null]) };
for (let step = 0; step < 5000; step++) {
  const next = JSON.parse(JSON.stringify(row)); next.v++;
  const k = rnd(10);
  if (k < 5) { const i = rnd(next.se.length); next.se[i][2] -= rnd(50); next.se[i][3] += rnd(50); next.se[i][4] = rnd(32); next.a = rnd(8); next.p += rnd(100); next.lc++; next.lg = next.lg.concat(['line ' + next.lc]).slice(-6); }
  else if (k < 6) { next.st = ['flop', 'turn', 'river', 'none'][rnd(4)]; next.bo = next.bo.concat([rnd(52)]).slice(0, 5); }
  else if (k < 7) { if (next.se.length > 2) next.se.splice(rnd(next.se.length), 1); else next.se.push([7, 'dev-new', 1000, 0, 1]); }
  else if (k < 8) { next.r = rnd(2) ? { p: [[next.p, [rnd(8)]]], c: 1, rk: 5, sd: [] } : null; }
  else if (k < 9) { if ('co' in next && rnd(2)) delete next.co; else next.co = [[ids[rnd(8)], rnd(2000), ++next.cseq]]; }
  else { next.lc += 9; next.lg = ['a', 'b', 'c', 'd', 'e', 'f'].map(x => x + next.lc); }   /* more lines than the delta can carry */
  const d = pkDelta(row, next);
  ok(d, 'a delta at step ' + step);
  const back = pkMerge(row, d);
  ok(JSON.stringify(back) === JSON.stringify(Object.assign({}, next)) || JSON.stringify(Object.keys(back).sort().map(x => [x, back[x]])) === JSON.stringify(Object.keys(next).sort().map(x => [x, next[x]])), 'rebuilt row = dealer row at step ' + step + ' (kind ' + k + '): ' + JSON.stringify(d).slice(0, 200));
  if (JSON.stringify(d).length < JSON.stringify(next).length * 0.8) smaller++;
  row = next;
}
ok(!pkDelta(null, row) && !pkDelta(Object.assign({}, row, { gid: 99 }), row), 'no base, or another game at the table: no delta (the whole row goes)');
console.log('ok', n, 'checks;', smaller, 'of 5000 deltas under 80% of the row;', fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
