"""N-player multiplayer check (default 4), used for the arcade mock and for ?loopback.
Each player must see all others with the right "Name (@tag)" tags; gear and outfit changes propagate; chat reaches
everyone; a player in the next zone stays visible, one in another region disappears and reappears; a closed tab disappears; every client stays inside the
mesh send budget (~5 msgs/s sustained, burst 10). Prints the send rate per client."""
import json, time

def many_players(browser, url_for, check, n=4, sandbox=False, shot=None, trade_check=False):
    ctx = browser.new_context(viewport={'width': 640, 'height': 400})
    if sandbox:
        ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });")
    errs, pages = [], []
    names = ['Ann', 'Ben', 'Cat', 'Dov', 'Eve', 'Fin'][:n]
    for i in range(n):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.goto(url_for(i), wait_until='domcontentloaded', timeout=120000); pages.append(pg)
    t0 = time.time()
    while time.time() - t0 < 90 and not all(pg.evaluate('!!(window.ASH && ASH.core)') for pg in pages): time.sleep(1)
    for pg, nm in zip(pages, names): pg.evaluate('ASH.hud.showHelp(false); ASH.core.cmd("me", {c: "look", name: "%s"})' % nm)
    def seen_ok(active):
        for i in active:
            got = sorted((x or '').split(' (')[0] for x in pages[i].evaluate('ASH.net().names'))
            if got != sorted(names[j] for j in active if j != i): return False
        return True
    def wait_for(fn, t=25):
        t0 = time.time()
        while time.time() - t0 < t:
            if fn(): return True
            time.sleep(0.5)
        return False
    allp = list(range(n))
    check(wait_for(lambda: seen_ok(allp)), '%d players: everyone sees everyone else by name' % n)
    tags_ok = all(all(x and x.endswith(')') and ('(@' in x or '(guest)' in x) for x in pg.evaluate('ASH.net().names')) for pg in pages)
    check(tags_ok, 'all name tags are "Name (@tag)" or "Name (guest)": %s' % pages[0].evaluate('ASH.net().names'))
    if trade_check:   # "Trade with" appears on signed-in players only, and only when arcade.swap is there
        opts = []
        for rid in pages[0].evaluate('ASH.net().ids'):
            pos = pages[0].evaluate('ASH.screenOf("remote", %s)' % json.dumps(rid))
            if pos: opts += pages[0].evaluate('ASH.optionsAt(%f, %f)' % (pos['x'], pos['y']))
        tr = sorted(set(o for o in opts if o.startswith('Trade with')))
        check(any(o.startswith('Trade with Ben (@') for o in tr) and not any('(guest)' in o for o in tr), 'options menu offers "Trade with" signed-in players, never guests: %s' % tr)
    # gear + outfit change on player 0
    pages[0].evaluate('ASH.give("hat_wizard", 1); ASH.core.cmd("me", {c: "equip", slot: ASH.me.inv.findIndex(s => s && s.id === "hat_wizard")}); ASH.core.cmd("me", {c: "look", look: Object.assign({}, ASH.me.look || {}, {hairColor: "#c8c8cc"})})')
    check(wait_for(lambda: all(any(g[0] == names[0] and g[1] and g[1].get('head') == 'hat_wizard' for g in pg.evaluate('ASH.net().gear')) for pg in pages[1:]), 15), 'a gear change (wizard hat) reaches every other player')
    # chat from player 1
    pages[1].evaluate('ASH.say("hi all from %s")' % names[1])
    check(wait_for(lambda: all('hi all from ' + names[1] in pg.evaluate('document.querySelector(".chat").innerText') for i, pg in enumerate(pages) if i != 1), 10), 'chat reaches every other player')
    if shot: pages[0].evaluate('ASH.setCam(0.3, 0.6, 9)'); pages[0].wait_for_timeout(1500); pages[0].screenshot(path=shot); print('     shot', shot)
    # zone change (2026-10-02: "If the zones are adjacent then the player should be visible"): player 2 goes into
    # Whisperwood and everyone keeps seeing everyone (one room per region); then player 2 goes to another region (a far
    # away spot, 300 m west) and leaves the room; back in the village, they reappear
    pages[2].evaluate('ASH.teleport(24, 30)'); time.sleep(3)
    check(wait_for(lambda: seen_ok(allp) and pages[2].evaluate('ASH.net().area') == 'whisperwood', 10), 'a player who walks into Whisperwood stays visible to the village (adjacent zones share the room)')
    pages[2].evaluate('ASH.teleport(-300, 52)')
    rest = [i for i in allp if i != 2]
    check(wait_for(lambda: seen_ok(rest) and pages[2].evaluate('ASH.net().names').__len__() == 0, 20), 'a player who goes to another region leaves the room (others stop seeing them): ' + str(pages[2].evaluate('ASH.net().region')))
    pages[2].evaluate('ASH.teleport(23, 52)')
    check(wait_for(lambda: seen_ok(allp), 20), 'and reappears for everyone when back in the village')
    # tab close
    stats = [pg.evaluate('ASH.net().stats') for pg in pages]
    pages[n - 1].close()
    left = list(range(n - 1))
    check(wait_for(lambda: all(len(pages[i].evaluate('ASH.net().names')) == n - 2 for i in left), 20), 'a closed tab disappears for everyone (no frozen avatar)')
    for nm, st in zip(names, stats):
        print('     %s sends: %.2f/s average, max %d in 1 s, max %d in 2 s, dropped %d' % (nm, st['perSec'], st['max1s'], st['max2s'], st['dropped']))
    check(all(st['perSec'] <= 5 and st['max2s'] <= 10 and st['dropped'] == 0 for st in stats), 'every client stays inside the send budget (<= 5/s average, <= 10 per 2 s burst, nothing dropped)')
    check(not errs, 'no console errors with %d players %s' % (n, errs[:3]))
    ctx.close()
