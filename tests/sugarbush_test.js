'use strict';
/* The sugar bush (2026-10-08, handoff/sugarbush_plan.md): peel wiigwaas off a birch (once a year per tree), trade a deer
   hide to Ma'iingan for ojiitad, Migizi folds a biskitenaagan a game day later, tap a maple in the sap run (once a day per tree,
   one sap per bucket), boil sap to syrup and syrup to candy at a fire (the bucket comes back), and Nookomis's quest: sap, syrup,
   candy - the Quillwork makak the first spring, other thanks after. node tests/sugarbush_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'ziibiing', 'sugarcamp'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

const core = AshCore.create(D, { seed: 'sugarbush' }), p = core.addPlayer('p1', {});
for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
const npc = (id) => core.M.npcs.find(n => n.id === id), has = (id) => p.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
const msgs = [];
function run(n) { for (let i = 0; i < n; i++) for (const e of core.tick()) { if (e.e === 'msg' && e.p === 'p1') msgs.push(e.text); if (e.e === 'dialog' && e.p === 'p1') msgs.push(e.lines.join(' ')); } }
function talk(id) {
  const n = npc(id); msgs.length = 0;
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (core.M.blocked(n.x + dx, n.y + dy)) continue;
    p.x = n.x + dx; p.y = n.y + dy; p.path = []; p.act = null;
    core.cmd('p1', { c: 'npc', id }); run(3); if (msgs.length) return msgs.join(' | ');
  }
  return msgs.join(' | ');
}
function work(x, y, extra) {   /* stand beside the tree and work it */
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (!core.M.blocked(x + dx, y + dy)) { p.x = x + dx; p.y = y + dy; break; }
  p.path = []; msgs.length = 0; core.cmd('p1', Object.assign({ c: 'gather', x, y }, extra || {})); run(12); return msgs.join(' | ');
}
/* the trees ringing the sugar camp */
const cz = zones.find(z => z.id === 'sugarcamp'), trees = { E: [], M: [] };
cz.tiles.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (trees[r[i]] && core.nodeAt(core.M.key(cz.origin[0] + i, cz.origin[1] + j))) trees[r[i]].push([cz.origin[0] + i, cz.origin[1] + j]); });
ok(trees.E.length >= 2 && trees.M.length >= 2, 'birches (' + trees.E.length + ') and maples (' + trees.M.length + ') stand round the sugar camp');
ok(['campfire', 'kettle', 'barklodge'].every(k => cz.objects.some(o => o.k === k)), 'the camp has its fire, the kettle frame and the bark lodge');

const day = 500, year = 2, nature = (sap, dd, yy) => core.setNature({ day: dd || day, year: yy || year, sap });
const RUN = { season: true, day: true, low: -5, high: 6, left: 6 }, OFF = { season: false, day: false, low: -15, high: -6, left: 0 };
nature(OFF);
/* birch bark */
let t = work(trees.E[0][0], trees.E[0][1]);
ok(has('wiigwaas') === 1 && /wiigwaas/.test(t), 'no axe: tapping a birch peels a sheet of wiigwaas (' + t.slice(0, 60) + ')');
t = work(trees.E[0][0], trees.E[0][1]);
ok(has('wiigwaas') === 1 && /this year/.test(t), 'the same birch will not give again this year');
p.inv[20] = { id: 'hatchet', n: 1 };
t = work(trees.E[1][0], trees.E[1][1], { peel: 1 });
ok(has('wiigwaas') === 2, 'with an axe in the bag, "Peel bark" still peels (' + t.slice(0, 50) + ')');
p.inv[20] = null;
core.setMarks('bark', [[trees.E[2] ? trees.E[2][0] : trees.E[0][0], trees.E[2] ? trees.E[2][1] : trees.E[0][1], year]]);
if (trees.E[2]) { t = work(trees.E[2][0], trees.E[2][1]); ok(has('wiigwaas') === 2 && /this year/.test(t), 'a birch someone else peeled this year (from the Bank) will not give'); }
/* sinew and the bucket */
p.inv[10] = { id: 'deer_hide', n: 1 };
t = talk('maiingan');
ok(has('sinew') === 2 && !has('deer_hide'), "Ma'iingan trades two ojiitad for a deer hide (" + t.slice(0, 60) + ')');
t = talk('migizi');
ok(!has('wiigwaas') && has('sinew') === 1 && /tomorrow/.test(t), 'Migizi takes two wiigwaas and an ojiitad and folds the bucket');
t = talk('migizi');
ok(!has('bucket_bark') && /drying/.test(t), 'the same day it is still drying');
nature(OFF, day + 1);
t = talk('migizi');
ok(has('bucket_bark') === 1, 'the next game day the biskitenaagan is ready');
/* sap */
p.inv[11] = { id: 'pail', n: 1 };
t = work(trees.M[0][0], trees.M[0][1]);
ok(!has('sap_bark') && /not running/.test(t), 'out of the sap run a maple gives nothing (' + t.slice(0, 60) + ')');
nature({ season: true, day: false, low: 2, high: 9, left: 8 }, day + 1);
t = work(trees.M[0][0], trees.M[0][1]);
ok(!has('sap_bark') && /did not freeze/.test(t), 'in the run, a night that did not freeze: no sap today');
nature(RUN, day + 2);
t = work(trees.M[0][0], trees.M[0][1]);
ok(has('sap_bark') + has('sap_pail') === 1, 'a thaw after a frost: one bucket fills with sap (' + t.slice(0, 60) + ')');
t = work(trees.M[0][0], trees.M[0][1]);
ok(has('sap_bark') + has('sap_pail') === 1 && /today/.test(t), 'the same maple will not give again today');
t = work(trees.M[1][0], trees.M[1][1]);
ok(has('sap_bark') === 1 && has('sap_pail') === 1, 'another maple fills the other bucket: one sap per bucket');
t = work(trees.M[2] ? trees.M[2][0] : trees.M[1][0], trees.M[2] ? trees.M[2][1] : trees.M[1][1]);
ok(/empty/.test(t), 'with no empty bucket left there is nothing to catch the sap in');
/* the quest, and boiling */
t = talk('nookomis');
ok(p.quests.sugar_bush && p.quests.sugar_bush.step === 1 && /ziinzibaakwadwaaboo/.test(t), 'Nookomis gives the sugar bush quest');
t = talk('nookomis');
ok(p.quests.sugar_bush.step === 2 && has('sap_bark') + has('sap_pail') === 1, 'she takes one bucket of sap (step 1 done)');
const fire = npc('nookomis') && core.M.npcs ? null : null; void fire;
const F = cz.objects.find(o => o.k === 'campfire');
const cook = () => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!core.M.blocked(F.x + dx, F.y + dy)) { p.x = F.x + dx; p.y = F.y + dy; break; } msgs.length = 0; core.cmd('p1', { c: 'gather', x: F.x, y: F.y }); run(10); p.act = null; p.skilling = null; return msgs.join(' | '); };
const sapLeft = has('sap_bark') ? 'bark' : 'pail';
t = cook();
ok(has('syrup_' + sapLeft) === 1 && !has('sap_' + sapLeft), 'the sap boils down to syrup in the same bucket at the camp fire (' + t.slice(0, 50) + ')');
t = talk('nookomis');
ok(p.quests.sugar_bush.step === 3 && !has('syrup_' + sapLeft), 'she takes the syrup (step 2 done)');
/* make a candy: another sap, syrup, candy */
nature(RUN, day + 3);
work(trees.M[0][0], trees.M[0][1]);
const b2 = has('sap_bark') ? 'bark' : 'pail'; cook(); cook();
ok(has('maple_candy') === 1 && has(b2 === 'bark' ? 'bucket_bark' : 'pail') >= 1, 'syrup boils again to ziinzibaakwadoons, and the bucket comes back empty');
const e0 = p.energy = 1000; p.inv[25] = { id: 'maple_candy', n: 1 }; core.cmd('p1', { c: 'eat', slot: 25 }); run(1);
ok(p.energy > e0 + 2000, 'a piece of candy gives back a run of energy (' + e0 + ' -> ' + p.energy + ')');
t = talk('nookomis');
ok(questDone() && has('quill_makak') === 1, 'the candy finishes it: Nookomis gives the Quillwork makak (' + t.slice(0, 40) + ')');
function questDone() { return p.quests.sugar_bush.step > D.quests.quests.sugar_bush.steps.length; }
ok(D.items.quill_makak && D.items.quill_makak.nft && D.items.quill_makak.attributes.some(a => a.trait_type === 'Carry' && a.value > 80), 'the makak is an NFT pack that carries more than any other pack');
/* next spring */
nature(RUN, day + 370, year + 1);
t = talk('nookomis');
ok(p.quests.sugar_bush.step === 1 && p.quests.sugar_bush.again, 'next spring she asks again (' + t.slice(0, 50) + ')');
/* Nookomis walks up to the camp while the sap runs */
const N = npc('nookomis'), home = [N.hx != null ? N.hx : N.x, N.hy != null ? N.hy : N.y];
run(400);
ok(N.x === N.sapAt[0] && N.y === N.sapAt[1], 'in the sap run Nookomis walks up to the sugar camp (' + N.x + ',' + N.y + ')');
nature(OFF, day + 400, year + 1); run(400);
ok(N.x === home[0] && N.y === home[1], 'and home to the village fire after (' + N.x + ',' + N.y + ')');
console.log(fails ? 'FAILED: ' + fails : 'ALL OK');
