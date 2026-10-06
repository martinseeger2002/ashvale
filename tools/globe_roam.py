#!/usr/bin/env python3
"""Build ASHVALE Atlas (the globe explorer) FROM ITS MODULES, the same way build.py builds the game:

  python3 tools/globe_roam.py      writes
    playtest/globe_roam.html            the private playtest page (an Artifact fragment: <title> first, one file, no network)
    playtest/atlas/modules/<name>.js    every JS module exactly as it would be inscribed (one file each)
    playtest/atlas/modules/<name>.json  every data module (wg_tables, atlas_palette, zone.*, part.*) as inscribed
    playtest/atlas/registry.json        the app's registry: {name: {id: null, v, api, kind, bytes, sha256, file}}
The page = src/loader.js + a tree-shaken three.js r160 (only the THREE.* names the modules use, bundled with
tools/esb's esbuild in a temp dir; never touches src/three_entry.js or dist/) + the modules + the baked registry +
ASH3D.boot(...).then(m => m.atlas.start(host)). A release later inscribes changed modules + the registry + one launcher
(the loader with this registry baked in), exactly like tools/release_modular.py does for the game; three.js then comes
from its own inscription. Test: tests/globe_roam_pw.py. URL options: ?seed= ?n= ?low ?nopieces ?cell=<id|core>.
"""
import os, re, sys, json, hashlib, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, DATA, ESB = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'data'), os.path.join(ROOT, 'tools', 'esb')
OUT = os.path.join(ROOT, 'playtest', 'globe_roam.html')
MODDIR = os.path.join(ROOT, 'playtest', 'atlas', 'modules')
REG = os.path.join(ROOT, 'playtest', 'atlas', 'registry.json')
THREE_V = '0.160.0'
# load order does not matter (factories); kept stable for readable pages
JS = ['globe', 'globeview', 'fog', 'models', 'wg_geo', 'wg_terrain', 'wg_paths', 'wg_sites', 'wg_tiles', 'worldgen',
      'atlas_shapes', 'atlas_chunk', 'roam', 'roam_ctl', 'roamhud', 'atlas']
DATA_MODS = [('wg_tables', os.path.join(DATA, 'atlas', 'wg_tables.json')), ('atlas_palette', os.path.join(DATA, 'atlas', 'atlas_palette.json'))]
ZONES = ['whisperwood', 'village']
PART_PREFIXES = ('body.', 'cloth.', 'palette')
SOFT_LIMIT = 15 * 1024


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def no_trailing_comments(name, js):
    for i, line in enumerate(js.split('\n')):
        if re.search(r'[;{}]\s*//(?!/)', line) and 'http' not in line:
            raise SystemExit('%s line %d: a // comment after code (use /* */)' % (name, i + 1))


def models_js():
    """models.js is an ES module (export function createModels): the same classic-script wrapper build.py makes"""
    src = read(os.path.join(SRC, 'models.js'))
    assert src.count('export ') == 1 and 'export function createModels' in src
    v = re.search(r"MODELS_VERSION\s*=\s*'?([\w.]+)", src)
    return ("(function(){'use strict';\n" + src.replace('export function createModels', 'function createModels') +
            "\nASH3D.define('models', { api: 1, v: " + json.dumps(v.group(1) if v else '1') + " }, () => ({ createModels }));\n})();\n")


def meta_of(js, name):
    m = re.search(r"define\('" + re.escape(name) + r"',\s*(\{[^}]*\{[^}]*\}[^}]*\}|\{[^}]*\}|META|\{ api: API, v: V \})", js)
    s = m.group(1) if m else ''
    if s in ('META', '') or 'API' in s:
        mm = re.search(r"const META = (\{[^;]*\});", js)
        s = mm.group(1) if mm else s
    v = re.search(r"\bv:\s*'?([\w.]+)'?", s)
    api = re.search(r"\bapi:\s*(\w+)", s)
    vv = v.group(1) if v else '1'
    if vv == 'V':
        vv = re.search(r"\bV = (\d+)", js).group(1)
    aa = api.group(1) if api else '1'
    if aa == 'API':
        aa = re.search(r"\bAPI = (\d+)", js).group(1)
    return vv, int(aa) if aa.isdigit() else 1


def three_iife(names):
    esb = os.path.join(ESB, 'node_modules', '.bin', 'esbuild')
    three = os.path.join(ESB, 'node_modules', 'three', 'build', 'three.module.js')
    with tempfile.TemporaryDirectory() as td:
        entry, out = os.path.join(td, 'entry.js'), os.path.join(td, 'three.iife.js')
        with open(entry, 'w') as f:
            f.write("export { REVISION, " + ', '.join(names) + " } from 'three';\n")
        subprocess.check_call([esb, entry, '--bundle', '--minify', '--format=iife', '--global-name=THREE', '--legal-comments=none',
                               '--log-level=warning', '--alias:three=' + three, '--outfile=' + out], cwd=ESB)
        return read(out)


def wrap_data(j, name):
    if j.get('ashvale3d') != 'module':
        j = {"ashvale3d": "module", "name": name, "api": 1, "v": j.get('v', 1), "data": j}
    j['name'] = name
    return j


def main():
    os.makedirs(MODDIR, exist_ok=True)
    reg = {"ashvale3d": "atlas-registry", "app": "atlas", "version": 1, "loader": 1, "modules": {}}   # NOT "registry": the game launcher picks the newest {"ashvale3d":"registry"} by @ashvale, and must never pick the Atlas
    reg['modules']['three'] = {"id": None, "v": THREE_V, "api": 160, "kind": "esm"}
    mods, sizes = {}, []
    for name in JS:
        js = models_js() if name == 'models' else read(os.path.join(SRC, name + '.js'))
        no_trailing_comments(name + '.js', js)
        mods[name] = js
        v, api = meta_of(js, name)
        p = os.path.join(MODDIR, name + '.js')
        with open(p, 'w', encoding='utf-8') as f:
            f.write(js)
        b = js.encode()
        reg['modules'][name] = {"id": None, "v": v, "api": api, "kind": "js", "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest(), "file": os.path.relpath(p, ROOT)}
        sizes.append((name, len(b)))
    datas = []
    for name, path in DATA_MODS:
        datas.append(('data', name, name, wrap_data(json.loads(read(path)), name)))
    for z in ZONES:
        datas.append(('zones', z, 'zone.' + z, wrap_data(json.loads(read(os.path.join(DATA, 'zone.' + z + '.json'))), 'zone.' + z)))
    pdir = os.path.join(DATA, 'parts')
    for fn in sorted(os.listdir(pdir)):
        if fn.endswith('.json') and fn.startswith(PART_PREFIXES):
            pid = fn[:-5]
            datas.append(('parts', pid, 'part.' + pid, wrap_data(json.loads(read(os.path.join(pdir, fn))), 'part.' + pid)))
    for grp, key, name, j in datas:
        text = json.dumps(j, separators=(',', ':'))
        p = os.path.join(MODDIR, name + '.json')
        with open(p, 'w', encoding='utf-8') as f:
            f.write(text)
        mods[name] = "ASH3D.defineData(" + text + ");\n"
        reg['modules'].setdefault(grp, {})[key] = {"id": None, "v": j['v'], "api": j['api'], "kind": "json", "bytes": len(text.encode()),
                                                   "sha256": hashlib.sha256(text.encode()).hexdigest(), "file": os.path.relpath(p, ROOT)}
        sizes.append((name, len(text.encode())))
    with open(REG, 'w') as f:
        json.dump(reg, f, indent=1)
    names = sorted(set(n for name in JS for n in re.findall(r'\bTHREE\.([A-Za-z0-9_]+)', mods[name])) - {'REVISION'})
    three = three_iife(names)
    three_js = three.rstrip().rstrip(';') + ";\nASH3D.defineValue('three', { api: 160, v: '" + THREE_V + "' }, THREE);\n"
    loader = read(os.path.join(SRC, 'loader.js'))
    page_reg = json.loads(json.dumps(reg))
    for g in page_reg['modules'].values():
        for e in (g.values() if 'kind' not in g else [g]):
            for k in ('bytes', 'sha256', 'file'):
                e.pop(k, None)
    errhook = ("window.__atlasErrors=[];window.addEventListener('error',function(e){window.__atlasErrors.push(String(e.message||e))});"
               "(function(){var ce=console.error;console.error=function(){try{window.__atlasErrors.push(Array.prototype.map.call(arguments,String).join(' '))}catch(x){}return ce.apply(console,arguments)}})();")
    boot = ("ASH3D.boot({ baked: " + json.dumps(page_reg, separators=(',', ':')) + ", registryUrl: window.ASH3D_REGISTRY_URL || null, content: false })"
            ".then(function (m) { m.atlas.start(document.getElementById('atlas')); })"
            ".catch(function (e) { console.error(e); document.getElementById('atlas').innerHTML = '<div style=\"color:#ffcf3f;padding:24px;font:16px sans-serif\">ASHVALE Atlas could not start: ' + String(e && e.message || e).replace(/</g, '&lt;') + '</div>'; });\n")
    css = (":root{--bg:#0b0906;--fg:#ffcf3f;color-scheme:dark}"
           "@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){--bg:#0b0906;--fg:#ffcf3f}}"
           ":root[data-theme=\"dark\"]{--bg:#0b0906;--fg:#ffcf3f}"
           "html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%}"
           "#atlas{position:fixed;left:0;top:0;width:100vw;height:100vh;height:100dvh;touch-action:none;overflow:hidden}")
    head = ('<title>ASHVALE Atlas</title>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n<style>' + css + '</style>\n')
    order = JS + [d[2] for d in datas]
    scripts = [errhook, loader, three_js] + [mods[n] for n in order] + [boot]
    body = '<div id="atlas"></div>\n' + ''.join('<script>\n' + s.replace('</script', '<\\/script') + '\n</script>\n' for s in scripts)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(head + body)
    print('wrote %s: %.0f KB (three.js %d classes, %.0f KB)' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024, len(names), len(three) / 1024))
    print('registry %s: %d JS modules, %d data modules' % (os.path.relpath(REG, ROOT), len(JS), len(datas)))
    for n, b in sizes:
        if not n.startswith('part.'):
            print('  %-16s %6.1f KB%s' % (n, b / 1024, '   (over 15 KB)' if b > SOFT_LIMIT else ''))
    pb = sum(b for n, b in sizes if n.startswith('part.'))
    print('  %-16s %6.1f KB  (%d part modules, shared with the game)' % ('parts', pb / 1024, sum(1 for n, _ in sizes if n.startswith('part.'))))


if __name__ == '__main__':
    main()
