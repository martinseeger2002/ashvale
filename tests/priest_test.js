'use strict';
/* The Wayside Prayer (2026-10-07): Father Aldous in Ashvale sends you to Symmetry, then out on the Saltmere road to
   Odric's crashed wagon and back, then on to the Saltmere chapel, where the step ends with Mother Wenna (a step's
   "ends") and she gives the Monk's robe: Magic +1, Prayer +3, and the Prayer bonus makes prayers last longer. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const XP = D.rules.xp;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

const core = AshCore.create(D, { seed: 'wayside' }), p = core.addPlayer('p1', { xp: { prayer: XP[10] * 10 } });
const npc = (id) => core.M.npcs.find(n => n.id === id);
function talk(id, out) {
  const n = npc(id);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {   /* stand on the side they can be reached from (some stand inside a doorway) */
    p.x = n.x + dx; p.y = n.y + dy; p.path = []; p.act = null; p.dead = 0; p.hp = core.maxHp(p);
    for (const m of core.S.mobs) m.tgt = 0;
    core.cmd('p1', { c: 'npc', id });
    for (let i = 0; i < 3; i++) for (const e of core.tick()) { if (out) out.push(e); if (e.e === 'dialog' && e.p === 'p1') return e; }
  }
  return null;
}
const Q = () => p.quests.wayside_prayer;
const prayXp = () => p.xp.prayer;

for (const id of ['aldous', 'symmetry', 'odric', 'odric_wagon', 'wenna']) ok(!!npc(id), id + ' is in the world');
const ch = (core.D.zones || zones).find(z => z.id === 'saltmere').objects.find(o => o.k === 'church');
ok(ch && ch.sign === 'Saltmere Chapel' && ch.x === 381 && ch.y === 30, 'the empty house at 381,30 is the Saltmere Chapel');
const w = npc('wenna'); ok(w.x >= ch.x && w.x < ch.x + ch.w && w.y >= ch.y && w.y < ch.y + ch.h, 'Mother Wenna stands inside it');
const od = npc('odric'); ok(od.x > 150 && od.x < 260, 'Odric is out on the road, half-way to Saltmere (' + od.x + ',' + od.y + ')');

/* before the quest: Wenna and Odric only have their own lines */
let d = talk('wenna'); ok(d && /Eleven years/.test(d.lines[0]) && !Q(), 'Wenna before the quest: her own lines, no quest');

d = talk('aldous'); ok(d && Q() && Q().step === 1 && /Symmetry/.test(d.lines.join(' ')), 'Aldous starts the quest and sends you to Symmetry');
d = talk('aldous'); ok(Q().step === 1 && /Symmetry/.test(d.lines[0]), 'before Symmetry: Aldous repeats where to go');
d = talk('odric'); ok(Q().n === 0 && /wheelwright/.test(d.lines[0]), 'Odric too early: his own lines, nothing counted');

d = talk('symmetry'); ok(Q().n === 1 && /blessing-roll/.test(d.lines[0]), 'Symmetry speaks the quest lines (say), not her usual ones');
let x0 = prayXp(); d = talk('aldous'); ok(Q().step === 2 && /southwest road/.test(d.lines.join(' ')) && prayXp() - x0 === 1000, 'back to Aldous: step 2, 100 Prayer XP, sent southwest along the road');

d = talk('wenna'); ok(Q().step === 2 && /Eleven years/.test(d.lines[0]), 'going on to Saltmere early does nothing');
d = talk('odric_wagon'); ok(Q().n === 0 && /axle/.test(d.lines[0]), 'searching the wagon: the wreck, nothing counted');
d = talk('odric'); ok(Q().n === 1 && /Go back to Ashvale/.test(d.lines.join(' ')), 'Odric tells you to go back to Ashvale, not on');
d = talk('wenna'); ok(Q().step === 2, 'Wenna cannot finish the Ashvale step');
x0 = prayXp(); d = talk('aldous'); ok(Q().step === 3 && /Saltmere/.test(d.lines.join(' ')) && prayXp() - x0 === 2500, 'back to Aldous: step 3, 250 Prayer XP, sent to Saltmere');

d = talk('aldous'); ok(Q().step === 3 && !p.inv.some(s => s && s.id === 'monk_robe'), 'Aldous cannot hand in the chapel step himself');
const evs = [];
d = talk('wenna', evs);
ok(Q().step === 4 && d && d.name === 'Mother Wenna' && /robe/.test(d.lines.join(' ')), 'the quest ends with Mother Wenna in Saltmere');
const slot = p.inv.findIndex(s => s && s.id === 'monk_robe');
ok(slot >= 0, "she gives you the Monk's robe");
ok(evs.some(e => e.e === 'reward' && e.id === 'monk_robe' && e.collection === 'ASHVALE The Wayside Prayer'), 'the Bank mints it into "ASHVALE The Wayside Prayer"');
d = talk('aldous'); ok(/chapel in Saltmere is open/.test(d.lines[0]), 'afterwards Aldous has the done lines');
d = talk('wenna'); ok(Q().step === 4 && p.quests.red_pyre && /Pike|bandit|gate|Bright Three/.test(d.lines.join(' ')), 'afterwards Wenna sends you to the gated lookout (The Red Pyre)');
ok(p.inv.filter(s => s && s.id === 'monk_robe').length === 1, 'still one robe');

/* the robe */
const it = core.item('monk_robe');
ok(it.eq === 'body' && it.magic === 1 && it.prayer === 3 && it.prayerSec === 1, "Monk's robe: body slot, Magic +1, Prayer +3, +1s per prayer point");
const before = core.bonuses(p), tFull0 = core.prayTicks(p, 10, 12);
core.cmd('p1', { c: 'equip', slot }); core.tick();
const after = core.bonuses(p), tFull1 = core.prayTicks(p, 10, 12);
ok(p.eq.body && p.eq.body.id === 'monk_robe', 'it can be worn');
ok(after.magic - before.magic === 1 && after.prayer - before.prayer === 3 && after.prayerSec - before.prayerSec === 1, 'worn: Magic +1, Prayer +3, +1s per point');
ok(tFull1 * 0.6 - tFull0 * 0.6 >= 10, 'the robe adds a full second per point on a 10-point bar: ' + (tFull0 * 0.6).toFixed(1) + 's -> ' + (tFull1 * 0.6).toFixed(1) + 's');
/* the live drain agrees with the readout */
p.pp = 10; p.pd = 0; core.cmd('p1', { c: 'pray', id: 'protect_from_melee', on: true }); core.tick();
let n = 1; while (p.pray.protect_from_melee && n < 2000) { core.tick(); n++; }
ok(Math.abs(n - tFull1) <= 1, 'robe on, protect from melee at 10 points lasts ' + n + ' ticks (readout ' + tFull1 + ')');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
