"""A coastal town's water and shore come from the Atlas terrain (2026-10-04: "The terrain in town, including the
harbor should be based on the Atlas terrain ... They are two separate things and they are clashing").
Before: Saltmere's hand-drawn '~' tiles were water wherever they were drawn, and the land under them was dredged to the
sea (a basin), while the Atlas had its own coast - two shapes that disagreed. Now, in a coastal (sea) piece:
  - no basin and no "lower the ground under water tiles": the town's ground IS the Atlas ground (edits included)
  - its ground letters ('~', 's', '.', ',', 'f') follow that ground: water where it is below sea level, a drawn '~' on dry
    land is beach; buildings, streets, piers, fences, trees and everything else stay as drawn
An inland town's pond (Ashvale's fishing pond) is unchanged. Applied to the editor's preview now, the game after v0.8.4."""
import os, sys
H = sys.argv[1] if len(sys.argv) > 1 else '/home/you/ashvale3d'
def edit(p, a, b):
    p = os.path.join(H, p); s = open(p).read()
    if b in s: return
    assert s.count(a) == 1, (p, a[:90], s.count(a)); open(p, 'w').write(s.replace(a, b))
edit('src/wg_terrain.js', "          if (L === '~') { if (seaPiece(pc)) basin = 1; continue; }",
     "          if (L === '~') continue;   /* no dredged basin: a coastal town's water is the Atlas sea (the operator), an inland pond keeps its own depth */")
edit('src/wg_terrain.js', "      ctx.climate = CLIM; ctx.climOf = climOf;", "      ctx.climate = CLIM; ctx.climOf = climOf; ctx.seaPiece = seaPiece;")
edit('src/worldgen.js', "          if (wet === 4) out.h = Math.min(out.h, pc.hb - 0.75); else if (wet) out.h = Math.min(out.h, pc.hb - 0.3);   /* lower only: a town's harbour is the sea */",
     "          if (!(ctx.seaPiece && ctx.seaPiece(pc))) { if (wet === 4) out.h = Math.min(out.h, pc.hb - 0.75); else if (wet) out.h = Math.min(out.h, pc.hb - 0.3); }   /* an inland pond only: a coastal town's water is the Atlas sea */")
edit('src/wg_tiles.js', "      for (let k = 0; k < PI.length; k++) if (PI[k].face === f) { const L = ctx.pieceTile(PI[k], gx, gy); if (L) return L; }",
     "      for (let k = 0; k < PI.length; k++) if (PI[k].face === f) { const L = ctx.pieceTile(PI[k], gx, gy); if (L) {\n"
     "        /* a coastal town's ground letters follow the Atlas ground: water below sea level, a drawn '~' on dry land is beach */\n"
     "        if ('~s.,f'.indexOf(L) >= 0 && ctx.seaPiece && ctx.seaPiece(PI[k])) { ctx.fieldTrue(f, gx + 0.5, -gy - 0.5, TF); return TF[0] < WATER ? '~' : L === '~' ? 's' : L; }\n"
     "        return L; } }")
print('town ground patch applied to', H)
