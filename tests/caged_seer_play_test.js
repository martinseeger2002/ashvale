'use strict';
/* [Claude 2026-10-19] The Caged Seer played for real, as tests/sisters_barrow_play_test.js plays the barrow: a melee character with
   the camp forge's gear and Elin's potions fights the chapter's three set fights in order (Gnarlbark's trial at the hollow oak,
   Rakkas and his band at the Fivestones, Bregan and the burning dead in Emberfall's square), eating at half health and going home
   to restock when the potions run out. The operator: every chapter a little harder than the one before. At the recommended level it should
   play like the barrow at its own: one or two trips, no deaths; at the barrow's level it should cost more than the barrow does.
     node tests/caged_seer_play_test.js        TUNE='{"bregan":{"hp":240}}' to try monster numbers */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const all = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const zones = ['village', 'thornwatch', 'redmoor', 'sistersbarrow', 'fivestones', 'gloamwood', 'emberfall'].map(id => all.find(z => z.id === id)), Z = id => zones.find(z => z.id === id);
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
if (process.env.TUNE) { const T = JSON.parse(process.env.TUNE); for (const k in T) Object.assign(D.monsters[k], T[k]); }
const QD = D.quests.quests.caged_seer, FOOD = 'potion', FOOD_N = +(process.env.FOOD_N || 22), SEED = process.env.SEED || 'seer-play';
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const inBox = (q, z) => q.x >= z.origin[0] && q.y >= z.origin[1] && q.x < z.origin[0] + z.size[0] && q.y < z.origin[1] + z.size[1];

function play(A, seed, maxTrips) {
  const core = AshCore.create(D, { seed });
  const XP = D.rules.xp, L = { attack: A, strength: A, defence: A, hitpoints: A + 2, ranged: 15, magic: 10, prayer: 15 };
  const xp = {}; for (const s of D.rules.skills) xp[s] = XP[L[s] || 8] * 10;
  const p = core.addPlayer('p1', { name: 'Tester', xp }), tick = () => core.tick();
  p.quests.hollow_den = { step: 2, n: 32 }; p.quests.sisters_barrow = { step: 2, n: 21 };
  const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, -1], [0, 2], [2, 0]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
  const talk = id => { const n = core.M.npcs.find(x => x.id === id); beside(n); core.cmd('p1', { c: 'npc', id }); let d = null; for (let i = 0; i < 6 && !d; i++) d = tick().find(e => e.e === 'dialog' && e.p === 'p1'); return d; };
  const slotOf = id => p.inv.findIndex(s => s && s.id === id);
  p.inv = new Array(28).fill(null);
  const buy = (shop, id, n) => { if (n <= 0) return; const cs = slotOf('coins'); if (cs >= 0) p.inv[cs].n = 30000; else p.inv[p.inv.indexOf(null)] = { id: 'coins', n: 30000 }; talk(D.shops.shops[shop].keeper); p.shop = shop; core.cmd('p1', { c: 'buy', shop, item: id, n }); tick(); };
  const purse = () => { const cs = slotOf('coins'); if (cs >= 0) p.inv[cs] = null; };
  const KIT = ['sword_t4', 'helmet_t3', 'body_t3', 'legs_t3', 'shield_t3'], SLOT = { sword: 'weapon', helmet: 'head', body: 'body', legs: 'legs', shield: 'shield' };
  const stock = () => { for (const id of KIT) if (!p.eq[SLOT[id.split('_')[0]]]) { buy('thornwatch_forge', id, 1); const s = slotOf(id); if (s >= 0) { core.cmd('p1', { c: 'equip', slot: s }); tick(); } }
    buy('thornwatch_herbs', FOOD, Math.max(0, FOOD_N - core.invCount(p, FOOD))); purse(); p.hp = core.maxHp(p); };
  stock();
  const offer = talk('isolde'); core.cmd('p1', { c: 'acceptq', q: 'caged_seer' }); tick();
  const q = () => p.quests.caged_seer, kn = k => ((q().kn || {})[k]) | 0;
  const oak = Z('gloamwood').objects.find(o => o.id === 'hollow_oak'), ring = Z('fivestones').objects.find(o => o.k === 'portalgate');
  const EF = Z('emberfall'), arrive = Z('fivestones').objects.find(o => o.k === 'portalgate').to;
  /* the three set fights: where you start, what you fight, when it is over */
  const FIGHTS = [
    { name: 'oak', zone: Z('gloamwood'), start: () => { p.x = oak.x; p.y = oak.y + 1; p.path = []; p.act = null; core.cmd('p1', { c: 'mechanism', x: oak.x, y: oak.y }); for (let i = 0; i < 4; i++) tick(); }, done: () => core.hasFlag(p, 'seer_scroll'), near: [oak.x, oak.y] },
    { name: 'stones', zone: Z('fivestones'), start: () => { p.x = ring.x; p.y = ring.y + 2; p.path = []; p.act = null; }, done: () => kn('rakkas') >= 1, near: [ring.x, ring.y + 10] },
    { name: 'emberfall', zone: EF, start: () => { p.x = arrive[0]; p.y = arrive[1]; p.path = []; p.act = null; }, done: () => kn('bregan') >= 1, near: (b => [b.x, b.y])(EF.spawns.find(s => s.m === 'bregan')) }];
  let trips = 1, deaths = 0, used = 0, T = 0;
  for (const F of FIGHTS) {
    if (F.name === 'stones') { talk('isolde'); for (const k of ['fivestones_1', 'fivestones_2', 'fivestones_3', 'fivestones_4', 'stones_open']) { p.flags = p.flags || {}; p.flags[k] = 1; } }   /* the walk round the stones is caged_seer_test.js's job */
    F.start();
    for (let n = 0; n < 40000 && !F.done(); n++) {
      T++;
      const hp0 = core.maxHp(p);
      if (p.dead || p.hp <= 0) { deaths++; for (let i = 0; i < 400 && p.dead; i++) tick(); stock(); trips++; if (trips > maxTrips) break; F.start(); continue; }
      if (slotOf(FOOD) < 0 && p.hp < hp0 * 0.6) { stock(); trips++; if (trips > maxTrips) break; F.start(); continue; }   /* out of potions: home and back */
      if (p.hp < hp0 * 0.5) { const s = slotOf(FOOD); if (s >= 0) { core.cmd('p1', { c: 'eat', slot: s }); used++; } }
      if (!p.act || p.act.k !== 'attack') {   /* whatever is coming for you first, else the nearest to the fight */
        let best = null, bd = 1e9; for (const m of core.S.mobs) if (!m.dead && !m.gone && inBox(m, F.zone) && (m.summon ? m.owner === 'p1' : true)) { const d = Math.hypot(m.x - p.x, m.y - p.y) - (m.tgt === 'p1' ? 8 : 0) + Math.hypot(m.x - F.near[0], m.y - F.near[1]) * 0.3; if (d < bd) { bd = d; best = m; } }
        if (best && bd < 40) core.cmd('p1', { c: 'attack', uid: best.uid });
      }
      tick();
    }
    if (trips > maxTrips || !F.done()) break;
  }
  return { trips, deaths, used, min: Math.round(T * 0.6 / 60), done: core.hasFlag(p, 'seer_scroll') && kn('rakkas') >= 1 && kn('bregan') >= 1, offer };
}
const rec = QD.combat, hi = [], lo = [];
for (const s of [SEED, SEED + '2', SEED + '3']) { hi.push(play(37, s + '-hi', 3)); lo.push(play(33, s + '-lo', 5)); }
for (const [name, R] of [['combat ' + rec + ' (att/str/def 37)', hi], ['combat 40 (att/str/def 33, the barrow\'s level)', lo]])
  for (const r of R) console.log('     ' + name + ': ' + (r.done ? 'done' : 'NOT done') + ' in ' + r.trips + ' trip(s), ' + r.deaths + ' death(s), ' + r.used + ' potions, ~' + r.min + ' min');
ok(/Recommended combat level: 44/.test((hi[0].offer && hi[0].offer.lines || []).join(' ')), 'Isolde names the recommended combat level');
ok(hi.every(r => r.done && r.trips <= 2 && r.deaths === 0), 'at the recommended level: done in two trips at most, no deaths');
const loUsed = lo.reduce((a, r) => a + r.used, 0) / lo.length;
ok(lo.every(r => r.done) && loUsed > 26, 'at the barrow\'s level it is harder than the barrow there (' + loUsed.toFixed(0) + ' potions on average; the barrow takes ~26) but still beatable');
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
