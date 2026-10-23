/* [Claude 2026-10-20] the Saltmere Links clubhouse (the operator: "a town portal and a bank chest ... a chess board"; "the town portal
   should only portal to and from Saltmere town portal and must be attuned by going to the clubhouse portal"), and its bank of
   Fortune Engines.  node tests/clubhouse_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg'), decor: mod('decor') };   /* decor: the railing's sections block (world.js stampDecor) */
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const core = AshCore.create(D, { seed: 'clubhouse' });
const p = core.addPlayer('p1', {});
const evs = []; const run = n => { for (let i = 0; i < n; i++) for (const e of core.tick()) evs.push(e); };
const at = (x, y) => { p.x = x; p.y = y; p.lv = 0; };
function touch(id) { evs.length = 0; core.cmd('p1', { c: 'npc', id: 'portal_' + id }); run(30); return evs.filter(e => e.e === 'portal' && e.p === 'p1').pop(); }
const G = D.rules.portals.find(P => P.id === 'golf'), S = D.rules.portals.find(P => P.id === 'saltmere');
ok(!!G && G.only && G.only.join() === 'saltmere', 'the clubhouse portal joins Saltmere alone');
const golf = zones.find(z => z.id === 'golf'), H = golf.objects.find(o => o.k === 'house');
const inside = (x, y) => x > H.x && x < H.x + H.w - 1 && y > H.y && y < H.y + H.h - 1;
const outside = (x, y) => !(x >= H.x && x < H.x + H.w && y >= H.y && y < H.y + H.h) && y > H.y + H.h - 1;   /* south of the clubhouse's back wall line: off the course */
const tileAt = (x, y) => golf.tiles[y - golf.origin[1]][x - golf.origin[0]];
ok(outside(G.x, G.y) && outside(G.to[0], G.to[1]) && ',.s'.includes(tileAt(G.x, G.y)) && ',.s'.includes(tileAt(G.to[0], G.to[1])), 'it stands outside the clubhouse, off the course, in the open (the operator: "put the town portal outside") (' + G.x + ',' + G.y + ')');
const rail = golf.objects.filter(o => o.k === 'iron_fence');
ok(rail.length > 500 && rail.every(o => o.solid && (o.ry === 0 || o.ry === 1.5708)), 'an iron railing round the course, every section solid (' + rail.length + ')');
ok(!golf.objects.some(o => o.x >= 640 && o.x <= 641 && o.y >= -118 && o.y <= -117 && o.k !== 'house') && !golf.npcs.some(n => n.x >= 640 && n.x <= 641 && n.y >= -118 && n.y <= -117), 'the south-east corner stays clear for the stairs');
const chest = golf.npcs.find(n => n.chest), chess = golf.objects.filter(o => o.k === 'chesstable'), fe = golf.objects.filter(o => o.k === 'fortune');
ok(!!chest && inside(chest.x, chest.y), 'a bank chest inside the clubhouse');
ok(chess.length === 1 && inside(chess[0].x, chess[0].y) && chess[0].seats.every(s => inside(s[0], s[1])), 'a chess table with both seats inside');
ok(fe.length === 9 && fe.every(o => inside(o.x, o.y) && inside(o.seat[0], o.seat[1]) && (o.lv | 0) === 1 && o.x === H.x + 1 && o.face === 'e'), 'Fortune Engines along the whole west wall upstairs (the operator), nine, each with its seat inside');
ok(!fe.some(o => !(o.lv | 0)), 'and none downstairs any more');
const taken = new Set([G.x + ',' + G.y, chest.x + ',' + chest.y, ...chess.map(o => o.x + ',' + o.y), ...chess.flatMap(o => o.seats.map(s => s.join())), ...fe.map(o => o.x + ',' + o.y), ...fe.map(o => o.seat.join()), ...golf.npcs.map(n => n.x + ',' + n.y)]);
ok(!taken.has(golf.returnTo.join()) && !taken.has('637,-117') && !taken.has(H.door[0] + ',' + (H.door[1] - 1)), 'the tiles a save and a golfer start on, and inside the door, stay clear');
// in Saltmere, never been to the clubhouse: Saltmere's portal does not offer it (it says it is not yet attuned)
at(S.to[0], S.to[1]); let e = touch('saltmere');
ok(e && !e.to.some(t => t.id === 'golf') && e.unknown.indexOf(G.name) >= 0, 'before you touch it there, Saltmere\'s portal lists the clubhouse as not yet attuned');
core.cmd('p1', { c: 'portal', to: 'golf' }); run(5);
ok(Math.max(Math.abs(p.x - G.to[0]), Math.abs(p.y - G.to[1])) > 5, 'and cannot take you there');
// walk in and touch it: attuned; it offers Saltmere only, even attuned to Ashvale and the castle
p.attuned = { ashvale: 1, saltmere: 1, castle: 1 };
at(G.to[0], G.to[1]); e = touch('golf');
ok(p.attuned.golf === 1, 'touching the clubhouse portal attunes you to it');
ok(e && e.to.map(t => t.id).join() === 'saltmere' && !e.unknown.length, 'the clubhouse portal offers Saltmere alone: ' + JSON.stringify(e && e.to));
core.cmd('p1', { c: 'portal', to: 'ashvale' }); run(5);
ok(Math.max(Math.abs(p.x - G.to[0]), Math.abs(p.y - G.to[1])) <= 2, 'asked for Ashvale, it stays shut');
core.cmd('p1', { c: 'portal', to: 'saltmere' }); run(5);
ok(p.x === S.to[0] && p.y === S.to[1], 'it takes you to Saltmere');
e = touch('saltmere');
ok(e && e.to.some(t => t.id === 'golf'), 'now Saltmere\'s portal offers the Saltmere Links');
core.cmd('p1', { c: 'portal', to: 'golf' }); run(5);
ok(p.x === G.to[0] && p.y === G.to[1], 'and takes you back into the clubhouse');
// Ashvale's portal never offers the clubhouse
const A = D.rules.portals.find(P => P.id === 'ashvale'); at(A.to[0], A.to[1]); e = touch('ashvale');
ok(e && !e.to.some(t => t.id === 'golf') && e.unknown.indexOf(G.name) < 0, 'Ashvale\'s portal never offers it');
core.cmd('p1', { c: 'portal', to: 'golf' }); run(5);
ok(Math.max(Math.abs(p.x - A.to[0]), Math.abs(p.y - A.to[1])) <= 2, 'nor takes you there');
// 2026-10-20: "a door in the back of the clubhouse that allows people to walk from the golf course into the clubhouse, but not
// from the clubhouse into the golf course"
const BD = H.backdoor;
ok(!!BD && BD[1] === H.y && BD[0] > H.x && BD[0] < H.x + H.w - 1, 'a back door in the north wall, facing the course');
const walkTo = (x, y, n) => { core.cmd('p1', { c: 'walk', x, y }); run(n || 60); return p.x === x && p.y === y; };
at(BD[0], BD[1] - 2); ok(walkTo(BD[0], BD[1] + 2), 'from the course you walk in through the back door (' + p.x + ',' + p.y + ')');
at(BD[0], BD[1] + 1); walkTo(BD[0], BD[1] - 2);
ok(p.x >= H.x && p.x < H.x + H.w && p.y >= H.y && p.y < H.y + H.h, 'from inside it does not let you out onto the course - you stay in the clubhouse (' + p.x + ',' + p.y + ')');
process.exit(fails ? 1 : 0);
