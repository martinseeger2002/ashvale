"""cloud_save_live.py - the save at the Bank, live (2026-10-07: "anyone can login on their account from any device and
being the exact same game state"). As @emberwalker (a test account; @cinderwalker is the bot's): note the character, walk a few
steps, let the save reach the Bank, then make this browser a NEW DEVICE - stop the game, wipe its arcade save and its chest
ledger - reload, and check the game came back from the Bank exactly: same spot, same bag, same skills, same quests.
The wiped save is backed up first (chain/cloud_test_backup.json, 0600) and put back if anything goes wrong."""
import os, sys, json, time, sqlite3
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(HERE, 'tools'))
from live_play import LiveGame
TAG = os.environ.get('TAG', 'emberwalker')
DB = os.path.join(HERE, 'chain', 'bank', 'bank.sqlite')
SNAP = "return { at: [ASH.me.x, ASH.me.y], inv: ASH.me.inv.map(s => s ? s.id + ':' + s.n : '').join(','), eq: JSON.stringify(Object.fromEntries(Object.entries(ASH.me.eq || {}).map(([k, v]) => [k, v && v.id]))), xp: JSON.stringify(ASH.me.xp), q: JSON.stringify(ASH.me.quests) }"
def say(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
fails = 0
def ok(c, m):
    global fails
    if not c: fails += 1
    say('ok  ' if c else 'FAIL', m)
CMP = "const e = ASH.core.exportPlayer(ASH.pid); return { pos: JSON.stringify(e.pos), inv: JSON.stringify(e.inv), eq: JSON.stringify(e.eq), xp: JSON.stringify(e.xp), q: JSON.stringify(e.quests) }"
if '--resume' in sys.argv:   # this browser's save was already wiped: start, and the game must come back from the Bank = the backup
    bk = json.load(open(os.path.join(HERE, 'chain', 'cloud_test_backup.json')))
    with LiveGame(TAG) as g:
        g.run("await wait(4000); return 1"); after = g.run(CMP)
        for k, src in (('pos', 'pos'), ('inv', 'inv'), ('eq', 'eq'), ('xp', 'xp'), ('q', 'quests')):
            want = json.dumps(bk.get(src), separators=(',', ':')); ok(after[k] == want, k + (' the same as the backup' if after[k] == want else ': %s -> %s' % (want[:150], after[k][:150])))
        if fails: g.run("ASH.stop(); const S = await arcade.storage.ready; await S.setItem('ashvale3d.save.v1', %s); return 1" % json.dumps(json.dumps(bk))); say('put the backed-up save back')
    print('ALL OK' if not fails else '%d FAILED' % fails); sys.exit(1 if fails else 0)
with LiveGame(TAG) as g:
    addr = g.run("return ASH.walletState ? ASH.walletState().address : null"); say(TAG, addr)
    x0, y0 = g.run("return [ASH.me.x, ASH.me.y]")
    say('walk', g.run("return await walkTo(%d, %d, 60000)" % (x0 + 3, y0)))
    say('waiting for the save to reach the Bank'); g.run("await wait(32000); return 1")
    before = g.run(SNAP); say('before', before['at'])
    row = sqlite3.connect('file:%s?mode=ro' % DB, uri=True).execute('select id, length(blob) from saves where addr=?', (addr,)).fetchone()
    ok(bool(row), 'the Bank holds a save for %s (%s)' % (TAG, row))
    # a NEW DEVICE: stop the game (no save on the way out), back up and wipe this browser's save and ledger, reload
    old = g.run("ASH.stop(); const S = await arcade.storage.ready; const v = await S.getItem('ashvale3d.save.v1'); return v")
    bk = os.path.join(HERE, 'chain', 'cloud_test_backup.json'); open(bk, 'w').write(old or ''); os.chmod(bk, 0o600)
    g.run("const S = await arcade.storage.ready; await S.setItem('ashvale3d.save.v1', ''); return 1")   # (the game frame is sandboxed: no localStorage there at all)
    say('wiped this device; reloading')
    pg = g.B.pg; pg.reload(timeout=180000); g.fr = None
    for _ in range(90):
        for f in pg.frames:
            try:
                if f.evaluate("!!(window.ASH && window.ASH.core && window.ASH.me)"): g.fr = f; break
            except Exception: pass
        if g.fr: break
        pg.wait_for_timeout(1000)
    if not g.fr: raise SystemExit('the game did not start again')
    g.run("await wait(4000); return 1")
    after = g.run(SNAP)
    for k in ('at', 'inv', 'eq', 'xp', 'q'): ok(after[k] == before[k], k + (' the same' if after[k] == before[k] else ': %s -> %s' % (str(before[k])[:120], str(after[k])[:120])))
    if fails and old:
        g.run("ASH.stop(); const S = await arcade.storage.ready; await S.setItem('ashvale3d.save.v1', %s); return 1" % json.dumps(old)); say('put the backed-up save back')
print('ALL OK' if not fails else '%d FAILED' % fails)
