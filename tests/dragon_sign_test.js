'use strict';
/* Wooden sign on the ruined keep: total chained-dragon kills and a top 10 by arcade @name.
   The @ashvale Bank is the only place the board is kept (2026-10-12): a game reports WHO killed the dragon,
   never a count, and what it shows is exactly the rows the Bank last answered. */
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
const outside = core.passageAt(-54, -94), inside = core.passageAt(-54, -96);
ok(outside && inside && outside.k === 'keepladder' && inside.k === 'keepladder', 'a ladder on each side is the only entrance over the closed keep wall');
ok(core.M.blocked(-54, -95) && !core.inReach(-54, -94, -54, -96, 6), 'the south wall is closed and blocks long-range attacks through the entrance');
const climber = core.addPlayer('climber', { name: 'Climber' });
climber.x = -54; climber.y = -93;
core.cmd('climber', { c: 'enter', x: -54, y: -94 });
for (let i = 0; i < 8 && climber.y !== -96; i++) core.tick();
ok(climber.x === -54 && climber.y === -96, 'the outside ladder carries a player over the wall into the keep');
core.cmd('climber', { c: 'enter', x: -54, y: -96 });
for (let i = 0; i < 8 && climber.y !== -94; i++) core.tick();
ok(climber.x === -54 && climber.y === -94, 'the inside ladder carries a player back over the wall');
const empty = core.scoresOf('chain_dragon');
ok(empty.total === 0 && empty.top.length === 0, 'the board starts blank');
const none = core.scoreRead('chain_dragon');
ok(none.some(l => /slain 0 time/.test(l)) && none.some(l => /No names/.test(l)), 'reading it says none have been slain yet');

/* a game tells the Bank about a kill and keeps no board of its own */
core.S.ev = [];
core.scoreKill('chain_dragon', 'Wren', 'me');
ok(core.S.ev.some(e => e.e === 'score' && e.key === 'chain_dragon' && e.name === 'Wren' && e.p === 'me'), 'a kill is reported as one kill by that name, naming the player it happened to');
ok(core.scoresOf('chain_dragon').total === 0, 'nothing is added to the board here: the count is the Bank\'s to keep');

core.setScores('chain_dragon', { Wren: 2, Aldric: 1 });
let s = core.scoresOf('chain_dragon');
ok(s.total === 3 && s.top[0][0] === 'Wren' && s.top[0][1] === 2 && s.top[1][0] === 'Aldric' && s.top[1][1] === 1, 'the Bank\'s answer is the board: Wren leads with 2, total 3');
core.setScores('chain_dragon', { Wren: 1, Aldric: 5 });
s = core.scoresOf('chain_dragon');
ok(s.names.Wren === 1 && s.names.Aldric === 5 && s.total === 6, 'the answer replaces the board, so a number the Bank no longer holds is gone');
const many = {}; for (let i = 0; i < 12; i++) many['Hero' + (i < 10 ? '0' : '') + i] = 1; many.Aldric = 5;
core.setScores('chain_dragon', many);
s = core.scoresOf('chain_dragon');
ok(s.top.length === 10, 'the board lists at most ten names');
ok(s.top[0][0] === 'Aldric' && s.top[0][1] === 5, 'the leader is still first');
ok(s.total === 5 + 12, 'names past tenth still count in the total slain');
core.setScores('chain_dragon', {});
s = core.scoresOf('chain_dragon');
ok(s.total === 0 && s.top.length === 0 && core.scoreRead('chain_dragon').some(l => /No names/.test(l)), 'a board the Bank cleared reads blank, whatever the characters have done');

const p = core.addPlayer('p1', { name: 'Maren', xp: { attack: 50000, strength: 50000, defence: 50000, hitpoints: 8000, magic: 50000, prayer: 5000 } });
ok(p.name === 'Maren', 'the killer is stored under the character name');
const dr = core.S.mobs.find(m => m.key === 'chain_dragon');
p.x = dr.x; p.y = dr.y + 1; p.hp = core.maxHp(p); p.spawnT = -100;
p.pray = { protect_from_melee: 1, protect_from_magic: 1 };
dr.hp = 1; dr.tgt = 0; dr.back = 0; dr.wind = null;
core.cmd('p1', { c: 'attack', uid: dr.uid });
let died = 0; const told = [], by = {};
for (let i = 0; i < 40; i++) { p.hp = core.maxHp(p); for (const e of core.tick()) { if (e.e === 'die' && e.mob === dr.uid) died++; if (e.e === 'score' && e.key === 'chain_dragon') { told.push(e.name); by[e.name] = e.p; } } if (dr.dead) break; }
ok(died && dr.dead, 'the chained dragon can fall without putting Maren in danger (protections, full hitpoints each tick)');
ok(told.indexOf('Maren') >= 0, 'her kill is told to the Bank under Maren');
ok(by.Maren === 'p1', 'and it names which player killed, so exactly one game tells the Bank and not every page that watched');
ok(core.scoresOf('chain_dragon').names.Maren == null, 'and no count for her appears on the sign until the Bank answers');
ok(core.scoreKill('chain_dragon', 'Adventurer') === 0, 'the default Adventurer is never reported');
ok(core.scoreKill('chain_dragon', '@yourfirstname') === 1, 'a kill is reported under the arcade @name');
ok((p.kills.chain_dragon || 0) === 1, 'her own kill count is still kept, for her quests and records');
const save = core.exportPlayer('p1');
ok(save.kills && save.kills.chain_dragon === 1, 'the save keeps her dragon kills - as her record, never to seed a board');

core.setScores('chain_dragon', { Guest: 0, '': 9, '!!': 4 });
ok(core.scoresOf('chain_dragon').names.Guest == null && core.scoresOf('chain_dragon').total === 0, 'empty or junk names are not carved');

core.setScores('chain_dragon', { Aldric: 5, Wren: 2, Maren: 1 });
const read = core.scoreRead('chain_dragon');
ok(read[0].indexOf('slain') >= 0 && read.some(l => /^1\. Aldric/.test(l)), 'Read lists the total and a numbered top ten');
const board = core.scoreBoard('chain_dragon');
ok(board[0] === 'DRAGON KILLERS' && /Slain \d+ times/.test(board[1]), 'the painted board shows the title and the total');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
