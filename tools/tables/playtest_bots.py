"""[Claude 2026-10-21] Bot players for the clubhouse tables playtest (the operator: "Add some bot players to the simulation" / "To my mock up").
Only the playtest knows about them: each bot is a pretend wallet that says the same words to the real @ashvale Bank table code a browser
says (tbin with its send, tbsit, tbbet, tbact, tbins, tbout), so their GOLD, chips and cards go through the Bank like anyone's. The
playtest page draws them standing at their spots (GET /bots, injected as room players). They come and go, and always leave spots free.
    start(word, C, LOCK, TB)   word(addr, msg) = what the server does with a browser's POST /bank
    seated()                   -> [{id, name, tbl, spot, o}] for the page"""
import random, time, threading, os

TARGET = {'cd1': 3, 'cw1': 2, 'cb1': 3, 'cb2': 2}   # bots wanted at each table
FREE = 2                                            # spots always left open for real players
NAMES = ['Ada', 'Finn', 'Mira', 'Oskar', 'Wren', 'Tobias', 'Nell', 'Rory', 'Isolde', 'Bram', 'Cora', 'Ewan', 'Freya', 'Hugo', 'Lena', 'Milo',
         'Pia', 'Quinn', 'Saoirse', 'Tam', 'Una', 'Viggo', 'Ylva', 'Zane']
SKIN = ['#f1c9a5', '#e0b48c', '#c68e5e', '#a86f45', '#7a4a2a', '#5a3620']
HAIRC = ['#2a1a10', '#6a3a1a', '#b07a3a', '#d8c08a', '#8a2a1a', '#cfcfcf', '#141414']
CLOTH = ['#3f5d8a', '#a83030', '#2f6a4a', '#8a6a4a', '#f2f0ea', '#2a3346', '#6e4a7a', '#c9a24a', '#4a4a4a']
BOTS, R = [], random.Random()

def outfit(i):
    f = R.random() < 0.5
    return {'body': 'female' if f else 'male', 'skin': R.choice(SKIN), 'hairColor': R.choice(HAIRC), 'eyes': R.choice(['#3a5a8a', '#4a3a20', '#3a6a3a']),
            'hair': R.choice(['ponytail', 'bun', 'long', 'braids', 'curly']) if f else R.choice(['short', 'curly', 'bald', 'loose']),
            'shirt': {'style': R.choice(['shirt', 'tunic', 'polo', 'vest', 'tweed']), 'color': R.choice(CLOTH)},
            'pants': {'style': R.choice(['skirt', 'pleated', 'trousers']) if f else R.choice(['trousers', 'trousers', 'shorts']), 'color': R.choice(CLOTH)},
            'boots': R.choice(['#3a2a1a', '#141414', '#6a4a2a']), 'belt': R.choice(['#2a1a10', '#6a4a2a'])}

def hand_val(cards):
    t, a = 0, 0
    for c in cards:
        r = c[0]; t += 11 if r == 'A' else 10 if r in 'TJQK' else int(r); a += r == 'A'
    while t > 21 and a: t -= 10; a -= 1
    return t, a > 0

def strategy(cards, up, legal):   # basic strategy, six decks: split, double, then hit or stand
    u = 11 if up[0] == 'A' else 10 if up[0] in 'TJQK' else int(up[0])
    t, soft = hand_val(cards); two = len(cards) == 2
    want = None
    if two and legal.get('split') and cards[0][0] == cards[1][0]:
        p = cards[0][0]; p = 'T' if p in 'TJQK' else p
        if p in 'A8' or (p == '9' and u not in (7, 10, 11)) or (p in '732' and u <= 7) or (p == '6' and u <= 6) or (p == '4' and u in (5, 6)): want = 'split'
    if not want and soft:
        if t >= 19: want = 'stand'
        elif t == 18: want = 'double' if 3 <= u <= 6 else 'stand' if u in (2, 7, 8) else 'hit'
        else: want = 'double' if (u in (5, 6) or (t == 17 and u in (3, 4))) else 'hit'
    if not want:
        if t >= 17: want = 'stand'
        elif t >= 13: want = 'stand' if u <= 6 else 'hit'
        elif t == 12: want = 'stand' if 4 <= u <= 6 else 'hit'
        elif t == 11: want = 'double'
        elif t == 10: want = 'double' if u <= 9 else 'hit'
        elif t == 9: want = 'double' if 3 <= u <= 6 else 'hit'
        else: want = 'hit'
    if want == 'double' and not legal.get('double'): want = 'stand' if soft and t >= 18 else 'hit'
    if not legal.get(want): want = 'stand' if legal.get('stand') else None
    return want

class Bot:
    def __init__(self, tbl, name):
        self.tbl, self.name = tbl, name
        self.addr = ('nPlaytestBot' + name + 'XXXXXXXXXXXXXXXXXXXXXXXX')[:34]
        self.s = 'tb:%s:%s' % (tbl, os.urandom(8).hex())
        self.o, self.st, self.spot = outfit(0), 'new', None
        self.leave_at = time.time() + R.uniform(150, 420); self.bet_r = -1; self.bet_at = None; self.act_at = None; self.gone_at = None; self.hand_r = -1; self.ready_at = 0

def start(word, C, LOCK, TB):
    def q_of(b): return int(TB.sitting(C, b.s)['q']) + 1
    def say(b, t, **kw):
        T = TB.table_row(C, b.tbl); m = dict(kw, t=t, v=1, s=b.s)
        if t in ('tbbet', 'tbact', 'tbins'): m.update(q=q_of(b), r=int(T['round']))
        return word(b.addr, m)
    def taken(tbl): return {int(x['spot']) for x in C.execute("select spot from tb where tbl=? and spot is not null and st in ('open','closing')", (tbl,)).fetchall()}
    def spots_at(tbl): return TB.SPOTS_AT.get(tbl, TB.SPOTS)
    def join(b):
        did = os.urandom(6).hex(); n = 400
        say(b, 'tbin', n=n, id=did); say(b, 'tbin', n=n, id=did, tx=os.urandom(32).hex())
        free = [p for p in range(1, spots_at(b.tbl) + 1) if p not in taken(b.tbl)]
        if len(free) <= FREE: b.st = 'leave'; return
        b.spot = R.choice(free); say(b, 'tbsit', p=b.spot)
        b.st = 'seated' if TB.sitting(C, b.s)['spot'] == b.spot else 'leave'
    def bets(b, T, st):
        g = T['game']
        if g == 'dice':
            seat = st['seats'].get(b.s) or {}; on = seat.get('bets') or {}
            if not st['point']:
                if not on.get('pass'): say(b, 'tbbet', k='pass', n=R.choice([5, 5, 10]))
                if R.random() < 0.3: say(b, 'tbbet', k='field', n=5)
            else:
                if on.get('pass') and not on.get('odds'): say(b, 'tbbet', k='odds', n=10)
                if R.random() < 0.4: say(b, 'tbbet', k='come', n=5)
                if R.random() < 0.2: say(b, 'tbbet', k='field', n=5)
        elif g == 'wheel':
            say(b, 'tbbet', k=R.choice(['red:', 'black:', 'odd:', 'even:', 'low:', 'high:']), n=R.choice([5, 10]))
            if R.random() < 0.5: say(b, 'tbbet', k='s:%d' % R.randint(0, 36), n=R.choice([1, 2, 5]))
            if R.random() < 0.4: say(b, 'tbbet', k='doz:%d' % R.randint(1, 3), n=5)
        else:
            say(b, 'tbbet', k='main', n=R.choice([10, 10, 20, 25]))
    def step(b, now):
        if b.st == 'new': join(b); return
        if b.st == 'leave':
            say(b, 'tbout'); b.st = 'gone'; b.gone_at = now; return
        if b.st != 'seated': return
        r = TB.sitting(C, b.s)
        if not r or r['st'] != 'open' or r['spot'] is None: b.st = 'gone'; b.gone_at = now; return
        if now - (getattr(b, 'hb', 0) or 0) > 5: b.hb = now; say(b, 'tb?', v=2)   # [Claude 2026-10-22] there every 5 s, as the game (the Bank stands up a sitting quiet for 15 s)
        T = TB.table_row(C, b.tbl); st = TB.json.loads(T['state']); g = T['game']
        Rh = st.get('R') if g == 'twentyone' else None; in_hand = bool(Rh and b.s in Rh['spots'] and not Rh.get('settled'))
        if (now > b.leave_at or int(r['credit']) < 30) and T['phase'] in ('bet', 'idle', 'show') and not in_hand: b.st = 'leave'; return
        if T['phase'] == 'bet' and b.bet_r != int(T['round']):
            if b.bet_at is None: b.bet_at = now + R.uniform(0.4, 1.8)
            elif now >= b.bet_at: bets(b, T, st); b.bet_r = int(T['round']); b.bet_at = None
        if in_hand and b.hand_r != int(T['round']):   # a new hand: the game deals it one card at a time - wait until it is on the felt
            b.hand_r = int(T['round']); b.ready_at = now + TB.DEAL_S * (len(Rh['dealer']) + sum(len(h['cards']) for v in Rh['spots'].values() for h in v['hands'])) + 0.6
        if in_hand and now >= b.ready_at:
            me = Rh['spots'][b.s]
            if Rh['phase'] == 'insurance' and me.get('ins') is None: say(b, 'tbins', y=0)
            elif Rh['phase'] == 'play' and Rh.get('turn') == b.s:
                if b.act_at is None: b.act_at = now + R.uniform(1.2, 2.6)
                elif now >= b.act_at:
                    b.act_at = None; h = me['hands'][me['cur']]
                    legal = TB.rules('twentyone', 'legal', R=Rh, sn=b.s, credit=int(r['credit']))['acts']
                    a = strategy(h['cards'], Rh['dealer'][0], legal)
                    if a: say(b, 'tbact', a=a)
            else: b.act_at = None
    nxt = {t: time.time() + R.uniform(0.5, 4) for t in TARGET}
    def loop():
        while True:
            time.sleep(0.4); now = time.time()
            with LOCK:
                try:
                    for b in list(BOTS):
                        step(b, now)
                        if b.st == 'gone' and now - (b.gone_at or now) > 2: BOTS.remove(b)
                    for tbl, want in TARGET.items():   # someone new now and then, while spots stay free
                        here = [b for b in BOTS if b.tbl == tbl and b.st != 'gone']
                        if len(here) < want and now >= nxt[tbl] and spots_at(tbl) - len(taken(tbl)) > FREE:
                            used = {b.name for b in BOTS}; BOTS.append(Bot(tbl, R.choice([n for n in NAMES if n not in used])))
                            nxt[tbl] = now + R.uniform(4, 12)   # the next one a few seconds later (a gap someone left fills in time)
                except Exception as e: print('bots', repr(e), flush=True)
    threading.Thread(target=loop, daemon=True).start()

def seated():
    return [{'id': 'bot-' + b.name.lower(), 'name': '@Bot ' + b.name, 'tbl': b.tbl, 'spot': b.spot, 'o': b.o} for b in BOTS if b.st == 'seated' and b.spot]
