/* Saltmere, run down (2026-10-19, tools/saltmere/make_rugged.py): cobbled streets, scenery along them, grimy houses, and the pirates on the
   south pier with their ship - and through it all every street open, every door and every person still reached on foot.
   node tests/saltmere_rugged_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const AshWorld = require('../src/world.js'), AG = require('../src/globe.js'), WGM = require('../src/worldgen.js');
const DD = path.join(__dirname, '..', 'data');
const mod = (n) => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const zones = fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
const D = { items: mod('items').items, monsters: mod('monsters').monsters, shops: mod('shops'), quests: mod('quests'), rules: mod('rules'), zones, globecfg: mod('globecfg'), decor: mod('decor') };
const Z = zones.find(z => z.id === 'saltmere'), K = D.decor.kinds;
const M = AshWorld.createWorld(Object.assign({}, D, { wg: AshWorld.seededWorldgen(WGM, AG, D) }));
const [OX, OY] = Z.origin, tiles = Z.tiles.join('');
ok(!tiles.includes('p') && (tiles.match(/c/g) || []).length > 700, 'every street is cobbled (' + (tiles.match(/c/g) || []).length + ' tiles, no dirt left)');
const rug = Z.objects.filter(o => o.tag === 'rugged'), pir = Z.objects.filter(o => o.tag === 'pirates');
ok(rug.length >= 60 && rug.every(o => K[o.k]), rug.length + ' pieces of scenery along the streets, every one a decor kind');
ok(['trash_heap', 'burn_barrel', 'laundry_line', 'shanty', 'rope_coil', 'lobster_pots'].every(k => rug.some(o => o.k === k)) && ['broken_cart', 'rail_fence', 'supply_cache'].some(k => rug.some(o => o.k === k)), 'new pieces and old ones both');
ok(Z.objects.filter(o => o.k === 'house' && o.sign !== 'Town Hall').every(o => /^#[89ab]/.test(o.wall) && /^#[234]/.test(o.roof)), 'the houses are salt-stained and patched');
/* the pirates' end of the south pier */
const crew = Z.npcs.filter(n => n.tag === 'pirates'), head = (x, y) => x >= 511 && x <= 515 && y >= 72 && y <= 77;
ok(crew.length === 5 && crew.every(n => head(n.x, n.y) && n.lines && n.lines.length >= 2 && fs.existsSync(path.join(DD, 'parts', 'char.' + n.look + '.json'))), 'five pirates on the south pier head, each with a look and lines');
ok(['pirate_ship', 'pirate_flag', 'cannon', 'rum_barrels', 'sea_chest'].every(k => pir.some(o => o.k === k && head(o.x, o.y))), 'their ship tied alongside, the flag, cannon, rum and a sea chest');
const hat = JSON.parse(fs.readFileSync(path.join(DD, 'parts', 'cloth.hat_tricorn.json'), 'utf8'));
ok(hat.slot === 'hat' && hat.style === 'tricorn' && hat.homes && hat.homes.length, 'the captain\'s tricorn exists and is not offered in the character creator');
/* walking: from the high street, every street tile, every door and every person (beside them) is reached */
const edgeOpen = (x, y, dx, dy) => { const b = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : 1, ob = dx === 1 ? 8 : dx === -1 ? 2 : dy === 1 ? 1 : 4; return !(M.wallAt(x, y) & b) && !(M.wallAt(x + dx, y + dy) & ob); };
const inZ = (x, y) => x >= OX && y >= OY && x < OX + Z.size[0] && y < OY + Z.size[1];
const seen = new Set(['430,22']), q = [[430, 22]];
while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k) || !inZ(nx, ny) || M.blocked(nx, ny) || !edgeOpen(x, y, dx, dy)) continue; seen.add(k); q.push([nx, ny]); } }
const street = []; for (let y = 0; y < Z.size[1]; y++) for (let x = 0; x < Z.size[0]; x++) if (Z.tiles[y][x] === 'c') street.push([x + OX, y + OY]);
const shut = street.filter(([x, y]) => M.blocked(x, y));
ok(!shut.length, 'no street tile is blocked (' + street.length + ')' + (shut.length ? ' - blocked: ' + shut.slice(0, 5).join(' ') : ''));
const lost = street.filter(([x, y]) => !seen.has(x + ',' + y));
ok(lost.length < 5, 'the streets are all one network (' + lost.length + ' cut off)');
const doors = Z.objects.filter(o => o.door).map(o => o.door), noDoor = doors.filter(([x, y]) => !seen.has(x + ',' + y));
ok(!noDoor.length, 'every door is reached (' + doors.length + ')' + (noDoor.length ? ' - not: ' + noDoor.join(' ') : ''));
const near = n => [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]].some(([dx, dy]) => seen.has((n.x + dx) + ',' + (n.y + dy)));
const alone = Z.npcs.filter(n => !n.lv && !near(n));
ok(!alone.length, 'every person in town, the pirates too, can be walked up to (' + Z.npcs.length + ')' + (alone.length ? ' - not: ' + alone.map(n => n.id).join(' ') : ''));
ok(rug.filter(o => K[o.k].block === 'tile').every(o => M.blocked(o.x, o.y)), 'the solid scenery stands in the way');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
