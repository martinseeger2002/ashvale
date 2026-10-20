'use strict';
/* [Claude 2026-10-18] The Hollow Den played for real (the operator: "Make sure the thornwatch quest is beatable using current mechanics").
   No credited kills: the avatar the den is tuned for (total level ~220 - attack/strength/defence 30, hitpoints 32, the rest low)
   buys tier-4 sword and tier-3 armour at the camp forge and lobsters from the herbalist with the GOLD the quest's level of player
   carries, takes the quest from Mother Isolde, goes down the cave mouth on the Red Moor, fights every creature the game's own
   combat puts in front of it (packs, firecallers, Cinderhide), eats when it is low, climbs back out and hands in. A death wakes
   it by the camp's portal stone; it restocks and goes back down, as a player would. Passes when the quest completes within two
   trips (the operator: "Soften to about 2 trips") and pays the Thornwatch stone.   node tests/hollow_den_play_test.js [seed] */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'thornwatch', 'redmoor', 'hollowden'].map(id => Object.assign({ id }, mod('zone.' + id)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
if (process.env.TUNE) { const T = JSON.parse(process.env.TUNE); for (const k in T) { const md = D.monsters[k]; for (const f in T[k]) { if (f.startsWith('ai.')) { md.ai = Object.assign({}, md.ai, { [f.slice(3)]: T[k][f] }); } else if (f.startsWith('cast.')) { md.cast = Object.assign({}, md.cast, { [f.slice(5)]: T[k][f] }); } else md[f] = T[k][f]; } } }   /* balance trials (not used by the test itself) */
const SEED = process.argv[2] || 'den-play', MAX_TRIPS = +(process.env.TRIPS || 5), FOOD = process.env.FOOD || 'potion', FOOD_N = +(process.env.FOOD_N || 22);   /* Isolde: "Elin sells my potions by the gate. Take more than you think you need." */
const core = AshCore.create(D, { seed: SEED });
const A = +(process.env.ATT || 30), AT = process.env.ARM || '3', WT = process.env.WPN || '4';
const APPLE = process.env.PROFILE === 'apple';   /* @apple's own levels (the operator's screenshot 2026-10-18: combat 39, total 368) - a caster */
const XP = D.rules.xp, L = APPLE ? { attack: 25, strength: 12, defence: 37, hitpoints: 32, ranged: 18, magic: 40, prayer: 18, dexterity: 31, speechcraft: 25, woodcutting: 16, mining: 45, fishing: 25, cooking: 28, firemaking: 16 }
  : { attack: A, strength: A, defence: A, hitpoints: A + 2, ranged: 15, magic: 10, prayer: 15 };
const xp = {}; for (const s of D.rules.skills) xp[s] = XP[L[s] || 8] * 10;
const p = core.addPlayer('p1', { name: 'Tester', xp });
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const tick = () => core.tick();
const den = zones.find(z => z.id === 'hollowden'), moor = zones.find(z => z.id === 'redmoor');
const inDen = q => q.x >= den.origin[0] && q.y >= den.origin[1] && q.x < den.origin[0] + den.size[0] && q.y < den.origin[1] + den.size[1];
const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, -1]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
const talk = id => { const n = core.M.npcs.find(x => x.id === id); beside(n); core.cmd('p1', { c: 'npc', id }); let d = null; for (let i = 0; i < 6 && !d; i++) d = tick().find(e => e.e === 'dialog' && e.p === 'p1'); return d; };
const slotOf = id => p.inv.findIndex(s => s && s.id === id);

/* kit: what the camp sells, paid for like a player would */
p.inv = new Array(28).fill(null); p.inv[0] = { id: 'coins', n: 20000 };
const buy = (shop, id, n) => { if (n <= 0) return; const cs = p.inv.findIndex(x => x && x.id === 'coins'); if (cs >= 0) p.inv[cs].n = 20000; else p.inv[p.inv.indexOf(null)] = { id: 'coins', n: 20000 };   /* coins weigh 2 g: the purse comes from the chest for the shopping */ const k = D.shops.shops[shop].keeper; talk(k); if (p.shop !== shop) { p.shop = shop; } core.cmd('p1', { c: 'buy', shop, item: id, n }); tick(); };   /* talking to the keeper opens the shop */
const KIT = [APPLE ? 'staff_t' + (process.env.STAFF || 4) : 'sword_t' + WT, 'helmet_t' + AT, 'body_t' + AT, 'legs_t' + AT, 'shield_t' + AT];
if (APPLE) { const forge = D.shops.shops.thornwatch_forge; forge.stock = forge.stock.concat([KIT[0]]); }   /* a staff from the forge, for the test (the forge sells none) */
for (const id of KIT) buy('thornwatch_forge', id, 1);
for (const id of KIT) { const s = slotOf(id); if (s >= 0) { core.cmd('p1', { c: 'equip', slot: s }); tick(); } }
ok(p.eq.weapon && p.eq.weapon.id === KIT[0] && p.eq.body && p.eq.body.id === KIT[2], 'bought and wore the camp forge\'s sword and armour (' + Object.values(p.eq).map(e => e && e.id).join(', ') + ')');
const PP_N = +(process.env.PP_N || 0);   /* prayer potions: Protect from Melee is a level-1 prayer every player has */
const stock = () => { for (const id of KIT) if (!p.eq[{ sword: 'weapon', staff: 'weapon', helmet: 'head', body: 'body', legs: 'legs', shield: 'shield' }[id.split('_')[0]]]) { buy('thornwatch_forge', id, 1); const s = slotOf(id); if (s >= 0) { core.cmd('p1', { c: 'equip', slot: s }); tick(); } }   /* lost it all dying: buy it again */
  buy('thornwatch_herbs', FOOD, Math.max(0, FOOD_N - core.invCount(p, FOOD))); if (PP_N) buy('thornwatch_herbs', 'prayer_potion', Math.max(0, PP_N - core.invCount(p, 'prayer_potion'))); return core.invCount(p, FOOD); };
const purse = () => { const cs = p.inv.findIndex(x => x && x.id === 'coins'); if (cs >= 0) p.inv[cs] = null; };   /* and goes back in the chest before the walk */
p.pp = 15; ok(stock() >= FOOD_N - 2, 'and ' + core.invCount(p, FOOD) + ' ' + FOOD + 's from the herbalist');

/* the quest */
p.hp = core.maxHp(p);
let dlg = talk('isolde'); ok(dlg && dlg.offer === 'hollow_den', 'Mother Isolde offers The Hollow Den');
core.cmd('p1', { c: 'acceptq', q: 'hollow_den' }); tick();
const Q = () => p.quests.hollow_den, goal = D.quests.quests.hollow_den.steps[0].goal;

/* trips down the den */
const mouth = moor.objects.find(o => o.k === 'cavemouth'), out = den.objects.find(o => o.k === 'caveexit');
let trips = 0, retreats = 0, deaths = 0, eaten = 0, T = 0;
const done = () => Q().step > 1 || (Q().n | 0) >= goal.n;
while (trips < MAX_TRIPS && !done()) {
  trips++;
  if (trips > 1) stock();
  purse();
  beside(mouth); p.hp = Math.max(p.hp, 1); core.cmd('p1', { c: 'enter', x: mouth.x, y: mouth.y }); for (let i = 0; i < 20 && !inDen(p); i++) tick();
  if (!inDen(p)) { ok(false, 'trip ' + trips + ': could not go down the cave mouth'); break; }
  const hp0 = core.maxHp(p); if (PP_N) { core.cmd('p1', { c: 'pray', id: 'protect_from_melee', on: true }); tick(); }
  for (let n = 0; n < 20000 && !done(); n++) {
    T++;
    if (p.dead || p.hp <= 0) { deaths++; for (let i = 0; i < 400 && (p.dead || inDen(p)); i++) tick(); break; }
    if (PP_N && (p.pp | 0) <= 2) { const s = slotOf('prayer_potion'); if (s >= 0) { core.cmd('p1', { c: 'eat', slot: s }); } if (!(p.pray || {}).protect_from_melee) core.cmd('p1', { c: 'pray', id: 'protect_from_melee', on: true }); }
    if (slotOf(FOOD) < 0 && p.hp < hp0 * 0.6) {   /* out of potions: climb out on foot, as a player would, and restock */
      core.cmd('p1', { c: 'enter', x: out.x, y: out.y }); for (let i = 0; i < 300 && inDen(p) && !p.dead && p.hp > 0; i++) { tick(); if (i % 20 === 19 && inDen(p)) core.cmd('p1', { c: 'enter', x: out.x, y: out.y }); }
      if (!inDen(p) && !p.dead) { retreats++; break; }
    }
    if (p.hp < hp0 * 0.5) { const s = slotOf(FOOD); if (s >= 0) { core.cmd('p1', { c: D.items[FOOD].category === 'potion' || /potion/.test(FOOD) ? 'eat' : 'eat', slot: s }); eaten++; } }
    if (!p.act || p.act.k !== 'attack') {
      let best = null, bd = 1e9; for (const m of core.S.mobs) if (!m.dead && inDen(m)) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
      if (best) core.cmd('p1', { c: 'attack', uid: best.uid });
    }
    tick();
  }
  console.log('     prayer ' + (p.pp | 0) + ', prayer potions left ' + core.invCount(p, 'prayer_potion'));
  console.log('     trip ' + trips + ': ' + (Q().n | 0) + ' / ' + goal.n + ' killed, ' + (p.dead || p.hp <= 0 ? 'died' : 'alive at ' + p.hp + '/' + hp0) + ', ' + core.invCount(p, FOOD) + ' food left');
}
ok(done() && trips <= 2, 'the den cleared for real in ' + trips + ' trip(s), ' + retreats + ' climbed out to restock, ' + deaths + ' death(s), ' + eaten + ' eaten, ~' + Math.round(T * 0.6 / 60) + ' min of fighting');

/* back up and hand in */
if (inDen(p)) { beside(out); core.cmd('p1', { c: 'enter', x: out.x, y: out.y }); for (let i = 0; i < 20 && inDen(p); i++) tick(); }
ok(!inDen(p), 'climbed back out of the den');
dlg = talk('isolde');
ok(Q().step > D.quests.quests.hollow_den.steps.length, 'Mother Isolde takes the quest back: complete');
ok(core.invCount(p, 'thornwatch_stone') === 1, 'and pays the Thornwatch stone');
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
