'use strict';
/* The Ziibiing beginning quests (2026-10-09, handoff/ziibiing_bow_quests_plan.md): only a Ziibiing-born is offered them;
   Mitigwaabiike gives a tomahawk and makes a maple bow (bound) and fifteen birch arrows from a maple log and a birch log two game
   hours later; birch bark wants a blade; flint from the bank lights a log like a tinderbox (Mishoomis); a deer falls to two birch
   arrows or one steel or obsidian arrow that hits, the hit about half at Ranged 1 and certain from Ranged 10, with XP from an
   ordinary roll; Ma'iingan trades sinew for the hide; obsidian arrows two hours after obsidian and a birch log.
   node tests/ziibiing_bow_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'ziibiing', 'lodges', 'sugarcamp', 'flintbank', 'obsidianbank'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
/* a meadow for the hunt (the deer in the world come from worldgen herds; a test zone puts a few where the test can find them) */
zones.push({ id: 'testmeadow', name: 'Meadow', level: '1-10', origin: [300, 300], size: [20, 20], ground: 'grass', tiles: Array(20).fill('.'.repeat(20)), objects: [], npcs: [],
  spawns: [{ m: 'deer', x: 305, y: 305 }, { m: 'deer', x: 312, y: 306 }, { m: 'deer', x: 308, y: 313 }], fishing: [] });
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

function born(home, seed) {
  const core = AshCore.create(D, { seed: seed || 'zbow' }); core.setNewHome(home); const p = core.addPlayer('p1', null);
  for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
  core.grantItem('p1', 'asemaa', 5);   /* asemaa (tobacco) to ask the elders with (a Ziibiing-born starts with 5) */
  const msgs = [], offers = [];
  const run = (n) => { for (let i = 0; i < n; i++) for (const e of core.tick()) { if (e.p !== 'p1') continue; if (e.e === 'msg') msgs.push(e.text); if (e.e === 'dialog') { msgs.push(e.lines.join(' ')); if (e.offer) offers.push(e.offer); } } };
  const has = (id) => p.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0) + Object.values(p.eq).reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
  const near = (x, y) => { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (!core.M.blocked(x + dx, y + dy)) { p.x = x + dx; p.y = y + dy; return; } };
  const talk = (id) => { const n = core.M.npcs.find(q => q.id === id); near(n.x, n.y); p.path = []; p.act = null; msgs.length = 0; offers.length = 0; core.cmd('p1', { c: 'npc', id }); run(3); return msgs.join(' | '); };
  const accept = (q) => { msgs.length = 0; core.cmd('p1', { c: 'acceptq', q }); run(1); return msgs.join(' | '); };
  const work = (x, y, extra, ticks) => { near(x, y); p.path = []; msgs.length = 0; core.cmd('p1', Object.assign({ c: 'gather', x, y }, extra || {})); run(ticks || 12); return msgs.join(' | '); };
  const give = (id, n) => core.grantItem('p1', id, n || 1);
  return { core, p, run, has, talk, accept, work, give, offers, msgs };
}
const tilesOf = (zid, ch) => { const z = zones.find(q => q.id === zid), out = []; z.tiles.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === ch) out.push([z.origin[0] + i, z.origin[1] + j]); }); return out; };

/* who is offered what */
{
  const A = born('ashvale', 'za');
  let t = A.talk('mitigwaabiike');
  ok(!A.offers.length && !/tomahawk/i.test(t), 'an Ashvale-born is not offered the bow quest (' + t.slice(0, 50) + ')');
  A.talk('mishoomis');
  ok(A.offers[0] === 'manoomin', 'an Ashvale-born still gets the wild rice quest from Mishoomis first (' + A.offers.join() + ')');
  A.accept('mitigwaab');
  ok(!A.p.quests.mitigwaab, 'an Ashvale-born cannot begin it by asking');
  A.give('deer_hide'); A.talk('maiingan');
  ok(A.has('sinew') === 2, "an Ashvale-born still trades a deer hide for sinew with Ma'iingan");
}
const Z = born('ziibiing', 'zz'), { core, p, has, talk, accept, work, give } = Z;
let t = talk('mishoomis');
ok(Z.offers[0] === 'biiwaanag' && /biiwaanag \(flint\)/.test(t), 'Mishoomis offers a Ziibiing-born the flint quest first');
{ /* a Ziibiing-born already ricing for Mishoomis keeps that quest first */
  const R = born('ziibiing', 'zr'); R.talk('mishoomis'); R.p.quests.manoomin = { step: 1, n: 0 }; R.talk('mishoomis');
  ok(!R.offers.includes('biiwaanag'), 'the wild rice under way comes before the flint offer');
}
/* the flint and the fire */
accept('biiwaanag');
ok(has('logs') === 1, 'Mishoomis gives a log from his woodpile');
const D0 = tilesOf('flintbank', 'S'), Z0 = tilesOf('obsidianbank', 'V');
ok(D0.length === 3 && Z0.length === 3, 'three flint and three obsidian deposits on the riverbank');
ok(zones.find(z => z.id === 'flintbank').objects.some(o => o.k === 'paintedrock') && zones.find(z => z.id === 'obsidianbank').objects.some(o => o.k === 'cairn'), 'each bank has its landmark: the painted rock, the cairn');
const wetNear = (x, y) => [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => '~vB'.includes(core.M.tileAt(x + dx, y + dy)));
ok(D0.concat(Z0).filter(([x, y]) => wetNear(x, y)).length >= 2, 'deposits lie at the water\'s edge, where a canoe lands');
const lx = 89, ly = 621, dist = (q) => Math.hypot(q[0] - lx, q[1] - ly);
ok(D0.every(q => dist(q) > 30 && dist(q) < 120) && Z0.every(q => dist(q) > 30 && dist(q) < 120), 'both a short paddle from the Ziibiing landing (' + Math.round(dist(D0[0])) + ', ' + Math.round(dist(Z0[0])) + ' tiles)');
for (let k = 0; k < 8 && !has('flint'); k++) t = work(D0[0][0], D0[0][1], null, 10);
ok(has('flint') >= 1, 'flint is pried out by hand, no tool (' + t.slice(0, 70) + ')');
ok((p.xp.mining | 0) > 0 && (p.xp.mining | 0) <= 500, 'a little Mining XP for it (' + p.xp.mining + ')');
for (let k = 0; k < 10 && p.quests.biiwaanag.n < 1; k++) { if (!has('logs')) give('logs'); p.x = 70; p.y = 618; p.path = []; const i = p.inv.findIndex(s => s && s.id === 'logs'); Z.msgs.length = 0; core.cmd('p1', { c: 'light', slot: i }); Z.run(30); }
ok(p.quests.biiwaanag.n === 1, 'the flint lights a log (' + Z.msgs.find(m => /strike/.test(m)) + ')');
ok(has('flint') >= 1, 'and the flint is not used up');
t = talk('mishoomis');
ok(p.quests.biiwaanag.step === 2, 'Mishoomis: the quest is done (' + t.slice(0, 50) + ')');
/* the snare first (2026-10-09: the bow wants sinew, and the first sinew comes from a nagwaagan (snare)) */
t = talk('mitigwaabiike');
ok(!Z.offers.length, 'no bow quest before the snare (' + t.slice(0, 50) + ')');
t = talk('maiingan');
ok(Z.offers[0] === 'waabooz' && /nagwaagan/.test(t), "Ma'iingan offers the snare quest first (" + Z.offers.join() + ')');
accept('waabooz');
ok(has('snare') === 1, 'and lends a nagwaagan (snare)');
{
  core.setNature({ day: 400, year: 2, hours: 9600 });
  const sl = () => p.inv.findIndex(s => s && s.id === 'snare');
  p.x = 310; p.y = 310; Z.msgs.length = 0; core.cmd('p1', { c: 'use', slot: sl() }); Z.run(1);
  ok(has('snare') === 1 && /no waabooz/i.test(Z.msgs.join()), 'no rabbits about: it will not set (' + Z.msgs.join().slice(0, 50) + ')');
  for (let k = 0; k < 3; k++) {
    const hz = core.S.mobs.find(m => m.key === 'hare' && !m.dead);
    let spot = null; for (let r = 1; r < 5 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) { const x = hz.x + dx, y = hz.y + dy; if (!core.M.blocked(x, y) && !core.M.insideAt(x, y) && !(p.traps || []).some(t => t.x === x && t.y === y)) spot = [x, y]; }
    p.x = spot[0]; p.y = spot[1]; p.path = []; p.act = null; Z.msgs.length = 0; core.cmd('p1', { c: 'use', slot: sl() }); Z.run(1);
    ok(!has('snare') && p.traps && p.traps.length === 1 && /noose/.test(Z.msgs.join()), 'the snare is set where the rabbits run (' + Z.msgs.join().slice(0, 40) + ')');
    const tr = p.traps[0];
    ok(tr.ready >= 9600 + 1 && tr.ready <= 9600 + 2.001, 'it will hold one in one to two game hours (' + (tr.ready - 9600).toFixed(2) + ')');
    Z.msgs.length = 0; core.cmd('p1', { c: 'trap', x: tr.x, y: tr.y }); Z.run(3);
    ok(p.traps.length === 1 && /still empty/.test(Z.msgs.join()), 'looked at too soon: still empty');
    const x0 = p.xp.dexterity | 0; core.setNature({ day: 400, year: 2, hours: 9602.01 });
    Z.msgs.length = 0; core.cmd('p1', { c: 'trap', x: tr.x, y: tr.y }); Z.run(3);
    ok(!p.traps.length && has('snare') === 1 && has('hare_pelt') === k + 1 && has('hare_raw') >= 1 && (p.xp.dexterity | 0) > x0, 'two hours later: a waabooz (rabbit), its pelt and meat, and the snare back (' + Z.msgs.join().slice(0, 40) + ' pelts ' + has('hare_pelt') + ' raw ' + has('hare_raw') + ' snare ' + has('snare') + ' dex ' + (p.xp.dexterity | 0) + ' traps ' + p.traps.length + ')');
    core.setNature({ day: 400, year: 2, hours: 9600 });
  }
  const sv = core.exportPlayer('p1');
  ok(Array.isArray(sv.traps) && sv.orders && typeof sv.orders === 'object', 'snares and orders are saved with the character');
}
const sin0 = has('sinew');
t = talk('maiingan');
ok(has('sinew') === sin0 + 1 && !has('hare_pelt') && p.quests.waabooz.step === 2, 'three pelts: your first ojiitad (sinew) (' + t.slice(0, 50) + ')');
/* the bow */
t = talk('mitigwaabiike');
ok(Z.offers[0] === 'mitigwaab' && /tomahawk/.test(t), 'Mitigwaabiike offers the bow quest');
accept('mitigwaab');
ok(has('tomahawk') === 1, 'and gives a tomahawk');
const cz = zones.find(z => z.id === 'sugarcamp'), trees = { E: [], M: [] };
cz.tiles.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (trees[r[i]] && core.nodeAt(core.M.key(cz.origin[0] + i, cz.origin[1] + j))) trees[r[i]].push([cz.origin[0] + i, cz.origin[1] + j]); });
/* the bark wants a blade */
{
  const B = born('ziibiing', 'zb2');
  const e = trees.E[0]; let u = B.work(e[0], e[1], { peel: 1 });
  ok(!B.has('wiigwaas') && /tomahawk or an axe/.test(u), 'without a tomahawk or axe no bark comes off (' + u.slice(0, 60) + ')');
  B.give('tomahawk'); u = B.work(e[0], e[1], { peel: 1 });
  ok(B.has('wiigwaas') === 1, 'with the tomahawk in the pack the bark peels');
  const C = born('ashvale', 'zb3'); C.give('hatchet'); u = C.work(trees.E[1][0], trees.E[1][1], { peel: 1 });
  ok(C.has('wiigwaas') === 1, 'an Ashvale-born with a bronze hatchet peels bark too');
  const W = born('ziibiing', 'zb4'); W.give('tomahawk'); const sl = W.p.inv.findIndex(s => s && s.id === 'tomahawk'); W.core.cmd('p1', { c: 'equip', slot: sl }); W.run(1);
  ok(W.p.eq.weapon && W.p.eq.weapon.id === 'tomahawk', 'the tomahawk is wielded as a weapon');
  u = W.work(trees.E[2][0], trees.E[2][1], null, 200);
  ok(W.has('birch_logs') >= 1, 'a wielded tomahawk chops a birch into birch logs (' + u.slice(0, 50) + ')');
}
let tries = 0; while (!has('maple_logs') && tries++ < 40) work(trees.M[tries % trees.M.length][0], trees.M[tries % trees.M.length][1], null, 120);
ok(has('maple_logs') >= 1, 'a maple can be chopped at Woodcutting 1, slowly (' + tries + ' goes)');
tries = 0; while (!has('birch_logs') && tries++ < 20) work(trees.E[(tries + 3) % trees.E.length][0], trees.E[(tries + 3) % trees.E.length][1], null, 60);
ok(has('birch_logs') >= 1, 'a birch gives birch logs');
core.setNature({ day: 500, year: 2, hours: 12000 });
{ const sv = p.inv.findIndex(s => s && s.id === 'sinew'); const keep = p.inv[sv]; p.inv[sv] = null;
  t = talk('mitigwaabiike'); ok(p.quests.mitigwaab.step === 1 && has('maple_logs') >= 1, 'no ojiitad (sinew), no bowstring: he waits (' + t.slice(0, 50) + ')'); p.inv[sv] = keep; }
const m0 = has('maple_logs'), b0 = has('birch_logs'), s0 = has('sinew');
t = talk('mitigwaabiike');
ok(has('sinew') === s0 - 1, 'the ojiitad (sinew) goes into the bowstring');
ok(has('maple_logs') === m0 - 1 && has('birch_logs') === b0 - 1 && p.quests.mitigwaab.step === 2 && /two hours/.test(t), 'he takes the maple and the birch: come back in two hours [' + has('maple_logs') + has('birch_logs') + p.quests.mitigwaab.step + '] ' + t.slice(-120));
core.setNature({ day: 500, year: 2, hours: 12001.5 });
t = talk('mitigwaabiike');
ok(!has('mitigwaab') && /Not yet/.test(t), 'an hour and a half later it is not ready');
core.setNature({ day: 500, year: 2, hours: 12002.01 });
t = talk('mitigwaabiike');
ok(has('mitigwaab') === 1 && has('birch_arrows') === 15, 'two game hours later: the mitigwaab (bow) and fifteen birch bikwak (' + t.slice(0, 50) + ')');
const bow = core.item('mitigwaab');
ok(bow.bound && bow.req.ranged === 1 && bow.ranged === core.item('bow_t3').ranged && bow.class === 'ranged', 'the bow: Ranged 1, aimed like the Maple shortbow, bound');
ok(core.item('birch_arrows').rstr === 3 && core.item('obsidian_arrows').rstr === 10 && core.item('obsidian_arrows').req.ranged === 1, 'birch arrows strength 3, obsidian 10 at Ranged 1');
/* bound */
{
  const i = p.inv.findIndex(s => s && s.id === 'mitigwaab');
  core.cmd('p1', { c: 'drop', slot: i }); Z.run(1);
  ok(has('mitigwaab') === 1 && !core.S.ground.some(g => g.id === 'mitigwaab'), 'the bound bow cannot be dropped');
  ok(!D.shops.shops.armoury.stock.includes('mitigwaab') && !D.shops.shops.armoury.stock.includes('birch_arrows'), 'no town counter sells the Ziibiing things');
  const sh = Object.keys(D.shops.shops).find(k => (D.shops.shops[k].buys || []).includes('weapon')), S0 = D.shops.shops[sh];
  const keep = core.M.npcs.find(n => n.id === S0.keeper);
  if (keep) { p.x = keep.x + 1; p.y = keep.y; p.shop = sh; Z.msgs.length = 0; core.cmd('p1', { c: 'sell', shop: sh, slot: p.inv.findIndex(s => s && s.id === 'mitigwaab'), n: 1 }); Z.run(1);
    ok(has('mitigwaab') === 1, 'a shop will not buy it (' + (Z.msgs.join(' ') || 'no words').slice(0, 60) + ')'); }
}
/* the deer */
const hunt = D.monsters.deer.hunt;
ok(hunt && hunt.hits.birch_arrows === 2 && hunt.hits.arrows_t3 === 1 && hunt.hits.obsidian_arrows === 1 && hunt.sure === 10, 'deer data: birch 2 hits, steel and obsidian 1, sure at Ranged 10');
function shoot(ranged, ammo, shots, seed) {   /* fire `shots` arrows at a deer that cannot die, counting what the core says */
  const H = born('ziibiing', seed); H.give('mitigwaab'); H.give(ammo, shots + 50); H.p.xp.ranged = H.core.xpFor(ranged) * 10;   /* before equipping: steel wants Ranged 20 */
  H.core.cmd('p1', { c: 'equip', slot: H.p.inv.findIndex(s => s && s.id === 'mitigwaab') }); H.core.cmd('p1', { c: 'equip', slot: H.p.inv.findIndex(s => s && s.id === ammo) }); H.run(1);
  H.p.xp.ranged = H.core.xpFor(ranged) * 10; H.p.hp = 99;   /* xp is kept in tenths */
  const m = H.core.S.mobs.find(q => q.key === 'deer' && !q.dead);
  let atk = 0, hits = 0, dealt = 0, kills = 0; const xp0 = H.p.xp.ranged;
  for (let k = 0; k < shots * 12 && atk < shots; k++) {
    m.hp = 100000; H.p.x = m.x + 2; H.p.y = m.y; H.p.path = [];
    if (!H.p.act) H.core.cmd('p1', { c: 'attack', uid: m.uid });
    for (const e of H.core.tick()) {
      if (e.e === 'attack' && e.src === 'p1') atk++;
      if (e.e === 'hit' && e.src === 'p1' && e.dmg > 0) { hits++; dealt += e.dmg; if (e.dmg >= D.monsters.deer.hp) kills++; }
    }
  }
  for (let k = 0; k < 6; k++) for (const e of H.core.tick()) if (e.e === 'hit' && e.src === 'p1' && e.dmg > 0) { hits++; dealt += e.dmg; if (e.dmg >= D.monsters.deer.hp) kills++; }
  return { hits, misses: atk - hits, kills, xp: H.p.xp.ranged - xp0, dealt, atk };
}
const hasDeer = born('ziibiing', 'zd0').core.S.mobs.some(q => q.key === 'deer');
if (!hasDeer) ok(false, 'no deer in the loaded zones to test on');
else {
  const lo = shoot(1, 'birch_arrows', 200, 'zd1'), hi = shoot(10, 'birch_arrows', 40, 'zd2'), st = shoot(20, 'arrows_t3', 20, 'zd3'), ob = shoot(10, 'obsidian_arrows', 20, 'zd4'), br = shoot(30, 'arrows_t1', 30, 'zd5');
  ok(lo.hits / (lo.hits + lo.misses) > 0.3 && lo.hits / (lo.hits + lo.misses) < 0.7, 'Ranged 1: about half the birch arrows find the deer (' + lo.hits + '/' + (lo.hits + lo.misses) + ')');
  ok(hi.misses <= 0 && hi.hits > 0, 'Ranged 10: every arrow finds it (' + hi.hits + '/' + (hi.hits + hi.misses) + ')');
  ok(hi.dealt === hi.hits * 7, 'a birch arrow that hits takes half a deer (14 hp): ' + hi.dealt + ' over ' + hi.hits + ' hits');
  ok(br.hits > 0 && br.dealt === br.hits * 7, 'a bronze arrow also takes half a deer (' + br.dealt + ' over ' + br.hits + ')');
  ok(st.kills === st.hits && st.hits > 0 && ob.kills === ob.hits && ob.hits > 0, 'one steel or obsidian arrow that hits brings it down (' + st.kills + '/' + st.hits + ', ' + ob.kills + '/' + ob.hits + ')');
  const per = hi.xp / hi.hits;   /* ordinary roll at Ranged 10, birch (max hit ~2): about 40 XP x mean roll per hit, far below 7 damage worth */
  ok(per < 40 * 7 * 0.6, 'XP per deer hit stays an ordinary roll\'s, not 7 damage worth (' + per.toFixed(0) + ' per hit vs ' + 40 * 7 + ')');
}
/* the deer hunt and the obsidian */
t = talk('maiingan');
ok(Z.offers[0] === 'deer_hunt', "with the bow, Ma'iingan sends a Ziibiing-born hunting (" + t.slice(0, 50) + ')');
accept('deer_hunt'); give('deer_hide');
t = talk('maiingan');
ok(has('sinew') === 2 && !has('deer_hide') && p.quests.deer_hunt.step === 2, 'the hide for two ojiitad (sinew), as a quest (' + t.slice(0, 50) + ')');
t = talk('mitigwaabiike');
ok(Z.offers[0] === 'obsidian_arrows', 'then Mitigwaabiike offers the obsidian arrows');
accept('obsidian_arrows');
for (let k = 0; k < 10 && !has('obsidian'); k++) work(Z0[0][0], Z0[0][1], null, 12);
ok(has('obsidian') >= 1, 'obsidian comes out of the bank by hand');
give('birch_logs');
core.setNature({ day: 501, year: 2, hours: 12030 });
t = talk('mitigwaabiike');
ok(p.quests.obsidian_arrows.step === 2 && !has('obsidian'), 'he takes the obsidian and a birch log');
core.setNature({ day: 501, year: 2, hours: 12031 }); t = talk('mitigwaabiike');
ok(!has('obsidian_arrows'), 'not ready after an hour');
core.setNature({ day: 501, year: 2, hours: 12032.1 }); t = talk('mitigwaabiike');
ok(has('obsidian_arrows') === 15, 'fifteen obsidian bikwak two game hours later');
/* after the quests: more arrows for a birch log */
give('birch_logs'); const b1 = has('birch_logs'); t = talk('mitigwaabiike');
ok(has('birch_logs') === b1 - 1 && /two hours/.test(t), 'a birch log is fifteen more bikwak, two hours on [' + has('birch_logs') + '] ' + t.slice(0, 160));
core.setNature({ day: 501, year: 2, hours: 12034.2 }); t = talk('mitigwaabiike');
ok(has('birch_arrows') >= 15, 'and they come (' + has('birch_arrows') + ')');
/* death keeps the bound bow: everything else drops where you fall */
{
  const K = born('ziibiing', 'zk'); K.run(5); K.give('mitigwaab'); K.give('logs'); K.p.hp = 3;   /* (S.t > 0: dead is the tick it happened) */
  K.core.applyHit('p1', 50, 'melee', false);   /* (no tick: the respawn comes on the next one) */
  ok(K.p.dead && K.has('mitigwaab') === 1 && !K.has('logs') && K.core.S.ground.some(g => g.id === 'logs'), 'at death the bound bow stays with you, the rest drops (' + (K.p.dead ? 'dead' : 'alive') + ')');
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
