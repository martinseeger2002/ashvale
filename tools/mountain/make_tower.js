/* make_tower.js -> data/zone.mt_tower.json: the Frostspire, the wizard's tower on the great mountain's crown (2026-10-18). A spot zone on
   the world's own ground (setPiece: false, like the camps, tools/mountain/make_camps.js): the crown that tools/mountain/make_summit.js
   levelled, the tower in its middle (scene kind 'wtower', a walk-in building of three storeys after the OSRS Wizards' Tower, its door
   towards the trail up from the High Pass): Apprentice Pell's shop on the ground floor (data/shops.json tower_magic), the library
   above, Archmage Halvard with the Circle's quests in his study at the top. People, items and quests: tools/mountain/make_tower_extras.py.
     node tools/mountain/make_tower.js      (after make_summit.js) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const { W, CFG } = require('../castle/mask.js');
const [OX, OY] = CFG.origin, F = CFG.face;
const WPJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'waypoints.json'), 'utf8')), CR = WPJ.crown, S = WPJ.waypoints.summit;
const BLOCK = 'TPORNIr~FHXWMYCGAUSVJ^KZD', N = 26, X0 = CR.x - (N >> 1), Y0 = CR.y - (N >> 1);
const T = []; for (let y = 0; y < N; y++) { const r = []; for (let x = 0; x < N; x++) { const c = W.tileAt(F, X0 + x + OX, Y0 + y + OY); r.push(c === 'p' || c === 'c' || c === 'B' ? 'd' : c); } T.push(r); }
const open = (x, y) => y >= 0 && y < N && x >= 0 && x < N && BLOCK.indexOf(T[y][x]) < 0;
/* the tower: a walk-in building (src/scene.js TK) of three storeys, 9 x 9 tiles on the crown's middle - its edge tiles are wall, the
   7 x 7 inside floor ('i'); its round wall stands out past the block's sides, so the ring of ground under that is wall too ('X'), but
   for the way in. The door faces the way the trail arrives. Ground floor: Pell's shop; top floor: the Archmage (an NPC with lv). */
const TW = 9, tx = CR.x - X0 - 4, ty = CR.y - Y0 - 4, cx = tx + 4.5, cy = ty + 4.5;
const ang = Math.atan2(S.y - CR.y, S.x - CR.x), face = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)) ? (Math.cos(ang) > 0 ? 'e' : 'w') : (Math.sin(ang) > 0 ? 's' : 'n');
const D = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] }[face], side = [-D[1], D[0]];
const doorT = [tx + 4 + D[0] * 4, ty + 4 + D[1] * 4], out1 = [doorT[0] + D[0], doorT[1] + D[1]], out2 = [doorT[0] + D[0] * 2, doorT[1] + D[1] * 2];
const RO = 3.5 * Math.SQRT2 + 0.55;   /* the wall's outer face (TK: the inner face through the room's corners, 0.5 m of stone) */
let bad = 0;
for (let y = ty - 2; y < ty + TW + 2; y++) for (let x = tx - 2; x < tx + TW + 2; x++) {
  if (y < 0 || x < 0 || y >= N || x >= N) continue;
  const inBlock = x >= tx && y >= ty && x < tx + TW && y < ty + TW, edge = inBlock && (x === tx || y === ty || x === tx + TW - 1 || y === ty + TW - 1);
  if (inBlock && !open(x, y) && !edge) bad++;
  if (x === doorT[0] && y === doorT[1]) { T[y][x] = 'i'; continue; }
  if (inBlock) { T[y][x] = edge ? 'X' : 'i'; continue; }
  if ((x === out1[0] && y === out1[1]) || (x === out2[0] && y === out2[1])) { if (!open(x, y)) T[y][x] = 'q'; continue; }
  if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < RO + 0.3) T[y][x] = 'X';
}
const at = (k, x, y, extra) => Object.assign({ k, x: x + X0, y: y + Y0, w: 1, h: 1 }, extra || {});
const objects = [at('wtower', tx, ty, { w: TW, h: TW, face, name: 'The Frostspire', enter: true, floors: 3, lh: 4.2, door: [doorT[0] + X0, doorT[1] + Y0] })];
const npcs = [], used = new Set([out1.join(','), out2.join(',')]);
const free = (x, y) => open(x, y) && !used.has(x + ',' + y);
const near = (x0, y0, r) => { for (let d = 0; d <= r; d++) for (let y = y0 - d; y <= y0 + d; y++) for (let x = x0 - d; x <= x0 + d; x++) if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) === d && free(x, y)) return [x, y]; return null; };
const put = (k, x0, y0, extra, block) => { const p = near(x0, y0, 4); if (!p) { console.error('note: no room for a %s', k); return null; } used.add(p.join(',')); objects.push(at(k, p[0], p[1], extra)); if (block) T[p[1]][p[0]] = 'X'; return p; };
/* outside: torches either side of the way in, a crate of the Circle's stores */
put('torch', out1[0] + side[0] * 2, out1[1] + side[1] * 2); put('torch', out1[0] - side[0] * 2, out1[1] - side[1] * 2);
put('crate', out2[0] + side[0] * 4, out2[1] + side[1] * 4, null, true);
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'tower_lines.json'), 'utf8'));
/* inside: Pell behind his counter (TK draws it against the wall opposite the door), Halvard in the middle of the top floor */
const pell = [tx + 4 - D[0] * 2, ty + 4 - D[1] * 2], hal = [tx + 4, ty + 4];
npcs.push({ id: 'pell', name: 'Apprentice Pell', look: 'pell', x: pell[0] + X0, y: pell[1] + Y0, shop: 'tower_magic', examine: LINES.pell_examine });
npcs.push({ id: 'halvard', name: 'Archmage Halvard', look: 'halvard', x: hal[0] + X0, y: hal[1] + Y0, lv: 2, talk: 'quest', quest: 'tower_beacon', quests: ['tower_beacon', 'stolen_ink', 'scattered_tomes', 'archmage_trial'], examine: LINES.halvard_examine });
const zone = { ashvale3d: 'module', name: 'zone.mt_tower', api: 1, v: 2, data: { name: 'The Frostspire', level: 'safe', setPiece: false, origin: [X0, Y0], size: [N, N], ground: 'village', tiles: T.map(r => r.join('')), objects, npcs, spawns: [], fishing: [],
  weather: { kinds: { clear: 40, fog: 20, snow: 40 }, min: 300, max: 900 } } };
fs.writeFileSync(path.join(ROOT, 'data', 'zone.mt_tower.json'), JSON.stringify(zone));
console.log('mt_tower (The Frostspire): %dx%d at (%d, %d), door %s at (%d, %d), %d npcs, %d objects%s', N, N, X0, Y0, face, doorT[0] + X0, doorT[1] + Y0, npcs.length, objects.length, bad ? ', ' + bad + ' tower tiles were not open ground' : '');
console.log(T.map(r => r.join('')).join('\n'));
