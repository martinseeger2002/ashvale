#!/usr/bin/env python3
"""editor/migrate_piers.py <zone json> [--dry] - turn a zone's painted pier/bridge tiles ('B') into assets (2026-10-04:
piers "should be building assets instead" of terrain): each run of B tiles becomes rectangles (greedy, rows first), an
object {k: 'pier' | 'bridge', x, y, w, h} - 'bridge' when it reaches land at both ends, 'pier' otherwise - and the tiles
under it go back to water ('~'). The game lays the decks from the objects (editor/patches/pier_assets_patch.py)."""
import json, sys, shutil, time, os
p = sys.argv[1]; dry = '--dry' in sys.argv
mod = json.load(open(p)); z = mod['data']; ox, oy = z['origin']; W, H = z['size']
T = [list(r) for r in z['tiles']]
B = lambda x, y: 0 <= x < W and 0 <= y < H and T[y][x] == 'B'
land = lambda x, y: 0 <= x < W and 0 <= y < H and T[y][x] not in '~B'
used = [[False] * W for _ in range(H)]; rects = []
for y in range(H):
    for x in range(W):
        if not B(x, y) or used[y][x]: continue
        w = 1
        while B(x + w, y) and not used[y][x + w]: w += 1
        h = 1
        while all(B(x + i, y + h) and not used[y + h][x + i] for i in range(w)): h += 1
        for j in range(h):
            for i in range(w): used[y + j][x + i] = True
        rects.append((x, y, w, h))
objs = []
for x, y, w, h in rects:
    if w >= h: ends = (any(land(x - 1, y + j) for j in range(h)), any(land(x + w, y + j) for j in range(h)))
    else: ends = (any(land(x + i, y - 1) for i in range(w)), any(land(x + i, y + h) for i in range(w)))
    objs.append({'k': 'bridge' if all(ends) else 'pier', 'x': ox + x, 'y': oy + y, 'w': w, 'h': h})
for x, y, w, h in rects:
    for j in range(h):
        for i in range(w): T[y + j][x + i] = '~'
print('%s: %d B tiles -> %d assets (%d piers, %d bridges)' % (os.path.basename(p), sum(w * h for _, _, w, h in rects), len(objs), sum(o['k'] == 'pier' for o in objs), sum(o['k'] == 'bridge' for o in objs)))
if dry or not objs: sys.exit()
shutil.copy2(p, p + '.before-piers.' + time.strftime('%Y%m%d-%H%M%S'))
z['tiles'] = [''.join(r) for r in T]; z['objects'] = z.get('objects', []) + objs
json.dump(mod, open(p, 'w'), separators=(',', ':')); print('written (backup next to it)')
