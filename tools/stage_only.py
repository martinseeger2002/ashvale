"""stage_only.py KEY [KEY ...] - after build.py, put every OTHER changed module back to its live bytes (downloaded by id,
checked against the sha in chain/modules.json) so a release ships only the named modules (e.g. scene data/housekit).
Used when src/ or data/ also hold unreleased work (the local agent's quests). Then: release_modular.py --no-build."""
import json, hashlib, sys, os, subprocess, urllib.request, gzip
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(HERE)
keep = set(sys.argv[1:])
st = json.load(open('chain/modules.json')); reg = json.load(open('dist/registry.json'))
live = json.load(open('chain/registry_v%d.json' % st['registry_version']))
sha = lambda b: hashlib.sha256(b).hexdigest()
out = subprocess.run([sys.executable, 'tools/release_modular.py', '--dry', '--no-build'], capture_output=True, text=True).stdout
changed = out.strip().splitlines()[-1].split('changed:')[1].strip().rstrip('.').split(', ') if 'changed:' in out and out.strip().splitlines()[-1].split('changed:')[1].strip() else []
def path(key):
    if '/' in key: g, n = key.split('/'); return 'dist/modules/' + {'parts': 'part.', 'zones': 'zone.', 'data': ''}[g] + n + '.json'
    return 'dist/modules/' + key + '.js'
for key in changed:
    if key in keep: continue
    if key not in st['modules']: raise SystemExit('%s is new and not named: build it into the release or drop it' % key)
    m = st['modules'][key]; b = urllib.request.urlopen('https://app.dogecoinarcade.com/content/' + m['id'], timeout=60).read()
    if sha(b) != m['sha']:
        try: b = gzip.decompress(b)
        except Exception: pass
    assert sha(b) == m['sha'], key
    open(path(key), 'wb').write(b)
    if '/' in key: g, n = key.split('/'); reg['modules'][g][n]['v'] = live['modules'][g][n]['v']
    else: reg['modules'][key]['v'] = live['modules'][key]['v']
    print('kept live', key)
json.dump(reg, open('dist/registry.json', 'w'), separators=(',', ':'))
print(subprocess.run([sys.executable, 'tools/release_modular.py', '--dry', '--no-build'], capture_output=True, text=True).stdout.strip().splitlines()[-1])
