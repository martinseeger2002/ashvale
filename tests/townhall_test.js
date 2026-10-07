/* Saltmere town hall: three empty terraces become rooms, a bank counter, a mayor who only talks,
   and a night-only wall torch on every NPC-occupied building (2026-10-07). */
'use strict';
const fs = require('fs'), path = require('path');
const AshCore = require('../src/core.js');
const DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const salt = mod('zone.saltmere'), village = mod('zone.village');
const bld = z => (z.objects || []).filter(o => ['house', 'shop', 'smithy', 'church'].includes(o.k));
const at = (z, x, y) => bld(z).filter(o => x >= o.x && y >= o.y && x < o.x + o.w && y < o.y + o.h);
const hall = bld(salt).find(o => o.sign === 'Town Hall');
ok(!!hall, 'Town Hall stands on Saltmere high street');
ok(hall && hall.x === 381 && hall.y === 15 && hall.w === 20 && hall.h === 5, 'it is the three merged terraces (381,15 20x5)');
ok(hall && hall.enter && hall.floors === 2, 'it is a walk-in with two floors');
ok(!bld(salt).some(o => o !== hall && o.y === 15 && o.x >= 381 && o.x < 401), 'the three old terrace houses are gone');

const walls = (salt.objects || []).filter(o => o.k === 'iwall');
ok(walls.length >= 2, 'interior walls divide the hall into rooms (' + walls.length + ')');
ok(walls.every(o => o.door), 'each interior wall has a doorway');

const calder = (salt.npcs || []).find(n => n.id === 'calder');
const bank = (salt.npcs || []).find(n => n.id === 'hall_bank');
ok(!!calder && calder.look === 'calder' && !calder.shop && !calder.quest && !calder.chest, 'Mayor Calder talks only - no shop, quest or bank');
ok(calder && /Omni/.test((calder.lines || []).join(' ')) && /reintegrat/i.test((calder.lines || []).join(' ')), 'he explains Omni and that assets can come home');
ok(calder && /two-hour|arcade wallet|Dogecoin/.test((calder.lines || []).join(' ')), 'he also explains how the game works');
ok(!!bank && bank.chest && bank.look === 'chest', 'the west counter is a bank chest');
ok(hall && calder && calder.x >= hall.x && calder.x < hall.x + hall.w && calder.y >= hall.y && calder.y < hall.y + hall.h, 'Calder stands inside the hall');
ok(hall && bank && bank.x >= hall.x && bank.x < hall.x + hall.w, 'the bank chest stands inside the hall');
ok(fs.existsSync(path.join(DD, 'parts', 'char.calder.json')), 'Calder has his own look');

const chapel = bld(salt).find(o => o.sign === 'Saltmere Chapel');
ok(chapel && chapel.x === 381 && chapel.y === 30, 'the Saltmere Chapel was not eaten by the hall');

const OCCUPIED = z => {
  const B = bld(z);
  const hit = new Set();
  for (const n of z.npcs || []) {
    if (n.look === 'chest' || n.look === 'portal' || n.look === 'wagon') continue;
    for (const o of B) {
      const near = n.x >= o.x - 1 && n.x <= o.x + o.w && n.y >= o.y - 1 && n.y <= o.y + o.h;
      if (near && (o.sign || o.owner || o.enter)) hit.add(o);
    }
  }
  for (const o of B) if (o.owner || (o.sign && ['General Store', 'Armoury', 'Church', 'Town Hall', 'The Saltmere Tap', 'Fish Store', 'Shipwright', 'Saltmere General Store', 'Saltmere Armoury', 'Saltmere Enchantery', 'Saltmere Chapel'].includes(o.sign))) hit.add(o);
  return [...hit];
};
function sconceOn(z, o) {
  return (z.objects || []).some(s => s.k === 'sconce' && s.night && s.x >= o.x && s.x < o.x + o.w && s.y >= o.y && s.y < o.y + o.h);
}
for (const o of OCCUPIED(village)) ok(sconceOn(village, o), 'Ashvale ' + (o.sign || o.owner || o.k) + ' has a night wall torch');
for (const o of OCCUPIED(salt)) ok(sconceOn(salt, o), 'Saltmere ' + (o.sign || o.k) + ' has a night wall torch');

const DATA = {
  items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'),
  quests: mod('quests'), rules: mod('rules'), globecfg: mod('globecfg'),
  zones: [Object.assign({ id: 'village' }, village), Object.assign({ id: 'whisperwood' }, mod('zone.whisperwood')), Object.assign({ id: 'saltmere' }, salt)]
};
const c = AshCore.create(DATA, { seed: 'hall' });
const p = c.addPlayer('p1', { x: 390, y: 20 });
function talk(id) {
  const n = c.M.npcs.find(q => q.id === id);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
    p.x = n.x + dx; p.y = n.y + dy; p.path = []; p.act = null;
    c.cmd('p1', { c: 'npc', id });
    for (let i = 0; i < 4; i++) for (const e of c.tick()) if ((e.e === 'dialog' || e.e === 'chest') && e.p === 'p1') return e;
  }
  return null;
}
ok(c.M.insideAt(390, 18), 'the hall floor is inside a walk-in building');
const chest = talk('hall_bank');
ok(chest && chest.e === 'chest', 'the bank counter opens the chest');
const dlg = talk('calder');
ok(dlg && dlg.e === 'dialog' && dlg.lines && dlg.lines.length >= 5 && /Omni/.test(dlg.lines.join(' ')), 'Calder speaks his Omni and game plans');
ok(!p.shop, 'talking to Calder does not open a shop');

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
