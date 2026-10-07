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
  const TREES = 'TPOWMYU';
  function attach(ctx) {
    const g = ctx.geo, T = ctx.T, PT = T.paths, PC = T.pieces, BK = 32;
    const bkey = (f, bx, by) => (f * 8192 + (bx + 4096)) * 8192 + (by + 4096);
    const BUCKET = new Map();
    let SEG = [];   /* per segment: face, x0, y0, x1, y1, halfWidth, kind (0 path, 1 water), carve height */
    const NS = 8, BRIDGE = 14;   /* the widest stream a path bridges, metres */
    ctx.PIECES = []; ctx.PIECE_BY_ID = new Map(); ctx.ROAD_OBJ = [];
    function pieceDist(pc, x, y) {
      const dx = Math.max(pc.px0 - x, 0, x - pc.px1), dy = Math.max(pc.py0 - y, 0, y - pc.py1);
      return Math.sqrt(dx * dx + dy * dy);
    }
    function pieceTile(pc, gx, gy) {
      if (!pc || gx < pc.x || gy < pc.y || gx >= pc.x + pc.w || gy >= pc.y + pc.h) return '';
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
      const ROAD = []; ctx.ROAD_OBJ = ROAD;
      const inPiece = (face, gx, gy) => PIECES.some(q => q.face === face && gx >= q.x && gy >= q.y && gx < q.x + q.w && gy < q.y + q.h);
      function lightTrail(face, pts, w0) {   /* lit posts along a trail between towns (the road to Saltmere) */
        if (!pts || pts.length < 2) return;
        const SPACE = 8, off = Math.max(1.15, (w0 || 1) + 0.85), seen = new Set();
        let acc = SPACE * 0.45, n = 0;
        for (let i = 1; i < pts.length; i++) {
          const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
          const L = Math.hypot(bx - ax, by - ay); if (L < 0.05) continue;
          const ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
          let d = 0;
          while (acc + (L - d) >= SPACE) {
            const step = SPACE - acc; d += step; acc = 0;
            const px = ax + ux * d, py = ay + uy * d, side = (n++ & 1) ? 1 : -1;
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
        const pc = { id: String(sp.id), face: sp.face | 0, x: sp.x | 0, y: sp.y | 0, w: sp.w | 0, h: sp.h | 0, tiles: sp.tiles || [], objects: sp.objects || [], exits: sp.exits || [], belt: +sp.belt || 0, links: sp.links || [] };
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
        pc.ex = ex;
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
        const D0 = Math.hypot(tx - x, ty - y), w0 = Math.max(1.4, PT.halfMin, Math.min(PT.halfMax, ea.w / 2));   /* a road is wider than a footpath */
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
        const si = Math.round((x - gx0) / CS), sj = Math.round((y - gy0) / CS), ti = Math.round((tx - gx0) / CS), tj = Math.round((ty - gy0) / CS);
        const gsc = new Float32Array(GW * GH).fill(1e30), from = new Int32Array(GW * GH).fill(-1), heap = [];
        const hpush = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p2 = (i - 1) >> 1; if (heap[p2][0] <= heap[i][0]) break; const t2 = heap[p2]; heap[p2] = heap[i]; heap[i] = t2; i = p2; } };
        const hpop = () => { const top = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a2 = 2 * i + 1, b2 = a2 + 1; let m2 = i; if (a2 < heap.length && heap[a2][0] < heap[m2][0]) m2 = a2; if (b2 < heap.length && heap[b2][0] < heap[m2][0]) m2 = b2; if (m2 === i) break; const t2 = heap[m2]; heap[m2] = heap[i]; heap[i] = t2; i = m2; } } return top; };
        const sk = sj * GW + si, tk = tj * GW + ti; gsc[sk] = 0; hpush(0, sk); let found = false, pops = 0;
        while (heap.length && pops < 400000) {
          const [, k] = hpop(); pops++; if (k === tk) { found = true; break; }
          const i = k % GW, j = (k - i) / GW, h0 = hgt[k] === hgt[k] ? hgt[k] : 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
            const nk = nj * GW + ni; if (nk !== tk && !ok(ni, nj)) continue;
            const step = (di && dj ? 1.414 : 1) * CS, dh = Math.abs((hgt[nk] === hgt[nk] && hgt[nk] > -1e8 ? hgt[nk] : h0) - h0);
            const ng = gsc[k] + step * (1 + 0.6 * dh / CS) * (0.92 + 0.16 * g.u01(g.hash3(ni, nj, hv)));
            if (ng < gsc[nk]) { gsc[nk] = ng; from[nk] = k; hpush(ng + Math.hypot(ni - ti, nj - tj) * CS, nk); }
          }
        }
        if (found) {
          const pts = []; for (let k = tk; k >= 0; k = from[k]) { const i = k % GW, j = (k - i) / GW; pts.push([gx0 + i * CS, gy0 + j * CS]); if (k === sk) break; }
          pts.reverse(); pts[0] = [x, y]; pts[pts.length - 1] = [tx, ty];
          let px0 = pts[0][0], py0 = pts[0][1];
          for (let k = 2; k < pts.length; k += 2) { const q = pts[Math.min(k, pts.length - 1)]; segs.push(A.face, px0, py0, q[0], q[1], w0, 3, A.hb - 0.75); px0 = q[0]; py0 = q[1]; }
          segs.push(A.face, px0, py0, tx, ty, w0, 3, A.hb - 0.75);
          lightTrail(A.face, pts, w0);
        } else {
          const pts = [[x, y]];
          for (let k = 0, d = 0; d < D0 * 2.5 && Math.hypot(tx - x, ty - y) > PT.step; k++, d += PT.step) {
            const aim = Math.atan2(ty - y, tx - x) / (2 * Math.PI), a = aim + (g.u01(g.mix32(hv + k * 7919)) - 0.5) * PT.turn * 0.8;
            const nx = x + g.ccos(a) * PT.step, ny = y + g.csin(a) * PT.step;
            ctx.foldInto(A.face, nx, ny, SB);
            const s = ctx.landInto(SB[0], SB[1], SB[2], SB, tmp, false);
            segs.push(A.face, x, y, nx, ny, w0, s.h < ctx.WATER ? 2 : 3, A.hb - 0.75);
            x = nx; y = ny; pts.push([x, y]);
          }
          segs.push(A.face, x, y, tx, ty, w0, 3, A.hb - 0.75);
          pts.push([tx, ty]); lightTrail(A.face, pts, w0);
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
      ctx.ROAD_OBJ = ROAD.filter(o => pathDist(o.face, o.x + 0.5, -(o.y + 0.5)) > 0.3);
      if (ctx.clearCaches) ctx.clearCaches();
      return PIECES.map(p => ({ id: p.id, face: p.face, x: p.x, y: p.y, w: p.w, h: p.h, hb: p.hb }));
    }
    Object.assign(ctx, { pieceDist, pieceTile, pathDist, roadDist, bridgeDist, waterCarve, pieceFlora, setSetPieces, pathCount: () => SEG.length / NS, roadObjects: () => ctx.ROAD_OBJ || [] });
    return ctx;
  }
  const api = { api: 1, attach };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('wg_paths', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
