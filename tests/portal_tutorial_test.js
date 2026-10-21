/* [Claude 2026-10-20] Tutorial Island's portal (the operator: "There needs to be a town portal where you can leave tutorial Island at
   any point in time and be teleported Ashvale. And the Ashvale town portal should have a portal to tutorial Island. Neither of
   these need a atonement").  node tests/portal_tutorial_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const core = AshCore.create(D, { seed: 'tutportal', tutorial: true });
const p = core.addPlayer('p1', null);   /* a new character: starts on the island, the tutorial begun */
const evs = []; const run = n => { for (let i = 0; i < n; i++) for (const e of core.tick()) evs.push(e); };
const at = (x, y) => { p.x = x; p.y = y; p.lv = 0; };
function touch(id) { evs.length = 0; core.cmd('p1', { c: 'npc', id: 'portal_' + id }); run(30); return evs.filter(e => e.e === 'portal' && e.p === 'p1').pop(); }
const T = D.rules.portals.find(P => P.id === 'tutorial'), A = D.rules.portals.find(P => P.id === 'ashvale'), S = D.rules.portals.find(P => P.id === 'saltmere');
const z = zones.find(q => q.id === D.rules.tutorial.zone), inZ = (x, y) => x >= z.origin[0] && y >= z.origin[1] && x < z.origin[0] + z.size[0] && y < z.origin[1] + z.size[1];
ok(!!T && T.free && inZ(T.x, T.y) && inZ(T.to[0], T.to[1]), 'a free portal stands on Tutorial Island (' + (T && T.x) + ',' + (T && T.y) + ')');
ok(p.tut === 1 && inZ(p.x, p.y), 'a new character starts on the island, the tutorial begun');
ok(!p.attuned || !p.attuned.ashvale, 'never been to Ashvale (not attuned to its portal)');
at(T.to[0], T.to[1]); let e = touch('tutorial');
ok(e && e.to.map(t => t.id).join() === 'ashvale', 'the island portal offers Ashvale, attuned or not: ' + JSON.stringify(e && e.to));
core.cmd('p1', { c: 'portal', to: 'ashvale' }); run(5);
ok(p.x === A.to[0] && p.y === A.to[1], 'and takes you there mid-tutorial');
run(60);
ok(p.x === A.to[0] && p.y === A.to[1] && !p.tut, 'the tutorial lets you go: you are not ferried back to the island');
p.attuned = {};   /* Ashvale's portal offers the island without ever having touched it there */
e = touch('ashvale');
ok(e && e.to.some(t => t.id === 'tutorial'), 'Ashvale\'s portal offers Tutorial Island');
core.cmd('p1', { c: 'portal', to: 'tutorial' }); run(5);
ok(p.x === T.to[0] && p.y === T.to[1], 'and takes you to the island');
p.attuned = { saltmere: 1, tutorial: 1, ashvale: 1 };
e = touch('tutorial');
ok(e && !e.to.some(t => t.id === 'saltmere'), 'the island portal goes to Ashvale alone, not Saltmere');
at(S.to[0], S.to[1]); e = touch('saltmere');
ok(e && !e.to.some(t => t.id === 'tutorial') && e.unknown.indexOf(T.name) < 0, 'Saltmere\'s portal does not offer the island');
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
