"""[Claude 2026-11-01] tools/bank/doginal_gift.py against the REAL arcade app (test client): real sign-in, the real /account/doginal/send and /account/sign, the real
coin and inscription checks; only Dogecoin Core is a stand-in, and it checks every signature. No node of the Bank's own: the arcade's chain.rpc() is the only way out.
  cd ~/arcade-work/mesh-udp && PYTHONPATH=tests:$HOME/ashvale3d/tools/bank ~/arcade-localtest/.venv/bin/python -m pytest -q -p no:cacheprovider $HOME/ashvale3d/tests/doginal_gift_arcade_test.py
"""
import contextlib, hashlib, os, pathlib, sys, types
import pytest
ROOT = pathlib.Path(os.environ.get('ARCADE_CHECKOUT', os.getcwd()))
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / 'tests')); sys.path.insert(0, os.path.expanduser('~/ashvale3d/tools/bank'))
os.environ['ASH_ARCADE'] = str(ROOT)
from test_web import app_state, client                          # noqa: F401,E402
from test_me_page import LOCAL                                  # noqa: E402
from test_dogecoin_network import _with_doge                    # noqa: E402
from arcade import doginals, funding, rawchain                  # noqa: E402
import json, threading                                         # noqa: E402
from arcade.config import DOGECOIN                              # noqa: E402
from arcade.publish import Key                                  # noqa: E402
from arcade.script import b58check_encode, hash160              # noqa: E402
import doginal_gift as DG                                       # noqa: E402

WORDS = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
DOG1, DOG2, OTHER, FEES, FEES2 = '11' * 32, '22' * 32, '33' * 32, '44' * 32, '55' * 32
INS1, INS2, INS3 = DOG1 + 'i0', DOG2 + 'i0', OTHER + 'i0'
WIN1 = b58check_encode(30, hash160(Key(int('61' * 32, 16)).pubkey)); WIN2 = b58check_encode(30, hash160(Key(int('62' * 32, 16)).pubkey))


class Core:
    """A Dogecoin Core: what the arcade's chain.rpc() would reach, here or shared. Holds the coins; a spend must be signed by the key that owns each coin."""
    def __init__(self): self.coins, self.sent, self.calls, self.cut = {}, [], [], False
    def call(self, method, *a):
        self.calls.append(method)
        if method == 'gettxout':
            got = self.coins.get((a[0], a[1])); return None if got is None else {'value': got[0] / 1e8, 'confirmations': 5, 'scriptPubKey': {'hex': got[1].hex()}}
        if method == 'decoderawtransaction':
            t = rawchain.read_tx(bytes.fromhex(a[0]))
            return {'vin': [{'txid': i['txid'], 'vout': i['vout']} for i in t.vin], 'vout': [{'value': v / 1e8, 'scriptPubKey': {'hex': sc.hex()}} for v, sc in t.vout]}
        if method == 'sendrawtransaction':
            t = rawchain.read_tx(bytes.fromhex(a[0]))
            ins = [dict(txid=i['txid'], vout=i['vout'], value=self.coins[(i['txid'], i['vout'])][0]) for i in t.vin]   # a KeyError here is a double spend
            outs = list(t.vout)
            for n, i in enumerate(t.vin): verify(i['script'], funding.sighash(ins, outs, n, self.coins[(i['txid'], i['vout'])][1]), self.coins[(i['txid'], i['vout'])][1])
            for i in t.vin: del self.coins[(i['txid'], i['vout'])]
            for n, (v, sc) in enumerate(outs): self.coins[(t.txid, n)] = (v, sc)
            self.sent.append({'txid': t.txid, 'in': [(i['txid'], i['vout']) for i in t.vin], 'out': outs})
            return t.txid
        raise AssertionError(method)


def verify(script_sig, digest, spk):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec, utils
    n = script_sig[0]; sig = script_sig[1:1 + n - 1]; m = 1 + n; pub = script_sig[m + 1:m + 1 + script_sig[m]]
    assert hash160(pub) == spk[3:23], 'signed by the wrong key'
    ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256K1(), pub).verify(sig, digest, ec.ECDSA(utils.Prehashed(hashes.SHA256())))


class Http:
    def __init__(self, app): self.app, self.fail_next_sign = app, False
    def get(self, path, params=None): return self.app.get(path, params=params, headers=LOCAL)
    def post(self, path, json=None):
        got = self.app.post(path, json=json, headers=LOCAL)
        if path == '/account/sign' and self.fail_next_sign: self.fail_next_sign = False; raise OSError('the line dropped after the send')
        return got


@pytest.fixture
def W(client, monkeypatch, tmp_path):
    app, state = client
    doge = _with_doge(state, monkeypatch, ready=True)
    core = Core(); monkeypatch.setattr(doge, 'rpc', lambda: contextlib.nullcontext(core), raising=False)
    http = Http(app); wallet = DG.ArcadeWallet(http, WORDS, 'http://testserver'); me = funding.p2pkh_script(wallet.address)
    for t, v in ((DOG1, 100_000), (DOG2, 100_000), (OTHER, 100_000), (FEES, 5 * DG.COIN), (FEES2, 7 * DG.COIN)): core.coins[(t, 0)] = (v, me)
    def fill():
        with contextlib.closing(state.token_index(doge).open()) as db:
            db.conn.execute('delete from utxo')
            for (t, n), (v, s) in core.coins.items():
                if s == me: db.conn.execute('INSERT OR REPLACE INTO utxo(txid,vout,address,value,height) VALUES (?,?,?,?,?)', (t, n, wallet.address, v, 1))
            db.conn.commit()
    ON = {DOG1: INS1, DOG2: INS2, OTHER: INS3}
    def fetch(txid): return {'txid': txid, 'inscriptions': [{'vout': 0, 'inscription_id': ON[txid], 'sat_offset': 0}] if txid in ON else []}
    monkeypatch.setattr(funding, 'GUARD', doginals.Doginals(tmp_path / 'dg.sqlite', fetch=fetch))
    known = {INS1: 41, INS2: 42}   # OTHER is on no collection: never given away
    monkeypatch.setattr(state, 'collection_registry', lambda: types.SimpleNamespace(item=lambda net, i: {'id': i, 'root': 'r', 'name': 'Anti Doginal Dogs', 'number': known[i], 'traits': {}} if i in known else None), raising=False)
    wallet.login(); fill()
    path = str(tmp_path / 'g.sqlite'); told = []
    G = DG.Gifts(path, wallet, on=True, say=lambda *a: None, tell=told.append)
    return types.SimpleNamespace(G=G, core=core, http=http, wallet=wallet, fill=fill, app=app, path=path, told=told)


def test_the_key_is_the_wallets_own_derivation():
    from arcade import seed as S
    from arcade.lora import device_keys as K
    want = K.bip32(S.to_seed(WORDS), (44 | K.H, 3 | K.H, 0 | K.H, 0, 0))
    assert DG.doge_secret(WORDS) == int.from_bytes(want if isinstance(want, bytes) else want[0], 'big')


def test_only_collection_dogs_are_stock(W):
    assert set(W.G.left()) == {INS1, INS2}


def test_a_gift_goes_whole_to_the_winner_through_the_arcades_node(W):
    g = W.G.award('nPlayerOne', WIN1, 'first at the ferry')
    assert g['inscription'] == INS1 and W.core.sent == []
    assert W.G.step() == 'sent'
    s = W.core.sent[0]
    assert s['in'][0] == (DOG1, 0) and s['out'][0] == (100_000, funding.p2pkh_script(WIN1)), 'the dog first, and whole'
    assert (OTHER, 0) not in s['in'] and (DOG2, 0) not in s['in'], 'no other dog pays the fee'
    assert len(s['out']) == 2 and s['out'][1][1] == funding.p2pkh_script(W.wallet.address), 'change comes home'
    assert 0 < sum(W.core.calls.count(m) for m in ('sendrawtransaction',)) == 1
    assert W.G.step() == 'waiting'; W.fill(); assert W.G.step() == 'done'; assert W.G.step() == 'idle'


def test_one_per_player_and_each_dog_once(W):
    W.G.award('nPlayerOne', WIN1, 'x')
    with pytest.raises(DG.GiftError): W.G.award('nPlayerOne', WIN2, 'again')
    assert W.G.award('nPlayerTwo', WIN2, 'y')['inscription'] == INS2
    with pytest.raises(DG.GiftError): W.G.award('nPlayerThree', WIN2, 'none left')


def test_the_days_cap(W):
    W.G.day_cap = 1; W.G.award('nPlayerOne', WIN1, 'x')
    with pytest.raises(DG.GiftError): W.G.award('nPlayerTwo', WIN2, 'y')


def test_off_means_off(W):
    W.G.on = False; W.G.award('nPlayerOne', WIN1, 'x')
    assert W.G.step() == 'off' and W.core.sent == []


def test_a_send_cut_off_is_never_paid_twice(W):
    W.G.award('nPlayerOne', WIN1, 'x'); W.http.fail_next_sign = True
    assert W.G.step() == 'cut off' and len(W.core.sent) == 1
    assert W.G.step() == 'waiting' and len(W.core.sent) == 1, 'blocks still show it here, and nothing more goes'
    W.fill(); assert W.G.step() == 'sent' and len(W.core.sent) == 1, 'the dog has left'
    assert W.G.step() == 'done'


def _win(W, who, why='x'): return DG.win(who, why, path=W.path)
def _left(W): return [dict(r) for r in W.G.db.execute('select * from wins')]


def test_a_win_becomes_a_gift_by_the_clock_and_the_player_hears(W):
    assert _win(W, WIN1) is True and _win(W, WIN1) is False, 'a win is written once'
    assert W.G.step() == 'awarded' and W.core.sent == [] and _left(W) == []
    assert W.G.step() == 'sent' and W.G.step() == 'waiting'
    W.fill(); assert W.G.step() == 'done' and W.G.step() == 'idle'
    assert [w['state'] for w in W.told] == ['sent', 'done'] and all(w['to'] == WIN1 and w['inscription'] == INS1 and w['txid'] for w in W.told)
    assert all(len(json.dumps(w)) < 500 for w in W.told), 'a word the room will carry'


def test_a_player_gets_one_however_often_they_win(W):
    W.G.award(WIN1, WIN1, 'x'); _win(W, WIN1)
    W.G.db.execute("update gifts set state='done'")
    assert W.G.step() == 'idle' and _left(W) == []
    assert len(W.G.db.execute('select * from gifts').fetchall()) == 1


def test_two_names_on_one_dogecoin_address_get_one(W):
    W.G.award('nPlayerOne', WIN1, 'x')
    with pytest.raises(DG.GiftError): W.G.award('nPlayerTwo', WIN1, 'y')


def test_a_stranger_waits_and_holds_up_nobody(W):
    stranger = b58check_encode(113, bytes(20))
    _win(W, stranger); W.G.db.execute('update wins set at=0'); _win(W, WIN1)
    assert W.G.step() == 'awarded'
    assert [(r['who'], 'no account' in r['note']) for r in _left(W)] == [(stranger, True)]


def test_the_days_cap_keeps_the_win_for_tomorrow(W):
    W.G.day_cap = 0; _win(W, WIN1)
    assert W.G.step() == 'day cap' and len(_left(W)) == 1 and W.core.sent == []
    W.G.day_cap = 1; assert W.G.step() == 'awarded'


def test_no_dogs_left_keeps_the_win(W):
    W.G.db.execute("insert into gifts(who, inscription, to_addr, state) values('a', ?, 'x', 'done'), ('b', ?, 'y', 'done')", (INS1, INS2))
    _win(W, WIN1); assert W.G.step() == 'none left' and len(_left(W)) == 1


def test_a_coin_that_cannot_be_read_settles_nothing(W, monkeypatch):
    W.G.award(WIN1, WIN1, 'x'); assert W.G.step() == 'sent'
    W.fill()
    guard = funding.GUARD
    def cannot(txid): raise doginals.Unknown('not now')
    W.core.coins[('ee' * 32, 0)] = (100_000, funding.p2pkh_script(W.wallet.address)); W.fill()
    monkeypatch.setattr(guard, 'held', cannot)
    with pytest.raises(DG.GiftError): W.G.step()
    assert W.G.db.execute('select state from gifts').fetchone()['state'] == 'sent'


def test_the_clock_says_an_error_and_goes_on(monkeypatch):
    stop = threading.Event(); said = []; turns = []
    def bad(**k):
        turns.append(1)
        if len(turns) == 3: stop.set()
        raise OSError('no words')
    monkeypatch.setattr(DG, 'live', bad)
    DG.clock(stop, every=0, say=lambda *a: said.append(a))
    assert len(said) == 3 and said[0][0] == 'DOGINAL CLOCK'


@pytest.mark.parametrize('bad', ['second_winner', 'change_elsewhere', 'extra_output', 'wrong_first_input', 'huge_fee', 'digest_of_something_else', 'part_of_the_coin'])
def test_a_tampered_offer_is_never_signed(W, bad):
    real = W.wallet.send
    def tamper(ins, coin, to, check):
        home, win, thief = funding.p2pkh_script(W.wallet.address), funding.p2pkh_script(to), funding.p2pkh_script(WIN2)
        fees_in = {'txid': FEES, 'vout': 0, 'value': 5 * DG.COIN, 'address': W.wallet.address}
        dog = {'txid': coin['txid'], 'vout': coin['vout'], 'value': 100_000, 'address': W.wallet.address}
        given, outs = [dog, fees_in], [(100_000, win), (5 * DG.COIN - 1_000_000, home)]
        if bad == 'second_winner': outs[0] = (100_000, thief)
        if bad == 'change_elsewhere': outs[1] = (outs[1][0], thief)
        if bad == 'extra_output': outs.append((1000, thief))
        if bad == 'wrong_first_input': given.reverse()
        if bad == 'huge_fee': outs[1] = (1000, home)
        if bad == 'part_of_the_coin': outs[0] = (90_000, win)
        hashes = [funding.sighash(given, outs, n, home).hex() for n in range(2)]
        if bad == 'digest_of_something_else': hashes[0] = '00' * 32
        check({'inscription': ins, 'to': to, 'chain': 'doge', 'offer': 'x', 'raw': funding.build_raw_tx([(c['txid'], c['vout']) for c in given], outs), 'inputs': given, 'sighashes': hashes})
        raise AssertionError('it would have been signed')
    W.wallet.send = tamper
    W.G.award('nPlayerOne', WIN1, 'x')
    assert W.G.step() == 'held' and W.core.sent == []
    W.wallet.send = real; assert W.G.step() == 'sent'


def test_not_a_dogecoin_address(W):
    for bad in ('nPepAddressXXXXXXXXXXXXXXXXXXXXXXX', W.wallet.address, b58check_encode(111, b'\1' * 20)):
        with pytest.raises(DG.GiftError): W.G.award('nP', bad, 'x')
