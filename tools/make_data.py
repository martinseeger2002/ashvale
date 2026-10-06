"""make_data.py - build the ASHVALE 3D data modules (data/*.json) from the original ASHVALE world (~/ashvale/world.json).

Read-only use of ~/ashvale/world.json: the 35 Armoury item kinds (names, slots, tiers, requirements, bonuses, copies),
the monsters (stats, drops, gold), the Whisperwood tile map + spawns, the quest and the village shop. Everything new for the
3D game (village layout, arrows, food, tools, gathering, prices) is added here so the old keys stay the NFT keys.

Each data module is one JSON file: {"ashvale3d":"module","name":...,"api":1,"v":N,"data":{...}}.
Run: python3 tools/make_data.py   (deterministic: same input -> byte-identical output)
"""
import json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'data')
WORLD = json.load(open(os.path.expanduser('~/ashvale/world.json')))

DATA_API = 1          # bump only when a field's MEANING changes (adding fields is fine without a bump)


def module(name, v, data):
    os.makedirs(OUT, exist_ok=True)
    m = {"ashvale3d": "module", "name": name, "api": DATA_API, "v": v, "data": data}
    path = os.path.join(OUT, name + '.json')
    with open(path, 'w') as f:
        json.dump(m, f, separators=(',', ':'), sort_keys=False)
    print('%-26s %6d bytes' % (name + '.json', os.path.getsize(path)))


# ---------------------------------------------------------------- items
TIER_MULT = [0, 1, 3.5, 12, 40, 130]
SLOT_BASE = {"helmet": 20, "body": 60, "legs": 40, "sword": 30, "shield": 35, "bow": 40, "staff": 40}
EQUIP_SLOT = {"helmet": "head", "body": "body", "legs": "legs", "sword": "weapon", "bow": "weapon", "staff": "weapon",
              "shield": "shield", "arrows": "ammo"}
items = {}
for key, it in WORLD['items'].items():
    slot, tier = it['slot'], it['tier']
    d = {"name": it['name'], "kind": slot, "tier": tier, "eq": EQUIP_SLOT[slot], "req": it['req'],
         "value": int(round(SLOT_BASE[slot] * TIER_MULT[tier])), "nft": {"copies": it['copies'], "key": key}}
    for b in ('attack', 'strength', 'defence', 'ranged', 'magic'):
        if it.get(b):
            d[b] = it[b]
    if slot == 'sword':
        d['speed'] = 4; d['range'] = 1; d['class'] = 'melee'; d['anim'] = 'slash'
    if slot == 'bow':
        d['speed'] = 4; d['range'] = 7; d['class'] = 'ranged'; d['anim'] = 'bow'; d['twoHanded'] = True
    if slot == 'staff':
        d['speed'] = 5; d['range'] = 8; d['class'] = 'magic'; d['anim'] = 'cast'
    items[key] = d

# Abilities as data (the operator: "a staff that does frost damage and freezes the enemy for a certain amount of time"):
items["staff_frost"] = {"name": "Frost staff", "kind": "staff", "tier": 3, "eq": "weapon", "req": {"magic": 20}, "magic": 22,
                        "value": 600, "speed": 5, "range": 8, "class": "magic", "anim": "cast",
                        "effect": "freeze", "effectTicks": 5, "effectChance": 25}
# Saltmere's enchantments (2026-10-05: "a magic store with some new magical items"). The engine already knows
# five effects (src/core.js EFFECTS); the valley sells one of them. Each of these gives up a little of its own
# weapon's strength for what it does on top, so they trade against the plain ladder rather than beating it.
items["staff_ember"] = {"name": "Ember staff", "kind": "staff", "tier": 2, "eq": "weapon", "req": {"magic": 10}, "magic": 13,
                        "value": 420, "speed": 5, "range": 8, "class": "magic", "anim": "cast",
                        "effect": "burn", "effectTicks": 6, "effectDamage": 2, "effectChance": 45}
items["staff_storm"] = {"name": "Storm staff", "kind": "staff", "tier": 4, "eq": "weapon", "req": {"magic": 30}, "magic": 28,
                        "value": 1900, "speed": 5, "range": 8, "class": "magic", "anim": "cast",
                        "effect": "slow", "effectTicks": 6, "effectChance": 45}
items["dagger_venom"] = {"name": "Venom dagger", "kind": "dagger", "tier": 3, "eq": "weapon", "req": {"attack": 20},
                         "attack": 11, "strength": 9, "value": 780, "speed": 3, "range": 1, "class": "melee", "anim": "stab",
                         "effect": "poison", "effectTicks": 9, "effectDamage": 2, "effectChance": 60}
items["bow_snare"] = {"name": "Snare bow", "kind": "bow", "tier": 3, "eq": "weapon", "req": {"ranged": 20}, "ranged": 19,
                      "value": 760, "speed": 4, "range": 7, "class": "ranged", "anim": "bow",
                      "effect": "slow", "effectTicks": 4, "effectChance": 35}
ARROW = [("Bronze", 7, 1, 1), ("Iron", 10, 3, 10), ("Steel", 16, 8, 20), ("Mithril", 22, 20, 30), ("Adamant", 31, 45, 40)]
for i, (metal, rstr, val, req) in enumerate(ARROW):
    items['arrows_t%d' % (i + 1)] = {"name": metal + " arrows", "kind": "arrows", "tier": i + 1, "eq": "ammo", "stack": True,
                                     "rstr": rstr, "value": val, "req": {"ranged": req}}

# The other three melee kinds and chainmail (models in tools/make_parts.py). Same five metal tiers and the same
# requirement ladder as the Armoury gear, same value rule (slot base x tier factor). No nft key: the 462 inscribed
# copies are the 35 original Armoury kinds, so these are ordinary items until stage 4 mints keys for them.
# Roles, so the four melee kinds are not one ladder with four names: the dagger swings every 3 ticks and hits softest,
# the sword (4) is the balanced middle, the mace (4) lands the hardest but is the most clumsy, the longsword (5)
# is the slow, accurate, strong one. Chainmail guards about two thirds of what a platebody of the same tier guards.
METALS = ["", "Bronze", "Iron", "Steel", "Mithril", "Adamant"]          # = tierNames.metal, the inscribed NFT names
REQS = [0, 1, 10, 20, 30, 40]                                           # the Armoury's attack/defence ladder per tier
for kind, (nm, base, speed, anim, atk, strr) in {
        "dagger": ("dagger", 25, 3, "stab", [3, 8, 13, 19, 27], [2, 6, 11, 17, 24]),
        "longsword": ("longsword", 45, 5, "slash", [5, 12, 20, 30, 42], [5, 11, 19, 28, 40]),
        "mace": ("mace", 35, 4, "crush", [3, 7, 12, 18, 25], [7, 14, 22, 32, 46])}.items():
    for t in range(1, 6):
        items["%s_t%d" % (kind, t)] = {"name": "%s %s" % (METALS[t], nm), "kind": kind, "tier": t, "eq": "weapon",
                                       "req": {"attack": REQS[t]}, "attack": atk[t - 1], "strength": strr[t - 1],
                                       "value": int(round(base * TIER_MULT[t])), "speed": speed, "range": 1,
                                       "class": "melee", "anim": anim}
CHAIN_DEF = [5, 11, 18, 26, 35]                                         # platebody is 8, 16, 26, 38, 52
for t in range(1, 6):
    items["chain_t%d" % t] = {"name": METALS[t] + " chainbody", "kind": "chainbody", "tier": t, "eq": "body",
                              "req": {"defence": REQS[t]}, "defence": CHAIN_DEF[t - 1], "value": int(round(45 * TIER_MULT[t]))}
items.update({
    "coins": {"name": "GOLD", "kind": "coins", "stack": True, "value": 1},
    "bread": {"name": "Bread", "kind": "food", "heal": 5, "value": 5},
    "potion": {"name": "Healing potion", "kind": "food", "healPct": 50, "value": 30, "drink": True},
    "shrimp_raw": {"name": "Raw shrimps", "kind": "raw", "value": 3, "cooks": "shrimp", "burns": "shrimp_burnt", "cookReq": 1, "cookXp": 30},
    "shrimp": {"name": "Shrimps", "kind": "food", "heal": 3, "value": 6},
    "shrimp_burnt": {"name": "Burnt shrimps", "kind": "junk", "value": 0},
    # the fish ladder above shrimps: cookReq is the cooking difficulty (burn chance 40% at that level, -4% a level up)
    "trout_raw": {"name": "Raw trout", "kind": "raw", "value": 8, "cooks": "trout", "burns": "trout_burnt", "cookReq": 5, "cookXp": 50},
    "trout": {"name": "Trout", "kind": "food", "heal": 4, "value": 14},
    "trout_burnt": {"name": "Burnt trout", "kind": "junk", "value": 0},
    "salmon_raw": {"name": "Raw salmon", "kind": "raw", "value": 15, "cooks": "salmon", "burns": "salmon_burnt", "cookReq": 10, "cookXp": 70},
    "salmon": {"name": "Salmon", "kind": "food", "heal": 6, "value": 24},
    "salmon_burnt": {"name": "Burnt salmon", "kind": "junk", "value": 0},
    "lobster_raw": {"name": "Raw lobster", "kind": "raw", "value": 25, "cooks": "lobster", "burns": "lobster_burnt", "cookReq": 15, "cookXp": 90},
    "lobster": {"name": "Lobster", "kind": "food", "heal": 8, "value": 40},
    "lobster_burnt": {"name": "Burnt lobster", "kind": "junk", "value": 0},
    # the hawk ring (2026-10-04): worn, it turns you into a hawk flying over the tree line (src/core.js isHawk)
    "ring_hawk": {"name": "Hawk ring", "kind": "ring", "value": 500, "form": "hawk", "nft": {"copies": 2, "key": "ring_hawk"}},
    # meat (2026-10-04: chickens and hens "should drop meat that can be cooked"): cooks like a shrimp
    "chicken_raw": {"name": "Raw chicken", "kind": "raw", "value": 3, "cooks": "chicken_cooked", "burns": "chicken_burnt", "cookReq": 1, "cookXp": 30},
    "chicken_cooked": {"name": "Cooked chicken", "kind": "food", "heal": 3, "value": 6},
    "chicken_burnt": {"name": "Burnt chicken", "kind": "junk", "value": 0},
    # every animal you would eat drops its own meat (2026-10-04: "A wild boar should drop boar meat. A wild deer should drop venison")
    "rat_meat_raw": {"name": "Raw rat meat", "kind": "raw", "value": 1, "cooks": "rat_meat_cooked", "burns": "rat_meat_burnt", "cookReq": 1, "cookXp": 20},
    "rat_meat_cooked": {"name": "Cooked rat meat", "kind": "food", "heal": 2, "value": 3},
    "rat_meat_burnt": {"name": "Burnt rat meat", "kind": "junk", "value": 0},
    "hare_raw": {"name": "Raw hare", "kind": "raw", "value": 4, "cooks": "hare_cooked", "burns": "hare_burnt", "cookReq": 5, "cookXp": 40},
    "hare_cooked": {"name": "Roast hare", "kind": "food", "heal": 4, "value": 8},
    "hare_burnt": {"name": "Burnt hare", "kind": "junk", "value": 0},
    "goat_raw": {"name": "Raw goat meat", "kind": "raw", "value": 7, "cooks": "goat_cooked", "burns": "goat_burnt", "cookReq": 12, "cookXp": 60},
    "goat_cooked": {"name": "Roast goat", "kind": "food", "heal": 6, "value": 14},
    "goat_burnt": {"name": "Burnt goat", "kind": "junk", "value": 0},
    "venison_raw": {"name": "Raw venison", "kind": "raw", "value": 10, "cooks": "venison_cooked", "burns": "venison_burnt", "cookReq": 15, "cookXp": 70},
    "venison_cooked": {"name": "Venison steak", "kind": "food", "heal": 8, "value": 20},
    "venison_burnt": {"name": "Burnt venison", "kind": "junk", "value": 0},
    "boar_raw": {"name": "Raw boar meat", "kind": "raw", "value": 13, "cooks": "boar_cooked", "burns": "boar_burnt", "cookReq": 20, "cookXp": 80},
    "boar_cooked": {"name": "Roast boar", "kind": "food", "heal": 10, "value": 26},
    "boar_burnt": {"name": "Burnt boar", "kind": "junk", "value": 0},
    "hatchet": {"name": "Bronze hatchet", "kind": "tool", "tool": "woodcutting", "value": 16},
    "pickaxe": {"name": "Bronze pickaxe", "kind": "tool", "tool": "mining", "value": 20},
    "net": {"name": "Small fishing net", "kind": "tool", "tool": "fishing", "value": 5},
    "fishing_rod": {"name": "Fishing rod", "kind": "tool", "tool": "fishing", "value": 25},
    "lobster_pot": {"name": "Lobster pot", "kind": "tool", "tool": "fishing", "value": 45},
    # firemaking (the operator: "drop some wood, start a camp fire and cook"): level, burn time (ticks) and XP rise with the log type
    "logs": {"name": "Logs", "kind": "resource", "value": 4, "fireReq": 1, "burnTicks": 100, "fireXp": 40},
    "oak_logs": {"name": "Oak logs", "kind": "resource", "value": 12, "fireReq": 15, "burnTicks": 120, "fireXp": 60},
    "willow_logs": {"name": "Willow logs", "kind": "resource", "value": 25, "fireReq": 30, "burnTicks": 140, "fireXp": 90},
    "maple_logs": {"name": "Maple logs", "kind": "resource", "value": 45, "fireReq": 45, "burnTicks": 170, "fireXp": 135},
    "yew_logs": {"name": "Yew logs", "kind": "resource", "value": 80, "fireReq": 60, "burnTicks": 200, "fireXp": 202},
    "tinderbox": {"name": "Tinderbox", "kind": "tool", "tool": "firemaking", "value": 2},
    # Elder Maren's gift (2026-10-04): an engraved stone that takes you home to Ashvale, as often as you like, every 30 minutes
    "ashvale_stone": {"name": "Ashvale stone", "kind": "tool", "value": 0, "teleport": "ashvale", "cooldown": 3000, "collection": "ASHVALE Portal Stones"},   # its own collection (2026-10-04)
    # Cobb's gift at the end of the trail (2026-10-05: "Give you a Saltmere town portal stone"): the harbour end of the same road
    "saltmere_stone": {"name": "Saltmere stone", "kind": "tool", "value": 0, "teleport": "saltmere", "cooldown": 3000, "collection": "ASHVALE Portal Stones"},
    "castle_stone": {"name": "Lake Castle stone", "kind": "tool", "value": 0, "teleport": "castle", "cooldown": 3000, "arms": 1, "collection": "ASHVALE Portal Stones"},   # 2026-10-05: one, sent to @apple
    "copper_ore": {"name": "Copper ore", "kind": "resource", "value": 5},
    "tin_ore": {"name": "Tin ore", "kind": "resource", "value": 5},
    "iron_ore": {"name": "Iron ore", "kind": "resource", "value": 17},
    "coal": {"name": "Coal", "kind": "resource", "value": 20},
    "gold_ore": {"name": "Gold ore", "kind": "resource", "value": 40},
    "mithril_ore": {"name": "Mithril ore", "kind": "resource", "value": 70},
    "pelt": {"name": "Wolf pelt", "kind": "resource", "value": 30},        # 2026-10-01: animals drop only their pelt; pelts sell in town
    "rat_pelt": {"name": "Giant rat pelt", "kind": "resource", "value": 8},
    # and its own hide (the operator: "a pelt that matches the animal")
    "hare_pelt": {"name": "Hare pelt", "kind": "resource", "value": 5},
    "snow_hare_pelt": {"name": "Snow hare pelt", "kind": "resource", "value": 7},
    "goat_hide": {"name": "Goat hide", "kind": "resource", "value": 18},
    "deer_hide": {"name": "Deer hide", "kind": "resource", "value": 22},
    "boar_hide": {"name": "Boar hide", "kind": "resource", "value": 28},
    "timber_wolf_pelt": {"name": "Timber wolf pelt", "kind": "resource", "value": 45},
    "lizard_skin": {"name": "Sand lizard skin", "kind": "resource", "value": 12},
})
# hats and capes (cosmetic gear, sold by Wren the tailor; the models override the outfit's hat/cape while worn)
for k, nm, v in [("cap", "Red cap", 15), ("bandana", "Bandana", 15), ("hood", "Hood", 25), ("feather", "Feathered cap", 40),
                 ("wizard", "Wizard hat", 60), ("crown", "Gold crown", 1000)]:
    items["hat_" + k] = {"name": nm, "kind": "hat", "eq": "head", "value": v, "defence": 0}
for k, v in [("red", 50), ("blue", 50), ("green", 50), ("purple", 50), ("black", 50), ("gold", 250)]:
    items["cape_" + k] = {"name": k.capitalize() + " cape", "kind": "cape", "eq": "cape", "value": v}
# packs (worn on the back, eq 'pack'): add carry capacity, never slots (28 stay 28). t4-t5 only drop. No nft key yet
# (the operator decides what gets minted).
for t, (nm, carry, w, v) in enumerate([("Leather satchel", 10, 0.8, 40), ("Canvas pack", 20, 1.5, 150), ("Reinforced pack", 35, 2.5, 500),
                                         ("Frame pack", 55, 3.5, 2000), ("Enchanted pack", 80, 2.0, 8000)], 1):
    items["pack_t%d" % t] = {"name": nm, "kind": "pack", "tier": t, "eq": "pack", "carry": carry * 1000, "value": v, "_kg": w}

# ---- WEIGHT (2026-10-01: "Each item should be assigned weight ... according to what they would probably weigh").
# Stored as integer GRAMS in `weight` (the rules use integer maths). Worn equipment counts too, as in RuneScape.
# Table (kg): coins 0.002 each, arrows 0.02 each, potion 0.3, bread 0.4, shrimp 0.1, trout 0.4, salmon 1.0, lobster 0.7
# (raw/cooked/burnt alike), logs 3 (oak 3.5, willow 3, maple 3.5, yew 4), ores and coal 2, pelt 1.5, hatchet 1.2,
# pickaxe 2.2, net 0.5, rod 0.4, lobster pot 1.5, dagger 0.4, sword 1.2, longsword 1.6, mace 1.8, bow 0.8, staff 1.5,
# kiteshield 4, helm 2, platebody 12, chainbody 9, platelegs 8, hats 0.2, capes 0.8, packs 0.8-3.5.
# Metal gear x tier factor: bronze 1.1, iron 1.0, steel 1.0, mithril 0.6, adamant 1.05.
KG_KIND = {"dagger": 0.4, "sword": 1.2, "longsword": 1.6, "mace": 1.8, "bow": 0.8, "staff": 1.5, "shield": 4, "helmet": 2,
           "body": 12, "chainbody": 9, "legs": 8, "hat": 0.2, "cape": 0.8, "coins": 0.002, "arrows": 0.02, "ring": 0.01}
KG_ID = {"potion": 0.3, "bread": 0.4, "shrimp": 0.1, "trout": 0.4, "salmon": 1.0, "lobster": 0.7, "logs": 3, "oak_logs": 3.5,
         "willow_logs": 3, "maple_logs": 3.5, "yew_logs": 4, "pelt": 1.5, "rat_pelt": 0.3, "hatchet": 1.2, "pickaxe": 2.2, "net": 0.5,
         "fishing_rod": 0.4, "lobster_pot": 1.5, "tinderbox": 0.1, "ashvale_stone": 0.2, "saltmere_stone": 0.2, "castle_stone": 0.2, "chicken": 0.5, "chicken_cooked": 0.5,
         "rat_meat": 0.2, "rat_meat_cooked": 0.2, "hare": 0.4, "hare_cooked": 0.4, "goat": 0.8, "goat_cooked": 0.8, "venison": 0.8, "venison_cooked": 0.8, "boar": 1.0, "boar_cooked": 1.0,
         "hare_pelt": 0.2, "snow_hare_pelt": 0.2, "goat_hide": 1.0, "deer_hide": 1.4, "boar_hide": 1.8, "timber_wolf_pelt": 1.8, "lizard_skin": 0.3}   # a chicken: raw, cooked or burnt
METAL_KINDS = {"dagger", "sword", "longsword", "mace", "shield", "helmet", "body", "chainbody", "legs"}
METAL_F = [0, 1.1, 1.0, 1.0, 0.6, 1.05]
for k, d in items.items():
    if '_kg' in d: kg = d.pop('_kg')
    elif d['kind'] in KG_KIND:
        kg = KG_KIND[d['kind']] * (METAL_F[d['tier']] if d['kind'] in METAL_KINDS else 1)
    elif k.endswith('_ore') or k == 'coal': kg = 2
    else:
        base = k.replace('_raw', '').replace('_burnt', '')
        assert base in KG_ID, 'no weight for item ' + k
        kg = KG_ID[base]
    d['weight'] = int(round(kg * 1000))
# ---- ASHVALE ITEM SCHEMA v1 (2026-10-01: "utilizing the JSON string for item inscriptions and category and sub
# category for anything that is programmatic in the game"). items.json holds, per item id, exactly the JSON that would be
# inscribed (gear, packs, cosmetics = NFTs) or put in a token's data field (stackables = @ashvale tokens). Everything the
# rules need comes from category/subcategory (tables in rules.json "items") and the attributes; no per-id code.
CAT = {  # internal kind -> (category, subcategory)
    "sword": ("weapon", "sword"), "dagger": ("weapon", "dagger"), "longsword": ("weapon", "longsword"), "mace": ("weapon", "mace"),
    "bow": ("weapon", "bow"), "staff": ("weapon", "staff"), "helmet": ("armour", "helmet"), "body": ("armour", "platebody"),
    "chainbody": ("armour", "chainbody"), "legs": ("armour", "platelegs"), "shield": ("armour", "kiteshield"),
    "arrows": ("ammo", "arrow"), "coins": ("currency", "gold"), "hat": ("cosmetic", "hat"), "cape": ("cosmetic", "cape"),
    "pack": ("pack", "pack"), "ring": ("jewellery", "ring")}
SUB_OF_ID = {"ashvale_stone": "stone", "saltmere_stone": "stone", "castle_stone": "stone", "tinderbox": "tinderbox", "hatchet": "hatchet", "pickaxe": "pickaxe", "net": "net", "fishing_rod": "rod", "lobster_pot": "pot", "bread": "bread", "coal": "coal"}
MODEL = {"weapon": lambda sub, k: "gear." + sub, "armour": lambda sub, k: "gear." + {"kiteshield": "shield"}.get(sub, sub),
         "ammo": lambda sub, k: "gear.arrows", "pack": lambda sub, k: "gear.pack", "currency": lambda sub, k: "item.coins",
         "cosmetic": lambda sub, k: "cloth." + (k if sub == "hat" else "cape"),
         "tool": lambda sub, k: "item.stone" if sub == "stone" else "gear." + {"rod": "fishing_rod", "pot": "lobster_pot"}.get(sub, sub),
         "food": lambda sub, k: "item." + ("chicken" if sub == "meat" else "bread" if sub == "bread" else "lobster" if k.startswith("lobster") else "shrimp" if k.startswith("shrimp") else "fish"),
         "potion": lambda sub, k: "item.potion", "jewellery": lambda sub, k: "item.ring",
         "resource": lambda sub, k: "item." + {"logs": "logs", "ore": "ore", "coal": "ore", "pelt": "pelt", "meat": "chicken"}.get(sub, "lobster" if k.startswith("lobster") else "shrimp" if k.startswith("shrimp") else "fish")}
TRAIT = [("attack", "Attack", 1), ("strength", "Strength", 1), ("defence", "Defence", 1), ("ranged", "Ranged", 1), ("magic", "Magic", 1),
         ("rstr", "Ranged strength", 1), ("speed", "Speed", 1), ("range", "Range", 1), ("carry", "Carry", 0.001), ("heal", "Heal", 1),
         ("healPct", "Heal %", 1), ("cooks", "Cooks into", None), ("burns", "Burns into", None), ("cookReq", "Cooking level", 1),
         ("cookXp", "Cooking XP", 1), ("fireReq", "Firemaking level", 1), ("burnTicks", "Burn ticks", 1), ("fireXp", "Firemaking XP", 1),
         ("form", "Form", None), ("teleport", "Teleport", None), ("cooldown", "Cooldown ticks", 1), ("arms", "Call to arms", 1), ("effect", "Effect", None), ("effectTicks", "Effect ticks", 1), ("effectChance", "Effect chance", 1), ("effectDamage", "Effect damage", 1)]
ARMOURY = "ASHVALE Armoury"
MEAT_BASES = {'chicken', 'rat_meat', 'hare', 'goat', 'venison', 'boar'}
def category_of(k, d):
    kind = d['kind']
    if kind in CAT: return CAT[kind]
    if kind == 'tool': return ("tool", SUB_OF_ID[k])
    if kind in ('raw', 'food', 'junk') and k.rsplit('_', 1)[0] in MEAT_BASES: return ("food", "meat") if kind == 'food' else ("resource", "meat")   # meat (2026-10-04)
    if kind == 'food': return ("potion", "healing") if d.get('drink') else ("food", SUB_OF_ID.get(k, "fish"))
    if kind in ('raw', 'junk'): return ("resource", "fish")
    if kind == 'resource':
        if k.endswith('_logs') or k == 'logs': return ("resource", "logs")
        if k.endswith('_ore'): return ("resource", "ore")
        if k in SUB_OF_ID: return ("resource", SUB_OF_ID[k])
        if 'pelt' in k or k.endswith('_hide') or k.endswith('_skin'): return ("resource", "pelt")
    raise SystemExit('no category for item ' + k)
schema = {}
for k, d in items.items():
    cat, sub = category_of(k, d)
    j = {"name": d['name'], "description": "", "collection": d.get('collection') or (ARMOURY if d.get('nft') else "ASHVALE Items"), "game": "ashvale",
         "category": cat, "subcategory": sub}
    if d.get('tier'): j['tier'] = d['tier']
    j['weight'] = d['weight']
    if d.get('req'): j['req'] = d['req']
    j['model'] = MODEL[cat](sub, k)
    j['value'] = d['value']
    if d.get('stack'): j['stackable'] = True
    attrs = []
    for f, trait, mul in TRAIT:
        if f in d and d[f] not in (None, 0, ''):
            attrs.append({"trait_type": trait, "value": d[f] if mul is None else (round(d[f] * mul, 3) if mul != 1 else d[f])})
    j['attributes'] = attrs
    if d.get('nft'): j['nft'] = d['nft']
    stats = ', '.join('%s %s' % (a['trait_type'], ('+' if isinstance(a['value'], (int, float)) and a['trait_type'] in ('Attack', 'Strength', 'Defence', 'Ranged', 'Magic') else '') + str(a['value'])) for a in attrs if a['trait_type'] not in ('Cooks into', 'Burns into'))
    j['description'] = ('%s, %s %s' % (d['name'], cat, sub)) + (' (tier %d)' % d['tier'] if d.get('tier') else '') + ('. ' + stats if stats else '') + '. Made in the valley of Ashvale.'
    schema[k] = j
assert all(j['category'] for j in schema.values())
items_out = schema
module('items', 4, {"schema": "ashvale-item-1", "items": items_out, "weightUnit": "grams",
                    "tierNames": {"metal": ["", "Bronze", "Iron", "Steel", "Mithril", "Adamant"],
                                  "wood": ["", "Oak", "Willow", "Maple", "Yew", "Elder"],
                                  "cloth": ["", "Linen", "Wool", "Silk", "Moonweave", "Starweave"]}})

# Stackables become @ashvale-issued TOKENS (Omni issuance: category, subcategory, name, url, data). Same vocabulary as
# the NFTs; the rest of schema v1 rides in data as {"about", "icon", "ashvale": {id, tier, weight, req, attributes}}.
TOKEN_CATS = {"currency", "ammo", "resource", "food", "potion"}
tokens = {}
for k, j in schema.items():
    if j['category'] not in TOKEN_CATS: continue
    tokens[k] = {"name": ("ASHVALE " + j['name']) if k != 'coins' else "ASHVALE GOLD", "category": j['category'], "subcategory": j['subcategory'],
                 "url": "", "data": {"about": j['description'], "icon": None,
                                     "ashvale": {"id": k, "tier": j.get('tier', 0), "weight": j['weight'], "req": j.get('req', {}), "attributes": j['attributes']}}}
module('tokens', 1, {"issuer": "@ashvale", "note": "issuance spec per stackable item; icon = the txid of its picture, filled in when inscribed. GOLD already exists as token 26.", "tokens": tokens})

# ---------------------------------------------------------------- monsters (+ NPC looks)
ANIM = {"rat": "bite", "wolf": "bite", "bandit": "stab", "bandit_leader": "slash", "goblin": "stab", "goblin_shaman": "cast",
        "goblin_chief": "slash"}
# DROPS (2026-10-01): "Animals should not drop weapons or Gold. They should only drop their pelt. Pelts can be sold for
# Gold in town. Enemy combatants who have weapons should drop their inventory when they die."
# So animals: their pelt, every kill, no GOLD. Armed people: exactly what they carry (the weapon and armour you SEE on their
# model, data/parts/char.<key>.json gear) + their coin purse, plus what's in their pockets by chance.
INVENTORY = {
    "rat": {"gold": 0, "drops": [{"item": "rat_meat_raw", "one_in": 1}, {"item": "rat_pelt", "one_in": 1}]},
    "wolf": {"gold": 0, "drops": [{"item": "pelt", "one_in": 1}]},
    "goblin": {"gold": 15, "drops": [{"item": "sword_t1", "one_in": 1}, {"item": "arrows_t1", "n": [3, 10], "one_in": 4}, {"item": "bread", "one_in": 6}]},
    "bandit": {"gold": 18, "drops": [{"item": "sword_t2", "one_in": 1}, {"item": "arrows_t1", "n": [5, 15], "one_in": 3}, {"item": "bread", "one_in": 4}]},
    "bandit_leader": {"gold": 27, "drops": [{"item": "sword_t3", "one_in": 1}, {"item": "helmet_t2", "one_in": 1}, {"item": "body_t2", "one_in": 1},
                                            {"item": "arrows_t2", "n": [10, 20], "one_in": 2}, {"item": "potion", "one_in": 3}]},
}
ANIMALS = {"rat", "wolf"}
monsters = {}
for key in ("rat", "wolf", "bandit", "bandit_leader", "goblin"):
    m = dict(WORLD['monsters'][key])
    m['respawn'] = int(round(m['respawn'] / 0.6))          # seconds -> ticks
    m['anim'] = ANIM[key]
    m['look'] = key
    m['gold'] = INVENTORY[key]['gold']; m['drops'] = INVENTORY[key]['drops']; m['animal'] = key in ANIMALS
    if key not in ANIMALS:   # humanoid behaviour layer (core.js humanoidTick); animals keep the simple chase and bite
        m['ai'] = {"kind": "humanoid", "faction": "goblin" if key.startswith('goblin') else "bandit", "rally": 6, "leash": 12,
                   "keep": [4, 6] }
        if key == 'goblin': m['ai']['fleePct'] = 25
        if key == 'bandit_leader': m['ai'].update({"potionPct": 30, "blockPct": 25, "defended": True})
    monsters[key] = m
# the Goblin Chief (2026-10-04: "create a goblin chief and put him in the goblin camp"): the camp's boss, between the
# Bandit leader (18) and the Keep; Elder Maren's quest step 3. He drinks a potion, blocks, and his goblins rally to him.
monsters['goblin_chief'] = {"name": "Goblin Chief", "level": 22, "hp": 55, "att": 22, "def": 20, "attb": 16, "defb": 18, "max": 6, "speed": 4,
    "aggro": 5, "respawn": int(round(300 / 0.6)), "anim": ANIM['goblin_chief'], "look": "goblin_chief", "animal": False, "gold": 40,
    "drops": [{"item": "mace_t4", "one_in": 1}, {"item": "shield_t2", "one_in": 1}, {"item": "potion", "one_in": 2}, {"item": "arrows_t2", "n": [5, 15], "one_in": 3}],
    "ai": {"kind": "humanoid", "faction": "goblin", "rally": 8, "leash": 10, "keep": [4, 6], "potionPct": 30, "blockPct": 25, "defended": True}}
# wildlife (2026-10-04: "chickens running around ... wherever there are buildings", animals by region and
# terrain, boars on the beaches near Saltmere, deer in the woods, aggressive wolves): the animals' stats; where they live
# is data/atlas/wg_tables.json `wild` (herds) and rules `yard` (town birds). shy = runs from players within that many
# tiles, hunter = attacks players of any level, ownDice = wanders on its own dice (never shifts the fight rolls).
WILDLIFE = json.loads('''{"chicken": {"name": "Chicken", "level": 1, "hp": 3, "att": 1, "def": 1, "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 60, "drops": [], "gold": 0, "anim": "bite", "look": "chicken", "animal": true, "shy": 2, "ownDice": true, "roam": 3}, "hen": {"name": "Brown hen", "level": 1, "hp": 3, "att": 1, "def": 1, "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 60, "drops": [], "gold": 0, "anim": "bite", "look": "hen_brown", "animal": true, "shy": 2, "ownDice": true, "roam": 3}, "hare": {"name": "Hare", "level": 1, "hp": 4, "att": 1, "def": 2, "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 60, "drops": [{"item": "rat_pelt", "one_in": 2}], "gold": 0, "anim": "bite", "look": "hare", "animal": true, "shy": 5, "ownDice": true, "roam": 4}, "snow_hare": {"name": "Snow hare", "level": 2, "hp": 5, "att": 1, "def": 3, "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 60, "drops": [{"item": "rat_pelt", "one_in": 2}], "gold": 0, "anim": "bite", "look": "snow_hare", "animal": true, "shy": 5, "ownDice": true, "roam": 4}, "deer": {"name": "Red deer", "level": 5, "hp": 14, "att": 3, "def": 6, "attb": 0, "defb": 0, "max": 2, "speed": 4, "aggro": 0, "respawn": 60, "drops": [{"item": "pelt", "one_in": 1}], "gold": 0, "anim": "bite", "look": "deer", "animal": true, "shy": 7, "ownDice": true, "roam": 5}, "goat": {"name": "Mountain goat", "level": 6, "hp": 15, "att": 5, "def": 7, "attb": 0, "defb": 0, "max": 2, "speed": 4, "aggro": 0, "respawn": 60, "drops": [{"item": "pelt", "one_in": 2}], "gold": 0, "anim": "bite", "look": "goat", "animal": true, "shy": 4, "ownDice": true, "roam": 4}, "lizard": {"name": "Sand lizard", "level": 4, "hp": 9, "att": 4, "def": 5, "attb": 0, "defb": 0, "max": 2, "speed": 4, "aggro": 0, "respawn": 60, "drops": [], "gold": 0, "anim": "bite", "look": "lizard", "animal": true, "shy": 3, "ownDice": true, "roam": 3}, "boar": {"name": "Wild boar", "level": 9, "hp": 22, "att": 9, "def": 8, "attb": 4, "defb": 5, "max": 4, "speed": 4, "aggro": 0, "respawn": 60, "drops": [{"item": "pelt", "one_in": 1}], "gold": 0, "anim": "bite", "look": "boar", "animal": true, "ownDice": true, "roam": 4}, "timber_wolf": {"name": "Timber wolf", "level": 14, "hp": 28, "att": 13, "def": 10, "attb": 6, "defb": 5, "max": 4, "speed": 4, "aggro": 6, "respawn": 60, "drops": [{"item": "pelt", "one_in": 1}], "gold": 0, "anim": "bite", "look": "timber_wolf", "animal": true, "hunter": true, "ownDice": true, "roam": 5}}''')
for k in ('chicken', 'hen'): WILDLIFE[k]['drops'] = [{"item": "chicken_raw", "one_in": 1}]   # meat (2026-10-04)
# every animal its own meat and its own hide (2026-10-04: "Things that would be food should drop meat things that should be a pelt should drop a pelt that matches the animal")
WILDLIFE['hare']['drops'] = [{"item": "hare_raw", "one_in": 1}, {"item": "hare_pelt", "one_in": 2}]
WILDLIFE['snow_hare']['drops'] = [{"item": "hare_raw", "one_in": 1}, {"item": "snow_hare_pelt", "one_in": 2}]
WILDLIFE['deer']['drops'] = [{"item": "venison_raw", "one_in": 1}, {"item": "deer_hide", "one_in": 1}]
WILDLIFE['goat']['drops'] = [{"item": "goat_raw", "one_in": 1}, {"item": "goat_hide", "one_in": 2}]
WILDLIFE['boar']['drops'] = [{"item": "boar_raw", "one_in": 1}, {"item": "boar_hide", "one_in": 1}]
WILDLIFE['timber_wolf']['drops'] = [{"item": "timber_wolf_pelt", "one_in": 1}]
WILDLIFE['lizard']['drops'] = [{"item": "lizard_skin", "one_in": 2}]
for k in ('chicken', 'hen'): WILDLIFE[k].update({"fleeHit": True, "roamEvery": 3})   # run when hit (the operator: "run from you when you try to fight them"), and potter about a lot
for k in ('hare', 'snow_hare', 'deer', 'goat', 'lizard'): WILDLIFE[k]['fleeHit'] = True   # every timid animal runs when hit; boars and wolves fight back
monsters.update(WILDLIFE)
module('monsters', 1, {"monsters": monsters})

# ---------------------------------------------------------------- shops
armoury_stock = [k for k in items if items[k].get('tier', 9) <= 3 and items[k]['kind'] in
                 ('sword', 'dagger', 'longsword', 'mace', 'bow', 'staff', 'shield', 'helmet', 'body', 'chainbody', 'legs', 'arrows')]
# Nessa's four stay off the valley's counter and off Saltmere's armoury: the Enchantery is the only counter that
# has them. The plain ladder is what Garrick sells.
for k in ('staff_ember', 'dagger_venom', 'bow_snare'):
    if k in armoury_stock: armoury_stock.remove(k)
order = ['sword', 'dagger', 'longsword', 'mace', 'bow', 'staff', 'shield', 'helmet', 'body', 'chainbody', 'legs', 'arrows']
armoury_stock.sort(key=lambda k: (order.index(items[k]['kind']), items[k]['tier']))
armoury_stock.append('pack_t3')
if 'staff_frost' in armoury_stock: armoury_stock.remove('staff_frost')   # a tier-3 staff: the filter above already took it
armoury_stock.insert(armoury_stock.index('staff_t3') + 1, 'staff_frost')
# Saltmere's armoury (2026-10-05: "a general store and an armoury ... stock a little better than Ashvale's"):
# Ashvale's whole ladder, and the mithril a working harbour can afford to keep on the shelf. Adamant stays off the
# counter — the valley's monsters still carry the best of it.
salt_armoury_stock = [k for k in armoury_stock if k != 'pack_t3'] + \
    sorted([k for k in items if items[k].get('tier') == 4 and items[k]['kind'] in
            ('sword', 'longsword', 'mace', 'bow', 'shield', 'helmet', 'body', 'legs')],
           key=lambda k: order.index(items[k]['kind'])) + ['pack_t3']
shop0 = WORLD['shop']
module('shops', 3, {"currency": "coins", "shops": {
    "general": {"name": "Ashvale General Store", "keeper": "tam", "stock": ["bread", "potion", "tinderbox", "hatchet", "pickaxe", "net", "fishing_rod", "lobster_pot", "pack_t1", "pack_t2"],
                "buys": "any", "buyRate": 40, "sellRate": 100,
                "greet": "Bread, potions and good honest tools. What'll it be?"},
    "tailor": {"name": "Wren's Tailoring", "keeper": "wren", "stock": ["hat_cap", "hat_bandana", "hat_hood", "hat_feather", "hat_wizard",
               "cape_red", "cape_blue", "cape_green", "cape_purple", "cape_black", "cape_gold", "hat_crown"],
               "buys": ["cosmetic"], "buyRate": 50, "sellRate": 100, "greet": "Hats and capes, stitched this week. The fitting room is free."},
    "armoury": {"name": "Garrick's Armoury", "keeper": "garrick", "stock": armoury_stock,
                "buys": ["weapon", "armour", "ammo", "pack"],
                "buyRate": 60, "sellRate": 100,
                "greet": "Bronze, iron and steel, all forged right here. Mithril and adamant? Only the valley's monsters carry those."},
    # Saltmere's three (they live in the shore village, keepers in that zone's npcs). Listed here or the
    # generator drops them and core.nearKeeper stops finding hollis, nettie or sela.
    "tavern": {"name": "The Saltmere Tap", "keeper": "hollis", "stock": ["bread", "trout", "salmon", "lobster"],
               "buys": "any", "buyRate": 25, "sellRate": 100,
               "greet": "Sit where you like. The fish came in this morning, the bread yesterday."},
    "fish": {"name": "Nettie's Fish", "keeper": "nettie", "stock": ["bread", "trout"], "buys": ["food/fish", "food/meat"],
             "buyRate": 60, "sellRate": 100, "greet": "Fresh off the water this morning. What have you got?"},
    "chandler": {"name": "Sela's Chandlery", "keeper": "sela", "stock": ["fishing_rod", "net", "lobster_pot", "potion"],
                 "buys": ["tool"], "buyRate": 40, "sellRate": 100,
                 "greet": "Line, hooks and pots, and anything you drag back off the shore."},
    # Saltmere's two new shops (2026-10-05): a general store and an armoury, stocked a little better than
    # Ashvale's, because a harbour pays in ready coin and keeps the good steel for itself.
    "salt_general": {"name": "Saltmere General Store", "keeper": "bela",
                     "stock": ["bread", "potion", "tinderbox", "hatchet", "pickaxe", "net", "fishing_rod", "lobster_pot",
                               "pack_t2", "pack_t3"],
                     "buys": "any", "buyRate": 45, "sellRate": 100,
                     "greet": "Everything a ship needs and most of what a traveller needs. The land route is dearer, so I am cheaper."},
    "salt_armoury": {"name": "Saltmere Armoury", "keeper": "orin", "stock": salt_armoury_stock,
                     "buys": ["weapon", "armour", "ammo", "pack"], "buyRate": 60, "sellRate": 100,
                     "greet": "Steel as standard, mithril if you can pay for it. Saltmere arms its own before it arms anyone else."},
    # the lake castle's three (2026-10-05: "whatever else the castle needs to be a full-blown town"); keepers in
    # data/zone.castle.json (tools/castle/make_castle.js)
    "castle_kitchen": {"name": "The Castle Kitchens", "keeper": "castle_cook", "stock": ["bread", "trout", "salmon", "potion"], "buys": ["food/fish", "food/meat"], "buyRate": 55, "sellRate": 100, "greet": "The range is hot and the bread is from this morning. Cook your own if you like; the range is for everyone."},
    "castle_general": {"name": "Castle Stores", "keeper": "castle_qm", "stock": ["bread", "potion", "tinderbox", "hatchet", "pickaxe", "net", "fishing_rod", "lobster_pot", "pack_t2"], "buys": "any", "buyRate": 45, "sellRate": 100, "greet": "Rope, nets, tinderboxes, bread. If the castle needs it, I count it, and I sell what I can spare."},
    "castle_armoury": dict({"name": "The Castle Armoury", "keeper": "castle_armourer", "buys": ["weapon", "armour", "ammo", "pack"], "buyRate": 60, "sellRate": 100, "greet": "Steel for the watch, and for you if you can pay. The good bows go up the wall first."}, stock=salt_armoury_stock),
    # the magic store (2026-10-05). Nessa enchants; she does not deal in swords, so she buys staves only.
    "salt_magic": {"name": "Saltmere Enchantery", "keeper": "nessa",
                    "stock": ["staff_ember", "staff_frost", "staff_storm", "dagger_venom", "bow_snare", "hat_wizard", "potion"],
                    "buys": ["weapon/staff"], "buyRate": 40, "sellRate": 100,
                    "greet": "It does the same damage as the plain staff and a little less. What it does is hold the thing you hit."}},
    "note": "prices are item.value GOLD; a shop buys at buyRate percent the items whose category (or category/subcategory) is in buys ('any' = everything but currency). Shop keeper = an NPC id in a zone module.",
    "origin": {"food_price": shop0['goods']['food']['price'], "potion_price": shop0['goods']['potions']['price']}})

# ---------------------------------------------------------------- quests
q = WORLD['quest']
# Dialogue for "The Ashen Crown" (written by Claude for the operator's "top notch" bar). Per step:
#   talk      the scene when the step starts      progress  while it's under way ({n} {goal} {left} {name} are filled in)
#   complete  the hand-in, before the reward      locked    when the step's area isn't built yet
DIALOGUE = {
  1: {"talk": [
        "Ah. A traveller. Forgive an old woman for staring; we've seen few new faces since the river took the Brightwater road.",
        "I am Maren. I keep the records here, and the well, and more memories than the valley has room for.",
        "Something is wrong in Whisperwood. Every night the wolves come down to the fold and take a lamb. Always one. Always at the same hour.",
        "Hungry wolves are never that tidy. These hunt as if someone tells them when.",
        "My late husband's blade hangs over my hearth. Thin out ten of the grey wolves in the wood and it is yours. Plain bronze, but honest.",
        "Whisperwood begins past the north gate. Tam sells bread if you need it. And come back alive; I hate writing names in the records."],
      "progress": [
        "{left} more of the grey wolves, {name}. They run in threes near the old stumps.",
        "If they bite deep, eat. Tam's bread mends a torn arm faster than any prayer."],
      "complete": [
        "Ten. And not one of them with a full belly. Strange, for wolves that eat a lamb every night.",
        "Here: Aldric's sword. He'd want it swinging again rather than gathering soot."]},
  2: {"talk": [
        "Something else troubles me. The hunter found boot prints among the wolf tracks. Men's boots, walking calm beside the pack.",
        "Bandits. They herd the wolves to keep folk off the old road. There is something on that road they want kept quiet.",
        "Their leader camps deep in Whisperwood, past the split oak. He is no farmhand with a stolen knife; he fought in the old wars.",
        "Bring him down, {name}, and bring me whatever he carries. Train first if you must. The wood will wait; he will not get kinder."],
      "progress": [
        "The bandit leader still walks free. Look past the split oak, deep in the wood.",
        "He won't be alone. Thin his men first, and keep your strength up."],
      "complete": [
        "You're back, and with blood on your sleeve. Not all of it yours, I hope.",
        "A map, sewn into the lining of his coat? Let me see... These marks are the goblin camp, east of the old forest.",
        "Bandits buying from goblins. Whatever passes between them, it starts in that camp. You have earned this, and more."],
      "locked": [
        "The goblins have dug in at their camp east of the old forest. Garrick says go in strong, or not at all.",
        "Train while you wait. Chop, fish, swing that sword. When the way under the hill opens, come and find me."]},
  3: {"talk": [
        "The goblin camp lies east of the old forest, through the gap in its east edge. Goblins fight dirty; their Chief fights dirtier.",
        "The map names a Chief. Whatever the goblins trade the bandits, he decides it. Find him."],
      "progress": ["The Goblin Chief still holds the camp east of the old forest. His goblins rally to him; thin them first."],
      "complete": [
        "The Chief wore this round his neck? A shard of black glass... no. Not glass. Ash, hard as iron.",
        "I have read of this. The Ashen Crown. Take this shield; you'll need it where this leads."]},
  4: {"talk": [
        "The crown was the old king's, burned with him when the Keep fell. Its pieces have been calling things out of the dark ever since.",
        "A ghost walks the Keep's gate. The old stories say it will open the way for three wraith essences. Gather them."],
      "progress": ["{left} more wraith essences. The cold you feel at the Keep isn't the weather."],
      "complete": ["Three essences. The gate will know them. Go when you're ready, and not a moment before."]},
  5: {"talk": ["The gate opens onto the throne room, and onto the Ash Knight, who still guards a king long dead. He was the best of them, once."],
      "progress": ["The Ash Knight still stands his watch. Grief makes a soldier stubborn; ash makes him tireless."],
      "complete": ["You gave him his rest. I hope he thanked you, in whatever way a knight of ash can."]},
  6: {"talk": ["Behind the throne waits the one who wears the rest of the crown: the Lich of Ashvale. End it, and the valley remembers what it was."],
      "progress": ["The Lich still holds the crown. Every night it does, the valley forgets a little more of itself."],
      "complete": ["It's over. Take what it guarded; choose well. It's yours by every right this valley has."]},
}
steps = []
for st in q['steps']:
    d = DIALOGUE.get(st['id'], {})
    if st['id'] == 3: st = dict(st, zone='whisperwood')   # 2026-10-04: the Goblin Chief lives in the goblin camp (no warrens)
    steps.append(dict(st, talk=d.get('talk', st['talk']), progress=d.get('progress', []), complete=d.get('complete', []), locked=d.get('locked', [])))
quests_out = {q['id']: {"name": q['name'], "giver": "maren", "steps": steps,
                        "done": ["The crown is ash again, and the valley is ours. There'll always be a seat by my fire for you, {name}.",
                                 "Now go on. Somewhere out there, something else is waiting to be written down."]}}

# ---------------------------------------------------------------- the trail story (2026-10-05)
# The road east from Ashvale to Saltmere, one quest per release. Nothing here needs code: the goals are
# the kill goals core.js already counts, a giver is an NPC with "quest": <id> in its zone, and every
# reward is an item id from the table above, so the Bank mints it into "ASHVALE <quest name>" (the operator's
# rule). Levels sit between Whisperwood and the Keep: wolves 8, boar 9, timber wolf 14, bandit 12.
TRAIL = {
  "drove_road": {
    "name": "The Drove Road", "giver": "rowan",
    "steps": [
      {"id": 1, "zone": "whisperwood", "goal": {"kill": "wolf", "n": 5}, "reward": "xp:strength:600",
       "talk": [
           "Mind you stand between me and the gate. That heifer spooks at strangers and she's twenty stones of stranger.",
           "Rowan. I take beasts down the east road and sell 'em at Saltmere, eleven seasons running. This season I can't get a drove out of Ashvale.",
           "Grey wolves come off the wood at dusk and run at the near side. They don't kill so much as scatter. Two miles an hour, and you'll walk 'em back twice over before dark.",
           "Five of 'em. That's what it took last season and what it'll take now: thin the pack till the pack takes notice of a quieter road.",
           "North gate, then keep the old stumps on your left. Come back with five and I'll stand you shoeing at Garrick's."],
       "progress": [
           "{left} more wolf, {name}. The drove's nervous enough as it stands.",
           "They run in threes. Two at a time suits me better."],
       "complete": [
           "Five. That's the west run, the lot of 'em, by the look of that pelt.",
           "Beast walked two mile further today than it did last week. That's the whole of this trade, that is."]},
      {"id": 2, "zone": "saltmere", "goal": {"kill": "boar", "n": 6}, "reward": "pack_t1",
       "talk": [
           "Aye, the beasts are calmer. The next trouble's further down the road, and it's closer to Saltmere than anyone down there will admit.",
           "There's grazing west of the town - good grass, with a marsh drain running through it. Boar root the whole of it at night. Six acres this year, turned over like a kitchen garden.",
           "Nettie feeds half the town off those marshes and Sela sells the reeds. They'll back me, but they're not going out at dusk to say it themselves.",
           "Six boar. Quick, for the weight they carry, and they'll charge if you back them onto the drain bank. Keep a way back to the path open."],
       "progress": [
           "{left} more boar. The grazing's still turned up wherever you haven't been."],
       "complete": [
           "That's the marsh quiet again, and the grass'll come back before the frost.",
           "Mention it at the Tap when you get down there. Hollis'll want to know who did it, and he won't charge you for the drink."]},
      {"id": 3, "zone": "saltmere", "goal": {"kill": "timber_wolf", "n": 4}, "reward": "helmet_t2",
       "talk": [
           "There's a bigger trouble on the trail, and it isn't the grey pack you cleared.",
           "Timber wolves. Bigger than the wood wolves and a good deal bolder. They follow a drove at night and take one off the rear, and by morning you've a collar in the grass and no dog.",
           "Four of 'em. They won't come at you in the open - they'll test you where the path goes under the pines and the bells are out of sight.",
           "Take the iron out of Ashvale if you've not got it. I'd rather pay for a helmet than write to a man's wife."],
       "progress": [
           "{left} more of the big wolves. Listen for the bells - if the drove's gone quiet, they're behind it."],
       "complete": [
           "Four. And they came off the north trail, not the road, which is the difference between a loss and a story.",
           "Wear that. You've earned the weight of it."]},
      {"id": 4, "zone": "saltmere", "goal": {"kill": "bandit", "n": 6}, "reward": "xp:attack:1800",
       "talk": [
           "Last of it, and it's the part I've not said to either elder, in Ashvale or in Saltmere.",
           "There's a camp where the road bends out of the trees, and they've set a toll on anything with hooves in it. Six of 'em. A grey coat runs it; the rest are boys with sticks.",
           "I won't pay it, and I've no wish to carry a sword into it myself. Take the camp apart, {name}, and the road's open again for everyone walking it, me included."],
       "progress": [
           "{left} more of the toll-men. The camp's where the road bends out of the trees - you'll smell the fire before you see it."],
       "complete": [
           "The camp's broken. That's my living handed back to me, and I don't know what to do with the thanks.",
           "Go and sit in the Saltmere Tap and tell Hollis Rowan sent you. Whatever he's got for a traveller like you, you've earned it twice over."]}],
    "done": [
        "The drove went east with all six beasts and none of them lost. That's what the road looks like now, {name}.",
        "When you've a mind for more of it, ask after you in Saltmere. A town on the coast has its own way of being in trouble."]},
  # The coast end of the trail (2026-10-05: "Have the final quest in Saltmere"). Two things a step can
  # want besides a kill: an item handed over, and a message carried to somebody. Both are core goal kinds.
  "rudder": {
    "name": "The Shipwright's Rudder", "giver": "bryce",
    "steps": [
      {"id": 1, "zone": "saltmere", "goal": {"bring": "logs", "n": 8}, "reward": "xp:woodcutting:1000",
       "talk": [
           "Eight sound logs and a boy to carry them, which is the same trouble twice. I can't get the boy either.",
           "Bryce. I build boats here and mend them when the coast disagrees. The north boat came home last month with her rudder on the tide and nothing on the sternpost but iron.",
           "I've a blank in the shed and no timber for it. Pine twists, and oak wants a season lying under cover, which is a season I don't have.",
           "Eight ordinary logs, seasoned, stacked by the shed. Not the green stuff off the north road, and not pine. I'll know the difference and so will the sea."],
       "progress": [
           "The shed wall is still empty, {name}. Eight logs, and I'll take them wherever you found them."],
       "complete": [
           "That's a rudder blank in that stack, and it's the best half of one already.",
           "You've an eye for timber. Most folk bring me fence posts and call it a week's work."]},
      {"id": 2, "zone": "saltmere", "goal": {"kill": "boar", "n": 5}, "reward": "xp:strength:1200",
       "talk": [
           "Now the timber wants lying out, and the marsh won't let it lie.",
           "Boar come up off the drain at dusk and root the whole of it. Last stack was forty logs; what I've got back is where they dragged it and what they didn't eat.",
           "Five of them, and they'll charge the stack rather than move off it, so don't come at them with your back to the shed.",
           "Rowan's already paid the marsh a visit. If they've come back, it's because the ones he left came looking for company."],
       "progress": [
           "{left} more boar. The stack's still dragged about, and the mud's got tusks in it."],
       "complete": [
           "That's the marsh quiet and the timber flat again. Look at that mud - that's a year of my life in it.",
           "Take the strength you got out of it. It's the only thing a boat doesn't need a licence for."]},
      {"id": 3, "zone": "saltmere", "goal": {"talk": "tolly", "n": 1}, "reward": "helmet_t2",
       "talk": [
           "It's hung. Rudder's on the north boat, hung and shipped, and I've not told the man who has to sail her.",
           "Go down the third pier and tell Tolly she floats. He's pulled her six winters and won't ask me, and I won't go down there and watch him find out.",
           "Say it plain: Bryce says she floats. That's all he wants and all he'll get out of me."],
       "progress": [
           "Tolly, {name}. Third pier. Say the words and come back."],
       "complete": [
           "He said the same back to you? Then it's true and we're both out of a excuse.",
           "Here. Iron, off the old sternwork. On a boat a helm is the thing that turns her; on your head it's the same metal and I've no further use for it."]}],
    "done": [
        "The north boat's out on the evening tide with a rudder that stays on. That's my name on the water again, {name}.",
        "When you've a mind for the whole of it - the town, the harbour, and what the coast is short of - go and find Cobb by the portal. He's the elder, and he's been waiting for someone to ask."]},
  "salt_road": {
    "name": "The Salt Road", "giver": "cobb",
    "steps": [
      {"id": 1, "zone": "whisperwood", "goal": {"talk": "rowan", "n": 1}, "reward": "xp:speechcraft:900",
       "talk": [
           "Sixty years I've kept the accounts of a town that never once asked what it wanted. Now somebody's walked the whole road and you're the first to ask me.",
           "Cobb. I say where the boats may tie up, which is the whole of the trade, and it has taken me this long to notice we're the end of something.",
           "Ashvale sends its beasts east and calls it a favour. We send fish west and call it Tuesday. Both of them are lying, and the road between has never had a name.",
           "Walk back up to the east gate and tell Rowan Saltmere will take his drove on Tuesdays, at one price, every Tuesday, while I'm drawing breath. He'll want it from someone who came down it."],
       "progress": [
           "Rowan, {name}. Up the trail at the east gate, and Tuesdays in your mouth."],
       "complete": [
           "He said yes before you'd finished the sentence, I'll wager. Then the road has a price on it, which is most of what a road is."]},
      {"id": 2, "zone": "saltmere", "goal": {"bring": "iron_ore", "n": 6}, "reward": "xp:mining:1500",
       "talk": [
           "We've a forge. Orin's anvil came out of the old chandlery when the town bought it, and it's a good anvil.",
           "We've no mine. There's iron up in Ashvale, and every blade in this town has come down this road in somebody's pack and been sold back to the man who carried it.",
           "Six iron ore, and I'll not tell you where to dig it. He'll melt it here, and the third of what he makes is town work: hooks, hinges, and the pins that hold a rudder on.",
           "That last is why I'm asking. Bryce has a boat to hang and I'd rather pay for ore than pay for a funeral."],
       "progress": [
           "The anvil's cold, {name}. Six ore, and Orin does the rest of it."],
       "complete": [
           "That's a year of hinges in that stack, and work on the anvil that isn't selling swords to boys."]},
      {"id": 3, "zone": "saltmere", "goal": {"kill": "bandit", "n": 5}, "reward": "chain_t2",
       "talk": [
           "There's a company on the north beach, and they call what they do salvage.",
           "Wreck's wreck. The town's rule is the crew comes first and the cargo's ours, and we've held to that since before the church had a roof.",
           "They take it off the sand before anyone's rowed out, and they've learned that nobody rows out in the dark. Five of them, and don't go at them where the shingle gives you no room to back up.",
           "I'm not asking you to hang anybody. The town does that itself when it catches them. I'm asking you to make the beach unpleasant."],
       "progress": [
           "{left} more of them. They'll go in the boats if you're slow, and stand in the surf if you're quick."],
       "complete": [
           "The beach is quiet, and what washed up last week is standing in the town's hall where it belongs.",
           "Put that on. It came off a wreck, like everything else here, only this time the town got the invoice."]},
      {"id": 4, "zone": "saltmere", "goal": {"kill": "bandit_leader", "n": 1}, "reward": "cape_blue",
       "talk": [
           "Their man. They follow one man, and he picked the beach by the river mouth because that's where a wreck comes ashore and no one's rowed out to count it.",
           "He'll be at the driftwood line at the turn of the tide. He won't wait for you to finish asking, so bring your boots and your patience in equal amounts.",
           "You'll want to come back to me after. Sixty years I've kept a town's accounts, and there's one entry I've never once balanced."],
       "progress": [
           "The driftwood line, {name}, at the turn of the tide. He'll be the one nobody else is standing near."],
       "complete": [
           "That's the beach, then, and the ledger both. Come and find me by the portal - there's a thing I've kept by me six years for whoever walked the whole of the trail."]}],
    "done": [
        "The Salt Road, then. Rowan will say it's his road, Bryce will say it's the water, and the accounts will say it's Tuesdays. All three of them are right.",
        "That's the trail end to end in your column and mine. Mind you come down it now and then - a road nobody walks is just a long way to do nothing."]},
  "empty_water": {
    "name": "The Empty Water", "giver": "perla",
    "steps": [
      {"id": 1, "zone": "saltmere", "goal": {"bring": "shrimp_raw", "n": 12}, "reward": "xp:fishing:1200",
       "talk": [
           "Perla. I mend nets in this town. I've mended eleven of them this past year, all of them on rocks, none of them wet.",
           "Last spring the harbour had the town's marks moved out past the pier heads - ten metres of open water from the last plank, and they called it letting the shoal rest. The shoal rested. So did every net in Saltmere.",
           "Net holes are like a ledger: you find the small one early or the whole thing runs open. What I couldn't work out was why nobody could land a fish to prove the nets were worth mending.",
           "I've had the marks hauled back in, to where a person can stand and cast from a plank or a quay wall. Two weeks of arguing and I've had them hauled in. Go and prove it was worth the argument.",
           "Twelve shrimp. The north pier heads and the quay wall, both - shallow water, a net, and you'll see them go past your feet."],
       "progress": [
           "{left} more shrimp, {name}. They're the marks with the little floats on now, and they're under your arms, I'll warrant."],
       "complete": [
           "So the water wasn't empty. It was out of reach, which is a different thing and a poorer argument. Hand those to Nettie and she'll have a tale to tell."]},
      {"id": 2, "zone": "saltmere", "goal": {"bring": "salmon_raw", "n": 4}, "reward": "xp:fishing:2400",
       "talk": [
           "Shrimp keep a town fed. Salmon are what make a town talk, and I'd rather have both in the same basket.",
           "There's a mark off the second pier head, the deep side where the channel runs out. Salmon on it, and it takes a rod, thirty in the skill, and standing on a plank that has no business holding a person.",
           "Four of them. Bring them wet rather than in a bag - I want to see them wriggle when you come back to me.",
           "And don't go at it in a blow. The planks are sound enough in a calm and they are not sound in a blow, and I've mended enough people as well as nets."],
       "progress": [
           "Four salmon, {name}, and {left} to go. The tide's on the turn, which is when they run and when the pier creaks."],
       "complete": [
           "That's the second pier fishable, and the first salmon anyone's landed off it in fourteen months. Write that down if you keep a book - I would."]},
      {"id": 3, "zone": "saltmere", "goal": {"bring": "lobster_raw", "n": 2}, "reward": "xp:fishing:3600",
       "talk": [
           "Now the third pier, and I'll not pretend it's pleasant. That's the deep end of the harbour, and what lives down there has a shell and a grudge.",
           "You'll want a pot, and forty in the skill, and you'll want to lower it slow and haul it slow, because a lobster that sees you coming is a lobster that's gone.",
           "Mind the third plank on the way out. Tolly's right about it and nobody has fixed it and nobody will, so long as it holds a rope. Step over it, don't stand on it.",
           "Two of them is plenty. They're not shrimp, and I'm not going to have you emptying the harbour to make a point about a mark."],
       "progress": [
           "{left} more off the third pier, {name}. Slow down, slow up, and mind the plank."],
       "complete": [
           "There's your point made, in two shells. The deep of this harbour was never empty either - it was a hundred metres further off than anybody was willing to walk."]},
      {"id": 4, "zone": "saltmere", "goal": {"talk": "nettie", "n": 1}, "reward": "pack_t3",
       "talk": [
           "Last one, and it isn't a fish. Go and stand at Nettie's stall and tell her the harbour's fishing again.",
           "She's sold nothing but inland trout off the Ashvale carts for a year, and she's done it with a straight face because somebody has to keep the stall open. She'll want it from someone who pulled it out of the water.",
           "Tell her the marks are in, the prices are hers to set, and Perla says the nets are worth mending after all.",
           "Come back to me after you've told her. There's a pack of mine you'll want, and I'd rather you filled it with what this harbour gives you than a cart of somebody else's trout."],
       "progress": [
           "Nettie, {name}, at the fish market. Tell her the truth and she'll pretend not to believe you for a week."],
       "complete": [
           "She sent you back to me with a face on. That's Nettie hearing news she's wanted for a year and not meaning to show it.",
           "There's four of us who live off that water, and one of us who kept arguing about where the marks went. Put the pack to use - the harbour's back."]}],
    "done": [
        "The Empty Water, and it wasn't empty at all, it was a hundred metres further off than anybody was prepared to stand. That's the whole of the tale.",
        "Mind the marks when the storms go through, {name}. They drift, and a drifted mark is a season of empty nets and a mender with nothing to do but watch the water."]},
  # The second thread out of Ashvale, and it is not about anything with teeth (2026-10-05: the village end
  # needs its own reason to keep walking). Silas the mason, whose two chat lines are now the quest - a giver who
  # idles about his own trade never gets to the errand. What he wants is the three things the village's own mine
  # gives and nobody in the game had a use for: oak for the centering, coal to burn lime at a real heat, and copper
  # for bronze pins. The tin is Garrick's, which is the other half of the story.
  "bronze_gate": {
    "name": "The Bronze Gate", "giver": "silas",
    "steps": [
      {"id": 1, "zone": "village", "goal": {"bring": "oak_logs", "n": 8}, "reward": "xp:woodcutting:1800",
       "talk": [
           "You want to know what's wrong with the north gate. So do I, and it's thirty-one years since I last had a scaffold up on it.",
           "There's a centering of green pine inside that arch, put in by me in a hurry in a wet spring. Pine moves when it dries. Oak doesn't. Eight lengths off the west slope.",
           "Modulus measured it twice and says the arch is sound. The arch is sound the way a promise is sound. It has been holding its own weight on a lie about a tree since before you were born.",
           "And while you're about it, the mortar I laid that gate with was burnt wrong. I know that now. That's the second thing you're bringing me."],
       "progress": [
           "{left} more oak, {name}. West slope, and if Pax asks, no, you did not take the ones he painted."],
       "complete": [
           "That's the centering. From the road it'll look like I'm building a new gate. I'm not. I'm telling an old one the truth for the first time."]},
      {"id": 2, "zone": "village", "goal": {"bring": "coal", "n": 6}, "reward": "xp:mining:1500",
       "talk": [
           "Lime burnt on wood in a low clamp comes out half-alive. It sets, after a fashion, and what it sets to is powder. That's why the gate still isn't dry.",
           "Six out of the pit. There's three faces of coal in there, past the copper where the roof comes down low, and it wants twenty in the mining before it lets go of anything.",
           "Wood gives you a fire. Coal gives you a heat, and a heat is the whole difference between a wall and a pile of stones with an opinion.",
           "Pip's been in after them with a candle. Don't tell his mother I said the roof's low - I said the roof's low in the coal end, which is a different sentence."],
       "progress": [
           "{left} more coal, and keep it dry. A wet sack of coal is a heavy way of learning nothing."],
       "complete": [
           "Six. That's a kiln that comes up to heat and stays there long enough to mean it. One good burn, not a hoard - I'm mending a gate, not a fortune."]},
      {"id": 3, "zone": "village", "goal": {"bring": "copper_ore", "n": 12}, "reward": "xp:mining:2400",
       "talk": [
           "Now the pins. Iron pins on a gate that stands out in weather are rust with a shape to them. Bronze isn't, and bronze is copper with a tenth of tin in it.",
           "Twelve copper, and they're the easy part - four faces of it by the pit mouth, any level, and the wind comes up that passage so take a lantern as well as a pick.",
           "Leave the rest in the hill. There's no sense working a seam flat for the sake of twelve pins, and the pit's mine to keep, not mine to empty.",
           "The tin is the problem, and the tin is Garrick's, which is a longer story than a hinge has any right to be."],
       "progress": [
           "{left} more copper. By the pit mouth, all four faces of them, east of the gate you're standing under."],
       "complete": [
           "Twelve copper. That's the pins, the straps and the hinges, and now I need the one thing in this village I cannot go and fetch myself."]},
      {"id": 4, "zone": "village", "goal": {"talk": "garrick", "n": 1}, "reward": "shield_t2",
       "talk": [
           "Go and stand at the anvil and tell Garrick the mason is ready to mix, and that it was me who said his scale.",
           "He's kept a cake of tin since he cut the wheel off the old mill, and I've kept twelve copper in a bin since the spring, and neither of us has said the word across that street in six years.",
           "He'll want to know why I didn't come myself. Tell him my knees are on an arch and his are by an anvil and neither of us is wrong.",
           "He'll weigh it, because that's the man's whole goodness and he's never once mentioned it. And he'll hand you the boss off the first gate to carry up the ladder - bronze, off a door that's had its day. Take it if he offers it you."],
       "progress": [
           "Garrick, {name}, at the anvil on the west street. Say the word scale out loud. With him that's the whole introduction."],
       "complete": [
           "He weighed it in front of you so neither of us had to say anything about six years of nothing. That's it settled, by a man who minds his own business."]}],
    "done": [
        "The north gate, then: oak inside it, bronze on the outside, and mortar burnt at a heat worth calling a heat. It'll be standing when there's nobody left who remembers either of us.",
        "Nobody gets a statue for this work. You get a wall that still stands and a gate that shuts, and fair enough. Mind the hinge on your way out, {name} - it'll want a year to settle."]},
  # Mabb the sailmaker only ever chatted (handoff/qwen_trail_log.md, next item 1). The harbour fishes again and the
  # trail has two threads, so she gets the third: a Saltmere job that uses the boats, the canvas and Perla's marks
  # and does not repeat Perla's errand. Nothing new in the item table - willow, deer, old nets and Bela's
  # bolts are all things the game already had. The nets are the link: since the marks came back in, a bad net is
  # worth asking for, and warp thread is what a salted old net is good for.
  # Where every ask lands was measured, not imagined (probe, 2026-10-05, bearings re-checked 2026-10-06 against the
  # zone origins - whisperwood lies at y 0..40 and the village at y 40..64 and whisperwood is "up the range", so +y
  # runs SOUTH and every north/south claim has to be read off that): willow is the town's own tree - 29 tiles of
  # it inside the Saltmere map, the nearest 6 m from its centre; the grazing south of the town is a red
  # deer herd 114 m from Mabb's post and it is the nearest of anything with hooves. Giant rats would have sent a
  # player 253 m to a camp in the woods and there is nothing in this town with teeth but hens, so the loft wants
  # leather, not a vermin count. Bela sells the nets, which is the only reason a net is buyable at all.
  # Rewritten against wildlife v2 (wg_tables wild.chance 0.45, wild.size deer [20,30], 2026-10-06, probe
  # /home/you/ashvale-compass.js): the same grazing is still the nearest of anything with hooves, 114 m south of
  # Mabb's post, but it is a herd of four and twenty head now rather than three - which is why she says what she says
  # about the ones she is not asking for.
  "sail_loft": {
    "name": "The Sail Loft", "giver": "mabb",
    "steps": [
      {"id": 1, "zone": "saltmere", "goal": {"bring": "willow_logs", "n": 8}, "reward": "xp:woodcutting:2000",
       "talk": [
           "Mabb. I make sails in this town, which is one sail a year and nine mends, and the loft's cold so stand where the wind doesn't come through the boards.",
           "What's wrong with the north boat's sail is the lower third. It's battened with oak, and oak is the right wood for a gate and the wrong wood for a wing. Oak snaps when a gust arrives all at once. Willow bends and comes back.",
           "Eight lengths of willow, thin as your thumb and as long as my arm. They'll be along the channel where the water goes slow. Soft wood, any level takes it, and it doesn't fight the saw.",
           "Strip the bark where you cut it. Bark holds wet, and wet is how a loft rots from the rafter down - I'd rather learn that from you than from the ceiling."],
       "progress": [
           "{left} more willow, {name}. Thumb-thin. And if you bring me oak I'll swear at you and use it anyway."],
       "complete": [
           "That's the lower third going on a frame that'll forgive a bad gust. You can feel the difference through the cloth - oak tells you the moment it gives up, willow never tells you at all."]},
      {"id": 2, "zone": "saltmere", "goal": {"kill": "deer", "n": 2}, "reward": "xp:attack:1600",
       "talk": [
           "Before I cut a thing there's an ask, and it isn't a favour to me, it's a tool. Two of the red deer off the marsh grazing, and I'll tell you what they're for rather than have you guess.",
           "A sewger's palm is leather. Salt water eats a cloth pad in a week and a wet pad tears the thread more than your needle does. Deer leather takes the wax and keeps its shape when your hand sweats, which is most of the day in a loft in summer.",
           "South of the last houses, where the marsh grass comes up short because that's what they leave of it. There's a flight of them on that marsh, a hundred and fourteen paces from where I'm standing, four and twenty head and a few limbers gone over into the reeds, and you do not walk into a herd like that. They're red deer, level five, and they've no appetite for you - but they go at the first wrong step in the mud, so take the one you're beside and let the other three and twenty be a problem for the town's supper.",
           "Take the hides and leave the venison where it falls - Nettie's stall has been thin since the storm and the marsh is the town's larder, not my cabinet. I want the skin, and I want it salted before it heats."],
       "progress": [
           "{left} more deer, {name}. South of the town and one at a time - the marsh is a bad place to chase anything."],
       "complete": [
           "That's palms for the season. Hide off them, salt it, and bring it up before it sets - a stiff hide is a hide you wasted, and I don't like wasting anything that lived in the same town as me."]},
      {"id": 3, "zone": "saltmere", "goal": {"bring": "net", "n": 3}, "reward": "xp:speechcraft:1500",
       "talk": [
           "Now the thread, and this is the part where I need your mouth rather than your hands.",
           "Canvas wants warp before it wants weft, and warp wants line that's already been stretched and salted. Since the harbour moved the marks back in there are nets in the sheds that were mended twice and are easier replaced than mended a third time.",
           "Three of them. Nobody throws a net away and nobody sells one easy, so ask for the ones with torn skirts off the north boats - a fisherman will sell you a bad net at a fair price and thank you for the custom.",
           "Shake the salt out before you bring them up the ladder. Salt in a loft is a season of stiff canvas and a mender with a sore thumb."],
       "progress": [
           "{left} more net, {name}. Look for the mending that was never finished - that's a net that knows it's finished and hasn't been told."],
       "complete": [
           "That's a warp, and it's been salted once already, which is more than you can say for new line off a spool. It cost you less than twine because you asked for the damaged ones."]},
      {"id": 4, "zone": "saltmere", "goal": {"talk": "bela", "n": 1}, "reward": "cape_red",
       "talk": [
           "Last one, and it's an errand of words. Go down to Bela's and tell her Mabb says the loft's clear, the warp's on, and she can put the price back on the three bolts she's had off the top shelf since spring.",
           "She bought them back off me in the hungry month, and they're my cloth. She'll sell one to somebody as a curtain and I'll hear about it every market day until the day I die.",
           "Tell her I said the word warp out loud. With Bela that's the whole introduction, and it settles an account without either of us having to say what the hungry month was.",
           "Come back up to me after. There's a cape cut off the offcut of the north boat's sail and it's red because I ran out of white - that's a sailmaker's finishing, and you've earned the offcut."],
       "progress": [
           "Bela, {name}, at the counter on the west street. Say warp. And don't let her talk you into buying a curtain."],
       "complete": [
           "She laughed, then she pretended she hadn't. That's the account settled and the bolts staying where they are."]}],
    "done": [
        "The north boat's sail, then: willow in the lower third, thread that was salted once already, and not one rat's hole in the leech. She'll hold a wind that takes the masts off the other two.",
        "A sail is a wall that has learned to fly, {name}. Wear the red - same cloth, better cutting than most, and it'll keep the rain off you until the next one's cut."]},
  # Pip the apprentice is the fourth thread out of Ashvale village and the first one that is made of neither a beast
  # nor a building. He is one of the ghost devs and has never had an errand of his own (handoff/qwen_trail_log.md,
  # next item 1). His ground is the thing the Bronze Gate left lying around: the village mine gives tin, the hill
  # gives nothing he wants, and three tinstones have never been wanted by a single quest or shelf in the game. So the
  # ask makes a half-forgotten resource matter rather than inventing one, and the pay is a tinderbox - an item the
  # general store has sold to nobody since the game opened.
  # Where every ask lands was measured first, as before (probe, 2026-10-05): tin is 3 stones in the Ashvale mine, the
  # nearest 15 m from the village centre at 38,46, mining 1; the nearest hare herd is 123 m due south (the village
  # map's north edge is its low-y edge, so the +y herd at -11,170 lies south of the well) and the world
  # holds 603 of them; the grey wolves are the 8 the village's own wood posts, at 15..27 x 13..20 in Whisperwood,
  # which is 37 m from the centre - the closest fight in the game, and it is a pelt and not a kill the pump wants.
  # Nothing asks you to walk somewhere the map does not hold, and Modulus was left with his chat lines because a
  # talk goal credits at anybody's conversation, including a man who is busy measuring the east road.
  "tin_pipe": {
    "name": "The Tin Pipe", "giver": "pip",
    "steps": [
      {"id": 1, "zone": "village", "goal": {"bring": "tin_ore", "n": 6}, "reward": "xp:mining:1800",
       "talk": [
           "You found a thing that shouldn't work? That'll be mine. I'm Pip. I've been down the pit with a candle since I was nine, and I keep a list of everything in this village that's been built wrong.",
           "The low seam went under in February. Three feet of winter water in the coal end, and the town's answer was to stop mining coal, which is an answer about the weather and not about the water.",
           "What it wants is a pump. A pump is a pipe, a leather, and a fall of ground, and I've got the forge, which is two of the three out of a boy who's had four years of anvil.",
           "Six lumps of tin. There's three tinstones in the village mine, east of the pit mouth in the old stopes where they took the copper out first, and any level of mining takes them - it's the soft grey one, it marks if you bite it.",
           "Garrick's kept a cake of it since he cut the wheel off the mill. If he asks, I didn't say you were coming, because I've used up the last of his and I'd rather not have that conversation twice."],
       "progress": [
           "{left} more tin, {name}. East of the pit mouth, the soft grey ones. Bring them rough - washed I can't tell one from a stone, which is how I lost a week."],
       "complete": [
           "That's a pipe and a spare, and it's the only metal in this parish that forgives being soldered. Tin doesn't rust, and rust is the whole story of everything else in this town."]},
      {"id": 2, "zone": "village", "goal": {"kill": "hare", "n": 4}, "reward": "xp:ranged:1200",
       "talk": [
           "Now the leather, and this is where the list gets silly. A pump is a tube with a thing in it that fits, and a thing-that-fits is cut out of a hare's skin. Hare leather closes when it's wet. Goatskin swells and staggers, and I've tried goatskin.",
           "Four hares. Up the north road where the stubble's standing and the grass goes short - they're out there at dusk in the open, worse luck, they'd be out there in the open if this village had any sense about fences.",
           "They'll outwalk your legs, so if you've a bow, bring it and stand downwind of where you think they are rather than where you can see them. They go by the grass moving, not by you arriving.",
           "Three washers out of a good skin, so four skins is two nights' work and one bad cut. Take the meat if you want it - there's a range at the end of the street and I won't tell anyone you cooked them in a quest."],
       "progress": [
           "{left} more hare. Skins, {name} - the meat was always yours, it's not the part I'm short of."],
       "complete": [
           "Four. Two of them'll work and two are so I can learn which cut is wrong, which I'd call the whole of the trade if the trade were mine."]},
      {"id": 3, "zone": "village", "goal": {"bring": "pelt", "n": 2}, "reward": "xp:strength:1500",
       "talk": [
           "The washers are hare because they have to be soft. The bellows behind them wants something that isn't, and I have ruined every rat pelt in this village finding that out.",
           "Two wolf pelts, unrolled and not scraped - the fur side goes inboard. Grey wolves, in Whisperwood, and they're thirty-odd paces up from the north gate where the ferns come out of the path.",
           "It's the nearest thing in this village that's pleased to see a reason to bite you, so take the one that stands up when you arrive. It's the one that was coming to you anyway.",
           "A wet wolf pelt weighs a stone and there's a ladder between the wood and my loft, which is why the next thing you carry is your own arms. Not scraped, {name}. I can tell, and I'd rather not say."],
       "progress": [
           "{left} more wolf pelt, and it wants the fur on it. Everything else in this village is scraped, and everything else in this village is wrong."],
       "complete": [
           "Two, both with the fur on. That's a bellows that'll move water, and I owe the rats an apology, and there were a great many of them."]},
      {"id": 4, "zone": "village", "goal": {"talk": "modulus", "n": 1}, "reward": "tinderbox",
       "talk": [
           "Pipe, leather, forge. Now the part I can't do, and I'd rather say it than have you find it out in a month. A pump only lifts as high as the water falls from, and I don't know the fall of anything.",
           "Modulus measured this parish twice and he won't hand it over at the first asking. Go and ask him for the levels between the mine and the stream, and ask twice. The second time is the one he means.",
           "If the mine's lower than the stream by a man's height, the pump'll run on its own weight and I'll want a fire under the joint. If it's the other way round I've wasted your afternoon, and I'd like to hear about a fish walking up a tree instead.",
           "He'll tell you he measured it the year the water came up. He's been waiting eleven years for anybody to ask him that, and he'll make you wait four minutes for it."],
       "progress": [
           "Modulus, {name}, on the east road, measuring it for the third time this morning. Ask for the levels and don't hurry him - that's the only way to get the wrong number."],
       "complete": [
           "He gave you the number after he gave you the lecture, which is how you know it's the right one. Lower by a man and a half. It'll run on its own weight."]}],
    "done": [
        "It works. Three buckets in a minute and a half, out of a pipe, a hare's ear and a wolf I've said sorry to. It has no business doing that. It shouldn't work, {name} - which isn't the same as not working.",
        "Take the box with the spark in it. It's been in my pocket through three winters and I've no need of it now; the pit wants a fire under the joint and I can light that off the forge. And if anybody calls it a simple thing, invite them up the ladder to watch a hare pelt lift the north road."]},
  # Auditor the clerk is the fifth thread out of Ashvale and the second one hung on a metal the game never used: the
  # survey (probe, 2026-10-05) says the village's own coin is described on the chain as "GOLD, currency gold. Made in
  # the valley of Ashvale", while the mine's gold seam has never been wanted by a single quest, shelf or gift in the
  # data. So the ledger line is real rather than invented. Measured ground, all of it off the shipped map: GOLD is 3
  # stones in the east end of the Ashvale mine (42,42 / 44,42 / 45,45), 21-22 m from the village centre and 22 m from
  # the well at 22,52, mining 30, 420 xp; MITHRIL is exactly 2 stones in the same corner (45,42 / 43,43), 21-23 m,
  # mining 40 - two stones in the whole shipped world, which is why the die is cut once; MAPLE is 66 tiles with the
  # nearest 51 m off the centre (Whisperwood 21,1), mining's neighbour trade at woodcutting 30, so the third step
  # leaves the mine without leaving the walk Pip's quest already taught. Nothing is asked for that the map doesn't
  # hold, and Pax keeps his chat lines because a talk goal credits in anybody's conversation.
  "hawk_ring": {
    "name": "The Hawk Ring", "giver": "auditor",
    "steps": [
      {"id": 1, "zone": "village", "goal": {"bring": "gold_ore", "n": 6}, "reward": "xp:mining:2000",
       "talk": [
           "Every coin, every catch, every word in this village gets written down somewhere. It mostly balances. There is one line in it that has not balanced since before you were walking, and in forty years I have decided I would rather see it closed than die with it open.",
           "Gold drawn out of the Ashvale seam: nil. Gold struck in Ashvale: nine hundred and forty coin, every one of them out of the old lord's hoard, and the hoard is spent. So the money in your purse was made in this valley and none of it was ever mined in it, which is the sort of sentence that keeps a clerk awake.",
           "Six lumps, out of three stones, in the east end of the mine past the copper stopes where they went in first. Twenty-two paces from the well, and it wants thirty of mining to mark the rock - it's the grey one with the yellow in the vein, and it isn't a metal you'll find by looking, it's a metal you find by weighing.",
           "Bring them up rough with the quartz on them. I'm not assaying polished stones; I'm weighing what this parish owns, and a washed stone tells me about your polishing and nothing whatever about my seam.",
           "Ticket, please. No? Then we'll do it without paperwork, which is how everything gets done in this village - it's already closed and nobody told either of us."],
       "progress": [
           "{left} more gold, {name}. East of the pit mouth, twenty-two paces from the well, thirty mining. And no, what the general store sells is brass, and I've weighed it twice."],
       "complete": [
           "That's the seam, and it's real, and it's the first line in this book I've closed with a witness standing over it. Six lumps, unpolished, exactly the way the rock sends them up."]},
      {"id": 2, "zone": "village", "goal": {"bring": "mithril_ore", "n": 2}, "reward": "xp:mining:1600",
       "talk": [
           "Now the die, and this is where the ledger stops being an accounting and starts being a piece of metal. You cannot strike coin in a brass die, whatever the old lord did - brass rounds at the thousandth strike and by the ten-thousandth the village is coining blobs and calling it weight.",
           "Mithril takes the cut and keeps it a hundred years. There are two mithril stones in this parish. Two. Same corner of the mine as your gold, twenty-two paces from the well, and it wants forty of mining, a good pick, and nobody hurrying.",
           "I want both of them, and I want them counted in front of me, because the quantity of mithril in Ashvale is a fact I will write down once and nobody after me will ever be able to check it. If somebody tells you they found more, ask them where, and write that down too.",
           "One stone cuts the die. The other is so that in fifty years, when the edge of the hawk has finally gone, there is still a stone in this village to cut it again. That is what a record is for."],
       "progress": [
           "{left} more mithril, {name}. Forty mining, same corner as the gold. There are two in the parish and I should like both of them in this room."],
       "complete": [
           "Two, weighed, written, initialled. One for the die and one so that whoever comes after can find out whether I was telling the truth."]},
      {"id": 3, "zone": "village", "goal": {"bring": "maple_logs", "n": 8}, "reward": "xp:woodcutting:2200",
       "talk": [
           "A die has to be annealed before it's cut and hardened after it's cut, and an anneal is a heat held, not a heat reached. Which brings me to the one thing in forty years I have done badly, and I did it badly with somebody's good oak.",
           "Willow burns quick and takes the temper off before you've counted to twenty. Oak splits, and a split in the pan leaves a cold spot under the die, and a cold spot is a die that looks finished and isn't.",
           "Maple chars slow and even. It's up in the wood, fifty-odd paces from the well where the fern comes up out of the path, thirty of woodcutting, and it is the easiest tree in this parish to miss, because it looks like every other tree until you have burnt it.",
           "Eight lengths, and burn them down in the pan rather than bringing them to me green - a green log smokes, and smoke in a coin goes into the metal and stays there in the shape of a bad year."],
       "progress": [
           "{left} more maple, {name}. Out of the wood, not out of the mine. Slow charcoal - I have one ruined die in forty years and it was somebody's excellent oak."],
       "complete": [
           "Eight, and charcoal that will hold forty minutes at one heat, which is the entire difference between a die and a very expensive mistake. The pan's ready whenever the metal is."]},
      {"id": 4, "zone": "village", "goal": {"talk": "pax", "n": 1}, "reward": "ring_hawk",
       "talk": [
           "The metal's weighed and the pan's lit, and what's left is the pattern. That is a story I have not told in this village, because telling it means admitting the hole in the book was left there on purpose.",
           "The old die was a ring. A signet, a hawk on its shoulder, worn by the man who cut the first Ashvale coin - and it went out of this village in the hungry year against a debt, and it came back as nothing at all. The weight of every coin struck since has been copied off a ring that isn't here.",
           "So the hawk has to be remembered rather than traced, and the man in this village who remembers things by their colour is Pax. Go and tell him the seam is open. He'll say he has no interest in coin, and then he'll want to know whether there's enough for the sky.",
           "Ask him about the ninth try. The blue door by the well is the last of the village's own gold, leaf on leaf, and if you've the patience he'll show you every one of the nine. Then come back to me, because the first thing off the new die is not going to be a coin."],
       "progress": [
           "Pax, {name}, by the well, blue to the wrist. Tell him the seam is open, and wait for him to pretend he doesn't care."],
       "complete": [
           "He said coin was nothing to him. Then he asked whether there would be enough leaf for the ceiling of the hall, and I wrote that down, because it's the first thing anybody has asked me for in twenty years that I couldn't already answer."]}],
    "done": [
        "It balances. One line closed in forty years, and closed with the metal in the room rather than a promise about it. Every coin, every catch, every word - it mostly balances, {name}, and now it is mostly more than mostly.",
        "The hawk, in mithril, off a die cut from a ring that had to be remembered rather than copied. Wear it, and spend a coin beside it, and if anybody asks you which of the two came first, tell them the village did. And it is not only a thing to wear - put it up your sleeve and there is a hawk on the world again, which is the first entry in this book that has ever flown."]},
  # Latency the warden is the sixth thread out of Ashvale and it came out of one line in the item table. The survey
  # (probes ashvale-survey11.js / 11b.js, 2026-10-05) laid the bow ladder and the wood ladder side by side: the bows
  # are NAMED after woods - Oak t1 (req 15, 92 tiles in the built map, nearest 10 m from the village), Willow t2 (req
  # 20, 39 tiles, 13 m), Maple t3 (req 30, 66 tiles, 34 m), Yew t4 (req 40, 19 tiles, nearest 45 m off the centre and
  # 36 m from the warden's post at 22,44, all nineteen along the north edge of Whisperwood, where the path up the
  # range runs out). Ashvale's own counter carries tiers 1-3; Saltmere's carries tier 4 and calls it "Yew shortbow",
  # value 1600 - a yew bow sold in a town that has never once cut a yew, because there isn't one inside its map. And
  # tier 5, "Elder shortbow", value 5200, is on no shelf and in no quest and behind no gift in the whole data set: an
  # obtainable-looking item that nothing in the world will ever hand you. So the thread is the ladder itself, and the
  # pay is the rung. The hare and deer asks are the two surplus herds measured from his own post: hares 603 in the
  # world, nearest herd 130 m; deer 1260, nearest herd 116 m, and deer_hide wanted by no quest, shelf or gift.
  # Re-measured against wildlife v2 (wg_tables wild.chance 0.45, wild.size hare [2,3] deer [20,30], 2026-10-06, probes
  # /home/you/ashvale-survey22.js and /home/you/ashvale-yew21.js): from the warden's post at 22,44 the hare
  # forms are still 130 m off (south) but run 2-3 head over 493 herds, the deer are still 116 m off (east) but run
  # 15-30 head, median 25, over 519 herds - the nearest field is 22 head - and no timber wolf stands inside 600 m of
  # him at all (nearest 782 m). The nineteen yews, the 36 m to the nearest of them and the ladder under the bow are
  # tree facts and none of them moved. What moved is the ground round them: 62 deer herds within 900 m of the
  # nearest yew, the closest feed 95 m off the trunks at 22 head, seven herds inside 250 m, and the nearest timber
  # wolf 816 m. The old line said the yews were empty ground where everything else was full; under these tables
  # that is simply no longer true, so he now says what a player finds, which is the fern broken and no wolves.
  "elder_bow": {
    "name": "The Elder Bow", "giver": "latency",
    "steps": [
      {"id": 1, "zone": "village", "goal": {"kill": "hare", "n": 6}, "reward": "xp:ranged:1800",
       "talk": [
           "North gate, the torches, the path up the range. I'm late to everything and I still get there before you do. Six hares, and you shoot them, and that's not me being short of a labourer - it's me finding out whether you can hold a bow steady at ninety paces in a wind.",
           "There's a ladder in this village that nobody ever climbed to the top of, and it's made of wood. Oak bows at the gate, willow bows, maple bows - every bow in the shops is named after a tree, and the trees go up the hill in the same order the bows go up the counter.",
           "Six hares, out on the stubble where the grass goes short. They're a hundred and thirty paces from where I stand, two to a form and three at a push, and there are forms of them all the way round this parish - four hundred and ninety-three of them - which is a thing the fences have not managed to do anything about.",
           "Stand downwind of where you think they are rather than where you can see them. Hares go by the grass moving, not by you arriving, and a bow that's aimed at the hare you saw is aimed at where the hare was.",
           "Bring me nothing - I don't want the meat and Pip has the skins. I want to see six of them come down in a morning, because what I'm going to ask you for after that is a thing you cannot carry up the range if you can't shoot on the way."],
       "progress": [
           "{left} more hare, {name}. Downwind of the grass, not aimed at where you saw one. Ninety paces is shorter than it looks when you're holding the weight."],
       "complete": [
           "Six, and four of them at the far mark, which is the only report I've written this month that I was glad to write. You can hold it steady. That's the whole of step one."]},
      {"id": 2, "zone": "village", "goal": {"bring": "deer_hide", "n": 4}, "reward": "xp:strength:1800",
       "talk": [
           "Now the case, and this is the part everybody gets wrong about a bow. A stave is a piece of wood that wants to be straight again. All of shooting is the wood being told to bend and being let go, and what keeps it straight in the years between is a hide and a strap and somewhere dry to hang it.",
           "Four deer hides. There are more deer in this parish than hares - five hundred and nineteen herds of them against four hundred and ninety-three forms of hares - and the nearest stand a hundred and sixteen paces from my post, two and twenty head in a field, so what this ask wants isn't patience, it's restraint: four out of a crowd that size, and the rest of them standing.",
           "Take them off the beast whole and salt them flat. A hide rolled green goes mouldy against a stave in eleven weeks, and I've lost two bows to somebody's green hide, so I know the smell before I see it.",
           "They're heavy, and there's a lap of the hill between the pasture and my post, which is why the next thing you carry up here is your own back. The gatehouse peg is where they hang, and if a bow lives on that peg through a winter, it lives in a case."],
       "progress": [
           "{left} more deer hide, {name}, salted flat. Whole, not cut into strips - a strip is a repair and I'm not asking for a repair, I'm asking for a case."],
       "complete": [
           "Four, whole, and they'll take the thread. A bow on a bare peg in this weather is a straight stave by March, and I've had enough of straight staves to last me."]},
      {"id": 3, "zone": "village", "goal": {"bring": "yew_logs", "n": 6}, "reward": "xp:woodcutting:2800",
       "talk": [
           "Here is the thing I have been walking this road to say. Up the range, where the path runs out and the fern comes up through the stones, there are nineteen yews. Nineteen, in this parish, standing there for a hundred years, and not one ask has ever been made on them.",
           "It wants forty of woodcutting and a good axe, and it's forty-odd paces from where I'm standing - which is the joke of it. The nearest yew to this village is closer than the nearest maple people queue in Saltmere for. The deer come under those trees now the way they come under everything - two and twenty head in a feed, the nearest of them ninety-five paces off the trunks, and seven of their herds standing inside two hundred and fifty paces of this wood - so you'll know you're come to the yews by the fern being broken all round it. No wolves though. The nearest of theirs is eight hundred and sixteen paces from those trunks, which is the only mercy in this parish.",
           "Six lengths. A stave takes four, and I want two over, because the first one you draw out of the wood will have a knot in the belly and it'll go across your knee before you've had it wet. Nobody tells you that at the shop end of a bow.",
           "Cut them on the bend they're growing, and drag them out of the wood rather than throwing them - a yew bruised at the butt is a yew that'll throw when you string it. Bring them up green and I'll season them on the rafters of the gatehouse over the winter."],
       "progress": [
           "{left} more yew, {name}. Up the range where the path ends, forty of woodcutting, cut on the bend. Nineteen trees, and you'll see them before you've counted to a hundred from my post."],
       "complete": [
           "Six, on the bend, unbuilt, and there's the ladder's top rung lying in the grass at the north gate. Nineteen trees in this parish. I've wanted to say that sentence to somebody for eleven years."]},
      {"id": 4, "zone": "village", "goal": {"talk": "orin", "n": 1}, "reward": "bow_t5",
       "talk": [
           "Last thing, and it isn't metalwork, it's arithmetic. Down the trail at Saltmere there's an armoury, and on its shelf is a bow they call a Yew shortbow, and it sells at sixteen hundred. There is no yew inside their map. There is no yew within a day's walk of their counter. The nearest yew is standing forty paces behind me.",
           "So go and say it to Orin. Ask him what he thinks a yew bow would be worth that was actually cut out of a yew - and ask him, plainly, where he thinks his came from, because a name on a shelf is a promise about a tree.",
           "He won't like it. He'll be decent about not liking it, which is more than most of them manage, and he'll want to see a stave. Tell him Ashvale's got nineteen, and tell him the warden sent me, and tell him the road's open.",
           "Then come up the gatehouse, because if you've carried a message that far with a stave on your shoulder, you've earned the peg at the top of it, and there's only ever been one of those."],
       "progress": [
           "Orin, {name}, by the anvil at Saltmere, third counter down the west street. Ask him about the yew and don't let him talk you onto a shelf instead."],
       "complete": [
           "He said his came from a merchant out of the east, which is what a man says when he has never asked. Then he asked whether the wood was seasoned, and I'd say that's the beginning of somebody who'll buy it off us."]}],
    "done": [
        "That's the peg. The elder bow - not elder as in a tree, there's no elder wood in this valley, elder as in old. It was old before the torches were hung on the north gate and there's no counter on the trail that would know what to do with it. Ranged forty-four, and it has never been off the wood it was cut from.",
        "Take it up there and stand on the gatehouse if you like; you can see the whole road from there, the stubble the hares are on, the pasture, the wood line, and Saltmere if the weather's honest. If the road closes, that's me. If the road's fine, you never heard of me. That's the job done right, {name}, and it's done right today because a stranger carried a stave down it."]},
  # The Kitchen Range (a tester, 2026-10-05, increment 12). Cooking is the one thing the trail never touched. The
  # engine has a whole ladder of it - seven raw things that cook into food, a fire in each town, and a burn curve that
  # was counted rather than guessed: at the level a rung asks for, two in five of a catch goes black, four points less
  # a level, and none at all ten levels up (200 cooks a rung, off the engine's own messages). And no quest in the whole
  # data set has ever asked for one cooked thing or paid one point of cooking XP, while every cooked meat and the
  # shrimp are bought by nobody. So the thread is the lake's own ladder, four rungs and four different verbs: shrimp at
  # fishing one on a net, off four marks between sixteen and twenty-three paces of this range; hares on the stubble at
  # five, the nearest herd a hundred and seventeen paces out, the same cull the warden's thread starts with; trout at
  # twenty on a rod, sixteen paces; venison on the fire at fifteen, off a stag a hundred and nineteen paces out. The trout are the fact
  # worth telling: the only two trout marks in the game stand in Ashvale's lake, and Saltmere, which is built on the
  # sea and has seven marks of its own, has never landed one. The village has nine and no food shop - the only cooked
  # trout in the whole game is sold at Saltmere's tap and its fish stall, off a cart, from a town with no fresh water.
  # The pay is the rung nobody sells: t1 to t3 of the pack are on counters, t5 is nowhere, and tier four, a frame pack
  # that carries five and a half stone, is on no shelf and wanted by no quest in the world.
  "kitchen_range": {
    "name": "The Kitchen Range", "giver": "cinder",
    "steps": [
      {"id": 1, "zone": "village", "goal": {"bring": "shrimp", "n": 10}, "reward": "xp:fishing:2000",
       "talk": [
           "Seven paces from the well and it's cold. There's your first surprise, then - a village that cooks on an idea of a fire. I'm Hob, I've the range, and I've been waiting for somebody with the sense to fill it.",
           "Ten shrimp, cooked, and cook them here where I can see you do it. Four marks out in the lake will give them to a net and a level one - the nearest is sixteen paces from this wall and the furthest twenty-three, so you'll be wet before you're back and that's normal.",
           "Here's the part nobody warns you about, so I will: at your level the fire takes two in five of anything you put on it. That's not the fire being wicked, that's your hands being new, and it loses four of every hundred each level you gain until it stops altogether.",
           "So bait a net, and bring me back ten that came off the heat rather than ten that the heat agreed with. And your pay for this one is in fishing, not cooking - it's the skill my bank teaches, and the fire can wait its turn."],
       "progress": [
           "{left} more shrimp cooked, {name}. Bring the burnt ones to me too and don't hide them - burnt shrimp goes to the pigs and I'd rather know the number than guess it."],
       "complete": [
           "That's ten, and the smell is right. The burnt ones went to the pigs this morning, which is the only honest thing about a first batch - you'll burn four times as many before the winter, and then you won't, and that's the whole of cooking."]},
      {"id": 2, "zone": "village", "goal": {"bring": "hare_cooked", "n": 3}, "reward": "xp:fishing:2600",
       "talk": [
           "Fish is the easy half of a kitchen because a fish is already clean. Now the meat, and the nearest meat in this parish is the thing the warden is shooting half the year.",
           "Three hares, cooked through. The nearest of them are a hundred and seventeen paces south of this wall, there are more on the stubble than there are of us, and they want cooking five, which is where you'll already be standing by the time you come back from the lake.",
           "A hare is small and it dries out, and drying out is just burning with better manners. Four counts a side at a range this size, so work it and don't wander off it - the people who lose a hare are the people who started a conversation next to a fire.",
           "The warden takes four of them off the same field to prove that a bow can be held steady. I take three to prove that a person can be fed. Same grass, honest work, both of it. Paid in fishing again, and don't look at me like that - it's the level you're short of, and I'd rather you had the mark next week than the praise today."],
       "progress": [
           "{left} more hare on the fire, {name}. Off the heat early, back onto it late - I'm not asking you for a sole, and neither is the fire."],
       "complete": [
           "Three, cooked through, and none of them scraped. The warden measures a person with a bow on that same stubble; I feed them out of it. Same grass, two opinions of what a good day is."]},
      {"id": 3, "zone": "village", "goal": {"bring": "trout", "n": 4}, "reward": "xp:cooking:1900",
       "talk": [
           "Now I'll tell you the thing about this village that I've wanted to tell somebody for eleven years. There are two marks in the whole world where a rod will take a trout. Both of them are in that lake, and both of them are sixteen paces from the wall of my kitchen.",
           "Saltmere is built on the sea. It has a harbour, seven marks, pots and nets and a fish stall that argues with the tap about prices - and it has never landed a trout in its life. Not one. The trout stay in fresh water and the fresh water is ours.",
           "So the tap and the fish stall out there sell you a cooked trout that came off a cart, and they charge you for the privilege of not knowing that - it's the only cooked trout on any shelf in the world, and it isn't caught where it's sold. You can do better standing on this bank with a rod and twenty levels, and I'll take four of them off your hands, cooked.",
           "Don't salt them. Saltmere will salt anything you bring them, and a salted trout cooked on a range that's been cold since spring tastes exactly like what it is, which is a thing somebody carried in a bucket."],
       "progress": [
           "{left} more trout, {name}. Two marks, both in this lake, sixteen paces from the wall and a rod at twenty. Take the heat off them before they argue."],
       "complete": [
           "Four landed trout, unsalted, cooked by somebody standing sixteen paces from the water they came out of. Eleven years I've wanted to say that sentence in my own kitchen, and now I have, so it's yours to say somewhere else."]},
      {"id": 4, "zone": "village", "goal": {"bring": "venison_cooked", "n": 2}, "reward": "xp:cooking:1600",
       "talk": [
           "Last of the ladder, and it isn't on the water. Two haunches, cooked - you want fifteen on the fire for venison, and there's your ladder: a shrimp at one, a hare at five, a trout at five, and a stag at fifteen degrees of my heat. Four things, four ways to fill a kitchen, and one number that goes down the longer you stand here.",
           "The deer are a hundred and twenty paces from this wall, due east of it. They're quieter than the boars and they run sooner, and the pasture they're on is the same ground the drover walks his beasts across, so you'll know the way and he'll have told you the rest.",
           "Fifteen is where a haunch will take the heat, and at fifteen the fire still takes two in five of them - forty at the rung, nothing at all ten degrees over it. So expect one black in the pan, mind the pigs, and know that the number goes down the longer you stand here. That's the point of the whole errand.",
           "Bring the haunches here and not to the tap. Saltmere would cook them beautifully, and then they'd sell them back to you as somebody else's dinner, at a price, with a sprig on the top."],
       "progress": [
           "{left} more venison on the fire, {name}. The deer are a hundred and twenty paces due east and the fire wants fifteen - neither of them will come to you."],
       "complete": [
           "Two haunches off a stag, a hundred and twenty paces from this wall, and no black on either of them. That's the ladder and you're at the top of it without having noticed, which is how it works."]},
      {"id": 5, "zone": "village", "goal": {"talk": "symmetry", "n": 1}, "reward": "pack_t4",
       "talk": [
           "Now carry the last of it five paces west to the curator, and don't ask me why. It's eleven years of a kitchen; he's got a room of pots and I've got a fire, and one morning a year ago we agreed he'd eat what the fire made.",
           "He'll want to know how it was cooked. Tell him a range, seven paces from the well, and nine marks in our lake, and a trout that Saltmere has never once landed - he writes that sort of thing down, that's the whole of his trade.",
           "And take the frame pack off my wall going. Tier four of a ladder that stops at three on the counter and never starts again at five, eight stone of it it'll carry, and it held the supper across the marsh for eleven years before I hung it up.",
           "It's yours, and it's not a gift, it's the pay for two haunches and a stranger who stood at my range long enough to stop burning the food."],
       "progress": [
           "Symmetry, {name}, five paces west along the wall with the lake behind him. Take the last of the supper and tell him the range is lit again."],
       "complete": [
           "He'll have written it down wrong, in pencil, on the back of something. He took the story, and you took the pack off my wall, and that is the whole of how this village keeps a record."]}
    ],
    "done": [
        "Then the range is lit, and it'll stay lit, and that's the whole of what I wanted. Four rungs, four verbs, and a cook who knows that two in five is not the fire's opinion of him - it's a number, and numbers go down when you practice.",
        "Take the lake, take the stubble, take the pot mark if you've the fishing for it. And if you ever hear that Saltmere's fish shop has trout on the shelf, you come and tell me the price they're asking, because I'd like to know what a lie costs in a town with no fresh water.",
        "That's the kitchen, {name}. Seven paces from the well, eleven years cold, and warm since you walked up. Nobody's going to write this in a book - the curator will, actually, badly, in pencil - but that's a day's work done and it's done today."]},
  # The Skinning Knife (a tester, 2026-10-05, increment 13). The other half of a carcass, counted before it was
  # written: 1003 herds of rats, hares, boars and timber wolves stand within three kilometres of Ashvale's well - 191,
  # 495, 81 and 236 - and the only skins anybody in this parish has ever asked for are a warden's four deer hides and
  # an apprentice's two wolf pelts for pump washers. rat_pelt, hare_pelt, boar_hide, snow_hare_pelt, timber_wolf_pelt,
  # lizard_skin and goat_hide are in the game, and not one quest in the whole data set has ever
  # asked for one of them. A rat gives up its pelt one for one - the only even trade in this valley - a hare one in
  # two, a boar one for one off a beast that is level nine and hits back. Herds within three kilometres of the well,
  # measured on the seeded world under wildlife v2 (wg_tables wild.chance 0.45, wild.size, 2026-10-06, probe
  # /tmp/herdcount.js): rats 191, seven inside six hundred paces, nearest two hundred and fifty, three to five to a
  # pack; hares 495, twenty-six inside six hundred, nearest a hundred and twenty-three, two to a form; boars 81, six
  # inside six hundred, nearest a hundred and thirty-eight, six to twelve to a sounder; timber wolves 236, none inside
  # six hundred, nearest seven hundred and seventy-four, seven to fifteen to a pack, eleven usual.
  # Goats and lizards are zero: no herd of either anywhere within three kilometres of Ashvale, which is worth knowing
  # before anybody sends you for goatskin. The pay is the skill nobody has ever paid and the tool on no counter.
  # Dexterity has run and dodged its way into every save file in this game from under a pair of boots, and no quest
  # has ever handed over a point of it. A tier four skinner's dagger exists in the ledgers, is stocked by no shop in
  # Ashvale, Saltmere or the castle, and is wanted by no quest: t1 to t3 hang on the armourer's wall, four is nowhere,
  # and five is nowhere either.
  "skinning_knife": {
    "name": "The Skinning Knife", "giver": "fenn",
    "steps": [
      {"id": 1, "zone": "village", "goal": {"bring": "rat_pelt", "n": 6}, "reward": "xp:dexterity:2200",
       "talk": [
           "You've walked past me eleven times and never once looked up. Fenn. I dress skins, which is a trade in this village the way a range is a trade to a village that cooks on an idea of a fire.",
           "Six rat pelts to start, and it isn't beneath you. There are a hundred and ninety-one packs of rats inside three kilometres of that well, seven of them inside six hundred paces, and the nearest pack stands two hundred and fifty paces out. Three to a pack, level two, five hitpoints between an argument and a wet day.",
           "Here's why I start you on rats and not on something with a reputation: a rat gives up its pelt one for one. Every one. That's the only even trade in this whole valley, and everything I ask you for after this one gets worse than it.",
           "Mind the general store on your way back. They'll buy any skin you carry at four parts in ten of what it's worth, and they'll never once ask what anybody in this village intends to do with the other six parts. Six pelts, and your pay is in dexterity - which I know you've never had from a person before."],
       "progress": [
           "{left} more rat pelts, {name}. Two hundred and fifty paces, three to a pack, one pelt to a rat - I'm not asking you to be clever, I'm asking you to be quick and to keep the knife out of the belly."],
       "complete": [
           "Six, and every one off the beast that carried it. That's your first lesson done: skins, not meat. A hundred and ninety-one packs inside three kilometres of that well, and not one pelt of theirs ever came down this lane before you. Two thousand two hundred points of dexterity, and it went in doing something for once instead of running."]
      },
      {"id": 2, "zone": "village", "goal": {"bring": "hare_pelt", "n": 8}, "reward": "xp:dexterity:3200",
       "talk": [
           "Now the vermin with manners in it. Eight hare pelts, and I'll tell you what eight costs you: sixteen hares, because a hare gives up its skin one time in two. A rat's pelt is worth eight pennies and comes off every rat; a hare's is worth five and comes off half the time. Count that before you count the next thing.",
           "They're this village's own plague. Four hundred and ninety-five herds inside three kilometres of the well, twenty-six inside six hundred paces, two to a form and three when they're settling, and the nearest of them stands a hundred and twenty-three paces from the wall you're leaning on. The warden shoots six a season to prove he can hold a bow, the cook roasts three for a ladder he's building by the well, and not one skin of them ever comes back here.",
           "That's the thing I've waited eleven years to say out loud to somebody. The warden takes a trophy, the cook takes a dinner, the apprentice takes two pelts for washers, and between the three of them they ask for six skins - six - out of a parish where a thousand and three herds of rats, hares, boars and timber wolves stand inside three kilometres of that well, and every skin of every one of them goes on the same heap by the gate.",
           "Level one, shy, and they run the moment you think about them - so this is paid in dexterity again, and for a reason. Get behind one of them and you'll find out what your legs are actually for. Eight pelts, {name}, and I'd skin them here rather than there."],
       "progress": [
           "{left} more hare pelts, {name}. Half of them come off the beast and half don't, and that isn't bad luck, it's the odds - four hundred and ninety-five herds will hold still for it."],
       "complete": [
           "Eight skins, sixteen beasts, and you've paid the odds instead of arguing with them. A hare's pelt is worth three pennies less than a rat's and comes off half the time, which is the whole arithmetic of this trade laid out in front of you. Three thousand two hundred more points of dexterity - you'll be six of it by the time I've counted these."]
      },
      {"id": 3, "zone": "village", "goal": {"bring": "boar_hide", "n": 3}, "reward": "xp:dexterity:3800",
       "talk": [
           "Three boar hides, and now we've come to the part of my trade nobody mentions: a hide worth anything is on an animal that will object. Eighty-one herds within three kilometres, six inside six hundred paces, nearest a hundred and thirty-eight, and they come nine to a sounder.",
           "Level nine, twenty-two hitpoints, and an arm that hits at nine against a hide of eight. I'm not telling you that to frighten you - the last person who came here at your level went at a boar the way they'd gone at a rat, and I had to sell their boots.",
           "A boar gives up its hide one for one, like the rat, and twenty-eight pennies to anybody who'd know what to do with it. So three of them is a labourer's month of luck and one day of my work. The drover walks his beasts across that same ground every morning and has never once wondered where the skins go.",
           "Bring them back whole. A hide with a slash across the belly is a puddle, and I'd rather you took an hour cutting it badly in the right order than twenty minutes doing it well in the wrong one. Dexterity, three thousand eight hundred points - it's the skill you'll be short of when something with tusks turns round."],
       "progress": [
           "{left} more boar hides, {name}. Six herds inside six hundred paces, nine to a sounder. Go at the small end of the group, cut it long and short, and don't stand where you'd have to walk to get away."],
       "complete": [
           "Three whole hides and no slash across a belly. That's a labourer's month of luck come up the lane in a sack, and the stink of working them is mine from tonight, gladly. Eight of dexterity now, and you got there the way the trade gets there - off something that turned round at you."]
      },
      {"id": 4, "zone": "village", "goal": {"bring": "timber_wolf_pelt", "n": 2}, "reward": "dagger_t4",
       "talk": [
           "Two timber wolf pelts. This is the one I'd not ask of a stranger if I hadn't watched you come up that road twice. Level fourteen, twenty-eight hitpoints, hits at thirteen. Two hundred and thirty-six packs in this parish and not one inside six hundred paces of the well; the nearest stands seven hundred and seventy-four paces out, and they go eleven to a pack.",
           "I ask for two because one is a coat and two is a bargain, and their pelts come off one for one, which puts a wolf's skin at forty-five pennies against a hare's five - and tells you exactly what the extra forty buys you.",
           "Bring them whole and I'll pay you in something you cannot buy. There's a tier four of a skinner's knife in the ledgers of this village. One to three hang on the armourer's wall by the north gate; four is on no counter in Ashvale, Saltmere or the castle; five is on no counter anywhere. It exists, {name}. It was simply never made for anybody - and the reason it exists at all is that it's the tool of the only trade here that works with a blade.",
           "So it's yours. You'll find it's quicker than anything you've been carrying, and the faster it is, the more of these you'll take off a beast before it decides otherwise. Two pelts, and take the knife off my belt before I change my mind."],
       "progress": [
           "{left} more timber wolf pelt, {name}. Seven hundred and seventy-four paces, none nearer than six hundred, and the pelt comes off one for one - forty-five pennies on four legs, and it will spend every one of them."],
       "complete": [
           "Two, and whole, at seven hundred and seventy-four paces from the only well this parish has. Then the knife is off my belt and into your hand, and there's your tier four - on no counter in Ashvale, Saltmere or the castle, made in the ledgers for a trade that works with a blade and never once given to a person until now. Use it on the next one."]},
      {"id": 5, "zone": "village", "goal": {"talk": "pip", "n": 1}, "reward": "xp:dexterity:4400",
       "talk": [
           "Take the last of it down the lane to the apprentice, and don't ask me why. Pip's pump wants three washers out of a good skin, which is the only use this village has ever found for an animal it has killed. He cuts them out of the same hare I'd dress, and nobody has ever told him what they're made of.",
           "Tell him goatskin swells and there is no goat. I've said it twice and he's stopped hearing it, and it's true in a way that will annoy him for a week - I counted. There is no goat anywhere within three kilometres of this well. No lizard either. Both of them are in the ledgers as though somebody had seen one, and nobody ever has.",
           "He'll ask where the skins come from. Tell him a thousand and three herds stand within three kilometres of that well - a hundred and ninety-one packs of rats, four hundred and ninety-five hare herds, eighty-one sounders of boar and two hundred and thirty-six packs of timber wolves - and that the warden, the cook and he have between them asked for six skins in the whole history of this village.",
           "And take the last of my pay off me going. Four thousand four hundred points of dexterity, which is three thousand four hundred tiles of running, and which is what your legs have been earning since the day you arrived here with nothing while no living person in this village ever handed you a point of it in writing. There. Now it's written."],
       "progress": [
           "Pip, {name}, down the lane, holding something that very likely shouldn't work. Tell him the goats don't exist and give him my regards, which he won't thank you for."],
       "complete": [
           "So the apprentice gets his washers, the cook gets his dinner, the warden gets his trophy, and you've got the knife - and for one afternoon the skins went somewhere. That isn't a revolution, it's a trade. A trade is how the rest of it will go."]},
    ],
    "done": [
        "Four skins, one knife, and a number I've carried about for eleven years: a thousand and three herds within three kilometres of that well, and six skins in the whole history of this village that anybody has wanted.",
        "Thirteen thousand six hundred points of dexterity between the four of my steps, which is eleven of it if you came to me as bare as the day you walked up. That's three thousand four hundred tiles of running, handed over by a skinning knife instead of a pair of boots, and it's the first time anybody in this village has written a point of it down for anybody.",
        "Come back in the autumn and the bark will be short and the vats full, and then I'll want a hundred of them. Until then you've the knife, and it's the only tier four of anything in this parish that was ever made for a person.",
        "And if anybody tells you there's goatskin at the bottom of the bin, send them to me. There's no goat within three kilometres of Ashvale, and I've walked all of them."]},
}
module('quests', 2, {"quests": dict(quests_out, **TRAIL)})

# ---------------------------------------------------------------- zones
W = 48
R = random.Random(20260930)

# the tile legend, in one place: which letters stop you walking, and which stop you seeing. scene.js
# draws the same letters (trees, rocks with ore), rules.json ships this same set.
T_BLOCK = "TPORNIr~FHXWMYCGA"
T_LOS = "TPORNIrHXWMYCGA"
T_TREE = "TPOMWY"
T_ROCK = "RNICGA"


def tree_char(r):
    x = r.random()
    return 'P' if x < 0.38 else ('O' if x < 0.46 else 'T')


# --- Whisperwood: rows 0..39, the original 24-wide forest in the middle (x 12..35), wild forest either side
ww_src = WORLD['zones']['whisperwood']
OX = 12
ww = []
for y in range(40):
    row = []
    for x in range(W):
        if OX <= x < OX + 24:
            c = ww_src['map'][y][x - OX]
            row.append(tree_char(R) if c == 'T' else ('~' if c == '~' else ','))
        else:
            row.append(tree_char(R) if R.random() < 0.85 else ',')
    ww.append(row)
# opening at the bottom (towards the village gate) and a path up into the forest
for y in range(30, 40):
    for x in (23, 24, 25):
        ww[y][x] = 'p' if x != 25 or y > 35 else ','
for y in range(22, 30):
    ww[y][23 + (1 if y % 7 < 3 else 0)] = 'p'
# the goblin camp: a clearing east of the old forest, through a gap in its east edge
for y in range(19, 30):
    for x in range(36, 47):
        if (x - 41.5) ** 2 / 30 + (y - 24.5) ** 2 / 25 < 1:
            ww[y][x] = ','
for y in (24, 25):
    for x in (34, 35, 36):
        ww[y][x] = ','
camp_objs = [{"k": "tent", "x": 39, "y": 21, "w": 2, "h": 2}, {"k": "tent", "x": 43, "y": 21, "w": 2, "h": 2},
             {"k": "tent", "x": 44, "y": 26, "w": 2, "h": 2}, {"k": "campfire", "x": 41, "y": 24, "w": 1, "h": 1}]
for o in camp_objs:
    for yy in range(o['y'], o['y'] + o['h']):
        for xx in range(o['x'], o['x'] + o['w']):
            ww[yy][xx] = 'X'
# a few boulders for character
for (x, y) in [(15, 37), (31, 33), (26, 18), (14, 22), (33, 6)]:
    if ww[y][x] == ',':
        ww[y][x] = 'r'
# the valley's other trees. Willows where the ground is wet, maples through the middle forest,
# yews only in the deep north — so the ladder climbs as you walk away from the village.
# Its own Random: the village layout further down must not shift because these lines were added.
TW = random.Random(20261001)
ww2 = [row[:] for row in ww]
for y in range(40):
    for x in range(W):
        if ww[y][x] not in 'TP':
            continue
        wet = any(ww[yy][xx] == '~' for yy in (y - 1, y, y + 1) for xx in (x - 1, x, x + 1) if 0 <= yy < 40 and 0 <= xx < W)
        bank = any(ww[yy][xx] == '~' for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)) if 0 <= yy < 40 and 0 <= xx < W)
        r = TW.random()
        ww2[y][x] = 'W' if (wet and not bank) else ('Y' if y < 10 and r < 0.09 else ('M' if y < 20 and r < 0.15 else ww[y][x]))
ww = ww2
spawns = [{"m": s['m'], "x": s['x'] + OX, "y": s['y']} for s in ww_src['spawns']]
spawns += [{"m": "goblin", "x": 38, "y": 24}, {"m": "goblin", "x": 42, "y": 27}, {"m": "goblin", "x": 45, "y": 24},
           {"m": "goblin", "x": 41, "y": 20}, {"m": "goblin_chief", "x": 43, "y": 23}]   # the Chief, in the middle of his camp
# v0.8.6-v15 (the local agent, 2026-10-04): the rat post at (15,36) stood in a walled pocket nobody could reach; it lives
# at (17,36). Ported here from the hand-fixed data file so a regeneration keeps it (tests/core_test.js checks every post).
for s in spawns:
    if (s['m'], s['x'], s['y']) == ('rat', 15, 36): s['x'] = 17
# what armed enemies CARRY (it shapes how they fight, and it drops when they die): two bandits are archers, the leader has a potion
CARRY = {(25, 9): {"arrows_t1": 12}, (19, 4): {"arrows_t1": 10}, (14, 3): {"potion": 1}}
for sp in spawns:
    if (sp['x'], sp['y']) in CARRY: sp['carry'] = CARRY[(sp['x'], sp['y'])]
for s in spawns:   # every spawn must stand on open ground
    assert ww[s['y']][s['x']] in ',p.', s
# Globe P2 (2026-10-02: "you should be able to leave Ashvale by traveling in any direction through the woods"):
# trails out of the old map. A path tile on the outer edge is continued into the seeded land by worldgen (forking dirt
# paths), so each trail ends on the edge. North: from the top of the forest path straight up through the woods; west: from
# the path across the west woods; east: through the gap behind the goblin camp. Only trees and floor turn into path.
def carve(grid, pts):   # a 4-connected trail through pts (a diagonal step gets its corner tile too: no corner cutting)
    full = []
    for i, (x, y) in enumerate(pts):
        if i and x != pts[i - 1][0] and y != pts[i - 1][1]:
            full.append((x, pts[i - 1][1]))
        full.append((x, y))
    for (x, y) in full:
        if grid[y][x] in 'TPOWMY,r.':
            grid[y][x] = 'p'
carve(ww, [(23 + (1 if (y // 4) % 2 else 0), y) for y in range(21, -1, -1)])
carve(ww, [(x, 31 + (1 if (x // 5) % 2 else 0)) for x in range(22, -1, -1)])
carve(ww, [(46, 24), (47, 24)]); carve(ww, [(46, 25), (47, 25)])
module('zone.whisperwood', 2, {"name": "Whisperwood", "level": "1-18", "origin": [0, 0], "size": [W, 40],
                               "ground": "forest", "tiles": [''.join(r) for r in ww], "objects": camp_objs,
                               "weather": {"kinds": {"clear": 45, "fog": 35, "rain": 15, "snow": 5}, "min": 300, "max": 900},
                               "spawns": spawns, "npcs": [], "music": None})

# --- the village: rows 40..63 (local 0..23)
H = 24
vg = [['.' for _ in range(W)] for _ in range(H)]
objs, npcs = [], []


def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            vg[y][x] = c


# border woods
for y in range(H):
    for x in range(W):
        if x <= 2 or y >= 22 or (x >= 46) or (x == 3 and R.random() < .5) or (y == 21 and R.random() < .4 and not 4 <= x <= 35):
            vg[y][x] = tree_char(R)
# paths
rect(23, 0, 25, 1, 'p')
rect(23, 2, 24, 18, 'p')
rect(16, 8, 26, 13, 'p')
rect(9, 7, 16, 8, 'p')
rect(26, 7, 31, 8, 'p')
rect(25, 10, 45, 11, 'p')
rect(17, 13, 22, 16, 'p')
# fence around the village, gates north (x 23-25) and east (y 9-11)
for x in range(4, 36):
    if not 23 <= x <= 25:
        vg[1][x] = 'F'
    vg[21][x] = 'F'
for y in range(1, 22):
    vg[y][4] = 'F'
    if not 9 <= y <= 11:
        vg[y][35] = 'F'


def building(k, x, y, w, h, **kw):
    o = {"k": k, "x": x, "y": y, "w": w, "h": h}
    o.update(kw)
    objs.append(o)
    if k in ('house', 'shop', 'smithy'):
        o['enter'] = True                     # walk-in building: floor tiles 'i', walls on the tile EDGES (core), roof hides inside
        rect(x, y, x + w - 1, y + h - 1, 'i')
    else:
        rect(x, y, x + w - 1, y + h - 1, 'X')


def furn(k, x, y, w=1, h=1, **kw):            # furniture inside a building: blocks its tiles
    building(k, x, y, w, h, **kw)


building('shop', 7, 2, 6, 5, door=[10, 6], sign="General Store", roof="#7a3b2a", wall="#d8c9a3")
building('smithy', 27, 2, 6, 5, door=[29, 6], sign="Armoury", roof="#4a4f5a", wall="#b9b0a0")
building('house', 6, 13, 5, 5, door=[8, 13], roof="#5b4a8a", wall="#e0d6c0", owner="maren")
building('house', 27, 14, 5, 5, door=[29, 14], roof="#7a5a2a", wall="#d6cbb2")
building('house', 12, 17, 5, 4, door=[14, 17], roof="#3f6a4a", wall="#ddd2bb")
# interiors
furn('shelf', 7, 2, 3, 1); furn('shelf', 11, 2, 2, 1); furn('counter', 8, 4, 2, 1); furn('barrel', 12, 5)
furn('furnace', 31, 2, 2, 2); furn('table', 27, 2, 2, 1); furn('rack', 27, 5)
furn('bed', 6, 16, 1, 2); furn('table', 9, 15); furn('fireplace', 10, 17, face='n', mount={'item': 'sword_t1', 'quest': 'ashen_crown', 'untilStep': 2}); furn('chair', 8, 15)
furn('bed', 31, 17, 1, 2); furn('table', 28, 17, 2, 1); furn('shelf', 27, 14, 1, 1)
furn('bed', 16, 19, 1, 2); furn('table', 12, 19); furn('chair', 13, 19)
building('well', 19, 10, 2, 2)
building('anvil', 33, 8, 1, 1)
building('rack', 32, 7, 1, 1)
building('range', 21, 17, 1, 1)
building('barrel', 13, 6, 1, 1)
building('barrel', 6, 9, 1, 1)
building('stall', 16, 5, 1, 1)
building('crate', 6, 7, 1, 1)
building('crate', 26, 3, 1, 1)
building('barrel', 33, 3, 1, 1)
for (x, y) in [(22, 2), (26, 2), (16, 9), (26, 12), (16, 12), (34, 12), (22, 19)]:
    building('torch', x, y, 1, 1)
for (x, y) in [(6, 10), (7, 10), (12, 11), (13, 11), (30, 11 - 1), (17, 18), (18, 18), (9, 19), (31, 19), (32, 19), (5, 3)]:
    if vg[y][x] == '.':
        vg[y][x] = 'f'
# the mine (east of the gate) and the lake
rect(37, 2, 45, 8, 'd')
for (x, y, c) in [(38, 3, 'R'), (40, 2, 'N'), (42, 4, 'R'), (44, 3, 'N'), (44, 6, 'I'), (41, 7, 'R'), (38, 6, 'N'),
                  (45, 8, 'I'), (40, 5, 'R')]:
    vg[y][x] = c
# further into the pit: coal, then gold, and mithril in the far north-east corner, so the mine
# itself climbs the same 20/30/40 ladder as the gear. The way in is past the copper and tin.
for (x, y, c) in [(39, 5, 'C'), (43, 6, 'C'), (41, 3, 'C'), (44, 2, 'G'), (42, 2, 'G'), (45, 5, 'G'),
                  (45, 2, 'A'), (43, 3, 'A')]:
    assert vg[y][x] == 'd', (x, y, vg[y][x])
    vg[y][x] = c
lake = []
for y in range(12, 22):
    for x in range(36, 46):
        e = (x - 41.0) ** 2 / 18 + (y - 17.0) ** 2 / 11
        if e < 1:
            vg[y][x] = '~'
        elif e < 1.7 and vg[y][x] not in 'TPO':
            vg[y][x] = 's'
# the lake's fishing spots, in village coordinates (the +40 comes at the end): shrimp in the
# shallows, trout and salmon further out on a rod, one lobster in the deep hole at the east end off
# a pot. req/xp/tool here override rules.nodes.fish for that one spot.
fish = []
for (x, y) in [(37, 16), (40, 14), (44, 15), (38, 19)]:
    assert vg[y][x] == '~', (x, y, vg[y][x])
    fish.append({"x": x, "y": y, "fish": "shrimp_raw"})
for (x, y, f, req, xp, tool) in [(37, 17, 'trout_raw', 20, 250, 'fishing_rod'), (37, 18, 'trout_raw', 20, 250, 'fishing_rod'),
                                 (41, 14, 'salmon_raw', 30, 350, 'fishing_rod'), (40, 20, 'salmon_raw', 30, 350, 'fishing_rod'),
                                 (45, 16, 'lobster_raw', 40, 500, 'lobster_pot')]:
    assert vg[y][x] == '~', (x, y, vg[y][x])
    fish.append({"x": x, "y": y, "fish": f, "req": req, "xp": xp, "tool": tool})
# willows like wet ground, so the ring of ground round the lake gets them — two tiles back from the
# water still counts as wet to a willow. Not on the waterline itself though: a trunk standing in the
# bank seals the spots behind it, and a spot you cannot stand beside is a spot that does not exist.
TW2 = random.Random(20261002)
for y in range(11, 23):
    for x in range(34, 47):
        if vg[y][x] not in 's.f' or not any(vg[yy][xx] in 's~' for yy in (y - 1, y, y + 1) for xx in (x - 1, x, x + 1) if 0 <= yy < H and 0 <= xx < W):
            continue
        if any(vg[yy][xx] == '~' for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)) if 0 <= yy < H and 0 <= xx < W):
            continue
        if any(abs(x - f['x']) <= 1 and abs(y - f['y']) <= 1 for f in fish):
            continue
        if TW2.random() < 0.35:
            vg[y][x] = 'W'
# Water blocks, so a spot is only worth having if a tile you can actually walk to lies beside it.
# Flood the village four-way from the well and insist every spot touches flooded ground.
seen, stack = {(22, 12)}, [(22, 12)]
while stack:
    x, y = stack.pop()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and vg[ny][nx] not in T_BLOCK:
            seen.add((nx, ny))
            stack.append((nx, ny))
for f in fish:
    assert any((f['x'] + dx, f['y'] + dy) in seen for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))), f
    f['y'] += 40
npcs = [
    {"id": "maren", "name": "Elder Maren", "look": "maren", "x": 14, "y": 51, "talk": "quest", "quest": "ashen_crown", "gift": "ashvale_stone", "giftAfter": {"quest": "ashen_crown", "step": 3},   # only once the Goblin Chief is slain (2026-10-05)
     "giftLine": "Take this stone, {name}. The well's mark is cut into it: hold it and think of home, and it will bring you back to Ashvale. It needs a while to wake again after."},
    {"id": "tam", "name": "Tam the grocer", "look": "tam", "x": 9, "y": 43, "shop": "general"},
    {"id": "garrick", "name": "Garrick the smith", "look": "garrick", "x": 29, "y": 44, "shop": "armoury"},
    {"id": "wren", "name": "Wren the tailor", "look": "wren", "x": 15, "y": 46, "tailor": True, "shop": "tailor",
     "greet": "Fancy a new look, love? Pick any cut and colour you like, no charge for the first fitting."},
    # The Drove Road (2026-10-05: quests and story NPCs along the road east to Saltmere). He stands at the east
    # gate with his beasts, which is where a road story starts. `look` reuses an outfit; the quest lives in TRAIL above.
    {"id": "rowan", "name": "Rowan the drover", "look": "rowan", "x": 31, "y": 50, "talk": "quest", "quest": "drove_road",
     "examine": "Rowan the drover, and behind him six beasts that know exactly how far it is to Saltmere."},
    # The Ghost Devs (2026-10-03): the seven who built Ashvale, living in it. They are villagers with jobs,
    # not a booth: `lines` is ordinary talk (core.js), `examine` is what Looking gives. Keep them off the feed.
    {"id": "silas", "name": "Silas the mason", "look": "silas", "x": 18, "y": 50, "talk": "quest", "quest": "bronze_gate",
     "examine": "Silas the mason. He laid the well, the two shops and the north gate, and he means you to know it."},
    {"id": "pip", "name": "Pip the apprentice", "look": "pip", "x": 20, "y": 52, "talk": "quest", "quest": "tin_pipe",
     "examine": "Pip the apprentice, holding something that very likely shouldn't work."},
    {"id": "pax", "name": "Pax the painter", "look": "pax", "x": 24, "y": 49,
     "examine": "Pax the painter, blue to the wrist and proud of it.",
     "lines": ["Every colour in this village came through my hands. That blue on the door took me nine tries.",
               "They wanted the sky cheaper. A cheap sky is grey weather, I told them. It's still grey weather."]},
    {"id": "modulus", "name": "Modulus the surveyor", "look": "modulus", "x": 33, "y": 50,
     "examine": "Modulus the surveyor, measuring the east road for the third time this morning.",
     "lines": ["I measured this street at a hundred and forty-four feet. They said it needed to be a hundred and forty-three. It is, somehow.",
               "Everything twice, once well. That's the whole trade. Count the ground before you sell it."]},
    {"id": "latency", "name": "Latency the warden", "look": "latency", "x": 22, "y": 44, "talk": "quest", "quest": "elder_bow",
     "examine": "Latency the warden, on the north road. Late to everything, and there before you are."},
    {"id": "symmetry", "name": "Symmetry the curator", "look": "symmetry", "x": 16, "y": 57,
     "examine": "Symmetry the curator, watching the way the light comes in over the lake.",
     "lines": ["I keep the things that look right and I hide the ones that don't. The lake is the best thing here; it took four of us a fortnight.",
               "The most beautiful screen is an empty one. I said so, and they gave me a room full of pots."]},
    # The Kitchen Range (a tester, 2026-10-05, increment 12). Seven paces from the well stands the village range and
    # nobody had stood at it; the cook does. `look` reuses an existing face (the trail's other NPCs do the same) and she
    # stands on the free tile west of the range, so all four working sides of it stay open. The quest lives in TRAIL.
    {"id": "cinder", "name": "Hob the cook", "look": "hob",   # renamed (2026-10-05: two "Cinder"s and the tailor's look)
     "x": 20, "y": 57, "talk": "quest", "quest": "kitchen_range",
     "examine": "Hob the cook, at the range seven paces from the well - the only person in this village who has ever used it."},
    # The Skinning Knife (a tester, 2026-10-05, increment 13). The village has killed about 1,700 beasts a day
    # within a kilometre and a half of this tile for as long as there has been a village, and it has never once asked
    # where the skins go. He stands on the free ground east of the east road, downwind of the street and beside the
    # lane a cart would take the hides down; `look` reuses an existing face, as the trail's other NPCs do.
    {"id": "fenn", "name": "Fenn the tanner", "look": "fenn", "x": 36, "y": 48, "talk": "quest", "quest": "skinning_knife",
     "examine": "Fenn the tanner, on the lane below the east road, with frames of skins that nobody in this village knew he had."},
    # The town chest (2026-10-04: "a chest in town" holding your arcade wallet; bag and chest share one wallet,
    # the game only remembers which holdings you carry). Opening it is engine-side (event 'chest').
    {"id": "chest", "name": "Ashvale chest", "look": "chest", "x": 24, "y": 53, "chest": True,
     "examine": "The Ashvale chest. Everything you own from Ashvale is kept in your arcade wallet; this is where you see it."},
    {"id": "auditor", "name": "Auditor the clerk", "look": "auditor", "x": 26, "y": 53, "talk": "quest", "quest": "hawk_ring",
     "examine": "Auditor the clerk, with a ledger, a scale, and one line in the ledger he has waited forty years to close."},
]
for o in objs:
    o['y'] += 40
    if 'door' in o:
        o['door'][1] += 40
for n in npcs:
    assert vg[n['y'] - 40][n['x']] in '.pfi', n
# Globe P2 trails out of the village (see Whisperwood above): east, the main road runs on off the map; south, a lane
# past the lake's west shore through the trees.
carve(vg, [(46, 10), (47, 10), (46, 11), (47, 11), (38, 21), (38, 22), (38, 23), (39, 22), (39, 23)])
module('zone.village', 2, {"name": "Ashvale village", "level": "safe", "origin": [0, 40], "size": [W, H], "ground": "village",
                           "tiles": [''.join(r) for r in vg], "objects": objs, "spawns": [], "npcs": npcs,
                           "fishing": fish, "respawn": [22, 52], "start": [22, 52],
                           "weather": {"kinds": {"clear": 70, "rain": 20, "fog": 10}, "min": 300, "max": 900}})

# ---------------------------------------------------------------- shared: tiles legend, gathering, xp table
xp = [0, 0]
pts = 0
for L in range(1, 99):
    pts += math.floor(L + 300 * 2 ** (L / 7))
    xp.append(pts // 4)
assert xp[:61] == WORLD['xp_table'][:61], 'xp curve must match the original ASHVALE world'
module('rules', 3, {
    "xp": xp,
    # ^ mountain rock and K standing stones / ruin walls come from the seeded land (worldgen, globe P2): both block
    "tiles": {"block": T_BLOCK + "^K", "los": T_LOS + "^K", "tree": T_TREE, "rock": T_ROCK, "floor": "i"},
    "nodes": {
        # a felled tree stays felled, for every player, forever (2026-10-05): regrow -1; the @ashvale Bank keeps the shared list
        "T": {"skill": "woodcutting", "name": "Tree", "item": "logs", "req": 1, "xp": 250, "speed": 4, "deplete": 6, "regrow": -1},
        "P": {"skill": "woodcutting", "name": "Pine tree", "item": "logs", "req": 1, "xp": 250, "speed": 4, "deplete": 6, "regrow": -1},
        "O": {"skill": "woodcutting", "name": "Oak tree", "item": "oak_logs", "req": 15, "xp": 375, "speed": 4, "deplete": 8, "regrow": -1},
        "W": {"skill": "woodcutting", "name": "Willow", "item": "willow_logs", "req": 20, "xp": 500, "speed": 4, "deplete": 8, "regrow": -1},
        "M": {"skill": "woodcutting", "name": "Maple", "item": "maple_logs", "req": 30, "xp": 675, "speed": 5, "deplete": 8, "regrow": -1},
        "Y": {"skill": "woodcutting", "name": "Yew", "item": "yew_logs", "req": 40, "xp": 900, "speed": 5, "deplete": 10, "regrow": -1},
        "R": {"skill": "mining", "name": "Copper rocks", "item": "copper_ore", "req": 1, "xp": 175, "speed": 4, "deplete": 1, "regrow": 8},
        "N": {"skill": "mining", "name": "Tin rocks", "item": "tin_ore", "req": 1, "xp": 175, "speed": 4, "deplete": 1, "regrow": 8},
        "I": {"skill": "mining", "name": "Iron rocks", "item": "iron_ore", "req": 15, "xp": 350, "speed": 4, "deplete": 1, "regrow": 15},
        "C": {"skill": "mining", "name": "Coal rocks", "item": "coal", "req": 20, "xp": 250, "speed": 4, "deplete": 1, "regrow": 20},
        "G": {"skill": "mining", "name": "Gold rocks", "item": "gold_ore", "req": 30, "xp": 420, "speed": 4, "deplete": 1, "regrow": 30},
        "A": {"skill": "mining", "name": "Mithril rocks", "item": "mithril_ore", "req": 40, "xp": 600, "speed": 5, "deplete": 1, "regrow": 45},
        "fish": {"skill": "fishing", "name": "Fishing spot", "req": 1, "xp": 100, "speed": 5, "deplete": 0},
        "range": {"skill": "cooking", "name": "Cooking range", "speed": 4},
        "fire": {"skill": "cooking", "name": "Campfire", "speed": 4, "burnBonus": 10}},
    "skills": ["attack", "strength", "defence", "hitpoints", "ranged", "magic", "dexterity", "speechcraft", "woodcutting", "mining", "fishing", "cooking", "firemaking"],
    "fires": {"lightTicks": 3, "basePct": 50, "pctPerLevel": 2, "maxPct": 95},
    "effects": {"note": "effect library (core.js EFFECTS); item JSON: Effect, Effect ticks, Effect chance (%), Effect damage. Unknown effects are ignored.",
                "known": ["freeze", "stun", "slow", "poison", "burn"]},
    "spells": [[1, 2, "Wind strike"], [5, 4, "Water strike"], [9, 6, "Earth strike"], [13, 8, "Fire strike"], [17, 9, "Wind bolt"],
               [23, 10, "Water bolt"], [29, 11, "Earth bolt"], [35, 12, "Fire bolt"], [41, 13, "Wind blast"], [47, 14, "Water blast"]],
    "start": {"inv": [["coins", 75], ["bread", 1], ["bread", 1], ["bread", 1]], "hitpoints": 10,
              "points": 10, "maxPerSkill": 5,
              "skills": ["attack", "strength", "defence", "ranged", "magic", "hitpoints", "dexterity", "speechcraft"]},
    "items": {
        "categories": {"weapon": ["sword", "dagger", "longsword", "mace", "bow", "staff"], "armour": ["helmet", "platebody", "chainbody", "platelegs", "kiteshield"],
                       "tool": ["hatchet", "pickaxe", "net", "rod", "pot", "tinderbox", "stone"], "pack": ["pack"], "cosmetic": ["hat", "cape"],
                       "resource": ["logs", "ore", "coal", "bar", "pelt", "fish", "mushroom", "meat"], "food": ["bread", "fish", "mushroom", "meat"], "potion": ["healing"],
                       "ammo": ["arrow"], "currency": ["gold"], "jewellery": ["ring"]},
        "slots": {"weapon": "weapon", "armour/helmet": "head", "armour/platebody": "body", "armour/chainbody": "body", "armour/platelegs": "legs",
                  "armour/kiteshield": "shield", "ammo": "ammo", "pack": "pack", "cosmetic/hat": "head", "cosmetic/cape": "cape", "jewellery/ring": "ring"},
        "weapons": {"sword": {"class": "melee", "anim": "slash"}, "dagger": {"class": "melee", "anim": "stab"}, "longsword": {"class": "melee", "anim": "slash"},
                    "mace": {"class": "melee", "anim": "crush"}, "bow": {"class": "ranged", "anim": "bow", "twoHanded": True}, "staff": {"class": "magic", "anim": "cast"}},
        "tools": {"hatchet": "woodcutting", "pickaxe": "mining", "net": "fishing", "rod": "fishing", "pot": "fishing", "tinderbox": "firemaking"},
        "edible": ["food", "potion"], "drink": ["potion"],
        "traits": {"Form": "form", "Teleport": "teleport", "Cooldown ticks": "cooldown", "Call to arms": "arms", "Attack": "attack", "Strength": "strength", "Defence": "defence", "Ranged": "ranged", "Magic": "magic", "Ranged strength": "rstr",
                   "Speed": "speed", "Range": "range", "Carry": ["carry", 1000], "Heal": "heal", "Heal %": "healPct", "Cooks into": "cooks",
                   "Burns into": "burns", "Cooking level": "cookReq", "Cooking XP": "cookXp", "Firemaking level": "fireReq", "Burn ticks": "burnTicks",
                   "Firemaking XP": "fireXp", "Effect": "effect", "Effect ticks": "effectTicks", "Effect chance": "effectChance", "Effect damage": "effectDamage"},
        "limits": {"perTier": {"Attack": 12, "Strength": 12, "Ranged": 12, "Magic": 12, "Defence": 16, "Ranged strength": 8},
                   "flat": {"Speed": [2, 7], "Range": [1, 10], "Carry": [0, 100], "Heal": [0, 40], "Heal %": [0, 100], "Cooking level": [1, 99], "Cooking XP": [0, 500],
                            "Firemaking level": [1, 99], "Burn ticks": [10, 600], "Firemaking XP": [0, 500], "Effect ticks": [1, 50], "Effect chance": [0, 100], "Effect damage": [0, 20]},
                   "weight": [1, 100000], "tier": [1, 5]},
        "armouryMap": {"sword": "weapon/sword", "bow": "weapon/bow", "staff": "weapon/staff", "helmet": "armour/helmet", "body": "armour/platebody",
                       "legs": "armour/platelegs", "shield": "armour/kiteshield"},
        "creator": "nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c"},
    # Weather (the operator: "Any zone should be able to have weather like fog rain or snow"). Generic multipliers that core reads;
    # a new kind is data only. Each applies scaled by intensity (50-100 %): value = 1 + (mult - 1) * intensity.
    #   sight: monster aggro radius   range: ranged/magic attack range (players and monsters)   fireFail: + chance a
    #   firemaking attempt fails   fireBurn: campfire burn time   run: share of running ticks that actually run 2 tiles
    "weather": {"climate": {"0": {"kinds": {"clear": 45, "rain": 30, "fog": 25}, "min": 300, "max": 900}, "1": {"kinds": {"clear": 60, "rain": 25, "fog": 15}, "min": 300, "max": 900}, "2": {"kinds": {"clear": 80, "rain": 12, "fog": 8}, "min": 400, "max": 1100}, "3": {"kinds": {"clear": 96, "rain": 2, "fog": 2}, "min": 600, "max": 1500}, "4": {"kinds": {"clear": 72, "rain": 23, "fog": 5}, "min": 300, "max": 900}, "5": {"kinds": {"clear": 25, "rain": 55, "fog": 20}, "min": 240, "max": 720}, "6": {"kinds": {"clear": 35, "snow": 35, "fog": 20, "rain": 10}, "min": 300, "max": 900}, "7": {"kinds": {"clear": 30, "snow": 55, "fog": 15}, "min": 300, "max": 900}, "coastFog": 12},   # 2026-10-03: weather follows the climate zone (worldgen climate)
               "kinds": {"clear": {}, "fog": {"sight": 0.5, "range": 0.6}, "rain": {"fireFail": 0.25, "fireBurn": 0.6},
                          "snow": {"run": 0.85, "sight": 0.8}},
                "say": {"clear": "The sky clears.", "fog": "A fog rolls in.", "rain": "It starts to rain.", "snow": "Snow begins to fall."},
                "intensity": [50, 100]},
    "retaliate": {"ticks": 10, "beyond": 12, "note": "a monster hit in the last `ticks` keeps its attacker as target across zone borders and up to `beyond` tiles past its leash (the operator)"},
    # 2026-10-05: monsters should eventually come back even while players stay ("maybe give them like a 20 minute spawn time")
    "respawn": {"emptyTicks": 50, "deadTicks": 2000, "note": "a dead monster comes back when its zone has been empty this long (50 ticks = 30 s) and someone enters, or after deadTicks (2000 = 20 min) at its post when no player stands within 8 tiles of it"},
    "carry": {"base": 30000, "perStrength": 1000, "unit": "grams", "frozenPct": 150},
    "death": {"pileTicks": 1000, "note": "everything carried and worn drops where you die; what rules.persist keeps (Gold, stones, magical, worth 100+) stays until taken, the rest lasts pileTicks (1000 = 10 minutes)"},
    # town portals (2026-10-04: "put a town portal in each of the towns"): stand by one and travel to any other;
    # `to` is where you arrive. The Ashvale stone (Teleport "ashvale") takes you to the same spot.
    "portals": [{"id": "ashvale", "name": "Ashvale", "x": 19, "y": 55, "to": [19, 56]},
                {"id": "saltmere", "name": "Saltmere", "x": 462, "y": 28, "to": [462, 29]}],   # the lake castle's portal is added by tools/castle/make_castle.js when the castle ships
    # 2026-10-04: "logs, pelts arrows potions should all de spawn. Only Gear and tools and Gold should persist."
    # 2026-10-06: "Gold, and valuable items should stay there until somebody picks them up" (by value, 100 GOLD);
    # "All teleport or rune stone must always persist". The @ashvale Bank keeps them in the world across sessions.
    "persist": {"minValue": 100, "always": ["currency"], "teleport": True,
                "note": "a drop lies where it fell until someone takes it when it is Gold, a teleport stone or rune stone, magical, or worth minValue GOLD or more (value x how many); everything else despawns. The @ashvale Bank holds persisted drops and shows them to every player"},
    "dexterity": {"drainPerLevelPermille": 5, "drainMaxPermille": 400, "dodgePerTenLevels": 1, "fastAt": 50, "fastKinds": ["dagger", "bow"],
                  "xpPerRunTile": 2, "xpPerDamage": 10},
    "speechcraft": {"pctPerLevelPermille": 4, "maxPermille": 300, "xpPerGold": 1, "xpQuestTalk": 250},
    "yard": {"note": "2026-10-04: chickens wherever there are buildings - n birds per `per` buildings, by a building, at most max per town", "kinds": ["house", "shop", "smithy", "inn", "tavern", "hall"], "per": 2, "n": 2, "max": 14, "birds": ["chicken", "hen"]},   # town birds (2026-10-04): n per `per` buildings, by a building (src/world.js)
})

# Where ASHVALE sits on the globe (GLOBE.md P2). One constant place for the seed and the set-piece origin, so they can
# change before the grid spec is inscribed (the operator picks the seed). Game tile frame of a face: x = east = planar x,
# y = south = -planar y (1 tile = 1 m, origin at the face centroid), as in src/worldgen.js.
#   face     the core region's face for this seed (= globe classes().coreFace; tests/core_test.js checks it)
#   origin   face tile of the old map's (0, 0): the village + Whisperwood keep their old coordinates (vale frame = face
#            tile frame minus origin), centred on the core region's centre cell (same spot the Atlas uses)
#   grid     face tile where the area (128 m) and region (512 m) grids start; chosen so the two set pieces sit inside one
#            region and every 64 m chunk lies in exactly one area
#   belt     metres of continuing woods worldgen grows around each set piece
# origin/grid follow the core centre cell for the seed: origin = [floor(x) - 24, floor(-y) - 32] at that cell's planar
# point, grid = origin - [192, 192] (tests/core_test.js checks both against the globe). Ashvale moved to the shore of
# the inland sea when the reserved land became a network (2026-10-03), so the face and the tiles moved with it;
# then to the coast of one of two continents on a mostly-ocean globe (2026-10-03 evening): face 19, Saltmere's shore parcel next door.
module('globecfg', 1, {"seed": "ashvale", "n": 128, "radius_m": 36110, "face": 19, "origin": [8811, -3368], "grid": [8619, -3560],
                       "chunk": 64, "area": 128, "region": 512, "belt": {"whisperwood": 90, "village": 30},
                       "links": [["village", "saltmere"]]})   # the trail from Ashvale down to Saltmere (2026-10-03)
