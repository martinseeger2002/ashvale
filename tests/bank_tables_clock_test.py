"""[Claude 2026-10-22] the tables' clock in the room with no browser (bank.tables_clock): the operator found every table upstairs
"waiting on players" with one player seated - the cert room loop never ticked the tables. This runs the real clock thread against
a stand-in room: one player alone at a table gets a round, the table moves on with nobody calling tb_tick, the tables' words go
out through the room, and bets sent while the clock runs keep the books.   python3 tests/bank_tables_clock_test.py (BANK_DIR=...)"""
import os, sys, tempfile, time, json, hashlib, threading
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ.get('BANK_DIR') or os.path.join(HERE, 'tools', 'bank'))
import bank, tables as TB
TB.hook(bank)
fails = []
def check(ok, m): print(('ok   ' if ok else 'FAIL ') + m); ok or fails.append(m)
if not hasattr(bank, 'tables_clock'):
    print('FAIL this bank.py has no tables_clock (tables_clock.patch not applied)'); sys.exit(1)
tmp = tempfile.mkdtemp(); bank.DB = os.path.join(tmp, 'b.sqlite'); bank.LOG = os.path.join(tmp, 'b.log'); bank.PK_LEDGER = os.path.join(tmp, 'ledger.sqlite')
import sqlite3
L = sqlite3.connect(bank.PK_LEDGER); L.execute('create table arcade_tx(txid text primary key, block_height int, position int, encoding_class text, message_type int, message_version int, sender text, reference text, payload_hex text, valid int, extra text)'); L.commit()
c = bank.db(); TB.tb_db(c)
def H(addr, **m): return TB.handle_tb(c, addr, m)
def table(tbl): return dict(TB.table_row(c, tbl))
def sit(s): return dict(TB.sitting(c, s))
def books(s):
    r = sit(s); paid = sum(x['units'] for x in c.execute("select units from jobs where req=?", ('tb:' + s,)))
    return int(r['credit']) == int(r['cin']) - int(r['bet']) + int(r['won']) - paid
def expire(tbl): c.execute('update tbt set until=0 where tbl=?', (tbl,)); c.commit()
class Room:   # the cert room's surface the clock uses: token, me, send
    def __init__(self): self.token, self.me, self.sent, self.lock = 'tok', {'tag': 'ashvale'}, [], threading.Lock()
    def send(self, w):
        with self.lock: self.sent.append(w)
room = Room(); stop = threading.Event()
A, S = 'nAAAAapple', 'tb:cw1:0000aaaa1111'
check(H(A, t='tbin', s=S, n=1000, tx=hashlib.sha256(b'a1').hexdigest())['credit'] == 1000 and H(A, t='tbsit', s=S, p=2)['spot'] == 2, 'one player alone at the wheel: 1,000 in, spot 2')
check(table('cw1')['phase'] == 'idle', 'the wheel is idle before the clock runs')
bank.OUTQ.clear()
th = threading.Thread(target=bank.tables_clock, args=(stop, room, 0.05), daemon=True); th.start()
t0 = time.time()
while time.time() - t0 < 5 and table('cw1')['phase'] != 'bet': time.sleep(0.05)
check(table('cw1')['phase'] == 'bet' and table('cw1')['round'] == 1, 'with nobody calling tb_tick the clock opens betting for the one player (%.2f s)' % (time.time() - t0))
time.sleep(0.3)
words = [w for w in list(room.sent) if isinstance(w, dict) and w.get('t') == 'tbs' and w.get('tbl') == 'cw1']
check(words and words[-1].get('ph') == 'bet', "the table's word goes out through the room: %s" % (words[-1].get('ph') if words else None))
check(not bank.OUTQ, 'nothing left waiting in OUTQ')
# bets from the room's thread (this one) while the clock thread ticks: every round settles and the books hold
q, rounds0, bad = 0, table('cw1')['round'], 0
for i in range(12):
    t0 = time.time()
    while time.time() - t0 < 5 and table('cw1')['phase'] != 'bet': time.sleep(0.02)
    rd = table('cw1')['round']
    for k in ('red:', 'black:', 's:17', 'doz:2'):
        q += 1; H(A, t='tbbet', s=S, q=q, r=rd, k=k, n=5)
    expire('cw1')
    t0 = time.time()
    while time.time() - t0 < 5 and table('cw1')['phase'] != 'show': time.sleep(0.02)
    if not books(S) or sit(S)['credit'] < 0: bad += 1
    expire('cw1')
check(table('cw1')['round'] >= rounds0 + 10, 'the wheel spun round after round on the clock alone (%d rounds)' % (table('cw1')['round'] - rounds0))
check(not bad and books(S), 'bets sent while the clock ticks: the books hold after every spin (credit %d)' % sit(S)['credit'])
res = c.execute("select count(*) from tbres where tbl='cw1'").fetchone()[0]
check(res >= 10, '%d spins recorded' % res)
# cash out: the clock pays the credit home once the deposit is proven (as the room loop's tick did)
L.execute('insert into arcade_tx(txid, block_height, position, encoding_class, message_type, message_version, sender, reference, payload_hex, valid, extra) values(?,?,?,?,?,?,?,?,?,?,?)',
          (hashlib.sha256(b'a1').hexdigest(), 100, 0, 'x', 0, 0, A, '', '', 1, '{}')); L.commit()
t0 = time.time(); r = H(A, t='tbout', s=S)
while time.time() - t0 < 8 and sit(S)['st'] != 'paid': time.sleep(0.05)
check(sit(S)['st'] in ('paid', 'closing') and books(S), 'cash out on the clock: %s, books hold' % sit(S)['st'])
stop.set(); th.join(2)
check(not th.is_alive(), 'the clock thread stops with the Bank')
log = open(bank.LOG).read() if os.path.exists(bank.LOG) else ''
check('TB TICK ERROR' not in log and 'TB STEP ERROR' not in log and 'locked' not in log, 'no tick errors, no locked database in the log')
print('ALL OK' if not fails else '%d FAILED' % len(fails))
TB.WORKER.p and TB.WORKER.p.kill()
sys.exit(1 if fails else 0)
