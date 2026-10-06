#!/usr/bin/env python3
"""ASHVALE world editor server (2026-10-04: "Build me a world editor so that I can go into the Atlas, zoom down on
one of the tiles and then edit that tile. Open it in Saltmere ... move buildings, NPCs, add trees and forests and make
trails and all of that").

    python3 editor/server.py [port]        default 8750; open http://<this machine>:8750/?k=<token> (printed at start)

It never touches the game while you edit: your edits live in a WORKING COPY (chain/editor/zone.<id>.json, saved on every
change, with backups in chain/editor/backups/). Buttons in the editor:
  Preview 3D / Atlas   copies the game's src + data into chain/editor/preview/, drops your working zones in, builds the
                       game and the Atlas THERE (0.3 s + a few s), and shows them - the real tree and dist/ untouched
  Apply to game        copies the working zone into data/zone.<id>.json (refused while a release is running), so the next
                       release carries it; the previous file goes to chain/editor/backups/ first
API (JSON, every call needs ?k=<token> or header X-Key):
  GET  /api/zones                 [{id, name, origin, size, edited}]
  GET  /api/zone/<id>             the working copy (or the game's own file when you have not edited it yet)
  PUT  /api/zone/<id>             save the working copy            POST /api/revert/<id>   drop it
  POST /api/apply/<id>            copy it into the game            POST /api/preview        build the preview
  A NEW area (made in the editor from the Atlas: "New area here") is a working copy with no game file yet; Apply adds
  data/zone.<id>.json and puts <id> in build.py's and tools/earth_page.py's ZONES lists.
  GET  /api/meta                  palette, monsters, NPC looks, globe placement (for the Atlas jump)
  GET|PUT /api/terrain            the terrain strokes being edited ({edits: [{op, u, r, dh|to|clim}]}, chain/editor/terrain_edits.json)
  POST /api/terrain/apply         write them into data/atlas/wg_tables.json `edits` (the game's and the Atlas's world)
  POST /api/terrain/revert        drop the working strokes
Static: /  (editor/index.html), /preview/... (the preview build)."""
import http.server, json, os, sys, shutil, subprocess, time, secrets, re, urllib.parse, threading
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ED = os.path.join(ROOT, 'editor')
WORK = os.path.join(ROOT, 'chain', 'editor'); BAK = os.path.join(WORK, 'backups'); PRE = os.path.join(WORK, 'preview')
os.makedirs(BAK, exist_ok=True)
KEYF = os.path.join(WORK, '.key')
if not os.path.exists(KEYF): open(KEYF, 'w').write(secrets.token_urlsafe(12)); os.chmod(KEYF, 0o600)
KEY = open(KEYF).read().strip()
ZID = re.compile(r'^[a-z0-9_]{1,40}$')
lock = threading.Lock()
HCACHE = {}   # zone -> (inputs' mtimes, heights)

def game_zone(z): return os.path.join(ROOT, 'data', 'zone.%s.json' % z)
def work_zone(z): return os.path.join(WORK, 'zone.%s.json' % z)
TERRAIN = os.path.join(WORK, 'terrain_edits.json')
TABLES = os.path.join('data', 'atlas', 'wg_tables.json')
OPS = {'raise', 'lower', 'flatten', 'region', 'step', 'water', 'trees'}
def terrain_get():
    """the terrain strokes being edited: the working copy, else what the game's world tables already carry"""
    if os.path.exists(TERRAIN): return json.load(open(TERRAIN))
    return {'edits': json.load(open(os.path.join(ROOT, TABLES)))['data'].get('edits') or []}
def terrain_check(d):
    L = d.get('edits')
    if not isinstance(L, list) or len(L) > 20000: raise ValueError('edits must be a list (at most 20,000 strokes)')
    for e in L:
        if e.get('op') not in OPS or not isinstance(e.get('u'), list) or len(e['u']) != 3: raise ValueError('a stroke needs op and u [x, y, z]')
        if not (1 <= float(e.get('r', 0)) <= 2000): raise ValueError('a stroke radius is 1 to 2000 m')
        if e['op'] == 'region' and not (0 <= int(e.get('clim', -1)) <= 7): raise ValueError('a region type is 0 to 7')
    return {'edits': [{k: v for k, v in e.items() if k in ('op', 'u', 'r', 'dh', 'to', 's', 'clim', 'k', 'st')} for e in L]}
def tables_with(path, edits):
    t = json.load(open(path)); t['data']['edits'] = edits; json.dump(t, open(path, 'w'), separators=(',', ':'))
def zone_ids():
    ids = set()
    for folder in (os.path.join(ROOT, 'data'), WORK):
        for fn in os.listdir(folder):
            m = re.match(r'^zone\.([a-z0-9_]+)\.json$', fn)
            if m: ids.add(m.group(1))
    return sorted(ids)
def zones():
    out = []
    for z in zone_ids():
        d = json.load(open(work_zone(z) if os.path.exists(work_zone(z)) else game_zone(z)))['data']
        out.append({'id': z, 'name': d.get('name', z), 'origin': d['origin'], 'size': d['size'], 'level': d.get('level'), 'edited': os.path.exists(work_zone(z)), 'new': not os.path.exists(game_zone(z))})
    return out
def overlaps(z, d):
    ox, oy = d['origin']; W, H = d['size']
    for q in zones():
        if q['id'] == z: continue
        if ox < q['origin'][0] + q['size'][0] and ox + W > q['origin'][0] and oy < q['origin'][1] + q['size'][1] and oy + H > q['origin'][1]: return q['name']
    return None
ZLIST = re.compile(r"^ZONES = \[[^\]]*\]", re.M)
def set_zone_list(path, ids):
    """a build script's `ZONES = [...]` line gets every area (new ones appended, the order of the others kept)"""
    s = open(path).read(); m = ZLIST.search(s)
    if not m: return False
    have = re.findall(r"'([a-z0-9_]+)'", m.group(0)); want = have + [z for z in ids if z not in have]
    if want != have: open(path, 'w').write(s[:m.start()] + 'ZONES = [' + ', '.join("'%s'" % z for z in want) + ']' + s[m.end():])
    return True
def backup(path, tag):
    if os.path.exists(path): shutil.copy2(path, os.path.join(BAK, '%s.%s.%s.json' % (os.path.basename(path)[:-5], tag, time.strftime('%Y%m%d-%H%M%S'))))
def validate(mod):
    d = mod['data']; W, H = d['size']
    if len(d['tiles']) != H or any(len(r) != W for r in d['tiles']): raise ValueError('tiles must be %d rows of %d' % (H, W))
    ox, oy = d['origin']
    for o in d.get('objects', []) + d.get('npcs', []) + d.get('spawns', []):   # fishing spots may lie offshore, past the edge (the game's own do)
        if not (ox <= o['x'] < ox + W and oy <= o['y'] < oy + H): raise ValueError('%s at %d,%d is outside the area' % (o.get('k') or o.get('id') or o.get('m') or 'thing', o['x'], o['y']))
    return mod
def releasing():
    try: out = subprocess.run(['ps', '-eo', 'args'], capture_output=True, text=True).stdout
    except Exception: return False
    return any(('release_modular.py' in l or 'release_earth.py' in l) and 'grep' not in l for l in out.splitlines())

def preview():
    """the game's src + data in chain/editor/preview with every working zone dropped in; build the game and the Atlas there"""
    with lock:
        os.makedirs(PRE, exist_ok=True)
        for sub in ('src', 'data'):
            dst = os.path.join(PRE, sub)
            if os.path.exists(dst): shutil.rmtree(dst)
            shutil.copytree(os.path.join(ROOT, sub), dst)
        shutil.copy2(os.path.join(ROOT, 'build.py'), os.path.join(PRE, 'build.py'))
        os.makedirs(os.path.join(PRE, 'tools'), exist_ok=True)
        for fn in ('globe_roam.py', 'earth_page.py'): shutil.copy2(os.path.join(ROOT, 'tools', fn), os.path.join(PRE, 'tools', fn))
        esb = os.path.join(PRE, 'tools', 'esb')
        if not os.path.exists(esb): os.symlink(os.path.join(ROOT, 'tools', 'esb'), esb)
        for z in zones():
            if z['edited']: shutil.copy2(work_zone(z['id']), os.path.join(PRE, 'data', 'zone.%s.json' % z['id']))
        # until the game itself has the terrain edit layer, the PREVIEW copy gets it (editor/patches/terrain_patch.py), so the
        # Atlas terrain tools work now (the operator: "let me use the terrain editor now"); it skips itself once the game has it
        if 'ctx.setEdits = setEdits' not in open(os.path.join(PRE, 'src', 'wg_terrain.js')).read():
            r = subprocess.run(['python3', os.path.join(ED, 'patches', 'terrain_patch.py'), PRE], capture_output=True, text=True, timeout=60)
            if r.returncode: return {'ok': False, 'log': 'terrain patch for the preview failed:\n' + r.stdout[-600:] + r.stderr[-1200:]}
        if 'flightOf' not in open(os.path.join(PRE, 'src', 'world.js')).read():   # the stairs you can find your way down (the operator), until the game has them
            r = subprocess.run(['python3', os.path.join(ED, 'patches', 'stairs_patch.py'), PRE], capture_output=True, text=True, timeout=60)
            if r.returncode: return {'ok': False, 'log': 'stairs patch for the preview failed:\n' + r.stderr[-1200:]}
        r = subprocess.run(['python3', os.path.join(ED, 'patches', 'walls_patch.py'), PRE], capture_output=True, text=True, timeout=60)   # walls for every building
        if r.returncode: return {'ok': False, 'log': 'walls patch for the preview failed:\n' + r.stderr[-1200:]}
        r = subprocess.run(['python3', os.path.join(ED, 'patches', 'pier_assets_patch.py'), PRE], capture_output=True, text=True, timeout=60)   # piers and bridges are assets
        if r.returncode: return {'ok': False, 'log': 'pier patch for the preview failed:\n' + r.stderr[-1200:]}
        r = subprocess.run(['python3', os.path.join(ED, 'patches', 'town_ground_patch.py'), PRE], capture_output=True, text=True, timeout=60)   # a coastal town's water = the Atlas sea
        if r.returncode: return {'ok': False, 'log': 'town ground patch for the preview failed:\n' + r.stderr[-1200:]}
        r = subprocess.run(['python3', os.path.join(ED, 'patches', 'water_patch.py'), PRE], capture_output=True, text=True, timeout=60)   # flat lakes in the Atlas
        if r.returncode: return {'ok': False, 'log': 'water patch for the preview failed:\n' + r.stderr[-1200:]}
        if os.path.exists(TERRAIN): tables_with(os.path.join(PRE, TABLES), terrain_get()['edits'])   # the strokes being edited
        ids = [z['id'] for z in zones()]
        set_zone_list(os.path.join(PRE, 'build.py'), ids); set_zone_list(os.path.join(PRE, 'tools', 'earth_page.py'), ids)
        t = time.time(); log = []
        for cmd in (['python3', 'build.py'], ['python3', 'tools/earth_page.py']):
            r = subprocess.run(cmd, cwd=PRE, capture_output=True, text=True, timeout=600)
            log.append('$ ' + ' '.join(cmd) + '\n' + (r.stdout[-800:] + r.stderr[-1500:]))
            if r.returncode: return {'ok': False, 'log': '\n'.join(log)}
        return {'ok': True, 'seconds': round(time.time() - t, 1), 'game': '/preview/dist/ashvale3d.html', 'atlas': '/preview/playtest/earth.html', 'log': '\n'.join(log)[-1500:]}

def meta():
    rd = lambda p: json.load(open(os.path.join(ROOT, 'data', p)))
    pal = rd('atlas/atlas_palette.json'); pal = pal.get('data', pal)
    mons = rd('monsters.json')['data']['monsters']
    looks = sorted(fn[5:-5] for fn in os.listdir(os.path.join(ROOT, 'data', 'parts')) if fn.startswith('char.'))
    shops = sorted((rd('shops.json')['data'].get('shops') or {}).keys())
    return {'tile': pal['tile'], 'trees': pal['trees'], 'roof': pal.get('roof'), 'wall': pal.get('wall'), 'monsters': {k: {'name': v['name'], 'level': v['level'], 'look': v.get('look', k)} for k, v in mons.items()},
            'looks': looks, 'shops': shops, 'globecfg': rd('globecfg.json').get('data', rd('globecfg.json'))}

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, fmt, *a): pass
    def authed(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        return (q.get('k') or [''])[0] == KEY or self.headers.get('X-Key') == KEY
    def send_json(self, obj, code=200):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def body(self): n = int(self.headers.get('Content-Length') or 0); return json.loads(self.rfile.read(n) or b'{}')
    def route(self, method):
        u = urllib.parse.urlparse(self.path); p = urllib.parse.unquote(u.path)
        if '..' in p or '\\' in p or '/.' in p: return self.send_json({'error': 'not found'}, 404)   # never outside editor/ and the preview
        if p in ('/', '/index.html'):
            if not self.authed(): return self.send_json({'error': 'open the link with ?k=<key> (printed when the server started)'}, 403)
            self.path = '/editor/index.html'; return super().do_GET()
        if p.startswith('/editor/') and method == 'GET': return super().do_GET()
        if p.startswith('/preview/') and method == 'GET':
            self.path = '/chain/editor/preview/' + p[len('/preview/'):] + ('?' + u.query if u.query else ''); return super().do_GET()
        if not p.startswith('/api/'): return self.send_json({'error': 'not found'}, 404)
        if not self.authed(): return self.send_json({'error': 'bad key'}, 403)
        parts = p.split('/')[2:]
        try:
            if parts == ['zones']: return self.send_json(zones())
            if parts == ['meta']: return self.send_json(meta())
            if parts == ['parts']:   # the model parts, for the editor's 3D preview of the selection (data/parts/*.json)
                d = os.path.join(ROOT, 'data', 'parts'); return self.send_json({fn[:-5]: json.load(open(os.path.join(d, fn))) for fn in sorted(os.listdir(d)) if fn.endswith('.json')})
            if parts == ['preview'] and method == 'POST': return self.send_json(preview())
            if parts == ['terrain'] and method == 'GET': return self.send_json(terrain_get())
            if len(parts) == 2 and parts[0] == 'heights' and ZID.match(parts[1]) and method == 'GET':   # the ground under an area, Atlas edits included
                z = parts[1]; mt = lambda f: os.path.getmtime(f) if os.path.exists(f) else 0
                key = (z, mt(TERRAIN), mt(work_zone(z)), mt(game_zone(z)), mt(os.path.join(ROOT, TABLES)))
                if HCACHE.get(z, (None,))[0] != key:
                    pr = preview()
                    if not pr.get('ok'): return self.send_json({'error': 'preview build failed'}, 500)
                    r = subprocess.run(['node', os.path.join(ED, 'heights.js'), PRE, z], capture_output=True, text=True, timeout=120)
                    if r.returncode: return self.send_json({'error': 'heights: ' + r.stderr[-400:]}, 500)
                    HCACHE[z] = (key, json.loads(r.stdout))
                return self.send_json(HCACHE[z][1])
            if parts == ['terrain'] and method == 'PUT':
                d = terrain_check(self.body()); tmp = TERRAIN + '.tmp'; json.dump(d, open(tmp, 'w'), separators=(',', ':')); os.replace(tmp, TERRAIN)
                return self.send_json({'ok': True, 'saved': time.strftime('%H:%M:%S'), 'strokes': len(d['edits'])})
            if parts == ['terrain', 'apply'] and method == 'POST':
                if releasing(): return self.send_json({'error': 'a release is running right now - apply after it finishes'}, 409)
                d = terrain_check(terrain_get()); backup(os.path.join(ROOT, TABLES), 'tables')
                tables_with(os.path.join(ROOT, TABLES), d['edits'])
                return self.send_json({'ok': True, 'strokes': len(d['edits']), 'note': 'data/atlas/wg_tables.json carries the terrain edits; the next release (and the Atlas refresh) shows them'})
            if parts == ['terrain', 'revert'] and method == 'POST':
                if os.path.exists(TERRAIN): backup(TERRAIN, 'terrain'); os.remove(TERRAIN)
                return self.send_json({'ok': True})
            if len(parts) == 2 and ZID.match(parts[1]):
                z = parts[1]
                if not os.path.exists(game_zone(z)) and not os.path.exists(work_zone(z)) and not (parts[0] == 'zone' and method == 'PUT'): return self.send_json({'error': 'no zone ' + z}, 404)
                if parts[0] == 'zone' and method == 'GET': return self.send_json(json.load(open(work_zone(z) if os.path.exists(work_zone(z)) else game_zone(z))))
                if parts[0] == 'zone' and method == 'PUT':
                    mod = validate(self.body()); mod['name'] = 'zone.' + z
                    hit = overlaps(z, mod['data'])
                    if hit: raise ValueError('this area would overlap ' + hit)
                    if not os.path.exists(work_zone(z)): backup(game_zone(z), 'game')
                    tmp = work_zone(z) + '.tmp'; json.dump(mod, open(tmp, 'w'), separators=(',', ':')); os.replace(tmp, work_zone(z))
                    return self.send_json({'ok': True, 'saved': time.strftime('%H:%M:%S')})
                if parts[0] == 'revert' and method == 'POST':
                    if os.path.exists(work_zone(z)): backup(work_zone(z), 'work'); os.remove(work_zone(z))   # a new area that was never applied is gone after this
                    return self.send_json({'ok': True})
                if parts[0] == 'apply' and method == 'POST':
                    if releasing(): return self.send_json({'error': 'a release is running right now - apply after it finishes'}, 409)
                    if not os.path.exists(work_zone(z)): return self.send_json({'error': 'nothing edited'}, 400)
                    mod = validate(json.load(open(work_zone(z)))); new = not os.path.exists(game_zone(z))
                    if any(o.get('k') in ('pier', 'bridge') for o in mod['data'].get('objects', [])) and 'const decks' not in open(os.path.join(ROOT, 'src', 'worldgen.js')).read():
                        return self.send_json({'error': 'this area has pier/bridge assets, and the game code that lays their decks has not shipped yet (editor/patches/pier_assets_patch.py) - apply after the next game update, or the piers would vanish'}, 409)
                    backup(game_zone(z), 'applied-over')
                    mod['v'] = 1 if new else int(json.load(open(game_zone(z))).get('v', 1)) + 1
                    json.dump(mod, open(game_zone(z), 'w'), separators=(',', ':'))
                    if new:   # a new area: the game's build and the Atlas page list it from now on
                        for f in ('build.py', os.path.join('tools', 'earth_page.py')): set_zone_list(os.path.join(ROOT, f), [z])
                    json.dump(mod, open(work_zone(z), 'w'), separators=(',', ':'))
                    return self.send_json({'ok': True, 'v': mod['v'], 'note': 'data/zone.%s.json updated; the next release carries it' % z})
            return self.send_json({'error': 'unknown call'}, 404)
        except (ValueError, KeyError) as e: return self.send_json({'error': str(e)}, 400)
    def do_GET(self): self.route('GET')
    def do_PUT(self): self.route('PUT')
    def do_POST(self): self.route('POST')

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8750
    srv = http.server.ThreadingHTTPServer(('0.0.0.0', port), H)
    print('ASHVALE world editor: http://127.0.0.1:%d/?k=%s' % (port, KEY), flush=True)
    srv.serve_forever()
