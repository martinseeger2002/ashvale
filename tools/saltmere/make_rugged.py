#!/usr/bin/env python3
"""make_rugged.py - Saltmere, run down (2026-10-19, the operator: "the empty streets of saltmere need to have cobble stones and decor - work
with qwen again - make it kind of ghetto and rugged - change buildings where you'd like - add new decor and reuse old - make one end of the
piers or board walk occupied by pirates that have some quest lines").

Edits data/zone.saltmere.json in place (the zone's generator, tools/make_zone_saltmere.mjs, is older than the zone's hand edits, so it is not
rerun):
  - every street of dirt is cobbled ('p' -> 'c');
  - the houses go grimy: salt-stained plaster, patched dark roofs (the town hall keeps its paint);
  - scenery along the streets (data/decor.json kinds, palette 'harbour'): scrap heaps, burning barrels, washing lines, shanties, salvaged
    planks, carts, fences - and by the quay and the beach rope, nets, lobster pots, drying racks and a rowboat past saving - each on the
    verge beside a street, facing it, kept off doorways, people and the town's own things, never closer than four tiles to another;
  - the south pier's head (x 511-515, y 72-77) is the pirates': their ship tied alongside, a black flag, two cannon on the walk in, rum, a
    sea chest, a fire in a barrel, and the crew of five (names, looks, lines drafted by the local Qwen model, Qwen3.5-9B, and edited; their
    quest lines are written up for the game's quest code in handoff/saltmere_pirates.md).
Everything it adds carries tag 'rugged' or 'pirates' and a rerun replaces it; the cobbles and the paint are idempotent. Also writes the
pirates' looks (data/parts/char.<id>.json) and the tricorn hat they wear (cloth.hat_tricorn, homes 'saltmere_pirates': not offered in the
character creator).
    python3 tools/saltmere/make_rugged.py      (after tools/decor/make_decor_data.py; then python3 build.py)
"""
import json, math, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ZP, PARTS = os.path.join(ROOT, 'data', 'zone.saltmere.json'), os.path.join(ROOT, 'data', 'parts')
TAGS = ('rugged', 'pirates', 'piers')
J = json.load(open(ZP, encoding='utf-8')); Z = J['data']; OX, OY = Z['origin']
Z['objects'] = [o for o in Z['objects'] if o.get('tag') not in TAGS]; Z['npcs'] = [n for n in Z['npcs'] if n.get('tag') not in TAGS]
T = [list(r) for r in Z['tiles']]
at = lambda x, y: T[y - OY][x - OX] if 0 <= y - OY < len(T) and 0 <= x - OX < len(T[0]) else None

# ---- the streets: cobbles everywhere
for r in T:
    for i, c in enumerate(r):
        if c == 'p': r[i] = 'c'
Z['tiles'] = [''.join(r) for r in T]

# ---- the houses: grime
WALLS = ['#a89c86', '#9a9282', '#b0a48c', '#8e8676', '#a4987e', '#968c7a', '#a0947c']
ROOFS = ['#3a3430', '#4a3a30', '#2e3438', '#4a4038', '#3e2e28', '#34302c', '#3a3a34']
BLD = [o for o in Z['objects'] if o['k'] in ('house', 'shop', 'smithy', 'church')]
for i, o in enumerate(sorted(BLD, key=lambda o: (o['y'], o['x']))):
    if o.get('sign') == 'Town Hall': continue
    o['wall'], o['roof'] = WALLS[(i * 3) % len(WALLS)], ROOFS[(i * 5) % len(ROOFS)]

# ---- the pirates' end of the south pier
HEAD = (511, 72, 515, 77)
pir = lambda k, x, y, **kw: Z['objects'].append(dict({'k': k, 'x': x, 'y': y, 'w': 1, 'h': 1, 'pal': 'harbour', 'ry': 0, 'tag': 'pirates', 'solid': True}, **kw))
pir('pirate_ship', 515, 74, ry=round(math.pi / 2, 4), dz=0.5)   # bow north, tied along the head's east side
pir('pirate_flag', 515, 72); pir('cannon', 511, 73, ry=round(math.pi, 4)); pir('cannon', 511, 76, ry=round(math.pi, 4))   # their muzzles at the town
pir('rum_barrels', 513, 77); pir('sea_chest', 511, 77, ry=round(math.pi / 2, 4)); pir('burn_barrel', 515, 77); pir('rope_coil', 513, 72); pir('lantern_post', 512, 72)
CREW = [   # id, name, x, y, examine, lines, look
    ('ruark', 'Captain Ruark Blackwater', 514, 74, "Captain Ruark Blackwater. He claims to own the inland sea; mostly he owns a bad reputation.",
     ["Saltmere's a fine port. Nobody asks where a ship's been, and nobody asks twice.",
      "We're fishermen, friend. Big fish. The kind that carry silver and sail for Ashvale."],
     {'build': 'big', 'gear': {'weapon': 'sword_t3'}, 'outfit': {'skin': '#c88a5a', 'hair': 'long', 'hairColor': '#1a1612', 'beard': 'full', 'beardColor': '#1a1612',
      'hat': {'style': 'tricorn', 'color': '#1e1c1e'}, 'shirt': {'style': 'vest', 'color': '#2a3a6a'}, 'pants': {'style': 'trousers', 'color': '#2a2420'}, 'boots': '#1e1612', 'belt': '#7a2a24', 'cape': '#4a1a1a'}}),
    ('grix', 'Quartermaster Grix', 512, 76, "Quartermaster Grix, who counts the stores twice and eats the difference.",
     ["Short on nails, long on trouble. Mind where you put your feet, and your hands.",
      "I've written your rum down as 'navigational fuel'. The captain likes a tidy ledger."],
     {'build': 'small', 'outfit': {'skin': '#e0b088', 'hair': 'bald', 'beard': 'moustache', 'beardColor': '#6a4a2a', 'hat': {'style': 'bandana', 'color': '#3a5a3a'},
      'shirt': {'style': 'shirt', 'color': '#c8c0a8'}, 'pants': {'style': 'trousers', 'color': '#4a3a2a'}, 'boots': '#3a2a1a', 'apron': '#5a4632'}}),
    ('grizz', 'Grizz the ship\'s cook', 514, 76, "Grizz, the ship's cook: a gentle giant who can make a fresh mackerel look like evidence.",
     ["Eat your greens, lad. They'll make you strong enough to lift your own spoon.",
      "Fish stew again. It was fish stew yesterday and it will be fish stew the day after the world ends."],
     {'build': 'big', 'gear': {'weapon': 'mace_t1'}, 'outfit': {'skin': '#8a5a3a', 'hair': 'bald', 'beard': 'stubble', 'beardColor': '#2a1a12', 'hat': {'style': 'bandana', 'color': '#e8e4dc'},
      'shirt': {'style': 'shirt', 'color': '#d8d0c0'}, 'pants': {'style': 'trousers', 'color': '#3a3a3a'}, 'boots': '#2a2018', 'apron': '#c8c0b0'}}),
    ('soot', 'Soot the lookout', 514, 72, "Soot, the lookout. Spots a falling leaf and calls it an enemy ship, just to be noticed.",
     ["A sail! On the horizon! ...No. A gull. A very suspicious gull.",
      "From up the mast you can see Ashvale's smoke. And the castle. And, once, a whale. Probably a whale."],
     {'build': 'small', 'outfit': {'skin': '#e8b896', 'hair': 'curly', 'hairColor': '#3a2a1a', 'hat': {'style': 'cap', 'color': '#5a5a5a'},
      'shirt': {'style': 'tunic', 'color': '#6a6a6a'}, 'pants': {'style': 'shorts', 'color': '#3a3a4a'}, 'boots': '#3a2a1a'}}),
    ('toby', 'Toby the cabin boy', 512, 73, "Toby, the cabin boy, who polishes the rail until it shines brighter than his prospects.",
     ["The captain says if I swab well enough one day I'll get a sword. I've been swabbing for two years.",
      "Don't tell the quartermaster, but there's a cat that sleeps in the rum store. I call her Admiral."],
     {'build': 'small', 'outfit': {'skin': '#d8a070', 'hair': 'short', 'hairColor': '#8a5a2a', 'hat': {'style': 'bandana', 'color': '#a83a2a'},
      'shirt': {'style': 'shirt', 'color': '#e0d8c8'}, 'pants': {'style': 'shorts', 'color': '#4a5a7a'}, 'boots': '#5a3a20'}}),
]
try:   # the crew's quests (tools/saltmere/make_pirate_quests.py): kept when the crew is rebuilt
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from make_pirate_quests import CREW_QUESTS
except Exception: CREW_QUESTS = {}
for cid, name, x, y, ex, lines, look in CREW:
    Z['npcs'].append(dict({'id': cid, 'name': name, 'look': cid, 'x': x, 'y': y, 'examine': ex, 'lines': lines, 'tag': 'pirates'},
                          **({'quest': CREW_QUESTS[cid][0], 'quests': CREW_QUESTS[cid], 'talk': 'quest'} if cid in CREW_QUESTS else {})))
    with open(os.path.join(PARTS, 'char.' + cid + '.json'), 'w', encoding='utf-8') as f:
        json.dump(dict({'ashvale3d': 'part', 'api': 1, 'v': 1, 'id': 'char.' + cid, 'kind': 'char', 'role': 'npc', 'name': name, 'body': 'humanoid'}, **look), f, separators=(',', ':'), ensure_ascii=False)
with open(os.path.join(PARTS, 'cloth.hat_tricorn.json'), 'w', encoding='utf-8') as f:   # three cocked brim corners (a 3-sided cylinder, a point to the front) on a low crown, a gold edge
    json.dump({'ashvale3d': 'part', 'api': 1, 'v': 1, 'id': 'cloth.hat_tricorn', 'kind': 'cloth', 'homes': ['saltmere_pirates'], 'slot': 'hat', 'style': 'tricorn', 'color': '#1e1c1e', 'hides': [], 'items': {'hat_tricorn': '#1e1c1e'},   # the Captain's tricorn, a reward of Black Sails
               'shapes': [{'t': 'cyl', 's': [0.27, 0.27, 0.05], 'seg': 3, 'c': '$c', 'p': [0, 0.2, 0.0], 'j': 'head'}, {'t': 'cyl', 's': [0.275, 0.275, 0.015], 'seg': 3, 'c': '#b08a3a', 'p': [0, 0.226, 0.0], 'j': 'head'},
                          {'t': 'cyl', 's': [0.13, 0.155, 0.13], 'seg': 10, 'c': '$c', 'p': [0, 0.27, -0.01], 'j': 'head'}], 'ground': {'p': [0, -0.1, 0]}}, f, separators=(',', ':'))

# ---- the piers: boards on every pier tile ('B'), an edge where it meets the water, a pile and rope every other metre, bollards at the
# heads' corners and a ladder off each head (2026-10-19: "fix the piers at saltmere as actual decor assets that look and operate nice")
WET = ('~', 'v')
seen, piers = set(), []
for y0 in range(OY, OY + len(T)):
    for x0 in range(OX, OX + len(T[0])):
        if at(x0, y0) != 'B' or (x0, y0) in seen: continue
        st, comp = [(x0, y0)], []; seen.add((x0, y0))
        while st:
            a, b = st.pop(); comp.append((a, b))
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if at(a + dx, b + dy) == 'B' and (a + dx, b + dy) not in seen: seen.add((a + dx, b + dy)); st.append((a + dx, b + dy))
        piers.append(comp)
NPCAT = {(n['x'], n['y']) for n in Z['npcs']}
nb = 0
for comp in piers:
    xs = [p[0] for p in comp]; x1 = max(xs); headX = x1 - 4
    head = [p for p in comp if p[0] >= headX]; hy0, hy1 = min(p[1] for p in head), max(p[1] for p in head)
    for x, y in comp:
        pp = lambda k, **kw: Z['objects'].append(dict({'k': k, 'x': x, 'y': y, 'w': 1, 'h': 1, 'pal': 'harbour', 'ry': 0, 'tag': 'piers'}, **kw))
        pp('pier_deck', ry=round(math.pi / 2, 4) if x >= headX else 0)   # the walk's boards run across it; the head's across the head
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if at(x + dx, y + dy) not in WET: continue
            pp('pier_post' if (x + y) % 2 == 0 else 'pier_edge', ry=round(math.atan2(dx, dy), 4))
    for cx, cy in ((headX, hy0), (x1, hy0), (headX, hy1), (x1, hy1)):
        if (cx, cy) not in NPCAT and not any(o['x'] == cx and o['y'] == cy and o.get('tag') == 'pirates' for o in Z['objects']):
            Z['objects'].append({'k': 'bollard', 'x': cx, 'y': cy, 'w': 1, 'h': 1, 'pal': 'harbour', 'ry': 0, 'tag': 'piers'}); nb += 1
    ly = (hy0 + hy1) // 2 if (hy0 + hy1) // 2 not in (74, 75) or x1 != 515 else hy1 - 1   # not where the pirates' ship lies alongside
    Z['objects'].append({'k': 'pier_ladder', 'x': x1, 'y': ly, 'w': 1, 'h': 1, 'pal': 'harbour', 'ry': round(math.pi / 2, 4), 'tag': 'piers'})
# ---- the streets' scenery
taken = set()
def mark(x0, y0, x1, y1, pad=0):
    for y in range(y0 - pad, y1 + pad + 1):
        for x in range(x0 - pad, x1 + pad + 1): taken.add((x, y))
for o in Z['objects']:
    w, h = o.get('w', 1), o.get('h', 1); big = o['k'] in ('house', 'shop', 'smithy', 'church')
    mark(o['x'], o['y'], o['x'] + w - 1, o['y'] + h - 1, 0 if big else 1)
    if o.get('door'): mark(o['door'][0], o['door'][1], o['door'][0], o['door'][1], 2)
for n in Z['npcs']: mark(n['x'], n['y'], n['x'], n['y'], 1)
mark(*HEAD, 1)
D4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
HARBOUR = [('rope_coil', 3), ('net_pile', 3), ('lobster_pots', 3), ('fish_rack', 2), ('plank_pile', 2), ('trash_heap', 1), ('burn_barrel', 1)]
TOWN = [('trash_heap', 4), ('burn_barrel', 3), ('laundry_line', 2), ('plank_pile', 2), ('shanty', 2), ('rail_fence', 2), ('broken_cart', 1), ('supply_cache', 1), ('stump_axe', 1), ('dead_tree', 1), ('lantern_post', 1)]
h32 = lambda x, y, s=0: ((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) & 0x7fffffff
def pick(bag, x, y):
    tot = sum(w for _, w in bag); r = h32(x, y, 7) % tot
    for k, w in bag:
        if r < w: return k
        r -= w
cands = []
for y in range(OY, OY + len(T)):
    for x in range(OX, OX + len(T[0])):
        if at(x, y) not in ('.', 'f', 's') or (x, y) in taken: continue
        st = [(dx, dy) for dx, dy in D4 if at(x + dx, y + dy) == 'c']
        if st: cands.append((h32(x, y), x, y, st[0]))
cands.sort()
placed = []
for _, x, y, (dx, dy) in cands:
    if any(max(abs(x - a), abs(y - b)) < 4 for a, b, _ in placed): continue
    harbour = x >= 470 or at(x, y) == 's' or any(at(x + u, y + v) in ('s', '~') for u in (-2, 0, 2) for v in (-2, 0, 2))
    k = pick(HARBOUR, x, y) if harbour else pick(TOWN, x, y)
    if at(x, y) == 's' and h32(x, y, 3) % 3 == 0: k = 'upturned_boat'
    ry = math.atan2(dx, dy) + ((h32(x, y, 5) % 100) / 100 - 0.5) * 0.5   # facing the street, a little askew
    o = {'k': k, 'x': x, 'y': y, 'w': 1, 'h': 1, 'pal': 'harbour', 'ry': round(ry, 3), 's': round(0.9 + (h32(x, y, 9) % 20) / 100, 2), 'tag': 'rugged', 'solid': True}
    Z['objects'].append(o); placed.append((x, y, k))
for tx, ty in ((452, 21), (420, 21)):   # wanted boards on the high street's verge, by the Tap and by the hall: the nearest free tile to each spot
    best = None
    for y in range(ty - 3, ty + 4):
        for x in range(tx - 3, tx + 4):
            if at(x, y) not in ('.', 'f') or (x, y) in taken or any(max(abs(x - a), abs(y - b)) < 2 for a, b, _ in placed) or not any(at(x + u, y + v) == 'c' for u, v in D4): continue
            d = abs(x - tx) + abs(y - ty)
            if best is None or d < best[0]: best = (d, x, y, [(u, v) for u, v in D4 if at(x + u, y + v) == 'c'][0])
    if best:
        _, x, y, (dx, dy) = best
        Z['objects'].append({'k': 'notice_board', 'x': x, 'y': y, 'w': 1, 'h': 1, 'pal': 'harbour', 'ry': round(math.atan2(dx, dy), 3), 'tag': 'rugged', 'solid': True}); placed.append((x, y, 'notice_board'))
# ---- the town's own props stand in the way (2026-10-21 playtest: "can walk through things"): an 'X' under each crate, barrel, stall, table,
# lamp and sign on open ground (not the pier's boards, which the decking above reads, nor the cobbles) - one at a time, and only if every tile you could reach before is still reached (no street, door or person cut off)
BLOCKS = set(json.load(open(os.path.join(ROOT, 'data', 'rules.json'), encoding='utf-8'))['data']['tiles']['block'])
SOLID = ('crate', 'barrel', 'stall', 'table', 'lamp', 'signpost', 'wsign')
doors = {tuple(o['door']) for o in Z['objects'] if o.get('door')}
def reach(T):
    W, H = len(T[0]), len(T); x0, y0 = next((x, y) for y in range(H) for x in range(W) if T[y][x] == 'c'); seen = {(x0, y0)}; st = [(x0, y0)]
    while st:
        x, y = st.pop()
        for dx, dy in D4:
            u, v = x + dx, y + dy
            if 0 <= u < W and 0 <= v < H and (u, v) not in seen and T[v][u] not in BLOCKS: seen.add((u, v)); st.append((u, v))
    return seen
T = [list(r) for r in Z['tiles']]; R0 = reach(T); nsolid = 0
for o in sorted(Z['objects'], key=lambda o: (o['y'], o['x'])):
    if o['k'] not in SOLID or o.get('w', 1) * o.get('h', 1) > 1: continue
    x, y = o['x'] - OX, o['y'] - OY
    if not (0 <= y < len(T) and 0 <= x < len(T[0])) or T[y][x] in BLOCKS or T[y][x] in ('B', 'c') or (o['x'], o['y']) in doors or (o['x'], o['y']) in NPCAT: continue
    was = T[y][x]; T[y][x] = 'X'
    if reach(T) != R0 - {(x, y)}: T[y][x] = was; continue
    R0 = R0 - {(x, y)}; nsolid += 1
Z['tiles'] = [''.join(r) for r in T]
print('saltmere: %d props made solid' % nsolid)
with open(ZP, 'w', encoding='utf-8') as f:
    json.dump(J, f, separators=(',', ':'), ensure_ascii=False)
from collections import Counter
print('saltmere: %d piers decked (%d pieces, %d bollards), %d street tiles cobbled, %d houses repainted, %d pieces of scenery (%s), the pirates: %d crew, %d pieces on the south pier'
      % (len(piers), sum(1 for o in Z['objects'] if o.get('tag') == 'piers'), nb, sum(r.count('c') for r in Z['tiles']), len(BLD) - 1, len(placed), ', '.join('%s %d' % kv for kv in Counter(k for _, _, k in placed).most_common()),
         len(CREW), sum(1 for o in Z['objects'] if o.get('tag') == 'pirates')))
