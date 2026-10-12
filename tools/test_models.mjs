/* test_models.mjs - node check of src/models.js without WebGL: build every model, run every animation, check events */
import * as THREE from '../vendor/three.module.min.js';
import { createModels } from '../src/models.js';
import fs from 'fs';
const PD = new URL('../data/parts/', import.meta.url).pathname, parts = {};
for (const f of fs.readdirSync(PD)) if (f.endsWith('.json')) { const j = JSON.parse(fs.readFileSync(PD + f)); parts[j.id] = j; }
const rejected = []; const M = createModels(THREE, { parts, onReject: (id, why) => rejected.push(id + ': ' + why) }); let n = 0;
if (rejected.length) throw new Error('rejected parts ' + rejected.join('; '));
if (M.validate({ ashvale3d: 'part', id: 'x', shapes: [{ t: 'script' }] }) === null) throw new Error('validator let an unknown shape through'); const t0 = Date.now();
const anims = ['idle', 'walk', 'run', 'slash', 'stab', 'crush', 'block', 'hit', 'death', 'bow', 'cast', 'chop', 'mine', 'fish', 'cook', 'pickup', 'eat'];
const ev = {};
for (let t = 1; t <= 5; t++) {
  const H = M.humanoid().setGear({ head: 'helmet_t' + t, body: 'body_t' + t, legs: 'legs_t' + t, weapon: 'sword_t' + t, shield: 'shield_t' + t, ammo: 'arrows_t' + t, pack: 'pack_t' + t });
  H.onEvent((a, b) => { ev[b + ':' + a] = (ev[b + ':' + a] || 0) + 1; });
  for (const a of anims) { H.play(a); for (let k = 0; k < 90; k++) H.update(1 / 60); n++; }
  H.setGear({ weapon: 'bow_t' + t }); H.setGear({ weapon: 'staff_t' + t }); H.setTool('hatchet'); H.setTool('fishing_rod'); H.setTool('lobster_pot'); H.setTool(null);
  for (const g of [{ weapon: 'dagger_t' + t }, { weapon: 'longsword_t' + t }, { weapon: 'mace_t' + t }, { body: 'chain_t' + t }]) {
    H.setGear(g); H.play(g.weapon ? 'slash' : 'idle'); for (let k = 0; k < 60; k++) H.update(1 / 60); n++;
  }
  if (!(H.height > 1.5 && H.height < 2.2)) throw new Error('height ' + H.height);
}
for (const k of M.names.monsters) { const H = M.monster(k); H.play('slash'); for (let i = 0; i < 60; i++) H.update(1 / 60); H.play('death'); for (let i = 0; i < 90; i++) H.update(1 / 60); H.setOpacity(0.4); H.dispose(); n++; }
for (const k of M.names.npcs) { const H = M.npc(k); H.play('walk'); H.update(0.5); n++; }
const items = ['helmet', 'body', 'legs', 'sword', 'dagger', 'longsword', 'mace', 'chain', 'shield', 'bow', 'staff', 'arrows', 'pack'].flatMap(k => [1, 2, 3, 4, 5].map(t => k + '_t' + t)).concat(['coins', 'bread', 'potion', 'shrimp_raw', 'shrimp', 'shrimp_burnt', 'trout_raw', 'trout', 'trout_burnt', 'salmon_raw', 'salmon', 'salmon_burnt', 'lobster_raw', 'lobster', 'lobster_burnt', 'hatchet', 'pickaxe', 'net', 'fishing_rod', 'lobster_pot', 'logs', 'oak_logs', 'willow_logs', 'maple_logs', 'yew_logs', 'copper_ore', 'tin_ore', 'iron_ore', 'coal', 'mithril_ore', 'gold_ore', 'pelt']);
for (const id of items) { const o = M.item(id); let meshes = 0; o.traverse(x => { if (x.isMesh) meshes++; }); if (!meshes) throw new Error('empty item ' + id); n++; }
M.projectile('arrow', 3); M.projectile('spell', 4);
const g = M.monster('goblin'), b = M.monster('bandit'); console.log('goblin h', g.height.toFixed(2), 'bandit h', b.height.toFixed(2), 'wolf h', M.monster('wolf').height.toFixed(2));
console.log('ok', n, 'checks in', Date.now() - t0, 'ms; events', JSON.stringify(ev));
for (const id of ['hat_cap', 'hat_feather', 'hat_wizard', 'hat_hood', 'hat_bandana', 'hat_crown', 'cape_red', 'cape_blue', 'cape_green', 'cape_purple', 'cape_gold', 'cape_black']) {
  const o = M.item(id); let k = 0; o.traverse(x => { if (x.isMesh) k++; }); if (!k) throw new Error('empty ' + id);
  M.humanoid().setGear({ head: id.startsWith('hat') ? id : null, cape: id.startsWith('cape') ? id : null }).update(0.1);
}
console.log('hats+capes ok');
const count = (g) => { const H = M.humanoid().setGear(g); let k = 0; H.object.traverse(x => { if (x.isMesh) k++; }); H.dispose(); return k; };
const bare = count({});
for (let t = 1; t <= 5; t++) {
  if (count({ pack: 'pack_t' + t }) <= bare) throw new Error('pack_t' + t + ' draws nothing in the pack slot');
  for (const over of [{ body: 'body_t3' }, { body: 'chain_t3', cape: 'cape_blue' }, { ammo: 'arrows_t5', weapon: 'bow_t3' }, { cape: 'cape_gold', head: 'hat_crown' }]) {
    const k = count(Object.assign({ pack: 'pack_t' + t }, over));
    if (k <= bare) throw new Error('pack_t' + t + ' vanishes under ' + JSON.stringify(over));
    n++;
  }
  const o = M.item('pack_t' + t); let g2 = 0; o.traverse(x => { if (x.isMesh) g2++; });
  if (g2 < 3) throw new Error('pack_t' + t + ' ground model is only ' + g2 + ' meshes');
}
console.log('packs ok');

/* task 5: the rest of Elder Maren's cast, and the foraging finds */
const meshes = (o) => { let k = 0; o.traverse(x => { if (x.isMesh) k++; }); return k; };
const cols = (o) => { const s = new Set(); o.traverse(x => { if (x.isMesh) s.add(x.material.color.getHexString() + (x.material.emissive.getHex() ? '+' : '')); }); return [...s].sort().join(' '); };
for (const k of ['goblin_shaman', 'goblin_chief', 'wraith', 'ash_knight', 'lich']) {
  const H = M.monster(k);
  if (meshes(H.object) < 30) throw new Error(k + ' draws only ' + meshes(H.object) + ' meshes');
  if (cols(H.object).includes('ff00ff')) throw new Error(k + ' has an unresolved colour token');
  for (const a of ['idle', 'cast', 'slash', 'death']) { H.play(a); for (let i = 0; i < 45; i++) H.update(1 / 60); }
  H.dispose(); n++;
}
const ht = k => M.monster(k).height;
if (!(ht('goblin_shaman') < ht('wraith') && ht('wraith') < ht('goblin_chief') && ht('wraith') < ht('ash_knight') && ht('wraith') < ht('lich'))) throw new Error('the cast is not a size ladder');
if (cols(M.monster('goblin_chief').object) === cols(M.monster('bandit').object)) throw new Error('the goblin chief is a recoloured bandit');
if (cols(M.monster('ash_knight').object) === cols(M.monster('bandit_leader').object)) throw new Error('the ash knight is a recoloured bandit leader');
if (!cols(M.monster('goblin_chief').object).includes('+') || !cols(M.monster('lich').object).includes('+')) throw new Error('the ashen crown does not glow on chief or lich');
const SLOT = { staff_verdant: 'weapon', ghostlight: 'head', hat_bonewrap: 'head', hat_ashshard: 'head', hat_ashcrown: 'head' };
for (const id of Object.keys(SLOT)) {
  const o = M.item(id); if (meshes(o) < 3) throw new Error('empty ' + id);
  if (cols(o).includes('ff00ff')) throw new Error(id + ' has an unresolved colour token');
  const g = M.humanoid().setGear({ [SLOT[id]]: id });
  if (meshes(g.object) <= meshes(M.humanoid().object)) throw new Error(id + ' draws nothing on a body');
  g.dispose(); n++;
}
const shroom = ['mushroom', 'chanterelle', 'porcini', 'fly_agaric', 'glowcap'].map(id => {
  const o = M.item(id); if (meshes(o) < 3) throw new Error(id + ' draws only ' + meshes(o) + ' meshes');
  if (cols(o).includes('ff00ff')) throw new Error(id + ' has an unresolved colour token'); n++; return [id, cols(o)];
});
if (new Set(shroom.map(s => s[1])).size < shroom.length) throw new Error('mushrooms are not distinct: ' + JSON.stringify(shroom));
if (!shroom[4][1].includes('+')) throw new Error('the glowcap does not glow');
if (shroom.slice(0, 4).some(s => s[1].includes('+'))) throw new Error('a mushroom that should not glow does');
console.log('cast + mushrooms ok');

/* task 5b: the char fields models.js grew for the cast must reach the model, not just sit in the JSON */
const named = (o) => { const s = new Set(); o.traverse(x => { if (x.isMesh && x.name) s.add(x.name); }); return s; };
if (!named(M.humanoid().object).has('thigh')) throw new Error('body segments are no longer named, so a hidden leg would go unnoticed');
const WR = M.monster('wraith');
let tr = 0, tot = 0;
WR.object.traverse(x => { if (x.isMesh) { tot++; if (x.material.opacity < 0.9) tr++; } });
if (tr * 10 < tot * 9) throw new Error('the wraith is translucent on only ' + tr + ' of ' + tot + ' meshes');
for (const k of ['thigh', 'shin', 'foot', 'toe']) if (named(WR.object).has(k)) throw new Error('the wraith still has a ' + k);
if (!cols(WR.object).includes('c3d2e2')) throw new Error('hiding the legs took the robe with them');
if (!cols(WR.object).includes('+')) throw new Error('the wraith aura no longer glows');
WR.play('idle'); WR.update(1 / 30);
if (!(WR.object.children[0].position.y > 0.2)) throw new Error('the wraith does not float, its body root is at ' + WR.object.children[0].position.y);
WR.dispose(); n++;
if (meshes(M.humanoid({ build: 'big', vars: { goblin: 1 } }).object) !== meshes(M.humanoid({ build: 'big' }).object) + 2) throw new Error('vars goblin does not give a big goblin a pair of goblin ears');
if (!cols(M.monster('lich').object).includes('120c10')) throw new Error('the lich has no skull face');
const KN = cols(M.monster('ash_knight').object);
if (!KN.includes('6a6b71')) throw new Error('gearTint did not recolour the ash knight plate: ' + KN);
if (KN.includes('41548e')) throw new Error('gearTint left the tier colour on the ash knight plate');
console.log('cast fields ok');
/* status effects: setTint washes every mesh, survives a gear rebuild, clears exactly; setFrozen holds the pose; a tint over a
   death fade keeps the fade; a translucent char (wraith) stays translucent through a rebuild */
{
  const base = cols(M.humanoid().setGear({ weapon: 'sword_t2' }).object);
  const F = M.humanoid().setGear({ weapon: 'sword_t2' }); F.setTint('#9fd8ff', 0.55);
  const blue = o => { let k = 0, t = 0; o.traverse(x => { if (x.isMesh) { t++; const c = x.material.color; if (c.b >= c.r - 0.02) k++; } }); return [k, t]; };
  let [k, t] = blue(F.object); if (k * 10 < t * 9) throw new Error('frost tint reached only ' + k + ' of ' + t + ' meshes');
  F.setGear({ weapon: 'staff_frost', body: 'body_t3' }); F.update(1 / 30); [k, t] = blue(F.object);
  if (k * 10 < t * 9) throw new Error('the tint did not survive setGear: ' + k + ' of ' + t);
  F.setGear({ weapon: 'sword_t2' }); F.setTint(null); F.update(1 / 30);
  if (cols(F.object) !== base) throw new Error('setTint(null) did not restore the colours');
  F.play('walk'); F.update(0.1); const y0 = F.object.getObjectByName ? JSON.stringify(F._parts.torso.rotation.toArray()) : '';
  F.setFrozen(true); F.update(0.3); if (JSON.stringify(F._parts.torso.rotation.toArray()) !== y0) throw new Error('setFrozen did not hold the pose');
  F.setFrozen(false); F.setOpacity(0.4); F.setTint('#7fd36a', 0.35); F.setTint(null); F.update(1 / 30);
  F.object.traverse(x => { if (x.isMesh && x.material.opacity > 0.41) throw new Error('clearing a tint undid the death fade'); });
  F.dispose();
  const W = M.monster('wraith'); W.setGear({ weapon: 'staff_t2' }); W.update(1 / 30); let op = 0, tot = 0;
  W.object.traverse(x => { if (x.isMesh) { tot++; if (x.material.opacity < 0.9) op++; } });
  if (op * 10 < tot * 9) throw new Error('a wraith rebuild lost its translucency: ' + op + ' of ' + tot);
  W.dispose(); n += 6;
}
console.log('status tint ok');
