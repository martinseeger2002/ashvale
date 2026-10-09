"""the Bank's save lineage (2026-10-08): a save that names the save it continues ('base') or, when the Bank's 'svok' for its
last save was lost, the last save this same game sent ('mine'), is taken; one from a device that fell behind is refused."""
import os, sys, sqlite3, importlib.util
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('bank', os.path.join(H, 'tools', 'bank', 'bank.py')); B = importlib.util.module_from_spec(spec)
sys.argv = ['bank.py']; spec.loader.exec_module(B)
B.log = lambda *a: None
c = sqlite3.connect(':memory:'); c.row_factory = sqlite3.Row
c.execute('create table saves(addr text primary key, id integer, blob text, at real)')
fails = 0
def ok(cond, t):
    global fails
    fails += not cond; print(('ok   ' if cond else 'FAIL ') + t)
sv = lambda sid, base=None, mine=None: B.handle_save(c, 'A', dict({'t': 'sv', 'id': sid, 'i': 0, 'n': 1, 'd': 'x%d' % sid}, **({'base': base} if base is not None else {}), **({'mine': mine} if mine is not None else {})))
ok(sv(100)['t'] == 'svok', 'first save taken')
ok(sv(130, base=100)['t'] == 'svok', 'a save continuing the Bank\'s save is taken')
ok(sv(160, base=100, mine=130)['t'] == 'svok', 'svok for 130 lost: the next save names 130 as its own last save and is taken')
ok(sv(190, base=100, mine=130)['t'] == 'svx', 'but a game whose last save is not the Bank\'s (another device played) is refused')
ok(sv(220, base=130)['t'] == 'svx', 'and so is a save continuing an older one with no own-save to vouch for it')
print('ALL OK' if not fails else 'FAILED: %d' % fails)
# the sugar bush marks (2026-10-08)
c.execute('create table marks(k text, x integer, y integer, p integer, by text, at real, primary key(k, x, y))')
B.handle_marks(c, 'A', {'t': 'mark', 'k': 'sap', 'x': 5, 'y': 6, 'p': 110}); B.handle_marks(c, 'B', {'t': 'mark', 'k': 'sap', 'x': 5, 'y': 6, 'p': 109})
r = B.handle_marks(c, 'C', {'t': 'marks?', 'k': 'sap', 'x0': 0, 'y0': 0, 'x1': 10, 'y1': 10})
ok(r and r[0]['cells'] == [[5, 6, 110]], 'a maple keeps its latest sap day, for anyone asking: %r' % (r,))
ok(not B.handle_marks(c, 'C', {'t': 'marks?', 'k': 'bark', 'x0': 0, 'y0': 0, 'x1': 10, 'y1': 10}), 'and the bark marks are their own')
print('ALL OK' if not fails else 'FAILED: %d' % fails)
# carried on in a friend's canoe (2026-10-08)
c.execute('create table carried(addr text primary key, x integer, y integer, by text, onb integer, at real)')
c.execute('create table wheres(addr text primary key, x integer, y integer, at real)')
B.handle_carry(c, 'S', {'t': 'carry', 'who': 'R', 'x': 50, 'y': 60, 'on': 1})
ok(B.handle_carry(c, 'R', {'t': 'carried?'}).get('none'), "a stranger the Bank has not seen near there cannot move anyone")
c.execute("insert into wheres values('S', 48, 61, ?)", (__import__('time').time(),))
B.handle_carry(c, 'S', {'t': 'carry', 'who': 'R', 'x': 50, 'y': 60, 'on': 1})
r = B.handle_carry(c, 'R', {'t': 'carried?'})
ok(r['x'] == 50 and r['y'] == 60 and r['by'] == 'S' and r['on'] == 1, 'the canoe that carries a dropped-out partner tells the Bank where: %r' % (r,))
B.handle_carry(c, 'S', {'t': 'carry', 'who': 'R', 'x': 70, 'y': 61, 'on': 0})
ok(B.handle_carry(c, 'R', {'t': 'carried?'})['on'] == 0, 'and where it put them ashore')
print('ALL OK' if not fails else 'FAILED: %d' % fails)
