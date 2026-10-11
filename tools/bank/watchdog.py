"""ASHVALE Bank watchdog (Claude -> a tester, 2026-10-10: "The Bank was deaf for 20 h last night while
`systemctl is-active` said active - that is what this catches"). Run by ashvale-bank-watchdog.timer every 10 min.

Deaf, by Claude's rule, is either:
  - the last 'BANK OPEN' or 'GROUND?' line in chain/bank/bank.log is older than 20 minutes (nothing has answered
    a player recently), or
  - the last 10 lines of that log are all 'ROOM DOWN' (the process is up and its room connection is not; bank.py
    logged that every 30 s from 20:50 until the operator restarted it at 18:09 today).
Then: systemctl --user restart ashvale-bank, at most once an hour, and a line in chain/bank/watchdog.log.

  python3 tools/bank/watchdog.py [--dry-run]      --dry-run assesses and prints, and restarts nothing
"""
import os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
# the two paths, so a test can point them at a scratch log instead of the live one
LOG = os.environ.get('ASHVALE_BANK_LOG') or os.path.join(HERE, '..', '..', 'chain', 'bank', 'bank.log')
WATCH = os.environ.get('ASHVALE_WATCHDOG_LOG') or os.path.join(HERE, '..', '..', 'chain', 'bank', 'watchdog.log')
SERVICE = 'ashvale-bank'
STALE = 20 * 60        # minutes since the last answer that means it is deaf
MIN_GAP = 60 * 60      # and never restart it more than once an hour
ALIVE = ('BANK OPEN', 'GROUND?')   # lines that only appear when the Bank actually talked to someone
DOWN = 'ROOM DOWN'     # up, and answering nothing
TS = re.compile(r'^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) (.*)$')


def tail(path, cap=400000):
    """the last lines of a log that grows ~2.5 MB a day and holds the odd non-UTF-8 byte"""
    if not os.path.exists(path):
        return []
    with open(path, 'rb') as f:
        f.seek(0, os.SEEK_END)
        f.seek(max(0, f.tell() - cap))
        blob = f.read()
    return blob.decode('utf-8', 'replace').splitlines()


def stamp(line):
    m = TS.match(line)
    if not m:
        return None
    return time.mktime(time.strptime(m.group(1), '%Y-%m-%d %H:%M:%S')), m.group(2)


def assess():
    """(why it is deaf, or None if the Bank answers)"""
    rows = [r for r in (stamp(l) for l in tail(LOG)) if r]
    if not rows:
        return 'no readable lines in bank.log'
    now = time.time()
    last = [(t, s) for (t, s) in rows if s.startswith(ALIVE)]
    if not last:
        return 'no %s line in the part of bank.log I can read' % '/'.join(ALIVE)
    age = now - last[-1][0]
    if age > STALE:
        return 'nothing has answered a player for %.0f min (last %s at %s)' % (
            age / 60, last[-1][1].split()[0], time.strftime('%H:%M:%S', time.localtime(last[-1][0])))
    if len(rows) >= 10 and all(s.startswith(DOWN) for (t, s) in rows[-10:]):
        return 'the last 10 lines are all %s (up, but not hearing the room)' % DOWN
    return None


def last_restart():
    rows = [time.mktime(time.strptime(m.group(1), '%Y-%m-%d %H:%M:%S'))
            for l in tail(WATCH) for m in [TS.match(l)] if m and 'restart ' in l]
    return max(rows) if rows else 0.0


def note(msg):
    os.makedirs(os.path.dirname(WATCH), exist_ok=True)
    with open(WATCH, 'a') as f:
        f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + msg + '\n')


def main():
    dry = '--dry-run' in sys.argv
    why = assess()
    if why is None:
        note('ok')
        print('ok: the Bank answers', flush=True)
        return 0
    since = time.time() - last_restart()
    if since < MIN_GAP:
        note('deaf: %s - no restart, the last one was %.0f min ago' % (why, since / 60))
        print('deaf (%s) but %d min since the last restart: leaving it' % (why, since // 60), flush=True)
        return 0
    if dry:
        note('deaf: %s - dry run, restarted nothing' % why)
        print('DRY RUN would restart %s: %s' % (SERVICE, why), flush=True)
        return 0
    r = subprocess.run(['systemctl', '--user', 'restart', SERVICE], capture_output=True, text=True, timeout=120)
    note('restart %s: %s (exit %d)' % (SERVICE, why, r.returncode))
    print('restarted %s: %s%s' % (SERVICE, why, (' stderr ' + r.stderr.strip()[:200]) if r.returncode else ''), flush=True)
    return 0 if r.returncode == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
