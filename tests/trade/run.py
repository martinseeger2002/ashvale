import threading, http.server, socketserver, functools, json
from playwright.sync_api import sync_playwright
R='/home/you/ashvale3d'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=R)); threading.Thread(target=srv.serve_forever,daemon=True).start()
res={}
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':844,'height':390}, has_touch=True); errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/tests/trade/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("__t.T.open({id:'p2', address:'nTHEM', tag:'bob', guest:false})"); pg.wait_for_timeout(800)
    res['foreign_hidden']=pg.evaluate("!document.querySelector(\".it[data-id^='e']\")")
    res['go_disabled_empty']=pg.evaluate("document.querySelector('[data-go]').disabled")
    pg.fill('[data-gg]','50'); pg.fill('[data-tg]','40'); pg.wait_for_timeout(200)
    res['gold_for_gold_disabled']=pg.evaluate("document.querySelector('[data-go]').disabled")
    pg.fill('[data-gg]',''); pg.wait_for_timeout(200)
    pg.tap(".col:first-child .it[data-id^='a']"); pg.wait_for_timeout(200)
    pg.fill('[data-tg]','250'); pg.wait_for_timeout(200)
    res['summary']=pg.inner_text('[data-sum]')
    pg.screenshot(path=R+'/tests/shots/trade_window.png')
    pg.tap('[data-go]'); pg.wait_for_timeout(500)
    pg.tap(".col:first-child .it[data-id^='a']") if pg.query_selector('.col') else None
    res['trade_call']=pg.evaluate("__t.calls.find(c => c[0]==='trade')")
    pg.wait_for_timeout(1500)
    pg.evaluate("__t.T.open({id:'p2', address:'nTHEM', tag:'bob', guest:false})"); pg.wait_for_timeout(600)
    pg.tap(".col:first-child .it[data-id^='b']"); pg.tap(".col:last-child .it"); pg.wait_for_timeout(200); res['summary_nft_nft']=pg.inner_text('[data-sum]'); pg.tap('[data-go]'); pg.wait_for_timeout(400)
    res['trade_call_2']=pg.evaluate("__t.calls.filter(c => c[0]==='trade')[1]")
    pg.wait_for_timeout(1500)
    pg.evaluate("__t.fire({id:'t9', status:'incoming', with:{id:'p2'}, give:{inscription:'d'.repeat(64)}, get:{token:26, amount:'300'}, role:'responder'})"); pg.wait_for_timeout(300)
    res['incoming_text']=pg.inner_text('.ash-trade .summary'); pg.screenshot(path=R+'/tests/shots/trade_incoming.png')
    pg.tap('[data-y]'); pg.wait_for_timeout(400)
    res['answer_call']=pg.evaluate("__t.calls.find(c => c[0]==='answer')")
    pg.evaluate("__t.fire({id:'t9', status:'settled', with:{id:'p2'}, give:{inscription:'d'.repeat(64)}, get:{token:26, amount:'300'}})")
    res['toast']=pg.evaluate("__t.toasts.slice(-1)")
    pg.evaluate("__t.T.open({id:'g1', guest:true})"); res['guest_toast']=pg.evaluate("__t.toasts.slice(-1)")
    res['errors']=errs; b.close()
srv.shutdown(); print(json.dumps(res, indent=1))
