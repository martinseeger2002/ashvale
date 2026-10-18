#!/usr/bin/env python3
"""make_tw_extras.py - the people, monsters, shops and quest of Thornwatch Camp, the Red Moor and the Hollow Den (2026-10-18, the operator:
an Ashvale rendition of a walled archers' camp on a moor and the den beneath it; the source game is never named in anything players see).

  Thornwatch Camp   a palisaded camp of the Thornwatch, an order of archer sisters driven out of their abbey; a bonfire in the middle,
                    the smith's forge against the back wall, the captain's pavilion, a peddler's wagon in the west corner, the healer by
                    the gate, one gate south over a plank bridge onto the moor
  The Red Moor      open moor south-east of the camp: quill rats, ashlings (small red imps that run when their pack breaks) and moor
                    walkers (the risen dead), broken fences and old foundations; the Hollow Den's mouth at its far edge
  The Hollow Den    one cave level of chambers and dead ends; every creature in it must die for Mother Isolde's quest, the last of them
                    Cinderhide, a burned walker that will not stay down
Den monsters have keys of their own (den_*), so a kill out on the moor never counts toward clearing the den (core.js counts kills by
key, not by zone). Writes data/extra/ (kept across tools/make_data.py reruns) and merges into the live data like
tools/mountain/make_mountain_extras.py; character parts go to data/parts/. Places and spawns: tools/thornwatch/make_thornwatch.js.
    python3 tools/thornwatch/make_tw_extras.py
"""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'castle'))
from make_castle_extras import overlay, load, DD, EX, PARTS   # noqa: E402 (the castle tool's merge, reused)

_imp_ai = {"kind": "humanoid", "faction": "ashling", "rally": 6, "leash": 10, "keep": [3, 5], "fleePct": 40}
_bolt = {"name": "Ember bolt", "range": 5, "att": 20, "attb": 16, "max": 5}
# Tuned for the avatar the operator plays (2026-10-18: "balanced for a level 200+ Ashvale avatar"): total level 200+, combat skills about 30,
# tier-3/4 gear. tools/thornwatch/fight_sim.js fights each one alone, without food, against that avatar; the targets are the game's
# own monsters at that tier: the moor about a crag wolf or a pass bandit (a quarter of your health each), the den's rank and file
# about a wraith, the brute about the swamp monster, and Cinderhide between the Spider Queen and the lich - a fight you eat through.
MONSTERS = {   # each with dice of its own (ownDice), as the mountain's are
    "quill_rat": {"name": "Quill rat", "level": 14, "hp": 26, "att": 12, "def": 10, "attb": 6, "defb": 6, "max": 3, "speed": 4, "aggro": 4, "respawn": 60,
                  "anim": "bite", "look": "rat", "animal": True, "roam": 4, "gold": 0, "ownDice": True,
                  "cast": {"name": "Quill spray", "range": 4, "att": 12, "attb": 8, "max": 3},
                  "drops": [{"item": "rat_meat_raw", "one_in": 1}, {"item": "rat_pelt", "one_in": 2}], "hint": "It rattles its back at you, then the quills come."},
    "ashling": {"name": "Ashling", "level": 16, "hp": 30, "att": 15, "def": 12, "attb": 8, "defb": 6, "max": 4, "speed": 4, "aggro": 5, "respawn": 70,
                "anim": "stab", "look": "ashling", "animal": False, "roam": 3, "gold": 12, "ownDice": True, "ai": _imp_ai,
                "drops": [{"item": "bones", "one_in": 1}, {"item": "dagger_t3", "one_in": 24}, {"item": "arrows_t2", "n": [4, 10], "one_in": 5}], "hint": "Brave in a crowd. Kill one and watch the rest."},
    "moor_walker": {"name": "Moor walker", "level": 18, "hp": 38, "att": 16, "def": 14, "attb": 10, "defb": 10, "max": 5, "speed": 5, "aggro": 4, "respawn": 90,
                    "anim": "slash", "look": "moor_walker", "animal": False, "roam": 2, "gold": 20, "ownDice": True,
                    "drops": [{"item": "bones", "one_in": 1}, {"item": "helmet_t3", "one_in": 30}], "hint": "Slow. Patient. Hits like a dropped sack of grain."},
    # den monsters softened 2026-10-18 (the operator: "Soften to about 2 trips"; tests/hollow_den_play_test.js: the target avatar
    # clears ~28 of 32 on one bag of potions and finishes on the second trip)
    "den_ashling": {"name": "Ashling", "level": 20, "hp": 32, "att": 13, "def": 14, "attb": 10, "defb": 8, "max": 3, "speed": 4, "aggro": 6, "respawn": 2000,
                    "anim": "stab", "look": "ashling", "animal": False, "roam": 2, "gold": 15, "ownDice": True, "ai": dict(_imp_ai, rally=3),
                    "drops": [{"item": "bones", "one_in": 1}, {"item": "dagger_t3", "one_in": 16}, {"item": "arrows_t3", "n": [3, 8], "one_in": 6}]},
    "den_shaman": {"name": "Ashling firecaller", "level": 24, "hp": 38, "att": 13, "def": 16, "attb": 12, "defb": 10, "max": 3, "speed": 4, "aggro": 7, "respawn": 2000,
                   "anim": "cast", "look": "ashling_shaman", "animal": False, "roam": 1, "gold": 30, "ownDice": True, "cast": dict(_bolt, att=15, max=3),
                   "ai": dict(_imp_ai, keep=[4, 5], fleePct=20, rally=3),
                   "drops": [{"item": "bones", "one_in": 1}, {"item": "staff_t3", "one_in": 10}, {"item": "prayer_potion", "one_in": 4}, {"item": "potion", "one_in": 3}],
                   "hint": "Kill the one with the bone mask first. The little ones fight harder while it lives."},
    "den_walker": {"name": "Moor walker", "level": 22, "hp": 46, "att": 14, "def": 17, "attb": 12, "defb": 10, "max": 3, "speed": 5, "aggro": 5, "respawn": 2000,
                   "anim": "slash", "look": "moor_walker", "animal": False, "roam": 1, "gold": 22, "ownDice": True,
                   "drops": [{"item": "bones", "one_in": 1}, {"item": "body_t3", "one_in": 24}, {"item": "legs_t3", "one_in": 24}]},
    "den_brute": {"name": "Den brute", "level": 28, "hp": 70, "att": 17, "def": 22, "attb": 16, "defb": 16, "max": 4, "speed": 5, "aggro": 5, "respawn": 2000,
                  "anim": "slash", "look": "den_brute", "animal": False, "roam": 1, "gold": 60, "ownDice": True,
                  "drops": [{"item": "bones", "one_in": 1}, {"item": "mace_t4", "one_in": 8}, {"item": "potion", "one_in": 2}], "hint": "All shoulders and no patience."},
    "cinderhide": {"name": "Cinderhide", "level": 34, "hp": 100, "att": 20, "def": 25, "attb": 20, "defb": 17, "max": 4, "speed": 5, "aggro": 7, "respawn": 2000,
                   "anim": "slash", "look": "cinderhide", "animal": False, "roam": 1, "gold": 200, "ownDice": True, "relentless": True, "hunter": True,
                   "drops": [{"item": "potion", "n": [2, 2], "one_in": 1}, {"item": "prayer_potion", "one_in": 1}, {"item": "sword_t4", "one_in": 3}, {"item": "shield_t4", "one_in": 4},
                             {"item": "body_t4", "one_in": 6}, {"item": "bones", "one_in": 1}],
                   "hint": "A walker that burned and kept walking. It is the reason the den is warm."},
}

PART_CHARS = {
    # the camp
    "char.isolde": {"role": "npc", "name": "Mother Isolde", "body": "humanoid", "build": "slim", "outfit": {"body": "female", "skin": "#d8b494", "hair": "long", "hairColor": "#c8c4d0", "shirt": {"style": "robe", "color": "#4a2a5e"}, "pants": {"style": "robe", "color": "#4a2a5e"}, "boots": "#2a1e2a", "belt": "#b89a4a", "hat": {"style": "hood", "color": "#3a2048"}}},
    "char.elin": {"role": "npc", "name": "Novice Elin", "body": "humanoid", "build": "slim", "outfit": {"body": "female", "skin": "#e0bc9a", "hair": "bun", "hairColor": "#7a4a2a", "shirt": {"style": "robe", "color": "#6a4a7a"}, "pants": {"style": "robe", "color": "#6a4a7a"}, "boots": "#3a2a2a", "belt": "#8a7a5a"}},
    "char.gwen": {"role": "npc", "name": "Gwen the smith", "body": "humanoid", "build": "big", "gear": {"weapon": "mace_t1"}, "outfit": {"body": "female", "skin": "#d4a07a", "hair": "ponytail", "hairColor": "#a8401e", "shirt": {"style": "vest", "color": "#5a3a22"}, "pants": {"style": "trousers", "color": "#3a2e26"}, "boots": "#2a1e16", "belt": "#2a1e16"}},
    "char.fennick": {"role": "npc", "name": "Fennick the peddler", "body": "humanoid", "build": "big", "outfit": {"skin": "#d8a882", "hair": "short", "hairColor": "#5a4a3a", "beard": "full", "beardColor": "#6a5a4a", "shirt": {"style": "tunic", "color": "#8a6a2a"}, "pants": {"style": "trousers", "color": "#4a3a2a"}, "boots": "#3a2a1a", "belt": "#5a3a1a", "hat": {"style": "cap", "color": "#5a2a2a"}}},
    "char.rhosyn": {"role": "npc", "name": "Captain Rhosyn", "body": "humanoid", "build": "normal", "gear": {"weapon": "bow_t2"}, "outfit": {"body": "female", "skin": "#e0b494", "hair": "braids", "hairColor": "#b8502a", "shirt": {"style": "tunic", "color": "#7a2a22"}, "pants": {"style": "trousers", "color": "#3a2a24"}, "boots": "#2a1a14", "belt": "#c8a040", "cape": "#5a1a18"}},
    "char.tavish": {"role": "npc", "name": "Tavish the caravan master", "body": "humanoid", "build": "normal", "gear": {"weapon": "sword_t1"}, "outfit": {"skin": "#c8946a", "hair": "short", "hairColor": "#b8b4ac", "beard": "full", "beardColor": "#c8c4bc", "shirt": {"style": "tunic", "color": "#3a4a5a"}, "pants": {"style": "trousers", "color": "#4a3e30"}, "boots": "#2a2018", "belt": "#6a4a2a", "hat": {"style": "cap", "color": "#4a3a2a"}}},
    "char.thorn_sentry": {"role": "npc", "name": "Thornwatch sentry", "body": "humanoid", "build": "slim", "gear": {"weapon": "bow_t1"}, "outfit": {"body": "female", "skin": "#d8aa84", "hair": "braids", "hairColor": "#3a2618", "shirt": {"style": "tunic", "color": "#6a2420"}, "pants": {"style": "trousers", "color": "#3a2a22"}, "boots": "#2a1a14", "belt": "#5a3a1a", "hat": {"style": "hood", "color": "#5a1e1a"}}},
    "char.thorn_sentry2": {"role": "npc", "name": "Thornwatch sentry", "body": "humanoid", "build": "normal", "gear": {"weapon": "bow_t1"}, "outfit": {"body": "female", "skin": "#c08a62", "hair": "bun", "hairColor": "#b8902a", "shirt": {"style": "tunic", "color": "#5a1e1a"}, "pants": {"style": "trousers", "color": "#2e2420"}, "boots": "#2a1a14", "belt": "#7a5a2a", "cape": "#3a1412"}},
    "char.briar": {"role": "npc", "name": "Scout Briar", "body": "humanoid", "build": "slim", "gear": {"weapon": "bow_t1"}, "outfit": {"body": "female", "skin": "#c89a72", "hair": "short", "hairColor": "#1a1410", "shirt": {"style": "tunic", "color": "#4a5a32"}, "pants": {"style": "trousers", "color": "#3a3424"}, "boots": "#2a2014", "belt": "#5a3a1a", "hat": {"style": "hood", "color": "#6a2420"}}},
    # the moor and the den
    "char.ashling": {"role": "monster", "name": "Ashling", "body": "humanoid", "build": "small", "gear": {"weapon": "dagger_t1"}, "outfit": {"skin": "#b0321e", "hair": "bald", "shirt": None, "pants": {"style": "shorts", "color": "#2a1a14"}, "boots": "#3a1410", "belt": "#2a1a14"}},
    "char.ashling_shaman": {"role": "monster", "name": "Ashling firecaller", "body": "humanoid", "build": "small", "gear": {"weapon": "staff_t1"}, "outfit": {"skin": "#c03a22", "hair": "bald", "hat": {"style": "bonewrap", "color": "#e2dac4"}, "shirt": {"style": "robe", "color": "#2a1416"}, "pants": {"style": "robe", "color": "#2a1416"}, "boots": "#1a0e0c", "belt": "#c8a040"}},
    "char.moor_walker": {"role": "monster", "name": "Moor walker", "body": "humanoid", "build": "normal", "outfit": {"skin": "#7e8a6c", "hair": "long", "hairColor": "#4a4a3e", "shirt": {"style": "shirt", "color": "#4a4434"}, "pants": {"style": "trousers", "color": "#3a362a"}, "boots": "#7e8a6c", "belt": "#2a2a22"}},
    "char.den_brute": {"role": "monster", "name": "Den brute", "body": "humanoid", "build": "big", "outfit": {"skin": "#6a5038", "hair": "long", "hairColor": "#2a1a10", "beard": "full", "beardColor": "#2a1a10", "shirt": None, "pants": {"style": "shorts", "color": "#3a2a1a"}, "boots": "#4a3424", "belt": "#2a1a10"}},
    "char.cinderhide": {"role": "monster", "name": "Cinderhide", "body": "humanoid", "build": "big", "gear": {"weapon": "longsword_t1"}, "outfit": {"skin": "#4e4a44", "hair": "bald", "shirt": None, "pants": {"style": "shorts", "color": "#1a1614"}, "boots": "#3a3632", "belt": "#c8501e", "cape": "#2a1a14"}},
}

SHOPS = {
    "thornwatch_forge": {"name": "Gwen's Forge", "keeper": "gwen", "stock": ["dagger_t3", "dagger_t4", "sword_t3", "sword_t4", "mace_t3", "mace_t4", "longsword_t3", "longsword_t4", "bow_t3", "bow_t4", "arrows_t3", "arrows_t4",
                         "shield_t3", "shield_t4", "helmet_t3", "helmet_t4", "body_t3", "body_t4", "legs_t3", "legs_t4"],
                         "buys": "any", "buyRate": 40, "sellRate": 100, "greet": "Mind the sparks. If it's bent I'll straighten it, if it's sharp I'll sell it."},
    "thornwatch_herbs": {"name": "The Sisters' Remedies", "keeper": "elin", "stock": ["potion", "prayer_potion", "antidote", "salmon", "lobster"],
                         "buys": "any", "buyRate": 40, "sellRate": 100, "greet": "Mother Isolde mixes them, I only count the jars. Two drops on the tongue, not the whole flask."},
    "thornwatch_peddler": {"name": "Fennick's Wagon", "keeper": "fennick", "stock": ["torch", "tinderbox", "arrows_t2", "arrows_t3", "pack_t2", "pack_t3", "salmon", "potion"],
                           "buys": "any", "buyRate": 35, "sellRate": 110, "greet": "Everything a hero needs and a few things a hero only thinks they need. Prices are fair. Fairly fair."},
}

QUESTS = {
    "hollow_den": {
        "name": "The Hollow Den", "giver": "isolde", "story": 1,
        "steps": [
            {"id": 1, "zone": "hollowden", "goal": {"kills": {"den_ashling": 18, "den_shaman": 3, "den_walker": 8, "den_brute": 2, "cinderhide": 1}, "n": 32},
             "reward": ["xp:attack:6000", "xp:defence:6000", "shield_t4", "thornwatch_stone"],
             "talk": ["Come in out of the wind, traveller. I am Isolde, and these walls of stakes are all that is left to the Thornwatch.",
                      "We kept the abbey on the ridge for three hundred years. Then something woke beneath it, and our own sisters turned their bows on us. We ran. Sisters do not run.",
                      "There is a cave on the Red Moor, past the old foundations, with skulls cut into the rocks at its mouth. The Hollow Den.",
                      "Whatever is calling the dead up out of the moor, it is gathering there. I can feel it when I close my eyes, like heat from a banked fire.",
                      "Go down and clear it. All of it, every last creature, or it will only fill again. Do that, and the Sisters will remember your name."],
             "progress": ["{left} still stir in the den, {name}. I can feel them. Search every chamber; they like the dead ends.",
                          "The little red ones run when their pack breaks. Let them go and they come back with friends. Kill the firecaller first.",
                          "Elin sells my potions by the gate. Take more than you think you need."],
             "complete": ["It's quiet. I felt it the moment the last of them fell: like a window opening in a stuffy room.",
                          "Cinderhide. So that was the heat. We buried him on the moor two winters ago; he didn't stay buried.",
                          "Take this shield with the Sisters' thanks; it hung in the abbey's chapel. And this stone: hold it and think of our fire, and the ring by the back wall will bring you home.",
                          "You fight like one of us. That is the highest praise I have."]},
        ],
        "done": ["The moor feels lighter since the den went quiet. The dead stay where we put them, mostly."]},
}

# the camp's town portal (2026-10-18: "there should be a town portal in the new camp"), where the source has its waypoint: by the
# back wall east of the captain's pavilion. A portal also makes the camp a town: die on the moor or in the den and you wake by it.
# and its stone, as every town has one (tests/core_test.js: one stone back to each town, earned, never sold): Mother Isolde gives it
# with The Hollow Den's reward
ITEMS = {"thornwatch_stone": {"name": "Thornwatch stone", "description": "Thornwatch stone, tool stone. Teleport thornwatch, Cooldown ticks 3000. Made in the valley of Ashvale.",
                              "collection": "ASHVALE Portal Stones", "game": "ashvale", "category": "tool", "subcategory": "stone", "weight": 200, "model": "item.stone",
                              "value": 0, "attributes": [{"trait_type": "Teleport", "value": "thornwatch"}, {"trait_type": "Cooldown ticks", "value": 3000}]}}
PORTALS = [{"id": "thornwatch", "name": "Thornwatch Camp", "x": 133, "y": 86, "to": [133, 85]}]

NPC_LINES = {
    "rhosyn": {"examine": "Captain Rhosyn of the Thornwatch, three arrows short of a full quiver and not about to say why.",
               "lines": ["We hold this camp because there is nowhere left to fall back to. That makes it simple.",
                         "The archery butts are for the novices. The real practice is on the moor, and the targets move.",
                         "If you see a sister on the moor with her bow drawn on you, do not wait to ask which side she's on. Not any more."]},
    "tavish": {"examine": "Tavish the caravan master, whose wagons have not rolled since the road east closed.",
               "lines": ["Three wagons, two horses, one road east, and that road's shut. So here I sit.",
                         "The Sisters feed us and we keep their stores dry. It's a fair trade. It's the only trade going.",
                         "When the road opens I'm leaving at a gallop, and you're welcome to ride along. Until then, there's the moor."]},
    "sentry": {"examine": "A Thornwatch sentry, watching the moor over the bridge.",
               "lines": ["Bridge is clear. For now.", "Ashlings were at the fence-line at dusk. They always come back.", "Keep to the trail and you'll see them before they see you."]},
    "briar": {"examine": "Scout Briar, who sleeps on the moor so the camp doesn't have to.",
              "lines": ["The den's mouth is just there, between the skull stones. You'll feel the heat before you see it.",
                        "I count them going in at dusk. More every night.", "If you go down, I'll know if you come back. I'll be right here."]},
}

if __name__ == '__main__':
    for mod, key, new in (("monsters", "monsters", MONSTERS), ("quests", "quests", QUESTS), ("shops", "shops", SHOPS), ("items", "items", ITEMS)):
        ep = os.path.join(EX, mod + '.json'); ex = load(ep) if os.path.exists(ep) else {key: {}}
        ex.setdefault(key, {}).update(new)
        with open(ep, 'w', encoding='utf-8') as f:
            json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp); overlay(live['data'], {key: new})
        with open(lp, 'w', encoding='utf-8') as f:
            json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
        print('%s: %d added or updated' % (mod, len(new)))
    for mod, new in (("rules", {"portals": PORTALS}),):   # a list of {id} merges by id (overlay)
        ep = os.path.join(EX, mod + '.json'); ex = load(ep) if os.path.exists(ep) else {}
        overlay(ex, new)
        with open(ep, 'w', encoding='utf-8') as f:
            json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp); overlay(live['data'], new)
        with open(lp, 'w', encoding='utf-8') as f:
            json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
        print('rules: portal thornwatch')
    for pid, body in PART_CHARS.items():
        with open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8') as f:
            json.dump(dict({"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": "char"}, **body), f, separators=(',', ':'), ensure_ascii=False)
    json.dump(NPC_LINES, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'npc_lines.json'), 'w'), indent=1)
    print('parts:', ', '.join(PART_CHARS))
