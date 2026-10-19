'use strict';
/* [Claude 2026-10-18] Thornwatch Camp, the Red Moor and the Hollow Den (tools/thornwatch/): Mother Isolde's quest is offered, a kill
   out on the moor never counts toward clearing the den, the den holds exactly what she asks for, every one of them has to die, and the
   way down and back up land on open ground.  node tests/hollow_den_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'thornwatch', 'redmoor', 'hollowden'].map(id => Object.assign({ id }, mod('zone.' + id)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const core = AshCore.create(D, { seed: 'hollow-den-test' }), p = core.addPlayer('p1', { name: 'Tester' });
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const ticks = n => { const out = []; for (let i = 0; i < n; i++) out.push(...core.tick()); return out; };
const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; p.dead = 0; p.hp = core.maxHp(p); };
const talk = id => { beside(core.M.npcs.find(x => x.id === id)); core.cmd('p1', { c: 'npc', id }); return ticks(4).find(e => e.e === 'dialog' && e.p === 'p1'); };
const Q = D.quests.quests.hollow_den, goal = Q.steps[0].goal, den = zones.find(z => z.id === 'hollowden');

/* the den holds exactly the count Isolde asks for, and only den monsters */
const count = {}; for (const s of den.spawns) count[s.m] = (count[s.m] | 0) + 1;
ok(JSON.stringify(Object.keys(count).sort()) === JSON.stringify(Object.keys(goal.kills).sort()) && Object.keys(goal.kills).every(k => count[k] === goal.kills[k]), 'the den holds exactly what the quest counts: ' + JSON.stringify(count));
ok(Object.values(goal.kills).reduce((a, b) => a + b, 0) === goal.n, 'and the total is ' + goal.n);
ok(!zones.find(z => z.id === 'redmoor').spawns.some(s => goal.kills[s.m] != null), 'nothing on the moor counts toward the den');
for (const k in goal.kills) ok(!!D.monsters[k] && fs.existsSync(path.join(DD, 'parts', 'char.' + D.monsters[k].look + '.json')) || ['rat'].includes(D.monsters[k].look), k + ' has a monster entry and a look');

/* every person in the camp exists, and the shops they keep stock real items */
for (const n of zones.find(z => z.id === 'thornwatch').npcs) ok(n.chest || fs.existsSync(path.join(DD, 'parts', 'char.' + n.look + '.json')), n.name + ' has a look (' + n.look + ')');
for (const id of ['thornwatch_forge', 'thornwatch_herbs', 'thornwatch_peddler']) { const S = D.shops.shops[id]; ok(S && S.stock.every(i => D.items[i]), id + ': every item it sells exists'); }

/* the way down and back up */
const mouth = zones.find(z => z.id === 'redmoor').objects.find(o => o.k === 'cavemouth'), out = den.objects.find(o => o.k === 'caveexit');
ok(!core.M.blocked(mouth.to[0], mouth.to[1]) && !core.M.blocked(out.to[0], out.to[1]), 'the den mouth lands on open cave floor, the way out on open moor');

/* the quest */
for (const sk of D.rules.skills) p.xp[sk] = core.xpFor(60) * 10;
let dlg = talk('isolde');
ok(dlg && dlg.offer === 'hollow_den', 'Mother Isolde offers The Hollow Den');
core.cmd('p1', { c: 'acceptq', q: 'hollow_den' }); ticks(1);
ok(p.quests.hollow_den && p.quests.hollow_den.step === 1, 'accepted');
for (let i = 0; i < 6; i++) core.creditKill('p1', 'ashling', -300, 270);
core.creditKill('p1', 'moor_walker', -300, 270);
ok((p.quests.hollow_den.n | 0) === 0, 'ashlings and walkers killed on the moor do not count');
const keys = Object.keys(goal.kills);
for (const k of keys) for (let i = 0; i < goal.kills[k] - (k === 'den_ashling' ? 1 : 0); i++) core.creditKill('p1', k, 24330, 24030);
for (let i = 0; i < 4; i++) core.creditKill('p1', 'den_shaman', 24330, 24030);   /* a respawned firecaller is not an ashling */
ok(p.quests.hollow_den.step === 1 && (p.quests.hollow_den.n | 0) === goal.n - 1, 'one ashling left alive: not done (' + p.quests.hollow_den.n + ' / ' + goal.n + ')');
dlg = talk('isolde');
ok(dlg && /still stir/.test(dlg.lines.join(' ')), 'and Isolde says so');
core.creditKill('p1', 'den_ashling', 24330, 24030);
const xp0 = p.xp.attack;
dlg = talk('isolde');
ok(dlg && /quiet/i.test(dlg.lines.join(' ')), 'the last one dead: Isolde felt it');
ok(p.xp.attack > xp0 && (p.quests.hollow_den.step > Q.steps.length), 'the quest is complete and its reward paid');
ok(core.invCount(p, 'thornwatch_stone') === 1 && core.invCount(p, 'shield_t4') === 1, 'with the Thornwatch stone and the chapel shield');
/* the same game, not a new one (2026-10-18: "your chest and all other assets from Ashvale should work with this extension"):
   no home of its own, the camp chest is an ordinary Ashvale chest, the quest is an ordinary Ashvale quest */
ok(!D.rules.homes.thornwatch, 'Thornwatch is no home of its own');
ok(!Q.homes && core.questForHome(Q, p), 'The Hollow Den is an Ashvale quest, offered to an Ashvale character');
{ const ch = zones.find(z => z.id === 'thornwatch').npcs.find(n => n.chest); ok(ch && !ch.home, 'the Thornwatch chest is a plain town chest (the Ashvale bank)'); }
/* the town portal (2026-10-18): it stands in the camp, on open ground; dying in the den wakes you by it, not in Ashvale */
{ const P = D.rules.portals.find(q => q.id === 'thornwatch'), tz = zones.find(z => z.id === 'thornwatch');
  ok(P && P.x >= tz.origin[0] && P.y >= tz.origin[1] && P.x < tz.origin[0] + tz.size[0] && P.y < tz.origin[1] + tz.size[1] && !core.M.blocked(P.to[0], P.to[1]), 'the camp has a town portal, arriving on open ground');
  ok(core.M.npcs.some(n => n.portal === 'thornwatch'), 'and the game stands its stone ring up');
  const c3 = AshCore.create(D, { seed: 'tw-wake' }), r = c3.addPlayer('p3', null); r.x = P.to[0]; r.y = P.to[1] + 4; r.path = []; for (let i = 0; i < 6; i++) c3.tick();
  r.x = 24330; r.y = 24030; c3.tick(); r.hp = 0; for (let i = 0; i < 400 && !(r.x === P.to[0] && r.y === P.to[1] && !r.dead); i++) c3.tick();
  ok(r.x === P.to[0] && r.y === P.to[1], 'killed in the den after visiting the camp, you wake by its portal: ' + r.x + ',' + r.y); }
/* passers-by on the Saltmere road are never set upon (2026-10-18): no monster in the camp, and every one on the moor posted so
   far from the road that its whole chase (leash + 4 tiles, plus a shot) ends 30 m short of the cobbles */
{ const moor = zones.find(z => z.id === 'redmoor'), camp = zones.find(z => z.id === 'thornwatch');
  ok(!camp.spawns.length, 'no monsters in Thornwatch Camp');
  const { W: WGW, CFG: WC } = require('../tools/castle/mask.js');   /* the seeded world, as the zone tools sample it */
  const road = []; for (let y = 0; y < 80; y++) for (let x = 90; x < 360; x++) if (WGW.tileAt(WC.face, x + WC.origin[0], y + WC.origin[1]) === 'c') road.push([x, y]);
  ok(road.length > 100, 'the Saltmere road is on the map here (' + road.length + ' cobbles)');
  let worst = 1e9, who = '';
  for (const s of moor.spawns) { const md = D.monsters[s.m]; let d = 1e9; for (const [x, y] of road) d = Math.min(d, Math.max(Math.abs(x - s.x), Math.abs(y - s.y)));
    const reach = ((md.ai && md.ai.leash) || 10) + 4 + (md.cast ? md.cast.range : 1); if (d - reach < worst) { worst = d - reach; who = s.m + ' at ' + s.x + ',' + s.y; }
    if (md.relentless || md.hunter) worst = -1; }
  ok(worst >= 30, 'the nearest moor monster stays ' + worst + ' m clear of the road even at the end of a chase (' + who + ')'); }
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
