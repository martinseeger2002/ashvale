"""pip_inscribe.py <absolute file> <key> - @pip inscribes one file for ASHVALE 3D / the arcade's shared libraries and records
the id in ~/ashvale3d/chain/ids.json (idempotent: skips keys already recorded). Same flow as ~/racecondition/rc_chain.py.
Only after the operator's OK (PLAN.md release gate); shared libraries (three.js) were OK'd by 2026-10-01."""
import sys, os, json
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
import resident as R
from drvc import start, login
IDS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'chain', 'ids.json')
ids = json.load(open(IDS)) if os.path.exists(IDS) else {}
path, key = sys.argv[1], sys.argv[2]
if ids.get(key): print(key, 'already', ids[key]); sys.exit()
d = start('pip'); login(d, 'pip')
try:
    iid = R.inscribe_here(d, path); print(key.upper(), iid, flush=True)
    if iid: ids[key] = iid; json.dump(ids, open(IDS, 'w'), indent=1)
finally: d.quit()
