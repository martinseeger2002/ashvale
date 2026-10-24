/* [Claude 2026-10-20] the twenty-one table's rules (src/twentyonerules.js): the 2026-10-18 simulation's stacked-shoe checks for one
   spot, then a shared round with three spots (turn order, insurance for all, splits and doubles taking more credit), the shoe, and
   many random rounds where the money only moves by the rules.  node tests/twentyonerules_test.js */
'use strict';
const B = require('../src/twentyonerules.js');
let fails = 0; const ok = (c, m, got) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (c || got === undefined ? '' : '  got ' + JSON.stringify(got))); if (!c) fails++; };
const drawer = cards => { const q = cards.slice(); return () => { if (!q.length) throw new Error('shoe empty'); return q.shift(); }; };
/* one spot: plays = list of acts (or fns), ins = insurance answer; returns net, the hands, the dealer */
function round(bet, cards, plays, ins) {
  const draw = drawer(cards), R = B.newRound([['me', bet]]); let credit = 1000 - bet;
  B.deal(R, draw);
  if (R.phase === 'insurance') { credit -= B.insure(R, 'me', !!ins); B.insuranceDone(R, draw); }
  for (const p of plays || []) { if (typeof p === 'function') p(R, credit); else { const c = B.act(R, 'me', p, draw, credit); if (c == null) return { err: 'illegal ' + p }; credit -= c; } }
  if (R.phase === 'dealer') B.dealerPlay(R, draw);
  const s = B.settle(R); credit += s.pay.me || 0;
  return { net: credit - 1000, phase: R.phase, hands: R.spots.me.hands.map(h => ({ c: h.cards.map(c => c[0]).join(''), bet: h.bet, res: h.res })), dealer: R.dealer.map(c => c[0]).join(''), R };
}
let r;
r = round(10, ['TS', '6H', '8D', 'AC', '5C', '2D', 'TD'], ['stand']); ok(r.dealer === '6A52T' && r.net === 10, 'H17: dealer A-6 (soft 17) hits; 6A52 then T busts; 18 wins +10', r);
r = round(10, ['TS', '7H', '9D', 'AC'], ['stand']); ok(r.dealer === '7A' && r.net === 10, 'dealer stands on soft 18; 19 wins +10');
r = round(10, ['TS', 'TH', '8D', '7C'], ['stand']); ok(r.dealer === 'T7' && r.net === 10, 'dealer stands on hard 17; 18 wins');
r = round(10, ['TS', 'TH', '8D', '8C'], ['stand']); ok(r.net === 0 && r.hands[0].res === 'push', 'a push returns the bet');
r = round(10, ['AS', '9H', 'KD', '7C'], []); ok(r.net === 15 && r.phase === 'done' && r.hands[0].res === 'bj', 'blackjack pays 3 to 2 (+15)', r);
r = round(10, ['TS', 'KH', '9D', 'AC'], []); ok(r.net === -10 && r.phase === 'done' && r.dealer === 'KA', 'the peek under a ten: dealer blackjack ends it, you lose only the bet');
r = round(10, ['TS', '9H', '9D', 'AC'], [(R) => ok(R.phase === 'play', '9 up: no peek, play goes on')]);
r = round(10, ['TS', 'AH', '9D', 'KC'], [], true); ok(r.net === 0 && r.phase === 'done', 'Ace up, insurance 5, dealer blackjack: insurance 2:1 covers the bet', r);
r = round(10, ['TS', 'AH', 'KD', '8C'], ['stand'], true); ok(r.net === 5, 'insurance lost, 20 beats 19: +10 - 5', r);
r = round(10, ['TS', 'AH', 'KD', '8C'], ['stand'], false); ok(r.net === 10, 'insurance declined, 20 beats 19: +10');
r = round(10, ['AS', 'AH', 'KD', 'KC'], [], true); ok(r.net === 10, 'even money: blackjack against Ace-up blackjack, insured: +10', r);
r = round(10, ['AS', 'AH', 'KD', '5C'], [], true); ok(r.net === 10, 'even money: blackjack against Ace up, no dealer blackjack, insured: +10', r);
r = round(10, ['AS', 'AH', 'KD', 'KC'], [], false); ok(r.net === 0 && r.hands[0].res === 'push', 'blackjack against dealer blackjack, no insurance: a push');
r = round(10, ['AS', '9H', 'AD', '7C', 'KH', '5S', '4D'], ['split']); ok(JSON.stringify(r.hands) === JSON.stringify([{ c: 'AK', bet: 10, res: 'win' }, { c: 'A5', bet: 10, res: 'lose' }]) && r.net === 0 && r.dealer === '974', 'split Aces: one card each; A-K = 21 pays 1:1; dealer 9-7-4 = 20', r);
r = round(10, ['AS', '9H', 'AD', '7C', 'AH', '5S', 'KD'], ['split', (R) => ok(R.phase === 'dealer', 'split Aces: no resplit, straight to the dealer')]);
{ const draw = drawer(['8S', '9H', '8D', '7C', '8H', '8C', '8D', 'TS', 'TH', 'TD', 'TC', '2S']), R = B.newRound([['me', 10]]); B.deal(R, draw);
  let spent = 0; spent += B.act(R, 'me', 'split', draw, 1000); ok(R.spots.me.hands.length === 2 && B.legalActs(R, 'me', 1000).split, '8-8 split, an 8 lands: resplit allowed');
  spent += B.act(R, 'me', 'split', draw, 1000); ok(R.spots.me.hands.length === 3 && B.legalActs(R, 'me', 1000).split, 'resplit again (3 hands)');
  spent += B.act(R, 'me', 'split', draw, 1000); ok(R.spots.me.hands.length === 4 && !B.legalActs(R, 'me', 1000).split, 'four hands: no more splits');
  ok(spent === 30, 'each split takes another bet from the credit (30)'); }
{ const R = B.newRound([['me', 10]]); B.deal(R, drawer(['KS', '9H', 'QD', '7C'])); ok(!B.legalActs(R, 'me', 100).split, 'K-Q is not a pair'); }
{ const R = B.newRound([['me', 10]]); B.deal(R, drawer(['KS', '9H', 'KD', '7C'])); ok(B.legalActs(R, 'me', 100).split && !B.legalActs(R, 'me', 5).split && !B.legalActs(R, 'me', 5).double, 'K-K is a pair; no split or double without the credit for it'); }
r = round(10, ['9S', '6H', '9D', 'TC', '2H', 'TD', '5S', '4C'], ['split', 'double', 'stand']); ok(JSON.stringify(r.hands.map(h => [h.c, h.bet, h.res])) === JSON.stringify([['92T', 20, 'win'], ['95', 10, 'lose']]) && r.dealer === '6T4' && r.net === 10, 'double after a split: 9-2 doubles to 21; 9-5 stands; dealer 6-T-4 = 20', r);
r = round(10, ['6S', 'TH', '5D', '7C', '9H'], ['double']); ok(r.hands[0].c === '659' && r.hands[0].bet === 20 && r.net === 20, 'double on 11: one card, 20 beats 17', r);
r = round(10, ['TS', 'TH', '6D', '7C'], ['surrender']); ok(r.net === -5 && r.dealer === 'T7', 'late surrender: half back, the dealer does not draw', r);
{ const R = B.newRound([['me', 10]]), d = drawer(['TS', 'TH', '2D', '7C', '3H']); B.deal(R, d); B.act(R, 'me', 'hit', d, 100); ok(!B.legalActs(R, 'me', 100).surrender, 'no surrender after a hit'); }
r = round(10, ['TS', '6H', '6D', 'TC', 'TH'], ['hit']); ok(r.net === -10 && r.dealer === '6T', 'a bust loses; the dealer does not draw when every hand is bust');
r = round(10, ['8S', 'TH', '8D', '6C', 'KH', 'TS', '9H', 'TD'], ['split', 'hit', 'stand']); ok(JSON.stringify(r.hands.map(h => h.res)) === '["bust","win"]' && r.net === 0, 'a bust loses even when the dealer busts after', r);
{ const R = B.newRound([['me', 10]]), d = drawer(['5S', 'TH', '6D', '7C', 'KH', '2C']); B.deal(R, d); B.act(R, 'me', 'hit', d, 100); ok(R.phase === 'dealer', '21 after a hit stands by itself'); }
ok(B.legalBet(1, 100) && B.legalBet(3, 100) && B.legalBet(502, 1000) && B.legalBet(10, 8) && B.legalBet(10, 100) === null && B.legalBet(500, 500) === null, 'bets: even, 2 to 500, within the credit');
{ let s = 3; const ri = n => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s % n; }; const sh = B.shoe(ri), cnt = {};
  for (const c of sh) cnt[c] = (cnt[c] || 0) + 1; ok(sh.length === 312 && Object.keys(cnt).length === 52 && Object.values(cnt).every(v => v === 6), 'six decks: 312 cards, each six times');
  const cut = B.cutAt(ri); ok(cut >= 312 * 0.72 && cut <= 312 * 0.78, 'the cut card goes 72-78% down (' + cut + ')'); }
/* a shared round: three spots in table order */
{ const d = drawer(['TS', '8S', '5S', 'AH', '6H', '8D', '6D', '7C', /* b's split hands: */ '3C', '9C']), R = B.newRound([['a', 10], ['b', 20], ['c', 0], ['d', 30]]);
  B.deal(R, d);
  ok(R.order.join() === 'a,b,d' && R.phase === 'insurance', 'three spots with bets dealt in table order (the empty spot skipped); Ace up: insurance for all');
  ok(B.insure(R, 'a', true) === 5 && B.insure(R, 'a', true) === 0 && B.insure(R, 'b', false) === 0, 'each answers insurance once (a: 5, b: no)');
  B.insuranceDone(R, d); ok(R.spots.d.ins === 0 && R.phase === 'play' && R.turn === 'a', 'the clock ran out for d (no insurance); no dealer blackjack: a plays first');
  ok(B.act(R, 'b', 'stand', d, 100) === null, 'b cannot play out of turn');
  B.act(R, 'a', 'stand', d, 100); ok(R.turn === 'b', 'then b');
  B.act(R, 'b', 'split', d, 100); ok(R.spots.b.hands.length === 2 && R.turn === 'b' && R.spots.b.hands[1].cards.length === 1, 'b splits 8-8: the second hand waits for its card until its turn');
  B.act(R, 'b', 'stand', d, 100); B.act(R, 'b', 'stand', d, 100); ok(R.turn === 'd', 'then d');
  B.act(R, 'd', 'stand', d, 100); ok(R.phase === 'dealer', 'everyone done: the dealer plays');
  B.dealerPlay(R, d); const s = B.settle(R);
  ok(R.dealer.join(' ') === 'AH 7C' && JSON.stringify(s.pay) === '{"a":0,"b":0,"d":0}' && R.spots.b.hands.map(h => h.cards.join('')).join() === '8S3C,8D9C', 'dealer A-7 stands on soft 18: a 16, b 11 and 17, d 11 all lose; insurance (a) lost', s.pay);
  ok(B.settle(R).pay.a === undefined, 'a round settles once');
  console.log('     pays', JSON.stringify(s.pay), JSON.stringify(R.spots.b.hands.map(h => h.cards.join(' ') + ' ' + h.res)));
}
/* random rounds at a table of four: money only moves by the rules, every round ends */
{ let s = 11; const ri = n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s % n; };
  let sh = B.shoe(ri), pos = 0, cut = B.cutAt(ri); const draw = () => sh[pos++];
  const credit = { a: 1e6, b: 1e6, c: 1e6, d: 1e6 }, start = 4e6; let bad = 0, rounds = 0, staked = 0, net = 0;
  for (let i = 0; i < 20000; i++) {
    if (pos >= cut) { sh = B.shoe(ri); pos = 0; cut = B.cutAt(ri); }
    const spots = Object.keys(credit).map(sn => [sn, 2 * (1 + ri(50))]); for (const [sn, b] of spots) { credit[sn] -= b; staked += b; }
    const R = B.newRound(spots); B.deal(R, draw);
    if (R.phase === 'insurance') { for (const sn of R.order) if (ri(3) === 0) credit[sn] -= B.insure(R, sn, true); B.insuranceDone(R, draw); }
    let guard = 0;
    while (R.phase === 'play' && guard++ < 200) { const sn = R.turn, S = R.spots[sn], h = S.hands[S.cur], t = B.total(h.cards).t, L = B.legalActs(R, sn, credit[sn]);
      const a = L.split && ri(2) ? 'split' : L.double && t >= 9 && t <= 11 ? 'double' : L.surrender && t === 16 && ri(4) === 0 ? 'surrender' : L.hit && t < 17 ? 'hit' : 'stand';
      credit[sn] -= B.act(R, sn, a, draw, credit[sn]); }
    if (R.phase === 'dealer') B.dealerPlay(R, draw);
    const st = B.settle(R); for (const sn in st.pay) credit[sn] += st.pay[sn];
    rounds++; if (R.phase !== 'done' || Object.values(credit).some(c => !Number.isInteger(c) || c < 0)) bad++;
  }
  net = Object.values(credit).reduce((a, b) => a + b, 0) - start;
  ok(!bad, rounds + ' random rounds at a table of four end cleanly, credit always whole GOLD');
  console.log('     house edge for this (loose) random strategy: ' + (-net / staked * 100).toFixed(2) + '% of the first bets');
}

/* basic strategy (6 decks, H17, double after split, late surrender) over many rounds: the house edge should come out near the
   textbook ~0.6-0.7% for these rules (a wrong payout or draw rule moves it by whole percents) */
{ const up = c => B.val(c) === 11 ? 1 : B.val(c);
  function play(h, d, L) {   /* d = the dealer's up card value 2..10, 1 = Ace */
    const T = B.total(h.cards), t = T.t, two = h.cards.length === 2;
    if (L.surrender && !T.soft && ((t === 16 && (d >= 9 || d === 1)) || (t === 15 && (d === 10 || d === 1)) || (t === 17 && d === 1))) return 'surrender';
    if (L.split) { const r = h.cards[0][0], v = B.val(h.cards[0]);
      if (r === 'A' || r === '8') return 'split';
      if (v === 9 && [2, 3, 4, 5, 6, 8, 9].includes(d)) return 'split';
      if ((v === 2 || v === 3 || v === 7) && d >= 2 && d <= 7) return 'split';
      if (v === 6 && d >= 2 && d <= 6) return 'split';
      if (v === 4 && (d === 5 || d === 6)) return 'split'; }
    if (T.soft) {
      if (L.double && two && ((t === 13 || t === 14) && d >= 5 && d <= 6 || (t === 15 || t === 16) && d >= 4 && d <= 6 || t === 17 && d >= 3 && d <= 6 || t === 18 && d >= 2 && d <= 6 || t === 19 && d === 6)) return 'double';
      if (t >= 19) return 'stand'; if (t === 18) return d >= 9 || d === 1 ? 'hit' : 'stand'; return 'hit'; }
    if (L.double && two && (t === 11 || (t === 10 && d >= 2 && d <= 9) || (t === 9 && d >= 3 && d <= 6))) return 'double';
    if (t >= 17) return 'stand'; if (t >= 13) return d >= 2 && d <= 6 ? 'stand' : 'hit'; if (t === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit'; return 'hit';
  }
  let s = 2024; const ri = n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s >>> 8) % n; };
  let sh = B.shoe(ri), pos = 0, cut = B.cutAt(ri); const draw = () => sh[pos++];
  let staked = 0, net = 0;
  for (let i = 0; i < 400000; i++) {
    if (pos >= cut) { sh = B.shoe(ri); pos = 0; cut = B.cutAt(ri); }
    const R = B.newRound([['me', 10]]); let c = -10; staked += 10; B.deal(R, draw);
    if (R.phase === 'insurance') B.insuranceDone(R, draw);
    let g = 0; while (R.phase === 'play' && g++ < 50) { const S = R.spots.me, h = S.hands[S.cur]; c -= B.act(R, 'me', play(h, up(R.dealer[0]), B.legalActs(R, 'me', 1e9)), draw, 1e9); }
    if (R.phase === 'dealer') B.dealerPlay(R, draw);
    c += B.settle(R).pay.me || 0; net += c;
  }
  console.log('     rounds staked', staked / 10);
  const e = -net / staked; ok(e > 0.002 && e < 0.012, 'basic strategy over 400,000 rounds: house edge ' + (e * 100).toFixed(2) + '% (textbook ~0.6-0.7% for these rules)');
}
process.exit(fails ? 1 : 0);
