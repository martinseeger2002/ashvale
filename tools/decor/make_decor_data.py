#!/usr/bin/env python3
"""make_decor_data.py -> data/decor.json: reusable scenery for any terrain (2026-10-18, the operator: "spend some time building scenery and
decorative assets that can be reusable in different terrains").

Each kind is a list of primitive parts the scene batches ([shape, colour, x, y, z, sx, sy, sz, ry, rx, rz]; metres, y up from the ground,
x/y/z the part's centre; shapes box, cyl, cyl6, cyl12, cone, pyr, rock, stone, and glow = a small light, sx its radius). Colours are
palette names, so one kind fits every terrain: the placement gives a palette (temperate, forest, snow, desert, swamp), and a palette with
snow also lays the kind's "snow" parts (caps on its top surfaces). Kinds are placed like any object ({k, x, y, ry, pal, s}) - in a zone
or out in the world (wg_tables decor, src/wg_paths.js; tools/decor/place_trail_decor.js lays the way down from the mountain).

The names and examine lines were drafted by the local Qwen model (tools/decor/qwen_decor.py, Qwen3.5-9B) and edited; so were first
drafts of the shapes, which were mostly rebuilt here by hand - the model kept sinking parts into the ground (a part's y is its centre),
laid fence rails across their posts and stacked small boxes where a roof was wanted.
    python3 tools/decor/make_decor_data.py      (then python3 build.py)
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SNOW = "#f4f6f8"
PALETTES = {
    "temperate": {"stone": "#8e8a80", "darkstone": "#6a665e", "wood": "#7a5530", "darkwood": "#4e3420", "cloth": "#a83a2a", "cloth2": "#3f5d8a", "cloth3": "#c8a040",
                  "metal": "#3a3c42", "leaf": "#4a7a34", "moss": "#5a7a34", "accent": "#c8a040", "paper": "#e8e0c8"},
    "forest":    {"stone": "#6e7068", "darkstone": "#4e5048", "wood": "#5a3e24", "darkwood": "#3a2818", "cloth": "#7a3a2a", "cloth2": "#2e4a3a", "cloth3": "#9a8a3a",
                  "metal": "#34363a", "leaf": "#2e5a26", "moss": "#3e6a2a", "accent": "#9a8a3a", "paper": "#d8d0b8"},
    "snow":      {"stone": "#9aa0a8", "darkstone": "#6e7480", "wood": "#6a5038", "darkwood": "#3e3026", "cloth": "#8a2a3a", "cloth2": "#2c3488", "cloth3": "#e0c060",
                  "metal": "#3a3c42", "leaf": "#3a5a40", "moss": "#8a968a", "accent": "#c8ccd8", "paper": "#eef0f2", "snow": True},
    "desert":    {"stone": "#c8a878", "darkstone": "#9a7a50", "wood": "#8a6a40", "darkwood": "#5a4028", "cloth": "#c86a2a", "cloth2": "#2a7a8a", "cloth3": "#e8d0a0",
                  "metal": "#4a4038", "leaf": "#7a8a3a", "moss": "#9a8a4a", "accent": "#d8b040", "paper": "#f0e0b8"},
    "swamp":     {"stone": "#5e6a5a", "darkstone": "#3e4a3e", "wood": "#4a3a26", "darkwood": "#2e2418", "cloth": "#5a4a3a", "cloth2": "#3a4a3a", "cloth3": "#7a7a4a",
                  "metal": "#2e3230", "leaf": "#3a5a2a", "moss": "#4a6a2a", "accent": "#8a9a5a", "paper": "#b8b8a0"},
}
K = {}
K["milestone"] = {"name": "Milestone", "examine": "Someone carved the distance to the castle into it, then the weather carved most of it back out.",
    "parts": [["box", "darkstone", 0, 0.06, 0, 0.6, 0.12, 0.45], ["box", "stone", 0, 0.52, 0, 0.42, 0.8, 0.26], ["cyl", "stone", 0, 0.92, 0, 0.42, 0.16, 0.26],
              ["box", "accent", 0, 0.66, 0.135, 0.3, 0.06, 0.01], ["box", "accent", 0, 0.52, 0.135, 0.2, 0.05, 0.01], ["box", "moss", 0.12, 0.16, 0.14, 0.18, 0.08, 0.04]],
    "snow": [["cyl", SNOW, 0, 1.02, 0, 0.44, 0.05, 0.28]]}
K["lantern_post"] = {"name": "Stone lantern", "examine": "A lamp for travellers, lit by nobody you have ever seen.",
    "parts": [["box", "darkstone", 0, 0.08, 0, 0.5, 0.16, 0.5], ["cyl", "stone", 0, 0.56, 0, 0.18, 0.8, 0.18], ["box", "stone", 0, 1.01, 0, 0.42, 0.1, 0.42],
              ["box", "darkstone", 0, 1.21, 0, 0.32, 0.3, 0.32], ["glow", "#ffd27a", 0, 1.21, 0.0, 0.1], ["pyr", "stone", 0, 1.49, 0, 0.56, 0.26, 0.56, 0.785]],
    "snow": [["pyr", SNOW, 0, 1.55, 0, 0.44, 0.16, 0.44, 0.785]]}
K["wayshrine"] = {"name": "Wayside shrine", "examine": "A humble plea to the gods, mostly ignored by the local wildlife.",
    "parts": [["box", "darkstone", 0, 0.1, 0, 0.8, 0.2, 0.8], ["box", "stone", 0, 0.3, 0, 0.6, 0.2, 0.6], ["box", "wood", 0, 0.85, 0, 0.14, 0.9, 0.14],
              ["box", "darkwood", 0, 1.32, 0, 0.62, 0.06, 0.46], ["box", "wood", -0.28, 1.6, 0, 0.06, 0.5, 0.42], ["box", "wood", 0.28, 1.6, 0, 0.06, 0.5, 0.42],
              ["box", "wood", 0, 1.6, -0.19, 0.56, 0.5, 0.04], ["box", "stone", 0, 1.53, 0, 0.14, 0.36, 0.12], ["cyl", "stone", 0, 1.76, 0, 0.12, 0.1, 0.12],
              ["box", "darkwood", -0.18, 1.95, 0, 0.44, 0.05, 0.6, 0, 0, 0.6], ["box", "darkwood", 0.18, 1.95, 0, 0.44, 0.05, 0.6, 0, 0, -0.6],
              ["cyl", "paper", 0.12, 1.4, 0.12, 0.05, 0.1, 0.05], ["glow", "#ffd27a", 0.12, 1.48, 0.12, 0.035], ["box", "cloth", 0, 1.1, 0.075, 0.12, 0.3, 0.01]],
    "snow": [["box", SNOW, -0.2, 2.0, 0, 0.38, 0.04, 0.6, 0, 0, 0.6], ["box", SNOW, 0.2, 2.0, 0, 0.38, 0.04, 0.6, 0, 0, -0.6], ["box", SNOW, 0, 0.42, 0, 0.56, 0.04, 0.56]]}
K["stone_bench"] = {"name": "Stone bench", "examine": "Hard enough to teach a cat to sit still, soft enough to ruin your knees.",
    "parts": [["box", "darkstone", -0.6, 0.2, 0, 0.3, 0.4, 0.42], ["box", "darkstone", 0.6, 0.2, 0, 0.3, 0.4, 0.42], ["box", "stone", 0, 0.46, 0, 1.6, 0.12, 0.5],
              ["box", "moss", -0.62, 0.05, 0.22, 0.24, 0.1, 0.06], ["rock", "stone", 0.95, 0.12, 0.25, 0.3, 0.24, 0.26]],
    "snow": [["box", SNOW, 0, 0.53, 0, 1.56, 0.03, 0.46]]}
K["fallen_log"] = {"name": "Fallen log", "examine": "It fell with a thud nobody heard, and has been lying about it ever since.",
    "parts": [["cyl", "wood", 0, 0.22, 0, 0.44, 2.8, 0.44, 0, 0, 1.5708], ["cyl12", "darkwood", 1.42, 0.22, 0, 0.4, 0.04, 0.4, 0, 0, 1.5708],
              ["cyl", "wood", -1.75, 0.3, 0.05, 0.56, 0.6, 0.56], ["cyl12", "paper", -1.75, 0.61, 0.05, 0.46, 0.03, 0.46],
              ["box", "darkwood", 0.4, 0.42, 0.18, 0.06, 0.5, 0.06, 0, 0.6, 0], ["box", "darkwood", -0.5, 0.4, -0.2, 0.06, 0.4, 0.06, 0, -0.7, 0],
              ["box", "moss", 0.1, 0.44, 0, 0.9, 0.04, 0.3], ["box", "moss", -1.75, 0.63, 0.05, 0.3, 0.03, 0.3]],
    "snow": [["box", SNOW, -0.2, 0.46, 0, 2.2, 0.05, 0.3]]}
K["boulders"] = {"name": "Boulders", "examine": "A pile of stones that argues about which one is the biggest, mostly just to be heard.",
    "parts": [["rock", "stone", 0, 0.45, 0, 1.3, 0.9, 1.1], ["rock", "darkstone", 0.75, 0.32, 0.4, 0.9, 0.64, 0.8], ["rock", "stone", -0.6, 0.26, -0.35, 0.7, 0.52, 0.66],
              ["rock", "darkstone", 0.2, 0.14, -0.7, 0.4, 0.28, 0.38], ["box", "moss", -0.1, 0.86, 0.1, 0.5, 0.06, 0.4], ["box", "moss", 0.7, 0.62, 0.45, 0.3, 0.05, 0.3]],
    "snow": [["box", SNOW, -0.05, 0.9, 0, 0.7, 0.06, 0.6], ["box", SNOW, 0.75, 0.65, 0.4, 0.45, 0.05, 0.4]]}
K["prayer_flags"] = {"name": "Prayer flags", "examine": "Every flag is a wish. The wind reads them all, and answers none of them out loud.",
    "parts": [["box", "darkwood", -1.25, 1.2, 0, 0.08, 2.4, 0.08], ["box", "darkwood", 1.25, 1.2, 0, 0.08, 2.4, 0.08], ["rock", "stone", -1.25, 0.1, 0, 0.3, 0.2, 0.3],
              ["rock", "stone", 1.25, 0.1, 0, 0.3, 0.2, 0.3], ["box", "darkwood", 0, 2.25, 0, 2.5, 0.02, 0.02]]
             + [["box", ["cloth", "cloth2", "cloth3", "paper", "leaf"][i % 5], -1.0 + i * 0.25, 2.06 - 0.06 * (1 - ((i - 4) / 4.5) ** 2), 0, 0.18, 0.24, 0.015] for i in range(9)],
    "snow": [["box", SNOW, -1.25, 2.42, 0, 0.1, 0.04, 0.1], ["box", SNOW, 1.25, 2.42, 0, 0.1, 0.04, 0.1]]}
K["broken_cart"] = {"name": "Broken cart", "examine": "A vehicle for heavy loads, currently carrying a heavy load of regret.",
    "parts": [["box", "wood", 0, 0.62, 0, 0.08, 1.1, 1.8, 0, 0, 0.18], ["box", "wood", 0.42, 0.3, 0, 0.9, 0.08, 1.8, 0, 0, 0.18], ["box", "darkwood", 0.42, 0.62, 0.88, 0.9, 0.5, 0.06, 0, 0, 0.18],
              ["box", "darkwood", 0.42, 0.62, -0.88, 0.9, 0.5, 0.06, 0, 0, 0.18], ["cyl12", "darkwood", -0.1, 0.55, 0.2, 1.0, 0.08, 1.0, 0, 0, 1.4], ["cyl", "metal", -0.15, 0.55, 0.2, 0.16, 0.12, 0.16, 0, 0, 1.4],
              ["cyl12", "darkwood", 1.3, 0.05, -0.6, 1.0, 0.08, 1.0], ["cyl", "metal", 1.3, 0.1, -0.6, 0.16, 0.12, 0.16], ["box", "wood", 0.9, 0.12, 1.25, 0.08, 0.08, 1.6, 0.4, 0, 0],
              ["box", "cloth3", 0.6, 0.45, 0.2, 0.36, 0.3, 0.3, 0.3], ["box", "cloth3", 0.75, 0.32, -0.3, 0.3, 0.24, 0.26, -0.2]],
    "snow": [["box", SNOW, 0.46, 0.38, 0, 0.8, 0.04, 1.6, 0, 0, 0.18]]}
K["ruin_pillar"] = {"name": "Broken pillar", "examine": "A testament to the builders of the past, and to the gravity of the present.",
    "parts": [["box", "darkstone", 0, 0.15, 0, 0.9, 0.3, 0.9], ["cyl12", "stone", 0, 0.38, 0, 0.7, 0.16, 0.7], ["cyl12", "stone", 0, 0.98, 0, 0.56, 1.1, 0.56],
              ["cone", "stone", 0.05, 1.6, 0.02, 0.5, 0.18, 0.5, 0.4], ["cyl12", "stone", 0.95, 0.27, 0.35, 0.54, 0.6, 0.54, 0.6, 0, 1.5708],
              ["cyl12", "darkstone", -0.6, 0.25, 0.75, 0.5, 0.5, 0.5, -0.4, 0, 1.5708], ["box", "moss", 0, 0.32, 0.46, 0.5, 0.06, 0.04], ["box", "moss", 0.2, 0.7, 0.28, 0.16, 0.3, 0.02]],
    "snow": [["cyl12", SNOW, 0, 1.55, 0, 0.5, 0.05, 0.5], ["box", SNOW, 0.95, 0.58, 0.35, 0.5, 0.04, 0.4, 0.6]]}
K["stump_axe"] = {"name": "Chopping stump", "examine": "The axe is stuck fast. So, you suspect, was the last person who tried to pull it out.",
    "parts": [["cyl12", "wood", 0, 0.3, 0, 0.8, 0.6, 0.8], ["cyl12", "paper", 0, 0.61, 0, 0.72, 0.02, 0.72], ["box", "darkwood", 0.38, 0.06, 0.1, 0.24, 0.12, 0.2, 0.5],
              ["box", "metal", 0.05, 0.66, 0, 0.28, 0.12, 0.03], ["box", "darkwood", 0.08, 0.95, 0, 0.05, 0.6, 0.05, 0, 0, -0.35],
              ["box", "wood", 0.9, 0.1, -0.2, 0.2, 0.2, 0.6], ["box", "wood", 0.9, 0.1, 0.2, 0.2, 0.2, 0.6], ["box", "wood", 0.9, 0.3, 0, 0.2, 0.2, 0.6], ["box", "paper", 1.0, 0.3, 0, 0.02, 0.18, 0.58]],
    "snow": [["cyl12", SNOW, -0.1, 0.63, 0, 0.5, 0.03, 0.6], ["box", SNOW, 0.9, 0.42, 0, 0.2, 0.04, 0.56]]}
K["supply_cache"] = {"name": "Supply cache", "examine": "The tarp is held up by hope and a stubborn post; the barrels by something stronger.",
    "parts": [["cyl12", "wood", -0.45, 0.4, 0.15, 0.56, 0.8, 0.56], ["cyl12", "darkwood", -0.45, 0.62, 0.15, 0.6, 0.05, 0.6], ["cyl12", "darkwood", -0.45, 0.2, 0.15, 0.6, 0.05, 0.6],
              ["cyl12", "wood", 0.15, 0.36, 0.3, 0.5, 0.72, 0.5], ["cyl12", "darkwood", 0.15, 0.55, 0.3, 0.54, 0.05, 0.54], ["box", "wood", 0.25, 0.25, -0.35, 0.6, 0.5, 0.5, 0.2],
              ["box", "darkwood", 0.25, 0.25, -0.35, 0.62, 0.06, 0.52, 0.2], ["box", "darkwood", 0.85, 0.75, 0, 0.08, 1.5, 0.08],
              ["box", "cloth2", 0.15, 1.12, 0, 1.6, 0.03, 1.5, 0, 0, -0.35], ["box", "darkwood", 0.84, 1.5, 0, 0.12, 0.08, 0.12]],
    "snow": [["box", SNOW, 0.1, 1.16, 0, 1.4, 0.04, 1.4, 0, 0, -0.35]]}
K["standing_stone"] = {"name": "Standing stone", "examine": "It stands so tall it must be dreaming of the sky; its rune hums when nobody is listening.",
    "parts": [["box", "stone", 0, 1.15, 0, 0.62, 2.3, 0.36, 0, 0, 0.05], ["pyr", "stone", 0.06, 2.42, 0, 0.6, 0.3, 0.34, 0.785], ["glow", "#8fd0f0", 0.06, 1.5, 0.19, 0.07],
              ["box", "#5aa0c8", 0.06, 1.5, 0.182, 0.18, 0.3, 0.01], ["rock", "darkstone", 0.6, 0.15, 0.3, 0.4, 0.3, 0.36], ["rock", "darkstone", -0.55, 0.12, -0.25, 0.34, 0.24, 0.3],
              ["rock", "stone", 0.2, 0.1, -0.5, 0.3, 0.2, 0.28], ["box", "moss", -0.1, 0.25, 0.19, 0.3, 0.2, 0.02]],
    "snow": [["pyr", SNOW, 0.06, 2.48, 0, 0.5, 0.18, 0.3, 0.785]]}
K["dead_tree"] = {"name": "Dead tree", "examine": "A crooked finger pointing at the sky, waiting for a bird that will never come.",
    "parts": [["cyl", "darkwood", 0, 0.9, 0, 0.34, 1.8, 0.34], ["cyl", "darkwood", 0.05, 2.3, 0, 0.24, 1.1, 0.24, 0, 0, -0.12], ["cyl", "darkwood", 0, 0.12, 0, 0.6, 0.24, 0.6],
              ["cyl", "darkwood", 0.42, 2.0, 0.05, 0.1, 1.0, 0.1, 0, 0, -0.75], ["cyl", "darkwood", -0.4, 1.7, -0.05, 0.1, 0.9, 0.1, 0, 0, 0.8],
              ["cyl", "darkwood", 0.1, 2.75, 0.3, 0.07, 0.7, 0.07, 0, 0.7, 0], ["cyl", "darkwood", -0.2, 2.6, -0.28, 0.07, 0.6, 0.07, 0, -0.7, 0.3]],
    "snow": [["box", SNOW, 0.62, 2.38, 0.05, 0.3, 0.03, 0.08, 0, 0, -0.75], ["box", SNOW, -0.58, 2.05, -0.05, 0.28, 0.03, 0.08, 0, 0, 0.8]]}
K["rail_fence"] = {"name": "Rail fence", "examine": "Three posts hold up two rails, one of which has given up on gravity and decided to nap.",
    "parts": [["box", "darkwood", -1.4, 0.55, 0, 0.14, 1.1, 0.14], ["box", "darkwood", 0, 0.55, 0, 0.14, 1.1, 0.14], ["box", "darkwood", 1.4, 0.55, 0, 0.14, 1.1, 0.14],
              ["box", "wood", 0, 0.9, 0.09, 2.9, 0.09, 0.06], ["box", "wood", -0.7, 0.4, 0.09, 1.45, 0.09, 0.06], ["box", "wood", 0.72, 0.28, 0.09, 1.5, 0.09, 0.06, 0, 0, 0.3]],
    "snow": [["box", SNOW, 0, 0.96, 0.09, 2.9, 0.03, 0.08]]}
# what stands in the way (src/world.js decorBlock, 2026-10-18: "make solid decor block movement without blocking roads"): "tile" blocks the
# piece's own tile, "line" is a run of edge walls len metres long along the piece's turn (a fence section); none (prayer flags) you walk
# under. Never on a path tile: world.js leaves any tile or edge by a path open.
for k in ("milestone", "lantern_post", "wayshrine", "stone_bench", "fallen_log", "boulders", "broken_cart", "ruin_pillar", "stump_axe",
          "supply_cache", "standing_stone", "dead_tree"):
    K[k]["block"] = "tile"
K["rail_fence"]["block"] = "line"; K["rail_fence"]["len"] = 2.9
DECOR = {"ashvale3d": "module", "name": "decor", "api": 1, "v": 1,
         "data": {"note": "reusable scenery (tools/decor/make_decor_data.py): parts [shape, colour, x, y, z, sx, sy, sz, ry, rx, rz], colours from a palette; a snowy palette adds the kind's snow parts",
                  "palettes": PALETTES, "kinds": K}}
if __name__ == '__main__':
    json.dump(DECOR, open(os.path.join(ROOT, 'data', 'decor.json'), 'w'), separators=(',', ':'))
    print('decor: %d kinds, %d palettes, %d parts' % (len(K), len(PALETTES), sum(len(k['parts']) + len(k.get('snow', [])) for k in K.values())))
