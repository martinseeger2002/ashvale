#!/usr/bin/env python3
"""make_farming.py - the Farming skill's data (2026-10-18, the operator: "make a new skill called farming - in random free spots between
saltmere ashvale and lake castle - ... the crops should take different amount of blocks to grow in a few different phases ... require
tools like osrs ... a way to get seeds from some combat enemies, random drop tables, higher seeds being less likely ... develop the crops
and assets to be inscribed as tokens"; and "make sure the items from previous quests look unique from other items completely, and have
an examine feature regarding their use in game").

Writes:
- data/rules.json (and data/extra/rules.json): the skill, its item kinds and tools, and rules.farming - the crops (level, patch tier,
  phases, blocks a phase, yield, XP), the patch tiers, the seed drop table, the beasts that never carry seeds, the length of a block;
- items (data/extra + data/items.json): four tools, eight seeds, eight crops, every one with an examine line that says what it is for;
  and examine lines for the quest items made before, which now each have a model of their own;
- data/assets.json: every new item listed as a token to be inscribed (kind token, no propertyid yet: the wallet skips it until the
  token is issued and its id is filled in);
- data/shops.json: the tools and the three first seeds at the general stores;
- data/quests.json (and data/extra): three quests with farming steps (the new goal, harvest);
- data/parts/: the models - seed pouch, each crop, the tools, and the old quest items' own shapes.
The farming code: src/core.js (FARMING), the patches by the roads src/wg_paths.js (PATCHES), the patch beds src/scene.js, the crops
growing in them src/engine.js. The examine lines and quest talk were drafted by the local Qwen model (tools/farming/qwen_draft.json)
and edited by hand.
    python3 tools/farming/make_farming.py      (then python3 build.py)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'castle'))
from make_castle_extras import overlay, load, DD, EX, PARTS   # noqa: E402

# ---------------------------------------------------------------- the crops
# id: level, patch tier, phases, blocks a phase, yield [lo, hi], XP to plant, XP a crop dug up, seed value, crop value, heal (food) or None
CROPS = {
    "potato":     (1, 1, 4, 2, [3, 6], 8, 9, 3, 5, 1),
    "onion":      (5, 1, 4, 3, [3, 6], 10, 11, 5, 7, 2),
    "cabbage":    (9, 1, 4, 4, [3, 7], 12, 13, 8, 10, 3),
    "barley":     (14, 2, 5, 4, [4, 8], 16, 15, 12, 12, None),
    "strawberry": (19, 2, 5, 5, [3, 6], 22, 26, 18, 22, 6),
    "pumpkin":    (27, 2, 5, 7, [2, 4], 32, 40, 30, 45, 8),
    "moonleaf":   (33, 3, 4, 10, [2, 4], 45, 60, 60, 95, None),
    "frostbloom": (45, 3, 5, 12, [1, 3], 70, 95, 120, 230, None),
}
NAMES = {"potato": "Potato", "onion": "Onion", "cabbage": "Cabbage", "barley": "Barley", "strawberry": "Strawberry", "pumpkin": "Pumpkin",
         "moonleaf": "Moonleaf", "frostbloom": "Frostbloom"}
COL = {"potato": ("#b08a5a", "#6a4a2a"), "onion": ("#d8b878", "#8a6a3a"), "cabbage": ("#6aa84a", "#3a6a2a"), "barley": ("#d8b860", "#9a8040"),
       "strawberry": ("#d83a3a", "#c84a4a"), "pumpkin": ("#e07a20", "#b85a1a"), "moonleaf": ("#b8c8e8", "#5a6a9a"), "frostbloom": ("#8fd8f8", "#3a8ab0")}
SEED_TABLE = {"chance": 6, "weights": {"potato": 40, "onion": 26, "cabbage": 16, "barley": 9, "strawberry": 5, "pumpkin": 2.5, "moonleaf": 1.0, "frostbloom": 0.4},
              "note": "1 kill in `chance` drops a seed; which one by weight among the crops of level <= 2 x the beast's level + 3 (so the rare seeds come from the strong); rolled on dice of their own (core.js FARMING), never the world's"}
NO_SEEDS = ["sheep", "cow", "chicken", "hen", "hare", "snow_hare", "deer", "goat", "lizard"]   # livestock and prey: they carry no seeds
FARMING = {
    "block": 60, "hourSeconds": 300, "note": "a block is a minute of the game's clock (Dogecoin's block time); the clock keeps running while you are away, so crops grow offline",
    "crops": {k: {"lvl": v[0], "tier": v[1], "phases": v[2], "blocks": v[3], "yield": v[4], "xpPlant": v[5], "xpHarvest": v[6],
                  "seed": k + "_seed", "crop": k, "leaf": COL[k][1] if k in ("barley",) else "#4a8a34", "fruit": COL[k][0]} for k, v in CROPS.items()},
    "tiers": {"1": {"name": "small farming patch", "share": 0.62}, "2": {"name": "farming patch", "share": 0.27}, "3": {"name": "large farming patch", "share": 0.11}},
    "weeds": 3, "weedsBack": 25, "rakeXp": 4, "waterBonus": 1,
    "tools": {"rake": "rake", "plant": "dibber", "harvest": "spade", "water": "wateringcan"},
    "seeds": SEED_TABLE, "noSeeds": NO_SEEDS,
}

# ---------------------------------------------------------------- examine lines (Qwen's drafts, edited)
EX_TOOLS = {
    "rake": "A sturdy rake. Use it on a farming patch to clear the weeds before you plant.",
    "seed_dibber": "A pointed stick for poking seeds into soil. Needed to plant anything in a farming patch.",
    "spade": "A good iron spade. Dig up a farming patch's crop with it once the crop is fully grown.",
    "watering_can": "A watering can. Water a growing crop once for a bigger harvest; it refills itself from the dew, apparently.",
}
EX_SEEDS = {
    "potato": "Potato seeds (Farming 1). Plant in any farming patch; potatoes are ready in about 8 blocks.",
    "onion": "Onion seeds (Farming 5). Plant in any farming patch; onions are ready in about 12 blocks.",
    "cabbage": "Cabbage seeds (Farming 9). Plant in any farming patch; cabbages are ready in about 16 blocks.",
    "barley": "Barley seeds (Farming 14). Needs a farming patch or a large one, not a small patch; about 20 blocks.",
    "strawberry": "Strawberry seeds (Farming 19). Needs a farming patch or a large one; ripe in about 25 blocks.",
    "pumpkin": "Pumpkin seeds (Farming 27). Needs a farming patch or a large one; slow, about 35 blocks.",
    "moonleaf": "Moonleaf seeds (Farming 33). Only a large farming patch will take them; about 40 blocks.",
    "frostbloom": "Frostbloom seeds (Farming 45). Only a large farming patch; about 60 blocks, and worth every one.",
}
EX_CROPS = {
    "potato": "A potato, dug from your own patch. Eat it raw if you must (heals 1); it sells to the general stores.",
    "onion": "An onion. Eat it if you are brave (heals 2), or sell it; cooks pay well for them.",
    "cabbage": "A cabbage. Heals 3 if you eat it; the lodge on the mountain puts them in every stew.",
    "barley": "A sheaf of barley, for the mill and the brewers. Not food on its own; it sells well.",
    "strawberry": "A ripe strawberry. Heals 6 and tastes like summer.",
    "pumpkin": "A pumpkin. Heals 8 if you can face eating that much pumpkin.",
    "moonleaf": "A silver moonleaf. The wizards of the Frostspire grind it into their frost ink; worth a good deal.",
    "frostbloom": "A frostbloom, cold to the touch and faintly glowing. Rare, and prized by every wizard in the valley.",
}
# the quest items made before, each now with its own model and a line saying what it is for
QUEST_EXAMINE = {
    "edric_note": ("item.scroll", "A damp note in a Vorthan's hand naming the Red Pyre, the rosary and the cave. Take it to Mother Wenna in Saltmere (The Red Pyre)."),
    "frost_ink": ("item.inkpot", "A pot of the Frostspire's frost ink. Frost goblins steal it; Archmage Halvard wants three back (The Stolen Ink)."),
    "tome_echoes": ("item.tome_echoes", "The Circle's Tome of Echoes, from Aled. Show it to Pell at the Frostspire (The Scattered Tomes); yours to keep after, for its lore."),
    "tome_stones": ("item.tome_stones", "The Circle's Tome of Stones, from Wyn. Show it to Pell at the Frostspire (The Scattered Tomes); yours to keep after."),
    "tome_far_road": ("item.tome_far_road", "The Circle's Tome of the Far Road, from Tamsin. Show it to Pell (The Scattered Tomes); its last page warns of the chain."),
    "wool": ("item.fleece", "A fleece of wool from the castle's sheep. Keeper Wyn wants one as an offering (The Three Stones); it also sells."),
    "cowhide": ("item.cowhide", "A cowhide from the castle farm. Tanners and the castle's stores buy them."),
    "mutton_raw": ("item.chop", "Raw mutton. Cook it on a range or fire for roast mutton."),
    "mutton_cooked": ("item.chop", "Roast mutton. Heals 5; the castle's chaplain asks for some (Vespers)."),
    "mutton_burnt": ("item.chop", "Burnt mutton. Good for nothing but a lesson."),
    "beef_raw": ("item.steak", "Raw beef. Cook it on a range or fire."),
    "beef_cooked": ("item.steak", "Roast beef. Heals well; the castle kitchens buy it."),
    "beef_burnt": ("item.steak", "Burnt beef. The dogs won't touch it either."),
    "wizard_cloak": (None, "The upper half of the Circle's cloak. Worn on the body: Magic +10, Defence +12. Needs Magic 40; sold by Pell at the Frostspire."),
    "wizard_cloak_bottoms": (None, "The Circle's cloak skirts. Worn on the legs: Magic +7, Defence +8. Needs Magic 40; sold by Pell at the Frostspire."),
    "wizard_focus": (None, "An ice orb on a silver stem, from The Archmage's Trial. Held in the shield hand: Magic +5, so your spells land more often."),
}

# ---------------------------------------------------------------- items
def item(name, cat, sub, weight, model, value, examine, attrs=(), stack=False, coll="ASHVALE Farming"):
    d = {"name": name, "description": examine, "examine": examine, "collection": coll, "game": "ashvale", "category": cat, "subcategory": sub,
         "weight": weight, "model": model, "value": value, "attributes": list(attrs)}
    if stack: d["stackable"] = True
    return d

ITEMS = {
    "rake": item("Rake", "tool", "rake", 1400, "item.rake", 20, EX_TOOLS["rake"]),
    "seed_dibber": item("Seed dibber", "tool", "dibber", 300, "item.dibber", 8, EX_TOOLS["seed_dibber"]),
    "spade": item("Spade", "tool", "spade", 1600, "item.spade", 18, EX_TOOLS["spade"]),
    "watering_can": item("Watering can", "tool", "wateringcan", 900, "item.wateringcan", 25, EX_TOOLS["watering_can"]),
}
for k, v in CROPS.items():
    ITEMS[k + "_seed"] = item(NAMES[k] + " seed", "resource", "seed", 5, "item.seedpouch", v[7], EX_SEEDS[k], stack=True)
    heal = v[9]
    ITEMS[k] = item(NAMES[k], "food" if heal else "resource", "crop" if heal else ("grain" if k == "barley" else "herb"), 300 if k != "pumpkin" else 2200,
                    "item.crop_" + k, v[8], EX_CROPS[k], [{"trait_type": "Heal", "value": heal}] if heal else [])

PARTS_NEW = {}
def part(pid, items, shapes):
    PARTS_NEW[pid] = {"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": "item", "items": items, "shapes": shapes}
WOOD, IRON, DARK = "#7a5530", "#5a5e66", "#3a2a1a"
# seeds: one pouch, its tie and its colour the crop's
part("item.seedpouch", {k + "_seed": COL[k][1] for k in CROPS}, [
    {"t": "sphere", "s": [0.07], "c": "#c8b08a", "p": [0, 0.06, 0], "k": [1, 0.85, 1]},
    {"t": "cyl", "s": [0.035, 0.05, 0.05], "c": "#c8b08a", "p": [0, 0.13, 0], "seg": 7},
    {"t": "cyl", "s": [0.04, 0.04, 0.018], "c": "$c", "p": [0, 0.115, 0], "seg": 7},
    {"t": "sphere", "s": [0.02], "c": "$c", "p": [0.045, 0.05, 0.045]}])
# crops, each its own shape
part("item.crop_potato", {"potato": COL["potato"][0]}, [{"t": "sphere", "s": [0.06], "c": "$c", "p": [0, 0.05, 0], "k": [1.3, 0.85, 1]},
    {"t": "sphere", "s": [0.045], "c": "$c:0.9", "p": [0.08, 0.04, 0.04], "k": [1.2, 0.85, 1]}, {"t": "sphere", "s": [0.008], "c": "#5a3a1a", "p": [0.02, 0.1, 0.03]}])
part("item.crop_onion", {"onion": COL["onion"][0]}, [{"t": "sphere", "s": [0.065], "c": "$c", "p": [0, 0.065, 0]},
    {"t": "cone", "s": [0.03, 0.08], "c": "#8a9a4a", "p": [0, 0.15, 0]}, {"t": "cyl", "s": [0.03, 0.01, 0.02], "c": "#d8c8a0", "p": [0, 0.005, 0], "seg": 6}])
part("item.crop_cabbage", {"cabbage": COL["cabbage"][0]}, [{"t": "sphere", "s": [0.085], "c": "$c", "p": [0, 0.08, 0], "k": [1, 0.9, 1]},
    {"t": "sphere", "s": [0.07], "c": "$c:1.25", "p": [0, 0.1, 0.02]}, {"t": "sphere", "s": [0.06], "c": "$c:0.8", "p": [0.05, 0.06, -0.04], "k": [1, 0.7, 1.2]}])
part("item.crop_barley", {"barley": COL["barley"][0]}, [{"t": "cyl", "s": [0.012, 0.012, 0.32], "c": "#b89a50", "p": [x, 0.03, 0], "r": [1.5708, 0, 0.1 * i], "seg": 5} for i, x in enumerate([-0.03, 0, 0.03])]
    + [{"t": "capsule", "s": [0.02, 0.07], "c": "$c", "p": [x, 0.04, 0.19], "r": [1.5708, 0, 0]} for x in [-0.03, 0, 0.03]] + [{"t": "cyl", "s": [0.05, 0.05, 0.02], "c": "#8a6a3a", "p": [0, 0.03, -0.02], "r": [1.5708, 0, 0], "seg": 7}])
part("item.crop_strawberry", {"strawberry": COL["strawberry"][0]}, [{"t": "cone", "s": [0.05, 0.09], "c": "$c", "p": [0, 0.05, 0], "r": [3.1416, 0, 0]},
    {"t": "cyl", "s": [0.05, 0.03, 0.015], "c": "#3a8a2a", "p": [0, 0.1, 0], "seg": 6}, {"t": "cyl", "s": [0.006, 0.006, 0.03], "c": "#3a6a2a", "p": [0, 0.12, 0], "seg": 4}])
part("item.crop_pumpkin", {"pumpkin": COL["pumpkin"][0]}, [{"t": "sphere", "s": [0.12], "c": "$c", "p": [0, 0.1, 0], "k": [1.2, 0.8, 1.2]}]
    + [{"t": "sphere", "s": [0.06], "c": "$c:0.85", "p": [0.1 * c, 0.1, 0.1 * s], "k": [0.6, 1.4, 0.6]} for c, s in [(1, 0), (-1, 0), (0, 1), (0, -1)]]
    + [{"t": "cyl", "s": [0.015, 0.02, 0.06], "c": "#5a6a2a", "p": [0, 0.21, 0], "seg": 5}])
part("item.crop_moonleaf", {"moonleaf": COL["moonleaf"][0]}, [{"t": "box", "s": [0.06, 0.006, 0.16], "c": "$c", "p": [dx, 0.01 + i * 0.006, 0], "r": [0, 0.5 * (i - 1), 0], "glow": True} for i, dx in enumerate([-0.03, 0, 0.03])]
    + [{"t": "cyl", "s": [0.005, 0.005, 0.1], "c": "#8a9ab8", "p": [0, 0.012, -0.08], "r": [1.5708, 0, 0], "seg": 4}])
part("item.crop_frostbloom", {"frostbloom": COL["frostbloom"][0]}, [{"t": "cyl", "s": [0.006, 0.006, 0.16], "c": "#4a7a6a", "p": [0, 0.08, 0], "seg": 4}]
    + [{"t": "sphere", "s": [0.04], "c": "$c", "p": [0.035 * c, 0.17, 0.035 * s], "k": [1, 0.4, 1], "glow": True} for c, s in [(1, 0), (-1, 0), (0, 1), (0, -1)]]
    + [{"t": "sphere", "s": [0.025], "c": "#ffffff", "p": [0, 0.18, 0], "glow": True}])
# tools
part("item.rake", {"rake": WOOD}, [{"t": "cyl", "s": [0.012, 0.012, 0.6], "c": "$c", "p": [0, 0.02, 0], "r": [1.5708, 0, 0], "seg": 6},
    {"t": "box", "s": [0.2, 0.02, 0.025], "c": IRON, "p": [0, 0.02, 0.3]}] + [{"t": "box", "s": [0.01, 0.01, 0.05], "c": IRON, "p": [-0.09 + i * 0.03, 0.02, 0.33]} for i in range(7)])
part("item.dibber", {"seed_dibber": WOOD}, [{"t": "cone", "s": [0.02, 0.18], "c": "$c", "p": [0, 0.02, 0.05], "r": [1.5708, 0, 0]},
    {"t": "box", "s": [0.1, 0.025, 0.025], "c": "$c:0.8", "p": [0, 0.02, -0.06]}])
part("item.spade", {"spade": WOOD}, [{"t": "cyl", "s": [0.013, 0.013, 0.5], "c": "$c", "p": [0, 0.02, -0.05], "r": [1.5708, 0, 0], "seg": 6},
    {"t": "box", "s": [0.12, 0.012, 0.15], "c": IRON, "p": [0, 0.015, 0.25]}, {"t": "box", "s": [0.1, 0.02, 0.02], "c": "$c", "p": [0, 0.02, -0.3]}])
part("item.wateringcan", {"watering_can": "#6a8a9a"}, [{"t": "cyl", "s": [0.07, 0.08, 0.13], "c": "$c", "p": [0, 0.065, 0], "seg": 10},
    {"t": "cyl", "s": [0.01, 0.018, 0.16], "c": "$c", "p": [0.1, 0.1, 0], "r": [0, 0, -0.9], "seg": 6}, {"t": "torus", "s": [0.045, 0.008], "c": "$c:0.8", "p": [-0.06, 0.12, 0], "r": [1.5708, 0, 1.5708]}])
# the old quest items' own models
part("item.scroll", {"edric_note": "#d8ccaa"}, [{"t": "cyl", "s": [0.025, 0.025, 0.18], "c": "$c", "p": [0, 0.025, 0], "r": [0, 0, 1.5708], "seg": 8},
    {"t": "box", "s": [0.14, 0.004, 0.1], "c": "$c:0.95", "p": [0, 0.004, 0.05]}, {"t": "cyl", "s": [0.028, 0.028, 0.012], "c": "#8a2a1a", "p": [0, 0.025, 0], "r": [0, 0, 1.5708], "seg": 8}])
part("item.inkpot", {"frost_ink": "#8fd0f0"}, [{"t": "cyl", "s": [0.05, 0.06, 0.07], "c": "#2a3040", "p": [0, 0.035, 0], "seg": 8},
    {"t": "cyl", "s": [0.042, 0.042, 0.01], "c": "$c", "p": [0, 0.071, 0], "seg": 8, "glow": True}, {"t": "cyl", "s": [0.004, 0.006, 0.2], "c": "#e8e8f0", "p": [0.02, 0.15, 0], "r": [0, 0, -0.35], "seg": 4},
    {"t": "box", "s": [0.03, 0.08, 0.004], "c": "#f0f0f8", "p": [0.06, 0.24, 0], "r": [0, 0, -0.35]}])
def tome(pid, iid, col, emblem):
    part(pid, {iid: col}, [{"t": "box", "s": [0.15, 0.04, 0.2], "c": "$c", "p": [0, 0.02, 0]}, {"t": "box", "s": [0.14, 0.03, 0.19], "c": "#e8e0c8", "p": [0.006, 0.02, 0]},
                            {"t": "box", "s": [0.15, 0.006, 0.2], "c": "$c", "p": [0, 0.04, 0]}, {"t": "box", "s": [0.02, 0.046, 0.2], "c": "$c:0.8", "p": [-0.075, 0.022, 0]}] + emblem)
tome("item.tome_echoes", "tome_echoes", "#5a3a7a", [{"t": "torus", "s": [0.04, 0.005], "c": "#d8c060", "p": [0, 0.044, 0], "r": [1.5708, 0, 0]}, {"t": "torus", "s": [0.022, 0.005], "c": "#d8c060", "p": [0, 0.044, 0], "r": [1.5708, 0, 0]}])
tome("item.tome_stones", "tome_stones", "#6a6458", [{"t": "box", "s": [0.025, 0.006, 0.04], "c": "#c8ccd8", "p": [x, 0.045, 0]} for x in [-0.035, 0, 0.035]])
tome("item.tome_far_road", "tome_far_road", "#2a4a6a", [{"t": "box", "s": [0.012, 0.006, 0.14], "c": "#d8c060", "p": [0, 0.045, 0], "r": [0, 0.5, 0]}, {"t": "sphere", "s": [0.012], "c": "#8fd0f0", "p": [0.03, 0.047, 0.05], "glow": True}])
part("item.fleece", {"wool": "#f3eee3"}, [{"t": "sphere", "s": [0.06], "c": "$c", "p": [x, 0.05, z]} for x, z in [(0, 0), (0.06, 0.02), (-0.05, 0.03), (0.02, -0.05), (-0.03, -0.04)]] + [{"t": "sphere", "s": [0.05], "c": "$c:0.95", "p": [0, 0.1, 0]}])
part("item.cowhide", {"cowhide": "#f0ece4"}, [{"t": "box", "s": [0.26, 0.012, 0.2], "c": "$c", "p": [0, 0.006, 0], "r": [0, 0.2, 0]},
    {"t": "box", "s": [0.08, 0.004, 0.06], "c": "#2a2420", "p": [0.04, 0.014, 0.02], "r": [0, 0.5, 0]}, {"t": "box", "s": [0.06, 0.004, 0.05], "c": "#2a2420", "p": [-0.07, 0.014, -0.04], "r": [0, -0.3, 0]},
    {"t": "box", "s": [0.24, 0.012, 0.18], "c": "$c:0.92", "p": [0.01, 0.018, 0.01], "r": [0.05, 0.25, 0]}])
part("item.chop", {"mutton_raw": "#d87a7a", "mutton_cooked": "#a8602a", "mutton_burnt": "#2c221c"}, [{"t": "sphere", "s": [0.07], "c": "$c", "p": [0, 0.035, 0], "k": [1.2, 0.5, 1]},
    {"t": "cyl", "s": [0.012, 0.012, 0.12], "c": "#f0e8d8", "p": [0.1, 0.035, 0], "r": [0, 0, 1.5708], "seg": 6}, {"t": "sphere", "s": [0.02], "c": "#f0e8d8", "p": [0.16, 0.035, 0]}])
part("item.steak", {"beef_raw": "#c84a4a", "beef_cooked": "#8a4a22", "beef_burnt": "#2c221c"}, [{"t": "box", "s": [0.16, 0.03, 0.11], "c": "$c", "p": [0, 0.015, 0], "r": [0, 0.3, 0]},
    {"t": "box", "s": [0.15, 0.006, 0.02], "c": "#f0e0d0", "p": [0, 0.031, 0.04], "r": [0, 0.3, 0]}])

# ---------------------------------------------------------------- quests (farming steps: the new goal, harvest)
QUESTS = {
    "first_furrows": {"name": "First Furrows", "giver": "tobin", "story": 2, "steps": [
        {"id": 1, "zone": "castle", "goal": {"harvest": "potato", "n": 3}, "reward": ["xp:farming:300", "onion_seed:3"],
         "talk": ["Time you got your hands dirty. A rake, a seed dibber and a spade - any general store has them, the castle's included.",
                  "There are farming patches all along the roads between here, Ashvale and Saltmere. Find one, rake the weeds off and plant potato seeds.",
                  "Water them if you've a can, wait a few blocks, then dig me up three potatoes."],
         "progress": ["Rake a patch, plant potato seeds, wait for them to grow, dig up three potatoes. The stores sell the seeds too."],
         "complete": ["Three potatoes, and dirt to the elbows. You'll make a farmer yet. Here - onion seeds, for your next row."]},
        {"id": 2, "zone": "castle", "goal": {"harvest": "onion", "n": 3}, "reward": "xp:farming:450",
         "talk": ["Onions next. They take a little longer and they make you cry when you cut them, which is how you know they're honest.",
                  "Plant those seeds I gave you and bring me news of three onions."],
         "progress": ["Grow and dig up three onions. Farming level 5 to plant them."],
         "complete": ["Three onions! The castle cook will have them before you can blink. You know your way round a patch now."]}],
        "done": ["Tobin nods at every farming patch you pass, as if they were old friends of his."]},
    "lodge_greens": {"name": "Greens for the Lodge", "giver": "orla", "after": "wolves_on_the_climb", "story": 1, "steps": [
        {"id": 1, "zone": "mt_lodge", "goal": {"harvest": "cabbage", "n": 4}, "reward": ["xp:farming:700", "xp:cooking:300"],
         "talk": ["The lodge's stew has been mostly water and optimism since the snows came. It needs greens.",
                  "Grow me four cabbages in one of the patches down by the roads. Farming 9 should do it."],
         "progress": ["Four cabbages, grown in a farming patch by the roads below."],
         "complete": ["Four fat cabbages. The stew will be a stew again. Sit down, have a bowl - you earned the first one."]}],
        "done": ["The lodge's stew is famous now. Orla says it was always famous; it just hadn't been told."]},
    "moonleaf_for_the_circle": {"name": "Moonleaf for the Circle", "giver": "halvard", "after": "archmage_trial", "story": 2, "steps": [
        {"id": 1, "zone": "mt_tower", "goal": {"harvest": "moonleaf", "n": 2}, "reward": ["xp:farming:1500", "xp:magic:500"],
         "talk": ["Frost ink is half summit cold and half moonleaf, and the goblins have left us short of both.",
                  "Moonleaf will only grow in the large farming patches - rare things, by the roads below. Farming 33, and patience.",
                  "Two leaves. Bring word when you have dug them up."],
         "progress": ["Grow two moonleaf in a large farming patch. The seeds come off strong beasts, now and then."],
         "complete": ["Two moonleaf, silver as the beacon. The Circle's ink will be blacker than ever, which is to say paler, which is how frost ink works."]}],
        "done": ["The Circle writes in moonleaf ink now. Halvard says you can taste the difference. Pell says not to."]},
}
GIVERS = {"tobin": ("zone.castle", "tools/castle/make_castle.js"), "orla": ("zone.mt_lodge", "tools/mountain/make_camps.js"), "halvard": ("zone.mt_tower", "tools/mountain/make_tower.js")}
SHOP_ADD = {"general": ["rake", "seed_dibber", "spade", "watering_can", "potato_seed", "onion_seed", "cabbage_seed"],
            "salt_general": ["rake", "seed_dibber", "spade", "watering_can", "potato_seed", "onion_seed", "cabbage_seed"],
            "castle_general": ["rake", "seed_dibber", "spade", "watering_can", "potato_seed", "onion_seed", "cabbage_seed"]}
RULES_KINDS = {"tool": ["rake", "dibber", "spade", "wateringcan"], "resource": ["seed", "herb", "grain"], "food": ["crop"]}
RULES_TOOLS = {"rake": "farming", "dibber": "farming", "spade": "farming", "wateringcan": "farming"}

if __name__ == '__main__':
    # items: the new ones, and the old quest items' examine lines and models
    patch = {}
    live_items = load(os.path.join(DD, 'items.json'))['data']; live_items = live_items.get('items', live_items)
    for k, (model, ex) in QUEST_EXAMINE.items():
        if k in live_items: patch[k] = dict({"examine": ex}, **({"model": model} if model else {}))
    for mod, key, new, whole in (("items", "items", ITEMS, True), ("items", "items", patch, False), ("quests", "quests", QUESTS, True)):
        ep = os.path.join(EX, mod + '.json'); ex = load(ep) if os.path.exists(ep) else {key: {}}
        if whole: ex.setdefault(key, {}).update(json.loads(json.dumps(new)))
        else: overlay(ex.setdefault(key, {}), json.loads(json.dumps(new)))
        with open(ep, 'w', encoding='utf-8') as f: json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp)
        if whole: live['data'][key].update(json.loads(json.dumps(new)))
        else: overlay(live['data'][key], json.loads(json.dumps(new)))
        with open(lp, 'w', encoding='utf-8') as f: json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
    # rules: the skill, kinds, tools, the farming table (live and extra)
    for rp in (os.path.join(DD, 'rules.json'), os.path.join(EX, 'rules.json')):
        R = load(rp); D = R['data'] if 'data' in R else R
        base = load(os.path.join(DD, 'rules.json'))['data']
        sk = list(D.get('skills') or base['skills']);
        if 'farming' not in sk: sk.append('farming')
        D['skills'] = sk
        it = D.setdefault('items', {}); cats = it.setdefault('categories', {})
        for c, kinds in RULES_KINDS.items():
            L = list(cats.get(c) or base['items']['categories'][c])
            for kd in kinds:
                if kd not in L: L.append(kd)
            cats[c] = L
        it.setdefault('tools', {}).update(RULES_TOOLS)
        D['farming'] = FARMING
        if rp.startswith(os.path.join(DD, 'rules')): json.dump(R, open(rp, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
        else:
            with open(rp, 'w', encoding='utf-8') as f: json.dump(R, f, indent=1, ensure_ascii=False); f.write('\n')
    # shops
    sp = os.path.join(DD, 'shops.json'); S = load(sp)
    for sid, add in SHOP_ADD.items():
        st = S['data']['shops'][sid]['stock']
        for i in add:
            if i not in st: st.append(i)
    json.dump(S, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    # tokens to inscribe
    ap = os.path.join(DD, 'assets.json'); A = load(ap)
    for k, v in ITEMS.items():
        A['data']['items'].setdefault(k, {"kind": "token", "name": "ASHVALE " + v['name'].upper(), "inscribe": "pending: issue the token, then add its propertyid"})
    json.dump(A, open(ap, 'w', encoding='utf-8'), ensure_ascii=False)
    # the givers take their new quests (the zone modules and the tools that make them)
    for npc, (zm, tool) in GIVERS.items():
        zp = os.path.join(DD, zm + '.json'); Z = load(zp)
        for n in Z['data']['npcs']:
            if n['id'] == npc:
                qs = n.setdefault('quests', [n['quest']] if n.get('quest') else [])
                for qid, Q in QUESTS.items():
                    if Q['giver'] == npc and qid not in qs: qs.append(qid)
        json.dump(Z, open(zp, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    # parts: the new models; the old quest items leave the shared models they borrowed
    moved = {k for k, (m, _) in QUEST_EXAMINE.items() if m}
    for pid, P in PARTS_NEW.items():
        json.dump(P, open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    for f in os.listdir(PARTS):
        if not f.endswith('.json') or f[:-5] in PARTS_NEW: continue
        pp = os.path.join(PARTS, f); txt = open(pp, encoding='utf-8').read(); P = json.loads(txt)
        its = P.get('items')
        if isinstance(its, dict) and moved & set(its):
            for k in moved & set(its): del its[k]
            pretty = '\n' in txt.strip()
            with open(pp, 'w', encoding='utf-8') as fh: json.dump(P, fh, indent=1 if pretty else None, separators=None if pretty else (',', ':'), ensure_ascii=False)
            print('  %s gives up %s' % (f, ', '.join(sorted(moved & set(P['items'].keys()) | (moved & set(its))))))
    print('farming: %d items, %d quests, %d models, %d crops' % (len(ITEMS), len(QUESTS), len(PARTS_NEW), len(CROPS)))
