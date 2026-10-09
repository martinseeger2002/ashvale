"""Two characters on one wallet (Ziibiing, 2026-10-09): a save naming its home ('h') is kept apart from the Ashvale one, each with
its own lineage; the answers go to the address marked with the home; 'hold'/'holds?' tell each what the other carries.
    python3 tests/bank_homes_test.py"""
import os, sys, sqlite3, importlib.util
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('bank', os.path.join(H, 'tools', 'bank', 'bank.py')); B = importlib.util.module_from_spec(spec)
sys.argv = ['bank.py']; spec.loader.exec_module(B)
B.log = lambda *a: None
c = sqlite3.connect(':memory:'); c.row_factory = sqlite3.Row
c.execute('create table saves(addr text primary key, id integer, blob text, at real)')
c.execute('create table holds(addr text, h text, b text, at real, primary key(addr, h))')
fails = 0
def ok(cond, t):
    global fails
    fails += not cond; print(('ok   ' if cond else 'FAIL ') + t)
def sv(sid, h=None, base=None):
    m = {'t': 'sv', 'id': sid, 'i': 0, 'n': 1, 'd': 'x%d' % sid}
    if h: m['h'] = h
    if base is not None: m['base'] = base
    return B.handle(c, 'A', m)
def ld(h=None): return B.handle(c, 'A', dict({'t': 'ld?'}, **({'h': h} if h else {})))
r = sv(100); ok(r == {'t': 'svok', 'to': 'A', 'id': 100}, 'an Ashvale save (no h) is taken exactly as before: ' + str(r))
r = sv(200, 'ziibiing'); ok(r and r['to'] == 'A' and r['h'] == 'ziibiing' and r['id'] == 200, 'a Ziibiing save is taken, its answer to the address, marked ziibiing')
ok(c.execute("select id from saves where addr='A'").fetchone()['id'] == 100, 'the Ashvale save is untouched by it')
ok(c.execute("select id from saves where addr='A#ziibiing'").fetchone()['id'] == 200, 'the Ziibiing save is kept under A#ziibiing')
r = sv(300, 'ziibiing', base=200); ok(r and r['t'] == 'svok' and r['id'] == 300, 'the Ziibiing character continues its own lineage')
r = sv(400, base=100); ok(r and r['t'] == 'svok' and 'h' not in r, 'the Ashvale character continues its own lineage, unmarked')
r = sv(500, 'ziibiing', base=200); ok(r and r['t'] == 'svx' and r['h'] == 'ziibiing', 'a stale Ziibiing device is refused, marked ziibiing (the Ashvale game ignores it)')
a, z = ld(), ld('ziibiing')
ok(a[0]['d'] == 'x400' and 'h' not in a[0], 'ld? with no home loads the Ashvale save')
ok(z[0]['d'] == 'x300' and z[0]['h'] == 'ziibiing' and z[0]['to'] == 'A', 'ld? ziibiing loads the Ziibiing save, marked')
B.handle(c, 'A', {'t': 'sv', 'h': 'x;drop', 'id': 9, 'i': 0, 'n': 1, 'd': 'q'})
ok(c.execute("select count(*) n from saves where addr like 'A#x%'").fetchone()['n'] == 0, 'a home that is not a plain word is not a key')
B.handle(c, 'A', {'t': 'hold', 'b': {'coins': 50, 'bronze_sword': 1}})
B.handle(c, 'A', {'t': 'hold', 'h': 'ziibiing', 'b': {'coins': 20, 'wild_rice': 3}})
r = B.handle(c, 'A', {'t': 'holds?', 'h': 'ziibiing'}); ok(r['o'] == {'coins': 50, 'bronze_sword': 1} and r['multi'] and r['h'] == 'ziibiing', 'the Ziibiing character hears what the Ashvale one carries: ' + str(r['o']))
r = B.handle(c, 'A', {'t': 'holds?'}); ok(r['o'] == {'coins': 20, 'wild_rice': 3} and r['multi'] and 'h' not in r, 'and the Ashvale one what the Ziibiing one carries')
r = B.handle(c, 'B', {'t': 'holds?'}); ok(r['o'] == {} and not r['multi'], 'a wallet with one character: nothing held elsewhere, not multi')
c.execute("insert into saves values('C', 1, 'x', 0)"); c.execute("insert into saves values('C#ziibiing', 1, 'x', 0)")
ok(B.handle(c, 'C', {'t': 'holds?'})['multi'] and B.handle(c, 'C', {'t': 'holds?', 'h': 'ziibiing'})['multi'], 'two saves and no holds yet: still multi both ways')
print('ALL OK' if not fails else '%d FAILED' % fails); sys.exit(1 if fails else 0)
