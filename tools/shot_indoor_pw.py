#!/home/you/.pyenv/versions/3.11.9/bin/python3
"""Inside a building, two things must be true (2026-10-13): the sun must not shine in through the roof that is
taken away while you are inside - it threw a bright slab of light and hard shadows across the room - and the weather
must not fall on your head.

The sun half is proved by comparison, not by eye. The camera never draws the roof while you are inside it, so the room
in the photograph is the same room either way; what has to differ is the LIGHT. The fix moves the hidden roof to the
SHADOWED layer, which the sun's shadow camera sees and no camera draws; the bug it replaces set visible=false, which
took the pieces out of the shadow map as well. So this photographs the room both ways, three times over, and measures the
brightest tenth of the middle of the picture: taking the roof out of the shadow map must light up a patch of it. That
control is the old code itself - rf.g.visible = false, which the module no longer touches anywhere, so writing it from
here is exactly the state the bug was.

The sky is parked in the middle of a day with ?skyday (the game's own knob, src/engsky.js), which moves the sun without
speeding the clock up - a time-lapse would move the light between the two halves of a pair and, worse, the rule side
puts the weather away when TL.n > 1 (engine.js), and the weather half needs the real thing. Sunlight matters because at
night the sun is not what lights the room, and a low sun sends the light in through the door.

The weather half is a second page: under a roof no drops are in the air and no fog sheets are up (shelter 1), out in the
street they are (shelter 0), with the shelter eased and waited for - see settle().

Usage: tools/shot_indoor_pw.py  (server: python3 -m http.server 8731 in ~/ashvale3d)
Shots in tests/shots/indoor_*.png"""
import json
import os
import time
from io import BytesIO
from PIL import Image
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&seed=indoor1'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage']
SHOP = (10, 44, 3.1416, 0.42, 9.0)        # the General Store's floor, looking north along the room
DOOR = (10, 48, 3.1416, 0.30, 13.0)       # opposite pavement, the whole shop front and the ground beside it
SUN_UP = 1.6                             # sun.intensity is 0.5 + 1.8 x the day factor while the sun is up: 1.6 is well up

# What the scene graph says about the roof over our head: is it still a shadow caster, does the main camera draw any of
# it, does the sun's shadow camera. The sun light is found in the scene rather than handed out by the engine - a test
# must not need a new debug knob to be able to see the bug.
DIAG = """(() => {
  const me = ASH.me, roofs = [];
  let sun = null; ASH.scene.traverse(o => { if (o.isDirectionalLight && o.castShadow) sun = o; });
  const sh = sun ? sun.shadow.camera.layers : null;
  for (const r of ASH.regions) if (r.built) for (const rf of r.built.roofs) {
    const inside = me.x >= rf.x0 && me.x <= rf.x1 && me.y >= rf.y0 && me.y <= rf.y1;
    let n = 0, cast = 0, drawn = 0, mask = -1, shaded = 0;
    rf.g.traverse(o => { if (o.isMesh || o.isInstancedMesh) { n++; if (o.castShadow) cast++;
      if (o.layers.test(ASH.camera.layers)) drawn++; if (sh && o.layers.test(sh)) shaded++; mask = o.layers.mask; } });
    if (inside || n) roofs.push({ at: [rf.x0, rf.y0], inside, group: rf.g.visible, n, cast, drawn, shaded, mask });
  }
  const inb = roofs.filter(r => r.inside);
  return { roofs: inb.concat(roofs.filter(r => !r.inside).slice(0, 2)), inside: inb.length > 0,
           sh: sh ? sh.mask : -1, wx: ASH.wx ? ASH.wx() : null, sky: ASH.sky(), at: [me.x, me.y, me.lv | 0] };
})()"""

# the control: take the roof over our head out of the shadow map the way the old code did, or put it back
BUG = """(() => { const me = ASH.me, out = [];
  for (const r of ASH.regions) if (r.built) for (const rf of r.built.roofs)
    if (me.x >= rf.x0 && me.x <= rf.x1 && me.y >= rf.y0 && me.y <= rf.y1) { rf.g.visible = %s; out.push([rf.x0, rf.y0]); }
  return out; })()"""


def ev(pg, js): return pg.evaluate(js)


def free_gb():
    for line in open('/proc/meminfo'):
        if line.startswith('MemAvailable:'):
            return int(line.split()[1]) // 1048576
    return 99


def grey(pg, name):
    """The picture as a luminance array, saved as the shot. Kept as pixels, not one number: the sunbeam is a patch of
    light in a dim room, and a patch shows in the bright tail of the picture long before it shows in the average."""
    png = pg.screenshot(path=os.path.join(OUT, 'indoor_%s.png' % name))
    a = np.asarray(Image.open(BytesIO(png)).convert('L'), dtype=float)
    h, w = a.shape
    return a[int(h * 0.28):int(h * 0.72), int(w * 0.26):int(w * 0.74)]


def lit(a):
    """Mean of the brightest tenth of the room. A sunbeam landing on the floor and the furniture is exactly that: the
    top of the histogram. The average of the whole middle hides it under the walls the sun never touched."""
    return float(np.sort(a.ravel())[int(a.size * 0.9):].mean())


def open_page(b, extra=''):
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(URL + extra); pg.wait_for_timeout(4500)
    ev(pg, '(() => { const b = document.querySelector(".help .btn"); if (b) b.click(); return 1 })()')
    pg.wait_for_timeout(700)
    pg.errs = errs
    return pg


def place(pg, spot, weather=None):
    x, y, yaw, pitch, dist = spot
    if weather:
        ev(pg, 'ASH.weather("%s", 100, 200000)' % weather)
    ev(pg, 'ASH.teleport(%d, %d)' % (x, y)); pg.wait_for_timeout(1500)
    ev(pg, 'ASH.setCam(%s, %s, %s)' % (yaw, pitch, dist)); pg.wait_for_timeout(2200)
    for _ in range(6):                                     # out-level the neighbours: a fight moves the subject
        ev(pg, "for (const s of ['attack','strength','defence']) ASH.setLevel(s, 60); ASH.setLevel('hitpoints', 70)")
        pg.wait_for_timeout(250)


def day_page(b, upto=9):
    """A page whose sky is standing in the middle of a day. ?skyday=D moves only this viewer's sun along a game day
    (7200 s, src/engsky.js) and leaves the clock at normal speed, so nothing moves between two photographs of a pair.
    Which offset lands in daylight depends on the real time of day the machine happens to be in, so try them in turn and
    keep the first that is bright. The light is judged by sun.intensity - 0.5 + 1.8 x the day factor while the sun is up,
    at most 0.26 at night - and not by ASH.sky().up, because up is read from the unshifted clock (sunAt(Date.now()) in
    src/engsky.js) and says "night" while the sky overhead is noon."""
    for k in range(1, 10 * upto + 1, 10):
        pg = open_page(b, '&skyday=%g' % (k / 10.0))
        st = ev(pg, 'ASH.sky()') or {}
        print('     skyday +%g: sun %.2f hemi %.2f %s' % (k / 10.0, st.get('sun', -9), st.get('hemi', -9),
                                                          'daytime' if st.get('sun', 0) >= SUN_UP else 'dark'), flush=True)
        if st.get('sun', 0) >= SUN_UP:
            return pg
        pg.close()
    return None


def settle(pg, want, upto=90):
    """Wait for the shelter to actually arrive, not for a wall clock. The module eases it over about half a second of
    update() time and SwiftShader hands it few frames, so the first reading after a doorway is often mid-fade - 0.9 of
    the way in, which still leaves a hundred flakes over your head. want is the state the page should end up in."""
    st = ev(pg, 'ASH.wx()')
    for _ in range(upto * 5):
        st = ev(pg, 'ASH.wx()')
        got = st.get('indoor', -9)
        if st.get('fade', 1) >= 1 and (got >= 0.999 if want else got <= 0.01):
            return st
        pg.wait_for_timeout(200)
    return st


def line(name, d, ok='', note=''):
    r = d['roofs'][0] if d['roofs'] else None
    wx = d['wx'] or {}
    parts = wx.get('parts', {})
    print('     %-24s %s roof %s: %d mesh %d cast %d drawn %d shadow map (mask %d)  %d drops up (%d rain %d snow) '
          'sheets %d shelter %.2f  sun %.2f %s %s' % (
              name, 'inside' if d['inside'] else 'outside',
              ('group ' + ('on' if r and r['group'] else 'OFF')) if r else 'none here',
              r['n'] if r else -1, r['cast'] if r else -1, r['drawn'] if r else -1, r['shaded'] if r else -1,
              r['mask'] if r else -1,
              (parts.get('rain', 0) + parts.get('snow', 0)), parts.get('rain', 0), parts.get('snow', 0),
              wx.get('sheets', -1), wx.get('indoor', -9), (d['sky'] or {}).get('sun', -9), ok, note), flush=True)


with sync_playwright() as p:
    fails = []
    while free_gb() < 4:
        print('     only %d GB free - waiting for the machine before launching a browser' % free_gb(), flush=True)
        time.sleep(20)
    b = p.chromium.launch(args=ARGS)

    # ---- 1. the sun, at midday. ?skyday moves this viewer's sky along and the clock then runs at normal speed, so the
    # light stands still while the photographs are taken (a time-lapse would also put the weather away: engine.js, TL.n>1)
    pg = day_page(b)
    if pg is None:
        print('FAILED: no skyday offset landed in daytime', flush=True)
        b.close(); raise SystemExit(1)
    print('     shadow camera layer mask %s' % (ev(pg, DIAG) or {}).get('sh'), flush=True)
    place(pg, DOOR)
    d = ev(pg, DIAG)
    g = grey(pg, 'outside_clear')
    good = bool(d['roofs']) and d['roofs'][0]['drawn'] == d['roofs'][0]['n'] and d['roofs'][0]['shaded'] == d['roofs'][0]['n']
    line('outside clear', d, 'PASS' if good else 'FAIL', 'brightest tenth %.1f' % lit(g))
    if not good:
        fails.append('outside: a roof the sun should block with is not drawn and in the shadow map as it was')

    place(pg, SHOP)
    d = ev(pg, DIAG)
    r = d['roofs'][0] if d['roofs'] else None
    good = d['inside'] and r and r['group'] and r['drawn'] == 0 and r['shaded'] == r['n'] and r['cast'] > 0
    line('inside, as shipped', d, 'PASS' if good else 'FAIL')
    print('     roofs here: %s' % json.dumps(d['roofs']), flush=True)
    if not good:
        fails.append('inside: the hidden roof is not (group on, drawn by no camera, a shadow caster, in the shadow map)')

    deltas = []
    for k in range(3):                                     # three pairs: the machine is busy, so one pair proves little
        a = grey(pg, 'inside_fixed%d' % k)
        ev(pg, BUG % 'false'); pg.wait_for_timeout(700)    # the old hiding: out of the shadow map as well
        c = grey(pg, 'inside_roof_dropped%d' % k)
        ev(pg, BUG % 'true'); pg.wait_for_timeout(700)
        more = int(np.count_nonzero(c - a > 30))
        less = int(np.count_nonzero(a - c > 30))
        deltas.append((lit(c) - lit(a), more))
        print('     pair %d: brightest tenth %.1f with the roof keeping the sun out, %.1f with it out of the shadow map; '
              '%d pixels lit up by taking the roof away, %d by putting it back' % (k, lit(a), lit(c), more, less), flush=True)
    if deltas:
        gain = sorted(d for d, _ in deltas)[len(deltas) // 2]
        pixels = sorted(m for _, m in deltas)[len(deltas) // 2]
        print('     median: taking the roof out of the shadow map brightens %d pixels by %.1f levels - the room is '
              'being shaded by a roof you cannot see' % (pixels, gain), flush=True)
        if gain < 3 or pixels < 300:
            fails.append('the hidden roof is barely shading the room (%d pixels, %.1f levels) - either the fix is off '
                         'or the comparison does not bite here' % (pixels, gain))
        else:
            print('     the sun is stopped by the roof that is not drawn: PASS', flush=True)
    ev(pg, BUG % 'true')
    pg.close()

    # ---- 2. the weather. The game's rule side turns rain into snow in the cold months (engine.js seasonal()), so what
    # is asserted is the number of drops in the air, whichever kind the season chose.
    pg = open_page(b)
    for spot, kind, inb in ((SHOP, 'rain', True), (DOOR, 'rain', False), (SHOP, 'snow', True), (DOOR, 'snow', False)):
        place(pg, spot, kind)
        wx = settle(pg, 1 if inb else 0)
        d = ev(pg, DIAG)
        wx = d['wx']
        drops = wx['parts']['rain'] + wx['parts']['snow']
        if inb:
            good = d['inside'] and drops == 0 and wx['sheets'] == 0 and wx.get('indoor', 0) > 0.999
            note = 'shelter %.4f' % wx.get('indoor', -9)
        else:
            good = not d['inside'] and drops > 0 and wx.get('indoor', 1) < 0.01
            note = 'shelter %.4f' % wx.get('indoor', -9)
        line('%s %s%s' % ('inside' if inb else 'outside', wx.get('kind', kind), ' (asked ' + kind + ')' if wx.get('kind') != kind else ''),
             d, 'PASS' if good else 'FAIL', note)
        if not good:
            fails.append('%s under %s: %d drops, %d sheets, shelter %.4f'
                         % ('indoors' if inb else 'outside', wx.get('kind', kind), drops, wx['sheets'], wx.get('indoor', -9)))
        grey(pg, '%s_%s' % ('inside' if inb else 'outside', wx.get('kind', kind)))

    print('     fps %s' % json.dumps(ev(pg, 'ASH.fps()')), flush=True)
    errs = pg.errs
    print('     console errors:', errs[:10], flush=True)
    fails += ['%d console errors' % len(errs)] if errs else []
    print('ALL OK' if not fails else 'FAILED: ' + '; '.join(fails), flush=True)
    b.close()
