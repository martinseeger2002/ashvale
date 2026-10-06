"""list_game_pw.py <game json> <cover id> [--chromium] - the Games-tab card, signed by the standalone @ashvale wallet
(tools/ashvale_wallet.py; --chromium: through the browser instead, tools/pw_send.py). Same card as list_game.py: a tiny HTML page with {"game": {...}} beside it,
"cover" = an existing cover inscription. Writes <dir>/listing_ids.json and reads the card back off the chain."""
import sys, os, json, time, html, urllib.request, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from pw_send import AshvaleBrowser, APP
gj, cover = os.path.abspath(sys.argv[1]), sys.argv[2]
G = json.load(open(gj)); g = G['game']; g['cover'] = cover
card = os.path.join(os.path.dirname(gj), 'card.html')
open(card, 'w').write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    '<title>' + html.escape(g['name']) + '</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a16;'
    'font:16px system-ui,sans-serif;color:#eee}a{color:#ffd23f;font-size:20px}</style>'
    '<p><a href="/content/' + g['play'] + '">Play ' + html.escape(g['name']) + '</a></p>')
J = json.dumps(G)
if '--chromium' in sys.argv:
    with AshvaleBrowser() as B: ok = B.send_only(card, J)
else:
    from ashvale_wallet import Wallet; r = Wallet().inscribe(card, J); ok = bool(r.get('id')); print('card tx', r.get('id'), flush=True)
print('sent' if ok else 'NOT SENT', flush=True)
if not ok: sys.exit(1)
addr = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
for _ in range(40):
    time.sleep(30)
    L = json.load(urllib.request.urlopen(APP + '/r/inscriptions/' + addr + '?limit=60', timeout=60))
    hit = [x for x in L if (x.get('json') or {}).get('game', {}).get('version') == g['version'] and (x.get('json') or {}).get('game', {}).get('play') == g['play']]
    if hit:
        ids = {'cover': cover, 'card': hit[0]['id']}; json.dump(ids, open(os.path.join(os.path.dirname(gj), 'listing_ids.json'), 'w'), indent=1)
        print('CARD', hit[0]['id'], 'version', g['version']); break
else: print('card not listed yet - check /r/inscriptions later')
