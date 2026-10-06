/* q2code.mjs - Quaternius Medieval Village pieces -> one tiny ASHVALE-style data module (2026-10-05: "Can we
   convert quaternius to three.js code, keeping it as lightweight as possible?").
   Per piece: every primitive's triangles in model space (node transforms applied), one flat colour per material
   (q_palette.json: the average of its texture; no textures, no UVs, no normals - the game's flat shading makes those),
   corners welded, heavy pieces simplified per colour (meshoptimizer, colour edges kept), positions packed to 1 cm int16.
     node q2code.mjs [maxTris=400] [piece ...]      -> q_pieces.json + a size report
     node q2code.mjs --game                          -> ../../data/housekit.json (the game's data module: the pieces the
                                                        houses use, src/scene.js building())
   The source kit (CC0, quaternius.itch.io/medieval-village-megakit) lives outside the game in ~/ashvale3d/kits/quaternius.
   Decoder: qpieces.js (build(THREE, data, name) -> a Group with one mesh per colour). */
import fs from 'fs';
import { MeshoptSimplifier as MS } from 'meshoptimizer';
const D = 'quaternius/glTF/';
const GAME = process.argv.includes('--game');
const GAME_PIECES = ['Wall_Plaster_Straight', 'Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Window_Thin_Round', 'Wall_Plaster_Door_Round', 'Wall_Plaster_WoodGrid',
  'Window_Wide_Round1', 'WindowShutters_Wide_Round_Open', 'Corner_Exterior_Wood', 'Corner_Exterior_Brick',
  'Roof_RoundTiles_4x4', 'Roof_RoundTiles_4x6', 'Roof_RoundTiles_4x8', 'Roof_RoundTiles_6x8', 'Roof_RoundTiles_6x10', 'Roof_RoundTiles_6x12', 'Roof_RoundTiles_8x8', 'Roof_RoundTiles_8x10', 'Roof_RoundTiles_8x12',
  'Roof_Front_Brick4', 'Roof_Front_Brick6', 'Roof_Front_Brick8', 'Balcony_Simple_Straight', 'Prop_Chimney', 'Roof_Tower_RoundTiles'];   /* the tower roof: the castle's towers and turrets */
const args = process.argv.slice(2).filter(a => a !== '--game'), MAXT = +(args.find(a => /^\d+$/.test(a)) || 400), only = args.filter(a => !/^\d+$/.test(a));
const PAL = JSON.parse(fs.readFileSync('q_palette.json'));
PAL.MI_WindowGlass = '#2b3a55';   /* ASHVALE's windows are dark blue, not the texture's grey */
const palette = [], pidx = {};
const colorOf = name => { const c = PAL[name] || '#888888'; if (!(c in pidx)) { pidx[c] = palette.length; palette.push(c); } return pidx[c]; };
function mat4(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
          2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function accessor(j, bins, i) {
  const a = j.accessors[i], v = j.bufferViews[a.bufferView], buf = bins[v.buffer], comp = { VEC3: 3, SCALAR: 1, VEC2: 2, VEC4: 4 }[a.type];
  const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType], es = T.BYTES_PER_ELEMENT;
  const stride = v.byteStride || comp * es, off = (v.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * comp);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rd = { 5126: (o) => dv.getFloat32(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5121: (o) => dv.getUint8(o) }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < comp; c++) out[k * comp + c] = rd(off + k * stride + c * es);
  return out;
}
function piece(name) {
  const j = JSON.parse(fs.readFileSync(D + name + '.gltf')), bins = j.buffers.map(b => fs.readFileSync(D + b.uri));
  const groups = {};   /* colour -> {pos: [], idx: []} */
  const walk = (ni, M) => {
    const n = j.nodes[ni], W = mul(M, mat4(n));
    if (n.mesh != null) for (const p of j.meshes[n.mesh].primitives) {
      const P = accessor(j, bins, p.attributes.POSITION), I = p.indices != null ? accessor(j, bins, p.indices) : P.map((_, k) => k).slice(0, P.length / 3);
      const c = colorOf(p.material != null ? j.materials[p.material].name : ''), g = groups[c] || (groups[c] = { pos: [], idx: [] }), base = g.pos.length / 3;
      for (let k = 0; k < P.length; k += 3) { const x = P[k], y = P[k + 1], z = P[k + 2]; g.pos.push(W[0] * x + W[4] * y + W[8] * z + W[12], W[1] * x + W[5] * y + W[9] * z + W[13], W[2] * x + W[6] * y + W[10] * z + W[14]); }
      for (const k of I) g.idx.push(base + k);
    }
    for (const ch of n.children || []) walk(ch, W);
  };
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let tris0 = 0; for (const c in groups) tris0 += groups[c].idx.length / 3;
  const budget = GAME && /^Roof_(RoundTiles|Tower)/.test(name) ? 1400 : MAXT;   /* tiled roofs: enough triangles that the rows of tiles survive (a low budget reads as corrugated iron) */
  const keep = Math.min(1, budget / tris0), outP = [], outI = [], G = [], weld = new Map();
  for (const c in groups) {
    const g = groups[c];
    /* weld this colour's corners at 1 cm (the glTF splits them for normals/UVs we don't need) */
    const lp = [], li = [], m = new Map();
    for (const k of g.idx) { const x = Math.round(g.pos[k * 3] * 100), y = Math.round(g.pos[k * 3 + 1] * 100), z = Math.round(g.pos[k * 3 + 2] * 100), key = x + ',' + y + ',' + z;
      let v = m.get(key); if (v == null) { v = lp.length / 3; m.set(key, v); lp.push(x / 100, y / 100, z / 100); } li.push(v); }
    let idx = Uint32Array.from(li);
    if (keep < 1 && idx.length > 30) {
      const target = Math.max(12, Math.floor(idx.length * keep / 3) * 3);
      const [s] = MS.simplify(idx, Float32Array.from(lp), 3, target, 0.05, ['LockBorder']);
      if (s.length >= 12) idx = s;
    }
    const start = outI.length;
    for (const k of idx) { const x = Math.round(lp[k * 3] * 100), y = Math.round(lp[k * 3 + 1] * 100), z = Math.round(lp[k * 3 + 2] * 100), key = x + ',' + y + ',' + z;
      let v = weld.get(key); if (v == null) { v = outP.length / 3; weld.set(key, v); outP.push(x, y, z); } outI.push(v); }
    /* drop triangles the welding collapsed */
    G.push([+c, start, outI.length - start]);
  }
  const P16 = Int16Array.from(outP), I16 = outP.length / 3 < 65536 ? Uint16Array.from(outI) : Uint32Array.from(outI);
  return { tris0, tris: outI.length / 3, verts: outP.length / 3, rec: { p: Buffer.from(P16.buffer).toString('base64'), i: Buffer.from(I16.buffer).toString('base64'), w: I16.BYTES_PER_ELEMENT, g: G } };
}
await MS.ready;
const names = GAME ? GAME_PIECES : only.length ? only : fs.readdirSync(D).filter(f => f.endsWith('.gltf')).map(f => f.slice(0, -5)).sort();
const out = { palette, pieces: {} }; let t0 = 0, t1 = 0, orig = 0;
for (const n of names) {
  const r = piece(n); out.pieces[n] = r.rec; t0 += r.tris0; t1 += r.tris;
  const j = JSON.parse(fs.readFileSync(D + n + '.gltf')); orig += fs.statSync(D + n + '.gltf').size + j.buffers.reduce((a, b) => a + fs.statSync(D + b.uri).size, 0);
  if (names.length <= 12) console.log(n.padEnd(34), 'tris', String(r.tris0).padStart(5), '->', String(r.tris).padStart(4), ' verts', r.verts);
}
const txt = JSON.stringify(out);
if (GAME) fs.writeFileSync('../../data/housekit.json', JSON.stringify({ ashvale3d: 'module', name: 'housekit', api: 1, v: 1, data: Object.assign({ source: 'Quaternius Medieval Village MegaKit (CC0), converted by tools/housekit/q2code.mjs', tile: PAL.MI_RoundTiles, plaster: PAL.MI_Plaster, glass: PAL.MI_WindowGlass }, out) }));
else fs.writeFileSync('q_pieces.json', txt);
const texBytes = fs.readdirSync(D).filter(f => /\.(png|jpg)$/i.test(f)).reduce((a, f) => a + fs.statSync(D + f).size, 0);
const gz = (await import('zlib')).gzipSync(txt).length;
console.log(`${names.length} pieces: ${t0} -> ${t1} triangles; glTF ${(orig / 1e6).toFixed(1)} MB + textures ${(texBytes / 1e6).toFixed(1)} MB  ->  ${(txt.length / 1e3).toFixed(0)} KB (${(gz / 1e3).toFixed(0)} KB gzipped)`);
