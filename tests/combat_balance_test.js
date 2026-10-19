/* combat balance (2026-10-19, after OSRS; tools/combat/make_combat_balance.py): metal armour takes a share off magic and ranged
   accuracy, the same at every tier, a full set enough that a wizard in plate lands about one spell in ten; mage robes and the wizard
   hat give Magic; ranged armour gives a lot of Ranged, more Defence than robes and less than plate, and no magic penalty; the lower
   tiers are sold in town. node tests/combat_balance_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones };
const core = AshCore.create(D, { seed: 'balance' }), I = (id) => core.item(id), shops = D.shops.shops;
const sum = (ids, k) => ids.reduce((a, id) => a + ((I(id) || {})[k] || 0), 0);
const drag = (pct) => 1 - Math.min(92, pct) / 100;   /* = src/core.js armourDrag */
const pHit = (A, Dr) => A > Dr ? 1 - (Dr + 2) / (2 * (A + 1)) : A / (2 * (Dr + 1));   /* = rollAttack */

/* metal: every tier alike, a full set takes most of a spell's accuracy */
const metal = Object.keys(D.items).filter(k => ['platebody', 'chainbody', 'platelegs', 'helmet', 'kiteshield'].indexOf(D.items[k].subcategory) >= 0 && D.items[k].category === 'armour');
ok(metal.length >= 25 && metal.every(k => I(k).magicPen > 0 && I(k).rangedPen > 0), 'every metal piece (' + metal.length + ') weighs on spells and arrows');
ok([1, 2, 3, 4, 5].every(t => I('body_t' + t).magicPen === I('body_t1').magicPen), 'a bronze platebody hampers a spell as much as an adamant one (OSRS: all plate alike)');
const plate = ['helmet_t5', 'body_t5', 'legs_t5', 'shield_t5'], wiz = ['circle_hat', 'wizard_cloak', 'wizard_cloak_bottoms', 'wizard_focus'], hide = ['dragonhide_coif', 'dragonhide_body', 'dragonhide_chaps', 'dragonhide_boots'];
ok(sum(plate, 'magicPen') >= 85 && sum(plate, 'rangedPen') <= 30, 'a full set of plate takes ' + sum(plate, 'magicPen') + '% off magic accuracy, ' + sum(plate, 'rangedPen') + '% off ranged');
const L = 40, foes = ['goblin', 'bandit', 'wraith', 'ash_knight', 'lich', 'chain_dragon'].filter(k => D.monsters[k]);
const rate = (ids, cls) => { const b = sum(ids, cls) + sum([cls === 'magic' ? 'staff_t5' : 'bow_t5'], cls), pen = sum(ids, cls + 'Pen'), A = Math.floor((L + 8) * Math.max(1, b + 64) * drag(pen));
  return foes.reduce((a, k) => { const m = D.monsters[k]; return a + pHit(A, (m.def + 9) * (m.defb + 64)); }, 0) / foes.length; };
const inPlate = rate(plate, 'magic'), inRobes = rate(wiz, 'magic'), inHide = rate(hide, 'magic'), bare = rate([], 'magic');
ok(inPlate < 0.2, 'a level-40 wizard in full plate lands ' + Math.round(100 * inPlate) + '% of spells (lucky to hit one in ten)');
ok(inRobes > bare && inRobes > 0.7, 'in the Circle\'s robes ' + Math.round(100 * inRobes) + '% (a bare staff ' + Math.round(100 * bare) + '%)');
ok(Math.abs(inHide - bare) < 0.01, 'ranged armour does not hamper a spell (' + Math.round(100 * inHide) + '%)');
ok(rate(hide, 'ranged') - rate([], 'ranged') > 0.08, 'dragonhide lifts an archer from ' + Math.round(100 * rate([], 'ranged')) + '% to ' + Math.round(100 * rate(hide, 'ranged')) + '%');

/* defence: plate > hide > robes; robes the most Magic */
ok(sum(plate, 'defence') > sum(hide, 'defence') && sum(hide, 'defence') > sum(wiz, 'defence'), 'Defence: plate ' + sum(plate, 'defence') + ' > dragonhide ' + sum(hide, 'defence') + ' > robes ' + sum(wiz, 'defence'));
ok(sum(wiz, 'magic') > sum(hide, 'magic') && sum(hide, 'ranged') > 50, 'robes give Magic (+' + sum(wiz, 'magic') + '), hide gives Ranged (+' + sum(hide, 'ranged') + ')');
ok(I('hat_wizard').magic > 0 && ['apprentice_hat', 'adept_hat', 'mystic_hat', 'arcane_hat', 'circle_hat'].every(h => I(h) && I(h).magic > 0 && I(h).eq === 'head'), 'mage hats give Magic and go on the head');

/* plentiful: the first tiers in town shops */
ok(['apprentice_hat', 'apprentice_top', 'apprentice_bottoms'].every(i => shops.tailor.stock.indexOf(i) >= 0), 'Wren\'s in Ashvale sells the apprentice robes');
ok(['adept_top', 'mystic_top'].every(i => shops.salt_magic.stock.indexOf(i) >= 0) && shops.tower_magic.stock.indexOf('arcane_top') >= 0, 'the Enchantery sells adept and mystic, the Frostspire arcane');
ok(['leather_body', 'studded_body'].every(i => shops.armoury.stock.indexOf(i) >= 0) && shops.castle_armoury.stock.indexOf('dragonhide_body') >= 0, 'leather and studded at Garrick\'s, up to dragonhide at the castle');
ok(Object.keys(mod('assets').items).filter(k => /^(apprentice|adept|mystic|arcane|leather|studded|wolfhide|frosthide|dragonhide)_/.test(k)).length >= 32, 'every new piece is listed as a token to inscribe');
console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
