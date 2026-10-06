"""Two-player check shared by play_pw.py (?loopback, BroadcastChannel) and arcade_pw.py (the arcade page + mock SDKs):
each player sees the other with the right "Name (@tag)" tag, and a chat line typed by one arrives at the other."""
import os, time

def two_players(browser, url_a, url_b, shot_path, check, sandbox=False, ctx_opts=None):
    ctx = browser.new_context(**(ctx_opts or {'viewport': {'width': 1100, 'height': 700}}))
    if sandbox:   # an inscribed page has no localStorage: touching it throws
        ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });")
    errs = []
    pa, pb = ctx.new_page(), ctx.new_page()
    for pg in (pa, pb):
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    # 120 s, the patience the globe section already uses (play_pw.py:441). The 8731/8732 servers are
    # single-threaded, so the second page's request queues behind the first page's module fetches; at load 10+
    # that queue outlasts the 30 s default and the run dies in a goto instead of a check.
    pa.goto(url_a, timeout=120000); pb.goto(url_b, timeout=120000)
    pa.wait_for_timeout(5000)
    for pg, nm in ((pa, 'Alice'), (pb, 'Bob')):
        pg.evaluate('ASH.hud.showHelp(false); ASH.core.cmd("me", {c: "look", name: "%s"})' % nm)
    pa.evaluate('ASH.core.cmd("me", {c: "walk", x: 24, y: 53})')
    t0 = time.time(); ok = False
    while time.time() - t0 < 20:
        na, nb = pa.evaluate('ASH.net().names'), pb.evaluate('ASH.net().names')
        if any(n and n.startswith('Bob (') for n in na) and any(n and n.startswith('Alice (@') for n in nb): ok = True; break
        time.sleep(0.5)
    pb.evaluate('ASH.core.cmd("me", {c: "look", look: Object.assign({}, ASH.ents.get("p:me").H.outfit, {body: "female", hair: "long"})})')
    fem = False; t1 = time.time()
    while time.time() - t1 < 10 and not fem:
        fem = pa.evaluate('[...ASH.ents.values()].some(e => e.key[0] === "r" && e.H.outfit && e.H.outfit.body === "female")'); time.sleep(0.4)
    check(fem, 'B chose a female body and A sees B as female')
    check(ok, 'both players see each other with name tags: A sees %s, B sees %s' % (pa.evaluate('ASH.net().names'), pb.evaluate('ASH.net().names')))
    check(pa.evaluate('getComputedStyle(document.querySelector(".say")).display') == 'flex', 'the chat input shows when online')
    pa.click('.say input'); pa.keyboard.type('hello from Alice'); pa.keyboard.press('Enter')
    got = False; t0 = time.time()
    while time.time() - t0 < 8:
        txt = pb.evaluate('document.querySelector(".chat").innerText')
        if 'hello from Alice' in txt: got = True; break
        time.sleep(0.25)
    check(got, 'chat line arrives at the other player: "%s"' % [l for l in pb.evaluate('document.querySelector(".chat").innerText').split('\n') if 'Alice' in l][-1:])
    check(pb.evaluate('!!document.querySelector(".bub")'), 'speech bubble over the speaker\'s head')
    s = pb.evaluate('ASH.screenOf("me")'); pb.evaluate('ASH.setCam(0.2, 0.55, 7)'); pb.wait_for_timeout(2000)
    pb.screenshot(path=shot_path); print('     shot', shot_path)
    pa.evaluate('ASH.say("one"); ASH.say("two")')
    check('talking too fast' in pa.evaluate('document.querySelector(".chat").innerText'), 'chat is rate-limited locally')
    res = {'errs': errs, 'pa': pa, 'pb': pb, 'ctx': ctx}
    return res
