"""[Claude 2026-10-20] A playtest of the clubhouse tables for the operator (the games-top-notch gate: his OK before anything is inscribed).
Serves this checkout's dist/ and runs the REAL @ashvale Bank table code (tools/bank/tables.py + its rules worker, a throwaway database,
a pretend chain) in this process. The page (/tables.html) is the game with a small script that sends what it would say to the Bank
here (POST /bank) and fetches the Bank's words (GET /bank?a=...&n=...), with a pretend wallet (every send "goes", every deposit shows
on the pretend chain) and 5,000 GOLD to play with. Everyone who opens the link plays at the same tables in the same rounds.
  BANK_DIR=<tools/bank of a bank checkout> python3 tools/tables/playtest_server.py [port]      then open http://<host>:<port>/tables.html"""
import os, sys, json, time, tempfile, sqlite3, threading, http.server, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.environ.get('BANK_DIR') or os.path.join(ROOT, 'tools', 'bank'))
import bank, tables as TB
TB.hook(bank)   # an unpatched bank.py gets the tables hooks in-process (tables.hook)
tmp = tempfile.mkdtemp(); bank.DB = os.path.join(tmp, 'b.sqlite'); bank.LOG = os.path.join(tmp, 'b.log'); bank.PK_LEDGER = os.path.join(tmp, 'ledger.sqlite')
L = sqlite3.connect(bank.PK_LEDGER, check_same_thread=False); L.execute('create table arcade_tx(txid text primary key, block_height int, position int, encoding_class text, message_type int, message_version int, sender text, reference text, payload_hex text, valid int, extra text)'); L.commit()
bank.pool_proves = lambda *a: False
LOCK = threading.Lock(); bank.db().close()   # the Bank's tables made, then one connection for the clock thread and the web threads (under LOCK)
C = sqlite3.connect(bank.DB, timeout=30, check_same_thread=False); C.row_factory = sqlite3.Row; TB.tb_db(C)
OUT = []   # [(n, to|None, word)]: 'tb' to its player, 'tbs' to everyone
N = [0]
def emit():
    while bank.OUTQ:
        d = bank.OUTQ.pop(0); N[0] += 1; OUT.append((N[0], d.get('to') if d.get('t') == 'tb' else None, d))
    del OUT[:-4000]
def clock():
    while True:
        with LOCK:
            try: TB.tb_tick(C); emit()
            except Exception as e: print('tick error', e, flush=True)
        time.sleep(0.25)
threading.Thread(target=clock, daemon=True).start()
PAGE = r"""<script>
/* the playtest's bank room: the game's words to the Bank go to this server, its words come back by polling */
(function () {
  const a = sessionStorage.getItem('ptAddr') || ('nPlaytest' + Math.random().toString(36).slice(2, 12) + 'XXXXXXXXXXXXXXXX').slice(0, 34); sessionStorage.setItem('ptAddr', a);
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join('');
  const f0 = window.fetch.bind(window);
  window.fetch = (u, o) => { u = String(u);   /* the pretend wallet: every send goes */
    if (u === '/r/send') return Promise.resolve(new Response(JSON.stringify({ id: 'pt' + Math.random().toString(36).slice(2), status: 'queued' }), { status: 202 }));
    if (u.startsWith('/r/send/')) return Promise.resolve(new Response(JSON.stringify({ status: 'sent', txid: rnd() }), { status: 200 }));
    if (u.startsWith('/r/tx/')) return Promise.resolve(new Response(JSON.stringify({ confirmations: 1 }), { status: 200 }));
    return f0(u, o); };
  let n = 0, heard = null;
  const go = setInterval(() => {
    if (!(window.ASH && ASH.tables && ASH.tables() && ASH.core)) return; clearInterval(go);
    heard = ASH.tables()._bank(o => f0('/bank', { method: 'POST', body: JSON.stringify({ a, o }) }), a);
    if (!sessionStorage.getItem('ptGold')) { ASH.give('coins', 5000); sessionStorage.setItem('ptGold', '1'); }
    ASH.hud.chat('PLAYTEST: the clubhouse tables run on the real Bank code with pretend GOLD. Go up the stairs in the south-east corner.', 'sys');
    /* the bots: drawn standing at their spots, as room players are (the game's own test hook for a scripted player) */
    const shown = new Set();
    (async function bots() { if (/[?&]nobotview/.test(location.search)) return; try { const L = await f0('/bots').then(x => x.json()), now = new Set();
        for (const b of L) { const o = (ASH.core.M.objects || []).find(q => q.id === b.tbl), t = o && o.spots[b.spot - 1]; if (!t) continue; now.add(b.id);
          const cx = o.x + (o.w || 1) / 2, cy = o.y + (o.h || 1) / 2, f = Math.atan2(cx - (t[0] + 0.5), cy - (t[1] + 0.5));
          ASH._inject(b.id, Object.assign({ p: [t[0] + 0.5, t[1] + 0.5], l: o.lv | 0, a: 'idle', f, s: Date.now(), n: b.name, o: b.o })); }
        /* a bot that left is no longer told: the game drops a player it has not heard from (as when someone closes their tab) */
        for (const id of Array.from(shown)) if (!now.has(id)) shown.delete(id); for (const id of now) shown.add(id);
      } catch (e) { } setTimeout(bots, 1000); })();
    (async function poll() { try { const r = await f0('/bank?a=' + a + '&n=' + n).then(x => x.json()); for (const [k, d] of r) { n = Math.max(n, k); try { heard(d); } catch (e) { console.warn(e); } } } catch (e) { }
      setTimeout(poll, 400); })();
  }, 300);
})();
</script>"""
def word(a, m):   # one word to the Bank, as from a wallet (under LOCK): a deposit's send shows on the pretend chain at once
    if m.get('t') == 'tbin' and m.get('tx'):
        L.execute('insert or ignore into arcade_tx values(?,?,?,?,?,?,?,?,?,?,?)', (m['tx'], 1, 1, 'C', 0, 0, a, bank.ASHVALE, '00000000%08x%016x' % (26, int(m.get('n') or 0)), 1, None)); L.commit()
    rep = bank.handle(C, a, m)
    for r in (rep if isinstance(rep, list) else [rep] if rep else []): bank.OUTQ.append(r)
    emit(); return rep
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import playtest_bots as BOTS   # 2026-10-21: "Add some bot players to the simulation" - pretend players at the tables, through the same Bank words
if os.environ.get('NOBOTS') is None: BOTS.start(word, C, LOCK, TB)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/bank':
            q = urllib.parse.parse_qs(u.query); a = (q.get('a') or [''])[0]; n = int((q.get('n') or ['0'])[0])
            with LOCK: rows = [[k, d] for k, to, d in OUT if k > n and (to is None or to == a)]
            return self.reply(json.dumps(rows), 'application/json')
        if u.path in ('/tables.html', '/') and 'go=' not in u.query:   # the operator: start in the clubhouse, at the foot of the stairs
            self.send_response(302); self.send_header('Location', '/tables.html?nocreator&notut&go=640,-118' + ('&' + u.query if u.query else '')); self.end_headers(); return
        if u.path in ('/tables.html', '/'):
            html = open(os.path.join(ROOT, 'dist', 'ashvale3d.html'), encoding='utf-8').read()
            html = html.replace('</body>', PAGE + '</body>') if '</body>' in html else html + PAGE
            return self.reply(html, 'text/html; charset=utf-8')
        if u.path == '/r/inscriptions': return self.reply('[]', 'application/json')
        if u.path == '/bots':
            with LOCK: return self.reply(json.dumps(BOTS.seated()), 'application/json')
        return super().do_GET()
    def do_POST(self):
        if self.path != '/bank': self.send_response(404); self.end_headers(); return
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}'); a, m = str(body.get('a') or ''), body.get('o') or {}
        with LOCK: word(a, m)
        self.reply('{}', 'application/json')
    def reply(self, s, ct):
        b = s.encode() if isinstance(s, str) else s
        self.send_response(200); self.send_header('Content-Type', ct); self.send_header('Content-Length', str(len(b))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(b)
os.chdir(ROOT)
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8795
print('playtest on :%d  (/tables.html)' % port, flush=True)
http.server.ThreadingHTTPServer(('0.0.0.0', port), H).serve_forever()
