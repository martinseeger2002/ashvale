/* [Claude 2026-10-19] The Saltmere Links playtest: one player, the 18 holes on the operator's map, the golf HUD and the
   three-press swing, drawn with three.js. Not the ASHVALE engine part (engolf.js comes after the operator's playtest): this page
   exists so the swing, the clubs, wind, lies, water and putting can be felt and tuned first. Rules: src/golfrules.js. */
import * as THREE from 'three';
import { createModels } from '../../src/models.js';
const R = window.GolfRules, D = window.GOLF_COURSE, C = R.makeCourse(D), YD = C.yd;
const $ = s => document.querySelector(s);
const yd = m => Math.round(m * YD), ft = m => Math.round(m * YD * 3);

/* ---------- the world ---------- */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9fcbe8); scene.background = SKY; scene.fog = new THREE.Fog(0xb7d6ea, 90, 260);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
scene.add(new THREE.HemisphereLight(0xdff0ff, 0x4a6a32, 1.1));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(-60, 120, 40); scene.add(sun);

const COL = { t: '#8ccc5e', f: '#86c45a', e: '#7cbd56', g: '#95d769', r: '#6aa548', h: '#5d8c3e', s: '#e6d6a0', w: '#3f7fbf', o: '#3a74b0' };
function groundTexture() {
  const Q = D.q, W = D.rows[0].length, H = D.rows.length, P = 3, cv = document.createElement('canvas');
  cv.width = W * P; cv.height = H * P; const g = cv.getContext('2d');
  for (let j = 0; j < H; j++) {
    const row = D.rows[j];
    for (let i = 0; i < W; i++) {
      const s = row[i]; let c = COL[s] || '#5d8c3e';
      if (s === 'f' && Math.floor((i + j) / (4 * Q)) % 2) c = '#7dba52';     /* mown stripes */
      if (s === 'g' && Math.floor(i / (2 * Q)) % 2) c = '#8ed062';
      g.fillStyle = c; g.fillRect(i * P, j * P, P, P);
    }
  }
  /* a little speckle so the rough does not look flat */
  const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
  for (let k = 0; k < d.length; k += 4) { const n = ((k * 2654435761) >>> 24) / 255 * 14 - 7; d[k] += n; d[k + 1] += n; d[k + 2] += n * 0.5; }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function buildGround() {
  const [X0, Y0, X1, Y1] = D.box, W = X1 - X0, H = Y1 - Y0, S = 1;   /* one vertex a metre; greens get their real tilt */
  const nx = W / S + 1, nz = H / S + 1, pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * S, z = Y0 + j * S, k = j * nx + i;
    let y = C.height(x, z);
    const s = C.surf(Math.min(X1 - 0.01, x), Math.min(Y1 - 0.01, z)), sl = C.surf(x - 0.6, z), sr = C.surf(x + 0.6, z), su = C.surf(x, z - 0.6), sd = C.surf(x, z + 0.6);
    if (s === 'w' || s === 'o') y = (sl === s && sr === s && su === s && sd === s) ? -0.6 : -0.25;   /* banks down to the water */
    if (s === 's') y -= 0.12;
    pos.set([x, y, z], k * 3); uv.set([i / (nx - 1), 1 - j / (nz - 1)], k * 2);
    if (i < nx - 1 && j < nz - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const tex = groundTexture(); tex.flipY = true;
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex })));
  /* one water surface for the ponds, the burn and the bay, just under the banks (the operator: the first cut hid it under the
     land beyond the course, so the beds showed as dark trenches) */
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 600, H + 300), new THREE.MeshPhongMaterial({ color: 0x3f86c8, transparent: true, opacity: 0.9, shininess: 120, specular: 0xbfe2ff }));
  water.rotation.x = -Math.PI / 2; water.position.set(X0 + W / 2, -0.1, Y0 + (H + 300) / 2); scene.add(water);
  /* the land beyond the course box: forest floor to the north and the west, never over the course or its water */
  const landMat = new THREE.MeshLambertMaterial({ color: 0x4f7a36 });
  const north = new THREE.Mesh(new THREE.PlaneGeometry(W + 600, 600), landMat); north.rotation.x = -Math.PI / 2; north.position.set(X0 + W / 2, 0, Y0 - 300); scene.add(north);
  const west = new THREE.Mesh(new THREE.PlaneGeometry(300, H + 40), landMat); west.rotation.x = -Math.PI / 2; west.position.set(X0 - 150, 0, Y0 + (H + 40) / 2 - 20); scene.add(west);
}
/* see-through, as in ASHVALE (src/scene.js SEE): anything on a tree or rock nearer the camera than the ball (less 2 m)
   dissolves, with a 0.25 m dithered edge (the operator: a tree filled the whole view from the rough) */
const SEE = { uSeeD: { value: 0 } };
function seeThrough(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uSeeD = SEE.uSeeD;
    sh.fragmentShader = 'uniform float uSeeD;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\n  if (uSeeD > 0.0) { float vd = length(vViewPosition); if (vd < uSeeD) { float f = smoothstep(uSeeD - 0.25, uSeeD, vd); float nz = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453); if (nz > f) discard; } }');
  };
  return mat;
}
function buildTrees() {
  const trees = D.trees.filter(t => !t[2]), rocks = D.trees.filter(t => t[2]);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), seeThrough(new THREE.MeshLambertMaterial({ color: 0x2f6a34 })), trees.length + 400);
  const crown2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), seeThrough(new THREE.MeshLambertMaterial({ color: 0x3b7d3c })), trees.length + 400);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 5), seeThrough(new THREE.MeshLambertMaterial({ color: 0x5b4029 })), trees.length + 400);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let n = 0;
  const put = (x, z, h, r) => {
    m.compose(v.set(x, h * 0.18, z), q, sc.set(1, h * 0.36, 1)); trunk.setMatrixAt(n, m);
    m.compose(v.set(x, h * 0.55, z), q, sc.set(r, h * 0.62, r)); crown.setMatrixAt(n, m);
    m.compose(v.set(x, h * 0.8, z), q, sc.set(r * 0.72, h * 0.4, r * 0.72)); crown2.setMatrixAt(n, m); n++;
  };
  for (const t of trees) { const s = R.treeShape(t); put(t[0], t[1], s.h, s.r * 1.05); }
  /* a forest edge just outside the box, west and north, so the course does not end at a cliff */
  const [X0, Y0, X1] = D.box;
  for (let k = 0; k < 400 && n < trees.length + 400; k++) {
    const side = k % 2, a = (k * 0.618034) % 1;
    const x = side ? X0 - 2 - (k * 7 % 11) : X0 + a * (X1 - X0), z = side ? Y0 + a * 300 : Y0 - 2 - (k * 5 % 9);
    put(x, z, 6 + (k % 5) * 0.6, 1.3);
  }
  for (const im of [crown, crown2, trunk]) { im.count = n; im.instanceMatrix.needsUpdate = true; scene.add(im); }
  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.7, 0), seeThrough(new THREE.MeshLambertMaterial({ color: 0x8d8a82 })), Math.max(1, rocks.length));
  rocks.forEach((t, i) => { m.compose(v.set(t[0], 0.2, t[1]), q.setFromEuler(new THREE.Euler(i, i * 2, 0)), sc.set(1, 0.7, 1)); rock.setMatrixAt(i, m); });
  rock.count = rocks.length; scene.add(rock);
}
function buildClubhouse() {
  const g = new THREE.Group(), [x, z] = D.club;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 8), new THREE.MeshLambertMaterial({ color: 0xe9dfc8 })); wall.position.y = 2; g.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 3.5, 4), new THREE.MeshLambertMaterial({ color: 0x8e3b2c })); roof.position.y = 5.7; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.6); g.add(roof);
  g.position.set(x, 0, z + 1); scene.add(g);
  const [hx, hz] = D.half, hut = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 4), new THREE.MeshLambertMaterial({ color: 0x9a7650 })); hut.position.set(hx, 1.3, hz); scene.add(hut);
}
buildGround(); buildTrees(); buildClubhouse();

const BALL_R = 0.035;   /* the operator: the first ball was out of proportion - a ball a little larger than life beside a 1.75 m golfer */
/* ---------- things on the hole: flag, tee markers, ball, golfer, aim marks, putting grid ---------- */
const flag = new THREE.Group();
/* the flagstick: a white and red banded pole and a waving flag with the hole's number; it comes out while you putt */
const flagTex = document.createElement('canvas'); flagTex.width = 128; flagTex.height = 84;
const flagMap = new THREE.CanvasTexture(flagTex); flagMap.colorSpace = THREE.SRGBColorSpace;
function flagNumber(n) {
  const g = flagTex.getContext('2d'); g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 84);
  g.fillStyle = '#c8281f'; g.fillRect(0, 0, 128, 7); g.fillRect(0, 77, 128, 7);
  g.fillStyle = '#1d1a14'; g.font = 'bold 60px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 46);
  flagMap.needsUpdate = true;
}
{ const stick = new THREE.Group(); flag.add(stick); flag.userData.stick = stick;
  for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xc8281f : 0xf7f5ee })); seg.position.y = 0.2 + k * 0.4; stick.add(seg); }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf2c230 })); knob.position.y = 2.42; stick.add(knob);
  const clothGeo = new THREE.PlaneGeometry(0.62, 0.4, 10, 1); clothGeo.translate(0.31, 0, 0);
  const cloth = new THREE.Mesh(clothGeo, new THREE.MeshLambertMaterial({ map: flagMap, side: THREE.DoubleSide })); cloth.position.set(0.01, 2.17, 0); stick.add(cloth); flag.userData.cloth = cloth;
  cloth.userData.base = Float32Array.from(clothGeo.attributes.position.array);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 24), new THREE.MeshBasicMaterial({ color: 0xffffff })); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.014; flag.add(rim);
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), new THREE.MeshBasicMaterial({ color: 0x111111 })); cup.rotation.x = -Math.PI / 2; cup.position.y = 0.012; flag.add(cup); }
function waveFlag(now) {   /* the flag streams with the wind and ripples */
  const cl = flag.userData.cloth, pos = cl.geometry.attributes.position, b = cl.userData.base, w = Math.hypot(ST.wind[0], ST.wind[1]);
  for (let i = 0; i < pos.count; i++) { const x = b[i * 3]; pos.array[i * 3 + 2] = Math.sin(x * 9 - now / 140 * (0.6 + w / 6)) * x * (0.06 + w * 0.012); }
  pos.needsUpdate = true; cl.geometry.computeVertexNormals();
  cl.rotation.y = -Math.atan2(ST.wind[1], ST.wind[0]) + (w < 0.3 ? 1.2 : 0);
}
scene.add(flag);
const teeMarks = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0x2b5fb8 })); scene.add(m); return m; });
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 })); scene.add(ball);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.2, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })); scene.add(trail);
/* the golfer: the ASHVALE avatar itself (src/models.js humanoid) with the golf animations, and a club drawn from its hands:
   the grip between the two hands, the shaft carrying on along the line from the shoulders through the hands */
const MODELS = createModels(THREE, { parts: window.GOLF_PARTS, onReject: (id, why) => console.warn('part rejected', id, why) });
const AV = MODELS.humanoid({ outfit: { hat: { style: 'cap', color: '#f2f2ee' }, shirt: { style: 'tunic', color: '#2f6fa3' }, pants: { style: 'trousers', color: '#e6e1d3' }, boots: '#f4f4f0', belt: '#2a2a2a' } });
const golfer = AV.object; scene.add(golfer);
const club = new THREE.Group(); scene.add(club);
const shaftMat = new THREE.MeshLambertMaterial({ color: 0xc9cbd0 });
const shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.006, 1, 6), shaftMat); club.add(shaftMesh);
const gripMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.26, 6), new THREE.MeshLambertMaterial({ color: 0x222222 })); club.add(gripMesh);
const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.05), new THREE.MeshLambertMaterial({ color: 0x5a5d63 })); club.add(headMesh);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function clubLen() { const c = clubObj().id; return c === 'PT' ? 0.86 : c === '1W' || c === '3W' ? 1.12 : c === 'SW' || c === 'PW' ? 0.9 : 0.96; }
let stand = 0.8;
function drawClub() {
  const P = AV._parts; if (!P || !P.handL) return;
  golfer.updateMatrixWorld(true);
  P.handL.getWorldPosition(_a); P.handR.getWorldPosition(_b); _m.addVectors(_a, _b).multiplyScalar(0.5);
  P.shL.getWorldPosition(_a); P.shR.getWorldPosition(_b); _s.addVectors(_a, _b).multiplyScalar(0.5);
  _d.subVectors(_m, _s).normalize();
  /* the wrists: hinge the shaft off the line of the arms, toward the target (+) or away (-), as the swing says */
  const h = AV.clubHinge ? AV.clubHinge() : 0;
  if (h) _d.applyAxisAngle(_a.set(-Math.sin(ST.aim), 0, Math.cos(ST.aim)), -h);   /* the wrists cock in the swing plane: up behind the hands on the way back, over the shoulder in the finish */
  /* at address, impact and on the putting stroke the head sits behind the ball: the shaft runs from the hands to it */
  const w = AV.clubToBall ? AV.clubToBall() : 0, gb = ST.phase === 'fly' || ST.phase === 'done' ? (ST.from || ST.ball) : ST.ball;
  let Lb = 0;
  if (w > 0) { _a.set(gb.x - Math.cos(ST.aim) * 0.03, C.height(gb.x, gb.y) + 0.03, gb.y - Math.sin(ST.aim) * 0.03).sub(_m); Lb = _a.length(); _d.lerp(_a.normalize(), w).normalize(); }
  const L = clubLen();
  if (ST.phase === 'aim' && w > 0.95 && Lb > 0) { const dh = Lb - L; stand -= dh * 0.5; stand = Math.max(0.45, Math.min(1.3, stand)); }   /* step in or back until the head meets the ball (the club never stretches) */
  const q = new THREE.Quaternion().setFromUnitVectors(_up, _d.clone().negate());
  shaftMesh.quaternion.copy(q); gripMesh.quaternion.copy(q);
  shaftMesh.position.copy(_m).addScaledVector(_d, L / 2 - 0.05); shaftMesh.scale.set(1, L, 1);
  gripMesh.position.copy(_m).addScaledVector(_d, 0.06);
  headMesh.position.copy(_m).addScaledVector(_d, L - 0.05); headMesh.quaternion.setFromAxisAngle(_up, -ST.aim);
}
let avAnim = '';
function avPlay(name) { if (avAnim === name) return; avAnim = name; AV.play(name); }
AV.onEvent((type, name) => {
  if (type === 'impact' && (name === 'golfswing' || name === 'putt') && ST.phase === 'go') swing();
  if (type === 'done' && name === 'golfswing') { avAnim = ''; avPlay('golffinish'); }
  if (type === 'done' && name === 'putt') { avAnim = ''; avPlay('puttaddress'); }
});
const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 32), new THREE.MeshBasicMaterial({ color: 0xffe25a, transparent: true, opacity: 0.85, depthTest: false })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 5; scene.add(ring);
const aimLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.8, depthTest: false })); aimLine.renderOrder = 4; scene.add(aimLine);
/* the putting grid: lines on the green and dots that drift downhill, faster where it is steeper (the green's break) */
const gridLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); scene.add(gridLines);
const DOTS = 260, dotPos = new Float32Array(DOTS * 3), dotSeed = [];
const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xfff6a8, size: 0.045 })); dots.geometry.setAttribute('position', new THREE.BufferAttribute(dotPos, 3)); scene.add(dots);
function buildGrid(h) {
  const [gx, gz] = h.green, pts = [], r = 9;
  for (let a = -r; a <= r; a += 0.75) {
    for (let b = -r; b < r; b += 0.25) {
      for (const [x1, z1, x2, z2] of [[gx + a, gz + b, gx + a, gz + b + 0.25], [gx + b, gz + a, gx + b + 0.25, gz + a]]) {
        if (!'ge'.includes(C.surf(x1, z1)) || !'ge'.includes(C.surf(x2, z2))) continue;
        pts.push(x1, C.height(x1, z1) + 0.02, z1, x2, C.height(x2, z2) + 0.02, z2);
      }
    }
  }
  gridLines.geometry.dispose(); gridLines.geometry = new THREE.BufferGeometry(); gridLines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  dotSeed.length = 0;
  for (let k = 0; k < DOTS; k++) dotSeed.push(newDot(h));
}
function newDot(h) { for (let t = 0; t < 30; t++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 8, x = h.green[0] + Math.cos(a) * r, z = h.green[1] + Math.sin(a) * r; if (C.surf(x, z) === 'g') return { x, z, life: Math.random() * 2 }; } return { x: h.green[0], z: h.green[1], life: 0 }; }
function stepDots(dt, h, on) {
  dots.visible = gridLines.visible = on; if (!on) return;
  dotSeed.forEach((d, k) => {
    const g = C.grad(d.x, d.z); d.x -= g[0] * dt * 40; d.z -= g[1] * dt * 40; d.life -= dt;
    if (d.life <= 0 || C.surf(d.x, d.z) !== 'g') Object.assign(d, newDot(h), { life: 1.5 + Math.random() * 1.5 });
    dotPos.set([d.x, C.height(d.x, d.z) + 0.04, d.z], k * 3);
  });
  dots.geometry.attributes.position.needsUpdate = true;
}

/* ---------- the round ---------- */
const ST = {
  set: 'standard', seed: 'pt' + Math.floor(Math.random() * 1e6), hole: 0, strokes: 0, card: [], ball: null, aim: 0, club: '1W', spin: 'none',
  phase: 'aim', /* aim | rise | fall | fly | done */ meter: 0, power: 0, impact: 0, fly: null, flyT: 0, wait: 0, camYaw: 0, msgQ: []
};
const hole = () => C.holes[ST.hole];
function startHole(i) {
  ST.hole = i; ST.strokes = 0; const h = hole(); ST.ball = { x: h.pts[0][0], y: h.pts[0][1] };
  ST.wind = R.windFor(ST.seed, h.n);
  flag.position.set(h.pin[0], C.height(h.pin[0], h.pin[1]), h.pin[1]); flagNumber(h.n);
  const a = Math.atan2(h.pts[1][1] - h.pts[0][1], h.pts[1][0] - h.pts[0][0]);
  teeMarks.forEach((m, k) => { const s = k ? 1 : -1; m.position.set(h.pts[0][0] - Math.sin(a) * 2.2 * s + Math.cos(a) * 0.6, 0.1, h.pts[0][1] + Math.cos(a) * 2.2 * s + Math.sin(a) * 0.6); });
  buildGrid(h); setupShot(true);
  flash('HOLE ' + h.n + ' · PAR ' + h.par, '', 1600); flash(h.yd + ' yards', 'small', 1400);
  hudAll();
}
function setupShot(first) {
  const h = hole(); ST.phase = 'aim'; ST.meter = 0;
  ST.club = R.pickClub(C, ST.ball, h.pin, ST.set);
  const t = R.aimPoint(C, ST.ball, h, ST.club, ST.set); ST.aim = Math.atan2(t[1] - ST.ball.y, t[0] - ST.ball.x);
  ST.spin = 'none'; ST.range = R.puttRange(C, ST.ball, h.pin); if (first) ST.camYaw = ST.aim;
  placeBall(ST.ball.x, ST.ball.y); trail.visible = false; hudAll();
}
/* in the cup the ball is cut off at the green's surface, so it sinks into the black of the hole instead of through the ground */
const CUT = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function placeBall(x, z, y) {
  const gy = C.height(x, z); ball.position.set(x, (y == null ? gy : y) + BALL_R, z); shadow.position.set(x, gy + 0.015, z);
  const p = hole() && hole().pin, inCup = p && Math.hypot(x - p[0], z - p[1]) < 0.1 && y != null && y < gy;
  ball.material.clippingPlanes = inCup ? [CUT] : null; CUT.constant = -(C.height(p ? p[0] : x, p ? p[1] : z) + 0.011); shadow.visible = !inCup;
}
function clubObj() { return R.CLUBS.find(c => c.id === ST.club); }
function reachNow() {
  const c = clubObj(), set = R.SETS[ST.set];
  if (c.id === 'PT') return R.PUTT[ST.range];
  return c.carry * set.dist * R.lieOf(C.surf(ST.ball.x, ST.ball.y), c);
}
function swing() {
  const h = hole(), c = clubObj();
  const res = R.shot(C, ST.ball, { club: ST.club, aim: ST.aim, power: ST.power, impact: ST.impact, spin: ST.spin, range: ST.range, set: ST.set, wind: c.id === 'PT' ? [0, 0] : ST.wind, pin: h.pin });
  ST.strokes += 1; ST.fly = res; ST.flyT = 0; ST.phase = 'fly'; ST.from = { ...ST.ball };
  const pos = []; for (const p of res.path) pos.push(p[0], p[2] + BALL_R, p[1]);
  trail.geometry.dispose(); trail.geometry = new THREE.BufferGeometry(); trail.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); trail.geometry.setDrawRange(0, 0); trail.visible = c.id !== 'PT';
  if (c.id !== 'PT' && Math.abs(ST.impact) < 0.25 && ST.power > 0.9) flash('NICE SHOT', 'good', 1100);
}
function landed() {
  const r = ST.fly, h = hole(), fromGreen = 'ge'.includes(C.surf(ST.from.x, ST.from.y));
  if (r.holed) {
    const name = R.scoreName(ST.strokes, h.par);
    if (ST.strokes > 1 && !fromGreen) flash('CHIP-IN!', 'good', 1300);
    flash(name, ST.strokes <= h.par ? 'good' : '', 2200);
    ST.card[ST.hole] = ST.strokes; ST.phase = 'done'; hudAll(); setTimeout(holeOver, 2300); return;
  }
  if (r.kind === 'water') flash('WATER HAZARD  +1', 'bad', 1600);
  else if (r.kind === 'oob') flash('OUT OF BOUNDS  +1', 'bad', 1600);
  else if (r.kind === 'tree') flash('TREE!', 'bad', 1000);
  else if (r.lip) flash('LIPPED OUT', 'bad', 1200);
  else if (r.surf === 's') flash('BUNKER', 'bad', 1000);
  ST.strokes += r.penalty;
  ST.ball = { x: r.at[0], y: r.at[1] };
  if (ST.strokes >= R.MAX_STROKES) { flash('PICKED UP', 'bad', 1500); ST.card[ST.hole] = R.MAX_STROKES; ST.phase = 'done'; setTimeout(holeOver, 1600); return; }
  setupShot(false);
}
function holeOver() { showCard(ST.hole < 17 ? 'Next hole' : 'Finish'); }

/* ---------- the swing meter: press to start, press to set power, press on the line for a clean strike ---------- */
const WIN = () => R.SETS[ST.set].window;
/* The operator: a line near the top of the band to aim for. Below it the power is in proportion (the line = full power); right on
   it a power bonus; past it you lose a little, more the further past. The putter has no line: its band is plain distance. */
const LINE = 86, ON_LINE = () => R.SETS[ST.set].line;   /* the MAX zone: wider with better clubs */
function setPower(m) {
  ST.stop = m;
  if (clubObj().id === 'PT') { ST.power = Math.max(0.02, m / 100); return; }
  const tol = ON_LINE();
  if (Math.abs(m - LINE) <= tol) { ST.power = R.POWER_BONUS; flash('POWER!', 'good', 900); }
  else if (m < LINE) ST.power = Math.max(0.02, m / LINE);
  else { ST.power = 1 - 0.15 * (m - LINE - tol) / (100 - LINE - tol); flash('OVERSWING', 'bad', 900); }
}
function press() {
  if (ST.phase === 'aim') { ST.phase = 'rise'; ST.meter = 0; return; }
  if (ST.phase === 'rise') { setPower(ST.meter); ST.phase = 'fall'; return; }
  if (ST.phase === 'fall') { ST.impact = -ST.meter / WIN(); ST.phase = 'go'; avPlay(clubObj().id === 'PT' ? 'putt' : 'golfswing'); return; }
}
function stepMeter(dt) {
  const sweep = R.SETS[ST.set].sweep;
  if (ST.phase === 'rise') { ST.meter += dt * 100 / sweep * 1.6;   /* the operator: the power stroke up runs faster than the accuracy stroke down (x1.2, which he likes) */ if (ST.meter >= 100) { ST.meter = 100; setPower(100); ST.phase = 'fall'; } }
  else if (ST.phase === 'fall') { ST.meter -= dt * 100 / sweep * 1.2; if (ST.meter <= -14) { ST.impact = 14 / WIN(); ST.phase = 'go'; avPlay(clubObj().id === 'PT' ? 'putt' : 'golfswing'); flash('MISHIT', 'bad', 900); } }
}

/* ---------- HUD ---------- */
const hud = { top: $('#hTop'), wind: $('#hWind'), club: $('#hClub'), lie: $('#hLie'), meter: $('#mFill'), mark: $('#mMark'), pmark: $('#mPow'), card: $('#card'), map: $('#map'), mlab: $('#mLab') };
function totalVsPar() { let s = 0, p = 0; ST.card.forEach((v, i) => { if (v) { s += v; p += C.holes[i].par; } }); return s - p; }
function hudAll() {
  const h = hole(), d = Math.hypot(h.pin[0] - ST.ball.x, h.pin[1] - ST.ball.y), tv = totalVsPar();
  hud.top.innerHTML = '<div class="hn">HOLE <b>' + h.n + '</b></div><div class="hp">PAR <b>' + h.par + '</b> · ' + h.yd + ' yd</div>'
    + '<div class="hs">STROKE <b>' + (ST.strokes + 1) + '</b> · ' + (tv === 0 ? 'E' : (tv > 0 ? '+' : '') + tv) + '</div>'
    + '<div class="hd">TO PIN <b>' + (d < 8 && 'ge'.includes(C.surf(ST.ball.x, ST.ball.y)) ? ft(d) + ' ft' : yd(d) + ' yd') + '</b></div>';
  const c = clubObj(), surf = C.surf(ST.ball.x, ST.ball.y);
  hud.club.querySelector('.cn').textContent = c.id === 'PT' ? (ST.range === 'short' ? 'Putter · short' : 'Putter · long') : c.name;
  hud.club.querySelector('.cd').textContent = c.id === 'PT' ? 'up to ' + ft(R.PUTT[ST.range]) + ' ft' : yd(reachNow()) + ' yd';
  const lie = Math.round(R.lieOf(surf, c) * 100), name = { t: 'Tee', f: 'Fairway', e: 'Fringe', g: 'Green', r: 'Rough', h: 'Heavy rough', s: 'Bunker' }[surf] || '';
  hud.lie.innerHTML = '<span>' + name + '</span><b>' + lie + '%</b>';
  document.querySelectorAll('#spin button').forEach(b => b.classList.toggle('on', b.dataset.s === ST.spin));
  $('#spin').hidden = c.id === 'PT'; $('#putt').hidden = c.id !== 'PT';
  document.querySelectorAll('#putt button').forEach(b => b.classList.toggle('on', b.dataset.r === ST.range));
  hud.mlab.textContent = c.id === 'PT' ? ft(R.PUTT[ST.range]) + ' ft' : yd(reachNow()) + ' yd';
  drawMap();
}
function hudWind() {
  const w = ST.wind, sp = Math.hypot(w[0], w[1]), a = Math.atan2(w[1], w[0]) - ST.camYaw;   /* relative to the view: up = with you */
  hud.wind.querySelector('.arrow').style.transform = 'rotate(' + (a * 180 / Math.PI + 90) + 'deg)';
  hud.wind.querySelector('.ws').textContent = Math.round(sp * 2.237) + ' mph';
  hud.wind.querySelector('.arrow').style.opacity = sp < 0.3 ? 0.25 : 1;
}
function hudMeter() {
  const toX = v => 100 - (v + 14) / 114 * 100;   /* the operator: the meter runs right to left and back; the strike line is on the right */
  hud.mark.style.left = toX(ST.meter) + '%';
  const top = ST.phase === 'rise' ? ST.meter : ST.phase === 'aim' ? 0 : ST.stop;
  hud.meter.style.left = toX(top) + '%'; hud.meter.style.width = (toX(0) - toX(top)) + '%';
  hud.pmark.style.display = ST.phase === 'fall' || ST.phase === 'go' ? 'block' : 'none'; hud.pmark.style.left = toX(ST.stop) + '%';
  /* the pin on the meter: where to stop the power for the hole's distance (a putt on the flat; a full shot's carry) */
  { const h = hole(), d = Math.hypot(h.pin[0] - ST.ball.x, h.pin[1] - ST.ball.y), pt = clubObj().id === 'PT', reach = reachNow();
    const v = pt ? d / reach * 100 : d / reach * LINE, tk = $('#pinTick'); tk.hidden = !(v > 1 && v <= 100); tk.style.left = toX(v) + '%'; }
  const pl = $('#pLine'); pl.hidden = clubObj().id === 'PT'; pl.style.left = toX(LINE + ON_LINE()) + '%'; pl.style.width = (toX(LINE - ON_LINE()) - toX(LINE + ON_LINE())) + '%';
  $('#meter').classList.toggle('live', ST.phase === 'rise' || ST.phase === 'fall');
  $('#sweet').style.left = toX(WIN()) + '%'; $('#sweet').style.width = (toX(-WIN()) - toX(WIN())) + '%';
  $('#swingBtn').textContent = ST.phase === 'aim' ? 'SWING' : ST.phase === 'rise' ? 'POWER' : ST.phase === 'fall' ? 'HIT' : '…';
}
/* the mini map: the whole hole, tee at the bottom, ball, pin, the aim line to the landing ring */
const MAPC = { t: '#8ccc5e', f: '#86c45a', e: '#7cbd56', g: '#a7e57a', r: '#5f9a40', h: '#3f6b2c', s: '#e6d6a0', w: '#3f7fbf', o: '#2f6aa6' };
let mapCache = null;
function drawMap() {
  const cv = hud.map, g = cv.getContext('2d'), h = hole(), W = cv.width, H = cv.height;
  const xs = h.pts.map(p => p[0]).concat([h.pin[0]]), zs = h.pts.map(p => p[1]).concat([h.pin[1]]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const up = Math.atan2(h.pin[1] - h.pts[0][1], h.pin[0] - h.pts[0][0]);   /* turn the map so the hole runs up */
  const span = Math.max(40, Math.hypot(h.pin[0] - h.pts[0][0], h.pin[1] - h.pts[0][1]) + 28), sc = H / span;
  const rot = -Math.PI / 2 - up, cr = Math.cos(rot), sr = Math.sin(rot);
  const P = (x, z) => [W / 2 + ((x - cx) * cr - (z - cz) * sr) * sc, H / 2 + ((x - cx) * sr + (z - cz) * cr) * sc];
  const key = h.n + ':' + W;
  if (!mapCache || mapCache.key !== key) {
    const im = g.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i - W / 2) / sc, v = (j - H / 2) / sc, x = cx + u * cr + v * sr, z = cz - u * sr + v * cr;
      const c = MAPC[C.surf(x, z)] || '#3f6b2c', k = (j * W + i) * 4;
      im.data[k] = parseInt(c.slice(1, 3), 16); im.data[k + 1] = parseInt(c.slice(3, 5), 16); im.data[k + 2] = parseInt(c.slice(5, 7), 16); im.data[k + 3] = 255;
    }
    mapCache = { key, im };
  }
  g.putImageData(mapCache.im, 0, 0);
  const b = P(ST.ball.x, ST.ball.y), reach = reachNow(), t = P(ST.ball.x + Math.cos(ST.aim) * reach, ST.ball.y + Math.sin(ST.aim) * reach), p = P(h.pin[0], h.pin[1]);
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.setLineDash([3, 3]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(t[0], t[1]); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#ffe25a'; g.lineWidth = 2; g.beginPath(); g.arc(t[0], t[1], 4, 0, 7); g.stroke();
  g.fillStyle = '#d8312a'; g.fillRect(p[0] - 1, p[1] - 9, 2, 9); g.beginPath(); g.moveTo(p[0] + 1, p[1] - 9); g.lineTo(p[0] + 7, p[1] - 7); g.lineTo(p[0] + 1, p[1] - 5); g.fill();
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(b[0], b[1], 3, 0, 7); g.fill(); g.stroke();
}
function flash(text, kind, ms) {
  const f = document.createElement('div'); f.className = 'flash ' + (kind || ''); f.textContent = text;
  const box = $('#flashes'); box.appendChild(f); setTimeout(() => f.remove(), ms || 1300);
}
function showCard(btn) {
  const c = hud.card, rows = [0, 9].map(o => C.holes.slice(o, o + 9));
  let html = '<h3>Saltmere Links</h3><div class="sc">';
  for (const [k, part] of rows.entries()) {
    html += '<table><tr><th>' + (k ? 'IN' : 'OUT') + '</th>' + part.map(h => '<td>' + h.n + '</td>').join('') + '<td>Σ</td></tr>'
      + '<tr><th>Par</th>' + part.map(h => '<td>' + h.par + '</td>').join('') + '<td>' + part.reduce((s, h) => s + h.par, 0) + '</td></tr>'
      + '<tr><th>You</th>' + part.map((h, i) => { const v = ST.card[h.n - 1]; return '<td class="' + (v ? (v < h.par ? 'u' : v > h.par ? 'o' : '') : '') + '">' + (v || '') + '</td>'; }).join('')
      + '<td>' + (part.reduce((s, h) => s + (ST.card[h.n - 1] || 0), 0) || '') + '</td></tr></table>';
  }
  const tot = ST.card.reduce((s, v) => s + (v || 0), 0), tv = totalVsPar();
  html += '</div><p class="tot">Total <b>' + (tot || 0) + '</b> (' + (tv === 0 ? 'even' : (tv > 0 ? '+' : '') + tv) + ')</p><div class="btns">'
    + (btn ? '<button data-a="next">' + btn + '</button>' : '') + '<button data-a="close">' + (btn ? 'Look' : 'Close') + '</button></div>';
  c.innerHTML = html; c.hidden = false;
}
hud.card.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  hud.card.hidden = true;
  if (b.dataset.a === 'next') { if (ST.hole < 17) startHole(ST.hole + 1); else { ST.card = []; startHole(0); } }
});

/* ---------- controls ---------- */
let aimHold = 0;
function turnAim(dir, dt) { if (ST.phase !== 'aim') return; ST.aim += dir * dt * (clubObj().id === 'PT' ? 0.25 : 0.5); }
function cycleClub(d) {
  if (ST.phase !== 'aim') return;
  const list = R.CLUBS.filter(c => c.id !== '1W' || C.surf(ST.ball.x, ST.ball.y) === 't'), i = list.findIndex(c => c.id === ST.club);
  ST.club = list[(i + d + list.length) % list.length].id; hudAll();
}
$('#swingBtn').addEventListener('pointerdown', e => { e.preventDefault(); press(); });
$('#meter').addEventListener('pointerdown', e => { e.preventDefault(); press(); });
$('#cPrev').addEventListener('click', () => cycleClub(-1)); $('#cNext').addEventListener('click', () => cycleClub(1));
for (const [id, d] of [['#aL', -1], ['#aR', 1]]) {
  const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); aimHold = d; b.setPointerCapture(e.pointerId); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, () => { aimHold = 0; });
}
document.querySelectorAll('#spin button').forEach(b => b.addEventListener('click', () => { if (ST.phase === 'aim') { ST.spin = b.dataset.s; hudAll(); } }));
document.querySelectorAll('#putt button').forEach(b => b.addEventListener('click', () => { if (ST.phase === 'aim') { ST.range = b.dataset.r; hudAll(); } }));
$('#cardBtn').addEventListener('click', () => showCard(null));
$('#menuBtn').addEventListener('click', () => { $('#menu').hidden = !$('#menu').hidden; });
$('#setSel').addEventListener('change', e => { ST.set = e.target.value; hudAll(); });
$('#holeSel').innerHTML = C.holes.map(h => '<option value="' + (h.n - 1) + '">Hole ' + h.n + ' · par ' + h.par + ' · ' + h.yd + ' yd</option>').join('');
$('#holeSel').addEventListener('change', e => { $('#menu').hidden = true; startHole(+e.target.value); });
$('#restart').addEventListener('click', () => { ST.card = []; $('#menu').hidden = true; startHole(0); });
/* drag on the course to aim */
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, a: ST.aim }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drag || ST.phase !== 'aim') return; ST.aim = drag.a + (e.clientX - drag.x) * (clubObj().id === 'PT' ? 0.0015 : 0.004); });
canvas.addEventListener('pointerup', () => { drag = null; });
const keys = {};
addEventListener('keydown', e => {
  if (e.repeat && e.code === 'Space') return;
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); press(); }
  if (e.code === 'KeyQ' || e.code === 'ArrowUp') cycleClub(-1);
  if (e.code === 'KeyE' || e.code === 'ArrowDown') cycleClub(1);
  if (ST.phase === 'aim' && clubObj().id === 'PT') { if (e.code === 'Digit1') { ST.range = 'short'; hudAll(); } if (e.code === 'Digit2') { ST.range = 'long'; hudAll(); } }
  else { if (e.code === 'Digit1') { ST.spin = 'top'; hudAll(); } if (e.code === 'Digit2') { ST.spin = 'none'; hudAll(); } if (e.code === 'Digit3') { ST.spin = 'back'; hudAll(); } }
  if (e.code === 'KeyC') showCard(null);
});
addEventListener('keyup', e => { keys[e.code] = false; });

/* ---------- the frame ---------- */
let last = performance.now(), fpsN = 0, fpsT = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; fpsN++; if (now - fpsT > 1000) { window.GOLF.fps = fpsN; fpsN = 0; fpsT = now; }
  if (aimHold) turnAim(aimHold, dt); if (keys.ArrowLeft || keys.KeyA) turnAim(-1, dt); if (keys.ArrowRight || keys.KeyD) turnAim(1, dt);
  stepMeter(dt);
  const h = hole(), c = clubObj(), onGreen = 'ge'.includes(C.surf(ST.ball.x, ST.ball.y)) && c.id === 'PT';
  /* the flight: play the path back on its own clock */
  if (ST.phase === 'fly') {
    const r = ST.fly, P = r.path, speed = c.id === 'PT' ? 1 : 1.25; ST.flyT += dt * speed;
    let k = 0; while (k < P.length - 1 && P[k + 1][3] <= ST.flyT) k++;
    const a = P[k], b = P[Math.min(P.length - 1, k + 1)], u = b[3] > a[3] ? Math.min(1, (ST.flyT - a[3]) / (b[3] - a[3])) : 1;
    const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, y = a[2] + (b[2] - a[2]) * u;
    placeBall(x, z, y); trail.geometry.setDrawRange(0, k + 1);
    if (ST.flyT >= P[P.length - 1][3]) { ST.wait += dt; if (ST.wait > (c.id === 'PT' ? 0.5 : 0.9)) { ST.wait = 0; landed(); } }
  }
  /* the golfer stands across the ball from the target line, facing it (the target to its left). The operator: it stays at
     address while the meter runs; the swing plays after the last press and the shot leaves at its impact frame */
  const toward = [-Math.sin(ST.aim), Math.cos(ST.aim)];
  const gb = ST.phase === 'fly' ? ST.from : ST.ball;
  golfer.position.set(gb.x - toward[0] * stand, C.height(gb.x, gb.y), gb.y - toward[1] * stand);
  golfer.rotation.y = -ST.aim;
  if (ST.phase === 'aim' || ST.phase === 'rise' || ST.phase === 'fall') avPlay(c.id === 'PT' ? 'puttaddress' : 'golfaddress');
  AV.update(dt); drawClub();
  /* aim marks */
  const aiming = ST.phase !== 'fly' && ST.phase !== 'done';
  ring.visible = aimLine.visible = aiming;
  if (aiming) {
    const reach = reachNow(), tx = ST.ball.x + Math.cos(ST.aim) * reach, tz = ST.ball.y + Math.sin(ST.aim) * reach;
    ring.position.set(tx, C.height(tx, tz) + 0.05, tz); ring.scale.setScalar(c.id === 'PT' ? 0.3 : 1 + reach / 60);
    const pts = []; for (let k = 0; k <= 30; k++) { const u = k / 30, x = ST.ball.x + (tx - ST.ball.x) * u, z = ST.ball.y + (tz - ST.ball.y) * u, arc = c.id === 'PT' ? 0 : Math.sin(u * Math.PI) * reach * 0.05; pts.push(new THREE.Vector3(x, C.height(x, z) + 0.06 + arc, z)); }
    aimLine.geometry.dispose(); aimLine.geometry = new THREE.BufferGeometry().setFromPoints(pts); aimLine.computeLineDistances();
  }
  stepDots(dt, h, onGreen && aiming);
  waveFlag(now);
  const lie = ST.phase === 'fly' ? ST.from : ST.ball; flag.userData.stick.visible = C.surf(lie.x, lie.y) !== 'g';   /* the operator: the flag comes out while putting */
  /* the camera: behind the ball down the aim line; it follows the ball in flight */
  let want = ST.aim;
  if (ST.phase === 'fly') { want = ST.camYaw; }
  let dy = want - ST.camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); ST.camYaw += dy * Math.min(1, dt * 6);
  const fx = Math.cos(ST.camYaw), fz = Math.sin(ST.camYaw);
  const bp = ball.position, putting = c.id === 'PT' && ST.phase !== 'fly';
  const tall = camera.aspect < 1;   /* a phone held upright: stand further back and higher so the ball sits above the HUD */
  const back = (putting ? 3.6 : ST.phase === 'fly' ? 7 : 6.2) * (tall ? 1.35 : 1), hgt = (putting ? 1.9 : ST.phase === 'fly' ? 2.6 + (bp.y - C.height(bp.x, bp.z)) * 0.55 : 2.9) * (tall ? 1.45 : 1);
  const side = ST.phase === 'fly' ? 0 : putting ? 0.5 : 0.9;   /* a step to the right of the line, so the golfer stands clear of the view */
  tmp.set(bp.x - fx * back - fz * side, C.height(bp.x, bp.z) + hgt, bp.z - fz * back + fx * side);
  camPos.lerp(tmp, ST.phase === 'fly' ? Math.min(1, dt * 3.2) : Math.min(1, dt * 8));
  if (camPos.lengthSq() === 0 || camPos.distanceTo(tmp) > 120) camPos.copy(tmp);
  const ahead = (putting ? 4 : 14) * (tall ? 0.7 : 1), look = ST.phase === 'fly' ? bp : tmp.set(bp.x + fx * ahead, C.height(bp.x, bp.z) + (putting || tall ? 0 : 1), bp.z + fz * ahead);
  camLook.lerp(look, ST.phase === 'fly' ? Math.min(1, dt * 6) : Math.min(1, dt * 8)); if (camLook.lengthSq() === 0) camLook.copy(look);
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (window.GOLF.cam) { const o = window.GOLF.cam(); camera.position.set(o.pos.x, o.pos.y, o.pos.z); camera.lookAt(o.look.x, o.look.y, o.look.z); }   /* test hook: a fixed view (pose sheets) */
  SEE.uSeeD.value = Math.max(0, camPos.distanceTo(ball.position) - 2);
  if (aiming) drawMap();
  hudMeter(); hudWind();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
startHole(0);
window.GOLF = { ST, C, R, AV, clubAt: () => ({ grip: gripMesh.position.toArray(), head: headMesh.position.toArray() }), press, startHole, hudAll, place: (x, y) => { ST.ball = { x, y }; setupShot(false); } };   /* the test hooks */
requestAnimationFrame(frame);
