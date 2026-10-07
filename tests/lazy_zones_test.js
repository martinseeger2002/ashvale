/* lazy_zones_test.js - area loading (handoff/area_loading.md). Needs a build first (dist/modules/zoneindex.json is made by
   build.py from the zone files): ASH_NO_CASTLE=1 python3 build.py --arcade && node tests/lazy_zones_test.js
   1. worldgen from the index STUBS = worldgen from the full zones, everywhere outside the towns (tiles, heights, roads),
      and inside them too once each zone has arrived (replacePiece) */
'use strict';
const fs = require('fs'), path = require('path');
const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data'), ZIP = path.join(__dirname, '..', 'dist', 'modules', 'zoneindex.json');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
if (!fs.existsSync(ZIP)) { console.log('FAIL no dist/modules/zoneindex.json: run build.py first'); process.exit(1); }
const ZI = JSON.parse(fs.readFileSync(ZIP, 'utf8')).data;
const zones = ZI.zones.map(e => Object.assign({ id: e.id }, mod('zone.' + e.id)));
const base = { rules: mod('rules'), globecfg: mod('globecfg') };
const C = base.globecfg, FACE = C.face, OX = C.origin[0], OY = C.origin[1];

const Wfull = AshWorld.seededWorldgen(WGM, AG, Object.assign({}, base, { zones }));
const Wstub = AshWorld.seededWorldgen(WGM, AG, Object.assign({}, base, { zones: [], zoneIndex: ZI }));
ok(Wfull.stats().pathSegments === Wstub.stats().pathSegments && Wfull.stats().pathSegments > 0,
  'the same roads from stubs as from full zones (' + Wfull.stats().pathSegments + ' path segments)');
const inZone = (x, y) => zones.some(z => x >= z.origin[0] && y >= z.origin[1] && x < z.origin[0] + z.size[0] && y < z.origin[1] + z.size[1]);
const R = 120;
function compare(label, inside) {
  let tiles = 0, tdiff = 0, hs = 0, hdiff = 0, worst = 0;
  for (const z of zones) {
    const x0 = z.origin[0] - R, y0 = z.origin[1] - R, w = z.size[0] + 2 * R, h = z.size[1] + 2 * R;
    const A = Wfull.tiles(FACE, x0 + OX, y0 + OY, w, h), B = Wstub.tiles(FACE, x0 + OX, y0 + OY, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside && inZone(x0 + x, y0 + y)) continue;
      tiles++; if (A[y][x] !== B[y][x]) tdiff++;
    }
    for (let y = 0; y < h; y += 5) for (let x = 0; x < w; x += 5) {
      const gx = x0 + x, gy = y0 + y; if (!inside && inZone(gx, gy)) continue;
      const a = Wfull.field(FACE, gx + OX + 0.5, -(gy + OY + 0.5))[0], b = Wstub.field(FACE, gx + OX + 0.5, -(gy + OY + 0.5))[0];
      hs++; const d = Math.abs(a - b); if (d > 0) { hdiff++; worst = Math.max(worst, d); }
    }
  }
  ok(tdiff === 0, label + ': ' + tiles + ' tiles identical' + (tdiff ? ' (' + tdiff + ' differ)' : ''));
  ok(hdiff === 0, label + ': ' + hs + ' heights identical' + (hdiff ? ' (' + hdiff + ' differ, worst ' + worst.toFixed(3) + ' m)' : ''));
}
compare('outside the towns, ' + R + ' m around each', false);
for (const z of zones) if (z.under) ok(!AshWorld.arriveWorldgen(Wstub, base, z), z.id + ' (underground) stays out of the land'); else ok(AshWorld.arriveWorldgen(Wstub, base, z), z.id + ' arrives in worldgen');
compare('after every zone arrived, towns included', true);

/* 2. the core: a lazy game that gets its zones one by one ends up with what an eager game has, in any order */
const AshCore = require('../src/core.js');
const full = Object.assign({}, base, { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests') });
const eager = AshCore.create(Object.assign({}, full, { zones: zones.map(z => Object.assign({}, z)), wg: AshWorld.seededWorldgen(WGM, AG, Object.assign({}, base, { zones })) }), { seed: 'lz' });
function lazyGame(order, pre) {
  const D = Object.assign({}, full, { zoneIndex: ZI, zones: [] });
  D.wg = AshWorld.seededWorldgen(WGM, AG, D);
  const c = AshCore.create(D, { seed: 'lz' });
  if (pre) pre(c);
  for (const id of order) c.addZone(Object.assign({}, zones.find(z => z.id === id)));
  return c;
}
const ids = zones.map(z => z.id);
const A = lazyGame(ids), B = lazyGame(ids.slice().reverse(), (c) => {   /* B fills the towns' land BEFORE they arrive */
  for (const z of zones) for (let y = 0; y < z.size[1]; y += 7) for (let x = 0; x < z.size[0]; x += 7) c.M.tileAt(z.origin[0] + x, z.origin[1] + y);
});
const npcSet = c => c.M.npcs.map(n => n.id).sort().join(',');
const mobSet = c => c.S.mobs.filter(m => !m.site).map(m => m.key + '@' + m.sx + ',' + m.sy).sort().join(';');
const mobUids = c => c.S.mobs.filter(m => !m.site).map(m => m.uid + '=' + m.key + '@' + m.sx + ',' + m.sy).sort().join(';');
ok(npcSet(A) === npcSet(eager) && npcSet(B) === npcSet(eager), 'the same ' + eager.M.npcs.length + ' people as an eager game, whatever the order');
ok(mobSet(A) === mobSet(eager) && mobSet(B) === mobSet(eager), 'the same ' + eager.S.mobs.filter(m => !m.site).length + ' zone monsters at the same spots');
ok(mobUids(A) === mobUids(B), 'every zone monster has the same uid whatever order the zones came in');
ok(A.M.buildings.length === eager.M.buildings.length && B.M.buildings.length === eager.M.buildings.length, 'the same ' + eager.M.buildings.length + ' storeyed buildings');
let tileDiff = 0, wallDiff = 0;
for (const z of zones) for (let y = -2; y < z.size[1] + 2; y++) for (let x = -2; x < z.size[0] + 2; x++) {
  const gx = z.origin[0] + x, gy = z.origin[1] + y;
  for (const c of [A, B]) { if (c.M.tileAt(gx, gy) !== eager.M.tileAt(gx, gy) || c.M.blocked(gx, gy) !== eager.M.blocked(gx, gy) || c.M.insideAt(gx, gy) !== eager.M.insideAt(gx, gy)) tileDiff++; if (c.M.wallAt(gx, gy) !== eager.M.wallAt(gx, gy)) wallDiff++; }
}
ok(tileDiff === 0 && wallDiff === 0, 'every town tile, wall and indoor flag matches (B had its land filled before the towns came)' + (tileDiff || wallDiff ? ' tiles ' + tileDiff + ' walls ' + wallDiff : ''));
ok(zones.every(z => A.M.zoneAt(z.origin[0] + 1, z.origin[1] + 1) === z.id), 'zoneAt names each town once it is loaded');
{ const C0 = lazyGame([]), q = Object.values(full.quests.quests).find(Q => Q.steps.some(st => st.zone === 'saltmere'));
  ok(!C0.hasZone('saltmere') && C0.zoneIndex().some(z => z.id === 'saltmere'), 'before arriving, Saltmere is in the index but not loaded');
  ok(C0.addZone(Object.assign({}, zones.find(z => z.id === 'saltmere'))) && !C0.addZone(Object.assign({}, zones.find(z => z.id === 'saltmere'))), 'a zone arrives once (a second addZone is ignored)');
  void q; }
{ const ev = lazyGame([]); ev.tick(); ev.addZone(Object.assign({}, zones[0])); const E = ev.S.ev;
  ok(E.some(e => e.e === 'zoneadd' && e.zone === zones[0].id) && E.filter(e => e.e === 'mobadd').length === ev.S.mobs.filter(m => !m.site && m.zone === zones[0].id || (!m.site && zones[0].id === m.zone)).length, 'addZone tells the engine: zoneadd + one mobadd per monster'); }

console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
