#!/usr/bin/env python3
"""make_zone_ziibiing.py - Ziibiing ("at the river"), an Ojibwe village of wigwams (2026-10-07: "build me an American
Indian village with Ojibwe culture living in wigwams. There should be a canoe on the shore of the river ... Add seven NPC's all
in ... Ojibwe Regalia").

WHERE IT STANDS (2026-10-10/11, handoff/site_search/sites.md, "site 8"): the village left the brook south of Ashvale for
the OTHER continent - 50.27 N 128.6 W, a real two-banked river 34 m wide, maple climate, in temperate forest, 34 km of sea from
Ashvale (the portal stones join the two). Game tiles there are vale coordinates like everywhere (the net lays every face into
one plane, src/world.js onFace); the ground itself is face 13's, sampled through the net exactly as the game draws it. The
village stands on the river's east bank where a clearing meets the water; the sugar camp is up the trail north of it in the
maple-birch grove; the manoomin stands in the broad shallows of the bend upstream; the flint and red willow banks are a short
paddle downstream, the obsidian bank a short paddle upstream past the rice. The zone keeps the world's own tiles (the river, its
shallows, the bank, the pond by the trail) and only clears the village ground.
Writes data/zone.{ziibiing,lodges,ricelake,sugarcamp,flintbank,willowbank,obsidianbank}.json and data/extra/ziibiing_places.json
(what tools/make_data.py needs to know: the sugar camp's fire and maples, the groves) and sets the quest
markers in data/extra/quests.json.   python3 tools/make_zone_ziibiing.py   (then tools/make_data.py)"""
import json, os, subprocess, math, random
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(HERE, 'data', 'globecfg.json')))['data']
FIRE = (32498, -2350)                      # the communal fire: site 8's east bank, in the clearing, 13 tiles from the shallows
OX, OY, W, H = 32464, -2411, 60, 75       # the zone: x 32464..32523, y -2411..-2337 - the bank and the river's edge (SW), the
                                          # clearing, the pond, and the trail north through the grove's edge up to the sugar camp
NORTH = (-0.714, 0.700)                   # true north on the tile grid at the fire (engine trueNorth; sites.json trueNorthGridVector)
EAST = (-NORTH[1], NORTH[0])              # the sunrise: every wigwam door faces it (the operator: "Wigwam doors always face east")
CAMP = (FIRE[0] - 10, FIRE[1] - 74)       # the sugar camp's corner (16 x 13), 60 m up the trail
CAMP_FIRE = (CAMP[0] + 8, CAMP[1] + 7)
# the groves worldgen plants round these places (globecfg.groves via data/extra/ziibiing_places.json): the maple-birch wood the
# sugar camp stands in, north of the village, and a cedar-tamarack wet wood by the obsidian bank for push poles and knockers
GROVES = [{'piece': 'ziibiing', 'x': FIRE[0] - 13, 'y': FIRE[1] - 133, 'rx': 160, 'ry': 105, 'sp': 'MMMEE', 'dens': 0.6, 'edge': 35},
          {'piece': 'ziibiing', 'x': 32574, 'y': -2280, 'rx': 30, 'ry': 18, 'sp': 'QQLL', 'dens': 0.6, 'edge': 10}]

def tiles_at(X, Y, Wd, Ht, more=()):
    """the world's tiles of a vale rectangle, through the net (the rectangle may lie on any face), with the hand-made zones in
    `more` laid as set pieces and the groves planted - what the game itself will draw there. The groves ride on the ziibiing
    piece once that zone is written; before, they are given to worldgen on their own (W.setGroves)."""
    js = """
const fs=require('fs'),path=require('path'),G0=require('./src/globe.js'),AW=require('./src/worldgen.js');
const mod=n=>JSON.parse(fs.readFileSync(path.join('data',n+'.json'),'utf8')).data, cfg=mod('globecfg');
const MORE=%s, GROVES=%s;
const zs=['village','whisperwood','saltmere','wolfden','cavemouth'].concat(MORE).map(id=>Object.assign({id},mod('zone.'+id)));
const W=AW.createWorldgen(G0.createGlobe(cfg),{seed:cfg.seed});
const OXg=cfg.origin[0], OYg=cfg.origin[1], N=W.net(cfg.face);
const onFace=(vx,vy)=>N.toFace(vx+OXg,-(vy+OYg));
W.setSetPieces(W.piecesFromZones(zs,cfg.face,OXg,OYg,{belt:cfg.belt||{},links:cfg.links||[],groves:MORE.indexOf('ziibiing')>=0?GROVES:[]}));
if (MORE.indexOf('ziibiing')<0) W.setGroves(GROVES.map(q=>{const t=onFace(q.x+0.5,q.y+0.5); return Object.assign({},q,{face:t.f,x:Math.floor(t.x),y:Math.floor(-t.y)});}));
const rows=[]; for (let y=0;y<%d;y++){ let s=''; for (let x=0;x<%d;x++){ const q=onFace(%d+x+0.5,%d+y+0.5); s+=W.tileAt(q.f,Math.floor(q.x),Math.floor(-q.y)); } rows.push(s); }
console.log(JSON.stringify(rows));""" % (json.dumps(list(more)), json.dumps(GROVES), Ht, Wd, X, Y)
    return [list(r) for r in json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, cwd=HERE, check=True).stdout)]

g = tiles_at(OX, OY, W, H)
at = lambda x, y: g[y - OY][x - OX]
def put(x, y, c): g[y - OY][x - OX] = c
inside = lambda x, y: OX <= x < OX + W and OY <= y < OY + H
WET = '~v'
land = lambda x, y: inside(x, y) and at(x, y) not in WET and at(x, y) != 'B'
taken = set()   # tiles nothing else may use: wigwam floors, doorways, the portal, the people
def nearland(x, y, w=1, h=1):
    """the nearest spot (ring by ring) whose w x h footprint is open ground, off the water and off anything placed"""
    for r in range(0, 12):
        best = None
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r: continue
                X, Y = x + dx, y + dy
                if all(land(X + i, Y + j) and at(X + i, Y + j) in '.d,' and (X + i, Y + j) not in taken for i in range(w) for j in range(h)):
                    d = dx * dx + dy * dy
                    if best is None or d < best[0]: best = (d, X, Y)
        if best: return (best[1], best[2])
    raise SystemExit('no open ground near %d,%d' % (x, y))

# the village ground: no trees or rocks between the fringe and the shore (the fringe keeps the woods it has; north of the
# village the zone is the grove's edge with the trail through it, left as the world made it)
for y in range(max(OY + 3, FIRE[1] - 26), OY + H):
    for x in range(OX + 3, OX + W - 3):
        if land(x, y) and at(x, y) in 'TPOWMYrRNIC,': put(x, y, '.')

# a dirt yard round the fire
for y in range(FIRE[1] - 3, FIRE[1] + 4):
    for x in range(FIRE[0] - 4, FIRE[0] + 5):
        if (x - FIRE[0]) ** 2 / 20 + (y - FIRE[1]) ** 2 / 10 <= 1 and land(x, y): put(x, y, 'd')
# the wigwams (waaginogaan) in a circle round the communal fire (2026-10-07: "arranged in a circle, and ... a communal
# campfire in the center"), every door to the east. Each is a 3 x 3 floor you cannot walk through; its doorway, on the east
# side, leads into its own round room (the lodges zone below)
RING = 11
WIGWAMS = [(FIRE[0] + round(math.cos(a) * RING), FIRE[1] + round(math.sin(a) * RING * 0.82)) for a in (math.radians(d) for d in range(15, 375, 60))]
for (wx, wy) in WIGWAMS:
    for yy in range(wy - 1, wy + 2):
        for xx in range(wx - 1, wx + 2):
            assert land(xx, yy), ('a wigwam in the water', wx, wy, xx, yy, at(xx, yy))
# the landing: a shallow tile of the river (its biggest water) nearest the fire, with dry ground behind it, and lying in one
# of the gaps between the wigwams (the ring's gaps are centred 45 + 60k degrees round the fire)
def wet_component(x0, y0):
    seen, q = {(x0, y0)}, [(x0, y0)]
    while q:
        x, y = q.pop()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if inside(nx, ny) and (nx, ny) not in seen and at(nx, ny) in WET: seen.add((nx, ny)); q.append((nx, ny))
    return seen
comps, seen_all = [], set()
for y in range(OY, OY + H):
    for x in range(OX, OX + W):
        if at(x, y) in WET and (x, y) not in seen_all: c = wet_component(x, y); comps.append(c); seen_all |= c
RIVER = max(comps, key=len)
def gap_pen(x, y):
    a = math.degrees(math.atan2(y - FIRE[1], x - FIRE[0])) % 360
    off = min(abs(((a - c + 180) % 360) - 180) for c in range(45, 405, 60))
    return 0 if off <= 20 else 40
cands = [(x, y) for (x, y) in RIVER if at(x, y) == 'v' and any(land(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
LAND = min(cands, key=lambda q: math.hypot(q[0] - FIRE[0], q[1] - FIRE[1]) + gap_pen(q[0], q[1]))
SHORE = min([(LAND[0] + dx, LAND[1] + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if land(LAND[0] + dx, LAND[1] + dy)],
            key=lambda q: math.hypot(q[0] - FIRE[0], q[1] - FIRE[1]))
# the path from the yard down to the landing: one step at a time toward the shore, the longer leg first
x, y = FIRE[0], FIRE[1]
while (x, y) != SHORE:
    dx, dy = SHORE[0] - x, SHORE[1] - y
    if abs(dx) >= abs(dy) and dx: x += 1 if dx > 0 else -1
    else: y += 1 if dy > 0 else -1
    if land(x, y): put(x, y, 'd')
# the footpath out of the village, north from the yard up to the sugar camp (through the zone's top edge: the camp's own
# bottom rows carry it on). No worldgen trail joins Ashvale any more - that is the sea's business now.
for y in range(OY, FIRE[1] - 3):
    if land(FIRE[0], y): put(FIRE[0], y, 'p')
objects, npcs = [], []
def obj(k, x, y, **kw): objects.append(dict(k=k, x=x, y=y, **kw))
LODGE_O, ROOM, GAP = (24000, 24400), 13, 40   # the lodges: round rooms far under the world in the net's empty space, beside the Spider Cave, 40 m apart so no room sees another
lodges = [['^'] * (GAP * (len(WIGWAMS) - 1) + ROOM) for _ in range(ROOM)]
lobj = []
for n, (wx, wy) in enumerate(WIGWAMS):
    for yy in range(wy - 1, wy + 2):
        for xx in range(wx - 1, wx + 2): put(xx, yy, 'H'); taken.add((xx, yy))
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
    assert land(wx + ox, wy + oy), ('a doorstep in the water', wx, wy)
    if land(wx + ox, wy + oy): put(wx + ox, wy + oy, 'd'); taken.add((wx + ox, wy + oy))
obj('campfire', FIRE[0], FIRE[1]); taken.add(FIRE)
RACK = nearland(SHORE[0] + 2, SHORE[1] - 4, 2, 1); obj('fishrack', RACK[0], RACK[1], w=2, h=1)
obj('woodpile', FIRE[0] - 3, FIRE[1] - 3)
obj('basket', FIRE[0] + 3, FIRE[1] + 3); obj('basket', FIRE[0] + 4, FIRE[1] + 3)
obj('ricebasket', FIRE[0] - 4, FIRE[1] + 3)
# no free canoe at the landing (2026-10-09): Migizi builds you a jiimaan (canoe) and sets it in the water here.
# Its places: the landing tile and the shallows beside it (a canoe left there lasts a game year, like any canoe at a bank)
BOATSPOTS = [[LAND[0], LAND[1], 0]] + [[x, y, 0] for x, y in ((LAND[0] - 1, LAND[1]), (LAND[0] + 1, LAND[1]), (LAND[0], LAND[1] - 1), (LAND[0], LAND[1] + 1))
                                        if inside(x, y) and at(x, y) in WET and any(land(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))][:2]
CANOE_UP = nearland(SHORE[0] - 5, SHORE[1] - 2); obj('canoe_up', CANOE_UP[0], CANOE_UP[1], name='Birch bark canoe')   # one turned over on the bank, drying
MIG = nearland(SHORE[0] - 2, SHORE[1] - 1); taken.add(MIG)   # Migizi, the canoe builder, at the landing
MAK = nearland(SHORE[0] + 2, SHORE[1] - 3); taken.add(MAK)   # Makwa, the fisherman, by his rack
# cattails at the village's water's edge; the landing kept clear
RND = random.Random(2026)
for y in range(OY + 1, OY + H - 1):
    for x in range(OX + 2, OX + W - 2):
        if at(x, y) not in WET or abs(x - LAND[0]) + abs(y - LAND[1]) < 5: continue
        edge = any(land(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        r = RND.random()
        if edge and r < 0.35: obj('reeds', x, y)   # (the rice itself stands in the shallows up the river: the ricelake zone below)
for o in objects:
    if o['k'] in ('fishrack', 'woodpile', 'basket', 'ricebasket', 'canoe_up'):
        for yy in range(o['y'], o['y'] + o.get('h', 1)):
            for xx in range(o['x'], o['x'] + o.get('w', 1)):
                if land(xx, yy): put(xx, yy, 'd')
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
npc('migizi', 'Migizi', MIG[0], MIG[1],
    ["Boozhoo. That jiimaan (canoe) on the bank is wiigwaas (birch bark) over cedar ribs, sewn and sealed with pitch. It is drying.",
     "Bring me four sheets of wiigwaas (birch bark) and two lengths of ojiitad (sinew), and I will build you a jiimaan (canoe) of your own. It takes me two days.",
     "When she is ready I set her in the water at the landing. Sit in her, then point where you want to go on the water. Point at the shore and she will bring you to it.",
     "Keep low and keep to the middle. The river is kind if you are patient with it.",
     "Bring me two sheets of wiigwaas (birch bark) and some ojiitad (sinew), and I will fold you a biskitenaagan (birch bark sap bucket) for the sugar bush."],
    'Migizi, the canoe maker, in a ribbon shirt, a beaded bandolier bag across his chest.')
npc('makwa', 'Makwa', MAK[0], MAK[1],
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
at('nookomis')['sapAt'] = [CAMP_FIRE[0] + 1, CAMP_FIRE[1] + 2]   # by the sugar camp's fire while the sap runs (core moves her there and back)
for _n in ('migizi', 'makwa', 'waabigwan', 'animikii', 'ziigwan'):   # the makak is the village chest, not a person
    at(_n)['sapDay'] = 1   # the rest of the village works the maples with her on a sap day, 8:00 to noon (rules.fires.sapDay)
# WHAT THEY SAY ON A SAP MORNING (2026-10-09: "short OPD-word sap dialogue with English"). Words the game
# already uses, each glossed as everywhere else - no new Ojibwe sentences, those need a speaker's approval.
at('migizi')['lines'].append("Before eight we take the biskitenaagan (sap buckets) up to the iskigamizigan (sugar camp). I folded those ones: two sheets of wiigwaas and one ojiitad, and a day drying in their folds.")
at('makwa')['lines'].append("Crust the snow hard one night and warm the next day - then the ininaatig (maples) run, and we go up with the buckets.")
at('waabigwan')['lines'].append("We are up at the sugar camp from eight until the sun is past the middle of the sky. Bring a bucket if you come: one tree fills one bucket in a day, and no tree gives twice.")
at('animikii')['lines'].append("A night that freezes and a day that thaws - that is what sets the sap running. I watch for it every spring, and it is not every spring that brings it.")
at('ziigwan')['lines'].append("Boil what you carry at the camp fire: zhiiwaagamizigan (maple syrup) first, and boil that again and you have ziinzibaakwadoons (candy). The bucket comes back empty either way.")
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
BOWYER = (FIRE[0] - 26, FIRE[1] - 6)   # on the west side of the village, near the water
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
taken = taken | {(o['x'] + dx, o['y'] + dy) for o in objects for dx in range(-2, 3) for dy in range(-2, 3)} | {(n['x'], n['y']) for n in npcs}
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

# THE MANOOMIN (2026-10-07: "Find the closest lake on the river to the village and put the Rice there. A big field of
# Rice"): here the river is the lake - 40 m up from the landing it bends and spreads into a broad shallow bar inside the bend,
# the slow water a field of manoomin stands in. The zone keeps the world's own tiles; the rice stands in the shallows, a few
# gaps in it, and thinner in the deep channel so a canoe still finds its way through
RX, RY, RW, RH = 32505, -2316, 42, 32
rg = tiles_at(RX, RY, RW, RH, ['ziibiing'])
robj = []
RR = random.Random(77)
for y in range(RH):
    for x in range(RW):
        gx, gy = RX + x, RY + y
        if rg[y][x] == 'v' and RR.random() < 0.66: robj.append({'k': 'rice', 'x': gx, 'y': gy})
        elif rg[y][x] == '~' and RR.random() < 0.3: robj.append({'k': 'rice', 'x': gx, 'y': gy})
rz = {'name': 'Manoomin lake', 'level': '1-10', 'origin': [RX, RY], 'size': [RW, RH], 'ground': 'grass',
      'tiles': [''.join(r) for r in rg], 'objects': robj, 'npcs': [], 'spawns': [], 'fishing': []}
json.dump({'ashvale3d': 'module', 'name': 'zone.ricelake', 'api': 1, 'v': 1, 'data': rz}, open(os.path.join(HERE, 'data', 'zone.ricelake.json'), 'w'), separators=(',', ':'))
print('wrote data/zone.ricelake.json: %d rice clumps at %d,%d' % (len(robj), RX, RY))
# THE SUGAR CAMP (iskigamizigan, 2026-10-08, handoff/sugarbush_plan.md): a clearing in the maple and birch woods at the
# top of the trail up from Ziibiing - a fire with the iskigamiziganaak (kettle frame) over it, the iskigamizigewigamig (the
# bark sap-boiling lodge), a woodpile, a drying rack and birch bark baskets. Nookomis comes up here while the sap runs.
CX, CY, CW, CH = CAMP[0], CAMP[1], 16, 13
cg = tiles_at(CX, CY, CW, CH, ['ziibiing'])
for y in range(CH):
    for x in range(CW):
        if 2 <= x <= CW - 3 and 2 <= y <= CH - 3 and cg[y][x] not in '~v': cg[y][x] = '.'   # the clearing
for y in (CH - 2, CH - 1):   # the trail from the village comes in at the bottom
    if cg[y][FIRE[0] - CX] not in '~v': cg[y][FIRE[0] - CX] = 'p'
cobj = [{'k': 'campfire', 'x': CAMP_FIRE[0], 'y': CAMP_FIRE[1], 'litIn': 'sap'}, {'k': 'kettle', 'x': CAMP_FIRE[0], 'y': CAMP_FIRE[1], 'steamIn': 'sap'},
        {'k': 'barklodge', 'x': CX + 5, 'y': CY + 4}, {'k': 'woodpile', 'x': CX + 11, 'y': CY + 4},
        {'k': 'fishrack', 'x': CX + 11, 'y': CY + 9}, {'k': 'basket', 'x': CX + 6, 'y': CY + 9}, {'k': 'basket', 'x': CX + 7, 'y': CY + 10}]
for xx in range(CX + 4, CX + 7):
    for yy in range(CY + 3, CY + 5): cg[yy - CY][xx - CX] = 'H'   # the lodge stands on its own ground
cz = {'name': 'Iskigamizigan', 'level': '1-10', 'origin': [CX, CY], 'size': [CW, CH], 'ground': 'grass',
      'tiles': [''.join(r) for r in cg], 'objects': cobj, 'npcs': [], 'spawns': [], 'fishing': []}
json.dump({'ashvale3d': 'module', 'name': 'zone.sugarcamp', 'api': 1, 'v': 1, 'data': cz}, open(os.path.join(HERE, 'data', 'zone.sugarcamp.json'), 'w'), separators=(',', ':'))
print('wrote data/zone.sugarcamp.json at %d,%d' % (CX, CY))
for r in cg: print(''.join(r))
# the sap morning (rules.fires.sapDay): where the people stand, the akik, and four maples close round the camp each with a
# tile to stand on beside it - the camp's own fringe first, then the grove round it
around = tiles_at(CX - 12, CY - 12, CW + 24, CH + 24, ['ziibiing', 'sugarcamp'])
def arnd(x, y): return around[y - (CY - 12)][x - (CX - 12)]
SAP_TREES = []
for (tx, ty) in sorted(((x, y) for y in range(CY - 10, CY + CH + 10) for x in range(CX - 10, CX + CW + 10)), key=lambda q: math.hypot(q[0] - CAMP_FIRE[0], q[1] - CAMP_FIRE[1])):
    if len(SAP_TREES) >= 4: break
    if arnd(tx, ty) != 'M': continue
    stand = [(tx + dx, ty + dy) for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)) if arnd(tx + dx, ty + dy) in '.,dp']
    if not stand or any(abs(tx - t[2]) + abs(ty - t[3]) < 3 for t in SAP_TREES): continue
    SAP_TREES.append([stand[0][0], stand[0][1], tx, ty])
assert len(SAP_TREES) == 4, SAP_TREES
for r in g: print(''.join(r))

# THE RIVERBANK SITES (2026-10-09: "most quests should require you use the canoe and the river to travel places. They don't
# have to be a long ways away, and they should have landmarks so that the area on the riverbank is easily visible"). Each is a short
# paddle from the Ziibiing landing, on a bank you can land on, with a landmark you can see from the water. Dug by hand, no tool.
# The deposits sit on the bank itself (open ground with the water beside it); the landmark a few steps up from the shore.
PLACES = {}
def bank_site(zid, name, X, Y, Wd, Ht, letter, landmark, n=3):
    t = tiles_at(X, Y, Wd, Ht, ['ziibiing'])
    tat = lambda x, y: t[y - Y][x - X]
    wet = lambda x, y: X <= x < X + Wd and Y <= y < Y + Ht and tat(x, y) in '~v'
    for yy in range(Y + 1, Y + Ht - 1):
        for xx in range(X + 1, X + Wd - 1):
            if tat(xx, yy) not in '~v': t[yy - Y][xx - X] = '.'
    shore = [(x, y) for y in range(Y + 1, Y + Ht - 1) for x in range(X + 1, X + Wd - 1) if tat(x, y) == '.' and any(wet(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    assert len(shore) >= 6, (zid, 'too little shore')
    deposits = []
    for (x, y) in sorted(shore, key=lambda q: abs(q[0] - (X + Wd // 2)) + abs(q[1] - (Y + Ht // 2))):
        if len(deposits) >= n: break
        if any(abs(x - d[0]) + abs(y - d[1]) < (3 if n <= 3 else 2) for d in deposits): continue
        deposits.append((x, y))
    for (xx, yy) in deposits: t[yy - Y][xx - X] = letter
    k, foot, kw = landmark
    fw, fh = max(1, max(f[0] for f in foot) + 1), max(1, max(f[1] for f in foot) + 1)
    cands = [(x, y) for y in range(Y + 1, Y + Ht - fh) for x in range(X + 1, X + Wd - fw)
             if all(tat(x + i, y + j) == '.' and all(not wet(x + i + dx, y + j + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)) for i in range(fw) for j in range(fh))
             and all(abs(x - d[0]) + abs(y - d[1]) >= 3 for d in deposits)]
    assert cands, (zid, 'nowhere for the landmark')
    lx, ly = min(cands, key=lambda q: min(abs(q[0] - d[0]) + abs(q[1] - d[1]) for d in deposits))
    for (i, j) in foot: t[ly + j - Y][lx + i - X] = 'H'
    z = {'name': name, 'level': '1-10', 'origin': [X, Y], 'size': [Wd, Ht], 'ground': 'grass', 'tiles': [''.join(r) for r in t],
         'objects': [dict(k=k, x=lx + kw.pop('ax', 0), y=ly + kw.pop('ay', 0), **kw)], 'npcs': [], 'spawns': [], 'fishing': []}
    json.dump({'ashvale3d': 'module', 'name': 'zone.' + zid, 'api': 1, 'v': 1, 'data': z}, open(os.path.join(HERE, 'data', 'zone.' + zid + '.json'), 'w'), separators=(',', ':'))
    print('wrote data/zone.%s.json at %d,%d; deposits %s; landmark %d,%d' % (zid, X, Y, deposits, lx, ly))
    for r in t: print(''.join(r))
    PLACES[zid] = {'at': list(deposits[0]), 'deposits': [list(d) for d in deposits], 'landmark': [lx, ly]}
# biiwaanag (flint): DOWN the river, on the far bank across from the willow, by a painted rock face
bank_site('flintbank', 'Biiwaanag bank', 32366, -2368, 22, 10, 'S', ('paintedrock', [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)], {'face': 'n', 'name': 'Painted rock', 'ax': 1}))
# miskwaabiimizh (red willow): DOWN the river, on the village's bank, by a drying rack hung with red bark (2026-10-09,
# kinnikinnick); peeled with a blade, once a game day each
bank_site('willowbank', 'Miskwaabiimizh bank', 32392, -2400, 18, 9, 'J', ('fishrack', [(0, 0), (1, 0)], {'w': 2, 'h': 1, 'name': 'Drying rack'}), n=5)
# obsidian: UP the river past the rice, on the village's bank, by a stone cairn
bank_site('obsidianbank', 'Obsidian bank', 32560, -2292, 22, 12, 'V', ('cairn', [(0, 0)], {'name': 'Cairn'}))

# WHAT THE DATA NEEDS TO KNOW (tools/make_data.py reads this; the quest markers go straight into data/extra/quests.json)
PLACES.update({'note': 'written by tools/make_zone_ziibiing.py - where the moved Ziibiing (site 8) put things; make_data.py reads it',
               'fire': list(FIRE), 'landing': list(LAND), 'shore': list(SHORE),
               'camp_fire': list(CAMP_FIRE), 'kettle': list(CAMP_FIRE), 'sap_at': [CAMP_FIRE[0] + 2, CAMP_FIRE[1]], 'pour': [CAMP_FIRE[0], CAMP_FIRE[1] - 1],
               'sap_trees': SAP_TREES, 'hares': [list(h) for h in HARES], 'groves': GROVES, 'north': list(NORTH),
               'zones': {'ziibiing': [OX, OY, W, H], 'sugarcamp': [CX, CY, CW, CH], 'ricelake': [RX, RY, RW, RH]}})
json.dump(PLACES, open(os.path.join(HERE, 'data', 'extra', 'ziibiing_places.json'), 'w'), indent=1)
qp = os.path.join(HERE, 'data', 'extra', 'quests.json')
Q = json.load(open(qp))
marks = {'sugar_bush': {1: {'at': [CAMP_FIRE[0] - 4, CAMP_FIRE[1]]}}, 'mitigwaab': {1: {'at': [CAMP_FIRE[0] - 4, CAMP_FIRE[1]]}},
         'biiwaanag': {1: {'at': PLACES['flintbank']['at']}}, 'obsidian_arrows': {1: {'at': PLACES['obsidianbank']['at']}},
         'waabooz': {1: {'at': [round(sum(h[0] for h in HARES) / len(HARES)), round(sum(h[1] for h in HARES) / len(HARES))]}}}
for qid, steps in marks.items():
    for st in Q['quests'][qid]['steps']:
        if st['id'] in steps: st.update(steps[st['id']])
json.dump(Q, open(qp, 'w'), indent=1, ensure_ascii=False)
print('wrote data/extra/ziibiing_places.json and the quest markers; landing %s shore %s fire %s camp fire %s' % (LAND, SHORE, FIRE, CAMP_FIRE))
