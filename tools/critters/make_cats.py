#!/usr/bin/env python3
"""make_cats.py - the towns' cats (2026-10-19, the operator: "please add cats to the game" ... "make a new base model for cats - that can be
adapted for other assets later").

Each cat is a look on the new QUADRUPED base model (src/models.js quadruped(): body "quadruped", the cat preset and its own coat), and a
town animal like the hens: it wanders, sits when it stops, runs when hit and never starts a fight. Where they live is the world's business
(rules.strays, src/world.js: a few to every town, more in Saltmere). Names and examine lines drafted by the local Qwen model (Qwen3.5-9B)
and edited. Writes data/parts/char.cat_*.json and the monsters into data/extra/monsters.json and data/monsters.json (the castle extras'
overlay, so tools/make_data.py keeps them on a rerun).
    python3 tools/critters/make_cats.py      (then python3 build.py)
"""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'castle'))
from make_castle_extras import load, overlay, DD, EX, PARTS   # noqa: E402

CATS = {   # look id: (name, examine, the quadruped's own numbers over the cat preset)
    "cat_alley": ("Alley cat", "A ragged little beast that has opinions about your boots and a crust of bread.",
                  {"color": "#8a7a68", "pattern": "tabby", "mark": "#4a3e34", "eyes": "#c8cc48"}),
    "cat_ginger": ("Ginger tom", "An orange disaster with a notched ear, judging your life choices from a crate.",
                   {"color": "#d0782e", "pattern": "tabby", "mark": "#8e4614", "belly": "#e8b07a", "eyes": "#d8b030", "size": 1.08}),
    "cat_black": ("Black cat", "Silent, sleek and gone into the dark before you can decide whether that was luck.",
                  {"color": "#24221f", "pattern": "solid", "belly": "#2c2a26", "eyes": "#9ad040", "nose": "#4a3a3a", "inner": "#5a4446", "len": 1.05, "girth": 0.92}),
    "cat_mouser": ("Harbour mouser", "A barrel-sized lump of fur with a fish head, ignoring everything that is not a fish head.",
                   {"color": "#f0ebe2", "pattern": "calico", "mark": "#d0782e", "patch": "#2a2420", "eyes": "#d8b030", "girth": 1.38, "len": 1.08, "legLen": 0.9, "size": 1.12}),
    "cat_tuxedo": ("Tuxedo cat", "Dressed for a dinner nobody invited it to, and staying for it anyway.",
                   {"color": "#1e1c1a", "pattern": "tuxedo", "eyes": "#c8cc48", "nose": "#d08a8a"}),
    "cat_siamese": ("Pale cat", "Cream and soot, with eyes like a cold harbour morning and a voice like a rusty gate.",
                    {"color": "#ece0c8", "pattern": "points", "mark": "#4a382c", "eyes": "#6ab0e8", "pupil": "slit", "len": 1.04, "girth": 0.9, "head": 0.95}),
}
MONSTERS = {k: {"name": n, "examine": ex, "level": 1, "hp": 3, "att": 1, "def": 1, "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 90,
                "drops": [], "gold": 0, "anim": "bite", "look": k, "animal": True, "shy": 3, "ownDice": True, "roam": 4, "fleeHit": True, "roamEvery": 3, "tame": True}
            for k, (n, ex, _) in CATS.items()}
STRAYS = {"note": "2026-10-19: cats in every town (src/world.js strays) - one per `per` buildings, at most max, or the town's own number",
          "per": 4, "max": 3, "kinds": ["cat_alley", "cat_ginger", "cat_tuxedo", "cat_black", "cat_siamese", "cat_mouser"],
          "towns": {"saltmere": 10, "village": 3, "castle": 4},
          "townKinds": {"saltmere": ["cat_alley", "cat_black", "cat_ginger", "cat_alley", "cat_mouser", "cat_tuxedo", "cat_black", "cat_alley", "cat_ginger", "cat_mouser"]}}
PART_CHARS = {"char." + k: {"role": "monster", "name": n, "body": "quadruped", "quadruped": dict({"preset": "cat"}, **q)} for k, (n, _, q) in CATS.items()}

if __name__ == '__main__':
    ep = os.path.join(EX, 'monsters.json'); ex = load(ep) if os.path.exists(ep) else {"monsters": {}}
    ex.setdefault("monsters", {}).update(MONSTERS)
    with open(ep, 'w', encoding='utf-8') as f:
        json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
    lp = os.path.join(DD, 'monsters.json'); live = load(lp); overlay(live['data'], {"monsters": MONSTERS})
    with open(lp, 'w', encoding='utf-8') as f:
        json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
    rp = os.path.join(EX, 'rules.json'); rx = load(rp) if os.path.exists(rp) else {}
    rx["strays"] = STRAYS
    with open(rp, 'w', encoding='utf-8') as f:
        json.dump(rx, f, indent=1, ensure_ascii=False); f.write('\n')
    lr = os.path.join(DD, 'rules.json'); lv = load(lr); lv['data']['strays'] = STRAYS
    with open(lr, 'w', encoding='utf-8') as f:
        json.dump(lv, f, separators=(',', ':'), ensure_ascii=False)
    for pid, body in PART_CHARS.items():
        with open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8') as f:
            json.dump(dict({"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": "char"}, **body), f, separators=(',', ':'), ensure_ascii=False)
    print('cats: %d monsters, parts %s' % (len(MONSTERS), ', '.join(PART_CHARS)))
