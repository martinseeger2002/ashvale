"""cinder_play.py - keep @cinderwalker playing on the LIVE game in short, logged steps (2026-10-05: he should
be seen playing, not standing). Each step is one small play_lib call, so a stall shows at once in the log, and a
stuck step never stops the run. Plan: gear up (sword, bread), train on rats, then wolves (Maren's step 1), hand in.
  python3 tools/cinder_play.py [minutes]        log: chain/cinder_play.log"""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_play import LiveGame
MIN = float(sys.argv[1]) if len(sys.argv) > 1 else 30
LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'chain', 'cinder_play.log')
def log(*a):
    line = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a); print(line, flush=True); open(LOG, 'a').write(line + '\n')
with LiveGame('cinderwalker') as g:
    R = lambda js: g.run(js)
    R("ASH.core.cmd('me', { c: 'look', name: 'Cinderwalker' }); return 1")
    t0 = time.time(); log('start', R("return [me(), bag()]"))
    if not R("return !!bag().sword_t1 || !!(ASH.me.eq.weapon)"):
        log('buy sword', R("return await buy('garrick', 'sword_t1', 1)")); log('equip', R("return await equip('sword_t1')"))
    if (R("return bag().bread || 0") or 0) < 3: log('buy bread', R("return await buy('tam', 'bread', 5)"))
    while time.time() - t0 < MIN * 60:
        st = R("return { lv: ASH.core.lv(ASH.me, 'attack'), hp: ASH.me.hp, max: ASH.core.maxHp(ASH.me), bread: bag().bread || 0, gold: bag().coins || 0, at: [ASH.me.x, ASH.me.y], q: ASH.me.quests.ashen_crown || null }")
        target = 'wolf' if st['lv'] >= 8 and st['max'] >= 14 else 'rat'
        if st['bread'] == 0 and st['gold'] >= 10: log('restock', R("return await buy('tam', 'bread', 5)")); continue
        if st['hp'] < st['max'] * 0.5 and st['bread']: R("return await eat()")
        near = R("return nearest(%r)" % target)
        if not near or near['dist'] > 25:
            spot = (28, 31) if target == 'rat' else (19, 16)
            log('go to', target, 'area', spot, R("return await walkTo(%d, %d, 60000)" % spot)); continue
        ok = R("return await kill(%r, 45000)" % target); got = R("return await pickUp(2)")
        log('fight', target, 'won' if ok else 'not yet', 'loot', got, 'state', st)
        q = st.get('q') or {}
        if q.get('step') == 1 and q.get('n', 0) >= 10: log('hand in', R("await walkTo(15, 51, 90000); return await talk('maren')")); 
    log('end', R("return report('cinder_play end')"))
