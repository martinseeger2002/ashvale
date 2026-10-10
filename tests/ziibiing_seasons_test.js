'use strict';
/* Seasonal quests and Migizi's canoes (2026-10-09, handoff/ziibiing_seasons_snare_canoe_plan.md):
   - a quest with a `season` is not offered out of it: its giver says when it opens (Mishoomis: the manoomin (wild rice) is not
     ripe; Nookomis: the sap is not running), and the chat gives the real time; an open quest is offered before a shut one;
   - seasons.js open/until agree with each other;
   - no free canoe at the Ziibiing landing: Migizi builds a jiimaan (canoe) from four wiigwaas (birch bark) and two ojiitad
     (sinew) in two game days and sets it at the landing, where anyone may take it; an older order for his bucket still comes.
   node tests/ziibiing_seasons_test.js */
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js'), AshSeasons = require('../src/seasons.js');
const DD = path.join(__dirname, '..', 'data'), mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
const zones = ['village', 'ziibiing', 'lodges', 'sugarcamp', 'ricelake', 'flintbank', 'obsidianbank'].map(z => Object.assign({ id: z }, mod('zone.' + z)));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };

function born(home, seed) {
  const core = AshCore.create(D, { seed: seed || 'zseas' }); core.setNewHome(home); const p = core.addPlayer('p1', null);
  for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
  core.grantItem('p1', 'asemaa', 5);   /* asemaa (tobacco) to ask the elders with (a Ziibiing-born starts with 5) */
  const msgs = [], offers = [], evs = [];
  const run = (n) => { for (let i = 0; i < n; i++) for (const e of core.tick()) { evs.push(e); if (e.p !== 'p1') continue; if (e.e === 'msg') msgs.push(e.text); if (e.e === 'dialog') { msgs.push(e.lines.join(' ')); if (e.offer) offers.push(e.offer); } } };
  const near = (x, y) => { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (!core.M.blocked(x + dx, y + dy)) { p.x = x + dx; p.y = y + dy; return; } };
  const talk = (id) => { const n = core.M.npcs.find(q => q.id === id); near(n.x, n.y); p.path = []; p.act = null; msgs.length = 0; offers.length = 0; core.cmd('p1', { c: 'npc', id }); run(3); return msgs.join(' | '); };
  const has = (id) => p.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
  const give = (id, n) => core.grantItem('p1', id, n || 1);
  return { core, p, run, talk, has, give, offers, msgs, evs };
}
const shut = (kind, days) => ({ [kind]: { open: false, days } }), open = (kind) => ({ [kind]: { open: true, days: 0 } });

/* seasons.js: until() names the first day open() is true */
{
  const S = AshSeasons.create({ epoch: 1791353761, dayS: 7200 }), t = 1791353761000 + 30 * 7200000, lat = 60.78;
  for (const k of ['rice', 'sap', 'spring', 'summer', 'autumn', 'winter']) {
    const u = S.until(k, lat, t);
    const good = u.open ? S.open(k, lat, t) : (u.days != null && S.open(k, lat, t + u.days * 7200000) && !S.open(k, lat, t + (u.days - 1) * 7200000));
    ok(good, 'seasons: ' + k + ' ' + (u.open ? 'open now' : 'opens in ' + u.days + ' days'));
  }
}
/* the wild rice, out of season */
{
  const A = born('ashvale', 'sa');
  A.core.setNature({ day: 30, year: 1, hours: 720, seasons: shut('rice', 12) });
  let t = A.talk('mishoomis');
  ok(!A.offers.length && /not ripe/.test(t) && /in about 12 days/.test(t), 'Mishoomis: the manoomin (wild rice) is not ripe, come back in about 12 days (' + t.slice(0, 70) + ')');
  ok(A.msgs.some(m => /Manoomin opens in about 12 days \(about 24 hours of real time\)/.test(m)), 'the chat gives the real time (' + A.msgs.find(m => /opens/.test(m)) + ')');
  A.core.setNature({ day: 30, year: 1, hours: 720, seasons: shut('rice', 1) });
  t = A.talk('mishoomis'); ok(/Come back tomorrow/.test(t), 'one day to go: "tomorrow"');
  A.core.setNature({ day: 42, year: 1, hours: 1008, seasons: open('rice') });
  t = A.talk('mishoomis'); ok(A.offers[0] === 'manoomin', 'in the ricing moon he sends you out (' + A.offers.join() + ')');
  const B = born('ashvale', 'sb'); t = B.talk('mishoomis');
  ok(B.offers[0] === 'manoomin', 'with no sky (a test, a headless host) every season is open, as before');
}
/* an open quest before a shut one, and one under way is never stopped */
{
  const Z = born('ziibiing', 'sz');
  Z.core.setNature({ day: 30, year: 1, hours: 720, seasons: shut('rice', 40) });
  const n = Z.core.M.npcs.find(q => q.id === 'mishoomis'); n.quests = ['manoomin', 'biiwaanag'];
  Z.talk('mishoomis'); ok(Z.offers[0] === 'biiwaanag', 'the wild rice shut: Mishoomis offers the flint first even listed second (' + Z.offers.join() + ')');
  Z.core.setNature({ day: 30, year: 1, hours: 720, seasons: open('rice') });
  Z.talk('mishoomis'); Z.core.cmd('p1', { c: 'acceptq', q: Z.offers[0] }); Z.run(1);
  Z.p.quests = { manoomin: { step: 1, n: 0 } };
  Z.core.setNature({ day: 30, year: 1, hours: 720, seasons: shut('rice', 300) });
  const t = Z.talk('mishoomis'); ok(!/not ripe/.test(t), 'a quest already under way goes on out of season (' + t.slice(0, 50) + ')');
}
/* the sugar bush, out of season; and next spring */
{
  const Z = born('ziibiing', 'ss');
  Z.core.setNature({ day: 30, year: 1, hours: 720, sap: { season: false }, seasons: shut('sap', 60) });
  let t = Z.talk('nookomis');
  ok(!Z.offers.length && /not running/.test(t) && /in about 60 days/.test(t), 'Nookomis: the sap is not running yet, about 60 days (' + t.slice(0, 60) + ')');
  ok(Z.msgs.some(m => /about 5 days of real time/.test(m)), 'real time: about 5 days');
  Z.core.setNature({ day: 90, year: 1, hours: 2160, sap: { season: true, day: true }, seasons: open('sap') });
  Z.talk('nookomis'); ok(Z.offers[0] === 'sugar_bush', 'when the sap runs she offers the sugar bush');
  Z.p.quests.sugar_bush = { step: 4, n: 0, yr: 1 };
  Z.core.setNature({ day: 455, year: 2, hours: 10920, sap: { season: true }, seasons: shut('sap', 3) });
  t = Z.talk('nookomis'); ok(Z.p.quests.sugar_bush.step === 4, 'next year, before the sap runs, she does not ask again yet');
  Z.core.setNature({ day: 458, year: 2, hours: 10992, sap: { season: true }, seasons: open('sap') });
  t = Z.talk('nookomis'); ok(Z.p.quests.sugar_bush.step === 1 && Z.p.quests.sugar_bush.again, 'when it runs she asks again (' + t.slice(0, 40) + ')');
}
/* no free canoe; Migizi builds one */
{
  const Z = born('ziibiing', 'sc'), core = Z.core, p = Z.p;
  ok(!core.M.objects.some(o => o.k === 'canoe' && o.x >= 56 && o.x < 112 && o.y >= 588 && o.y < 624), 'no free canoe waits at the Ziibiing landing');
  p.x = 89; p.y = 620; core.cmd('p1', { c: 'board', x: 89, y: 621 }); Z.run(5);
  ok(!p.boat, 'nothing to board at the landing');
  core.setNature({ day: 100, year: 1, hours: 2400 });
  let t = Z.talk('migizi');
  ok(/four sheets of wiigwaas/.test(t), 'Migizi says what a jiimaan (canoe) takes (' + t.slice(0, 60) + ')');
  Z.give('wiigwaas', 4); Z.give('sinew', 2);
  Z.evs.length = 0; t = Z.talk('migizi');
  const ask = Z.evs.find(e => e.e === 'dialog' && e.make);
  ok(ask && ask.make.length === 2 && Z.has('wiigwaas') === 4 && ask.make.some(m => /canoe/.test(m.label)), 'with enough for a bucket or a canoe he asks which (' + (ask ? ask.make.map(m => m.label).join(' / ') : 'no choice') + ')');
  Z.msgs.length = 0; core.cmd('p1', { c: 'craft', npc: 'migizi', i: ask.make.find(m => /canoe/.test(m.label)).i }); Z.run(2); t = Z.msgs.join(' | ');
  ok(!Z.has('wiigwaas') && !Z.has('sinew') && /two days/.test(t), 'a canoe: he takes four wiigwaas (birch bark) and two ojiitad (sinew), two days (' + t.slice(0, 50) + ')');
  core.setNature({ day: 101, year: 1, hours: 2424 });
  t = Z.talk('migizi'); ok(/still on the frame/.test(t), 'a day later it is still on the frame');
  core.setNature({ day: 102, year: 1, hours: 2448 });
  Z.evs.length = 0; t = Z.talk('migizi');
  const land = Z.evs.find(e => e.e === 'boatland');
  ok(land && land.x === 89 && land.y === 621 && land.by === 'p1' && /in the water at the landing/.test(t), 'two days later he sets it in the water at the landing (told to the Bank as yours)');
  const C = born('ashvale', 'sc2'); C.core.setNature({ day: 1, year: 1, hours: 24 });
  C.core.setBoats([80, 610, 100, 630], [[89, 621, land.face]]);
  C.p.x = 89; C.p.y = 620; C.core.cmd('p1', { c: 'board', x: 89, y: 621 }); C.run(5);
  ok(C.p.boat === 1, 'anyone may paddle it (an Ashvale-born gets in)');
  /* an order from before the canoes (his bucket was his only craft) still comes */
  const O = born('ziibiing', 'so'); O.core.setNature({ day: 200, year: 1, hours: 4800 });
  O.p.orders = { migizi: { ready: 199 } };
  t = O.talk('migizi'); ok(O.has('bucket_bark') === 1, 'an older order for the bucket is still handed over (' + t.slice(0, 40) + ')');
  /* orders are saved */
  const sv = core.exportPlayer('p1'); const R = AshCore.create(D, { seed: 'sr' }); R.setNewHome('ziibiing');
  Z.give('wiigwaas', 4); Z.give('sinew', 2); Z.talk('migizi'); core.cmd('p1', { c: 'craft', npc: 'migizi', i: 1 }); Z.run(2);
  const sv2 = core.exportPlayer('p1'), q2 = R.addPlayer('p2', sv2);
  ok(q2.orders && q2.orders['migizi:boat'], 'a canoe on order is saved with you and comes back after a reload');
  /* 2026-10-09: "I brought the canoe builder the stuff... left the game and came back. He's asking for the stuff again."
     The work goes on in game time while you are away: order the bucket, leave, come back a game day later, and it is ready */
  { const W = born('ziibiing', 'away'); W.core.setNature({ day: 300, year: 1, hours: 7200 });
    W.give('wiigwaas', 2); W.give('sinew', 1); W.talk('migizi'); W.core.cmd('p1', { c: 'craft', npc: 'migizi', i: 0 }); W.run(2);
    const placed = W.p.orders && Object.keys(W.p.orders).length, sv3 = W.core.exportPlayer('p1');
    const B = born('ziibiing', 'back'); B.core.setNature({ day: 301, year: 1, hours: 7224 });
    const p3 = B.core.addPlayer('p3', sv3); B.p.orders = p3.orders; B.p.inv = p3.inv;
    const t3 = B.talk('migizi');
    ok(placed && B.has('bucket_bark') === 1, 'a bucket ordered before you leave is ready when you come back a game day later (' + String(t3).slice(0, 50) + ')'); }
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
