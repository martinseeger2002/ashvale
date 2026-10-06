"""Test the ARCADE demo page (dist/ashvale3d_arcade.html, build with `python3 build.py --arcade`) against a local mock
of the arcade: three.js comes from /content/<id> as an ES module, multiplayer from /r/realtime.js, saves from
/r/storage.js, and localStorage throws (as in an inscribed page). Usage: python3 tests/arcade_pw.py"""
import os, sys, threading, time, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mp_check import two_players
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'arcade_mock'))
import server as mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []
def check(c, msg): print(('ok   ' if c else 'FAIL ') + msg); (None if c else fails.append(msg))

PORT = int(os.environ.get('ASH_MOCK_PORT', '8732'))
srv = mock.serve(PORT); threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/' % PORT
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    r = two_players(b, BASE + '?nocreator&seed=a', BASE + '?nocreator&seed=b&guest', os.path.join(OUT, 'arcade_two_players.png'), check, sandbox=True)
    pa = r['pa']
    check(any(n and n.startswith('Bob (guest)') for n in pa.evaluate('ASH.net().names')), 'a signed-out player shows as "Bob (guest)": %s' % pa.evaluate('ASH.net().names'))
    print('     room.me on A:', pa.evaluate('JSON.stringify(ASH.net().me)'), '| status:', pa.evaluate('ASH.net().status'))
    rows = json.load(open(os.path.join(ROOT, 'tests', 'fixtures', 'tokens_live.json')))
    cls = pa.evaluate('(rows) => rows.map(r => ASH.wallet.classifyToken(r))', rows)
    by = {c['propertyid']: c for c in cls if c}
    check(by.get(26, {}).get('item') == 'coins' and by.get(22, {}).get('subcategory') == 'defence' and len(by) == 7, 'live @ashvale tokens classify via the legacy table: #26 GOLD -> currency/gold (coins), #20-#25 -> xp/<skill>')
    fake = dict(rows[0]); fake['issuer'] = 'someoneElse'
    newtok = {'propertyid': 999, 'issuer': 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c', 'category': 'resource', 'subcategory': 'logs', 'details': {'about': 'x', 'ashvale': {'id': 'oak_logs'}}}
    r2 = pa.evaluate('(a) => a.map(r => ASH.wallet.classifyToken(r))', [fake, newtok])
    check(r2[0] is None and r2[1] and r2[1]['item'] == 'oak_logs', 'a token from another issuer is ignored; a new schema token (resource/logs, ashvale.id oak_logs) maps to its item')
    check(pa.evaluate('ASH.net().amHost') or pa.evaluate('!!ASH.net().host'), 'the shared-world host is known on the arcade page')
    check(pa.evaluate('ASH.store.backend') == 'arcade', 'saves go to arcade.storage (backend %s)' % pa.evaluate('ASH.store.backend'))
    check(pa.evaluate('ASH.core.S.t') > 5 and pa.evaluate('!!ASH.scene'), 'three.js loaded from its inscription and the game runs')
    pa.evaluate('ASH.hud.setTab("settings")'); pa.wait_for_timeout(300); pa.click('.panel [data-a=sound]'); pa.wait_for_timeout(500)
    check((pa.evaluate('window.__mockWrites') or 0) > 0 and 'ashvale3d.settings.v1' in pa.evaluate('Object.keys(window.__mockStore)'), 'a setting change was written through arcade.storage')
    pa.wait_for_timeout(15500)
    check('ashvale3d.save.v1' in pa.evaluate('Object.keys(window.__mockStore)'), 'the game save was written through arcade.storage')
    check(not pa.evaluate('window.__mockRateHits') and not r['pb'].evaluate('window.__mockRateHits'), 'never over the mesh rate limit (~5 msgs/s)')
    print('     console errors:', r['errs'][:8]); check(not r['errs'], 'no console errors with two players on the arcade page')
    r['ctx'].close()
    from mp_many import many_players
    many_players(b, lambda i: BASE + '?nocreator&seed=m%d' % i + ('&guest' if i == 3 else ''), check, n=4, sandbox=True, shot=os.path.join(OUT, 'arcade_four_players.png'), trade_check=True)
    # outside a viewer: storage rejects -> memory only, no errors
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
    ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(BASE + '?nostorage&offline&noswap'); pg.wait_for_timeout(6000)
    check(pg.evaluate('!ASH.trade() || !ASH.trade().available()'), 'without arcade.swap there is no trading')
    check(pg.evaluate('ASH && ASH.store.backend') == 'memory', 'no storage and no localStorage: plays with memory-only saves')
    check(pg.evaluate('getComputedStyle(document.querySelector(".say")).display') == 'none', 'offline: no chat input (solo)')
    pg.screenshot(path=os.path.join(OUT, 'arcade_phone_offline.png'))
    check(not errs, 'no console errors when storage/realtime are unavailable %s' % errs[:3])
    b.close()
srv.shutdown()
print('FAILED: %d' % len(fails) if fails else 'ALL OK')
for f in fails: print('  -', f)
