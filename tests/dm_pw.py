"""dm_pw.py - 2026-10-07: "If you /@<tag> a direct message should be sent to them in game chat no distance limit on
direct messages". Local, ?loopback (tabs = players; ?loopaddr gives each its address); /r/tag/<tag> is answered here.
Needs: python3 -m http.server 8731 in ~/ashvale3d."""
import os, sys, json
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/home/you/.cache/ms-playwright')
from playwright.sync_api import sync_playwright
U = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=dm'
TAGS = {'bob': 'nBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBx', 'carl': 'nCARLCARLCARLCARLCARLCARLCARLCARLx', 'ghost': 'nGHOSTGHOSTGHOSTGHOSTGHOSTGHOSTGHx'}
fails = []
def ok(c, m): print(('ok   ' if c else 'FAIL ') + m, flush=True); c or fails.append(m)
with sync_playwright() as P:
    b = P.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']); ctx = b.new_context(viewport={'width': 900, 'height': 600})
    def tag_route(route):
        t = route.request.url.rsplit('/', 1)[1]; route.fulfill(status=200, content_type='application/json', body=json.dumps({'tag': t, 'address': TAGS.get(t)}))
    ctx.route('**/r/tag/*', tag_route); E = []
    def page(q, addr, at):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: E.append(str(e))); pg.goto(U + q + '&loopaddr=' + addr, timeout=120000); pg.wait_for_function('window.ASH && ASH.oneDevice', timeout=120000)
        pg.wait_for_timeout(3000); pg.evaluate("ASH.hud.showHelp(false); ASH.walletState().address = '%s'; ASH.teleport(%d, %d)" % (addr, at[0], at[1])); return pg
    A = page('a', 'nALICEALICEALICEALICEALICEALICEALx', (22, 52)); Bp = page('b', TAGS['bob'], (457, 32)); C = page('c', TAGS['carl'], (24, 33))
    A.wait_for_timeout(4000)
    chat = lambda pg: pg.evaluate("document.querySelector('.chat').innerText")
    A.evaluate("ASH.say('/@bob meet me at the cave mouth')"); A.wait_for_timeout(4000)
    ok('From @' in chat(Bp) and 'meet me at the cave mouth' in chat(Bp), 'Bob, 435 tiles away in Saltmere, gets it: %r' % [l for l in chat(Bp).split('\n') if 'cave mouth' in l][-1:])
    ok('To @bob: meet me at the cave mouth' in chat(A), 'Alice sees what she sent')
    ok('cave mouth' not in chat(C), 'Carl (standing near Alice) does not see it')
    ok(A.evaluate("document.querySelector('.chat .dm') && getComputedStyle(document.querySelector('.chat .dm')).color") == 'rgb(255, 156, 224)', 'direct messages are pink')
    A.evaluate("ASH.say('/@ghost are you there')"); A.wait_for_timeout(3000)
    ok("@ghost isn't playing right now." in chat(A), 'someone who is not playing: says so')
    A.evaluate("ASH.say('/@nosuchname hi')"); A.wait_for_timeout(3000)
    ok('There is no @nosuchname on the arcade.' in chat(A), 'an unknown name: says so')
    ok(not E, 'no page errors %s' % E[:2])
    b.close()
print('ALL PASS' if not fails else 'FAILED %d' % len(fails)); sys.exit(1 if fails else 0)
