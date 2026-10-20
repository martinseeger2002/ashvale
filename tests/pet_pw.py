"""[Claude 2026-10-17] pets from Doginals (src/engpet.js). Ann opens with ?pet=add:165, Ben with nothing.
Checks: Ann's pet is ADD #165 and stands at her heel; Ben has none; Ben's page draws Ann's pet (the {pt} message); Ann walks
and the pet keeps up; Ben picks Doginal Dog #2608 and Ann sees it; a bogus {pt} draws nothing; no page errors.
  python3 tests/pet_pw.py   (server: python3 tests/serve.py 8731 in the tree; SHOTS=dir for screenshots)"""
import os, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
fails = []
def check(c, m): print(('ok   ' if c else 'FAIL ') + m); c or fails.append(m)
def wait(pg, js, t=40):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.25)
    return False
PORT = os.environ.get('PORT', '8731')
URL = 'http://127.0.0.1:' + PORT + '/dist/ashvale3d.html?fresh&nocreator&loopback&seed=pet%d'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SHOTS = os.environ.get('SHOTS')
PETS = "ASH.pet()._pets()"
import json, base64
FX = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'pet_dogs.json')))   # two dogs: the arcade's record + picture
ID = {v['number']: k for k, v in FX.items()}
def arcade(route):   # stands in for the arcade's /r/collection-item/doge/<id> and /content/<id>
    u = route.request.url; i = u.rsplit('/', 1)[-1]
    if i not in FX: return route.continue_()
    if '/r/collection-item/' in u: return route.fulfill(status=200, content_type='application/json', body=json.dumps({k: v for k, v in FX[i].items() if k != 'png'} | {'inscription': i}))
    return route.fulfill(status=200, content_type='image/png', body=base64.b64decode(FX[i]['png']))
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=ARGS); errs = []
    ctx = b.new_context(viewport={'width': 960, 'height': 640}); ctx.route('**/r/collection-item/doge/*', arcade); ctx.route('**/content/*', arcade)
    pages = []
    for i, q in enumerate(['&pet=add:165:%s,dd:2608:%s' % (ID[165], ID[2608]), '']):
        pg = ctx.new_page(); pg.on('pageerror', lambda e, i=i: errs.append(str(i) + ' ' + str(e) + ' @ ' + str(getattr(e,'stack','') or '')[:400]))
        pg.goto(URL % i + q, wait_until='domcontentloaded', timeout=120000)
        check(wait(pg, '!!(window.ASH && ASH.core && ASH.pet && ASH.pet())', 90), 'game %d up with the pets part' % i)
        pages.append(pg)
    ann, ben = pages
    for pg in pages: pg.evaluate("ASH.pet()._load('nTestPetOwner' + Math.random().toString(36).slice(2))")   # a signed-in player's wallet read
    check(wait(ann, "(() => { const d = ASH.pet().desc(); return !!d && d.k === 'add' && d.n === 165; })()", 20), "Ann's pet is ADD #165")
    check(ben.evaluate("ASH.pet().desc()") is None, 'Ben (no Doginal) has no pet')
    check(wait(ann, "(() => { const m = %s.find(x => x.k === 'me'); return !!m && m.vis && m.gap < 1.6; })()" % PETS, 10), "Ann's pet is drawn at her heel")
    check(wait(ben, "%s.some(x => x.k.startsWith('r:') && x.d.k === 'add' && x.d.n === 165)" % PETS, 30), "Ben's page draws Ann's pet")
    # Ann walks a few tiles east: the pet follows
    ann.evaluate("(() => { const k = new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }); })()")
    moved = ann.evaluate("(() => { const S = ASH.core.S, id = Object.keys(S.players).find(k => !S.players[k].puppet); const me = S.players[id]; return ASH.walkTo ? (ASH.walkTo(me.x + 5, me.y), true) : false; })()")
    if moved:
        time.sleep(4)
        check(wait(ann, "(() => { const m = %s.find(x => x.k === 'me'); return !!m && m.gap < 2.2; })()" % PETS, 8), 'after a walk the pet is at her heel again')
    else: print('note: no walkTo hook; walking check skipped')
    ben.evaluate("ASH.pet().choose({ k: 'dd', n: 2608, i: '%s' })" % ID[2608])
    check(wait(ann, "%s.some(x => x.k.startsWith('r:') && x.d.k === 'dd' && x.d.n === 2608)" % PETS, 30), "Ann's page draws Ben's Doginal Dog #2608")
    m = ann.evaluate("ASH.pet().menu({ kind: 'pet', id: 'me' }).map(o => o.html.replace(/<[^>]+>/g, ''))")
    check('Choose pet' in m and 'Inspect Anti Doginal Dog #165' in m, "Ann's own pet menu: Choose pet, inspect " + str(m))
    ann.evaluate("ASH.pet().menu({ kind: 'pet', id: 'me' }).find(o => /Choose pet/.test(o.html)).fn()")   # [2026-10-19] a card per pet
    check(wait(ann, "document.querySelectorAll('.help .pcard').length === 2", 10), 'Choose pet: a card per dog')
    ann.evaluate("[...document.querySelectorAll('.help .pcard')].find(c => /2608/.test(c.textContent)).click()")
    check(wait(ann, "(() => { const d = ASH.pet().desc(); return d && d.k === 'dd' && d.n === 2608; })()", 5), 'choosing it shows Doginal Dog #2608')
    check(wait(ben, "%s.some(x => x.k.startsWith('r:') && x.d.k === 'dd' && x.d.n === 2608 && !x.d.bogus)" % PETS, 30), "Ben's page follows Ann's change")
    rk = ben.evaluate("(%s.find(x => x.k.startsWith('r:') && x.d.n === 2608) || {}).k" % PETS)
    bm = ben.evaluate("ASH.pet().menu({ kind: 'pet', id: '%s' }).map(o => o.html.replace(/<[^>]+>/g, ''))" % rk)
    check(bm == ['Inspect Doginal Dog #2608'], "another player's pet: Inspect only " + str(bm))
    ben.evaluate("ASH.pet().menu({ kind: 'pet', id: '%s' })[0].fn()" % rk)
    dl = ben.evaluate("(document.body.innerText.match(/Doginal Dog #2608[\\s\\S]{0,400}/) || [''])[0]")
    check('Fur Pattern' in dl and 'Dalmatian' in dl, 'Inspect shows the number and traits: ' + dl[:160].replace('\n', ' | '))
    time.sleep(1.5); im = ben.evaluate("(() => { const i = [...document.querySelectorAll('img')].find(x => x.src.includes('/content/')); return i ? [i.src.split('/content/')[1], i.naturalWidth] : null; })()")
    check(im and im[0].startswith(ID[2608][:20]) and im[1] > 0, "...with the dog's own picture from Dogecoin Arcade " + str(im))
    ben.screenshot(path=os.path.join(os.environ.get('PET_SHOTS', '/tmp'), 'pet_inspect.png'))
    ann.evaluate("ASH.petToggle()")
    check(wait(ann, "!ASH.pet()._pets().some(x => x.k === 'me') && ASH.pet().desc() === null", 5), 'Settings: Pet hidden takes it away')
    check(wait(ben, "!%s.some(x => x.k.startsWith('r:') && x.d.n === 2608)" % PETS, 30), '...for everyone')
    ann.evaluate("ASH.petToggle()")
    check(wait(ann, "ASH.pet()._pets().some(x => x.k === 'me')", 5), 'Pet shown brings it back')
    # [2026-10-18] heel ring, play, playing together, petting
    gap = "(ASH.pet()._pets().find(x => x.k === 'me') || {}).gap"
    time.sleep(3); g = ann.evaluate(gap)
    check(g is not None and 0.45 <= g <= 1.45, 'Heel: standing, the pet is in the ring round its owner, never on top (gap %.2f)' % (g or -1))
    m = ann.evaluate("ASH.pet().menu({ kind: 'pet', id: 'me' }).map(o => o.html.replace(/<[^>]+>/g, ''))")
    check(any(x.startswith('Play ') for x in m) and any(x.startswith('Pet ') for x in m), 'the menu offers Play and Pet ' + str(m))
    ann.evaluate("ASH.pet().setMode('play')"); ben.evaluate("ASH.pet().setMode('play')")
    check(wait(ann, "ASH.pet()._pets().find(x => x.k === 'me').mode === 'play'", 5), 'Play: the mode is set')
    check(wait(ben, "%s.some(x => x.k.startsWith('r:') && x.mode === 'play')" % PETS, 30), "...and the other player's page knows it")
    acts = set()
    for _ in range(24):
        time.sleep(0.5); a2 = ann.evaluate("(ASH.pet()._pets().find(x => x.k === 'me') || {}).act")
        if a2: acts.add(a2)
    check(len(acts) >= 1, 'Play: the pet picks things to do: %s' % sorted(acts))
    gaps = []
    for _ in range(10): time.sleep(0.4); gaps.append(ann.evaluate(gap))
    check(all(x is not None and x >= 0.35 for x in gaps) and max(gaps) <= 6.5, 'Play: it stays in the wide circle and off its owner (%.2f..%.2f)' % (min(gaps), max(gaps)))
    ch = wait(ann, "ASH.pet()._pets().some(x => x.act === 'chase')", 40)
    check(ch, 'two dogs in Play near each other play together (a chase)')
    ann.evaluate("ASH.pet().setMode('heel')"); ann.evaluate("ASH.pet().petNow(); ASH.pet()._send && 0")
    ann.evaluate("ASH.pet().menu({ kind: 'pet', id: 'me' }).find(o => /^Pet /.test(o.html.replace(/<[^>]+>/g, ''))).fn()")
    time.sleep(3); g = ann.evaluate(gap)
    check(g is not None and g < 1.0, 'Pet: the dog comes to its owner (gap %.2f)' % (g or -1))
    n0 = ann.evaluate("%s.length" % PETS)
    ann.evaluate("ASH.pet().net('bogus', { k: 'add', n: 99999, i: '%s' }, { root: { position: { x: 0, y: 0, z: 0 }, visible: true } })" % ID[165])
    ann.evaluate("ASH.pet().net('bogus2', { k: 'dd', n: 77, i: '%s' }, { root: { position: { x: 0, y: 0, z: 0 }, visible: true } })" % ID[165]); time.sleep(2)   # the registry says #165, not #77
    check(ann.evaluate("%s.length" % PETS) == n0, 'a {pt} whose number does not match the registry draws nothing')
    pk = ann.evaluate("(() => { const d = ASH.pet().desc(); return d && !d.px ? JSON.stringify({ pt: d }).length : 0; })()")
    check(0 < pk < 200, 'our pet message is small, no picture: everyone reads it from Dogecoin Arcade (%d bytes)' % pk)
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); time.sleep(2); ann.screenshot(path=os.path.join(SHOTS, 'pet_ann.png')); ben.screenshot(path=os.path.join(SHOTS, 'pet_ben.png'))
    check(not errs, 'no page errors ' + str(errs[:3]))
    b.close()
print(('%d FAILED' % len(fails)) if fails else 'ALL OK')
