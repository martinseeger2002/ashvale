/* ASHVALE 3D module 'holdemlib' (api 1): the rules of no-limit Texas Hold'em for the Saltmere poker tables
   (handoff/poker_plan.md, 2026-10-11). Like chesslib this is pure rules - no DOM, no three.js, no ASHVALE state -
   so core.js can drive it deterministically on the host of a zone and a node test can require it directly.
   The rules are the standard ones. ptwu/distributed-texasholdem is unlicensed (holdem-ref/NOTES.md), so nothing is
   copied from it; it was read only for the shape of the problem - an integer hand score, the all-in line, and pots
   layered by what each player actually put in.
   Everything random goes through opts.int(n), which core.js hands in as its own seeded R.int(n), so a hand replays the
   same way on another device. Money is whole units (in-game GOLD). A pot that cannot split evenly gives its odd chip to
   the first eligible seat to the left of the button, which is the usual rule and what the tests pin.
   Card ids are 0..51: id = rank*4 + suit, rank 0..12 = 2,3..9,T,J,Q,A, suit 0..3 = clubs, diamonds, hearts, spades.
   What may be seen is split on purpose: row() is the row for the whole room, rowFor(ref) adds that one seat's two hole
   cards. Only rowFor ever goes to the seat that owns them - poker is the first game in the world with hidden
   information, and a room broadcast is public (handoff/poker_plan.md §2.4). */
(function (G) {
  'use strict';

  const SUITS = 'cdhs', RANKN = '23456789TJQKA';
  const CATS = ['high card', 'one pair', 'two pair', 'three of a kind', 'a straight', 'a flush', 'a full house',
    'four of a kind', 'a straight flush'];
  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const CAT0 = 1 << 20;   /* the category sits above five rank nibbles, so a bigger score is always the better hand */

  const rk = id => (id >> 2) + 2;   /* 2..14 - the ace is 14 and the wheel is looked for by name */
  const ft = id => id & 3;
  function cname(id) { return RANKN[id >> 2] + SUITS[id & 3]; }
  function cparse(s) {
    const r = RANKN.indexOf(String(s[0]).toUpperCase()), f = SUITS.indexOf(String(s[1]).toLowerCase());
    return (r < 0 || f < 0) ? -1 : r * 4 + f;
  }

  const SUB = {};
  function subsets(n, k) {   /* every k-subset of 0..n-1, built once and kept */
    const key = n + ':' + k; if (SUB[key]) return SUB[key];
    const out = [];
    (function walk(from, pick) {
      if (pick.length === k) return out.push(pick.slice());
      for (let i = from; i <= n - (k - pick.length); i++) { pick.push(i); walk(i + 1, pick); pick.pop(); }
    })(0, []);
    return SUB[key] = out;
  }

  function score5(c) {   /* five card ids -> one comparable integer */
    const R = [rk(c[0]), rk(c[1]), rk(c[2]), rk(c[3]), rk(c[4])].sort((a, b) => b - a);   /* high card first */
    const flush = ft(c[0]) === ft(c[1]) && ft(c[1]) === ft(c[2]) && ft(c[2]) === ft(c[3]) && ft(c[3]) === ft(c[4]);
    let straight = true, wheel = false;
    for (let i = 1; i < 5; i++) if (R[i] !== R[0] - i) straight = false;
    if (!straight && R[0] === 14 && R[1] === 5 && R[2] === 4 && R[3] === 3 && R[4] === 2) straight = wheel = true;
    if (wheel) R[0] = 5, R[1] = 4, R[2] = 3, R[3] = 2, R[4] = 1;   /* the wheel is a five-high straight */
    const n = {}; for (let i = 0; i < 5; i++) n[R[i]] = (n[R[i]] || 0) + 1;
    const grp = Object.keys(n).map(k => [n[k], +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);   /* by count, then rank */
    let cat, seq;
    if (straight && flush) cat = 8, seq = R;
    else if (grp[0][0] === 4) cat = 7, seq = [grp[0][1], grp[0][1], grp[0][1], grp[0][1], grp[1][1]];
    else if (grp[0][0] === 3 && grp[1][0] === 2) cat = 6, seq = [grp[0][1], grp[0][1], grp[0][1], grp[1][1], grp[1][1]];
    else if (flush) cat = 5, seq = R;
    else if (straight) cat = 4, seq = R;
    else if (grp[0][0] === 3) cat = 3, seq = [grp[0][1], grp[0][1], grp[0][1], grp[1][1], grp[2][1]];
    else if (grp[1] && grp[1][0] === 2) cat = 2, seq = [grp[0][1], grp[0][1], grp[1][1], grp[1][1], grp[2][1]];
    else if (grp[0][0] === 2) cat = 1, seq = [grp[0][1], grp[0][1], grp[1][1], grp[2][1], grp[3][1]];
    else cat = 0, seq = R;
    return cat * CAT0 + seq[0] * 65536 + seq[1] * 4096 + seq[2] * 256 + seq[3] * 16 + seq[4];
  }

  function score7(ids) {   /* the best five of 5, 6 or 7 cards */
    let hi = -1, five = null;
    for (const c of subsets(ids.length, 5)) {
      const pick = c.map(i => ids[i]), sc = score5(pick);
      if (sc > hi) hi = sc, five = pick;
    }
    const cat = Math.floor(hi / CAT0);
    return { score: hi, five, cat, name: CATS[cat] };
  }
  function best(hole, board) { return score7((hole || []).concat(board || [])); }
  function describe(r) {   /* words a player can read */
    if (!r || !r.five) return 'no hand';
    const five = r.five.slice().sort((a, b) => (b >> 2) - (a >> 2) || ft(a) - ft(b));
    return r.name + ' (' + five.map(cname).join(' ') + ')';
  }

  /* ---- a table -------------------------------------------------------------------------------------------- */
  function table(opts) {
    const O = opts || {}, rnd = O.int || ((n) => Math.floor(Math.random() * n));
    const SB = O.small || 10, BB = O.big || SB * 2;
    const T = {
      id: O.id || 'poker', seats: [], board: [], deck: [], street: 'none', pot: 0, bet: 0, minRaise: BB,
      dealer: -1, hand: 0, toAct: -1, status: 'open', result: null, log: [], small: SB, big: BB, sbSeat: -1, bbSeat: -1
    };
    T.say = (text, by) => { T.log.push({ t: text, by: by || '' }); if (O.tell) O.tell(text, by || ''); return T; };

    const seated = () => T.seats.filter(s => s && s.id && s.in);
    const dealt = () => T.seats.filter(s => s && s.id && s.in && s.hole);
    const cards = () => dealt().filter(s => !s.out);
    const live = () => cards().filter(s => !s.folded);
    const able = () => live().filter(s => !s.allin);
    /* Three orders, and mixing them up is the classic poker bug. fromBtn starts AT the button: the order the blinds go
       and the cards are dealt. byBtn starts at the seat to the button's left and puts the button LAST: the betting
       order on every street after the flop, and who gets an odd chip. byTurn is the betting order - before the flop it
       runs from the seat left of the big blind, with the big blind answering last; after the flop it is byBtn. */
    const rel = (s, from) => ((((s.ref - from + 98) % 99) + 99) % 99);
    const pos = s => rel(s, T.dealer);
    const dpos = s => ((((s.ref - T.dealer) % 99) + 99) % 99);
    const byBtn = (a, b) => pos(a) - pos(b);
    const fromBtn = (a, b) => dpos(a) - dpos(b);
    const byTurn = (a, b) => rel(a, T.street === 'preflop' ? T.bbSeat : T.dealer) - rel(b, T.street === 'preflop' ? T.bbSeat : T.dealer);
    T.seatsIn = () => cards().slice().sort(byBtn);

    T.addSeat = (ref, who) => {   /* take the chair: ref is the world seat number, who is {id, name, chips} */
      const s = T.seats[ref] || (T.seats[ref] = { ref });
      if (who) { if (who.id != null) s.id = who.id; if (who.name != null) s.name = who.name;
        if (who.chips != null) s.chips = who.chips; }
      s.in = true; s.out = T.street !== 'none';
      if (s.hole === undefined) s.hole = null;
      if (s.chips == null) s.chips = 0;
      s.bet = 0; s.folded = false; s.allin = false; s.acted = false; s.showdown = false; s.won = s.won || 0;
      if (T.street !== 'none') T.say((s.name || 'Someone') + ' sits down and waits for the next hand.', 'sys');
      return s;
    };
    T.leave = (ref) => {   /* get up. Cards in the air means the hand is folded - Robert's Rules */
      const s = T.seats[ref]; if (!s || !s.id) return T;
      const name = s.name;
      if (T.street !== 'none' && s.hole && !s.out && !s.folded) {
        T.say((name || 'A player') + ' gets up - their hand is folded.', 'sys');
        s.folded = true; afterAction();
      }
      s.in = false; s.id = null; s.name = null; s.hole = null; s.bet = 0; s.folded = false; s.allin = false; s.out = false;
      return T;
    };

    function shuffle() {   /* Fisher-Yates over the seeded rng, so the hand can be replayed */
      const d = []; for (let i = 0; i < 52; i++) d.push(i);
      for (let i = 51; i > 0; i--) { const j = rnd(i + 1), t = d[i]; d[i] = d[j]; d[j] = t; }
      return d;
    }
    const pop = () => T.deck.pop();
    const burn = () => T.deck.pop();

    T.newHand = () => {   /* move the button, post the blinds, deal two to each seat */
      const pl = seated().filter(s => s.chips > 0);
      if (pl.length < 2) { T.status = 'open'; T.street = 'none'; return { error: 'nobody to play against' }; }
      T.hand++; T.street = 'preflop'; T.status = 'playing'; T.board = []; T.pot = 0; T.bet = 0; T.minRaise = BB;
      T.result = null; T.deck = shuffle();
      for (const s of T.seats) if (s) { s.hole = null; s.bet = 0; s.committed = 0; s.folded = false; s.allin = false;
        s.won = 0; s.out = true; s.showdown = false; s.acted = false; s.score = 0; s.rank = null; }
      let d = T.dealer, guard = 0;
      do { d = (d + 1) % T.seats.length; guard++; }
      while (guard < 400 && !(T.seats[d] && T.seats[d].id && T.seats[d].in && T.seats[d].chips > 0));
      if (!(T.seats[d] && T.seats[d].id && T.seats[d].in && T.seats[d].chips > 0)) d = pl.slice().sort(fromBtn)[0].ref;
      T.dealer = d;
      const btn = pl.slice().sort(fromBtn);   /* the button, then the rest clockwise: the order blinds and cards go */
      T.say('Hand ' + T.hand + '. ' + (btn[0].name || 'Someone') + ' is on the button.', 'sys');
      T.sbSeat = (btn.length === 2 ? btn[0] : btn[1]).ref;
      T.bbSeat = (btn.length === 2 ? btn[1] : btn[2]).ref;
      post(T.seats[T.sbSeat], SB, 'small blind');
      post(T.seats[T.bbSeat], BB, 'big blind');
      T.bet = BB; T.minRaise = BB;
      for (const s of btn) s.hole = [pop(), pop()];
      for (const s of T.seats) if (s && s.id && s.in) s.out = !s.hole;
      T.toAct = nextActor() == null ? -1 : nextActor();
      return { dealt: true, toAct: T.toAct };
    };

    function post(s, want, why) {
      if (!s) return 0;
      const n = Math.min(want, s.chips); s.chips -= n; s.bet += n; s.committed += n; T.pot += n;
      if (s.chips === 0) s.allin = true;
      T.say((s.name || 'Someone') + ' posts the ' + why + (s.allin ? ' all-in (' + n + ')' : ' (' + n + ')') + '.', 'sys');
      return n;
    }
    const seatOf = (ref) => T.seats[ref];

    T.can = (ref) => {   /* what the HUD needs to light up its own buttons */
      const s = seatOf(ref), out = { turn: false, fold: false, check: false, call: 0, raise: false, min: 0, max: 0, bet: T.bet };
      if (!s || !s.id || T.status !== 'playing' || T.street === 'none') return out;
      out.turn = T.toAct === ref && !s.folded && !s.allin && !s.out;
      if (!out.turn) return out;
      const need = Math.max(0, T.bet - s.bet), upTo = s.bet + s.chips;
      out.call = Math.min(need, s.chips); out.check = need === 0; out.fold = true;
      out.raise = upTo > T.bet;
      out.min = Math.min(T.bet + T.minRaise, upTo);   /* an all-in for less than a full raise is still legal */
      out.max = upTo;
      return out;
    };

    T.act = (ref, m) => {   /* the one way in: {a:'fold'|'check'|'call'|'raise'|'allin', to} */
      const s = seatOf(ref);
      if (T.status !== 'playing' || T.street === 'none') return { error: "There's no hand running." };
      if (!s || !s.id) return { error: 'You are not at this table.' };
      if (T.toAct !== ref) return { error: "It's not your turn." };
      if (s.out) return { error: 'You sat down after the cards went out.' };
      if (s.folded) return { error: 'Your hand is folded.' };
      if (s.allin) return { error: 'You are already all-in.' };
      const need = Math.max(0, T.bet - s.bet), kind = (m && m.a) || 'check';
      if (kind === 'fold') { T.say((s.name || 'A player') + ' folds.', 'sys'); s.folded = true; return afterAction(); }
      if (kind === 'check') {
        if (need > 0) return { error: 'You owe ' + need + ' - call or fold.' };
        s.acted = true; T.say((s.name || 'A player') + ' checks.', 'sys'); return afterAction();
      }
      if (kind === 'call') {
        const n = Math.min(need, s.chips); s.chips -= n; s.bet += n; s.committed += n; T.pot += n;
        if (s.chips === 0) s.allin = true;
        s.acted = true;
        T.say((s.name || 'A player') + (s.allin ? ' calls all-in (' + s.bet + ').' : ' calls ' + n + '.'), 'sys');
        return afterAction();
      }
      const upTo = s.bet + s.chips;
      if (kind !== 'raise' && kind !== 'allin') return { error: 'What do you want to do?' };
      let to = kind === 'allin' ? upTo : (m.to == null ? 0 : Math.floor(m.to));
      if (to > upTo) to = upTo;
      if (to <= T.bet) {   /* an all-in that cannot cover the bet in front of you is a call with everything you have */
        if (kind !== 'allin' || upTo <= s.bet) return { error: 'A raise has to beat ' + T.bet + '.' };
        const rest = upTo - s.bet; s.chips = 0; s.bet += rest; s.committed += rest; T.pot += rest;
        s.allin = true; s.acted = true;
        T.say((s.name || 'A player') + ' calls all-in (' + s.bet + ').', 'sys');
        return afterAction();
      }
      if (to !== upTo && to < T.bet + T.minRaise) return { error: 'The smallest raise just now is to ' + (T.bet + T.minRaise) + ' - or all-in.' };
      const n = to - s.bet;
      T.minRaise = Math.max(BB, to - T.bet); T.bet = to;
      for (const o of cards()) if (!o.folded) o.acted = (o === s);   /* everyone else gets another look */
      s.chips -= n; s.bet += n; s.committed += n; T.pot += n;
      if (s.chips === 0) s.allin = true;
      T.say((s.name || 'A player') + (s.allin ? ' raises all-in (' + to + ').' : ' raises to ' + to + '.'), 'sys');
      return afterAction();
    };

    function nextActor() {   /* someone still owing a chip, or one that has not answered since the last raise */
      const l = able().slice().sort(byTurn);
      const owing = l.find(s => s.bet < T.bet); if (owing) return owing.ref;
      const next = l.find(s => !s.acted); if (next) return next.ref;
      return null;
    }
    function afterAction() {
      if (live().length <= 1) return settle();
      if (!able().length) return runout();
      const a = nextActor();
      if (a === null) return advance();
      T.toAct = a;
      return { ok: true, toAct: a };
    }
    function dealStreet(n, name) {
      burn();
      for (let i = 0; i < n; i++) T.board.push(pop());
      T.say(name + ': ' + T.board.map(cname).join(' ') + '.', 'sys');
    }
    function advance() {   /* one street finished: clear what is owed, deal, and let the seats answer again */
      for (const s of dealt()) s.bet = 0;
      T.bet = 0; T.minRaise = BB;
      if (T.street === 'preflop') { T.street = 'flop'; dealStreet(3, 'Flop'); }
      else if (T.street === 'flop') { T.street = 'turn'; dealStreet(1, 'Turn'); }
      else if (T.street === 'turn') { T.street = 'river'; dealStreet(1, 'River'); }
      else return settle();
      for (const s of cards()) s.acted = false;
      if (!able().length) return runout();
      T.toAct = able().slice().sort(byBtn)[0].ref;
      return { ok: true, street: T.street, toAct: T.toAct };
    }
    function runout() {   /* everyone still in is all-in: the board runs to the river with nobody left to bet */
      for (let g = 0; g < 5 && T.board.length < 5; g++) {
        if (T.board.length === 0) { T.street = 'flop'; dealStreet(3, 'Flop'); }
        else if (T.board.length === 3) { T.street = 'turn'; dealStreet(1, 'Turn'); }
        else { T.street = 'river'; dealStreet(1, 'River'); }
      }
      return settle();
    }

    function settle() {   /* pay from the bottom up: one pot per level a player actually committed to */
      T.street = 'none'; T.toAct = -1;
      const who = cards(), left = live();
      for (const s of who) { s.showdown = false; s.acted = false;
        if (!s.folded && s.hole) { s.rank = best(s.hole, T.board); s.score = s.rank.score; s.showdown = true; } }
      const pots = [];
      if (left.length <= 1) {   /* nobody to show down against - the pot, uncalled money included, goes across */
        const w = left[0] || who.find(s => !s.folded);
        if (w && T.pot > 0) { w.chips += T.pot; w.won += T.pot; pots.push({ amount: T.pot, win: [w.ref], who: [w.name], note: 'uncontested' }); }
      } else {
        const lv = []; for (const s of who) if (s.committed > 0 && lv.indexOf(s.committed) < 0) lv.push(s.committed);
        lv.sort((a, b) => a - b);
        let prev = 0;
        for (const L of lv) {
          let amt = 0; for (const s of who) amt += Math.max(0, Math.min(s.committed, L) - prev);
          if (amt > 0) pots.push({ amount: amt, elig: who.filter(s => !s.folded && s.committed >= L) });
          prev = L;
        }
        let sum = 0; for (const p of pots) sum += p.amount;
        if (sum !== T.pot && pots.length) pots[pots.length - 1].amount += T.pot - sum;   /* never lose a chip to rounding */
        for (const p of pots) {
          const e = p.elig && p.elig.length ? p.elig : left.slice(0, 1);
          let top = -1; for (const s of e) if (s.score > top) top = s.score;
          const w = e.filter(s => s.score === top);
          const share = Math.floor(p.amount / w.length);
          for (const x of w) { x.chips += share; x.won += share; }
          let odd = p.amount - share * w.length;
          if (odd > 0) { const first = w.slice().sort(byBtn)[0]; first.chips += odd; first.won += odd; }
          p.win = w.map(x => x.ref); p.who = w.map(x => x.name); p.score = top; delete p.elig;
        }
        for (const s of left.slice().sort((a, b) => b.score - a.score))
          T.say((s.name || 'A player') + ': ' + s.hole.map(cname).join(' ') + ' - ' + describe(s.rank) + '.', 'sys');
      }
      const total = pots.reduce((a, p) => a + p.amount, 0);
      T.say(pots.map((p, i) => (pots.length > 1 ? 'Pot ' + (i + 1) + ' of ' + p.amount + ' to ' : 'The pot (' + p.amount + ') to ') +
        (p.who || []).join(' and ') + (p.note ? ' - ' + p.note : (p.who || []).length > 1 ? ' (split)' : '')).join('. '), 'sys');
      T.pot = 0;
      T.result = { hand: T.hand, pots, total, contested: left.length > 1 };
      T.status = seated().length >= 2 ? 'playing' : 'open';
      for (const s of seated()) if (s.chips <= 0) T.say((s.name || 'A player') + ' has nothing left and leaves the table.', 'sys');
      for (const s of dealt()) if (s.chips <= 0) { s.in = false; s.out = true; }
      return { ok: true, end: true, result: T.result };
    }

    T.row = () => ({   /* the public row: everything a client in the room is allowed to know */
      id: T.id, street: T.street, board: T.board.slice(), pot: T.pot, bet: T.bet, hand: T.hand, toAct: T.toAct,
      dealer: T.dealer, status: T.status,
      seats: T.seats.filter(s => s && s.id).map(s => ({
        ref: s.ref, name: s.name, chips: s.chips, bet: s.bet, in: !!s.in, has: !!s.hole && !s.out,
        folded: !!s.folded, allin: !!s.allin, out: !!s.out, won: s.won || 0, show: !!(s.showdown && s.hole && !s.folded)
      }))
    });
    T.rowFor = (ref) => { const r = T.row(), s = seatOf(ref);
      if (s && s.hole) { const e = r.seats.find(x => x.ref === ref); if (e) e.hole = s.hole.slice(); } return r; };
    T.pocket = (ref) => { const s = seatOf(ref); return s && s.hole ? s.hole.slice() : null; };
    T.lastLog = () => T.log.slice(-1);
    return T;
  }

  const LIB = { api: 1, v: 1, table, score5, score7, best, cname, cparse, CATS, STREETS, describe };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('holdemlib', { api: 1, v: 1 }, () => LIB);
  if (typeof module !== 'undefined' && module.exports) module.exports = LIB;
  G.AshHoldemLib = LIB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
