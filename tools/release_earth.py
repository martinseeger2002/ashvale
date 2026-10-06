"""release_earth.py [--dry] [--no-build] [--launcher] [--conc N] - publish the seamless ASHVALE Atlas (src/earth.js, the operator
2026-10-03: zoom from the whole globe down to the game view) as @ashvale, FAST (tools/fast_send.py: every file in its own
tab, all at once).

  1. python3 tools/earth_page.py  (playtest/earth/modules/* + playtest/earth/registry.json), unless --no-build
  2. every module whose bytes are already on chain is REUSED by content hash (the game's globe, worldgen, zones... are
     the same files); only the rest is inscribed
  3. an EARTH registry, tagged "earth-registry" - never "registry" (the game's launcher would take it) and never
     "atlas-registry" (the first Atlas's launcher boots m.atlas, which this app does not have)
  4. (first run, or --launcher) the launcher page: loader + three.js by id + the newest earth registry by @ashvale
State: chain/earth.json. Resumable. Run with the ghost-devs venv python, after any game release has finished (it uses
the same account and browser profile). Then list the launcher on the Games tab: listing_earth/game.json."""
import sys, os, json, hashlib, subprocess, time, urllib.request
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, 'tools')); sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
ASHVALE = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
THREE_ID = '374cfd2b2f114e9da4ade8add495fe8aa0b2b996a710fb538759a956f15f9539'
APP = 'https://app.dogecoinarcade.com'
STATE, REGF = os.path.join(HERE, 'chain', 'earth.json'), os.path.join(HERE, 'playtest', 'earth', 'registry.json')
DRY = '--dry' in sys.argv
CONC = int(sys.argv[sys.argv.index('--conc') + 1]) if '--conc' in sys.argv else 6
st = json.load(open(STATE)) if os.path.exists(STATE) else {"modules": {}, "registry_version": 0, "registries": [], "launcher": None}
def save(): json.dump(st, open(STATE, 'w'), indent=1)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

if '--no-build' not in sys.argv:
    subprocess.run(['python3', os.path.join(HERE, 'tools', 'earth_page.py')], cwd=HERE, check=True, capture_output=True)
reg = json.load(open(REGF))
assert reg.get('ashvale3d') == 'earth-registry'
entries = []
for k, e in reg['modules'].items():
    if k == 'three': continue
    if 'kind' in e: entries.append((k, os.path.join(HERE, e['file']), e))
    else:
        for n, sub in e.items(): entries.append((k + '/' + n, os.path.join(HERE, sub['file']), sub))

def listing():
    L = json.load(urllib.request.urlopen(APP + '/r/inscriptions?creator=' + ASHVALE + '&limit=300', timeout=30))
    return {p['sha256']: p['id'] for p in L if p.get('sha256')}
known = {}
for f in ('modules.json', 'atlas.json'):
    p = os.path.join(HERE, 'chain', f)
    if os.path.exists(p):
        for v in json.load(open(p))['modules'].values():
            if v.get('id') and v.get('sha'): known[v['sha']] = v['id']
for v in st['modules'].values(): known[v['sha']] = v['id']
try: known.update(listing())
except Exception as e: print('listing failed (only local state used):', e, flush=True)
todo = []
for key, p, e in entries:
    h = sha(p)
    if h in known: st['modules'][key] = {'id': known[h], 'sha': h, 'v': e.get('v'), 'bytes': os.path.getsize(p)}
    else: todo.append((key, p, e))
save()
print(len(entries), 'Atlas modules,', len(entries) - len(todo), 'already on chain (reused),', len(todo), 'to inscribe (%.1f KB):' % (sum(os.path.getsize(p) for _, p, _ in todo) / 1024),
      ', '.join(k for k, _, _ in todo), flush=True)
if DRY: sys.exit()

d = None
if os.environ.get('ASH_FIREFOX') == '1': from fast_send import send_many
else:
    def send_many(_d, items, conc=1):
        """the standalone @ashvale wallet (tools/ashvale_wallet.py, no browser; Firefox crashes unlocking @ashvale since
        2026-10-04): one file after another, split-safe. Returns (sent_paths, refused_paths) like fast_send."""
        from ashvale_wallet import Wallet
        W = Wallet(); sent, refused = [], []
        for path, js in items:
            try: W.inscribe(path, js or ''); sent.append(path); print('   inscribed', os.path.basename(path), flush=True)
            except Exception as e: refused.append(path); print('   REFUSED', os.path.basename(path), str(e)[:160], flush=True)
        return sent, refused
def browser():
    global d
    if os.environ.get('ASH_FIREFOX') != '1': return None   # the wallet needs no browser
    if d is None:
        from drvc import start, login
        d = start('ashvale'); login(d, 'ashvale')
    return d
def land(paths, rounds=40):
    """wait for the block, then {sha: id} for these files"""
    want = {sha(p) for p in paths}; found = {}
    for _ in range(rounds):
        time.sleep(20)
        try: found = {h: i for h, i in listing().items() if h in want}
        except Exception: continue
        if len(found) == len(want): break
    return found
try:
    pending = list(todo)
    for attempt in range(6):
        if not pending: break
        sent, refused = send_many(browser(), [(p, None) for _, p, _ in pending], conc=CONC)
        found = land(sent)
        for key, p, e in list(pending):
            h = sha(p)
            if h in found: st['modules'][key] = {'id': found[h], 'sha': h, 'v': e.get('v'), 'bytes': os.path.getsize(p)}; pending.remove((key, p, e))
        save(); print('%d/%d on chain%s' % (len(todo) - len(pending), len(todo), ', retrying %d after a block' % len(pending) if pending else ''), flush=True)
    if pending: print('FAILED: still not on chain:', [k for k, _, _ in pending], '- re-run to resume', flush=True); sys.exit(1)
    for key, p, e in entries: e['id'] = st['modules'][key]['id']
    for g in reg['modules'].values():
        for e in (g.values() if 'kind' not in g else [g]):
            for k in ('bytes', 'sha256', 'file'): e.pop(k, None)
    reg['modules']['three'] = {"id": THREE_ID, "v": "0.160.0", "api": 160, "kind": "esm"}
    reg['version'] = st['registry_version'] + 1; reg['released'] = time.strftime('%Y-%m-%d %H:%M')
    rp = os.path.join(HERE, 'chain', 'earth_registry_v%d.json' % reg['version']); json.dump(reg, open(rp, 'w'), separators=(',', ':'))
    sent, _ = send_many(browser(), [(rp, open(rp).read())], conc=1)
    rid = land(sent).get(sha(rp)) if sent else None
    if not rid: print('FAILED at the earth registry - re-run to resume', flush=True); sys.exit(1)
    st['registry_version'] = reg['version']; st['registries'].append({'version': reg['version'], 'id': rid}); save()
    print('EARTH REGISTRY v%d %s' % (reg['version'], rid), flush=True)
    if not st.get('launcher') or '--launcher' in sys.argv:
        loader = open(os.path.join(HERE, 'src', 'loader.js')).read()
        boot = ("import * as THREE from '/content/" + THREE_ID + "';\n"
                "ASH3D.defineValue('three', { api: 160, v: '0.160.0' }, THREE);\n"
                "let reg = " + json.dumps(reg, separators=(',', ':')) + ";\n"
                "/* the newest EARTH registry by @ashvale wins (tag earth-registry) */\n"
                "try { const L = await (await fetch('/r/inscriptions?creator=" + ASHVALE + "&limit=300')).json();\n"
                "  for (const p of L || []) { const j = p.json; if (j && j.ashvale3d === 'earth-registry' && (j.loader || 1) <= ASH3D.LOADER && j.version > reg.version) reg = j; } } catch (e) { console.warn('Atlas: registry lookup failed, using the built-in one', e); }\n"
                "ASH3D.boot({ baked: reg, content: true }).then(function (m) { document.getElementById('boot').remove(); m.earth.start(document.getElementById('atlas')); })\n"
                ".catch(function (e) { console.error(e); document.getElementById('boot').textContent = 'ASHVALE Atlas could not start: ' + (e && e.message || e); });\n")
        css = ("html,body{margin:0;height:100%;background:#05070d;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%}"
               "#atlas{position:fixed;inset:0;touch-action:none}#boot{position:fixed;inset:0;display:grid;place-items:center;color:#e8b54a;font:16px system-ui,sans-serif}")
        page = ('<!doctype html>\n<html lang="en"><head>\n<title>ASHVALE Atlas</title>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
                '<style>' + css + '</style>\n</head><body>\n<div id="atlas"></div><div id="boot">Loading the world…</div>\n'
                '<script>\n' + loader.replace('</script', '<\\/script') + '\n</script>\n'
                '<script type="module">\n' + boot.replace('</script', '<\\/script') + '</script>\n</body></html>\n')
        lp = os.path.join(HERE, 'chain', 'earth_launcher.html'); open(lp, 'w').write(page)
        sent, _ = send_many(browser(), [(lp, None)], conc=1)
        lid = land(sent).get(sha(lp)) if sent else None
        if not lid: print('FAILED at the launcher - re-run with --launcher', flush=True); sys.exit(1)
        st['launcher'] = lid; save(); print('EARTH LAUNCHER', lid, '%d bytes' % len(page), flush=True)
    gj = os.path.join(HERE, 'listing_earth', 'game.json')   # the Games card plays the launcher
    if os.path.exists(gj):
        G = json.load(open(gj)); G['game']['play'] = st['launcher']; json.dump(G, open(gj, 'w'), indent=1); print('listing_earth/game.json play =', st['launcher'], flush=True)
    print('DONE: earth launcher', st['launcher'], 'registry v%d' % st['registry_version'], flush=True)
finally:
    if d is not None: d.quit()
