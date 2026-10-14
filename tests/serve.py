"""tests/serve.py [port] - the test web server for the browser tests (python3 tests/serve.py 8731, from ~/ashvale3d).
[Claude 2026-10-14] The same files as `python3 -m http.server 8731`, plus empty answers to the arcade's read routes (/r/...) the
game asks on its own - a newer registry (/r/inscriptions), balances, tags - so a test page logs no "404 (File not found)"
console error that has nothing to do with the game (the operator: "figure out and fix whatever is failing"). Threaded."""
import http.server, json, sys, os
EMPTY = {'/r/inscriptions': []}   # only the registry poll: an empty answer to anything else is NOT the same as no answer (the wallet code reads
# an empty /r/inscription/<piece> as 'not yours any more' - chest_ledger_pw's worn helmet came off), so the rest still 404 as before
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/favicon.ico': self.send_response(204); self.end_headers(); return   # the browser asks for one; the game has none
        if path in EMPTY:
            body = json.dumps(EMPTY[path]).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
http.server.ThreadingHTTPServer.request_queue_size = 64
http.server.ThreadingHTTPServer(('0.0.0.0', int(sys.argv[1]) if len(sys.argv) > 1 else 8731), H).serve_forever()
