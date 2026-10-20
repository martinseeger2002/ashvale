'use strict';
/* [Claude 2026-10-19] The Caged Seer (tools/thornwatch/, chapter 3 of the Thornwatch act, tools/thornwatch/ACT_PLAN.md): Mother
   Isolde offers it only after the barrow and names a higher combat level; the hollow oak calls Gnarlbark's trial and gives the scroll;
   the Fivestones wake only in the scroll's order and open the red ring to Emberfall; Rakkas and Bregan must fall; Hollin is handed in
   at his cage, leaves it and turns up in camp; Isolde pays. Then the places: walkable from the barrow down to the oak, Emberfall shut
   in so the ring is the only way, no overlaps, clear of the road.  node tests/caged_seer_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const ids = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5));
const all = ids.map(id => Object.assign({ id }, mod('zone.' + id)));
const ZID = ['village', 'thornwatch', 'redmoor', 'hollowden', 'sistersbarrow', 'fivestones', 'gloamwood', 'emberfall'];
const zones = ZID.map(id => all.find(z => z.id === id)), Z = id => zones.find(z => z.id === id);
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const XP = D.rules.xp, xp = {}; for (const s of D.rules.skills) xp[s] = XP[90] * 10;
const core = AshCore.create(D, { seed: 'seer-test' }), p = core.addPlayer('p1', { name: 'Tester', xp });
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const ticks = n => { const out = []; for (let i = 0; i < n; i++) out.push(...core.tick()); return out; };
const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 2], [2, 0], [-2, 0], [0, -2]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
const talk = id => { beside(core.M.npcs.find(x => x.id === id)); core.cmd('p1', { c: 'npc', id }); return ticks(4).find(e => e.e === 'dialog' && e.p === 'p1'); };
const msgs = ev => ev.filter(e => e.e === 'msg' && e.p === 'p1').map(e => e.text).concat(ev.filter(e => e.e === 'dialog' && e.p === 'p1').flatMap(e => e.lines));
const Q = D.quests.quests.caged_seer, obj = (zid, id) => Z(zid).objects.find(o => o.id === id) || Z(zid).objects.find(o => o.k === id);
p.eq.weapon = { id: 'sword_t5', n: 1 }; p.eq.body = { id: 'body_t5', n: 1 }; p.eq.head = { id: 'helmet_t5', n: 1 };
/* fight until no live monster of these keys is left in reach (a strong test character; the balance is the play test's job) */
const fightAll = (keys, near, n0) => { for (let n = 0; n < (n0 || 6000); n++) { p.hp = core.maxHp(p); p.dead = 0;
  const live = core.S.mobs.filter(m => !m.dead && !m.gone && keys.includes(m.key) && Math.hypot(m.x - near[0], m.y - near[1]) < 30);
  if (!live.length) return true;
  if (!p.act || p.act.k !== 'attack') { live.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); core.cmd('p1', { c: 'attack', uid: live[0].uid }); }
  core.tick(); } return false; };

/* in its place in the line */
ok(Q.giver === 'isolde' && Q.after === 'sisters_barrow' && Q.combat > D.quests.quests.sisters_barrow.combat, 'Mother Isolde gives it after the barrow, at combat ' + Q.combat + ' (the barrow: ' + D.quests.quests.sisters_barrow.combat + ')');
p.quests.hollow_den = { step: 2, n: 32 };
let dlg = talk('isolde');
ok(dlg && !dlg.offer, 'before the barrow is done she only talks');
p.quests.sisters_barrow = { step: 2, n: 21 };
dlg = talk('isolde');
ok(dlg && dlg.offer === 'caged_seer' && /Recommended combat level: 44/.test(dlg.lines.slice(-1)[0]), 'after it, she offers The Caged Seer: "' + (dlg && dlg.lines.slice(-1)[0]) + '"');
core.cmd('p1', { c: 'acceptq', q: 'caged_seer' }); ticks(2);
ok(p.quests.caged_seer && p.quests.caged_seer.step === 1, 'accepted');
ok(core.M.npcs.some(n => n.id === 'hollin' && n.hideFlag === 'seer_freed'), 'Hollin is in camp, hidden until he is freed');

/* the stones do nothing yet */
const stone = id => obj('fivestones', 'fivestone_' + id);
beside(stone('hawk')); let ev = (core.cmd('p1', { c: 'mechanism', x: stone('hawk').x, y: stone('hawk').y }), ticks(6));
ok(!core.hasFlag(p, 'fivestones_1'), 'touching a stone before you have the scroll does nothing');

/* the hollow oak: Gnarlbark's trial, the scroll */
const oak = obj('gloamwood', 'hollow_oak');
p.x = oak.x; p.y = oak.y + 1; beside(oak); ev = (core.cmd('p1', { c: 'mechanism', x: oak.x, y: oak.y }), ticks(6));
const called = core.S.mobs.filter(m => m.summon && m.owner === 'p1' && !m.dead); if (process.env.DBG) console.log(p.x, p.y, p.act, msgs(ev), core.mechanismAt(oak.x, oak.y, 0) && 'mech');
ok(['gnarlbark', 'grove_ashling', 'thornback'].every(k => called.some(m => m.key === k)), 'reaching into the oak calls Gnarlbark, an ashling and a thornback (' + called.map(m => m.key) + ')');
ok(fightAll(['gnarlbark', 'grove_ashling', 'thornback'], [oak.x, oak.y]) && core.hasFlag(p, 'seer_scroll'), 'beating them gives the scroll (flag seer_scroll)');
dlg = talk('isolde');
ok(p.quests.caged_seer.step === 2 && /Hawk first, then the Hound, then the Hart, then the Hare, and the Heron last/.test(dlg.lines.join(' ')), 'Isolde reads it: the order of the stones');

/* the stones, in order; a wrong one stays cold */
const touch = id => { const o = stone(id); beside(o); core.cmd('p1', { c: 'mechanism', x: o.x, y: o.y }); for (let i = 0; i < 20 && p.act; i++) core.tick(); return msgs(ticks(2)); };
touch('hound'); ok(!core.hasFlag(p, 'fivestones_1') && !core.hasFlag(p, 'fivestones_2'), 'the Hound first stays cold');
const ring = obj('fivestones', 'portalgate');
beside(ring); core.cmd('p1', { c: 'enter', x: ring.x, y: ring.y }); ticks(20);
ok(p.x >= Z('fivestones').origin[0] && p.y < Z('emberfall').origin[1] + 100 && !(p.x >= Z('emberfall').origin[0]), 'the red ring will not take you before the stones wake');
for (const id of ['hawk', 'hound', 'hart', 'hare']) touch(id);
ok(['fivestones_1', 'fivestones_2', 'fivestones_3', 'fivestones_4'].every(k => core.hasFlag(p, k)) && !core.hasFlag(p, 'stones_open'), 'Hawk, Hound, Hart, Hare wake in turn');
touch('heron');
ok(core.hasFlag(p, 'stones_open'), 'the Heron last: the ring opens');

/* Rakkas, the ring, Emberfall, Bregan, the cage */
const rk = Z('fivestones').spawns.find(s => s.m === 'rakkas');
ok(fightAll(['rakkas', 'stone_ashling'], [rk.x, rk.y]) && (p.quests.caged_seer.kn || {}).rakkas === 1, 'Rakkas falls');
beside(ring); core.cmd('p1', { c: 'enter', x: ring.x, y: ring.y }); ticks(20);
const ez = Z('emberfall'), inEf = q => q.x >= ez.origin[0] && q.y >= ez.origin[1] && q.x < ez.origin[0] + ez.size[0] && q.y < ez.origin[1] + ez.size[1];
ok(inEf(p), 'through the ring into Emberfall (' + p.x + ',' + p.y + ')');
dlg = talk('hollin_caged');
ok(dlg && p.quests.caged_seer.step === 2, 'Hollin in his cage cannot leave while Bregan lives: "' + (dlg && dlg.lines[0]) + '"');
const br = ez.spawns.find(s => s.m === 'bregan');
ok(fightAll(['bregan'], [br.x, br.y]) && (p.quests.caged_seer.kn || {}).bregan === 1, 'Bregan falls');
dlg = talk('hollin_caged');
ok(p.quests.caged_seer.step === 3 && core.hasFlag(p, 'seer_freed'), 'handed in at the cage: Hollin is free (flag seer_freed): "' + (dlg && dlg.lines[0]) + '"');
ok(core.M.npcs.find(n => n.id === 'hollin_caged').goneFlag === 'seer_freed', 'and his cage stands empty for you (goneFlag)');
const back = obj('emberfall', 'portalgate'); beside(back); core.cmd('p1', { c: 'enter', x: back.x, y: back.y }); ticks(20);
ok(!inEf(p) && Math.hypot(p.x - ring.x, p.y - ring.y) < 5, 'Emberfall\'s ring takes you back to the stones');
const helm0 = core.invCount(p, 'helmet_t5'); dlg = talk('isolde');
ok(p.quests.caged_seer.step === 4 && core.invCount(p, 'helmet_t5') === helm0 + 1, 'Isolde pays: the abbey helm (' + (dlg && dlg.lines[0]) + ')');
dlg = talk('hollin'); ok(!!dlg, 'Hollin by the fire talks: "' + (dlg && dlg.lines[0]) + '"');

/* the places */
const walk = (start, goal, box) => { const seen = new Set([start.join(',')]), q = [start];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
    if (seen.has(k) || nx < box[0] || ny < box[1] || nx >= box[2] || ny >= box[3]) continue; seen.add(k);
    if (Math.max(Math.abs(nx - goal[0]), Math.abs(ny - goal[1])) <= 1) return true; if (!core.M.blocked(nx, ny)) q.push([nx, ny]); } } return false; };
ok(walk([263, 170], [ring.x, ring.y], [232, 160, 308, 316]), 'on foot from the barrow\'s gate path round its railing to the Fivestones');
ok(walk([ring.x, ring.y + 3], [oak.x, oak.y + 1], [216, 240, 308, 402]), 'and on from the stones down through the Gloamwood to the oak');
ok(!walk([ez.origin[0] - 3, ez.origin[1] + 30], [ez.origin[0] + 35, ez.origin[1] + 30], [ez.origin[0] - 10, ez.origin[1] - 10, ez.origin[0] + ez.size[0] + 10, ez.origin[1] + ez.size[1] + 10]), 'Emberfall cannot be walked into: the ring is the only way');
ok(walk([back.x + 1, back.y], [br.x, br.y], [ez.origin[0], ez.origin[1], ez.origin[0] + ez.size[0], ez.origin[1] + ez.size[1]]), 'inside, the ring\'s side reaches the square');
for (const k of ['grove_ashling', 'thornback', 'gloom_brute', 'gnarlbark', 'stone_ashling', 'field_walker', 'rakkas', 'cinder_dead', 'ember_ashling', 'bregan'])
  if (!fs.existsSync(path.join(DD, 'parts', 'char.' + D.monsters[k].look + '.json'))) ok(false, k + ' has no look');
for (const id of ['fivestones', 'gloamwood', 'emberfall']) { const bz = Z(id);
  const ov = all.filter(z => z.id !== id && !z.under && z.origin[0] < bz.origin[0] + bz.size[0] && bz.origin[0] < z.origin[0] + z.size[0] && z.origin[1] < bz.origin[1] + bz.size[1] && bz.origin[1] < z.origin[1] + z.size[1]);
  ok(!ov.length, id + ' overlaps no other zone' + (ov.length ? ': ' + ov.map(z => z.id) : '')); }
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
