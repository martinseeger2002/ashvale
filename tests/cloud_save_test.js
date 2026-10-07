/* the save the Bank keeps (2026-10-07): slimmed (no nulls or empty objects) it still loads
   into exactly the same player, and packed it stays small enough for a few room messages */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');
const slim = eval('(' + src.match(/const slim = (v => \{[\s\S]*?\n    \});/)[1] + ')');
const zones = ['village', 'whisperwood', 'saltmere'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const c = AshCore.create(D, { seed: 'cloud' }), p = c.addPlayer('p1', null);
const ids = Object.keys(D.items).filter(k => !D.items[k].eq); for (let i = 0; i < 20; i++) p.inv[i] = { id: ids[i * 5 % ids.length], n: 1 + (i * 37) % 900 };
p.inv[24] = null; for (const s of Object.keys(p.xp)) p.xp[s] = 1000 + s.length * 77;
const qs = Object.keys(D.quests.quests || D.quests).slice(0, 6); qs.forEach((q, i) => { p.quests[q] = { step: 1 + i % 3, n: i }; });
const FL = Object.keys(D.rules.flags || {}); p.flags = FL.length ? { [FL[0]]: 1 } : {}; p.attuned = { portal_ashvale: 1 }; p.town = 'saltmere'; p.hp = 9;
const full = c.exportPlayer('p1'), json = JSON.stringify(full), sl = slim(JSON.parse(json));
const load = sv => { const cx = AshCore.create(D, { seed: 'cloud' }); cx.addPlayer('px', sv); return cx.exportPlayer('px'); };
const a = load(JSON.parse(json)), back = load(sl);
ok(JSON.stringify(back) === JSON.stringify(a), 'a slimmed save loads into the same player as the full one (' + json.length + ' B -> ' + JSON.stringify(sl).length + ' B)');
if (JSON.stringify(back) !== JSON.stringify(a)) for (const k in a) if (JSON.stringify(a[k]) !== JSON.stringify(back[k])) console.log('   differs:', k, JSON.stringify(a[k]).slice(0, 120), '->', JSON.stringify(back[k]).slice(0, 120));
const packed = zlib.deflateRawSync(Buffer.from(JSON.stringify(sl))).toString('base64');
ok(packed.length < 2000, 'packed it is ' + packed.length + ' B, ' + Math.ceil(packed.length / 380) + ' room message(s)');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
