'use strict';
/* Prayer (2026-10-07): the overhead protections, drain, the church altar, bones and burying, and the wraith's spells.
   Each protection stops only its own style: the matrix below sets every prayer against a melee monster, an archer and
   a caster, and wants damage from the two it does not cover. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const XP = D.rules.xp, BIG = XP[60] * 10;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const fighter = (core, id, extra) => { const p = core.addPlayer(id, { xp: Object.assign({ attack: BIG, strength: BIG, defence: XP[3] * 10, hitpoints: XP[70] * 10, prayer: XP[70] * 10 }, extra || {}) }); p.hp = core.maxHp(p); p.retal = false; return p; };

/* ---------- the matrix: prayer x attack style */
const ATTACKERS = {
  melee: { pick: (c) => c.S.mobs.find(m => m.key === 'wolf'), dist: 1, prep: () => { } },
  ranged: { pick: (c) => c.S.mobs.find(m => m.key === 'bandit' && m.carry && m.carry.arrows_t1), dist: 4, prep: (m) => { m.carry.arrows_t1 = 12; } },
  magic: { pick: (c) => c.S.mobs.find(m => m.key === 'wraith'), dist: 3, prep: () => { } }
};
const PRAYER_FOR = { melee: 'protect_from_melee', ranged: 'protect_from_missiles', magic: 'protect_from_magic' };
function bout(prayer, style, seed) {
  const core = AshCore.create(D, { seed }), p = fighter(core, 'p1'), A = ATTACKERS[style], m = A.pick(core);
  if (!m) return null;
  if (prayer) { core.cmd('p1', { c: 'pray', id: prayer, on: true }); core.tick(); }
  p.x = m.x + A.dist; p.y = m.y; p.path = [];
  const r = { hits: 0, dmg: 0, raw: 0, cls: {}, binds: 0, on: prayer ? !!p.pray[prayer] : true };
  for (let i = 0; i < 200; i++) {
    p.pp = 70; if (p.hp < 30) p.hp = core.maxHp(p); p.path = []; p.act = null;
    m.tgt = 'p1'; m.hp = Math.max(m.hp, 10); A.prep(m);
    for (const e of core.tick()) {
      if (e.e === 'hit' && e.dst === 'p1') { r.hits++; r.dmg += e.dmg; r.raw += e.raw || 0; r.cls[e.cls] = (r.cls[e.cls] || 0) + 1; }
      if (e.e === 'pfx' && e.p === 'p1' && e.on) r.binds++;
    }
  }
  return r;
}
for (const prayer of [null, 'protect_from_melee', 'protect_from_missiles', 'protect_from_magic']) {
  for (const style of ['melee', 'ranged', 'magic']) {
    const r = bout(prayer, style, 'mx-' + prayer + '-' + style), name = (prayer || 'no prayer') + ' vs ' + style;
    if (!r) { ok(false, name + ': no attacker of that style in the world'); continue; }
    const kinds = Object.keys(r.cls).join(',');
    ok(r.on && r.hits > 0 && kinds === style, name + ': ' + r.hits + ' ' + kinds + ' attacks');
    if (prayer && PRAYER_FOR[style] === prayer) ok(r.dmg === 0 && r.raw > 0 && (style !== 'magic' || r.binds === 0), name + ': blocked - ' + r.raw + ' rolled, 0 taken' + (style === 'magic' ? ', 0 binds' : ''));
    else ok(r.dmg > 0 && (style !== 'magic' || r.binds > 0), name + ': lands - ' + r.dmg + ' damage taken' + (style === 'magic' ? ', ' + r.binds + ' binds' : ''));
  }
}

/* ---------- only one overhead at a time */
{
  const core = AshCore.create(D, { seed: 'ex' }), p = fighter(core, 'p1');
  core.cmd('p1', { c: 'pray', id: 'protect_from_melee', on: true }); core.tick();
  core.cmd('p1', { c: 'pray', id: 'protect_from_missiles', on: true }); core.tick();
  ok(p.pray.protect_from_missiles && !p.pray.protect_from_melee, 'overheads are exclusive: Missiles replaced Melee');
  core.cmd('p1', { c: 'pray', id: 'protect_from_magic', on: true }); core.tick();
  ok(Object.keys(p.pray).join() === 'protect_from_magic', 'and Magic replaced Missiles');
  core.cmd('p1', { c: 'pray', id: 'thick_skin', on: true }); core.tick();
  ok(!p.pray.thick_skin, 'a "coming soon" prayer cannot be switched on');
}

/* ---------- drain: points = level, a protection costs a point every 5 ticks, more levels last longer */
{
  let last = 0;
  for (const L of [1, 10, 30, 70, 99]) {
    const core = AshCore.create(D, { seed: 'dr' + L }), p = core.addPlayer('p1', { xp: { prayer: L > 1 ? XP[L] * 10 : 0 } });
    core.cmd('p1', { c: 'pray', id: 'protect_from_magic', on: true }); core.tick();
    let t = 1; while (p.pray.protect_from_magic && t < 6000) { core.tick(); t++; }
    ok(p.pp === 0 && !p.pray.protect_from_magic && t > last && t === core.prayTicks(core.S.players.p1, L, 12), 'Prayer ' + L + ': ' + L + ' points last ' + (t * 0.6).toFixed(1) + 's, then the prayer goes off');
    last = t;
  }
  const core = AshCore.create(D, { seed: 'flick' }), p = core.addPlayer('p1', { xp: { prayer: XP[20] * 10 } });
  for (let i = 0; i < 100; i++) { core.cmd('p1', { c: 'pray', id: 'protect_from_melee', on: i % 2 === 0 }); core.tick(); }
  ok(p.pp < 20 - 5, 'flicking a prayer off and on still drains (20 -> ' + p.pp + ' in 100 ticks)');
  const sv = core.exportPlayer('p1'), c2 = AshCore.create(D, { seed: 'flick2' }), q = c2.addPlayer('p1', sv);
  ok(q.pp === p.pp && !Object.keys(q.pray).length, 'a reload keeps the drained points (' + q.pp + ') and no prayer on');
}

/* ---------- off means off at once: switched off, or out of points */
{
  const core = AshCore.create(D, { seed: 'off' }), p = fighter(core, 'p1'), w = core.S.mobs.find(m => m.key === 'wraith');
  p.x = w.x + 3; p.y = w.y;
  const next = () => { for (let i = 0; i < 300; i++) { w.tgt = 'p1'; w.hp = 30; if (p.hp < 30) p.hp = core.maxHp(p); p.path = []; p.act = null; for (const e of core.tick()) if (e.e === 'hit' && e.dst === 'p1' && e.raw > 0) return e; } return null; };
  core.cmd('p1', { c: 'pray', id: 'protect_from_magic', on: true }); core.tick();
  core.cmd('p1', { c: 'pray', id: 'protect_from_magic', on: false });
  const a = next(); ok(a && !a.prot && a.dmg === a.raw, 'switched off: the very next bolt lands in full (' + (a && a.dmg) + ')');
  core.cmd('p1', { c: 'pray', id: 'protect_from_magic', on: true }); core.tick(); p.pp = 1; p.pd = 0;
  for (let i = 0; i < 20 && p.pray.protect_from_magic; i++) { w.tgt = 0; core.tick(); }
  const b = next(); ok(b && !b.prot && b.dmg === b.raw && p.pp === 0 && !p.pray.protect_from_magic, 'out of points: off by itself, and the next bolt lands in full (' + (b && b.dmg) + ')');
  p.pfx = { bind: core.S.t + 20 }; p.pp = 70;
  core.cmd('p1', { c: 'pray', id: 'protect_from_magic', on: true }); core.tick();
  ok(!p.pfx, 'switching Protect from Magic on breaks a bind already on you');
}

/* ---------- the church altar, bones and burying */
{
  const core = AshCore.create(D, { seed: 'altar' }), p = fighter(core, 'p1', { prayer: XP[20] * 10 });
  p.pp = 3; p.x = 29; p.y = 55;
  const n = core.M.nodeAt(core.idx(29, 58)); ok(n && n.kind === 'altar', 'the church altar is at 29,58');
  core.cmd('p1', { c: 'gather', x: 29, y: 58 }); for (let i = 0; i < 30; i++) core.tick();
  ok(p.pp === 20, 'praying at the altar restores every point (' + p.pp + '/20)');
  const rat = core.S.mobs.find(m => m.key === 'rat'); p.x = rat.x + 1; p.y = rat.y; rat.hp = 1;
  core.cmd('p1', { c: 'attack', uid: rat.uid }); let at = null;
  for (let i = 0; i < 80 && !at; i++) for (const e of core.tick()) if (e.e === 'die' && e.mob === rat.uid) at = [rat.x, rat.y];
  for (let i = 0; i < 5; i++) core.tick();   /* the loot falls once the death animation is over */
  const g = at && core.S.ground.find(q => q.id === 'bones' && q.x === at[0] && q.y === at[1]); ok(!!g, 'a giant rat leaves bones where it falls');
  if (g) { core.cmd('p1', { c: 'take', uid: g.uid }); for (let i = 0; i < 30; i++) core.tick(); }
  const slot = p.inv.findIndex(s => s && s.id === 'bones'), x0 = p.xp.prayer;
  core.cmd('p1', { c: 'use', slot }); core.tick();
  ok(slot >= 0 && p.xp.prayer - x0 === 45 && core.invCount(p, 'bones') === 0, 'burying bones gives 4.5 Prayer XP');
  ok(core.item('big_bones').buryXp === 150 && D.monsters.timber_wolf.bones === 'big_bones', 'timber wolves leave big bones, 15 XP each');
  ok(core.item('bones').category === 'resource', 'bones are a resource, so they are issued as @ashvale tokens and go back to @ashvale when buried');
}

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
