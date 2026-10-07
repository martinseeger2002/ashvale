#!/usr/bin/env python3
"""Build the seamless ASHVALE Atlas (src/earth.js) as one playtest page, the same way tools/globe_roam.py builds the
Atlas: loader + tree-shaken three.js r160 + the modules + the data (worldgen tables, palette, globecfg, the game's
zones) + ASH3D.boot(...).then(m => m.earth.start(host)).

  python3 tools/earth_page.py      writes playtest/earth.html  (an Artifact fragment: <title> first, one file)
URL options: ?at=ashvale|saltmere  ?lat=&lon=&alt=  ?low
"""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import globe_roam as GR

ROOT, SRC, DATA = GR.ROOT, GR.SRC, GR.DATA
OUT = os.path.join(ROOT, 'playtest', 'earth.html')
MODDIR = os.path.join(ROOT, 'playtest', 'earth', 'modules')
REGF = os.path.join(ROOT, 'playtest', 'earth', 'registry.json')
JS = ['globe', 'wg_geo', 'wg_terrain', 'wg_paths', 'wg_sites', 'wg_tiles', 'worldgen', 'atlas_shapes', 'atlas_chunk', 'earth']
DATA_MODS = [('wg_tables', os.path.join(DATA, 'atlas', 'wg_tables.json')), ('atlas_palette', os.path.join(DATA, 'atlas', 'atlas_palette.json')),
             ('globecfg', os.path.join(DATA, 'globecfg.json'))]
ZONES = ['whisperwood', 'village', 'saltmere', 'wolfden', 'cavemouth']   # spidercave is underground: not on the Atlas


def main():
    reg = {"ashvale3d": "earth-registry", "app": "earth", "version": 1, "loader": 1, "modules": {"three": {"id": None, "v": GR.THREE_V, "api": 160, "kind": "esm"}}}
    mods = {}
    import hashlib
    os.makedirs(MODDIR, exist_ok=True)
    full = json.loads(json.dumps(reg))
    for name in JS:
        js = GR.read(os.path.join(SRC, name + '.js'))
        GR.no_trailing_comments(name + '.js', js)
        mods[name] = js
        v, api = GR.meta_of(js, name)
        reg['modules'][name] = {"id": None, "v": v, "api": api, "kind": "js"}
        fp = os.path.join(MODDIR, name + '.js'); open(fp, 'w', encoding='utf-8').write(js)
        full['modules'][name] = {"id": None, "v": v, "api": api, "kind": "js", "file": os.path.relpath(fp, ROOT)}
    datas = [('data', n, n, GR.wrap_data(json.loads(GR.read(p)), n)) for n, p in DATA_MODS]
    for z in ZONES:
        p = os.path.join(DATA, 'zone.' + z + '.json')
        if os.path.exists(p):
            datas.append(('zones', z, 'zone.' + z, GR.wrap_data(json.loads(GR.read(p)), 'zone.' + z)))
    for grp, key, name, j in datas:
        text = json.dumps(j, separators=(',', ':'))
        mods[name] = "ASH3D.defineData(" + text + ");\n"
        reg['modules'].setdefault(grp, {})[key] = {"id": None, "v": j['v'], "api": j['api'], "kind": "json"}
        fp = os.path.join(MODDIR, name + '.json'); open(fp, 'w', encoding='utf-8').write(text)
        full['modules'].setdefault(grp, {})[key] = {"id": None, "v": j['v'], "api": j['api'], "kind": "json", "file": os.path.relpath(fp, ROOT)}
    json.dump(full, open(REGF, 'w'), indent=1)   # the release (tools/release_earth.py) inscribes these files
    names = sorted(set(n for name in JS for n in re.findall(r'\bTHREE\.([A-Za-z0-9_]+)', mods[name])) - {'REVISION'})
    three = GR.three_iife(names)
    three_js = three.rstrip().rstrip(';') + ";\nASH3D.defineValue('three', { api: 160, v: '" + GR.THREE_V + "' }, THREE);\n"
    loader = GR.read(os.path.join(SRC, 'loader.js'))
    errhook = ("window.__atlasErrors=[];window.addEventListener('error',function(e){window.__atlasErrors.push(String(e.message||e))});"
               "(function(){var ce=console.error;console.error=function(){try{window.__atlasErrors.push(Array.prototype.map.call(arguments,String).join(' '))}catch(x){}return ce.apply(console,arguments)}})();")
    boot = ("ASH3D.boot({ baked: " + json.dumps(reg, separators=(',', ':')) + ", registryUrl: null, content: false })"
            ".then(function (m) { m.earth.start(document.getElementById('atlas')); })"
            ".catch(function (e) { console.error(e); document.getElementById('atlas').innerHTML = '<div style=\"color:#ffcf3f;padding:24px;font:16px sans-serif\">ASHVALE Atlas could not start: ' + String(e && e.message || e).replace(/</g, '&lt;') + '</div>'; });\n")
    css = (":root{--bg:#05070d;--fg:#ffcf3f;color-scheme:dark}"
           "@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){--bg:#05070d;--fg:#ffcf3f}}"
           ":root[data-theme=\"dark\"]{--bg:#05070d;--fg:#ffcf3f}"
           "html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%}"
           "#atlas{position:fixed;left:0;top:0;width:100vw;height:100vh;height:100dvh;touch-action:none;overflow:hidden}")
    head = ('<title>ASHVALE Atlas</title>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
            '<style>' + css + '</style>\n')
    order = JS + [d[2] for d in datas]
    scripts = [errhook, loader, three_js] + [mods[n] for n in order] + [boot]
    body = '<div id="atlas"></div>\n' + ''.join('<script>\n' + s.replace('</script', '<\\/script') + '\n</script>\n' for s in scripts)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(head + body)
    print('wrote %s: %.0f KB (three.js %d classes)' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024, len(names)))


if __name__ == '__main__':
    main()
