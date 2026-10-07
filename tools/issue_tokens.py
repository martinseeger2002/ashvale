"""issue_tokens.py [--dry] - @ashvale issues ONE MANAGED, WHOLE-UNIT TOKEN PER STACKABLE ITEM through the standalone wallet
(tools/ashvale_wallet.py, no browser). 2026-10-04: gear = one NFT per item (minted on demand), every stackable
(resources, fish, meat, food, potions, arrows) = an @ashvale token; Gold stays GOLD #26. Replaces issue_resource_tokens.py.

Each token names its item the way the game reads it (src/engine.js classifyToken, src/wallet.js): category and
subcategory are the item's own, data = {"about": ..., "ashvale": {"id": <item id>}}.
Managed tokens: nothing exists until @ashvale grants supply (the Bank does that when a player earns or deposits).
Idempotent and resumable: ids are kept in chain/resource_tokens.json (the file tools/make_assets.py reads); re-run to
finish. Afterwards: python3 tools/make_assets.py"""
import sys, os, json, re, time, urllib.request
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, 'tools'))
OUT = os.path.join(HERE, 'chain', 'resource_tokens.json')
items = json.load(open(os.path.join(HERE, 'data', 'items.json')))['data']['items']
assets = json.load(open(os.path.join(HERE, 'data', 'assets.json')))['data']['items']
done = json.load(open(OUT)) if os.path.exists(OUT) else {}
XP = os.path.join(HERE, 'data', 'extra', 'assets.json')   # items kept in-game only (e.g. the Gift of Angels) get no token either
SKIP = set((json.load(open(XP)) if os.path.exists(XP) else {}).get('skip', []))
STACK = [(k, v) for k, v in items.items() if k != 'coins' and k not in SKIP and (assets.get(k) or {}).get('kind') != 'nft']
todo = [(k, v) for k, v in STACK if k not in done]
def tname(k, v): return ('ASHVALE ' + v.get('name', k)).upper()[:40]
print(len(STACK), 'stackable items,', len(done), 'already issued,', len(todo), 'to issue:', ', '.join(k for k, _ in todo), flush=True)
if '--dry' in sys.argv or not todo: sys.exit()

def listed():   # {NAME: id} off the public /tokens page (the id arrives with the block)
    h = urllib.request.urlopen('https://app.dogecoinarcade.com/tokens', timeout=60).read().decode('utf8', 'replace')
    return {m.group(2).strip().upper(): int(m.group(1)) for m in re.finditer(r'href="/tokens/(\d+)"><strong>([^<]*)', h)}
from ashvale_wallet import Wallet
W = Wallet()
for k, v in todo:
    if tname(k, v) in listed(): continue   # issued by an earlier run, not yet recorded
    data = {"about": (v.get('description') or v.get('name', k)) + ' From ASHVALE; tradable anywhere.', "ashvale": {"id": k}}
    try: r = W.token_create(tname(k, v), units='indivisible', category=v.get('category') or 'resource',
                            subcategory=v.get('subcategory') or v.get('category') or 'resource', data=json.dumps(data, separators=(',', ':')))
    except RuntimeError as e:   # the node allows 10 issuances an hour: record what went out, re-run in an hour
        if 'token issuances in an hour' in str(e): print('  hourly limit reached:', str(e)[-60:], flush=True); todo = todo[:todo.index((k, v))]; break
        raise
    print('  %-16s %s' % (k, (r or {}).get('txid') or r), flush=True); time.sleep(2)
for _ in range(40 if todo else 0):
    L = listed()
    for k, v in todo:
        if k not in done and tname(k, v) in L: done[k] = L[tname(k, v)]; print('  %-16s #%d' % (k, done[k]), flush=True)
    json.dump(done, open(OUT, 'w'), indent=1)
    if all(k in done for k, _ in todo): break
    time.sleep(30)
print('issued %d/%d. Next: python3 tools/make_assets.py' % (sum(1 for k, _ in STACK if k in done), len(STACK)), flush=True)
