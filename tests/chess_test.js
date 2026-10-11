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
