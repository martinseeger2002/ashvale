"""[Claude 2026-10-14] ONE CHEST PER HOME - the operator: "if an item is deposited in ziibiing chest it is visible only in ziibiing chests.
And is deposited in ashvale chests it only visible in ashvale chest. If something is deposited into your wallet from Dogecoin arcade,
it should be visible in both games until it is put into a players inventory. If an item from ziibiing is brought to Ashvale and put
into an Ashvale chest it should be visible in Ashvale chest. And visa versa." One page, a wallet of 100 Gold (as chest_ledger_pw);
the Bank's per-home record is what the page itself tells it (cput / ctake), read back through chest.homes().
  python3 tests/chest_homes_pw.py   (server: python3 tests/serve.py 8731)"""
import json, os
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
URL = os.environ.get('ASH_URL', 'http://127.0.0.1:8731/dist/ashvale3d.html')
ARGS = ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu'] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
fails = 0
def ok(c, m):
    global fails
    print(('ok   ' if c else 'FAIL ') + m, flush=True); fails += 0 if c else 1
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page()
    pg.goto(URL + '?fresh&nocreator&seed=homes', wait_until='domcontentloaded', timeout=120000); pg.wait_for_timeout(9000)
    E = lambda js: pg.evaluate(js)
    E("localStorage.removeItem('ashvale3d.chest.nHOMES')")
    E("(() => { for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.me.eq = {}; })()")
    E("(() => { const W = ASH.walletState(); W.address = 'nHOMES'; W.status = 'ready'; W.data = { address: 'nHOMES', gear: {}, tokens: {}, gold: 100, raw: {}, pieces: [], at: Date.now() }; })()")
    here = lambda: E("ASH.chest.state().here.coins || 0")
    E("ASH.chest.home('ashvale')"); a0 = here(); E("ASH.chest.home('ziibiing')"); z0 = here()
    ok(a0 == 100 and z0 == 100, 'Gold that came from the arcade shows in both homes\' chests (Ashvale %d, Ziibiing %d)' % (a0, z0))
    # at Ziibiing's chest: take 40, put 40 back - it is Ziibiing's now
    E("ASH.chest.home('ziibiing')"); E("ASH.chest.take('coins', 40)")
    ok(E("ASH.core.invCount(ASH.me, 'coins')") == 40, 'take 40 into the bag at Ziibiing')
    E("ASH.chest.store('coins', 40)")
    ok(E("ASH.chest.homes()").get('ziibiing', {}).get('coins') == 40, 'stored at Ziibiing\'s chest: the Bank\'s record says Ziibiing holds 40 (%s)' % json.dumps(E("ASH.chest.homes()")))
    E("ASH.chest.home('ashvale')"); a1 = here(); E("ASH.chest.home('ziibiing')"); z1 = here()
    ok(z1 == 100 and a1 == 60, 'Ziibiing\'s chest shows its 40 and the shared 60 (%d); Ashvale\'s only the shared 60 (%d)' % (z1, a1))
    # carried from Ziibiing to Ashvale and put in an Ashvale chest: Ashvale's
    E("ASH.chest.home('ziibiing')"); E("ASH.chest.take('coins', 25)")
    E("ASH.chest.home('ashvale')"); E("ASH.chest.store('coins', 25)")
    H = E("ASH.chest.homes()")
    ok(H.get('ziibiing', {}).get('coins') == 15 and H.get('ashvale', {}).get('coins') == 25, 'brought from Ziibiing and put in an Ashvale chest: Ashvale holds 25, Ziibiing 15 (%s)' % json.dumps(H))
    E("ASH.chest.home('ashvale')"); a2 = here(); E("ASH.chest.home('ziibiing')"); z2 = here()
    ok(a2 == 85 and z2 == 75, 'Ashvale shows 25 + shared 60 = %d; Ziibiing 15 + shared 60 = %d' % (a2, z2))
    # Ashvale's chest cannot hand out Ziibiing's Gold
    E("ASH.chest.home('ashvale')"); E("ASH.chest.take('coins', 1000)")
    ok(E("ASH.core.invCount(ASH.me, 'coins')") == 85 and E("ASH.chest.homes()").get('ziibiing', {}).get('coins') == 15, 'take everything at Ashvale: 85 come out, Ziibiing\'s 15 stay put')
    # the wallet gains more from the arcade: both chests see it
    E("(() => { const D = ASH.walletState().data; D.gold += 50; D.at = Date.now() + 5000; })()")
    E("ASH.chest.home('ashvale')"); a3 = here(); E("ASH.chest.home('ziibiing')"); z3 = here()
    ok(a3 == 50 and z3 == 65, 'new Gold from the arcade shows in both: Ashvale %d, Ziibiing 15 + 50 = %d' % (a3, z3))
    print('FAILED: %d' % fails if fails else 'ALL OK'); b.close()
