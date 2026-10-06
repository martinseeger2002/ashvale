"""ashvale_daily.py - @ashvale reads its notifications and messages once a day and answers them (2026-10-01:
"Have @ashvale check and respond to messages and notifications once a day").

  ashvale_daily.py              the daily pass: gather notifications + DMs + comments on our posts, answer real people
  ashvale_daily.py --dry        gather and decide, print the answers, send nothing
  ashvale_daily.py --post FILE  post an announcement (FILE: one post per paragraph, each <= 280 chars; replies thread it)

@ashvale is the game's own account, not a Ghost Devs character: it speaks plainly as the keeper of ASHVALE, from the facts
in tools/ashvale_facts.md (keep that file current after every release). Public text never names other games
(2026-10-01). Bug reports and wishes from players are appended to handoff/player_reports.md for the dev agents.
Timer: ashvale-daily.timer (daily 18:00). Memory: chain/ashvale_mem.json. Reuses ghost-devs resident.py's gather()."""
import sys, os, json, time, re, urllib.request
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '/home/you/cartoon-toolkit/ghost-devs/tools')
import resident as R
from drvc import start, login, By

MEM = os.path.join(HERE, 'chain', 'ashvale_mem.json')
FACTS = os.path.join(HERE, 'tools', 'ashvale_facts.md')
REPORTS = os.path.join(HERE, 'handoff', 'player_reports.md')
DRY = '--dry' in sys.argv
BANNED = re.compile(r'rune\s*scape|elder\s*scrolls|skyrim|oblivion|diablo|old\s*school', re.I)
MAX_ANSWERS = 12

SYSTEM = """You are @ashvale, the keeper of ASHVALE: a 3D fantasy adventure game inscribed on DogecoinArcade.com
(open it from the Games tab). You answer players once a day: warm, plain, short, helpful. You are not a story character.
Use ONLY the facts below. If you don't know, say you'll pass it to the developers; never invent features, dates or
prices. Never mention or compare to any other game by name. No promises of money or value.
Bug reports and feature wishes: thank them, say it's passed to the developers, and add it to "reports".

FACTS:
{facts}

Return ONLY JSON: {{"answers": [{{"do": "reply"|"dm", "link": "<link copied exactly from the item, for reply>",
"to": "<@name, for dm>", "text": "<= 280 chars (dm <= 500)"}}], "reports": ["<one line per bug/wish, with who said it>"]}}
Answer every real person who asked or said something to you. Skip pure likes/follows and the Ghost Devs characters'
chatter unless they asked you something. A private conversation is answered with a dm to that person."""


def jload(p, d):
    try: return json.load(open(p))
    except Exception: return d


def clean(t, n):
    t = re.sub(r'\s+', ' ', str(t or '')).strip()[:n]
    return None if not t or BANNED.search(t) else t


def post(d, text):
    d.get(R.APP + '/feed'); time.sleep(8)
    d.find_element(By.ID, 'account-say').send_keys(text[:280]); d.find_element(By.ID, 'account-post').click(); time.sleep(6)
    R.confirm_card(d)


def main():
    mem = jload(MEM, {"seen": [], "posts": [], "people": {}, "budget": {}})
    d = start('ashvale'); login(d, 'ashvale')
    try:
        if '--post' in sys.argv:
            parts = [p.strip() for p in open(sys.argv[sys.argv.index('--post') + 1]).read().split('\n\n') if p.strip()]
            for p in parts:
                if len(p) > 280 or BANNED.search(p): print('REFUSED (too long or names another game):', p[:80]); return
            if '--thread-only' not in sys.argv:
                post(d, parts[0]); print('posted:', parts[0][:80], flush=True)
                mem['posts'].append({'date': R.now(), 'text': parts[0]})
            if len(parts) > 1:   # the rest as replies under that post (feed posts link as /feed?post=<data-key>)
                d.get(R.APP + '/feed'); time.sleep(8)
                key = d.execute_script("""for (const p of document.querySelectorAll('.feedpost'))
                    if ((p.innerText || '').includes(arguments[0])) return p.dataset.key; return null;""", parts[0][:60])
                if not key: print('could not find the post to thread under'); return
                link = R.APP + '/feed?post=' + key
                for p in parts[1:]:
                    print('reply:', _reply(d, link, p), flush=True)
            json.dump(mem, open(MEM, 'w'), indent=1); return
        items, feed = R.gather(d, "ashvale", mem)
        items = [i for i in items if 'a tester' not in i.get('text', '').lower()]   # the help bot is never answered (2026-09-29)
        if DRY:
            for i in items: print("ITEM", json.dumps(i, ensure_ascii=False)[:400], flush=True)
        mem['last_check'] = R.now()
        if not items:
            print('nothing new', flush=True); json.dump(mem, open(MEM, 'w'), indent=1); return
        out = R.ask_llm_obj(SYSTEM.format(facts=open(FACTS).read()), json.dumps({
            'whats_new_for_you': items, 'your_last_answers': [p.get('text', '')[:160] for p in mem['posts'][-10:]]}, ensure_ascii=False), temp=0.4)
        for a in (out.get('answers') or [])[:MAX_ANSWERS]:
            k = a.get('do'); text = clean(a.get('text'), 500 if k == 'dm' else 280)
            if not text: print('skipped (empty or names another game)', a, flush=True); continue
            if DRY: print('DRY', k, a.get('link') or a.get('to'), '|', text, flush=True); continue
            if k == 'dm' and a.get('to'): r = _dm(d, a['to'], text)
            elif k == 'reply' and a.get('link'): r = _reply(d, a['link'], text)
            else: r = 'skipped'
            print(k, a.get('link') or a.get('to'), r, '|', text[:100], flush=True)
            mem['posts'].append({'date': R.now(), 'to': a.get('link') or a.get('to'), 'text': text})
        reps = [str(x)[:300] for x in (out.get('reports') or []) if str(x).strip()]
        if reps and not DRY:
            with open(REPORTS, 'a') as f:
                for x in reps: f.write(f'- {R.now()} {x}\n')
        mem['posts'] = mem['posts'][-200:]
        if not DRY: json.dump(mem, open(MEM, 'w'), indent=1)
    finally:
        d.quit()


def _dm(d, to, text):
    d.get(R.APP + '/me/messages?to=' + urllib.request.quote(to)); time.sleep(12)
    box = [e for e in d.find_elements(By.ID, 'body') if e.is_displayed()]
    if not box: return 'no dm box'
    box[0].send_keys(text[:500])
    [b for b in d.find_elements(By.XPATH, "//button[normalize-space(.)='Send']") if b.is_displayed()][-1].click(); time.sleep(6)
    R.confirm_card(d); return 'ok'


def _reply(d, link, text):
    if link.startswith('comment:'):
        cid = link[8:]
        d.get(R.COMMENT_URL.get(cid) or R.APP + f'/feed?post={cid}'); time.sleep(10)
        for b in d.find_elements(By.XPATH, "//button[contains(normalize-space(.),'comment') and not(starts-with(normalize-space(.),'Hide'))]"):
            try: d.execute_script("arguments[0].click()", b); time.sleep(1)
            except Exception: pass
        rb = d.find_elements(By.XPATH, f"//button[contains(@onclick,'reply-{cid}') or contains(@onclick,'r-{cid}')]")   # feed: reply-<id>, launch pages: r-<id>
        if not rb: return 'comment not found'
        d.execute_script("arguments[0].scrollIntoView({block:'center'}); arguments[0].click()", rb[0]); time.sleep(2)
        f = (d.find_elements(By.ID, f'reply-{cid}') or d.find_elements(By.ID, f'r-{cid}'))[0]; f.find_element(By.CSS_SELECTOR, 'input[name=text],textarea[name=text]').send_keys(text[:280])
        d.execute_script('arguments[0].click()', f.find_element(By.CSS_SELECTOR, 'button[type=submit]')); time.sleep(6); return 'ok'
    url = link if link.startswith(R.APP) else f"{R.APP}/u/{link.lstrip('@')}"
    d.get(url); time.sleep(8)
    p = [x for x in d.find_elements(By.CSS_SELECTOR, '.feedpost') if x.is_displayed()]
    if not p: return 'no post'
    rb = [x for x in p[0].find_elements(By.XPATH, ".//button[starts-with(normalize-space(.),'Reply')]") if x.is_displayed()]
    if not rb: return 'no reply button'
    rid = (rb[0].get_attribute('onclick') or "'").split("'")[1]
    d.execute_script('arguments[0].scrollIntoView({block:"center"}); arguments[0].click()', rb[0]); time.sleep(2)
    f = d.find_element(By.ID, rid); f.find_element(By.CSS_SELECTOR, 'input[name=text]').send_keys(text[:280])
    d.execute_script('arguments[0].click()', f.find_element(By.CSS_SELECTOR, 'button[type=submit]')); time.sleep(6)
    R.confirm_card(d); return 'ok'


if __name__ == '__main__':
    main()
