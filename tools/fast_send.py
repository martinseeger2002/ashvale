"""fast_send.py - send many inscriptions AT ONCE through @ashvale's own signed-in browser (2026-10-03: "blast the
transactions ... get these assets up in blazing fast time").

Why the old way is slow: send_only() (release_helpers_atlas.py) does one file at a time - upload, sign, then wait for
its split to confirm (about a block) before its pieces go, and only then the next file. Here every file gets its own
TAB in the same signed-in browser: up to `conc` files are uploaded and signed back to back, their splits all wait out
the same block, and each tab sends its own pieces the moment that block lands. A 17-module release goes in about the
time one module took before.

No keys pass through this script: signing happens in the arcade page in each tab, exactly as it does for a person.
If the node refuses a send (two tabs reached for the same coin, or the pool said "too long a chain"), that file is
handed back and send_many() runs it again after the next block - the worst case is the old speed, never a loss.

    from fast_send import send_many
    sent, refused = send_many(d, [(path, json_text_or_None), ...], conc=6)
"""
import json, os, time, hashlib, sys
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
import resident as R

sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
REFUSE = ('a day this account may put on the chain', 'not enough', 'too-long-mempool-chain', 'already spent', 'missing inputs', 'conflict')


def _start(d, path, json_text):
    """open a tab, upload the file (and the JSON beside it), press Inscribe and confirm: the page signs from here on"""
    from drvc import By
    d.switch_to.new_window('tab')
    d.get(R.APP + '/me/nfts'); time.sleep(7)
    d.find_elements(By.CSS_SELECTOR, 'input[type=file]')[0].send_keys(path); time.sleep(4)
    if json_text is not None:
        for lab in d.find_elements(By.XPATH, "//*[contains(text(),'JSON beside the file')]"):
            try: d.execute_script('arguments[0].click()', lab)
            except Exception: pass
        time.sleep(1); jf = d.find_element(By.ID, 'json-field')
        d.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', {bubbles: true})); arguments[0].dispatchEvent(new Event('change', {bubbles: true}));", jf, json_text)
        time.sleep(1)
        if json.loads(jf.get_attribute('value') or 'null') != json.loads(json_text): raise RuntimeError('JSON field not set')
    d.find_element(By.ID, 'inscribe-it').click(); time.sleep(3); R.confirm_card(d)
    return d.current_window_handle


def _unfinished(d):
    try: return json.loads(d.execute_script("return fetch('/account/inscribe/unfinished',{credentials:'same-origin'}).then(r=>r.text())") or '{}').get('unfinished', [])
    except Exception: return None


def send_many(d, items, conc=6, timeout=1500):
    """items: [(path, json_text|None)]. Returns (sent_paths, refused_paths). A file counts as sent once the node has every
    piece of it (its job shows pending, or is gone); its inscription id is then found by content hash."""
    from drvc import By
    home = d.current_window_handle
    queue, live, sent, refused = list(items), {}, [], []   # live: handle -> (path, sha, started)
    t_end = time.time() + timeout
    while (queue or live) and time.time() < t_end:
        while queue and len(live) < conc:
            path, jt = queue.pop(0)
            try: h = _start(d, path, jt); live[h] = (path, sha(path), time.time()); print('   started  %s' % os.path.basename(path), flush=True)
            except Exception as e: print('   could not start %s: %s' % (os.path.basename(path), e), flush=True); refused.append(path)
        time.sleep(6)
        U = None
        for h in list(live):
            path, want, t0 = live[h]
            try: d.switch_to.window(h)
            except Exception: live.pop(h); refused.append(path); continue
            msgs = [e.text for e in d.find_elements(By.CSS_SELECTOR, '.msg') if e.is_displayed()]
            bad = [x for x in msgs if any(r in x for r in REFUSE)]
            if bad:
                print('   refused  %s: %s' % (os.path.basename(path), bad[0][:120]), flush=True)
                refused.append(path); d.close(); live.pop(h); continue
            if time.time() - t0 < 25: continue
            if U is None: U = _unfinished(d)
            if U is None: continue
            job = [j for j in U if j.get('sha256') == want]
            if not job or job[0].get('pending'):
                print('   sent     %s' % os.path.basename(path), flush=True)
                sent.append(path); d.close(); live.pop(h)
    for h, (path, _, _) in live.items():   # still going at the timeout: leave nothing half-open
        refused.append(path)
        try: d.switch_to.window(h); d.close()
        except Exception: pass
    try: d.switch_to.window(home)
    except Exception:
        hs = d.window_handles
        if hs: d.switch_to.window(hs[0])
    return sent, refused
