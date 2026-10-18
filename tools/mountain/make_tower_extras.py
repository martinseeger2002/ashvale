#!/usr/bin/env python3
"""make_tower_extras.py - the Frostspire's people, gear, books and quests (2026-10-18, the operator: "at the peak of the mountain from the
pass should be a wizards tower with wizard quests and new items and lore. We need a wizard cloak you can buy from there that is current
bis for mage gear top and bottom").

- Archmage Halvard of the Circle of the Long Night gives four quests: a beacon to light, ink the frost goblins stole, three of the Circle's
  books lent down the mountain long ago, and his trial on the pass. Apprentice Pell keeps the tower's shop (tower_magic).
- The wizard cloak, top and bottoms, the best magic armour in the valley: the top is a robe (body) better than any other body piece for
  magic, the bottoms a new armour kind, robelegs (legs), the first legs piece with any magic at all. Both need Magic 40, and are dear.
- The Circle's three books carry the lore (examine them); the Wizard's focus is the trial's reward.
The quest lines and the lore were drafted by the local Qwen model from a spec here, then rewritten by hand (its speakers wandered).

Writes data/extra/ (kept across tools/make_data.py reruns) and merges into the live modules like make_data's overlay(); data/shops.json
and data/rules.json directly (rules: the robelegs kind and its slot, also kept in data/extra/rules.json); the colours of the new items
into their model parts; tools/mountain/tower_lines.json for tools/mountain/make_tower.js.
    python3 tools/mountain/make_tower_extras.py      (then node tools/mountain/make_tower.js; python3 build.py)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'castle'))
from make_castle_extras import overlay, load, DD, EX, PARTS   # noqa: E402 (the castle tool's merge, reused)


def gear(name, desc, cat, sub, tier, weight, req, model, value, attrs, collection="ASHVALE The Frostspire"):
    return {"name": name, "description": desc, "collection": collection, "game": "ashvale", "category": cat, "subcategory": sub, "tier": tier,
            "weight": weight, "req": req, "model": model, "value": value, "attributes": [{"trait_type": k, "value": v} for k, v in attrs]}


def thing(name, desc, sub, model, value, weight=200):
    return {"name": name, "description": desc, "collection": "ASHVALE The Frostspire", "game": "ashvale", "category": "resource", "subcategory": sub,
            "weight": weight, "model": model, "value": value, "attributes": []}


ITEMS = {
    # the best magic armour: no body piece gives more than Magic +2 (the Vorthan robe), no legs piece any; Defence below plate of the
    # same price, as a robe should be
    "wizard_cloak": gear("Wizard cloak top", "The upper half of the Circle of the Long Night's cloak, deep blue and lined with silver thread that holds the "
                         "cold out and the magic in; wear the bottoms with it. Magic +10, Defence +12. Needs Magic 40. Sold at the Frostspire.",
                         "armour", "robe", 5, 1600, {"magic": 40}, "gear.robetop", 12000, [("Magic", 10), ("Defence", 12)]),
    "wizard_cloak_bottoms": gear("Wizard cloak bottoms", "The long skirts of the Circle's cloak, the hem bound in leather so it does not snag on the "
                                 "mountain's rocks. Magic +7, Defence +8. Needs Magic 40. Sold at the Frostspire.",
                                 "armour", "robelegs", 5, 1200, {"magic": 40}, "gear.robelegs", 8500, [("Magic", 7), ("Defence", 8)]),
    "wizard_focus": gear("Wizard's focus", "A sphere of summit ice that has not melted since the Ember King's chain was forged, held up on a silver "
                         "stem. Archmage Halvard gives it to those who pass his trial. Held in the shield hand it adds 5 to your Magic bonus: your "
                         "spells find their mark more often (it sharpens the aim, not the blow - a spell still hits as hard as it ever did). "
                         "Needs Magic 30.", "jewellery", "charm", 3, 300, {"magic": 30}, "gear.focus", 2500, [("Magic", 5)]),
    "frost_ink": thing("Frost ink", "A pot of the Frostspire's ink, pale blue and cold enough to sting. The Circle writes with it because it does not "
                       "fade, and the frost goblins steal it because it is shiny.", "curio", "item.potion", 15, 300),
    "tome_echoes": thing("Tome of Echoes", "The Circle's first book: the mountain was raised to be a watchtower, and every echo on it is a word the "
                         "watchers once said aloud and the stone kept. Aled has read it so often he answers it.", "note", "item.note", 1, 600),
    "tome_stones": thing("Tome of Stones", "The Circle's second book: the Three Stones at the shrine were the first wardens of the mountain, wizards who "
                         "stood their watch so long they forgot to stop. Wyn swears they still hum the hours.", "note", "item.note", 1, 600),
    "tome_far_road": thing("Tome of the Far Road", "The Circle's third book: a map of the roads beyond the mountain, and a warning in frost ink that the "
                           "Ember King's chain was forged on this summit and must be kept cold here, or it will soften there.", "note", "item.note", 1, 600),
}
COLOURS = {   # the new items' colours in their model parts (models.js reads ITEMS from each part's `items`)
    "gear.robetop": {"wizard_cloak": "#2c3488"}, "gear.robelegs": {"wizard_cloak_bottoms": "#2c3488"},
    "gear.focus": {"wizard_focus": "#a8dcff"}, "item.focus": {"wizard_focus": "#a8dcff"},
    "item.potion": {"frost_ink": "#8fd0f0"}, "item.note": {"tome_echoes": "#5a3a7a", "tome_stones": "#6a6458", "tome_far_road": "#2a4a6a"},
}
ROBELEGS = {   # gear.robelegs: the cloak's skirts on the hips (a little wider than a robe's own, so they sit over one), a silver hem
    "ashvale3d": "part", "api": 1, "v": 1, "id": "gear.robelegs", "kind": "gear", "slot": "legs", "family": "cloth", "items": {},
    "shapes": [
        {"t": "cyl", "s": ["0.215*W*(1+0.16*fem)", "0.305*W*(1+0.1*fem)", 0.84], "c": "$c", "p": [0, -0.44, 0], "seg": 10, "k": [1, 1, 0.8], "j": "hips"},
        {"t": "cyl", "s": ["0.302*W*(1+0.1*fem)", "0.31*W*(1+0.1*fem)", 0.05], "c": "#c8ccd8", "p": [0, -0.84, 0], "seg": 10, "k": [1, 1, 0.8], "j": "hips"},
        {"t": "cyl", "s": ["0.22*W*(1+0.16*fem)", "0.225*W*(1+0.16*fem)", 0.05], "c": "#c8ccd8", "p": [0, -0.04, 0], "seg": 10, "k": [1, 1, 0.8], "j": "hips"},
    ],
    "groundShapes": [
        {"t": "box", "s": [0.46, 0.05, 0.5], "c": "$c", "p": [0, 0.03, 0]},
        {"t": "box", "s": [0.48, 0.06, 0.05], "c": "#c8ccd8", "p": [0, 0.04, 0.26]},
    ],
}

SILVER = "#c8ccd8"
ROBETOP = {   # gear.robetop: the cloak's upper half - a robe's body, shoulders and sleeves cut off at the hip with a short silver-hemmed flare,
    # so the bottoms (gear.robelegs) are the skirts (2026-10-18, the operator: "cut off the legs of the robe top so it makes sense to have 2 pieces")
    "ashvale3d": "part", "api": 1, "v": 1, "id": "gear.robetop", "kind": "gear", "slot": "body", "family": "cloth", "items": {},
    "shapes": [
        {"t": "cyl", "s": ["0.22*W", "0.195*W", 0.48], "c": "$c", "p": [0, 0.27, 0], "seg": 10, "k": [1, 1, 0.72], "j": "torso"},
        {"t": "cyl", "s": ["0.205*W*(1+0.12*fem)", "0.25*W*(1+0.1*fem)", 0.2], "c": "$c", "p": [0, -0.06, 0], "seg": 10, "k": [1, 1, 0.78], "j": "hips"},
        {"t": "cyl", "s": ["0.248*W*(1+0.1*fem)", "0.254*W*(1+0.1*fem)", 0.045], "c": SILVER, "p": [0, -0.16, 0], "seg": 10, "k": [1, 1, 0.78], "j": "hips"},
        {"t": "cyl", "s": ["0.205*W", "0.205*W", 0.05], "c": SILVER, "p": [0, 0.05, 0], "seg": 10, "k": [1, 1, 0.74], "j": "torso"},
        {"t": "box", "s": [0.03, 0.4, 0.02], "c": SILVER, "p": [0, 0.29, 0.16], "j": "torso"},
        {"t": "sphere", "s": [0.15], "c": "$c:0.82", "p": [0, 0.46, -0.11], "seg": [9, 6], "k": [1.25, 0.55, 0.75], "j": "torso"},
        {"t": "capsule", "s": [0.076, 0.17], "c": "$c", "p": [0, -0.14, 0], "j": "sh*"},
        {"t": "cyl", "s": [0.07, 0.115, 0.17], "c": "$c", "p": [0, -0.18, 0], "seg": 8, "j": "el*"},
        {"t": "cyl", "s": [0.112, 0.118, 0.03], "c": SILVER, "p": [0, -0.27, 0], "seg": 8, "j": "el*"},
    ],
    "groundShapes": [
        {"t": "box", "s": [0.42, 0.05, 0.36], "c": "$c", "p": [0, 0.03, 0]},
        {"t": "box", "s": [0.3, 0.05, 0.11], "c": "$c", "p": [-0.3, 0.03, -0.08], "r": [0, -0.5, 0]},
        {"t": "box", "s": [0.3, 0.05, 0.11], "c": "$c", "p": [0.3, 0.03, -0.08], "r": [0, 0.5, 0]},
        {"t": "box", "s": [0.44, 0.06, 0.04], "c": SILVER, "p": [0, 0.04, 0.19]},
    ],
}
_PRONGS = [{"t": "tube", "s": [0.008], "c": SILVER, "pts": [[0, 0.13, 0], [0.055 * c, 0.19, 0.055 * s], [0.05 * c, 0.27, 0.05 * s]], "seg": 6}
           for c, s in ((1, 0), (-0.5, 0.866), (-0.5, -0.866))]
FOCUS = {   # gear.focus: a ball of never-melting ice in a three-pronged silver cradle on a short stem, held up in the shield hand
    "ashvale3d": "part", "api": 1, "v": 1, "id": "gear.focus", "kind": "gear", "slot": "shield", "items": {},
    "mount": {"j": "handL", "p": [0, 0, 0], "r": [0, 0, 0]}, "ground": {"p": [0, 0.03, 0], "r": [1.45, 0, 0]},
    "shapes": [
        {"t": "sphere", "s": [0.03], "c": SILVER, "p": [0, -0.06, 0], "seg": [8, 6]},
        {"t": "cyl", "s": [0.024, 0.032, 0.2], "c": SILVER, "p": [0, 0.04, 0], "seg": 8},
        {"t": "cyl", "s": [0.05, 0.03, 0.03], "c": SILVER, "p": [0, 0.15, 0], "seg": 8},
    ] + _PRONGS + [
        {"t": "sphere", "s": [0.085], "c": "$c", "p": [0, 0.25, 0], "seg": [12, 9], "glow": True},
        {"t": "sphere", "s": [0.032], "c": "#ffffff", "p": [0, 0.25, 0], "seg": [8, 6], "glow": True},
    ],
}
FOCUS_ICON = {   # item.focus: the same, standing on its foot
    "ashvale3d": "part", "api": 1, "v": 1, "id": "item.focus", "kind": "item", "items": {},
    "shapes": [{"t": "cyl", "s": [0.08, 0.09, 0.025], "c": SILVER, "p": [0, 0.012, 0], "seg": 10}] + [dict(x, p=[(x.get("p") or [0, 0, 0])[0], (x.get("p") or [0, 0, 0])[1] + 0.09, (x.get("p") or [0, 0, 0])[2]]) if "p" in x else dict(x, pts=[[q[0], q[1] + 0.09, q[2]] for q in x["pts"]]) for x in FOCUS["shapes"][1:]],
}

MONSTERS = {   # the frost goblins carry off the tower's ink (all their drops given, as overlay() replaces a drops list whole)
    "frost_goblin": {"drops": [{"item": "bones", "one_in": 1}, {"item": "frost_ink", "one_in": 2}, {"item": "sword_t1", "one_in": 3}]},
}

SHOP = {"tower_magic": {"name": "The Frostspire's Wares", "keeper": "pell", "stock": ["wizard_cloak", "wizard_cloak_bottoms", "hat_wizard", "staff_t4", "staff_t5", "potion", "prayer_potion"],
                        "buys": ["weapon/staff"], "buyRate": 40, "sellRate": 100,
                        "greet": "Wizard cloaks! Top and bottoms, warm enough to stop a frost goblin's breath. The Archmage says I'm not to call them bargains."}}

LINES = {
    "halvard_examine": "Archmage Halvard of the Circle of the Long Night. Old, exact, and kind in a way he would rather you did not mention.",
    "pell_examine": "Apprentice Pell. Ink on the fingers, frost on the eyebrows, and a cloak for sale whether you asked or not.",
}

QUESTS = {
    "tower_beacon": {
        "name": "The Frostspire Beacon", "giver": "halvard", "story": 1,
        "steps": [
            {"id": 1, "zone": "mt_tower", "goal": {"bring": "logs", "n": 5}, "reward": "xp:firemaking:400",
             "talk": ["You climbed up here on purpose? Then you can be useful on purpose. The beacon at the top of the tower has gone out.",
                      "It is not a pretty light. It tells the valley the Circle is still watching, and it tells the things in the dark the same.",
                      "Five logs. There are no trees up here, which is why nobody up here has any."],
             "progress": ["Five logs for the beacon. The pines on the way up the safe road will give them, if you bring a hatchet."],
             "complete": ["Five. Dry, too. It will be lit within the hour, and the castle will see it from the walls."]},
            {"id": 2, "zone": "mt_tower", "goal": {"talk": "pell"}, "reward": "xp:magic:300",
             "talk": ["Now tell Pell the beacon is fed. He keeps the log of it, and he will want to write something important-sounding in it.",
                      "Do not let him sell you anything while you are there. Or do. I am not your mother."],
             "progress": ["Pell is at his stall in the yard. Tell him the beacon is fed."],
             "complete": ["Beacon fed! I'll write it down. 'Fed, by a traveller, with logs.' The Archmage says my entries are too long."]},
        ],
        "done": ["The beacon burns every night now. The Archmage pretends not to look at it from the yard."]},
    "stolen_ink": {
        "name": "The Stolen Ink", "giver": "halvard", "after": "tower_beacon", "story": 2,
        "steps": [
            {"id": 1, "zone": "mt_pass", "goal": {"kill": "frost_goblin", "n": 3}, "reward": "xp:magic:600",
             "talk": ["The Circle writes in frost ink. It does not fade, it does not run, and the frost goblins think it is the shiniest thing in the world.",
                      "They have stolen a winter's worth from our stores and taken it down to the rocks above the pass.",
                      "Persuade three of them that ink is not worth it. I leave the method to you, but I am a wizard, and I have an opinion."],
             "progress": ["The frost goblins keep to the rocks above the High Pass. Three of them."],
             "complete": ["Three. They will tell the others, in their fashion, which is mostly shrieking."]},
            {"id": 2, "zone": "mt_tower", "goal": {"bring": "frost_ink", "n": 3}, "reward": "xp:magic:600",
             "talk": ["Now the ink itself. Three pots. The goblins carry it about with them because they cannot think where else to put it.",
                      "If a pot is cracked, bring it anyway. Frost ink in a cracked pot is still frost ink, only colder."],
             "progress": ["Three pots of frost ink. The frost goblins above the pass carry it."],
             "complete": ["Three, and not one opened. You have more patience than any apprentice I have ever had."]},
        ],
        "done": ["Pell has labelled the ink cupboard 'NOT FOR GOBLINS'. The Archmage says this will not help."]},
    "scattered_tomes": {
        "name": "The Scattered Tomes", "giver": "halvard", "after": "stolen_ink", "story": 3,
        "steps": [
            {"id": 1, "zone": "mt_ledge", "goal": {"talk": "aled"}, "reward": "tome_echoes",
             "talk": ["The Circle once had three books worth keeping. In a weak moment, years apart, I lent all three to people who live on this mountain.",
                      "Aled on the ledge has the Tome of Echoes, Wyn at the shrine the Tome of Stones, and Tamsin at the Far Foot the Tome of the Far Road.",
                      "Start with Aled. He will say he has not finished it. He has had it for thirty years."],
             "progress": ["Aled's ledge is down the safe road's west shoulder. Ask him for the Tome of Echoes."],
             "complete": ["The Tome of Echoes? Take it. I know it by heart, and the echoes know it better. Tell Halvard I found the ending sad."]},
            {"id": 2, "zone": "mt_shrine", "goal": {"talk": "wyn"}, "reward": "tome_stones",
             "talk": ["Wyn has the Tome of Stones. Wyn will want to tell you what it means, at length, beside the stones.",
                      "Let him. It is cheaper than arguing, and he is usually right."],
             "progress": ["The shrine is on the north shoulder, on the safe road. Ask Wyn for the Tome of Stones."],
             "complete": ["The book of the stones. Read the third chapter by them sometime; they like to hear it. Go carefully, it is older than the shrine."]},
            {"id": 3, "zone": "mt_farside", "goal": {"talk": "tamsin"}, "reward": "tome_far_road",
             "talk": ["The last is the Tome of the Far Road, with Tamsin at the Far Foot. She borrowed it for the maps and kept it for the warnings.",
                      "It is the one I most want back. Do not read the last page on the way up. Or do, and then walk faster."],
             "progress": ["Tamsin waits at the Far Foot, at the bottom of both ways on the far side. Ask her for the Tome of the Far Road."],
             "complete": ["The Far Road? Here. I copied the maps. I didn't copy the last page; I didn't want it in my own hand."]},
            {"id": 4, "zone": "mt_tower", "goal": {"talk": "pell"}, "reward": "xp:magic:1500",
             "talk": ["All three. Read them on the way up, if you have not; they were written to be read side by side, and they sulk apart.",
                      "Then show them to Pell. He keeps the Circle's catalogue, and he has been waiting thirty years to tick them off."],
             "progress": ["Show the three tomes to Pell at his stall in the yard. Keep them after; the Circle lends its books to its friends."],
             "complete": ["Echoes, Stones, the Far Road - all three ticked! The Archmage read the last page over your shoulder. He says the chain hums colder than last year.",
                          "Keep them. He says a book on a shelf up here helps nobody, and you have already read the part that matters."]},
        ],
        "done": ["The three books sit side by side in the tower now. Halvard reads the last page of the third one every night."]},
    "archmage_trial": {
        "name": "The Archmage's Trial", "giver": "halvard", "after": "scattered_tomes", "story": 3,
        "steps": [
            {"id": 1, "zone": "mt_pass", "goal": {"kill": "pass_bandit", "n": 3}, "reward": "xp:magic:800",
             "talk": ["The Circle takes no members who cannot keep a road. Watching the stars is easy; getting home from watching them is not.",
                      "Clear the pass of three bandits. Then three frost goblins. Then come back up and we will see about a cloak worthy of the name."],
             "progress": ["Three pass bandits on the High Pass, then three frost goblins."],
             "complete": ["Three bandits. Now the goblins, and then come up."]},
            {"id": 2, "zone": "mt_pass", "goal": {"kill": "frost_goblin", "n": 3}, "reward": "wizard_focus",
             "talk": ["The goblins now. Three. They will be expecting you, having heard the bandits.", "Come back up when it is done. The cold will tell me before you do."],
             "progress": ["Three frost goblins in the rocks above the pass."],
             "complete": ["The road is kept. Take this focus: ice from the summit that has not melted since the chain was forged.",
                          "Welcome to the Circle of the Long Night. Pell will sell you the cloak at a member's price, which is the same price, said more warmly."]},
        ],
        "done": ["You are of the Circle now. Halvard nods when you pass, which from him is a speech."]},
}

RULES = {   # the robelegs kind: armour on the legs that is a robe's skirt, not plate (kept in data/extra/rules.json too)
    "kinds": ["robelegs"], "slots": {"armour/robelegs": "legs"},
}

if __name__ == '__main__':
    for mod, key, new in (("items", "items", ITEMS), ("monsters", "monsters", MONSTERS), ("quests", "quests", QUESTS)):
        ep = os.path.join(EX, mod + '.json'); ex = load(ep) if os.path.exists(ep) else {key: {}}
        whole = mod != 'monsters'   # items and quests are this tool's own, replaced whole (a merge kept a goal a step no longer has); a monster is only amended
        if whole: ex.setdefault(key, {}).update(json.loads(json.dumps(new)))
        else: overlay(ex.setdefault(key, {}), json.loads(json.dumps(new)))
        with open(ep, 'w', encoding='utf-8') as f:
            json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp)
        if whole: live['data'][key].update(json.loads(json.dumps(new)))
        else: overlay(live['data'], {key: json.loads(json.dumps(new))})
        with open(lp, 'w', encoding='utf-8') as f:
            json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
        print('%s: %d added or updated' % (mod, len(new)))
    # shops and rules: live modules (and rules' extra, whose lists replace whole on a make_data rerun, so the armour list goes in full)
    sp = os.path.join(DD, 'shops.json'); S = load(sp); S['data']['shops'].update(SHOP); json.dump(S, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    for rp in (os.path.join(DD, 'rules.json'), os.path.join(EX, 'rules.json')):
        R = load(rp); D = R['data'] if 'data' in R else R
        base = load(os.path.join(DD, 'rules.json'))['data']['items']
        it = D.setdefault('items', {})
        arm = list(it.get('categories', {}).get('armour') or base['categories']['armour'])
        for k in RULES['kinds']:
            if k not in arm: arm.append(k)
        it.setdefault('categories', {})['armour'] = arm
        it.setdefault('slots', {}).update(RULES['slots'])
        if rp.startswith(DD + os.sep + 'rules'):
            json.dump(R, open(rp, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
        else:
            with open(rp, 'w', encoding='utf-8') as f:
                json.dump(R, f, indent=1, ensure_ascii=False); f.write('\n')
    # model parts: the robelegs part, the new items' colours
    for P0 in (ROBELEGS, ROBETOP, FOCUS, FOCUS_ICON):   # this tool's own parts (their item colours added below)
        old = load(os.path.join(PARTS, P0['id'] + '.json')) if os.path.exists(os.path.join(PARTS, P0['id'] + '.json')) else {}
        json.dump(dict(P0, items=dict(old.get('items', {}))), open(os.path.join(PARTS, P0['id'] + '.json'), 'w', encoding='utf-8'), indent=1)
    for pid, cols in COLOURS.items():
        pp = os.path.join(PARTS, pid + '.json'); P = load(pp)
        if all(P.get('items', {}).get(k) == v for k, v in cols.items()): continue   # already there: leave the file's own layout alone
        P.setdefault('items', {}).update(cols)
        with open(pp, 'w', encoding='utf-8') as f:
            json.dump(P, f, indent=1 if pid in ('gear.robe', 'gear.robelegs') else None, separators=None if pid in ('gear.robe', 'gear.robelegs') else (',', ':'), ensure_ascii=False)
    # the characters
    PART_CHARS = {
        "char.halvard": {"role": "npc", "name": "Archmage Halvard", "body": "humanoid", "build": "normal", "gear": {"weapon": "staff_t5", "body": "wizard_cloak", "legs": "wizard_cloak_bottoms"},
                         "outfit": {"skin": "#d8b090", "hair": "long", "hairColor": "#e8e8f0", "beard": "full", "beardColor": "#e8e8f0", "boots": "#1a1a2a", "belt": "#c8ccd8", "hat": {"style": "wizard", "color": "#2c3488"}}},
        "char.pell": {"role": "npc", "name": "Apprentice Pell", "body": "humanoid", "build": "slim", "outfit": {"skin": "#e8c098", "hair": "short", "hairColor": "#c87a3a",
                      "shirt": {"style": "robe", "color": "#4a5aa8"}, "pants": {"style": "robe", "color": "#4a5aa8"}, "boots": "#2a2a3a", "belt": "#8a7a5a"}},
    }
    for pid, body in PART_CHARS.items():
        with open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8') as f:
            json.dump(dict({"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": "char"}, **body), f, separators=(',', ':'), ensure_ascii=False)
    json.dump(LINES, open(os.path.join(HERE, 'tower_lines.json'), 'w'), indent=1)
    print('shop tower_magic, rules robelegs -> legs, parts:', ', '.join(list(PART_CHARS) + ['gear.robelegs']))
