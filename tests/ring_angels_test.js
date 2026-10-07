/* ring_angels_test.js - sadfrog's Ring of Angels and Iria (merged 2026-10-06): worn, a hit that leaves you under 1/5 of your
   hitpoints carries you to the Ashvale portal, then it rests (6000 ticks, 1000 after Iria's second quest); Iria stands in
   Whisperwood with her two quests */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\.(village|whisperwood)\.json$/.test(f)).map(f => Object.assign({ id: f.split('.')[1] }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones };
const c = AshCore.create(D, { seed: 'angels' }), p = c.addPlayer('p1', null);
const ww = zones.find(z => z.id === 'whisperwood'), iria = (ww.npcs || []).find(n => n.id === 'iria');
ok(iria && iria.quests.join() === 'iria_supper,angel_gift', 'Iria stands in Whisperwood with A Meal for Iria and The Gift of Angels');
ok(D.quests.quests.iria_supper.steps[0].goal.cook === 'chicken_cooked', 'her first quest is a cooking goal');
p.inv[0] = { id: 'ring_angels', n: 1 }; c.cmd('p1', { c: 'equip', slot: 0 }); c.tick();
ok(p.eq.ring && p.eq.ring.id === 'ring_angels', 'the ring goes on the ring slot');
const far = [ww.origin[0] + 20, ww.origin[1] + 20]; p.x = far[0]; p.y = far[1];
const mx = p.hp; p.hp = Math.floor(mx / 5);   /* the next hit leaves them under a fifth */
c.applyHitForTest ? c.applyHitForTest('p1', 1) : null;
let saved = false;
if (!c.applyHitForTest) {   /* no hook: let a strong monster hit them */
  const wolf = c.S.mobs.find(m => m.key === 'timber_wolf' || m.key === 'bandit');
  if (wolf) { wolf.x = p.x + 1; wolf.y = p.y; c.cmd('p1', { c: 'attack', uid: wolf.uid }); }
  for (let i = 0; i < 80 && !saved; i++) { c.tick(); saved = c.S.ev.some(e => e.e === 'angels'); }
} else saved = c.S.ev.some(e => e.e === 'angels');
ok(saved && !p.dead && p.hp >= 1, 'a hit under a fifth of hitpoints: the ring carries them away, alive (hp ' + p.hp + '/' + mx + ')');
ok(Math.abs(p.x - far[0]) + Math.abs(p.y - far[1]) > 10, 'they are somewhere else now (' + p.x + ',' + p.y + ')');
ok(p.cd && p.cd.ring_angels - c.S.t > 5000, 'then it rests about an hour (' + (p.cd.ring_angels - c.S.t) + ' ticks)');
process.exit(fails ? 1 : 0);
