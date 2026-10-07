/* the road from Ashvale to Saltmere is lit: gas street lamps on the verges of the west street, Ashvale's east road and the worldgen
   trail between the towns - never on the road itself (2026-10-07: "on the side of the trail, not down the center") */
'use strict';
const fs = require('fs'), path = require('path');
const AshGlobe = require('../src/globe.js');
const AW = require('../src/worldgen.js');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8'));
const salt = mod('zone.saltmere').data, village = mod('zone.village').data;
const west = (salt.objects || []).filter(o => o.k === 'lamp' && o.y >= 20 && o.y <= 25 && o.x >= 377 && o.x < 430);
ok(west.length >= 6, 'Saltmere\'s west road has lit posts (' + west.length + ')');
const tileAt = (z, x, y) => (z.tiles[y - z.origin[1]] || '')[x - z.origin[0]];
ok(west.every(o => 'pc'.indexOf(tileAt(salt, o.x, o.y)) < 0), 'those lamps stand on the verges, not on the road');
ok(!(salt.objects || []).some(o => (o.k === 'torch' || o.k === 'lamp') && 'pc'.indexOf(tileAt(salt, o.x, o.y)) >= 0), 'no torch or lamp in Saltmere stands on a street');
const mineRoad = (village.objects || []).filter(o => o.k === 'lamp' && o.x >= 36 && o.x <= 47 && (o.y === 49 || o.y === 52));
ok(mineRoad.length >= 4, 'Ashvale\'s east road from the mine has street lamps (' + mineRoad.length + ')');

const cfg = mod('globecfg').data;
const zones = ['village', 'whisperwood', 'saltmere'].map(id => Object.assign({ id }, mod('zone.' + id).data));
const G = AshGlobe.createGlobe(cfg), W = AW.createWorldgen(G, { seed: cfg.seed });
W.setSetPieces(W.piecesFromZones(zones, cfg.face, cfg.origin[0], cfg.origin[1], { belt: cfg.belt || {}, links: cfg.links || [] }));
ok(typeof W.roadObjects === 'function', 'worldgen exposes the roadside posts');
const ox = cfg.origin[0], oy = cfg.origin[1];
const torches = W.roadObjects(cfg.face, 0 + ox - 40, -40 + oy, 540 + ox, 90 + oy);
ok(torches.length >= 8, 'the trail between Ashvale and Saltmere has lit posts (' + torches.length + ')');
ok(torches.every(o => o.k === 'lamp' && o.w === 1), 'every roadside post is a gas street lamp');
ok(torches.every(o => W.tileAt ? 'pc'.indexOf(W.tileAt(o.face, o.x, o.y)) < 0 : true), 'none stands on the road');
/* the road itself is cobbled (2026-10-07: "a cobblestone road from Ashvale to Saltmere") */
const lamp = torches[Math.floor(torches.length / 2)]; let cob = 0;
for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (W.tileAt(lamp.face, lamp.x + dx, lamp.y + dy) === 'c') cob++;
ok(cob >= 6, 'the road between the towns is cobbles (' + cob + ' cobble tiles beside a lamp)');
ok(['c'].includes(salt.tiles[22 - salt.origin[1]][0]), 'Saltmere\'s west street is cobbled to the edge of town');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
