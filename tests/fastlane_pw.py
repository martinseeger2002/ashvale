"""tests/fastlane_pw.py [players] - ASHVALE over the arcade's real fast lane (2026-11-01): a throwaway arcade node (no
chain), the arcade page inscribed on it, N guests in visible Chromium windows in one region room. Checks: everyone links; with
every link up the region's room goes silent and everything travels on the fast lane; a chat line is heard once; how long a
chat line takes on each road (the same run with ?nofast is the room's figure); a player with no WebRTC is still seen and
heard through the room, at no cost to the others; a link gone dead without a word (a dropped network leaves it 'direct') is
noticed and the room carries that player again.
    python3 build.py --arcade
    DISPLAY=:1 XAUTHORITY=/run/user/1000/gdm/Xauthority ARCADE_CHECKOUT=~/arcade-work/mesh-udp \
      ~/arcade-localtest/.venv/bin/python -u tests/fastlane_pw.py 3
Env ASH_SLOW=1: every page with ?nofast (only the latency figure means anything)."""
import os, pathlib, statistics, sys, tempfile, time

ARCADE = pathlib.Path(os.environ.get('ARCADE_CHECKOUT', os.path.expanduser('~/arcade-localtest')))
sys.path.insert(0, str(ARCADE)); sys.path.insert(0, str(ARCADE / 'tests'))
ROOT = pathlib.Path(__file__).resolve().parent.parent
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
SLOW = os.environ.get('ASH_SLOW') == '1'
os.environ.setdefault('DISPLAY', ':1')

from test_claim_browser import _free_port                       # noqa: E402
from test_realtime_rejoin_browser import Server, _mesh          # noqa: E402
from test_realtime_web import make_state                        # noqa: E402
from test_trade_browser import _inscribe                        # noqa: E402
from playwright.sync_api import sync_playwright                 # noqa: E402

THREE = '374cfd2b2f114e9da4ade8add495fe8aa0b2b996a710fb538759a956f15f9539'
GAME = 'a5' * 32
QS = 'nocreator&notut&nosound' + ('&nofast' if SLOW else '')
fails = []
def check(c, msg): print(('ok   ' if c else 'FAIL ') + msg, flush=True); (None if c else fails.append(msg))

BLOCK = "RTCPeerConnection.prototype.setRemoteDescription = function () { return Promise.reject(new Error('blocked')); };"
# a dead line that says nothing: channels stay 'open', and nothing crosses them either way
MUTE = """(() => { const send = RTCDataChannel.prototype.send; RTCDataChannel.prototype.send = function (d) { if (!window.__mute) return send.call(this, d); };
  const set = Object.getOwnPropertyDescriptor(RTCDataChannel.prototype, 'onmessage').set;
  Object.defineProperty(RTCDataChannel.prototype, 'onmessage', { set(f) { set.call(this, e => { if (!window.__mute) f(e); }); } }); })();"""
LOG = """(() => { window.__heard = []; const c = document.querySelector('.chat');
  new MutationObserver(() => { const now = Date.now(); for (const m of c.innerText.matchAll(/ping(\\d{13})/g)) { window.__heard.push([m[1], now]); } }).observe(c, { childList: true, subtree: true }); })()"""
SAY = """(t) => { const i = document.querySelector('.say input'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true }));
  i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); }"""
NET = "(() => { const n = ASH.net(); return { room: n.room, id: n.myId, ids: n.ids, fast: n.fast, sent: n.stats.sent, sentFast: n.stats.fast || 0, dropped: n.stats.dropped, host: n.host, status: n.status }; })()"


def until(fr, js, secs, what):
    end = time.time() + secs
    while time.time() < end:
        try:
            got = fr.evaluate(js)
            if got: return got
        except Exception: pass
        time.sleep(0.4)
    print('     timed out:', what, flush=True); return None


def join(b, base, i, errs, blocked=False):
    ctx = b.new_context(viewport={'width': 560, 'height': 380}); pg = ctx.new_page(); errs[i] = []
    pg.add_init_script(BLOCK if blocked else MUTE)
    pg.on('pageerror', lambda e: errs[i].append(str(e)))
    pg.goto(f'{base}/inscriptions/{GAME}/full', timeout=120000); pg.wait_for_selector('.inscription-frame', timeout=60000)
    fr = None; end = time.time() + 60
    while fr is None and time.time() < end:
        fr = next((f for f in pg.frames if f != pg.main_frame), None); time.sleep(0.2)
    for w in pg.frames:
        if w != pg.main_frame: fr = w
    if not until(fr, 'window.ASH && ASH.core && ASH.net && !!ASH.net().room', 150, f'player {i} in a room'):
        raise SystemExit(f'player {i} never joined: {errs[i][:3]}')
    fr.evaluate('ASH.hud.showHelp && ASH.hud.showHelp(false)')
    fr.evaluate(LOG)
    print(f'player {i} in', fr.evaluate(NET), flush=True)
    return pg, fr


def chat_times(frames, say_i, hear, n=12):
    out = []
    for k in range(n):
        at = int(time.time() * 1000); frames[say_i][1].evaluate(SAY, f'ping{at}'); time.sleep(1.5)
        got = [h for h in frames[hear][1].evaluate('window.__heard') if h[0] == str(at)]
        if got: out.append(got[0][1] - at)
    return out


def main():
    html = (ROOT / 'dist' / 'ashvale3d_arcade.html').read_bytes()
    html = html.replace(b'<head>', b'<head><script>window.ASH_QS=' + repr(QS).encode() + b'</script>', 1)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='ash-fast-'))
    state = make_state(tmp, 'node'); state.set_setting('realtime_public_stun', False); state.mesh = _mesh()
    _inscribe(state, GAME, 1, 'n' + 'G' * 33, 'text/html', html)
    _inscribe(state, THREE, 2, 'n' + 'G' * 33, 'text/javascript', (ROOT / 'vendor' / 'three.module.min.js').read_bytes())
    from arcade.web.app import create_app
    port = _free_port(); base = f'http://127.0.0.1:{port}'; server = Server(create_app(state), port)
    print('node up at', base, flush=True)
    errs, frames = {}, []
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(headless=False, args=['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
                                                         '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'])
            for i in range(N): frames.append(join(b, base, i, errs))
            until(frames[0][1], f'ASH.net().ids.length >= {N - 1}', 30, 'everyone seen')
            print('sees', [fr.evaluate('ASH.net().ids.length') for _, fr in frames], flush=True)
            if SLOW:
                ts = chat_times(frames, 0, 1); check(len(ts) >= 10, f'chat over the ROOM: {len(ts)}/12 arrive')
                print('     ROOM chat ms: median %d, max %d' % (statistics.median(ts), max(ts))); return
            ok = all(until(fr, 'ASH.net().fast && ASH.net().fast.all', 45, 'all links up') for _, fr in frames)
            check(ok, 'every player links with every other: ' + str([fr.evaluate('ASH.net().fast && ASH.net().fast.peers') for _, fr in frames[:2]]))
            a = frames[0][1].evaluate(NET); frames[0][1].evaluate('ASH.core.cmd("me", {c: "walk", x: ASH.me.x + 6, y: ASH.me.y})')
            time.sleep(10); z = frames[0][1].evaluate(NET)
            check(z['sent'] - a['sent'] <= 3, f"with every link up the room goes silent: {z['sent'] - a['sent']} room sends in 10 s, {z['sentFast'] - a['sentFast']} on the fast lane")
            check(z['sentFast'] > a['sentFast'], 'the walk went out on the fast lane')
            ts = chat_times(frames, 0, 1); check(len(ts) >= 10, f'chat over the FAST LANE: {len(ts)}/12 arrive')
            print('     FAST chat ms: median %d, max %d' % (statistics.median(ts), max(ts)))
            heard = frames[1][1].evaluate('(() => { const c = {}; for (const h of window.__heard) c[h[0]] = 1; return Object.keys(c).length; })()')
            lines = frames[1][1].evaluate("(document.querySelector('.chat').innerText.match(/ping\\d{13}/g) || []).length")
            check(lines == heard, f'each line is heard once: {lines} lines for {heard} pings')
            # a dead line that says nothing
            d = N - 1; frames[d][0].evaluate('window.__mute = true'); print('player', d, 'links gone dead', flush=True)
            mid = frames[d][1].evaluate(NET)['id']
            noticed = until(frames[0][1], f'!ASH.net().fast.live.includes("{mid}")', 8, 'dead link noticed')
            check(bool(noticed), 'a link gone dead is noticed within 8 s')
            time.sleep(2); ts = chat_times(frames, 0, d, 4); check(len(ts) >= 3, f'the room carries a player whose links died: {len(ts)}/4 chat lines, {ts}')
            ts = chat_times(frames, d, 0, 4); check(len(ts) >= 3, f'and that player is heard: {len(ts)}/4, {ts}')
            frames[d][0].evaluate('window.__mute = false')
            check(bool(until(frames[0][1], 'ASH.net().fast.all', 10, 'link back')), 'the link comes back')
            # a player with no way to link
            frames.append(join(b, base, N, errs, blocked=True))
            until(frames[0][1], f'ASH.net().ids.length >= {N}', 30, 'the unlinked player seen')
            bl = frames[N][1].evaluate(NET)['id']
            check(bl in frames[0][1].evaluate('ASH.net().ids'), 'a player who cannot link is seen')
            time.sleep(16); ts = chat_times(frames, 0, N, 4); check(len(ts) >= 3, f'and hears chat through the room: {len(ts)}/4, {ts}')
            ts = chat_times(frames, 0, 1, 4); check(len(ts) >= 3, f'while linked players stay fast: {ts}')
            rep = [fr.evaluate(NET) for _, fr in frames]
            for r in rep: print('    ', r, flush=True)
            check(all(r['dropped'] == 0 for r in rep), 'no room send was refused: ' + str([r['dropped'] for r in rep]))
            try: frames[0][0].screenshot(path=str(ROOT / 'tests' / 'shots' / 'fastlane.png'), timeout=20000)
            except Exception as e: print('     no shot:', str(e)[:80])
            bad = {i: e[:3] for i, e in errs.items() if e}
            check(not bad, f'no page errors: {bad}')
    finally:
        server.stop() if hasattr(server, 'stop') else None
    print('FAILED %d' % len(fails) if fails else 'ALL PASSED', flush=True)


main()
os._exit(1 if fails else 0)
