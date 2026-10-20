'use strict';
/* [Claude 2026-10-19] The Drowned Tower played for real (as tests/caged_seer_play_test.js): a melee character with the camp forge's gear
   and Elin's potions clears the tower's four cellar levels in order and kills Countess Morwen, eating at half health; out of potions it
   goes home to restock and comes back to the level it left (a scroll of town portal's way: the den and the cellars drop them).
   The operator: each chapter a little harder than the one before. Recommended level: one or two trips, no deaths; at The Caged Seer's
   level (44) it should cost more than that chapter does there (~31 potions).
     node tests/drowned_tower_play_test.js        TUNE='{"morwen":{"hp":280}}' */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const all = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const zones = ['village', 'thornwatch', 'blackmere', 'towercellars'].map(id => all.find(z => z.id === id)), Z = id => zones.find(z => z.id === id);
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
if (process.env.TUNE) { const T = JSON.parse(process.env.TUNE); for (const k in T) Object.assign(D.monsters[k], T[k]); }
const QD = D.quests.quests.drowned_tower, FOOD = 'potion', FOOD_N = +(process.env.FOOD_N || 22), SEED = process.env.SEED || 'tower-play';
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const TC = Z('towercellars'), LV = x => Math.floor((x - TC.origin[0]) / 42);

function play(A, seed, maxTrips) {
  const core = AshCore.create(D, { seed });
  const XP = D.rules.xp, L = { attack: A, strength: A, defence: A, hitpoints: A + 2, ranged: 15, magic: 10, prayer: 15 };
  const xp = {}; for (const s of D.rules.skills) xp[s] = XP[L[s] || 8] * 10;
  const p = core.addPlayer('p1', { name: 'Tester', xp }), tick = () => core.tick();
  for (const id of ['hollow_den', 'sisters_barrow', 'caged_seer']) p.quests[id] = { step: 9 }; p.flags = { seer_freed: 1 };
  const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, -1]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
  const talk = id => { const n = core.M.npcs.find(x => x.id === id); beside(n); core.cmd('p1', { c: 'npc', id }); let d = null; for (let i = 0; i < 6 && !d; i++) d = tick().find(e => e.e === 'dialog' && e.p === 'p1'); return d; };
  const slotOf = id => p.inv.findIndex(s => s && s.id === id);
  p.inv = new Array(28).fill(null);
  const buy = (shop, id, n) => { if (n <= 0) return; const cs = slotOf('coins'); if (cs >= 0) p.inv[cs].n = 30000; else p.inv[p.inv.indexOf(null)] = { id: 'coins', n: 30000 }; talk(D.shops.shops[shop].keeper); p.shop = shop; core.cmd('p1', { c: 'buy', shop, item: id, n }); tick(); };
  const KIT = ['sword_t4', 'helmet_t3', 'body_t3', 'legs_t3', 'shield_t3'], SLOT = { sword: 'weapon', helmet: 'head', body: 'body', legs: 'legs', shield: 'shield' };
  const stock = () => { for (const id of KIT) if (!p.eq[SLOT[id.split('_')[0]]]) { buy('thornwatch_forge', id, 1); const s = slotOf(id); if (s >= 0) { core.cmd('p1', { c: 'equip', slot: s }); tick(); } }
    buy('thornwatch_herbs', FOOD, Math.max(0, FOOD_N - core.invCount(p, FOOD))); const cs = slotOf('coins'); if (cs >= 0) p.inv[cs] = null; p.hp = core.maxHp(p); };
  stock();
  const offer = talk('hollin'); core.cmd('p1', { c: 'acceptq', q: 'drowned_tower' }); tick();
  const ups = TC.objects.filter(o => o.k === 'stairsup').sort((a, b) => a.x - b.x);
  let trips = 1, deaths = 0, used = 0, T = 0, lvl = 0;
  const go = () => { const a = ups[lvl]; p.x = a.x + 1; p.y = a.y + 1; p.path = []; p.act = null; };
  const left = () => core.S.mobs.filter(m => !m.dead && !m.gone && m.x >= TC.origin[0] && LV(m.x) === lvl && m.y >= TC.origin[1]);
  const done = () => ((p.quests.drowned_tower.kn || {}).morwen | 0) >= 1;
  go();
  for (let n = 0; n < 60000 && !done(); n++) {
    T++;
    const hp0 = core.maxHp(p);
    if (p.dead || p.hp <= 0) { deaths++; for (let i = 0; i < 400 && p.dead; i++) tick(); stock(); trips++; if (trips > maxTrips) break; go(); continue; }
    if (slotOf(FOOD) < 0 && p.hp < hp0 * 0.6) { stock(); trips++; if (trips > maxTrips) break; go(); continue; }
    if (p.hp < hp0 * 0.5) { const s = slotOf(FOOD); if (s >= 0) { core.cmd('p1', { c: 'eat', slot: s }); used++; } }
    const L0 = left(); if (!L0.length && lvl < 3) { lvl++; go(); continue; }
    if (!p.act || p.act.k !== 'attack') { let best = null, bd = 1e9; for (const m of L0) { const d = Math.hypot(m.x - p.x, m.y - p.y) - (m.tgt === 'p1' ? 8 : 0); if (d < bd) { bd = d; best = m; } } if (best) core.cmd('p1', { c: 'attack', uid: best.uid }); }
    tick();
  }
  return { trips, deaths, used, min: Math.round(T * 0.6 / 60), done: done(), offer };
}
const rec = QD.combat, hi = [], lo = [];
for (const s of [SEED, SEED + '2', SEED + '3']) { hi.push(play(41, s + '-hi', 3)); lo.push(play(37, s + '-lo', 5)); }
for (const [name, R] of [['combat ' + rec + ' (att/str/def 41)', hi], ['combat 44 (att/str/def 37, The Caged Seer\'s level)', lo]])
  for (const r of R) console.log('     ' + name + ': ' + (r.done ? 'done' : 'NOT done') + ' in ' + r.trips + ' trip(s), ' + r.deaths + ' death(s), ' + r.used + ' potions, ~' + r.min + ' min');
ok(/Recommended combat level: 48/.test((hi[0].offer && hi[0].offer.lines || []).join(' ')), 'Hollin names the recommended combat level');
ok(hi.every(r => r.done && r.trips <= 2 && r.deaths === 0), 'at the recommended level: done in two trips at most, no deaths');
const loUsed = lo.reduce((a, r) => a + r.used, 0) / lo.length;
ok(lo.every(r => r.done) && loUsed > 31, 'at The Caged Seer\'s level it is harder than that chapter there (' + loUsed.toFixed(0) + ' potions on average; it takes ~31) but still beatable');
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
