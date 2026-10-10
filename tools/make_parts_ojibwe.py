#!/usr/bin/env python3
"""make_parts_ojibwe.py - the regalia and the things of Ziibiing, the Ojibwe village on the river south of Ashvale
(2026-10-07: "seven NPC's all in American Indian Regalia, Ojibwe Regalia"). Woodland regalia: ribbon shirts with
ribbon bands across the yoke, jingle dresses hung with rows of rolled tin cones, ribbon skirts, velvet vests beaded with
woodland flowers, otter fur turbans with a single feather, beaded headbands, braids, beaded bandolier bags (gashkibidaagan),
moccasins; a hand drum, a canoe paddle. Writes data/parts/*.json (its own files only: tools/make_parts.py's are not touched).
    python3 tools/make_parts_ojibwe.py"""
import json, math, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, 'data', 'parts')
PI = math.pi
def S(t, s, c, p=None, j=None, **kw):
    d = {"t": t, "s": s, "c": c}
    if p is not None and any(v != 0 for v in p): d["p"] = [round(v, 4) if isinstance(v, float) else v for v in p]
    if j: d["j"] = j
    d.update(kw); return d
box = lambda w, h, d, c, x=0, y=0, z=0, **kw: S('box', [w, h, d], c, [x, y, z], **kw)
cyl = lambda rt, rb, h, c, x=0, y=0, z=0, seg=7, **kw: S('cyl', [rt, rb, h], c, [x, y, z], seg=seg, **kw)
cone = lambda rad, h, c, x=0, y=0, z=0, seg=6, **kw: S('cone', [rad, h], c, [x, y, z], seg=seg, **kw)
sph = lambda rad, c, x=0, y=0, z=0, ws=8, hs=6, **kw: S('sphere', [rad], c, [x, y, z], seg=[ws, hs], **kw)
def part(pid, kind, **kw):
    d = {"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": kind}; d.update(kw)
    json.dump(d, open(os.path.join(OUT, pid + '.json'), 'w'), separators=(',', ':')); return d
C = "$c"
RIB = ['#c8202a', '#f2c641', '#2a6fb3', '#f4f1ea', '#3f8a3a']   # ribbon colours
FLOWER = ['#d8344a', '#f2c641', '#f4f1ea', '#6fb7e6', '#e87ab0', '#3f9a4a']   # beadwork: woodland flowers, leaves

# a woman's top keeps her shape (2026-10-09: "the women in Ashvale have breasts - why not in the village?"): the cloth
# rounds out over the bust a little more than bare body.human does, so flat beadwork and ribbon bands sit on it, not in front of it
bust = lambda col: dict(sph(0.072, col, 0.062, 0.33, 0.072, 10, 8, k=[1.0, 0.85, 0.85], mirror=True, **{"if": "fem"}), j='torso')
# ---- ribbon shirt: long sleeves, ribbon bands across the yoke front and back, ribbon ends hanging from the yoke
rs = []
for i, col in enumerate(RIB[:3]):
    y = 0.4 - i * 0.032
    rs += [box(0.33, 0.022, 0.02, col, 0, y, 0.112, j='torso'), box(0.33, 0.022, 0.02, col, 0, y, -0.112, j='torso')]
for i, xo in enumerate((-0.12, -0.08, 0.08, 0.12)):
    rs.append(box(0.022, 0.2, 0.012, RIB[i % 4], xo, 0.27, 0.118, j='torso'))
part('cloth.shirt_ribbon', 'cloth', slot='shirt', style='ribbon', paint={"torso": C, "bust": C, "shoulder": C, "upperArm": C, "lowerArm": C},
     shapes=[bust(C), dict(cyl("0.176*W*(1+0.16*fem)", "0.2*W*(1+0.18*fem)", 0.2, C, 0, -0.08, 0, seg=9, k=[1, 1, 0.72]), j="hips")] + rs)

# ---- velvet vest beaded with woodland flowers (worn over a plain shirt colour on the arms)
vs = [box(0.07, 0.3, 0.02, '#f4f1ea', 0, 0.3, 0.11, j='torso')]
for side in (-1, 1):   # a flower on each front panel: five petals round a centre, two leaves, a stem
    cx, cy = side * 0.085, 0.3
    vs.append(box(0.024, 0.024, 0.01, FLOWER[1], cx, cy, 0.122, j='torso'))
    for k in range(5):
        a = k / 5 * 2 * PI
        vs.append(box(0.022, 0.022, 0.01, FLOWER[0] if side < 0 else FLOWER[4], cx + math.cos(a) * 0.028, cy + math.sin(a) * 0.028, 0.121, j='torso'))
    vs += [box(0.012, 0.09, 0.01, FLOWER[5], cx, cy - 0.08, 0.121, j='torso'),
           box(0.03, 0.016, 0.01, FLOWER[5], cx - 0.022, cy - 0.07, 0.121, r=[0, 0, 0.5], j='torso'), box(0.03, 0.016, 0.01, FLOWER[5], cx + 0.022, cy - 0.1, 0.121, r=[0, 0, -0.5], j='torso')]
part('cloth.shirt_beadvest', 'cloth', slot='shirt', style='beadvest', paint={"torso": '#1c1a26', "bust": '#1c1a26', "shoulder": C, "upperArm": C, "lowerArm": C}, shapes=[bust('#1c1a26')] + vs)

# ---- jingle dress: the top with a beaded yoke and a row of cones, the skirt with three rows of rolled tin cones to the hem
TIN = '#d8dde3'
jt = [box(0.34, 0.06, 0.02, '#f2c641', 0, 0.4, 0.112, j='torso'), box(0.34, 0.06, 0.02, '#f2c641', 0, 0.4, -0.112, j='torso')]
for i in range(9):
    x = -0.14 + i * 0.035
    jt += [cone(0.012, 0.045, TIN, x, 0.345, 0.115, seg=5, r=[PI, 0, 0], j='torso'), cone(0.012, 0.045, TIN, x, 0.345, -0.115, seg=5, r=[PI, 0, 0], j='torso')]
part('cloth.shirt_jingle', 'cloth', slot='shirt', style='jingle', paint={"torso": C, "bust": C, "shoulder": C, "upperArm": C, "lowerArm": C}, shapes=jt)
js = [dict(cyl("0.18*W*(1+0.16*fem)", "0.27*W*(1+0.1*fem)", 0.8, C, 0, -0.41, 0, seg=12, k=[1, 1, 0.75]), j="hips")]
for row, (y, r) in enumerate(((-0.24, 0.215), (-0.46, 0.237), (-0.68, 0.259))):
    n = 18
    for k in range(n):
        a = (k + 0.5 * (row % 2)) / n * 2 * PI
        js.append(dict(cone(0.014, 0.05, TIN, round(math.sin(a) * (r + 0.008), 4), y, round(math.cos(a) * (r + 0.008) * 0.75, 4), seg=5, r=[PI, 0, 0]), j="hips"))
    js.append(dict(cyl(r + 0.004, r + 0.004, 0.012, '#f2c641', 0, y + 0.035, 0, seg=12, k=[1, 1, 0.75]), j="hips"))
part('cloth.pants_jingle', 'cloth', slot='pants', style='jingle', paint={"pelvis": C}, shapes=js)

# ---- ribbon skirt: long, with ribbon bands round it above the hem
rk = [dict(cyl("0.18*W*(1+0.16*fem)", "0.27*W*(1+0.1*fem)", 0.8, C, 0, -0.41, 0, seg=12, k=[1, 1, 0.75]), j="hips")]
for i, (y, r) in enumerate(((-0.58, 0.248), (-0.64, 0.253), (-0.7, 0.258))):
    rk.append(dict(cyl(r + 0.004, r + 0.005, 0.03, RIB[[0, 1, 4][i]], 0, y, 0, seg=12, k=[1, 1, 0.75]), j="hips"))
part('cloth.pants_ribbonskirt', 'cloth', slot='pants', style='ribbonskirt', paint={"pelvis": C}, shapes=rk)

# ---- headwear (the head joint; the band sits like the feather headband's: y 0.2, radius 0.158)
BY, BR = 0.2, 0.158
def feather(x, z, lean, side):   # an eagle feather: white with a dark tip, a red wrapped quill
    L = 0.32
    return {"t": "group", "p": [x, BY - 0.01, z], "r": [lean, 0, side], "j": "head", "shapes": [
        cyl(0.011, 0.013, 0.05, '#a83224', 0, 0.025, 0, seg=6), box(0.008, L, 0.008, '#f4f1ea', 0, L / 2, 0),
        box(0.06, L * 0.8, 0.005, '#f4f1ea', 0, L * 0.56, 0.004), box(0.062, L * 0.24, 0.006, '#2a2420', 0, L * 0.86, 0.005)]}
ot = [dict(cyl(BR + 0.03, BR + 0.03, 0.08, C, 0, BY, 0, seg=14), j='head'), dict(cyl(BR + 0.034, BR + 0.034, 0.02, C + ':0.7', 0, BY - 0.03, 0, seg=14), j='head')]
ot.append(dict(cyl(0.045, 0.045, 0.012, '#f4f1ea', 0, BY, BR + 0.03, seg=10, r=[PI / 2, 0, 0]), j='head'))   # the beaded medallion at the front
for k in range(6):
    a = k / 6 * 2 * PI; ot.append(dict(box(0.018, 0.018, 0.01, FLOWER[k % 5], math.cos(a) * 0.026, BY + math.sin(a) * 0.026, BR + 0.04), j='head'))
ot.append(dict(box(0.02, 0.02, 0.012, '#c8202a', 0, BY, BR + 0.042), j='head'))
ot.append(feather(0.02, -BR - 0.03, -0.25, -0.12))
ot.append(dict(box(0.03, 0.34, 0.03, C + ':0.85', 0.0, BY - 0.2, -BR - 0.03, r=[0.1, 0, 0]), j='head'))   # the fur tail down the back
part('cloth.hat_otterturban', 'cloth', slot='hat', style='otterturban', color='#4a3424', hides=[], shapes=ot)
bb = [dict(cyl(BR + 0.006, BR + 0.006, 0.04, C, 0, BY, 0, seg=16), j='head')]
for i in range(24):
    a = math.radians(i * 15); col = FLOWER[i % 5]
    bb.append(dict(box(0.018, 0.022, 0.006, col, round(math.sin(a) * (BR + 0.009), 4), BY, round(math.cos(a) * (BR + 0.009), 4), r=[0, round(a, 4), 0]), j='head'))
part('cloth.hat_beadband', 'cloth', slot='hat', style='beadband', color='#1c1a26', hides=[], shapes=bb)

# ---- braids: the hair cap and two braids over the shoulders, tied with red cloth
cap = {"t": "sphere", "s": [0.153], "c": "$hair", "p": [0, 0.145, -0.008], "seg": [12, 6], "th": 0.5, "r": [-0.32, 0, 0], "k": [0.95, 1.08, 1.04], "tag": "hairCap", "j": "head"}
br = [cap]
for side in (-1, 1):
    for k in range(6):
        br.append(dict(sph(0.034 - k * 0.002, "$hair", side * 0.13, 0.02 - k * 0.055, 0.03 + k * 0.012, 7, 5), j='head'))
    br.append(dict(cyl(0.022, 0.022, 0.04, '#c8202a', side * 0.13, -0.32, 0.1, seg=6), j='head'))
part('cloth.hair_braids', 'cloth', slot='hair', style='braids', shapes=br)

# ---- gear: the bandolier bag, the hand drum, the paddle
bd = [box(0.05, 0.62, 0.02, C, 0, 0.24, 0.118, r=[0, 0, 0.62], j='torso'), box(0.05, 0.62, 0.02, C, 0, 0.24, -0.118, r=[0, 0, -0.62], j='torso'),
      box(0.17, 0.16, 0.035, C, 0.13, -0.02, 0.1, r=[0, -0.3, 0], j='torso'), box(0.17, 0.05, 0.04, C + ':0.75', 0.13, 0.045, 0.1, r=[0, -0.3, 0], j='torso')]
for k, (dx, dy) in enumerate(((0, 0), (-0.04, 0.03), (0.04, -0.03), (0.035, 0.035), (-0.035, -0.03))):
    bd.append(box(0.024, 0.024, 0.01, FLOWER[k], 0.13 + dx, -0.03 + dy, 0.12, r=[0, -0.3, 0], j='torso'))
for k in range(5):   # beaded tabs below the bag
    bd.append(box(0.022, 0.07, 0.01, FLOWER[k], 0.07 + k * 0.03, -0.13, 0.11, r=[0, -0.3, 0], j='torso'))
part('gear.bandolier', 'gear', slot='pack', items={"bandolier_bag": "#2d2a5a"}, shapes=bd)
part('gear.handdrum', 'gear', slot='shield', items={"hand_drum": "#e8dcbc"}, mount={"j": "elL", "p": [0.08, -0.2, 0.06], "r": [0, 0.9, 0]},
     shapes=[cyl(0.17, 0.17, 0.07, '#7a5a36', 0, 0, 0, seg=14, r=[PI / 2, 0, 0]), cyl(0.165, 0.165, 0.074, C, 0, 0, 0, seg=14, r=[PI / 2, 0, 0]),
             cyl(0.05, 0.05, 0.076, '#c8202a', 0, 0, 0, seg=10, r=[PI / 2, 0, 0]), box(0.02, 0.2, 0.012, '#2a2420', 0, 0, -0.04)])
part('gear.paddle', 'gear', slot='weapon', items={"paddle": "#b08850"}, tool=True, mount={"j": "handR"}, ground={"p": [0, 0.03, 0], "r": [-PI / 2, 0, 0]},
     shapes=[cyl(0.018, 0.018, 1.0, C, 0, 0.1, 0, seg=6), box(0.05, 0.04, 0.04, C, 0, 0.62, 0), box(0.15, 0.48, 0.02, C, 0, -0.6, 0),
             box(0.13, 0.08, 0.022, '#c8202a', 0, -0.46, 0)])

# ---- the seven people (char.<id>): Woodland regalia, moccasins, warm skin tones, black or greying hair
def char(i, name, body, skin, hair, hairC, shirt, pants, hat=None, gear=None, belt=None, feet=None):
    o = {"body": body, "skin": skin, "hair": hair, "hairColor": hairC, "eyes": "#3a2a1e", "shirt": shirt, "pants": pants, "boots": "#b88a58"}
    if hat: o["hat"] = hat
    if feet: o["feet"] = feet
    if belt: o["belt"] = belt
    d = dict(role='npc', name=name, body='humanoid', build='normal', outfit=o)
    if gear: d['gear'] = gear
    part('char.' + i, 'char', **d)
char('nookomis', 'Nookomis', 'female', '#a8714a', 'bun', '#cfcac2', {"style": "beadvest", "color": "#6a3a5a"}, {"style": "ribbonskirt", "color": "#2a2f5a"})
char('migizi', 'Migizi', 'male', '#9a6440', 'braids', '#141210', {"style": "ribbon", "color": "#2f5f8a"}, {"style": "trousers", "color": "#3a3430"},
     gear={"pack": "bandolier_bag", "weapon": "paddle"})
char('makwa', 'Makwa', 'male', '#8a5a3a', 'long', '#1a1614', {"style": "ribbon", "color": "#8a2a2a"}, {"style": "trousers", "color": "#2f2a26"},
     hat={"style": "otterturban", "color": "#4a3424"})
char('waabigwan', 'Waabigwan', 'female', '#a06a44', 'braids', '#141210', {"style": "jingle", "color": "#2a7a7a"}, {"style": "jingle", "color": "#2a7a7a"},
     hat={"style": "beadband", "color": "#1c1a26"})
char('animikii', 'Animikii', 'male', '#946038', 'braids', '#1a1614', {"style": "ribbon", "color": "#e8e0cc"}, {"style": "trousers", "color": "#2a2f3a"},
     hat={"style": "otterturban", "color": "#3e2c1e"}, gear={"pack": "bandolier_bag", "shield": "hand_drum"})
char('ziigwan', 'Ziigwan', 'female', '#a8704a', 'braids', '#1a1614', {"style": "ribbon", "color": "#7a3a5a"}, {"style": "ribbonskirt", "color": "#24304a"})
char('maiingan', "Ma'iingan", 'male', '#9c6844', 'braids', '#141210', {"style": "ribbon", "color": "#3f6a34"}, {"style": "trousers", "color": "#3a3430"},
     hat={"style": "beadband", "color": "#1c1a26"}, gear={"pack": "bandolier_bag"})
# ---- ricing (2026-10-07): the push pole (gaandakii'iganaak) that moves the canoe through the rice, a long pole with a
# forked foot so it does not sink in the mud; the ricing sticks (bawa'iganaakoog), a light cedar stick in each hand - one bends
# the stalks over the canoe, the other knocks the rice off
part('gear.pushpole', 'gear', slot='weapon', items={"push_pole": "#9a7a50"}, tool=True, mount={"j": "handR", "r": [0.3, 0, 0]},
     shapes=[cyl(0.022, 0.026, 3.4, C, 0, -0.6, 0, seg=6), cone(0.03, 0.18, C + ':0.8', 0.04, -2.36, 0, seg=4, r=[0, 0, 0.35]), cone(0.03, 0.18, C + ':0.8', -0.04, -2.36, 0, seg=4, r=[0, 0, -0.35])])
part('gear.ricesticks', 'gear', slot='weapon', items={"ricing_sticks": "#c8a070"}, tool=True,
     shapes=[dict(cyl(0.014, 0.018, 0.75, C, 0, -0.12, 0.2, seg=6, r=[1.3, 0, 0]), j='handR'), dict(cyl(0.014, 0.018, 0.75, C, 0, -0.12, 0.2, seg=6, r=[1.3, 0, 0]), j='handL')])
# ---- the rice itself, and the gift: a little birch bark basket of dark manoomin; a dried mouse (waawaabiganoojiinh)
part('item.manoomin', 'item', items={"wild_rice": "#3e1c24"},
     shapes=[cyl(0.13, 0.11, 0.1, '#d8c49a', 0, 0.05, 0, seg=8), cyl(0.135, 0.135, 0.02, '#5a3a24', 0, 0.1, 0, seg=8)] +
            [sph(0.03, C, round(math.cos(k * 1.7) * 0.06 * (k % 3) / 2, 3), 0.115 + 0.01 * (k % 2), round(math.sin(k * 1.7) * 0.06 * (k % 3) / 2, 3), 5, 4) for k in range(7)])
part('item.mouse', 'item', items={"dried_mouse": "#8a7866"},
     shapes=[S('sphere', [0.06], C, [0, 0.03, 0], seg=[8, 6], k=[0.8, 0.5, 1.3]), sph(0.035, C + ':0.9', 0, 0.035, 0.085, 6, 5),
             sph(0.018, '#c8a8a0', 0.025, 0.065, 0.075, 5, 4), sph(0.018, '#c8a8a0', -0.025, 0.065, 0.075, 5, 4), sph(0.006, '#1a1410', 0, 0.03, 0.12, 4, 3),
             cyl(0.006, 0.004, 0.16, '#b8a090', 0.03, 0.01, -0.13, seg=4, r=[1.4, 0.4, 0])] +
            [cyl(0.006, 0.006, 0.05, C + ':0.8', sx * 0.04, 0.0, sz * 0.04, seg=4, r=[0, 0, sx * 1.2]) for sx in (-1, 1) for sz in (-1, 1)])
# the elder who sends you ricing, sitting cross-legged in his lodge
char('mishoomis', 'Mishoomis', 'male', '#946038', 'braids', '#cfcac2', {"style": "ribbon", "color": "#3a2a4a"}, {"style": "trousers", "color": "#2a2622"},
     hat={"style": "otterturban", "color": "#4a3424"}, gear={"pack": "bandolier_bag"})
# Ningashi, your mother (the Ziibiing-born's wardrobe): long loose hair, a ribbon dress over a ribbon skirt, moccasins
char('ningashi', 'Ningashi', 'female', '#a06a44', 'loose', '#141210', {"style": "ribbondress", "color": "#2f6a6a"}, {"style": "ribbonskirt", "color": "#5b3a7a"}, feet='moccasins')
# the village's chest: a birch bark makak (models.js chest(), style makak) - it opens the same chest as Ashvale's (2026-10-07)
part('char.makak', 'char', role='npc', name='Ziibiing makak', body='chest', chest={"style": "makak", "size": 1.0})
# two things of sadfrog's Red Pyre that had no look (they showed as the purple placeholder): Vorth's rosary, a loop of
# burnt-orange beads with a pendant; Edric's note, a damp folded scrap
part('item.rosary', 'item', items={"vorth_rosary": "#c4561e"},
     shapes=[sph(0.018, C if k % 4 else '#3a2418', round(math.cos(k / 14 * 2 * PI) * 0.11, 3), 0.02, round(math.sin(k / 14 * 2 * PI) * 0.08, 3), 6, 4) for k in range(14)] +
            [cyl(0.005, 0.005, 0.07, '#3a2418', 0, 0.02, 0.11, seg=4, r=[PI / 2, 0, 0]), box(0.05, 0.012, 0.07, '#d8a050', 0, 0.02, 0.165)])
part('item.note', 'item', items={"edric_note": "#d8ccaa"},
     shapes=[box(0.18, 0.008, 0.13, C, 0, 0.006, 0, r=[0, 0.3, 0]), box(0.17, 0.008, 0.12, C + ':0.9', 0.01, 0.014, 0.005, r=[0.08, 0.32, 0]),
             box(0.12, 0.002, 0.008, '#4a3a2a', 0.0, 0.019, -0.02, r=[0, 0.3, 0]), box(0.1, 0.002, 0.008, '#4a3a2a', 0.0, 0.019, 0.01, r=[0, 0.3, 0])])
# ---- the Ziibiing character creator's everyday wear (homes: offered only by those homes' creators, rules.homes.<h>.creator) (2026-10-08: "not medieval clothing", long hair, a mohawk, braids;
# a man may go bare-chested; men a breechcloth over leggings, women a ribbon or buckskin skirt; moccasins for everyone)
HIDE = '#b8895a'   # tanned deer hide
# long straight hair, loose down the back: the cap, a fall to the shoulders, and a narrower fall behind the shoulder blades
part('cloth.hair_loose', 'cloth', homes=['ziibiing'], slot='hair', style='loose', shapes=[dict(cap, j='head'),
     dict(S('cyl', [0.158, 0.19, 0.36], "$hair", [0, 0.02, -0.005], seg=14, open=True, theta=[0.42, 1.16], ds=True), j='head'),
     dict(S('cyl', [0.19, 0.205, 0.4], "$hair", [0, -0.35, -0.035], seg=12, open=True, theta=[0.7, 0.6], ds=True), j='head')])
# a mohawk: the head shaved bare at the sides, a tall ridge from brow to nape and a long lock down the back
mh = []
for k in range(9):   # the ridge follows the skull from the brow (phi 0.7) over the crown to the nape (phi -1.7)
    phi = 0.7 - k * 0.3
    mh.append(dict(box(0.05, 0.11, 0.075, "$hair", 0, round(0.145 + 0.17 * math.cos(phi), 4), round(-0.008 + 0.17 * math.sin(phi), 4), r=[round(phi, 4), 0, 0]), j='head'))
mh.append(dict(box(0.05, 0.42, 0.035, "$hair", 0, -0.08, -0.19, r=[0.06, 0, 0]), j='head'))   # the long lock down the back
part('cloth.hair_mohawklong', 'cloth', homes=['ziibiing'], slot='hair', style='mohawklong', shapes=mh)
# buckskin shirt: hide-coloured, fringe hanging under each sleeve and across the chest yoke
bk = [dict(cyl("0.176*W*(1+0.16*fem)", "0.2*W*(1+0.18*fem)", 0.2, C, 0, -0.08, 0, seg=9, k=[1, 1, 0.72]), j="hips"),
      box(0.3, 0.025, 0.02, C + ':0.8', 0, 0.38, 0.112, j='torso'), box(0.3, 0.025, 0.02, C + ':0.8', 0, 0.38, -0.112, j='torso')]
for i in range(9):
    x = -0.12 + i * 0.03
    bk += [box(0.008, 0.07, 0.008, C + ':0.9', x, 0.33, 0.118, j='torso'), box(0.008, 0.07, 0.008, C + ':0.9', x, 0.33, -0.118, j='torso')]
for jn, y0, n in (('sh*', -0.05, 5), ('el*', -0.03, 5)):
    for i in range(n):
        bk.append(box(0.04, 0.008, 0.01, C + ':0.9', -0.075, y0 - i * 0.035, 0, j=jn))
part('cloth.shirt_buckskin', 'cloth', homes=['ziibiing'], slot='shirt', style='buckskin', paint={"torso": C, "bust": C, "shoulder": C, "upperArm": C, "lowerArm": C}, shapes=[bust(C)] + bk)
# ribbon dress top: calico with a wide ribbon yoke, elbow sleeves edged in ribbon
rd = [box(0.3, 0.05, 0.02, RIB[0], 0, 0.39, 0.112, j='torso'), box(0.3, 0.05, 0.02, RIB[0], 0, 0.39, -0.112, j='torso'),
      box(0.3, 0.018, 0.022, RIB[1], 0, 0.355, 0.113, j='torso'), box(0.3, 0.018, 0.022, RIB[1], 0, 0.355, -0.113, j='torso'),
      box(0.3, 0.018, 0.022, RIB[2], 0, 0.335, 0.114, j='torso'), box(0.3, 0.018, 0.022, RIB[2], 0, 0.335, -0.114, j='torso'),
      dict(cyl(0.066, 0.066, 0.03, RIB[1], 0, -0.25, 0, seg=8), j='sh*'),
      dict(cyl("0.176*W*(1+0.16*fem)", "0.2*W*(1+0.18*fem)", 0.2, C, 0, -0.08, 0, seg=9, k=[1, 1, 0.72]), j="hips")]
part('cloth.shirt_ribbondress', 'cloth', homes=['ziibiing'], slot='shirt', style='ribbondress', paint={"torso": C, "bust": C, "shoulder": C, "upperArm": C}, shapes=[bust(C)] + rd)
# breechcloth over hide leggings: a cloth flap front and back hanging from the belt, ribbon at the hem, fringe down the leggings
bc = [box(0.36, 0.04, 0.26, '#3a2a1c', 0, 0.02, 0, k=[1, 1, 1], j='hips')]
for z in (0.125, -0.125):
    bc += [box(0.17, 0.46, 0.014, C, 0, -0.2, z, j='hips'), box(0.17, 0.03, 0.016, RIB[1], 0, -0.4, z, j='hips'), box(0.17, 0.02, 0.016, RIB[0], 0, -0.37, z, j='hips')]
for jn, y0 in (('hip*', -0.06), ('knee*', -0.04)):
    for i in range(6):
        bc.append(box(0.035, 0.008, 0.012, HIDE + ':0.85', -0.09, y0 - i * 0.045, 0, j=jn))
part('cloth.pants_breechcloth', 'cloth', homes=['ziibiing'], slot='pants', style='breechcloth', paint={"pelvis": C, "thigh": HIDE, "shin": HIDE}, shapes=bc)
# buckskin skirt: to mid-calf, a band of beadwork above the hem and fringe all round it
sk = [dict(cyl("0.18*W*(1+0.16*fem)", "0.26*W*(1+0.1*fem)", 0.62, C, 0, -0.32, 0, seg=12, k=[1, 1, 0.75]), j="hips"),
      dict(cyl(0.252, 0.256, 0.03, FLOWER[3], 0, -0.52, 0, seg=12, k=[1, 1, 0.75]), j="hips")]
for k in range(24):
    a = k / 24 * 2 * PI
    sk.append(dict(box(0.012, 0.08, 0.006, C + ':0.9', round(math.sin(a) * 0.262, 4), -0.66, round(math.cos(a) * 0.262 * 0.75, 4), r=[0, round(a, 4), 0]), j="hips"))
part('cloth.pants_buckskinskirt', 'cloth', homes=['ziibiing'], slot='pants', style='buckskinskirt', paint={"pelvis": C}, shapes=sk)
# moccasins: soft hide with a rolled cuff at the ankle and a beaded flower on the vamp
mc = [dict(cyl(0.075, 0.07, 0.05, C + ':0.85', 0, -0.33, 0.01, seg=8), j='knee*'), dict(box(0.07, 0.012, 0.07, '#f4f1ea', 0, -0.405, 0.12), j='knee*')]
for k in range(4):
    a = k / 4 * 2 * PI
    mc.append(dict(box(0.016, 0.01, 0.016, FLOWER[0] if k % 2 else FLOWER[4], round(math.cos(a) * 0.02, 4), -0.398, round(0.12 + math.sin(a) * 0.02, 4)), j='knee*'))
part('cloth.boots_moccasins', 'cloth', homes=['ziibiing'], slot='boots', style='moccasins', paint={"foot": C, "toe": C}, shapes=mc)
# ---- THE BOW, THE FIRE AND THE DEER (2026-10-09, handoff/ziibiing_bow_quests_plan.md)
MAPLE, BIRCH, OBS = '#c47c3a', '#ece6d8', '#16161c'
# tomahawk: a hickory haft wrapped in hide near the grip, a dark iron head with its edge forward, a single feather at the butt
part('gear.tomahawk', 'gear', slot='weapon', items=["tomahawk"], attack='slash', tool=True, mount={"j": "handR", "r": [2.1, 0, 0]},
     ground={"p": [0.15, 0.04, 0], "r": [0, 0.5, PI / 2]},
     shapes=[box(0.034, 0.56, 0.034, '#7a5a3a', 0, 0.14, 0), box(0.042, 0.12, 0.042, '#5a3a24', 0, -0.06, 0),
             box(0.03, 0.09, 0.16, '#45454c', 0, 0.38, 0.07), box(0.032, 0.13, 0.025, '#5a5a62', 0, 0.38, 0.155),
             box(0.012, 0.1, 0.03, '#f4f1ea', 0, -0.17, 0, r=[0.3, 0, 0]), box(0.013, 0.04, 0.032, '#1a1614', 0, -0.21, 0.01, r=[0.3, 0, 0])])
# mitigwaab (a bow): maple, longer than the town's shortbows, the grip wrapped in red wool, a beaded band at each limb
bl = 0.56
part('gear.mitigwaab', 'gear', slot='weapon', items=["mitigwaab"], attack='bow', twoHanded=True, mount={"j": "handL"},
     carry={"elL": [-1.25], "shL": [-0.15, 0, 0.05]}, ground={"p": [0, 0.06, 0], "r": [0, 0, PI / 2]},
     shapes=[dict(t='tube', s=[0.024], c=MAPLE, pts=[[0, 0.05, -bl], [0, -0.28, 0], [0, 0.05, bl]]),
             box(0.052, 0.052, 0.13, '#a8202a', 0, -0.11, 0), box(0.04, 0.04, 0.03, RIB[1], 0, -0.02, -0.32), box(0.04, 0.04, 0.03, RIB[2], 0, -0.02, 0.32),
             dict(box(0.008, 0.008, bl * 2, '#e8e0cc', 0, 0.05, 0), shadow=False), dict(t='group', p=[0, 0.05, 0], name='tip')])
# bikwak (arrows): a hide quiver with a fringe, birch shafts fletched with turkey feathers; the heads take the arrow's own colour
qv = [cyl(0.055, 0.045, 0.42, '#9a7448', seg=7), cyl(0.058, 0.058, 0.03, RIB[0], 0, 0.15, 0, seg=7)]
for i, xo in enumerate((-0.025, -0.008, 0.009, 0.026)):
    qv += [box(0.012, 0.13, 0.012, BIRCH, xo, 0.26, (i % 2) * 0.01), box(0.03, 0.04, 0.008, '#6a4a2a' if i % 2 else '#e8e0cc', xo, 0.31, 0)]
for k in range(5): qv.append(box(0.01, 0.07, 0.006, '#7a5a3a', -0.05 + k * 0.025, -0.22, 0.045))
arrow = [box(0.014, 0.014, 0.42, BIRCH), dict(cone(0.022, 0.06, "$c", 0, 0, 0.24, seg=4), r=[PI / 2, 0, 0]),
         box(0.004, 0.04, 0.08, '#e8e0cc', 0, 0.012, -0.18), box(0.04, 0.004, 0.08, '#6a4a2a', 0, 0, -0.18)]
part('gear.bikwak', 'gear', slot='ammo', items={"birch_arrows": BIRCH, "obsidian_arrows": OBS}, mount={"j": "torso", "p": [0.1, 0.32, -0.15], "r": [0, 0, -0.35]},
     shapes=qv, groundShapes=[dict(t='group', p=[-0.035 + k * 0.035, 0.02, 0], r=[-PI / 2, 0, -0.18 + k * 0.18], children=arrow) for k in range(3)], projectile=arrow)
# biiwaanag (flint): a pale chalky nodule broken open on a grey-black glassy face; obsidian: a black glassy lump, sharp-edged
part('item.flint', 'item', items={"flint": '#3a3a40'}, shapes=[S('ico', [0.1], '#d8d2c2', [0, 0.08, 0]), S('ico', [0.075], "$c", [0.05, 0.1, 0.04]), S('ico', [0.04], '#cfc8b6', [-0.07, 0.06, 0.02])])
# the nagwaagan (snare): a loop of sinew cord on a bent stick, as it lies in the bag or on the ground (2026-10-09)
# asemaa (tobacco): a little red cloth bundle tied at the neck, a few dry leaves beside it (2026-10-09)
part('item.asemaa', 'item', items={"asemaa": '#b03028'}, shapes=[S('sphere', [0.07], "$c", [0, 0.07, 0], k=[1, 0.85, 1]), S('cone', [0.045, 0.06], "$c", [0, 0.15, 0]),
     S('cyl', [0.03, 0.03, 0.012], '#e8d8a0', [0, 0.12, 0]), S('box', [0.09, 0.006, 0.05], '#7a5a2a', [0.1, 0.01, 0.02], r=[0, 0.5, 0]), S('box', [0.07, 0.006, 0.04], '#8a6a34', [-0.09, 0.01, -0.03], r=[0, -0.4, 0])])
# miskwaabiimizh (red willow) bark: a few curled red strips (2026-10-09)
part('item.willowbark', 'item', items={"willow_bark": '#a8322a'}, shapes=[S('box', [0.2, 0.012, 0.035], "$c", [0, 0.02, 0], r=[0, 0.3, 0.1]),
     S('box', [0.18, 0.012, 0.03], '#8a2a22', [0.01, 0.035, 0.04], r=[0, -0.4, -0.1]), S('box', [0.16, 0.012, 0.03], '#c04a38', [-0.02, 0.05, -0.03], r=[0, 0.9, 0.05])])
part('item.snare', 'item', items={"snare": '#d8c8a0'}, shapes=[S('cyl', [0.018, 0.026, 0.62], '#6a4a2a', [-0.12, 0.29, 0], r=[0, 0, 0.32]),   # the bent sapling
     S('cyl', [0.012, 0.016, 0.22], '#6a4a2a', [0.02, 0.56, 0], r=[0, 0, 1.25]),                                        # its tip, bent over
     S('cyl', [0.005, 0.005, 0.26], "$c", [0.1, 0.42, 0]),                                                              # the cord
     S('torus', [0.11, 0.011], "$c", [0.1, 0.18, 0], r=[0, 1.5708, 0], seg=[4, 14]),                                    # the noose across the run
     S('cyl', [0.03, 0.03, 0.05], '#5a4028', [-0.2, 0.02, 0])])
part('item.obsidian', 'item', items={"obsidian": OBS}, shapes=[S('ico', [0.11], "$c", [0, 0.09, 0]), S('ico', [0.06], '#2a2a36', [0.07, 0.12, 0.04]), S('ico', [0.045], '#0e0e12', [-0.06, 0.07, -0.05])])
# birch logs: white bark, a few dark lenticels
bg = []
for k, (x, y) in enumerate(((-0.07, 0.06), (0.0, 0.06), (0.035, 0.16))):
    bg.append(dict(cyl(0.06, 0.06, 0.5, "$c", x, y, 0, seg=7), r=[PI / 2, 0, 0]))
    for m in range(3): bg.append(box(0.03, 0.008, 0.01, '#2a2622', x, y + 0.058, -0.15 + m * 0.14))
part('item.birchlogs', 'item', items={"birch_logs": BIRCH}, shapes=bg)
# Mitigwaabiike ("he makes bows"), the bow maker: a buckskin shirt, a quiver on his back, his own bow in his hand
char('mitigwaabiike', 'Mitigwaabiike', 'male', '#9a6440', 'mohawklong', '#141210', {"style": "buckskin", "color": "#a88058"}, {"style": "breechcloth", "color": "#2a2f5a"},
     gear={"weapon": "mitigwaab", "ammo": "birch_arrows"}, feet='moccasins')
print('wrote the Ziibiing parts')
