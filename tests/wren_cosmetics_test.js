/* hats, capes and the robe cut left character creation; Wren sells them as cosmetic NFTs on right-click Trade */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: [Object.assign({ id: 'village' }, mod('zone.village'))] };
const RI = D.rules.items;
const robes = ['robe_linen', 'robe_red', 'robe_blue', 'robe_green', 'robe_purple', 'robe_black', 'robe_gold'];
const hats = ['hat_cap', 'hat_bandana', 'hat_hood', 'hat_feather', 'hat_wizard', 'hat_crown'];
const capes = ['cape_red', 'cape_blue', 'cape_green', 'cape_purple', 'cape_black', 'cape_gold'];

ok(RI.categories.cosmetic.indexOf('robe') >= 0 && RI.slots['cosmetic/robe'] === 'body', 'rules: cosmetic/robe equips to body');
ok(hats.concat(capes, robes).every(id => D.items[id] && D.items[id].category === 'cosmetic'), 'every Wren cosmetic is category cosmetic (NFT gear)');
ok(robes.every(id => AshCore.validItem(D.items[id], RI).ok), 'robe items pass validItem');

const c = AshCore.create(D, { seed: 'wren-cos' });
const it = id => c.item(id);
ok(it('hat_cap').eq === 'head' && it('cape_red').eq === 'cape' && it('robe_linen').eq === 'body', 'hat -> head, cape -> cape, robe -> body');

const wren = (D.zones[0].npcs || []).find(n => n.id === 'wren');
ok(wren && wren.tailor && wren.shop === 'tailor', 'Wren is the makeover NPC and keeps a shop');
const stock = D.shops.shops.tailor.stock;
ok(hats.every(id => stock.indexOf(id) >= 0) && capes.every(id => stock.indexOf(id) >= 0) && robes.every(id => stock.indexOf(id) >= 0),
   'Wren\'s shop stocks the hats, capes and robes that left the creator');

const p = c.addPlayer('p1');
p.x = wren.x; p.y = wren.y;
p.inv[0] = { id: 'coins', n: 5000 };

function until(pred, n) { let ev = []; for (let i = 0; i < n; i++) { ev = ev.concat(c.tick()); if (pred(ev)) return ev; } return ev; }
c.cmd('p1', { c: 'npc', id: 'wren' });
const t1 = until(ev => ev.some(e => e.e === 'tailor' || e.e === 'shop'), 20);
ok(t1.some(e => e.e === 'tailor' && e.npc === 'wren') && !t1.some(e => e.e === 'shop'),
   'plain click on Wren opens the fitting room, not the shop');

c.cmd('p1', { c: 'npc', id: 'wren', trade: 1 });
const t2 = until(ev => ev.some(e => e.e === 'shop'), 20);
ok(t2.some(e => e.e === 'shop' && e.shop === 'tailor') && p.shop === 'tailor',
   'right-click Trade on Wren opens her shop');

c.cmd('p1', { c: 'buy', shop: 'tailor', item: 'hat_cap', n: 1 }); c.tick();
c.cmd('p1', { c: 'buy', shop: 'tailor', item: 'cape_blue', n: 1 }); c.tick();
c.cmd('p1', { c: 'buy', shop: 'tailor', item: 'robe_linen', n: 1 }); c.tick();
ok(c.invCount(p, 'hat_cap') === 1 && c.invCount(p, 'cape_blue') === 1 && c.invCount(p, 'robe_linen') === 1, 'bought a hat, a cape and a robe');

const hi = p.inv.findIndex(s => s && s.id === 'hat_cap');
const ci = p.inv.findIndex(s => s && s.id === 'cape_blue');
const ri = p.inv.findIndex(s => s && s.id === 'robe_linen');
c.cmd('p1', { c: 'equip', slot: hi }); c.tick();
c.cmd('p1', { c: 'equip', slot: ci }); c.tick();
c.cmd('p1', { c: 'equip', slot: ri }); c.tick();
ok(p.eq.head && p.eq.head.id === 'hat_cap' && p.eq.cape && p.eq.cape.id === 'cape_blue' && p.eq.body && p.eq.body.id === 'robe_linen',
   'the bought cosmetics wear in head, cape and body');

c.cmd('p1', { c: 'look', look: { body: 'female', hair: 'long', hat: { style: 'wizard', color: '#3f5d8a' }, cape: '#8a2a2a', shirt: { style: 'robe', color: '#4f6d3a' }, pants: { style: 'robe', color: '#4f6d3a' } } });
c.tick();
const L = c.exportPlayer('p1').look;
ok(L.body === 'female' && L.hair === 'long' && !('hat' in L) && !('cape' in L) && L.shirt.style === 'tunic' && L.pants.style === 'trousers',
   'look no longer keeps a free hat, cape or robe cut');

if (fails) { console.log(fails + ' FAIL'); process.exit(1); }
console.log('ALL OK');
