#!/usr/bin/env python3
"""ashvale_wallet.py - @ashvale's wallet, standalone (2026-10-04: "You're going to have to make a standalone
@ashvale wallet management system"). No browser: it derives @ashvale's keys from its 12 words, signs in to the arcade
with the login key, and for every operation takes the server's offer, checks that every input is @ashvale's own coin
and every sighash is the transaction's own SIGHASH_ALL digest, then signs (secp256k1, DER, low-S) and hands the
signatures back. The node builds and broadcasts the transactions (the same handshake the browser does).

  python3 tools/ashvale_wallet.py whoami                       address check + sign-in check
  python3 tools/ashvale_wallet.py inscribe FILE [--json FILE|TEXT] [--type MIME]     -> the inscription id
  python3 tools/ashvale_wallet.py nft-send PIECE @tag          PIECE = inscription txid or number
  python3 tools/ashvale_wallet.py token-send PROPERTYID AMOUNT @tag
  python3 tools/ashvale_wallet.py token-grant PROPERTYID AMOUNT [@tag]   (managed tokens; no tag = to @ashvale)
  python3 tools/ashvale_wallet.py token-create NAME --units whole|divisible --category C --subcategory S --data JSON
  python3 tools/ashvale_wallet.py coins-send AMOUNT @tag
  add --dry to any command: build and check the offers, sign nothing

Keys: the words come from ~/cartoon-toolkit/ghost-devs/secret/accounts.json (the file the browser tools already read).
They are never printed, logged or written anywhere. Derivation (from the arcade's own code): BIP39 seed, no passphrase;
login key = Ed25519 seed from hardened m/24946'/1'/0'; coin key = secp256k1 BIP32 m/44'/1'/0'/0/0 (testnet), P2PKH
version 113. It refuses to do anything if the derived address is not the one the arcade publishes for @ashvale.
Library use: `from ashvale_wallet import Wallet; W = Wallet(); W.nft_send(piece, '@apple')`."""
import base64, hashlib, hmac, json, mimetypes, os, struct, sys, time, unicodedata
import requests
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed, decode_dss_signature, encode_dss_signature
from cryptography.hazmat.primitives import hashes, serialization
import nacl.signing

APP = 'https://app.dogecoinarcade.com'
ACCOUNTS = '/home/you/cartoon-toolkit/ghost-devs/secret/accounts.json'   # absolute: drvc moves HOME when it is imported
TAG, CHAIN, VERSION = 'ashvale', 'test', 113
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141   # secp256k1 group order
B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

# ---------------------------------------------------------------- keys
def b58check(payload):
    data = payload + hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    n = int.from_bytes(data, 'big'); out = ''
    while n: n, r = divmod(n, 58); out = B58[r] + out
    return '1' * (len(data) - len(data.lstrip(b'\0'))) + out
def hash160(b): return hashlib.new('ripemd160', hashlib.sha256(b).digest()).digest()
def pub_of(k): return ec.derive_private_key(k, ec.SECP256K1()).public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.CompressedPoint)
def bip39_seed(words):
    m = unicodedata.normalize('NFKD', ' '.join(words.lower().split()))
    return hashlib.pbkdf2_hmac('sha512', m.encode(), b'mnemonic', 2048, 64)
def bip32_secp(seed, path):
    """BIP32 for secp256k1: child = (IL + k) mod n, hardened or not (coins.js:89-109)"""
    I = hmac.new(b'Bitcoin seed', seed, hashlib.sha512).digest(); k, c = int.from_bytes(I[:32], 'big'), I[32:]
    for el in path.split('/')[1:]:
        hard = el.endswith("'"); i = int(el.rstrip("'")) + (0x80000000 if hard else 0)
        data = (b'\0' + k.to_bytes(32, 'big') if hard else pub_of(k)) + i.to_bytes(4, 'big')
        I = hmac.new(c, data, hashlib.sha512).digest(); k, c = (int.from_bytes(I[:32], 'big') + k) % N, I[32:]
    return k
def ed25519_seed(seed, path):
    """the arcade's login key: hardened-only derivation where the child key is IL itself (signin.js:127-186, seed.py:254)"""
    I = hmac.new(b'Bitcoin seed', seed, hashlib.sha512).digest(); k, c = I[:32], I[32:]
    for el in path.split('/')[1:]:
        I = hmac.new(c, b'\0' + k + (int(el.rstrip("'")) + 0x80000000).to_bytes(4, 'big'), hashlib.sha512).digest(); k, c = I[:32], I[32:]
    return k

# ---------------------------------------------------------------- transactions: parse + the legacy SIGHASH_ALL digest
def varint(n): return bytes([n]) if n < 0xfd else (b'\xfd' + struct.pack('<H', n) if n <= 0xffff else b'\xfe' + struct.pack('<I', n))
def rvarint(b, i):
    x = b[i]
    if x < 0xfd: return x, i + 1
    if x == 0xfd: return struct.unpack_from('<H', b, i + 1)[0], i + 3
    if x == 0xfe: return struct.unpack_from('<I', b, i + 1)[0], i + 5
    return struct.unpack_from('<Q', b, i + 1)[0], i + 9
def parse_tx(raw):
    b = bytes.fromhex(raw); i = 4; ver = b[:4]
    n, i = rvarint(b, i); ins = []
    for _ in range(n):
        prev = b[i:i + 36]; i += 36; ln, i = rvarint(b, i); sc = b[i:i + ln]; i += ln; seq = b[i:i + 4]; i += 4; ins.append((prev, sc, seq))
    n, i = rvarint(b, i); outs = []
    for _ in range(n):
        val = b[i:i + 8]; i += 8; ln, i = rvarint(b, i); sc = b[i:i + ln]; i += ln; outs.append((val, sc))
    return ver, ins, outs, b[i:i + 4]
def sighash_all(raw, n, script_code):
    ver, ins, outs, lock = parse_tx(raw)
    s = ver + varint(len(ins))
    for k, (prev, _sc, seq) in enumerate(ins): sc = script_code if k == n else b''; s += prev + varint(len(sc)) + sc + seq
    s += varint(len(outs)) + b''.join(v + varint(len(sc)) + sc for v, sc in outs) + lock + struct.pack('<I', 1)
    return hashlib.sha256(hashlib.sha256(s).digest()).digest()

class Wallet:
    def __init__(self, dry=False):
        self.dry = dry
        seed = bip39_seed(json.load(open(ACCOUNTS))[TAG]['words'])
        self._k = bip32_secp(seed, "m/44'/1'/0'/0/0")
        self.pub = pub_of(self._k); self.address = b58check(bytes([VERSION]) + hash160(self.pub))
        self._login = nacl.signing.SigningKey(ed25519_seed(seed, "m/24946'/1'/0'")); del seed
        self.login_pub = self._login.verify_key.encode().hex()
        self.p2pkh = b'\x76\xa9\x14' + hash160(self.pub) + b'\x88\xac'
        self.s = requests.Session(); self.s.headers['User-Agent'] = 'ashvale-wallet/1'
        pub = self.s.get(APP + '/r/tag/' + TAG, timeout=30).json().get('address')
        if pub != self.address: raise SystemExit('REFUSING: the derived address %s is not @%s\'s (%s)' % (self.address, TAG, pub))
        self._signed_in = False
    # -------------------------------------------------------- session
    def sign_in(self):
        if self._signed_in: return
        ch = self.s.get(APP + '/auth/challenge', timeout=30).json()
        msg = ('DogecoinArcade login\n%s\n%s' % (ch['origin'], ch['nonce'])).encode()
        r = self.s.post(APP + '/auth/login', json={'pubkey': self.login_pub, 'nonce': ch['nonce'], 'signature': self._login.sign(msg).signature.hex(), 'join': False}, timeout=30)
        if r.status_code != 200: raise SystemExit('sign-in refused: %s %s' % (r.status_code, r.text[:200]))
        self._signed_in = True
    def call(self, path, body=None, method='POST'):
        self.sign_in()
        for attempt in range(6):
            r = self.s.request(method, APP + path, json=body, timeout=180)
            if r.status_code == 409 and attempt < 5: time.sleep(10); continue   # a send of ours is still going out
            try: j = r.json()
            except Exception: j = {'detail': r.text[:300]}
            if r.status_code >= 400: raise RuntimeError('%s %s: %s' % (path, r.status_code, j.get('detail') if isinstance(j, dict) else j))
            return j
    # -------------------------------------------------------- the offer handshake
    def sign_offer(self, off):
        ins, sh = off.get('inputs') or [], off.get('sighashes') or []
        if not ins or len(ins) != len(sh): raise RuntimeError('the offer has no inputs/sighashes to sign: %s' % str(off)[:200])
        sigs = []
        for n, (inp, want) in enumerate(zip(ins, sh)):
            if inp.get('address') != self.address: raise RuntimeError('offer input %d is not @%s\'s coin (%s)' % (n, TAG, inp.get('address')))
            dg = sighash_all(off['raw'], n, self.p2pkh)
            if want not in (dg.hex(), dg[::-1].hex()): raise RuntimeError('offer sighash %d does not match its transaction' % n)
            der = ec.derive_private_key(self._k, ec.SECP256K1()).sign(dg, ec.ECDSA(Prehashed(hashes.SHA256())))
            r_, s_ = decode_dss_signature(der)
            if s_ > N // 2: s_ = N - s_   # low-S
            sigs.append((encode_dss_signature(r_, s_) + b'\x01').hex())
        if self.dry: print('   DRY: %d input(s) checked, fee %s, not signed: %s' % (len(sigs), off.get('fee'), off.get('what') or ''), flush=True); return {'txid': None, 'dry': True}
        return self.call('/account/sign', {'offer': off['offer'], 'signatures': sigs, 'pubkey': self.pub.hex()})
    # -------------------------------------------------------- operations
    def whoami(self):
        acc = self.call('/account', method='GET')
        return {'tag': TAG, 'address': self.address, 'address_matches_arcade': True, 'signed_in': acc.get('tag') or acc.get('name') or acc.get('address')}
    def nft_send(self, piece, to): return self.sign_offer(self.call('/account/nft/send', {'piece': str(piece), 'to': to, 'chain': CHAIN}))
    def token_send(self, pid, amount, to): return self.sign_offer(self.call('/account/token/send', {'property_id': int(pid), 'to': to, 'amount': str(amount), 'chain': CHAIN}))
    def token_grant(self, pid, amount, to=''): return self.sign_offer(self.call('/account/token/manage', {'property_id': int(pid), 'chain': CHAIN, 'action': 'grant', 'amount': str(amount), 'to': to}))
    def token_create(self, name, units='indivisible', category='', subcategory='', data='', supply='0', icon='', url=''):
        return self.sign_offer(self.call('/account/token/create', {'chain': CHAIN, 'name': name, 'kind': 'managed', 'units': units, 'supply': str(supply), 'data': data,
                                                                   'category': category, 'subcategory': subcategory, 'url': url, 'icon': icon}))
    def coins_send(self, amount, to): return self.sign_offer(self.call('/account/send', {'to': to, 'amount': str(amount), 'chain': CHAIN}))
    def inscribe(self, path, json_text='', content_type=None, name=None):
        """a file (with optional JSON beside it): one transaction, or a split and then one per piece. Sending the same
        file again resumes it (the node matches it by sha256)."""
        data = open(path, 'rb').read(); ct = content_type or mimetypes.guess_type(path)[0] or 'application/octet-stream'
        if json_text: json.loads(json_text)
        first = self.call('/account/inscribe', {'content': base64.b64encode(data).decode(), 'content_type': ct, 'name': name or os.path.basename(path), 'chain': CHAIN, 'json': json_text or ''})
        chunks = int(first.get('chunks') or 1)
        out = self.sign_offer(first) if first.get('offer') else first
        if chunks <= 1: return {'id': (out or {}).get('txid'), 'chunks': 1}
        if self.dry: return {'id': None, 'chunks': chunks, 'dry': True}
        part, L, M = first['part'], int(first['chunk_len']), int(first['manifest_len'])
        n, root, t0 = int(first.get('next') or 0), None, time.time()
        while n < chunks:
            a = max(0, n * L - M); piece = data[a:max(a, min(len(data), (n + 1) * L - M))]   # as the page's pieceOf: a piece wholly inside the manifest is empty (a negative end would slice from the back)
            try: r = self.call('/account/inscribe', {'part': part, 'chunk': n, 'chain': CHAIN, 'content': base64.b64encode(piece).decode()})
            except RuntimeError as e:
                if 'already on the chain' in str(e): n += 1; continue
                raise
            if r.get('waiting'):
                if time.time() - t0 > 1200: raise RuntimeError('the split was not mined in 20 minutes: re-run to resume')
                time.sleep(5); continue
            if r.get('resplit'): self.sign_offer(r); continue
            if r.get('offer'):
                o = self.sign_offer(r)
                if n == 0: root = o.get('txid')
            n += 1
        return {'id': root, 'chunks': chunks, 'part': part}

if __name__ == '__main__':
    a = sys.argv[1:]; dry = '--dry' in a; a = [x for x in a if x != '--dry']
    if not a: print(__doc__); sys.exit()
    W = Wallet(dry=dry); cmd = a[0]
    if cmd == 'whoami': print(json.dumps(W.whoami(), indent=1))
    elif cmd == 'nft-send': print(W.nft_send(a[1], a[2]))
    elif cmd == 'token-send': print(W.token_send(a[1], a[2], a[3]))
    elif cmd == 'token-grant': print(W.token_grant(a[1], a[2], a[3] if len(a) > 3 else ''))
    elif cmd == 'coins-send': print(W.coins_send(a[1], a[2]))
    elif cmd == 'token-create':
        kw = {a[i][2:]: a[i + 1] for i in range(2, len(a) - 1) if a[i].startswith('--')}
        print(W.token_create(a[1], units={'whole': 'indivisible'}.get(kw.get('units', ''), kw.get('units', 'indivisible')), category=kw.get('category', ''), subcategory=kw.get('subcategory', ''), data=kw.get('data', '')))
    elif cmd == 'inscribe':
        j = ''; ct = None
        if '--json' in a: v = a[a.index('--json') + 1]; j = open(v).read() if os.path.exists(v) else v
        if '--type' in a: ct = a[a.index('--type') + 1]
        print(json.dumps(W.inscribe(a[1], j, ct)))
    else: print('unknown command', cmd); sys.exit(2)
