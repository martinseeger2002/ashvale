#!/usr/bin/env python3
"""ASHVALE design studio: items, NPCs and buildings as game parts, then a GitHub suggestion PR.

    python3 studio/server.py [port]     default 8760, localhost only
"""
import http.server, json, os, re, shutil, subprocess, tempfile, time, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STU = os.path.join(ROOT, 'studio')
DRAFTS = os.path.join(STU, 'drafts')
PARTS = os.path.join(ROOT, 'data', 'parts')
os.makedirs(DRAFTS, exist_ok=True)

ID_RE = re.compile(r'^[a-z][a-z0-9_]{1,40}$')
CLASS_RE = re.compile(r'^(item|npc|building):[a-z][a-z0-9_]*$')
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')


def jload(path, default=None):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def rules_items():
    return (jload(os.path.join(ROOT, 'data', 'rules.json'), {}).get('data') or {}).get('items') or {}


def catalog():
    ri = rules_items()
    cats = ri.get('categories') or {}
    slots = ri.get('slots') or {}
    traits = list((ri.get('traits') or {}).keys())
    pal = jload(os.path.join(PARTS, 'palette.json'), {})
    items, npcs, monsters, buildings = [], [], [], []
    for fn in sorted(os.listdir(PARTS)):
        if not fn.endswith('.json'):
            continue
        p = jload(os.path.join(PARTS, fn), {})
        if p.get('kind') == 'char':
            rec = {'id': p.get('id', '')[5:], 'name': p.get('name') or p.get('id'), 'body': p.get('body'), 'role': p.get('role'), 'part': p.get('id')}
            (monsters if p.get('role') == 'monster' else npcs).append(rec)
    extra = (jload(os.path.join(ROOT, 'data', 'extra', 'items.json'), {}) or {}).get('items') or {}
    game_items = (jload(os.path.join(ROOT, 'data', 'items.json'), {}) or {}).get('data', {}).get('items') or {}
    seen = set()
    for src in (game_items, extra):
        for iid, it in src.items():
            if iid in seen:
                continue
            seen.add(iid)
            items.append({'id': iid, 'name': it.get('name', iid), 'category': it.get('category'), 'subcategory': it.get('subcategory'), 'model': it.get('model'), 'slot': slots.get(it.get('category', '') + '/' + it.get('subcategory', '')) or slots.get(it.get('category', ''))})
    item_classes = []
    for cat, subs in cats.items():
        if cat in ('currency', 'ammo'):
            continue
        for sub in subs:
            item_classes.append({'class': 'item:' + sub, 'group': 'item', 'kind': sub, 'category': cat, 'slot': slots.get(cat + '/' + sub) or slots.get(cat), 'inGame': True})
    if not any(c['kind'] == 'necklace' for c in item_classes):
        item_classes.append({'class': 'item:necklace', 'group': 'item', 'kind': 'necklace', 'category': 'jewellery', 'slot': 'neck', 'inGame': False, 'needs': ['Add jewellery/necklace to rules.items.categories', 'Wear slot neck in rules.items.slots']})
    npc_classes = [{'class': 'npc:human', 'group': 'npc', 'kind': 'human', 'body': 'humanoid', 'inGame': True}]
    for m in monsters:
        npc_classes.append({'class': 'npc:' + m['id'], 'group': 'npc', 'kind': m['id'], 'body': m.get('body') or 'beast', 'inGame': True, 'remix': m['part']})
    for k, label in (('church', 'Church'), ('house', 'House'), ('shop', 'Shop'), ('smithy', 'Smithy')):
        buildings.append({'class': 'building:' + k, 'group': 'building', 'kind': k, 'inGame': True, 'label': label})
    hair = sorted({p.get('style') for p in (jload(os.path.join(PARTS, f), {}) for f in os.listdir(PARTS) if f.startswith('cloth.hair_')) if p.get('style')})
    beard = sorted({p.get('style') for p in (jload(os.path.join(PARTS, f), {}) for f in os.listdir(PARTS) if f.startswith('cloth.beard_')) if p.get('style')})
    return {
        'palette': pal.get('creator') or pal.get('data', {}).get('creator') or {},
        'named': (pal.get('named') or pal.get('data', {}).get('named') or {}),
        'traits': traits,
        'slots': slots,
        'categories': cats,
        'classes': item_classes + npc_classes + buildings,
        'items': items[:400],
        'npcs': npcs,
        'monsters': monsters,
        'hair': hair,
        'beard': beard,
        'remote': git_remote(),
    }


def git_remote():
    try:
        out = subprocess.check_output(['git', '-C', ROOT, 'remote', 'get-url', 'origin'], text=True).strip()
        return out
    except Exception:
        return ''


def slug_ok(s):
    return bool(s and ID_RE.match(s))


def draft_path(did):
    return os.path.join(DRAFTS, did + '.json')


def list_drafts():
    out = []
    for fn in sorted(os.listdir(DRAFTS)):
        if not fn.endswith('.json'):
            continue
        d = jload(os.path.join(DRAFTS, fn), {})
        out.append({'id': fn[:-5], 'class': d.get('class'), 'name': d.get('name'), 'updated': d.get('updated')})
    return out


def validate_design(d):
    if not isinstance(d, dict):
        raise ValueError('design must be an object')
    if not CLASS_RE.match(d.get('class') or ''):
        raise ValueError('class must look like item:ring, npc:wolf, building:church')
    if not slug_ok(d.get('id') or ''):
        raise ValueError('id: start with a letter, then a-z 0-9 underscore, at most 41 characters')
    name = (d.get('name') or '').strip()
    if not (1 <= len(name) <= 60):
        raise ValueError('give it a short name')
    group, kind = d['class'].split(':', 1)
    if group == 'item':
        part = d.get('part')
        if not part or part.get('ashvale3d') != 'part':
            raise ValueError('item needs an ASHVALE part')
        why = validate_part(part)
        if why:
            raise ValueError(why)
        item = d.get('item') or {}
        if item.get('category') not in (rules_items().get('categories') or {}) and item.get('category') != 'jewellery':
            raise ValueError('unknown item category')
    elif group == 'npc':
        part = d.get('part')
        if not part or part.get('kind') != 'char':
            raise ValueError('npc needs a char part')
        why = validate_part(part)
        if why:
            raise ValueError(why)
    elif group == 'building':
        b = d.get('building') or {}
        if b.get('k') not in ('church', 'house', 'shop', 'smithy'):
            raise ValueError('building kind must be church, house, shop or smithy')
        for key in ('w', 'h'):
            n = int(b.get(key) or 0)
            if not (2 <= n <= 24):
                raise ValueError('building ' + key + ' is 2 to 24 tiles')
        for col in ('roof', 'wall'):
            if b.get(col) and not HEX.match(b[col]):
                raise ValueError(col + ' is a #rrggbb colour')
    note = d.get('note') or ''
    if len(note) > 2000:
        raise ValueError('note is too long')
    return d


def validate_part(pt):
    if pt.get('ashvale3d') != 'part' or not isinstance(pt.get('id'), str) or not re.match(r'^[a-z0-9_.]+$', pt['id']):
        return 'not an ASHVALE part id'
    n = 0
    def walk(lst, depth):
        nonlocal n
        if not isinstance(lst, list):
            return None
        if depth > 4:
            return 'nested too deep'
        for s in lst:
            if not s or s.get('t') not in ('box', 'cyl', 'cone', 'sphere', 'ico', 'capsule', 'tube', 'kite', 'torus', 'disc', 'group'):
                return 'unknown shape'
            n += 1
            if n > 80:
                return 'too many shapes (80 is the studio cap)'
            for v in (s.get('s') or []):
                if isinstance(v, (int, float)) and abs(v) > 4:
                    return 'a shape is bigger than 4 m'
            if s.get('children'):
                e = walk(s['children'], depth + 1)
                if e:
                    return e
        return None
    for k in ('shapes', 'groundShapes', 'segments', 'face'):
        e = walk(pt.get(k) or [], 0)
        if e:
            return e
    return None


def emit_files(d, base=None):
    """paths relative to the repo root -> JSON objects."""
    base = base or ROOT
    group, kind = d['class'].split(':', 1)
    files = {}
    files['suggestions/%s/manifest.json' % d['id']] = {
        'ashvale3d': 'suggestion', 'v': 1, 'id': d['id'], 'class': d['class'],
        'name': d['name'], 'author': d.get('author') or '', 'note': d.get('note') or '',
        'needs': d.get('needs') or [],
    }
    if group == 'item':
        part = dict(d['part'])
        part['id'] = d.get('partId') or ('item.' + d['id'])
        files['data/parts/%s.json' % part['id']] = part
        item = dict(d.get('item') or {})
        item.setdefault('name', d['name'])
        item.setdefault('game', 'ashvale')
        item.setdefault('collection', 'ASHVALE Armoury')
        item.setdefault('model', part['id'])
        extra = jload(os.path.join(base, 'data', 'extra', 'items.json'), {'items': {}})
        extra = json.loads(json.dumps(extra))
        extra.setdefault('items', {})[d['id']] = item
        files['data/extra/items.json'] = extra
        files['suggestions/%s/item.json' % d['id']] = item
    elif group == 'npc':
        part = dict(d['part'])
        part['id'] = d.get('partId') or ('char.' + d['id'])
        part['kind'] = 'char'
        part.setdefault('role', 'npc' if kind == 'human' else 'monster')
        part['name'] = d['name']
        files['data/parts/%s.json' % part['id']] = part
        files['suggestions/%s/npc.json' % d['id']] = {'id': d['id'], 'name': d['name'], 'look': d['id'], 'part': part['id']}
    else:
        b = dict(d.get('building') or {})
        b['k'] = kind
        files['suggestions/%s/building.json' % d['id']] = b
        files['data/extra/buildings/%s.json' % d['id']] = {'id': d['id'], 'name': d['name'], 'object': b, 'note': d.get('note') or ''}
    return files


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def suggest(d):
    """Isolated worktree on origin/main, commit only this design, push a suggestion branch, open a PR."""
    validate_design(d)
    remote = git_remote()
    if 'github.com' not in remote:
        raise ValueError('origin is not GitHub')
    branch = 'suggest/' + d['id']
    wt = tempfile.mkdtemp(prefix='ash-suggest-')
    try:
        subprocess.check_call(['git', '-C', ROOT, 'fetch', 'origin'], timeout=60)
        subprocess.check_call(['git', '-C', ROOT, 'worktree', 'add', '-q', '-B', branch, wt, 'origin/main'], timeout=60)
        files = emit_files(d, wt)
        for rel, obj in files.items():
            write_json(os.path.join(wt, rel), obj)
        subprocess.check_call(['git', '-C', wt, 'add', '--'] + list(files.keys()), timeout=30)
        st = subprocess.check_output(['git', '-C', wt, 'status', '--porcelain'], text=True)
        if not st.strip():
            raise ValueError('nothing new to suggest (that design may already be on main)')
        msg = 'Suggestion: %s (%s).\n\n' % (d['name'], d['class'])
        if d.get('note'):
            msg += d['note'].strip() + '\n\n'
        msg += 'Opened from the ASHVALE design studio. Review before merging; nothing is inscribed by this PR.\n'
        subprocess.check_call(['git', '-C', wt, 'commit', '-m', msg], timeout=30)
        subprocess.check_call(['git', '-C', wt, 'push', '-u', 'origin', 'HEAD:' + branch], timeout=90)
        body = '\n'.join([
            '## Summary',
            '- Studio suggestion **%s** (`%s`), id `%s`.' % (d['name'], d['class'], d['id']),
            '- Author: %s' % (d.get('author') or 'unsigned'),
            '',
            '## Note',
            (d.get('note') or 'No extra note.'),
            '',
            '## Test plan',
            '- [ ] Part validates in the design studio preview',
            '- [ ] `node tests/core_test.js` if items/rules changed',
            '- [ ] Look at it in-game before inscribing',
        ])
        pr = subprocess.check_output(
            ['gh', 'pr', 'create', '--repo', github_repo(remote), '--base', 'main', '--head', branch,
             '--title', 'Suggestion: %s (%s)' % (d['name'], d['class']), '--body', body],
            text=True, timeout=60, cwd=wt)
        return {'ok': True, 'branch': branch, 'url': pr.strip(), 'files': list(files)}
    finally:
        try:
            subprocess.check_call(['git', '-C', ROOT, 'worktree', 'remove', '-f', wt], timeout=30)
        except Exception:
            shutil.rmtree(wt, ignore_errors=True)


def github_repo(url):
    u = url.rstrip('.git')
    if u.startswith('git@github.com:'):
        return u.split(':', 1)[1]
    if 'github.com/' in u:
        return u.split('github.com/', 1)[1]
    return u


def send(h, code, body, ctype='application/json'):
    data = body if isinstance(body, (bytes, bytearray)) else (body if isinstance(body, str) else json.dumps(body)).encode('utf-8')
    h.send_response(code)
    h.send_header('Content-Type', ctype + ('; charset=utf-8' if not ctype.startswith('image') else ''))
    h.send_header('Cache-Control', 'no-store')
    h.send_header('Content-Length', str(len(data)))
    h.end_headers()
    h.wfile.write(data)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys_stderr = __import__('sys').stderr
        sys_stderr.write('studio: ' + (fmt % args) + '\n')

    def read_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 2_000_000:
            raise ValueError('body too large')
        return json.loads(self.rfile.read(n).decode('utf-8') or '{}')

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == '/api/catalog':
            return send(self, 200, catalog())
        if path == '/api/parts':
            return send(self, 200, sorted(fn[:-5] for fn in os.listdir(PARTS) if fn.endswith('.json')))
        if path == '/api/designs':
            return send(self, 200, list_drafts())
        m = re.match(r'^/api/designs/([a-z][a-z0-9_]{1,40})$', path)
        if m:
            d = jload(draft_path(m.group(1)))
            return send(self, 200 if d else 404, d or {'error': 'not saved'})
        m = re.match(r'^/api/part/([a-z0-9_.]+)$', path)
        if m:
            p = jload(os.path.join(PARTS, m.group(1) + '.json')) or jload(os.path.join(PARTS, 'part.' + m.group(1) + '.json'))
            if not p:
                # char.wolf lives as char.wolf.json
                cand = os.path.join(PARTS, m.group(1) + '.json')
                p = jload(cand)
            return send(self, 200 if p else 404, p or {'error': 'no such part'})
        return self.static(path)

    def do_PUT(self):
        path = urllib.parse.urlparse(self.path).path
        m = re.match(r'^/api/designs/([a-z][a-z0-9_]{1,40})$', path)
        if not m:
            return send(self, 404, {'error': 'nope'})
        try:
            d = self.read_json()
            d['id'] = m.group(1)
            d['updated'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            validate_design(d)
            write_json(draft_path(d['id']), d)
            return send(self, 200, {'ok': True, 'id': d['id']})
        except Exception as e:
            return send(self, 400, {'error': str(e)})

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        m = re.match(r'^/api/suggest/([a-z][a-z0-9_]{1,40})$', path)
        if m:
            try:
                d = jload(draft_path(m.group(1)))
                if not d:
                    d = self.read_json()
                    d['id'] = m.group(1)
                else:
                    try:
                        extra = self.read_json()
                        if extra:
                            d.update(extra)
                    except Exception:
                        pass
                return send(self, 200, suggest(d))
            except Exception as e:
                return send(self, 400, {'error': str(e)})
        if path == '/api/import':
            try:
                raw = self.read_json()
                text = raw.get('text') or ''
                name = raw.get('name') or 'import.json'
                if name.lower().endswith('.json'):
                    j = json.loads(text)
                    if j.get('ashvale3d') == 'module' and j.get('data'):
                        j = j['data']
                    if j.get('ashvale3d') != 'part':
                        raise ValueError('that JSON is not an ASHVALE part')
                    why = validate_part(j)
                    if why:
                        raise ValueError(why)
                    return send(self, 200, {'ok': True, 'kind': 'part', 'part': j})
                raise ValueError('import a .json part (PNG colours are handled in the page)')
            except Exception as e:
                return send(self, 400, {'error': str(e)})
        return send(self, 404, {'error': 'nope'})

    def static(self, path):
        if path == '/':
            path = '/studio/index.html'
        if path.startswith('/studio/'):
            fs = os.path.join(STU, path[len('/studio/'):])
        elif path.startswith('/src/') or path.startswith('/data/') or path.startswith('/vendor/') or path.startswith('/dist/'):
            fs = os.path.join(ROOT, path.lstrip('/'))
        else:
            return send(self, 404, 'not found', 'text/plain')
        fs = os.path.realpath(fs)
        if not (fs.startswith(os.path.realpath(STU)) or fs.startswith(os.path.realpath(ROOT))) or not os.path.isfile(fs):
            return send(self, 404, 'not found', 'text/plain')
        ext = os.path.splitext(fs)[1]
        ctype = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'}.get(ext, 'application/octet-stream')
        with open(fs, 'rb') as f:
            return send(self, 200, f.read(), ctype)


def main():
    port = int(__import__('sys').argv[1]) if len(__import__('sys').argv) > 1 else 8760
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print('ASHVALE design studio  http://127.0.0.1:%d/' % port)
    print('drafts in studio/drafts/   GitHub suggestions open PRs against origin/main')
    srv.serve_forever()


if __name__ == '__main__':
    main()
