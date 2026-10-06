"""cinder_facts.py - the game facts @cinderwalker answers from, built from the game's own data files (2026-10-06:
"When people message him, he should be giving accurate answers").

tools/ashvale_facts.md is written by hand and goes stale; this reads data/*.json -- towns, portals, NPCs, shops and
what they sell, monsters and where they live, quests step by step, the rules for dying, respawns and cooking -- so
what he says matches the release the data belongs to. cinder_chat.py calls facts() for every reply.

  python3 tools/cinder_facts.py          print the facts
"""
import json, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda n: json.load(open(os.path.join(HERE, 'data', n + '.json')))['data']


def _attr(item, name):
    for a in item.get('attributes') or []:
        if a.get('trait_type') == name: return a.get('value')
    return None


# what the live game has loaded (ASH.core.D), trimmed to what the facts use: the released data, never the work in progress
LIVE_JS = """(() => { const D = ASH.core.D, pick = (o, ks) => { const r = {}; for (const k of ks) if (o[k] !== undefined) r[k] = o[k]; return r; };
  return { items: D.items, monsters: D.monsters, shops: D.shops, quests: D.quests, rules: D.rules,
           zones: (ASH.core.zoneIndex ? ASH.core.zoneIndex() : (D.zones || [])).map(z => pick(z, ['id', 'name', 'level', 'origin', 'size', 'start', 'spawns', 'npcs'])) }; })()"""


def local_data():
    zones = []
    for f in sorted(os.listdir(os.path.join(HERE, 'data'))):
        if f.startswith('zone.') and f.endswith('.json'): zones.append(dict(D(f[:-5]), id=f[5:-5]))
    return {'items': D('items')['items'], 'monsters': D('monsters')['monsters'], 'shops': D('shops'), 'quests': D('quests'),
            'rules': D('rules'), 'zones': zones}


def facts(data=None):
    """data: the live game's (LIVE_JS) or None for this machine's data/ files"""
    data = data or local_data()
    unwrap = lambda v, k: v.get(k, v) if isinstance(v, dict) and k in v else v
    items, mons = unwrap(data['items'], 'items'), unwrap(data['monsters'], 'monsters')
    shops, quests, rules = unwrap(data['shops'], 'shops'), unwrap(data['quests'], 'quests'), data['rules']
    zones = {z['id']: z for z in data['zones']}
    name = lambda k: (items.get(k) or {}).get('name', k)
    out = ['# ASHVALE game facts (built from the game data; positions are tiles, x grows east, y grows south)']

    out.append('\n## Places')
    centre = {}
    for zid, Z in zones.items():
        (ox, oy), (w, h) = Z.get('origin', [0, 0]), Z.get('size', [0, 0])
        centre[zid] = (ox + w // 2, oy + h // 2)
        mon = sorted({mons[s['m']]['name'] for s in Z.get('spawns', []) if s.get('m') in mons})
        out.append('- %s (%s): tiles x %d-%d, y %d-%d. %s%s' % (Z.get('name', zid), 'safe, no monsters' if Z.get('level') == 'safe' else 'monster level ' + str(Z.get('level')),
                   ox, ox + w, oy, oy + h, ('Monsters: ' + ', '.join(mon) + '. ') if mon else '', 'New players start here.' if Z.get('start') else ''))
    v = centre.get('village')
    for zid, c in centre.items():
        if v and zid != 'village':
            d = max(abs(c[0] - v[0]), abs(c[1] - v[1]))
            out.append('- %s is about %d tiles from Ashvale village%s.' % (zones[zid].get('name', zid), d, ' (a long walk: use a town portal once you have touched both)' if d > 100 else ', right next to it'))
    out.append('- Between the towns lies open wild country with roaming animals.')

    out.append('\n## Town portals')
    P = rules.get('portals') or []
    out.append('- Portals (a ring of standing stones) stand in: ' + ', '.join('%s at (%d, %d)' % (p['name'], p['x'], p['y']) for p in P) + '.')
    out.append('- Walk up and touch a portal to attune to it. From any portal you can travel to every portal you have touched. You must visit a town on foot once before you can portal there.')
    out.append('- When you die you wake at the portal of the town you were in last.')

    out.append('\n## People')
    for zid, Z in zones.items():
        count, said = {}, set()
        for n in Z.get('npcs', []):   # nine watchmen are one line
            count[n.get('name')] = count.get(n.get('name'), 0) + 1
        for n in Z.get('npcs', []):
            if count[n.get('name')] > 2:
                if n.get('name') not in said: out.append('- %s (%d of them) stand about %s' % (n.get('name'), count[n.get('name')], Z.get('name', zid))); said.add(n.get('name'))
                continue
            role = []
            if n.get('shop') and n['shop'] in shops: role.append('runs ' + shops[n['shop']].get('name', n['shop']))
            if n.get('quest') and n['quest'] in quests: role.append('gives the quest "%s"' % quests[n['quest']]['name'])
            if n.get('chest'): role.append('the town chest')
            if not role and n.get('talk') and n['talk'] != 'quest': role.append('villager')
            out.append('- %s, %s at (%d, %d): %s' % (n.get('name', n['id']), Z.get('name', zid), n['x'], n['y'], '; '.join(role) or 'villager'))

    out.append('\n## Shops (prices in GOLD before Speechcraft, which lowers them a little)')
    for sid, S in shops.items():
        stock = [k for k in S.get('stock', []) if k in items]
        rate = S.get('sellRate', 100)
        if stock:
            out.append('- %s (%s): %s' % (S.get('name', sid), S.get('keeper', '?'), ', '.join('%s %d' % (name(k), max(1, items[k].get('value', 0) * rate // 100)) for k in stock[:40])))

    out.append('\n## Monsters')
    where = {}
    for zid, Z in zones.items():
        for s in Z.get('spawns', []):
            where.setdefault(s.get('m'), set()).add(Z.get('name', zid))
    for k, m in sorted(mons.items(), key=lambda kv: kv[1].get('level', 0)):
        drops = ', '.join(name(d['item']) for d in m.get('drops', []) if d.get('item'))
        out.append('- %s: level %d, %d hp%s%s. %s' % (m.get('name', k), m.get('level', 0), m.get('hp', 0), ', drops ' + drops if drops else '',
                   ', aggressive' if m.get('aggro') else '', ('Found in ' + ', '.join(sorted(where[k])) + '.') if k in where else 'Roams the wild country.'))

    out.append('\n## Quests')
    npcname = {n['id']: (n.get('name', n['id']), Z.get('name', zid)) for zid, Z in zones.items() for n in Z.get('npcs', [])}
    for qid, Q in quests.items():
        g = npcname.get(Q.get('giver'), (Q.get('giver'), '?'))
        steps = []
        for st in Q.get('steps', []):
            if st.get('zone') and st['zone'] not in zones:   # a step in a zone not released yet cannot be reached (core gates it)
                steps.append('that is as far as it goes for now: the rest (in %s) is not open yet' % st['zone'].title()); break
            G = st.get('goal') or {}; n = G.get('n', 1)
            if 'kill' in G: steps.append('kill %d %s' % (n, (mons.get(G['kill']) or {}).get('name', G['kill'])))
            elif 'bring' in G: steps.append('bring %d %s' % (n, name(G['bring'])))
            elif 'talk' in G: steps.append('talk to %s' % npcname.get(G['talk'], (G['talk'],))[0])
            else: steps.append(json.dumps(G))
            r = st.get('reward')
            if r: steps[-1] += ' (reward: %s)' % (name(r) if r in items else str(r).replace('xp:', '').replace(':', ' xp ') if str(r).startswith('xp:') else r)
        out.append('- "%s" from %s in %s: %s.' % (Q['name'], g[0], g[1], '; then '.join(steps)))

    out.append('\n## Food and cooking')
    cooks = [(k, it) for k, it in items.items() if _attr(it, 'Cooks into')]
    out.append('- Raw food is cooked on a range or a campfire; it can burn at low Cooking. ' + '; '.join(
        '%s -> %s (Cooking %s)' % (it['name'], name(_attr(it, 'Cooks into')), _attr(it, 'Cooking level')) for k, it in cooks[:20]) + '.')
    heal = [(it['name'], _attr(it, 'Heal')) for it in items.values() if _attr(it, 'Heal')]
    out.append('- Food heals: ' + ', '.join('%s %s' % h for h in sorted(heal, key=lambda h: h[1])[:30]) + '.')

    out.append('\n## Rules')
    for k in ('death', 'respawn', 'persist'):
        if (rules.get(k) or {}).get('note'): out.append('- %s: %s' % (k, rules[k]['note']))
    out.append('- Your bag and your chest are one arcade wallet: items are real inscriptions/tokens and can be traded.')
    return '\n'.join(out)


if __name__ == '__main__':
    t = facts(); print(t); print('\n(%d characters)' % len(t))
