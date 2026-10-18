#!/usr/bin/env python3
"""make_mountain_extras.py - the great mountain's people, monsters and quests (2026-10-18). The quest lines were drafted by the local
Qwen model from a spec of goals written here, then rewritten by hand (riddles kept riddles, every line spoken by its giver).

Writes data/extra/ (kept across tools/make_data.py reruns) and merges into data/items.json, data/monsters.json, data/quests.json the
way make_data's overlay() does; character parts go to data/parts/. Places and spawns: tools/mountain/make_camps.js.
    python3 tools/mountain/make_mountain_extras.py
"""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'castle'))
from make_castle_extras import overlay, load, DD, EX, PARTS   # noqa: E402 (the castle tool's merge, reused)

MONSTERS = {   # the mountain's own: Whisperwood's kinds made for the heights, each with dice of its own (ownDice) so they leave the world's
    # shared dice where every other fight expects them (six plain rats once made the chained dragon miss for 400 ticks in the tests)
    "crag_wolf": {"name": "Crag wolf", "level": 16, "hp": 32, "att": 15, "def": 12, "attb": 8, "defb": 6, "max": 5, "speed": 4, "aggro": 6, "respawn": 70,
                  "drops": [{"item": "timber_wolf_pelt", "one_in": 1}, {"item": "bones", "one_in": 1}], "gold": 0, "anim": "bite", "look": "timber_wolf", "ownDice": True, "roam": 4},
    "pass_bandit": {"name": "Pass bandit", "level": 18, "hp": 34, "att": 16, "def": 14, "attb": 10, "defb": 12, "max": 5, "speed": 4, "aggro": 5, "respawn": 90,
                    "drops": [{"item": "bones", "one_in": 1}, {"item": "sword_t2", "one_in": 4}, {"item": "bread", "one_in": 3}], "gold": 30, "anim": "slash", "look": "bandit", "ownDice": True, "roam": 3},
    "frost_goblin": {"name": "Frost goblin", "level": 15, "hp": 28, "att": 14, "def": 11, "attb": 8, "defb": 8, "max": 4, "speed": 4, "aggro": 4, "respawn": 75,
                     "drops": [{"item": "bones", "one_in": 1}, {"item": "sword_t1", "one_in": 3}], "gold": 15, "anim": "slash", "look": "goblin", "ownDice": True, "roam": 3},
}

PART_CHARS = {
    "char.orla": {"role": "npc", "name": "Orla the hunter", "body": "humanoid", "build": "slim", "gear": {"weapon": "bow_t2"}, "outfit": {"skin": "#d8a878", "hair": "braids", "hairColor": "#6a3a1a", "shirt": {"style": "tunic", "color": "#5a6a3a"}, "pants": {"style": "trousers", "color": "#3a3a2a"}, "boots": "#3a2a1a", "belt": "#7a5a2a", "hat": {"style": "hood", "color": "#4a5a32"}}},
    "char.wyn": {"role": "npc", "name": "Keeper Wyn", "body": "humanoid", "build": "normal", "outfit": {"skin": "#c8a080", "hair": "long", "hairColor": "#d8d4cc", "beard": "full", "beardColor": "#d8d4cc", "shirt": {"style": "robe", "color": "#6a6458"}, "pants": {"style": "robe", "color": "#6a6458"}, "boots": "#2a2420", "belt": "#9a8a6a"}},
    "char.aled": {"role": "npc", "name": "Aled the hermit", "body": "humanoid", "build": "small", "outfit": {"skin": "#d0a078", "hair": "bald", "hairColor": "#cccccc", "beard": "full", "beardColor": "#e8e8e8", "shirt": {"style": "robe", "color": "#5a4a3a"}, "pants": {"style": "robe", "color": "#5a4a3a"}, "boots": "#2a2018", "belt": "#3a2a1a"}},
    "char.bryn": {"role": "npc", "name": "Warden Bryn", "body": "humanoid", "build": "big", "gear": {"weapon": "longsword_t2", "shield": "shield_t2", "head": "helmet_t2"}, "outfit": {"skin": "#c89068", "hair": "short", "hairColor": "#2a1a10", "beard": "stubble", "beardColor": "#2a1a10", "shirt": {"style": "vest", "color": "#3a3a4a"}, "pants": {"style": "trousers", "color": "#2a2a30"}, "boots": "#1a1a1a", "belt": "#5a4a2a", "cape": "#4a2a2a"}},
    "char.tamsin": {"role": "npc", "name": "Tamsin the scout", "body": "humanoid", "build": "slim", "outfit": {"skin": "#e0b088", "hair": "short", "hairColor": "#a8642a", "shirt": {"style": "tunic", "color": "#3a5a6a"}, "pants": {"style": "trousers", "color": "#2a3a3a"}, "boots": "#3a2a1a", "belt": "#7a5a2a", "hat": {"style": "cap", "color": "#2a4a5a"}}},
}

QUESTS = {
    "flask_for_the_hermit": {
        "name": "A Flask for the Hermit", "giver": "orla", "story": 1,
        "steps": [
            {"id": 1, "zone": "mt_ledge", "goal": {"talk": "aled"}, "reward": "xp:speechcraft:250",
             "talk": ["There's an old man on the west ledge, up the safe road, who will not come down and will not starve either, if I can help it.",
                      "Take him this flask of broth while it's hot. Stay on the road; the mountain is generous with ways to fall off it.",
                      "Then come back and tell me he drank it, not that he said he would."],
             "progress": ["Aled's ledge is up the safe road, past the shrine, round the west shoulder. Bring me back his thanks."],
             "complete": ["He drank it? All of it? Then he'll live till spring out of sheer stubbornness.", "That's one errand off my list and three more on it. Welcome to the lodge."]},
        ],
        "done": ["The broth goes up every week now. Aled says it is too salty, which means he likes it."]},
    "wolves_on_the_climb": {
        "name": "Wolves on the Climb", "giver": "orla", "after": "flask_for_the_hermit", "story": 2,
        "steps": [
            {"id": 1, "zone": "mt_crags", "goal": {"kill": "crag_wolf", "n": 4}, "reward": "xp:attack:600",
             "talk": ["Crag wolves have come down the east face, bolder than they ought to be, and they've had two of my snares and one of my dogs.",
                      "The warden keeps folk off that climb for good reason. You're not folk, apparently. Four of them, on the crags."],
             "progress": ["The crags are up the dangerous climb from Warden Bryn's post. They hunt in pairs; don't let them pick the ground."],
             "complete": ["Four. The dogs will sleep tonight and so will I."]},
            {"id": 2, "zone": "mt_lodge", "goal": {"bring": "timber_wolf_pelt", "n": 2}, "reward": "xp:ranged:400",
             "talk": ["Now the pelts, two of them. A winter on this mountain is a long thing to do without fur.",
                      "Wolf from the crags or from the den north of Ashvale, I'm not fussy. The cold isn't either."],
             "progress": ["Two timber wolf pelts. The crag wolves drop them, and so do the ones north of the village."],
             "complete": ["Good thick ones. I'll have a coat by the first snow and a story to tell about it."]},
        ],
        "done": ["The lodge has a new rug and fewer visitors with teeth."]},
    "three_stones": {
        "name": "The Three Stones", "giver": "wyn", "story": 2,
        "steps": [
            {"id": 1, "zone": "mt_shrine", "goal": {"bring": "wool", "n": 1, "with": {"logs": 1, "bones": 1}}, "reward": "xp:prayer:400",
             "talk": ["The stones do not speak to the impatient, so sit, or stand still at least, which is nearly the same.",
                      "Bring them three gifts: one that kept a beast warm, one that once stood taller than you, and one that is all that remains.",
                      "Lay them before me together. The stones dislike being visited in instalments."],
             "progress": ["What kept a beast warm, what once stood tall, what remains. All three at once. Tobin's sheep below the castle wear the first."],
             "complete": ["The sheep's coat, the fallen tree, the last of a life. Yes. Listen - the stones are pleased, in their slow way."]},
            {"id": 2, "zone": "mt_shrine", "goal": {"bring": "copper_ore", "n": 1, "with": {"tin_ore": 1}}, "reward": "xp:mining:400",
             "talk": ["A second riddle, since the first did not frighten you. Bring me two that are weak apart and strong together.",
                      "Smiths know them. Soldiers owe their lives to them. Neither one would say thank you to the other."],
             "progress": ["Two that are weak apart and strong together. Ask a smith, if you must. Smiths love to be asked."],
             "complete": ["Copper and tin, and between them, bronze. You think in metals now. The mountain approves of that."]},
        ],
        "done": ["The stones hum when you pass. Wyn says it is gratitude; the hermit says it is wind."]},
    "echo_riddle": {
        "name": "The Echo's Question", "giver": "aled", "story": 1,
        "steps": [
            {"id": 1, "zone": "mt_ledge", "goal": {"bring": "tinderbox", "n": 1}, "reward": "xp:magic:300",
             "talk": ["The echoes up here have been asking me a riddle for thirty years, and I am tired of being the only one who answers.",
                      "I sleep in a pocket and wake with a scrape. I hold a fire I never feel. Bring me one of me.",
                      "One, mind. The echoes count, and they are pettier than I am."],
             "progress": ["Sleeps in a pocket, wakes with a scrape, holds a fire it never feels. Any shop in the valley sells the answer."],
             "complete": ["A tinderbox. The echoes say it was too easy. The echoes always say that."]},
            {"id": 2, "zone": "mt_shrine", "goal": {"talk": "wyn"}, "reward": "xp:speechcraft:300",
             "talk": ["Now a harder one, and not for you. Go to Wyn at the shrine and ask him what the stones were before they were stones.",
                      "He's been not telling me for twenty years. Perhaps he'll not tell you instead, and then come back and say what he didn't say."],
             "progress": ["Wyn's shrine is down the road, on the north shoulder. Ask him. Then come back up and tell me."],
             "complete": ["Mountains, he said? Before they were stones they were mountains. Insufferable. And true, which is worse."]},
        ],
        "done": ["The echoes have a new riddle now. Aled will not tell anyone what it is, which he enjoys enormously."]},
    "the_high_pass": {
        "name": "The High Pass", "giver": "bryn", "story": 3,
        "steps": [
            {"id": 1, "zone": "mt_pass", "goal": {"kill": "pass_bandit", "n": 4}, "reward": "xp:defence:700",
             "talk": ["That's the dangerous climb behind me. I tell everyone to take the safe road, and everyone thinks I'm being polite.",
                      "There's a band of cutthroats camped on the high pass, in the snow, taking a toll from anyone fool enough to go up. Four of them, if you're the fool."],
             "progress": ["The pass is at the top of the climb, where the snow starts. Bring a warm cloak and a sharp sword, in that order."],
             "complete": ["Four. The toll's lifted, then. I'll pretend I didn't hope you'd come back."]},
            {"id": 2, "zone": "mt_pass", "goal": {"kill": "frost_goblin", "n": 3}, "reward": "xp:strength:600",
             "talk": ["The bandits were the polite ones. Frost goblins have moved into the rocks above the pass, and they don't take tolls.",
                      "Three of them, and the climb's as safe as a climb like that ever gets."],
             "progress": ["The goblins keep to the rocks above the pass. They're small, they're cold, and they're quicker than they look."],
             "complete": ["Three. I'll still tell folk to take the safe road. But now I'll mean it a little less."]},
        ],
        "done": ["Bryn has started letting people up the climb. He still glares at them."]},
    "beyond_the_mountain": {
        "name": "Beyond the Mountain", "giver": "tamsin", "story": 1,
        "steps": [
            {"id": 1, "zone": "mt_lodge", "goal": {"talk": "orla"}, "reward": "xp:speechcraft:300",
             "talk": ["You came over the mountain? Then you're the first person I've seen in a fortnight who isn't a goat.",
                      "There's country beyond here nobody at the castle has walked. Smoke, some evenings, to the west. Tell Orla at the lodge what I've seen; she keeps the trail log."],
             "progress": ["Orla's lodge is at the castle side of the mountain, at the foot of the safe road. Tell her about the smoke."],
             "complete": ["She wrote it down? Then it's real now. That's how trails work."]},
            {"id": 2, "zone": "castle", "goal": {"talk": "castellan"}, "reward": "xp:speechcraft:400",
             "talk": ["Now the castellan. If there's a town out west, the castle will want to know before it wants anything from us.",
                      "Tell him the trail's open both ways. Tell him I said the smoke smells of bread, which is either good news or a very clever trap."],
             "progress": ["Castellan Brannoc is in the Lake Castle's inner ward, by the keep door."],
             "complete": ["He's sending word west. Whatever's out there, you'll be the one who gets to find it."]},
        ],
        "done": ["The trail log has a new page headed 'West', and nothing written under it yet."]},
}

NPC_LINES = {   # idle words and the examine line, for make_camps.js to put on each
    "orla": {"examine": "Orla, who hunts the foothills and keeps the trail log at the lodge.", "lines": ["The safe road's long, but it gets you there with both legs.", "Mind the cliffs. They don't move, and that's the trouble."]},
    "wyn": {"examine": "Keeper Wyn, who tends the three stones and says they talk back.", "lines": ["The stones remember what the living forget.", "Patience is a kind of climbing too."]},
    "aled": {"examine": "Aled the hermit, who has lived on this ledge long enough to argue with the echoes and win sometimes.", "lines": ["Shout, if you like. The echoes will tell you you're wrong.", "Thirty winters up here. Thirty-one, if the broth keeps coming."]},
    "bryn": {"examine": "Warden Bryn, who keeps travellers off the dangerous climb and is mostly ignored.", "lines": ["Safe road's that way. I say it to everyone. Nobody listens.", "If you go up, go up armed. If you come down, come down quieter than you went."]},
    "tamsin": {"examine": "Tamsin the scout, watching the west where the map runs out.", "lines": ["Smoke, some evenings, to the west.", "A map's only a promise until someone walks it."]},
}

if __name__ == '__main__':
    for mod, key, new in (("monsters", "monsters", MONSTERS), ("quests", "quests", QUESTS)):
        ep = os.path.join(EX, mod + '.json'); ex = load(ep) if os.path.exists(ep) else {key: {}}
        ex.setdefault(key, {}).update(new)
        with open(ep, 'w', encoding='utf-8') as f:
            json.dump(ex, f, indent=1, ensure_ascii=False); f.write('\n')
        lp = os.path.join(DD, mod + '.json'); live = load(lp); overlay(live['data'], {key: new})
        with open(lp, 'w', encoding='utf-8') as f:
            json.dump(live, f, separators=(',', ':'), ensure_ascii=False)
        print('%s: %d added or updated' % (mod, len(new)))
    for pid, body in PART_CHARS.items():
        with open(os.path.join(PARTS, pid + '.json'), 'w', encoding='utf-8') as f:
            json.dump(dict({"ashvale3d": "part", "api": 1, "v": 1, "id": pid, "kind": "char"}, **body), f, separators=(',', ':'), ensure_ascii=False)
    json.dump(NPC_LINES, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'npc_lines.json'), 'w'), indent=1)
    print('parts:', ', '.join(PART_CHARS))
