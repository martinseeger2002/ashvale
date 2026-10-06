/* arms_test.js - the Lake Castle stone's call to arms: the guards come, fight for you, and stand down (2026-10-05) */
const fs = require('fs'), path = require('path'), AshCore = require('../src/core.js'), DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zn = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort((a, b) => { const O = ['village', 'whisperwood', 'saltmere'], ia = O.indexOf(a), ib = O.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); });
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: zn.map(z => Object.assign({ id: z }, mod('zone.' + z))), globecfg: mod('globecfg') };
const core = AshCore.create(D, { seed: 'arms' }); let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const p = core.addPlayer('me', null), step = n => { for (let i = 0; i < n; i++) core.tick(); };
const G = core.M.npcs.filter(n => n.guard); ok(G.length >= 10, G.length + ' castle guards (watchmen, the gate guard, the castellan)');
core.cmd('me', { c: 'arms', on: true }); step(2); ok(!G.some(n => n.escort), 'without the stone nobody comes');
p.inv[0] = { id: 'castle_stone', n: 1 };
const rat = core.S.mobs.find(m => m.key === 'rat'); p.x = rat.x + 2; p.y = rat.y + 1; step(3);
core.cmd('me', { c: 'arms', on: true }); step(2);
const near = G.filter(n => Math.max(Math.abs(n.x - p.x), Math.abs(n.y - p.y)) <= 4).length;
ok(near >= G.length - 1, near + ' guards arrived by the portal at the player\'s side, far from the castle');
const spots = new Set(G.map(n => n.x + ',' + n.y)); ok(spots.size === G.length, 'each guard stands on a tile of its own');
rat.tgt = p.id; step(60); ok(rat.dead > 0, 'a rat that went for the player is killed by the guard');
ok(!p.kills || !p.kills.rat, 'the kill is the guard\'s, not a quest kill for the player');
core.cmd('me', { c: 'arms', on: false }); step(2); ok(G.every(n => !n.escort && n.x === n.hx && n.y === n.hy), 'stand down: every guard back at its post');
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
