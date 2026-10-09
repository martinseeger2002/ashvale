/* The ruined keep: a chained dragon that does not hunt, stays on its pole, and shows each blow before it lands. */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort((a, b) => a < b ? -1 : 1).map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const core = AshCore.create(D, { seed: 'dragon' });
const md = D.monsters.chain_dragon;
ok(md && md.chain === 4 && md.windup === 4 && md.aggro === 0 && md.drops[0].item === 'dragon_cape' && md.drops[0].one_in === 5 && md.bones === 'dragon_bones', 'the chained dragon is a slow, non-aggressive fight with a 1 in 5 cape');
const pool = (md.drops.find(d => d.any) || {}).any || [];
ok(md.drops.some(d => d.one_in === 10 && d.any && d.any.length === 9) && pool.every(id => core.item(id) && core.item(id).tier === 5), 'one kill in ten drops one random adamant piece (' + pool.join(', ') + ')');
ok(core.item('dragon_cape').magic === 8 && core.item('dragon_cape').ward === 'chain_dragon' && core.item('dragon_bones').buryXp === 720 && core.item('bones').buryXp === 45, 'dragon bones bury for far more Prayer than ordinary bones, and the cape has Magic +8');
const dr = core.S.mobs.find(m => m.key === 'chain_dragon');
ok(dr && dr.x === -54 && dr.y === -99, 'it stands at the pole in the ruined keep (' + (dr ? dr.x + ',' + dr.y : 'missing') + ')');
const p = core.addPlayer('p1', { xp: { attack: 5000, strength: 5000, defence: 5000, hitpoints: 8000, magic: 5000, prayer: 5000 } });
p.x = -54; p.y = -98; p.hp = core.maxHp(p);
for (let i = 0; i < 40; i++) core.tick();
ok(!dr.tgt && Math.max(Math.abs(dr.x + 54), Math.abs(dr.y + 99)) <= 4, 'it wanders the chain and does not hunt (' + dr.x + ',' + dr.y + ')');
p.x = dr.x; p.y = dr.y + 1;
let told = null, hurt = false;
core.cmd('p1', { c: 'attack', uid: dr.uid });
for (let i = 0; i < 12 && !told; i++) {
  const ev = core.tick();
  if (ev.some(e => e.e === 'hit' && e.dst === 'p1')) hurt = true;
  const t = ev.find(e => e.e === 'tell' && e.mob === dr.uid);
  if (t) told = t.mode;
}
ok(told === 'melee' && !hurt, 'the first blow is telegraphed as a bite before any damage (' + told + ', hurt ' + hurt + ')');
p.pray = { protect_from_magic: 1 }; dr.form = 1; dr.wind = null; dr.atk = 0; p.hp = core.maxHp(p);
let magic = null;
for (let i = 0; i < 16 && !magic; i++) {
  const ev = core.tick();
  magic = ev.find(e => e.e === 'hit' && e.dst === 'p1' && e.cls === 'magic') || magic;
}
ok(magic && magic.dmg === 0 && magic.prot, 'Protect from Magic stops the dragonfire');
/* A miss is also 0 damage, so each case is retried until the roll would have hurt. Protection is the prot flag and a zeroed blow; anything else must keep that damage. */
function blow(mode, pray) {
  p.eq.cape = null; p.pray = pray ? { [pray]: 1 } : {}; p.pp = 50; p.dead = 0; p.path = []; p.act = null;
  for (let n = 0; n < 80; n++) {
    dr.dead = 0; dr.hp = 280; dr.tgt = 'p1'; dr.back = 0; dr.wind = { mode, at: core.S.t + 1 }; dr.atk = 0;
    dr.x = -54; dr.y = -99; p.x = -54; p.y = -98; p.hp = core.maxHp(p);
    const ev = core.tick();
    const h = ev.find(e => e.e === 'hit' && e.dst === 'p1' && e.cls === (mode === 'magic' ? 'magic' : 'melee'));
    if (h && h.raw > 0) return h;
  }
  return null;
}
let h = blow('melee', 'protect_from_melee');
ok(h && h.prot === 1 && h.dmg === 0, 'Protect from Melee stops a bite that would have hit (' + (h ? h.raw : 'none') + ')');
h = blow('melee', 'protect_from_magic');
ok(h && !h.prot && h.dmg === h.raw && h.dmg > 0, 'Protect from Magic does not stop a bite (' + (h ? h.dmg + '/' + h.raw : 'none') + ')');
h = blow('melee', null);
ok(h && !h.prot && h.dmg === h.raw && h.dmg > 0, 'no prayer does not stop a bite (' + (h ? h.dmg + '/' + h.raw : 'none') + ')');
h = blow('magic', 'protect_from_magic');
ok(h && h.prot === 1 && h.dmg === 0, 'Protect from Magic stops dragonfire that would have hit (' + (h ? h.raw : 'none') + ')');
h = blow('magic', 'protect_from_melee');
ok(h && !h.prot && h.dmg === h.raw && h.dmg > 0, 'Protect from Melee does not stop dragonfire (' + (h ? h.dmg + '/' + h.raw : 'none') + ')');
h = blow('magic', null);
ok(h && !h.prot && h.dmg === h.raw && h.dmg > 0, 'no prayer does not stop dragonfire (' + (h ? h.dmg + '/' + h.raw : 'none') + ')');
p.pray = {}; p.eq.cape = { id: 'dragon_cape', n: 1 };
h = null;
for (let n = 0; n < 80 && !(h && h.raw > 0); n++) {
  dr.dead = 0; dr.hp = 280; dr.tgt = 'p1'; dr.back = 0; dr.wind = { mode: 'magic', at: core.S.t + 1 }; dr.atk = 0;
  dr.x = -54; dr.y = -99; p.x = -54; p.y = -98; p.hp = core.maxHp(p); p.dead = 0;
  h = core.tick().find(e => e.e === 'hit' && e.dst === 'p1' && e.cls === 'magic') || null;
}
ok(h && h.raw > 0 && h.dmg === 0 && h.prot === 1, 'the dragon cape stops dragonfire that would have hit (' + (h ? h.raw : 'none') + ')');
h = null;
for (let n = 0; n < 80 && !(h && h.raw > 0); n++) {
  dr.dead = 0; dr.hp = 280; dr.tgt = 'p1'; dr.back = 0; dr.wind = { mode: 'melee', at: core.S.t + 1 }; dr.atk = 0;
  dr.x = -54; dr.y = -99; p.x = -54; p.y = -98; p.hp = core.maxHp(p); p.dead = 0; p.pray = {};
  h = core.tick().find(e => e.e === 'hit' && e.dst === 'p1' && e.cls === 'melee') || null;
}
ok(h && !h.prot && h.dmg === h.raw && h.dmg > 0, 'the dragon cape does not stop a bite (' + (h ? h.dmg + '/' + h.raw : 'none') + ')');
console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
