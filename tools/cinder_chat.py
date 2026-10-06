"""cinder_chat.py - @cinderwalker reads ASHVALE's chat and answers players, quickly (2026-10-05: "Make it so
@cinderwalker watches the chat and responds to it quickly ... It's a bot playing the game.").

LiveGame (tools/live_play.py) installs this when it plays as @cinderwalker, so every bot routine (tools/bot.py,
bot_loop.sh) chats while it plays. Inside the game the chat panel is wrapped: a line from ANOTHER player
(kind 'player', not our own) is handed to Python through a Playwright binding, which asks the local model
(the same endpoint @ashvale's daily answers use) for one short in-character line, and the game says it
(ASH.say: the room hears it, a speech bubble shows). A reply usually lands within ~3 s while the bot is busy in a
routine: Playwright serves the binding during the routine's own calls.

Guards: one reply at a time; at most one every 6 s and 8 a minute; nothing to our own lines or the game's system
lines; 120 characters (what ASH.say carries); facts only from tools/ashvale_facts.md -- if it does not know, it
says so rather than inventing. Every exchange is logged to chain/cinder_chat.log.
"""
import json, os, re, time, urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(HERE, 'chain', 'cinder_chat.log')
FACTS = os.path.join(HERE, 'tools', 'ashvale_facts.md')
LLM = 'http://127.0.0.1:18300/v1/chat/completions'
BANNED = re.compile(r'rune\s*scape|elder\s*scrolls|skyrim|oblivion|diablo|old\s*school', re.I)

SYSTEM = """You are Cinderwalker, a player character in ASHVALE, controlled by a bot program (if someone asks, say
plainly that a bot plays you). You are a real character in the world: you have a position, levels, a bag, gear,
gold and quests -- they are in MY CHARACTER below, and when asked about them you answer from it exactly.
Players talk to you in the game's chat. Answer in ONE short, friendly line, at most 110 characters, plain text, no
quotes around it.

ACCURACY RULES (most important):
- Every fact you state must come from GAME FACTS or MY CHARACTER below. Numbers, names, places, prices, levels,
  distances: copy them, never estimate or round into something new.
- If the answer is not there, say you're not sure (e.g. "Not sure, sorry - haven't seen that yet"). Never guess,
  never invent places, monsters, items, people or features, never say where something "might" be.
- GAME FACTS beat GENERAL NOTES where they disagree.
- Never mention or compare to any other game by name. No promises about money or value.
- If the line needs no answer (not a question or request, "lol", "brb", insults), answer exactly SKIP.

MY CHARACTER (live, right now):
{me}

GAME FACTS (from the live game's own data):
{facts}

GENERAL NOTES (about the arcade and the game; may be older):
{notes}"""


def _log(*a):
    line = time.strftime('%m-%d %H:%M:%S ') + ' '.join(str(x) for x in a)
    try:
        open(LOG, 'a').write(line + '\n')
    except Exception:
        pass


GAME_FACTS = None   # built once per browser from the live game's data (install), else from data/


def _facts():
    global GAME_FACTS
    if GAME_FACTS is None:
        try:
            import cinder_facts; GAME_FACTS = cinder_facts.facts()
        except Exception as exc:
            _log('facts from data/ failed:', exc); GAME_FACTS = ''
    return GAME_FACTS


def _notes():
    try:
        return open(FACTS).read()[:5000]
    except Exception:
        return '(none)'


BOT_LOG = os.path.join(HERE, 'chain', 'bot.log')


def _doing():
    """what the bot is busy with: the last few lines of its log, without the timestamps"""
    try:
        lines = [l[9:].strip() for l in open(BOT_LOG).read().splitlines()[-40:] if not l[9:].startswith(('levels at start', '#### end'))]
        return ' / '.join(lines[-4:])[:400]
    except Exception:
        return 'unknown'


def _me_text(me):
    if not me:
        return '(not available right now: if asked about yourself, say you are not sure)'
    return json.dumps(me, ensure_ascii=False)[:2500] + '\nWhat the bot is doing right now (its log): ' + _doing()


def ask(history, who, text, me=None):
    """One reply to `who` saying `text`, given the recent chat and his own live state; '' to stay quiet."""
    convo = '\n'.join(history[-10:] + [f'{who}: {text}'])
    body = {"model": "qwen3.8-flash-next", "priority": 3, "temperature": 0.2, "max_tokens": 90,
            "chat_template_kwargs": {"enable_thinking": False},
            "messages": [{"role": "system", "content": SYSTEM.format(facts=_facts(), notes=_notes(), me=_me_text(me))},
                         {"role": "user", "content": "The chat so far:\n" + convo + "\n\nYour one line:"}]}
    try:
        r = urllib.request.urlopen(urllib.request.Request(LLM, json.dumps(body).encode(),
                                                          {'Content-Type': 'application/json'}), timeout=20)
        out = json.loads(r.read())['choices'][0]['message']['content']
    except Exception as exc:
        _log('LLM failed:', exc)
        return ''
    out = re.sub(r'<think>.*?</think>', '', out, flags=re.S).strip().strip('"').splitlines()[0].strip() if out else ''
    if not out or out.upper().startswith('SKIP') or BANNED.search(out):
        return ''
    return out[:118]


JS = r"""
(() => {
  if (!window.ASH || !ASH.hud || window.__cinderChat) return 'not ready';
  window.__cinderChat = true;
  const me = () => (ASH.me && ASH.me.name) || 'Cinderwalker';
  const state = () => { try {   // his own character, as the game has it this moment
    const p = ASH.me, C = ASH.core, nm = k => (C.item(k) || {}).name || k, lv = {}, bag = {}, worn = {}, qs = {};
    for (const k in p.xp) lv[k] = C.lv(p, k);
    for (const q of p.inv) if (q) bag[nm(q.id)] = (bag[nm(q.id)] || 0) + (q.n || 1);
    for (const sl in p.eq) if (p.eq[sl]) worn[sl] = nm(p.eq[sl].id);
    const Q = (C.D.quests && C.D.quests.quests) || C.D.quests || {};
    for (const id in Q) { const q = (p.quests || {})[id], n = (Q[id].steps || []).length;
      qs[Q[id].name] = !q ? 'not started' : q.step > n ? 'done' : 'step ' + q.step + ' of ' + n + ' (' + (q.n || 0) + ' so far)'; }
    let chest = {}; try { const c = ASH.chest.state().chest; for (const k in c) chest[nm(k)] = c[k]; } catch (e) {}
    return { name: me(), zone: (C.M.zoneAt && C.M.zoneAt(p.x, p.y)) || 'the wild country', at: [p.x, p.y], hp: p.hp + '/' + C.maxHp(p),
      combat_level: C.combatLevel(p), levels: lv, best_hit: C.maxHit(p), carrying: bag, wearing: worn, chest, quests: qs,
      portals_touched: Object.keys(p.attuned || {}), dead: !!p.dead };
  } catch (e) { return null; } };
  const history = [], queue = [];
  let busy = false, last = 0, minute = [];
  const original = ASH.hud.chat.bind(ASH.hud);
  ASH.hud.chat = function (text, kind) {
    const r = original(text, kind);
    try {
      if (kind === 'player' && typeof text === 'string') {
        const m = /^(.+?) \((@[a-z0-9_]+|guest)\): (.*)$/i.exec(text) || /^(.+?): (.*)$/.exec(text);
        const who = m ? (m.length === 4 ? m[1] + ' (' + m[2] + ')' : m[1]) : 'someone';
        const said = m ? m[m.length - 1] : text;
        history.push(who + ': ' + said); if (history.length > 20) history.shift();
        // Our own lines are drawn as "Name: text" (engine say()); everybody else's as "Name (@tag): text".
        // 2026-10-06: he answers only when someone tags @cinderwalker in the line (he still reads everything for context)
        if (!text.startsWith(me() + ': ') && /@cinderwalker\b/i.test(said)) { queue.push([who, said]); pump(); }
      }
    } catch (e) { /* never break the game's chat */ }
    return r;
  };
  async function pump() {
    if (busy || !queue.length || typeof window.cinderAsk !== 'function') return;
    const now = Date.now();
    minute = minute.filter(t => now - t < 60000);
    if (now - last < 6000 || minute.length >= 8) { setTimeout(pump, 6000 - (now - last) + 50); return; }
    const [who, said] = queue.pop(); queue.length = 0;      // the newest line; older ones are moot
    busy = true; last = now;
    try {
      const reply = await window.cinderAsk(JSON.stringify(history.slice(0, -1)), who, said, JSON.stringify(state()));
      if (reply) { minute.push(Date.now()); ASH.say(reply); history.push(me() + ': ' + reply); }
    } catch (e) { /* the model or the binding was away: say nothing */ }
    busy = false;
    if (queue.length) setTimeout(pump, 500);
  }
  return 'ok';
})()
"""


def install(game):
    """Hook a LiveGame (tools/live_play.py) up to answer chat. Safe to call once per browser."""
    pg = game.B.pg

    def cinder_ask(history_json, who, said, me_json=None):
        try:
            history = json.loads(history_json) if history_json else []
        except Exception:
            history = []
        try:
            me = json.loads(me_json) if me_json else None
        except Exception:
            me = None
        t = time.time()
        reply = ask(history, who, said, me)
        _log(f'{who}: {said!r} -> {reply!r} ({time.time() - t:.1f}s)')
        return reply

    try:
        pg.expose_function('cinderAsk', cinder_ask)
    except Exception as exc:          # already exposed on this page
        _log('expose:', exc)
    global GAME_FACTS
    try:
        import cinder_facts
        GAME_FACTS = cinder_facts.facts(game.fr.evaluate(cinder_facts.LIVE_JS))
        _log('facts from the live game: %d characters' % len(GAME_FACTS))
    except Exception as exc:
        _log('live facts failed, using data/:', exc)
    try:
        said = game.fr.evaluate(JS)
        _log('chat watch installed:', said)
    except Exception as exc:
        _log('install failed:', exc)
