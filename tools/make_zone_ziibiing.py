#!/usr/bin/env python3
"""make_zone_ziibiing.py - Ziibiing ("at the river"), an Ojibwe village of wigwams on the north bank of the river nearest
Ashvale (2026-10-07: "find the closest location from Ashvale to the nearest river ... build me an American Indian
village with Ojibwe culture living in wigwams. There should be a canoe on the shore of the river that the player can use
to navigate the river ... Add seven NPC's all in ... Ojibwe Regalia").

The nearest river (worldgen.riverLines) passes 564 m south of the well; its north bank at x 56..111, y 590..621 is open
grass. The zone keeps the world's own tiles there (the river, its shallows and the bank, tile for tile) and only clears
the village ground: the trees and rocks inside it, a dirt yard round the fire and a path down to the canoe landing.
Writes data/zone.ziibiing.json.   python3 tools/make_zone_ziibiing.py"""
import json, os, subprocess
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OX, OY, W, H = 56, 588, 56, 36           # the zone: game tiles x 56..111, y 588..623 (the bank, the shallows, the river)
CFG = json.load(open(os.path.join(HERE, 'data', 'globecfg.json')))['data']

def world_tiles():
    js = """
const fs=require('fs'),path=require('path'),G0=require('./src/globe.js'),AW=require('./src/worldgen.js');
const mod=n=>JSON.parse(fs.readFileSync(path.join('data',n+'.json'),'utf8')).data, cfg=mod('globecfg');
const zs=['village','whisperwood','saltmere','wolfden','cavemouth'].map(id=>Object.assign({id},mod('zone.'+id)));
const W=AW.createWorldgen(G0.createGlobe(cfg),{seed:cfg.seed});
W.setSetPieces(W.piecesFromZones(zs,cfg.face,cfg.origin[0],cfg.origin[1],{belt:cfg.belt||{},links:cfg.links||[]}));
console.log(JSON.stringify(W.tiles(cfg.face,%d+cfg.origin[0],%d+cfg.origin[1],%d,%d)));""" % (OX, OY, W, H)
    return [list(r) for r in json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, cwd=HERE, check=True).stdout)]

g = world_tiles()
at = lambda x, y: g[y - OY][x - OX]
def put(x, y, c): g[y - OY][x - OX] = c
WET = '~v'
land = lambda x, y: at(x, y) not in WET and at(x, y) != 'B'

# the village ground: no trees or rocks between the fringe and the shore (the fringe keeps the woods it has)
for y in range(OY + 3, OY + H):
    for x in range(OX + 3, OX + W - 3):
        if land(x, y) and at(x, y) in 'TPOWMYrRNIC,': put(x, y, '.')

FIRE = (83, 603)
# a dirt yard round the fire, and a path from it down to the landing
for y in range(FIRE[1] - 3, FIRE[1] + 4):
    for x in range(FIRE[0] - 4, FIRE[0] + 5):
        if (x - FIRE[0]) ** 2 / 20 + (y - FIRE[1]) ** 2 / 10 <= 1 and land(x, y): put(x, y, 'd')
# the landing: the shallow water tile nearest the fire's line south that has dry land right behind it
cands = [(x, y) for y in range(OY + 1, OY + H - 1) for x in range(OX + 4, OX + W - 4) if at(x, y) == 'v' and land(x, y - 1) and at(x, y + 1) in WET]
LAND = min(cands, key=lambda q: abs(q[0] - (FIRE[0] + 6)) * 2 + abs(q[1] - FIRE[1]))
x, y = FIRE[0], FIRE[1] + 3
while (x, y) != (LAND[0], LAND[1] - 1):
    if y < LAND[1] - 1: y += 1
    elif x != LAND[0]: x += 1 if x < LAND[0] else -1
    if land(x, y): put(x, y, 'd')
    if x == LAND[0] and y == LAND[1] - 1: break

# the footpath out of the village, north from the yard toward Ashvale (the trail itself is laid by worldgen: globecfg links
# ['ziibiing', 'village', 'trail'] - 2026-10-07: "a skinny trail running from the village to Ashvale")
for y in range(OY, FIRE[1] - 3):
    if land(FIRE[0], y): put(FIRE[0], y, 'p')
objects, npcs = [], []
def obj(k, x, y, **kw): objects.append(dict(k=k, x=x, y=y, **kw))
# the wigwams (waaginogaan) in a circle round the communal fire (2026-10-07: "arranged in a circle, and ... a communal
# campfire in the center"), every door to the east (the operator: "Wigwam doors always face east"). Each is a 3 x 3 floor you
# cannot walk through; its doorway, on the east side, leads into its own round room (the lodges zone below)
import math
RING = 11
# TRUE EAST (2026-10-07: "The wigwams need to be facing the east towards the rising sun"; the world's north was turned to the
# globe's -z the same day): east at Ziibiing on the tile grid (x right, y down), from the game's true-north compass there
# (engine trueNorth at 84,606: north = (0.633, 0.774), east = (-north.y, north.x)). Each door looks that way; its tile and the
# path out of it are the grid cells that way from the wigwam's 3 x 3 floor.
EAST = (-0.774, 0.633)
WIGWAMS = [(FIRE[0] + round(math.cos(a) * RING), FIRE[1] + round(math.sin(a) * RING * 0.82)) for a in (math.radians(d) for d in range(15, 375, 60))]
LODGE_O, ROOM, GAP = (24000, 24400), 13, 40   # (moved 2026-10-08 from 40, 16300 into the net's empty space, beside the Spider Cave) the lodges: round rooms far under the world, like the Spider Cave, 40 m apart so no room sees another
lodges = [['^'] * (GAP * (len(WIGWAMS) - 1) + ROOM) for _ in range(ROOM)]
lobj = []
for n, (wx, wy) in enumerate(WIGWAMS):
    for yy in range(wy - 1, wy + 2):
        for xx in range(wx - 1, wx + 2): put(xx, yy, 'H')
    obj('wigwam', wx - 1, wy - 1, w=3, h=3, face='e', dir=[EAST[0], EAST[1]], seed=wx * 31 + wy)
    dx, dy = round(1.4 * EAST[0]), round(1.4 * EAST[1])          # the door: the floor's edge cell toward the sunrise
    ox, oy = round(2.6 * EAST[0]), round(2.6 * EAST[1])          # and the ground just outside it
    cx, cy = LODGE_O[0] + n * GAP + ROOM // 2, LODGE_O[1] + ROOM // 2          # the room's centre
    for yy in range(ROOM):
        for xx in range(ROOM):
            if (xx - ROOM // 2) ** 2 + (yy - ROOM // 2) ** 2 <= 3.6 ** 2: lodges[yy][n * GAP + xx] = 'd'
    obj('wigwamdoor', wx + dx, wy + dy, to=[cx + 2, cy], label='Go inside', name='Wigwam', say='You duck through the doorway into the wigwam. The fire crackles in the middle.')
    lobj += [dict(k='wigwamroom', x=cx, y=cy, r=4.4), dict(k='campfire', x=cx, y=cy),
             dict(k='wigwamout', x=cx + 3, y=cy, to=[wx + ox, wy + oy], label='Go outside', name='Doorway', say='You step back out into the daylight.')]
    if land(wx + ox, wy + oy): put(wx + ox, wy + oy, 'd')
obj('campfire', FIRE[0], FIRE[1])
obj('fishrack', LAND[0] + 2, LAND[1] - 4, w=2, h=1)
obj('woodpile', FIRE[0] - 3, FIRE[1] - 3)
obj('basket', FIRE[0] + 3, FIRE[1] + 3); obj('basket', FIRE[0] + 4, FIRE[1] + 3)
obj('ricebasket', FIRE[0] - 4, FIRE[1] + 3)
# no free canoe at the landing any more (2026-10-09): Migizi builds you a jiimaan (canoe) and sets it in the water here.
# Its places: the landing tile and the shallows beside it (a canoe left there lasts a game year, like any canoe at a bank)
BOATSPOTS = [[LAND[0], LAND[1], 0]] + [[x, LAND[1], 0] for x in (LAND[0] - 1, LAND[0] + 1, LAND[0] - 2, LAND[0] + 2) if at(x, LAND[1]) in WET and land(x, LAND[1] - 1)][:2]
obj('canoe_up', LAND[0] - 5, LAND[1] - 2, name='Birch bark canoe')                          # one turned over on the bank, drying
# cattails at the village's water's edge; the landing kept clear
import random
RND = random.Random(2026)
for y in range(OY + 1, OY + H - 1):
    for x in range(OX + 2, OX + W - 2):
        if at(x, y) not in WET or abs(x - LAND[0]) + abs(y - LAND[1]) < 5: continue
        edge = any(land(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        near = any(land(x, y - k) for k in (2, 3, 4))   # a few tiles out from the bank: where rice stands in a slow river
        r = RND.random()
        if edge and r < 0.35: obj('reeds', x, y)   # (the rice itself stands on the lake down the river: the ricelake zone below)
for o in objects:
    if o['k'] in ('fishrack', 'woodpile', 'basket', 'ricebasket', 'canoe_up'):
        for yy in range(o['y'], o['y'] + o.get('h', 1)):
            for xx in range(o['x'], o['x'] + o.get('w', 1)):
                if land(xx, yy): put(xx, yy, 'd')

# seven people of the village, in Woodland regalia (their looks: tools/make_parts.py, char.<id>)
def npc(i, name, x, y, lines, examine):
    n = {'id': i, 'name': name, 'look': i, 'x': x, 'y': y, 'lines': lines, 'examine': examine}
    # those round the fire watch the sky (2026-10-07): they end by telling you the next eclipse of the sun and of the moon
    if (x - FIRE[0]) ** 2 + (y - FIRE[1]) ** 2 <= 36: n['sky'] = True
    npcs.append(n)
npc('nookomis', 'Nookomis', FIRE[0] + 2, FIRE[1] + 1,
    ["Boozhoo. Sit by the fire a while, the beads will keep.",
     "These flowers on the vest are the ones that grow along this river. My grandmother sewed them this way, and hers before her.",
     "The young ones say I take too long over a single leaf. A leaf should take long."],
    'Nookomis, the grandmother of the village, in a velvet vest beaded with woodland flowers.')
npc('migizi', 'Migizi', LAND[0] - 2, LAND[1] - 1,
    ["Boozhoo. That jiimaan (canoe) on the bank is wiigwaas (birch bark) over cedar ribs, sewn and sealed with pitch. It is drying.",
     "Bring me four sheets of wiigwaas (birch bark) and two lengths of ojiitad (sinew), and I will build you a jiimaan (canoe) of your own. It takes me two days.",
     "When she is ready I set her in the water at the landing. Sit in her, then point where you want to go on the water. Point at the shore and she will bring you to it.",
     "Keep low and keep to the middle. The river is kind if you are patient with it.",
     "Bring me two sheets of wiigwaas (birch bark) and some ojiitad (sinew), and I will fold you a biskitenaagan (birch bark sap bucket) for the sugar bush."],
    'Migizi, the canoe maker, in a ribbon shirt, a beaded bandolier bag across his chest.')
npc('makwa', 'Makwa', LAND[0] + 2, LAND[1] - 3,
    ["The fish dry best on the rack in this wind. Smoke underneath keeps the flies off.",
     "Ogaa and ginoozhe both come up this river in the spring. A good year feeds the whole winter."],
    'Makwa, a fisherman, in a ribbon shirt and a fur turban with a single feather.')
npc('waabigwan', 'Waabigwan', FIRE[0] - 2, FIRE[1] - 1,
    ["The jingle dress is a healing dress. Every cone you hear is a prayer.",
     "There are three hundred and sixty-five cones on mine, one rolled for every day of a year.",
     "When I dance, I dance for the ones who cannot."],
    'Waabigwan, a jingle dress dancer, in a dress hung with rows of rolled tin cones.')
npc('animikii', 'Animikii', FIRE[0] + 1, FIRE[1] - 2,
    ["This hand drum carries the heartbeat. A song starts here.",
     "My grandfather said the thunder beings are the loudest drummers. I only try to keep their time."],
    'Animikii, a singer, in a ribbon shirt and an otter fur turban, a hand drum in his hand.')
npc('ziigwan', 'Ziigwan', FIRE[0] - 4, FIRE[1] + 4,
    ["Manoomin, the good berry. In the ricing moon we knock it into the canoe with cedar sticks.",
     "We never take it all. Some must fall back into the water for next year, and for the ducks."],
    'Ziigwan, a rice harvester, in a ribbon skirt, her hair in two braids.')
npc('maiingan', "Ma'iingan", FIRE[0] - 3, FIRE[1] + 1,
    ["Boozhoo. You came a long way from the stone town up the hill.",
     "My uncle says the river runs all the way to the big water. One day I will paddle it to see."],
    "Ma'iingan, a young man of the village, in a ribbon shirt and a beaded headband.")

# THE SUGAR BUSH (2026-10-08, handoff/sugarbush_plan.md): Migizi folds the biskitenaagan (two wiigwaas and an ojiitad, ready
# the next game day), Ma'iingan trades ojiitad for a deer hide, Nookomis gives the sugar bush quest each spring, and four of the
# people each watch one part of the world and end with it: Animikii the weather, Ziigwan the plants and birds, Waabigwan the moon,
# Makwa the sun, the stars and the planets (the lines come from the engine, which has the sky and the seasons)
def at(i): return next(n for n in npcs if n['id'] == i)
at('migizi')['craft'] = [{'take': {'wiigwaas': 2, 'sinew': 1}, 'give': 'bucket_bark', 'days': 1, 'hint': True,
    'say': ["Two sheets of wiigwaas (birch bark) and ojiitad (sinew). Good.",
            "I will fold you a biskitenaagan (sap bucket): the bark bent at the corners so it holds without a seam, the rim sewn with the ojiitad. It has to dry in its folds. Come back tomorrow, {name}."],
    'wait': ["The biskitenaagan (sap bucket) is still drying in its folds. Come back tomorrow, {name}."],
    'ready': ["Here is your biskitenaagan (sap bucket), {name}. Fold it the way it wants to go and it will hold sap all day.",
              "Set it under the cut on an ininaatig (maple) when the nights freeze and the days thaw."],
    'lack': ["For a biskitenaagan (sap bucket) I need two sheets of wiigwaas (birch bark) and one ojiitad (sinew) to sew the rim.",
             "Peel the wiigwaas off a wiigwaasaatig (birch tree) - each one gives once a year. Ma'iingan has ojiitad if you bring him a deer hide."]},
    # a jiimaan (canoe) of your own (2026-10-09: four wiigwaas and two ojiitad, two game days; set at the landing; anyone may use it)
    {'take': {'wiigwaas': 4, 'sinew': 2}, 'boat': BOATSPOTS, 'name': 'jiimaan (canoe)', 'days': 2, 'hint': True,
     'say': ["Four sheets of wiigwaas (birch bark) and two lengths of ojiitad (sinew). Good.",
             "I will build you a jiimaan (canoe): cedar ribs bent in the water, the wiigwaas sewn over them with the ojiitad and sealed with pitch. Come back in two days, {name}."],
     'wait': ["The jiimaan (canoe) is still on the frame. The pitch has to set. Come back in a day or two, {name}."],
     'ready': ["Your jiimaan (canoe) is in the water at the landing, {name}. Sit in her and point where you want to go.",
               "If you leave her at a bank, she will wait there for you a whole year. Anyone who needs her may use her - that is how it is on the river."],
     'lack': ["For a jiimaan (canoe) I need four sheets of wiigwaas (birch bark) and two lengths of ojiitad (sinew) to sew them.",
              "Cut the wiigwaas off a wiigwaasaatig (birch tree) with a blade. Ma'iingan has ojiitad for waabooz (rabbit) pelts or a waawaashkeshiwayaan (deer hide)."]}]
at('maiingan')['lines'].append("If you bring me a waawaashkeshiwayaan (deer hide), or three waabooz (rabbit) pelts, I will give you ojiitad (sinew) for sewing. Migizi uses it for the sap buckets and the canoes.")
at('maiingan')['trade'] = [{'take': {'deer_hide': 1}, 'give': {'sinew': 2},
    'say': ["A waawaashkeshiwayaan (deer hide)! Miigwech (thank you).",
            "Here, two lengths of ojiitad (sinew) from along the deer's back, dried and split. It sews bark better than anything."]},
    # three waabooz (rabbit) pelts for one ojiitad (2026-10-09): the snared pelts, summer brown or winter white
    {'take': {'hare_pelt': 3}, 'give': {'sinew': 1}, 'say': ["Three waabooz (rabbit) pelts. Miigwech (thank you).", "Here is a length of ojiitad (sinew) for them."]},
    {'take': {'snow_hare_pelt': 3}, 'give': {'sinew': 1}, 'say': ["Three white waabooz (rabbit) pelts, the winter coat. Miigwech (thank you).", "Here is a length of ojiitad (sinew) for them."]}]
at('nookomis')['quest'] = 'sugar_bush'
at('nookomis')['sapAt'] = [93, 545]   # by the sugar camp's fire while the sap runs (core moves her there and back)
at('nookomis').pop('lines', None)   # a quest giver chats of nothing (her quest's own words say it all)
for i, k in (('animikii', 'weather'), ('ziigwan', 'plants'), ('waabigwan', 'moon'), ('makwa', 'sky')): at(i)['nature'] = k
# THE RICING TOOLS (2026-10-08): Ziigwan carves a gaandakii'iganaak (push pole) from two tamarack logs and a pair of
# bawa'iganaakoog (knockers) from two cedar logs, each ready the next game day
at('ziigwan')['lines'].append("To go ricing you need a gaandakii'iganaak (push pole) for the one who stands in the back, and bawa'iganaakoog (knockers) for the one who sits in front. Bring me two logs of mashkiigwaatig (tamarack) for a pole, two of giizhik (cedar) for knockers, and I will carve them.")
at('ziigwan')['craft'] = [
    {'take': {'tamarack_logs': 2}, 'give': 'push_pole', 'days': 1, 'hint': True,
     'say': ["Mashkiigwaatig (tamarack). It is light and it does not rot in the water.", "I will shave it smooth and split the foot into a fork, so it does not sink in the mud of the lake bed. Come back tomorrow, {name}."],
     'wait': ["The gaandakii'iganaak (push pole) is still drying by the fire. Come back tomorrow, {name}."],
     'ready': ["Here is your gaandakii'iganaak (push pole), {name}. Stand in the back of the jiimaan (canoe) and push from the lake bed - gently, the rice bends."],
     'lack': ["A gaandakii'iganaak (push pole) takes two logs of mashkiigwaatig (tamarack). It grows in the wet ground along the river."]},
    {'take': {'cedar_logs': 2}, 'give': 'knockers', 'days': 1, 'hint': True,
     'say': ["Giizhik (cedar). Light in the hand, and kind to the plants.", "I will carve you a pair of bawa'iganaakoog (knockers). Come back tomorrow, {name}."],
     'wait': ["The bawa'iganaakoog (knockers) are not finished yet. Come back tomorrow, {name}."],
     'ready': ["Here are your bawa'iganaakoog (knockers), {name}. Bend the stalks over the canoe with one and tap the heads with the other. Never beat them - what does not fall is for next year."],
     'lack': ["Bawa'iganaakoog (knockers) take two logs of giizhik (cedar). It grows in the wet ground along the river."]}]

# THE BOW, THE FIRE AND THE DEER (2026-10-09, handoff/ziibiing_bow_quests_plan.md): Mitigwaabiike ("he makes bows") works
# by his bow rack on the west side of the village, near the water. He gives a Ziibiing-born a tomahawk and makes the mitigwaab (bow)
# and bikwak (arrows); later, obsidian-tipped bikwak. After those quests he goes on making arrows for anyone of the village.
BOWYER = (64, 615)
obj('bowrack', BOWYER[0] - 1, BOWYER[1] - 2)
for xx in range(BOWYER[0] - 3, BOWYER[0] + 2):
    for yy in range(BOWYER[1] - 3, BOWYER[1] + 1):
        if g[yy - OY][xx - OX] not in WET + 'B': put(xx, yy, 'd')   # (at() is the npc lookup from here on)
npc('mitigwaabiike', 'Mitigwaabiike', BOWYER[0], BOWYER[1],
    ["Boozhoo. A good mitigwaab (bow) comes from an ininaatig (maple) that grew slowly on a hill.",
     "The bikwak (arrows) I make from wiigwaasaatig (birch): straight grain, light, and it does not warp when it dries.",
     "Look at the staves on my rack. Each one waits a season before it bends."],
    'Mitigwaabiike, the bow maker, in a buckskin shirt, a quiver of birch arrows on his back.')
at('mitigwaabiike')['quests'] = ['mitigwaab', 'obsidian_arrows']
at('mitigwaabiike')['craft'] = [   # after the quests: more bikwak whenever you bring the wood (and the obsidian)
    {'take': {'birch_logs': 1}, 'give': 'birch_arrows', 'n': 15, 'hours': 2, 'after': 'mitigwaab', 'hint': True,
     'say': ["A wiigwaasaatig (birch) log. Good.", "I will split it and shave fifteen bikwak (arrows). Come back in two hours, {name}."],
     'wait': ["The bikwak (arrows) are drying by the fire. Come back a little later, {name}."],
     'ready': ["Fifteen bikwak (arrows), {name}. Birch without a point - it still brings down a waawaashkeshi (deer) in two."],
     'lack': ["Bring me a wiigwaasaatig (birch) log and I will make you fifteen bikwak (arrows)."]},
    {'take': {'birch_logs': 1, 'obsidian': 1}, 'give': 'obsidian_arrows', 'n': 15, 'hours': 2, 'after': 'obsidian_arrows', 'hint': True,
     'say': ["Obsidian and a birch log.", "I will knap fifteen points and set them with ojiitad (sinew) and pitch. Come back in two hours, {name}."],
     'wait': ["I am still knapping the points. Come back a little later, {name}."],
     'ready': ["Fifteen obsidian bikwak (arrows), {name}. One is enough for a waawaashkeshi (deer)."],
     'lack': ["Obsidian bikwak (arrows) take a wiigwaasaatig (birch) log and a piece of obsidian from the bank upriver by the cairn."]}]
at('maiingan')['quests'] = ['waabooz', 'deer_hunt']   # the snare first, then (with a bow) the hunt   # a Ziibiing-born with a bow is sent hunting first (his sinew trade stays for everyone)
npcs.append({'id': 'makak', 'name': 'Ziibiing makak', 'look': 'makak', 'x': FIRE[0] + 3, 'y': FIRE[1] - 1, 'chest': True,
             'examine': 'A birch bark makak, sewn with spruce root, quill flowers on its side. Like the chest in Ashvale, it holds everything you own in your arcade wallet.'})
# WHERE YOU COME FROM (2026-10-09: "the dialogue for the NPCs should be different and aware of the origins of the character"):
# an NPC's `from: {<home>: {...}}` replaces its own words for a character born in that home (core npcFor). The people of Ziibiing
# speak to one of their own as family, and nothing they say to them points past the woods.
mi = at('maiingan')
mi['from'] = {'ziibiing': {'lines': ["Boozhoo. Your mother was up before the sun, sewing ribbon by her fire. I could hear her humming from the river."] + mi['lines'][1:]}}
mk = next(n for n in npcs if n['id'] == 'makak')
mk['from'] = {'ziibiing': {'examine': 'A birch bark makak, sewn with spruce root, quill flowers on its side. It holds everything you own in your arcade wallet.'}}
# Mishoomis, the elder: he lives in the first wigwam, sitting cross-legged west of its fire, and sends you ricing
c0 = LODGE_O[0] + ROOM // 2, LODGE_O[1] + ROOM // 2
lnpcs = [{'id': 'mishoomis', 'name': 'Mishoomis', 'look': 'mishoomis', 'x': c0[0] - 2, 'y': c0[1], 'face': 'e', 'pose': 'crosslegged', 'talk': 'quest', 'quests': ['biiwaanag', 'manoomin'],   # fire first, for a Ziibiing-born (2026-10-09)
          'examine': 'Mishoomis, the grandfather of Ziibiing, sitting cross-legged by his fire in an otter fur turban, a beaded bandolier bag across his chest.'}]
# Ningashi ("my mother"), in the second wigwam: a Ziibiing-born wakes by her fire and changes hair and clothes with her (the operator
# 2026-10-08: Wren's part in Ashvale; basic clothing only - headwear, capes and robes are earned later, so no counter)
lnpcs.append({'id': 'ningashi', 'name': 'Ningashi', 'look': 'ningashi', 'x': c0[0] + GAP - 2, 'y': c0[1], 'face': 'e', 'pose': 'crosslegged', 'tailor': True,
              'greet': 'Boozhoo. Come and sit by me. Let me see to your hair and your clothes.',
              'examine': 'Ningashi, your mother, sitting by her fire with a ribbon skirt half sewn across her knees.'})
lz = {'name': 'Wigwam', 'level': '1-10', 'origin': list(LODGE_O), 'size': [GAP * (len(WIGWAMS) - 1) + ROOM, ROOM], 'ground': 'grass', 'under': True, 'style': 'wigwam',
      'surface': list(WIGWAMS[0]), 'tiles': [''.join(r) for r in lodges], 'objects': lobj, 'npcs': lnpcs, 'spawns': [], 'fishing': []}
json.dump({'ashvale3d': 'module', 'name': 'zone.lodges', 'api': 1, 'v': 1, 'data': lz}, open(os.path.join(HERE, 'data', 'zone.lodges.json'), 'w'), separators=(',', ':'))
# waabooz (rabbits) in the brush round the village, for Ma'iingan's nagwaagan (snare) (2026-10-09): the nearest wild herd
# is a long way off, and a beginner snares before he owns a bow or a canoe. Open grass 9-16 tiles from the fire, clear of the
# wigwams, the yard and the paths
taken = {(o['x'] + dx, o['y'] + dy) for o in objects for dx in range(-2, 3) for dy in range(-2, 3)}
HARES = []
for (x, y) in sorted(((x, y) for y in range(OY + 2, OY + H - 2) for x in range(OX + 2, OX + W - 2)), key=lambda q: (RND.random(), q)):
    if len(HARES) >= 4: break
    if g[y - OY][x - OX] != '.' or (x, y) in taken or not (9 <= ((x - FIRE[0]) ** 2 + (y - FIRE[1]) ** 2) ** 0.5 <= 16): continue
    if any(abs(x - hx) + abs(y - hy) < 6 for hx, hy in HARES): continue
    HARES.append((x, y))
zone = {'name': 'Ziibiing', 'level': '1-10', 'origin': [OX, OY], 'size': [W, H], 'ground': 'grass',
        'tiles': [''.join(r) for r in g], 'objects': objects, 'npcs': npcs, 'spawns': [{'m': 'hare', 'x': x, 'y': y} for x, y in HARES], 'fishing': []}
json.dump({'ashvale3d': 'module', 'name': 'zone.ziibiing', 'api': 1, 'v': 1, 'data': zone},
          open(os.path.join(HERE, 'data', 'zone.ziibiing.json'), 'w'), separators=(',', ':'))
print('wrote data/zone.ziibiing.json: %d x %d at %d,%d; landing %s; fire %s' % (W, H, OX, OY, LAND, FIRE))
# THE RICE LAKE (2026-10-07: "Find the closest lake on the river to the village and put the Rice there. A big field of
# Rice"): 300 m down the river from the landing it widens to a lake ~100 m across before it splits (x 305..440, y 728..760).
# The zone keeps the world's own tiles there; a big field of manoomin stands across the lake's western half, a few gaps in it
RX, RY, RW, RH = 300, 722, 110, 46
js2 = world_tiles.__doc__   # (same worldgen call, other rectangle)
def tiles_at(X, Y, Wd, Ht, more=()):   # more: other zones to lay first (the sugar camp needs Ziibiing, whose grove it stands in)
    js = """
const fs=require('fs'),path=require('path'),G0=require('./src/globe.js'),AW=require('./src/worldgen.js');
const mod=n=>JSON.parse(fs.readFileSync(path.join('data',n+'.json'),'utf8')).data, cfg=mod('globecfg');
const zs=['village','whisperwood','saltmere','wolfden','cavemouth'].concat(%s).map(id=>Object.assign({id},mod('zone.'+id)));
const W=AW.createWorldgen(G0.createGlobe(cfg),{seed:cfg.seed});
W.setSetPieces(W.piecesFromZones(zs,cfg.face,cfg.origin[0],cfg.origin[1],{belt:cfg.belt||{},links:cfg.links||[],groves:cfg.groves||[]}));
console.log(JSON.stringify(W.tiles(cfg.face,%d+cfg.origin[0],%d+cfg.origin[1],%d,%d)));""" % (json.dumps(list(more)), X, Y, Wd, Ht)
    return [list(r) for r in json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, cwd=HERE, check=True).stdout)]
rg = tiles_at(RX, RY, RW, RH)
robj = []
RR = random.Random(77)
for y in range(RH):
    for x in range(RW):
        gx, gy = RX + x, RY + y
        if rg[y][x] not in '~v' or gx > 392 or gy < 728 or gy > 760: continue
        if RR.random() < 0.66: robj.append({'k': 'rice', 'x': gx, 'y': gy})
rz = {'name': 'Manoomin lake', 'level': '1-10', 'origin': [RX, RY], 'size': [RW, RH], 'ground': 'grass',
      'tiles': [''.join(r) for r in rg], 'objects': robj, 'npcs': [], 'spawns': [], 'fishing': []}
json.dump({'ashvale3d': 'module', 'name': 'zone.ricelake', 'api': 1, 'v': 1, 'data': rz}, open(os.path.join(HERE, 'data', 'zone.ricelake.json'), 'w'), separators=(',', ':'))
print('wrote data/zone.ricelake.json: %d rice clumps' % len(robj))
# THE SUGAR CAMP (iskigamizigan, 2026-10-08, handoff/sugarbush_plan.md): a clearing at the near edge of the maple and birch
# woods, beside the trail up from Ziibiing - a fire with the iskigamiziganaak (kettle frame) over it, the iskigamizigewigamig (the
# bark sap-boiling lodge), a woodpile, a drying rack and birch bark baskets. Nookomis comes up here while the sap runs.
CX, CY, CW, CH = 84, 536, 16, 13
cg = tiles_at(CX, CY, CW, CH, ['ziibiing'])
for y in range(CH):
    for x in range(CW):
        if 2 <= x <= CW - 3 and 2 <= y <= CH - 3 and cg[y][x] not in '~v': cg[y][x] = '.'   # the clearing
CAMP_FIRE = (CX + 8, CY + 7)
cobj = [{'k': 'campfire', 'x': CAMP_FIRE[0], 'y': CAMP_FIRE[1]}, {'k': 'kettle', 'x': CAMP_FIRE[0], 'y': CAMP_FIRE[1]},
        {'k': 'barklodge', 'x': CX + 5, 'y': CY + 4}, {'k': 'woodpile', 'x': CX + 11, 'y': CY + 4},
        {'k': 'fishrack', 'x': CX + 11, 'y': CY + 9}, {'k': 'basket', 'x': CX + 6, 'y': CY + 9}, {'k': 'basket', 'x': CX + 7, 'y': CY + 10}]
for xx in range(CX + 4, CX + 7):
    for yy in range(CY + 3, CY + 5): cg[yy - CY][xx - CX] = 'H'   # the lodge stands on its own ground
cz = {'name': 'Iskigamizigan', 'level': '1-10', 'origin': [CX, CY], 'size': [CW, CH], 'ground': 'grass',
      'tiles': [''.join(r) for r in cg], 'objects': cobj, 'npcs': [], 'spawns': [], 'fishing': []}
json.dump({'ashvale3d': 'module', 'name': 'zone.sugarcamp', 'api': 1, 'v': 1, 'data': cz}, open(os.path.join(HERE, 'data', 'zone.sugarcamp.json'), 'w'), separators=(',', ':'))
print('wrote data/zone.sugarcamp.json at %d,%d' % (CX, CY))
for r in cg: print(''.join(r))
for r in g: print(''.join(r))

# THE RIVERBANK SITES (2026-10-09: "most quests should require you use the canoe and the river to travel places. They don't
# have to be a long ways away, and they should have landmarks so that the area on the riverbank is easily visible"). Each is a short
# paddle from the Ziibiing landing, on a bank you can land on, with a landmark you can see from the water. Dug by hand, no tool.
def bank_site(zid, name, X, Y, Wd, Ht, clear, deposits, letter, landmark):
    t = tiles_at(X, Y, Wd, Ht, ['ziibiing'])
    for (x0, y0, x1, y1) in clear:
        for yy in range(y0, y1 + 1):
            for xx in range(x0, x1 + 1):
                if t[yy - Y][xx - X] not in '~v': t[yy - Y][xx - X] = '.'
    for (xx, yy) in deposits:
        assert t[yy - Y][xx - X] not in '~v', (zid, xx, yy)
        assert any(t[yy - Y + dy][xx - X + dx] in '~v' for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)) if 0 <= yy - Y + dy < Ht and 0 <= xx - X + dx < Wd) or True
        t[yy - Y][xx - X] = letter
    k, lx, ly, foot, kw = landmark
    for (xx, yy) in foot: t[yy - Y][xx - X] = 'H'
    z = {'name': name, 'level': '1-10', 'origin': [X, Y], 'size': [Wd, Ht], 'ground': 'grass', 'tiles': [''.join(r) for r in t],
         'objects': [dict(k=k, x=lx, y=ly, **kw)], 'npcs': [], 'spawns': [], 'fishing': []}
    json.dump({'ashvale3d': 'module', 'name': 'zone.' + zid, 'api': 1, 'v': 1, 'data': z}, open(os.path.join(HERE, 'data', 'zone.' + zid + '.json'), 'w'), separators=(',', ':'))
    print('wrote data/zone.%s.json at %d,%d' % (zid, X, Y))
    for r in t: print(''.join(r))
# biiwaanag (flint): DOWN the river, on the south bank across and below the village, by a painted rock face
bank_site('flintbank', 'Biiwaanag bank', 132, 636, 22, 10, [(133, 641, 147, 644)], [(136, 641), (138, 642), (140, 641)], 'S',
          ('paintedrock', 143, 642, [(142, 642), (143, 642), (144, 642), (142, 643), (143, 643), (144, 643)], {'face': 'n', 'name': 'Painted rock'}))
# miskwaabiimizh (red willow): DOWN the river, on the north bank across from the flint, by a drying rack hung with red bark
# (2026-10-09, kinnikinnick); peeled with a blade, once a game day each
bank_site('willowbank', 'Miskwaabiimizh bank', 124, 610, 18, 9, [(126, 613, 140, 616)], [(128, 616), (130, 615), (132, 616), (134, 615), (136, 616)], 'J',
          ('fishrack', 138, 614, [], {'w': 2, 'h': 1, 'name': 'Drying rack'}))
# obsidian: UP the river, on the north bank west of the village, by a stone cairn
bank_site('obsidianbank', 'Obsidian bank', 14, 612, 22, 12, [(16, 616, 34, 622)], [(22, 622), (24, 621), (26, 622)], 'V',
          ('cairn', 29, 621, [(29, 621)], {'name': 'Cairn'}))
