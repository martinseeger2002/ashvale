/* The ground under an area, from the world generator WITH the terrain edits (2026-10-04: "The terrain in town
   should be based on the Atlas terrain. If I make edits in the Atlas terrain, it should edit the terrain in the town").
   node editor/heights.js <build dir> <zone id>  ->  JSON {zone, origin, size, h: [(W+1)*(H+1) corner heights, 0.1 m]}
   Runs against the editor's preview copy (chain/editor/preview), whose data/atlas/wg_tables.json carries the edits. */
'use strict';
const path = require('path'), fs = require('fs');
const [dir, zid] = process.argv.slice(2);
const req = (p) => require(path.join(dir, p));
const AshWorld = req('src/world.js'), AG = req('src/globe.js'), WGM = req('src/worldgen.js');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(dir, 'data', n + '.json'), 'utf8')).data;
const zones = fs.readdirSync(path.join(dir, 'data')).filter(f => /^zone\.[a-z0-9_]+\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
D.wg = AshWorld.seededWorldgen(WGM, AG, D);
const M = AshWorld.createWorld(D, {});
const z = zones.find(q => q.id === zid); if (!z) { console.log(JSON.stringify({ error: 'no zone ' + zid })); process.exit(0); }
const [ox, oy] = z.origin, [W, H] = z.size, h = new Array((W + 1) * (H + 1));
for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) h[y * (W + 1) + x] = Math.round(M.groundH(ox + x, oy + y) * 10) / 10;
const t = []; for (let y = 0; y < H; y++) { let r = ''; for (let x = 0; x < W; x++) r += M.tileAt(ox + x, oy + y) || '.'; t.push(r); }   /* what the game shows there (Atlas water and shore) */
console.log(JSON.stringify({ zone: zid, origin: z.origin, size: z.size, h, t }));
