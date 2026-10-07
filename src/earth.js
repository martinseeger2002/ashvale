/* ASHVALE Atlas, seamless (module earth, api 1). 2026-10-03: "zoom in all the way from the entire global view all
   the way down to the rendered game view ... it should be seamless". One renderer, one camera, one scene in metres:
     planet   the 20 icosahedron faces of the globe, each a triangle quadtree of terrain patches sampled from worldgen
              (heights, water, forest, snow), split by screen size down to ~2 m spacing, built a few ms per frame
     ground   under GROUND_ALT the game's own 64 m chunks (atlas_chunk: tiles, trees, rocks, buildings, set pieces) are
              placed on the same planet with a per-chunk tangent frame; the patches under them sink out of sight
   Floating origin: everything is positioned relative to the camera each frame (the camera sits at 0, 0, 0), so 1 m
   detail stays exact on a 36 km planet. Heights are exaggerated from orbit (so ranges read) and are true near the ground.
     const app = earth.start(host, opts)       URL: ?at=ashvale|saltmere|globe  ?lat=&lon=&alt=  ?low
   Debug handle: window.EARTH = {flyTo(name|{lat,lon,alt}), state(), stats(), setAlt(m)} */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1, needs: { three: 160, globe: 1, worldgen: 1, atlas_chunk: 1, atlas_shapes: 1, data: 1 } };
  const K = 24, MAXL = 10, GROUND_ALT = 650, MIN_ALT = 6, MAX_ALT = 120000;

  function factory(deps) {
    function start(host, opts) {
      const O = opts || {}, THREE = deps.three, DATA = deps.data || {}, q = new URLSearchParams(location.search);
      const PHONE = q.has('low') || /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);
      const CFG = Object.assign({ seed: 'ashvale', n: 128, radius_m: 36110, belt: {} }, DATA.globecfg || {});
      const PAL = DATA.atlas_palette;
      const G = deps.globe.createGlobe({ n: CFG.n, radius_m: CFG.radius_m, seed: CFG.seed });
      const W = deps.worldgen.createWorldgen(G, { seed: CFG.seed });
      const zones = Object.keys(DATA).filter(k => k.indexOf('zone.') === 0).map(k => Object.assign({ id: k.slice(5) }, DATA[k])).filter(z => !z.under);   /* an underground area (the Spider Cave) is not on the land */
      if (zones.length && CFG.origin) W.setSetPieces(W.piecesFromZones(zones, CFG.face, CFG.origin[0], CFG.origin[1], { belt: CFG.belt || {}, links: CFG.links || [] }));
      const R = G.radius_m, CL = G.classes();

      /* ---- colours (natural; the parcel map is an overlay) ---- */
      const rgb = h => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
      const GRASS = rgb(PAL.tile['.']), DRY = rgb(PAL.tile.g || '#b8ac62'), TUND = rgb(PAL.tile.q || '#a9b29c'), SAND = rgb(PAL.tile.s), CANOPY = [0x3a, 0x66, 0x2a], ROCK = rgb(PAL.rock), ROCKD = rgb(PAL.rockDark), SNOW = rgb(PAL.snow);
      const SEA0 = [0x52, 0x92, 0xc4], SEA1 = [0x26, 0x55, 0x8c], PATH = rgb(PAL.tile.p);
      const CLSCOL = [[0x94, 0xcc, 0x5c], [0xd6, 0xb0, 0x48], [0x2f, 0x5f, 0x2d], [0x3a, 0x7a, 0xc0], [0xf4, 0xf3, 0xee]];
      const SL = PAL.snowLine || 110, TS = PAL.treeSnow || [55, 82], AL = PAL.alpine || [88, 105];
      const mix = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };
      const cl01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
      const hsh = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
      const T3 = [0, 0, 0], T4 = [0, 0, 0];
      function colourOf(s, px, py, out) {
        const h = s.h;
        if (h < W.WATER) { mix(SEA0, SEA1, cl01(-h / 3.5), out); return out; }
        if (s.river > 3.5) { out[0] = 0xdc; out[1] = 0xea; out[2] = 0xf2; return out; }   /* ice */
        if (s.river > 0.5) { out[0] = SEA0[0]; out[1] = SEA0[1]; out[2] = SEA0[2]; return out; }
        const gz = s.clim === 2 || s.clim === 4 ? DRY : s.clim === 7 ? TUND : GRASS;
        mix(gz, SAND, cl01(s.sand * 1.4), out);
        const can = mix(s.clim === 5 ? [0x24, 0x52, 0x22] : s.clim === 6 ? [0x2c, 0x50, 0x34] : CANOPY, SNOW, cl01((h - TS[0]) / (TS[1] - TS[0])) * 0.6, T3);
        mix(out, can, cl01(s.forest * 0.9), out);
        if (h > AL[0]) mix(out, hsh(px >> 3, py >> 3) < 0.5 ? ROCK : ROCKD, cl01((h - AL[0]) / (AL[1] - AL[0])) * 0.85, out);
        if (s.peakS > 0.05) mix(out, ROCK, cl01(s.peakS * 1.5), out);
        const edge = SL + (hsh(px >> 4, py >> 4) - 0.5) * 14;
        if (h > edge - 3) mix(out, SNOW, cl01((h - edge + 3) / 6), out);
        return out;
      }

      /* ---- renderer, scene, lights, sky ---- */
      const renderer = new THREE.WebGLRenderer({ antialias: !PHONE, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PHONE ? 1.5 : 2));
      const canvas = renderer.domElement; canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      host.appendChild(canvas);
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4e6);
      scene.add(camera);
      /* lit by the sun alone, with a little night-blue so the dark side is still faintly readable (2026-10-07) */
      const amb = new THREE.AmbientLight(0x8fa4d8, 0.22), sun = new THREE.DirectionalLight(0xfff2dc, 2.5);
      scene.add(amb, sun, sun.target);
      const SPACE = new THREE.Color(0x05070d), SKY = new THREE.Color(PAL.sky || '#a7c8e6'), bg = new THREE.Color();
      scene.background = bg; scene.fog = new THREE.Fog(SKY.clone(), 1e6, 2e6);
      { /* stars */
        const n = 1800, p = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const z = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - z * z); p[i * 3] = r * Math.cos(a) * 3e6; p[i * 3 + 1] = r * Math.sin(a) * 3e6; p[i * 3 + 2] = z * 3e6; }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        var stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8e2d0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
        stars.frustumCulled = false; camera.add(stars);
      }

      /* terrain material: exaggeration, sinking under the ground chunks, the parcel overlay */
      const U = { uEx: { value: 1 }, uDetC: { value: new THREE.Vector3() }, uDetR: { value: -1 }, uParcel: { value: 0 } };
      const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
      terrainMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 up;\nattribute float hh;\nattribute vec3 ccol;\nuniform float uEx;\nuniform vec3 uDetC;\nuniform float uDetR;\nuniform float uParcel;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += up * (hh * (uEx - 1.0));\n' +
            'if (uDetR > 0.0 && hh > 0.05) { vec3 wq = (modelMatrix * vec4(transformed, 1.0)).xyz; float dd = length(wq - uDetC); transformed -= up * (0.9 * (1.0 - smoothstep(uDetR - 12.0, uDetR, dd))); }')
          .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, ccol * (0.55 + 0.45 * vColor.rgb), uParcel);');
      };
      const chunkMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

      /* the river network as lines (the operator: rivers are continuous, a tree of branches from the divide to the sea): from
         the air a 2-14 m river is thinner than the terrain patches can show, so the whole network is drawn as water
         lines at its own level, faded out close to the ground where the carved channels take over */
      let riverLines = null;
      { const RL = W.riverLines && W.riverLines();
        if (RL && RL.pos.length) {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(RL.pos, 3)); g.setAttribute('lv', new THREE.BufferAttribute(RL.level, 1));
          g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.2);
          const rm = new THREE.LineBasicMaterial({ color: 0x3f86c0, transparent: true, opacity: 1, depthWrite: false, fog: false });
          rm.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uEx: U.uEx, uR: { value: R } });
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float lv;\nuniform float uEx;\nuniform float uR;')
              .replace('#include <begin_vertex>', 'vec3 transformed = position * (uR + lv * uEx + 1.5 + uEx * 1.5);'); };
          riverLines = new THREE.LineSegments(g, rm); riverLines.matrixAutoUpdate = false; riverLines.frustumCulled = false; scene.add(riverLines);
        } }
      /* the EQUATOR (2026-10-06: "the Atlas should show the equator and the poles marked"): a gold line round the
         planet at latitude 0, lying on the ground and the sea like the rivers do (unit vectors + the ground height there,
         lifted by the same exaggeration in the shader). Built once its ground heights are known (toPlanar is defined below). */
      let equatorLine = null;
      const EQW = { value: 0 };   /* the band's half width on the unit sphere, set each frame from the altitude */
      function buildEquator() {   /* a gold band round the planet (a 1-pixel line is lost from orbit), on the ground like the rivers */
        const NQ = 2048, pos = new Float32Array((NQ + 1) * 6), lv = new Float32Array((NQ + 1) * 2), side = new Float32Array((NQ + 1) * 2), idx = [];
        for (let k = 0; k <= NQ; k++) {
          const a = k / NQ * 2 * Math.PI, u = [Math.cos(a), Math.sin(a), 0], pl = toPlanar(u), h = Math.max(W.WATER, W.sample(pl.face, pl.x, pl.y).h);
          pos.set(u, k * 6); pos.set(u, k * 6 + 3); lv[k * 2] = lv[k * 2 + 1] = h; side[k * 2] = -1; side[k * 2 + 1] = 1;
          if (k < NQ) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('lv', new THREE.BufferAttribute(lv, 1)); g.setAttribute('sd', new THREE.BufferAttribute(side, 1)); g.setIndex(idx);
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.2);
        const m = new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.7, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
        m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uEx: U.uEx, uR: { value: R }, uW: EQW });
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float lv;\nattribute float sd;\nuniform float uEx;\nuniform float uR;\nuniform float uW;')
            .replace('#include <begin_vertex>', 'vec3 transformed = normalize(position + vec3(0.0, 0.0, sd * uW)) * (uR + lv * uEx + 2.0 + uEx * 2.0);'); };
        equatorLine = new THREE.Mesh(g, m); equatorLine.matrixAutoUpdate = false; equatorLine.frustumCulled = false; scene.add(equatorLine);
      }

      /* ---- the terrain quadtree ---- */
      const FC = []; for (let f = 0; f < 20; f++) FC.push(W.faceCorners(f));
      const nodes = [], buildQ = new Set(), staleQ = [];   /* staleQ: patches an editor stroke touched, rebuilt in place (no gap, no hitch) */
      let frame = 0, built = 0, live = 0;
      function newNode(f, a, b, c, L, parent) {
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, u = W.toSphere(f, cx, cy);
        const edge = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
        return { f, a, b, c, L, parent, kids: null, mesh: null, C: [u[0] * R, u[1] * R, u[2] * R], u, edge, rad: edge * 0.62, used: 0, want: 0 };
      }
      const roots = []; for (let f = 0; f < 20; f++) roots.push(newNode(f, FC[f][0], FC[f][1], FC[f][2], 0, null));
      function kidsOf(nd) {
        if (nd.kids) return nd.kids;
        const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ab = m(nd.a, nd.b), bc = m(nd.b, nd.c), ca = m(nd.c, nd.a);
        nd.kids = [newNode(nd.f, nd.a, ab, ca, nd.L + 1, nd), newNode(nd.f, ab, nd.b, bc, nd.L + 1, nd), newNode(nd.f, ca, bc, nd.c, nd.L + 1, nd), newNode(nd.f, bc, ca, ab, nd.L + 1, nd)];
        return nd.kids;
      }
      const NV = (K + 1) * (K + 2) / 2, vi = (i, j) => i * (K + 1) - (i * (i - 1)) / 2 + j;
      const COL = [0, 0, 0];
      function buildNode(nd) {
        const ne = 3 * K, nTot = NV + ne + 3;
        const pos = new Float32Array(nTot * 3), col = new Uint8Array(nTot * 3), upA = new Float32Array(nTot * 3), hhA = new Float32Array(nTot), cc = new Float32Array(nTot * 3);
        const { a, b, c, f } = nd, C = nd.C;
        let maxD = 0, hmax = 0;
        for (let i = 0; i <= K; i++) for (let j = 0; j <= K - i; j++) {
          const k = vi(i, j), px = a[0] + (b[0] - a[0]) * i / K + (c[0] - a[0]) * j / K, py = a[1] + (b[1] - a[1]) * i / K + (c[1] - a[1]) * j / K;
          const s = W.sample(f, px, py), hw = Math.max(s.h, W.WATER, s.river > 0.5 && s.wl > s.h ? s.wl : -1e9), r = R + hw;   /* lakes and rivers at their surface: flat water (the operator) */
          const X = s.ux * r - C[0], Y = s.uy * r - C[1], Z = s.uz * r - C[2];
          pos[k * 3] = X; pos[k * 3 + 1] = Y; pos[k * 3 + 2] = Z;
          upA[k * 3] = s.ux; upA[k * 3 + 1] = s.uy; upA[k * 3 + 2] = s.uz; hhA[k] = hw;
          colourOf(s, Math.floor(px), Math.floor(py), COL); col[k * 3] = COL[0]; col[k * 3 + 1] = COL[1]; col[k * 3 + 2] = COL[2];
          const cc0 = CLSCOL[s.cls] || CLSCOL[0]; cc[k * 3] = cc0[0] / 255; cc[k * 3 + 1] = cc0[1] / 255; cc[k * 3 + 2] = cc0[2] / 255;
          const d = Math.sqrt(X * X + Y * Y + Z * Z); if (d > maxD) maxD = d; if (hw > hmax) hmax = hw;
        }
        const idx = [];
        for (let i = 0; i < K; i++) for (let j = 0; j < K - i; j++) {
          idx.push(vi(i, j), vi(i + 1, j), vi(i, j + 1));
          if (j < K - i - 1) idx.push(vi(i + 1, j), vi(i + 1, j + 1), vi(i, j + 1));
        }
        /* skirts round the three edges hide the cracks between patches of different sizes */
        const sk = nd.edge / K * 0.6 + 2, edges = [[], [], []];
        for (let t = 0; t <= K; t++) { edges[0].push(vi(t, 0)); edges[1].push(vi(K - t, t)); edges[2].push(vi(0, K - t)); }
        let v = NV;
        for (const E of edges) {
          const base = v;
          for (let t = 0; t < E.length; t++) {
            const s0 = E[t];
            pos[v * 3] = pos[s0 * 3] - upA[s0 * 3] * sk; pos[v * 3 + 1] = pos[s0 * 3 + 1] - upA[s0 * 3 + 1] * sk; pos[v * 3 + 2] = pos[s0 * 3 + 2] - upA[s0 * 3 + 2] * sk;
            upA[v * 3] = upA[s0 * 3]; upA[v * 3 + 1] = upA[s0 * 3 + 1]; upA[v * 3 + 2] = upA[s0 * 3 + 2]; hhA[v] = hhA[s0];
            col[v * 3] = col[s0 * 3]; col[v * 3 + 1] = col[s0 * 3 + 1]; col[v * 3 + 2] = col[s0 * 3 + 2];
            cc[v * 3] = cc[s0 * 3]; cc[v * 3 + 1] = cc[s0 * 3 + 1]; cc[v * 3 + 2] = cc[s0 * 3 + 2];
            if (t > 0) idx.push(E[t - 1], v - 1, E[t], E[t], v - 1, v);
            v++;
          }
          void base;
        }
        /* winding: outward faces front */
        const p0 = idx[0] * 3, p1 = idx[1] * 3, p2 = idx[2] * 3;
        const e1 = [pos[p1] - pos[p0], pos[p1 + 1] - pos[p0 + 1], pos[p1 + 2] - pos[p0 + 2]], e2 = [pos[p2] - pos[p0], pos[p2 + 1] - pos[p0 + 1], pos[p2 + 2] - pos[p0 + 2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
        if (nx * nd.u[0] + ny * nd.u[1] + nz * nd.u[2] < 0) for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3, true));
        g.setAttribute('up', new THREE.BufferAttribute(upA.subarray(0, v * 3), 3));
        g.setAttribute('hh', new THREE.BufferAttribute(hhA.subarray(0, v), 1));
        g.setAttribute('ccol', new THREE.BufferAttribute(cc.subarray(0, v * 3), 3));
        g.setIndex(idx);
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), maxD + sk + hmax * 12);
        const m = new THREE.Mesh(g, terrainMat); m.matrixAutoUpdate = false; m.visible = false;
        scene.add(m); nd.mesh = m; nd.hmax = hmax; built++; live++;
      }
      function dropMesh(nd) { if (nd.mesh) { scene.remove(nd.mesh); nd.mesh.geometry.dispose(); nd.mesh = null; live--; } }
      for (const r0 of roots) buildNode(r0);

      /* ---- camera state: a target on the sphere, an altitude, a heading from north, a tilt ---- */
      const cam = { u: [0, 0, 1], alt: 90000, hd: 0, tilt: 0, fly: null };
      const camW = [0, 0, 0], up3 = [0, 0, 0], E3 = [0, 0, 0], N3 = [0, 0, 0], F3 = [0, 0, 0];
      const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; };
      function frameAt(u) {
        up3[0] = u[0]; up3[1] = u[1]; up3[2] = u[2];
        const d = u[2]; N3[0] = -u[0] * d; N3[1] = -u[1] * d; N3[2] = 1 - u[2] * d;
        if (Math.hypot(N3[0], N3[1], N3[2]) < 1e-6) { N3[0] = 1; N3[1] = 0; N3[2] = 0; }
        norm(N3); E3[0] = N3[1] * u[2] - N3[2] * u[1]; E3[1] = N3[2] * u[0] - N3[0] * u[2]; E3[2] = N3[0] * u[1] - N3[1] * u[0]; norm(E3);
      }
      /* sphere direction -> face + planar point (start from the cell under it, then three Newton steps in the plane) */
      function toPlanar(u) {
        const c = G.cellAt(u); let p = G.planar(c), f = p.face, x = p.x, y = p.y;
        for (let it = 0; it < 4; it++) {
          const s0 = W.toSphere(f, x, y), sx = W.toSphere(f, x + 1, y), sy = W.toSphere(f, x, y + 1);
          const ex = [sx[0] - s0[0], sx[1] - s0[1], sx[2] - s0[2]], ey = [sy[0] - s0[0], sy[1] - s0[1], sy[2] - s0[2]];
          const d = [u[0] - s0[0], u[1] - s0[1], u[2] - s0[2]];
          const a11 = ex[0] * ex[0] + ex[1] * ex[1] + ex[2] * ex[2], a12 = ex[0] * ey[0] + ex[1] * ey[1] + ex[2] * ey[2], a22 = ey[0] * ey[0] + ey[1] * ey[1] + ey[2] * ey[2];
          const b1 = d[0] * ex[0] + d[1] * ex[1] + d[2] * ex[2], b2 = d[0] * ey[0] + d[1] * ey[1] + d[2] * ey[2], det = a11 * a22 - a12 * a12 || 1;
          x += (b1 * a22 - b2 * a12) / det; y += (a11 * b2 - a12 * b1) / det;
        }
        const fo = W.fold(f, x, y); return { face: fo[0], x: fo[1], y: fo[2] };
      }
      const llToU = (lat, lon) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]; };
      const uToLL = u => [Math.asin(Math.max(-1, Math.min(1, u[2]))) * 180 / Math.PI, Math.atan2(u[1], u[0]) * 180 / Math.PI];
      const exAt = alt => 1 + 2 * Math.min(1, Math.max(0, (Math.log10(alt) - 3.3) / 1.5));   /* at most 3x from orbit (the operator: the mountains looked out of scale) */
      const tiltAt = alt => { const t = Math.min(1, Math.max(0, (Math.log10(alt) - 1.6) / 2.2)); return 0.62 + (1.5 - 0.62) * t; };
      const PLACES = {};
      const SUN_EPOCH = 1791353761, DAY_S = 86400;
      let sunLon = null, sunBall = null;
      { const g = new THREE.Group(), core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.32, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4c0, fog: false }));
        const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 0.62, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.18, depthWrite: false, fog: false }));
        g.add(core, halo); g.frustumCulled = false; core.frustumCulled = halo.frustumCulled = false; scene.add(g); sunBall = g; }
      function sunNow() {   /* the sun's direction from the planet's centre: over the equator, moving west 360 degrees a day */
        if (sunLon == null) { const a = PLACES.ashvale ? PLACES.ashvale.u : [1, 0, 0]; sunLon = Math.atan2(a[1], a[0]); }
        const L = sunLon - Math.PI / 2 - 2 * Math.PI * ((Date.now() / 1000 - SUN_EPOCH) / DAY_S);
        return [Math.cos(L), Math.sin(L), 0];
      }
      /* a game tile (the x, y a character stands on) -> the sphere direction and the planar point, the same mapping as the places */
      const gameAt = (vx, vy) => { if (!CFG.origin) return null; const fx = vx + CFG.origin[0] + 0.5, fy = -(vy + CFG.origin[1]) - 0.5; return { u: W.toSphere(CFG.face, fx, fy), face: CFG.face, x: fx, y: fy }; };
      { const at = (vx, vy) => { const fx = vx + CFG.origin[0] + 0.5, fy = -(vy + CFG.origin[1]) - 0.5; return W.toSphere(CFG.face, fx, fy); };
        if (CFG.origin) PLACES.ashvale = { u: at(22, 52), alt: 60 };
        /* every area is a place (?at=<zone id>): over its middle, high enough to see the whole of it */
        if (CFG.origin) for (const z of zones) if (z && z.id && z.origin && z.size && !PLACES[z.id]) PLACES[z.id] = { u: at(z.origin[0] + (z.size[0] >> 1), z.origin[1] + (z.size[1] >> 1)), alt: Math.max(160, Math.round(Math.max(z.size[0], z.size[1]) * 1.4)) }; }
      let groundH = 0, tP = null;
      function updateCamera() {
        const u = cam.u; frameAt(u);
        tP = toPlanar(u);
        const s = W.sample(tP.face, tP.x, tP.y); groundH = Math.max(W.WATER, s.h);
        const ex = exAt(cam.alt); U.uEx.value = ex;
        const el = Math.max(0.15, Math.min(1.5, tiltAt(cam.alt) + cam.tilt));
        const ch = Math.cos(cam.hd), sh = Math.sin(cam.hd);
        F3[0] = N3[0] * ch + E3[0] * sh; F3[1] = N3[1] * ch + E3[1] * sh; F3[2] = N3[2] * ch + E3[2] * sh;
        const rT = R + groundH * ex, ce = Math.cos(el), se = Math.sin(el);
        for (let i = 0; i < 3; i++) camW[i] = u[i] * rT - F3[i] * cam.alt * ce + up3[i] * cam.alt * se;
        /* never below the ground under the camera itself */
        const cu = norm([camW[0], camW[1], camW[2]]), cp = toPlanar(cu), cg = Math.max(W.WATER, W.sample(cp.face, cp.x, cp.y).h) * ex + R + 2;
        const cr = Math.hypot(camW[0], camW[1], camW[2]); if (cr < cg) for (let i = 0; i < 3; i++) camW[i] *= cg / cr;
        camera.position.set(0, 0, 0);
        camera.up.set(up3[0] * ce + F3[0] * se, up3[1] * ce + F3[1] * se, up3[2] * ce + F3[2] * se);
        camera.lookAt(u[0] * rT - camW[0], u[1] * rT - camW[1], u[2] * rT - camW[2]);
        camera.near = Math.max(0.1, Math.min(cam.alt * 0.05, 200)); camera.far = 4e6; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        /* sky, haze, sun */
        const k = Math.min(1, Math.max(0, (Math.log10(cam.alt) - 3.4) / 1.2));
        bg.copy(SKY).lerp(SPACE, k); stars.material.opacity = 0.85 * k;
        const fogOn = cam.alt < 25000;
        scene.fog.color.copy(bg); scene.fog.near = fogOn ? cam.alt * 3 + 400 : 1e7; scene.fog.far = fogOn ? cam.alt * 14 + 4000 : 2e7;
        /* the real sun (2026-10-07: "an orbiting sun that orbits the globe once every 24 hours"; it set over Ashvale at
           SUN_EPOCH - the game uses the same rule, src/engine.js): its light from its direction, the night side dark */
        const S0 = sunNow(); sun.position.set(S0[0] * 1000, S0[1] * 1000, S0[2] * 1000);
        if (sunBall) { const D = R * 7; sunBall.position.set(S0[0] * D - camW[0], S0[1] * D - camW[1], S0[2] * D - camW[2]); }
        sun.target.position.set(0, 0, 0);
      }

      /* ---- choose patches for this frame ---- */
      const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere();
      let drawn = [];
      function wantSplit(nd, d) {
        const px = (nd.edge / K) / Math.max(d, 1) * (H * 0.5) / Math.tan(camera.fov * Math.PI / 360);
        return px > (PHONE ? 9 : 6) && nd.L < MAXL;
      }
      function visible(nd) {
        const cr = Math.hypot(camW[0], camW[1], camW[2]);
        const ang = Math.acos(Math.max(-1, Math.min(1, (nd.u[0] * camW[0] + nd.u[1] * camW[1] + nd.u[2] * camW[2]) / cr)));
        const hor = Math.acos(Math.min(1, R / cr)) + Math.acos(Math.min(1, R / (R + 200 * U.uEx.value)));
        if (ang - nd.rad / R > hor + 0.02) return false;
        sph.center.set(nd.C[0] - camW[0], nd.C[1] - camW[1], nd.C[2] - camW[2]); sph.radius = nd.rad + (nd.hmax || 200) * U.uEx.value + 50;
        return frustum.intersectsSphere(sph);
      }
      function select(nd, out) {
        nd.used = frame;
        if (!visible(nd)) return;
        const d = Math.max(0, Math.hypot(nd.C[0] - camW[0], nd.C[1] - camW[1], nd.C[2] - camW[2]) - nd.rad);
        if (wantSplit(nd, d)) {
          const ks = kidsOf(nd); let ready = true;
          for (const k of ks) { k.used = frame; if (!k.mesh) { ready = false; k.want = nd.edge / Math.max(d, 1); buildQ.add(k); } }
          if (ready) { for (const k of ks) select(k, out); return; }
        }
        if (nd.mesh) out.push(nd);
      }
      function prune() {
        const stack = roots.slice();
        while (stack.length) {
          const nd = stack.pop();
          if (nd.kids) {
            if (frame - nd.used > 240 && nd.kids.every(k => !k.kids)) { for (const k of nd.kids) dropMesh(k); nd.kids = null; continue; }
            for (const k of nd.kids) stack.push(k);
          }
        }
      }

      /* ---- the ground: the game's chunks on the planet ---- */
      const shapes = deps.atlas_shapes.create(PAL), B = deps.atlas_chunk.create(W, shapes, PAL), SZ = B.SIZE;
      let chAnchor = -1; const chunks = new Map(), M4 = new THREE.Matrix4();
      function chunkBasis(c) {
        const f = chAnchor, x0 = c.cx * SZ, y0 = c.cy * SZ, cx = x0 + SZ / 2, cy = y0 + SZ / 2;
        const p0 = W.toSphere(f, cx, cy), px = W.toSphere(f, cx + 1, cy), py = W.toSphere(f, cx, cy + 1), pc = W.toSphere(f, x0, y0);
        c.E = [(px[0] - p0[0]) * R, (px[1] - p0[1]) * R, (px[2] - p0[2]) * R];
        c.N = [(py[0] - p0[0]) * R, (py[1] - p0[1]) * R, (py[2] - p0[2]) * R];
        c.U = norm([p0[0], p0[1], p0[2]]);
        /* the corner (x0, y0) on the sphere, so local (0, 0, 0) lands on it */
        c.P = [pc[0] * R, pc[1] * R, pc[2] * R];
      }
      function chunkTick(budgetMs) {
        const want = cam.alt < GROUND_ALT;
        if (!want || !tP) { if (chunks.size) for (const c of chunks.values()) if (c.mesh) c.mesh.visible = false; U.uDetR.value = -1; return; }
        if (tP.face !== chAnchor) { for (const c of chunks.values()) if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); } chunks.clear(); chAnchor = tP.face; }
        const r = Math.min(300, Math.max(130, cam.alt * 0.9 + 90)), px = tP.x, py = tP.y;
        const cx0 = Math.floor((px - r) / SZ), cx1 = Math.floor((px + r) / SZ), cy0 = Math.floor((py - r) / SZ), cy1 = Math.floor((py + r) / SZ);
        const list = [];
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const dx = Math.max(cx * SZ - px, 0, px - (cx + 1) * SZ), dy = Math.max(cy * SZ - py, 0, py - (cy + 1) * SZ), d = Math.hypot(dx, dy);
          if (d <= r) list.push([d, cx, cy]);
        }
        list.sort((a, b) => a[0] - b[0]);
        const keep = new Set(), t0 = performance.now();
        let coverR = r;
        for (const [d, cx, cy] of list) {
          const k = cx * 100000 + cy; keep.add(k);
          let c = chunks.get(k);
          if (!c) { c = { cx, cy, job: null, mesh: null }; chunks.set(k, c); }
          if (!c.mesh) {
            if (coverR === r) coverR = d;
            if (performance.now() - t0 < budgetMs) {
              if (!c.job) c.job = B.job(chAnchor, cx, cy);
              while (performance.now() - t0 < budgetMs) if (c.job.step()) { makeChunk(c); break; }
            }
          }
        }
        for (const [k, c] of chunks) if (!keep.has(k)) { if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); } chunks.delete(k); }
        /* chunks are shown where every chunk nearer than coverR is built; the patches sink under all of those
           (their far corners reach up to a chunk diagonal past coverR) */
        for (const [k, c] of chunks) if (c.mesh) { const ccx = (c.cx + 0.5) * SZ - px, ccy = (c.cy + 0.5) * SZ - py; c.show = Math.max(0, Math.hypot(ccx, ccy) - SZ * 0.71) < coverR; }
        U.uDetR.value = coverR > 20 ? coverR + SZ * 1.45 : -1;
        const near = cam.alt < 160;
        for (const c of chunks.values()) if (c.mesh) {
          const ccx = (c.cx + 0.5) * SZ - px, ccy = (c.cy + 0.5) * SZ - py, nearC = near && Math.hypot(ccx, ccy) < 110;
          if (c.lodNear !== nearC) { c.lodNear = nearC; const g = c.mesh.geometry, o = c.out; g.clearGroups(); if (nearC) { g.addGroup(0, o.nLod0, 0); g.addGroup(o.quad[0], o.quad[4] - o.quad[0], 0); } else g.addGroup(0, o.far[4], 0); }
        }
      }
      function makeChunk(c) {
        const out = c.job.out; c.out = out; c.job = null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(out.pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(out.col, 3, true));
        g.setIndex(new THREE.BufferAttribute(out.idx, 1));
        g.computeBoundingSphere(); g.addGroup(0, out.far[4], 0);
        const m = new THREE.Mesh(g, [chunkMat]); m.matrixAutoUpdate = false; c.lodNear = false;
        chunkBasis(c); c.mesh = m; scene.add(m);
      }
      function placeChunks() {
        for (const c of chunks.values()) if (c.mesh) {
          const E = c.E, N = c.N, Uu = c.U;
          /* chunk local: x east (planar), y up (height), z = -(planar y) */
          M4.set(E[0], Uu[0], -N[0], c.P[0] - camW[0],
                 E[1], Uu[1], -N[1], c.P[1] - camW[1],
                 E[2], Uu[2], -N[2], c.P[2] - camW[2],
                 0, 0, 0, 1);
          c.mesh.matrix.copy(M4); c.mesh.matrixWorld.copy(M4); c.mesh.visible = cam.alt < GROUND_ALT && !!c.show;
        }
      }

      /* ---- the loop ---- */
      let Wd = 1, H = 1;
      function resize() { Wd = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight); renderer.setSize(Wd, H, false); camera.aspect = Wd / H; camera.updateProjectionMatrix(); }
      window.addEventListener('resize', resize); resize();
      let last = performance.now();
      function tick(now) {
        const dt = Math.min(0.1, (now - last) / 1000); last = now; frame++;
        if (cam.fly) stepFly(dt);
        if (keys.size) keyMove(dt);
        updateCamera();
        pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
        for (const nd of drawn) nd.mesh && (nd.mesh.visible = false);
        drawn = []; for (const r0 of roots) select(r0, drawn);
        for (const nd of drawn) { nd.mesh.matrix.makeTranslation(nd.C[0] - camW[0], nd.C[1] - camW[1], nd.C[2] - camW[2]); nd.mesh.matrixWorld.copy(nd.mesh.matrix); nd.mesh.visible = true; }
        if (tP && cam.alt < GROUND_ALT) { const s0 = W.toSphere(tP.face, tP.x, tP.y), rr = R + groundH; U.uDetC.value.set(s0[0] * rr - camW[0], s0[1] * rr - camW[1], s0[2] * rr - camW[2]); }
        /* build the most wanted patches first, then the ground */
        const t0 = performance.now(), budget = PHONE ? 6 : 9;
        if (buildQ.size) {
          for (const t1 = performance.now(); staleQ.length && performance.now() - t1 < 8;) { const n = staleQ.shift(); n.stale = false; if (!n.mesh) continue; const old = n.mesh; n.mesh = null; live--; buildNode(n); n.mesh.visible = old.visible; scene.remove(old); old.geometry.dispose(); }
          const arr = Array.from(buildQ).filter(n => !n.mesh && frame - n.used < 3).sort((a, b) => b.want - a.want); buildQ.clear();
          for (const n of arr) { if (performance.now() - t0 > budget) { buildQ.add(n); continue; } buildNode(n); }
        }
        chunkTick(Math.max(2, budget - (performance.now() - t0)));
        placeChunks();
        if (riverLines) { riverLines.matrix.makeTranslation(-camW[0], -camW[1], -camW[2]); riverLines.matrixWorld.copy(riverLines.matrix); const k2 = Math.min(1, Math.max(0, (cam.alt - 25) / 60)); riverLines.visible = k2 > 0.02; riverLines.material.opacity = k2; }
        if (equatorLine) { EQW.value = Math.max(1.2, cam.alt * 0.004) / R; equatorLine.matrix.makeTranslation(-camW[0], -camW[1], -camW[2]); equatorLine.matrixWorld.copy(equatorLine.matrix); }
        if (frame % 60 === 0) prune();
        renderer.render(scene, camera);
        youTick(); marksTick(); if (frame % 2 === 0) friendsTick(); hudTick();
        requestAnimationFrame(tick);
      }

      /* ---- input ---- */
      const ptrs = new Map(); let drag = null, pinch = null;
      const mpp = () => cam.alt * 2 * Math.tan(camera.fov * Math.PI / 360) / H;
      function moveBy(de, dn) {
        frameAt(cam.u);
        let left = Math.hypot(de, dn); if (!left) return;
        const st = Math.max(1, Math.ceil(left / 2000));
        for (let s = 0; s < st; s++) {
          frameAt(cam.u);
          const v = [cam.u[0] + (E3[0] * de + N3[0] * dn) / st / R, cam.u[1] + (E3[1] * de + N3[1] * dn) / st / R, cam.u[2] + (E3[2] * de + N3[2] * dn) / st / R];
          cam.u = norm(v);
        }
      }
      function pan(dx, dy) {
        const m = mpp() / Math.max(0.35, Math.sin(Math.max(0.15, Math.min(1.5, tiltAt(cam.alt) + cam.tilt)))), ch = Math.cos(cam.hd), sh = Math.sin(cam.hd);
        /* the ground follows the pointer: right = (cos hd, -sin hd) in east/north, forward = (sin hd, cos hd) */
        const de = -dx * m * ch + dy * m * sh, dn = dx * m * sh + dy * m * ch;
        moveBy(de, dn);
      }
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      function groundUnder(cx, cy) {
        const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera); const d = ray.ray.direction, o = [camW[0], camW[1], camW[2]];
        const Rg = R + groundH * U.uEx.value, b = o[0] * d.x + o[1] * d.y + o[2] * d.z, c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - Rg * Rg, disc = b * b - c;
        if (disc < 0) return null; const t = -b - Math.sqrt(disc); if (t < 0) return null;
        return norm([o[0] + d.x * t, o[1] + d.y * t, o[2] + d.z * t]);
      }
      function zoom(f, cx, cy) {
        const before = cam.alt, after = Math.max(MIN_ALT, Math.min(MAX_ALT, cam.alt * f));
        if (cx != null) {
          const g = groundUnder(cx, cy);
          if (g) { const k = 1 - after / before; frameAt(cam.u); const d = [g[0] - cam.u[0], g[1] - cam.u[1], g[2] - cam.u[2]];
            moveBy((d[0] * E3[0] + d[1] * E3[1] + d[2] * E3[2]) * R * k, (d[0] * N3[0] + d[1] * N3[1] + d[2] * N3[2]) * R * k); }
        }
        cam.alt = after; cam.fly = null;
      }
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('pointerdown', e => {
        canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); cam.fly = null;
        if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, rot: e.button === 2 || e.ctrlKey || e.shiftKey };
        if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2, alt: cam.alt, hd: cam.hd, tilt: cam.tilt }; drag = null; }
      });
      canvas.addEventListener('pointermove', e => {
        if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && ptrs.size === 2) {
          const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
          cam.alt = Math.max(MIN_ALT, Math.min(MAX_ALT, pinch.alt * pinch.d / Math.max(20, d)));
          cam.hd = pinch.hd - (ang - pinch.ang); cam.tilt = Math.max(-0.9, Math.min(0.9, pinch.tilt + (my - pinch.my) / 300));
        } else if (drag) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
          if (drag.rot) { cam.hd -= dx * 0.005; cam.tilt = Math.max(-0.9, Math.min(0.9, cam.tilt + dy * 0.004)); } else pan(dx, dy);
        }
      });
      const endP = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; };
      canvas.addEventListener('pointerup', endP); canvas.addEventListener('pointercancel', endP);
      canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.pow(1.0018, e.deltaY * (e.deltaMode === 1 ? 30 : 1)), e.clientX, e.clientY); }, { passive: false });
      const keys = new Set();
      addEventListener('keydown', e => { if (/^(Arrow|Key[WASDQE]|Equal|Minus)/.test(e.code)) { keys.add(e.code); e.preventDefault(); } });
      addEventListener('keyup', e => keys.delete(e.code));
      function keyMove(dt) {
        const m = mpp() * H * 0.6 * dt;
        if (keys.has('KeyW')) pan(0, m / mpp()); if (keys.has('KeyS')) pan(0, -m / mpp());
        if (keys.has('KeyA')) pan(m / mpp(), 0); if (keys.has('KeyD')) pan(-m / mpp(), 0);
        if (keys.has('ArrowLeft') || keys.has('KeyQ')) cam.hd += dt * 1.2; if (keys.has('ArrowRight') || keys.has('KeyE')) cam.hd -= dt * 1.2;
        if (keys.has('ArrowUp')) cam.tilt = Math.min(0.9, cam.tilt + dt); if (keys.has('ArrowDown')) cam.tilt = Math.max(-0.9, cam.tilt - dt);
        if (keys.has('Equal')) zoom(Math.pow(0.4, dt)); if (keys.has('Minus')) zoom(Math.pow(2.5, dt));
      }

      /* ---- fly: out, across, and down, all on the one camera ---- */
      function flyTo(to) {
        const p = typeof to === 'string' ? (to === 'globe' ? { u: cam.u, alt: 95000 } : PLACES[to]) : { u: llToU(to.lat, to.lon), alt: to.alt || 2000 };
        if (!p) return false;
        const ang = Math.acos(Math.max(-1, Math.min(1, cam.u[0] * p.u[0] + cam.u[1] * p.u[1] + cam.u[2] * p.u[2])));
        const top = Math.max(cam.alt, p.alt, ang * R * 1.1), dur = 2.2 + 2.2 * Math.min(1, Math.log10(top / Math.min(cam.alt, p.alt)) / 4) + (ang > 0.01 ? 1.2 : 0);
        cam.fly = { u0: cam.u.slice(), u1: p.u.slice(), a0: cam.alt, a1: p.alt, top, t: 0, dur, ang, tilt0: cam.tilt };
        return true;
      }
      function stepFly(dt) {
        const F = cam.fly; F.t += dt / F.dur; const t = Math.min(1, F.t), e = t * t * (3 - 2 * t);
        if (F.ang > 1e-6) { const s = Math.sin(F.ang), wa = Math.sin((1 - e) * F.ang) / s, wb = Math.sin(e * F.ang) / s; cam.u = norm([F.u0[0] * wa + F.u1[0] * wb, F.u0[1] * wa + F.u1[1] * wb, F.u0[2] * wa + F.u1[2] * wb]); }
        /* altitude on a log scale: straight from a0 to a1, plus a hump up to `top` when the trip is far */
        const la = Math.log(F.a0), lb = Math.log(F.a1), base = la + (lb - la) * e, lt = Math.log(F.top);
        const hump = Math.max(0, lt - Math.max(la, lb)) * Math.sin(Math.PI * t);
        cam.alt = Math.exp(base + hump);
        cam.tilt = F.tilt0 * (1 - e);
        if (t >= 1) { cam.alt = F.a1; cam.fly = null; }
      }

      /* ---- HUD ---- */
      const hud = document.createElement('div');
      hud.innerHTML = '<style>.ea{position:absolute;inset:0;pointer-events:none;font:600 13px/1.3 system-ui,sans-serif;color:#ffcf3f}' +
        '.ea .t{position:absolute;left:12px;top:max(10px,env(safe-area-inset-top));padding:7px 10px;background:rgba(30,24,16,.82);border:1px solid #8a7550;border-radius:6px}' +
        '.ea .t small{display:block;color:#e8d9b4;font-weight:400}.ea .b{position:absolute;right:12px;bottom:max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px}' +
        '.ea button{pointer-events:auto;min-width:44px;min-height:38px;padding:6px 10px;background:linear-gradient(#5a4c3a,#433829);border:1px solid #8a7550;border-radius:5px;color:#ffcf3f;font:inherit;cursor:pointer}' +
        '.ea button:focus-visible{outline:2px solid #fff}.ea button.on{background:linear-gradient(#7a6a3a,#5a4a29)}' +
        '.ea .you{position:absolute;left:0;top:0;display:none;transform:translate(-50%,-50%);pointer-events:none}' +
        '.ea .you i{display:block;width:14px;height:14px;border-radius:50%;background:#2fd3ff;border:2px solid #fff;box-shadow:0 0 0 3px #0a2a3a99,0 0 10px #2fd3ff}' +
        '.ea .you i::after{content:"";position:absolute;left:50%;top:7px;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #2fd3ff;animation:eaPing 1.8s ease-out infinite}' +
        '.ea .you b{position:absolute;left:50%;top:18px;transform:translateX(-50%);padding:1px 6px;border-radius:4px;background:rgba(10,30,40,.85);color:#bff1ff;font-size:12px;white-space:nowrap}' +
        '@keyframes eaPing{from{transform:scale(1);opacity:.9}to{transform:scale(3.2);opacity:0}}' +
        '.ea .you.fr i{background:#ff9a2e;box-shadow:0 0 0 3px #3a200899,0 0 10px #ff9a2e;width:12px;height:12px}.ea .you.fr i::after{display:none}.ea .you.fr b{background:rgba(50,26,6,.85);color:#ffd8a8}' +
        '.ea .rose{position:absolute;left:14px;bottom:max(14px,env(safe-area-inset-bottom));width:min(26vmin,150px);height:min(26vmin,150px);opacity:.5;pointer-events:auto;cursor:pointer;transition:opacity .2s}.ea .rose:hover{opacity:.8}' +
        '.ea .rose svg{width:100%;height:100%;display:block;overflow:visible}' +
        '.ea .lbl{position:absolute;left:0;top:0;display:none;transform:translate(-50%,-100%);pointer-events:none;color:#ffe9a8;font-size:12px;text-shadow:0 1px 2px #000,0 0 4px #000;white-space:nowrap;text-align:center}' +
        '.ea .lbl i{display:block;width:9px;height:9px;margin:2px auto 0;border-radius:50%;background:#ffcf3f;border:2px solid #fff}</style>' +
        '<div class="ea"><div class="lbl" id="ea-np">North Pole<i></i></div><div class="lbl" id="ea-sp">South Pole<i></i></div><div class="lbl" id="ea-eq" style="transform:translate(-50%,-130%)">Equator</div>' +
        '<div class="rose" id="ea-rose" title="North - tap to face north"><svg viewBox="-60 -60 120 120"><g id="ea-rose-g">' +
        '<circle r="44" fill="rgba(20,16,10,.35)" stroke="#ffcf3f" stroke-width="1.5"/><circle r="30" fill="none" stroke="#e8d9b4" stroke-width=".8" stroke-dasharray="2 3"/>' +
        '<path d="M0-42L7-7 0 0-7-7Z" fill="#e33"/><path d="M0 42L7 7 0 0-7 7Z" fill="#e8d9b4"/><path d="M42 0L7-7 0 0 7 7Z" fill="#e8d9b4"/><path d="M-42 0L-7-7 0 0-7 7Z" fill="#e8d9b4"/>' +
        '<path d="M0-42L7-7 0 0Z" fill="#a11"/><path d="M42 0L7 7 0 0Z" fill="#b9a983"/><path d="M0 42L-7 7 0 0Z" fill="#b9a983"/><path d="M-42 0L-7-7 0 0Z" fill="#b9a983"/>' +
        '<text y="-47" text-anchor="middle" font-size="13" font-weight="700" fill="#ff5a4a">N</text><text y="56" text-anchor="middle" font-size="11" fill="#e8d9b4">S</text>' +
        '<text x="52" y="4" text-anchor="middle" font-size="11" fill="#e8d9b4">E</text><text x="-52" y="4" text-anchor="middle" font-size="11" fill="#e8d9b4">W</text></g></svg></div>' +
        '<div class="you" id="ea-you"><i></i><b>You</b></div><div class="t">ASHVALE Atlas<small id="ea-alt">-</small><small id="ea-note" hidden></small></div><div class="b">' +
        '<button id="ea-me" hidden>You</button><button id="ea-ash">Ashvale</button><button id="ea-salt">Saltmere</button><button id="ea-in">+</button><button id="ea-out">&minus;</button>' +
        '<button id="ea-globe">Globe</button><button id="ea-par">Parcels</button></div></div>';
      host.appendChild(hud);
      const $ = id => hud.querySelector('#' + id), altEl = $('ea-alt');
      $('ea-ash').onclick = () => flyTo('ashvale'); $('ea-salt').onclick = () => flyTo('saltmere'); $('ea-globe').onclick = () => flyTo('globe');
      $('ea-in').onclick = () => zoom(0.45); $('ea-out').onclick = () => zoom(2.2);
      $('ea-par').onclick = () => { U.uParcel.value = U.uParcel.value ? 0 : 0.75; $('ea-par').classList.toggle('on', !!U.uParcel.value); };
      /* ---- YOU ARE HERE (2026-10-06: players open the Atlas from the Games tab and should see a dot where they are).
         The game tells the @ashvale Bank where its player stands as it saves; here we ask the Bank, in the same realtime
         room the game uses, for our own player's spot (the arcade stamps who is asking, so each player only learns their
         own). A blue dot marks it at every height, and the You button flies there. Outside the arcade, or signed out, or
         a player who never played: no dot, nothing else changes. */
      const youEl = $('ea-you'), meBtn = $('ea-me'), vYou = new THREE.Vector3();
      const YOU = { at: null, asked: 0, state: 'off' };
      function setYou(x, y) {
        const g = gameAt(x, y); if (!g) return;
        YOU.at = Object.assign(g, { gx: x, gy: y }); YOU.state = 'shown'; $('ea-note').hidden = true;
        PLACES.you = { u: g.u, alt: 90 }; meBtn.hidden = false;
      }
      /* ---- the compass rose turns with the view: its N points to the planet's north (the camera's heading cam.hd is
         measured from north, toward east); tap it to face north. Pole and equator labels sit on the ground there. */
      const roseG = hud.querySelector('#ea-rose-g'), npEl = $('ea-np'), spEl = $('ea-sp'), eqEl = $('ea-eq'), vL = new THREE.Vector3();
      $('ea-rose').onclick = () => { cam.hd = Math.round(cam.hd / (2 * Math.PI)) * 2 * Math.PI; };
      function screenOf(u, lift) {   /* a point on the ground at direction u -> [x, y] on screen, or null behind the planet / off screen */
        const pl = toPlanar(u), h = Math.max(W.WATER, W.sample(pl.face, pl.x, pl.y).h) * U.uEx.value, rr = R + h + (lift || 0);
        const px = u[0] * rr, py = u[1] * rr, pz = u[2] * rr;
        if ((camW[0] - px) * u[0] + (camW[1] - py) * u[1] + (camW[2] - pz) * u[2] <= 0) return null;
        vL.set(px - camW[0], py - camW[1], pz - camW[2]).project(camera);
        if (vL.z > 1 || Math.abs(vL.x) > 1.05 || Math.abs(vL.y) > 1.05) return null;
        return [(vL.x + 1) / 2 * (canvas.clientWidth || innerWidth), (1 - vL.y) / 2 * (canvas.clientHeight || innerHeight)];
      }
      const place = (el, s) => { if (!s) { el.style.display = 'none'; return; } el.style.display = 'block'; el.style.left = s[0] + 'px'; el.style.top = s[1] + 'px'; };
      let markT = 0;
      function marksTick() {
        roseG.setAttribute('transform', 'rotate(' + (-cam.hd * 180 / Math.PI).toFixed(2) + ')');
        if (frame - markT < 2) return; markT = frame;
        place(npEl, screenOf([0, 0, 1], 2)); place(spEl, screenOf([0, 0, -1], 2));
        const l = Math.hypot(cam.u[0], cam.u[1]); place(eqEl, l > 1e-6 ? screenOf([cam.u[0] / l, cam.u[1] / l, 0], 2) : null);
      }
      function youTick() {
        if (!YOU.at) return;
        const u = YOU.at.u, h = Math.max(W.WATER, W.sample(YOU.at.face, YOU.at.x, YOU.at.y).h) * U.uEx.value, rr = R + h + 1.5;
        const px = u[0] * rr, py = u[1] * rr, pz = u[2] * rr;
        /* on our side of the planet: the camera is above the dot's horizon */
        const up = (camW[0] - px) * u[0] + (camW[1] - py) * u[1] + (camW[2] - pz) * u[2];
        vYou.set(px - camW[0], py - camW[1], pz - camW[2]).project(camera);
        if (up <= 0 || vYou.z > 1 || Math.abs(vYou.x) > 1.2 || Math.abs(vYou.y) > 1.2) { youEl.style.display = 'none'; return; }
        const w = canvas.clientWidth || innerWidth, hh = canvas.clientHeight || innerHeight;
        youEl.style.display = 'block'; youEl.style.left = ((vYou.x + 1) / 2 * w) + 'px'; youEl.style.top = ((1 - vYou.y) / 2 * hh) + 'px';
      }
      async function findMe() {
        const RT0 = () => window.arcade && window.arcade.realtime;
        if (!/^https?:/.test(location.protocol) || !window.parent || window.parent === window) return;
        if (!RT0()) await new Promise(ok => { const s = document.createElement('script'); s.src = '/r/realtime.js'; s.onload = s.onerror = () => ok(); document.head.appendChild(s); setTimeout(ok, 8000); });
        if (!RT0()) return;
        YOU.state = 'asking';
        const room = await RT0().join('bank', { game: 'ashvale' });
        if (!room || !room.online || !room.me || room.me.guest || !room.me.address) { YOU.state = 'signed-out'; return; }
        const BANK = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c';   /* @ashvale: only its answers count */
        let done = false;
        room.on('message', (m, p) => {
          if (done || !m || m.t !== 'where' || m.to !== room.me.address || !p || p.address !== BANK) return;
          done = true; if (m.none) { YOU.state = 'never-played'; const n = $('ea-note'); n.textContent = 'Play ASHVALE once and your spot shows here.'; n.hidden = false; } else setYou(m.x, m.y);
        });
        friends(room, BANK).catch(e => console.warn('Atlas: contacts', e && e.message));
        for (let k = 0; k < 4 && !done; k++) { YOU.asked++; room.send({ t: 'where?', v: 1 }); await new Promise(ok => setTimeout(ok, 6000)); }
        if (!done) YOU.state = 'no-answer';
      }
      /* CONTACTS (2026-10-07: "If a player is logged in and playing the game and in your address book, show their
         location on the Atlas"; mutual contacts only). Your arcade address book (arcade.contacts - the arcade asks you first)
         goes to the @ashvale Bank with the question; it answers only for contacts who also have you in their book and are
         playing now. The Bank keeps contact links in memory only. Orange dots with their @name. */
      const FR = new Map();   /* address -> {el, tag, at} */
      async function friends(room, BANK) {
        if (!(window.arcade && window.arcade.contacts)) await new Promise(ok => { const s = document.createElement('script'); s.src = '/r/contacts.js'; s.onload = s.onerror = () => ok(); document.head.appendChild(s); setTimeout(ok, 8000); });
        if (!(window.arcade && window.arcade.contacts)) return;
        const L = await window.arcade.contacts.list(), tags = new Map();
        for (const c of Array.isArray(L) ? L : []) if (c && typeof c.address === 'string') tags.set(c.address, c.tag || '');
        if (!tags.size) return;
        let seen = new Set();
        room.on('message', (m, p) => {
          if (!m || m.t !== 'friends' || m.to !== room.me.address || !p || p.address !== BANK) return;
          for (const [a, x, y] of m.f || []) {
            const g = gameAt(x, y); if (!g || !tags.has(a)) continue; seen.add(a);
            let F = FR.get(a); if (!F) { const el = document.createElement('div'); el.className = 'you fr'; el.innerHTML = '<i></i><b></b>'; hud.querySelector('.ea').appendChild(el); F = { el }; FR.set(a, F); }
            F.tag = tags.get(a); F.el.querySelector('b').textContent = F.tag ? '@' + F.tag : a.slice(0, 6) + '...'; F.at = Object.assign(g, { gx: x, gy: y });
          }
        });
        const ask = async () => {
          for (const [a, F] of FR) if (!seen.has(a)) { F.el.remove(); FR.delete(a); }   /* stopped playing: the dot goes */
          seen = new Set(); const all = Array.from(tags.keys());
          for (let i = 0; i < all.length; i += 8) { room.send({ t: 'friends?', v: 1, a: all.slice(i, i + 8) }); await new Promise(ok => setTimeout(ok, 400)); }
        };
        ask(); setInterval(ask, 60000);
      }
      function friendsTick() {
        for (const F of FR.values()) {
          if (!F.at) continue;
          const s = screenOf(F.at.u, 1.5); if (!s) { F.el.style.display = 'none'; continue; }
          F.el.style.display = 'block'; F.el.style.left = s[0] + 'px'; F.el.style.top = s[1] + 'px';
        }
      }
      meBtn.onclick = () => { if (PLACES.you) flyTo('you'); };
      setTimeout(() => { try { buildEquator(); } catch (e) { console.warn('Atlas: no equator line', e && e.message); } }, 300);
      setTimeout(() => findMe().catch(e => { YOU.state = 'error'; console.warn('Atlas: could not find you', e && e.message); }), 1500);
      let hudT = 0;
      function hudTick() {
        if (frame - hudT < 10) return; hudT = frame;
        const a = cam.alt, ll = uToLL(cam.u);
        altEl.textContent = (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + ' km' : Math.round(a) + ' m') + ' up  ·  ' + Math.abs(ll[0]).toFixed(2) + '°' + (ll[0] >= 0 ? 'N' : 'S') + ' ' + Math.abs(ll[1]).toFixed(2) + '°' + (ll[1] >= 0 ? 'E' : 'W');
      }

      /* ---- start: the whole globe, over Ashvale ---- */
      const at = q.get('at');
      if (PLACES.ashvale) cam.u = PLACES.ashvale.u.slice();
      if (q.has('lat') && q.has('lon')) cam.u = llToU(+q.get('lat'), +q.get('lon'));
      if (q.has('alt')) cam.alt = +q.get('alt');
      if (at && PLACES[at]) { cam.u = PLACES[at].u.slice(); cam.alt = PLACES[at].alt; }
      requestAnimationFrame(tick);
      const app = {
        flyTo, setAlt: a => { cam.alt = Math.max(MIN_ALT, Math.min(MAX_ALT, a)); },
        state: () => ({ lat: uToLL(cam.u)[0], lon: uToLL(cam.u)[1], alt: cam.alt, hd: cam.hd, tilt: cam.tilt, flying: !!cam.fly, ex: U.uEx.value, ground: groundH, face: tP && tP.face }),
        stats: () => ({ patches: drawn.length, built, live, queue: buildQ.size, chunks: chunks.size, chunksBuilt: Array.from(chunks.values()).filter(c => c.mesh).length, frame }),
        places: PLACES, W, G,
        friends: () => Array.from(FR.entries()).map(([a, F]) => ({ a, tag: F.tag, at: F.at && [F.at.gx, F.at.gy], shown: F.el.style.display === 'block' })),
        you: (x, y) => { if (x != null) setYou(x, y); return { state: YOU.state, asked: YOU.asked, at: YOU.at && [YOU.at.gx, YOU.at.gy], shown: youEl.style.display === 'block' }; },
        /* the world editor (the operator: "edit the terrain raising and lowering and region type" in the Atlas) */
        pick: (x, y) => groundUnder(x, y),
        setEdits: (list, near) => {
          W.setEdits(list);
          if (near && near.u) {   /* only the patches and ground chunks a stroke touches; the drawn ones are rebuilt in place */
            const cx = near.u[0] * R, cy = near.u[1] * R, cz = near.u[2] * R, rr = (near.r || 50) + 10, onScreen = new Set(drawn);
            const st = roots.slice();
            while (st.length) { const n = st.pop(); if (Math.hypot(n.C[0] - cx, n.C[1] - cy, n.C[2] - cz) > n.rad * 1.2 + rr) continue;
              if (n.mesh) { if (onScreen.has(n)) { if (!n.stale) { n.stale = true; staleQ.push(n); } } else dropMesh(n); }   /* on screen: rebuilt a few a frame, the old mesh shown till then */
              if (n.kids) for (const k of n.kids) st.push(k); }
            for (const [key, c] of chunks) { if (!c.P) continue; if (Math.hypot(c.P[0] + (c.E[0] + c.N[0]) * SZ / 2 - cx, c.P[1] + (c.E[1] + c.N[1]) * SZ / 2 - cy, c.P[2] + (c.E[2] + c.N[2]) * SZ / 2 - cz) > SZ + rr) continue;
              if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); } chunks.delete(key); }
            return;
          }
          const st = roots.slice();   /* every patch in the quadtree goes; the 20 roots are rebuilt at once so the planet never blanks */
          while (st.length) { const n = st.pop(); if (n.mesh) { if (n.mesh.parent) n.mesh.parent.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh = null; } if (n.kids) for (const k of n.kids) st.push(k); }
          for (const c of chunks.values()) if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); }
          chunks.clear(); buildQ.clear(); for (const r0 of roots) buildNode(r0);
        }
      };
      root.EARTH = app;
      return app;
    }
    return { api: 1, start };
  }
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('earth', META, factory);
})(typeof globalThis !== 'undefined' ? globalThis : this);
