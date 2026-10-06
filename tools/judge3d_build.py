"""judge3d_build.py build <out.js> | same - the ASHVALE 3D referee judge (the LIGHTER judge, PLAN.md phase C):
src/world.js + src/core.js + the data modules + tools/judge3d_tail.js in one file, under the referee's caps (arcade/referee.py:
<= 256 KB source, 5 s CPU, 64 MB). `same` runs the same trips in QuickJS (quickjs==1.19.4, the referee's engine) and in
Node and requires identical results, and reports the QuickJS time against the 5 s cap."""
import sys, os, json, subprocess, tempfile, time
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QPY = '/home/you/cartoon-toolkit/ghost-devs/tools/qjsenv/bin/python'
def data():
    m = lambda n: json.load(open(os.path.join(HERE, 'data', n + '.json')))['data']
    return {'items': m('items')['items'], 'monsters': m('monsters')['monsters'], 'shops': m('shops'), 'quests': m('quests'), 'rules': m('rules')}
def build():
    strip = lambda t: t.replace("if (typeof module !== 'undefined' && module.exports) module.exports", "if (false) module.exports")
    world = strip(open(os.path.join(HERE, 'src', 'world.js')).read())
    core = strip(open(os.path.join(HERE, 'src', 'core.js')).read())
    return ('var root = globalThis;\n' + world + '\n' + core + '\nvar ASH_DATA = ' + json.dumps(data(), separators=(',', ':')) + ';\n'
            + strip(open(os.path.join(HERE, 'src', 'audit.js')).read()) + '\n' + open(os.path.join(HERE, 'tools', 'judge3d_tail.js')).read())
TRIPS = [('seed' + str(k) + 'x' * 30, {'v': 1, 'ticks': 6000, 'food': 6, 'kills': [['rat', 10], ['rat', 40], ['wolf', 90], ['goblin', 200], ['bandit', 320], ['wolf', 400]][: 3 + k]},
          {'kind': ['xp', 'gold', 'drop'][k % 3], 'skill': 'attack', 'min': 1, 'item': 'pelt', 'unit': 10, 'bit': 0,
           'xpTokens': {'attack': 20, 'strength': 21, 'defence': 22, 'hitpoints': 25},
           'facts': {'tokens': {'20': str(4000 + 3000 * k), '21': '4000', '22': '4000', '25': '8000'}, 'pieces': [{'id': 'x', 'collection': 'ASHVALE Armoury', 'json': {'attributes': [{'trait_type': 'Key', 'value': 'sword_t1'}]}}]}})
         for k in range(4)]
STRONG = {'attack': 20, 'strength': 21, 'defence': 22, 'hitpoints': 25, 'woodcutting': 30}
CHEATS = [   # (what it tries, trip, params, the judge must say won == this)
    ('a weak character claims bandit kills', {'v': 1, 'ticks': 6000, 'food': 0, 'kills': [['bandit_leader', 10], ['bandit_leader', 60]]},
     {'kind': 'xp', 'skill': 'attack', 'min': 1, 'xpTokens': STRONG, 'facts': {'tokens': {'20': '0', '25': '1154'}}}, False),
    ('more fighting than the trip lasted', {'v': 1, 'ticks': 30, 'food': 6, 'kills': [['rat', 1]] * 12},
     {'kind': 'xp', 'skill': 'attack', 'min': 1, 'xpTokens': STRONG, 'facts': {'tokens': {'20': '4000', '25': '8000'}}}, False),
    ('oak logs below the woodcutting level', {'v': 1, 'ticks': 3000, 'gathered': {'oak_logs': 50}},
     {'kind': 'resource', 'item': 'oak_logs', 'min': 1, 'xpTokens': STRONG, 'facts': {'tokens': {'30': '0'}}}, False),
    ('logs at a fair rate', {'v': 1, 'ticks': 3000, 'gathered': {'logs': 40}},
     {'kind': 'resource', 'item': 'logs', 'min': 1, 'xpTokens': STRONG, 'facts': {'tokens': {'30': '100'}}}, True)]
def qjs(src, expr):
    code = ("import quickjs, sys, time\nctx = quickjs.Context(); ctx.set_memory_limit(64 << 20); ctx.set_time_limit(5)\n"
            "ctx.eval('delete globalThis.Date; Math.random = undefined;')\nctx.eval(open(sys.argv[1]).read())\nt=time.time(); r=ctx.eval(sys.argv[2]); print(r); print('QJS_MS', int((time.time()-t)*1000))\n")
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f: f.write(src); p = f.name
    r = subprocess.run([QPY, '-c', code, p, expr], capture_output=True, text=True); os.remove(p)
    if r.returncode: raise SystemExit('quickjs: ' + r.stderr[-800:])
    return r.stdout.strip().split('\n')
def node(src, expr):
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f: f.write(src + '\nMath.random = undefined;\nconsole.log(' + expr + ');\n'); p = f.name
    r = subprocess.run(['node', p], capture_output=True, text=True); os.remove(p)
    if r.returncode: raise SystemExit('node: ' + r.stderr[-800:])
    return r.stdout.strip()
if __name__ == '__main__':
    src = build(); kb = len(src.encode()) / 1024
    if sys.argv[1:2] == ['build']:
        open(sys.argv[2], 'w').write(src); print('wrote %s: %.0f KB (cap 256 KB)' % (sys.argv[2], kb)); sys.exit(0 if kb <= 256 else 1)
    print('judge source %.0f KB (cap 256 KB)' % kb)
    ok = True
    for seed, inp, par in TRIPS:
        expr = 'JSON.stringify(judge(%s, %s, %s))' % (json.dumps(seed), json.dumps(inp), json.dumps(par))
        q = qjs(src, expr); n = node(src, expr)
        same = q[0] == n; ok &= same
        print(('SAME ' if same else 'DIFFERENT ') + q[-1] + ' | ' + q[0][:160])
        if not same: print('   node:', n[:200])
    for what, inp, par, want in CHEATS:
        expr = 'JSON.stringify(judge(%s, %s, %s))' % (json.dumps('cheat' + 'x' * 30), json.dumps(inp), json.dumps(par))
        q = qjs(src, expr); r = json.loads(q[0]); good = bool(r.get('won')) == want; ok &= good
        print(('ok   ' if good else 'FAIL ') + what + ' -> won=' + str(r.get('won')) + ' ' + (r.get('why') or '') + ' ' + json.dumps(r.get('audit', {}))[:100])
    print('ALL SAME' if ok else 'MISMATCH'); sys.exit(0 if ok else 1)
