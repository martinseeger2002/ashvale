/* respawn_mob_test.js - a killed rat comes back after deadTicks even while players stand on its post (2026-10-06) */
const fs = require('fs'), path = require('path'), AshCore = require('../src/core.js'), DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z))), globecfg: mod('globecfg') };
const core = AshCore.create(D, { seed: 'resp' }); let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const DT = (D.rules.respawn && D.rules.respawn.deadTicks) || 2000;
const rat = core.S.mobs.find(m => m.key === 'rat'), a = core.addPlayer('a', null), b = core.addPlayer('b', null);
a.x = rat.sx; a.y = rat.sy + 1; b.x = rat.sx + 1; b.y = rat.sy; for (let i = 0; i < 5; i++) core.tick();
rat.hp = 0; rat.dead = core.S.t; rat.dropAt = 0; rat.tgt = 0;
for (let i = 0; i < DT - 20; i++) { a.hp = 99; b.hp = 99; core.tick(); }
ok(rat.dead > 0, 'still dead before deadTicks (' + DT + ' ticks = ' + Math.round(DT * 0.6 / 60) + ' min)');
let at = null; for (let i = 0; i < 60 && !at; i++) { a.hp = 99; b.hp = 99; core.tick(); if (!rat.dead) at = [rat.x, rat.y]; }
ok(!!at, 'back after deadTicks although two players stand on its post');
ok(at && Math.max(Math.abs(at[0] - a.x), Math.abs(at[1] - a.y)) > 5 && Math.max(Math.abs(at[0] - b.x), Math.abs(at[1] - b.y)) > 5, 'and it appears away from them, at ' + at + ' (post ' + rat.sx + ',' + rat.sy + ')');
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
