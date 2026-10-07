/* poison_test.js - the Spider Cave's poison (2026-10-07): a spider's bite can poison you; it ticks damage every 3
   ticks and wears off on its own; food or an antidote cures it at once; the game is told ('poison' events) so the HUD can
   show it ("there needs to be an indication to the player that they are poisoned other than just their health going down"). */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const tiles = Array.from({ length: 30 }, () => '.'.repeat(30));
const room = { id: 'room', origin: [0, 0], size: [30, 30], ground: 'grass', tiles, spawns: [{ m: 'spider', x: 15, y: 16 }], npcs: [], objects: [], respawn: [15, 15] };
const MON = mod('monsters').monsters; MON.spider = Object.assign({}, MON.spider, { venom: { chance: 100, ticks: 30, dmg: 1 }, att: 99, attb: 99 });   /* every hit lands and poisons */
const D = { items: mod('items').items, monsters: MON, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: [room] };
ok(D.items.antidote && D.items.spider_silk && D.items.hat_spidercrown, 'the antidote, spider silk and the Spider Queen\'s Crown exist');
const c = AshCore.create(D, { seed: 'poison' }), p = c.addPlayer('p1', null);
p.x = 15; p.y = 15; p.xp.hitpoints = 1e7; p.hp = 90; p.inv[0] = { id: 'bread', n: 1 }; p.inv[1] = { id: 'antidote', n: 1 };
const sp = c.S.mobs.find(m => m.key === 'spider');
let ev = [], t0 = 0;
for (let i = 0; i < 40 && !p.poison; i++) { c.tick(); ev = ev.concat(c.S.ev); }
ok(!!p.poison, 'the spider bites and poisons');
ok(ev.some(e => e.e === 'poison' && e.on === true && e.p === 'p1'), "the game is told: a 'poison' event (the green orb)");
sp.dead = c.S.t; sp.x = 1; sp.y = 1;   /* the spider is gone: only the poison hurts now */
const hp0 = p.hp; ev = []; for (let i = 0; i < 9; i++) { c.tick(); ev = ev.concat(c.S.ev); }
const ticks = ev.filter(e => e.e === 'hit' && e.dst === 'p1' && e.cls === 'poison');
ok(ticks.length === 3 && p.hp === hp0 - 3, 'it ticks: 3 poison hits of 1 in 9 ticks (' + ticks.length + ', hp ' + hp0 + ' -> ' + p.hp + ')');
c.cmd('p1', { c: 'eat', slot: 0 }); ev = []; c.tick(); ev = ev.concat(c.S.ev);
ok(!p.poison && ev.some(e => e.e === 'poison' && e.on === false), 'eating bread cures it');
c.S.players.p1.poison = { until: c.S.t + 100, dmg: 2, next: c.S.t + 3 };
c.cmd('p1', { c: 'eat', slot: 1 }); c.tick();
ok(!p.poison && !p.inv.some(s => s && s.id === 'antidote'), 'an antidote cures it too');
c.S.players.p1.poison = { until: c.S.t + 6, dmg: 1, next: c.S.t + 3 }; ev = [];
for (let i = 0; i < 8; i++) { c.tick(); ev = ev.concat(c.S.ev); }
ok(!p.poison && ev.some(e => e.e === 'poison' && e.on === false), 'and left alone it wears off');
p.inv[5] = { id: 'antidote', n: 1 }; const hpA = p.hp; c.cmd('p1', { c: 'eat', slot: 5 }); c.tick();
ok(Number.isFinite(p.hp) && p.hp === hpA, 'drinking an antidote leaves hitpoints a number (it made them NaN: ' + p.hp + ')');
ok(p.cd && p.cd.antidote >= c.S.t + 299, 'the antidote also wards poison for three minutes (' + ((p.cd && p.cd.antidote) - c.S.t) + ' ticks)');
sp.dead = 0; sp.hp = 20; sp.x = 16; sp.y = 15; sp.tgt = 'p1'; sp.atk = 0;
for (let i = 0; i < 24; i++) c.tick();
ok(!p.poison, 'a bite during those three minutes does not poison');
p.cd.antidote = c.S.t;
for (let i = 0; i < 24 && !p.poison; i++) c.tick();
ok(!!p.poison, 'once the three minutes are gone, poison takes again');
p.hp = NaN; c.tick(); ok(p.hp === c.maxHp(p), 'hitpoints that are NaN come back to full on the next tick');
process.exit(fails ? 1 : 0);
