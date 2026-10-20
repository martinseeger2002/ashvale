'use strict';
/* [Claude 2026-10-18] The Sisters' Barrow (tools/thornwatch/): Captain Rhosyn's quest opens only after the Hollow Den, names its
   recommended combat level (higher than the den's: the quests get harder in order, the operator), the barrow holds the dead it asks for, its
   gate is reached on foot from the moor's trail, Corva can be walked up to, and nothing in it can reach the Saltmere road or overlaps
   another zone.  node tests/sisters_barrow_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const ids = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5));
const all = ids.map(id => Object.assign({ id }, mod('zone.' + id)));
const zones = ['village', 'thornwatch', 'redmoor', 'hollowden', 'sistersbarrow'].map(id => all.find(z => z.id === id));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const core = AshCore.create(D, { seed: 'barrow-test' }), p = core.addPlayer('p1', { name: 'Tester' });
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const ticks = n => { const out = []; for (let i = 0; i < n; i++) out.push(...core.tick()); return out; };
const beside = o => { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (!core.M.blocked(o.x + dx, o.y + dy)) { p.x = o.x + dx; p.y = o.y + dy; break; } p.path = []; p.act = null; };
const talk = id => { beside(core.M.npcs.find(x => x.id === id)); core.cmd('p1', { c: 'npc', id }); return ticks(4).find(e => e.e === 'dialog' && e.p === 'p1'); };
const Q = D.quests.quests.sisters_barrow, goal = Q.steps[0].goal, bz = zones.find(z => z.id === 'sistersbarrow');

/* the quest, in its place in the line */
ok(Q.after === 'hollow_den' && Q.giver === 'rhosyn', 'Captain Rhosyn gives it, after The Hollow Den');
ok(Q.combat > D.quests.quests.hollow_den.combat, 'and it asks for more than the den: combat ' + Q.combat + ' after ' + D.quests.quests.hollow_den.combat);
let dlg = talk('rhosyn');
ok(dlg && !dlg.offer, 'before the den is cleared she only talks: "' + (dlg && dlg.lines[0]) + '"');
p.quests.hollow_den = { step: 2, n: 32 };
dlg = talk('rhosyn');
ok(dlg && dlg.offer === 'sisters_barrow', 'after it, she offers The Sisters\' Barrow');
ok(dlg && /Recommended combat level: 40\. Yours is \d+ - this will be a hard fight\./.test(dlg.lines.slice(-1)[0]), 'naming the recommended level, and warning a weaker player: "' + (dlg && dlg.lines.slice(-1)[0]) + '"');
p.quests = {}; dlg = talk('isolde');
ok(dlg && dlg.offer === 'hollow_den' && /Recommended combat level: 36/.test(dlg.lines.slice(-1)[0]), 'Mother Isolde names the den\'s: "' + (dlg && dlg.lines.slice(-1)[0]) + '"');

/* what lies in the barrow */
const count = {}; for (const s of bz.spawns) count[s.m] = (count[s.m] | 0) + 1;
ok(count.corva === 1 && count.risen_dead >= goal.kills.risen_dead, 'the barrow holds Corva and her dead: ' + JSON.stringify(count));
ok(bz.spawns.find(s => s.m === 'corva').carry && bz.spawns.find(s => s.m === 'corva').carry.arrows_t4 > 0, 'Corva carries arrows (she shoots)');
ok(!zones.find(z => z.id === 'redmoor').spawns.some(s => goal.kills[s.m] != null), 'nothing on the moor counts toward the barrow');
for (const k of ['risen_dead', 'corva']) ok(fs.existsSync(path.join(DD, 'parts', 'char.' + D.monsters[k].look + '.json')), k + ' has a look of its own');

/* on foot from the moor's trail (where it leaves the den path) through the gate to Corva */
{ const start = [258, 127], corva = bz.spawns.find(s => s.m === 'corva'), seen = new Set([start.join(',')]), q = [start]; let found = false;
  while (q.length && !found) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
    if (seen.has(k) || nx < 232 || ny < 54 || nx >= 308 || ny >= 240) continue; seen.add(k);
    if (Math.max(Math.abs(nx - corva.x), Math.abs(ny - corva.y)) <= 1) { found = true; break; } if (!core.M.blocked(nx, ny)) q.push([nx, ny]); } }
  ok(found, 'you can walk from the moor trail through the iron gate to Corva'); }
{ const railing = bz.objects.filter(o => o.k === 'iron_fence'); ok(railing.length > 150 && railing.every(o => core.M.blocked(o.x, o.y)), 'the iron railing is solid all round (' + railing.length + ' sections)'); }
{ const g = bz.objects.filter(o => /^grave/.test(o.k)); ok(g.every(o => core.M.blocked(o.x, o.y)), 'no grave can be walked through (' + g.length + ')'); }

/* the road and the other zones */
{ const ov = all.filter(z => z.id !== 'sistersbarrow' && !z.under && z.origin[0] < bz.origin[0] + bz.size[0] && bz.origin[0] < z.origin[0] + z.size[0] && z.origin[1] < bz.origin[1] + bz.size[1] && bz.origin[1] < z.origin[1] + z.size[1]);
  ok(!ov.length, 'it overlaps no other zone' + (ov.length ? ': ' + ov.map(z => z.id) : '')); }
{ const { W: WGW, CFG: WC } = require('../tools/castle/mask.js');
  const road = []; for (let y = 0; y < 300; y++) for (let x = 150; x < 420; x++) if (WGW.tileAt(WC.face, x + WC.origin[0], y + WC.origin[1]) === 'c') road.push([x, y]);
  let worst = 1e9; for (const s of bz.spawns) { let d = 1e9; for (const [x, y] of road) d = Math.min(d, Math.max(Math.abs(x - s.x), Math.abs(y - s.y)));
    const md = D.monsters[s.m], reach = ((md.ai && md.ai.leash) || 10) + 4 + 7; worst = Math.min(worst, d - reach); if (md.relentless) worst = -1; }
  ok(worst >= 30, 'the barrow\'s dead and Corva stay ' + worst + ' m clear of the road even at the end of a chase');
  let pond = 0; for (let y = 170; y < 192; y++) for (let x = 338; x < 362; x++) if (WGW.tileAt(WC.face, x + WC.origin[0], y + WC.origin[1]) === '~') pond++;
  ok(pond > 20, 'the pond east of it is still there (' + pond + ' water tiles)'); }
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
