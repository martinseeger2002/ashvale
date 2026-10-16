#!/usr/bin/env python3
"""Put the bank of four Fortune Engines into Saltmere's tap room, in place, in the shipped zone bytes.

2026-10-16: "a bank of four machines" on the card room's north wall, tiles 453,25-456,25, a chess-park bench in
front of each machine. The Tap's first floor up (lv 1), the same room as the card tables (tools/add_poker_props.py has
why this script touches only the objects list: the zone is hand-edited after generation).

Each machine is one object: k 'fortune', its tile (the cabinet against the wall), seat = the bench tile in front of it,
face 's' (the glass looks south into the room). The scene draws the cabinet and its bench; core blocks the cabinet tile.

Idempotent: run it twice, the second run changes nothing. Coords are the zone's own local frame (origin [377,-24]).
"""
import json, sys

FILE = 'data/zone.saltmere.json'
LV = 1
MACHINES = [{'id': 'fe%d' % (i + 1), 'x': 453 + i, 'y': 25} for i in range(4)]

def main():
    doc = json.load(open(FILE))
    objs = doc['data']['objects']
    want = [{'k': 'fortune', 'id': m['id'], 'x': m['x'], 'y': m['y'], 'seat': [m['x'], m['y'] + 1], 'face': 's', 'w': 1, 'h': 1, 'lv': LV} for m in MACHINES]
    have = [o for o in objs if o.get('k') == 'fortune']
    if have == want:
        print('already in place: %s' % ', '.join('%s at %d,%d' % (m['id'], m['x'], m['y']) for m in MACHINES)); return 0
    objs[:] = [o for o in objs if o not in have] + want
    json.dump(doc, open(FILE, 'w'), separators=(',', ':'), ensure_ascii=False)
    print('placed %s; took out %d old ones' % (', '.join('%s at %d,%d' % (m['id'], m['x'], m['y']) for m in MACHINES), len(have)))
    return 0

if __name__ == '__main__':
    sys.exit(main())
