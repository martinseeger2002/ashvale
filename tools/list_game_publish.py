"""list_game_publish.py <game json> <cover id> - the Games-tab card, inscribed through arcade-publish (the node's RPC, no
offer, no browser; 2026-10-11). Same card as list_game_pw.py: a tiny HTML page with {"game": {...}} beside it,
"cover" = an existing cover inscription. Env: ASH_PUBLISH (arcade checkout), ASH_RPC_URL, ASH_RPC_COOKIE, ASH_PUBLISH_KEY.
Writes <dir>/listing_ids.json once the arcade lists the card (read-only /r/inscriptions)."""
import sys, os, json, time, html, urllib.request
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ['ASH_PUBLISH'])
from arcade import publish as PUB
from arcade.config import TESTNET, RpcCredentials
from arcade.rpc import RpcClient
APP = 'https://app.dogecoinarcade.com'
gj, cover = os.path.abspath(sys.argv[1]), sys.argv[2]
G = json.load(open(gj)); g = G['game']; g['cover'] = cover
card = os.path.join(os.path.dirname(gj), 'card.html')
open(card, 'w').write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    '<title>' + html.escape(g['name']) + '</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a16;'
    'font:16px system-ui,sans-serif;color:#eee}a{color:#ffd23f;font-size:20px}</style>'
    '<p><a href="/content/' + g['play'] + '">Play ' + html.escape(g['name']) + '</a></p><!-- ' + html.escape(g['version']) + ' -->')
# [Claude 2026-10-11] the version is in the page bytes: arcade-publish journals by the CONTENT's sha256 alone, so a card whose
# HTML matched the last one came back as the old inscription (0.8.87's card "tx" was 0.8.86's id) - never inscribed.
J = json.dumps(G)
url = os.environ.get('ASH_RPC_URL', 'http://127.0.0.1:44873'); host, _, port = url.rpartition('://')[2].rstrip('/').partition(':')
user, _, pw = open(os.environ['ASH_RPC_COOKIE']).read().strip().partition(':')
with RpcClient(RpcCredentials(host or '127.0.0.1', int(port or TESTNET.rpc_port), user, pw), timeout=600) as rpc:
    P = PUB.Publisher(rpc, TESTNET, PUB.Key.from_file(os.environ['ASH_PUBLISH_KEY']), os.path.join(HERE, 'chain', 'publish'))
    r = P.inscribe(open(card, 'rb').read(), 'text/html', J, os.path.basename(card))
print('card tx', r.get('id'), flush=True)
addr = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
for _ in range(40):
    time.sleep(30)
    L = json.load(urllib.request.urlopen(APP + '/r/inscriptions/' + addr + '?limit=60', timeout=60))
    hit = [x for x in L if (x.get('json') or {}).get('game', {}).get('version') == g['version'] and (x.get('json') or {}).get('game', {}).get('play') == g['play']]
    if hit:
        ids = {'cover': cover, 'card': hit[0]['id']}; json.dump(ids, open(os.path.join(os.path.dirname(gj), 'listing_ids.json'), 'w'), indent=1)
        print('CARD', hit[0]['id'], 'version', g['version']); break
else: print('card not listed yet - check /r/inscriptions later')
