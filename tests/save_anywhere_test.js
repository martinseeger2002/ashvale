/* save_anywhere_test.js - 2026-10-06: "I flew over the ocean and the game lost track of my position ... My position
   should be kept no matter where on the globe I am." A hawk saved over water comes back exactly there; a walker saved on a
   tile nobody can stand on comes back on the nearest open ground, not at the village spawn. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
/* a meadow with a lake 30 tiles wide in the middle (x 25..54, y 15..44) and the spawn far to the west */
const tiles = Array.from({ length: 60 }, (_, y) => Array.from({ length: 80 }, (_, x) => (x >= 25 && x < 55 && y >= 15 && y < 45) ? '~' : '.').join(''));
const meadow = { id: 'meadow', origin: [0, 0], size: [80, 60], ground: 'grass', tiles, spawns: [], npcs: [], objects: [], respawn: [3, 30] };
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: [meadow] };
const c = AshCore.create(D, { seed: 'anywhere' });
const hawkRing = Object.keys(D.items).find(k => (D.items[k].attributes || []).some(a => a.trait_type === 'Form' && a.value === 'hawk'));
ok(!!hawkRing, 'the hawk ring is ' + hawkRing);
const save = (x, y, ring) => { const p = c.addPlayer('tmp', null); p.x = x; p.y = y; if (ring) p.eq.ring = { id: ring, n: 1 }; const s = c.exportPlayer('tmp'); c.removePlayer('tmp'); return s; };
let p = c.addPlayer('hawk', save(40, 30, hawkRing));
ok(p.x === 40 && p.y === 30, 'a hawk saved over the middle of the lake comes back right there (' + p.x + ',' + p.y + ')');
p = c.addPlayer('swimmer', save(27, 30, null));
ok(p.x === 24 && p.y === 30, 'a walker saved in the water comes back on the nearest shore, not at the spawn (' + p.x + ',' + p.y + ')');
p = c.addPlayer('walker', save(60, 50, null));
ok(p.x === 60 && p.y === 50, 'a walker on open ground comes back where it was (' + p.x + ',' + p.y + ')');
process.exit(fails ? 1 : 0);
