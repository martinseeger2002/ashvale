'use strict';
/* A Ziibiing-born is never told about the town (2026-10-08/09: "as if it's a fully different game"; Ma'iingan still spoke of
   "the stone town up the hill"). Talk to every person of the village, its wigwams, the rice lake and the sugar camp as a
   Ziibiing-born, examine them, read the home's welcome, help and wake lines, the starting kit and the quests they give, and fail
   on any word that points past the woods. An Ashvale-born still hears the old words. node tests/ziibiing_home_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const HOMEZ = ['ziibiing', 'lodges', 'ricelake', 'sugarcamp', 'flintbank', 'obsidianbank', 'willowbank'];
const zones = ['village'].concat(HOMEZ).map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const BAD = /ashvale|stone town|the town|the valley|town up|over the hill/i;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

function heard(home) {
  const core = AshCore.create(D, { seed: 'zhome' }); core.setNewHome(home); const p = core.addPlayer('p1', null), out = {};
  const ids = HOMEZ.flatMap(z => (zones.find(q => q.id === z).npcs || []).map(n => n.id));
  for (const id of ids) {
    const n = core.M.npcs.find(q => q.id === id); if (!n) continue; const said = [];
    for (let k = 0; k < 4; k++) {   /* several talks: lines that rotate */
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (core.M.blocked(n.x + dx, n.y + dy)) continue; p.x = n.x + dx; p.y = n.y + dy; break; }
      p.path = []; p.act = null; core.cmd('p1', { c: 'npc', id });
      for (let i = 0; i < 3; i++) for (const e of core.tick()) { if (e.p !== 'p1') continue; if (e.e === 'msg') said.push(e.text); if (e.e === 'dialog') said.push(e.lines.join(' ')); }
    }
    const nn = core.npcFor(p, n); said.push(nn.examine || '');
    for (const qid in D.quests.quests) { const Q = D.quests.quests[qid]; if (Q.giver === id) for (const st of Q.steps.concat([{ talk: [].concat(Q.again || [], Q.done || [], Q.notYet || [], Q.askLackTalk || [], Q.askSay ? [Q.askSay] : []) }])) for (const k of ['talk', 'progress', 'complete']) for (const l of st[k] || []) { const t = core.lineFor(p, l); if (t != null) said.push(t); } }   /* every step's words, as this home hears them */
    out[id] = said.join(' | ');
  }
  return { core, p, out };
}
const Z = heard('ziibiing');
const Z0 = (() => { const c = AshCore.create(D, { seed: 'z0' }); c.setNewHome('ziibiing'); const q = c.addPlayer('p0', null); return [q.x, q.y]; })();
for (const id in Z.out) { const m = Z.out[id].match(BAD); ok(!m, id + ' never points past the woods to a Ziibiing-born' + (m ? ' - says "' + Z.out[id].slice(Math.max(0, m.index - 50), m.index + 40) + '"' : '')); }
const H = D.rules.homes.ziibiing;
for (const t of [H.first, H.wakeSay].concat(H.help)) ok(!BAD.test(t), 'home text: ' + String(t).slice(0, 50));
for (const s of Z.p.inv.filter(Boolean)) { const it = Z.core.item(s.id); ok(!BAD.test(it.examine || it.desc || ''), 'starting kit: ' + it.name); }
ok(!Z.p.inv.some(s => s && Z.core.item(s.id).category === 'currency' || s && s.id === 'coins'), 'a Ziibiing-born starts with no gold (2026-10-09: no gold currency in the village)');
ok(Z0[0] === H.spawn[0] && Z0[1] === H.spawn[1], 'a Ziibiing-born wakes in Ningashi\'s wigwam');
for (const id of ['tomahawk', 'mitigwaab', 'birch_arrows', 'obsidian_arrows', 'flint', 'obsidian', 'snare', 'asemaa', 'willow_bark', 'apaakozigan']) ok(!BAD.test(D.items[id].description), 'a Ziibiing thing never says it was made elsewhere: ' + D.items[id].name);
ok(!BAD.test(D.rules.homes.ziibiing.offerHint) && !BAD.test(D.rules.items.offers.tobacco.say), 'the asemaa (tobacco) reminder and offering say nothing of the town');
{ const J = D.rules.nodes.J; ok(![J.peel.say, J.peel.noTool, J.peel.again, D.rules.items.fireMix[0].say].some(l => BAD.test(l)), 'the red willow and the kinnikinnick say nothing of the town'); }
{ const T = D.rules.items.traps.snare; for (const k of ['say', 'none', 'empty', 'caught']) ok(!BAD.test(T[k]), 'the snare says nothing of the town: ' + k); }
ok(['biiwaanag', 'mitigwaab', 'deer_hunt', 'obsidian_arrows'].every(q => D.quests.quests[q] && (D.quests.quests[q].homes || []).join() === 'ziibiing'), 'the four beginning quests are for the Ziibiing-born only');
ok(!!Z.core.M.npcs.find(n => n.id === 'mitigwaabiike'), 'Mitigwaabiike works in the village');
const A = heard('ashvale');
ok(/stone town/.test(A.out.maiingan), 'an Ashvale-born still hears Ma\'iingan speak of the stone town');
/* the town's quests are never a Ziibiing-born's (2026-10-09: "we shouldn't see quests from a character made in Ashvale in our fresh character on Ziibiing") */
{ const qs = D.quests.quests, zq = Object.keys(qs).filter(id => Z.core.questForHome(qs[id], Z.p)), aq = Object.keys(qs).filter(id => A.core.questForHome(qs[id], A.p));
  ok(zq.every(id => (qs[id].homes || []).indexOf('ziibiing') >= 0), 'a Ziibiing-born is offered only Ziibiing quests: ' + zq.join(', '));
  ok(['iria_supper', 'red_pyre', 'ashen_crown'].every(id => !qs[id] || zq.indexOf(id) < 0), 'the town\'s quests are not in a Ziibiing-born\'s list');
  ok(['iria_supper', 'red_pyre'].every(id => !qs[id] || aq.indexOf(id) >= 0) && aq.indexOf('mitigwaab') < 0, 'an Ashvale-born keeps the town\'s quests and never gets the Ziibiing-only ones');
  ok(Object.keys(Z.p.quests || {}).length === 0, 'a fresh Ziibiing-born carries no quest progress'); }
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
