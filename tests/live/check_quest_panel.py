"""check_quest_panel.py - the Quests panel must say what the quest actually asks for, in words that read properly.

@cinderwalker reported it twice (2026-10-05): a bring step rendered as "slay 8 undefineds", and every quest the player
had not started said "Speak to Elder Maren" whatever the real giver was. Fixing that (registry v53) then printed
"bring 8 logses" - so this check no longer trusts the game's own wording at all.

The browser is asked to draw the real panel over every quest and every step and hand back each line beside the raw
inputs it came from (giver id, goal id, count, progress). What the line SHOULD say is rebuilt here, in Python, from the
name maps the page returns - grammar written out again from scratch rather than copied from the JS. The previous
version built its expectation with a Python clone of the shipped pluraliser, so it agreed when the shipped
pluraliser turned "Logs" into "logses". That is the hole this closes.

  PLAYWRIGHT_BROWSERS_PATH=/home/you/.cache/ms-playwright python3 tests/live/check_quest_panel.py
Exit 0 = every line of the live panel is exactly what that step should say."""
import sys, os, json, re
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ST = json.load(open(os.path.join(HERE, 'chain', 'modules.json')))
TX = sys.argv[1] if len(sys.argv) > 1 else ST['launcher']
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
READY = '!!(window.ASH && ASH.me && ASH.core && ASH.core.D && ASH.core.D.quests && ASH.hud)'
# Words that are the same at any count. Everything else takes no ending when its last word already ends in s.
IRREGULAR = {'deer', 'trout', 'salmon', 'fish', 'cod', 'plaice', 'bream', 'sheep'}


def many(word, n):
    if n <= 1:
        return word
    last = word[word.rindex(' ') + 1:] if ' ' in word else word
    if last in IRREGULAR or last.endswith('s'):
        return word
    if last.endswith('f'):
        return word[:-1] + 'ves'
    if re.search(r'(x|z|ch|sh)$', last):
        return word + 'es'
    return word + 's'


JS = r"""(() => {
  try {
    const Q = ASH.core.D.quests.quests, NM = {}, out = [];
    for (const z of ASH.core.D.zones || []) for (const n of z.npcs || []) if (!(n.id in NM)) NM[n.id] = n.name;
    const hold = JSON.parse(JSON.stringify(ASH.me.quests || {}));
    // the panel draws each quest as <div class="r|g|y">Name</div> followed by <div class="info">the line</div>
    const draw = (name) => { ASH.hud.setTab('inv'); ASH.hud.setTab('quest');
      const el = document.querySelector('.ash .panel'); if (!el) return '(no panel drawn)';
      const hs = [...el.querySelectorAll('div')].filter(d => /^(r|g|y)$/.test(d.className));
      const h = hs.find(d => d.textContent.trim() === name);
      if (!h) return '(that quest was not drawn)';
      return h.nextElementSibling ? h.nextElementSibling.textContent : '(no line under the quest name)'; };
    for (const id in Q) {
      const n = Q[id].steps.length;
      for (let s = 0; s <= n + 1; s++) {
        ASH.me.quests = JSON.parse(JSON.stringify(hold));
        if (s === 0) delete ASH.me.quests[id];
        else ASH.me.quests[id] = { step: s, n: (s > n) ? 1 : 0 };
        const st = Q[id].steps[s - 1], g = st ? st.goal : null;
        out.push({ q: Q[id].name, step: s, giver: Q[id].giver, drawn: draw(Q[id].name),
                   kind: !s ? 'unstarted' : (!g ? 'completed' : (s > n ? 'return'
                         : (g.kill ? 'slay' : g.bring ? 'bring' : g.talk ? 'talk' : 'ask'))),
                   goal: g ? (g.kill || g.bring || g.talk || '') : '', n: g ? (g.n || 1) : 1 });
      }
    }
    ASH.me.quests = hold; draw('x');
    return { out, n: Object.keys(Q).length, npcs: NM,
             mon: Object.entries((ASH.core.D.monsters || {}).monsters || ASH.core.D.monsters || {})
                  .map(([k, m]) => [String(k), String(m.name)]),
             items: Object.entries((ASH.core.D.items || {}).items || ASH.core.D.items || {})
                   .map(([k, i]) => [String(k), String(i.name)]) };
  } catch (e) { return { err: String(e) }; }
})()"""
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1100, 'height': 650}); errs = []
    pg.on('console', lambda m: m.type == 'error' and 'cloudflareinsights' not in m.text and errs.append(m.text[:160]))
    pg.goto('https://app.dogecoinarcade.com/inscriptions/' + TX + '/full')
    got = None
    for _ in range(80):
        for f in pg.frames:
            try:
                if f.evaluate(READY): got = f.evaluate(JS)
            except Exception:
                pass
        if got: break
        pg.wait_for_timeout(1500)
    b.close()
if not got: print('FAIL: the live game never booted far enough to draw a panel', errs); sys.exit(1)
if 'out' not in got: print('FAIL: drawing the panel threw', got); sys.exit(1)
NM = got['npcs']
MON = dict(got['mon'])
ITEMS = dict(got['items'])


def who(i):
    return NM.get(i) or i or 'the one who gave it'


bad, givers = [], set()
for row in got['out']:
    got_text = ' '.join((row['drawn'] or '').split())
    tag = row['q'] + ' (' + row['kind'] + (' ' + str(row['step']) if row['step'] else '') + ')'
    if row['kind'] == 'unstarted':
        want = 'Speak to %s.' % who(row['giver'])
        if row['giver'] not in NM:
            bad.append(tag + ': the giver "%s" is not an NPC anywhere in the live zones' % row['giver'])
        givers.add(who(row['giver']))
    elif row['kind'] == 'completed':
        want = 'Completed!'
    elif row['kind'] == 'return':
        want = 'Return to %s.' % who(row['giver'])
        if row['giver'] not in NM:
            bad.append(tag + ': the giver "%s" is not an NPC anywhere in the live zones' % row['giver'])
    elif row['kind'] in ('slay', 'bring'):
        table, kind = (MON, 'monster') if row['kind'] == 'slay' else (ITEMS, 'item')
        name = table.get(str(row['goal']))
        if name is None:
            bad.append(tag + ': step %d wants a %s called %s, which the live game does not have'
                       % (row['step'], kind, row['goal']))
            continue
        want = 'Step %d: %s %s (0/%d).' % (row['step'], row['kind'], many(str(name).lower(), row['n']), row['n'])
    elif row['kind'] == 'talk':
        want = 'Step %d: talk to %s%s.' % (row['step'], who(row['goal']),
                                          ' %d times' % row['n'] if row['n'] > 1 else '')
        if row['goal'] not in NM:
            bad.append(tag + ': step %d sends the player to "%s", who is not an NPC' % (row['step'], row['goal']))
    else:
        want = 'Step %d: ask %s what is left to do (0/%d).' % (row['step'], who(row['giver']), row['n'])
    if want != got_text:
        bad.append(tag + ': printed "' + got_text + '" - it should say "' + want + '"')
print('%d quests, %d panel lines drawn from the live registry' % (got['n'], len(got['out'])))
print('unstarted quests send the player to:', ', '.join(sorted(givers)) or '(nobody - no giver lines!)')
for line in bad[:20]: print('FAIL:', line)
print('OK' if not bad else '%d problems' % len(bad))
sys.exit(0 if not bad else 1)
