"""live_play.py - play the LIVE ASHVALE through DogecoinArcade, signed in as @ashvale (2026-10-05: "It should be
playing the live version through Dogecoin arcade"). Opens app.dogecoinarcade.com/inscriptions/<launcher>/full in a
headless Chromium with @ashvale's saved sign-in (tools/pw_send.py), finds the game's frame (window.ASH), and runs your
script there, so every quest test plays exactly what players get: the registry on chain, the real arcade wallet, the
realtime rooms, the @ashvale Bank.

  python3 tools/live_play.py SCRIPT.js [--as cinderwalker] [--shot out.png] [--keep SECONDS]
      --as TAG plays as that account; the DEFAULT is @cinderwalker (never @ashvale, who would pop into the world). 2026-10-05: test with a NEW account so the
      run starts with nothing, like a real new player: @cinderwalker (its sign-in: ~/dogecoinarcade-promo/pw_cinderwalker_state.json).
      SCRIPT.js is the body of an async function run IN the game frame: it can use ASH (ASH.core.cmd('me', {...}),
      ASH.me, ASH.core.S, ASH.hud.setTab('quest'), ...) and `wait(ms)`; whatever it returns is printed as JSON.
  from live_play import LiveGame
      with LiveGame() as g: g.run("return ASH.me.x"); g.shot('a.png'); g.text('.ash .panel')

Notes: the live registry is whatever is released (check_live.py says which). A run as @ashvale is a real player in
the real rooms and its loot really settles through the Bank, so keep runs short and tidy (drop nothing valuable).
Needs PLAYWRIGHT_BROWSERS_PATH=/home/you/.cache/ms-playwright (set below)."""
import os, sys, json, time
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, 'tools'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
APP = 'https://app.dogecoinarcade.com'
class PlayerBrowser:
    """a signed-in arcade account other than @ashvale (its browser state holds its encrypted wallet; password in the secret accounts file)"""
    def __init__(self, tag): self.tag = tag; self.state = '/home/you/dogecoinarcade-promo/pw_%s_state.json' % tag
    def __enter__(self):
        from playwright.sync_api import sync_playwright
        self._p = sync_playwright().start(); self.b = self._p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        self.ctx = self.b.new_context(viewport={'width': 1100, 'height': 760}, storage_state=self.state); self.pg = self.ctx.new_page(); self.pg.on('dialog', lambda d: d.accept())
        self.pg.goto(APP + '/join'); self.pg.wait_for_timeout(3000)
        if self.pg.locator('#in-tag').count() and self.pg.locator('#in-tag').is_visible():
            pw = json.load(open('/home/you/cartoon-toolkit/ghost-devs/secret/accounts.json'))[self.tag]['password']
            self.pg.fill('#in-tag', self.tag); self.pg.fill('#in-pw', pw); self.pg.click('#enter'); self.pg.wait_for_timeout(8000)
        return self
    def save(self):
        """write the browser's storage to disk now. The game keeps the wallet ledger (which things are in your bag and
        which in your chest) in the page's local storage: a run that is killed before saving starts the next one with an
        old ledger, and everything it carried shows up in the chest (2026-10-06: "My inventory is saved")."""
        tmp = self.state + '.tmp'
        self.ctx.storage_state(path=tmp); os.chmod(tmp, 0o600); os.replace(tmp, self.state)
    def __exit__(self, *a):
        try: self.save()
        finally: self.b.close(); self._p.stop()
class LiveGame:
    stopping = False
    def __init__(self, tag='cinderwalker'): self.tag = tag   # never @ashvale by default: it would pop into the world (2026-10-05)
    def __enter__(self):
        # a kill (timeout, SIGTERM) must still save the browser's storage on the way out. Raising from the handler gets
        # lost inside a Playwright call, so it only raises a flag: a routine checks LiveGame.stopping (bot.py's time_left
        # does) and ends normally, and __exit__ saves.
        import signal
        def stop(*a):
            if LiveGame.stopping: sys.exit(143)   # a second kill: go now
            LiveGame.stopping = True; print('stopping: finishing this step, then saving', flush=True)
        try: signal.signal(signal.SIGTERM, stop)
        except ValueError: pass   # not the main thread
        if self.tag and self.tag != 'ashvale': self.B = PlayerBrowser(self.tag).__enter__()
        else:
            from pw_send import AshvaleBrowser
            self.B = AshvaleBrowser().__enter__()
        L = json.load(open(os.path.join(HERE, 'chain', 'modules.json')))['launcher']
        pg = self.B.pg
        # the bot draws the game in software on a shared machine: at 1100x760 it managed 10 frames a second, and
        # other players saw it move in jumps (2026-10-06: "his movement on the screen a lot of the time is
        # really Janky"). A quarter of the pixels for @cinderwalker; everybody else as before.
        pg.set_viewport_size({'width': 560, 'height': 380} if self.tag == 'cinderwalker' else {'width': 1100, 'height': 760})
        pg.goto(APP + '/inscriptions/' + L + '/full', timeout=180000)
        self.fr = None
        for _ in range(90):
            for f in pg.frames:
                try:
                    if f.evaluate("!!(window.ASH && window.ASH.core && window.ASH.me)"): self.fr = f; break
                except Exception: pass
            if self.fr: break
            pg.wait_for_timeout(1000)
        if not self.fr: raise RuntimeError('the live game did not start in the arcade viewer')
        try: self.fr.click('.help .btn', timeout=2000)
        except Exception: pass
        if self.tag == 'cinderwalker':   # answers players in chat while it plays (tools/cinder_chat.py, 2026-10-05)
            try:
                import cinder_chat; cinder_chat.install(self)
            except Exception as exc: print('cinder chat:', exc)
        return self
    def save(self):
        if hasattr(self.B, 'save'): self.B.save()
    def run(self, body):   # tools/play_lib.js (walkTo, talk, killN, gatherN, quests, report...) is loaded with it
        if time.time() - getattr(self, '_saved', 0) > 60 and hasattr(self.B, 'save'):   # the storage, at most once a minute
            self._saved = time.time()
            try: self.B.save()
            except Exception as exc: print('storage save:', exc)
        lib = open(os.path.join(HERE, 'tools', 'play_lib.js')).read()
        return self.fr.evaluate("async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); " + lib + "\n" + body + " }")
    def shot(self, path): self.B.pg.screenshot(path=path)
    def text(self, sel):
        try: return self.fr.inner_text(sel)
        except Exception: return ''
    def __exit__(self, *a): self.B.__exit__(*a)
if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    body = open(a[0]).read()
    with LiveGame(a[a.index('--as') + 1] if '--as' in a else 'cinderwalker') as g:
        print(json.dumps(g.run(body), indent=1, default=str))
        if '--shot' in a: g.shot(a[a.index('--shot') + 1])
        if '--keep' in a: time.sleep(float(a[a.index('--keep') + 1]))
