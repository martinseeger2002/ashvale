/* stampede_test.js - attack one animal of a herd and the whole herd runs, the same way, away from you (2026-10-06:
   "I want game animals to all run if you attack one of the herd ... They all should run in the same direction"; ~25 tiles,
   then graze there, drifting home over the next few minutes; set off by the first attack, hit or miss) */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const row = '.'.repeat(80), tiles = Array.from({ length: 60 }, () => row);
const deer = [[30, 30], [32, 31], [31, 33], [34, 29], [33, 32]].map(([x, y]) => ({ m: 'deer', x, y }));
const meadow = { id: 'meadow', origin: [0, 0], size: [80, 60], ground: 'grass', tiles, spawns: deer.concat([{ m: 'boar', x: 50, y: 30 }]), npcs: [], objects: [], respawn: [10, 30] };
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: [meadow] };
const c = AshCore.create(D, { seed: 'stampede' }), p = c.addPlayer('p1', null);
p.x = 24; p.y = 31; p.inv[0] = { id: 'bow_t1', n: 1 }; p.inv[1] = { id: 'arrows_t1', n: 50 }; c.cmd('p1', { c: 'equip', slot: 0 }); c.tick(); c.cmd('p1', { c: 'equip', slot: 1 }); c.tick();
const herd = c.S.mobs.filter(m => m.key === 'deer'), start = herd.map(m => [m.x, m.y]);
const target = herd[0];
c.cmd('p1', { c: 'attack', uid: target.uid }); let ev = [];
for (let i = 0; i < 12 && !ev.some(e => e.e === 'stampede'); i++) { c.tick(); ev = ev.concat(c.S.ev); }
c.cmd('p1', { c: 'walk', x: 5, y: 31 });   /* one shot, then the hunter walks off */
const st = ev.find(e => e.e === 'stampede');
ok(st && st.n === 5, 'the first attack sets off the whole herd of 5 deer' + (st ? ' (direction ' + st.dir + ')' : ''));
ok(herd.every(m => m.flight && m.flight.run), 'every deer is running, not only the one attacked');
for (let i = 0; i < 40; i++) c.tick();
const moved = herd.map((m, i) => [m.x - start[i][0], m.y - start[i][1]]);
ok(moved.every(([dx, dy]) => dx > 8), 'they all ran the same way, away from the attacker standing to their west: ' + JSON.stringify(moved));
const far = herd.map((m, i) => Math.max(Math.abs(m.x - start[i][0]), Math.abs(m.y - start[i][1])));
ok(far.every(d => d >= 18 && d <= 27), 'about 25 tiles each (' + far.join(', ') + ')');
ok(herd.every((m, i) => !m.flight && Math.max(Math.abs(m.sx - start[i][0]), Math.abs(m.sy - start[i][1])) >= 18 && m.homeAt > c.S.t), 'stopped: their grazing spot is where they ran to, and they go home later');
const boar = c.S.mobs.find(m => m.key === 'boar');
ok(!boar.flight && !boar.home, 'the boar (not timid) did not join in');
for (let i = 0; i < 330; i++) c.tick();
ok(herd.some(m => m.flight && !m.flight.run) || herd.every(m => !m.home), 'a few minutes later they walk back home');
for (let i = 0; i < 450; i++) c.tick();
ok(herd.every((m, i) => Math.max(Math.abs(m.x - start[i][0]), Math.abs(m.y - start[i][1])) <= 8), 'and are back grazing round where they were before');
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
