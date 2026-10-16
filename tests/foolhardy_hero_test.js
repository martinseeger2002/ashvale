'use strict';
/* The Foolhardy Hero is immediately available; Even Guard gates Elian's follow-up after the bones return. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'dragonapproach', 'dragonkeep'].map(id => Object.assign({ id }, mod('zone.' + id)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0;
const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const core = AshCore.create(D, { seed: 'foolhardy-hero' });
const evenGuardDone = D.quests.quests.even_guard.steps.length + 1;
const p = core.addPlayer('p1', { name: 'Tester' });
const squire = core.M.npcs.find(n => n.id === 'squire_elian');
const dragon = core.S.mobs.find(m => m.key === 'chain_dragon');

function ticks(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...core.tick());
  return out;
}
function beside(o) {
  p.x = o.x + 1; p.y = o.y; p.path = []; p.act = null; p.dead = 0; p.hp = core.maxHp(p);
}
function talkSquire() {
  beside(squire);
  core.cmd('p1', { c: 'npc', id: squire.id });
  return ticks(4).find(e => e.e === 'dialog' && e.p === 'p1');
}

ok(squire && squire.x === -11 && squire.y === -78, 'Squire Elian waits on the path at -11,-78');
ok(squire && squire.look === 'squire_elian', 'Squire Elian uses his distinct steel-armoured character model');
ok(dragon && D.monsters.chain_dragon.lines, 'the chained dragon remains talkable inside the keep');
let dlg = talkSquire();
ok(dlg && dlg.offer === 'foolhardy_hero' && /more than a day/i.test(dlg.lines.join(' ')) && /braver than smart/i.test(dlg.lines.join(' ')) && /compass southeast/i.test(dlg.lines.join(' ')),
  'with no earlier quests complete, Elian gives compass-correct directions and offers the quest');
core.cmd('p1', { c: 'acceptq', q: 'foolhardy_hero' });
ticks(1);
ok(p.quests.foolhardy_hero && p.quests.foolhardy_hero.step === 1, 'accepting begins The Foolhardy Hero');

beside(dragon);
core.cmd('p1', { c: 'mobtalk', uid: dragon.uid });
const dragonEvents = ticks(1), dragonTalk = dragonEvents.find(e => e.e === 'dialog');
ok(dragonTalk && /I ate him/i.test(dragonTalk.lines.join(' ')) && /burp/i.test(dragonTalk.lines.join(' ')),
  'the chained dragon admits eating Sir Garran and burps up the remains');
ok(core.invCount(p, 'hero_bones') === 1, "the player receives Hero's Bones exactly once");
ok(!core.item('hero_bones').buryXp, "Hero's Bones use the bone model but cannot be buried as ordinary remains");
ok(core.item('hero_bones').quest && core.item('hero_bones').bound && !core.item('hero_bones').nft,
  "Hero's Bones are a bound, non-NFT quest item");
ok(core.item('hero_bones').model === 'item.hero_bones' && /Bring them to Squire Elian/i.test(core.item('hero_bones').examine || ''),
  "Hero's Bones have their own icon model and an examine instruction leading back to Elian");
const bonesSlot = p.inv.findIndex(s => s && s.id === 'hero_bones');
core.cmd('p1', { c: 'drop', slot: bonesSlot });
const dropEvents = ticks(1);
ok(core.invCount(p, 'hero_bones') === 1 && !core.S.ground.some(g => g.id === 'hero_bones') && dropEvents.some(e => e.e === 'msg' && /quest item/i.test(e.text || e.msg || '')),
  "Hero's Bones cannot be dropped");
core.applyHit('p1', p.hp, 'melee', true);
ok(p.dead && core.invCount(p, 'hero_bones') === 1 && !core.S.ground.some(g => g.id === 'hero_bones'),
  "Hero's Bones stay in the player's inventory on death");
p.dead = 0; p.hp = core.maxHp(p);
core.cmd('p1', { c: 'mobtalk', uid: dragon.uid }); ticks(1);
ok(core.invCount(p, 'hero_bones') === 1, 'talking to the dragon again cannot duplicate the quest item');

dlg = talkSquire();
ok(dlg && /bringing him home/i.test(dlg.lines.join(' ')), 'returning the bones gives Elian’s completion dialogue');
ok(core.invCount(p, 'hero_bones') === 0, "Elian takes Hero's Bones");
ok(p.quests.foolhardy_hero.step > D.quests.quests.foolhardy_hero.steps.length, 'the easy quest completes');
ok(dlg && /prayer/i.test(dlg.lines.join(' ')) && /balance/i.test(dlg.lines.join(' ')) && /Even Guard/i.test(dlg.lines.join(' ')),
  'without The Even Guard, Elian points the player toward prayer and balance before his next duty');
ok(core.storyPoints(p) === 1, 'The Foolhardy Hero awards its story point without requiring another quest');

p.quests.even_guard = { step: evenGuardDone, n: 0 };
dlg = talkSquire();
ok(dlg && dlg.offer === 'dragon_heart' && /Avenge him/i.test(dlg.lines.join(' ')) && /Father Aldous/i.test(dlg.lines.join(' ')),
  'after The Even Guard, Elian offers the second quest');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
