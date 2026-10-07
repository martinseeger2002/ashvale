/* relentless_test.js - the Spider Cave's monsters (2026-10-07): "All the monsters in the cave should automatically attack
   you and they should follow you out of their spawn zone indefinitely" - and up through the opening ("Follow you up"). */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
/* a long cave tunnel (x 0..79, y 0..5) and, beside it, the surface (y 10..39); the way out at the tunnel's far end */
const cave = { id: 'cave', origin: [0, 0], size: [80, 6], ground: 'cave', tiles: Array.from({ length: 6 }, (_, y) => y === 0 || y === 5 ? '^'.repeat(80) : '^' + 'd'.repeat(78) + '^'),
  spawns: [{ m: 'spider', x: 5, y: 2 }], npcs: [], objects: [{ k: 'caveexit', x: 78, y: 3, to: [40, 20] }], respawn: [40, 30] };
const top = { id: 'top', origin: [0, 10], size: [80, 30], ground: 'grass', tiles: Array.from({ length: 30 }, () => '.'.repeat(80)), spawns: [], npcs: [], objects: [], respawn: [40, 30] };
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: [cave, top] };
ok(D.monsters.spider.hunter && D.monsters.spider.relentless, 'cave spiders hunt and are relentless');
const c = AshCore.create(D, { seed: 'relentless' }), p = c.addPlayer('p1', null);
p.xp.hitpoints = 1e8; p.hp = 900; for (const k of ['attack', 'strength', 'defence']) p.xp[k] = 1e8;   /* far above the spider's level */
p.x = 9; p.y = 2; p.spawnT = -100; p.retal = false;   /* it must not die of fighting back: this is about the chase */
const sp = c.S.mobs.find(m => m.key === 'spider');
for (let i = 0; i < 15 && sp.tgt !== 'p1'; i++) c.tick();
ok(sp.tgt === 'p1', 'it goes for a player far above its level (hunter)');
/* run down the tunnel: 60+ tiles, far past any leash */
c.cmd('p1', { c: 'walk', x: 76, y: 3 });
for (let i = 0; i < 80 && !(p.x === 76 && p.y === 3); i++) c.tick();
for (let i = 0; i < 12; i++) c.tick();
ok(sp.tgt === 'p1' && sp.x > 50, 'it chases past its leash to the far end of the tunnel (spider at ' + sp.x + ',' + sp.y + ')');
/* out through the opening: it comes up too */
c.cmd('p1', { c: 'enter', x: 78, y: 3 });
let up = false, came = false;
for (let i = 0; i < 30; i++) { c.tick(); if (p.y >= 10) up = true; if (up && sp.y >= 10) { came = true; break; } }
ok(up, 'the player climbs out (now at ' + p.x + ',' + p.y + ')');
ok(came && sp.tgt === 'p1', 'the spider comes up through the opening after them (at ' + sp.x + ',' + sp.y + ')');
c.cmd('p1', { c: 'walk', x: 5, y: 35 });
for (let i = 0; i < 60; i++) c.tick();
ok(sp.tgt === 'p1' && Math.abs(sp.x - p.x) + Math.abs(sp.y - p.y) <= 4, 'and keeps after them on the surface (spider ' + [sp.x, sp.y, sp.tgt, sp.back, sp.crossing] + ' player ' + [p.x, p.y] + ')');
p.hp = 0; p.dead = c.S.t; for (let i = 0; i < 5; i++) c.tick();
ok(sp.tgt !== 'p1', 'it only gives up when they die');
process.exit(fails ? 1 : 0);
