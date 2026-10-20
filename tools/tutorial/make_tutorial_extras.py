#!/usr/bin/env python3
"""make_tutorial_extras.py - the tutorial island's people, quest and the little it needs (2026-10-19, the operator: "when i start as a player
i am not brought through a mandatory tutorial space referencing osrs tutorial island watered down").

A new character of Ashvale who signs in with a wallet starts on the island (rules.tutorial; src/core.js TUTORIAL), the quest begun, and cannot
leave until Ferryman Odo takes them to the village; guests skip it. The stations and their words are tools/tutorial/tutorial_steps.py (guide,
survival, farming, the quest journal, mining, combat, the bank chest, the wallet, the shop, the chapel, the ferry); each hands over what its
lesson needs (the step's kit).
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
sys.path.insert(0, HERE)
from tutorial_steps import G, S, F, C, X, NPCS, LOOKS_NEW, DOS, CLIENT_DOS, SHOP, quest   # noqa: E402 (the stations and their words)
QUEST = quest()
TUTORIAL['dos'] = DOS; TUTORIAL['clientDos'] = CLIENT_DOS
LOOKS = {
    G: {"outfit": {"skin": "#e0b890", "hair": "bun", "hairColor": "#8a5a2a", "shirt": {"style": "tunic", "color": "#3a6a8a"}, "pants": {"style": "skirt", "color": "#2a3a4a"}, "boots": "#3a2a1a", "belt": "#c8a040"}},
    S: {"build": "big", "gear": {"weapon": "hatchet"}, "outfit": {"skin": "#c89068", "hair": "short", "hairColor": "#3a2a1a", "beard": "full", "beardColor": "#3a2a1a", "shirt": {"style": "vest", "color": "#5a6a3a"}, "pants": {"style": "trousers", "color": "#4a3a2a"}, "boots": "#2a1a10", "belt": "#7a5a2a"}},
    F: {"outfit": {"skin": "#d8a878", "hair": "short", "hairColor": "#c8c8b8", "beard": "stubble", "beardColor": "#c8c8b8", "shirt": {"style": "tunic", "color": "#6a8a3a"}, "pants": {"style": "trousers", "color": "#5a4a2a"}, "boots": "#3a2a1a", "apron": "#8a6a3a", "hat": {"style": "cap", "color": "#a08a4a"}}},
    C: {"build": "big", "gear": {"weapon": "sword_t2", "shield": "shield_t2", "body": "chain_t2"}, "outfit": {"skin": "#b07850", "hair": "bald", "hairColor": "#6a6a6a", "beard": "stubble", "beardColor": "#9a9a9a", "pants": {"style": "trousers", "color": "#3a3a40"}, "boots": "#1a1a1a"}},
    X: {"outfit": {"skin": "#c8a080", "hair": "long", "hairColor": "#e8e8e8", "beard": "full", "beardColor": "#e8e8e8", "shirt": {"style": "tunic", "color": "#2a4a6a"}, "pants": {"style": "trousers", "color": "#2a2a30"}, "boots": "#2a1a10", "hat": {"style": "cap", "color": "#1a2a3a"}}},
}
LOOKS.update(LOOKS_NEW)
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
    sp = os.path.join(DD, 'shops.json'); SS = load(sp); SS['data']['shops'].update(SHOP); json.dump(SS, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)   # Milo's stall
    for nid, look in LOOKS.items():
        name = NPCS[nid][0]
        json.dump(dict({"ashvale3d": "part", "api": 1, "v": 1, "id": "char." + nid, "kind": "char", "role": "npc", "name": name, "body": "humanoid"}, **look),
                  open(os.path.join(PARTS, 'char.' + nid + '.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    json.dump(CROP_PART, open(os.path.join(PARTS, 'item.crop_radish.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    pp = os.path.join(PARTS, 'item.seedpouch.json'); P = load(pp); P['items']['radish_seed'] = '#d84a6a'; json.dump(P, open(pp, 'w', encoding='utf-8'), separators=(',', ':'))
    json.dump({k: {"name": v[0], "examine": v[1]} for k, v in NPCS.items()}, open(os.path.join(HERE, 'npcs.json'), 'w'), indent=1)
    print('tutorial: quest of %d steps, %d guides, radish, island rats' % (len(QUEST['tutorial_island']['steps']), len(NPCS)))
