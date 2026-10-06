#!/home/you/.pyenv/versions/3.11.9/bin/python3
"""Screenshots of the weather module (src/weather.js): Ashvale village and Whisperwood in clear, fog, rain and snow,
at full and at half strength, on a desktop and on a phone. The module is not in the page or the registry yet, so this
harness loads src/weather.js, hands it the game's own scene and camera, and calls update - which is exactly what
engine.js will do once the build agent puts the module in the registry. Nothing here asserts much: it is for the eye,
and rain must read as rain and snow as snow, never as noise. Every shot waits out the module's 4 s cross-fade first,
so what is in the picture is what that weather looks like, not the change to it.
Usage: tools/shot_weather_pw.py  (server: python3 -m http.server 8731 in ~/ashvale3d)
Shots in tests/shots/wx_*.png"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(OUT, exist_ok=True)
SRC = os.path.join(ROOT, 'src', 'weather.js')
URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&seed=weather1'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage']      # /dev/shm is small on this box and a full one takes the renderer with it

# stand here and look this way: the village with the shop roofs beyond it. The wood spot comes from the zone's own spawn
# list: 8 tiles from the nearest monster, far enough from every edge that everything the camera sees is still map, and
# trees within 16 m so dense fog (far = 16) has something to fade. The spot before it was a hilltop with the camera 18 m
# back, where fog photographed as a white void and the wolves there killed the subject.
ZONES = {'village': (22, 50, 3.14, 0.30, 12.0), 'whisperwood': (34, 19, 1.5708, 0.35, 11.0)}
KINDS = [('clear', 1), ('fog', 1), ('rain', 1), ('snow', 1), ('fog', 0.5), ('rain', 0.5), ('snow', 0.5), ('clear', 0.5)]
ONLY = [a for a in sys.argv[1:] if not a.startswith('-')]       # names to shoot, e.g. tools/shot_weather_pw.py fading
# (no fixed wait: wait_fade below waits for the module to say it has arrived)
NEED = ['Points', 'PointsMaterial', 'LineSegments', 'LineBasicMaterial', 'ShaderMaterial', 'DynamicDrawUsage']
errs = []


def ev(pg, js, arg=None): return pg.evaluate(js) if arg is None else pg.evaluate(js, arg)


def wait_fade(pg, want=1.0, upto=40000):
    """Wait for the module's cross-fade to reach `want`, not for a fixed number of milliseconds. The module ignores
    more than 0.1 s of dt in one frame (a half-second frame must not teleport a thousand drops), so on SwiftShader -
    which renders this scene at well under 10 fps - 4 s of weather takes longer than 4 s of wall clock. Waiting on
    the clock instead of the state used to shoot weather that had only faded in a third of the way."""
    for _ in range(upto // 200):
        if ev(pg, 'W.state().fade') >= want:
            return True
        pg.wait_for_timeout(200)
    return False


def shot(pg, name):
    p = os.path.join(OUT, 'wx_' + name + '.png')
    pg.screenshot(path=p)
    st = ev(pg, 'W.state()')
    # the player's tile on every line: if the subject ever died and woke up in the village, the wood shots would
    # otherwise go on looking like wood shots in the log while the picture was the village.
    at = ev(pg, "[Math.round(ASH.me.x), Math.round(ASH.me.y), ASH.me.hp]")
    print('     shot %-34s %-6s %3d%% fade %4.2f  fog %4.1f-%4.1f %s  %4d/%4d particles (%2d%%/%2d%% of the look), %d draws, %d calls, at %d,%d hp %d' % (
        os.path.basename(p), st['kind'], round(st['intensity'] * 100), st['fade'], st['fog']['near'], st['fog']['far'],
        st['fog']['sky'], st['parts']['rain'], st['parts']['snow'], round(st['amounts']['rain'] * 100),
        round(st['amounts']['snow'] * 100), st['draws'], ev(pg, 'ASH.info().calls'), at[0], at[1], at[2]))


def open_page(b, phone):
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True) if phone \
        else b.new_context(viewport={'width': 1280, 'height': 800})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(4500)
    ev(pg, '(() => { const b = document.querySelector(".help .btn"); if (b) b.click(); return 1 })()'); pg.wait_for_timeout(700)
    return pg


def load(pg, quality):
    """The module the way the page gets it: run src/weather.js as a plain script - which is how build.py inlines it -
    so it registers itself with ASH3D.define, then take the interface out of the definitions and hand it the game's own
    three.js, exactly as engine.js does. Until build.py has scanned src/weather.js the built page's three carries only
    the names the other modules use, so borrow the six this one needs from the same revision of the same library
    (vendor/, r160); the shipped module gets the real thing."""
    src = open(SRC, encoding='utf-8').read()
    return ev(pg, """async ([src, quality, NEED]) => {
      const THREE = ASH3D.get('three');
      const missing = NEED.filter(k => !(k in THREE));
      if (missing.length) {
        const full = await import('/vendor/three.module.min.js');
        if (full.REVISION !== THREE.REVISION) return {MISMATCH: full.REVISION + ' vs ' + THREE.REVISION};
        for (const k of missing) THREE[k] = full[k];
      }
      const s = document.createElement('script');
      s.textContent = src; document.head.appendChild(s);
      const def = ASH3D._defs.weather;                                 /* the define call at the bottom of weather.js */
      if (!def) return {NOTREGISTERED: 1};
      const iface = def.factory({ three: THREE });
      window.W = iface.createWeather(THREE, {scene: ASH.scene, camera: ASH.camera, quality: quality});
      let last = performance.now();                                    /* engine.js calls update; until then, this does */
      const tick = (t) => {
        window.raf = requestAnimationFrame(window.tick); const dt = (t - last) / 1000; last = t;
        /* Monsters are not part of a weather test. One wandering between the camera and the trees changes the picture
        between two shots of the same weather, one standing in front of the lens puts a health bar over the proof, and
        the wolves here kill the subject. Monsters are keyed 'm:' in the engine's entity map, and hiding their root
        takes their health bar and name tag with it (engine.js only shows a bar while root.visible). This runs after
        engine.js's own frame callback, so a spawn event cannot undo it before the frame is painted. */
        for (const [k, e] of ASH.ents) if (k.charCodeAt(0) === 109) {
          e.root.visible = false;
          if (e.bar) e.bar.style.display = 'none';
          if (e.bub) e.bub.el.style.display = 'none';
        }
        window.W.update(dt);
      };
      window.tick = tick;                                              /* fade_shot below stops and starts this by name */
      window.raf = requestAnimationFrame(tick);
      return {borrowed: missing, three: THREE.REVISION, needs: def.meta.needs, v: def.meta.v, scene: !!ASH.scene};
    }""", [src, quality, NEED])


def fade_shot(pg, name, steps=10):
    """A shot caught in the middle of a cross-fade, at an exact point in it rather than one raced against the clock.
    Waiting for fade >= 0.4 landed at 0.85 on a desktop and 0.98 on a phone - by the time the poll saw 0.4 the frame
    loop had gone past it, and the settle wait went further past, so the "fading" photograph was really an arrived one.
    Here the module's clock is turned by hand instead: stop its frame tick, step update() ten times, photograph, then
    restart the tick. engine.js renders every frame regardless, so the scene is drawn; only the weather's clock is
    paused. Note the clamp inside update(): more than 0.1 s of dt in one frame is ignored, so ten steps of 1/6 s are
    ten steps of 0.1 s and the shot lands at 10 x 0.1 / 4 s = 0.25 of the fade, identically on every device."""
    ev(pg, "cancelAnimationFrame(window.raf); W.set('clear', 0, {instant: true})")
    pg.wait_for_timeout(500)
    ev(pg, "W.set('rain', 1); for (let k = 0; k < %d; k++) W.update(1/6)" % steps)
    ev(pg, "for (const [k, e] of ASH.ents) if (k.charCodeAt(0) === 109) { e.root.visible = false;"
           " if (e.bar) e.bar.style.display = 'none'; if (e.bub) e.bub.el.style.display = 'none'; }")   # the tick that
    p = shot(pg, name)                                                 # normally hides them is paused, so hide them
    ev(pg, "window.raf = requestAnimationFrame(window.tick)")          # by hand, and shutter before the fade moves on
    return p


def place(pg, z):
    x, y, yaw, pitch, dist = ZONES[z]
    ev(pg, 'if (ASH.weather) ASH.weather("clear", 0, 100000)')        # park the rule side: nothing else may write scene.fog
    ev(pg, 'ASH.teleport(%d, %d)' % (x, y)); pg.wait_for_timeout(1600)
    ev(pg, 'ASH.setCam(%s, %s, %s)' % (yaw, pitch, dist)); pg.wait_for_timeout(1800)
    # Whisperwood has wolves and a bear and they will kill the subject of a screenshot while the camera is being set up,
    # and a dead player wakes up in the village - which quietly turns a wood shot into a village shot. This is a
    # photograph, not a fight, so two things. First, out-LEVEL them: core.js's acquire() will not let a monster target
    # a player whose combat level is more than double its own (core.js:894), and the wood's monsters run to level 18,
    # so a subject at level 60 in three skills is simply not something they attack. That also means no damage numbers
    # and no health bars over the photographs. Second, out-LAST them: the engine's own debug knob tops his hp, in case
    # something disagrees with the arithmetic. Every shot line prints his tile and hp, so a drift to 22,50 - where a
    # dead player wakes up - is visible in the log instead of silent.
    ev(pg, "clearInterval(window.__wxHp); for (const s of ['defence', 'attack', 'strength']) ASH.setLevel(s, 60);"
           " ASH.setLevel('hitpoints', 70); window.__wxHp = setInterval(() => { try { ASH.setLevel('hitpoints', 70); } catch (e) {} }, 700)")


def free_gb():
    """GB the kernel says it can still give someone right now. On this box the language model holds about 95 of 121 and
    a browser under SwiftShader wants 2 or 3 of what is left, so a screenshot sweep has to ask before it takes one."""
    for line in open('/proc/meminfo'):
        if line.startswith('MemAvailable:'):
            return int(line.split()[1]) // 1048576
    return 99


def wait_room(need=4, upto=900):
    t0 = time.time()
    while free_gb() < need and time.time() - t0 < upto:
        print('     only %d GB free - waiting for the machine before launching another browser' % free_gb())
        time.sleep(20)
    return free_gb()


def ensure(p, b, phone, z, old=None):
    """A page with the game, the module in it, and the camera standing where the shots are taken. Used at the start and
    again whenever the browser is lost - under memory pressure the whole browser can go, not just the page, so this
    relaunches it and waits until there is room to."""
    if old:
        try:
            old.close()
        except Exception:
            pass
    if b is not None:
        try:
            if not b.is_connected():
                b = None
        except Exception:
            b = None
    if b is None:
        wait_room()
        b = p.chromium.launch(args=ARGS)
        print('     browser launched with %d GB free' % free_gb())
    try:
        pg = open_page(b, phone)
    except Exception:
        print('     the browser is gone - launching another')
        wait_room()
        b = p.chromium.launch(args=ARGS)
        pg = open_page(b, phone)
    print('     loaded: %s' % load(pg, 'low' if phone else 'high'))
    if z:
        place(pg, z)
    return pg, b


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for phone in (False, True):
        dev = 'phone' if phone else 'desktop'
        pg, b = ensure(p, b, phone, None)
        for z in ('village', 'whisperwood'):
            place(pg, z)
            for kind, i, fading in [(k, v, False) for k, v in KINDS] + [('rain', 1, True)]:
                name = '%s_%s_%s%d' % (dev[:4], z, kind, int(i * 100)) if not fading else '%s_%s_fading' % (dev[:4], z)
                if ONLY and not any(o in name for o in ONLY):
                    continue                                            # tools/shot_weather_pw.py fading - re-shoot a few
                for attempt in (1, 2):
                    try:
                        if fading:
                            fade_shot(pg, name)
                        else:
                            ev(pg, "W.set('%s', %s)" % (kind, i))
                            if not wait_fade(pg):
                                print('     TIMEOUT %s_%s_%s never reached its look' % (dev, z, kind))
                            pg.wait_for_timeout(300)                    # a frame or two more, so the shot is settled
                            shot(pg, name)
                        break
                    except Exception as e:
                        print('     lost at %s (%s), attempt %d' % (name, type(e).__name__, attempt))
                        pg, b = ensure(p, b, phone, z, pg)
            print('     fps %s' % ev(pg, 'ASH.fps()'))
        pg.close()
    print('     console errors:', errs[:10])
    print('ALL OK' if not errs else 'FAILED: %d console errors' % len(errs))
    b.close()
