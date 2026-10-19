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
import json, math, os
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
    "harbour":   {"stone": "#7a7c78", "darkstone": "#585a58", "wood": "#7a6a58", "darkwood": "#4a3e34", "cloth": "#8a3a30", "cloth2": "#3a4a5a", "cloth3": "#a08a4a",
                  "metal": "#3a3c40", "leaf": "#4a6a3a", "moss": "#5a6a3a", "accent": "#b08a3a", "paper": "#d8d0b8"},   # Saltmere: salt-bleached wood, soot, faded cloth
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
# THE LAKE CASTLE'S CEMETERY (2026-10-18, the operator: "a quaint cemetery at -90, 533 with flowers and a metal fence around it, entrance towards
# the path"; laid by tools/decor/place_cemetery.js). Names and examine lines drafted by the local Qwen model (Qwen3.5-9B) and edited; the shapes
# made here. A grave's headstone stands at the back of its tile (-z) with its mound in front (+z); the railing is 1 m sections, a post at -x.
MOUND = [["rock", "moss", 0, 0.06, 0.3, 0.6, 0.14, 1.0]]
K["gravestone"] = {"name": "Gravestone", "examine": "A rounded stone over a tidy mound, topped with flowers and mild regret.",
    "parts": [["box", "darkstone", 0, 0.06, -0.35, 0.7, 0.12, 0.22], ["box", "stone", 0, 0.48, -0.35, 0.56, 0.74, 0.12], ["cyl12", "stone", 0, 0.85, -0.35, 0.56, 0.12, 0.56, 0, 1.5708, 0],
              ["box", "accent", 0, 0.66, -0.285, 0.3, 0.05, 0.01], ["box", "accent", 0, 0.56, -0.285, 0.22, 0.04, 0.01]] + MOUND
             + [["box", "leaf", -0.12, 0.17, 0.15, 0.02, 0.12, 0.02], ["box", "cloth", -0.12, 0.25, 0.15, 0.09, 0.08, 0.09], ["box", "leaf", 0.1, 0.17, 0.38, 0.02, 0.12, 0.02],
                ["box", "cloth3", 0.1, 0.25, 0.38, 0.09, 0.08, 0.09], ["box", "paper", 0.02, 0.18, 0.6, 0.08, 0.07, 0.08]],
    "snow": [["box", SNOW, 0, 1.12, -0.35, 0.3, 0.03, 0.13], ["box", SNOW, 0, 0.14, 0.3, 0.5, 0.03, 0.85]]}
K["grave_cross"] = {"name": "Grave cross", "examine": "A weathered stone cross, standing up straighter than anyone buried here.",
    "parts": [["box", "darkstone", 0, 0.08, -0.35, 0.5, 0.16, 0.3], ["box", "stone", 0, 0.7, -0.35, 0.14, 1.1, 0.12], ["box", "stone", 0, 0.95, -0.35, 0.56, 0.13, 0.12],
              ["box", "moss", 0.1, 0.19, -0.2, 0.18, 0.05, 0.04]] + MOUND + [["box", "leaf", 0.05, 0.17, 0.3, 0.02, 0.12, 0.02], ["box", "cloth2", 0.05, 0.25, 0.3, 0.09, 0.08, 0.09]],
    "snow": [["box", SNOW, 0, 1.03, -0.35, 0.52, 0.03, 0.13], ["box", SNOW, 0, 1.26, -0.35, 0.14, 0.03, 0.13], ["box", SNOW, 0, 0.14, 0.3, 0.5, 0.03, 0.85]]}
K["grave_old"] = {"name": "Old grave", "examine": "Moss has won this slab, and whoever lies under it is keeping the name to themselves.",
    "parts": [["box", "darkstone", 0.05, 0.32, -0.3, 0.46, 0.68, 0.12, 0, 0, 0.18], ["box", "moss", 0.0, 0.52, -0.235, 0.3, 0.14, 0.01, 0, 0, 0.18],
              ["box", "moss", 0.1, 0.12, -0.235, 0.3, 0.1, 0.01, 0, 0, 0.18], ["rock", "moss", 0, 0.05, 0.3, 0.6, 0.1, 0.9], ["rock", "stone", 0.32, 0.06, 0.0, 0.2, 0.12, 0.18]],
    "snow": [["box", SNOW, -0.01, 0.67, -0.3, 0.4, 0.03, 0.13, 0, 0, 0.18]]}
FLOWERS = [(-0.28, -0.1, "cloth", 0.26), (-0.1, 0.12, "cloth3", 0.32), (0.08, -0.14, "paper", 0.24), (0.24, 0.06, "cloth2", 0.3), (-0.02, -0.02, "accent", 0.36), (0.3, -0.18, "cloth", 0.22), (-0.24, 0.18, "paper", 0.28)]
K["flower_bed"] = {"name": "Flower bed", "examine": "Wild blooms, tended by someone who visits more often than the residents do.",
    "parts": [["rock", "leaf", 0, 0.05, 0, 0.8, 0.1, 0.55]] + [p for (x, z, c, h) in FLOWERS for p in (["box", "leaf", x, h / 2, z, 0.025, h, 0.025], ["box", c, x, h, z, 0.1, 0.07, 0.1])],
    "snow": []}
K["iron_fence"] = {"name": "Iron railing", "examine": "Spear-tipped bars guard the quiet, or perhaps just keep the sheep out of it.",
    "parts": [["box", "metal", -0.5, 0.6, 0, 0.06, 1.2, 0.06], ["pyr", "metal", -0.5, 1.26, 0, 0.09, 0.12, 0.09, 0.785], ["box", "metal", 0, 1.0, 0, 1.0, 0.04, 0.03], ["box", "metal", 0, 0.2, 0, 1.0, 0.04, 0.03]]
             + [p for x in (-0.3, -0.1, 0.1, 0.3) for p in (["box", "metal", x, 0.57, 0, 0.022, 1.02, 0.022], ["pyr", "metal", x, 1.12, 0, 0.05, 0.09, 0.05, 0.785])],
    "snow": [["box", SNOW, 0, 1.03, 0, 1.0, 0.02, 0.04]]}
PIER = lambda x, h: [["box", "darkstone", x, 0.08, 0, 0.36, 0.16, 0.36], ["box", "stone", x, h / 2, 0, 0.28, h - 0.1, 0.28], ["box", "darkstone", x, h - 0.02, 0, 0.34, 0.06, 0.34], ["cyl12", "metal", x, h + 0.09, 0, 0.18, 0.18, 0.18]]
K["iron_post"] = {"name": "Stone pier", "examine": "A sturdy stone pier wearing an iron ball like a very small, very heavy hat.",
    "parts": PIER(0, 1.36), "snow": [["box", SNOW, 0, 1.38, 0, 0.32, 0.03, 0.32]]}
def leaf(hx, sign, ang=1.2):   # a gate leaf 0.9 m wide hinged at x = hx, swung `ang` radians in (towards +z)
    dx, dz, r = sign * math.cos(ang), math.sin(ang), -ang if sign > 0 else math.pi + ang
    at = lambda s, y, sx, sy, sz: ["box", "metal", round(hx + dx * s, 3), y, round(dz * s, 3), sx, sy, sz, round(r, 3)]
    return [at(0.45, 1.25, 0.9, 0.04, 0.03), at(0.45, 0.2, 0.9, 0.04, 0.03), at(0.88, 0.72, 0.04, 1.1, 0.03)] + [at(s, 0.72, 0.022, 1.06, 0.022) for s in (0.18, 0.36, 0.54, 0.72)]
K["iron_gate"] = {"name": "Iron gate", "examine": "The double gates stand open, inviting the curious, the grieving and the lost.",
    "parts": PIER(-1.0, 1.9) + PIER(1.0, 1.9) + leaf(-0.86, 1) + leaf(0.86, -1)
             + [["box", "metal", 0, 1.96, 0, 1.72, 0.04, 0.03], ["box", "metal", -0.45, 2.1, 0, 0.82, 0.04, 0.03, 0, 0, 0.32], ["box", "metal", 0.45, 2.1, 0, 0.82, 0.04, 0.03, 0, 0, -0.32],
                ["box", "metal", 0, 2.2, 0, 0.04, 0.3, 0.03], ["box", "metal", 0, 2.28, 0, 0.18, 0.04, 0.03]],
    "snow": [["box", SNOW, -1.0, 1.92, 0, 0.32, 0.03, 0.32], ["box", SNOW, 1.0, 1.92, 0, 0.32, 0.03, 0.32]]}
# SALTMERE, RUN DOWN (2026-10-19, the operator: "the empty streets of saltmere need to have cobble stones and decor - work with qwen again - make it
# kind of ghetto and rugged ... make one end of the piers or board walk occupied by pirates"; laid by tools/saltmere/make_rugged.py). Names and
# examine lines drafted by the local Qwen model (Qwen3.5-9B) and edited; the shapes made here. The palette 'harbour' greys any kind down.
FIRE = [["cone", "#e8742a", 0, 1.0, 0, 0.36, 0.34, 0.36], ["cone", "#ffd27a", 0.05, 0.98, 0.02, 0.2, 0.24, 0.2], ["glow", "#ffb050", 0, 1.05, 0, 0.12]]
K["trash_heap"] = {"name": "Scrap heap", "examine": "It smells of old fish and despair, in roughly equal measure.",
    "parts": [["rock", "darkwood", 0, 0.12, 0, 0.9, 0.24, 0.7], ["box", "wood", -0.2, 0.28, 0.05, 0.5, 0.06, 0.18, 0.5, 0, 0.4], ["box", "darkwood", 0.25, 0.24, -0.15, 0.3, 0.3, 0.3, 0.6, 0.2, 0.1],
              ["box", "cloth", 0.05, 0.3, 0.2, 0.3, 0.05, 0.25, 0.3], ["box", "cloth2", -0.3, 0.18, -0.2, 0.25, 0.04, 0.2, 1.2], ["cyl", "#3a5a3a", 0.38, 0.06, 0.25, 0.07, 0.22, 0.07, 0, 1.4, 0],
              ["box", "paper", -0.05, 0.27, -0.25, 0.22, 0.02, 0.04, 0.4], ["box", "paper", -0.05, 0.27, -0.25, 0.02, 0.02, 0.12, 0.4]],
    "snow": [["box", SNOW, 0, 0.26, 0, 0.7, 0.03, 0.5]]}
K["burn_barrel"] = {"name": "Burning barrel", "examine": "A small fire in a big barrel: the warmest thing in Saltmere, the people included.",
    "parts": [["cyl12", "metal", 0, 0.42, 0, 0.56, 0.84, 0.56], ["cyl12", "#5a3a2a", 0, 0.2, 0, 0.58, 0.06, 0.58], ["cyl12", "#5a3a2a", 0, 0.66, 0, 0.58, 0.06, 0.58],
              ["cyl12", "darkwood", 0, 0.85, 0, 0.46, 0.04, 0.46], ["box", "wood", 0.12, 0.92, 0, 0.4, 0.05, 0.06, 0.4, 0, 0.5]] + FIRE, "snow": []}
K["laundry_line"] = {"name": "Washing line", "examine": "Shirts flapping in the salt wind, never quite dry and never quite clean.",
    "parts": [["box", "darkwood", -1.25, 1.0, 0, 0.08, 2.0, 0.08], ["box", "darkwood", 1.25, 1.0, 0, 0.08, 2.0, 0.08], ["rock", "stone", -1.25, 0.08, 0, 0.28, 0.16, 0.28], ["rock", "stone", 1.25, 0.08, 0, 0.28, 0.16, 0.28],
              ["box", "#d8d0c0", 0, 1.86, 0, 2.5, 0.015, 0.015], ["box", "cloth", -0.75, 1.6, 0, 0.42, 0.5, 0.02], ["box", "paper", -0.2, 1.66, 0, 0.34, 0.38, 0.02, 0, 0, 0.04],
              ["box", "cloth2", 0.3, 1.52, 0, 0.36, 0.64, 0.02], ["box", "cloth3", 0.82, 1.66, 0, 0.26, 0.36, 0.02, 0, 0, -0.06]],
    "snow": [["box", SNOW, -1.25, 2.02, 0, 0.1, 0.03, 0.1], ["box", SNOW, 1.25, 2.02, 0, 0.1, 0.03, 0.1]]}
K["rope_coil"] = {"name": "Tarred rope", "examine": "It smells of tar, and of every knot anybody ever got wrong.",
    "parts": [["cyl12", "#8a6a3a", 0, 0.04, 0, 0.6, 0.08, 0.6], ["cyl12", "#7a5a30", 0, 0.11, 0, 0.5, 0.07, 0.5], ["cyl12", "#8a6a3a", 0, 0.17, 0, 0.38, 0.06, 0.38],
              ["cyl12", "darkwood", 0, 0.2, 0, 0.16, 0.02, 0.16], ["box", "#8a6a3a", 0.36, 0.03, 0.1, 0.35, 0.04, 0.04, 0.6]], "snow": [["cyl12", SNOW, 0, 0.21, 0, 0.36, 0.02, 0.36]]}
K["fish_rack"] = {"name": "Drying rack", "examine": "Fish hang stiffly in the wind, hoping not to catch a cold.",
    "parts": [["box", "darkwood", -0.7, 0.6, 0, 0.08, 1.2, 0.08], ["box", "darkwood", 0.7, 0.6, 0, 0.08, 1.2, 0.08], ["box", "wood", 0, 1.15, 0, 1.5, 0.05, 0.05], ["box", "wood", 0, 0.82, 0, 1.5, 0.04, 0.04]]
             + [p for i, x in enumerate((-0.5, -0.25, 0, 0.25, 0.5)) for p in (["box", "#9aa6aa", x, 1.0, 0, 0.07, 0.24, 0.03], ["box", "#7a868a", x, 0.86, 0, 0.12, 0.04, 0.02], ["box", "#9aa6aa", x + 0.12, 0.68, 0, 0.06, 0.2, 0.03])],
    "snow": [["box", SNOW, 0, 1.18, 0, 1.5, 0.02, 0.06]]}
POT = lambda x, y, z: [["cyl12", "wood", x, y, z, 0.45, 0.4, 0.45], ["cyl12", "darkwood", x, y - 0.12, z, 0.47, 0.04, 0.47], ["cyl12", "darkwood", x, y + 0.12, z, 0.47, 0.04, 0.47], ["cyl12", DARK if False else "#2a2420", x, y, z + 0.2, 0.16, 0.16, 0.04, 0, 1.5708, 0]]
K["lobster_pots"] = {"name": "Lobster pots", "examine": "Empty traps, waiting for lobsters that have heard all about them.",
    "parts": POT(-0.25, 0.2, 0) + POT(0.25, 0.2, 0.05) + POT(0, 0.6, 0.02) + [["cyl12", "accent", 0.45, 0.06, 0.3, 0.12, 0.1, 0.12]], "snow": [["cyl12", SNOW, 0, 0.81, 0.02, 0.4, 0.03, 0.4]]}
K["net_pile"] = {"name": "Net heap", "examine": "A heap of net, a few cork floats and a great many chances to trip.",
    "parts": [["rock", "#4a5248", 0, 0.1, 0, 1.0, 0.2, 0.8], ["rock", "#3a423a", 0.2, 0.18, -0.1, 0.6, 0.16, 0.5], ["cyl12", "accent", -0.3, 0.18, 0.2, 0.1, 0.08, 0.1],
              ["cyl12", "cloth", 0.25, 0.24, 0.15, 0.1, 0.08, 0.1], ["cyl12", "accent", 0.0, 0.26, -0.25, 0.1, 0.08, 0.1], ["box", "#8a6a3a", -0.45, 0.05, -0.2, 0.4, 0.03, 0.03, 0.3]],
    "snow": [["box", SNOW, 0, 0.21, 0, 0.7, 0.03, 0.5]]}
K["upturned_boat"] = {"name": "Old rowboat", "examine": "Its last voyage ended in an argument with a rock. The rock won.",
    "parts": [["box", "wood", 0, 0.3, 0, 2.6, 0.5, 1.0], ["box", "wood", 1.4, 0.28, 0, 0.6, 0.46, 0.7], ["box", "darkwood", 0.1, 0.57, 0, 3.0, 0.06, 0.08],
              ["box", "darkwood", 0, 0.42, 0.505, 2.6, 0.04, 0.01], ["box", "darkwood", 0, 0.42, -0.505, 2.6, 0.04, 0.01], ["box", "#2a2420", -0.4, 0.4, 0.507, 0.32, 0.16, 0.012],
              ["box", "wood", 0.3, 0.04, 0.8, 1.6, 0.04, 0.08, 0.3]], "snow": [["box", SNOW, 0, 0.56, 0, 2.6, 0.03, 0.9]]}
K["plank_pile"] = {"name": "Salvaged planks", "examine": "Good for mending a pier, or a coffin, depending how the week goes.",
    "parts": [["box", ("wood", "darkwood")[i % 2], 0, 0.05 + 0.08 * i, (i % 3 - 1) * 0.04, 2.0, 0.07, 0.24, (i * 0.07) - 0.12] for i in range(5)] + [["box", "wood", -0.6, 0.45, 0.3, 1.2, 0.06, 0.22, 0.3, 0, 0.6]],
    "snow": [["box", SNOW, 0, 0.42, 0, 1.9, 0.03, 0.24]]}
K["notice_board"] = {"name": "Wanted board", "examine": "Peeling posters offer rewards for faces nobody here admits to recognising.",
    "parts": [["box", "darkwood", -0.55, 0.8, 0, 0.08, 1.6, 0.08], ["box", "darkwood", 0.55, 0.8, 0, 0.08, 1.6, 0.08], ["box", "wood", 0, 1.2, 0, 1.2, 0.8, 0.05], ["box", "darkwood", 0, 1.66, 0, 1.4, 0.05, 0.3],
              ["box", "paper", -0.3, 1.3, 0.03, 0.3, 0.4, 0.005, 0, 0, 0.05], ["box", "#e0d0a0", 0.08, 1.24, 0.03, 0.28, 0.36, 0.005, 0, 0, -0.08], ["box", "paper", 0.38, 1.34, 0.03, 0.25, 0.3, 0.005],
              ["box", "#2a2420", -0.3, 1.36, 0.035, 0.14, 0.14, 0.003], ["box", "#2a2420", 0.08, 1.3, 0.035, 0.13, 0.13, 0.003], ["box", "cloth", -0.3, 1.18, 0.035, 0.22, 0.04, 0.003], ["box", "cloth", 0.08, 1.12, 0.035, 0.2, 0.04, 0.003]],
    "snow": [["box", SNOW, 0, 1.7, 0, 1.4, 0.03, 0.3]]}
BONES = [["box", "#eeeae0", 0, 0, 0.012, 0.32, 0.04, 0.004, 0, 0, 0.6], ["box", "#eeeae0", 0, 0, 0.012, 0.32, 0.04, 0.004, 0, 0, -0.6]]
def skull(x, y, z, k=1.0, face=1):   # a skull and crossbones on a black field, facing +z (face=1) or -z
    out = [["box", "#eeeae0", x, y + 0.06 * k, z + 0.012 * face, 0.2 * k, 0.18 * k, 0.005], ["box", "#141414", x - 0.05 * k, y + 0.08 * k, z + 0.016 * face, 0.05 * k, 0.05 * k, 0.003], ["box", "#141414", x + 0.05 * k, y + 0.08 * k, z + 0.016 * face, 0.05 * k, 0.05 * k, 0.003]]
    return out + [["box", "#eeeae0", x, y - 0.12 * k, z + 0.012 * face, 0.32 * k, 0.04 * k, 0.004, 0, 0, a] for a in (0.6, -0.6)]
K["pirate_flag"] = {"name": "Black flag", "examine": "A skull on black. It means 'keep your distance', and the gulls never listen.",
    "parts": [["cyl", "darkwood", 0, 1.6, 0, 0.1, 3.2, 0.1], ["rock", "stone", 0, 0.1, 0, 0.4, 0.2, 0.4], ["box", "#141414", 0.47, 2.85, 0, 0.86, 0.56, 0.02]] + skull(0.45, 2.85, 0) + skull(0.45, 2.85, 0, 1.0, -1),
    "snow": []}
WHEEL = lambda x, z: ["cyl12", "wood", x, 0.18, z, 0.36, 0.08, 0.36, 0, 1.5708, 0]
K["cannon"] = {"name": "Ship's cannon", "examine": "Tired from years of barking at the inland sea, and still loaded, by the smell of it.",
    "parts": [["box", "darkwood", 0, 0.24, 0, 1.0, 0.24, 0.6], WHEEL(0.32, 0.34), WHEEL(0.32, -0.34), WHEEL(-0.32, 0.34), WHEEL(-0.32, -0.34),
              ["cyl12", "metal", 0.25, 0.52, 0, 0.26, 1.5, 0.26, 0, 0, 1.5708], ["cyl12", "metal", 1.0, 0.52, 0, 0.32, 0.1, 0.32, 0, 0, 1.5708], ["cyl12", "metal", -0.54, 0.52, 0, 0.14, 0.14, 0.14],
              ["cyl12", "#141414", 1.06, 0.52, 0, 0.16, 0.02, 0.16, 0, 0, 1.5708]], "snow": [["box", SNOW, 0, 0.37, 0, 0.9, 0.02, 0.5]]}
BARREL = lambda x, y, z, lying=False: [["cyl12", "wood", x, y, z, 0.5, 0.7, 0.5] + ([0, 0, 1.5708] if lying else []), ["cyl12", "darkwood", x, y, z, 0.52, 0.06, 0.52] + ([0, 0, 1.5708] if lying else [])]
K["rum_barrels"] = {"name": "Rum barrels", "examine": "They leak a little sweetness, mostly for the benefit of the cats.",
    "parts": BARREL(-0.3, 0.35, 0) + BARREL(0.3, 0.35, 0.05) + [["cyl12", "darkwood", -0.3, 0.12, 0, 0.52, 0.05, 0.52], ["cyl12", "darkwood", 0.3, 0.58, 0.05, 0.52, 0.05, 0.52]]
             + BARREL(0, 0.96, 0, True) + [["box", "metal", 0.37, 0.96, 0, 0.06, 0.06, 0.06], ["box", "accent", 0, 0.96, 0.255, 0.22, 0.12, 0.01]], "snow": [["box", SNOW, 0, 1.22, 0, 0.5, 0.03, 0.3]]}
K["sea_chest"] = {"name": "Sea chest", "examine": "Locked and iron-bound: a fortune in coin, or a pirate's very old socks.",
    "parts": [["box", "darkwood", 0, 0.25, 0, 0.9, 0.5, 0.55], ["cyl12", "wood", 0, 0.5, 0, 0.55, 0.9, 0.55, 0, 0, 1.5708], ["box", "metal", -0.3, 0.38, 0, 0.05, 0.76, 0.58],
              ["box", "metal", 0.3, 0.38, 0, 0.05, 0.76, 0.58], ["box", "accent", 0, 0.42, 0.285, 0.1, 0.12, 0.02]], "snow": [["box", SNOW, 0, 0.78, 0, 0.8, 0.03, 0.3]]}
K["shanty"] = {"name": "Shanty", "examine": "Four walls would be generous. Three, and a curtain.",
    "parts": [["box", "darkwood", 0, 0.9, -0.6, 1.8, 1.8, 0.08], ["box", "wood", -0.88, 0.75, -0.1, 0.06, 1.5, 1.0], ["box", "wood", 0.88, 0.75, -0.1, 0.06, 1.5, 1.0],
              ["box", "metal", 0, 1.72, -0.1, 2.0, 0.05, 1.4, 0, 0.3, 0], ["box", "#6a3a2a", -0.4, 1.74, 0.1, 0.6, 0.06, 0.5, 0, 0.3, 0], ["box", "cloth2", 0.3, 0.7, 0.38, 0.62, 1.3, 0.02],
              ["box", "wood", -0.45, 0.25, 0.25, 0.5, 0.5, 0.5, 0.3], ["box", "darkwood", -0.88, 1.1, 0.42, 0.06, 0.3, 0.12]], "snow": [["box", SNOW, 0, 1.79, -0.1, 1.9, 0.03, 1.3, 0, 0.3, 0]]}
def ship():   # the pirates' ship, moored: bow to +x, beam along z, its waterline 0.6 m under the pier it is tied to (anchored ON the pier: the scene
    # takes a piece's ground where its tile and dx/dz put it, and out over the water that is the sea bed)
    BLK, RED, BONE, SAIL = "#1c1a1e", "#7a2a24", "#e8e4da", "#1e1e22"
    P = [["box", "darkwood", 0, -0.2, 0, 11, 1.8, 3.6], ["box", "darkwood", 0, -1.0, 0, 10, 0.8, 2.6], ["box", "darkwood", 5.9, -0.2, 0.85, 2.3, 1.8, 0.3, 0.75], ["box", "darkwood", 5.9, -0.2, -0.85, 2.3, 1.8, 0.3, -0.75],
         ["cyl", "wood", 7.6, 1.1, 0, 0.14, 3.2, 0.14, 0, 0, -1.2], ["box", "wood", 0.2, 0.62, 0, 10.6, 0.06, 3.3], ["box", "darkwood", -4.6, 1.3, 0, 2.4, 1.4, 3.4], ["box", "wood", -4.6, 2.02, 0, 2.4, 0.05, 3.4],
         ["box", RED, 0, 0.3, 1.805, 11, 0.18, 0.02], ["box", RED, 0, 0.3, -1.805, 11, 0.18, 0.02]]
    for x in (-2.5, -0.5, 1.5, 3.5):
        for z in (1.81, -1.81): P.append(["box", BLK, x, -0.1, z, 0.36, 0.3, 0.02])
    for z in (1.7, -1.7): P.append(["box", "darkwood", 0.6, 0.95, z, 10, 0.08, 0.08])
    for mx, h, w in ((1.5, 7.0, 3.0), (-2.2, 6.0, 2.4)):
        P += [["cyl", "darkwood", mx, 0.6 + h / 2, 0, 0.26 if mx > 0 else 0.22, h, 0.26 if mx > 0 else 0.22], ["cyl", "darkwood", mx, 0.6 + h * 0.86, 0, 0.1, w + 0.4, 0.1, 0, 1.5708, 0],
              ["cyl", "darkwood", mx, 0.6 + h * 0.5, 0, 0.1, w + 0.6, 0.1, 0, 1.5708, 0], ["box", SAIL, mx + 0.06, 0.6 + h * 0.68, 0, 0.04, h * 0.34, w], ["box", SAIL, mx + 0.08, 0.6 + h * 0.36, 0, 0.04, h * 0.28, w + 0.2]]
    P += [["box", BONE, 1.62, 5.4, 0, 0.005, 0.5, 0.56], ["box", BLK, 1.63, 5.48, -0.12, 0.004, 0.12, 0.12], ["box", BLK, 1.63, 5.48, 0.12, 0.004, 0.12, 0.12],
          ["box", BONE, 1.62, 4.95, 0, 0.004, 0.08, 0.9, 0.6, 0, 0], ["box", BONE, 1.62, 4.95, 0, 0.004, 0.08, 0.9, -0.6, 0, 0],
          ["cyl12", "wood", 1.5, 6.4, 0, 0.9, 0.4, 0.9], ["cyl", "darkwood", 1.5, 8.0, 0, 0.06, 1.2, 0.06], ["box", BLK, 1.5, 8.35, 0.45, 0.03, 0.5, 0.8],
          ["glow", "#ffd27a", -5.85, 2.3, 1.2, 0.1], ["glow", "#ffd27a", -5.85, 2.3, -1.2, 0.1], ["box", "darkwood", -5.82, 1.3, 0, 0.06, 1.2, 3.0]]
    return [q[:4] + [round(q[4] + 2.9, 3)] + q[5:] if q[0] != 'glow' else q[:4] + [round(q[4] + 2.9, 3)] + q[5:] for q in P]   # tied alongside: 2.9 m out from its anchor on the pier (+z)
K["pirate_ship"] = {"name": "The Gull's Grudge", "examine": "Black sails, low in the water, and a crew who swear blind it is only a fishing boat.", "parts": ship(), "snow": []}
# THE PIERS (2026-10-19, the operator: "please fix the piers at saltmere as actual decor assets that look and operate nice"): a pier's 'B' tiles
# keep their walking (the deck height is the scene's own), and each is drawn as boards on a cross beam (planks along local z); an edge facing
# the water (+z) adds a stringer, and every other one a pile driven into the bed with a rope rail; bollards and a ladder at the heads. All
# walked over, none examined (nopick). Laid by tools/saltmere/make_rugged.py.
PLANKS = [["box", ("wood", "darkwood", "wood", "#6a5a48")[i], -0.375 + 0.25 * i, -0.015 + 0.006 * (i % 2), 0, 0.235, 0.05, 1.0] for i in range(4)] + [["box", "darkwood", 0, -0.08, 0, 1.0, 0.08, 0.12]]
EDGE = [["box", "darkwood", 0, -0.07, 0.47, 1.02, 0.14, 0.1]]
K["pier_deck"] = {"name": "Pier", "examine": "", "nopick": True, "parts": PLANKS, "snow": [["box", SNOW, 0, 0.015, 0, 0.98, 0.01, 0.98]]}
K["pier_edge"] = {"name": "Pier", "examine": "", "nopick": True, "parts": EDGE, "snow": []}
K["pier_post"] = {"name": "Pier", "examine": "", "nopick": True,
    "parts": EDGE + [["cyl", "darkwood", 0, -0.9, 0.47, 0.22, 2.7, 0.22], ["cyl", "#3a3028", 0, 0.47, 0.47, 0.24, 0.05, 0.24], ["box", "#8a6a3a", -0.5, 0.33, 0.47, 1.02, 0.03, 0.03, 0, 0, 0.08], ["box", "#8a6a3a", 0.5, 0.33, 0.47, 1.02, 0.03, 0.03, 0, 0, -0.08]],
    "snow": [["cyl", SNOW, 0, 0.5, 0.47, 0.22, 0.03, 0.22]]}
K["bollard"] = {"name": "Bollard", "examine": "A mooring post, worn smooth by a hundred years of ropes and the occasional sitting sailor.", "nopick": False,
    "parts": [["cyl12", "darkwood", 0, 0.25, 0, 0.3, 0.5, 0.3], ["cyl12", "#3a3028", 0, 0.52, 0, 0.38, 0.06, 0.38], ["cyl12", "#8a6a3a", 0, 0.3, 0, 0.33, 0.08, 0.33], ["cyl12", "#8a6a3a", 0, 0.18, 0, 0.33, 0.06, 0.33]],
    "snow": [["cyl12", SNOW, 0, 0.56, 0, 0.36, 0.03, 0.36]]}
K["pier_ladder"] = {"name": "Ladder", "examine": "Slick rungs down to the water. Down is the easy direction.", "nopick": True,
    "parts": [["box", "darkwood", -0.22, -0.4, 0.52, 0.06, 1.8, 0.06], ["box", "darkwood", 0.22, -0.4, 0.52, 0.06, 1.8, 0.06]] + [["box", "wood", 0, y, 0.52, 0.44, 0.04, 0.05] for y in (0.3, -0.05, -0.4, -0.75, -1.1)],
    "snow": []}
# what stands in the way (src/world.js decorBlock, 2026-10-18: "make solid decor block movement without blocking roads"): "tile" blocks the
# piece's own tile, "line" is a run of edge walls len metres long along the piece's turn (a fence section); none (prayer flags) you walk
# under. Never on a path tile: world.js leaves any tile or edge by a path open.
for k in ("milestone", "lantern_post", "wayshrine", "stone_bench", "fallen_log", "boulders", "broken_cart", "ruin_pillar", "stump_axe",
          "supply_cache", "standing_stone", "dead_tree", "gravestone", "grave_cross", "grave_old", "trash_heap", "burn_barrel", "fish_rack",
          "lobster_pots", "upturned_boat", "plank_pile", "notice_board", "pirate_flag", "cannon", "rum_barrels", "sea_chest", "shanty"):
    K[k]["block"] = "tile"
K["rail_fence"]["block"] = "line"; K["rail_fence"]["len"] = 2.9
K["iron_fence"]["block"] = "line"; K["iron_fence"]["len"] = 1.0   # the flower beds, the piers and the open gate you walk past (or through)
# walked over or under: the washing line, a coil of rope, a heap of net, the pirates' ship (on the water, tied to its pier)
_EX = os.path.join(ROOT, 'data', 'extra', 'decor.json')   # kinds other tools add (tools/thornwatch/make_tw_decor.py), kept across reruns
if os.path.exists(_EX): K.update(json.load(open(_EX)).get('kinds', {}))
DECOR = {"ashvale3d": "module", "name": "decor", "api": 1, "v": 1,
         "data": {"note": "reusable scenery (tools/decor/make_decor_data.py): parts [shape, colour, x, y, z, sx, sy, sz, ry, rx, rz], colours from a palette; a snowy palette adds the kind's snow parts",
                  "palettes": PALETTES, "kinds": K}}
if __name__ == '__main__':
    json.dump(DECOR, open(os.path.join(ROOT, 'data', 'decor.json'), 'w'), separators=(',', ':'))
    print('decor: %d kinds, %d palettes, %d parts' % (len(K), len(PALETTES), sum(len(k['parts']) + len(k.get('snow', [])) for k in K.values())))
