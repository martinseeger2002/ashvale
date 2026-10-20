"""[Claude 2026-10-19] Doginal Frogs as pets (src/engpet.js buildFrog). Ann opens with two frogs (?pet=frog:4242:..,frog:10000:..),
Ben with nothing. Checks: Ann's pet is Doginal Frog #4242 at her heel; Ben's page draws it; it keeps up when she walks; her menu
shows her other frog and Inspect; Inspect lists the frog's traits (no "None" rows) with its picture; Play and Pet work for a frog;
a frog number past 10,069, or one the registry names as another collection, draws nothing; no page errors.
  python3 tests/frog_pet_pw.py   (server: python3 tests/serve.py 8731 in the tree; SHOTS=dir for screenshots)"""
import os, time
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
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&loopback&seed=frog%d'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SHOTS = os.environ.get('SHOTS')
PETS = "ASH.pet()._pets()"
import json, base64
FX = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'pet_frogs.json')))   # two frogs: the arcade's record + picture
ID = {v['number']: k for k, v in FX.items()}
def arcade(route):   # stands in for the arcade's /r/collection-item/doge/<id> and /content/<id>
    u = route.request.url; i = u.rsplit('/', 1)[-1]
    if i not in FX: return route.continue_()
    if '/r/collection-item/' in u: return route.fulfill(status=200, content_type='application/json', body=json.dumps({k: v for k, v in FX[i].items() if k not in ('png', 'type')} | {'inscription': i}))
    return route.fulfill(status=200, content_type=FX[i]['type'], body=base64.b64decode(FX[i]['png']))
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=ARGS); errs = []
    ctx = b.new_context(viewport={'width': 960, 'height': 640}); ctx.route('**/r/collection-item/doge/*', arcade); ctx.route('**/content/*', arcade)
    pages = []
    for i, q in enumerate(['&pet=frog:4242:%s,frog:10000:%s' % (ID[4242], ID[10000]), '']):
        pg = ctx.new_page(); pg.on('pageerror', lambda e, i=i: errs.append(str(i) + ' ' + str(e) + ' @ ' + str(getattr(e, 'stack', '') or '')[:400]))
        pg.goto(URL % i + q, wait_until='domcontentloaded', timeout=120000)
        check(wait(pg, '!!(window.ASH && ASH.core && ASH.pet && ASH.pet())', 90), 'game %d up with the pets part' % i)
        pages.append(pg)
    ann, ben = pages
    for pg in pages: pg.evaluate("ASH.pet()._load('nTestPetOwner' + Math.random().toString(36).slice(2))")
    check(wait(ann, "(() => { const d = ASH.pet().desc(); return !!d && d.k === 'frog' && d.n === 4242; })()", 20), "Ann's pet is Doginal Frog #4242")
    check(ben.evaluate("ASH.pet().desc()") is None, 'Ben (no Doginal) has no pet')
    check(wait(ann, "(() => { const m = %s.find(x => x.k === 'me'); return !!m && m.vis && m.gap < 1.6; })()" % PETS, 15), "Ann's frog is drawn at her heel")
    check(wait(ben, "%s.some(x => x.k.startsWith('r:') && x.d.k === 'frog' && x.d.n === 4242)" % PETS, 30), "Ben's page draws Ann's frog")
    moved = ann.evaluate("(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); const me = S.players[id]; return ASH.walkTo ? (ASH.walkTo(me.x + 5, me.y), true) : false; })()")
    if moved:
        time.sleep(4)
        check(wait(ann, "(() => { const m = %s.find(x => x.k === 'me'); return !!m && m.gap < 2.2; })()" % PETS, 8), 'after a walk the frog has hopped back to her heel')
    else: print('note: no walkTo hook; walking check skipped')
    m = ann.evaluate("ASH.pet().menu({ kind: 'pet', id: 'me' }).map(o => o.html.replace(/<[^>]+>/g, ''))")
    check('Choose pet' in m and 'Inspect Doginal Frog #4242' in m and not any(x.startswith('Show ') for x in m), "Ann's menu: one Choose pet option, Inspect " + str(m))
    ann.evaluate("ASH.pet().menu({ kind: 'pet', id: 'me' }).find(o => /Inspect/.test(o.html)).fn()")
    dl = ann.evaluate("(document.body.innerText.match(/Doginal Frog #4242[\\s\\S]{0,400}/) || [''])[0]")
    check('Body: Pepe' in dl and 'Trucker Hat (Green)' in dl and 'None' not in dl, 'Inspect lists the frog traits, no None rows: ' + dl[:200].replace('\n', ' | '))
    time.sleep(1.5); im = ann.evaluate("(() => { const i = [...document.querySelectorAll('img')].find(x => x.src.includes('/content/')); return i ? [i.src.split('/content/')[1], i.naturalWidth] : null; })()")
    check(im and im[0].startswith(ID[4242][:20]) and im[1] > 0, "...with the frog's own picture " + str(im))
    ann.keyboard.press('Escape')
    ann.evaluate("ASH.pet().menu({ kind: 'pet', id: 'me' }).find(o => /Choose pet/.test(o.html)).fn()")
    check(wait(ann, "document.querySelectorAll('.help .pcard').length === 2", 10), 'Choose pet opens a card for each pet in the wallet')
    wait(ann, "[...document.querySelectorAll('.help .pcard img')].every(i => i.complete && i.naturalWidth > 0)", 15)
    cards = ann.evaluate("[...document.querySelectorAll('.help .pcard')].map(c => [c.querySelector('.nm').textContent, (c.querySelector('img') || {}).naturalWidth || 0, c.classList.contains('cur')])")
    check(cards == [['Doginal Frog #4242', 500, True], ['Doginal Frog #10000', 1024, False]], 'each card: its name and its own artwork; the walking pet marked ' + str(cards))
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); ann.screenshot(path=os.path.join(SHOTS, 'frog_chooser.png'))
    ann.evaluate("[...document.querySelectorAll('.help .pcard')].find(c => /10000/.test(c.textContent)).click()")
    check(wait(ann, "(() => { const d = ASH.pet().desc(); return d && d.k === 'frog' && d.n === 10000; })()", 5) and ann.evaluate("getComputedStyle(document.querySelector('.help')).display") == 'none', 'tapping a card shows Doginal Frog #10000 and closes the chooser')
    check(wait(ben, "%s.some(x => x.k.startsWith('r:') && x.d.k === 'frog' && x.d.n === 10000)" % PETS, 30), "Ben's page follows Ann's change")
    # [2026-10-19] the operator: the chosen pet is saved; a new session starts with it (the save the Bank keeps, not this device's memory)
    sv = ann.evaluate("(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^ashvale3d\\.save/.test(k)) { try { return JSON.parse(localStorage.getItem(k)).pet || null; } catch (e) {} } } return 'no save'; })()")
    check(sv == 'frog:10000', 'the choice is in the game save: ' + str(sv))
    ann.evaluate("localStorage.removeItem('ashvale.pet')")
    ann.goto((URL % 0).replace('fresh&', '') + '&pet=frog:4242:%s,frog:10000:%s' % (ID[4242], ID[10000]), wait_until='domcontentloaded', timeout=120000)
    check(wait(ann, '!!(window.ASH && ASH.core && ASH.pet && ASH.pet())', 90), 'a new session')
    ann.evaluate("ASH.pet()._load('nTestPetOwner' + Math.random().toString(36).slice(2))")
    check(wait(ann, "(() => { const d = ASH.pet().desc(); return !!d && d.k === 'frog' && d.n === 10000; })()", 20), 'a new session starts with the chosen frog #10000, not the wallet\'s first')
    gap = "(ASH.pet()._pets().find(x => x.k === 'me') || {}).gap"
    ann.evaluate("ASH.pet().setMode('play')")
    acts = set()
    for _ in range(20):
        time.sleep(0.5); a2 = ann.evaluate("(ASH.pet()._pets().find(x => x.k === 'me') || {}).act")
        if a2: acts.add(a2)
    check(len(acts) >= 1, 'Play: the frog picks things to do: %s' % sorted(acts))
    ann.evaluate("ASH.pet().setMode('heel')")
    ann.evaluate("ASH.pet().menu({ kind: 'pet', id: 'me' }).find(o => /^Pet /.test(o.html.replace(/<[^>]+>/g, ''))).fn()")
    wait(ann, '(%s || 9) < 1.0' % gap, 8); g = ann.evaluate(gap)   # from as far as the Play circle (5 m)
    check(g is not None and g < 1.0, 'Pet: the frog comes to its owner (gap %.2f)' % (g or -1))
    n0 = ann.evaluate("%s.length" % PETS)
    ent = "{ root: { position: { x: 0, y: 0, z: 0 }, visible: true } }"
    ann.evaluate("ASH.pet().net('bogus', { k: 'frog', n: 10070, i: '%s' }, %s)" % (ID[4242], ent))
    ann.evaluate("ASH.pet().net('bogus2', { k: 'dd', n: 4242, i: '%s' }, %s)" % (ID[4242], ent)); time.sleep(2)   # a frog's record claimed as a Doginal Dog
    check(ann.evaluate("%s.length" % PETS) == n0, 'a frog past #10069, or a frog claimed as a dog, draws nothing')
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); ann.evaluate("ASH.pet().setMode('heel')"); time.sleep(3)
        ann.screenshot(path=os.path.join(SHOTS, 'frog_ann.png')); ben.screenshot(path=os.path.join(SHOTS, 'frog_ben.png'))
    check(not errs, 'no page errors ' + str(errs[:3]))
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
