'use strict';
/* Two rangers on the chained dragon: it focuses one, does not heal under the other, and a death pile is taken once. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort().map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { fails += !c; console.log(c ? 'ok  ' : 'FAIL', m); };

const gear = { xp: { attack: 50000, strength: 50000, defence: 50000, hitpoints: 130344310, ranged: 50000, magic: 50000, prayer: 50000 }, inv: [{ id: 'bow_t1', n: 1 }, { id: 'arrows_t1', n: 200 }] };
const core = AshCore.create(D, { seed: 'focus' });
const dr = core.S.mobs.find(m => m.key === 'chain_dragon');
const a = core.addPlayer('a', gear), b = core.addPlayer('b', JSON.parse(JSON.stringify(gear)));
a.spawnT = b.spawnT = -100; a.hp = core.maxHp(a); b.hp = core.maxHp(b); a.retal = b.retal = false; a.pp = b.pp = 99;
a.pray = b.pray = { protect_from_magic: 1, protect_from_melee: 1 };
core.cmd('a', { c: 'equip', slot: 0 }); core.cmd('b', { c: 'equip', slot: 0 }); core.tick();
a.eq.ammo = { id: 'arrows_t1', n: 200 }; b.eq.ammo = { id: 'arrows_t1', n: 200 };
dr.x = dr.sx; dr.y = dr.sy; dr.hp = D.monsters.chain_dragon.hp; dr.tgt = 0; dr.back = 0; dr.wind = null;
a.x = dr.x; a.y = dr.y - 3; b.x = dr.x; b.y = dr.y + 3;

core.cmd('a', { c: 'attack', uid: dr.uid });
let told = 0;
for (let i = 0; i < 16; i++) { a.hp = core.maxHp(a); b.hp = core.maxHp(b); for (const e of core.tick()) if (e.e === 'tell' && e.mob === dr.uid) told++; }
ok(dr.tgt === 'a' && told > 0, 'the first ranger to shoot is who it faces, and it still winds a blow (' + dr.tgt + ', ' + told + ' tells)');

core.cmd('b', { c: 'attack', uid: dr.uid });
let switched = 0, told2 = 0;
for (let i = 0; i < 20; i++) {
  a.hp = core.maxHp(a); b.hp = core.maxHp(b);
  for (const e of core.tick()) { if (e.e === 'tell' && e.mob === dr.uid) told2++; if (e.e === 'hit' && e.dst === dr.uid && e.src === 'b' && dr.tgt === 'b') switched++; }
}
ok(dr.tgt === 'a' && switched === 0, 'a second ranger does not steal its focus (' + dr.tgt + ')');
ok(told2 > 0, 'it keeps winding blows at the one it chose (' + told2 + ' tells)');

const wounded = 40;
dr.hp = wounded; dr.back = 0;
a.dead = core.S.t; a.act = null; a.path = [];
for (let i = 0; i < 8; i++) core.tick();
ok(dr.tgt === 'b', 'when that ranger falls it turns on the one still shooting (' + dr.tgt + ')');
ok(dr.hp <= wounded && dr.hp < D.monsters.chain_dragon.hp, 'it does not refill while the other ranger is still in the keep (' + dr.hp + ')');
for (let i = 0; i < 40; i++) { b.hp = core.maxHp(b); core.tick(); }
ok(dr.hp <= wounded && dr.hp < D.monsters.chain_dragon.hp, 'forty more ticks in the keep: still ' + dr.hp + ', not walking home to heal');

/* death pile: picking it up, then the host granting the same uids, must not double the bag */
const c2 = AshCore.create(D, { seed: 'pile' });
const q = c2.addPlayer('p1', { inv: [{ id: 'coins', n: 80 }, { id: 'sword_t2', n: 1 }, { id: 'bread', n: 3 }, { id: 'helmet_t1', n: 1 }] });
const held = (p) => { const o = {}; for (const s of p.inv) if (s) o[s.id] = (o[s.id] || 0) + s.n; return o; };
const bag0 = held(q);
c2.applyHit('p1', 999, 'melee', true);
const pile = c2.S.ground.filter(g => g.from === 'p1').map(g => ({ uid: g.uid, id: g.id, n: g.n, x: g.x, y: g.y }));
ok(q.inv.every(s => !s) && pile.length >= 3, 'death empties the bag onto the tile (' + pile.length + ' piles)');
for (let i = 0; i < 6; i++) c2.tick();
q.x = pile[0].x; q.y = pile[0].y;
for (const g of pile) { c2.cmd('p1', { c: 'take', uid: g.uid }); c2.tick(); }
const same = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);
const bag1 = held(q);
ok(same(bag1, bag0), 'one pickup restores the bag once (' + JSON.stringify(bag1) + ')');
for (const g of pile) c2.grantItem('p1', g.id, g.n, g.uid);
ok(same(held(q), bag1), 'the host granting those same piles again does not double them');
/* a replica take is a claim: the item is not in the bag until grantItem with that uid */
const c3 = AshCore.create(D, { seed: 'claim' });
const r = c3.addPlayer('p1', { inv: [{ id: 'mace_t1', n: 1 }] });
c3.applyHit('p1', 999, 'melee', true);
for (let i = 0; i < 6; i++) c3.tick();
const g = c3.S.ground.find(x => x.from === 'p1' && x.id === 'mace_t1');
r.x = g.x; r.y = g.y;
c3.setAuth(c3.zoneOf(g.x, g.y), false);
c3.cmd('p1', { c: 'take', uid: g.uid });
const evs = c3.tick();
ok(evs.some(e => e.e === 'claim' && e.g === g.uid) && !r.inv.some(s => s && s.id === 'mace_t1'), 'a replica asks the host instead of taking a second copy itself');
c3.setAuth(c3.zoneOf(g.x, g.y), true);
ok(c3.claim('p1', g.uid), 'the host honours the claim');
c3.grantItem('p1', 'mace_t1', 1, g.uid);
c3.grantItem('p1', 'mace_t1', 1, g.uid);
ok(r.inv.filter(s => s && s.id === 'mace_t1').length === 1, 'granted once even if the host event arrives twice');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
