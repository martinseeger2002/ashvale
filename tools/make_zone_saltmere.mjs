/* Author data/zone.saltmere.json — the second town, on the shore of the inland sea east of Ashvale.
   The land it stands on is the world's, not ours: the tiles start from what worldgen actually puts in the rectangle
   (data/globecfg.json + the two existing zones, so the shore is the shore the game will generate) and the town is laid
   over it: a clearing in the wood, a quay along the beach, streets, buildings, an exit path at the west gate.
   Run:  node tools/make_zone_saltmere.mjs            writes data/zone.saltmere.json
         node tools/make_zone_saltmere.mjs --map      prints the finished tile map instead
   Re-run it if the globe seed or the coastline changes. Everything below the "the layout" line is the town. */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire('file:///home/you/ashvale3d/');
const ROOT = path.resolve(import.meta.dirname, '..');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/globecfg.json'), 'utf8')).data;
const createGlobe = require(ROOT + '/src/globe.js').createGlobe;
const WN = require(ROOT + '/src/worldgen.js');
const zones = ['village', 'whisperwood'].map(n => Object.assign({ id: n }, JSON.parse(fs.readFileSync(path.join(ROOT, `data/zone.${n}.json`), 'utf8')).data));
const G = createGlobe(cfg), W = WN.createWorldgen(G, { seed: cfg.seed });
W.setSetPieces(W.piecesFromZones(zones, cfg.face, cfg.origin[0], cfg.origin[1], { belt: cfg.belt || {} }));

/* ---- the site: the globe's harbour cell (globe classes().coreHarbour, right on the coast a walk from Ashvale).
   The town below is authored in its own frame (x 3390..3522, y 1772..1884, the sea to the EAST of the quay); here that
   frame is rotated or mirrored so its seaward side faces the water at the harbour, and placed so the quay's waterline
   (authoring x 3536) sits on the shore. 2026-10-03: Saltmere may move anywhere it needs to. */
const OX = 3390, OY = 1772, NX = 160, NY = 112, SEA_U = 112;   /* the waterline inside the town: the quay and the beach are ON the sea (the operator) */
const CLS = G.classes(), hp = G.planar(CLS.coreHarbour);
if (hp.face !== cfg.face) throw new Error('the harbour is on face ' + hp.face + ', Ashvale on ' + cfg.face);
const hx = Math.floor(hp.x) - cfg.origin[0], hy = Math.floor(-hp.y) - cfg.origin[1];
const hAt = (x, y) => W.height(cfg.face, x + cfg.origin[0] + 0.5, -(y + cfg.origin[1]) - 0.5);
/* the sea lies beyond the harbour, away from Ashvale (Ashvale is the harbour's inland neighbour): take that axis, and the
   first water along it that stays water for a while (a pond on the way is not the sea) */
const cp = G.planar(CLS.coreCenter), ax = Math.floor(cp.x) - cfg.origin[0], ay = Math.floor(-cp.y) - cfg.origin[1];
const vx = hx - ax, vy = hy - ay;
const dirs = Math.abs(vx) >= Math.abs(vy) ? [vx > 0 ? [0, 1, 0] : [1, -1, 0], vy > 0 ? [3, 0, 1] : [2, 0, -1]] : [vy > 0 ? [3, 0, 1] : [2, 0, -1], vx > 0 ? [0, 1, 0] : [1, -1, 0]];
let best = null;
for (const [k, dx, dy] of dirs) {
  for (let d = 0; d < 900 && !best; d++) {
    let wetRun = 0; for (let e = 0; e < 40; e++) if (hAt(hx + dx * (d + e), hy + dy * (d + e)) < W.WATER - 0.05) wetRun++;
    if (wetRun >= 38) best = { k, dx, dy, d };
  }
  if (best) break;
}
if (!best) throw new Error('no water within 700 m of the harbour');
const WX = hx + best.dx * best.d, WY = hy + best.dy * best.d, K = best.k;
/* local authoring tile (lx, ly) -> vale tile; K 0 sea east, 1 west, 2 north, 3 south */
let BX, BY;
if (K === 0) { BX = WX - SEA_U; BY = WY - 56; } else if (K === 1) { BX = WX - (NX - 1 - SEA_U); BY = WY - 56; }
else if (K === 2) { BY = WY - (NX - 1 - SEA_U); BX = WX - 56; } else { BY = WY - SEA_U; BX = WX - 56; }
function L2W(lx, ly) {
  const u = lx - OX, v = ly - OY;
  if (K === 0) return [BX + u, BY + v];
  if (K === 1) return [BX + NX - 1 - u, BY + v];
  if (K === 2) return [BX + v, BY + NX - 1 - u];
  return [BX + v, BY + u];
}
const WSX = K < 2 ? NX : NY, WSY = K < 2 ? NY : NX;
const tileW = (x, y) => W.tiles(cfg.face, x + cfg.origin[0], y + cfg.origin[1], 1, 1)[0];
const rows = [], ground = [];
for (let v = 0; v < NY; v++) { rows.push([]); ground.push([]); for (let u = 0; u < NX; u++) { const [x, y] = L2W(OX + u, OY + v); rows[v].push(tileW(x, y)); ground[v].push(hAt(x, y)); } }

const TREES = 'TPOMWY';
/* the river that runs through the town (the operator: no buildings in the river, no strip of land damming it): its tiles, as
   the world has them, before anything is built */
const RIVER = rows.map(r => r.map(c => c === '~' || c === 'v')), RIV0 = rows.map(r => r.slice());
const g = (u, v) => rows[v][u];
const put = (u, v, c) => { if (u >= 0 && v >= 0 && u < NX && v < NY) rows[v][u] = c; };
const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x - OX, y - OY, c); };
const street = (x0, y0, x1, y1) => rect(x0, y0, x1, y1, 'p');

/* ---- the clearing: the town takes the wood down; water stays water, the rest becomes grass */
for (let v = 0; v < NY; v++) for (let u = 0; u < NX; u++) {
  const c = g(u, v), h = ground[v][u];
  if (c === '~' || c === 'v') continue;   /* the sea and the river stay as they are */
  rows[v][u] = h < W.WATER + 0.25 ? 's' : '.';
}
/* the beach, from the quay east: everything the tide could reach */
/* the harbour basin (the operator: "no strip of land between the harbor and the sea"): everything seaward of the quay wall is
   water, dredged where the coast bulges, so the quay IS the waterfront */
/* ... and the harbour is a natural cove (the operator: "make the harbor look more natural, as though it was a naturally found
   harbor"): the shore bows inland in the middle where the quay is and runs out into two arms of land at the ends, with
   a ragged edge, a strip of sand and a few rocks along the arms */
const nz = (u, v) => { let r = Math.imul(u + 7, 73856093) ^ Math.imul(v + 3, 19349663); r = Math.imul(r ^ (r >>> 13), 1274126177); return ((r ^ (r >>> 16)) >>> 0) / 4294967296; };
const smooth = (v) => { const a = Math.floor(v / 6), t = v / 6 - a, s2 = t * t * (3 - 2 * t); return nz(a, 17) * (1 - s2) + nz(a + 1, 17) * s2; };
for (let v = 0; v < NY; v++) {
  const k = (v - NY / 2) / (NY / 2), shore = 103 + 30 * Math.pow(Math.abs(k), 2.2) + (smooth(v) - 0.5) * 6;
  for (let u = 98; u < NX; u++) {
    if (u >= shore) rows[v][u] = '~';
    else if (u >= shore - 3 - 2 * smooth(v + 40)) rows[v][u] = u >= 102 && nz(u, v) < 0.07 ? 'r' : 's';
  }
}
/* the clearing is not a bare field: trees and flowers scatter over it the way the seeded land does */
for (let v = 2; v < NY - 2; v++) for (let u = 2; u < NX - 2; u++) {
  if (g(u, v) !== '.') continue;
  let r = Math.imul(u + 1, 73856093) ^ Math.imul(v + 1, 19349663);
  r = Math.imul(r ^ (r >>> 13), 1274126177);
  r = ((r ^ (r >>> 16)) >>> 0) / 4294967296;
  const x = OX + u, y = OY + v;
  const near = (x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (r < 0.012 && !near(3390, 1816, 3522, 1821) && ground[v][u] > W.WATER + 1) put(u, v, r < 0.004 ? 'W' : 'T');
  else if (r > 0.985 && ground[v][u] > W.WATER + 1) put(u, v, 'f');
}
/* a fringe of trees along the north and west edges, so the wood comes up to the town instead of stopping in a line */
for (let u = 0; u < NX; u++) { if (g(u, 0) !== 'p') put(u, 0, u % 7 === 3 ? 'P' : 'T'); }
for (let v = 0; v < NY; v++) { if (g(0, v) !== 'p' && g(0, v) !== '~') put(0, v, v % 6 === 2 ? 'P' : 'T'); }

/* ---- the layout. Vale tiles; the quay street runs north–south along the beach, the high street west to the gate. */
street(3490, 1780, 3491, 1876);   /* the quay */
street(3390, 1818, 3491, 1819);   /* the high street, west gate at x 3390 */
street(3430, 1788, 3431, 1862);   /* the lane, north-south through the town */
street(3460, 1792, 3461, 1862);   /* the middle lane */
street(3462, 1790, 3491, 1790);   /* the slip, north (to the quay wall) */
street(3462, 1862, 3491, 1862);   /* the slip, south (to the quay wall) */
street(3480, 1806, 3489, 1806);   /* the fish market */
/* the harbour (the operator: "it should have a harbor and mooring docks"): four piers out from the quay over the water, each
   with a T-head to moor at - plank tiles 'B', walkable, standing just above the water */
const pier = (y, x1, hy0, hy1) => { rect(3492, y, x1, y + 1, 'B'); rect(x1 - 4, hy0, x1, hy1, 'B'); };
pier(1786, 3532, 1783, 1790); pier(1812, 3538, 1808, 1817); pier(1846, 3532, 1843, 1850); pier(1870, 3528, 1868, 1873);

const buildings = [
  { k: 'shop', x: 3466, y: 1821, w: 8, h: 6, door: [3469, 1821], sign: 'The Saltmere Tap', roof: '#4a3324', wall: '#e2d7bd', enter: true },
  { k: 'house', x: 3478, y: 1840, w: 10, h: 6, door: [3482, 1840], sign: 'Fish Store', roof: '#4d5560', wall: '#cbc3b0', enter: true },
  { k: 'house', x: 3468, y: 1866, w: 7, h: 5, door: [3470, 1866], sign: 'Shipwright', roof: '#6a4a2a', wall: '#d5cab2', enter: true },
  { k: 'house', x: 3412, y: 1794, w: 5, h: 5, door: [3414, 1794], roof: '#5b4a8a', wall: '#e0d6c0', enter: true },
  { k: 'shop', x: 3412, y: 1840, w: 5, h: 5, door: [3414, 1840], sign: 'Saltmere General Store', roof: '#3f6a4a', wall: '#ddd2bb', enter: true },
  { k: 'house', x: 3434, y: 1784, w: 5, h: 5, door: [3436, 1784], roof: '#7a5a2a', wall: '#d6cbb2', enter: true },
  { k: 'house', x: 3436, y: 1862, w: 5, h: 5, door: [3438, 1862], roof: '#7a3b2a', wall: '#d8c9a3', enter: true },
  { k: 'house', x: 3452, y: 1794, w: 5, h: 5, door: [3454, 1794], roof: '#4a6a7a', wall: '#ded4bf', enter: true },
  { k: 'house', x: 3440, y: 1830, w: 5, h: 5, door: [3442, 1830], roof: '#6a5a3a', wall: '#dbd1ba', enter: true },
  /* more of a town (the operator: "add more buildings to the second town so it doesn't look so plain") */
  { k: 'shop', x: 3474, y: 1794, w: 7, h: 5, door: [3477, 1798], sign: 'Harbour Master', roof: '#2f4a6a', wall: '#e4dccb', enter: true },
  { k: 'house', x: 3478, y: 1773, w: 11, h: 5, door: [3483, 1777], sign: 'North Warehouse', roof: '#5a4a3a', wall: '#b9ad95' },
  { k: 'house', x: 3478, y: 1874, w: 11, h: 5, door: [3483, 1874], sign: 'South Warehouse', roof: '#5a4a3a', wall: '#b9ad95' },
  { k: 'smithy', x: 3446, y: 1868, w: 7, h: 5, door: [3449, 1868], sign: 'Saltmere Armoury', roof: '#3a3a3a', wall: '#a59a88' },
  /* the enchantery (2026-10-05: "a magic store with some new magical items") — a small shop on the marsh end */
  { k: 'shop', x: 3424, y: 1866, w: 5, h: 5, door: [3426, 1866], sign: 'Saltmere Enchantery', roof: '#4a2f6a', wall: '#ddd6e2', enter: true },
  { k: 'house', x: 3394, y: 1781, w: 5, h: 5, door: [3396, 1785], roof: '#7a4a2a', wall: '#ddd2bb' },
  { k: 'house', x: 3394, y: 1800, w: 6, h: 5, door: [3396, 1800], roof: '#4a5a7a', wall: '#e0d6c0' },
  { k: 'house', x: 3394, y: 1826, w: 5, h: 5, door: [3396, 1826], roof: '#6a3a3a', wall: '#d6cbb2' },
  { k: 'house', x: 3394, y: 1846, w: 6, h: 6, door: [3396, 1846], roof: '#3f5a3a', wall: '#ded4bf', enter: true },
  { k: 'house', x: 3394, y: 1866, w: 5, h: 5, door: [3396, 1866], roof: '#7a5a2a', wall: '#d8c9a3' },
  { k: 'house', x: 3416, y: 1806, w: 6, h: 5, door: [3418, 1810], roof: '#5a3a5a', wall: '#dbd1ba' },
  { k: 'house', x: 3418, y: 1852, w: 5, h: 5, door: [3420, 1852], roof: '#3a5a6a', wall: '#e2d7bd' },
  { k: 'house', x: 3444, y: 1806, w: 6, h: 5, door: [3446, 1810], roof: '#6a4a3a', wall: '#cbc3b0' },
  { k: 'house', x: 3446, y: 1846, w: 5, h: 5, door: [3448, 1846], roof: '#4d5560', wall: '#d5cab2' }
];
/* a city, not a village (the operator: "it should look a little more metropolitan"): terraced rows of tall houses on both
   sides of the high street, and storeys on everything - two or three, the inn and the harbour office three */
for (const [x, w] of [[3394, 6], [3401, 6], [3408, 6], [3422, 6], [3433, 6], [3440, 6], [3447, 6], [3454, 5]])
  buildings.push({ k: 'house', x, y: 1811, w, h: 5, door: [x + 2, 1815], roof: ['#5a3a2a', '#3f4a5a', '#6a4a3a', '#4a3a4a'][x % 4], wall: ['#e2d7bd', '#d6cbb2', '#cbc3b0', '#ded4bf'][(x >> 2) % 4] });
for (const [x, w] of [[3400, 6], [3407, 6], [3422, 6]])
  buildings.push({ k: 'house', x, y: 1821, w, h: 4, door: [x + 2, 1821], roof: ['#3a4a3a', '#5a4a3a', '#4a3a3a'][x % 3], wall: ['#ddd2bb', '#e0d6c0', '#d8c9a3'][x % 3] });
for (const b of buildings) {
  const hv = Math.imul(b.x * 31 + b.y, 2654435761) >>> 0;
  b.floors = b.sign === 'The Saltmere Tap' || b.sign === 'Harbour Master' ? 3 : b.k === 'smithy' ? 1 : (hv % 3 === 0 ? 3 : 2);
  if (b.floors > 1) b.enter = true;   /* every multi-storey building can be walked into and climbed (the operator) */
}
/* nothing stands in the river: a building or a prop on any river tile is left out */
const inRiver = (x, y, w, h) => { for (let yy = y; yy < y + (h || 1); yy++) for (let xx = x; xx < x + (w || 1); xx++) { const u = xx - OX, v = yy - OY; if (u >= 0 && v >= 0 && u < NX && v < NY && RIVER[v][u] && u < 102) return true; } return false; };
/* a building the river runs through is MOVED (the operator): to the nearest spot that is dry, off the streets and clear of
   the other buildings, its door and the things inside it going with it */
const MOVED = [];
const freeAt = (x, y, w, h, self) => {
  if (x - OX < 1 || y - OY < 1 || x + w - OX > 100 || y + h - OY > NY - 1) return false;
  if (inRiver(x - 1, y - 1, w + 2, h + 2)) return false;
  for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) { const c = rows[yy - OY] && rows[yy - OY][xx - OX]; if (c === 'p' || c === 'B') return false; }
  for (const o of buildings) if (o !== self && !(x + w + 1 <= o.x || o.x + o.w + 1 <= x || y + h + 1 <= o.y || o.y + o.h + 1 <= y)) return false;
  return true;
};
for (const b of buildings) {
  if (!inRiver(b.x - 1, b.y - 1, b.w + 2, b.h + 2)) continue;
  let done = false;
  for (let r = 1; r <= 40 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !freeAt(b.x + dx, b.y + dy, b.w, b.h, b)) continue;
    MOVED.push([b.x, b.y, b.w, b.h, dx, dy]); b.x += dx; b.y += dy; if (b.door) b.door = [b.door[0] + dx, b.door[1] + dy]; done = true;
  }
  if (!done) b.drop = true;
}
for (let i = buildings.length - 1; i >= 0; i--) if (buildings[i].drop) buildings.splice(i, 1);
for (const b of buildings) rect(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 'i');

const props = [
  /* the fish market, and the catch on the tables */
  { k: 'stall', x: 3486, y: 1804 }, { k: 'stall', x: 3486, y: 1808 }, { k: 'stall', x: 3486, y: 1812 },
  { k: 'table', x: 3484, y: 1806, w: 1, h: 1 },
  /* crates, barrels and nets along the quay */
  { k: 'crate', x: 3489, y: 1788 }, { k: 'barrel', x: 3489, y: 1794 }, { k: 'crate', x: 3489, y: 1800 },
  { k: 'barrel', x: 3489, y: 1810 }, { k: 'crate', x: 3489, y: 1824 }, { k: 'barrel', x: 3489, y: 1832 },
  { k: 'crate', x: 3489, y: 1852 }, { k: 'barrel', x: 3489, y: 1858 }, { k: 'crate', x: 3489, y: 1866 },
  { k: 'rack', x: 3508, y: 1786 }, { k: 'rack', x: 3508, y: 1846 },   /* nets drying on the piers */
  /* a range by the store, so the catch can be cooked where it lands */
  { k: 'range', x: 3476, y: 1843 },
  /* torches: the whole quay, and the high street after dark */
  { k: 'torch', x: 3490, y: 1784 }, { k: 'torch', x: 3490, y: 1800 }, { k: 'torch', x: 3490, y: 1816 },
  { k: 'torch', x: 3490, y: 1832 }, { k: 'torch', x: 3490, y: 1848 }, { k: 'torch', x: 3490, y: 1864 },
  { k: 'torch', x: 3450, y: 1818 }, { k: 'torch', x: 3420, y: 1819 }, { k: 'torch', x: 3400, y: 1818 },
  { k: 'torch', x: 3430, y: 1830 }, { k: 'torch', x: 3460, y: 1840 },
  /* inside the tap room */
  { k: 'counter', x: 3468, y: 1823, w: 2, h: 1 }, { k: 'table', x: 3471, y: 1824 }, { k: 'chair', x: 3472, y: 1824 },
  { k: 'barrel', x: 3472, y: 1822 }, { k: 'fireplace', x: 3466, y: 1826, face: 'n' },
  /* inside the store */
  { k: 'crate', x: 3480, y: 1842 }, { k: 'crate', x: 3481, y: 1842 }, { k: 'barrel', x: 3485, y: 1844 },
  { k: 'shelf', x: 3479, y: 1840, w: 3, h: 1 },
  /* in the cottages */
  { k: 'bed', x: 3413, y: 1796, w: 1, h: 2 }, { k: 'table', x: 3415, y: 1797 },
  { k: 'bed', x: 3413, y: 1842, w: 1, h: 2 }, { k: 'table', x: 3415, y: 1843 },
  { k: 'bed', x: 3435, y: 1786, w: 1, h: 2 }, { k: 'bed', x: 3437, y: 1864, w: 1, h: 2 },
  { k: 'bed', x: 3453, y: 1796, w: 1, h: 2 }, { k: 'bed', x: 3441, y: 1832, w: 1, h: 2 },
  { k: 'chair', x: 3443, y: 1833 },
  /* the docks: mooring gear on the piers and their heads, lights at the ends */
  { k: 'barrel', x: 3504, y: 1786 }, { k: 'crate', x: 3516, y: 1787 }, { k: 'torch', x: 3530, y: 1783 }, { k: 'barrel', x: 3528, y: 1789 },
  { k: 'crate', x: 3500, y: 1813 }, { k: 'barrel', x: 3512, y: 1812 }, { k: 'rack', x: 3522, y: 1813 }, { k: 'torch', x: 3536, y: 1808 }, { k: 'crate', x: 3535, y: 1816 },
  { k: 'barrel', x: 3506, y: 1847 }, { k: 'crate', x: 3518, y: 1846 }, { k: 'torch', x: 3530, y: 1843 }, { k: 'barrel', x: 3527, y: 1849 },
  { k: 'crate', x: 3502, y: 1871 }, { k: 'torch', x: 3526, y: 1868 },
  /* a market along the high street, and the harbour master's desk */
  { k: 'stall', x: 3438, y: 1821 }, { k: 'stall', x: 3444, y: 1821 }, { k: 'stall', x: 3450, y: 1821 }, { k: 'stall', x: 3416, y: 1821 },
  { k: 'counter', x: 3476, y: 1796, w: 2, h: 1 }, { k: 'shelf', x: 3475, y: 1794, w: 3, h: 1 },
  { k: 'anvil', x: 3449, y: 1870 }, { k: 'furnace', x: 3451, y: 1871 },
  { k: 'crate', x: 3480, y: 1775 }, { k: 'crate', x: 3482, y: 1775 }, { k: 'barrel', x: 3486, y: 1776 },
  { k: 'crate', x: 3480, y: 1876 }, { k: 'barrel', x: 3484, y: 1876 }, { k: 'crate', x: 3486, y: 1877 }
];
for (const p of props) { p.w = p.w || 1; p.h = p.h || 1; }
for (const p of props) for (const [bx, by, bw, bh, dx, dy] of MOVED) if (p.x >= bx && p.y >= by && p.x < bx + bw && p.y < by + bh) { p.x += dx; p.y += dy; break; }   /* the furniture goes with its house */
for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (inRiver(p.x, p.y, p.w, p.h)) props.splice(i, 1); }
/* the river is put back over the streets and the clearing: where a street crosses it, a plank bridge */
for (let v = 0; v < NY; v++) for (let u = 0; u < 102; u++) if (RIVER[v][u]) rows[v][u] = rows[v][u] === 'p' || rows[v][u] === 'B' ? 'B' : RIV0[v][u];

const npcs = [
  { id: 'hollis', name: 'Hollis the taverner', look: 'hollis', x: 3469, y: 1820, shop: 'tavern' },
  { id: 'nettie', name: 'Nettie the fishmonger', look: 'nettie', x: 3487, y: 1808, shop: 'fish' },
  { id: 'sela', name: 'Sela the chandler', look: 'sela', x: 3483, y: 1846, shop: 'chandler' },
  /* Saltmere's own folk (2026-10-05: "Populate Saltmere with NPCs ... a general store and an armoury ... a new
     town elder"). A chest beside the town portal, same as Ashvale's, and the two shops the coast was short of. */
  /* the elder gives the last quest on the trail, so he sells nothing and chats of nothing: talking to him IS the
     errand. His gift waits for the whole of it - the harbour end of the road, same trick as Maren's stone. */
  { id: 'cobb', name: 'Cobb the town elder', look: 'cobb', x: 3477, y: 1823, talk: 'quest', quest: 'salt_road',
    gift: 'saltmere_stone', giftAfter: { quest: 'salt_road', step: 4 },
    giftLine: "Hold it at the harbour wall and think of the tide running, {name}. It will put you back on this stone every half hour, and it is the only entry in my accounts I ever wanted to write.",
    examine: "Cobb the town elder, salt in his beard and the harbour accounts in his head." },
  { id: 'bela', name: 'Bela the storekeeper', look: 'bela', x: 3414, y: 1839, shop: 'salt_general' },
  { id: 'orin', name: 'Orin the armourer', look: 'orin', x: 3449, y: 1867, shop: 'salt_armoury' },
  /* the sailmaker gives the third Saltmere thread (handoff/qwen_trail_log.md), so she idles about nothing: a giver
     who chats of her own trade never reaches the quest. Her two lines went into it — the first is her last word. */
  { id: 'mabb', name: 'Mabb the sailmaker', look: 'mabb', x: 3470, y: 1858, talk: 'quest', quest: 'sail_loft',
    examine: "Mabb the sailmaker, mending something white and enormous with more needle than is strictly necessary." },
  { id: 'tolly', name: 'Tolly the dockhand', look: 'tolly', x: 3488, y: 1836,
    examine: "Tolly the dockhand, on his fourth crate of the morning and no worse for it.",
    lines: ["Everything in this town came off a boat or goes off one. I move both ends of that.",
            "Mind the third pier, the third plank. Nobody has fixed it and nobody will, so long as it holds a rope."]},
  /* the net-mender sends the water-side quest, so she chats of nothing: talking to her IS the errand (same rule as
     Cobb - a giver must sell nothing and idle-chat nothing, or the conversation never reaches the quest). Her two
     lines went into the quest, where they do more work. */
  { id: 'perla', name: 'Perla the net-mender', look: 'perla', x: 3484, y: 1856, talk: 'quest', quest: 'empty_water',
    examine: "Perla the net-mender, knots going so fast they are almost a kind of speech." },
  /* the town chest, beside the portal (2026-10-05). The portal itself is rules.portals: saltmere. */
  { id: 'salt_chest', name: 'Saltmere chest', look: 'chest', x: 3479, y: 1826, chest: true,
    examine: "The Saltmere chest, tarred against the damp. Everything you own from Ashvale is kept in your arcade wallet; this is where you see it." },
  /* the shipwright gives a quest, so he sells nothing and chats of nothing — talking to him IS the errand */
  { id: 'bryce', name: 'Bryce the shipwright', look: 'bryce', x: 3466, y: 1864, quest: 'rudder',
    examine: "Bryce the shipwright, half a lifetime of Saltmere hulls behind him and one rudder in front of him." },
  { id: 'nessa', name: 'Nessa the enchanter', look: 'nessa', x: 3426, y: 1865, shop: 'salt_magic',
    examine: "Nessa the enchanter, who learned her trade off the wreck of a wizard's chest that the sea gave back." },
];
for (const n of npcs) if ('TPORNIr~FHXWMYCGA^K'.indexOf(g(n.x - OX, n.y - OY)) >= 0) put(n.x - OX, n.y - OY, '.');   /* an NPC's own tile must never be blocked */

/* A spot you cannot stand beside is not a spot: fishing needs a tile one step off the mark (core.inReach at range 1),
   and worldgen's own rule for a mark is that dry land lies on one side of it (wg_sites). These were out past the pier
   heads, where no plank reaches and the town's map ends, so nothing in Saltmere could be fished (2026-10-05).
   Each one is now the nearest water to an anchor that has a bank beside it - the pier heads, the quay, the beach. */
const BLK = 'TPORNIr~FHXWMYCGA^K';   /* the same list the walk uses (worldgen BLOCK) */
const banked = (u, v) => [[u + 1, v], [u - 1, v], [u, v + 1], [u, v - 1]].some(([a, b]) =>
  a >= 0 && b >= 0 && a < NX && b < NY && g(a, b) !== '~' && BLK.indexOf(g(a, b)) < 0);
const used = new Set();
const spot = (x, y, fish, extra) => {
  for (let r = 0; r <= 12; r++) {
    for (let v = y - OY - r; v <= y - OY + r; v++) for (let u = x - OX - r; u <= x - OX + r; u++) {
      if (Math.max(Math.abs(u - (x - OX)), Math.abs(v - (y - OY))) !== r) continue;
      if (u < 0 || v < 0 || u >= NX || v >= NY || g(u, v) !== '~' || !banked(u, v) || used.has(u + ',' + v)) continue;
      used.add(u + ',' + v); return Object.assign({ x: OX + u, y: OY + v, fish }, extra || {});
    }
  }
  throw new Error('no fishable water within 12 m of ' + x + ',' + y);
};
const fishing = [
  spot(3534, 1786, 'shrimp_raw'), spot(3534, 1794, 'shrimp_raw'),
  spot(3540, 1812, 'salmon_raw', { req: 30, xp: 350, tool: 'fishing_rod' }),
  spot(3540, 1824, 'salmon_raw', { req: 30, xp: 350, tool: 'fishing_rod' }),
  spot(3534, 1846, 'lobster_raw', { req: 40, xp: 500, tool: 'lobster_pot' }),
  spot(3530, 1870, 'shrimp_raw'), spot(3500, 1834, 'shrimp_raw')
];

/* back to the world: tiles, objects, people and fishing spots through the same rotation */
const wrows = []; for (let y = 0; y < WSY; y++) wrows.push(new Array(WSX).fill('.'));
for (let v = 0; v < NY; v++) for (let u = 0; u < NX; u++) { const [x, y] = L2W(OX + u, OY + v); wrows[y - BY][x - BX] = rows[v][u]; }
const FACE = { 0: { n: 'n', s: 's', e: 'e', w: 'w' }, 1: { n: 'n', s: 's', e: 'w', w: 'e' }, 2: { n: 'w', s: 'e', e: 'n', w: 's' }, 3: { n: 'w', s: 'e', e: 's', w: 'n' } }[K];
function moveRect(o) {
  const a = L2W(o.x, o.y), b = L2W(o.x + o.w - 1, o.y + o.h - 1), r = Object.assign({}, o);
  r.x = Math.min(a[0], b[0]); r.y = Math.min(a[1], b[1]); r.w = Math.abs(a[0] - b[0]) + 1; r.h = Math.abs(a[1] - b[1]) + 1;
  if (o.door) r.door = L2W(o.door[0], o.door[1]);
  if (o.face) r.face = FACE[o.face] || o.face;
  return r;
}
const movePt = o => { const [x, y] = L2W(o.x, o.y); return Object.assign({}, o, { x, y }); };
/* The town's portal square: where the stones stand, at the chest end of the high street. rules.json's portals entry
   for saltmere has to say that same place, because the engine stands the stones from rules, not from this file - so
   the two files hold one fact. This town has been moved a number of times ("Saltmere may move anywhere it needs to",
   2026-10-03) and a move that forgot rules.json would leave the stones standing in the marsh with nobody
   waiting at the far end. The check under this makes that a build failure instead. */
const PORTAL = [3475, 1824];
const zone = {
  name: 'Saltmere', level: 'safe', origin: [BX, BY], size: [WSX, WSY], ground: 'coast',
  tiles: wrows.map(r => r.join('')), objects: props.concat(buildings).map(moveRect),
  npcs: npcs.map(movePt), fishing: fishing.map(movePt), spawns: [],
  weather: { kinds: { clear: 48, rain: 32, fog: 20 }, min: 240, max: 720 }
};
{
  const PR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rules.json'), 'utf8')).data.portals;
  const [px, py] = L2W(PORTAL[0], PORTAL[1]), w = (PR || []).find(p => p.id === 'saltmere');
  if (!w || w.x !== px || w.y !== py || w.to[0] !== px || w.to[1] !== py + 1)
    throw new Error('the town portal square is at ' + px + ',' + py + ' but rules.portals says ' + JSON.stringify(w) +
      ' - put in rules.json: {"id": "saltmere", "name": "Saltmere", "x": ' + px + ', "y": ' + py + ', "to": [' + px + ', ' + (py + 1) + ']}');
}
/* nothing here is invented: every tile the town stands on was looked at in the generated land first */
if (process.argv.includes('--map')) {
  console.log('sea side ' + ['east', 'west', 'north', 'south'][K] + ', 1 char = 1 m, x ' + BX + '..' + (BX + WSX) + '  y ' + BY + '..' + (BY + WSY));
  wrows.forEach((r, v) => console.log(String(BY + v).padStart(5) + ' ' + r.join('')));
} else {
  const out = { ashvale3d: 'module', name: 'zone.saltmere', api: 1, v: 2, data: zone };
  fs.writeFileSync(path.join(ROOT, 'data/zone.saltmere.json'), JSON.stringify(out));
  console.log('wrote data/zone.saltmere.json  (' + WSX + ' x ' + WSY + ' tiles at ' + BX + ',' + BY + ', sea ' + ['east', 'west', 'north', 'south'][K] + ', harbour ' + hx + ',' + hy + ')');
}
