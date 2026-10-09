"""bot.py - the test bot's routines (2026-10-05: "add some programmatic operations so that the agent can just
start the programmatic operation and not use so many tokens ... not to the game itself, but just to the test bot").
One command runs a whole routine on the LIVE game as @cinderwalker (tools/live_play.py + tools/play_lib.js) and logs
every step to chain/bot.log; anything that goes wrong is written to handoff/qwen_quest_bugs.md by itself. The agent
starts a routine and reads the logs; it does not steer each step.

  python3 tools/bot.py status                 where it is, what it carries, its levels, its quests
  python3 tools/bot.py money [GOLD]           sell what is in the chest/bag (pelts, meat, logs, ore...) until it has GOLD (default 60)
  python3 tools/bot.py gear                   money, then the best sword it can afford + 5 bread, worn
  python3 tools/bot.py earn [GOLD]            kill rats, cook their meat, sell their pelts, until it has GOLD (default 40) and 4 food
  python3 tools/bot.py train attack 10        fight (rats, then wolves when strong enough) until the skill reaches that level
  python3 tools/bot.py quest ashen_crown      play that quest from where it stands, step by step, handing in to the giver
  python3 tools/bot.py all                    every quest in data/quests.json, in order
  python3 tools/bot.py MINUTES=40 quest ...   cap a run (default 45 minutes)
Bugs it logs by itself: a goal naming a monster/item/NPC that does not exist or cannot be found, no progress after many
tries, the Quests panel showing 'undefined', a hand-in that does not advance the step, dying again and again."""
import sys, os, time, json
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, 'tools'))
from live_play import LiveGame
LOG, BUGS = os.path.join(HERE, 'chain', 'bot.log'), os.path.join(HERE, 'handoff', 'qwen_quest_bugs.md')
D = lambda n: json.load(open(os.path.join(HERE, 'data', n + '.json')))['data']
QUESTS, MONS, ITEMS, SHOPS = D('quests')['quests'], D('monsters')['monsters'], D('items')['items'], D('shops')
SHOPS = SHOPS.get('shops', SHOPS)
def node_spots(item):
    """every place in the zone maps that gives `item` (rules.nodes letter -> world x, y = map + origin): where to go when
    nothing gives it near him (2026-10-07: iron ore looked for at Saltmere, its only rocks are in the village)"""
    letters = [k for k, n in (D('rules').get('nodes') or {}).items() if n.get('item') == item]
    out = []
    for z in ('village', 'whisperwood', 'saltmere'):
        try: Z = D('zone.' + z)
        except Exception: continue
        ox, oy = (Z.get('origin') or [0, 0])[:2]
        for y, row in enumerate(Z.get('map') or Z.get('tiles') or []):
            if not isinstance(row, str): continue
            for x, c in enumerate(row):
                if c in letters: out.append((x + ox, y + oy))
    return out
def spawns_of(key):
    out = []
    for z in ('village', 'whisperwood', 'saltmere'):
        try: Z = D('zone.' + z)
        except Exception: continue
        ox = 0
        for s in Z.get('spawns', []):
            if s.get('m') == key: out.append((s['x'], s['y']))
    return out
SELL = ('pelt', 'rat_pelt', 'hare_pelt', 'snow_hare_pelt', 'goat_hide', 'deer_hide', 'boar_hide', 'timber_wolf_pelt', 'lizard_skin',
        'logs', 'oak_logs', 'willow_logs', 'copper_ore', 'tin_ore', 'iron_ore', 'coal')
# raw meat and fish are cooked on the range by the well, never sold: cooked food heals in fights (2026-10-05)
RANGE = (21, 57)
# anything a quest asks to be brought is kept, never sold or stashed
WANTED = {v for q in (QUESTS.values() if isinstance(QUESTS, dict) else QUESTS) for st in q.get('steps', [])
          for k, v in (st.get('goal') or {}).items() if k != 'kill' and isinstance(v, str) and v in ITEMS}
def log(*a):
    line = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a); print(line, flush=True); open(LOG, 'a').write(line + '\n')
SEEN = set()
LAST_BUG = {}   # quest id -> the last thing that went wrong in it, for the report
def bug(where, what, snap=None):
    LAST_BUG[where.split()[0]] = time.strftime('%m-%d %H:%M ') + what
    if (where, what) in SEEN: return
    SEEN.add((where, what))
    line = '- BOT %s **%s**: %s%s' % (time.strftime('%Y-%m-%d %H:%M'), where, what, ('  \n  state: ' + json.dumps(snap, default=str)[:600]) if snap else '')
    if not os.path.exists(BUGS): open(BUGS, 'w').write('# Quest bugs (found by playing the live game as @cinderwalker)\n\n')
    open(BUGS, 'a').write(line + '\n'); log('BUG', where, what)
LEARNED = os.path.join(HERE, 'chain', 'cinder_learned.json')
class Memory:
    """What @cinderwalker has learned from playing (2026-10-06: "It should be learning as it plays so that it can
    play better"). One record per monster, kept across runs in chain/cinder_learned.json: fights, kills, deaths, and
    what it now believes it needs before taking that monster on -- defence, combat level, food -- moved by what
    actually happened. A death with food still in the bag means it was too weak: train more. A death with none means
    it ran out: carry more. A run of kills without a death means it over-prepared: relax the food a little."""
    def __init__(self):
        try: self.d = json.load(open(LEARNED))
        except Exception: self.d = {'monsters': {}, 'lessons': []}
    def save(self):
        tmp = LEARNED + '.tmp'; json.dump(self.d, open(tmp, 'w'), indent=1); os.replace(tmp, LEARNED)
    def m(self, key):
        m = self.d['monsters'].setdefault(key, {'fights': 0, 'kills': 0, 'deaths': 0, 'streak': 0,
                                                'need_def': 1, 'need_cb': 1, 'need_food': FIGHT_FOOD})
        for k, v in (('dmg_avg', 0.0), ('dmg_max', 0), ('dmg_n', 0), ('most_at_once', 0), ('flees', 0), ('clear_first', False)): m.setdefault(k, v)
        return m
    def fought(self, key, res, before):
        """what one fight cost (2026-10-06: "if he doesn't have enough food to keep him healed for the duration of a
        battle, he should retreat"): the damage it took -- an average and the worst -- and how many monsters were on it at
        once. That is what decides how much food a fight with this monster needs."""
        m = self.m(key); dmg = int(res.get('dmg') or 0); at = int(res.get('most') or 0)
        if res.get('r') in ('kill', 'died', 'fled'):
            m['dmg_n'] += 1; m['dmg_avg'] = round(dmg if m['dmg_n'] == 1 else m['dmg_avg'] * 0.7 + dmg * 0.3, 1); m['dmg_max'] = max(m['dmg_max'], dmg)
        if at > m['most_at_once']:
            m['most_at_once'] = at
            if at > 1 and not m['clear_first']:
                m['clear_first'] = True
                self.lesson(key, '%d monsters attacked at once: clears the ones near it first, then fights it alone' % at)
        if res.get('r') == 'fled':
            m['flees'] += 1; m['fights'] += 1; m['streak'] = 0
            self.lesson(key, 'ran out of food at %d HP and got away: needs about %d damage worth of food' % (res.get('hp', 0), m['dmg_max']))
        self.save()
    def pile(self, at=None, clear=False):
        """where its things lie after a death, kept across runs: a restart (or a crash) must still go back for them"""
        if clear: self.d.pop('pile', None)
        elif at: self.d['pile'] = {'at': list(at), 'since': time.strftime('%m-%d %H:%M')}
        self.save(); return self.d.get('pile')
    def loot(self, where, got, left):
        k = 'loot_back' if got and not left else 'loot_lost'
        self.d[k] = self.d.get(k, 0) + 1
        if left: self.lesson(where, 'came back after dying but %d things were gone or out of reach' % left)
        self.save()
    def lesson(self, key, text):
        line = '%s %s: %s' % (time.strftime('%m-%d %H:%M'), key, text)
        self.d['lessons'] = (self.d.get('lessons', []) + [line])[-40:]; log('LEARNED', key + ':', text)
    def killed(self, key, s):
        m = self.m(key); m['fights'] += 1; m['kills'] += 1; m['streak'] += 1
        if m['streak'] >= 5 and m['need_food'] > 3:
            m['need_food'] -= 1; m['streak'] = 0
            self.lesson(key, '5 kills in a row without dying: %d food is enough' % m['need_food'])
        self.save()
    def died(self, key, before):
        m = self.m(key); m['fights'] += 1; m['deaths'] += 1; m['streak'] = 0
        food, dfn, cb = before.get('bread', 0), before.get('def', 1), before.get('cb', 1)
        was = (m['need_def'], m['need_cb'], m['need_food'])
        if food > 0:   # it had food and still lost: too weak for it
            m['need_def'] = max(m['need_def'], dfn + 3); m['need_cb'] = max(m['need_cb'], cb + 2)
            if (m['need_def'], m['need_cb']) != was[:2]:   # only a lesson when something changed (it once wrote the same one 9 times)
                self.lesson(key, 'died with %d food left at defence %d, combat %d: training to defence %d, combat %d first'
                            % (food, dfn, cb, m['need_def'], m['need_cb']))
        else:          # it ran out of food: bring more
            m['need_food'] = min(28, m['need_food'] + 2)
            self.lesson(key, 'died with no food left: carrying %d next time' % m['need_food'])
        self.save()
    def summary(self):
        return {k: '%d kills, %d deaths, %d retreats; wants defence %d, combat %d, %d food; takes ~%s damage a fight (worst %s)%s'
                   % (v['kills'], v['deaths'], v.get('flees', 0), v['need_def'], v['need_cb'], v['need_food'], v.get('dmg_avg', 0), v.get('dmg_max', 0),
                      '; clears the monsters near it first' if v.get('clear_first') else '')
                for k, v in self.d['monsters'].items()}


# Pick up what lies within r tiles, counting only what really reaches the bag (2026-10-06: "Cinder Walker stands
# around a lot"). Loot that shows on the ground but cannot be taken -- the area's host never confirms it, or it is
# somebody else's -- used to cost play_lib's pickUp 15 s an item, every sweep, and was reported as picked up anyway.
# Here an item gets 3 s; one that does not come is remembered and never tried again.
TAKE_JS = """const r = %d, bad = window.__untakeable = window.__untakeable || new Set(), tries = window.__takeTries = window.__takeTries || {}, got = [];
  const count = () => ASH.me.inv.reduce((a, q) => a + (q ? (q.n || 1) : 0), 0);
  for (const g of ASH.core.S.ground.slice()) {
    const far = Math.max(Math.abs(g.x - ASH.me.x), Math.abs(g.y - ASH.me.y));
    if (bad.has(g.uid) || far > r) continue;
    if (!ASH.me.inv.some(s => !s) && !ASH.me.inv.some(s => s && s.id === g.id)) continue;   // a full bag takes nothing
    const before = count();
    ASH.core.cmd('me', { c: 'take', uid: g.uid });
    // time to walk there as well as to pick it up (2026-10-07: a flat 3 s wrote off a whole death pile a few steps away)
    const t0 = Date.now(), allow = 3000 + 700 * far;
    while (Date.now() - t0 < allow && ASH.core.S.ground.some(q => q.uid === g.uid)) await wait(150);
    if (count() > before || (g.id === 'coins' && !ASH.core.S.ground.some(q => q.uid === g.uid))) got.push(g.id);
    else if ((tries[g.uid] = (tries[g.uid] || 0) + 1) >= 2) bad.add(g.uid);   // twice refused: somebody else's
  }
  return got;"""


# One fight with one monster (by uid), measured (2026-10-06): eats at half health; out of food and under a third
# of its health it RETREATS to `flee` instead of fighting to the death. Returns {r: kill|died|fled|gone|timeout, dmg
# taken, eaten, most monsters on it at once, hp}.
FIGHT_JS = """const uid = %d, ms = %d, flee = %s, mx = () => ASH.core.maxHp(ASH.me);
  const on = () => ASH.core.S.mobs.filter(q => !q.dead && q.tgt === 'me').length;
  let m = ASH.core.mobByUid(uid); if (!m || m.dead) return { r: 'gone', dmg: 0, eaten: 0, most: 0, hp: ASH.me.hp };
  cmd({ c: 'attack', uid }); let dmg = 0, last = ASH.me.hp, eaten = 0, most = 0; const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hp = ASH.me.hp; if (hp < last) dmg += last - hp; last = hp; most = Math.max(most, on());
    if (ASH.me.dead) return { r: 'died', dmg, eaten, most, hp: 0 };
    m = ASH.core.mobByUid(uid); if (!m || m.dead) { await sleep(1500); return { r: 'kill', dmg, eaten, most, hp: ASH.me.hp }; }
    if (hp < mx() * 0.5) {
      if (await eat()) { eaten++; last = ASH.me.hp; cmd({ c: 'attack', uid }); }
      else if (hp < mx() * 0.34) {
        cmd({ c: 'walk', x: flee[0], y: flee[1], run: true }); const t1 = Date.now();
        while (Date.now() - t1 < 25000 && !ASH.me.dead) { const h = ASH.me.hp; if (h < last) dmg += last - h; last = h; if (!on() && Date.now() - t1 > 4000) break; await sleep(500); }
        return { r: ASH.me.dead ? 'died' : 'fled', dmg, eaten, most, hp: ASH.me.hp };
      }
    }
    if (!ASH.me.act) cmd({ c: 'attack', uid });
    await sleep(500);
  }
  return { r: 'timeout', dmg, eaten, most, hp: ASH.me.hp };"""
# the hostile monsters standing within r tiles of a target (bandits around their leader): [uid, key, distance from me]
ADDS_JS = """const t = ASH.core.mobByUid(%d), r = %d, M = ASH.core.D.monsters; if (!t) return [];
  return ASH.core.S.mobs.filter(q => !q.dead && q.uid !== t.uid && (M[q.key] || {}).aggro && Math.max(Math.abs(q.x - t.x), Math.abs(q.y - t.y)) <= r)
    .map(q => [q.uid, q.key, Math.max(Math.abs(q.x - ASH.me.x), Math.abs(q.y - ASH.me.y))]).sort((a, b) => a[2] - b[2]);"""
# what the food in the bag heals in all, and its average per piece
FOOD_JS = """let tot = 0, n = 0; const mx = ASH.core.maxHp(ASH.me);
  for (const q of ASH.me.inv) { if (!q) continue; const d = ASH.core.item(q.id); if (!d || !d.edible) continue; const h = d.healPct ? Math.floor(mx * d.healPct / 100) : (d.heal || 0); tot += h * (q.n || 1); n += q.n || 1; }
  return { tot, n, avg: n ? tot / n : 3, hp: ASH.me.hp, max: mx };"""
RETREAT = (22, 52)   # the village well: where it goes when it has to get away
# nodes that give `item` near him, nearest first, leaving out what is felled for ever or not grown back
# (2026-10-07: the trees by Saltmere were felled by other players, and he kept walking to stumps)
LIVE_SPOTS_JS = """const it = %r, r = %d, C = ASH.core, dep = C.S.dep || {}, out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = ASH.me.x + dx, y = ASH.me.y + dy, i = C.idx(x, y), n = C.nodeAt(i);
    if (!n || n.item !== it) continue;
    if (dep[i] && dep[i] > C.S.t) continue;
    out.push([n.x, n.y, Math.max(Math.abs(dx), Math.abs(dy))]); }
  return out.sort((a, b) => a[2] - b[2]).slice(0, 8).map(s => [s[0], s[1]]);"""


class Bot:
    def __init__(self, g, minutes): self.g, self.t0, self.limit, self.mem = g, time.time(), minutes * 60, Memory()
    def r(self, js):
        try: return self.g.run(js)
        except Exception as e: log('step error', str(e)[:160]); return None
    def no_contacts(self):
        """the arcade's "Let this game see your contacts?" prompt (arcade.contacts, 2026-10-07) sits over the whole game
        until answered: chest, range and the hp orb all stopped working behind it and he died four times. A bot has no
        address book to share: Cancel, in whichever frame it is drawn."""
        try:
            for f in self.g.B.pg.frames:
                hit = f.evaluate("""() => { for (const b of document.querySelectorAll('button')) {
                    if (!/^\\s*cancel\\s*$/i.test(b.textContent || '')) continue;
                    let e = b; for (let k = 0; k < 5 && e; k++, e = e.parentElement) if (/see your contacts/i.test(e.innerText || '')) { b.click(); return true; } }
                  return false; }""")
                if hit: log('declined the contacts prompt (a bot has no address book to share)'); break
        except Exception: pass
    def not_elsewhere(self):
        """"ASHVALE is open on another device": the game stopped here -- no saves, no network -- because a newer game
        of @cinderwalker started somewhere (engine.js ONE DEVICE AT A TIME). From 00:49 to 12:00 on 2026-10-08 he
        played on into a stopped game and nothing counted. He is the bot that plays this character: Play here
        instead (a reload, which makes this the newest game), and the log says each time it happened."""
        if time.time() - getattr(self, '_elsewhereT', 0) < 20: return
        self._elsewhereT = time.time()
        if not self.r("const e = document.querySelector('.ash .elsewhere'); return !!(e && e.style.display === 'flex')"): return
        self._evicted = getattr(self, '_evicted', 0) + 1
        # who won, as the game now says (ASHVALE 0.8.73: window.__evictedBy {s, at, claim, ours, from})
        log('stopped by', self.r("return window.__evictedBy ? JSON.parse(JSON.stringify(window.__evictedBy)) : null"))
        bug('one device', 'the game stopped: "ASHVALE is open on another device" (%d time(s) this run) -- another game of @cinderwalker started somewhere' % self._evicted)
        # a fresh run is the newest game, and it puts back everything this page carries (eating, the death watch,
        # the chat answers) -- a reload here would lose those
        log('ending this run so a fresh one takes the game back'); self._stop_now = True
    def time_left(self):
        """False when the run is up - or when a new game release came out (chain/modules.json registry_version went up): the run
        ends cleanly and tools/bot_loop.sh starts it again on the new release, so other players keep seeing him (the operator
        2026-10-06: a run on an old release fell out of the players' rooms)"""
        if LiveGame.stopping or getattr(self, '_stop_now', False) or time.time() - self.t0 >= self.limit: return False
        # where he fell goes into the memory file the moment it happens: a restart reloads the page and loses the page's
        # note (2026-10-07: two deaths, gear and 271 GOLD left in the woods, both forgotten at the next restart)
        d = self.r("return window.__deadAt || null")
        if d and (self.mem.d.get('pile') or {}).get('at') != list(d):
            self.mem.pile(d); log('died at', d, '- noted, going back for its things')
            # what was around him: the log said "rat" for deaths a level-2 rat cannot cause (2026-10-07)
            log('around him when he died', self.r("return ASH.core.S.mobs.filter(m => !m.dead && Math.max(Math.abs(m.x - ASH.me.x), Math.abs(m.y - ASH.me.y)) <= 10)"
                                                  ".map(m => [m.key, (ASH.core.D.monsters[m.key] || {}).level, m.hp, m.tgt === 'me' ? 'ON ME' : '', m.x, m.y]).slice(0, 12)"))
            try: self.g.shot(os.path.join(HERE, 'chain', 'cinder_died.png'))
            except Exception: pass
        self.no_contacts()
        self.not_elsewhere()
        if getattr(self, '_stop_now', False): return False
        if time.time() - getattr(self, '_shotT', 0) > 120:   # what he sees, for whoever is watching the bot
            self._shotT = time.time()
            try: self.g.shot(os.path.join(HERE, 'chain', 'cinder_now.png'))
            except Exception: pass
        if time.time() - getattr(self, '_relT', 0) > 180:
            self._relT = time.time()
            try:
                v = json.load(open(os.path.join(HERE, 'chain', 'modules.json')))['registry_version']
                if not hasattr(self, '_rel0'): self._rel0 = v
                elif v > self._rel0: log('new release (registry v%d, the run started on v%d): ending this run so it restarts on it' % (v, self._rel0)); self.limit = 0; return False
            except Exception: pass
        return True
    def st(self): return self.r("return { at: [ASH.me.x, ASH.me.y], hp: ASH.me.hp, max: ASH.core.maxHp(ASH.me), cb: ASH.core.combatLevel(ASH.me), atk: ASH.core.lv(ASH.me, 'attack'), def: ASH.core.lv(ASH.me, 'defence'), gold: bag().coins || 0, bread: ASH.me.inv.filter(q => q && ASH.core.item(q.id).edible).reduce((a, q) => a + q.n, 0), raw: ASH.me.inv.filter(q => q && ASH.core.item(q.id).cooks).reduce((a, q) => a + q.n, 0), weapon: ASH.me.eq.weapon && ASH.me.eq.weapon.id, q: JSON.parse(JSON.stringify(ASH.me.quests || {})), dead: !!ASH.me.dead }") or {}
    def attune_here(self):
        """touch any town portal within reach it has not touched yet: touching attunes it, and an attuned portal can be
        travelled to from any other (2026-10-05: "he still hasn't learned that there are town portals")"""
        pid = self.r("const at = ASH.me.attuned || {}, d = n => Math.max(Math.abs(n.x - ASH.me.x), Math.abs(n.y - ASH.me.y)); "
                     "const q = ASH.core.M.npcs.find(n => n.portal && !at[n.portal] && d(n) <= 40); return q && q.id")
        if not pid or pid in getattr(self, 'tried', set()): return
        self.tried = getattr(self, 'tried', set()) | {pid}   # once a run: a portal that will not attune is a bug, not a loop
        xy = self.r("const n = ASH.core.M.npcs.find(q => q.id === %r); return [n.x, n.y]" % pid)
        self.r("return await walkTo(%d, %d, 60000)" % (xy[0], xy[1] + 2))   # right up to the stones first
        said = self.r("return await talk(%r)" % pid) or []
        now = self.r("return Object.assign({}, ASH.me.attuned || {})")
        log('touched the portal', pid, 'attuned now', now, said[-2:])
        if not (now or {}).get(pid[len('portal_'):]): bug('portal', 'talking to %s at %s did not attune it (stood at %s, attuned: %s, said %s)' % (pid, xy, self.st().get('at'), now, said[-3:]))
    def portal_hop(self, x, y):
        """if (x, y) is far and the portal nearest it is attuned, travel there instead of walking"""
        w = self.r("const P = ASH.core.M.npcs.filter(n => n.portal), at = ASH.me.attuned || {}, "
                   "d = (a, b, c, e) => Math.max(Math.abs(a - c), Math.abs(b - e)), "
                   "near = (qx, qy) => P.slice().sort((a, b) => d(a.x, a.y, qx, qy) - d(b.x, b.y, qx, qy))[0]; "
                   "const mine = near(ASH.me.x, ASH.me.y), there = near(%d, %d); if (!mine || !there) return null; "
                   "return { far: d(ASH.me.x, ASH.me.y, %d, %d), mine: mine.portal, there: there.portal, "
                   "there_d: d(there.x, there.y, %d, %d), mine_d: d(mine.x, mine.y, ASH.me.x, ASH.me.y), ok: !!at[there.portal] }"
                   % (x, y, x, y, x, y))
        if not w or w['there'] == w['mine'] or not w['ok']: return False
        if w['far'] < 150 or w['mine_d'] + w['there_d'] > w['far'] - 50: return False
        log('taking the portal to', w['there'], '(%d tiles away on foot)' % w['far'])
        return bool(self.r("return await travel(%r)" % w['there']))
    def walk(self, x, y, tries=8):
        t0, a0 = time.time(), self.st().get('at')
        self.attune_here(); t1 = time.time()
        hop = self.portal_hop(x, y); t2, a2 = time.time(), self.st().get('at')
        ok = False
        for i in range(tries):
            if self.r("return await walkTo(%d, %d, 60000)" % (x, y)): self.attune_here(); ok = True; break
            if i == 1 and self.through_passage(x, y): continue   # behind a gate or down a cave: go through it
        if time.time() - t0 > 120:   # where long trips go (2026-10-07: village -> Saltmere took 8-9 minutes, the other way 2)
            log('slow walk %s -> %s: %ds attuning, %ds portal (%s, landed at %s), %ds on foot, burden %s, energy %s, %s' % (
                a0, [x, y], t1 - t0, t2 - t1, hop, a2, time.time() - t2, self.r("return ASH.me.burden"), self.r("return ASH.me.energy"), 'arrived' if ok else 'did not arrive'))
        return ok
    def through_passage(self, x, y):
        """the spot is behind a gate (2026-10-07: the Red Pyre's compound -- Vorthan reads inside, the only way in is the
        gate Pike's latch opens) or down a cave mouth: walk to the passage nearest the spot whose far side is nearer it,
        and go through ("enter", like a player's tap on it)"""
        P = self.r("""const tx = %d, ty = %d, d = (a, b, c, e) => Math.max(Math.abs(a - c), Math.abs(b - e));
          const ps = (ASH.core.M.objects || []).filter(o => o.to && d(o.x, o.y, tx, ty) <= 20 && d(o.to[0], o.to[1], tx, ty) < d(ASH.me.x, ASH.me.y, tx, ty))
            .sort((a, b) => d(a.x, a.y, tx, ty) - d(b.x, b.y, tx, ty));
          const o = ps[0]; return o && { x: o.x, y: o.y, out: o.out || null, k: o.k, name: o.name || o.k, need: o.need || null,
            ok: !o.need || !!((ASH.me.flags || {})[o.need]) }""" % (x, y))
        if not P: return False
        if not P['ok']:
            bug('passage', '%s at (%d, %d) needs the flag %s, which he does not have, to reach (%d, %d)' % (P['name'], P['x'], P['y'], P['need'], x, y)); return False
        side = P.get('out') or [P['x'] - 1, P['y']]
        log('the way in is the %s at (%d, %d): going through' % (P['name'], P['x'], P['y']))
        self.portal_hop(side[0], side[1])   # from Saltmere it walked on foot and stopped at (319, 27) (2026-10-08)
        for _ in range(5):   # one minute was not enough to get there (2026-10-07: tried the gate from (49, 23))
            at = self.st().get('at') or [0, 0]
            if max(abs(at[0] - P['x']), abs(at[1] - P['y'])) <= 1: break
            self.r("return await walkTo(%d, %d, 60000)" % (side[0], side[1]))
        at = self.st().get('at') or [0, 0]
        if max(abs(at[0] - P['x']), abs(at[1] - P['y'])) > 1:
            log('could not get to the %s at (%d, %d): stopped at %s' % (P['name'], P['x'], P['y'], at)); return False
        self.r("ASH.core.cmd('me', { c: 'enter', x: %d, y: %d }); await wait(4000); return 1" % (P['x'], P['y']))
        log('after the %s: at %s, the game said %s' % (P['name'], self.st().get('at'), (self.r("return chat(3)") or [])[-3:]))
        return True
    def chest_take_all(self, keys):
        self.r("await talk('chest'); return 1")
        return self.r("const c = ASH.chest.state().chest, got = {}; for (const k of %s) if (c[k]) { ASH.chest.take(k, c[k]); got[k] = c[k]; } return got;" % json.dumps(list(keys)))
    def money(self, want=60):
        s = self.st()
        if s.get('gold', 0) >= want: return True
        got = self.chest_take_all([k for k in SELL if k not in self.quest_wants()]); log('from the chest', got)
        keep = getattr(self, 'keep_items', set()) | self.quest_wants()
        for k in SELL:
            if k in keep: continue                    # a quest is collecting it (gather_item)
            if self.r("return bag()[%r] || 0" % k): log('sell', k, self.r("return await sell('tam', %r, 1000)" % k))
        self.tidy()
        s = self.st(); log('gold now', s.get('gold'))
        return s.get('gold', 0) >= want
    def quest_wants(self):
        """what a quest he has started asks him to bring, at the step he is on or any later one: never for sale, from
        the bag or the chest (2026-10-07: after a restart he sold the 6 logs he had cut for the rudder)"""
        qs, out = self.st().get('q') or {}, set()
        for qid, q in qs.items():
            Q = QUESTS.get(qid)
            if not Q or q.get('step', 1) > len(Q['steps']): continue
            # the step he is on only: a later step's 12 copper ore hoarded from now on overloaded him (2026-10-07)
            for st in Q['steps'][q.get('step', 1) - 1:q.get('step', 1)]:
                g = st.get('goal') or {}
                for key in ('bring', 'with', 'cook'):
                    if g.get(key): out.add(g[key])
                for k in (st.get('kit') or {}): out.add(k)   # what the step hands you to use (2026-10-07: Vael's 3 saplings were sold)
        return out

    def cheapest_weapon(self):
        return min((self.r("return ASH.core.priceBuy('armoury', %r, ASH.me)" % k) or 9999) for k in ('dagger_t1', 'sword_t1'))
    # --- earning, by whatever it has learned pays best (2026-10-06: "There are better ways to gather
    #     resources than kill rats") ------------------------------------------------------------------------
    ROCKS = [(38, 43), (42, 44), (40, 45), (41, 47), (40, 42), (44, 43), (38, 46)]   # copper and tin, village east
    SHRIMP = [(37, 56), (40, 54), (44, 55), (38, 59)]                                # the village pond
    ACTIVITY_TOOL = {'mine': 'pickaxe', 'fish': 'net'}

    def has_tool(self, item):
        return bool(self.r("return !!(ASH.me.inv.some(q => q && q.id === %r) || Object.values(ASH.me.eq || {}).some(q => q && q.id === %r))" % (item, item)))

    def get_tool(self, item):
        """from the chest if it is there, else from Tam's store (a pickaxe is 20 GOLD, a net 5)"""
        if self.has_tool(item): return True
        self.chest_take_all([item])
        if self.has_tool(item): return True
        if not (self.r("return ASH.me.inv.filter(s => !s).length") or 0):
            self.tidy()                                   # a full bag buys nothing (2026-10-07: the hatchet)
        if self.r("return await buy('tam', %r, 1)" % item) and self.has_tool(item):
            log('bought a', item); return True
        log('could not buy a %s: %s GOLD, %s free bag slots, it costs %s' % (
            item, self.st().get('gold'), self.r("return ASH.me.inv.filter(s => !s).length"),
            self.r("return ASH.core.priceBuy('general', %r, ASH.me)" % item)))
        return False

    def gather_round(self, spots, seconds=150):
        """work the spots in turn for about `seconds`; a depleted rock regrows in seconds, so going round them keeps busy"""
        t0, got = time.time(), {}
        while time.time() - t0 < seconds and self.time_left():
            for x, y in spots:
                d = self.r("return await gatherAt(%d, %d, 20000)" % (x, y)) or {}
                for k, v in d.items(): got[k] = got.get(k, 0) + v
                if time.time() - t0 >= seconds: break
                free = self.r("return ASH.me.inv.filter(s => !s).length") or 0
                if free <= 1: return got                     # bag full: time to cook and sell
        return got

    # --- gathering what a quest asks to be brought (2026-10-07: "bring 12 shrimp" and "6 iron ore" both failed) ---------
    SKILL_TOOL = {'mining': 'pickaxe', 'woodcutting': 'hatchet'}

    def gather_item(self, item, need, seconds=360):
        """bring `need` of a resource: from the chest first, then from the nodes or fishing spots that give it near here,
        with the right tool, if his level allows; otherwise say which skill and level it wants (skill_gap)"""
        self.skill_gap = self.mem.d.setdefault('skill_gap', {})   # kept: train_gaps reads it after a restart
        self.chest_take_all([item])
        have = self.r("return bag()[%r] || 0" % item) or 0
        if have >= need: return have
        src = self.r("""const it = %r, C = ASH.core, R = C.D.rules, out = {spots: []};
          for (const k in (R.nodes || {})) { const n = R.nodes[k]; if (n.item === it) { out.skill = n.skill; out.req = n.req || 1; } }
          if (out.skill) { out.spots = []; out.tool = null; }
          else { const zs = C.zoneIndex ? C.zoneIndex() : (C.D.zones || []);
            for (const z of (C.D.zones || [])) for (const f of (z.fishing || [])) if (f.fish === it) {
              out.skill = 'fishing'; out.req = f.req || 1; out.tool = f.tool || 'net'; out.spots.push([f.x, f.y]); }
            const me = ASH.me; out.spots.sort((a, b) => Math.max(Math.abs(a[0]-me.x), Math.abs(a[1]-me.y)) - Math.max(Math.abs(b[0]-me.x), Math.abs(b[1]-me.y)));
            out.spots = out.spots.slice(0, 6); }
          out.level = out.skill ? C.lv(ASH.me, out.skill) : 0; return out;""" % item) or {}
        if not src.get('skill'): return have                       # not gathered anywhere: a shop or a bug
        if item == 'shrimp_raw':   # the village pond is where shrimp come (2026-10-07: 2 in 6 minutes at Saltmere's spots)
            src['spots'] = list(self.SHRIMP); self.walk(self.SHRIMP[0][0], self.SHRIMP[0][1] + 1, 4)
        if src['skill'] != 'fishing':
            src['spots'] = self.r(LIVE_SPOTS_JS % (item, 90)) or []
            known = node_spots(item)
            if not src['spots'] and known and src.get('level', 0) >= src.get('req', 1):
                at = self.st().get('at') or [0, 0]
                k = min(known, key=lambda q: max(abs(q[0] - at[0]), abs(q[1] - at[1])))
                log('no %s near here: going to the %s rocks/trees at %s' % (item, item, list(k)))
                self.walk(k[0], k[1] + 1, 6)
                src['spots'] = self.r(LIVE_SPOTS_JS % (item, 90)) or [list(q) for q in known]
        if src.get('level', 0) < src.get('req', 1):
            self.skill_gap[item] = (src['skill'], src['req']); self.mem.save(); return have
        if item in self.skill_gap: del self.skill_gap[item]; self.mem.save()
        tool = src.get('tool') or self.SKILL_TOOL.get(src['skill'])
        if tool and not self.get_tool(tool):
            # earn the tool's price, then buy it (2026-10-07: the rudder's logs waited on a 16-GOLD hatchet)
            price = self.r("return ASH.core.priceBuy('general', %r, ASH.me)" % tool) or 25
            log('no %s for %s: earning its %s GOLD first' % (tool, item, price))
            self.earn(price + 2, 0, rounds=4)
            if not self.get_tool(tool):
                log('cannot gather %s: still no %s' % (item, tool)); return have
        if not src.get('spots'):
            log('no %s to gather near here' % item); return have
        t0, empty, spots = time.time(), 0, src['spots']
        if src['skill'] == 'fishing': seconds = max(seconds, 600)   # the walk to the pond eats into it
        self._moved_for = {}
        self.keep_items = getattr(self, 'keep_items', set()) | {item}   # never sold while a quest wants it
        while have < need and time.time() - t0 < seconds and self.time_left():
            before = have
            if (self.r("return ASH.me.inv.filter(s => !s).length") or 0) <= 2:
                # a full bag catches nothing (2026-10-07: "free: 0" at the pond; at the trees a tidy freed one slot a time)
                if True:
                    # still full: it is food (a meal is a slot each). Gathering is not fighting: keep 6, the rest to the chest
                    extra = self.r("""const keep = new Set(%s), out = {}; let n = 0;
                      for (const q of ASH.me.inv) { if (!q || !(ASH.core.item(q.id) || {}).edible || keep.has(q.id)) continue;
                        n += q.n || 1; if (n > 6) out[q.id] = (out[q.id] || 0) + (q.n || 1); } return out""" % json.dumps(sorted(self.quest_wants() | {item}))) or {}
                    for k, n in extra.items():
                        self.r("await talk('chest'); ASH.chest.store(%r, %d); return 1" % (k, n)); log('room to gather: put %d %s in the chest' % (n, k))
                    self.tidy()
            for x, y in spots:
                self.r("return await gatherAt(%d, %d, 30000)" % (x, y))
                have = self.r("return bag()[%r] || 0" % item) or 0
                if have >= need: break
            # a felled tree is gone for good: look again from where he stands now (2026-10-07: one log, then nothing)
            if src['skill'] != 'fishing':
                spots = self.r(LIVE_SPOTS_JS % (item, 90)) or []
            if have == before:   # say why, in the game's own words
                log('nothing from %s: the game said %s; %s' % (item, (self.r("return chat(4)") or [])[-2:], self.r(
                    "const n = ASH.core.nodeAt ? ASH.core.nodeAt(ASH.core.idx(%d, %d)) : null; return { at: [ASH.me.x, ASH.me.y], "
                    "act: ASH.me.act && ASH.me.act.k, skilling: !!ASH.me.skilling, free: ASH.me.inv.filter(q => !q).length, "
                    "node: n && { item: n.item, kind: n.kind, req: n.req, tool: n.tool, dep: (ASH.core.S.dep[ASH.core.idx(%d, %d)] || 0) - ASH.core.S.t }, menu: !!document.querySelector('.ash .menu, .ash .options') }" % (x, y, x, y))))
            empty = empty + 1 if have == before else 0
            if src['skill'] == 'fishing' and spots:
                # fishing spots stay where they are and only rest a while: keep going round them, do not wander off
                # (2026-10-07: 7 of 12 shrimp, then a walk 60 tiles away from the pond)
                if empty >= 3: self.r("await wait(8000); return 1"); empty = 0
                continue
            if empty >= 3 or not spots:
                # this patch is used up (2026-10-07: 6 of 8 logs, then only stumps): try fresh ground, twice at most
                moved = getattr(self, '_moved_for', {}).get(item, 0)
                if moved >= 2: break
                self._moved_for = dict(getattr(self, '_moved_for', {}), **{item: moved + 1})
                at = self.st().get('at') or [0, 0]
                dx, dy = [(60, 0), (-60, 0), (0, 60), (0, -60)][(moved + int(time.time())) % 4]
                log('no %s left near %s: looking 60 tiles away' % (item, at))
                self.walk(at[0] + dx, at[1] + dy, 4)
                spots = self.r(LIVE_SPOTS_JS % (item, 90)) or [] if src['skill'] != 'fishing' else spots
                empty = 0
                if not spots: break
        log('gathered %s: %d of %d' % (item, have, need))
        return have

    def train_gaps(self, seconds=600):
        """every quest left waits on a skill level (2026-10-07: salmon at fishing 30, oak at woodcutting 15, iron at mining
        15): gather what that skill can already take, the nearest gap first; with no skill gap, train combat on rats"""
        gaps = sorted({(lvl - (self.r("return ASH.core.lv(ASH.me, %r)" % sk) or 1), sk) for sk, lvl in self.mem.d.get('skill_gap', {}).values()})
        gaps = [(d, sk) for d, sk in gaps if d > 0]
        # every other round goes to combat while any quest waits on a fight: defence and hitpoints are what make the
        # bandits and timber wolves need less food (2026-10-07: defence 13, 25 hp at combat 27, only skills trained)
        self._train_n = getattr(self, '_train_n', 0) + 1
        fights_wait = bool(self.mem.d.get('fight_need'))
        if not gaps or (fights_wait and self._train_n % 2 == 0):
            dfn = self.r("return ASH.core.lv(ASH.me, 'defence')") or 1
            foe = 'wolf' if (self.st().get('cb') or 1) >= 15 else 'rat'   # rats give next to nothing at combat 27
            log('every quest left waits on a fight or a skill: training defence (%d) on %s' % (dfn, foe))
            self.r("ASH.core.cmd('me', { c: 'style', i: 2 }); return 1")
            self.fight(foe, 8); self.cook(); self.money(10 ** 6)
            self.r("ASH.core.cmd('me', { c: 'style', i: 0 }); return 1")
            log('trained defence: %d -> %s, hitpoints %s' % (dfn, self.r("return ASH.core.lv(ASH.me, 'defence')"), self.r("return ASH.core.lv(ASH.me, 'hitpoints')")))
            return
        sk = gaps[0][1]
        item = 'shrimp_raw' if sk == 'fishing' else self.r("""const R = ASH.core.D.rules.nodes || {}, L = ASH.core.lv(ASH.me, %r); let best = null, br = -1;
            for (const k in R) { const n = R[k]; if (n.skill === %r && (n.req || 1) <= L && (n.req || 1) > br) { best = n.item; br = n.req || 1; } } return best""" % (sk, sk))
        if not item: log('nothing to train %s on' % sk); return
        lv0 = self.r("return ASH.core.lv(ASH.me, %r)" % sk)
        log('every quest left waits on a skill: training %s (%s) on %s for %d s' % (sk, lv0, item, seconds))
        had = item in getattr(self, 'keep_items', set())
        self.gather_item(item, 10 ** 4, seconds)
        if not had: getattr(self, 'keep_items', set()).discard(item)   # practice, not a quest's: it sells
        self.cook(); self.money(10 ** 6)
        log('trained %s: %s -> %s' % (sk, lv0, self.r("return ASH.core.lv(ASH.me, %r)" % sk)))

    def earn_by(self, how):
        """one round of earning by `how`: rats, mine or fish. Then cook and sell what it brought."""
        if how in self.ACTIVITY_TOOL and not self.get_tool(self.ACTIVITY_TOOL[how]):
            log('cannot %s: no %s and not the GOLD for one' % (how, self.ACTIVITY_TOOL[how])); return False
        if how == 'rats': self.fight('rat', 5); self.scavenge(12, settle=500)
        elif how == 'mine': log('mining', self.gather_round(self.ROCKS))
        elif how == 'fish': log('fishing', self.gather_round(self.SHRIMP))
        self.cook(); self.money(10 ** 6)
        return True

    def pick_earning(self):
        """what has paid best, measured; anything not tried yet is tried first, and every fourth round the
        runner-up gets another go, so a slow start does not decide it for ever"""
        rates = self.mem.d.setdefault('earning', {})
        gold = self.st().get('gold', 0)
        price = {'pickaxe': 20, 'net': 5}
        # what it can do now: rats always; mining and fishing once it holds the tool or the GOLD for it
        able = ['rats'] + [h for h, t in self.ACTIVITY_TOOL.items()
                           if self.has_tool(t) or self.r("return Object.keys(ASH.chest.state().chest).includes(%r)" % t)
                           or gold >= price[t] + 2]
        # a quest waits on a skill (gather_item's skill_gap): earn by the activity that trains it
        for sk, _ in getattr(self, 'skill_gap', {}).values():
            how = {'mining': 'mine', 'fishing': 'fish'}.get(sk)
            if how in able: return how
        for how in ('mine', 'fish', 'rats'):
            if how in able and how not in rates: return how
        ranked = sorted((h for h in able if h in rates), key=lambda h: -rates[h]['rate']) or ['rats']
        self._earn_n = getattr(self, '_earn_n', 0) + 1
        return ranked[1] if self._earn_n % 4 == 0 and len(ranked) > 1 else ranked[0]

    def learn_earning(self, how, gold0, food0, t0):
        s = self.st()
        # GOLD counts; a meal counts only while he is short of food -- with a bag of it, more food earns nothing
        worth = (s.get('gold', 0) - gold0) + (3 * max(0, s.get('bread', 0) - food0) if food0 < self.FOOD_CAP else 0)
        rate = max(0.0, worth * 60 / max(30.0, time.time() - t0))   # buying a tool is not a loss of earning
        e = self.mem.d.setdefault('earning', {}).setdefault(how, {'rate': rate, 'rounds': 0})
        e['rate'] = rate if e['rounds'] == 0 else 0.6 * e['rate'] + 0.4 * rate
        e['rounds'] += 1
        self.mem.save()
        log('earning by %s: %.1f GOLD a minute this round (%.1f on average)' % (how, rate, e['rate']))

    def earn(self, gold, food=3, rounds=12):
        """the way a new player starts (2026-10-05): kill rats, cook their meat at the range for food, sell their
        pelts for GOLD, and go round again until it has `gold` and `food`. Rats are weak enough to fight bare-handed."""
        self.unpack()   # food, gold and gear already in the chest count first (2026-10-06: 14 meals sat there while he earned food)
        food = min(food, self.BAG_FOOD_MAX)   # 2026-10-06: a goal of 57 meals fought the surplus seller for ever
        self.food_goal = food
        for i in range(rounds):
            if not self.time_left(): return False
            s = self.st()
            if s.get('gold', 0) >= gold and s.get('bread', 0) >= food: return True
            how = self.pick_earning()
            log('earning: round', i + 1, 'by', how, 'gold %s/%s food %s/%s' % (s.get('gold'), gold, s.get('bread'), food))
            t0 = time.time()
            if not self.earn_by(how):
                continue                      # no tool after all: pick_earning sees that next round
            self.learn_earning(how, s.get('gold', 0), s.get('bread', 0), t0)
        s = self.st(); return s.get('gold', 0) >= gold and s.get('bread', 0) >= food
    def unpack(self):
        """what it owns is in the chest after a restart (gold, food, gear): take it back out and wear the gear"""
        log('levels at start', self.r("const o = {}; for (const k in ASH.me.xp) o[k] = ASH.core.lv(ASH.me, k); o.combat = ASH.core.combatLevel(ASH.me); o.at = [ASH.me.x, ASH.me.y]; return o"))
        # the @ashvale Bank hands a restarted game its things a few minutes late ("Gear takes a few minutes"): wait for
        # what is still arriving before deciding anything is missing (2026-10-07: sword, armour, 183 coins and the
        # rudder's logs were all on their way; he bought a dagger and sold the rest of his gold away)
        # only once a run: later on, "arriving" is also what it just bought settling on chain (2026-10-07: two 3-minute
        # waits for 5 bread it already carried)
        for _ in range(0 if getattr(self, 'unpacked', False) else 18):
            arriving = self.r("return (ASH.chest.state() || {}).arriving || 0") or 0
            if not arriving: break
            if _ == 0: log('the Bank is still bringing %d things to the chest: waiting for them' % arriving)
            self.r("await wait(10000); return 1")
        # food: up to 10 meals in the bag, best first -- not the whole larder (2026-10-07: 21 meals out of the chest at every
        # restart, then no room for a bow, a loaf or a log)
        got = self.r("await talk('chest'); const C = ASH.chest.state().chest, got = {}, want = %s; "
                     "let room = Math.max(0, 10 - ASH.me.inv.filter(q => q && (ASH.core.item(q.id) || {}).edible).reduce((a, q) => a + (q.n || 1), 0)); "
                     "const keys = Object.keys(C).sort((a, b) => ((ASH.core.item(b) || {}).heal || 0) - ((ASH.core.item(a) || {}).heal || 0)); "
                     "for (const k of keys) { const d = ASH.core.item(k) || {}; if (!(C[k] > 0)) continue; let n = C[k]; "
                     "if (d.edible && !want.includes(k)) { n = Math.min(n, room); room -= n; if (n <= 0) continue; } "
                     "else if (!(k === 'coins' || d.eq || d.tool || want.includes(k))) continue; "
                     "ASH.chest.take(k, n); got[k] = n; await wait(300); } return got" % json.dumps(sorted(self.quest_wants()))) or {}
        self.unpacked = True
        if got: log('took from the chest', got); self.upgrade()
        self.lighten()   # 2026-10-07: 12 copper ore (24 kg) carried round for an hour, every trip at half speed
        # a bow left in his hands from a hunt: back to the best melee weapon in the bag, and the shield
        sw = self.r("""if (!(ASH.me.eq.weapon && /^bow/.test(ASH.me.eq.weapon.id))) return null;
          const w = ASH.me.inv.filter(q => q && (ASH.core.item(q.id) || {}).eq === 'weapon' && !/^bow/.test(q.id)).sort((a, b) => (ASH.core.item(b.id).value || 0) - (ASH.core.item(a.id).value || 0))[0];
          return w && w.id""")
        if sw: log('back to the', sw, self.r("return await equip(%r)" % sw)); self.wear()
    def prepare(self):
        """before quests: a weapon on, and food in the bag -- earned from rats when it has nothing"""
        self.unpack(); s = self.st()
        if s.get('weapon') and s.get('bread', 0) >= FIGHT_FOOD: return True
        want = self.cheapest_weapon() if not s.get('weapon') else 0   # the shortfall only: quests first
        log('preparing: weapon %s, food %s, gold %s -> earning %s GOLD and %d food' % (s.get('weapon'), s.get('bread'), s.get('gold'), want, FIGHT_FOOD + 1))
        self.earn(want, FIGHT_FOOD + 1, rounds=5); self.gear(); self.cook()   # a few rounds, not until rich: quests first
        s = self.st(); log('prepared: weapon %s, food %s, gold %s' % (s.get('weapon'), s.get('bread'), s.get('gold')))
        return bool(s.get('weapon'))
    def cook(self):
        """take raw food from the chest, cook it all on the range by the well; returns cooked food carried"""
        # what a quest asks for raw stays raw, in the chest (2026-10-07: 8 raw shrimp cooked, then "bring 12 shrimp_raw")
        wanted = self.quest_wants()
        raws = [k for k in (self.r("return Object.keys(ASH.chest.state().chest).filter(k => ASH.core.item(k).cooks)") or []) if k not in wanted]
        if raws: log('raw from the chest', self.chest_take_all(raws))
        for k in wanted:
            n = self.r("return ASH.core.item(%r).cooks ? (bag()[%r] || 0) : 0" % (k, k)) or 0
            if n: self.r("await talk('chest'); ASH.chest.store(%r, %d); return 1" % (k, n)); log('kept %d %s raw for a quest, in the chest' % (n, k))
        n = self.st().get('raw', 0)
        if not n: return self.st().get('bread', 0)
        self.walk(RANGE[0], RANGE[1] + 1, 4)
        for _ in range(3):
            if not self.st().get('raw'): break
            log('cooked', self.r("return await gatherAt(%d, %d, %d)" % (RANGE[0], RANGE[1], 6000 + 4000 * n)))
        self.food_surplus()
        f = self.st().get('bread', 0); log('food now', f); return f
    def gear(self):
        self.money(40); s = self.st()
        price = lambda shop, k: self.r("return ASH.core.priceBuy(%r, %r, ASH.me)" % (shop, k)) or 9999
        if not s.get('weapon'):
            for sw in ('sword_t2', 'sword_t1', 'dagger_t1'):
                if price('armoury', sw) <= s.get('gold', 0) and self.r("return await buy('garrick', %r, 1)" % sw): log('bought', sw, self.r("return await equip(%r)" % sw)); break
            else: log('no weapon yet: the cheapest costs %s, it has %s GOLD' % (price('armoury', 'dagger_t1'), s.get('gold')))
        s = self.st(); pb = price('general', 'bread'); n = min(5, int(s.get('gold', 0) // max(1, pb)))
        if (s.get('bread') or 0) < 3 and n > 0: self.make_room(n, food_kept=10)
        if (s.get('bread') or 0) < 3 and n > 0: log('bread x%d' % n, self.r("return await buy('tam', 'bread', %d)" % n))
        # armour (2026-10-05: "he doesn't have a weapon, he doesn't have any armor"): the cheapest pieces it can afford,
        # keeping 15 GOLD back for bread
        for piece, slot in (('helmet_t1', 'head'), ('body_t1', 'body'), ('legs_t1', 'legs'), ('shield_t1', 'shield')):
            s = self.st(); worn = self.r("return !!(ASH.me.eq[%r])" % slot)
            if worn or price('armoury', piece) > s.get('gold', 0) - 15: continue
            if self.r("return await buy('garrick', %r, 1)" % piece): log('bought', piece, self.r("return await equip(%r)" % piece))
        self.wear()
    def ground_near(self, r):   # what is left that it has not already found it cannot take
        return self.r("const bad = window.__untakeable || new Set(); return ASH.core.S.ground.filter(g => !bad.has(g.uid) && "
                      "Math.max(Math.abs(g.x - ASH.me.x), Math.abs(g.y - ASH.me.y)) <= %d).length" % r) or 0
    def scavenge(self, r=8, settle=1500):
        """pick up whatever lies within r tiles (2026-10-05: "if he sees anything laying around he should pick it up
        and use it or sell it"; 2026-10-06: "Make sure Cinder Walker doesn't leave loot lying around"), then put on
        anything better than what it wears. A monster's drop lands two ticks after it dies, so it waits for that first,
        then sweeps until nothing is left; a full bag is emptied at the shop and chest and it comes back for the rest."""
        self.r("await wait(%d); return 1" % settle)
        got, here = [], self.st().get('at')
        for _ in range(4):
            more = self.r(TAKE_JS % r) or []
            got += more
            if not self.ground_near(r): break
            if not more:
                free = self.r("return ASH.me.inv.filter(s => !s).length") or 0
                if free == 0 and self.bury_bones(): continue   # room made where he stands
                if free == 0 and here:
                    log('bag full with loot still on the ground: emptying it and coming back')
                    self.tidy(); self.walk(here[0], here[1], 4)
                else:
                    break   # what is left cannot be taken (somebody else's, or gone)
        if got: log('picked up', got); self.upgrade()
        return got
    def cook_goal(self, cooked, n):
        """cook `n` of `cooked` from scratch: the raw item that cooks into it, from the chest, else killed for"""
        raw = next((k for k, d in ITEMS.items() if isinstance(d, dict) and any(a.get('trait_type') == 'Cooks into' and a.get('value') == cooked
                                                                                  for a in d.get('attributes', []))), None)
        if not raw: return False
        mon = next((k for k, m in MONS.items() if any(d.get('item') == raw for d in m.get('drops', []))), None)
        for _ in range(4 * max(1, n)):
            q0 = json.dumps(self.st().get('q'))
            self.chest_take_all([raw])
            if not self.r("return bag()[%r] || 0" % raw):
                if not mon: return False
                log('killing a %s for %s' % (mon, raw)); self.fight(mon, max(1, n)); self.scavenge(6)
            if not self.r("return bag()[%r] || 0" % raw): continue
            self.walk(RANGE[0], RANGE[1] + 1, 4)
            log('cooked for the quest', self.r("return await gatherAt(%d, %d, 20000)" % (RANGE[0], RANGE[1])))
            if self.r("return bag()[%r] || 0" % cooked) >= n or json.dumps(self.st().get('q')) != q0: return True
        return True
    def plant_goal(self, S, n):
        """plant n saplings on grass near S['near'] = [x, y, r]: outside ten tiles of Vael, off paths, not in a town
        (core.js plantWhy). The game counts each one on the quest."""
        self.chest_take_all(['sapling'])
        if not self.r("return bag().sapling || 0"): return False
        near = S.get('near') or (self.st().get('at') or [0, 0])
        cx, cy, r = near[0], near[1], (near[2] if len(near) > 2 else 16)
        self.walk(cx + 13, cy, 6)
        tried = []
        for _ in range(n + 6):
            if not self.r("return bag().sapling || 0"): break
            spot = self.r("""const cx = %d, cy = %d, r = %d, bad = new Set(%s), C = ASH.core, M = C.M, d = (a, b) => Math.max(Math.abs(a - cx), Math.abs(b - cy)), out = [];
              for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
                if (d(x, y) <= 11 || d(x, y) > r || bad.has(x + ',' + y)) continue;
                if (M.tileAt(x, y) !== '.' || (M.blocked && M.blocked(x, y)) || C.nodeAt(C.idx(x, y)) || (C.S.plants || {})[C.idx(x, y)]) continue;
                out.push([x, y, Math.max(Math.abs(x - ASH.me.x), Math.abs(y - ASH.me.y))]); }
              out.sort((a, b) => a[2] - b[2]); return out[0] || null""" % (cx, cy, r, json.dumps(tried)))
            if not spot: return False
            tried.append('%d,%d' % (spot[0], spot[1]))
            before = self.r("return bag().sapling || 0")
            self.r("ASH.core.cmd('me', { c: 'plant', x: %d, y: %d }); await wait(5000); return 1" % (spot[0], spot[1]))
            after = self.r("return bag().sapling || 0")
            log('plant a sapling at', spot[:2], '->', 'planted' if after < before else 'not taken', (self.r("return chat(2)") or [])[-1:])
        return True
    def bury_bones(self):
        """bury every bone in the bag, right here: prayer xp and the slots back, instead of a walk to the chest for each
        (2026-10-07: four 2-minute trips to stash one bone each on a hare hunt)"""
        n = self.r("let n = 0; for (let k = 0; k < 28; k++) { const i = ASH.me.inv.findIndex(q => q && (ASH.core.item(q.id) || {}).buryXp); "
                   "if (i < 0) break; const q = ASH.me.inv[i], had = q.n; ASH.core.cmd('me', { c: 'use', slot: i }); await wait(1400); "
                   "if (ASH.me.inv[i] === q && q.n === had) break; n++; } return n") or 0   # stops if the game will not take one
        if n: log('buried %d bones' % n)
        return n
    def upgrade(self):
        """wear every piece in the bag that is worth more than what is in its slot (empty slots first)"""
        got = self.r("""const out = []; for (let pass = 0; pass < 8; pass++) { let did = false;
          for (let i = 0; i < ASH.me.inv.length; i++) { const q = ASH.me.inv[i]; if (!q || /^bow/.test(q.id)) continue; const d = ASH.core.item(q.id), slot = d && d.eq; if (!slot) continue;   // the bow is for runners only (ranged_kit): it and the shield swapped back and forth
            const on = ASH.me.eq[slot], ond = on && ASH.core.item(on.id);
            if (!on || (d.value || 0) > ((ond && ond.value) || 0)) { ASH.core.cmd('me', { c: 'equip', slot: i }); out.push(q.id); await wait(800); did = true; break; } }
          if (!did) break; } return out;""")
        if got: log('wore', got)
    FOOD_CAP = 15   # meals carried; a bag full of food picks nothing up (2026-10-06: 27 meals, 0 GOLD, nothing gathered)
    BAG_FOOD_MAX = 22   # never more than this, whatever a fight asks for: the rest of the bag is for loot

    def food_surplus(self):
        """meals beyond FOOD_CAP: sold to Tam when he is short of GOLD (a meal fetches a few), else put in the chest"""
        extra = self.r("""const cap = %d, food = [];
          for (const q of ASH.me.inv) if (q && (ASH.core.item(q.id) || {}).edible) food.push([q.id, q.n || 1, ASH.core.item(q.id).heal || 0]);
          let have = food.reduce((a, f) => a + f[1], 0), out = {};
          food.sort((a, b) => a[2] - b[2]);                       // the weakest meals go first
          for (const [id, n] of food) { if (have <= cap) break; const m = Math.min(n, have - cap); out[id] = (out[id] || 0) + m; have -= m; }
          return out;""" % max(self.FOOD_CAP, min(getattr(self, 'food_goal', 0) or 0, self.BAG_FOOD_MAX))) or {}
        wanted = self.quest_wants() - {'bread'}
        extra = {k: n for k, n in extra.items() if k not in wanted}   # a quest's cooked chicken is not spare food
        if not extra: return
        short = (self.st().get('gold') or 0) < 40
        for k, n in extra.items():
            if short and self.r("return await sell('tam', %r, %d)" % (k, n)):
                log('sold %d spare %s for GOLD' % (n, k)); continue
            self.r("await talk('chest'); ASH.chest.store(%r, %d); return 1" % (k, n)); log('stored %d spare %s in the chest' % (n, k))

    def make_room(self, slots=3, food_kept=6):
        """at least `slots` free bag slots: meals beyond `food_kept` (a slot each) to the chest, then a tidy
        (2026-10-07: Iria's loaf could not be bought for an hour -- 14 shrimp filled the bag)"""
        if (self.r("return ASH.me.inv.filter(s => !s).length") or 0) >= slots: return
        extra = self.r("""const keep = new Set(%s), out = {}; let n = 0;
          for (const q of ASH.me.inv) { if (!q || !(ASH.core.item(q.id) || {}).edible || keep.has(q.id)) continue;
            n += q.n || 1; if (n > %d) out[q.id] = (out[q.id] || 0) + (q.n || 1); } return out""" % (json.dumps(sorted(self.quest_wants())), food_kept)) or {}
        for k, n in extra.items():
            self.r("await talk('chest'); ASH.chest.store(%r, %d); return 1" % (k, n)); log('making room: put %d %s in the chest' % (n, k))
        self.tidy()
    def tidy(self):
        """the bag after a trip: wear the best, sell the loot tam buys, and put the rest in the chest -- keeping food, raw
        food to cook, tools and anything a quest wants"""
        self.upgrade()
        self.food_surplus()
        keep = json.dumps(sorted(self.quest_wants()))   # not every quest's wish list (WANTED): ore piled up to overloaded
        loose = self.r("const keep = new Set(%s), seen = new Set(), out = {}; for (const q of ASH.me.inv) { if (!q) continue; const d = ASH.core.item(q.id) || {}; "
                       "if (d.tool && !seen.has(q.id)) { seen.add(q.id); continue; } if (/^(arrows_|bow)/.test(q.id)) continue; "   # one of each tool: spare nets took 2 slots (2026-10-07)
                       "if (keep.has(q.id) || d.edible || d.cooks || d.skill || q.id === 'coins') continue; out[q.id] = (out[q.id] || 0) + (q.n || 1); } return out" % keep) or {}
        for k, n in loose.items():
            if self.r("return await sell('tam', %r, %d)" % (k, n)) and not self.r("return bag()[%r] || 0" % k): log('sold', n, k); continue
            self.r("await talk('chest'); ASH.chest.store(%r, %d); return 1" % (k, n)); log('stashed in the chest', n, k)
        self.lighten()
    def lighten(self):
        """over his carrying weight he walks at half speed and cannot run at all (core.js burden): the heaviest things he
        does not need on him go to the chest until he is under it (2026-10-07: "You are carrying too much to run")"""
        wanted = json.dumps(sorted(self.quest_wants()))
        for _ in range(6):
            if not (self.r("return ASH.me.burden || 0") or 0): return
            k = self.r("""const keep = new Set(%s), seen = new Set(); let best = null, bw = 0;
              for (const q of ASH.me.inv) { if (!q) continue; const d = ASH.core.item(q.id) || {};
                if (q.id === 'coins' || keep.has(q.id) || d.edible) continue;
                if (d.tool && !seen.has(q.id)) { seen.add(q.id); continue; }
                const w = (d.weight || 0) * (q.n || 1); if (w > bw) { bw = w; best = [q.id, q.n || 1]; } }
              return best""" % wanted)
            if not k: log('overburdened, and nothing left to put away'); return
            at = self.st().get('at') or [0, 0]
            if max(abs(at[0] - 24), abs(at[1] - 53)) <= 60:   # the only chest is by Ashvale's well
                self.r("await talk('chest'); ASH.chest.store(%r, %d); return 1" % (k[0], k[1])); log('too heavy to run: put %d %s in the chest' % (k[1], k[0])); continue
            # far from it (Saltmere is 440 tiles away): sell it at the nearest general store, else leave it on the ground
            keeper = min(('tam', 'bela'), key=lambda n: (lambda q: max(abs(q[0] - at[0]), abs(q[1] - at[1])) if q else 1e9)(self.npc(n)))
            if self.r("return await sell(%r, %r, %d)" % (keeper, k[0], k[1])) and not self.r("return bag()[%r] || 0" % k[0]):
                log('too heavy to run: sold %d %s to %s' % (k[1], k[0], keeper)); continue
            self.r("""const i = ASH.me.inv.findIndex(q => q && q.id === %r); if (i < 0) return 0; ASH.core.cmd('me', { c: 'drop', slot: i }); await wait(800);
                      window.__untakeable = window.__untakeable || new Set();
                      for (const g of ASH.core.S.ground) if (g.id === %r && g.x === ASH.me.x && g.y === ASH.me.y) window.__untakeable.add(g.uid); return 1""" % (k[0], k[0]))
            log('too heavy to run, far from the chest and no one buys it: left %d %s on the ground' % (k[1], k[0]))
    def best_armour(self):
        """each armour slot: the best piece the armoury sells that his levels allow, if it beats what he wears and he can
        afford it with 15 GOLD to spare"""
        gold = self.st().get('gold') or 0
        if getattr(self, '_armour_tried_at', None) == gold: return   # same GOLD as the trip that bought nothing
        got = self.r("""const out = [], sh = ASH.core.D.shops, stock = ((sh.shops || sh).armoury || {}).stock || [];
          const can = d => Object.entries(d.req || {}).every(([k, v]) => ASH.core.lv(ASH.me, k) >= v);
          for (const slot of ['head', 'body', 'legs', 'shield', 'pack']) {   // a pack carries more (2026-10-07: his was gone, always overloaded)
            const on = ASH.me.eq[slot], onv = on ? (ASH.core.item(on.id).value || 0) : 0;
            const fits = stock.map(k => [k, ASH.core.item(k)]).filter(([k, d]) => d && d.eq === slot && can(d) && (d.value || 0) > onv)
              .map(([k, d]) => [k, d, ASH.core.priceBuy('armoury', k, ASH.me)]);
            const room = (bag().coins || 0) - 15;
            // the best he can AFFORD now (2026-10-06: he wore nothing while saving for tier 2); else the cheapest, to say so
            const buyable = fits.filter(f => f[2] <= room).sort((a, b) => (b[1].value || 0) - (a[1].value || 0))[0];
            const cheapest = fits.sort((a, b) => a[2] - b[2])[0];
            const pick = buyable || cheapest;
            if (pick) out.push([slot, pick[0], pick[2]]); }
          return out;""") or []
        bought = False
        for slot, k, price in got:
            if price > (self.st().get('gold') or 0) - 15: log('armour: %s wants %s (%s GOLD), cannot afford it yet' % (slot, k, price)); continue
            bought = True
            old = self.r("const o = ASH.me.eq[%r]; return o && o.id" % slot)
            if self.r("return await buy('garrick', %r, 1)" % k):
                log('bought', k, self.r("return await equip(%r)" % k))
                # what it replaced goes straight back to the smith, not into the bag (2026-10-07: three old pieces
                # filled the bag on a hare hunt)
                if old and old != k and self.r("return (bag()[%r] || 0) > 0 && !Object.values(ASH.me.eq).some(q => q && q.id === %r)" % (old, old)):
                    log('sold the old', old, self.r("return await sell('garrick', %r, 1)" % old))
        self._armour_tried_at = None if bought else gold
    def wear(self):
        """put on every wearable thing in the bag for an empty slot (after a death the pile comes back into the bag)"""
        got = self.r("""const out = []; for (let i = 0; i < ASH.me.inv.length; i++) { const q = ASH.me.inv[i]; if (!q || /^bow/.test(q.id) || (ASH.me.eq.weapon && /^bow/.test(ASH.me.eq.weapon.id))) continue; const d = ASH.core.item(q.id); const slot = d && d.eq; if (slot && !ASH.me.eq[slot]) { ASH.core.cmd('me', { c: 'equip', slot: i }); out.push(q.id); await wait(700); } } return out;""")
        if got: log('wore', got)
    def ready(self, key):
        """before a fight with anything that hits back hard: a weapon, food, health - else False (train on something easier)"""
        lvl = MONS.get(key, {}).get('level', 1)
        if lvl < 5: return True
        self.equip_up()
        s = self.st()
        if not s.get('weapon') or s.get('bread', 0) < FIGHT_FOOD: self.cook(); self.gear(); s = self.st()
        if not s.get('weapon') or s.get('bread', 0) < FIGHT_FOOD:
            log('not ready for', key, '(weapon %s, food %s): earning on rats first' % (s.get('weapon'), s.get('bread')))
            self.prepare(); s = self.st()
        if s.get('cb', 0) < lvl - 3 and getattr(self, 'trained_for', {}).get(key, 0) < 3:   # far weaker than it: rats first, a few rounds
            self.trained_for = getattr(self, 'trained_for', {}); self.trained_for[key] = self.trained_for.get(key, 0) + 1
            log('combat %s vs %s level %s: training on rats first' % (s.get('cb'), key, lvl)); self.fight('rat', 8); self.cook(); s = self.st()
        m = self.mem.m(key)
        for _ in range(4):   # what experience says this monster needs; a few rounds on rats at a time, then try again
            s = self.st()
            if s.get('def', 1) >= m['need_def'] and s.get('cb', 1) >= m['need_cb']: break
            log('learned that %s needs defence %d and combat %d (now %d and %d): training on rats' % (key, m['need_def'], m['need_cb'], s.get('def', 1), s.get('cb', 1)))
            self.r("ASH.core.cmd('me', { c: 'style', i: %d }); return 1" % (2 if s.get('def', 1) < m['need_def'] else 1))
            self.fight('rat', 10); self.cook(); self.money(10 ** 6); self.best_armour()
        self.r("ASH.core.cmd('me', { c: 'style', i: 0 }); return 1")
        if s.get('bread', 0) < m['need_food']:
            log('learned to carry %d food for %s; has %d' % (m['need_food'], key, s.get('bread', 0)))
            self.earn(0, m['need_food']); s = self.st()
        if s.get('hp', 1) < s.get('max', 1) * 0.6 and s.get('bread', 0) == 0: self.rest()
        if not s.get('weapon') or s.get('bread', 0) < FIGHT_FOOD: log('still not ready for', key, '(weapon %s, food %s)' % (s.get('weapon'), s.get('bread'))); return False
        s = self.st()
        if s.get('def', 1) < m['need_def'] - 1 or s.get('cb', 1) < m['need_cb'] - 1:   # training fell well short: not today
            log('not strong enough for %s yet (defence %d of %d, combat %d of %d): other things first' % (key, s.get('def', 1), m['need_def'], s.get('cb', 1), m['need_cb'])); return False
        return True
    def food_need(self, key):
        """the damage a fight with key is expected to cost, from what fights with it have actually cost (worst case,
        plus a quarter), and failing that from the monster's level"""
        m = self.mem.m(key)
        if m.get('dmg_n'): return max(m['dmg_max'], m['dmg_avg'] * 1.25)
        return MONS.get(key, {}).get('level', 1) * 3
    def food_ok(self, key, adds=0):
        """enough food to stay healed for the whole fight (and the fights with the monsters around it)"""
        f = self.r(FOOD_JS) or {}
        need = self.food_need(key) * (1 + 0.6 * adds)
        spare = f.get('tot', 0) + max(0, f.get('hp', 0) - f.get('max', 1) * 0.34)
        return spare >= need, f, need
    def best_food(self):
        """the food that heals most per GOLD among the shops whose keeper is in the world (2026-10-06: "there might be
        better food than rat meat"): [keeper, item, heal, price] or None. Read from the data, not a fixed list."""
        return self.r("""const sh = ASH.core.D.shops, S = sh.shops || sh, mx = ASH.core.maxHp(ASH.me); let best = null;
          for (const k in S) { const keeper = S[k].keeper; if (!keeper || !ASH.core.M.npcs.some(n => n.id === keeper)) continue;
            for (const it of S[k].stock || []) { const d = ASH.core.item(it); if (!d || !d.edible) continue;
              const heal = d.healPct ? Math.floor(mx * d.healPct / 100) : (d.heal || 0), price = ASH.core.priceBuy(k, it, ASH.me);
              if (heal > 0 && price > 0 && (!best || heal / price > best[2] / best[3])) best = [keeper, it, heal, price]; } }
          return best;""")
    def buy_food(self, heal, keep=10):
        """buy enough of the best-value food to heal `heal`, keeping `keep` GOLD back (selling loot first if it must)"""
        bf = self.best_food()
        if not bf or heal <= 0: return 0
        keeper, it, h, price = bf; n = int(-(-heal // max(1, h)))
        if (self.st().get('gold') or 0) - keep < n * price: self.money(n * price + keep)
        n = min(n, int(max(0, (self.st().get('gold') or 0) - keep) // max(1, price)))
        if n <= 0: return 0
        ok = self.r("return await buy(%r, %r, %d)" % (keeper, it, n)); log('bought %d %s (heals %d each, %d GOLD each) from %s' % (n, it, h, price, keeper) if ok else 'could not buy %s from %s' % (it, keeper))
        return n if ok else 0
    def beyond_bag(self, key):
        """the healing a fight with `key` needs is more than a full bag of the best food gives: say so before walking there
        (2026-10-07: every 20 minutes he walked into the bandit camp, ate 10 meals on the way, then found this out)"""
        if MONS.get(key, {}).get('level', 1) < 5: return False
        best = self.best_food() or [None, None, 5, 4]
        f = self.r(FOOD_JS) or {}
        # the need restock measured there, with the pack that joins in (2026-10-07: 193 for timber wolves, 1 wolf alone
        # passed this check and he died on the way)
        rec = self.mem.d.get('fight_need', {}).get(key, 0)
        rec = rec if isinstance(rec, list) else [rec, 13, 25]   # [need, defence, hitpoints] when it was measured
        dh = self.r("return [ASH.core.lv(ASH.me, 'defence'), ASH.core.lv(ASH.me, 'hitpoints')]") or [1, 1]
        # a measure from a weaker him no longer holds: 3 more defence or hitpoints and he tries again
        if dh[0] >= rec[1] + 3 or dh[1] >= rec[2] + 3: rec = [0, 0, 0]
        need = max(self.food_need(key), rec[0])
        cap = self.BAG_FOOD_MAX * max(best[2], f.get('avg', 2)) + max(0, f.get('max', 1) * 0.66)
        if need <= cap: return False
        self.absent[key] = time.time() + 3600; self._block_current('%s needs more food than a bag holds' % key, 3600)
        log('%s needs about %d healing, a full bag gives about %d: not going there yet, back in an hour' % (key, need, cap))
        return True
    def restock(self, key, adds=0, rounds=3):
        """not enough food for this fight: retreat and gather it (cook what it carries and keeps, earn and cook rat meat,
        buy bread) until it is enough or it gives up for now"""
        best = self.best_food() or [None, None, 5, 4]
        for i in range(rounds):
            ok, f, need = self.food_ok(key, adds)
            if ok: return True
            hp_spare = max(0, f.get('hp', 0) - f.get('max', 1) * 0.34)
            if need > self.BAG_FOOD_MAX * max(best[2], f.get('avg', 2)) + hp_spare:
                # more food than a bag holds: not this monster yet (2026-10-06: the bandit leader asked for 57 meals)
                if not hasattr(self, 'absent'): self.absent = {}
                self.mem.d.setdefault('fight_need', {})[key] = [int(need)] + (self.r("return [ASH.core.lv(ASH.me, 'defence'), ASH.core.lv(ASH.me, 'hitpoints')]") or [1, 1]); self.mem.save()
                self.absent[key] = time.time() + 3600; self._block_current('%s not around or not ready for' % key, 3600)
                log('%s needs about %d healing, more than a bag of food gives: other quests and training first' % (key, need))
                return False
            want = int(-(-max(0, need - f.get('tot', 0) - max(0, f.get('hp', 0) - f.get('max', 1) * 0.34)) // max(1, f.get('avg', 3))))
            log('not enough food for %s: %d food heals %d, the fight needs about %d: gathering %d more' % (key, f.get('n', 0), f.get('tot', 0), need, want))
            self.walk(RETREAT[0], RETREAT[1], 4); self.cook()   # what it caught first
            ok, f, need = self.food_ok(key, adds)
            if ok: return True
            deficit = need - f.get('tot', 0) - max(0, f.get('hp', 0) - f.get('max', 1) * 0.34)
            # what is bought for this fight is not "spare": raise the surplus line to it, or the seller sells it straight
            # back (2026-10-07: 11 bread bought three times over, food stayed at 14)
            self.food_goal = min(self.BAG_FOOD_MAX, f.get('n', 0) + int(-(-deficit // max(1, best[2]))) + 1)
            if self.buy_food(deficit): continue   # the best food money buys (bread heals 5 for 4 GOLD; rat meat heals 2)
            self.earn(25, (f.get('n', 0) or 0) + want, rounds=4)   # no gold: rats -- their pelts sell, their meat cooks
        return self.food_ok(key, adds)[0]
    def equip_up(self, rounds=3):
        """no weapon or no armour (2026-10-06: "if he doesn't have armor or a weapon, he should be trying to get
        armor or a weapon"): earn the gold, buy the best it can afford, wear it"""
        for i in range(rounds):
            w = self.r("return { weapon: !!ASH.me.eq.weapon, armour: ['head', 'body', 'legs', 'shield'].filter(k => ASH.me.eq[k]).length }") or {}
            if w.get('weapon') and (w.get('armour', 0) >= 3 or i > 0): return True   # one shopping trip for armour, then on with the quest
            log('gearing up: weapon %s, %d armour pieces worn' % (w.get('weapon'), w.get('armour', 0)))
            self.unpack(); self.money(10 ** 6); self.gear(); self.best_armour(); self.wear()
            w2 = self.r("return { weapon: !!ASH.me.eq.weapon, armour: ['head', 'body', 'legs', 'shield'].filter(k => ASH.me.eq[k]).length }") or {}
            if w2 == w:   # bought nothing: earn only for a WEAPON (the operator: "He needs to get to finishing his quests") - armour comes when it is affordable
                if w.get('weapon'): break
                # only the shortfall for the cheapest weapon, then buy it (2026-10-06: "make cinderwalker do its
                # quests" -- he looped 4 rounds at 34 of 39 GOLD for a 24-GOLD dagger)
                self.earn(self.cheapest_weapon(), 0, rounds=4); self.gear()
        return bool(self.r("return !!ASH.me.eq.weapon"))
    def engage(self, key):
        """one fight with the nearest key. Strong monsters first lose the hostile company standing near them, one by one,
        nearest first (2026-10-06: "He's supposed to kill the bandit leader, but he should probably kill the other
        bandits first"). Every fight is measured and remembered. Returns kill / died / fled / gone / timeout."""
        t = self.r("const m = nearest(%r); return m && m.uid" % key)
        if not t: return 'gone'
        if MONS.get(key, {}).get('level', 1) >= 5:
            for _ in range(8):
                adds = self.r(ADDS_JS % (t, 8)) or []
                if not adds: break
                uid, ak, d = adds[0]
                log('clearing the %s near the %s first (%d left around it)' % (MONS.get(ak, {}).get('name', ak), MONS.get(key, {}).get('name', key), len(adds)))
                if not self.food_ok(ak)[0] and not self.restock(ak): return 'fled'
                before = self.st(); res = self.r(FIGHT_JS % (uid, 60000, json.dumps(list(RETREAT)))) or {}
                self.mem.fought(ak, res, before)
                if res.get('r') == 'kill': self.mem.killed(ak, before); self.scavenge(6)
                elif res.get('r') == 'died': self.mem.died(ak, before); return 'died_add'   # its own death, not the target's
                elif res.get('r') == 'fled': return 'fled'
                t2 = self.r("const m = ASH.core.mobByUid(%d); return m && !m.dead ? m.uid : null" % t)
                if not t2: return 'gone'
        ms = 90000
        bow = MONS.get(key, {}).get('fleeHit') and self.ranged_kit()
        if bow:   # an arrow reaches a running deer; legs never did (2026-10-07: fifteen 40-second chases, no kill)
            self.r("return await equip(%r)" % bow)
            if self.r("return !!(ASH.me.eq.ammo)") is False: self.r("return await equip(ASH.me.inv.find(q => q && /^arrows_/.test(q.id)).id)")
        if MONS.get(key, {}).get('fleeHit') and not bow:
            # a hit deer bolts two tiles a tick: only a run catches it, so run energy first, and a short chase
            # (2026-10-07: six 90-second chases on walking legs, two kills)
            ms = 40000
            if (self.r("return ASH.me.energy || 0") or 0) < 2500:
                log('%s run when hit: getting my run energy back first (%s)' % (key, self.r("return ASH.me.energy")))
                self.r("const t0 = Date.now(); while (Date.now() - t0 < 180000 && (ASH.me.energy || 0) < 5000) await wait(2000); return 1")
                t = self.r("const m = nearest(%r); return m && m.uid" % key) or t
        before = self.st(); self.before = before
        res = self.r(FIGHT_JS % (t, ms, json.dumps(list(RETREAT)))) or {}
        self.mem.fought(key, res, before)
        if bow and getattr(self, 'melee_weapon', None): self.r("return await equip(%r)" % self.melee_weapon)
        log('fight with', key, '->', res.get('r'), '(took %s damage, ate %s, %s on it at once)' % (res.get('dmg'), res.get('eaten'), res.get('most')))
        return res.get('r', 'timeout')
    def ranged_kit(self):
        """a bow his Ranged allows and arrows for it, bought from Garrick once (arrows topped up under 30). Returns the bow id,
        or None when he cannot have one. Remembers the melee weapon to go back to."""
        w = self.r("const w = ASH.me.eq.weapon; return w && w.id")
        if w and not w.startswith('bow'): self.melee_weapon = w
        have = self.r("return [...ASH.me.inv, ASH.me.eq.weapon].filter(q => q && /^bow/.test(q.id)).map(q => q.id)[0] || null")
        arrows = self.r("return ((ASH.me.eq.ammo && /^arrows_/.test(ASH.me.eq.ammo.id)) ? ASH.me.eq.ammo.n : 0) + ASH.me.inv.filter(q => q && /^arrows_/.test(q.id)).reduce((a, q) => a + q.n, 0)") or 0
        if have and arrows >= 30: return have
        if getattr(self, '_kit_tried', 0) > time.time() - 1800: return have if arrows else None
        self._kit_tried = time.time()
        pick = self.r("""const st = ((ASH.core.D.shops.shops || ASH.core.D.shops).armoury || {}).stock || [], L = ASH.core.lv(ASH.me, 'ranged'), out = {};
          const ok = k => { const d = ASH.core.item(k); return d && Object.entries(d.req || {}).every(([s, v]) => ASH.core.lv(ASH.me, s) >= v); };
          const best = pre => st.filter(k => k.startsWith(pre) && ok(k)).sort((a, b) => (ASH.core.item(b).value || 0) - (ASH.core.item(a).value || 0));
          return { bow: best('bow_')[0] || null, arrows: best('arrows_')[0] || null }""") or {}
        if not pick.get('bow') or not pick.get('arrows'): return None
        self.money(300); self.make_room(2)   # 2026-10-07: "You have no room for that" at Garrick's
        if not have and self.r("return await buy('garrick', %r, 1)" % pick['bow']): have = pick['bow']; log('bought a bow for animals that run:', have)
        if arrows < 30 and self.r("return await buy('garrick', %r, 100)" % pick['arrows']): log('bought 100', pick['arrows'])
        return have
    def rest(self):
        """no food and hurt: walk back to the well and wait to heal"""
        log('resting at the well'); self.walk(22, 52, 4)
        for _ in range(12):
            s = self.st()
            if s.get('hp', 0) >= s.get('max', 1) * 0.9: break
            self.r("await wait(10000); return 1")
    def watch_deaths(self):
        """remember where it fell: you wake at a town portal and everything you carried lies where you died"""
        self.r("if (!window.__deathWatch) window.__deathWatch = setInterval(() => { if (ASH.me.dead && !window.__deadAt) "
               "window.__deadAt = [ASH.me.x, ASH.me.y]; }, 150); return 1")
    def died(self):
        return self.r("return window.__deadAt || null")
    def leave_zone(self, key, post):
        """the grounds are hunted out (2026-10-06: "he ran out of rats"). A dead monster only comes back once its
        zone has stood empty for rules.respawn.emptyTicks (30 s) and someone walks in again, or after 20 minutes with
        nobody near its spot -- so standing on the grounds waiting keeps them dead. Walk out of the zone, wait, come back."""
        here = self.r("return ASH.core.M.zoneAt(%d, %d)" % (post[0], post[1]))
        spot = here and self.r("""const z = %s, you = ASH.me, P = ASH.core.M.npcs.filter(n => ASH.core.M.zoneAt(n.x, n.y) && ASH.core.M.zoneAt(n.x, n.y) !== z)
            .sort((a, b) => Math.max(Math.abs(a.x - you.x), Math.abs(a.y - you.y)) - Math.max(Math.abs(b.x - you.x), Math.abs(b.y - you.y)))[0];
            return P && [P.x, P.y + 2]""" % json.dumps(here))
        if not spot: spot = [22, 52]   # the village well: outside Whisperwood, where the rats are
        self.scavenge(12, settle=500)   # nothing left behind on the way out
        log('the %s grounds are hunted out: stepping out of %s to %s for 45 s so they come back' % (key, here, spot))
        self.walk(spot[0], spot[1], 4)
        self.cook(); self.tidy()   # use the time: cook what it caught, sell the loot
        self.r("await wait(45000); return 1")
    def recover(self):
        """after dying: back to where it fell, take the pile (gear, tools and Gold stay on the ground), wear it again"""
        for _ in range(30):
            if not self.st().get('dead'): break
            self.r("await wait(2000); return 1")
        at = self.r("const a = window.__deadAt; window.__deadAt = null; return a") or getattr(self, 'last', None)
        # before anything else (2026-10-06: "If he dies, he should attempt to pick up his dropped loot first"):
        # straight back to the pile -- by portal when that is quicker -- and sweep until nothing of it is left
        got = []
        if at: self.mem.pile(at)
        if at:
            log('back to where it died', at, 'for its things first'); self.walk(at[0], at[1], 6)
            for _ in range(4):
                more = self.scavenge(10, settle=300)
                got += more
                if not more: break
            left = self.ground_near(10)
            log('got back', got, ('- %d things still on the ground' % left) if left else '- nothing left behind')
            self.mem.loot('death at %s' % (at,), got, left)
            if not left: self.mem.pile(clear=True)
        self.wear(); self.upgrade()
    def fetch_pile(self):
        """a run starts by going back for the things it dropped when it last died, if it never picked them up (a restart
        loses the game's own note of where): gear, tools and Gold stay on the ground where it fell"""
        # a death outside a fight (2026-10-07: killed walking past the bandits, 271 GOLD and his gear left there, never
        # noticed): the page's death watch saw it, so go back for it now
        self.watch_deaths()
        if self.r("return window.__deadAt || null"): log('died away from a fight: going back for its things'); self.recover(); return
        P = self.mem.d.get('pile')
        if not P: return
        at = P['at']; log('its things from the death on %s are still at %s: fetching them first' % (P.get('since'), at))
        self.walk(at[0], at[1], 6); got = []
        for _ in range(4):
            more = self.scavenge(10, settle=300); got += more
            if not more: break
        left = self.ground_near(10)
        log('fetched', got, ('- %d things still there' % left) if left else ('- all of it' if got else '- nothing was there any more (the world did not keep it)'))
        self.mem.loot('pile at %s' % (at,), got, left)
        if not left or not got: self.mem.pile(clear=True)   # all back, or nothing of it there any more
        self.wear(); self.upgrade(); self.walk(RETREAT[0], RETREAT[1], 4)
    def _block_current(self, why: str, seconds: float = 1200) -> None:
        qid = getattr(self, 'current_qid', None)
        if qid:
            self.blocked = self.mem.d.setdefault('blocked', {})
            self.blocked[qid] = (time.time() + seconds, why); self.mem.save()

    def fight(self, key, n=1):
        """kill n of key near its spawns; returns kills. Eats; retreats to restock when out of food"""
        if not hasattr(self, 'absent'): self.absent = {}
        if self.absent.get(key, 0) > time.time():
            log('%s was not around a little while ago: not looking again yet' % key); return 0
        if self.beyond_bag(key): return 0
        spawn = self.r("const m = nearest(%r); return m && [m.x, m.y, m.dist]" % key)
        if not spawn or spawn[2] > 40:   # monsters load as you come near: walk to where they live first
            sp = spawns_of(key)
            if not sp:
                if spawn:   # no fixed place, but one is in sight (2026-10-07: a boar was there, 40+ tiles off): go to it
                    log('no fixed place for %s, but there is one at %s: going there' % (key, spawn[:2]))
                    self.walk(spawn[0], spawn[1], 6); self.r("await wait(2000); return 1")
                    spawn = self.r("const m = nearest(%r); return m && [m.x, m.y, m.dist]" % key)
                if not spawn:
                    bug('fight', 'no %s spawns in any zone (wild herds only?) - a quest cannot send players to it without saying where' % key); return 0
                sp = [spawn[:2]]
            log('walking to the', key, 'grounds', sp[0]); self.walk(sp[0][0], sp[0][1] + 1, 6); self.r("await wait(3000); return 1")
            spawn = self.r("const m = nearest(%r); return m && [m.x, m.y, m.dist]" % key)
            if not spawn: log('reached the %s grounds at %s but none are there' % (key, sp[0])); self.leave_zone(key, sp[0]); return 0
        kills = 0; deaths = 0; misses = 0; self.watch_deaths()
        self.run_deaths = getattr(self, 'run_deaths', {})
        while kills < n and self.time_left():
            s = self.st()
            if s.get('dead') or self.died():
                deaths += 1; self.run_deaths[key] = self.run_deaths.get(key, 0) + 1
                self.recover()   # the loot first, before anything else
                if self.run_deaths[key] >= 2 and MONS.get(key, {}).get('level', 1) >= 5:
                    log('died to %s %d times this run: training and other quests first, back to it later' % (key, self.run_deaths[key])); return kills
                continue
            self.last = s.get('at'); self.before = s
            if not self.ready(key): return kills
            if s.get('hp', 1) < s.get('max', 1) * 0.4 and s.get('bread', 0) == 0:
                # GOLD in the bag buys a meal faster than the well heals (2026-10-07: ten minutes resting with 200 GOLD)
                if s.get('gold', 0) >= 20 and self.buy_food(s.get('max', 20)): continue
                self.rest(); continue
            if deaths >= 3: bug('fight ' + key, 'died 3 times: a player at combat %s cannot beat %s (level %s)' % (s.get('cb'), MONS.get(key, {}).get('name'), MONS.get(key, {}).get('level')), s); return kills
            if s.get('bread', 0) == 0 and (s.get('raw', 0) >= 3 or s.get('hp', 1) < s.get('max', 1) * 0.5):   # out of food: cook what it caught
                if not self.cook() and s.get('gold', 0) >= 10: self.gear()   # nothing to cook: buy bread (and a weapon once it can afford one)
            m = self.r("const m = nearest(%r); return m && [m.x, m.y, m.dist]" % key)
            if not m or m[2] > 40:   # e.g. back from cooking at the range: none loaded here, go back to their grounds
                sp = spawns_of(key)
                if not sp: return kills
                misses += 1
                if misses >= 2:   # hunted out: monsters come back when their zone has been empty 30 s and someone walks in
                    self.leave_zone(key, sp[0])
                    if misses > 3:   # 2026-10-06: ten fruitless trips for an absent bandit leader -- note it, move on
                        bug('fight', 'left and came back to the %s grounds at %s %d times and found none' % (key, sp[0], misses))
                        self.absent[key] = time.time() + 1200; self._block_current('%s not around or not ready for' % key)
                        log('no %s to be found: on to other quests, back in 20 minutes' % key); return kills
                log('back to the', key, 'grounds', sp[0]); self.walk(sp[0][0], sp[0][1] + 1, 6); self.r("await wait(3000); return 1")
                continue
            if m[2] > 12: self.walk(m[0], m[1], 3)
            lvl = MONS.get(key, {}).get('level', 1)
            if lvl >= 5:   # enough food for the whole fight, or go and get it first
                adds = len(self.r(ADDS_JS % (self.r("const m = nearest(%r); return m && m.uid" % key) or 0, 8)) or [])
                if not self.food_ok(key, adds)[0] and not self.restock(key, adds): log('still not enough food for', key, '- leaving it for now'); return kills
            res = self.engage(key)
            if res == 'kill': kills += 1; misses = 0; self.mem.killed(key, s); log('killed', key, kills, '/', n); self.scavenge(6)
            elif res in ('died', 'died_add'):
                if res == 'died' and lvl >= 5: self.mem.died(key, getattr(self, 'before', s))
                continue   # the loop's death branch fetches the loot
            elif res == 'fled': log('retreated from', key, '- restocking food'); self.restock(key)
            else: log('fight with', key, 'did not end in a kill (%s)' % res); misses += 1
        return kills
    def train(self, skill, level):
        while self.time_left():
            s = self.st(); L = self.r("return ASH.core.lv(ASH.me, %r)" % skill) or 0
            if L >= level: log('trained', skill, L); return True
            strong = s.get('cb', 0) >= 12 and s.get('weapon') and s.get('bread', 0) >= 2
            self.fight('wolf' if strong else 'rat', 3)
            if not s.get('weapon') and s.get('gold', 0) >= 30: self.gear()
            if s.get('raw', 0) >= 8: self.cook()
        return False
    def zone_open(self, step):
        """a quest step in a zone the live game has not released (the Keep) cannot be done yet: the core gates it"""
        z = step.get('zone')
        if not z: return True
        if not hasattr(self, '_zones'):   # every released zone, loaded or not (area loading: D.zones is only the loaded ones)
            self._zones = set(self.r("return (ASH.core.zoneIndex ? ASH.core.zoneIndex() : ASH.core.D.zones || []).map(z => z.id)") or [])
        return not self._zones or z in self._zones
    def npc(self, nid): return self.r("const n = ASH.core.M.npcs.find(q => q.id === %r); return n && [n.x, n.y]" % nid)
    def quest(self, qid):
        Q = QUESTS[qid]; giver = Q['giver']
        # kept in the memory file, so a restart does not walk to every stuck quest's giver again (2026-10-07)
        self.blocked = self.mem.d.setdefault('blocked', {})
        if self.blocked.get(qid, (0, ''))[0] > time.time():
            # 2026-10-07: five minutes a round went on walking to givers of quests known to be stuck
            log('skip %s for now: %s' % (Q['name'], self.blocked[qid][1])); return False
        # what the step it is on needs, checked here and not after a walk to the giver (2026-10-07: 9 minutes to Saltmere
        # to hear iron ore still needs mining 15)
        qs = (self.st().get('q') or {}).get(qid) or {}
        if qs and 1 <= qs.get('step', 1) <= len(Q['steps']):
            G0 = Q['steps'][qs['step'] - 1].get('goal') or {}
            gap = self.mem.d.get('skill_gap', {}).get(G0.get('bring'))
            if gap and (self.r("return ASH.core.lv(ASH.me, %r)" % gap[0]) or 1) < gap[1]:
                log('skip %s for now: %s needs %s %d' % (Q['name'], G0['bring'], gap[0], gap[1])); return False
            if G0.get('kill') and self.mem.d.get('fight_need', {}).get(G0['kill']):
                self.current_qid = qid
                if not hasattr(self, 'absent'): self.absent = {}
                if self.beyond_bag(G0['kill']): return False
        log('=== quest', Q['name']); self.current_qid = qid
        if self.r("return ASH.me.burden || 0"): self.lighten()   # a trip on half-speed legs costs minutes
        self.r("window.__keepFood = %s; return 1" % json.dumps(sorted(self.quest_wants() - {'bread'})))
        self.fetch_pile()   # what a death left on the ground comes back before anything else (cheap when there is none)
        g = self.npc(giver)
        if not g: bug(qid, 'giver %s is not in the world' % giver); return False
        self.walk(g[0], g[1]); said = self.r("return await talk(%r)" % giver); log('giver says', (said or [])[-3:])
        panel = (self.r("return quests().panel") or '')
        if 'undefined' in panel: bug(qid, 'the Quests panel shows "undefined": ' + panel.replace('\n', ' | ')[:300])
        for _ in range(len(Q['steps']) + 2):
            if not self.time_left(): log('time up'); return False
            q = (self.st().get('q') or {}).get(qid)
            if not q: bug(qid, 'talking to %s did not start the quest' % giver, self.st()); return False
            if q.get('step', 1) > len(Q['steps']): log('quest done', Q['name']); return True
            S = Q['steps'][q['step'] - 1]; G = S['goal']; kind = next(k for k in G if k != 'n'); need = G.get('n', 1)
            log('step', q['step'], kind, G[kind], need, 'have', q.get('n', 0))
            before = json.dumps(q)
            if kind == 'kill':
                if G['kill'] not in MONS: bug('%s step %d' % (qid, q['step']), 'kill goal names an unknown monster "%s"' % G['kill']); return False
                lvl = MONS[G['kill']]['level']
                if (self.st().get('cb') or 0) < lvl - 2: log('too weak for', G['kill'], '- training'); self.gear(); self.train('attack', min(40, lvl + 2))
                self.fight(G['kill'], max(0, need - q.get('n', 0)))
                if getattr(self, 'absent', {}).get(G['kill'], 0) > time.time():
                    self.blocked[qid] = (self.absent[G['kill']], '%s not around' % G['kill']); self.mem.save()
                    log('%s is not around: %s waits, other quests first' % (G['kill'], Q['name'])); return False
                if not spawns_of(G['kill']) and not self.r("return !!nearest(%r)" % G['kill']):
                    self.blocked[qid] = (time.time() + 3600, 'no %s has a fixed place to be found' % G['kill']); self.mem.save()
                    return False
            elif kind == 'bring':
                k = G['bring']
                if k not in ITEMS: bug('%s step %d' % (qid, q['step']), 'bring goal names an unknown item "%s"' % k); return False
                if G.get('with') and not self.r("return bag()[%r] || 0" % G['with']):
                    self.chest_take_all([G['with']])
                    w = G['with']
                    if not self.r("return bag()[%r] || 0" % w) and self.r("return !!ASH.core.item(%r).edible" % w) is not None:
                        self.cook_goal(w, 1)   # e.g. the cooked chicken that goes with Iria's loaf
                raw_of = next((r for r, d in ITEMS.items() if isinstance(d, dict) and any(a.get('trait_type') == 'Cooks into' and a.get('value') == k
                                                                                         for a in d.get('attributes', []))), None)
                if raw_of and not mon_drop(k):
                    # a cooked thing (2026-10-07: "bring 10 shrimp", the cooked kind): catch the raw ones, cook them
                    self.chest_take_all([k])
                    short = need - (self.r("return bag()[%r] || 0" % k) or 0)
                    if short > 0:
                        rm = mon_drop(raw_of)
                        if rm:   # raw meat is hunted, not gathered (2026-10-07: "bring 3 hare_cooked")
                            log('%s comes from cooking %s, which %s drop: hunting %d' % (k, raw_of, rm, short + 1))
                            self.fight(rm, short + 1); self.scavenge(8)
                            got = self.r("return bag()[%r] || 0" % raw_of) or 0
                        else:
                            got = self.gather_item(raw_of, short + 2)   # a couple spare for the ones that burn
                        if got: self.walk(RANGE[0], RANGE[1] + 1, 4); log('cooked for the quest', self.r("return await gatherAt(%d, %d, %d)" % (RANGE[0], RANGE[1], 8000 + 4000 * got)))
                have = self.gather_item(k, need)
                if have < need and self.skill_gap.get(k):
                    sk, lvl = self.skill_gap[k]
                    self.blocked[qid] = (time.time() + 1200, '%s needs %s %d' % (k, sk, lvl)); self.mem.save()
                    log('%s needs %s %d: %s waits, %s trained in earning time' % (k, sk, lvl, Q['name'], sk)); return False
                SH0 = SHOPS.get('shops', SHOPS)
                sold = any(isinstance(v, dict) and k in v.get('stock', []) for v in SH0.values())
                # a drop to hunt only when no shop sells it (2026-10-07: "bread comes from bandit" -- he died at their camp)
                mon = None if sold else next((m for m, d in MONS.items() if any(x.get('item') == k for x in d.get('drops', []))), None)
                if have < need and mon and not self.skill_gap.get(k):
                    # a drop, not a resource (2026-10-07: "bring 6 rat pelts" looped on the hand-in): hunt for it
                    log('%s comes from %s: hunting for %d' % (k, mon, need - have))
                    for _ in range(3):
                        self.fight(mon, need - have); self.scavenge(8)
                        have = self.r("return bag()[%r] || 0" % k) or 0
                        if have >= need or getattr(self, 'absent', {}).get(mon, 0) > time.time(): break
                if have < need:
                    # SHOPS is {currency, shops: {...}}: the old lookup never found a shop (2026-10-07: Iria's loaf)
                    SH = SHOPS.get('shops', SHOPS)
                    shop = next((sid for sid in ('general',) + tuple(SH) if isinstance(SH.get(sid), dict) and k in SH[sid].get('stock', [])), None)
                    if shop:
                        self.money(60)
                        self.make_room(2)
                        kxy = self.npc(SH[shop].get('keeper'))
                        if kxy: self.walk(kxy[0], kxy[1] + 1, 6)   # by portal when far (2026-10-07: Hollis is in Saltmere; buy() walked on foot and gave up)
                        log('buying %d %s from %s' % (need - have, k, SH[shop].get('keeper')), self.r("return await buy(%r, %r, %d)" % (SH[shop].get('keeper'), k, need - have)))
                    elif not mon: bug('%s step %d' % (qid, q['step']), 'could not gather or buy %d x %s near (%s)' % (need, k, self.st().get('at')), self.st())
            elif kind == 'cook':
                # 2026-10-07, Iria's supper: kill what drops the raw one, cook it on the range; a burnt one does not count
                if not self.cook_goal(G['cook'], max(0, need - q.get('n', 0))):
                    bug('%s step %d' % (qid, q['step']), 'cannot get anything raw that cooks into %s' % G['cook']); return False
            elif kind == 'plant':
                if not self.plant_goal(S, max(0, need - q.get('n', 0))):
                    bug('%s step %d' % (qid, q['step']), 'could not plant: no sapling, or no grass that takes one near %s' % S.get('near')); return False
            elif kind not in ('talk',):
                bug('%s step %d' % (qid, q['step']), 'goal kind "%s" the bot does not know yet: %s' % (kind, G)); return False
            elif kind == 'talk':
                t = self.npc(G['talk'])
                if not t: bug('%s step %d' % (qid, q['step']), 'talk goal names an NPC not in the world: %s' % G['talk']); return False
                self.walk(t[0], t[1]); log('talk', G['talk'], (self.r("return await talk(%r)" % G['talk']) or [])[-2:])
            # a kill step counts as it goes: back to the giver only when it is done (2026-10-07: six minutes of travel
            # per round of boars, to hear "2 more boar")
            if kind == 'kill':
                qn = (self.st().get('q') or {}).get(qid) or {}
                if qn.get('step') == q.get('step') and qn.get('n', 0) < need and qn.get('n', 0) > q.get('n', 0):
                    log('%s %d of %d: hunting on before going back' % (G['kill'], qn.get('n', 0), need)); continue
            g = self.npc(giver); self.walk(g[0], g[1]); log('hand in', (self.r("return await talk(%r)" % giver) or [])[-3:])
            after = json.dumps((self.st().get('q') or {}).get(qid))
            if after == before:   # the first word sometimes does not land (2026-10-07: tin pipe moved on at the second)
                self.walk(g[0], g[1]); self.r("await wait(1500); return 1"); log('hand in again', (self.r("return await talk(%r)" % giver) or [])[-3:])
                after = json.dumps((self.st().get('q') or {}).get(qid))
            if after == before:
                bug('%s step %d' % (qid, q['step']), 'no progress after a full attempt (%s %s x%d)' % (kind, G[kind], need), self.st())
                # 2026-10-07: a dozen hand-ins a minute for rat pelts he did not have: set it aside for a while instead
                self.blocked[qid] = (time.time() + 1200, 'no progress on step %d' % q['step']); self.mem.save(); return False
        return False
REPORT = os.path.join(HERE, 'handoff', 'cinderwalker_quests.md')
DONE_FLAG = os.path.join(HERE, 'chain', 'bot_all_quests_done')
def report_quests(b, tries, notes):
    """handoff/cinderwalker_quests.md: where every quest stands, rewritten after each attempt (2026-10-06: "keep
    playing until he has accomplished all of the quests ... and report on all of the quests")"""
    qs = b.st().get('q') or {}
    rows, done = [], 0
    for qid, Q in QUESTS.items():
        q, n = qs.get(qid), len(Q['steps'])
        if q and q.get('step', 1) > n: st = 'DONE'; done += 1
        elif q and not b.zone_open(Q['steps'][q['step'] - 1]): st = 'DONE FOR NOW: step %d is in %s, not released yet' % (q['step'], Q['steps'][q['step'] - 1].get('zone')); done += 1
        elif q: S = Q['steps'][q['step'] - 1]['goal']; k = next(x for x in S if x != 'n'); st = 'step %d of %d: %s %s (%d/%d)' % (q['step'], n, k, S[k], q.get('n', 0), S.get('n', 1))
        else: st = 'not started'
        rows.append('| %s | %s | %s | %d | %s |' % (Q['name'], Q['giver'], st, tries.get(qid, 0), (notes.get(qid) or LAST_BUG.get(qid) or '').replace('|', '/')[:160]))
    lv = b.r("const o = {}; for (const k in ASH.me.xp) { const l = ASH.core.lv(ASH.me, k); if (l > 1) o[k] = l; } o.combat = ASH.core.combatLevel(ASH.me); return o")
    open(REPORT, 'w').write('# @cinderwalker: the quests, played on the live game\n\nUpdated %s. **%d of %d done.** Levels: %s\n\n'
                            '| Quest | Giver | Where it stands | Attempts | Last problem |\n|---|---|---|---|---|\n%s\n\n'
                            '## What it has learned\n\n%s\n\nLatest lessons:\n%s\n\n'
                            'Every bug it hits is also in handoff/qwen_quest_bugs.md. Log: chain/bot.log. Memory: chain/cinder_learned.json.\n'
                            % (time.strftime('%Y-%m-%d %H:%M'), done, len(QUESTS), json.dumps(lv), '\n'.join(rows),
                               '\n'.join('- %s: %s' % kv for kv in b.mem.summary().items()) or '- nothing yet',
                               '\n'.join('- ' + l for l in b.mem.d.get('lessons', [])[-8:]) or '- none yet'))
    return done
# No fixed defence gate any more (2026-10-06: "He should be killing wolves by now. His goal should be to
# complete all of the quests in the game logging any bugs"): he quests, and what kills him decides what he trains
# first, monster by monster (Memory).
DEFENCE_GOAL = 1
FIGHT_FOOD = 5      # cooked food carried into any fight with a monster of level 5 or more
def mon_drop(item):
    return next((m for m, d in MONS.items() if any(x.get('item') == item for x in d.get('drops', []))), None)
def toughen(b):
    """before the quests (2026-10-06: "Once he has reached the experience where he can kill a rat in one or two
    blows, and he has the best armor that he can wear he should start the wolf quest"): train strength on rats until his
    best hit is half a rat's health (two blows), and wear the best armour his defence allows"""
    rat_hp = MONS.get('rat', {}).get('hp', 5); need = -(-rat_hp // 2)
    while b.time_left():
        # his best hit in the style that trains strength (Aggressive, +3): read in Accurate it stays one lower and
        # he would train rats for ever (2026-10-06: strength 15 read as best hit 2)
        mh = b.r("const was = (ASH.me.styles || {}).melee || 0; ASH.core.cmd('me', { c: 'style', i: 1 }); "
                 "const h = ASH.core.maxHit(ASH.me); ASH.core.cmd('me', { c: 'style', i: was }); return h") or 0
        dfn = b.r("return ASH.core.lv(ASH.me, 'defence')") or 1
        report_quests(b, {}, {})   # the report shows training and lessons too, not only quest attempts
        b.best_armour()
        if mh >= need and dfn >= DEFENCE_GOAL:
            b.r("ASH.core.cmd('me', { c: 'style', i: 0 }); return 1")
            log('ready for the quests: best hit %d (a rat has %d hp), defence %d' % (mh, rat_hp, dfn)); return True
        if mh < need:
            b.r("ASH.core.cmd('me', { c: 'style', i: 1 }); return 1")   # Aggressive: the xp goes to strength
            log('training strength on rats: best hit %d, wants %d (strength %s)' % (mh, need, b.r("return ASH.core.lv(ASH.me, 'strength')")))
        else:
            # 2026-10-06: he kept dying to wolves at defence 1 -- all his training had gone to attack and strength
            b.r("ASH.core.cmd('me', { c: 'style', i: 2 }); return 1")   # Defensive: the xp goes to defence
            log('training defence on rats: defence %d, wants %d' % (dfn, DEFENCE_GOAL))
        b.fight('rat', 10); b.cook(); b.money(10**6)
    return False
def play_all(b):
    """every quest, round after round, until all are done: a quest that made no progress 3 attempts running is set
    aside as stuck (and reported) while the rest go on; when only stuck ones are left it tries them again each round"""
    tries, still, notes = {}, {}, {}
    while b.time_left():
        qs = b.st().get('q') or {}
        left = [k for k, Q in QUESTS.items() if not (qs.get(k) and (qs[k].get('step', 1) > len(Q['steps']) or not b.zone_open(Q['steps'][qs[k]['step'] - 1])))]
        if not left:
            report_quests(b, tries, notes); log('ALL %d QUESTS DONE' % len(QUESTS)); open(DONE_FLAG, 'w').write(time.ctime()); return True
        live = [k for k in left if still.get(k, 0) < 3] or left
        moved_any = False
        for qid in live:
            if not b.time_left(): break
            before = json.dumps((b.st().get('q') or {}).get(qid))
            tries[qid] = tries.get(qid, 0) + 1
            try: b.quest(qid)
            except Exception as exc: notes[qid] = 'crashed: %s' % str(exc)[:120]; log('quest', qid, 'crashed', exc)
            moved = json.dumps((b.st().get('q') or {}).get(qid)) != before
            still[qid] = 0 if moved else still.get(qid, 0) + 1
            moved_any = moved_any or moved
            if still[qid] == 3: notes[qid] = 'stuck: 3 attempts without progress. ' + LAST_BUG.get(qid, ''); log('set aside as stuck', qid)
            report_quests(b, tries, notes)
        if not moved_any and b.time_left(): b.train_gaps()   # nothing moved this round: level what the quests wait on
    return False
if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('MINUTES=')]
    mins = next((float(x[8:]) for x in sys.argv[1:] if x.startswith('MINUTES=')), 45)
    if not a: print(__doc__); sys.exit()
    with LiveGame('cinderwalker') as g:
        b = Bot(g, mins); b.r("ASH.core.cmd('me', { c: 'look', name: 'Cinderwalker' }); window.__run = true; return 1"); b.watch_deaths()
        # Eat as health goes down, the way a player does: click the red hit-point orb, which eats the first meal in the
        # bag (2026-10-06: "He should be eating his meals as his hit points go down ... As his meals are eaten
        # room for pelts will be freed up"). In the page, every second, whatever the bot is doing: when he is missing at
        # least one meal's worth of health, and not more often than every 1.8 s.
        b.r("""if (!window.__autoEat) window.__autoEat = setInterval(() => { try {
              const p = ASH.me, C = ASH.core; if (!p || p.dead) return;
              // never what a quest wants brought (window.__keepFood, set by quest(): Iria's cooked chicken)
              // ...unless his life is on it: below 40% the quest's food is eaten too (2026-10-07: he died twice by Iria with
              // a bag of shrimp the Kitchen Range wanted, eating none of it)
              const keep = p.hp < C.maxHp(p) * 0.4 ? [] : (window.__keepFood || []);
              const meal = p.inv.find(q => q && (C.item(q.id) || {}).edible && !keep.includes(q.id)); if (!meal) return;
              const heal = (C.item(meal.id).heal || 2), max = C.maxHp(p);
              // below three-quarters, and missing at least a meal's worth: small knocks heal by themselves, and every
              // bread bought is a trip away from the quest (2026-10-07: eight bread trips in fifteen minutes)
              if (p.hp > max * 0.75 || max - p.hp < heal || Date.now() - (window.__ateAt || 0) < 1800) return;
              const first = p.inv.find(q => q && (C.item(q.id) || {}).edible), orb = document.querySelector('.orb.hp');
              if (orb && first === meal) orb.click(); else C.cmd('me', { c: 'eat', slot: p.inv.indexOf(meal) });
              window.__ateAt = Date.now(); window.__ate = (window.__ate || 0) + 1;
            } catch (e) {} }, 1000); return 1""")
        # how smoothly this browser draws the game: a few frames a second is what other players see as jumps
        log('frames per second', b.r("let n = 0; const t0 = performance.now(); await new Promise(res => { "
                                     "const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(); }; "
                                     "requestAnimationFrame(f); }); return Math.round(n * 1000 / (performance.now() - t0))"))
        cmd = a[0]; log('#### bot', ' '.join(a), 'for', mins, 'min')
        if cmd == 'status': log('status', json.dumps(b.r("return report('status')"), default=str)[:1500])
        elif cmd == 'money': b.money(int(a[1]) if len(a) > 1 else 60)
        elif cmd == 'gear': b.gear()
        elif cmd == 'train': b.gear(); b.train(a[1], int(a[2]))
        elif cmd == 'quest': b.unpack(); b.gear(); b.prepare(); b.quest(a[1])
        elif cmd == 'earn': b.earn(int(a[1]) if len(a) > 1 else 40, 4); b.gear()
        elif cmd == 'all':
            b.unpack(); b.fetch_pile(); b.gear(); b.prepare(); toughen(b) and play_all(b)
        log('#### end', json.dumps(b.r("return report('end')"), default=str)[:800])
