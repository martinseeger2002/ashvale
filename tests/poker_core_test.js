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
ok(P.length === 1 && P[0].id === 'poker1' && P[0].seats.length === 6, 'one poker table stands in Saltmere: ' + P.map(t => t.id + '@' + t.x + ',' + t.y).join(' '));
ok(P[0].seats.length === 6 && P[0].seats.every(s => Math.max(Math.abs(s[0] - P[0].x), Math.abs(s[1] - P[0].y)) === 1), 'six chairs, each on a tile beside the felt');
ok(P[0].seats.every(s => !BLOCK.has(tileOf(s[0], s[1])) && tileOf(s[0], s[1]) === 'i'), 'every chair stands on the tavern floor a player can walk onto');
ok(P[0].seats.every(s => chairs.some(o => o.x === s[0] && o.y === s[1])), 'and a chair on every one of them');
ok(!salt.objects.some(o => o.k === 'table' && o.x === 458 && o.y === 28) && salt.objects.some(o => o.k === 'table' && o.x === 460 && o.y === 27), 'the tap room table that stood there was moved aside, not deleted');
ok(salt.objects.filter(o => o.k === 'chesstable').length === 4, 'the chess park is still there (this did not touch it)');

const c = AshCore.create(D, { seed: 'poker' }), T = P[0];
const a = c.addPlayer('pa', { name: 'Ada' }), b = c.addPlayer('pb', { name: 'Bram' });
a.x = T.seats[0][0]; a.y = T.seats[0][1]; b.x = T.seats[3][0]; b.y = T.seats[3][1];
const evs = [];
const run = (n) => { for (let i = 0; i < n; i++) for (const e of c.tick()) evs.push(e); };
ok(c.pokerTableAt(T.x, T.y) && c.pokerTableById('poker1') === T, 'the engine finds the table by tile and by id');
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
ok(st.o === 'playing' && chips === 2000, 'every chip is still on the table, nobody printed: ' + chips);
ok(st.bo.length === 5 || st.se.some(s => s[3] === 0), 'the board was run out or the hand ended early: ' + st.bo.length + ' cards');
ok(evs.filter(e => e.e === 'poker').length > 0 && st.v > 3, 'and every step of it came out in a row the page can draw (v ' + st.v + ')');

/* the next hand is dealt by the table\u2019s own clock, not by a player */
evs.length = 0; run(40);
st = c.pokerOf('poker1');
ok(st.st === 'preflop' && st.h > 1, 'a fresh hand is dealt once the last one is put down: hand ' + st.h);

/* a seat that will not answer is folded out of the hand */
evs.length = 0; run(130);
st = c.pokerOf('poker1');
ok((st.o === 'playing' && st.se.some(s => (s[4] & 2) !== 0)) || st.st === 'none', 'a seat that says nothing for its whole clock is folded');
ok(evs.some(e => e.e === 'msg' && /has not answered/.test(e.text)) || st.st === 'none', 'and the table says so: ' + ((evs.filter(e => e.e === 'msg').slice(-1)[0] || {}).text));

/* getting up */
evs.length = 0; c.cmd('pa', { c: 'stand' }); run(2);
st = c.pokerOf('poker1');
ok(!a.seat && st.se.length === 1 && evs.some(e => e.e === 'pstand' && e.p === 'pa'), 'Ada gets up and her chair is free again');
c.cmd('pb', { c: 'stand' }); run(2);
st = c.pokerOf('poker1');
ok(!b.seat && st.se.length === 0 && st.o === 'open', 'so does Bram; an empty table is open and quiet');
ok(c.pokerRows().length === 0, 'an empty table has nothing to broadcast');

/* the host of the area and a replica */
const host = AshCore.create(D, { seed: 'h' }), rep = AshCore.create(D, { seed: 'r' });
const hp = host.addPlayer('me', { name: 'Host' }), rp = rep.addPlayer('me', { name: 'Guest' });
rep.setAuth(rep.zoneOf(T.x, T.y), false);
hp.x = T.seats[0][0]; hp.y = T.seats[0][1]; rp.x = T.seats[2][0]; rp.y = T.seats[2][1];
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

/* the hand is part of the deterministic log: the same seed, replayed, reaches the same hash */
const SV1 = { v: 1, name: 'A', x: T.seats[0][0], y: T.seats[0][1] }, SV2 = { v: 1, name: 'B', x: T.seats[3][0], y: T.seats[3][1] };
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
