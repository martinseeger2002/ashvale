"""pools3d.py plan|judge|grant|pools|data - ASHVALE 3D's prize pools (plan phase D, 2026-10-04: "tradable NFTs as
your inventory and tradable tokens as your Gold"; "The game should never ask permission ... It should just happen
automatically"). Modelled on the 2D game's ~/ashvale/ash_pools.py; state in chain/pools3d.json (resumable, idempotent).

  plan    print the pools it would make (no browser)
  judge   build the lighter judge (tools/judge3d_build.py) and inscribe it as @ashvale (once)
  grant   @ashvale grants itself the token supply the pools stand on (XP tokens 20-25, GOLD 26, resource tokens)
  pools   inscribes every pool JSON not made yet, each bound to the 3D game page and refereed by the judge
  data    writes data/pools.json (module "pools"): what the engine's automatic claimer reads

Every pool pays in BINARY LOTS (unit << bit): a settled 10-minute window that earned 70 attack XP wins the 10, 20 and 40
pools (70 = 1000110b / 10 ... see judge3d_tail.js bitOf), so a set of pools pays any amount exactly. Only the six combat
skills have XP tokens (20-25, shared with the 2D game); resource pools exist once tools/issue_resource_tokens.py has
issued the tokens (chain/resource_tokens.json). Gear drops (NFT pools) come later, from Armoury copies @ashvale holds.
Run with the ghost-devs venv python, AFTER any other @ashvale browser job (same profile)."""
import sys, os, json, time, secrets, subprocess, urllib.request
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
APP = 'https://app.dogecoinarcade.com'
STF = os.path.join(HERE, 'chain', 'pools3d.json')
st = json.load(open(STF)) if os.path.exists(STF) else {}
def save(): json.dump(st, open(STF, 'w'), indent=1)
listing = json.load(open(os.path.join(HERE, 'listing_v084', 'game.json')))['game']
st.setdefault('page', listing['play'])   # the 3D launcher: claims come from this page
XPT = {'attack': 20, 'strength': 21, 'defence': 22, 'ranged': 23, 'magic': 24, 'hitpoints': 25}   # = ~/ashvale/config.json xpTokens
GOLD = 26
XP_UNIT, XP_BITS = 10, range(7)        # 10 .. 640 XP a window per skill
GOLD_UNIT, GOLD_BITS = 5, range(6)     # 5 .. 160 GOLD a window
RES_UNIT, RES_BITS = 1, range(6)       # 1 .. 32 of a resource a window
LOTS = 25
RT = os.path.join(HERE, 'chain', 'resource_tokens.json')
RES = json.load(open(RT)) if os.path.exists(RT) else {}
if 'phrase' not in st: st['phrase'] = 'ashvale3d-' + secrets.token_hex(12); save()

def num(iid): return json.load(urllib.request.urlopen(APP + '/r/inscription/' + iid, timeout=30))['number']

def referee(params):
    return {'judge': '#' + str(st['judge_number']), 'require': {'won': True}, 'seed_hours': 2,
            'params': dict(params, xpTokens=XPT),
            'facts': {'tokens': list(XPT.values()), 'collections': [{'creator': 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c', 'collection': 'ASHVALE Armoury'}]}}

def plan():
    game = '#' + str(st.get('page_number', '?')); out = []
    def token_pool(key, label, meta, token, lot):
        return {'key': key, 'label': label, 'meta': meta, 'token': token, 'amount': lot * LOTS,
                'json': {'name': 'ASHVALE 3D ' + label, 'prizepool': {'token': token, 'lot': str(lot), 'lots': LOTS, 'price': '0.01', 'game': game,
                         'phrase': st['phrase'], 'referee': referee(meta) if st.get('judge_number') else None}}}
    for sk, tok in XPT.items():
        for b in XP_BITS: out.append(token_pool('xp_%s_%d' % (sk, b), '%d %s XP' % (XP_UNIT << b, sk), {'kind': 'xp', 'skill': sk, 'bit': b, 'unit': XP_UNIT}, tok, XP_UNIT << b))
    for b in GOLD_BITS: out.append(token_pool('gold_%d' % b, '%d GOLD' % (GOLD_UNIT << b), {'kind': 'gold', 'bit': b, 'unit': GOLD_UNIT}, GOLD, GOLD_UNIT << b))
    for item, tok in sorted(RES.items()):
        for b in RES_BITS: out.append(token_pool('res_%s_%d' % (item, b), '%d %s' % (RES_UNIT << b, item), {'kind': 'resource', 'item': item, 'bit': b, 'unit': RES_UNIT}, tok, RES_UNIT << b))
    return out

def judge(d):
    if st.get('judge'): print('judge already', st['judge']); return
    import resident as R
    out = os.path.join(HERE, 'chain', 'judge3d.js')
    subprocess.run([sys.executable, os.path.join(HERE, 'tools', 'judge3d_build.py'), 'build', out], check=True)
    iid = R.inscribe_here(d, out); print('JUDGE', iid, flush=True)
    if iid: st['judge'] = iid; save()

def grant(d):
    from drvc import By
    need = {}
    for P in plan(): need[P['token']] = need.get(P['token'], 0) + P['amount']
    for tok, amt in sorted(need.items()):
        if st.get('granted', {}).get(str(tok)): continue
        d.get('%s/tokens/%s' % (APP, tok)); time.sleep(10)
        d.find_element(By.ID, 'grant-amount').send_keys(str(amt)); d.find_element(By.ID, 'grant-to').send_keys('ashvale'); d.find_element(By.ID, 'grant-go').click(); time.sleep(4)
        dl = [x for x in d.find_elements(By.XPATH, "//dialog|//*[@role='dialog']") if x.is_displayed()]
        if dl: ok = [b for b in dl[0].find_elements(By.TAG_NAME, 'button') if b.is_displayed() and b.text.strip() and b.text.strip() != 'Cancel']; d.execute_script('arguments[0].click()', ok[0])
        time.sleep(8); st.setdefault('granted', {})[str(tok)] = amt; save(); print('granted', amt, 'of token', tok, flush=True)

def make_pool(d, P):
    from drvc import By
    import re
    d.get(APP + '/me/nfts'); time.sleep(10)
    panel = d.find_element(By.ID, 'inscribe-it').find_element(By.XPATH, './ancestor::*[contains(@class,"panel")][1]')
    panel.find_element(By.TAG_NAME, 'summary').click(); time.sleep(1)
    ta = d.find_element(By.ID, 'json-field'); ta.clear()
    d.execute_script('arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event("input", {bubbles: true}))', ta, json.dumps(P['json'])); time.sleep(3)
    d.execute_script('arguments[0].click()', d.find_element(By.ID, 'inscribe-it'))
    t0 = time.time()
    while time.time() - t0 < 1500:
        time.sleep(6)
        dl = [x for x in d.find_elements(By.XPATH, "//dialog|//*[@role='dialog']") if x.is_displayed()]
        if dl:
            bs = [b for b in dl[0].find_elements(By.TAG_NAME, 'button') if b.is_displayed() and b.text.strip() and b.text.strip() != 'Cancel']
            if bs: d.execute_script('arguments[0].click()', bs[0])
        msgs = ' '.join(e.text for e in d.find_elements(By.CSS_SELECTOR, '.msg') if e.is_displayed())
        m = re.search(r'Inscribed: prize-pool, ([0-9a-f]{12,})', msgs)
        if m:
            pid = m.group(1)
            for _ in range(40):   # wait for the arcade to list it
                time.sleep(20)
                L = json.load(urllib.request.urlopen('%s/r/claimpools/%s' % (APP, st['page']), timeout=30)).get('pools', [])
                hit = [p for p in L if p['pool_id'].startswith(pid)]
                if hit: return hit[0]['pool_id']
            return None
    return None

def pools(d):
    if not st.get('judge_number'): raise SystemExit('run `pools3d.py judge` first (the pools name their judge)')
    have = {p['key'] for p in st.get('pools', [])}
    for P in plan():
        if P['key'] in have: continue
        pid = make_pool(d, P); print(P['key'], '->', pid, flush=True)
        if pid: st.setdefault('pools', []).append(dict(P['meta'], key=P['key'], label=P['label'], pool=pid, secret=st['phrase'])); save()

def data():
    mod = {"ashvale3d": "module", "name": "pools", "api": 1, "v": 1,
           "data": {"note": "refereed prize pools of the 3D game (tools/pools3d.py); the engine claims settled windows against these automatically",
                    "judge": st.get('judge'), "xpTokens": XPT, "pools": st.get('pools', [])}}
    json.dump(mod, open(os.path.join(HERE, 'data', 'pools.json'), 'w'), separators=(',', ':'))
    print('wrote data/pools.json: %d pools' % len(st.get('pools', [])))

if __name__ == '__main__':
    step = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    if st.get('judge') and not st.get('judge_number'): st['judge_number'] = num(st['judge']); save()
    if not st.get('page_number'): st['page_number'] = num(st['page']); save()
    if step == 'plan':
        P = plan(); tot = {}
        for p in P: tot[p['token']] = tot.get(p['token'], 0) + p['amount']
        print(len(P), 'pools; supply needed per token:', tot); sys.exit()
    if step == 'data': data(); sys.exit()
    from drvc import start, login
    d = start('ashvale'); login(d, 'ashvale')
    try: {'judge': judge, 'grant': grant, 'pools': pools}[step](d)
    finally: d.quit()
