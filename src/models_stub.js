/* PLACEHOLDER models module (same interface as models.js, which is being written separately). Simple boxes, used only
   until the real models.js arrives; the engine never depends on anything beyond the contract:
   createModels(THREE, opts) -> {tiers, humanoid(look), npc(key), monster(key), item(id), projectile(kind, t), icon?} */
export function createModels(THREE, opts) {
  const mats = new Map();
  const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return mats.get(c); };
  const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; };
  const tiers = { metal: [0, 0xb8763b, 0x6e6e72, 0xc4c8cf, 0x5664a8, 0x3f7a52], wood: [0, 0xa67b4b, 0xc9b27a, 0xc98b4e, 0x8a5530, 0x4a2f2a], cloth: [0, 0xe6dcc3, 0x9b8b73, 0xf0e8f0, 0xa8c8f0, 0x3b2a6b] };
  const tierOf = (id) => { const m = /_t(\d)$/.exec(id || ''); return m ? +m[1] : 1; };
  const kindOf = (id) => (id || '').replace(/_t\d$/, '');
  function rig(look) {
    const L = Object.assign({ skin: 0xe0b48c, shirt: 0x4a6aa0, pants: 0x5a4632, hair: 0x5a3a20, scale: 1 }, look || {});
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const j = {};
    const limb = (name, parent, x, y, w, h, c) => { const g = new THREE.Group(); g.position.set(x, y, 0); g.add(box(w, h, w, c, 0, -h / 2, 0)); parent.add(g); j[name] = g; return g; };
    j.hips = new THREE.Group(); j.hips.position.y = 0.9; body.add(j.hips);
    j.torso = new THREE.Group(); j.hips.add(j.torso); j.torso.add(box(0.5, 0.6, 0.3, L.shirt, 0, 0.3, 0));
    j.head = new THREE.Group(); j.head.position.y = 0.62; j.torso.add(j.head); j.head.add(box(0.32, 0.32, 0.32, L.skin, 0, 0.17, 0)); j.head.add(box(0.34, 0.1, 0.34, L.hair, 0, 0.31, 0));
    limb('armL', j.torso, -0.33, 0.58, 0.14, 0.62, L.shirt); limb('armR', j.torso, 0.33, 0.58, 0.14, 0.62, L.shirt);
    limb('legL', j.hips, -0.13, 0, 0.18, 0.9, L.pants); limb('legR', j.hips, 0.13, 0, 0.18, 0.9, L.pants);
    j.handR = new THREE.Group(); j.handR.position.y = -0.6; j.armR.add(j.handR);
    j.handL = new THREE.Group(); j.handL.position.y = -0.6; j.armL.add(j.handL);
    root.scale.setScalar(L.scale);
    return { root, body, j };
  }
  function animated(r, kind) {
    let cur = 'idle', t = 0, dur = 1, loop = true, fired = false, speed = 1; const fns = [];
    const ONCE = { slash: 0.6, stab: 0.55, crush: 0.6, punch: 0.45, bow: 0.8, cast: 0.75, hit: 0.3, block: 0.35, death: 1.0, pickup: 0.6, eat: 0.6, bite: 0.5 };
    const IMPACT = { slash: 0.55, stab: 0.5, crush: 0.55, punch: 0.5, bow: 0.7, cast: 0.6, bite: 0.5 };
    const H = {
      object: r.root, height: 1.8 * (r.root.scale.y),
      play(name, o) { o = o || {}; cur = name; t = 0; fired = false; speed = o.speed || 1; loop = o.loop != null ? o.loop : !(name in ONCE); dur = ONCE[name] || 1; },
      onEvent(fn) { fns.push(fn); },
      update(dt) {
        t += dt * speed; const j = r.j, p = Math.min(1, t / dur);
        for (const k of ['armL', 'armR', 'legL', 'legR', 'torso', 'head']) if (j[k]) j[k].rotation.set(0, 0, 0);
        r.body.rotation.set(0, 0, 0); r.body.position.y = 0;
        const s = Math.sin(t * (cur === 'run' ? 12 : 8));
        if (cur === 'walk' || cur === 'run') { const a = cur === 'run' ? 0.9 : 0.6; j.legL.rotation.x = s * a; j.legR.rotation.x = -s * a; if (j.armL) { j.armL.rotation.x = -s * a * 0.8; j.armR.rotation.x = s * a * 0.8; } r.body.position.y = Math.abs(s) * 0.05; }
        else if (cur === 'idle') { j.torso.rotation.x = Math.sin(t * 2) * 0.02; }
        else if (cur === 'death') { r.body.rotation.x = -Math.min(1, p * 1.5) * 1.5; }
        else if (cur === 'hit' || cur === 'block') { j.torso.rotation.x = -Math.sin(p * Math.PI) * 0.3; if (cur === 'block' && j.armL) j.armL.rotation.x = -Math.sin(p * Math.PI) * 1.4; }
        else if (j.armR) { const w = Math.sin(p * Math.PI); j.armR.rotation.x = cur === 'bow' || cur === 'cast' ? -1.5 * w : (p < 0.5 ? -2.4 * p * 2 : -2.4 + 3.2 * (p - 0.5) * 2) * (1 - Math.max(0, p - 0.8) * 5); if (cur === 'bow') j.armL.rotation.x = -1.5 * w; if (cur === 'chop' || cur === 'mine') j.armR.rotation.x = -1.5 - Math.sin(t * 6) * 0.9; }
        else if (cur === 'bite') { j.head.position.z = 0.1 + Math.sin(p * Math.PI) * 0.25; }
        if (!fired && IMPACT[cur] != null && p >= IMPACT[cur]) { fired = true; for (const f of fns) f('impact', cur); }
        if (!loop && t >= dur) { const was = cur; if (cur !== 'death') { cur = 'idle'; loop = true; t = 0; } else loop = true; for (const f of fns) f('done', was); }
      },
      muzzle() { const v = new THREE.Vector3(); (r.j.handR || r.j.head).getWorldPosition(v); return v; },
      attackAnim(id) { const k = kindOf(id); return k === 'bow' ? 'bow' : k === 'staff' ? 'cast' : k === 'sword' ? 'slash' : 'punch'; },
      setGear(g) {
        for (const k in gear) { gear[k].parent && gear[k].parent.remove(gear[k]); } gear = {};
        if (!r.j.armR) return;
        const put = (slot, obj, parent) => { parent.add(obj); gear[slot] = obj; };
        if (g.head) put('head', box(0.36, 0.2, 0.36, tiers.metal[tierOf(g.head)], 0, 0.3, 0), r.j.head);
        if (g.body) put('body', box(0.54, 0.5, 0.34, tiers.metal[tierOf(g.body)], 0, 0.32, 0), r.j.torso);
        if (g.legs) { const gg = new THREE.Group(); gg.add(box(0.2, 0.5, 0.2, tiers.metal[tierOf(g.legs)], -0.13, -0.25, 0)); gg.add(box(0.2, 0.5, 0.2, tiers.metal[tierOf(g.legs)], 0.13, -0.25, 0)); put('legs', gg, r.j.hips); }
        if (g.weapon) { const k = kindOf(g.weapon), t = tierOf(g.weapon); const o = k === 'sword' ? box(0.06, 0.06, 0.8, tiers.metal[t], 0, 0, 0.4) : k === 'bow' ? box(0.05, 1.0, 0.05, tiers.wood[t], 0, 0, 0.1) : box(0.06, 1.3, 0.06, tiers.cloth[t], 0, 0.2, 0.05); put('weapon', o, k === 'bow' ? r.j.handL : r.j.handR); }
        if (g.shield) put('shield', box(0.06, 0.55, 0.4, tiers.metal[tierOf(g.shield)], -0.1, 0.25, 0), r.j.handL);
        if (g.ammo) put('ammo', box(0.12, 0.5, 0.12, 0x6a4a2a, 0, 0.35, -0.2), r.j.torso);
      },
      setTool(id) { if (gear.tool) gear.tool.parent.remove(gear.tool); delete gear.tool; if (id && r.j.handR) { gear.tool = box(0.08, 0.08, 0.6, 0x8a6a40, 0, 0, 0.3); r.j.handR.add(gear.tool); } },
      setOpacity(a) { r.root.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = a < 1; o.material.opacity = a; } }); },
      dispose() { r.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    };
    let gear = {};
    return H;
  }
  function quad(look) {
    const L = Object.assign({ color: 0x777777, len: 1.0, h: 0.6 }, look);
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const j = {};
    body.add(box(0.4 * L.len, 0.35 * L.len, L.len, L.color, 0, L.h, 0));
    j.head = new THREE.Group(); j.head.position.set(0, L.h + 0.1, L.len * 0.55); body.add(j.head); j.head.add(box(0.3 * L.len, 0.3 * L.len, 0.4 * L.len, L.color, 0, 0, 0.1));
    const leg = (n, x, z) => { const g = new THREE.Group(); g.position.set(x, L.h, z); g.add(box(0.1 * L.len, L.h, 0.1 * L.len, L.color, 0, -L.h / 2, 0)); body.add(g); j[n] = g; };
    leg('legL', -0.13 * L.len, 0.35 * L.len); leg('legR', 0.13 * L.len, 0.35 * L.len); leg('armL', -0.13 * L.len, -0.35 * L.len); leg('armR', 0.13 * L.len, -0.35 * L.len);
    const r = { root, body, j }; const H = animated(r, 'quad'); H.height = L.h + 0.5 * L.len;
    const pl = H.play; H.play = (n, o) => pl(n === 'slash' || n === 'stab' ? 'bite' : n, o);
    j.armR = null; j.armL = null; delete j.handR;
    return H;
  }
  const NPCS = { maren: { shirt: 0x5b3a7a, pants: 0x5b3a7a, hair: 0xcccccc }, tam: { shirt: 0xe8e0c8, pants: 0x4a3a2a, hair: 0x7a4a20 }, garrick: { shirt: 0x6a4a2a, pants: 0x3a3a3a, hair: 0x2a1a10, scale: 1.08 } };
  const MONS = { rat: { q: { color: 0x6a5a50, len: 0.55, h: 0.22 } }, wolf: { q: { color: 0x7a7a80, len: 1.1, h: 0.55 } }, bandit: { h: { shirt: 0x5a4632, pants: 0x3a3028, hair: 0x222222 }, w: 'sword_t1' }, bandit_leader: { h: { shirt: 0x7a1e1e, pants: 0x3a3028, hair: 0x111111, scale: 1.1 }, w: 'sword_t2' }, goblin: { h: { skin: 0x6a9a3a, shirt: 0x7a5a30, pants: 0x5a4020, hair: 0x2a3a10, scale: 0.75 }, w: 'sword_t1' } };
  return {
    tiers,
    humanoid(look) { const H = animated(rig(look)); H.setGear({}); return H; },
    npc(key) { return animated(rig(NPCS[key] || {})); },
    monster(key) { const d = MONS[key] || MONS.rat; if (d.q) return quad(d.q); const H = animated(rig(d.h)); H.setGear({ weapon: d.w }); return H; },
    item(id) {
      const k = kindOf(id), t = tierOf(id), g = new THREE.Group();
      if (id === 'coins') { for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8), mat(0xe8c040)); c.position.set((i % 3) * 0.08 - 0.08, 0.02 + (i > 2 ? 0.03 : 0), (i > 2 ? 0.04 : 0)); g.add(c); } return g; }
      const col = /sword|helmet|body|legs|shield|arrows/.test(k) ? tiers.metal[t] : k === 'bow' ? tiers.wood[t] : k === 'staff' ? tiers.cloth[t] : 0xb08a50;
      g.add(box(k === 'sword' || k === 'staff' || k === 'bow' ? 0.7 : 0.3, 0.08, k === 'sword' || k === 'staff' || k === 'bow' ? 0.08 : 0.25, col, 0, 0.05, 0)); return g;
    },
    projectile(kind, t) {
      if (kind === 'arrow') { const g = new THREE.Group(); g.add(box(0.03, 0.03, 0.5, 0x8a6a40, 0, 0, 0)); g.add(box(0.06, 0.06, 0.08, typeof t === 'number' && t < 6 ? tiers.metal[t] : 0x999999, 0, 0, 0.27)); return g; }
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshBasicMaterial({ color: typeof t === 'number' && t > 5 ? t : 0xff8020 })); return m;
    }
  };
}
