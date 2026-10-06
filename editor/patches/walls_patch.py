"""Every walk-in building has its walls (2026-10-04: "Sometimes I'm able to walk through the walls of buildings").
world.js only built walls inside the OLD map's rectangle (x, y >= 0, from before the world grew), so a building north
of y = 0 - six in Saltmere today: the Harbour Master, the North Warehouse and four houses - or in any area made from the
Atlas had none at all. Walls and "inside" now stand wherever a building does (the tile keys work for any coordinate).
Applied to the editor's preview now and to the game after v0.8.4."""
import os, sys
H = sys.argv[1] if len(sys.argv) > 1 else '/home/you/ashvale3d'
p = os.path.join(H, 'src', 'world.js'); s = open(p).read()
A = [("    const wset = (x, y, b) => { if (inOld(x, y)) { const k = key(x, y); wall.set(k, (wall.get(k) || 0) | b); } };",
      "    const wset = (x, y, b) => { const k = key(x, y); wall.set(k, (wall.get(k) || 0) | b); };   /* anywhere: not only the old map's rectangle (the operator: walls you could walk through) */"),
     ("    const wclr = (x, y, b) => { if (inOld(x, y)) { const k = key(x, y); wall.set(k, (wall.get(k) || 0) & ~b); } };",
      "    const wclr = (x, y, b) => { const k = key(x, y); wall.set(k, (wall.get(k) || 0) & ~b); };"),
     ("      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (inOld(x, y)) inside.add(key(x, y));",
      "      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) inside.add(key(x, y));")]
if A[0][1] in s: print('walls patch already in', H); sys.exit()
for a, b in A:
    assert s.count(a) == 1, a[:70]; s = s.replace(a, b)
open(p, 'w').write(s); print('walls patch applied to', H)
