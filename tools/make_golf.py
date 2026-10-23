"""[Claude 2026-10-19] The Saltmere Links course data: tools/golf/course.py (the 18 holes, ponds and the burn the operator
approved on the map) + the ground under it (tools/golf/ne_site.json, a tile survey of the north-east) -> data/golf.course.json.
The ground is a grid of half-metre cells, one letter each:
  t tee  f fairway  e fringe  g green  r rough  h heavy rough (off the course)  s sand  w water  o out of bounds (the bay)
Trees and rocks off the course are listed as points (they stop a ball that flies into them below their height).
  python3 tools/make_golf.py"""
import json, math, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools', 'golf'))
import course as C   # noqa: E402  (writes nothing when imported)
RAW = json.load(open(os.path.join(HERE, 'golf', 'raw_tiles.json')))   # the world's own tile letters (M.tileAt), x 440..740, y -420..0
SX0, SY0 = RAW['x0'], RAW['y0']
TREE, ROCK = set('TPOWMYELQU'), set('RNICGASVr^K')
SITE = [''.join('~' if c == '~' else 'T' if c in TREE else 'R' if c in ROCK else '.' for c in r) for r in RAW['rows']]
CLUBHOUSE = (627, -126, 16, 11)   # x, y, w, h (tiles): south of the 6th green and the 1st tee, door on the south side; 2026-10-20 (his floor plan): 16 wide, grown west and north (was 631, -122, 12 x 7) so the four tables and their pit fit upstairs; [Claude 2026-10-22] the course moved off it (course.py DX, DY), the 1st tee is 20 m north-east of its back wall
DOOR = (637, -116)
PATH = [(x, y) for x in range(545, 640) for y in (-114, -113, -112)] + [(x, y) for x in (636, 637, 638) for y in range(-115, -111)]   # the cobbled road (3 wide) from the path zone's end along the shore to the door (2026-10-20)
# [Claude 2026-10-22] the walk out to the 1st tee, now 20 m out past the clubhouse's north-east corner (the operator: "move the course back from the
# clubhouse ... further away from the clubhouse along the shoreline"): a cobbled path two wide from the back door (635,-126) north, then
# east along to the back of the tee box. Only where the course is not (it plays as rough there).
TEE1 = C.out[0]['pts'][0]
TEEPATH = [(x, y) for x in (634, 635) for y in range(TEE1[1] + 4, -126)] + [(x, y) for x in range(634, TEE1[0] + 1) for y in (TEE1[1] + 4, TEE1[1] + 5)]
X0, Y0, X1, Y1 = 545, -418, 740, -104   # the course box (tiles = metres); [Claude 2026-10-22] grown 20 east and 20 north with the course (course.py DX, DY: the operator, "further away from the clubhouse along the shoreline"); the west side and the south (the clubhouse, the road) stay
Q = 2                           # cells per metre
W, H = (X1 - X0) * Q, (Y1 - Y0) * Q
yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
tx = X0 + (xx + .5) / Q; ty = Y0 + (yy + .5) / Q
def dpoly(pts):
    d = np.full(tx.shape, 1e9)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay; t = np.clip(((tx - ax) * dx + (ty - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.minimum(d, np.hypot(tx - ax - t * dx, ty - ay - t * dy))
    return d
def site(x, y):
    i, j = int(math.floor(x)) - SX0, int(math.floor(y)) - SY0
    return SITE[j][i] if 0 <= j < len(SITE) and 0 <= i < len(SITE[0]) else 'T'
holes = [h for h in C.out]
rough = np.zeros(tx.shape, bool); fair = rough.copy(); green = rough.copy(); fringe = rough.copy(); tee = rough.copy(); sand = rough.copy()
pins = []
for h in holes:
    n, pts = h['n'], h['pts']; d = dpoly(pts)
    rough |= d < 12 + 1.5 * np.sin(tx * .21 + n) * np.cos(ty * .17)
    if h['par'] > 3: fair |= (d < 5.5 + .8 * np.sin(ty * .3 + tx * .1)) & (np.hypot(tx - pts[0][0], ty - pts[0][1]) > 20)
    g = pts[-1]; dg = np.hypot(tx - g[0], ty - g[1])
    green |= dg < 6 + .6 * np.sin(np.arctan2(ty - g[1], tx - g[0]) * 3 + n); fringe |= dg < 7.6
    a = math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]); ca, sa = math.cos(a), math.sin(a)
    lx = (tx - pts[0][0]) * ca + (ty - pts[0][1]) * sa; ly = -(tx - pts[0][0]) * sa + (ty - pts[0][1]) * ca
    tee |= (np.abs(lx - 1) < 3) & (np.abs(ly) < 2.2)
    a, b = pts[-2], pts[-1]; ang = math.atan2(b[1] - a[1], b[0] - a[0]); nx, ny = -math.sin(ang), math.cos(ang)
    bunk = [(b[0] + nx * 8.5 * s - math.cos(ang) * 2, b[1] + ny * 8.5 * s - math.sin(ang) * 2, 2.6, ang) for s in ([1, -1] if n % 3 == 0 else [1 if n % 2 else -1])]
    if h['par'] > 3:
        rem = 62
        for p, q in zip(pts, pts[1:]):
            L = math.dist(p, q)
            if rem <= L:
                px, py = p[0] + (q[0] - p[0]) * rem / L, p[1] + (q[1] - p[1]) * rem / L; ang2 = math.atan2(q[1] - p[1], q[0] - p[0]); s = -1 if n % 2 else 1
                bunk.append((px - math.sin(ang2) * 7 * s, py + math.cos(ang2) * 7 * s, 3.2, ang2)); break
            rem -= L
    for bx, by, r, ang3 in bunk:
        ca, sa = math.cos(ang3), math.sin(ang3); lx = (tx - bx) * ca + (ty - by) * sa; ly = -(tx - bx) * sa + (ty - by) * ca
        sand |= (lx / (r * 1.5)) ** 2 + (ly / r) ** 2 < 1
    # the pin: a little off the middle of the green, a different side each hole; the green's tilt (rise per metre, the way it
    # runs downhill) and a gentle swell, so every putt breaks
    pa = n * 2.39996; pin = (g[0] + 2.2 * math.cos(pa), g[1] + 2.2 * math.sin(pa))
    sa_ = n * 1.7 + 0.6; mag = 0.004 + 0.009 * ((n * 37) % 10) / 9   # 2026-10-19: the first greens broke far too much to putt
    h.update({'pin': [round(pin[0], 2), round(pin[1], 2)], 'green': [g[0], g[1]], 'slope': [round(mag * math.cos(sa_), 4), round(mag * math.sin(sa_), 4)], 'swell': round(0.015 + 0.02 * ((n * 13) % 5) / 4, 3)})
wat = np.zeros(tx.shape, bool)
sw = np.array([[c == '~' for c in r] for r in SITE]); si = np.clip(np.floor(ty).astype(int) - SY0, 0, len(SITE) - 1); sj = np.clip(np.floor(tx).astype(int) - SX0, 0, len(SITE[0]) - 1)
inside = (np.floor(ty) >= SY0) & (np.floor(tx) >= SX0)
bay = sw[si, sj] & inside
for cx, cy, rx, ry, a in C.PONDS:
    a = math.radians(a); ca, sa = math.cos(a), math.sin(a); lx = (tx - cx) * ca + (ty - cy) * sa; ly = -(tx - cx) * sa + (ty - cy) * ca
    wat |= (lx / rx) ** 2 + (ly / ry) ** 2 < 1 + .08 * np.sin(np.arctan2(ly, lx) * 4 + cx)
wat |= dpoly(C.BURN) < 2.4 + .6 * np.sin(ty * .25)
course = rough | fringe
g = np.full(tx.shape, 'h', '<U1')
g[course] = 'r'; g[fair] = 'f'; g[fringe] = 'e'; g[green] = 'g'; g[tee] = 't'; g[sand] = 's'
# [Claude 2026-10-22] the course moved (course.py DX, DY): a pond of the world's own (water that does not reach the edge of the tile
# survey: not the sea) under a tee, a fairway or a green is filled in - the old pond the 1st green and the 2nd tee now stand on; the
# designed ponds (C.PONDS) moved with the holes. Other ponds stay water.
from collections import deque
lab = [[0] * len(SITE[0]) for _ in SITE]; ponds = []
for j0, r in enumerate(SITE):
    for i0, c in enumerate(r):
        if c != '~' or lab[j0][i0]: continue
        k = len(ponds) + 1; lab[j0][i0] = k; q = deque([(i0, j0)]); edge = False; cells_ = []
        while q:
            i, j = q.popleft(); cells_.append((i, j))
            if i in (0, len(r) - 1) or j in (0, len(SITE) - 1): edge = True
            for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                if 0 <= a < len(r) and 0 <= b < len(SITE) and SITE[b][a] == '~' and not lab[b][a]: lab[b][a] = k; q.append((a, b))
        ponds.append((edge, cells_))
pid = np.array(lab)[si, sj] * inside
play = tee | fair | fringe | green
for k, (edge, cells_) in enumerate(ponds, 1):
    m = pid == k
    if not edge and (m & play).any(): bay &= ~m
# the bay is out of bounds unless it is the old pond (north of y -200)
g[bay & (ty > -200)] = 'o'; g[bay & (ty <= -200)] = 'w'
wat &= ~(green | tee); g[wat] = 'w'
# the clubhouse ('c': not part of the course - out of bounds, nothing drawn) and the path to it ('x': plays as rough, not drawn)
cx0, cy0, cw, chh = CLUBHOUSE
g[(tx >= cx0) & (tx < cx0 + cw) & (ty >= cy0) & (ty < cy0 + chh)] = 'c'
for (px, py) in PATH:
    g[(np.floor(tx) == px) & (np.floor(ty) == py)] = 'x'
for (px, py) in TEEPATH:
    m = (np.floor(tx) == px) & (np.floor(ty) == py); g[m & (g == 'h')] = 'x'
rows = [''.join(r) for r in g]
trees = []
for j, r in enumerate(SITE):
    for i, c in enumerate(r):
        x, y = SX0 + i + .5, SY0 + j + .5
        if not (X0 <= x < X1 and Y0 <= y < Y1) or c not in 'TR': continue
        ci, cj = int((x - X0) * Q), int((y - Y0) * Q)
        if g[cj, ci] != 'h': continue
        jx = ((i * 73 + j * 31) % 7 - 3) * 0.08; jy = ((i * 17 + j * 57) % 7 - 3) * 0.08
        trees.append([round(x + jx, 2), round(y + jy, 2), 0 if c == 'T' else 1])
out = {'name': 'Saltmere Links', 'yd': C.YD, 'box': [X0, Y0, X1, Y1], 'q': Q, 'rows': rows, 'trees': trees,
       'holes': [{k: h[k] for k in ('n', 'par', 'pts', 'yd', 'pin', 'green', 'slope', 'swell')} for h in holes],
       'club': list(C.CLUB), 'half': list(C.HALF), 'burn': C.BURN}
json.dump(out, open(os.path.join(ROOT, 'data', 'golf.course.json'), 'w'), separators=(',', ':'))
# the game module (src/golfcourse.js): the same data with the ground rows run-length coded ("h12r30..."), to keep the inscription small
import re
def rle(r): return ''.join(m.group(1) + str(len(m.group(0))) for m in re.finditer(r'(.)\1*', r))
mod = dict(out); mod['rle'] = [rle(r) for r in rows]; del mod['rows']
open(os.path.join(ROOT, 'src', 'golfcourse.js'), 'w').write(
    "/* ASHVALE: THE SALTMERE LINKS course data - GENERATED by tools/make_golf.py from tools/golf/course.py (the holes, ponds and the\n"
    "   burn the operator approved) and the world's own tiles. Ground rows are run-length coded; src/golfrules.js makeCourse() reads them. */\n"
    "(function (G) {\n  'use strict';\n  const D = " + json.dumps(mod, separators=(',', ':')) + ";\n"
    "  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('golfcourse', { api: 1, v: 1, needs: {} }, () => D);\n"
    "  if (typeof module !== 'undefined' && module.exports) module.exports = D;\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n")
from collections import Counter
print('cells', W, 'x', H, dict(Counter(''.join(rows))), 'trees', len(trees), 'par', sum(h['par'] for h in holes))
