/* the towns' cats (2026-10-19, tools/critters/make_cats.py): looks on the QUADRUPED base model, a few in every town and more in Saltmere
   (rules.strays, src/world.js), and TAME - never attackable: a click to attack one pets it, nothing ever hurts it, and a replay holds.
   node tests/cats_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js'), AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort((a, b) => { const O = ['village', 'whisperwood', 'saltmere'], ia = O.indexOf(a), ib = O.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); }).map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg'), decor: mod('decor') };
const CATS = Object.keys(D.monsters).filter(k => /^cat_/.test(k));
ok(CATS.length >= 6 && CATS.every(k => D.monsters[k].tame && !D.monsters[k].aggro && D.monsters[k].look === k), CATS.length + ' kinds of cat, every one tame');
ok(CATS.every(k => { const p = JSON.parse(fs.readFileSync(path.join(DD, 'parts', 'char.' + k + '.json'), 'utf8')); return p.body === 'quadruped' && p.quadruped && p.quadruped.preset === 'cat'; }), 'each a look on the quadruped base model (the cat preset)');
const DS = Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) });
const core = AshCore.create(DS, { seed: 'cats' }), M = core.M;
const cats = core.S.mobs.filter(m => CATS.includes(m.key)), by = {}; for (const m of cats) by[m.zone] = (by[m.zone] || 0) + 1;
ok(cats.length >= 12 && by.saltmere >= 8 && by.village >= 2, 'cats roam the towns (' + Object.entries(by).map(([z, n]) => z + ' ' + n).join(', ') + ')');
ok(cats.every(m => !M.blocked(m.x, m.y) && !M.insideAt(m.x, m.y)), 'each on open ground outdoors');
/* attack a cat: it is petted instead, and never hurt */
const cat = cats.find(m => m.zone === 'village') || cats[0], hp0 = cat.hp;
const p = core.addPlayer('p1', { xp: { attack: 130344310, strength: 130344310, hitpoints: 130344310 } });
void p;   /* from the spawn, by the village's cats: walk up, as anyone would (a replay knows no teleports) */
core.cmd('p1', { c: 'attack', uid: cat.uid });
const evs = []; for (let i = 0; i < 60; i++) { core.tick(); evs.push(...core.S.ev.splice(0)); }
ok(cat.hp === hp0 && !cat.dead, 'an attack on a cat does it no harm (' + cat.hp + '/' + hp0 + ')');
ok(evs.some(e => e.e === 'pet' && e.uid === cat.uid) && evs.some(e => e.e === 'msg' && /purr|allows|headbutt|rolls over|bites you, very gently/.test(e.text)), 'the click pets it instead');
ok(!evs.some(e => e.e === 'attack' && e.dst === cat.uid), 'no blow is ever struck at it');
core.cmd('p1', { c: 'pet', uid: cat.uid }); for (let i = 0; i < 10; i++) core.tick();
ok(AshCore.replay(DS, 'cats', { p1: { xp: { attack: 130344310, strength: 130344310, hitpoints: 130344310 } } }, core.log, core.S.t) === core.hash(), 'the session replays to the same hash');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
