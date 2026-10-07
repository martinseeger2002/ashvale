"""make_cave.py - the Spider Cave (2026-10-07): "put a cave entrance there [(-125, 8)] ... an underground cave layer where
the user can walk around and battle giant rats, spiders, giant spiders, a spider queen and a swamp monster"; "a large maze,
but with no dead ends, it should be just a single trail through the cave"; difficult but beatable for @apple (combat 26).

Writes two zones (deterministic, seed below):
  data/zone.spidercave.json  the cave: 120 x 84 tiles OUTSIDE the walkable land (south of the core face, so nobody walks in
                             from the surface; the game draws it dark and alone - zone flag `under`), one winding trail
                             through 12 x 12 cells (a long self-avoiding walk, no forks, no dead ends, no loops), widening
                             into its rooms in order: rat hall, spider tunnels, two giant spider nests, the flooded swamp
                             grotto, the Spider Queen's lair, and the way out just past it
  data/zone.cavemouth.json   a small area up top round (-125, 8) with the cave mouth (and where the way out comes back up)
Tiles: '^' rock (the game raises it into walls underground), 'd' cave floor, 'v' shallow water you wade, '~' deep water.
  python3 tools/cave/make_cave.py"""
import json, os, random, math
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = 'spidercave-1'
CELL, GW, GH = 12, 10, 7                     # 10 x 7 cells of 12 tiles = 120 x 84
OX, OY = -200, 16100                         # outside the core face (its south edge is y 15925; play stops 48 inside it)
MOUTH = (-125, 8)                            # the operator's spot in the woods (where @yourfirstname stood, 2026-10-06 23:38)
R = random.Random(SEED)

def long_walk():
    """a self-avoiding walk over the cells from the top-left corner, as long as can be found (Warnsdorff + restarts)"""
    best = []
    for attempt in range(4000):
        rr = random.Random(SEED + str(attempt)); path = [(0, 0)]; seen = {(0, 0)}
        while True:
            x, y = path[-1]
            nb = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < GW and 0 <= y + dy < GH and (x + dx, y + dy) not in seen]
            if not nb: break
            deg = lambda c: sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= c[0] + dx < GW and 0 <= c[1] + dy < GH and (c[0] + dx, c[1] + dy) not in seen)
            nb.sort(key=lambda c: (deg(c), rr.random())); c = nb[0]; path.append(c); seen.add(c)
        # the far end on the east side - toward Whisperwood and the village - so the way out (right above it) is nearer town
        # than the entrance (2026-10-07: "the exit should be closer to the town than the entrance but hidden")
        key = lambda p: (p[-1][0] == GW - 1, len(p))
        if key(path) > key(best) if best else True: best = path
        if len(best) == GW * GH and best[-1][0] == GW - 1: break
    return best

def build():
    W, H = GW * CELL, GH * CELL
    g = [['^'] * W for _ in range(H)]; owner = [[-1] * W for _ in range(H)]; clash = [0]
    walk = long_walk(); n = len(walk)
    # centre of each cell, jittered a little
    ctr = [(c[0] * CELL + CELL / 2 + R.uniform(-1, 1), c[1] * CELL + CELL / 2 + R.uniform(-1, 1)) for c in walk]
    # the rooms along the trail, by fraction of the way through
    def room(i):
        f = i / max(1, n - 1)
        return ('rats' if f < 0.16 else 'spiders' if f < 0.40 else 'nest' if f < 0.60 else 'swamp' if f < 0.76 else 'tunnel' if f < 0.86 else 'lair' if f < 0.97 else 'exit')
    WIDE = {'rats': 3.6, 'spiders': 1.5, 'nest': 3.4, 'swamp': 4.2, 'tunnel': 1.5, 'lair': 4.6, 'exit': 1.8}
    def carve(x, y, r, i):
        for yy in range(int(y - r - 1), int(y + r + 2)):
            for xx in range(int(x - r - 1), int(x + r + 2)):
                if 1 <= xx < W - 1 and 1 <= yy < H - 1 and (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r:
                    # never into the cell of a stretch that is not a neighbour on the trail (that would make a fork)
                    if g[yy][xx] == '^': g[yy][xx] = 'd'; owner[yy][xx] = i
                    elif owner[yy][xx] >= 0 and abs(owner[yy][xx] - i) > 1: clash[0] += 1   # carving into a stretch that is not a neighbour: a fork
    # the trail: from each centre to the next, a wobbly line; the width breathes along it
    for i in range(n - 1):
        (x0, y0), (x1, y1) = ctr[i], ctr[i + 1]; steps = int(math.hypot(x1 - x0, y1 - y0) * 3) + 1
        for s in range(steps + 1):
            t = s / steps; x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
            wob = math.sin(t * math.pi) * 1.2 * math.sin(i * 1.7 + 0.5)
            if abs(x1 - x0) > abs(y1 - y0): y += wob
            else: x += wob
            rm = room(i) if t < 0.5 else room(i + 1)
            r = WIDE[rm] * (0.75 + 0.25 * math.sin(i * 2.1 + t * 3)) if rm in ('rats', 'nest', 'swamp', 'lair') else WIDE[rm] + 0.25 * math.sin(i + t * 5)
            carve(x, y, max(1.25, min(r * (math.sin(math.pi * t) * 0.6 + 0.4) if rm in ('rats', 'nest', 'swamp', 'lair') else r, 5.0)), i if t < 0.5 else i + 1)
    # check: a stretch only ever touches its neighbours on the trail (no forks, no loops, no dead ends)
    bad = clash[0]
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            a = owner[y][x]
            if a < 0: continue
            for dx, dy in ((1, 0), (0, 1)):
                b = owner[y + dy][x + dx]
                if b >= 0 and abs(a - b) > 1: bad += 1
    # water in the swamp grotto: shallow round the deep pools, the trail itself stays wadeable
    sw = [i for i in range(n) if room(i) == 'swamp']
    for i in sw:
        cx, cy = ctr[i]
        for y in range(H):
            for x in range(W):
                if g[y][x] != 'd': continue
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if d < 3.6: g[y][x] = 'v'
    return g, owner, walk, ctr, room, bad

def main():
    g, owner, walk, ctr, room, bad = build(); n = len(walk); W, H = len(g[0]), len(g)
    print('trail through %d of %d cells; touching non-neighbour stretches: %d' % (n, GW * GH, bad))
    assert bad == 0, 'the trail forks or loops'
    def free_near(x, y, k=0):
        for r in range(0, 6):
            for yy in range(int(y) - r, int(y) + r + 1):
                for xx in range(int(x) - r, int(x) + r + 1):
                    if 0 <= xx < W and 0 <= yy < H and g[yy][xx] in 'dv' and (xx, yy) not in used: used.add((xx, yy)); return xx, yy
        return int(x), int(y)
    used = set(); spawns = []; objects = []
    def put(m, i, k=1):
        for j in range(k):
            a = j * 2 * math.pi / max(1, k); x, y = free_near(ctr[i][0] + math.cos(a) * 1.5 * (k > 1), ctr[i][1] + math.sin(a) * 1.5 * (k > 1))
            spawns.append({'m': m, 'x': x + OX, 'y': y + OY})
    idx = {}
    for i in range(n): idx.setdefault(room(i), []).append(i)
    # fewer of the beasts, to make room for the Ashen Crown's end (2026-10-07: "remove some of the monsters")
    for i in idx['rats'][1::2]: put('giant_rat', i, 1)
    for i in idx['spiders'][::3]: put('spider', i, 1)
    nests = idx['nest']; [put('giant_spider', i, 1) for i in (nests[len(nests) // 3], nests[2 * len(nests) // 3])]
    for i in idx['nest'][1::4]: put('spider', i, 1)
    put('swamp_monster', idx['swamp'][len(idx['swamp']) // 2], 1)
    tun = idx['tunnel']; [put('wraith', tun[k], 1) for k in (0, len(tun) // 2, len(tun) - 2)]   # the three wraiths, past the grotto
    put('ash_knight', tun[-1], 1)                                                              # at the narrow way into the lair
    lair = idx['lair']; put('spider_queen', lair[len(lair) // 2], 1); put('giant_spider', lair[0], 1); put('giant_spider', lair[-1], 1)
    put('lich', idx['exit'][0], 1)                                                             # the very end, before the way out
    # torches all along the trail - the only light down there (2026-10-07: "The only light should be coming from the
    # torches maybe add more torches"); glowing mushrooms in the swamp and the last tunnel. No webs (the operator: "Remove the spiderwebs")
    # they are small torches set into the rock down both sides, leaning out at an angle (2026-10-07: "the torches should be
    # arranged down the sides of the cave stuck into the wall at an angle"): from points along the trail, sides alternating, walk
    # out square to the trail to the last floor tile before the wall; the sconce hangs on that wall (face = the wall's side)
    def sconce(px, py, dx, dy, side):
        L = math.hypot(dx, dy) or 1; nx, ny = -dy / L * side, dx / L * side
        x, y = px, py; last = None
        for _ in range(12):
            xi, yi = int(x), int(y)
            if not (0 <= xi < W and 0 <= yi < H) or g[yi][xi] not in 'dv': break
            last = (xi, yi); x += nx * 0.5; y += ny * 0.5
        if not last or last in used: return
        xi, yi = last
        for f, (ox, oy) in (('n', (0, -1)), ('s', (0, 1)), ('e', (1, 0)), ('w', (-1, 0))):   # the wall nearest the way it walked out
            if abs(ox - nx) + abs(oy - ny) < 1.2 and not (0 <= xi + ox < W and 0 <= yi + oy < H and g[yi + oy][xi + ox] in 'dv'):
                used.add(last); objects.append({'k': 'sconce', 'x': xi + OX, 'y': yi + OY, 'face': f}); return
    side = 1
    for i in range(0, n - 1):
        (x0, y0), (x1, y1) = ctr[i], ctr[i + 1]
        for t in (0.0, 0.5):
            sconce(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, x1 - x0, y1 - y0, side); side = -side
    for i in idx['swamp'] + idx['tunnel']:
        for _ in range(2): x, y = free_near(ctr[i][0] + R.uniform(-3, 3), ctr[i][1] + R.uniform(-3, 3)); objects.append({'k': 'shroom', 'x': x + OX, 'y': y + OY})
    # TILE FOR TILE (2026-10-07: "the underground map is the same tile for tile as the above ground map so that where the
    # cave comes out is in a different location than where the cave entrance is"): every cave tile lies under one surface tile
    # (surface = cave + surfaceOffset). The start of the trail lies under the mouth; the far end comes up wherever is above it -
    # a way OUT only (the operator: "The cave exit should not be able to be entered").
    import subprocess, heapq
    def land(x0, y0, w, h):
        return json.loads(subprocess.run(['node', '-e', """
const G=require('./src/globe.js').createGlobe({n:128,radius_m:36110,seed:'ashvale'}),W=require('./src/worldgen.js').createWorldgen(G);
console.log(JSON.stringify(W.tiles(19, %d + 8811, %d - 3368, %d, %d)));""" % (x0, y0, w, h)], capture_output=True, text=True, cwd=HERE).stdout)
    BLOCKS = 'TPORNIr~FHXWMYCGAU^K'; TREES = 'TPOWMYU'
    ZONES = []   # the other areas: their own tiles win there, so the trail and the openings keep out of them
    for fn in os.listdir(os.path.join(HERE, 'data')):
        if fn.startswith('zone.') and fn.endswith('.json') and fn not in ('zone.spidercave.json', 'zone.cavemouth.json', 'zone.caveexitup.json'):
            z = json.load(open(os.path.join(HERE, 'data', fn)))['data']
            if not z.get('under'): ZONES.append((z['origin'][0], z['origin'][1], z['origin'][0] + z['size'][0], z['origin'][1] + z['size'][1]))
    in_zone = lambda x, y: any(a <= x < c and b <= y < d for a, b, c, d in ZONES)
    JOIN = set()   # where a town's path leaves its edge: the tile just outside it (the trail joins the road there)
    for fn in os.listdir(os.path.join(HERE, 'data')):
        if fn.startswith('zone.') and fn.endswith('.json') and fn not in ('zone.spidercave.json', 'zone.cavemouth.json', 'zone.caveexitup.json'):
            z = json.load(open(os.path.join(HERE, 'data', fn)))['data']
            if z.get('under'): continue
            (zx, zy), (zw, zh), T = z['origin'], z['size'], z['tiles']
            for j in range(zh):
                for i in range(zw):
                    if T[j][i] != 'p' or 0 < i < zw - 1 and 0 < j < zh - 1: continue
                    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        if not (0 <= i + dx < zw and 0 <= j + dy < zh): JOIN.add((zx + i + dx, zy + j + dy))
    sx, sy = free_near(*ctr[0]); ex, ey = free_near(*ctr[-1])
    SX, SY = MOUTH[0] - sx, MOUTH[1] - sy                       # local cave tile -> surface tile
    up = (ex + SX, ey + SY)
    near = land(up[0] - 6, up[1] - 6, 13, 13)
    best = min(((abs(i - 6) + abs(j - 6), i, j) for j in range(13) for i in range(13) if near[j][i] not in BLOCKS and not in_zone(up[0] - 6 + i, up[1] - 6 + j)), default=None)
    assert best, 'no open ground above the far end of the cave'
    up = (up[0] - 6 + best[1], up[1] - 6 + best[2])
    # TRAILS (2026-10-07: "Make sure there is a trail to the cave entrance"; "The exit should have a trail back to the
    # town"): from each opening to the nearest town road, the cheapest way (open ground 1, a tree 3 - it is cleared), never
    # through another area or an outcrop's rock. The entrance gets a proper path; the hidden way out a faint dirt track.
    RW = 170; L0 = (MOUTH[0] - RW, MOUTH[1] - RW); big = land(L0[0], L0[1], 2 * RW + 1, 2 * RW + 1)
    tile = lambda x, y: big[y - L0[1]][x - L0[0]] if 0 <= x - L0[0] <= 2 * RW and 0 <= y - L0[1] <= 2 * RW else '^'
    rock = lambda x, y: any(abs(x - o[0]) <= 2 and o[1] - 2 <= y <= o[1] for o in (MOUTH, up))
    def trail_from(o):
        start = (o[0], o[1] + 1 if o == up else o[1] + 2); dist = {start: 0}; came = {}; pq = [(0, start)]; goal = None
        while pq:
            d, (x, y) = heapq.heappop(pq)
            if d > dist[(x, y)]: continue
            if (x, y) in JOIN or (tile(x, y) == 'p' and abs(x - o[0]) + abs(y - o[1]) > 4): goal = (x, y); break
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                c = tile(nx, ny)
                if in_zone(nx, ny) or rock(nx, ny) or abs(nx - MOUTH[0]) > RW - 1 or abs(ny - MOUTH[1]) > RW - 1: continue
                w = 1 if c not in BLOCKS else 3 if c in TREES else None
                if w is not None and d + w < dist.get((nx, ny), 1e9): dist[(nx, ny)] = d + w; came[(nx, ny)] = (x, y); heapq.heappush(pq, (d + w, (nx, ny)))
        assert goal, 'no town road within %d tiles of %s' % (RW, o)
        r = [goal]
        while r[-1] != start: r.append(came[r[-1]])
        return r
    route, route_out = trail_from(MOUTH), trail_from(up)
    print('trail: %d tiles from the road at %s to the mouth; the way out is %d tiles from the road at %s' % (len(route), route[0], len(route_out), route_out[0]))
    VILLAGE = (24, 52)   # the village well
    dm, du = math.hypot(MOUTH[0] - VILLAGE[0], MOUTH[1] - VILLAGE[1]), math.hypot(up[0] - VILLAGE[0], up[1] - VILLAGE[1])
    print('from the village well: entrance %.0f tiles, way out %.0f tiles' % (dm, du))
    assert du < dm, 'the way out must be nearer town than the entrance'
    objects.append({'k': 'caveexit', 'x': sx + OX, 'y': sy + OY, 'to': [MOUTH[0] + 1, MOUTH[1] + 2], 'label': 'Climb back up'})
    objects.append({'k': 'caveexit', 'x': ex + OX, 'y': ey + OY, 'to': [up[0], up[1] + 1], 'label': 'Climb out into the daylight'})   # the clear tile in front of the hidden outcrop
    arrive = list(free_near(ctr[0][0] + 1, ctr[0][1] + 1)); arrive = [arrive[0] + OX, arrive[1] + OY]
    cave = {"ashvale3d": "module", "name": "zone.spidercave", "api": 1, "v": 1, "data": {
        "name": "Spider Cave", "level": "12-32", "under": True, "surface": list(MOUTH), "surfaceOffset": [SX - OX, SY - OY], "origin": [OX, OY], "size": [W, H], "ground": "cave",
        "tiles": [''.join(r) for r in g], "objects": objects, "spawns": spawns, "npcs": [], "fishing": [], "arrive": arrive,
        "weather": {"none": True}}}
    def area(zid, name, pts, objs):   # a surface area over these points (copied from the land, so nothing else changes)
        x0, y0 = min(p[0] for p in pts) - 4, min(p[1] for p in pts) - 4; x1, y1 = max(p[0] for p in pts) + 5, max(p[1] for p in pts) + 6
        for a, b, c, d in ZONES:   # stop at another area's edge (a town keeps its own tiles)
            if a < x1 and c > x0 and b < y1 and d > y0:
                if x1 - a <= c - x0 and a > min(p[0] for p in pts): x1 = a
                elif c - x0 < x1 - a and c <= max(p[0] for p in pts): x0 = c
                elif d - y0 < y1 - b: y0 = d
                else: y1 = b
        rows = [list(r) for r in land(x0, y0, x1 - x0, y1 - y0)]
        for o in objs:
            hidden = o['k'] == 'caveout'   # the way out: only the tile in front of it is cleared (it is a way out, not a camp)
            for yy in range(o['y'] - 2, o['y'] + 4) if not hidden else [o['y'] + 1]:
                for xx in range(o['x'] - 2, o['x'] + 3) if not hidden else [o['x']]:
                    if x0 <= xx < x1 and y0 <= yy < y1: rows[yy - y0][xx - x0] = ','
        for o in objs:   # the outcrop itself is solid rock: nobody walks through it (2026-10-07); you stand in front of its opening
            for yy in range(o['y'] - 2, o['y'] + 1):
                for xx in range(o['x'] - 2, o['x'] + 3):
                    if x0 <= xx < x1 and y0 <= yy < y1: rows[yy - y0][xx - x0] = 'X'
        return x0, y0, rows, {"ashvale3d": "module", "name": "zone." + zid, "api": 1, "v": 1, "data": {
            "name": name, "level": "12-32", "origin": [x0, y0], "size": [x1 - x0, y1 - y0], "ground": "grass", "tiles": None,
            "objects": objs, "spawns": [], "npcs": [], "fishing": []}}
    MO = {'k': 'cavemouth', 'x': MOUTH[0], 'y': MOUTH[1], 'to': arrive, 'label': 'Enter the cave', 'name': 'Spider Cave'}
    UO = {'k': 'caveout', 'x': up[0], 'y': up[1], 'name': 'Cave opening'}   # the way out: no `to`, nobody goes in here
    # one surface area over both openings and both trails (copied from the land, so nothing else changes)
    x0, y0, rows, mouth = area('cavemouth', 'Cave trail', route + route_out + [MOUTH, up], [MO, UO])
    for r, L in ((route_out, 'd'), (route, 'p')):
        for x, y in r:
            if x0 <= x < x0 + len(rows[0]) and y0 <= y < y0 + len(rows) and rows[y - y0][x - x0] != 'X': rows[y - y0][x - x0] = L
    mouth['data']['tiles'] = [''.join(r) for r in rows]
    farmouth = None
    json.dump(cave, open(os.path.join(HERE, 'data', 'zone.spidercave.json'), 'w'), separators=(',', ':'))
    json.dump(mouth, open(os.path.join(HERE, 'data', 'zone.cavemouth.json'), 'w'), separators=(',', ':'))
    fp = os.path.join(HERE, 'data', 'zone.caveexitup.json')
    if farmouth: json.dump(farmouth, open(fp, 'w'), separators=(',', ':'))
    elif os.path.exists(fp): os.remove(fp)
    print('surface areas: trail %s size %s%s' % (mouth['data']['origin'], mouth['data']['size'], (', way out area ' + str(farmouth['data']['origin'])) if farmouth else ' (the way out is in it too)'))
    from collections import Counter
    print('cave %dx%d at %s: %d spawns %s, %d objects %s' % (W, H, (OX, OY), len(spawns), dict(Counter(s['m'] for s in spawns)), len(objects), dict(Counter(o['k'] for o in objects))))
    print('\n'.join(''.join(r) for r in g))
if __name__ == '__main__': main()
