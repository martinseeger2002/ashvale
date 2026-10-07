'use strict';
/* The Gift of Angels (2026-10-07: "should not be a game item it should be a flag on the account"): Iria's second quest
   leaves a flag on the character, nothing in the bag, nothing for the Bank to mint, and the Ring of Angels reads it. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

ok(!D.items.gift_of_angels, 'there is no Gift of Angels item any more');
ok(D.quests.quests.angel_gift.steps[0].reward === 'flag:gift_of_angels', 'the quest rewards the gift_of_angels flag');

function world(seed) { return AshCore.create(D, { seed }); }
function talk(core, p, id, out) {
  const n = core.M.npcs.find(q => q.id === id);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    p.x = n.x + dx; p.y = n.y + dy; p.path = []; p.act = null;
    for (const m of core.S.mobs) m.tgt = 0;
    core.cmd(p.id, { c: 'npc', id });
    for (let i = 0; i < 3; i++) for (const e of core.tick()) { out.push(e); if (e.e === 'dialog' && e.p === p.id) return e; }
  }
  return null;
}
/* the ring's rest after one save, in ticks */
function ringRest(core, p) {
  p.inv[0] = { id: 'ring_angels', n: 1 }; core.cmd(p.id, { c: 'equip', slot: 0 }); core.tick();
  p.x = 22; p.y = 52; p.cd = {}; p.hp = core.maxHp(p);
  core.applyHit(p.id, p.hp - 1, 'melee', true);
  return p.cd && p.cd.ring_angels ? p.cd.ring_angels - core.S.t : null;
}

/* finish Iria's second quest */
const core = world('angels'), p = core.addPlayer('p1', {});
const Q = D.quests.quests.iria_supper; p.quests.iria_supper = { step: Q.steps.length + 1, n: 0 };
p.quests.angel_gift = { step: 1, n: 3 }; p.inv[5] = { id: 'timber_wolf_pelt', n: 3 };
const evs = []; const d = talk(core, p, 'iria', evs);
ok(p.quests.angel_gift.step === 2 && d && /Gift of Angels/.test(d.lines.join(' ')), 'Iria hands in the quest');
ok(core.hasFlag(p, 'gift_of_angels'), 'the character now has the gift_of_angels flag');
ok(!p.inv.some(s => s && /gift/.test(s.id)), 'nothing was put in the bag');
ok(!evs.some(e => e.e === 'reward'), 'nothing is sent to the Bank to mint');
ok(evs.some(e => e.e === 'flag' && e.flag === 'gift_of_angels'), 'a flag event tells the client');

const fresh = core.addPlayer('p2', {});
const restBase = ringRest(core, fresh), restGift = ringRest(core, p);
ok(restBase === 6000, 'without the gift the ring rests an hour (' + restBase + ' ticks)');
ok(restGift === D.rules.flags.gift_of_angels.ringCooldown, 'with the gift it rests ten minutes (' + restGift + ' ticks)');

/* saved and loaded */
const s = core.exportPlayer('p1');
ok(s.flags && s.flags.gift_of_angels, 'the flag is in the save');
const c2 = world('angels2'), p2 = c2.addPlayer('p1', s);
ok(c2.hasFlag(p2, 'gift_of_angels'), 'and comes back on load');
const forged = JSON.parse(JSON.stringify(s)); forged.flags = { made_up: 5, gift_of_angels: 'yes' };
forged.quests = {};
const p3 = world('angels3').addPlayer('p1', forged);
ok(!(p3.flags || {}).made_up && !(p3.flags || {}).gift_of_angels, 'unknown or malformed flags in a save are dropped');

/* an old save: the quest finished when the gift was an item */
const old = JSON.parse(JSON.stringify(s)); delete old.flags; old.inv[3] = { id: 'gift_of_angels', n: 1 };
const c4 = world('angels4'), p4 = c4.addPlayer('p1', old);
ok(c4.hasFlag(p4, 'gift_of_angels'), 'an old save with the quest done gets the flag');
ok(!p4.inv.some(x => x && x.id === 'gift_of_angels'), 'and the old item drops out of the bag');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
