"""[Claude 2026-10-20] make_golfwear.py - Saltmere Links Golfwear (the operator: "a golf outfit, clothing rack down there and a vendor
that sells golf clothing"): golf clothes as cosmetic items, sold only by Rhona the outfitter in the clubhouse, at fixed prices.

- items (data/extra/items.json + data/items.json): flat cap and visor (cosmetic/hat), polo shirts and a tweed jacket
  (cosmetic/shirt, worn on the body), golf trousers and pleated skirts (cosmetic/trousers, worn on the legs); NFTs of
  "ASHVALE Saltmere Links" (data/assets.json), minted on demand by the @ashvale Bank like every worn item
- rules.items: the cosmetic subcategories shirt -> body and trousers -> legs (src/models.js draws a worn shirt or trousers item
  as your shirt or trousers, the way a robe is drawn)
- parts: the cloth parts these are cut from get an `items` map (item -> colour) and a folded shape for the ground and the icon
  (cloth.hat_flatcap, cloth.hat_visor, cloth.shirt_polo, cloth.shirt_tweed from tools/golf/make_proshop.py; cloth.pants_pleated
  too; cloth.pants_trousers from tools/make_parts.py) - run this AFTER either of those, it patches their output
- the shop "golfwear" (keeper rhona, fixed, buys back golfwear only at 40%) and Rhona herself (char.rhona)
The rack and Rhona's place in the clubhouse are in tools/golf/make_golf_zones.py.
    python3 tools/golf/make_golfwear.py      (then python3 build.py)"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
DD = os.path.join(ROOT, 'data'); EX = os.path.join(DD, 'extra'); PARTS = os.path.join(DD, 'parts')
COLL = "ASHVALE Saltmere Links"

# (item id, name, subcategory, part, colour, price, weight, description)
WEAR = [
    ("golfwear_flatcap", "Tweed flat cap", "hat", "cloth.hat_flatcap", "#7a6a4a", 150, 200, "A tweed flat cap, the starter's own pattern. Keeps the sea wind off the back of your neck."),
    ("golfwear_visor", "White visor", "hat", "cloth.hat_visor", "#f0f0f0", 120, 150, "A white golf visor. The sun stays out of your eyes and the breeze stays in your hair."),
    ("golfwear_polo_white", "White polo shirt", "shirt", "cloth.shirt_polo", "#f2f0ea", 200, 400, "A crisp white polo shirt, collar and all."),
    ("golfwear_polo_navy", "Navy polo shirt", "shirt", "cloth.shirt_polo", "#2a3a5e", 200, 400, "A navy polo shirt, smart enough for the clubhouse."),
    ("golfwear_polo_green", "Links green polo", "shirt", "cloth.shirt_polo", "#2f6a4a", 200, 400, "A polo shirt in the Saltmere Links' own green, the one Isla wears."),
    ("golfwear_polo_red", "Red polo shirt", "shirt", "cloth.shirt_polo", "#a83030", 200, 400, "A bold red polo shirt. Your playing partners will always find you."),
    ("golfwear_tweed", "Tweed golf jacket", "shirt", "cloth.shirt_tweed", "#8a7452", 450, 900, "A tweed jacket over a shirt and tie, as Fergus wears. The old way to play the Links."),
    ("golfwear_trousers_khaki", "Khaki golf trousers", "trousers", "cloth.pants_trousers", "#b8a47a", 180, 500, "Pressed khaki golf trousers."),
    ("golfwear_trousers_navy", "Navy golf trousers", "trousers", "cloth.pants_trousers", "#2a3346", 180, 500, "Pressed navy golf trousers."),
    ("golfwear_trousers_grey", "Grey golf trousers", "trousers", "cloth.pants_trousers", "#6e6e6a", 180, 500, "Pressed grey golf trousers."),
    ("golfwear_skirt_white", "White pleated golf skirt", "trousers", "cloth.pants_pleated", "#e8e4d8", 180, 400, "A white pleated golf skirt, knee length."),
    ("golfwear_skirt_navy", "Navy pleated golf skirt", "trousers", "cloth.pants_pleated", "#2a3a5e", 180, 400, "A navy pleated golf skirt, knee length."),
]
ITEMS = {iid: {"name": name, "description": ex, "examine": ex, "collection": COLL, "game": "ashvale", "category": "cosmetic",
               "subcategory": sub, "weight": w, "model": part, "value": price, "attributes": []}
         for iid, name, sub, part, col, price, w, ex in WEAR}
SHOP = {"golfwear": {"name": "Saltmere Links Golfwear", "keeper": "rhona", "stock": [w[0] for w in WEAR], "buys": ["cosmetic/shirt", "cosmetic/trousers"],
                     "buyRate": 40, "sellRate": 100, "fixed": True,
                     "greet": "Dress for the Links! Polos, jackets, trousers and skirts, and a cap for the wind. Try anything on."}}
ASSETS = {w[0]: {"kind": "nft", "collection": COLL, "key": w[0]} for w in WEAR}

# folded on the ground (and in the icon): each garment laid flat in its own cut, so its icon reads as that garment
# (the operator: "the icons in the clothing inventory need to look more like that article of clothing"); x across, -z = the collar/waist end
import math
def B(s, p, c="$c", r=None):
    d = {"t": "box", "s": [round(v, 3) for v in s], "c": c, "p": [round(v, 3) for v in p]}
    if r: d["r"] = [round(v, 3) for v in r]
    return d
def BTN(x, z, y, c="$c:0.6"): return {"t": "cyl", "s": [0.011, 0.011, 0.008], "c": c, "p": [x, y, z], "seg": 8}
def polo():
    out = [B([0.32, 0.05, 0.42], [0, 0.025, 0.02]),                                  # the body
           B([0.32, 0.012, 0.03], [0, 0.051, 0.215], "$c:0.88")]                     # hem
    for sd in (-1, 1):
        out += [B([0.15, 0.048, 0.14], [sd * 0.2, 0.024, -0.12], r=[0, -sd * 0.55, 0]),   # short sleeve, out from the shoulder
                B([0.035, 0.012, 0.14], [sd * 0.245, 0.05, -0.083], "$c:0.85", r=[0, -sd * 0.55, 0]),   # its cuff band
                B([0.075, 0.03, 0.06], [sd * 0.042, 0.065, -0.17], "$c:1.12", r=[0, sd * 0.55, 0])]     # collar flap
    out += [B([0.16, 0.035, 0.035], [0, 0.06, -0.2], "$c:0.9"),                       # collar band at the back of the neck
            B([0.036, 0.012, 0.12], [0, 0.056, -0.1], "$c:0.92"),                     # placket
            BTN(0, -0.13, 0.064), BTN(0, -0.075, 0.064)]
    return out
def tweed():
    out = [B([0.34, 0.055, 0.48], [0, 0.028, 0.03])]
    for sd in (-1, 1):
        out += [B([0.1, 0.05, 0.4], [sd * 0.225, 0.025, 0.0], r=[0, sd * 0.16, 0]),       # long sleeve hanging down
                B([0.1, 0.014, 0.05], [sd * 0.257, 0.052, 0.19], "$c:0.7", r=[0, sd * 0.16, 0]),   # cuff
                B([0.06, 0.016, 0.24], [sd * 0.055, 0.062, -0.1], "$c:0.78", r=[0, -sd * 0.38, 0]),  # lapel, the V of the jacket
                B([0.08, 0.012, 0.012], [sd * 0.1, 0.06, 0.12], "$c:0.65")]              # pocket flap
    out += [B([0.075, 0.012, 0.14], [0, 0.058, -0.15], "#f0ece0"),                    # the shirt in the V
            B([0.03, 0.016, 0.15], [0, 0.068, -0.12], "#7a2a2a"),                       # tie
            B([0.04, 0.02, 0.025], [0, 0.07, -0.2], "#7a2a2a"),                         # its knot
            B([0.16, 0.03, 0.035], [0, 0.06, -0.225], "$c:0.8"),                       # collar
            BTN(0, 0.05, 0.062, "#3a2a1a"), BTN(0, 0.12, 0.062, "#3a2a1a")]
    return out
def trousers():
    out = [B([0.26, 0.055, 0.05], [0, 0.028, -0.26], "$c:0.85"),                       # waistband
           B([0.2, 0.05, 0.12], [0, 0.025, -0.18]),                                    # seat, legs joined at the top
           B([0.012, 0.012, 0.1], [0.02, 0.052, -0.18], "$c:0.75")]                    # fly seam
    for sd in (-1, 1):
        out += [B([0.11, 0.05, 0.46], [sd * 0.07, 0.025, 0.06], r=[0, -sd * 0.07, 0]),      # a leg, splayed a touch
                B([0.008, 0.008, 0.44], [sd * 0.072, 0.052, 0.06], "$c:0.8", r=[0, -sd * 0.07, 0]),   # its crease
                B([0.11, 0.012, 0.03], [sd * 0.088, 0.051, 0.275], "$c:0.88", r=[0, -sd * 0.07, 0]),   # turn-up
                B([0.016, 0.012, 0.05], [sd * 0.09, 0.058, -0.255], "$c:0.7")]              # belt loop
    return out
def skirt():
    out = [B([0.24, 0.055, 0.05], [0, 0.03, -0.17], "$c:0.85")]                        # waistband
    n, L = 9, 0.3
    for i in range(n):
        a = (i - (n - 1) / 2) * 0.075; x0 = (i - (n - 1) / 2) * 0.026
        out.append(B([0.042, 0.04 + 0.008 * (i % 2), L], [x0 + math.sin(a) * L / 2, 0.02 + 0.004 * (i % 2), -0.15 + math.cos(a) * L / 2],
                     "$c" if i % 2 else "$c:0.82", r=[0, a, 0]))                         # a pleat, fanning out to the hem
    return out
def flatcap():
    return [{"t": "sphere", "s": [0.17], "c": "$c", "p": [0, 0.012, -0.015], "seg": [14, 6], "th": 0.5, "k": [1.05, 0.5, 1.2], "r": [-0.1, 0, 0]},   # the crown, sloping to the peak
            {"t": "cyl", "s": [0.176, 0.176, 0.03], "c": "$c:0.8", "p": [0, 0.016, -0.012], "seg": 14, "open": True, "ds": True, "k": [1.05, 1, 1.2]},   # band
            {"t": "sphere", "s": [0.12], "c": "$c:0.85", "p": [0, 0.022, 0.175], "seg": [12, 5], "k": [1.15, 0.09, 0.6]},                            # peak
            {"t": "sphere", "s": [0.016], "c": "$c:0.7", "p": [0, 0.096, -0.03], "seg": [8, 5]},                                                     # button on top
            B([0.006, 0.006, 0.3], [0.05, 0.075, -0.02], "$c:0.7", r=[0, 0, 0.35]), B([0.006, 0.006, 0.3], [-0.05, 0.075, -0.02], "$c:0.7", r=[0, 0, -0.35])]   # tweed seams
def visor():
    return [{"t": "cyl", "s": [0.15, 0.15, 0.045], "c": "$c", "p": [0, 0.023, 0], "seg": 16, "open": True, "ds": True},        # headband
            {"t": "cyl", "s": [0.152, 0.152, 0.012], "c": "#2a3a5e", "p": [0, 0.03, 0], "seg": 16, "open": True, "ds": True},  # stripe
            {"t": "sphere", "s": [0.13], "c": "$c:0.95", "p": [0, 0.035, 0.17], "seg": [14, 5], "k": [1.2, 0.09, 0.9], "r": [0.12, 0, 0]},   # the brim
            {"t": "sphere", "s": [0.1], "c": "#3a6a4a", "p": [0, 0.029, 0.185], "seg": [12, 5], "k": [1.15, 0.05, 0.75], "r": [0.12, 0, 0]}]  # green under the brim
FOLD = {"cloth.hat_flatcap": flatcap(), "cloth.hat_visor": visor(), "cloth.shirt_polo": polo(), "cloth.shirt_tweed": tweed(), "cloth.pants_trousers": trousers(), "cloth.pants_pleated": skirt()}
ICON = {"cloth.hat_flatcap": [0, 0.7, 0], "cloth.hat_visor": [0, 0.7, 0], "cloth.shirt_polo": [0.78, 0, 0], "cloth.shirt_tweed": [0.78, 0, 0], "cloth.pants_trousers": [0.78, 0, 0], "cloth.pants_pleated": [0.78, 0, 0]}   # icon: laid flat, turned to face you
RHONA = {"ashvale3d": "part", "api": 1, "v": 1, "id": "char.rhona", "kind": "char", "role": "npc", "name": "Rhona the outfitter", "body": "humanoid", "build": "normal",
         "outfit": {"body": "female", "skin": "#e9bf98", "hair": "bun", "hairColor": "#3a2a20", "eyes": "#4a5a3a",
                    "hat": {"style": "visor", "color": "#2a3a5e"}, "shirt": {"style": "polo", "color": "#a83030"},
                    "pants": {"style": "pleated", "color": "#2a3a5e"}, "boots": "#f0f0f0", "belt": "#e8e4d8"}}


def load(p): return json.load(open(p, encoding='utf-8'))
def save_pretty(p, d):
    with open(p, 'w', encoding='utf-8') as f: json.dump(d, f, indent=1, ensure_ascii=False); f.write('\n')
def save_live(p, d, sep=(',', ':')):
    with open(p, 'w', encoding='utf-8') as f: json.dump(d, f, separators=sep, ensure_ascii=False)

def add_rules(D):
    it = D.setdefault('items', {})
    cs = it.setdefault('categories', {}).setdefault('cosmetic', [])
    for s in ('shirt', 'trousers'):
        if s not in cs: cs.append(s)
    sl = it.setdefault('slots', {}); sl['cosmetic/shirt'] = 'body'; sl['cosmetic/trousers'] = 'legs'

if __name__ == '__main__':
    ep = os.path.join(EX, 'items.json'); E = load(ep); E['items'].update(json.loads(json.dumps(ITEMS))); save_pretty(ep, E)
    lp = os.path.join(DD, 'items.json'); L = load(lp); L['data']['items'].update(json.loads(json.dumps(ITEMS))); save_live(lp, L)
    ep = os.path.join(EX, 'shops.json'); E = load(ep); E['shops'].update(json.loads(json.dumps(SHOP))); save_pretty(ep, E)
    lp = os.path.join(DD, 'shops.json'); L = load(lp); L['data']['shops'].update(json.loads(json.dumps(SHOP))); save_live(lp, L)
    ep = os.path.join(EX, 'rules.json'); E = load(ep); add_rules(E); save_pretty(ep, E)
    lp = os.path.join(DD, 'rules.json'); L = load(lp); add_rules(L['data']); save_live(lp, L)
    ap = os.path.join(DD, 'assets.json'); A = load(ap)
    for k, v in ASSETS.items(): A['data']['items'][k] = v
    save_live(ap, A, sep=(', ', ': '))
    for iid, name, sub, part, col, *_ in WEAR:   # each part gains its items (a part keeps one map: item -> colour)
        pp = os.path.join(PARTS, part + '.json'); P = load(pp)
        P.setdefault('items', {})[iid] = col
        if part in FOLD: P['groundShapes'] = FOLD[part]; P['iconRot'] = ICON[part]; P['ground'] = {"p": [0, 0, 0]}   # its own ground shapes sit on the ground
        elif 'ground' not in P: P['ground'] = {"p": [0, -0.1, 0]}
        json.dump(P, open(pp, 'w', encoding='utf-8'), separators=(',', ':'))
    json.dump(RHONA, open(os.path.join(PARTS, 'char.rhona.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    print('golfwear: %d items, shop golfwear, char.rhona' % len(WEAR))
