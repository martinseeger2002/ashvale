#!/usr/bin/env python3
"""make_combat_balance.py - combat styles and their armour, after Old School RuneScape (2026-10-19, the operator: "balance the combat
skills, their equipment and what affects what - use the balance of osrs for reference - magic negatively affected by metal melee type
armour, where someone wearing a full set of metal armour and a wizard staff would be lucky to hit 1 in 10 - properly tiered wizard gear,
more plentiful for lower level access, and magic hats that actually affect stats - range armour that can also be used with magic builds,
less defence but more than magic gear at the trade off for magic bonus - range gear should buff ranged stats dramatically").

- Metal armour (helmet, platebody, chainbody, platelegs, kiteshield) weighs on spells and arrows: each piece takes a share off your
  Magic and Ranged accuracy (traits "Magic penalty" / "Ranged penalty", percent; the same at every tier, as in OSRS, where all plate is
  alike). A full set - helm, body, legs, shield - takes 89 % off magic accuracy (src/core.js caps the total at 92 %): a wizard in
  plate lands about 1 spell in 10. Arrows suffer less (24 %).
- Mage robes in five tiers - hat, top, bottoms - Magic and a little Defence, no penalty; the first three sold in town (Wren's in
  Ashvale, the Saltmere Enchantery), the fourth at the Frostspire, the fifth the Circle's own (the wizard cloak, and its hat here).
  The wizard hat Wren has always sold now gives Magic +3; her coloured robes Magic +1.
- Ranged armour in five tiers - coif, body, chaps, boots - big Ranged bonuses and middling Defence (more than robes, less than plate),
  no magic penalty: an archer's armour, and a caster's who would rather be hit less than hit more often.
- All new pieces are listed as tokens to inscribe (no propertyid until issued). Examine lines drafted by the local Qwen model, edited.
    python3 tools/combat/make_combat_balance.py      (then python3 build.py)
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'castle'))
from make_castle_extras import overlay, load, DD, EX, PARTS   # noqa: E402

# ------------------------------------------------ metal armour: percent off Magic and Ranged accuracy (all tiers alike)
PENALTY = {"platebody": (35, 10), "chainbody": (25, 6), "platelegs": (22, 7), "helmet": (12, 3), "kiteshield": (20, 4)}

# ------------------------------------------------ mage robes: (tier, req, colour, name, (hat M, D), (top M, D), (bottoms M, D), value base)
ROBES = [
    (1, 1, "#6a7a9a", "Apprentice", (2, 0), (4, 2), (3, 1), 60),
    (2, 10, "#2f6a5a", "Adept", (3, 1), (5, 4), (4, 2), 220),
    (3, 20, "#5a3a8a", "Mystic", (4, 2), (7, 6), (5, 4), 700),
    (4, 30, "#262634", "Arcane", (5, 3), (8, 9), (6, 6), 2200),
]
CIRCLE_HAT = (5, 40, "#2c3488", "Circle hat", (6, 4), 3500)
# ------------------------------------------------ ranged armour: (tier, req, colour, name, coif (R, D), body, chaps, boots, value base)
HIDES = [
    (1, 1, "#8a6a40", "Leather", (2, 2), (5, 5), (3, 3), (1, 1), 50),
    (2, 10, "#6a4a2a", "Studded", (4, 4), (9, 9), (6, 6), (2, 2), 180),
    (3, 20, "#8a8a82", "Wolfhide", (6, 6), (14, 14), (9, 9), (3, 3), 600),
    (4, 30, "#b8c8d8", "Frosthide", (9, 9), (20, 20), (13, 13), (4, 4), 2000),
    (5, 40, "#7a2a1a", "Dragonhide", (12, 12), (28, 28), (18, 18), (6, 6), 6500),
]
DRAFT = json.load(open(os.path.join(HERE, 'qwen_draft.json')))
def ex(set_, piece, fallback):
    s = (DRAFT.get(set_) or {}).get(piece) or fallback
    return s.strip().rstrip('.') + '.'

def gear(name, sub, tier, req, model, value, stats, examine, weight):
    attrs = [{"trait_type": k, "value": v} for k, v in stats if v]
    statline = ', '.join('%s +%d' % (k, v) for k, v in stats if v)
    return {"name": name, "description": examine + (' ' + statline + '.' if statline else '') + ' Made in the valley of Ashvale.', "examine": examine,
            "collection": "ASHVALE Armoury", "game": "ashvale", "category": "armour", "subcategory": sub, "tier": tier, "weight": weight,
            "req": req, "model": model, "value": value, "attributes": attrs}

ITEMS, COLOURS = {}, {"cloth.hat_wizard": {}, "gear.robetop": {}, "gear.robelegs": {}, "gear.coif": {}, "gear.hidebody": {}, "gear.chaps": {}, "gear.boots": {}}
for t, rq, col, nm, hat, top, bot, val in ROBES:
    k = nm.lower(); R = {"magic": rq}
    ITEMS[k + "_hat"] = gear(nm + " hat", "hood", t, R, "cloth.hat_wizard", val, [("Magic", hat[0]), ("Defence", hat[1])], ex(k, "hat", nm + " hat: helps your spells land."), 300)
    ITEMS[k + "_top"] = gear(nm + " robe top", "robe", t, R, "gear.robetop", val * 2, [("Magic", top[0]), ("Defence", top[1])], ex(k, "top", nm + " robe top: helps your spells land."), 1100)
    ITEMS[k + "_bottoms"] = gear(nm + " robe bottoms", "robelegs", t, R, "gear.robelegs", int(val * 1.5), [("Magic", bot[0]), ("Defence", bot[1])], ex(k, "bottoms", nm + " robe bottoms: help your spells land."), 900)
    COLOURS["cloth.hat_wizard"][k + "_hat"] = col; COLOURS["gear.robetop"][k + "_top"] = col; COLOURS["gear.robelegs"][k + "_bottoms"] = col
t, rq, col, nm, hat, val = CIRCLE_HAT
ITEMS["circle_hat"] = gear(nm, "hood", t, {"magic": rq}, "cloth.hat_wizard", val, [("Magic", hat[0]), ("Defence", hat[1])], ex("circle_hat", "hat", "The Circle's tall blue hat, to go with the wizard cloak."), 300)
COLOURS["cloth.hat_wizard"]["circle_hat"] = col
for t, rq, col, nm, coif, body, chaps, boots, val in HIDES:
    k = nm.lower(); R = {"ranged": rq}
    ITEMS[k + "_coif"] = gear(nm + " coif", "coif", t, R, "gear.coif", val, [("Ranged", coif[0]), ("Defence", coif[1])], ex(k, "coif", nm + " coif: helps arrows land."), 600)
    ITEMS[k + "_body"] = gear(nm + " body", "hidebody", t, R, "gear.hidebody", val * 3, [("Ranged", body[0]), ("Defence", body[1])], ex(k, "body", ex(k, "top", nm + " body: helps arrows land.")), 2500)
    ITEMS[k + "_chaps"] = gear(nm + " chaps", "chaps", t, R, "gear.chaps", val * 2, [("Ranged", chaps[0]), ("Defence", chaps[1])], ex(k, "chaps", nm + " chaps: help arrows land."), 1800)
    ITEMS[k + "_boots"] = gear(nm + " boots", "boots", t, R, "gear.boots", val, [("Ranged", boots[0]), ("Defence", boots[1])], ex(k, "boots", nm + " boots: help arrows land."), 700)
    for piece, part in (("coif", "gear.coif"), ("body", "gear.hidebody"), ("chaps", "gear.chaps"), ("boots", "gear.boots")): COLOURS[part][k + "_" + piece] = col

STUD = "#c8c8c0"
PARTS_NEW = {
    "gear.coif": {"ashvale3d": "part", "api": 1, "v": 1, "id": "gear.coif", "kind": "gear", "slot": "head", "family": "cloth", "items": {}, "hides": ["hat", "hair"],
        "shapes": [{"t": "sphere", "s": [0.182], "c": "$c", "p": [0, 0.14, -0.015], "seg": [12, 8], "th": 0.66, "r": [-0.5, 0, 0], "j": "head"},
                   {"t": "box", "s": [0.31, 0.3, 0.05], "c": "$c:0.9", "p": [0, -0.01, -0.15], "j": "head"},
                   {"t": "box", "s": [0.3, 0.035, 0.03], "c": "$c:0.7", "p": [0, 0.13, 0.15], "r": [-0.3, 0, 0], "j": "head"}],
        "groundShapes": [{"t": "sphere", "s": [0.11], "c": "$c", "p": [0, 0.05, 0], "k": [1, 0.6, 1]}]},
    "gear.hidebody": {"ashvale3d": "part", "api": 1, "v": 1, "id": "gear.hidebody", "kind": "gear", "slot": "body", "family": "cloth", "items": {},
        "shapes": [{"t": "cyl", "s": ["0.215*W", "0.2*W", 0.5], "c": "$c", "p": [0, 0.25, 0], "seg": 10, "k": [1, 1, 0.74], "j": "torso"},
                   {"t": "cyl", "s": ["0.2*W", "0.22*W", 0.14], "c": "$c:0.85", "p": [0, -0.04, 0], "seg": 10, "k": [1, 1, 0.78], "j": "hips"},
                   {"t": "box", "s": [0.4, 0.04, 0.05], "c": "$c:0.6", "p": [0, 0.04, 0.0], "j": "torso", "k": [1, 1, 3.2]},
                   {"t": "sphere", "s": [0.085], "c": "$c:0.8", "p": [0, 0.02, 0], "k": [1.2, 0.7, 1.1], "j": "sh*"},
                   {"t": "capsule", "s": [0.07, 0.12], "c": "$c", "p": [0, -0.1, 0], "j": "sh*"}]
                  + [{"t": "sphere", "s": [0.012], "c": STUD, "p": [x, y, 0.15], "j": "torso"} for x in (-0.09, 0, 0.09) for y in (0.15, 0.3, 0.42)],
        "groundShapes": [{"t": "box", "s": [0.4, 0.05, 0.36], "c": "$c", "p": [0, 0.03, 0]}, {"t": "box", "s": [0.42, 0.06, 0.04], "c": "$c:0.6", "p": [0, 0.04, 0.05]}]},
    "gear.chaps": {"ashvale3d": "part", "api": 1, "v": 1, "id": "gear.chaps", "kind": "gear", "slot": "legs", "family": "cloth", "items": {},
        "shapes": [{"t": "cyl", "s": [0.085, 0.075, 0.36], "c": "$c", "p": [0, -0.17, 0], "seg": 8, "j": "hip*"},
                   {"t": "cyl", "s": [0.07, 0.06, 0.34], "c": "$c:0.9", "p": [0, -0.17, 0], "seg": 8, "j": "knee*"},
                   {"t": "cyl", "s": ["0.21*W", "0.215*W", 0.1], "c": "$c:0.8", "p": [0, -0.02, 0], "seg": 10, "k": [1, 1, 0.78], "j": "hips"}],
        "groundShapes": [{"t": "box", "s": [0.36, 0.05, 0.42], "c": "$c", "p": [0, 0.03, 0]}]},
}

if __name__ == '__main__':
    live_items = load(os.path.join(DD, 'items.json'))['data']; live_items = live_items.get('items', live_items)
    patch = {}
    # metal armour penalties (live items, every tier)
    for k, v in live_items.items():
        if not isinstance(v, dict) or v.get('category') != 'armour' or v.get('subcategory') not in PENALTY: continue
        mp, rp = PENALTY[v['subcategory']]
        attrs = [a for a in v.get('attributes', []) if a.get('trait_type') not in ('Magic penalty', 'Ranged penalty')] + [{"trait_type": "Magic penalty", "value": mp}, {"trait_type": "Ranged penalty", "value": rp}]
        desc = re.sub(r'\s*Magic accuracy -\d+%, Ranged accuracy -\d+%\.', '', v.get('description', ''))
        patch[k] = {"attributes": attrs, "description": desc.rstrip() + ' Magic accuracy -%d%%, Ranged accuracy -%d%%.' % (mp, rp)}
    # the wizard hat and Wren's coloured robes: real (small) Magic
    for k, m in [("hat_wizard", 3)] + [(r, 1) for r in ("robe_red", "robe_blue", "robe_green", "robe_purple", "robe_black", "robe_gold", "robe_linen")]:
        if k in live_items:
            attrs = [a for a in live_items[k].get('attributes', []) if a.get('trait_type') != 'Magic'] + [{"trait_type": "Magic", "value": m}]
            patch[k] = {"attributes": attrs, "examine": ("A proper wizard's hat, pointed and starry." if k == 'hat_wizard' else "A plain robe with a touch of the arcane in the weave.")}
    for mod, key, new, whole in (("items", "items", ITEMS, True), ("items", "items", patch, False)):
        ep = os.path.join(EX, mod + '.json'); exd = load(ep) if os.path.exists(ep) else {key: {}}
        if whole: exd.setdefault(key, {}).update(json.loads(json.dumps(new)))
        else: overlay(exd.setdefault(key, {}), json.loads(json.dumps(new)))
        with open(ep, 'w', encoding='utf-8') as f: json.dump(exd, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp)
        if whole: live['data'][key].update(json.loads(json.dumps(new)))
        else:
            for k, v in new.items(): live['data'][key][k].update(json.loads(json.dumps(v)))
        with open(lp, 'w', encoding='utf-8') as f: json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
    # rules: the new armour kinds and their slots, the penalty traits (live and extra)
    for rp in (os.path.join(DD, 'rules.json'), os.path.join(EX, 'rules.json')):
        R = load(rp); D = R['data'] if 'data' in R else R; base = load(os.path.join(DD, 'rules.json'))['data']['items']
        it = D.setdefault('items', {}); cats = it.setdefault('categories', {})
        arm = list(cats.get('armour') or base['categories']['armour'])
        for kd in ("hood", "coif", "hidebody", "chaps"):
            if kd not in arm: arm.append(kd)
        cats['armour'] = arm
        it.setdefault('slots', {}).update({"armour/hood": "head", "armour/coif": "head", "armour/hidebody": "body", "armour/chaps": "legs"})
        tr = it.setdefault('traits', dict(base.get('traits') or {})); tr.update({"Magic penalty": "magicPen", "Ranged penalty": "rangedPen"})
        if rp.startswith(os.path.join(DD, 'rules')): json.dump(R, open(rp, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
        else:
            with open(rp, 'w', encoding='utf-8') as f: json.dump(R, f, indent=1, ensure_ascii=False); f.write('\n')
    # shops: the lower tiers in town, the higher further out
    SHOPS = {"tailor": ["apprentice_hat", "apprentice_top", "apprentice_bottoms"],
             "salt_magic": ["adept_hat", "adept_top", "adept_bottoms", "mystic_hat", "mystic_top", "mystic_bottoms"],
             "tower_magic": ["arcane_hat", "arcane_top", "arcane_bottoms", "circle_hat"],
             "armoury": ["leather_coif", "leather_body", "leather_chaps", "leather_boots", "studded_coif", "studded_body", "studded_chaps", "studded_boots"],
             "salt_armoury": ["studded_coif", "studded_body", "studded_chaps", "studded_boots", "wolfhide_coif", "wolfhide_body", "wolfhide_chaps", "wolfhide_boots"],
             "castle_armoury": ["wolfhide_coif", "wolfhide_body", "wolfhide_chaps", "wolfhide_boots", "frosthide_coif", "frosthide_body", "frosthide_chaps", "frosthide_boots",
                                "dragonhide_coif", "dragonhide_body", "dragonhide_chaps", "dragonhide_boots"]}
    sp = os.path.join(DD, 'shops.json'); S = load(sp)
    for sid, add in SHOPS.items():
        if sid not in S['data']['shops']: print('note: no shop', sid); continue
        st = S['data']['shops'][sid]['stock']
        for i in add:
            if i not in st: st.append(i)
        b = S['data']['shops'][sid].get('buys')
        if isinstance(b, list) and 'armour' not in b and sid in ('tailor', 'salt_magic', 'tower_magic'): b.append('armour')
    json.dump(S, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    # tokens to inscribe
    ap = os.path.join(DD, 'assets.json'); A = load(ap)
    for k, v in ITEMS.items(): A['data']['items'].setdefault(k, {"kind": "token", "name": "ASHVALE " + v['name'].upper(), "inscribe": "pending: issue the token, then add its propertyid"})
    json.dump(A, open(ap, 'w', encoding='utf-8'), ensure_ascii=False)
    # models: the new parts, then every piece's colour in its part (leaving a part's own layout alone when nothing changes)
    for pid, P in PARTS_NEW.items():
        pp = os.path.join(PARTS, pid + '.json'); old = load(pp) if os.path.exists(pp) else {}
        json.dump(dict(P, items=dict(old.get('items', {}))), open(pp, 'w', encoding='utf-8'), indent=1)
    for pid, cols in COLOURS.items():
        pp = os.path.join(PARTS, pid + '.json'); txt = open(pp, encoding='utf-8').read(); P = json.loads(txt)
        if all(P.get('items', {}).get(k) == v for k, v in cols.items()): continue
        P.setdefault('items', {}).update(cols); pretty = '\n' in txt.strip()
        with open(pp, 'w', encoding='utf-8') as f: json.dump(P, f, indent=1 if pretty else None, separators=None if pretty else (',', ':'), ensure_ascii=False)
    print('combat: %d new pieces, %d metal pieces with penalties, %d robes/hats with Magic' % (len(ITEMS), sum(1 for k in patch if 'Magic penalty' in json.dumps(patch[k])), sum(1 for k in patch if 'Magic penalty' not in json.dumps(patch[k]))))
