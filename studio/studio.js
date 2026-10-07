/* ASHVALE design studio: remix the game's own parts in the browser, save a draft, open a GitHub suggestion. */
import * as THREE from '/vendor/three.module.min.js';
import { createModels } from '/src/models.js';

const $ = id => document.getElementById(id);
const state = { catalog: null, cls: null, design: null, parts: {}, M: null, scene: null, cam: null, renderer: null, obj: null, pal: [], shapeI: 0, shapeMeshes: [] };
const KINDS = ['box', 'cyl', 'cone', 'sphere', 'ico', 'torus', 'disc', 'capsule'];

function num(v, d) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) { const n = parseFloat(v); if (Number.isFinite(n)) return n; }
  return d;
}
function vec3(a, d) { a = a || d; return [num(a[0], d[0]), num(a[1], d[1]), num(a[2], d[2])]; }
function deg(r) { return Math.round((r || 0) * 180 / Math.PI * 10) / 10; }
function rad(d) { return (+d || 0) * Math.PI / 180; }
function sizeLabels(t) {
  if (t === 'sphere' || t === 'ico' || t === 'disc') return ['radius'];
  if (t === 'cone') return ['radius', 'height'];
  if (t === 'torus') return ['ring', 'tube'];
  if (t === 'capsule') return ['radius', 'length'];
  if (t === 'cyl') return ['top', 'bottom', 'height'];
  return ['width', 'height', 'depth'];
}
function defaultShape(t) {
  const c = '#c8a040';
  if (t === 'cyl') return { t, s: [0.03, 0.03, 0.1], c, p: [0, 0.05, 0], r: [0, 0, 0], seg: 7 };
  if (t === 'cone') return { t, s: [0.04, 0.08], c, p: [0, 0.04, 0], r: [0, 0, 0], seg: 6 };
  if (t === 'sphere') return { t, s: [0.04], c, p: [0, 0.04, 0], r: [0, 0, 0], seg: [8, 6] };
  if (t === 'ico') return { t, s: [0.05], c, p: [0, 0.05, 0], r: [0, 0, 0] };
  if (t === 'torus') return { t, s: [0.05, 0.012], c, p: [0, 0.02, 0], r: [1.5708, 0, 0], seg: [6, 14] };
  if (t === 'disc') return { t, s: [0.05], c, p: [0, 0.01, 0], r: [-1.5708, 0, 0], ds: true };
  if (t === 'capsule') return { t, s: [0.03, 0.08], c, p: [0, 0.05, 0], r: [0, 0, 0] };
  return { t: 'box', s: [0.08, 0.08, 0.08], c, p: [0, 0.04, 0], r: [0, 0, 0] };
}
function bakeVec(a, d) { return vec3(a, d); }
function cloneShape(s, dx) {
  const o = JSON.parse(JSON.stringify(s || defaultShape('box')));
  delete o.if;
  o.p = bakeVec(o.p, [0, 0, 0]); o.r = bakeVec(o.r, [0, 0, 0]);
  const n = sizeLabels(o.t || 'box').length, src = Array.isArray(o.s) ? o.s : [];
  o.s = [];
  for (let k = 0; k < n; k++) o.s[k] = num(src[k], 0.05);
  if (dx) o.p[0] += dx;
  return o;
}
function tagShapeMeshes(g) {
  const inner = g && g.children && g.children[0];
  const kids = inner && inner.children ? inner.children : [];
  kids.forEach((o, i) => { o.userData.shapeI = i; });
  state.shapeMeshes = kids;
  highlightSel();
}

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
  const drag = { on: false, x: 0, y: 0, yaw: 0.4, pitch: 0.35, dist: 5, moved: false };
  state.orbit = drag;
  state.ray = new THREE.Raycaster();
  state.ptr = new THREE.Vector2();
  host.addEventListener('pointerdown', e => { drag.on = true; drag.moved = false; drag.x = e.clientX; drag.y = e.clientY; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointerup', e => {
    if (drag.on && !drag.moved) pickShapeAt(e);
    drag.on = false;
  });
  host.addEventListener('pointermove', e => {
    if (!drag.on) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3) drag.moved = true;
    drag.x = e.clientX; drag.y = e.clientY;
    const sh = selectedShape();
    if (sh && e.shiftKey) {   /* artists slide a piece in the view */
      sh.p = bakeVec(sh.p, [0, 0, 0]);
      sh.p[0] += dx * 0.0025; sh.p[1] -= dy * 0.0025;
      applyLive(); fillShapeFields(); return;
    }
    if (sh && e.altKey) {   /* Alt-drag turns the selected piece */
      sh.r = bakeVec(sh.r, [0, 0, 0]);
      sh.r[1] += dx * 0.012; sh.r[0] += dy * 0.012;
      applyLive(); fillShapeFields(); return;
    }
    drag.yaw -= dx * 0.008; drag.pitch = Math.max(0.08, Math.min(1.3, drag.pitch + dy * 0.006));
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
  state.shapeI = 0;
  if (state.orbit) state.orbit.locked = false;
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
function selectedShape() {
  const L = (state.design && state.design.part && state.design.part.shapes) || [];
  if (!L.length) return null;
  if (state.shapeI < 0 || state.shapeI >= L.length) state.shapeI = 0;
  return L[state.shapeI];
}
function shapeEditor(part) {
  const L = (part && part.shapes) || [];
  if (L.length && (state.shapeI < 0 || state.shapeI >= L.length)) state.shapeI = 0;
  let h = '<label>shapes (' + L.length + ') — click a row or the preview to select. Shift-drag moves it, Alt-drag turns it.</label><div class="shapes">';
  L.forEach((s, i) => {
    const on = i === state.shapeI;
    h += '<div class="sh' + (on ? ' on' : '') + '" data-sel="' + i + '">';
    h += '<div class="hd"><select data-i="' + i + '" data-f="t">' + KINDS.map(k => '<option' + (s.t === k ? ' selected' : '') + '>' + k + '</option>').join('') + '</select>';
    h += '<input data-i="' + i + '" data-f="c" type="color" value="' + hexOf(s.c) + '" title="colour">';
    h += '<button class="ico" data-dup="' + i + '" title="duplicate">⧉</button>';
    h += '<button class="ico" data-up="' + i + '" title="earlier">↑</button>';
    h += '<button class="ico" data-dn="' + i + '" title="later">↓</button>';
    h += '<button class="ico" data-del="' + i + '" title="remove">×</button></div>';
    if (on) h += shapeFields(s, i);
    h += '</div>';
  });
  h += '</div>';
  h += '<div class="addrow">';
  for (const t of KINDS) h += '<button class="btn" data-add="' + t + '">+ ' + t + '</button>';
  h += '</div>';
  const lib = Object.values(state.parts).filter(p => p.kind === 'item' || p.kind === 'gear').sort((a, b) => a.id.localeCompare(b.id));
  h += '<label>add shapes from an existing part</label><div class="row">';
  h += '<select id="borrow"><option value="">choose a part…</option>' + lib.map(p => '<option value="' + esc(p.id) + '">' + esc(p.id) + '</option>').join('') + '</select>';
  h += '<button class="btn" id="borrowAdd">Add those shapes</button></div>';
  return h;
}
function shapeFields(s, i) {
  const p = vec3(s.p, [0, 0, 0]), r = vec3(s.r, [0, 0, 0]), labs = sizeLabels(s.t || 'box');
  const sdef = labs.map(() => 0.08);
  const sz = vec3(s.s, sdef);
  let h = '<div class="tri">';
  h += xyz('p', i, ['x', 'y', 'z'], p, 0.005);
  h += xyz('s', i, labs, sz, 0.005);
  h += xyzDeg('r', i, r);
  h += '</div>';
  return h;
}
function xyz(f, i, labs, vals, step) {
  let h = '';
  labs.forEach((lab, k) => {
    h += '<div><label>' + lab + '</label><input data-i="' + i + '" data-f="' + f + '" data-k="' + k + '" type="number" step="' + step + '" value="' + (+vals[k] || 0) + '"></div>';
  });
  return h;
}
function xyzDeg(f, i, r) {
  return ['rot x°', 'rot y°', 'rot z°'].map((lab, k) =>
    '<div><label>' + lab + '</label><input data-i="' + i + '" data-f="' + f + '" data-k="' + k + '" data-deg="1" type="number" step="5" value="' + deg(r[k]) + '"></div>'
  ).join('');
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
  bindShapes();
  g('save').onclick = saveDraft;
  g('suggest').onclick = suggestGh;
  setupDrop();
}
function bindShapes() {
  const d = state.design;
  if (!d.part) return;
  const shapes = () => (d.part.shapes = d.part.shapes || []);
  $('form').querySelectorAll('[data-sel]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button, input, select')) return;
      state.shapeI = +row.dataset.sel; drawForm(); preview();
    });
  });
  $('form').querySelectorAll('[data-del]').forEach(b => b.onclick = ev => { ev.stopPropagation(); shapes().splice(+b.dataset.del, 1); state.shapeI = Math.max(0, shapes().length - 1); drawForm(); preview(); });
  $('form').querySelectorAll('[data-dup]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const i = +b.dataset.dup, L = shapes();
    L.splice(i + 1, 0, cloneShape(L[i], 0.04));
    state.shapeI = i + 1; drawForm(); preview();
  });
  $('form').querySelectorAll('[data-up]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const i = +b.dataset.up, L = shapes();
    if (i < 1) return;
    [L[i - 1], L[i]] = [L[i], L[i - 1]]; state.shapeI = i - 1; drawForm(); preview();
  });
  $('form').querySelectorAll('[data-dn]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const i = +b.dataset.dn, L = shapes();
    if (i >= L.length - 1) return;
    [L[i], L[i + 1]] = [L[i + 1], L[i]]; state.shapeI = i + 1; drawForm(); preview();
  });
  $('form').querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const L = shapes(); L.push(defaultShape(b.dataset.add)); state.shapeI = L.length - 1; drawForm(); preview();
  });
  const borrowBtn = $('borrowAdd');
  if (borrowBtn) borrowBtn.onclick = () => {
    const id = $('borrow').value; if (!id || !state.parts[id]) return;
    const extra = (state.parts[id].shapes || []).map(s => cloneShape(s, shapes().length ? 0.1 : 0));
    if (!extra.length) { say('That part has no shapes to copy.', false); return; }
    shapes().push(...extra); state.shapeI = shapes().length - extra.length; drawForm(); preview();
    say('Added ' + extra.length + ' shapes from ' + id + '. Reorient them, then suggest.', true);
  };
  $('form').querySelectorAll('.shapes [data-f]').forEach(el => {
    if (el.dataset.f === 't') { el.addEventListener('change', () => writeShapeField(el, true)); return; }
    el.addEventListener('input', () => writeShapeField(el));
  });
}
function writeShapeField(el, rebuild) {
  const L = (state.design.part && state.design.part.shapes) || [];
  const s = L[+el.dataset.i]; if (!s) return;
  const f = el.dataset.f, k = el.dataset.k != null ? +el.dataset.k : null;
  if (f === 't') { const neu = defaultShape(el.value); neu.c = s.c || neu.c; neu.p = bakeVec(s.p, neu.p); L[+el.dataset.i] = neu; state.shapeI = +el.dataset.i; drawForm(); preview(); return; }
  if (f === 'c') { s.c = el.value; preview(); return; }
  if (f === 'p' || f === 's' || f === 'r') {
    const n = f === 's' ? Math.max(1, sizeLabels(s.t || 'box').length) : 3;
    const def = f === 'r' ? [0, 0, 0] : f === 'p' ? [0, 0, 0] : [0.08, 0.08, 0.08];
    const cur = vec3(s[f], def);
    cur.length = n; cur[k] = el.dataset.deg ? rad(el.value) : +el.value;
    s[f] = cur;
    if (rebuild) { drawForm(); preview(); } else applyLive();
  }
}
function fillShapeFields() {
  const s = selectedShape(); if (!s || !$('form')) return;
  $('form').querySelectorAll('.shapes .on [data-k]').forEach(el => {
    const f = el.dataset.f, k = +el.dataset.k;
    const cur = vec3(s[f], f === 'r' || f === 'p' ? [0, 0, 0] : [0.08, 0.08, 0.08]);
    const v = el.dataset.deg ? deg(cur[k]) : cur[k];
    if (document.activeElement !== el) el.value = v;
  });
}
function applyLive() {
  const s = selectedShape(), o = state.shapeMeshes && state.shapeMeshes[state.shapeI];
  if (!s) return;
  if (!o) { preview(); return; }
  const p = vec3(s.p, [0, 0, 0]), r = vec3(s.r, [0, 0, 0]);
  o.position.set(p[0], p[1], p[2]);
  o.rotation.set(r[0], r[1], r[2]);
  highlightSel();
}
function pickShapeAt(e) {
  if (!state.cam || !state.shapeMeshes || !state.shapeMeshes.length) return;
  const host = $('stage'), rect = host.getBoundingClientRect();
  state.ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  state.ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  state.ray.setFromCamera(state.ptr, state.cam);
  const hits = state.ray.intersectObjects(state.shapeMeshes, true);
  if (!hits.length) return;
  let o = hits[0].object;
  while (o && o.userData.shapeI == null) o = o.parent;
  if (!o) return;
  state.shapeI = o.userData.shapeI;
  drawForm(); highlightSel();
}
function highlightSel() {
  const i = state.shapeI;
  for (const o of state.shapeMeshes || []) {
    o.traverse(m => {
      if (!m.isMesh || !m.material) return;
      const mats = [].concat(m.material);
      for (const mat of mats) {
        if (!mat.emissive) continue;
        const on = o.userData.shapeI === i;
        mat.emissive.setHex(on ? 0x885510 : 0x000000);
        if (!m.userData.keepGlow) mat.emissiveIntensity = on ? 0.55 : 0;
      }
    });
  }
}
function sideListen(sync) {
  $('form').querySelectorAll('input, textarea, select').forEach(el => {
    if (el.type === 'file' || el.closest('.shapes')) return;
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
      if (state.orbit && !state.orbit.locked) { state.orbit.dist = 3.2; state.orbit.locked = true; }
      tagShapeMeshes(g);
      $('hint').textContent = d.name + ' · click a piece, Shift-drag to move, Alt-drag to turn';
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
