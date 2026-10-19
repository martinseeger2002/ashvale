#!/usr/bin/env python3
"""make_pirate_quests.py - the quest lines of Saltmere's pirates (2026-10-19, the operator asked for them; spec in handoff/saltmere_pirates.md,
drafted with the local Qwen model and edited). The crew, their looks and lines are tools/saltmere/make_rugged.py's; this adds:

- four quests: The Captain's Cutlass (Ruark), Fish Stew Again (Grizz), Black Sails (Grix), The Admiral (Toby), each opening after one of
  Saltmere's own quests (so the crew's idle lines are heard until then - tests/core_test.js);
- two goal kinds in src/core.js: `pet` (pet a tame animal: {pet: 'admiral'}) and a Speechcraft check on a talk step ({talk: 'calder',
  speech: 15} - the NPC is only talked round at that level);
- items: the captain's cutlass (the quest's, its own look), a cutlass to wield (a curved blade, gear.cutlass), sea salt, tarred rope, sail
  canvas, pirate's stew (made at any fire: rules.items.fireMix) and the captain's tricorn as a hat (the cloth.hat_tricorn part);
- monsters: smugglers (level 12, two at the North Warehouse door, carrying the cutlass) and Admiral, a named tame tuxedo cat in the alleys;
- Sela's chandlery sells the canvas and the rope.
The crew take their quests here (data/zone.saltmere.json and CREW_QUESTS, which make_rugged.py reads when it rebuilds the crew).
    python3 tools/saltmere/make_pirate_quests.py      (then python3 build.py)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'castle'))
from make_castle_extras import overlay, load, DD, EX, PARTS   # noqa: E402

COLL = "ASHVALE The Pirates of Saltmere"
def item(name, cat, sub, weight, model, value, examine, attrs=(), extra=None):
    d = {"name": name, "description": examine, "examine": examine, "collection": COLL, "game": "ashvale", "category": cat, "subcategory": sub,
         "weight": weight, "model": model, "value": value, "attributes": [{"trait_type": k, "value": v} for k, v in attrs]}
    d.update(extra or {}); return d

ITEMS = {
    "captain_cutlass": item("Captain's cutlass", "resource", "curio", 1400, "item.captain_cutlass", 5,
        "Captain Ruark's lucky cutlass: a gilt basket hilt and a nick for every lie he has told. Take it back to him (The Captain's Cutlass)."),
    "cutlass": item("Cutlass", "weapon", "sword", 1500, "gear.cutlass", 600,
        "A pirate's cutlass, short and curved, from Captain Ruark. Attack +14, Strength +13. Needs Attack 15.",
        [("Attack", 14), ("Strength", 13), ("Speed", 4), ("Range", 1)], {"tier": 3, "req": {"attack": 15}}),
    "sea_salt": item("Sea salt", "resource", "curio", 100, "item.saltpouch", 4,
        "A twist of Nettie's sea salt. Grizz wants it for his stew (Fish Stew Again)."),
    "tarred_rope": item("Tarred rope", "resource", "curio", 600, "item.tarredrope", 12,
        "A coil of rope tarred against the sea. Bryce the shipwright stitches sails with it (Black Sails); Sela sells it."),
    "sail_canvas": item("Sail canvas", "resource", "curio", 1800, "item.canvas", 30,
        "A bolt of heavy sail canvas from Sela's chandlery. Enough for a mainsail (Black Sails)."),
    "pirate_stew": item("Pirate's stew", "food", "meat", 600, "item.stew", 40,
        "A bowl of Grizz's stew with real potatoes and onions in it. Heals 14. Made at a fire from 3 potatoes, 3 onions, sea salt and a shrimp.",
        [("Heal", 14)]),
    "hat_tricorn": item("Captain's tricorn", "cosmetic", "hat", 300, "cloth.hat_tricorn", 250,
        "Captain Ruark's spare tricorn, given for Black Sails. It makes you look like you own a ship, or at least a strong opinion about one."),
}
FIREMIX = {"take": {"potato": 3, "onion": 3, "sea_salt": 1, "shrimp": 1}, "give": {"pirate_stew": 1}, "xp": {"cooking": 1200},
           "say": "You simmer the potatoes, onions and shrimp with the sea salt into a pirate's stew. It smells like something other than fish."}
MONSTERS = {
    "smuggler": {"name": "Smuggler", "examine": "A warehouse smuggler: a long knife, a short temper and somebody else's cutlass.", "level": 12, "hp": 24, "att": 12,
                 "def": 10, "attb": 8, "defb": 9, "max": 4, "speed": 4, "aggro": 4, "respawn": 80,
                 "drops": [{"item": "captain_cutlass", "one_in": 2}, {"item": "bread", "one_in": 4}], "gold": 15, "anim": "stab", "look": "bandit",
                 "animal": False, "ownDice": True, "roam": 2},
}
SPAWNS = [{"m": "smuggler", "x": 468, "y": 76, "tag": "pirate_quests"}, {"m": "smuggler", "x": 472, "y": 76, "tag": "pirate_quests"}]   # at the North Warehouse door (monsters keep out of walk-in buildings)
ADMIRAL_AT = (485, 60)   # an alley behind the south quay
# the part colours: the cutlass (wielded), the captain's (an icon), the small things
PARTS_NEW = {
    "gear.cutlass": {"ashvale3d": "part", "api": 1, "v": 1, "id": "gear.cutlass", "kind": "gear", "slot": "weapon", "items": {"cutlass": "#c8ccd4"}, "attack": "slash",
                     "mount": {"j": "handR", "r": [2.1, 0, 0]}, "ground": {"p": [0, 0.04, 0], "r": [-1.5707963267948966, 0, 0]},
                     "shapes": [{"t": "box", "s": [0.045, 0.14, 0.045], "c": "#4a3020", "p": [0, -0.03, 0]},
                                {"t": "torus", "s": [0.06, 0.012], "c": "#b8a040", "p": [0.03, -0.04, 0], "r": [0, 1.5708, 0]},
                                {"t": "box", "s": [0.16, 0.035, 0.06], "c": "#b8a040", "p": [0, 0.06, 0]},
                                {"t": "box", "s": [0.07, 0.3, 0.02], "c": "$c", "p": [0.005, 0.23, 0], "r": [0, 0, -0.05]},
                                {"t": "box", "s": [0.075, 0.22, 0.02], "c": "$c", "p": [0.03, 0.47, 0], "r": [0, 0, -0.25]},
                                {"t": "cone", "s": [0.045, 0.1, 0.02], "c": "$c", "p": [0.075, 0.6, 0], "r": [0, 0, -0.5], "seg": 3}]},
    "item.captain_cutlass": {"ashvale3d": "part", "api": 1, "v": 1, "id": "item.captain_cutlass", "kind": "item", "items": {"captain_cutlass": "#d8dce4"},
                             "shapes": [{"t": "box", "s": [0.3, 0.012, 0.06], "c": "$c", "p": [0.1, 0.012, 0], "r": [0, 0.1, 0]},
                                        {"t": "box", "s": [0.2, 0.012, 0.065], "c": "$c", "p": [0.32, 0.012, 0.04], "r": [0, 0.35, 0]},
                                        {"t": "torus", "s": [0.06, 0.014], "c": "#e0c050", "p": [-0.08, 0.03, 0.02], "r": [1.5708, 0, 0]},
                                        {"t": "box", "s": [0.12, 0.03, 0.03], "c": "#5a2a1a", "p": [-0.12, 0.02, 0]},
                                        {"t": "sphere", "s": [0.018], "c": "#c83030", "p": [-0.06, 0.035, 0], "glow": True}]},
    "item.saltpouch": {"ashvale3d": "part", "api": 1, "v": 1, "id": "item.saltpouch", "kind": "item", "items": {"sea_salt": "#f0ece4"},
                       "shapes": [{"t": "cone", "s": [0.06, 0.12], "c": "#d8c8a8", "p": [0, 0.06, 0], "r": [3.1416, 0, 0]}, {"t": "sphere", "s": [0.045], "c": "$c", "p": [0, 0.12, 0], "k": [1, 0.5, 1]}]},
    "item.tarredrope": {"ashvale3d": "part", "api": 1, "v": 1, "id": "item.tarredrope", "kind": "item", "items": {"tarred_rope": "#3a2e22"},
                        "shapes": [{"t": "torus", "s": [0.08 - 0.012 * i, 0.016], "c": "$c", "p": [0, 0.016 + 0.03 * i, 0], "r": [1.5708, 0, 0]} for i in range(3)]},
    "item.canvas": {"ashvale3d": "part", "api": 1, "v": 1, "id": "item.canvas", "kind": "item", "items": {"sail_canvas": "#e8e0c8"},
                    "shapes": [{"t": "cyl", "s": [0.07, 0.07, 0.3], "c": "$c", "p": [0, 0.07, 0], "r": [0, 0, 1.5708], "seg": 10},
                               {"t": "cyl", "s": [0.072, 0.072, 0.02], "c": "#8a6a4a", "p": [0.1, 0.07, 0], "r": [0, 0, 1.5708], "seg": 10},
                               {"t": "cyl", "s": [0.072, 0.072, 0.02], "c": "#8a6a4a", "p": [-0.1, 0.07, 0], "r": [0, 0, 1.5708], "seg": 10}]},
    "item.stew": {"ashvale3d": "part", "api": 1, "v": 1, "id": "item.stew", "kind": "item", "items": {"pirate_stew": "#a8702a"},
                  "shapes": [{"t": "cyl", "s": [0.09, 0.06, 0.06], "c": "#6a4a2a", "p": [0, 0.03, 0], "seg": 10},
                             {"t": "cyl", "s": [0.082, 0.082, 0.01], "c": "$c", "p": [0, 0.058, 0], "seg": 10},
                             {"t": "sphere", "s": [0.02], "c": "#d8b060", "p": [0.03, 0.065, 0.01]}, {"t": "sphere", "s": [0.016], "c": "#e8d8a0", "p": [-0.03, 0.065, -0.02]}]},
}
COLOUR_INTO = {"cloth.hat_tricorn": {"hat_tricorn": "#1e1c1e"}}

def lines(*a): return list(a)
QUESTS = {
    "captains_cutlass": {"name": "The Captain's Cutlass", "giver": "ruark", "after": "rudder", "story": 3, "steps": [
        {"id": 1, "zone": "saltmere", "goal": {"talk": "tolly"}, "reward": "xp:speechcraft:200",
         "talk": lines("My lucky cutlass went over the side, or so Toby swears. Funny how a blade that sinks turns up for sale in a tavern.",
                       "Ask Tolly the dockhand. The tide brings everything to the third pier, the one with the bad plank."),
         "say": lines("The third pier? Nothing came ashore but weed and a boot, and the boot was mine.", "Ask at the Tap. Things that don't wash up get drunk instead."),
         "progress": lines("Ask Tolly the dockhand on the piers whether the tide brought a cutlass in."),
         "complete": lines("Nothing washed up. As I thought. Somebody walked it ashore.")},
        {"id": 2, "zone": "saltmere", "goal": {"talk": "hollis"}, "reward": "xp:speechcraft:200",
         "talk": lines("Try Hollis at the Tap. If a blade was sold for drink in this town, Hollis poured the drink.", "Be polite. He has a cudgel under the bar and a long memory."),
         "say": lines("A fancy cutlass? A man from the warehouses sold one for three rounds and a story. The story was better than the cutlass.",
                      "He went back to the North Warehouse. They all go back to the North Warehouse."),
         "progress": lines("Ask Hollis at the Saltmere Tap who sold a cutlass for drink."),
         "complete": lines("The North Warehouse. Smugglers. Of course it's smugglers. It's always smugglers in this harbour.")},
        {"id": 3, "zone": "saltmere", "goal": {"kill": "smuggler", "n": 2}, "reward": "xp:attack:600",
         "talk": lines("Two of them loiter at the North Warehouse door, by the sound of it, minding a crate. My cutlass will be on one of them.",
                       "Explain to them, firmly, whose it is."),
         "progress": lines("Deal with the two smugglers at the North Warehouse door and get the cutlass off them."),
         "complete": lines("Two smugglers fewer. If the cutlass isn't in your hand yet, it's on the cobbles by that warehouse.")},
        {"id": 4, "zone": "saltmere", "goal": {"bring": "captain_cutlass", "n": 1}, "reward": ["cutlass", "coins:300", "xp:attack:800"],
         "talk": lines("Now bring it here. Every nick in that blade is a story, and most of the stories are lies, but they're my lies.",
                       "The smugglers drop it as often as they hold it. Look about you."),
         "progress": lines("Bring Captain Ruark his cutlass. The smugglers at the North Warehouse have it."),
         "complete": lines("That's her. And I know Toby sold it; there's only one fool aboard who'd trade steel for a story.",
                           "I'm not angry. I'm impressed. Here - a cutlass of your own, and coin for your trouble. Don't sell it for drink.")}],
        "done": lines("Ruark tells the cutlass story differently every time. In the newest one, you are a sea serpent.")},
    "fish_stew_again": {"name": "Fish Stew Again", "giver": "grizz", "after": "empty_water", "story": 2, "steps": [
        {"id": 1, "zone": "saltmere", "goal": {"bring": "shrimp_raw", "n": 2}, "ends": "nettie", "reward": ["sea_salt", "xp:fishing:300"],
         "talk": lines("Forty days of fish stew. The crew are starting to look like fish. Soot has grown fins, I swear it.",
                       "First, salt. Nettie the fishmonger keeps a sea salt better than mine. She'll want fish for it, mind - two raw shrimp."),
         "progress": lines("Take two raw shrimp to Nettie the fishmonger for a twist of sea salt."),
         "complete": lines("Two shrimp for a twist of salt - fair trade. Tell Grizz it's for stew, not for preserving the crew.")},
        {"id": 2, "zone": "saltmere", "goal": {"bring": "pirate_stew", "n": 1}, "reward": ["coins:150", "xp:cooking:600", "xp:farming:600"],
         "talk": lines("Now the part that grew in the ground. Three potatoes, three onions - farm them, buy them, I won't ask.",
                       "Put them in a pot at any fire with the salt and a cooked shrimp, and bring me a pirate's stew. A stew. With things in it."),
         "progress": lines("At any fire, cook 3 potatoes, 3 onions, the sea salt and a cooked shrimp into a pirate's stew, and bring it to Grizz."),
         "complete": lines("Potatoes! Onions! Something that isn't fish! The crew will weep.",
                           "Soot says he saw a carrot in the sky this morning. I've stopped arguing with Soot.")}],
        "done": lines("Grizz makes the stew every Friday now. On the other days it's still fish.")},
    "black_sails": {"name": "Black Sails", "giver": "grix", "after": "sail_loft", "story": 3, "steps": [
        {"id": 1, "zone": "saltmere", "goal": {"talk": "sela"}, "reward": "xp:speechcraft:200",
         "talk": lines("The mainsail's torn and the captain won't sail with a patched sail. Canvas costs money. Money costs questions.",
                       "Get me canvas, no questions. Sela the chandler has canvas. Start there."),
         "say": lines("Canvas I have. Twine strong enough to hold a mainsail in a gale I haven't - that's tarred rope, and Bryce knows how to use it.",
                      "I'll sell you both. I won't ask what it's for, and you won't tell me it's for nets."),
         "progress": lines("Ask Sela the chandler about sail canvas."),
         "complete": lines("Sela has it. Good. She never asks questions she can't sell the answers to.")},
        {"id": 2, "zone": "saltmere", "goal": {"bring": "sail_canvas", "n": 1, "with": {"tarred_rope": 3}}, "ends": "bryce", "reward": "xp:speechcraft:300",
         "talk": lines("Buy a bolt of canvas and three coils of tarred rope from Sela, and take them to Bryce the shipwright.",
                       "He'll stitch it into a mainsail and row it out himself. He likes us. He thinks we're a fishing boat."),
         "progress": lines("Take a bolt of sail canvas and three tarred ropes to Bryce the shipwright."),
         "complete": lines("A mainsail? For a fishing boat? With a skull on it? ...I'll have it stitched by the tide and rowed out to her. Don't tell me any more.")},
        {"id": 3, "zone": "saltmere", "goal": {"talk": "calder", "speech": 15}, "reward": "xp:speechcraft:800",
         "talk": lines("Trouble. Mayor Calder has heard there's a pirate ship in his harbour.",
                       "Talk him out of it. You have the face for it. It's a fishing boat, Mayor, with ambitious sails. It needs a good tongue: Speechcraft 15 at least."),
         "progress": lines("Talk Mayor Calder out of the notion that there's a pirate ship in his harbour (Speechcraft 15)."),
         "complete": lines("A fishing boat. With ambitious sails. ...Very well. But if it fishes for anything that isn't fish, I'll hear of it.")},
        {"id": 4, "zone": "saltmere", "goal": {"talk": "grix"}, "reward": ["hat_tricorn", "coins:200"],
         "talk": lines("Come back and tell me it's done. I'll write it down as 'nets'.", "Everything gets written down as nets."),
         "progress": lines("Tell Quartermaster Grix the sail is stitched and the Mayor is quiet."),
         "complete": lines("Sail stitched, Mayor quiet, and not one question. 'Nets.' There.",
                           "The captain sends you his spare tricorn. He has six. He says a hat makes the sailor.")}],
        "done": lines("Grix's ledger lists four hundred nets. The ship has never carried a net.")},
    "the_admiral": {"name": "The Admiral", "giver": "toby", "after": "salt_road", "story": 1, "steps": [
        {"id": 1, "zone": "saltmere", "goal": {"pet": "admiral"}, "reward": "xp:dexterity:200",
         "talk": lines("There's a cat that sleeps in the rum store. I call her Admiral. She's gone off, and the quartermaster says that's one less mouth.",
                       "She'll be in the alleys behind the quay. Find her and give her a scratch - she comes back for a scratch."),
         "progress": lines("Find Admiral, a black and white cat, in Saltmere's alleys, and pet her."),
         "complete": lines("She purrs like a ship's bilge pump and follows you a step or two. Toby will want to know.")},
        {"id": 2, "zone": "saltmere", "goal": {"talk": "toby"}, "reward": ["coins:100", "xp:speechcraft:200"],
         "talk": lines("You found her? Go on, tell me where. No - don't, she'd hate that.", "Just tell me she's all right."),
         "progress": lines("Tell Toby the cabin boy that Admiral is safe."),
         "complete": lines("She'll come back to the rum barrels now she knows someone looked. Thanks. When I get my sword, you can hold it first.")}],
        "done": lines("Admiral sleeps on the rum barrels again. Grix has stopped counting her as a mouth.")},
}
CREW_QUESTS = {"ruark": ["captains_cutlass"], "grizz": ["fish_stew_again"], "grix": ["black_sails"], "toby": ["the_admiral"]}

if __name__ == '__main__':
    for mod, key, new in (("items", "items", ITEMS), ("monsters", "monsters", None), ("quests", "quests", QUESTS)):
        if new is None:
            M = load(os.path.join(DD, 'monsters.json'))['data']['monsters']; new = dict(MONSTERS)
            adm = dict(M['cat_tuxedo']); adm.update({"name": "Admiral", "examine": "Admiral: a black and white cat who sleeps in the pirates' rum store and outranks the cabin boy.",
                                                    "respawn": 60, "roam": 2}); new["admiral"] = adm
        ep = os.path.join(EX, mod + '.json'); ex = load(ep) if os.path.exists(ep) else {key: {}}
        ex.setdefault(key, {}).update(json.loads(json.dumps(new)))
        with open(ep, 'w', encoding='utf-8') as f: json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp); live['data'][key].update(json.loads(json.dumps(new)))
        with open(lp, 'w', encoding='utf-8') as f: json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
    # the stew at a fire, the chandler's stock
    for rp, pretty in ((os.path.join(DD, 'rules.json'), False), (os.path.join(EX, 'rules.json'), True)):
        R = load(rp); D = R.get('data', R); it = D.setdefault('items', {})
        base = load(os.path.join(DD, 'rules.json'))['data']['items']
        fm = [m for m in (it.get('fireMix') or base.get('fireMix') or []) if m.get('give') != FIREMIX['give']] + [FIREMIX]; it['fireMix'] = fm
        with open(rp, 'w', encoding='utf-8') as f:
            json.dump(R, f, indent=1 if pretty else None, separators=None if pretty else (',', ':'), ensure_ascii=False)
            if pretty: f.write('\n')
    sp = os.path.join(DD, 'shops.json'); S = load(sp)
    for i in ("sail_canvas", "tarred_rope"):
        if i not in S['data']['shops']['chandler']['stock']: S['data']['shops']['chandler']['stock'].append(i)
    json.dump(S, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    # Saltmere: the crew's quests, the smugglers, Admiral
    zp = os.path.join(DD, 'zone.saltmere.json'); Z = load(zp); zd = Z['data']
    for n in zd['npcs']:
        if n['id'] in CREW_QUESTS:
            n['quests'] = CREW_QUESTS[n['id']]; n['quest'] = CREW_QUESTS[n['id']][0]; n['talk'] = 'quest'
    zd['spawns'] = [s for s in zd.get('spawns', []) if s.get('tag') != 'pirate_quests'] + SPAWNS + [{"m": "admiral", "x": ADMIRAL_AT[0], "y": ADMIRAL_AT[1], "tag": "pirate_quests"}]
    json.dump(Z, open(zp, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    # parts
    for pid, P in PARTS_NEW.items():
        json.dump(P, open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    for pid, cols in COLOUR_INTO.items():
        pp = os.path.join(PARTS, pid + '.json'); P = load(pp); P.setdefault('items', {}).update(cols)
        json.dump(P, open(pp, 'w', encoding='utf-8'), separators=(',', ':'))
    print('pirates: %d items, %d quests, smugglers %d + Admiral, %d parts' % (len(ITEMS), len(QUESTS), len(SPAWNS), len(PARTS_NEW)))
