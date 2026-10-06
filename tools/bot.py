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
        return self.d['monsters'].setdefault(key, {'fights': 0, 'kills': 0, 'deaths': 0, 'streak': 0,
                                                   'need_def': 1, 'need_cb': 1, 'need_food': FIGHT_FOOD})
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
        if food > 0:   # it had food and still lost: too weak for it
            m['need_def'] = max(m['need_def'], dfn + 3); m['need_cb'] = max(m['need_cb'], cb + 2)
            self.lesson(key, 'died with %d food left at defence %d, combat %d: training to defence %d, combat %d first'
                        % (food, dfn, cb, m['need_def'], m['need_cb']))
        else:          # it ran out of food: bring more
            m['need_food'] = min(15, m['need_food'] + 2)
            self.lesson(key, 'died with no food left: carrying %d next time' % m['need_food'])
        self.save()
    def summary(self):
        return {k: '%d kills, %d deaths; wants defence %d, combat %d, %d food' % (v['kills'], v['deaths'], v['need_def'], v['need_cb'], v['need_food'])
                for k, v in self.d['monsters'].items()}


class Bot:
    def __init__(self, g, minutes): self.g, self.t0, self.limit, self.mem = g, time.time(), minutes * 60, Memory()
    def r(self, js):
        try: return self.g.run(js)
        except Exception as e: log('step error', str(e)[:160]); return None
    def time_left(self): return not LiveGame.stopping and time.time() - self.t0 < self.limit
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
        self.attune_here()
        self.portal_hop(x, y)
        for _ in range(tries):
            if self.r("return await walkTo(%d, %d, 60000)" % (x, y)): self.attune_here(); return True
        return False
    def chest_take_all(self, keys):
        self.r("await talk('chest'); return 1")
        return self.r("const c = ASH.chest.state().chest, got = {}; for (const k of %s) if (c[k]) { ASH.chest.take(k, c[k]); got[k] = c[k]; } return got;" % json.dumps(list(keys)))
    def money(self, want=60):
        s = self.st()
        if s.get('gold', 0) >= want: return True
        got = self.chest_take_all(SELL); log('from the chest', got)
        for k in SELL:
            if self.r("return bag()[%r] || 0" % k): log('sell', k, self.r("return await sell('tam', %r, 1000)" % k))
        self.tidy()
        s = self.st(); log('gold now', s.get('gold'))
        return s.get('gold', 0) >= want
    def cheapest_weapon(self):
        return min((self.r("return ASH.core.priceBuy('armoury', %r, ASH.me)" % k) or 9999) for k in ('dagger_t1', 'sword_t1'))
    def earn(self, gold, food=3, rounds=12):
        """the way a new player starts (2026-10-05): kill rats, cook their meat at the range for food, sell their
        pelts for GOLD, and go round again until it has `gold` and `food`. Rats are weak enough to fight bare-handed."""
        for i in range(rounds):
            if not self.time_left(): return False
            s = self.st()
            if s.get('gold', 0) >= gold and s.get('bread', 0) >= food: return True
            log('earning: round', i + 1, 'gold %s/%s food %s/%s' % (s.get('gold'), gold, s.get('bread'), food))
            self.fight('rat', 5)
            self.scavenge(12, settle=500)   # sweep the grounds before the trip to cook and sell
            self.cook()
            self.money(gold)
        s = self.st(); return s.get('gold', 0) >= gold and s.get('bread', 0) >= food
    def unpack(self):
        """what it owns is in the chest after a restart (gold, food, gear): take it back out and wear the gear"""
        log('levels at start', self.r("const o = {}; for (const k in ASH.me.xp) o[k] = ASH.core.lv(ASH.me, k); o.combat = ASH.core.combatLevel(ASH.me); o.at = [ASH.me.x, ASH.me.y]; return o"))
        got = self.r("await talk('chest'); const C = ASH.chest.state().chest, got = {}; for (const k in C) { const d = ASH.core.item(k) || {}; "
                     "if (C[k] > 0 && (k === 'coins' || d.edible || d.eq)) { ASH.chest.take(k, C[k]); got[k] = C[k]; await wait(300); } } return got") or {}
        if got: log('took from the chest', got); self.upgrade()
    def prepare(self):
        """before quests: a weapon on, and food in the bag -- earned from rats when it has nothing"""
        self.unpack(); s = self.st()
        if s.get('weapon') and s.get('bread', 0) >= FIGHT_FOOD: return True
        want = self.cheapest_weapon() + 15 if not s.get('weapon') else 15
        log('preparing: weapon %s, food %s, gold %s -> earning %s GOLD and %d food' % (s.get('weapon'), s.get('bread'), s.get('gold'), want, FIGHT_FOOD + 1))
        self.earn(want, FIGHT_FOOD + 1); self.gear(); self.cook()
        s = self.st(); log('prepared: weapon %s, food %s, gold %s' % (s.get('weapon'), s.get('bread'), s.get('gold')))
        return bool(s.get('weapon'))
    def cook(self):
        """take raw food from the chest, cook it all on the range by the well; returns cooked food carried"""
        raws = self.r("return Object.keys(ASH.chest.state().chest).filter(k => ASH.core.item(k).cooks)") or []
        if raws: log('raw from the chest', self.chest_take_all(raws))
        n = self.st().get('raw', 0)
        if not n: return self.st().get('bread', 0)
        self.walk(RANGE[0], RANGE[1] + 1, 4)
        for _ in range(3):
            if not self.st().get('raw'): break
            log('cooked', self.r("return await gatherAt(%d, %d, %d)" % (RANGE[0], RANGE[1], 6000 + 4000 * n)))
        f = self.st().get('bread', 0); log('food now', f); return f
    def gear(self):
        self.money(40); s = self.st()
        price = lambda shop, k: self.r("return ASH.core.priceBuy(%r, %r, ASH.me)" % (shop, k)) or 9999
        if not s.get('weapon'):
            for sw in ('sword_t2', 'sword_t1', 'dagger_t1'):
                if price('armoury', sw) <= s.get('gold', 0) and self.r("return await buy('garrick', %r, 1)" % sw): log('bought', sw, self.r("return await equip(%r)" % sw)); break
            else: log('no weapon yet: the cheapest costs %s, it has %s GOLD' % (price('armoury', 'dagger_t1'), s.get('gold')))
        s = self.st(); pb = price('general', 'bread'); n = min(5, int(s.get('gold', 0) // max(1, pb)))
        if (s.get('bread') or 0) < 3 and n > 0: log('bread x%d' % n, self.r("return await buy('tam', 'bread', %d)" % n))
        # armour (2026-10-05: "he doesn't have a weapon, he doesn't have any armor"): the cheapest pieces it can afford,
        # keeping 15 GOLD back for bread
        for piece, slot in (('helmet_t1', 'head'), ('body_t1', 'body'), ('legs_t1', 'legs'), ('shield_t1', 'shield')):
            s = self.st(); worn = self.r("return !!(ASH.me.eq[%r])" % slot)
            if worn or price('armoury', piece) > s.get('gold', 0) - 15: continue
            if self.r("return await buy('garrick', %r, 1)" % piece): log('bought', piece, self.r("return await equip(%r)" % piece))
        self.wear()
    def ground_near(self, r):
        return self.r("return ASH.core.S.ground.filter(g => Math.max(Math.abs(g.x - ASH.me.x), Math.abs(g.y - ASH.me.y)) <= %d).length" % r) or 0
    def scavenge(self, r=8, settle=1500):
        """pick up whatever lies within r tiles (2026-10-05: "if he sees anything laying around he should pick it up
        and use it or sell it"; 2026-10-06: "Make sure Cinder Walker doesn't leave loot lying around"), then put on
        anything better than what it wears. A monster's drop lands two ticks after it dies, so it waits for that first,
        then sweeps until nothing is left; a full bag is emptied at the shop and chest and it comes back for the rest."""
        self.r("await wait(%d); return 1" % settle)
        got, here = [], self.st().get('at')
        for _ in range(4):
            more = self.r("return await pickUp(%d)" % r) or []
            got += more
            if not self.ground_near(r): break
            if not more:
                free = self.r("return ASH.me.inv.filter(s => !s).length") or 0
                if free == 0 and here:
                    log('bag full with loot still on the ground: emptying it and coming back')
                    self.tidy(); self.walk(here[0], here[1], 4)
                else:
                    break   # what is left cannot be taken (somebody else's, or gone)
        if got: log('picked up', got); self.upgrade()
        return got
    def upgrade(self):
        """wear every piece in the bag that is worth more than what is in its slot (empty slots first)"""
        got = self.r("""const out = []; for (let pass = 0; pass < 8; pass++) { let did = false;
          for (let i = 0; i < ASH.me.inv.length; i++) { const q = ASH.me.inv[i]; if (!q) continue; const d = ASH.core.item(q.id), slot = d && d.eq; if (!slot) continue;
            const on = ASH.me.eq[slot], ond = on && ASH.core.item(on.id);
            if (!on || (d.value || 0) > ((ond && ond.value) || 0)) { ASH.core.cmd('me', { c: 'equip', slot: i }); out.push(q.id); await wait(800); did = true; break; } }
          if (!did) break; } return out;""")
        if got: log('wore', got)
    def tidy(self):
        """the bag after a trip: wear the best, sell the loot tam buys, and put the rest in the chest -- keeping food, raw
        food to cook, tools and anything a quest wants"""
        self.upgrade()
        keep = json.dumps(sorted(WANTED))
        loose = self.r("const keep = new Set(%s), out = {}; for (const q of ASH.me.inv) { if (!q) continue; const d = ASH.core.item(q.id) || {}; "
                       "if (keep.has(q.id) || d.edible || d.cooks || d.tool || d.skill || q.id === 'coins') continue; out[q.id] = (out[q.id] || 0) + (q.n || 1); } return out" % keep) or {}
        for k, n in loose.items():
            if self.r("return await sell('tam', %r, %d)" % (k, n)) and not self.r("return bag()[%r] || 0" % k): log('sold', n, k); continue
            self.r("await talk('chest'); ASH.chest.store(%r, %d); return 1" % (k, n)); log('stashed in the chest', n, k)
    def best_armour(self):
        """each armour slot: the best piece the armoury sells that his levels allow, if it beats what he wears and he can
        afford it with 15 GOLD to spare"""
        got = self.r("""const out = [], sh = ASH.core.D.shops, stock = ((sh.shops || sh).armoury || {}).stock || [];
          const can = d => Object.entries(d.req || {}).every(([k, v]) => ASH.core.lv(ASH.me, k) >= v);
          for (const slot of ['head', 'body', 'legs', 'shield']) {
            const on = ASH.me.eq[slot], onv = on ? (ASH.core.item(on.id).value || 0) : 0;
            const best = stock.map(k => [k, ASH.core.item(k)]).filter(([k, d]) => d && d.eq === slot && can(d) && (d.value || 0) > onv)
              .sort((a, b) => (b[1].value || 0) - (a[1].value || 0))[0];
            if (best) out.push([slot, best[0], ASH.core.priceBuy('armoury', best[0], ASH.me)]); }
          return out;""") or []
        for slot, k, price in got:
            if price > (self.st().get('gold') or 0) - 15: log('armour: %s wants %s (%s GOLD), cannot afford it yet' % (slot, k, price)); continue
            if self.r("return await buy('garrick', %r, 1)" % k): log('bought', k, self.r("return await equip(%r)" % k))
    def wear(self):
        """put on every wearable thing in the bag for an empty slot (after a death the pile comes back into the bag)"""
        got = self.r("""const out = []; for (let i = 0; i < ASH.me.inv.length; i++) { const q = ASH.me.inv[i]; if (!q) continue; const d = ASH.core.item(q.id); const slot = d && d.eq; if (slot && !ASH.me.eq[slot]) { ASH.core.cmd('me', { c: 'equip', slot: i }); out.push(q.id); await wait(700); } } return out;""")
        if got: log('wore', got)
    def ready(self, key):
        """before a fight with anything that hits back hard: a weapon, food, health - else False (train on something easier)"""
        lvl = MONS.get(key, {}).get('level', 1)
        if lvl < 5: return True
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
        return True
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
        spot = here and self.r("""const z = %s, me = ASH.me, P = ASH.core.M.npcs.filter(n => ASH.core.M.zoneAt(n.x, n.y) && ASH.core.M.zoneAt(n.x, n.y) !== z)
            .sort((a, b) => Math.max(Math.abs(a.x - me.x), Math.abs(a.y - me.y)) - Math.max(Math.abs(b.x - me.x), Math.abs(b.y - me.y)))[0];
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
        if at:
            log('back to where it died', at, 'for its things'); self.walk(at[0], at[1], 4)
            for _ in range(3):
                if not self.scavenge(10): break
        self.wear(); self.upgrade()
    def fight(self, key, n=1):
        """kill n of key near its spawns; returns kills. Eats; retreats to restock when out of food"""
        spawn = self.r("const m = nearest(%r); return m && [m.x, m.y, m.dist]" % key)
        if not spawn or spawn[2] > 40:   # monsters load as you come near: walk to where they live first
            sp = spawns_of(key)
            if not sp: bug('fight', 'no %s spawns in any zone (wild herds only?) - a quest cannot send players to it without saying where' % key); return 0
            log('walking to the', key, 'grounds', sp[0]); self.walk(sp[0][0], sp[0][1] + 1, 6); self.r("await wait(3000); return 1")
            spawn = self.r("const m = nearest(%r); return m && [m.x, m.y, m.dist]" % key)
            if not spawn: log('reached the %s grounds at %s but none are there' % (key, sp[0])); self.leave_zone(key, sp[0]); return 0
        kills = 0; deaths = 0; misses = 0; self.watch_deaths()
        while kills < n and self.time_left():
            s = self.st()
            if s.get('dead') or self.died():
                deaths += 1
                if MONS.get(key, {}).get('level', 1) >= 5: self.mem.died(key, getattr(self, 'before', s))
                self.recover(); continue
            self.last = s.get('at'); self.before = s
            if not self.ready(key): return kills
            if s.get('hp', 1) < s.get('max', 1) * 0.4 and s.get('bread', 0) == 0: self.rest(); continue
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
                    if misses > 8: bug('fight', 'left and came back to the %s grounds at %s %d times and found none' % (key, sp[0], misses)); return kills
                log('back to the', key, 'grounds', sp[0]); self.walk(sp[0][0], sp[0][1] + 1, 6); self.r("await wait(3000); return 1")
                continue
            if m[2] > 12: self.walk(m[0], m[1], 3)
            if self.r("return await kill(%r, 60000)" % key): kills += 1; misses = 0; self.mem.killed(key, s); log('killed', key, kills, '/', n); self.scavenge(6)
            else: log('fight with', key, 'did not end in a kill'); misses += 1
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
        Q = QUESTS[qid]; giver = Q['giver']; log('=== quest', Q['name'])
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
            elif kind == 'bring':
                k = G['bring']
                if k not in ITEMS: bug('%s step %d' % (qid, q['step']), 'bring goal names an unknown item "%s"' % k); return False
                have = self.r("return await gatherN(%r, %d)" % (k, need)) or 0
                if have < need:
                    shop = next((sid for sid, sh in SHOPS.items() if isinstance(sh, dict) and k in sh.get('stock', [])), None)
                    if shop: self.money(60); self.r("return await buy(%r, %r, %d)" % (SHOPS[shop].get('keeper'), k, need - have))
                    else: bug('%s step %d' % (qid, q['step']), 'could not gather or buy %d x %s near (%s)' % (need, k, self.st().get('at')), self.st())
            elif kind == 'talk':
                t = self.npc(G['talk'])
                if not t: bug('%s step %d' % (qid, q['step']), 'talk goal names an NPC not in the world: %s' % G['talk']); return False
                self.walk(t[0], t[1]); log('talk', G['talk'], (self.r("return await talk(%r)" % G['talk']) or [])[-2:])
            g = self.npc(giver); self.walk(g[0], g[1]); log('hand in', (self.r("return await talk(%r)" % giver) or [])[-3:])
            after = json.dumps((self.st().get('q') or {}).get(qid))
            if after == before: bug('%s step %d' % (qid, q['step']), 'no progress after a full attempt (%s %s x%d)' % (kind, G[kind], need), self.st())
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
DEFENCE_GOAL = 10   # wolves hunt in packs; defence 10 also opens the tier-2 armour
FIGHT_FOOD = 5      # cooked food carried into any fight with a monster of level 5 or more
def toughen(b):
    """before the quests (2026-10-06: "Once he has reached the experience where he can kill a rat in one or two
    blows, and he has the best armor that he can wear he should start the wolf quest"): train strength on rats until his
    best hit is half a rat's health (two blows), and wear the best armour his defence allows"""
    rat_hp = MONS.get('rat', {}).get('hp', 5); need = -(-rat_hp // 2)
    while b.time_left():
        mh = b.r("return ASH.core.maxHit(ASH.me)") or 0
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
        for qid in live:
            if not b.time_left(): break
            before = json.dumps((b.st().get('q') or {}).get(qid))
            tries[qid] = tries.get(qid, 0) + 1
            try: b.quest(qid)
            except Exception as exc: notes[qid] = 'crashed: %s' % str(exc)[:120]; log('quest', qid, 'crashed', exc)
            moved = json.dumps((b.st().get('q') or {}).get(qid)) != before
            still[qid] = 0 if moved else still.get(qid, 0) + 1
            if still[qid] == 3: notes[qid] = 'stuck: 3 attempts without progress. ' + LAST_BUG.get(qid, ''); log('set aside as stuck', qid)
            report_quests(b, tries, notes)
    return False
if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('MINUTES=')]
    mins = next((float(x[8:]) for x in sys.argv[1:] if x.startswith('MINUTES=')), 45)
    if not a: print(__doc__); sys.exit()
    with LiveGame('cinderwalker') as g:
        b = Bot(g, mins); b.r("ASH.core.cmd('me', { c: 'look', name: 'Cinderwalker' }); return 1")
        cmd = a[0]; log('#### bot', ' '.join(a), 'for', mins, 'min')
        if cmd == 'status': log('status', json.dumps(b.r("return report('status')"), default=str)[:1500])
        elif cmd == 'money': b.money(int(a[1]) if len(a) > 1 else 60)
        elif cmd == 'gear': b.gear()
        elif cmd == 'train': b.gear(); b.train(a[1], int(a[2]))
        elif cmd == 'quest': b.unpack(); b.gear(); b.prepare(); b.quest(a[1])
        elif cmd == 'earn': b.earn(int(a[1]) if len(a) > 1 else 40, 4); b.gear()
        elif cmd == 'all':
            b.unpack(); b.gear(); b.prepare(); toughen(b) and play_all(b)
        log('#### end', json.dumps(b.r("return report('end')"), default=str)[:800])
