/* the bridge on the way from the Lake Castle to the great mountain (2026-10-19, tools/mountain/make_bridges.js): the approach trail's river,
   which it used to ford on bare bridge tiles, has the road's stone bridge ('wbridge') from bank to bank with its torches, the trail stays
   one walkable line over it, and the road's own bridge to the castle is where it was. node tests/mountain_bridge_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const WG = AshWorld.seededWorldgen(WGM, AG, D), M = AshWorld.createWorld(Object.assign({}, D, { wg: WG })), [OX, OY] = D.globecfg.origin;
const T = JSON.parse(fs.readFileSync(path.join(DD, 'atlas', 'wg_tables.json'), 'utf8')).data, ap = T.trails.find(t => t.id === 'mt_approach');
ok(ap && ap.bridges && ap.bridges.length === 1, 'the approach trail has one bridge span (' + (ap && ap.bridges ? ap.bridges.map(b => Math.hypot(b[2] - b[0], b[3] - b[1]).toFixed(1) + ' m').join(', ') : 'none') + ')');
const br = WG.roadObjects(null).filter(o => o.k === 'wbridge').map(o => ({ ax: o.ax - OX, ay: o.ay - OY, bx: o.bx - OX, by: o.by - OY, L: Math.hypot(o.bx - o.ax, o.by - o.ay) }));
const mt = br.find(b => b.ax < -150), road = br.find(b => b.ax > -50 && b.ay > 380 && b.ay < 400);
ok(mt && mt.L > 20 && mt.L < 28, 'a stone bridge over the river on the way to the mountain (' + (mt ? mt.L.toFixed(1) : '-') + ' m)');
ok(road && Math.abs(road.L - 8.3) < 0.2 && Math.abs(road.ax + 10.7) < 0.2, 'the road\'s bridge to the castle is unchanged (' + (road ? road.L.toFixed(1) : '-') + ' m)');
const torches = WG.roadObjects(null).filter(o => o.k === 'torch').map(o => [o.x - OX, o.y - OY]).filter(([x, y]) => mt && Math.hypot(x - (mt.ax + mt.bx) / 2, y - (mt.ay + mt.by) / 2) < mt.L / 2 + 5);
ok(torches.length >= 6, 'torches at both banks and on the crest (' + torches.length + ')');
/* along the trail across the water: every tile walkable, the deck tiles bridge tiles */
let bad = 0, deck = 0;
for (let k = -4; k <= 30; k++) {
  const f = k / 26, x = Math.floor(mt.ax + (mt.bx - mt.ax) * f), y = Math.floor(mt.ay + (mt.by - mt.ay) * f), t = M.tileAt(x, y);
  if (M.blocked(x, y)) bad++; if (t === 'B') deck++;
}
ok(!bad && deck >= 18, 'the trail is walkable all the way over (' + deck + ' deck tiles, ' + bad + ' blocked)');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
