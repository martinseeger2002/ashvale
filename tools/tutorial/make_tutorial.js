/* make_tutorial.js -> data/zone.tutorial.json: Tutorial Island (2026-10-19), the island tools/tutorial/make_island.js raised in the sea east of
   Saltmere. The zone is the world's own ground there (sampled: water stays water), sand along the shore, and the lesson laid out round it:
   Guide Elsbeth where you wake (the spawn), Survivalist Marlow by a stand of trees in the west with a fishing spot on the shore beside him,
   Gardener Fen by a farming patch in the north, Sergeant Kade by the island rats in the east, Ferryman Odo on a short pier in the south-east.
   Signposts point the way. The people and the quest: tools/tutorial/make_tutorial_extras.py.
     node tools/tutorial/make_tutorial.js      (after make_island.js and make_tutorial_extras.py) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const { W, CFG } = require('../castle/mask.js'), [OX, OY] = CFG.origin, F = CFG.face;
const IS = JSON.parse(fs.readFileSync(path.join(__dirname, 'island.json'), 'utf8')), NPC = JSON.parse(fs.readFileSync(path.join(__dirname, 'npcs.json'), 'utf8'));
const N = 100, X0 = IS.x - N / 2, Y0 = IS.y - N / 2;
const wet = (x, y) => { const o = W.sample(F, x + 0.5 + OX, -(y + 0.5 + OY)); return (o.river === 3 && o.h < o.wl + 0.05) || o.h < W.WATER; };
const T = []; for (let y = 0; y < N; y++) { const r = []; for (let x = 0; x < N; x++) r.push(wet(X0 + x, Y0 + y) ? '~' : '.'); T.push(r); }
const at = (x, y) => (y >= 0 && y < N && x >= 0 && x < N) ? T[y][x] : '~';
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (T[y][x] === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => at(x + dx, y + dy) === '~')) T[y][x] = 's';   /* a beach */
const L = (gx, gy) => [gx - X0, gy - Y0], put = (gx, gy, c) => { const [x, y] = L(gx, gy); if (T[y] && T[y][x] !== undefined) T[y][x] = c; };
const land = (gx, gy) => { const [x, y] = L(gx, gy); return at(x, y) === '.' || at(x, y) === 's'; };
const objects = [], npcs = [], spawns = [], fishing = [];
const cx = IS.x, cy = IS.y;
/* the trees in the west (woodcutting tiles), a fishing spot on the west shore */
for (const [dx, dy] of [[-15, -5], [-18, -1], [-16, 3], [-19, 5], [-17, -8]]) if (land(cx + dx, cy + dy)) put(cx + dx, cy + dy, 'T');
let fishAt = null; for (let r = 8; r < 48 && !fishAt; r++) { const gx = cx - r, gy = cy + 2; if (!land(gx, gy) && land(gx + 1, gy)) fishAt = [gx, gy]; }
if (fishAt) fishing.push({ x: fishAt[0], y: fishAt[1], fish: 'shrimp_raw' });
/* the farming patch in the north (a zone patch: src/core.js FARMING reads zone objects too) */
const patch = [cx - 1, cy - 15]; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) put(patch[0] + x, patch[1] + y, '.');
objects.push({ k: 'farmpatch', x: patch[0], y: patch[1], w: 2, h: 2, tier: 1, tag: 'tutorial' });
/* the pier in the south-east: four boards out over the water from the beach */
let pierAt = null; for (let r = 8; r < 46 && !pierAt; r++) { const gx = cx + Math.round(r * 0.7), gy = cy + Math.round(r * 0.7); if (!land(gx, gy) && land(gx - 1, gy - 1)) pierAt = [gx, gy]; }
if (pierAt) { for (let i = 0; i < 4; i++) put(pierAt[0] + i, pierAt[1], 'B'); objects.push({ k: 'pier', x: pierAt[0], y: pierAt[1], w: 4, h: 1, tag: 'tutorial' }); }
/* the guides, the rats, campfire and tents, the signposts */
const man = (id, gx, gy, extra) => { if (!land(gx, gy)) { for (let r = 1; r < 6; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (land(gx + dx, gy + dy)) { gx += dx; gy += dy; r = 9; break; } } npcs.push(Object.assign({ id, name: NPC[id].name, look: id, x: gx, y: gy, examine: NPC[id].examine }, extra || {})); return [gx, gy]; };
const spawn = [cx, cy + 8];
man('tut_guide', spawn[0] + 1, spawn[1] - 1, { talk: 'quest', quest: 'tutorial_island', quests: ['tutorial_island'] });
man('tut_survival', cx - 13, cy + 1);
man('tut_farmer', patch[0] + 3, patch[1] + 1);
man('tut_combat', cx + 12, cy - 2);
if (pierAt) man('tut_ferryman', pierAt[0] + 1, pierAt[1]); else man('tut_ferryman', cx + 18, cy + 18);
for (const [dx, dy] of [[16, -5], [18, 0], [16, 4], [19, -2]]) if (land(cx + dx, cy + dy)) spawns.push({ m: 'tut_rat', x: cx + dx, y: cy + dy });
const deco = (k, gx, gy, extra) => { if (land(gx, gy)) objects.push(Object.assign({ k, x: gx, y: gy, w: 1, h: 1 }, extra || {})); };
deco('tent', cx - 11, cy + 5); deco('woodpile', cx - 12, cy - 3); deco('tent', cx + 11, cy - 6); deco('crate', cx + 12, cy + 2); deco('tent', spawn[0] - 4, spawn[1] - 2);
deco('signpost', spawn[0] - 2, spawn[1] - 4, { arms: [{ t: 'Survival', a: Math.PI }, { t: 'Farming', a: -Math.PI / 2 }, { t: 'Combat', a: 0 }, { t: 'Ferry', a: Math.PI / 4 }] });
deco('milestone', cx - 3, cy - 10); deco('lantern_post', cx + 2, cy + 6); deco('stone_bench', spawn[0] + 3, spawn[1] + 2, { ry: 0 });
for (const o of objects) if (['tent', 'woodpile', 'crate'].includes(o.k)) put(o.x, o.y, 'X');
const zone = { ashvale3d: 'module', name: 'zone.tutorial', api: 1, v: 2, data: { name: 'Tutorial Island', level: 'safe', origin: [X0, Y0], size: [N, N], ground: 'grass',
  tiles: T.map(r => r.join('')), objects, npcs, spawns, fishing, spawn, weather: { kinds: { clear: 80, fog: 20 }, min: 300, max: 900 } } };
fs.writeFileSync(path.join(ROOT, 'data', 'zone.tutorial.json'), JSON.stringify(zone));
const landN = T.reduce((n, r) => n + r.filter(c => c !== '~').length, 0);
console.log('Tutorial Island: %dx%d at (%d, %d), %d land tiles, %d npcs, %d rats, fishing %s, pier %s, spawn %s', N, N, X0, Y0, landN, npcs.length, spawns.length, JSON.stringify(fishAt), JSON.stringify(pierAt), JSON.stringify(spawn));
