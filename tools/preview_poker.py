#!/usr/bin/python3
"""The poker preview: one self-contained page, the current release's bytes plus the poker table, onto the preview
server on .25. Nothing is inscribed, nothing is merged - this only writes ~/ashvale-preview/poker.html there.

Why it is safe to call it "the current game with poker in it": the modules that go into dist/ are compared with what
the chain already holds (chain/modules.json, by content sha) before anything leaves this box. Anything that differs
must be one of the files the poker table needed - core, engine, scene, hud, the two seated HUDs, the saltmere zone -
or the preview stops. zones/saltmere is the live inscription with the poker props put beside the objects already in
it (tools/add_poker_props.py), never a regenerated zone.

Usage:
    tools/preview_poker.py            # build, check, stamp, push, and say the URL
    tools/preview_poker.py --check    # only compare dist with the live bytes and report
    tools/preview_poker.py --local    # build and stamp, no push
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PAGE = os.path.join(ROOT, 'dist', 'ashvale3d.html')
OUT = os.path.join(ROOT, 'dist', 'ashvale3d-poker-preview.html')
DEST = 'robin@192.168.1.20:ashvale-preview/poker.html'
URL = 'http://192.168.1.20:8790/poker.html'
MINE = {'core', 'engine', 'engbank', 'scene', 'hud', 'hudchess', 'hudpoker', 'holdemlib', 'zones/saltmere'}

state = json.load(open(os.path.join(ROOT, 'chain', 'modules.json')))
LIVE, reg = state['modules'], json.load(open(os.path.join(ROOT, 'dist', 'registry.json')))


def file_of(name, group):
    if group == 'parts': return os.path.join(ROOT, 'dist', 'modules', 'part.' + name + '.json')
    if group == 'zones': return os.path.join(ROOT, 'dist', 'modules', 'zone.' + name + '.json')
    if group == 'data': return os.path.join(ROOT, 'dist', 'modules', name + '.json')
    return os.path.join(ROOT, 'dist', 'modules', name + '.js')


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f: h.update(f.read())
    return h.hexdigest()


def each():
    for k, e in reg['modules'].items():
        if k == 'three': continue
        if k in ('data', 'zones', 'parts'):
            for n, sub in e.items(): yield k + '/' + n, file_of(n, k)
        else: yield k, file_of(k, '')
    for k, e in (reg.get('lazy') or {}).items():
        for n, sub in e.items(): yield k + '/' + n, file_of(n, k)


def compare():
    """What a release would change, module by module, against the bytes the chain points at now."""
    changed, never = [], []
    for key, path in each():
        if not os.path.exists(path): print('MISSING  %s has no dist file' % key); continue
        live = LIVE.get(key)
        if live is None: never.append(key); continue
        if live.get('sha') != sha(path): changed.append(key)
    return changed, never


changed, never = compare()
stray = sorted((set(changed) | set(never)) - MINE)
print('registry version %s (chain/modules.json, %s)' % (state.get('registry_version'),
      time.strftime('%Y-%m-%d %H:%M', time.localtime(os.path.getmtime(os.path.join(ROOT, 'chain', 'modules.json'))))))
print('different from the live bytes: %s' % ', '.join(sorted(set(changed) | set(never))))
if never: print('never on the chain (mine, new): %s' % ', '.join(sorted(never)))
if stray:
    sys.exit('STOP - %d module(s) this preview is not about differ from live: %s\n'
             'Hold them (tools/hold_live.py) or say why, then run this again.' % (len(stray), ', '.join(stray)))
if '--check' in sys.argv: sys.exit(0)

subprocess.run([sys.executable, os.path.join(ROOT, 'build.py')], check=True, cwd=ROOT,
               stdout=subprocess.DEVNULL)
html = open(PAGE, encoding='utf-8').read()
stamp = 'ASHVALE preview - poker table (registry v%s, built %s, nothing published)' % (
    state.get('registry_version'), time.strftime('%Y-%m-%d %H:%M'))
html, n = re.subn(r'<title>[^<]*</title>', '<title>' + stamp + '</title>', html, count=1)
if not n: sys.exit('STOP - the built page has no <title> to stamp')
open(OUT, 'w', encoding='utf-8').write(html)
print('stamped %s  (%.2f MB)' % (os.path.relpath(OUT, ROOT), len(html) / 1e6))
if '--local' in sys.argv: sys.exit(0)
subprocess.run(['scp', OUT, DEST], check=True)
code = subprocess.run(['ssh', 'robin@192.168.1.20', "curl -s -o /dev/null -w '%%{http_code}' http://127.0.0.1:8790/poker.html"],
                      capture_output=True, text=True).stdout
print('pushed to %s - it answers %s' % (DEST, code))
print('open ' + URL + ' (two tabs of the same URL, with &loopback&seed=poker1, are the two seats at one table)')
