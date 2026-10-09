"""release_modular.py [--dry] - publish ASHVALE the MODULAR way (2026-10-01: "it's supposed to be modular",
"Publish it the modular way"). As @ashvale:
  1. python3 build.py --arcade (fresh modules in dist/modules/)
  2. inscribe every module whose CONTENT changed since the last release (sha256 in chain/modules.json); unchanged
     modules keep their old inscription id. That is what makes a later fix "one or two small inscriptions".
  3. inscribe a REGISTRY JSON {"ashvale3d":"registry", version: N+1, loader, modules: {name: {id, v, api, kind}}}
     with three.js = Pip's on-chain r160 (#910)
  4. (first release only, or --launcher) inscribe the LAUNCHER page: loader.js + the arcade SDK scripts; at start it
     finds @ashvale's NEWEST registry (/r/inscriptions?creator=...), falling back to the one baked into it, and loads
     every module by id. Every later release only needs steps 2-3; the launcher never changes.
Resumable: progress is saved after every inscription. Run with the ghost-devs venv python. Then list the launcher on the
Games tab with tools/list_game.py (play = launcher id)."""
import sys, os, json, hashlib, subprocess, time
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
ASHVALE = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
THREE_ID = '374cfd2b2f114e9da4ade8add495fe8aa0b2b996a710fb538759a956f15f9539'
STATE = os.path.join(HERE, 'chain', 'modules.json')
DRY = '--dry' in sys.argv
if '--launcher' in sys.argv and '--yes-reset-every-save' not in sys.argv:
    # 2026-10-05: a new launcher = a new inscription id = an EMPTY arcade.storage for every player (saves are kept per
    # inscription id). The operator lost his character to it. Loader fixes go in a module (src/netretry.js), never a launcher.
    raise SystemExit('REFUSED: --launcher would start every player over (saves are kept under the launcher id). Ship the fix as a module.')
LOCAL = '--local' in sys.argv   # test: fake ids (local-<sha>), chain/modules_local.json, nothing inscribed
if LOCAL: STATE = os.path.join(HERE, 'chain', 'modules_local.json')

st = json.load(open(STATE)) if os.path.exists(STATE) else {"modules": {}, "registry_version": 0, "registries": [], "launcher": None}
def save(): json.dump(st, open(STATE, 'w'), indent=1)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

if '--no-build' not in sys.argv:   # --no-build: release the dist/ already built (and playtested), even if src/ has moved on
  subprocess.run([sys.executable if os.path.basename(sys.executable).startswith('python3') else 'python3', os.path.join(HERE, 'build.py'), '--arcade'], cwd=HERE, check=True, capture_output=True)
reg = json.load(open(os.path.join(HERE, 'dist', 'registry.json')))
MOD = os.path.join(HERE, 'dist', 'modules')

def launcher_page(reg, home=None, title='ASHVALE'):
    """the launcher: loader + arcade SDK scripts + the boot. A HOME launcher (2026-10-09, the Ziibiing card) is the same page with
    ASH3D_HOME set before boot, so a new character is born there; its own inscription id = its own arcade storage = its own save"""
    loader = open(os.path.join(HERE, 'src', 'loader.js')).read()
    css = ("html,body{margin:0;height:100%;background:#0b0906;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%}"
           "#ash{position:fixed;left:0;top:0;width:100vw;height:100vh;height:100dvh;touch-action:none}"
           "#boot{position:fixed;inset:0;display:grid;place-items:center;color:#e8b54a;font:16px system-ui,sans-serif}")
    boot = (("window.ASH3D_HOME = " + json.dumps(home) + ";\n" if home else "") + "import * as THREE from '/content/" + THREE_ID + "';\n"
            "ASH3D.defineValue('three', { api: 160, v: '0.160.0' }, THREE);\n"
            "const BAKED = " + json.dumps(reg, separators=(',', ':')) + ";\n"
            "let reg = BAKED;\n"
            "/* the newest registry by @ashvale wins: every release is just new modules + a new registry */\n"
            "try { const L = await (await fetch('/r/inscriptions?creator=" + ASHVALE + "&limit=300')).json();\n"
            "  for (const p of L || []) { const j = p.json; if (j && j.ashvale3d === 'registry' && (j.loader || 1) <= ASH3D.LOADER && j.version > reg.version) reg = j; } } catch (e) { console.warn('ASHVALE: registry lookup failed, using the built-in one', e); }\n"
            "ASH3D.boot({ baked: reg, content: true }).then(function (m) { document.getElementById('boot').remove(); return m.engine.openStore().then(function (st) { window.ASH = m.engine.start(document.getElementById('ash'), { report: m.$report, store: st }); }); })\n"
            ".catch(function (e) { console.error(e); const b = document.getElementById('boot'); b.innerHTML = '<div style=\"text-align:center;padding:20px\"><p>ASHVALE could not finish loading (' + String(e && e.message || e).replace(/</g, '&lt;') + ').</p><p>Check the connection and try again.</p><button onclick=\"location.reload()\" style=\"font:inherit;padding:10px 22px;border-radius:8px;border:1px solid #e8b54a;background:#2a1f0e;color:#e8b54a\">Try again</button></div>'; });\n")
    page = ('<!doctype html>\n<html lang="en"><head>\n<title>' + title + '</title>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n<style>' + css + '</style>\n</head><body>\n'
            '<div id="ash"></div><div id="boot">Loading ' + title.title() + '…</div>\n'
            '<script src="/r/realtime.js"></script>\n<script src="/r/swap.js"></script>\n<script src="/r/storage.js"></script>\n'
            '<script>\n' + loader.replace('</script', '<\\/script') + '\n</script>\n'
            '<script type="module">\n' + boot.replace('</script', '<\\/script') + '</script>\n</body></html>\n')
    return page

def file_of(name, group, entry):
    if group == 'parts': return os.path.join(MOD, 'part.' + name + '.json')
    if group == 'zones': return os.path.join(MOD, 'zone.' + name + '.json')
    if group == 'data': return os.path.join(MOD, name + '.json')
    return os.path.join(MOD, name + '.js')

todo = []   # (key, path, entry-ref)
for k, e in reg['modules'].items():
    if k == 'three': continue
    if k in ('data', 'zones', 'parts'):
        for n, sub in e.items(): todo.append((k + '/' + n, file_of(n, k, sub), sub))
    else: todo.append((k, file_of(k, '', e), e))
for k, e in (reg.get('lazy') or {}).items():   # zones that load by area (handoff/area_loading.md): same keys, same inscriptions
    for n, sub in e.items(): todo.append((k + '/' + n, file_of(n, k, sub), sub))
changed = [(key, p, e) for key, p, e in todo if st['modules'].get(key, {}).get('sha') != sha(p)]
print(len(todo), 'modules,', len(changed), 'changed:', ', '.join(k for k, _, _ in changed[:12]) + (' ...' if len(changed) > 12 else ''), flush=True)
if DRY: sys.exit()

d = None
def browser():
    global d
    if d is None:
        from drvc import start, login
        d = start('ashvale'); login(d, 'ashvale')
    return d
import resident as R
if LOCAL:
    class _R:
        @staticmethod
        def inscribe_here(d, path, json_text=None): return 'local' + sha(path)[:59]
    R = _R
    def browser(): return None
import urllib.request, re as _re
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
# 2026-10-04: headless Firefox crashes unlocking @ashvale's stored wallet; Chromium (tools/pw_send.py) is solid. The module
# and registry sends go through Chromium unless ASH_FIREFOX=1 (the rare new-launcher step below still uses Firefox).
if not LOCAL and os.environ.get('ASH_FIREFOX') != '1' and os.environ.get('ASH_BROWSER') != 'chromium':
    # the standalone @ashvale wallet (2026-10-04): no browser at all - the node builds, the wallet signs
    _W = None
    def browser():
        global _W
        if _W is None:
            sys.path.insert(0, os.path.join(HERE, 'tools')); from ashvale_wallet import Wallet; _W = Wallet()
        return _W
    def send_only(d, path, json_text=None):
        r = d.inscribe(path, json_text or ''); print('   inscribed %s -> %s' % (os.path.basename(path), (r.get('id') or '?')[:16]), flush=True); return True
elif not LOCAL and os.environ.get('ASH_FIREFOX') != '1':
    _PW = None
    def browser():
        global _PW
        if _PW is None:
            sys.path.insert(0, os.path.join(HERE, 'tools')); from pw_send import AshvaleBrowser
            _PW = AshvaleBrowser().__enter__(); import atexit; atexit.register(lambda: _PW.__exit__(None, None, None))
        return _PW
    def send_only(d, path, json_text=None): return d.send_only(path, json_text)
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
BATCH = 999   # keep sending (2026-10-01: "Shouldn't be a problem to keep tx-ing"); a refused send pauses for a block, then continues
try:
    pending = list(changed)
    if not LOCAL:   # anything already on chain from an interrupted run (sent, not yet recorded) is picked up by hash
        found = ids_by_sha({sha(p) for _, p, _ in pending})
        for key, p, e in list(pending):
            if sha(p) in found: st['modules'][key] = {'id': found[sha(p)], 'sha': sha(p), 'v': e.get('v'), 'bytes': os.path.getsize(p)}; pending.remove((key, p, e))
        save()
    done = len(changed) - len(pending)
    while pending:
        batch, pending = pending[:BATCH], pending[BATCH:]
        if LOCAL:
            for key, p, e in batch: st['modules'][key] = {'id': R.inscribe_here(None, p), 'sha': sha(p), 'v': e.get('v'), 'bytes': os.path.getsize(p)}
            save(); continue
        sent = []
        for key, p, e in batch:
            ok = None
            for attempt in range(3):   # a browser that crashes mid-send (2026-10-04: "Failed to decode response from marionette" under memory pressure) is restarted and the file retried
                try: ok = send_only(browser(), p); break
                except Exception as ex:
                    print('   browser crashed (%s), restarting it (try %d of 3)' % (str(ex).splitlines()[0][:80], attempt + 1), flush=True)
                    try: (_PW.__exit__(None, None, None) if '_PW' in globals() and _PW else (d.quit() if hasattr(d, 'quit') else None))
                    except Exception: pass
                    d = None; _PW = None; time.sleep(20)
            if ok is None: raise SystemExit('the browser kept crashing; re-run later (resumable)')
            if not ok: pending = [x for x in batch if x not in sent] + pending; print('waiting for a block before sending more', flush=True); break
            sent.append((key, p, e)); print('   sent %-28s' % key, flush=True)
        want = {sha(p): (key, p, e) for key, p, e in sent}
        for _ in range(40):   # one block (~1 min on testnet), then they're listed
            time.sleep(30); found = ids_by_sha(set(want))
            if len(found) == len(want): break
        for h, (key, p, e) in want.items():
            if h in found: st['modules'][key] = {'id': found[h], 'sha': h, 'v': e.get('v'), 'bytes': os.path.getsize(p)}; done += 1
            else: pending.append((key, p, e)); print('not listed yet, will retry:', key, flush=True)
        save(); print('%d/%d modules on chain' % (done, len(changed)), flush=True)
    # the registry with every id filled in
    for key, p, e in todo: e['id'] = st['modules'][key]['id']
    reg['modules']['three'] = {"id": THREE_ID, "v": "0.160.0", "api": 160, "kind": "esm"}
    reg['version'] = st['registry_version'] + 1; reg['released'] = time.strftime('%Y-%m-%d %H:%M')
    rp = os.path.join(HERE, 'chain', 'registry_v%d.json' % reg['version'])
    try:   # a re-run keeps the same bytes (and the release time) so an interrupted split resumes instead of being paid for again
        old = json.load(open(rp))
        if {k: v for k, v in old.items() if k != 'released'} == {k: v for k, v in reg.items() if k != 'released'}: reg['released'] = old['released']
    except (OSError, ValueError): pass
    json.dump(reg, open(rp, 'w'), separators=(',', ':'))
    if st.get('pending_registry') != rp or not st.get('pending_registry_id'):
        # the launcher finds registries through /r/inscriptions' `json` field, which is the JSON BESIDE the file (not
        # the file's content): so the registry goes in both (2026-10-01: registry v2 was invisible to the launcher)
        rid = None
        if LOCAL: rid = R.inscribe_here(None, rp)
        elif send_only(browser(), rp, json_text=open(rp).read()):   # split-safe: waits until every piece is out
            for _ in range(40):
                time.sleep(30); rid = ids_by_sha({sha(rp)}).get(sha(rp))
                if rid: break
        if not rid: print('FAILED at the registry - re-run to resume', flush=True); sys.exit(1)
        st['pending_registry'], st['pending_registry_id'] = rp, rid; save()
    st['registry_version'] = reg['version']; st['registries'].append({'version': reg['version'], 'id': st['pending_registry_id']})
    st.pop('pending_registry', None); st.pop('pending_registry_id', None); save()
    print('REGISTRY v%d %s' % (reg['version'], st['registries'][-1]['id']), flush=True)
    # the launcher, once
    if not st.get('launcher') or '--launcher' in sys.argv:
        page = launcher_page(reg)
        lp = os.path.join(HERE, 'chain', 'launcher.html'); open(lp, 'w').write(page)
        lid = ids_by_sha({sha(lp)}).get(sha(lp))   # a re-run after the send resumes here instead of paying again
        if not lid and send_only(browser(), lp):
            for _ in range(40):
                time.sleep(30); lid = ids_by_sha({sha(lp)}).get(sha(lp))
                if lid: break
        if not lid: print('FAILED at the launcher - re-run with --launcher', flush=True); sys.exit(1)
        st['launcher'] = lid; save(); print('LAUNCHER', lid, '%d bytes' % len(page), flush=True)
    print('DONE: launcher', st['launcher'], 'registry v%d' % st['registry_version'], flush=True)
    if '--home' in sys.argv:   # a second card's launcher, inscribed once per home (never the c879 launcher)
        h = sys.argv[sys.argv.index('--home') + 1]; t = sys.argv[sys.argv.index('--title') + 1] if '--title' in sys.argv else h.title()
        hl = st.setdefault('home_launchers', {})
        if not hl.get(h):
            page = launcher_page(reg, h, t); lp = os.path.join(HERE, 'chain', 'launcher_' + h + '.html'); open(lp, 'w').write(page)
            lid = ids_by_sha({sha(lp)}).get(sha(lp))
            if not lid and send_only(browser(), lp):
                for _ in range(40):
                    time.sleep(30); lid = ids_by_sha({sha(lp)}).get(sha(lp))
                    if lid: break
            if not lid: print('FAILED at the %s launcher - re-run with --home %s' % (h, h), flush=True); sys.exit(1)
            hl[h] = lid; save()
        print('HOME LAUNCHER', h, hl[h], flush=True)
finally:
    if d is not None: d.quit()
