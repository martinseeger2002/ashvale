"""[Claude 2026-10-22] the Bank never sits alive but paying nothing (2026-10-22 13:49: the payout thread died at start, silently, and
the room stayed up for 3.5 h). Checks: rpc_wallet.tag_address asks again when the arcade's lookup fails and refuses only on a real
answer; bank.vital exits the process (so systemd restarts it) when a vital thread ends for any reason while the Bank is meant to run,
lets a payout being sent finish first, and leaves a clean stop alone; main starts the payouts and the tables' clock through vital.
python3 tests/bank_vital_test.py   (BANK_DIR=... for another bank checkout)"""
import os, sys, tempfile, threading, time, urllib.error
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BD = os.environ.get('BANK_DIR') or os.path.join(HERE, 'tools', 'bank')
sys.path.insert(0, BD)
import bank, rpc_wallet
fails = []
def check(ok, m): print(('ok   ' if ok else 'FAIL ') + m); ok or fails.append(m)
tmp = tempfile.mkdtemp(); bank.LOG = os.path.join(tmp, 'b.log')
if not hasattr(rpc_wallet, 'tag_address') or not hasattr(bank, 'vital'):
    print('FAIL this checkout has no tag_address / vital (vital.patch not applied)'); sys.exit(1)
ASH = rpc_wallet.ASHVALE
# ---- 1. the tag lookup
def fake(answers):
    q = list(answers)
    def get(path, timeout=60):
        a = q.pop(0)
        if isinstance(a, Exception): raise a
        return a
    return get
slept = []
rpc_wallet._get = fake([urllib.error.URLError('Connection refused'), {'error': 'restarting'}, {'tag': 'ashvale', 'address': ASH}])
check(rpc_wallet.tag_address(tries=5, wait=15, sleep=slept.append) == ASH and slept == [15, 15], 'the arcade restarting: asked again twice, then @ashvale (no refusal)')
slept = []
rpc_wallet._get = fake([{'tag': 'ashvale', 'address': 'nSomeoneElse000000000000000000000'}])
check(rpc_wallet.tag_address(tries=5, sleep=slept.append) == 'nSomeoneElse000000000000000000000' and not slept, 'a real answer naming another address comes back at once (the wallet still refuses it)')
slept = []
rpc_wallet._get = fake([TimeoutError('timed out')] * 3)
check(rpc_wallet.tag_address(tries=3, wait=1, sleep=slept.append) is None and len(slept) == 2, 'never answered: None after every try (the wallet refuses, the Bank exits and systemd tries again)')
# ---- 2. vital
def run_vital(fn, stop, deliver=None):
    codes = []; bank.DELIVER_T = deliver
    th = threading.Thread(target=bank.vital, args=('test', fn, stop), kwargs={'exit': codes.append}); th.start(); th.join(10)
    return codes
def dies(stop): raise SystemExit('REFUSING: the key is not @ashvale\'s')
stop = threading.Event(); codes = run_vital(dies, stop)
log = open(bank.LOG).read() if os.path.exists(bank.LOG) else ''
check(codes == [3] and stop.is_set() and 'VITAL THREAD STOPPED test' in log and 'REFUSING' in log, 'a SystemExit in a vital thread: logged, the Bank stops and exits (3)')
def boom(stop): raise RuntimeError('database disk image is malformed')
stop = threading.Event(); check(run_vital(boom, stop) == [3], 'an error in a vital thread: the Bank exits')
stop = threading.Event(); check(run_vital(lambda stop: None, stop) == [3], 'a vital thread that just returns while the Bank runs: the Bank exits')
stop = threading.Event()
def clean(stop): stop.set()
check(run_vital(clean, stop) == [], 'a clean stop (the Bank shutting down) is no failure: no exit')
# a payout being sent when the clock dies: the exit waits for it
done = []
def sending(stop):
    stop.wait(30); time.sleep(0.5); done.append(time.time())   # deliver_loop: ends at its next turn after stop, the send finished
d = threading.Thread(target=sending, args=(stop2 := threading.Event(),)); d.start()
t0 = time.time(); codes = []; bank.DELIVER_T = d
th = threading.Thread(target=bank.vital, args=('tables_clock', boom, stop2), kwargs={'exit': lambda n: codes.append((n, time.time()))}); th.start(); th.join(10)
check(codes and done and codes[0][0] == 3 and codes[0][1] >= done[0], 'the clock dies during a payout: the payout finishes first, then the Bank exits (%.1f s)' % (codes[0][1] - t0 if codes else -1))
bank.DELIVER_T = None
# ---- 3. main starts both vital threads through vital
src = open(os.path.join(BD, 'bank.py')).read()
check("target=vital, args=('deliver_loop', deliver_loop, stop)" in src and "target=vital, args=('tables_clock', tables_clock, stop, room)" in src, 'main starts the payouts and the tables\' clock through vital')
check('finally: stop.set(); t.join(120)' in src, 'the process waits for a payout being sent before it ends')
print('ALL OK' if not fails else '%d FAILED' % len(fails))
sys.exit(1 if fails else 0)
