/* weather_test.mjs - node check of src/weather.js without a window: a scene, a camera, and the module asked for
   every kind of weather in the table. It checks that nothing goes NaN, that a cross-fade arrives inside ~4 s, that a
   kind it does not know means a clear day, that the particle arrays are edited where they stand, and that dispose()
   leaves the scene exactly as it found it. Run: node tests/weather_test.mjs (node >= 22) */
import * as THREE from '../vendor/three.module.min.js';
import fs from 'node:fs';
/* weather.js is a plain script that registers itself, which is how build.py inlines it, so the test runs it the way
   the page does: eval the text with an ASH3D that catches the define call, then take the factory out of what it defined. */
const code = fs.readFileSync(new URL('../src/weather.js', import.meta.url), 'utf8');
let def = null;
globalThis.ASH3D = { define: (name, meta, factory) => { def = { name: name, meta: meta, factory: factory }; } };
new Function(code)();
const createWeather = def === null ? null : def.factory({ three: THREE }).createWeather;
const t0 = Date.now();
let n = 0;
function ok(c, why) { n++; if (!c) throw new Error('FAILED after ' + n + ' checks: ' + why); }
function fin(a, why) { for (let k = 0; k < a.length; k++) if (!Number.isFinite(a[k])) throw new Error('not a number in ' + why + ' at ' + k); n++; }

ok(def !== null && def.name === 'weather', 'the module registers itself as "weather", the name engine.js asks for');
ok(def !== null && def.meta.needs && def.meta.needs.three === 160, 'and it declares that it needs three.js interface 160');
ok(/define\('weather',\s*(\{[^}]*\{[^}]*\}[^}]*\}|\{[^}]*\})/.test(code), 'build.py can read the version and api off its define call');
ok(!/^\s*export\s/m.test(code) && !/^\s*import\s/m.test(code), 'no export or import, so build.py can inline it as a classic script');
ok(typeof createWeather === 'function', 'the factory hands back createWeather');

function make() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa7c8e6);
  scene.fog = new THREE.Fog(0xa7c8e6, 24, 52);          /* exactly the clear day engine.js builds */
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 90);
  camera.position.set(0, 9, 9); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  return { scene: scene, camera: camera };
}
function run(W, seconds, step) { step = step || 1 / 60; for (let k = 0; k < Math.round(seconds / step); k++) W.update(step); }

const S = make(), K = make();
const wasChildren = S.scene.children.slice(), wasFog = S.scene.fog, wasNear = wasFog.near, wasFar = wasFog.far, wasSky = S.scene.background.clone();
const W = createWeather(THREE, { scene: S.scene, camera: S.camera, quality: 'high' });
ok(S.scene.children.length === wasChildren.length + 1, 'the module adds exactly one object to the scene');
const box = S.scene.children.find(o => wasChildren.indexOf(o) < 0);
ok(box && box.isGroup, 'what it adds is one group that carries the weather');
const KIND = W.KIND;
ok(!!(THREE.Points && THREE.PointsMaterial && THREE.LineSegments && THREE.LineBasicMaterial && THREE.ShaderMaterial), 'the three.js build here has the pieces the module needs');

/* the phone budget in the task brief, read from the table it is set in */
ok(KIND.rain.drops <= 1500 && KIND.snow.flakes <= 1200, 'desktop budget (' + KIND.rain.drops + ' drops, ' + KIND.snow.flakes + ' flakes)');
const P = createWeather(THREE, { scene: K.scene, camera: K.camera, quality: 'low' });
ok(P.KIND.rain.drops <= 600, 'phone budget: ' + P.KIND.rain.drops + ' drops, ' + P.KIND.snow.flakes + ' flakes');
P.dispose();

/* every kind, at full and half strength: the fog it asks for arrives and nothing is NaN */
for (const kind of ['clear', 'fog', 'rain', 'snow']) {
  for (const i of [1, 0.5]) {
    W.set(kind, i); run(W, 6);
    const f = S.scene.fog, st = W.state();
    ok(f.near >= 0 && f.far > f.near, kind + ' ' + i + ': fog near < far (' + f.near.toFixed(1) + ', ' + f.far.toFixed(1) + ')');
    ok(st.fade === 1 && st.kind === kind, kind + ' ' + i + ': the cross-fade finished and knows its kind');
    fin([f.near, f.far, f.color.r, f.color.g, f.color.b, st.amounts.rain, st.amounts.snow, st.amounts.bank], 'the look');
    box.traverse(o => { if (o.geometry && o.geometry.attributes.position) fin(o.geometry.attributes.position.array, o.type + ' positions'); });
    const want = new THREE.Color(i === 1 ? KIND[kind].sky : new THREE.Color(0xa7c8e6).lerp(new THREE.Color(KIND[kind].sky), 0.5));
    ok(Math.abs(f.color.r - want.r) < 1e-4 && Math.abs(f.color.g - want.g) < 1e-4 && Math.abs(f.color.b - want.b) < 1e-4,
      kind + ' ' + i + ': the sky is greyed to ' + want.getHexString() + ' (fog colour and sky stay one colour)');
    if (i === 1) ok(f.color.getHex() === S.scene.fog.color.getHex(), kind + ': fog and sky hold the same colour');
    const parts = st.parts.rain + st.parts.snow;
    if (kind === 'rain') ok(st.parts.rain > 0 && st.parts.snow === 0 && st.draws === 2 && Math.abs(st.parts.rain - KIND.rain.drops * i) <= 1,
      'rain draws ' + st.parts.rain + ' of ' + KIND.rain.drops + ' drops in ' + st.draws + ' draw calls');
    if (kind === 'snow') ok(st.parts.snow > 0 && st.parts.rain === 0 && st.draws === 2 && Math.abs(st.parts.snow - KIND.snow.flakes * i) <= 1,
      'snow draws ' + st.parts.snow + ' of ' + KIND.snow.flakes + ' flakes in ' + st.draws + ' draw calls');
    /* strength is how much of the sheet is in the air, so what this weather does not hold must be out of the
       picture rather than the same weather drawn fainter */
    if (parts > 0) {
      let high = 0;
      box.traverse(o => {
        if (o.visible && (o.isLineSegments || o.isPoints)) {
          const a = o.geometry.attributes.position.array;
          for (let k = 1; k < a.length; k += 3) if (a[k] > 0.5) high++;
        } });
      ok(Math.abs(high - parts * (kind === 'rain' ? 2 : 1)) <= 4, kind + ' ' + i + ': ' + high + ' in the air, the rest waiting under the ground');
    }
    /* Being in the air and having a draw call is not the same as being seen. The snow sheet was made with opacity 0 and
       never handed one, so 1,150 flakes were sorted, moved and drawn every frame as 1,150 dots of zero alpha, and snow
       photographed as fog. A sheet this module has switched on must be opaque enough to put paint on the screen. */
    if (parts > 0) box.traverse(o => { if (o.visible && (o.isLineSegments || o.isPoints)) {
      ok(o.material.opacity > 0.05, kind + ' ' + i + ': the ' + (o.isPoints ? 'flake' : 'drop') + ' sheet is drawn and opaque (opacity ' + o.material.opacity + ')');
    } });
    if (kind === 'fog') ok(parts === 0 && st.draws === 1 && st.amounts.bank > 0, 'fog: no particles, only the bank (' + st.draws + ' draw call)');
    if (kind === 'clear') ok(parts === 0 && st.draws === 0, 'clear: nothing drawn at all');
    ok(st.amounts.bank > 0 || kind === 'clear', kind + ': the bank of weather is up');
  }
}

/* the cross-fade: 4 s, and half way it is half way */
W.set('clear', 0, { instant: true });
ok(S.scene.fog.near === wasNear && S.scene.fog.far === wasFar, 'instant set is there before the next frame');
W.set('fog', 1);
run(W, 2);
ok(Math.abs(W.state().fade - 0.5) < 0.02, 'half way through the 4 s fade');
ok(Math.abs(S.scene.fog.near - (wasNear + KIND.fog.near) / 2) < 1, 'and the fog is half way in (' + S.scene.fog.near.toFixed(1) + ')');
run(W, 2.1);
ok(W.state().fade === 1 && Math.abs(S.scene.fog.near - KIND.fog.near) < 1e-6, 'it reaches the target inside ~4 s, not past it');

/* a kind the table does not know is a clear day, not an error and not a blank sky */
for (const junk of ['sandstorm', '', null, undefined, 42, {}, []]) {
  W.set(junk, 1); run(W, 5);
  ok(S.scene.fog.near === wasNear && S.scene.fog.far === wasFar, 'unknown kind ' + JSON.stringify(junk) + ' means clear');
  ok(W.state().parts.rain === 0 && W.state().parts.snow === 0 && W.state().draws === 0, 'and draws nothing');
}
W.set('rain', NaN); run(W, 5);
ok(W.state().kind === 'rain' && S.scene.fog.near === KIND.rain.near, 'a strength that is not a number means full (' + W.state().intensity + ')');
W.set('rain', 5); run(W, 5); ok(S.scene.fog.near === KIND.rain.near, 'a strength over 1 is clamped, not multiplied');
W.set('snow', -3); run(W, 5); ok(S.scene.fog.near === wasNear, 'a negative strength is clamped to clear');
run(W, 2); W.update(NaN); W.update(-1); W.update(1e9); W.update();
box.traverse(o => { if (o.geometry && o.geometry.attributes.position) fin(o.geometry.attributes.position.array, 'positions after rubbish dt'); });
ok(true, 'a rubbish dt does not poison the box');

/* the box follows the camera and the arrays are edited where they stand - no buffer is rebuilt per frame */
W.set('rain', 1, { instant: true });
const rainGeo = box.children.find(o => o.isLineSegments).geometry, arr = rainGeo.attributes.position.array;
S.camera.position.set(400, 11, 250); S.camera.updateMatrixWorld();
run(W, 4);
const f1 = new THREE.Vector3(0, 0, -1).transformDirection(S.camera.matrixWorld);      /* where this camera looks, and it looks down */
const here = (p) => new THREE.Vector2(p.x, p.z);      /* the box hangs below the lens; where it lands on the map is what matters */
const want1 = new THREE.Vector2(400 + f1.x * 12 * 0.7, 250 + f1.z * 12 * 0.7);
ok(here(box.position).distanceTo(want1) < 0.05, 'the weather box follows the camera and sits 7/10 of its radius in front of the lens, where a third-person camera points');
ok(Math.hypot(box.position.x - 400, box.position.z - 250) < 12 * 0.75, 'and it stays within its own radius of the player, so they are still standing in the weather');
ok(box.position.y < S.camera.position.y, 'and it hangs below them, so its floor is under the ground');
const now = here(box.position);
S.camera.rotation.y += Math.PI; S.camera.updateMatrixWorld();
const f2 = new THREE.Vector3(0, 0, -1).transformDirection(S.camera.matrixWorld);
const want2 = new THREE.Vector2(400 + f2.x * 12 * 0.7, 250 + f2.z * 12 * 0.7);
W.update(1 / 60);
ok(here(box.position).distanceTo(now) < now.distanceTo(want2) * 0.15,
   'turning the camera drags the weather along instead of sweeping a thousand drops sideways (' +
   here(box.position).distanceTo(now).toFixed(1) + ' m of a ' + now.distanceTo(want2).toFixed(1) + ' m hop)');
run(W, 4);
ok(here(box.position).distanceTo(want2) < 0.05, 'and it does arrive in front of the new view');
S.camera.rotation.y -= Math.PI; S.camera.updateMatrixWorld(); run(W, 3);
run(W, 3);
ok(rainGeo.attributes.position.array === arr, 'the same Float32Array every frame: nothing is allocated while it runs');
let moved = 0; for (let k = 1; k < arr.length; k += 3) if (arr[k] !== 0) moved++;
ok(moved > KIND.rain.drops, 'every drop has a place in the world');

/* dispose hands the scene back exactly as it was found */
W.dispose(); W.dispose();
ok(S.scene.children.length === wasChildren.length, 'dispose takes the object back out');
ok(S.scene.children.every((o, k) => o === wasChildren[k]), 'and leaves the rest of the scene in the same order');
ok(S.scene.fog === wasFog && S.scene.fog.near === wasNear && S.scene.fog.far === wasFar, 'dispose puts the fog back');
ok(S.scene.fog.color.getHex() === wasSky.getHex() && S.scene.background.getHex() === wasSky.getHex(), 'and the sky colour');
ok(W.state().gone === true, 'and says it is gone');

/* a scene that never had fog gets it anyway, and gets it taken away again */
const B = make(); B.scene.fog = null;
const V = createWeather(THREE, { scene: B.scene, camera: B.camera, quality: 'high' });
ok(!!B.scene.fog, 'a host that forgot the fog still gets weather');
V.set('fog', 1, { instant: true }); run(V, 1); ok(B.scene.fog.near === KIND.fog.near, 'and the fog it asks for');
V.dispose(); ok(B.scene.fog === null, 'and dispose does not leave a fog behind it');
let threw = null;
try { createWeather(THREE, { scene: null, camera: null }); } catch (e) { threw = e; }
ok(threw instanceof Error, 'without a scene and a camera it says so instead of drawing nothing quietly');

console.log('ok', n, 'checks in', Date.now() - t0, 'ms');
