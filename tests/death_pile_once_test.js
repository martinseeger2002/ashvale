/* death_pile_once_test.js - [Claude 2026-10-14] the operator: "I just died twice battling the dragon. Each time I died a lot of my items
   were duplicated. All of the duplicated items along with my original items were all lying in a pile where I died."
   Dying in an area another game hosts: the guest's own game hears the @ashvale Bank's copy of each persisted drop (its own uid)
   and the host's row for the same thing (the host's uid). Whichever comes first, the pile shows each thing once; picking it up
   by either name takes it on the host and clears it everywhere.  node tests/death_pile_once_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const BANK = 4398046511104, X = 24, Y = 52, box = [0, 0, 60, 70];
const PILE = [['coins', 98], ['helmet_t3', 1], ['body_t4', 1], ['staff_storm', 1], ['dragon_cape', 1]];
function world(order) {
  const H = AshCore.create(D, { seed: 'host' }), G = AshCore.create(D, { seed: 'guest' });
  G.setAuth('village', false);
  /* the host lays the pile down (what the guest's xdrop asks of it) */
  const hostRows = PILE.map(([id, n]) => { const g = H.hostDrop({ id, n, x: X, y: Y, life: 1000, from: 'g', diedAt: 1 }) || H.S.ground.find(q => q.id === id && q.x === X && q.y === Y); return g; });
  const bankRows = PILE.map(([id, n], i) => [500 + i, id, n, X, Y]);
  const rows = hostRows.map(g => [g.uid, g.id, g.n, g.x, g.y, null, 0]);
  if (order === 'bank first') { G.bankGround(box, bankRows); G.groundFull('village', rows); }
  else if (order === 'host first') { G.groundFull('village', rows); G.bankGround(box, bankRows); }
  else { G.bankGround(box, bankRows); for (const r of rows) G.groundAdd(...r); G.groundFull('village', rows); G.bankGround(box, bankRows); }
  H.bankGround(box, bankRows);   /* the host hears the Bank too */
  return { H, G, rows };
}
for (const order of ['bank first', 'host first', 'both, over and over']) {
  const { H, G, rows } = world(order);
  const at = C => C.S.ground.filter(q => q.x === X && q.y === Y);
  ok(at(G).length === PILE.length, order + ': the guest sees each thing once (' + at(G).map(q => q.id).join(', ') + ')');
  ok(at(H).length === PILE.length, order + ': so does the host (' + at(H).length + ')');
  /* the guest picks up the cape by the name its own game knows it by (the Bank's uid, when the Bank's copy came first) */
  const cape = at(G).find(q => q.id === 'dragon_cape');
  const p = H.addPlayer('g', null); p.x = X; p.y = Y + 1;
  const evs = []; const took = H.claim('g', cape.uid); evs.push(...H.tick());
  ok(took, order + ': the host takes the claim by the guest\'s name for it (' + cape.uid + ')');
  ok(!at(H).some(q => q.id === 'dragon_cape'), order + ': and it is gone from the host');
  const tk = rows.find(r => r[1] === 'dragon_cape')[0];
  G.groundRemove(tk);
  ok(!at(G).some(q => q.id === 'dragon_cape'), order + ': the host\'s word (its own uid) clears it on the guest too');
  ok(at(G).length === PILE.length - 1, order + ': the rest stay, once each');
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
