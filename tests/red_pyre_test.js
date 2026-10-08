'use strict';
/* The Red Pyre (2026-10-07): after the Wayside Prayer, Mother Wenna sends you to Pike at a gated
   compound east of the north Whisperwood bandits. Vorthans cannot be struck until she authorises it.
   The keeper drops Vorth's rosary; Edric's bones in the Spider Cave hold the robe and note. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'saltmere', 'spidercave', 'cavemouth'].map(z => Object.assign({ id: z }, JSON.parse(JSON.stringify(mod('zone.' + z)))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const XP = D.rules.xp;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

const core = AshCore.create(D, { seed: 'redpyre' }), p = core.addPlayer('p1', { xp: { prayer: XP[4] * 10, attack: XP[40] * 10, strength: XP[40] * 10, defence: XP[40] * 10, hitpoints: XP[40] * 10 } });
const npc = (id) => core.M.npcs.find(n => n.id === id);
function talk(id, out) {
  const n = npc(id); if (!n) return null;
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [1, 1], [-1, -1]]) {
    p.x = n.x + dx; p.y = n.y + dy; p.path = []; p.act = null; p.dead = 0; p.hp = core.maxHp(p);
    core.cmd('p1', { c: 'npc', id });
    for (let i = 0; i < 4; i++) for (const e of core.tick()) { if (out) out.push(e); if (e.e === 'dialog' && e.p === 'p1') return e; }
  }
  return null;
}

ok(!!npc('pike') && npc('pike').x === 27 && npc('pike').y === 2, 'Pike stands outside the west gate');
ok(!!npc('vorthan_reader') && !!npc('vorthan_acolyte'), 'two Vorthans stand in the red church');
ok(!!npc('edric_skel') && npc('edric_skel').x === -146 && npc('edric_skel').lie, 'Edric\'s bones lie halfway along the cave tunnel');
ok(!!npc('edric_ghost') && npc('edric_ghost').hideFlag === 'vorth_bag' && npc('edric_ghost').vanish && npc('edric_ghost').goneFlag === 'vorth_spoke', 'Edric\'s shade is hidden until the bag is searched, then gone after he speaks');
const ww = D.zones.find(z => z.id === 'whisperwood');
const church = (ww.objects || []).find(o => o.k === 'church' && o.sign === 'The Red Pyre');
ok(!!church && church.wall === '#8a2018', 'the Red Pyre church is red');
const gate = (ww.objects || []).find(o => o.k === 'gate');
ok(!!gate && gate.need === 'vorth_gate', 'a closed gate needs Pike\'s latch');
ok(D.monsters.vorthan && D.monsters.vorthan.cover && D.monsters.vorthan.cover.step === 3, 'the Vorthan cannot be struck until the kill step');
ok(D.items.vorthan_robe && D.items.vorth_rosary && D.items.edric_note, 'robe, rosary and note exist');
const robe = core.item('vorthan_robe'), monk = core.item('monk_robe');
ok(robe.magic === monk.magic + 1 && robe.prayer === monk.prayer + 1 && robe.prayerSec === monk.prayerSec + 1, 'Vorthan robe is Monk\'s robe +1');
const ros = core.item('vorth_rosary');
ok(ros.teleport === 'spidercave', 'the rosary teleports to the Spider Cave');
ok(ros.eq === 'shield', 'the rosary is worn in the shield hand');
ok(ros.magic === robe.magic && ros.prayer === robe.prayer && ros.prayerSec === robe.prayerSec, 'the rosary matches the Vorthan robe\'s Magic, Prayer and Prayer seconds');


let d = talk('pike');
ok(d && /Sod off/.test(d.lines[0]) && !p.quests.red_pyre, 'Pike refuses until Wayside Prayer is done');
d = talk('edric_skel');
ok(d && /leave him alone/.test(d.lines[0]), 'before the quest, the skeleton is left alone');
d = talk('wenna');
ok(d && /Eleven years/.test(d.lines[0]), 'Wenna still sweeps until Wayside is finished');

p.quests.wayside_prayer = { step: 4, n: 0 };
d = talk('pike');
ok(d && /Wenna|Saltmere/.test(d.lines.join(' ')) && !(p.flags && p.flags.vorth_gate), 'after Wayside, Pike waits for Wenna to send you');
d = talk('wenna');
ok(p.quests.red_pyre && p.quests.red_pyre.step === 1 && /Bright Three|Althas|gate/.test(d.lines.join(' ')), 'Wenna starts The Red Pyre and names the Bright Three');

d = talk('pike');
ok(p.quests.red_pyre.n === 1 && /Brother Pike|Caelen|Vorthan/.test(d.lines.join(' ')), 'Pike names himself and will not have you strike');
ok(!!p.flags.vorth_gate, 'talking to Pike opens the gate');

p.x = 27; p.y = 3; core.cmd('p1', { c: 'enter', x: 28, y: 3 });
for (let i = 0; i < 6; i++) core.tick();
ok(p.x === 30 && p.y === 3, 'the open gate puts you inside the compound');

const v = core.S.mobs.find(m => m.key === 'vorthan');
ok(!!v, 'a Vorthan keeper stands in the yard');
ok(core.coverBlocks(p, v), 'cover still holds: you cannot hit him yet');
core.cmd('p1', { c: 'attack', uid: v.uid });
const blocked = [];
for (let i = 0; i < 8; i++) for (const e of core.tick()) if (e.e === 'msg') blocked.push(e.text);
ok(blocked.some(t => /unmask/.test(t)) && v.hp === D.monsters.vorthan.hp, 'the attack is refused and he is unhurt');

d = talk('wenna');
ok(p.quests.red_pyre.step === 2 && /red church|reads/.test(d.lines.join(' ')), 'back to Wenna: go inside and hear them');
d = talk('vorthan_reader');
ok(p.quests.red_pyre.n === 1 && /Vorth was the fourth/.test(d.lines.join(' ')), 'the Reader speaks of Vorth');
d = talk('wenna');
ok(p.quests.red_pyre.step === 3 && /rosary|beads/.test(d.lines.join(' ')), 'Wenna authorises the killing blow');
ok(!core.coverBlocks(p, v), 'cover lifts once she has sent you to kill');

p.x = 27; p.y = 3; p.act = null; p.path = [];
v.hp = D.monsters.vorthan.hp; v.dead = 0; v.x = 31; v.y = 4;
core.cmd('p1', { c: 'attack', uid: v.uid });
for (let i = 0; i < 80 && !v.dead; i++) core.tick();
ok(v.dead && p.quests.red_pyre.n === 1, 'from outside the open gate you can walk in and slay the keeper');
ok(p.x >= 28, 'the fight path takes you through the gate');
for (let i = 0; i < 6; i++) core.tick();
ok(core.S.ground.some(g => g.id === 'vorth_rosary'), 'he drops Vorth\'s rosary');

const slot = p.inv.findIndex(s => !s);
p.inv[slot] = { id: 'vorth_rosary', n: 1 };
const beforeStep = { step: 2, n: 1 };
p.quests.red_pyre = beforeStep;
const xLock = p.x, yLock = p.y;
core.cmd('p1', { c: 'use', slot });
for (let i = 0; i < 4; i++) core.tick();
ok(p.x === xLock && p.y === yLock, 'the rosary will not teleport before Wenna sends you for the beads');
p.quests.red_pyre = { step: 3, n: 1 };
core.cmd('p1', { c: 'use', slot });
for (let i = 0; i < 4; i++) core.tick();
ok(p.x === -124 && p.y === 10, 'the rosary carries you to the cave mouth once the kill step is open');

ok(core.searchOpen(p, npc('edric_skel')), 'the bones can be searched after the kill');
d = talk('edric_skel');
ok(p.flags.vorth_bag && p.inv.some(s => s && s.id === 'edric_note') && p.inv.some(s => s && s.id === 'vorthan_robe'), 'searching the bag gives the robe and the note');
ok(d && d.npc === 'edric_ghost' && /Edric/.test(d.lines.join(' ')) && /Wenna/.test(d.lines.join(' ')), 'the shade appears with the bag and tells how he died');

const x0 = p.xp.prayer;
p.x = npc('wenna').x; p.y = npc('wenna').y + 1;
d = talk('wenna');
ok(p.quests.red_pyre.step === 4 && p.xp.prayer - x0 === 6930, 'Wenna takes the note: 693 Prayer XP, level 4 to 9');
ok(core.lv(p, 'prayer') === 9, 'Prayer is 9');

p.x = -146; p.y = 16106;
core.cmd('p1', { c: 'escape', id: 'edric_skel' });
for (let i = 0; i < 4; i++) core.tick();
ok(p.x === -124 && p.y === 10, 'escaping the cave returns you to the mouth');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
