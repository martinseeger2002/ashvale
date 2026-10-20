#!/usr/bin/env python3
"""[Claude 2026-10-19] make_proshop.py - the Saltmere Links Pro Shop's data (the operator: four club sets sold ONLY at the pro shop
for GOLD - Starter 500, Standard 2,500, Pro 10,000, Master 40,000; a player must own a set to play and the best one owned
is used; src/golfrules.js SETS holds the play stats and must keep the same prices).

Writes:
- items (data/extra/items.json and data/items.json): golf_starter, golf_standard, golf_pro, golf_master - tool/golfset,
  collection "ASHVALE Saltmere Links", trait Set (rules.items.traits Set -> golfSet);
- rules (data/extra/rules.json and data/rules.json): the new subcategory tool/golfset and the trait;
- the shop (data/extra/shops.json and data/shops.json): "proshop", kept by Isla, fixed prices (shop.fixed: no Speechcraft
  discount or bonus), the only shop that buys golf sets back (core.js OWN_BUYER);
- data/assets.json: the four sets as NFTs of the new collection (only these four keys; nothing else is rewritten);
- data/parts/: item.golf_* (a bag with club heads out of the top, four looks), char.fergus (the starter) and char.isla (the
  club pro), and the clothes they wear that no one else had (flat cap, visor, tweed jacket, polo shirt, pleated skirt).
  The new clothes carry "homes": [] so no wardrobe offers them yet - they are the two golf people's own.
The two people are not placed in a zone here: the clubhouse places them (the shop opens when Isla stands in a zone).
    python3 tools/golf/make_proshop.py      (then python3 build.py)
Writes the live data modules directly (like tools/farming/make_farming.py): tools/make_data.py on this branch would also
rewrite unrelated data other tools have patched since."""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
DD = os.path.join(ROOT, 'data'); EX = os.path.join(DD, 'extra'); PARTS = os.path.join(DD, 'parts')
COLL = "ASHVALE Saltmere Links"

# ---------------------------------------------------------------- the four sets (prices in step with src/golfrules.js SETS)
SETS = [
    ("golf_starter", "Starter Set", "Starter", 500, 8000,
     "A canvas bag of plain steel clubs, the set every golfer at Saltmere Links starts with. Forgiving enough to learn on; the ball does not go far."),
    ("golf_standard", "Standard Set", "Standard", 2500, 7500,
     "A leather bag of well-made clubs. Longer off the tee than the Starter Set, with a little more time to pick your power."),
    ("golf_pro", "Pro Set", "Pro", 10000, 7000,
     "A navy tour bag with covered woods and forged irons. It hits further again, with a wider sweet spot and more spin to stop the ball."),
    ("golf_master", "Master Set", "Master", 40000, 6500,
     "A white-and-gold bag of the finest clubs Isla stocks. The longest shots on the course, the widest sweet spot and the most control."),
]
ITEMS = {}
for iid, name, tier, value, weight, ex in SETS:
    ITEMS[iid] = {"name": name, "description": ex, "examine": ex, "collection": COLL, "game": "ashvale", "category": "tool",
                  "subcategory": "golfset", "weight": weight, "model": "item." + iid, "value": value,
                  "attributes": [{"trait_type": "Set", "value": tier}]}

SHOP = {"proshop": {"name": "Saltmere Links Pro Shop", "keeper": "isla", "stock": [s[0] for s in SETS], "buys": ["tool/golfset"],
                    "buyRate": 40, "sellRate": 100, "fixed": True,
                    "greet": "Welcome to the Links. You need a set of clubs to play: start with the Starter Set, and come back for a better one when your game asks for it."}}
ASSETS = {s[0]: {"kind": "nft", "collection": COLL, "key": s[0]} for s in SETS}

# ---------------------------------------------------------------- models: a golf bag standing up, club heads out of the top
PARTS_NEW = {}
def part(pid, kind, **kw):
    d = {"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": kind}; d.update(kw); PARTS_NEW[pid] = d; return d
def S(t, s, c, p, **kw):
    d = {"t": t, "s": s, "c": c, "p": p}; d.update(kw); return d

STEEL, CHROME, DARK, GRIP = "#a8adb5", "#d4d8de", "#24262a", "#1e1e20"
# clubs out of the bag: [x, z, kind, height of the shaft top]; woods at the back, irons in the middle, the putter at the front
CLUBS = [(-0.04, -0.045, 'wood', 0.93), (0.035, -0.05, 'wood', 0.9), (-0.06, 0.01, 'iron', 0.86), (0.0, 0.0, 'iron', 0.88),
         (0.055, 0.015, 'iron', 0.85), (0.02, 0.055, 'putter', 0.82)]

def bag(iid, body, trim, band=None, band2=None, head=STEEL, wood=STEEL, iron=None, cover=None, pom=None, pocket=None, strap=DARK):
    sh = [S('cyl', [0.105, 0.1, 0.6], "$c", [0, 0.33, 0], seg=14),                       # the bag
          S('cyl', [0.104, 0.104, 0.05], trim, [0, 0.03, 0], seg=14),                    # its foot
          S('cyl', [0.116, 0.112, 0.07], trim, [0, 0.63, 0], seg=14),                    # the collar
          S('cyl', [0.1, 0.1, 0.01], DARK, [0, 0.665, 0], seg=14),                       # inside the mouth
          S('box', [0.13, 0.3, 0.05], pocket or body, [0, 0.3, 0.1], k=[1, 1, 1]),       # the front pocket
          S('box', [0.11, 0.012, 0.052], trim, [0, 0.41, 0.102]),                        # its zip
          S('tube', [0.012], strap, [0, 0, 0], pts=[[0, 0.58, -0.1], [0, 0.36, -0.24], [0, 0.14, -0.1]])]   # the strap
    if band: sh.append(S('cyl', [0.108, 0.107, 0.03], band, [0, 0.48, 0], seg=14))
    if band2: sh.append(S('cyl', [0.106, 0.104, 0.02], band2, [0, 0.2, 0], seg=14))
    for x, z, kind, top in CLUBS:
        h = top - 0.6
        sh.append(S('cyl', [0.007, 0.007, h], GRIP if kind == 'putter' else STEEL, [x, 0.6 + h / 2, z], seg=5))
        if kind == 'wood':
            if cover:   # a knitted head cover, a bobble on top
                sh.append(S('sphere', [0.042], cover, [x, top + 0.02, z], seg=[10, 7], k=[1, 1.35, 1]))
                sh.append(S('cyl', [0.03, 0.03, 0.025], trim, [x, top - 0.03, z], seg=8))
                if pom: sh.append(S('sphere', [0.017], pom, [x, top + 0.075, z], seg=[8, 6]))
            else:
                sh.append(S('sphere', [0.042], wood, [x, top + 0.012, z + 0.012], seg=[10, 7], k=[1.15, 0.72, 1.3]))
        elif kind == 'iron':
            sh.append(S('box', [0.016, 0.04, 0.062], iron or head, [x, top + 0.012, z + 0.022], r=[0.35, 0, 0]))
        else:
            sh.append(S('box', [0.02, 0.022, 0.085], head, [x, top + 0.01, z + 0.03]))
    part("item." + iid, "item", items={iid: body}, shapes=sh)

bag("golf_starter", "#c9b68c", "#6b4a2b", pocket="#b8a47a")                                                    # canvas, leather trim, plain steel
bag("golf_standard", "#7a4524", "#e2d6b8", band="#e2d6b8", wood=DARK, head=CHROME, pocket="#6a3a1e")             # brown leather, cream bands
bag("golf_pro", "#1f2d5c", "#f0f0f0", band="#b02a2a", band2="#f0f0f0", head=CHROME, cover="#1f2d5c", pom="#f0f0f0",
    pocket="#18244a", strap="#f0f0f0")                                                                          # navy tour bag, knit covers
bag("golf_master", "#f4f2ec", "#d9a930", band="#d9a930", band2="#d9a930", head=CHROME, iron="#e2c25a", cover="#d9a930",
    pom="#f4f2ec", pocket="#e8e4da", strap="#d9a930")                                                           # white and gold

# ---------------------------------------------------------------- the golf people's clothes (NPC-only: homes [])
part('cloth.hat_flatcap', 'cloth', slot='hat', style='flatcap', color='#7a6a4a', hides=['hairCap'], homes=[], shapes=[
    S('sphere', [0.172], "$c", [0, 0.165, 0.015], seg=[12, 6], th=0.5, k=[1.05, 0.7, 1.15], j='head'),
    S('box', [0.19, 0.016, 0.08], "$c:0.85", [0, 0.175, 0.18], r=[0.28, 0, 0], j='head')])
part('cloth.hat_visor', 'cloth', slot='hat', style='visor', color='#f0f0f0', hides=[], homes=[], shapes=[
    S('cyl', [0.158, 0.158, 0.035], "$c", [0, 0.2, 0], seg=14, open=True, ds=True, j='head'),
    S('sphere', [0.12], "$c:0.92", [0, 0.185, 0.13], seg=[12, 5], k=[1.1, 0.09, 0.8], j='head')])
part('cloth.shirt_tweed', 'cloth', slot='shirt', style='tweed', homes=[],   # a tweed jacket over a shirt and tie
     paint={"torso": "$c", "bust": "$c", "shoulder": "$c", "upperArm": "$c", "lowerArm": "$c"}, shapes=[
    S('cyl', ["0.176*W", "0.196*W", 0.18], "$c", [0, -0.07, 0], seg=9, k=[1, 1, 0.72], j='hips'),       # the skirt of the jacket
    S('box', [0.06, 0.17, 0.012], "#ece6d6", [0, 0.39, 0.114], j='torso'),                               # the shirt front
    S('box', [0.024, 0.15, 0.012], "#6a2a2a", [0, 0.375, 0.122], j='torso'),                             # the tie
    S('box', [0.045, 0.2, 0.014], "$c:0.78", [0.05, 0.36, 0.117], r=[0, 0, 0.3], j='torso'),             # lapels
    S('box', [0.045, 0.2, 0.014], "$c:0.78", [-0.05, 0.36, 0.117], r=[0, 0, -0.3], j='torso'),
    S('sphere', [0.011], "#3a2a1a", [0, 0.2, 0.112], seg=[6, 4], j='torso'),                             # buttons
    S('sphere', [0.011], "#3a2a1a", [0, 0.13, 0.108], seg=[6, 4], j='torso'),
    S('box', [0.05, 0.03, 0.02], "$c:0.7", [0.1, 0.12, 0.09], r=[0, 0.5, 0], j='torso')])                 # a pocket flap
part('cloth.shirt_polo', 'cloth', slot='shirt', style='polo', homes=[],   # short sleeves, a collar and a placket
     paint={"torso": "$c", "bust": "$c", "shoulder": "$c", "upperArm": "$c"}, shapes=[
    S('box', [0.065, 0.014, 0.05], "$c:1.12", [0.04, 0.505, 0.075], r=[0.5, 0, -0.35], j='torso'),
    S('box', [0.065, 0.014, 0.05], "$c:1.12", [-0.04, 0.505, 0.075], r=[0.5, 0, 0.35], j='torso'),
    S('box', [0.026, 0.1, 0.01], "$c:0.88", [0, 0.44, 0.118], j='torso'),
    S('sphere', [0.007], "#f4f4f4", [0, 0.465, 0.124], seg=[6, 4], j='torso'),
    S('sphere', [0.007], "#f4f4f4", [0, 0.425, 0.124], seg=[6, 4], j='torso'),
    S('cyl', [0.066, 0.064, 0.03], "$c:0.9", [0, -0.22, 0], seg=8, j='sh*')])                             # the sleeve hems
part('cloth.pants_pleated', 'cloth', slot='pants', style='pleated', homes=[],   # a knee-length pleated skirt
     paint={"pelvis": "$c"}, shapes=[
    S('cyl', ["0.18*W*(1+0.16*fem)", "0.24*W*(1+0.1*fem)", 0.36], "$c", [0, -0.19, 0], seg=16, k=[1, 1, 0.75], j='hips')]
    + [S('group', [], "$c", [round(0.236 * math.sin(a), 4), -0.19, round(0.236 * 0.75 * math.cos(a), 4)], r=[0, round(a, 4), 0], j='hips',
         children=[S('box', [0.01, 0.35, 0.028], "$c:0.82", [0, 0, 0], r=[-0.15, 0, 0])])   # the pleats, leaning out with the flare
       for a in [i * math.pi / 6 for i in range(12)]])

# ---------------------------------------------------------------- the two golf people
part('char.fergus', 'char', role='npc', name='Fergus the starter', body='humanoid', build='normal',
     outfit={"skin": "#e8b896", "hair": "short", "hairColor": "#d8d4cc", "beard": "moustache", "beardColor": "#d8d4cc", "eyes": "#5a6a7a",
             "hat": {"style": "flatcap", "color": "#7a6a4a"}, "shirt": {"style": "tweed", "color": "#8a7452"},
             "pants": {"style": "trousers", "color": "#5a5040"}, "boots": "#3a2618"})
part('char.isla', 'char', role='npc', name='Isla the club pro', body='humanoid', build='normal',
     outfit={"body": "female", "skin": "#f1c9a5", "hair": "ponytail", "hairColor": "#a0522a", "eyes": "#3a6a4a",
             "hat": {"style": "visor", "color": "#f0f0f0"}, "shirt": {"style": "polo", "color": "#2f6a4a"},
             "pants": {"style": "pleated", "color": "#e8e4d8"}, "boots": "#f0f0f0", "belt": "#2a2a2a", "gloves": "#f4f4f4"})


def load(p): return json.load(open(p, encoding='utf-8'))
def save_pretty(p, d):
    with open(p, 'w', encoding='utf-8') as f: json.dump(d, f, indent=1, ensure_ascii=False); f.write('\n')
def save_live(p, d, sep=(',', ':')):
    with open(p, 'w', encoding='utf-8') as f: json.dump(d, f, separators=sep, ensure_ascii=False)

def add_rules(D):
    it = D.setdefault('items', {})
    tl = it.setdefault('categories', {}).setdefault('tool', [])
    if 'golfset' not in tl: tl.append('golfset')
    it.setdefault('traits', {})['Set'] = 'golfSet'

if __name__ == '__main__':
    # items + shop + rules: the hand-written overlay (what tools/make_data.py merges) and the live modules
    ep = os.path.join(EX, 'items.json'); E = load(ep); E['items'].update(json.loads(json.dumps(ITEMS))); save_pretty(ep, E)
    lp = os.path.join(DD, 'items.json'); L = load(lp); L['data']['items'].update(json.loads(json.dumps(ITEMS))); save_live(lp, L)
    ep = os.path.join(EX, 'shops.json'); E = load(ep); E['shops'].update(json.loads(json.dumps(SHOP))); save_pretty(ep, E)
    lp = os.path.join(DD, 'shops.json'); L = load(lp); L['data']['shops'].update(json.loads(json.dumps(SHOP))); save_live(lp, L)
    ep = os.path.join(EX, 'rules.json'); E = load(ep); add_rules(E); save_pretty(ep, E)
    lp = os.path.join(DD, 'rules.json'); L = load(lp); add_rules(L['data']); save_live(lp, L)
    # assets: only the four new keys (tools/make_assets.py would also turn the farming tokens into NFTs)
    ap = os.path.join(DD, 'assets.json'); A = load(ap)
    for k, v in ASSETS.items(): A['data']['items'][k] = v
    save_live(ap, A, sep=(', ', ': '))
    for pid, P in PARTS_NEW.items():
        json.dump(P, open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    print('proshop: %d items, %d parts' % (len(ITEMS), len(PARTS_NEW)))
