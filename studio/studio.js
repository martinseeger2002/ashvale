/* ASHVALE design studio: remix the game's own parts in the browser, save a draft, open a GitHub suggestion. */
import * as THREE from '/vendor/three.module.min.js';
import { createModels } from '/src/models.js';

const $ = id => document.getElementById(id);
const state = { catalog: null, cls: null, design: null, parts: {}, M: null, scene: null, cam: null, renderer: null, obj: null, pal: [] };

async function boot() {
  $('author').value = localStorage.getItem('ash.studio.author') || '';
  $('author').onchange = () => localStorage.setItem('ash.studio.author', $('author').value.trim());
  state.catalog = await (await fetch('/api/catalog')).json();
  await loadParts();
  setupStage();
  drawNav();
  pick(state.catalog.classes.find(c => c.class === 'item:ring') || state.catalog.classes[0]);
}

async function loadParts() {
  const files = await (await fetch('/api/parts')).json();
  await Promise.all(files.map(async f => {
    const j = await (await fetch('/data/parts/' + f + '.json')).json();
    const p = j.data && j.ashvale3d === 'module' ? j.data : j;
    if (p && p.id) state.parts[p.id] = p;
  }));
  state.M = createModels(THREE, { parts: state.parts, onReject: (id, why) => console.warn('part', id, why) });
}

function setupStage() {
  const host = $('stage');
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio));
  r.shadowMap.enabled = true;
  host.appendChild(r.domElement);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#87a8c8');
  sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a5a3a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
  sun.position.set(4, 8, 6); sun.castShadow = true; sc.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#5f8a3e' }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
  cam.position.set(2.4, 1.8, 4.2); cam.lookAt(0, 0.8, 0);
  state.scene = sc; state.cam = cam; state.renderer = r;
  const drag = { on: false, x: 0, y: 0, yaw: 0.4, pitch: 0.35, dist: 5 };
  state.orbit = drag;
  host.addEventListener('pointerdown', e => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointerup', () => { drag.on = false; });
  host.addEventListener('pointermove', e => {
    if (!drag.on) return;
    drag.yaw -= (e.clientX - drag.x) * 0.008; drag.pitch = Math.max(0.08, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.006));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  host.addEventListener('wheel', e => { drag.dist = Math.max(1.4, Math.min(18, drag.dist + e.deltaY * 0.01)); e.preventDefault(); }, { passive: false });
  function frame() {
    const w = host.clientWidth, h = host.clientHeight;
    if (w && h && (r.domElement.width !== w || r.domElement.height !== h)) { r.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); }
    const lookY = state.lookY || 0.7;
    cam.position.set(Math.sin(drag.yaw) * drag.dist, lookY + Math.sin(drag.pitch) * drag.dist * 0.55, Math.cos(drag.yaw) * drag.dist);
    cam.lookAt(0, lookY, 0);
    if (state.obj && state.obj.update) state.obj.update(1 / 60);
    r.render(sc, cam);
    requestAnimationFrame(frame);
  }
  frame();
}

function drawNav() {
  const nav = $('nav');
  const groups = { item: 'Items', npc: 'People & beasts', building: 'Buildings' };
  nav.innerHTML = '';
  for (const g of ['item', 'npc', 'building']) {
    const h = document.createElement('h2'); h.textContent = groups[g]; nav.appendChild(h);
    for (const c of state.catalog.classes.filter(x => x.group === g)) {
      const b = document.createElement('button');
      b.className = 'class' + (state.cls && state.cls.class === c.class ? ' on' : '');
      b.innerHTML = c.class + (c.inGame === false ? ' <span class="tag">new</span>' : '') + '<small>' + (c.slot ? 'slot ' + c.slot : c.body || c.label || '') + '</small>';
      b.onclick = () => pick(c);
      nav.appendChild(b);
    }
  }
}

function templates(cls) {
  if (cls.group === 'item' && cls.kind === 'ring') return ringTemplate();
  if (cls.group === 'item' && cls.kind === 'necklace') return necklaceTemplate();
  if (cls.group === 'item' && cls.kind === 'charm') return charmTemplate();
  if (cls.group === 'item') return genericItem(cls);
  if (cls.group === 'npc' && cls.body === 'beast') return beastTemplate(cls);
  if (cls.group === 'npc') return humanTemplate(cls);
  return buildingTemplate(cls);
}

function ringTemplate() {
  const base = JSON.parse(JSON.stringify(state.parts['item.ring'] || defaultRing()));
  return itemDesign('item:ring', 'copper_ring', 'Copper ring', base, {
    category: 'jewellery', subcategory: 'ring', weight: 8, value: 40,
    attributes: [{ trait_type: 'Magic', value: 1 }],
  });
}
function necklaceTemplate() {
  const part = {
    ashvale3d: 'part', api: 1, v: 1, id: 'item.copper_necklace', kind: 'item',
    items: { copper_necklace: '#d9a930' },
    shapes: [
      { t: 'torus', s: [0.07, 0.008], c: '$c', p: [0, 0.09, 0], seg: [6, 14], r: [0.4, 0, 0] },
      { t: 'sphere', s: [0.022], c: '#7a3a2a', p: [0, 0.02, 0.01], seg: [6, 4], glow: false },
      { t: 'cone', s: [0.014, 0.04], c: '$c', p: [0, -0.01, 0.01], seg: 5 },
    ],
  };
  return itemDesign('item:necklace', 'copper_necklace', 'Copper necklace', part, {
    category: 'jewellery', subcategory: 'necklace', weight: 18, value: 55,
    attributes: [{ trait_type: 'Prayer', value: 1 }],
  });
}
function charmTemplate() {
  const part = {
    ashvale3d: 'part', api: 1, v: 1, id: 'item.wood_charm', kind: 'item',
    items: { wood_charm: '#9b6d3d' },
    shapes: [
      { t: 'ico', s: [0.05], c: '$c', p: [0, 0.05, 0] },
      { t: 'cyl', s: [0.008, 0.008, 0.06], c: '#c8a040', p: [0, 0.1, 0], seg: 6 },
    ],
  };
  return itemDesign('item:charm', 'wood_charm', 'Wooden charm', part, {
    category: 'jewellery', subcategory: 'charm', weight: 12, value: 25, attributes: [],
  });
}
function defaultRing() {
  return { ashvale3d: 'part', api: 1, v: 1, id: 'item.ring', kind: 'item', items: { copper_ring: '#d9a930' },
    shapes: [{ t: 'torus', s: [0.05, 0.012], c: '$c', p: [0, 0.012, 0], seg: [6, 16], r: [1.5707963267948966, 0, 0] }, { t: 'sphere', s: [0.02], c: '#7a3a2a', p: [0, 0.06, 0], seg: [6, 4] }] };
}
function genericItem(cls) {
  const remix = (state.catalog.items || []).find(i => i.subcategory === cls.kind);
  const partId = remix && remix.model;
  const part = JSON.parse(JSON.stringify((partId && state.parts[partId]) || {
    ashvale3d: 'part', api: 1, v: 1, id: 'item.new_' + cls.kind, kind: 'item', items: {},
    shapes: [{ t: 'box', s: [0.12, 0.12, 0.12], c: '$c', p: [0, 0.06, 0] }],
  }));
  const id = 'new_' + cls.kind;
  part.id = 'item.' + id;
  part.items = { [id]: '#c8a040' };
  return itemDesign(cls.class, id, 'New ' + cls.kind, part, {
    category: cls.category, subcategory: cls.kind, weight: 400, value: 20, attributes: [],
  });
}
function itemDesign(cls, id, name, part, item) {
  return { class: cls, id, name, author: $('author').value, note: '', part, item, needs: (state.cls && state.cls.needs) || [] };
}
function beastTemplate(cls) {
  const src = state.parts[cls.remix] || state.parts['char.' + cls.kind] || state.parts['char.wolf'];
  const part = JSON.parse(JSON.stringify(src));
  const id = 'custom_' + cls.kind;
  part.id = 'char.' + id;
  part.role = 'monster';
  part.name = 'Custom ' + (src.name || cls.kind);
  return { class: cls.class, id, name: part.name, author: $('author').value, note: '', part, needs: [] };
}
function humanTemplate() {
  const src = JSON.parse(JSON.stringify(state.parts['char.bryce'] || {}));
  const id = 'new_villager';
  src.id = 'char.' + id;
  src.role = 'npc';
  src.name = 'New villager';
  src.body = 'humanoid';
  src.build = src.build || 'normal';
  src.outfit = src.outfit || { skin: '#e0ac85', hair: 'short', hairColor: '#4a3020', shirt: { style: 'tunic', color: '#4f6d3a' }, pants: { style: 'trousers', color: '#5a4630' }, boots: '#3a2a1c' };
  return { class: 'npc:human', id, name: src.name, author: $('author').value, note: '', part: src, needs: [] };
}
function buildingTemplate(cls) {
  const k = cls.kind;
  const building = { k, w: k === 'church' ? 7 : 6, h: k === 'church' ? 9 : 5, floors: 1, enter: true, sign: k === 'church' ? 'Chapel' : 'House', roof: '#6a4a2a', wall: '#d5cab2', door: 's' };
  return { class: cls.class, id: 'new_' + k, name: 'New ' + (cls.label || k), author: $('author').value, note: '', building, needs: [] };
}

function pick(cls) {
  state.cls = cls;
  state.design = templates(cls);
  drawNav();
  drawForm();
  preview();
}

function drawForm() {
  const d = state.design, cls = state.cls, pal = state.catalog.palette || {};
  const side = $('form');
  let html = '<h3>' + esc(d.name) + '</h3><div class="msg" id="status"></div>';
  html += field('id', 'id (filename)', d.id);
  html += field('name', 'name', d.name);
  html += '<label>note for the reviewers</label><textarea id="note">' + esc(d.note || '') + '</textarea>';
  if (cls.inGame === false) html += '<p class="msg">This class is not in the live rules yet. The PR will ask for the extra slot.</p>';
  if (cls.group === 'item') html += itemFields(d, pal);
  if (cls.group === 'npc') html += npcFields(d, pal);
  if (cls.group === 'building') html += buildingFields(d);
  html += '<div id="drop">Drop a part JSON or a PNG here, or <a href="#" id="pickf">choose a file</a>. PNG becomes colours (the game has no textures).</div>';
  html += '<button class="btn" id="save">Save draft</button>';
  html += '<button class="btn gh" id="suggest">Suggest to GitHub</button>';
  html += '<p class="msg" id="out"></p>';
  side.innerHTML = html;
  bindForm();
}
function field(id, lab, val) { return '<label>' + lab + '</label><input id="' + id + '" type="text" value="' + esc(val || '') + '">'; }
function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function itemFields(d, pal) {
  const it = d.item, metal = (pal.cloth || pal.skin || []).concat(['#d9a930', '#6f7076', '#b8763c', '#7a3a2a', '#41548e']);
  let h = '<label>metal / paint</label><div class="swatches" id="swatch">';
  for (const c of unique(metal)) h += '<i data-c="' + c + '" style="background:' + c + '"></i>';
  h += '</div><div class="row"><div><label>paint</label><input id="paint" type="color" value="' + (firstColor(d.part) || '#d9a930') + '"></div>';
  h += '<div><label>weight g</label><input id="weight" type="number" value="' + (it.weight || 10) + '"></div>';
  h += '<div><label>value</label><input id="value" type="number" value="' + (it.value || 0) + '"></div></div>';
  h += '<label>trait</label><div class="row"><select id="trait">' + opts(state.catalog.traits || [], ((it.attributes || [])[0] || {}).trait_type || 'Magic') + '</select>';
  h += '<input id="traitv" type="number" value="' + (((it.attributes || [])[0] || {}).value || 1) + '"></div>';
  h += shapeEditor(d.part);
  return h;
}
function npcFields(d, pal) {
  const p = d.part, beast = p.beast || {}, out = p.outfit || {};
  let h = '';
  if (p.body === 'beast') {
    h += '<label>coat</label><input id="coat" type="color" value="' + (beast.color || '#8c8c90') + '">';
    h += '<label>snout</label><input id="snout" type="color" value="' + (beast.snout || beast.color || '#6c6c70') + '">';
    h += '<label>size</label><input id="size" type="number" step="0.05" min="0.4" max="2.5" value="' + (beast.size || 1) + '">';
    h += '<label><input id="mane" type="checkbox"' + (beast.mane ? ' checked' : '') + '> mane</label>';
  } else {
    h += '<label>skin</label><input id="skin" type="color" value="' + (out.skin || '#e0ac85') + '">';
    h += '<label>hair</label><select id="hair">' + opts(state.catalog.hair, out.hair || 'short') + '</select>';
    h += '<label>hair colour</label><input id="hairColor" type="color" value="' + (out.hairColor || '#4a3020') + '">';
    h += '<label>beard</label><select id="beard">' + opts([''].concat(state.catalog.beard || []), out.beard || '') + '</select>';
    h += '<label>shirt</label><input id="shirt" type="color" value="' + ((out.shirt && out.shirt.color) || '#4f6d3a') + '">';
    h += '<label>build</label><select id="build">' + opts(['normal', 'small', 'big'], p.build || 'normal') + '</select>';
  }
  return h;
}
function buildingFields(d) {
  const b = d.building;
  return '<div class="row"><div><label>width</label><input id="bw" type="number" min="2" max="24" value="' + b.w + '"></div>' +
    '<div><label>depth</label><input id="bh" type="number" min="2" max="24" value="' + b.h + '"></div>' +
    '<div><label>floors</label><input id="floors" type="number" min="1" max="4" value="' + (b.floors || 1) + '"></div></div>' +
    '<label>sign</label><input id="sign" type="text" value="' + esc(b.sign || '') + '">' +
    '<div class="row"><div><label>wall</label><input id="wall" type="color" value="' + (b.wall || '#d5cab2') + '"></div>' +
    '<div><label>roof</label><input id="roof" type="color" value="' + (b.roof || '#6a4a2a') + '"></div></div>';
}
function shapeEditor(part) {
  const L = (part && part.shapes) || [];
  let h = '<label>shapes (' + L.length + ')</label><div class="shapes">';
  L.forEach((s, i) => {
    h += '<div class="sh"><b>' + esc(s.t) + '</b><input data-i="' + i + '" data-f="c" type="color" value="' + hexOf(s.c) + '"><button class="btn" data-del="' + i + '">×</button></div>';
  });
  h += '</div><button class="btn" id="addbox">Add box</button><button class="btn" id="addtorus">Add ring</button><button class="btn" id="addsphere">Add gem</button>';
  return h;
}
function opts(list, cur) { return list.map(v => '<option' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(v) + '</option>').join(''); }
function unique(a) { return [...new Set(a.filter(Boolean))]; }
function firstColor(part) {
  const it = part && part.items; if (it && typeof it === 'object') { const v = Object.values(it)[0]; if (typeof v === 'string' && v[0] === '#') return v; }
  const s = (part && part.shapes || []).find(x => typeof x.c === 'string' && x.c[0] === '#');
  return s ? s.c : '#d9a930';
}
function hexOf(c) { return (typeof c === 'string' && c[0] === '#') ? c.slice(0, 7) : '#c8a040'; }

function bindForm() {
  const d = state.design;
  const g = id => $(id);
  const sync = () => {
    d.id = (g('id').value || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, 'a');
    d.name = g('name').value.trim();
    d.note = g('note').value;
    d.author = $('author').value.trim();
    if (state.cls.group === 'item') {
      const paint = g('paint').value;
      d.part.items = { [d.id]: paint };
      d.part.id = 'item.' + d.id;
      d.item.name = d.name;
      d.item.weight = +g('weight').value || 10;
      d.item.value = +g('value').value || 0;
      d.item.attributes = [{ trait_type: g('trait').value, value: +g('traitv').value || 0 }];
      if (g('paint')) applyPaint(d.part, paint);
    }
    if (state.cls.group === 'npc') {
      d.part.id = 'char.' + d.id;
      d.part.name = d.name;
      if (d.part.body === 'beast') {
        d.part.beast = d.part.beast || {};
        d.part.beast.color = g('coat').value;
        d.part.beast.snout = g('snout').value;
        d.part.beast.size = +g('size').value || 1;
        d.part.beast.mane = g('mane').checked;
      } else {
        const o = d.part.outfit || (d.part.outfit = {});
        o.skin = g('skin').value; o.hair = g('hair').value; o.hairColor = g('hairColor').value;
        o.beard = g('beard').value || null; o.beardColor = o.hairColor;
        o.shirt = o.shirt || { style: 'tunic' }; o.shirt.color = g('shirt').value;
        d.part.build = g('build').value;
      }
    }
    if (state.cls.group === 'building') {
      d.building.w = +g('bw').value; d.building.h = +g('bh').value; d.building.floors = +g('floors').value;
      d.building.sign = g('sign').value; d.building.wall = g('wall').value; d.building.roof = g('roof').value;
    }
    preview();
  };
  sideListen(sync);
  $('form').querySelectorAll('#swatch i').forEach(i => i.onclick = () => { g('paint').value = i.dataset.c; sync(); });
  $('form').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { d.part.shapes.splice(+b.dataset.del, 1); drawForm(); preview(); });
  $('form').querySelectorAll('input[data-f=c]').forEach(inp => inp.oninput = () => { d.part.shapes[+inp.dataset.i].c = inp.value; preview(); });
  const add = (sh) => { d.part.shapes = d.part.shapes || []; d.part.shapes.push(sh); drawForm(); preview(); };
  if (g('addbox')) g('addbox').onclick = () => add({ t: 'box', s: [0.08, 0.08, 0.08], c: '#c8a040', p: [0.08, 0.04, 0] });
  if (g('addtorus')) g('addtorus').onclick = () => add({ t: 'torus', s: [0.05, 0.01], c: '#d9a930', p: [0, 0.05, 0], seg: [6, 14] });
  if (g('addsphere')) g('addsphere').onclick = () => add({ t: 'sphere', s: [0.025], c: '#3a8aaa', p: [0, 0.08, 0], seg: [8, 6], glow: true });
  g('save').onclick = saveDraft;
  g('suggest').onclick = suggestGh;
  setupDrop();
}
function sideListen(sync) {
  $('form').querySelectorAll('input, textarea, select').forEach(el => {
    if (el.type === 'file') return;
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  });
}
function applyPaint(part, paint) {
  if (!part.items || typeof part.items !== 'object') part.items = {};
  const id = Object.keys(part.items)[0] || state.design.id;
  part.items[id] = paint;
  for (const s of part.shapes || []) if (s.c === '$c' || (typeof s.c === 'string' && s.c[0] === '#' && s === (part.shapes || [])[0])) s.c = s.c === '$c' ? '$c' : s.c;
}

function setupDrop() {
  const drop = $('drop'), file = $('import');
  $('pickf').onclick = e => { e.preventDefault(); file.click(); };
  file.onchange = () => { if (file.files[0]) ingestFile(file.files[0]); };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('hot'); };
  drop.ondragleave = () => drop.classList.remove('hot');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('hot'); if (e.dataTransfer.files[0]) ingestFile(e.dataTransfer.files[0]); };
}

async function ingestFile(f) {
  try {
    if (/\.json$/i.test(f.name)) {
      const text = await f.text();
      const r = await (await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, text }) })).json();
      if (!r.ok) throw new Error(r.error);
      state.design.part = r.part;
      if (r.part.kind === 'char') {
        state.design.class = r.part.body === 'beast' ? ('npc:' + (r.part.id || '').replace(/^char\./, '')) : 'npc:human';
      }
      drawForm(); preview(); say('Imported ' + r.part.id, true);
    } else if (/^image\//.test(f.type)) {
      const cols = await colorsFromImage(f);
      state.pal = cols;
      if (state.cls.group === 'item' && cols[0]) {
        $('paint').value = cols[0];
        state.design.part.items = { [state.design.id]: cols[0] };
        (state.design.part.shapes || []).forEach((s, i) => { if (cols[i]) s.c = cols[i]; });
      }
      drawForm(); preview(); say('Took ' + cols.length + ' colours from the picture. The game itself stays untextured.', true);
    } else say('Use a part JSON or a PNG.', false);
  } catch (e) { say(e.message || String(e), false); }
}

function colorsFromImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
      const d = x.getImageData(0, 0, 32, 32).data, buckets = {};
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 80) continue;
        const hex = '#' + [d[i], d[i + 1], d[i + 2]].map(n => n.toString(16).padStart(2, '0')).join('');
        buckets[hex] = (buckets[hex] || 0) + 1;
      }
      res(Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]));
    };
    img.onerror = () => rej(new Error('could not read that picture'));
    img.src = URL.createObjectURL(file);
  });
}

function clearObj() {
  if (!state.obj) return;
  state.scene.remove(state.obj.object || state.obj);
  if (state.obj.dispose) state.obj.dispose();
  state.obj = null;
}

function preview() {
  const d = state.design; if (!d || !state.M) return;
  clearObj();
  try {
    if (state.cls.group === 'item') {
      state.M.addPart(d.part);
      const g = state.M.item(Object.keys(d.part.items || { [d.id]: 1 })[0] || d.id);
      g.position.set(0, 0, 0); state.scene.add(g); state.obj = g; state.lookY = 0.35;
      if (state.orbit) state.orbit.dist = 3.2;
      $('hint').textContent = d.name + ' · jewellery sits in the hand / on the ground as loot';
    } else if (state.cls.group === 'npc') {
      state.M.addPart(d.part);
      const key = (d.part.id || '').replace(/^char\./, '');
      const H = d.part.role === 'npc' && d.part.body !== 'beast' ? state.M.npc(key) : state.M.monster(key);
      H.object.position.set(0, 0, 0); state.scene.add(H.object); state.obj = H; state.lookY = 0.9;
      if (state.orbit) state.orbit.dist = 5;
      if (H.play) H.play('idle');
      $('hint').textContent = d.name + ' · drag to turn';
    } else {
      const g = buildingMesh(d.building); state.scene.add(g); state.obj = g; state.lookY = 2.4;
      if (state.orbit) state.orbit.dist = Math.max(14, (d.building.w || 6) + (d.building.h || 5) + 4);
      $('hint').textContent = (d.building.sign || d.name) + ' · ' + d.building.w + '×' + d.building.h;
    }
  } catch (e) { say(e.message || String(e), false); }
}

function buildingMesh(b) {
  const g = new THREE.Group();
  const w = b.w || 6, h = dSafe(b.h, 5), fl = Math.max(1, b.floors || 1);
  const wall = new THREE.Color(b.wall || '#d5cab2'), roofC = new THREE.Color(b.roof || '#6a4a2a');
  const box = (W, H, D, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshLambertMaterial({ color: c, flatShading: true })); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
  box(w, 0.12, h, 0x9a7046, 0, 0.06, 0);
  box(w, 2.2 * fl, 0.18, wall, 0, 1.1 * fl, h / 2);
  box(w, 2.2 * fl, 0.18, wall, 0, 1.1 * fl, -h / 2);
  box(0.18, 2.2 * fl, h, wall, w / 2, 1.1 * fl, 0);
  box(0.18, 2.2 * fl, h, wall, -w / 2, 1.1 * fl, 0);
  const rh = Math.max(1.2, h * 0.35);
  const shape = new THREE.Shape(); shape.moveTo(-h / 2 - 0.2, 0); shape.lineTo(h / 2 + 0.2, 0); shape.lineTo(0, rh);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.4, bevelEnabled: false }); geo.rotateY(Math.PI / 2);
  const roof = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: roofC, flatShading: true }));
  roof.position.set(-(w + 0.4) / 2, 2.2 * fl, 0); roof.castShadow = true; g.add(roof);
  if (b.k === 'church') {
    box(1.4, rh + 1.4, 1.4, wall, 0, 2.2 * fl + rh * 0.4, h / 2 - 0.7);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4), new THREE.MeshLambertMaterial({ color: roofC, flatShading: true }));
    sp.position.set(0, 2.2 * fl + rh + 2.0, h / 2 - 0.7); sp.rotation.y = Math.PI / 4; g.add(sp);
    box(0.08, 0.7, 0.08, 0xe8c050, 0, 2.2 * fl + rh + 3.3, h / 2 - 0.7);
    box(0.42, 0.08, 0.08, 0xe8c050, 0, 2.2 * fl + rh + 3.4, h / 2 - 0.7);
  }
  return g;
}
function dSafe(n, f) { n = +n; return n > 0 ? n : f; }

async function saveDraft() {
  const d = collect();
  try {
    const r = await (await fetch('/api/designs/' + d.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })).json();
    if (!r.ok) throw new Error(r.error);
    say('Saved draft ' + d.id + ' in studio/drafts/', true);
  } catch (e) { say(e.message || String(e), false); }
}

async function suggestGh() {
  const d = collect();
  $('suggest').disabled = true;
  say('Opening a suggestion PR against origin/main…', true);
  try {
    await fetch('/api/designs/' + d.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    const r = await (await fetch('/api/suggest/' + d.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })).json();
    if (!r.ok) throw new Error(r.error);
    say('Suggestion opened: ' + r.url, true);
    $('foot').textContent = r.url;
  } catch (e) { say(e.message || String(e), false); }
  $('suggest').disabled = false;
}

function collect() {
  const d = state.design;
  d.author = $('author').value.trim();
  if (state.cls && state.cls.needs) d.needs = state.cls.needs;
  return d;
}
function say(t, ok) { const el = $('out'); if (!el) return; el.textContent = t; el.className = 'msg ' + (ok ? 'ok' : 'bad'); }

boot().catch(e => { $('hint').textContent = String(e && e.message || e); });
