# The Saltmere Tap, first floor up, top-down: the room is the house's footprint (453..460 x 25..30, 8 x 6 tiles),
# the stairs hole at 458-459,26. Panels: now / one big round table / two tables. Chairs drawn as in scene.js (0.44 seat).
from PIL import Image, ImageDraw, ImageFont
import math, sys
SP = sys.argv[1]; SC = 90
X0, Y0, W, H = 453, 25, 8, 6
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18); fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13); fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
def panel(title, tables, note):
    PW, PH = (W + 2) * SC, (H + 2) * SC + 70
    im = Image.new('RGB', (PW, PH), (236, 228, 210)); d = ImageDraw.Draw(im)
    def P(x, z): return ((x - X0 + 1) * SC, (z - Y0 + 1) * SC + 50)
    for tx in range(X0, X0 + W):
        for tz in range(Y0, Y0 + H):
            d.rectangle([P(tx, tz), P(tx + 1, tz + 1)], fill=(214, 196, 160), outline=(190, 172, 140))
            d.text((P(tx, tz)[0] + 3, P(tx, tz)[1] + 2), '%d,%d' % (tx, tz), fill=(150, 135, 110), font=fs)
    d.rectangle([P(X0, Y0), P(X0 + W, Y0 + H)], outline=(70, 50, 30), width=8)   # the walls
    d.rectangle([P(458, 26), P(460, 27)], fill=(120, 90, 50)); d.text((P(458, 26)[0] + 6, P(458, 26)[1] + 20), 'STAIRS HOLE', fill=(255, 240, 200), font=fb); d.text((P(458, 26)[0] + 6, P(458, 26)[1] + 40), '(flight comes up here)', fill=(255, 240, 200), font=fs)
    d.text((P(453, 25)[0] + 6, P(453, 25)[1] - 24), 'N (street side, door is downstairs)', fill=(90, 70, 40), font=fs)
    for ti, (cx, cz, r, seats) in enumerate(tables):
        d.ellipse([P(cx - r - 0.09, cz - r - 0.09), P(cx + r + 0.09, cz + r + 0.09)], fill=(84, 52, 31))
        d.ellipse([P(cx - r + 0.09, cz - r + 0.09), P(cx + r - 0.09, cz + r - 0.09)], fill=(31, 77, 56))
        d.ellipse([P(cx - 0.42, cz - 0.42), P(cx + 0.42, cz + 0.42)], outline=(250, 200, 90), width=2)
        worst = 9
        for i, (tx, tz) in enumerate(seats):
            sx, sz = tx + 0.5, tz + 0.5; dx, dz = sx - cx, sz - cz; L = math.hypot(dx, dz); ang = math.atan2(dx, dz)
            def R(lx, lz): return (sx + lx * math.cos(ang) + lz * math.sin(ang), sz - lx * math.sin(ang) + lz * math.cos(ang))
            d.polygon([P(*q) for q in [R(-0.22, -0.22), R(0.22, -0.22), R(0.22, 0.22), R(-0.22, 0.22)]], fill=(160, 100, 56), outline=(90, 58, 30))
            d.polygon([P(*q) for q in [R(-0.22, 0.175), R(0.22, 0.175), R(0.22, 0.225), R(-0.22, 0.225)]], fill=(70, 44, 24))
            gap = L - 0.22 - (r + 0.09); worst = min(worst, gap)
            d.text((P(sx, sz)[0] - 5, P(sx, sz)[1] - 9), str(i + 1), fill=(255, 255, 255), font=fb)
        d.text((P(cx, cz)[0] - 40, P(cx, cz)[1] - 8), 'table %d' % (ti + 1), fill=(220, 230, 200), font=fb)
        d.text((P(cx, cz)[0] - 60, P(cx, cz)[1] + 10), 'chair-rail gap %.2f m' % worst, fill=(220, 230, 200), font=fs)
    d.text((10, 6), title, fill=(40, 30, 20), font=f); d.text((10, 28), note, fill=(80, 60, 40), font=fs)
    return im
now = [(457.5, 29.5, 0.95, [[456,28],[457,28],[458,28],[458,29],[458,30],[457,30],[456,30],[456,29]])]
ring = lambda x, y: [[x, y - 1], [x + 1, y - 1], [x + 2, y], [x + 2, y + 1], [x + 1, y + 2], [x, y + 2], [x - 1, y + 1], [x - 1, y]]   # a 2x2 table at x..x+1, y..y+1: two chairs a side, corners free
one = [(455.0, 29.0, 1.10, ring(454, 28))]
two = [(455.0, 29.0, 1.10, ring(454, 28)), (459.0, 29.0, 1.10, ring(458, 28))]
a = panel('NOW: one small table on tile 457,29, chairs on the 8 tiles round it', now, 'the straight chairs overlap the oval; the corner chairs are off it (what the operator saw)')
b = panel('ONE BIG TABLE: round, 2 x 2 tiles (454-455 x 28-29), two chairs a side, 8 seats', one, 'every chair 0.17 m off the rail, none under it; the corner tiles stay free to walk; east half of the room is open')
c = panel('TWO TABLES: the same table twice, 16 seats', two, 'table 2 sits beside the stairs: you come up onto chairs 1-2 of it (chairs can be walked over); chairs 3-4 of table 1 and 7-8 of table 2 are back to back')
out = Image.new('RGB', (a.width * 3 + 40, a.height), (255, 255, 255))
for i, im in enumerate((a, b, c)): out.paste(im, (i * (a.width + 20), 0))
out.save(SP + '/poker_room.png'); print('saved', out.size)
