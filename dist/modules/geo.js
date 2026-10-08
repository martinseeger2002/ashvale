/* ASHVALE geo (module `geo`, api 1) - one global grid for the whole globe (handoff/globe_open_plan.md, phase 1).
   A cell is {f, x, y}: face 0..19 of the icosahedron, whole metres on that face's flat plane (origin at the face centroid,
   as G.planar, seen from outside; +y is the game's north, not true north). A cell names the square [x, x+1) x [y, y+1).
   Pure maths over worldgen's own face tables (W.fold, W.toSphere, W.xform): nothing is imported, the caller passes them.

     const Geo = AshGeo.create(WG, globecfg)    WG = a worldgen instance (worldgen.createWorldgen), globecfg = data/globecfg
     Geo.pack(f, x, y) -> n / Geo.unpack(n) -> {f, x, y}   n = f*2^32 + (x+32768)*2^16 + (y+32768), exact in a JS number
     Geo.neighbours(f)            [{g, k, a: [x, y], b: [x, y]}] x3: face g across the edge a-b (f's plane), opposite corner k
     Geo.toNeighbour(f, x, y, g)  [x, y] of f's plane point in g's plane (g must share an edge with f); fromNeighbour = inverse
     Geo.home(f, x, y)            {f, x, y}: the face a point of f's plane (maybe past an edge) really lies on, and where there
     Geo.sphere(f, x, y)          [ux, uy, uz] unit vector   Geo.latLon(f, x, y) {lat, lon} degrees (display only)
     Geo.fromVale(x, y) -> cell / Geo.toVale(cell) -> [x, y]   the game's vale-frame tiles (face cfg.face, shifted by origin)
     Geo.isCorner(f, x, y, r)     within r metres of one of the 12 icosahedron vertices (the impassable peaks)
*/
(function (root) {
  'use strict';
  const OFF = 32768, P16 = 65536, P32 = 4294967296, DEG = 180 / Math.PI;
  function create(WG, cfg) {
    if (!WG || !WG.xform || !WG.fold || !WG.toSphere) throw new Error('geo: needs a worldgen instance');
    const C = cfg || {}, FACE = C.face != null ? C.face : 19, OX = (C.origin || [0, 0])[0], OY = (C.origin || [0, 0])[1];
    const EDGE = WG.faceEdge, CORN = [];
    for (let f = 0; f < 20; f++) CORN.push(WG.faceCorners(f));
    /* the seam table: NB[f] = the three edges of f; corner k is opposite the edge to neighbourFace(f, k) */
    const NB = [];
    for (let f = 0; f < 20; f++) {
      const L = [];
      for (let k = 0; k < 3; k++) { const q = CORN[f]; L.push({ g: WG.neighbourFace(f, k), k, a: q[(k + 1) % 3].slice(), b: q[(k + 2) % 3].slice() }); }
      NB.push(L);
    }
    const isInt = v => v === Math.floor(v) && v >= -OFF && v < OFF;
    function pack(f, x, y) {
      if (!(f >= 0 && f < 20 && f === (f | 0)) || !isInt(x) || !isInt(y)) throw new Error('geo: bad cell ' + f + ',' + x + ',' + y);
      return f * P32 + (x + OFF) * P16 + (y + OFF);
    }
    function unpack(n) {
      const f = Math.floor(n / P32), r = n - f * P32, xi = Math.floor(r / P16);
      return { f, x: xi - OFF, y: r - xi * P16 - OFF };
    }
    const neighbours = f => NB[f].map(e => ({ g: e.g, k: e.k, a: e.a.slice(), b: e.b.slice() }));
    /* the rigid map f -> g: x' = c x - s y + tx, y' = s x + c y + ty (worldgen's XF table) */
    function toNeighbour(f, x, y, g) {
      const t = WG.xform(f, g); if (!t) throw new Error('geo: faces ' + f + ' and ' + g + ' share no edge');
      return [t[0] * x - t[1] * y + t[2], t[1] * x + t[0] * y + t[3]];
    }
    const fromNeighbour = (g, x, y, f) => toNeighbour(g, x, y, f);
    function home(f, x, y) { const r = WG.fold(f, x, y); return { f: r[0], x: r[1], y: r[2] }; }
    const sphere = (f, x, y) => WG.toSphere(f, x, y, [0, 0, 0]);
    function latLon(f, x, y) {
      const u = sphere(f, x, y);
      return { lat: Math.asin(Math.max(-1, Math.min(1, u[2]))) * DEG, lon: Math.atan2(u[1], u[0]) * DEG };
    }
    /* vale tile (x, y) covers planar [x+OX, x+OX+1) x (-(y+OY)-1, -(y+OY)] of face FACE (y flips: game y = south) */
    const fromVale = (x, y) => ({ f: FACE, x: Math.floor(x) + OX, y: -(Math.floor(y) + OY) - 1 });
    function toVale(c) {
      if (c.f !== FACE) return null;   /* other faces have no vale coordinates (phase 4 brings the moving frame) */
      return [c.x - OX, -c.y - 1 - OY];
    }
    /* near a vertex: measured in f's own plane and in the plane of the face the point folds to (rigid maps keep distances) */
    function isCorner(f, x, y, r) {
      const r2 = r * r, near = (g, px, py) => CORN[g].some(q => (q[0] - px) * (q[0] - px) + (q[1] - py) * (q[1] - py) <= r2);
      if (near(f, x, y)) return true;
      const h = WG.fold(f, x, y);
      return near(h[0], h[1], h[2]);
    }
    return { api: 1, FACE, OX, OY, EDGE, pack, unpack, neighbours, toNeighbour, fromNeighbour, home, sphere, latLon, fromVale, toVale, isCorner,
      corners: f => CORN[f].map(q => q.slice()) };
  }
  const api = { api: 1, create };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('geo', { api: 1, v: 1, needs: {} }, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AshGeo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
