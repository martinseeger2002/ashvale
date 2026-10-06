/* Trip recorder test: node tests/trip_test.js [out.json]
   Kills a monster and never goes home: checks the time window settles and src/trip.js recorded exactly what the judge audits. */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js'), Trip = require('../src/trip.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const core = AshCore.create(D, { seed: 'trip-1' });
const p = core.addPlayer('p1', { xp: { attack: 134000, strength: 134000, defence: 134000, hitpoints: 191000 }, inv: [{ id: 'bread', n: 1 }, { id: 'bread', n: 1 }] });
const T = Trip.create({ core, pid: 'p1', ticks: 300, bridge: () => Promise.resolve({ seed: 'ref-seed-1' }) });
function run(n, stop) { for (let i = 0; i < n; i++) { const ev = core.tick(); T.events(ev); T.tick(); if (stop && stop(ev)) return i + 1; } return n; }
(async () => {
  run(1);
  ok(T.state().rec && T.state().rec.food === 2, 'a window opens at once, food counted');
  await new Promise(r => setTimeout(r, 0));
  ok(T.state().seed === 'ref-seed-1', 'got the referee seed');
  const mob = core.S.mobs.sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)))[0];
  core.cmd('p1', { c: 'attack', uid: mob.uid, run: true });
  run(250, () => mob.dead);
  ok(mob.dead && T.state().rec.kills.length === 1 && T.state().rec.kills[0][0] === mob.key, 'kill recorded ' + JSON.stringify(T.state().rec.kills));
  run(300);   /* never walk home: the window settles on time alone */
  const L = T.state().done[0];
  ok(T.state().done.length === 1 && L.seed === 'ref-seed-1' && L.rec.ticks === 300, 'settled on time, away from town: ' + JSON.stringify(L && L.rec));
  ok(T.state().rec && T.state().rec.kills.length === 0, 'next window already open');
  run(400);
  ok(T.state().done.length === 1, 'an empty window is not kept');
  T.claimed(0); ok(T.state().done.length === 0, 'claimed windows drop off');
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(L));
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
