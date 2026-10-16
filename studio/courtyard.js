/* ASHVALE Workshop: "See it in Ashvale". A walkable courtyard in the game's own scale with the player's character and the
   design standing in the middle, so a player can walk up to it and judge its size.
   World scale is the game's (src/engine.js): 1 unit = 1 tile, characters drawn at CHAR = 0.8, walls 1.8 high (scene.js),
   walk 1 tile per 0.6 s tick, run 2. Ground items draw at 1.0, worn/held things inherit the character's 0.8.
   Walls are the game's house kit (data/housekit.json), laid out like scene.js kitWalls(): piece x-scale = length/2,
   y/z scale = 1.8/3.12. The kit decoder is a copy of scene.js kitPiece()/KitBatch() (that one is private to the scene).
   No imports of workshop.js: Phase 2 moves this into the game (handoff/workshop_plan.md).

     openCourtyard({THREE, OrbitControls, createModels, parts, kit, design, host, onClose}) -> {close()}  */

const TICK = 0.6, CHAR = 0.8, WH = 1.8, WALK = 1 / TICK, RUN = 2 / TICK, R = 0.3, HALF = 8;
const LOOK_KEYS = ['body', 'skin', 'hair', 'hairColor', 'beard', 'eyes', 'shirt', 'pants', 'boots', 'feet', 'gloves', 'belt', 'apron'];   /* core.js LOOK_KEYS minus hat/cape (worn items) */
const HAND_KINDS = new Set(['Weapon', 'Tool', 'Jewellery', 'Potion or food', 'Magic thing', 'Armour']);
const LS = 'ash.workshop.look';

export function cleanLook(l) {   /* same idea as core.js cleanLook(): known keys, short plain values only */
  if (!l || typeof l !== 'object') return null;
  const ok = v => v == null || (typeof v === 'string' && /^[#\w -]{0,24}$/.test(v)), o = {};
  for (const k of LOOK_KEYS) {
    if (!(k in l)) continue; const v = l[k];
    if (k === 'body') { if (v === 'male' || v === 'female') o.body = v; continue; }
    if (v && typeof v === 'object') { if (ok(v.style) && ok(v.color)) o[k] = { style: v.style, color: v.color }; }
    else if (ok(v)) o[k] = v;
  }
  return o;
}

export function openCourtyard(opt) {
  const { THREE, OrbitControls, createModels, parts, kit, design, host, onClose } = opt;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- page ---------- */
  const wrap = document.createElement('div');
  wrap.className = 'court';
  wrap.innerHTML =
    '<div class="courtBar"><button data-a="back">← Workshop</button><b>' + esc(design.name || 'Your design') + '</b><span class="courtSize"></span>' +
    '<span class="courtBtns"><button data-a="hold" hidden>Hold it</button><button data-a="run">Walk</button><button data-a="look">Your character</button></span></div>' +
    '<div class="courtHelp">WASD or arrow keys to walk (Shift runs) · click or tap the ground to walk there · drag to look around</div>' +
    '<div class="courtLook" hidden></div>';
  host.appendChild(wrap);
  const $ = s => wrap.querySelector(s);

  const ren = new THREE.WebGLRenderer({ antialias: true });
  ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.shadowMap.enabled = true; ren.shadowMap.type = THREE.PCFSoftShadowMap;
  wrap.insertBefore(ren.domElement, wrap.firstChild);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#9cc4e4'); scene.fog = new THREE.Fog('#9cc4e4', 30, 70);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a6a3a, 0.95));
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(6, 12, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 }); scene.add(sun);

  const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  const solids = [];   /* AABBs on the ground plane: [minX, minZ, maxX, maxZ] */
  const solid = (x0, z0, x1, z1) => solids.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

  /* ---------- ground: grass round a stone-paved court ---------- */
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), lam(0x5f9e3f)); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.01; grass.receiveShadow = true; scene.add(grass);
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2 + 4), lam(0x8a7a5a)); pave.rotation.x = -Math.PI / 2; pave.position.z = 2; pave.receiveShadow = true; scene.add(pave);
  const grid = new THREE.GridHelper(HALF * 2, HALF * 2, 0x6e624a, 0x6e624a); grid.position.y = 0.005; grid.material.transparent = true; grid.material.opacity = 0.45; scene.add(grid);

  /* ---------- walls from the house kit (scene.js kitWalls) ---------- */
  const kitTris = new Map();
  function kitPiece(name) {
    if (kitTris.has(name)) return kitTris.get(name);
    const r = kit && kit.pieces[name]; if (!r) { kitTris.set(name, null); return null; }
    const b64 = s => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k); return u8.buffer; };
    const P = new Int16Array(b64(r.p)), I = r.w === 2 ? new Uint16Array(b64(r.i)) : new Uint32Array(b64(r.i));
    const out = r.g.map(([c, s, n]) => { const t = new Float32Array(n * 3); for (let k = 0; k < n; k++) { const v = I[s + k] * 3; t[k * 3] = P[v] / 100; t[k * 3 + 1] = P[v + 1] / 100; t[k * 3 + 2] = P[v + 2] / 100; } return [kit.palette[c], t]; });
    kitTris.set(name, out); return out;
  }
  const buckets = new Map();
  function kitAdd(name, x, y, z, ry, sx, sy, sz, tint) {
    const pc = kitPiece(name); if (!pc) return false;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz)), a = m.elements;
    for (const [c0, t] of pc) {
      const c = (tint && tint[c0]) || c0; let b = buckets.get(c); if (!b) buckets.set(c, b = []);
      const o = new Float32Array(t.length);
      for (let k = 0; k < t.length; k += 3) { const X = t[k], Y = t[k + 1], Z = t[k + 2]; o[k] = a[0] * X + a[4] * Y + a[8] * Z + a[12]; o[k + 1] = a[1] * X + a[5] * Y + a[9] * Z + a[13]; o[k + 2] = a[2] * X + a[6] * Y + a[10] * Z + a[14]; }
      b.push(o);
    }
    return true;
  }
  function kitFlush() {
    for (const [c, list] of buckets) {
      let n = 0; for (const o of list) n += o.length; const pos = new Float32Array(n); let off = 0; for (const o of list) { pos.set(o, off); off += o.length; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
      const glass = c === kit.glass;
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial(glass ? { color: 0xa9cde6, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false } : { color: parseInt(c.slice(1), 16), side: THREE.DoubleSide, flatShading: true }));
      m.castShadow = !glass; m.receiveShadow = true; scene.add(m);
    }
    buckets.clear();
  }
  const S0 = WH / 3.12, tint = kit ? { [kit.tile]: '#7a3b2a', [kit.plaster]: '#d8c9a3' } : null;
  function wallRun(ax, az, bx, bz, ry, door) {   /* one side of the court: plain + window pieces, an optional door piece in the middle */
    const horiz = az === bz, L0 = horiz ? Math.min(ax, bx) : Math.min(az, bz), L1 = horiz ? Math.max(ax, bx) : Math.max(az, bz);
    const put = (name, l0, l1) => {
      const px = horiz ? (l0 + l1) / 2 : ax, pz = horiz ? az : (l0 + l1) / 2;
      if (kit) { kitAdd(name, px, 0, pz, ry, (l1 - l0) / 2, S0, S0, tint); if (name === 'Wall_Plaster_Window_Wide_Round') kitAdd('Window_Wide_Round1', px, 0, pz, ry, (l1 - l0) / 2, S0, S0, tint); }
      else box(horiz ? l1 - l0 : 0.16, WH, horiz ? 0.16 : l1 - l0, 0xd8c9a3, px, WH / 2, pz);
    };
    const fill = (l0, l1) => { const n = Math.max(1, Math.round((l1 - l0) / 1.25)), w = (l1 - l0) / n; for (let k = 0; k < n; k++) put(k % 2 ? 'Wall_Plaster_Window_Wide_Round' : 'Wall_Plaster_Straight', l0 + k * w, l0 + (k + 1) * w); };
    if (door) { const mid = (L0 + L1) / 2; fill(L0, mid - 0.75); put('Wall_Plaster_Door_Round', mid - 0.75, mid + 0.75); fill(mid + 0.75, L1); }
    else fill(L0, L1);
    if (horiz) solid(L0, az - 0.2, L1, az + 0.2); else solid(ax - 0.2, L0, ax + 0.2, L1);
  }
  wallRun(-HALF, -HALF, HALF, -HALF, 0, true);              /* north, facing in, with a door */
  wallRun(-HALF, -HALF, -HALF, HALF, Math.PI / 2, false);   /* west */
  wallRun(HALF, -HALF, HALF, HALF, -Math.PI / 2, false);    /* east */
  if (kit) { for (const [x, z] of [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]]) kitAdd('Corner_Exterior_Wood', x, 0, z, 0, S0, S0, S0, tint); kitFlush(); }
  box(HALF * 2 + 0.6, 0.12, 0.5, 0x7c766c, 0, 0.06, -HALF + 0.3);   /* a low stone footing along the walls */
  box(0.5, 0.12, HALF * 2, 0x7c766c, -HALF + 0.3, 0.06, 0); box(0.5, 0.12, HALF * 2, 0x7c766c, HALF - 0.3, 0.06, 0);

  /* ---------- props for scale ---------- */
  (function well(x, z) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.7, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0x7c766c, flatShading: true, side: THREE.DoubleSide }));
    ring.position.set(x, 0.35, z); ring.castShadow = true; scene.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.72, 10), lam(0x2f5a7a)); water.rotation.x = -Math.PI / 2; water.position.set(x, 0.3, z); scene.add(water);
    box(0.1, 1.6, 0.1, 0x6b4a2b, x - 0.7, 0.8, z); box(0.1, 1.6, 0.1, 0x6b4a2b, x + 0.7, 0.8, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 4), lam(0x7a3b2a)); roof.position.set(x, 1.85, z); roof.rotation.y = Math.PI / 4; roof.castShadow = true; scene.add(roof);
    solid(x - 0.85, z - 0.85, x + 0.85, z + 0.85);
  })(-5, -5);
  (function bench(x, z) {
    box(1.6, 0.08, 0.45, 0x8a6a4a, x, 0.45, z); box(0.1, 0.45, 0.4, 0x6b4a2b, x - 0.65, 0.22, z); box(0.1, 0.45, 0.4, 0x6b4a2b, x + 0.65, 0.22, z);
    solid(x - 0.8, z - 0.25, x + 0.8, z + 0.25);
  })(5, -6.6);
  for (const [x, z] of [[-6.5, 4], [6.5, 4]]) {   /* lantern posts */
    box(0.12, 2.2, 0.12, 0x3a3430, x, 1.1, z);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), new THREE.MeshLambertMaterial({ color: 0xf0c860, emissive: 0xf0a030, emissiveIntensity: 0.8 })); l.position.set(x, 2.3, z); scene.add(l);
    solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15);
  }
  for (const [x, z, s] of [[-11, 6, 1], [11, 9, 1.2], [-12, -3, 0.9], [12, -2, 1.1], [-4, 15, 1], [6, 16, 1.3]]) {   /* trees outside */
    box(0.3 * s, 1.2 * s, 0.3 * s, 0x6b4a2b, x, 0.6 * s, z);
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.3 * s, 2.8 * s, 7), lam(0x40702c)); c.position.set(x, 2.4 * s, z); c.castShadow = true; scene.add(c);
    solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }

  /* ---------- the models: the game's own code ---------- */
  const M = createModels(THREE, { parts, onReject: (id, why) => console.warn('part', id, why) });
  const slug = Object.keys(design.part.items || {})[0];
  const ok = M.addPart(design.part);
  const designObj = new THREE.Group(); scene.add(designObj);
  const hand = HAND_KINDS.has(design.kind);
  let plinthTop = 0;
  if (hand) { box(0.8, 0.9, 0.8, 0x9a948a, 0, 0.45, 0); box(0.9, 0.06, 0.9, 0x7c766c, 0, 0.93, 0); plinthTop = 0.96; }
  const piece = ok ? M.item(slug) : new THREE.Group();
  piece.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  designObj.add(piece);
  /* rest it on the floor (or the plinth), centred: models.js item() keeps shape positions, so measure and lift */
  const bb = new THREE.Box3().setFromObject(piece), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
  piece.position.set(-ctr.x, plinthTop - bb.min.y, -ctr.z);
  if (design.kind === 'Creature' || design.kind === 'Character') designObj.rotation.y = 0;   /* models face +Z: toward the player's start */
  const fx = Math.max(hand ? 0.45 : 0, size.x / 2 + 0.05), fz = Math.max(hand ? 0.45 : 0, size.z / 2 + 0.05);
  if (fx > 0.06 || fz > 0.06) solid(-fx, -fz, fx, fz);
  const big = Math.max(size.x, size.z) > HALF * 1.6;

  /* ---------- the player ---------- */
  let look = null; try { look = cleanLook(JSON.parse(localStorage.getItem(LS) || 'null')); } catch (e) { look = null; }
  const H = M.humanoid({});
  if (look && H.setOutfit) H.setOutfit(look);
  H.object.scale.setScalar(CHAR);
  const me = new THREE.Group(); me.add(H.object); scene.add(me);
  me.position.set(0, 0, Math.min(HALF - 1.5, Math.max(3, size.z / 2 + 2.5)));
  me.rotation.y = Math.PI;   /* facing north, at the design */
  H.play('idle', { loop: true });
  let anim = 'idle', running = false, held = null;

  const orbit = new OrbitControls(cam, ren.domElement);
  orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.48; orbit.minDistance = 1.5; orbit.maxDistance = 25; orbit.enablePan = false;
  orbit.target.set(me.position.x, 1.0, me.position.z);
  cam.position.set(me.position.x + 1.5, 3.2, me.position.z + 5.5); orbit.update();

  /* ---------- sizes ---------- */
  const H_TALL = H.height || 1.86 * CHAR;   /* H.height already includes H.object.scale */
  $('.courtSize').textContent = 'Design ' + size.x.toFixed(2) + ' × ' + size.y.toFixed(2) + ' × ' + size.z.toFixed(2) + ' (wide × tall × deep) · you ' + H_TALL.toFixed(2) + ' tall · 1 floor square = 1 tile' + (big ? ' · bigger than the courtyard!' : '');

  /* ---------- hold it ---------- */
  let holding = false;
  function attachHeld() {   /* (re)hang the design in the right hand; an outfit change rebuilds the body, so call again after it */
    if (held) { held.parent && held.parent.remove(held); held = null; }
    if (!holding) return;
    const j = H.object.getObjectByName('handR'); if (!j) return;
    const it = M.item(slug); it.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const hb = new THREE.Box3().setFromObject(it), hc = hb.getCenter(new THREE.Vector3());
    it.position.set(-hc.x, -hb.min.y - 0.05, -hc.z);   /* grip near the bottom of the design */
    held = new THREE.Group(); held.rotation.x = 2.1; held.add(it); j.add(held);   /* the same mount as gear.sword (handR, r=[2.1,0,0]): checked against the game sword, the design points forward like it */
  }
  if (hand && ok) {
    const b = $('[data-a=hold]'); b.hidden = false;
    b.onclick = () => { holding = !holding; attachHeld(); designObj.visible = !holding; b.textContent = holding ? 'Put it back' : 'Hold it'; };
  }

  /* ---------- your character: the game's own choices ---------- */
  function drawLook() {
    const st = M.outfitStyles || {}, pal = M.palette || {}, cur = Object.assign(M.defaultOutfit ? M.defaultOutfit() : {}, look || {});
    const row = (key, list, lab) => list && list.length ? '<div class="lk"><span>' + lab + '</span><select data-k="' + key + '">' + list.map(v => '<option value="' + esc(v == null ? '' : v) + '"' + (String((cur[key] && cur[key].style) || cur[key] || '') === String(v || '') ? ' selected' : '') + '>' + esc(v || 'none') + '</option>').join('') + '</select></div>' : '';
    const sw = (key, list, lab) => list && list.length ? '<div class="lk"><span>' + lab + '</span><div class="swatches">' + list.map(c => '<i data-c="' + key + '" data-v="' + c + '" style="background:' + c + '"></i>').join('') + '</div></div>' : '';
    $('.courtLook').innerHTML = '<h3>Your character</h3>' +
      '<div class="lk"><span>Body</span><select data-k="body"><option' + (cur.body !== 'female' ? ' selected' : '') + '>male</option><option' + (cur.body === 'female' ? ' selected' : '') + '>female</option></select></div>' +
      sw('skin', pal.skin, 'Skin') + row('hair', st.hair, 'Hair') + sw('hairColor', pal.hair, 'Hair colour') + row('beard', st.beard, 'Beard') +
      row('shirt', st.shirt, 'Shirt') + sw('shirtColor', pal.cloth, 'Shirt colour') + row('pants', st.pants, 'Legs') + sw('pantsColor', pal.cloth, 'Legs colour') +
      '<h3>Or paste your look</h3><textarea rows="3" placeholder="{&quot;look&quot;: {...}} from your ASHVALE save"></textarea><button data-a="paste">Use it</button> <button data-a="lookdone">Done</button>';
    const L = $('.courtLook');
    const apply = patch => { look = cleanLook(Object.assign({}, look || {}, patch)) || {}; if (H.setOutfit) H.setOutfit(look); H.object.scale.setScalar(CHAR); attachHeld(); try { localStorage.setItem(LS, JSON.stringify(look)); } catch (e) { /* private window */ } };
    L.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => {
      const k = s.dataset.k, v = s.value || null, c = cur[k] && cur[k].color;
      apply({ [k]: (k === 'shirt' || k === 'pants') ? { style: v, color: (look && look[k] && look[k].color) || c || '#8a3030' } : v });
    });
    L.querySelectorAll('i[data-c]').forEach(i => i.onclick = () => {
      const k = i.dataset.c, v = i.dataset.v;
      if (k === 'shirtColor' || k === 'pantsColor') { const p = k === 'shirtColor' ? 'shirt' : 'pants', base = (look && look[p]) || cur[p] || {}; apply({ [p]: { style: base.style || (p === 'shirt' ? 'tunic' : 'trousers'), color: v } }); }
      else apply({ [k]: v });
    });
    L.querySelector('[data-a=paste]').onclick = () => {
      try { let j = JSON.parse(L.querySelector('textarea').value); if (j.look) j = j.look; else if (j.players) { const p = Object.values(j.players)[0]; j = p && p.look; } const c = cleanLook(j); if (!c) throw 0; look = {}; apply(c); drawLook(); }
      catch (e) { L.querySelector('textarea').value = 'That is not a look. Paste the {"look": {...}} part of your save.'; }
    };
    L.querySelector('[data-a=lookdone]').onclick = () => { L.hidden = true; };
  }
  $('[data-a=look]').onclick = () => { const L = $('.courtLook'); if (L.hidden) { drawLook(); L.hidden = false; } else L.hidden = true; };
  $('[data-a=run]').onclick = e => { running = !running; e.target.textContent = running ? 'Run' : 'Walk'; e.target.classList.toggle('on', running); };
  $('[data-a=back]').onclick = () => close();

  /* ---------- walking ---------- */
  const keys = {}; let goal = null, shift = false;
  const onKey = (e, v) => {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'Escape' && v) { close(); return; }
    if (e.key === 'Shift') shift = v;
    const k = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' }[e.key.toLowerCase()];
    if (k) { keys[k] = v; goal = null; e.preventDefault(); e.stopPropagation(); }
  };
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
  let down = null;
  ren.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  ren.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = ren.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), cam);
    const p = new THREE.Vector3(); if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) goal = [p.x, p.z];
  });
  const blocked = (x, z) => Math.abs(x) > 30 || Math.abs(z) > 30 || solids.some(([a, b, c, d]) => x > a - R && x < c + R && z > b - R && z < d + R);

  let last = performance.now(), raf = 0, alive = true;
  const fit = () => { const w = wrap.clientWidth, h = wrap.clientHeight; ren.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); };
  const ro = new ResizeObserver(fit); ro.observe(wrap); fit();
  function frame() {
    if (!alive) return; raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    let dx = 0, dz = 0;
    if (keys.f || keys.b || keys.l || keys.r) {   /* relative to where the camera looks */
      const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
      const rt = new THREE.Vector3(-f.z, 0, f.x);
      dx = (keys.f ? f.x : 0) - (keys.b ? f.x : 0) + (keys.r ? rt.x : 0) - (keys.l ? rt.x : 0);
      dz = (keys.f ? f.z : 0) - (keys.b ? f.z : 0) + (keys.r ? rt.z : 0) - (keys.l ? rt.z : 0);
    } else if (goal) { dx = goal[0] - me.position.x; dz = goal[1] - me.position.z; if (Math.hypot(dx, dz) < 0.08) { goal = null; dx = dz = 0; } }
    const len = Math.hypot(dx, dz), speed = (running || shift) ? RUN : WALK;
    let moved = false;
    if (len > 1e-4) {
      const step = Math.min(speed * dt, goal ? len : Infinity), ux = dx / len, uz = dz / len;
      const x0 = me.position.x, z0 = me.position.z, nx = x0 + ux * step, nz = z0 + uz * step;
      if (!blocked(nx, nz)) { me.position.x = nx; me.position.z = nz; }
      else if (!blocked(nx, z0)) me.position.x = nx;   /* slide along walls */
      else if (!blocked(x0, nz)) me.position.z = nz;
      moved = me.position.x !== x0 || me.position.z !== z0;
      if (!moved) goal = null;
      const want = Math.atan2(ux, uz); let d = want - me.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); me.rotation.y += d * Math.min(1, dt * 12);
      cam.position.x += me.position.x - x0; cam.position.z += me.position.z - z0;
      orbit.target.set(me.position.x, 1.0, me.position.z);
    }
    const want = moved ? ((running || shift) ? 'run' : 'walk') : 'idle';
    if (want !== anim) { anim = want; H.play(anim, { loop: true }); }
    H.update(dt); orbit.update(); ren.render(scene, cam);
  }
  frame();

  function close() {
    if (!alive) return; alive = false; cancelAnimationFrame(raf); ro.disconnect();
    removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true);
    orbit.dispose(); if (H.dispose) H.dispose();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
    ren.dispose(); wrap.remove(); if (onClose) onClose();
  }
  const api = { close, scene, player: me, H, THREE };
  wrap.__court = api;   /* for tests */
  return api;
}
