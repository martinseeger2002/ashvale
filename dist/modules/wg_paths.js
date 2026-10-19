/* ASHVALE worldgen part: set pieces and what leaves their edges (module wg_paths, api 1). Pure and deterministic.
   A set piece is a hand-made place: {id, face, x, y, w, h, tiles:[strings], objects?:[{k, x, y, w, h, ...}],
   exits?:[{x, y, dir, w}], belt?: metres} with (x, y) the game tile of its top-left corner on that face (game y grows
   south, planar y = -game y). 2026-10-02: the hand-made map keeps its own look inside, but must MEET the seeded
   land at its edges with no visible seam or rectangle. So at registration this module measures every edge:
     - pieces that touch share one base height (no step where the village meets Whisperwood);
     - an edge PROFILE per edge tile: tree density and the tree letters in the outer 5 rows (+-3 tiles along the edge),
       so the seeded land just outside starts with the same density and the same kinds of tree and fades into its own
       over T.pieces.fade metres (after an optional `belt` of metres where the piece's woods simply continue);
     - runs of 'p' on an outer edge (and explicit exits) continue as winding dirt paths that may fork, always out past the
       piece's belt, and bridge a stream up to BRIDGE metres wide (a path over water is drawn as 'B');
     - runs of '~' on an outer edge continue as a stream bed carved below the water line.
   attach(ctx) adds: PIECES, PIECE_BY_ID, pieceDist(pc, x, y), pieceTile(pc, gx, gy), pathDist(f, x, y) (< 0 on a path),
   waterCarve(f, x, y) -> carve height or null, pieceFlora(f, x, y, out) -> {k (0 = piece-like .. 1 = seeded), dens, sp},
   setSetPieces(list) -> [{id, face, x, y, w, h, hb}] */
(function (root) {
  'use strict';
  const META = { api: 1, v: 3, needs: { wg_geo: 1 } };
  const TREES = 'TPOWMYUELQZD';
  function attach(ctx) {
    const g = ctx.geo, T = ctx.T, PT = T.paths, PC = T.pieces, BK = 32;
    const bkey = (f, bx, by) => (f * 8192 + (bx + 4096)) * 8192 + (by + 4096);
    const BUCKET = new Map();
    let SEG = [];   /* per segment: face, x0, y0, x1, y1, halfWidth, kind (0 path, 1 water), carve height */
    const NS = 8, BRIDGE = 14;   /* the widest stream a path bridges, metres */
    ctx.PIECES = []; ctx.PIECE_BY_ID = new Map(); ctx.ROAD_OBJ = [];
    /* a piece from another face of the net (worldgen.js piecesFromZones, Ziibiing 2026-10-11) is a ROTATED rectangle here:
       pc.rot = {ox, oy (its origin corner, planar), ax, ay (the zone's +x and +y tile axes, planar), w, h, tiles}; (u, v) are
       a planar point's zone-tile coordinates. Its x, y, w, h stay the bounding box. */
    const rotUV = (pc, x, y) => { const R = pc.rot, dx = x - R.ox, dy = y - R.oy; return [dx * R.ax[0] + dy * R.ax[1], dx * R.ay[0] + dy * R.ay[1]]; };
    function pieceDist(pc, x, y) {
      if (pc.rot) { const q = rotUV(pc, x, y), dx = Math.max(-q[0], 0, q[0] - pc.rot.w), dy = Math.max(-q[1], 0, q[1] - pc.rot.h); return Math.sqrt(dx * dx + dy * dy); }
      const dx = Math.max(pc.px0 - x, 0, x - pc.px1), dy = Math.max(pc.py0 - y, 0, y - pc.py1);
      return Math.sqrt(dx * dx + dy * dy);
    }
    function pieceTile(pc, gx, gy) {
      if (!pc || gx < pc.x || gy < pc.y || gx >= pc.x + pc.w || gy >= pc.y + pc.h) return '';
      if (pc.rot) { const q = rotUV(pc, gx + 0.5, -(gy + 0.5)); if (q[0] < 0 || q[1] < 0 || q[0] >= pc.rot.w || q[1] >= pc.rot.h) return ''; const row = pc.rot.tiles[Math.floor(q[1])]; return row ? (row[Math.floor(q[0])] || '.') : '.'; }
      const row = pc.tiles[gy - pc.y]; return row ? (row[gx - pc.x] || '.') : '.';
    }
    function segDist(f, x, y, kind) {
      const L = BUCKET.get(bkey(f, Math.floor(x / BK), Math.floor(y / BK)));
      if (!L) return null;
      let best = 1e9, bo = -1;
      for (let k = 0; k < L.length; k++) {
        const o = L[k] * NS; if (SEG[o] !== f || SEG[o + 6] !== kind) continue;
        const ax = SEG[o + 1], ay = SEG[o + 2], ex = SEG[o + 3] - ax, ey = SEG[o + 4] - ay;
        const t = g.clamp01(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)), dx = x - ax - ex * t, dy = y - ay - ey * t;
        const d = Math.sqrt(dx * dx + dy * dy) - SEG[o + 5];
        if (d < best) { best = d; bo = o; }
      }
      return bo < 0 ? null : [best, SEG[bo + 7]];
    }
    function pathDist(f, x, y) { const r = segDist(f, x, y, 0), b = segDist(f, x, y, 2), c = segDist(f, x, y, 3); return Math.min(r ? r[0] : 1e9, b ? b[0] : 1e9, c ? c[0] : 1e9); }
    /* kind 3: a cobbled road - the trails that link one town to another (2026-10-07: "a cobblestone road from Ashvale to Saltmere") */
    function roadDist(f, x, y) { const c = segDist(f, x, y, 3); return c ? c[0] : 1e9; }
    function bridgeDist(f, x, y) { const b = segDist(f, x, y, 2); return b ? b[0] : 1e9; }
    /* a stream bed: the carve height (the piece's own wet-tile height) blended over 1.5 m banks, or null */
    function waterCarve(f, x, y, h) {
      const r = segDist(f, x, y, 1); if (!r || r[0] > 1.5) return h;
      const k = g.sstep(-0.6, 1.5, r[0]); return Math.min(h, r[1] * (1 - k) + h * k);
    }
    /* GROVES (2026-10-08: "a large deciduous forest with maple and birch" by Ziibiing): an ellipse of woods tied to a
       piece (globecfg.groves: {piece, x, y, rx, ry, sp, dens, edge}, game tiles), its edge wandering with noise. Returns the
       grove's species and density and k, how fully this spot is in it (0 outside .. 1 well inside), or null */
    const GROVE = { k: 0, sp: '', dens: 0 };
    /* groves given on their own, {face, x, y (that face's game tiles), rx, ry, sp, dens, edge}: the zone tools plant a grove
       before the piece it belongs to exists (tools/make_zone_ziibiing.py samples the woods its camp stands in) */
    ctx.FREE_GROVES = []; ctx.setGroves = (l) => { ctx.FREE_GROVES = (l || []).slice(); };
    function groveAt(f, x, y) {
      const gx = x, gy = -y;
      for (const q of ctx.FREE_GROVES) if (q.face === f) { const r = groveOne(q, f, gx, gy); if (r) return r; }
      for (const pc of ctx.PIECES) if (pc.face === f && pc.groves && pc.groves.length) for (const q of pc.groves) { const r = groveOne(q, f, gx, gy); if (r) return r; }
      return null;
    }
    function groveOne(q, f, gx, gy) {
      {
        const dx = (gx - q.x) / q.rx, dy = (gy - q.y) / q.ry, d = Math.sqrt(dx * dx + dy * dy) * (0.85 + 0.3 * g.vnoise(gx / 37, gy / 37, f, ctx.S.pa ^ 0x6b43));
        if (d >= 1) return null;
        const e = Math.max(0.05, (q.edge || 30) / Math.min(q.rx, q.ry)), t = Math.min(1, (1 - d) / e);
        GROVE.k = t * t * (3 - 2 * t); GROVE.sp = q.sp || 'M'; GROVE.dens = q.dens == null ? 0.6 : q.dens; return GROVE;
      }
      return null;
    }
    /* WALLS OF OLD WOODS (2026-10-09: "a natural looking dense forest separating the two regions. Dense enough that players
       cannot walk through it ... a couple kilometers in each direction following the river path"): a band along a line of points
       (globecfg.walls: {piece, pts: [[x, y], ...], w, edge, sp}, game tiles). Inside its core every land tile is an old tree
       nothing chops; its edges wander with noise and thin out over `edge` metres, like a forest's own margin. Returns {k, sp}:
       k = 1 in the core, 0..1 in the margin; or null */
    const WALL = { k: 0, sp: '' };
    function wallAt(f, x0, y0) {
      /* the line wanders (2026-10-09: "Don't make the line of trees so straight"): the ground is warped before it is
         measured - big slow bends of up to ~60 m and small ones of ~15 m - so the band curves like a forest edge, never a ruler */
      const sx = x0, sy = -y0, S0 = ctx.S.pa ^ 0x51ed;
      const gx = sx + 60 * (2 * g.vnoise(sx / 230, sy / 230, f, S0) - 1) + 15 * (2 * g.vnoise(sx / 47, sy / 47, f, S0 ^ 0x9e37) - 1);
      const gy = sy + 60 * (2 * g.vnoise(sx / 230 + 17.3, sy / 230 - 9.1, f, S0 ^ 0x3c6e) - 1) + 15 * (2 * g.vnoise(sx / 47 - 5.7, sy / 47 + 3.3, f, S0 ^ 0x85eb) - 1);
      for (const pc of ctx.PIECES) if (pc.face === f && pc.walls && pc.walls.length) for (const q of pc.walls) {
        const P = q.pts, half0 = (q.w || 40) / 2, edge = q.edge || 12, wide = q.wide || 0, pad = half0 * 1.3 + edge + 80 + wide;
        if (!q.bb) { let a = 1e18, b = -1e18, c = 1e18, d = -1e18; for (const p of P) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); } q.bb = [a - pad, b + pad, c - pad, d + pad]; }
        if (gx < q.bb[0] || gx > q.bb[1] || gy < q.bb[2] || gy > q.bb[3]) continue;
        let best = 1e18, left = false;
        for (let i = 1; i < P.length; i++) {
          const ax = P[i - 1][0], ay = P[i - 1][1], dx = P[i][0] - ax, dy = P[i][1] - ay, L2 = dx * dx + dy * dy;
          const t = L2 ? Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / L2)) : 0, ex = gx - ax - t * dx, ey = gy - ay - t * dy;
          const e2 = ex * ex + ey * ey; if (e2 < best) { best = e2; left = dx * ey - dy * ex < 0; }
        }
        /* `wide`: extra depth on the left of the line as it is walked (the Ashvale side, 2026-10-09: "so wide that the trees on the
           far side don't render in the players view") */
        const d = Math.sqrt(best), half = half0 * (0.8 + 0.45 * g.vnoise(gx / 53, gy / 53, f, ctx.S.pa ^ 0x2f17)) + (left ? wide : 0);
        if (d >= half + edge) continue;
        WALL.sp = q.sp || 'ZZD'; WALL.k = d <= half ? 1 : 1 - (d - half) / edge; return WALL;
      }
      return null;
    }
    /* flora near a piece: the profile of the nearest edge tile, and how far the seeded land has taken over */
    function pieceFlora(f, x, y, out) {
      out.k = 1; out.dens = 0; out.sp = '';
      let best = 1e9, bp = null;
      for (const pc of ctx.PIECES) if (pc.face === f) { const d = pieceDist(pc, x, y); if (d < best) { best = d; bp = pc; } }
      if (!bp) return out;
      if (best < 0) best = 0;
      const reach = bp.belt * (0.6 + 0.8 * g.vnoise(x / 23, y / 23, f, ctx.S.pa)), fade = PC.fade;
      if (best > reach + fade) return out;
      /* nearest edge tile: clamp into the rect, then pick the edge it lies on */
      const cx = Math.max(bp.px0, Math.min(bp.px1, x)), cy = Math.max(bp.py0, Math.min(bp.py1, y));
      const dl = Math.abs(cx - bp.px0), dr = Math.abs(bp.px1 - cx), db = Math.abs(cy - bp.py0), dt = Math.abs(bp.py1 - cy);
      let pr, i;
      const m = Math.min(dl, dr, db, dt);
      if (m === dt) { pr = bp.prof.n; i = Math.floor(cx - bp.px0); } else if (m === db) { pr = bp.prof.s; i = Math.floor(cx - bp.px0); }
      else if (m === dl) { pr = bp.prof.w; i = Math.floor(bp.py1 - cy); } else { pr = bp.prof.e; i = Math.floor(bp.py1 - cy); }
      const e = pr[Math.max(0, Math.min(pr.length - 1, i))];
      out.k = g.sstep(reach, reach + fade, best); out.dens = e[0]; out.sp = e[1];
      return out;
    }
    function profile(pc, edge) {
      const out = [], n = edge === 'n' || edge === 's' ? pc.w : pc.h;
      if (pc.rot) { for (let i = 0; i < n; i++) out.push([0, '']); return out; }   /* a rotated piece (another face): its bounding box edges are open ground, the same whether its zone is loaded or a stub */
      for (let i = 0; i < n; i++) {
        let trees = 0, cnt = 0, sp = '';
        for (let a = -3; a <= 3; a++) for (let dpt = 0; dpt < 5; dpt++) {
          const along = i + a; if (along < 0 || along >= n) continue;
          let gx, gy;
          if (edge === 'n') { gx = pc.x + along; gy = pc.y + dpt; } else if (edge === 's') { gx = pc.x + along; gy = pc.y + pc.h - 1 - dpt; }
          else if (edge === 'w') { gx = pc.x + dpt; gy = pc.y + along; } else { gx = pc.x + pc.w - 1 - dpt; gy = pc.y + along; }
          const L = pieceTile(pc, gx, gy); cnt++;
          if (TREES.indexOf(L) >= 0) { trees++; sp += L; }
        }
        out.push([cnt ? trees / cnt : 0, sp]);
      }
      return out;
    }
    const SB = new Float64Array(6);
    function setSetPieces(list) {
      const PIECES = [], tmp = ctx.newSample();
      ctx.PIECES = PIECES; ctx.PIECE_BY_ID = new Map(); BUCKET.clear(); SEG = [];
      const ROAD = [], BRIDGE_LIT = [], ROADS_L = []; ctx.ROAD_OBJ = ROAD;   /* ROADS_L: the roads between towns as laid, for their signposts */   /* BRIDGE_LIT: torches on road bridges, which stand on the road and so skip the verge filter below */
      const inPiece = (face, gx, gy) => PIECES.some(q => q.face === face && gx >= q.x && gy >= q.y && gx < q.x + q.w && gy < q.y + q.h);
      function lightTrail(face, pts, w0) {   /* lit posts along a trail between towns (the road to Saltmere) */
        if (!pts || pts.length < 2) return;
        const SPACE = 16 /* every other lamp gone (2026-10-08) */, off = Math.max(1.15, (w0 || 1) + 0.85), seen = new Set();
        let acc = SPACE * 0.45;
        for (let i = 1; i < pts.length; i++) {
          const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
          const L = Math.hypot(bx - ax, by - ay); if (L < 0.05) continue;
          const ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
          let d = 0;
          while (acc + (L - d) >= SPACE) {
            const step = SPACE - acc; d += step; acc = 0;
            const px = ax + ux * d, py = ay + uy * d, side = 1;   /* all down one side of the road (2026-10-08), not alternating */
            ctx.foldInto(face, px, py, SB);
            const s0 = ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false);
            if (s0.h < ctx.WATER + 0.2 || s0.peakS > 0.08) continue;
            const gx = Math.floor(px + nx * off * side), gy = Math.floor(-(py + ny * off * side)), k = gx + ',' + gy;
            if (seen.has(k) || inPiece(face, gx, gy)) continue;
            seen.add(k); ROAD.push({ k: 'lamp', x: gx, y: gy, w: 1, h: 1, face });
          }
          acc += L - d;
        }
      }
      for (const sp of (list || [])) {
        const pc = { id: String(sp.id), face: sp.face | 0, x: sp.x | 0, y: sp.y | 0, w: sp.w | 0, h: sp.h | 0, tiles: sp.tiles || [], objects: sp.objects || [], exits: sp.exits || [], belt: +sp.belt || 0, groves: sp.groves || [], walls: sp.walls || [], links: sp.links || [], linkStyles: sp.linkStyles || {}, rot: sp.rot || null, ownWays: !!sp.ownWays };
        pc.px0 = pc.x; pc.px1 = pc.x + pc.w; pc.py0 = -(pc.y + pc.h); pc.py1 = -pc.y;
        PIECES.push(pc); ctx.PIECE_BY_ID.set(pc.id, pc);
      }
      /* touching pieces form one group with one base height, taken at the group's centre */
      const grp = PIECES.map((p, i) => i);
      const find = i => { while (grp[i] !== i) i = grp[i] = grp[grp[i]]; return i; };
      for (let a = 0; a < PIECES.length; a++) for (let b = a + 1; b < PIECES.length; b++) {
        const A = PIECES[a], Bp = PIECES[b];
        if (A.face === Bp.face && A.px0 <= Bp.px1 && Bp.px0 <= A.px1 && A.py0 <= Bp.py1 && Bp.py0 <= A.py1) grp[find(a)] = find(b);
      }
      for (let i = 0; i < PIECES.length; i++) {
        if (find(i) !== i) continue;
        const mem = PIECES.filter((p, j) => find(j) === i);
        const x0 = Math.min(...mem.map(p => p.px0)), x1 = Math.max(...mem.map(p => p.px1)), y0 = Math.min(...mem.map(p => p.py0)), y1 = Math.max(...mem.map(p => p.py1));
        ctx.foldInto(mem[0].face, (x0 + x1) / 2, (y0 + y1) / 2, SB);
        const hb = Math.max(ctx.WATER + 0.6, ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false).h);
        for (const p of mem) p.hb = hb;
      }
      for (const pc of PIECES) pc.prof = { n: profile(pc, 'n'), s: profile(pc, 's'), w: profile(pc, 'w'), e: profile(pc, 'e') };
      /* building pads: a town keeps the world's own terrain (the operator: "it looks like they had a bulldozer and flattened a
         square spot"); only the ground under each building is levelled, at the land's height at its middle */
      for (const pc of PIECES) {
        pc.pads = [];
        for (const o of pc.objects) {
          if (!o.w || !o.h || (o.w < 3 && o.h < 3) || !/^(house|shop|smithy|furnace|well|cpad)$/.test(o.k)) continue;
          const cx = o.x + o.w / 2, cy = -(o.y + o.h / 2);
          ctx.foldInto(pc.face, cx, cy, SB);
          const hh = ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false).h;
          /* cpad: a raised platform (the lake castle - the operator: "rather than drop the terrain ... raise the terrain"): its
             top is o.top when that is higher than the land */
          pc.pads.push([o.x, -(o.y + o.h), o.x + o.w, -o.y, Math.max(ctx.WATER + 0.4, hh, o.k === 'cpad' && o.top != null ? o.top : -1e9)]);
        }
      }
      /* exits: runs of 'p' (paths), 'c' (cobbled streets) and '~' (streams) on outer edges, plus explicit exits */
      const inOther = (pc, gx, gy) => PIECES.some(q => q !== pc && q.face === pc.face && gx >= q.x && gy >= q.y && gx < q.x + q.w && gy < q.y + q.h);
      const segs = [];
      /* a road or trail over lake water - a narrow arm, or an editor river whose bed the lake fill keeps above the grid's 0.25 m (the Lake
         Castle's river, tools/castle/make_waters.js), or a natural river's flooded valley (the mountain trails) - crosses it on a bridge
         (kind 2, drawn 'B' by wg_tiles) when the water is no wider than BRIDGE metres along the way: torches at both banks and on the crest,
         and the bridge itself (src/scene.js 'wbridge'); wider water is left to the route to go round. pts in the face's plane. */
      function layBridges(face, pts, w0, hb) {
        const wetAt = (px, py) => { ctx.foldInto(face, px, py, SB); const s1 = ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false); return s1.river >= 3 || s1.h < ctx.WATER; };
        const along = []; for (let q = 0; q + 1 < pts.length; q++) { const a2 = pts[q], b2 = pts[q + 1], n = Math.max(1, Math.ceil(Math.hypot(b2[0] - a2[0], b2[1] - a2[1]))); for (let r = 0; r < n; r++) along.push([a2[0] + (b2[0] - a2[0]) * r / n, a2[1] + (b2[1] - a2[1]) * r / n]); }
        along.push(pts[pts.length - 1]);
        for (let i = 0; i < along.length; i++) {
          if (!wetAt(along[i][0], along[i][1])) continue;
          let j = i; while (j + 1 < along.length && wetAt(along[j + 1][0], along[j + 1][1])) j++;
          const a2 = along[Math.max(0, i - 2)], b2 = along[Math.min(along.length - 1, j + 2)];
          if (Math.hypot(along[j][0] - along[i][0], along[j][1] - along[i][1]) <= BRIDGE) oneBridge(face, a2, b2, along[i], along[j], w0, hb, along[(i + j) >> 1]);
          i = j;
        }
      }
      /* one bridge: its path segment (kind 2) from bank a2 to bank b2, the water from p to q under it, torches at both banks and the crest */
      function oneBridge(face, a2, b2, p, q, w0, hb, m) {
        segs.push(face, a2[0], a2[1], b2[0], b2[1], w0, 2, hb);
        const L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) || 1, nx = -(b2[1] - a2[1]) / L2, ny = (b2[0] - a2[0]) / L2, mid = m || [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        for (const [c, off] of [[a2, w0 + 0.7], [b2, w0 + 0.7], [mid, Math.max(0.6, w0 - 0.2)]]) for (const side of [-1, 1])
          BRIDGE_LIT.push({ k: 'torch', x: Math.floor(c[0] + nx * off * side), y: Math.floor(-(c[1] + ny * off * side)), w: 1, h: 1, face });
        BRIDGE_LIT.push({ k: 'wbridge', x: Math.floor(mid[0]), y: Math.floor(-mid[1]), w: 1, h: 1, face, ax: p[0], ay: -p[1], bx: q[0], by: -q[1], hw: w0 });
      }
      function walk(pc, x, y, base, L, w0, kind, hv, depth) {
        let a = base;
        for (let d = 0, k = 0; d < L; d += PT.step, k++) {
          a = base + (a - base) * PT.pull + (g.u01(g.mix32(hv + k * 7919)) - 0.5) * PT.turn;
          const nx = x + g.ccos(a) * PT.step, ny = y + g.csin(a) * PT.step;
          ctx.foldInto(pc.face, nx, ny, SB);
          if (SB[0] !== pc.face || PIECES.some(q => q.face === pc.face && pieceDist(q, nx, ny) === 0)) break;
          const s = ctx.landInto(pc.face, nx, ny, SB, tmp, false);
          /* low ground stops a path - but not while it is still inside the belt, or the gate it leaves from is sealed
             by the woods (Ashvale's south gate opens onto a stream flat at +0.14 m). A path over real water stays water:
             wg_tiles draws '~' before it draws 'p'. */
          if (s.peakS > 0.02) break;
          if (kind === 0 && s.h < ctx.WATER) {
            /* a stream in the way: if dry land comes back within BRIDGE metres straight ahead, the path crosses on a
               bridge (wg_tiles draws a path over water as 'B') and goes on from the far bank; a lake or the sea ends it */
            let far = 0;
            for (let j = 2; j * PT.step <= BRIDGE && !far; j++) {
              const bx = x + g.ccos(a) * PT.step * j, by = y + g.csin(a) * PT.step * j;
              ctx.foldInto(pc.face, bx, by, SB);
              if (SB[0] !== pc.face || PIECES.some(q => q.face === pc.face && pieceDist(q, bx, by) === 0)) break;
              const sb = ctx.landInto(pc.face, bx, by, SB, tmp, false);
              if (sb.peakS > 0.02) break;
              if (sb.h >= ctx.WATER + 0.3) far = j;
            }
            if (!far) {
              /* too wide to bridge: follow the shore instead - turn a little either way, wider each time, until a
                 step lands on dry ground, and lean the whole path that way so it does not swing back into the lake */
              let turned = false;
              for (const da of [0.04, -0.04, 0.08, -0.08, 0.13, -0.13, 0.19, -0.19]) {
                const tx = x + g.ccos(a + da) * PT.step, ty = y + g.csin(a + da) * PT.step;
                ctx.foldInto(pc.face, tx, ty, SB);
                if (SB[0] !== pc.face || PIECES.some(q => q.face === pc.face && pieceDist(q, tx, ty) === 0)) continue;
                const st = ctx.landInto(pc.face, tx, ty, SB, tmp, false);
                if (st.peakS > 0.02 || st.h < ctx.WATER + 0.3) continue;
                a += da; base += da; segs.push(pc.face, x, y, tx, ty, w0 * (1 - PT.taper * d / L), kind, pc.hb - 0.75); x = tx; y = ty; turned = true; break;
              }
              if (turned) continue;
              break;
            }
            const bx = x + g.ccos(a) * PT.step * far, by = y + g.csin(a) * PT.step * far, hw = Math.max(PT.halfMin, w0 * (1 - PT.taper * d / L));
            segs.push(pc.face, x, y, bx, by, hw, 2, pc.hb - 0.75);   /* kind 2: a bridge */
            x = bx; y = by; d += PT.step * (far - 1); k += far - 1;
            continue;
          }
          if (kind === 0 && s.h < ctx.WATER + (d < pc.belt * 1.4 + PC.fade ? 0 : 0.3)) break;
          segs.push(pc.face, x, y, nx, ny, w0 * (1 - PT.taper * d / L), kind, pc.hb - 0.75);
          if (kind === 0 && depth === 0 && k === 4 + (hv % 6) && g.u01(g.mix32(hv ^ 0xabc)) < PT.fork) {
            const side = g.u01(g.mix32(hv ^ 0xdef)) < 0.5 ? -1 : 1;
            walk(pc, nx, ny, a + side * 0.17, L * 0.6, w0 * 0.75, 0, g.mix32(hv ^ 0x777), 1);
          }
          x = nx; y = ny;
        }
      }
      for (const pc of PIECES) {
        const ex = [];
        const edges = [['n', k => [pc.x + k, pc.y], k => [pc.x + k, pc.y - 1], pc.w], ['s', k => [pc.x + k, pc.y + pc.h - 1], k => [pc.x + k, pc.y + pc.h], pc.w],
          ['w', k => [pc.x, pc.y + k], k => [pc.x - 1, pc.y + k], pc.h], ['e', k => [pc.x + pc.w - 1, pc.y + k], k => [pc.x + pc.w, pc.y + k], pc.h]];
        for (const [dir, at, out, n] of edges) for (const want of ['p', 'c', '~']) {   /* 'c': a cobbled street leaves town too */
          let run = -1;
          for (let k = 0; k <= n; k++) {
            const on = k < n && pieceTile(pc, at(k)[0], at(k)[1]) === want && !inOther(pc, out(k)[0], out(k)[1]);
            if (on && run < 0) run = k;
            if (!on && run >= 0) { const o = out(Math.floor((run + k - 1) / 2)); ex.push({ x: o[0], y: o[1], dir, w: k - run, kind: want === '~' ? 1 : 0 }); run = -1; }
          }
        }
        for (const e of pc.exits) ex.push({ x: e.x, y: e.y, dir: e.dir, w: e.w || 2, kind: 0 });
        pc.ex = pc.rot || pc.ownWays ? [] : ex;   /* a rotated piece (another face): no path or stream runs continue out of its bounding box; nor from a zone whose ways out are laid by hand (ownWays: Thornwatch Camp's cobbled spur, 2026-10-18) */
      }
      /* a gate the road to another town leaves from gets the road only, not a dirt path of its own beside it (the operator
         2026-10-07, the cobbled road): mark the exits the trails between towns will use */
      const nearEx = (list, p) => { let b = null, bd = 1e18; for (const e of list) if (!e.kind) { const d = (e.x + 0.5 - p[0]) ** 2 + (-e.y - 0.5 - p[1]) ** 2; if (d < bd) { bd = d; b = e; } } return b; };
      for (const A of PIECES) for (const bid of A.links) {
        const Bp = ctx.PIECE_BY_ID.get(String(bid)); if (!Bp || Bp.face !== A.face) continue;
        const cen = (q) => [q.x + q.w / 2, -(q.y + q.h / 2)], ea = nearEx(A.ex, cen(Bp)), eb = nearEx(Bp.ex, cen(A)); if (ea && eb) ea.road = eb.road = true;
      }
      for (const pc of PIECES) {
        pc.ex.forEach((e, idx) => {
          if (e.road) return;
          const base = { n: 0.25, s: 0.75, e: 0, w: 0.5 }[e.dir] || 0, hv = g.hash3(idx, g.hashStr(pc.id), ctx.S.pa);
          /* a path must come out the far side of the piece's belt: inside it the woods are as dense as the piece's own
             edge (often a wall of trees), and the belt reaches up to 1.4 x its metres (pieceFlora) and then fades over
             PC.fade, so a shorter path is a dead end in the trees (north of Whisperwood once the vale moved, 2026-10-03) */
          const L = e.kind ? 20 + 30 * g.u01(hv) : Math.max(PT.min + PT.extra * g.u01(hv), pc.belt * 1.4 + PC.fade + PT.step), w0 = Math.max(PT.halfMin, Math.min(PT.halfMax * (e.kind ? 2 : 1), e.w / 2));
          walk(pc, e.x + 0.5, -e.y - 0.5, base, L, w0, e.kind, hv, 0);
        });
      }
      /* trails between pieces (the operator: "there should be a trail between the two"): from the exit of A nearest B to the exit
         of B nearest A, each step aimed at the target with a little wander; over water it is a bridge (kind 2) */
      for (const A of PIECES) for (const bid of A.links) {
        const Bp = ctx.PIECE_BY_ID.get(String(bid)); if (!Bp || Bp.face !== A.face || !A.ex || !Bp.ex) continue;
        const cen = (q) => [q.x + q.w / 2, -(q.y + q.h / 2)], ca = cen(A), cb = cen(Bp);
        const near = (list, p) => { let b = null, bd = 1e18; for (const e of list) if (!e.kind) { const d = (e.x + 0.5 - p[0]) ** 2 + (-e.y - 0.5 - p[1]) ** 2; if (d < bd) { bd = d; b = e; } } return b; };
        const ea = near(A.ex, cb), eb = near(Bp.ex, ca); if (!ea || !eb) continue;
        let x = ea.x + 0.5, y = -ea.y - 0.5; const tx = eb.x + 0.5, ty = -eb.y - 0.5, hv = g.hash3(g.hashStr(A.id), g.hashStr(Bp.id), ctx.S.pa);
        const trail = A.linkStyles[bid] === 'trail', RK = trail ? 0 : 3;   /* a trail (2026-10-07: "a skinny trail running from the village to Ashvale"): dirt, narrow, no lamps */
        /* a WINDING road (globecfg links [a, b, 'wind'], 2026-10-18: the road to the Lake Castle over its hill - "keep the cobble path but make
           it winding through"): cobbles, lamps and fences as any road, but it climbs as a cart would - a steep step costs far more than a
           detour, and a corner is skipped only where the straight way stays under WIND_GRADE - so over a hill it winds along the slopes */
        const wind = A.linkStyles[bid] === 'wind', WIND_GRADE = 0.09;
        const D0 = Math.hypot(tx - x, ty - y), w0 = trail ? PT.halfMin : Math.max(1.4, PT.halfMin, Math.min(PT.halfMax, ea.w / 2));   /* a road is wider than a footpath */
        /* the route goes AROUND water (the operator): a search on a 4 m grid over the ground between the two gates, water,
           rock and other set pieces closed, a little extra cost for slopes so it keeps to the easy ground; the trail is
           laid along it. Only if there is no way round at all does it fall back to a straight line with bridges. */
        /* the stream beds the pieces' own '~' exits will carve (kind 1 segments laid above) are water too */
        const nearStream = (px, py) => { for (let o = 0; o < segs.length; o += NS) { if (segs[o + 6] !== 1 || segs[o] !== A.face) continue;
          const ax = segs[o + 1], ay = segs[o + 2], ex2 = segs[o + 3] - ax, ey2 = segs[o + 4] - ay, t2 = g.clamp01(((px - ax) * ex2 + (py - ay) * ey2) / (ex2 * ex2 + ey2 * ey2 || 1));
          if (Math.hypot(px - ax - ex2 * t2, py - ay - ey2 * t2) < segs[o + 5] + 3) return true; } return false; };
        const CS = 4, M0 = Math.max(160, D0 * 0.6), gx0 = Math.min(x, tx) - M0, gy0 = Math.min(y, ty) - M0;
        const GW = Math.ceil((Math.abs(tx - x) + 2 * M0) / CS) + 1, GH = Math.ceil((Math.abs(ty - y) + 2 * M0) / CS) + 1;
        const hgt = new Float32Array(GW * GH).fill(NaN), ok = (i, j) => {
          const k = j * GW + i; if (hgt[k] === hgt[k]) return hgt[k] > -1e8;
          const px = gx0 + i * CS, py = gy0 + j * CS; let v = -1e9;
          if (!PIECES.some(q => q !== A && q !== Bp && q.face === A.face && pieceDist(q, px, py) < 3) && !nearStream(px, py)) {
            ctx.foldInto(A.face, px, py, SB);
            const s0 = ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false); if (s0.h >= ctx.WATER + 0.25 && s0.peakS < 0.05) v = s0.h;
          }
          hgt[k] = v; return v > -1e8;
        };
        const hpush = (heap, f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p2 = (i - 1) >> 1; if (heap[p2][0] <= heap[i][0]) break; const t2 = heap[p2]; heap[p2] = heap[i]; heap[i] = t2; i = p2; } };
        const hpop = (heap) => { const top = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a2 = 2 * i + 1, b2 = a2 + 1; let m2 = i; if (a2 < heap.length && heap[a2][0] < heap[m2][0]) m2 = a2; if (b2 < heap.length && heap[b2][0] < heap[m2][0]) m2 = b2; if (m2 === i) break; const t2 = heap[m2]; heap[m2] = heap[i]; heap[i] = t2; i = m2; } } return top; };
        function search(x, y, tx, ty) {   /* one reach of the route, gate to gate (or by a waypoint): the grid points, or null */
          const si = Math.round((x - gx0) / CS), sj = Math.round((y - gy0) / CS), ti = Math.round((tx - gx0) / CS), tj = Math.round((ty - gy0) / CS);
          const gsc = new Float32Array(GW * GH).fill(1e30), from = new Int32Array(GW * GH).fill(-1), heap = [];
          const sk = sj * GW + si, tk = tj * GW + ti; gsc[sk] = 0; hpush(heap, 0, sk); let pops = 0;
          while (heap.length && pops < 400000) {
            const [, k] = hpop(heap); pops++;
            if (k === tk) { const pts = []; for (let q = tk; q >= 0; q = from[q]) { const i = q % GW, j = (q - i) / GW; pts.push([gx0 + i * CS, gy0 + j * CS]); if (q === sk) break; } pts.reverse(); pts[0] = [x, y]; pts[pts.length - 1] = [tx, ty]; return pts; }
            const i = k % GW, j = (k - i) / GW, h0 = hgt[k] === hgt[k] ? hgt[k] : 0;
            for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
              if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
              const nk = nj * GW + ni; if (nk !== tk && !ok(ni, nj)) continue;
              const step = (di && dj ? 1.414 : 1) * CS, dh = Math.abs((hgt[nk] === hgt[nk] && hgt[nk] > -1e8 ? hgt[nk] : h0) - h0);
              const gr = dh / step, ng = gsc[k] + step * (wind ? 1 + 2.5 * gr + 30 * Math.max(0, gr - WIND_GRADE) : 1 + (trail ? 0.6 : 0.3) * dh / CS) * (trail ? 0.92 + 0.16 * g.u01(g.hash3(ni, nj, hv)) : 0.98 + 0.04 * g.u01(g.hash3(ni, nj, hv)));   /* a road between towns runs as straight as the ground allows (2026-10-08); a trail wanders */
              if (ng < gsc[nk]) { gsc[nk] = ng; from[nk] = k; hpush(heap, ng + Math.hypot(ni - ti, nj - tj) * CS, nk); }
            }
          }
          return null;
        }
        /* a winding road may be led by waypoints (wg_tables roadVia["A>B"], face tiles: tools/mountain/make_hill.js takes the Lake Castle road
           through the valley between its hill's knobs); each reach between them is searched and straightened on its own */
        const VIA = wind && T.roadVia ? (T.roadVia[A.id + '>' + Bp.id] || []).map(([vx, vy]) => [vx + 0.5, -(vy + 0.5)]) : [];
        const stops = [[x, y], ...VIA, [tx, ty]], legs = [];
        for (let q = 0; q + 1 < stops.length; q++) { const L = search(stops[q][0], stops[q][1], stops[q + 1][0], stops[q + 1][1]); if (!L) { legs.length = 0; break; } legs.push(L); }
        const found = legs.length > 0;
        if (found) {
          const pts = [];
          /* STRAIGHTEN (2026-10-08: "as straight as possible from Ashvale to Saltmere"): a road skips every corner it can - from
             each point, on to the farthest point it reaches in a straight line over open ground - so it runs in long straight
             reaches and bends only where water, rock or a town is in the way. A trail keeps its wander. */
          const hAt = (px, py) => { const fi = (px - gx0) / CS, fj = (py - gy0) / CS, i0 = Math.floor(fi), j0 = Math.floor(fj), u = fi - i0, v = fj - j0;   /* the grid's ground, bilinear (a winding road's grade) */
            const c = (i, j) => { i = Math.max(0, Math.min(GW - 1, i)); j = Math.max(0, Math.min(GH - 1, j)); ok(i, j); const hh = hgt[j * GW + i]; return hh > -1e8 ? hh : 0; };
            return (c(i0, j0) * (1 - u) + c(i0 + 1, j0) * u) * (1 - v) + (c(i0, j0 + 1) * (1 - u) + c(i0 + 1, j0 + 1) * u) * v; };
          const open = (px, py) => { const ci = Math.round((px - gx0) / CS), cj = Math.round((py - gy0) / CS); return ci >= 0 && cj >= 0 && ci < GW && cj < GH && ok(ci, cj); };
          const clear = (a2, b2) => { const L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]), n = Math.ceil(L2 / (CS / 2)); let hp = wind ? hAt(a2[0], a2[1]) : 0;
            for (let q = 1; q < n; q++) { const px = a2[0] + (b2[0] - a2[0]) * q / n, py = a2[1] + (b2[1] - a2[1]) * q / n; if (!open(px, py)) return false;
              if (wind) { const hq = hAt(px, py); if (Math.abs(hq - hp) > WIND_GRADE * L2 / n + 0.02) return false; hp = hq; } }
            return true; };
          for (const leg of legs) {
            let st = leg;
            if (!trail && leg.length > 2) { st = [leg[0]]; let i0 = 0; while (i0 < leg.length - 1) { let j = leg.length - 1; while (j > i0 + 1 && !clear(leg[i0], leg[j])) j--; st.push(leg[j]); i0 = j; } }
            for (let q = pts.length ? 1 : 0; q < st.length; q++) pts.push(st[q]);
          }
          /* a winding road's corners are rounded into bends (Chaikin, three passes; a cut that would leave open ground keeps its corner) */
          if (wind) for (let pass = 0; pass < 3 && pts.length > 2; pass++) {
            const sm = [pts[0]];
            for (let q = 0; q + 1 < pts.length; q++) {
              const a2 = pts[q], b2 = pts[q + 1], c1 = [a2[0] * 0.75 + b2[0] * 0.25, a2[1] * 0.75 + b2[1] * 0.25], c2 = [a2[0] * 0.25 + b2[0] * 0.75, a2[1] * 0.25 + b2[1] * 0.75];
              if (q > 0) sm.push(open(c1[0], c1[1]) ? c1 : a2);
              if (q + 2 < pts.length) sm.push(open(c2[0], c2[1]) ? c2 : b2);
            }
            sm.push(pts[pts.length - 1]); pts.length = 0; pts.push(...sm);
          }
          if (!trail && (legs.length > 1 || legs[0].length > 2)) {   /* back to points every step or so, so the road is laid (and lit) as before */
            const fine = [pts[0]];
            for (let q = 1; q < pts.length; q++) { const a2 = pts[q - 1], b2 = pts[q], n = Math.max(1, Math.ceil(Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) / CS)); for (let r = 1; r <= n; r++) fine.push([a2[0] + (b2[0] - a2[0]) * r / n, a2[1] + (b2[1] - a2[1]) * r / n]); }
            pts.length = 0; pts.push(...fine);
          }
          layBridges(A.face, pts, w0, A.hb - 0.75);   /* a road over narrow water crosses it on a bridge (with its torches) */
          let px0 = pts[0][0], py0 = pts[0][1];
          for (let k = 2; k < pts.length; k += 2) { const q = pts[Math.min(k, pts.length - 1)]; segs.push(A.face, px0, py0, q[0], q[1], w0, RK, A.hb - 0.75); px0 = q[0]; py0 = q[1]; }
          segs.push(A.face, px0, py0, tx, ty, w0, RK, A.hb - 0.75);
          if (!trail) { lightTrail(A.face, pts, w0); ROADS_L.push({ A, B: Bp, pts: pts.slice(), w0 }); }
        } else {
          const pts = [[x, y]];
          for (let k = 0, d = 0; d < D0 * 2.5 && Math.hypot(tx - x, ty - y) > PT.step; k++, d += PT.step) {
            const aim = Math.atan2(ty - y, tx - x) / (2 * Math.PI), a = aim + (g.u01(g.mix32(hv + k * 7919)) - 0.5) * PT.turn * 0.8;
            const nx = x + g.ccos(a) * PT.step, ny = y + g.csin(a) * PT.step;
            ctx.foldInto(A.face, nx, ny, SB);
            const s = ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false);
            segs.push(A.face, x, y, nx, ny, w0, s.h < ctx.WATER ? 2 : RK, A.hb - 0.75);
            x = nx; y = ny; pts.push([x, y]);
          }
          segs.push(A.face, x, y, tx, ty, w0, RK, A.hb - 0.75);
          pts.push([tx, ty]); if (!trail) { lightTrail(A.face, pts, w0); ROADS_L.push({ A, B: Bp, pts: pts.slice(), w0 }); }
        }
      }
      /* SIGNPOSTS (2026-10-18, the operator: "signs at relevant cobble stone path points pointing to next towns"): a fingerpost on the
         verge (the side the lamps are not on) just out of each town on every road between towns, one at the far end, one half way on a
         long road. Each has an arm along the road to each end's town (the road's own direction there, not the crow's), and a post by a
         town points too down that town's other roads. Names: T.signNames (a town of two pieces, Ashvale's village and West End, is one
         name), else the piece's id. Arms: {t, a}, a = the arm's heading in game tiles (atan2(dy, dx), y down the map). */
      {
        const NM = T.signNames || {}, nameOf = p => NM[p.id] || p.id, posts = [];
        const at = (pts, d) => { for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d <= L || i === pts.length - 1) { const k = L ? Math.min(1, d / L) : 0; return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k }; } d -= L; } return { x: pts[0][0], y: pts[0][1] }; };
        const head = (p, q) => Math.atan2(-(q.y - p.y), q.x - p.x);   /* plane points -> a game-tile heading */
        for (const r of ROADS_L) {
          let L = 0; for (let i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
          if (L < 40) continue;
          const a = nameOf(r.A), b = nameOf(r.B);
          const place = (d, by) => {
            const p = at(r.pts, d), fw = at(r.pts, Math.min(L, d + 10)), bk = at(r.pts, Math.max(0, d - 10)), t = at(r.pts, d + 1), u = at(r.pts, d - 1);
            const ux = t.x - u.x, uy = t.y - u.y, ul = Math.hypot(ux, uy) || 1, off = r.w0 + 1.6;
            const px = p.x + (uy / ul) * off, py = p.y - (ux / ul) * off;   /* the left of the road going on, the lamps' other side */
            const gx = Math.floor(px), gy = Math.floor(-py);
            if (inPiece(r.A.face, gx, gy)) return;
            posts.push({ k: 'signpost', x: gx, y: gy, w: 1, h: 1, face: r.A.face, by, arms: [{ t: b, a: +head(p, fw).toFixed(3) }, { t: a, a: +head(p, bk).toFixed(3) }] });
          };
          place(7, a); place(L - 7, b); if (L > 220) place(L / 2, null);
        }
        for (const P of posts) if (P.by) for (const Q of posts) if (Q.by === P.by && Q !== P) {   /* a town's other roads, from its gate */
          const ar = Q.arms[0]; if (P.arms.some(x => x.t === ar.t)) continue;
          const hq = Math.atan2(Q.y - P.y, Q.x - P.x); if (Math.hypot(Q.x - P.x, Q.y - P.y) > 2) P.arms.push({ t: ar.t, a: +hq.toFixed(3) });
        }
        for (const P of posts) { delete P.by; ROAD.push(P); }
        /* FENCES (2026-10-18, the operator: "fences are good to add in a lot of places along paths and roads - for short times, long times,
           medium times, all varies"): rail fences (data/decor.json rail_fence, a 2.9 m section) in runs along the roads between towns and the
           hand-laid trails - a run of 1-2, 3-6 or 8-16 sections, then a gap of 25-90 m - on the side away from the lamps, now and then both
           sides, following the road round its bends (each section sits exactly where it falls: dx/dz carry it off its tile's centre). Seeded
           by the road, so every node lays the same; none over water or rock, none in a town. */
        {
          const SEG = 2.9, lines = ROADS_L.map(r => [r.A.face, r.pts, r.w0, g.hashStr(r.A.id + '>' + r.B.id), true]);
          for (const tr of (T.trails || [])) lines.push([tr.face == null ? (PIECES[0] ? PIECES[0].face : 0) : tr.face, (tr.pts || []).map(([vx, vy]) => [vx + 0.5, -(vy + 0.5)]), tr.w || 1.3, g.hashStr(String(tr.id)), false]);
          for (const [face, pts, w0, seed, road] of lines) {
            if (pts.length < 2) continue;
            let n = 0; const R = () => g.u01(g.mix32(seed + (n++) * 7919));
            const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
            const L = cum[cum.length - 1];
            const pt = d => { let i = 1; while (i < pts.length - 1 && cum[i] < d) i++; const l = cum[i] - cum[i - 1] || 1, k = Math.max(0, Math.min(1, (d - cum[i - 1]) / l)); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; };
            for (let d = 15 + R() * 40; d < L - 10;) {
              const u = R(), cnt = u < 0.45 ? 1 + (R() < 0.5 ? 1 : 0) : u < 0.8 ? 3 + Math.floor(R() * 4) : 8 + Math.floor(R() * 9);
              const sides = R() < 0.22 ? [-1, 1] : [road || R() < 0.5 ? -1 : 1], off = w0 + 1.5;
              for (let i = 0; i < cnt && d < L - 5; i++, d += SEG) {
                const a = pt(d), b = pt(d + SEG), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
                for (const sd of sides) {
                  const px = (a[0] + b[0]) / 2 - ty * sd * off, py = (a[1] + b[1]) / 2 + tx * sd * off;   /* the left of the way on (sd -1: the right), the lamps stand on the left */
                  const gx = Math.floor(px), gy = Math.floor(-py);
                  if (inPiece(face, gx, gy)) continue;
                  ctx.foldInto(face, px, py, SB);
                  const s0 = ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false);
                  if (s0.h < ctx.WATER + 0.2 || s0.peakS > 0.08 || s0.river >= 1.5) continue;   /* nor in a river (2026-10-19: fences stood in the mountain trail's river, beside its bridge) */
                  ROAD.push({ k: 'rail_fence', x: gx, y: gy, w: 1, h: 1, face, ry: +Math.atan2(ty, tx).toFixed(3), pal: s0.h > 75 ? 'snow' : 'temperate', dx: +(px - gx - 0.5).toFixed(2), dz: +(-py - gy - 0.5).toFixed(2) });
                }
              }
              d += 25 + R() * 65;
            }
          }
        }
        /* PATCHES (FARMING, 2026-10-18: "in random free spots between saltmere ashvale and lake castle"): farming patches, 2 x 2 tiles, in
           free spots 5-9 m off the roads between the towns, every 45-135 m (seeded by the road), on dry, level, open ground out of the towns.
           Their tier decides what grows in them (rules.farming): small ones most often, the large ones that take every crop rarest - every
           third patch a tier 2, every seventh a tier 3, the rest tier 1. src/core.js FARMING keeps each player's crop in each. */
        {
          let idx = 0; const placedP = [];
          for (const r of ROADS_L) {
            const pts = r.pts, face = r.A.face, seed = g.hashStr('patch:' + r.A.id + '>' + r.B.id); let n = 0; const R = () => g.u01(g.mix32(seed + (n++) * 7919));
            const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
            const L = cum[cum.length - 1], pt = d => { let i = 1; while (i < pts.length - 1 && cum[i] < d) i++; const l = cum[i] - cum[i - 1] || 1, k = Math.max(0, Math.min(1, (d - cum[i - 1]) / l)); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; };
            for (let d = 30 + R() * 30; d < L - 25; d += 35 + R() * 60) {
              const a = pt(d - 1), b = pt(d + 1), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l, sd0 = R() < 0.5 ? -1 : 1, off = r.w0 + 5 + R() * 4;
              const c = pt(d);
              const fits = (sd) => {   /* this side of the road: dry, level (0.5 m at most over the bed), open, out of the towns, apart from the others */
                const px = c[0] - ty * sd * off, py = c[1] + tx * sd * off, gx = Math.floor(px) - 1, gy = Math.floor(-py) - 1;
                let lo = 1e9, hi = -1e9;
                for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2], [1, 1], [1, 0], [0, 1], [2, 1], [1, 2]]) {   /* corners, middle and edge midpoints: no patch on a slope (2026-10-19: two sat half in a hillside) */
                  if (inPiece(face, gx + Math.min(dx, 1), gy + Math.min(dy, 1))) return null;
                  ctx.foldInto(face, gx + dx, -(gy + dy), SB); const s0 = ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false);
                  if (s0.h < ctx.WATER + 0.3 || s0.peakS > 0.05) return null; lo = Math.min(lo, s0.h); hi = Math.max(hi, s0.h);
                }
                if (hi - lo > 0.5 || placedP.some(q => Math.abs(q[0] - gx) < 5 && Math.abs(q[1] - gy) < 5)) return null;
                const mx = gx + 1, my = -(gy + 1);   /* clear of every path, road and trail laid so far (segs: face, ax, ay, bx, by, half width, kind) */
                for (let o = 0; o < segs.length; o += NS) { if (segs[o] !== face || segs[o + 6] === 1) continue;
                  const ax = segs[o + 1], ay = segs[o + 2], ex = segs[o + 3] - ax, ey = segs[o + 4] - ay, t = Math.max(0, Math.min(1, ((mx - ax) * ex + (my - ay) * ey) / (ex * ex + ey * ey || 1)));
                  if (Math.hypot(mx - ax - ex * t, my - ay - ey * t) < segs[o + 5] + 2.6) return null; }
                return [gx, gy];
              };
              const at = fits(sd0) || fits(-sd0); if (!at) continue;
              const gx = at[0], gy = at[1];
              const tier = idx % 7 === 3 ? 3 : idx % 3 === 1 ? 2 : 1; idx++;
              placedP.push([gx, gy]); ROAD.push({ k: 'farmpatch', x: gx, y: gy, w: 2, h: 2, face, tier });
            }
          }
        }
        for (const S of (T.decor || [])) ROAD.push(Object.assign({ k: S.k, x: S.x, y: S.y, w: 1, h: 1, face: S.face, ry: S.ry || 0, pal: S.pal, s: S.s }, S.dx || S.dz ? { dx: S.dx || 0, dz: S.dz || 0 } : {}));   /* scenery out in the world (data/decor.json kinds; tools/decor/place_trail_decor.js, place_cemetery.js - a railing section on a tile edge: dx/dz off its tile's centre) */
        for (const S of (T.trailSigns || [])) ROAD.push({ k: 'signpost', x: S.x, y: S.y, w: 1, h: 1, face: S.face, arms: S.arms });   /* the great mountain's trails (tools/mountain/make_signs.js) */
      }
      /* hand-laid trails (T.trails, tools/mountain/make_trails.js: the great mountain's safe road, its dangerous climb and the way to it
         from the castle): path segments like the towns' own, through the cliffs wg_tiles makes of steep high ground, bridged over water */
      for (const tr of (T.trails || [])) {
        const face = tr.face == null ? (PIECES[0] ? PIECES[0].face : 0) : tr.face, P2 = (tr.pts || []).map(([vx, vy]) => [vx + 0.5, -(vy + 0.5)]), w0 = tr.w || 1.3;
        for (let q = 0; q + 1 < P2.length; q++) segs.push(face, P2[q][0], P2[q][1], P2[q + 1][0], P2[q + 1][1], w0, tr.road ? 3 : 0, -1e9);   /* tr.road: cobbles, like the roads between towns (2026-10-18: Thornwatch Camp's spur onto the Saltmere road) */
        if (P2.length > 1) layBridges(face, P2, w0, -1e9);
        for (const [ax, ay, bx, by] of (tr.bridges || [])) {   /* a river the trail would ford, bridged as the roads are (tools/mountain/make_bridges.js, 2026-10-19) */
          const p = [ax + 0.5, -(ay + 0.5)], q = [bx + 0.5, -(by + 0.5)], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L;
          oneBridge(face, [p[0] - ux * 2, p[1] - uy * 2], [q[0] + ux * 2, q[1] + uy * 2], p, q, w0, -1e9);
        }
      }
      SEG = segs;
      for (let k = 0; k < SEG.length / NS; k++) {
        const o = k * NS, f = SEG[o], m = PT.clear + 2;
        const bx0 = Math.floor((Math.min(SEG[o + 1], SEG[o + 3]) - m) / BK), bx1 = Math.floor((Math.max(SEG[o + 1], SEG[o + 3]) + m) / BK);
        const by0 = Math.floor((Math.min(SEG[o + 2], SEG[o + 4]) - m) / BK), by1 = Math.floor((Math.max(SEG[o + 2], SEG[o + 4]) + m) / BK);
        for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) { const kk = bkey(f, bx, by); if (!BUCKET.has(kk)) BUCKET.set(kk, []); BUCKET.get(kk).push(k); }
      }
      /* a lamp stands on the verge, never on a path: where trails meet or bend, drop any that came to stand on one (2026-10-07) */
      ctx.ROAD_OBJ = ROAD.filter(o => pathDist(o.face, o.x + 0.5, -(o.y + 0.5)) > 0.3).concat(BRIDGE_LIT);
      if (ctx.clearCaches) ctx.clearCaches();
      return PIECES.map(p => ({ id: p.id, face: p.face, x: p.x, y: p.y, w: p.w, h: p.h, hb: p.hb }));
    }
    Object.assign(ctx, { pieceDist, pieceTile, pathDist, roadDist, bridgeDist, waterCarve, pieceFlora, groveAt, wallAt, setSetPieces, pathCount: () => SEG.length / NS, roadObjects: () => ctx.ROAD_OBJ || [] });
    return ctx;
  }
  const api = { api: 1, attach };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('wg_paths', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
