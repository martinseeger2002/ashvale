/* ASHVALE globe: the planet's parcel grid as pure maths (no three.js, no DOM, no clock, no Math.random).
   See GLOBE.md. Grid = class-I Goldberg polyhedron GP(n,0) on an icosahedron: 10n^2 + 2 cells, 12 of them pentagons.
   It is the dual of the geodesic grid: every cell CENTRE is a vertex of the n-times subdivided icosahedron, projected
   onto the unit sphere; a cell's outline joins the centres of the geodesic triangles around that vertex.

   const G = AshGlobe.createGlobe({n: 128, radius_m: 36110, seed: 'ashvale'})
     G.count                       10n^2 + 2
     G.id(d, i, j) / G.dij(c)      cell = d*n*n + i*n + j (d 0..9, i, j in [0,n)); north pole = 10n^2, south = 10n^2 + 1
     G.isPentagon(c)               the 2 poles and (i=0, j=0) of every diamond
     G.neighbors(c)                array of 6 (5 for pentagons) cell ids, in counter-clockwise order seen from outside
     G.center(c) / G.centerInto    unit vector [x, y, z] (z = north)
     G.latlon(c)                   [lat, lon] in degrees (display only: asin/atan2 are not bit-identical across engines)
     G.cellAt([x,y,z]) / G.cellAtLatLon(lat, lon)    nearest cell centre
     G.corners(c) / G.cornersInto  the outline on the unit sphere (5 or 6 corners, same order as neighbors)
     G.face(c)                     the icosahedron face (0..19) the centre is assigned to
     G.planar(c)                   {face, x, y}: the centre in metres on that flat face (origin = face centroid)
     G.faceCorners(f)              [v0, v1, v2] icosahedron vertex ids; G.facePlanarCorners(f) their [x, y] in metres
     G.cls(c) / G.clsCode(c)       'core' | 'creator' | 'wild' | 'sea' | 'peak' (by rule from the seed, see classes())
     G.classes()                   {codes: Uint8Array, counts, coreFace, coreCenter} (computed once, on first use)

   Diamonds. The icosahedron has a north pole N, an upper ring U0..U4 (lat +26.57, lon 72k), a lower ring L0..L4
   (lat -26.57, lon 72k + 36) and a south pole S. Its 20 faces pair into 10 diamonds (4 corners each):
     north diamond d = 0..4      P00 = U_d,   Pn0 = N,       P0n = L_d,   Pnn = U_d+1
     south diamond d = 5..9      P00 = L_k,   Pn0 = U_k+1,   P0n = S,     Pnn = L_k+1     (k = d - 5)
   Lattice point (i, j) of a diamond, i, j in [0, n]: i runs P00 -> Pn0, j runs P00 -> P0n. The two faces of a diamond
   meet along the short diagonal P00 - Pnn, so the six in-diamond neighbour steps are
     (+1, 0) (-1, 0) (0, +1) (0, -1) (+1, +1) (-1, -1).
   (GLOBE.md first wrote the diagonal steps as (+1,-1)/(-1,+1). With those, (0,0) of every diamond cannot be a pentagon
   AND own its two edges at the same time; with this pairing it can, so the steps follow the index, not the other way.)
   Each diamond OWNS its corner P00 = (0,0) (a pentagon), the two edges leaving it (i = 0 and j = 0, far ends excluded)
   and its interior: exactly n*n points. The far edges i = n and j = n belong to the neighbouring diamonds (EDGE table,
   built from corner identities); the poles belong to nobody's diamond.
   Faces: face 2d   = (P00, Pn0, Pnn), cells with i >= j (diagonal included);
          face 2d+1 = (P00, P0n, Pnn), cells with j >  i.
   Projection onto the sphere: weights w(b) = b - K*b^3 on the three barycentric coordinates, then normalize. On an edge
   this matches a great-circle (slerp-like) spacing; inside it evens out cell areas (K = 0 would be the gnomonic
   projection, hexagon area spread 1.87; K = 0.25 gives 1.18). Only + - * / and sqrt are used for anything the class rule depends on, so the grid
   and the classes are bit-identical in every JS engine (IEEE 754 rounds those exactly).

   Module form: registers with ASH3D.define('globe', ...) when the loader is there, module.exports in node, and
   globalThis.AshGlobe otherwise. */
(function (root) {
  'use strict';
  const API = 1, V = 1;
  const K_WARP = 0.25;   /* part of the grid: never change it after the grid spec is inscribed */
  const CLASS = ['creator', 'core', 'wild', 'sea', 'peak'];
  const C_CREATOR = 0, C_CORE = 1, C_WILD = 2, C_SEA = 3, C_PEAK = 4;

  /* ---- deterministic helpers (integer hash, value noise) ---- */
  function hashStr(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mix32(a) { a = Math.imul(a ^ (a >>> 16), 0x7feb352d); a = Math.imul(a ^ (a >>> 15), 0x846ca68b); return (a ^ (a >>> 16)) >>> 0; }
  function lat3(ix, iy, iz, s) { return mix32((Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ Math.imul(iz, 0xcb1ab31f) ^ s) >>> 0) / 4294967296; }
  function vnoise(x, y, z, s) {
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const tx = x - fx, ty = y - fy, tz = z - fz;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty), uz = tz * tz * (3 - 2 * tz);
    const a = lat3(fx, fy, fz, s), b = lat3(fx + 1, fy, fz, s), c = lat3(fx, fy + 1, fz, s), d = lat3(fx + 1, fy + 1, fz, s);
    const e = lat3(fx, fy, fz + 1, s), f = lat3(fx + 1, fy, fz + 1, s), g = lat3(fx, fy + 1, fz + 1, s), h = lat3(fx + 1, fy + 1, fz + 1, s);
    const ab = a + (b - a) * ux, cd = c + (d - c) * ux, ef = e + (f - e) * ux, gh = g + (h - g) * ux;
    const l0 = ab + (cd - ab) * uy, l1 = ef + (gh - ef) * uy;
    return l0 + (l1 - l0) * uz;
  }
  function fbm(x, y, z, s, freq, oct) {
    let sum = 0, amp = 1, tot = 0, f = freq;
    for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, z * f, (s + Math.imul(o, 0x9e3779b9)) >>> 0); tot += amp; amp *= 0.5; f *= 2.03; }
    return sum / tot;
  }

  /* ---- the icosahedron, from square roots only ---- */
  function icosahedron() {
    const r5 = Math.sqrt(5), ca = (1 + r5) / 4, cb = (r5 - 1) / 4, sa = Math.sqrt(10 - 2 * r5) / 4, sb = Math.sqrt(10 + 2 * r5) / 4;
    const C = [1, ca, cb, -cb, -ca, -1, -ca, -cb, cb, ca], S = [0, sa, sb, sb, sa, 0, -sa, -sb, -sb, -sa];
    const z0 = 1 / r5, rr = 2 / r5, Vx = [];
    for (let k = 0; k < 5; k++) Vx.push([rr * C[2 * k], rr * S[2 * k], z0]);
    for (let k = 0; k < 5; k++) Vx.push([rr * C[2 * k + 1], rr * S[2 * k + 1], -z0]);
    Vx.push([0, 0, 1]); Vx.push([0, 0, -1]);
    return Vx;
  }
  const U = (k) => ((k % 5) + 5) % 5, L = (k) => 5 + (((k % 5) + 5) % 5), NP = 10, SP = 11;
  /* DIAMONDS[d] = [P00, Pn0, P0n, Pnn] as icosahedron vertex ids */
  const DIAMONDS = [];
  for (let d = 0; d < 5; d++) DIAMONDS.push([U(d), NP, L(d), U(d + 1)]);
  for (let k = 0; k < 5; k++) DIAMONDS.push([L(k), U(k + 1), SP, L(k + 1)]);

  function createGlobe(opts) {
    const O = opts || {};
    const n = O.n | 0;
    if (!(n >= 1 && n <= 1024)) throw new Error('globe: n must be an integer 1..1024');
    const R = O.radius_m != null ? +O.radius_m : 36110;
    const seed = O.seed != null ? String(O.seed) : 'ashvale';
    const nn = n * n, count = 10 * nn + 2, NORTH = 10 * nn, SOUTH = 10 * nn + 1;
    const IV = icosahedron();

    /* vertex owner: icosahedron vertex id -> cell id */
    const vOwner = new Int32Array(12);
    for (let d = 0; d < 10; d++) vOwner[DIAMONDS[d][0]] = d * nn;
    vOwner[NP] = NORTH; vOwner[SP] = SOUTH;
    /* EDGE table: for each of the 20 owned edges {a, b}: the owner diamond, its axis (0 = i, 1 = j) and the start corner */
    const EDGE = {};
    for (let d = 0; d < 10; d++) {
      const D = DIAMONDS[d];
      EDGE[Math.min(D[0], D[1]) * 12 + Math.max(D[0], D[1])] = [d, 0, D[0]];
      EDGE[Math.min(D[0], D[2]) * 12 + Math.max(D[0], D[2])] = [d, 1, D[0]];
    }
    /* cell id of any lattice point (i, j), 0 <= i, j <= n, of diamond d */
    function gid(d, i, j) {
      if (i < n && j < n) return d * nn + i * n + j;
      const D = DIAMONDS[d];
      let X, Y, k;
      if (i === n) { X = D[1]; Y = D[3]; k = j; } else { X = D[2]; Y = D[3]; k = i; }
      if (k === 0) return vOwner[X];
      if (k === n) return vOwner[Y];
      const e = EDGE[Math.min(X, Y) * 12 + Math.max(X, Y)];
      if (!e) throw new Error('globe: no owner for edge ' + X + '-' + Y);
      const steps = e[2] === X ? k : n - k;
      return e[1] === 0 ? e[0] * nn + steps * n : e[0] * nn + steps;
    }

    /* ---- centres ---- */
    const P = new Float64Array(count * 3);
    function w(b) { return b - K_WARP * b * b * b; }
    function place(out, o, A, B, Cc, b0, b1, b2) {
      const w0 = w(b0), w1 = w(b1), w2 = w(b2);
      const x = w0 * A[0] + w1 * B[0] + w2 * Cc[0], y = w0 * A[1] + w1 * B[1] + w2 * Cc[1], z = w0 * A[2] + w1 * B[2] + w2 * Cc[2];
      const l = Math.sqrt(x * x + y * y + z * z);
      out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l;
    }
    for (let d = 0; d < 10; d++) {
      const D = DIAMONDS[d], A = IV[D[0]], Bi = IV[D[1]], Bj = IV[D[2]], Cn = IV[D[3]];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const o = (d * nn + i * n + j) * 3;
        if (i >= j) place(P, o, A, Bi, Cn, (n - i) / n, (i - j) / n, j / n);
        else place(P, o, A, Bj, Cn, (n - j) / n, (j - i) / n, i / n);
      }
    }
    P[NORTH * 3 + 2] = 1; P[SOUTH * 3 + 2] = -1;

    /* ---- adjacency from the geodesic triangles, ordered counter-clockwise (seen from outside) ---- */
    let pf = new Int32Array(count * 6), pt = new Int32Array(count * 6), pc = new Uint8Array(count);
    function addPair(v, a, b) { const k = pc[v]; if (k >= 6) throw new Error('globe: vertex ' + v + ' has more than 6 triangles'); pf[v * 6 + k] = a; pt[v * 6 + k] = b; pc[v] = k + 1; }
    function tri(a, b, c) { addPair(a, b, c); addPair(b, c, a); addPair(c, a, b); }
    for (let d = 0; d < 10; d++) {
      const D = DIAMONDS[d], A = IV[D[0]], B = IV[D[1]], Cc = IV[D[3]];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const ccw = nx * (A[0] + B[0] + Cc[0]) + ny * (A[1] + B[1] + Cc[1]) + nz * (A[2] + B[2] + Cc[2]) > 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const q00 = gid(d, i, j), q10 = gid(d, i + 1, j), q11 = gid(d, i + 1, j + 1), q01 = gid(d, i, j + 1);
        if (ccw) { tri(q00, q10, q11); tri(q00, q11, q01); } else { tri(q00, q11, q10); tri(q00, q01, q11); }
      }
    }
    const NB = new Int32Array(count * 6).fill(-1), DEG = new Uint8Array(count);
    for (let v = 0; v < count; v++) {
      const deg = pc[v];
      if (deg !== 5 && deg !== 6) throw new Error('globe: vertex ' + v + ' has ' + deg + ' triangles');
      let cur = pf[v * 6];
      for (let k = 0; k < deg; k++) {
        NB[v * 6 + k] = cur;
        let nxt = -1;
        for (let m = 0; m < deg; m++) if (pf[v * 6 + m] === cur) { nxt = pt[v * 6 + m]; break; }
        if (nxt < 0) throw new Error('globe: open fan at ' + v);
        cur = nxt;
      }
      if (cur !== NB[v * 6]) throw new Error('globe: fan does not close at ' + v);
      DEG[v] = deg;
    }
    pf = pt = pc = null;   /* scratch: let the 8 MB go (closures would otherwise keep it alive) */

    /* ---- faces and planar coordinates ---- */
    const FACES = [];
    for (let d = 0; d < 10; d++) { const D = DIAMONDS[d]; FACES.push([D[0], D[1], D[3]]); FACES.push([D[0], D[2], D[3]]); }
    const FN = FACES.map(F => {
      const a = IV[F[0]], b = IV[F[1]], c = IV[F[2]];
      const x = a[0] + b[0] + c[0], y = a[1] + b[1] + c[1], z = a[2] + b[2] + c[2], l = Math.sqrt(x * x + y * y + z * z);
      return [x / l, y / l, z / l];
    });
    const FCCW = FACES.map(F => {
      const a = IV[F[0]], b = IV[F[1]], c = IV[F[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      return (uy * vz - uz * vy) * (a[0] + b[0] + c[0]) + (uz * vx - ux * vz) * (a[1] + b[1] + c[1]) + (ux * vy - uy * vx) * (a[2] + b[2] + c[2]) > 0;
    });
    /* the flat icosahedron has the sphere's surface area: edge a, cell spacing a/n (about 340 m at n = 128) */
    const faceEdge = R * Math.sqrt(4 * Math.PI / (5 * Math.sqrt(3))), hgt = faceEdge * Math.sqrt(3) / 2;
    const QP = FCCW.map(ccw => ccw ? [[-faceEdge / 2, -hgt / 3], [faceEdge / 2, -hgt / 3], [0, 2 * hgt / 3]]
                                   : [[faceEdge / 2, -hgt / 3], [-faceEdge / 2, -hgt / 3], [0, 2 * hgt / 3]]);
    function dij(c) {
      if (c === NORTH) return { pole: 'N', d: -1, i: -1, j: -1 };
      if (c === SOUTH) return { pole: 'S', d: -1, i: -1, j: -1 };
      const d = (c / nn) | 0, r = c - d * nn, i = (r / n) | 0;
      return { d, i, j: r - i * n };
    }
    /* face + barycentric of a cell centre's lattice point */
    function faceBary(c) {
      if (c === NORTH) return [0, 0, 1, 0];
      if (c === SOUTH) return [11, 0, 1, 0];
      const d = (c / nn) | 0, r = c - d * nn, i = (r / n) | 0, j = r - i * n;
      if (i >= j) return [2 * d, (n - i) / n, (i - j) / n, j / n];
      return [2 * d + 1, (n - j) / n, (j - i) / n, i / n];
    }
    function face(c) { return faceBary(c)[0]; }
    function planar(c) {
      const fb = faceBary(c), Q = QP[fb[0]];
      return { face: fb[0], x: fb[1] * Q[0][0] + fb[2] * Q[1][0] + fb[3] * Q[2][0], y: fb[1] * Q[0][1] + fb[2] * Q[1][1] + fb[3] * Q[2][1] };
    }

    /* ---- queries ---- */
    function check(c) { if (!(c >= 0 && c < count) || c !== (c | 0)) throw new Error('globe: bad cell ' + c); }
    function isPentagon(c) { return DEG[c] === 5; }
    function neighbors(c) { check(c); const out = []; for (let k = 0; k < DEG[c]; k++) out.push(NB[c * 6 + k]); return out; }
    function center(c) { check(c); return [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]]; }
    function centerInto(c, out, o) { o = o | 0; out[o] = P[c * 3]; out[o + 1] = P[c * 3 + 1]; out[o + 2] = P[c * 3 + 2]; return out; }
    function latlon(c) { check(c); const z = Math.max(-1, Math.min(1, P[c * 3 + 2])); return [Math.asin(z) * 180 / Math.PI, Math.atan2(P[c * 3 + 1], P[c * 3]) * 180 / Math.PI]; }
    function cornersInto(c, out, o) {
      o = o | 0; const deg = DEG[c], cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
      for (let k = 0; k < deg; k++) {
        const a = NB[c * 6 + k] * 3, b = NB[c * 6 + (k + 1) % deg] * 3;
        const x = cx + P[a] + P[b], y = cy + P[a + 1] + P[b + 1], z = cz + P[a + 2] + P[b + 2], l = Math.sqrt(x * x + y * y + z * z);
        out[o + k * 3] = x / l; out[o + k * 3 + 1] = y / l; out[o + k * 3 + 2] = z / l;
      }
      return deg;
    }
    function corners(c) { check(c); const t = new Float64Array(18), deg = cornersInto(c, t, 0), out = []; for (let k = 0; k < deg; k++) out.push([t[k * 3], t[k * 3 + 1], t[k * 3 + 2]]); return out; }
    function cellAt(p) {
      let x = +p[0], y = +p[1], z = +p[2];
      const l = Math.sqrt(x * x + y * y + z * z); if (!(l > 0)) throw new Error('globe: cellAt needs a non-zero vector');
      x /= l; y /= l; z /= l;
      let bf = 0, bd = -2;
      for (let f = 0; f < 20; f++) { const q = FN[f][0] * x + FN[f][1] * y + FN[f][2] * z; if (q > bd) { bd = q; bf = f; } }
      /* first guess: gnomonic barycentric on face bf, solved in the plane of its three corners */
      const F = FACES[bf], A = IV[F[0]], B = IV[F[1]], Cc = IV[F[2]];
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const t = (nx * A[0] + ny * A[1] + nz * A[2]) / (nx * x + ny * y + nz * z);
      const qx = x * t - A[0], qy = y * t - A[1], qz = z * t - A[2];
      const d00 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], d01 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], d11 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
      const d20 = qx * e1[0] + qy * e1[1] + qz * e1[2], d21 = qx * e2[0] + qy * e2[1] + qz * e2[2], den = d00 * d11 - d01 * d01;
      const b1 = (d11 * d20 - d01 * d21) / den, b2 = (d00 * d21 - d01 * d20) / den;
      const d = bf >> 1;
      let i, j;
      if ((bf & 1) === 0) { j = b2 * n; i = (b1 + b2) * n; } else { i = b2 * n; j = (b1 + b2) * n; }
      i = Math.max(0, Math.min(n, Math.round(i))); j = Math.max(0, Math.min(n, Math.round(j)));
      let c = gid(d, i, j);
      /* then walk downhill to the nearest centre */
      for (let guard = 0; guard < 4 * n + 16; guard++) {
        let best = c, bq = P[c * 3] * x + P[c * 3 + 1] * y + P[c * 3 + 2] * z;
        for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k], q = P[m * 3] * x + P[m * 3 + 1] * y + P[m * 3 + 2] * z; if (q > bq || (q === bq && m < best)) { bq = q; best = m; } }
        if (best === c) break;
        c = best;
      }
      return c;
    }
    function cellAtLatLon(lat, lon) { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; return cellAt([Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]); }

    /* ---- the class rule (GLOBE.md section 2), computed once on first use ----
       Targets scale with the cell count; at n = 128: peak 12 x 31 = 372, core 25,000, sea 16,384, wild 40,000, creator
       the rest (82,086). Order:
         1. peak: the 12 pentagons plus round(3n/128) rings around each (3 rings, about 1 km, at n = 128).
         2. core: a NETWORK of reserved land, spread over the whole globe - Ashvale's own vale on the shore of one of
            the seas, a harbour a walk down that same shore, and an outpost on most of the other faces, all joined to
            each other by routes over dry ground. See step 2 below. Peaks and the ground the water wants are never core.
         3. sea: the lowest values of a continent-scale field among the rest (10% of all cells). That field is mostly a
            very low-frequency noise, which is what makes the water gather into oceans with coastlines you can walk
            along; a finer noise at a third of the weight only roughens the shore. Cells within 2 rings of the network
            are left dry, so a reserved parcel has a bank rather than a lagoon at its back door - but that is all: the
            network runs up to the water on purpose, and Ashvale's coast is a walk, not a march.
         4. wild: the lowest values of a second noise, minus a bonus for being within a few rings of the core (room for
            expansions), among the rest.
         5. creator: everything left.
       Ties always break by cell id, so the result is exact and identical everywhere. */
    let CLS = null;
    function classes() {
      if (CLS) return CLS;
      const S0 = hashStr(seed), codes = new Uint8Array(count);
      /* 2026-10-03: "mostly water with a couple of large land masses" - 65 % sea, and the land budgets shrink with it
         (core 15,000, wild 10,000, creator parcels whatever is left: about 32,000) */
      const tCore = Math.round(count * 15000 / 163842), tSea = Math.round(count * 0.65), tWild = Math.round(count * 10000 / 163842);
      const rings = Math.round(1 * n / 128);   /* the corner peaks cover the grid's 12 pentagons and no more: the real mountains are the ranges */
      /* 1. peaks */
      const hop = new Int32Array(count).fill(-1), q = new Int32Array(count);
      let qh = 0, qt = 0;
      for (let c = 0; c < count; c++) if (DEG[c] === 5) { hop[c] = 0; q[qt++] = c; }
      while (qh < qt) { const c = q[qh++]; if (hop[c] >= rings) continue; for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (hop[m] < 0) { hop[m] = hop[c] + 1; q[qt++] = m; } } }
      let nPeak = 0;
      /* 2026-10-03: no corner peaks. The 12 pentagons (the grid's singular points) and their first ring are WATER
         instead - open sea in the ocean, a small round lake on land - so nobody walks over a pentagon and nothing stands
         there looking like a lone mountain. They count toward the sea budget. */
      let nPent = 0;
      const pentNear = new Uint8Array(count);
      for (let c = 0; c < count; c++) if (hop[c] >= 0) { codes[c] = C_SEA; nPent++; pentNear[c] = 1; for (let k = 0; k < DEG[c]; k++) pentNear[NB[c * 6 + k]] = 1; }
      /* 2. core: a NETWORK of reserved land, spread over the whole globe instead of heaped up in one place.
         The sea field that step 3 will use is worked out first and its waterline found, so the ground the water wants
         is known before any of it is reserved. Then:
           a. Ashvale's home: the seed picks a shore - a land cell 6..14 rings (2..5 km) from the water of one of the
              big seas, out of the ice, well inside one face, with nearly a full disc of dry land behind it. The vale
              is grown round that anchor, so the town sits just inland of a coast it can walk to.
           b. a harbour: a cell on the shore of that same sea, 8..18 rings (3..7 km) from the anchor with a little
              room behind it, so a second town can stand right on the coastline within walking distance of the first;
           c. outposts: the dry land nearest the middle of as many other faces as will take one, none within 20 km of
              a node already chosen - this is what spreads the reserved parcels around the world;
           d. routes: every new node is joined to the land already reserved by the cheapest line of cells over dry
              ground, so the network is one piece and its roads do not ford the sea;
           e. each node is grown to its budget, and whatever is left of the budget spreads ring by ring out from the
              whole network, which fattens the nodes and thickens the lines.
         Nothing is ever reserved on a peak or on ground the water wants, so the network has coasts but no lagoons. */
      const sSea = mix32(S0 ^ 0x68e31da4), sCoast = mix32(S0 ^ 0x85ebca6b), sWild = mix32(S0 ^ 0xb5297a4d);
      const sCore = mix32(S0 ^ 0x2545f491), sRoute = mix32(S0 ^ 0x1b873593), sPick = mix32(S0 ^ 0x3f2335e5);
      const SP = faceEdge / n, ALT = hgt;
      const score = new Float64Array(count), srt = new Float64Array(count);
      /* the land field: two continents, each a cap round a seeded centre (the second 110..150 degrees from the first, so
         they are two masses with ocean between them), its edge pushed in and out by a coast noise so the shores are
         ragged and the odd island breaks off. The lowest 65 % of the field is sea. */
      const rv = (k) => (mix32((sSea + Math.imul(k, 0x9e3779b9)) >>> 0) >>> 8) / 16777216;
      const CN = [];
      {
        const z0 = (rv(1) * 2 - 1) * 0.55, a0 = rv(2) * 2 * Math.PI, r0 = Math.sqrt(1 - z0 * z0);
        const A = [r0 * Math.cos(a0), r0 * Math.sin(a0), z0];
        let tx = -A[1], ty = A[0], tz = 0; const tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
        const bx = A[1] * tz - A[2] * ty, by = A[2] * tx - A[0] * tz, bz = A[0] * ty - A[1] * tx;
        const ang = (110 + 40 * rv(3)) * Math.PI / 180, dir = rv(4) * 2 * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang);
        const ux = Math.cos(dir) * tx + Math.sin(dir) * bx, uy = Math.cos(dir) * ty + Math.sin(dir) * by, uz = Math.cos(dir) * tz + Math.sin(dir) * bz;
        CN.push([A[0], A[1], A[2], 0.86], [A[0] * ca + ux * sa, A[1] * ca + uy * sa, A[2] * ca + uz * sa, 0.78]);
      }
      /* island chains (the operator: "islands, maybe like island chains"): a few seeded great-circle arcs across the oceans,
         beaded with islands by a fine noise; and lakes: a slow noise sinks patches of the continents' interiors */
      const CH = [], sLake = mix32(S0 ^ 0x7feb352d), sBead = mix32(S0 ^ 0x846ca68b);
      for (let i = 0; i < 5; i++) {
        const z1 = rv(10 + i * 4) * 2 - 1, a1 = rv(11 + i * 4) * 2 * Math.PI, r1 = Math.sqrt(1 - z1 * z1);
        const A = [r1 * Math.cos(a1), r1 * Math.sin(a1), z1];
        let ex = -A[1], ey = A[0], ez = 0; const el = Math.sqrt(ex * ex + ey * ey) || 1; ex /= el; ey /= el;
        const fx = A[1] * ez - A[2] * ey, fy = A[2] * ex - A[0] * ez, fz = A[0] * ey - A[1] * ex, th = rv(12 + i * 4) * 2 * Math.PI;
        const T = [Math.cos(th) * ex + Math.sin(th) * fx, Math.cos(th) * ey + Math.sin(th) * fy, Math.cos(th) * ez + Math.sin(th) * fz];
        const N = [A[1] * T[2] - A[2] * T[1], A[2] * T[0] - A[0] * T[2], A[0] * T[1] - A[1] * T[0]];
        CH.push({ A, T, N, len: (35 + 45 * rv(13 + i * 4)) * Math.PI / 180, w: 0.06 + 0.04 * rv(30 + i) });
      }
      for (let c = 0; c < count; c++) {
        const x = P[c * 3], y = P[c * 3 + 1], z = P[c * 3 + 2];
        let land = -9;
        for (const k of CN) { const d = Math.acos(Math.max(-1, Math.min(1, x * k[0] + y * k[1] + z * k[2]))); land = Math.max(land, 1 - d / k[3]); }
        let chain = 0;
        for (const k of CH) {
          const off = Math.asin(Math.max(-1, Math.min(1, x * k.N[0] + y * k.N[1] + z * k.N[2])));
          const along = Math.atan2(x * k.T[0] + y * k.T[1] + z * k.T[2], x * k.A[0] + y * k.A[1] + z * k.A[2]);
          if (along < 0 || along > k.len) continue;
          const taper = Math.min(1, along / 0.1, (k.len - along) / 0.1);
          chain = Math.max(chain, Math.max(0, 1 - Math.abs(off) / k.w) * taper);
        }
        const bead = fbm(x, y, z, sBead, 14, 3);
        const lake = Math.max(0, fbm(x, y, z, sLake, 3.4, 3) - 0.6) * 6 * Math.max(0, Math.min(1, land * 3));
        score[c] = land + 0.9 * (fbm(x, y, z, sCoast, 2.2, 4) - 0.5) + 0.4 * (fbm(x, y, z, sSea, 6, 3) - 0.5)
          + chain * Math.max(0, bead - 0.4) * 10 - lake;
        srt[c] = score[c];
      }
      srt.sort();
      const WL = srt[Math.min(tSea, count - 1)], WLM = WL + 0.02;
      const wet = (c) => score[c] <= WLM || pentNear[c] === 1;   /* the pentagon lakes count as water the network keeps off */
      /* landmasses (dry cells joined by dry cells): Ashvale and its harbour stand on a big one (never an
         island of a chain), and a hub's road only runs over its own */
      const mass = new Int32Array(count).fill(-1);
      /* by the true waterline, not the slackened wet set: a low marshy strip is still land you can walk */
      { let id = 0; for (let c = 0; c < count; c++) { if (mass[c] >= 0 || score[c] <= WL) continue; qh = 0; qt = 0; q[qt++] = c; mass[c] = id;
          while (qh < qt) { const v = q[qh++]; for (let e = 0; e < DEG[v]; e++) { const m = NB[v * 6 + e]; if (mass[m] < 0 && score[m] > WL) { mass[m] = id; q[qt++] = m; } } } id++; } }
      const mSize = new Int32Array(count); for (let c = 0; c < count; c++) if (mass[c] >= 0) mSize[mass[c]]++;
      const BIGM = Math.max(200, Math.round(count * 0.02)), bigLand = (c) => mass[c] >= 0 && mSize[mass[c]] >= BIGM;
      /* the seas that field wants, and the ones big enough to be worth a town's while */
      const body = new Int32Array(count).fill(-1), bodyN = [];
      for (let c = 0; c < count; c++) {
        if (body[c] >= 0 || !wet(c)) continue;
        const id = bodyN.length; let k = 0; qh = 0; qt = 0; q[qt++] = c; body[c] = id;
        while (qh < qt) { const v = q[qh++]; k++; for (let e = 0; e < DEG[v]; e++) { const m = NB[v * 6 + e]; if (body[m] < 0 && wet(m)) { body[m] = id; q[qt++] = m; } } }
        bodyN.push(k);
      }
      const BIG = Math.max(48, Math.round(tSea / 40));
      const dbs = new Int32Array(count).fill(-1), dbody = new Int32Array(count).fill(-1);
      qh = 0; qt = 0;
      /* distance to the shore of a real sea. The seed is the true waterline (score <= WL), not the slackened wet set:
         where the coast is flat, the +0.02 slack is many rings wide, and a town picked 4 rings from "wet" stood 14
         rings from water. */
      for (let c = 0; c < count; c++) if (score[c] <= WL && bodyN[body[c]] >= BIG) { dbs[c] = 0; dbody[c] = body[c]; q[qt++] = c; }
      while (qh < qt) { const c = q[qh++]; for (let e = 0; e < DEG[c]; e++) { const m = NB[c * 6 + e]; if (dbs[m] < 0) { dbs[m] = dbs[c] + 1; dbody[m] = dbody[c]; q[qt++] = m; } } }
      /* dry land behind a point: how far a town can spread before it runs into the sea or a peak */
      const stamp = new Int32Array(count), dst = new Int32Array(count); let mark = 0;
      const R5 = Math.max(1, Math.round(5 * n / 128)), DISC5 = 1 + 3 * R5 * (R5 + 1);
      function dryDisc(c, maxd) {
        mark++; let k = 0; qh = 0; qt = 0;
        stamp[c] = mark; dst[c] = 0; q[qt++] = c;
        while (qh < qt) {
          const v = q[qh++]; k++;
          if (dst[v] >= maxd) continue;
          for (let e = 0; e < DEG[v]; e++) {
            const m = NB[v * 6 + e];
            if (stamp[m] === mark || wet(m) || codes[m] === C_PEAK) continue;
            stamp[m] = mark; dst[m] = dst[v] + 1; q[qt++] = m;
          }
        }
        return k;
      }
      const rnd = (c) => (mix32((sPick + Math.imul(c, 0x9e3779b9)) >>> 0) >>> 8) / 16777216;
      function pickHome(loR, hiR, maxz, minBack) {
        let best = -1, bs = -1e9;
        for (let c = 0; c < count; c++) {
          if (codes[c] !== C_CREATOR || wet(c) || !bigLand(c)) continue;
          const d = dbs[c];
          if (d < loR || d > hiR) continue;
          const z = P[c * 3 + 2];
          if (z * z > maxz) continue;
          const fb0 = faceBary(c);
          if (Math.min(fb0[1], fb0[2], fb0[3]) * ALT < 1500) continue;
          const back = dryDisc(c, R5);
          if (back < minBack * DISC5) continue;
          const s = 2.4 * Math.min(1, bodyN[dbody[c]] / (tSea * 0.25)) + 1.2 * (back / DISC5) + 1.7 * rnd(c);
          if (s > bs) { bs = s; best = c; }
        }
        return best;
      }
      /* Ashvale's doorstep: 4..10 rings of dry land between the town and its sea, so the water is a 15-35 minute walk
         from the well and the town still stands clear of the tide line. */
      const loR = Math.max(2, Math.round(2 * n / 128)), hiR = Math.max(3, Math.round(5 * n / 128));   /* the operator: inland just a bit, a walk from the coast town */
      /* a wide first pass, then the coast. dryDisc counts land within five rings, and a spot with a coast inside five
         rings has less of it, so a strict backing cut every coastal candidate out and the fallback landed Ashvale in
         the middle of a continent. */
      /* 2026-10-03: "Saltmere needs to be directly on the sea coast, and Ashvale in the adjacent parcel away from
         the sea, with a trail between the two". So the harbour is picked first - a dry cell on the very shore of a big
         sea, on a big landmass, out of the ice, well inside a face, with dry land behind it - and Ashvale is the
         neighbouring cell that lies farthest from the water. */
      let harbour = -1, centre = -1;
      {
        let bs = -1e9;
        for (let c = 0; c < count; c++) {
          if (codes[c] !== C_CREATOR || score[c] <= WL || !bigLand(c) || dbs[c] < 1 || dbs[c] > 1) continue;
          const z = P[c * 3 + 2]; if (z * z > 0.81) continue;
          const fb0 = faceBary(c); if (Math.min(fb0[1], fb0[2], fb0[3]) * ALT < 2500) continue;
          let inl = -1;
          for (let e = 0; e < DEG[c]; e++) { const m = NB[c * 6 + e]; if (codes[m] === C_CREATOR && !wet(m) && dbs[m] >= 2 && mass[m] === mass[c] && (inl < 0 || dbs[m] > dbs[inl])) inl = m; }
          if (inl < 0) continue;
          const back = dryDisc(inl, R5);
          if (back < 0.45 * DISC5) continue;
          const sc = 2.4 * Math.min(1, bodyN[dbody[c]] / (tSea * 0.25)) + 1.2 * (back / DISC5) + 1.7 * rnd(c);
          if (sc > bs) { bs = sc; harbour = c; centre = inl; }
        }
      }
      if (centre < 0) { centre = pickHome(loR, hiR, 0.9, 0.3); if (centre < 0) centre = cellAt(FN[mix32(S0 ^ 0x51ed270b) % 20]); }
      const coreFace = face(centre);
      /* the heap: Dijkstra growth and routing, keyed by accumulated cost, ties by cell id */
      const hk = new Float64Array(count), gg = new Float64Array(count), heap = new Int32Array(count), inH = new Uint8Array(count), prev = new Int32Array(count);
      let hn = 0;
      const less = (a, b) => hk[a] < hk[b] || (hk[a] === hk[b] && a < b);
      function push(c, k) { gg[c] = k; hk[c] = k + (hTo ? Math.sqrt(Math.max(0, 2 - 2 * (P[c * 3] * tx + P[c * 3 + 1] * ty + P[c * 3 + 2] * tz))) * R / (SP * 1.2) : 0); inH[c] = 1; let m = hn++; heap[m] = c; while (m > 0) { const p2 = (m - 1) >> 1; if (!less(heap[m], heap[p2])) break; const t = heap[m]; heap[m] = heap[p2]; heap[p2] = t; m = p2; } }
      function pop() { const top = heap[0]; heap[0] = heap[--hn]; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hn && less(heap[l], heap[m])) m = l; if (r < hn && less(heap[r], heap[m])) m = r; if (m === k) break; const t = heap[k]; heap[k] = heap[m]; heap[m] = t; k = m; } return top; }
      let hTo = false, tx = 0, ty = 0, tz = 0;
      let nCore = 0;
      function grow(seeds, budget, amp) {
        let made = 0;
        inH.fill(0); hn = 0; hTo = false;
        for (let i = 0; i < seeds.length; i++) { const c = seeds[i]; if (!inH[c] && codes[c] === C_CREATOR && !wet(c)) push(c, 0); }
        while (hn > 0 && made < budget && nCore < tCore) {
          const c = pop();
          if (codes[c] !== C_CREATOR) continue;
          codes[c] = C_CORE; nCore++; made++;
          for (let e = 0; e < DEG[c]; e++) {
            const m = NB[c * 6 + e];
            if (inH[m] || codes[m] !== C_CREATOR || wet(m)) continue;
            push(m, gg[c] + 1 + amp * fbm(P[m * 3], P[m * 3 + 1], P[m * 3 + 2], sCore, 26, 3));
          }
        }
        return made;
      }
      function route(from) {
        if (codes[from] === C_CORE) return 0;
        let made = 0;
        inH.fill(0); hn = 0; prev.fill(-1);
        hTo = true; tx = P[from * 3]; ty = P[from * 3 + 1]; tz = P[from * 3 + 2];
        for (let c = 0; c < count; c++) if (codes[c] === C_CORE) push(c, 0);
        let hit = false;
        while (hn > 0) {
          const c = pop();
          if (c === from) { hit = true; break; }
          for (let e = 0; e < DEG[c]; e++) {
            const m = NB[c * 6 + e];
            if (inH[m]) continue;
            prev[m] = c;
            push(m, gg[c] + 1 + 0.9 * fbm(P[m * 3], P[m * 3 + 1], P[m * 3 + 2], sRoute, 34, 3) + (wet(m) ? 400 : 0));
          }
        }
        hTo = false;
        if (!hit) return 0;
        for (let c = from; c >= 0 && codes[c] !== C_CORE; c = prev[c]) { codes[c] = C_CORE; nCore++; made++; }
        return made;
      }
      /* the nodes of the network: Ashvale, its harbour, then one per face as the seed's turn of the globe allows */
      const nodes = [centre], sepN = Math.max(1, Math.round(30 * n / 128)), sep = sepN * (SP / R);
      const far = (c) => {
        const x = P[c * 3], y = P[c * 3 + 1], z = P[c * 3 + 2];
        for (let i = 0; i < nodes.length; i++) {
          const o = nodes[i] * 3;
          if (2 - 2 * (x * P[o] + y * P[o + 1] + z * P[o + 2]) < sep * sep) return false;
        }
        return true;
      };
      grow([centre], Math.round(tCore * 0.06), 0.5);
      if (harbour >= 0) { if (codes[harbour] !== C_CORE) { codes[harbour] = C_CORE; nCore++; } nodes.push(harbour); }   /* Saltmere's parcel, next door to Ashvale's */
      /* 2026-10-03: "the core should only be a network web over the globe". So: small hubs about 10 km apart
         over every big landmass, in a seeded order, each joined by the cheapest dry road to the reserved land already on
         its own landmass (the first hub on another continent starts that continent's web; no road crosses an ocean).
         Hubs stop at three quarters of the budget; the rest widens the roads below, not a blob. */
      {
        const hasCore = new Set([mass[centre]]); if (harbour >= 0) hasCore.add(mass[harbour]);
        const cand = [];
        for (let c = 0; c < count; c++) if (codes[c] === C_CREATOR && !wet(c) && mass[c] >= 0 && mSize[mass[c]] >= BIGM) cand.push(c);
        const key = new Uint32Array(count); for (const c of cand) key[c] = mix32((sPick + Math.imul(c, 0x9e3779b9)) >>> 0);
        cand.sort((a, b) => key[a] - key[b] || a - b);
        const HUB = Math.max(4, Math.round(tCore * 0.004)), STOP = Math.round(tCore * 0.75);
        for (const c of cand) {
          if (nCore >= STOP) break;
          if (codes[c] !== C_CREATOR || !far(c)) continue;
          if (hasCore.has(mass[c])) route(c); else hasCore.add(mass[c]);
          nodes.push(c); grow([c], HUB, 0.8);
        }
      }
      /* whatever is left of the budget goes out from the network ring by ring, so the count is exact and the lines
         thicken rather than the last node swallowing it all */
      {
        const hopC = new Int32Array(count).fill(-1);
        qh = 0; qt = 0;
        for (let c = 0; c < count; c++) if (codes[c] === C_CORE) { hopC[c] = 0; q[qt++] = c; }
        while (qh < qt) { const c = q[qh++]; for (let e = 0; e < DEG[c]; e++) { const m = NB[c * 6 + e]; if (hopC[m] < 0) { hopC[m] = hopC[c] + 1; q[qt++] = m; } } }
        const fr = [];
        for (let c = 0; c < count; c++) if (codes[c] === C_CORE) { for (let e = 0; e < DEG[c]; e++) { const m = NB[c * 6 + e]; if (codes[m] === C_CREATOR && !wet(m)) fr.push(m); } }
        inH.fill(0); hn = 0; hTo = false;
        for (let i = 0; i < fr.length; i++) { const c = fr[i]; if (!inH[c]) push(c, hopC[c]); }
        while (hn > 0 && nCore < tCore) {
          const c = pop();
          if (codes[c] !== C_CREATOR) continue;
          codes[c] = C_CORE; nCore++;
          for (let e = 0; e < DEG[c]; e++) {
            const m = NB[c * 6 + e];
            if (inH[m] || codes[m] !== C_CREATOR || wet(m)) continue;
            push(m, hopC[c] + 1 + 0.6 * fbm(P[m * 3], P[m * 3 + 1], P[m * 3 + 2], sCore, 26, 3));
          }
        }
      }
      const coreCenter = centre;
      /* 3. sea and 4. wild: rank the rest. The sea field is the one step 2 already reserved against, so the water
         lands where the land was kept off it. */
      const rest = [];
      for (let c = 0; c < count; c++) if (codes[c] === C_CREATOR) rest.push(c);
      /* hops from the network over the whole sphere, for both: a short dry strip along its own shore, so a reserved
         parcel never turns into a lagoon, and the bonus for wild near home. Follows the network's outline, so it is
         not a circle drawn on the map. It used to be 45 rings to keep one inland blob away from all water; the
         network runs along the coasts on purpose, so the strip is narrow now and Ashvale's coast is a walk, not a
         march. */
      hop.fill(-1); qh = 0; qt = 0;
      for (let c = 0; c < count; c++) if (codes[c] === C_CORE) { hop[c] = 0; q[qt++] = c; }
      while (qh < qt) { const c = q[qh++]; for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (hop[m] < 0) { hop[m] = hop[c] + 1; q[qt++] = m; } } }
      const dry = 0;   /* 2026-10-03: Saltmere stands right on the sea, so the network may touch the water (no dry strip any more) */
      const belt = Math.max(1, 14 * n / 128);
      const seaCand = [];
      for (const c of rest) if (hop[c] > dry) seaCand.push(c);
      seaCand.sort((a, b) => score[a] - score[b] || a - b);
      const nSea0 = Math.min(tSea - nPent, seaCand.length), nSea = nSea0 + nPent;
      for (let k = 0; k < nSea0; k++) codes[seaCand[k]] = C_SEA;
      const rest2 = [];
      for (const c of rest) {
        if (codes[c] === C_SEA) continue;
        rest2.push(c);
        const h = hop[c] < 0 ? 1e9 : hop[c];
        score[c] = fbm(P[c * 3], P[c * 3 + 1], P[c * 3 + 2], sWild, 3.1, 4) - 0.45 * Math.max(0, 1 - h / belt);
      }
      rest2.sort((a, b) => score[a] - score[b] || a - b);
      const nWild = Math.min(tWild, rest2.length);
      for (let k = 0; k < nWild; k++) codes[rest2[k]] = C_WILD;
      const counts = { core: nCore, creator: count - nCore - nSea - nWild - nPeak, wild: nWild, sea: nSea, peak: nPeak };
      CLS = { codes, counts, coreFace, coreCenter, coreNodes: nodes, coreHarbour: harbour, names: CLASS.slice() };
      return CLS;
    }
    function clsCode(c) { check(c); return classes().codes[c]; }
    function cls(c) { return CLASS[clsCode(c)]; }

    return {
      api: API, v: V, n, radius_m: R, seed, count, NORTH, SOUTH,
      faceEdge_m: faceEdge, spacing_m: faceEdge / n, cellArea_m2: 4 * Math.PI * R * R / count,
      id: (d, i, j) => d * nn + i * n + j, gid, dij, isPentagon, neighbors, center, centerInto, latlon, cellAt, cellAtLatLon,
      corners, cornersInto, face, planar, faceBary,
      faceCorners: (f) => FACES[f].slice(), facePlanarCorners: (f) => QP[f].map(q => q.slice()), faceNormal: (f) => FN[f].slice(),
      degree: (c) => DEG[c], classes, cls, clsCode,
      /* raw typed arrays for renderers (read-only by convention) */
      raw: { centres: P, neighbours: NB, degree: DEG }
    };
  }

  const AshGlobe = { API, V, createGlobe, CLASS, DIAMONDS, icosahedron, hashStr, fbm };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('globe', { api: API, v: V }, () => AshGlobe);
  if (typeof module !== 'undefined' && module.exports) module.exports = AshGlobe;
  root.AshGlobe = AshGlobe;
})(typeof globalThis !== 'undefined' ? globalThis : this);
