'use strict';
/* Side pots for any number of all-ins with different stacks (2026-10-13: "It should be able to calculate side pots
   for any amount of players with different stacks who are all in"). Thousands of seeded random hands, 2 to 8 players,
   random stacks (ties included), some players folding after putting money in, a 10% house cut or none: every chip is
   checked against a reference written apart from the table's own code - each layer a pot, won by the best hand that
   reached it, split evenly with the odd chip to the first seat left of the button, the cut taken only from money that
   was called (an uncalled all-in comes back whole). */
const LIB = require('../src/holdemlib.js');
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; if (fails < 12) console.log('FAIL', m); } };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function reference(t, start, rake) {
  const seats = t.seats.filter(s => s && s.id != null && s.hole), live = seats.filter(s => !s.folded);
  const got = {}; for (const s of seats) got[s.ref] = 0; let house = 0;
  const pos = s => ((s.ref - t.dealer + 98) % 99 + 99) % 99;
  if (live.length === 1) {
    const w = live[0], pot = seats.reduce((a, s) => a + s.committed, 0), others = Math.max(0, ...seats.filter(s => s !== w).map(s => s.committed));
    const back = Math.max(0, w.committed - others), cut = Math.floor((pot - back) * rake); got[w.ref] += pot - cut; house += cut;
  } else {
    const score = {}; for (const s of live) score[s.ref] = LIB.best(s.hole, t.board).score;
    const levels = [...new Set(seats.map(s => s.committed).filter(c => c > 0))].sort((a, b) => a - b);
    let prev = 0;
    for (const L of levels) {
      const amt = seats.reduce((a, s) => a + Math.max(0, Math.min(s.committed, L) - prev), 0);
      const elig = live.filter(s => s.committed >= L), from = seats.filter(s => s.committed > prev).length;
      prev = L; if (!amt) continue;
      const cut = elig.length === 1 && from === 1 ? 0 : Math.floor(amt * rake), net = amt - cut; house += cut;
      const top = Math.max(...elig.map(s => score[s.ref])), w = elig.filter(s => score[s.ref] === top).sort((a, b) => pos(a) - pos(b));
      const share = Math.floor(net / w.length); for (const x of w) got[x.ref] += share; got[w[0].ref] += net - share * w.length;
    }
  }
  const out = {}; for (const s of seats) out[s.ref] = start[s.ref] - s.committed + got[s.ref];
  return { out, house };
}
const N = +(process.argv[2] || 3000);
for (let trial = 0; trial < N; trial++) {
  const R = rng(1000 + trial), n = 2 + Math.floor(R() * 7), rake = R() < 0.5 ? 0.1 : 0;
  const t = LIB.table({ id: 't', small: 10, big: 20, rake, int: k => Math.floor(R() * k) });
  const start = {}; let total0 = 0;
  for (let i = 0; i < n; i++) {
    const c = R() < 0.2 && i ? start[i - 1] : 5 + Math.floor(R() * 3000);   /* ties on purpose */
    t.addSeat(i, { id: 'p' + i, name: 'P' + i, chips: c }); start[i] = c; total0 += c;
  }
  t.newHand();
  const folder = new Set(); for (let i = 0; i < n; i++) if (R() < 0.25) folder.add(i);
  for (let g = 0; g < 200 && t.street !== 'none'; g++) {
    const ref = t.toAct; if (ref < 0) break;
    const live = t.seats.filter(s => s && s.id != null && s.hole && !s.folded).length;
    const r = t.act(ref, folder.has(ref) && live > 2 && t.seats[ref].committed > 0 ? { a: 'fold' } : { a: 'allin' });
    if (r && r.error) { const c = t.act(ref, { a: 'call' }); if (c && c.error) t.act(ref, { a: 'check' }); }
  }
  ok(t.street === 'none' && t.result, 'trial ' + trial + ': the hand ended');
  if (!t.result) continue;
  const ref = reference(t, start, rake), seats = t.seats.filter(s => s && s.id != null);
  const total1 = seats.reduce((a, s) => a + s.chips, 0) + (t.raked | 0);
  ok(total1 === total0, 'trial ' + trial + ': every chip accounted for (' + total1 + ' vs ' + total0 + ')');
  ok((t.raked | 0) === ref.house, 'trial ' + trial + ': the house cut matches (' + t.raked + ' vs ' + ref.house + ')');
  for (const s of seats) ok(s.chips === ref.out[s.ref], 'trial ' + trial + ' (' + n + ' players, rake ' + rake + '): seat ' + s.ref + ' ends with ' + s.chips + ', the reference says ' + ref.out[s.ref]);
}
console.log(fails ? fails + ' FAILED of ' + checks : 'all ' + checks + ' checks passed over ' + N + ' random hands');
process.exit(fails ? 1 : 0);
