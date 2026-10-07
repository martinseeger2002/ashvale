/* the road from Ashvale to Saltmere is lit: posts along the west street, and along the worldgen trail between the towns. */
'use strict';
const fs = require('fs'), path = require('path');
const AshGlobe = require('../src/globe.js');
const AW = require('../src/worldgen.js');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const DD = path.join(__dirname, '..', 'data');
const mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8'));
const salt = mod('zone.saltmere').data, village = mod('zone.village').data;
const west = (salt.objects || []).filter(o => o.k === 'torch' && o.y >= 20 && o.y <= 25 && o.x >= 377 && o.x < 430);
ok(west.length >= 10, 'Saltmere\'s west road has lit posts (' + west.length + ')');
ok(west.every(o => o.y === 21 || o.y === 22 || o.y === 23 || o.y === 24), 'those posts stand on the road or its verges');
const gate = (village.objects || []).filter(o => o.k === 'torch' && o.x >= 44 && o.y >= 48 && o.y <= 53);
ok(gate.length >= 2, 'Ashvale\'s east gate has lit posts onto the Saltmere road');
const mineRoad = (village.objects || []).filter(o => o.k === 'torch' && o.x >= 36 && o.x <= 47 && (o.y === 49 || o.y === 52));
ok(mineRoad.length >= 8, 'Ashvale\'s east road from the mine has street lamps (' + mineRoad.length + ')');

const cfg = mod('globecfg').data;
const zones = ['village', 'whisperwood', 'saltmere'].map(id => Object.assign({ id }, mod('zone.' + id).data));
const G = AshGlobe.createGlobe(cfg), W = AW.createWorldgen(G, { seed: cfg.seed });
W.setSetPieces(W.piecesFromZones(zones, cfg.face, cfg.origin[0], cfg.origin[1], { belt: cfg.belt || {}, links: cfg.links || [] }));
ok(typeof W.roadObjects === 'function', 'worldgen exposes the roadside posts');
const ox = cfg.origin[0], oy = cfg.origin[1];
const torches = W.roadObjects(cfg.face, 0 + ox - 40, -40 + oy, 540 + ox, 90 + oy);
ok(torches.length >= 8, 'the trail between Ashvale and Saltmere has lit posts (' + torches.length + ')');
ok(torches.every(o => o.k === 'torch' && o.w === 1), 'every roadside post is a torch');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
