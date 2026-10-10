'use strict';
/* Asemaa (tobacco) (2026-10-09, handoff/ziibiing_seasons_snare_canoe_plan.md section 5): a Ziibiing-born starts with five;
   the elders (Mishoomis, Nookomis) are asked with one, and with none they say so kindly; every Ziibiing quest gives three; an
   offering from the bag gives Prayer XP as for bones and blesses the ground round you for the rest of the game day - better
   harvests there (here: the snare sometimes holds two) - and a Ziibiing-born who starts a harvest on unblessed ground is reminded,
   once per place and day, and is never stopped. An Ashvale-born is never reminded.
   node tests/ziibiing_asemaa_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'ziibiing', 'lodges', 'sugarcamp', 'flintbank', 'obsidianbank', 'willowbank'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
function born(home, seed, keep) {
  const core = AshCore.create(D, { seed: seed || 'zasem' }); core.setNewHome(home); const p = core.addPlayer('p1', null);
  if (!keep) for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
  const msgs = [], offers = [];
  const run = (n) => { for (let i = 0; i < n; i++) for (const e of core.tick()) { if (e.p !== 'p1') continue; if (e.e === 'msg') msgs.push(e.text); if (e.e === 'dialog') { msgs.push(e.lines.join(' ')); if (e.offer) offers.push(e.offer); } } };
  const near = (x, y) => { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (!core.M.blocked(x + dx, y + dy)) { p.x = x + dx; p.y = y + dy; return; } };
  const talk = (id) => { const n = core.M.npcs.find(q => q.id === id); near(n.x, n.y); p.path = []; p.act = null; msgs.length = 0; offers.length = 0; core.cmd('p1', { c: 'npc', id }); run(3); return msgs.join(' | '); };
  const has = (id) => p.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
  const give = (id, n) => core.grantItem('p1', id, n || 1);
  const slot = (id) => p.inv.findIndex(s => s && s.id === id);
  return { core, p, run, talk, has, give, slot, msgs, offers };
}
/* the starting five */
{
  const Z = born('ziibiing', 'k1', true), A = born('ashvale', 'k2', true);
  ok(Z.has('asemaa') === 5, 'a Ziibiing-born starts with five asemaa (tobacco)');
  ok(!A.has('asemaa'), 'an Ashvale-born starts with none');
  ok(Z.core.item('asemaa').stack, 'asemaa stacks, like Gold');
}
/* the elders are asked with it */
{
  const Z = born('ziibiing', 'k3');
  let t = Z.talk('mishoomis');
  ok(!Z.offers.length && /bring a little asemaa \(tobacco\)/.test(t), 'with none, Mishoomis kindly says to bring asemaa (' + t.slice(0, 60) + ')');
  Z.core.cmd('p1', { c: 'acceptq', q: 'biiwaanag' }); Z.run(1);
  ok(!Z.p.quests.biiwaanag, 'and the quest cannot be begun without it');
  Z.give('asemaa', 1); t = Z.talk('mishoomis');
  ok(Z.offers[0] === 'biiwaanag' && /offer Mishoomis one asemaa/.test(t), 'with one, he offers the teaching, and says the asemaa goes with your yes');
  Z.core.cmd('p1', { c: 'acceptq', q: 'biiwaanag' }); Z.run(1);
  ok(Z.p.quests.biiwaanag && !Z.has('asemaa'), 'saying yes offers the asemaa');
  /* done: three back */
  Z.p.quests.biiwaanag.n = 1; t = Z.talk('mishoomis');
  ok(Z.p.quests.biiwaanag.step === 2 && Z.has('asemaa') === 3, 'a Ziibiing quest done gives three asemaa (' + Z.has('asemaa') + ')');
  const N = born('ziibiing', 'k4'); t = N.talk('nookomis');
  ok(!N.offers.length && /asemaa/.test(t), 'Nookomis is an elder too: asked with asemaa');
  const G = born('ziibiing', 'k5'); t = G.talk('maiingan');
  ok(G.offers[0] === 'waabooz', "Ma'iingan asks nothing for his quest");
}
/* the offering */
{
  const Z = born('ziibiing', 'k6', true), core = Z.core, p = Z.p;
  core.setNature({ day: 50, year: 1, hours: 1200 });
  p.x = 92; p.y = 550; const x0 = p.xp.prayer | 0;
  core.cmd('p1', { c: 'use', slot: Z.slot('asemaa') }); Z.run(1);
  ok(Z.has('asemaa') === 4, 'an offering spends one');
  ok((p.xp.prayer | 0) - x0 === core.item('bones').buryXp, 'and gives Prayer XP as for burying bones (' + ((p.xp.prayer | 0) - x0) + ')');
  ok(core.isBlessed('p1', 95, 552) && !core.isBlessed('p1', 92, 600), 'the ground round you is blessed, not far away');
  core.setNature({ day: 51, year: 1, hours: 1224 });
  ok(!core.isBlessed('p1', 92, 550), 'the next game day it is not');
}
/* the reminder: once per place and day, never a block; never to an Ashvale-born */
{
  const Z = born('ziibiing', 'k7'), core = Z.core, p = Z.p; Z.give('tomahawk');
  core.setNature({ day: 60, year: 1, hours: 1440 });
  const cz = zones.find(z => z.id === 'sugarcamp'), E = [];
  cz.tiles.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'E' && core.nodeAt(core.M.key(cz.origin[0] + i, cz.origin[1] + j))) E.push([cz.origin[0] + i, cz.origin[1] + j]); });
  const peel = (e) => { for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (!core.M.blocked(e[0] + dx, e[1] + dy)) { p.x = e[0] + dx; p.y = e[1] + dy; break; } Z.msgs.length = 0; core.cmd('p1', { c: 'gather', x: e[0], y: e[1], peel: 1 }); Z.run(12); return Z.msgs.join(' | '); };
  E.sort((a, b) => Math.hypot(a[0] - E[0][0], a[1] - E[0][1]) - Math.hypot(b[0] - E[0][0], b[1] - E[0][1]));   /* birches close together: one place */
  let t = peel(E[0]);
  ok(/Biindaakoojige \(offer tobacco\)/.test(t) && Z.has('wiigwaas') >= 1, 'the first harvest on unblessed ground: a gentle reminder, and the bark still comes');
  t = peel(E[1]); ok(!/Biindaakoojige/.test(t), 'the second harvest nearby that day: no reminder again (' + JSON.stringify([E[0], E[1]]) + ' ' + t.slice(0, 90) + ')');
  core.setNature({ day: 61, year: 1, hours: 1464 }); t = peel(E[2]);
  ok(/Biindaakoojige/.test(t), 'the next day, once again');
  core.setNature({ day: 62, year: 1, hours: 1488 }); p.x = E[3][0]; p.y = E[3][1] + 2; Z.give('asemaa', 1); core.cmd('p1', { c: 'use', slot: Z.slot('asemaa') }); Z.run(1); t = peel(E[3]);
  ok(!/Biindaakoojige/.test(t), 'after an offering there: no reminder');
  const A = born('ashvale', 'k8'); A.give('hatchet'); A.core.setNature({ day: 60, year: 1, hours: 1440 });
  const ap = A.p, e = E[4]; for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (!A.core.M.blocked(e[0] + dx, e[1] + dy)) { ap.x = e[0] + dx; ap.y = e[1] + dy; break; }
  A.msgs.length = 0; A.core.cmd('p1', { c: 'gather', x: e[0], y: e[1], peel: 1 }); A.run(12);
  ok(!/Biindaakoojige/.test(A.msgs.join()) && A.has('wiigwaas') >= 1, 'an Ashvale-born is never reminded');
}
/* a better harvest on blessed ground: the snare sometimes holds two */
{
  const count = (bless) => {
    const Z = born('ziibiing', bless ? 'k9b' : 'k9u'), core = Z.core, p = Z.p; Z.give('snare'); let doubles = 0, h = 2000;
    for (let k = 0; k < 40; k++) {
      core.setNature({ day: Math.floor(h / 24), year: 1, hours: h });
      const hz = core.S.mobs.find(m => m.key === 'hare' && !m.dead);
      let s = null; for (let r = 1; r < 5 && !s; r++) for (let dy = -r; dy <= r && !s; dy++) for (let dx = -r; dx <= r && !s; dx++) if (!core.M.blocked(hz.x + dx, hz.y + dy) && !core.M.insideAt(hz.x + dx, hz.y + dy)) s = [hz.x + dx, hz.y + dy];
      p.x = s[0]; p.y = s[1];
      if (bless) { Z.give('asemaa', 1); core.cmd('p1', { c: 'use', slot: Z.slot('asemaa') }); Z.run(1); }
      core.cmd('p1', { c: 'use', slot: Z.slot('snare') }); Z.run(1);
      const t = p.traps[0]; const before = Z.has('hare_raw');
      core.setNature({ day: Math.floor((h + 3) / 24), year: 1, hours: h + 2.01 });
      if (Math.floor((h + 2.01) / 24) !== Math.floor(h / 24)) core.setNature({ day: Math.floor(h / 24), year: 1, hours: h + 2.01 });
      core.cmd('p1', { c: 'trap', x: t.x, y: t.y }); Z.run(3);
      if (Z.has('hare_raw') - before === 2) doubles++;
      for (let i = 0; i < p.inv.length; i++) if (p.inv[i] && /hare/.test(p.inv[i].id)) p.inv[i] = null;
      h += 3;
    }
    return doubles;
  };
  const b = count(true), u = count(false);
  ok(b >= 4 && b <= 18 && u === 0, 'on blessed ground the snare sometimes holds two (' + b + ' of 40), never elsewhere (' + u + ')');
}
/* apaakozigan (kinnikinnick): red willow bark by the river, mixed with asemaa at a fire (section 6) */
{
  const wz = zones.find(z => z.id === 'willowbank'), J = [];
  wz.tiles.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'J') J.push([wz.origin[0] + i, wz.origin[1] + j]); });
  const lx = 89, ly = 621, far = J.map(q => Math.hypot(q[0] - lx, q[1] - ly));
  ok(J.length >= 4 && far.every(d => d > 30 && d < 120) && wz.objects.some(o => o.k === 'fishrack' && /Drying rack/.test(o.name)), 'miskwaabiimizh (red willow) clumps on the riverbank, a short paddle away, by a drying rack (' + J.length + ' clumps, ' + Math.round(far[0]) + ' tiles)');
  ok(J.every(q => q[1] > 450), 'south of the old woods wall, on the village side');
  const Z = born('ziibiing', 'k10'), core = Z.core, p = Z.p;
  core.setNature({ day: 70, year: 1, hours: 1680 });
  const peel = (q, extra) => { for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) if (!core.M.blocked(q[0] + dx, q[1] + dy)) { p.x = q[0] + dx; p.y = q[1] + dy; break; } Z.msgs.length = 0; core.cmd('p1', Object.assign({ c: 'gather', x: q[0], y: q[1] }, extra || {})); Z.run(12); return Z.msgs.join(' | '); };
  let t = peel(J[0], { peel: 1 });
  ok(!Z.has('willow_bark') && /tomahawk or an axe/.test(t), 'without a blade no bark comes off (' + t.slice(0, 50) + ')');
  Z.give('tomahawk'); t = peel(J[0]);
  ok(Z.has('willow_bark') === 1 && !Z.has('logs'), 'with a tomahawk: red willow bark (it is only peeled, never chopped)');
  t = peel(J[0], { peel: 1 }); ok(Z.has('willow_bark') === 1 && /given its bark today/.test(t), 'once a day each clump');
  t = peel(J[1], { peel: 1 }); ok(Z.has('willow_bark') === 2, 'another clump gives');
  core.setNature({ day: 71, year: 1, hours: 1704 }); t = peel(J[0], { peel: 1 }); ok(Z.has('willow_bark') === 3, 'the next day it has grown back');
  const a0 = Z.has('asemaa'); Z.give('asemaa', 1);
  p.x = 92; p.y = 545; Z.msgs.length = 0; core.cmd('p1', { c: 'gather', x: 92, y: 543 }); Z.run(12);
  ok(Z.has('apaakozigan') === 3 && Z.has('willow_bark') === 1 && Z.has('asemaa') === a0 && /apaakozigan \(kinnikinnick\)/.test(Z.msgs.join()), 'at a fire: two bark and one asemaa make three apaakozigan (kinnikinnick)');
  const x0 = p.xp.prayer | 0; core.cmd('p1', { c: 'use', slot: Z.slot('apaakozigan') }); Z.run(1);
  ok(Z.has('apaakozigan') === 2 && (p.xp.prayer | 0) - x0 === core.item('bones').buryXp && core.isBlessed('p1', p.x, p.y), 'apaakozigan is offered exactly like asemaa: Prayer XP and the blessing');
  /* the elders take it too, before your plain asemaa */
  const E = born('ziibiing', 'k11'); E.give('apaakozigan', 1); let u = E.talk('mishoomis');
  ok(E.offers[0] === 'biiwaanag', 'with only apaakozigan, Mishoomis will teach');
  E.core.cmd('p1', { c: 'acceptq', q: 'biiwaanag' }); E.run(1);
  ok(E.p.quests.biiwaanag && !E.has('apaakozigan'), 'and it is what you offer');
  const F = born('ziibiing', 'k12'); F.give('asemaa', 1); F.give('apaakozigan', 1); F.talk('mishoomis'); F.core.cmd('p1', { c: 'acceptq', q: 'biiwaanag' }); F.run(1);
  ok(F.has('asemaa') === 1 && !F.has('apaakozigan'), 'with both, the mixture is given and the plain asemaa kept');
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
