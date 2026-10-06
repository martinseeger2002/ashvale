#!/usr/bin/env python3
"""Build playtest/globe_view.html: the ASHVALE globe (GLOBE.md phase P0) as ONE self-contained page.

  python3 tools/globe_view.py            writes playtest/globe_view.html (an Artifact fragment like build.py's playtest
                                         page: <title> first, everything inlined, no network)
Inlines: a tree-shaken three.js r160 IIFE (only the THREE.* names src/globeview.js uses, bundled with tools/esb's
esbuild into a temp dir: it never touches src/three_entry.js or dist/), src/globe.js, src/globeview.js.
URL options: ?n=64 (grid size, default 128), ?seed=..., ?low (phone quality on desktop).
Debug handle in the console: GV (GV.select(c), GV.lookAt(c, 1.2), GV.stats(), GV.G = the globe).
Test: tests/globe_pw.py.
"""
import os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, ESB = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'tools', 'esb')
OUT = os.path.join(ROOT, 'playtest', 'globe_view.html')


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def no_trailing_comments(name, js):
    for i, line in enumerate(js.split('\n')):
        if re.search(r'[;{}]\s*//(?!/)', line) and 'http' not in line:
            raise SystemExit('%s line %d: a // comment after code (use /* */)' % (name, i + 1))


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


def main():
    globe, view = read(os.path.join(SRC, 'globe.js')), read(os.path.join(SRC, 'globeview.js'))
    no_trailing_comments('globe.js', globe); no_trailing_comments('globeview.js', view)
    names = sorted(set(re.findall(r'\bTHREE\.([A-Za-z0-9_]+)', view)) - {'REVISION'})
    three = three_iife(names)
    errhook = ("window.__gvErrors=[];window.addEventListener('error',function(e){window.__gvErrors.push(String(e.message||e))});"
               "(function(){var ce=console.error;console.error=function(){try{window.__gvErrors.push(Array.prototype.map.call(arguments,String).join(' '))}catch(x){}return ce.apply(console,arguments)}})();")
    boot = ("(function(){var q=new URLSearchParams(location.search),host=document.getElementById('gv');"
            "try{window.GV=AshGlobeView.createGlobeView(THREE,AshGlobe,{host:host,n:+q.get('n')||128,seed:q.get('seed')||'ashvale',quality:q.has('low')?'low':null});}"
            "catch(e){console.error(e);host.innerHTML='<div style=\"color:#ffcf3f;padding:24px;font:16px sans-serif\">The globe could not start: '+String(e&&e.message||e).replace(/</g,'&lt;')+'</div>';}})();")
    css = (":root{--bg:#0b0906;--fg:#ffcf3f;color-scheme:dark}"
           "@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){--bg:#0b0906;--fg:#ffcf3f}}"
           ":root[data-theme=\"dark\"]{--bg:#0b0906;--fg:#ffcf3f}"
           "html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%}"
           "#gv{position:fixed;left:0;top:0;width:100vw;height:100vh;height:100dvh;touch-action:none}")
    head = ('<title>Ashvale Globe</title>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n<style>' + css + '</style>\n')
    scripts = [errhook, three.rstrip().rstrip(';') + ';', globe, view, boot]
    body = '<div id="gv"></div>\n' + ''.join('<script>\n' + s.replace('</script', '<\\/script') + '\n</script>\n' for s in scripts)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(head + body)
    print('wrote %s: %.0f KB (three.js %d classes, %.0f KB; globe.js %.0f KB; globeview.js %.0f KB)' % (
        OUT, os.path.getsize(OUT) / 1024, len(names), len(three) / 1024, len(globe) / 1024, len(view) / 1024))


if __name__ == '__main__':
    main()
