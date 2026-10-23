"""[Claude 2026-10-20] the clubhouse tables through the @ashvale Bank (tools/bank/tables.py + tables_worker.js), on a throwaway database
and a fake chain ledger: credit at once on a deposit; spots; every table's clock (betting, the outcome, the show); the outcome follows from
the secret whose hash went out when betting opened (HMAC-SHA256(secret, '<table>:<round>') through the game's own rules); several players in
one round; the twenty-one hand in turns with the clock standing a spot that does not answer; a word asked twice gets the same answer; leaving
with bets still working; cash-out pays once and only once the chain shows the deposits; and a long random run where every sitting's books
hold after every step (credit = in - staked + returned - paid).  python3 tests/bank_tables_test.py   (BANK_DIR=... for another bank checkout)"""
import os, sys, sqlite3, tempfile, time, json, hashlib, hmac, random, subprocess
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ.get('BANK_DIR') or os.path.join(HERE, 'tools', 'bank'))
import bank, tables as TB
TB.hook(bank)   # an unpatched bank.py gets the tables hooks in-process (tables.hook)
TB.TB_IDLE = 3600   # the test's players never go quiet by the clock (a slow machine like .25 spends over 120 s between words in part 4); part 7 tests going quiet with last=0
tmp = tempfile.mkdtemp(); bank.DB = os.path.join(tmp, 'b.sqlite'); bank.LOG = os.path.join(tmp, 'b.log'); bank.PK_LEDGER = os.path.join(tmp, 'ledger.sqlite')
L = sqlite3.connect(bank.PK_LEDGER); L.execute('create table arcade_tx(txid text primary key, block_height int, position int, encoding_class text, message_type int, message_version int, sender text, reference text, payload_hex text, valid int, extra text)'); L.commit()
def chain(tx, frm, n): L.execute('insert into arcade_tx values(?,?,?,?,?,?,?,?,?,?,?)', (tx, 1, 1, 'C', 0, 0, frm, bank.ASHVALE, '00000000%08x%016x' % (26, n), 1, None)); L.commit()
bank.pool_proves = lambda *a: False
fails = []
def check(ok, m): print(('ok   ' if ok else 'FAIL ') + m); ok or fails.append(m)
c = bank.db(); TB.tb_db(c)
tx = lambda k: hashlib.sha256(k.encode()).hexdigest()
A, Bb, Cc = 'nAAAAapple', 'nBBBBpear', 'nCCCCplum'
def H(addr, **m): return bank.handle(c, addr, m)
def tick(): bank.OUTQ.clear(); TB.tb_tick(c)
def table(tbl): return dict(TB.table_row(c, tbl))
def state(tbl): return json.loads(table(tbl)['state'])
def expire(tbl): c.execute('update tbt set until=0 where tbl=?', (tbl,)); c.commit()
def sit(s): return dict(TB.sitting(c, s))
Q = {}
def word(addr, s, t, **m):
    Q[s] = Q.get(s, 0) + 1; return H(addr, t=t, s=s, q=Q[s], **m)
def books(s):
    r = sit(s); paid = sum(x['units'] for x in c.execute("select units from jobs where req=?", ('tb:' + s,)))
    return int(r['credit']) == int(r['cin']) - int(r['bet']) + int(r['won']) - paid
# ---- 1. a deposit and a spot
SA, SB, SC = 'tb:cd1:0000aaaa1111', 'tb:cd1:0000bbbb2222', 'tb:cw1:0000cccc3333'
r = H(A, t='tbin', s=SA, n=1000, tx=tx('a1')); check(r and r['credit'] == 1000 and r['st'] == 'open' and r['spot'] is None, 'a deposit of 1,000 is credit at once: %s' % r)
check(H(A, t='tbin', s=SA, n=1000, tx=tx('a1'))['credit'] == 1000, 'the same send told again counts once')
check(H(Bb, t='tbin', s=SA, n=5, tx=tx('b0')) is None, "another address cannot touch someone's sitting")
check(H(A, t='tbsit', s=SA, p=3)['spot'] == 3, 'spot 3 taken')
H(Bb, t='tbin', s=SB, n=500, tx=tx('b1'))
check(H(Bb, t='tbsit', s=SB, p=3).get('err') == 'taken' and H(Bb, t='tbsit', s=SB, p=5)['spot'] == 5, 'a taken spot is refused; spot 5 is free')
check(H(A, t='tbsit', s=SA, p=4).get('err') == 'seated', 'one spot a sitting')
# ---- 2. the dice table: betting opens with a seal; bets; the roll follows from the secret
tick(); T = table('cd1'); check(T['phase'] == 'bet' and T['round'] == 1 and len(T['sec']) == 64, 'the dice table opens betting (round 1)')
pub = [o for o in bank.OUTQ if o.get('t') == 'tbs' and o['tbl'] == 'cd1'][-1]
check(pub['h'] == hashlib.sha256(T['sec'].encode()).hexdigest() and 'sec' not in json.dumps(pub), 'everyone gets the seal (the hash), never the secret, while betting is open')
r = word(A, SA, 'tbbet', r=1, k='pass', n=10); check(r['credit'] == 990 and not r.get('err'), 'Pass Line 10: credit 990')
check(H(A, t='tbbet', s=SA, q=Q[SA], r=1, k='pass', n=10) == r, 'the same word again: the same answer, counted once')
check(H(A, t='tbbet', s=SA, q=Q[SA] + 5, r=1, k='pass', n=10)['err'] == 'order', 'out of order: refused')
check(word(A, SA, 'tbbet', r=1, k='come', n=5)['err'].startswith('Come takes bets once'), "the rules refuse a Come bet on the come-out (the game's own words)")
check(word(A, SA, 'tbbet', r=1, k='field', n=5000)['err'] == 'Not enough credit for that bet.', 'more than the credit: refused')
check(word(A, SA, 'tbbet', r=2, k='field', n=5)['err'] == 'round', 'a bet for another round: refused')
word(A, SA, 'tbbet', r=1, k='field', n=20); word(Bb, SB, 'tbbet', r=1, k='dp', n=30)
check(sit(SA)['credit'] == 970 and sit(SB)['credit'] == 470, 'both players bet: 970 and 470 left')
expire('cd1'); sec = table('cd1')['sec']; tick(); T = table('cd1'); st = state('cd1'); last = st['last']
mac = hmac.new(sec.encode(), b'cd1:1', hashlib.sha256).digest(); want = [1 + b % 6 for b in mac if b < 252][:2]
check(last['dice'] == want and last['sec'] == sec and T['phase'] == 'show', 'the roll is HMAC(secret, cd1:1) through the rules, revealed with it: %s' % last['dice'])
t_ = sum(want)
ex_a = (20 + 20 * (2 if t_ in (2, 12) else 1) if t_ in (2, 3, 4, 9, 10, 11, 12) else 0) + (20 if t_ in (7, 11) else 0)
ex_b = (60 if t_ in (2, 3) else 30 if t_ == 12 else 0)
check(last['pay'].get(SA, 0) == ex_a and last['pay'].get(SB, 0) == ex_b, 'one roll for both: %d pays A %d, B %d' % (t_, ex_a, ex_b))
check(sit(SA)['credit'] == 970 + ex_a and books(SA) and books(SB), 'the pay lands in the credit; the books hold')
check(word(A, SA, 'tbbet', r=1, k='field', n=5)['err'] == 'closed for bets', 'no bets while the dice show')
expire('cd1'); tick(); check(table('cd1')['phase'] == 'bet' and table('cd1')['round'] == 2 and table('cd1')['sec'] != sec, 'after the show, round 2 opens with a new secret')
# ---- 3. the wheel
H(Cc, t='tbin', s=SC, n=300, tx=tx('c1')); H(Cc, t='tbsit', s=SC, p=1); tick()
check(table('cw1')['phase'] == 'bet', 'the wheel opens betting')
check(word(Cc, SC, 'tbbet', r=1, k='sp:3-4', n=5)['err'] == 'There is no such bet.', 'a bet the felt has not got: refused')
word(Cc, SC, 'tbbet', r=1, k='red:', n=50); word(Cc, SC, 'tbbet', r=1, k='s:17', n=10); r = word(Cc, SC, 'tbtake', r=1, k='s:17')
check(r['credit'] == 250, 'a bet comes back before the spin (take): credit 250')
expire('cw1'); sec = table('cw1')['sec']; tick(); last = state('cw1')['last']
mac = hmac.new(sec.encode(), b'cw1:1', hashlib.sha256).digest(); pock = next((mac[i] * 256 + mac[i + 1]) % 37 for i in range(0, 32, 2) if mac[i] * 256 + mac[i + 1] < 65527)
reds = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
check(last['n'] == pock and last['pay'].get(SC, 0) == (100 if pock in reds else 0) and books(SC), 'the pocket is HMAC(secret, cw1:1): %d, red pays %d' % (pock, last['pay'].get(SC, 0)))
# ---- 4. twenty-one: two spots, insurance, turns, the clock stands a spot that does not answer
S1, S2 = 'tb:cb1:00001111aaaa', 'tb:cb1:00002222bbbb'
H(A, t='tbin', s=S1, n=1000, tx=tx('a2')); H(A, t='tbsit', s=S1, p=2); H(Bb, t='tbin', s=S2, n=1000, tx=tx('b2')); H(Bb, t='tbsit', s=S2, p=4)
tick(); check(table('cb1')['phase'] == 'bet', 'the twenty-one table opens betting')
check(word(A, S1, 'tbbet', r=1, k='main', n=15)['err'].startswith('Bets here are even'), 'an odd bet is refused (whole GOLD on a blackjack)')
word(A, S1, 'tbbet', r=1, k='main', n=20); word(Bb, S2, 'tbbet', r=1, k='main', n=40)
hands = 0; stood = 0
for rnd in range(1, 40):
    T = table('cb1')
    if T['phase'] != 'bet': expire('cb1'); tick(); T = table('cb1')
    if T['phase'] == 'bet' and rnd > 1: word(A, S1, 'tbbet', r=T['round'], k='main', n=20); word(Bb, S2, 'tbbet', r=T['round'], k='main', n=40)
    expire('cb1'); tick()
    for g in range(30):
        T = table('cb1'); st = state('cb1'); R = st.get('R')
        if T['phase'] == 'insurance': word(A, S1, 'tbins', r=T['round'], y=1); word(Bb, S2, 'tbins', r=T['round'], y=0); continue
        if T['phase'] == 'play':
            if R['turn'] == S2: expire('cb1'); tick(); stood += 1; continue   # B never answers: the clock stands B
            h = R['spots'][S1]['hands'][R['spots'][S1]['cur']]; tot = sum(min(10, 'A23456789TJQK'.index(x[0]) + 1) for x in h['cards'])
            word(A, S1, 'tbact', r=T['round'], a='hit' if tot < 12 else 'stand'); continue
        break
    if table('cb1')['phase'] == 'show': hands += 1
    check(books(S1) and books(S2), 'round %d: the books hold (A %d, B %d)' % (T['round'], sit(S1)['credit'], sit(S2)['credit'])) if rnd % 13 == 0 else None
check(hands >= 30 and stood >= 10, '%d hands played; the clock stood B %d times' % (hands, stood))
st = state('cb1'); check(len(st['shoe']) == 312 and st['pos'] > 0, 'six decks in the shoe, %d cards dealt' % st['pos'])
# ---- 5. leaving with a bet still working, then the cash-out
T = table('cd1')
if T['phase'] != 'bet': expire('cd1'); tick()
rd = table('cd1')['round']; word(A, SA, 'tbbet', r=rd, k='pass', n=10); word(A, SA, 'tbbet', r=rd, k='field', n=5)
for _ in range(50):   # roll until a point is on, so the Pass Line is a contract
    expire('cd1'); tick(); T = table('cd1')
    if T['phase'] == 'show' and state('cd1')['point'] and state('cd1')['seats'].get(SA, {}).get('bets', {}).get('pass'): break
    if T['phase'] == 'show': expire('cd1'); tick(); rd = table('cd1')['round']; word(A, SA, 'tbbet', r=rd, k='pass', n=10)
expire('cd1'); tick(); check(table('cd1')['phase'] == 'bet' and state('cd1')['point'] > 0, 'the point is on (%d) with A on the Pass Line' % state('cd1')['point'])
word(A, SA, 'tbbet', r=table('cd1')['round'], k='place6', n=6)
r = H(A, t='tbout', s=SA); check(r['st'] == 'closing' and 'still working' in (r.get('note') or ''), 'cash out with a contract bet: closing, "still working": %s' % r.get('note'))
check(not c.execute("select 1 from jobs where req=?", ('tb:' + SA,)).fetchone(), 'nothing is paid while the bet works')
check(not state('cd1')['seats'][SA]['bets'].get('place6'), 'the place bet came straight down (credit back)')
for _ in range(200):
    if not TB.felt_of('dice', state('cd1'), SA): break
    expire('cd1'); tick()
check(not TB.felt_of('dice', state('cd1'), SA), 'the table kept rolling until the Pass Line was settled')
chain(tx('a1'), A, 1000); tick(); r = sit(SA)
paid = sum(x['units'] for x in c.execute("select units from jobs where req=?", ('tb:' + SA,)))
check(r['st'] == 'paid' and r['spot'] is None and paid == r['paid'] and books(SA), 'then the credit goes home (%d), the spot is free' % paid)
TB.tb_pay(c); check(sum(x['units'] for x in c.execute("select units from jobs where req=?", ('tb:' + SA,))) == paid, 'paid once')
# ---- 6. a cash-out waits for the chain to show the deposit
SD = 'tb:cw1:00004444dddd'; H(Cc, t='tbin', s=SD, n=77, tx=tx('d1')); H(Cc, t='tbsit', s=SD, p=2); r = H(Cc, t='tbout', s=SD)
check(r['st'] == 'closing' and not c.execute("select 1 from jobs where req=?", ('tb:' + SD,)).fetchone(), 'cash-out before the chain shows the deposit: nothing paid yet')
chain(tx('d1'), Cc, 77); tick(); check(sit(SD)['st'] == 'paid', 'once it shows: paid')
# ---- 7. a sitting gone quiet with nothing on the felt is cashed out
c.execute('update tb set last=0 where s=?', (SC,)); c.commit(); TB.SEEN.pop(SC, None); TB.ROOM['up'] = 0; chain(tx('c1'), Cc, 300); tick()
for _ in range(5):
    if sit(SC)['st'] == 'paid': break
    expire('cw1'); tick()
check(sit(SC)['st'] == 'paid' and books(SC), 'gone quiet: cashed out and paid (%d)' % (sit(SC)['paid'] or 0))
# ---- 8. a long random run at all four tables: every sitting's books hold after every step
rng = random.Random(5); people = []
for i, tbl in enumerate(['cd1', 'cd1', 'cb1', 'cw1', 'cw1', 'cb2', 'cb2', 'cd1']):
    a = 'nRAND%04d' % i; s = 'tb:%s:%016x' % (tbl, i + 99); H(a, t='tbin', s=s, n=5000, tx=tx(s)); H(a, t='tbsit', s=s, p=6 - (i % 3)); people.append((a, s, tbl))
WK = {'cd1': ['pass', 'dp', 'odds', 'come', 'dc', 'field', 'big6', 'big8', 'any7', 'hard8', 'place6', 'place9', 'codds6'], 'cw1': ['red:', 'black:', 's:0', 's:17', 'doz:2', 'col:3', 'co:1-2-4-5', 'sl:4-5-6-7-8-9']}
bad = 0; steps = 0
for step in range(1500):
    a, s, tbl = rng.choice(people); T = table(tbl)
    if T['phase'] == 'bet':
        if tbl.startswith('cb'): word(a, s, 'tbbet', r=T['round'], k='main', n=rng.choice([2, 10, 20, 50]))
        else: word(a, s, 'tbbet', r=T['round'], k=rng.choice(WK[tbl]), n=rng.choice([1, 5, 6, 25]))
        if rng.random() < 0.1: word(a, s, 'tbclear', r=T['round'])
    elif T['phase'] == 'insurance': word(a, s, 'tbins', r=T['round'], y=rng.random() < 0.3)
    elif T['phase'] == 'play': word(a, s, 'tbact', r=T['round'], a=rng.choice(['hit', 'stand', 'double', 'split', 'surrender', 'stand']))
    if rng.random() < 0.25: expire(rng.choice(['cd1', 'cb1', 'cw1', 'cb2']))
    tick(); steps += 1
    for _, s2, _ in people:
        if not books(s2) or sit(s2)['credit'] < 0: bad += 1
check(not bad, '%d random steps at four tables: every sitting\'s books hold, no credit below zero' % steps)
rounds = c.execute('select tbl, count(*) n from tbres group by tbl').fetchall()
check(all(r['n'] > 5 for r in rounds) and len(rounds) == 4, 'rounds played at every table: %s' % {r['tbl']: r['n'] for r in rounds})
house = sum(int(sit(s)['bet']) - int(sit(s)['won']) for _, s, _ in people); felt = sum(TB.felt_of(TB.TABLES[tbl], state(tbl), s) for _, s, tbl in people)
print('     house result over the random run: %d GOLD (with %d still on the felt)' % (house - felt, felt))
print('ALL OK' if not fails else '%d FAILED' % len(fails))
TB.WORKER.p and TB.WORKER.p.kill()
sys.exit(1 if fails else 0)
