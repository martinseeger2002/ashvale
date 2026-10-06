/* ASHVALE globe view: the planet from space, for the map, parcel picking and (later) the claiming UI. GLOBE.md section 5.
   Module contract (no imports; three.js and the globe module are passed in; registers itself like weather.js):
     const V = createGlobeView(THREE, AshGlobe, {host, n, seed, radius_m, quality})
     V.select(cell)            highlight a cell and open its info panel (null closes it)
     V.lookAt(cell, dist)      move the camera above a cell; dist = distance from the planet centre in radii (1.02..6)
     V.screenOf(cell)          {x, y} in CSS pixels of the host, or null if the cell faces away / is off screen
     V.pick(x, y)              cell under a host pixel, or -1
     V.stats()                 draw calls, triangles, chunks built/visible, level, timings
     V.G                       the globe (AshGlobe.createGlobe result); V.dispose()
   Options for apps built on it (ASHVALE Atlas): title, subtitle (header text), actions [{id, label}] (buttons in the parcel
   panel), buttons [{id, label}] (extra buttons above Core/Peak/Globe), onAction(id, cell) (cell = the selected one or -1),
   onSelect(cell). Without them the page is exactly the P0 globe view.
   Levels of detail (each chunk is ONE mesh = one draw call, culled by frustum and horizon):
     far    dist >= 2.0   10 diamond meshes of the geodesic lattice, every 2nd lattice point, colours per vertex
     mid    1.5 .. 2.0    the same at every lattice point
     near   dist <  1.5   hexagon chunks of 16 x 16 cells (640 + 1 for the poles), built on demand within a per-frame
                          time budget; while a visible chunk is not built yet, its diamond's mid mesh is drawn under it
     borders dist < 1.12  thin cell outlines, one LineSegments per near chunk, also built on demand
   A cell is a fan of triangles around its centre; peaks (and lightly the wild forest) lift the centre, so the low-poly
   mountains need no extra geometry and leave no gaps. Nothing is allocated per frame; the page only renders when the
   camera moved, something was built, or the panel changed. */
(function (Gl) {
  'use strict';
  const COL = {
    core: [0xd6, 0xb0, 0x48], creator: [0x94, 0xcc, 0x5c], wild: [0x2f, 0x5f, 0x2d],
    seaShallow: [0x52, 0x92, 0xc4], seaDeep: [0x26, 0x55, 0x8c],
    peak0: [0xf4, 0xf3, 0xee], peak1: [0xd4, 0xd1, 0xc9], peak2: [0xa6, 0xa0, 0x95], peak3: [0x8a, 0x83, 0x78]
  };
  const HUD = { gold: '#ffcf3f', orange: '#ff981f', stone1: '#4a4034', stone2: '#3a3127', edge: '#1b1610', rim: '#6b5d48', slot: '#2c251c' };
  const CLS_HEX = { core: '#d6b048', creator: '#94cc5c', wild: '#2f5f2d', sea: '#3f78b5', peak: '#d4d1c9' };

  function createGlobeView(THREE, AshGlobe, opts) {
    const O = opts || {}, host = O.host;
    if (!host) throw new Error('globeview: needs {host}');
    const t0 = performance.now();
    const G = AshGlobe.createGlobe({ n: O.n || 128, radius_m: O.radius_m || 36110, seed: O.seed || 'ashvale' });
    const tGlobe = performance.now() - t0;
    const CL = G.classes(), codes = CL.codes, NAMES = CL.names;
    const tClasses = performance.now() - t0 - tGlobe;
    const n = G.n, nn = n * n, N = G.count, NB = G.raw.neighbours, DEG = G.raw.degree, P = G.raw.centres;
    const PHONE = O.quality ? O.quality === 'low' : /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);

    /* ---- per-cell colour and centre height, once ---- */
    const RGB = new Uint8Array(N * 3), RGBC = new Uint8Array(N * 3), HT = new Float32Array(N);
    const peakRing = new Int8Array(N).fill(-1), seaDist = new Int16Array(N).fill(-1);
    {
      const q = new Int32Array(N); let h = 0, t = 0;
      for (let c = 0; c < N; c++) if (DEG[c] === 5) { peakRing[c] = 0; q[t++] = c; }
      while (h < t) { const c = q[h++]; for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (peakRing[m] < 0 && NAMES[codes[m]] === 'peak') { peakRing[m] = peakRing[c] + 1; q[t++] = m; } } }
      h = 0; t = 0;
      for (let c = 0; c < N; c++) if (NAMES[codes[c]] === 'sea') { for (let k = 0; k < DEG[c]; k++) if (NAMES[codes[NB[c * 6 + k]]] !== 'sea') { seaDist[c] = 0; q[t++] = c; break; } }
      while (h < t) { const c = q[h++]; for (let k = 0; k < DEG[c]; k++) { const m = NB[c * 6 + k]; if (seaDist[m] < 0 && NAMES[codes[m]] === 'sea') { seaDist[m] = seaDist[c] + 1; q[t++] = m; } } }
    }
    function jit(c) { let a = Math.imul(c ^ 0x5bd1e995, 0x2c1b3c6d); a ^= a >>> 15; a = Math.imul(a, 0x297a2d39); return ((a ^ (a >>> 13)) >>> 0) / 4294967296; }
    for (let c = 0; c < N; c++) {
      const name = NAMES[codes[c]], r = jit(c);
      let col, top = null, ht = 0;
      if (name === 'peak') {
        const ring = peakRing[c] < 0 ? 3 : Math.min(3, peakRing[c]);
        col = [COL.peak0, COL.peak1, COL.peak2, COL.peak3][ring];
        ht = [0.0105, 0.0065, 0.0036, 0.0018][ring] * (0.85 + 0.3 * r);
        top = ring <= 1 ? COL.peak0 : COL.peak1;
      } else if (name === 'sea') {
        const k = Math.min(1, (seaDist[c] < 0 ? 0 : seaDist[c]) / 10);
        col = [0, 1, 2].map(i => COL.seaShallow[i] + (COL.seaDeep[i] - COL.seaShallow[i]) * k);
        ht = -0.0004;
      } else if (name === 'wild') { col = COL.wild; ht = 0.0009 + 0.0011 * r; }
      else if (name === 'core') { col = COL.core; ht = 0.0003 + 0.0005 * r; }
      else { col = COL.creator; ht = 0.0002 + 0.0003 * r; }
      const f = 0.93 + 0.14 * r;
      for (let i = 0; i < 3; i++) { RGB[c * 3 + i] = Math.max(0, Math.min(255, Math.round(col[i] * f))); RGBC[c * 3 + i] = top ? top[i] : RGB[c * 3 + i]; }
      HT[c] = ht;
    }

    /* ---- three.js scene ---- */
    const renderer = new THREE.WebGLRenderer({ antialias: !PHONE, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PHONE ? 1.75 : 2));
    renderer.setClearColor(0x0b0906, 1);
    host.appendChild(renderer.domElement);
    const cvs = renderer.domElement;
    cvs.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xfff4dc, 0x2a2418, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.9);
    camera.add(sun); sun.position.set(-0.6, 0.9, 0.4); sun.target.position.set(0, 0, -1); camera.add(sun.target);
    scene.add(camera);
    const matFine = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const matCoarse = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const matLine = new THREE.LineBasicMaterial({ color: 0x1b1610, transparent: true, opacity: 0.35, depthWrite: false });

    /* stars: one Points draw call, deterministic */
    {
      const S = 900, pos = new Float32Array(S * 3);
      for (let k = 0; k < S; k++) {
        const u = jit(k * 3 + 1) * 2 - 1, a = jit(k * 3 + 2) * Math.PI * 2, rr = Math.sqrt(1 - u * u), d = 12 + 4 * jit(k * 3 + 3);
        pos[k * 3] = rr * Math.cos(a) * d; pos[k * 3 + 1] = rr * Math.sin(a) * d; pos[k * 3 + 2] = u * d;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8dcc0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false })));
    }
    /* atmosphere: a painted radial glow behind the planet (one sprite, no texture download) */
    const glow = (function () {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'), gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(120,170,220,0.0)'); gr.addColorStop(0.80, 'rgba(120,170,220,0.0)');
      gr.addColorStop(0.865, 'rgba(150,195,235,0.55)'); gr.addColorStop(0.92, 'rgba(110,150,200,0.18)'); gr.addColorStop(1, 'rgba(80,110,160,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(2.31, 2.31, 1); sp.renderOrder = -1; scene.add(sp);
      return sp;
    })();

    /* ---- chunk tables ---- */
    const CS = Math.min(16, n), CPA = Math.ceil(n / CS), NCH = 10 * CPA * CPA + 1;
    const chC = new Float32Array(NCH * 3), chCos = new Float32Array(NCH), chR = new Float32Array(NCH);
    const chMesh = new Array(NCH).fill(null), chLine = new Array(NCH).fill(null);
    const tmp = new Float64Array(18);
    function chunkCells(k, out) {
      let m = 0;
      if (k === NCH - 1) { out[m++] = G.NORTH; out[m++] = G.SOUTH; return m; }
      const d = (k / (CPA * CPA)) | 0, r = k - d * CPA * CPA, ci = (r / CPA) | 0, cj = r - ci * CPA;
      for (let i = ci * CS; i < Math.min(n, ci * CS + CS); i++) for (let j = cj * CS; j < Math.min(n, cj * CS + CS); j++) out[m++] = d * nn + i * n + j;
      return m;
    }
    const cellBuf = new Int32Array(CS * CS + 2);
    for (let k = 0; k < NCH; k++) {
      const m = chunkCells(k, cellBuf);
      let x = 0, y = 0, z = 0;
      for (let a = 0; a < m; a++) { const c = cellBuf[a]; x += P[c * 3]; y += P[c * 3 + 1]; z += P[c * 3 + 2]; }
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      if (k === NCH - 1) { x = 0; y = 0; z = 1; }
      let mn = 1;
      for (let a = 0; a < m; a++) { const c = cellBuf[a], deg = G.cornersInto(c, tmp, 0); for (let e = 0; e < deg; e++) mn = Math.min(mn, tmp[e * 3] * x + tmp[e * 3 + 1] * y + tmp[e * 3 + 2] * z); }
      if (k === NCH - 1) mn = -1;
      chC[k * 3] = x; chC[k * 3 + 1] = y; chC[k * 3 + 2] = z; chCos[k] = mn; chR[k] = Math.acos(Math.max(-1, Math.min(1, mn)));
    }
    let triFine = 0, builtFine = 0, builtLines = 0;
    function buildChunk(k) {
      const m = chunkCells(k, cellBuf);
      let nv = 0, nt = 0;
      for (let a = 0; a < m; a++) { nv += DEG[cellBuf[a]] + 1; nt += DEG[cellBuf[a]]; }
      const pos = new Float32Array(nv * 3), col = new Uint8Array(nv * 3), idx = new Uint16Array(nt * 3);
      let v = 0, t = 0;
      for (let a = 0; a < m; a++) {
        const c = cellBuf[a], deg = G.cornersInto(c, tmp, 0), h = 1 + HT[c], base = v;
        pos[v * 3] = P[c * 3] * h; pos[v * 3 + 1] = P[c * 3 + 1] * h; pos[v * 3 + 2] = P[c * 3 + 2] * h;
        col[v * 3] = RGBC[c * 3]; col[v * 3 + 1] = RGBC[c * 3 + 1]; col[v * 3 + 2] = RGBC[c * 3 + 2]; v++;
        for (let e = 0; e < deg; e++) {
          pos[v * 3] = tmp[e * 3]; pos[v * 3 + 1] = tmp[e * 3 + 1]; pos[v * 3 + 2] = tmp[e * 3 + 2];
          col[v * 3] = RGB[c * 3]; col[v * 3 + 1] = RGB[c * 3 + 1]; col[v * 3 + 2] = RGB[c * 3 + 2]; v++;
        }
        for (let e = 0; e < deg; e++) { idx[t++] = base; idx[t++] = base + 1 + e; idx[t++] = base + 1 + (e + 1) % deg; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(chC[k * 3], chC[k * 3 + 1], chC[k * 3 + 2]), 2 * Math.sin(chR[k] / 2) + 0.012);
      const mesh = new THREE.Mesh(g, matFine);
      mesh.matrixAutoUpdate = false; mesh.visible = false; mesh.frustumCulled = false;
      scene.add(mesh); chMesh[k] = mesh; triFine += nt; builtFine++;
    }
    function buildLines(k) {
      const m = chunkCells(k, cellBuf);
      let ne = 0;
      for (let a = 0; a < m; a++) { const c = cellBuf[a]; for (let e = 0; e < DEG[c]; e++) if (c < NB[c * 6 + (e + 1) % DEG[c]]) ne++; }
      const pos = new Float32Array(ne * 6); let w = 0;
      const lift = 1.0006;
      for (let a = 0; a < m; a++) {
        const c = cellBuf[a], deg = G.cornersInto(c, tmp, 0);
        for (let e = 0; e < deg; e++) {
          const e2 = (e + 1) % deg;
          if (!(c < NB[c * 6 + e2])) continue;
          pos[w++] = tmp[e * 3] * lift; pos[w++] = tmp[e * 3 + 1] * lift; pos[w++] = tmp[e * 3 + 2] * lift;
          pos[w++] = tmp[e2 * 3] * lift; pos[w++] = tmp[e2 * 3 + 1] * lift; pos[w++] = tmp[e2 * 3 + 2] * lift;
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const ls = new THREE.LineSegments(g, matLine);
      ls.matrixAutoUpdate = false; ls.visible = false; ls.frustumCulled = false; ls.renderOrder = 1;
      scene.add(ls); chLine[k] = ls; builtLines++;
    }

    /* ---- coarse diamond meshes (stride 2 = far, stride 1 = mid) ---- */
    const dC = new Float32Array(30), dCos = new Float32Array(10);
    for (let d = 0; d < 10; d++) {
      const D = AshGlobe.DIAMONDS[d], IV = AshGlobe.icosahedron();
      let x = 0, y = 0, z = 0; for (const v of D) { x += IV[v][0]; y += IV[v][1]; z += IV[v][2]; }
      const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
      let mn = 1; for (const v of D) mn = Math.min(mn, IV[v][0] * x + IV[v][1] * y + IV[v][2] * z);
      dC[d * 3] = x; dC[d * 3 + 1] = y; dC[d * 3 + 2] = z; dCos[d] = mn;
    }
    const coarse = { 1: new Array(10).fill(null), 2: new Array(10).fill(null) };
    const triCoarse = { 1: 0, 2: 0 };
    function buildCoarse(d, s) {
      const m = Math.ceil(n / s), side = m + 1, nv = side * side;
      const pos = new Float32Array(nv * 3), col = new Uint8Array(nv * 3), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(m * m * 6);
      for (let a = 0; a <= m; a++) for (let b = 0; b <= m; b++) {
        const c = G.gid(d, Math.min(n, a * s), Math.min(n, b * s)), v = a * side + b, h = 0.997 + HT[c] * 0.8;
        pos[v * 3] = P[c * 3] * h; pos[v * 3 + 1] = P[c * 3 + 1] * h; pos[v * 3 + 2] = P[c * 3 + 2] * h;
        col[v * 3] = RGB[c * 3]; col[v * 3 + 1] = RGB[c * 3 + 1]; col[v * 3 + 2] = RGB[c * 3 + 2];
      }
      const IV = AshGlobe.icosahedron(), D = AshGlobe.DIAMONDS[d], A = IV[D[0]], B = IV[D[1]], C = IV[D[3]];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const ccw = (uy * vz - uz * vy) * (A[0] + B[0] + C[0]) + (uz * vx - ux * vz) * (A[1] + B[1] + C[1]) + (ux * vy - uy * vx) * (A[2] + B[2] + C[2]) > 0;
      let t = 0;
      for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
        const q00 = a * side + b, q10 = (a + 1) * side + b, q11 = (a + 1) * side + b + 1, q01 = a * side + b + 1;
        if (ccw) { idx[t++] = q00; idx[t++] = q10; idx[t++] = q11; idx[t++] = q00; idx[t++] = q11; idx[t++] = q01; }
        else { idx[t++] = q00; idx[t++] = q11; idx[t++] = q10; idx[t++] = q00; idx[t++] = q01; idx[t++] = q11; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const mesh = new THREE.Mesh(g, matCoarse);
      mesh.matrixAutoUpdate = false; mesh.visible = false; mesh.frustumCulled = false;
      scene.add(mesh); coarse[s][d] = mesh; triCoarse[s] += m * m * 2;
      return mesh;
    }
    for (let d = 0; d < 10; d++) buildCoarse(d, 2);

    /* ---- the selection outline (one LineLoop, updated in place on tap) ---- */
    const selPos = new Float32Array(7 * 3);
    const selGeo = new THREE.BufferGeometry(); selGeo.setAttribute('position', new THREE.BufferAttribute(selPos, 3));
    const selLine = new THREE.LineLoop(selGeo, new THREE.LineBasicMaterial({ color: 0xffcf3f, depthTest: false, transparent: true }));
    selLine.visible = false; selLine.frustumCulled = false; selLine.renderOrder = 3; scene.add(selLine);

    /* ---- camera state ---- */
    const cam = { lat: 20, lon: -30, dist: 3.1, vlat: 0, vlon: 0 };
    { const ll = G.latlon(CL.coreCenter); cam.lat = ll[0] * 0.6; cam.lon = ll[1]; }
    let W = 1, H = 1, dirty = true, selected = -1, level = 'far';
    const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 1), v3 = new THREE.Vector3();
    function resize() {
      W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
      renderer.setSize(W, H, false); camera.aspect = W / H;
      camera.fov = W / H < 0.75 ? 52 : 40;
      camera.updateProjectionMatrix(); dirty = true;
    }
    function fitDist() {
      const t = Math.tan(camera.fov * Math.PI / 360) * Math.min(1, camera.aspect);
      return Math.min(6, Math.max(2.6, 1.08 / Math.sin(Math.atan(t))));
    }
    function placeCamera() {
      cam.lat = Math.max(-89.5, Math.min(89.5, cam.lat));
      cam.dist = Math.max(1.02, Math.min(6, cam.dist));
      const a = cam.lat * Math.PI / 180, b = cam.lon * Math.PI / 180;
      camera.position.set(Math.cos(a) * Math.cos(b) * cam.dist, Math.cos(a) * Math.sin(b) * cam.dist, Math.sin(a) * cam.dist);
      camera.near = Math.max(0.002, (cam.dist - 1) * 0.3); camera.far = cam.dist + 18;
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    }

    /* ---- per-frame visibility (no allocation) ---- */
    let visFine = 0, visCoarse = 0, buildMs = 0, pendingVisible = 0;
    const diamondNeedsFallback = new Uint8Array(10);
    function visible(cx, cy, cz, cosR, rAng, camx, camy, camz, horizon) {
      const dp = cx * camx + cy * camy + cz * camz;
      if (Math.acos(Math.max(-1, Math.min(1, dp))) > horizon + rAng) return false;
      sph.center.set(cx, cy, cz); sph.radius = 2 * Math.sin(Math.min(Math.PI / 2, rAng) / 2) + 0.012;
      if (cosR < 0) sph.radius = 1.02;
      return frustum.intersectsSphere(sph);
    }
    function update() {
      placeCamera();
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
      const L = cam.dist, cx = camera.position.x / L, cy = camera.position.y / L, cz = camera.position.z / L;
      const horizon = Math.acos(1 / L) + 0.02;
      level = L >= 2.0 ? 'far' : L >= 1.5 ? 'mid' : 'near';
      glow.visible = L > 1.25;
      visFine = 0; visCoarse = 0; pendingVisible = 0;
      diamondNeedsFallback.fill(0);
      const tB = performance.now(); let budgetOk = true;
      for (let k = 0; k < NCH; k++) {
        const show = level === 'near' && visible(chC[k * 3], chC[k * 3 + 1], chC[k * 3 + 2], chCos[k], chR[k], cx, cy, cz, horizon);
        if (show && !chMesh[k]) {
          if (budgetOk) { buildChunk(k); dirty = true; if (performance.now() - tB > (PHONE ? 6 : 10)) budgetOk = false; }
          else { pendingVisible++; diamondNeedsFallback[k === NCH - 1 ? 0 : (k / (CPA * CPA)) | 0] = 1; }
        }
        if (chMesh[k]) { chMesh[k].visible = show; if (show) visFine++; }
        const lines = show && L < 1.12;
        if (lines && !chLine[k]) { if (budgetOk) { buildLines(k); dirty = true; if (performance.now() - tB > (PHONE ? 6 : 10)) budgetOk = false; } else pendingVisible++; }
        if (chLine[k]) chLine[k].visible = lines;
      }
      buildMs = performance.now() - tB;
      for (let d = 0; d < 10; d++) {
        const s = level === 'far' ? 2 : 1;
        const want = (level !== 'near' || diamondNeedsFallback[d] === 1) && visible(dC[d * 3], dC[d * 3 + 1], dC[d * 3 + 2], dCos[d], Math.acos(dCos[d]), cx, cy, cz, horizon);
        if (want && !coarse[s][d]) buildCoarse(d, s);
        for (let ss = 1; ss <= 2; ss++) if (coarse[ss][d]) { const on = !!want && ss === s; coarse[ss][d].visible = on; if (on) visCoarse++; }
      }
      if (pendingVisible) dirty = true;
    }

    /* ---- picking ---- */
    function pick(px, py) {
      v3.set((px / W) * 2 - 1, -(py / H) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
      const o = camera.position, b = o.x * v3.x + o.y * v3.y + o.z * v3.z, c = o.x * o.x + o.y * o.y + o.z * o.z - 1, disc = b * b - c;
      if (disc < 0) return -1;
      const t = -b - Math.sqrt(disc);
      return G.cellAt([o.x + v3.x * t, o.y + v3.y * t, o.z + v3.z * t]);
    }
    function screenOf(cell) {
      const h = 1 + HT[cell];
      v3.set(P[cell * 3] * h, P[cell * 3 + 1] * h, P[cell * 3 + 2] * h);
      const facing = (camera.position.x - v3.x) * v3.x + (camera.position.y - v3.y) * v3.y + (camera.position.z - v3.z) * v3.z;
      if (facing <= 0) return null;
      v3.project(camera);
      if (Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1) return null;
      return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H };
    }

    /* ---- DOM: panel, legend, buttons (ASHVALE hud colours) ---- */
    const css = document.createElement('style');
    css.textContent =
      '.gv{position:absolute;inset:0;pointer-events:none;font:600 13px/1.3 "Trebuchet MS",Verdana,system-ui,sans-serif;color:' + HUD.gold + ';-webkit-user-select:none;user-select:none}' +
      '.gv .stone{background:linear-gradient(' + HUD.stone1 + ',' + HUD.stone2 + ');border:2px solid ' + HUD.edge + ';box-shadow:inset 0 0 0 1px ' + HUD.rim + ',0 2px 6px #0008;border-radius:6px;pointer-events:auto}' +
      '.gv .title{position:absolute;left:12px;top:max(10px,env(safe-area-inset-top));padding:6px 10px;font:700 15px Georgia,serif;color:' + HUD.orange + '}' +
      '.gv .title small{display:block;font:600 11px "Trebuchet MS",Verdana,sans-serif;color:#c8b48a}' +
      '.gv .legend{position:absolute;left:12px;bottom:max(12px,env(safe-area-inset-bottom));padding:6px 9px;font-size:12px}' +
      '.gv .legend div{display:flex;align-items:center;gap:6px;margin:2px 0;white-space:nowrap}.gv .legend b{color:#c8b48a;font-weight:600;margin-left:auto;padding-left:8px}' +
      '.gv .sw{width:12px;height:12px;border-radius:3px;border:1px solid ' + HUD.edge + ';flex:none}' +
      '.gv .btns{position:absolute;right:12px;bottom:max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px}' +
      '.gv .btn{min-width:44px;min-height:40px;padding:6px 10px;background:linear-gradient(#5a4c3a,#433829);border:1px solid ' + HUD.edge + ';box-shadow:inset 0 0 0 1px #7b6b52;border-radius:5px;color:' + HUD.gold + ';font:inherit;cursor:pointer;pointer-events:auto}' +
      '.gv .btn:active{background:linear-gradient(#7a3a22,#5a2a18)}' +
      '.gv .panel{box-sizing:border-box;position:absolute;right:12px;top:max(10px,env(safe-area-inset-top));width:min(280px,calc(100vw - 24px));padding:10px 12px;display:none;font-weight:400;color:#f3e6c4}' +
      '.gv .panel h4{margin:0 0 6px;font-size:14px;color:' + HUD.orange + ';display:flex;justify-content:space-between;align-items:center}' +
      '.gv .panel .x{width:30px;height:30px;border-radius:4px;background:#7a2a18;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid #000;font-weight:700}' +
      '.gv .panel dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:0}.gv .panel dt{color:#c8b48a}.gv .panel dd{margin:0;color:' + HUD.gold + '}' +
      '.gv .panel .nb{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.gv .panel .nb span{padding:3px 6px;border-radius:4px;background:' + HUD.slot + ';box-shadow:inset 0 0 0 1px #4b4032;cursor:pointer;font-size:12px;color:' + HUD.gold + '}' +
      '@media (max-width:520px){.gv.sel .btns{display:none}.gv .panel{top:auto;bottom:max(12px,env(safe-area-inset-bottom));right:auto;left:12px;width:calc(100vw - 96px);box-sizing:border-box}.gv .legend.hide{display:none}}';
    document.head.appendChild(css);
    const ui = document.createElement('div'); ui.className = 'gv'; host.appendChild(ui);
    const cnt = CL.counts;
    ui.innerHTML =
      '<div class="title stone">' + (O.title || 'ASHVALE globe') + '<small>' + (O.subtitle || (N.toLocaleString('en-US') + ' parcels &middot; n = ' + n + ' &middot; radius ' + (G.radius_m / 1000).toFixed(1) + ' km')) + '</small></div>' +
      '<div class="legend stone">' + ['core', 'creator', 'wild', 'sea', 'peak'].map(k => '<div><span class="sw" style="background:' + CLS_HEX[k] + '"></span>' + k + '<b>' + cnt[k].toLocaleString('en-US') + '</b></div>').join('') + '</div>' +
      '<div class="btns">' + (O.buttons || []).map(b => '<button class="btn" data-u="' + b.id + '">' + b.label + '</button>').join('') + '<button class="btn" data-a="in">+</button><button class="btn" data-a="out">&minus;</button><button class="btn" data-a="core">Core</button><button class="btn" data-a="peak">Peak</button><button class="btn" data-a="globe">Globe</button></div>' +
      '<div class="panel stone"></div>';
    const panel = ui.querySelector('.panel'), legend = ui.querySelector('.legend');
    let peakIdx = 0;
    ui.querySelector('.btns').addEventListener('click', function (e) {
      const u = e.target && e.target.getAttribute && e.target.getAttribute('data-u');
      if (u) { if (O.onAction) O.onAction(u, selected); return; }
      const a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return;
      if (a === 'in') { cam.dist = 1 + (cam.dist - 1) / 1.6; }
      else if (a === 'out') { cam.dist = 1 + (cam.dist - 1) * 1.6; }
      else if (a === 'core') { lookAt(CL.coreCenter, 1.35); }
      else if (a === 'peak') { const pents = []; for (let c = 0; c < N; c++) if (DEG[c] === 5) pents.push(c); lookAt(pents[peakIdx++ % 12], 1.08); }
      else if (a === 'globe') { cam.dist = fitDist(); }
      dirty = true;
    });
    function fmtLat(v, pos, neg) { return Math.abs(v).toFixed(3) + '&deg; ' + (v >= 0 ? pos : neg); }
    function select(cell) {
      if (cell == null || cell < 0) { selected = -1; selLine.visible = false; panel.style.display = 'none'; ui.classList.remove('sel'); legend.classList.remove('hide'); dirty = true; return; }
      selected = cell;
      const deg = G.cornersInto(cell, tmp, 0), lift = 1.0003;
      for (let e = 0; e < 7; e++) { const s = e % deg; selPos[e * 3] = tmp[s * 3] * lift; selPos[e * 3 + 1] = tmp[s * 3 + 1] * lift; selPos[e * 3 + 2] = tmp[s * 3 + 2] * lift; }
      selGeo.setDrawRange(0, deg); selGeo.attributes.position.needsUpdate = true; selLine.visible = true;
      const q = G.dij(cell), ll = G.latlon(cell), pl = G.planar(cell), nb = G.neighbors(cell), name = NAMES[codes[cell]];
      panel.innerHTML = '<h4><span>Parcel ' + cell + '</span><span class="x" data-x="1">&times;</span></h4><dl>' +
        '<dt>diamond</dt><dd>' + (q.pole ? (q.pole === 'N' ? 'north pole' : 'south pole') : 'd ' + q.d + ', i ' + q.i + ', j ' + q.j) + '</dd>' +
        '<dt>lat / lon</dt><dd>' + fmtLat(ll[0], 'N', 'S') + ', ' + fmtLat(ll[1], 'E', 'W') + '</dd>' +
        '<dt>class</dt><dd><span class="sw" style="display:inline-block;vertical-align:-2px;margin-right:5px;background:' + CLS_HEX[name] + '"></span>' + name + '</dd>' +
        '<dt>shape</dt><dd>' + (G.isPentagon(cell) ? 'pentagon (a corner peak)' : 'hexagon') + '</dd>' +
        '<dt>face</dt><dd>' + pl.face + ' &middot; x ' + (pl.x / 1000).toFixed(2) + ' km, y ' + (pl.y / 1000).toFixed(2) + ' km</dd>' +
        '</dl><div style="margin-top:6px;color:#c8b48a">neighbours (' + nb.length + ')</div><div class="nb">' + nb.map(m => '<span data-c="' + m + '">' + m + '</span>').join('') + '</div>' +
        (O.actions && O.actions.length ? '<div style="display:flex;gap:6px;margin-top:8px">' + O.actions.map(b => '<button class="btn" data-u="' + b.id + '" style="flex:1">' + b.label + '</button>').join('') + '</div>' : '');
      panel.style.display = 'block'; legend.classList.add('hide'); ui.classList.add('sel'); dirty = true;
      if (O.onSelect) O.onSelect(cell);
    }
    panel.addEventListener('click', function (e) {
      const t = e.target; if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-u')) { if (O.onAction) O.onAction(t.getAttribute('data-u'), selected); return; }
      if (t.getAttribute('data-x')) select(null);
      else if (t.getAttribute('data-c')) select(+t.getAttribute('data-c'));
    });
    function lookAt(cell, dist) {
      const ll = G.latlon(cell); cam.lat = ll[0]; cam.lon = ll[1]; if (dist) cam.dist = dist; cam.vlat = cam.vlon = 0; dirty = true;
    }

    /* ---- input: drag rotates, pinch / wheel zooms, tap picks (pointer events: mouse, touch, pen) ---- */
    const ptrs = new Map();
    let downX = 0, downY = 0, downT = 0, moved = 0, pinch0 = 0, dist0 = 0, lastX = 0, lastY = 0, lastMoveT = 0;
    function rate() { return Math.max(0.0006, (cam.dist - 1) * 2 * Math.tan(camera.fov * Math.PI / 360) / H) * 180 / Math.PI; }
    cvs.addEventListener('pointerdown', function (e) {
      cvs.setPointerCapture && cvs.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { downX = lastX = e.clientX; downY = lastY = e.clientY; downT = performance.now(); moved = 0; cam.vlat = cam.vlon = 0; }
      if (ptrs.size === 2) { const a = [...ptrs.values()]; pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; dist0 = cam.dist; moved = 99; }
    });
    cvs.addEventListener('pointermove', function (e) {
      const p = ptrs.get(e.pointerId); if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size >= 2) {
        let a = null, b = null; for (const v of ptrs.values()) { if (!a) a = v; else if (!b) b = v; }
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        cam.dist = 1 + (dist0 - 1) * pinch0 / d; dirty = true; return;
      }
      const dx = e.clientX - lastX, dy = e.clientY - lastY, r = rate(), now = performance.now();
      lastX = e.clientX; lastY = e.clientY;
      moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
      if (moved < 4) return;
      const kl = Math.cos(cam.lat * Math.PI / 180);
      cam.lon -= dx * r / Math.max(0.15, kl); cam.lat += dy * r;
      const dt = Math.max(1, now - lastMoveT); lastMoveT = now;
      cam.vlon = -dx * r / Math.max(0.15, kl) / dt * 16; cam.vlat = dy * r / dt * 16;
      dirty = true;
    });
    function up(e) {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) {
        if (moved < 6 && performance.now() - downT < 600) {
          const rc = cvs.getBoundingClientRect(), c = pick(e.clientX - rc.left, e.clientY - rc.top);
          select(c >= 0 ? c : null); cam.vlat = cam.vlon = 0;
        } else if (performance.now() - lastMoveT > 80) { cam.vlat = cam.vlon = 0; }
      } else if (ptrs.size === 1) { const v = ptrs.values().next().value; lastX = v.x; lastY = v.y; moved = 99; }
    }
    cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('wheel', function (e) { e.preventDefault(); cam.dist = 1 + (cam.dist - 1) * Math.exp(e.deltaY * 0.0015); dirty = true; }, { passive: false });
    window.addEventListener('resize', resize);

    /* ---- loop: render only when something changed ---- */
    let raf = 0, frames = 0, lastCalls = 0, lastTris = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      if (Math.abs(cam.vlat) + Math.abs(cam.vlon) > 1e-4 && ptrs.size === 0) { cam.lat += cam.vlat; cam.lon += cam.vlon; cam.vlat *= 0.92; cam.vlon *= 0.92; dirty = true; }
      if (!dirty) return;
      dirty = false;
      update();
      renderer.render(scene, camera);
      lastCalls = renderer.info.render.calls; lastTris = renderer.info.render.triangles; frames++;
    }
    resize(); cam.dist = fitDist(); frame();

    function stats() {
      return { level, dist: cam.dist, calls: lastCalls, triangles: lastTris, frames, chunks: NCH, chunkCells: CS, builtFine, builtLines, visFine, visCoarse,
               pendingVisible, triFineBuilt: triFine, triCoarse: { far: triCoarse[2], mid: triCoarse[1] }, buildMs, msGlobe: tGlobe, msClasses: tClasses,
               trisPerFullChunk: CS * CS * 6, triFineTotalEstimate: N * 6 - 12, selected };
    }
    function dispose() {
      cancelAnimationFrame(raf); window.removeEventListener('resize', resize);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose(); host.removeChild(cvs); host.removeChild(ui);
    }
    return { api: 1, G, select, lookAt, screenOf, pick, stats, dispose, cam, render: () => { dirty = true; } };
  }

  if (Gl.ASH3D && Gl.ASH3D.define) Gl.ASH3D.define('globeview', { api: 1, v: 1, needs: { three: 160, globe: 1 } }, function () { return { api: 1, createGlobeView: createGlobeView }; });
  Gl.AshGlobeView = { api: 1, createGlobeView: createGlobeView };
})(typeof globalThis !== 'undefined' ? globalThis : this);
