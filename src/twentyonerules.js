/* ASHVALE: the twenty-one table's rules (2026-10-20: one table on each upper floor of the clubhouse; shared rounds - one
   dealer hand for everyone at the table, the spots play in turn, the @ashvale Bank runs the clock and deals). PURE: the same file
   runs in the game and in the Bank's rules worker, so one piece of code decides every hand. Never name the game in public text:
   "the twenty-one table".
   Rules (the 2026-10-18 simulation): six decks, the dealer hits soft 17, peeks under an Ace or a ten, blackjack pays 3 to 2,
   insurance (and even money) 2 to 1, double on any two cards and after a split, Aces split once and get one card each, other
   pairs (same rank: K-K, not K-Q) split up to four hands, late surrender. BETS ARE EVEN (2 to 500 GOLD), so 3 to 2
   and half-stake insurance are always whole GOLD (the simulation's open question about half GOLD).
   A round is a state the Bank keeps and changes with the calls below; everyone at the table is sent the same state.
     R = newRound(spots: [[sn, bet], ...] in table order)            phase 'deal'
     deal(R, draw)            draw() -> the next card ('TS', 'AH'...)  -> phase 'insurance' | 'play' | 'dealer' | 'done'
     insure(R, sn, yes)       during 'insurance' (yes costs half the bet: R.cost tells the Bank what to take from the credit)
     insuranceDone(R, draw)   once every spot has answered (or the clock ran out: the Bank answers 'no' for them)
     legalActs(R, sn, credit) -> {hit, stand, double, split, surrender} for the spot whose turn it is
     act(R, sn, a, draw)      a = 'hit' | 'stand' | 'double' | 'split' | 'surrender'; returns the extra stake taken (double, split)
     dealerPlay(R, draw)      phase 'dealer' -> 'done' (draws to 17, hits soft 17)
     settle(R) -> {pay: {sn: back to the credit}, lines: {sn: [[text, kind]]}}   (phase 'done', once)
   Cards: rank 'A23456789TJQK' + suit 'SHDC'. shoe(randInt) -> 312 cards shuffled (randInt(n) -> 0..n-1, the Bank's HMAC
   stream), cutAt(randInt) -> where the cut card goes (72-78%). */
(function (G) {
  'use strict';
  const MIN = 2, MAX = 500, DECKS = 6, MAX_HANDS = 4;
  const val = c => { const r = c[0]; return r === 'A' ? 11 : 'TJQK'.indexOf(r) >= 0 ? 10 : +r; };
  function total(cards) { let t = 0, a = 0; for (const c of cards) { t += val(c); if (c[0] === 'A') a++; } while (t > 21 && a) { t -= 10; a--; } return { t, soft: a > 0 }; }
  const isBJ = (h) => h.cards.length === 2 && !h.split && total(h.cards).t === 21;
  const dealerBJ = R => R.dealer.length >= 2 && total(R.dealer.slice(0, 2)).t === 21;
  function shoe(randInt) {
    const s = []; for (let d = 0; d < DECKS; d++) for (const su of 'SHDC') for (const r of 'A23456789TJQK') s.push(r + su);
    for (let i = s.length - 1; i > 0; i--) { const j = randInt(i + 1); const t = s[i]; s[i] = s[j]; s[j] = t; }
    return s;
  }
  const cutAt = randInt => Math.floor(DECKS * 52 * (0.72 + randInt(61) / 1000));
  function legalBet(amt, credit) {
    if (!Number.isInteger(amt) || amt < MIN) return 'Bets are whole GOLD, ' + MIN + ' at least.';
    if (amt % 2) return 'Bets here are even, so a blackjack pays whole GOLD.';
    if (amt > MAX) return 'The table limit is ' + MAX + ' GOLD.';
    if (amt > credit) return 'Not enough credit for that bet.';
    return null;
  }
  function newRound(spots) {
    const R = { phase: 'deal', dealer: [], order: [], spots: {}, turn: null, cost: 0, settled: false };
    for (const [sn, bet] of spots) { if (!(bet > 0)) continue; R.order.push(sn); R.spots[sn] = { bet, ins: null, hands: [{ cards: [], bet, split: false, aces: false, done: false, doubled: false, surr: false }], cur: 0 }; }
    if (!R.order.length) R.phase = 'done';
    return R;
  }
  /* the next hand to play; a split hand gets its second card only when its turn comes (as at the table) */
  function nextTurn(R, draw) {
    for (const sn of R.order) { const S = R.spots[sn]; for (let i = 0; i < S.hands.length; i++) { const h = S.hands[i]; if (h.done) continue;
      if (h.cards.length === 1 && draw) { h.cards.push(draw()); if (total(h.cards).t === 21) { h.done = true; continue; } }
      S.cur = i; R.turn = sn; return; } }
    R.turn = null; R.phase = 'dealer';
  }
  function startPlay(R) {
    for (const sn of R.order) { const h = R.spots[sn].hands[0]; if (isBJ(h)) h.done = true; }
    R.phase = 'play'; nextTurn(R, null);
  }
  function deal(R, draw) {
    if (R.phase !== 'deal') return;
    for (const sn of R.order) R.spots[sn].hands[0].cards.push(draw());
    R.dealer.push(draw());
    for (const sn of R.order) R.spots[sn].hands[0].cards.push(draw());
    R.dealer.push(draw());
    const up = R.dealer[0][0];
    if (up === 'A') { R.phase = 'insurance'; return; }
    if (val(R.dealer[0]) === 10 && dealerBJ(R)) { R.phase = 'done'; return; }   /* the peek: blackjack ends it */
    startPlay(R);
  }
  function insure(R, sn, yes) {
    const S = R.spots[sn]; R.cost = 0;
    if (R.phase !== 'insurance' || !S || S.ins !== null) return 0;
    S.ins = yes ? S.bet / 2 : 0; R.cost = S.ins; return S.ins;
  }
  const allInsured = R => R.order.every(sn => R.spots[sn].ins !== null);
  function insuranceDone(R) {
    if (R.phase !== 'insurance') return;
    for (const sn of R.order) if (R.spots[sn].ins === null) R.spots[sn].ins = 0;
    if (dealerBJ(R)) { R.phase = 'done'; return; }
    startPlay(R);
  }
  function legalActs(R, sn, credit) {
    const no = { hit: false, stand: false, double: false, split: false, surrender: false };
    if (R.phase !== 'play' || R.turn !== sn) return no;
    const S = R.spots[sn], h = S.hands[S.cur], two = h.cards.length === 2, t = total(h.cards).t;
    if (h.done || t >= 21 && !two) return no;
    const pair = two && h.cards[0][0] === h.cards[1][0];   /* same rank (K-K yes, K-Q no), as the simulation */
    return { hit: !h.aces, stand: true, double: two && !h.aces && credit >= h.bet, split: pair && !h.aces && S.hands.length < MAX_HANDS && credit >= h.bet,
      surrender: two && !h.split && S.hands.length === 1 && !h.doubled };
  }
  function act(R, sn, a, draw, credit) {
    R.cost = 0;
    const L = legalActs(R, sn, credit == null ? Infinity : credit); if (!L[a]) return null;
    const S = R.spots[sn], h = S.hands[S.cur];
    if (a === 'hit') { h.cards.push(draw()); if (total(h.cards).t >= 21) h.done = true; }
    else if (a === 'stand') h.done = true;
    else if (a === 'double') { R.cost = h.bet; h.bet *= 2; h.doubled = true; h.cards.push(draw()); h.done = true; }
    else if (a === 'surrender') { h.surr = true; h.done = true; }
    else if (a === 'split') {
      R.cost = h.bet; const aces = h.cards[0][0] === 'A';
      const h2 = { cards: [h.cards.pop()], bet: h.bet, split: true, aces, done: false, doubled: false, surr: false };
      h.split = true; h.aces = aces; S.hands.splice(S.cur + 1, 0, h2);
      h.cards.push(draw());
      if (aces) { h2.cards.push(draw()); h.done = true; h2.done = true; }   /* one card each at once, and that is all */
      else if (total(h.cards).t === 21) h.done = true;
    }
    if (h.done) nextTurn(R, draw);
    return R.cost;
  }
  function dealerPlay(R, draw) {
    if (R.phase !== 'dealer') return;
    const live = R.order.some(sn => R.spots[sn].hands.some(h => !h.surr && total(h.cards).t <= 21 && !isBJ(h)));
    if (live) for (let g = 0; g < 20; g++) { const d = total(R.dealer); if (d.t > 17 || (d.t === 17 && !d.soft)) break; R.dealer.push(draw()); }
    R.phase = 'done';
  }
  function settle(R) {
    const pay = {}, lines = {};
    if (R.phase !== 'done' || R.settled) return { pay, lines };
    R.settled = true;
    const D = total(R.dealer), dBJ = dealerBJ(R);
    for (const sn of R.order) {
      const S = R.spots[sn]; let back = 0; const L = [];
      if (S.ins) { if (dBJ) { back += S.ins * 3; L.push(['Insurance pays ' + S.ins * 2 + '.', 'win']); } else L.push(['Insurance loses ' + S.ins + '.', 'lose']); }
      S.hands.forEach((h, i) => {
        const nm = S.hands.length > 1 ? 'Hand ' + (i + 1) : 'Your hand', P = total(h.cards);
        if (h.surr) { back += h.bet / 2; h.res = 'surrender'; L.push([nm + ': surrendered, half back (' + h.bet / 2 + ').', '']); return; }
        if (isBJ(h)) { if (dBJ) { back += h.bet; h.res = 'push'; L.push([nm + ': blackjack against blackjack, a push.', '']); } else { back += h.bet + h.bet * 3 / 2; h.res = 'bj'; L.push([nm + ': BLACKJACK pays ' + h.bet * 3 / 2 + '.', 'win']); } return; }
        if (P.t > 21) { h.res = 'bust'; L.push([nm + ': bust, loses ' + h.bet + '.', 'lose']); return; }
        if (dBJ) { h.res = 'lose'; L.push([nm + ': the dealer has blackjack, loses ' + h.bet + '.', 'lose']); return; }
        if (D.t > 21 || P.t > D.t) { back += h.bet * 2; h.res = 'win'; L.push([nm + ' (' + P.t + ') wins ' + h.bet + '.', 'win']); }
        else if (P.t === D.t) { back += h.bet; h.res = 'push'; L.push([nm + ' (' + P.t + ') pushes.', '']); }
        else { h.res = 'lose'; L.push([nm + ' (' + P.t + ') loses ' + h.bet + ' to ' + D.t + '.', 'lose']); }
      });
      pay[sn] = back; lines[sn] = L;
    }
    return { pay, lines, dealer: D.t, dealerBJ: dBJ };
  }

  const API = { MIN, MAX, DECKS, MAX_HANDS, val, total, isBJ, shoe, cutAt, legalBet, newRound, deal, insure, allInsured, insuranceDone, legalActs, act, dealerPlay, settle };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('twentyonerules', { api: 1, v: 1, needs: {} }, () => API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
