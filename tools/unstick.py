#!/home/you/cartoon-toolkit/ghost-devs/tools/venv/bin/python
"""A release that stops making progress usually means the page is holding an unfinished inscription job: a multi-piece
job that was never finished leaves pre-signed pieces behind, and later sends then wait for a block that never comes.
This shows @ashvale's unfinished jobs and, with --give-up, presses "Give up on it" on each one, which is what
tools/release_modular.py calls give_up() for but never actually calls. Run it with the ghost-devs venv python, with no
other browser using the ashvale profile."""
import json
import sys
import time

sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
from drvc import start, login, By            # noqa: E402
import resident as R                         # noqa: E402


def unfinished(d):
    raw = d.execute_script("return fetch('/account/inscribe/unfinished',{credentials:'same-origin'}).then(r=>r.text())") or '{}'
    return json.loads(raw).get('unfinished', [])


def show(tag, jobs):
    print(tag, len(jobs), flush=True)
    for j in jobs:
        print('   ', json.dumps({k: v for k, v in j.items() if k in
                                ('id', 'name', 'pieces', 'sent', 'pending', 'sha256', 'status', 'created', 'error')}), flush=True)


d = start('ashvale')
login(d, 'ashvale')
try:
    show('unfinished:', unfinished(d))
    if '--give-up' in sys.argv:
        for _ in range(10):
            d.get(R.APP + '/me/nfts')
            time.sleep(8)
            b = [x for x in d.find_elements(By.XPATH, "//button[contains(., 'Give up on it')]") if x.is_displayed()]
            if not b:
                break
            b[0].click()
            time.sleep(3)
            R.confirm_card(d)
            time.sleep(2)
        d.get(R.APP + '/me/nfts')
        time.sleep(6)
        show('after:', unfinished(d))
finally:
    d.quit()
