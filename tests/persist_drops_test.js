/* persist_drops_test.js - what stays where it fell, and the @ashvale Bank's persisted drops (2026-10-06: "Gold, and
   valuable items should stay there until somebody picks them up"; 100 GOLD of value; "All teleport or rune stone must
   always persist") */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const core = AshCore.create(D, { seed: 'persist' }), I = core.item;
const stone = Object.keys(D.items).find(k => I(k) && I(k).teleport);
ok(core.persists('coins', 1), 'a single Gold persists');
ok(!core.persists('helmet_t1', 1) && I('helmet_t1').value < 100, 'a bronze helm (worth ' + I('helmet_t1').value + ') does not');
ok(core.persists('helmet_t3', 1) && I('helmet_t3').value >= 100, 'a steel-tier helm (worth ' + I('helmet_t3').value + ') does');
const v = I('logs').value || 1, n = Math.ceil(100 / v);
ok(!core.persists('logs', 1) && core.persists('logs', n), 'one log despawns, a pile worth 100 GOLD (' + n + ' logs) persists');
ok(!!stone && core.persists(stone, 1), 'a teleport stone always persists (' + stone + ')');
/* the Bank's list: put down, kept once, linked to a drop already there, taken away when no longer listed */
const box = [0, 0, 60, 70];
core.bankGround(box, [[7, 'coins', 150, 20, 52], [8, 'helmet_t3', 1, 21, 52]]);
const bankOn = () => core.S.ground.filter(g => g.bank != null);
ok(bankOn().length === 2 && bankOn().every(g => g.until >= 1e15), 'two persisted drops lie on the ground, for good');
core.bankGround(box, [[7, 'coins', 150, 20, 52], [8, 'helmet_t3', 1, 21, 52]]);
ok(bankOn().length === 2, 'asking again does not double them');
const p = core.addPlayer('t', null); p.x = 24; p.y = 52; p.inv[0] = { id: 'coins', n: 40 };
core.cmd('t', { c: 'drop', slot: 0 }); core.tick();
const fresh = core.S.ground.find(g => g.id === 'coins' && g.x === 24 && g.y === 52 && g.bank == null);
ok(!!fresh && fresh.until >= 1e15, 'Gold a player drops stays where it fell');
core.bankGround(box, [[7, 'coins', 150, 20, 52], [8, 'helmet_t3', 1, 21, 52], [9, 'coins', 40, 24, 52]]);
ok(core.S.ground.filter(g => g.id === 'coins' && g.x === 24 && g.y === 52).length === 1 && fresh.bank === 9, 'the Bank listing that drop links it instead of putting down a second');
core.bankGround(box, [[9, 'coins', 40, 24, 52]]);
ok(!core.S.ground.some(g => g.bank === 7 || g.bank === 8), 'drops the Bank no longer lists (taken by someone) go');
core.bankGround([200, 200, 300, 300], []);
ok(core.S.ground.some(g => g.bank === 9), 'an answer about another area leaves this one alone');
/* an older host shares a persisted drop without saying so (2026-10-06): its uid says so, and once the Bank has said it was
   taken, the host's copy is not put back */
{ const c2 = AshCore.create(D, { seed: 'ghost' }); c2.setAuth('village', false);
  const uid = 4398046511104 + 77;
  c2.groundAdd(uid, 'coins', 30, 20, 52);
  ok(c2.S.ground.some(g => g.uid === uid && g.bank === 77), "a host's copy of a persisted drop is known as one by its uid");
  c2.bankGround([0, 0, 60, 70], []);
  ok(!c2.S.ground.some(g => g.uid === uid), 'the Bank no longer lists it (taken): it goes');
  c2.groundAdd(uid, 'coins', 30, 20, 52);
  ok(!c2.S.ground.some(g => g.uid === uid), 'and the old host sending it again does not bring it back'); }
/* taken here: a host's copy never brings it back, not even before the Bank's next answer (the operator: "I am able to keep
   picking up the same 200 Gold over and over again") */
{ const c3 = AshCore.create(D, { seed: 'again' }); c3.setAuth('village', false);
  const q = c3.addPlayer('me', null); q.x = 21; q.y = 52; const uid = 4398046511104 + 88;
  c3.groundAdd(uid, 'coins', 200, 22, 52); const had = (q.inv.find(s => s && s.id === 'coins') || {}).n || 0;
  c3.cmd('me', { c: 'take', uid }); for (let i = 0; i < 6; i++) c3.tick();
  const got = ((q.inv.find(s => s && s.id === 'coins') || {}).n || 0) - had;
  ok(got === 200 && !c3.S.ground.some(g => g.uid === uid), 'a persisted drop is picked up here (200 Gold)');
  c3.groundAdd(uid, 'coins', 200, 22, 52);
  ok(!c3.S.ground.some(g => g.uid === uid), "the host sending its copy again does not put it back"); }
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
