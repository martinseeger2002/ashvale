import sys, time, json
from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
U = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed='
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 640, 'height': 400}); errs = []
    pa = ctx.new_page(); pa.on('pageerror', lambda e: errs.append(str(e))); pa.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pa.goto(U + 'a', wait_until='domcontentloaded'); time.sleep(6)
    pa.evaluate('ASH.hud.showHelp(false); ASH.teleport(24, 30)'); time.sleep(3)
    pb = ctx.new_page(); pb.on('pageerror', lambda e: errs.append(str(e))); pb.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pb.goto(U + 'b', wait_until='domcontentloaded'); time.sleep(6)
    pb.evaluate('ASH.hud.showHelp(false); ASH.teleport(25, 30)'); time.sleep(6)
    for pg in (pa, pb): print(pg.evaluate('JSON.stringify({net: (({host, amHost, myId, room}) => ({host, amHost, myId, room}))(ASH.net()), auth: ASH.core.isAuth("whisperwood")})'))
    js = 'JSON.stringify(ASH.core.S.mobs.filter(m => m.zone === "whisperwood").slice(8, 14).map(m => [m.uid, m.x, m.y, m.hp, m.dead ? 1 : 0]))'
    print('A', pa.evaluate(js)); print('B', pb.evaluate(js))
    print('errors', errs[:5])
    b.close()
