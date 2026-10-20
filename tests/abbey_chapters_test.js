'use strict';
/* [Claude 2026-10-19] The Thornwatch act's last two chapters (tools/thornwatch/ACT_PLAN.md): The Smith's Hammer (Captain Rhosyn, after The
   Drowned Tower: Gorrath at the abbey forge drops Gwen's hammer, bring it to Rhosyn for Gwen's longsword and the abbey's stone) and The
   Thorn Maiden (Mother Isolde, after that: four crypt levels under the cathedral, Maelis at the bottom; the road east opens, so Tavish
   says so). The places: on foot from the drowned tower over the bog to the abbey gate, to the barracks forge, to the crypt stair; the
   abbey's portal stand in its yard with nothing posted near it; walls you cannot walk through.  node tests/abbey_chapters_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const all = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const zones = ['village', 'thornwatch', 'blackmere', 'towercellars', 'abbey', 'crypts'].map(id => all.find(z => z.id === id)), Z = id => zones.find(z => z.id === id);
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const XP = D.rules.xp, xp = {}; for (const s of D.rules.skills) xp[s] = XP[90] * 10;
const core = AshCore.create(D, { seed: 'abbey-test' }), p = core.addPlayer('p1', { name: 'Tester', xp });
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const ticks = n => { const out = []; for (let i = 0; i < n; i++) out.push(...core.tick()); return out; };
const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [0, 2], [2, 0], [-2, 0], [0, -2]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
const talk = id => { beside(core.M.npcs.find(x => x.id === id)); core.cmd('p1', { c: 'npc', id }); return ticks(4).find(e => e.e === 'dialog' && e.p === 'p1'); };
const enter = o => { beside(o); core.cmd('p1', { c: 'enter', x: o.x, y: o.y }); for (let i = 0; i < 30 && p.act; i++) core.tick(); ticks(2); };
const fightAll = (keys, near) => { for (let n = 0; n < 8000; n++) { p.hp = core.maxHp(p); p.dead = 0;
  const sameLv = m => m.x < 24000 || Math.floor((m.x - 24740) / 42) === Math.floor((p.x - 24740) / 42);   /* in the crypts, only this level's: the rock between levels is solid */
  const live = core.S.mobs.filter(m => !m.dead && !m.gone && keys.includes(m.key) && Math.hypot(m.x - near[0], m.y - near[1]) < 30 && sameLv(m));
  if (!live.length) return true;
  if (!p.act || p.act.k !== 'attack') { live.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); core.cmd('p1', { c: 'attack', uid: live[0].uid }); }
  core.tick(); } return false; };
p.eq.weapon = { id: 'sword_t5', n: 1 }; p.eq.body = { id: 'body_t5', n: 1 }; p.eq.head = { id: 'helmet_t5', n: 1 };
const H = D.quests.quests.smiths_hammer, M5 = D.quests.quests.thorn_maiden, AB = Z('abbey'), CR = Z('crypts');

/* The Smith's Hammer */
ok(H.giver === 'rhosyn' && H.after === 'drowned_tower' && H.combat > D.quests.quests.drowned_tower.combat, 'Captain Rhosyn gives The Smith\'s Hammer after The Drowned Tower, at combat ' + H.combat);
for (const id of ['hollow_den', 'sisters_barrow', 'caged_seer']) p.quests[id] = { step: 9 }; p.flags = { seer_freed: 1 };
let dlg = talk('rhosyn'); ok(dlg && !dlg.offer, 'not before the tower');
p.quests.drowned_tower = { step: 2 };
dlg = talk('rhosyn'); ok(dlg && dlg.offer === 'smiths_hammer' && /Recommended combat level: 52/.test(dlg.lines.slice(-1)[0]), 'after it she offers it: "' + (dlg && dlg.lines.slice(-1)[0]) + '"');
core.cmd('p1', { c: 'acceptq', q: 'smiths_hammer' }); ticks(2);
const gor = AB.spawns.find(s => s.m === 'gorrath');
ok(gor && gor.x > 334 && gor.x < 360 && gor.y > 544 && gor.y < 586, 'Gorrath is in the barracks (' + (gor && gor.x) + ',' + (gor && gor.y) + ')');
p.x = gor.x + 2; p.y = gor.y + 2;
ok(fightAll(['gorrath'], [gor.x, gor.y]), 'Gorrath falls');
ticks(4);
const hm = core.S.ground.find(g => g.id === 'gwens_hammer');
ok(!!hm, 'and drops Gwen\'s hammer');
if (hm) { core.cmd('p1', { c: 'take', uid: hm.uid }); for (let i = 0; i < 30 && core.invCount(p, 'gwens_hammer') < 1; i++) core.tick(); }
ok(core.invCount(p, 'gwens_hammer') === 1, 'you pick it up');
dlg = talk('gwen'); ok(dlg === undefined || !(dlg.lines || []).some(l => /barracks/.test(l)), 'Gwen still keeps her shop open while it is under way (the errand is handed to Rhosyn)');
const ls0 = core.invCount(p, 'longsword_t5'); dlg = talk('rhosyn');
ok(p.quests.smiths_hammer.step === 2 && core.invCount(p, 'gwens_hammer') === 0 && core.invCount(p, 'longsword_t5') === ls0 + 1 && core.invCount(p, 'abbey_stone') === 1, 'Rhosyn takes the hammer: Gwen\'s longsword and the abbey stone');

/* The Thorn Maiden */
ok(M5.giver === 'isolde' && M5.after === 'smiths_hammer' && M5.combat > H.combat, 'Mother Isolde gives The Thorn Maiden after it, at combat ' + M5.combat);
dlg = talk('isolde'); ok(dlg && dlg.offer === 'thorn_maiden', 'Isolde offers it: "' + (dlg && dlg.lines[0]) + '"');
core.cmd('p1', { c: 'acceptq', q: 'thorn_maiden' }); ticks(2);
dlg = talk('tavish'); const before = dlg && dlg.lines[0];
const stair = AB.objects.find(o => o.k === 'stairs'), inCR = q => q.x >= CR.origin[0] && q.x < CR.origin[0] + CR.size[0] && q.y >= CR.origin[1] && q.y < CR.origin[1] + CR.size[1];
enter(stair); ok(inCR(p), 'the crypt stair behind the altar takes you down');
const downs = CR.objects.filter(o => o.k === 'stairs').sort((a, b) => a.x - b.x), ups = CR.objects.filter(o => o.k === 'stairsup').sort((a, b) => a.x - b.x);
for (const d of downs) { const x0 = p.x; enter(d); ok(inCR(p) && p.x > x0 + 20, 'down a level'); }
const mae = CR.spawns.find(s => s.m === 'maelis');
ok(D.monsters.maelis.venom && D.monsters.maelis.venom.chance > 0, 'Maelis\'s thorns poison');
ok(fightAll(['maelis', 'thorn_wraith'], [mae.x, mae.y]) && ((p.quests.thorn_maiden.kn || {}).maelis | 0) === 1, 'Maelis falls');
for (let l = ups.length - 1; l >= 0; l--) enter(ups[l]);
ok(!inCR(p) && Math.hypot(p.x - stair.x, p.y - stair.y) < 4, 'and the stairs lead back up into the cathedral');
dlg = talk('isolde');
ok(p.quests.thorn_maiden.step === 2 && core.hasFlag(p, 'maiden_slain') && core.invCount(p, 'body_t5') >= 1, 'Isolde pays the abbey\'s armour, and the road east is open (flag maiden_slain)');
dlg = talk('tavish'); ok(dlg && dlg.lines[0] !== before && /road east is open/.test(dlg.lines.join(' ')), 'Tavish says so: "' + (dlg && dlg.lines[0]) + '"');

/* the places */
const walk = (start, goal, box) => { const seen = new Set([start.join(',')]), q = [start];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
    if (seen.has(k) || nx < box[0] || ny < box[1] || nx >= box[2] || ny >= box[3]) continue; seen.add(k);
    if (Math.max(Math.abs(nx - goal[0]), Math.abs(ny - goal[1])) <= 1) return true; if (!core.M.blocked(nx, ny)) q.push([nx, ny]); } } return false; };
const door = Z('blackmere').objects.find(o => o.k === 'stairs');
ok(walk([door.x, door.y + 1], [377, 507], [296, 402, 440, 598]), 'on foot from the drowned tower over the bog to the abbey gate');
ok(walk([377, 508], [gor.x, gor.y], [316, 490, 440, 598]), 'through the yard into the barracks to Gorrath');
ok(walk([377, 508], [stair.x, stair.y - 1], [316, 490, 440, 598]), 'and into the cathedral to the crypt stair');
const P = D.rules.portals.find(q => q.id === 'abbey');
ok(P && !core.M.blocked(P.x, P.y) && AB.spawns.every(s => Math.hypot(s.x - P.x, s.y - P.y) >= 14), 'the abbey\'s portal stand is in its yard, on open ground, nothing posted within 14 m');
{ let leak = 0; const [x0, y0, x1, y1] = [330, 506, 426, 590]; for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if (!core.M.blocked(x, y) && !(y === y0 && (x === 377 || x === 378))) leak++;
  for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) if (!core.M.blocked(x, y)) leak++;
  ok(!leak, 'the abbey wall is shut all round but the gate (' + leak + ' gaps)'); }
let reach = true; for (const s of CR.spawns) { const lvl = Math.floor((s.x - CR.origin[0]) / 42), a0 = ups.find(o => Math.floor((o.x - CR.origin[0]) / 42) === lvl);
  if (!walk([a0.x + 1, a0.y + 1], [s.x, s.y], [CR.origin[0], CR.origin[1], CR.origin[0] + CR.size[0], CR.origin[1] + CR.size[1]])) { reach = false; console.log('     cannot reach', s.m, s.x, s.y); } }
ok(reach, 'every monster in the crypts can be walked up to from its level\'s stair');
{ const ov = all.filter(z => z.id !== 'abbey' && !z.under && z.origin[0] < AB.origin[0] + AB.size[0] && AB.origin[0] < z.origin[0] + z.size[0] && z.origin[1] < AB.origin[1] + AB.size[1] && AB.origin[1] < z.origin[1] + z.size[1]);
  ok(!ov.length, 'the abbey overlaps no other zone' + (ov.length ? ': ' + ov.map(z => z.id) : ''));
  const un = all.filter(z => z.id !== 'crypts' && z.under && z.origin[0] - 32 < CR.origin[0] + CR.size[0] && CR.origin[0] < z.origin[0] + z.size[0] + 32 && z.origin[1] - 32 < CR.origin[1] + CR.size[1] && CR.origin[1] < z.origin[1] + z.size[1] + 32);
  ok(!un.length, 'the crypts keep 32 m of rock from every other underground area' + (un.length ? ': ' + un.map(z => z.id) : '')); }
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
