#!/usr/bin/env python3
"""make_assets.py - writes data/assets.json: which on-chain asset every ASHVALE item is (2026-10-04: "tradable NFTs
as your inventory and tradable tokens as your Gold"; he chose gear as NFTs, resources as tokens, Gold as GOLD).

  gear (weapon, armour, tool, pack, cosmetic)  -> an NFT made by @ashvale whose JSON names the item:
                                                 the Armoury's attribute {"trait_type": "Key", "value": <item id>}
  resources (logs, ores, coal, bars, pelts, fish, mushrooms) -> one fungible token per item, issued by @ashvale
  GOLD                                          -> token #26
  everything else (food, potions, ammo)         -> stays an in-game stack

Token ids are filled in when the tokens are issued (chain/resource_tokens.json, written by the issuing step); until
then a resource maps to {"kind": "token", "propertyid": null} and the game simply shows none of it in the wallet.
Run after data/items.json changes:  python3 tools/make_assets.py
"""
import json, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
items = json.load(open(os.path.join(HERE, 'data', 'items.json')))['data']['items']
issued = {}
p = os.path.join(HERE, 'chain', 'resource_tokens.json')
if os.path.exists(p): issued = json.load(open(p))   # {item id: propertyid}
GEAR = ('weapon', 'armour', 'tool', 'pack', 'cosmetic', 'jewellery')   # jewellery: the hawk ring (2026-10-04)
out = {}
for k, v in items.items():
    c = v.get('category')
    if c in GEAR:
        n = v.get('nft') or {}
        out[k] = {"kind": "nft", "collection": v.get('collection') or 'ASHVALE Items', "key": n.get('key', k)}
        if n.get('copies'): out[k]["copies"] = n['copies']
    elif c == 'currency':
        out[k] = {"kind": "token", "propertyid": 26, "name": "ASHVALE GOLD"}
    else:   # every stackable (resources, fish, meat, food, potions, arrows) is a token (2026-10-04; tools/issue_tokens.py)
        out[k] = {"kind": "token", "propertyid": issued.get(k), "name": ('ASHVALE ' + v.get('name', k)).upper()[:40]}
data = {"issuer": "nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c", "gold": 26, "items": out,
        "note": "2026-10-04: gear = one NFT per item (minted on demand by the @ashvale Bank), every stackable = an @ashvale token, Gold = GOLD #26"}
mod = {"ashvale3d": "module", "name": "assets", "api": 1, "v": 1, "data": data}
json.dump(mod, open(os.path.join(HERE, 'data', 'assets.json'), 'w'), separators=(',', ':'))
n = lambda kind: sum(1 for x in out.values() if x['kind'] == kind)
print('wrote data/assets.json: %d NFT gear kinds, %d token kinds (%d with ids)' % (n('nft'), n('token'), sum(1 for x in out.values() if x['kind'] == 'token' and x['propertyid'])))
