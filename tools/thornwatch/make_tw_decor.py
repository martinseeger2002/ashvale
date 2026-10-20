#!/usr/bin/env python3
"""make_tw_decor.py -> data/extra/decor.json (merged into data/decor.json): the scenery of Thornwatch Camp, the Red Moor and the Hollow
Den (2026-10-18, the operator: an Ashvale rendition of a walled archers' camp on a moor and the den below it). Same part format as
tools/decor/make_decor_data.py ([shape, colour, x, y, z, sx, sy, sz, ry, rx, rz]; metres, y up, x/y/z the part's centre, colours are
palette names or '#rrggbb'), which merges data/extra/decor.json in when it rebuilds, so these kinds survive its reruns.
    python3 tools/thornwatch/make_tw_decor.py      (then python3 build.py)
"""
import json, math, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CANVAS, CANVAS_DK, CANVAS_SH = '#b9ae95', '#958a72', '#7a705c'
PI2 = math.pi / 2


def palisade(n=6, w=2.0, h=2.7):
    """sharpened logs side by side along x, bound by two rails on the inner (+z) side; one 2 m section"""
    P = []
    for i in range(n):
        x = -w / 2 + w / n * (i + 0.5); hh = h + (0.18 if i % 2 else -0.05) + (0.1 if i % 3 == 1 else 0)
        P.append(['cyl6', 'wood' if i % 2 else 'darkwood', x, hh / 2, 0, 0.3, hh, 0.3, i * 0.7])
        P.append(['cone', 'darkwood' if i % 2 else 'wood', x, hh + 0.2, 0, 0.3, 0.42, 0.3, i * 0.7])
    for y in (0.75, 2.0):
        P.append(['box', 'darkwood', 0, y, 0.2, w, 0.12, 0.08])
    return P


def ridge(cx, cz, length, half, wall, rise, cloth=CANVAS, dark=CANVAS_DK):
    """one ridge of canvas: two roof planes meeting over cz, walls `wall` high, gables at both ends"""
    ang = math.atan2(rise, half); L = math.hypot(half, rise)
    P = [['box', cloth, cx, wall + rise / 2, cz - half / 2, length, 0.05, L + 0.04, 0, -ang, 0],
         ['box', cloth, cx, wall + rise / 2, cz + half / 2, length, 0.05, L + 0.04, 0, ang, 0],
         ['box', dark, cx, wall / 2, cz - half + 0.02, length, wall, 0.04],
         ['box', dark, cx, wall / 2, cz + half - 0.02, length, wall, 0.04]]
    for e in (-1, 1):   # gable: a wall and a flattened four-sided cone (a triangle in the y-z plane)
        P.append(['box', dark, cx + e * length / 2, wall / 2, cz, 0.04, wall, half * 2])
        P.append(['pyr', dark, cx + e * length / 2, wall + rise / 2, cz, 0.06, rise, half * 2, 0])
        P.append(['cyl6', 'darkwood', cx + e * (length / 2 + 0.06), (wall + rise + 0.25) / 2, cz, 0.1, wall + rise + 0.25, 0.1])
    P.append(['cyl6', 'darkwood', cx, wall + rise + 0.02, cz, 0.08, length + 0.2, 0.08, 0, 0, PI2])
    return P


def guys(cx, length, half, wall, rise, cz=0.0):
    """guy ropes and pegs off the ridge ends"""
    P = []
    for e in (-1, 1):
        x0 = cx + e * (length / 2 + 0.06); top = wall + rise + 0.2; px = x0 + e * 1.1; mx = (x0 + px) / 2
        P.append(['box', '#d8cfb4', mx, top / 2, cz, math.hypot(1.1, top), 0.025, 0.025, 0, 0, e * math.atan2(top, 1.1)])
        P.append(['box', 'darkwood', px, 0.08, cz, 0.08, 0.2, 0.08])
    return P


KINDS = {}
KINDS['palisade'] = {"name": "Palisade", "examine": "Sharpened logs, lashed tight. Somebody here expects company and does not want it.",
                     "parts": palisade(), "block": "line", "len": 2.0}
KINDS['palisade_post'] = {"name": "Palisade post", "examine": "A corner post as thick as a man, its point blackened in a fire to harden it.",
                          "parts": [['cyl6', 'darkwood', 0, 1.6, 0, 0.5, 3.2, 0.5], ['cone', 'darkwood', 0, 3.45, 0, 0.5, 0.5, 0.5],
                                    ['box', 'metal', 0, 2.3, 0, 0.54, 0.08, 0.54]], "block": "tile"}
# the gate: two tall posts, a lintel with the camp's red cloth, a torch on each post (the opening itself stays open ground)
_gate = []
for e in (-1, 1):
    _gate += [['cyl6', 'darkwood', e * 2.0, 1.8, 0, 0.42, 3.6, 0.42], ['cone', 'darkwood', e * 2.0, 3.85, 0, 0.42, 0.5, 0.42],
              ['box', 'metal', e * 2.0 - e * 0.28, 2.2, 0.25, 0.1, 0.4, 0.1], ['glow', '#ffb040', e * 2.0 - e * 0.28, 2.55, 0.25, 0.09]]
_gate += [['box', 'darkwood', 0, 3.3, 0, 4.6, 0.24, 0.24], ['box', 'darkwood', 0, 3.05, 0, 4.2, 0.12, 0.12],
          ['box', '#8a2a24', 0, 2.55, 0.14, 1.3, 1.3, 0.04], ['box', '#c8a040', 0, 2.65, 0.17, 0.5, 0.5, 0.02, 0, 0, math.pi / 4],
          ['box', '#8a2a24', -1.0, 2.75, 0.14, 0.5, 0.9, 0.04], ['box', '#8a2a24', 1.0, 2.75, 0.14, 0.5, 0.9, 0.04]]
KINDS['camp_gate'] = {"name": "Camp gate", "examine": "The gate of Thornwatch Camp. The red cloth is the Sisters' thorn; the gate itself was burned in the retreat and never rebuilt.",
                      "parts": _gate}

# the great pavilion: two ridges side by side (x along its length), a door flap and a bench in front
_pav = ridge(0, -1.3, 7.6, 1.3, 1.0, 1.4) + ridge(0, 1.3, 7.6, 1.3, 1.0, 1.4) + guys(0, 7.6, 1.3, 1.0, 1.4, -1.3) + guys(0, 7.6, 1.3, 1.0, 1.4, 1.3)
_pav += [['box', '#5a4636', 0.0, 0.8, 2.62, 1.3, 1.6, 0.05], ['box', CANVAS_SH, 0.75, 0.75, 2.66, 0.25, 1.5, 0.04, 0, 0, 0.2],
         ['box', 'wood', 2.4, 0.22, 3.4, 1.6, 0.08, 0.4], ['box', 'darkwood', 1.8, 0.1, 3.4, 0.08, 0.2, 0.3], ['box', 'darkwood', 3.0, 0.1, 3.4, 0.08, 0.2, 0.3],
         ['cyl6', 'darkwood', -3.0, 1.6, 2.9, 0.08, 3.2, 0.08], ['box', '#8a2a24', -2.72, 2.7, 2.9, 0.5, 0.8, 0.03]]
KINDS['pavilion'] = {"name": "Great pavilion", "examine": "The captain's pavilion: two ridges of canvas, patched where the arrows went through.", "parts": _pav}

_tent = ridge(0, 0, 2.6, 1.15, 0.35, 1.25) + guys(0, 2.6, 1.15, 0.35, 1.25)
_tent += [['box', '#4a3a2c', 1.33, 0.6, 0, 0.05, 1.0, 0.7]]
KINDS['ridge_tent'] = {"name": "Canvas tent", "examine": "A soldier's tent, two sleep in it and four snore.", "parts": _tent}

# a covered wagon: the bed on four wheels, a canvas hood over hoops, the shaft forward (+x)
_wag = [['box', 'wood', 0, 0.82, 0, 3.0, 0.42, 1.55], ['box', 'darkwood', 0, 0.6, 0, 3.0, 0.08, 1.45],
        ['box', CANVAS, 0, 1.33, -0.74, 2.8, 0.6, 0.05], ['box', CANVAS, 0, 1.33, 0.74, 2.8, 0.6, 0.05],
        ['cyl12', CANVAS, 0, 1.62, 0, 1.0, 2.8, 1.52, 0, 0, PI2],
        ['box', 'darkwood', 1.9, 0.55, 0, 1.6, 0.08, 0.08], ['box', 'darkwood', 2.65, 0.5, 0, 0.08, 0.08, 0.9],
        ['box', '#7a5a3a', -1.42, 1.33, 0, 0.05, 0.6, 1.4]]
for hx in (-1.1, 0.0, 1.1):
    _wag.append(['cyl12', 'darkwood', hx, 1.62, 0, 1.06, 0.07, 1.58, 0, 0, PI2])
for wx in (-1.0, 1.0):
    for wz in (-0.86, 0.86):
        _wag += [['cyl12', 'darkwood', wx, 0.5, wz, 1.0, 0.08, 1.0, 0, PI2, 0], ['cyl', 'metal', wx, 0.5, wz * 1.05, 0.2, 0.14, 0.2, 0, PI2, 0]]
_wag += [['box', 'cloth3', -0.4, 1.2, 0.2, 0.5, 0.4, 0.5, 0.4], ['cyl', 'wood', 0.6, 1.25, -0.3, 0.5, 0.6, 0.5]]
KINDS['covered_wagon'] = {"name": "Covered wagon", "examine": "A caravan wagon, its hood bleached by three summers on the road east. It has not moved since the pass closed.",
                          "parts": _wag, "block": "tile"}

_cart = [['box', 'wood', 0, 0.62, 0, 1.6, 0.3, 1.1], ['box', 'darkwood', 0, 0.85, 0.55, 1.6, 0.25, 0.05], ['box', 'darkwood', 0, 0.85, -0.55, 1.6, 0.25, 0.05],
         ['cyl12', 'darkwood', -0.2, 0.45, 0.66, 0.9, 0.08, 0.9, 0, PI2, 0], ['cyl12', 'darkwood', -0.2, 0.45, -0.66, 0.9, 0.08, 0.9, 0, PI2, 0],
         ['box', 'darkwood', 1.3, 0.55, 0.35, 1.2, 0.07, 0.07, 0, 0, -0.25], ['box', 'darkwood', 1.3, 0.55, -0.35, 1.2, 0.07, 0.07, 0, 0, -0.25],
         ['box', 'darkwood', -0.7, 0.3, 0, 0.08, 0.6, 0.08], ['stone', '#c8b68a', -0.2, 0.95, 0.1, 0.6, 0.45, 0.5], ['stone', '#b8a67a', 0.35, 0.92, -0.2, 0.55, 0.4, 0.45]]
KINDS['handcart'] = {"name": "Handcart", "examine": "Two wheels, two sacks, and nobody willing to push it.", "parts": _cart, "block": "tile"}

# a low dry-stone wall, 2 m: flat stones in two courses with a few cappers
_dw = []
for i in range(5):
    x = -0.8 + i * 0.4
    _dw += [['stone', 'darkstone' if i % 2 else 'stone', x, 0.2, 0, 0.5, 0.4, 0.6, i * 1.3], ['stone', 'stone' if i % 2 else 'darkstone', x + 0.2, 0.52, 0.02, 0.46, 0.34, 0.52, i * 2.1]]
_dw += [['stone', 'stone', -0.5, 0.78, 0, 0.5, 0.2, 0.45, 0.4], ['stone', 'darkstone', 0.45, 0.76, 0, 0.55, 0.2, 0.45, 1.2], ['stone', 'moss', 0.0, 0.8, 0.05, 0.3, 0.1, 0.3]]
KINDS['dry_wall'] = {"name": "Dry-stone wall", "examine": "Old field stones piled without mortar, older than the camp. The camp just leans on it.", "parts": _dw, "block": "line", "len": 2.0}

# the healer's table: trestle, jars, a mortar, and a rack of drying herbs behind
_herb = [['box', 'wood', 0, 0.78, 0, 1.6, 0.07, 0.7]]
for lx in (-0.7, 0.7):
    _herb += [['box', 'darkwood', lx, 0.38, -0.25, 0.07, 0.78, 0.07, 0, 0.2], ['box', 'darkwood', lx, 0.38, 0.25, 0.07, 0.78, 0.07, 0, -0.2]]
for i, c in enumerate(['#8a3a5a', '#3a6a8a', '#6a8a3a', '#c8a040', '#7a4a8a']):
    _herb.append(['cyl', c, -0.6 + i * 0.28, 0.92, -0.1 + (i % 2) * 0.2, 0.14, 0.22, 0.14])
_herb += [['cyl12', 'stone', 0.55, 0.88, 0.15, 0.24, 0.14, 0.24], ['box', 'darkwood', 0.6, 0.98, 0.15, 0.03, 0.2, 0.03, 0, 0.4],
          ['cyl6', 'darkwood', -0.85, 0.9, -0.75, 0.07, 1.8, 0.07], ['cyl6', 'darkwood', 0.85, 0.9, -0.75, 0.07, 1.8, 0.07], ['box', 'darkwood', 0, 1.75, -0.75, 1.8, 0.06, 0.06]]
for i in range(6):
    _herb.append(['box', ['#5a7a34', '#7a8a3a', '#6a5a3a', '#4a6a2a', '#8a7a4a', '#5a6a3a'][i], -0.7 + i * 0.28, 1.5, -0.75, 0.14, 0.42, 0.1])
KINDS['herb_table'] = {"name": "Healer's table", "examine": "Jars of salve, a mortar still green inside, and bundles of moor herbs drying overhead.", "parts": _herb, "block": "tile"}

# a tripod brazier: three splayed legs, an iron bowl, a fire in it
_tri = []
for k in range(3):
    a = k * 2 * math.pi / 3
    _tri.append(['box', 'metal', math.cos(a) * 0.22, 0.6, math.sin(a) * 0.22, 0.05, 1.25, 0.05, -a, 0, 0.2])
_tri += [['cyl12', 'metal', 0, 1.2, 0, 0.5, 0.16, 0.5], ['cone', '#ff8a20', 0, 1.42, 0, 0.32, 0.4, 0.32], ['cone', '#ffd060', 0, 1.4, 0, 0.18, 0.3, 0.18],
         ['glow', '#ffb040', 0, 1.5, 0, 0.12]]
KINDS['tripod_brazier'] = {"name": "Brazier", "examine": "An iron bowl of coals on three legs. Something in this cave has learned to keep it fed.", "parts": _tri, "block": "tile"}

# an archery butt: a straw boss with painted rings on an A-frame, two arrows in it
_butt = [['box', 'darkwood', -0.4, 0.6, -0.25, 0.07, 1.3, 0.07, 0, 0.35], ['box', 'darkwood', 0.4, 0.6, -0.25, 0.07, 1.3, 0.07, 0, 0.35],
         ['cyl12', '#c8b070', 0, 0.95, 0, 1.1, 0.25, 1.1, 0, PI2 + 0.2, 0], ['cyl12', '#3a5a8a', 0, 0.97, 0.13, 0.75, 0.02, 0.75, 0, PI2 + 0.2, 0],
         ['cyl12', '#e8e0c8', 0, 0.97, 0.14, 0.5, 0.02, 0.5, 0, PI2 + 0.2, 0], ['cyl12', '#b83a2a', 0, 0.97, 0.15, 0.24, 0.02, 0.24, 0, PI2 + 0.2, 0],
         ['box', 'darkwood', 0.08, 1.0, 0.35, 0.025, 0.025, 0.5, 0.2, 0.1], ['box', 'darkwood', -0.15, 0.85, 0.33, 0.025, 0.025, 0.5, -0.15, -0.1]]
KINDS['archery_butt'] = {"name": "Archery butt", "examine": "A straw target, shot through so often the middle is mostly holes held together by habit.", "parts": _butt, "block": "tile"}

# the den's warning stones: a boulder with a skull face cut in it
_skull = [['rock', 'darkstone', 0, 0.6, 0, 1.3, 1.2, 1.1, 0.5], ['stone', '#d8d0bc', 0, 0.95, 0.42, 0.62, 0.62, 0.3],
          ['stone', '#1a1612', -0.13, 1.0, 0.56, 0.16, 0.16, 0.06], ['stone', '#1a1612', 0.13, 1.0, 0.56, 0.16, 0.16, 0.06],
          ['box', '#d8d0bc', 0, 0.68, 0.5, 0.36, 0.1, 0.06], ['box', '#8a2a24', 0, 1.25, 0.45, 0.6, 0.05, 0.04, 0, 0, 0.15]]
KINDS['skull_stone'] = {"name": "Skull stone", "examine": "A face hacked into the rock and daubed red. A warning, or an invitation, depending on who carved it.", "parts": _skull, "block": "tile"}

_bones = [['stone', '#ddd5c0', 0, 0.1, 0, 0.3, 0.24, 0.26], ['stone', '#1a1612', 0.05, 0.12, 0.12, 0.07, 0.07, 0.03]]
for k in range(7):
    a = k * 0.9
    _bones.append(['cyl6', '#d4ccb6', math.cos(a) * 0.4, 0.04, math.sin(a) * 0.35, 0.05, 0.5 - (k % 3) * 0.1, 0.05, a, 0, PI2])
_bones.append(['box', '#5a4a3a', -0.3, 0.03, 0.3, 0.6, 0.04, 0.4, 0.4])
KINDS['bone_pile'] = {"name": "Bones", "examine": "Picked clean. The small teeth marks are the worrying part.", "parts": _bones}

_roll = [['cyl12', '#6a3a2a', 0, 0.14, 0, 0.3, 1.7, 0.28, 0, 0, PI2], ['box', '#7a5a3a', 0.2, 0.03, 0, 1.4, 0.04, 0.75], ['cyl12', '#c8b890', -0.75, 0.1, 0, 0.3, 0.4, 0.22, 0, PI2, 0]]
KINDS['bedroll'] = {"name": "Bedroll", "examine": "A blanket and a sack of straw. Somebody sleeps here when the watch lets them.", "parts": _roll}

_sp = [['cyl6', 'darkwood', 0, 1.3, 0, 0.12, 2.6, 0.12], ['box', 'darkwood', 0, 2.3, 0, 1.0, 0.08, 0.08]]
for i, w in enumerate([-0.35, 0, 0.35]):
    _sp += [['cyl6', 'darkwood', w, 1.25, 0.12, 0.05, 2.1, 0.05, 0, 0.12], ['cone', 'metal', w, 2.36, 0.25, 0.08, 0.22, 0.08, 0, 0.12]]
KINDS['spear_rack'] = {"name": "Spear rack", "examine": "Three spears, sharpened yesterday, and a gap where a fourth was.", "parts": _sp, "block": "tile"}

# ---- The Caged Seer (2026-10-19): the Gloamwood's hollow oak, Emberfall's ruins and the seer's cage ----
# the hollow oak: a huge squat trunk split down the front, the hollow dark inside, thick roots, a few bare limbs and a last ragged crown
_oak = [['cyl12', '#3e3022', 0, 1.3, 0, 1.9, 2.6, 1.9], ['cyl12', '#4a3a28', 0, 0.2, 0, 2.6, 0.4, 2.6],
        ['box', '#120c08', 0, 1.1, 0.88, 0.7, 1.7, 0.2], ['box', '#8a6a44', 0, 1.6, 0.82, 0.95, 2.9, 0.12], ['box', '#120c08', 0, 1.3, 0.9, 0.6, 2.0, 0.12], ['box', '#2a1e14', -0.42, 1.1, 0.9, 0.16, 1.9, 0.18, 0, 0, 0.08], ['box', '#2a1e14', 0.42, 1.1, 0.9, 0.16, 1.9, 0.18, 0, 0, -0.08],
        ['cyl', '#3a2c1e', 0.1, 3.1, 0, 1.2, 1.4, 1.2, 0, 0, -0.1]]
for k in range(6):   # roots fanning out over the ground
    a = k * math.pi / 3 + 0.3
    _oak.append(['cyl6', '#3a2c1e', math.cos(a) * 1.25, 0.18, math.sin(a) * 1.25, 0.32, 1.2, 0.32, -a, 0, PI2 - 0.15])
for a, tilt, ln in ((0.4, 0.9, 2.2), (2.3, 0.8, 1.9), (4.1, 0.95, 2.4), (5.4, 0.7, 1.6)):   # bare limbs
    _oak.append(['cyl6', '#33271a', math.cos(a) * 0.9, 3.6 + ln * 0.3, math.sin(a) * 0.9, 0.26, ln, 0.26, -a, 0, tilt])
for cx, cy, cz, r in ((0.9, 4.9, 0.3, 1.6), (-0.8, 4.6, -0.5, 1.4), (0.1, 5.3, -0.9, 1.2)):   # a last ragged crown
    _oak.append(['stone', '#2e4a26', cx, cy, cz, r * 1.4, r, r * 1.4])
_oak += [['box', '#c8b890', 0.05, 1.25, 0.86, 0.22, 0.08, 0.06, 0, 0, 0.2], ['glow', '#9ad06a', 0, 1.2, 0.7, 0.05]]   # a pale roll of bark-paper in the hollow
KINDS['hollow_oak'] = {"name": "The hollow oak", "examine": "An oak older than the abbey, split open down the front. Something pale is tucked in the dark of the hollow.", "parts": _oak}

# the gibbet cage: an iron cage of bars hung from a gallows arm; the person inside stands on the cage's own floor
_cage = [['cyl6', 'darkwood', -0.9, 1.9, 0, 0.22, 3.8, 0.22], ['box', 'darkwood', -0.3, 3.7, 0, 1.4, 0.18, 0.18], ['box', 'darkwood', -0.65, 3.3, 0, 0.1, 0.8, 0.1, 0, 0, -0.8],
         ['box', 'metal', 0.25, 3.25, 0, 0.04, 0.7, 0.04], ['cyl12', 'metal', 0.25, 0.05, 0, 1.0, 0.08, 1.0], ['cyl12', 'metal', 0.25, 2.85, 0, 1.0, 0.06, 1.0],
         ['cone', 'metal', 0.25, 3.0, 0, 1.0, 0.3, 1.0]]
for k in range(10):
    a = k * math.pi / 5
    _cage.append(['box', 'metal', 0.25 + math.cos(a) * 0.48, 1.45, math.sin(a) * 0.48, 0.04, 2.8, 0.04])
_cage += [['box', 'metal', 0.25, 1.4, 0.5, 0.3, 0.3, 0.06], ['cyl12', '#8a6a2a', 0.25, 1.4, 0.54, 0.16, 0.05, 0.16, 0, PI2, 0]]
KINDS['gibbet_cage'] = {"name": "Gibbet cage", "examine": "An iron cage on a gallows arm, its lock as big as a fist.", "parts": _cage, "block": "tile"}

# a burned wall, 2 m: blackened stone to shoulder height, broken along the top, soot streaks, a scorched beam end sticking out
_bw = []
for i in range(5):
    x = -0.8 + i * 0.4; h = [1.9, 1.5, 2.2, 1.2, 1.7][i]
    _bw.append(['box', '#6a6258' if i % 2 else '#7a7166', x, h / 2, 0, 0.42, h, 0.4])   # field stone, the soot only streaked on (2026-10-19: all-black read as battlements)
    _bw.append(['stone', '#4a433c', x, h + 0.05, 0, 0.36, 0.18, 0.34, i * 1.1])
_bw += [['box', '#2e2924', 0.1, 1.3, 0.21, 0.5, 1.0, 0.02], ['box', '#3a332c', -0.6, 0.9, 0.21, 0.3, 0.8, 0.02], ['box', '#241a12', 0.5, 1.4, 0.4, 0.14, 0.14, 0.9, 0, 0.3],
        ['box', '#2a221c', 0.0, 0.05, 0.5, 1.6, 0.06, 0.5]]
KINDS['burnt_wall'] = {"name": "Burned wall", "examine": "What is left of a house wall. The stones are still warm, which they should not be.", "parts": _bw, "block": "line", "len": 2.0}

# charred beams on the ground (walked over), with ash under them
KINDS['charred_beam'] = {"name": "Charred beams", "examine": "Roof beams, burned through and fallen. They crumble when you step on them.",
                         "parts": [['box', '#4a4440', 0, 0.02, 0, 1.6, 0.04, 1.2], ['box', '#1e1814', -0.1, 0.1, 0, 2.0, 0.16, 0.18, 0.3], ['box', '#241c16', 0.2, 0.1, 0.25, 1.6, 0.14, 0.16, -0.5],
                                   ['box', '#1a1410', 0.0, 0.18, -0.2, 1.2, 0.12, 0.14, 1.2]]}
# smouldering rubble: a heap of stone and black timber with embers in it
_emb = [['rock', '#3a3632', 0, 0.3, 0, 1.4, 0.6, 1.2, 0.4], ['rock', '#2a2622', 0.5, 0.25, 0.3, 0.7, 0.5, 0.6, 1.3], ['box', '#1a1410', -0.2, 0.55, 0.1, 1.3, 0.14, 0.16, 0.7, 0, 0.3],
        ['stone', '#ff6a20', 0.1, 0.45, 0.35, 0.22, 0.1, 0.18], ['stone', '#ffa040', -0.35, 0.4, -0.2, 0.16, 0.08, 0.14], ['glow', '#ff7a30', 0, 0.5, 0.2, 0.07]]
KINDS['ember_heap'] = {"name": "Smouldering rubble", "examine": "A heap of what used to be a house. It has been burning for a month and shows no sign of stopping.", "parts": _emb}

# ---- The Drowned Tower (2026-10-19): the Blackmere and its ruined tower ----
# the tower: a round keep of dark stone, about 6 m across, broken off unevenly at the top, sunk a little into the mud; a doorway
# on its south face (+z) where the stair goes down (the stair itself is a passage, src/scene.js 'stairs'), slit windows, rubble round it
_tw = []
R, NSEG = 2.9, 16
for k in range(NSEG):
    a = k * 2 * math.pi / NSEG
    if abs(a - PI2) < 0.25:   # the doorway, facing +z
        _tw.append(['box', '#6a645c', math.cos(a) * R, 3.6, math.sin(a) * R, 1.2, 1.6, 0.7, -a + PI2])
        continue
    h = [5.8, 4.6, 3.2, 1.6, 1.1, 2.4, 4.0, 5.2, 0, 4.8, 3.6, 1.4, 2.8, 4.4, 5.6, 6.2][k]   # broken off unevenly, low on the east where it fell
    _tw.append(['box', '#77706a' if k % 2 else '#6a645c', math.cos(a) * R, h / 2, math.sin(a) * R, 1.25, h, 0.7, -a + PI2])
    _tw.append(['box', '#4e5a3e', math.cos(a) * (R + 0.02), 0.45, math.sin(a) * (R + 0.02), 1.27, 0.9, 0.72, -a + PI2])   # the bog's tide-mark
    if k % 4 == 1:
        _tw.append(['box', '#141210', math.cos(a) * (R + 0.36), 3.8, math.sin(a) * (R + 0.36), 0.16, 0.8, 0.02, -a + PI2])
_tw += [['cyl12', '#4a4238', 0, 0.15, 0, 6.6, 0.3, 6.6], ['box', 'moss', 1.2, 2.2, 2.9, 0.8, 1.6, 0.05], ['box', 'moss', -2.4, 1.4, 1.5, 0.05, 1.2, 0.9, 0.5]]
for (dx, dz, r) in ((3.6, 1.0, 0.9), (3.3, -1.6, 1.1), (-3.4, 2.2, 0.6), (2.0, -3.6, 0.8), (-2.8, -2.6, 0.5), (3.9, 0.0, 0.7)):   # the east side fell outward
    _tw.append(['rock', '#6a645c', dx, r * 0.4, dz, r, r * 0.8, r, dx])
KINDS['ruined_tower'] = {"name": "The drowned tower", "examine": "A round tower sunk to its knees in the bog. Its top is gone; its cellars, they say, go down a long way.", "parts": _tw}
# a bog pool: black water flat on the ground with reeds round its edge (walked round: zones shut its tiles themselves)
_bog = [['cyl12', '#5a4a34', 0, 0.012, 0, 3.4, 0.02, 3.0], ['cyl12', '#2a3a34', 0, 0.025, 0, 2.7, 0.03, 2.3], ['cyl12', '#3e5a54', 0.3, 0.035, -0.2, 1.2, 0.02, 0.7]]   # mud rim, black water, a sheen
for k in range(9):
    a = k * 0.7 + 0.3
    _bog.append(['cyl6', '#6a7a3a' if k % 2 else '#8a8a4a', math.cos(a) * 1.45, 0.45, math.sin(a) * 1.25, 0.06, 0.9 + (k % 3) * 0.2, 0.06, 0, 0.1, 0.1])
KINDS['bog_pool'] = {"name": "Bog pool", "examine": "Black water, still as glass. You cannot see the bottom, and you do not want to try.", "parts": _bog}
_reed = []
for k in range(7):
    a = k * 0.9
    _reed.append(['cyl6', '#7a8a3a' if k % 2 else '#5a6a2a', math.cos(a) * 0.25, 0.5 + (k % 3) * 0.1, math.sin(a) * 0.25, 0.07, 1.0 + (k % 3) * 0.2, 0.07, 0, 0.12 * math.cos(a), 0.12 * math.sin(a)])
    _reed.append(['cyl6', '#4a3020', math.cos(a) * 0.25, 1.1 + (k % 3) * 0.2, math.sin(a) * 0.25, 0.09, 0.22, 0.09])
KINDS['reed_clump'] = {"name": "Reeds", "examine": "Bulrushes, taller than you. Something moves through them now and then.", "parts": _reed}

# ---- The Smith's Hammer and The Thorn Maiden (2026-10-19): the Thornwatch abbey, fallen ----
# the abbey wall, 2 m: dressed pale stone 3.4 m high with a walkway lip and crenels; the broken one is down to a jagged 1.5 m
ABBEY, ABBEY_DK = '#a8a090', '#8a8274'
_aw = [['box', ABBEY, 0, 1.7, 0, 2.0, 3.4, 0.7], ['box', ABBEY_DK, 0, 0.15, 0, 2.06, 0.3, 0.76], ['box', ABBEY_DK, 0, 3.42, 0.2, 2.0, 0.12, 0.4]]
for x in (-0.75, 0.25):
    _aw.append(['box', ABBEY, x + 0.25, 3.7, -0.15, 0.5, 0.5, 0.4])
_aw += [['box', 'moss', 0.4, 0.6, 0.36, 0.6, 0.5, 0.02], ['box', '#7a7264', -0.5, 2.0, 0.36, 0.3, 0.2, 0.02]]
KINDS['abbey_wall'] = {"name": "Abbey wall", "examine": "The Thornwatch's abbey wall: three hundred years of good masonry, and now nobody on it.", "parts": _aw, "block": "line", "len": 2.0}
_awb = [['box', ABBEY, -0.5, 0.75, 0, 1.0, 1.5, 0.7], ['box', ABBEY, 0.45, 0.45, 0, 0.9, 0.9, 0.7], ['stone', ABBEY_DK, 0.6, 1.0, 0.1, 0.5, 0.3, 0.5, 0.7],
        ['rock', ABBEY, 0.3, 0.2, 0.7, 0.6, 0.4, 0.5, 1.3], ['rock', ABBEY_DK, -0.6, 0.18, -0.75, 0.5, 0.36, 0.5, 2.2]]
KINDS['abbey_wall_broken'] = {"name": "Broken wall", "examine": "Something came through here. It did not use the gate.", "parts": _awb, "block": "line", "len": 2.0}
# the abbey gate: two square towers (4.8 m) with a pointed arch between, the gate itself long gone; the opening (2 tiles) stays open
_ag = []
for e in (-1, 1):
    _ag += [['box', ABBEY, e * 1.9, 2.4, 0, 1.4, 4.8, 1.4], ['box', ABBEY_DK, e * 1.9, 4.95, 0, 1.6, 0.3, 1.6], ['pyr', '#5a4a3a', e * 1.9, 5.6, 0, 1.6, 1.0, 1.6, math.pi / 4],
            ['box', '#141210', e * 1.9, 3.4, 0.71, 0.18, 0.7, 0.02]]
_ag += [['box', ABBEY, 0, 4.1, 0, 2.4, 0.9, 1.0], ['pyr', ABBEY, 0, 3.55, 0, 2.4, 0.7, 1.0, 0, PI2, 0], ['box', '#8a2a24', 0, 4.1, 0.52, 0.8, 0.8, 0.03],
        ['box', '#c8a040', 0, 4.1, 0.54, 0.34, 0.34, 0.02, 0, 0, math.pi / 4]]
KINDS['abbey_gate'] = {"name": "Abbey gate", "examine": "The gate of the Thornwatch abbey, its thorn banner still hanging over an empty arch.", "parts": _ag}
# a cloister arch: two slim columns and a round arch between them, 2 m (a line piece: the walk under it stays open, its feet are shut)
_ca = []
for e in (-1, 1):
    _ca += [['cyl12', ABBEY, e * 0.85, 1.3, 0, 0.3, 2.6, 0.3], ['box', ABBEY_DK, e * 0.85, 0.08, 0, 0.42, 0.16, 0.42], ['box', ABBEY_DK, e * 0.85, 2.66, 0, 0.42, 0.12, 0.42]]
for k in range(7):
    a = k * math.pi / 6
    _ca.append(['box', ABBEY, -math.cos(a) * 0.85, 2.72 + math.sin(a) * 0.6, 0, 0.3, 0.22, 0.3, 0, 0, a - PI2])
_ca.append(['box', ABBEY, 0, 3.45, 0, 2.1, 0.2, 0.36])
KINDS['cloister_arch'] = {"name": "Cloister arch", "examine": "An arch of the cloister walk. The sisters' names are carved on every column, small.", "parts": _ca, "block": "line", "len": 2.0}
# the altar: a stepped stone table with a red cloth and two tall candles
_alt = [['box', ABBEY_DK, 0, 0.12, 0, 2.6, 0.24, 1.4], ['box', ABBEY, 0, 0.6, 0, 2.0, 0.8, 0.9], ['box', '#7a1a1e', 0, 1.02, 0, 2.04, 0.04, 0.94],
        ['box', '#7a1a1e', 0, 0.75, 0.47, 0.8, 0.5, 0.02]]
for e in (-1, 1):
    _alt += [['cyl12', '#c8a040', e * 0.75, 1.1, 0, 0.14, 0.12, 0.14], ['cyl12', '#ece4d0', e * 0.75, 1.4, 0, 0.08, 0.5, 0.08], ['glow', '#ffc860', e * 0.75, 1.7, 0, 0.05]]
KINDS['abbey_altar'] = {"name": "Altar", "examine": "The abbey's altar. Someone has lit the candles again. Someone who is not a sister.", "parts": _alt}
# a stone coffin: lid a little askew
KINDS['sarcophagus'] = {"name": "Stone coffin", "examine": "A sister of the Thornwatch, buried under the abbey. The lid has been pushed aside from inside.",
                        "parts": [['box', ABBEY_DK, 0, 0.35, 0, 1.0, 0.7, 2.1], ['box', ABBEY, 0.12, 0.78, 0.15, 1.04, 0.16, 2.1, 0.18], ['box', '#7a7264', 0.1, 0.87, 0.2, 0.4, 0.03, 0.5, 0.18]]}

for _k in KINDS.values():   # every kind stands in the way (tests/decor_block_test.js); zones shut its real footprint (tools/thornwatch/make_thornwatch.js)
    _k.setdefault('block', 'tile')
DECOR_EXTRA = {"kinds": KINDS}

if __name__ == '__main__':
    ex = os.path.join(ROOT, 'data', 'extra', 'decor.json')
    os.makedirs(os.path.dirname(ex), exist_ok=True)
    old = json.load(open(ex)) if os.path.exists(ex) else {"kinds": {}}
    old.setdefault('kinds', {}).update(KINDS)
    json.dump(old, open(ex, 'w'), indent=1); open(ex, 'a').write('\n')
    lp = os.path.join(ROOT, 'data', 'decor.json'); live = json.load(open(lp))
    live['data']['kinds'].update(KINDS)
    json.dump(live, open(lp, 'w'), separators=(',', ':'))
    print('decor kinds: %d (%s)' % (len(KINDS), ', '.join(KINDS)))
