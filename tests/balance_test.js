'use strict';
/* The Even Grove and the Even Guard (2026-10-07): the Ancient Chapel at 198,11 refuses a prayer
   until the balance is learned. Vael, on the rope at 197,-51, has the player plant the grove
   (Prayer 9 to 15), then — only after the Red Pyre — calls three temporary fighters. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'saltmere', 'spidercave', 'cavemouth', 'ancientchapel', 'evengrove'].map(z => Object.assign({ id: z }, JSON.parse(JSON.stringify(mod('zone.' + z)))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const XP = D.rules.xp;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

const core = AshCore.create(D, { seed: 'balance' });
const p = core.addPlayer('p1', { xp: { prayer: XP[9] * 10, attack: XP[80] * 10, strength: XP[80] * 10, defence: XP[1] * 10, hitpoints: XP[90] * 10, magic: XP[1] * 10 } });
p.pp = core.maxPp(p);
function ticks(n, grab) {
  const out = [];
  for (let i = 0; i < n; i++) for (const e of core.tick()) { out.push(e); if (grab) grab(e); }
  return out;
}
function talk(id) {
  const n = core.M.npcs.find(q => q.id === id); if (!n) return null;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    p.x = n.x + dx; p.y = n.y + dy; p.path = []; p.act = null; p.dead = 0; p.hp = core.maxHp(p);
    core.cmd('p1', { c: 'npc', id });
    let dlg = null;
    ticks(4, e => { if (e.e === 'dialog' && e.p === 'p1') dlg = e; });
    if (dlg) return dlg;
  }
  return null;
}
function plant(x, y) {
  p.x = x; p.y = y + 1; p.path = []; p.act = null; p.dead = 0;
  if (core.M.blocked(p.x, p.y)) { p.x = x + 1; p.y = y; }
  core.cmd('p1', { c: 'plant', x, y });
  ticks(4);
}

ok(!!core.M.npcs.find(n => n.id === 'vael' && n.x === 197 && n.y === -51 && n.rope), 'Vael stands on the rope at 197,-51');
const chapel = zones.find(z => z.id === 'ancientchapel');
const ruin = (chapel.objects || []).find(o => o.k === 'ruin');
const altar = (chapel.objects || []).find(o => o.k === 'altar');
ok(!!ruin && ruin.sign === 'Ancient Chapel' && ruin.enter && ruin.door[0] === 198 && ruin.door[1] === 14, 'a stone ruin with a door toward the trail');
ok(!!altar && altar.x === 198 && altar.y === 11 && altar.chapel === 'ancient', 'the altar is inside at 198,11');
const node = core.nodeAt(core.idx(198, 11));
ok(node && node.kind === 'altar' && node.chapel === 'ancient', 'the altar node keeps its chapel');

const before = p.pp;
p.x = 198; p.y = 12; p.path = []; p.act = null;
core.cmd('p1', { c: 'gather', x: 198, y: 11 });
let dlg = null;
ticks(4, e => { if (e.e === 'dialog' && e.p === 'p1') dlg = e; });
const text = dlg ? dlg.lines.join(' ') : '';
ok(dlg && dlg.name === 'You' && /mighty headache/i.test(text) && /Sixty-two paces south/.test(text) && /One pace west/.test(text) && /197, -51/.test(text) && /out of balance/i.test(text), 'the altar carves the path and refuses: ' + text.slice(0, 80));
ok(p.pp === before, 'prayer is not restored');
ok(p.quests.even_grove && p.quests.even_grove.step === 1, 'The Even Grove starts at the altar');

dlg = talk('vael');
const vtext = dlg ? dlg.lines.join(' ') : '';
ok(/Vael/.test(vtext) && /arguing/.test(vtext) && /three shoots/i.test(vtext), 'Vael daydreams, then sends you to plant: ' + vtext.slice(0, 70));
ok(p.quests.even_grove.step === 2 && core.invCount(p, 'sapling') >= 3, 'three saplings, and the planting step is open');
ok(!p.quests.even_guard, 'the harder quest is not offered yet');

const opens = [];
for (let y = -67; y <= -35 && opens.length < 3; y++) for (let x = 181; x <= 213 && opens.length < 3; x++) if (core.canPlant(p, x, y)) opens.push([x, y]);
ok(opens.length === 3, 'three open tiles near the rope will take a shoot (' + opens.length + ')');
for (const [x, y] of opens) plant(x, y);
ok(p.quests.even_grove.n === 3, 'three shoots in the open');
const xp0 = p.xp.prayer;
dlg = talk('vael');
ok(p.xp.prayer === xp0 + 36 * 10 && p.quests.even_grove.step === 3, 'the first planting pays a little Prayer XP and opens the stumps');
ok(core.invCount(p, 'sapling') === 2, 'the stump step hands over two saplings');
ok(dlg && /axe/i.test((dlg.lines || []).join(' ')) && dlg.axe === 'hatchet', 'Vael asks if you need an axe');
ok(core.invCount(p, 'hatchet') === 0, 'no hatchet until you take one');
core.cmd('p1', { c: 'takeaxe' });
ticks(1);
ok(core.invCount(p, 'hatchet') === 1, 'taking the axe gives one bronze hatchet');
core.cmd('p1', { c: 'takeaxe' });
ticks(1);
ok(core.invCount(p, 'hatchet') === 1, 'a second axe is refused when you already have one');
const stumps = [[201, -62], [184, -42]];
ok(stumps.every(([x, y]) => !core.canPlant(p, x, y) && core.nodeAt(core.idx(x, y))), 'the two pines are still standing');
function chop(x, y) {
  p.x = x; p.y = y + 1; p.path = []; p.act = null; p.dead = 0; p.hp = core.maxHp(p);
  if (core.M.blocked(p.x, p.y)) { p.x = x + 1; p.y = y; }
  for (let i = 0; i < 2500 && !core.S.dep[core.idx(x, y)]; i++) {
    if (p.inv.filter(Boolean).length > 22) for (let s = 0; s < p.inv.length; s++) if (p.inv[s] && p.inv[s].id === 'logs') p.inv[s] = null;
    if (!p.act) core.cmd('p1', { c: 'gather', x, y });
    core.tick();
  }
}
for (const [x, y] of stumps) chop(x, y);
ok(stumps.every(([x, y]) => !core.canPlant(p, x, y)), 'a fresh stump is not ready for a sapling');
function settle(x, y) { core.S.fell[core.idx(x, y)] = core.S.t - core.plantHour; ticks(1); }
for (const [x, y] of stumps) settle(x, y);
ok(stumps.every(([x, y]) => core.M.tileAt(x, y) === '.' && !core.M.blocked(x, y) && !core.nodeAt(core.idx(x, y)) && core.canPlant(p, x, y)), 'after an hour the stump is open grass');
let other = null;
for (let y = -67; y <= -35 && !other; y++) for (let x = 181; x <= 213; x++) {
  if (stumps.some(s => s[0] === x && s[1] === y)) continue;
  const n = core.nodeAt(core.idx(x, y));
  if (!n || core.nodeDef(n).skill !== 'woodcutting') continue;
  if (Math.max(Math.abs(x - 197), Math.abs(y + 51)) <= 10) continue;
  other = [x, y];
}
ok(!!other && !core.canPlant(p, other[0], other[1]), 'another standing pine is not a stump yet');
core.S.dep[core.idx(other[0], other[1])] = 1e15;
ok(core.hasFlag(p, 'replant'), 'replanting is learned when the stump step opens');
let close = null;
for (let y = -61; y <= -41 && !close; y++) for (let x = 187; x <= 207; x++) {
  if (Math.max(Math.abs(x - 197), Math.abs(y + 51)) > 10) continue;
  const n = core.nodeAt(core.idx(x, y));
  if (n && core.nodeDef(n).skill === 'woodcutting') close = [x, y];
}
ok(!!close, 'a pine stands within ten tiles of Vael');
core.S.dep[core.idx(close[0], close[1])] = 1e15;
core.S.fell[core.idx(close[0], close[1])] = core.S.t - core.plantHour;
ticks(1);
ok(core.M.tileAt(close[0], close[1]) === '.' && core.canPlant(p, close[0], close[1]), 'any cleared stump counts, even beside Vael');
for (const [x, y] of stumps) plant(x, y);
ok(p.quests.even_grove.n === 2, 'two stumps replanted');
talk('vael');
ok(p.quests.even_grove.step === 4 && core.invCount(p, 'sapling') >= 1, 'the heart-tree step');
let heart = null;
for (let y = -67; y <= -35 && !heart; y++) for (let x = 181; x <= 213; x++) if (core.M.tileAt(x, y) === '.' && !core.S.cleared[core.idx(x, y)] && core.canPlant(p, x, y)) { heart = [x, y]; break; }
ok(!!heart, 'one open tile left for the heart tree');
plant(heart[0], heart[1]);
talk('vael');
ok(core.lv(p, 'prayer') === 15 && p.xp.prayer === XP[9] * 10 + 1442 * 10, 'Prayer climbs from 9 to 15 (' + core.lv(p, 'prayer') + ', xp ' + p.xp.prayer + ')');
ok(p.quests.even_grove.step > D.quests.quests.even_grove.steps.length, 'The Even Grove is complete');
const xpAltar = p.xp.prayer, logs0 = core.invCount(p, 'logs'), bones0 = core.invCount(p, 'bones'), sap0 = core.invCount(p, 'sapling');
core.grantItem('p1', 'logs', 1);
core.grantItem('p1', 'bones', 1);
p.x = 198; p.y = 12; p.path = []; p.act = null;
core.cmd('p1', { c: 'offer', x: 198, y: 11 });
ticks(1);
ok(core.invCount(p, 'logs') === logs0 && core.invCount(p, 'bones') === bones0 && core.invCount(p, 'sapling') === sap0 + 1 && p.xp.prayer === xpAltar + 150, 'the altar trades one log and bones for a sapling and 15 Prayer XP');

dlg = talk('vael');
ok(dlg && /Red Pyre/.test(dlg.lines.join(' ')) && !p.quests.even_guard, 'without the Red Pyre he will not call the three');
p.quests.red_pyre = { step: D.quests.quests.red_pyre.steps.length + 1, n: 0 };
ok(D.quests.quests.red_pyre.done.some(s => /Ancient Chapel/.test(s)) && D.quests.quests.red_pyre.steps[2].complete.some(s => /Ancient Chapel/.test(s)), 'Wenna, finished with the Pyre, points at the chapel');
dlg = talk('wenna');
ok(dlg && /Ancient Chapel/.test(dlg.lines.join(' ')), 'Wenna says it aloud');

p.x = 198; p.y = 12; p.pp = 1;
core.cmd('p1', { c: 'gather', x: 198, y: 11 });
dlg = null; ticks(4, e => { if (e.e === 'dialog') dlg = e; });
ok(dlg && /Sixty-two paces south/.test(dlg.lines.join(' ')) && p.pp === 1, 'the altar still shows the path until the second quest is done');

dlg = talk('vael');
ok(dlg && /Protect from Magic/.test(dlg.lines.join(' ')) && /Gale/.test(dlg.lines.join(' ')), 'he teaches the overhead prayers and names the three');
const summoned = () => core.S.mobs.filter(m => m.summon && m.owner === 'p1' && !m.gone);
ok(summoned().length === 3, 'three fighters appear (' + summoned().map(m => m.key).join(',') + ')');
ok(summoned().every(m => core.mobCombat(D.monsters[m.key]) >= 30 && core.mobCombat(D.monsters[m.key]) <= 40), 'each is combat 30-40');
ok(D.monsters.bramble.miss >= 40 && D.monsters.keel.miss === 0 && D.monsters.gale.miss === 0 && D.monsters.gale.cast && D.monsters.gale.cast.max >= 10, 'melee is inconsistent, the ranger is steady, the mage hits heavy');

p.x = 100; p.y = 100; p.dead = 0;
ticks(2);
ok(summoned().length === 0, 'leaving the ground dismisses them');
dlg = talk('vael');
ok(summoned().length === 3, 'speaking to him calls them back');

p.pp = 30; p.pd = 0;
core.cmd('p1', { c: 'pray', id: 'protect_from_magic', on: true });
const gale = summoned().find(m => m.key === 'gale');
p.x = gale.x; p.y = gale.y + 1; p.path = []; p.act = null; p.hp = core.maxHp(p);
let magicHits = [];
ticks(25, e => { if (e.e === 'hit' && e.dst === 'p1' && e.src === gale.uid) magicHits.push(e); });
ok(magicHits.length > 0 && magicHits.every(e => e.dmg === 0 && e.prot), 'Protect from Magic stops Gale (' + magicHits.length + ' blows)');

for (const m of summoned()) {
  m.hp = 1; m.carry = {}; m.tgt = 'p1';
  p.hp = core.maxHp(p); p.pp = 30; p.dead = 0;
  const spots = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1]];
  const spot = spots.find(([dx, dy]) => !core.M.blocked(m.x + dx, m.y + dy)) || [0, 1];
  p.x = m.x + spot[0]; p.y = m.y + spot[1]; p.path = []; p.act = null;
  core.cmd('p1', { c: 'attack', uid: m.uid });
  for (let i = 0; i < 30 && !m.dead && !m.gone; i++) { p.hp = core.maxHp(p); p.dead = 0; ticks(1); }
}
ok(summoned().every(m => m.dead), 'all three can be killed, in any order (' + summoned().map(m => m.key + ':' + m.hp + (m.dead ? ' dead' : '')).join(' ') + ')');
const wreathXp = p.xp.prayer;
dlg = talk('vael');
ok(dlg && /Verdant wreath/.test(dlg.lines.join(' ')) && /six parts in five|120|past a normal/.test(dlg.lines.join(' ')), 'he gives the wreath and blesses the chapel');
ok(core.invCount(p, 'verdant_wreath') === 1 && p.xp.prayer === wreathXp, 'the wreath is the reward, not more XP');
ok(p.quests.even_guard.step > D.quests.quests.even_guard.steps.length, 'The Even Guard is complete');

const slot = p.inv.findIndex(s => s && s.id === 'verdant_wreath');
core.cmd('p1', { c: 'equip', slot });
ticks(2);
ok(p.eq.head && p.eq.head.id === 'verdant_wreath' && core.item('verdant_wreath').magic === 1 && core.item('verdant_wreath').prayer === 3 && core.item('verdant_wreath').prayerSec === 1, 'the wreath sits on the head with a monk robe\'s blessing');
p.pray = { protect_from_melee: 1 }; p.pd = 0; p.pp = 12;
const worn = core.prayTicks(p, 1, 12);
const head = p.eq.head; p.eq.head = null;
const bare = core.prayTicks(p, 1, 12);
const body = p.eq.body; p.eq.body = { id: 'monk_robe', n: 1 };
const robe = core.prayTicks(p, 1, 12);
p.eq.head = head; p.eq.body = body;
ok(worn > bare && worn === robe, 'the wreath lengthens prayer exactly as a monk robe does (' + bare + ' bare, ' + worn + ' worn)');

p.x = 198; p.y = 12; p.pp = 1; p.pd = 0; p.act = null; p.path = [];
core.cmd('p1', { c: 'gather', x: 198, y: 11 });
ticks(4);
ok(p.pp === Math.round(core.maxPp(p) * 1.2), 'the chapel altar fills Prayer to 120% (' + p.pp + '/' + core.maxPp(p) + ')');

core.grantItem('p1', 'sapling', 2);
ticks(1);
const sl = p.inv.findIndex(s => s && s.id === 'sapling');
core.cmd('p1', { c: 'use', slot: sl });
ticks(1);
ok(p.using && p.using.slot === sl && p.using.id === 'sapling', 'using a sapling outlines it for the next click');
core.cmd('p1', { c: 'use', slot: sl });
ticks(1);
ok(!p.using, 'using the same sapling again puts it away');
ok(!core.canPlant(p, 197, -45), 'within ten tiles of Vael grass will not take a new tree');
core.S.dep[core.idx(close[0], close[1])] = 1e15;
ok(core.hasFlag(p, 'replant') && core.canPlant(p, close[0], close[1]), 'after the quest, any stump still takes a sapling');
delete core.S.dep[core.idx(close[0], close[1])];
ok(!core.canPlant(p, 197, 0), 'the path south from the chapel stays open');
let town = null;
const vill = zones.find(z => z.id === 'village');
for (let y = vill.origin[1]; y < vill.origin[1] + vill.size[1] && !town; y++) for (let x = vill.origin[0]; x < vill.origin[0] + vill.size[0]; x++) if (core.M.tileAt(x, y) === '.') { town = [x, y]; break; }
ok(!!town && !core.canPlant(p, town[0], town[1]), 'Ashvale town limits will not take a tree');
let spot = null;
for (let y = -67; y <= -35 && !spot; y++) for (let x = 181; x <= 213; x++) if (core.M.tileAt(x, y) === '.' && !core.S.cleared[core.idx(x, y)] && core.canPlant(p, x, y)) { spot = [x, y]; break; }
ok(!!spot, 'grass outside those limits will take a sapling');
const beforeN = core.invCount(p, 'sapling');
plant(spot[0], spot[1]);
ok(core.invCount(p, 'sapling') === beforeN - 1, 'planting spends one sapling');
const pi = core.idx(spot[0], spot[1]);
ok(core.S.plants[pi] && !core.S.plants[pi].grown && !core.M.blocked(spot[0], spot[1]), 'for the hour it is still a shoot');
p.x = spot[0]; p.y = spot[1] + 1; if (core.M.blocked(p.x, p.y)) { p.x = spot[0] + 1; p.y = spot[1]; }
p.path = []; p.act = null;
core.cmd('p1', { c: 'unplant', x: spot[0], y: spot[1] });
ticks(4);
ok(!core.S.plants[pi] && core.invCount(p, 'sapling') === beforeN, 'within the hour the sapling comes back up');
plant(spot[0], spot[1]);
core.S.plants[core.idx(spot[0], spot[1])].at = core.S.t - core.plantHour;
ticks(1);
const grown = core.nodeAt(core.idx(spot[0], spot[1]));
ok(core.M.blocked(spot[0], spot[1]) && grown && grown.kind === 'P' && core.S.plants[core.idx(spot[0], spot[1])].grown, 'after an hour the grass grows a tree that stays');
ok(!core.canPlant(p, spot[0], spot[1]), 'the grown tree cannot be picked back up');

const gv = core.M.npcs.filter(n => n.watch === 'village'), gs = core.M.npcs.filter(n => n.watch === 'saltmere');
ok(gv.length === 3 && gs.length === 4 && !!core.M.npcs.find(n => n.road), 'town guards stand in Ashvale and Saltmere, and one has the road');
ok(gv.every(n => !n.foe) && core.guardCb === 33, 'the guards are combat 33 and do not start a fight');
const g0 = gv[0];
p.x = g0.x + 1; p.y = g0.y; if (core.M.blocked(p.x, p.y)) { p.x = g0.x; p.y = g0.y + 1; }
p.path = []; p.act = null; p.dead = 0; p.hp = core.maxHp(p);
core.cmd('p1', { c: 'attack', id: g0.id });
ticks(3);
ok(gv.every(n => n.foe === 'p1') && gs.every(n => !n.foe), 'hitting one Ashvale guard turns that watch, not Saltmere');
for (const n of gv) { n.foe = null; n.down = 0; n.hp = 40; }
core.watchPhase(true, false);
ticks(8);
ok(gv.some(n => n.duty) || Object.keys(core.S.lit).length > 0, 'at dusk the Ashvale guards walk out to light the lamps');

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
