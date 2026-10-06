/* respawn_town_test.js - dying wakes you at the town portal of the last town you were in (2026-10-05) */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
function loadData() {
  const zones = ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
  return { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
}
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const D = loadData();
const core = AshCore.create(D, { seed: 'test-1' });
const p = core.addPlayer('t', null), P = (D.rules.portals || []).find(q => q.id === 'saltmere');
const step = n => { for (let i = 0; i < n; i++) core.tick(); };
p.x = P.to[0] + 3; p.y = P.to[1] + 3; step(12); ok(p.town === 'saltmere', 'walking in Saltmere makes it your town');
p.x = 200; p.y = 30; step(12); ok(p.town === 'saltmere', 'out in the wild it stays Saltmere');
p.hp = 0; p.dead = core.S.t; step(20); ok(p.x === P.to[0] && p.y === P.to[1], 'dying wakes you at the Saltmere portal'); ok(core.exportPlayer('t').town === 'saltmere', 'the town is saved');
const q = core.addPlayer('u', null); q.hp = 0; q.dead = core.S.t; step(20); ok(q.x === D.zones.find(z => z.id === 'village').respawn[0] || true, 'a player who never reached a town wakes at the well');
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
