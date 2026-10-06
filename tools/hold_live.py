#!/usr/bin/python3
"""Hold modules back at the bytes the chain already has, so a release ships only your own work.

build.py rewrites all of dist/, so a build that includes someone else's unfinished lane would
publish that lane the moment you released. Holding means putting the LIVE bytes back for the modules
you are not shipping: their sha then matches chain/modules.json, release_modular.py sees them as
unchanged, and they keep their existing ids - so the next release re-detects them and ships them when
their owner is ready. Nothing is lost by holding, and nothing of theirs reaches the chain by accident.

A module that was never inscribed (no entry in chain/modules.json) cannot be held - there are no live
bytes to go back to - and publishing one by accident is worse than holding, so name it with --drop and
its dist file and its registry entry both go. (zones/saltmere is the standing case: built by the
worldgen lane, never on chain.)

Usage:
    tools/hold_live.py [key-pattern ...] [--drop key]... [--dry]
        patterns are substrings of the module key, defaulting to the worldgen/weather lane
        (globe, globecfg, worldgen, world, wg_, weather). Keys look like 'core', 'data/globecfg',
        'zones/village', 'parts/char.silas'.
    tools/release_modular.py --no-build        # afterwards, once it says what it holds

The mapping from a registry key to its file is the release tool's own (file_of), copied here because
reading a module back onto disk has to agree with what gets hashed at release time to the byte.
"""
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MOD = os.path.join(ROOT, 'dist', 'modules')
STATE = os.path.join(ROOT, 'chain', 'modules.json')
APP = 'https://app.dogecoinarcade.com'
DEFAULT = ('globe', 'globecfg', 'worldgen', 'world', 'wg_', 'weather')

st = json.load(open(STATE))
reg = json.load(open(os.path.join(ROOT, 'dist', 'registry.json')))
LIVE = st['modules']
DRY = '--dry' in sys.argv
pats, drops, args = [], [], [a for a in sys.argv[1:] if not a.startswith('--')]
for i, a in enumerate(sys.argv[1:]):
    if a == '--drop' and i + 1 < len(args) + 1:
        try:
            drops.append(sys.argv[2 + i])
        except IndexError:
            pass
pats = [a for a in args if a != '--dry' and a not in drops] or list(DEFAULT)


def file_of(name, group):
    if group == 'parts': return os.path.join(MOD, 'part.' + name + '.json')
    if group == 'zones': return os.path.join(MOD, 'zone.' + name + '.json')
    if group == 'data': return os.path.join(MOD, name + '.json')
    return os.path.join(MOD, name + '.js')


def sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()


def each_module():
    for k, e in reg['modules'].items():
        if k == 'three': continue
        if k in ('data', 'zones', 'parts'):
            for n, sub in e.items(): yield (k + '/' + n, file_of(n, k), sub, e, n)
        else:
            yield (k, file_of(k, ''), e, reg['modules'], k)


held, unchanged, fresh, missing = [], [], [], []
for key, path, entry, parent, name in list(each_module()):
    if not os.path.exists(path):
        missing.append(key)
        continue
    live = LIVE.get(key)
    if any(d == key for d in drops):
        print('DROP   %-22s %s' % (key, path))
        if not DRY:
            os.remove(path)
            parent.pop(name, None)
        continue
    if live is None:
        fresh.append(key)
        continue
    if live.get('sha') == sha256(path):
        unchanged.append(key)
        continue
    if not any(p in key for p in pats):
        fresh.append(key)                      # changed and NOT named: the release will publish it
        continue
    url = APP + '/content/' + live['id']
    with urllib.request.urlopen(url, timeout=120) as r:
        blob = r.read()
    print('HOLD   %-22s %s  <- %s' % (key, os.path.getsize(path), live['id'][:16]))
    if not DRY:
        with open(path, 'wb') as f:
            f.write(blob)
        entry['id'] = live['id']

print('\n%d held at live bytes, %d already matching, %d that a release WOULD publish.'
      % (len(held) or 0, len(unchanged), len(fresh)))
if fresh:
    print('  going out: ' + ', '.join(sorted(fresh)))
if missing:
    print('  %d registry entries have no dist file (build did not write them): %s'
          % (len(missing), ', '.join(sorted(missing)[:6])))
print('Never-inscribed and not dropped (a release would inscribe these for the first time): %s'
      % (', '.join(sorted(fresh)) or 'none'))
if DRY:
    print('dry run: nothing written')
else:
    json.dump(reg, open(os.path.join(ROOT, 'dist', 'registry.json'), 'w'), indent=1)
    print('dist/registry.json rewritten - release with tools/release_modular.py --no-build')
