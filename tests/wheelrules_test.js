/* [Claude 2026-10-20] the wheel's rules (src/wheelrules.js): every bet type's payout as the 2026-10-18 simulation's checks, the
   felt's full bet list, the limits, a fair pocket from the Bank's bytes and the house edge of every bet (2.70%, exactly).
   node tests/wheelrules_test.js */
'use strict';
const W = require('../src/wheelrules.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const back = (k, n) => W.settle({ me: { [k]: 10 } }, n).pay.me;
for (const [k, n, want] of [
  ['s:17', 17, 360], ['s:17', 18, 0], ['s:0', 0, 360],
  ['sp:17-20', 20, 180], ['sp:17-18', 17, 180], ['sp:0-1', 0, 180], ['sp:0-3', 3, 180], ['sp:0-2', 1, 0],
  ['st:16-17-18', 18, 120], ['st:16-17-18', 19, 0], ['tr:0-1-2', 0, 120], ['tr:0-2-3', 3, 120], ['tr:0-1-2', 3, 0],
  ['co:17-18-20-21', 21, 90], ['co:17-18-20-21', 19, 0], ['ff:0-1-2-3', 0, 90], ['ff:0-1-2-3', 2, 90], ['ff:0-1-2-3', 4, 0],
  ['sl:4-5-6-7-8-9', 9, 60], ['sl:4-5-6-7-8-9', 10, 0],
  ['col:1', 34, 30], ['col:2', 35, 30], ['col:3', 36, 30], ['col:1', 35, 0], ['doz:1', 12, 30], ['doz:2', 13, 30], ['doz:3', 36, 30], ['doz:1', 13, 0],
  ['red:', 1, 20], ['red:', 2, 0], ['black:', 2, 20], ['black:', 19, 0], ['odd:', 35, 20], ['even:', 36, 20], ['low:', 18, 20], ['high:', 19, 20], ['low:', 19, 0],
  ['red:', 0, 0], ['even:', 0, 0], ['col:3', 0, 0], ['doz:1', 0, 0]]) ok(back(k, n) === want, 'pay ' + k + ' on ' + n + ': ' + back(k, n) + ' (want ' + want + ')');
const count = t => W.KEYS.filter(k => k.startsWith(t + ':')).length;
ok(count('s') === 37 && count('sp') === 60 && count('st') === 12 && count('co') === 22 && count('sl') === 11 && count('tr') === 2 && count('ff') === 1, 'the felt: 37 straights, 60 splits, 12 streets, 22 corners, 11 six lines, 2 trios, first four (' + W.KEYS.length + ' bets)');
ok(!W.KEYS.includes('sp:3-4') && !W.KEYS.includes('sp:1-5') && !W.KEYS.includes('co:3-4-6-7'), 'no split or corner across the end of a column');
ok(W.legal({}, 'sp:3-4', 5, 100) !== null && W.legal({}, 's:7', 5, 100) === null, 'a bet the felt has not got is refused');
ok(W.legal({ 's:7': 400 }, 's:7', 101, 1000) !== null && W.legal({}, 's:7', 101, 100) !== null && W.legal({}, 's:7', 1.5, 100) !== null, 'limits: 500 a bet, the credit, whole GOLD');
ok(W.pocketFrom([255, 255, 0, 37]) === 0 && W.pocketFrom([0, 36]) === 36 && W.pocketFrom([255, 247]) === null, 'a fair pocket from the Bank\'s bytes (65527 and up skipped)');
ok(W.WHEEL.length === 37 && new Set(W.WHEEL).size === 37, 'the wheel holds every pocket once');
/* the house edge: every bet returns exactly 36/37 of its stake over the 37 pockets */
let worst = 0; for (const k of W.KEYS) { let r = 0; for (let n = 0; n <= 36; n++) r += W.settle({ me: { [k]: 37 } }, n).pay.me; worst = Math.max(worst, Math.abs(r / (37 * 37) - 36 / 37)); }
ok(worst < 1e-12, 'every one of the ' + W.KEYS.length + ' bets returns exactly 36/37 (house edge 2.70%)');
process.exit(fails ? 1 : 0);
