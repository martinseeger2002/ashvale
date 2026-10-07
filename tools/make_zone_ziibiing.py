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
WIGWAMS = [(FIRE[0] + round(math.cos(a) * RING), FIRE[1] + round(math.sin(a) * RING * 0.82)) for a in (math.radians(d) for d in range(15, 375, 60))]
LODGE_O, ROOM, GAP = (40, 16300), 13, 40   # the lodges: round rooms far under the world, like the Spider Cave, 40 m apart so no room sees another
lodges = [['^'] * (GAP * (len(WIGWAMS) - 1) + ROOM) for _ in range(ROOM)]
lobj = []
for n, (wx, wy) in enumerate(WIGWAMS):
    for yy in range(wy - 1, wy + 2):
        for xx in range(wx - 1, wx + 2): put(xx, yy, 'H')
    obj('wigwam', wx - 1, wy - 1, w=3, h=3, face='e', seed=wx * 31 + wy)
    cx, cy = LODGE_O[0] + n * GAP + ROOM // 2, LODGE_O[1] + ROOM // 2          # the room's centre
    for yy in range(ROOM):
        for xx in range(ROOM):
            if (xx - ROOM // 2) ** 2 + (yy - ROOM // 2) ** 2 <= 3.6 ** 2: lodges[yy][n * GAP + xx] = 'd'
    obj('wigwamdoor', wx + 1, wy, to=[cx + 2, cy], label='Go inside', name='Wigwam', say='You duck through the doorway into the wigwam. The fire crackles in the middle.')
    lobj += [dict(k='wigwamroom', x=cx, y=cy, r=4.4), dict(k='campfire', x=cx, y=cy),
             dict(k='wigwamout', x=cx + 3, y=cy, to=[wx + 2, wy], label='Go outside', name='Doorway', say='You step back out into the daylight.')]
    if land(wx + 2, wy): put(wx + 2, wy, 'd')
obj('campfire', FIRE[0], FIRE[1])
obj('fishrack', LAND[0] + 2, LAND[1] - 4, w=2, h=1)
obj('woodpile', FIRE[0] - 3, FIRE[1] - 3)
obj('basket', FIRE[0] + 3, FIRE[1] + 3); obj('basket', FIRE[0] + 4, FIRE[1] + 3)
obj('ricebasket', FIRE[0] - 4, FIRE[1] + 3)
obj('canoe', LAND[0], LAND[1], label='Get into the canoe', name='Birch bark canoe')     # the canoe to paddle the river in
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
    npcs.append({'id': i, 'name': name, 'look': i, 'x': x, 'y': y, 'lines': lines, 'examine': examine})
npc('nookomis', 'Nookomis', FIRE[0] + 2, FIRE[1] + 1,
    ["Boozhoo. Sit by the fire a while, the beads will keep.",
     "These flowers on the vest are the ones that grow along this river. My grandmother sewed them this way, and hers before her.",
     "The young ones say I take too long over a single leaf. A leaf should take long."],
    'Nookomis, the grandmother of the village, in a velvet vest beaded with woodland flowers.')
npc('migizi', 'Migizi', LAND[0] - 2, LAND[1] - 1,
    ["Boozhoo. That canoe is birch bark over cedar ribs, sewn with spruce root and sealed with pitch.",
     "Take her out if you like. Sit in her, then point where you want to go on the water. Point at the shore and she will bring you to it.",
     "Keep low and keep to the middle. The river is kind if you are patient with it."],
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

npcs.append({'id': 'makak', 'name': 'Ziibiing makak', 'look': 'makak', 'x': FIRE[0] + 3, 'y': FIRE[1] - 1, 'chest': True,
             'examine': 'A birch bark makak, sewn with spruce root, quill flowers on its side. Like the chest in Ashvale, it holds everything you own in your arcade wallet.'})
# Mishoomis, the elder: he lives in the first wigwam, sitting cross-legged west of its fire, and sends you ricing
c0 = LODGE_O[0] + ROOM // 2, LODGE_O[1] + ROOM // 2
lnpcs = [{'id': 'mishoomis', 'name': 'Mishoomis', 'look': 'mishoomis', 'x': c0[0] - 2, 'y': c0[1], 'face': 'e', 'pose': 'crosslegged', 'talk': 'quest', 'quest': 'manoomin',
          'examine': 'Mishoomis, the grandfather of Ziibiing, sitting cross-legged by his fire in an otter fur turban, a beaded bandolier bag across his chest.'}]
lz = {'name': 'Wigwam', 'level': '1-10', 'origin': list(LODGE_O), 'size': [GAP * (len(WIGWAMS) - 1) + ROOM, ROOM], 'ground': 'grass', 'under': True, 'style': 'wigwam',
      'surface': list(WIGWAMS[0]), 'tiles': [''.join(r) for r in lodges], 'objects': lobj, 'npcs': lnpcs, 'spawns': [], 'fishing': []}
json.dump({'ashvale3d': 'module', 'name': 'zone.lodges', 'api': 1, 'v': 1, 'data': lz}, open(os.path.join(HERE, 'data', 'zone.lodges.json'), 'w'), separators=(',', ':'))
zone = {'name': 'Ziibiing', 'level': '1-10', 'origin': [OX, OY], 'size': [W, H], 'ground': 'grass',
        'tiles': [''.join(r) for r in g], 'objects': objects, 'npcs': npcs, 'spawns': [], 'fishing': []}
json.dump({'ashvale3d': 'module', 'name': 'zone.ziibiing', 'api': 1, 'v': 1, 'data': zone},
          open(os.path.join(HERE, 'data', 'zone.ziibiing.json'), 'w'), separators=(',', ':'))
print('wrote data/zone.ziibiing.json: %d x %d at %d,%d; landing %s; fire %s' % (W, H, OX, OY, LAND, FIRE))
# THE RICE LAKE (2026-10-07: "Find the closest lake on the river to the village and put the Rice there. A big field of
# Rice"): 300 m down the river from the landing it widens to a lake ~100 m across before it splits (x 305..440, y 728..760).
# The zone keeps the world's own tiles there; a big field of manoomin stands across the lake's western half, a few gaps in it
RX, RY, RW, RH = 300, 722, 110, 46
js2 = world_tiles.__doc__   # (same worldgen call, other rectangle)
def tiles_at(X, Y, Wd, Ht):
    js = """
const fs=require('fs'),path=require('path'),G0=require('./src/globe.js'),AW=require('./src/worldgen.js');
const mod=n=>JSON.parse(fs.readFileSync(path.join('data',n+'.json'),'utf8')).data, cfg=mod('globecfg');
const zs=['village','whisperwood','saltmere','wolfden','cavemouth'].map(id=>Object.assign({id},mod('zone.'+id)));
const W=AW.createWorldgen(G0.createGlobe(cfg),{seed:cfg.seed});
W.setSetPieces(W.piecesFromZones(zs,cfg.face,cfg.origin[0],cfg.origin[1],{belt:cfg.belt||{},links:cfg.links||[]}));
console.log(JSON.stringify(W.tiles(cfg.face,%d+cfg.origin[0],%d+cfg.origin[1],%d,%d)));""" % (X, Y, Wd, Ht)
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
for r in g: print(''.join(r))
