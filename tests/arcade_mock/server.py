"""Local mock of the arcade for the inscribed ASHVALE demo page: / -> dist/ashvale3d_arcade.html,
/content/<three id> -> the official three.module.min.js r160 (vendor/), /r/realtime.js and /r/storage.js -> mocks.
Usage: python3 tests/arcade_mock/server.py [port]   (default 8732)"""
import http.server, os, socketserver, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
THREE_ID = '374cfd2b2f114e9da4ade8add495fe8aa0b2b996a710fb538759a956f15f9539'
ROUTES = {'/content/' + THREE_ID: (os.path.join(ROOT, 'vendor', 'three.module.min.js'), 'application/javascript'),
          '/r/realtime.js': (os.path.join(HERE, 'realtime.js'), 'application/javascript'),
          '/r/swap.js': (os.path.join(HERE, 'swap.js'), 'application/javascript'),
          '/r/storage.js': (os.path.join(HERE, 'storage.js'), 'application/javascript'),
          '/': (os.path.join(ROOT, 'dist', 'ashvale3d_arcade.html'), 'text/html; charset=utf-8')}
# the wallet's indexed views (src/wallet.js). All three answer 200 on the live node, so the mock answers them too -
# a 404 here showed up in arcade_pw as a "console error" that was the mock, not the page. This wallet holds nothing.
VIEWS = ('/r/inscriptions', '/r/balances', '/r/tokens')
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        path = self.path.split('?')[0]
        r = ROUTES.get(path)
        if not r and path.startswith(VIEWS):
            b = b'[]'; self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        if not r: self.send_response(404); self.end_headers(); return
        b = open(r[0], 'rb').read(); self.send_response(200); self.send_header('Content-Type', r[1]); self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
def serve(port):
    socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.ThreadingTCPServer(('127.0.0.1', port), H); return s
if __name__ == '__main__':
    serve(int(sys.argv[1]) if len(sys.argv) > 1 else 8732).serve_forever()
