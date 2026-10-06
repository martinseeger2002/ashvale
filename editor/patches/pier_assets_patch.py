"""Piers and bridges are building assets, not terrain (2026-10-04: "I don't like that the piers are a part of the
terrain, they should be building assets instead"). A zone object {k: 'pier' | 'bridge', x, y, w, h} is the asset; the
walkable deck ('B' tiles, the same deck height, walking and look as before) is laid from it when the zone is placed, so
the zone's own ground letters underneath are just the ground (water). The scene adds posts under the deck.
Applied to the editor's preview now and to the game after v0.8.4 (with the zone data converted: editor/migrate_piers.py)."""
import os, sys
H = sys.argv[1] if len(sys.argv) > 1 else '/home/you/ashvale3d'
def edit(p, a, b):
    p = os.path.join(H, p); s = open(p).read()
    if b in s: return
    assert s.count(a) == 1, (p, a[:90], s.count(a)); open(p, 'w').write(s.replace(a, b))
STAMP = ("const decks = (z) => { const L = (z.objects || []).filter(o => o.k === 'pier' || o.k === 'bridge'); if (!L.length) return z.tiles;   /* piers and bridges are assets: their decks are laid here (the operator) */\n"
         "  const ox = z.origin[0], oy = z.origin[1], T = z.tiles.map(r => r.split(''));\n"
         "  for (const o of L) for (let y = o.y; y < o.y + (o.h || 1); y++) for (let x = o.x; x < o.x + (o.w || 1); x++) { const r = T[y - oy]; if (r && x - ox >= 0 && x - ox < r.length) r[x - ox] = 'B'; }\n"
         "  return T.map(r => r.join('')); };")
edit('src/worldgen.js', "      function piecesFromZones(zones, face, gx, gy, popts) {", "      " + STAMP.replace("\n", "\n      ") + "\n      function piecesFromZones(zones, face, gx, gy, popts) {")
edit('src/worldgen.js', "return { id: z.id, face, x: gx + ox, y: gy + oy, w, h, tiles: z.tiles, objects: objs,", "return { id: z.id, face, x: gx + ox, y: gy + oy, w, h, tiles: decks(z), objects: objs,")
edit('src/world.js', "    for (const z of D.zones) {\n      pieces.push({ id: z.id, x0: z.origin[0], y0: z.origin[1], x1: z.origin[0] + z.size[0], y1: z.origin[1] + z.size[1], tiles: z.tiles });",
     "    " + STAMP.replace("\n", "\n    ") + "\n    for (const z of D.zones) {\n      pieces.push({ id: z.id, x0: z.origin[0], y0: z.origin[1], x1: z.origin[0] + z.size[0], y1: z.origin[1] + z.size[1], tiles: decks(z) });")
edit('src/scene.js', "          case 'house': case 'shop': case 'smithy': building(o); break;",
     "          case 'house': case 'shop': case 'smithy': building(o); break;\n"
     "          case 'pier': case 'bridge': {   /* the asset's posts: every 2 m along both long edges, down into the water (the deck is its B tiles) */\n"
     "            const w = o.w || 1, d = o.h || 1, along = w >= d;\n"
     "            for (let t = 0; t <= (along ? w : d); t += 2) for (const side of [0, 1]) { const px = along ? o.x + Math.min(t, w - 0.15) + 0.08 : o.x + side * (w - 0.16) + 0.08, pz = along ? o.y + side * (d - 0.16) + 0.08 : o.y + Math.min(t, d - 0.15) + 0.08, py = heightAt(px, pz);\n"
     "              B.add('box', 0x5a3c22, px, py - 0.88, pz, 0.16, 1.6, 0.16); }\n"
     "            break;\n"
     "          }")
print('pier assets patch applied to', H)
