#!/usr/bin/env python3
"""make_tutorial_extras.py - the tutorial island's people, quest and the little it needs (2026-10-19, the operator: "when i start as a player
i am not brought through a mandatory tutorial space referencing osrs tutorial island watered down").

A new character of Ashvale starts on the island (rules.tutorial; src/core.js TUTORIAL) and cannot leave until Ferryman Odo takes them to
the village. The lesson is a quest, Tutorial Island, from station to station: Guide Elsbeth (the controls), Survivalist Marlow (a fire,
then a shrimp caught and cooked on it), Gardener Fen (rake, plant and dig up a radish - a crop that grows in under a minute), Sergeant Kade
(two rats, with the sword he lends) and the ferryman. Each station hands over what its lesson needs (the step's kit).
Writes data/extra + the live modules (quests, monsters, items), rules.tutorial and rules.farming's radish, the guides' looks.
The zone itself: tools/tutorial/make_tutorial.js.
    python3 tools/tutorial/make_tutorial_extras.py      (then node tools/tutorial/make_tutorial.js; python3 build.py)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'castle'))
from make_castle_extras import overlay, load, DD, EX, PARTS   # noqa: E402

ISLAND = json.load(open(os.path.join(HERE, 'island.json')))
TUTORIAL = {"quest": "tutorial_island", "zone": "tutorial", "home": "ashvale", "spawn": [ISLAND["x"], ISLAND["y"] + 8],
            "note": "a new character of this home starts at spawn with the quest begun, and is brought back if they stray off the island before the quest is done; done, they wake at the home's own spawn (src/core.js TUTORIAL)"}
RADISH = {"lvl": 1, "tier": 1, "phases": 3, "blocks": 0.25, "yield": [2, 3], "xpPlant": 4, "xpHarvest": 4, "seed": "radish_seed", "crop": "radish",
          "leaf": "#4a8a34", "fruit": "#d84a6a"}
ITEMS = {
    "radish_seed": {"name": "Radish seed", "description": "Radish seeds (Farming 1). The quickest crop there is: ready in under a minute. Gardener Fen hands them out on the tutorial island.",
                    "examine": "Radish seeds (Farming 1). The quickest crop there is: ready in under a minute. Gardener Fen hands them out on the tutorial island.",
                    "collection": "ASHVALE Farming", "game": "ashvale", "category": "resource", "subcategory": "seed", "weight": 5, "model": "item.seedpouch", "value": 1, "attributes": [], "stackable": True},
    "radish": {"name": "Radish", "description": "A radish, red and peppery. Heals 1. Your first crop, probably.", "examine": "A radish, red and peppery. Heals 1. Your first crop, probably.",
               "collection": "ASHVALE Farming", "game": "ashvale", "category": "food", "subcategory": "crop", "weight": 100, "model": "item.crop_radish", "value": 2,
               "attributes": [{"trait_type": "Heal", "value": 1}]},
}
MONSTERS = {"tut_rat": {"name": "Island rat", "examine": "A fat island rat, used to being practised on. It has made its peace with this.", "level": 1, "hp": 4, "att": 1, "def": 1,
                        "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 20, "drops": [], "gold": 0, "anim": "bite", "look": "rat", "animal": True,
                        "ownDice": True, "roam": 3}}
G = "tut_guide"; S = "tut_survival"; F = "tut_farmer"; C = "tut_combat"; X = "tut_ferryman"
NPCS = {   # id: name, look, examine
    G: ("Guide Elsbeth", "An island guide with a whistle, a clipboard and the patience of someone who has explained walking a thousand times."),
    S: ("Survivalist Marlow", "Survivalist Marlow. He can light a fire with two wet sticks and a strong opinion."),
    F: ("Gardener Fen", "Gardener Fen, the island's gardener. There is soil under every fingernail and a radish in every pocket."),
    C: ("Sergeant Kade", "Sergeant Kade. Shouts like a drill sergeant, which he was, and smiles like a grandfather, which he is."),
    X: ("Ferryman Odo", "Ferryman Odo. He has rowed every new face in the valley to Ashvale, and remembers most of them."),
}
QUEST = {"tutorial_island": {"name": "Tutorial Island", "giver": G, "story": 1, "steps": [
    {"id": 1, "zone": "tutorial", "goal": {"talk": S}, "ends": S, "reward": "xp:dexterity:50",
     "talk": ["Welcome to the island! Everyone starts here. Click the ground to walk, double-click to run, and click a person to talk to them.",
              "Right-click anything for more choices. The buttons on the right open your pack, skills, quests and the rest - Quests will tell you what's next.",
              "First, go and see Survivalist Marlow by the trees to the west. He'll teach you to look after yourself."],
     "progress": ["Walk west to the trees and talk to Survivalist Marlow."],
     "complete": ["Elsbeth sent you? Good. Let's see if you can keep yourself fed and warm."]},
    {"id": 2, "zone": "tutorial", "goal": {"light": "*", "n": 1}, "ends": S, "kit": {"hatchet": 1, "tinderbox": 1}, "reward": ["xp:woodcutting:100", "xp:firemaking:100"],
     "talk": ["Here's a hatchet and a tinderbox. Click a tree to chop some logs, then use the tinderbox on them - right-click the logs in your pack.",
              "A fire keeps you warm and cooks your food. Light one, then come back to me."],
     "progress": ["Chop logs from a tree with the hatchet, light them with the tinderbox, then talk to Marlow."],
     "complete": ["A fire! A small one, but a fire. Everybody's first fire is small."]},
    {"id": 3, "zone": "tutorial", "goal": {"cook": "shrimp", "n": 1}, "ends": S, "kit": {"net": 1}, "reward": ["xp:fishing:100", "xp:cooking:100"],
     "talk": ["Now food. Take this net and catch a shrimp at the fishing spot on the shore - click the bubbling water.",
              "Then cook it on a fire: click the fire with the raw shrimp in your pack, or use the shrimp on the fire. Eat when you're hurt."],
     "progress": ["Net a shrimp at the shore's fishing spot, cook it on a fire, then talk to Marlow."],
     "complete": ["Cooked through, and only a little burnt. You'll live. Gardener Fen by the beds to the north has more for you."]},
    {"id": 4, "zone": "tutorial", "goal": {"harvest": "radish", "n": 2}, "ends": F, "kit": {"rake": 1, "seed_dibber": 1, "spade": 1, "radish_seed": 2}, "reward": "xp:farming:150",
     "talk": ["Gardener Fen's beds are just north. Take these to him - a rake, a seed dibber, a spade and two radish seeds. He'll show you how, I just carry the shovels.",
              "Farming patches are all along the roads in the valley. Each one can be yours: rake the weeds, plant, wait, dig up."],
     "progress": ["At the farming patch by Gardener Fen: rake the weeds, plant a radish seed, wait for it to grow, dig it up with the spade. Then talk to Fen."],
     "complete": ["Radishes! Grown with your own hands, in under a minute, which is cheating, but it's my island. Keep the tools; the valley's patches want them.",
                  "Sergeant Kade is past the rocks to the east. He's louder than me. Most things are."]},
    {"id": 5, "zone": "tutorial", "goal": {"kill": "tut_rat", "n": 2}, "ends": C, "kit": {"sword_t1": 1}, "reward": ["xp:attack:150", "xp:strength:150", "xp:defence:150"],
     "talk": ["Kade left this sword for you. Wield it from your pack, then go east and see him.",
              "The island rats over there are fair game. Click one to attack it; your Combat tab picks how you fight."],
     "progress": ["Wield the bronze sword, kill two island rats in the east, then talk to Sergeant Kade."],
     "complete": ["Two rats! The rats will talk about you. Watch your hitpoints out there - eat before the red orb runs low.",
                  "That's all I've got. Ferryman Odo at the pier will row you to Ashvale. Off you go, and keep the sword."]},
    {"id": 6, "zone": "tutorial", "goal": {"talk": X}, "ends": X, "reward": ["coins:25", "bread:2"],
     "talk": ["Go down to the pier in the south-east. Odo is waiting with the boat.", "Once you're in Ashvale, talk to Elder Maren by the well. She'll have work for you."],
     "progress": ["Talk to Ferryman Odo at the pier to sail to Ashvale."],
     "complete": ["All aboard. Ashvale's a fine place - watch the wolves, mind the road, and don't trust a goblin's smile.", "Hold on, here we go."]}],
    "done": ["You learned the ropes on Tutorial Island."]}}
LOOKS = {
    G: {"outfit": {"skin": "#e0b890", "hair": "bun", "hairColor": "#8a5a2a", "shirt": {"style": "tunic", "color": "#3a6a8a"}, "pants": {"style": "skirt", "color": "#2a3a4a"}, "boots": "#3a2a1a", "belt": "#c8a040"}},
    S: {"build": "big", "gear": {"weapon": "hatchet"}, "outfit": {"skin": "#c89068", "hair": "short", "hairColor": "#3a2a1a", "beard": "full", "beardColor": "#3a2a1a", "shirt": {"style": "vest", "color": "#5a6a3a"}, "pants": {"style": "trousers", "color": "#4a3a2a"}, "boots": "#2a1a10", "belt": "#7a5a2a"}},
    F: {"outfit": {"skin": "#d8a878", "hair": "short", "hairColor": "#c8c8b8", "beard": "stubble", "beardColor": "#c8c8b8", "shirt": {"style": "tunic", "color": "#6a8a3a"}, "pants": {"style": "trousers", "color": "#5a4a2a"}, "boots": "#3a2a1a", "apron": "#8a6a3a", "hat": {"style": "cap", "color": "#a08a4a"}}},
    C: {"build": "big", "gear": {"weapon": "sword_t2", "shield": "shield_t2", "body": "chain_t2"}, "outfit": {"skin": "#b07850", "hair": "bald", "hairColor": "#6a6a6a", "beard": "stubble", "beardColor": "#9a9a9a", "pants": {"style": "trousers", "color": "#3a3a40"}, "boots": "#1a1a1a"}},
    X: {"outfit": {"skin": "#c8a080", "hair": "long", "hairColor": "#e8e8e8", "beard": "full", "beardColor": "#e8e8e8", "shirt": {"style": "tunic", "color": "#2a4a6a"}, "pants": {"style": "trousers", "color": "#2a2a30"}, "boots": "#2a1a10", "hat": {"style": "cap", "color": "#1a2a3a"}}},
}
CROP_PART = {"ashvale3d": "part", "api": 1, "v": 1, "id": "item.crop_radish", "kind": "item", "items": {"radish": "#d84a6a"},
             "shapes": [{"t": "sphere", "s": [0.05], "c": "$c", "p": [0, 0.05, 0], "k": [1, 1.1, 1]}, {"t": "cone", "s": [0.015, 0.06], "c": "#f0e0e0", "p": [0, 0.0, 0], "r": [3.1416, 0, 0]},
                        {"t": "box", "s": [0.02, 0.09, 0.05], "c": "#4a8a34", "p": [0.01, 0.13, 0], "r": [0, 0, 0.3]}, {"t": "box", "s": [0.02, 0.08, 0.05], "c": "#5a9a3a", "p": [-0.01, 0.13, 0], "r": [0, 0, -0.3]}]}

if __name__ == '__main__':
    for mod, key, new in (("items", "items", ITEMS), ("monsters", "monsters", MONSTERS), ("quests", "quests", QUEST)):
        ep = os.path.join(EX, mod + '.json'); ex = load(ep) if os.path.exists(ep) else {key: {}}
        ex.setdefault(key, {}).update(json.loads(json.dumps(new)))
        with open(ep, 'w', encoding='utf-8') as f: json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp); live['data'][key].update(json.loads(json.dumps(new)))
        with open(lp, 'w', encoding='utf-8') as f: json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
    for rp, pretty in ((os.path.join(DD, 'rules.json'), False), (os.path.join(EX, 'rules.json'), True)):
        R = load(rp); D = R.get('data', R); D['tutorial'] = TUTORIAL
        base = load(os.path.join(DD, 'rules.json'))['data']
        fa = D.get('farming') or base.get('farming')
        if fa: fa = json.loads(json.dumps(fa)); fa['crops']['radish'] = RADISH; fa['seeds']['weights'].pop('radish', None); D['farming'] = fa
        with open(rp, 'w', encoding='utf-8') as f:
            json.dump(R, f, indent=1 if pretty else None, separators=None if pretty else (',', ':'), ensure_ascii=False)
            if pretty: f.write('\n')
    for nid, look in LOOKS.items():
        name = NPCS[nid][0]
        json.dump(dict({"ashvale3d": "part", "api": 1, "v": 1, "id": "char." + nid, "kind": "char", "role": "npc", "name": name, "body": "humanoid"}, **look),
                  open(os.path.join(PARTS, 'char.' + nid + '.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    json.dump(CROP_PART, open(os.path.join(PARTS, 'item.crop_radish.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    pp = os.path.join(PARTS, 'item.seedpouch.json'); P = load(pp); P['items']['radish_seed'] = '#d84a6a'; json.dump(P, open(pp, 'w', encoding='utf-8'), separators=(',', ':'))
    json.dump({k: {"name": v[0], "examine": v[1]} for k, v in NPCS.items()}, open(os.path.join(HERE, 'npcs.json'), 'w'), indent=1)
    print('tutorial: quest of %d steps, %d guides, radish, island rats' % (len(QUEST['tutorial_island']['steps']), len(NPCS)))
