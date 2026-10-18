/* make_camps.js -> data/zone.mt_*.json: the camps on the great mountain's ways (2026-10-18), small zones on the trails:
     safe road: the Foothill Lodge (Orla), the Shrine of the Three Stones (Wyn), the Hermit's Ledge (Aled)
     dangerous climb: the Warden's Post (Bryn), the Crags (crag wolves), the High Pass (pass bandits, frost goblins)
     the Far Foot (Tamsin), where the town beyond will one day be reached.
   Each zone's ground is the world's own tiles there (the trails, tools/mountain/make_trails.js, and the cliffs, src/wg_tiles.js), the
   trail drawn as dirt ('d') inside a camp so the worldgen takes no path exits from its edges (src/wg_paths.js would wander new paths out
   of a 'p' on a piece's edge). No notice boards: a 'wsign' is the keep's scoreboard; the ways are signed by tools/mountain/make_signs.js. Monsters are the mountain's own (tools/mountain/make_mountain_extras.py), with their own dice.
     node tools/mountain/make_camps.js     (after make_trails.js and make_mountain_extras.py) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), CTAG = 'mountain_camp';
{ const TJ = JSON.parse(fs.readFileSync(TP, 'utf8')); TJ.data.edits = (TJ.data.edits || []).filter(e => e.tag !== CTAG); fs.writeFileSync(TP, JSON.stringify(TJ)); }
let { W, CFG } = require('../castle/mask.js');
const [OX, OY] = CFG.origin, F = CFG.face;
const plane = (x, y) => [x + 0.5 + OX, -(y + 0.5 + OY)], unit = (x, y) => Array.from(W.toSphere(F, ...plane(x, y))).map(v => +v.toFixed(9));
const WPJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'waypoints.json'), 'utf8')), WP = WPJ.waypoints;
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'npc_lines.json'), 'utf8'));
const BLOCK = 'TPORNIr~FHXWMYCGAUSVJ^KZD';
const along = (pts, f) => { const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; } let t = tot * f; for (let i = 0; i < L.length; i++) { if (t <= L[i]) { const k = t / L[i]; return { x: Math.round(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k), y: Math.round(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k) }; } t -= L[i]; } return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] }; };
/* where the danger trail is between the warden and the pass, a little under half way: the crags */
const dpts = WPJ.trails.danger, iw = dpts.findIndex(p => Math.hypot(p[0] - WP.warden.x, p[1] - WP.warden.y) < 6), ip = dpts.findIndex(p => Math.hypot(p[0] - WP.pass.x, p[1] - WP.pass.y) < 6);
const CRAGS = along(dpts.slice(Math.max(0, iw), ip > 0 ? ip + 1 : dpts.length), 0.5);
const CAMPS = [
  { id: 'mt_lodge', name: 'Foothill Lodge', at: WP.lodge, w: 20, h: 16, level: 'safe', npc: 'orla', npcName: 'Orla the hunter', quests: ['flask_for_the_hermit', 'wolves_on_the_climb'], kit: ['tent', 'tent', 'campfire', 'woodpile', 'torch'] },
  { id: 'mt_shrine', name: 'Shrine of the Three Stones', at: WP.shrine, w: 18, h: 16, shelf: 15, level: 'safe', npc: 'wyn', npcName: 'Keeper Wyn', quests: ['three_stones'], kit: ['cairn', 'cairn', 'cairn', 'altar', 'torch'] },
  { id: 'mt_ledge', name: "Hermit's Ledge", at: WP.ledge, w: 16, h: 14, shelf: 15, level: 'safe', npc: 'aled', npcName: 'Aled the hermit', quests: ['echo_riddle'], kit: ['tent', 'campfire', 'woodpile'] },
  { id: 'mt_warden', name: "Warden's Post", at: WP.warden, w: 16, h: 14, level: 'safe', npc: 'bryn', npcName: 'Warden Bryn', quests: ['the_high_pass'], kit: ['tent', 'torch', 'torch'] },
  { id: 'mt_crags', name: 'The Crags', at: CRAGS, w: 28, h: 28, shelf: 24, level: '14-20', spawns: [['crag_wolf', 4]], kit: ['woodpile'] },
  { id: 'mt_pass', name: 'The High Pass', at: WP.pass, w: 26, h: 26, shelf: 24, level: '15-22', spawns: [['pass_bandit', 4], ['frost_goblin', 3]], kit: ['tent', 'tent', 'campfire', 'crate'] },
  { id: 'mt_farside', name: 'Far Foot', at: WP.farside, w: 18, h: 14, level: 'safe', npc: 'tamsin', npcName: 'Tamsin the scout', quests: ['beyond_the_mountain'], kit: ['tent', 'campfire', 'woodpile'] },
];
/* a level shelf for the camps on the steep flanks: a flatten stroke at the trail's own height there, so the camp stands on a terrace (and
   the cliff rule, which only takes steep ground, leaves it open); the world is read again with the shelves in */
{
  const TJ = JSON.parse(fs.readFileSync(TP, 'utf8'));
  for (const C of CAMPS.filter(c => c.shelf)) TJ.data.edits = (TJ.data.edits || []).concat([{ op: 'flatten', u: unit(C.at.x, C.at.y), r: C.shelf, to: +W.sample(F, ...plane(C.at.x, C.at.y)).h.toFixed(2), tag: CTAG }]);
  fs.writeFileSync(TP, JSON.stringify(TJ));
  for (const k of Object.keys(require.cache)) if (/[\\/](src|data|tools[\\/]castle)[\\/]/.test(k)) delete require.cache[k];
  ({ W } = require('../castle/mask.js'));
}
for (const C of CAMPS) {
  const X0 = C.at.x - (C.w >> 1), Y0 = C.at.y - (C.h >> 1);
  const T = []; for (let y = 0; y < C.h; y++) { const r = []; for (let x = 0; x < C.w; x++) { const c = W.tileAt(F, X0 + x + OX, Y0 + y + OY); r.push(c === 'p' || c === 'c' || c === 'B' ? 'd' : c); } T.push(r); }
  const at = (x, y) => (y >= 0 && y < C.h && x >= 0 && x < C.w) ? T[y][x] : '^';
  /* the trail through the camp, and the open tiles beside it (2 to 5 steps off it), nearest first */
  const trail = []; for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) if (T[y][x] === 'd') trail.push([x, y]);
  if (!trail.length) { console.error('BLOCKED - no trail through %s', C.id); process.exit(1); }
  const dist = new Map(), q = trail.map(p => p.concat(0)); for (const [x, y] of trail) dist.set(x + ',' + y, 0);
  while (q.length) { const [x, y, d] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (!dist.has(k) && nx >= 0 && ny >= 0 && nx < C.w && ny < C.h && BLOCK.indexOf(at(nx, ny)) < 0) { dist.set(k, d + 1); q.push([nx, ny, d + 1]); } } }
  const cx = C.w / 2, cy = C.h / 2, free = [...dist].filter(([k, d]) => d >= 2 && d <= 5).map(([k]) => k.split(',').map(Number)).sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
  const used = new Set(), take = (gap) => { const p = free.find(([x, y]) => [...used].every(u => { const [ux, uy] = u.split(',').map(Number); return Math.hypot(ux - x, uy - y) >= gap; })); if (p) used.add(p.join(',')); return p; };
  const objects = [], npcs = [], spawns = [];
  if (C.npc) {   /* the camp's keeper stands one step off the trail */
    const p = [...dist].filter(([k, d]) => d === 1).map(([k]) => k.split(',').map(Number)).sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))[0];
    if (!p) { console.error('BLOCKED - nowhere for %s to stand', C.npc); process.exit(1); }
    used.add(p.join(','));
    npcs.push(Object.assign({ id: C.npc, name: C.npcName, look: C.npc, x: p[0] + X0, y: p[1] + Y0, talk: 'quest', quest: C.quests[0], quests: C.quests }, { examine: (LINES[C.npc] || {}).examine }));   /* examine only: a giver's idle lines are heard only while all their quests are gated (tests/core_test.js), and these camps' first quests are open to all */
  }
  for (const k of C.kit) {
    const p = take(k === 'cairn' ? 3 : 2); if (!p) { console.error('note: no room for a %s in %s', k, C.id); continue; }
    const o = { k, x: p[0] + X0, y: p[1] + Y0, w: 1, h: 1 };
    objects.push(o);
    if ('tent cairn altar crate woodpile'.split(' ').indexOf(k) >= 0) T[p[1]][p[0]] = 'X';
  }
  for (const [m, n] of (C.spawns || [])) for (let i = 0; i < n; i++) { const p = take(3); if (p) spawns.push({ m, x: p[0] + X0, y: p[1] + Y0 }); }
  /* setPiece: false (a spot zone, src/world.js pieceZones): the land under a camp is the world's own, shelf and trail and all; as a set piece
     it was levelled to one base height and the slope around it fell into a pit (2026-10-18) */
  const zone = { ashvale3d: 'module', name: 'zone.' + C.id, api: 1, v: 2, data: { name: C.name, level: C.level, setPiece: false, origin: [X0, Y0], size: [C.w, C.h], ground: 'village', tiles: T.map(r => r.join('')), objects, npcs, spawns, fishing: [],
    weather: { kinds: { clear: 50, fog: 25, snow: 25 }, min: 300, max: 900 } } };
  fs.writeFileSync(path.join(ROOT, 'data', 'zone.' + C.id + '.json'), JSON.stringify(zone));
  console.log('%s (%s): %dx%d at (%d, %d), %d npc, %d objects, %d spawns, %d trail tiles', C.id, C.name, C.w, C.h, X0, Y0, npcs.length, objects.length, spawns.length, trail.length);
}
