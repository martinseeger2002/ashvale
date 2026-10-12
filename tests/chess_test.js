'use strict';
/* The Saltmere chess park (handoff/chess_park_plan.md, 2026-10-10): four tables on the quay green, sitting, legal play
   between two players, results, standing up, and the host/replica round trip. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort().map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const BLOCK = new Set(D.rules.tiles.block);

const salt = zones.find(z => z.id === 'saltmere'), T = salt.objects.filter(o => o.k === 'chesstable'), benches = salt.objects.filter(o => o.k === 'bench');
ok(T.length === 4 && new Set(T.map(t => t.id)).size === 4, 'four chess tables stand in Saltmere: ' + T.map(t => t.id + '@' + t.x + ',' + t.y).join(' '));
ok(T.every(t => t.seats.length === 2 && t.seats[0][1] === t.y - 1 && t.seats[1][1] === t.y + 1 && t.seats.every(s => s[0] === t.x)), 'each has a bench north (Black) and south (White) of it');
const tileOf = (x, y) => (salt.tiles[y - salt.origin[1]] || '')[x - salt.origin[0]];
ok(T.every(t => t.seats.every(s => !BLOCK.has(tileOf(s[0], s[1])))), 'every bench stands on ground a player can walk onto');
ok(benches.length === 8 && T.every(t => t.seats.every(s => benches.some(b => b.x === s[0] && b.y === s[1]))), 'eight benches, one on every seat');
ok(salt.objects.some(o => o.k === 'wsign' && o.board === 'chess'), 'and a standings board for the park');

const c = AshCore.create(D, { seed: 'chess' });
const t1 = T[0];
const w = c.addPlayer('pw', { name: 'Wren' }), b = c.addPlayer('pb', { name: 'Aldric' });
ok(c.tableAt(t1.x, t1.y) && c.tableAt(t1.x, t1.y).id === t1.id, 'the engine finds the table by its tile');
w.x = t1.x + 3; w.y = t1.y + 3; b.x = t1.x - 3; b.y = t1.y - 3;
const evs = [];
const run = (n) => { for (let i = 0; i < n; i++) for (const e of c.tick()) evs.push(e); };
c.cmd('pw', { c: 'sit', table: t1.id, seat: 1 }); run(40);
ok(w.seat && w.seat.t === t1.id && w.seat.s === 1 && w.x === t1.seats[1][0] && w.y === t1.seats[1][1], 'Wren walks to the south bench and sits down: ' + w.x + ',' + w.y);
let st = c.chessOf(t1.id);
ok(st.w === 'pw' && st.status === 'open' && evs.some(e => e.e === 'sit' && e.p === 'pw'), 'she holds White and the table waits for an opponent');
ok(!c.chessRows().length === false && c.chessRows()[0].t === t1.id, 'the host would broadcast this table now (someone is sitting)');
c.cmd('pb', { c: 'sit', table: t1.id, seat: 1 }); run(40);
ok(!b.seat && evs.some(e => e.e === 'msg' && e.p === 'pb' && /taken/.test(e.text)), "Aldric cannot take Wren's seat");
c.cmd('pb', { c: 'sit', table: t1.id, seat: 0 }); run(40);
st = c.chessOf(t1.id);
ok(b.seat && st.b === 'pb' && st.status === 'playing' && st.fen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'he sits on the north bench as Black and the game begins');
evs.length = 0;
c.cmd('pb', { c: 'cmove', from: 'e7', to: 'e5' }); run(1);
ok(c.chessOf(t1.id).moves.length === 0 && evs.some(e => e.e === 'msg' && /Not your move/.test(e.text)), 'Black cannot move first');
c.cmd('pw', { c: 'cmove', from: 'e2', to: 'e5' }); run(1);
ok(c.chessOf(t1.id).moves.length === 0 && evs.some(e => e.e === 'msg' && /not a legal move/.test(e.text)), 'an illegal move is refused');
ok(c.chessMoves(t1.id, 'e2').map(m => m.to).sort().join() === 'e3,e4', 'the page can ask where a pawn may go: e2 -> ' + c.chessMoves(t1.id, 'e2').map(m => m.to).join(','));
const play = (san) => { for (const [who, from, to] of san) { c.cmd(who, { c: 'cmove', from, to }); run(1); } };
play([['pw', 'e2', 'e4'], ['pb', 'e7', 'e5'], ['pw', 'd1', 'h5'], ['pb', 'b8', 'c6'], ['pw', 'f1', 'c4'], ['pb', 'g8', 'f6']]);
st = c.chessOf(t1.id);
ok(st.moves.join(' ') === 'e4 e5 Qh5 Nc6 Bc4 Nf6' && st.status === 'playing' && c.chessTurn(t1.id) === 'w', 'six legal moves are on the board: ' + st.moves.join(' '));
const mv = evs.filter(e => e.e === 'chess' && e.move);
ok(mv.length === 6 && mv[0].move[0] === 'e2' && mv[0].move[1] === 'e4', 'every move came out as an event the page can animate (from, to): ' + mv.map(e => e.move[0] + e.move[1]).join(' '));
play([['pw', 'h5', 'f7']]);
st = c.chessOf(t1.id);
ok(st.status === 'over' && st.result === '1-0' && st.why === 'checkmate', "scholar's mate ends it: " + st.result + ' by ' + st.why);
ok(evs.some(e => e.e === 'chess' && e.status === 'over' && e.check === true), 'the last event says check and over');
evs.length = 0; c.cmd('pb', { c: 'walk', x: t1.x - 4, y: t1.y - 4 }); run(5);
ok(b.seat && b.x === t1.seats[0][0] && evs.some(e => e.e === 'msg' && e.p === 'pb' && /Stand up/.test(e.text)), 'Aldric cannot just walk away from the table (the operator: stakes): he is told to stand up');
c.cmd('pb', { c: 'stand' }); run(1);
ok(!b.seat && c.chessOf(t1.id).b === null, 'standing up frees his seat');
c.cmd('pw', { c: 'stand' }); run(1);
st = c.chessOf(t1.id);
ok(!w.seat && st.w === null && st.status === 'open' && st.moves.length === 0, 'Wren stands too; an empty table resets to a fresh board');

/* resigning: stand up with a move on the board */
c.cmd('pw', { c: 'sit', table: t1.id, seat: 1 }); c.cmd('pb', { c: 'sit', table: t1.id, seat: 0 }); run(60);
play([['pw', 'd2', 'd4']]);
c.cmd('pw', { c: 'stand' }); run(1);
st = c.chessOf(t1.id);
ok(st.status === 'over' && st.result === '0-1' && st.why === 'resigned' && st.b === 'pb', 'standing up with a move played is resigning: Black wins, and keeps his seat');
c.cmd('pb', { c: 'stand' }); run(1);
ok(c.chessOf(t1.id).status === 'open', 'and the table is open again once he leaves');

/* the host and a replica */
const host = AshCore.create(D, { seed: 'h' }), rep = AshCore.create(D, { seed: 'r' });
const hp = host.addPlayer('me', { name: 'Host' }), rp = rep.addPlayer('me', { name: 'Guest' });
rep.setAuth(rep.zoneOf(t1.x, t1.y), false);
hp.x = t1.x; hp.y = t1.y + 2; rp.x = t1.x; rp.y = t1.y - 2;
host.cmd('me', { c: 'sit', table: t1.id, seat: 1 }); for (let i = 0; i < 20; i++) host.tick();
let xs = []; rep.cmd('me', { c: 'sit', table: t1.id, seat: 0 }); for (let i = 0; i < 20; i++) for (const e of rep.tick()) xs.push(e);
const ask = xs.find(e => e.e === 'xsit');
ok(ask && ask.t === t1.id && ask.s === 0 && !rp.seat && rp.seatWait && rp.seatWait.t === t1.id && rp.seatWait.s === 0 && rp.x === t1.seats[0][0] && rp.y === t1.seats[0][1], 'a replica walks to the bench and asks the host for the seat');
{ /* asking for the bench the host already sits on: the host restates the table, and the row tells the asker the other bench is free */
  const rep2 = AshCore.create(D, { seed: 'r2' }), q = rep2.addPlayer('me', { name: 'Late' }); rep2.setAuth(rep2.zoneOf(t1.x, t1.y), false); q.x = t1.x; q.y = t1.y + 1;
  rep2.cmd('me', { c: 'sit', table: t1.id, seat: 1 }); for (let i = 0; i < 5; i++) rep2.tick();
  host.addPuppet('late', { x: q.x, y: q.y, n: 'Late' }); let hev = host.S.ev = []; const took = host.hostSit('late', t1.id, 1);
  ok(!took && hev.some(e => e.e === 'chess' && e.t === t1.id), 'the host refuses the taken bench and restates the table');
  rep2.S.ev = []; rep2.applyChess(host.chessRows().map(r => Object.assign({}, r, { w: 'host' })));
  ok(!q.seatWait && rep2.S.ev.some(e => e.e === 'msg' && /other bench is free/.test(e.text)), 'the asker hears that bench is taken and the other is free'); }
host.addPuppet('guest', { x: rp.x, y: rp.y, n: 'Guest' });
ok(host.hostSit('guest', t1.id, 0) && host.chessOf(t1.id).status === 'playing', 'the host seats the guest and the game starts');
let rev = []; rep.S.ev = rev; rep.applyChess(host.chessRows().map(r => Object.assign({}, r, { w: r.w === 'me' ? 'host' : r.w, b: r.b === 'guest' ? 'me' : r.b })));
ok(rp.seat && rp.seat.t === t1.id && rp.seat.s === 0 && rep.chessOf(t1.id).status === 'playing' && rev.some(e => e.e === 'sit' && e.p === 'me'), "the host's row seats the replica's own player");
rev = []; rep.cmd('me', { c: 'cmove', from: 'e7', to: 'e5' }); for (const e of rep.tick()) rev.push(e);
ok(rev.some(e => e.e === 'xcmove') && rep.chessOf(t1.id).moves.length === 0, 'a replica move is asked of the host, not played locally');
ok(host.hostMove('me', t1.id, 'e2', 'e4') && host.hostMove('guest', t1.id, 'e7', 'e5') && host.chessOf(t1.id).moves.join(' ') === 'e4 e5', 'the host plays both moves');
rev = rep.S.ev = []; rep.applyChess(host.chessRows().map(r => Object.assign({}, r, { w: 'host', b: 'me' })));   /* tick() hands out S.ev and starts a new one */
ok(rep.chessOf(t1.id).fen === host.chessOf(t1.id).fen && rev.some(e => e.e === 'chess' && e.move && e.move[1] === 'e5'), 'the replica follows the FEN and animates the last move');
ok(!host.hostMove('guest', t1.id, 'd7', 'd5'), 'the host refuses a move out of turn');
host.removePlayer('guest');
ok(host.chessOf(t1.id).status === 'over' && host.chessOf(t1.id).result === '1-0' && host.chessOf(t1.id).why === 'left', 'a player who vanishes mid-game forfeits');

/* replay: the match is part of the deterministic log */
const SV1 = { v: 1, name: 'A', x: t1.x, y: t1.y + 1 }, SV2 = { v: 1, name: 'B', x: t1.x, y: t1.y - 1 };   /* placed by their saves, which the replay sees */
const cs = AshCore.create(D, { seed: 'rep' }); cs.addPlayer('p1', SV1); cs.addPlayer('p2', SV2);
cs.cmd('p1', { c: 'sit', table: t1.id, seat: 1 }); cs.cmd('p2', { c: 'sit', table: t1.id, seat: 0 }); for (let i = 0; i < 5; i++) cs.tick();
cs.cmd('p1', { c: 'cmove', from: 'g1', to: 'f3' }); cs.tick(); cs.cmd('p2', { c: 'cmove', from: 'g8', to: 'f6' }); cs.tick();
const h1 = cs.hash(), h2 = AshCore.replay(D, 'rep', { p1: SV1, p2: SV2 }, cs.log, cs.S.t);
ok(cs.chessOf(t1.id).moves.join(' ') === 'Nf3 Nf6' && h1 === h2, 'a replayed log reaches the same hash with the same game on the board');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);

/* [Claude 2026-10-11] STAKES (the operator: "players should be able to wager against their opponent on a game of chess";
   "the first person to sit down should be the one who sets the stakes"): GOLD on the game, settled by the result */
{
  const c2 = AshCore.create(D, { seed: 'stakes' }), t2 = T[1];
  const w2 = c2.addPlayer('pw', { name: 'Wren' }), b2 = c2.addPlayer('pb', { name: 'Aldric' }), pp = c2.addPlayer('pp', { name: 'Pip' });
  c2.grantItem('pw', 'coins', 1000); c2.grantItem('pb', 'coins', 800); c2.grantItem('pp', 'coins', 100);
  const coins = (p) => p.inv.reduce((n, s) => n + (s && s.id === 'coins' ? s.n : 0), 0);
  const near = (p, s) => { p.x = s[0]; p.y = s[1]; p.path = []; p.act = null; };
  const ev2 = []; const run2 = (n) => { for (let i = 0; i < n; i++) for (const e of c2.tick()) ev2.push(e); };
  const play2 = (san) => { for (const [who, from, to] of san) { c2.cmd(who, { c: 'cmove', from, to }); run2(1); } };
  near(w2, t2.seats[1]); c2.cmd('pw', { c: 'sit', table: t2.id, seat: 1, stake: 500 }); run2(5);
  let st2 = c2.chessOf(t2.id);
  ok(w2.seat && st2.stake === 500 && st2.gid === 1 && coins(w2) === 500, 'the first to sit sets the stake (500) and puts it on the game: Wren has ' + coins(w2) + ' GOLD left');
  near(pp, t2.seats[0]); ev2.length = 0; c2.cmd('pp', { c: 'sit', table: t2.id, seat: 0, stake: 0 }); run2(5);
  ok(!pp.seat && coins(pp) === 100 && ev2.some(e => e.e === 'msg' && e.p === 'pp' && /need 500 GOLD/.test(e.text)), 'Pip, with 100 GOLD, is told the stake and stays standing');
  near(b2, t2.seats[0]); c2.cmd('pb', { c: 'sit', table: t2.id, seat: 0, stake: 7 }); run2(5);
  st2 = c2.chessOf(t2.id);
  ok(b2.seat && st2.status === 'playing' && st2.stake === 500 && coins(b2) === 300, 'Aldric sits, pays the stake the table already has (not his own 7), and the game begins');
  play2([['pw', 'e2', 'e4'], ['pb', 'e7', 'e5'], ['pw', 'd1', 'h5'], ['pb', 'b8', 'c6'], ['pw', 'f1', 'c4'], ['pb', 'g8', 'f6'], ['pw', 'h5', 'f7']]);
  st2 = c2.chessOf(t2.id);
  ok(st2.status === 'over' && st2.paid && st2.paid.pw === 1000 && !st2.paid.pb, "the host's word at checkmate: White is owed both stakes " + JSON.stringify(st2.paid));
  ok(coins(w2) === 1500 && coins(b2) === 300, 'and Wren is paid: ' + coins(w2) + ' / ' + coins(b2));
  ok(ev2.some(e => e.e === 'chess' && e.t === t2.id && e.paid && e.paid.pw === 1000 && e.stake === 500), 'the row that travels carries the stake and the payout');
  c2.cmd('pw', { c: 'stand' }); c2.cmd('pb', { c: 'stand' }); run2(2);
  ok(c2.chessOf(t2.id).stake === 0 && !c2.chessOf(t2.id).paid, 'an empty table forgets its stake');
  /* nobody came: the stake comes back */
  near(w2, t2.seats[1]); c2.cmd('pw', { c: 'sit', table: t2.id, seat: 1, stake: 200 }); run2(5);
  ok(coins(w2) === 1300, 'she puts 200 on a new game');
  c2.cmd('pw', { c: 'stand' }); run2(2);
  ok(coins(w2) === 1500 && c2.chessOf(t2.id).stake === 0, 'standing up before an opponent came returns it: ' + coins(w2));
  /* resigning loses the stake */
  near(w2, t2.seats[1]); c2.cmd('pw', { c: 'sit', table: t2.id, seat: 1, stake: 300 }); run2(5);
  near(b2, t2.seats[0]); c2.cmd('pb', { c: 'sit', table: t2.id, seat: 0 }); run2(5);
  ok(coins(w2) === 1200 && coins(b2) === 0 && c2.chessOf(t2.id).status === 'playing', 'both stakes are on the game (Aldric is down to nothing)');
  play2([['pw', 'd2', 'd4']]); c2.cmd('pw', { c: 'stand' }); run2(2);
  ok(c2.chessOf(t2.id).result === '0-1' && coins(b2) === 600 && coins(w2) === 1200, 'White resigns by standing: Aldric takes both stakes, ' + coins(b2));
  c2.cmd('pb', { c: 'stand' }); run2(2);
  /* a friendly game moves nothing */
  near(w2, t2.seats[1]); c2.cmd('pw', { c: 'sit', table: t2.id, seat: 1 }); run2(5); near(b2, t2.seats[0]); c2.cmd('pb', { c: 'sit', table: t2.id, seat: 0, stake: 999 }); run2(5);
  ok(c2.chessOf(t2.id).stake === 0 && coins(w2) === 1200 && coins(b2) === 600, 'a friendly game set by the first sitter stays friendly, whatever the second asks');
  c2.cmd('pw', { c: 'stand' }); c2.cmd('pb', { c: 'stand' }); run2(2);
  /* host and replica: the GOLD moves on each side's own copy, by the row */
  const host2 = AshCore.create(D, { seed: 'h2' }), rep2 = AshCore.create(D, { seed: 'r2' });
  const hp2 = host2.addPlayer('me', { name: 'Host' }), rp2 = rep2.addPlayer('me', { name: 'Guest' });
  host2.grantItem('me', 'coins', 400); rep2.grantItem('me', 'coins', 150); rep2.setAuth(rep2.zoneOf(t2.x, t2.y), false);
  hp2.x = t2.seats[1][0]; hp2.y = t2.seats[1][1]; rp2.x = t2.seats[0][0]; rp2.y = t2.seats[0][1];
  host2.cmd('me', { c: 'sit', table: t2.id, seat: 1, stake: 100 }); for (let i = 0; i < 5; i++) host2.tick();
  ok(coins(hp2) === 300 && host2.chessOf(t2.id).stake === 100, 'the host sits with a stake of 100 and pays it');
  const xs2 = []; rep2.cmd('me', { c: 'sit', table: t2.id, seat: 0, stake: 0 }); for (let i = 0; i < 5; i++) for (const e of rep2.tick()) xs2.push(e);
  ok(xs2.some(e => e.e === 'xsit' && e.stake === 0) && coins(rp2) === 150, 'the replica asks the host for the bench; nothing is taken until the host seats it');
  host2.addPuppet('guest', { x: rp2.x, y: rp2.y, n: 'Guest' });
  ok(host2.hostSit('guest', t2.id, 0, 0) && host2.chessOf(t2.id).status === 'playing', 'the host seats the guest (the table keeps its 100)');
  const toRep = () => rep2.applyChess(host2.chessRows().map(r => Object.assign({}, r, { w: r.w === 'me' ? 'host' : r.w, b: r.b === 'guest' ? 'me' : r.b, paid: r.paid ? Object.fromEntries(Object.entries(r.paid).map(([k, v]) => [k === 'guest' ? 'me' : k === 'me' ? 'host' : k, v])) : null })));
  toRep();
  ok(rp2.seat && coins(rp2) === 50, "the row seats the replica's player and its own copy takes the stake: " + coins(rp2));
  for (const [who, f, t] of [['me', 'e2', 'e4'], ['guest', 'e7', 'e5'], ['me', 'd1', 'h5'], ['guest', 'b8', 'c6'], ['me', 'f1', 'c4'], ['guest', 'g8', 'f6'], ['me', 'h5', 'f7']]) host2.hostMove(who, t2.id, f, t);
  ok(host2.chessOf(t2.id).result === '1-0' && coins(hp2) === 500, 'the host wins and credits itself: ' + coins(hp2));
  toRep();
  ok(coins(rp2) === 50 && rep2.chessOf(t2.id).paid && rep2.chessOf(t2.id).paid.host === 200, 'the replica sees the payout went to the host and gets nothing');
  toRep();
  ok(coins(rp2) === 50 && coins(hp2) === 500, 'a row applied twice pays nothing twice');
  /* the guest is short when the seat comes back: it stands again */
  const rep3 = AshCore.create(D, { seed: 'r3' }), rp3 = rep3.addPlayer('me', { name: 'Broke' }); rep3.grantItem('me', 'coins', 20); rep3.setAuth(rep3.zoneOf(t2.x, t2.y), false);
  const ev3 = rep3.S.ev = []; rep3.applyChess([{ t: t2.id, w: 'host', b: 'me', wn: 'Host', bn: 'Broke', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', status: 'playing', n: 0, v: 9, stake: 100, gid: 3, paid: null }]);
  ok(!rp3.seat && coins(rp3) === 20 && ev3.some(e => e.e === 'msg' && /cannot cover the stake/.test(e.text)), 'a player who cannot cover the stake when the row seats them stands up again, nothing taken');
}

/* [Claude 2026-10-11] IDLE: fifteen minutes without playing stands you up (the operator); and the opponent's pick travels */
{
  const c3 = AshCore.create(D, { seed: 'idle' }), t3 = T[2];
  const w3 = c3.addPlayer('pw', { name: 'Wren' }), b3 = c3.addPlayer('pb', { name: 'Aldric' });
  const run3 = (n) => { for (let i = 0; i < n; i++) c3.tick(); };
  w3.x = t3.seats[1][0]; w3.y = t3.seats[1][1]; b3.x = t3.seats[0][0]; b3.y = t3.seats[0][1];
  c3.cmd('pw', { c: 'sit', table: t3.id, seat: 1 }); c3.cmd('pb', { c: 'sit', table: t3.id, seat: 0 }); run3(5);
  ok(c3.chessOf(t3.id).status === 'playing', 'a game is on');
  const e3 = c3.S.ev = []; c3.cmd('pw', { c: 'csel', sq: 'e2' }); run3(1);
  ok(c3.chessOf(t3.id).sw === 'e2' && c3.chessRow(t3.id).sw === 'e2' && e3.some(e => e.e === 'chess' && e.sw === 'e2'), "White picks up e2: the table says so in its row, so Black's board lights it too");
  c3.cmd('pw', { c: 'cmove', from: 'e2', to: 'e4' }); run3(1);
  ok(c3.chessOf(t3.id).sw === null && c3.chessOf(t3.id).moves.length === 1, 'the move puts it down: nothing is picked up');
  c3.cmd('pb', { c: 'csel', sq: 'e7' }); run3(1); c3.cmd('pb', { c: 'csel', sq: '' }); run3(1);
  ok(c3.chessOf(t3.id).sb === null, 'a pick can be put back');
  c3.S.t += 1400; run3(10);
  ok(w3.seat && b3.seat && c3.chessOf(t3.id).status === 'playing', 'fourteen minutes in, both still sit');
  c3.cmd('pb', { c: 'csel', sq: 'e7' }); run3(1);
  c3.S.t += 110; run3(10);
  const st3 = c3.chessOf(t3.id);
  ok(!w3.seat && b3.seat && st3.status === 'over' && st3.result === '0-1' && st3.why === 'idle', 'fifteen minutes after her last play Wren is stood up and the game is hers to lose: ' + st3.result + ' (' + st3.why + '); Aldric, who moved a piece, stays');
  c3.S.t += 1500; run3(10);
  ok(!b3.seat && c3.chessOf(t3.id).status === 'open', 'and Aldric follows when his fifteen minutes run out');
}
