"""check_gather_reach_pw.py - a gather you cannot walk to says so, instead of doing nothing.

The chop check in tests/play_pw.py was red for a day and the game never said why. The reason was core.js's gather
branch: it paths toward a node that is not within a tile, and when it cannot get there it ends the order with
`p.act = null` and NO message — the only skill refusal in the game that stayed silent, while the attack branch
above it has always said "I can't reach that!". The message went in on 2026-10-03; this keeps it there.

The shape under test has to be a node that is genuinely unreachable, so the check floods the land from the
character (walkable tiles only, the game's own M.blocked) and picks the NEAREST gatherable node that none of the
eight tiles beside it belongs to that set. Ordering that gather must produce the sentence — and no logs. A run
that finds no such node fails rather than passing quietly.

  python3 build.py
  python3 -m http.server 8731 --bind 127.0.0.1 &        # if it is not already up
  ~/.pyenv/versions/3.11.9/bin/python3 tools/check_gather_reach_pw.py
"""
import sys, time
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&loopback&seed=gatherreach'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage']
# flood the walkable land from me (the game's own blocked/edge rules), then find the nearest gatherable node
# whose eight neighbours are all outside it. inPiece is excluded: a set piece owns its own nodes.
FIND = """(() => { const M = ASH.core.M, me = ASH.me, seen = new Set([me.x + ',' + me.y]), q = [[me.x, me.y]];
  while (q.length && seen.size < 20000) { const [x, y] = q.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k)) continue;
      if (Math.abs(nx - me.x) > 26 || Math.abs(ny - me.y) > 26) continue;
      if (!M.inWorld(nx, ny) || M.blocked(nx, ny)) continue; seen.add(k); q.push([nx, ny]); } }
  let best = null, bd = 99;
  for (let r = 2; r <= 26; r++) for (let y = me.y - r; y <= me.y + r; y++) for (let x = me.x - r; x <= me.x + r; x++) {
    const n = ASH.core.nodeAt(M.key(x, y));
    if (!n || 'TPOWM'.indexOf(n.kind) < 0 || n.kind === 'Y' || n.kind === 'M' || M.inPiece(x, y)) continue;
    let open = false;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]])
      if (seen.has((x + dx) + ',' + (y + dy))) open = true;
    if (open) continue;
    const d = Math.abs(x - me.x) + Math.abs(y - me.y); if (d < bd) { bd = d; best = [x, y, n.kind, d]; } }
  return best; })()"""
LOGS = 'ASH.core.invCount(ASH.me, "logs") + ASH.core.invCount(ASH.me, "oak_logs") + ASH.core.invCount(ASH.me, "willow_logs")'
CHAT = "(t) => [...document.querySelectorAll('.chat > div')].slice(t).map(n => n.textContent).join(' | ')"
bad = []


def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c:
        bad.append(msg)


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_context(viewport={'width': 1280, 'height': 800}).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until='domcontentloaded')
    for _ in range(90):
        if pg.evaluate("() => !!(window.ASH && ASH.core && ASH.me && !ASH.me.dead)"):
            break
        pg.wait_for_timeout(500)
    pg.evaluate("() => { ASH.hud.showHelp(false); ASH.setLevel('woodcutting', 30); ASH.give('hatchet', 1); ASH.hud.setTab(null); }")
    pg.wait_for_timeout(600)
    node = pg.evaluate(FIND)
    check(bool(node), 'the seed has a gatherable node nothing can walk up to (within 26 tiles): %s' % node)
    if node:
        # No teleport: standing in the character's own land is the point. The game paths toward the node and stops at
        # the closest tile it can stand on, so the node is chosen NEAREST (<= 26 tiles, all of whose neighbours the
        # flood therefore saw) to keep that walk short.
        said_before = pg.evaluate("() => document.querySelectorAll('.chat > div').length")
        logs0 = pg.evaluate(LOGS)
        pg.evaluate("() => ASH.core.cmd('me', {c: 'gather', x: %d, y: %d})" % (node[0], node[1]))
        told = ''
        t0 = time.time()
        while time.time() - t0 < 60:
            pg.wait_for_timeout(1500)
            said = pg.evaluate(CHAT, said_before)
            if 'reach' in said.lower():
                told = said
                break
        check(bool(told), 'ordering a gather across water tells the player, not nothing: %s' % (told or ('60 s of silence; the log said: ' + (said or '(nothing)'))[-220:]))
        check(pg.evaluate(LOGS) == logs0, 'and it gave nothing to carry: logs %s -> %s' % (logs0, pg.evaluate(LOGS)))
    if errs:
        print('   page errors:', errs[:3])
        bad.append('page errors: %s' % errs[:3])
    pg.close(); b.close()

if bad:
    print('FAILED: %d' % len(bad)); sys.exit(1)
print('OK: a gather the character cannot walk to says "I can\'t reach that!" and yields nothing')
