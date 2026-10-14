'use strict';
/* [Claude 2026-10-13] The Spider Queen's crown, once per adventurer (the operator: "the spider queen stopped giving away her crown ...
   Once per player"): monster data award {item, once}. The killer's own game leaves the crown at the kill, theirs, the first
   time only; the flag is saved; someone already carrying or wearing a crown is not given another.  node tests/spidercrown_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['spidercave', 'village'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const crowns = (c, pid) => c.S.ground.filter(g => g.id === 'hat_spidercrown' && (pid == null || g.owner === pid)).length;

const Q = D.monsters.spider_queen;
ok(!Q.drops.some(d => d.item === 'hat_spidercrown') && Q.award && Q.award.item === 'hat_spidercrown', 'the crown is no random drop any more: it is the Queen\'s award');
ok(!!D.rules.flags[Q.award.once], 'and its flag is a saved flag (rules.flags)');

const c = AshCore.create(D, { seed: 'crown' }), p = c.addPlayer('me', { name: 'Ada' });
c.creditKill('me', 'spider_queen', p.x + 1, p.y);
ok(crowns(c, 'me') === 1, 'the first Spider Queen she kills leaves one crown, hers: ' + crowns(c, 'me'));
c.creditKill('me', 'spider_queen', p.x + 1, p.y);
ok(crowns(c) === 1, 'the second leaves no other');
const save = c.exportPlayer('me');
const c2 = AshCore.create(D, { seed: 'crown2' }); c2.addPlayer('me', save);
c2.creditKill('me', 'spider_queen', 5, 5);
ok(crowns(c2) === 0, 'and after a save and a reload she is still remembered as having had it');

const c3 = AshCore.create(D, { seed: 'crown3' }), w = c3.addPlayer('me', { name: 'Wren' });
c3.grantItem('me', 'hat_spidercrown', 1);
c3.creditKill('me', 'spider_queen', 5, 5);
ok(crowns(c3) === 0 && c3.S.players.me.flags && c3.S.players.me.flags.spidercrown, 'someone already carrying a crown gets no second one (and is marked as having had it)');

const c4 = AshCore.create(D, { seed: 'crown4' }); c4.addPlayer('me', { name: 'Bo' }); c4.addPuppet('g', { n: 'Guest' });
c4.creditKill('g', 'spider_queen', 5, 5);
ok(crowns(c4) === 0, 'a guest\'s kill is credited on the guest\'s own game, not by the host (no crown for a puppet)');
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
