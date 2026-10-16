'use strict';
/* The Heart Below: a four-floor vertical dungeon whose x/y footprint stays under the ruined keep. */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'whisperwood', 'saltmere', 'spidercave', 'ancientchapel', 'evengrove', 'dragonapproach', 'dragonkeep'].map(id => Object.assign({ id }, mod('zone.' + id)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
const core = AshCore.create(D, { seed: 'dragon-heart-test' }), p = core.addPlayer('p1', { name: 'Tester' });
let fails = 0;
const ok = (yes, text) => { if (!yes) fails++; console.log(yes ? 'ok  ' : 'FAIL', text); };
const ticks = n => { const out = []; for (let i = 0; i < n; i++) out.push(...core.tick()); return out; };
const done = id => { const Q = D.quests.quests[id]; p.quests[id] = { step: Q.steps.length + 1, n: 0 }; };
const beside = o => { p.x = o.x + (o.x < -51 ? 1 : -1); p.y = o.y; p.path = []; p.act = null; p.dead = 0; p.hp = core.maxHp(p); };
const talk = id => { const n = core.M.npcs.find(x => x.id === id); beside(n); core.cmd('p1', { c: 'npc', id }); return ticks(4).find(e => e.e === 'dialog' && e.p === 'p1'); };
const use = o => { beside(o); core.cmd('p1', { c: o.k === 'mechanism' ? 'mechanism' : 'enter', x: o.x, y: o.y }); return ticks(4); };
for (const sk of D.rules.skills) p.xp[sk] = core.xpFor(99) * 10;
p.pp = 99;
for (const id of ['wayside_prayer', 'red_pyre', 'even_grove', 'even_guard', 'foolhardy_hero']) done(id);

let dlg = talk('squire_elian');
ok(dlg && dlg.offer === 'dragon_heart', 'Elian offers The Heart Below after both prerequisite quests');
core.cmd('p1', { c: 'acceptq', q: 'dragon_heart' }); ticks(1);
core.creditKill('p1', 'chain_dragon', -54, -99);
dlg = talk('squire_elian');
ok(dlg && /returned Sir Garran's bones/i.test(dlg.lines.join(' ')) && /Father Aldous/i.test(dlg.lines.join(' ')), 'Elian nervously sends the dragon slayer to Father Aldous');
dlg = talk('aldous');
ok(dlg && /just a video game/i.test(dlg.lines.join(' ')) && /not the point/i.test(dlg.lines.join(' ')), 'Aldous and the player have the requested fourth-wall exchange');
ok(core.invCount(p, 'dragonheart_key') === 1 && core.item('dragonheart_key').bound, 'Aldous gives a bound Dragon-Heart Key');
ok(p.quests.dragon_heart.step === 3, 'the dungeon objective opens after speaking to Aldous');

const dragon = core.S.mobs.find(m => m.key === 'chain_dragon'); beside(dragon); core.cmd('p1', { c: 'mobtalk', uid: dragon.uid });
dlg = ticks(1).find(e => e.e === 'dialog');
ok(dlg && /four chambers directly beneath this keep/i.test(dlg.lines.join(' ')) && /will not solve/i.test(dlg.lines.join(' ')) && !/Mining|Firemaking|level 15|pickaxe|tinderbox/i.test(dlg.lines.join(' ')), 'the dragon establishes the dungeon without giving away its puzzle answers');

const objs = D.zones.find(z => z.id === 'dragonkeep').objects;
const hatch = objs.find(o => o.k === 'hatch' && (o.lv | 0) === 0);
let unlockEvents = use(hatch);
ok(p.lv === -1 && p.x >= -58 && p.x <= -51 && p.y >= -103 && p.y <= -96, 'the hatch changes only vertical level and keeps the player beneath the keep footprint');
ok(unlockEvents.some(e => e.e === 'dialog' && e.unlock && /main hatch unlocks/i.test(e.lines.join(' '))), 'the Dragon-Heart Key produces an unlock dialogue and sound event instead of a chat notice');

const mech = id => objs.find(o => o.k === 'mechanism' && o.id === id);
const down = lv => objs.find(o => o.k === 'hatch' && o.lv === lv);
const put = id => { const i = p.inv.findIndex(s => !s); p.inv[i] = { id, n: 1 }; };
const flags = (...ks) => ks.every(k => core.hasFlag(p, k));
const mithrilPool = ['helmet_t4', 'body_t4', 'legs_t4', 'chain_t4', 'shield_t4', 'sword_t4', 'dagger_t4', 'longsword_t4', 'mace_t4'];
const isMithrilRoll = d => d && d.one_in === 10 && Array.isArray(d.any) && d.any.length === mithrilPool.length && mithrilPool.every(id => d.any.includes(id));
ok(D.monsters.goblin_chief.drops.some(isMithrilRoll) && !D.monsters.goblin_chief.drops.some(d => d.item === 'mace_t4' && d.one_in === 1), 'the goblin chief rolls one random Mithril equipment item at 1 in 10 instead of always dropping a mace');
ok([-1, -2, -3, -4].every(lv => objs.some(o => o.k === 'heartladder' && o.lv === lv && o.level === 0 && !o.need)), 'every underground floor has an unconditional retreat ladder');
ok(core.M.buildingAt(-60, -105, -3) === p.bld && core.M.buildingAt(-60, -105, 0) !== p.bld, 'deeper floor bounds can extend beyond the keep footprint above');
put('pickaxe');
let pickSlot = p.inv.findIndex(s => s && s.id === 'pickaxe'); core.cmd('p1', { c: 'drop', slot: pickSlot }); ticks(1);
let pickDrop = core.S.ground.find(g => g.id === 'pickaxe');
ok(pickDrop && pickDrop.lv === -1, 'a pickaxe dropped underground remains on the current dungeon floor');
core.cmd('p1', { c: 'take', uid: pickDrop.uid }); ticks(2);
ok(core.invCount(p, 'pickaxe') === 1 && !core.S.ground.some(g => g.uid === pickDrop.uid), 'the underground pickaxe can be picked back up');
pickSlot = p.inv.findIndex(s => s && s.id === 'pickaxe'); p.inv[pickSlot] = null;

let hint = use(mech('iron_root')).map(e => e.text || '').join(' ');
ok(!core.hasFlag(p, 'heart_iron_tuned'), 'the mining seal refuses a player without a pickaxe');
ok(/need a pickaxe/i.test(hint), 'the obstacle itself hints that a pickaxe is missing');
put('pickaxe'); p.xp.mining = core.xpFor(14) * 10;
hint = use(mech('iron_root')).map(e => e.text || '').join(' ');
ok(!core.hasFlag(p, 'heart_iron_tuned'), 'the mining seal requires Mining 15');
ok(/Mining level 15/i.test(hint), 'after the tool is present, the obstacle reveals the Mining 15 requirement');
p.xp.mining = core.xpFor(15) * 10;
unlockEvents = use(mech('iron_root'));
ok(core.hasFlag(p, 'heart_iron_tuned'), 'a pickaxe and Mining 15 tune the first seal');
ok(unlockEvents.some(e => e.e === 'dialog' && e.unlock && /hatch to the echo chamber/i.test(e.lines.join(' '))), 'the first hatch unlock is a dialogue event marked for its sound');
use(down(-1)); ok(p.lv === -2, 'the unlocked stair descends to floor -2 at the same world location');
use(mech('echo_seal'));
for (const k of ['giant_spider', 'wraith', 'ash_knight']) core.creditKill('p1', k, p.x, p.y);
unlockEvents = core.S.ev.slice(); ticks(1);
ok(core.hasFlag(p, 'heart_echo_cleared'), 'the mixed first guardian wave unlocks the next floor');
ok(unlockEvents.some(e => e.e === 'dialog' && e.unlock && /hatch to the balance chamber/i.test(e.lines.join(' '))), 'the guardian hatch unlock is shown in a dialogue instead of chat');
ok(mech('echo_seal').summon.every(s => s.loot && s.drops.some(d => /potion|lobster|_t4$/.test(d.item || (d.any || []).join(' ')))), 'echo guardians carry dungeon food, potions, and Mithril drops');
ok(mech('echo_seal').summon.every(s => s.drops.filter(isMithrilRoll).length === 1), 'every echo guardian has exactly one 1-in-10 random Mithril equipment roll');
use(down(-2)); ok(p.lv === -3, 'the dungeon descends to floor -3');
const pad = id => objs.find(o => o.k === 'prayerpad' && o.id === id);
let hp = p.hp; p.x = pad('melee_rune').x; p.y = pad('melee_rune').y; ticks(1);
ok(p.hp === hp - 10 && core.hasFlag(p, 'heart_prayer_melee'), 'the melee rock deals exactly 10 without Protect from Melee');
core.cmd('p1', { c: 'pray', id: 'protect_from_missiles', on: true }); hp = p.hp; p.x = pad('ranged_rune').x; p.y = pad('ranged_rune').y; ticks(1);
ok(p.hp === hp && core.hasFlag(p, 'heart_prayer_ranged'), 'Protect from Missiles reduces the 20-damage arrow to zero');
core.cmd('p1', { c: 'pray', id: 'protect_from_magic', on: true }); hp = p.hp; p.x = pad('magic_rune').x; p.y = pad('magic_rune').y; unlockEvents = ticks(1);
ok(p.hp === hp && flags('heart_prayer_magic', 'heart_balance_tuned'), 'Protect from Magic reduces the 30-damage bolt to zero and all three runes open the hatch');
ok(unlockEvents.some(e => e.e === 'dialog' && e.unlock && /hatch to the Heart/i.test(e.lines.join(' '))), 'the prayer hatch unlock is shown in a dialogue instead of chat');
use(down(-3)); ok(p.lv === -4, 'the dungeon descends to the Heart floor -4');
hint = use(mech('war_seal')).map(e => e.text || '').join(' ');
ok(!core.hasFlag(p, 'heart_war_cleared') && !p.quests.dragon_heart.trial, 'the fire seal refuses a player without a tinderbox');
ok(/need a tinderbox/i.test(hint), 'the fire obstacle itself hints that a tinderbox is missing');
put('tinderbox'); p.xp.firemaking = core.xpFor(14) * 10; hint = use(mech('war_seal')).map(e => e.text || '').join(' ');
ok(!p.quests.dragon_heart.trial, 'the fire seal requires Firemaking 15');
ok(/Firemaking level 15/i.test(hint), 'after the tinderbox is present, the obstacle reveals the Firemaking 15 requirement');
p.xp.firemaking = core.xpFor(15) * 10;
use(mech('war_seal'));
for (const k of ['gale', 'keel', 'bramble']) core.creditKill('p1', k, p.x, p.y);
ok(core.hasFlag(p, 'heart_war_cleared'), 'the three-style micro-boss wave unlocks the Heart');
ok(mech('war_seal').summon.every(s => s.loot && s.drops.some(d => /potion|lobster|_t4$/.test(d.item || (d.any || []).join(' ')))), 'Heart guardians carry a spread of food, potions, and Mithril armour');
ok(mech('war_seal').summon.every(s => s.drops.filter(isMithrilRoll).length === 1), 'every Heart guardian has exactly one 1-in-10 random Mithril equipment roll');
use(mech('dragon_heart'));
ok(core.hasFlag(p, 'dragon_heart_reset'), 'resetting the Heart satisfies the final quest objective');
const ladder = objs.find(o => o.k === 'heartladder'); use(ladder);
ok(p.lv === 0 && p.x >= -58 && p.x <= -51 && p.y >= -103 && p.y <= -96, 'the always-open ladder returns vertically to the keep hatch');
beside(dragon); core.cmd('p1', { c: 'mobtalk', uid: dragon.uid }); dlg = ticks(1).find(e => e.e === 'dialog' && e.p === 'p1');
ok(dlg && /Father Aldous/i.test(dlg.lines.join(' ')) && /Heart is steady/i.test(dlg.lines.join(' ')), 'the dragon sends the player to Father Aldous after the Heart is reset');
dlg = talk('aldous');
ok(p.quests.dragon_heart.step > D.quests.quests.dragon_heart.steps.length && dlg && /Heart is balanced/i.test(dlg.lines.join(' ')), 'Father Aldous completes The Heart Below');

const deathCore = AshCore.create(D, { seed: 'dragon-heart-death' });
const fallen = deathCore.addPlayer('fallen', { inv: [{ id: 'coins', n: 50 }, { id: 'pickaxe', n: 1 }, { id: 'bread', n: 1 }] });
fallen.x = -54; fallen.y = -99; fallen.lv = -3; fallen.bld = deathCore.M.buildingAt(fallen.x, fallen.y, fallen.lv); fallen.hp = 1;
deathCore.applyHit('fallen', 99, 'melee', true);
const recovered = deathCore.S.ground.filter(g => g.from === 'fallen');
ok(recovered.length === 3 && recovered.every(g => g.x === -57 && g.y === -101 && g.lv === 0), 'a dungeon death moves every dropped item to the surface outside the main hatch');
const stale = recovered.find(g => g.id === 'pickaxe'), staleUid = stale && stale.uid;
for (let i = 0; i < 6; i++) deathCore.tick();
fallen.x = -57; fallen.y = -101; fallen.lv = 0; fallen.bld = -1;
deathCore.cmd('fallen', { c: 'take', uid: staleUid }); deathCore.tick();
ok(deathCore.invCount(fallen, 'pickaxe') === 1 && !deathCore.S.ground.some(g => g.uid === staleUid), 'the owner can recover the surface death drop once');
const deathZone = deathCore.zoneOf(-57, -101); deathCore.setAuth(deathZone, false);
deathCore.groundAdd(staleUid, 'pickaxe', 1, -57, -101, 'fallen', 0, 0);
ok(!deathCore.S.ground.some(g => g.uid === staleUid), 'a stale snapshot from another instance cannot recreate a recovered death drop');

// Three independent instances: the host awards a shared persisted pile once; both observers retire it permanently.
const clients = ['host', 'alice', 'bob'].map(id => { const c = AshCore.create(D, { seed: 'loot-race' }); const p = c.addPlayer(id, { inv: [] }); p.x = -57; p.y = -101; return { c, p }; });
const [server, alice, bob] = clients, bankUid = 4398046511104 + 123;
for (const { c, p } of clients) { c.setAuth(c.zoneOf(p.x, p.y), c === server.c); c.bankGround([-60, -104, -50, -95], [[123, 'coins', 50, -57, -101]]); }
for (const { c, p } of [alice, bob]) { c.cmd(p.id, { c: 'take', uid: bankUid }); const events = c.tick(); ok(events.some(e => e.e === 'claim') && c.invCount(p, 'coins') === 0, p.id + ' waits for the host before receiving persisted loot'); }
for (const id of ['alice', 'bob']) { const p = server.c.addPlayer(id, { inv: [] }); p.x = -57; p.y = -101; }
ok(server.c.claim('alice', bankUid) && !server.c.claim('bob', bankUid), 'two simultaneous claims have exactly one winner');
for (const { c } of [alice, bob]) c.groundRemove(bankUid);
alice.c.grantItem('alice', 'coins', 50, bankUid); alice.c.grantItem('alice', 'coins', 50, bankUid);
for (const { c } of clients) { c.bankGround([-60, -104, -50, -95], [[123, 'coins', 50, -57, -101]]); c.groundAdd(bankUid, 'coins', 50, -57, -101, null, 0, 0); }
ok(alice.c.invCount(alice.p, 'coins') === 50 && bob.c.invCount(bob.p, 'coins') === 0 && clients.every(({ c }) => !c.S.ground.some(g => g.uid === bankUid)), 'duplicate awards and stale Bank/host snapshots cannot restore the pile on any of the three instances');

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
