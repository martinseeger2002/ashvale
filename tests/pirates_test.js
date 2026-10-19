/* Saltmere's pirates (2026-10-19, tools/saltmere/make_pirate_quests.py): the four quests are on the crew, open after Saltmere's own; the
   pet goal is met by petting the named cat (The Admiral) and the Speechcraft talk step only goes through at its level (Black Sails, the
   Mayor); the stew is made at a fire. node tests/pirates_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort((a, b) => { const O = ['village', 'whisperwood', 'saltmere'], ia = O.indexOf(a), ib = O.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); }).map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const Q = D.quests.quests, salt = zones.find(z => z.id === 'saltmere'), npc = id => salt.npcs.find(n => n.id === id);
ok(['captains_cutlass', 'fish_stew_again', 'black_sails', 'the_admiral'].every(q => Q[q] && Q[q].after && (npc(Q[q].giver).quests || []).indexOf(q) >= 0), 'the crew give the four quests, each after one of Saltmere\'s own');
ok(D.monsters.admiral && D.monsters.admiral.tame && salt.spawns.some(s => s.m === 'admiral') && salt.spawns.filter(s => s.m === 'smuggler').length === 2, 'Admiral (tame) and two smugglers are in Saltmere');
ok((D.rules.items.fireMix || []).some(m => m.give.pirate_stew), 'the pirate\'s stew is made at a fire');

const core = AshCore.create(D, { seed: 'pirates' });
const p = core.addPlayer('p1', { xp: { hitpoints: 1200, speechcraft: 0 } });
const run = n => { for (let i = 0; i < n; i++) core.tick(); };
/* the Mayor is not talked round without the tongue for it */
const cal = npc('calder');
p.quests.black_sails = { step: 3, n: 0 }; p.x = cal.x + 1; p.y = cal.y; p.path = [];
core.cmd('p1', { c: 'npc', id: 'calder' }); run(4);
ok((p.quests.black_sails.n | 0) === 0, 'at Speechcraft 1 the Mayor is not persuaded');
p.xp.speechcraft = core.xpFor(15) * 10; core.cmd('p1', { c: 'npc', id: 'calder' }); run(4);
ok((p.quests.black_sails.n | 0) === 1, 'at Speechcraft 15 he is talked round');
/* petting Admiral meets The Admiral's first step */
p.quests.the_admiral = { step: 1, n: 0 };
const cat = core.S.mobs.find(m => m.key === 'admiral');
ok(!!cat, 'Admiral is about the alleys');
if (cat) { p.x = cat.x + 1; p.y = cat.y; p.path = []; core.cmd('p1', { c: 'pet', uid: cat.uid }); run(6); }
ok((p.quests.the_admiral.n | 0) === 1, 'petting her counts for The Admiral');
console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
