'use strict';
/* Vael's replayable Even Guard fighters opt into their own loot without turning every summoned actor into a loot source. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..+\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, JSON.parse(fs.readFileSync(path.join(DD, f), 'utf8')).data));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

const unique = {
  brambleheart_maul: { class: 'melee', attack: 12, strength: 20, effect: 'slow' },
  bow_evenflight: { class: 'ranged', ranged: 25, range: 8 },
  staff_stillwind: { class: 'magic', magic: 24, range: 9, effect: 'stun' }
};
for (const id in unique) {
  const valid = AshCore.validItem(D.items[id], D.rules.items);
  const it = AshCore.normItem(id, D.items[id], D.rules.items), want = unique[id];
  ok(valid.ok, id + ' is valid ASHVALE item JSON' + (valid.ok ? '' : ': ' + valid.errors.join(', ')));
  ok(it.tier === 3 && it.req && Object.values(it.req)[0] === 20 && Object.keys(want).every(k => it[k] === want[k]), id + ' has its intended tier-three combat identity');
}

const tables = {
  bramble: [['oak_logs', 2], ['sapling', 8], ['brambleheart_maul', 64]],
  keel: [['arrows_t1', 2], ['arrows_t2', 8], ['bow_evenflight', 64]],
  gale: [['potion', 2], ['prayer_potion', 8], ['staff_stillwind', 64]]
};
for (const key in tables) {
  const md = D.monsters[key], got = md.drops.map(d => [d.item, d.one_in]);
  ok(md.bones === 'bones' && JSON.stringify(got) === JSON.stringify(tables[key]), key + ' has 100% bones plus common, uncommon and 1/64 unique rolls');
}
const bout = D.quests.quests.even_guard.steps.find(s => s.summon);
ok(bout.summon.length === 3 && bout.summon.every(s => s.loot), 'only the three Even Guard summon rows opt into loot');

const core = AshCore.create(D, { seed: 'vael-loot-2' });
const high = 130344310;
const p = core.addPlayer('p1', { xp: { attack: high, strength: high, defence: high, hitpoints: high, prayer: high }, quests: {
  even_grove: { step: D.quests.quests.even_grove.steps.length + 1, n: 0 },
  red_pyre: { step: D.quests.quests.red_pyre.steps.length + 1, n: 0 }
} });
p.x = 197; p.y = -51; p.hp = core.maxHp(p); p.pp = core.maxPp(p); p.eq.weapon = { id: 'sword_t5', n: 1 };
core.cmd('p1', { c: 'acceptq', q: 'even_guard' });
core.tick(); core.tick();
const summons = core.S.mobs.filter(m => m.summon && m.owner === 'p1' && !m.gone);
ok(summons.length === 3 && summons.every(m => m.summonLoot), 'the bout copies its loot opt-in onto all three live fighters');

for (const m of summons) {
  m.hp = 1; m.tgt = 'p1'; p.hp = core.maxHp(p); p.dead = 0;
  const spot = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1]].find(([dx, dy]) => !core.M.blocked(m.x + dx, m.y + dy));
  p.x = m.x + spot[0]; p.y = m.y + spot[1]; p.path = []; p.act = null;
  core.cmd('p1', { c: 'attack', uid: m.uid });
  for (let i = 0; i < 80 && !m.dead; i++) { p.hp = core.maxHp(p); p.dead = 0; core.tick(); }
}
for (let i = 0; i < 4; i++) core.tick();
const places = new Set(summons.map(m => m.x + ',' + m.y));
const loot = core.S.ground.filter(g => g.owner === 'p1' && places.has(g.x + ',' + g.y));
ok(summons.every(m => m.dead), 'all three fighters can be killed in the focused loot bout');
ok(loot.filter(g => g.id === 'bones').reduce((n, g) => n + g.n, 0) === 3, 'each fighter leaves exactly one guaranteed Bones drop');
const bronze = loot.find(g => g.id === 'arrows_t1');
ok(bronze && bronze.n >= 10 && bronze.n <= 20, 'Keel rolls 10-20 common arrows without spilling his remaining 400 combat arrows');
const allowed = new Set(['bones', 'oak_logs', 'sapling', 'brambleheart_maul', 'arrows_t1', 'arrows_t2', 'bow_evenflight', 'potion', 'prayer_potion', 'staff_stillwind']);
ok(loot.every(g => allowed.has(g.id)), 'the summoned bout produces only its configured loot table');

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
