/* solid decor (2026-10-18: "players walk straight through fences, boulders, carts"): the world's scenery out along the roads
   (data/decor.json kinds with a block; src/world.js stampDecor) stands in the way - a fence run shuts the steps across it, a
   boulder or a cart its own tile - and never a path tile or a step onto or off one. node tests/decor_block_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js'), AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort((a, b) => { const O = ['village', 'whisperwood', 'saltmere'], ia = O.indexOf(a), ib = O.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); }).map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg'), decor: mod('decor') };
const WG = AshWorld.seededWorldgen(WGM, AG, D), C = D.globecfg, OX = C.origin[0], OY = C.origin[1], K = D.decor.kinds;
const M = AshWorld.createWorld(Object.assign({}, D, { wg: WG }));
const isPath = (x, y) => WG.pathDist(C.face, x + OX + 0.5, -(y + OY + 0.5)) < 0.3;
const all = WG.roadObjects(C.face, -1e9, -1e9, 1e9, 1e9).map(o => Object.assign({}, o, { x: o.x - OX, y: o.y - OY }));
const fences = all.filter(o => o.k === 'rail_fence'), solid = all.filter(o => K[o.k] && K[o.k].block === 'tile');
ok(fences.length > 50 && solid.length > 10, 'the world has fence sections (' + fences.length + ') and solid pieces (' + solid.length + ') to test');
const OPEN = ['prayer_flags', 'flower_bed', 'iron_post', 'iron_gate', 'laundry_line', 'rope_coil', 'net_pile', 'pirate_ship', 'pier_deck', 'pier_edge', 'pier_post', 'bollard', 'pier_ladder'];   /* and the piers' boards */   /* you walk under the flags, past the flowers and piers, through the open gate */
ok(Object.keys(K).every(k => OPEN.includes(k) ? !K[k].block : !!K[k].block), 'every kind but ' + OPEN.join(', ') + ' stands in the way (data/decor.json block)');

/* a boulder (or any tile piece) blocks its own tile */
const tiles = solid.filter(o => !isPath(o.x, o.y));
ok(tiles.length === solid.length && tiles.every(o => M.blocked(o.x, o.y)), 'every solid piece blocks its tile (' + solid.filter(o => M.blocked(o.x, o.y)).length + '/' + solid.length + ')');
const bould = solid.filter(o => o.k === 'boulders');
ok(!bould.length || bould.every(o => M.blocked(o.x, o.y)), 'boulders block (' + bould.length + ')');

/* a fence run: the step across it is shut, both ways (the world's edge walls; core stepClear checks the same for diagonals) */
const edgeOpen = (Mx, x, y, dx, dy) => { const b = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : 1, ob = dx === 1 ? 8 : dx === -1 ? 2 : dy === 1 ? 1 : 4; return !(Mx.wallAt(x, y) & b) && !(Mx.wallAt(x + dx, y + dy) & ob); };
const stepOpen = (Mx, x, y, dx, dy) => !Mx.blocked(x + dx, y + dy) && (!dx || !dy ? edgeOpen(Mx, x, y, dx, dy)
  : !Mx.blocked(x + dx, y) && !Mx.blocked(x, y + dy) && edgeOpen(Mx, x, y, dx, 0) && edgeOpen(Mx, x + dx, y, 0, dy) && edgeOpen(Mx, x, y, 0, dy) && edgeOpen(Mx, x, y + dy, dx, 0));
const crossings = (o) => {   /* the tiles either side of three points along a section's middle, a step apart (straight or diagonal) */
  const ux = Math.cos(o.ry), uy = -Math.sin(o.ry), nx = -uy, ny = ux, mx = o.x + 0.5 + (o.dx || 0), my = o.y + 0.5 + (o.dz || 0), out = [];
  for (const t of [-0.9, 0, 0.9]) {
    const px = mx + ux * t, py = my + uy * t, a = [Math.floor(px + nx * 0.6), Math.floor(py + ny * 0.6)], b = [Math.floor(px - nx * 0.6), Math.floor(py - ny * 0.6)];
    if (Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1) out.push([a, b]);
  }
  return out;
};
let tried = 0, shut = 0, byPath = 0;
for (const o of fences) for (const [a, b] of crossings(o)) {
  if (isPath(a[0], a[1]) || isPath(b[0], b[1])) { byPath++; continue; }
  tried++; const dx = b[0] - a[0], dy = b[1] - a[1];
  if (!stepOpen(M, a[0], a[1], dx, dy) && !stepOpen(M, b[0], b[1], -dx, -dy)) shut++;
}
ok(tried > 100 && shut === tried, 'no step across a fence section goes through (' + shut + '/' + tried + ' shut, ' + byPath + ' beside a path left open)');

/* in the game: a walk to the far side of a long fence run goes round it, and a walk along the road beside it is straight */
const core = AshCore.create(Object.assign({}, D, { wg: WG }), { seed: 'decor-block' });
const pl = core.addPlayer('p1', { xp: { hitpoints: 1200 } });
let around = 0, roadOk = 0, runs = 0;
for (const o of fences) {
  const cr = crossings(o).filter(([a, b]) => !isPath(a[0], a[1]) && !isPath(b[0], b[1]) && !M.blocked(a[0], a[1]) && !M.blocked(b[0], b[1]) && !(a[0] !== b[0] && a[1] !== b[1]));
  if (!cr.length || runs >= 12) continue; runs++;
  const [a, b] = cr[0]; pl.x = a[0]; pl.y = a[1]; pl.path = [];
  core.cmd('p1', { c: 'walk', x: b[0], y: b[1] }); core.tick();
  if (pl.x !== b[0] || pl.y !== b[1]) around++;
}
ok(runs >= 10 && around === runs, 'one tick after a click across a fence you are not on its far side (' + around + '/' + runs + ')');
const road = []; for (const o of fences) for (let y = o.y - 4; y <= o.y + 4 && road.length < 40; y++) for (let x = o.x - 4; x <= o.x + 4; x++) if (isPath(x, y) && isPath(x + 1, y)) { road.push([x, y]); break; }
for (const [x, y] of road) { pl.x = x; pl.y = y; pl.path = []; core.cmd('p1', { c: 'walk', x: x + 1, y }); core.tick(); if (pl.x === x + 1 && pl.y === y) roadOk++; }
ok(road.length >= 20 && roadOk === road.length, 'a step along the road beside a fence is open (' + roadOk + '/' + road.length + ')');

/* the roads stay open: no path tile is blocked by decor, and no fence walls a step onto or off one */
const M0 = AshWorld.createWorld(D);   /* without seeded land: no decor (the set pieces' own walls) */
let pathTiles = 0, bad = 0;
for (const o of fences.concat(solid)) for (let y = o.y - 3; y <= o.y + 3; y++) for (let x = o.x - 3; x <= o.x + 3; x++) {
  if (!isPath(x, y)) continue; pathTiles++;
  if (M.wallAt(x, y) & ~M0.wallAt(x, y)) bad++;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!M.blocked(x + dx, y + dy) && !edgeOpen(M, x, y, dx, dy) && edgeOpen(M0, x, y, dx, dy)) bad++;
  if (solid.some(q => q.x === x && q.y === y) && M.blocked(x, y)) bad++;
}
ok(pathTiles > 200 && !bad, 'no path tile by the scenery is blocked or walled (' + pathTiles + ' checked, ' + bad + ' bad)');

/* deterministic: a second world (another fill order, a tiny chunk cache that drops and refills) shuts the same edges */
const M2 = AshWorld.createWorld(Object.assign({}, D, { wg: WG }), { maxChunks: 6 });
let same = true;
for (const o of fences.slice().reverse().concat(solid)) for (let y = o.y - 2; y <= o.y + 2; y++) for (let x = o.x - 2; x <= o.x + 2; x++) if (M2.wallAt(x, y) !== M.wallAt(x, y) || M2.blocked(x, y) !== M.blocked(x, y)) same = false;
ok(same && M2.stats().dropped > 0, 'a world filled in another order, dropping chunks (' + M2.stats().dropped + '), has the same fence walls and blocked tiles');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
