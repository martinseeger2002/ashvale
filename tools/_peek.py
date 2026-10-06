import os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
ROOT='/home/you/ashvale3d'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT)); threading.Thread(target=srv.serve_forever,daemon=True).start()
# wrap the Artifact-shaped file in a document
open(ROOT+'/playtest/_wrap.html','w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+open(ROOT+'/playtest/ashvale3d_playtest.html').read()+'</body></html>')
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for name,vp in (('desk',{'width':1280,'height':720}),('phone',{'width':844,'height':390})):
        pg=b.new_page(viewport=vp, has_touch=(name=='phone')); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)[:200])); pg.on('console',lambda m: m.type=='error' and errs.append(m.text[:200]))
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/playtest/_wrap.html'); pg.wait_for_timeout(6000)
        pg.screenshot(path=f'{ROOT}/tools/shots/_peek_{name}.png'); print(name, errs[:5])
    b.close()
srv.shutdown(); os.remove(ROOT+'/playtest/_wrap.html')
