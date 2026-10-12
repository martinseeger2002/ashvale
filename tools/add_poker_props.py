#!/usr/bin/env python3
"""Put the poker tables into Saltmere's tap room, in place, in the shipped zone bytes.

data/zone.saltmere.json is hand-edited after it was first generated (the guards, Wenna, the
cobbles and the tavern's walls are all edits that tools/make_zone_saltmere.mjs does not know
about - re-running it drops five NPCs and turns cobbles into mud). So this script touches only
the objects list. Tiles, NPCs and everything else keep their shipped bytes.

The room (2026-10-11, the top-down diagram in handoff/poker_plan.md 6c): the Tap's first
floor up, two round tables on two-by-two tiles each, eight chairs a table standing two to a side
(the corner tiles stay free to walk), the stairs hole at 458-459,26 beside table 2.

Idempotent: run it twice, the second run changes nothing. Coords are the zone's own local frame
(origin [377,-24]), the same one the file stores.
"""
import json, sys

FILE = 'data/zone.saltmere.json'
LV = 1   # the tavern's first floor up (2026-10-11: "it's supposed to be on the second story where there's plenty of room")

def ring(x, y):
    """the eight seat tiles round a 2x2 table at x..x+1, y..y+1: two a side, clockwise from the north-west"""
    return [[x, y - 1], [x + 1, y - 1], [x + 2, y], [x + 2, y + 1], [x + 1, y + 2], [x, y + 2], [x - 1, y + 1], [x - 1, y]]

TABLES = [{'id': 'poker1', 'x': 454, 'y': 28}, {'id': 'poker2', 'x': 458, 'y': 28}]
OLD = [[458, 28], [459, 28]]            # the tap room's own table and chair, out of the way (ground floor)
MOVED = [[460, 27], [460, 28]]

def main():
    doc = json.load(open(FILE))
    objs = doc['data']['objects']
    want = []
    for t in TABLES:
        want.append({'k': 'pokertable', 'id': t['id'], 'x': t['x'], 'y': t['y'], 'seats': ring(t['x'], t['y']), 'felt': '#1f4d38', 'w': 2, 'h': 2, 'lv': LV})
        for s in ring(t['x'], t['y']): want.append({'k': 'chair', 'x': s[0], 'y': s[1], 'w': 1, 'h': 1, 'lv': LV})
    have = [o for o in objs if o.get('k') == 'pokertable' or (o.get('k') == 'chair' and (o.get('lv') or 0) == LV)]
    if have == want:
        print('already in place: %s' % ', '.join('%s at %d,%d' % (t['id'], t['x'], t['y']) for t in TABLES)); return 0
    moved = []
    for k, old, to in zip(('table', 'chair'), OLD, MOVED):
        hit = next((o for o in objs if o.get('k') == k and o['x'] == old[0] and o['y'] == old[1] and not o.get('lv')), None)
        if hit: hit['x'], hit['y'] = to[0], to[1]; moved.append(k)
    objs[:] = [o for o in objs if o not in have] + want   # the old poker furniture out, the room's furniture in
    json.dump(doc, open(FILE, 'w'), separators=(',', ':'), ensure_ascii=False)
    print('placed %s, %d chairs; took out %d old poker objects; moved aside: %s'
          % (', '.join('%s at %d,%d' % (t['id'], t['x'], t['y']) for t in TABLES), 16, len(have), ' '.join(moved) or 'nothing'))
    return 0

if __name__ == '__main__':
    sys.exit(main())
