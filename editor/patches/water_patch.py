"""Flat water in the Atlas (2026-10-04: "we have some wonky water mechanics ... water should be flat and it ends
at the shore"). earth.js put every vertex at max(ground, sea level), so a lake or river was its own BED painted blue - a
tilted bowl. A lake/river vertex now sits at its water surface (wl), the way the sea sits at sea level: flat, and the
shore is where the ground rises above it. Applied to the editor's preview now and to the game after v0.8.4."""
import os, sys
H = sys.argv[1] if len(sys.argv) > 1 else '/home/you/ashvale3d'
p = os.path.join(H, 'src', 'earth.js'); s = open(p).read()
a = "          const s = W.sample(f, px, py), hw = Math.max(s.h, W.WATER), r = R + hw;"
b = "          const s = W.sample(f, px, py), hw = Math.max(s.h, W.WATER, s.river > 0.5 && s.wl > s.h ? s.wl : -1e9), r = R + hw;   /* lakes and rivers at their surface: flat water (the operator) */"
if b in s: print('water patch already in', H); sys.exit()
assert s.count(a) == 1, 'earth.js vertex line not found'
open(p, 'w').write(s.replace(a, b)); print('water patch applied to', H)
