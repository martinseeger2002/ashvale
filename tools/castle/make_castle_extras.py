#!/usr/bin/env python3
"""make_castle_extras.py - the Lake Castle's farm, mill and chapel folk, their livestock and their quest line
(2026-10-17, the operator: "add characters quest line, a farmer outside with sheep cows, a granary outside with a wind
mill, make the church look like other churches, add market stalls in the court yard").

Writes the hand-made additions into data/extra/ (so tools/make_data.py keeps them on a rerun) and merges them into the
live modules (data/items.json, data/monsters.json, data/quests.json) the same way make_data's overlay() does, plus the
character parts in data/parts/. The places themselves (pens, mill, granary, stalls, spawns, NPC positions) are laid by
tools/castle/make_castle.js, which reads nothing from here but the ids.
    python3 tools/castle/make_castle_extras.py      (then node tools/castle/make_castle.js; python3 build.py)
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DD, EX, PARTS = os.path.join(ROOT, 'data'), os.path.join(ROOT, 'data', 'extra'), os.path.join(ROOT, 'data', 'parts')


def load(p):
    return json.load(open(p, encoding='utf-8'))


def overlay(base, extra):   # tools/make_data.py overlay(): dicts merge, lists of {id} merge by id, the rest is replaced
    if isinstance(base, dict) and isinstance(extra, dict):
        for k, v in extra.items():
            base[k] = overlay(base[k], v) if k in base else v
        return base
    if isinstance(base, list) and isinstance(extra, list) and extra and all(isinstance(x, dict) and 'id' in x for x in base + extra):
        at = {x['id']: i for i, x in enumerate(base)}
        for x in extra:
            if x['id'] in at:
                base[at[x['id']]] = overlay(base[at[x['id']]], x)
            else:
                base.append(x)
        return base
    return extra


def item(name, desc, cat, sub, weight, model, value, attrs=()):
    return {"name": name, "description": desc + " Made in the valley of Ashvale.", "collection": "ASHVALE Items", "game": "ashvale",
            "category": cat, "subcategory": sub, "weight": weight, "model": model, "value": value, "attributes": list(attrs)}


def raw(name, cooks, burns, req, xp):
    return [{"trait_type": "Cooks into", "value": cooks}, {"trait_type": "Burns into", "value": burns},
            {"trait_type": "Cooking level", "value": req}, {"trait_type": "Cooking XP", "value": xp}]


ITEMS = {
    "mutton_raw": item("Raw mutton", "Raw mutton, resource meat. Cooking level 6, Cooking XP 40.", "resource", "meat", 700, "item.chicken", 5, raw("Raw mutton", "mutton_cooked", "mutton_burnt", 6, 40)),
    "mutton_cooked": item("Roast mutton", "Roast mutton, food meat. Heal 5.", "food", "meat", 700, "item.chicken", 11, [{"trait_type": "Heal", "value": 5}]),
    "mutton_burnt": item("Burnt mutton", "Burnt mutton, resource meat.", "resource", "meat", 700, "item.chicken", 0),
    "beef_raw": item("Raw beef", "Raw beef, resource meat. Cooking level 10, Cooking XP 55.", "resource", "meat", 900, "item.chicken", 7, raw("Raw beef", "beef_cooked", "beef_burnt", 10, 55)),
    "beef_cooked": item("Roast beef", "Roast beef, food meat. Heal 7.", "food", "meat", 900, "item.chicken", 15, [{"trait_type": "Heal", "value": 7}]),
    "beef_burnt": item("Burnt beef", "Burnt beef, resource meat.", "resource", "meat", 900, "item.chicken", 0),
    "wool": item("Wool", "Wool, resource fleece.", "resource", "pelt", 300, "item.pelt", 6),
    "cowhide": item("Cowhide", "Cowhide, resource pelt.", "resource", "pelt", 1200, "item.pelt", 16),
}

MONSTERS = {   # the farm's stock: animals like the goat - they wander their pen, run when hit, never start a fight
    # the granary's rats: Whisperwood's giant rat with dice of its own (ownDice), so six more of them do not shift the world's shared
    # dice - plain rats there made the chained dragon miss every swing and Keel stop dropping arrows in the tests
    "granary_rat": {"name": "Granary rat", "level": 2, "hp": 5, "att": 1, "def": 1, "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 50,
                    "drops": [{"item": "rat_meat_raw", "one_in": 1}, {"item": "rat_pelt", "one_in": 1}], "gold": 0, "anim": "bite", "look": "rat", "ownDice": True, "roam": 3, "roamEvery": 3},
    "sheep": {"name": "Sheep", "level": 2, "hp": 6, "att": 1, "def": 2, "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 60,
              "drops": [{"item": "mutton_raw", "one_in": 1}, {"item": "wool", "one_in": 1}], "gold": 0, "anim": "bite", "look": "sheep",
              "animal": True, "shy": 3, "ownDice": True, "roam": 3, "fleeHit": True, "roamEvery": 4},
    "cow": {"name": "Cow", "level": 4, "hp": 12, "att": 2, "def": 3, "attb": 0, "defb": 0, "max": 1, "speed": 4, "aggro": 0, "respawn": 60,
            "drops": [{"item": "beef_raw", "one_in": 1}, {"item": "cowhide", "one_in": 1}, {"item": "bones", "one_in": 1}], "gold": 0, "anim": "bite", "look": "cow",
            "animal": True, "shy": 2, "ownDice": True, "roam": 3, "fleeHit": True, "roamEvery": 5},
}

PART_CHARS = {
    "char.sheep": {"role": "monster", "name": "Sheep", "body": "beast", "beast": {"size": 0.85, "legLen": 0.8, "color": "#ece6d8", "snout": "#3a3430", "tail": "#e4ddcd", "tailLen": 0.08, "mane": True, "ears": "#3a3430", "eyes": "#1a1612"}},
    "char.cow": {"role": "monster", "name": "Cow", "body": "beast", "beast": {"size": 1.35, "legLen": 1.0, "color": "#7a4a2a", "snout": "#d8c8b0", "tail": "#5a3420", "tailLen": 0.32, "tailTip": "#2a1a10", "horns": "#e0d8c0", "ears": "#6a3e22", "eyes": "#1a1612"}},
    "char.tobin": {"role": "npc", "name": "Farmer Tobin", "body": "humanoid", "build": "big", "outfit": {"skin": "#d09a6a", "hair": "short", "hairColor": "#6a4a2a", "beard": "full", "beardColor": "#6a4a2a", "shirt": {"style": "tunic", "color": "#8a7a4a"}, "pants": {"style": "trousers", "color": "#4a3a2a"}, "boots": "#3a2a1a", "belt": "#5a3c22", "hat": {"style": "cap", "color": "#c8a860"}}},
    "char.edda": {"role": "npc", "name": "Miller Edda", "body": "humanoid", "build": "normal", "outfit": {"skin": "#e0b088", "hair": "bun", "hairColor": "#b8b0a0", "shirt": {"style": "shirt", "color": "#c8c0b0"}, "pants": {"style": "skirt", "color": "#8a7a6a"}, "boots": "#4a3a2a", "belt": "#e8e0d0"}},
    "char.aldith": {"role": "npc", "name": "Sister Aldith", "body": "humanoid", "build": "slim", "outfit": {"skin": "#e4b894", "hair": "long", "hairColor": "#4a4a50", "shirt": {"style": "robe", "color": "#3e4a5a"}, "pants": {"style": "robe", "color": "#3e4a5a"}, "boots": "#2a2a2a", "belt": "#c8b070", "hat": {"style": "hood", "color": "#2e3a4a"}}},
    "char.king_osric": {"role": "npc", "name": "King Osric", "body": "humanoid", "build": "big", "outfit": {"skin": "#d8a878", "hair": "short", "hairColor": "#b8b0a0", "beard": "full", "beardColor": "#b8b0a0", "shirt": {"style": "robe", "color": "#5a1a2a"}, "pants": {"style": "robe", "color": "#5a1a2a"}, "boots": "#2a2018", "belt": "#c8a040", "hat": {"style": "crown", "color": "#d4af37"}, "cape": "#7a1f24"}},
    "char.queen_maelis": {"role": "npc", "name": "Queen Maelis", "body": "humanoid", "build": "slim", "outfit": {"skin": "#e4b894", "hair": "long", "hairColor": "#3a2418", "shirt": {"style": "robe", "color": "#1f3a6a"}, "pants": {"style": "robe", "color": "#1f3a6a"}, "boots": "#2a2018", "belt": "#c8a040", "hat": {"style": "crown", "color": "#d4af37"}, "cape": "#2a4a7a"}},
    "char.prince_edric": {"role": "npc", "name": "Prince Edric", "body": "humanoid", "build": "normal", "outfit": {"skin": "#e0b088", "hair": "curly", "hairColor": "#3a2418", "shirt": {"style": "tunic", "color": "#2f5a3a"}, "pants": {"style": "trousers", "color": "#3a3a2a"}, "boots": "#3a2a1a", "belt": "#c8a040", "hat": {"style": "crown", "color": "#d4af37"}, "cape": "#2f5a3a"}},
    "char.princess_liane": {"role": "npc", "name": "Princess Liane", "body": "humanoid", "build": "slim", "outfit": {"skin": "#e8c0a0", "hair": "braids", "hairColor": "#a86a3a", "shirt": {"style": "shirt", "color": "#6a3a7a"}, "pants": {"style": "skirt", "color": "#4a2a5a"}, "boots": "#3a2a1a", "belt": "#c8a040", "hat": {"style": "crown", "color": "#d4af37"}}},
    "char.steward_harlan": {"role": "npc", "name": "Steward Harlan", "body": "humanoid", "build": "normal", "outfit": {"skin": "#d8a878", "hair": "bald", "hairColor": "#6a6a6a", "beard": "goatee", "beardColor": "#6a6a6a", "shirt": {"style": "vest", "color": "#3a3a4a"}, "pants": {"style": "trousers", "color": "#2a2a3a"}, "boots": "#1a1a1a", "belt": "#7a6a3f"}},
    "char.cressa": {"role": "npc", "name": "Cressa the trader", "body": "humanoid", "build": "normal", "outfit": {"skin": "#c89068", "hair": "long", "hairColor": "#2a1a10", "shirt": {"style": "vest", "color": "#7a3a3a"}, "pants": {"style": "skirt", "color": "#4a3a5a"}, "boots": "#3a2a1a", "belt": "#c8a040"}},
}

# the quest line: one giver each, each opens after the one before ('after'), every step in the castle's own world
QUESTS = {
    "rats_in_the_grain": {
        "name": "Rats in the Grain", "giver": "edda", "story": 1,
        "steps": [
            {"id": 1, "zone": "castle", "goal": {"kill": "granary_rat", "n": 6}, "reward": "xp:strength:400",
             "talk": ["You'll be from the road, then. Good. Everyone from the castle is too busy being a castle.",
                      "The granary by my mill has rats. Not a rat - rats, the sort that hold meetings. Six of them, at least, and every one eating the garrison's flour.",
                      "They work the yard round it, in the sacks waiting to go in. Thin them out. Mind the sacks; the sacks are the point."],
             "progress": ["Still squeaking round the granary. I can hear them from the mill."],
             "complete": ["Quiet. I'd forgotten the granary could be quiet.", "Now the flour's only half spoiled, which in a castle counts as clean."]},
            {"id": 2, "zone": "castle", "goal": {"talk": "castle_cook"}, "reward": "xp:cooking:350",
             "talk": ["Marta in the castle kitchens has been baking with whatever the rats left her.",
                      "Go and tell her the granary is clear and the next sacks will be whole. She'll want to hear it from someone who saw it."],
             "progress": ["Marta's in the kitchens, in the bailey. Follow the smell of bread that isn't as good as it should be."],
             "complete": ["She said 'about time', did she? That's Marta for 'thank you'.", "Here - that's for the walking. Come back if Tobin wants a hand; he always wants a hand."]},
        ],
        "done": ["The sails turn and the sacks stay whole. A mill can't ask for more."]},
    "the_far_field": {
        "name": "The Far Field", "giver": "tobin", "after": "rats_in_the_grain", "story": 2,
        "steps": [
            {"id": 1, "zone": "whisperwood", "goal": {"kill": "wolf", "n": 5}, "reward": "xp:attack:500",
             "talk": ["Edda says you're useful. Edda doesn't say that about the weather.",
                      "Grey wolves come down out of Whisperwood and take my lambs off the road at dusk. I've counted three gone this month.",
                      "Five wolves fewer and the rest will learn the road's not theirs. That's how wolves learn."],
             "progress": ["Still lost one last night. They're in Whisperwood, north of Ashvale."],
             "complete": ["Five. The ewes stood about the fold all morning like they'd heard."]},
            {"id": 2, "zone": "castle", "goal": {"bring": "logs", "n": 6}, "reward": "xp:woodcutting:450",
             "talk": ["Now the fences. The cows lean on them, the sheep go under them, and I mend them, every day.",
                      "Six logs - plain wood, nothing fancy - and I'll have the pens tight before the frost."],
             "progress": ["Six logs. There's wood all along the road if you've an axe."],
             "complete": ["That'll hold them. Until it doesn't, and then I'll be fencing again.", "Sister Aldith up at the chapel was asking after someone who'll walk a long way. That's you now."]},
        ],
        "done": ["Sheep in, cows in, wolves out. Some days a farm does what it's told."]},
    "vespers": {
        "name": "Vespers", "giver": "aldith", "after": "the_far_field", "story": 3,
        "steps": [
            {"id": 1, "zone": "village", "goal": {"talk": "aldous"}, "reward": "xp:prayer:300",
             "talk": ["The chapel has stood empty since the last chaplain left, and now it has me, which is better than nothing and not by much.",
                      "Father Aldous in Ashvale kept the old order of evening prayer. I'd like his blessing before I ring the bell.",
                      "Take him this letter. Down the road, over the bridge, past the lamps."],
             "progress": ["Father Aldous keeps the church in Ashvale, by the square."],
             "complete": ["He sent his blessing and a list of everything I'm doing wrong. That is how I know he means it."]},
            {"id": 2, "zone": "castle", "goal": {"bring": "mutton_cooked", "n": 3}, "reward": "xp:prayer:450",
             "talk": ["After vespers the poor come to the gate - drovers, a few old soldiers, Tobin's boy when his father isn't looking.",
                      "Bring me three roast mutton. Tobin's sheep give the meat; the castle's fires will cook it, if you watch them."],
             "progress": ["Three roast mutton. Raw won't do, and burnt won't do either - I've tried both on them."],
             "complete": ["Three. That's supper for the gate and a reason to come back to the chapel.", "The castellan has been asking who brought the bell back. You'd better go and tell him."]},
        ],
        "done": ["The bell rings at dusk now. The watch say it makes the walls feel shorter."]},
    # the royal court's errands (2026-10-17, the operator: "royal npcs walking around all with place holder quests we can use to expand
    # out ward into the world"): each sends the player out to another part of the valley and back, for the next quests to build on
    "kings_seal": {
        "name": "The King's Seal", "giver": "king_osric", "after": "castellans_bridge", "story": 2,
        "steps": [
            {"id": 1, "zone": "saltmere", "goal": {"talk": "calder"}, "reward": "xp:speechcraft:400",
             "talk": ["The castellan tells me the road is lit and the bridge is held. Then it is time the castle had friends at the end of it.",
                      "Take my seal to Mayor Calder in Saltmere. A castle with a harbour for a friend is a castle with a future."],
             "progress": ["Mayor Calder keeps the town hall in Saltmere, past the docks."],
             "complete": ["He took the seal and kept it. That is as good as a yes from a mayor."]},
            {"id": 2, "zone": "ziibiing", "goal": {"talk": "nookomis"}, "reward": "xp:speechcraft:600",
             "talk": ["Now the people of Ziibiing, on the river far to the west. They were here before the castle and they will be here after it.",
                      "Go to Nookomis. Do not take the seal - take my word, and listen to hers."],
             "progress": ["Ziibiing is a long road. Nookomis will be by the fire, or the river, or wherever she likes."],
             "complete": ["She said we may visit, if we come to learn. I think that is the best treaty I will ever sign."]},
        ],
        "done": ["The seal is in Saltmere and my word is in Ziibiing. The valley is larger than it was this morning."]},
    "lodge_gifts": {
        "name": "Gifts for the Lodges", "giver": "queen_maelis", "story": 2,
        "steps": [
            {"id": 1, "zone": "lodges", "goal": {"talk": "mishoomis"}, "reward": "xp:speechcraft:350",
             "talk": ["The king sends seals. I prefer to send someone who will sit down and ask what is wanted.",
                      "Go to the lodges by Ziibiing and ask Mishoomis what a gift from the castle ought to be. Then come back and tell me before the king guesses."],
             "progress": ["The lodges are beside Ziibiing. Mishoomis is the one people go to first."],
             "complete": ["Hides, he said, good ones, for the winter. Sensible. The king would have sent silver spoons."]},
            {"id": 2, "zone": "castle", "goal": {"bring": "deer_hide", "n": 3}, "reward": "xp:ranged:500",
             "talk": ["Three deer hides, then. The deer keep to the open woods; a bow helps, patience helps more.", "Bring them to me, not the king. He will want to add a letter, and the letter will be about himself."],
             "progress": ["Three deer hides. Not goat, not boar - the lodges will know the difference, and so will I."],
             "complete": ["These will go west with the next drover. A gift that is wanted is worth ten that are admired."]},
        ],
        "done": ["The hides went west. A letter came back, and the king was not allowed to read it first."]},
    "princes_hunt": {
        "name": "The Prince's Hunt", "giver": "prince_edric", "story": 2,
        "steps": [
            {"id": 1, "zone": "wolfden", "goal": {"kill": "timber_wolf", "n": 4}, "reward": "xp:attack:700",
             "talk": ["My father says a prince does not go wolf hunting. My father says a great many things.",
                      "There is a den of timber wolves north of Ashvale - real wolves, not Whisperwood's greys. Four of them. Then tell me how it went, in detail."],
             "progress": ["The Timber Wolf Den is north of Ashvale, past the dragon road. Bring a bigger weapon than you think."],
             "complete": ["Four! And you came back with all your fingers. I am going to tell everyone it was my idea."]},
            {"id": 2, "zone": "castle", "goal": {"bring": "timber_wolf_pelt", "n": 2}, "reward": "xp:strength:500",
             "talk": ["Two pelts, for a cloak. If I cannot hunt, I can at least look as though I did.", "The tailor in Ashvale can sew it, if Mother asks her. Mother will ask; she likes a story as much as I do."],
             "progress": ["Two timber wolf pelts. The greys' pelts are too thin; a prince has standards."],
             "complete": ["Look at that. Nobody will believe a word of it, and that is the best part."]},
        ],
        "done": ["The cloak is finished. He wears it to dinner. The king pretends not to notice."]},
    "even_ground_visit": {
        "name": "The Even Ground", "giver": "princess_liane", "story": 1,
        "steps": [
            {"id": 1, "zone": "evengrove", "goal": {"talk": "vael"}, "reward": "xp:magic:350",
             "talk": ["Every map in the keep has a blank where the Even Ground should be. Somebody drew it once and somebody else scraped it off.",
                      "Go and see it for me. There is someone there called Vael. Ask what the blank is for."],
             "progress": ["The Even Ground is east of Ashvale, through the woods. Mind where you step; the maps did."],
             "complete": ["Vael said it is kept blank on purpose. That is the most interesting thing anyone has said to me all year."]},
            {"id": 2, "zone": "dragonapproach", "goal": {"talk": "squire_elian"}, "reward": "xp:defence:350",
             "talk": ["One more blank: the dragon road. The squire who keeps it writes to nobody, which is suspicious in a squire.",
                      "Go and say the castle asks after him. Then come and tell me everything he did not say."],
             "progress": ["Squire Elian keeps the dragon road, north of the village. He will be standing as though he is guarding something."],
             "complete": ["He asked for nothing and said less. I shall draw him on the map as a very small question mark."]},
        ],
        "done": ["Two blanks fewer. She has started a new map, and it has room at the edges."]},
    "realm_accounts": {
        "name": "Accounts of the Realm", "giver": "steward_harlan", "story": 1,
        "steps": [
            {"id": 1, "zone": "village", "goal": {"talk": "odric"}, "reward": "xp:speechcraft:300",
             "talk": ["A castle runs on bread, iron and accounts, and I am short of accounts.",
                      "Odric the merchant passes through Ashvale. Ask him what goods move on the road and what they fetch. Write nothing down; merchants lie less to people who are not writing."],
             "progress": ["Odric trades in Ashvale. He will have a wagon, or a story about where it went."],
             "complete": ["Salt, hides and gossip, and the gossip sells best. Noted."]},
            {"id": 2, "zone": "saltmere", "goal": {"talk": "hollis"}, "reward": "xp:speechcraft:400",
             "talk": ["Now Hollis at the Saltmere tap. Every price in the valley is argued about in a tavern before it is agreed anywhere else.", "Ask him what a barrel of salt fish fetches this month, and what it fetched last. The difference is the news."],
             "progress": ["Hollis keeps the Tap in Saltmere. Buy something; it loosens the numbers."],
             "complete": ["Excellent. Now I know what everything costs, and I can complain about it properly."]},
        ],
        "done": ["The ledgers balance, for once. He has asked to be left alone with them."]},
    "castellans_bridge": {
        "name": "The Castellan's Bridge", "giver": "castellan", "after": "vespers", "story": 4,
        "steps": [
            {"id": 1, "zone": "whisperwood", "goal": {"kill": "bandit", "n": 6}, "reward": "xp:defence:600",
             "talk": ["So you're the one the mill, the farm and the chapel all talk about. Three people agreeing is rare here; I'll take it.",
                      "Travellers stop coming when bandits work the road out of Whisperwood. No travellers, no market, no castle worth the name.",
                      "Six bandits. Then the road is ours again, and so is the bridge."],
             "progress": ["The bandits work the woods north of Ashvale. The road won't be safe till they're fewer."],
             "complete": ["Six. The drovers will hear of it before I've finished saying it."]},
            {"id": 2, "zone": "castle", "goal": {"talk": "gate_guard"}, "reward": "shield_t2",
             "talk": ["Go to the gate guard and tell him the bridge is to be lit every night from now on, torches at both ends and on the crest.",
                      "He'll grumble. He grumbles at the portcullis too, and it still opens."],
             "progress": ["The gate guard is at the barbican, leaning on the spear he says he doesn't need."],
             "complete": ["He grumbled, then he lit them. That's the whole of soldiering.", "Take the shield. It has the castle's mark, and the watch will know you by it."]},
        ],
        "done": ["The road is lit, the bridge is held, and the market comes in the morning. That's a castle."]},
}

# --- extras (kept across make_data reruns) and the live modules
for mod, key, new in (("items", "items", ITEMS), ("monsters", "monsters", MONSTERS), ("quests", "quests", QUESTS)):
    ep = os.path.join(EX, mod + '.json')
    ex = load(ep) if os.path.exists(ep) else {key: {}}
    ex.setdefault(key, {}).update(new)
    with open(ep, 'w', encoding='utf-8') as f:
        json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
    lp = os.path.join(DD, mod + '.json'); live = load(lp)
    overlay(live['data'], {key: new})
    with open(lp, 'w', encoding='utf-8') as f:
        json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
    print('%s: %d added or updated' % (mod, len(new)))
for pid, body in PART_CHARS.items():
    part = dict({"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": "char"}, **body)
    with open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8') as f:
        json.dump(part, f, separators=(',', ':'), ensure_ascii=False)
print('parts:', ', '.join(PART_CHARS))
