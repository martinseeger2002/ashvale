/* ASHVALE worldgen part: set pieces and what leaves their edges (module wg_paths, api 1). Pure and deterministic.
   A set piece is a hand-made place: {id, face, x, y, w, h, tiles:[strings], objects?:[{k, x, y, w, h, ...}],
   exits?:[{x, y, dir, w}], belt?: metres} with (x, y) the game tile of its top-left corner on that face (game y grows
   south, planar y = -game y). 2026-10-02: the hand-made map keeps its own look inside, but must MEET the seeded
   land at its edges with no visible seam or rectangle. So at registration this module measures every edge:
     - pieces that touch share one base height (no step where the village meets Whisperwood);
     - an edge PROFILE per edge tile: tree density and the tree letters in the outer 5 rows (+-3 tiles along the edge),
       so the seeded land just outside starts with the same density and the same kinds of tree and fades into its own
       over T.pieces.fade metres (after an optional `belt` of metres where the piece's woods simply continue);
     - runs of 'p' on an outer edge (and explicit exits) continue as winding dirt paths that may fork;
     - runs of '~' on an outer edge continue as a stream bed carved below the water line.
   attach(ctx) adds: PIECES, PIECE_BY_ID, pieceDist(pc, x, y), pieceTile(pc, gx, gy), pathDist(f, x, y) (< 0 on a path),
   waterCarve(f, x, y) -> carve height or null, pieceFlora(f, x, y, out) -> {k (0 = piece-like .. 1 = seeded), dens, sp},
   setSetPieces(list) -> [{id, face, x, y, w, h, hb}] */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1, needs: { wg_geo: 1 } };
  const TREES = 'TPOWMY';
  function attach(ctx) {
    const g = ctx.geo, T = ctx.T, PT = T.paths, PC = T.pieces, BK = 32;
    const bkey = (f, bx, by) => (f * 8192 + (bx + 4096)) * 8192 + (by + 4096);
    const BUCKET = new Map();
    let SEG = [];   /* per segment: face, x0, y0, x1, y1, halfWidth, kind (0 path, 1 water), carve height */
    const NS = 8;
    ctx.PIECES = []; ctx.PIECE_BY_ID = new Map();
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
    function pathDist(f, x, y) { const r = segDist(f, x, y, 0); return r ? r[0] : 1e9; }
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
      for (const sp of (list || [])) {
        const pc = { id: String(sp.id), face: sp.face | 0, x: sp.x | 0, y: sp.y | 0, w: sp.w | 0, h: sp.h | 0, tiles: sp.tiles || [], objects: sp.objects || [], exits: sp.exits || [], belt: +sp.belt || 0 };
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
      /* exits: runs of 'p' (paths) and '~' (streams) on outer edges, plus explicit exits */
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
          if (s.peakS > 0.02 || (kind === 0 && s.h < ctx.WATER + 0.3)) break;
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
        for (const [dir, at, out, n] of edges) for (const want of ['p', '~']) {
          let run = -1;
          for (let k = 0; k <= n; k++) {
            const on = k < n && pieceTile(pc, at(k)[0], at(k)[1]) === want && !inOther(pc, out(k)[0], out(k)[1]);
            if (on && run < 0) run = k;
            if (!on && run >= 0) { const o = out(Math.floor((run + k - 1) / 2)); ex.push({ x: o[0], y: o[1], dir, w: k - run, kind: want === '~' ? 1 : 0 }); run = -1; }
          }
        }
        for (const e of pc.exits) ex.push({ x: e.x, y: e.y, dir: e.dir, w: e.w || 2, kind: 0 });
        ex.forEach((e, idx) => {
          const base = { n: 0.25, s: 0.75, e: 0, w: 0.5 }[e.dir] || 0, hv = g.hash3(idx, g.hashStr(pc.id), ctx.S.pa);
          const L = e.kind ? 20 + 30 * g.u01(hv) : PT.min + PT.extra * g.u01(hv), w0 = Math.max(PT.halfMin, Math.min(PT.halfMax * (e.kind ? 2 : 1), e.w / 2));
          walk(pc, e.x + 0.5, -e.y - 0.5, base, L, w0, e.kind, hv, 0);
        });
      }
      SEG = segs;
      for (let k = 0; k < SEG.length / NS; k++) {
        const o = k * NS, f = SEG[o], m = PT.clear + 2;
        const bx0 = Math.floor((Math.min(SEG[o + 1], SEG[o + 3]) - m) / BK), bx1 = Math.floor((Math.max(SEG[o + 1], SEG[o + 3]) + m) / BK);
        const by0 = Math.floor((Math.min(SEG[o + 2], SEG[o + 4]) - m) / BK), by1 = Math.floor((Math.max(SEG[o + 2], SEG[o + 4]) + m) / BK);
        for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) { const kk = bkey(f, bx, by); if (!BUCKET.has(kk)) BUCKET.set(kk, []); BUCKET.get(kk).push(k); }
      }
      if (ctx.clearCaches) ctx.clearCaches();
      return PIECES.map(p => ({ id: p.id, face: p.face, x: p.x, y: p.y, w: p.w, h: p.h, hb: p.hb }));
    }
    Object.assign(ctx, { pieceDist, pieceTile, pathDist, waterCarve, pieceFlora, setSetPieces, pathCount: () => SEG.length / NS });
    return ctx;
  }
  const api = { api: 1, attach };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('wg_paths', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
