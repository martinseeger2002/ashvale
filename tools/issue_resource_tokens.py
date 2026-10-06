"""issue_resource_tokens.py [--dry] - @ashvale issues ONE MANAGED, WHOLE-UNIT TOKEN PER RESOURCE (2026-10-04: gear as
NFTs, resources as tokens, Gold as GOLD #26), through @ashvale's own signed-in browser on the arcade's /tokens page.

Each token names its item the way the game reads it (src/engine.js classifyToken, src/wallet.js):
  category "resource", subcategory = the item's subcategory (logs, ore, coal, pelt, fish...), and data =
  {"about": <what it is>, "ashvale": {"id": <item id>}}  - so a wallet shows "312 Oak logs" without any id list.
Managed tokens: nothing exists until @ashvale grants supply; the payout pools (plan phase D) are funded later.
Idempotent and resumable: issued ids are kept in chain/resource_tokens.json; re-run to finish. Afterwards run
`python3 tools/make_assets.py` so data/assets.json carries the ids too. Run with the ghost-devs venv python, AFTER any
other @ashvale job (same browser profile)."""
import sys, os, json, re, time
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
APP = 'https://app.dogecoinarcade.com'
OUT = os.path.join(HERE, 'chain', 'resource_tokens.json')
items = json.load(open(os.path.join(HERE, 'data', 'items.json')))['data']['items']
done = json.load(open(OUT)) if os.path.exists(OUT) else {}
RES = [(k, v) for k, v in items.items() if v.get('category') == 'resource']
todo = [(k, v) for k, v in RES if k not in done]
def tname(k, v): return ('ASHVALE ' + v.get('name', k)).upper()[:40]
print(len(RES), 'resources,', len(done), 'already issued,', len(todo), 'to issue:', ', '.join(k for k, _ in todo), flush=True)
if '--dry' in sys.argv or not todo: sys.exit()

from drvc import start, login, By
from selenium.webdriver.support.ui import Select
def save(): json.dump(done, open(OUT, 'w'), indent=1)
def issue(d, k, v):
    d.get(APP + '/tokens'); time.sleep(10)
    kind = d.find_element(By.CSS_SELECTOR, 'select[name=kind]')
    for o in kind.find_elements(By.TAG_NAME, 'option'):
        if 'managed' in o.text.lower(): Select(kind).select_by_visible_text(o.text); break
    time.sleep(1); fld = lambda n: d.find_element(By.CSS_SELECTOR, f'input[name="{n}"]')
    fld('name').send_keys(tname(k, v))
    units = d.find_elements(By.CSS_SELECTOR, 'select[name=units]')
    if units:
        for o in units[0].find_elements(By.TAG_NAME, 'option'):
            if 'whole' in o.text.lower(): Select(units[0]).select_by_visible_text(o.text); break
    data = {"about": (v.get('description') or v.get('name', k)) + ' Earned in ASHVALE (verified play); tradable anywhere.', "ashvale": {"id": k}}
    fld('data').send_keys(json.dumps(data, separators=(',', ':')))
    fld('category').send_keys('resource'); fld('subcategory').send_keys(v.get('subcategory') or 'resource')
    time.sleep(2)
    d.find_element(By.ID, 'create-offer').click(); time.sleep(3); d.find_element(By.ID, 'create-yes').click(); time.sleep(12)
    print(tname(k, v), '|', d.find_element(By.ID, 'create-news').text[:140], '|', d.find_element(By.ID, 'create-trouble').text[:140], flush=True)
def find_pid(d, name):   # the id comes with the block: read it off the /tokens page by name (as tools/gf2_tokens.py does)
    for _ in range(40):
        d.get(APP + '/tokens'); time.sleep(8)
        for a in d.find_elements(By.CSS_SELECTOR, 'a[href*="/tokens/"]'):
            m = re.search(r'/tokens/(\d+)', a.get_attribute('href') or '')
            if m and a.text.strip().upper().startswith(name): return int(m.group(1))
        time.sleep(30)
    return None
d = start('ashvale'); login(d, 'ashvale')
try:
    for k, v in todo:
        issue(d, k, v)
    for k, v in todo:
        pid = find_pid(d, tname(k, v))
        if pid: done[k] = pid; save(); print('  %-14s #%d' % (k, pid), flush=True)
        else: print('  %-14s not listed yet - re-run later to record it' % k, flush=True)
finally: d.quit()
print('issued %d/%d. Next: python3 tools/make_assets.py' % (len(done), len(RES)), flush=True)
