"""mint_rings.py FIRST LAST TO - inscribe Hawk rings #FIRST..#LAST as @ashvale (ASHVALE Armoury, Key ring_hawk, the same
picture as #1 with the copy number in a PNG text chunk so every piece is its own bytes) and send each to TO (a @tag or an
address). 2026-10-04: "make 18 more hawk rings and send them to @apple" -> python3 tools/mint_rings.py 3 20 @apple
Resumable: chain/rings/hawk_ring_<n>.result holds the inscription id and the send txid. Never prints @ashvale's secrets."""
import sys, os, json, time, hashlib, urllib.request
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, 'tools')); sys.path.insert(0, os.path.join(HERE, 'tools', 'bank'))
from ashvale_wallet import Wallet
from bank import png_with_text
APP, ASHVALE = 'https://app.dogecoinarcade.com', 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
D = os.path.join(HERE, 'chain', 'rings')
first, last, to = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
base = open(os.path.join(D, 'hawk_ring_1.png'), 'rb').read()
meta = json.load(open(os.path.join(D, 'hawk_ring_1.json')))
W = Wallet()
def listed(sha):
    L = json.load(urllib.request.urlopen(APP + '/r/inscriptions?creator=%s&limit=100' % ASHVALE, timeout=60))
    return next((p['id'] for p in L or [] if p.get('sha256') == sha), None)
todo = []
for n in range(first, last + 1):   # 1. inscribe every ring (they can share a block)
    res = os.path.join(D, 'hawk_ring_%d.result' % n)
    r = json.load(open(res)) if os.path.exists(res) else {}
    if r.get('sent'): continue
    png, js = os.path.join(D, 'hawk_ring_%d.png' % n), os.path.join(D, 'hawk_ring_%d.json' % n)
    if not os.path.exists(png): open(png, 'wb').write(png_with_text(base, 'ashvale', 'Hawk ring #%d' % n))
    j = dict(meta, name='Hawk ring #%d' % n, edition=n, attributes=[a for a in meta['attributes'] if a['trait_type'] != 'Copy'] + [{'trait_type': 'Copy', 'value': '%d of %d' % (n, last)}])
    json.dump(j, open(js, 'w'))
    sha = hashlib.sha256(open(png, 'rb').read()).hexdigest()
    if not r.get('id') and not listed(sha):
        W.inscribe(png, json.dumps(j, separators=(',', ':')), 'image/png'); print('inscribed #%d' % n, flush=True)
    todo.append((n, sha, res, r))
for n, sha, res, r in todo:   # 2. wait for each to be listed, then send it
    for _ in range(60):
        r['id'] = r.get('id') or listed(sha)
        if r['id']: break
        time.sleep(20)
    if not r.get('id'): print('#%d not listed yet: re-run later' % n, flush=True); continue
    json.dump(r, open(res, 'w'))
    for k in range(10):
        try: t = W.nft_send(r['id'], to); r['sent'] = (t or {}).get('txid') or True; break
        except RuntimeError as e: print('  send #%d waiting: %s' % (n, str(e)[:100]), flush=True); time.sleep(60)
    json.dump(r, open(res, 'w')); print('#%d %s -> %s %s' % (n, r['id'][:16], to, r.get('sent')), flush=True)
print('done', flush=True)
