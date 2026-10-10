'use strict';
/* Wooden sign on the ruined keep: total chained-dragon kills and a top 10 by character name. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort().map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const core = AshCore.create(D, { seed: 'sign' });
const sign = core.signAt(-56, -94);
ok(sign && sign.k === 'wsign' && sign.board === 'dragon' && sign.face === 's', 'a wooden sign stands outside the south wall of the ruined keep');
ok(sign && sign.y === -94 && sign.x === -56, 'it is outside the door, at -56, -94');
const empty = core.scoresOf('chain_dragon');
ok(empty.total === 0 && empty.top.length === 0, 'the board starts blank');
const none = core.scoreRead('chain_dragon');
ok(none.some(l => /slain 0 time/.test(l)) && none.some(l => /No names/.test(l)), 'reading it says none have been slain yet');

core.scoreKill('chain_dragon', 'Wren');
core.scoreKill('chain_dragon', 'Wren');
core.scoreKill('chain_dragon', 'Aldric');
let s = core.scoresOf('chain_dragon');
ok(s.total === 3 && s.top[0][0] === 'Wren' && s.top[0][1] === 2 && s.top[1][0] === 'Aldric' && s.top[1][1] === 1, 'two killers: Wren leads with 2, total 3');
ok(core.mergeScores('chain_dragon', { Wren: 1, Aldric: 5 }) === 1 && core.scoresOf('chain_dragon').names.Wren === 2, 'a merge keeps the higher count per name, never summing');
s = core.scoresOf('chain_dragon');
ok(s.names.Aldric === 5 && s.total === 7, 'Aldric rises to 5 and the total is the sum of names');

for (let i = 0; i < 12; i++) core.mergeScores('chain_dragon', { ['Hero' + (i < 10 ? '0' : '') + i]: 1 });
s = core.scoresOf('chain_dragon');
ok(s.top.length === 10, 'the board lists at most ten names');
ok(s.top[0][0] === 'Aldric' && s.top[0][1] === 5, 'the leader is still first');
ok(s.total === 7 + 12, 'names past tenth still count in the total slain');
core.setScoreTotal('chain_dragon', 80);
ok(core.scoresOf('chain_dragon').total === 80, 'the Bank\'s global total is what the sign shows when it is higher than local names');

const p = core.addPlayer('p1', { name: 'Maren', xp: { attack: 50000, strength: 50000, defence: 50000, hitpoints: 8000, magic: 50000, prayer: 5000 } });
ok(p.name === 'Maren', 'the killer is stored under the character name');
const dr = core.S.mobs.find(m => m.key === 'chain_dragon');
p.x = dr.x; p.y = dr.y + 1; p.hp = core.maxHp(p); p.spawnT = -100;
p.pray = { protect_from_melee: 1, protect_from_magic: 1 };
dr.hp = 1; dr.tgt = 0; dr.back = 0; dr.wind = null;
core.cmd('p1', { c: 'attack', uid: dr.uid });
let died = 0;
for (let i = 0; i < 40; i++) { p.hp = core.maxHp(p); for (const e of core.tick()) if (e.e === 'die' && e.mob === dr.uid) died++; if (dr.dead) break; }
ok(died && dr.dead, 'the chained dragon can fall without putting Maren in danger (protections, full hitpoints each tick)');
ok(core.scoresOf('chain_dragon').names.Maren === 1, 'her kill is carved on the board under Maren');
ok((p.kills.chain_dragon || 0) === 1, 'her own kill count matches');
const save = core.exportPlayer('p1');
ok(save.kills && save.kills.chain_dragon === 1, 'the save keeps her dragon kills so a later game can seed the board');

core.mergeScores('chain_dragon', { Guest: 0, '': 9, '!!': 4 });
ok(core.scoresOf('chain_dragon').names.Guest == null, 'empty or junk names are not carved');

const read = core.scoreRead('chain_dragon');
ok(read[0].indexOf('slain') >= 0 && read.some(l => /^1\. Aldric/.test(l)), 'Read lists the total and a numbered top ten');
const board = core.scoreBoard('chain_dragon');
ok(board[0] === 'DRAGON KILLERS' && /Slain \d+ times/.test(board[1]), 'the painted board shows the title and the total');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
