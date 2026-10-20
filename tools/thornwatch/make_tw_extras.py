#!/usr/bin/env python3
"""make_tw_extras.py - the people, monsters, shops and quest of Thornwatch Camp, the Red Moor and the Hollow Den (2026-10-18, the operator:
an Ashvale rendition of a walled archers' camp on a moor and the den beneath it; the source game is never named in anything players see).

  Thornwatch Camp   a palisaded camp of the Thornwatch, an order of archer sisters driven out of their abbey; a bonfire in the middle,
                    the smith's forge against the back wall, the captain's pavilion, a peddler's wagon in the west corner, the healer by
                    the gate, one gate south over a plank bridge onto the moor
  The Red Moor      open moor south-east of the camp: quill rats, ashlings (small red imps that run when their pack breaks) and moor
                    walkers (the risen dead), broken fences and old foundations; the Hollow Den's mouth at its far edge
  The Sisters' Barrow  the Thornwatch's iron-railed graveyard south of the moor, its dead risen; Sister Corva, the camp's best
                    archer turned, keeps the old tomb in the middle (Captain Rhosyn's quest, after the den)
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
                    "drops": [{"item": "town_portal_scroll", "one_in": 11}, {"item": "bones", "one_in": 1}, {"item": "dagger_t3", "one_in": 16}, {"item": "arrows_t3", "n": [3, 8], "one_in": 6}]},
    "den_shaman": {"name": "Ashling firecaller", "level": 24, "hp": 38, "att": 13, "def": 16, "attb": 12, "defb": 10, "max": 3, "speed": 4, "aggro": 7, "respawn": 2000,
                   "anim": "cast", "look": "ashling_shaman", "animal": False, "roam": 1, "gold": 30, "ownDice": True, "cast": dict(_bolt, att=15, max=3),
                   "ai": dict(_imp_ai, keep=[4, 5], fleePct=20, rally=3),
                   "drops": [{"item": "town_portal_scroll", "one_in": 11}, {"item": "bones", "one_in": 1}, {"item": "staff_t3", "one_in": 10}, {"item": "prayer_potion", "one_in": 4}, {"item": "potion", "one_in": 3}],
                   "hint": "Kill the one with the bone mask first. The little ones fight harder while it lives."},
    "den_walker": {"name": "Moor walker", "level": 22, "hp": 46, "att": 14, "def": 17, "attb": 12, "defb": 10, "max": 3, "speed": 5, "aggro": 5, "respawn": 2000,
                   "anim": "slash", "look": "moor_walker", "animal": False, "roam": 1, "gold": 22, "ownDice": True,
                   "drops": [{"item": "town_portal_scroll", "one_in": 11}, {"item": "bones", "one_in": 1}, {"item": "body_t3", "one_in": 24}, {"item": "legs_t3", "one_in": 24}]},
    "den_brute": {"name": "Den brute", "level": 28, "hp": 70, "att": 17, "def": 22, "attb": 16, "defb": 16, "max": 4, "speed": 5, "aggro": 5, "respawn": 2000,
                  "anim": "slash", "look": "den_brute", "animal": False, "roam": 1, "gold": 60, "ownDice": True,
                  "drops": [{"item": "town_portal_scroll", "one_in": 11}, {"item": "bones", "one_in": 1}, {"item": "mace_t4", "one_in": 8}, {"item": "potion", "one_in": 2}], "hint": "All shoulders and no patience."},
    "cinderhide": {"name": "Cinderhide", "level": 34, "hp": 100, "att": 20, "def": 25, "attb": 20, "defb": 17, "max": 4, "speed": 5, "aggro": 7, "respawn": 2000,
                   "anim": "slash", "look": "cinderhide", "animal": False, "roam": 1, "gold": 200, "ownDice": True, "relentless": True, "hunter": True,
                   "drops": [{"item": "town_portal_scroll", "one_in": 2}, {"item": "potion", "n": [2, 2], "one_in": 1}, {"item": "prayer_potion", "one_in": 1}, {"item": "sword_t4", "one_in": 3}, {"item": "shield_t4", "one_in": 4},
                             {"item": "body_t4", "one_in": 6}, {"item": "bones", "one_in": 1}],
                   "hint": "A walker that burned and kept walking. It is the reason the den is warm."},
    # The Sisters' Barrow (2026-10-18, the operator: "slightly harder than the last one. The quests need to be progressively harder"): the
    # graveyard south of the moor. Its dead rise slow and hit hard; Sister Corva keeps her distance with a full quiver, six of her
    # dead stand round her tomb, and when she is struck every risen corpse near her comes to her call (faction rally). Rhosyn asks
    # for twenty of the dead and Corva. tests/sisters_barrow_play_test.js: at the quest's recommended combat level (40: attack,
    # strength, defence 33) it plays like the den at its own (36): one or two trips, no deaths, ~22 potions; at the den's level it
    # takes ~37 potions where the den takes ~30. Corva alone costs more than Cinderhide (fight_sim.js).
    "risen_dead": {"name": "Risen dead", "level": 25, "hp": 64, "att": 23, "def": 18, "attb": 18, "defb": 10, "max": 5, "speed": 6, "aggro": 5, "respawn": 120,
                   "anim": "crush", "look": "barrow_dead", "animal": False, "roam": 2, "gold": 18, "ownDice": True,
                   "ai": {"kind": "humanoid", "faction": "barrow", "rally": 0, "leash": 9},
                   "drops": [{"item": "bones", "one_in": 1}, {"item": "helmet_t3", "one_in": 28}, {"item": "shield_t3", "one_in": 28}, {"item": "potion", "one_in": 9}],
                   "hint": "Slow to rise, slow to walk, and in no hurry to lie back down."},
    "corva": {"name": "Sister Corva", "level": 38, "hp": 150, "att": 27, "def": 26, "attb": 20, "defb": 18, "max": 7, "speed": 4, "aggro": 9, "respawn": 2000,
              "anim": "slash", "look": "corva", "animal": False, "roam": 3, "gold": 240, "ownDice": True, "hunter": True,
              "ai": {"kind": "humanoid", "faction": "barrow", "rally": 10, "leash": 12, "keep": [4, 6]},
              "drops": [{"item": "potion", "n": [2, 2], "one_in": 1}, {"item": "arrows_t4", "n": [10, 25], "one_in": 1}, {"item": "bow_t4", "one_in": 3}, {"item": "body_t4", "one_in": 5},
                        {"item": "legs_t4", "one_in": 5}, {"item": "bones", "one_in": 1}],
              "hint": "The best eye in the Thornwatch, once. Get close and stay close."},
    # The Caged Seer (2026-10-19, the operator: "add the rest of the chapters"): a step above the barrow, recommended combat 44 (attack,
    # strength, defence 37). The Gloamwood's packs and beasts, Gnarlbark and his ashlings (a trial of your own, called by touching the
    # hollow oak), Rakkas and his band at the Fivestones, and Emberfall's burning dead round Bregan the smith.
    # tests/caged_seer_play_test.js: two trips, no deaths, ~31 potions at 44 (the barrow ~26 at 40); ~44 at 40.
    "grove_ashling": {"name": "Grove ashling", "level": 27, "hp": 44, "att": 20, "def": 20, "attb": 14, "defb": 10, "max": 5, "speed": 4, "aggro": 6, "respawn": 90,
                      "anim": "stab", "look": "ashling", "animal": False, "roam": 3, "gold": 18, "ownDice": True, "ai": dict(_imp_ai, faction="grove"),
                      "drops": [{"item": "bones", "one_in": 1}, {"item": "arrows_t4", "n": [3, 8], "one_in": 6}, {"item": "dagger_t4", "one_in": 30}], "hint": "Moss-green and quicker than the moor's. Still runs when the pack breaks."},
    "thornback": {"name": "Thornback", "level": 28, "hp": 56, "att": 21, "def": 20, "attb": 12, "defb": 12, "max": 5, "speed": 4, "aggro": 5, "respawn": 90,
                  "anim": "bite", "look": "boar", "animal": True, "roam": 4, "gold": 0, "ownDice": True,
                  "cast": {"name": "Quill volley", "range": 4, "att": 18, "attb": 12, "max": 4},
                  "drops": [{"item": "boar_raw", "one_in": 1}, {"item": "boar_hide", "one_in": 2}], "hint": "A boar grown a back of quills. It shakes them loose at anything that stares."},
    "gloom_brute": {"name": "Gloom brute", "level": 31, "hp": 90, "att": 24, "def": 24, "attb": 18, "defb": 16, "max": 7, "speed": 5, "aggro": 5, "respawn": 120,
                    "anim": "crush", "look": "gloom_brute", "animal": False, "roam": 2, "gold": 40, "ownDice": True,
                    "drops": [{"item": "bones", "one_in": 1}, {"item": "mace_t4", "one_in": 12}, {"item": "potion", "one_in": 4}], "hint": "It sits so still in the shade you take it for a stump. Then the stump stands up."},
    "gnarlbark": {"name": "Gnarlbark", "level": 42, "hp": 180, "att": 29, "def": 30, "attb": 22, "defb": 20, "max": 8, "speed": 6, "aggro": 9, "respawn": 2000,
                  "anim": "crush", "look": "gnarlbark", "animal": False, "roam": 1, "gold": 260, "ownDice": True, "relentless": True, "hunter": True,
                  "drops": [{"item": "potion", "n": [2, 2], "one_in": 1}, {"item": "staff_t5", "one_in": 4}, {"item": "shield_t5", "one_in": 6}, {"item": "bones", "one_in": 1}],
                  "hint": "The oak's keeper, more root than man. Slow, and it does not stop."},
    "stone_ashling": {"name": "Ashling", "level": 28, "hp": 46, "att": 21, "def": 21, "attb": 14, "defb": 10, "max": 5, "speed": 4, "aggro": 6, "respawn": 90,
                      "anim": "stab", "look": "ashling", "animal": False, "roam": 2, "gold": 18, "ownDice": True, "ai": dict(_imp_ai, faction="rakkas"),
                      "drops": [{"item": "bones", "one_in": 1}, {"item": "arrows_t4", "n": [3, 8], "one_in": 6}, {"item": "potion", "one_in": 12}]},
    "field_walker": {"name": "Field walker", "level": 28, "hp": 72, "att": 24, "def": 19, "attb": 18, "defb": 10, "max": 5, "speed": 6, "aggro": 4, "respawn": 120,
                     "anim": "slash", "look": "moor_walker", "animal": False, "roam": 2, "gold": 22, "ownDice": True,
                     "drops": [{"item": "bones", "one_in": 1}, {"item": "legs_t4", "one_in": 40}, {"item": "potion", "one_in": 10}], "hint": "It walked here from the barrow, and it is in no hurry."},
    "rakkas": {"name": "Rakkas the Sparking", "level": 43, "hp": 170, "att": 29, "def": 29, "attb": 22, "defb": 20, "max": 8, "speed": 4, "aggro": 8, "respawn": 900,
               "anim": "stab", "look": "rakkas", "animal": False, "roam": 2, "gold": 300, "ownDice": True, "hunter": True,
               "cast": {"name": "Spark", "range": 4, "att": 26, "attb": 20, "max": 7},
               "ai": {"kind": "humanoid", "faction": "rakkas", "rally": 10, "leash": 12},
               "drops": [{"item": "potion", "n": [2, 2], "one_in": 1}, {"item": "sword_t5", "one_in": 5}, {"item": "helmet_t5", "one_in": 6}, {"item": "bones", "one_in": 1}],
               "hint": "An ashling chief who found the stones' lightning and kept a little for himself."},
    "cinder_dead": {"name": "Cinder dead", "level": 30, "hp": 76, "att": 25, "def": 21, "attb": 18, "defb": 12, "max": 6, "speed": 6, "aggro": 5, "respawn": 150,
                    "anim": "crush", "look": "cinder_dead", "animal": False, "roam": 2, "gold": 24, "ownDice": True,
                    "drops": [{"item": "bones", "one_in": 1}, {"item": "potion", "one_in": 8}, {"item": "body_t4", "one_in": 30}], "hint": "Emberfall's own people. They are still burning, and do not seem to mind."},
    "ember_ashling": {"name": "Ember ashling", "level": 29, "hp": 46, "att": 22, "def": 21, "attb": 14, "defb": 10, "max": 5, "speed": 4, "aggro": 6, "respawn": 90,
                      "anim": "stab", "look": "ashling", "animal": False, "roam": 3, "gold": 20, "ownDice": True, "ai": dict(_imp_ai, faction="emberfall"),
                      "drops": [{"item": "bones", "one_in": 1}, {"item": "town_portal_scroll", "one_in": 14}, {"item": "dagger_t4", "one_in": 30}]},
    "bregan": {"name": "Bregan the smith", "level": 46, "hp": 220, "att": 31, "def": 31, "attb": 24, "defb": 22, "max": 9, "speed": 6, "aggro": 8, "respawn": 2000,
                "anim": "crush", "look": "bregan", "animal": False, "roam": 1, "gold": 360, "ownDice": True, "relentless": True, "hunter": True,
                "drops": [{"item": "town_portal_scroll", "one_in": 2}, {"item": "potion", "n": [2, 2], "one_in": 1}, {"item": "mace_t5", "one_in": 3}, {"item": "body_t5", "one_in": 6}, {"item": "bones", "one_in": 1}],
                "hint": "Emberfall's smith. The fire took his house and left him his hammer."},
    # The Drowned Tower (2026-10-19, chapter 4): recommended combat 48 (attack, strength, defence 41). tests/drowned_tower_play_test.js:
    # two trips, no deaths, ~38 potions at 48 (The Caged Seer ~31 at 44); ~52 at 44. The Blackmere's drowned dead and
    # reed stalkers; in the tower's four cellar levels her shades, bone guards and blood maids; Countess Morwen at the bottom.
    "mire_dead": {"name": "Mire dead", "level": 32, "hp": 82, "att": 26, "def": 23, "attb": 20, "defb": 12, "max": 6, "speed": 6, "aggro": 5, "respawn": 120,
                  "anim": "crush", "look": "mire_dead", "animal": False, "roam": 2, "gold": 26, "ownDice": True,
                  "drops": [{"item": "bones", "one_in": 1}, {"item": "potion", "one_in": 8}, {"item": "legs_t4", "one_in": 30}], "hint": "The bog keeps what it takes. Sometimes it gives it back, walking."},
    "bog_stalker": {"name": "Bog stalker", "level": 33, "hp": 64, "att": 27, "def": 22, "attb": 16, "defb": 14, "max": 7, "speed": 3, "aggro": 6, "respawn": 100,
                    "anim": "bite", "look": "timber_wolf", "animal": True, "roam": 4, "gold": 0, "ownDice": True,
                    "drops": [{"item": "bones", "one_in": 1}], "hint": "Low and quick through the reeds. You hear it before you see it, if you are lucky."},
    "tower_shade": {"name": "Tower shade", "level": 34, "hp": 44, "att": 24, "def": 26, "attb": 20, "defb": 16, "max": 6, "speed": 4, "aggro": 6, "respawn": 2000,
                    "anim": "slash", "look": "tower_shade", "animal": False, "roam": 1, "gold": 30, "ownDice": True,
                    "drops": [{"item": "town_portal_scroll", "one_in": 12}, {"item": "prayer_potion", "one_in": 6}], "hint": "One of the village girls she drowned. It does not remember its name."},
    "bone_guard": {"name": "Bone guard", "level": 35, "hp": 68, "att": 24, "def": 29, "attb": 20, "defb": 20, "max": 6, "speed": 5, "aggro": 5, "respawn": 2000,
                   "anim": "slash", "look": "bone_guard", "animal": False, "roam": 1, "gold": 40, "ownDice": True,
                   "drops": [{"item": "bones", "one_in": 1}, {"item": "town_portal_scroll", "one_in": 12}, {"item": "shield_t4", "one_in": 20}, {"item": "potion", "one_in": 5}], "hint": "The tower's old guard. Death did not end their watch."},
    "blood_maid": {"name": "Blood maid", "level": 36, "hp": 60, "att": 25, "def": 26, "attb": 22, "defb": 16, "max": 6, "speed": 4, "aggro": 7, "respawn": 2000,
                   "anim": "stab", "look": "blood_maid", "animal": False, "roam": 1, "gold": 50, "ownDice": True,
                   "ai": {"kind": "humanoid", "faction": "morwen", "rally": 8, "leash": 10},
                   "drops": [{"item": "town_portal_scroll", "one_in": 10}, {"item": "potion", "one_in": 4}, {"item": "dagger_t5", "one_in": 30}], "hint": "She carries the Countess's basin. Do not ask what is in it."},
    "morwen": {"name": "Countess Morwen", "level": 50, "hp": 260, "att": 33, "def": 33, "attb": 26, "defb": 24, "max": 9, "speed": 5, "aggro": 9, "respawn": 2000,
               "anim": "slash", "look": "morwen", "animal": False, "roam": 2, "gold": 1500, "ownDice": True, "hunter": True,
               "cast": {"name": "Blood bolt", "range": 5, "att": 30, "attb": 22, "max": 9},
               "ai": {"kind": "humanoid", "faction": "morwen", "rally": 12, "leash": 14, "keep": [3, 5]},
               "drops": [{"item": "potion", "n": [3, 3], "one_in": 1}, {"item": "coins", "n": [800, 1600], "one_in": 1}, {"item": "staff_t5", "one_in": 5}, {"item": "legs_t5", "one_in": 5}, {"item": "bones", "one_in": 1}],
               "hint": "She bathed in the village to stay young. It worked, after a fashion."},
    # The Smith's Hammer (chapter 5, recommended combat 52: attack, strength, defence 45) and The Thorn Maiden (chapter 6, 58: 51):
    # the fallen abbey's sisters (bows: they carry arrows and keep their distance, as Corva does) and ghouls, Gorrath at the abbey
    # forge with Gwen's hammer; in the crypts the ghouls, sisters and thorn wraiths, and Maelis, Maiden of Thorns, whose thorns poison.
    # tests/abbey_play_test.js 6: two trips, no deaths, ~38 potions at 58; ~56 at 52.
    "abbey_ghoul": {"name": "Abbey ghoul", "level": 38, "hp": 92, "att": 32, "def": 28, "attb": 20, "defb": 18, "max": 8, "speed": 5, "aggro": 5, "respawn": 150,
                    "anim": "crush", "look": "abbey_ghoul", "animal": False, "roam": 2, "gold": 34, "ownDice": True,
                    "drops": [{"item": "bones", "one_in": 1}, {"item": "potion", "one_in": 6}, {"item": "body_t4", "one_in": 30}], "hint": "It was a lay brother once. Now it is mostly appetite."},
    "fallen_sister": {"name": "Fallen sister", "level": 39, "hp": 80, "att": 33, "def": 27, "attb": 22, "defb": 18, "max": 8, "speed": 4, "aggro": 8, "respawn": 150,
                      "anim": "slash", "look": "fallen_sister", "animal": False, "roam": 2, "gold": 40, "ownDice": True,
                      "ai": {"kind": "humanoid", "faction": "abbey", "rally": 6, "leash": 10, "keep": [4, 6]},
                      "drops": [{"item": "arrows_t4", "n": [6, 14], "one_in": 2}, {"item": "bow_t4", "one_in": 24}, {"item": "potion", "one_in": 6}], "hint": "A sister of the Thornwatch who stayed when the others ran. Her aim is as good as ever."},
    "gorrath": {"name": "Gorrath the forgekeeper", "level": 54, "hp": 320, "att": 37, "def": 35, "attb": 26, "defb": 24, "max": 11, "speed": 6, "aggro": 8, "respawn": 2000,
                "anim": "crush", "look": "gorrath", "animal": False, "roam": 1, "gold": 600, "ownDice": True, "relentless": True, "hunter": True,
                "drops": [{"item": "gwens_hammer", "one_in": 1}, {"item": "potion", "n": [2, 2], "one_in": 1}, {"item": "mace_t5", "one_in": 4}, {"item": "helmet_t5", "one_in": 6}, {"item": "bones", "one_in": 1}],
                "hint": "He kept the abbey forge for thirty years. He keeps it still, and he has taken a liking to Gwen's hammer."},
    "crypt_ghoul": {"name": "Crypt ghoul", "level": 42, "hp": 66, "att": 28, "def": 30, "attb": 22, "defb": 20, "max": 7, "speed": 5, "aggro": 5, "respawn": 2000,
                    "anim": "crush", "look": "abbey_ghoul", "animal": False, "roam": 1, "gold": 40, "ownDice": True,
                    "drops": [{"item": "bones", "one_in": 1}, {"item": "town_portal_scroll", "one_in": 10}, {"item": "potion", "one_in": 5}]},
    "crypt_sister": {"name": "Crypt sister", "level": 43, "hp": 58, "att": 28, "def": 29, "attb": 24, "defb": 20, "max": 8, "speed": 4, "aggro": 8, "respawn": 2000,
                     "anim": "slash", "look": "fallen_sister", "animal": False, "roam": 1, "gold": 46, "ownDice": True,
                     "ai": {"kind": "humanoid", "faction": "maelis", "rally": 6, "leash": 10, "keep": [4, 6]},
                     "drops": [{"item": "arrows_t5", "n": [4, 10], "one_in": 3}, {"item": "town_portal_scroll", "one_in": 10}, {"item": "potion", "one_in": 5}]},
    "thorn_wraith": {"name": "Thorn wraith", "level": 44, "hp": 56, "att": 28, "def": 30, "attb": 24, "defb": 20, "max": 7, "speed": 4, "aggro": 7, "respawn": 2000,
                     "anim": "slash", "look": "thorn_wraith", "animal": False, "roam": 1, "gold": 44, "ownDice": True,
                     "venom": {"chance": 15, "ticks": 20, "dmg": 1}, "ai": {"kind": "humanoid", "faction": "maelis", "rally": 8, "leash": 10},
                     "drops": [{"item": "town_portal_scroll", "one_in": 10}, {"item": "antidote", "one_in": 4}, {"item": "potion", "one_in": 5}], "hint": "A sister the thorns grew through. They are still growing."},
    "maelis": {"name": "Maelis, Maiden of Thorns", "level": 60, "hp": 360, "att": 38, "def": 38, "attb": 30, "defb": 28, "max": 11, "speed": 5, "aggro": 10, "respawn": 2000,
               "anim": "slash", "look": "maelis", "animal": False, "roam": 2, "gold": 3000, "ownDice": True, "hunter": True, "relentless": True,
               "venom": {"chance": 35, "ticks": 40, "dmg": 3}, "cast": {"name": "Thorn spray", "range": 5, "att": 34, "attb": 26, "max": 10},
               "ai": {"kind": "humanoid", "faction": "maelis", "rally": 14, "leash": 16},
               "drops": [{"item": "potion", "n": [3, 3], "one_in": 1}, {"item": "coins", "n": [2000, 4000], "one_in": 1}, {"item": "longsword_t5", "one_in": 4}, {"item": "body_t5", "one_in": 4}, {"item": "shield_t5", "one_in": 4}, {"item": "bones", "one_in": 1}],
               "hint": "What woke under the abbey. The thorns are hers, and so, now, are the sisters."},
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
    "char.barrow_dead": {"role": "monster", "name": "Risen dead", "body": "humanoid", "build": "normal", "outfit": {"skin": "#8e9682", "hair": "bald", "shirt": {"style": "robe", "color": "#b8b09a"}, "pants": {"style": "robe", "color": "#a8a08a"}, "boots": "#6e7462", "belt": "#5a5444"}},
    "char.corva": {"role": "monster", "name": "Sister Corva", "body": "humanoid", "build": "slim", "gear": {"weapon": "bow_t2"}, "outfit": {"body": "female", "skin": "#c9c2bc", "hair": "long", "hairColor": "#141012", "shirt": {"style": "tunic", "color": "#3a1418"}, "pants": {"style": "trousers", "color": "#1e1416"}, "boots": "#141012", "belt": "#5a1a18", "hat": {"style": "hood", "color": "#1e1214"}, "cape": "#2a0e10"}},
    # The Caged Seer
    "char.hollin": {"role": "npc", "name": "Old Hollin", "body": "humanoid", "build": "slim", "outfit": {"skin": "#d8b496", "hair": "long", "hairColor": "#e4e0d8", "beard": "full", "beardColor": "#ece8e0", "shirt": {"style": "robe", "color": "#2e3e6a"}, "pants": {"style": "robe", "color": "#2e3e6a"}, "boots": "#2a2420", "belt": "#8a6a3a", "hat": {"style": "cap", "color": "#24304e"}}},
    "char.hollin_caged": {"role": "npc", "name": "Old Hollin", "body": "humanoid", "build": "slim", "outfit": {"skin": "#c8a486", "hair": "long", "hairColor": "#b8b4ac", "beard": "full", "beardColor": "#c0bcb4", "shirt": {"style": "robe", "color": "#2a2e3a"}, "pants": {"style": "robe", "color": "#2a2e3a"}, "boots": "#1e1a18", "belt": "#4a3a2a"}},   # a month in the cage: soot, no hat
    "char.rakkas": {"role": "monster", "name": "Rakkas the Sparking", "body": "humanoid", "build": "small", "gear": {"weapon": "sword_t1"}, "outfit": {"skin": "#c8401e", "hair": "bald", "hat": {"style": "bonewrap", "color": "#e8d040"}, "shirt": {"style": "vest", "color": "#e8c030"}, "pants": {"style": "shorts", "color": "#2a1a14"}, "boots": "#3a1410", "belt": "#e8d040", "cape": "#e8b020"}},
    "char.gnarlbark": {"role": "monster", "name": "Gnarlbark", "body": "humanoid", "build": "big", "outfit": {"skin": "#5a4630", "hair": "long", "hairColor": "#3e5a2a", "beard": "full", "beardColor": "#4a6a30", "shirt": None, "pants": {"style": "shorts", "color": "#3a2e20"}, "boots": "#4a3a28", "belt": "#2e4a24"}},
    "char.gloom_brute": {"role": "monster", "name": "Gloom brute", "body": "humanoid", "build": "big", "outfit": {"skin": "#3e4048", "hair": "long", "hairColor": "#1a1a20", "beard": "full", "beardColor": "#1a1a20", "shirt": None, "pants": {"style": "shorts", "color": "#26262c"}, "boots": "#3e4048", "belt": "#1a1a20"}},
    "char.cinder_dead": {"role": "monster", "name": "Cinder dead", "body": "humanoid", "build": "normal", "outfit": {"skin": "#3a302a", "hair": "bald", "shirt": {"style": "shirt", "color": "#2a2420"}, "pants": {"style": "trousers", "color": "#241e1a"}, "boots": "#3a302a", "belt": "#e0602a"}},
    "char.bregan": {"role": "monster", "name": "Bregan the smith", "body": "humanoid", "build": "big", "gear": {"weapon": "mace_t1"}, "outfit": {"skin": "#4a3a30", "hair": "bald", "beard": "full", "beardColor": "#2a1e18", "shirt": {"style": "vest", "color": "#3a2a1e"}, "pants": {"style": "trousers", "color": "#2a201a"}, "boots": "#1e1814", "belt": "#e0602a"}},
    # The Drowned Tower
    "char.mire_dead": {"role": "monster", "name": "Mire dead", "body": "humanoid", "build": "normal", "outfit": {"skin": "#5e6a52", "hair": "long", "hairColor": "#2e3a26", "shirt": {"style": "shirt", "color": "#3a4232"}, "pants": {"style": "trousers", "color": "#2e3426"}, "boots": "#2a2e22", "belt": "#4a5a2a"}},
    "char.tower_shade": {"role": "monster", "name": "Tower shade", "body": "humanoid", "build": "slim", "outfit": {"body": "female", "skin": "#b8c8d8", "hair": "long", "hairColor": "#8a9aac", "shirt": {"style": "robe", "color": "#c8d4e0"}, "pants": {"style": "robe", "color": "#b8c4d0"}, "boots": "#b8c8d8", "belt": "#8a9aac"}},
    "char.bone_guard": {"role": "monster", "name": "Bone guard", "body": "humanoid", "build": "normal", "gear": {"weapon": "sword_t1"}, "outfit": {"skin": "#e2dac4", "hair": "bald", "shirt": {"style": "vest", "color": "#5a5a5e"}, "pants": {"style": "shorts", "color": "#3a3a3e"}, "boots": "#e2dac4", "belt": "#2a2a2e", "hat": {"style": "cap", "color": "#6a6a6e"}}},
    "char.blood_maid": {"role": "monster", "name": "Blood maid", "body": "humanoid", "build": "slim", "gear": {"weapon": "dagger_t1"}, "outfit": {"body": "female", "skin": "#d8c0b4", "hair": "bun", "hairColor": "#2a1414", "shirt": {"style": "robe", "color": "#6a1a1e"}, "pants": {"style": "robe", "color": "#5a1418"}, "boots": "#1e0e10", "belt": "#d8c0b4"}},
    "char.morwen": {"role": "monster", "name": "Countess Morwen", "body": "humanoid", "build": "slim", "gear": {"weapon": "staff_t1"}, "outfit": {"body": "female", "skin": "#f0dcd0", "hair": "long", "hairColor": "#8a1418", "shirt": {"style": "robe", "color": "#2a0a10"}, "pants": {"style": "robe", "color": "#2a0a10"}, "boots": "#140608", "belt": "#c8a040", "cape": "#7a0e16"}},
    # the abbey and its crypts
    "char.abbey_ghoul": {"role": "monster", "name": "Abbey ghoul", "body": "humanoid", "build": "normal", "outfit": {"skin": "#8a9480", "hair": "bald", "shirt": {"style": "robe", "color": "#5a4a3a"}, "pants": {"style": "robe", "color": "#4a3a2e"}, "boots": "#8a9480", "belt": "#2a2420"}},
    "char.fallen_sister": {"role": "monster", "name": "Fallen sister", "body": "humanoid", "build": "slim", "gear": {"weapon": "bow_t2"}, "outfit": {"body": "female", "skin": "#c8b8b0", "hair": "braids", "hairColor": "#2a1a14", "shirt": {"style": "tunic", "color": "#3a1418"}, "pants": {"style": "trousers", "color": "#241416"}, "boots": "#141012", "belt": "#5a1a18", "hat": {"style": "hood", "color": "#2a0e12"}}},
    "char.gorrath": {"role": "monster", "name": "Gorrath the forgekeeper", "body": "humanoid", "build": "big", "gear": {"weapon": "mace_t1"}, "outfit": {"skin": "#7a6a5a", "hair": "bald", "beard": "full", "beardColor": "#3a2a1e", "shirt": {"style": "vest", "color": "#4a2a1a"}, "pants": {"style": "trousers", "color": "#2a1e16"}, "boots": "#1e1814", "belt": "#c8a040"}},
    "char.thorn_wraith": {"role": "monster", "name": "Thorn wraith", "body": "humanoid", "build": "slim", "outfit": {"body": "female", "skin": "#6a7a52", "hair": "long", "hairColor": "#2a3a1a", "shirt": {"style": "robe", "color": "#3a4a2a"}, "pants": {"style": "robe", "color": "#2e3a22"}, "boots": "#2a3a1a", "belt": "#7a1a1e"}},
    "char.maelis": {"role": "monster", "name": "Maelis, Maiden of Thorns", "body": "humanoid", "build": "normal", "gear": {"weapon": "longsword_t1"}, "outfit": {"body": "female", "skin": "#d8c8c0", "hair": "long", "hairColor": "#1a2a12", "shirt": {"style": "robe", "color": "#1e3a16"}, "pants": {"style": "robe", "color": "#16300e"}, "boots": "#0e1a0a", "belt": "#a01a24", "cape": "#4a0e14", "hat": {"style": "hood", "color": "#1a2e12"}}},
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
        "name": "The Hollow Den", "giver": "isolde", "story": 1, "combat": 36,   # the avatar the den is tuned for (attack/strength/defence 30)
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
    "sisters_barrow": {
        "name": "The Sisters' Barrow", "giver": "rhosyn", "story": 2, "after": "hollow_den", "combat": 40,
        "steps": [
            {"id": 1, "zone": "sistersbarrow", "goal": {"kills": {"risen_dead": 20, "corva": 1}, "n": 21}, "at": [263, 178], "mark": "The Sisters' Barrow",
             "reward": ["xp:ranged:12000", "bow_t4", "arrows_t4:60"],
             "talk": ["So Isolde's den is quiet. Good. Then you can stand to hear the rest of it.",
                      "South of the moor, past the last of the fences, is the barrow where the Thornwatch buries its own. A week ago I sent Corva out to bury the sisters we lost on the road. Best eye in the camp.",
                      "She came back at dusk with a quiver full of black arrows and put two of them through the sentry on the bridge. She never said a word.",
                      "Now the barrow's dead are up out of their graves, and she walks among them like a shepherd with her flock. Whatever woke under the abbey has her.",
                      "Lay a dozen of the dead back down, so the barrow can hold its own again, and then put Corva down. Cleanly. She was my sister. Do it, and the Thornwatch will teach you to shoot like one of us. Cross the moor south; the iron gate stands open."],
             "progress": ["{left} still walk in the barrow, {name}. A dozen of the dead, and Corva.",
                          "Corva is still out there, {name}. Close the distance; she will not let you stand off and trade arrows with her.",
                          "Strike her and every corpse near her comes running. Thin out the graves first, or fight with your back to the railing.",
                          "Elin has potions by the gate. You will want them."],
             "complete": ["It's done, then. I thought I would feel something. Maybe later.",
                          "Here: a shortbow of the sisters' yew, and arrows to go with it. Hold it like this. No, lower. You'll learn.",
                          "The Thornwatch will remember who gave Corva her rest."]},
        ],
        "done": ["The barrow is quiet. Some nights I walk out and sit by her grave. The dead don't trouble me there any more."]},
    "caged_seer": {
        "name": "The Caged Seer", "giver": "isolde", "story": 3, "after": "sisters_barrow", "combat": 44,
        "steps": [
            {"id": 1, "zone": "gloamwood", "goal": {"flag": "seer_scroll"}, "at": [288, 384], "mark": "The hollow oak",
             "reward": ["xp:prayer:3000"],
             "talk": ["The barrow is quiet, and Rhosyn sleeps again. Thank you for that. Now I need you further south than any of us have dared.",
                      "There was a man named Hollin, the last of the old seers. He lived in Emberfall, a hamlet past the woods. When the abbey fell he sent us word, and then nothing.",
                      "Hollin would have known what woke under the abbey. If he is alive, we need him.",
                      "Emberfall cannot be reached by any road now. But the seers kept a way: five old stones in the field below the barrow, and a scroll that wakes them.",
                      "The scroll was hidden in the hollow oak, deep in the Gloamwood, past the stone field. Bring it to me. Whatever keeps the oak will not give it up kindly."],
             "progress": ["The hollow oak stands at the far end of the Gloamwood, {name}, past the stone field and down the old path.",
                          "Reach into the hollow. Be ready when the tree answers.",
                          "Elin has potions by the gate. The wood eats the careless."],
             "complete": ["Let me see it. Bark-paper, red thread. Hollin's own knot.",
                          "Five stones, five beasts cut in them, and the order to wake them: the Hawk first, then the Hound, then the Hart, then the Hare, and the Heron last.",
                          "Wake them in that order and they will open a way to Emberfall. Touch the wrong one and it will only stay cold."]},
            {"id": 2, "zone": "emberfall", "goal": {"kills": {"rakkas": 1, "bregan": 1}, "n": 2}, "ends": "hollin_caged", "at": [268, 280], "mark": "The Fivestones",
             "reward": ["flag:seer_freed"],
             "talk": ["An ashling chief has taken the stones for his own. Rakkas, the scouts call him; he spits lightning. He will not let you near them while he lives.",
                      "Hawk, Hound, Hart, Hare, Heron. Then step through, find Hollin, and bring him home."],
             "progress": ["Rakkas keeps the stones and Bregan keeps the cage, {name}. Both must fall before the old man walks free.",
                          "Hawk, Hound, Hart, Hare, Heron. The ring in the middle opens when the last one wakes."],
             "complete": ["You're not one of them. You're real. Oh, thank the stars.",
                          "Bregan had the key. He was our smith; I watched him try to put the fire out with his hands. It got into him instead.",
                          "There. Help me down. My legs have forgotten what they are for."]},
            {"id": 3, "zone": "thornwatch", "goal": {"talk": "isolde"}, "at": [125, 75], "mark": "Thornwatch Camp",
             "reward": ["xp:attack:10000", "xp:strength:10000", "xp:defence:10000", "helmet_t5"],
             "talk": ["I know the way to your camp; the stones will take me. Go ahead and tell Isolde that Hollin is coming. Slowly, but coming.",
                      "And tell her the abbey's bells rang the night it fell. I heard them from here. Bells do not ring themselves."],
             "progress": ["Hollin has gone ahead to the camp, {name}. Speak to Mother Isolde."],
             "complete": ["Hollin is by the fire, eating as if he has not eaten in a month, which he hasn't. You brought him out of the fire.",
                          "Take this helm. It was made in the abbey's forge, before the abbey fell. It suits you better than it suited the wall it hung on.",
                          "He says he knows what woke under the abbey. He wants to speak to you himself."]},
        ],
        "done": ["Hollin talks to the fire more than to us. Go and sit with him, {name}. He has more to tell."]},
    "drowned_tower": {
        "name": "The Drowned Tower", "giver": "hollin", "story": 4, "after": "caged_seer", "combat": 48,
        "steps": [
            {"id": 1, "zone": "towercellars", "goal": {"kills": {"morwen": 1}, "n": 1}, "at": [366, 452], "mark": "The drowned tower",
             "reward": ["coins:5000", "xp:attack:14000", "xp:strength:14000", "xp:defence:14000"],
             "talk": ["Sit a moment. I have been reading the stones' old book while you were gone, and it tells of the Blackmere, past the Gloamwood.",
                      "There was a village in that bog once, and a tower over it. The lady of the tower was Morwen, a countess, and she was afraid of growing old.",
                      "The book says she bathed in what she took from the village girls, and the bog rose and drowned it all. Her and the tower with it.",
                      "She is down there still, at the bottom of the cellars, and whatever woke under the abbey has woken her too. She sits on a hoard the size of a hayrick.",
                      "Go through the Gloamwood past the oak and out its far side into the bog. The tower's stair goes down four levels. Bring her down, and the hoard is yours."],
             "progress": ["Morwen is at the bottom of the tower, {name}. Four levels down.",
                          "Her maids come running when she calls. Fight them in a doorway if you can.",
                          "Take Mother Isolde's potions. The bog is no place to run short."],
             "complete": ["You're back, and you smell of the bog. So it is done.",
                          "Keep the gold; she will not miss it. And take this from me, for what it is worth: you are the first in three hundred years to come up out of that tower.",
                          "There is more in the book. Gwen has been asking after you too; something about her hammer."]},
        ],
        "done": ["The Blackmere is only a bog again. Let it be."]},
    "smiths_hammer": {
        "name": "The Smith's Hammer", "giver": "rhosyn", "story": 5, "after": "drowned_tower", "combat": 52,
        "steps": [
            {"id": 1, "zone": "abbey", "goal": {"bring": "gwens_hammer", "n": 1}, "at": [360, 556], "mark": "The abbey barracks",
             "reward": ["longsword_t5", "abbey_stone", "xp:attack:18000", "xp:strength:18000", "xp:defence:18000"],
             "talk": ["A word, before Gwen sees us talking. She will never ask you herself; she is too proud, and it is her own fault.",
                      "When we ran from the abbey she left her hammer on the anvil. Her master's hammer, and his master's. She has worked with borrowed tools ever since, and it shows.",
                      "The abbey is south of the Blackmere: follow the way out of the bog past the tower. Our old forgekeeper, Gorrath, kept the barracks forge. He turned with the rest.",
                      "Scouts say he is still at the anvil, hammering at nothing, day and night. With her hammer.",
                      "Bring it back to me and I will see it gets to her. And mind the sisters on the walls; they have not forgotten how to shoot."],
             "progress": ["The barracks are against the abbey's west wall, {name}. Gorrath is at the forge.",
                          "Bring me Gwen's hammer. He will not give it up while he can stand.",
                          "The sisters keep their distance and shoot. Close in, or fight them round a corner."],
             "complete": ["That's it. That's the hammer. Gwen! Gwen, come here.",
                          "...She will not say anything, but look at her face. She has been at the anvil since you walked in.",
                          "There. A longsword, out of the abbey's own steel, with her own hammer. And the stone to the abbey's portal stand in the yard: hold it and you can come and go.",
                          "One more thing is left, {name}. Mother Isolde wants you. It is about what lies under the abbey."]},
        ],
        "done": ["Gwen sings at the anvil now. Badly. Nobody minds."]},
    "thorn_maiden": {
        "name": "The Thorn Maiden", "giver": "isolde", "story": 5, "after": "smiths_hammer", "combat": 58,
        "steps": [
            {"id": 1, "zone": "crypts", "goal": {"kills": {"maelis": 1}, "n": 1}, "at": [412, 582], "mark": "The crypt stair",
             "reward": ["body_t5", "legs_t5", "shield_t5", "xp:attack:25000", "xp:strength:25000", "xp:defence:25000", "xp:hitpoints:20000", "flag:maiden_slain"],
             "talk": ["Hollin has told me what woke under the abbey, and I believe him, because I have felt it every night since we ran.",
                      "Her name is Maelis. The Maiden of Thorns. She was a sister of ours once, three hundred years ago, buried in the crypts with a thorn through her heart for what she did.",
                      "Someone pulled the thorn. Now her thorns are in our sisters, and they do what she wants.",
                      "The crypt stair is behind the altar in the cathedral. Four levels down she waits. Her thorns are poisoned; carry antidotes, and Elin's potions, as many as you can.",
                      "Put her back in the ground, {name}, and the Thornwatch can go home."],
             "progress": ["Maelis is at the bottom of the crypts, {name}. Four levels under the cathedral.",
                          "Her thorns poison. Elin sells antidotes. Take them.",
                          "The stone Gwen's hammer bought you brings you to the abbey yard. Use it."],
             "complete": ["I felt her go. All of us did. Rhosyn sat down in the mud and laughed until she cried.",
                          "Take this armour. It was the abbey's best, and it belongs to whoever brought the abbey back.",
                          "Tavish says the road east is open again; the thorns that closed it are dead. The Thornwatch goes home tomorrow. Some of us, anyway.",
                          "Thank you, {name}. The Sisters will remember your name for as long as there are Sisters."]},
        ],
        "done": ["The bells rang this morning. Nobody pulled the ropes. I think they were glad."]},
}

FLAGS = {"seer_scroll": {"name": "the hollow oak's scroll", "quest": "caged_seer", "desc": "You took Hollin's scroll from the hollow oak."},
         "fivestones_1": {"name": "the Hawk stone", "quest": "caged_seer", "desc": "The first of the Fivestones is awake."},
         "fivestones_2": {"name": "the Hound stone", "quest": "caged_seer", "desc": "The second of the Fivestones is awake."},
         "fivestones_3": {"name": "the Hart stone", "quest": "caged_seer", "desc": "The third of the Fivestones is awake."},
         "fivestones_4": {"name": "the Hare stone", "quest": "caged_seer", "desc": "The fourth of the Fivestones is awake."},
         "stones_open": {"name": "the red ring", "quest": "caged_seer", "desc": "The Fivestones are awake; their ring leads to Emberfall."},
         "seer_freed": {"name": "Hollin's freedom", "quest": "caged_seer", "desc": "You freed Old Hollin from the gibbet in Emberfall."},
         "maiden_slain": {"name": "the Thornwatch's thanks", "quest": "thorn_maiden", "desc": "You put Maelis, Maiden of Thorns, back in the ground. The road east is open."}}

# the camp's town portal (2026-10-18: "there should be a town portal in the new camp"), where the source has its waypoint: by the
# back wall east of the captain's pavilion. A portal also makes the camp a town: die on the moor or in the den and you wake by it.
# and its stone, as every town has one (tests/core_test.js: one stone back to each town, earned, never sold): Mother Isolde gives it
# with The Hollow Den's reward
ITEMS = {"town_portal_scroll": {"name": "Scroll of town portal", "description": "Scroll of town portal. Read it and a door opens to the nearest town portal; step back through any town portal once to return to where you read it. One use. Found in the Hollow Den.",
                                "collection": "ASHVALE Items", "game": "ashvale", "category": "tool", "subcategory": "scroll", "weight": 20, "model": "item.scroll",
                                "value": 25, "attributes": [{"trait_type": "Town portal", "value": 1}]},   # 2026-10-18: one-time use, den drop, ~3 a clear
         "thornwatch_stone": {"name": "Thornwatch stone", "description": "Thornwatch stone, tool stone. Teleport thornwatch, Cooldown ticks 3000. Made in the valley of Ashvale.",
                              "collection": "ASHVALE Portal Stones", "game": "ashvale", "category": "tool", "subcategory": "stone", "weight": 200, "model": "item.thornwatchstone",
                              "value": 0, "attributes": [{"trait_type": "Teleport", "value": "thornwatch"}, {"trait_type": "Cooldown ticks", "value": 3000}]}}
ITEMS["gwens_hammer"] = {"name": "Gwen's hammer", "description": "Gwen's hammer, tool hammer. Her master's hammer, and his master's: the haft is black with three smiths' hands. Gwen would very much like it back.",
                         "collection": "ASHVALE Items", "game": "ashvale", "category": "tool", "subcategory": "hammer", "weight": 2200, "model": "gear.mace", "value": 0, "attributes": []}   # The Smith's Hammer: Gorrath drops it
ITEMS["abbey_stone"] = {"name": "Abbey stone", "description": "Abbey stone, tool stone. Teleport abbey, Cooldown ticks 3000. Made in the valley of Ashvale.",
                        "collection": "ASHVALE Portal Stones", "game": "ashvale", "category": "tool", "subcategory": "stone", "weight": 200, "model": "item.stone",
                        "value": 0, "attributes": [{"trait_type": "Teleport", "value": "abbey"}, {"trait_type": "Cooldown ticks", "value": 3000}]}   # The Smith's Hammer's reward
PORTALS = [{"id": "thornwatch", "name": "Thornwatch Camp", "x": 133, "y": 86, "to": [133, 85]},
           {"id": "abbey", "name": "The Abbey Yard", "x": 366, "y": 514, "to": [366, 515]}]   # the abbey's stand in its outer yard (chapters 5 and 6: a long walk otherwise)

NPC_LINES = {
    "rhosyn": {"examine": "Captain Rhosyn of the Thornwatch, three arrows short of a full quiver and not about to say why.",
               "lines": ["We hold this camp because there is nowhere left to fall back to. That makes it simple.",
                         "The archery butts are for the novices. The real practice is on the moor, and the targets move.",
                         "If you see a sister on the moor with her bow drawn on you, do not wait to ask which side she's on. Not any more."]},
    "tavish": {"examine": "Tavish the caravan master, whose wagons have not rolled since the road east closed.",
               "linesOpen": ["The road east is open! The thorns across it went black overnight and fell to dust. I'm told I have you to thank.",
                             "Wagons are loaded. Horses are fed. If you're ever going east, there's a seat up front with your name on it.",
                             "Three summers I sat here. Three. I'm going to miss the porridge, and nothing else."],
               "lines": ["Three wagons, two horses, one road east, and that road's shut. So here I sit.",
                         "The Sisters feed us and we keep their stores dry. It's a fair trade. It's the only trade going.",
                         "When the road opens I'm leaving at a gallop, and you're welcome to ride along. Until then, there's the moor."]},
    "sentry": {"examine": "A Thornwatch sentry, watching the moor over the bridge.",
               "lines": ["Bridge is clear. For now.", "Ashlings were at the fence-line at dusk. They always come back.", "Keep to the trail and you'll see them before they see you."]},
    "hollin": {"examine": "Old Hollin, the last of the seers, with a blanket round his shoulders and a bowl in his lap.",
               "lines": ["The stones remembered me. I wasn't sure they would.", "Sit, sit. My eyes are poor but I see well enough what's coming.",
                         "Mind the fire. I have had enough of fire for one lifetime."]},
    "hollin_caged": {"examine": "An old man in a blue robe, hung up in an iron cage. He's alive. Just.",
                     "lines": ["Help... is someone there? Kill the smith. He has the key. He has the key in him."]},
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
        lp = os.path.join(DD, mod + '.json'); live = load(lp); live['data'].setdefault(key, {}).update(new)   # ours replace whole (a deep merge kept a renamed boss in a quest's kills, 2026-10-19)
        with open(lp, 'w', encoding='utf-8') as f:
            json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
        print('%s: %d added or updated' % (mod, len(new)))
    _tools = load(os.path.join(DD, 'rules.json'))['data']['items']['categories']['tool']
    TOOL_SUBS = _tools + [t for t in ('scroll', 'hammer') if t not in _tools]   # the scroll (Scroll of town portal) was never added; Gwen's hammer
    for mod, new in (("rules", {"portals": PORTALS, "flags": FLAGS, "items": {"categories": {"tool": TOOL_SUBS}}}),):   # a list of {id} merges by id (overlay)
        ep = os.path.join(EX, mod + '.json'); ex = load(ep) if os.path.exists(ep) else {}
        overlay(ex, new)
        with open(ep, 'w', encoding='utf-8') as f:
            json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp); overlay(live['data'], new)
        with open(lp, 'w', encoding='utf-8') as f:
            json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
        print('rules: portal thornwatch, %d flags' % len(FLAGS))
    # the Scroll of town portal (2026-10-18: "a scroll with a blue ribbon around it"): a rolled parchment lying along x,
    # its curled ends a shade darker, a blue ribbon round the middle tied in a bow on top with two tails
    PI2 = 1.5707963
    SCROLL = {"ashvale3d": "part", "api": 1, "v": 1, "id": "item.scroll", "kind": "item", "items": {"town_portal_scroll": "#ecdcae"}, "shapes": [
        {"t": "cyl", "s": [0.03, 0.03, 0.2], "c": "$c", "p": [0, 0.031, 0], "r": [0, 0, PI2], "seg": 12},
        {"t": "cyl", "s": [0.035, 0.035, 0.014], "c": "$c:0.82", "p": [0.094, 0.031, 0], "r": [0, 0, PI2], "seg": 12},
        {"t": "cyl", "s": [0.035, 0.035, 0.014], "c": "$c:0.82", "p": [-0.094, 0.031, 0], "r": [0, 0, PI2], "seg": 12},
        {"t": "cyl", "s": [0.012, 0.012, 0.204], "c": "#b89a60", "p": [0, 0.031, 0], "r": [0, 0, PI2], "seg": 8},
        {"t": "torus", "s": [0.0325, 0.006], "c": "#2a5fd0", "p": [0, 0.031, 0], "r": [0, PI2, 0], "seg": [6, 16]},
        {"t": "torus", "s": [0.013, 0.0045], "c": "#2a5fd0", "p": [-0.012, 0.07, 0], "r": [0, PI2, 0.55], "seg": [5, 10]},
        {"t": "torus", "s": [0.013, 0.0045], "c": "#2a5fd0", "p": [0.012, 0.07, 0], "r": [0, PI2, -0.55], "seg": [5, 10]},
        {"t": "box", "s": [0.008, 0.032, 0.006], "c": "#2350b8", "p": [-0.008, 0.052, 0.03], "r": [0.9, 0, 0.25]},
        {"t": "box", "s": [0.008, 0.032, 0.006], "c": "#2350b8", "p": [0.008, 0.052, 0.03], "r": [0.9, 0, -0.25]}]}
    # the Thornwatch stone (2026-10-18: "visually distinct from the other stones"): a dark red stone of the Red Moor, a ring
    # of six black-green thorns standing round its crown and a bone-white arrowhead set in the middle, for the archers' camp
    import math
    TS = {"ashvale3d": "part", "api": 1, "v": 1, "id": "item.thornwatchstone", "kind": "item", "items": {"thornwatch_stone": "#7a3428"}, "shapes": [
        {"t": "ico", "s": [0.092], "c": "$c", "p": [0, 0.05, 0], "d": 1, "k": [1.2, 0.58, 1.05]},
        {"t": "torus", "s": [0.045, 0.007], "c": "#2c3a24", "p": [0, 0.1, 0], "r": [1.5708, 0, 0], "seg": [5, 14]}] +
        [{"t": "cone", "s": [0.013, 0.048], "c": "#2e4424", "p": [round(math.cos(a) * 0.046, 4), 0.112, round(math.sin(a) * 0.046, 4)],
          "r": [round(-math.sin(a) * 0.5, 3), 0, round(math.cos(a) * 0.5, 3)]} for a in [i * math.pi / 3 for i in range(6)]] +
        [{"t": "cone", "s": [0.016, 0.04], "c": "#e8e0c8", "p": [0, 0.122, 0]},
         {"t": "cyl", "s": [0.005, 0.005, 0.03], "c": "#6a4a2a", "p": [0, 0.092, 0]}]}
    with open(os.path.join(PARTS, 'item.thornwatchstone.json'), 'w', encoding='utf-8') as f:
        json.dump(TS, f, separators=(',', ':'), ensure_ascii=False)
    with open(os.path.join(PARTS, 'item.scroll.json'), 'w', encoding='utf-8') as f:
        json.dump(SCROLL, f, separators=(',', ':'), ensure_ascii=False)
    for pid, body in PART_CHARS.items():
        with open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8') as f:
            json.dump(dict({"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": "char"}, **body), f, separators=(',', ':'), ensure_ascii=False)
    json.dump(NPC_LINES, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'npc_lines.json'), 'w'), indent=1)
    print('parts:', ', '.join(PART_CHARS))
