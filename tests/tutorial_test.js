/* Tutorial Island (2026-10-19, tools/tutorial): a new character of Ashvale starts on the island, is brought back if they come off it before
   the tutorial is done, and crosses to Ashvale when it is; a saved character and ?notut are not sent there; the lesson's quest stands.
   node tests/tutorial_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort((a, b) => { const O = ['village', 'whisperwood', 'saltmere'], ia = O.indexOf(a), ib = O.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); }).map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const T = D.rules.tutorial, Q = D.quests.quests[T.quest], Z = zones.find(z => z.id === T.zone);
ok(T && Q && Z, 'the tutorial, its quest and its island exist');
ok(['tut_guide', 'tut_survival', 'tut_farmer', 'tut_combat', 'tut_ferryman'].every(id => Z.npcs.some(n => n.id === id)) && Z.fishing.some(m => m.fish === 'shrimp_raw') && Z.objects.some(o => o.k === 'farmpatch') && Z.spawns.filter(s => s.m === 'tut_rat').length >= 2, 'the island has its five guides, a fishing spot, a patch and rats');
ok(Q.steps.length === 20 && Q.steps[0].goal.talk === 'tut_guide' && Q.steps[Q.steps.length - 1].goal.talk === 'tut_ferryman' && ['journal', 'equip', 'eat', 'ranged', 'magic', 'bank_in', 'bank_out', 'wallet', 'buy', 'sell', 'bury', 'pray'].every(k => Q.steps.some(s => s.goal.do === k)), 'the lesson: every station, from the guide to the ferry (' + Q.steps.length + ' steps)');
ok(Q.steps.every(s => s.hint && s.talk.length > 1 && s.complete.length), 'every step has a hint for the goal box, two lines to start and a cheer to end');
const core = AshCore.create(D, { seed: 'tut', tutorial: true }), run = n => { for (let i = 0; i < n; i++) core.tick(); };
const p = core.addPlayer('new', null);
ok(p.tut === 1 && core.M.zoneAt(p.x, p.y) === T.zone, 'a new character wakes on the island (' + p.x + ',' + p.y + ')');
ok(p.quests[T.quest] && p.quests[T.quest].step === 1, 'with the tutorial already begun - no offer to accept');
p.x = 20; p.y = 50; p.path = []; run(2);
ok(core.M.zoneAt(p.x, p.y) === T.zone, 'off the island before the end, they are brought back');
p.quests[T.quest] = { step: Q.steps.length + 1, n: 0 }; run(2);
ok(!p.tut && core.M.zoneAt(p.x, p.y) !== T.zone, 'with the tutorial done they cross to the village (' + p.x + ',' + p.y + ')');
const old = core.addPlayer('old', { home: 'ashvale', xp: { hitpoints: 1200 } });
ok(!old.tut, 'a saved character is not sent to the island');
const c2 = AshCore.create(D, { seed: 'tut2' }), p2 = c2.addPlayer('dev', null);
ok(!p2.tut && c2.M.zoneAt(p2.x, p2.y) !== T.zone, 'without the game asking (?notut, a test, a tool) a new character starts in the village');
// the island's trees grow back (2026-10-24): every new player fells one for the first campfire
{
  const c3 = AshCore.create(D, { seed: 'tut3', tutorial: true }), q = c3.addPlayer('chopper', null);
  let tree = null;
  for (let y = Z.origin[1]; y < Z.origin[1] + Z.size[1] && !tree; y++) for (let x = Z.origin[0]; x < Z.origin[0] + Z.size[0] && !tree; x++)
    if (c3.M.tileAt(x, y) === 'T' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !c3.M.blocked(x + dx, y + dy))) tree = [x, y];
  ok(!!tree, 'the island has a tree to chop');
  const [tx, ty] = tree, side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !c3.M.blocked(tx + dx, ty + dy)), k = c3.M.key(tx, ty);
  q.inv[0] = { id: 'hatchet', n: 1 }; q.x = tx + side[0]; q.y = ty + side[1]; q.path = [];
  for (let n = 0; n < 3000 && !c3.S.dep[k]; n++) { if (!q.act) c3.cmd(q.id, { c: 'gather', x: tx, y: ty }); c3.tick(); }
  ok(!!c3.S.dep[k] && c3.S.dep[k] - c3.S.t <= (T.treeRegrow || 50) && !c3.S.fell[k], 'an island tree felled is down for a while, not for good');
  for (let n = 0; n < (T.treeRegrow || 50) + 2; n++) c3.tick();
  ok(!c3.S.dep[k], 'and it stands again');
  c3.setFelled([[tx, ty]]);
  ok(!c3.S.dep[k], "the Bank's shared list of felled trees does not fell it for good");
}
console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
