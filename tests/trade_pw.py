"""two players negotiate a trade in the game's window; a stand-in arcade.swap records the settled deal"""
import json, time
from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
I = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c'
STUB = """(() => { const I = '%s'; let cb = null; window.__swap = { trades: [], answers: [] };
  const P = (id, n, key) => ({ id, number: n, creator: I, held: true, json: { collection: 'ASHVALE Armoury', attributes: [{ trait_type: 'Key', value: key }] } });
  window.arcade = Object.assign(window.arcade || {}, { swap: {
    items: async () => ({ address: 'nX', inscriptions: (window.__mine || []), balances: [{ propertyid: 26, units: 500, balance: 500 }] }),
    trade: async (o) => { window.__swap.trades.push(o); return { id: 'sw' + window.__swap.trades.length }; },
    answer: async (id, yes) => { window.__swap.answers.push([id, yes]); },
    onTrade: f => { cb = f; }, _fire: t => cb && cb(t) } });
  window.__P = P; })()""" % I
ok = lambda c, m: print(('ok   ' if c else 'FAIL ') + m, flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 1100, 'height': 760}); ctx.add_init_script(STUB)
    A, B = ctx.new_page(), ctx.new_page()
    for pg, s in ((A, 'ta'), (B, 'tb')): pg.goto('http://127.0.0.1:8738/dist/ashvale3d.html?fresh&nocreator&loopback&seed=' + s, wait_until='domcontentloaded', timeout=120000)
    time.sleep(12)
    for pg in (A, B):
        try: pg.click('.help .btn', timeout=2000)
        except Exception: pass
    W = "(([addr, gear]) => { const S = ASH.walletState(); S.address = addr; S.status = 'ready'; S.data = { address: addr, gear, tokens: {}, pids: { coins: 26 }, gold: 0, raw: {}, pieces: [], at: Date.now() }; })"
    A.evaluate("(() => { for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.give('sword_t3', 2); ASH.give('helmet_t2', 1); })()")
    A.evaluate(W, ['nA', {'sword_t3': ['a1', 'a2'], 'helmet_t2': ['a3'], 'bow_t2': ['a4']}])   # the bow is in the chest, not the bag
    B.evaluate("(() => { for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.give('ring_hawk', 1); })()")
    B.evaluate(W, ['nB', {'ring_hawk': ['b1'], 'shield_t1': ['b2']}])
    peerB = A.evaluate("ASH.peers().find(p => p && !p.guest)")
    ok(bool(peerB), 'A sees B in the room: %s' % (peerB and peerB.get('id')))
    A.evaluate("p => ASH.trade().open(p)", peerB); time.sleep(0.5)
    ok('Waiting for' in A.inner_text('.ash-trade'), 'the window opens at once: "%s"' % A.inner_text('.ash-trade').split('\n')[1][:60]); time.sleep(1.5)
    ok(B.locator('.ash-trade [data-y]').count() == 1, 'B is asked "wants to trade"'); B.click('.ash-trade [data-y]'); time.sleep(3)
    ok(A.locator('.ash-trade .side').count() == 2 and B.locator('.ash-trade .side').count() == 2, 'both trade windows are open')
    ok(A.locator('.ash-trade .side').nth(1).locator('.slot').count() == 0, "A does not see B's inventory")
    time.sleep(1); ks = A.evaluate("[...document.querySelectorAll('.ash-trade .slot[data-k]')].map(e => e.dataset.k).sort()")
    ok(ks == ['helmet_t2', 'sword_t3'], 'A can offer only what A carries (the bow in the chest is not offered): %s' % ks)
    A.locator('.ash-trade .slot[data-k="sword_t3"]').click()
    for _ in range(20):
        if 'sword' in B.inner_text('.ash-trade .side >> nth=1').lower(): break
        time.sleep(0.5)
    ok('Steel sword' in B.inner_text('.ash-trade .side >> nth=1') or 'sword' in B.inner_text('.ash-trade .side >> nth=1').lower(), "B sees A's offer as the game item: " + B.inner_text('.ash-trade .side >> nth=1').split('\n')[1])
    B.locator('.ash-trade .slot[data-k="ring_hawk"]').click(); time.sleep(2)
    A.screenshot(path='trade_A.png')
    A.click('.ash-trade [data-ok]'); time.sleep(1); B.click('.ash-trade [data-ok]'); time.sleep(3)
    tr = A.evaluate("window.__swap.trades"); ok(len(tr) == 1 and tr[0]['give'] == {'inscription': 'a1'} and tr[0]['get'] == {'inscription': 'b1'}, 'A settles exactly the deal (lowest-numbered sword for the ring): %s' % json.dumps(tr))
    aid = B.evaluate("ASH.peers().find(p => p && !p.guest).id")
    B.evaluate("id => arcade.swap._fire({ status: 'incoming', id: 'swX', with: { id }, give: { inscription: 'b2' }, get: { inscription: 'a1' } })", aid); time.sleep(1)
    B.evaluate("id => arcade.swap._fire({ status: 'incoming', id: 'sw1', with: { id }, give: { inscription: 'b1' }, get: { inscription: 'a1' } })", aid); time.sleep(1)
    an = B.evaluate("window.__swap.answers"); ok(an == [['swX', False], ['sw1', True]], "B's game refuses a swap that is not the deal and says yes to the deal: %s" % json.dumps(an))
    # 2026-10-08: "as soon as the trade transaction hits the mempool the game should reflect it" - even with the window closed
    B.evaluate("ASH.trade().close()"); time.sleep(1)
    for pg in (A, B): pg.evaluate("arcade.swap._fire({ status: 'broadcast', id: 'sw1', with: { id: 'x' } })")
    time.sleep(1); ok(A.evaluate("ASH.core.invCount(ASH.me, 'sword_t3')") == 1, 'in the mempool (window already closed): the sword left A\'s bag at once (1 of 2 left)')
    ok(B.evaluate("ASH.core.invCount(ASH.me, 'sword_t3')") == 1 and B.evaluate("ASH.core.invCount(ASH.me, 'ring_hawk')") == 0, 'and is in B\'s bag at once, the ring gone from it, before any block')
    for pg in (A, B): pg.evaluate("arcade.swap._fire({ status: 'settled', id: 'sw1', with: { id: 'x' } })")
    time.sleep(1); ok(A.evaluate("ASH.core.invCount(ASH.me, 'sword_t3')") == 1 and B.evaluate("ASH.core.invCount(ASH.me, 'sword_t3')") == 1, 'the block confirming it moves nothing twice')
    B.evaluate("(() => { const D = ASH.walletState().data; D.gear.sword_t3 = ['a1']; D.at = Date.now(); })()"); B.evaluate("ASH.chest.state()")
    ok(B.evaluate("ASH.core.invCount(ASH.me, 'sword_t3')") == 1, 'B\'s wallet showing it later adds no second sword')
    cb = B.evaluate("JSON.stringify(ASH.chest.state().chest)"); ok('sword_t3' not in cb, 'nor offers one in B\'s chest (%s)' % cb)
    A.evaluate("(() => { const D = ASH.walletState().data; D.gear.sword_t3 = ['a2']; D.at = Date.now(); })()"); cs = A.evaluate("ASH.chest.state().chest")
    ok(not cs.get('sword_t3'), 'A\'s chest does not offer the traded sword back (%s)' % json.dumps(cs))
    hA, hB = A.evaluate("ASH.core.invCount(ASH.me, 'helmet_t2')"), B.evaluate("ASH.core.invCount(ASH.me, 'helmet_t2')")
    A.evaluate("p => ASH.trade().open(p)", peerB); time.sleep(2); B.click('.ash-trade [data-y]'); time.sleep(3)
    A.locator('.ash-trade .slot[data-k="helmet_t2"]').click(); time.sleep(2)
    A.click('.ash-trade [data-ok]'); time.sleep(1); B.click('.ash-trade [data-ok]'); time.sleep(3)
    # one-sided (2026-10-08: "If both agree, a trade can be one-sided"): A gives the helmet, B gives nothing
    gv = A.evaluate("window.__swap.trades.at(-1)"); ok(gv['give'] and gv['give'].get('inscription') and gv['get'] is None, 'a one-sided deal both accepted is sent: %s' % json.dumps(gv))
    B.evaluate("([id, g]) => arcade.swap._fire({ status: 'incoming', id: 'sw2', with: { id }, give: null, get: g })", [aid, gv['give']]); time.sleep(1)
    for pg in (A, B): pg.evaluate("arcade.swap._fire({ status: 'broadcast', id: 'sw2', with: { id: 'x' } })")
    time.sleep(1)
    moved = (A.evaluate("ASH.core.invCount(ASH.me, 'helmet_t2')"), B.evaluate("ASH.core.invCount(ASH.me, 'helmet_t2')"))
    for pg in (A, B): pg.evaluate("arcade.swap._fire({ status: 'failed', id: 'sw2', with: { id: 'x' }, why: 'test' })")
    time.sleep(1)
    back = (A.evaluate("ASH.core.invCount(ASH.me, 'helmet_t2')"), B.evaluate("ASH.core.invCount(ASH.me, 'helmet_t2')"))
    ok(moved == (hA - 1, hB + 1), 'the one-sided gift moves at broadcast: %s' % (moved,)); ok(back == (hA, hB), 'a swap the chain refuses after the mempool: each side gets its own back (before %s, moved %s, after %s)' % ((hA, hB), moved, back))
    # a stack: choose how many (2026-10-04)
    A.evaluate("(() => { ASH.give('logs', 20); ASH.chest.promise({ logs: 20 }); const D = ASH.walletState().data; D.tokens = { logs: 20 }; D.pids.logs = 31; D.at = Date.now(); ASH.chest.state(); })()")
    A.evaluate("p => ASH.trade().open(p)", peerB); time.sleep(2); B.click('.ash-trade [data-y]'); time.sleep(3)
    A.locator('.ash-trade .slot[data-k="logs"]').click(); time.sleep(0.5)
    A.fill('.ash-trade [data-n]', '5'); A.dispatch_event('.ash-trade [data-n]', 'change'); time.sleep(0.5)
    for _ in range(20):
        if '5 Logs' in B.inner_text('.ash-trade .side >> nth=1'): break
        time.sleep(0.5)
    ok('5 Logs' in B.inner_text('.ash-trade .side >> nth=1'), 'B sees "5 Logs" offered: ' + B.inner_text('.ash-trade .side >> nth=1').split('\n')[1])
    A.click('.ash-trade [data-ok]'); time.sleep(1); B.click('.ash-trade [data-ok]'); time.sleep(3)   # (B's ring left in the first trade: a gift this time)
    tr = A.evaluate("window.__swap.trades"); ok(len(tr) == 3 and tr[-1]['give'] == {'token': 31, 'amount': '5'}, 'A settles exactly 5 of its 20 logs: %s' % json.dumps(tr[-1]))
    b.close()
