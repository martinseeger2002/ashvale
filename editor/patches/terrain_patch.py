"""Terrain and region edits from the Atlas (2026-10-04: "In the Atlas view, I should be able to edit the terrain
raising and lowering and region type"). Apply AFTER the v0.8.4 release (with or without the other patches).
  wg_terrain.js  an EDIT LAYER on the generated land: brush strokes on the sphere (a unit vector + a radius in metres),
                 applied in order after rivers and towns and before the forest, sand and climate are worked out:
                   {op: 'raise'|'lower', u, r, dh}    the ground goes up/down by dh at the centre, a smooth falloff
                   {op: 'flatten', u, r, to, s}       pulled toward height `to` (s 0..1)
                   {op: 'step', u, r, dh, k, st}      SimCity 2000 style: a flat top of radius r raised/lowered by dh,
                                                      sides stepping down st metres every k metres (pyramids, terraces)
                   {op: 'water', u, r, to}            a pond or stream: the bed dug under a lake surface at height `to`
                   {op: 'trees', u, r, s}             forest density s (0 = clear) blended in
                   {op: 'region', u, r, clim}         the climate zone (0..7) inside: temperature and moisture are
                                                      blended to that zone's, so trees, ground and sand follow it
                 Read from wg_tables `edits` (the game's and the Atlas's own copy) and settable at run time.
  worldgen.js    W.setEdits(list) / W.edits(): replace the layer and drop the cached lattice and sites
  earth.js       app.setEdits(list) rebuilds the planet patches and the ground chunks around you; app.pick(x, y)
                 = the point on the ground under the pointer (unit vector), for the editor's brushes"""
import os, sys
H = sys.argv[1] if len(sys.argv) > 1 else '/home/you/ashvale3d'
def edit(p, a, b, n=1):
    p = os.path.join(H, p); s = open(p).read()
    assert s.count(a) == n, (p, a[:90], s.count(a)); open(p, 'w').write(s.replace(a, b))

# ---- wg_terrain: the layer
edit('src/wg_terrain.js', "    function landInto(f, x, y, fb, out, usePieces) {",
"""    /* ---- hand edits (the world editor, 2026-10-04): strokes on the sphere, bucketed on a 3D grid of ~200 m so a
       sample only looks at the strokes near it; off while the climate is first worked out (EDIT_ON) */
    let EDITS = null, EDIT_ON = false, EDC = 0, EDT = 0, EDM = 0, EDW = -1e9, EDF = -1, EDFW = 0;
    const EG = 200 / R, CLIM_AT = [[12, 0.6], [12, 0.2], [12, 0.06], [28, 0.06], [26, 0.22], [27, 0.8], [1, 0.5], [-8, 0.3]];   /* a temperature and moisture inside each zone (climOf) */
    const ekey = (a, b, c) => ((a + 1024) * 2048 + (b + 1024)) * 2048 + (c + 1024);
    function setEdits(list) {
      EDITS = null; if (!list || !list.length) return;
      const m = new Map();
      list.forEach((e, i) => {
        const u = e.u, l = Math.hypot(u[0], u[1], u[2]) || 1, E = Object.assign({}, e, { u: [u[0] / l, u[1] / l, u[2] / l], r: Math.max(1, +e.r || 20), i }); E.reach = reach(E); const k = E.reach / R;
        for (let a = Math.floor((E.u[0] - k) / EG); a <= Math.floor((E.u[0] + k) / EG); a++) for (let b = Math.floor((E.u[1] - k) / EG); b <= Math.floor((E.u[1] + k) / EG); b++) for (let c = Math.floor((E.u[2] - k) / EG); c <= Math.floor((E.u[2] + k) / EG); c++) {
          const key = ekey(a, b, c); let L = m.get(key); if (!L) m.set(key, L = []); L.push(E);
        }
      });
      EDITS = m;
    }
    const fall = (t) => t >= 1 ? 0 : (1 - t * t) * (1 - t * t);
    /* a stroke's reach: a step's slopes run past its flat top */
    const reach = (e) => e.op === 'step' ? e.r + Math.max(1, +e.k || 8) : e.r;
    function editH(ux, uy, uz, h) {   /* the edited height; leaves the zone override (EDC weight, EDT/EDM) for the climate */
      EDC = 0; EDW = -1e9; EDFW = 0;
      const L = EDITS.get(ekey(Math.floor(ux / EG), Math.floor(uy / EG), Math.floor(uz / EG))); if (!L) return h;
      for (const e of L) {
        const dx = ux - e.u[0], dy = uy - e.u[1], dz = uz - e.u[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) * R; if (d >= e.reach) continue;
        const w = fall(d / e.r);
        if (e.op === 'step') {   /* a click of the SimCity-style raise/lower: a flat top of radius r, then a smooth slope `k` metres wide */
          const k = Math.max(1, +e.k || 8), t = Math.max(0, d - e.r) / k;
          if (t < 1) { const q = 1 - t; h += (+e.dh || 0) * q * q * (3 - 2 * q); }   /* smoothstep: no cliff at the edge (the operator: less drastic) */
          continue;
        }
        if (e.op === 'water') { const top = +e.to || 0; if (d < e.r) { h = Math.min(h, top - 0.4 - 1.6 * w); EDW = top; } continue; }   /* a pond / a stream: the bed under a level surface */
        if (e.op === 'trees') { const k = Math.min(1, w * 1.6); EDF = EDFW ? EDF + ((+e.s || 0) - EDF) * k : +e.s || 0; EDFW = Math.max(EDFW, k); continue; }
        if (e.op === 'raise' || e.op === 'lower') h += (e.op === 'lower' ? -Math.abs(+e.dh || 0) : Math.abs(+e.dh || 0)) * w;
        else if (e.op === 'flatten') h += ((+e.to || 0) - h) * Math.min(1, w * 1.6) * (e.s == null ? 1 : +e.s);
        else if (e.op === 'region' && CLIM_AT[e.clim | 0]) { const k = Math.min(1, w * 1.8), z = CLIM_AT[e.clim | 0]; EDT = EDC ? EDT + (z[0] - EDT) * k : z[0]; EDM = EDC ? EDM + (z[1] - EDM) * k : z[1]; EDC = Math.max(EDC, k); }
      }
      return h;
    }
    function landInto(f, x, y, fb, out, usePieces) {""")
edit('src/wg_terrain.js', """      /* inside a town the land keeps its own shape; only the building pads are levelled, blending over 4 m */""",
     """      /* the world editor's strokes, on the generated ground BEFORE the towns' building pads and the rivers, so a pad
         (sampled from this ground) and a river channel see the edited land once, not twice */
      if (EDIT_ON && EDITS) h = editH(ux, uy, uz, h); else { EDC = 0; EDFW = 0; EDW = -1e9; }
      /* inside a town the land keeps its own shape; only the building pads are levelled, blending over 4 m */""")
edit('src/wg_terrain.js', """      out.piece = piece;
      out.h = h;""", """      if (EDW > -1e8 && h < EDW) { out.river = 3; out.wl = EDW; h = Math.min(h, EDW - 0.4); }   /* an editor pond: a lake at its own surface */
      out.piece = piece;
      out.h = h;""")
edit('src/wg_terrain.js', """        mo += (fbm(X, Y, Z, (S.cm ^ 0x165667b1) >>> 0, 0.004, 2) - 0.5) * 0.1;
        const cz = climOf(te, mo);""", """        mo += (fbm(X, Y, Z, (S.cm ^ 0x165667b1) >>> 0, 0.004, 2) - 0.5) * 0.1;
        if (EDC > 0) { te += (EDT - te) * EDC; mo += (EDM - mo) * EDC; }   /* a region painted in the editor */
        const cz = climOf(te, mo);""")
edit('src/wg_terrain.js', "      ctx.climate = CLIM; ctx.climOf = climOf;",
     "      ctx.climate = CLIM; ctx.climOf = climOf;\n      ctx.setEdits = setEdits;")
open_p = os.path.join(H, 'src/wg_terrain.js'); s = open(open_p).read()
assert s.count('    return ctx;\n') >= 1
# turn the layer on once the planet's climate has been worked out (the last thing attach does)
i = s.rindex('    return ctx;\n'); s = s[:i] + "    ctx.setEdits = setEdits; setEdits(T.edits || null); EDIT_ON = true;   /* the editor's layer: on from here */\n" + s[i:]
open(open_p, 'w').write(s)

edit('src/wg_terrain.js', "      out.forest = forest;\n      out.site = 0;", "      if (EDFW > 0) forest = forest * (1 - EDFW) + EDF * EDFW;   /* trees planted or cleared in the editor */\n      out.forest = forest;\n      out.site = 0;")

# ---- worldgen: setEdits + cache drop
edit('src/worldgen.js', "      ctx.clearCaches = () => { LAT.clear(); ctx.clearSites(); };",
     "      ctx.clearCaches = () => { LAT.clear(); ctx.clearSites(); };\n"
     "      let EDL = T.edits || null, LASTPC = null;\n"
     "      const setEdits = (list) => { EDL = list && list.length ? list.slice() : null; ctx.setEdits(EDL); ctx.clearCaches(); if (LASTPC) ctx.setSetPieces(LASTPC); ctx.clearCaches(); };   /* the world editor (the operator): the towns' pads follow the new ground */")
edit('src/worldgen.js', "sites: ctx.sites, setSetPieces: ctx.setSetPieces, piecesFromZones,", "sites: ctx.sites, setSetPieces: (l) => { LASTPC = l; ctx.setSetPieces(l); }, piecesFromZones,")   # remember them: setEdits re-places them
edit('src/worldgen.js', "      if (O.setPieces) ctx.setSetPieces(O.setPieces);", "      if (O.setPieces) { LASTPC = O.setPieces; ctx.setSetPieces(O.setPieces); }")
edit('src/worldgen.js', "        walkable: ctx.walkable, tileAt: ctx.tileAt, tiles: ctx.tiles,",
     "        setEdits, edits: () => EDL,\n        walkable: ctx.walkable, tileAt: ctx.tileAt, tiles: ctx.tiles,")

# ---- earth: live rebuild + pick
edit('src/earth.js', "        places: PLACES, W, G\n      };",
"""        places: PLACES, W, G,
        /* the world editor (the operator: "edit the terrain raising and lowering and region type" in the Atlas) */
        pick: (x, y) => groundUnder(x, y),
        setEdits: (list, near) => {
          W.setEdits(list);
          if (near && near.u) {   /* only the patches and ground chunks a stroke touches; the drawn ones are rebuilt in place */
            const cx = near.u[0] * R, cy = near.u[1] * R, cz = near.u[2] * R, rr = (near.r || 50) + 10, onScreen = new Set(drawn);
            const st = roots.slice();
            while (st.length) { const n = st.pop(); if (Math.hypot(n.C[0] - cx, n.C[1] - cy, n.C[2] - cz) > n.rad * 1.2 + rr) continue;
              if (n.mesh) { if (onScreen.has(n)) { if (!n.stale) { n.stale = true; staleQ.push(n); } } else dropMesh(n); }   /* on screen: rebuilt a few a frame, the old mesh shown till then */
              if (n.kids) for (const k of n.kids) st.push(k); }
            for (const [key, c] of chunks) { if (!c.P) continue; if (Math.hypot(c.P[0] + (c.E[0] + c.N[0]) * SZ / 2 - cx, c.P[1] + (c.E[1] + c.N[1]) * SZ / 2 - cy, c.P[2] + (c.E[2] + c.N[2]) * SZ / 2 - cz) > SZ + rr) continue;
              if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); } chunks.delete(key); }
            return;
          }
          const st = roots.slice();   /* every patch in the quadtree goes; the 20 roots are rebuilt at once so the planet never blanks */
          while (st.length) { const n = st.pop(); if (n.mesh) { if (n.mesh.parent) n.mesh.parent.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh = null; } if (n.kids) for (const k of n.kids) st.push(k); }
          for (const c of chunks.values()) if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); }
          chunks.clear(); buildQ.clear(); for (const r0 of roots) buildNode(r0);
        }
      };""")
edit('src/earth.js', "      const nodes = [], buildQ = new Set();", "      const nodes = [], buildQ = new Set(), staleQ = [];   /* staleQ: patches an editor stroke touched, rebuilt in place (no gap, no hitch) */")
edit('src/earth.js', "          const arr = Array.from(buildQ).filter(n => !n.mesh && frame - n.used < 3).sort((a, b) => b.want - a.want); buildQ.clear();",
     "          for (const t1 = performance.now(); staleQ.length && performance.now() - t1 < 8;) { const n = staleQ.shift(); n.stale = false; if (!n.mesh) continue; const old = n.mesh; n.mesh = null; live--; buildNode(n); n.mesh.visible = old.visible; scene.remove(old); old.geometry.dispose(); }\n"
     "          const arr = Array.from(buildQ).filter(n => !n.mesh && frame - n.used < 3).sort((a, b) => b.want - a.want); buildQ.clear();")
print('terrain patch applied to', H)
