'use strict';
/* [Claude 2026-10-19] The Smith's Hammer and The Thorn Maiden played for real (as the other Thornwatch play tests): a melee character
   with the camp forge's gear and Elin's potions (antidotes too, for the crypts) eats at half health and goes home to restock when the
   potions run out, coming back where it left off (the abbey's portal stand, a scroll of town portal).
     chapter 5: from inside the abbey gate, clear the yard, the cloister and the barracks and kill Gorrath (his drop is the hammer)
     chapter 6: down the crypts level by level, clearing each, and kill Maelis
   the operator: each chapter a little harder than the one before. At its recommended level: two trips at most, no deaths; at the chapter
   before's level it should cost more than that chapter does there.
     node tests/abbey_play_test.js [5|6]        TUNE='{"gorrath":{"hp":300}}' */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const all = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const zones = ['village', 'thornwatch', 'abbey', 'crypts'].map(id => all.find(z => z.id === id)), Z = id => zones.find(z => z.id === id);
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
if (process.env.TUNE) { const T = JSON.parse(process.env.TUNE); for (const k in T) Object.assign(D.monsters[k], T[k]); }
const FOOD = 'potion', FOOD_N = +(process.env.FOOD_N || 22), SEED = process.env.SEED || 'abbey-play', ONLY = process.argv[2];
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const AB = Z('abbey'), CR = Z('crypts'), LV = x => Math.floor((x - CR.origin[0]) / 42);
const inBox = (q, z) => q.x >= z.origin[0] && q.y >= z.origin[1] && q.x < z.origin[0] + z.size[0] && q.y < z.origin[1] + z.size[1];

function play(ch, A, seed, maxTrips) {
  const core = AshCore.create(D, { seed });
  const XP = D.rules.xp, L = { attack: A, strength: A, defence: A, hitpoints: A + 2, ranged: 15, magic: 10, prayer: 15 };
  const xp = {}; for (const s of D.rules.skills) xp[s] = XP[L[s] || 8] * 10;
  const p = core.addPlayer('p1', { name: 'Tester', xp }), tick = () => core.tick();
  for (const id of ['hollow_den', 'sisters_barrow', 'caged_seer', 'drowned_tower']) p.quests[id] = { step: 9 }; p.flags = { seer_freed: 1 };
  if (ch === 6) p.quests.smiths_hammer = { step: 9 };
  const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, -1]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
  const talk = id => { const n = core.M.npcs.find(x => x.id === id); beside(n); core.cmd('p1', { c: 'npc', id }); let d = null; for (let i = 0; i < 6 && !d; i++) d = tick().find(e => e.e === 'dialog' && e.p === 'p1'); return d; };
  const slotOf = id => p.inv.findIndex(s => s && s.id === id);
  p.inv = new Array(28).fill(null);
  const buy = (shop, id, n) => { if (n <= 0) return; const cs = slotOf('coins'); if (cs >= 0) p.inv[cs].n = 30000; else p.inv[p.inv.indexOf(null)] = { id: 'coins', n: 30000 }; talk(D.shops.shops[shop].keeper); p.shop = shop; core.cmd('p1', { c: 'buy', shop, item: id, n }); tick(); };
  const KIT = ['sword_t4', 'helmet_t3', 'body_t3', 'legs_t3', 'shield_t3'], SLOT = { sword: 'weapon', helmet: 'head', body: 'body', legs: 'legs', shield: 'shield' };
  const stock = () => { for (const id of KIT) if (!p.eq[SLOT[id.split('_')[0]]]) { buy('thornwatch_forge', id, 1); const s = slotOf(id); if (s >= 0) { core.cmd('p1', { c: 'equip', slot: s }); tick(); } }
    buy('thornwatch_herbs', FOOD, Math.max(0, FOOD_N - core.invCount(p, FOOD))); if (ch === 6) buy('thornwatch_herbs', 'antidote', Math.max(0, 3 - core.invCount(p, 'antidote')));
    const cs = slotOf('coins'); if (cs >= 0) p.inv[cs] = null; p.hp = core.maxHp(p); };
  stock();
  const giver = ch === 5 ? 'rhosyn' : 'isolde', qid = ch === 5 ? 'smiths_hammer' : 'thorn_maiden';
  const offer = talk(giver); core.cmd('p1', { c: 'acceptq', q: qid }); tick();
  const ups = CR.objects.filter(o => o.k === 'stairsup').sort((a, b) => a.x - b.x);
  let trips = 1, deaths = 0, used = 0, T = 0, lvl = 0, stuck = 0, last = '';
  const gor = AB.spawns.find(s => s.m === 'gorrath');
  const go = () => { if (ch === 5) { p.x = 377; p.y = 509; } else { const a = ups[lvl]; p.x = a.x + 1; p.y = a.y + 1; } p.path = []; p.act = null; };
  const done = () => ch === 5 ? core.S.mobs.some(m => m.key === 'gorrath' && m.dead) : ((p.quests.thorn_maiden.kn || {}).maelis | 0) >= 1;
  const foes = () => ch === 5 ? core.S.mobs.filter(m => !m.dead && !m.gone && inBox(m, AB) && (m.tgt === 'p1' || m.x < 398))   /* the yard, the cloister and the barracks: what lies on the way (the cathedral is chapter 6's) */
                              : core.S.mobs.filter(m => !m.dead && !m.gone && inBox(m, CR) && LV(m.x) === lvl);
  go();
  for (let n = 0; n < 60000 && !done(); n++) {
    T++;
    const hp0 = core.maxHp(p);
    if (p.dead || p.hp <= 0) { deaths++; for (let i = 0; i < 400 && p.dead; i++) tick(); stock(); trips++; if (trips > maxTrips) break; go(); continue; }
    if (slotOf(FOOD) < 0 && p.hp < hp0 * 0.6) { stock(); trips++; if (trips > maxTrips) break; go(); continue; }
    if (p.poison && slotOf('antidote') >= 0) core.cmd('p1', { c: 'eat', slot: slotOf('antidote') });
    else if (p.hp < hp0 * 0.5) { const s = slotOf(FOOD); if (s >= 0) { core.cmd('p1', { c: 'eat', slot: s }); used++; } }
    const F = foes(); if (ch === 6 && !F.length && lvl < 3) { lvl++; go(); continue; }
    /* a player walks round the barracks to its door; the test's pathing alone gets stuck on a corner between two walls */
    const inB = q => q.x > 334 && q.x < 360 && q.y > 544 && q.y < 586, here = p.x + ',' + p.y;
    stuck = here === last ? stuck + 1 : 0; last = here;
    if (ch === 5 && stuck > 20 && !inB(p)) { core.cmd('p1', { c: 'walk', x: Math.abs(p.x - 362) + Math.abs(p.y - 556) > 2 ? 362 : 357, y: 556 }); stuck = 0; for (let i = 0; i < 40 && p.path && p.path.length; i++) tick(); continue; }
    if (!p.act || p.act.k !== 'attack') { let best = null, bd = 1e9; for (const m of F) { const d = Math.hypot(m.x - p.x, m.y - p.y) - (m.tgt === 'p1' ? 8 : 0) + (m.key === 'gorrath' ? 4 : 0) + (ch === 5 && inB(m) !== inB(p) ? 25 : 0); if (d < bd) { bd = d; best = m; } } if (best) core.cmd('p1', { c: 'attack', uid: best.uid }); }
    tick();
  }
  return { trips, deaths, used, min: Math.round(T * 0.6 / 60), done: done(), offer };
}
for (const [ch, rec, prevLv, prevUsed, att, prevAtt] of [[5, 52, 48, 38, 45, 41], [6, 58, 52, null, 51, 45]]) {
  if (ONLY && +ONLY !== ch) continue;
  const hi = [], lo = [];
  for (const s of [SEED, SEED + '2', SEED + '3']) { hi.push(play(ch, att, s + '-hi' + ch, 3)); lo.push(play(ch, prevAtt, s + '-lo' + ch, 5)); }
  for (const [name, R] of [['chapter ' + ch + ' at combat ' + rec, hi], ['chapter ' + ch + ' at combat ' + prevLv + ' (the chapter before\'s)', lo]])
    for (const r of R) console.log('     ' + name + ': ' + (r.done ? 'done' : 'NOT done') + ' in ' + r.trips + ' trip(s), ' + r.deaths + ' death(s), ' + r.used + ' potions, ~' + r.min + ' min');
  ok(new RegExp('Recommended combat level: ' + rec).test((hi[0].offer && hi[0].offer.lines || []).join(' ')), 'chapter ' + ch + ' names its recommended combat level');
  ok(hi.every(r => r.done && r.trips <= 2 && r.deaths === 0), 'chapter ' + ch + ' at the recommended level: done in two trips at most, no deaths');
  const loUsed = lo.reduce((a, r) => a + r.used, 0) / lo.length, hiUsed = hi.reduce((a, r) => a + r.used, 0) / hi.length;
  console.log('     chapter ' + ch + ': ' + hiUsed.toFixed(0) + ' potions at ' + rec + ', ' + loUsed.toFixed(0) + ' at ' + prevLv);
  ok(lo.every(r => r.done) && (prevUsed == null || loUsed > prevUsed), 'chapter ' + ch + ' at the level before it is still beatable' + (prevUsed ? ' and costs more than the chapter before there (~' + prevUsed + ')' : ''));
}
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
