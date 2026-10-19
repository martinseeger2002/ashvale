/* FARMING (2026-10-18): patches by the roads between the towns (src/wg_paths.js PATCHES), each player's own crop in each (src/core.js
   FARMING): rake the weeds with a rake, plant with a seed dibber, the crop grows through its phases over blocks of the game's clock, a
   watering can adds a crop, a spade digs it up; a quest's harvest goal counts it; the patch's state survives a save; a small patch will
   not take a large patch's seed. node tests/farming_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js'), AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg'), decor: mod('decor') };
const F = D.rules.farming, WG = AshWorld.seededWorldgen(WGM, AG, D), C = D.globecfg, OX = C.origin[0], OY = C.origin[1];
ok(D.rules.skills.indexOf('farming') >= 0 && F && Object.keys(F.crops).length >= 8, 'Farming is a skill with ' + Object.keys(F.crops).length + ' crops');
ok(Object.values(F.crops).every(c => D.items[c.seed] && D.items[c.crop] && c.phases >= 3 && c.blocks > 0), 'every crop has a seed and a crop item, three or more phases and a number of blocks each');   /* three: the tutorial's radish */
ok(['rake', 'seed_dibber', 'spade', 'watering_can'].every(t => D.items[t]) && D.shops.shops.general.stock.indexOf('rake') >= 0, 'the tools exist and the Ashvale store sells them');

/* the patches: by the roads, out of the towns, on dry land, of every tier */
const P = WG.roadObjects(C.face, -1e9, -1e9, 1e9, 1e9).filter(o => o.k === 'farmpatch').map(o => Object.assign({}, o, { x: o.x - OX, y: o.y - OY }));
ok(P.length >= 6, 'there are farming patches by the roads (' + P.length + ')');
ok([1, 2, 3].every(t => P.some(o => o.tier === t)) && P.filter(o => o.tier === 1).length > P.filter(o => o.tier === 3).length, 'small patches are common, large ones rare (' + [1, 2, 3].map(t => P.filter(o => o.tier === t).length).join('/') + ')');
ok(P.every(o => WG.pathDist(C.face, o.x + 1 + OX, -(o.y + 1 + OY)) > 1.5), 'no patch lies on a road or path');

/* a season in a small patch */
const core = AshCore.create(Object.assign({}, D, { wg: WG }), { seed: 'farm' });
const o = P.find(q => q.tier === 1), inv = [{ id: 'rake', n: 1 }, { id: 'seed_dibber', n: 1 }, { id: 'spade', n: 1 }, { id: 'watering_can', n: 1 }, { id: 'potato_seed', n: 5 }, { id: 'moonleaf_seed', n: 1 }];
const p = core.addPlayer('p1', { inv, xp: { farming: 0, hitpoints: 1200 } });
p.x = o.x - 1; p.y = o.y; p.path = [];
const view = () => core.patchView('p1', core.patchAt(o.x, o.y)), run = (n) => { for (let i = 0; i < n; i++) core.tick(); };
const has = (id) => (p.inv || []).reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
ok(core.patchAt(o.x + 1, o.y + 1) && view().w === F.weeds && !view().crop, 'a patch starts overgrown (' + view().w + ' weeds)');
core.cmd('p1', { c: 'farm', x: o.x, y: o.y, op: 'plant', seed: 'potato_seed' }); run(3);
ok(!view().crop && has('potato_seed') === 5, 'nothing can be planted in the weeds');
core.cmd('p1', { c: 'farm', x: o.x, y: o.y, op: 'rake' }); run(20);
ok(view().w === 0 && (p.xp.farming | 0) > 0, 'raking clears the weeds and trains Farming (' + (p.xp.farming / 10) + ' XP)');
core.cmd('p1', { c: 'farm', x: o.x, y: o.y, op: 'plant', seed: 'moonleaf_seed' }); run(3);
ok(!view().crop && has('moonleaf_seed') === 1, 'a small patch will not take moonleaf (a large patch\'s crop, and Farming 33)');
p.quests = p.quests || {}; p.quests.first_furrows = { step: 1, n: 0 };
core.cmd('p1', { c: 'farm', x: o.x, y: o.y, op: 'plant', seed: 'potato_seed' }); run(4);
ok(view().crop === 'potato' && view().phase === 0 && has('potato_seed') === 4, 'a potato seed goes in with the dibber');
core.cmd('p1', { c: 'farm', x: o.x, y: o.y, op: 'water' }); run(2);
ok(view().water, 'the crop is watered');
core.cmd('p1', { c: 'farm', x: o.x, y: o.y, op: 'harvest' }); run(3);
ok(view().crop === 'potato' && !has('potato'), 'it cannot be dug up before it is grown');
const blocks = F.crops.potato.phases * F.crops.potato.blocks, ticks = Math.ceil(blocks * F.block / 0.6) + 5;   /* a block is F.block seconds of the game clock; a tick 0.6 s */
run(Math.floor(ticks / 2));
const mid = view();
ok(mid.phase > 0 && mid.phase < mid.phases && !mid.ready, 'half way it is in phase ' + (mid.phase + 1) + ' of ' + mid.phases);
/* a save half way through keeps the crop where it is */
const save = core.exportPlayer('p1'), c2 = AshCore.create(Object.assign({}, D, { wg: WG }), { seed: 'farm2' }), p2 = c2.addPlayer('p2', save);
ok(p2.patches && p2.patches[o.x + ',' + o.y] && p2.patches[o.x + ',' + o.y].crop === 'potato', 'the crop survives a save and a reload');
run(Math.ceil(ticks / 2) + 5);
ok(view().ready, 'after ' + blocks + ' blocks the potatoes are ready');
core.cmd('p1', { c: 'farm', x: o.x, y: o.y, op: 'harvest' }); run(4);
const [lo, hi] = F.crops.potato.yield;
ok(has('potato') >= lo + 1 && has('potato') <= hi + 1, 'the spade digs up ' + has('potato') + ' potatoes (' + lo + '-' + hi + ', +1 for the water)');
ok(!view().crop && view().w === 0, 'the patch is empty again');
ok((p.quests.first_furrows.n | 0) === Math.min(3, has('potato')), 'First Furrows counts them (' + p.quests.first_furrows.n + '/3)');
/* seeds on your travels: a walk over open fields turns some up, the common ones for a beginner */
{
  const cf = AshCore.create(Object.assign({}, D, { wg: WG }), { seed: 'fields' }), w = cf.addPlayer('walker', { xp: { hitpoints: 1200 } }), Mf = cf.M, open = [];
  for (let y = 60; y < 420 && open.length < 3000; y += 1) for (let x = -40; x < 60 && open.length < 3000; x += 1) if ('.,'.indexOf(Mf.tileAt(x, y)) >= 0 && !(Mf.inPiece && Mf.inPiece(x, y))) open.push([x, y]);
  const seen = new Map();   /* each find as it turns up (dropped things lie a few minutes, then go) */
  for (const [x, y] of open) { w.x = x; w.y = y; w.path = []; cf.tick(); for (const g of cf.S.ground) if (g.owner === 'walker' && /_seed$/.test(g.id)) seen.set(g.uid, g); }
  const found = [...seen.values()], lvOf = id => F.crops[id.replace(/_seed$/, '')].lvl;
  ok(found.length >= 3 && found.length <= 25, open.length + ' steps over open fields turned up ' + found.length + ' seeds (' + found.map(g => g.id.replace('_seed', '')).join(', ') + ')');
  ok(found.every(g => lvOf(g.id) <= 11), 'a beginner finds only seeds within 10 levels of their Farming');
}
console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
