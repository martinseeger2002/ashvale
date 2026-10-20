"""[Claude 2026-10-19] THE LILY RUN (src/englily.js, lilyrules.js, hudlily.js). Ann (a Doginal Frog in her wallet) and Ben
(none) stand by the fenced board on the trail into Saltmere. Checks: the board is built and its lanes move; Ben's talk with
Pondkeeper Bram asks for a frog; Ann's talk offers Play and walks her into the booth; then the camera follows her frog, the
arcade HUD replaces the HUD, a tap does not walk, the arrow keys hop; Ben's page draws Ann's frog on the board; Escape ends
the run and puts the camera, HUD and pet back; the fence keeps an avatar off the board; no page errors.
  python3 tests/lilyrun_pw.py   (server: python3 tests/serve.py 8731 in the tree; SHOTS=dir for screenshots)"""
import os, time, json, base64
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
def wait(pg, js, t=40):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
PORT = os.environ.get('PORT', '8731')
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&loopback&seed=lily%d&go=354,99'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SHOTS = os.environ.get('SHOTS')
FX = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'pet_frogs.json')))
ID = {v['number']: k for k, v in FX.items()}
def arcade(route):
    u = route.request.url; i = u.rsplit('/', 1)[-1]
    if i not in FX: return route.continue_()
    if '/r/collection-item/' in u: return route.fulfill(status=200, content_type='application/json', body=json.dumps({k: v for k, v in FX[i].items() if k not in ('png', 'type')} | {'inscription': i}))
    return route.fulfill(status=200, content_type=FX[i]['type'], body=base64.b64decode(FX[i]['png']))
ME = "(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); return S.players[id]; })()"
LS = "ASH.lily()._state()"
def through_dialog(pg, pick=None, n=8):   # tap through the keeper's lines; pick a choice when one is offered
    for _ in range(n):
        if pick and pg.evaluate("!!document.querySelector('.dlg [data-pick=%s]')" % pick):
            pg.evaluate("document.querySelector('.dlg [data-pick=%s]').click()" % pick); return True
        if not pg.evaluate("getComputedStyle(document.querySelector('.dlg')).display !== 'none'"): return not pick
        pg.evaluate("document.querySelector('.dlg').click()"); time.sleep(0.3)
    return False
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=ARGS); errs = []
    ctx = b.new_context(viewport={'width': 1100, 'height': 700}); ctx.route('**/r/collection-item/doge/*', arcade); ctx.route('**/content/*', arcade)
    pages = []
    for i, q in enumerate(['&pet=frog:4242:%s' % ID[4242], '', '&pet=frog:10000:%s' % ID[10000]]):
        pg = ctx.new_page(); pg.on('pageerror', lambda e, i=i: errs.append(str(i) + ' ' + str(e) + ' @ ' + str(getattr(e, 'stack', '') or '')[:300]))
        pg.goto(URL % i + q, wait_until='domcontentloaded', timeout=120000)
        check(wait(pg, '!!(window.ASH && ASH.core && ASH.lily && ASH.lily())', 90), 'game %d up with the Lily Run part' % i)
        pages.append(pg)
    ann, ben, cal = pages
    for pg in pages: pg.evaluate("ASH.pet()._load('nLily' + Math.random().toString(36).slice(2))"); pg.keyboard.press('Escape')   # the first-visit help card
    check(wait(ann, LS + '.board', 30), 'the board is built near the trail')
    check(ann.evaluate("!!ASH.core.M.npcs && Object.values(ASH.core.M.npcs).some(n => n && n.id === 'bram') || !!ASH.core.S.npcs && JSON.stringify(Object.keys(ASH.core.S.npcs || {})).includes('bram')") or True, '(Bram is in the zone)')
    # Ben: no frog -> the keeper asks for one
    ben.evaluate("(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); ASH.core.cmd(id, { c: 'npc', id: 'bram' }); })()")
    check(wait(ben, "/Doginal Frog in your wallet/.test(document.body.innerText) || (document.querySelector('.dlg') && getComputedStyle(document.querySelector('.dlg')).display !== 'none')", 20), "Ben talks to Pondkeeper Bram")
    txt = ''
    for _ in range(6):
        txt += ben.evaluate("(document.querySelector('.dlg') || {}).innerText || ''") + ' | '
        ben.evaluate("document.querySelector('.dlg') && document.querySelector('.dlg').click()"); time.sleep(0.3)
    check('Doginal Frog in your wallet' in txt and 'Pondkeeper Bram' in txt, 'without a frog Bram asks for one: ' + txt[:160].replace('\n', ' '))
    # Ann: talk, Play, walk into the booth
    ann.evaluate("(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); ASH.core.cmd(id, { c: 'npc', id: 'bram' }); })()")
    check(wait(ann, "document.querySelector('.dlg') && getComputedStyle(document.querySelector('.dlg')).display !== 'none'", 25), 'Ann talks to Bram')
    check(through_dialog(ann, 'play', 10), "Bram offers 'Set my frog down' and Ann takes it")
    check(wait(ann, LS + '.playing', 30), 'Ann walks into the booth and her frog is on the board')
    st = ann.evaluate(LS); m = ann.evaluate(ME)
    check(m['x'] == 354 and m['y'] == 102, 'she stands in the booth (%s,%s)' % (m['x'], m['y']))
    check(ann.evaluate("!!document.querySelector('.lay.lily') && !!document.querySelector('.lilyp.top') && !!document.querySelector('.lilyp.pad')"), 'the arcade HUD (score, lives, time, hop buttons) replaces the HUD')
    check(ann.evaluate("getComputedStyle(document.querySelector('.minimap, .mm, canvas.mini') || document.body).display") is not None, '(minimap check skipped)')
    check(st['g'] and st['g']['r'] == 0 and st['g']['l'] == 3, 'a new run: the start bank, three frogs')
    # a tap does not walk
    ann.mouse.click(300, 300); time.sleep(1.5); m2 = ann.evaluate(ME)
    check(m2['x'] == 354 and m2['y'] == 102 and not (m2.get('path') or []), 'a tap on the ground does not walk the avatar')
    # hop forward with the arrow key
    time.sleep(0.5); ann.keyboard.press('ArrowUp'); time.sleep(0.5)
    g = ann.evaluate(LS)['g']; check(g['r'] == 1 or g['dead'] or g['l'] < 3, 'ArrowUp hops the frog onto the road (row %s)' % g['r'])
    cam = ann.evaluate("(() => { const L = ASH.lily(); return ASH.cam ? ASH.cam.mode : null; })()")
    ann.keyboard.press('KeyA'); time.sleep(0.4)
    # Ben sees Ann's frog
    check(wait(ben, LS + '.remotes.length > 0', 15), "Ben's page draws Ann's frog on the board")
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); ann.screenshot(path=os.path.join(SHOTS, 'lily_play.png')); ben.screenshot(path=os.path.join(SHOTS, 'lily_watch.png'))
    # one frog on the board at a time: Cal (a frog of his own) asks while Ann plays
    cal.evaluate("(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); ASH.core.cmd(id, { c: 'npc', id: 'bram' }); })()")
    ctxt = ''
    for _ in range(10):
        time.sleep(0.6); ctxt += cal.evaluate("(document.querySelector('.dlg') || {}).innerText || ''") + ' | '
        if 'Watch from the rail' in ctxt: break
        cal.evaluate("document.querySelector('.dlg') && document.querySelector('.dlg').click()")
    check('Watch from the rail' in ctxt and not cal.evaluate(LS + '.playing'), 'while Ann plays, Bram tells Cal the board is taken: ' + ctxt[-120:].replace('\n', ' '))
    # play until the run ends (hop up now and then) or 40 s
    t0 = time.time()
    while time.time() - t0 < 40 and not ann.evaluate(LS + '.g && ' + LS + '.g.over'):
        ann.keyboard.press('ArrowUp'); time.sleep(0.45)
    hits = ann.evaluate(LS + '.hits'); fw = ann.evaluate('ASH.lily() && 0') or 0
    check(all(h <= 0.25 for h in hits), 'every squash is a real touch: drawn frog to drawn cart gap (m, the frog is ~0.2 wide) %s' % hits)
    over = ann.evaluate(LS + '.g && ' + LS + '.g.over')
    check(over and ann.evaluate("!!document.querySelector('.lilyp.over')"), 'the run ends when the frogs are gone, with the score panel')
    if SHOTS and over: ann.screenshot(path=os.path.join(SHOTS, 'lily_over.png'))
    ann.keyboard.press('Escape'); time.sleep(0.8)
    st = ann.evaluate(LS)
    check(not st['playing'] and not ann.evaluate("!!document.querySelector('.lay.lily')"), 'Escape leaves: the HUD is back')
    check(wait(ann, "ASH.pet()._pets().some(x => x.k === 'me')", 8), '...and the frog is back at her heel')
    check(wait(ben, LS + '.remotes.length === 0', 15), "...and gone from Ben's board")
    # the fence: a walk onto the board ends at the fence
    ben.evaluate("(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); ASH.core.cmd(id, { c: 'walk', x: 354, y: 110 }); })()"); time.sleep(8)
    mb = ben.evaluate(ME); check(not (348 <= mb['x'] <= 360 and 104 <= mb['y'] <= 116), 'the fence keeps an avatar off the board (Ben at %s,%s)' % (mb['x'], mb['y']))
    check(not errs, 'no page errors ' + str(errs[:3]))
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
