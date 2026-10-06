"""release_helpers_atlas.py - the upload helpers of tools/release_modular.py (send_only, give_up, ids_by_sha) in an
importable module, for tools/release_atlas.py. Keep in step with release_modular.py if either changes."""
import os, json, time, hashlib, urllib.request, sys
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
import resident as R
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASHVALE = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
def send_only(d, path, json_text=None):
    """inscribe_here without waiting for the block: upload, sign, wait until every piece is SENT (seconds), return.
    The id is resolved later by content hash from /r/inscriptions (batch mode: ~20 sends per block, not 1)."""
    from drvc import By
    d.get(R.APP + '/me/nfts'); time.sleep(8)
    d.find_elements(By.CSS_SELECTOR, 'input[type=file]')[0].send_keys(path); time.sleep(5)
    if json_text is not None:   # the "JSON beside the file" box (same steps as resident.inscribe_here)
        for lab in d.find_elements(By.XPATH, "//*[contains(text(),'JSON beside the file')]"):
            try: d.execute_script('arguments[0].click()', lab)
            except Exception: pass
        time.sleep(1); jf = d.find_element(By.ID, 'json-field')
        d.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', {bubbles: true})); arguments[0].dispatchEvent(new Event('change', {bubbles: true}));", jf, json_text)
        time.sleep(1)
        if json.loads(jf.get_attribute('value') or 'null') != json.loads(json_text): print('JSON FIELD NOT SET', flush=True); return False
    d.find_element(By.ID, 'inscribe-it').click(); time.sleep(3); R.confirm_card(d)
    want = sha(path)
    for k in range(300):   # a split waits ~1 block before its pieces go out: allow 20 min
        time.sleep(4)
        msgs = [e.text for e in d.find_elements(By.CSS_SELECTOR, '.msg') if e.is_displayed()]
        if any('a day this account may put on the chain' in x or 'not enough' in x.lower() or 'too-long-mempool-chain' in x for x in msgs):
            print('SEND REFUSED:', [x for x in msgs if x][:1], flush=True); return False
        if k < 5: continue
        # Arcade 2026-10-01: poll the signed-in job list; a job is done sending when it shows pending:true or is gone
        try: U = json.loads(d.execute_script("return fetch('/account/inscribe/unfinished',{credentials:'same-origin'}).then(r=>r.text())") or '{}').get('unfinished', [])
        except Exception: continue
        job = [j for j in U if j.get('sha256') == want]
        if not job or job[0].get('pending'): return True
    try: d.save_screenshot(os.path.join(HERE, 'chain', 'send_timeout.png'))
    except Exception: pass
    print('SEND TIMED OUT:', os.path.basename(path), [x[:200] for x in msgs if x], flush=True)
    return False
def give_up(d):
    """drop every unfinished multi-piece job on the page (their pre-signed pieces can spend coins that later sends used)"""
    from drvc import By
    for _ in range(10):
        d.get(R.APP + '/me/nfts'); time.sleep(6)
        # the job list is GET /account/inscribe/unfinished (Arcade 2026-10-02); the rows draw slowly, so wait for them
        try: U = json.loads(d.execute_script("return fetch('/account/inscribe/unfinished',{credentials:'same-origin'}).then(r=>r.text())") or '{}').get('unfinished', [])
        except Exception: U = []
        if not U: return
        b = []
        for _w in range(20):
            b = [x for x in d.find_elements(By.XPATH, "//button[contains(., 'Give up on it')]") if x.is_displayed()]
            if b: break
            time.sleep(3)
        if not b: return
        b[0].click(); time.sleep(3); R.confirm_card(d); time.sleep(2)
def ids_by_sha(want):
    """{sha: id} for our recent inscriptions (newest 300)."""
    L = json.load(urllib.request.urlopen('https://app.dogecoinarcade.com/r/inscriptions?creator=' + ASHVALE + '&limit=300', timeout=30))
    return {p['sha256']: p['id'] for p in L if p.get('sha256') in want}
