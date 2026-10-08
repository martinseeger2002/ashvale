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
