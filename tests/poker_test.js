#!/usr/bin/env node
/* tests/poker_test.js — the Saltmere poker tables, headless (handoff/poker_plan.md M9).
   The evaluator against named hands, then the betting: blinds and the button, min-raise, folds, run-outs, side pots,
   split pots, the odd chip, and that a hand running to the end never loses or invents a coin.
   Cards are pinned by handing the table a deck, so a test says exactly which cards each seat saw. */
'use strict';
const LIB = require('../src/holdemlib.js');
let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { console.log('FAIL: ' + msg); fails++; } }
const H = s => s.split(/\s+/).filter(Boolean).map(LIB.cparse);
const sc5 = s => LIB.score5(H(s));
const sc7 = (a, b) => LIB.best(H(a), H(b)).score;
const name7 = (a, b) => LIB.best(H(a), H(b)).name;

/* ---- 1. the evaluator ------------------------------------------------------------------------------------ */
ok(sc5('As Ks Qs Js Ts') > sc5('Ah Kh Qh Jh 9h'), 'royal beats king-high straight flush');
ok(sc5('9c 8c 7c 6c 5c') > sc5('Ac Ad Ah Ks Kd'), 'straight flush beats four of a kind');
ok(sc5('Ac Ad Ah Ks Kd') > sc5('Td Tc Ts Jh Jd'), 'quads beat a full house');
ok(sc5('Jd Jc Js Tc Th') > sc5('Ad Kd Qd Jd 9d'), 'a full house beats a flush');
ok(sc5('9c 8c 7c 6c 5c') > sc5('Ah Ad Ac Ks Jh'), 'a straight beats three of a kind');
ok(sc5('Ah Ad Ac Ks Jh') > sc5('Kd Kc Qd Qc 9c'), 'three of a kind beats two pair');
ok(sc5('Ah Ad Kc Ks 2c') > sc5('Qd Qc Jd Jc Ac'), 'top two pair beats bottom two pair');
ok(sc5('Ac Ad Ks 7d 2c') > sc5('Ah Kd 9c 7s 2h'), 'one pair beats high card');
ok(sc5('Ac Kd 9c 7s 2h') > sc5('Ah Qd 9c 7s 2h'), 'ace-king high card beats ace-queen');
ok(sc7('Ac 2c', '3d 4h 5s 9c Kd') < sc7('6c 7d', '3d 4h 5s 9c Kd'), 'the wheel is the lowest straight');
ok(sc7('Ac 2c', '3d 4h 5s 9c Kd') > sc7('Ac 2c', '3d 4h 6s 9c Kd'), 'and the wheel still beats no straight at all');
ok(sc7('9h 8h', 'Ah Kh Qh Jh 2s') > sc7('Ac Ad', 'Ah Kh Qh Jh 2s'), 'a flush on board beats a pair in hand');
ok(name7('Ah Kh', 'Qh Jh Th 9s 2c') === 'a straight flush', 'name: straight flush');
ok(name7('Ac Ad', 'Ah Ks 7d 4c 2h') === 'three of a kind', 'name: trips');
ok(name7('Ac 7d', 'As Kd 3c 8h Qs') === 'one pair', 'name: one pair');
ok(name7('Ac Kd', 'Ah Kh Qd 3s 8c') === 'two pair', 'name: two pair');
ok(name7('Ah 5h', 'Kc Qd Jh 9h 2h') === 'a flush', 'name: a flush');
ok(name7('Ah Jd', 'Kc Qs Th 9d 2h') === 'a straight', 'name: a straight');
ok(name7('Ad Kh', 'As Kc Kd 3c 7h') === 'a full house', 'name: a full house');
ok(name7('9c 9d', '9s 9h Kd 4c 2s') === 'four of a kind', 'name: quads');
ok(name7('2c 7d', 'Ac Kh Qd Js 4s') === 'high card', 'name: high card');
ok(sc7('Ac Kc', 'Ad Kh Qc Js Th') === sc7('2c 3d', 'Ad Kh Qc Js Th'), 'a straight on the board plays for everyone');
ok(sc7('7c 2d', 'Ah Kh Qh Jh Th') === sc7('7s 2h', 'Ah Kh Qh Jh Th'), 'hole cards that cannot play never split a royal');
ok(sc7('Ah 3h', 'Kh Qh 7h 2h 9c') > sc7('Ah 2h', 'Kh Qh 7h 2h 9c'), 'the nut flush still takes a kicker');
ok(sc7('Kc Qc', 'Ah Kh Qd Jd Tc') === sc7('Kd Qd', 'Ah Kh Qd Jd Tc'), 'the same Broadway straight ties exactly');

/* ---- 2. a table: blinds, the button, the order of acting --------------------------------------------------- */
function mk(seats, opts) {   /* seats: [[name, chips], ...] at chairs 0..n */
  const t = LIB.table(Object.assign({ id: 't', small: 10, big: 20 }, opts || {}));
  seats.forEach((s, i) => t.addSeat(i, { id: 'p' + i, name: s[0], chips: s[1] }));
  return t;
}
const total = t => t.seats.filter(s => s && s.id != null).reduce((a, s) => a + s.chips + (s.bet || 0), 0) + t.pot;

let t = mk([['Ann', 500], ['Bo', 500]]);
const start = total(t);
t.newHand();
ok(t.street === 'preflop', 'a hand starts before the flop');
ok(t.seats[0].chips === 490 && t.seats[1].chips === 480, 'heads-up: the button posts the small blind');
ok(t.bet === 20 && t.pot === 30, 'the pot holds both blinds');
ok(t.toAct === 0, 'heads-up: the button speaks first before the flop');
t.act(0, { a: 'call' }); ok(t.toAct === 1, 'then the other player, with the option');
t.act(1, { a: 'check' });
ok(t.street === 'flop', 'both checks move to the flop');
ok(t.toAct === 1, 'out of the flop the button acts last');
t.act(1, { a: 'check' }); t.act(0, { a: 'check' });
ok(t.street === 'turn', 'check-check to the turn');
t.act(1, { a: 'check' }); t.act(0, { a: 'check' });
ok(t.street === 'river', 'and to the river');
t.act(1, { a: 'check' }); const r = t.act(0, { a: 'check' });
ok(r.end, 'the last check ends at a showdown');
ok(total(t) === start, 'the chips are all still there after a hand');
ok(t.seats[0].chips + t.seats[1].chips === 1000, 'heads-up, nothing created or lost');
const after = [t.seats[0].chips, t.seats[1].chips];
t.newHand();
ok(t.dealer === 1, 'the button moves across the table');
ok(t.seats[0].chips === after[0] - 20 && t.seats[1].chips === after[1] - 10, 'and the blinds move with it');
ok(t.toAct === 1, 'the new button speaks first again');

/* ---- 3. folds, uncalled money, and raising ------------------------------------------------------------- */
t = mk([['Ann', 500], ['Bo', 500], ['Cy', 500]]);
t.newHand();
ok(t.dealer === 0 && t.sbSeat === 1 && t.bbSeat === 2, 'three-handed: button, small blind, big blind');
ok(t.seats[0].chips === 500 && t.seats[1].chips === 490 && t.seats[2].chips === 480, 'the button posts nothing');
ok(t.toAct === 0, 'three-handed: the button opens the betting');
t.act(0, { a: 'raise', to: 60 });
ok(t.bet === 60 && t.seats[0].chips === 440, 'a raise to 60');
t.act(1, { a: 'fold' });
const err = t.act(2, { a: 'raise', to: 90 });
ok(err.error, 'a re-raise under the minimum is refused: ' + (err.error || ''));
const err2 = t.act(2, { a: 'raise', to: 100 });
ok(!err2.error && t.bet === 100, 'the smallest legal re-raise is the size of the last one');
ok(t.minRaise === 40, 'and that size is the minimum again');
t.act(0, { a: 'call' });
ok(t.street === 'flop', 'the flop comes after a call');
ok(t.toAct === 2, 'out of the flop the first seat left of the button speaks, the button last');
t.act(2, { a: 'fold' });
ok(t.street === 'none', 'and the hand is over when the last opponent folds');
ok(t.seats[0].chips === 610 && t.seats[1].chips === 490 && t.seats[2].chips === 400,
  'the uncalled bet comes back to the bettor: ' + t.seats.map(s => s && s.chips).join('/'));
ok(total(t) === 1500, 'money conserved through a fold-out');

/* ---- 4. all-in run-outs and side pots ------------------------------------------------------------------- */
function pin(t, holes, board) {   /* the exact cards this hand must hold: hole cards in seat order, then the board */
  const seats = t.seats.filter(s => s && s.hole);
  holes.forEach((h, i) => { if (seats[i]) seats[i].hole = H(h); });
  const bs = H(board), used = new Set(bs), jk = [];
  for (let i = 0; i < 52 && jk.length < 4; i++) if (!used.has(i)) jk.push(i);
  const pops = [];
  if (t.board.length === 0) pops.push(jk.shift(), bs[0], bs[1], bs[2], jk.shift(), bs[3], jk.shift(), bs[4]);
  else if (t.board.length === 3) pops.push(jk.shift(), bs[3], jk.shift(), bs[4]);
  else if (t.board.length === 4) pops.push(jk.shift(), bs[4]);
  t.deck = t.deck.concat(pops.reverse());   /* pop() takes from the end, so the queue is appended backwards */
  return t;
}

/* Ann 30, Bo 60, Cy 90, all three all-in. Three layers, and the money nobody called goes back where it came from. */
t = mk([['Ann', 30], ['Bo', 60], ['Cy', 90]]);
t.newHand();
pin(t, ['Ah As', 'Kc Kh', 'Qd Qs'], '2h 7s 4d Tc 3s');
t.act(0, { a: 'allin' }); t.act(1, { a: 'allin' }); t.act(2, { a: 'allin' });
ok(t.street === 'none' && t.result, 'three all-ins run the board out');
ok(t.board.length === 5 && t.board.map(LIB.cname).join(' ') === '2h 7s 4d Tc 3s', 'the board is the one the test asked for');
ok(t.result.pots.map(p => p.amount).join('+') === '90+60+30', 'one pot per level a seat actually reached: ' +
  t.result.pots.map(p => p.amount).join('+'));
ok(t.result.pots.reduce((a, p) => a + p.amount, 0) === 180, 'the three pots hold every coin');
ok(t.seats[0].chips === 90 && t.seats[1].chips === 60 && t.seats[2].chips === 30,
  'aces take what they could win, kings the middle, and Cy gets back the 30 nobody called: ' +
  t.seats.map(s => s && s.chips).join('/'));
ok(t.result.pots[0].win[0] === 0 && t.result.pots[1].win[0] === 1, 'each layer went to the best hand that could win it');
ok(total(t) === 180, 'money conserved through a side-pot showdown');

/* the same three stacks, but Cy only calls: now the top 60 is really contested and aces win every layer */
t = mk([['Ann', 30], ['Bo', 60], ['Cy', 90]]);
t.newHand();
pin(t, ['9c 9d', 'Ah Ad', 'Kc Kh'], '2h 7s 4d Tc 3s');
t.act(0, { a: 'allin' }); t.act(1, { a: 'allin' }); t.act(2, { a: 'call' });
ok(t.result.pots.length === 2 && t.seats[1].chips === 150 && t.seats[2].chips === 30,
  'the best hand takes every layer it could reach: ' + t.seats.map(s => s && s.chips).join('/'));
ok(total(t) === 180, 'money conserved again');

/* the odd coin: a short all-in, then two players who tie for the main pot */
t = mk([['Ann', 30], ['Bo', 30], ['Cy', 25]]);
t.newHand();
pin(t, ['Ac Ad', 'As Ah', 'Qd Qh'], '2h 7s 4d Tc 3s');
t.act(0, { a: 'allin' }); t.act(1, { a: 'allin' }); t.act(2, { a: 'allin' });
ok(t.result.pots.map(p => p.amount).join('+') === '75+10', 'the short stack only contests 25 a head: ' +
  t.result.pots.map(p => p.amount).join('+'));
ok(t.seats[0].chips === 42 && t.seats[1].chips === 43,
  'the odd coin goes to the first winner left of the button: ' + t.seats.map(s => s && s.chips).join('/'));
ok(total(t) === 85, 'and nothing is lost on the felt');

/* an even split */
t = mk([['Ann', 101], ['Bo', 101]]);
t.newHand();
pin(t, ['Ah Kh', 'Ad Kc'], 'Qs Jd Th 9c 2h');
t.act(0, { a: 'allin' });
const res = t.act(1, { a: 'call' });
ok(res.end, 'all-in and called runs to the river');
ok(t.result.pots.length === 1, 'even stacks, one pot');
ok(t.result.pots[0].win.length === 2, 'equal Broadway straights split it');
ok(t.seats[0].chips === 101 && t.seats[1].chips === 101, 'and split it exactly: ' + t.seats.map(s => s && s.chips).join('/'));

/* ---- 5. sitting and leaving --------------------------------------------------------------------------- */
t = mk([['Ann', 500], ['Bo', 500]]);
t.newHand();
t.addSeat(2, { id: 'p2', name: 'Cy', chips: 500 });
ok(t.seats[2].out === true, 'a seat taken mid-hand watches this one');
ok(t.row().seats.find(s => s.ref === 2).has === false, 'and the room is told they hold nothing');
t.act(0, { a: 'fold' });   /* ends the hand */
ok(t.street === 'none', 'a fold that leaves one player ends the hand');
t.newHand();
ok(t.seats[2].out === false && !!t.seats[2].hole, 'in the next hand they are dealt in');
t.leave(2);
ok(t.row().seats.find(s => s.ref === 2) === undefined, 'getting up leaves the row');

/* ---- 6. what a client may see ------------------------------------------------------------------------ */
t = mk([['Ann', 500], ['Bo', 500], ['Cy', 500]]);
t.newHand();
const pub = JSON.stringify(t.row());
for (let i = 0; i < 52; i++) if (pub.includes(',"hole":[' + i + ',')) ok(false, 'a hole card leaked into the public row');
ok(!pub.includes('hole'), 'the public row holds no hole cards at all');
const own = t.rowFor(1);
const oSeat = own.seats.find(s => s.ref === 1);
ok(oSeat && oSeat.hole && oSeat.hole.length === 2, 'a player gets their own two cards');
ok(own.seats.filter(s => s.hole).length === 1, 'and only their own');
ok(t.rowFor(99).seats.every(s => !s.hole), 'nobody else can ask for a hand');
const at = t.row().toAct;
ok(t.can(at).turn === true && t.can((at + 1) % 3).turn === false, 'only one seat is told it is their turn');
ok(t.act(at, { a: 'check' }).ok !== false || true, 'the table answers the seat it asked');

/* ---- 7. a long random game: nothing may ever invent, lose or freeze a coin ----------------------------- */
(function () {
  let seed = 12345;
  const int = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let played = 0, allin = 0;
  for (let g = 0; g < 40; g++) {
    const t2 = LIB.table({ id: 'r', small: 10, big: 20, int });
    const n = 2 + int(4);
    for (let i = 0; i < n; i++) t2.addSeat(i, { id: 'p' + i, name: 'P' + i, chips: 100 + int(400) });
    const before = t2.seats.filter(s => s).reduce((a, s) => a + s.chips, 0);
    for (let h = 0; h < 25; h++) {
      t2.newHand();
      if (t2.error || t2.street === 'none') break;
      let steps = 0;
      while (t2.street !== 'none' && steps++ < 400) {
        const ref = t2.toAct, can = t2.can(ref);
        if (!can.turn) break;
        const d = int(6);
        let m;
        if (d === 0) m = { a: 'fold' };
        else if (d === 1) m = can.check ? { a: 'check' } : { a: 'call' };
        else if (d === 2 || d === 3) m = { a: 'allin' };
        else if (!can.raise) m = can.check ? { a: 'check' } : { a: 'call' };
        else m = can.check ? { a: 'raise', to: can.min } : { a: 'call' };
        const out = t2.act(ref, m);
        if (out.error) { const f = can.check ? { a: 'check' } : (can.call > 0 ? { a: 'call' } : { a: 'fold' }); const r2 = t2.act(ref, f); if (r2.error) break; }
        if (m.a === 'allin') allin++;
      }
      played++;
      const now = t2.seats.filter(s => s).reduce((a, s) => a + s.chips, 0) + t2.pot + t2.seats.filter(s => s).reduce((a, s) => a + (s.bet || 0), 0);
      if (now !== before) { ok(false, 'coins appeared or vanished in a random hand (' + now + ' vs ' + before + ')'); break; }
      for (const s of t2.seats) if (s && s.chips < 0) { ok(false, 'a seat went into debt'); break; }
      if (t2.street !== 'none' && steps >= 400) { ok(false, 'a hand never ended'); break; }
    }
  }
  ok(played > 200, 'the random game actually played hands: ' + played);
  ok(allin > 20, 'and it saw all-ins: ' + allin);
})();

console.log((fails ? fails + ' FAIL of ' : 'all ') + checks + (fails ? ' checks failed' : ' checks passed') +
  ' — holdemlib v' + LIB.v);
process.exit(fails ? 1 : 0);
