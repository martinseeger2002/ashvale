"""[Claude 2026-10-19] The Saltmere Links zones, from data/golf.course.json (tools/make_golf.py) and the world's own tiles
(tools/golf/raw_tiles.json):
  data/zone.golf.json      the course box: open grass where the course is (engolf draws the fairways, greens and bunkers on
                           it), '~' where its ponds and the burn are, the world's own trees and rocks everywhere else (the same
                           ones the ball hits: make_golf lists them from the same tiles), the clubhouse with Fergus the starter
                           and Isla's pro shop, the path along the shore to its door, the scores board
  data/zone.golfpath.json  the path from Saltmere's north hedge (a gap cut at 477) to the course, with a fingerpost
  python3 tools/make_golf.py && python3 tools/golf/make_golf_zones.py"""
import json, os, math
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
D = json.load(open(os.path.join(ROOT, 'data', 'golf.course.json')))
RAW = json.load(open(os.path.join(HERE, 'raw_tiles.json'))); RX, RY = RAW['x0'], RAW['y0']
raw = lambda x, y: RAW['rows'][y - RY][x - RX]
X0, Y0, X1, Y1 = D['box']; Q = D['q']
cell = lambda x, y: D['rows'][(y - Y0) * Q + 1][(x - X0) * Q + 1]   # the cell at the tile's centre, as make_golf's tree list uses
def module(name, data): return {'ashvale3d': 'module', 'name': 'zone.' + name, 'api': 1, 'v': 1, 'data': data}
# ---- the course
rows = []
for y in range(Y0, Y1):
    r = ''
    for x in range(X0, X1):
        c = cell(x, y)
        if c == 'c': r += 'i'
        elif c == 'x': r += 'c'   # the cobbled road
        elif c in 'wo': r += '~'
        elif c == 'h': r += raw(x, y)
        else: r += '.'
    rows.append(r)
CX, CY, CW, CH = 627, -126, 16, 11   # 2026-10-20 (his floor plan, https://claude.ai/artifact/PPK9tBMuhdHis7odbtNR7e): 16 x 11, grown west and north from 631,-122 12 x 7; the south wall, door and road stay
# 2026-10-20 ("put the town portal outside of the clubhouse"): the portal stands east of the door (rules.portals 'golf',
# 647,-114); the trees round it and in front of the door are cleared so both stand in the open
for y in range(-117, -110):
    for x in range(636, 652):
        if (abs(x - 647) <= 2 and abs(y + 114) <= 2) or (x <= 643 and y >= -115):
            c = rows[y - Y0][x - X0]
            if c in 'TPOWMYULQEr': rows[y - Y0] = rows[y - Y0][:x - X0] + ',' + rows[y - Y0][x - X0 + 1:]
# [Claude 2026-10-22] the course moved back from the clubhouse along the shore (course.py DX, DY; the operator: "further away from the
# clubhouse along the shoreline"): the cobbled walk from the back door out to the 1st tee (make_golf TEEPATH) gets a clear verge of
# grass two tiles each side, as the road from Saltmere has, so it does not run through the trees
for y in range(Y0, CY):
    for x in range(CX, CX + CW + 6):
        if rows[y - Y0][x - X0] in 'TPOWMYULQERNICGASVr^K' and any(rows[y + dy - Y0][x + dx - X0] == 'c' for dy in range(-2, 3) for dx in range(-2, 3) if Y0 <= y + dy < CY):
            rows[y - Y0] = rows[y - Y0][:x - X0] + ',' + rows[y - Y0][x - X0 + 1:]
golf = {'name': 'The Saltmere Links', 'level': 'safe', 'flat': True, 'turf': True, 'returnTo': [635, -118], 'origin': [X0, Y0], 'size': [X1 - X0, Y1 - Y0], 'ground': 'grass', 'tiles': rows,
  'objects': [
    {'k': 'house', 'x': CX, 'y': CY, 'w': CW, 'h': CH, 'door': [637, CY + CH - 1], 'sign': 'The Saltmere Links Clubhouse', 'roof': '#2f5a3a', 'wall': '#ece4cf', 'enter': True, 'floors': 2, 'stairsAt': [641, -117],
     'backdoor': [635, CY]},   # 2026-10-20: "a door in the back of the clubhouse that allows people to walk from the golf course into the clubhouse, but not from the clubhouse into the golf course" (world.js oneWay)   # 2026-10-20: "Put a second story in the clubhouse" (all four tables on it); the stairs in the south-east corner
    {'k': 'counter', 'x': 639, 'y': -125, 'w': 3, 'h': 1},
    {'k': 'rack', 'x': 642, 'y': -119, 'w': 1, 'h': 1},
    {'k': 'bench', 'x': 636, 'y': -125, 'w': 2, 'h': 1},
    # 2026-10-20: "I want a slot machines on the left hand wall the whole length of the building ... remove the slot machines from
    # downstairs": nine Fortune Engines upstairs along the west wall (backs to it, facing east), each with its seat; lk1-lk9 (the Bank keys on them)
    *[{'k': 'fortune', 'id': 'lk%d' % (i + 1), 'x': 628, 'y': -125 + i, 'seat': [629, -125 + i], 'face': 'e', 'dx': -0.3, 'w': 1, 'h': 1, 'lv': 1} for i in range(9)],
    # 2026-10-20: a chess board in the clubhouse (a Chess Park table: the same games, wagers and board)
    # 2026-10-20 ("rotated 90 degrees and put against the wall", "benches on the chess game"): the seats run east-west
    # along the south wall, west of the door; the south-east corner (640-641, -118..-117) is kept clear for the stairs
    {'k': 'chesstable', 'id': 'links1', 'x': 634, 'y': -117, 'seats': [[633, -117], [635, -117]], 'board': 'driftwood', 'w': 1, 'h': 1},
    {'k': 'bench', 'x': 633, 'y': -117, 'face': 'e', 'w': 1, 'h': 1}, {'k': 'bench', 'x': 635, 'y': -117, 'face': 'w', 'w': 1, 'h': 1},
    # 2026-10-20: the tables upstairs, each its own modules (src/dicerules.js + dicetable.js, wheelrules + wheeltable, twentyonerules
    # + twentyonetable; engtables.js / hudtables.js), shared rounds run by the @ashvale Bank (tools/bank/tables.py): "craps and blackjack on the
    # second floor and roulette and blackjack on the third floor", then all on one floor of a wider clubhouse. Public text never names the games. Each table: its footprint (blocked),
    # the dealer's tile behind it (north), six standing spots, one tile each (no chairs); the stairs (641,-117 / 640,-117) and their landings
    # (641,-118 / 640,-118) stay clear, rows -118 and -117 are the walkway. Twenty-one: seven spots, spot 1 at the dealer's left (the operator).
    # The operator's floor plan (the planner artifact, saved 2026-10-21 00:37 UTC), two rows north of where he drew it because the room grew
    # north, not south over the door and road: the dice table and the wheel west, the twenty-one tables east, all four dealers in the
    # middle (the pit, roped off - players never step in), the players round the outside. rot: quarter turns clockwise (2: dealer south).
    # 2026-10-21: "make the craps tables bigger so they're realistically size" - the dice table is a 12-foot table (3.64 m): four tiles,
    # one west; three players to each half, one at each end and two along the rail
    *[dict(k='gametable', game=g, id=i, lv=1, x=x, y=y, w=w, h=2, rot=r, dealer=d, spots=sp) for (g, i, x, y, w, r, d, sp) in [
        ('dice', 'cd1', 631, -119, 4, 0, [633, -120], [[630, -118], [631, -117], [632, -117], [633, -117], [634, -117], [635, -118]]),
        # 2026-10-21: "The players at the roulette table should be placed around the betting area ... they shouldn't be standing around the
        # wheel. They can't bet from there. You might have to make the roulette table a little bit bigger": four tiles, the wheel east beside the
        # dealer, the players along the layout (north) and round its west end
        ('wheel', 'cw1', 631, -123, 4, 2, [633, -121], [[630, -122], [630, -123], [630, -124], [631, -124], [632, -124], [633, -124]]),
        ('twentyone', 'cb1', 637, -123, 3, 2, [638, -121], [[636, -122], [636, -123], [637, -124], [638, -124], [639, -124], [640, -123], [640, -122]]),
        ('twentyone', 'cb2', 637, -119, 3, 0, [638, -120], [[640, -119], [640, -118], [639, -117], [638, -117], [637, -117], [636, -118], [636, -119]])]],
    {'k': 'pit', 'x': 632, 'y': -121, 'w': 8, 'h': 2, 'lv': 1},   # the dealers' pit: no player walks in (core blocks it upstairs)
    *[dict(k='velvetrope', lv=1, x=min(a, c), y=min(b, d), x1=a, y1=b, x2=c, y2=d) for (a, b, c, d) in [(640, -121, 640, -119), (635, -119, 637, -119), (635, -121, 637, -121), (632, -121, 632, -119)]],   # tile-edge lines, as drawn
    # 2026-10-20: "a golf outfit, clothing rack down there and a vendor that sells golf clothing" - Saltmere Links Golfwear
    # (tools/golf/make_golfwear.py): three racks on the north wall, west of the bench (polos; jackets and trousers; skirts)
    {'k': 'clothesrack', 'x': 629, 'y': -125, 'w': 1, 'h': 1, 'cols': ['#f2f0ea', '#2a3a5e', '#2f6a4a', '#a83030']},
    {'k': 'clothesrack', 'x': 631, 'y': -125, 'w': 1, 'h': 1, 'cols': ['#8a7452', '#b8a47a', '#2a3346', '#6e6e6a'], 'long': True},
    {'k': 'clothesrack', 'x': 633, 'y': -125, 'w': 1, 'h': 1, 'cols': ['#e8e4d8', '#2a3a5e', '#e8e4d8'], 'long': True},
    # 2026-10-21: "It's dark in there I thought the lights would light stuff up" - two lanterns hung from the ground floor's ceiling
    # (the tables' own lanterns light the floor above)
    {'k': 'pendant', 'x': 632, 'y': -121, 'lv': 0}, {'k': 'pendant', 'x': 638, 'y': -121, 'lv': 0},
    {'k': 'wsign', 'x': 634, 'y': -114, 'face': 's', 'board': 'golf', 'title': 'THE SALTMERE LINKS'},
    {'k': 'lamp', 'x': 630, 'y': -114}, {'k': 'lamp', 'x': 644, 'y': -114}],
  'npcs': [
    {'id': 'fergus', 'name': 'Fergus the starter', 'look': 'fergus', 'x': 638, 'y': -119, 'golf': True,
     'examine': 'The starter of the Saltmere Links. He keeps the tee sheet and the scores.'},
    {'id': 'rhona', 'name': 'Rhona the outfitter', 'look': 'rhona', 'x': 631, 'y': -123, 'shop': 'golfwear',
     'examine': 'She dresses the Links: polos, jackets, golf trousers and skirts, a cap for the wind.'},
    {'id': 'isla', 'name': 'Isla the club pro', 'look': 'isla', 'x': 640, 'y': -124, 'shop': 'proshop',
     'examine': 'The club pro. She sells the club sets and knows every hole by heart.'},
    # 2026-10-20: a bank chest in the clubhouse, against the west wall (the town portal is outside, east of the door: rules.portals 'golf', tools/make_data.py)
    {'id': 'links_chest', 'name': 'Clubhouse chest', 'look': 'chest', 'x': 628, 'y': -119, 'chest': True,
     'examine': 'The clubhouse chest, brass-cornered. Everything you own from Ashvale is kept in your arcade wallet; this is where you see it.'}],
  'spawns': [], 'fishing': []}
# 2026-10-20: "the iron fence from the graveyard around the golf course so people can't wander on it". The railing
# runs round the course box; its south run (y -116) meets the clubhouse's west and east walls, so the clubhouse is the one
# way in (a round takes you out to the tee, leaving brings you back to its door). A tile that already blocks the way (a tree,
# a rock, the water: the world's BLOCK letters) keeps it and gets no railing.
BLOCK = 'TPORNIr~FHXWMYCGA^KUELQ'
FY = CY + CH - 1   # -116, the clubhouse's south wall row
# solid: it stands in the way (world.js stampDecor: a 'line' piece shuts the steps across it); ry turns the sides' sections north-south
ring = [(x, Y0, 0) for x in range(X0, X1)] + [(X0, y, 1.5708) for y in range(Y0 + 1, FY + 1)] + [(X1 - 1, y, 1.5708) for y in range(Y0 + 1, FY + 1)]
ring += [(x, FY, 0) for x in range(X0 + 1, CX)] + [(x, FY, 0) for x in range(CX + CW, X1 - 1)]
# 2026-10-20 ("remove any trees or rocks that are in the way of the fence around the golf course so that nobody can wander in"):
# a tree or rock on the railing's line left a gap in it; they are cleared and the railing runs through (only water keeps its gap)
for x, y, ry in ring:
    if rows[y - Y0][x - X0] in BLOCK and rows[y - Y0][x - X0] != '~': rows[y - Y0] = rows[y - Y0][:x - X0] + ',' + rows[y - Y0][x - X0 + 1:]
fence = [{'k': 'iron_fence', 'x': x, 'y': y, 'ry': ry, 'solid': True} for x, y, ry in ring if rows[y - Y0][x - X0] not in BLOCK]
golf['objects'] += fence
# ---- the path from Saltmere's hedge to the course's south-west corner
PX0, PY0, PX1, PY1 = 462, -132, 545, -24   # stops at Saltmere's north hedge (zone.saltmere: the gap at 477-478 and the fingerpost are in it; zones never overlap)
prow = [[raw(x, y) for x in range(PX0, PX1)] for y in range(PY0, PY1)]
def lay(x, y):   # a cobbled road three wide (2026-10-20: "a really nice one", joined to Saltmere's cobbles)
    for dx in (-1, 0, 1):
        if PX0 <= x + dx < PX1 and PY0 <= y < PY1: prow[y - PY0][x + dx - PX0] = 'c'
for y in range(-25, -35, -1): lay(477, y)                     # north from the gap in Saltmere's hedge
lamps = []
a, b = (477, -34), (544, -113)
n = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
for k in range(n + 1):
    x = round(a[0] + (b[0] - a[0]) * k / n + 2.5 * math.sin(k / 9)); y = round(a[1] + (b[1] - a[1]) * k / n)
    lay(x, y); lay(x, y + 1)
    if k % 12 == 6: lamps.append((x + (2 if (k // 12) % 2 else -2), y))   # lamps along it, side to side
for x in range(536, 545):
    for yy in (-114, -113, -112): lay(x, yy)
for y in range(PY1 - PY0):   # a clear verge of grass two tiles each side of the road: no trees or rocks crowding it
    for x in range(PX1 - PX0):
        if prow[y][x] == 'c': continue
        near = any(0 <= y + dy < PY1 - PY0 and 0 <= x + dx < PX1 - PX0 and prow[y + dy][x + dx] == 'c' for dy in range(-2, 3) for dx in range(-2, 3))
        if near and prow[y][x] not in '~sB': prow[y][x] = '.'
path = {'name': 'Saltmere Links path', 'level': 'safe', 'flat': True, 'origin': [PX0, PY0], 'size': [PX1 - PX0, PY1 - PY0], 'ground': 'grass', 'ownWays': True,
  'tiles': [''.join(r) for r in prow],
  'objects': [{'k': 'lamp', 'x': x, 'y': y} for x, y in lamps if PX0 <= x < PX1 and PY0 <= y < PY1] + [{'k': 'bench', 'x': 503, 'y': -64, 'w': 2, 'h': 1}],
  'npcs': [], 'spawns': [], 'fishing': []}
# ---- the shore between the path and the bay, levelled (2026-10-20: "remove the hill on the walk from Saltmere to the clubhouse")
SX0, SY0, SX1, SY1 = 545, -104, 582, -24
shore = {'name': 'Saltmere Links shore', 'level': 'safe', 'flat': True, 'origin': [SX0, SY0], 'size': [SX1 - SX0, SY1 - SY0], 'ground': 'grass', 'ownWays': True,
  'tiles': [''.join(raw(x, y) for x in range(SX0, SX1)) for y in range(SY0, SY1)], 'objects': [], 'npcs': [], 'spawns': [], 'fishing': []}
for nm, z in (('golf', golf), ('golfpath', path), ('golfshore', shore)):
    json.dump(module(nm, z), open(os.path.join(ROOT, 'data', 'zone.%s.json' % nm), 'w'), separators=(',', ':'))
    print(nm, z['origin'], z['size'], sum(r.count('p') for r in z['tiles']), 'path tiles')
