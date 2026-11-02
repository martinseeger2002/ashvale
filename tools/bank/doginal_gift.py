"""doginal_gift.py - the @ashvale Bank gives Doginals away (2026-11-01: "I have a bunch of Anti Doginal Dogs I'd like to give away in ashvale"; "We should be
using a shared node through arcade").

The gift wallet is an ordinary ARCADE ACCOUNT, and the Bank uses it as a player's browser does: it signs in with the account's key (/auth/challenge, /auth/login), the
arcade builds the send (/account/doginal/send: the inscribed coin input 0 and whole to the winner as output 0, fees from clean coins, the chain asked that the coin holds
exactly that Doginal) and broadcasts it (/account/sign). So the Bank talks to no Dogecoin node of its own: whichever Core the arcade uses, its own or a shared one borrowed
over the mesh, carries the gift. The Bank holds the words, and checks what it is asked to sign.
A Doginal is a real thing on Dogecoin MAINNET: a send cannot be undone. So:
  - its OWN account, holding only the dogs put in it and a little DOGE for fees. A bug or a leak can reach that, no more. The words are in chain/bank/doginal.words, 0600;
  - a gift is written down before anything is sent: gifts.who and gifts.inscription are UNIQUE, so one per player, ever, and each dog once;
  - the dog is one coin, so the chain itself can only ever move it once. A send cut off half way is tried again for the same dog and the same winner, never another;
  - before signing, the offer is read: the dog's coin first, its whole value to the winner, change only back here, the fee under FEE_MOST;
  - one gift at a time, the next only when the last is in a block;
  - a day's cap, and nothing goes out at all unless ASH_DOGINAL_GIFTS=1.
This file decides nothing about WHO wins: award() is called with a player already known to have earned it. Never from a word a game sent on its own: a game can say anything.
    python3 tools/bank/doginal_gift.py new-words | address | status | stock | give <player's Dogecoin address> <why> | step
"""
import hashlib, hmac, json, os, sqlite3, sys, time

ARCADE = os.environ.get('ASH_ARCADE', '/home/you/dogecoin-arcade')
if ARCADE not in sys.path: sys.path.insert(0, ARCADE)
from arcade import funding, rawchain, seed as seedlib
from arcade.accounts import login_message
from arcade.config import DOGECOIN
from arcade.publish import Key
from arcade.script import b58check_decode

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORDS = os.environ.get('ASH_DOGINAL_WORDS', os.path.join(HERE, 'chain', 'bank', 'doginal.words'))
DB = os.environ.get('ASH_DOGINAL_DB', os.path.join(HERE, 'chain', 'bank', 'doginal.sqlite'))
APP = os.environ.get('ASH_APP', 'https://app.dogecoinarcade.com')
COIN = 100_000_000
POSTAGE_MOST = COIN // 10   # a coin bigger than this is DOGE, not a dog's
FEE_MOST = COIN        # no gift pays more than 1 DOGE in fees, whatever the offer says
DAY_CAP = int(os.environ.get('ASH_DOGINAL_DAY_CAP', '5'))
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141


def doge_secret(phrase):
    """The account's Dogecoin key, m/44'/3'/0'/0/0, as the wallet derives it (wallet_js.js): real BIP32. Not seed.path, which is hardened-only and adds no curve point (it says itself it must
    never be used for coins). login() also checks the address against the arcade's before anything is signed."""
    H = 0x80000000; key, chain = seedlib.master(seedlib.to_seed(phrase))
    for i in (44 | H, 3 | H, 0 | H, 0, 0):
        data = (b'\0' + key if i >= H else Key(int.from_bytes(key, 'big')).pubkey) + i.to_bytes(4, 'big')
        h = hmac.new(chain, data, hashlib.sha512).digest()
        key, chain = ((int.from_bytes(h[:32], 'big') + int.from_bytes(key, 'big')) % N).to_bytes(32, 'big'), h[32:]
    return int.from_bytes(key, 'big')


class ArcadeWallet:
    """The gift account, through the arcade's own doors. http: get(path, params) / post(path, json), a session that keeps its cookie."""
    def __init__(self, http, phrase, origin):
        self.http, self.origin, self.phrase = http, origin, seedlib.validate(phrase)
        self.key = Key(doge_secret(self.phrase)); self.address = self.key.address(DOGECOIN); self.signed_in = False

    def _ask(self, r, what):
        if r.status_code != 200: raise GiftError('%s: %s %s' % (what, r.status_code, str(r.text)[:160]))
        return r.json()

    def login(self):
        from nacl.signing import SigningKey
        sk = SigningKey(seedlib.login_key(self.phrase)); c = self._ask(self.http.get('/auth/challenge'), 'challenge')
        self._ask(self.http.post('/auth/login', json={'pubkey': sk.verify_key.encode().hex(), 'nonce': c['nonce'], 'signature': sk.sign(login_message(c.get('origin') or self.origin, c['nonce'])).signature.hex(), 'join': True}), 'sign-in')
        said = self.http.get('/account/coins', params={'chain': 'doge'})
        said = said.json() if said.status_code == 200 else {}
        if not said.get('address'):   # an account made here, not in a browser: say its address once
            self._ask(self.http.post('/account/address', json={'address': self.address, 'chain': 'doge'}), 'the address')
            said = self._ask(self.http.get('/account/coins', params={'chain': 'doge'}), 'coins')
        if said.get('address') != self.address: raise GiftError('the arcade says this account\'s Dogecoin address is %s, these words make %s' % (said.get('address'), self.address))
        self.signed_in = True

    def _in(self):
        if not self.signed_in: self.login()

    def in_blocks(self):
        """{inscription: its collection and number}: the dogs the arcade's index says this wallet holds, by what blocks say (a send only just made is still here)."""
        r = self._ask(self.http.get('/r/doginals/' + self.address), 'holdings')
        return {i['inscription']: '%s #%s' % ((i.get('collection') or {}).get('name') or '', i.get('number')) for i in r.get('items') or []}

    def holding(self):
        """{inscription: {txid, vout, value, name}}: what can be sent now, each coin read by the arcade, none it could not read and none with two on it."""
        self._in()
        coins = self._ask(self.http.get('/account/coins', params={'chain': 'doge'}), 'coins').get('coins') or []
        small = [c for c in coins if int(c['value']) <= POSTAGE_MOST]; txids = sorted({c['txid'] for c in small}); names = self.in_blocks(); out = {}
        for k in range(0, len(txids), 50):
            said = self._ask(self.http.post('/account/doginal-txs', json={'chain': 'doge', 'txids': txids[k:k + 50]}), 'what is on the coins').get('txs') or {}
            for txid, rows in said.items():
                on = {}
                for r in rows or []: on.setdefault(int(r['vout']), []).append(r)
                for c in small:
                    got = on.get(int(c['vout'])) if c['txid'] == txid else None
                    if not got or len(got) != 1 or got[0].get('unknown') or got[0].get('wait') or int(got[0].get('sat_offset') or 0): continue
                    ins = got[0]['inscription_id']
                    if ins in names: out[ins] = {'txid': txid, 'vout': int(c['vout']), 'value': int(c['value']), 'name': names[ins]}   # only pieces of a known collection: not whatever else lands here
        return out

    def send(self, ins, coin, to, check):
        """Asks for the offer, has check() read it, signs, and the arcade broadcasts. The txid."""
        self._in()
        r = self.http.post('/account/doginal/send', json={'chain': 'doge', 'txid': coin['txid'], 'vout': coin['vout'], 'inscription': ins, 'to': to})
        if r.status_code == 403: self.signed_in = False
        o = self._ask(r, 'the offer'); check(o)
        sigs = [self.key.sign(bytes.fromhex(h)).hex() for h in o['sighashes']]
        return str(self._ask(self.http.post('/account/sign', json={'offer': o['offer'], 'signatures': sigs, 'pubkey': self.key.pubkey.hex()}), 'the send').get('txid'))


class GiftError(Exception):
    """Not sent, and said why. Nothing was spent."""


class Gifts:
    def __init__(self, path, wallet, day_cap=DAY_CAP, on=None, say=print, now=time.time):
        self.w, self.day_cap, self.say, self.now = wallet, day_cap, say, now
        self.on = os.environ.get('ASH_DOGINAL_GIFTS') == '1' if on is None else on
        self.db = sqlite3.connect(path, timeout=30, isolation_level=None); self.db.row_factory = sqlite3.Row
        self.db.execute('pragma synchronous=full')
        self.db.execute("""create table if not exists gifts(id integer primary key, who text not null unique, inscription text not null unique, name text, to_addr text not null, why text,
            state text not null, txid text, note text, at real, sent_at real, done_at real)""")

    def left(self):
        taken = {r['inscription'] for r in self.db.execute('select inscription from gifts')}
        return {k: v for k, v in self.w.holding().items() if k not in taken}

    def award(self, who, to_addr, why):
        """Write the gift down: this player, this dog. Returns its row; GiftError if it cannot be. Nothing is sent here."""
        try: v, h = b58check_decode(str(to_addr))
        except Exception: raise GiftError('not an address: %s' % to_addr)
        if v != DOGECOIN.pubkeyhash_version or len(h) != 20 or to_addr == self.w.address: raise GiftError('not a Dogecoin address to send to: %s' % to_addr)
        left = self.left()
        self.db.execute('begin immediate')
        try:
            if self.db.execute('select 1 from gifts where who=?', (who,)).fetchone(): raise GiftError('this player has had one')
            if self.db.execute('select count(*) n from gifts where at>?', (self.now() - 86400,)).fetchone()['n'] >= self.day_cap: raise GiftError('the day\'s gifts are all given')
            taken = {r['inscription'] for r in self.db.execute('select inscription from gifts')}
            pick = next((k for k in sorted(left, key=lambda k: left[k]['name']) if k not in taken), None)
            if not pick: raise GiftError('none left to give')
            self.db.execute("insert into gifts(who, inscription, name, to_addr, why, state, at) values(?,?,?,?,?,'waiting',?)", (who, pick, left[pick]['name'], to_addr, str(why)[:120], self.now()))
            self.db.execute('commit')
        except BaseException:
            self.db.execute('rollback'); raise
        self.say('DOGINAL AWARDED', who, pick, left[pick]['name'], to_addr, why)
        return self.db.execute('select * from gifts where who=?', (who,)).fetchone()

    def _read(self, o, ins, coin, to):
        """The offer, before it is signed: the bytes themselves are read and every digest is worked out here, so what gets signed is what was read."""
        if o.get('inscription') != ins or o.get('to') != to or o.get('chain') != 'doge': raise GiftError('the offer is for something else')
        try: t = rawchain.read_tx(bytes.fromhex(o['raw']))
        except Exception as e: raise GiftError('the offer\'s bytes do not read: %s' % e)
        given = o.get('inputs') or []; i = [(x['txid'], int(x['vout'])) for x in t.vin]; u = [(int(v), bytes(sc)) for v, sc in t.vout]
        if not i or i != [(x['txid'], int(x['vout'])) for x in given]: raise GiftError('the offer\'s inputs are not the bytes\' inputs')
        if i[0] != (coin['txid'], coin['vout']) or int(given[0]['value']) != coin['value']: raise GiftError('the dog is not the first input')
        if not u or u[0] != (coin['value'], funding.p2pkh_script(to)): raise GiftError('the first output is not the whole coin to the winner')
        home = funding.p2pkh_script(self.w.address)
        if len(u) > 2 or any(s != home for _, s in u[1:]): raise GiftError('an output goes somewhere it should not')
        if any(x.get('address') != self.w.address for x in given): raise GiftError('an input is not this wallet\'s')
        fee = sum(int(x['value']) for x in given) - sum(v for v, _ in u)
        if not 0 < fee <= FEE_MOST: raise GiftError('the fee would be %d koinu' % fee)
        want = [funding.sighash(given, u, n, home).hex() for n in range(len(given))]
        if want != o.get('sighashes'): raise GiftError('the offer asks for signatures over something else')

    def step(self):
        """One piece of work, on the Bank's clock. Returns what it did, in a word."""
        if not self.on: return 'off'
        g = self.db.execute("select * from gifts where state='sent' order by id limit 1").fetchone()
        if g:
            if g['inscription'] in self.w.in_blocks(): return 'waiting'   # not in a block yet
            self.db.execute("update gifts set state='done', done_at=? where id=?", (self.now(), g['id'])); self.say('DOGINAL DELIVERED', g['who'], g['inscription'], g['txid'])
            return 'done'
        g = self.db.execute("select * from gifts where state in ('sending', 'waiting') order by id limit 1").fetchone()
        if not g: return 'idle'
        coin = self.w.holding().get(g['inscription'])
        if not coin:
            if g['state'] == 'sending':   # the send got through and the answer did not: it left, and only this send could have moved it
                self.db.execute("update gifts set state='sent', note='answer lost' where id=?", (g['id'],)); return 'sent'
            self.db.execute('update gifts set note=? where id=?', ('the dog is not in the wallet', g['id'])); self.say('DOGINAL HELD', g['who'], 'not in the wallet'); return 'held'
        self.db.execute("update gifts set state='sending' where id=?", (g['id'],))
        try: txid = self.w.send(g['inscription'], coin, g['to_addr'], lambda o: self._read(o, g['inscription'], coin, g['to_addr']))
        except GiftError as e:
            self.db.execute("update gifts set state='waiting', note=? where id=?", (str(e)[:200], g['id'])); self.say('DOGINAL HELD', g['who'], str(e)[:160]); return 'held'
        except Exception as e:   # cut off with the words sent: 'sending' stays. The coin can only move once, so a try again can only be this same gift
            self.db.execute('update gifts set note=? where id=?', (str(e)[:200], g['id'])); self.say('DOGINAL SEND CUT OFF', g['who'], str(e)[:160]); return 'cut off'
        self.db.execute("update gifts set state='sent', txid=?, sent_at=?, note=null where id=?", (txid, self.now(), g['id'])); self.say('DOGINAL SENT', g['who'], g['inscription'], g['name'], g['to_addr'], txid)
        return 'sent'

    def status(self):
        n = {r['state']: r['n'] for r in self.db.execute('select state, count(*) n from gifts group by state')}
        return {'address': self.w.address, 'on': self.on, 'left': len(self.left()), 'gifts': n, 'day_cap': self.day_cap}


class _Http:
    def __init__(self, base):
        import requests
        self.base, self.s = base.rstrip('/'), requests.Session()
    def get(self, path, params=None): return self.s.get(self.base + path, params=params, timeout=60)
    def post(self, path, json=None): return self.s.post(self.base + path, json=json, timeout=120)


def live():
    return Gifts(DB, ArcadeWallet(_Http(APP), open(WORDS).read().strip(), APP))


def main(argv):
    cmd = argv[0] if argv else 'status'
    if cmd == 'new-words':
        if os.path.exists(WORDS): raise SystemExit('there are words already: ' + WORDS)
        fd = os.open(WORDS, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f: f.write(seedlib.generate(128) + '\n')
        print('made', WORDS, '- keep a copy off this machine'); return
    G = live()
    if cmd == 'address': print(G.w.address)
    elif cmd == 'status': print(json.dumps(G.status(), indent=1))
    elif cmd == 'stock':
        for k, v in G.left().items(): print(k, v['name'])
    elif cmd == 'give': print(dict(G.award(argv[1], argv[1], ' '.join(argv[2:]) or 'given by hand')))
    elif cmd == 'step': print(G.step())
    else: raise SystemExit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
