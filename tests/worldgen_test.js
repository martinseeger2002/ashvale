/* worldgen v1 test: node tests/worldgen_test.js            (node tests/worldgen_test.js --write-golden rewrites
   tests/worldgen_golden.json: do that ONLY on purpose. The golden file is what guarantees that land which already has
   builds never changes silently; a new worldgen version must bump V and keep v1 reproducible.)
   Checks: the projection matches the globe; determinism (two instances, different call orders, bit-identical); heights
   continuous across chunk borders and across a face seam (sampled from both faces); a chunk anchored on either face of
   a seam reads the same land; the 12 corner peaks block; deep sea blocks; set-piece edges have no height step and no
   flora rectangle; tile speed; sites have stable ids and valid monsters; the golden sample. */
'use strict';
const fs = require('fs'), path = require('path');
const AshGlobe = require('../src/globe.js');
const AW = require('../src/worldgen.js');
const SH = require('../src/atlas_shapes.js'), CH = require('../src/atlas_chunk.js');
const PAL = require('../data/atlas/atlas_palette.json').data;
const GOLDEN = path.join(__dirname, 'worldgen_golden.json');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const now = () => Number(process.hrtime.bigint()) / 1e6;

const G = AshGlobe.createGlobe({ n: 128, radius_m: 36110, seed: 'ashvale' });
const CL = G.classes();
const W = AW.createWorldgen(G), W2 = AW.createWorldgen(G);
ok(W.V === 1 && W.WATER === 0, 'worldgen v' + W.V + ', water at ' + W.WATER + ' m');

/* 1. projection = the globe's (planar centre of a cell -> its sphere centre) */
let pe = 0;
for (let c = 0; c < G.count; c += 331) { const p = G.planar(c), u = W.toSphere(p.face, p.x, p.y), q = G.center(c); pe = Math.max(pe, Math.abs(u[0] - q[0]), Math.abs(u[1] - q[1]), Math.abs(u[2] - q[2])); }
ok(pe < 1e-12, 'planar -> sphere matches G.center (max error ' + pe.toExponential(2) + ')');

/* sample points: the core centre, one cell of each class, points near a seam */
function cellOf(cls, k) { let n = 0; for (let c = 0; c < G.count; c += 97) if (G.cls(c) === cls && n++ === k) return c; return -1; }
const pts = [];
for (const cls of ['core', 'creator', 'wild', 'sea', 'peak']) for (let k = 0; k < 3; k++) { const c = cellOf(cls, k * 5), p = G.planar(c); pts.push([p.face, p.x, p.y], [p.face, p.x + 37.3, p.y - 11.9]); }
{ const p = G.planar(CL.coreCenter); for (let k = 0; k < 6; k++) pts.push([p.face, p.x + k * 53.1, p.y - k * 17.7]); }

/* 2. determinism: two instances, opposite call orders, bit-identical */
const A = pts.map(q => { const s = W.sample(q[0], q[1], q[2]); return [s.h, s.biome, s.cls, s.forest, s.face, s.x, s.y]; });
const B = pts.slice().reverse().map(q => { const s = W2.sample(q[0], q[1], q[2]); return [s.h, s.biome, s.cls, s.forest, s.face, s.x, s.y]; }).reverse();
ok(JSON.stringify(A) === JSON.stringify(B), 'two instances, opposite call orders: ' + pts.length + ' samples bit-identical');
const sp = W.coreSpawn(), gx0 = Math.floor(sp.x), gy0 = Math.floor(-sp.y);
const tA = W.tiles(sp.face, gx0 - 40, gy0 - 40, 80, 80).join(''), tB = W2.tiles(sp.face, gx0 - 40, gy0 - 40, 80, 80).join('');
ok(tA === tB, 'tiles: 80x80 around the core centre identical in both instances');

/* 3. heights continuous across chunk borders (chunks built by atlas_chunk share their border vertices exactly) */
const B1 = CH.create(W, SH.create(PAL), PAL);
const cx = Math.floor(sp.x / 64), cy = Math.floor(sp.y / 64);
const t0 = now(), c1 = B1.job(sp.face, cx, cy).run(), c2 = B1.job(sp.face, cx + 1, cy).run(), c3 = B1.job(sp.face, cx, cy + 1).run(), tChunk = (now() - t0) / 3;
let be = 0;
for (let j = 0; j <= 32; j++) be = Math.max(be, Math.abs(c1.heights[j * 33 + 32] - c2.heights[j * 33]), Math.abs(c1.heights[32 * 33 + j] - c3.heights[j]));
ok(be === 0, 'chunk borders: the shared vertex heights of neighbouring chunks are identical (max diff ' + be + ')');
let ls = 0;
for (let k = 0; k < 400; k++) { const x = (cx + 1) * 64 - 20 + k * 0.1, h1 = W.height(sp.face, x, sp.y), h2 = W.height(sp.face, x + 0.1, sp.y); ls = Math.max(ls, Math.abs(h2 - h1)); }
ok(ls < 0.08, 'heights along a 40 m line across a chunk border: max step per 0.1 m = ' + ls.toFixed(4) + ' m');
console.log('     chunk build (node, warm-ish): ' + tChunk.toFixed(1) + ' ms per 64 x 64 m chunk, ' + c1.tris + ' triangles, ' + c1.features + ' props');

/* 4. seams: the same physical point read from both faces; walking across */
function seamPoint(f, k, t) {
  const Q = W.faceCorners(f), a = Q[(k + 1) % 3], b = Q[(k + 2) % 3];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
let seamErr = 0, seamStep = 0, seamNat = 0, seamCount = 0, folded = 0;
for (let f = 0; f < 20; f++) for (let k = 0; k < 3; k++) {
  const g = W.neighbourFace(f, k), xf = W.xform(f, g);
  for (const t of [0.3, 0.5, 0.7]) {
    const p = seamPoint(f, k, t), q = [xf[0] * p[0] - xf[1] * p[1] + xf[2], xf[1] * p[0] + xf[0] * p[1] + xf[3]];
    const hf = W.height(f, p[0], p[1]), hg = W.height(g, q[0], q[1]);
    seamErr = Math.max(seamErr, Math.abs(hf - hg));
    /* step across: 0.1 m on each side, read from f's (unfolded) plane */
    const Qf = W.faceCorners(f), ox = Qf[k][0] - p[0], oy = Qf[k][1] - p[1], ol = Math.hypot(ox, oy), nx = ox / ol, ny = oy / ol;
    const hin = W.height(f, p[0] + nx * 0.1, p[1] + ny * 0.1), hout = W.height(f, p[0] - nx * 0.1, p[1] - ny * 0.1);
    /* A step here is only a seam bug if it is bigger than the step the same land makes on its own within 6 m of the
       same spot: a hillside that happens to cross a face edge is not a fold artifact. This is the standard the
       set-piece check below already holds itself to, and the 0.12 m floor is unchanged. */
    let nat = 0;
    for (let a = 0; a < 12; a++) {
      const ca = Math.cos(a * 0.5236), sa = Math.sin(a * 0.5236);
      for (let d = 1; d <= 6; d++) { const x = p[0] + ca * d, y = p[1] + sa * d; nat = Math.max(nat, Math.abs(W.height(f, x, y) - W.height(f, x + ca * 0.2, y + sa * 0.2))); }
    }
    seamStep = Math.max(seamStep, Math.abs(hin - hout) - nat);
    seamNat = Math.max(seamNat, nat);
    if (W.fold(f, p[0] - nx * 0.5, p[1] - ny * 0.5)[0] === g) folded++;
    seamCount++;
  }
}
ok(seamErr < 1e-6, 'seams: the same point read from both faces gives the same height (' + seamCount + ' points, max diff ' + seamErr.toExponential(2) + ' m)');
ok(seamStep < 0.12, 'seams: no step crossing an edge beyond the land itself (worst crossing step over 0.2 m, minus the steepest step the same land makes within 6 m = ' + seamStep.toFixed(4) + ' m; that natural step ' + seamNat.toFixed(4) + ' m)');
ok(folded === seamCount, 'seams: a point beyond an edge unfolds into the neighbouring face (' + folded + '/' + seamCount + ')');
/* chunks anchored on either side of a seam read the same land: core face edge */
{
  const f = sp.face, k = 0, g = W.neighbourFace(f, k), xf = W.xform(f, g), p = seamPoint(f, k, 0.5);
  const ccx = Math.floor(p[0] / 64), ccy = Math.floor(p[1] / 64), ch = B1.job(f, ccx, ccy).run();
  let md = 0;
  for (let j = 0; j <= 32; j += 4) for (let i = 0; i <= 32; i += 4) {
    const x = ccx * 64 + 2 * i, y = ccy * 64 + 2 * j, qx = xf[0] * x - xf[1] * y + xf[2], qy = xf[1] * x + xf[0] * y + xf[3];
    md = Math.max(md, Math.abs(ch.heights[j * 33 + i] - W.height(g, qx, qy)));
  }
  ok(md < 1e-6, 'a chunk straddling the face ' + f + '/' + g + ' seam: its heights equal the land read from face ' + g + ' (max diff ' + md.toExponential(2) + ')');
  let walk = 0, n = 0;
  const Qf = W.faceCorners(f), ox = Qf[k][0] - p[0], oy = Qf[k][1] - p[1], ol = Math.hypot(ox, oy);
  for (let t = 0.05; t < 0.95; t += 0.01) { const s = seamPoint(f, k, t); n++; let all = true; for (let d = -3; d <= 3; d += 0.5) if (!W.walkable(f, s[0] + ox / ol * d, s[1] + oy / ol * d)) all = false; if (all) walk++; }
  ok(walk > 0, 'the core face seam is walkable across in ' + walk + ' of ' + n + ' places along it');
}

/* 5. the 12 pentagons (the grid's singular points) are water, so nobody walks over one; deep sea blocks.
   2026-10-03: no corner peaks - a pentagon is open sea, or a small lake on land. */
let peakBad = 0, ringBad = 0;
for (let c = 0; c < G.count; c++) if (G.isPentagon(c)) {
  const p = G.planar(c);
  if (W.tileAt(p.face, Math.floor(p.x), Math.floor(-p.y)) !== '~' || W.walkable(p.face, p.x, p.y)) peakBad++;
  for (let a = 0; a < 16; a++) { const x = p.x + Math.cos(a / 16 * 6.283) * 120, y = p.y + Math.sin(a / 16 * 6.283) * 120; if (W.walkable(p.face, x, y)) ringBad++; }
}
ok(peakBad === 0 && ringBad === 0, 'the 12 pentagons: centre tile ~ and not walkable, nothing walkable within 120 m (' + peakBad + ' / ' + ringBad + ' bad)');
let seaN = 0, seaBad = 0;
for (let c = 0; c < G.count && seaN < 40; c += 7) {
  if (G.cls(c) !== 'sea' || !G.neighbors(c).every(m => G.cls(m) === 'sea' && G.neighbors(m).every(q => G.cls(q) === 'sea'))) continue;
  const p = G.planar(c); seaN++;
  const s = W.sample(p.face, p.x, p.y);
  if (W.walkable(p.face, p.x, p.y) || s.h > -0.3 || W.tileAt(p.face, Math.floor(p.x), Math.floor(-p.y)) !== '~') seaBad++;
}
ok(seaN > 10 && seaBad === 0, 'deep sea (' + seaN + ' cells two rings from land): water tile, below -0.3 m, not walkable (' + seaBad + ' bad)');

/* 6. set pieces (today's Whisperwood + village at the core centre): no step, no flora rectangle, tiles win inside */
const zones = ['whisperwood', 'village'].map(k => Object.assign({ id: k }, require('../data/zone.' + k + '.json').data));
const W3 = AW.createWorldgen(G), pgx = gx0 - 24, pgy = gy0 - 32;
W3.setSetPieces(W3.piecesFromZones(zones, sp.face, pgx, pgy, { belt: { whisperwood: 90, village: 30 } }));
const pieces = W3.pieces();
ok(pieces.length === 2 && pieces[0].hb === pieces[1].hb, 'set pieces registered; touching pieces share one base height (' + pieces[0].hb.toFixed(3) + ' m)');
let inside = 0, insideBad = 0;
for (const z of zones) for (let y = 0; y < z.size[1]; y += 3) for (let x = 0; x < z.size[0]; x += 3) { inside++; if (W3.tileAt(sp.face, pgx + z.origin[0] + x, pgy + z.origin[1] + y) !== z.tiles[y][x]) insideBad++; }
ok(insideBad === 0, 'inside the set pieces their own tiles win (' + inside + ' checked)');
const isTree = L => 'TPOWMY'.indexOf(L) >= 0;
const edgeRep = [];
let maxStep = 0, natStep = 0;
for (let y = -60; y < 60; y++) for (let x = -60; x < 60; x++) { const a = W.height(sp.face, sp.x + 400 + x + 0.5, sp.y + y + 0.5), b = W.height(sp.face, sp.x + 400 + x + 1.5, sp.y + y + 0.5); natStep = Math.max(natStep, Math.abs(a - b)); }
for (const pc of pieces) {
  const edges = { N: [], S: [], W: [], E: [] };
  for (let k = 0; k < pc.w; k++) { edges.N.push([pc.x + k, pc.y, 0, -1]); edges.S.push([pc.x + k, pc.y + pc.h - 1, 0, 1]); }
  for (let k = 0; k < pc.h; k++) { edges.W.push([pc.x, pc.y + k, -1, 0]); edges.E.push([pc.x + pc.w - 1, pc.y + k, 1, 0]); }
  for (const e in edges) {
    let step = 0, tin = 0, tout = 0, n = 0, other = 0;
    for (const [x, y, dx, dy] of edges[e]) {
      const ox = x + dx, oy = y + dy;
      if (pieces.some(q => q !== pc && ox >= q.x && oy >= q.y && ox < q.x + q.w && oy < q.y + q.h)) { other++; continue; }
      const hin = W3.height(sp.face, x + 0.5, -y - 0.5), hout = W3.height(sp.face, ox + 0.5, -oy - 0.5);
      step = Math.max(step, Math.abs(hin - hout));
      for (let d = 0; d < 5; d++) { if (isTree(W3.tileAt(sp.face, x - dx * d, y - dy * d))) tin++; if (isTree(W3.tileAt(sp.face, ox + dx * d, oy + dy * d))) tout++; }
      n++;
    }
    if (!n) { edgeRep.push(pc.id + ' ' + e + ': inner edge (touches the other piece)'); continue; }
    const di = tin / (n * 5), dout = tout / (n * 5);
    maxStep = Math.max(maxStep, step);
    edgeRep.push(pc.id + ' ' + e + ': max height step ' + step.toFixed(3) + ' m, trees inside ' + (100 * di).toFixed(0) + '% / outside ' + (100 * dout).toFixed(0) + '%');
    ok(Math.abs(di - dout) < 0.2, 'set piece ' + pc.id + ' ' + e + ' edge: tree density continues (' + (100 * di).toFixed(0) + '% in, ' + (100 * dout).toFixed(0) + '% out)');
  }
}
edgeRep.forEach(l => console.log('     ' + l));
ok(maxStep <= Math.max(0.12, natStep), 'set-piece edges: max tile-to-tile height step ' + maxStep.toFixed(3) + ' m <= the seeded land\'s own max step nearby (' + natStep.toFixed(3) + ' m)');

/* 7. speed: a 64 x 64 chunk of tiles */
W.tiles(sp.face, gx0 + 300, gy0, 64, 64);
let t1 = now(); W.tiles(sp.face, gx0 + 364, gy0, 64, 64); const tTiles = now() - t1;
ok(tTiles < 40, 'a fresh 64 x 64 chunk of tiles: ' + tTiles.toFixed(1) + ' ms (cached lattice afterwards: ' + (function () { const t = now(); W.tiles(sp.face, gx0 + 364, gy0, 64, 64); return (now() - t).toFixed(1); })() + ' ms)');

/* 8. sites: stable ids, valid monsters, levels grow with distance from the core */
const MON = new Set(Object.keys(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'monsters.json'), 'utf8')).data.monsters));
const S1 = W.sites(sp.face, gx0 - 1500, gy0 - 1500, gx0 + 1500, gy0 + 1500), S2 = W2.sites(sp.face, gx0 - 1500, gy0 - 1500, gx0 + 1500, gy0 + 1500);
ok(JSON.stringify(S1) === JSON.stringify(S2) && S1.length > 20, 'sites around the core (3 x 3 km): ' + S1.length + ', identical in both instances');
const kinds = {}; S1.forEach(s => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; });
console.log('     kinds: ' + JSON.stringify(kinds));
const badMon = S1.filter(s => s.spawns.some(m => !MON.has(m.m) || !m.uid.startsWith(s.id)));
ok(badMon.length === 0, 'camp spawns use existing monster keys and uids derived from the site id');
/* wildlife (2026-10-04): herds on the seeded land, by climate zone and ground; none on water or in a set piece */
const HERD = S1.filter(s => s.kind === 'herd'), hk = {};
HERD.forEach(s => { hk[s.monster + '/' + s.ground] = (hk[s.monster + '/' + s.ground] || 0) + 1; });
console.log('     herds: ' + HERD.length + ' ' + JSON.stringify(hk));
ok(HERD.length > 20 && new Set(HERD.map(s => s.monster)).size >= 3, 'wildlife herds around the core, several species (' + HERD.length + ')');
ok(HERD.every(s => s.spawns.every(m => { const L = W.tileAt ? null : null; return m.m === s.monster; })), 'a herd is one species');
const ids = new Set(S1.map(s => s.id));
ok(ids.size === S1.length, 'site ids are unique');
/* Four windows at 9-12 km, not one: Ashvale stands on a coast now, so the sea takes one of the sides and a window
   that falls in the water holds no camps at all (it would read as level 0.0 and prove nothing). */
const far = [[9000, 12000, -1500, 1500], [-12000, -9000, -1500, 1500], [-1500, 1500, -12000, -9000], [-1500, 1500, 9000, 12000]]
  .reduce((a, w) => a.concat(W.sites(sp.face, gx0 + w[0], gy0 + w[2], gx0 + w[1], gy0 + w[3])), []).filter(s => s.kind === 'camp');
const near = S1.filter(s => s.kind === 'camp');
const avg = L => L.reduce((a, s) => a + s.level, 0) / Math.max(1, L.length);
ok(near.length && far.length && avg(far) > avg(near), 'camps 9-12 km out are tougher (avg level ' + avg(far).toFixed(1) +
  ' over ' + far.length + ' camps) than around the core (' + avg(near).toFixed(1) + ')');

/* 9. golden sample */
const sum = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const golden = {
  v: W.V, seed: W.seed, samples: A.map((r, i) => ({ p: pts[i], h: r[0], biome: r[1], cls: r[2], forest: r[3] })),
  tiles: { at: [sp.face, gx0 - 40, gy0 - 40, 80, 80], fnv: sum(tA), head: W.tiles(sp.face, gx0 - 8, gy0 - 8, 16, 16) },
  pieces: { tilesFnv: sum(W3.tiles(sp.face, pgx - 30, pgy - 30, 110, 125).join('')), hb: pieces[0].hb },
  sites: S1.slice(0, 12).map(s => ({ id: s.id, kind: s.kind, x: s.x, y: s.y, level: s.level, spawns: s.spawns.map(m => m.m + '@' + m.x + ',' + m.y) })),
  sitesFnv: sum(JSON.stringify(S1.filter(s => s.kind !== 'herd')))   /* the herds (2026-10-04) came after this golden; camps, ore and fish must not move */
};
if (process.argv.includes('--write-golden')) { fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 1)); console.log('wrote ' + GOLDEN); }
else if (!fs.existsSync(GOLDEN)) { ok(false, 'no golden file (run with --write-golden once, on purpose)'); }
else {
  const g = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  ok(g.v === golden.v && g.seed === golden.seed, 'golden: worldgen v' + g.v + ', seed "' + g.seed + '"');
  let bad = 0; g.samples.forEach((s, i) => { const t = golden.samples[i]; if (!t || s.h !== t.h || s.biome !== t.biome || s.cls !== t.cls || s.forest !== t.forest) bad++; });
  ok(bad === 0, 'golden: ' + g.samples.length + ' land samples unchanged (bit-exact heights)');
  ok(g.tiles.fnv === golden.tiles.fnv, 'golden: 80 x 80 core tiles unchanged');
  ok(g.pieces.tilesFnv === golden.pieces.tilesFnv && g.pieces.hb === golden.pieces.hb, 'golden: set-piece surroundings unchanged');
  ok(g.sitesFnv === golden.sitesFnv, 'golden: sites around the core unchanged');
}
console.log(fails ? fails + ' FAILED' : 'all worldgen checks passed');
process.exit(fails ? 1 : 0);
