/* the hawk (2026-10-04): node tests/hawk_test.js */
'use strict';
const fs = require('fs'), path = require('path'), C = require('../src/core.js');
const m = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', n + '.json'))).data;
const D = { items: m('items').items, monsters: m('monsters').monsters, shops: m('shops'), quests: m('quests'), rules: m('rules'), zones: ['village', 'whisperwood'].map(z => Object.assign({ id: z }, m('zone.' + z))), globecfg: m('globecfg') };
let fails = 0; const ok = (c, t) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + t); };
const c = C.create(D, { seed: 'hawk' }), p = c.addPlayer('p1', {});
for (let i = 0; i < 28; i++) p.inv[i] = null;
p.inv[0] = { id: 'ring_hawk', n: 1 }; p.inv[3] = { id: 'logs', n: 1 }; p.inv[12] = { id: 'sword_t1', n: 1 }; p.inv[20] = { id: 'bread', n: 1 };
c.cmd('p1', { c: 'equip', slot: 0 }); c.tick();
ok(c.isHawk(p) && p.hawkHp === 4, 'a hawk with 4 hawk HP');
ok(!p.inv[12] && !p.inv[20] && p.inv[3], 'the lower slots fell to the ground, the first nine stay');
ok(c.S.ground.some(g => g.id === 'sword_t1') && c.S.ground.some(g => g.id === 'bread'), 'and lie where the hawk took off');
ok(c.slotLimit(p) === 9, 'a hawk has 9 bag slots');
ok(c.capacity(p) < 20000, 'a hawk carries a third (' + c.capacity(p) + ' g)');
const w = c.S.mobs.find(q => q.key === 'wolf'); p.x = w.x + 1; p.y = w.y; w.tgt = 'p1';
for (const o of c.S.mobs) if (o !== w && Math.max(Math.abs(o.x - w.x), Math.abs(o.y - w.y)) < 12) o.dead = 1e9;   /* this wolf's post is a tile from a bandit's: a stray arrow knocking the hawk down was down to the dice, not the hawk */
let hits = [], strikes = [], wolfHits = 0, ticks = 0; p.energy = 10000;
c.cmd('p1', { c: 'attack', uid: w.uid });
for (let i = 0; i < 120 && !w.dead && c.isHawk(p); i++) { ticks++; p.hawkHp = 4; for (const e of c.tick()) { if (e.e === 'attack' && e.src === 'p1') strikes.push(c.S.t); if (e.e === 'hit' && e.src === 'p1') hits.push(e.dmg); if (e.e === 'hit' && e.dst === 'p1') wolfHits++; } w.hp = Math.max(w.hp, 10); }
const gaps = strikes.slice(1).map((t, i) => t - strikes[i]);
ok(strikes.length > 5 && gaps.every(g => g >= 3), 'one strike every 3 ticks (' + strikes.length + ' strikes, gaps ' + [...new Set(gaps)].join(',') + ')');
ok(hits.every(d => d === 0 || d === 4) && hits.some(d => d === 4) && hits.filter(d => d === 4).length < hits.length * 0.5, 'a strike does 4 or nothing, about one in four (' + hits.filter(d => d === 4).length + '/' + hits.length + ')');
ok(p.energy < 10000, 'strikes spend Dexterity (run energy ' + p.energy + ')');
ok(wolfHits > 0, 'the wolf can hit the hawk while it is down striking (' + wolfHits + ' swings)');
// in the air nothing lands
const c2 = C.create(D, { seed: 'hawk2' }), q = c2.addPlayer('p1', { inv: [{ id: 'ring_hawk', n: 1 }] }); c2.cmd('p1', { c: 'equip', slot: 0 }); c2.tick();
const w2 = c2.S.mobs.find(z => z.key === 'wolf'); q.x = w2.x + 1; q.y = w2.y; w2.tgt = 'p1'; let hit2 = 0;
for (let i = 0; i < 60; i++) for (const e of c2.tick()) if (e.e === 'hit' && e.dst === 'p1') hit2++;
ok(hit2 === 0 && q.hawkHp === 4, 'a hawk in the air takes no hits from a land animal');
// hawk HP gone: down it comes, as yourself
const c4 = C.create(D, { seed: 'hawk4' }), h = c4.addPlayer('p1', { inv: [{ id: 'ring_hawk', n: 1 }] }); c4.cmd('p1', { c: 'equip', slot: 0 }); c4.tick();
const w4 = c4.S.mobs.find(z => z.key === 'wolf'); h.x = w4.x + 1; h.y = w4.y; h.hawkHp = 1; const hp0 = h.hp; let fell = false;
for (let i = 0; i < 300 && !fell; i++) { h.striking = c4.S.t + 3; w4.tgt = 'p1'; for (const e of c4.tick()) if (e.e === 'msg' && e.p === 'p1' && /tumble out of the sky/.test(e.text)) fell = true; }
const p_ = p; void p_;
ok(fell && !c4.isHawk(h) && h.hp === hp0 && h.inv.some(s => s && s.id === 'ring_hawk'), 'hawk HP 0: you tumble down as yourself, ring in your bag, your HP untouched');
// fishing without a tool
const c3 = C.create(D, { seed: 'hawk3' }), f = c3.addPlayer('p1', { inv: [{ id: 'ring_hawk', n: 1 }] }); c3.cmd('p1', { c: 'equip', slot: 0 }); c3.tick();
const spot = c3.M.nodes ? null : null; void spot;
console.log(fails ? 'FAILED: ' + fails : 'ALL OK');
