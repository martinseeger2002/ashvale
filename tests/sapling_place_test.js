'use strict';
/* A sapling still grows, comes back up, and counts for a quest. It will not go down on a path,
   inside a town, or within ten tiles of a person or an entrance. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'eastend', 'evengrove'].map(z => Object.assign({ id: z }, JSON.parse(JSON.stringify(mod('zone.' + z)))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const core = AshCore.create(D, { seed: 'sapling-place' });
const p = core.addPlayer('p1', {});
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
function stand(x, y) {
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    if (!core.M.blocked(x + dx, y + dy)) { p.x = x + dx; p.y = y + dy; p.path = []; p.act = null; return; }
  }
}
function tryPlant(x, y) {
  if (core.invCount(p, 'sapling') < 1) core.grantItem('p1', 'sapling', 1);
  stand(x, y);
  core.cmd('p1', { c: 'plant', x, y });
  let text = '';
  for (let i = 0; i < 8; i++) for (const e of core.tick()) if (e.e === 'msg' && e.p === 'p1') text = e.text;
  return text;
}
const vill = zones.find(z => z.id === 'village');
let road = null, town = null;
for (let y = vill.origin[1]; y < vill.origin[1] + vill.size[1] && (!road || !town); y++) for (let x = vill.origin[0]; x < vill.origin[0] + vill.size[0]; x++) {
  const t = core.M.tileAt(x, y);
  if (!road && t === 'p' && !core.M.blocked(x, y)) road = [x, y];
  if (!town && t === '.' && !core.nodeAt(core.idx(x, y)) && !core.M.blocked(x, y)) town = [x, y];
}
ok(!!road && !core.canPlant(p, road[0], road[1]) && /path/.test(tryPlant(road[0], road[1])), 'a path refuses a sapling (' + road + ')');
ok(!!town && !core.canPlant(p, town[0], town[1]) && /town/.test(tryPlant(town[0], town[1])), 'town grass refuses a sapling (' + town + ')');
ok(!core.canPlant(p, 197, -45) && /Vael/.test(tryPlant(197, -45)), 'grass within ten tiles of Vael refuses a sapling');
const door = [48, 62];
ok(!core.canPlant(p, door[0], door[1]) && /entrance/.test(tryPlant(door[0], door[1])), 'grass within ten tiles of a West End door refuses a sapling');
let open = null;
for (let y = -67; y <= -35 && !open; y++) for (let x = 181; x <= 213; x++) if (core.M.tileAt(x, y) === '.' && core.canPlant(p, x, y)) open = [x, y];
const before = core.invCount(p, 'sapling');
const grown = tryPlant(open[0], open[1]);
ok(!!open && /plant the sapling/.test(grown) && core.invCount(p, 'sapling') === before - 1, 'open grass in the grove still takes a sapling (' + open + ')');
const z = core.zoneOf(open[0], open[1]);
const snap = core.plantSnap(z);
ok(snap.some(r => r[0] === open[0] && r[1] === open[1] && r[3] === 0), 'the planted sapling is in the snapshot other players receive');
const B = AshCore.create(D, { seed: 'sapling-friend' });
B.addPlayer('p2', {});
B.setAuth(z, false);
B.acceptPlant(open[0], open[1], 0, 0);
ok(B.plantYoung(open[0], open[1]) && B.S.ev.some(e => e.e === 'plant' && e.x === open[0]), 'a friend who does not host the grove still sees the sapling');
B.acceptPlant(open[0], open[1], 0, 0);
ok(B.S.ev.filter(e => e.e === 'plant' && e.x === open[0]).length === 1, 'the same sapling is not planted twice');
core.S.t += 6000;
let grew = false;
for (const e of core.tick()) if (e.e === 'grow' && e.x === open[0] && e.y === open[1]) grew = true;
ok(grew, 'after an hour the sapling grows into a tree that stays');
B.acceptPlant(open[0], open[1], 6000, 1);
const bi = B.idx(open[0], open[1]);
ok(B.S.plants[bi] && B.S.plants[bi].grown === 1 && !B.plantYoung(open[0], open[1]), 'the friend receives the grown pine and it does not come back up');
B.acceptUnplant(open[0], open[1]);
ok(B.S.plants[bi] && B.S.plants[bi].grown === 1, 'a grown pine is not pulled up');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
