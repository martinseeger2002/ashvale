'use strict';
/* The poker table in the Saltmere tap room (handoff/poker_plan.md): six chairs, sitting down, a dealt hand, the
   betting, the showdown, standing up, and the host/replica round trip. The rules themselves are tests/poker_test.js;
   this is the same table seen from inside the world, through core.js's commands and ticks. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort().map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const BLOCK = new Set(D.rules.tiles.block);

const salt = zones.find(z => z.id === 'saltmere'), P = salt.objects.filter(o => o.k === 'pokertable'), chairs = salt.objects.filter(o => o.k === 'chair');
const tileOf = (x, y) => (salt.tiles[y - salt.origin[1]] || '')[x - salt.origin[0]];
ok(P.length === 2 && P[0].id === 'poker1' && P[1].id === 'poker2' && P.every(t => t.seats.length === 8 && t.w === 2 && t.h === 2 && t.lv === 1), 'two poker tables stand upstairs in the Tap, two by two tiles each: ' + P.map(t => t.id + '@' + t.x + ',' + t.y).join(' '));
ok(P.every(t => t.seats.every(s => s[0] >= t.x - 1 && s[0] <= t.x + t.w && s[1] >= t.y - 1 && s[1] <= t.y + t.h && !(s[0] >= t.x && s[0] < t.x + t.w && s[1] >= t.y && s[1] < t.y + t.h))), 'eight chairs a table, each on a tile beside the felt, none on it');
ok(P[0].seats.every(s => !BLOCK.has(tileOf(s[0], s[1])) && tileOf(s[0], s[1]) === 'i'), 'every chair stands on the tavern floor a player can walk onto');
ok(P[0].seats.every(s => chairs.some(o => o.x === s[0] && o.y === s[1])), 'and a chair on every one of them');
ok(!salt.objects.some(o => o.k === 'table' && o.x === 458 && o.y === 28) && salt.objects.some(o => o.k === 'table' && o.x === 460 && o.y === 27), 'the tap room table that stood there was moved aside, not deleted');
ok(salt.objects.filter(o => o.k === 'chesstable').length === 4, 'the chess park is still there (this did not touch it)');

const c = AshCore.create(D, { seed: 'poker' }), T = P[0];
const a = c.addPlayer('pa', { name: 'Ada' }), b = c.addPlayer('pb', { name: 'Bram' });
a.x = T.seats[0][0]; a.y = T.seats[0][1]; a.lv = 1; b.x = T.seats[3][0]; b.y = T.seats[3][1]; b.lv = 1;
const evs = [];
const run = (n) => { for (let i = 0; i < n; i++) for (const e of c.tick()) evs.push(e); };
ok(c.pokerTableAt(T.x, T.y) && c.pokerTableAt(T.x, T.y).id === 'poker1' && c.pokerTableById('poker1').seats.length === 8, 'the engine finds the table by tile and by id');
c.cmd('pa', { c: 'sit', table: 'poker1', seat: 0 }); run(40);
ok(a.seat && a.seat.k === 'pk' && a.seat.s === 0 && a.x === T.seats[0][0] && a.y === T.seats[0][1], 'Ada takes a chair at the felt');
let st = c.pokerOf('poker1');
ok(st.o === 'open' && st.se.length === 1 && st.se[0][1] === 'pa' && st.se[0][2] === 1000, 'she is dealt a thousand chips and the table waits: ' + JSON.stringify(st.se));
ok(!evs.some(e => e.e === 'poker' && e.st !== 'none'), 'no cards go out to an empty table');
c.cmd('pb', { c: 'sit', table: 'poker1', seat: 0 }); run(40);
ok(!b.seat && evs.some(e => e.e === 'msg' && e.p === 'pb' && /taken/.test(e.text)), 'Bram cannot take Ada\u2019s chair');
c.cmd('pb', { c: 'sit', table: 'poker1', seat: 3 }); run(40);
st = c.pokerOf('poker1');
const t = c.pokerGame('poker1');
ok(b.seat && st.o === 'playing' && st.st === 'preflop', 'he takes the chair opposite and the hand is dealt');
ok(st.sb === 0 && st.bb === 3 && st.p === 75 && st.b === 50, 'the blinds went in, Ada small: pot ' + st.p + ', to call ' + st.b);
ok(st.hc && st.hc.length === 2 && st.bo.length === 0, 'two hole cards each, nothing on the board yet');
ok(st.se.every(s => Number.isInteger(s[0]) && s[1] && typeof s[2] === 'number'), 'the row that travels lists the seats with their chips: ' + JSON.stringify(st.se));
evs.length = 0; c.cmd('pa', { c: 'walk', x: T.x + 5, y: T.y }); run(5);
ok(a.seat && a.x === T.seats[0][0] && evs.some(e => e.e === 'msg' && e.p === 'pa' && /Stand up/.test(e.text)), 'Ada cannot wander off mid-hand: ' + ((evs.find(e => e.e === 'msg' && /Stand up/.test(e.text)) || {}).text));
const v0 = st.v;
evs.length = 0; c.cmd('pa', { c: 'cmove', from: 'e2', to: 'e4' }); c.cmd('pb', { c: 'pact', a: 'whoops' }); run(2);
ok(c.pokerOf('poker1').v === v0 && !evs.some(e => e.e === 'xcmove' || e.e === 'chess'), 'a chess move and a nonsense action at a poker table both change nothing');

/* play the hand out, whichever cards fell */
const who = () => { const m = {}; for (const s of c.pokerOf('poker1').se) m[s[0]] = s[1]; return m; };
let guard = 0, names = who();
while (guard++ < 80 && t.status === 'playing') {
  if (t.toAct < 0) { run(2); continue; }
  const can = t.can(t.toAct);
  c.cmd(names[t.toAct], { c: 'pact', a: can.check ? 'check' : can.call > 0 ? 'call' : 'fold' });
  run(1);
}
st = c.pokerOf('poker1');
ok(st.st === 'none' && st.r, 'the hand ran to the end: ' + st.lg[st.lg.length - 1]);
const chips = st.se.reduce((n, s) => n + s[2], 0);
ok(st.o === 'playing' && chips + (st.rk | 0) === 2000 && (st.rk | 0) > 0 && (st.r.rk | 0) === Math.floor((st.r.p.reduce((a, q) => a + q[0], 0) + (st.r.rk | 0)) * 0.10), 'every chip is accounted for: ' + chips + ' on the table, the house took its tenth of each pot (' + st.rk + ' so far, ' + st.r.rk + ' of this one)');   /* [Claude] the rake */
ok(st.bo.length === 5 || st.se.some(s => s[3] === 0), 'the board was run out or the hand ended early: ' + st.bo.length + ' cards');
ok(evs.filter(e => e.e === 'poker').length > 0 && st.v > 3, 'and every step of it came out in a row the page can draw (v ' + st.v + ')');

/* the next hand is dealt by the table\u2019s own clock, not by a player */
evs.length = 0; run(40);
st = c.pokerOf('poker1');
ok(st.st === 'preflop' && st.h > 1, 'a fresh hand is dealt once the last one is put down: hand ' + st.h);

/* a seat that will not answer is folded out of the hand */
evs.length = 0; run(160);
const silent = evs.filter(e => e.e === 'msg' && /has not answered|checks in their turn/.test(e.text));
ok(silent.length > 0, 'a seat that says nothing for its whole clock is folded or checked by the table: ' + (silent[0] || {}).text);
ok(c.pokerOf('poker1').se.length === 2, 'both players are still sitting through it, just slow');

/* getting up */
evs.length = 0; c.cmd('pa', { c: 'stand' }); run(2);
st = c.pokerOf('poker1');
ok(!a.seat && st.se.length === 1 && evs.some(e => e.e === 'pstand' && e.p === 'pa'), 'Ada gets up and her chair is free again');
c.cmd('pb', { c: 'stand' }); run(30);
st = c.pokerOf('poker1');
ok(!b.seat && st.se.length === 0 && st.o === 'open', 'so does Bram; an empty table is open and quiet');
ok(c.pokerRows().length === 0, 'an empty table has nothing to broadcast');

/* the host of the area and a replica */
const host = AshCore.create(D, { seed: 'h' }), rep = AshCore.create(D, { seed: 'r' });
const hp = host.addPlayer('me', { name: 'Host' }), rp = rep.addPlayer('me', { name: 'Guest' });
rep.setAuth(rep.zoneOf(T.x, T.y), false);
hp.x = T.seats[0][0]; hp.y = T.seats[0][1]; hp.lv = 1; rp.x = T.seats[2][0]; rp.y = T.seats[2][1]; rp.lv = 1;
host.cmd('me', { c: 'sit', table: 'poker1', seat: 0 }); for (let i = 0; i < 20; i++) host.tick();
let xs = []; rep.cmd('me', { c: 'sit', table: 'poker1', seat: 2 }); for (let i = 0; i < 20; i++) for (const e of rep.tick()) xs.push(e);
const ask = xs.find(e => e.e === 'xpsit');
ok(ask && ask.t === 'poker1' && ask.s === 2 && !rp.seat && rp.seatWait && rp.x === T.seats[2][0], 'a replica walks onto the chair and asks the host for it');
{ /* the host will not seat someone who is standing nowhere near the table */
  const far = AshCore.create(D, { seed: 'f' }), q = far.addPlayer('me', { name: 'Far' });
  q.x = T.x + 20; q.y = T.y + 20;
  ok(!far.hostPokerSit('me', 'poker1', 1), 'the host refuses a sit from twenty tiles away'); }
host.addPuppet('guest', { x: rp.x, y: rp.y, n: 'Guest' });
ok(host.hostPokerSit('guest', 'poker1', 2) && host.pokerOf('poker1').o === 'playing', 'the host seats the guest and the hand is dealt');
let rev = rep.S.ev = [];
const rows = host.pokerRows().map(r => Object.assign({}, r, { se: r.se.map(s => [s[0], s[1] === 'me' ? 'host' : s[1] === 'guest' ? 'me' : s[1], s[2], s[3], s[4]]) }));
rep.applyPoker(rows);
ok(rp.seat && rp.seat.t === 'poker1' && rp.seat.s === 2 && rep.pokerOf('poker1').o === 'playing' && rev.some(e => e.e === 'psit' && e.p === 'me'), 'the host\u2019s row seats the replica\u2019s own player in the right chair');
const hnames = {}; for (const s of host.pokerOf('poker1').se) hnames[s[0]] = s[1];
rev = rep.S.ev = []; rep.cmd('me', { c: 'pact', a: 'call' }); for (const e of rep.tick()) rev.push(e);
ok(rev.some(e => e.e === 'xpact' && e.t === 'poker1' && e.a === 'call'), 'its action is asked of the host, not played at home');
const ht = host.pokerGame('poker1'), turn = hnames[ht.toAct], was = ht.toAct, pot0 = host.pokerOf('poker1').p;
const hcan = ht.can(was), act0 = hcan.check ? 'check' : 'call';
ok(turn && host.hostPokerAct(turn, 'poker1', act0) && host.pokerOf('poker1').p >= pot0 && ht.toAct !== was, 'the host takes ' + act0 + ' from whoever is to act: pot ' + host.pokerOf('poker1').p);
rev = rep.S.ev = [];
rep.applyPoker(host.pokerRows().map(r => Object.assign({}, r, { se: r.se.map(s => [s[0], s[1] === 'me' ? 'host' : s[1] === 'guest' ? 'me' : s[1], s[2], s[3], s[4]]) })));
ok(rep.pokerOf('poker1').p === host.pokerOf('poker1').p, 'the replica\u2019s pot now matches the host\u2019s: ' + rep.pokerOf('poker1').p);
const mine = rep.pokerOf('poker1').hc || [];
ok(mine.length === 2 && mine.some(h => h[0] === rp.seat.s), 'both hands travel beside the row, the player\u2019s own among them (the room has one voice - plan risk 3)');
rep.S.ev = []; rep.applyPoker(host.pokerRows().map(r => Object.assign({}, r, { se: [], t: r.t })));
ok(!rp.seat && rep.S.ev.some(e => e.e === 'pstand' && e.p === 'me'), 'a row with nobody in it stands the replica up again');

/* what a room is sent: the row, and no dump of the whole game beside it */
const RROW = host.pokerRow('poker1');
ok(Object.keys(RROW).length > 5 && !('g' in RROW) && !('mine' in RROW) && !('wt' in RROW) && !('tt' in RROW), 'the row that travels carries no game dump and no clock: ' + Object.keys(RROW).sort().join(','));

/* the hand is part of the deterministic log: the same seed, replayed, reaches the same hash */
const SV1 = { v: 1, name: 'A', x: T.seats[0][0], y: T.seats[0][1], lv: 1 }, SV2 = { v: 1, name: 'B', x: T.seats[3][0], y: T.seats[3][1], lv: 1 };   /* [Claude] the table is upstairs: saved there */
const cs = AshCore.create(D, { seed: 'rep' }); cs.addPlayer('p1', SV1); cs.addPlayer('p2', SV2);
cs.cmd('p1', { c: 'sit', table: 'poker1', seat: 0 }); cs.cmd('p2', { c: 'sit', table: 'poker1', seat: 3 });
for (let i = 0; i < 6; i++) cs.tick();
const ct = cs.pokerGame('poker1'), cn = {}; for (const s of cs.pokerOf('poker1').se) cn[s[0]] = s[1];
for (let i = 0; i < 20 && ct.status === 'playing'; i++) {
  if (ct.toAct < 0) { cs.tick(); continue; }
  const can = ct.can(ct.toAct);
  cs.cmd(cn[ct.toAct], { c: 'pact', a: can.check ? 'check' : 'call' }); cs.tick();
}
const h1 = cs.hash(), h2 = AshCore.replay(D, 'rep', { p1: SV1, p2: SV2 }, cs.log, cs.S.t);
ok(ct.board.length + cs.pokerOf('poker1').se.length > 0 && h1 === h2, 'a replayed log reaches the same hash with the same cards on the felt');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);

/* [Claude 2026-10-11] BUY-INS in GOLD (the operator; "the first person to sit down should be the one who sets the stakes") */
{
  const c2 = AshCore.create(D, { seed: 'buyin' }), T2 = P[0];
  const a2 = c2.addPlayer('pa', { name: 'Ada' }), b2 = c2.addPlayer('pb', { name: 'Bram' }), pp = c2.addPlayer('pp', { name: 'Pip' });
  c2.grantItem('pa', 'coins', 2000); c2.grantItem('pb', 'coins', 500); c2.grantItem('pp', 'coins', 100);
  const coins = (p) => p.inv.reduce((n, s) => n + (s && s.id === 'coins' ? s.n : 0), 0);
  const ev2 = []; const run2 = (n) => { for (let i = 0; i < n; i++) for (const e of c2.tick()) ev2.push(e); };
  a2.x = T2.seats[0][0]; a2.y = T2.seats[0][1]; a2.lv = 1; b2.x = T2.seats[3][0]; b2.y = T2.seats[3][1]; b2.lv = 1; pp.x = T2.seats[1][0]; pp.y = T2.seats[1][1]; pp.lv = 1;
  c2.cmd('pa', { c: 'sit', table: 'poker1', seat: 0, buy: 500 }); run2(5);
  let st2 = c2.pokerOf('poker1'), t2 = c2.pokerGame('poker1');
  ok(a2.seat && st2.buy === 500 && st2.se[0][2] === 500 && coins(a2) === 1500, 'the first to sit sets the buy-in (500 GOLD), pays it and gets 500 chips: ' + coins(a2) + ' GOLD left');
  ok(t2.small === 12 && t2.big === 25, 'the blinds follow the buy-in: ' + t2.small + '/' + t2.big);
  ev2.length = 0; c2.cmd('pp', { c: 'sit', table: 'poker1', seat: 1, buy: 0 }); run2(5);
  ok(!pp.seat && coins(pp) === 100 && ev2.some(e => e.e === 'msg' && e.p === 'pp' && /need 500 GOLD/.test(e.text)), 'Pip, with 100 GOLD, is told the buy-in and stays standing');
  c2.cmd('pb', { c: 'sit', table: 'poker1', seat: 3, buy: 9 }); run2(5);
  st2 = c2.pokerOf('poker1');
  ok(b2.seat && coins(b2) === 0 && st2.o === 'playing' && st2.p === 37 && st2.b === 25, 'Bram pays the table’s 500 (not his own 9); the hand is dealt with 12/25 blinds: pot ' + st2.p);
  ok(ev2.some(e => e.e === 'poker' && e.buy === 500), 'the row that travels says the buy-in');
  const bramChips = st2.se.find(s => s[1] === 'pb')[2];
  c2.cmd('pb', { c: 'stand' }); run2(3);
  ok(!b2.seat && coins(b2) === bramChips && c2.pokerOf('poker1').co.some(x => x[0] === 'pb' && x[1] === bramChips), 'Bram stands mid-hand: his stack comes back as GOLD (' + bramChips + ') through the row’s cashout');
  run2(5); c2.cmd('pa', { c: 'stand' }); run2(3);
  ok(!a2.seat && coins(a2) + coins(b2) + (c2.pokerOf('poker1').rk | 0) === 2500, 'Ada stands too and every GOLD is accounted for, the house\'s rake included: ' + coins(a2) + ' + ' + coins(b2) + ' + rake ' + c2.pokerOf('poker1').rk);
  ok(c2.pokerOf('poker1').buy === 0, 'an empty table forgets its buy-in');
  /* a free table moves no GOLD */
  c2.cmd('pa', { c: 'sit', table: 'poker1', seat: 0 }); run2(5);
  ok(a2.seat && c2.pokerOf('poker1').buy === 0 && c2.pokerOf('poker1').se[0][2] === 1000, 'without a buy-in the chips are free, a thousand as before');
  const before = coins(a2); c2.cmd('pa', { c: 'stand' }); run2(3);
  ok(coins(a2) === before && !c2.pokerOf('poker1').co.some(x => x[2] > 1), 'and nothing is paid out when standing');
  /* the host’s word reaches a replica: it pays on its own copy when seated, and is cashed out once */
  const rep2 = AshCore.create(D, { seed: 'rp' }), rp2 = rep2.addPlayer('me', { name: 'Guest' }); rep2.grantItem('me', 'coins', 700); rep2.setAuth(rep2.zoneOf(T2.x, T2.y), false);
  rp2.x = T2.seats[2][0]; rp2.y = T2.seats[2][1]; rp2.lv = 1;
  const r3 = rep2.S.ev = []; rep2.applyPoker([{ t: 'poker1', o: 'open', st: 'none', se: [[2, 'me', 500, 0, 0]], v: 4, buy: 500, gid: 2, co: [], cseq: 0 }]);
  ok(rp2.seat && coins(rp2) === 200, 'the row seats the replica’s player and its own copy takes the 500 buy-in: ' + coins(rp2));
  rep2.applyPoker([{ t: 'poker1', o: 'open', st: 'none', se: [[2, 'me', 500, 0, 0]], v: 5, buy: 500, gid: 2, co: [], cseq: 0 }]);
  ok(coins(rp2) === 200, 'the same game id is not charged twice');
  rep2.applyPoker([{ t: 'poker1', o: 'open', st: 'none', se: [], v: 6, buy: 500, gid: 2, co: [['me', 640, 1]], cseq: 1 }]);
  rep2.applyPoker([{ t: 'poker1', o: 'open', st: 'none', se: [], v: 7, buy: 0, gid: 2, co: [['me', 640, 1]], cseq: 1 }]);
  ok(!rp2.seat && coins(rp2) === 840, 'the cashout in the row is paid once, however often the row comes: ' + coins(rp2));
}

/* [Claude 2026-10-11] IDLE at the felt (the operator): a minute sitting on your hand folds you and deals you out until you come
   back; fifteen minutes without playing stands you up with your stack cashed out */
{
  const c3 = AshCore.create(D, { seed: 'idle' }), T3 = P[0];
  const a3 = c3.addPlayer('pa', { name: 'Ada' }), b3 = c3.addPlayer('pb', { name: 'Bram' });
  c3.grantItem('pa', 'coins', 1000); c3.grantItem('pb', 'coins', 1000);
  const coins = (p) => p.inv.reduce((n, s) => n + (s && s.id === 'coins' ? s.n : 0), 0);
  const run3 = (n) => { for (let i = 0; i < n; i++) c3.tick(); };
  a3.x = T3.seats[0][0]; a3.y = T3.seats[0][1]; a3.lv = 1; b3.x = T3.seats[3][0]; b3.y = T3.seats[3][1]; b3.lv = 1;
  c3.cmd('pa', { c: 'sit', table: 'poker1', seat: 0, buy: 1000 }); run3(5); c3.cmd('pb', { c: 'sit', table: 'poker1', seat: 3 }); run3(5);
  const t3 = c3.pokerGame('poker1'); let st3 = c3.pokerOf('poker1');
  ok(st3.o === 'playing' && st3.st === 'preflop' && st3.p === 75 && t3.small === 25 && t3.big === 50, 'a 1000 buy-in: the blinds are 25/50 and the hand is dealt (pot ' + st3.p + ')');
  const slow = st3.se.find(s => s[0] === st3.a)[1], quick = slow === 'pa' ? 'pb' : 'pa';
  c3.S.t += 101; run3(3);
  st3 = c3.pokerOf('poker1');
  const seat = st3.se.find(s => s[1] === slow);
  ok(seat && (seat[4] & 32) && !(seat[4] & 1) && st3.st === 'none', slow + ' sat on the hand for a minute: folded and dealt out (flags ' + seat[4] + '), the hand is over');
  c3.S.t += 20; run3(5);
  ok(c3.pokerOf('poker1').o === 'open' || c3.pokerOf('poker1').st === 'none', 'no new hand is dealt with one player dealt out');
  c3.cmd(slow, { c: 'pact', a: 'back' }); run3(2);
  const back = c3.pokerOf('poker1').se.find(s => s[1] === slow);
  ok(back && !(back[4] & 32) && (back[4] & 1), 'a word from them brings them back for the next hand (flags ' + back[4] + ')');
  run3(20);
  ok(c3.pokerOf('poker1').st === 'preflop', 'and the table deals again');
  const stackNow = () => c3.pokerOf('poker1').se.find(s => s[1] === quick)[2];
  c3.S.t += 1600; run3(12);
  ok(!c3.S.players[quick].seat && !c3.S.players[slow].seat, 'fifteen minutes without playing: both are stood up');
  ok(coins(a3) + coins(b3) + (c3.pokerOf('poker1').rk | 0) === 2000, 'and every GOLD came back as it stood, the rake aside: ' + coins(a3) + ' + ' + coins(b3) + ' + rake ' + c3.pokerOf('poker1').rk);
}
