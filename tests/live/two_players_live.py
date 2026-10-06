"""two_players_live.py <demo txid> [account] - LIVE test on app.dogecoinarcade.com: one signed-in account + one guest open the
ASHVALE demo full screen; each must see the other with the right tag, and a chat line must arrive. Playwright Chromium."""
import sys, json, time
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
import os; os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/home/you/.cache/ms-playwright"
from drvc import accounts
from playwright.sync_api import sync_playwright
TX = sys.argv[1]; WHO = sys.argv[2] if len(sys.argv) > 2 else 'symmetry'; APP = 'https://app.dogecoinarcade.com'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
def game(pg):
    """The frame holding the game. The launcher keeps two documents alive (its own shell, which can carry a stale ASH
    from before the creator ran, and the iframe the game really runs in), so prefer a frame with a live entity map."""
    shell = None
    for f in pg.frames:
        try:
            if f.evaluate("!!(window.ASH && ASH.ents && ASH.ents.size)"): return f
            if shell is None and f.evaluate('!!window.ASH'): shell = f
        except Exception: pass
    return shell
def answer_cards(g):
    """The arcade's own yes/no cards (arcadeAsk / the identity sign of 2026-10-01, 'Join this game as you? Your wallet
    signs who you are, once a day') are drawn in the game's document over the game's UI, so they have to be answered
    before anything behind them can be clicked. Say yes to each and say out loud what it asked."""
    for _ in range(4):
        btns = g.query_selector_all('.askcard button')
        if not btns: return
        print('   card: ' + (g.evaluate("(() => { const c = document.querySelector('.askcard'); return c ? c.innerText.replace(/\\n+/g, ' | ') : '' })()") or '')[:200], flush=True)
        try: btns[0].click(timeout=5000)
        except Exception as e: print('   card click failed:', str(e)[:120], flush=True); return
        g.wait_for_timeout(2500)
def click_through(g, sel):
    """Click sel, and if the arcade's own overlay (.askcard-back, 2026-10-01: "Join this game as you? ...") is sitting on
    it, say out loud exactly what it asked, answer it, and retry. Last resort is a JS click on the same element, so the
    check measures the game rather than the arcade's card - but the card is printed either way, because a player sees it."""
    for _ in range(3):
        try:
            g.click(sel, timeout=6000); return True
        except Exception:
            msg = (g.evaluate("(() => { const b = document.querySelector('.askcard-back'), c = document.querySelector('.askcard'); return (b ? '[askcard-back] ' : '') + (c ? c.innerText.replace(/\\n+/g, ' | ') : 'no .askcard') })()") or '')[:220]
            print('   blocked on ' + sel + ': ' + msg, flush=True)
            btns = g.query_selector_all('.askcard button, .askcard-back button')
            if btns:
                try: btns[0].click(timeout=4000); g.wait_for_timeout(2000); continue
                except Exception: pass
            try: g.evaluate("(() => { const e = document.querySelector(" + json.dumps(sel) + "); if (!e) throw new Error('gone'); e.click(); })()"); return True
            except Exception: pass
    return False

def cc_up(g):
    """Is the character creator still on screen? hudcreator.js hides it with display:none instead of removing it, so
    query_selector('.cc') stays true forever once you have been through it - ask the style, not the DOM."""
    try: return bool(g.evaluate("(() => { const c = document.querySelector('.cc'); return !!c && getComputedStyle(c).display !== 'none'; })()"))
    except Exception: return True
def leave_creator(g):
    """The creator is two cards when there are starting points to spend (hudcreator.js:30 - the first card's
    [data-a=done] reads 'Next: skills' and only the skills card's [data-a=go] actually closes it). Click till it's gone."""
    for _ in range(6):
        if not cc_up(g): return True
        for sel in ('.cc [data-a=go]', '.cc [data-a=done]'):
            if g.query_selector(sel):
                click_through(g, sel); break
        g.wait_for_timeout(1500)
    return not cc_up(g)
def start(pg, name):
    """One page, from open link to standing in the world. Returns the page, not a frame: the frame you get before the
    creator closes can go stale when the launcher swaps documents, and a stale frame reads as null everywhere."""
    for _ in range(40):
        g = game(pg)
        if g: break
        pg.wait_for_timeout(1500)
    g.wait_for_selector('.cc input', timeout=30000)
    answer_cards(g)
    g.fill('.cc input', name)
    if not leave_creator(g): raise Exception('the character creator never closed')
    pg.wait_for_timeout(500)
    try: g.click('.help .btn', timeout=5000)
    except Exception: pass
    return pg
def ev(pg, js, tries=8):
    """Evaluate in whichever frame holds the game right now, waiting for it to be there."""
    for _ in range(tries):
        g = game(pg)
        if g:
            try: return g.evaluate(js)
            except Exception: pass
        pg.wait_for_timeout(1500)
def wait_room(pg, tries=30):
    """Wait until this page's engine is in a room. Reading the world before the join lands looks exactly like 'the
    other player is not there': ents are all there, net() answers, and every remote list is empty."""
    for _ in range(tries):
        r = ev(pg, "(() => { const n = ASH.net && ASH.net(); return (n && n.room) || null })()", tries=1)
        if r: return r
        pg.wait_for_timeout(2000)
    return None
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    A = b.new_context(viewport={'width': 1100, 'height': 650}); B = b.new_context(viewport={'width': 1100, 'height': 650})
    pa, pb = A.new_page(), B.new_page(); errs = {'A': [], 'B': []}
    pa.on('console', lambda m: m.type == 'error' and errs['A'].append(m.text[:160])); pb.on('console', lambda m: m.type == 'error' and errs['B'].append(m.text[:160]))
    pw = accounts()[WHO]['password']
    pa.goto(APP + '/join'); pa.wait_for_timeout(4000)
    pa.fill('#in-tag', WHO); pa.fill('#in-pw', pw); pa.click('#enter'); pa.wait_for_timeout(12000)
    pa.goto(APP + '/inscriptions/' + TX + '/full'); pb.goto(APP + '/inscriptions/' + TX + '/full')
    start(pa, 'Sym'); start(pb, 'Guesty')
    res['A_room'] = wait_room(pa); res['B_room'] = wait_room(pb)
    ME = "(() => { const n = ASH.net && ASH.net(); return n ? { me: n.me || null, room: n.room || null, names: n.names || [], remotes: (n.remotes || []).length } : null })()"
    res['A_me'] = ev(pa, ME); res['B_me'] = ev(pb, ME)
    # Which document each read came from, so a null can be told apart from a wrong frame (two frames hold ASH now:
    # the launcher's own page and the game iframe).
    def frames(pg):
        out = []
        for f in pg.frames:
            try: out.append((f.url[:70], bool(f.evaluate('!!window.ASH')), f.evaluate("(window.ASH && ASH.ents && ASH.ents.size) || 0")))
            except Exception: out.append((f.url[:70], 'x', 'x'))
        return out
    res['A_frames'] = frames(pa); res['B_frames'] = frames(pb)
    ev(pa, 'ASH.teleport(20, 52)'); ev(pb, 'ASH.teleport(22, 52)'); pa.wait_for_timeout(8000)
    lab = "(() => [...ASH.ents.values()].filter(e => e.key && e.key.startsWith('r:')).map(e => e.tag ? e.tag.textContent : e.key))()"
    res['A_sees'] = ev(pa, lab); res['B_sees'] = ev(pb, lab)
    g = game(pb)
    try:
        g.fill('.say input, input.say, #say', 'hello from the guest'); g.press('.say input, input.say, #say', 'Enter')
    except Exception as e: res['say_err'] = str(e)[:120]
    pa.wait_for_timeout(5000)
    res['A_chat'] = ev(pa, "[...document.querySelectorAll('.chat div, .chat p, .chat span')].map(x => x.textContent).filter(t => t.includes('hello from the guest')).slice(0, 2)")
    ev(pa, 'ASH.setCam(0.5, 0.75, 8)'); pa.wait_for_timeout(1500); pa.screenshot(path='/home/you/ashvale3d/tests/shots/live_two_players.png')
    res['errors'] = errs
    b.close()
print(json.dumps(res, indent=1))
