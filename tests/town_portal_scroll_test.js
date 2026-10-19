'use strict';
/* [Claude 2026-10-18] Scroll of town portal (the operator: "a one time use scroll that monsters in the den drop ... about as often as three
   weapons are dropped. ... allow the user to portal back to where they came from by using the town portal. But just once."):
   read in the Hollow Den it takes you to Thornwatch's portal and is used up; in town it refuses and keeps; at the town portal the
   way back is offered, takes you to the very spot, and is gone after; it survives a save; a den clear drops about three.
   node tests/town_portal_scroll_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'thornwatch', 'redmoor', 'hollowden'].map(id => Object.assign({ id }, mod('zone.' + id)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const core = AshCore.create(D, { seed: 'tp-scroll' }), p = core.addPlayer('p1', { name: 'Tester' });
let fails = 0; const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const ticks = n => { const out = []; for (let i = 0; i < n; i++) out.push(...core.tick()); return out; };
const TW = D.rules.portals.find(q => q.id === 'thornwatch'), stone = core.M.npcs.find(n => n.portal === 'thornwatch');
const give = () => { const f = p.inv.findIndex(s => !s); p.inv[f] = { id: 'town_portal_scroll', n: 1 }; return f; };

ok(!!D.items.town_portal_scroll && (D.items.town_portal_scroll.attributes || []).some(a => a.trait_type === 'Town portal') && D.items.town_portal_scroll.model === 'item.scroll', 'the scroll exists and reads as a town portal (' + D.items.town_portal_scroll.name + ')');
/* deep in the den */
p.x = 24330; p.y = 24036; while (core.M.blocked(p.x, p.y)) p.x++; p.path = []; p.act = null; ticks(2);
const at = [p.x, p.y];
core.cmd('p1', { c: 'use', slot: give() }); ticks(2);
ok(p.x === TW.to[0] && p.y === TW.to[1], 'read in the den: out at Thornwatch\'s portal (' + p.x + ',' + p.y + ')');
ok(core.invCount(p, 'town_portal_scroll') === 0, 'and the scroll is used up');
ok(p.tp && p.tp.x === at[0] && p.tp.y === at[1], 'the way back is the very spot it was read (' + (p.tp && p.tp.name) + ')');
/* in town it refuses */
core.cmd('p1', { c: 'use', slot: give() }); ticks(2);
ok(core.invCount(p, 'town_portal_scroll') === 1 && p.x === TW.to[0], 'in town a second scroll refuses and keeps');
/* a save keeps it open */
const sv = core.exportPlayer('p1'); ok(sv.tp && sv.tp.x === at[0], 'a save keeps the portal open');
const c2 = AshCore.create(D, { seed: 'tp-2' }), q2 = c2.addPlayer('p2', sv); ok(q2.tp && q2.tp.x === at[0] && q2.tp.y === at[1], 'and a load reopens it');
/* the town portal offers the way back, once */
p.x = stone.x; p.y = stone.y + 1; while (core.M.blocked(p.x, p.y)) p.y++; p.path = []; core.cmd('p1', { c: 'npc', id: stone.id });
const ev = ticks(4).find(e => e.e === 'portal' && e.p === 'p1');
ok(ev && ev.back, 'the town portal offers the way back (' + (ev && ev.back) + ')');
core.cmd('p1', { c: 'portal', to: 'back' }); ticks(2);
ok(p.x === at[0] && p.y === at[1], 'stepping back lands on the spot in the den');
ok(!p.tp, 'and the portal is closed');
p.x = stone.x; p.y = stone.y + 1; while (core.M.blocked(p.x, p.y)) p.y++; p.path = []; core.cmd('p1', { c: 'npc', id: stone.id });
const ev2 = ticks(4).find(e => e.e === 'portal' && e.p === 'p1'); core.cmd('p1', { c: 'portal', to: 'back' }); ticks(2);
ok(ev2 && !ev2.back && p.x !== at[0], 'just once: no way back the second time');
/* the drop: about three a den clear */
const den = zones.find(z => z.id === 'hollowden'); let per = 0;
for (const s of den.spawns) { const dr = (D.monsters[s.m].drops || []).find(d => d.item === 'town_portal_scroll'); if (dr) per += 1 / dr.one_in; }
ok(per >= 2.5 && per <= 3.8, 'a den clear drops about ' + per.toFixed(1) + ' scrolls (the operator: about 3)');
ok(!(D.monsters.ashling.drops || []).some(d => d.item === 'town_portal_scroll'), 'only the den drops them (not the moor)');
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
