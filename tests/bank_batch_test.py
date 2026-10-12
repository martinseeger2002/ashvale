"""The Bank's delivery queue (handoff/bank_rpc_plan.md 3b.1, 7): one send per (address, item) for tokens, NFTs one by one,
the journal written before a send and replayed on start - a send journaled but never confirmed is HELD, never resent.
Runs against a temporary database with a fake deliverer; no wallet, no browser, no chain."""
import os, sys, json, time, tempfile, sqlite3
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.join(HERE, 'tools', 'bank')); sys.path.insert(0, os.path.join(HERE, 'tools'))
tmp = tempfile.mkdtemp(); os.environ['BANK_DB'] = os.path.join(tmp, 'bank.sqlite')
import bank
bank.DB = os.path.join(tmp, 'bank.sqlite'); bank.SENT = os.path.join(tmp, 'sent.jsonl')
fails = 0
def ok(c, m):
    global fails
    print(('ok   ' if c else 'FAIL ') + m); fails += 0 if c else 1
c = bank.db()
A, B = 'nAAA', 'nBBB'
for i in range(6): c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,?,?,?,?)", (A, 'coins', 10 + i, 'token', 'queued', time.time() - 10 + i, 'r%d' % i))
c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,?,?,?,?)", (A, 'dagger_t1', 1, 'nft', 'queued', time.time(), 'r9'))
c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,?,?,?,?)", (B, 'coins', 5, 'token', 'queued', time.time(), 'r10'))
c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,?,?,?,?)", (A, 'coins', 7, 'token', 'retry', time.time() + 3600, 'r11'))   # not ready yet
c.commit()
job, ids = bank.take_batch(c)
ok(job and job['addr'] == A and job['item'] == 'coins' and job['units'] == sum(range(10, 16)) and len(ids) == 6, 'six GOLD jobs of one address become one send of %s units (%d jobs)' % (job and job['units'], len(ids)))
ok(all(c.execute('select status from jobs where n=?', (n,)).fetchone()[0] == 'queued' for n in ids), 'nothing is marked before the send')
# a fake deliverer: records what it was asked, answers a txid
sent = []
class FakeD:
    def run_one(self, c, job): sent.append((job['addr'], job['item'], job['units'])); return 'tx%d' % len(sent), None
bank.Deliverer = lambda: FakeD()
import threading
stop = threading.Event()
def run_for(seconds):
    t = threading.Thread(target=bank.deliver_loop, args=(stop,), daemon=True); t.start(); time.sleep(seconds); stop.set(); t.join(5); stop.clear()
run_for(4)
done = [dict(r) for r in c.execute("select addr, item, units, status, txid from jobs where status='done' order by n")]
ok(len(sent) == 3 and sent[0] == (A, 'coins', 75) and (A, 'dagger_t1', 1) in sent and (B, 'coins', 5) in sent, 'three sends: the GOLD batch, the dagger, the other player (%s)' % sent)
ok(len(done) == 8 and len({d['txid'] for d in done if d['addr'] == A and d['item'] == 'coins'}) == 1, 'all eight ready jobs are done, the six GOLD ones under one txid')
ok(c.execute("select status from jobs where req='r11'").fetchone()[0] == 'retry', 'the job whose retry time has not come waits')
lines = [json.loads(l) for l in open(bank.SENT)]
ok(len(lines) == 6 and [l['st'] for l in lines] == ['sending', 'sent'] * 3, 'the journal has sending/sent pairs, written in order')
# a crash between the journal and the broadcast: on replay those jobs are HELD, never resent
c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,?,?,?,?)", (B, 'coins', 9, 'token', 'queued', time.time(), 'r12')); c.commit()
n = c.execute("select n from jobs where req='r12'").fetchone()[0]
bank.journal({'st': 'sending', 'k': 'crash', 'ids': [n], 'addr': B, 'item': 'coins', 'units': 9, 'at': time.time()})
bank.replay_journal(c)
ok(c.execute("select status from jobs where n=?", (n,)).fetchone()[0] == 'held', 'a send journaled but never confirmed is HELD on replay, not resent')
sent.clear(); run_for(3)
ok(not sent, 'a held job is not delivered by itself')
# a 'sent' whose rows were not updated (crash after the broadcast): marked done with its txid
c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,?,?,?,?)", (B, 'coins', 2, 'token', 'queued', time.time(), 'r13')); c.commit()
n2 = c.execute("select n from jobs where req='r13'").fetchone()[0]
bank.journal({'st': 'sending', 'k': 'late', 'ids': [n2], 'at': time.time()}); bank.journal({'st': 'sent', 'k': 'late', 'ids': [n2], 'txid': 'txlate', 'at': time.time()})
bank.replay_journal(c)
r = c.execute("select status, txid from jobs where n=?", (n2,)).fetchone()
ok(r['status'] == 'done' and r['txid'] == 'txlate', 'a broadcast whose rows were never marked is marked done from the journal')
# the batch cap holds a too-big send for a human
c.execute("insert into jobs(addr,item,units,kind,status,at,req) values(?,?,?,?,?,?,?)", (B, 'coins', 50000, 'token', 'queued', time.time(), 'r14')); c.commit()
sent.clear(); run_for(3)
ok(not sent and c.execute("select status from jobs where req='r14'").fetchone()[0] == 'held', 'a send over the batch cap is held, not sent')
print('all ok' if not fails else '%d FAIL' % fails); sys.exit(1 if fails else 0)
