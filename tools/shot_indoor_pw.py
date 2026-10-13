#!/home/you/.pyenv/versions/3.11.9/bin/python3
"""Inside a building, two things must be true (2026-10-13): the sun must not shine in through the roof that is
taken away while you are inside - it threw a bright slab of light and hard shadows across the room - and the weather
must not fall on your head.

The sun half is proved by comparison, not by eye. The camera never draws the roof while you are inside it, so the room
in the photograph is the same room either way; what has to differ is the LIGHT. The fix moves the hidden roof to the
SHADOWED layer, which the sun's shadow camera sees and no camera draws; the bug it replaces set visible=false, which
took the pieces out of the shadow map as well. So this photographs the room both ways, in both orders, and measures the
middle of the picture: with the roof still blocking the sun the room must be clearly darker. That control is the old
code itself - rf.g.visible = false, which the module no longer touches anywhere, so writing it from here is exactly the
state the bug was.

The sky is driven with ?timelapse (the game's own knob, as tests/watch_dragon_keep_pw.py uses it) and the test waits for
the middle of the day, because at night the sun is not the thing lighting the room and a low sun sends the light in
through the door. The weather half is a second page at normal speed: the game's rule side puts the weather away in a
time-lapse (engine.js: TL.n > 1), and the weather half needs the real thing. It reads the module: under a roof no drops
are in the air and no fog sheets are up (shelter 1), out in the street they are (shelter 0).

Usage: tools/shot_indoor_pw.py  (server: python3 -m http.server 8731 in ~/ashvale3d)
Shots in tests/shots/indoor_*.png"""
import json
import os
import time
from io import BytesIO
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&seed=indoor1'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage']
SHOP = (10, 44, 3.1416, 0.42, 9.0)        # the General Store's floor, looking north along the room
DOOR = (10, 48, 3.1416, 0.30, 13.0)       # opposite pavement, the whole shop front and the ground beside it
DARK = 0.94                              # how much darker the room must be with the roof still blocking the sun
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
    """Mean brightness of the middle of the picture - the room, not the frame around it. Both halves of a pair are the
    same geometry from the same pixel, so the only thing that moves this number is the light."""
    png = pg.screenshot(path=os.path.join(OUT, 'indoor_%s.png' % name))
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(BytesIO(png)).convert('L'), dtype=float)
    h, w = a.shape
    return float(a[int(h * 0.3):int(h * 0.7), int(w * 0.3):int(w * 0.7)].mean())


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


def wait_day(pg, upto=280):
    """Wait for the middle of the day: sun.intensity is 0.5 + 1.8 x the day factor while the sun is up and <= 0.26 at
    night, so reading it is reading the light that is actually falling on the room, not a clock."""
    for _ in range(upto):
        st = ev(pg, 'ASH.sky()') or {}
        if st.get('sun', 0) >= SUN_UP:
            return st
        pg.wait_for_timeout(1000)
    return None


def wait_wx(pg, upto=40000):
    """Wait for the module's own cross-fade, not for a wall clock: the fade counts the dt it is handed and a frame under
    SwiftShader is long. Under a roof the drops are put out, so the fade arriving means the weather is up outside and we
    are simply out of it."""
    st = ev(pg, 'ASH.wx()')
    for _ in range(upto // 200):
        st = ev(pg, 'ASH.wx()')
        if st.get('fade', 1) >= 1:
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

    # ---- 1. the sun, in the middle of a day driven 20 times fast (a game day is 20 s of wall clock, so between two
    # photographs of a pair the light barely moves)
    pg = open_page(b, '&timelapse=20')
    st = wait_day(pg)
    if not st:
        print('FAILED: never got daytime with the sky driven at 20x', flush=True)
        b.close(); raise SystemExit(1)
    print('     daytime: sun %.2f hemi %.2f, shadow camera layer mask %s' % (
        st['sun'], st['hemi'], (ev(pg, DIAG) or {}).get('sh')), flush=True)
    place(pg, DOOR)
    d = ev(pg, DIAG)
    g = grey(pg, 'outside_clear')
    good = bool(d['roofs']) and d['roofs'][0]['drawn'] == d['roofs'][0]['n'] and d['roofs'][0]['shaded'] == d['roofs'][0]['n']
    line('outside clear', d, 'PASS' if good else 'FAIL', 'mid grey %.1f' % g)
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

    pairs = []
    for order in (0, 1):                                   # both orders: if only one way round shows it, it is the clock
        if order == 0:
            fixed = grey(pg, 'inside_fixed_a'); ev(pg, BUG % 'false'); pg.wait_for_timeout(700)
            bug = grey(pg, 'inside_roof_dropped_a')
        else:
            ev(pg, BUG % 'true'); pg.wait_for_timeout(700); fixed = grey(pg, 'inside_fixed_b')
            ev(pg, BUG % 'false'); pg.wait_for_timeout(700); bug = grey(pg, 'inside_roof_dropped_b')
            ev(pg, BUG % 'true')
        pairs.append((fixed, bug))
        print('     %s: room %.1f with the roof blocking the sun, %.1f with it out of the shadow map - %.0f%% darker'
              % ('fixed first' if order == 0 else 'bug first', fixed, bug, (1 - fixed / bug) * 100), flush=True)
    for fixed, bug in pairs:
        if fixed > bug * DARK:
            fails.append('the hidden roof still lets the sun in (%.1f vs %.1f)' % (fixed, bug))
    if pairs and all(f <= g * DARK for f, g in pairs):
        print('     the sunbeam through the taken-away roof is gone: PASS', flush=True)
    ev(pg, BUG % 'true')
    pg.close()

    # ---- 2. the weather, at normal speed
    pg = open_page(b)
    place(pg, SHOP, 'rain')
    wait_wx(pg); pg.wait_for_timeout(1500)
    d = ev(pg, DIAG)
    wx = d['wx']
    good = d['inside'] and wx['parts']['rain'] == 0 and wx['sheets'] == 0 and wx.get('indoor', 0) > 0.9
    line('inside rain', d, 'PASS' if good else 'FAIL')
    if not good:
        fails.append('indoors in rain: %d rain drops, %d sheets, shelter %.2f'
                     % (wx['parts']['rain'], wx['sheets'], wx.get('indoor', -9)))
    grey(pg, 'inside_rain')

    place(pg, DOOR, 'rain')
    wait_wx(pg); pg.wait_for_timeout(1500)
    d = ev(pg, DIAG)
    wx = d['wx']
    good = not d['inside'] and wx['parts']['rain'] > 0 and wx.get('indoor', 1) < 0.1
    line('outside rain', d, 'PASS' if good else 'FAIL')
    if not good:
        fails.append('outside in rain: %d rain drops, shelter %.2f' % (wx['parts']['rain'], wx.get('indoor', -9)))
    grey(pg, 'outside_rain')

    place(pg, SHOP, 'snow')
    wait_wx(pg); pg.wait_for_timeout(1500)
    d = ev(pg, DIAG)
    wx = d['wx']
    good = d['inside'] and wx['parts']['snow'] == 0 and wx['parts']['rain'] == 0
    line('inside snow', d, 'PASS' if good else 'FAIL')
    if not good:
        fails.append('indoors in snow: %d flakes' % wx['parts']['snow'])
    grey(pg, 'inside_snow')

    print('     fps %s' % json.dumps(ev(pg, 'ASH.fps()')), flush=True)
    errs = pg.errs
    print('     console errors:', errs[:10], flush=True)
    fails += ['%d console errors' % len(errs)] if errs else []
    print('ALL OK' if not fails else 'FAILED: ' + '; '.join(fails), flush=True)
    b.close()
