"""release_atlas.py [--dry] [--no-build] [--launcher] - publish ASHVALE Atlas (the world explorer app; 2026-10-02:
"a standalone application", "still an inscription", "definitely modular") the same modular way as the game:
  1. python3 tools/globe_roam.py  (fresh playtest/atlas/modules/* + playtest/atlas/registry.json), unless --no-build
  2. every module whose content is already on chain as an @ashvale inscription (the game's models, fog, parts, zones,
     or an earlier Atlas release) REUSES that id; only new content is inscribed (batch sends, ids resolved by sha256)
  3. an ATLAS REGISTRY inscription, {"ashvale3d":"atlas-registry", app, version N+1, modules}, inscribed with the same
     JSON beside the file (the launcher finds it through /r/inscriptions' json field). Never the tag "registry": the
     game's launcher takes the newest {"ashvale3d":"registry"} by @ashvale and must never pick up the Atlas.
  4. first release only (or --launcher): the ATLAS LAUNCHER page (loader + boot), which finds @ashvale's newest atlas
     registry at start and boots from it. Every later Atlas release is only steps 2-3.
State: chain/atlas.json. Log: append to chain/release_atlas.log. Run with the ghost-devs venv python (as @ashvale).
Release gate: the operator playtests playtest/globe_roam.html and says OK before this is run."""
import sys, os, json, hashlib, subprocess, time, urllib.request
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
ASHVALE = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
THREE_ID = '374cfd2b2f114e9da4ade8add495fe8aa0b2b996a710fb538759a956f15f9539'
STATE = os.path.join(HERE, 'chain', 'atlas.json')
REGF = os.path.join(HERE, 'playtest', 'atlas', 'registry.json')
DRY = '--dry' in sys.argv
APP = 'https://app.dogecoinarcade.com'

st = json.load(open(STATE)) if os.path.exists(STATE) else {"modules": {}, "registry_version": 0, "registries": [], "launcher": None}
def save(): json.dump(st, open(STATE, 'w'), indent=1)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

if '--no-build' not in sys.argv:
    subprocess.run(['python3', os.path.join(HERE, 'tools', 'globe_roam.py')], cwd=HERE, check=True, capture_output=True)
reg = json.load(open(REGF))
assert reg.get('ashvale3d') == 'atlas-registry', 'the Atlas registry must be tagged atlas-registry (see the docstring)'

entries = []   # (key, path, entry)
for k, e in reg['modules'].items():
    if k == 'three': continue
    if 'kind' in e: entries.append((k, os.path.join(HERE, e['file']), e))
    else:
        for n, sub in e.items(): entries.append((k + '/' + n, os.path.join(HERE, sub['file']), sub))

def listing():
    L = json.load(urllib.request.urlopen(APP + '/r/inscriptions?creator=' + ASHVALE + '&limit=300', timeout=30))
    return {p['sha256']: p['id'] for p in L if p.get('sha256')}
known = {}
gm = os.path.join(HERE, 'chain', 'modules.json')
if os.path.exists(gm):
    for v in json.load(open(gm))['modules'].values(): known[v['sha']] = v['id']
for v in st['modules'].values(): known[v['sha']] = v['id']
try: known.update(listing())
except Exception as e: print('listing failed (only local state used):', e, flush=True)

todo = []
for key, p, e in entries:
    h = sha(p)
    if h in known: st['modules'][key] = {'id': known[h], 'sha': h, 'v': e.get('v'), 'bytes': os.path.getsize(p)}
    else: todo.append((key, p, e))
save()
print(len(entries), 'Atlas modules,', len(entries) - len(todo), 'already on chain (reused),', len(todo), 'to inscribe:', ', '.join(k for k, _, _ in todo[:15]) + (' ...' if len(todo) > 15 else ''), flush=True)
if DRY: sys.exit()

import release_helpers_atlas as H   # send_only / give_up / ids_by_sha, shared with the game's release script
d = None
def browser():
    global d
    if d is None:
        from drvc import start, login
        d = start('ashvale'); login(d, 'ashvale')
    return d
try:
    pending = list(todo)
    while pending:
        sent = []
        for key, p, e in pending:
            if not H.send_only(browser(), p): print('waiting for a block before sending more', flush=True); break
            sent.append((key, p, e)); print('   sent %-28s' % key, flush=True)
        pending = [x for x in pending if x not in sent]
        want = {sha(p): (key, p, e) for key, p, e in sent}
        found = {}
        for _ in range(40):
            time.sleep(30); found = H.ids_by_sha(set(want))
            if len(found) == len(want): break
        for h, (key, p, e) in want.items():
            if h in found: st['modules'][key] = {'id': found[h], 'sha': h, 'v': e.get('v'), 'bytes': os.path.getsize(p)}
            else: pending.append((key, p, e)); print('not listed yet, will retry:', key, flush=True)
        save()
    for key, p, e in entries: e['id'] = st['modules'][key]['id']
    for g in reg['modules'].values():
        for e in (g.values() if 'kind' not in g else [g]):
            for k in ('bytes', 'sha256', 'file'): e.pop(k, None)
    reg['modules']['three'] = {"id": THREE_ID, "v": "0.160.0", "api": 160, "kind": "esm"}
    reg['version'] = st['registry_version'] + 1; reg['released'] = time.strftime('%Y-%m-%d %H:%M')
    rp = os.path.join(HERE, 'chain', 'atlas_registry_v%d.json' % reg['version']); json.dump(reg, open(rp, 'w'), separators=(',', ':'))
    rid = None
    if H.send_only(browser(), rp, json_text=open(rp).read()):
        for _ in range(40):
            time.sleep(30); rid = H.ids_by_sha({sha(rp)}).get(sha(rp))
            if rid: break
    if not rid: print('FAILED at the atlas registry - re-run to resume', flush=True); sys.exit(1)
    st['registry_version'] = reg['version']; st['registries'].append({'version': reg['version'], 'id': rid}); save()
    print('ATLAS REGISTRY v%d %s' % (reg['version'], rid), flush=True)
    if not st.get('launcher') or '--launcher' in sys.argv:
        loader = open(os.path.join(HERE, 'src', 'loader.js')).read()
        boot = ("import * as THREE from '/content/" + THREE_ID + "';\n"
                "ASH3D.defineValue('three', { api: 160, v: '0.160.0' }, THREE);\n"
                "let reg = " + json.dumps(reg, separators=(',', ':')) + ";\n"
                "/* the newest ATLAS registry by @ashvale wins (tag atlas-registry; the game's registries are never used here) */\n"
                "try { const L = await (await fetch('/r/inscriptions?creator=" + ASHVALE + "&limit=300')).json();\n"
                "  for (const p of L || []) { const j = p.json; if (j && j.ashvale3d === 'atlas-registry' && (j.loader || 1) <= ASH3D.LOADER && j.version > reg.version) reg = j; } } catch (e) { console.warn('Atlas: registry lookup failed, using the built-in one', e); }\n"
                "ASH3D.boot({ baked: reg, content: true }).then(function (m) { document.getElementById('boot').remove(); m.atlas.start(document.getElementById('atlas')); })\n"
                ".catch(function (e) { console.error(e); document.getElementById('boot').textContent = 'ASHVALE Atlas could not start: ' + (e && e.message || e); });\n")
        css = ("html,body{margin:0;height:100%;background:#0b0906;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%}"
               "#atlas{position:fixed;inset:0;touch-action:none}#boot{position:fixed;inset:0;display:grid;place-items:center;color:#e8b54a;font:16px system-ui,sans-serif}")
        page = ('<!doctype html>\n<html lang="en"><head>\n<title>ASHVALE Atlas</title>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
                '<style>' + css + '</style>\n</head><body>\n<div id="atlas"></div><div id="boot">Loading the world…</div>\n'
                '<script>\n' + loader.replace('</script', '<\\/script') + '\n</script>\n'
                '<script type="module">\n' + boot.replace('</script', '<\\/script') + '</script>\n</body></html>\n')
        lp = os.path.join(HERE, 'chain', 'atlas_launcher.html'); open(lp, 'w').write(page)
        lid = None
        if H.send_only(browser(), lp):
            for _ in range(40):
                time.sleep(30); lid = H.ids_by_sha({sha(lp)}).get(sha(lp))
                if lid: break
        if not lid: print('FAILED at the atlas launcher - re-run with --launcher', flush=True); sys.exit(1)
        st['launcher'] = lid; save(); print('ATLAS LAUNCHER', lid, '%d bytes' % len(page), flush=True)
    print('DONE: atlas launcher', st['launcher'], 'registry v%d' % st['registry_version'], flush=True)
finally:
    if d is not None: d.quit()
