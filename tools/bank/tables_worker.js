/* [Claude 2026-10-20] the clubhouse tables' rules worker for the @ashvale Bank (tools/bank/tables.py): one JSON request a line
   on stdin, one JSON answer a line on stdout. STATELESS: every request carries the table's state and gets the new one back, so
   the Bank's database stays the only record and a restart loses nothing. The rules are the game's own files (src/dicerules.js,
   src/wheelrules.js, src/twentyonerules.js), so the game and the Bank can never disagree about a payout.
   request {id, game, op, ...} -> {id, ok: true, ...} | {id, ok: false, err} */
'use strict';
const path = require('path'), readline = require('readline');
const SRC = process.env.ASH_RULES_DIR || path.join(__dirname, '..', '..', 'src');
const D = require(path.join(SRC, 'dicerules.js')), W = require(path.join(SRC, 'wheelrules.js')), B = require(path.join(SRC, 'twentyonerules.js'));
/* the shoe's cards are drawn in order from the state (st.shoe, st.pos) */
const drawFrom = st => () => { if (st.pos >= st.shoe.length) throw new Error('the shoe ran out'); return st.shoe[st.pos++]; };
/* uniform integers from a stream of bytes (the Bank's HMAC blocks, hex): rejection sampling on 32-bit draws */
function intsFrom(hex) { const b = Buffer.from(hex, 'hex'); let i = 0;
  return n => { for (;;) { if (i + 4 > b.length) throw new Error('out of random bytes'); const v = b.readUInt32BE(i); i += 4; const lim = Math.floor(4294967296 / n) * n; if (v < lim) return v % n; } }; }
const OPS = {
  dice: {
    bet(q) { const e = D.legal(q.seat, q.point, q.key, q.n, q.credit); if (e) return { err: e }; D.bet(q.seat, q.point, q.key, q.n); return { seat: q.seat, cost: q.n }; },
    take(q) { const v = D.take(q.seat, q.point, q.key); return { seat: q.seat, back: v }; },
    clear(q) { let v = 0; for (const k of D.KEYS) if (D.removable(q.seat, q.point, k)) v += D.take(q.seat, q.point, k); return { seat: q.seat, back: v }; },
    roll(q) { const d = D.diceFrom(Buffer.from(q.bytes, 'hex')); if (!d) return { err: 'no dice from these bytes' }; const r = D.settle(q.point, q.seats, d[0], d[1]); return Object.assign(r, { dice: d, seats: q.seats }); },
    onTable(q) { return { n: D.onTable(q.seat) }; },
  },
  wheel: {
    bet(q) { const e = W.legal(q.bets, q.key, q.n, q.credit); if (e) return { err: e }; q.bets[q.key] = (q.bets[q.key] || 0) + q.n; return { bets: q.bets, cost: q.n }; },
    take(q) { const v = q.bets[q.key] || 0; delete q.bets[q.key]; return { bets: q.bets, back: v }; },
    clear(q) { const v = W.onTable(q.bets); return { bets: {}, back: v }; },
    spin(q) { const n = W.pocketFrom(Buffer.from(q.bytes, 'hex')); if (n == null) return { err: 'no pocket from these bytes' }; return W.settle(q.seats, n); },
  },
  twentyone: {
    shoe(q) { const ri = intsFrom(q.bytes); const shoe = B.shoe(ri); return { shoe, cut: B.cutAt(ri) }; },
    legalBet(q) { return { err: B.legalBet(q.n, q.credit) }; },
    deal(q) { const R = B.newRound(q.spots), st = { shoe: q.shoe, pos: q.pos }; B.deal(R, drawFrom(st)); return { R, pos: st.pos }; },
    insure(q) { const cost = B.insure(q.R, q.sn, !!q.yes); return { R: q.R, cost }; },
    insuranceDone(q) { B.insuranceDone(q.R); return { R: q.R }; },
    legal(q) { return { acts: B.legalActs(q.R, q.sn, q.credit) }; },
    act(q) { const st = { shoe: q.shoe, pos: q.pos }, cost = B.act(q.R, q.sn, q.a, drawFrom(st), q.credit); if (cost == null) return { err: 'not now' }; return { R: q.R, pos: st.pos, cost }; },
    dealer(q) { const st = { shoe: q.shoe, pos: q.pos }; B.dealerPlay(q.R, drawFrom(st)); return { R: q.R, pos: st.pos }; },
    settle(q) { const s = B.settle(q.R); return Object.assign(s, { R: q.R }); },
  },
};
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => {
  let q; try { q = JSON.parse(line); } catch (e) { process.stdout.write(JSON.stringify({ ok: false, err: 'bad json' }) + '\n'); return; }
  let out;
  try { const f = (OPS[q.game] || {})[q.op]; if (!f) throw new Error('no such op ' + q.game + '.' + q.op); const r = f(q); out = r && r.err ? { id: q.id, ok: false, err: r.err } : Object.assign({ id: q.id, ok: true }, r); }
  catch (e) { out = { id: q.id, ok: false, err: String(e && e.message || e).slice(0, 200) }; }
  process.stdout.write(JSON.stringify(out) + '\n');
});
