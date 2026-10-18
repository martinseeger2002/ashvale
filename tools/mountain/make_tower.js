/* make_tower.js -> data/zone.mt_tower.json: the Frostspire, the wizard's tower on the great mountain's crown (2026-10-18). A spot zone on
   the world's own ground (setPiece: false, like the camps, tools/mountain/make_camps.js): the crown that tools/mountain/make_summit.js
   levelled, the tower in its middle (scene kind 'wtower', 7 x 7 tiles, its door towards the trail up from the High Pass), Archmage
   Halvard at the door with the Circle's quests, Apprentice Pell at a stall selling the wizard cloaks (data/shops.json tower_magic), and
   shelves of the Circle's books in the yard. People, items and quests: tools/mountain/make_tower_extras.py.
     node tools/mountain/make_tower.js      (after make_summit.js) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const { W, CFG } = require('../castle/mask.js');
const [OX, OY] = CFG.origin, F = CFG.face;
const WPJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'waypoints.json'), 'utf8')), CR = WPJ.crown, S = WPJ.waypoints.summit;
const BLOCK = 'TPORNIr~FHXWMYCGAUSVJ^KZD', N = 26, X0 = CR.x - (N >> 1), Y0 = CR.y - (N >> 1);
const T = []; for (let y = 0; y < N; y++) { const r = []; for (let x = 0; x < N; x++) { const c = W.tileAt(F, X0 + x + OX, Y0 + y + OY); r.push(c === 'p' || c === 'c' || c === 'B' ? 'd' : c); } T.push(r); }
const open = (x, y) => y >= 0 && y < N && x >= 0 && x < N && BLOCK.indexOf(T[y][x]) < 0;
/* the tower: 7 x 7 on the crown's middle; its door faces the way the trail arrives */
const TW = 7, tx = CR.x - X0 - 3, ty = CR.y - Y0 - 3;
const ang = Math.atan2(S.y - CR.y, S.x - CR.x), face = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)) ? (Math.cos(ang) > 0 ? 'e' : 'w') : (Math.sin(ang) > 0 ? 's' : 'n');
let bad = 0; for (let y = ty; y < ty + TW; y++) for (let x = tx; x < tx + TW; x++) { if (!open(x, y)) bad++; T[y][x] = 'X'; }
const D = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] }[face], door = [tx + 3 + D[0] * 4, ty + 3 + D[1] * 4];   /* the tile before the door */
const side = [-D[1], D[0]];   /* along the wall, to the right of the door seen from outside */
const at = (k, x, y, extra) => Object.assign({ k, x: x + X0, y: y + Y0, w: 1, h: 1 }, extra || {});
const objects = [at('wtower', tx, ty, { w: TW, h: TW, face, name: 'The Frostspire' })];
const npcs = [], used = new Set([door.join(',')]);
const free = (x, y) => open(x, y) && !used.has(x + ',' + y);
const near = (x0, y0, r) => { for (let d = 0; d <= r; d++) for (let y = y0 - d; y <= y0 + d; y++) for (let x = x0 - d; x <= x0 + d; x++) if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) === d && free(x, y)) return [x, y]; return null; };
const put = (k, x0, y0, extra, block) => { const p = near(x0, y0, 4); if (!p) { console.error('note: no room for a %s', k); return null; } used.add(p.join(',')); objects.push(at(k, p[0], p[1], extra)); if (block) T[p[1]][p[0]] = 'X'; return p; };
/* torches either side of the door, the Archmage beside it, Pell's stall a few steps out to the right, shelves to the left */
put('torch', door[0] + side[0] * 2, door[1] + side[1] * 2); put('torch', door[0] - side[0] * 2, door[1] - side[1] * 2);
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'tower_lines.json'), 'utf8'));
{ const p = near(door[0] + side[0], door[1] + side[1], 3); used.add(p.join(','));
  npcs.push({ id: 'halvard', name: 'Archmage Halvard', look: 'halvard', x: p[0] + X0, y: p[1] + Y0, talk: 'quest', quest: 'tower_beacon', quests: ['tower_beacon', 'stolen_ink', 'scattered_tomes', 'archmage_trial'], examine: LINES.halvard_examine }); }
const sx = door[0] + D[0] * 4 + side[0] * 4, sy = door[1] + D[1] * 4 + side[1] * 4;
const st = put('stall', sx, sy, null, true);
{ const p = near(st[0] - D[0], st[1] - D[1], 2); used.add(p.join(','));
  npcs.push({ id: 'pell', name: 'Apprentice Pell', look: 'pell', x: p[0] + X0, y: p[1] + Y0, shop: 'tower_magic', examine: LINES.pell_examine }); }
put('shelf', door[0] + D[0] * 3 - side[0] * 4, door[1] + D[1] * 3 - side[1] * 4, null, true);
put('shelf', door[0] + D[0] * 3 - side[0] * 5, door[1] + D[1] * 3 - side[1] * 5, null, true);
put('crate', door[0] + D[0] * 5 - side[0] * 3, door[1] + D[1] * 5 - side[1] * 3, null, true);
const zone = { ashvale3d: 'module', name: 'zone.mt_tower', api: 1, v: 2, data: { name: 'The Frostspire', level: 'safe', setPiece: false, origin: [X0, Y0], size: [N, N], ground: 'village', tiles: T.map(r => r.join('')), objects, npcs, spawns: [], fishing: [],
  weather: { kinds: { clear: 40, fog: 20, snow: 40 }, min: 300, max: 900 } } };
fs.writeFileSync(path.join(ROOT, 'data', 'zone.mt_tower.json'), JSON.stringify(zone));
console.log('mt_tower (The Frostspire): %dx%d at (%d, %d), door %s, %d npcs, %d objects%s', N, N, X0, Y0, face, npcs.length, objects.length, bad ? ', ' + bad + ' tower tiles were not open ground' : '');
console.log(T.map(r => r.join('')).join('\n'));
