"""[Claude 2026-10-19] Build the Saltmere Links playtest page: handoff/golf_playtest.html (one file: the course data,
src/golfrules.js and playtest/golf/golfplay.js bundled with three.js by esbuild).  python3 playtest/golf/build.py"""
import os, subprocess, json
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ESB = os.path.join(ROOT, 'tools', 'esb')
out = '/tmp/claude-1000/golf/golfplay.bundle.js'
subprocess.check_call([os.path.join(ESB, 'node_modules', '.bin', 'esbuild'), os.path.join(ROOT, 'playtest', 'golf', 'golfplay.js'), '--bundle', '--format=iife', '--minify',
                       '--log-level=warning', '--alias:three=' + os.path.join(ESB, 'node_modules', 'three', 'build', 'three.module.js'), '--outfile=' + out], cwd=ESB)
course = open(os.path.join(ROOT, 'data', 'golf.course.json')).read()
rules = open(os.path.join(ROOT, 'src', 'golfrules.js')).read()
shell = open(os.path.join(ROOT, 'playtest', 'golf', 'shell.html')).read()
import glob
parts = {}
for f in glob.glob(os.path.join(ROOT, 'data', 'parts', '*.json')):
    j = json.load(open(f))
    if j.get('kind') in ('body', 'cloth', 'palette'): parts[j['id']] = j
page = shell + '\n<script>window.GOLF_COURSE=' + course + ';window.GOLF_PARTS=' + json.dumps(parts, separators=(',', ':')) + ';</script>\n<script>window.ASH3D={define:function(n,m,f){window.GolfRules=f();}};</script>\n<script>' + rules.replace('</script', '<\\/script') + '\n;delete window.ASH3D;</script>\n<script>' + open(out).read().replace('</script', '<\\/script') + '</script>\n'
dst = os.path.join(ROOT, 'handoff', 'golf_playtest.html'); open(dst, 'w').write(page); print(dst, len(page))
