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
