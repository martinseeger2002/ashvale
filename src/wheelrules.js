/* ASHVALE: the wheel's rules (2026-10-20: the clubhouse's third floor; shared rounds - one spin for everyone at the table,
   the @ashvale Bank runs the clock). PURE, like dicerules.js: the same file runs in the game and in the Bank's rules worker.
   Single zero (37 pockets), as the 2026-10-18 simulation. Never name the game in public text: "the wheel".
   Bets (keys as the simulation's felt): s:N straight 35:1, sp:a-b split 17:1, st:a-b-c street 11:1, tr:0-1-2 / tr:0-2-3 trio 11:1,
   co:a-b-c-d corner 8:1, ff:0-1-2-3 first four 8:1, sl:<six> six line 5:1, col:1-3 column 2:1, doz:1-3 dozen 2:1,
   red: black: odd: even: low: high: even money. On 0 every outside bet loses (no half back). 1 to 500 GOLD a bet.
   Money: a bet leaves the credit when placed; settle() says what comes back (stake + winnings for a winner).
   API: REDS, WHEEL (pocket order), MIN, MAX, KEYS (every legal bet), numsOf(k), paysOf(k), nameOf(k), legal(bets, key, amt, credit)
   -> null | reason, onTable(bets), pocketFrom(bytes) -> 0..36 | null, settle(seats {sn: {key: amt}}, n) -> {pay: {sn}, lines: {sn}} */
(function (G) {
  'use strict';
  const MIN = 1, MAX = 500;
  const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36], RED = new Set(REDS);
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const OUT = ['low', 'even', 'red', 'black', 'odd', 'high'];
  const key = (t, nums) => t + ':' + nums.slice().sort((a, b) => a - b).join('-');
  /* every bet the felt offers */
  const KEYS = (() => {
    const K = new Set(); for (let n = 0; n <= 36; n++) K.add('s:' + n);
    for (let n = 1; n <= 36; n++) { if (n + 3 <= 36) K.add(key('sp', [n, n + 3])); if (n % 3) K.add(key('sp', [n, n + 1])); }
    for (const n of [1, 2, 3]) K.add(key('sp', [0, n]));
    for (let c = 0; c < 12; c++) { const b = 3 * c + 1; K.add(key('st', [b, b + 1, b + 2])); if (c < 11) K.add(key('sl', [b, b + 1, b + 2, b + 3, b + 4, b + 5]));
      for (const r of [0, 1]) if (c < 11) K.add(key('co', [b + r, b + r + 1, b + r + 3, b + r + 4])); }
    K.add(key('tr', [0, 1, 2])); K.add(key('tr', [0, 2, 3])); K.add(key('ff', [0, 1, 2, 3]));
    for (const v of [1, 2, 3]) { K.add('col:' + v); K.add('doz:' + v); }
    for (const o of OUT) K.add(o + ':');
    return Array.from(K);
  })();
  const KSET = new Set(KEYS);
  function numsOf(k) {
    const i = k.indexOf(':'), t = k.slice(0, i), v = k.slice(i + 1), all = []; for (let n = 1; n <= 36; n++) all.push(n);
    if (t === 'col') return all.filter(n => n % 3 === (+v) % 3);
    if (t === 'doz') return all.filter(n => n > (v - 1) * 12 && n <= v * 12);
    if (t === 'red') return all.filter(n => RED.has(n)); if (t === 'black') return all.filter(n => !RED.has(n));
    if (t === 'odd') return all.filter(n => n % 2); if (t === 'even') return all.filter(n => !(n % 2));
    if (t === 'low') return all.filter(n => n <= 18); if (t === 'high') return all.filter(n => n >= 19);
    return v.split('-').map(Number);
  }
  function paysOf(k) { const t = k.slice(0, k.indexOf(':')); if (t === 'col' || t === 'doz') return 2; if (OUT.indexOf(t) >= 0) return 1; return 36 / numsOf(k).length - 1; }
  function nameOf(k) {
    const i = k.indexOf(':'), t = k.slice(0, i), v = k.slice(i + 1);
    const N = { s: 'Straight', sp: 'Split', st: 'Street', tr: 'Trio', co: 'Corner', ff: 'First four', sl: 'Six line' };
    if (N[t]) return N[t] + ' ' + v; if (t === 'col') return 'Column ' + v; if (t === 'doz') return ['1st', '2nd', '3rd'][v - 1] + ' 12';
    return { low: '1-18', high: '19-36', red: 'Red', black: 'Black', odd: 'Odd', even: 'Even' }[t];
  }
  const onTable = bets => Object.values(bets).reduce((a, b) => a + b, 0);
  function legal(bets, k, amt, credit) {
    if (!KSET.has(k)) return 'There is no such bet.';
    if (!Number.isInteger(amt) || amt < MIN) return 'Bets are whole GOLD.';
    if (amt > credit) return 'Not enough credit for that bet.';
    if ((bets[k] || 0) + amt > MAX) return 'A bet holds at most ' + MAX + ' GOLD.';
    return null;
  }
  /* a fair pocket from the Bank's HMAC bytes: 16-bit draws below 65527 (= 37 x 1771), else the next pair */
  function pocketFrom(bytes) {
    for (let i = 0; i + 1 < bytes.length; i += 2) { const v = bytes[i] * 256 + bytes[i + 1]; if (v < 65527) return v % 37; }
    return null;
  }
  function settle(seats, n) {
    const pay = {}, lines = {};
    for (const sn of Object.keys(seats)) {
      let back = 0; const L = [];
      for (const [k, v] of Object.entries(seats[sn])) {
        if (numsOf(k).indexOf(n) >= 0) { const w = v * paysOf(k); back += v + w; L.push([nameOf(k) + ' wins ' + w + ' (' + paysOf(k) + ' to 1).', 'win']); }
        else L.push([nameOf(k) + ' loses ' + v + '.', 'lose']);
      }
      pay[sn] = back; lines[sn] = L;
    }
    return { pay, lines, n, colour: n === 0 ? 'green' : RED.has(n) ? 'red' : 'black' };
  }

  const API = { MIN, MAX, REDS, WHEEL, KEYS, OUT, key, numsOf, paysOf, nameOf, legal, onTable, pocketFrom, settle };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('wheelrules', { api: 1, v: 1, needs: {} }, () => API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
