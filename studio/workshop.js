/* ASHVALE Workshop: anyone designs anything (a 3D object made of the game's own flat-shaded shapes, plus what it is,
   its properties and a message) and sends it to @ashvale. The shapes are the exact part format of data/parts/*.json and
   are drawn the same way src/models.js draws them (Lambert, flat shading), so what you see is what the game shows.
   Drafts live in this browser (localStorage). Sending is a later step: a paid message (GOLD to the @ashvale Bank). */
import * as THREE from '/vendor/three.module.min.js';
import { OrbitControls } from '/studio/vendor/OrbitControls.js';
import { TransformControls } from '/studio/vendor/TransformControls.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r3 = v => Math.round(v * 1000) / 1000;
const deg = r => Math.round((r || 0) * 1800 / Math.PI) / 10;
const rad = d => (+d || 0) * Math.PI / 180;
const MAX_SHAPES = 80, PRICE_GOLD = 10000;
const SHAPE_TYPES = [['box', 'Box'], ['cyl', 'Cylinder'], ['cone', 'Cone'], ['sphere', 'Sphere'], ['ico', 'Gem'], ['capsule', 'Capsule'], ['torus', 'Ring'], ['disc', 'Disc']];
const KINDS = ['Weapon', 'Armour', 'Jewellery', 'Tool', 'Potion or food', 'Furniture', 'Building', 'Creature', 'Character', 'Boat or vehicle', 'Plant', 'Magic thing', 'Decoration', 'Something else'];
const PROP_HINTS = {
  Weapon: ['damage', 'speed', 'reach', 'level needed', 'special attack'],
  Armour: ['defence', 'slot', 'weight', 'level needed', 'set bonus'],
  Jewellery: ['effect', 'charges', 'slot', 'how it is made'],
  Tool: ['skill', 'level needed', 'what it gathers', 'speed'],
  'Potion or food': ['heals', 'effect', 'duration', 'ingredients'],
  Furniture: ['where it goes', 'what it does', 'made from'],
  Building: ['size in tiles', 'who lives or works here', 'what you can do inside'],
  Creature: ['level', 'health', 'attack', 'drops', 'where it lives', 'behaviour'],
  Character: ['role', 'where they stand', 'quest', 'what they say'],
  'Boat or vehicle': ['speed', 'passengers', 'where it can go'],
  Plant: ['where it grows', 'season', 'harvest', 'skill'],
  'Magic thing': ['power', 'cost', 'cooldown', 'side effect'],
};
const COMMON_PROPS = ['rarity', 'value (GOLD)', 'where found', 'lore', 'sound'];
const SWATCHES = ['#c8a040', '#d8d0bc', '#8a6a4a', '#6b4a2b', '#3a3430', '#1c1a1e', '#8a3030', '#c86a2a', '#4f6d3a', '#2f6a6a', '#3f5d8a', '#5b3a7a',
  '#a87a4a', '#cd7f32', '#b8b8c0', '#5a6a7a', '#e8e8f0', '#6ab0e8', '#e8d8a0', '#b03028', '#9fd8ff', '#f1c9a5', '#7c4f31', '#2a5a2a'];

const S = {
  d: null, sel: -1, meshes: [], twins: [], undo: [], redo: [], parts: [], scene: null, cam: null, ren: null, orbit: null, tc: null,
  root: null, twinRoot: null, selBox: null, person: null, grid: null, mode: 'translate', thumb: null,
};

/* ---------- design data ---------- */
function blankDesign() {
  return { ashvale3d: 'design', v: 1, id: 'design_' + Date.now().toString(36), name: '', kind: 'Something else', author: '', story: '', message: '',
    props: [], shapes: [defaultShape('box')] };
}
function defaultShape(t) {
  const c = '#c8a040';
  switch (t) {
    case 'cyl': return { t, s: [0.05, 0.05, 0.2], c, p: [0, 0.1, 0], seg: 8 };
    case 'cone': return { t, s: [0.06, 0.15], c, p: [0, 0.075, 0], seg: 6 };
    case 'sphere': return { t, s: [0.06], c, p: [0, 0.06, 0], seg: [10, 7] };
    case 'ico': return { t, s: [0.06], c, p: [0, 0.06, 0] };
    case 'capsule': return { t, s: [0.04, 0.12], c, p: [0, 0.1, 0] };
    case 'torus': return { t, s: [0.07, 0.015], c, p: [0, 0.015, 0], r: [1.5708, 0, 0], seg: [6, 16] };
    case 'disc': return { t, s: [0.08], c, p: [0, 0.002, 0], r: [-1.5708, 0, 0], seg: 12, ds: true };
    default: return { t: 'box', s: [0.12, 0.12, 0.12], c, p: [0, 0.06, 0] };
  }
}
function sizeLabels(t) {
  if (t === 'sphere' || t === 'ico' || t === 'disc') return ['radius'];
  if (t === 'cone') return ['radius', 'height'];
  if (t === 'torus') return ['ring', 'thickness'];
  if (t === 'capsule') return ['radius', 'length'];
  if (t === 'cyl') return ['top radius', 'bottom radius', 'height'];
  return ['width', 'height', 'depth'];
}
const vec = (a, d) => [0, 1, 2].map(i => (a && Number.isFinite(+a[i])) ? +a[i] : d[i]);

/* a game part's shape (may hold expressions like "$c" or "0.24*W") -> a plain workshop shape, or null if it can't be shown */
function plainShape(sh, colours) {
  if (!sh || !SHAPE_TYPES.some(([t]) => t === sh.t)) return null;
  const num = (v, d) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : d; };
  const o = { t: sh.t, s: (sh.s || []).map(v => num(v, 0.05)), p: (sh.p || [0, 0, 0]).map(v => num(v, 0)) };
  if (sh.r) o.r = sh.r.map(v => num(v, 0));
  if (sh.k) o.k = sh.k.map(v => num(v, 1));
  const c = typeof sh.c === 'string' ? sh.c : '';
  o.c = /^#[0-9a-f]{6}$/i.test(c.slice(0, 7)) ? c.slice(0, 7) : (colours[0] || '#c8a040');
  for (const k of ['seg', 'glow', 'op', 'ds', 'mirror', 'd', 'th', 'arc']) if (sh[k] != null && typeof sh[k] !== 'string') o[k] = sh[k];
  return o;
}

/* ---------- meshes, the same way models.js builds them ---------- */
function geoFor(sh) {
  const s = sh.s || [], seg = sh.seg;
  switch (sh.t) {
    case 'cyl': return new THREE.CylinderGeometry(s[0], s[1], s[2], seg || 7);
    case 'cone': return new THREE.ConeGeometry(s[0], s[1], seg || 6);
    case 'sphere': return new THREE.SphereGeometry(s[0], (seg || [10, 7])[0], (seg || [10, 7])[1], 0, Math.PI * 2, 0, Math.PI * (sh.th || 1));
    case 'ico': return new THREE.IcosahedronGeometry(s[0], sh.d || 0);
    case 'capsule': return new THREE.CapsuleGeometry(s[0], s[1], 2, 7);
    case 'torus': return new THREE.TorusGeometry(s[0], s[1], (seg || [4, 8])[0], (seg || [4, 8])[1], Math.PI * (sh.arc || 2));
    case 'disc': return new THREE.CircleGeometry(s[0], seg || 10);
    default: return new THREE.BoxGeometry(s[0], s[1], s[2]);
  }
}
function matFor(sh) {
  const ex = { color: sh.c, flatShading: true };
  if (sh.glow) { ex.emissive = sh.c; ex.emissiveIntensity = 0.6; }
  if (sh.op != null && sh.op < 1) { ex.transparent = true; ex.opacity = sh.op; }
  if (sh.ds) ex.side = THREE.DoubleSide;
  return new THREE.MeshLambertMaterial(ex);
}
function place(o, sh, flip) {
  const p = vec(sh.p, [0, 0, 0]), r = vec(sh.r, [0, 0, 0]), k = vec(sh.k, [1, 1, 1]);
  o.position.set(flip ? -p[0] : p[0], p[1], p[2]);
  o.rotation.set(r[0], flip ? -r[1] : r[1], flip ? -r[2] : r[2]);
  o.scale.set(k[0], k[1], k[2]);
}
function makeMesh(sh, flip) {
  const m = new THREE.Mesh(geoFor(sh), matFor(sh));
  m.castShadow = true; place(m, sh, flip); return m;
}
function dispose(o) { if (o) { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); } }
function rebuildAll() {
  S.tc.detach();
  for (const m of S.meshes) { S.root.remove(m); dispose(m); }
  for (const m of S.twins) { if (m) { S.twinRoot.remove(m); dispose(m); } }
  S.meshes = S.d.shapes.map((sh, i) => { const m = makeMesh(sh); m.userData.i = i; S.root.add(m); return m; });
  S.twins = S.d.shapes.map(sh => { if (!sh.mirror) return null; const m = makeMesh(sh, true); S.twinRoot.add(m); return m; });
  if (S.sel >= S.meshes.length) S.sel = S.meshes.length - 1;
  select(S.sel, true);
}
function rebuildOne(i) {
  const sh = S.d.shapes[i], old = S.meshes[i];
  const m = makeMesh(sh); m.userData.i = i; S.root.add(m); S.meshes[i] = m;
  if (old) { if (S.tc.object === old) S.tc.detach(); S.root.remove(old); dispose(old); }
  updateTwin(i);
  if (S.sel === i) S.tc.attach(m);
  updateSelBox();
}
function updateTwin(i) {
  const sh = S.d.shapes[i];
  if (S.twins[i]) { S.twinRoot.remove(S.twins[i]); dispose(S.twins[i]); S.twins[i] = null; }
  if (sh.mirror) { S.twins[i] = makeMesh(sh, true); S.twinRoot.add(S.twins[i]); }
}
/* the gizmo moved a mesh: copy its transform back into the shape data */
function syncFromMesh(i) {
  const m = S.meshes[i], sh = S.d.shapes[i];
  sh.p = m.position.toArray().map(r3);
  const r = [m.rotation.x, m.rotation.y, m.rotation.z].map(r3);
  if (r.some(v => v)) sh.r = r; else delete sh.r;
  const k = m.scale.toArray().map(v => r3(Math.max(0.01, v)));
  if (k.some(v => v !== 1)) sh.k = k; else delete sh.k;
  if (sh.mirror && S.twins[i]) place(S.twins[i], sh, true);
}

/* ---------- stage ---------- */
function setupStage() {
  const host = $('stage');
  const ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.shadowMap.enabled = true;
  host.appendChild(ren.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#1d1912');
  const cam = new THREE.PerspectiveCamera(40, 1, 0.005, 200); cam.position.set(0.5, 0.45, 0.8);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x403020, 0.9));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  S.grid = new THREE.GridHelper(2, 40, 0x6a5a3a, 0x3a3226); scene.add(S.grid);
  S.root = new THREE.Group(); S.twinRoot = new THREE.Group(); scene.add(S.root, S.twinRoot);
  S.selBox = new THREE.BoxHelper(undefined, 0xf0c860); S.selBox.visible = false; scene.add(S.selBox);
  S.person = personFigure(); S.person.visible = false; scene.add(S.person);

  const orbit = new OrbitControls(cam, ren.domElement); orbit.target.set(0, 0.08, 0); orbit.enableDamping = true; orbit.update();
  const tc = new TransformControls(cam, ren.domElement); tc.setSize(0.9); scene.add(tc);
  tc.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (!e.value) { commit(); drawShapeTab(); } });
  tc.addEventListener('objectChange', () => { if (S.sel >= 0) { syncFromMesh(S.sel); updateSelBox(); fillLive(); } });
  Object.assign(S, { scene, cam, ren, orbit, tc });
  applySnap();

  let down = null;
  ren.domElement.addEventListener('pointerdown', e => { down = tc.axis ? null : [e.clientX, e.clientY]; });
  ren.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const rect = ren.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), cam);
    const hit = ray.intersectObjects(S.meshes, false)[0];
    select(hit ? hit.object.userData.i : -1); drawShapeTab();
  });
  const fit = () => { const w = host.clientWidth, h = host.clientHeight; ren.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); };
  new ResizeObserver(fit).observe(host); fit();
  (function frame() { requestAnimationFrame(frame); orbit.update(); ren.render(scene, cam); })();
}
function personFigure() {   /* a 1.86 m stand-in (the game's human height) for judging size */
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: '#8a9ab0', transparent: true, opacity: 0.35, flatShading: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.0, 2, 8), m); body.position.y = 0.88; g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), m); head.position.y = 1.72; g.add(head);
  g.position.set(-0.6, 0, 0); return g;
}
function applySnap() {
  const on = $('snap').checked;
  S.tc.setTranslationSnap(on ? 0.005 : null); S.tc.setRotationSnap(on ? rad(15) : null); S.tc.setScaleSnap(on ? 0.05 : null);
}
function setMode(m) {
  S.mode = m; S.tc.setMode(m);
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
}
function select(i, quiet) {
  S.sel = i;
  if (i >= 0 && S.meshes[i]) S.tc.attach(S.meshes[i]); else { S.tc.detach(); S.sel = -1; }
  updateSelBox();
  if (!quiet) document.querySelectorAll('.shapeList div').forEach(el => el.classList.toggle('on', +el.dataset.i === S.sel));
}
function updateSelBox() {
  const m = S.meshes[S.sel];
  S.selBox.visible = !!m; if (m) S.selBox.setFromObject(m);
}
function frameView() {
  const box = new THREE.Box3().setFromObject(S.root).union(new THREE.Box3().setFromObject(S.twinRoot));
  if (S.person.visible) box.union(new THREE.Box3().setFromObject(S.person));
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
  const dir = S.cam.position.clone().sub(S.orbit.target).normalize();
  const dist = r / Math.sin(rad(S.cam.fov / 2)) * 1.1;
  S.orbit.target.copy(c); S.cam.position.copy(c).addScaledVector(dir, dist); S.orbit.update();
}

/* ---------- undo, save ---------- */
function snapshot() { return JSON.stringify(S.d); }
let lastSnap = null;
function commit() {
  const now = snapshot();
  if (now === lastSnap) return;
  if (lastSnap) S.undo.push(lastSnap);
  if (S.undo.length > 150) S.undo.shift();
  S.redo = []; lastSnap = now; save();
}
function restore(json) { S.d = JSON.parse(json); lastSnap = json; rebuildAll(); drawAll(); save(); }
function undo() { if (!S.undo.length) return; S.redo.push(lastSnap); restore(S.undo.pop()); }
function redo() { if (!S.redo.length) return; S.undo.push(lastSnap); restore(S.redo.pop()); }
function store() { try { return JSON.parse(localStorage.getItem('ash.workshop.drafts') || '{}'); } catch (e) { return {}; } }
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      const all = store(); S.d.updated = new Date().toISOString(); all[S.d.id] = S.d;
      localStorage.setItem('ash.workshop.drafts', JSON.stringify(all)); localStorage.setItem('ash.workshop.current', S.d.id);
    } catch (e) { /* private window: drafts just don't persist */ }
    drawDrafts();
  }, 300);
}
function drawDrafts() {
  const all = Object.values(store()).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  if (!all.some(d => d.id === S.d.id)) all.unshift(S.d);
  $('drafts').innerHTML = all.map(d => '<option value="' + esc(d.id) + '"' + (d.id === S.d.id ? ' selected' : '') + '>' + esc(d.name || 'Untitled') + '</option>').join('');
}
function load(d) { S.d = d; S.sel = d.shapes.length ? 0 : -1; S.undo = []; S.redo = []; lastSnap = snapshot(); rebuildAll(); drawAll(); frameView(); }
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1800); }

/* ---------- shape actions ---------- */
function addShape(t) {
  if (S.d.shapes.length >= MAX_SHAPES) return toast(MAX_SHAPES + ' shapes is the most one design can have');
  const sh = defaultShape(t), cur = S.d.shapes[S.sel];
  if (cur) { sh.c = cur.c; sh.p = [r3(cur.p[0] + 0.15), sh.p[1], cur.p[2]]; }
  S.d.shapes.push(sh); S.sel = S.d.shapes.length - 1; rebuildAll(); commit(); drawShapeTab();
}
function duplicate() {
  const cur = S.d.shapes[S.sel]; if (!cur) return;
  if (S.d.shapes.length >= MAX_SHAPES) return toast(MAX_SHAPES + ' shapes is the most one design can have');
  const c = JSON.parse(JSON.stringify(cur)); c.p = [r3(c.p[0] + 0.05), c.p[1], r3(c.p[2] + 0.05)];
  S.d.shapes.splice(S.sel + 1, 0, c); S.sel++; rebuildAll(); commit(); drawShapeTab();
}
function remove() {
  if (S.sel < 0) return;
  S.d.shapes.splice(S.sel, 1); S.sel = Math.min(S.sel, S.d.shapes.length - 1); rebuildAll(); commit(); drawShapeTab();
}

/* ---------- panels ---------- */
function drawAll() { drawShapeTab(); drawObjectTab(); drawSendTab(); drawDrafts(); }
function tab(name) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  for (const t of ['shape', 'object', 'send']) $('tab-' + t).hidden = t !== name;
  if (name === 'send') drawSendTab();
  if (name === 'object') drawObjectTab();
}
function drawShapeTab() {
  const d = S.d, sh = d.shapes[S.sel];
  let h = '<h3>Shapes (' + d.shapes.length + '/' + MAX_SHAPES + ')</h3><div class="shapeList">' +
    d.shapes.map((s, i) => '<div data-i="' + i + '"' + (i === S.sel ? ' class="on"' : '') + '><i style="background:' + esc(s.c) + '"></i>' +
      (SHAPE_TYPES.find(([t]) => t === s.t) || [0, s.t])[1] + ' ' + (i + 1) + (s.mirror ? ' ⇋' : '') + '</div>').join('') + '</div>';
  if (!sh) {
    h += '<p class="muted">Nothing selected. Add a shape from the bar above, or click one in the view.</p>';
  } else {
    const labs = sizeLabels(sh.t), p = vec(sh.p, [0, 0, 0]), r = vec(sh.r, [0, 0, 0]), k = vec(sh.k, [1, 1, 1]);
    h += '<h3>Size (metres)</h3><div class="row">' + labs.map((l, j) => '<div><label>' + l + '</label><input type="number" step="0.005" min="0.001" data-f="s" data-j="' + j + '" value="' + (sh.s[j] ?? 0.05) + '"></div>').join('') + '</div>' +
      '<h3>Position</h3><div class="row">' + ['x', 'y', 'z'].map((l, j) => '<div><label>' + l + '</label><input type="number" step="0.005" data-f="p" data-j="' + j + '" value="' + r3(p[j]) + '"></div>').join('') + '</div>' +
      '<h3>Turn (degrees)</h3><div class="row">' + ['x', 'y', 'z'].map((l, j) => '<div><label>' + l + '</label><input type="number" step="15" data-f="r" data-j="' + j + '" value="' + deg(r[j]) + '"></div>').join('') + '</div>' +
      '<h3>Stretch</h3><div class="row">' + ['x', 'y', 'z'].map((l, j) => '<div><label>' + l + '</label><input type="number" step="0.05" min="0.01" data-f="k" data-j="' + j + '" value="' + r3(k[j]) + '"></div>').join('') + '</div>' +
      '<h3>Colour</h3><div style="display:flex;gap:8px;align-items:center"><input type="color" id="shColor" value="' + esc(sh.c) + '"><span class="muted">' + esc(sh.c) + '</span></div>' +
      '<div class="swatches">' + SWATCHES.map(c => '<i data-c="' + c + '" style="background:' + c + '" title="' + c + '"></i>').join('') + '</div>' +
      '<h3>Look</h3>' +
      '<label class="chk"><input type="checkbox" id="shGlow"' + (sh.glow ? ' checked' : '') + '> Glows</label>' +
      '<label class="chk"><input type="checkbox" id="shMirror"' + (sh.mirror ? ' checked' : '') + '> Mirror to the other side (left/right copy)</label>' +
      '<label class="f">See-through: <span id="opv">' + Math.round((sh.op ?? 1) * 100) + '%</span></label><input type="range" id="shOp" min="15" max="100" value="' + Math.round((sh.op ?? 1) * 100) + '" style="width:100%">' +
      (['cyl', 'cone', 'disc'].includes(sh.t) ? '<label class="f">Sides: <span id="segv">' + (sh.seg || (sh.t === 'cone' ? 6 : sh.t === 'disc' ? 10 : 7)) + '</span></label><input type="range" id="shSeg" min="3" max="24" value="' + (sh.seg || (sh.t === 'cone' ? 6 : sh.t === 'disc' ? 10 : 7)) + '" style="width:100%">' : '') +
      (sh.t === 'ico' ? '<label class="f">Roundness</label><input type="range" id="shD" min="0" max="2" value="' + (sh.d || 0) + '" style="width:100%">' : '');
  }
  h += '<h3>Start from a game piece</h3><select id="remix" style="width:100%"><option value="">Add the shapes of an ASHVALE item…</option>' +
    S.parts.map(p => '<option>' + esc(p) + '</option>').join('') + '</select>';
  $('tab-shape').innerHTML = h;
  bindShapeTab();
}
function bindShapeTab() {
  const box = $('tab-shape');
  box.querySelectorAll('.shapeList div').forEach(el => el.onclick = () => { select(+el.dataset.i); drawShapeTab(); });
  box.querySelectorAll('input[data-f]').forEach(inp => inp.onchange = () => {
    const sh = S.d.shapes[S.sel], f = inp.dataset.f, j = +inp.dataset.j;
    let v = parseFloat(inp.value); if (!Number.isFinite(v)) return;
    if (f === 's') { sh.s[j] = Math.max(0.001, Math.min(4, v)); }
    else if (f === 'r') { sh.r = vec(sh.r, [0, 0, 0]); sh.r[j] = r3(rad(v)); }
    else if (f === 'k') { sh.k = vec(sh.k, [1, 1, 1]); sh.k[j] = Math.max(0.01, v); }
    else { sh.p = vec(sh.p, [0, 0, 0]); sh.p[j] = Math.max(-4, Math.min(4, v)); }
    rebuildOne(S.sel); commit();
  });
  const sh = S.d.shapes[S.sel];
  if (sh) {
    const recolour = c => { sh.c = c; rebuildOne(S.sel); commit(); drawShapeTab(); };
    $('shColor').onchange = e => recolour(e.target.value);
    box.querySelectorAll('.swatches i').forEach(el => el.onclick = () => recolour(el.dataset.c));
    $('shGlow').onchange = e => { if (e.target.checked) sh.glow = true; else delete sh.glow; rebuildOne(S.sel); commit(); };
    $('shMirror').onchange = e => { if (e.target.checked) sh.mirror = true; else delete sh.mirror; rebuildOne(S.sel); commit(); drawShapeTab(); };
    $('shOp').oninput = e => { const v = +e.target.value / 100; $('opv').textContent = e.target.value + '%'; if (v >= 1) delete sh.op; else sh.op = v; rebuildOne(S.sel); };
    $('shOp').onchange = commit;
    if ($('shSeg')) { $('shSeg').oninput = e => { sh.seg = +e.target.value; $('segv').textContent = sh.seg; rebuildOne(S.sel); }; $('shSeg').onchange = commit; }
    if ($('shD')) $('shD').onchange = e => { sh.d = +e.target.value; if (!sh.d) delete sh.d; rebuildOne(S.sel); commit(); };
  }
  $('remix').onchange = e => remix(e.target.value);
}
function fillLive() {   /* gizmo drag: refresh the number fields without rebuilding the panel */
  const sh = S.d.shapes[S.sel]; if (!sh) return;
  const p = vec(sh.p, [0, 0, 0]), r = vec(sh.r, [0, 0, 0]), k = vec(sh.k, [1, 1, 1]);
  $('tab-shape').querySelectorAll('input[data-f]').forEach(inp => {
    const j = +inp.dataset.j;
    if (inp.dataset.f === 'p') inp.value = r3(p[j]); else if (inp.dataset.f === 'r') inp.value = deg(r[j]); else if (inp.dataset.f === 'k') inp.value = r3(k[j]);
  });
}
async function remix(id) {
  if (!id) return;
  try {
    let j = await (await fetch('/data/parts/' + id + '.json')).json();
    if (j.ashvale3d === 'module' && j.data) j = j.data;
    const colours = Object.values(j.items && typeof j.items === 'object' ? j.items : {}).filter(c => typeof c === 'string');
    if (j.color) colours.unshift(j.color);
    const src = j.groundShapes || j.shapes || [];
    const flat = [];
    (function walk(list) { for (const sh of list || []) { if (sh.t === 'group') walk(sh.children); else flat.push(sh); } })(src);
    const add = flat.map(sh => plainShape(sh, colours)).filter(Boolean).slice(0, MAX_SHAPES - S.d.shapes.length);
    if (!add.length) return toast('That piece has no shapes the workshop can use');
    S.d.shapes.push(...add); S.sel = S.d.shapes.length - 1; rebuildAll(); commit(); drawShapeTab(); frameView();
    toast('Added ' + add.length + ' shapes from ' + id + (add.length < flat.length ? ' (some skipped)' : ''));
  } catch (e) { toast('Could not load ' + id); }
}

function drawObjectTab() {
  const d = S.d, hints = (PROP_HINTS[d.kind] || []).concat(COMMON_PROPS).filter(h => !d.props.some(p => p.k === h));
  const box = new THREE.Box3().setFromObject(S.root).union(new THREE.Box3().setFromObject(S.twinRoot));
  const sz = box.isEmpty() ? [0, 0, 0] : box.getSize(new THREE.Vector3()).toArray();
  $('tab-object').innerHTML =
    '<h3>What is it?</h3>' +
    '<label class="f">Name</label><input id="oName" type="text" maxlength="60" style="width:100%" placeholder="e.g. Lantern of the Drowned Bell" value="' + esc(d.name) + '">' +
    '<label class="f">Kind</label><select id="oKind" style="width:100%">' + KINDS.map(k => '<option' + (k === d.kind ? ' selected' : '') + '>' + k + '</option>').join('') + '</select>' +
    '<p class="muted">Size: ' + sz.map(v => v.toFixed(2)).join(' × ') + ' m (wide × tall × deep). A person is 1.86 m.</p>' +
    '<h3>Properties</h3><div class="props">' + d.props.map((p, i) =>
      '<div class="prop"><input data-pk="' + i + '" type="text" maxlength="40" value="' + esc(p.k) + '" placeholder="property"><input data-pv="' + i + '" type="text" maxlength="200" value="' + esc(p.v) + '" placeholder="value"><button data-px="' + i + '" title="Remove">×</button></div>').join('') + '</div>' +
    '<div class="chips">' + hints.map(h => '<button data-hint="' + esc(h) + '">+ ' + esc(h) + '</button>').join('') + '<button data-hint="">+ your own</button></div>' +
    '<h3>Its story</h3><textarea id="oStory" rows="5" maxlength="1500" placeholder="Where does it come from? What does it do? Anything you dream of.">' + esc(d.story) + '</textarea>' +
    '<label class="f">Your name or @handle</label><input id="oAuthor" type="text" maxlength="40" style="width:100%" value="' + esc(d.author) + '">';
  const t = $('tab-object');
  $('oName').oninput = e => { d.name = e.target.value; save(); };
  $('oName').onchange = () => { commit(); drawDrafts(); };
  $('oKind').onchange = e => { d.kind = e.target.value; commit(); drawObjectTab(); };
  $('oStory').oninput = e => { d.story = e.target.value; save(); };
  $('oStory').onchange = commit;
  $('oAuthor').oninput = e => { d.author = e.target.value; save(); };
  $('oAuthor').onchange = commit;
  t.querySelectorAll('[data-pk]').forEach(el => { el.oninput = () => { d.props[+el.dataset.pk].k = el.value; save(); }; el.onchange = commit; });
  t.querySelectorAll('[data-pv]').forEach(el => { el.oninput = () => { d.props[+el.dataset.pv].v = el.value; save(); }; el.onchange = commit; });
  t.querySelectorAll('[data-px]').forEach(el => el.onclick = () => { d.props.splice(+el.dataset.px, 1); commit(); drawObjectTab(); });
  t.querySelectorAll('[data-hint]').forEach(el => el.onclick = () => {
    if (d.props.length >= 24) return toast('24 properties is plenty');
    d.props.push({ k: el.dataset.hint, v: '' }); commit(); drawObjectTab();
    const ins = t.querySelectorAll(el.dataset.hint ? '[data-pv]' : '[data-pk]'); ins[ins.length - 1].focus();
  });
}

/* ---------- the message to @ashvale ---------- */
function slug(s) { return (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'design').slice(0, 40).replace(/^([^a-z])/, 'd_$1'); }
function payload() {
  const d = S.d, id = slug(d.name), main = (d.shapes[0] || {}).c || '#c8a040';
  const props = {}; for (const p of d.props) if (p.k.trim()) props[p.k.trim()] = p.v.trim();
  return {
    ashvale3d: 'design', v: 1, name: d.name.trim(), kind: d.kind, author: d.author.trim(), props, story: d.story.trim(), message: d.message.trim(),
    part: { ashvale3d: 'part', api: 1, v: 1, id: 'item.' + id, kind: 'item', items: { [id]: main }, shapes: d.shapes },
  };
}
function takeThumb() {
  const keep = [S.grid.visible, S.person.visible, S.selBox.visible, S.tc.visible];
  S.grid.visible = S.person.visible = S.selBox.visible = false; S.tc.visible = false;
  const was = { pos: S.cam.position.clone(), tgt: S.orbit.target.clone() };
  const pv = S.person.visible; frameView();
  S.ren.render(S.scene, S.cam);
  const src = S.ren.domElement, cv = document.createElement('canvas'); cv.width = cv.height = 160;
  const side = Math.min(src.width, src.height), x = cv.getContext('2d');
  x.fillStyle = '#1d1912'; x.fillRect(0, 0, 160, 160);
  x.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, 160, 160);
  S.thumb = cv.toDataURL('image/webp', 0.8); if (!S.thumb.startsWith('data:image/webp')) S.thumb = cv.toDataURL('image/png');
  [S.grid.visible, , S.selBox.visible, S.tc.visible] = keep; S.person.visible = pv && keep[1];
  S.cam.position.copy(was.pos); S.orbit.target.copy(was.tgt); S.orbit.update();
}
function bytes(s) { return new TextEncoder().encode(s).length; }
function drawSendTab() {
  const d = S.d, j = JSON.stringify(payload()), thumbB = S.thumb ? Math.round((S.thumb.length - S.thumb.indexOf(',') - 1) * 3 / 4) : 0;
  const missing = [!d.name.trim() && 'a name', !d.message.trim() && 'a message'].filter(Boolean);
  $('tab-send').innerHTML =
    '<h3>Message to @ashvale</h3><textarea id="sMsg" rows="6" maxlength="1000" placeholder="Tell the makers of ASHVALE about your design: why it belongs in the world, how it should work, where it should be found.">' + esc(d.message) + '</textarea>' +
    '<div class="muted" id="sCount">' + d.message.length + '/1000</div>' +
    '<h3>Picture</h3><div style="display:flex;gap:10px;align-items:flex-end">' + (S.thumb ? '<img id="thumb" src="' + S.thumb + '">' : '<div id="thumb"></div>') +
    '<button id="sShot">' + (S.thumb ? 'Retake' : 'Take picture') + '</button></div>' +
    '<div class="card"><div class="muted">Sending costs</div><div class="big">' + PRICE_GOLD.toLocaleString() + ' GOLD</div>' +
    '<div class="muted">paid to the @ashvale Bank; the design goes with the payment\'s receipt</div>' +
    '<ol class="steps"><li>Your design and message are packed (' + (bytes(j) / 1024).toFixed(1) + ' KB' + (thumbB ? ' + ' + (thumbB / 1024).toFixed(1) + ' KB picture' : '') + ').</li>' +
    '<li>Your arcade wallet pays ' + PRICE_GOLD.toLocaleString() + ' GOLD to @ashvale (you approve it).</li><li>The design is inscribed with that payment\'s receipt.</li>' +
    '<li>The @ashvale Bank checks the payment on chain and confirms it got your design.</li></ol></div>' +
    (missing.length ? '<p class="muted">Still needs ' + missing.join(' and ') + '.</p>' : '') +
    '<button class="primary" id="sSend" style="width:100%" disabled title="The payment and inscription step is being built">Pay ' + PRICE_GOLD.toLocaleString() + ' GOLD and send</button>' +
    '<p class="muted">The GOLD is not returned. The makers of ASHVALE decide whether your design joins the game, and how.</p>' +
    '<p class="muted">Sending is not switched on yet: this preview only shows what will be sent. Use Export to keep a copy.</p>' +
    '<h3>What gets sent</h3><button id="sCopy">Copy design JSON</button><pre>' + esc(JSON.stringify(payload(), null, 1)).slice(0, 4000) + '</pre>';
  $('sMsg').oninput = e => { d.message = e.target.value; $('sCount').textContent = d.message.length + '/1000'; save(); };
  $('sMsg').onchange = commit;   /* no redraw here: it would eat the click that blurred the box */
  $('sShot').onclick = () => { takeThumb(); drawSendTab(); };
  $('sCopy').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(payload(), null, 1)); toast('Copied'); } catch (e) { toast('Copy blocked by the browser'); } };
}

/* ---------- boot ---------- */
async function boot() {
  setupStage();
  const bar = $('addShapes');
  for (const [t, label] of SHAPE_TYPES) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => addShape(t); bar.appendChild(b); }
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));
  $('dupBtn').onclick = duplicate; $('delBtn').onclick = remove; $('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
  $('frameBtn').onclick = frameView; $('snap').onchange = applySnap;
  $('person').onchange = e => { S.person.visible = e.target.checked; frameView(); };
  $('newBtn').onclick = () => { load(blankDesign()); save(); tab('shape'); toast('New design'); };
  $('drafts').onchange = e => { const d = store()[e.target.value]; if (d) { S.thumb = null; load(d); } };
  $('exportBtn').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S.d, null, 1)], { type: 'application/json' }));
    a.download = slug(S.d.name) + '.workshop.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      let j = JSON.parse(await f.text()); if (j.ashvale3d === 'module' && j.data) j = j.data;
      if (j.ashvale3d === 'design' && Array.isArray(j.shapes)) { load(Object.assign(blankDesign(), j)); commit(); }
      else if (j.ashvale3d === 'part') { const d = blankDesign(); d.name = j.name || j.id; d.shapes = []; load(d); S.parts.includes(j.id) || 0; await remixJson(j); }
      else throw new Error();
      toast('Imported ' + f.name);
    } catch (err) { toast('That file is not a workshop design or an ASHVALE part'); }
  };
  $('courtBtn').onclick = openCourt;
  addEventListener('keydown', e => {
    if (S.court || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicate(); }
    else if (k === 'w') setMode('translate'); else if (k === 'e') setMode('rotate'); else if (k === 'r') setMode('scale');
    else if (k === 'delete' || k === 'backspace') remove(); else if (k === 'f') frameView();
    else if (k === 'escape') { select(-1); drawShapeTab(); }
  });
  try { S.parts = (await (await fetch('/api/parts')).json()).filter(p => p.startsWith('item.') || p.startsWith('gear.')); } catch (e) { S.parts = []; }
  const all = store(), cur = all[(() => { try { return localStorage.getItem('ash.workshop.current'); } catch (e) { return ''; } })()];
  load(cur || blankDesign());
}
/* "See it in Ashvale": the courtyard (studio/courtyard.js) with the game's own models, loaded only when asked for */
async function openCourt() {
  if (S.court || S.courtLoading) return;
  if (!S.d.shapes.length) return toast('Add a shape first');
  S.courtLoading = true; $('courtBtn').textContent = 'Loading Ashvale…';
  try {
    const [{ openCourtyard }, { createModels }] = await Promise.all([import('/studio/courtyard.js'), import('/src/models.js')]);
    if (!S.allParts) S.allParts = await (await fetch('/api/allparts')).json();
    if (S.kit === undefined) { try { const k = await (await fetch('/data/housekit.json')).json(); S.kit = k.data || k; } catch (e) { S.kit = null; } }
    const p = payload();   /* its own item id, so a design named like a game item never borrows that item's model */
    p.part = Object.assign({}, p.part, { id: 'item.ws_preview', items: { ws_preview: (S.d.shapes[0] || {}).c || '#c8a040' }, shapes: JSON.parse(JSON.stringify(S.d.shapes)) });
    S.tc.detach();
    S.court = openCourtyard({ THREE, OrbitControls, createModels, parts: S.allParts, kit: S.kit, design: p, host: document.body,
      onClose: () => { S.court = null; select(S.sel, true); } });
  } catch (e) { console.error(e); toast('Could not open the courtyard'); }
  S.courtLoading = false; $('courtBtn').textContent = 'See it in Ashvale';
}
async function remixJson(j) {
  const colours = Object.values(j.items && typeof j.items === 'object' ? j.items : {}).filter(c => typeof c === 'string');
  const flat = []; (function walk(l) { for (const sh of l || []) { if (sh.t === 'group') walk(sh.children); else flat.push(sh); } })(j.groundShapes || j.shapes);
  S.d.shapes = flat.map(sh => plainShape(sh, colours)).filter(Boolean).slice(0, MAX_SHAPES);
  S.sel = S.d.shapes.length - 1; rebuildAll(); commit(); drawAll(); frameView();
}
boot();
