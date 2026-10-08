#!/usr/bin/env python3
"""Lay the Red Pyre compound, items, quest, NPCs and cave skeleton into data/extra and the cave/saltmere zones."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = os.path.join(ROOT, 'data', 'extra')
DD = os.path.join(ROOT, 'data')

def load(path):
    return json.load(open(path))

def dump(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write('\n')

# --- whisperwood tiles: compound east of the north path ---
ww = load(os.path.join(DD, 'zone.whisperwood.json'))['data']
tiles = [list(r) for r in ww['tiles']]
FX0, FX1, FY0, FY1 = 28, 37, 1, 6
for y in range(FY0, FY1 + 1):
    for x in range(FX0, FX1 + 1):
        tiles[y][x] = 'F' if y in (FY0, FY1) or x in (FX0, FX1) else ','
for x in range(24, 28):
    if tiles[3][x] not in 'F':
        tiles[3][x] = 'p'
tiles[3][28] = 'F'
for y in range(3, 7):
    for x in range(33, 37):
        if tiles[y][x] != 'F':
            tiles[y][x] = 'i'

extra_ww = load(os.path.join(EX, 'zone.whisperwood.json'))
extra_ww['tiles'] = [''.join(r) for r in tiles]
npcs = extra_ww.get('npcs') or []
byid = {n['id']: n for n in npcs}
byid['pike'] = {
    "id": "pike", "name": "Pike", "look": "pike", "x": 27, "y": 2,
    "reqAfter": "wayside_prayer", "openFlag": "vorth_gate",
    "lines": [
        "Sod off. I'm watching this gate, not running a chapel.",
        "Whatever you want, I didn't see it."
    ],
    "linesReady": [
        "If the Saltmere woman sent you, say it. If she didn't, keep walking.",
        "I've nothing to give a tourist."
    ],
    "linesOpen": [
        "Keep your voice down. The gate is yours. Don't make me regret it.",
        "If they ask, you are a buyer. You are not a priest. You are not anything."
    ],
    "examine": "Pike, a bandit lookout in a frayed hood. He stands too still for a thief, and his eyes keep dropping to the gate."
}
byid['vorthan_reader'] = {
    "id": "vorthan_reader", "name": "Vorthan Reader", "look": "vorthan_reader", "x": 36, "y": 3,
    "lines": [
        "The Bright Three are a lie the valley tells itself. Althas, Caelen, Mira - hearth, road, well. Pretty names for a locked door.",
        "Vorth was the fourth. They buried him still breathing. We wear the orange so the living remember the fire that was stolen.",
        "If you have come to pray, kneel. If you have come to listen for Wenna, you have already stayed too long."
    ],
    "examine": "A Vorthan in an orange hooded robe. The cloth is the colour of a banked fire."
}
byid['vorthan_acolyte'] = {
    "id": "vorthan_acolyte", "name": "Vorthan Acolyte", "look": "vorthan_acolyte", "x": 36, "y": 5,
    "lines": [
        "The Red Pyre is not a church of Ashvale. It is the place Vorth's name is still spoken.",
        "Do not touch the beads on the keeper. They remember the cave."
    ],
    "examine": "A younger Vorthan, orange hood drawn up, standing as if the walls themselves were listening."
}
extra_ww['npcs'] = list(byid.values())
extra_ww['objects'] = [
    {"k": "tent", "x": 39, "y": 21, "w": 2, "h": 2},
    {"k": "tent", "x": 43, "y": 21, "w": 2, "h": 2},
    {"k": "tent", "x": 44, "y": 26, "w": 2, "h": 2},
    {"k": "campfire", "x": 41, "y": 24, "w": 1, "h": 1},
    {"k": "gate", "x": 28, "y": 3, "to": [30, 3], "out": [27, 3], "span": "ns", "need": "vorth_gate",
     "label": "Open the gate", "name": "Compound gate",
     "shut": "The gate is barred. The lookout will not open it.",
     "say": "Pike's latch lifts. You slip through."},
    {"k": "church", "x": 33, "y": 3, "w": 4, "h": 3, "door": [33, 4], "enter": True,
     "sign": "The Red Pyre", "wall": "#8a2018", "roof": "#4a0c0c"},
    {"k": "altar", "x": 36, "y": 4, "w": 1, "h": 1, "face": "w"},
    {"k": "pew", "x": 34, "y": 3, "w": 1, "h": 1, "face": "e"},
    {"k": "pew", "x": 35, "y": 3, "w": 1, "h": 1, "face": "e"},
    {"k": "pew", "x": 34, "y": 5, "w": 1, "h": 1, "face": "e"},
    {"k": "pew", "x": 35, "y": 5, "w": 1, "h": 1, "face": "e"},
    {"k": "sconce", "x": 34, "y": 3, "w": 1, "h": 1, "face": "n", "night": True}
]
spawns = [s for s in (extra_ww.get('spawns') or []) if s.get('m') != 'vorthan']
spawns.append({"m": "vorthan", "x": 31, "y": 4})
extra_ww['spawns'] = spawns
dump(os.path.join(EX, 'zone.whisperwood.json'), extra_ww)

salt_path = os.path.join(DD, 'zone.saltmere.json')
salt = load(salt_path)
for n in salt['data']['npcs']:
    if n['id'] == 'wenna':
        n['quests'] = ['red_pyre']
dump(salt_path, salt)

cave_path = os.path.join(DD, 'zone.spidercave.json')
cave = load(cave_path)
cave['data']['npcs'] = [
    {
        "id": "edric_skel", "name": "A dead man", "look": "edric_skel", "x": -146, "y": 16105,
        "verb": "Search",
        "search": {
            "quest": "red_pyre", "step": 3, "item": "vorth_rosary", "flag": "vorth_bag",
            "ghost": "edric_ghost",
            "items": ["vorthan_robe", "edric_note"],
            "say": [
                "The bag gives up an orange robe, still smelling of smoke, and a scrap of paper written in a shaking hand.",
                "The air goes cold. A shape stands where the bones were sitting."
            ]
        },
        "escape": [-124, 10],
        "escapeSay": "You scramble back up the shaft. Whisperwood air hits you like a door opening.",
        "examine": "A skeleton slumped against the cave wall, a rotting bag still hooked in the ribs.",
        "lines": ["We should probably leave him alone."]
    },
    {
        "id": "edric_ghost", "name": "Edric's shade", "look": "edric_ghost", "x": -145, "y": 16105,
        "hideFlag": "vorth_bag",
        "lines": [
            "I am Edric. I wore the orange once. I was a Vorthan, and I believed the fire was justice.",
            "Then I heard them plan to take the cave. Not to hide. To dump the ones who would not kneel. They used the rosary as a key - it always puts you at the mouth.",
            "I stole a robe and wrote it down. I ran southeast. They sent me into the dark after the beads, and the spiders finished what the Pyre started.",
            "Take the note to Mother Wenna in Saltmere. Let the Bright Three hear it. I was not brave enough to walk there alive."
        ],
        "examine": "A pale figure in a ruined orange hood. You can see the cave wall through him."
    }
]
dump(cave_path, cave)

items = load(os.path.join(EX, 'items.json'))
items['items']['vorthan_robe'] = {
    "name": "Vorthan robe",
    "description": "An orange hooded robe of the Red Pyre. Magic +2, Prayer +4. Adds two seconds to each prayer point on top of any other Prayer bonus. Found in the Spider Cave on Edric's bones.",
    "collection": "ASHVALE The Red Pyre",
    "game": "ashvale",
    "category": "armour",
    "subcategory": "robe",
    "tier": 1,
    "weight": 1500,
    "req": {"prayer": 1},
    "model": "gear.robe",
    "value": 140,
    "attributes": [
        {"trait_type": "Magic", "value": 2},
        {"trait_type": "Prayer", "value": 4},
        {"trait_type": "Prayer seconds", "value": 2}
    ],
    "nft": {"copies": 25, "key": "vorthan_robe"}
}
items['items']['vorth_rosary'] = {
    "name": "Vorth's rosary",
    "description": "A string of burnt-orange beads. Worn in the shield hand: Magic +2, Prayer +4, and two seconds added to each prayer point (same as a Vorthan robe). Once Mother Wenna has sent you for the keeper's beads, using them carries you to the mouth of the Spider Cave southeast of Whisperwood.",
    "collection": "ASHVALE The Red Pyre",
    "game": "ashvale",
    "category": "jewellery",
    "subcategory": "charm",
    "tier": 1,
    "weight": 80,
    "req": {"prayer": 1},
    "model": "gear.rosary",
    "value": 140,
    "attributes": [
        {"trait_type": "Magic", "value": 2},
        {"trait_type": "Prayer", "value": 4},
        {"trait_type": "Prayer seconds", "value": 2},
        {"trait_type": "Teleport", "value": "spidercave"},
        {"trait_type": "Teleport from step", "value": "red_pyre:3"},
        {"trait_type": "Cooldown ticks", "value": 0}
    ],
    "nft": {"copies": 25, "key": "vorth_rosary"}
}
items['items']['edric_note'] = {
    "name": "Edric's note",
    "description": "A damp scrap in a Vorthan's hand. It names the Red Pyre, the rosary, and the cave. Mother Wenna of Saltmere is meant to read it.",
    "collection": "ASHVALE Items",
    "game": "ashvale",
    "category": "resource",
    "subcategory": "note",
    "weight": 20,
    "model": "item.bones",
    "value": 1,
    "attributes": []
}
dump(os.path.join(EX, 'items.json'), items)

mon = load(os.path.join(EX, 'monsters.json'))
mon['monsters']['vorthan'] = {
    "name": "Vorthan",
    "level": 14,
    "hp": 28,
    "att": 13,
    "def": 11,
    "attb": 10,
    "defb": 10,
    "max": 4,
    "speed": 5,
    "aggro": 0,
    "respawn": 90,
    "drops": [{"item": "vorth_rosary", "one_in": 1}],
    "gold": 12,
    "anim": "cast",
    "look": "vorthan",
    "animal": False,
    "cover": {"quest": "red_pyre", "step": 3},
    "ai": {"kind": "humanoid", "faction": "vorthan", "rally": 0, "leash": 8}
}
dump(os.path.join(EX, 'monsters.json'), mon)

rules = load(os.path.join(EX, 'rules.json'))
rules['items']['categories']['resource'] = [
    "logs", "ore", "coal", "bar", "pelt", "fish", "mushroom", "meat", "bones", "note",
    "silk", "grain", "bark", "sinew", "bucket", "curio"   # spider silk, wild rice, and the sugar bush (2026-10-08)
]
rules['flags']['vorth_gate'] = {
    "name": "Pike's latch",
    "quest": "red_pyre",
    "desc": "Pike has opened the compound gate. You may enter and leave."
}
rules['flags']['vorth_bag'] = {
    "name": "Edric's bag",
    "quest": "red_pyre",
    "desc": "You searched the bones in the Spider Cave."
}
rules['portals'] = [
    {"id": "ashvale", "name": "Ashvale", "x": 19, "y": 55, "to": [19, 56]},
    {"id": "saltmere", "name": "Saltmere", "x": 462, "y": 28, "to": [462, 29]},
    {"id": "spidercave", "name": "the Spider Cave", "x": -125, "y": 8, "to": [-124, 10]}
]
dump(os.path.join(EX, 'rules.json'), rules)

quests = load(os.path.join(EX, 'quests.json'))
quests['quests']['red_pyre'] = {
    "name": "The Red Pyre",
    "giver": "wenna",
    "after": "wayside_prayer",
    "steps": [
        {
            "id": 1,
            "zone": "whisperwood",
            "goal": {"talk": "pike"},
            "reward": "flag:vorth_gate",
            "talk": [
                "The chapel is open, {name}. That is not the end of the work.",
                "The Bright Three keep this valley: Althas of the Hearth, Caelen of the Road, Mira of the Well. You walked their blessing-roll. They have an enemy.",
                "Southwest of the village, up the Whisperwood path a little way, then northwest of the bandits: a closed gate, and a man who looks like one of them. He is not. Go talk to him. I will not say his name on this floor."
            ],
            "say": [
                "Keep your voice down. If they hear a prayer out of you I am a dead man.",
                "I am Pike. Brother Pike, of Caelen of the Road. Aldous put me here as a lookout. The bandits think I watch the trail for them.",
                "Inside that fence is the Red Pyre. They are Vorthans - not priests of the Three. Vorth was the fourth they buried still breathing. Orange hoods, a red church. I open the gate. You listen. You do not strike. If you blow this, they will know I let you in."
            ],
            "progress": [
                "Southwest up the Whisperwood path, then northwest of the bandits. A closed gate and a man who looks like a lookout. Talk to him, then come back."
            ],
            "complete": [
                "Pike. Yes. Caelen still has a man in that camp. You did not name him in the wood, I hope.",
                "Go in. Hear them. Then come back to me before you do anything that looks like a fight."
            ]
        },
        {
            "id": 2,
            "zone": "whisperwood",
            "goal": {"talk": "vorthan_reader"},
            "talk": [
                "The red church is inside the compound. Speak to the one who reads. Come back and tell me what they worship, {name}."
            ],
            "say": [
                "The Bright Three are a lie the valley tells itself. Althas, Caelen, Mira - hearth, road, well.",
                "Vorth was the fourth. They buried him still breathing. We wear the orange so the living remember the fire that was stolen.",
                "If you have come to pray, kneel. If you have come from Saltmere, you have already stayed too long."
            ],
            "progress": [
                "Inside the gated compound, in the red church. Speak to the Vorthan who reads, then return to Saltmere."
            ],
            "complete": [
                "Vorth the Unburied. I had hoped it was rumour. The Three are hearth, road and well - and they had a brother they would not name.",
                "Pike cannot hold that gate forever. There is a keeper among them who carries burnt beads, a rosary. You must take it from him. Until I said this, you were not to raise a hand in there. Now you must.",
                "The beads will put you at a cave in the southeast woods. Whatever they have been hiding, it is there. Bring me what you find."
            ]
        },
        {
            "id": 3,
            "zone": "spidercave",
            "goal": {"kill": "vorthan", "n": 1, "bring": "edric_note"},
            "reward": "xp:prayer:693",
            "talk": [
                "Kill the Vorthan who keeps the rosary. Use the beads. They will carry you to the Spider Cave, southeast of Whisperwood.",
                "Halfway down the first tunnel you will find what they left. Search it. Bring me the writing. The robe is yours if it still holds together."
            ],
            "progress": [
                "One Vorthan slain, and Edric's note in your bag. So far: {n} of {goal} slain. The rosary opens the cave. The bones wait halfway down the first tunnel."
            ],
            "complete": [
                "Edric. A Vorthan who ran. The Three hear a confession even when the mouth that made it is gone.",
                "You have done more than open a chapel, {name}. Pray. The Road, the Hearth and the Well will hold longer for you now."
            ]
        }
    ],
    "done": [
        "The Red Pyre still stands, but it is known. Pike lives, and Edric's note is here. Go well, {name}."
    ]
}
dump(os.path.join(EX, 'quests.json'), quests)

robe = load(os.path.join(DD, 'parts', 'gear.robe.json'))
robe['items']['vorthan_robe'] = '#e07020'
dump(os.path.join(DD, 'parts', 'gear.robe.json'), robe)
print('red pyre data written')
