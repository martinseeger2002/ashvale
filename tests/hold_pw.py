"""ground holds (2026-10-04): a drop waits 90 s before going back to @ashvale; picking it up again sends nothing;
another player taking it sends it at once. A stand-in fetch records every /r/send."""
import json, os, time
from playwright.sync_api import sync_playwright
URL = os.environ.get('ASH_URL', 'http://127.0.0.1:8738/dist/ashvale3d.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
STUB = """(() => { window.__sends = []; const f0 = window.fetch; window.fetch = (u, o) => { if (String(u).startsWith('/r/send')) { if (o && o.method === 'POST') { window.__sends.push(JSON.parse(o.body)); return Promise.resolve(new Response(JSON.stringify({ id: 's' + window.__sends.length, status: 'pending' }), { status: 202 })); } return Promise.resolve(new Response(JSON.stringify({ status: 'sent', txid: 'tx' }), { status: 200 })); } return f0(u, o); }; })()"""
fails = 0
def ok(c, m):
    global fails
    print(('ok   ' if c else 'FAIL ') + m, flush=True); fails += 0 if c else 1
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(); ctx.add_init_script(STUB); pg = ctx.new_page()
    pg.goto(URL + '?fresh&nocreator&seed=hold', wait_until='domcontentloaded', timeout=120000); pg.wait_for_timeout(9000)
    E = lambda js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
    E("(() => { for (let i = 0; i < 28; i++) ASH.me.inv[i] = null; ASH.give('sword_t1', 1); const W = ASH.walletState(); W.address = 'nHOLD'; W.status = 'ready'; W.data = { address: 'nHOLD', gear: { sword_t1: ['pc1'] }, tokens: {}, pids: { coins: 26 }, gold: 0, raw: {}, pieces: [], at: Date.now() }; ASH.chest.state(); })()")
    slot = E("ASH.me.inv.findIndex(q => q && q.id === 'sword_t1')"); E("i => ASH.core.cmd('me', { c: 'drop', slot: i })", slot)
    pg.wait_for_timeout(12000); ok(E("window.__sends.length") == 0, 'a fresh drop sends nothing for 90 s (%d sends after 12 s)' % E("window.__sends.length"))
    g = E("(() => { const g = ASH.core.S.ground.find(q => q.id === 'sword_t1'); return g && [g.uid, g.x, g.y]; })()")
    E("([uid]) => ASH.core.cmd('me', { c: 'take', uid })", g); pg.wait_for_timeout(3000)
    ok(E("ASH.core.invCount(ASH.me, 'sword_t1')") == 1 and not E("ASH.chest.state().loose.sword_t1"), 'picked straight back up: yours again, nothing to deposit')
    E("i => ASH.core.cmd('me', { c: 'drop', slot: i })", E("ASH.me.inv.findIndex(q => q && q.id === 'sword_t1')")); pg.wait_for_timeout(1500)
    g = E("(() => { const g = ASH.core.S.ground.find(q => q.id === 'sword_t1'); return g && [g.uid, g.x, g.y]; })()")
    E("([uid, x, y]) => { ASH.core.S.ground.splice(ASH.core.S.ground.findIndex(q => q.uid === uid), 1); ASH.__fire && 0; }", g)
    E("([uid, x, y]) => ASH.chest.state() && ASH.chestEventForTest && ASH.chestEventForTest({ e: 'take', p: 'someone', g: uid, id: 'sword_t1', n: 1, x, y })", g)
    pg.wait_for_timeout(8000)
    s = E("window.__sends"); ok(len(s) == 1 and s[0].get('inscription') == 'pc1' and s[0].get('silent') is True, 'another player took it: the exact piece goes back at once, silently (%s)' % json.dumps(s))
    print('FAILED: %d' % fails if fails else 'ALL OK'); b.close()
