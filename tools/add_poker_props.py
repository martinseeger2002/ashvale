#!/usr/bin/env python3
"""Put the poker table into Saltmere's tap room, in place, in the shipped zone bytes.

data/zone.saltmere.json is hand-edited after it was first generated (the guards, Wenna, the
cobbles and the tavern's walls are all edits that tools/make_zone_saltmere.mjs does not know
about - re-running it drops five NPCs and turns cobbles into mud). So this script touches only
the objects list: it moves the one table+chair that stood in the way and adds the poker table
with its six chairs. Tiles, NPCs and everything else keep their shipped bytes.

Idempotent: run it twice, the second run changes nothing. Coords are the zone's own local frame
(origin [377,-24]), the same one the file stores.
"""
import json, sys

FILE = 'data/zone.saltmere.json'
TABLE_ID = 'poker1'
TABLE = [457, 29]
# the six chairs, clockwise from the north-west one; the table sits in the middle of them
SEATS = [[456, 28], [458, 28], [458, 29], [458, 30], [456, 30], [456, 29]]
OLD = [[458, 28], [459, 28]]            # the tap room's own table and chair, out of the way
MOVED = [[460, 27], [460, 28]]

def main():
    doc = json.load(open(FILE))
    objs = doc['data']['objects']
    have = [o for o in objs if o.get('id') == TABLE_ID]
    if have:
        print('already in place: %s at %d,%d with %d chairs'
              % (TABLE_ID, have[0]['x'], have[0]['y'], len(have[0]['seats'])))
        return 0
    moved = []
    for k, old, to in zip(('table', 'chair'), OLD, MOVED):
        hit = next((o for o in objs if o.get('k') == k and o['x'] == old[0] and o['y'] == old[1]), None)
        if hit:
            hit['x'], hit['y'] = to[0], to[1]
            moved.append(k)
    for s in SEATS:
        objs.append({'k': 'chair', 'x': s[0], 'y': s[1], 'w': 1, 'h': 1})
    objs.append({'k': 'pokertable', 'id': TABLE_ID, 'x': TABLE[0], 'y': TABLE[1], 'seats': SEATS,
                 'felt': '#1f4d38', 'w': 1, 'h': 1})
    json.dump(doc, open(FILE, 'w'), separators=(',', ':'), ensure_ascii=False)
    print('added %s at %d,%d and %d chairs; moved aside: %s'
          % (TABLE_ID, TABLE[0], TABLE[1], len(SEATS), ' '.join(moved) or 'nothing'))
    return 0

if __name__ == '__main__':
    sys.exit(main())
