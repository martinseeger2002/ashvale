/* fight_sim.js - Thornwatch's monsters against the avatar they are tuned for (2026-10-18: "balanced for a level 200+ Ashvale
   avatar"): total level ~220 - attack, strength, defence 30, hitpoints 32, ranged 15, magic 10, prayer 15, the rest 5-10 - wearing
   tier-4 sword and tier-3 armour and shield, no food, no prayer. Each monster is fought alone (its pack held back) TRIALS times from
   full health; prints how often the avatar wins, how long it takes, and how much of the avatar's health it costs.
     node tools/thornwatch/fight_sim.js [attack=30] [gear=4,3] */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const AshCore = require(path.join(ROOT, 'src', 'core.js'));
const mod = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n + '.json'), 'utf8')).data;
const A = +(process.argv[2] || 30), [WT, AT] = (process.argv[3] || '4,3').split(',').map(Number), TRIALS = 24;
const KEYS = process.env.KEYS ? process.env.KEYS.split(',') : ['quill_rat', 'ashling', 'moor_walker', 'den_ashling', 'den_shaman', 'den_walker', 'den_brute', 'cinderhide'];
const rows = [];
for (const key of KEYS) {
  let wins = 0, tk = 0, lost = 0, ate = 0;
  for (let t = 0; t < TRIALS; t++) {
    const mons = JSON.parse(JSON.stringify(mod('monsters').monsters)); for (const k in mons) { mons[k].aggro = 0; delete mons[k].ai; }
    const z = Object.assign({ id: 'hollowden' }, mod('zone.hollowden')); z.spawns = [{ m: key, x: 24328, y: 24036 }];
    const D = { items: mod('items').items, monsters: mons, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: [Object.assign({ id: 'village' }, mod('zone.village')), z], globecfg: mod('globecfg') };
    const XP = D.rules.xp, L = { attack: A, strength: A, defence: A, hitpoints: A + 2, ranged: 15, magic: 10, prayer: 15, dexterity: 5, speechcraft: 5, woodcutting: 10, mining: 10, fishing: 10, cooking: 10, firemaking: 8 };
    const xp = {}; for (const s in L) xp[s] = XP[L[s]] * 10;
    const core = AshCore.create(D, { seed: 'sim-' + key + '-' + t }), p = core.addPlayer('p1', { xp });
    p.eq.weapon = { id: 'sword_t' + WT, n: 1 }; for (const s of ['head', 'body', 'legs', 'shield']) p.eq[s] = { id: (s === 'head' ? 'helmet' : s) + '_t' + AT, n: 1 };
    p.hp = core.maxHp(p); const hp0 = p.hp;
    const m = core.S.mobs.find(q => q.key === key);
    p.x = m.x; p.y = m.y + 1; if (core.M.blocked(p.x, p.y)) p.y = m.y - 1; p.path = []; p.act = null;
    core.cmd('p1', { c: 'attack', uid: m.uid });
    let n = 0, eats = 0; const FOOD = +(process.env.FOOD || 0), HEAL = +(process.env.HEAL || 0); for (; n < 3000 && !m.dead && !p.dead && p.hp > 0; n++) { core.tick(); if (eats < FOOD && p.hp > 0 && p.hp < hp0 * 0.45) { p.hp = Math.min(hp0, p.hp + HEAL); eats++; n += 3; } if (n % 20 === 19 && !p.act && !m.dead) core.cmd('p1', { c: 'attack', uid: m.uid }); }
    if (m.dead) { wins++; tk += n; lost += (hp0 - Math.max(0, p.hp)) / hp0; ate += eats; } else lost += 1;
  }
  const md = mod('monsters').monsters[key];
  rows.push([key, md.level, md.hp, wins + '/' + TRIALS, wins ? (tk / wins * 0.6).toFixed(0) + ' s' : '-', Math.round(lost / TRIALS * 100) + '% hp', wins ? (ate / wins).toFixed(1) + ' eaten' : '']);
}
console.log('avatar: attack/strength/defence ' + A + ', sword_t' + WT + ', armour t' + AT);
for (const r of rows) console.log(r.map(String).map((s, i) => s.padEnd([14, 4, 5, 7, 7, 8][i])).join(' '));
