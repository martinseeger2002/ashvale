'use strict';
/* [Claude 2026-10-18] The Sisters' Barrow played for real, as tests/hollow_den_play_test.js plays the den (the operator: "This quest should be
   slightly harder than the last one. The quests need to be progressively harder."). No credited kills: an avatar buys the camp forge's
   tier-4 sword and tier-3 armour and the herbalist's potions, has cleared the den (the barrow opens after it), takes the quest from
   Captain Rhosyn, walks south over the moor through the iron gate and fights whatever the game's own combat puts in front of it - the
   risen dead, and Sister Corva, who shoots from range and calls the dead when struck - eating when low. Out of potions it walks back
   to the camp and restocks; a death wakes it by the camp's portal. Prints trips, deaths and potions used.
   Each quest is harder than the one before it (the operator), measured the same way: at the quest's recommended combat level
   (Rhosyn names it when she offers: 40, attack/strength/defence 33) it plays like the den does at its own (36): about two
   trips, no deaths; and the den's own avatar needs more potions here than it does in the den (~30, two trips).   node tests/sisters_barrow_play_test.js [seed] */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'thornwatch', 'redmoor', 'hollowden', 'sistersbarrow'].map(id => Object.assign({ id }, mod('zone.' + id)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
if (process.env.TUNE) { const T = JSON.parse(process.env.TUNE); for (const k in T) { const md = D.monsters[k]; for (const f in T[k]) { if (f.startsWith('ai.')) md.ai = Object.assign({}, md.ai, { [f.slice(3)]: T[k][f] }); else md[f] = T[k][f]; } } }   /* balance trials */
const SEED = process.argv[2] || 'barrow-play', FOOD = 'potion', FOOD_N = 22;
const QD = D.quests.quests.sisters_barrow, bz = zones.find(z => z.id === 'sistersbarrow');
const inYard = q => q.x >= bz.origin[0] && q.y >= bz.origin[1] && q.x < bz.origin[0] + bz.size[0] && q.y < bz.origin[1] + bz.size[1];
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };

const APPLE_L = { attack: 25, strength: 12, defence: 37, hitpoints: 32, ranged: 18, magic: 40, prayer: 18, dexterity: 31, speechcraft: 25, woodcutting: 16, mining: 45, fishing: 25, cooking: 28, firemaking: 16 };   /* @apple (the operator's screenshot 2026-10-18: combat 39), a caster */
function play(A, seed, maxTrips) {
  const core = AshCore.create(D, { seed }), apple = A === 'apple';
  const XP = D.rules.xp, L = apple ? APPLE_L : { attack: A, strength: A, defence: A, hitpoints: A + 2, ranged: 15, magic: 10, prayer: 15 };
  const xp = {}; for (const s of D.rules.skills) xp[s] = XP[L[s] || 8] * 10;
  const p = core.addPlayer('p1', { name: 'Tester', xp }), tick = () => core.tick();
  p.quests.hollow_den = { step: 2, n: 32 };   /* the den is behind it */
  const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, -1]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
  const talk = id => { const n = core.M.npcs.find(x => x.id === id); beside(n); core.cmd('p1', { c: 'npc', id }); let d = null; for (let i = 0; i < 6 && !d; i++) d = tick().find(e => e.e === 'dialog' && e.p === 'p1'); return d; };
  const slotOf = id => p.inv.findIndex(s => s && s.id === id);
  p.inv = new Array(28).fill(null);
  const buy = (shop, id, n) => { if (n <= 0) return; const cs = p.inv.findIndex(x => x && x.id === 'coins'); if (cs >= 0) p.inv[cs].n = 30000; else p.inv[p.inv.indexOf(null)] = { id: 'coins', n: 30000 };   /* coins weigh 2 g: the purse comes from the chest for the shopping ... */ talk(D.shops.shops[shop].keeper); p.shop = shop; core.cmd('p1', { c: 'buy', shop, item: id, n }); tick(); };
  const purse = () => { const cs = p.inv.findIndex(x => x && x.id === 'coins'); if (cs >= 0) p.inv[cs] = null; };   /* ... and goes back before the walk */
  const KIT = [apple ? 'staff_t4' : 'sword_t4', 'helmet_t3', 'body_t3', 'legs_t3', 'shield_t3'], SLOT = { sword: 'weapon', staff: 'weapon', helmet: 'head', body: 'body', legs: 'legs', shield: 'shield' };
  let used = 0; const SEEN = {};
  const stock = () => { for (const id of KIT) if (!p.eq[SLOT[id.split('_')[0]]]) { buy('thornwatch_forge', id, 1); const s = slotOf(id); if (s >= 0) { core.cmd('p1', { c: 'equip', slot: s }); tick(); } }
    buy('thornwatch_herbs', FOOD, Math.max(0, FOOD_N - core.invCount(p, FOOD))); };
  if (apple) D.shops.shops.thornwatch_forge.stock = D.shops.shops.thornwatch_forge.stock.filter(i => i !== 'staff_t4').concat(['staff_t4']);   /* a staff from the forge, for the test */
  stock(); purse(); p.hp = core.maxHp(p);
  const offer = talk('rhosyn'); core.cmd('p1', { c: 'acceptq', q: 'sisters_barrow' }); tick();
  const done = () => p.quests.sisters_barrow && ((p.quests.sisters_barrow.n | 0) >= QD.steps[0].goal.n || p.quests.sisters_barrow.step > 1);
  const gate = [bz.origin[0] + 30.5 | 0, bz.origin[1] + 16];   /* just inside the iron gate */
  let trips = 0, deaths = 0, T = 0;
  while (trips < maxTrips && !done()) {
    trips++; if (trips > 1) { stock(); purse(); }
    p.x = gate[0]; p.y = gate[1]; p.path = []; p.act = null;   /* the walk over the moor is not the test: start each trip at the gate */
    const hp0 = core.maxHp(p);
    for (let n = 0; n < 20000 && !done(); n++) {
      T++;
      if (p.dead || p.hp <= 0) { if (process.env.DBG) console.log('     died at', p.x, p.y, 'trip', trips); deaths++; for (let i = 0; i < 400 && (p.dead || inYard(p)); i++) tick(); break; }
      if (slotOf(FOOD) < 0 && p.hp < hp0 * 0.6) { if (process.env.DBG) console.log('     out of potions, trip', trips, 'n', p.quests.sisters_barrow.n, JSON.stringify(p.quests.sisters_barrow.kn)); break; }   /* out of potions: walk home and restock */
      if (p.hp < hp0 * 0.5) { const s = slotOf(FOOD); if (s >= 0) { core.cmd('p1', { c: 'eat', slot: s }); used++; } }
      if (!p.act || p.act.k !== 'attack') {   /* whatever is coming for you first, else the nearest; Corva when nothing else is near */
        let best = null, bd = 1e9; for (const m of core.S.mobs) if (!m.dead && inYard(m)) { const d = Math.hypot(m.x - p.x, m.y - p.y) - (m.tgt === 'p1' ? 6 : 0); if (d < bd) { bd = d; best = m; } }
        if (best) core.cmd('p1', { c: 'attack', uid: best.uid });
      }
      for (const e of tick()) if (process.env.DBG && e.e === 'attack' && e.dst === 'p1') { const m = core.S.mobs.find(q => q.uid === e.src); if (m) SEEN[m.key + (e.cls === 'ranged' ? ' (arrow)' : '')] = (SEEN[m.key + (e.cls === 'ranged' ? ' (arrow)' : '')] | 0) + 1; }
    }
  }
  if (process.env.DBG) console.log('     blows at you:', JSON.stringify(SEEN), 'killed:', JSON.stringify(p.kills));
  if (process.env.DBG) console.log('     end: trips', trips, 'done', done(), JSON.stringify(p.quests.sisters_barrow), 'T', T);
  const dlg = talk('rhosyn');
  return { trips, deaths, used, min: Math.round(T * 0.6 / 60), done: p.quests.sisters_barrow.step > QD.steps.length, bow: core.invCount(p, 'bow_t4'), offer, cl: core.combatLevel ? core.combatLevel(p) : null };
}
const rec = QD.combat;
if (process.env.PROFILE === 'apple') { for (const s of [SEED, SEED + '2', SEED + '3']) { const r = play('apple', s + '-apple', 4); console.log('     @apple (combat 39, Magic 40, staff): ' + (r.done ? 'done' : 'NOT done') + ' in ' + r.trips + ' trip(s), ' + r.deaths + ' death(s), ' + r.used + ' potions, ~' + r.min + ' min'); } process.exit(0); }   /* for the balance note, not a check */
const hi = [], lo = [];
for (const s of [SEED, SEED + '2', SEED + '3']) { hi.push(play(33, s + '-hi', 3)); lo.push(play(30, s + '-lo', 4)); }
for (const [name, R] of [['combat ' + rec + ' (att/str/def 33)', hi], ['combat 36 (att/str/def 30, the den\'s level)', lo]])
  for (const r of R) console.log('     ' + name + ': ' + (r.done ? 'done' : 'NOT done') + ' in ' + r.trips + ' trip(s), ' + r.deaths + ' death(s), ' + r.used + ' potions, ~' + r.min + ' min');
ok(/Recommended combat level: 40/.test((hi[0].offer && hi[0].offer.lines || []).join(' ')), 'Rhosyn names the recommended combat level when she offers: "' + (hi[0].offer && hi[0].offer.lines.slice(-1)[0]) + '"');
ok(hi.every(r => r.done && r.bow >= 1), 'complete, and Rhosyn pays the sisters\' shortbow');
ok(hi.every(r => r.trips <= 2 && r.deaths === 0), 'at the recommended level: two trips at most, no deaths (as the den at its own)');
const loUsed = lo.reduce((a, r) => a + r.used, 0) / lo.length;
ok(lo.every(r => r.done) && loUsed > 30, 'at the den\'s level it is harder than the den (' + loUsed.toFixed(0) + ' potions on average; the den takes ~30) but still beatable');
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
