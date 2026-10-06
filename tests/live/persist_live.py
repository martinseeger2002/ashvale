"""persist_live.py PHASE - live test of persisted drops (2026-10-06), on the LIVE game with test accounts only.
  drop    @cinderwalker drops GOLD Gold at SPOT, the Bank records a live drop, then waits for its 90 s hold
  reload  @cinderwalker comes back in a fresh session: the drop must lie at SPOT again (put down from the Bank's list)
  pick    @emberwalker comes along, sees it, picks it up; the Bank marks it taken; its deposit is paid the Gold
Reads chain/bank/bank.sqlite read-only for the checks. Stop @cinderwalker's bot first (its browser state is shared)."""
import os, sys, json, time, sqlite3
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(HERE, 'tools'))
from live_play import LiveGame
SPOT, GOLD = (27, 49), int(os.environ.get('GOLD', '25'))
A, Bt = os.environ.get('DROPPER', 'cinderwalker'), os.environ.get('PICKER', 'emberwalker')
DB = os.path.join(HERE, 'chain', 'bank', 'bank.sqlite')
def rows(q, *a):
    c = sqlite3.connect('file:%s?mode=ro' % DB, uri=True); c.row_factory = sqlite3.Row
    try: return [dict(r) for r in c.execute(q, a)]
    finally: c.close()
def say(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def bank_item(g):
    return g.run("return ASH.core.S.ground.filter(q => q.id === 'coins' && Math.abs(q.x - %d) <= 1 && Math.abs(q.y - %d) <= 1).map(q => ({uid: q.uid, n: q.n, bank: q.bank == null ? null : q.bank, x: q.x, y: q.y}))" % SPOT)
phase = sys.argv[1]
if phase == 'drop':
    with LiveGame(A) as g:
        addr = g.run("return ASH.walletState ? ASH.walletState().address : null"); say('cinderwalker', addr)
        say('walk', g.run("return await walkTo(%d, %d, 90000)" % SPOT), 'at', g.run("return [ASH.me.x, ASH.me.y]"))
        have = g.run("return bag().coins || 0"); say('gold in the bag', have)
        if have < GOLD: raise SystemExit('not enough Gold in the bag to drop %d' % GOLD)
        # drop exactly GOLD: the core drops a whole stack, so split it with a store-and-take round trip is not possible here;
        # drop the stack and pick back what is over GOLD is not fair either - so the test drops the whole stack it carries
        slot = g.run("return ASH.me.inv.findIndex(q => q && q.id === 'coins')")
        g.run("ASH.core.cmd('me', { c: 'drop', slot: %d }); await wait(3000); return 1" % slot)
        say('on the ground here', bank_item(g))
        time.sleep(4)
        live = rows("select n, item, units, x, y, live, taken_by from drops where addr=? and item='coins' and live=1 order by n desc limit 1", addr)
        say('the Bank recorded', live)
        say('waiting out the 90 s hold so the Gold goes back to @ashvale'); g.run("await wait(100000); return 1")
        say('after the hold, still on the ground', bank_item(g))
elif phase == 'reload':
    with LiveGame(A) as g:
        g.run("return await walkTo(%d, %d, 90000)" % (SPOT[0] + 4, SPOT[1]))
        for k in range(12):
            it = bank_item(g)
            if it and any(i['bank'] is not None for i in it): say('after a fresh session it lies there again:', it); break
            g.run("await wait(5000); return 1")
        else: say('FAIL: not put back after 60 s', it)
elif phase == 'pick':
    with LiveGame(Bt) as g:
        addr = g.run("return ASH.walletState ? ASH.walletState().address : null"); say('emberwalker', addr)
        g.run("return await walkTo(%d, %d, 120000)" % (SPOT[0] + 1, SPOT[1]))
        it = None
        for k in range(12):
            it = bank_item(g)
            if it: break
            g.run("await wait(5000); return 1")
        say('emberwalker sees', it)
        if not it: raise SystemExit('FAIL: emberwalker does not see the drop')
        b0 = g.run("return bag().coins || 0")
        g.run("ASH.core.cmd('me', { c: 'take', uid: %d }); await wait(4000); return 1" % it[0]['uid'])
        b1 = g.run("return bag().coins || 0"); say('emberwalker gold in the bag', b0, '->', b1)
        time.sleep(3)
        say('the Bank now says', rows("select n, units, taken_by, paid from drops where item='coins' and live=1 and abs(x-?)<=2 and abs(y-?)<=2 order by n desc limit 2", SPOT[0], SPOT[1]))
        say('waiting for the deposit (90 s hold on pickups)'); g.run("await wait(120000); return 1")
        say('Bank requests from emberwalker', rows("select id, paid from reqs where addr=? order by at desc limit 3", addr))
        say('emberwalker wallet now', g.run("return ASH.walletState && ASH.walletState().data ? ASH.walletState().data.gold : null"))
