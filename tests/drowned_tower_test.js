'use strict';
/* [Claude 2026-10-19] The Drowned Tower (tools/thornwatch/, chapter 4, tools/thornwatch/ACT_PLAN.md): Old Hollin offers it once he is
   home (after The Caged Seer) and names a higher combat level; the way runs on foot from the oak out of the Gloamwood into the
   Blackmere to the tower's stair; the stairs go down four cellar levels and back up; Countess Morwen at the bottom pays the hoard.
     node tests/drowned_tower_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const all = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const zones = ['village', 'thornwatch', 'redmoor', 'sistersbarrow', 'fivestones', 'gloamwood', 'emberfall', 'blackmere', 'towercellars'].map(id => all.find(z => z.id === id)), Z = id => zones.find(z => z.id === id);
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const XP = D.rules.xp, xp = {}; for (const s of D.rules.skills) xp[s] = XP[90] * 10;
const core = AshCore.create(D, { seed: 'tower-test' }), p = core.addPlayer('p1', { name: 'Tester', xp });
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const ticks = n => { const out = []; for (let i = 0; i < n; i++) out.push(...core.tick()); return out; };
const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [0, 2], [2, 0], [-2, 0], [0, -2]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
const talk = id => { beside(core.M.npcs.find(x => x.id === id)); core.cmd('p1', { c: 'npc', id }); return ticks(4).find(e => e.e === 'dialog' && e.p === 'p1'); };
const Q = D.quests.quests.drowned_tower, TC = Z('towercellars'), inTC = q => q.x >= TC.origin[0] && q.x < TC.origin[0] + TC.size[0] && q.y >= TC.origin[1] && q.y < TC.origin[1] + TC.size[1];
p.eq.weapon = { id: 'sword_t5', n: 1 }; p.eq.body = { id: 'body_t5', n: 1 }; p.eq.head = { id: 'helmet_t5', n: 1 };
const fightAll = (keys, near) => { for (let n = 0; n < 8000; n++) { p.hp = core.maxHp(p); p.dead = 0;
  const live = core.S.mobs.filter(m => !m.dead && !m.gone && keys.includes(m.key) && Math.hypot(m.x - near[0], m.y - near[1]) < 30);
  if (!live.length) return true;
  if (!p.act || p.act.k !== 'attack') { live.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); core.cmd('p1', { c: 'attack', uid: live[0].uid }); }
  core.tick(); } return false; };
const enter = o => { beside(o); core.cmd('p1', { c: 'enter', x: o.x, y: o.y }); for (let i = 0; i < 30 && p.act; i++) core.tick(); ticks(2); };

ok(Q.giver === 'hollin' && Q.after === 'caged_seer' && Q.combat > D.quests.quests.caged_seer.combat, 'Old Hollin gives it after The Caged Seer, at combat ' + Q.combat);
for (const id of ['hollow_den', 'sisters_barrow']) p.quests[id] = { step: 9 };
p.quests.caged_seer = { step: 4 }; p.flags = { seer_freed: 1 };
let dlg = talk('hollin');
ok(dlg && dlg.offer === 'drowned_tower' && /Recommended combat level: 48/.test(dlg.lines.slice(-1)[0]), 'Hollin offers it: "' + (dlg && dlg.lines.slice(-1)[0]) + '"');
core.cmd('p1', { c: 'acceptq', q: 'drowned_tower' }); ticks(2);

/* down the stairs, level by level */
const stairs = TC.objects.filter(o => o.k === 'stairs').sort((a, b) => a.x - b.x), ups = TC.objects.filter(o => o.k === 'stairsup').sort((a, b) => a.x - b.x);
const door = Z('blackmere').objects.find(o => o.k === 'stairs');
ok(stairs.length === 3 && ups.length === 4, 'three stairs down and four up inside');
enter(door); ok(inTC(p), 'the tower\'s stair takes you down into the cellars (' + p.x + ',' + p.y + ')');
for (let l = 0; l < 3; l++) { const x0 = p.x; enter(stairs[l]); ok(inTC(p) && p.x > x0 + 20, 'down to level ' + (l + 2)); }
const mw = TC.spawns.find(s => s.m === 'morwen');
ok(Math.abs(p.x - mw.x) < 40, 'Morwen is on the bottom level');
ok(fightAll(['morwen', 'blood_maid'], [mw.x, mw.y]) && ((p.quests.drowned_tower.kn || {}).morwen | 0) === 1, 'Morwen falls');
for (let l = 3; l >= 1; l--) { const up = ups[l]; enter(up); }
enter(ups[0]); ok(!inTC(p) && Math.hypot(p.x - door.x, p.y - door.y) < 4, 'and the stairs lead all the way back up to the bog (' + p.x + ',' + p.y + ')');
const c0 = core.invCount(p, 'coins'); dlg = talk('hollin');
ok(p.quests.drowned_tower.step === 2 && core.invCount(p, 'coins') >= c0 + 5000, 'Hollin pays the hoard (' + (core.invCount(p, 'coins') - c0) + ' coins)');

/* the way there on foot */
const walk = (start, goal, box) => { const seen = new Set([start.join(',')]), q = [start];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
    if (seen.has(k) || nx < box[0] || ny < box[1] || nx >= box[2] || ny >= box[3]) continue; seen.add(k);
    if (Math.max(Math.abs(nx - goal[0]), Math.abs(ny - goal[1])) <= 1) return true; if (!core.M.blocked(nx, ny)) q.push([nx, ny]); } } return false; };
const oak = Z('gloamwood').objects.find(o => o.id === 'hollow_oak');
ok(walk([oak.x, oak.y + 1], [door.x, door.y + 1], [216, 316, 406, 490]), 'on foot from the hollow oak out of the Gloamwood and across the bog to the tower\'s stair');
let reach = true; for (const s of TC.spawns) { const lvl = Math.floor((s.x - TC.origin[0]) / 42); const arr = lvl === 0 ? door : stairs[lvl - 1]; const a0 = TC.objects.find(o => o.k === 'stairsup' && Math.floor((o.x - TC.origin[0]) / 42) === lvl);
  if (!walk([a0.x + 1, a0.y + 1], [s.x, s.y], [TC.origin[0], TC.origin[1], TC.origin[0] + TC.size[0], TC.origin[1] + TC.size[1]])) { reach = false; console.log('     cannot reach', s.m, s.x, s.y); } }
ok(reach, 'every monster in the cellars can be walked up to from its level\'s stair');
{ const bz = Z('blackmere'); const ov = all.filter(z => z.id !== 'blackmere' && !z.under && z.origin[0] < bz.origin[0] + bz.size[0] && bz.origin[0] < z.origin[0] + z.size[0] && z.origin[1] < bz.origin[1] + bz.size[1] && bz.origin[1] < z.origin[1] + z.size[1]);
  ok(!ov.length, 'the Blackmere overlaps no other zone' + (ov.length ? ': ' + ov.map(z => z.id) : ''));
  const un = all.filter(z => z.id !== 'towercellars' && z.under && z.origin[0] - 32 < TC.origin[0] + TC.size[0] && TC.origin[0] < z.origin[0] + z.size[0] + 32 && z.origin[1] - 32 < TC.origin[1] + TC.size[1] && TC.origin[1] < z.origin[1] + z.size[1] + 32);
  ok(!un.length, 'the cellars keep 32 m of rock from every other underground area' + (un.length ? ': ' + un.map(z => z.id) : '')); }
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
