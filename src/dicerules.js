/* ASHVALE: the dice table's rules (2026-10-20: the clubhouse's second floor; shared rounds - one roll for everyone at the
   table, the @ashvale Bank runs the clock). PURE: no DOM, no clock, no randomness of its own. The same file runs in the game
   (to show what is legal and what a roll paid) and in the Bank's rules worker (tools/bank/tables_worker.js), so the payouts
   are decided by one piece of code. Never name the game in public text: "the dice table".
   Payouts (Maryland "Craps Standard Rules" v1.5, as the 2026-10-18 simulation): pass / don't pass / come / don't come 1:1
   (the don'ts push on 12), odds 2:1 on 4/10, 3:2 on 5/9, 6:5 on 6/8 (capped at 3x the line bet), place 9:5 / 7:5 / 7:6,
   field 1:1 (2 and 12 pay 2:1), hard 4/10 7:1 and 6/8 9:1 (off on the come-out), big 6 / 8 even, any seven 4:1, any craps 7:1,
   2 and 12 30:1, 3 and 11 15:1. Winnings round down to whole GOLD. A bet that stays up (place, big, hard) is paid its
   winnings only; the stake stays on the felt.
   Money: a bet leaves the player's credit when it is placed (bet()); settle() says what comes back to the credit (stake +
   winnings for a bet that is over, winnings alone for one that stays up). take() returns a bet that may come down.
   seat = { bets: {key: amount}, come: [{n, amt, odds}], dcome: [{n, amt}] }  - keys below; come odds are 'codds<n>'.
   API: newSeat(), KEYS, NAME(k), MIN, MAX, legal(seat, point, key, amt, credit) -> null | reason, bet(seat, point, key, amt)
   -> amount taken, removable(seat, point, key), take(seat, point, key) -> amount back, onTable(seat), diceFrom(bytes),
   settle(point, seats, d1, d2) -> { point, pay: {sn: n}, lines: {sn: [[text, 'win'|'lose'|'']]}, call } (seats change in place) */
(function (G) {
  'use strict';
  const MIN = 1, MAX = 500, ODDS_X = 3;
  const POINTS = [4, 5, 6, 8, 9, 10];
  const PLACE = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] }, ODDS = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };
  const ONE_ROLL = ['field', 'any7', 'anycraps', 'two', 'three', 'eleven', 'twelve'];
  const KEYS = ['pass', 'dp', 'odds', 'come', 'dc', 'field', 'big6', 'big8', 'any7', 'anycraps', 'two', 'three', 'eleven', 'twelve',
    'hard4', 'hard6', 'hard8', 'hard10'].concat(POINTS.map(n => 'place' + n), POINTS.map(n => 'codds' + n));
  const NAMES = { pass: 'the Pass Line', dp: "Don't Pass", odds: 'the Pass Line odds', field: 'the Field', come: 'Come', dc: "Don't Come", big6: 'Big 6', big8: 'Big 8',
    any7: 'Any Seven', anycraps: 'Any 2, 3 or 12', two: 'Aces (2)', three: 'Ace-Deuce (3)', eleven: 'Yo (11)', twelve: 'Boxcars (12)' };
  const NAME = k => NAMES[k] || (/^hard/.test(k) ? 'Hard ' + k.slice(4) : /^place/.test(k) ? 'Place ' + k.slice(5) : /^codds/.test(k) ? 'Come odds on ' + k.slice(5) : k);
  const newSeat = () => ({ bets: {}, come: [], dcome: [] });
  const sumBets = s => Object.values(s.bets).reduce((a, b) => a + b, 0);
  const onTable = s => sumBets(s) + s.come.reduce((a, c) => a + c.amt + (c.odds || 0), 0) + s.dcome.reduce((a, c) => a + c.amt, 0);
  const isInt = n => Number.isInteger(n) && n > 0;

  /* may this bet go down now? null = yes, else the dealer's reason */
  function legal(seat, point, key, amt, credit) {
    if (KEYS.indexOf(key) < 0) return 'There is no such bet.';
    if (!isInt(amt) || amt < MIN) return 'Bets are whole GOLD.';
    if (amt > credit) return 'Not enough credit for that bet.';
    if (key === 'pass' && point) return 'The Pass Line takes bets on the come-out only.';
    if (key === 'dp' && point) return "Don't Pass takes bets on the come-out only.";
    if ((key === 'come' || key === 'dc') && !point) return (key === 'come' ? 'Come' : "Don't Come") + ' takes bets once a point is on.';
    if (key === 'odds') { if (!point || !seat.bets.pass) return 'Odds go behind a Pass Line bet once the point is on.';
      if ((seat.bets.odds || 0) + amt > seat.bets.pass * ODDS_X) return 'Odds are capped at three times your Pass Line bet.'; }
    if (/^codds/.test(key)) { const n = +key.slice(5), c = seat.come.find(q => q.n === n);
      if (!c) return 'Come odds go on a Come bet that has moved to ' + n + '.';
      if ((c.odds || 0) + amt > c.amt * ODDS_X) return 'Odds are capped at three times your Come bet.'; return null; }
    if ((seat.bets[key] || 0) + amt > MAX) return 'The table limit is ' + MAX + ' GOLD a bet.';
    return null;
  }
  function bet(seat, point, key, amt) {
    if (/^codds/.test(key)) { const c = seat.come.find(q => q.n === +key.slice(5)); c.odds = (c.odds || 0) + amt; return amt; }
    seat.bets[key] = (seat.bets[key] || 0) + amt; return amt;
  }
  /* a bet that may come down between rolls: not a line bet once the point is on, not a Come bet that has moved */
  function removable(seat, point, key) {
    if (/^codds/.test(key)) { const c = seat.come.find(q => q.n === +key.slice(5)); return !!(c && c.odds); }
    if (!seat.bets[key]) return false;
    if ((key === 'pass' || key === 'dp') && point) return false;
    return true;
  }
  function take(seat, point, key) {
    if (!removable(seat, point, key)) return 0;
    if (/^codds/.test(key)) { const c = seat.come.find(q => q.n === +key.slice(5)), v = c.odds; c.odds = 0; return v; }
    const v = seat.bets[key]; delete seat.bets[key];
    if (key === 'pass' && seat.bets.odds) { /* (no odds without a point, so none here) */ }
    return v;
  }
  /* two fair dice from the Bank's HMAC bytes: rejection sampling (a byte of 252 or more is skipped) */
  function diceFrom(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length && out.length < 2; i++) if (bytes[i] < 252) out.push(1 + bytes[i] % 6);
    return out.length === 2 ? out : null;
  }

  /* one roll for the whole table */
  function settle(point, seats, d1, d2) {
    const t = d1 + d2, hard = d1 === d2, comeOut = !point, pay = {}, lines = {};
    let call, np = point;
    if (comeOut) {
      if (t === 7 || t === 11) call = (t === 7 ? 'Seven' : 'Yo-leven') + '! Winner on the Pass Line.';
      else if (t === 2 || t === 3 || t === 12) call = (t === 2 ? 'Aces' : t === 3 ? 'Ace-deuce' : 'Boxcars') + '! Line away.';
      else { np = t; call = (hard ? t + ' the hard way' : String(t)) + '. The point is ' + t + '. Mark it!'; }
    } else if (t === point) { np = 0; call = (hard ? t + ', the hard way' : String(t)) + '! Winner: the point is made.'; }
    else if (t === 7) { np = 0; call = 'Seven out! Line away, pay the don\'ts.'; }
    else call = (hard ? t + ', the hard way' : String(t)) + (t === 11 ? ', yo' : '') + '. The point is ' + point + '.';
    for (const sn of Object.keys(seats)) {
      const S = seats[sn], B = S.bets, L = []; let back = 0;
      const win = (k, amt, o, stays) => { const w = Math.floor(amt * o[0] / o[1]); back += (stays ? 0 : amt) + w; L.push([NAME(k) + ' wins ' + w + (stays ? ' (the bet stays up).' : '.'), 'win']); };
      const lose = (k, amt) => L.push([NAME(k) + ' loses ' + amt + '.', 'lose']);
      const push = (k, amt, why) => { back += amt; L.push([why || NAME(k) + ' pushes.', '']); };
      const tk = k => { const v = B[k]; delete B[k]; return v; };
      /* one-roll bets */
      if (B.field) { const a = tk('field'); if ([3, 4, 9, 10, 11].indexOf(t) >= 0) win('field', a, [1, 1]); else if (t === 2 || t === 12) win('field', a, [2, 1]); else lose('field', a); }
      if (B.any7) { const a = tk('any7'); t === 7 ? win('any7', a, [4, 1]) : lose('any7', a); }
      if (B.anycraps) { const a = tk('anycraps'); (t === 2 || t === 3 || t === 12) ? win('anycraps', a, [7, 1]) : lose('anycraps', a); }
      for (const [k, n, p] of [['two', 2, 30], ['three', 3, 15], ['eleven', 11, 15], ['twelve', 12, 30]]) if (B[k]) { const a = tk(k); t === n ? win(k, a, [p, 1]) : lose(k, a); }
      /* hardways: off on the come-out */
      if (!comeOut) for (const n of [4, 6, 8, 10]) { const k = 'hard' + n; if (!B[k]) continue;
        if (t === n && hard) win(k, B[k], [n === 4 || n === 10 ? 7 : 9, 1], true); else if (t === 7 || t === n) { lose(k, B[k]); delete B[k]; } }
      /* big 6 / 8: always working */
      for (const n of [6, 8]) { const k = 'big' + n; if (!B[k]) continue; if (t === n) win(k, B[k], [1, 1], true); else if (t === 7) { lose(k, B[k]); delete B[k]; } }
      /* place bets: off on the come-out */
      if (!comeOut) for (const n of POINTS) { const k = 'place' + n; if (!B[k]) continue; if (t === n) win(k, B[k], PLACE[n], true); else if (t === 7) { lose(k, B[k]); delete B[k]; } }
      /* come bets on their own points (their odds are off on the come-out: returned on a 7 then) */
      for (const c of S.come.slice()) {
        if (t === c.n) { win('come', c.amt, [1, 1]); if (c.odds) { if (comeOut) push('codds' + c.n, c.odds, 'Come odds returned (off on the come-out).'); else win('codds' + c.n, c.odds, ODDS[c.n]); } S.come.splice(S.come.indexOf(c), 1); }
        else if (t === 7) { lose('come', c.amt); if (c.odds) { if (comeOut) push('codds' + c.n, c.odds, 'Come odds returned (off on the come-out).'); else lose('codds' + c.n, c.odds); } S.come.splice(S.come.indexOf(c), 1); }
      }
      for (const c of S.dcome.slice()) { if (t === 7) { win('dc', c.amt, [1, 1]); S.dcome.splice(S.dcome.indexOf(c), 1); } else if (t === c.n) { lose('dc', c.amt); S.dcome.splice(S.dcome.indexOf(c), 1); } }
      /* new come / don't come bets travel */
      if (B.come) { const a = tk('come'); if (t === 7 || t === 11) win('come', a, [1, 1]); else if (t === 2 || t === 3 || t === 12) lose('come', a); else S.come.push({ n: t, amt: a, odds: 0 }); }
      if (B.dc) { const a = tk('dc'); if (t === 2 || t === 3) win('dc', a, [1, 1]); else if (t === 12) push('dc', a, "Don't Come pushes on 12."); else if (t === 7 || t === 11) lose('dc', a); else S.dcome.push({ n: t, amt: a }); }
      /* the line */
      if (comeOut) {
        if (t === 7 || t === 11) { if (B.pass) win('pass', tk('pass'), [1, 1]); if (B.dp) lose('dp', tk('dp')); }
        else if (t === 2 || t === 3 || t === 12) { if (B.pass) lose('pass', tk('pass')); if (B.dp) { if (t === 12) push('dp', tk('dp'), "Don't Pass pushes on 12."); else win('dp', tk('dp'), [1, 1]); } }
      } else if (t === point) { if (B.pass) win('pass', tk('pass'), [1, 1]); if (B.odds) win('odds', tk('odds'), ODDS[t]); if (B.dp) lose('dp', tk('dp')); }
      else if (t === 7) { if (B.pass) lose('pass', tk('pass')); if (B.odds) lose('odds', tk('odds')); if (B.dp) win('dp', tk('dp'), [1, 1]); }
      pay[sn] = back; lines[sn] = L;
    }
    return { point: np, pay, lines, call, total: t, hard };
  }

  const API = { MIN, MAX, ODDS_X, POINTS, PLACE, ODDS, ONE_ROLL, KEYS, NAME, newSeat, onTable, legal, bet, removable, take, diceFrom, settle };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('dicerules', { api: 1, v: 1, needs: {} }, () => API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
