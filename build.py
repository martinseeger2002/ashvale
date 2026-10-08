#!/usr/bin/env python3
"""ASHVALE 3D build: assembles the modules into pages, exactly as the live loader would load them.

  python3 build.py              dist/ashvale3d.html (full page), playtest/ashvale3d_playtest.html (Artifact fragment:
                                <title> first, no doctype/html/head/body, everything inlined), dist/modules/* (one file
                                per module = one future inscription each) and dist/registry.json, plus a size report.
  python3 build.py --three-esm  also dist/modules/three.mjs(.gz): the tree-shaken three.js ESM bundle for inscription
                                (only the classes the game uses; src/three_entry.js is generated from actual usage).

Modules (each one replaceable on its own, see DESIGN.md "Upgrade recipe"):
  three (esm)  net core scene hud models engine (js)  data: items monsters shops quests rules (json)
  zones: village whisperwood (json, one per region)
Rule: never append // comments mid-line in JS; use /* */ (a // once swallowed code in a minified page).
"""
import gzip, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, DATA, DIST = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'data'), os.path.join(ROOT, 'dist')
ESB = os.path.join(ROOT, 'tools', 'esb')
THREE_V = '0.160.0'
THREE_ARCADE_ID = '374cfd2b2f114e9da4ade8add495fe8aa0b2b996a710fb538759a956f15f9539'   # Pip's on-chain three.module.min.js r160 (official, unmodified)
JS_MODULES = ['netretry', 'net', 'trade', 'wallet', 'trip', 'world', 'core', 'audit', 'castle', 'scene', 'hudart', 'hudpanels', 'hudshop', 'hudchest', 'huddrag', 'hudcreator', 'hud', 'models', 'gamepad', 'engine']   # the HUD is split in parts (2026-10-02)
if os.environ.get('ASH_NO_CASTLE') == '1': JS_MODULES = [m for m in JS_MODULES if m != 'castle']
if os.path.exists(os.path.join(SRC, 'weather.js')):   # weather visuals (local agent, task 6): its own module/inscription
    JS_MODULES.insert(JS_MODULES.index('engine'), 'weather')      # load order does not matter (factories), kept stable
if os.path.exists(os.path.join(SRC, 'seasons.js')):   # the year and its seasons (2026-10-07): its own module/inscription
    JS_MODULES.insert(JS_MODULES.index('engine'), 'seasons')
if os.path.exists(os.path.join(SRC, 'sky.js')):
    JS_MODULES.insert(JS_MODULES.index('engine'), 'sky')
if os.path.exists(os.path.join(SRC, 'skyview.js')):   # the sky drawn as a 3D scene of its own: sun, moon, stars (2026-10-07)
    JS_MODULES.insert(JS_MODULES.index('engine'), 'skyview')
if os.path.exists(os.path.join(SRC, 'geo.js')):       # the global grid: face cells, seams, lat/lon (handoff/globe_open_plan.md phase 1)
    JS_MODULES.insert(JS_MODULES.index('engine'), 'geo')
if os.path.exists(os.path.join(SRC, 'fog.js')):       # fog measured from the camera-player segment (2026-10-02): its own module
    JS_MODULES.insert(JS_MODULES.index('engine'), 'fog')
DATA_MODULES = ['items', 'monsters', 'shops', 'quests', 'rules', 'globecfg', 'assets', 'housekit']   # housekit: converted Quaternius house pieces (tools/housekit/q2code.mjs --game)
DATA_MODULES = DATA_MODULES + (['starmap'] if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'starmap.json')) else [])   # the real night sky (d3-celestial, BSD-3)
DATA_MODULES = DATA_MODULES + (['pools'] if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'pools.json')) else [])   # pools: tools/pools3d.py data   # globecfg: where ASHVALE sits on the globe (P2)
# globe P2 step B: seeded land around the old map. The globe grid + worldgen modules (written for the Atlas, used as they
# are) and worldgen's numbers; without them the game is the old map alone (the engine checks for them).
if os.path.exists(os.path.join(SRC, 'worldgen.js')):
    JS_MODULES[JS_MODULES.index('world'):JS_MODULES.index('world')] = ['globe', 'wg_geo', 'wg_terrain', 'wg_paths', 'wg_sites', 'wg_tiles', 'worldgen']
    DATA_MODULES.append('wg_tables')
DATA_PATHS = {'wg_tables': 'atlas/wg_tables'}   # data modules that live in a subfolder of data/
ZONES = ['village', 'eastend', 'whisperwood', 'saltmere', 'castle', 'wolfden', 'cavemouth', 'spidercave', 'ancientchapel', 'evengrove', 'ziibiing', 'lodges', 'ricelake', 'sugarcamp']   # ziibiing + lodges: the Ojibwe village on the river and its wigwams' insides (tools/make_zone_ziibiing.py)   # castle: the lake castle 4 km out (tools/castle/make_castle.js)
ZONES = ZONES   # saltmere: the second town, on the sea shore 3.4 km east (tools/make_zone_saltmere.mjs)
if os.environ.get('ASH_NO_CASTLE') == '1':   # 2026-10-05: "forget about this castle for now" - a release without it
    ZONES = [z for z in ZONES if z != 'castle']
AREA = os.environ.get('ASH_AREA_LOADING', '1') != '0'   # area loading (handoff/area_loading.md): live since registry v62 (the operator's OK 2026-10-06); ASH_AREA_LOADING=0 builds the old layout
PARTS_DIR = os.path.join(DATA, 'parts')   # model part modules (characters, gear, clothes): one JSON each, no code


def part_modules():
    out = []
    if os.path.isdir(PARTS_DIR):
        for fn in sorted(os.listdir(PARTS_DIR)):
            if fn.endswith('.json'):
                j = json.loads(read(os.path.join(PARTS_DIR, fn)))
                pid = fn[:-5]
                if j.get('ashvale3d') != 'module':   # a bare part file: wrap it in the module envelope
                    j = {"ashvale3d": "module", "name": "part." + pid, "api": 1, "v": j.get('v', 1), "data": j}
                j['name'] = 'part.' + pid
                out.append((pid, j))
    return out


PAD_KINDS = ('house', 'shop', 'smithy', 'furnace', 'well', 'cpad')
STUB_BAND = 5   # worldgen reads this many tiles in from each edge (wg_paths.js profile(): dpt 0..4; exits: the edge itself)


def zone_stub_tiles(z):
    """the zone's tiles as worldgen sees them from OUTSIDE: piers and bridges laid as 'B' (worldgen.js decks()), then
    everything more than STUB_BAND tiles in from every edge blanked to '.' (only the inside of a town reads it)"""
    ox, oy = z['origin']; T = [list(r) for r in z['tiles']]
    for o in z.get('objects') or []:
        if o.get('k') not in ('pier', 'bridge'): continue
        for y in range(o['y'], o['y'] + (o.get('h') or 1)):
            r = T[y - oy] if 0 <= y - oy < len(T) else None
            if r is None: continue
            for x in range(o['x'], o['x'] + (o.get('w') or 1)):
                if 0 <= x - ox < len(r): r[x - ox] = 'B'
    h, B = len(T), STUB_BAND
    out = []
    for y, r in enumerate(T):
        w = len(r)
        if y < B or y >= h - B or w <= 2 * B: out.append(''.join(r))
        else: out.append(''.join(r[:B]) + '.' * (w - 2 * B) + ''.join(r[w - B:]))
    return out


def zone_index(zones):
    """data module `zoneindex` (handoff/area_loading.md): what the game must know about EVERY zone while only the zones
    near the player are loaded - where each is, who lives there, and worldgen's view of it from outside"""
    out = []
    for zid, j in zones:
        z = j['data']; ox, oy = z['origin']; w, h = z['size']
        pads = [{k: o[k] for k in ('k', 'x', 'y', 'w', 'h', 'top') if k in o} for o in z.get('objects') or []
                if o.get('k') in PAD_KINDS and o.get('w') and o.get('h') and not (o['w'] < 3 and o['h'] < 3)
                and ox <= o['x'] < ox + w and oy <= o['y'] < oy + h]
        e = {'id': zid, 'name': z.get('name', zid), 'origin': z['origin'], 'size': z['size'], 'stub': zone_stub_tiles(z), 'pads': pads,
             'npcs': [{'id': n['id'], 'name': n.get('name', n['id']), 'x': n['x'], 'y': n['y']} for n in z.get('npcs') or []]}
        for k in ('level', 'ground', 'respawn', 'weather', 'under', 'style', 'surface', 'surfaceOffset'):   # under: a cave area outside the land (surface = its entrance up top)
            if k in z: e[k] = z[k]
        out.append(e)
    return {"ashvale3d": "module", "name": "zoneindex", "api": 1, "v": 1, "data": {"zones": out}}


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def meta_of(js, name):
    m = re.search(r"define\('" + re.escape(name) + r"',\s*(\{[^}]*\{[^}]*\}[^}]*\}|\{[^}]*\})", js)
    if not m:
        return {'v': 1, 'api': 1}
    s = m.group(1)
    v = re.search(r"\bv:\s*'?([\w.]+)'?", s)
    api = re.search(r"\bapi:\s*(\w+)", s)
    return {'v': (v.group(1) if v else '1'), 'api': (int(api.group(1)) if api and api.group(1).isdigit() else 1)}


def models_js():
    """models.js is an ES module (export function createModels). For classic-script pages: drop the one export and register."""
    src = read(os.path.join(SRC, 'models.js'))
    n = src.count('export ')
    assert n == 1 and 'export function createModels' in src, 'models.js must have exactly one export: createModels'
    body = src.replace('export function createModels', 'function createModels')
    v = re.search(r"MODELS_VERSION\s*=\s*'?([\w.]+)", src)
    return ("(function(){'use strict';\n" + body +
            "\nASH3D.define('models', { api: 1, v: " + json.dumps(v.group(1) if v else '1') + " }, () => ({ createModels }));\n})();\n")


def three_usage():
    names = set()
    for f in [m + '.js' for m in JS_MODULES if os.path.exists(os.path.join(SRC, m + '.js'))]:   # every JS module (weather and fog use THREE too)
        names |= set(re.findall(r'\bTHREE\.([A-Za-z0-9_]+)', read(os.path.join(SRC, f))))
    names.discard('REVISION')
    return sorted(names)


def build_three(esm):
    names = three_usage()
    entry = os.path.join(SRC, 'three_entry.js')
    with open(entry, 'w') as f:
        f.write('/* GENERATED by build.py from the THREE.* names the modules use. The single import point for three.js. */\n')
        f.write('export { REVISION, ' + ', '.join(names) + " } from 'three';\n")
    esb = os.path.join(ESB, 'node_modules', '.bin', 'esbuild')
    out_iife = os.path.join(DIST, 'modules', 'three.iife.js')
    subprocess.check_call([esb, entry, '--bundle', '--minify', '--format=iife', '--global-name=THREE', '--legal-comments=none',
                           '--log-level=warning', '--alias:three=' + os.path.join(ESB, 'node_modules', 'three', 'build', 'three.module.js'), '--outfile=' + out_iife], cwd=ESB)
    if esm:
        out_esm = os.path.join(DIST, 'modules', 'three.mjs')
        subprocess.check_call([esb, entry, '--bundle', '--minify', '--format=esm', '--legal-comments=none', '--log-level=warning',
                               '--alias:three=' + os.path.join(ESB, 'node_modules', 'three', 'build', 'three.module.js'), '--outfile=' + out_esm], cwd=ESB)
        with open(out_esm, 'rb') as f, gzip.open(out_esm + '.gz', 'wb', 9) as g:
            g.write(f.read())
    return read(out_iife), len(names)


def main():
    esm = '--three-esm' in sys.argv
    os.makedirs(os.path.join(DIST, 'modules'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'playtest'), exist_ok=True)
    three_iife, n_three = build_three(esm)
    three_js = three_iife.rstrip().rstrip(';') + ";\nASH3D.defineValue('three', { api: 160, v: '" + THREE_V + "' }, THREE);\n"
    mods, reg = {}, {"ashvale3d": "registry", "version": 1, "loader": 1, "modules": {}}
    reg['modules']['three'] = {"id": None, "v": THREE_V, "api": 160, "kind": "esm"}
    for name in JS_MODULES:
        js = models_js() if name == 'models' else read(os.path.join(SRC, name + '.js'))
        for i, line in enumerate(js.split('\n')):
            if re.search(r'[;{}]\s*//(?!/)', line) and 'http' not in line:
                raise SystemExit('%s.js line %d: a // comment after code (use /* */)' % (name, i + 1))
        mods[name] = js
        m = meta_of(js, name)
        reg['modules'][name] = {"id": None, "v": m['v'], "api": m['api'], "kind": "js"}
    reg['modules']['data'] = {}
    # zones load by area (handoff/area_loading.md): listed under the registry's top-level `lazy`, which the launcher's
    # loader never reads (it reads `modules`); the engine fetches them near the player. `zoneindex` (always loaded) is
    # what the game knows about every zone meanwhile. Pages without /content/ carry them in window.ASH3D_LAZY.
    # AREA (ASH_AREA_LOADING=1): until the operator's playtest OK the default build keeps the old layout (zones in `modules`, no
    # index), so a release of anyone's own modules can never pair the new layout with the live engine.
    if AREA: reg['lazy'] = {'zones': {}}
    else: reg['modules']['zones'] = {}
    zone_js = []
    for name in DATA_MODULES + ['zone.' + z for z in ZONES]:
        j = json.loads(read(os.path.join(DATA, DATA_PATHS.get(name, name) + '.json')))
        if not name.startswith('zone.'):
            mods[name] = "ASH3D.defineData(" + json.dumps(j, separators=(',', ':')) + ");\n"
            reg['modules']['data'][name] = {"id": None, "v": j['v'], "api": j['api'], "kind": "json"}
        elif AREA:
            zone_js.append((name[5:], j))
            mods[name] = "(window.ASH3D_LAZY = window.ASH3D_LAZY || {})[" + json.dumps(name) + "] = " + json.dumps(j, separators=(',', ':')) + ";\n"
            reg['lazy']['zones'][name[5:]] = {"id": None, "v": j['v'], "api": j['api'], "kind": "json"}
        else:
            zone_js.append((name[5:], j))
            mods[name] = "ASH3D.defineData(" + json.dumps(j, separators=(',', ':')) + ");\n"
            reg['modules']['zones'][name[5:]] = {"id": None, "v": j['v'], "api": j['api'], "kind": "json"}
        with open(os.path.join(DIST, 'modules', name + '.json'), 'w') as f:
            json.dump(j, f, separators=(',', ':'))
    zi = zone_index(zone_js)
    mods['zoneindex'] = ("ASH3D.defineData(" + json.dumps(zi, separators=(',', ':')) + ");\n") if AREA else ''
    if AREA: reg['modules']['data']['zoneindex'] = {"id": None, "v": zi['v'], "api": zi['api'], "kind": "json"}
    zp = os.path.join(DIST, 'modules', 'zoneindex.json')
    if AREA:
        with open(zp, 'w') as f: json.dump(zi, f, separators=(',', ':'))
    elif os.path.exists(zp): os.remove(zp)
    parts = part_modules()
    if parts:
        reg['modules']['parts'] = {}
    for pid, j in parts:
        mods['part.' + pid] = "ASH3D.defineData(" + json.dumps(j, separators=(',', ':')) + ");\n"
        reg['modules']['parts'][pid] = {"id": None, "v": j['v'], "api": j['api'], "kind": "json"}
        with open(os.path.join(DIST, 'modules', 'part.' + pid + '.json'), 'w') as f:
            json.dump(j, f, separators=(',', ':'))
    for name in JS_MODULES:
        with open(os.path.join(DIST, 'modules', name + '.js'), 'w') as f:
            f.write(mods[name])
    with open(os.path.join(DIST, 'registry.json'), 'w') as f:
        json.dump(reg, f, indent=1)
    loader = read(os.path.join(SRC, 'loader.js'))
    def boot_js(registry):
        return ("ASH3D.boot({ baked: " + json.dumps(registry, separators=(',', ':')) + ", registryUrl: window.ASH3D_REGISTRY_URL || null, content: false })"
            ".then(function (m) { return m.engine.openStore().then(function (st) { window.ASH = m.engine.start(document.getElementById('ash'), { report: m.$report, store: st }); }); })"
            ".catch(function (e) { console.error(e); var d = document.getElementById('ash'); d.innerHTML = '<div style=\"color:#fff;padding:24px;font:16px sans-serif\">ASHVALE could not start: ' + String(e && e.message || e).replace(/</g, '&lt;') + '</div>'; });\n")
    boot = boot_js(reg)
    css = ("html,body{margin:0;height:100%;background:#0b0906;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%}"
           "#ash{position:fixed;left:0;top:0;width:100vw;height:100vh;height:100dvh;touch-action:none}")
    errhook = "window.__ashErrors=[];window.addEventListener('error',function(e){window.__ashErrors.push(String(e.message||e))});(function(){var ce=console.error;console.error=function(){try{window.__ashErrors.push(Array.prototype.map.call(arguments,String).join(' '))}catch(x){}return ce.apply(console,arguments)}})();"
    scripts = [errhook, loader, three_js] + [mods[n] for n in JS_MODULES] + [mods[n] for n in DATA_MODULES + ['zoneindex'] + ['zone.' + z for z in ZONES]] + [mods['part.' + pid] for pid, _ in parts] + [boot]
    body = '<div id="ash"></div>\n' + ''.join('<script>\n' + s.replace('</script', '<\\/script') + '\n</script>\n' for s in scripts)
    head = ('<title>ASHVALE</title>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n<style>' + css + '</style>\n')
    full = '<!doctype html>\n<html lang="en"><head>\n' + head + '</head><body>\n' + body + '</body></html>\n'
    frag = head + body
    with open(os.path.join(DIST, 'ashvale3d.html'), 'w') as f:
        f.write(full)
    with open(os.path.join(ROOT, 'playtest', 'ashvale3d_playtest.html'), 'w') as f:
        f.write(frag)
    if '--arcade' in sys.argv:
        # the ARCADE demo page: three.js from its inscription (an ES module, so boot runs from a module script after it
        # resolves), the arcade's realtime + storage SDKs, saves through arcade.storage (no localStorage in inscriptions)
        areg = json.loads(json.dumps(reg))
        areg['modules']['three'] = {"id": THREE_ARCADE_ID, "v": THREE_V, "api": 160, "kind": "esm"}
        game = [errhook, loader] + [mods[n] for n in JS_MODULES] + [mods[n] for n in DATA_MODULES + ['zoneindex'] + ['zone.' + z for z in ZONES]] + [mods['part.' + pid] for pid, _ in parts]
        abody = ('<div id="ash"></div>\n<script src="/r/realtime.js"></script>\n<script src="/r/swap.js"></script>\n<script src="/r/storage.js"></script>\n' +
                 ''.join('<script>\n' + x.replace('</script', '<\\/script') + '\n</script>\n' for x in game) +
                 '<script type="module">\nimport * as THREE from "/content/' + THREE_ARCADE_ID + '";\n'
                 "ASH3D.defineValue('three', { api: 160, v: '" + THREE_V + "' }, THREE);\n" + boot_js(areg).replace('</script', '<\\/script') + '</script>\n')
        apage = '<!doctype html>\n<html lang="en"><head>\n' + head + '</head><body>\n' + abody + '</body></html>\n'
        with open(os.path.join(DIST, 'ashvale3d_arcade.html'), 'w') as f:
            f.write(apage)
        print('arcade demo page: dist/ashvale3d_arcade.html %.1f KB (gz %.1f KB), three.js from /content/%s...' % (len(apage.encode()) / 1024, len(gzip.compress(apage.encode(), 9)) / 1024, THREE_ARCADE_ID[:12]))
    print('three.js %s: %d classes used, inline bundle %d KB' % (THREE_V, n_three, len(three_iife) // 1024))
    if esm:
        print('  three.mjs %d KB, gzipped %d KB' % (os.path.getsize(os.path.join(DIST, 'modules', 'three.mjs')) // 1024,
                                                  os.path.getsize(os.path.join(DIST, 'modules', 'three.mjs.gz')) // 1024))
    tot = 0
    for name in JS_MODULES + DATA_MODULES + ['zone.' + z for z in ZONES]:
        b = len(mods[name].encode())
        tot += b
        print('  %-18s %7.1f KB  (gz %5.1f KB)' % (name, b / 1024, len(gzip.compress(mods[name].encode(), 9)) / 1024))
    if parts:
        pb = sum(len(mods['part.' + pid].encode()) for pid, _ in parts); tot += pb
        print('  %-18s %7.1f KB  (%d part modules)' % ('parts', pb / 1024, len(parts)))
    print('game modules total %.1f KB; page %.1f KB' % (tot / 1024, len(full.encode()) / 1024))


if __name__ == '__main__':
    main()
