import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
C = json.load(open('/tmp/claude-1000/golf/course.json')); S = json.load(open('/tmp/claude-1000/frogs/ne_site.json'))
X0, Y0 = 540, -390; W, Hh = len(S[0]), len(S); P = 4
w, h = W*P, Hh*P
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); tx = X0 + (xx+.5)/P; ty = Y0 + (yy+.5)/P
def dpoly(pts):
    d = np.full(tx.shape, 1e9, np.float32)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx-ax, by-ay; t = np.clip(((tx-ax)*dx+(ty-ay)*dy)/(dx*dx+dy*dy), 0, 1)
        d = np.minimum(d, np.hypot(tx-ax-t*dx, ty-ay-t*dy))
    return d
def dpt(p): return np.hypot(tx-p[0], ty-p[1])
rng = np.random.default_rng(7)
img = np.zeros((h, w, 3), np.float32)
grid = np.array([[c for c in r] for r in S])
gi = np.clip(((ty-Y0)).astype(int), 0, Hh-1); gx = np.clip((tx-X0).astype(int), 0, W-1); cell = grid[gi, gx]
img[:] = (150, 178, 112)
noise = rng.normal(0, 5, (Hh, W))[gi, gx][..., None]
img += noise
water = cell == '~'
rough = np.zeros(tx.shape, bool); fair = np.zeros(tx.shape, bool); green = np.zeros(tx.shape, bool); fringe = np.zeros(tx.shape, bool)
tee = np.zeros(tx.shape, bool); sand = np.zeros(tx.shape, bool); pondm = np.zeros(tx.shape, bool)
bunkers = []
for H in C['holes']:
    pts = H['pts']; d = dpoly(pts)
    wob = 1.5*np.sin(tx*.21+H['n'])*np.cos(ty*.17)
    rough |= d < 12 + wob
    # fairway from ~22 tiles out of the tee (par 4/5) or none for par 3
    if H['par'] > 3:
        dt = dpt(pts[0]); fair |= (d < 5.5 + .8*np.sin(ty*.3+tx*.1)) & (dt > 20)
    g = pts[-1]; green |= dpt(g) < 6 + .6*np.sin(np.arctan2(ty-g[1], tx-g[0])*3+H['n']); fringe |= dpt(g) < 7.6
    t0, t1 = pts[0], pts[1]; ang = math.atan2(t1[1]-t0[1], t1[0]-t0[0]); ca, sa = math.cos(ang), math.sin(ang)
    lx = (tx-t0[0])*ca + (ty-t0[1])*sa; ly = -(tx-t0[0])*sa + (ty-t0[1])*ca
    tee |= (np.abs(lx-1) < 3) & (np.abs(ly) < 2.2)
    # bunkers: greenside (1 or 2) and a fairway bunker at the landing zone
    a, b = pts[-2], pts[-1]; ang = math.atan2(b[1]-a[1], b[0]-a[0]); nx, ny = -math.sin(ang), math.cos(ang)
    sides = [1, -1] if H['n'] % 3 == 0 else [1 if H['n'] % 2 else -1]
    for s in sides: bunkers.append((b[0]+nx*8.5*s - math.cos(ang)*2, b[1]+ny*8.5*s - math.sin(ang)*2, 2.6, ang))
    if H['par'] > 3:
        # point ~62 tiles along the path
        rem = 62; 
        for a, b in zip(pts, pts[1:]):
            L = math.dist(a, b)
            if rem <= L:
                px, py = a[0]+(b[0]-a[0])*rem/L, a[1]+(b[1]-a[1])*rem/L; ang = math.atan2(b[1]-a[1], b[0]-a[0]); s = -1 if H['n'] % 2 else 1
                bunkers.append((px - math.sin(ang)*7*s, py + math.cos(ang)*7*s, 3.2, ang)); break
            rem -= L
for bx, by, r, ang in bunkers:
    ca, sa = math.cos(ang), math.sin(ang); lx = (tx-bx)*ca+(ty-by)*sa; ly = -(tx-bx)*sa+(ty-by)*ca
    sand |= (lx/(r*1.5))**2 + (ly/r)**2 < 1
wat = water.copy()
for cx, cy, rx, ry, a in C['ponds']:
    a = math.radians(a); ca, sa = math.cos(a), math.sin(a); lx = (tx-cx)*ca+(ty-cy)*sa; ly = -(tx-cx)*sa+(ty-cy)*ca
    wat |= (lx/rx)**2 + (ly/ry)**2 < 1 + .08*np.sin(np.arctan2(ly, lx)*4 + cx)
wat |= dpoly(C['burn']) < 2.4 + .6*np.sin(ty*.25)
wat &= ~(green | tee)   # greens and tees stay dry
sand &= ~wat

course = rough | fringe
water = water | wat
img[course] = (118, 168, 78); img[course] += rng.normal(0, 3, img[course].shape)
# mown stripes on fairways
stripe = ((np.floor((tx+ty)/4)) % 2 == 0)
img[fair] = (138, 196, 92); img[fair & stripe] = (128, 186, 84)
img[fringe] = (126, 190, 88); img[green] = (150, 214, 104)
img[tee] = (144, 204, 96)
img[sand] = (232, 214, 160)
shore = wat & ~(np.roll(wat,3,0) & np.roll(wat,-3,0) & np.roll(wat,3,1) & np.roll(wat,-3,1))
img[wat] = (84, 140, 200); img[wat] += (np.sin(tx*1.3+ty*.4)*4)[wat][:, None]; img[shore] = (70, 118, 170)
img[water & ~wat] = (84, 140, 200)
# trees off the course
treec = (cell == 'T') & ~course; rockc = (cell == 'R') & ~course
out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
dr = ImageDraw.Draw(out)
def px(x, y): return ((x-X0)*P, (y-Y0)*P)
r2 = np.random.default_rng(3)
for j in range(Hh):
    for i in range(W):
        x, y = X0+i+.5, Y0+j+.5; X, Y = px(x, y)
        if water[int(Y), int(X)]: continue
        if S[j][i] == 'T' and not course[int(Y), int(X)]:
            rr = 4 + r2.random()*2.2; c = (52+r2.integers(0,20), 92+r2.integers(0,24), 52)
            dr.ellipse([X-rr+1.5, Y-rr+2.5, X+rr+1.5, Y+rr+2.5], fill=(70, 96, 58)); dr.ellipse([X-rr, Y-rr, X+rr, Y+rr], fill=c)
        elif S[j][i] == 'R' and not course[int(Y), int(X)]:
            dr.ellipse([X-3, Y-2.5, X+3, Y+2.5], fill=(150, 146, 138), outline=(110, 106, 100))
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15); FS = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 11)
FL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 15)
# walking paths green -> next tee (dotted)
for a, b in zip(C['holes'], C['holes'][1:]):
    p, q = px(*a['pts'][-1]), px(*b['pts'][0]); n = int(math.dist(p, q)/7)
    for k in range(1, n): t = k/n; X, Y = p[0]+(q[0]-p[0])*t, p[1]+(q[1]-p[1])*t; dr.ellipse([X-1.6, Y-1.6, X+1.6, Y+1.6], fill=(214, 196, 150))
# clubhouse, halfway house, path from Saltmere
def building(x, y, wd, ht, name, roof=(150, 70, 52)):
    X, Y = px(x, y); dr.rectangle([X-wd/2+3, Y-ht/2+4, X+wd/2+3, Y+ht/2+4], fill=(60, 70, 50))
    dr.rectangle([X-wd/2, Y-ht/2, X+wd/2, Y+ht/2], fill=roof, outline=(70, 40, 30), width=2)
    dr.line([X-wd/2, Y, X+wd/2, Y], fill=(110, 50, 38), width=2)
    bb = dr.textbbox((0, 0), name, font=FL); tw = bb[2]-bb[0]
    dr.rounded_rectangle([X-tw/2-6, Y+ht/2+6, X+tw/2+6, Y+ht/2+26], 5, fill=(255, 248, 230), outline=(70, 40, 30)); dr.text((X-tw/2, Y+ht/2+7), name, font=FL, fill=(60, 35, 20))
# path to Saltmere
pp = [px(*C['club']), px(620, -104), px(598, -98), px(578, -92), px(560, -90)]
dr.line(pp, fill=(200, 176, 128), width=7, joint='curve'); dr.line(pp, fill=(222, 202, 156), width=4, joint='curve')
building(*C['club'], 60, 34, 'Clubhouse')
building(*C['half'], 30, 20, 'Halfway hut', roof=(120, 90, 60))
# hole markers: flag on green, tee number, label
for H in C['holes']:
    g = px(*H['pts'][-1]); dr.line([g[0], g[1], g[0], g[1]-20], fill=(250, 250, 250), width=2); dr.polygon([(g[0], g[1]-20), (g[0]+12, g[1]-16), (g[0], g[1]-12)], fill=(220, 40, 40)); dr.ellipse([g[0]-2, g[1]-2, g[0]+2, g[1]+2], fill=(20, 20, 20))
    t = px(*H['pts'][0]); r = 11
    dr.ellipse([t[0]-r, t[1]-r, t[0]+r, t[1]+r], fill=(250, 246, 230), outline=(40, 60, 30), width=2)
    s = str(H['n']); bb = dr.textbbox((0, 0), s, font=F); dr.text((t[0]-(bb[2]-bb[0])/2-bb[0], t[1]-(bb[3]-bb[1])/2-bb[1]), s, font=F, fill=(30, 50, 20))
    # aim line (faint)
    q = [px(*p) for p in H['pts']]
    for a, b in zip(q, q[1:]):
        n = int(math.dist(a, b)/9)
        for k in range(n): u = k/n; v = (k+.45)/n; dr.line([a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u, a[0]+(b[0]-a[0])*v, a[1]+(b[1]-a[1])*v], fill=(255, 255, 255, 120), width=1)
    lab = 'Par %d · %d yd' % (H['par'], H['yd']); a, b = H['pts'][0], H['pts'][1]
    ux, uy = a[0]-b[0], a[1]-b[1]; L = math.hypot(ux, uy); ux, uy = ux/L, uy/L
    bb = dr.textbbox((0, 0), lab, font=FS); tw = bb[2]-bb[0]
    X = t[0] + ux*22 - tw/2; Y = t[1] + uy*22 - 6
    if abs(ux) > .7: X = t[0] - tw - 16 if ux < 0 else t[0] + 16; Y = t[1] - 7
    X = min(max(X, 44), w - tw - 6)
    dr.rounded_rectangle([X-3, Y-1, X+tw+3, Y+15], 3, fill=(30, 50, 25)); dr.text((X, Y), lab, font=FS, fill=(240, 236, 210))
# arrows / labels
def tag(x, y, s):
    X, Y = px(x, y); bb = dr.textbbox((0, 0), s, font=FS); dr.rounded_rectangle([X-3, Y-2, X+bb[2]+3, Y+15], 3, fill=(255, 248, 230), outline=(70, 40, 30)); dr.text((X, Y), s, font=FS, fill=(60, 35, 20))
tag(541, -97, '<- to Saltmere'); tag(668, -100, 'the bay'); tag(612, -330, 'the burn')
out = out.crop((40, 0, w, h - 12*P))   # trim the empty west strip and the bay's bottom
out.save('/tmp/claude-1000/golf/course_map.png'); print(out.size)
