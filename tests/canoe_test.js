'use strict';
/* Two in a canoe (2026-10-08): without the tools the second player just gets in and paddles; ricing needs a
   gaandakii'iganaak (push pole) in the stern and bawa'iganaakoog (knockers) in the bow. Ziigwan carves both, from two
   tamarack and two cedar logs, ready the next game day. node tests/canoe_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'ziibiing', 'ricelake'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const core = AshCore.create(D, { seed: 'canoe' }), A = core.addPlayer('a', {}), B = core.addPlayer('b', {});
for (const p of [A, B]) for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
const msgs = { a: [], b: [] };
const run = (n) => { for (let i = 0; i < n; i++) for (const e of core.tick()) { if (e.e === 'msg' && msgs[e.p]) msgs[e.p].push(e.text); if (e.e === 'dialog' && msgs[e.p]) msgs[e.p].push(e.lines.join(' ')); } };
const has = (p, id) => p.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
core.setSeason({ rice: true });
/* A sits in a canoe on the rice lake, beside the manoomin */
const rz = zones.find(z => z.id === 'ricelake'), rice = rz.objects.find(o => o.k === 'rice');
A.x = rice.x; A.y = rice.y; A.boat = 1;
const shore = (() => { for (let r = 1; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = A.x + dx, y = A.y + dy; if (!core.M.blocked(x, y) && !'~vJB'.includes(core.M.tileAt(x, y))) return [x, y]; } return null; })();
function climbIn() {
  B.boat = 0; B.ride = null; B.knock = false; B.x = A.x + 1; B.y = A.y; msgs.b.length = 0;
  core.cmd('b', { c: 'ride', pid: 'a' }); run(4); return msgs.b.join(' | ');
}
let t = climbIn();
ok(B.boat === 2 && B.ride === 'a' && !B.knock && /paddle/.test(t), 'no tools: the second player just gets in with a paddle (' + t.slice(0, 50) + ')');
run(60);
ok(!has(B, 'wild_rice'), 'and knocks no rice, however long they sit in the manoomin');
core.cmd('b', { c: 'walk', x: shore ? shore[0] : A.x, y: shore ? shore[1] : A.y }); run(4);
B.inv[3] = { id: 'knockers', n: 1 };
t = climbIn();
ok(B.boat === 2 && !B.knock, 'knockers in the bow but no push pole in the stern: still just paddling');
A.inv[3] = { id: 'push_pole', n: 1 };
B.boat = 0; B.ride = null;
t = climbIn();
ok(B.boat === 2 && B.knock && /bawa'iganaakoog|ricing/i.test(t), 'a push pole in the stern and knockers in the bow: ricing (' + t.slice(0, 60) + ')');
run(90);
ok(has(B, 'wild_rice') > 0, 'the knocker brings in manoomin as the canoe passes it (' + has(B, 'wild_rice') + ' handfuls)');
/* Ziigwan carves them */
const Z = core.M.npcs.find(n => n.id === 'ziigwan'), C = core.addPlayer('c', {});
for (let i = 0; i < C.inv.length; i++) C.inv[i] = null;
msgs.c = [];
core.setNature({ day: 900, year: 3, sap: { season: false } });
C.inv[1] = { id: 'tamarack_logs', n: 2 }; C.inv[2] = { id: 'cedar_logs', n: 2 };
const talk = () => { msgs.c.length = 0; for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { if (core.M.blocked(Z.x + dx, Z.y + dy)) continue; C.x = Z.x + dx; C.y = Z.y + dy; C.path = []; core.cmd('c', { c: 'npc', id: 'ziigwan' }); run(3); if (msgs.c.length) break; } return msgs.c.join(' | '); };
t = talk(); ok(!has(C, 'tamarack_logs') && /tomorrow/.test(t), 'Ziigwan takes two tamarack logs for the push pole');
t = talk(); ok(!has(C, 'cedar_logs') && /tomorrow/.test(t), 'and two cedar logs for the knockers');
t = talk(); ok(!has(C, 'push_pole') && /tomorrow/.test(t), 'the same day they are not ready');
core.setNature({ day: 901, year: 3, sap: { season: false } });
talk(); talk();
ok(has(C, 'push_pole') === 1 && has(C, 'knockers') === 1, 'the next game day she hands over the gaandakii\'iganaak and the bawa\'iganaakoog');
const I = D.items;
ok(I.push_pole.attributes.some(a => a.trait_type === 'English' && a.value === 'push pole') && I.knockers.attributes.some(a => a.value === 'ricing sticks'), 'their English names ride with them');
ok(D.rules.nodes.Q && D.rules.nodes.Q.item === 'cedar_logs' && D.rules.nodes.L.item === 'tamarack_logs' && D.rules.nodes.Q.req === 20, 'cedar and tamarack trees give their logs at woodcutting 20');
console.log(fails ? 'FAILED: ' + fails : 'ALL OK');
