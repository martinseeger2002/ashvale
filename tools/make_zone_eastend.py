#!/usr/bin/env python3
"""make_zone_eastend.py - Eastend, Ashvale's new edge on the road to Saltmere (2026-10-08: "It's getting a little crowded in
the town of Ashvale. Right where @apple is standing put two more houses, one on either side of the road to Saltmere, add a new
cross path, move some of the crowded NPCs from Ashvale into this new area as long as their storyline doesn't depend on them
standing where they are").

The zone joins the village on its east side (the village ends at x 47) and keeps the cobbled Saltmere road (y 50-51) running
through. Two walk-in houses face the road, one north of it and one south; a footpath crosses the road between them, north to
the slope and south to the lake shore; a gas lamp stands by the crossing on each side. Of the village's people only the town
guards had nowhere their story needs them to stand, so one guard moves out here from the crowded square; and, their quests'
words changed to say so (2026-10-08), Pax the painter lives in the north house and Modulus the surveyor measures the new
crossroads. Symmetry stays: two quests send you to her green-roofed house.

Writes data/zone.eastend.json. Run tools/make_data.py afterwards only if the village overlay changed (the guard's move).
"""
import json, os, random
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OX, OY, W, H = 48, 40, 24, 24
R = random.Random('eastend')
rows = [['.'] * W for _ in range(H)]
def put(x, y, c):
    if OX <= x < OX + W and OY <= y < OY + H: rows[y - OY][x - OX] = c
# a scatter of trees round the edges (never on the road, the path or the houses' yards)
for y in range(OY, OY + H):
    for x in range(OX, OX + W):
        edge = min(y - OY, OY + H - 1 - y)
        if edge <= 2 and R.random() < 0.55 - 0.15 * edge: put(x, y, R.choice('TTPPO'))
        elif R.random() < 0.035: put(x, y, ',')
# the road to Saltmere, as the village has it
for x in range(OX, OX + W):
    put(x, 50, 'c'); put(x, 51, 'c')
# the cross path, north and south of the road
PX = 60
for y in range(OY, OY + H):
    if y not in (50, 51): put(PX, y, 'p'); put(PX + 1, y, 'p')
objects, npcs = [], []
def house(x, y, w, h, door, roof, wall, owner=None):
    for yy in range(y, y + h):
        for xx in range(x, x + w): put(xx, yy, 'i')
    for cx, cy in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)): put(cx, cy, 'X')
    objects.append(dict({'k': 'house', 'x': x, 'y': y, 'w': w, 'h': h, 'door': door, 'roof': roof, 'wall': wall, 'enter': True}, **({'owner': owner} if owner else {})))
# north of the road: its door on the south wall, a step from the road; south of the road: its door on the north wall
house(53, 42, 6, 5, [55, 46], '#8a4a2e', '#e2d6bc', owner='pax')   # Pax the painter's (his quest sends you here); lined up with the shop and the Armoury, y 42-46
#   # Pax the painter's: he moved out of the crowded square (his quest now sends you here)
house(53, 53, 6, 5, [55, 53], '#3e5a7a', '#d8cfb8')
for y in range(47, 50): put(55, y, 'p'); put(56, y, 'p')   # from the north door down to the road
for x in range(54, 58): put(x, 52, 'p')                      # the south door's step onto the road
# inside: a bed, a table and a chair each, a fireplace in the north house
objects += [{'k': 'bed', 'x': 57, 'y': 43}, {'k': 'table', 'x': 54, 'y': 43}, {'k': 'chair', 'x': 54, 'y': 44}, {'k': 'fireplace', 'x': 56, 'y': 43},
            {'k': 'bed', 'x': 57, 'y': 56}, {'k': 'table', 'x': 54, 'y': 56}, {'k': 'chair', 'x': 55, 'y': 56}]
# gas lamps by the crossing, either side of the road
objects += [{'k': 'lamp', 'x': PX - 1, 'y': 49}, {'k': 'lamp', 'x': PX + 2, 'y': 52}]
zone = {'name': 'Eastend', 'level': '1-5', 'origin': [OX, OY], 'size': [W, H], 'ground': 'grass',
        'tiles': [''.join(r) for r in rows], 'objects': objects, 'npcs': npcs, 'spawns': [], 'fishing': []}
out = {'ashvale3d': 'module', 'name': 'zone.eastend', 'api': 1, 'v': 1, 'data': zone}
open(os.path.join(HERE, 'data', 'zone.eastend.json'), 'w').write(json.dumps(out, separators=(',', ':')))
print('\n'.join(zone['tiles']))
