/* mask.js - the real ground on the castle peninsula, 1 m tiles, from the same worldgen the game and the Atlas use. */
const path = require('path'), fs = require('fs'), ROOT = path.join(__dirname, '..', '..');
const m = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n + '.json'))).data;
const globe = require(path.join(ROOT, 'src', 'globe.js')), WG = require(path.join(ROOT, 'src', 'worldgen.js'));
const CFG = m('globecfg');
const G = globe.createGlobe({ n: CFG.n, radius_m: CFG.radius_m, seed: CFG.seed }), W = WG.createWorldgen(G, { seed: CFG.seed });
const zones = fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^zone\..*\.json$/.test(f) && f !== 'zone.castle.json' && !/^zone\.(mt_|thornwatch\.|redmoor\.|hollowden\.|sistersbarrow\.|fivestones\.|gloamwood\.|emberfall\.|blackmere\.|towercellars\.|abbey\.|crypts\.)/.test(f))   /* the mountain's camps and Thornwatch are sampled from the world, never from themselves (tools/mountain/make_camps.js, tools/thornwatch/make_thornwatch.js) */.map(f => Object.assign({ id: f.slice(5, -5) }, m(f.slice(0, -5))));
W.setSetPieces(W.piecesFromZones(zones, CFG.face, CFG.origin[0], CFG.origin[1], { belt: CFG.belt || {}, links: CFG.links || [] }));
function mask(x0, y0, w, h) {
  const rows = [];
  for (let y = y0; y < y0 + h; y++) { let r = ''; for (let x = x0; x < x0 + w; x++) { const o = W.sample(CFG.face, x + 0.5 + CFG.origin[0], y + 0.5 + CFG.origin[1]); r += (o.river === 3 && o.h < o.wl + 0.05) || o.h < W.WATER ? '~' : '.'; } rows.push(r); }
  return rows;
}
module.exports = { W, CFG, mask, zones };
if (require.main === module) { const [x0, y0, w, h] = process.argv.slice(2).map(Number); console.log(mask(x0, y0, w, h).join('\n')); }
