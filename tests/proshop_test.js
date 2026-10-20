/* proshop_test.js - the Saltmere Links Pro Shop (2026-10-19): four club sets sold only there for GOLD, at fixed
   prices (no Speechcraft discount), bought back only there at 40%; no other shop takes a golf set. Isla is not placed in a
   zone yet (the clubhouse will place her), so the test stands her in the village next to Tam. */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones: [Object.assign({ id: 'village' }, mod('zone.village'))] };
const RI = D.rules.items, SETS = { golf_starter: 500, golf_standard: 2500, golf_pro: 10000, golf_master: 40000 };
const PS = D.shops.shops.proshop;
ok(PS && PS.keeper === 'isla' && PS.fixed === true && PS.buyRate === 40 && JSON.stringify(PS.stock) === JSON.stringify(Object.keys(SETS)), 'the pro shop: Isla, fixed prices, buys back at 40%, stocks the four sets');
ok(Object.keys(SETS).every(id => D.items[id] && D.items[id].value === SETS[id] && D.items[id].category === 'tool' && D.items[id].subcategory === 'golfset' && D.items[id].collection === 'ASHVALE Saltmere Links'), 'four golf sets at 500 / 2,500 / 10,000 / 40,000 GOLD');
ok(Object.keys(SETS).every(id => AshCore.validItem(D.items[id], RI).ok), 'every set passes validItem');
ok(Object.keys(D.shops.shops).every(s => s === 'proshop' || Object.keys(SETS).every(id => D.shops.shops[s].stock.indexOf(id) < 0)), 'no other shop sells a golf set');
const assets = JSON.parse(fs.readFileSync(path.join(DD, 'assets.json'), 'utf8')).data.items;
ok(Object.keys(SETS).every(id => assets[id] && assets[id].kind === 'nft' && assets[id].collection === 'ASHVALE Saltmere Links' && assets[id].key === id), 'each set is an NFT of ASHVALE Saltmere Links');
const GR = require('../src/golfrules.js');
ok(['starter', 'standard', 'pro', 'master'].every(k => GR.SETS[k].price === SETS['golf_' + k]), 'src/golfrules.js SETS prices match the items');

const tam = D.zones[0].npcs.find(n => n.id === 'tam');
D.zones[0].npcs.push({ id: 'isla', name: 'Isla the club pro', look: 'isla', x: tam.x + 1, y: tam.y, shop: 'proshop' });
const c = AshCore.create(D, { seed: 'proshop' });
const p = c.addPlayer('p1', { xp: { speechcraft: c.xpFor(50) * 10 } });
p.x = tam.x; p.y = tam.y + 1;
p.inv = p.inv.map(() => null); p.inv[0] = { id: 'coins', n: 1000 };
ok(c.speechPct(p) > 0, 'the player has a Speechcraft discount elsewhere (' + c.speechPct(p) + '%)');
ok(c.priceBuy('general', 'hatchet', p) < D.items.hatchet.value, 'the General Store gives the discount (hatchet ' + c.priceBuy('general', 'hatchet', p) + ' < ' + D.items.hatchet.value + ')');
ok(Object.keys(SETS).every(id => c.priceBuy('proshop', id, p) === SETS[id]), 'pro shop prices stay fixed with Speechcraft');

function until(pred, n) { let ev = []; for (let i = 0; i < n; i++) { ev = ev.concat(c.tick()); if (pred(ev)) return ev; } return ev; }
c.cmd('p1', { c: 'npc', id: 'isla', trade: 1 }); until(ev => ev.some(e => e.e === 'shop'), 20);
ok(p.shop === 'proshop', 'trading with Isla opens the pro shop');
c.cmd('p1', { c: 'buy', shop: 'proshop', item: 'golf_starter', n: 1 }); c.tick();
ok(c.invCount(p, 'golf_starter') === 1 && c.invCount(p, 'coins') === 500, 'buying the Starter Set takes exactly 500 GOLD and adds it (' + c.invCount(p, 'coins') + ' left)');
c.cmd('p1', { c: 'buy', shop: 'proshop', item: 'golf_standard', n: 1 }); c.tick();
ok(c.invCount(p, 'golf_standard') === 0 && c.invCount(p, 'coins') === 500, 'cannot buy the Standard Set with 500 GOLD');

ok(c.priceSell('general', 'golf_starter', p) === -1, 'the General Store (buys any) will not buy a golf set');
ok(Object.keys(D.shops.shops).every(s => s === 'proshop' || c.priceSell(s, 'golf_starter', p) === -1), 'no shop but the pro shop buys a golf set (the chandler buys tools, not golf sets)');
ok(c.priceSell('general', 'hatchet', p) > 0 && c.priceSell('chandler', 'hatchet', p) > 0, 'other tools still sell to the General Store and the chandler');
ok(c.priceSell('proshop', 'golf_starter', p) === 200, 'the pro shop buys it back at 40% with no Speechcraft bonus (' + c.priceSell('proshop', 'golf_starter', p) + ')');
ok(c.priceSell('proshop', 'hatchet', p) === -1, 'the pro shop buys nothing but golf sets');

c.cmd('p1', { c: 'npc', id: 'tam', trade: 1 }); until(ev => ev.some(e => e.e === 'shop'), 20);
const slot = p.inv.findIndex(s => s && s.id === 'golf_starter');
c.cmd('p1', { c: 'sell', shop: 'general', slot, n: 1 }); c.tick();
ok(p.shop === 'general' && c.invCount(p, 'golf_starter') === 1 && c.invCount(p, 'coins') === 500, 'selling it to Tam does nothing');
c.cmd('p1', { c: 'npc', id: 'isla', trade: 1 }); until(ev => ev.some(e => e.e === 'shop'), 20);
c.cmd('p1', { c: 'sell', shop: 'proshop', slot: p.inv.findIndex(s => s && s.id === 'golf_starter'), n: 1 }); c.tick();
ok(c.invCount(p, 'golf_starter') === 0 && c.invCount(p, 'coins') === 700, 'Isla buys it back for 200 GOLD (' + c.invCount(p, 'coins') + ' now)');

if (fails) { console.log(fails + ' FAIL'); process.exit(1); }
console.log('ALL OK');
