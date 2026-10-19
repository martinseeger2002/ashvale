/* make_island.js -> data/atlas/wg_tables.json `edits` (tag 'tutorial_island'): the island where every new character of Ashvale begins
   (2026-10-19, the operator: "when i start as a player i am not brought through a mandatory tutorial space referencing osrs tutorial
   island watered down"). A low round island out in the inland sea east of Saltmere, raised with a flatten stroke (a level top a couple
   of metres above the water, its edge sloping into the sea for a beach) and two small raises for a knoll. The zone on it, the guides and
   the tutorial quest: tools/tutorial/make_tutorial.js. Game tiles (x east, y down).
     node tools/tutorial/make_island.js      (then node tools/tutorial/make_tutorial.js) */
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
const TP = path.join(ROOT, 'data', 'atlas', 'wg_tables.json'), TAG = 'tutorial_island';
const ISLAND = { x: 700, y: 40, r: 44, top: 2.2 };
const TJ = JSON.parse(fs.readFileSync(TP, 'utf8')); TJ.data.edits = (TJ.data.edits || []).filter(e => e.tag !== TAG); fs.writeFileSync(TP, JSON.stringify(TJ));
const { W, CFG } = require('../castle/mask.js'), [OX, OY] = CFG.origin, F = CFG.face;
const unit = (x, y) => Array.from(W.toSphere(F, x + 0.5 + OX, -(y + 0.5 + OY))).map(v => +v.toFixed(9));
const sea = W.sample(F, ISLAND.x + 0.5 + OX, -(ISLAND.y + 0.5 + OY)).h;
TJ.data.edits.push({ op: 'flatten', u: unit(ISLAND.x, ISLAND.y), r: ISLAND.r, to: ISLAND.top, tag: TAG });
TJ.data.edits.push({ op: 'raise', u: unit(ISLAND.x - 14, ISLAND.y - 12), r: 16, dh: 2.5, tag: TAG }, { op: 'raise', u: unit(ISLAND.x - 6, ISLAND.y - 18), r: 10, dh: 1.5, tag: TAG });
fs.writeFileSync(TP, JSON.stringify(TJ));
fs.writeFileSync(path.join(__dirname, 'island.json'), JSON.stringify(ISLAND));
console.log('island: r %d m at (%d, %d), top %s m (the sea there was %s m)', ISLAND.r, ISLAND.x, ISLAND.y, ISLAND.top, sea.toFixed(1));
