"""[Claude 2026-10-22] coming back to a table and the 15 s rule (the operator: "If you leave the table with a bet on the table and you come back to
the table that needs to be yours"; "If you're disconnected from one of the tables you should have 15 seconds to reconnect"; "If you don't
return ... during a play round, whatever your win or loss should be returned to your inventory; if it's the bets open time it should just be
removed from the table and returned"). The Bank's own code (tables.py through bank.handle) on a scratch database; the books checked throughout.
python3 tests/bank_tables_back_test.py   (BANK_DIR=... for another bank checkout)"""
import os, sys, tempfile, time, json, hashlib, sqlite3
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ.get('BANK_DIR') or os.path.join(HERE, 'tools', 'bank'))
import bank, tables as TB
TB.hook(bank)
tmp = tempfile.mkdtemp(); bank.DB = os.path.join(tmp, 'b.sqlite'); bank.LOG = os.path.join(tmp, 'b.log'); bank.PK_LEDGER = os.path.join(tmp, 'ledger.sqlite')
L = sqlite3.connect(bank.PK_LEDGER); L.execute('create table arcade_tx(txid text primary key, block_height int, position int, encoding_class text, message_type int, message_version int, sender text, reference text, payload_hex text, valid int, extra text)'); L.commit()
def chain(tx, frm, n): L.execute('insert into arcade_tx values(?,?,?,?,?,?,?,?,?,?,?)', (tx, 1, 1, 'C', 0, 0, frm, bank.ASHVALE, '00000000%08x%016x' % (26, n), 1, None)); L.commit()
bank.pool_proves = lambda *a: False
fails = []
def check(ok, m): print(('ok   ' if ok else 'FAIL ') + m); ok or fails.append(m)
c = bank.db(); TB.tb_db(c)
tx = lambda k: hashlib.sha256(k.encode()).hexdigest()
def H(addr, **m): return bank.handle(c, addr, m)
def tick(): bank.OUTQ.clear(); TB.tb_tick(c)
def table(tbl): return dict(TB.table_row(c, tbl))
def state(tbl): return json.loads(table(tbl)['state'])
def expire(tbl): c.execute('update tbt set until=0 where tbl=?', (tbl,)); c.commit()
def sit(s): r = TB.sitting(c, s); return dict(r) if r else None
Q = {}
def word(addr, s, t, **m): Q[s] = Q.get(s, 0) + 1; return H(addr, t=t, s=s, q=Q[s], **m)
def books(s):
    r = sit(s); paid = sum(x['units'] for x in c.execute("select units from jobs where req=?", ('tb:' + s,)))
    return int(r['credit']) == int(r['cin']) - int(r['bet']) + int(r['won']) - paid
def quiet(s, secs):   # nothing heard from s for secs, the room up all along (a game that says it is there every 5 s: v 2)
    TB.FAST.add(s); TB.SEEN.pop(s, None); c.execute('update tb set last=? where s=?', (time.time() - secs, s)); c.commit(); TB.ROOM['up'] = time.time() - 3600
A, B2 = 'nAAAAapple', 'nBBBBpear'
check('tbback' in TB.TB_TYPES and TB.TB_IDLE == 15, 'tbback is a table word; a sitting goes quiet after 15 s')
SO = 'tb:cw1:00000000000000f0'
H(A, t='tbin', s=SO, n=50, tx=tx('a0')); chain(tx('a0'), A, 50); H(A, t='tbsit', s=SO, p=6)
TB.SEEN.pop(SO, None); c.execute('update tb set last=? where s=?', (time.time() - 60, SO)); c.commit(); TB.ROOM['up'] = time.time() - 3600; tick()
check(sit(SO)['st'] == 'open', 'an older game (no v 2 heartbeat) quiet for 60 s: still at the table (it says it is there every 20 s; the old 120 s holds for it)')
H(A, t='tb?', v=2, s=SO); TB.SEEN.pop(SO, None); c.execute('update tb set last=? where s=?', (time.time() - 20, SO)); c.commit(); tick()
check(sit(SO)['st'] != 'open', 'once it says v 2, 15 s is its limit')
# ---- 1. quiet while betting is open: the bets come off and everything goes home
S1 = 'tb:cw1:0000000000000a01'
H(A, t='tbin', s=S1, n=500, tx=tx('a1')); chain(tx('a1'), A, 500); H(A, t='tbsit', s=S1, p=2); tick()
word(A, S1, 'tbbet', r=table('cw1')['round'], k='red:', n=100)
check(sit(S1)['credit'] == 400, 'at the wheel: 500 in, 100 on red')
quiet(S1, 10); tick(); check(sit(S1)['st'] == 'open', 'quiet for 10 s: still at the table')
quiet(S1, 16); tick(); r = sit(S1)
check(r['st'] == 'paid' and int(r['paid']) == 500 and books(S1) and not (state('cw1')['bets'].get(S1)), 'quiet for 16 s while bets are open: the 100 comes off the felt and all 500 go home (%s, paid %s)' % (r['st'], r['paid']))
# ---- 2. the room down: silence is not the player's
S2 = 'tb:cw1:0000000000000a02'
H(A, t='tbin', s=S2, n=300, tx=tx('a2')); chain(tx('a2'), A, 300); H(A, t='tbsit', s=S2, p=3)
TB.room_up(False); TB.SEEN.pop(S2, None); c.execute('update tb set last=? where s=?', (time.time() - 600, S2)); c.commit(); tick()
check(sit(S2)['st'] == 'open', 'the Bank\'s room down for 10 min: nobody is stood up')
TB.room_up(True); tick(); check(sit(S2)['st'] == 'open', 'the room back: 15 s from now to be heard again')
# ---- 3. back within 15 s (a reload): the same sitting, as it was
r = H(A, t='tbback', s='tb:cw1:0000000000000b02', tbl='cw1', p=3)
check(r and r['s'] == S2 and r.get('for') == 'tb:cw1:0000000000000b02' and r['st'] == 'open' and r['credit'] == 300 and r['spot'] == 3, 'a new page asks to come back: the Bank hands it the sitting still open (credit 300, spot 3)')
check(sit('tb:cw1:0000000000000b02') is None, 'no second sitting was made')
H(A, t='tbout', s=S2); tick()
# ---- 4. left with bets still working (the dice: a Pass Line with the point on), back later: the bets are yours again
S3 = 'tb:cd1:0000000000000a03'
H(A, t='tbin', s=S3, n=1000, tx=tx('a3')); chain(tx('a3'), A, 1000); H(A, t='tbsit', s=S3, p=1); tick()
for _ in range(80):   # a Pass Line on until a point is on
    T = table('cd1')
    if T['phase'] == 'bet' and state('cd1')['point'] and (state('cd1')['seats'].get(S3) or {}).get('bets', {}).get('pass'): break
    if T['phase'] == 'bet' and not (state('cd1')['seats'].get(S3) or {}).get('bets', {}).get('pass') and not state('cd1')['point']: word(A, S3, 'tbbet', r=T['round'], k='pass', n=50)
    expire('cd1'); tick()
pt = state('cd1')['point']
check(pt and state('cd1')['seats'][S3]['bets'].get('pass') == 50 and table('cd1')['phase'] == 'bet', 'the point is on (%s) with 50 on the Pass Line' % pt)
r = word(A, S3, 'tbtake', r=table('cd1')['round'], k='pass')
check(state('cd1')['seats'][S3]['bets'].get('pass') == 50 and books(S3), 'a Pass Line with the point on cannot be taken down')
word(A, S3, 'tbbet', r=table('cd1')['round'], k='field', n=10)
cr = sit(S3)['credit']; r = H(A, t='tbout', s=S3)
check(r['st'] == 'closing' and 'still working' in (r.get('note') or ''), 'cash out: closing, the Pass Line still working')
check(sit(S3)['credit'] == cr + 10 and not state('cd1')['seats'][S3]['bets'].get('field'), 'the Field bet (bets open) came straight back; the Pass Line stays')
gone_credit = sit(S3)['credit']
S4 = 'tb:cd1:0000000000000b03'
r = H(A, t='tbback', s=S4, tbl='cd1', p=1)
o = sit(S3); n = sit(S4)
check(r and r['s'] == S4 and r['st'] == 'open' and 'yours again' in (r.get('note') or ''), 'coming back: a new sitting with the bets still working (%s)' % (r.get('note') if r else r))
check(state('cd1')['seats'].get(S4, {}).get('bets', {}).get('pass') == 50 and S3 not in state('cd1')['seats'], 'the 50 on the Pass Line is the new sitting\'s now')
check(o['st'] == 'paid' and int(o['paid']) == gone_credit and books(S3), 'the old sitting\'s credit went home as the game booked it (%d), its books hold' % gone_credit)
check(n['credit'] == 0 and n['spot'] == 1 and books(S4), 'the new one: credit 0, the same spot, books hold (in = bet = the felt)')
check(H(B2, t='tbback', s='tb:cd1:0000000000000c03', tbl='cd1', p=2).get('st') == 'none', 'someone else coming back gets nothing of it')
for _ in range(80):   # the point decided
    expire('cd1'); tick()
    if not state('cd1')['point']: break
n = sit(S4); won = n['credit']
check(not state('cd1')['point'] and books(S4) and won in (0, 100), 'the point decided: the Pass Line settles into the sitting that came back (credit %d), books hold' % won)
H(A, t='tbout', s=S4); tick(); n = sit(S4)
check(n['st'] == 'paid' if won else n['st'] in ('paid', 'closing'), 'its credit goes home on cash-out (%s)' % n['st'])
check(books(S4), 'books hold at the end')
# ---- 5. twenty-one: a hand being played out stays where it is
S5 = 'tb:cb1:0000000000000a05'
H(A, t='tbin', s=S5, n=200, tx=tx('a5')); chain(tx('a5'), A, 200); H(A, t='tbsit', s=S5, p=1); tick()
word(A, S5, 'tbbet', r=table('cb1')['round'], k='main', n=10); expire('cb1'); tick()
if table('cb1')['phase'] in ('insurance', 'play'):
    H(A, t='tbout', s=S5)
    r = H(A, t='tbback', s='tb:cb1:0000000000000b05', tbl='cb1', p=1)
    check(r.get('st') == 'none' and 'played out' in (r.get('note') or ''), 'twenty-one mid-hand: the hand plays out where it is (%s)' % r.get('note'))
else: check(True, 'twenty-one: the hand was over at once (a natural) - nothing to move')
print('ALL OK' if not fails else '%d FAILED' % len(fails))
TB.WORKER.p and TB.WORKER.p.kill()
sys.exit(1 if fails else 0)
