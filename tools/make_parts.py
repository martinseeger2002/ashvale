"""make_parts.py - writes data/parts/*.json: every character, gear type, clothing piece and ground item of ASHVALE 3D as its
own small DATA file (2026-10-01: "Are each one of the characters going to be an individual file and their weaponry is
an individual file and the clothes is an individual file?"). No code in a part: shapes are JSON primitives that src/models.js
assembles, so anyone can inscribe a new hat, sword or villager and no part can ever run code inside the game.

PART FORMAT (see also DESIGN.md "Parts"):
  {"ashvale3d": "part", "api": 1, "id": "gear.sword", "kind": "body|gear|cloth|item|char|palette", ...}
  shapes: [{"t": type, "j": joint, "s": [sizes], "p": [x,y,z], "r": [rx,ry,rz], "k": [sx,sy,sz], "c": colour, ...}]
    t: box [w,h,d] | cyl [rTop,rBottom,h] (+"seg", "open", "theta":[start,len]) | cone [r,h] | sphere [r] (+"seg":[w,h],
       "th": fraction of pi) | ico [r] (+"d") | capsule [r,len] | tube [r] + "pts" (3 points, bezier) | kite [scale, depth] |
       torus [r, tube] (+"arc") | disc [r] | group (+"children")
    numbers may be expressions in t (tier), W (build width), small, big: e.g. "0.5+0.03*t"
    "if": an expression; the shape exists only when true (e.g. "t>=3")
    c: "#rrggbb" | "$tier" | "$c" (the piece's own colour) | "$skin" | "$hair" | "$beard" | "$eyes" | "$brow" | "$gold" |
       "$leather" | "$dark" | "$string" | "$metal1".. | any of those + ":0.7" to darken (or ":1.2" to lighten)
    "glow": true (emissive), "op": opacity, "ds": double-sided, "name": "tip" (muzzle point), "tag": "hairCap"
    j: a joint of the body; "sh*" / "el*" / "hand*" / "hip*" / "knee*" mirror onto both sides (x flipped on the left)
  gear: slot, family (metal|wood|cloth), items ("sword_t{t}"), tiers, mount {j,p,r}, twoHanded, carry (pose), ground {p,r}
        or groundShapes, hides [tags]
  cloth: slot (hair|beard|hat|shirt|pants|boots|gloves|belt|cape|apron), style, paint {segment: colour}, shapes, tags,
         unless (tag), hides [tags], items {itemId: colour} for wearable versions (hats, capes)
  char: kind humanoid {build, outfit, gear} | beast {size, color, ...}
  body: joints {name: [parent, [x,y,z]]}, segments [named shapes, repainted by clothing]
Run: python3 tools/make_parts.py   (writes data/parts/ and prints sizes)"""
import json, os, math
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(HERE, 'data', 'parts')
PI = math.pi
parts = {}


def part(pid, kind, **kw):
    d = {"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": kind}; d.update(kw); parts[pid] = d; return d


def S(t, s, c, p=None, j=None, **kw):
    d = {"t": t, "s": s, "c": c}
    if p is not None and any(v != 0 for v in p): d["p"] = p
    if j: d["j"] = j
    d.update(kw); return d


box = lambda w, h, d, c, x=0, y=0, z=0, **kw: S('box', [w, h, d], c, [x, y, z], **kw)
cyl = lambda rt, rb, h, c, x=0, y=0, z=0, seg=7, **kw: S('cyl', [rt, rb, h], c, [x, y, z], seg=seg, **kw)
cone = lambda rad, h, c, x=0, y=0, z=0, seg=6, **kw: S('cone', [rad, h], c, [x, y, z], seg=seg, **kw)
sph = lambda rad, c, x=0, y=0, z=0, ws=10, hs=7, th=1, **kw: S('sphere', [rad], c, [x, y, z], seg=[ws, hs], **({"th": th} if th != 1 else {}), **kw)
ico = lambda rad, c, x=0, y=0, z=0, d=0, **kw: S('ico', [rad], c, [x, y, z], **({"d": d} if d else {}), **kw)
cap = lambda rad, ln, c, x=0, y=0, z=0, **kw: S('capsule', [rad, ln], c, [x, y, z], **kw)
ring = lambda rad, h, c, x=0, y=0, z=0, **kw: cyl(rad, rad, h, c, x, y, z, seg=10, **kw)

# ---------------------------------------------------------------- palette (tier colours, named colours, creator palette)
part('palette', 'palette',
     tiers={"metal": [None, "#b8763c", "#6f7076", "#aab0ba", "#41548e", "#3e7a4c"],
            "wood": [None, "#9b6d3d", "#b9a062", "#c47c3a", "#6f3d1f", "#3f2d47"],
            "cloth": [None, "#ddd4bb", "#8e6d4a", "#b83c3c", "#4658c6", "#e9c33f"]},
     named={"gold": "#d9a930", "leather": "#6b4a2b", "dark": "#1c1a1e", "string": "#e8e2d0", "wood": "#7a5530"},
     creator={"skin": ["#f1c9a5", "#e0ac85", "#c98e64", "#a86f48", "#7c4f31", "#5a3822"],
              "hair": ["#1c1612", "#4a3020", "#8a5a2a", "#c89a50", "#e8d8a8", "#9a3020", "#c8c8cc", "#3a3a6a"],
              "cloth": ["#4f6d3a", "#3f5d8a", "#8a3030", "#5b3a7a", "#c8a040", "#d8d0bc", "#3a3430", "#8a6a4a", "#2f6a6a", "#c86a2a"]},
     defaultOutfit={"body": "male", "skin": "#e0ac85", "hair": "short", "hairColor": "#4a3020", "beard": None, "eyes": "#3a5a8a", "hat": None,
                    "shirt": {"style": "tunic", "color": "#4f6d3a"}, "pants": {"style": "trousers", "color": "#5a4630"},
                    "boots": "#3a2a1c", "gloves": None, "belt": "#3a2a1c", "cape": None, "apron": None})

# ---------------------------------------------------------------- the human body (joints + paintable segments + face)
part('body.human', 'body',
     joints={"body": [None, [0, 0, 0]], "hips": ["body", [0, 0.98, 0]], "torso": ["hips", [0, 0, 0]], "neck": ["torso", [0, 0.5, 0]],
             "head": ["neck", [0, 0.07, 0]], "shR": ["torso", ["-0.24*W*(1-0.15*fem)", 0.44, 0]], "shL": ["torso", ["0.24*W*(1-0.15*fem)", 0.44, 0]],
             "elR": ["shR", [0, -0.29, 0]], "elL": ["shL", [0, -0.29, 0]], "handR": ["elR", [0, -0.28, 0]], "handL": ["elL", [0, -0.28, 0]],
             "hipR": ["hips", ["-0.1*W*(1+0.14*fem)", -0.06, 0]], "hipL": ["hips", ["0.1*W*(1+0.14*fem)", -0.06, 0]], "kneeR": ["hipR", [0, -0.42, 0]], "kneeL": ["hipL", [0, -0.42, 0]],
             "cape": ["torso", [0, 0.47, -0.13]]},
     headScale="small ? 1.25 : 1", rootScale="(small ? 0.7 : big ? 1.08 : 1)*(1-0.04*fem)", height=1.86,
     segments=[
         dict(cyl("0.205*W*(1-0.2*fem)", "0.168*W*(1-0.08*fem)", 0.5, "$skin", 0, 0.25, 0, seg=9, k=[1, 1, 0.62]), name="torso", j="torso"),
         dict(sph(0.062, "$skin", 0.06, 0.335, 0.058, 10, 8, k=[1.05, 0.82, 0.62], mirror=True, **{"if": "fem"}), name="bust", j="torso"),
         dict(sph(0.06, "$skin", 0, 0.53, 0, 8, 6), name="neck", j="torso"),
         dict(cyl("0.17*W*(1+0.14*fem)", "0.16*W*(1+0.22*fem)", 0.16, "#5a4630", 0, -0.03, 0, seg=9, k=[1, 1, 0.7]), name="pelvis", j="hips"),
         dict(sph(0.075, "$skin", 0, 0, 0, 8, 6), name="shoulder", j="sh*"),
         dict(cap(0.06, 0.19, "$skin", 0, -0.145, 0), name="upperArm", j="sh*"),
         dict(cap(0.053, 0.18, "$skin", 0, -0.13, 0), name="lowerArm", j="el*"),
         dict(sph(0.052, "$skin", 0, -0.02, 0.005, 8, 6, k=[0.9, 1.15, 1]), name="hand", j="hand*"),
         dict(cap("0.083*W", 0.25, "$skin", 0, -0.2, 0), name="thigh", j="hip*"),
         dict(cap("0.068*W", 0.26, "$skin", 0, -0.19, 0), name="shin", j="knee*"),
         dict(box(0.13, 0.11, 0.2, "#3a2a1c", 0, -0.39, 0.03), name="foot", j="knee*"),
         dict(box(0.12, 0.05, 0.08, "#3a2a1c", 0, -0.43, 0.12), name="toe", j="knee*"),
     ],
     face=[
         sph(0.145, "$skin", 0, 0.14, 0, 14, 10, k=[0.92, 1.06, 1]),
         sph(0.104, "$skin", 0, 0.075, 0.018, 14, 10, k=[0.9, 0.72, 0.96], **{"if": "!fem"}),
         sph(0.1, "$skin", 0, 0.08, 0.016, 20, 14, k=[0.8, 0.66, 0.92], **{"if": "fem"}),
         box(0.032, 0.062, 0.045, "$skin:0.94", 0, 0.115, 0.14, r=[-0.25, 0, 0], **{"if": "!skull"}),
         box(0.05, 0.035, 0.02, "#120c10", 0.048, 0.152, 0.13, mirror=True, **{"if": "skull"}),
         box(0.024, 0.03, 0.02, "#120c10", 0, 0.11, 0.14, **{"if": "skull"}),
         box(0.075, 0.018, 0.012, "#efe8d6", 0, 0.068, 0.13, **{"if": "skull"}),
         box(0.075, 0.003, 0.014, "#3a2a24", 0, 0.068, 0.131, **{"if": "skull"}),
         box(0.044, 0.024, 0.01, "#f4f0ea", 0.048, 0.15, 0.131, mirror=True, **{"if": "!skull"}),
         box(0.02, 0.022, 0.012, "$eyes", 0.046, 0.15, 0.135, mirror=True, **{"if": "!skull"}),
         box(0.056, "0.013*(1-0.35*fem)", 0.016, "$brow", 0.05, 0.178, 0.129, mirror=True, **{"if": "!skull"}),
         box(0.05, 0.006, 0.012, "#2a1c18", 0.048, 0.163, 0.136, mirror=True, **{"if": "fem"}),
         sph(0.034, "$skin", 0.133, 0.125, 0, 7, 5, k=[0.45, 1, 0.75], mirror=True, **{"if": "!skull"}),
         cone(0.03, 0.14, "$skin", 0.17, 0.17, -0.01, seg=4, r=[0, 0, -1.1], mirror=True, **{"if": "small || goblin"}),
         box(0.06, 0.012, 0.01, "$skin:0.7", 0, 0.065, 0.128, **{"if": "!fem && !skull"}),
         box(0.058, 0.016, 0.012, "#b0605a", 0, 0.066, 0.128, **{"if": "fem"}),
     ])

# ---------------------------------------------------------------- clothing (one file per piece)
hair_cap = sph(0.153, "$hair", 0, 0.145, -0.008, 12, 6, 0.5, r=[-0.32, 0, 0], k=[0.95, 1.08, 1.04], tag="hairCap")
part('cloth.hair_short', 'cloth', slot='hair', style='short', shapes=[dict(hair_cap, j="head")])
part('cloth.hair_long', 'cloth', slot='hair', style='long', shapes=[dict(hair_cap, j="head"),
     dict(S('cyl', [0.158, 0.17, 0.34], "$hair", [0, 0.03, -0.005], seg=12, open=True, theta=[0.42, 1.16], ds=True), j="head")])
part('cloth.hair_ponytail', 'cloth', slot='hair', style='ponytail', shapes=[dict(hair_cap, j="head"), dict(cap(0.04, 0.2, "$hair", 0, 0.02, -0.17, r=[0.3, 0, 0]), j="head")])
part('cloth.hair_bun', 'cloth', slot='hair', style='bun', shapes=[dict(hair_cap, j="head"), dict(sph(0.06, "$hair", 0, 0.24, -0.11, 8, 6), j="head")])
part('cloth.hair_mohawk', 'cloth', slot='hair', style='mohawk', shapes=[dict(box(0.04, 0.09, 0.3, "$hair", 0, 0.29, -0.02), j="head")])
part('cloth.hair_curly', 'cloth', slot='hair', style='curly', shapes=[dict(hair_cap, j="head")] + [
     dict(sph(0.05, "$hair", round(math.sin(-1.4 + i * 0.47) * 0.13, 4), round(0.23 + 0.03 * math.cos(-1.4 + i * 0.47), 4), round(math.cos(-1.4 + i * 0.47) * 0.1 - 0.04, 4), 6, 5), j="head") for i in range(7)])
part('cloth.hair_bald', 'cloth', slot='hair', style='bald', shapes=[])
part('cloth.beard_full', 'cloth', slot='beard', style='full', shapes=[dict(sph(0.118, "$beard", 0, 0.04, 0.035, 10, 7, k=[1, 0.86, 0.9]), j="head"),
     dict(box(0.1, 0.02, 0.02, "$beard", 0, 0.083, 0.13), j="head"), dict(box(0.05, 0.012, 0.012, "$skin:0.6", 0, 0.064, 0.137), j="head")])
part('cloth.beard_goatee', 'cloth', slot='beard', style='goatee', shapes=[dict(box(0.05, 0.07, 0.04, "$beard", 0, 0.02, 0.11), j="head")])
part('cloth.beard_moustache', 'cloth', slot='beard', style='moustache', shapes=[dict(box(0.1, 0.022, 0.02, "$beard", 0, 0.083, 0.132), j="head")])
part('cloth.beard_stubble', 'cloth', slot='beard', style='stubble', shapes=[dict(sph(0.114, "$skin:0.8", 0, 0.058, 0.026, 10, 7, k=[0.97, 0.8, 1.01]), j="head")])
HATS = {
    'cap': ("#8a3030", [dict(sph(0.16, "$c", 0, 0.16, -0.005, 12, 6, 0.5, k=[1, 0.85, 1])), box(0.2, 0.02, 0.12, "$c:0.85", 0, 0.17, 0.16)], []),
    'wizard': ("#3f5d8a", [cyl(0.24, 0.24, 0.02, "$c:0.85", 0, 0.22, 0, seg=12), cone(0.15, 0.38, "$c", 0, 0.42, -0.02, seg=10, r=[-0.12, 0, 0]), ring(0.152, 0.04, "$gold", 0, 0.25, 0)], ["hairCap"]),
    'hood': ("#4f6d3a", [sph(0.175, "$c", 0, 0.14, -0.015, 12, 8, 0.62, r=[-0.5, 0, 0]), box(0.3, 0.34, 0.05, "$c", 0, 0, -0.15)], ["hairCap"]),
    # Same dome as the hood, but the drape behind it stays inside the head's own silhouette. The stock hood's 0.3 x 0.34 panel is
    # lost on an opaque body and turns into a plank the moment a char makes the body see-through, so the wraith wears this.
    'shroud': ("#c6d6e4", [sph(0.178, "$c", 0, 0.145, -0.018, 12, 8, 0.64, r=[-0.52, 0, 0]), box(0.17, 0.2, 0.04, "$c", 0, -0.05, -0.125)], ["hairCap"]),
    'feather': ("#2f6a6a", [sph(0.16, "$c", 0, 0.16, -0.005, 12, 6, 0.5, k=[1, 0.8, 1]), ring(0.19, 0.02, "$c:0.85", 0, 0.17, 0), box(0.015, 0.22, 0.05, "#e84040", 0.12, 0.3, -0.06, r=[0, 0, -0.4])], []),
    'bandana': ("#c86a2a", [sph(0.158, "$c", 0, 0.15, -0.01, 12, 6, 0.45, r=[-0.25, 0, 0]), box(0.05, 0.1, 0.03, "$c", 0.03, 0.12, -0.16)], []),
    'crown': ("#d9a930", [ring(0.15, 0.06, "$gold", 0, 0.27, 0)] + [cone(0.025, 0.07, "$gold", round(math.sin(i / 6 * 2 * PI) * 0.145, 4), 0.33, round(math.cos(i / 6 * 2 * PI) * 0.145, 4), seg=4) for i in range(6)], ["hairCap"]),
    # the three head pieces of Elder Maren's quest (task 5): a shaman's bone-and-feather headdress, the black shard of
    # the ashen crown the goblin chief wears, and the rest of that crown on the lich. A shard of dark glass that is only
    # slightly alight: a near-black body with a thin glowing edge, so it reads as a dark knob with one lit seam.
    'bonewrap': ("#ded6bc", [ring(0.158, 0.045, "$leather", 0, 0.2, -0.005), sph(0.158, "$c", 0, 0.19, -0.01, 10, 5, 0.42, k=[1, 0.78, 1])]
                 + [cone(0.016, 0.115, "$c", round(math.sin(a) * 0.135, 4), 0.29, round(math.cos(a) * 0.135 - 0.02, 4), seg=4, r=[-0.45, 0, math.sin(a) * 0.3]) for a in (-0.75, -0.25, 0.25, 0.75)]
                 + [box(0.05, 0.19, 0.01, "#7c6c4e", 0.1, 0.24, -0.12, r=[-0.8, 0, -0.6], mirror=True),
                    box(0.042, 0.16, 0.01, "#96885f", 0.075, 0.22, -0.17, r=[-1.0, 0, -0.42], mirror=True)], ["hairCap"]),
    # A thinner band - at 0.045 it read as a blindfold from the front - and the shard leaned back, so it is a plume and not a mohawk.
    'ashshard': ("#1b1524", [ring(0.158, 0.033, "#120e18", 0, 0.193, -0.005), ico(0.072, "$c", 0, 0.305, 0, k=[0.8, 1.7, 0.6], r=[-0.36, 0, 0.26]),
                              box(0.014, 0.15, 0.014, "#6b3fa0", 0, 0.31, 0.045, r=[-0.36, 0, 0.26], glow=True),
                              ico(0.024, "$c:1.6", -0.093, 0.2, 0.12, glow=True)], ["hairCap"]),
    'ashcrown': ("#241c30", [ring(0.152, 0.055, "$c", 0, 0.265, 0)]
                 + [cone(0.022, 0.13, "$c", round(math.sin(a) * 0.146, 4), 0.335, round(math.cos(a) * 0.146, 4), seg=4, r=[0, 0, math.sin(a) * 0.18]) for a in [i / 6 * 2 * PI for i in range(6)]]
                 + [ico(0.028, "#7a3fd0", 0, 0.3, 0.135, glow=True), box(0.16, 0.014, 0.014, "$c:1.5", 0, 0.295, 0.05)], ["hairCap"]),
}
for st, (col, shapes, hides) in HATS.items():
    part('cloth.hat_' + st, 'cloth', slot='hat', style=st, color=col, hides=hides, items={"hat_" + st: col},
         shapes=[dict(s, j="head") for s in shapes], ground={"p": [0, -0.1, 0]})
# the Big Chief Headdress (2026-10-06): a one-of-one war bonnet - headband, a crown of feathers from the forehead round
# both sides (open at the back), rosettes and drops at the temples, a trailer of feathers down the back angled downward
def _bigchief():
    R4 = lambda v: round(v, 4)
    def _bx(w, h, d, c, p=(0, 0, 0), r=None): s = {"t": "box", "s": [w, h, d], "c": c, "p": [R4(x) for x in p]}; return dict(s, r=[R4(x) for x in r]) if r else s
    def _cy(rt, rb, h, c, p=(0, 0, 0), seg=8, r=None): s = {"t": "cyl", "s": [rt, rb, h], "c": c, "p": [R4(x) for x in p], "seg": seg}; return dict(s, r=[R4(x) for x in r]) if r else s
    def _gp(children, p=(0, 0, 0), r=(0, 0, 0)): return {"t": "group", "p": [R4(x) for x in p], "r": [R4(x) for x in r], "children": children}
    WHITE, BLACK, RED, BLUE, YELLOW, WRAP = '#f2ede2', '#1d1a1c', '#a83224', '#2f5ea8', '#e3b33b', '#b8342a'
    BAND_Y, BAND_R = 0.215, 0.158
    def feather(length, lean):
        """one feather along +y from its base, leaning outward (toward local +z) by `lean` radians"""
        L = length
        kids = [_cy(0.011, 0.013, 0.05, WRAP, (0, 0.025, 0), seg=6),                     # the quill's red wrap
                _bx(0.008, L, 0.008, WHITE, (0, L / 2, 0)),                            # the shaft
                _bx(0.066, L * 0.8, 0.005, WHITE, (0, L * 0.56, 0.004)),                # the vane
                _bx(0.068, L * 0.22, 0.006, BLACK, (0, L * 0.85, 0.005)),                # the black tip
                _bx(0.018, 0.035, 0.004, WHITE, (0, L + 0.012, 0.004))]                 # a white plume at the very top
        return _gp(kids, (0, 0, BAND_R), (lean, 0, 0))
    shapes = []
    # the headband, with a beaded strip across the forehead
    shapes.append(_cy(BAND_R + 0.006, BAND_R + 0.006, 0.05, RED, (0, BAND_Y, 0), seg=14))
    for i in range(9):
        a = math.radians(-48 + i * 12); col = [WHITE, BLUE, YELLOW][i % 3]
        shapes.append(_bx(0.022, 0.03, 0.006, col, (math.sin(a) * (BAND_R + 0.01), BAND_Y, math.cos(a) * (BAND_R + 0.01)), (0, a, 0)))
    # the crown of feathers: from the temples round the back, rising and leaning out, the whole crown swept back
    crown = []
    N = 20
    for i in range(N):
        th = math.radians(-125 + 250 * i / (N - 1))             # the operator: the opening is at the BACK - from the forehead round both sides
        crown.append(_gp([feather(0.38 + 0.05 * math.cos(th), 0.62)], (0, 0, 0), (0, th, 0)))   # the front ones a little taller
    shapes.append(_gp(crown, (0, BAND_Y - 0.01, -0.01), (-0.30, 0, 0)))
    # the trailer: a red strip from the back of the band down past the waist, a feather pair every 9 cm pointing out to the sides and back
    TR = [_bx(0.075, 0.95, 0.014, RED, (0, -0.475, 0))]
    for k in range(10):
        y = -0.05 - k * 0.092
        for sx in (1, -1):
            TR.append(_gp([_bx(0.006, 0.2, 0.006, WHITE, (0, 0.1, 0)), _bx(0.045, 0.16, 0.005, WHITE, (0, 0.11, 0)), _bx(0.047, 0.045, 0.006, BLACK, (0, 0.18, 0))],
                          (sx * 0.03, y, -0.004), (0.35, 0, sx * -(math.pi - 0.9))))   # the operator: angled DOWN, out to the sides
    shapes.append(_gp(TR, (0, BAND_Y, -BAND_R - 0.01), (0.12, 0, 0)))
    # beaded rosettes at the temples, and white drops hanging from them
    for sx in (1, -1):
        x = sx * (BAND_R + 0.012)
        shapes.append(_cy(0.032, 0.032, 0.01, YELLOW, (x, BAND_Y - 0.005, 0.05), seg=10, r=(0, 0, math.pi / 2)))
        shapes.append(_cy(0.02, 0.02, 0.012, RED, (x + sx * 0.003, BAND_Y - 0.005, 0.05), seg=10, r=(0, 0, math.pi / 2)))
        for k in range(2):
            shapes.append(_bx(0.016, 0.16, 0.016, WHITE, (x + sx * 0.004, BAND_Y - 0.1 - k * 0.01, 0.03 - k * 0.03)))
            shapes.append(_bx(0.018, 0.03, 0.018, BLACK, (x + sx * 0.004, BAND_Y - 0.19 - k * 0.01, 0.03 - k * 0.03)))
    return shapes
part('cloth.hat_bigchief', 'cloth', slot='hat', style='bigchief', color='#a83224', hides=['hairCap'], items={'hat_bigchief': '#a83224'},
     shapes=[dict(sh, j='head') for sh in _bigchief()], ground={'p': [0, -0.1, 0]})
# the Feather Headband (2026-10-06): the headdress's beaded band and one feather standing at the back; a collection of 20
def _featherband():
    R4 = lambda v: round(v, 4)
    def _bx(w, h, d, c, p=(0, 0, 0), r=None): s = {"t": "box", "s": [w, h, d], "c": c, "p": [R4(x) for x in p]}; return dict(s, r=[R4(x) for x in r]) if r else s
    def _cy(rt, rb, h, c, p=(0, 0, 0), seg=8, r=None): s = {"t": "cyl", "s": [rt, rb, h], "c": c, "p": [R4(x) for x in p], "seg": seg}; return dict(s, r=[R4(x) for x in r]) if r else s
    def _gp(children, p=(0, 0, 0), r=(0, 0, 0)): return {"t": "group", "p": [R4(x) for x in p], "r": [R4(x) for x in r], "children": children}
    WHITE, BLACK, RED, BLUE, YELLOW, WRAP = '#f2ede2', '#1d1a1c', '#a83224', '#2f5ea8', '#e3b33b', '#b8342a'
    BAND_Y, BAND_R = 0.2, 0.158
    shapes = [_cy(BAND_R + 0.006, BAND_R + 0.006, 0.045, RED, (0, BAND_Y, 0), seg=14)]
    for i in range(24):   # beads all round the band
        a = math.radians(i * 15); col = [WHITE, BLUE, YELLOW][i % 3]
        shapes.append(_bx(0.02, 0.026, 0.006, col, (math.sin(a) * (BAND_R + 0.009), BAND_Y, math.cos(a) * (BAND_R + 0.009)), (0, a, 0)))
    L = 0.36   # the feather: tucked into the band at the back, standing up, leaning back and a little to one side
    feather = [_cy(0.011, 0.013, 0.05, WRAP, (0, 0.025, 0), seg=6), _bx(0.008, L, 0.008, WHITE, (0, L / 2, 0)),
               _bx(0.066, L * 0.8, 0.005, WHITE, (0, L * 0.56, 0.004)), _bx(0.068, L * 0.22, 0.006, BLACK, (0, L * 0.85, 0.005)),
               _bx(0.018, 0.035, 0.004, WHITE, (0, L + 0.012, 0.004))]
    shapes.append(_gp(feather, (0.03, BAND_Y - 0.01, -BAND_R - 0.004), (-0.32, 0, -0.18)))
    return shapes
part('cloth.hat_featherband', 'cloth', slot='hat', style='featherband', color='#a83224', hides=[], items={'hat_featherband': '#a83224'},
     shapes=[dict(sh, j='head') for sh in _featherband()], ground={'p': [0, -0.1, 0]})
C = "$c"
part('cloth.shirt_tunic', 'cloth', slot='shirt', style='tunic', paint={"torso": C, "bust": C, "shoulder": C, "upperArm": C},
     shapes=[dict(cyl("0.176*W*(1+0.16*fem)", "0.2*W*(1+0.18*fem)", 0.2, C, 0, -0.08, 0, seg=9, k=[1, 1, 0.72]), j="hips")])
part('cloth.shirt_shirt', 'cloth', slot='shirt', style='shirt', paint={"torso": C, "bust": C, "shoulder": C, "upperArm": C, "lowerArm": C})
part('cloth.shirt_vest', 'cloth', slot='shirt', style='vest', paint={"torso": C, "bust": C}, shapes=[dict(box(0.07, 0.3, 0.02, "$skin", 0, 0.36, 0.105), j="torso")])
part('cloth.shirt_robe', 'cloth', slot='shirt', style='robe', tags=["robeTop"], paint={"torso": C, "bust": C, "shoulder": C, "upperArm": C, "lowerArm": C},
     shapes=[dict(cyl(0.07, 0.085, 0.12, C, 0, -0.2, 0, seg=8), j="el*"), dict(cyl("0.18*W*(1+0.16*fem)", "0.26*W*(1+0.1*fem)", 0.78, C, 0, -0.4, 0, seg=10, k=[1, 1, 0.75]), j="hips")])
part('cloth.pants_trousers', 'cloth', slot='pants', style='trousers', paint={"pelvis": C, "thigh": C, "shin": C})
part('cloth.pants_shorts', 'cloth', slot='pants', style='shorts', paint={"pelvis": C, "thigh": C})
part('cloth.pants_skirt', 'cloth', slot='pants', style='skirt', paint={"pelvis": C}, shapes=[dict(cyl("0.18*W*(1+0.16*fem)", "0.25*W*(1+0.1*fem)", 0.42, C, 0, -0.22, 0, seg=10, k=[1, 1, 0.75]), j="hips")])
part('cloth.pants_robe', 'cloth', slot='pants', style='robe', paint={"pelvis": C, "thigh": C, "shin": C}, shapes=[dict(cyl("0.18*W*(1+0.16*fem)", "0.26*W*(1+0.1*fem)", 0.78, C, 0, -0.4, 0, seg=10, k=[1, 1, 0.75]), j="hips")])
part('cloth.boots', 'cloth', slot='boots', style='boots', paint={"foot": C, "toe": C})
part('cloth.gloves', 'cloth', slot='gloves', style='gloves', paint={"hand": C})
part('cloth.belt', 'cloth', slot='belt', style='belt', unless="robeTop", shapes=[dict(ring("0.172*W", 0.06, C, 0, 0.03, 0, k=[1, 1, 0.66]), j="torso"), dict(box(0.06, 0.05, 0.02, "$gold", 0, 0.03, 0.115), j="torso")])
part('cloth.apron', 'cloth', slot='apron', style='apron', shapes=[dict(box("0.3*W", 0.66, 0.02, C, 0, 0.12, 0.125), j="torso")])
CAPES = {"cape_red": "#8a2a2a", "cape_blue": "#2f4f8a", "cape_green": "#3f6a34", "cape_purple": "#5b3a7a", "cape_gold": "#c8a040", "cape_black": "#262226"}
part('cloth.cape', 'cloth', slot='cape', style='cape', items=CAPES,
     shapes=[dict(box("0.44*W", 0.86, 0.025, C, 0, -0.43, 0), j="cape"), dict(box("0.46*W", 0.05, 0.05, "$c:0.7", 0, 0, 0.01), j="cape")],
     groundShapes=[box(0.42, 0.06, 0.34, C, 0, 0.03, 0), box(0.44, 0.03, 0.06, "$c:0.7", 0, 0.07, -0.15), box(0.4, 0.04, 0.3, "$c:1.12", 0, 0.075, 0.02)])

# ---------------------------------------------------------------- gear (one file per type, all tiers inside)
T = "$tier"; TD = "$tier:0.68"
part('gear.helmet', 'gear', slot='head', family='metal', items="helmet_t{t}", tiers=[1, 5], hides=["hat"],
     hidesIf={"t>=3": ["hair", "beard"]},
     shapes=[dict(s, j="head") for s in [
         sph(0.168, T, 0, 0.16, -0.01, 12, 6, 0.5, k=[1, 0.95, 1], **{"if": "t<=2"}),
         ring(0.172, 0.03, TD, 0, 0.17, -0.01, **{"if": "t<=2"}),
         box(0.03, 0.11, 0.025, T, 0, 0.12, 0.165, **{"if": "t==2"}),
         cyl(0.168, 0.16, 0.3, T, 0, 0.13, 0, seg=12, k=[1, 1, 1.05], **{"if": "t>=3"}),
         sph(0.168, T, 0, 0.28, 0, 12, 6, 0.5, **{"if": "t>=3"}),
         box(0.22, 0.03, 0.03, "$dark", 0, 0.15, 0.163, **{"if": "t>=3"}),
         box(0.03, 0.12, 0.03, "$dark", 0, 0.08, 0.163, **{"if": "t>=3"}),
         box(0.04, 0.09, 0.3, "$gold", 0, 0.42, -0.01, **{"if": "t==4"}),
         box(0.04, 0.09, 0.3, TD, 0, 0.42, -0.01, **{"if": "t==5"}),
         cone(0.04, 0.17, "#e8e0c8", 0.2, 0.3, 0, seg=6, r=[0, 0, -0.9], mirror=True, **{"if": "t==5"})]],
     ground={"p": [0, -0.02, 0]})
part('gear.platebody', 'gear', slot='body', family='metal', items="body_t{t}", tiers=[1, 5],
     shapes=[dict(cyl("0.222*W", "0.185*W", 0.47, T, 0, 0.27, 0, seg=9, k=[1, 1, 0.66]), j="torso"),
             dict(cyl("0.19*W", "0.21*W", 0.14, "$tier:0.7", 0, -0.04, 0, seg=9, k=[1, 1, 0.72]), j="hips"),
             dict(box(0.04, 0.4, 0.03, "$tier:1.22", 0, 0.29, 0.14, **{"if": "t>=3"}), j="torso"),
             dict(ring("0.18*W", 0.04, "$gold", 0, 0.5, 0, k=[1, 1, 0.68], **{"if": "t>=4"}), j="torso"),
             dict(sph(0.1, "$tier:0.7", 0, 0.01, 0, 9, 6, 0.55, k=[1.15, 0.9, 1.1]), j="sh*"),
             dict(cap(0.068, 0.17, T, 0, -0.14, 0), j="sh*"),
             dict(cone(0.03, 0.1, "#e0d8c0", 0, 0.11, 0, seg=5, **{"if": "t==5"}), j="sh*"),
             dict(cyl(0.064, 0.07, 0.15, T, 0, -0.17, 0, seg=8), j="el*")],
     groundShapes=[cyl(0.22, 0.185, 0.47, T, 0, 0.13, 0, seg=9, k=[1, 1, 0.66], r=[-PI / 2, 0, 0]),
                   sph(0.1, "$tier:0.7", 0.26, 0.1, -0.18, 9, 6, 0.55, k=[1.15, 0.9, 1.1], mirror=True),
                   box(0.04, 0.03, 0.4, "$tier:1.22", 0, 0.27, 0, **{"if": "t>=3"}), box(0.36, 0.035, 0.04, "$gold", 0, 0.25, -0.22, **{"if": "t>=4"})])
CHAIN_RINGS = [dict(box(0.07, 0.045, 0.022, "$tier:1.2", f"{rad * math.sin(a):.4f}*W", y, f"{rad * 0.68 * math.cos(a):.4f}*W", r=[0, round(a, 4), 0]), j="torso")
               for (y, off) in ((0.11, 0.0), (0.26, PI / 12), (0.41, 0.0))
               for rad in (0.178 + 0.074 * (y - 0.04) - 0.004,)
               for a in (off + i / 12 * 2 * PI for i in range(12))]
part('gear.chainbody', 'gear', slot='body', family='metal', items="chain_t{t}", tiers=[1, 5],
     shapes=[dict(cyl("0.212*W", "0.178*W", 0.46, "$tier:0.78", 0, 0.27, 0, seg=9, k=[1, 1, 0.68]), j="torso"),
             dict(cyl("0.13*W", "0.15*W", 0.07, "$tier:0.9", 0, 0.49, 0, seg=9, k=[1, 1, 0.7]), j="torso"),
             dict(cyl("0.188*W", "0.2*W", 0.12, "$tier:0.66", 0, -0.05, 0, seg=9, k=[1, 1, 0.72]), j="hips"),
             dict(sph(0.093, "$tier:0.66", 0, 0.01, 0, 9, 6, 0.55, k=[1.12, 0.88, 1.08]), j="sh*"),
             dict(cap(0.062, 0.11, "$tier:0.82", 0, -0.1, 0), j="sh*")] + CHAIN_RINGS,
     groundShapes=[cyl("0.212", "0.178", 0.46, "$tier:0.78", 0, 0.12, 0, seg=9, k=[1, 1, 0.68], r=[-PI / 2, 0, 0]),
                   sph(0.093, "$tier:0.66", 0.25, 0.1, -0.17, 9, 6, 0.55, k=[1.12, 0.88, 1.08], mirror=True)] +
                  [box(0.05, 0.016, 0.036, "$tier:1.18", round(-0.12 + 0.08 * i, 4), 0.265, 0.0) for i in range(4)])
part('gear.platelegs', 'gear', slot='legs', family='metal', items="legs_t{t}", tiers=[1, 5],
     shapes=[dict(cap("0.093*W", 0.22, T, 0, -0.21, 0), j="hip*"), dict(sph(0.06, "$tier:0.72", 0, 0, 0.035, 8, 6), j="knee*"),
             dict(cap("0.077*W", 0.2, T, 0, -0.17, 0), j="knee*"), dict(box("0.3*W", 0.17, 0.03, "$tier:0.72", 0, -0.12, 0.13), j="hips")],
     groundShapes=[cap(0.08, 0.5, T, 0.12, 0.08, -0.02, r=[PI / 2, 0, 0.12], mirror=True), box(0.34, 0.09, 0.14, "$tier:0.8", 0, 0.06, 0.33)])
part('gear.sword', 'gear', slot='weapon', family='metal', items="sword_t{t}", tiers=[1, 5], attack='slash',
     mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0, 0.04, 0], "r": [-PI / 2, 0, 0]},
     shapes=[box(0.045, 0.15, 0.045, "$leather", 0, -0.03, 0), box(0.07, 0.05, 0.07, "$tier:0.8", 0, -0.13, 0, **{"if": "t<4"}), box(0.07, 0.05, 0.07, "$gold", 0, -0.13, 0, **{"if": "t>=4"}),
             box("0.22+0.01*t", 0.045, 0.07, "$tier:0.85", 0, 0.07, 0, **{"if": "t<4"}), box("0.22+0.01*t", 0.045, 0.07, "$gold", 0, 0.07, 0, **{"if": "t>=4"}),
             box(0.065, "0.5+0.03*t", 0.022, T, 0, "0.09+(0.5+0.03*t)/2", 0), cone(0.046, 0.08, T, 0, "0.09+0.5+0.03*t+0.04", 0, seg=4),
             box(0.016, "(0.5+0.03*t)*0.8", 0.026, "$tier:1.25", 0, "0.09+(0.5+0.03*t)*0.45", 0, **{"if": "t>=3"})])
part('gear.longsword', 'gear', slot='weapon', family='metal', items="longsword_t{t}", tiers=[1, 5], attack='slash',
     mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0, 0.04, 0], "r": [-PI / 2, 0, 0]},
     shapes=[box(0.045, 0.2, 0.045, "$leather", 0, -0.05, 0), box(0.07, 0.06, 0.07, "$tier:0.8", 0, -0.18, 0, **{"if": "t<4"}), box(0.07, 0.06, 0.07, "$gold", 0, -0.18, 0, **{"if": "t>=4"}),
             box("0.24+0.01*t", 0.05, 0.07, "$tier:0.85", 0, 0.07, 0, **{"if": "t<4"}), box("0.24+0.01*t", 0.05, 0.07, "$gold", 0, 0.07, 0, **{"if": "t>=4"}),
             box(0.07, "0.66+0.035*t", 0.024, T, 0, "0.095+(0.66+0.035*t)/2", 0), cone(0.05, 0.09, T, 0, "0.095+0.66+0.035*t+0.045", 0, seg=4),
             box(0.018, "(0.66+0.035*t)*0.85", 0.028, "$tier:1.25", 0, "0.095+(0.66+0.035*t)*0.475", 0, **{"if": "t>=3"})])
part('gear.dagger', 'gear', slot='weapon', family='metal', items="dagger_t{t}", tiers=[1, 5], attack='stab',
     mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0, 0.035, 0], "r": [-PI / 2, 0, 0]},
     shapes=[box(0.04, 0.14, 0.04, "$leather", 0, -0.04, 0), box(0.055, 0.04, 0.055, "$tier:0.8", 0, -0.12, 0, **{"if": "t<4"}), box(0.055, 0.04, 0.055, "$gold", 0, -0.12, 0, **{"if": "t>=4"}),
             box(0.14, 0.04, 0.055, "$tier:0.85", 0, 0.045, 0),
             box(0.055, "0.3+0.02*t", 0.018, T, 0, "0.06+(0.3+0.02*t)/2", 0), cone(0.038, 0.07, T, 0, "0.06+0.3+0.02*t+0.035", 0, seg=4),
             box(0.014, "(0.3+0.02*t)*0.75", 0.022, "$tier:1.25", 0, "0.06+(0.3+0.02*t)*0.4", 0, **{"if": "t>=3"})])
MACE_FLANGES = [box(0.03, 0.13, 0.055, T, round(math.sin(i / 4 * 2 * PI) * 0.072, 4), 0.38, round(math.cos(i / 4 * 2 * PI) * 0.072, 4),
                    r=[0, round(i / 4 * 2 * PI, 4), 0]) for i in range(4)]
part('gear.mace', 'gear', slot='weapon', family='metal', items="mace_t{t}", tiers=[1, 5], attack='crush',
     mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0, 0.09, 0], "r": [-PI / 2, 0, 0]},
     shapes=[cyl(0.026, 0.03, 0.34, "$wood", 0, 0.14, 0, seg=6), box(0.042, 0.1, 0.042, "$leather", 0, 0.02, 0),
             ring(0.044, 0.035, "$tier:0.8", 0, 0.3, 0), cyl("0.055+0.004*t", "0.055+0.004*t", 0.14, T, 0, 0.38, 0, seg=8)] + MACE_FLANGES +
            [ring("0.055+0.004*t", 0.03, "$gold", 0, "0.455", 0, **{"if": "t>=4"})])
part('gear.staff', 'gear', slot='weapon', family='cloth', items="staff_t{t}", tiers=[1, 5], attack='cast',
     mount={"j": "handR"}, ground={"p": [0, 0.05, 0], "r": [-PI / 2, 0, 0]},
     shapes=[cyl(0.025, 0.03, 1.5, "#6b4a2b", 0, 0.12, 0, seg=6), box(0.07, 0.16, 0.07, T, 0, 0.6, 0),
             cyl(0.05, 0.03, 0.12, "#5a3d22", 0, 0.84, 0, seg=6, **{"if": "t<4"}), cyl(0.05, 0.03, 0.12, "$gold", 0, 0.84, 0, seg=6, **{"if": "t>=4"}),
             ico("0.07+0.008*t", T, 0, 0.95, 0, 1, name="tip", **{"if": "t<3"}), ico("0.07+0.008*t", T, 0, 0.95, 0, 1, name="tip", glow=True, **{"if": "t>=3"})])
part('gear.bow', 'gear', slot='weapon', family='wood', items="bow_t{t}", tiers=[1, 5], attack='bow', twoHanded=True,
     mount={"j": "handL"}, carry={"elL": [-1.25], "shL": [-0.15, 0, 0.05]}, ground={"p": [0, 0.06, 0], "r": [0, 0, PI / 2]},
     shapes=[S('tube', [0.022], T, pts=[[0, 0.05, "-(0.46+0.02*t)"], [0, -0.26, 0], [0, 0.05, "0.46+0.02*t"]]),
             box(0.05, 0.05, 0.12, "$leather", 0, -0.105, 0), box(0.008, 0.008, "(0.46+0.02*t)*2", "$string", 0, 0.05, 0, shadow=False),
             box(0.035, 0.035, 0.05, "$gold", 0, 0.04, "-(0.46+0.02*t)", **{"if": "t>=4"}), box(0.035, 0.035, 0.05, "$gold", 0, 0.04, "0.46+0.02*t", **{"if": "t>=4"}),
             {"t": "group", "p": [0, 0.05, 0], "name": "tip"}])
part('gear.shield', 'gear', slot='shield', family='metal', items="shield_t{t}", tiers=[1, 5],
     mount={"j": "elL", "p": [0.08, -0.15, 0.02], "r": [0, 0.95, 0]}, ground={"p": [0, 0.03, 0], "r": [-PI / 2, 0, 0]},
     shapes=[S('kite', [1, 0.03], T, [0, 0, -0.015]), S('kite', [0.55, 0.012], "$tier:0.7", [0, 0.02, 0.012], **{"if": "t<4"}), S('kite', [0.55, 0.012], "$gold", [0, 0.02, 0.012], **{"if": "t>=4"}),
             box(0.36, 0.025, 0.012, "$tier:1.2", 0, 0.14, 0.02)])
arrow = [box(0.014, 0.014, 0.42, "#c8b48a"), cone(0.026, 0.07, T, 0, 0, 0.245, seg=4, r=[PI / 2, 0, 0]), box(0.004, 0.04, 0.08, "#e8e8e8", 0, 0.012, -0.18), box(0.04, 0.004, 0.08, "#c84040", 0, 0, -0.18)]
part('gear.arrows', 'gear', slot='ammo', family='metal', items="arrows_t{t}", tiers=[1, 5],
     mount={"j": "torso", "p": [0.1, 0.32, -0.15], "r": [0, 0, -0.35]},
     shapes=[cyl(0.055, 0.045, 0.4, "$leather", seg=7)] + [box(0.012, 0.12, 0.012, "#c8b48a", round(-0.025 + 0.017 * i, 4), 0.25, 0.01 * (i % 2)) for i in range(4)]
            + [box(0.03, 0.04, 0.008, "#e8e8e8" if i % 2 else "#c84040", round(-0.025 + 0.017 * i, 4), 0.3, 0) for i in range(4)],
     groundShapes=[dict(t="group", p=[round(0.035 * (i - 2), 4), 0.02, 0], r=[-PI / 2, 0, round(0.18 * (i - 2), 4)], children=arrow) for i in range(5)],
     projectile=arrow)
# ---------------------------------------------------------------- packs: five different bags in one part. No family, so every
# colour is written per tier and every tier's shapes are gated with "if" (a $tier here would read metal).
PACK_TRIM = {1: "#4a3220", 2: "#8f7c58", 3: "#3e2b16", 4: "#6b5a3a", 5: "#7b8bd0"}
worn, onground = [], []
def bag(t, *sh): worn.extend(dict(s, j="torso", **{"if": "t==" + str(t)}) for s in sh)
def bagged(t, *sh): onground.extend(dict(s, **{"if": "t==" + str(t)}) for s in sh)
def shoulder(t, w=0.055, h=0.3):
    return [box(w, h, 0.02, PACK_TRIM[t], f"{x * 0.09:.4f}*W", 0.33, "0.14*W") for x in (1, -1)]
bag(1,  # a small leather satchel on one shoulder
    box(0.05, 0.42, 0.02, "#4a3220", "0.02*W", 0.31, "0.14*W", r=[0, 0, -0.32]),
    box("0.26*W", 0.19, 0.115, "$leather", 0, 0.27, -0.205),
    box("0.265*W", 0.055, 0.13, "#4a3220", 0, 0.345, -0.205),
    box(0.032, 0.042, 0.018, "$gold", 0, 0.295, -0.272))
bag(2,  # a canvas rucksack, flap and two buckles
    box("0.30*W", 0.30, 0.14, "#b9a887", 0, 0.30, -0.215),
    box("0.305*W", 0.115, 0.155, "#a3906b", 0, 0.415, -0.215),
    box(0.035, 0.15, 0.016, "#7a6748", "0.075*W", 0.365, -0.303),
    box(0.035, 0.15, 0.016, "#7a6748", "-0.075*W", 0.365, -0.303),
    box(0.042, 0.036, 0.016, "$gold", "0.075*W", 0.285, -0.315),
    box(0.042, 0.036, 0.016, "$gold", "-0.075*W", 0.285, -0.315),
    *shoulder(2))
bag(3,  # leather reinforced, metal corners, a bedroll strapped on top
    box("0.32*W", 0.34, 0.16, "#5a3f24", 0, 0.29, -0.225),
    box("0.325*W", 0.045, 0.17, "#3e2b16", 0, 0.20, -0.225),
    box("0.325*W", 0.045, 0.17, "#3e2b16", 0, 0.385, -0.225),
    box(0.055, 0.36, 0.055, "$metal3", "0.145*W", 0.29, -0.30),
    box(0.055, 0.36, 0.055, "$metal3", "-0.145*W", 0.29, -0.30),
    box("0.29*W", 0.055, 0.055, "$metal3", 0, 0.115, -0.30),
    box("0.29*W", 0.055, 0.055, "$metal3", 0, 0.465, -0.30),
    box(0.04, 0.30, 0.018, "#3e2b16", "0.085*W", 0.29, -0.318),
    box(0.04, 0.30, 0.018, "#3e2b16", "-0.085*W", 0.29, -0.318),
    box(0.06, 0.05, 0.018, "$gold", 0, 0.29, -0.318),
    cap(0.05, 0.26, "#c2b18a", 0, 0.50, -0.235, r=[0, 0, PI / 2]),
    *shoulder(3))
bag(4,  # a wooden frame, pots off the sides, a lantern hanging off the rail. The uprights are
    # OUTSIDE the bag in x (0.205*W against the bag's 0.135*W) - level with it and they vanish.
    box(0.055, 0.42, 0.055, "$wood", "0.205*W", 0.26, -0.27),
    box(0.055, 0.42, 0.055, "$wood", "-0.205*W", 0.26, -0.27),
    box("0.465*W", 0.055, 0.055, "$wood", 0, 0.07, -0.27),
    box("0.465*W", 0.055, 0.055, "$wood", 0, 0.45, -0.27),
    box("0.27*W", 0.27, 0.15, "#a89470", 0, 0.29, -0.21),
    box("0.275*W", 0.09, 0.16, "#8f7c58", 0, 0.40, -0.21),
    cyl(0.05, 0.05, 0.085, "$metal2", "0.135*W", 0.10, -0.305, seg=7),
    cyl(0.048, 0.048, 0.075, "$metal2", "-0.135*W", 0.105, -0.305, seg=7),
    cyl(0.075, 0.07, 0.05, "$metal2", 0, 0.062, -0.30, seg=8),
    cyl(0.05, 0.055, 0.02, "#3a3a42", "-0.215*W", 0.275, -0.245, seg=6),
    cyl(0.038, 0.04, 0.065, "#ffe08a", "-0.215*W", 0.33, -0.245, seg=6, glow=True),
    cone(0.052, 0.05, "#3a3a42", "-0.215*W", 0.395, -0.245, seg=6),
    *shoulder(4))
bag(5,  # an enchanted pack: runes in the leather, a soft aura behind it
    box("0.31*W", 0.33, 0.15, "#3b2f66", 0, 0.30, -0.215),
    box("0.315*W", 0.115, 0.165, "#4a3d80", 0, 0.40, -0.215),
    box("0.315*W", 0.05, 0.16, "#9aa8e8", 0, 0.16, -0.215),
    box("0.315*W", 0.05, 0.16, "#9aa8e8", 0, 0.44, -0.215),
    box("0.33*W", 0.38, 0.01, "#8f7fe0", 0, 0.29, -0.33, op=0.22, ds=True, shadow=False),
    box(0.055, 0.075, 0.014, "#7fe8ff", "0.085*W", 0.33, -0.31, glow=True),
    box(0.055, 0.075, 0.014, "#7fe8ff", "-0.085*W", 0.33, -0.31, glow=True),
    box(0.055, 0.075, 0.014, "#7fe8ff", 0, 0.20, -0.31, glow=True),
    ico(0.045, "#aee6ff", 0, 0.465, -0.26, glow=True),
    ico(0.018, "#bfefff", "0.14*W", 0.47, -0.26, shadow=False, glow=True),
    ico(0.015, "#bfefff", "-0.13*W", 0.14, -0.28, shadow=False, glow=True),
    *shoulder(5))
bagged(1, box(0.30, 0.13, 0.22, "$leather", 0, 0.065, 0), box(0.305, 0.05, 0.13, "#4a3220", 0, 0.13, -0.035),
       box(0.04, 0.022, 0.03, "$gold", 0, 0.148, 0.055), box(0.05, 0.014, 0.26, "#4a3220", 0.06, 0.007, 0.06, r=[0, 0.4, 0]))
bagged(2, box(0.34, 0.17, 0.24, "#b9a887", 0, 0.085, 0), box(0.345, 0.06, 0.15, "#a3906b", 0, 0.175, -0.035),
       box(0.036, 0.13, 0.016, "#7a6748", "0.09", 0.13, 0.113), box(0.036, 0.13, 0.016, "#7a6748", "-0.09", 0.13, 0.113),
       box(0.042, 0.03, 0.02, "$gold", "0.09", 0.075, 0.12), box(0.042, 0.03, 0.02, "$gold", "-0.09", 0.075, 0.12))
bagged(3, box(0.36, 0.18, 0.25, "#5a3f24", 0, 0.09, 0), box(0.365, 0.05, 0.06, "#3e2b16", 0, 0.13, 0.09),
       box(0.055, 0.055, 0.055, "$metal3", "0.15", 0.09, "0.10"), box(0.055, 0.055, 0.055, "$metal3", "-0.15", 0.09, "0.10"),
       box(0.055, 0.055, 0.055, "$metal3", "0.15", 0.09, "-0.10"), box(0.055, 0.055, 0.055, "$metal3", "-0.15", 0.09, "-0.10"),
       cap(0.05, 0.24, "#c2b18a", 0, 0.21, -0.02, r=[0, 0, PI / 2]))
bagged(4, box(0.36, 0.17, 0.24, "#a89470", 0, 0.085, 0), box(0.40, 0.045, 0.045, "$wood", 0, 0.03, "0.09"),
       box(0.40, 0.045, 0.045, "$wood", 0, 0.155, "-0.02"), box(0.045, 0.19, 0.045, "$wood", "0.185", 0.095, "0.02"),
       box(0.045, 0.19, 0.045, "$wood", "-0.185", 0.095, "0.02"),
       cyl(0.055, 0.055, 0.09, "$metal2", "-0.11", 0.045, 0.13, seg=7), cyl(0.07, 0.065, 0.045, "$metal2", "0.03", 0.022, 0.145, seg=8),
       cyl(0.05, 0.055, 0.02, "#3a3a42", "0.13", 0.115, "-0.10", seg=6),
       cyl(0.038, 0.04, 0.065, "#ffe08a", "0.13", 0.16, "-0.10", seg=6, glow=True),
       cone(0.052, 0.05, "#3a3a42", "0.13", 0.215, "-0.10", seg=6))
bagged(5, box(0.35, 0.17, 0.24, "#3b2f66", 0, 0.085, 0), box(0.355, 0.05, 0.06, "#9aa8e8", 0, 0.15, "0.09"),
       box(0.39, 0.01, 0.27, "#8f7fe0", 0, 0.012, 0, op=0.28, ds=True, shadow=False),
       box(0.055, 0.014, 0.075, "#7fe8ff", "0.085", 0.172, "0.02", glow=True), box(0.055, 0.014, 0.075, "#7fe8ff", "-0.085", 0.172, "-0.05", glow=True),
       box(0.055, 0.014, 0.075, "#7fe8ff", 0, 0.172, "0.09", glow=True), ico(0.017, "#bfefff", "0.15", 0.19, "0.10", glow=True, shadow=False))
part('gear.pack', 'gear', slot='pack', items="pack_t{t}", tiers=[1, 5], shapes=worn, groundShapes=onground)
part('gear.hatchet', 'gear', slot='tool', items=["hatchet"], tool=True, mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0.15, 0.05, 0], "r": [0, 0.5, PI / 2]},
     shapes=[box(0.04, 0.5, 0.04, "$wood", 0, 0.12, 0), box(0.03, 0.12, 0.16, "$metal1", 0, 0.34, 0.06)])
part('gear.pickaxe', 'gear', slot='tool', items=["pickaxe"], tool=True, mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0.15, 0.05, 0], "r": [0, 0.5, PI / 2]},
     shapes=[box(0.04, 0.55, 0.04, "$wood", 0, 0.14, 0), box(0.04, 0.05, 0.42, "$metal1", 0, 0.39, 0), cone(0.03, 0.08, "$metal1", 0, 0.39, 0.25, seg=4, r=[PI / 2, 0, 0]), cone(0.03, 0.08, "$metal1", 0, 0.39, -0.25, seg=4, r=[-PI / 2, 0, 0])])
part('gear.net', 'gear', slot='tool', items=["net"], tool=True, mount={"j": "handR", "r": [1.75, 0, 0]}, ground={"p": [0.15, 0.05, 0], "r": [0, 0.5, PI / 2]},
     # mounted along the forearm, so reach = dip. A landing net on a long pole so it reaches past the bank into the water (2026-10-01: "the net should actually go into the water")
     shapes=[box(0.035, 1.0, 0.035, "$wood", 0, 0.32, 0), S('torus', [0.17, 0.015], "#5a4a30", [0, 0.98, 0], seg=[4, 10]),
             S('disc', [0.17], "#cfc6a8", [0, 0.98, 0], seg=10, op=0.55, ds=True, shadow=False)])
part('gear.fishing_rod', 'gear', slot='tool', items=["fishing_rod"], tool=True, mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0.15, 0.05, 0], "r": [0, 0.5, PI / 2]},
      shapes=[cyl(0.03, 0.011, 1.05, "$wood", 0, 0.42, 0, seg=5), cyl(0.028, 0.032, 0.16, "#4a3a24", 0, -0.02, 0, seg=6),
              cyl(0.022, 0.022, 0.055, "$metal1", 0.035, 0.11, 0, seg=6, r=[0, 0, PI / 2]),
              cyl(0.004, 0.004, 0.44, "#e2e2da", 0.14, 0.6, 0, seg=3, r=[0, 0, -0.62], shadow=False),
              sph(0.018, "#c84040", 0.27, 0.42, 0, 6, 4, shadow=False)])
part('gear.lobster_pot', 'gear', slot='tool', items=["lobster_pot"], tool=True, mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0.15, 0.05, 0], "r": [0, 0.5, PI / 2]},
      shapes=[box(0.022, 0.26, 0.022, "$wood", round(math.cos(a) * 0.13, 3), 0.15, round(math.sin(a) * 0.13, 3), r=[0, -a, 0]) for a in [i * PI / 4 for i in range(8)]]
             + [S('torus', [0.13, 0.013], "#8a7040", [0, 0.06, 0], seg=[8, 4], r=[PI / 2, 0, 0]),
                S('torus', [0.13, 0.013], "#8a7040", [0, 0.24, 0], seg=[8, 4], r=[PI / 2, 0, 0]),
                S('torus', [0.055, 0.011], "#c8b48a", [0, 0.32, 0], seg=[6, 4], r=[PI / 2, 0, 0])])
part('gear.hammer', 'gear', slot='weapon', items=["hammer"], attack='crush', mount={"j": "handR", "r": [2.1, 0, 0]}, ground={"p": [0, 0.05, 0], "r": [0, 0, PI / 2]},
     shapes=[box(0.04, 0.38, 0.04, "$wood", 0, 0.08, 0), box(0.09, 0.09, 0.2, "#55565c", 0, 0.28, 0)])

# ---------------------------------------------------------------- one-off kit for Elder Maren's cast (task 5)
# These are monster kit, not shop stock, so they are single-id parts: no family and no tiers, which means no $tier and no
# "if": "t>=n" anywhere inside (t is 0 for a part with a dict of items). Their colour is the item's own colour ($c).
# A character draws no shapes of its own, so anything a monster wears that is not a stock item has to be a part like these.
part('gear.ghostlight', 'gear', slot='head', items={"ghostlight": "#9fe0ff"}, mount={"j": "head"},
     # No aura sphere: a char's `op` is written onto every material in the model, so a shape that asked for op 0.16 becomes 0.55 on
     # a translucent body and the aura turns into a bubble around the head. What is left is the wisp above the crown and the eyes.
     shapes=[sph(0.05, "$c", 0, 0.4, -0.02, 8, 6, glow=True, ds=True, shadow=False),
             box(0.028, 0.026, 0.014, "$c:1.15", 0.047, 0.152, 0.138, glow=True, mirror=True),
             ring(0.135, 0.008, "$c", 0, 0.315, -0.01, glow=True, shadow=False)])
part('gear.staff_verdant', 'gear', slot='weapon', items={"staff_verdant": "#3fe08a"}, attack='cast',
     mount={"j": "handR"}, ground={"p": [0, 0.05, 0], "r": [-PI / 2, 0, 0]},
     shapes=[cyl(0.025, 0.032, 1.5, "$wood", 0, 0.12, 0, seg=6), sph(0.045, "$wood:0.8", 0, 0.52, 0.02, 8, 6),
             cyl(0.05, 0.032, 0.13, "#3a3040", 0, 0.845, 0, seg=6),
             cone(0.02, 0.11, "#3a3040", 0.055, 0.9, 0, seg=4, r=[0, 0, -0.5], mirror=True),
             ico(0.078, C, 0, 0.96, 0, 1, name="tip", glow=True)])

# Frost staff (v0.4 effects): pale ash shaft, silver collar, an ice crystal cluster on top, so it reads apart from the
# verdant and tier staffs at a glance. Its freeze is data (items.json effects), the look is only this part.
part('gear.staff_frost', 'gear', slot='weapon', items={"staff_frost": "#9fd8ff"}, attack='cast',
     mount={"j": "handR"}, ground={"p": [0, 0.05, 0], "r": [-PI / 2, 0, 0]},
     shapes=[cyl(0.024, 0.03, 1.5, "#c9c2b4", 0, 0.12, 0, seg=6), box(0.06, 0.12, 0.06, "#7f8ea0", 0, 0.6, 0),
             cyl(0.052, 0.03, 0.1, "#d8dde6", 0, 0.835, 0, seg=6),
             cone(0.045, 0.24, C, 0, 1.0, 0, seg=5, name="tip", glow=True),
             cone(0.028, 0.15, "$c:1.2", 0.05, 0.93, 0, seg=4, r=[0, 0, -0.45], mirror=True, glow=True),
             cone(0.026, 0.13, "$c:0.85", 0, 0.92, 0.05, seg=4, r=[0.45, 0, 0], glow=True)])
# Tinderbox (firemaking): a small tin box with a lid line and a flint on top.
part('gear.tinderbox', 'gear', slot='tool', items=["tinderbox"], tool=True, mount={"j": "handR", "r": [1.6, 0, 0]}, ground={"p": [0, 0.03, 0], "r": [0, 0.4, 0]},
     shapes=[box(0.12, 0.05, 0.08, "#8a8f96", 0, 0.025, 0), box(0.124, 0.012, 0.084, "#5d6168", 0, 0.052, 0),
             box(0.04, 0.02, 0.03, "#3b3936", 0.02, 0.068, 0)])

# ---------------------------------------------------------------- ground items (food, resources, coins)
part('item.coins', 'item', items={"coins": None}, shapes=[cyl(0.06, 0.06, 0.018, "$gold", round((i % 3) * 0.05 - 0.05, 3), 0.01 + (0.02 if i > 2 else 0), 0.03 if i > 2 else -0.02, seg=10) for i in range(5)])
part('item.bread', 'item', items={"bread": None}, shapes=[box(0.26, 0.07, 0.15, "#b07a40", 0, 0.035, 0), sph(0.14, "#d39c55", 0, 0.06, 0, 10, 5, 0.5, k=[0.95, 0.5, 0.55])] + [box(0.012, 0.012, 0.13, "#8a5a2a", i * 0.06, 0.125, 0) for i in (-1, 0, 1)])
part('item.potion', 'item', items={"potion": None}, shapes=[cyl(0.07, 0.08, 0.12, "#c02a3a", 0, 0.06, 0, seg=8, glow=True), cyl(0.03, 0.03, 0.08, "#d8d8e0", 0, 0.16, 0, seg=6), cyl(0.035, 0.035, 0.03, "#7a5530", 0, 0.21, 0, seg=6)])
part('item.shrimp', 'item', items={"shrimp_raw": "#e8a0a0", "shrimp": "#e8783a", "shrimp_burnt": "#2a2422"},
     shapes=[S('torus', [0.07, 0.03], "$c", [-0.06 + 0.12 * i, 0.03, 0], seg=[4, 8], arc=1.3, r=[-PI / 2, 0, 0]) for i in range(2)])
part('item.fish', 'item', items={"trout_raw": "#b8735c", "trout": "#d9a37f", "salmon_raw": "#e06f4a", "salmon": "#eda88f",
                                 "trout_burnt": "#4a3a2c", "salmon_burnt": "#463629"},
     shapes=[sph(0.09, "$c", 0, 0.062, 0.015, 9, 6, k=[0.52, 0.66, 1.7]),
             box(0.016, 0.085, 0.062, "$c:0.85", 0, 0.062, -0.135, r=[0.4, 0, 0]),
             box(0.014, 0.05, 0.05, "$c:1.15", 0, 0.108, 0.02, r=[0.3, 0, 0]),
             box(0.012, 0.018, 0.012, "#22262c", 0.031, 0.078, 0.108, **{"mirror": True})])
part('item.lobster', 'item', items={"lobster_raw": "#37525c", "lobster": "#c03a28", "lobster_burnt": "#3c2f26"},
     shapes=[cyl(0.042, 0.05, 0.22, "$c", 0, 0.05, -0.01, seg=7, r=[PI / 2, 0, 0]),
             box(0.11, 0.016, 0.07, "$c:1.15", 0, 0.05, -0.165),
             cap(0.024, 0.09, "$c:1.05", 0.062, 0.05, 0.1, r=[PI / 2, 0, -0.4], mirror=True),
             box(0.026, 0.036, 0.07, "$c:1.12", 0.1, 0.052, 0.165, r=[0, 0.35, 0], mirror=True),
             box(0.01, 0.01, 0.11, "$c:0.8", 0.026, 0.062, 0.22, r=[0.2, 0.45, 0], mirror=True)])
part('item.logs', 'item', items={"logs": "#7a5530", "oak_logs": "#9a7244", "willow_logs": "#b9a062", "maple_logs": "#c47c3a", "yew_logs": "#6f3d1f"},
     shapes=[cyl(0.06, 0.06, 0.5, "$c", round(-0.07 + 0.07 * i + (-0.035 if i == 2 else 0), 3), 0.06 + (0.1 if i == 2 else 0), 0, seg=7, r=[PI / 2, 0, 0]) for i in range(3)]
            + [cyl(0.05, 0.05, 0.005, "$c:1.6", -0.07, 0.06, 0.251, seg=7, r=[PI / 2, 0, 0])])
part('item.ore', 'item', items={"copper_ore": "#d07a3a", "tin_ore": "#c8ccd2", "iron_ore": "#8a4a32", "coal": "#3a3a42", "mithril_ore": "#6f86c8", "gold_ore": "#d9a930"},
     shapes=[ico(0.12, "#6a6460", 0, 0.09, 0), ico(0.04, "$c", 0.07, 0.15, 0.05), ico(0.035, "$c", -0.06, 0.13, 0.07), ico(0.03, "$c", 0.02, 0.18, -0.06)])
part('item.pelt', 'item', items={"pelt": "#8c8c90", "rat_pelt": "#7a6a5a", "hare_pelt": "#a88a6a", "snow_hare_pelt": "#eeeae2", "goat_hide": "#e0d8c8",
                                    "deer_hide": "#9a6a42", "boar_hide": "#5a4436", "timber_wolf_pelt": "#4e4844", "lizard_skin": "#c8a060"},   # each animal its own hide (2026-10-04)   # wolf pelt, giant rat pelt (smaller): animals' only drop (2026-10-01)
     shapes=[box(0.5, 0.025, 0.36, "$c", 0, 0.012, 0), box(0.14, 0.03, 0.16, "$c:0.88", 0, 0.015, 0.24), box(0.04, 0.02, 0.22, "$c:0.88", 0, 0.012, -0.27)])

# ---------------------------------------------------------------- foraging finds (task 5, the operator: "maybe we can collect mushrooms from the woods")
# One part per species, not one part with four ids: a part has a single shape list, so a shared part could only ever recolour
# them ($c) and every variant would get the fly agaric's spots and the glowcap's glow. The ids are mushroom (the plain cluster,
# also the ground pickup and the icon), chanterelle, porcini, fly_agaric, glowcap; what they are worth is items.json's, not this file's.
CAPS = [(-0.066, 0.036, 1.0, 0.22), (0.054, 0.066, 0.78, -0.5), (0.006, -0.06, 0.62, 1.1)]
part('item.mushroom', 'item', items={"mushroom": "#b09068"},
     shapes=[s for (x, z, sc, a) in CAPS for s in
             [cyl(0.018 * sc, 0.025 * sc, 0.09 * sc, "$c:1.35", x, 0.045 * sc, z, seg=6, r=[0, a, 0.1 * sc]),
              sph(0.062 * sc, "$c", x - 0.007 * sc, 0.09 * sc, z, 10, 6, 0.55, k=[1, 0.72, 1], r=[0.14, a, -0.16]),
              cyl(0.06 * sc, 0.053 * sc, 0.016 * sc, "$c:0.72", x - 0.007 * sc, 0.074 * sc, z, seg=10, r=[0.14, a, -0.16])]])
# The chanterelle is its own part, not a colour of the part above: its cap is a funnel (wide at the top, narrowing into
# the stem), which is a different SHAPE, and one part has one shape list.
part('item.chanterelle', 'item', items={"chanterelle": "#e0862a"},
     shapes=[s for (x, z, sc, a) in CAPS for s in
             [cyl(0.014 * sc, 0.02 * sc, 0.08 * sc, "$c:0.92", x, 0.04 * sc, z, seg=6, r=[0, a, 0.12 * sc]),
              cyl(0.054 * sc, 0.016 * sc, 0.052 * sc, "$c", x, 0.1 * sc, z, seg=8, r=[0.16, a, -0.12])]])
part('item.mushroom_porcini', 'item', items={"porcini": "#8a5f3a"},   # fat pale stem, broad brown bun of a cap - the stem never shows as a pole
     shapes=[cyl(0.042, 0.058, 0.072, "#e8e0c8", 0, 0.036, 0, seg=8), cyl(0.046, 0.042, 0.016, "#d8cfb2", 0, 0.078, 0, seg=8),
             sph(0.104, "$c", 0, 0.092, 0, 12, 7, 0.55, k=[1.05, 0.66, 1.05]), cyl(0.09, 0.078, 0.016, "$c:0.7", 0, 0.076, 0, seg=12)])
part('item.mushroom_fly', 'item', items={"fly_agaric": "#c03a2c"},   # spots on the CAP, where they grow (and the tell for Alchemy)
     shapes=[cyl(0.032, 0.042, 0.078, "#efe8d8", 0, 0.039, 0, seg=8), ring(0.048, 0.013, "#e6dfcd", 0, 0.062, 0),
             sph(0.098, "$c", 0, 0.088, 0, 12, 7, 0.52, k=[1.04, 0.68, 1.04]), sph(0.015, "#f6f3ea", 0, 0.148, 0, 6, 4)]
            + [sph(0.014, "#f6f3ea", round(math.sin(a) * 0.076, 4), 0.118, round(math.cos(a) * 0.076, 4), 6, 4) for a in [i / 6 * 2 * PI for i in range(6)]])
part('item.mushroom_glow', 'item', items={"glowcap": "#41d8b4"},
     shapes=[cyl(0.02, 0.026, 0.095, "#cfd8cf", 0, 0.048, 0.01, seg=6, shadow=False),
             sph(0.082, "$c", 0, 0.104, 0.01, 10, 6, 0.55, k=[1, 0.82, 1], glow=True),
             cyl(0.015, 0.019, 0.07, "#cfd8cf", 0.06, 0.035, -0.04, seg=6, shadow=False),
             sph(0.058, "$c", 0.06, 0.074, -0.04, 10, 6, 0.55, k=[1, 0.82, 1], glow=True),
             sph(0.038, "$c:1.25", -0.05, 0.046, -0.035, 8, 5, 0.5, glow=True, shadow=False)])

# ---------------------------------------------------------------- characters (one file each)
part('char.maren', 'char', role='npc', name='Elder Maren', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#dcb592", "hair": "short", "hairColor": "#c8c8cc", "shirt": {"style": "robe", "color": "#5b3a7a"}, "pants": {"style": "robe", "color": "#5b3a7a"}, "boots": "#3a2a3e"})
part('char.tam', 'char', role='npc', name='Tam', body='humanoid', build='normal',
     outfit={"skin": "#d7a77e", "hairColor": "#8a5a2a", "shirt": {"style": "tunic", "color": "#3f7a5a"}, "pants": {"style": "trousers", "color": "#4a3a2a"}, "apron": "#ece6d6"})
part('char.garrick', 'char', role='npc', name='Garrick', body='humanoid', build='big', gear={"weapon": "hammer"},
     outfit={"skin": "#c8926a", "hairColor": "#3a2a1a", "beard": "full", "shirt": {"style": "tunic", "color": "#7a5a3a"}, "pants": {"style": "trousers", "color": "#3a3028"}, "apron": "#5a3a22"})
part('char.wren', 'char', role='npc', name='Wren', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#f1c9a5", "hair": "bun", "hairColor": "#9a3020", "eyes": "#2f6a6a", "hat": {"style": "feather", "color": "#5b3a7a"},
             "shirt": {"style": "shirt", "color": "#2f6a6a"}, "pants": {"style": "skirt", "color": "#c86a2a"}, "boots": "#5a3a22", "belt": "#c8a040", "cape": "#5b3a7a"})
# The Ghost Devs (2026-10-03): the seven who made Ashvale, living in it. role='npc' so models.js
# lists them in names.npcs and MOD.npc('silas') finds them by the id the zone data uses in its `look`.
part('char.silas', 'char', role='npc', name='Silas the mason', body='humanoid', build='big',
     outfit={"skin": "#d8a878", "hair": "bald", "beard": "full", "beardColor": "#b9b2a6",
             "shirt": {"style": "tunic", "color": "#7a7f86"}, "pants": {"style": "trousers", "color": "#4a4e55"},
             "boots": "#3a342c", "belt": "#7a6a3f", "apron": "#8d7a55"})
part('char.pax', 'char', role='npc', name='Pax the painter', body='humanoid', build='normal',
     outfit={"skin": "#f1c9a5", "hair": "long", "hairColor": "#4a3a6a", "eyes": "#c8642a",
             "shirt": {"style": "shirt", "color": "#e8e0c8"}, "pants": {"style": "trousers", "color": "#3a4a6a"},
             "boots": "#4a3a2a", "apron": "#d8cfb0", "cape": "#2a7ac8"})
part('char.modulus', 'char', role='npc', name='Modulus the surveyor', body='humanoid', build='normal',
     outfit={"skin": "#e0b088", "hair": "short", "hairColor": "#3a3a3a", "beard": "stubble",
             "shirt": {"style": "vest", "color": "#2f5a4a"}, "pants": {"style": "trousers", "color": "#2f3a3a"},
             "boots": "#2a2a2a", "belt": "#c8a040", "gloves": "#8a7a5a"})
part('char.latency', 'char', role='npc', name='Latency the warden', body='humanoid', build='big',
     outfit={"skin": "#c99a72", "hair": "bald", "beard": "moustache", "beardColor": "#6a4a2a",
             "hat": {"style": "hood", "color": "#4a3a6a"}, "shirt": {"style": "tunic", "color": "#5b4a7a"},
             "pants": {"style": "trousers", "color": "#3a3450"}, "boots": "#2f2a3a", "cape": "#4a3a6a"})
part('char.symmetry', 'char', role='npc', name='Symmetry the curator', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#f1c9a5", "hair": "bun", "hairColor": "#c8a24a", "eyes": "#2f6a6a",
             "shirt": {"style": "robe", "color": "#e8e4d8"}, "pants": {"style": "robe", "color": "#e8e4d8"},
             "boots": "#8a7a5a", "belt": "#c8a040"})
part('char.auditor', 'char', role='npc', name='Auditor the clerk', body='humanoid', build='small',
     outfit={"skin": "#d8b08a", "hair": "curly", "hairColor": "#6a4a3a", "beard": "goatee",
             "shirt": {"style": "shirt", "color": "#dcd6c4"}, "pants": {"style": "trousers", "color": "#5a4a3a"},
             "boots": "#3a3a3a", "belt": "#5a4a3a", "gloves": "#c8c0a8"})
part('char.pip', 'char', role='npc', name='Pip the apprentice', body='humanoid', build='small',
     outfit={"skin": "#f1c9a5", "hair": "mohawk", "hairColor": "#3a6ac8", "eyes": "#2f6a6a",
             "shirt": {"style": "tunic", "color": "#3a6ac8"}, "pants": {"style": "shorts", "color": "#6a5a3a"},
             "boots": "#5a3a22", "apron": "#7a6a4a"})
# Saltmere's and the lake castle's people get their own looks (2026-10-05: "the saltmere shop keeps are the same as
# Ashvale they should be changed")
part('char.hollis', 'char', role='npc', name='Hollis the taverner', body='humanoid', build='big',
     outfit={"skin": "#d09a70", "hair": "bald", "beard": "full", "beardColor": "#8a4a2a", "shirt": {"style": "shirt", "color": "#e8dcc0"}, "pants": {"style": "trousers", "color": "#2f3a4a"}, "boots": "#3a2a1a", "apron": "#7a2a2a", "belt": "#3a2a1a"})
part('char.nettie', 'char', role='npc', name='Nettie the fishmonger', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#e8b896", "hair": "bun", "hairColor": "#5a3a2a", "hat": {"style": "hood", "color": "#3a6a8a"}, "shirt": {"style": "shirt", "color": "#4a7a9a"}, "pants": {"style": "skirt", "color": "#2f4a5a"}, "boots": "#2a2a2a", "apron": "#d8d2c0"})
part('char.sela', 'char', role='npc', name='Sela the chandler', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#c08a62", "hair": "long", "hairColor": "#1e1612", "shirt": {"style": "vest", "color": "#6a5a3a"}, "pants": {"style": "trousers", "color": "#3a3a2a"}, "boots": "#4a3420", "belt": "#c8a040", "gloves": "#7a6a4a"})
part('char.bela', 'char', role='npc', name='Bela the storekeeper', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#f1c9a5", "hair": "short", "hairColor": "#c8642a", "eyes": "#3a6a2f", "shirt": {"style": "tunic", "color": "#8a3a5a"}, "pants": {"style": "skirt", "color": "#4a3a2a"}, "boots": "#5a3a22", "apron": "#ece6d6"})
part('char.orin', 'char', role='npc', name='Orin the armourer', body='humanoid', build='big', gear={"weapon": "hammer"},
     outfit={"skin": "#8a5a3a", "hair": "short", "hairColor": "#1e1612", "beard": "goatee", "beardColor": "#1e1612", "shirt": {"style": "vest", "color": "#3a3a3a"}, "pants": {"style": "trousers", "color": "#2a2420"}, "boots": "#1e1a16", "apron": "#4a3020", "gloves": "#3a2a1a"})
part('char.perla', 'char', role='npc', name='Perla the net-mender', body='humanoid', build='small',
     outfit={"body": "female", "skin": "#dcb592", "hair": "bun", "hairColor": "#d8d4cc", "shirt": {"style": "shirt", "color": "#6a8a6a"}, "pants": {"style": "skirt", "color": "#3a5a4a"}, "boots": "#4a3a2a", "cape": "#8a7a5a"})
part('char.nessa', 'char', role='npc', name='Nessa the enchanter', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#e8c0a0", "hair": "long", "hairColor": "#e8e4f0", "eyes": "#6a3ac8", "hat": {"style": "wizard", "color": "#2a3a8a"}, "shirt": {"style": "robe", "color": "#2a3a8a"}, "pants": {"style": "robe", "color": "#2a3a8a"}, "boots": "#2a2440", "belt": "#c8a040", "cape": "#4a2a6a"})
part('char.marta', 'char', role='npc', name='Marta the cook', body='humanoid', build='big',
     outfit={"body": "female", "skin": "#e0a882", "hair": "bun", "hairColor": "#7a4a2a", "shirt": {"style": "shirt", "color": "#c8b89a"}, "pants": {"style": "skirt", "color": "#6a3a2a"}, "boots": "#4a3420", "apron": "#f2eee4"})
part('char.hale', 'char', role='npc', name='Quartermaster Hale', body='humanoid', build='normal',
     outfit={"skin": "#d8a878", "hair": "short", "hairColor": "#8a8a8a", "beard": "moustache", "beardColor": "#8a8a8a", "shirt": {"style": "vest", "color": "#4a5a3a"}, "pants": {"style": "trousers", "color": "#3a3a2a"}, "boots": "#2a2a2a", "belt": "#7a6a3f"})
part('char.voss', 'char', role='npc', name='Armourer Voss', body='humanoid', build='big', gear={"weapon": "hammer"},
     outfit={"skin": "#c8926a", "hair": "mohawk", "hairColor": "#3a2a1a", "beard": "stubble", "shirt": {"style": "tunic", "color": "#5a4a4a"}, "pants": {"style": "trousers", "color": "#2a2626"}, "boots": "#1e1a16", "apron": "#3a2a1a", "gloves": "#2a2a2a"})
part('char.brannoc', 'char', role='npc', name='Castellan Brannoc', body='humanoid', build='big',
     outfit={"skin": "#d09a70", "hair": "short", "hairColor": "#b9b2a6", "beard": "full", "beardColor": "#b9b2a6", "shirt": {"style": "tunic", "color": "#7a1e1e"}, "pants": {"style": "trousers", "color": "#2a2a3a"}, "boots": "#2a2420", "belt": "#c8a040", "cape": "#7a1e1e"})
part('char.hob', 'char', role='npc', name='Hob the cook', body='humanoid', build='big',
     outfit={"skin": "#e0a882", "hair": "bald", "beard": "full", "beardColor": "#b8622a", "shirt": {"style": "shirt", "color": "#8a4a2a"}, "pants": {"style": "trousers", "color": "#3a3028"}, "boots": "#2a2420", "apron": "#8a8478", "belt": "#5a3a22"})
# every person gets a look of their own (2026-10-06: "Fenn the tanner is the same body as Pip... make sure that
# characters aren't being used more than once") - tests/unique_looks_test.js keeps it that way
part('char.fenn', 'char', role='npc', name='Fenn the tanner', body='humanoid', build='normal',
     outfit={"skin": "#b88458", "hair": "long", "hairColor": "#4a2e1a", "beard": "stubble", "beardColor": "#4a2e1a", "shirt": {"style": "vest", "color": "#8a6a42"}, "pants": {"style": "trousers", "color": "#5a4430"}, "boots": "#3a2616", "apron": "#6a4a2a", "gloves": "#5a3a1e"})
part('char.rowan', 'char', role='npc', name='Rowan the drover', body='humanoid', build='normal',
     outfit={"skin": "#d8a072", "hair": "curly", "hairColor": "#a0522a", "hat": {"style": "feather", "color": "#6a5a2a"}, "shirt": {"style": "tunic", "color": "#5a7a3a"}, "pants": {"style": "trousers", "color": "#4a3a28"}, "boots": "#3a2a18", "belt": "#7a5a2a", "cape": "#7a6a4a"})
part('char.bryce', 'char', role='npc', name='Bryce the shipwright', body='humanoid', build='big', gear={"weapon": "hammer"},
     outfit={"skin": "#a8744c", "hair": "short", "hairColor": "#c8a060", "beard": "full", "beardColor": "#c8a060", "shirt": {"style": "shirt", "color": "#c8c0a8"}, "pants": {"style": "trousers", "color": "#2a3a5a"}, "boots": "#2a2018", "apron": "#8a6a4a", "belt": "#3a2a1a"})
part('char.tolly', 'char', role='npc', name='Tolly the dockhand', body='humanoid', build='small',
     outfit={"skin": "#e8b896", "hair": "short", "hairColor": "#d8b040", "hat": {"style": "hood", "color": "#7a2a2a"}, "shirt": {"style": "shirt", "color": "#e8e4dc"}, "pants": {"style": "shorts", "color": "#3a4a6a"}, "boots": "#4a3420", "belt": "#3a2a1a"})
part('char.mabb', 'char', role='npc', name='Mabb the sailmaker', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#c8946a", "hair": "long", "hairColor": "#2a1a12", "eyes": "#3a6a8a", "shirt": {"style": "shirt", "color": "#e0d8c0"}, "pants": {"style": "skirt", "color": "#8a6a2a"}, "boots": "#4a3420", "belt": "#c8a040", "apron": "#b8ae94"})
part('char.cobb', 'char', role='npc', name='Cobb the town elder', body='humanoid', build='normal',
     outfit={"skin": "#d8b08a", "hair": "short", "hairColor": "#e8e8e8", "beard": "goatee", "beardColor": "#e8e8e8", "hat": {"style": "hood", "color": "#2a4a5a"}, "shirt": {"style": "robe", "color": "#2a4a5a"}, "pants": {"style": "robe", "color": "#2a4a5a"}, "boots": "#2a2420", "belt": "#c8a040", "cape": "#1e3440"})
part('char.goblin', 'char', role='monster', name='Goblin', body='humanoid', build='small', gear={"weapon": "sword_t1"},
     outfit={"skin": "#6e9a3e", "hair": "bald", "shirt": None, "pants": {"style": "shorts", "color": "#6b4a2b"}, "boots": "#4a3420", "belt": "#4a3420"})
part('char.goblin_chief', 'char', role='monster', name='Goblin Chief', body='humanoid', build='normal', gear={"weapon": "mace_t4", "shield": "shield_t2"},   # 2026-10-04
     outfit={"skin": "#557a2e", "hair": "bald", "hat": {"style": "bonewrap", "color": "#e8e0c8"}, "shirt": {"style": "tunic", "color": "#5a3a22"}, "pants": {"style": "trousers", "color": "#4a3420"}, "boots": "#2a1e14", "belt": "#7a5a2a"})
part('char.bandit', 'char', role='monster', name='Bandit', body='humanoid', build='normal', gear={"weapon": "sword_t2"},
     outfit={"skin": "#c99a72", "hat": {"style": "hood", "color": "#3d3428"}, "shirt": {"style": "tunic", "color": "#5a4a34"}, "pants": {"style": "trousers", "color": "#3a3128"}, "boots": "#2a221a"})
part('char.bandit_leader', 'char', role='monster', name='Bandit leader', body='humanoid', build='big', gear={"weapon": "sword_t3", "head": "helmet_t2", "body": "body_t2"},
     outfit={"skin": "#b88a62", "hairColor": "#1e1612", "beard": "full", "shirt": {"style": "tunic", "color": "#7a2a2a"}, "pants": {"style": "trousers", "color": "#3a3128"}, "boots": "#2a221a"})
part('char.rat', 'char', role='monster', name='Giant rat', body='beast', beast={"size": 0.55, "color": "#7a6a5a", "snout": "#a08878", "tail": "#d8a0a0", "tailLen": 0.6, "tailW": 0.03, "ears": "round", "inner": "#d89a9a", "eyes": "#d02020"})
part('char.wolf', 'char', role='monster', name='Grey wolf', body='beast', beast={"size": 1.15, "color": "#8c8c90", "snout": "#6c6c70", "mane": True, "tail": "#7a7a7e", "tailLen": 0.36, "eyes": "#e8c030"})

# the rest of Elder Maren's quest cast (tasks 5 and 5b). A char part is a recipe, not a model: it names a build, an outfit and
# gear, and since task 5b also what it hides (hide), what it is tinted with (gearTint), what the body expressions should know
# (vars), how see-through it is (op) and how far off the ground it floats (float). Nothing below is hacked around the format:
# the wraith is translucent, legless and hovering because the char can now say all three; the chief has goblin ears on a big
# build because body.human's ears read `small || goblin`; the ash knight is the ordinary plate, recoloured, not a copy of it.
part('char.goblin_shaman', 'char', role='monster', name='Goblin shaman', body='humanoid', build='small', gear={"weapon": "staff_t1"},
     outfit={"skin": "#638c38", "hair": "bald", "hat": {"style": "bonewrap", "color": "#ded6bc"}, "shirt": {"style": "robe", "color": "#7a5a36"},
             "pants": {"style": "robe", "color": "#6b4d2e"}, "boots": "#3e2f1e", "belt": "#4a3420"})
part('char.goblin_chief', 'char', role='monster', name='Goblin chief', body='humanoid', build='big', vars={"goblin": 1},
     gear={"weapon": "mace_t2", "body": "chain_t2"},
     outfit={"skin": "#5d8631", "hair": "bald", "hat": {"style": "ashshard", "color": "#1b1524"}, "shirt": None,
             "pants": {"style": "shorts", "color": "#5a4326"}, "boots": "#3a2a1a", "belt": "#4a3420"})
# legless (the robe's own cone is what you see, the legs under it are never built), hovering 0.25 m and see-through. The
# boots entry stays only so nothing falls back to a default boot colour: boots are painted foot/toe segments, and those are hidden.
part('char.wraith', 'char', role='monster', name='Wraith', body='humanoid', build='normal', op=0.55, float=0.25,
     hide=["thigh", "shin", "foot", "toe"], gear={"head": "ghostlight"},
     outfit={"skin": "#d7e4ee", "hair": "bald", "eyes": "#8fdcff", "hat": {"style": "shroud", "color": "#c6d6e4"},
             "shirt": {"style": "robe", "color": "#cfdcea"}, "pants": {"style": "robe", "color": "#c3d2e2"}, "boots": "#aebfcd"})
# tier 3, not 4: gearTint cannot reach the `$gold` crest and gorget, and a mustard crest on a charcoal knight is worse than no crest.
# Tier-3 plate has no gold and no ivory in it at all, so the tint is the whole silhouette.
part('char.ash_knight', 'char', role='monster', name='Ash knight', body='humanoid', build='big',
     gearTint={"head": "#6a6b71", "body": "#6a6b71", "legs": "#6a6b71"},
     gear={"head": "helmet_t3", "body": "body_t3", "legs": "legs_t3", "weapon": "longsword_t3", "cape": "cape_black"},
     outfit={"skin": "#c4a184", "hair": "bald", "beard": None, "shirt": {"style": "shirt", "color": "#3a383d"},
             "pants": {"style": "trousers", "color": "#2e2c31"}, "boots": "#211f24", "gloves": "#2a282c", "belt": None})
part('char.lich', 'char', role='monster', name='Lich', body='humanoid', build='big', vars={"skull": 1}, gear={"weapon": "staff_verdant"},
     outfit={"skin": "#e6e0d0", "hair": "bald", "hat": {"style": "ashcrown", "color": "#241c30"},
             "shirt": {"style": "robe", "color": "#4a2a6a"}, "pants": {"style": "robe", "color": "#3c2257"}, "boots": "#2a1f33"})

# wildlife (2026-10-04): chickens and brown hens (body 'bird', src/models.js bird()), and the beasts of the wild
part('char.chicken', 'char', **json.loads('{"role": "monster", "name": "Chicken", "body": "bird", "bird": {"size": 1.35, "color": "#f2ece0", "tail": "#d8cfbe", "comb": "#d02a20", "legs": "#e2a632"}}'))
part('char.hen_brown', 'char', **json.loads('{"role": "monster", "name": "Brown hen", "body": "bird", "bird": {"size": 1.25, "color": "#a8683a", "tail": "#5a3a22", "comb": "#c8281e", "legs": "#d89a30"}}'))
part('char.boar', 'char', **json.loads('{"role": "monster", "name": "Wild boar", "body": "beast", "beast": {"size": 1.05, "legLen": 0.75, "color": "#4a3a30", "snout": "#6a5446", "mane": true, "tail": "#3a2c24", "tailLen": 0.14, "tailW": 0.03, "ears": "round", "inner": "#5a4436", "eyes": "#2a1a10", "tusks": "#efe6d0"}}'))
part('char.deer', 'char', **json.loads('{"role": "monster", "name": "Red deer", "body": "beast", "beast": {"size": 1.1, "legLen": 1.55, "color": "#a0643a", "snout": "#7a4a2a", "tail": "#f0e6d8", "tailLen": 0.1, "eyes": "#1a1008", "antlers": "#c8b48c"}}'))
part('char.hare', 'char', **json.loads('{"role": "monster", "name": "Hare", "body": "beast", "beast": {"size": 0.45, "legLen": 1.1, "color": "#9a8468", "snout": "#b8a488", "tail": "#f4efe6", "tailLen": 0.08, "tailW": 0.05, "eyes": "#1a1008"}}'))
part('char.snow_hare', 'char', **json.loads('{"role": "monster", "name": "Snow hare", "body": "beast", "beast": {"size": 0.45, "legLen": 1.1, "color": "#eef0f2", "snout": "#dcdfe2", "tail": "#ffffff", "tailLen": 0.08, "tailW": 0.05, "eyes": "#1a1008"}}'))
part('char.goat', 'char', **json.loads('{"role": "monster", "name": "Mountain goat", "body": "beast", "beast": {"size": 0.9, "legLen": 1.15, "color": "#e6e0d4", "snout": "#cfc7b8", "tail": "#d8d0c2", "tailLen": 0.1, "mane": true, "eyes": "#c8a030", "tusks": "#3a3430"}}'))
part('char.lizard', 'char', **json.loads('{"role": "monster", "name": "Sand lizard", "body": "beast", "beast": {"size": 0.6, "legLen": 0.4, "color": "#c8a060", "snout": "#b08848", "tail": "#b89050", "tailLen": 0.8, "tailW": 0.06, "ears": "round", "inner": "#c8a060", "eyes": "#e0a020"}}'))
part('char.timber_wolf', 'char', **json.loads('{"role": "monster", "name": "Timber wolf", "body": "beast", "beast": {"size": 1.3, "color": "#4e4844", "snout": "#3a3634", "mane": true, "tail": "#45403c", "tailLen": 0.4, "eyes": "#f0b020"}}'))
# meat (2026-10-04: chickens and hens "should drop meat that can be cooked"): a drumstick, raw / cooked / burnt
part('item.chicken', 'item', items={"chicken_raw": "#f0b8a8", "chicken_cooked": "#b8652a", "chicken_burnt": "#2c221c",
                                      "rat_meat_raw": "#e8a8a0", "rat_meat_cooked": "#9a5a32", "rat_meat_burnt": "#2c221c", "hare_raw": "#e6a0a0", "hare_cooked": "#a8602c", "hare_burnt": "#2c221c", "goat_raw": "#d88a86", "goat_cooked": "#9c5528", "goat_burnt": "#2c221c", "venison_raw": "#b8504c", "venison_cooked": "#7a3a1e", "venison_burnt": "#2c221c", "boar_raw": "#d07a78", "boar_cooked": "#8a4a22", "boar_burnt": "#2c221c"},   # every animal's meat (2026-10-04)
     shapes=[sph(0.075, "$c", 0, 0.055, 0.02, 9, 6, k=[0.85, 0.7, 1.3]), cyl(0.022, 0.018, 0.12, "#efe6d6", 0, 0.05, -0.1, seg=6, r=[PI / 2, 0, 0]),
             sph(0.026, "#f6efe2", 0, 0.05, -0.165, 6, 4)])

# the hawk ring and the hawk it makes of you (2026-10-04)
part('item.ring', 'item', items={"ring_hawk": "#d9b040"}, shapes=[S('torus', [0.05, 0.012], "$c", [0, 0.012, 0], seg=[6, 16], r=[PI / 2, 0, 0]), sph(0.02, "#7a3a2a", 0, 0.06, 0, 6, 4)])
part('char.hawk', 'char', role='monster', name='Hawk', body='bird', bird={"size": 3.2, "color": "#7a5634", "tail": "#4a3420", "legs": "#d8b040"})
# the town chest (2026-10-04): an NPC with a chest's body; opening it shows your arcade wallet
# the town portal (2026-10-04): standing stones round a glow, one per town (rules.portals)
part('char.portal', 'char', role='npc', name='Town portal', body='portal', portal={"size": 1.0, "stone": "#8a8780", "glow": "#8fd8ff"})
# Elder Maren's Ashvale stone, and Cobb's Saltmere one: the same flat stone, the harbour end cut bluer (2026-10-05)
part('item.stone', 'item', items={"ashvale_stone": "#8e8c86", "saltmere_stone": "#7d8f92"},
     shapes=[ico(0.09, "$c", 0, 0.05, 0, d=1, k=[1.25, 0.55, 1]), box(0.07, 0.012, 0.012, "#3a5a7a", 0, 0.1, 0.0), box(0.012, 0.012, 0.07, "#3a5a7a", 0, 0.1, 0.0),
             box(0.03, 0.013, 0.03, "#5a8ab0", 0, 0.101, 0)])
part('char.chest', 'char', role='npc', name='Ashvale chest', body='chest', chest={"size": 1.0, "color": "#7a4a24", "band": "#3a3a40", "lock": "#d8b040"})

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.json'): os.remove(os.path.join(OUT, f))
    total = 0
    for pid, d in parts.items():
        s = json.dumps(d, separators=(',', ':'))
        open(os.path.join(OUT, pid + '.json'), 'w').write(s); total += len(s)
    print(len(parts), 'parts,', total, 'bytes total; biggest:', max(((len(json.dumps(d, separators=(",", ":"))), k) for k, d in parts.items())))
