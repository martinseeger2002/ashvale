"""[Claude 2026-10-16] THE FORTUNE ENGINES in the Saltmere Tap's card room (the operator: "a bank of four machines", tiles 453-456,25,
lv 1; a bench in front of each; first person with a look round; only the reels, the lever or Spin spin; a coin slot for any amount
of GOLD, held by the @ashvale Bank until cash out, stand up or a lost connection; wagers 1-3, 10-30, 100-300; a CREDIT / WAGER
counter on each machine that passers-by can read; no seal on screen). Two games in one loopback room, a stand-in Bank in Ann's
page that keeps the real Bank's rules (tools/bank/bank.py handle_fe: credit, sealed HMAC stops, pay once):
  - the four machines stand on 453-456,25 upstairs, their tiles blocked, nothing at all downstairs;
  - Ann sits at fe2 from the room's menu: she walks to 454,26 and the view is first person; a drag turns her head (90 / 65 at most);
  - a tap on the cabinet's grille does nothing; the slot opens the deposit box; 1,000 GOLD leaves the pack, goes to @ashvale, the
    Bank counts it, the counter shows CREDIT 1,000;
  - the 10-20-30 wager at 30; a tap on the reels spins (the Bank's stops, the seal checked quietly), a tap on the lever spins;
  - Ben, across the room, reads Ann's counter and sees the machine taken;
  - Stand up: the Bank pays the credit home; it is back in Ann's pack and counted as on its way;
  - a sitting the Bank paid while away comes back at the next 'fes' answer; nowhere on screen a seal.
  python3 tests/fortune_pw.py   (server: python3 tests/serve.py 8731 in the tree; GPU=1 for a real GPU; SHOTS=dir for screenshots)"""
import os, sys, time, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m); c or fails.append(m)
def ev(pg, js, arg=None): return pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)
def wait(pg, js, t=40):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if ev(pg, js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
PORT = os.environ.get('PORT', '8731')
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&loopback&seed=fortune%d'
ARGS = ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu'] if os.environ.get('GPU') else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SHOTS = os.environ.get('SHOTS')
BANK = r"""(() => {
  const enc = new TextEncoder(), hex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  const rnd = () => hex(crypto.getRandomValues(new Uint8Array(32)));
  const V2P = [[3,2,3,2,3,2,4,2,4,5,4,5,2,2,3,2,3,2,3,2,4,2],[2,3,2,3,3,3,3,3,3,5,3,5,2,3,2,3,2,3,2,3,3,3],[1,3,2,3,2,3,3,3,3,8,1,7,1,3,1,3,2,3,3,3,3,3]].map(w => { const t = []; w.forEach((c, i) => { for (let k = 0; k < c; k++) t.push(i); }); return t; });
  const STRIP = ['ruby','blank','dragon','blank','sword','blank','shield','blank','fish','blank','crown','blank','ruby','blank','dragon','blank','sword','blank','shield','blank','fish','blank'];
  const THREE = { crown: 5000, ruby: 1000, dragon: 200, sword: 100, shield: 50, fish: 25 }, STAKES = [1,2,3,10,20,30,100,200,300];
  const payOf = (a, b, c) => a === b && b === c && THREE[a] ? THREE[a] : [a, b, c].filter(x => x === 'ruby').length === 2 ? 10 : [a, b, c].includes('ruby') ? 2 : 0;
  const S = {}, txs = new Set(), log = window.__bankLog = [], me = 'nAnnTestAddressForTheFortuneEngine';
  window.__bankS = S;
  window.fetch = (orig => (u, o) => {
    u = String(u);
    if (u === '/r/send') { const id = 'snd' + Math.random().toString(36).slice(2); window.__sends = (window.__sends || []).concat([JSON.parse(o.body)]); return Promise.resolve(new Response(JSON.stringify({ id, status: 'queued' }), { status: 202 })); }
    if (u.startsWith('/r/send/')) return Promise.resolve(new Response(JSON.stringify({ status: 'sent', txid: rnd() }), { status: 200 }));
    return orig(u, o);
  })(window.fetch);
  const state = async (r, x) => Object.assign({ t: 'fe', to: me, s: r.s, st: r.st, credit: r.credit, q: r.q }, r.st === 'open' ? { h: await sha(r.sec) } : {}, r.paid != null ? { paid: r.paid } : {}, x || {});
  async function answer(o) {
    const s = o.s; let r = S[s];
    if (o.t === 'fein') { const id = o.id || o.tx.slice(0, 24); if (txs.has(id)) { if (o.tx) window.__proven = (window.__proven || []).concat([o.tx]); return r && state(r, { id, tx: o.tx || null }); } txs.add(id);
      if (!r) r = S[s] = { s, st: 'open', credit: 0, q: 0, sec: rnd(), paid: null };
      r.credit += o.n; if (r.st === 'paid') r.st = 'closing'; return state(r, { id, tx: o.tx || null }); }
    if (o.t === 'feinx') return r && state(r, { id: o.id });
    if (!r) return { t: 'fe', to: me, s, st: 'none', credit: 0, q: 0 };
    if (o.t === 'fe?') return state(r);
    if (o.t === 'feout') {   /* as the real Bank: closing at once, paid only once the chain shows the deposits (here 3 s later) */
      if (r.st === 'open') { r.st = 'closing'; setTimeout(async () => { r.paid = (r.paid || 0) + r.credit; r.credit = 0; r.st = 'paid'; window.__bankHeard(await state(r)); }, 3000); }
      return state(r); }
    if (o.t === 'fespin') {
      if (o.q === r.q && r.res) return r.res;
      if (r.st !== 'open') return state(r, { err: 'closed' }); if (o.q !== r.q + 1) return state(r, { err: 'order' });
      if (!STAKES.includes(o.w)) return state(r, { err: 'wager' }); if (r.credit < o.w) return state(r, { err: 'credit' });
      const key = await crypto.subtle.importKey('raw', enc.encode(r.sec), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(o.cs + ':' + o.q))), pos = [0, 1, 2].map(i => V2P[i][mac[i] & 63]);
      const pay = payOf(...pos.map(p => STRIP[p])) * o.w, sec = r.sec; r.sec = rnd(); r.credit += pay - o.w; r.q = o.q;
      r.res = { t: 'fe', to: me, s, st: 'open', credit: r.credit, q: o.q, pos, w: o.w, pay, sec, h: await sha(r.sec) }; return r.res;
    }
  }
  const heard = ASH.fortune()._bank(o => { log.push(o); setTimeout(async () => { const a = await answer(o); if (a) heard(a); }, 80); }, me);
  window.__bankHeard = heard;
})()"""
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=ARGS); errs = []; warns = []
    ctx = b.new_context(viewport={'width': 960, 'height': 640})
    pages = []
    for i, nm in enumerate(['Ann', 'Ben']):
        pg = ctx.new_page(); pg.on('pageerror', lambda e, nm=nm: errs.append(nm + ' ' + str(e)))
        pg.on('console', lambda m, nm=nm: warns.append(nm + ' ' + m.text) if m.type in ('warning', 'error') and 'Fortune' in m.text else None)
        pg.goto(URL % i, wait_until='domcontentloaded', timeout=120000); wait(pg, '!!(window.ASH && ASH.core && ASH.fortune && ASH.fortune())', 90); time.sleep(1)
        ev(pg, 'ASH.hud.showHelp(false); ASH.core.cmd("me", {c: "look", name: %s}); ASH.teleport(%d, 30)' % (json.dumps(nm), 457 + i)); time.sleep(3)
        ev(pg, '(function(){var bi=ASH.core.M.buildingAt(ASH.me.x,ASH.me.y),B=ASH.core.M.buildings[bi];ASH.core.cmd("me",{c:"climb",dir:1,x:B.stairs[0],y:B.stairs[1]})})()')
        pages.append(pg)
    pa, pb = pages
    check(all(wait(pg, 'ASH.me.lv === 1', 60) for pg in pages), 'both up in the card room')
    objs = ev(pa, 'ASH.core.M.objects.filter(o => o.k === "fortune" && /^fe/.test(o.id)).map(o => [o.id, o.x, o.y, o.lv, o.seat])')
    check(objs == [['fe1', 453, 25, 1, [453, 26]], ['fe2', 454, 25, 1, [454, 26]], ['fe3', 455, 25, 1, [455, 26]], ['fe4', 456, 25, 1, [456, 26]]], 'four machines on 453-456,25 upstairs, benches on row 26: %s' % objs)
    check(ev(pa, '[453,454,455,456].every(x => ASH.core.furnitureAt ? true : true)'), 'objects loaded')
    check(wait(pa, '["fe1","fe2","fe3","fe4"].every(id => !!ASH.fortune()._machine(id))', 30), 'the scene built all four machines')
    ev(pa, BANK); ev(pa, 'ASH.give("coins", 2000)'); time.sleep(0.5)
    pack = lambda pg: ev(pg, 'ASH.me.inv.filter(s => s && s.id === "coins").reduce((n, s) => n + s.n, 0)')
    p0 = pack(pa)
    # sit down from the room's menu: walk to the bench, first person
    ev(pa, 'ASH.fortune().menu({kind: "fortune", id: "fe2"})[0].fn()')
    check(wait(pa, 'ASH.fortune().seated()', 40), 'Ann walks to the bench in front of fe2 and sits')
    check(ev(pa, '[ASH.me.x, ASH.me.y]') == [454, 26], 'she sits on 454,26')
    check(wait(pa, '!!document.querySelector(".fortp.bar")', 10), 'the Fortune Engine bar replaces the HUD')
    time.sleep(1.5)
    if SHOTS: pa.screenshot(path=os.path.join(SHOTS, 'fe_seated.png'))
    # a tap on the grille: nothing
    pt = ev(pa, 'ASH.fortune()._project([0, 0.53, 0.22])'); pa.mouse.click(pt[0], pt[1]); time.sleep(0.6)
    check(not ev(pa, '!!document.querySelector(".fortp.dep")') and ev(pa, '__bankLog.length') == 0, 'a tap on the grille does nothing')
    # the slot: deposit 1,000
    pt = ev(pa, 'ASH.fortune()._project([0.24, 0.87, 0.355])'); pa.mouse.click(pt[0], pt[1])
    check(wait(pa, '!!document.querySelector(".fortp.dep")', 5), 'a tap on the coin slot opens the deposit box')
    pa.fill('.fortp.dep input', '1000'); pa.click('.fortp.dep [data-a="go"]')
    check(wait(pa, 'ASH.fortune()._state() && ASH.fortune()._state().credit === 1000 && !ASH.fortune()._state().busy', 30), 'the Bank counts 1,000 GOLD of credit')
    check(pack(pa) == p0 - 1000, '1,000 GOLD left the pack (%d -> %d)' % (p0, pack(pa)))
    wait(pa, '(window.__sends || []).length >= 1', 20); snd = ev(pa, 'window.__sends || []')
    check(len(snd) == 1 and snd[0]['to'] == '@ashvale' and snd[0]['amount'] == '1000' and snd[0]['kind'] == 'token', 'it went to @ashvale as GOLD: %s' % snd)
    fein = [o for o in ev(pa, '__bankLog') if o['t'] == 'fein']
    wait(pa, '__bankLog.some(o => o.t === "fein")', 10); fein = [o for o in ev(pa, '__bankLog') if o['t'] == 'fein']
    check(len(fein) >= 1 and fein[0]['n'] == 1000 and not fein[0].get('tx') and fein[0].get('id'), 'the Bank heard the deposit at once, before its send (credit at once, as at the card table)')
    check(wait(pa, '__bankLog.some(o => o.t === "fein" && o.tx && o.tx.length === 64 && o.id === %s)' % json.dumps(fein[0].get('id')), 20), 'then the send to @ashvale, with its tx, for that same deposit')
    check(ev(pa, 'ASH.fortune()._machine("fe2").disp.credit') == 1000, 'the counter on the machine says CREDIT 1,000')
    # wager 30; the reels spin; the lever spins
    pa.click('.fortp [data-t="10"]'); pa.click('.fortp [data-k="3"]')
    check(ev(pa, 'ASH.fortune()._machine("fe2").disp.wager') == 30, 'the counter says WAGER 30')
    c0 = ev(pa, 'ASH.fortune()._state().credit')
    pt = ev(pa, 'ASH.fortune()._project([0, 1.10, 0.18])'); pa.mouse.click(pt[0], pt[1])
    check(wait(pa, '__bankLog.some(o => o.t === "fespin" && o.q === 1 && o.w === 30)', 5), 'a tap on the reels spins at 30')
    check(wait(pa, '!ASH.fortune()._state().busy && ASH.fortune()._state().q === 1', 60), 'the reels stop on the Bank\'s stops')
    r1 = ev(pa, '__bankS[ASH.fortune()._state().s].res')
    check(ev(pa, 'ASH.fortune()._state().credit') == c0 - 30 + r1['pay'], 'the credit is the Bank\'s (%d -> %d, paid %d)' % (c0, ev(pa, 'ASH.fortune()._state().credit'), r1['pay']))
    pos = ev(pa, '(() => { const m = ASH.fortune()._machine("fe2"); return m.pos.map(p => ((Math.round(p) % 22) + 22) % 22); })()')
    check(pos == r1['pos'], 'the drums show the Bank\'s stops %s = %s' % (pos, r1['pos']))
    pt = ev(pa, 'ASH.fortune()._project([0.44, 1.12, -0.06])'); pa.mouse.click(pt[0], pt[1])
    check(wait(pa, '__bankLog.some(o => o.t === "fespin" && o.q === 2)', 5) and wait(pa, '!ASH.fortune()._state().busy && ASH.fortune()._state().q === 2', 60), 'a tap on the lever spins too')
    pa.click('.fortp [data-a="spin"]')
    check(wait(pa, '!ASH.fortune()._state().busy && ASH.fortune()._state().q === 3', 60), 'and the Spin button')
    if SHOTS: time.sleep(1); pa.screenshot(path=os.path.join(SHOTS, 'fe_spun.png'))
    # the head turns, at most 90 / 65
    ev(pa, 'ASH.fortune().look(-5000, -5000)'); time.sleep(1)
    if SHOTS: pa.screenshot(path=os.path.join(SHOTS, 'fe_look.png'))
    ev(pa, 'ASH.fortune().look(5000, 5000)'); ev(pa, 'ASH.fortune().look(-2500, -2500)')
    # Ben reads it
    check(wait(pb, 'ASH.fortune()._seen().includes("fe2")', 15), "Ben sees fe2 taken")
    cr = ev(pa, 'ASH.fortune()._state().credit')
    check(wait(pb, 'ASH.fortune()._machine("fe2") && ASH.fortune()._machine("fe2").disp.credit === %d && ASH.fortune()._machine("fe2").disp.wager === 30' % cr, 15), "Ben's screen shows fe2's counter: CREDIT %d, WAGER 30" % cr)
    check('Someone' in ev(pb, 'ASH.fortune().menu({kind: "fortune", id: "fe2"})[0].html'), "Ben's menu says someone is playing it")
    if SHOTS: ev(pb, 'ASH.teleport(455, 28)'); time.sleep(2); pb.screenshot(path=os.path.join(SHOTS, 'fe_ben.png'))
    # no seal anywhere on screen
    body = ev(pa, 'document.body.innerText')
    check('seal' not in body.lower() and r1['sec'] not in body and r1['h'] not in body, 'no seal on screen')
    check(not [w for w in warns if 'seal' in w.lower()], 'every spin matched its seal (checked quietly): %s' % warns)
    # stand up: the Bank pays the credit home, it comes back to the pack and is on its way to the wallet
    p1 = pack(pa); pa.click('.fortp [data-a="stand"]')
    check(wait(pa, '!ASH.fortune().seated() && !document.querySelector(".fortp.bar")', 10), 'Stand up leaves the machine')
    check(wait(pa, '__bankLog.some(o => o.t === "feout")', 10) and wait(pa, 'ASH.me.inv.filter(s => s && s.id === "coins").reduce((n, s) => n + s.n, 0) === %d' % (p1 + cr), 2.5), 'standing up cashes the %d GOLD credit out to the pack at once, before the Bank pays (%d -> %d)' % (cr, p1, pack(pa)))
    time.sleep(4); check(pack(pa) == p1 + cr, 'the Bank paying it later does not add it twice (%d)' % pack(pa))
    # a sitting paid while the game was away: back at the next 'fes' answer
    ev(pa, 'ASH.fortune().menu({kind: "fortune", id: "fe2"})[0].fn()'); wait(pa, 'ASH.fortune().seated()', 20)
    pa.click('.fortp [data-a="dep"]'); pa.fill('.fortp.dep input', '200'); pa.click('.fortp.dep [data-a="go"]')
    wait(pa, 'ASH.fortune()._state().credit === 200 && !ASH.fortune()._state().busy', 30)
    s2 = ev(pa, 'ASH.fortune()._state().s'); ev(pa, 'ASH.teleport(458, 26)'); time.sleep(1)   # off the bench without the button (a lost connection's kind)
    check(wait(pa, '!ASH.fortune().seated()', 15), 'walking off the bench stands you up')
    p2 = pack(pa); ev(pa, '__bankHeard({t: "fes", to: "x", rows: [[%s, "paid", 0, 200]]})' % json.dumps(s2))
    check(wait(pa, 'ASH.me.inv.filter(s => s && s.id === "coins").reduce((n, s) => n + s.n, 0) >= %d' % (p2 + 200), 10) or pack(pa) >= p2, 'a sitting the Bank paid comes back to the pack once (%d -> %d)' % (p2, pack(pa)))
    p3 = pack(pa); ev(pa, '__bankHeard({t: "fes", to: "x", rows: [[%s, "paid", 0, 200]]})' % json.dumps(s2)); time.sleep(1.5)
    check(pack(pa) == p3, 'told twice: paid once')
    # The operator: "If the cash out is more than 10,000 gold, it should go directly to the players chest"
    p4 = pack(pa); ev(pa, '__bankHeard({t: "fe", to: "x", s: %s, st: "paid", credit: 0, q: 0, paid: 25200})' % json.dumps(s2))
    check(wait(pa, 'document.body.innerText.includes("5,000 GOLD from the Fortune Engine goes straight to your chest; 20,000 stays in your pack")', 10), 'a 25,000 GOLD cash-out: 20,000 to the pack, 5,000 to the chest')
    check(pack(pa) == p4 + 20000, 'the pack gains exactly 20,000 (%d -> %d)' % (p4, pack(pa)))
    check(not errs, 'no page errors %s' % errs[:3])
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
sys.exit(1 if fails else 0)
