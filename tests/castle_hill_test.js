/* the hill between Ashvale and the Lake Castle (2026-10-18, tools/mountain/make_hill.js) and its winding road (globecfg links village >
   castle 'wind', src/wg_paths.js): the hill stands where it was asked for, gentle and walkable, and the cobbles still run unbroken from the
   village's south gate to the castle - no longer as one straight line. node tests/castle_hill_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg'), decor: mod('decor') };
const M = AshWorld.createWorld(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }));

/* the hill: some 13-17 m over the land at its knobs, its north foot by 21,174, no rock or cliff anywhere on it, never steep */
const base = M.groundH(21.5, 150.5);
ok(M.groundH(50.5, 192.5) - base > 12 && M.groundH(-31.5, 250.5) - base > 12, 'the hill\'s two knobs stand ' + (M.groundH(50.5, 192.5) - base).toFixed(1) + ' and ' + (M.groundH(-31.5, 250.5) - base).toFixed(1) + ' m over the land');
ok(M.groundH(21.5, 178.5) - base > 1.5 && M.groundH(21.5, 178.5) - base < 8, 'it starts rising around 21,174 (' + (M.groundH(21.5, 178.5) - base).toFixed(1) + ' m up at 21,178)');
let rock = 0, steep = 0;
for (let y = 150; y <= 330; y++) for (let x = -110; x <= 130; x++) {
  if (M.tileAt(x, y) === '^') rock++;
  steep = Math.max(steep, Math.hypot(M.groundH(x + 1, y) - M.groundH(x, y), M.groundH(x, y + 1) - M.groundH(x, y)));
}
ok(!rock && steep < 0.6, 'no rock on the hill and nothing steep (' + rock + ' rock tiles, steepest ' + steep.toFixed(2) + ' m a metre; the cliff rule is 0.75)');

/* the road: one run of cobbles (and its bridge) from the village to the castle; a creek tile you wade at a bridge's end counts, as it
   always has at this crossing */
const cob = (x, y) => 'cB'.indexOf(M.tileAt(x, y)) >= 0;
const road = (x, y) => cob(x, y) || (M.tileAt(x, y) === 'v' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cob(x + dx, y + dy)));
let start = null; for (let x = 0; x <= 48 && !start; x++) if (cob(x, 70)) start = [x, 70];
const prev = new Map([[start + '', null]]), q = [start]; let reach = null;
while (q.length) {
  const [x, y] = q.shift();
  if (y >= 446 && M.inPiece(x, y)) { reach = [x, y]; break; }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
    if (prev.has(k) || ny < 60 || ny > 470 || !(road(nx, ny) || (ny >= 446 && M.inPiece(nx, ny) && 'cp'.indexOf(M.tileAt(nx, ny)) >= 0))) continue;
    prev.set(k, x + ',' + y); q.push([nx, ny]);
  }
}
ok(!!start && !!reach, 'the cobbles run unbroken from the village (' + start + ') to the castle (' + reach + ')');
const way = []; for (let k = reach && reach + ''; k; k = prev.get(k)) way.unshift(k.split(',').map(Number));
const line = ([x, y]) => Math.abs(x - (start[0] + (reach[0] - start[0]) * (y - 70) / (reach[1] - 70)));
const over = way.filter(([, y]) => y > 150 && y < 370);
ok(over.length && Math.max(...over.map(line)) > 20, 'and it winds: up to ' + (over.length ? Math.max(...over.map(line)).toFixed(0) : '?') + ' m off the straight line between the gates');
ok(Array.from(prev.keys()).every(k => { const [x, y] = k.split(',').map(Number); return !M.blocked(x, y); }), 'every road tile is walkable (' + prev.size + ')');
let grade = 0; for (let i = 4; i < way.length; i++) { const a = way[i - 4], b = way[i]; if (b[1] < 150 || b[1] > 370) continue;   /* over the hill (the river's banks at the old bridge were always steep) */ grade = Math.max(grade, Math.abs(M.groundH(b[0] + 0.5, b[1] + 0.5) - M.groundH(a[0] + 0.5, a[1] + 0.5)) / Math.hypot(b[0] - a[0], b[1] - a[1])); }
ok(grade < 0.2, 'the road climbs the hill gently (steepest ' + (grade * 100).toFixed(0) + '% along the way)');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
