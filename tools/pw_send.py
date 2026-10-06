"""pw_send.py - the @ashvale browser in Chromium (Playwright) instead of Firefox (2026-10-04: headless Firefox crashes
whenever it unlocks @ashvale's stored wallet - "Failed to decode response from marionette" - while Chromium is solid).
Same steps as release_modular.send_only: the /me/nfts form, the confirm card, then poll the signed-in job list.
    from pw_send import AshvaleBrowser
    with AshvaleBrowser() as B: ok = B.send_only(path)          # True once every piece of the file is sent
The sign-in is kept in ~/dogecoinarcade-promo/pw_ashvale_state.json (mode 600). The password is read through drvc's
accounts() and never printed. A stop-gap: the standalone @ashvale wallet (the operator: "make a standalone @ashvale wallet
management system") replaces the browser altogether."""
import json, os, sys, time, hashlib
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')   # drvc moves HOME; keep Playwright's browsers
APP = 'https://app.dogecoinarcade.com'
STATE = '/home/you/dogecoinarcade-promo/pw_ashvale_state.json'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

class AshvaleBrowser:
    def __enter__(self):
        from playwright.sync_api import sync_playwright
        self._p = sync_playwright().start(); self.b = self._p.chromium.launch()
        self.ctx = self.b.new_context(viewport={'width': 540, 'height': 960}, storage_state=STATE if os.path.exists(STATE) else None)
        self.pg = self.ctx.new_page(); self.pg.on('dialog', lambda d: d.accept())
        self.login(); return self
    def __exit__(self, *a):
        try: self.ctx.storage_state(path=STATE); os.chmod(STATE, 0o600)
        finally: self.b.close(); self._p.stop()
    def login(self):
        from drvc import accounts
        pg = self.pg; pg.goto(APP + '/join'); pg.wait_for_timeout(4000)
        if pg.locator('#in-tag').count():
            pg.fill('#in-tag', 'ashvale'); pg.fill('#in-pw', accounts()['ashvale']['password']); pg.click('#enter'); pg.wait_for_timeout(10000)
    def confirm_card(self):
        self.pg.wait_for_timeout(3000)
        for sel in ('dialog button', '[role=dialog] button', '.askcard button'):
            for bt in self.pg.locator(sel).all():
                try:
                    if bt.is_visible() and bt.inner_text().strip() not in ('Cancel', ''): bt.click(); self.pg.wait_for_timeout(5000); return
                except Exception: pass
    def unfinished(self):
        try: return json.loads(self.pg.evaluate("fetch('/account/inscribe/unfinished', {credentials: 'same-origin'}).then(r => r.text())") or '{}').get('unfinished', [])
        except Exception: return None
    def send_only(self, path, json_text=None):
        pg = self.pg; pg.goto(APP + '/me/nfts'); pg.wait_for_timeout(8000)
        pg.locator('input[type=file]').first.set_input_files(path); pg.wait_for_timeout(5000)
        if json_text is not None:
            for lab in pg.locator("xpath=//*[contains(text(),'JSON beside the file')]").all():
                try: lab.evaluate('e => e.click()')
                except Exception: pass
            pg.wait_for_timeout(1000)
            pg.evaluate("""([v]) => { const f = document.getElementById('json-field'); f.value = v; f.dispatchEvent(new Event('input', {bubbles: true})); f.dispatchEvent(new Event('change', {bubbles: true})); }""", [json_text])
            if json.loads(pg.eval_on_selector('#json-field', 'e => e.value') or 'null') != json.loads(json_text): print('JSON FIELD NOT SET', flush=True); return False
        pg.click('#inscribe-it'); pg.wait_for_timeout(3000); self.confirm_card()
        want = sha(path); msgs = []
        for k in range(300):   # a split waits ~1 block before its pieces go out: allow 20 min
            pg.wait_for_timeout(4000)
            msgs = [m for m in pg.locator('.msg').all_inner_texts() if m]
            if any('a day this account may put on the chain' in x or 'not enough' in x.lower() or 'too-long-mempool-chain' in x for x in msgs):
                print('SEND REFUSED:', msgs[:1], flush=True); return False
            if k < 5: continue
            U = self.unfinished()
            if U is None: continue
            job = [j for j in U if j.get('sha256') == want]
            if not job or job[0].get('pending'): return True
        print('SEND TIMED OUT:', os.path.basename(path), [x[:200] for x in msgs], flush=True); return False
