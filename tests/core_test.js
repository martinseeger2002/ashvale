/* Headless rules test: node tests/core_test.js
   Plays a scripted session against the real data modules, then replays the recorded commands and checks the hash matches. */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
function loadData() {
  const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort((a, b) => { const O = ['village', 'whisperwood', 'saltmere'], ia = O.indexOf(a), ib = O.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); }).map(z => Object.assign({ id: z }, mod('zone.' + z)));
  return { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg') };
}
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const D = loadData();
const core = AshCore.create(D, { seed: 'test-1' });
const save0 = { xp: { attack: 44700, strength: 44700, defence: 134000, hitpoints: 191000, ranged: 0, magic: 0 } };   /* Def 30, HP 35: the wolf pack must not win this scripted fight */
const p = core.addPlayer('p1', save0);
const msgs = [];
function run(n, stop) { for (let i = 0; i < n; i++) { const ev = core.tick(); for (const e of ev) if (e.e === 'msg') msgs.push(e.text); if (stop && stop(ev)) return i + 1; } return n; }

ok(core.lv(p, 'attack') === 20 || core.lv(p, 'attack') > 10, 'save import sets levels (attack ' + core.lv(p, 'attack') + ')');
ok(p.x === 22 && p.y === 52, 'starts at the village well');
// walk to the north gate
core.cmd('p1', { c: 'walk', x: 24, y: 40 }); run(12);
ok(p.x === 24 && p.y === 40, 'walked to the north gate (' + p.x + ',' + p.y + ')');
// buy a sword at the armoury: walk to Garrick, trade, buy
core.cmd('p1', { c: 'npc', id: 'garrick' }); run(20, ev => ev.some(e => e.e === 'shop'));
ok(p.shop === 'armoury', 'opened the armoury');
core.cmd('p1', { c: 'buy', shop: 'armoury', item: 'sword_t1', n: 1 }); run(1);
ok(core.invCount(p, 'sword_t1') === 1, 'bought a bronze sword');
const sw = p.inv.findIndex(s => s && s.id === 'sword_t1');
core.cmd('p1', { c: 'use', slot: sw }); run(1);
ok(p.eq.weapon && p.eq.weapon.id === 'sword_t1', 'wielding the bronze sword');
core.cmd('p1', { c: 'buy', shop: 'armoury', item: 'sword_t2', n: 1 }); run(1);
ok(msgs.some(m => /GOLD/.test(m)), 'shop message: ' + msgs[msgs.length - 1]);
// fight the nearest wolf
const wolf = core.S.mobs.filter(m => m.key === 'wolf').sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)))[0];
core.cmd('p1', { c: 'attack', uid: wolf.uid });
let hits = 0; const t0 = core.S.t;
run(400, ev => { hits += ev.filter(e => e.e === 'hit' && e.dst === wolf.uid).length; return !!wolf.dead || p.dead; });
ok(wolf.dead, 'killed a wolf in ' + (core.S.t - t0) + ' ticks, ' + hits + ' swings landed/missed; hp ' + p.hp);
run(3);
/* 2026-10-01: animals drop only their pelt (no GOLD, no weapons); pelts sell in town */
const here = core.S.ground.filter(g => g.x === wolf.x && g.y === wolf.y && g.diedAt == null);
ok(here.map(g => g.id).sort().join(',') === 'bones,pelt', 'wolf dropped its pelt and its bones (2026-10-07: every monster leaves bones): ' + here.map(g => g.id).join(','));
const pelt = here.find(g => g.id === 'pelt'), before = core.invCount(p, 'pelt');
core.cmd('p1', { c: 'take', uid: pelt.uid }); run(5);
ok(core.invCount(p, 'pelt') === before + 1, 'picked up the pelt');
{ const cs = AshCore.create(D, { seed: 'silk' }), qs = cs.addPlayer('silk', null);
  for (let i = 0; i < qs.inv.length - 3; i++) qs.inv[i] = { id: 'logs', n: 1 };
  const pile = cs.hostDrop({ id: 'spider_silk', n: 10, x: qs.x, y: qs.y });
  cs.cmd('silk', { c: 'take', uid: pile.uid }); cs.tick();
  ok(cs.invCount(qs, 'spider_silk') === 3 && pile.n === 7, 'a pile of 10 silk fills the 3 free slots and leaves 7 (' + cs.invCount(qs, 'spider_silk') + ' taken, ' + pile.n + ' left)');
  cs.cmd('silk', { c: 'take', uid: pile.uid }); cs.tick();
  ok(cs.invCount(qs, 'spider_silk') === 3 && pile.n === 7, 'with no free slot the rest stays on the ground'); }
ok(p.xp.attack > save0.xp.attack, 'gained attack XP');
// bow test: give a bow + arrows (debug), equip, shoot a wolf
const c2 = AshCore.create(D, { seed: 'bow' });
const q = c2.addPlayer('p1', { xp: { ranged: 5000, hitpoints: 15000, defence: 20000 }, inv: [{ id: 'bow_t1', n: 1 }, { id: 'arrows_t1', n: 50 }, { id: 'shield_t1', n: 1 }] });
c2.cmd('p1', { c: 'equip', slot: 2 }); c2.tick();
c2.cmd('p1', { c: 'equip', slot: 0 }); c2.tick();
ok(q.eq.weapon.id === 'bow_t1' && !q.eq.shield, 'bow is two-handed: the shield comes off');
c2.cmd('p1', { c: 'equip', slot: q.inv.findIndex(s => s && s.id === 'arrows_t1') }); c2.tick();
ok(q.eq.ammo && q.eq.ammo.n === 50, 'arrows in the quiver');
const rat = c2.S.mobs.find(m => m.key === 'rat');
c2.cmd('p1', { c: 'attack', uid: rat.uid });
let shot = 0; for (let i = 0; i < 300 && !rat.dead; i++) { const ev = c2.tick(); shot += ev.filter(e => e.e === 'attack' && e.src === 'p1').length; }
ok(rat.dead && shot > 0, 'shot a rat dead with ' + shot + ' arrows, quiver ' + (q.eq.ammo ? q.eq.ammo.n : 0));
ok(q.xp.ranged > 5000, 'ranged XP gained');
// sell
c2.cmd('p1', { c: 'npc', id: 'tam' }); for (let i = 0; i < 80 && !q.shop; i++) c2.tick();
const sh = q.inv.findIndex(s => s && s.id === 'shield_t1'); const g0 = c2.invCount(q, 'coins');
c2.cmd('p1', { c: 'sell', shop: 'general', slot: sh, n: 1 }); c2.tick();
ok(c2.invCount(q, 'coins') === g0 + 14, 'sold the bronze kiteshield to the general store for 40% (' + (c2.invCount(q, 'coins') - g0) + ')');
// requirement message
const c3 = AshCore.create(D, { seed: 'x' }); const r = c3.addPlayer('p1', { inv: [{ id: 'sword_t3', n: 1 }] }); const m3 = [];
c3.cmd('p1', { c: 'use', slot: 0 }); for (const e of c3.tick()) if (e.e === 'msg') m3.push(e.text);
ok(m3[0] === 'You need Attack level 20 to wield that.', 'requirement message: ' + m3[0]);
// gathering: chop a tree
const c4 = AshCore.create(D, { seed: 'wc' }); const w4 = c4.addPlayer('p1', { inv: [{ id: 'hatchet', n: 1 }, { id: 'net', n: 1 }] });
c4.cmd('p1', { c: 'gather', x: 22, y: 39 });
for (let i = 0; i < 200 && c4.invCount(w4, 'logs') < 2; i++) { c4.tick(); if (!w4.act && c4.invCount(w4, 'logs') < 2) c4.cmd('p1', { c: 'gather', x: 27, y: 39 }); }
ok(c4.invCount(w4, 'logs') >= 2, 'chopped logs (' + c4.invCount(w4, 'logs') + '), wc xp ' + w4.xp.woodcutting);
c4.cmd('p1', { c: 'gather', x: 37, y: 56 }); for (let i = 0; i < 200 && c4.invCount(w4, 'shrimp_raw') < 2; i++) c4.tick();
ok(c4.invCount(w4, 'shrimp_raw') >= 2, 'caught shrimps (' + c4.invCount(w4, 'shrimp_raw') + ')');
c4.cmd('p1', { c: 'gather', x: 21, y: 57 }); for (let i = 0; i < 200 && c4.invCount(w4, 'shrimp_raw') > 0; i++) c4.tick();
ok(c4.invCount(w4, 'shrimp') + c4.invCount(w4, 'shrimp_burnt') >= 2, 'cooked them (' + c4.invCount(w4, 'shrimp') + ' cooked, ' + c4.invCount(w4, 'shrimp_burnt') + ' burnt)');
// gathering, part two: the better trees, the back of the mine, and the deep end of the lake
const planted = (l) => D.zones.reduce((n, z) => n + z.tiles.join('').split('').filter(c => c === l).length, 0);
ok(['W', 'M', 'Y'].every(l => D.rules.nodes[l] && D.rules.tiles.tree.indexOf(l) >= 0 && D.rules.tiles.block.indexOf(l) >= 0 && D.rules.tiles.los.indexOf(l) >= 0), 'willow, maple and yew are tree letters that block and are drawn');
ok(['C', 'G', 'A'].every(l => D.rules.nodes[l] && D.rules.tiles.rock.indexOf(l) >= 0 && D.rules.tiles.block.indexOf(l) >= 0), 'coal, gold and mithril are rock letters that block');
ok(['W', 'M', 'Y', 'C', 'G', 'A'].every(l => D.items[D.rules.nodes[l].item]), 'each new node drops a real item');
ok(['W', 'M', 'Y', 'C', 'G', 'A'].every(l => planted(l) > 0), 'every new letter is actually placed: ' + ['W', 'M', 'Y', 'C', 'G', 'A'].map(l => l + planted(l)).join(' '));
const spots = D.zones.find(z => z.id === 'village').fishing;
ok(spots.length === 9 && spots.filter(s => s.tool).length === 5, 'the lake has 9 spots, 5 of them for a rod or a pot');
ok([20, 30, 40].every(r => spots.some(s => s.req === r)), 'the lake itself climbs 20 / 30 / 40');
const c7 = AshCore.create(D, { seed: 'nodes' });
const m7 = [];
const p7 = c7.addPlayer('p1', { xp: { hitpoints: 44700 }, inv: [{ id: 'hatchet', n: 1 }, { id: 'pickaxe', n: 1 }] });
const say = (ev) => { for (const e of ev) if (e.e === 'msg') m7.push(e.text); };
// done() only ever sees the messages this attempt produced, so a refusal from an earlier attempt cannot stand in for it.
// The gather must be re-issued whenever the player is still parked on the previous node - a successful gather keeps p.act set.
const toNode = (x, y, done) => {
  const k = m7.length, at = c7.idx(x, y);
  for (let i = 0; i < 900 && !done(m7.slice(k)); i++) {
    if (!p7.act || p7.act.i !== at) c7.cmd('p1', { c: 'gather', x, y });
    say(c7.tick());
  }
  return done(m7.slice(k));
};
// xp fields are centilevels (x10), so level 20 = 44700 and level 40 = 372240
ok(toNode(38, 52, (m) => m.some(t => /Woodcutting level of 20/.test(t))), 'a willow turns away a level-3 chopper');
p7.xp.woodcutting = 44700;
ok(toNode(38, 52, (m) => c7.invCount(p7, 'willow_logs') > 0 && m.some(t => t === 'You get some willow logs.')), 'chopped willow logs at 20 (' + c7.invCount(p7, 'willow_logs') + ')');
ok(toNode(39, 45, (m) => m.some(t => /Mining level of 20/.test(t))), 'coal wants mining 20');
p7.xp.mining = 44700;
ok(toNode(39, 45, (m) => c7.invCount(p7, 'coal') > 0), 'mined coal at 20 (' + c7.invCount(p7, 'coal') + ')');
ok(toNode(45, 42, (m) => m.some(t => /Mining level of 40/.test(t))), 'the mithril in the corner wants mining 40');
p7.xp.mining = 372240;
ok(toNode(45, 42, (m) => c7.invCount(p7, 'mithril_ore') > 0), 'mined mithril at 40 (' + c7.invCount(p7, 'mithril_ore') + ')');
p7.xp.fishing = 44700;
p7.inv[2] = { id: 'net', n: 1 };
ok(toNode(37, 57, (m) => m.some(t => /need a fishing rod/.test(t))), 'a net will not take trout off the spot');
p7.inv[2] = { id: 'fishing_rod', n: 1 };
p7.xp.fishing = 0;
ok(toNode(37, 57, (m) => m.some(t => /Fishing level of 20/.test(t))), 'trout wants fishing 20, not the shrimp spot 1');
p7.xp.fishing = 44700;
const f0 = p7.xp.fishing;
ok(toNode(37, 57, (m) => c7.invCount(p7, 'trout_raw') > 0 && m.some(t => t === 'You catch some trout.')) && p7.xp.fishing - f0 >= 250,
   'caught a trout on the rod, ' + (p7.xp.fishing - f0) + ' XP for it (a shrimp is 100)');
p7.xp.fishing = 372240;
ok(toNode(45, 56, (m) => m.some(t => /need a lobster pot/.test(t))), 'a rod will not lift the lobster in the deep end');
p7.inv[2] = { id: 'lobster_pot', n: 1 };
ok(toNode(45, 56, (m) => c7.invCount(p7, 'lobster_raw') > 0), 'potted a lobster at 40 (' + c7.invCount(p7, 'lobster_raw') + ')');
// quest
const c5 = AshCore.create(D, { seed: 'q' }); const p5 = c5.addPlayer('p1'); let dlg = null;
c5.cmd('p1', { c: 'npc', id: 'maren' }); for (let i = 0; i < 40 && !dlg; i++) for (const e of c5.tick()) if (e.e === 'dialog') dlg = e;
ok(dlg && dlg.offer === 'ashen_crown' && !p5.quests.ashen_crown && /wolves/i.test(dlg.lines.join(' ')), 'Elder Maren offers the wolf quest');
c5.cmd('p1', { c: 'acceptq', q: 'ashen_crown' }); c5.tick();
ok(p5.quests.ashen_crown && p5.quests.ashen_crown.step === 1, 'saying yes begins it');
// ---------- the Ghost Devs live in Ashvale (2026-10-03): villagers whose one job is to talk
const VZ = D.zones.find(z => z.id === 'village'), inVillage = n => n.x >= VZ.origin[0] && n.x < VZ.origin[0] + VZ.size[0] && n.y >= VZ.origin[1] && n.y < VZ.origin[1] + VZ.size[1];
for (const nd of VZ.npcs.filter(n => n.lines && inVillage(n))) {   /* Odric and his wagon stand out on the road (priest_test talks to them) */
  ok(!nd.shop && !nd.quest && !nd.tailor, nd.id + ' is met by talking, not at a shop or a quest');
  ok(fs.existsSync(path.join(DD, 'parts', 'char.' + nd.look + '.json')), nd.id + ' has a body of its own (char.' + nd.look + ')');
  const cd = AshCore.create(D, { seed: 'dev-' + nd.id }); cd.addPlayer('p1'); let dd = null;
  cd.cmd('p1', { c: 'npc', id: nd.id });
  for (let i = 0; i < 40 && !dd; i++) for (const e of cd.tick()) if (e.e === 'dialog' && e.npc === nd.id) dd = e;
  ok(dd && dd.lines.length > 1 && dd.lines.every(l => l.length > 20), nd.name + ' answers with ' + (dd ? dd.lines.length : 0) + ' lines');
}
// every zone file, not just the two this build loads
const allZones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => f.slice(5, -5)).sort((a, b) => { const O = ['village', 'whisperwood', 'saltmere'], ia = O.indexOf(a), ib = O.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); }).map(z => Object.assign({ id: z }, mod('zone.' + z)));
const BLOCK = new Set(D.rules.tiles.block);
const keeperZone = (id) => allZones.find(z => (z.npcs || []).some(v => v.id === id));

// ---------- the trail story (2026-10-05): quests along the road east to Saltmere.
// Data-only quests, so the checks are that the data hangs together and that the core counts a kill for them.
for (const [qid, Q] of Object.entries(D.quests.quests)) {
  const giver = D.zones.reduce((n, z) => n || (z.npcs || []).find(v => v.id === Q.giver), null);
  ok(!!giver && (giver.quest === qid || (giver.quests || []).indexOf(qid) >= 0), qid + ' is given by ' + Q.giver + ', who stands in a built zone');
  ok(Q.steps.every((s, i) => s.id === i + 1), qid + ': its steps are numbered from 1');
  // a step whose zone is not in this build is not reachable yet, so its goal and its pay are not promised yet either
  const live = Q.steps.filter(s => !s.zone || D.zones.some(z => z.id === s.zone));
  ok(live.length > 0, qid + ': ' + live.length + ' of its ' + Q.steps.length + ' steps stand in built ground');
  const many = n => n == null || n > 0;
  ok(live.every(s => s.goal.kill ? (D.monsters[s.goal.kill] && many(s.goal.n) && (!s.goal.bring || D.items[s.goal.bring]))
                    : s.goal.cook ? (D.items[s.goal.cook] && many(s.goal.n))
                    : s.goal.harvest ? !!(D.rules.farming && Object.values(D.rules.farming.crops).some(c => c.crop === s.goal.harvest) && D.items[s.goal.harvest]) && many(s.goal.n)   /* [Claude 2026-10-18] FARMING: a crop grown in a patch */
                    : s.goal.bring ? ([].concat(s.goal.bring).every(b => D.items[b]) && many(s.goal.n) && (!s.goal.with || (typeof s.goal.with === 'string' ? [s.goal.with] : Object.keys(s.goal.with)).every(w => D.items[w])))   /* a list: any of them will do (sap in a bucket or a pail) */
                    : s.goal.talk ? !!keeperZone(s.goal.talk)
                    : s.goal.plant ? (s.goal.plant === 'open' || s.goal.plant === 'stump') && many(s.goal.n)   /* sadfrog's Even Grove: saplings on open ground or stumps */
                    : s.goal.kills ? Object.keys(s.goal.kills).every(m => D.monsters[m]) && many(s.goal.n)
                    : s.goal.light ? (s.goal.light === '*' || !!D.items[s.goal.light]) && many(s.goal.n)   /* a fire you light (Mishoomis's flint) */
                    : s.goal.wait != null ? s.goal.wait > 0   /* game hours while the giver makes something (Mitigwaabiike's bow) */
                    : s.goal.flag ? !!(D.rules.flags || {})[s.goal.flag] : false),   /* [Claude 2026-10-16] a world deed, e.g. The Heart Below's dragon_heart_reset */
     qid + ': every reachable step wants something that exists');
  const payOk = (r) => Array.isArray(r) ? r.every(payOk) : r.indexOf('xp:') === 0 ? D.rules.skills.indexOf(r.split(':')[1]) >= 0 : r.indexOf('flag:') === 0 ? !!(D.rules.flags || {})[r.slice(5)] : /^[a-z0-9_]+:\d+$/.test(r) ? !!D.items[r.split(':')[0]] : !!D.items[r];   /* a list, or "id:n" */
  ok(live.every(s => !s.reward || payOk(s.reward)),
     qid + ': every reachable step pays in XP and items that exist');
  ok(live.every(s => (s.talk || []).length > 1 && (s.complete || []).length > 0 && (s.progress || []).length > 0),
     qid + ': every reachable step says something when it starts, while it goes, and when it ends');
  ok((Q.done || []).length > 0, qid + ': the giver has a last word');
}
const c9 = AshCore.create(D, { seed: 'trail' });
// a strong, armed character: the check here is that the road quest COUNTS the kill, not whether a novice survives the wood
const save9 = { xp: { attack: 372240, strength: 372240, defence: 372240, hitpoints: 2000000 }, inv: [{ id: 'sword_t4', n: 1 }] };
const p9 = c9.addPlayer('p1', save9);
c9.cmd('p1', { c: 'use', slot: 0 }); c9.tick();
let d9 = null;
c9.cmd('p1', { c: 'npc', id: 'rowan' });
for (let i = 0; i < 60 && !d9; i++) for (const e of c9.tick()) if (e.e === 'dialog' && e.npc === 'rowan') d9 = e;
ok(d9 && d9.offer === 'drove_road' && !p9.quests.drove_road && /saltmere/i.test(d9.lines.join(' ')), 'Rowan offers the road quest');
c9.cmd('p1', { c: 'acceptq', q: 'drove_road' }); c9.tick();
ok(p9.quests.drove_road && p9.quests.drove_road.step === 1, 'saying yes begins the road quest');
c9.cmd('p1', { c: 'walk', x: 24, y: 40 });           // the north gate, where the wood wolves are within a swing
for (let i = 0; i < 60 && (p9.x !== 24 || p9.y !== 40); i++) c9.tick();
const w9 = c9.S.mobs.filter(m => m.key === 'wolf').sort((a, b) => (Math.abs(a.x - p9.x) + Math.abs(a.y - p9.y)) - (Math.abs(b.x - p9.x) + Math.abs(b.y - p9.y)))[0];
c9.cmd('p1', { c: 'attack', uid: w9.uid });
for (let i = 0; i < 400 && !w9.dead && !p9.dead; i++) c9.tick();
ok(w9.dead && p9.quests.drove_road.n >= 1 && p9.quests.drove_road.n < 5, 'the road quest counts the wolf (' + p9.quests.drove_road.n + '/' + D.quests.quests.drove_road.steps[0].goal.n + ')');
let d10 = null;
c9.cmd('p1', { c: 'npc', id: 'rowan' });
for (let i = 0; i < 600 && !d10; i++) for (const e of c9.tick()) if (e.e === 'dialog' && e.npc === 'rowan') d10 = e;
ok(d10 && new RegExp((5 - p9.quests.drove_road.n) + '\\s*more wolf').test(d10.lines.join(' ')), 'Rowan counts what is left: ' + (d10 ? d10.lines[0] : 'nothing'));

// ---------- a step can also want an item handed over, or a message passed on. Proved on a made-up quest in
// ground that is already built, so the core is shown to run those two goal kinds without a monster anywhere.
{
  const Dg = JSON.parse(JSON.stringify(D));
  // an NPC gives exactly one quest, so the made-up one hangs off an NPC whose only other trade is talking
  // [Claude 2026-10-16] was the Auditor (removed from the game); Pax is another lines-only village NPC
  const gv = Dg.zones.find(z => z.id === 'village').npcs.find(n => n.id === 'pax');
  gv.quest = 'post_ride'; delete gv.lines;
  Dg.quests.quests.post_ride = {
    name: 'The Post Ride', giver: 'pax',
    steps: [
      { id: 1, zone: 'village', goal: { bring: 'rat_pelt', n: 2 }, reward: 'xp:speechcraft:700',
        talk: ['Two rat pelts. The boy on the north road is cut up and I have nothing to pad a bandage with.',
               'Two rat pelts. Tam sells them if you have not the stomach to find your own.'],
        progress: ['The pelts, {name}. You are {n} short and the boy is waiting.'],
        complete: ['That will do. You have said nothing and done everything, which is the best kind of courier.'],
        locked: [] },
      { id: 2, zone: 'village', goal: { talk: 'symmetry', n: 1 }, reward: 'sword_t2',
        talk: ['Now tell Symmetry the north road is closed, so the cart men stop being sent into a wolf wood.'],
        progress: ['Symmetry. Go and say your piece, then come back to me.'],
        complete: ['Good. The road is shut and the boy is dressed, and that is the whole of it.'],
        locked: [] }
    ],
    done: ['The post ride, done. If you ever want the sea end of it, ask down at the harbour.']
  };
  const cg = AshCore.create(Dg, { seed: 'goalkinds' });
  const pg = cg.addPlayer('p1', { inv: [{ id: 'rat_pelt', n: 1 }] });
  pg.quests.post_ride = { step: 1, n: 0 };
  const pelts = () => (pg.inv.find(i => i && i.id === 'rat_pelt') || { n: 0 }).n;
  const holds = (id) => pg.inv.some(i => i && i.id === id);
  const ask = (id) => { let d = null; cg.cmd('p1', { c: 'npc', id }); for (let i = 0; i < 400 && !d; i++) for (const e of cg.tick()) if (e.e === 'dialog' && e.npc === id) d = e; return d; };
  let dg = ask('pax');
  ok(dg && /1\s*short/.test(dg.lines.join(' ')) && pg.quests.post_ride.step === 1, 'a bring step wants the item first: ' + (dg ? dg.lines[0] : 'nothing'));
  pg.inv.push({ id: 'rat_pelt', n: 1 });
  dg = ask('pax');
  ok(pg.quests.post_ride.step === 2 && pelts() === 0, 'the bring step takes the pelts and pays in XP');
  dg = ask('symmetry');
  ok(dg && pg.quests.post_ride.n === 1, 'the talk step credits the message being passed on');
  let rew = null;
  cg.cmd('p1', { c: 'npc', id: 'pax' });
  for (let i = 0; i < 400 && !rew; i++) for (const e of cg.tick()) if (e.e === 'reward') rew = e;
  ok(pg.quests.post_ride.step === 3 && holds('sword_t2') && rew && rew.collection === 'ASHVALE The Post Ride',
     'the talk step pays its reward into the collection');
  dg = ask('pax');
  ok(dg && /post ride/i.test(dg.lines.join(' ')), 'the giver has a last word when both kinds of step are done');
}

// ---------- the towns hang together (2026-10-05: "Populate Saltmere with NPCs ... a general store and an
// armoury ... a new town elder ... a chest near the portal"). Every zone file, not just the two this test builds.
for (const z of allZones) {
  const ids = (z.npcs || []).map(n => n.id);
  ok(new Set(ids).size === ids.length, z.name + ': no two NPCs share an id');
  for (const n of z.npcs || []) {
    const onWall = (z.objects || []).some(o => o.k === 'cdeck' && (o.cells.some(c => c[0] === n.x && c[1] === n.y) || (o.ramps || []).some(c => c[0] === n.x && c[1] === n.y)));   /* a watchman on a castle's wall walk (raised ground) */
    ok(onWall || !BLOCK.has((z.tiles[n.y - z.origin[1]] || '')[n.x - z.origin[0]]), n.name + ' stands on ground you can walk to');
    if (n.shop) ok(!!D.shops.shops[n.shop] && D.shops.shops[n.shop].keeper === n.id, n.name + ' keeps ' + ((D.shops.shops[n.shop] || {}).name || n.shop));
  }
}
for (const S of Object.values(D.shops.shops)) {
  const kz = keeperZone(S.keeper);
  ok(!!kz, S.name + ' is kept by ' + S.keeper + ', who stands in ' + (kz ? kz.name : 'nobody'));
  ok(S.stock.every(x => !!D.items[x]), S.name + ': every item on its shelves exists');
}
/* @cinderwalker 2026-10-05: the Quests panel printed "Step 1: slay 8 undefineds" for a step that wants eight logs, and
   told every player to speak to Elder Maren whatever quest they held. The panel has nothing to say about a goal except
   the goal's own name, so every goal a player can be shown must name a thing that exists - a monster in the monsters
   table, an item, an NPC that stands in some town. Steps in a zone the data has never built are named as gaps instead
   of failing: nobody can be shown those steps yet. */
{
  const npcHere = {}; for (const z of allZones) for (const n of z.npcs || []) if (!(n.id in npcHere)) npcHere[n.id] = z.name;
  const built = new Set(allZones.map(z => z.id));
  const gaps = [];
  const unreachable = (s) => s.zone && !built.has(s.zone);
  for (const q of Object.values(D.quests.quests)) {
    ok(!!npcHere[q.giver], q.name + ' is given by ' + q.giver + ', who stands in ' + (npcHere[q.giver] || 'nobody'));
    for (const s of q.steps || []) {
      const g = s.goal || {}, where = q.name + ' step ' + s.id;
      const nameless = (msg) => { if (unreachable(s)) gaps.push(msg); else ok(false, msg); };
      if (g.kill) { const m = D.monsters[g.kill]; if (!m || !m.name) nameless(where + ' wants ' + (g.n || 1) + ' ' + g.kill + ', which is not in the monsters table' + (s.zone && !built.has(s.zone) ? ' (zone ' + s.zone + ' is not built)' : '')); else ok(true, where + ' slays ' + m.name); }
      if (g.bring) for (const b of [].concat(g.bring)) { const it = D.items[b]; if (!it || !it.name) nameless(where + ' wants ' + (g.n || 1) + ' of ' + b + ', which is not an item'); else ok(true, where + ' asks for ' + it.name); }
      if (g.talk) { if (!npcHere[g.talk]) nameless(where + ' sends you to ' + g.talk + ', who stands nowhere'); else ok(true, where + ' sends you to ' + g.talk + ' in ' + npcHere[g.talk]); }
      /* [Claude 2026-10-16] flag (a world deed, The Heart Below step 3) is a goal kind the engine and panel describe */
      if (!g.kill && !g.bring && !g.talk && !g.plant && !g.kills && !g.light && !g.harvest && !g.cook && !g.flag && g.wait == null) ok(false, where + ' has a goal the panel cannot describe: ' + JSON.stringify(g));   /* cook is a goal kind the panel says (hudpanels.js: "cook N of X", counted in core at the fire) - re-measured 2026-10-10 */
      for (const r of [].concat(s.reward || [])) {
      if (typeof r === 'string' && r.startsWith('xp:')) { const [, sk] = r.split(':'); ok(D.rules.skills.indexOf(sk) >= 0 || sk === 'hitpoints', where + ' pays ' + r + ' in a skill the game has'); }
      else if (typeof r === 'string' && r.startsWith('flag:')) ok(!!(D.rules.flags || {})[r.slice(5)], where + ' leaves the ' + r.slice(5) + ' flag, which the rules define');
      else if (typeof r === 'string' && !r.startsWith('coins')) { const it = D.items[r.replace(/:\d+$/, '')]; if (!it) nameless(where + ' pays ' + r + ', which is not an item'); else ok(true, where + ' pays ' + it.name); }
      }
    }
    for (const l of q.done || []) ok(!/undefined/.test(l), q.name + "'s last word names everything it says");
  }
  for (const g of gaps) console.log('gap  ', g);
  console.log('info ', gaps.length + ' quest steps are written for a zone the data has not built yet');
}
for (const P of D.rules.portals) {
  const z = allZones.find(z => P.x >= z.origin[0] && P.x < z.origin[0] + z.size[0] && P.y >= z.origin[1] && P.y < z.origin[1] + z.size[1]);
  ok(!!z, 'the ' + P.name + ' portal is inside a zone');
  ok(!!z && (z.npcs || []).some(n => n.chest), P.name + ' has a chest its players can open');
}
const salt = allZones.find(z => z.id === 'saltmere');
ok(salt.npcs.some(n => /elder/i.test(n.name)), 'Saltmere has a town elder of its own');
ok(!!D.shops.shops.salt_general && !!D.shops.shops.salt_armoury, 'Saltmere has a general store and an armoury');
{ /* the magic store (2026-10-05: "a magic store with some new magical items") */
  const mg = D.shops.shops.salt_magic;
  ok(!!mg, 'Saltmere has a magic store');
  const kept = (salt.npcs || []).find(n => n.id === (mg || {}).keeper);
  ok(!!kept && kept.shop === 'salt_magic', ((kept || {}).name || mg.keeper) + ' stands behind the counter');
  const holds = (id) => Object.keys(D.shops.shops).filter(s => D.shops.shops[s].stock.indexOf(id) >= 0);
  const newmagic = (mg.stock || []).filter(k => (D.items[k].attributes || []).some(a => a.trait_type === 'Effect' && a.value !== 'freeze'));
  ok(newmagic.length >= 4, 'the Enchantery sells ' + newmagic.length + ' things that do something besides damage');
  ok(newmagic.every(k => holds(k).join() === 'salt_magic'), 'nothing else sells ' + newmagic.join(', '));
  for (const k of newmagic) {
    const eff = D.items[k].attributes.find(a => a.trait_type === 'Effect').value;
    ok(core.EFFECTS.indexOf(eff) >= 0, k + ' uses an effect the rules know (' + eff + ')');
    const plain = Object.keys(D.items).find(p => p !== k && D.items[p].category === D.items[k].category &&
      D.items[p].subcategory === D.items[k].subcategory && D.items[p].tier === D.items[k].tier &&
      !(D.items[p].attributes || []).some(a => a.trait_type === 'Effect'));
    const stat = (o) => Math.max(0, ...o.attributes.filter(a => ['Magic', 'Attack', 'Ranged'].indexOf(a.trait_type) >= 0).map(a => a.value));
    ok(plain && stat(D.items[k]) < stat(D.items[plain]), k + ' hits for less than the plain ' + plain + ' and makes up the difference with ' + eff);
  }
}
{ /* quest givers and town stones (2026-10-05: "Have the final quest in Saltmere. Give you a Saltmere town portal stone")
     talk() checks a gift and a shop before it looks for a quest, so a giver must have neither. A giver's own lines are said only
     when there is no quest of theirs on offer or under way (a quest for one home: those born elsewhere hear the lines). */
  ok(D.rules.effects.known.every(e => core.EFFECTS.indexOf(e) >= 0), 'the effect library in the data matches the one in the rules');
  for (const [qid, Q] of Object.entries(D.quests.quests)) {
    const gz = allZones.find(z => (z.npcs || []).some(n => n.id === Q.giver));
    const g = gz && gz.npcs.find(n => n.id === Q.giver);
    ok(!!g, Q.name + ' is given by ' + Q.giver + ', who stands in ' + (gz ? gz.name : 'nobody'));
    ok(!!g && (g.quest === qid || (g.quests || []).indexOf(qid) >= 0) && !g.shop && !g.tailor,
       Q.name + ': ' + ((g || {}).name || Q.giver) + ' sells nothing, and gives this quest before any chat');
    if (g && (g.lines || []).length) {
      /* talk() says a giver's own lines only when they have nothing to offer and no quest of theirs on the books
         (core.js: `!ends && !offered && !hadQuest`), and a finished quest stays on the books. So the lines are
         heard exactly while every quest they hold is one this player cannot be offered yet: gated by after/needs,
         or a quest for the other home. Measured off prereqDone/nextOffered 2026-10-10. */
      const theirs = [].concat(g.quests || [], g.quest ? [g.quest] : []);
      const waits = theirs.length > 0 && theirs.every((id) => { const T = D.quests.quests[id]; return !!T && (T.homes || T.after || (T.needs || []).length > 0); });
      ok(waits, g.name + "'s " + g.lines.length + ' chat lines can be heard' + (waits ? ' - ' + theirs.map((id) => ((D.quests.quests[id] || {}).name || id)).join(' and ') + ' is not offered to them yet' : ' - they are always holding them a quest (' + theirs.map((id) => ((D.quests.quests[id] || {}).name || id)).join(', ') + ')'));
    }
  }
  /* One town, one way back, and it is a stone you earn. The Ring of Angels carries a teleport to Ashvale beside the
     stone (jewellery, a gift, on no counter), so it is named here rather than counted - a third teleport, or a stone
     on any shelf, still fails. Re-measured on the current items and shops 2026-10-10. */
  const KEEPSAKES = ['ring_angels'];
  for (const P of D.rules.portals) {
    if (P.stone === false) continue;   /* a town whose quest (and stone) is not written yet: the lake castle */
    const carry = Object.keys(D.items).filter(k => (D.items[k].attributes || []).some(a => a.trait_type === 'Teleport' && a.value === P.id));
    const stones = carry.filter(k => KEEPSAKES.indexOf(k) < 0);
    ok(stones.length === 1, P.name + ' has one stone that takes you back there' + (carry.length > stones.length ? ', besides the ' + carry.filter(k => KEEPSAKES.indexOf(k) >= 0).join(', ') : ''));
    ok(carry.every(k => !Object.values(D.shops.shops).some(S => (S.stock || []).some(x => (x.id || x) === k))),
       'the ' + P.name + ' stone is earned, not bought');
  }
  const ring = D.items.ring_angels;
  ok(!!ring && ring.category === 'jewellery' && (ring.attributes || []).some(a => a.trait_type === 'Teleport' && a.value === 'ashvale') &&
     !Object.values(D.shops.shops).some(S => (S.stock || []).some(x => (x.id || x) === 'ring_angels')),
     'and the one keepsake allowed a second teleport is ' + ((ring || {}).name || 'nothing') + ' - ' + ((ring || {}).category || 'nothing') + ', to Ashvale, on no counter');
}
{ /* the end of the trail: Cobb's gift waits for the whole of it, and each stone says the town it wakes you in */
  const saltZ = allZones.find(z => z.id === 'saltmere');
  const cobb = saltZ.npcs.find(n => n.id === 'cobb');
  const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(d => [cobb.x + d[0], cobb.y + d[1]]).find(xy => !BLOCK.has((saltZ.tiles[xy[1] - saltZ.origin[1]] || '')[xy[0] - saltZ.origin[0]]));
  ok(!!near, 'there is ground to stand on beside ' + cobb.name);
  const cg = AshCore.create(D, { seed: 'saltroad' });
  const done = cg.addPlayer('p1', { quests: { salt_road: { step: 5, n: 0 } } });
  done.x = near[0]; done.y = near[1];
  const askCobb = () => { let d = null; cg.cmd('p1', { c: 'npc', id: 'cobb' }); for (let i = 0; i < 200 && !d; i++) for (const e of cg.tick()) if (e.e === 'dialog' && e.npc === 'cobb') d = e; return d; };
  const stones = () => done.inv.filter(i => i && i.id === 'saltmere_stone').length;
  let dlg = askCobb();
  ok(stones() === 1, 'the elder gives the Saltmere stone to a player who walked the whole trail');
  ok(dlg && /road/i.test(dlg.lines.join(' ')), 'and he has a word about the road itself');
  askCobb();
  ok(stones() === 1, 'and only once per character');
  const p2 = cg.addPlayer('p2', { quests: { salt_road: { step: 2, n: 0 } } });
  p2.x = near[0]; p2.y = near[1];
  for (let i = 0; i < 200; i++) cg.tick();
  ok(!p2.inv.some(i => i && i.id === 'saltmere_stone'), 'nobody gets it halfway up the trail');
  const P = D.rules.portals.find(p => p.id === 'saltmere');
  const cp = AshCore.create(D, { seed: 'stones' });
  const pp = cp.addPlayer('p1', { inv: [{ id: 'saltmere_stone', n: 1 }] });
  cp.cmd('p1', { c: 'use', slot: 0 });
  let said = null; for (const e of cp.tick()) if (e.e === 'msg' && e.p === 'p1') said = e.text;
  ok(pp.x === P.to[0] && pp.y === P.to[1], 'the Saltmere stone puts you on its own portal');
  ok(said && said.indexOf(P.name) >= 0, 'and names the town you woke in: ' + said);
  cp.cmd('p1', { c: 'use', slot: 0 });
  let cold = null; for (const e of cp.tick()) if (e.e === 'msg' && e.p === 'p1') cold = e.text;
  ok(cold && /cold/i.test(cold), 'then it is cold for half an hour: ' + cold);
  const pa = cp.addPlayer('p2', { inv: [{ id: 'ashvale_stone', n: 1 }] });
  cp.cmd('p2', { c: 'use', slot: 0 });
  let said2 = null; for (const e of cp.tick()) if (e.e === 'msg' && e.p === 'p2') said2 = e.text;
  const A = D.rules.portals.find(p => p.id === 'ashvale');
  ok(pa.x === A.to[0] && pa.y === A.to[1] && said2.indexOf('Ashvale') >= 0, 'the Ashvale stone still says Ashvale: ' + said2); }

// determinism: replay the first session
const h1 = core.hash();
const h2 = AshCore.replay(D, 'test-1', { p1: save0 }, core.log, core.S.t);
ok(h1 === h2, 'replay of ' + core.log.length + ' commands over ' + core.S.t + ' ticks matches (' + h1 + ')');
// unarmed level-3 player vs wolf: should usually lose or barely win (balance sanity)
const c6 = AshCore.create(D, { seed: 'b' }); const p6 = c6.addPlayer('p1'); const r6 = c6.S.mobs.find(m => m.key === 'rat');
c6.cmd('p1', { c: 'attack', uid: r6.uid }); for (let i = 0; i < 300 && !r6.dead; i++) c6.tick();
ok(r6.dead && !p6.dead, 'a fresh level-3 player can kill a giant rat bare-handed (hp left ' + p6.hp + ')');
// ---------- v0.2: weight, capacity, overburden, packs
const IT = D.items;
ok(Object.values(IT).every(d => Number.isInteger(d.weight) && d.weight > 0), 'every item has a weight in grams');
{ const c = AshCore.create(D, { seed: 'w' }); const q = c.addPlayer('p1');
  const w0 = 75 * 2 + 3 * 400; ok(c.carried(q) === w0, 'starting kit weighs ' + c.carried(q) + ' g (75 GOLD + 3 bread = ' + w0 + ')');
  ok(c.capacity(q) === 31000, 'capacity 30 kg + 1 kg per Strength level (Strength 1 -> 31 kg): ' + c.capacity(q));
  q.inv[5] = { id: 'pack_t2', n: 1 }; c.cmd('p1', { c: 'equip', slot: 5 }); c.tick();
  ok(q.eq.pack && c.capacity(q) === 51000 && c.carried(q) === w0 + 1500, 'a worn Canvas pack adds 20 kg capacity and counts its own 1.5 kg');
  for (let i = 6; i < 9; i++) q.inv[i] = { id: 'body_t1', n: 1 };   /* 3 x 13.2 kg bronze platebodies = 39.6 kg */
  c.tick(); ok(c.burden(q) === 0, 'at ' + c.carried(q) / 1000 + ' / 51 kg: fine');
  q.inv[9] = { id: 'body_t1', n: 1 }; const ev1 = c.tick();
  ok(c.burden(q) === 1 && ev1.some(e => e.e === 'msg' && /overburdened/.test(e.text)), 'over capacity: overburdened (with a warning)');
  const x0 = q.x; c.cmd('p1', { c: 'walk', x: q.x + 6, y: q.y, run: true }); let moves = 0; for (let i = 0; i < 6; i++) { const bx = q.x; c.tick(); if (q.x !== bx) moves += Math.abs(q.x - bx); }
  ok(moves === 3, 'overburdened: no running, half speed (3 tiles in 6 ticks, got ' + moves + ')');
  for (let i = 10; i < 14; i++) q.inv[i] = { id: 'body_t1', n: 1 }; c.tick();
  ok(c.burden(q) === 2, 'above 150%: too heavy to move (' + c.carried(q) / 1000 + ' kg)');
  const x1 = q.x; c.cmd('p1', { c: 'walk', x: q.x - 4, y: q.y }); const m2 = []; for (let i = 0; i < 4; i++) for (const e of c.tick()) if (e.e === 'msg') m2.push(e.text);
  ok(q.x === x1 && m2.some(t => /can't move/.test(t)), 'frozen: no step, clear message');
  for (let i = 6; i < 14; i++) { c.cmd('p1', { c: 'drop', slot: i }); }
  c.tick(); ok(c.burden(q) === 0, 'dropping the platebodies recovers (' + c.carried(q) / 1000 + ' kg)');
  void x0; }
// ---------- starting points
{ const c = AshCore.create(D, { seed: 's' }); const q = c.addPlayer('p1');
  c.cmd('p1', { c: 'start', pts: { strength: 5, dexterity: 3, speechcraft: 2 } }); c.tick();
  ok(c.lv(q, 'strength') === 6 && c.lv(q, 'dexterity') === 4 && c.lv(q, 'speechcraft') === 3 && c.capacity(q) === 36000, 'starting points become levels (Str 6, Dex 4, Speech 3; capacity 36 kg)');
  c.cmd('p1', { c: 'start', pts: { attack: 1 } }); c.tick(); ok(c.lv(q, 'attack') === 1, 'points can only be spent once');
  const c2 = AshCore.create(D, { seed: 's' }); const q2 = c2.addPlayer('p1');
  c2.cmd('p1', { c: 'start', pts: { strength: 6 } }); c2.tick(); ok(c2.lv(q2, 'strength') === 1 && !q2.start, 'more than 5 in one skill is refused');
  c2.cmd('p1', { c: 'start', pts: { strength: 5, attack: 5, defence: 1 } }); c2.tick(); ok(!q2.start, 'more than 10 points is refused');
  c2.cmd('p1', { c: 'start', pts: { woodcutting: 2 } }); c2.tick(); ok(!q2.start, 'only the listed starting skills');
  const q3 = AshCore.create(D, { seed: 's' }).addPlayer('p1', { start: { strength: 9 } }); ok(q3.start === null, 'a save with an invalid start record is not trusted');
  const ex = c.exportPlayer('p1'); ok(ex.start && ex.start.strength === 5, 'the start record is saved'); }
// ---------- Dexterity: dodge (deterministic) and faster bows/daggers
{ function dodges(seed, dexLv) { const c = AshCore.create(D, { seed }); const q = c.addPlayer('p1', { xp: { dexterity: c.xpFor(dexLv) * 10, hitpoints: c.xpFor(99) * 10, defence: c.xpFor(1) * 10 } });
    const w = c.S.mobs.find(m => m.key === 'bandit_leader'); q.retal = false; let n = 0, hits = 0;
    for (let i = 0; i < 1500; i++) { if (!w.tgt) { q.x = w.x + 1; q.y = w.y; w.tgt = 'p1'; } q.hp = 99; for (const e of c.tick()) if (e.e === 'hit' && e.dst === 'p1') { hits++; if (e.dodged) n++; } }
    return [n, hits, c.hash()]; }
  const a = dodges('d', 99), b = dodges('d', 99), z = dodges('d', 1);
  ok(a[0] > 0 && a[0] === b[0] && a[2] === b[2], 'Dexterity 99 dodges (' + a[0] + ' of ' + a[1] + ' attacks), identically on replay');
  ok(z[0] === 0, 'Dexterity 1 never dodges');
  const c = AshCore.create(D, { seed: 'f' }); const q = c.addPlayer('p1', { inv: [{ id: 'bow_t1', n: 1 }] }); c.cmd('p1', { c: 'equip', slot: 0 }); c.tick();
  const s1 = c.attackSpeed(q); q.xp.dexterity = c.xpFor(50) * 10; ok(c.attackSpeed(q) === s1 - 1, 'bows are 1 tick faster at Dexterity 50 (' + s1 + ' -> ' + c.attackSpeed(q) + ')');
  const r0 = AshCore.create(D, { seed: 'r' }), p0 = r0.addPlayer('p1'), r9 = AshCore.create(D, { seed: 'r' }), p9 = r9.addPlayer('p1', { xp: { dexterity: r9.xpFor(80) * 10 } });
  for (const [cc, pp] of [[r0, p0], [r9, p9]]) { cc.cmd('p1', { c: 'walk', x: 24, y: 41, run: true }); for (let i = 0; i < 6; i++) cc.tick(); }
  ok(p9.energy > p0.energy && p0.xp.dexterity > 0, 'running drains less energy with Dexterity (' + p0.energy + ' vs ' + p9.energy + ') and trains it (' + p0.xp.dexterity / 10 + ' XP)'); }
// ---------- Speechcraft prices
{ const c = AshCore.create(D, { seed: 'p' }); const q = c.addPlayer('p1');
  const b1 = c.priceBuy('armoury', 'body_t2', q), s1 = c.priceSell('armoury', 'body_t2', q);
  q.xp.speechcraft = c.xpFor(75) * 10;
  const b9 = c.priceBuy('armoury', 'body_t2', q), s9 = c.priceSell('armoury', 'body_t2', q);
  ok(b1 === 209 && b9 === 147 && s1 === 126 && s9 < b9 && s9 > s1, 'Speechcraft: iron platebody buy ' + b1 + ' -> ' + b9 + ' (-30%), sell ' + s1 + ' -> ' + s9 + ' (never above the buy price)');
  ok(c.speechPct(q) === 30, 'shown as 30% at level 75'); }
// ---------- death drops
{ const c = AshCore.create(D, { seed: 'death' }); const q = c.addPlayer('p1', { inv: [{ id: 'coins', n: 500 }, { id: 'bread', n: 1 }, { id: 'arrows_t1', n: 40 }, { id: 'sword_t1', n: 1 }, { id: 'pack_t1', n: 1 }] });
  c.cmd('p1', { c: 'equip', slot: 3 }); c.cmd('p1', { c: 'equip', slot: 4 }); c.tick();
  const w = c.S.mobs.find(m => m.key === 'bandit_leader'); q.x = w.x + 1; q.y = w.y; q.hp = 1; w.tgt = 'p1'; q.retal = false; let died = null; const dm = [];
  for (let i = 0; i < 400 && !died; i++) for (const e of c.tick()) { if (e.e === 'die' && e.p === 'p1') died = [q.x, q.y, c.S.t]; if (e.e === 'msg') dm.push(e.text); }
  const pile = c.S.ground.filter(g => g.from === 'p1');
  ok(died && pile.length === 5 && pile.every(g => g.x === died[0] && g.y === died[1] && g.diedAt === died[2]), 'on death everything carried and worn drops on the death tile (' + pile.map(g => g.id + 'x' + g.n).join(', ') + ')');
  ok(q.inv.every(s => !s) && !Object.keys(q.eq).length, 'nothing kept (no keep-3)');
  ok(dm.some(t => /lie where you fell/.test(t)), 'death message says where: ' + dm.find(t => /lie where/.test(t)));
  for (let i = 0; i < 6; i++) c.tick();
  ok(!q.dead && q.x === 22 && q.y === 52 && q.hp === c.maxHp(q) && c.burden(q) === 0, 'respawned at the well, full HP, not overburdened');
  /* 2026-10-04: "Only Gear and tools and Gold should persist" - bread and arrows rot away with the pile, the rest stays */
  const rot = pile.filter(g => g.id === 'bread' || g.id === 'arrows_t1'), until = Math.max(...rot.map(g => g.until));
  ok(rot.length === 2 && rot.every(g => g.until - died[2] === D.rules.death.pileTicks), 'bread and arrows in the pile last ' + D.rules.death.pileTicks + ' ticks (10 minutes)');
  for (let i = c.S.t; i <= until; i++) c.tick();
  const left = c.S.ground.filter(g => g.from === 'p1').map(g => g.id).sort().join(',');
  /* 2026-10-06: Gold and valuables (100+ GOLD) persist, the rest of the pile despawns with it */
  const want = pile.filter(g => c.persists(g.id, g.n)).map(g => g.id).sort().join(',');
  ok(left === want && left.split(',').includes('coins'), 'then they despawn; the Gold and anything worth 100+ GOLD stay until taken (' + left + ')');
  const cs = AshCore.create(D, { seed: 'deathstone' });
  const ps = cs.addPlayer('p1', { inv: [{ id: 'ashvale_stone', n: 1 }, { id: 'coins', n: 20 }, { id: 'bread', n: 1 }] });
  ps.hp = 1; ps.retal = false; const rat = cs.S.mobs.find(m => m.key === 'rat'); if (rat) { ps.x = rat.x; ps.y = rat.y + 1; rat.tgt = 'p1'; }
  let st = 0; for (let i = 0; i < 80 && !st; i++) for (const e of cs.tick()) if (e.e === 'die' && e.p === 'p1') st = cs.S.t;
  const stone = cs.S.ground.find(g => g.id === 'ashvale_stone' && g.from === 'p1');
  ok(st && stone && stone.until > 1e14, 'the Ashvale stone stays on the death tile; it does not rot with the bread');
  for (let i = 0; i < (D.rules.death.pileTicks || 1000) + 5; i++) cs.tick();
  ok(cs.S.ground.some(g => g.id === 'ashvale_stone' && g.from === 'p1') && !cs.S.ground.some(g => g.id === 'bread' && g.from === 'p1'), 'after the pile rots, the stone is still there and the bread is not');
}
/* drops (2026-10-01): animals -> only their pelt; armed enemies -> what they carry and wear + their purse */
{
  const killDrops = (key, seed) => {
    const c = AshCore.create(D, { seed }), pl = c.addPlayer('k1', { xp: { attack: 130344310, strength: 130344310, defence: 130344310, hitpoints: 130344310 } }   /* level 99 (XP is stored in tenths) */);
    const m = c.S.mobs.filter(x => x.key === key)[0]; if (!m) return null;
    pl.x = m.x + 1; pl.y = m.y; m.hp = 1;
    c.cmd('k1', { c: 'attack', uid: m.uid });
    for (let i = 0; i < 400 && !m.dead; i++) c.tick();
    for (let i = 0; i < 3; i++) c.tick();
    return m.dead ? c.S.ground.filter(g => g.x === m.x && g.y === m.y && g.diedAt == null) : null;
  };
  const rat = killDrops('rat', 'drops-rat');
  ok(rat && rat.map(g => g.id).sort().join(',') === 'bones,rat_meat_raw,rat_pelt', 'rat dropped its own meat and pelt (2026-10-04), and bones (2026-10-07): ' + (rat || []).map(g => g.id).join(','));
  const ld = killDrops('bandit_leader', 'drops-leader'), ids = (ld || []).map(g => g.id);
  ok(ld && ['sword_t3', 'helmet_t2', 'body_t2'].every(i => ids.includes(i)), 'bandit leader dropped the gear he wears: ' + ids.join(','));
  ok(ld && ld.some(g => g.id === 'coins' && g.n === 27), 'bandit leader dropped his purse (27 GOLD)');
}
// ---------- v0.3: walk or run per click
{ const c = AshCore.create(D, { seed: 'run' }); const q = c.addPlayer('p1');
  c.cmd('p1', { c: 'walk', x: 22, y: 46 }); for (let i = 0; i < 3; i++) c.tick(); const walked = 52 - q.y;
  const c2 = AshCore.create(D, { seed: 'run' }); const q2 = c2.addPlayer('p1');
  c2.cmd('p1', { c: 'walk', x: 22, y: 46, run: true }); for (let i = 0; i < 3; i++) c2.tick(); const ran = 52 - q2.y;
  ok(walked === 3 && ran === 6, 'a click walks (3 tiles in 3 ticks), a double-click runs (6 tiles in 3 ticks): ' + walked + ' / ' + ran);
  q2.energy = 0; c2.cmd('p1', { c: 'walk', x: 22, y: 52, run: true }); const mm = []; for (let i = 0; i < 2; i++) for (const e of c2.tick()) if (e.e === 'msg') mm.push(e.text);
  ok(mm.some(t => /out of run energy/.test(t)), 'no energy: it walks, with a hint'); }
// ---------- v0.3: respawn only when the area was empty and someone comes back
{ const c = AshCore.create(D, { seed: 'resp' }); const q = c.addPlayer('p1', save0); const wolf = c.S.mobs.find(m => m.key === 'wolf');
  q.x = wolf.x + 1; q.y = wolf.y; c.cmd('p1', { c: 'attack', uid: wolf.uid }); for (let i = 0; i < 400 && !wolf.dead; i++) { q.hp = 35; c.tick(); }
  for (let i = 0; i < 300; i++) { q.hp = 35; c.tick(); }   /* far longer than the old 40 s timer */
  ok(wolf.dead > 0, 'a killed wolf stays dead while you are in Whisperwood (300 ticks later)');
  q.x = 22; q.y = 52; q.act = null; q.path = []; for (let i = 0; i < 20; i++) c.tick();
  q.x = wolf.sx + 2; q.y = wolf.sy; c.tick(); ok(wolf.dead > 0, 'back after 12 s: still dead');
  q.x = 22; q.y = 52; for (let i = 0; i < 60; i++) c.tick();
  q.x = wolf.sx + 2; q.y = wolf.sy; const evs = c.tick(); ok(!wolf.dead && wolf.hp === D.monsters.wolf.hp && evs.some(e => e.e === 'repop'), 'Whisperwood empty for 36 s, then entered: it repopulates'); }
// ---------- v0.3: host and replica
{ const host = AshCore.create(D, { seed: 'host' }), rep = AshCore.create(D, { seed: 'other' });
  const hp = host.addPlayer('me', save0), rp = rep.addPlayer('me', save0);
  rep.setAuth('whisperwood', false);
  /* and every other built zone too: the keep's chained dragon and the cave's spiders roll for themselves in any zone a
     game hosts, and a replica hosts every zone it has not been told otherwise about - which is not what this measures (2026-10-10) */
  for (const z of D.zones) rep.setAuth(z.id, false);
  const wolfH = host.S.mobs.find(m => m.key === 'wolf'), wolfR = rep.mobByUid(wolfH.uid);
  ok(wolfR && wolfR.key === 'wolf', 'monster uids match on every client (same data, same order)');
  const before = [wolfR.x, wolfR.y], rs = rep.rngState; for (let i = 0; i < 50; i++) rep.tick();
  ok(wolfR.x === before[0] && wolfR.y === before[1] && rep.rngState === rs, 'a replica never moves or rolls for monsters in a zone it does not host');
  host.addPuppet('bob', { x: wolfH.x + 1, y: wolfH.y, hp: 35, L: [20, 20, 30, 35, 1, 1, 1], g: { weapon: 'sword_t1' } });
  host.setPuppet('bob', { act: { k: 'attack', uid: wolfH.uid } }); hp.x = 22; hp.y = 52;
  let hits = [], dead = null; const bobHp = host.S.players.bob.hp;
  for (let i = 0; i < 400 && !wolfH.dead; i++) for (const e of host.tick()) { if (e.e === 'hit') hits.push(e); if (e.e === 'die' && e.mob === wolfH.uid) dead = e; }
  ok(dead && dead.killer === 'bob' && hits.some(h => h.src === 'bob' && h.dmg > 0), 'the host resolves a remote player\'s attacks: bob kills the wolf');
  ok(host.S.players.bob.hp === bobHp && !host.S.players.bob.dead, 'monster hits on a remote player are not applied by the host (bob\'s own game does that)');
  ok(hp.xp.attack === save0.xp.attack, 'no XP for the host from bob\'s kill');
  for (let i = 0; i < 4; i++) host.tick();
  const pelt = host.S.ground.find(g => g.id === 'pelt');
  rep.applyMobs([[wolfH.uid, wolfH.x, wolfH.y, 0, 1]]); if (pelt) rep.groundAdd(pelt.uid, pelt.id, pelt.n, pelt.x, pelt.y);
  ok(wolfR.dead > 0 && (!pelt || rep.S.ground.some(g => g.uid === pelt.uid)), 'the replica shows the host\'s death and drop');
  const xp0 = rp.xp.attack; for (const h of hits.filter(h => h.src === 'bob')) rep.hitXp('me', 'melee', h.dmg, false);
  ok(rp.xp.attack > xp0, 'the attacker\'s own game grants XP for its own damage from the host\'s hit events');
  if (pelt) {
    host.setPuppet('bob', { x: pelt.x, y: pelt.y }); const t1 = host.claim('bob', pelt.uid), t2 = host.claim('me', pelt.uid);
    ok(t1 && !t2, 'loot: the first claim wins, the second gets nothing');
  }
  rp.x = 20; rp.y = 20; const evx = []; rep.cmd('me', { c: 'drop', slot: 0 }); for (const e of rep.tick()) evx.push(e);
  ok(evx.some(e => e.e === 'xdrop') && !rep.S.ground.some(g => g.x === 20 && g.y === 20), 'a replica\'s drop goes to the host instead of its own ground');
  const hp0 = rp.hp; rep.applyHit('me', 3); ok(rp.hp === hp0 - 3, 'a monster hit resolved by the host is applied by the victim\'s own game');
  rep.setAuth('whisperwood', true); host.tick(); ok(rep.isAuth('whisperwood') && rep.S.uid > wolfH.uid, 'host migration: the replica takes over authority (uid counter moves past the old ones)'); }
// ---------- v0.3: several attackers spread around one monster
{ const c = AshCore.create(D, { seed: 'spread' }); const L = c.S.mobs.find(m => m.key === 'bandit_leader');
  L.x = L.sx = 22; L.y = L.sy = 26;   /* open ground: his post in the north corner only has two legal melee tiles */
  const ps = ['a', 'b', 'c'].map((id, k) => { const q = c.addPlayer(id, save0); q.x = L.x + 3; q.y = L.y + k - 1; return q; });
  ps.forEach(q => c.cmd(q.id, { c: 'attack', uid: L.uid })); const dmgBy = { a: 0, b: 0, c: 0 }; let kills = 0, drops = 0;
  let stacked = 0, fightTicks = 0;
  for (let i = 0; i < 600 && !L.dead; i++) { ps.forEach(q => { q.hp = 35; }); if (i > 8) { fightTicks++; if (new Set(ps.map(q => q.x + ',' + q.y)).size < 3) stacked++; } for (const e of c.tick()) { if (e.e === 'hit' && e.dst === L.uid) dmgBy[e.src] += e.dmg; if (e.e === 'die' && e.mob === L.uid) kills++; } }
  for (let i = 0; i < 4; i++) for (const e of c.tick()) if (e.e === 'drop') drops++;
  const tiles = new Set(ps.map(q => q.x + ',' + q.y));
  ok(L.dead && kills === 1 && drops > 0, 'three players kill the bandit leader once, one drop pile (' + drops + ' items)');
  ok(dmgBy.a > 0 && dmgBy.b > 0 && dmgBy.c > 0, 'each attacker landed damage: ' + JSON.stringify(dmgBy));
  ok(stacked * 10 <= fightTicks, 'attackers spread over the tiles around it (stacked in ' + stacked + ' of ' + fightTicks + ' ticks; end: ' + Array.from(tiles).join(' ') + ')'); }
// ---------- v0.3: humanoid AI (goblins, bandits)
{ const L99 = { xp: { attack: 130344310, strength: 130344310, defence: 130344310, hitpoints: 130344310 } };
  const weak = { xp: { hitpoints: 191000, defence: 134000 } };   /* HP 35, Def 30: gets attacked, never dies here */
  const run = (c, n, f) => { const out = []; for (let i = 0; i < n; i++) { const ev = c.tick(); out.push(...ev); if (f && f(ev)) break; } return out; };
  // group aggro
  { const c = AshCore.create(D, { seed: 'grp' }), q = c.addPlayer('p1', L99); const gs = c.S.mobs.filter(m => m.key === 'goblin'); const g0 = gs[0];
    q.x = g0.x + 1; q.y = g0.y; c.cmd('p1', { c: 'attack', uid: g0.uid }); run(c, 3);
    const near = gs.filter(o => o !== g0 && Math.max(Math.abs(o.x - g0.x), Math.abs(o.y - g0.y)) <= 6);
    ok(near.length && near.every(o => o.tgt === 'p1'), 'group aggro: hit one goblin and the ' + near.length + ' goblins within 6 tiles join in'); }
  // bandits defend the leader
  { const c = AshCore.create(D, { seed: 'def' }), q = c.addPlayer('p1', L99); const L = c.S.mobs.find(m => m.key === 'bandit_leader');
    q.x = 13; q.y = 3; c.cmd('p1', { c: 'attack', uid: L.uid }); run(c, 3);
    const guards = c.S.mobs.filter(o => o.key === 'bandit' && Math.max(Math.abs(o.x - L.x), Math.abs(o.y - L.y)) <= 10);
    ok(guards.length >= 2 && guards.every(o => o.tgt === 'p1'), 'bandits within 10 tiles come to defend their leader (' + guards.length + ')'); }
  // archer: shoots at range, backs off, sword when cornered or out of arrows
  { const c = AshCore.create(D, { seed: 'arch' }), q = c.addPlayer('p1', weak); const A = c.S.mobs.find(m => m.carry && m.carry.arrows_t1);
    q.x = A.x - 5; q.y = A.y; while (c.S.players.p1 && (q.x < 0 || c.M.blocked(q.x, q.y))) q.x++;
    q.retal = false; A.tgt = 'p1'; const a0 = A.carry.arrows_t1; const ev = run(c, 30);
    const shots = ev.filter(e => e.e === 'attack' && e.src === A.uid && e.cls === 'ranged');
    ok(shots.length >= 2 && A.carry.arrows_t1 === a0 - shots.length, 'a bandit with arrows shoots from range (' + shots.length + ' arrows, ' + A.carry.arrows_t1 + ' left)');
    q.x = A.x + 1; q.y = A.y; const d0 = 1; run(c, 2); const d1 = Math.max(Math.abs(A.x - q.x), Math.abs(A.y - q.y));
    ok(d1 > d0, 'when you close in, the archer backs off (distance ' + d0 + ' -> ' + d1 + ')');
    A.carry.arrows_t1 = 0; q.x = A.x + 1; q.y = A.y; const ev2 = run(c, 12);
    ok(ev2.some(e => e.e === 'attack' && e.src === A.uid && e.cls === 'melee'), 'out of arrows, it draws the sword'); }
  // goblin flees below 25 % and comes back with friends
  { const c = AshCore.create(D, { seed: 'flee' }), q = c.addPlayer('p1', weak); const g = c.S.mobs.find(m => m.key === 'goblin');
    q.x = g.x + 1; q.y = g.y; q.retal = false; g.tgt = 'p1'; g.hp = 4; g.x = g.sx + 2; q.x = g.x + 1;
    c.S.pending.push({ at: c.S.t + 1, src: 'p1', dst: g.uid, dmg: 0, cls: 'melee', xp: ['attack'] });
    const ev = run(c, 30);
    ok(ev.some(e => e.e === 'mobflee' && e.mob === g.uid), 'a goblin below 25 % runs for its camp');
    ok(ev.some(e => e.e === 'attack' && e.src === g.uid && ev.indexOf(e) > ev.findIndex(x => x.e === 'mobflee')), 'and comes back to fight'); }
  // the leader drinks his potion once, and blocks
  { const c = AshCore.create(D, { seed: 'pot' }), L40 = { xp: { attack: 372240, strength: 372240, defence: 372240, hitpoints: 130344310 }, hp: 99 }, q = c.addPlayer('p1', L40); const L = c.S.mobs.find(m => m.key === 'bandit_leader');
    for (const o of c.S.mobs) if (o.key === 'bandit') o.dead = 1;   /* just the two of them */
    q.x = 13; q.y = 3; c.cmd('p1', { c: 'attack', uid: L.uid }); let drinks = 0, blocks = 0;
    for (let i = 0; i < 600 && !L.dead; i++) for (const e of c.tick()) { if (e.e === 'mobeat' && e.mob === L.uid) drinks++; if (e.e === 'hit' && e.dst === L.uid && e.blocked) blocks++; }
    ok(drinks === 1, 'the bandit leader drinks his potion exactly once at low HP'); ok(blocks > 0, 'and raises his shield (' + blocks + ' blocked hits)'); }
  // targeting: nearest first, then whoever hurt it last
  { const c = AshCore.create(D, { seed: 'tgt' }); const g = c.S.mobs.find(m => m.key === 'goblin'); const a = c.addPlayer('a', weak), b = c.addPlayer('b', weak);
    a.spawnT = b.spawnT = -100; a.x = g.x + 1; a.y = g.y; b.x = g.x - 2; b.y = g.y; a.retal = b.retal = false; run(c, 2);
    ok(g.tgt === 'a', 'picks the nearest player first');
    c.S.pending.push({ at: c.S.t + 1, src: 'b', dst: g.uid, dmg: 1, cls: 'melee', xp: ['attack'] }); run(c, 2);
    ok(g.tgt === 'b', 'then switches to whoever hurt it most recently'); }
  // pathing: goes around trees where a straight-line chaser gets stuck
  { let found = null;
    const g0 = AshCore.create(D, { seed: 'p' }).S.mobs.filter(m => MON_AI(m));
    function MON_AI(m) { return D.monsters[m.key].ai; }
    for (const mm of g0) { for (let dx = -6; dx <= 6 && !found; dx++) for (let dy = -6; dy <= 6 && !found; dy++) {
      const tx = mm.sx + dx, ty = mm.sy + dy, cd = AshCore.create(D, { seed: 'p' });
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4 || tx < 0 || ty < 0 || tx >= cd.M.W || ty >= cd.M.H || cd.M.blocked(tx, ty)) continue;
      const trial = (smart) => { const c = AshCore.create(D, { seed: 'p' }); const m = c.mobByUid(mm.uid); if (!smart) m._dumb = 1; const q = c.addPlayer('p1', weak); q.x = tx; q.y = ty; q.retal = false; m.tgt = 'p1';
        if (!smart) { const md = c.D.monsters[m.key]; const keep = md.ai; md.ai = null; for (let i = 0; i < 20; i++) c.tick(); md.ai = keep; } else for (let i = 0; i < 20; i++) c.tick();
        return Math.max(Math.abs(m.x - q.x), Math.abs(m.y - q.y)) <= 1; };
      if (!(m => m.carry && m.carry.arrows_t1)(mm) && trial(true) && !trial(false)) found = [mm.key, mm.sx, mm.sy, tx, ty];
    } if (found) break; }
    ok(!!found, 'BFS pathing: a ' + (found ? found[0] + ' reaches a player behind trees that a straight-line chaser cannot reach (' + found.slice(1).join(',') + ')' : 'humanoid never needed it')); }
  // reset: back to its post, never frozen mid-field
  { const c = AshCore.create(D, { seed: 'home' }), q = c.addPlayer('p1', weak); const b = c.S.mobs.find(m => m.key === 'bandit' && !m.carry);
    q.retal = false; q.x = b.x + 1; q.y = b.y; b.tgt = 'p1'; run(c, 5); q.x = 22; q.y = 52; run(c, 60);
    ok(!b.tgt && Math.max(Math.abs(b.x - b.sx), Math.abs(b.y - b.sy)) <= 2, 'after the chase it walks back to its post and patrols there (' + b.x + ',' + b.y + ' vs post ' + b.sx + ',' + b.sy + ')'); }
  // determinism
  { const h = () => { const c = AshCore.create(D, { seed: 'det' }), q = c.addPlayer('p1', L99); const L = c.S.mobs.find(m => m.key === 'bandit_leader'); q.x = 13; q.y = 3; c.cmd('p1', { c: 'attack', uid: L.uid }); for (let i = 0; i < 200; i++) c.tick(); return c.hash(); };
    ok(h() === h(), 'the humanoid AI is deterministic (same seed, same fight, same hash)'); }
}
// ---------- v0.3: ASHVALE ITEM SCHEMA v1 drives the rules
{ const RI = D.rules.items, raw = D.items, c = AshCore.create(D, { seed: 'schema' });
  const bad = Object.keys(raw).filter(k => !AshCore.validItem(raw[k], RI).ok);
  ok(!bad.length, 'every item in items.json passes validItem (' + Object.keys(raw).length + ' items)' + (bad.length ? ': ' + bad.slice(0, 3).map(k => k + ' ' + AshCore.validItem(raw[k], RI).errors.join('/')).join('; ') : ''));
  ok(Object.values(raw).every(j => j.game === 'ashvale' && j.category && j.subcategory && Array.isArray(j.attributes) && Number.isInteger(j.weight)), 'items.json is schema v1: name, game, category, subcategory, weight, attributes');
  const it = id => c.item(id);
  ok(it('sword_t1').eq === 'weapon' && it('chain_t2').eq === 'body' && it('legs_t3').eq === 'legs' && it('shield_t1').eq === 'shield' && it('hat_cap').eq === 'head' && it('cape_red').eq === 'cape' && it('pack_t1').eq === 'pack' && it('arrows_t1').eq === 'ammo' && !it('logs').eq,
    'equip slots come from category/subcategory (weapon, armour/chainbody -> body, cosmetic/hat -> head, ...)');
  ok(it('bow_t3').class === 'ranged' && it('bow_t3').twoHanded && it('staff_t1').class === 'magic' && it('mace_t2').anim === 'crush' && it('dagger_t1').anim === 'stab', 'weapon class and animation come from the subcategory');
  ok(it('coins').stack && it('arrows_t2').stack && !it('logs').stack && !it('sword_t1').stack, 'stacking comes from the schema flag');
  ok(it('potion').edible && it('potion').drink && it('bread').edible && !it('bread').drink && it('shrimp_raw').cooks === 'shrimp', 'eat/drink/cook from category and attributes');
  ok(it('prayer_potion').drink && it('prayer_potion').prayPct === 25 && c.priceBuy('general', 'prayer_potion', null) === 3 * c.priceBuy('general', 'potion', null) && c.priceBuy('salt_general', 'prayer_potion', null) === 90 && c.priceBuy('castle_general', 'prayer_potion', null) === 90, 'a prayer potion costs three times a healing potion at the general stores');
  { const q = c.addPlayer('pp', { xp: { prayer: D.rules.xp[12] * 10 } }); q.pp = 1; q.inv[0] = { id: 'prayer_potion', n: 1 }; const mx = c.maxPp(q); c.cmd('pp', { c: 'eat', slot: 0 }); c.tick();
    ok(q.pp === 1 + Math.floor(mx / 4) && !q.inv[0], 'drinking it restores a quarter of your Prayer points (' + q.pp + '/' + mx + ')'); }
  ok(c.priceSell('armoury', 'chain_t1', null) > 0 && c.priceSell('armoury', 'logs', null) === -1 && c.priceSell('tailor', 'hat_cap', null) > 0 && c.priceSell('tailor', 'sword_t1', null) === -1, 'shops buy by category (Armoury: weapon/armour/ammo/pack; Tailor: cosmetic)');
  const evil = JSON.parse(JSON.stringify(raw.sword_t1)); evil.attributes[0].value = 999; evil.weight = 0;
  const v = AshCore.validItem(evil, RI); ok(!v.ok && v.errors.some(e => /Attack/.test(e)) && v.errors.includes('weight'), 'validItem rejects a tier-1 sword with Attack 999 and no weight: ' + v.errors.join(', '));
  const cl = AshCore.clampItem(evil, RI); ok(AshCore.validItem(cl, RI).ok, 'clampItem pulls it back into range (Attack ' + cl.attributes[0].value + ', weight ' + cl.weight + ')');
  ok(!AshCore.validItem(raw.sword_t1, RI, { chain: true, creator: 'someoneElse' }).ok && AshCore.validItem(raw.sword_t1, RI, { chain: true, creator: RI.creator }).ok, 'chain items must be created by @ashvale');
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'armoury_sample.json'), 'utf8')).inscriptions;
  const mapped = fx.map(x => [x, AshCore.fromArmoury(x.json, RI, raw)]);
  ok(mapped.length && mapped.every(([x, m]) => m && AshCore.validItem(m, RI, { chain: true, creator: x.creator }).ok && m.nft.key && raw[m.nft.key] && m.category === raw[m.nft.key].category && m.subcategory === raw[m.nft.key].subcategory),
    'real Armoury NFTs (from the arcade) map to schema v1 and validate: ' + mapped.map(([x, m]) => x.json.name + ' -> ' + m.category + '/' + m.subcategory + ' T' + m.tier).join('; '));
  const tok = JSON.parse(fs.readFileSync(path.join(DD, 'tokens.json'), 'utf8')).data.tokens;
  ok(Object.keys(tok).length && Object.values(tok).every(t => t.category && t.subcategory && t.data && t.data.ashvale && raw[t.data.ashvale.id] && raw[t.data.ashvale.id].category === t.category), 'tokens.json: one issuance spec per stackable, same category/subcategory vocabulary (' + Object.keys(tok).length + ' tokens)'); }
// ---------- v0.3: male or female (the operator)
{ const c = AshCore.create(D, { seed: 'body' }); const q = c.addPlayer('p1');
  c.cmd('p1', { c: 'look', look: { body: 'female', hair: 'long' } }); c.tick();
  ok(c.exportPlayer('p1').look.body === 'female', 'the look keeps body: female in the save');
  const q2 = AshCore.create(D, { seed: 'b2' }).addPlayer('p1', { look: { body: 'dragon', hair: 'short' } });
  ok(q2.look && !('body' in q2.look) && q2.look.hair === 'short', 'an unknown body value is dropped (only male or female)'); void q; }
// ---------- v0.4: inventory drag and drop
{ const c = AshCore.create(D, { seed: 'mv' }); const q = c.addPlayer('p1');
  const a0 = JSON.stringify(q.inv[0]), a1 = JSON.stringify(q.inv[1]);
  c.cmd('p1', { c: 'move', from: 0, to: 1 }); c.tick(); ok(JSON.stringify(q.inv[1]) === a0 && JSON.stringify(q.inv[0]) === a1, 'move swaps two slots');
  c.cmd('p1', { c: 'move', from: 1, to: 20 }); c.tick(); ok(!q.inv[1] && JSON.stringify(q.inv[20]) === a0, 'move into an empty slot');
  c.cmd('p1', { c: 'move', from: 5, to: 99 }); c.cmd('p1', { c: 'move', from: 7, to: 3 }); c.tick(); ok(JSON.stringify(q.inv[20]) === a0, 'bad moves do nothing');
  ok(AshCore.replay(D, 'mv', { p1: {} }, c.log, c.S.t) === c.hash(), 'moves replay deterministically'); }
// ---------- v0.4: firemaking and campfires
{ const c = AshCore.create(D, { seed: 'fire' }); const q = c.addPlayer('p1', { inv: [{ id: 'logs', n: 1 }, { id: 'oak_logs', n: 1 }, { id: 'shrimp_raw', n: 1 }, { id: 'shrimp_raw', n: 1 }] });
  q.x = 24; q.y = 47; const m = [];
  c.cmd('p1', { c: 'use', slot: 0 }); for (let i = 0; i < 3; i++) for (const e of c.tick()) if (e.e === 'msg') m.push(e.text);
  ok(m.some(t => /need a tinderbox/.test(t)) && q.inv[0], 'no tinderbox, no fire');
  q.inv[10] = { id: 'tinderbox', n: 1 }; c.cmd('p1', { c: 'use', slot: 1 }); m.length = 0; for (let i = 0; i < 3; i++) for (const e of c.tick()) if (e.e === 'msg') m.push(e.text);
  ok(m.some(t => /Firemaking level of 15/.test(t)), 'oak needs Firemaking 15');
  const fx = q.x, fy = q.y; c.cmd('p1', { c: 'use', slot: 0 }); let lit = null;
  for (let i = 0; i < 60 && !lit; i++) for (const e of c.tick()) if (e.e === 'fire') lit = e;
  ok(lit && lit.x === fx && lit.y === fy && !q.inv[0] && q.xp.firemaking === 400 && lit.ticks === 100, 'logs + tinderbox = a campfire on your tile (+40 XP, burns 100 ticks)');
  c.tick(); ok(q.x !== fx || q.y !== fy, 'you step off the flames');
  c.cmd('p1', { c: 'gather', x: fx, y: fy }); let cooked = 0; for (let i = 0; i < 40; i++) for (const e of c.tick()) if (e.e === 'gather' && e.ok) cooked++;
  ok(cooked === 2 && c.invCount(q, 'shrimp') + c.invCount(q, 'shrimp_burnt') === 2, 'cook raw fish on the campfire anywhere');
  for (let i = 0; i < 100; i++) c.tick(); ok(!c.S.fires.length, 'the fire burns out');
  const h = AshCore.create(D, { seed: 'fh' }), r = AshCore.create(D, { seed: 'fr' }); r.setAuth('village', false); r.addPlayer('me', { inv: [{ id: 'logs', n: 1 }, { id: 'tinderbox', n: 1 }] }).x = 24;
  r.S.players.me.y = 47; r.cmd('me', { c: 'use', slot: 0 }); let xf = null; for (let i = 0; i < 60 && !xf; i++) for (const e of r.tick()) if (e.e === 'xfire') xf = e;
  ok(xf && !r.S.fires.length, 'a replica\'s fire is sent to the host instead');
  const hf = h.hostFire(xf.x, xf.y, xf.ticks, xf.log); r.fireAdd(hf.uid, hf.x, hf.y, xf.ticks, 'logs');
  ok(h.S.fires.length === 1 && r.S.fires.length === 1 && r.S.fires[0].uid === hf.uid, 'the host owns it and everyone sees the same fire'); }
// ---------- v0.4: abilities as data (Frost staff freezes)
{ const S0 = { xp: { magic: 60000, hitpoints: 191000, defence: 134000 }, hp: 35, inv: [{ id: 'staff_frost', n: 1 }] };
  const c = AshCore.create(D, { seed: 'frost' }); const q = c.addPlayer('p1', S0); c.cmd('p1', { c: 'equip', slot: 0 }); c.tick();
  ok(c.item('staff_frost').effect === 'freeze' && c.item('staff_frost').effectTicks === 5 && c.item('staff_frost').effectChance === 25, 'the Frost staff carries {Effect freeze, 5 ticks, 25 %} in its item JSON');
  const w = c.S.mobs.find(m => m.key === 'wolf'); q.x = w.x + 3; q.y = w.y; q.retal = false; c.cmd('p1', { c: 'attack', uid: w.uid });
  let frozenAt = null, movedWhileFrozen = false, attackedWhileFrozen = false, last = null;
  for (let i = 0; i < 300 && !w.dead; i++) { q.hp = 35; if (!frozenAt) w.hp = Math.max(w.hp, 10); const ev = c.tick();   /* the wolf lives until the 25 % freeze has come up (seed-independent) */
    for (const e of ev) { if (e.e === 'fx' && e.mob === w.uid && e.fx === 'freeze' && !frozenAt) frozenAt = c.S.t; if (frozenAt && e.e === 'attack' && e.src === w.uid && c.S.t < frozenAt + 5) attackedWhileFrozen = true; }
    if (frozenAt && c.S.t > frozenAt && c.S.t < frozenAt + 5 && last && (last[0] !== w.x || last[1] !== w.y)) movedWhileFrozen = true; last = [w.x, w.y]; }
  ok(frozenAt != null, 'a Frost staff hit froze the wolf (tick ' + frozenAt + ')');
  ok(!movedWhileFrozen && !attackedWhileFrozen, 'frozen: it neither moved nor attacked for 5 ticks');
  const odd = AshCore.normItem('x', Object.assign({}, D.items.staff_t1, { attributes: D.items.staff_t1.attributes.concat([{ trait_type: 'Effect', value: 'teleport-moon' }, { trait_type: 'Effect ticks', value: 3 }]) }), D.rules.items);
  const c2 = AshCore.create(Object.assign({}, D, { items: Object.assign({}, D.items, { staff_moon: Object.assign({}, D.items.staff_t1, { attributes: D.items.staff_t1.attributes.concat([{ trait_type: 'Effect', value: 'teleport-moon' }, { trait_type: 'Effect ticks', value: 3 }, { trait_type: 'Effect chance', value: 100 }]) }) }) }), { seed: 'odd' });
  const q2 = c2.addPlayer('p1', Object.assign({}, S0, { inv: [{ id: 'staff_moon', n: 1 }] })); c2.cmd('p1', { c: 'equip', slot: 0 }); c2.tick();
  const w2 = c2.S.mobs.find(m => m.key === 'wolf'); q2.x = w2.x + 3; q2.y = w2.y; c2.cmd('p1', { c: 'attack', uid: w2.uid }); let fxs = 0, errs = 0;
  try { for (let i = 0; i < 100; i++) { q2.hp = 35; for (const e of c2.tick()) if (e.e === 'fx') fxs++; } } catch (e) { errs++; }
  ok(odd.effect === 'teleport-moon' && fxs === 0 && errs === 0, 'an unknown effect in an item\'s JSON is ignored safely');
  const det = () => { const cc = AshCore.create(D, { seed: 'frost' }); const qq = cc.addPlayer('p1', S0); cc.cmd('p1', { c: 'equip', slot: 0 }); cc.tick(); const ww = cc.S.mobs.find(m => m.key === 'wolf'); qq.x = ww.x + 3; qq.y = ww.y; cc.cmd('p1', { c: 'attack', uid: ww.uid }); for (let i = 0; i < 120; i++) { qq.hp = 35; cc.tick(); } return cc.hash(); };
  ok(det() === det(), 'effects are deterministic'); }
// ---------- v0.8.29: the effects that are not freeze (Saltmere's Enchantery)
{ const S0 = { xp: { magic: 200000, hitpoints: 191000, defence: 134000 }, hp: 60, inv: [{ id: 'staff_ember', n: 1 }] };
  const c = AshCore.create(D, { seed: 'ember' }); const q = c.addPlayer('p1', S0); c.cmd('p1', { c: 'equip', slot: 0 }); c.tick();
  const w = c.S.mobs.find(m => m.key === 'wolf'); q.x = w.x + 3; q.y = w.y; q.retal = false; c.cmd('p1', { c: 'attack', uid: w.uid });
  let burntAt = null, burnTicks = 0;
  for (let i = 0; i < 300 && !w.dead; i++) { q.hp = 60; w.hp = Math.max(w.hp, 10);   /* the wolf lives until the 45 % burn comes up */
    for (const e of c.tick()) { if (e.e === 'fx' && e.mob === w.uid && e.fx === 'burn' && burntAt == null) burntAt = c.S.t; if (e.e === 'hit' && e.dst === w.uid && e.cls === 'burn') burnTicks++; } }
  ok(burntAt != null && burnTicks > 0, 'an Ember staff hit set the wolf burning (' + burnTicks + ' ticks of burn damage)');
  const c2 = AshCore.create(D, { seed: 'storm' }); const q2 = c2.addPlayer('p1', Object.assign({}, S0, { inv: [{ id: 'staff_storm', n: 1 }] }));
  c2.cmd('p1', { c: 'equip', slot: 0 }); c2.tick();
  const w2 = c2.S.mobs.find(m => m.key === 'wolf'); q2.x = w2.x + 3; q2.y = w2.y; q2.retal = false; c2.cmd('p1', { c: 'attack', uid: w2.uid });
  let slowedAt = null, movedOnOdd = 0, last = null;
  for (let i = 0; i < 300 && !w2.dead; i++) { q2.hp = 60; w2.hp = Math.max(w2.hp, 10); const ev = c2.tick();
    for (const e of ev) if (e.e === 'fx' && e.mob === w2.uid && e.fx === 'slow') slowedAt = c2.S.t;
    if (slowedAt != null && c2.S.t > slowedAt && c2.S.t < slowedAt + 6 && last && (last[0] !== w2.x || last[1] !== w2.y) && (c2.S.t & 1)) movedOnOdd++;
    last = [w2.x, w2.y]; }
  ok(slowedAt != null && movedOnOdd === 0, 'a Storm staff hit slowed the wolf: it stood still on every other tick'); }
// ---------- v0.4: attackers can be attacked back across a zone border (the operator)
{ const archerSave = { xp: { ranged: 130344310, hitpoints: 130344310, defence: 1303443 }, hp: 99, inv: [{ id: 'bow_t3', n: 1 }, { id: 'arrows_t1', n: 500 }] };
  const mageSave = { xp: { magic: 1303443, hitpoints: 130344310, defence: 1303443 }, hp: 99, inv: [{ id: 'staff_t2', n: 1 }] };
  const setup = (seed, save, key, post) => { const c = AshCore.create(D, { seed }); const q = c.addPlayer('p1', save); for (let k = 0; k < save.inv.length; k++) c.cmd('p1', { c: 'equip', slot: k }); c.tick(); c.tick();
    const m = key === 'archer' ? c.S.mobs.find(x => x.carry && x.carry.arrows_t1) : c.S.mobs.find(x => x.key === key);
    for (const o of c.S.mobs) if (o !== m) o.dead = 1;   /* just these two */
    m.x = m.sx = post[0]; m.y = m.sy = post[1]; m.hp = 999; q.retal = false; return [c, q, m]; };
  { const [c, q, m] = setup('xz1', archerSave, 'archer', [24, 35]); q.x = 24; q.y = 41;
    ok(c.zoneOf(q.x, q.y) === 'village' && c.zoneOf(m.x, m.y) === 'whisperwood', 'setup: player in the village, bandit archer in Whisperwood');
    c.cmd('p1', { c: 'attack', uid: m.uid }); let back = 0; for (let i = 0; i < 30; i++) { q.hp = 99; for (const e of c.tick()) if (e.e === 'attack' && e.src === m.uid && e.dst === 'p1') back++; }
    ok(back >= 2, 'a player shooting over the border gets shot back (' + back + ' arrows)'); }
  { const [c, q, m] = setup('xz2', mageSave, 'wolf', [24, 35]); q.x = 24; q.y = 42;
    c.cmd('p1', { c: 'attack', uid: m.uid }); let reached = false, bites = 0;
    for (let i = 0; i < 40; i++) { q.hp = 99; for (const e of c.tick()) if (e.e === 'attack' && e.src === m.uid) bites++; if (Math.max(Math.abs(m.x - q.x), Math.abs(m.y - q.y)) <= 1) reached = true; }
    ok(reached && c.zoneOf(m.x, m.y) === 'village' && bites > 0, 'a wolf leaves Whisperwood to bite the mage hitting it from the village (' + bites + ' bites, at ' + m.x + ',' + m.y + ')');
    c.cmd('p1', { c: 'walk', x: 22, y: 52 }); for (let i = 0; i < 80; i++) { q.hp = 99; c.tick(); }
    ok(c.zoneOf(m.x, m.y) === 'whisperwood' && Math.max(Math.abs(m.x - m.sx), Math.abs(m.y - m.sy)) <= 3, 'once the attacks stop it walks back home (' + m.x + ',' + m.y + ')'); }
  { const [c, q, m] = setup('xz3', mageSave, 'wolf', [24, 35]); q.x = 24; q.y = 42; c.tick();
    ok(!m.tgt, 'without being hit it does not cross the border on its own'); } }
// ---------- v0.4: weather (the operator: fog, rain, snow per zone, with real effects)
{ const c = AshCore.create(D, { seed: 'wx' }); const q = c.addPlayer('p1'); const seen = [];
  for (let i = 0; i < 4000; i++) for (const e of c.tick()) if (e.e === 'weather') seen.push(e.zone + ':' + e.kind);
  ok(seen.length >= 4 && seen.some(x => /^whisperwood:fog/.test(x)), 'weather changes per zone over time (' + seen.length + ' changes in 40 min: ' + seen.slice(0, 5).join(', ') + ' ...)');
  c.cmd('p1', { c: 'walk', x: 24, y: 41 }); for (let i = 0; i < 20; i++) c.tick();
  ok(AshCore.replay(D, 'wx', { p1: {} }, c.log, c.S.t) === c.hash(), 'replays deterministically through weather changes'); void q; }
{ const c = AshCore.create(D, { seed: 'fog' }); const q = c.addPlayer('p1', { xp: { ranged: 130344310 }, inv: [{ id: 'bow_t3', n: 1 }] }); c.cmd('p1', { c: 'equip', slot: 0 }); c.tick();
  q.x = 24; q.y = 30; const r0 = c.attackRange(q); c.setWeather('whisperwood', 'fog', 100, 500); const r1 = c.attackRange(q);
  ok(r0 === 7 && r1 === 4, 'thick fog cuts bow range from 7 to 4 tiles (' + r0 + ' -> ' + r1 + ')');
  const w = c.S.mobs.find(m => m.key === 'wolf'); ok(c.wx('whisperwood', 'sight') === 0.5, 'and halves how far monsters see you'); void w; }
{ const tries = (kind) => { const c = AshCore.create(D, { seed: 'rainfire' }); const q = c.addPlayer('p1', { inv: [{ id: 'tinderbox', n: 1 }] }); q.x = 24; q.y = 47; let fail = 0, ok2 = 0;
    c.setWeather('village', kind, 100, 100000);
    for (let n = 0; n < 40; n++) { q.inv[1] = { id: 'logs', n: 1 }; c.S.fires.length = 0; c.cmd('p1', { c: 'use', slot: 1 }); for (let i = 0; i < 60 && q.inv[1]; i++) for (const e of c.tick()) if (e.e === 'gather' && e.ok === false && e.p === 'p1') fail++; if (!q.inv[1]) ok2++; q.x = 24; q.y = 47; }
    return [fail, ok2, c]; };
  const [f0, o0] = tries('clear'), [f1, o1, cr] = tries('rain');
  ok(f1 > f0 * 1.3, 'rain makes lighting fires fail more often (' + f0 + ' fails clear vs ' + f1 + ' in rain, over 40 fires each)');
  const h = cr.hostFire(30, 50, 100, 'logs'); ok(h && h.until - cr.S.t === 60, 'and a campfire burns 60 % as long in heavy rain (' + (h && h.until - cr.S.t) + ' ticks)'); void o0; void o1; }
{ const host = AshCore.create(D, { seed: 'wh' }), rep = AshCore.create(D, { seed: 'wr' }); rep.setAuth('whisperwood', false);
  let hev = null; for (let i = 0; i < 4000 && !hev; i++) for (const e of host.tick()) if (e.e === 'weather' && e.zone === 'whisperwood') hev = e;
  for (let i = 0; i < 4000; i++) rep.tick();
  const before = JSON.stringify(rep.weatherOf('whisperwood'));
  rep.setWeather('whisperwood', hev.kind, hev.intensity, hev.ticks);
  ok(/clear/.test(before) && rep.weatherOf('whisperwood').kind === host.weatherOf('whisperwood').kind && rep.weatherOf('whisperwood').intensity === host.weatherOf('whisperwood').intensity, 'a replica never rolls weather for a zone it does not host, and takes the host\'s (' + hev.kind + ' ' + hev.intensity + '%)'); }
// ---------- globe P2 step A: the chunked world, areas and regions, the globe frame, v0.5 saves, uid spaces
{ const AshWorld = require('../src/world.js'), Wd = AshWorld.createWorld(D);
  let same = true, zonesOk = true;
  for (const z of D.zones) for (let y = 0; y < z.size[1]; y++) for (let x = 0; x < z.size[0]; x++) {
    const gx = z.origin[0] + x, gy = z.origin[1] + y; if (Wd.tileAt(gx, gy) !== z.tiles[y][x]) same = false; if (Wd.zoneAt(gx, gy) !== z.id) zonesOk = false; }
  ok(same && zonesOk, 'the chunk store holds every set-piece tile and zone exactly where the old W x H map had them');
  /* the cave trail owns (-1,10) since 2026-10-07, so the old map's corner is measured instead; the globe is open, so nothing is "outside the world" any more */
  ok(Wd.tileAt(-1, -1) === 'T' && Wd.blocked(-1, -1) && Wd.tileAt(48, 70) === 'T', 'outside the old map: the filler (an impassable tree)');
  ok(Wd.regionOf(24, 20) === Wd.regionOf(24, 52) && Wd.regionOf(0, 0) === Wd.regionOf(47, 63), 'the village and Whisperwood are one region (one shared room): ' + Wd.regionOf(24, 52));
  /* the face in the id is globecfg's, not a fixed 11: the reserved land became a network and the town moved with it */
  const far = Wd.zoneAt(-300, 30); ok(new RegExp('^' + D.globecfg.face + ':-?\\d+:-?\\d+$').test(far) && far !== Wd.zoneAt(300, 30), 'seeded land is divided into 128 m areas face:ax:ay (' + far + ')');
  const K = Wd.key(-123456, 98765); ok(Wd.kx(K) === -123456 && Wd.ky(K) === 98765 && Wd.key(5, 7) !== Wd.key(7, 5), 'packed tile keys round-trip, negative coordinates too');
  const AG = require('../src/globe.js'), GC = D.globecfg, G = AG.createGlobe({ n: GC.n, radius_m: GC.radius_m, seed: GC.seed }), CL = G.classes(), pc = G.planar(CL.coreCenter);
  ok(CL.coreFace === GC.face && Math.abs(GC.origin[0] + 24 - Math.floor(pc.x)) <= 1 && Math.abs(GC.origin[1] + 32 - Math.floor(-pc.y)) <= 1, 'globecfg matches the globe: core face ' + CL.coreFace + ', the old map centred on the core centre cell');
  ok((GC.origin[0] - GC.grid[0]) % GC.chunk === 0 && (GC.origin[1] - GC.grid[1]) % GC.chunk === 0, 'every 64 m chunk lies in exactly one area (grid aligned to chunks)');
  const c1 = AshCore.create(D, { seed: 'v05' }), v05 = { v: 1, name: 'Old', xp: save0.xp, inv: [{ id: 'sword_t1', n: 1 }] }, q1 = c1.addPlayer('p1', v05);
  ok(q1.x === 22 && q1.y === 52 && q1.inv[0] && q1.inv[0].id === 'sword_t1' && c1.lv(q1, 'defence') === 30, 'a v0.5 save loads: same character, items and levels, at the village well as always');
  q1.x = 24; q1.y = 30; const sv = c1.exportPlayer('p1'); const c2 = AshCore.create(D, { seed: 'v2' }), q2 = c2.addPlayer('p1', sv);
  ok(sv.v === 2 && sv.pos[0] === GC.face && sv.pos[1] === GC.origin[0] + 24 && sv.pos[2] === GC.origin[1] + 30 && q2.x === 24 && q2.y === 30, 'a v2 save stores the globe position ' + JSON.stringify(sv.pos) + ' and loads standing there');
  const c3 = AshCore.create(D, { seed: 'v1xy' }), q3 = c3.addPlayer('p1', { v: 1, x: 25, y: 31 }); ok(q3.x === 25 && q3.y === 31, 'a v1 save with old map x, y keeps them (fixed offset to the globe)');
  const c4 = AshCore.create(D, { seed: 'v2bad' }), q4 = c4.addPlayer('p1', { v: 2, pos: [GC.face, GC.origin[0] + 0, GC.origin[1] + 0] }); ok(!Wd.blocked(q4.x, q4.y) && Math.hypot(q4.x, q4.y) <= 6, 'a saved spot that is blocked (a tree) lands you on the nearest open ground, not back at the well (core.js, 2026-10-06): ' + q4.x + ',' + q4.y);
  const h1 = AshCore.create(D, { seed: 's' }), h2 = AshCore.create(D, { seed: 's' }); h1.uidSpace(17); h2.uidSpace(18);
  const g1 = h1.hostFire(30, 50, 100, 'logs'), g2 = h2.hostFire(30, 50, 100, 'logs');
  ok(g1 && g2 && g1.uid !== g2.uid && g1.uid > h1.S.mobs.length, 'two hosts in one room create things with different uids (' + g1.uid + ' / ' + g2.uid + ')');
  /* replays hold when chunks are dropped and filled again: a tiny chunk cache, a walk that touches far chunks */
  const cs = AshCore.create(D, { seed: 'lru', world: { maxChunks: 4 } }), ps = cs.addPlayer('p1', save0);
  cs.cmd('p1', { c: 'walk', x: 24, y: 30, run: true }); for (let i = 0; i < 40; i++) { if (i % 5 === 0) for (let k = 0; k < 6; k++) cs.M.tileAt(1000 + 64 * k, -500); cs.tick(); }
  ok(cs.M.stats().dropped > 0 && AshCore.replay(D, 'lru', { p1: save0 }, cs.log, cs.S.t) === cs.hash(), 'a replay matches after chunks were dropped and refilled (' + cs.M.stats().dropped + ' dropped)'); void ps; }
// ---------- globe P2 step B: seeded land around the old map (worldgen), camps, replays, respawn per area
{ const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
  const DS = Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) });
  const L99 = { xp: { attack: 130344310, strength: 130344310, defence: 130344310, hitpoints: 130344310 } };
  const c = AshCore.create(DS, { seed: 'seed1' });
  let same = true; for (const z of D.zones) for (let y = 0; y < z.size[1]; y++) for (let x = 0; x < z.size[0]; x++) if (c.M.tileAt(z.origin[0] + x, z.origin[1] + y) !== z.tiles[y][x]) same = false;
  ok(c.M.seeded && same && c.S.mobs.filter(m => !(D.rules.yard && D.rules.yard.birds.includes(m.key))).length === D.zones.reduce((n, z) => n + (z.spawns || []).filter(sp => !(D.rules.yard && D.rules.yard.birds.includes(sp.m))).length, 0),   /* the chapel's posted hens are yard birds too (2026-10-10) */ 'with seeded land the village and Whisperwood keep every tile, NPC and monster (plus ' + c.S.mobs.filter(m => D.rules.yard && D.rules.yard.birds.includes(m.key)).length + ' yard birds)');
  const out = [];
  for (const [nm, st, dir] of [['north', [23, 2], [0, -1]], ['south', [38, 62], [0, 1]], ['east', [46, 50], [1, 0]], ['west', [1, 31], [-1, 0]]]) {
    /* Worked out as a route rather than one walk command: the game's pathfinder solves only a few straight segments
       at a time, so a wood right at the edge stopped the old single goal long before the land ran out. This floods
       the ground past the edge the way feet move (no corner cutting) and asks how far a walkable way gets. */
    const cc = AshCore.create(DS, { seed: 'edge' + nm });
    const key = (x, y) => (x + 65536) * 131072 + (y + 65536), seen = new Set([key(st[0], st[1])]), qx = [st[0]], qy = [st[1]];
    let best = 0, bx = st[0], by = st[1];
    for (let h = 0; h < qx.length; h++) {
      const x = qx[h], y = qy[h], d = (x - st[0]) * dir[0] + (y - st[1]) * dir[1];
      if (d > best) { best = d; bx = x; by = y; }
      if (d > 250 || d < -40) continue;   /* outward only: without the back-bound the flood walked the whole continent the other way (2026-10-10) */
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, b = y + dy;
        if (Math.abs((dir[0] ? b : a) - (dir[0] ? st[1] : st[0])) > 150) continue;
        const k = key(a, b);
        if (seen.has(k) || cc.M.blocked(a, b)) continue;
        seen.add(k); qx.push(a); qy.push(b);
      }
    }
    out.push(nm + ' ' + Math.round(best) + ' m');
    ok(best >= 60 && !cc.M.inPiece(bx, by) && cc.zoneOf(bx, by).startsWith(D.globecfg.face + ':'), 'walking off the ' + nm + ' edge of the old map into seeded land (a walkable way ' + Math.round(best) + ' m past the edge, area ' + cc.zoneOf(bx, by) + ')');
  }
  /* a camp: its monsters wake when you come near, with the same uids in two separate games */
  const camps = c.M.sitesIn(-600, -600, 650, 650).filter(st => st.kind === 'camp' && st.spawns.length);
  const cp = camps.sort((a, b) => Math.hypot(a.x - 24, a.y - 32) - Math.hypot(b.x - 24, b.y - 32))[0];
  const wakeAt = (cc, id) => { const q = cc.addPlayer(id, L99); q.x = cp.x; q.y = cp.y + 6; while (cc.M.blocked(q.x, q.y)) q.y++; cc.tick(); return q; };
  const c1 = AshCore.create(DS, { seed: 'campA' }), c2 = AshCore.create(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }), { seed: 'campB' });
  wakeAt(c1, 'a'); wakeAt(c2, 'b');
  const u1 = c1.S.mobs.filter(m => m.site === cp.id).map(m => m.uid + ':' + m.key + ':' + m.sx + ',' + m.sy), u2 = c2.S.mobs.filter(m => m.site === cp.id).map(m => m.uid + ':' + m.key + ':' + m.sx + ',' + m.sy);
  ok(u1.length === cp.spawns.length && JSON.stringify(u1) === JSON.stringify(u2) && u1.every(u => +u.split(':')[0] > 17179869184), 'a ' + cp.monster + ' camp ' + Math.round(Math.hypot(cp.x - 24, cp.y - 32)) + ' m out wakes with the same ' + u1.length + ' monsters (same uids) in two separate games');
  /* respawn per area: kill one, leave the area for longer than the empty time, come back */
  { const cc = AshCore.create(DS, { seed: 'camprep' }), q = wakeAt(cc, 'p1'), mob = cc.S.mobs.find(m => m.site === cp.id);
    cc.cmd('p1', { c: 'attack', uid: mob.uid, run: true }); for (let i = 0; i < 300 && !mob.dead; i++) { q.hp = 99; cc.tick(); }
    const area = mob.zone, dead1 = mob.dead > 0;
    for (let i = 0; i < 20; i++) cc.tick(); const still = mob.dead > 0;
    q.x = 22; q.y = 52; q.act = null; q.path = []; for (let i = 0; i < 70; i++) cc.tick();
    q.x = mob.sx; q.y = mob.sy + 3; while (cc.M.blocked(q.x, q.y)) q.y++; const evs = cc.tick();
    ok(dead1 && still && !mob.dead && evs.some(e => e.e === 'repop' && e.zone === area), 'respawn per area: a seeded camp monster stays dead while you are there and comes back after its area (' + area + ') was empty'); }
  /* deterministic replay across chunk fills: walk 150 m out of the old map, wake a camp, fight; replay from the log */
  { const cc = AshCore.create(DS, { seed: 'rep' }), q = cc.addPlayer('p1', save0);
    /* the nearest camp is a rat pit a hundred metres from the well now, and the old map is only so big: to fill and
       drop chunks the walk has to end outside its edges, so aim at the nearest camp that is beyond them */
    const cp2 = camps.filter(st => Math.hypot(st.x - 24, st.y - 32) > 150 && (st.x < 0 || st.y < 0 || st.x > 47 || st.y > 63))
      .sort((a, b) => Math.hypot(a.x - 24, a.y - 32) - Math.hypot(b.x - 24, b.y - 32))[0];
    let wx = cp2.x, wy = cp2.y + 6; while (cc.M.blocked(wx, wy)) wy++;
    /* click along a route, 25 m at a time: the pathfinder only solves a few straight segments per command, and the
       young land round the vale is thick enough that one long goal stops at the first wood */
    const key = (x, y) => (x + 65536) * 131072 + (y + 65536), seen = new Set([key(q.x, q.y)]), qx = [q.x], qy = [q.y], par = [-1];
    let gi = -1;
    for (let h = 0; h < qx.length && gi < 0; h++) {
      if (qx[h] === wx && qy[h] === wy) { gi = h; break; }
      if (Math.abs(qx[h] - q.x) > 400 || Math.abs(qy[h] - q.y) > 400) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = qx[h] + dx, b = qy[h] + dy, k = key(a, b);
        if (seen.has(k) || cc.M.blocked(a, b)) continue;
        seen.add(k); qx.push(a); qy.push(b); par.push(h);
      }
    }
    const route = [];
    if (gi >= 0) { for (let i = gi, last = -1; i >= 0; i = par[i]) { if (i === gi || last < 0 || Math.hypot(qx[i] - qx[last], qy[i] - qy[last]) >= 25) { route.push([qx[i], qy[i]]); last = i; } } route.reverse(); }
    else route.push([wx, wy]);
    for (const [px, py] of route) { cc.cmd('p1', { c: 'walk', x: px, y: py, run: true }); for (let i = 0; i < 70; i++) { cc.tick(); if (!q.path.length) break; } }
    const near = cc.S.mobs.filter(m => m.site && !m.dead).sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y))[0];
    if (near) { cc.cmd('p1', { c: 'attack', uid: near.uid, run: true }); for (let i = 0; i < 80; i++) cc.tick(); }
    const r = AshCore.replay(DS, 'rep', { p1: save0 }, cc.log, cc.S.t);
    const awake = cc.S.mobs.filter(m => m.site).length, outM = Math.round(Math.hypot(q.x - 24, q.y - 32));
    ok(r === cc.hash() && awake > 0 && outM > 150, 'a replay matches over chunk fills and woken camps (' + cc.log.length + ' commands, ' + cc.S.t + ' ticks, ' + outM + ' m from the vale, ' + awake + ' camp monsters awake)'); }
  const wz = [c.weatherZone(c.zoneOf(-200, 30)), c.weatherZone(c.zoneOf(24, 52)), c.weatherZone(c.zoneOf(24, 20))];
  /* 2026-10-03: the weather follows the climate - areas and the towns alike belong to their climate zone's region */
  ok(wz.every(z => /^czc?\d$/.test(z)) && wz[1] === wz[2], 'seeded areas and the towns take the weather of their climate zone (' + c.zoneOf(-200, 30) + ' -> ' + wz[0] + ', the village -> ' + wz[1] + ')');
  ok(c.M.inWorld(24, 32) && c.M.inWorld(-3000, 500) && !c.M.inWorld(0, -40000), 'play is limited to the core face (kilometres in every direction, nothing past its edges)');
  void out; }
/* AV11 (a tester, 2026-10-04): "sometimes a mob cannot be attacked, no visible reason". An attack that could never
   close kept re-pathing every tick - no swing, no message, p.act still set, forever. It must stop, and say so. */
{
  const cv = AshCore.create(D, { seed: 'av11' });
  const v = cv.addPlayer('av', { xp: { attack: 44700, strength: 44700, defence: 134000, hitpoints: 191000 } });
  const wl = cv.S.mobs.filter(m => m.key === 'wolf').sort((a, b) => (Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y)))[0];
  const z0 = cv.zoneOf(v.x, v.y), hp0 = wl.hp;
  /* park the wolf seven tiles off, every tick, wherever the player has got to: the attack can never close */
  const away = () => {
    for (const u of [[7, 0], [-7, 0], [0, 7], [0, -7], [6, 6], [-6, 6], [6, -6], [-6, -6]]) {
      const x = v.x + u[0], y = v.y + u[1];
      if (!cv.M.blocked(x, y) && cv.zoneOf(x, y) === z0) { wl.x = x; wl.y = y; wl.sx = x; wl.sy = y; wl.tgt = 0; wl.back = 0; return; }
    }
  };
  away();
  const mv = []; let ticks = 0;
  cv.cmd('av', { c: 'attack', uid: wl.uid });
  for (; ticks < 300; ticks++) { for (const e of cv.tick()) if (e.e === 'msg') mv.push(e.text); away(); if (!v.act) break; }
  ok(mv.some(t => /can't reach that from here/i.test(t)), 'AV11: an attack that never closes says so instead of dying silently (' + ticks + ' ticks, ' + JSON.stringify(mv.slice(0, 2)) + ')');
  ok(!v.act && wl.hp === hp0, 'AV11: the endless attack is dropped instead of left set (act ' + (v.act ? v.act.k : 'null') + ', wolf hp ' + wl.hp + ')');
  const cw = AshCore.create(D, { seed: 'av11-fight' }), f = cw.addPlayer('av', save0);
  const w2 = cw.S.mobs.filter(m => m.key === 'wolf').sort((a, b) => (Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y)))[0];
  const mf = []; cw.cmd('av', { c: 'attack', uid: w2.uid });
  for (let i = 0; i < 400 && !w2.dead; i++) { for (const e of cw.tick()) if (e.e === 'msg') mf.push(e.text); }
  ok(w2.dead && !mf.some(t => /can't reach/i.test(t)), 'AV11: an ordinary fight still walks in and lands, no give-up message (' + mf.length + ' msgs)');
}
/* "there is no way to get to that rat" (@apple, in-world 2026-10-04; a tester lost the back half of two hunt runs to
   it, 75 s of swings at distance 1-3 for zero damage). The whisperwood rat post at 15,36 stood in an eight-tile nook
   that trees, a pond and a rock had sealed shut: the only tile you can swing from, 14,36, was inside the same nook, so
   no player could ever reach it and the monster could not walk out. The operator's rule is that mobs are meant to reach you
   (PLAN.md; safespots were refused for exactly that reason), so this checks the ground, not the code: every monster
   post that ships must stand where a player can walk to a tile they can hit it from. */
{
  /* on the seeded land the game actually runs on: a yard at a zone's edge (the chapel's, the keep's, the den's) opens onto the
     country round it, which the old flat filler world walled off (2026-10-10) */
  const AshWorldP = require('../src/world.js'), AGP = require('../src/globe.js'), WGMP = require('../src/worldgen.js');
  const cp = AshCore.create(Object.assign({}, D, { wg: AshWorldP.seededWorldgen(WGMP, AGP, D) }), { seed: 'posts-reachable' });
  /* a step is walkable when the far tile is not blocked and the game itself says one step gets there - inReach at
     range 1 is exactly the step rule findPath uses (walls, and no corner-cutting through a diagonal) */
  const stepOK = (a, b) => !cp.M.blocked(b[0], b[1]) && cp.inReach(a[0], a[1], b[0], b[1], 1);
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const stranded = [];
  for (const z of D.zones) for (const sp of (z.spawns || [])) {
    if (cp.M.blocked(sp.x, sp.y)) { stranded.push(z.id + ' ' + sp.m + ' (' + sp.x + ',' + sp.y + ') post is on a blocked tile'); continue; }
    const stand = D8.filter(([dx, dy]) => stepOK([sp.x + dx, sp.y + dy], [sp.x, sp.y])).map(([dx, dy]) => [sp.x + dx, sp.y + dy]);
    if (!stand.length) { stranded.push(z.id + ' ' + sp.m + ' (' + sp.x + ',' + sp.y + ') nothing can swing at it from any side'); continue; }
    const seen = new Set([sp.x + ',' + sp.y]), st = [[sp.x, sp.y]];   // the ground the post stands on
    for (; st.length;) {
      const a = st.pop();
      for (const d of D8) {
        const b = [a[0] + d[0], a[1] + d[1]];
        if (Math.abs(b[0] - sp.x) > 22 || Math.abs(b[1] - sp.y) > 22) continue;
        const k = b[0] + ',' + b[1];
        if (seen.has(k) || !stepOK(a, b)) continue;
        seen.add(k); st.push(b);
      }
    }
    /* and that ground must run out into the world, or have a deliberate passage out (the dragon keep's two-sided
       ladder crosses a closed wall so ranged attacks cannot use its entrance as a firing slit) */
    const far = [...seen].some(k => { const [x, y] = k.split(',').map(Number); return Math.max(Math.abs(x - sp.x), Math.abs(y - sp.y)) >= 18 && stand.every(s => Math.max(Math.abs(s[0] - x), Math.abs(s[1] - y)) >= 3); });
    const passage = cp.M.objects.some(o => o.to && seen.has(o.x + ',' + o.y) && !cp.M.blocked(o.to[0], o.to[1]) && !seen.has(o.to[0] + ',' + o.to[1]));
    const fromWorld = stand.some(s => seen.has(s.join(',')));
    if ((!far && !passage) || !fromWorld) stranded.push(z.id + ' ' + sp.m + ' (' + sp.x + ',' + sp.y + ') stands in a pocket of ' + seen.size + ' tiles' +
      (fromWorld ? '' : ' with nowhere to swing from') + (far ? '' : ' that never reaches open ground'));
  }
  ok(!stranded.length, 'every monster post that ships can be walked to and swung at' + (stranded.length ? ': ' + stranded.join(' | ') : ' (' + D.zones.reduce((n, z) => n + (z.spawns || []).length, 0) + ' posts)'));
  /* and when the ground is fine but the path is still a dead end, the monster is told to come here rather than left
     unkillable: the nook at 15,36 is still sealed, so it makes a fair little laboratory for the case. */
  const cn = AshCore.create(D, { seed: 'posts-come' });
  const r = cn.addPlayer('nm', { xp: { attack: 130344310, strength: 130344310, defence: 130344310, hitpoints: 130344310 } });
  const mr = cn.S.mobs.find(m => m.key === 'rat');
  mr.x = 15; mr.y = 36; mr.sx = 15; mr.sy = 36;   // back in the sealed nook for the test
  r.x = 16; r.y = 35; cn.tick();
  const came = []; cn.cmd('nm', { c: 'attack', uid: mr.uid });
  for (let i = 0; i < 60; i++) { r.hp = cn.maxHp(r); for (const e of cn.tick()) { if (e.e === 'msg') came.push(e.text); } }
  const told = came.filter(t => /can't reach/i.test(t)).length;
  ok(mr.dead || told > 0, 'a monster in a sealed nook is either walked out of it by the mob or called out to the player - never silently unhittable (mob dead ' + mr.dead + ', ' + told + ' reach lines)');
}
/* A mark you cannot stand beside is a decoration, not a fishing spot. You fish from a tile one step off the mark
   (inReach at range 1 is exactly what the gather path asks for), and worldgen's own rule for placing a mark is that
   dry land lies on one side of it (wg_sites). Saltmere's harbour set lay 10 to 40 m of open sea out past the pier
   heads - and the last of them past the east edge of the town's own map - so the coastal town had no fishing at all
   and a fishmonger selling nothing but Ashvale trout. Same ground rule as the monster posts above: check the map,
   not the code (2026-10-05). */
{
  /* on seeded land, the way the game and the referee both build it: without worldgen the world falls back to the old
     map's rectangle, where half of Saltmere is off the edge and nothing there can be walked to or fished. */
  const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
  const cf = AshCore.create(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }), { seed: 'marks-reachable' });
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const dead = [];
  for (const z of D.zones) for (const m of (z.fishing || [])) {
    const stand = D8.map(([dx, dy]) => [m.x + dx, m.y + dy]).filter(t => !cf.M.blocked(t[0], t[1]) && cf.inReach(t[0], t[1], m.x, m.y, 1));
    if (!stand.length) dead.push(z.id + ' ' + (m.fish || 'a') + ' mark at ' + m.x + ',' + m.y + ' has no tile to fish it from');
  }
  const nmarks = D.zones.reduce((n, z) => n + (z.fishing || []).length, 0);
  ok(!dead.length, 'every fishing mark that ships can be fished standing on the bank' + (dead.length ? ': ' + dead.join(' | ') : ' (' + nmarks + ' marks)'));
  /* and a quest that sends you out for fish must be sending you to water that holds them */
  const broken = [];
  for (const Q of Object.values(D.quests.quests)) for (const st of Q.steps) {
    if (!st.goal.bring || !/_raw$/.test(String(st.goal.bring))) continue;
    const zz = allZones.find(x => x.id === st.zone);
    if (!zz || !(zz.fishing || []).some(m => m.fish === st.goal.bring)) broken.push(Q.name + ' step ' + st.id + ' wants ' + st.goal.bring + ' and no mark in ' + st.zone + ' yields one');
  }
  ok(!broken.length, 'a quest that asks for fish asks for fish this world actually has' + (broken.length ? ': ' + broken.join(' | ') : ''));
  /* the stones in rules.json and the town generator are two files about one place: the portal stand has to stand in
     the town it belongs to, or a town stone drops you in a marsh where nobody is waiting */
  const offTown = D.rules.portals.filter(P => P.id !== 'ashvale').filter(P => {
    const own = allZones.find(x => x.id === P.id);
    /* a place under the ground (the Spider Cave) keeps its stone at its mouth up top: the zone whose grid holds `surface` (2026-10-10) */
    const z = own && own.under ? allZones.find(x => x !== own && own.surface[0] >= x.origin[0] && own.surface[0] < x.origin[0] + x.size[0] && own.surface[1] >= x.origin[1] && own.surface[1] < x.origin[1] + x.size[1]) : own;
    return !z || (z.tiles[P.y - z.origin[1]] || '')[P.x - z.origin[0]] === undefined || BLOCK.has((z.tiles[P.y - z.origin[1]] || '')[P.x - z.origin[0]]);
  });
  ok(!offTown.length, 'every portal stand is on walkable ground inside its own town' + (offTown.length ? ': ' + offTown.map(P => P.id + ' at ' + P.x + ',' + P.y).join(', ') : ''));
}
/* The Empty Water (Perla the net-mender, Saltmere's water side, 2026-10-05): the harbour's marks were set out where
   no plank reached, she has had them hauled in, and she wants proof. Played end to end here - three baskets of fish
   and one errand to the fish stall - because every other quest on the trail has been played and this one is new. */
{
  const sz = allZones.find(z => z.id === 'saltmere');
  const perla = sz.npcs.find(n => n.id === 'perla');
  const beside = n => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(d => [n.x + d[0], n.y + d[1]]).find(xy => !BLOCK.has((sz.tiles[xy[1] - sz.origin[1]] || '')[xy[0] - sz.origin[0]]));
  const cw = AshCore.create(D, { seed: 'empty-water' });
  const w = cw.addPlayer('pw', { quests: { empty_water: { step: 1, n: 0 } }, inv: [{ id: 'shrimp_raw', n: 12 }] });
  const talkTo = (id) => { let d = null; cw.cmd('pw', { c: 'npc', id }); for (let i = 0; i < 400 && !d; i++) for (const e of cw.tick()) if (e.e === 'dialog' && e.npc === id) d = e; return d; };
  const give = (id, n) => w.inv.push({ id, n });
  w.x = beside(perla)[0]; w.y = beside(perla)[1];
  const f0 = w.xp.fishing || 0;
  let d = talkTo('perla');
  ok(w.quests.empty_water.step === 2 && (w.xp.fishing || 0) > f0, 'step 1: twelve shrimp in, a step up in fishing, and the shrimp leave the bag (' + (w.xp.fishing || 0) + ' fishing xp from ' + f0 + ')');
  ok(d && /out of reach/i.test(d.lines.join(' ')), 'and Perla says it in words a player can read: ' + ((d || {}).lines || []).join(' / ').slice(0, 60));
  give('salmon_raw', 4); d = talkTo('perla');
  ok(w.quests.empty_water.step === 3 && !w.inv.some(i => i && i.id === 'salmon_raw'), 'step 2: four salmon off the second pier head, and they change hands too');
  give('lobster_raw', 2); d = talkTo('perla');
  ok(w.quests.empty_water.step === 4, 'step 3: two lobsters off the third pier - pot, forty in the skill, mind the plank');
  w.x = beside(sz.npcs.find(n => n.id === 'nettie'))[0]; w.y = beside(sz.npcs.find(n => n.id === 'nettie'))[1];
  talkTo('nettie');
  ok(w.quests.empty_water.step === 4 && w.quests.empty_water.n === 1, 'step 4: the news is told at a counter, and a shop still lets a quest goal register');
  w.x = beside(perla)[0]; w.y = beside(perla)[1];
  d = talkTo('perla');
  ok(w.quests.empty_water.step === 5 && w.inv.some(i => i && i.id === 'pack_t3'), 'and it ends with Perla\'s pack and a town that is fishing again');
  ok(d && /fishing again|harbour/i.test(d.lines.join(' ')), 'the last words land: ' + ((d || {}).lines || []).slice(-1).join('').slice(0, 70));
  const late = cw.addPlayer('pw2', { quests: { empty_water: { step: 5, n: 0 } } });
  late.x = beside(perla)[0]; late.y = beside(perla)[1];
  for (let i = 0; i < 120; i++) cw.tick();
  let d2 = null; cw.cmd('pw2', { c: 'npc', id: 'perla' });
  for (let i = 0; i < 200 && !d2; i++) for (const e of cw.tick()) if (e.e === 'dialog' && e.npc === 'perla') d2 = e;
  ok(d2 && /marks/i.test(d2.lines.join(' ')), 'someone who finished it long ago still gets a word about the marks, not a blank response');
}
/* The Bronze Gate (Silas the mason, Ashvale's second thread, 2026-10-05): the village's own mine gives copper, coal
   and tin, and the hill gives oak, and up to now nothing in the game had the least use for any of them - the general
   store buys them at 45 and that is the whole of their story. So the second reason to keep walking out of Ashvale is
   not a beast at all: it is an arch propped on green pine for thirty-one years, lime burnt at the wrong heat, and
   iron pins rusting on a gate. The same ground rule as the marks and the monster posts - check the map, not the
   code - and then the quest is played end to end. */
{
  const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
  const cg = AshCore.create(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }), { seed: 'nodes-reachable' });
  const byItem = {};
  for (const [ch, nd] of Object.entries(D.rules.nodes)) if (nd.item) byItem[nd.item] = ch;
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dead = [];
  for (const Q of Object.values(D.quests.quests)) for (const st of Q.steps) {
    const it = st.goal.bring;
    if (!it || !byItem[it] || /_raw$/.test(String(it))) continue;   // fish belong to the mark rule above
    const ch = byItem[it];
    const got = allZones.some(z => z.tiles.some((row, v) => row.split('').some((c, u) => c === ch && D4.some(([dx, dy]) => {
      const nx = z.origin[0] + u + dx, ny = z.origin[1] + v + dy;
      return !cg.M.blocked(nx, ny) && cg.inReach(nx, ny, z.origin[0] + u, z.origin[1] + v, 1);
    }))));
    if (!got) dead.push(Q.name + ' step ' + st.id + ' wants ' + it + ' and no ' + D.rules.nodes[ch].name.toLowerCase() + ' in a built zone has ground to work it from');
  }
  ok(!dead.length, 'every item a quest asks you to bring can be gathered off ground you can stand beside' + (dead.length ? ': ' + dead.join(' | ') : ''));
}
{
  const vz = allZones.find(z => z.id === 'village'), silas = vz.npcs.find(n => n.id === 'silas');
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  ok(silas.quest === 'bronze_gate' && !silas.lines && !silas.shop && !silas.tailor,
     'Silas is a giver now - his two chat lines went into the quest, where they do more work than they did by the wall');
  const beside = n => D4.map(d => [n.x + d[0], n.y + d[1]]).find(xy => !BLOCK.has((vz.tiles[xy[1] - vz.origin[1]] || '')[xy[0] - vz.origin[0]]));
  const cb = AshCore.create(D, { seed: 'bronze-gate' });
  const rew = [];
  const p = cb.addPlayer('pb', { quests: { bronze_gate: { step: 1, n: 0 } }, inv: [{ id: 'oak_logs', n: 8 }] });
  const talkTo = (id) => {
    let d = null; cb.cmd('pb', { c: 'npc', id });
    for (let i = 0; i < 400 && !d; i++) for (const e of cb.tick()) { if (e.e === 'dialog' && e.npc === id) d = e; if (e.e === 'reward') rew.push(e); }
    return d;
  };
  const stand = (n) => { const xy = beside(n); p.x = xy[0]; p.y = xy[1]; };
  stand(silas);
  const wc0 = p.xp.woodcutting || 0;
  let d = talkTo('silas');
  ok(p.quests.bronze_gate.step === 2 && (p.xp.woodcutting || 0) > wc0 && !p.inv.some(i => i && i.id === 'oak_logs'),
     'step 1: eight oak lengths in, the centering paid for in woodcutting, and the pine lie told in his own words');
  ok(d && /centering|pine|oak/i.test(d.lines.join(' ')), 'and it opens on a gate, not a carcass: ' + ((d || {}).lines || []).join(' / ').slice(0, 64));
  p.inv.push({ id: 'coal', n: 6 });
  const mn0 = p.xp.mining || 0; d = talkTo('silas');
  ok(p.quests.bronze_gate.step === 3 && (p.xp.mining || 0) > mn0 && !p.inv.some(i => i && i.id === 'coal'),
     'step 2: six coal out of the pit past the copper, and the lime that was burnt wrong is why the gate never dried');
  p.inv.push({ id: 'copper_ore', n: 12 }); d = talkTo('silas');
  ok(p.quests.bronze_gate.step === 4 && !p.inv.some(i => i && i.id === 'copper_ore'),
     'step 3: twelve copper for the pins - in a game with a copper mine, the copper finally has a job');
  stand(vz.npcs.find(n => n.id === 'garrick')); d = talkTo('garrick');   // the last step is a message, and it is said at a shop counter
  ok(p.quests.bronze_gate.step === 4 && p.quests.bronze_gate.n === 1,
     'step 4: the errand registers at an armoury counter - a shop still lets a talk goal land, and tin needs the smith');
  stand(silas); d = talkTo('silas');
  ok(p.quests.bronze_gate.step === 5 && p.inv.some(i => i && i.id === 'shield_t2'),
     'six years of not speaking, one word about a scale, and the boss off the first gate changes hands');
  ok(rew.some(e => e.id === 'shield_t2' && e.collection === 'ASHVALE The Bronze Gate'),
     'the boss is minted into its own collection: ' + (rew.length ? rew[rew.length - 1].collection : 'nothing'));
  ok(d && /gate|settle|hinge/i.test(d.lines.join(' ')), 'and back at the wall he has the last word about the gate: ' + ((d || {}).lines || []).slice(-1).join('').slice(0, 72));
  const shortie = cb.addPlayer('pb2', { quests: { bronze_gate: { step: 2, n: 0 } } });
  const xy = beside(silas); shortie.x = xy[0]; shortie.y = xy[1];
  let d2 = null; cb.cmd('pb2', { c: 'npc', id: 'silas' });
  for (let i = 0; i < 200 && !d2; i++) for (const e of cb.tick()) if (e.e === 'dialog' && e.npc === 'silas') d2 = e;
  ok(d2 && /more coal/i.test(d2.lines.join(' ')), 'a player short of step 2 is told what is still wanted: ' + ((d2 || {}).lines || []).join(' ').slice(0, 56));
}
/* [Claude 2026-10-16] SPEED: the 6 km tally of what the seeded land sites out was walked twice (the kill-count rule and
   the bring rule below), ~45 s each. Sites come from worldgen (world.js sitesIn -> netSites), not from the game's own
   seed, so one walk serves both rules: same numbers, half the time. */
let WILD6K = null;
function wild6k(c) {
  if (WILD6K) return WILD6K;
  WILD6K = {}; for (const s of c.M.sitesIn(-3000, -3000, 3000, 3000)) for (const m of (s.spawns || [])) WILD6K[m.m] = (WILD6K[m.m] || 0) + 1;
  return WILD6K;
}
/* The Sail Loft (Mabb the sailmaker, Saltmere's third thread, 2026-10-05). The rule that pays for it is the one
   under this: a quest may not ask you to kill something the world does not have enough of. The Deer question came
   up while writing it - the loft wanted rat pelts, and there are no rats anywhere near the harbour: the nearest rat
   camp is 253 m out in the woods and the only things standing inside Saltmere's own map are hens. So the ask is
   deer, whose nearest herd is 143 m from the town centre, and the check below is what stops the next quest from
   making the same mistake silently. */
{
  const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
  const cw = AshCore.create(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }), { seed: 'loft-herds' });
  const posted = {};                                     /* monsters a hand-built zone posts itself */
  for (const z of D.zones) for (const sp of (z.spawns || [])) posted[sp.m] = (posted[sp.m] || 0) + 1;
  const wild = {};                                        /* and monsters the seeded land sites out */
  for (const [m, n] of Object.entries(wild6k(cw))) wild[m] = (wild[m] || 0) + n;   /* [Claude 2026-10-16] shared walk, see wild6k */
  const thin = [];
  for (const Q of Object.values(D.quests.quests)) for (const st of Q.steps) {
    const k = st.goal.kill;
    if (!k || (st.zone && !allZones.some(z => z.id === st.zone))) continue;
    const have = (posted[k] || 0) + (wild[k] || 0);
    if (have < st.goal.n) thin.push(Q.name + ' step ' + st.id + ' wants ' + st.goal.n + ' ' + (D.monsters[k] || {}).name + ' and the world has ' + have);
  }
  ok(!thin.length, 'every kill a quest in built ground asks for, the world actually has that many of' + (thin.length ? ': ' + thin.join(' | ') : ''));
}
{
  const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
  const zs = allZones.find(z => z.id === 'saltmere'), mabb = zs.npcs.find(n => n.id === 'mabb');
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  ok(mabb.quest === 'sail_loft' && !mabb.lines && !mabb.shop && !mabb.tailor,
     'Mabb the sailmaker is a giver now - her two chat lines went into the quest, same as Perla before her');
  const cw = AshCore.create(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }), { seed: 'sail-loft' });
  const rew = [];
  const strong = { xp: { attack: 372240, strength: 372240, defence: 372240, hitpoints: 2000000 },
                   quests: { sail_loft: { step: 1, n: 0 } }, inv: [{ id: 'willow_logs', n: 8 }] };
  const p = cw.addPlayer('pl', strong);
  const beside = (n, z) => D4.map(d => [n.x + d[0], n.y + d[1]]).find(xy => !BLOCK.has((z.tiles[xy[1] - z.origin[1]] || '')[xy[0] - z.origin[0]]));
  const stand = (n, z) => { const xy = beside(n, z); p.x = xy[0]; p.y = xy[1]; };
  const talkTo = (id) => {
    let d = null; cw.cmd('pl', { c: 'npc', id });
    for (let i = 0; i < 600 && !d; i++) for (const e of cw.tick()) { if (e.e === 'dialog' && e.npc === id) d = e; if (e.e === 'reward') rew.push(e); }
    return d;
  };
  stand(mabb, zs);
  const wc0 = p.xp.woodcutting || 0;
  let d = talkTo('mabb');
  ok(p.quests.sail_loft.step === 2 && (p.xp.woodcutting || 0) > wc0 && !p.inv.some(i => i && i.id === 'willow_logs'),
     'step 1: eight willow battens in, paid in woodcutting - and willow is the town\'s own tree, 29 tiles of it inside the Saltmere map');
  ok(d && /willow|oak|batten/i.test(d.lines.join(' ')), 'it opens on the wrong wood in a sail, not on a carcass: ' + ((d || {}).lines || []).join(' / ').slice(0, 62));
  /* step 2 is the one that has to be walked: a herd only exists once you are standing in it */
  const zt = zs, cx = zt.origin[0] + Math.round(zt.size[0] / 2), cy = zt.origin[1] + Math.round(zt.size[1] / 2);
  const herd = cw.M.sitesIn(cx - 400, cy - 400, cx + 400, cy + 400).filter(s => s.monster === 'deer')
    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
  ok(!!herd, 'the grazing Mabb sends you to exists, ' + Math.round(Math.hypot(herd.x - cx, herd.y - cy)) + ' m from the town centre');
  p.x = herd.x; p.y = herd.y; while (cw.M.blocked(p.x, p.y)) p.y++;
  for (let i = 0; i < 20; i++) cw.tick();
  const deer = cw.S.mobs.filter(m => m.key === 'deer' && !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 60);   /* this grazing only (2026-10-10) */
  let shot = 0;
  for (const stag of deer) {
    cw.cmd('pl', { c: 'attack', uid: stag.uid, run: true });
    for (let i = 0; i < 600 && !stag.dead && !p.dead && shot < 2; i++) { p.hp = Math.max(p.hp, 60); cw.tick(); }
    if (stag.dead) shot++;
  }
  ok(shot === 2 && p.quests.sail_loft.n === 2, 'step 2: two red deer off the marsh grazing and the loft counts them (' + p.quests.sail_loft.n + '/2)');
  const at0 = p.xp.attack || 0; stand(mabb, zs); d = talkTo('mabb');
  ok(p.quests.sail_loft.step === 3 && (p.xp.attack || 0) > at0,
     'and the palms are paid for in attack - the hide is what the step was ever for');
  p.inv.push({ id: 'net', n: 3 });
  const sp0 = p.xp.speechcraft || 0; d = talkTo('mabb');
  ok(p.quests.sail_loft.step === 4 && (p.xp.speechcraft || 0) > sp0 && !p.inv.some(i => i && i.id === 'net'),
     'step 3: three salted nets for the warp, asked for rather than bought new - which is the harbour Perla\'s marks came back into');
  stand(zs.npcs.find(n => n.id === 'bela'), zs); d = talkTo('bela');   /* the last step is a word said at a counter */
  ok(p.quests.sail_loft.step === 4 && p.quests.sail_loft.n === 1,
     'step 4: the errand registers at a shop counter - a shop still lets a talk goal land, and the account between two women on the same street settles without either of them');
  stand(mabb, zs); d = talkTo('mabb');
  ok(p.quests.sail_loft.step === 5 && p.inv.some(i => i && i.id === 'cape_red'),
     'and up the ladder with the word warp said, the offcut changes hands');
  ok(rew.some(e => e.id === 'cape_red' && e.collection === 'ASHVALE The Sail Loft'),
     'the offcut cape is minted into its own collection: ' + (rew.length ? rew[rew.length - 1].collection : 'nothing'));
  ok(d && /sail|fly|red/i.test(d.lines.join(' ')), 'and back up the ladder she has the last word about the sail: ' + ((d || {}).lines || []).slice(-1).join('').slice(0, 72));
  const shortie = cw.addPlayer('pl2', { quests: { sail_loft: { step: 1, n: 0 } } });
  const xy = beside(mabb, zs); shortie.x = xy[0]; shortie.y = xy[1];
  let d2 = null; cw.cmd('pl2', { c: 'npc', id: 'mabb' });
  for (let i = 0; i < 200 && !d2; i++) for (const e of cw.tick()) if (e.e === 'dialog' && e.npc === 'mabb') d2 = e;
  ok(d2 && /8 more willow/i.test(d2.lines.join(' ')), 'a player with no battens is told the count, not a shrug: ' + ((d2 || {}).lines || []).join(' ').slice(0, 56));
}
/* The rule that pays for increment 9, and it outlives the quest it came out of. Two rules already stop a quest
   asking for something you cannot get: an item off a tree or a rock face must have ground to work it from, and a
   kill must be an animal the world has enough of. Those leave two ways an item exists that nothing checked - a
   thing an animal drops, and a thing standing on a shelf. The Tin Pipe wants a wolf pelt, which is the first time a
   bring step has wanted a drop, so the gap is closed here rather than in a quest. (a tester, 2026-10-05) */
{
  const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
  const ci = AshCore.create(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }), { seed: 'bringable' });
  const byItem = {}; for (const [ch, nd] of Object.entries(D.rules.nodes)) if (nd.item) byItem[nd.item] = ch;
  const marks = new Set(); for (const z of D.zones) for (const m of (z.fishing || [])) marks.add(m.fish);
  const keeps = {};                                /* how many of a kind the world holds, posted and seeded */
  for (const z of D.zones) for (const sp of (z.spawns || [])) keeps[sp.m] = (keeps[sp.m] || 0) + 1;
  for (const [m, n] of Object.entries(wild6k(ci))) keeps[m] = (keeps[m] || 0) + n;   /* [Claude 2026-10-16] shared walk, see wild6k */
  const dropped = {};                              /* and how many of an item that is, across every beast that sheds it */
  for (const [k, mo] of Object.entries(D.monsters)) for (const dr of (mo.drops || [])) dropped[dr.item] = (dropped[dr.item] || 0) + (keeps[k] || 0);
  const shelf = new Set();                         /* plus anything a shop in a built town stands behind */
  for (const S of Object.values(D.shops.shops)) if (keeperZone(S.keeper)) for (const it of (S.stock || [])) shelf.add(it);
  const rawOf = {}, fires = new Set();             /* and what a fire makes of a thing, and where a fire stands at all */
  for (const [k, it] of Object.entries(D.items)) for (const a of (it.attributes || [])) if (a.trait_type === 'Cooks into') rawOf[a.value] = k;
  for (const z of D.zones) if ((z.objects || []).some(o => o.k === 'range' || o.k === 'fire' || o.k === 'campfire')) fires.add(z.id);   /* Ziibiing cooks on a campfire */
  /* three more ways a thing exists (2026-10-10, the sugar bush and the Red Pyre): a tapped tree fills an empty vessel
     (rules.nodes.*.tap + the vessel's "Fills into", core.js emptyBucket/tap) - the vessel itself off a shelf or an npc's
     `craft`; somebody's bones can be searched (an npc's search.items, core.js n.search); and manoomin is knocked off the
     rice stands into a canoe (zone objects k:'rice' -> wild_rice, core.js rideTick) */
  const crafted = new Set(), searched = new Set(), tapped = new Set();
  for (const z of D.zones) for (const n of (z.npcs || [])) { for (const c of (n.craft || [])) if (c.give) crafted.add(c.give); for (const id of ((n.search || {}).items || [])) searched.add(id); }
  if (Object.values(D.rules.nodes).some(nd => nd.tap)) for (const [k, it] of Object.entries(D.items)) for (const a of (it.attributes || [])) if (a.trait_type === 'Fills into' && (shelf.has(k) || crafted.has(k))) tapped.add(a.value);
  const riced = D.zones.some(z => (z.objects || []).some(o => o.k === 'rice'));
  const getable = (it, n) => !!byItem[it] || marks.has(it) || (dropped[it] || 0) >= n || shelf.has(it) || tapped.has(it) || searched.has(it) || (riced && it === 'wild_rice');
  const dead = [];
  for (const Q of Object.values(D.quests.quests)) for (const st of Q.steps) {
    /* bring is one item or a list where any of the list will do (core.js bids), so the step is dead only when NOTHING
       on the list exists, and what gets named is the list - not "undefined" for an array bring. 2026-10-10 */
    const list = [].concat(st.goal.bring || []);
    if (!list.length || (st.zone && !allZones.some(z => z.id === st.zone))) continue;
    /* a cooked thing is getable one step earlier: the raw it comes from has to exist somewhere, and the town you are
       asked to bring it to has to have a fire to cook it on - otherwise the goal is a plate with a cold range behind it */
    const has = (it, deep) => (st.mobGive === it && !!D.monsters[st.mob]) || getable(it, st.goal.n) || (deep < 4 && !!rawOf[it] && has(rawOf[it], deep + 1) && (!st.zone || fires.has(st.zone)));   /* sap -> syrup -> sugar: a fire, more than once; a quest-aware talking monster may also hand over its named item */
    if (list.some(it => has(it, 0))) continue;
    dead.push(Q.name + ' step ' + st.id + ' wants ' + st.goal.n + ' ' + list.map(it => ((D.items[it] || {}).name || it)).join(' or ') +
      ', which is off no node, no mark, no shelf and no range, and the beasts that drop it number ' + list.map(it => dropped[it] || 0).join('/'));
  }
  ok(!dead.length, 'a bring step may only want a thing the world can actually hand over' + (dead.length ? ': ' + dead.join(' | ') : ''));
}
/* [Claude 2026-10-16] The Tin Pipe test lived here; Pip, the Auditor and The Tin Pipe were removed from the game (the operator: "please remove pip and auditor and their associated quests"). */
/* The Elder Bow (Latency the warden, Ashvale's sixth thread out of the village, 2026-10-05). The bow ladder and the
   wood ladder are the same ladder - every bow in the game is named after a tree - and the probes (2026-10-05) found
   the top rung lying in the open: tier 4 is a "Yew shortbow" and it stands on Saltmere's shelf at 1600, while there
   is not one yew tile anywhere inside Saltmere's map. The nearest yew to that counter is nineteen trees on the north
   edge of Ashvale's own wood, 36 m from the warden's post, at forty of woodcutting. And tier 5 - "Elder shortbow",
   5200 - is on no shelf, in no quest and behind no gift in the whole data set: an item the game prints a price for and
   never hands to anybody. So the thread is the ladder, the pay is the rung, and the numbers Latency reads out are
   checked against the map below. (a tester, 2026-10-05) */
{
  const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
  const vz = allZones.find(z => z.id === 'village'), sz = allZones.find(z => z.id === 'saltmere');
  const war = vz.npcs.find(n => n.id === 'latency'), orin = sz.npcs.find(n => n.id === 'orin');
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  ok(war.quest === 'elder_bow' && !war.lines && !war.shop && !war.tailor,
     'Latency the warden is a giver now - his two chat lines went into the bow, where the road he keeps is the reason for it');
  ok(orin && orin.shop && !orin.quest, 'and the message is sent to a counter that is still only a counter: Orin sells, he does not give');
  const byCh = {}; for (const [chh, nd] of Object.entries(D.rules.nodes)) if (nd.item) byCh[nd.item] = chh;
  const POST = [war.x, war.y];                          /* 22,44 - the warden on the north road */
  const where = (item, zone) => {
    const chh = byCh[item], out = [];
    for (const z of (zone ? [zone] : allZones)) z.tiles.forEach((row, v) => { for (let u = 0; u < row.length; u++) if (row[u] === chh)
      out.push({ z: z.id, x: z.origin[0] + u, y: z.origin[1] + v, d: Math.round(Math.hypot(z.origin[0] + u - POST[0], z.origin[1] + v - POST[1])) }); });
    return out.sort((a, b) => a.d - b.d);
  };
  /* "up the range, where the path runs out": Whisperwood's north edge and the Even Grove beside it are the nineteen he counts; the
     cave trail's filler yews west of the wood and Ziibiing's are other ground, and he never walked it (2026-10-10) */
  const yew = where('yew_logs').filter(t => t.z === 'whisperwood' || t.z === 'evengrove'), yewInSaltmere = where('yew_logs', sz);
  ok(yew.length === 19 && yew[0].d <= 45,
     'nineteen yews, exactly as the warden says, the nearest ' + yew[0].d + ' m from his post');
  ok(yewInSaltmere.length === 0 && Object.values(D.shops.shops).some(s => (s.stock || []).some(i => (i.id || i) === 'bow_t4')),
     'and Saltmere sells a bow it calls Yew out of a town with ' + yewInSaltmere.length + ' yews in it - which is the whole quest in one line');
  ok(!Object.values(D.shops.shops).some(s => (s.stock || []).some(i => (i.id || i) === 'bow_t5')),
     'tier 5 is on no counter in the game, so it is a reward and not a price: ' + D.items.bow_t5.name + ', worth ' + D.items.bow_t5.value);
  const ladder = ['oak_logs', 'willow_logs', 'maple_logs', 'yew_logs'].map(i => Math.max(D.rules.nodes[byCh[i]].req, D.rules.nodes[byCh[i]].hard || 0));   /* a maple anyone may cut still bites like a level-30 tree (hard, 2026-10-09) */
  ok(ladder.every((r, i) => i === 0 || r > ladder[i - 1]),
     'the woods really do go up the hill in the order the bows go up the counter: req ' + ladder.join(' < '));
  const ck = AshCore.create(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }), { seed: 'elder-bow' });
  const rew = [];
  const p = ck.addPlayer('pe', { xp: { attack: 372240, strength: 372240, defence: 372240, hitpoints: 2000000 },
                                 quests: { elder_bow: { step: 1, n: 0 } }, inv: [{ id: 'hatchet', n: 1 }] });
  p.xp.woodcutting = D.rules.xp[41] * 10;
  ok(ck.lv(p, 'woodcutting') >= 40, 'a character who can take a stave out of a yew is level ' + ck.lv(p, 'woodcutting') + ' woodcutting');
  const besideOf = (z) => (n) => D4.map(d => [n.x + d[0], n.y + d[1]]).find(xy => !BLOCK.has((z.tiles[xy[1] - z.origin[1]] || '')[xy[0] - z.origin[0]]));
  const stand = (n) => { const xy = besideOf(n === orin ? sz : vz)(n); p.x = xy[0]; p.y = xy[1]; };
  const talkTo = (id) => {
    let d = null; ck.cmd('pe', { c: 'npc', id });
    for (let i = 0; i < 600 && !d; i++) for (const e of ck.tick()) { if (e.e === 'dialog' && e.npc === id) d = e; if (e.e === 'reward') rew.push(e); }
    return d;
  };
  /* step 1 is shooting, and a herd only exists once you are standing in it */
  const cx = vz.origin[0] + Math.round(vz.size[0] / 2), cy = vz.origin[1] + Math.round(vz.size[1] / 2);
  const herds = ck.M.sitesIn(cx - 700, cy - 700, cx + 700, cy + 700).filter(s => s.monster === 'hare')
    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  ok(herds.length > 0, 'the stubble the warden sends you to holds hares - ' + herds.length + ' herds within 700 m, nearest ' + (herds.length ? Math.round(Math.hypot(herds[0].x - cx, herds[0].y - cy)) : '?') + ' m');
  let shot = 0;
  for (const h of herds.slice(0, 10)) {
    p.x = h.x; p.y = h.y; while (ck.M.blocked(p.x, p.y)) p.y++;
    for (let i = 0; i < 20; i++) ck.tick();
    for (const buck of ck.S.mobs.filter(m => m.key === 'hare' && !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 40)) {   /* this herd, not Ziibiing's snare hares 550 m south - chasing those took the gate an hour (2026-10-10) */
      ck.cmd('pe', { c: 'attack', uid: buck.uid, run: true });
      for (let i = 0; i < 900 && !buck.dead && !p.dead && shot < 6; i++) { p.hp = Math.max(p.hp, 60); ck.tick(); }
      if (buck.dead) shot++;
    }
    if (shot >= 6) break;
  }
  ok(shot >= 6 && p.quests.elder_bow.n >= 6, 'step 1: six hares down, which is the warden testing a bow arm (' + p.quests.elder_bow.n + '/6)');
  const rg0 = p.xp.ranged || 0; stand(war);
  let d = talkTo('latency');
  ok(p.quests.elder_bow.step === 2 && (p.xp.ranged || 0) > rg0, 'and the morning is paid for in ranged');
  ok(d && /far mark|hold it steady/i.test(d.lines.join(' ')), 'it opens on shooting, and what he reads out is a mark, not a monster: ' + ((d || {}).lines || []).join(' / ').slice(0, 64));
  p.inv.push({ id: 'deer_hide', n: 4 });
  const st0 = p.xp.strength || 0; stand(war); d = talkTo('latency');
  ok(p.quests.elder_bow.step === 3 && ck.invCount(p, 'deer_hide') === 0 && (p.xp.strength || 0) > st0,
     'step 2: four whole hides for the case - the surplus the village has never once asked a deer for');
  const ww = allZones.find(z => z.id === 'whisperwood');
  const work = (spots, item, want) => {                /* stand on a walkable neighbour and cut - nodes deplete, so keep moving */
    for (let round = 0; round < 8 && ck.invCount(p, item) < want; round++) for (const spot of spots) {
      if (ck.invCount(p, item) >= want) break;
      const at = ck.idx(spot.x, spot.y);
      const step = D4.map(d => [spot.x + d[0], spot.y + d[1]])
        .find(xy => !BLOCK.has((ww.tiles[xy[1] - ww.origin[1]] || '')[xy[0] - ww.origin[0]]));
      if (step) { p.x = step[0]; p.y = step[1]; }
      for (let i = 0; i < 600 && ck.invCount(p, item) < want; i++) {
        p.hp = Math.max(p.hp, 400);                    /* the north wood line has things in it; a bowyer stays alive long enough to finish */
        if (!p.act || p.act.i !== at) ck.cmd('pe', { c: 'gather', x: spot.x, y: spot.y });
        ck.tick();
      }
    }
    return ck.invCount(p, item);
  };
  ok(work(yew, 'yew_logs', 6) >= 6, 'step 3 is cut off the nineteen, up the range: ' + ck.invCount(p, 'yew_logs') + ' yew lengths');
  const wc0 = p.xp.woodcutting; stand(war); d = talkTo('latency');
  ok(p.quests.elder_bow.step === 4 && ck.invCount(p, 'yew_logs') === 0 && (p.xp.woodcutting || 0) > wc0,
     'six lengths off the top rung of the wood ladder, paid in woodcutting at forty');
  stand(orin); d = talkTo('orin');
  ok(p.quests.elder_bow.step === 4 && p.quests.elder_bow.n === 1,
     'step 4: the arithmetic is said at the Saltmere anvil, at a shop counter, ninety paces from a shelf that has the wrong tree on it');
  stand(war); d = talkTo('latency');
  ok(p.quests.elder_bow.step === 5 && p.inv.some(i => i && i.id === 'bow_t5'),
     'and the peg at the top of the gatehouse changes hands: the bow no counter carries');
  ok(rew.some(e => e.id === 'bow_t5' && e.collection === 'ASHVALE The Elder Bow'),
     'the elder bow is minted into its own collection: ' + (rew.length ? rew[rew.length - 1].collection : 'nothing'));
  ok(d && /bow|road|yew|peg/i.test(d.lines.join(' ')), 'and the last word is the road, which is what he was for: ' + ((d || {}).lines || []).slice(-1).join('').slice(0, 72));
  const shortie = ck.addPlayer('pe2', { quests: { elder_bow: { step: 2, n: 0 } } });
  const xy2 = besideOf(vz)(war); shortie.x = xy2[0]; shortie.y = xy2[1];
  let d2 = null; ck.cmd('pe2', { c: 'npc', id: 'latency' });
  for (let i = 0; i < 200 && !d2; i++) for (const e of ck.tick()) if (e.e === 'dialog' && e.npc === 'latency') d2 = e;
  ok(d2 && /4 more deer hide/i.test(d2.lines.join(' ')), 'a player at the case is told how many hides are still short: ' + ((d2 || {}).lines || []).join(' ').slice(0, 62));
}
/* The Kitchen Range (Cinder the cook, Ashvale's seventh thread out of the village, 2026-10-05). Cooking is the one
   skill the trail never touched: seven raw things in the data cook into food, there is exactly one range standing in
   each town, and until today no quest had ever asked for a cooked thing or paid one point of cooking XP - while every
   cooked meat and the shrimp are bought by nobody anywhere. The probe that found the thread (2026-10-05) counted the
   burn curve off the engine's own messages - two in five of a batch goes black at the level a rung asks for, four
   points less a level, and none at all ten levels above - and then found the fact worth telling out loud: the only
   two trout marks in the world stand in Ashvale's lake, sixteen paces off the village range, while Saltmere, a harbour
   town with seven marks, pots, nets and a fish stall, has never landed one and sells the only cooked trout on any
   shelf in the game. Cinder reads numbers out, so every one of them is measured below; and because the trout rung
   wants fishing 20 and the venison rung wants cooking 15, the pay is checked to fund the ladder before the thread is
   played end to end. (a tester, 2026-10-05) */
{
  const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
  const vz = allZones.find(z => z.id === 'village'), sz = allZones.find(z => z.id === 'saltmere');
  const cin = vz.npcs.find(n => n.id === 'cinder'), cur = vz.npcs.find(n => n.id === 'symmetry');
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], D8 = D4.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  ok(cin.quest === 'kitchen_range' && !cin.lines && !cin.shop && !cin.tailor,
     'Cinder the cook is a giver now - her two chat lines went into the range, where the fire she keeps is the reason for it');
  ok(cur && (cur.lines || []).length === 2 && !cur.quest && !cur.shop, 'and the last course is carried to a curator who keeps his own two lines and gives nothing else - a talk goal lands at whoever stands there');
  const RG = (vz.objects || []).find(o => o.k === 'range'), WL = (vz.objects || []).find(o => o.k === 'well');
  const fire = {}; for (const [k, it] of Object.entries(D.items)) if (!(it.attributes || []).some(a => a.trait_type === 'Container')) for (const a of (it.attributes || [])) {   /* the sugar bush's buckets boil down, they are not the cook's ladder */
    const t = D.rules.items.traits[a.trait_type]; if (!t) continue;
    (fire[k] = fire[k] || {})[Array.isArray(t) ? t[0] : t] = Array.isArray(t) ? Math.round(a.value * t[1]) : a.value; }
  const marks = []; for (const z of allZones) for (const m of (z.fishing || [])) marks.push(Object.assign({ zone: z.id }, m));
  const dm = (x, y) => Math.round(Math.hypot(x - RG.x, y - RG.y));
  const cookedOf = new Set(Object.entries(D.items).flatMap(([k, it]) => (it.attributes || []).filter(a => a.trait_type === 'Cooks into').map(a => a.value)));
  ok(Object.values(fire).filter(f => f.cooks).length === 12 &&   /* 2026-10-17: + raw mutton and raw beef, the Lake Castle farm's sheep and cows */ ['village', 'saltmere'].every(z => allZones.find(a => a.id === z).objects.filter(o => o.k === 'range').length === 1),
     'the ladder is real before it is a quest: ' + Object.values(fire).filter(f => f.cooks).length + ' raw things cook into food, and one range stands in each built town, none in the wood');
  /* Re-measured on the current quests 2026-10-10: three threads want a thing that came off a fire now - the range's
     own ladder, Iria's supper (a lobster) and the sugar bush (what boils down in the buckets). Named in full, so a
     fourth one asking for cooked food still fails this. */
  const cookedAsked = Object.entries(D.quests.quests).filter(([k, q]) => q.steps.some(st => [].concat(st.goal.bring || []).some(b => cookedOf.has(b)))).map(([k]) => k).sort();
  ok(cookedAsked.join() === ['iria_supper', 'kitchen_range', 'sugar_bush', 'vespers'].join(),   /* 2026-10-17: Vespers asks for roast mutton from the castle farm, on purpose */
     'and the threads that ever ask for a thing cooked through are this one and the two named: ' + cookedAsked.join(', '));
  ok(dm(RG.x, RG.y) === 0 && Math.round(Math.hypot(RG.x - WL.x, RG.y - WL.y)) === 7,
     'seven paces from the well, exactly as she says: the range is ' + RG.x + ',' + RG.y + ' and the well ' + WL.x + ',' + WL.y);
  ok(D4.filter(d => !((vz.tiles[RG.y + d[1] - vz.origin[1]] || '')[RG.x + d[0] - vz.origin[0]] || '#').match(new RegExp('[' + BLOCK + ']'))).length === 4,
     'and there is room to stand on all four sides of it, which is the difference between a range and a wall');
  const trout = marks.filter(m => m.fish === 'trout_raw');
  ok(trout.length === 2 && trout.every(m => m.zone === 'village' && dm(m.x, m.y) === 16) && (sz.fishing || []).length === 7,
     'the only two trout marks in the game are in this lake, both ' + dm(trout[0].x, trout[0].y) + ' m off the wall, while Saltmere, with ' + (sz.fishing || []).length + ' marks of its own, has landed ' + (sz.fishing || []).filter(m => m.fish === 'trout_raw').length);
  const shrimp = marks.filter(m => m.fish === 'shrimp_raw' && m.zone === 'village');
  const reach = shrimp.map(m => dm(m.x, m.y)).sort((a, b) => a - b);
  ok(shrimp.length === 4 && shrimp.every(m => (m.req || 1) === 1) && reach[0] === 16 && reach[3] === 23,
     'four net marks between ' + reach[0] + ' and ' + reach[3] + ' paces of the wall, all of them at fishing one, as she says them');
  const rung = ['shrimp_raw', 'hare_raw', 'trout_raw', 'venison_raw'].map(k => fire[k].cookReq);
  ok(rung[0] === 1 && rung[1] === 5 && rung[2] === 5 && rung[3] === 15,
     'the rungs are where she says they are: cooking ' + rung.join(' / ') + ' for shrimp, hare, trout and venison');
  ok(!Object.values(D.shops.shops).some(s => keeperZone(s.keeper) && s.zone === 'village' && (s.boughtBy || []).length),
     'and Ashvale has no food shop to fall back on - no cooked thing in the village is bought by anybody');
  ok(!Object.values(D.shops.shops).some(s => (s.stock || []).some(i => (i.id || i) === 'pack_t4')) &&
     !Object.values(D.quests.quests).some(q => q.name !== 'The Kitchen Range' && q.steps.some(st => st.reward === 'pack_t4')) &&
     (D.items.pack_t4.attributes || []).some(a => a.trait_type === 'Carry' && a.value > 5),
     'the pay is the rung nobody sells: ' + D.items.pack_t4.name + ', on no counter, in no other quest, carrying ' +
     ((D.items.pack_t4.attributes || []).find(a => a.trait_type === 'Carry') || {}).value + ' kg');
  /* the burn, off the engine\'s own messages, at the rung and ten levels above it */
  const burnAt = (lvl, raw, cooks) => {
    const c = AshCore.create(D, { seed: 'burn-' + raw + lvl }), q = c.addPlayer('pb', { inv: [] });
    const xp0 = D.rules.xp[Math.max(1, lvl)] * 10; q.xp.cooking = xp0;
    q.x = RG.x + 1; q.y = RG.y; let burnt = 0, done = 0;
    for (let i = 0; i < 60000 && done < cooks; i++) {
      q.xp.cooking = xp0;   /* [Claude 2026-10-18] held at the rung: the burn rate is measured AT a level, not across the levels the batch earns (40 cooks of a rising cook read 18-43%) */
      if (!q.inv.some(t => t && fire[t.id] && fire[t.id].cooks)) { const f = q.inv.findIndex(t => !t); if (f >= 0) q.inv[f] = { id: raw, n: 1 }; }
      if (!q.act || q.act.k !== 'gather') c.cmd('pb', { c: 'gather', x: RG.x, y: RG.y });
      for (const e of c.tick()) if (e.e === 'msg' && /^You (accidentally burn the|cook the) /.test(e.text)) { if (/burn/.test(e.text)) burnt++; done++; }
    }
    return { pct: Math.round(100 * burnt / done), n: done, at: c.lv(q, 'cooking') };
  };
  const b1 = burnAt(1, 'shrimp_raw', 40), b2 = burnAt(fire.trout_raw.cookReq + 10, 'trout_raw', 40);
  ok(b1.pct >= 20 && b1.pct <= 60, 'the fire takes ' + b1.pct + '% of a batch at the rung it is cooked at - ' + b1.n + ' shrimp off a cook standing at level one');
  ok(b2.pct === 0, 'and ' + b2.pct + '% ten levels above the rung, at cooking ' + b2.at + ', which is the whole of the argument for practicing');
  /* and the ladder the quest asks for has to be climbable out of the pay the quest itself hands over */
  {
    const Q = D.quests.quests.kitchen_range, X = { fishing: 0, cooking: 0 };
    const lvOf = (v) => { let L = 1; while (L < 99 && D.rules.xp[L + 1] <= v) L++; return L; };
    const short = [];
    for (const st of Q.steps) {
      const raw = Object.entries(D.items).map(([k, it]) => ((it.attributes || []).some(a => a.trait_type === 'Cooks into' && a.value === st.goal.bring) ? k : null)).find(Boolean);
      if (raw) {
        const need = fire[raw].cookReq, mark = marks.find(m => m.fish === raw);
        if (lvOf(X.cooking) < need) short.push('step ' + st.id + ' wants cooking ' + need + ' to put ' + D.items[st.goal.bring].name.toLowerCase() + ' on it and the pay so far gives ' + lvOf(X.cooking));
        if (mark && lvOf(X.fishing) < (mark.req || 1)) short.push('step ' + st.id + ' wants ' + D.items[raw].name.toLowerCase() + ' off a mark at fishing ' + (mark.req || 1) + ' and the pay so far gives ' + lvOf(X.fishing));
        X.cooking += Math.ceil(st.goal.n * 1.7) * fire[raw].cookXp;      /* burnt ones have to be cooked again, and give nothing */
        if (mark) X.fishing += st.goal.n * ((mark.xp || 100) / 10);
      }
      if (String(st.reward || '').indexOf('xp:') === 0) { const [, sk, n] = st.reward.split(':'); if (X[sk] !== undefined) X[sk] += +n; }
    }
    ok(!short.length, 'The Kitchen Range funds its own ladder' + (short.length ? ': ' + short.join(' | ') : ' - ' + lvOf(X.fishing) + ' fishing and ' + lvOf(X.cooking) + ' cooking by the end of it'));
  }
  /* played end to end, with the catches, the shooting and the cooking done rather than imagined */
  const ck = AshCore.create(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }), { seed: 'kitchen-range' });
  const rew = [];
  const p = ck.addPlayer('pr', { xp: { attack: 372240, strength: 372240, defence: 372240, ranged: 372240,
                                       dexterity: 372240, hitpoints: 2000000 },
                                 quests: { kitchen_range: { step: 1, n: 0 } },
                                 inv: [{ id: 'net', n: 1 }, { id: 'fishing_rod', n: 1 },
                                       { id: 'bow_t1', n: 1 }, { id: 'arrows_t1', n: 300 }] });
  ck.cmd('pr', { c: 'equip', slot: 2 }); ck.tick();          /* she says it herself - they want the bow strung */
  ck.cmd('pr', { c: 'equip', slot: 3 }); ck.tick();
  ok(ck.lv(p, 'fishing') === 1 && ck.lv(p, 'cooking') === 1, 'the cook starts you at nothing: fishing 1, cooking 1');
  const tileOf = (z, t) => ((z.tiles[t[1] - z.origin[1]] || ' ')[t[0] - z.origin[0]] || '#');
  const standV = (n) => { const xy = D4.map(d => [n.x + d[0], n.y + d[1]]).find(xy => !BLOCK.has((vz.tiles[xy[1] - vz.origin[1]] || '')[xy[0] - vz.origin[0]])); p.x = xy[0]; p.y = xy[1]; };
  const talkTo = (id) => {
    let d = null; ck.cmd('pr', { c: 'npc', id });
    for (let i = 0; i < 600 && !d; i++) for (const e of ck.tick()) { if (e.e === 'dialog' && e.npc === id) d = e; if (e.e === 'reward') rew.push(e); }
    return d;
  };
  const burnt = new Set(Object.values(fire).map(f => f.burns).filter(Boolean));
  const scorched = { n: 0 };
  const clearBurnt = () => {                                         /* the burnt ones are for the pigs, she says */
    let n = 0;
    for (let k = 0; k < p.inv.length; k++) if (p.inv[k] && burnt.has(p.inv[k].id)) { p.inv[k] = null; n++; }
    return n;
  };
  const atRange = () => { const xy = D4.map(d => [RG.x + d[0], RG.y + d[1]]).find(xy => !ck.M.blocked(xy[0], xy[1])); p.x = xy[0]; p.y = xy[1]; };
  const landSome = (want, item, tool, limit) => {                    /* fish a batch, no more: a raw thing is one per slot */
    const spotsV = marks.filter(m => m.fish === item && m.zone === 'village').sort((a, b) => dm(a.x, a.y) - dm(b.x, b.y));
    for (let round = 0; round < 10 && ck.invCount(p, item) < limit; round++) for (const spot of spotsV) {
      if (ck.invCount(p, item) >= limit) break;
      const at = ck.idx(spot.x, spot.y), xy = D8.map(d => [spot.x + d[0], spot.y + d[1]]).find(t => !ck.M.blocked(t[0], t[1]));
      if (xy) { p.x = xy[0]; p.y = xy[1]; }
      for (let i = 0; i < 900 && ck.invCount(p, item) < limit; i++) {
        p.hp = Math.max(p.hp, 400); scorched.n += clearBurnt();
        if (!p.act || p.act.i !== at) ck.cmd('pr', { c: 'gather', x: spot.x, y: spot.y });
        ck.tick();
      }
    }
    return ck.invCount(p, item);
  };
  const cookSome = (cooked, want, raw) => {                         /* and the range is where she told you it would be.
                                                                      Two things the engine decides for you: the act has
                                                                      to name THIS tile - a stale gather on a mark or a
                                                                      herd tile is still kind 'gather' - and the fire
                                                                      takes the FIRST raw her hand reaches, so every
                                                                      other raw thing goes back to the shelf first. */
    for (let k = 0; k < p.inv.length; k++) if (p.inv[k] && fire[p.inv[k].id] && fire[p.inv[k].id].cooks && p.inv[k].id !== raw) p.inv[k] = null;
    const at = ck.idx(RG.x, RG.y);
    for (let round = 0; round < 6 && ck.invCount(p, cooked) < want; round++) {
      atRange();
      for (let i = 0; i < 4000 && ck.invCount(p, cooked) < want; i++) {
        p.hp = Math.max(p.hp, 400); scorched.n += clearBurnt();
        if (!p.inv.some(t => t && fire[t.id] && fire[t.id].cooks)) break;
        if (!p.act || p.act.k !== 'gather' || p.act.i !== at) ck.cmd('pr', { c: 'gather', x: RG.x, y: RG.y });
        ck.tick();
      }
    }
    return ck.invCount(p, cooked);
  };
  const cx = vz.origin[0] + Math.round(vz.size[0] / 2), cy = vz.origin[1] + Math.round(vz.size[1] / 2);
  const hunt = (kind, item, want, herds) => {                         /* shoot the nearest of them, and when it runs
                                                                      nearest of them, and when it runs you shoot the
                                                                      next one standing. The meat is picked off the
                                                                      ground where the beast fell - the engine drops
                                                                      the carcase there rather than into your bag. */
    /* A herd is two or three beasts and it is empty once you have shot it, so the errand is a walk
       from herd to herd - which is what "more of them on the stubble than there are of us" means. */
    for (const herd of herds) {
      if (ck.invCount(p, item) >= want) break;
      p.x = herd.x; p.y = herd.y; while (ck.M.blocked(p.x, p.y)) p.y++;
      for (let i = 0; i < 25; i++) ck.tick();
      for (let shot = 0; shot < 8 && ck.invCount(p, item) < want; shot++) {
        const beast = ck.S.mobs.filter(m => m.key === kind && !m.dead && Math.abs(m.x - p.x) < 40 && Math.abs(m.y - p.y) < 40)
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (!beast) break;
        ck.cmd('pr', { c: 'attack', uid: beast.uid, run: true });
        for (let i = 0; i < 150 && !beast.dead && !p.dead; i++) { p.hp = Math.max(p.hp, 400); ck.tick(); }
        for (let i = 0; i < 4 && beast.dead; i++) ck.tick();          /* the drop lands two ticks after the beast stops */
      }
      for (const g of ck.S.ground.filter(g => g.id === item && Math.abs(g.x - p.x) < 130 && Math.abs(g.y - p.y) < 130)) {
        if (!ck.M.blocked(g.x, g.y)) { p.x = g.x; p.y = g.y; } else { p.x = g.x + 1; p.y = g.y; }
        ck.cmd('pr', { c: 'take', uid: g.uid });
        for (let i = 0; i < 25 && ck.S.ground.some(q => q.uid === g.uid); i++) { p.hp = Math.max(p.hp, 400); ck.tick(); }
      }
    }
    return ck.invCount(p, item);
  };
  ok(landSome(0, 'shrimp_raw', 'net', 4) >= 4, 'the net marks give up their shrimp from ' + dm(shrimp[0].x, shrimp[0].y) + ' m out: ' + ck.invCount(p, 'shrimp_raw') + ' raw in the bag');
  ok(cookSome('shrimp', 10, 'shrimp_raw') >= 10 || ck.invCount(p, 'shrimp_raw') === 0, 'the range does what the range does, and the burnt ones go to the pigs');
  for (let cast = 0; cast < 8 && cookSome('shrimp', 10, 'shrimp_raw') < 10; cast++) landSome(0, 'shrimp_raw', 'net', 4);
  cookSome('shrimp', 10, 'shrimp_raw');
  const f0 = p.xp.fishing; standV(cin);
  let d = talkTo('cinder');
  ok(p.quests.kitchen_range.step === 2 && ck.invCount(p, 'shrimp') === 0 && (p.xp.fishing || 0) > f0,
     'step 1: ten cooked shrimp in, and paid in the skill the bank teaches (' + ck.lv(p, 'fishing') + ' fishing, ' + ck.lv(p, 'cooking') + ' cooking)');
  ok(d && /range|net|well/i.test(d.lines.join(' ')), 'it opens on a cold iron range seven paces from a well: ' + ((d || {}).lines || []).join(' / ').slice(0, 64));
  const stubble = ck.M.sitesIn(RG.x - 220, RG.y - 220, RG.x + 220, RG.y + 220).filter(s => s.monster === 'hare')
    .sort((a, b) => Math.hypot(a.x - RG.x, a.y - RG.y) - Math.hypot(b.x - RG.x, b.y - RG.y))[0];
  ok(stubble && Math.abs(stubble.y - RG.y) > 40 && Math.round(Math.hypot(stubble.x - RG.x, stubble.y - RG.y)) < 140,
     'the stubble she points at is ' + (stubble ? Math.round(Math.hypot(stubble.x - RG.x, stubble.y - RG.y)) : '?') + ' m out and south of the wall, and the hares are standing in it');
  const stubbleH = ck.M.sitesIn(RG.x - 220, RG.y - 220, RG.x + 220, RG.y + 220).filter(s => s.monster === 'hare')
    .sort((a, b) => Math.hypot(a.x - RG.x, a.y - RG.y) - Math.hypot(b.x - RG.x, b.y - RG.y)).slice(0, 10);
  let shots = 0;
  /* [Claude 2026-10-16] SPEED: the hares are handed over instead of shot off the stubble (the operator: tests teleport and
     talk; movement problems are reported from play). The stubble above still has to hold hares; the cooking is real. */
  while (cookSome('hare_cooked', 3, 'hare_raw') < 3 && shots++ < 4) for (let n = 0; n < 3; n++) { const f = p.inv.findIndex(t => !t); if (f >= 0 && stubbleH.length) p.inv[f] = { id: 'hare_raw', n: 1 }; }
  ok(ck.invCount(p, 'hare_cooked') >= 3 && ck.lv(p, 'cooking') >= 5,
     'step 2: hares off the stubble and three of them cooked through at cooking ' + ck.lv(p, 'cooking') + ' - ' + shots + ' trip' + (shots === 1 ? '' : 's') + ' out, ' + scorched.n + ' gone black, ' + ck.invCount(p, 'hare_raw') + ' raw left in the bag');
  const f1 = p.xp.fishing; standV(cin); d = talkTo('cinder');
  ok(p.quests.kitchen_range.step === 3 && (p.xp.fishing || 0) > f1 && ck.lv(p, 'fishing') >= 20,
     'and the pay for the first two is what the trout rung costs - ' + ck.lv(p, 'fishing') + ' fishing before the rod comes out');
  for (let cast = 0; cast < 8 && cookSome('trout', 4, 'trout_raw') < 4; cast++) landSome(0, 'trout_raw', 'fishing_rod', 3);
  cookSome('trout', 4, 'trout_raw');
  ok(ck.invCount(p, 'trout') >= 4, 'step 3: the only two trout marks in the world, landed on a rod at ' + ck.lv(p, 'fishing') + ' fishing, cooked to ' + ck.invCount(p, 'trout') + ' of four');
  const c1 = p.xp.cooking; standV(cin); d = talkTo('cinder');
  ok(p.quests.kitchen_range.step === 4 && (p.xp.cooking || 0) > c1 && ck.lv(p, 'cooking') >= 15,
     'the trout are paid for in cooking, which is how the venison rung gets climbed: level ' + ck.lv(p, 'cooking'));
  const grazing = ck.M.sitesIn(RG.x - 450, RG.y - 450, RG.x + 450, RG.y + 450).filter(s => s.monster === 'deer')
    .sort((a, b) => Math.hypot(a.x - RG.x, a.y - RG.y) - Math.hypot(b.x - RG.x, b.y - RG.y))[0];
  ok(grazing && grazing.y < RG.y - 100 && Math.abs(grazing.x - RG.x) < 60,
     'the grazing she points at is due north of the wall: the nearest deer are ' + (grazing ? (grazing.x - RG.x) + ' m east and ' + (RG.y - grazing.y) + ' m north' : '?'));
  const grazingH = ck.M.sitesIn(RG.x - 450, RG.y - 450, RG.x + 450, RG.y + 450).filter(s => s.monster === 'deer')
    .sort((a, b) => Math.hypot(a.x - RG.x, a.y - RG.y) - Math.hypot(b.x - RG.x, b.y - RG.y)).slice(0, 8);
  let rides = 0;
  /* [Claude 2026-10-16] SPEED: no deer chase either - the meat is handed over just below (grazingH still has to be there) */
  if (!grazingH.length) rides = 99;
  /* A stag that has seen you is gone, and this file already walks a deer hunt of its own two hundred lines
     above (sail_loft step 2), so what the fire needs is the meat, not a second chase. */
  for (let n = 0; n < 10 && cookSome('venison_cooked', 2, 'venison_raw') < 2; n++) p.inv.push({ id: 'venison_raw', n: 1 });
  ok(ck.invCount(p, 'venison_cooked') >= 2 && ck.lv(p, 'cooking') >= 15,
     'step 4: two haunches cooked through at cooking ' + ck.lv(p, 'cooking') + ', on her own rung and no higher, and ' + scorched.n + ' of the batch went black the whole way down');
  const c2 = p.xp.cooking; standV(cin); d = talkTo('cinder');
  ok(p.quests.kitchen_range.step === 5 && (p.xp.cooking || 0) > c2, 'and the last course is paid for in the fire itself');
  standV(cur); d = talkTo('symmetry');
  ok(p.quests.kitchen_range.step === 5 && p.quests.kitchen_range.n === 1,
     'step 5: the supper is carried five paces west to the curator, at a shop counter, and he hears the trout story');
  standV(cin); d = talkTo('cinder');
  ok(p.quests.kitchen_range.step === 6 && p.inv.some(i => i && i.id === 'pack_t4'),
     'and the frame pack comes off her wall: ' + D.items.pack_t4.name + ', tier four of a ladder that stops at three');
  ok(rew.some(e => e.id === 'pack_t4' && e.collection === 'ASHVALE The Kitchen Range'),
     'the pack is minted into its own collection: ' + (rew.length ? rew[rew.length - 1].collection : 'nothing'));
  ok(d && /range|lit|trout/i.test(d.lines.join(' ')), 'and the last word is the range being lit: ' + ((d || {}).lines || []).slice(-1).join('').slice(0, 72));
  const shortie = ck.addPlayer('pr2', { quests: { kitchen_range: { step: 1, n: 0 } } });
  const xy2 = D4.map(dd => [cin.x + dd[0], cin.y + dd[1]]).find(xy2 => !BLOCK.has((vz.tiles[xy2[1] - vz.origin[1]] || '')[xy2[0] - vz.origin[0]]));
  shortie.x = xy2[0]; shortie.y = xy2[1];
  let d2 = null; ck.cmd('pr2', { c: 'npc', id: 'cinder' });
  for (let i = 0; i < 200 && !d2; i++) for (const e of ck.tick()) if (e.e === 'dialog' && e.npc === 'cinder') d2 = e;
  ok(d2 && /10 more shrimp/i.test(d2.lines.join(' ')), 'a player with an empty bag is told the count, not a shrug: ' + ((d2 || {}).lines || []).join(' ').slice(0, 56));
}
/* [Claude 2026-10-16] The Skinning Knife test (increment 13) lived here; the quest and Fenn the tanner were removed from the
   game (the operator: "you can delete the skinning knife quest then for now"). */
/* AV23: the combat level a monster is shown with has to be the one the game actually judges it by
   (@yourfirstname through a tester: "combat levels should be shown in the game"). A monster turns
   a player away when that player's combatLevel is above it, so the engine now prints core.mobCombat
   on the plate, in the menu and in Examine - one function, so the number on screen and the rule in
   acquire() cannot drift apart. This pins both: the scale, and the wolf that proves it. */
{
  const cs = AshCore.create(D, { seed: 'combat-scale' });
  const keys = Object.keys(D.monsters), off = keys.filter(k => cs.mobCombat(D.monsters[k]) !== D.monsters[k].level * 2);
  ok(!off.length, 'AV23: mobCombat is the number the aggro rule uses, for all ' + keys.length + ' monsters' + (off.length ? ' (off: ' + off.join(', ') + ')' : ' (wolf level ' + D.monsters.wolf.level + ' = combat ' + cs.mobCombat(D.monsters.wolf) + ')'));
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const den = (lvset) => {   // a player dropped beside a wolf, kept alive so the only question is who the wolf notices
    const c = AshCore.create(D, { seed: 'wolf-scale' }), w = c.S.mobs.find(m => m.key === 'wolf' && !m.dead);
    const xp = lvset && { attack: c.xpFor(lvset[0]) * 10, strength: c.xpFor(lvset[0]) * 10, defence: c.xpFor(lvset[1]) * 10, hitpoints: c.xpFor(lvset[1]) * 10 };   // saves carry experience x10, as exportPlayer writes it
    const q = c.addPlayer('p1', xp ? { xp } : undefined);
    const near = D8.map(d => [w.x + d[0], w.y + d[1]]).find(t => !c.M.blocked(t[0], t[1]));
    q.x = near[0]; q.y = near[1];
    let hit = 0, other = 0;   // damage from this wolf only - a den has more than one set of teeth
    for (let i = 0; i < 30; i++) {
      q.hp = c.maxHp(q); w.hp = c.D.monsters.wolf.hp;
      for (const e of c.tick()) { if (e.e === 'hit' && e.dst === q.id) { if (e.src === w.uid) hit = 1; else other++; } }
    }
    return { sees: w.tgt === q.id, hurt: !!hit, other, cb: c.combatLevel(q), mob: c.mobCombat(D.monsters.wolf) };
  };
  const wolf = cs.mobCombat(D.monsters.wolf);
  const even = den([15, 13]), over = den([16, 14]), fresh = den();
  ok(even.cb === wolf && over.cb === wolf + 1, 'AV23: the saved combat levels this check needs are ' + wolf + ' and ' + (wolf + 1) + ' (got ' + even.cb + ' and ' + over.cb + ')');
  ok(even.sees && even.hurt, 'AV23: a wolf (combat ' + even.mob + ') takes a combat-' + even.cb + ' player - the number on its plate is the threshold');
  ok(!over.sees && !over.hurt, 'AV23: the same wolf walks past a combat-' + over.cb + ' player one point above its number (' + over.other + ' hits from other monsters at that den)');
  ok(fresh.sees && fresh.hurt, 'AV23: and it goes for a combat-' + fresh.cb + ' newcomer in the same spot');
}
/* every shop lists each item once (a duplicate staff_frost broke Garrick's shop screen, 2026-10-01) */
for (const [sid, sh] of Object.entries(mod('shops').shops)) { const dup = sh.stock.filter((k, i) => sh.stock.indexOf(k) !== i); ok(!dup.length, 'shop ' + sid + ' lists each item once' + (dup.length ? ' (twice: ' + dup + ')' : '')); }
{
  const helm = AshCore.create(D, { seed: 'trade-helm' }), h = helm.addPlayer('h1', {});
  h.eq.head = { id: 'helmet_t4', n: 1 };
  ok(helm.storeItem('h1', 'helmet_t4', 1) === 1 && !h.eq.head, 'a worn mithril helmet comes off when the chain trade takes it');
  helm.grantItem('h1', 'helmet_t4', 1); h.eq.head = { id: 'helmet_t4', n: 1 };
  ok(helm.storeItem('h1', 'helmet_t4', 1) === 1 && helm.invCount(h, 'helmet_t4') === 0 && h.eq.head && h.eq.head.id === 'helmet_t4', 'the bag copy goes first, the one on the head stays if you still have it');
}
console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
