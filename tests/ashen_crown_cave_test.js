/* ashen_crown_cave_test.js - the end of the Ashen Crown happens in the Spider Cave (2026-10-07: "Add wraiths ... so that
   the final quest from the ashen crown can be completed"): steps 4-6 are open (their area exists) and finish on three wraiths,
   the Ash Knight and the Lich, and every one of them is down there. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const Q = mod('quests').quests.ashen_crown, cave = mod('zone.spidercave');
ok(Q.steps.slice(3).every(s => s.zone === 'spidercave'), 'steps 4-6 are in the Spider Cave');
const has = k => cave.spawns.filter(s => s.m === k).length;
ok(has('wraith') === 3 && has('ash_knight') === 1 && has('lich') === 1, 'the cave holds 3 wraiths, the Ash Knight and the Lich');
ok(!mod('zone.whisperwood').spawns.some(s => s.m === 'wraith'), 'Whisperwood has no wraith');
const zones = ['village', 'whisperwood', 'spidercave'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones };
const c = AshCore.create(D, { seed: 'crown' }), p = c.addPlayer('p1', null);
p.quests = { ashen_crown: { step: 4, n: 0 } };
const kill = key => { const m = c.S.mobs.find(q => q.key === key && !q.dead); p.x = m.x + 1; p.y = m.y; m.hp = 1; m.tgt = 0;
  for (let k = 0; k < 40 && !m.dead; k++) { c.cmd('p1', { c: 'attack', uid: m.uid }); c.tick(); p.hp = 99; } return m.dead; };
p.xp.attack = p.xp.strength = 1e8; p.xp.hitpoints = 1e8; p.hp = 99;
for (let k = 0; k < 3; k++) ok(kill('wraith'), 'wraith ' + (k + 1) + ' falls');
const st = () => (p.quests.ashen_crown || {}).step;
ok(st() === 5 || (p.quests.ashen_crown && p.quests.ashen_crown.n >= 3), 'three wraiths complete step 4 (step now ' + st() + ', count ' + (p.quests.ashen_crown || {}).n + ')');
p.quests.ashen_crown = { step: 5, n: 0 }; ok(kill('ash_knight') && p.quests.ashen_crown.n === 1, 'the Ash Knight falls: step 5 counts it');
p.quests.ashen_crown = { step: 6, n: 0 }; ok(kill('lich') && p.quests.ashen_crown.n === 1, 'the Lich falls: step 6 counts it');
process.exit(fails ? 1 : 0);
