"""[Claude 2026-10-26] GOLD SENT TO THE @ashvale BANK FROM A FORTUNE ENGINE OR A CLUBHOUSE TABLE (the operator: "Gold disappearing from slot
machines and table games"). The Bank's books matched the chain; the GOLD went missing in the game's send:
  - a deposit gave up after three tries in 45 s and voided itself - during an arcade restart (@nc1ak 10-24), or while the wallet
    could not spend a payout the game had already put in the pack ("only 476 of ASHVALE GOLD is here to send", @nZVso 10-22) -
    and a sitting played on a voided deposit is held by the Bank for good;
  - a table's send had no ref, and one lost status read counted as a failed send, so the same GOLD could be sent twice.
Checks, one page, the wallet and the Bank stood in:
  - the Fortune Engine deposit refused three times ("only 476 ... is here to send") is NOT voided: no feinx, the fourth try sends
    it, the Bank hears its tx; each retry after a refusal is a new ref (fe:<id>, fe:<id>:1, ...); the GOLD stays out of the pack;
  - the table deposit whose first status read is lost is sent ONCE (one POST, ref tb:<id>) and the Bank hears its tx.
  python3 tests/gold_sends_pw.py   (server: python3 tests/serve.py 8731 in the tree; takes about two minutes)"""
import os, sys, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m); c or fails.append(m)
def ev(pg, js): return pg.evaluate(js)
def wait(pg, js, t=40):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if ev(pg, js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
PORT = os.environ.get('PORT', '8731')
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&loopback&seed=goldsends'
ARGS = ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu'] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
WALLET = r"""(() => {
  const me = 'nGoldSendsTestAddressForTheBank0001';
  const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join('');
  const posts = window.__posts = [], polls = {}, words = window.__words = [];
  let feRefusals = 3, tbLost = 1;
  window.__signedOut = 0;   /* sends refused as from a page whose arcade sign-in was lost (the arcade restarted) */
  window.fetch = (orig => (u, o) => {
    u = String(u);
    if (u === '/r/send' && window.__signedOut > 0) { window.__signedOut--;
      return Promise.resolve(new Response(JSON.stringify({ wallet: 'off', error: 'this wallet does not tell inscriptions who is looking' }), { status: 403 })); }
    if (u === '/r/send') { const b = JSON.parse(o.body), id = 'snd' + posts.length; posts.push(b); polls[id] = b;
      return Promise.resolve(new Response(JSON.stringify({ id, status: 'pending' }), { status: 202 })); }
    if (u.startsWith('/r/send/')) { const id = decodeURIComponent(u.slice(8)), b = polls[id];
      if (b && b.note === 'Fortune Engine' && feRefusals > 0) { feRefusals--; return Promise.resolve(new Response(JSON.stringify({ id, status: 'failed', error: 'only 476 of ASHVALE GOLD is here to send.' }), { status: 200 })); }
      if (b && b.note === 'Clubhouse table' && tbLost > 0) { tbLost--; return Promise.reject(new TypeError('Load failed')); }
      return Promise.resolve(new Response(JSON.stringify({ id, status: 'sent', txid: hex() }), { status: 200 })); }
    return orig(u, o);
  })(window.fetch);
  ASH.fortune()._bank(o => words.push(o), me);
  ASH.tables()._bank(o => words.push(o), me);
  window.__me = me;
})()"""
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=ARGS); errs = []
    pg = b.new_page(viewport={'width': 960, 'height': 640}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until='domcontentloaded', timeout=120000)
    check(wait(pg, '!!(window.ASH && ASH.core && ASH.fortune && ASH.fortune() && ASH.tables && ASH.tables())', 120), 'the game loaded')
    time.sleep(1); ev(pg, 'ASH.hud.showHelp(false)')
    ev(pg, WALLET); ev(pg, 'ASH.give("coins", 3000)'); time.sleep(0.5)
    pack = lambda: ev(pg, 'ASH.me.inv.filter(s => s && s.id === "coins").reduce((n, s) => n + s.n, 0)')
    p0 = pack()
    fe = ev(pg, 'ASH.core.M.objects.find(o => o.k === "fortune")'); tb = ev(pg, 'ASH.core.M.objects.find(o => o.k === "gametable")')
    check(bool(fe and tb), 'a Fortune Engine (%s) and a clubhouse table (%s)' % (fe and fe['id'], tb and tb['id']))
    # a deposit into each: core's coin slot ('fein'), as the machine's and the table's deposit boxes send it
    ev(pg, 'ASH.me.lv = %d; ASH.core.cmd("me", {c: "fein", m: %s, n: 1000, s: "fe:%s:0123456789abcdef"})' % (fe['lv'] | 0, json.dumps(fe['id']), fe['id']))
    ev(pg, 'ASH.me.lv = %d; ASH.core.cmd("me", {c: "fein", m: %s, n: 500, s: "tb:%s:fedcba9876543210"})' % (tb['lv'] | 0, json.dumps(tb['id']), tb['id']))
    check(wait(pg, '__words.some(o => o.t === "fein") && __words.some(o => o.t === "tbin")', 20), 'the Bank heard both deposits at once')
    check(pack() == p0 - 1500, '1,500 GOLD left the pack (%d -> %d)' % (p0, pack()))
    # the table: one lost status read, sent once
    check(wait(pg, '__words.some(o => o.t === "tbin" && o.tx && o.tx.length === 64)', 90), 'the table deposit went, the Bank heard its tx')
    tbp = [x for x in ev(pg, '__posts') if x.get('note') == 'Clubhouse table']
    check(len(tbp) == 1, 'a lost status read did not send the table GOLD again (%d sends)' % len(tbp))
    check(len(tbp) == 1 and str(tbp[0].get('ref', '')).startswith('tb:'), 'the table send carries its ref: %s' % (tbp and tbp[0].get('ref')))
    # the machine: refused three times while the payout lands, then sent
    t0 = time.time()
    ok = wait(pg, '__words.some(o => o.t === "fein" && o.tx && o.tx.length === 64)', 200)
    check(ok, 'the Fortune Engine deposit went on its fourth try (%.0f s)' % (time.time() - t0))
    check(not any(o['t'] in ('feinx', 'tbinx') for o in ev(pg, '__words')), 'no deposit was voided (no feinx / tbinx)')
    fep = [x for x in ev(pg, '__posts') if x.get('note') == 'Fortune Engine']
    refs = [x.get('ref') for x in fep]
    check(len(fep) == 4 and len(set(refs)) == 4 and str(refs[0]).startswith('fe:') and all(str(r).startswith(str(refs[0])) for r in refs), 'four sends, each a new ref after a refusal: %s' % refs)
    check(pack() == p0 - 1500, 'nothing came back to the pack twice (%d)' % pack())
    # the arcade restarted and forgot the page's sign-in: the player is told to reload, the deposit waits and then goes
    ev(pg, 'window.__signedOut = 2; ASH.core.cmd("me", {c: "fein", m: %s, n: 200, s: "tb:%s:aaaabbbbccccdddd"})' % (json.dumps(tb['id']), tb['id']))
    check(wait(pg, 'document.body.innerText.includes("Reload the page and your 200 GOLD")', 30), 'a lost sign-in says to reload the page')
    check(wait(pg, '__words.some(o => o.t === "tbin" && o.n === 200 && o.tx && o.tx.length === 64)', 120), 'once signed in again the 200 GOLD went')
    check(not any(o['t'] in ('feinx', 'tbinx') for o in ev(pg, '__words')), 'the signed-out deposit was not voided')
    check(not errs, 'no page errors %s' % errs[:3])
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
sys.exit(1 if fails else 0)
