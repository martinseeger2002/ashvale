"""death and the chest (2026-10-07, @tbuuol: "all of his inventory dropped, but then everything that was in his inventory
showed up in his chest ... now he has two of his entire inventory"): carry wallet things, die, pick them up again - the
chest must never show them, and nothing may become loose (asked of the Bank as new)"""
import json, os
from playwright.sync_api import sync_playwright
URL = os.environ.get('ASH_URL', 'http://127.0.0.1:8731/dist/ashvale3d.html')
fails = 0
def ok(c, m):
    global fails
    print(('ok   ' if c else 'FAIL ') + m, flush=True); fails += 0 if c else 1
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']); pg = b.new_page()
    pg.goto(URL + '?fresh&nocreator&seed=death&go=22,56', timeout=120000); pg.wait_for_function('window.ASH && ASH.me', timeout=120000); pg.wait_for_timeout(8000)
    E = lambda js: pg.evaluate(js)
    E("(() => { for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.me.eq = {}; ['ring_hawk', 'staff_t2', 'ashvale_stone', 'pack_t2'].forEach(k => ASH.give(k, 1)); ASH.give('coins', 140); })()")
    E("(() => { const W = ASH.walletState(); W.address = 'nDEATH'; W.status = 'ready'; W.data = { address: 'nDEATH', gear: { ring_hawk: ['r1'], staff_t2: ['s1'], ashvale_stone: ['a1'], pack_t2: ['p1'] }, tokens: {}, gold: 140, raw: {}, pieces: [], at: Date.now() }; })()")
    S = lambda: E("ASH.chest.state()")
    s = S(); ok(not s['loose'] and not s['chest'], 'carrying what the wallet holds: nothing loose, nothing in the chest (%s / %s)' % (json.dumps(s['loose']), json.dumps(s['chest'])))
    E("ASH.core.applyHit(ASH.pid || 'me', 999, 'melee')"); pg.wait_for_timeout(1500)
    print('dead?', E("[ASH.me.dead, ASH.core.S.ground.length]"))
    s = S(); ok(not s['chest'] and not s['loose'], 'dead, things on the ground: the chest shows none of them (%s / %s)' % (json.dumps(s['chest']), json.dumps(s['loose'])))
    pg.wait_for_timeout(4000)   # wake by the well
    pile = json.loads(E("JSON.stringify(ASH.core.S.ground.map(g => [g.uid, g.id, g.n, g.x, g.y]))")); print('pile', pile)
    if pile: E("ASH.teleport(%d, %d)" % (pile[0][3], pile[0][4])); pg.wait_for_timeout(1500)
    for g in pile: E("ASH.core.cmd('me', { c: 'take', uid: %d })" % g[0]); pg.wait_for_timeout(1300)
    print('carried', E("JSON.stringify(ASH.me.inv.filter(Boolean).map(q => q.id + ':' + q.n))"))
    for k in range(4):
        s = S(); pg.wait_for_timeout(1000)
    ok(not s['loose'], 'picked back up: nothing loose for the Bank to pay again (%s)' % json.dumps(s['loose']))
    ok(not s['chest'], 'and nothing in the chest (%s)' % json.dumps(s['chest']))
    print('ledger', E("JSON.stringify((() => { const s = ASH.chest.state(); return { bag: s.bag, pend: s.pend }; })())"))
    # the bad case: the count is lost after a death (a reload with an old save, another device): the chest must still not show
    # what lies on the ground, and picking it up must still not be new loot
    E("ASH.core.applyHit(ASH.pid || 'me', 999, 'melee')"); pg.wait_for_timeout(1500)
    E("(() => { const s = ASH.chest.state(); })()")
    E("(() => { const L = ASH.chest.state(); })()")
    E("ASH.chest.resetLedgerForTest && ASH.chest.resetLedgerForTest()")
    s = S(); ok(not s['chest'], 'count lost after the death: the chest still shows none of the dropped things (%s)' % json.dumps(s['chest']))
    pg.wait_for_timeout(4000)
    pile = json.loads(E("JSON.stringify(ASH.core.S.ground.map(g => [g.uid, g.id, g.n, g.x, g.y]))"))
    if pile: E("ASH.teleport(%d, %d)" % (pile[0][3], pile[0][4])); pg.wait_for_timeout(1500)
    for g in pile: E("ASH.core.cmd('me', { c: 'take', uid: %d })" % g[0]); pg.wait_for_timeout(1300)
    for k in range(3): s = S(); pg.wait_for_timeout(800)
    ok(not s['loose'], 'count lost, picked back up: still nothing loose (%s)' % json.dumps(s['loose']))
    b.close()
print('ALL OK' if not fails else '%d FAILED' % fails)
