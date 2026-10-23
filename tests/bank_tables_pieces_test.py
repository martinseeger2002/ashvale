"""[Claude 2026-10-22] the table's word in the room's 512 bytes (the operator: "Bets aren't showing up on the roulette table" - every word over 512 was
refused by the room): a full wheel, dice table and twenty-one table, every word the Bank would send checked against the limit, and the pieces put
back together the way the game does (engtables assemble/piece) give the same state.   python3 tests/bank_tables_pieces_test.py (BANK_DIR=...)"""
import os, sys, tempfile, time, json, hashlib, sqlite3
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ.get('BANK_DIR') or os.path.join(HERE, 'tools', 'bank'))
import bank, tables as TB
TB.hook(bank)
tmp = tempfile.mkdtemp(); bank.DB = os.path.join(tmp, 'b.sqlite'); bank.LOG = os.path.join(tmp, 'b.log'); bank.PK_LEDGER = os.path.join(tmp, 'ledger.sqlite')
L = sqlite3.connect(bank.PK_LEDGER); L.execute('create table arcade_tx(txid text primary key, block_height int, position int, encoding_class text, message_type int, message_version int, sender text, reference text, payload_hex text, valid int, extra text)'); L.commit()
bank.pool_proves = lambda *a: False
fails = []
def check(ok, m): print(('ok   ' if ok else 'FAIL ') + m); ok or fails.append(m)
c = bank.db(); TB.tb_db(c)
def H(addr, **m): return bank.handle(c, addr, m)
def tick(): bank.OUTQ.clear(); TB.tb_tick(c)
def table(tbl): return dict(TB.table_row(c, tbl))
def expire(tbl): c.execute('update tbt set until=0 where tbl=?', (tbl,)); c.commit()
Q = {}
def word(addr, s, t, **m): Q[s] = Q.get(s, 0) + 1; return H(addr, t=t, s=s, q=Q[s], **m)
N = lambda o: len(json.dumps(o, separators=(',', ':')))
def assemble(msgs):   # engtables: assemble / piece / flushP
    base = msgs[0]
    if not base.get('pc'): return base
    D = dict(base, seats={}, felt={})
    if base.get('last'): D['last'] = dict(base['last'], lines={}, pay={})
    if base.get('hand'): D['hand'] = dict(base['hand'], spots={})
    for q in msgs[1:]:
        assert q['t'] == 'tbp' and q['seq'] == base['seq'] and q['r'] == base['r']
        if q.get('p') is not None and q.get('seat'): D['seats'][q['p']] = q['seat']
        if 'felt' in q: D['felt'][q['s']] = q['felt']
        if 'hand' in q and D.get('hand'): D['hand']['spots'][q['s']] = q['hand']
        if 'pay' in q and D.get('last'): D['last']['pay'][q['s']] = q['pay']
        if 'lines' in q and D.get('last'): D['last']['lines'][q['s']] = q['lines']
    D.pop('pc', None); return D
def same(a, b):
    for k in ('hist', 'h', 'shoe_h'): a.pop(k, None); b.pop(k, None)
    if a.get('last'): a['last'].pop('sec', None)
    if b.get('last'): b['last'].pop('sec', None)
    if a.get('last') and not a['last'].get('lines') and not (b.get('last') or {}).get('lines'): pass
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
people = {}
for tbl, n in (('cw1', 6), ('cd1', 6), ('cb1', 7)):
    for i in range(n):
        a = 'nPLAYER%02d%sXXXXXXXXXXXXXXXXXXXXXXX' % (i, tbl); s = 'tb:%s:%016x' % (tbl, i + 1 + 100 * len(people))
        H(a, t='tbin', s=s, n=5000, tx=hashlib.sha256(s.encode()).hexdigest()); H(a, t='tbsit', s=s, p=i + 1); people[s] = (a, tbl)
tick()
WK = {'cw1': ['red:', 'black:', 's:0', 's:17', 's:23', 'doz:2', 'col:3', 'odd:', 'high:'], 'cd1': ['pass', 'field', 'big6', 'big8', 'hard8', 'any7']}
for s, (a, tbl) in people.items():
    r = table(tbl)['round']
    if tbl == 'cb1': word(a, s, 'tbbet', r=r, k='main', n=25)
    else:
        for k in WK[tbl]: word(a, s, 'tbbet', r=r, k=k, n=5)
for tbl in ('cw1', 'cd1', 'cb1'):
    full = TB.public(c, tbl); msgs = TB.pieces(TB.public(c, tbl))
    check(N(full) > 500, '%s betting with %d players: the whole word is %d bytes (over the room\'s 512)' % (tbl, len(full['seats']), N(full)))
    check(all(N(m) <= 512 for m in msgs), '%s: %d words, the biggest %d bytes' % (tbl, len(msgs), max(N(m) for m in msgs)))
    check(same(assemble(msgs), json.loads(json.dumps(full))), '%s: the pieces put back together are the table\'s state' % tbl)
for tbl in ('cw1', 'cd1', 'cb1'): expire(tbl)
tick()
for tbl in ('cw1', 'cd1', 'cb1'):
    full = TB.public(c, tbl); msgs = TB.pieces(TB.public(c, tbl))
    check(all(N(m) <= 512 for m in msgs), '%s after the %s (%s): %d words, the biggest %d bytes' % (tbl, 'deal' if tbl == 'cb1' else 'result', full['ph'], len(msgs), max(N(m) for m in msgs)))
    A = assemble(msgs); B2 = json.loads(json.dumps(full))
    check(same(A, B2), '%s: put back together, the same state (results and pay per player%s)' % (tbl, ', hands' if tbl == 'cb1' else ''))
small = TB.public(c, 'cb2'); check(TB.pieces(small) == [small], 'a table that fits goes whole, as before (%d bytes)' % N(small))
# the clock's own words: everything in OUTQ fits
bank.OUTQ.clear(); TB.announce(c, 'cw1'); TB.announce(c, 'cd1'); TB.announce(c, 'cb1')
check(bank.OUTQ and all(N(m) <= 512 for m in bank.OUTQ), 'what the clock sends (OUTQ, %d words): every one fits' % len(bank.OUTQ))
s0, (a0, _) = next(iter((k, v) for k, v in people.items() if v[1] == 'cw1'))
rep = H(a0, t='tb?', s=s0, v=2)
check(isinstance(rep, list) and all(N(m) <= 512 for m in rep) and rep[1].get('pc'), 'a player\'s tb?: the sitting and the table in pieces, every one fits')
print('ALL OK' if not fails else '%d FAILED' % len(fails))
TB.WORKER.p and TB.WORKER.p.kill()
sys.exit(1 if fails else 0)
