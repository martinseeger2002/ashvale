/* Globe grid test: node tests/globe_test.js            (node --expose-gc gives a clean memory number)
   node tests/globe_test.js --write-golden   rewrites tests/globe_golden.json. Do that ONLY on purpose: the golden
   file is what guarantees that parcel ids, centres and neighbours never change once the grid spec is inscribed. */
'use strict';
const fs = require('fs'), path = require('path');
const AshGlobe = require('../src/globe.js');
const GOLDEN = path.join(__dirname, 'globe_golden.json');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function solidAngle(G, c, t) {
  const deg = G.cornersInto(c, t, 0), a = G.center(c);
  let s = 0;
  for (let k = 0; k < deg; k++) {
    const k2 = (k + 1) % deg, b = [t[k * 3], t[k * 3 + 1], t[k * 3 + 2]], d = [t[k2 * 3], t[k2 * 3 + 1], t[k2 * 3 + 2]];
    const tr = a[0] * (b[1] * d[2] - b[2] * d[1]) + a[1] * (b[2] * d[0] - b[0] * d[2]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
    s += 2 * Math.atan2(Math.abs(tr), 1 + dot(a, b) + dot(b, d) + dot(d, a));
  }
  return s;
}

function structural(n) {
  const t0 = process.hrtime.bigint();
  const G = AshGlobe.createGlobe({ n, radius_m: 36110, seed: 'ashvale' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const N = G.count;
  ok(N === 10 * n * n + 2, 'n=' + n + ': count ' + N + ' = 10n^2+2 (created in ' + ms.toFixed(1) + ' ms)');
  let pent = 0, bad = 0, asym = 0, pentRule = 0;
  const nbSets = [];
  for (let c = 0; c < N; c++) {
    const nb = G.neighbors(c);
    if (G.isPentagon(c)) { pent++; if (nb.length !== 5) bad++; } else if (nb.length !== 6) bad++;
    if (new Set(nb).size !== nb.length || nb.includes(c)) bad++;
    nbSets.push(nb);
    const q = G.dij(c), shouldBe = q.pole ? true : (q.i === 0 && q.j === 0);
    if (shouldBe !== G.isPentagon(c)) pentRule++;
  }
  for (let c = 0; c < N; c++) for (const m of nbSets[c]) if (!nbSets[m].includes(c)) asym++;
  ok(pent === 12, 'n=' + n + ': exactly 12 pentagons (' + pent + ')');
  ok(pentRule === 0, 'n=' + n + ': pentagons are exactly the poles and (i=0, j=0) of every diamond');
  ok(bad === 0, 'n=' + n + ': pentagons have 5 neighbours, everything else 6, no self/duplicates (' + bad + ' bad)');
  ok(asym === 0, 'n=' + n + ': neighbour symmetry a in N(b) <=> b in N(a) (' + asym + ' broken)');
  /* connected */
  const seen = new Uint8Array(N), st = [0]; seen[0] = 1; let reach = 0;
  while (st.length) { const c = st.pop(); reach++; for (const m of nbSets[c]) if (!seen[m]) { seen[m] = 1; st.push(m); } }
  ok(reach === N, 'n=' + n + ': every cell reachable (' + reach + ')');
  /* unique centres, unit length */
  const keys = new Set(); let notUnit = 0;
  for (let c = 0; c < N; c++) { const p = G.center(c); if (Math.abs(dot(p, p) - 1) > 1e-12) notUnit++; keys.add(p.map(v => v.toFixed(9)).join(',')); }
  ok(keys.size === N && notUnit === 0, 'n=' + n + ': no duplicate centres, all on the unit sphere (' + keys.size + ' distinct)');
  /* neighbour distance sane: mean spacing ~ sqrt(4 pi / N); every neighbour within 0.6 .. 1.6 of it */
  const mean = Math.sqrt(4 * Math.PI / N * 2 / Math.sqrt(3));
  let dmin = 9, dmax = 0;
  for (let c = 0; c < N; c++) { const p = G.center(c); for (const m of nbSets[c]) { const a = Math.acos(Math.min(1, dot(p, G.center(m)))); if (a < dmin) dmin = a; if (a > dmax) dmax = a; } }
  ok(dmin > 0.6 * mean && dmax < 1.6 * mean, 'n=' + n + ': neighbour angular distance ' + (dmin / mean).toFixed(3) + '..' + (dmax / mean).toFixed(3) + ' x the mean spacing');
  /* cellAt round trip on a sample (all cells for small n) */
  const step = N > 5000 ? 37 : 1; let miss = 0, tried = 0;
  for (let c = 0; c < N; c += step) { tried++; if (G.cellAt(G.center(c)) !== c) miss++; }
  for (let c = 0; c < N; c++) if (G.isPentagon(c) && G.cellAt(G.center(c)) !== c) miss++;
  ok(miss === 0, 'n=' + n + ': cellAt(center(c)) === c for ' + tried + ' sampled cells + the 12 pentagons');
  /* cellAt of a point slightly off a centre (towards a corner, 40% of the way) still returns that cell */
  let miss2 = 0; const t = new Float64Array(18);
  for (let c = 0; c < N; c += step) { const deg = G.cornersInto(c, t, 0), p = G.center(c); for (let k = 0; k < deg; k++) { const q = [p[0] * 0.6 + t[k * 3] * 0.4, p[1] * 0.6 + t[k * 3 + 1] * 0.4, p[2] * 0.6 + t[k * 3 + 2] * 0.4]; if (G.cellAt(q) !== c) miss2++; } }
  ok(miss2 === 0, 'n=' + n + ': cellAt of points inside the outline returns the cell (' + miss2 + ' misses)');
  /* area spread */
  let hmin = 9, hmax = 0, pmin = 9, pmax = 0, total = 0;
  for (let c = 0; c < N; c++) { const s = solidAngle(G, c, t); total += s; if (G.isPentagon(c)) { pmin = Math.min(pmin, s); pmax = Math.max(pmax, s); } else { hmin = Math.min(hmin, s); hmax = Math.max(hmax, s); } }
  const meanA = 4 * Math.PI / N;
  ok(Math.abs(total - 4 * Math.PI) < 1e-6, 'n=' + n + ': the cells tile the sphere (total solid angle ' + total.toFixed(9) + ' = 4 pi)');
  if (n >= 4) ok(hmax / hmin < 1.3, 'n=' + n + ': hexagon area spread max/min = ' + (hmax / hmin).toFixed(4) + ' (all cells incl. pentagons ' + (Math.max(hmax, pmax) / Math.min(hmin, pmin)).toFixed(4) + '; pentagon = ' + (pmin / meanA).toFixed(3) + ' x mean cell)');
  /* face + planar sanity: cells planar points lie inside their face triangle, neighbours on one face are spacing apart */
  let outside = 0, spacingBad = 0;
  for (let c = 0; c < N; c += step) {
    const pl = G.planar(c), Q = G.facePlanarCorners(pl.face);
    const s1 = (Q[1][0] - Q[0][0]) * (pl.y - Q[0][1]) - (Q[1][1] - Q[0][1]) * (pl.x - Q[0][0]);
    const s2 = (Q[2][0] - Q[1][0]) * (pl.y - Q[1][1]) - (Q[2][1] - Q[1][1]) * (pl.x - Q[1][0]);
    const s3 = (Q[0][0] - Q[2][0]) * (pl.y - Q[2][1]) - (Q[0][1] - Q[2][1]) * (pl.x - Q[2][0]);
    const tol = -1e-6 * G.faceEdge_m * G.faceEdge_m;
    if (!((s1 >= tol && s2 >= tol && s3 >= tol) || (s1 <= -tol && s2 <= -tol && s3 <= -tol))) outside++;
    for (const m of nbSets[c]) if (G.face(m) === pl.face) { const q = G.planar(m), dd = Math.hypot(q.x - pl.x, q.y - pl.y); if (Math.abs(dd - G.spacing_m) > 1e-6 * G.spacing_m) spacingBad++; }
  }
  ok(outside === 0 && spacingBad === 0, 'n=' + n + ': planar centres inside their face, same-face neighbours exactly ' + G.spacing_m.toFixed(2) + ' m apart (' + outside + ' outside, ' + spacingBad + ' off)');
  return { G, ms, spread: hmax / hmin, spreadAll: Math.max(hmax, pmax) / Math.min(hmin, pmin) };
}

for (const n of [1, 2, 4, 8, 64]) structural(n);
const big = structural(128);
const G = big.G;

/* creation time + memory at n = 128 */
{
  const runs = [];
  for (let r = 0; r < 3; r++) { const t0 = process.hrtime.bigint(); AshGlobe.createGlobe({ n: 128 }); runs.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  ok(Math.min(...runs) < 2000, 'n=128: createGlobe in ' + runs.map(x => x.toFixed(0)).join(' / ') + ' ms (limit 2000)');
  if (global.gc) global.gc();
  const before = process.memoryUsage().arrayBuffers;
  const keep = AshGlobe.createGlobe({ n: 128 });
  keep.classes();
  if (global.gc) global.gc();
  const after = process.memoryUsage().arrayBuffers;
  console.log('     n=128 typed-array memory held by one globe (with classes): ' + ((after - before) / 1048576).toFixed(2) + ' MB' + (global.gc ? '' : ' (run with --expose-gc for a clean number)'));
}

/* classes: fixed seed -> fixed counts */
{
  const t0 = process.hrtime.bigint();
  const C = G.classes();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('     classes (seed "ashvale", n=128) in ' + ms.toFixed(0) + ' ms: ' + JSON.stringify(C.counts) + ', core face ' + C.coreFace + ', core centre cell ' + C.coreCenter);
  const EXPECT = { core: 15000, creator: 32345, wild: 10000, sea: 106497, peak: 0 };   /* 2026-10-03: a mostly-ocean world */
  ok(JSON.stringify(C.counts) === JSON.stringify(EXPECT), 'class counts stable for seed "ashvale": ' + JSON.stringify(EXPECT));
  let peaksOk = true; for (let c = 0; c < G.count; c++) if (G.isPentagon(c) && G.cls(c) !== 'sea') peaksOk = false;
  ok(peaksOk, 'all 12 pentagons are water (no corner peaks, 2026-10-03)');
  const seen = new Uint8Array(G.count), st = [C.coreCenter]; seen[C.coreCenter] = 1; let k = 0;
  while (st.length) { const c = st.pop(); k++; for (const m of G.neighbors(c)) if (!seen[m] && C.codes[m] === 1) { seen[m] = 1; st.push(m); } }
  /* the core is a web per continent (the operator: "a network web over the globe"), joined over dry land only */
  { const cs = new Int32Array(G.count).fill(-1), sizes = [];
    for (let s0 = 0; s0 < G.count; s0++) { if (cs[s0] >= 0 || C.codes[s0] !== 1) continue; let n0 = 0; const st2 = [s0]; cs[s0] = sizes.length;
      while (st2.length) { const c = st2.pop(); n0++; for (const m of G.neighbors(c)) if (cs[m] < 0 && C.codes[m] === 1) { cs[m] = sizes.length; st2.push(m); } } sizes.push(n0); }
    ok(sizes.length <= 3 && Math.min(...sizes) >= 2000 && k >= 2000, 'the core is one web per continent: ' + sizes.join(' + ') + ' cells, Ashvale on a piece of ' + k); }
  const faces = new Set(); for (let c = 0; c < G.count; c++) if (C.codes[c] === 1) faces.add(G.face(c));
  ok(faces.size >= 4, 'core reaches across the edges of its face: it touches faces ' + [...faces].sort((a, b) => a - b).join(','));
  /* the sea must be oceans, not puddles, and Ashvale must stand where a walk reaches its coast */
  {
    const codes = C.codes, comps = [], seen = new Uint8Array(G.count);
    for (let s = 0; s < G.count; s++) {
      if (seen[s] || codes[s] !== 3) continue;
      let k = 0; const st = [s]; seen[s] = 1;
      while (st.length) { const c = st.pop(); k++; for (const m of G.neighbors(c)) if (!seen[m] && codes[m] === 3) { seen[m] = 1; st.push(m); } }
      comps.push(k);
    }
    comps.sort((a, b) => b - a);
    const nSea = C.counts.sea, bodies = comps.filter(k => k >= nSea * 0.005);
    ok(comps[0] * 20 >= nSea * 9, 'the water gathers into oceans: the largest holds ' + Math.round(100 * comps[0] / nSea) + '% of it (' + comps[0] + ' cells)');
    ok(bodies.length <= 5 && (comps[0] + (comps[1] || 0)) * 20 >= nSea * 17, 'and few separate seas: ' + bodies.length +
      ' bodies hold 0.5% or more of the water, ' + Math.round(100 * (comps[0] + (comps[1] || 0)) / nSea) + '% of it in the two largest (' + comps.slice(0, 7).join(', ') + ')');
    const seenL = new Uint8Array(G.count); let land = 0, mass = 0;
    for (let s = 0; s < G.count; s++) {
      if (seenL[s] || codes[s] === 3) continue;
      let k = 0; const st = [s]; seenL[s] = 1;
      while (st.length) { const c = st.pop(); k++; for (const m of G.neighbors(c)) if (!seenL[m] && codes[m] !== 3) { seenL[m] = 1; st.push(m); } }
      land += k; if (k > mass) mass = k;
    }
    ok(mass * 10 >= land * 4 && mass * 10 <= land * 7 && land * 100 <= G.count * 36, 'mostly ocean with two big continents: the largest mass holds ' + Math.round(100 * mass / land) + '% of the land, land is ' + Math.round(100 * land / G.count) + '% of the globe');
    const dSea = new Int32Array(G.count).fill(-1), q = [];
    for (let c = 0; c < G.count; c++) if (codes[c] === 3) { dSea[c] = 0; q.push(c); }
    for (let h = 0; h < q.length; h++) { const c = q[h]; for (const m of G.neighbors(c)) if (dSea[m] < 0) { dSea[m] = dSea[c] + 1; q.push(m); } }
    let dCore = G.count, touch = 0;
    for (let c = 0; c < G.count; c++) {
      if (codes[c] !== 1) continue;
      if (dSea[c] < dCore) dCore = dSea[c];
      for (const x of G.neighbors(c)) if (codes[x] === 3) { touch++; break; }
    }
    /* The network runs along the coasts on purpose, so the old floor of 5 rings is gone: what keeps a reserved parcel
       out of the tide line now is the one dry ring the sea keeps around the whole network, not distance. */
    /* 2026-10-03: Saltmere stands right on the sea, so the network may touch the water now */
    { const hbS = G.neighbors(C.coreHarbour).filter(x => codes[x] === 3).length;
      ok(hbS >= 1, 'Saltmere\'s parcel is on the shore: ' + hbS + ' of its neighbours are sea (' + touch + ' reserved parcels touch water in all)'); }
    /* Ashvale by the water, not in the middle of a continent: the town is a short walk from a coast, the ground it
       stands on stays dry, and there is a harbour on that same shore within walking distance of the town
       (2026-10-03: "move the town of Ashvale closer to the shore of one of the inland seas. So that our
       second town can be right on the coastline and it's within walking distance"). */
    const m = (h) => Math.round(h * G.spacing_m).toLocaleString('en-US') + ' m';
    const dTown = dSea[C.coreCenter];
    ok(dTown >= 2 && dTown <= 4, 'Ashvale is a short walk from the sea (Saltmere next door is on it): ' + m(dTown) + ' from its centre cell to the water');
    {
      const hT = new Int32Array(G.count).fill(-1), qq = [C.coreCenter]; hT[C.coreCenter] = 0; let wet = 0;
      for (let k = 0; k < qq.length; k++) {
        const c = qq[k];
        if (codes[c] === 3) wet++;
        if (hT[c] >= 1) continue;
        for (const x of G.neighbors(c)) if (hT[x] < 0) { hT[x] = hT[c] + 1; qq.push(x); }
      }
      ok(wet === 0, 'and the ground the town stands on is dry: no sea cell in or next to its parcel');
    }
    const hb = C.coreHarbour;
    ok(hb >= 0 && codes[hb] === 1, 'the network keeps a harbour of its own for the second town (cell ' + hb + ')');
    {
      const hH = new Int32Array(G.count).fill(-1), qq = [C.coreCenter]; hH[C.coreCenter] = 0;
      for (let k = 0; k < qq.length && hH[hb] < 0; k++) { const c = qq[k]; for (const x of G.neighbors(c)) if (hH[x] < 0) { hH[x] = hH[c] + 1; qq.push(x); } }
      ok(hH[hb] === 1, 'Ashvale is the parcel next to it (' + hH[hb] + ' cell, ' + m(hH[hb]) + '), on the side away from the sea');
    }
    ok(dSea[hb] <= 4, 'and it stands right on the coastline: ' + m(dSea[hb]) + ' to the water');
    {
      const facesHit = new Set();
      for (let c = 0; c < G.count; c++) if (codes[c] === 1) facesHit.add(G.face(c));
      ok(C.coreNodes.length >= 10 && facesHit.size >= 12, 'the reserved land is a network round the globe, not a blob: ' +
        C.coreNodes.length + ' nodes over ' + facesHit.size + ' of the 20 faces');
      let sep = 1e9;
      for (let i = 0; i < C.coreNodes.length; i++) for (let j = i + 1; j < C.coreNodes.length; j++) {
        if (C.coreNodes[i] === C.coreHarbour || C.coreNodes[j] === C.coreHarbour) continue;   /* Saltmere is next door to Ashvale on purpose */
        const a = G.center(C.coreNodes[i]), b = G.center(C.coreNodes[j]);
        const d = Math.sqrt(Math.max(0, 2 - 2 * (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * G.radius_m;
        if (d < sep) sep = d;
      }
      ok(sep >= 1200, 'and the nodes are spread out, not clustered: the closest pair is ' + Math.round(sep).toLocaleString('en-US') + ' m apart');
    }
  }
  const G2 = AshGlobe.createGlobe({ n: 128 }), C2 = G2.classes();
  let same = true; for (let c = 0; c < G.count; c++) if (C2.codes[c] !== C.codes[c]) { same = false; break; }
  ok(same, 'classes identical on a second build');
  const C3 = AshGlobe.createGlobe({ n: 128, seed: 'other' }).classes();
  let diff = 0; for (let c = 0; c < G.count; c++) if (C3.codes[c] !== C.codes[c]) diff++;
  ok(diff > 1000, 'another seed gives another map (' + diff + ' cells differ, core face ' + C3.coreFace + ')');
}

/* golden file */
{
  const sample = [];
  const n = 128, nn = n * n;
  for (let c = 0; c < G.count; c++) if (G.isPentagon(c)) sample.push(c);
  for (let d = 0; d < 10; d++) for (const [i, j] of [[0, 1], [1, 0], [0, n - 1], [n - 1, 0], [n - 1, n - 1], [64, 64], [64, 63], [63, 64], [1, 1], [n - 1, 5], [5, n - 1]]) sample.push(d * nn + i * n + j);
  let s = 12345; for (let k = 0; k < 40; k++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; sample.push(s % G.count); }
  const C = G.classes();
  const rows = sample.map(c => {
    const q = G.dij(c), pl = G.planar(c);
    return { c, dij: q.pole ? q.pole : [q.d, q.i, q.j], p: G.center(c).map(v => +v.toFixed(10)), nb: G.neighbors(c), face: pl.face,
             xy: [+pl.x.toFixed(3), +pl.y.toFixed(3)], cls: C.names[C.codes[c]] };
  });
  const golden = { what: 'ASHVALE globe golden sample', n: 128, radius_m: 36110, seed: 'ashvale', count: G.count, counts: C.counts, rows };
  if (process.argv.includes('--write-golden')) {
    fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 0).replace(/\},\{/g, '},\n{') + '\n');
    console.log('     wrote ' + GOLDEN + ' (' + rows.length + ' cells)');
  } else {
    const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    let diffs = 0;
    const byC = new Map(rows.map(r => [r.c, r]));
    for (const w of want.rows) {
      const r = byC.get(w.c) || (() => { const q = G.dij(w.c), pl = G.planar(w.c); return { c: w.c, dij: q.pole ? q.pole : [q.d, q.i, q.j], p: G.center(w.c).map(v => +v.toFixed(10)), nb: G.neighbors(w.c), face: pl.face, xy: [+pl.x.toFixed(3), +pl.y.toFixed(3)], cls: C.names[C.codes[w.c]] }; })();
      const close = r.p.every((v, k) => Math.abs(v - w.p[k]) < 2e-10) && r.xy.every((v, k) => Math.abs(v - w.xy[k]) < 2e-3);
      if (!close || JSON.stringify(r.nb) !== JSON.stringify(w.nb) || JSON.stringify(r.dij) !== JSON.stringify(w.dij) || r.face !== w.face || r.cls !== w.cls) { diffs++; if (diffs < 5) console.log('     golden mismatch', JSON.stringify(w), 'now', JSON.stringify(r)); }
    }
    ok(want.count === G.count && JSON.stringify(want.counts) === JSON.stringify(C.counts), 'golden: count and class counts match');
    ok(diffs === 0, 'golden: ' + want.rows.length + ' sampled cells (ids, centres, neighbours, face, planar, class) unchanged (' + diffs + ' differ)');
  }
}

console.log(fails ? fails + ' FAILED' : 'all globe tests passed');
process.exit(fails ? 1 : 0);
