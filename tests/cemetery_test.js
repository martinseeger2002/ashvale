/* the Lake Castle's cemetery (2026-10-18, tools/decor/place_cemetery.js): at -90, 533, iron railing all round with the gate in the side
   facing the trail, a footpath from the trail to the gate, graves and flowers inside; you come in by the gate and by no other way.
   node tests/cemetery_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg'), decor: mod('decor') };
const WG = AshWorld.seededWorldgen(WGM, AG, D), M = AshWorld.createWorld(Object.assign({}, D, { wg: WG }));
const P = M.roadTorchesIn(-110, 515, -70, 550), n = k => P.filter(o => o.k === k).length;
ok(n('iron_fence') === 50 && n('iron_gate') === 1 && n('iron_post') === 4, 'iron railing all round (' + n('iron_fence') + ' sections, ' + n('iron_post') + ' corner piers, a gate)');
ok(n('gravestone') + n('grave_cross') + n('grave_old') === 12 && n('flower_bed') >= 6, n('gravestone') + n('grave_cross') + n('grave_old') + ' graves and ' + n('flower_bed') + ' flower beds inside');
const gate = P.find(o => o.k === 'iron_gate');
ok(Math.abs(gate.x + gate.dx + 0.5 - -90) < 1 && Math.abs(P.filter(o => /^grave/.test(o.k)).reduce((s, o) => s + o.y, 0) / 12 - 532) < 2, 'it lies at -90, 533 (the gate at ' + (gate.x + gate.dx + 0.5) + ', ' + (gate.y + gate.dz + 0.5) + ')');
ok('p'.includes(M.tileAt(-91, 526)) && 'p'.includes(M.tileAt(-90, 526)), 'a footpath comes up to the gate');
/* walking: from the footpath, in by the gate to the aisle; with the gate shut (its two edges walled) nothing inside can be reached */
const edgeOpen = (x, y, dx, dy) => { const b = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : 1, ob = dx === 1 ? 8 : dx === -1 ? 2 : dy === 1 ? 1 : 4; return !(M.wallAt(x, y) & b) && !(M.wallAt(x + dx, y + dy) & ob); };
const reach = (shut) => {
  const seen = new Set(['-90,515']), q = [[-90, 515]];
  while (q.length) { const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || nx < -115 || nx > -70 || ny < 505 || ny > 555 || M.blocked(nx, ny) || !edgeOpen(x, y, dx, dy)) continue;
      if (shut && dy === 1 && ny === 527 && (nx === -91 || nx === -90)) continue;
      seen.add(k); q.push([nx, ny]); } }
  return seen;
};
const inside = []; for (let y = 527; y <= 538; y++) for (let x = -96; x <= -83; x++) if (!M.blocked(x, y)) inside.push(x + ',' + y);
const open = reach(false), shut = reach(true);
ok(inside.every(k => open.has(k)), 'every open tile inside is reached through the gate (' + inside.filter(k => open.has(k)).length + '/' + inside.length + ')');
ok(!inside.some(k => shut.has(k)), 'with the gate shut nothing inside is reached: the railing has no gap');
ok(P.filter(o => /^grave/.test(o.k)).every(o => M.blocked(o.x, o.y)) && !M.blocked(-90, 530) && !M.blocked(-90, 536), 'the graves stand in the way, the aisle is clear');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
