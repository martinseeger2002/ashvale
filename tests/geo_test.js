/* geo_test.js - the global grid (src/geo.js, handoff/globe_open_plan.md phase 1): cells pack and unpack, every one of the
   60 face seams is continuous both ways, home() re-anchors across an edge, Ashvale's latitude, the vale frame, the corners.
   node tests/geo_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AG = require('../src/globe.js'), WGM = require('../src/worldgen.js'), AshGeo = require('../src/geo.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'globecfg.json'), 'utf8')).data;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const G = AG.createGlobe({ n: cfg.n, radius_m: cfg.radius_m, seed: cfg.seed });
const W = WGM.createWorldgen(G, { seed: cfg.seed });
const Geo = AshGeo.create(W, cfg);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* 1. pack / unpack */
{
  let bad = 0, n = 0;
  const vals = [-32768, -32767, -25000, -1, 0, 1, 12345, 25000, 32766, 32767];
  for (let f = 0; f < 20; f++) for (const x of vals) for (const y of vals) {
    const p = Geo.pack(f, x, y), u = Geo.unpack(p); n++;
    if (u.f !== f || u.x !== x || u.y !== y || !Number.isSafeInteger(p)) bad++;
  }
  ok(bad === 0, 'pack/unpack round trip: ' + n + ' cells on all 20 faces, negatives and extremes');
  ok(Geo.pack(19, 32767, 32767) < 2 ** 37 && Geo.pack(0, -32768, -32768) === 0, 'packed cells fit in 37 bits, 0 is face 0 corner of the range');
  let threw = 0;
  for (const a of [[20, 0, 0], [-1, 0, 0], [0, 32768, 0], [0, 0, -32769], [0, 0.5, 0]]) { try { Geo.pack(...a); } catch (e) { threw++; } }
  ok(threw === 5, 'pack refuses bad faces, out-of-range and fractional metres');
}

/* 2. seams: every face-edge pair, points near the shared edge, there and back, same place on the sphere */
{
  let pairs = 0, worstBack = 0, worstSph = 0, worstGap = 0, sym = 0, badHome = 0;
  for (let f = 0; f < 20; f++) for (const e of Geo.neighbours(f)) {
    pairs++;
    if (Geo.neighbours(e.g).some(q => q.g === f)) sym++;
    /* the far corner k sits across from the edge: step outward = away from it */
    const K = Geo.corners(f)[e.k];
    for (const t of [0.05, 0.3, 0.5, 0.7, 0.95]) for (const off of [-2, -0.01, 0, 0.01, 2]) {
      const mx = e.a[0] + (e.b[0] - e.a[0]) * t, my = e.a[1] + (e.b[1] - e.a[1]) * t;
      const ox = mx - K[0], oy = my - K[1], ol = Math.hypot(ox, oy), px = mx + ox / ol * off, py = my + oy / ol * off;
      const q = Geo.toNeighbour(f, px, py, e.g), back = Geo.fromNeighbour(e.g, q[0], q[1], f);
      worstBack = Math.max(worstBack, Math.hypot(back[0] - px, back[1] - py));
      if (Math.abs(off) <= 0.01) worstSph = Math.max(worstSph, d3(Geo.sphere(f, px, py), Geo.sphere(e.g, q[0], q[1])) * cfg.radius_m);
      if (off === 2 && t === 0.5) {   /* across the seam without folding: 0.5 m inside f vs 0.5 m inside g, 2 m apart along the edge */
        const ul = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), ux = (e.b[0] - e.a[0]) / ul, uy = (e.b[1] - e.a[1]) / ul, nx = ox / ol, ny = oy / ol;
        const pin = [mx - nx * 0.5 + ux, my - ny * 0.5 + uy], pout = Geo.toNeighbour(f, mx + nx * 0.5 - ux, my + ny * 0.5 - uy, e.g);
        const dm = d3(Geo.sphere(f, pin[0], pin[1]), Geo.sphere(e.g, pout[0], pout[1])) * cfg.radius_m;
        worstGap = Math.max(worstGap, Math.abs(dm - Math.sqrt(5)) / Math.sqrt(5));
      }
      if (off === 2) { const h = Geo.home(f, px, py); if (h.f !== e.g || Math.hypot(h.x - q[0], h.y - q[1]) > 1e-6) badHome++; }
      if (off === -2) { const h = Geo.home(f, px, py); if (h.f !== f || Math.hypot(h.x - px, h.y - py) > 1e-9) badHome++; }
    }
  }
  ok(pairs === 60 && sym === 60, '60 face-edge pairs, each neighbour lists the other back');
  ok(worstBack < 1e-6, 'every seam maps there and back within 1e-6 m (worst ' + worstBack.toExponential(2) + ' m)');
  ok(worstSph < 0.05, 'both faces put a seam point at the same place on the sphere (worst ' + worstSph.toFixed(4) + ' m)');
  ok(worstGap < 0.2, 'the seams keep orientation: two points 2.24 m apart across each edge stay that far apart on the sphere (worst ' + (worstGap * 100).toFixed(1) + '% off, the projection warp)');
  ok(badHome === 0, 'home() re-anchors a point 2 m past each of the 60 edges to the right neighbour, and keeps points inside');
}

/* 3. Ashvale's spot, the vale frame */
{
  const c = Geo.fromVale(40, 58), ll = Geo.latLon(c.f, c.x + 0.5, c.y + 0.5);
  ok(Math.abs(ll.lat - -60.15) < 0.5 && Math.abs(ll.lon - 25.20) < 0.5, 'Ashvale (vale 40,58) at ' + ll.lat.toFixed(2) + ', ' + ll.lon.toFixed(2) + ' (want about -60.15, 25.20)');
  const u = W.toSphere(cfg.face, 40 + cfg.origin[0] + 0.5, -(58 + cfg.origin[1]) - 0.5), s = Geo.sphere(c.f, c.x + 0.5, c.y + 0.5);
  ok(d3(u, s) === 0, 'fromVale cell centre = world.js latOf point exactly');
  let bad = 0;
  for (const [x, y] of [[0, 0], [40, 58], [-500, 900], [1234, -4321], [-8000, 3000]]) {
    const cc = Geo.fromVale(x, y), v = Geo.toVale(cc), r = Geo.unpack(Geo.pack(cc.f, cc.x, cc.y));
    if (v[0] !== x || v[1] !== y || r.f !== cc.f || r.x !== cc.x || r.y !== cc.y) bad++;
  }
  ok(bad === 0, 'fromVale / toVale / pack round trips');
  ok(Geo.toVale({ f: (cfg.face + 1) % 20, x: 0, y: 0 }) === null, 'toVale is null off the vale face');
}

/* 4. corners */
{
  let hit = 0, n = 0, cent = 0, verts = new Set();
  for (let f = 0; f < 20; f++) {
    for (const q of Geo.corners(f)) { n++; if (Geo.isCorner(f, q[0], q[1], 5)) hit++; const u = Geo.sphere(f, q[0], q[1]); verts.add(u.map(v => v.toFixed(6)).join(',')); }
    if (!Geo.isCorner(f, 0, 0, 1000)) cent++;
  }
  ok(verts.size === 12 && hit === n, 'isCorner true at all 12 vertices (' + n + ' face corners, ' + verts.size + ' distinct)');
  ok(cent === 20, 'isCorner false at all 20 face centroids (r = 1000 m)');
  const e = Geo.neighbours(19)[0], mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
  ok(!Geo.isCorner(19, mx, my, 1000) && Geo.isCorner(19, e.a[0] * 0.999, e.a[1] * 0.999, 1000), 'edge midpoint is no corner, a point 25 m from a vertex is');
  const past = [e.a[0] * 1.002, e.a[1] * 1.002];
  ok(Geo.isCorner(19, past[0], past[1], 100), 'a point just beyond a vertex (outside the face) is a corner too');
}

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
