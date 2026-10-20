"""Saltmere Links draft layout: 18 holes in tile coords (1 tile = 1 m; shown as yards = tiles x 4)."""
import json, math
YD = 4
# lanes (fairway centre lines) x: A 566 B 595 C 624 | D 652 E 680 F 706 ; play y from -128 (south) to -366 (north)
H = [  # par, [tee, waypoints..., green]
 (4, [(626,-128),(620,-175),(624,-214)]),          # 1 C north, slight dogleg left
 (3, [(622,-224),(628,-262)]),                     # 2 C north, pond right of the green
 (4, [(624,-274),(616,-322),(622,-364)]),          # 3 C north to the top
 (5, [(597,-366),(603,-310),(591,-252),(595,-246)]), # 4 B south, long, double dogleg
 (3, [(593,-236),(597,-198)]),                     # 5 B south
 (4, [(595,-188),(589,-150),(594,-124)]),          # 6 B south
 (4, [(566,-128),(570,-180),(566,-208)]),          # 7 A north
 (4, [(565,-218),(560,-262),(567,-296)]),          # 8 A north
 (3, [(566,-306),(568,-352)]),                     # 9 A north -> halfway house
 (5, [(578,-378),(620,-390),(664,-386),(700,-384)]), # 10 along the top edge east
 (4, [(708,-366),(702,-318),(707,-276)]),          # 11 F south
 (3, [(706,-266),(704,-224)]),                     # 12 F south
 (4, [(706,-214),(711,-170),(704,-128)]),          # 13 F south
 (5, [(680,-130),(675,-190),(684,-242),(680,-250)]), # 14 E north
 (3, [(681,-262),(678,-302)]),                     # 15 E north
 (4, [(680,-312),(684,-342),(676,-366)]),          # 16 E north
 (4, [(652,-366),(656,-320),(651,-282)]),          # 17 D south
 (5, [(652,-272),(645,-210),(655,-160),(652,-128)]), # 18 D south home along the bay
]
# water: lakes/ponds (cx, cy, rx, ry, angle deg) and the burn (a creek polyline, half-width 2.4)
PONDS = [
 (641,-252,13,16,10),  # the old pond, grown: the carry from the 18th tee
 (632,-170,6,9,0),     # 1: right of the landing zone
 (619,-250,6,5,0),     # 2: in front of the green
 (606,-322,5,8,-10),   # 4: left of the second shot
 (594,-213,6,5,0),     # 5: across the front of the par-3 green
 (583,-138,5,7,0),     # 6: left of the green
 (578,-200,6,10,0),    # 7: right of the green, between A and B
 (556,-248,5,9,0),     # 8: left of the landing zone
 (568,-334,7,5,0),     # 9: in front of the par-3 green
 (640,-380,16,4,0),    # 10: the lake left of the top fairway
 (694,-300,5,9,0),     # 11: left of the green
 (707,-235,9,5,0),     # 12: island-ish green, water front and right
 (716,-226,4,9,0),
 (692,-170,5,9,0),     # 13/14: the lake between the two lanes
 (679,-284,7,5,0),     # 15: in front of the par-3 green
 (668,-355,5,7,0),     # 16: right of the green
 (662,-306,5,9,0),     # 17: left of the landing zone
 (660,-150,6,8,0),     # 18: right of the last green's approach
 (637,-330,7,22,4),    # the meadow lake between the 3rd and the 17th
 (631,-212,5,6,0),     # 1: guarding the green on the right
 (612,-357,5,6,0),     # 3: right of the green
 (680,-208,6,7,0),     # 14: the carry from the tee box... mid fairway
 (656,-292,5,6,0),     # 17: left of the green
 (686,-336,5,6,0),     # 16: in front of the tee shot
 (600,-140,4,6,0),     # 6: right of the green
 (574,-288,4,7,0),     # 8: right of the green
 (700,-372,6,4,0),     # 10: behind the green
]
BURN = [(603,-398),(606,-370),(612,-352),(606,-336),(616,-300),(628,-282),(636,-266),(650,-236),(664,-214),(670,-192),(686,-180),(698,-150),(713,-128),(720,-108)]
CLUB = (638, -116); HALF = (580, -364)
def L(pts): return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
out = []
for n, (par, pts) in enumerate(H, 1):
    out.append({'n': n, 'par': par, 'pts': pts, 'tiles': round(L(pts)), 'yd': round(L(pts) * YD / 5) * 5})
if __name__ == '__main__':
    for h in out: print(h['n'], h['par'], h['tiles'], h['yd'])
    print('par', sum(h['par'] for h in out), 'yards', sum(h['yd'] for h in out))
    # separation between different holes' centre lines
    def segd(p, a, b):
        ax, ay = a; bx, by = b; px, py = p; dx, dy = bx-ax, by-ay; t = max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy or 1)))
        return math.dist(p, (ax+t*dx, ay+t*dy))
    def samp(pts):
        s = []
        for a, b in zip(pts, pts[1:]):
            k = max(1, int(math.dist(a, b)))
            s += [(a[0]+(b[0]-a[0])*i/k, a[1]+(b[1]-a[1])*i/k) for i in range(k+1)]
        return s
    for i in range(18):
        for j in range(i+1, 18):
            d = min(segd(p, a, b) for p in samp(out[i]['pts']) for a, b in zip(out[j]['pts'], out[j]['pts'][1:]))
            if d < 16: print('close', i+1, j+1, round(d, 1))
    json.dump({'holes': out, 'ponds': PONDS, 'burn': BURN, 'club': CLUB, 'half': HALF, 'yd': YD}, open('/tmp/claude-1000/golf/course.json', 'w'))
