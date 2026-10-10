'use strict';
/* Story points on every quest; the Ashen Crown's last step is Strength XP and fighter boots. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'spidercave'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones };
let fails = 0; const ok = (c, m) => { fails += !c; console.log(c ? 'ok  ' : 'FAIL', m); };

const Qs = D.quests.quests;
const ids = Object.keys(Qs);
ok(ids.length >= 20, ids.length + ' quests in the log');
ok(ids.every(id => (Qs[id].story | 0) >= 1 && (Qs[id].story | 0) <= 5), 'every quest has 1-5 story points by how hard it is');
ok(Qs.ashen_crown.story === 5, 'The Ashen Crown is five: wolves, chiefs, wraiths, the knight and the lich');
ok(Qs.wayside_prayer.story === 1 && Qs.biiwaanag.story === 1, 'a short talk or a first fire is one');
ok(Qs.red_pyre.story === 3 && Qs.even_guard.story === 3, 'the Red Pyre and the Even Guard are three');
const tot = ids.reduce((a, id) => a + (Qs[id].story | 0), 0);
ok(tot === 49, 'the valley has 49 story points in all (' + tot + ')');

const last = Qs.ashen_crown.steps[5];
ok(Array.isArray(last.reward) && last.reward.indexOf('xp:strength:8000') >= 0 && last.reward.indexOf('fighter_boots') >= 0, 'the last Ashen Crown step pays Strength XP and fighter boots');
ok((last.talk || []).length > 1 && (last.complete || []).join(' ').toLowerCase().indexOf('boot') >= 0, 'Maren says the boots aloud');

const boots = D.items.fighter_boots;
ok(!!boots, 'fighter boots exist');
ok(AshCore.validItem(boots, D.rules.items).ok, 'fighter boots pass validItem: ' + (AshCore.validItem(boots, D.rules.items).errors || []).join(','));
const core = AshCore.create(D, { seed: 'story' }), p = core.addPlayer('p1', { xp: { strength: D.rules.xp[15] * 10 } });
const it = core.item('fighter_boots');
ok(it && it.eq === 'feet' && it.strength === 10 && it.defence === 4, 'fighter boots: feet slot, Strength +10, Defence +4');

ok(core.storyPoints(p) === 0 && core.storyMax() === tot, 'a new character has 0 of ' + tot + ' story points');
p.quests.wayside_prayer = { step: 4, n: 0 };
ok(core.storyPoints(p) === 1, 'finishing the Wayside Prayer is one story point, even on an old save');
p.quests = {};

const maren = core.M.npcs.find(n => n.id === 'maren');
p.quests = { ashen_crown: { step: 6, n: 1 } };
p.x = maren.x + 1; p.y = maren.y;
const str0 = p.xp.strength, evs = [];
core.cmd('p1', { c: 'npc', id: 'maren' });
for (let i = 0; i < 4; i++) for (const e of core.tick()) evs.push(e);
ok(p.quests.ashen_crown.step === 7, 'handing the lich in finishes The Ashen Crown');
ok(p.xp.strength - str0 === 80000, '8000 Strength XP (in tenths: ' + (p.xp.strength - str0) + ')');
ok(p.inv.some(s => s && s.id === 'fighter_boots'), 'Maren gives the fighter boots');
ok(evs.some(e => e.e === 'reward' && e.id === 'fighter_boots' && /Ashen Crown/.test(e.collection)), 'the Bank mints them into ASHVALE The Ashen Crown');
ok(evs.some(e => e.e === 'story' && e.n === 5 && e.total === 5), 'five story points land on the finish');
ok(core.storyPoints(p) === 5, 'the Skills tab would read 5 / ' + tot);

const slot = p.inv.findIndex(s => s && s.id === 'fighter_boots');
const b0 = core.bonuses(p);
core.cmd('p1', { c: 'equip', slot }); core.tick();
const b1 = core.bonuses(p);
ok(p.eq.feet && p.eq.feet.id === 'fighter_boots', 'the boots can be worn');
ok(b1.strength - b0.strength === 10 && b1.defence - b0.defence === 4, 'worn: Strength +10, Defence +4');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
