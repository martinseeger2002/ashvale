/* ASHVALE 3D scene module: builds the static world from the merged zone map (core.M): terrain with RuneScape-2-style
   blended tile colours, water, instanced trees (with stumps for chopped trees), rocks with ore, village buildings, fences,
   torches, the well, props, flowers, fishing spots, and the minimap picture. Generic by tile letter and object kind, so a
   new zone module that uses the same letters/kinds needs no scene change.
   build(map, {rect, chunk, outer}) -> {group, heightAt(x,z), pickables, pickInfo(hit), setDepleted(tileKey, on), update(dt, time), waterY}
   minimap(map, rect?) -> canvas    heights(map) -> heightAt(x, z) shared by every build of the map
   Globe P2: map = core.M (src/world.js, tiles through accessors). With seeded land (map.seeded) the engine also builds
   64 m chunks ({rect, chunk: true}: only the tiles no set piece owns, worldgen heights, camp tents) around the player. */
(function (G) {
  'use strict';
  function sceneFactory(deps) {
    const THREE = deps.three;
    const TILE_COL = { i: 0x8a7a5a, '.': 0x5f9e3f, f: 0x62a242, F: 0x5c9a3e, ',': 0x4a7f34, T: 0x40702c, P: 0x3e6c2c, O: 0x43732e, p: 0xa98a5a, c: 0x6c675f, d: 0x8f7b5e, B: 0x7a5a36, g: 0xb8ac62, q: 0xa9b29c, v: 0x6a8a75, J: 0xd9e9f2,
      s: 0xcdbb84, '~': 0x6a7a55, H: 0x8a7a5a, X: 0x7d8a52, R: 0x7e7a6a, N: 0x7e7a6a, I: 0x7e7a6a, r: 0x6f7a55,
      W: 0x4a7a3a, M: 0x4c7030, Y: 0x36612a, U: 0xc9b47c, C: 0x74716e, G: 0x7e7a6a, A: 0x767a82, '^': 0x74716a, K: 0x6f8f4a, E: 0x5a8a3a, L: 0x5b7a3a, Q: 0x2f5a34 };
    const ORE = { R: 0xc8702c, N: 0xd8d8d0, I: 0x8a4632, C: 0x33333c, G: 0xd9a930, A: 0x6f86c8 };
    const WATER_Y = -0.16;
    let LAMPQ = null;   /* (x, y) -> whether a tended lamp or town torch is lit; the engine sets this from the guards */
    const SNOWC = new THREE.Color(0xf2f1ec);

    function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
    function vnoise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    const matCache = new Map();
    /* see-through (2026-10-05: "anything that gets in the way of the camera view of the avatar become transparent"):
       across the whole view (the operator: "the see-through circle should definitely be the entire viewport"), everything more
       than 2 m nearer the camera than the avatar dissolves, fading over 1.5 m with a dither. The engine sets the uniforms each frame (SCENE.see). */
    /* gas street lamps (2026-10-07): one shared glass material, lit warm at night and dull by day (engine: lampGlow) */
    const LAMPG = new THREE.MeshBasicMaterial({ color: 0x8a8670 }), LAMP_OFF = new THREE.Color(0x8a8670), LAMP_ON = new THREE.Color(0xffd27a);
    let NIGHTK = 0;
    const lampGlow = k => { const t = Math.min(1, Math.max(0, k)); LAMPG.color.copy(LAMP_OFF).lerp(LAMP_ON, t); NIGHTK = t; };
    /* the birch bark canoe (jiimaan) of Ziibiing (2026-10-07): a bark hull over cedar, pitch on the seams, the ends
       turned up; length along z (the way a rider faces). Its waterline is y 0. */
    /* THE WIGWAM (2026-10-07: "a center cage of bent ironwood wrapped with square pieces of birch bark, mended with sinew
       and birch bark tar"): a cage of ironwood saplings bent into arches both ways and tied to hoops; over it rows of square bark
       panels, each overlapping the row below like shingles, sewn at the joins with sinew and sealed with dark birch bark tar (the
       tar shows in every seam); binding hoops outside hold the bark down. The door (local +z) is a gap in the lowest rows.
       One instanced mesh for the panels and one for the stitches, so a whole village stays cheap. */
    const BARK = [0xe3d4b0, 0xd9c8a2, 0xece0c2, 0xcdb98f, 0xe0cfa6, 0xd4c29a];
    function wigwamShell(R0, HT, inside, seed) {
      const g = new THREE.Group(), rnd = k => hash2(seed * 7 + k, seed * 3 - k), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), V = (x, y, z) => new THREE.Vector3(x, y, z);
      const rows = [[0.0, 0.3], [0.26, 0.58], [0.54, 0.86], [0.82, 1.12], [1.08, 1.34]], panels = [];
      const at = (az, el, r = 1) => V(R0 * r * Math.cos(el) * Math.sin(az), HT * r * Math.sin(el), R0 * r * Math.cos(el) * Math.cos(az));
      rows.forEach(([e0, e1], ri) => {
        const em = (e0 + e1) / 2, n = Math.max(5, Math.round(2 * Math.PI * R0 * Math.cos(em) / 0.95)), h = at(0, e1).distanceTo(at(0, e0)) * 1.06;
        for (let k = 0; k < n; k++) {
          const az = (k + 0.5 * (ri % 2) + (rnd(ri * 50 + k) - 0.5) * 0.12) / n * 2 * Math.PI;
          if (ri < 2 && Math.abs(Math.atan2(Math.sin(az), Math.cos(az))) < 0.36) continue;   /* the doorway */
          const w = 2 * Math.PI * R0 * Math.cos(em) / n * 1.08, out = 1 + 0.012 * ri + (inside ? -0.0 : 0.004);
          const pos = at(az, em, out), nrm = V(pos.x / (R0 * R0), pos.y / (HT * HT), pos.z / (R0 * R0)).normalize();
          const up = V(0, 1, 0).sub(nrm.clone().multiplyScalar(nrm.y)).normalize(), xa = new THREE.Vector3().crossVectors(up, nrm).normalize();
          if (inside) m4.makeBasis(xa.clone().negate(), up, nrm.clone().negate()); else m4.makeBasis(xa, up, nrm); q.setFromRotationMatrix(m4);   /* inside: the panels face in, one-sided, so the wall nearest the camera (outside the lodge) never hides the room */ q.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.06));   /* the lower edge out: shingled */
          panels.push({ pos, q: q.clone(), w, h, c: BARK[Math.floor(rnd(ri * 90 + k) * BARK.length)], ri, k, xa, up, nrm });
        }
      });
      const pm = seeThrough(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: inside ? THREE.FrontSide : THREE.DoubleSide })), GEO = () => inside ? new THREE.PlaneGeometry(1, 1) : new THREE.BoxGeometry(1, 1, 1);
      const P = new THREE.InstancedMesh(GEO(), pm, panels.length), C = new THREE.Color(), one = V(1, 1, 1);
      panels.forEach((p, i) => { m4.compose(p.pos, p.q, V(p.w, p.h, 0.035)); P.setMatrixAt(i, m4); P.setColorAt(i, C.setHex(p.c)); });
      P.castShadow = !inside; P.receiveShadow = true; g.add(P);
      /* the marks on the bark (dark lenticels across it), the sinew stitches at each panel's side, and tar along its top edge */
      const marks = []; panels.forEach((p, i) => {
        for (let k = 0; k < 2; k++) if (rnd(i * 7 + k) < 0.6) marks.push([p.pos.clone().add(p.up.clone().multiplyScalar((rnd(i + k * 31) - 0.5) * p.h * 0.6)).add(p.nrm.clone().multiplyScalar(inside ? -0.02 : 0.02)), p.q, V(p.w * (0.2 + 0.3 * rnd(i * 3 + k)), 0.012, 0.01), 0x4a3a2a]);
        for (let k = -1; k <= 1; k++) marks.push([p.pos.clone().add(p.xa.clone().multiplyScalar(p.w * 0.47)).add(p.up.clone().multiplyScalar(k * p.h * 0.28)).add(p.nrm.clone().multiplyScalar(inside ? -0.022 : 0.022)), p.q, V(0.07, 0.014, 0.012), 0xcbb48a]);
        marks.push([p.pos.clone().add(p.up.clone().multiplyScalar(p.h * 0.48)).add(p.nrm.clone().multiplyScalar(inside ? -0.02 : 0.02)), p.q, V(p.w * 0.98, 0.03, 0.012), 0x241a12]);
      });
      const M = new THREE.InstancedMesh(GEO(), seeThrough(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })), marks.length);
      marks.forEach(([pos, qq, sc, c], i) => { m4.compose(pos, qq, sc); M.setMatrixAt(i, m4); M.setColorAt(i, C.setHex(c)); }); g.add(M);
      /* the tar behind the seams: a dark skin just under the panels */
      const tar = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x241a12, { side: inside ? THREE.BackSide : THREE.FrontSide })); const tr = inside ? 1.1 : 0.985; tar.scale.set(R0 * tr, HT * tr, R0 * tr); g.add(tar);
      /* the ironwood cage: arches bent across both ways and tied to hoops (inside it shows in front of the bark) */
      const wood = lam(0x5a4430), rr = inside ? 0.96 : 0.97;
      for (let k = 0; k < 4; k++) for (const axis of [0, 1]) {
        const off = (k - 1.5) * 0.42, pts = [];
        for (let i = 0; i <= 14; i++) { const t = Math.PI * i / 14, cx = Math.cos(t), r2 = Math.sqrt(Math.max(0, 1 - off * off)); const a = V(cx * r2, Math.sin(t) * r2, off); pts.push(axis ? V(a.z * R0 * rr, a.y * HT * rr, a.x * R0 * rr) : V(a.x * R0 * rr, a.y * HT * rr, a.z * R0 * rr)); }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 5), wood));
      }
      for (const hy of [0.35, 0.95, 1.6]) { const r2 = R0 * rr * Math.sqrt(1 - (hy / HT) ** 2); const h = new THREE.Mesh(new THREE.TorusGeometry(r2, 0.032, 4, 28), wood); h.rotation.x = Math.PI / 2; h.position.y = hy * rr; g.add(h); }
      if (!inside) for (const hy of [0.6, 1.35]) {   /* the binding hoops outside, over the bark */
        const r2 = R0 * 1.05 * Math.sqrt(1 - (hy / HT) ** 2) + 0.02; const h = new THREE.Mesh(new THREE.TorusGeometry(r2, 0.035, 4, 28), wood); h.rotation.x = Math.PI / 2; h.position.y = hy; h.castShadow = true; g.add(h);
      }
      return g;
    }
    const DOCKS = [];   /* the canoes lying at landings (the engine hides them while you have taken yours out) */
    function canoeMesh() {   /* an Ojibwe birch bark canoe (jiimaan, 2026-10-07): bark white side in, the warm outer bark out, high ends that
      curl up and over, gores sewn with spruce root and sealed black with pitch, root lashing round the gunwales, a winter-bark panel at the bow */
      const g = new THREE.Group(), L = 2.15, outer = lam(0xa8743f), inner = lam(0xeadfc4, { side: THREE.BackSide }), gum = 0x1e160f, root = 0xd8c89a;
      const geo = new THREE.SphereGeometry(1, 20, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      for (const m of [outer, inner]) { const h = new THREE.Mesh(geo, m); h.scale.set(0.42, 0.34, L); h.position.y = 0.34; h.castShadow = m === outer; h.receiveShadow = true; g.add(h); }
      const fl = new THREE.Mesh(new THREE.CircleGeometry(1, 18), lam(0xa27848)); fl.rotation.x = -Math.PI / 2; fl.scale.set(0.36, 1.86, 1); fl.position.y = 0.14; fl.receiveShadow = true; g.add(fl);   /* cedar sheathing over the waterline: no river in the boat */
      for (let k = -6; k <= 6; k++) g.add(mesh(new THREE.BoxGeometry(0.66 * Math.sqrt(1 - (k / 7) ** 2), 0.012, 0.03), 0x8a6238, 0, 0.152, k * 0.27));   /* the cedar ribs */
      for (const e of [-1, 1]) {
        /* the end: the bark gore rises into a tall rounded end that curls back over (the Ojibwe high end) */
        const sh = new THREE.Shape(); sh.moveTo(0, 0.02); sh.quadraticCurveTo(0.34, 0.06, 0.46, 0.42); sh.quadraticCurveTo(0.52, 0.78, 0.3, 0.84); sh.quadraticCurveTo(0.14, 0.86, 0.18, 0.7); sh.lineTo(0.0, 0.34); sh.lineTo(0, 0.02);
        const end = new THREE.Mesh(new THREE.ShapeGeometry(sh, 10), lam(0x9a6838, { side: THREE.DoubleSide })); end.rotation.y = e > 0 ? -Math.PI / 2 : Math.PI / 2; end.position.set(0, 0.0, e * (L - 0.42)); end.castShadow = true; g.add(end);
        const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, a = t * Math.PI * 1.15; pts.push(new THREE.Vector3(0, 0.34 + 0.45 * Math.sin(Math.min(a, Math.PI / 2)) + (a > Math.PI / 2 ? 0.08 * Math.sin(a) : 0), e * (L - 0.42 + 0.36 * Math.sin(a * 0.75)))); }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.028, 5), lam(gum)));   /* the stem piece, sewn and pitched */
        const wb = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.42), 0x5a2a1a, 0, 0.34, e * (L - 0.75)); g.add(wb);   /* winter bark at the end, scraped with a design */
        for (let k = 0; k < 3; k++) for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.012, 0.035, 0.07), 0xe0c890, sx * 0.012, 0.29 + k * 0.05, e * (L - 0.75 + (k - 1) * 0.12)));
      }
      for (const sx of [-1, 1]) {   /* the gunwales, along the hull's own curve, wrapped with root lashing */
        const pts = []; for (let i = 0; i <= 16; i++) { const z = (i / 16 * 2 - 1) * (L - 0.2); pts.push(new THREE.Vector3(sx * 0.41 * Math.sqrt(Math.max(0, 1 - (z / L) ** 2)), 0.34 + 0.08 * (z / L) ** 4, z)); }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.03, 5), lam(0x6a4a2a)));
        for (let k = -9; k <= 9; k += 1) { const z = k * 0.2; if (Math.abs(k) % 3 === 0) continue; g.add(mesh(new THREE.BoxGeometry(0.075, 0.075, 0.05), root, sx * 0.41 * Math.sqrt(Math.max(0, 1 - (z / L) ** 2)), 0.34 + 0.08 * (z / L) ** 4, z)); }
      }
      for (const z of [-0.8, 0, 0.8]) g.add(mesh(new THREE.BoxGeometry(0.8 * Math.sqrt(1 - (z / L) ** 2), 0.04, 0.07), 0x8a6a40, 0, 0.33, z));    /* the thwarts */
      for (const z of [-1.45, -0.95, -0.45, 0.45, 0.95, 1.45]) for (const sx of [-1, 1]) {   /* the gores: black pitched seams down the sides */
        const r = 0.42 * Math.sqrt(1 - (z / L) ** 2); g.add(mesh(new THREE.BoxGeometry(0.015, 0.3, 0.025), gum, sx * (r + 0.004), 0.2, z));
      }
      return g;
    }
    /* THE SEASONS (2026-10-07; the maths: the `seasons` module). Shared uniforms the ground and still water read, and a
       register of every tree crown built, so a change of season recolours the woods in place - no rebuild. */
    const SEASON_U = { uGround: { value: new THREE.Color(1, 1, 1) }, uSnow: { value: 0 }, uIce: { value: 0 }, uLitter: { value: 0 }, uTreeSnow: { value: 0 } };
    let SEASON_CUR = null, SEASON_LIB = null; const TREE_REG = [], FLORA_REG = [], RICE_REG = [];
    const BRANCH_TIPS = [];   /* where each branch ends: spring's first leaves grow out from here */
    const BRANCH_GEO = (() => { const parts = [[0.35, 0.0], [-0.3, 0.6], [0.05, -0.4], [0.3, 0.45], [-0.25, -0.35]].map(([dx, dz], i) => {
      const L = 0.85 + 0.1 * i % 0.3, g = new THREE.CylinderGeometry(0.025, 0.045, L, 5); g.translate(0, L / 2, 0); g.rotateZ(-dx * 1.2); g.rotateX(dz * 1.2); g.translate(0, 0.92, 0);
      const tip = new THREE.Vector3(0, L, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), -dx * 1.2).applyAxisAngle(new THREE.Vector3(1, 0, 0), dz * 1.2); tip.y += 0.92; BRANCH_TIPS.push(tip);
      return { geo: g }; });
      return parts; })();
    const BUD_GEO = new THREE.IcosahedronGeometry(0.26, 0);
    function seasonGround(mat) {   /* grass takes the season's tint; snow lies on all ground, a little thinner on paths and sand */
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r);
        sh.uniforms.uGround = SEASON_U.uGround; sh.uniforms.uSnow = SEASON_U.uSnow; sh.uniforms.uLitter = SEASON_U.uLitter;
        /* the fallen leaves (2026-10-07: "covering the ground with the color of the leaves"): grass under a patchwork of
           gold, russet and scarlet, a hand's breadth per patch, from the fall until the spring grass comes through */
        sh.vertexShader = 'attribute float aLeafy;\nvarying float vLeafy;\nvarying vec2 vLitW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vLitW = (modelMatrix * vec4(transformed, 1.0)).xz; vLeafy = aLeafy;');
        sh.fragmentShader = 'uniform vec3 uGround;\nuniform float uSnow;\nuniform float uLitter;\nvarying float vLeafy;\nvarying vec2 vLitW;\nfloat litH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat snowN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(litH(i), litH(i + vec2(1.0, 0.0)), f.x), mix(litH(i + vec2(0.0, 1.0)), litH(i + vec2(1.0, 1.0)), f.x), f.y); }\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  { vec3 c0 = diffuseColor.rgb; float grassy = smoothstep(0.0, 0.05, c0.g - max(c0.r, c0.b)); vec3 c1 = mix(c0, clamp(c0 * uGround, 0.0, 1.0), grassy);\n    if (uLitter > 0.0) { vec2 q = floor(vLitW * 3.3); float h = litH(q), h2 = litH(q + 17.0); vec3 lc = h < 0.4 ? vec3(0.78, 0.56, 0.16) : h < 0.75 ? vec3(0.55, 0.30, 0.11) : vec3(0.70, 0.17, 0.08); lc *= 0.8 + 0.3 * h2; c1 = mix(c1, lc, grassy * uLitter * vLeafy * (0.62 + 0.3 * h2)); }\n    float nz = 0.08 + 0.84 * (0.65 * snowN(vLitW * 0.18) + 0.35 * snowN(vLitW * 0.61 + 7.3)); float cover = smoothstep(nz - 0.05, nz + 0.05, uSnow);\n    diffuseColor.rgb = mix(c1, vec3(0.92, 0.94, 0.97), cover * (0.75 + 0.25 * grassy)); }'); };   /* snow lies and melts in patches (2026-10-07: "it should melt over several days and expose the green grass") */
      mat.customProgramCacheKey = () => 'season-ground'; return mat;
    }
    /* snow on the trees (2026-10-07: "Evergreen trees should stay green throughout the winter, but just have some patchy
       snow buildup on them ... a line of snow on the part [of the branches] that faces the sky"): only the faces that look up
       take snow, in patches; lo/hi: how steep a face still holds it (needles hold it on gentle slopes, a branch only on top) */
    const SNOWMAT = new Map();
    function snowyLam(color, lo, hi) {
      const k = color + ':' + lo + ':' + hi; if (SNOWMAT.has(k)) return SNOWMAT.get(k);
      const mat = seeThrough(new THREE.MeshLambertMaterial({ color, flatShading: true })), prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r);
        sh.uniforms.uTreeSnow = SEASON_U.uTreeSnow;
        sh.vertexShader = 'varying vec3 vSnW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\n  vSnW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\n  vSnW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
        sh.fragmentShader = 'uniform float uTreeSnow;\nvarying vec3 vSnW;\nfloat tsH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat tsN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(tsH(i), tsH(i + vec2(1.0, 0.0)), f.x), mix(tsH(i + vec2(0.0, 1.0)), tsH(i + vec2(1.0, 1.0)), f.x), f.y); }\n' +
          sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (uTreeSnow > 0.0) { vec3 wn = normalize(cross(dFdx(vSnW), dFdy(vSnW))); float up = smoothstep(' + lo.toFixed(2) + ', ' + hi.toFixed(2) + ', wn.y); float tpat = smoothstep(0.3, 0.5, tsN(vSnW.xz * 2.3 + vSnW.y * 1.7) + 0.55 * uTreeSnow - 0.2);   /* deep winter: most of each upper face white, a few green breaks */ diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), up * tpat * uTreeSnow); }'); };
      mat.customProgramCacheKey = () => 'tree-snow:' + k; SNOWMAT.set(k, mat); return mat;
    }
    function seasonIce(mat) {   /* still water (lakes, ponds) turns to ice when frozen; rivers and the sea never do */
      mat.onBeforeCompile = (sh) => { sh.uniforms.uIce = SEASON_U.uIce;
        sh.fragmentShader = 'uniform float uIce;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.88, 0.95), uIce); diffuseColor.a = mix(diffuseColor.a, 1.0, uIce);'); };
      mat.customProgramCacheKey = () => 'season-ice'; return mat;
    }
    /* one kind of tree to the current season (2026-10-07). The branches are always there (under the leaves in summer).
       Autumn: the crown keeps its full size while it turns, then each tree drops every leaf on its own day (its hash h in the
       couple-of-days window) - no shrinking. Spring: small clusters of leaf grow out from the end of every branch (bud), then
       the crown fills in round them (grow). A felled tree stays gone whatever the season. */
    const TS_M = new THREE.Matrix4(), TS_S = new THREE.Matrix4(), TS_T = new THREE.Matrix4(), TS_T2 = new THREE.Matrix4(), CROWN_Y = { T: 1.3, O: 1.45, W: 1.42, M: 1.32, E: 1.6 }, TS_Z = new THREE.Matrix4().makeScale(0, 0, 0), TS_C = new THREE.Color(), TS_B = new THREE.Color();
    function treeSeason(reg) {
      const S = SEASON_CUR, L = SEASON_LIB; if (!S || !L) return;
      const dec = L.deciduous(reg.kind), lf = S.leaf, nb = BRANCH_TIPS.length;
      for (const t of reg.list) {
        const c = L.leafColour(reg.kind, t.base, S, (t.h * 7.13) % 1);   /* each tree its own autumn shade */ TS_C.setRGB(c[0], c[1], c[2]);
   /* snow on the evergreens, white once the frost is hard */
        reg.crown.setColorAt(t.n, TS_C);
        if (!dec) continue;
        const gone = !!t.felled, bare = !lf.dropped ? false : lf.dropped(t.h), sp = !bare && lf.spring ? lf.spring(t.h, reg.kind) : null;   /* the whole kind together */
        /* a broadleaf tree's leaves ARE the clusters at its branch tips (2026-10-07: they sprout at the ends of the branches,
           swell, and "when they are at their fully grown state they should just stay like that"): the old one-piece crown is
           never shown for these kinds; the clusters turn colour in autumn and drop on the tree's day */
        reg.crown.setMatrixAt(t.n, TS_Z);
        if (reg.branches) reg.branches.setMatrixAt(t.n, gone ? TS_Z : t.m);
        if (reg.buds) {
          const b = sp && !gone ? sp.bud * (1 + 1.1 * sp.swell) : 0; TS_B.copy(TS_C);   /* sprout, then swell to full leaf, and stay */
          for (let k = 0; k < nb; k++) {
            const i = t.n * nb + k, tip = BRANCH_TIPS[k];
            reg.buds.setMatrixAt(i, b <= 0.01 ? TS_Z : TS_M.copy(t.m).multiply(TS_S.makeTranslation(tip.x, tip.y, tip.z)).multiply(TS_S.makeScale(b, b, b)));
            reg.buds.setColorAt(i, TS_B);
          }
        }
      }
      reg.crown.instanceColor.needsUpdate = true; reg.crown.instanceMatrix.needsUpdate = true; reg.crown.boundingSphere = null;   /* bounds again: an InstancedMesh keeps the bounds of its first draw, and a bud or a crown that was nothing then was culled for good */
      if (reg.branches) reg.branches.instanceMatrix.needsUpdate = true;
      if (reg.buds) { reg.buds.instanceMatrix.needsUpdate = true; reg.buds.boundingSphere = null; if (reg.buds.instanceColor) reg.buds.instanceColor.needsUpdate = true; reg.buds.visible = dec; }
    }
    /* the small flora (flowers, grass tufts, mushrooms; 2026-10-07: "removed in the fall and grow back in the spring"):
       each plant has its own moment (h) in spring to come back, and grows up from nothing */
    function floraSeason(reg) {
      const S = SEASON_CUR; if (!S || !S.flora) return;
      for (const st of reg.sets) {
        for (let i = 0; i < st.ms.length; i++) {
          const f = S.flora(hash2(i * 7 + 3, st.ms.length + i));
          st.im.setMatrixAt(i, f <= 0.01 ? TS_Z : f >= 1 ? st.ms[i] : TS_M.copy(st.ms[i]).multiply(TS_S.makeScale(f, f, f)));
        }
        st.im.instanceMatrix.needsUpdate = true; st.im.boundingSphere = null;
      }
    }
    /* MANOOMIN THROUGH THE YEAR (2026-10-07: "a seasonal growth with the dark burgundy grain only harvestable in late August
       to early October"): shoots after the ice goes out, tall by early summer; green heads in midsummer that darken to burgundy;
       ripe late August to early October (the ricing season, S.rice); then the grain drops, the stalks go to straw and lie down;
       nothing over the winter. Each plant a few days apart (h). */
    const RS_Q = new THREE.Quaternion(), RS_E = new THREE.Euler(), RS_P = new THREE.Vector3(), RS_S = new THREE.Vector3(), RS_C = new THREE.Color();
    const RICE_GREEN = new THREE.Color(0x6f8a3a), RICE_STRAW = new THREE.Color(0xb59a5a), RICE_HEADG = new THREE.Color(0x7d9a44), RICE_RIPE = new THREE.Color(0x4a1626), RICE_RIPE2 = new THREE.Color(0x5c1e2e);
    function riceSeason(reg) {
      const S = SEASON_CUR; if (!S || !S.riceAt) return;
      const set = (im, i, x, y, z, sx, sy, sz, ry, rx, col) => { if (sy <= 0.002) { im.setMatrixAt(i, TS_Z); return; } RS_E.set(rx, ry, 0); RS_Q.setFromEuler(RS_E); TS_M.compose(RS_P.set(x, y, z), RS_Q, RS_S.set(sx, sy, sz)); im.setMatrixAt(i, TS_M); im.setColorAt(i, col); };
      reg.plants.forEach((q, i) => {
        const R = S.riceAt(q.h), hh = q.hh * R.tall, lean = q.lean + R.lie * 1.1;
        RS_C.copy(RICE_GREEN).lerp(RICE_STRAW, R.straw);
        set(reg.stalk, i, q.x, q.base + Math.cos(lean) * hh / 2, q.z, 0.018, hh, 0.018, q.a, lean, RS_C);
        set(reg.blade, i, q.x, q.base + hh * 0.4, q.z, 0.12 * Math.min(1, R.tall * 1.5), 0.012, 0.02, q.a + 0.8, 0.9, RS_C);
        const tx = q.x + Math.sin(q.a) * Math.sin(lean) * hh, tz = q.z + Math.cos(q.a) * Math.sin(lean) * hh;
        RS_C.copy(RICE_HEADG).lerp(q.dark ? RICE_RIPE2 : RICE_RIPE, R.ripe);
        set(reg.head, i, tx, q.base + Math.cos(lean) * hh + 0.09, tz, 0.035, 0.22 * R.head, 0.03, q.a, lean + 0.35, RS_C);
      });
      for (const im of [reg.stalk, reg.blade, reg.head]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
    function seasonApply(S, lib) {   /* the engine, when the season where you stand has moved on */
      SEASON_CUR = S; SEASON_LIB = lib;
      SEASON_U.uGround.value.setRGB(S.ground[0], S.ground[1], S.ground[2]); SEASON_U.uSnow.value = S.frozen ? 1 : Math.min(1, S.snow * 2); SEASON_U.uIce.value = S.frozen ? 1 : 0;   /* the moment the leaves on the ground go (the freeze), the ground is white (2026-10-07) */ SEASON_U.uLitter.value = S.litter || 0; SEASON_U.uTreeSnow.value = Math.min(1, S.snow * 1.6);
      for (let i = TREE_REG.length - 1; i >= 0; i--) { const r = TREE_REG[i]; if (!r.crown.parent) { TREE_REG.splice(i, 1); continue; } treeSeason(r); }
      for (let i = RICE_REG.length - 1; i >= 0; i--) { const r = RICE_REG[i]; if (!r.head.parent) { RICE_REG.splice(i, 1); continue; } riceSeason(r); }
      for (let i = FLORA_REG.length - 1; i >= 0; i--) { const r = FLORA_REG[i]; if (r.sets.length && !r.sets[0].im.parent) { FLORA_REG.splice(i, 1); continue; } floraSeason(r); }
    }
    const SEE = { uSeeP: { value: new THREE.Vector2(-1e4, -1e4) }, uSeeR: { value: 0 }, uSeeD: { value: 0 }, uSeeY: { value: -1e9 } };   /* uSeeY: the avatar's feet - the floor and ground you stand on never dissolve (the operator: upstairs it looked like standing outside the house) */
    function seeThrough(m) {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, SEE);
        sh.vertexShader = 'varying float vSeeY;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  { vec4 sp = vec4(transformed, 1.0);\n  #ifdef USE_INSTANCING\n  sp = instanceMatrix * sp;\n  #endif\n  vSeeY = (modelMatrix * sp).y; }');
        sh.fragmentShader = 'uniform vec2 uSeeP;\nuniform float uSeeR;\nuniform float uSeeD;\nuniform float uSeeY;\nvarying float vSeeY;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\n  if (uSeeR > 0.0 && vSeeY > uSeeY) { float vd = length(vViewPosition); if (vd < uSeeD) { float f = smoothstep(uSeeD - 1.5, uSeeD, vd); float nz = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453); if (nz > f) discard; } }');
      };
      m.customProgramCacheKey = () => 'see2';
      return m;
    }
    function lam(color, o) { const k = color + JSON.stringify(o || {}); if (!matCache.has(k)) matCache.set(k, seeThrough(new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, o || {})))); return matCache.get(k); }
    function mesh(geo, color, x, y, z, o) { const m = new THREE.Mesh(geo, lam(color, o)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; return m; }
    /* ---------- the house kit: data module 'housekit' (Quaternius Medieval Village pieces converted to flat colours by
       tools/housekit/q2code.mjs: per piece 1 cm int16 positions + per-colour triangle lists, no textures). The operator
       2026-10-05: "I love them" - the village houses are built from these; without the module the old box houses draw. */
    let KIT;
    function kitData() { if (KIT === undefined) { try { KIT = (G.ASH3D && G.ASH3D.get && G.ASH3D.get('housekit')) || null; } catch (e) { KIT = null; } } return KIT; }
    const kitTris = new Map();   /* piece -> [[colour, Float32Array of triangle corners]] */
    function kitPiece(name) {
      if (kitTris.has(name)) return kitTris.get(name);
      const K = kitData(), r = K && K.pieces[name]; if (!r) { kitTris.set(name, null); return null; }
      const b64 = s => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k); return u8.buffer; };
      const P = new Int16Array(b64(r.p)), I = r.w === 2 ? new Uint16Array(b64(r.i)) : new Uint32Array(b64(r.i));
      const out = r.g.map(([c, s, n]) => { const t = new Float32Array(n * 3); for (let k = 0; k < n; k++) { const v = I[s + k] * 3; t[k * 3] = P[v] / 100; t[k * 3 + 1] = P[v + 1] / 100; t[k * 3 + 2] = P[v + 2] / 100; } return [K.palette[c], t]; });
      kitTris.set(name, out); return out;
    }
    /* collects transformed kit pieces per colour for one target group; flush() adds one mesh per colour */
    function KitBatch(target) {
      const buckets = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
      return {
        add(name, x, y, z, ry, sx, sy, sz, tint) {
          const pc = kitPiece(name); if (!pc) return false;
          m.compose(ps.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), sc.set(sx, sy, sz)); const a = m.elements;
          for (const [c0, t] of pc) {
            const c = (tint && tint[c0]) || c0; let b = buckets.get(c); if (!b) buckets.set(c, b = []);
            const o = new Float32Array(t.length);
            for (let k = 0; k < t.length; k += 3) { const X = t[k], Y = t[k + 1], Z = t[k + 2]; o[k] = a[0] * X + a[4] * Y + a[8] * Z + a[12]; o[k + 1] = a[1] * X + a[5] * Y + a[9] * Z + a[13]; o[k + 2] = a[2] * X + a[6] * Y + a[10] * Z + a[14]; }
            b.push(o);
          }
          return true;
        },
        flush() {
          for (const [c, list] of buckets) {
            let n = 0; for (const o of list) n += o.length; const pos = new Float32Array(n); let off = 0; for (const o of list) { pos.set(o, off); off += o.length; }
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
            const K = kitData();
            if (K && c === K.glass) {   /* window glass: see-through, still there (2026-10-05) - a pale blue pane at 35 %, no shadow */
              const gm = mesh(g, 0xa9cde6, 0, 0, 0, { side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }); gm.castShadow = false; gm.renderOrder = 2; target.add(gm);
            } else target.add(mesh(g, parseInt(c.slice(1), 16), 0, 0, 0, { side: THREE.DoubleSide }));
          }
          buckets.clear();
        }
      };
    }
    function mergeGeos(list) {   /* [{geo, matrix?, col?}] -> one non-indexed geometry (position + normal, plus colour when any part has one) */
      let n = 0; const parts = list.map(({ geo, m }) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m); n += g.attributes.position.count; return g; });
      const pos = new Float32Array(n * 3); let o = 0;
      for (const g of parts) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (list.some(p => p.col)) {
        const col = new Float32Array(n * 3); let oc = 0;
        for (let i = 0; i < parts.length; i++) { const c = list[i].col || WHITE; for (let v = 0, cnt = parts[i].attributes.position.count; v < cnt; v++) { col[oc++] = c.r; col[oc++] = c.g; col[oc++] = c.b; } }
        out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      out.computeVertexNormals(); return out;
    }
    const WHITE = new THREE.Color(0xffffff);
    const M4 = (x, y, z, sx, sy, sz, ry) => { const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0), new THREE.Vector3(sx, sy == null ? sx : sy, sz == null ? sx : sz)); return m; };

    /* many boxes/cylinders of one colour -> one InstancedMesh each */
    function Batcher(group) {
      const geos = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8), cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6), cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12), cyl32: new THREE.CylinderGeometry(0.5, 0.5, 1, 32), cone: new THREE.ConeGeometry(0.5, 1, 6), pyr: new THREE.ConeGeometry(0.5, 1, 4), rock: new THREE.DodecahedronGeometry(0.5, 0), cyl5: new THREE.CylinderGeometry(0.5, 0.5, 1, 5), cyl7: new THREE.CylinderGeometry(0.5, 0.5, 1, 7), stone: new THREE.IcosahedronGeometry(0.5, 0) };
      const sets = new Map();
      return {
        add(kind, color, x, y, z, sx, sy, sz, ry, rx, rz) {
          if (!geos[kind] && kind.indexOf('arc:') === 0) {   /* a curved stone face: one block of n round a tower of radius r (unit height, radius 1, centred on +x) */
            const [, n, r] = kind.split(':').map(Number), th = 2 * Math.PI / n - 0.05 / r;
            geos[kind] = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true, Math.PI / 2 - th / 2, th);
          }
          const k = kind + ':' + color; if (!sets.has(k)) sets.set(k, { kind, color, ms: [] }); const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new THREE.Vector3(sx, sy, sz)); sets.get(k).ms.push(m); },
        finish(shadow) { const out = []; for (const s of sets.values()) { const im = new THREE.InstancedMesh(geos[s.kind], lam(s.color), s.ms.length); s.ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow !== false; im.receiveShadow = true; group.add(im); out.push({ im, ms: s.ms }); } return out; }
      };
    }
    function textSprite(text, w, h, bg, fg) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#3a2410'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 88);
      g.fillStyle = fg; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })); return m;
    }

    /* a hanging shop sign (2026-10-05: "signs that stick out ... on a pole", "double sided"): an iron pole out
       from the wall under the eaves with a brace, a board on two chains, the name painted on both faces (each face its
       own plane, so neither reads mirrored). (x, y, z) = where the pole meets the wall, out = [dx, dz] the wall's outward normal. */
    function hangSign(into, text, x, y, z, out) {
      const IRON = 0x2e2a26, ox = out[0], oz = out[1], L = 2.0, along = ox !== 0;   /* along: the pole runs along x */
      const box = (w, h, d, col, px, py, pz) => { const m = mesh(new THREE.BoxGeometry(w, h, d), col, px, py, pz); into.add(m); return m; };
      box(along ? L : 0.06, 0.06, along ? 0.06 : L, IRON, x + ox * L / 2, y, z + oz * L / 2);
      const br = box(along ? 1.1 : 0.05, 0.05, along ? 0.05 : 1.1, IRON, x + ox * 0.42, y - 0.38, z + oz * 0.42);   /* out past the eaves (the operator) */
      if (along) br.rotation.z = ox * Math.PI / 4; else br.rotation.x = -oz * Math.PI / 4;
      const bx = x + ox * 1.5, bz = z + oz * 1.5, by = y - 0.46, BW = 1.05, BH = 0.42;
      for (const k of [-0.36, 0.36]) box(0.025, 0.2, 0.025, IRON, bx + ox * k, y - 0.13, bz + oz * k);
      box(along ? BW + 0.06 : 0.05, BH + 0.06, along ? 0.05 : BW + 0.06, 0x5a3a1e, bx, by, bz);   /* the board's edge */
      for (const face of [1, -1]) {
        const t = textSprite(text, BW, BH, '#e9d6a6', '#3a2410'); t.material.side = THREE.FrontSide;
        if (along) { t.rotation.y = face > 0 ? 0 : Math.PI; t.position.set(bx, by, bz + face * 0.028); }
        else { t.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2; t.position.set(bx + face * 0.028, by, bz); }
        into.add(t);
      }
    }

    /* ground heights at tile corners, shared by every build of one map (and by the engine's heightAt). Without seeded
       land: the old map's own rolling noise (flattened in the village, dipped at water), as before. With seeded land
       (globe P2, map.seeded): outside the set pieces the height is worldgen's (relative to the set pieces' base), inside
       them the own heights fade into worldgen's over the last 8 m before the edge, so there is no seam. */
    function heightsOf(map) {
      if (map._hgt) return map._hgt;
      const W = map.W, H = map.H, seeded = !!map.seeded;
      const at = seeded ? map.tileAt : (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 'T' : map.tileAt(x, y);
      const zone = seeded ? map.zoneAt : (x, y) => map.zoneAt(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)));
      /* raised platforms (kind cpad, the lake castle - the operator: "raise the terrain", "it should be raised above the water level"):
         inside one the ground is flat at its top (worldgen's frame; groundH's = top - HB = top + waterH) */
      const PADS = (map.objects || []).filter(o => o.k === 'cpad' && o.top != null);
      const padTop = (cx, cy) => { let t = null; for (const o of PADS) if (cx >= o.x && cy >= o.y && cx <= o.x + o.w && cy <= o.y + o.h) t = Math.max(t == null ? -1e9 : t, o.top); return t == null ? null : t + (map.waterH ? map.waterH() : 0); };
      function own(cx, cy) {
        const pt = PADS.length ? padTop(cx, cy) : null;
        if (pt != null && !(at(cx - 1, cy - 1) === '~' && at(cx, cy - 1) === '~' && at(cx - 1, cy) === '~' && at(cx, cy) === '~')) return pt;
        let h = (vnoise(cx * 0.11, cy * 0.11) - 0.5) * 1.5 + (vnoise(cx * 0.37 + 9, cy * 0.37 + 3) - 0.5) * 0.35;
        const adj = [at(cx - 1, cy - 1), at(cx, cy - 1), at(cx - 1, cy), at(cx, cy)];
        /* underground (the Spider Cave): rock rises into walls round a flat floor; wading water sits a little low */
        if (map.underAt && map.underAt(cx, cy) != null) {
          if (map.underStyle && map.underStyle(cx, cy) === 'wigwam') return 0;   /* a wigwam's inside: a flat floor of mats; the bark dome is its wall */
          const rock = adj.filter(c => c === '^').length, wet = adj.filter(c => c === 'v' || c === '~').length;
          if (rock === 4) return 3.2 + (vnoise(cx * 0.3, cy * 0.3) - 0.5) * 0.7;   /* the rock: walls rise straight up from the floor's edge */
          if (rock) return 0.05 + (vnoise(cx * 0.5, cy * 0.5) - 0.5) * 0.15;
          return wet ? -0.35 + (vnoise(cx * 0.4, cy * 0.4) - 0.5) * 0.1 : (vnoise(cx * 0.2, cy * 0.2) - 0.5) * 0.25;
        }
        const z = zone(cx, cy);
        const flat = adj.some(c => 'pcHXFfdi'.indexOf(c) >= 0) || (z === 'village' && adj.some(c => c === '.'));
        if (flat) h *= z === 'village' ? 0.12 : 0.45;
        if (adj.some(c => c === 'B')) return 0.06;   /* a pier or bridge deck: just above the water (which lies at -0.16) */
        const wet = adj.filter(c => c === '~').length;
        if (wet === 4) h = -0.75 + h * 0.1; else if (wet) h = Math.min(h * 0.2, -0.3);
        else if (adj.some(c => c === 's')) h = Math.min(h, 0.02) * 0.5;
        return h;
      }
      let corner, surfOf = () => WATER_Y, chunks = null;
      if (!seeded) {
        const hc = new Float32Array((W + 1) * (H + 1));
        for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) hc[cy * (W + 1) + cx] = own(cx, cy);
        corner = (cx, cy) => hc[Math.max(0, Math.min(H, cy)) * (W + 1) + Math.max(0, Math.min(W, cx))];
      } else {
        const P = map.inPiece; chunks = new Map();
        const depth = (cx, cy) => {   /* tiles from this corner to the nearest tile outside the set pieces (0 = on the edge, max 8) */
          for (let r = 1; r <= 8; r++) for (let y = cy - r; y < cy + r; y++) for (let x = cx - r; x < cx + r; x++) {
            if (y !== cy - r && y !== cy + r - 1 && x !== cx - r && x !== cx + r - 1) continue;
            if (!P(x, y)) return r - 1;
          }
          return 8;
        };
        const fade = (cx, cy) => {   /* the ground as it will be drawn: worldgen outside the set pieces, own() inside them, mixed by distance to the piece edge */
          if (map.underNear && map.underNear(cx, cy)) return map.underAt(cx, cy) != null ? own(cx, cy) : 3.1;   /* underground: the cave's own floor and walls, solid rock round it */
          const sh = map.groundH(cx, cy);
          if (!(P(cx - 1, cy - 1) || P(cx, cy - 1) || P(cx - 1, cy) || P(cx, cy))) return sh;
          const a0 = at(cx - 1, cy - 1), a1 = at(cx, cy - 1), a2 = at(cx - 1, cy), a3 = at(cx, cy);
          if (a0 === '~' || a1 === '~' || a2 === '~' || a3 === '~' || a0 === 'v' || a1 === 'v' || a2 === 'v' || a3 === 'v') return sh;   /* water beds follow the world itself, even inside a set piece: a parcel of a sea town must not flatten the sea floor into a shelf */
          const t = depth(cx, cy) / 8, w = t * t * (3 - 2 * t);
          return own(cx, cy) * w + sh * (1 - w);
        };
        const wLevel = map.waterH() - 0.05;
        /* the level of the nearest river or lake water connected to this tile through water, within 10 m (cached per tile) */
        const NS = new Map(), wetT = (x, y) => { const t = at(x, y); return t === '~' || t === 'v' || t === 'B'; };
        const nearSurf = (tx, ty) => {
          const k = tx + ',' + ty; if (NS.has(k)) return NS.get(k);
          let res = null; if (wetT(tx, ty)) {
            const seen = new Set([k]); let ring = [[tx, ty]];
            for (let d = 0; d < 10 && ring.length && res == null; d++) {
              const next = [];
              for (const [x, y] of ring) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy, nk = nx + ',' + ny; if (seen.has(nk) || !wetT(nx, ny)) continue; seen.add(nk);
                const w = map.waterSurf(nx, ny); if (w != null) { res = res == null ? w : Math.max(res, w); continue; }
                next.push([nx, ny]);
              }
              ring = next;
            }
            /* open water with no river or lake level near (the sea): every tile this search crossed is the same open water, so
               none of them searches again - one search per stretch of sea, not one per tile (a jump to the sea-side wigwam
               rooms spent 35 s here) */
            if (res == null) for (const q of seen) NS.set(q, null);
          }
          if (NS.size > 400000) NS.clear();
          NS.set(k, res); return res;
        };
        surfOf = (tx, ty) => {   /* where the water's skin stands over this tile, the same curve build draws and rings ride */
          if (map.underAt && map.underAt(tx, ty) != null) return -0.12;   /* underground: just over the wading floor */
          const bed = (fade(tx, ty) + fade(tx + 1, ty) + fade(tx, ty + 1) + fade(tx + 1, ty + 1)) / 4;
          let ws = map.waterSurf ? map.waterSurf(tx, ty) : null;   /* rivers and lakes stand at their own level, flat (2026-10-04: "the rivers are dry"; a hollow's water "follows the contour") */
          if (ws == null && map.waterSurf) ws = nearSurf(tx, ty);   /* water with no level of its own beside a river or lake (a side channel, a bay) is part of it: its level, not a step down (2026-10-07: "Fix the sinking water tiles") */
          if (ws != null) return Math.max(wLevel, ws + 0.03 + 0.17 * Math.min(1, Math.max(0, (ws - wLevel) / 0.5)));   /* one height for a whole lake: never the bed's; a river's own level all the way down, the skin easing onto the sea at its mouth */
          /* a pond of the seeded land is a hollow dug below the world's water line, and its tiles are water exactly where the
             ground is below that line: its skin IS the line, flat, meeting the shore where the ground crosses it. Riding the
             bed (+0.6, capped at the old pond line) stepped the sheet tile by tile, floating at the rim and sunk in the middle
             (2026-10-06: "fix this lake ... water floats / sinks", the pond at 270, 0). Drawn ponds keep their rule. */
          if (!map.inPiece(tx, ty)) return wLevel;
          return Math.max(wLevel, Math.min(bed + 0.6, WATER_Y));
        };   /* the sea keeps the world's water line; rivers ride near their bed; ponds and wells stay at the old flat line, shallow and readable (2026-10-03: "the sea water looks bad") */
        const one = (cx, cy) => {
          let sh = fade(cx, cy);
          const t00 = at(cx - 1, cy - 1), t10 = at(cx, cy - 1), t01 = at(cx - 1, cy), t11 = at(cx, cy);
          const isW = (L) => L === '~' || L === 'v';
          if (t00 === 'B' || t10 === 'B' || t01 === 'B' || t11 === 'B') {
            let s = map.waterH() + 0.12;
            if (isW(t00)) s = Math.max(s, surfOf(cx - 1, cy - 1) + 0.12);
            if (isW(t10)) s = Math.max(s, surfOf(cx, cy - 1) + 0.12);
            if (isW(t01)) s = Math.max(s, surfOf(cx - 1, cy) + 0.12);
            if (isW(t11)) s = Math.max(s, surfOf(cx, cy) + 0.12);
            /* The deck stands on the world's own pad under it, and never lower than its clear-water level. own()'s
               +0.06 was set for the old pond-level map; on the seeded sea it stands a pier a metre and a half over
               the water like a brown mesa (Saltmere quay, 2026-10-04: "fix how everything looks"). A deck
               over dry land (a bridge, a pier head) still rides that land. */
            sh = Math.max(map.groundH(cx, cy), s);
          } else {
            let nW = 0, rim = -Infinity;
            if (isW(t00)) { nW++; rim = Math.max(rim, surfOf(cx - 1, cy - 1)); }
            if (isW(t10)) { nW++; rim = Math.max(rim, surfOf(cx, cy - 1)); }
            if (isW(t01)) { nW++; rim = Math.max(rim, surfOf(cx - 1, cy)); }
            if (isW(t11)) { nW++; rim = Math.max(rim, surfOf(cx, cy)); }
            if (nW && nW <= 2 && sh < rim + 0.02) sh = rim + 0.02;   /* land that touches water but is mostly land stands at its waterline instead of dipping under it (2026-10-03: "you slide into the fishing hole in ashvale") */
          }
          return sh;   /* towns stand on the world's own terrain (worldgen levels only their building pads) */
        };
        corner = (cx, cy) => {
          const k = map.key(cx >> 6, cy >> 6); let a = chunks.get(k);
          if (!a) { a = new Float32Array(4096); const x0 = cx & ~63, y0 = cy & ~63; for (let i = 0; i < 4096; i++) a[i] = one(x0 + (i & 63), y0 + (i >> 6)); chunks.set(k, a); if (chunks.size > 400) chunks.delete(chunks.keys().next().value); }
          return a[((cy & 63) << 6) | (cx & 63)];
        };
      }
      const floor = map._floor || (map._floor = new Float32Array(W * H).fill(NaN));
      function heightAt(x, z) {
        if (!seeded && (x < 0 || z < 0 || x > W || z > H)) return -0.3;
        if (x >= 0 && z >= 0 && x < W && z < H) { const fl = floor[Math.floor(z) * W + Math.floor(x)]; if (fl === fl) return fl; }
        const xi = seeded ? Math.floor(x) : Math.min(W - 1, Math.floor(x)), zi = seeded ? Math.floor(z) : Math.min(H - 1, Math.floor(z)), fx = x - xi, fz = z - zi;
        const a = corner(xi, zi), b = corner(xi + 1, zi), c = corner(xi, zi + 1), d = corner(xi + 1, zi + 1);
        return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
      }
      /* an area that arrives later (area loading) changes the ground under it: forget the cached corners there (they were worked
         out from its stub, or for an underground area from solid rock) so the next build reads its real tiles */
      const forget = (x0, y0, w, h) => { if (!chunks) return; for (let cy = (y0 - 2) >> 6; cy <= (y0 + h + 2) >> 6; cy++) for (let cx = (x0 - 2) >> 6; cx <= (x0 + w + 2) >> 6; cx++) chunks.delete(map.key(cx, cy)); };
      return (map._hgt = { corner, heightAt, floor, surf: (x, y) => surfOf(x, y), forget });
    }

    function build(map, opts) {
      opts = opts || {};
      const W = map.W, H = map.H, K = map.key, group = new THREE.Group();   /* map = core.M (src/world.js): tiles through accessors, nodes by packed tile key */
      const RC = opts.rect || [0, 0, W, H], X0 = RC[0], Y0 = RC[1], X1 = RC[0] + RC[2], Y1 = RC[1] + RC[3];
      const seeded = !!map.seeded, chunk = !!opts.chunk;
      const inR = (x, y) => x >= X0 && y >= Y0 && x < X1 && y < Y1;
      const at = seeded ? map.tileAt : (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 'T' : map.tileAt(x, y);
      const mine = chunk ? (x, y) => !map.inPiece(x, y) : () => true;   /* a seeded chunk draws only the tiles no set piece owns */
      const HG = heightsOf(map), hAt = HG.corner, heightAt = HG.heightAt;
      /* ---------- terrain mesh: shared corners, colours blended from the four tiles around each corner */
      {
        const RW = X1 - X0, RH = Y1 - Y0;
        const pos = new Float32Array((RW + 1) * (RH + 1) * 3), col = new Float32Array((RW + 1) * (RH + 1) * 3), C = new THREE.Color(), acc = new THREE.Color();
        for (let cy = Y0; cy <= Y1; cy++) for (let cx = X0; cx <= X1; cx++) {
          const i = (cy - Y0) * (RW + 1) + (cx - X0); pos[i * 3] = cx; pos[i * 3 + 1] = hAt(cx, cy); pos[i * 3 + 2] = cy;
          acc.setRGB(0, 0, 0);
          const wig = map.underStyle && map.underStyle(cx, cy) === 'wigwam';
          for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { C.setHex(wig ? 0x8a7650 : TILE_COL[at(cx + dx, cy + dy)] || 0x5f9e3f); acc.r += C.r / 4; acc.g += C.g / 4; acc.b += C.b / 4; }
          if (chunk && map.snowH < 1e8) {   /* a real mountain: alpine rock above the tree line, patchy snow on the tops */
            const hh = hAt(cx, cy), ra = Math.min(1, Math.max(0, (hh - map.snowH + 22) / 17)) * 0.85;
            if (ra > 0) { acc.r += (0.52 - acc.r) * ra; acc.g += (0.5 - acc.g) * ra; acc.b += (0.47 - acc.b) * ra; }
            const edge = map.snowH + (hash2(cx >> 3, cy >> 3) - 0.5) * 14, sm = Math.min(1, Math.max(0, (hh - edge + 3) / 6));
            if (sm > 0) { acc.r += (0.95 - acc.r) * sm; acc.g += (0.945 - acc.g) * sm; acc.b += (0.925 - acc.b) * sm; }
          }
          const j = 0.9 + hash2(cx * 7 + 1, cy * 13 + 5) * 0.2; col[i * 3] = acc.r * j; col[i * 3 + 1] = acc.g * j; col[i * 3 + 2] = acc.b * j;
        }
        const ind = [];
        for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
          if (!mine(x, y)) continue;
          const a = (y - Y0) * (RW + 1) + (x - X0), b = a + 1, c = a + RW + 1, d = c + 1;
          if ((x + y) & 1) ind.push(a, c, b, b, c, d); else ind.push(a, c, d, a, d, b);
        }
        /* leaf litter lies only under the trees that drop their leaves (2026-10-07): each corner's share of broadleaf
           crowns within 2.6 m, from the tiles themselves so it runs on across chunk edges */
        const leafy = new Float32Array((RW + 1) * (RH + 1)), PAD = 3, GW = RW + 2 * PAD, dec = new Uint8Array(GW * (RH + 2 * PAD));
        for (let y = 0; y < RH + 2 * PAD; y++) for (let x = 0; x < GW; x++) { const t = at(X0 - PAD + x, Y0 - PAD + y); dec[y * GW + x] = t === 'T' || t === 'O' || t === 'W' || t === 'M' || t === 'E' ? 1 : 0; }
        for (let cy = Y0; cy <= Y1; cy++) for (let cx = X0; cx <= X1; cx++) {
          let w = 0;
          for (let dy = -3; dy <= 2; dy++) for (let dx = -3; dx <= 2; dx++) { const gx = cx + dx - X0 + PAD, gy = cy + dy - Y0 + PAD; if (gx < 0 || gy < 0 || gx >= GW || gy >= RH + 2 * PAD || !dec[gy * GW + gx]) continue; const d = Math.hypot(dx + 0.5, dy + 0.5); if (d < 2.6) w += 1 - d / 2.6; }
          leafy[(cy - Y0) * (RW + 1) + (cx - X0)] = Math.min(1, w * 0.7);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aLeafy', new THREE.BufferAttribute(leafy, 1)); g.setIndex(ind); g.computeVertexNormals();
        const terrain = new THREE.Mesh(g, seasonGround(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
        terrain.receiveShadow = true; terrain.userData.pick = { kind: 'ground' }; group.add(terrain);
        var terrainMesh = terrain;
        if (opts.outer && !seeded) { const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x3d6a2a }));
          outer.rotation.x = -Math.PI / 2; outer.position.set(W / 2, -0.32, H / 2); outer.receiveShadow = true; group.add(outer); }
      }
      /* ---------- water. The sea stands at the world's own water line; rivers and ponds ride their own bed.
         Set pieces used to lay every water tile at the old flat WATER_Y, which on the seeded globe made a raised
         bathtub of every coast town: Saltmere drowned its own piers and the woods beyond the parcel looked flooded
         (2026-10-03: "the sea water looks bad"). Tiles of one row at one height merge into ONE quad, so the
         sheet carries no metre grid of overlapping seams; where two water heights meet, a skirt closes the step.
         Colour runs from sand-lit shallow to deep sea by the water's depth over the bed. */
      const gH = seeded ? (cx, cy) => map.groundH(cx, cy) : (cx, cy) => hAt(cx, cy);
      const wLevel = seeded ? map.waterH() - 0.05 : WATER_Y;
      const wsurf = (x, y) => HG.surf(x, y);   /* one rule for the sheet's height everywhere: set piece, chunk, draw, ring */
      {
        const RW = X1 - X0, RH = Y1 - Y0, surfC = new Float64Array(RW * RH), isWt = new Uint8Array(RW * RH);
        for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const t0 = at(x, y); if ((t0 === '~' || t0 === 'v') && mine(x, y)) { const j = (y - Y0) * RW + (x - X0); isWt[j] = 1; surfC[j] = wsurf(x, y); } }
        /* a sea sheet cannot hold a shelf: any '~' reachable over '~' from open water stands at the world line.
           Near a shore or pier the bed rule above lifts a shallow tile's surf a few centimetres above the sea, and
           those blocks read as pale stepping stones with a lit seam along the join (Saltmere pier toe, the operator
           2026-10-04). Flood across '~' only, so ponds and rivers, which ride their own bed, keep their height. */
        {
          const q = [];
          for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
            const j = (y - Y0) * RW + (x - X0);
            if (isWt[j] && at(x, y) === '~' && Math.abs(surfC[j] - wLevel) < 1e-9) q.push(j);
          }
          for (let k = 0; k < q.length; k++) {
            const j = q[k], tx = X0 + (j % RW), ty = Y0 + ((j - tx + X0) / RW);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = tx + dx, ny = ty + dy; if (nx < X0 || ny < Y0 || nx >= X1 || ny >= Y1) continue;
              const n = (ny - Y0) * RW + (nx - X0);
              if (isWt[n] && at(nx, ny) === '~' && surfC[n] > wLevel + 1e-9 && Math.abs(surfC[n] - WATER_Y) > 1e-6) { surfC[n] = wLevel; q.push(n); }
            }
          }
        }
        const parts = [], SH = new THREE.Color(0x86c5c8), DP = new THREE.Color(0x2f6ea4), CC = new THREE.Color();
        const tint = (yy, bed) => { CC.copy(SH).lerp(DP, Math.min(1, Math.max(0, (yy - bed - 0.35) / 1.0))); return CC.clone(); };
        for (let y = Y0; y < Y1; y++) {
          let run = null;
          const flush = () => {
            if (!run) return;
            const n = run.x1 - run.x0; let bed = 0;
            for (let x = run.x0; x < run.x1; x++) bed += (gH(x, y) + gH(x + 1, y) + gH(x, y + 1) + gH(x + 1, y + 1)) / 4;
            bed /= n;
            parts.push({ geo: new THREE.PlaneGeometry(n, 1).rotateX(-Math.PI / 2), m: M4((run.x0 + run.x1) / 2, run.yy, y + 0.5, 1), col: tint(run.yy, bed), still: run.still });
            run = null;
          };
          for (let x = X0; x <= X1; x++) {
            const w = x < X1 && isWt[(y - Y0) * RW + (x - X0)], yy = w ? surfC[(y - Y0) * RW + (x - X0)] : 0, still = w && map.waterKind ? map.waterKind(x, y) === 'lake' : false;
            if (run && (!w || Math.abs(yy - run.yy) > 1e-6 || still !== run.still)) flush();
            if (w && !run) run = { x0: x, x1: x + 1, yy, still }; else if (w) run.x1 = x + 1;
          }
          flush();
        }
        const skirt = (xa, ya_, xb, yb_) => {   /* a vertical quad closing the step where two water heights meet side by side */
          const ja = (ya_ - Y0) * RW + (xa - X0), jb = (yb_ - Y0) * RW + (xb - X0);
          if (!isWt[ja] || !isWt[jb]) return;
          const sa = surfC[ja], sb = surfC[jb]; if (Math.abs(sa - sb) < 0.004) return;
          const bed = (gH(Math.min(xa, xb) + 0.5, Math.min(ya_, yb_) + 0.5) + gH(Math.max(xa, xb) + 0.5, Math.max(ya_, yb_) + 0.5)) / 2;
          const midY = (sa + sb) / 2;
          const still = map.waterKind ? map.waterKind(xa, ya_) === 'lake' : false;
          if (xb !== xa) parts.push({ geo: new THREE.PlaneGeometry(1, Math.abs(sb - sa)).rotateY(Math.PI / 2), m: M4(Math.max(xa, xb) + 1, midY, ya_ + 0.5, 1), col: tint(midY, bed), still });
          else parts.push({ geo: new THREE.PlaneGeometry(1, Math.abs(sb - sa)), m: M4(xa + 0.5, midY, Math.max(ya_, yb_) + 1, 1), col: tint(midY, bed), still });
        };
        for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1 - 1; x++) skirt(x, y, x + 1, y);
        for (let y = Y0; y < Y1 - 1; y++) for (let x = X0; x < X1; x++) skirt(x, y, x, y + 1);
        /* moving water (rivers, the sea) and still water (lakes, ponds: they freeze in a hard winter) are two sheets */
        const flowing = parts.filter(q => !q.still), stillP = parts.filter(q => q.still);
        if (flowing.length) {
          const wm = new THREE.Mesh(mergeGeos(flowing), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86, emissive: 0x0a2a4a }));
          wm.receiveShadow = true; group.add(wm); var waterMesh = wm;
        }
        if (stillP.length) {
          const im = new THREE.Mesh(mergeGeos(stillP), seasonIce(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86, emissive: 0x0a2a4a })));
          im.receiveShadow = true; group.add(im); if (!waterMesh) var waterMesh = im;
        }
      }
      /* ---------- trees (instanced) */
      const treeKinds = {
        T: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.09, 0.14, 1.0, 6), m: M4(0, 0.5, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.62, 0), m: M4(0, 1.3, 0, 1, 0.85, 1) }, { geo: new THREE.IcosahedronGeometry(0.42, 0), m: M4(0.25, 1.7, 0.1, 1) }]), tc: 0x6a4a2a, cc: 0x4f8f34 },
        P: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.07, 0.11, 0.8, 6), m: M4(0, 0.4, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.ConeGeometry(0.62, 0.95, 7), m: M4(0, 0.95, 0, 1) }, { geo: new THREE.ConeGeometry(0.48, 0.8, 7), m: M4(0, 1.45, 0, 1) }, { geo: new THREE.ConeGeometry(0.3, 0.6, 7), m: M4(0, 1.9, 0, 1) }]), tc: 0x5a3c22, cc: 0x2f6a3a },
        O: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.14, 0.22, 1.1, 7), m: M4(0, 0.55, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.75, 0), m: M4(0, 1.45, 0, 1, 0.8, 1) }, { geo: new THREE.IcosahedronGeometry(0.5, 0), m: M4(-0.4, 1.35, 0.25, 1) }, { geo: new THREE.IcosahedronGeometry(0.5, 0), m: M4(0.4, 1.55, -0.2, 1) }]), tc: 0x5a3e24, cc: 0x5a7f2a },
        /* willow: a broad flat crown with curtains of twig hanging off it. maple: round and orange. yew: a dark column. */
        W: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.1, 0.18, 1.15, 6), m: M4(0, 0.57, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.66, 0).scale(1.15, 0.55, 1.15), m: M4(0, 1.42, 0, 1) }].concat([[0.52, 0.16], [-0.5, 0.1], [0.14, -0.5], [-0.18, 0.48]].map(([dx, dz]) => ({ geo: new THREE.ConeGeometry(0.16, 0.62, 6).rotateX(Math.PI).translate(dx, 1.12, dz), m: M4(0, 0, 0, 1) })))), tc: 0x6b5a38, cc: 0x87a752 },
        M: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.1, 0.16, 1.05, 6), m: M4(0, 0.52, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.68, 0), m: M4(0, 1.32, 0, 1, 0.92, 1) }, { geo: new THREE.IcosahedronGeometry(0.4, 0), m: M4(-0.34, 1.74, 0.16, 1) }]), tc: 0x6a4526, cc: 0x4f8a2e },   /* green in summer; the seasons turn it scarlet (2026-10-08) */
        /* tamarack (mashkiigwaatig): a slim spire of soft light-green needles that turns gold in autumn; cedar (giizhik): a dense
           narrow dark-green cone on a fluted red-brown trunk (2026-10-08, for the push pole and the knockers) */
        L: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.05, 0.1, 1.3, 6), m: M4(0, 0.65, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.ConeGeometry(0.46, 1.2, 7), m: M4(0, 1.25, 0, 1) }, { geo: new THREE.ConeGeometry(0.3, 0.8, 7), m: M4(0, 1.85, 0, 1) }]), tc: 0x6a4a34, cc: 0x86b04e },
        Q: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.08, 0.15, 0.9, 7), m: M4(0, 0.45, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.ConeGeometry(0.55, 1.5, 8), m: M4(0, 1.3, 0, 1) }, { geo: new THREE.ConeGeometry(0.34, 0.8, 8), m: M4(0, 2.0, 0, 1) }]), tc: 0x7a4a32, cc: 0x2f5c34 },
        /* birch (wiigwaasaatig, 2026-10-08): a slender white trunk, a light airy crown high up */
        E: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.06, 0.1, 1.45, 6), m: M4(0, 0.72, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.46, 0), m: M4(0, 1.6, 0, 0.9, 1.15, 0.9) }, { geo: new THREE.IcosahedronGeometry(0.32, 0), m: M4(0.18, 2.02, -0.08, 1) }, { geo: new THREE.IcosahedronGeometry(0.28, 0), m: M4(-0.2, 1.35, 0.14, 1) }]), tc: 0xe6e1d4, cc: 0x6f9f3e },
        Y: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.12, 0.2, 1.35, 6), m: M4(0, 0.67, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.CylinderGeometry(0.5, 0.62, 0.6, 7), m: M4(0, 1.05, 0, 1) }, { geo: new THREE.ConeGeometry(0.55, 1.15, 7), m: M4(0, 1.5, 0, 1) }, { geo: new THREE.ConeGeometry(0.4, 0.95, 7), m: M4(0, 2.15, 0, 1) }]), tc: 0x4a3826, cc: 0x27502e },
        /* a saguaro for the desert (2026-10-06: "in the desert, we need to have cactuses not pine trees"): a ribbed
           column with two arms that turn up; it blocks the way like a tree but nothing chops it */
        U: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.2, 0.23, 0.5, 8), m: M4(0, 0.25, 0, 1) }]), crown: mergeGeos([
          { geo: new THREE.CylinderGeometry(0.17, 0.2, 1.55, 8), m: M4(0, 1.2, 0, 1) }, { geo: new THREE.SphereGeometry(0.17, 8, 5, 0, 6.29, 0, 1.6), m: M4(0, 1.97, 0, 1) },
          { geo: new THREE.CylinderGeometry(0.1, 0.1, 0.36, 7).rotateZ(1.5708), m: M4(0.3, 1.05, 0, 1) }, { geo: new THREE.CylinderGeometry(0.1, 0.11, 0.55, 7), m: M4(0.46, 1.3, 0, 1) }, { geo: new THREE.SphereGeometry(0.1, 7, 4, 0, 6.29, 0, 1.6), m: M4(0.46, 1.57, 0, 1) },
          { geo: new THREE.CylinderGeometry(0.09, 0.09, 0.3, 7).rotateZ(1.5708), m: M4(-0.27, 1.4, 0, 1) }, { geo: new THREE.CylinderGeometry(0.09, 0.1, 0.42, 7), m: M4(-0.4, 1.6, 0, 1) }, { geo: new THREE.SphereGeometry(0.09, 7, 4, 0, 6.29, 0, 1.6), m: M4(-0.4, 1.81, 0, 1) }]), tc: 0x4f7a34, cc: 0x5f8f40 },
      };
      const treeList = { T: [], P: [], O: [], W: [], M: [], Y: [], U: [], E: [], L: [], Q: [] };
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const c = at(x, y); if (treeList[c] && mine(x, y)) treeList[c].push({ x, y, i: K(x, y) }); }
      if (!seeded) for (let y = -7; y < H + 7; y++) for (let x = -7; x < W + 7; x++) {   /* the wild woods beyond the map edge (belong to the nearest region); seeded land has real woods there */
        if (x >= 0 && y >= 0 && x < W && y < H) continue;
        if (!inR(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)))) continue;
        if (hash2(x * 3 + 11, y * 5 + 7) < 0.5) continue;
        treeList[hash2(x, y * 3) < 0.55 ? 'P' : 'T'].push({ x, y, i: -1 });
      }
      const stumpGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.28, 7).translate(0, 0.14, 0);
      const allTreeTiles = [].concat(treeList.T, treeList.P, treeList.O, treeList.W, treeList.M, treeList.Y, treeList.U).filter(t => t.i >= 0);
      const stumps = new THREE.InstancedMesh(stumpGeo, lam(0x7a5a36), Math.max(1, allTreeTiles.length)); stumps.castShadow = true; stumps.frustumCulled = false;
      const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), treeAt = new Map(), C = new THREE.Color();
      allTreeTiles.forEach((t, k) => { stumps.setMatrixAt(k, ZERO); t.stump = k; });
      group.add(stumps);
      const treeMeshes = [], quads = [[], [], [], []];
      /* a seeded chunk keeps its trees in 4 quadrants (32 m), so the engine can hide the woods beyond the fog (setView) */
      const qOf = t => chunk ? Math.min(1, (t.x - X0) >> 5) + 2 * Math.min(1, (t.y - Y0) >> 5) : 0;
      for (const k in treeKinds) for (let q = 0; q < (chunk ? 4 : 1); q++) {
        const L = treeList[k].filter(t => qOf(t) === q), tk = treeKinds[k]; if (!L.length) continue;
        const trunk = new THREE.InstancedMesh(tk.trunk, lam(tk.tc), L.length), crown = new THREE.InstancedMesh(tk.crown, 'PY'.indexOf(k) >= 0 ? snowyLam(0xffffff, -0.15, 0.3) : lam(0xffffff), L.length);
        const tiles = new Float64Array(L.length);
        L.forEach((t, n) => {
          const jx = (hash2(t.x, t.y) - 0.5) * 0.3, jz = (hash2(t.y, t.x + 3) - 0.5) * 0.3, s = 0.85 + hash2(t.x + 5, t.y + 9) * 0.35 + (t.i < 0 ? 0.25 : 0);
          const px = t.x + 0.5 + jx, pz = t.y + 0.5 + jz, py = heightAt(px, pz) - 0.05;
          const m = M4(px, py, pz, s, s * (0.9 + hash2(t.x, t.y + 1) * 0.3), s, hash2(t.x + 2, t.y) * 6.28);
          trunk.setMatrixAt(n, m); crown.setMatrixAt(n, m);
          C.setHex(tk.cc).offsetHSL((hash2(t.x + 9, t.y) - 0.5) * 0.04, 0, (hash2(t.x, t.y + 9) - 0.5) * 0.12);
          if (chunk && map.snowH < 1e8) { const sn = Math.min(1, Math.max(0, (py - map.snowH + 55) / 27)) * 0.6; if (sn > 0) C.lerp(SNOWC, sn); }   /* snow on the crowns higher up */
          crown.setColorAt(n, C); t.base = [C.r, C.g, C.b];
          tiles[n] = t.i; t.m = m; t.k = k; t.n = n; t.trunk = trunk; t.crown = crown;
          if (t.i >= 0) { treeAt.set(t.i, t); stumps.setMatrixAt(t.stump, ZERO); t.sm = M4(px, py, pz, 1); }
        });
        trunk.castShadow = crown.castShadow = true; trunk.receiveShadow = crown.receiveShadow = true;
        trunk.userData.pick = crown.userData.pick = { kind: 'tree', tiles };
        group.add(trunk, crown); treeMeshes.push(trunk, crown); quads[q].push(trunk, crown);
        /* winter: bare branches over the trunk (deciduous kinds), shown while the leaves are down */
        let branches = null;
        let buds = null;
        if ('TOWME'.indexOf(k) >= 0) {
          branches = new THREE.InstancedMesh(mergeGeos(BRANCH_GEO), snowyLam(0x4a3a2c, 0.2, 0.55), L.length); L.forEach((t, n) => branches.setMatrixAt(n, t.m)); branches.castShadow = true; group.add(branches); quads[q].push(branches);
          buds = new THREE.InstancedMesh(BUD_GEO, lam(0xffffff), L.length * BRANCH_TIPS.length); buds.visible = false; buds.castShadow = true; buds.receiveShadow = true; buds.setColorAt(0, C); group.add(buds); quads[q].push(buds);
          { const bt = new Float64Array(L.length * BRANCH_TIPS.length); for (let i = 0; i < bt.length; i++) bt[i] = tiles[Math.floor(i / BRANCH_TIPS.length)]; buds.userData.pick = { kind: 'tree', tiles: bt }; treeMeshes.push(buds); }   /* tap the leaves to chop, as the crown was */
        }
        L.forEach(t => { t.h = hash2(t.x + 31, t.y + 77); t.branches = branches; });   /* t.h: this tree's day in the leaf fall */
        const reg = { kind: k, crown, branches, buds, list: L, g: group }; TREE_REG.push(reg); L.forEach(t => { t.reg = reg; }); treeSeason(reg);
      }
      /* ---------- rocks */
      const rockAt = new Map(), pickables = [terrainMesh].concat(treeMeshes);
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const c = at(x, y); if ('RNIrCGA'.indexOf(c) < 0 || !mine(x, y)) continue;
        const g = new THREE.Group(), big = c === 'r' ? 1.35 : 1;
        const rk = mesh(new THREE.DodecahedronGeometry(0.42 * big, 0), ({ r: 0x8a8a80, C: 0x585860, A: 0x767f8c })[c] || 0x7a7468); rk.scale.set(1.1, 0.75, 1); rk.rotation.y = hash2(x, y) * 3; rk.position.y = 0.22 * big; g.add(rk);
        const rk2 = mesh(new THREE.DodecahedronGeometry(0.26 * big, 0), 0x8a857a); rk2.position.set(0.25, 0.14, 0.18); g.add(rk2);
        const ore = new THREE.Group();
        if (ORE[c]) for (let k = 0; k < 4; k++) { const o = mesh(new THREE.OctahedronGeometry(0.09, 0), ORE[c], Math.cos(k * 1.7) * 0.28, 0.3 + (k % 2) * 0.12, Math.sin(k * 1.7) * 0.26); ore.add(o); }
        g.add(ore);
        g.position.set(x + 0.5, heightAt(x + 0.5, y + 0.5), y + 0.5);
        if (ORE[c]) { rk.userData.pick = rk2.userData.pick = { kind: 'node', i: K(x, y) }; pickables.push(rk, rk2); }
        rockAt.set(K(x, y), { g, ore }); group.add(g);
      }
      /* ---------- buildings, fences and props */
      const B = Batcher(group), BF = Batcher(group), anim = [], RICEP = [];   /* RICEP: the wild rice plants, grown by the seasons */   /* BF: the small flora, which the seasons take away and give back */
      const roofs = [];
      const floor = HG.floor;
      function building(o) {
        const x0 = o.x, z0 = o.y, x1 = o.x + o.w, z1 = o.y + o.h, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        let base = -9; for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) base = Math.max(base, hAt(x, y), hAt(x + 1, y + 1));
        base += 0.04;
        for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) floor[y * W + x] = base;
        const wall = parseInt((o.wall || '#d8c9a3').slice(1), 16), roof = parseInt((o.roof || '#7a3b2a').slice(1), 16), WH = o.lh || 1.8, TH = 0.16;
        const STONEK = o.k === 'ckeep' && CK && CK.keepStorey;   /* the castle's walk-in keep: stone storeys from src/castle.js instead of the house kit */
        const g = new THREE.Group(); group.add(g);
        /* floor + stone plinth */
        g.add(mesh(new THREE.BoxGeometry(o.w + 0.2, 0.5, o.h + 0.2), 0x7c766c, cx, base - 0.27, cz));
        g.add(mesh(new THREE.BoxGeometry(o.w - 0.05, 0.05, o.h - 0.05), o.k === 'smithy' ? 0x6a655c : 0x9a7046, cx, base - 0.01, cz));
        if (o.k !== 'smithy') for (let k = 1; k < o.h * 2; k++) B.add('box', 0x7a5636, cx, base + 0.016, z0 + k * 0.5, o.w - 0.1, 0.01, 0.025);
        /* door side */
        let side = 's', dpos = 0;
        if (o.door) { const [dx, dy] = o.door; side = dy === o.y + o.h - 1 && o.h > 1 ? 's' : dy === o.y ? 'n' : dx === o.x ? 'w' : 'e'; dpos = (side === 's' || side === 'n') ? dx + 0.5 : dy + 0.5; }
        const sides = { n: [x0, z0, x1, z0], s: [x0, z1, x1, z1], w: [x0, z0, x0, z1], e: [x1, z0, x1, z1] };
        /* the house kit: plaster (or, for the smithy, stone) walls with windows and the door piece on the door tile,
           corner posts, the tiled roof that fits the footprint, brick gables; each house in its own roof/wall colours */
        const KT = STONEK ? { pieces: {}, palette: [], tile: '', plaster: '' } : kitData(), S0 = WH / 3.12, stone = o.k === 'smithy';
        const tint = KT ? { [KT.tile]: o.roof || '#7a3b2a', [KT.plaster]: o.wall || '#d8c9a3' } : null;
        /* the smithy keeps plaster walls with stone corners: the kit's stone walls are painted stone (texture), which flat colour turns into grey slabs */
        const WALL = { plain: 'Wall_Plaster_Straight', win: 'Wall_Plaster_Window_Wide_Round', door: 'Wall_Plaster_Door_Round', corner: stone ? 'Corner_Exterior_Brick' : 'Corner_Exterior_Wood' };
        const kitWalls = (kb, y0, withDoor) => {
          for (const sd in sides) {
            const [ax, az, bx, bz] = sides[sd], horiz = az === bz, L0 = horiz ? ax : az, L1 = horiz ? bx : bz, ry = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[sd];
            const put = (name, l0, l1) => { const len = l1 - l0; if (len < 0.2) return; const px = horiz ? (l0 + l1) / 2 : ax, pz = horiz ? az : (l0 + l1) / 2;
              kb.add(name, px, y0, pz, ry, len / 2, S0, S0, tint);
              if (name === WALL.win) {   /* the frame and dark glass in the opening, and on some windows open shutters */
                kb.add('Window_Wide_Round1', px, y0, pz, ry, len / 2, S0, S0, tint);
                if (hash2(Math.round(px * 7), Math.round(pz * 7 + y0 * 3)) < 0.35) kb.add('WindowShutters_Wide_Round_Open', px, y0, pz, ry, len / 2, S0, S0, tint);
              } };
            const fill = (l0, l1, doorAt) => {   /* doorAt -1: the door is past l1, +1: before l0 (keep the piece beside it plain) */
              if (l1 - l0 < 0.2) return; const n = Math.max(1, Math.round((l1 - l0) / 1.25)), w = (l1 - l0) / n;
              for (let k = 0; k < n; k++) { const byDoor = (doorAt < 0 && k === n - 1) || (doorAt > 0 && k === 0); put(!byDoor && (n === 1 ? l1 - l0 > 1 : k % 2 === 1) ? WALL.win : WALL.plain, l0 + k * w, l0 + (k + 1) * w); }
            };
            if (withDoor && sd === side) { const d0 = Math.max(L0 + 0.15, Math.min(L1 - 1.65, dpos - 0.75)); fill(L0, d0, -1); put(WALL.door, d0, d0 + 1.5); fill(d0 + 1.5, L1, 1); }
            else fill(L0, L1, 0);
          }
          for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) kb.add(WALL.corner, px, y0, pz, 0, S0, S0, S0, tint);
        };
        if (STONEK) CK.keepStorey(g, o, base, WH, 0, { side, at: dpos });
        else if (KT) { const kb = KitBatch(g); kitWalls(kb, base, true); kb.flush(); }
        for (const sd in sides) {
          const [ax, az, bx, bz] = sides[sd], horiz = az === bz, L0 = horiz ? ax : az, L1 = horiz ? bx : bz;
          const segs = sd === side ? [[L0, dpos - 0.45], [dpos + 0.45, L1]] : [[L0, L1]];
          const put = (l0, l1, y0, y1, col) => { const len = l1 - l0, mid = (l0 + l1) / 2; if (len <= 0.01 || KT) return; if (horiz) B.add('box', col, mid, base + (y0 + y1) / 2, az, len + TH, y1 - y0, TH); else B.add('box', col, ax, base + (y0 + y1) / 2, mid, TH, y1 - y0, len + TH); };
          for (const [l0, l1] of segs) { put(l0, l1, 0, 0.35, 0x7c766c); put(l0, l1, 0.35, WH, wall); }
          if (sd === side) {
            put(dpos - 0.45, dpos + 0.45, 1.3, WH, wall);
            const off = horiz ? [dpos - 0.42, base + 0.65, az + (sd === 's' ? -0.4 : 0.4)] : [ax + (sd === 'e' ? -0.4 : 0.4), base + 0.65, dpos - 0.42];
            B.add('box', 0x5a3a1e, off[0] + (horiz ? 0 : 0), off[1], off[2], horiz ? 0.07 : 0.8, 1.25, horiz ? 0.8 : 0.07);   /* the door, swung open inward */
            if (o.sign) {   /* hung beside the door, on the side with more wall */
              const out = sd === 's' ? [0, 1] : sd === 'n' ? [0, -1] : sd === 'e' ? [1, 0] : [-1, 0];
              const at = dpos + 1.3 <= L1 - 0.3 ? dpos + 1.3 : dpos - 1.3;
              hangSign(g, o.sign, horiz ? at : ax, base + WH + 0.15, horiz ? az : at, out);
            }
          }
          /* windows (dark glass + sill) on both faces, away from the door */
          const len = L1 - L0, nW = KT ? 0 : len > 4.5 ? 2 : len > 2.5 ? 1 : 0;
          for (let k = 0; k < nW; k++) {
            const wpos = L0 + len * (nW === 1 ? 0.5 : (k ? 0.75 : 0.25)); if (sd === side && Math.abs(wpos - dpos) < 1.1) continue;
            for (const f of [-1, 1]) { if (horiz) { B.add('box', 0x2a3a4a, wpos, base + 1.15, az + f * (TH / 2 + 0.01), 0.55, 0.5, 0.02); B.add('box', 0x5a3c24, wpos, base + 0.88, az + f * (TH / 2 + 0.03), 0.66, 0.07, 0.06); } else { B.add('box', 0x2a3a4a, ax + f * (TH / 2 + 0.01), base + 1.15, wpos, 0.02, 0.5, 0.55); B.add('box', 0x5a3c24, ax + f * (TH / 2 + 0.03), base + 0.88, wpos, 0.06, 0.07, 0.66); } }
          }
        }
        if (!KT) for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.add('box', 0x5a3c24, px, base + WH / 2, pz, 0.22, WH, 0.22);
        /* the roof (hidden while you are inside, like RuneScape) */
        const rg = new THREE.Group(); g.add(rg);
        const along = o.w >= o.h, Lr = (along ? o.w : o.h) + 0.6, S = (along ? o.h : o.w) + 0.6; let rh = S * 0.42;
        if (KT && !STONEK) {   /* the kit roof whose plan best fits (ridge along the long side), stretched to the footprint, a brick gable at each end */
          const short = along ? o.h : o.w, long = along ? o.w : o.h, RH = { 4: 3.7, 6: 4.87, 8: 6.0 };
          let best = null;
          for (const n in KT.pieces) { const mm = /^Roof_RoundTiles_(\d+)x(\d+)$/.exec(n); if (!mm) continue; const w = +mm[1], d = +mm[2], err = 2 * Math.abs(Math.log(w * S0 / short)) + Math.abs(Math.log(d * S0 / long)); if (!best || err < best.err) best = { n, w, d, err }; }
          const kx = short / (best.w * S0), kz = long / (best.d * S0), ry = along ? Math.PI / 2 : 0, kb = KitBatch(rg);
          kb.add(best.n, cx, base + WH, cz, ry, S0 * kx, S0, S0 * kz, tint);
          for (const end of [1, -1]) { const off = end * best.d / 2 * S0 * kz; kb.add('Roof_Front_Brick' + best.w, cx + (along ? off : 0), base + WH, cz + (along ? 0 : off), ry + (end < 0 ? Math.PI : 0), S0 * kx, S0, S0 * kz, tint); }
          kb.flush(); rh = RH[best.w] * S0;
        }
        const shape = new THREE.Shape(); shape.moveTo(-S / 2, 0); shape.lineTo(S / 2, 0); shape.lineTo(0, rh); shape.lineTo(-S / 2, 0);
        const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: Lr, bevelEnabled: false }); roofGeo.translate(0, 0, -Lr / 2);
        const r = mesh(roofGeo, roof, cx, base + WH, cz); if (along) r.rotation.y = Math.PI / 2; if (!KT) rg.add(r);
        const gable = new THREE.Shape(); gable.moveTo(-S / 2 + 0.3, 0); gable.lineTo(S / 2 - 0.3, 0); gable.lineTo(0, rh - 0.13);
        if (!KT) for (const sgn of [-1, 1]) { const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), lam(wall, { side: THREE.DoubleSide })); gm.castShadow = true; gm.position.set(cx, base + WH, cz); if (along) { gm.rotation.y = Math.PI / 2; gm.position.x += sgn * o.w / 2; } else gm.position.z += sgn * o.h / 2; rg.add(gm); }
        if (!KT) rg.add(mesh(new THREE.BoxGeometry(along ? o.w + 0.2 : o.w + 0.2, 0.1, along ? o.h + 0.2 : o.h + 0.2), 0x5a3c24, cx, base + WH + 0.03, cz));
        /* upper storeys (the operator: "multi story buildings with staircases"; above your floor everything is see-through):
           each storey its own group - a floor slab and four walls with windows, no ceiling (the next storey's slab is
           the ceiling) - and a staircase inside from each floor to the next. The engine shows storeys up to the floor
           you are on and hides the rest and the roof while you are inside. */
        const FL = Math.max(1, Math.min(4, o.floors | 0)), storeys = [];
        if (FL > 1) {
          for (const c of rg.children) c.position.y += WH * (FL - 1);
          const st = o.stairsAt || (() => { const dx = o.door ? o.door[0] : -9; return [Math.abs(dx - (o.x + o.w - 2)) > 1 ? o.x + o.w - 2 : o.x + 1, o.y + 1]; })();
          const alt = [st[0] - 1 > o.x ? st[0] - 1 : st[0] + 1, st[1]], P = f => f % 2 ? alt : st;   /* = world.js flightOf: a switchback */
          const stairs = (into, y0, at) => { for (let k = 0; k < 6; k++) into.add(mesh(new THREE.BoxGeometry(0.9, (k + 1) * WH / 6, 0.16), 0x6a4a2a, at[0] + 0.5, y0 + (k + 1) * WH / 12, at[1] + 0.92 - k * 0.16)); };
          /* an upper floor: the slab round an opening where the flight from below arrives, a railing on three sides (you
             step off at the north end) and a bobbing amber arrow over it - the way down is never hidden (the operator) */
          const slab = (into, yb, hole) => {
            const X0 = o.x, X1 = o.x + o.w, Z0 = o.y, Z1 = o.y + o.h, hx = hole ? hole[0] : 0, hz = hole ? hole[1] : 0;
            const box = (x0, x1, z0, z1) => { if (x1 - x0 > 0.01 && z1 - z0 > 0.01) into.add(mesh(new THREE.BoxGeometry(x1 - x0 + 0.06, 0.12, z1 - z0 + 0.06), 0x9a7046, (x0 + x1) / 2, yb - 0.04, (z0 + z1) / 2)); };
            if (!hole) return box(X0, X1, Z0, Z1);
            box(X0, X1, Z0, hz); box(X0, X1, hz + 1, Z1); box(X0, hx, hz, hz + 1); box(hx + 1, X1, hz, hz + 1);
            const rail = 0x4e3420;
            for (const [x, z] of [[hx, hz], [hx + 1, hz], [hx, hz + 1], [hx + 1, hz + 1]]) into.add(mesh(new THREE.BoxGeometry(0.07, 0.95, 0.07), rail, x, yb + 0.47, z));
            into.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 1), rail, hx, yb + 0.92, hz + 0.5), mesh(new THREE.BoxGeometry(0.06, 0.06, 1), rail, hx + 1, yb + 0.92, hz + 0.5), mesh(new THREE.BoxGeometry(1, 0.06, 0.06), rail, hx + 0.5, yb + 0.92, hz + 1));
            const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), new THREE.MeshBasicMaterial({ color: 0xffc040 })); arrow.rotation.x = Math.PI; arrow.position.set(hx + 0.5, yb + 1.55, hz + 0.5); into.add(arrow);
            anim.push({ bob: arrow, y0: yb + 1.55 });
          };
          if (o.enter) stairs(g, base, P(0));
          for (let f = 1; f < FL; f++) {
            const sg = new THREE.Group(); g.add(sg); storeys.push(sg);
            const yb = base + WH * f;
            slab(sg, yb, o.enter ? P(f - 1) : null);
            if (STONEK) CK.keepStorey(sg, o, yb, WH, f, null);
            else if (KT) { const kb = KitBatch(sg); kitWalls(kb, yb, false); kb.flush(); }
            else for (const [L, horiz, fx, fz] of [[o.w, true, 0, o.h / 2], [o.w, true, 0, -o.h / 2], [o.h, false, o.w / 2, 0], [o.h, false, -o.w / 2, 0]]) {
              sg.add(mesh(new THREE.BoxGeometry(horiz ? L + TH : TH, WH, horiz ? TH : L + TH), wall, cx + fx, yb + WH / 2, cz + fz));
              const nW = Math.max(1, Math.floor(L / 1.6));
              for (let k = 0; k < nW; k++) { const t = (k + 0.5) / nW - 0.5; for (const side of [-1, 1]) sg.add(mesh(new THREE.BoxGeometry(horiz ? 0.55 : 0.03, 0.6, horiz ? 0.03 : 0.55), 0x2a3a4a, cx + fx + (horiz ? t * L : side * 0.1), yb + WH * 0.55, cz + fz + (horiz ? side * 0.1 : t * L))); }
            }
            if (o.enter && f < FL - 1) stairs(sg, yb, P(f));
          }
        }
        if (STONEK) { o._y0 = base; CK.keepTop(rg, o, base + WH * FL); }   /* the keep's battlements, banners and donjon are its roof: hidden while you are inside */
        else if (o.k === 'church') {   /* the church's steeple (2026-10-07): a square bell tower over the door end, a slate spire and a gilt cross */
          const tx = side === 'e' ? x1 - 0.9 : side === 'w' ? x0 + 0.9 : cx, tz = side === 'n' ? z0 + 0.9 : side === 's' ? z1 - 0.9 : cz, tb = base + WH * FL, th = rh + 1.5;
          rg.add(mesh(new THREE.BoxGeometry(1.4, th, 1.4), wall, tx, tb + th / 2 - 0.1, tz));
          rg.add(mesh(new THREE.BoxGeometry(1.56, 0.12, 1.56), 0x7c766c, tx, tb + th - 0.1, tz));
          for (const [fx, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) rg.add(mesh(new THREE.BoxGeometry(fx ? 0.04 : 0.42, 0.62, fz ? 0.04 : 0.42), 0x1c1a18, tx + fx * 0.71, tb + th - 0.6, tz + fz * 0.71));
          const bell = mesh(new THREE.ConeGeometry(0.24, 0.34, 8, 1, true), 0xc89a3a, tx, tb + th - 0.62, tz); rg.add(bell);
          const sp = mesh(new THREE.ConeGeometry(1.08, 3.0, 4), roof, tx, tb + th + 1.4, tz); sp.rotation.y = Math.PI / 4; rg.add(sp);
          rg.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), 0xe8c050, tx, tb + th + 3.2, tz), mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), 0xe8c050, tx, tb + th + 3.3, tz));
        }
        else if (o.k !== 'house' || hash2(o.x, o.y) < 0.6) {
          const chx = cx + (along ? o.w * 0.28 : S * 0.18), chz = cz + (along ? -S * 0.14 : o.h * 0.28);
          rg.add(mesh(new THREE.BoxGeometry(0.38, 1.4, 0.38), 0x6a625a, chx, base + WH * FL + rh * 0.55 + 0.25, chz));
          if (o.k === 'smithy') anim.push({ smoke: true, x: chx, y: base + WH + rh * 0.55 + 1.0, z: chz, parts: [] });
        }
        roofs.push({ g: rg, x0: o.x, y0: o.y, x1: o.x + o.w - 1, y1: o.y + o.h - 1, storeys });
      }
      /* the castle kit lives in its own module (src/castle.js) so a castle change is a small inscription */
      let CK = null; try { const CM = G.ASH3D && G.ASH3D.get && G.ASH3D.get('castle'); if (CM && CM.create) CK = CM.create({ THREE, B, Batcher, KitBatch, kitData, heightAt, group, pickables }); } catch (e) { console.warn('castle module', e && e.message); }
      const surfOfMap = (tx, ty) => { const Hh = heightsOf(map); return Hh.surf ? Hh.surf(tx, ty) : heightAt(tx + 0.5, ty + 0.5); };
      const mounts = [];   /* items hung on walls: {obj, item, quest, untilStep} */
      const torches = [], street = [];
      const floorY = (o, y) => { const f = floor[o.y * W + o.x]; return isNaN(f) ? y : f; };
      const siteObjs = chunk ? [].concat(...map.sitesIn(X0, Y0, X1 - 1, Y1 - 1).map(st => st.objects), ...(map.roadTorchesIn ? map.roadTorchesIn(X0, Y0, X1 - 1, Y1 - 1) : [])) : [];   /* tents, campfires, and lit posts along the town roads */
      const objs = (chunk ? siteObjs : map.objects.filter(o => inR(o.x, o.y))).sort((a, b) => (b.enter ? 1 : 0) - (a.enter ? 1 : 0));
      for (const o of objs) {
        const x = o.x + (o.w || 1) / 2, z = o.y + (o.h || 1) / 2; let y = heightAt(x, z);
        switch (o.k) {
          case 'house': case 'shop': case 'smithy': case 'church': building(o); break;
          case 'truins': {   /* a tall ruined keep: broken towers, no roof, a pole in the yard */
            const ST = 0x8c8880, DK = 0x5a564e, x0 = o.x, z0 = o.y, w = o.w || 16, h = o.h || 16, yb = y;
            B.add('box', 0xa39e92, x0 + w / 2, yb + 0.05, z0 + h / 2, (w - 6) * 0.98, 0.1, (h - 6) * 0.98);
            const towers = [[3.2, 3.2, 9.4], [w - 3.2, 3.2, 7.2], [3.2, h - 3.2, 6.4], [w - 3.2, h - 3.2, 8.6]];
            for (const [tx, tz, th] of towers) {
              B.add('box', ST, x0 + tx, yb + th / 2, z0 + tz, 2.15, th, 2.15);
              B.add('box', DK, x0 + tx + 0.55, yb + th + 0.28, z0 + tz - 0.2, 1.15, 0.55, 0.9);
              B.add('box', 0x6e6a62, x0 + tx, yb + th * 0.62, z0 + tz + 1.05, 0.55, 0.7, 0.12);
            }
            const gap = o.door || [x0 + Math.floor(w / 2), z0 + h - 4];
            const wall = (x, z, ww, dd, hh) => { if (Math.abs(x - gap[0]) < 1.2 && Math.abs(z - gap[1]) < 1.2) return; B.add('box', ST, x, yb + hh / 2, z, ww, hh, dd); };
            for (let i = 4; i < w - 4; i += 2) { wall(x0 + i + 0.5, z0 + 3.15, 1.7, 0.55, 2.2 + (i % 4)); wall(x0 + i + 0.5, z0 + h - 3.15, 1.7, 0.55, 1.6 + ((i + 2) % 5)); }
            for (let i = 4; i < h - 4; i += 2) { wall(x0 + 3.15, z0 + i + 0.5, 0.55, 1.7, 2.4 + (i % 3)); wall(x0 + w - 3.15, z0 + i + 0.5, 0.55, 1.7, 1.8 + ((i + 1) % 4)); }
            B.add('box', DK, x0 + 6.2, yb + 0.22, z0 + 6.4, 1.3, 0.36, 0.8);
            B.add('box', 0x4e4a44, x0 + w - 6, yb + 0.28, z0 + h - 6.2, 0.9, 0.45, 0.7);
            const px = (o.pole ? o.pole[0] : x0 + w / 2) + 0.5, pz = (o.pole ? o.pole[1] : z0 + h / 2) + 0.5, py = heightAt(px, pz);
            B.add('cyl', 0x2c2e32, px, py + 1.85, pz, 0.11, 3.7, 0.11);
            B.add('cyl', 0xc8ccd0, px, py + 3.55, pz, 0.28, 0.06, 0.28);
            break;
          }
          case 'ruin': {
            const STN = 0x8d8880, RUB = 0x6a655e, w = o.w || 7, h = o.h || 6, x0 = o.x, z0 = o.y;
            B.add('box', 0xb0aa9e, x0 + w / 2, y + 0.05, z0 + h / 2, w - 0.15, 0.1, h - 0.15);
            B.add('box', STN, x0 + 0.16, y + 1.15, z0 + h / 2, 0.32, 2.3, h - 0.2);
            B.add('box', STN, x0 + w - 0.16, y + 0.72, z0 + h * 0.42, 0.32, 1.44, h * 0.55);
            B.add('box', RUB, x0 + w - 0.2, y + 0.28, z0 + h * 0.78, 0.5, 0.4, h * 0.28);
            B.add('box', STN, x0 + w / 2, y + 0.85, z0 + 0.16, w - 0.3, 1.7, 0.32);
            const dx = (o.door && o.door[0]) || (x0 + 3);
            B.add('box', STN, x0 + (dx - x0) * 0.45, y + 1.35, z0 + h - 0.16, Math.max(0.6, dx - x0 - 0.2), 2.5, 0.34);
            B.add('box', STN, dx + 1.15 + Math.max(0, x0 + w - dx - 2) * 0.35, y + 0.7, z0 + h - 0.16, Math.max(0.6, x0 + w - dx - 1.3), 1.35, 0.34);
            B.add('box', RUB, x0 + 1.4, y + 0.18, z0 + 1.5, 0.8, 0.28, 0.55);
            B.add('box', 0x5a564e, x0 + 2.4, y + 0.32, z0 + 1.1, 0.45, 0.48, 0.36);
            B.add('box', RUB, x0 + w - 1.8, y + 0.16, z0 + 2.2, 0.7, 0.26, 0.5);
            if (o.sign) { const sg = new THREE.Group(); group.add(sg); hangSign(sg, o.sign, x0 + w / 2, y + 2.55, z0 + h - 0.2, [0, 1]); }
            break;
          }
          case 'rope': {
            const x1 = o.x + 0.5, z1 = o.y + 0.5, x2 = (o.x2 == null ? o.x : o.x2) + 0.5, z2 = (o.y2 == null ? o.y : o.y2) + 0.5, N = 16;
            for (let i = 0; i <= N; i++) {
              const t = i / N, px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t, sag = Math.sin(Math.PI * t) * 0.55;
              B.add('box', 0xd2c4a2, px, heightAt(px, pz) + 2.05 - sag, pz, 0.05, 0.035, 0.34);
            }
            const gy = heightAt(x2, z2);
            B.add('cyl', 0x5a3a22, x2, gy + 1.35, z2, 0.16, 2.7, 0.16);
            group.add(mesh(new THREE.ConeGeometry(0.95, 2.3, 7), 0x2c6a34, x2, gy + 3.15, z2));
            break;
          }
          case 'cwall': if (CK) CK.wall(o); break;
          case 'ctower': if (CK) CK.tower(o); break;
          case 'cgate': if (CK) CK.gate(o); break;
          case 'ckeep': if (o.enter && CK && CK.keepStorey) building(o); else if (CK) CK.keep(o); break;
          case 'csteps': if (CK) CK.steps(o); break;
          case 'cstair': if (CK && CK.stair) CK.stair(o); break;
          case 'pier': case 'bridge': {   /* the asset's posts: every 2 m along both long edges, down into the water (the deck is its B tiles) */
            const w = o.w || 1, d = o.h || 1, along = w >= d;
            for (let t = 0; t <= (along ? w : d); t += 2) for (const side of [0, 1]) { const px = along ? o.x + Math.min(t, w - 0.15) + 0.08 : o.x + side * (w - 0.16) + 0.08, pz = along ? o.y + side * (d - 0.16) + 0.08 : o.y + Math.min(t, d - 0.15) + 0.08, py = heightAt(px, pz);
              B.add('box', 0x5a3c22, px, py - 0.88, pz, 0.16, 1.6, 0.16); }
            break;
          }
          case 'well': {
            const g = new THREE.Group(); g.position.set(x, y, z); group.add(g);
            g.add(mesh(new THREE.CylinderGeometry(0.8, 0.88, 0.65, 10), 0x8a8578, 0, 0.32, 0));
            g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 10), 0x1e3a5a, 0, 0.6, 0));
            for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), 0x5a3c24, s * 0.72, 0.9, 0));
            g.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), 0x5a3c24, 0, 1.45, 0));
            const rf = mesh(new THREE.ConeGeometry(1.25, 0.6, 4), 0x7a3b2a, 0, 1.85, 0); rf.rotation.y = Math.PI / 4; rf.scale.set(1, 1, 0.7); g.add(rf);
            g.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.18, 7), 0x7a5a36, 0.15, 1.1, 0));
            break;
          }
          case 'torch': {
            B.add('box', 0x4a3220, x, y + 0.6, z, 0.1, 1.2, 0.1);
            B.add('box', 0x2a2a2a, x, y + 1.22, z, 0.2, 0.08, 0.2);
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 5), new THREE.MeshBasicMaterial({ color: 0xffa030 })); f.position.set(x, y + 1.42, z); group.add(f);
            const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 5), new THREE.MeshBasicMaterial({ color: 0xfff0a0 })); f2.position.set(x, y + 1.36, z); group.add(f2);
            torches.push({ f, f2, ph: hash2(o.x, o.y) * 10, x, y, z, night: !!o.night, tend: (o.zone === 'village' || o.zone === 'saltmere'), tx: o.x, ty: o.y });
            break;
          }
          case 'lamp': {   /* a gas street lamp on the verge of a trail (2026-10-07): iron post, glass lantern, pyramid cap */
            const IR = 0x23272b;
            B.add('box', IR, x, y + 0.14, z, 0.3, 0.28, 0.3);
            B.add('cyl', IR, x, y + 1.3, z, 0.11, 2.1, 0.11);
            B.add('cyl', IR, x, y + 2.38, z, 0.22, 0.08, 0.22);
            const glMat = LAMPG.clone(), gl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), glMat); gl.position.set(x, y + 2.62, z); group.add(gl);
            street.push({ mat: glMat, x: o.x, y: o.y });
            for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add('box', IR, x + dx * 0.16, y + 2.62, z + dz * 0.16, 0.035, 0.44, 0.035);
            B.add('box', IR, x, y + 2.41, z, 0.36, 0.04, 0.36);
            const cap = mesh(new THREE.ConeGeometry(0.29, 0.24, 4), IR, x, y + 2.96, z); cap.rotation.y = Math.PI / 4; group.add(cap);
            B.add('box', IR, x, y + 3.12, z, 0.05, 0.1, 0.05);
            break;
          }
          case 'sconce': {   /* the cave's small wall torch (2026-10-07): an iron bracket in the rock, the torch leaning out of the wall at an angle */
            const F = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[o.face || 'n'], ax = -F[0], az = -F[1], wx = x + F[0] * 0.48, wz = z + F[1] * 0.48, wy = y + 1.35;
            const ry = Math.atan2(ax, az), TL = 0.55, ux = ax * Math.sin(TL), uy = Math.cos(TL), uz = az * Math.sin(TL);   /* the torch's axis: up, tipped away from the wall */
            const px = wx + ax * 0.16, py = wy - 0.08, pz = wz + az * 0.16, at = d => [px + ux * d, py + uy * d, pz + uz * d];
            B.add('box', 0x2a2622, wx, wy, wz, 0.16, 0.2, 0.05, ry);
            B.add('box', 0x2a2622, wx + ax * 0.09, wy - 0.06, wz + az * 0.09, 0.05, 0.05, 0.18, ry);
            { const [a, b, c] = at(0.12); B.add('cyl6', 0x5a3a20, a, b, c, 0.055, 0.42, 0.055, ry, TL); }
            { const [a, b, c] = at(0.34); B.add('cyl', 0x2a1f16, a, b, c, 0.09, 0.08, 0.09, ry, TL); }
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), new THREE.MeshBasicMaterial({ color: 0xffa030 })), f2 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 5), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
            for (const [m, d] of [[f, 0.48], [f2, 0.44]]) { m.position.set(...at(d)); m.rotation.set(TL, ry, 0, 'YXZ'); group.add(m); }
            torches.push({ f, f2, ph: hash2(o.x, o.y) * 10, x: wx, y, z: wz, night: !!o.night, tend: (o.zone === 'village' || o.zone === 'saltmere'), tx: o.x, ty: o.y });
            break;
          }
          case 'iwall': {   /* a room divider inside a walk-in building (2026-10-07: Saltmere town hall) */
            const face = o.face || 'w', WH = 1.8, TH = 0.14, col = 0xcfc4aa, x0 = o.x, z0 = o.y, w = o.w || 1, h = o.h || 1;
            const fl = floorY(o, heightAt(x0 + 0.5, z0 + 0.5)), door = o.door, skip = (x, y) => door && x === door[0] && y === door[1];
            if (face === 'w' || face === 'e') {
              const px = face === 'w' ? x0 : x0 + w;
              for (let zz = z0; zz < z0 + h; zz++) {
                if (skip(face === 'w' ? x0 : x0 + w - 1, zz)) { B.add('box', col, px, fl + 1.55, zz + 0.5, TH, 0.5, 1.02); continue; }
                B.add('box', col, px, fl + WH / 2, zz + 0.5, TH, WH, 1.02);
              }
            } else {
              const pz = face === 'n' ? z0 : z0 + h;
              for (let xx = x0; xx < x0 + w; xx++) {
                if (skip(xx, face === 'n' ? z0 : z0 + h - 1)) { B.add('box', col, xx + 0.5, fl + 1.55, pz, 1.02, 0.5, TH); continue; }
                B.add('box', col, xx + 0.5, fl + WH / 2, pz, 1.02, WH, TH);
              }
            }
            break;
          }
          /* ZIIBIING, the Ojibwe village on the river (2026-10-07) */
          case 'wigwam': {   /* waaginogaan (2026-10-07): the bark-over-ironwood shell, its door east, a hide over it, the smoke hole */
            const D = Array.isArray(o.dir) ? o.dir : { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[o.face || 'e'], ry = Math.atan2(D[0], D[1]), R0 = 1.45, HT = 2.15;   /* dir: the true east the generator worked out (toward the sunrise) */
            const g = wigwamShell(R0, HT, false, o.seed | 0); g.position.set(x, y, z); g.rotation.y = ry; group.add(g);
            g.add(mesh(new THREE.BoxGeometry(0.72, 1.1, 0.3), 0x1a140e, 0, 0.55, R0 - 0.2));          /* the dark of the doorway */
            const flap = mesh(new THREE.BoxGeometry(0.5, 1.05, 0.04), 0x8a6238, -0.48, 0.58, R0 + 0.03); flap.rotation.y = -0.35; g.add(flap);   /* the hide, tied back */
            g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 8), 0x1a140e, 0, HT * 1.06 - 0.01, 0));   /* the smoke hole */
            anim.push({ smoke: true, x, y: y + HT + 0.15, z, parts: [] });
            break;
          }
          case 'wigwamdoor': case 'wigwamout': {   /* the way in (the wigwam's own doorway, on its east side) and the way out (inside) */
            const pk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 1.1), new THREE.MeshBasicMaterial({ visible: false })); pk.position.set(x, y + 0.8, z); pk.userData.pick = { kind: 'passage', x: o.x, y: o.y }; group.add(pk); pickables.push(pk);
            if (o.k === 'wigwamout') {   /* daylight through the door, and the hide tied back beside it */
              const day = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.15), new THREE.MeshBasicMaterial({ color: 0xfff1cc, side: THREE.DoubleSide })); day.position.set(x + 0.4, y + 0.58, z); day.rotation.y = Math.PI / 2; group.add(day);
              const fl = mesh(new THREE.BoxGeometry(0.04, 1.1, 0.5), 0x8a6238, x + 0.38, y + 0.56, z - 0.6); fl.rotation.y = 0.4; group.add(fl);
            }
            break;
          }
          case 'wigwamroom': {   /* inside the lodge: the same ironwood cage and bark from within, mats and blankets round the fire */
            const R0 = o.r || 4.4, HT = 3.0, g = wigwamShell(R0, HT, true, (o.x * 13 + o.y) | 0); g.position.set(x, y, z); g.rotation.y = Math.PI / 2; group.add(g);   /* its doorway east */
            const hole = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), new THREE.MeshBasicMaterial({ color: 0x9fb4d8, side: THREE.DoubleSide })); hole.rotation.x = Math.PI / 2; hole.position.y = HT * 1.05; g.add(hole);
            const mats = [[-2.2, -1.2, 0.3, 0x8a3a2a], [-2.0, 1.4, -0.4, 0x2f4a6a], [0.4, 2.5, 1.5, 0x3f6a34], [0.6, -2.5, 1.6, 0x7a5a2a]];
            for (const [mx, mz, ry, col] of mats) {   /* a rush mat, and a folded blanket on it */
              const m1 = mesh(new THREE.BoxGeometry(1.8, 0.04, 1.0), 0xb8a070, mx, 0.03, mz); m1.rotation.y = ry; g.add(m1);
              const m2 = mesh(new THREE.BoxGeometry(0.7, 0.12, 0.8), col, mx + Math.cos(ry) * 0.45, 0.1, mz - Math.sin(ry) * 0.45); m2.rotation.y = ry; g.add(m2);
            }
            break;
          }
          case 'canoe': case 'canoe_up': {   /* the landing's canoe, afloat in the shallows; a second turned over on the bank to dry */
            const c = canoeMesh(); group.add(c);
            if (o.k === 'canoe') {
              DOCKS.push(c); c.userData.dock = [o.x, o.y];   /* you paddle off in this one: the engine hides it while you are out on the water, or while the landing has none to give */
              const sf = surfOfMap(o.x, o.y); c.position.set(x, sf - 0.02, z); c.rotation.y = 1.45 + hash2(o.x, o.y) * 0.2;
              const pk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 4.4), new THREE.MeshBasicMaterial({ visible: false })); pk.position.copy(c.position); pk.rotation.y = c.rotation.y; pk.userData.pick = { kind: 'canoe', x: o.x, y: o.y }; group.add(pk); pickables.push(pk);
            } else {
              c.position.set(x, y + 0.62, z); c.rotation.set(0, 0.4, Math.PI);
              for (const e of [-1, 1]) B.add('cyl', 0x6a4a2a, x + Math.sin(0.4) * e * 1.1, y + 0.2, z + Math.cos(0.4) * e * 1.1, 0.22, 0.4, 0.22, 0, Math.PI / 2, 0);
            }
            break;
          }
          case 'kettle': {   /* the iskigamiziganaak (2026-10-08, the sugar camp): two forked posts and a pole, two akik (kettles) of sap hung over the fire */
            for (const e of [-1.1, 1.1]) { B.add('box', 0x5a4430, x + e, y + 0.75, z, 0.08, 1.5, 0.08); B.add('box', 0x5a4430, x + e - 0.08, y + 1.45, z, 0.05, 0.3, 0.05, 0, 0, 0.5); B.add('box', 0x5a4430, x + e + 0.08, y + 1.45, z, 0.05, 0.3, 0.05, 0, 0, -0.5); }
            B.add('cyl6', 0x6a4a2a, x, y + 1.42, z, 0.07, 2.5, 0.07, 0, 0, Math.PI / 2);
            for (const e of [-0.45, 0.45]) { B.add('box', 0x2a2a2a, x + e, y + 1.1, z, 0.012, 0.62, 0.012); B.add('cyl12', 0x2b2b2e, x + e, y + 0.6, z, 0.5, 0.42, 0.5); B.add('cyl12', 0xb5651d, x + e, y + 0.8, z, 0.44, 0.02, 0.44); }
            break;
          }
          case 'barklodge': {   /* iskigamizigewigamig, the sap-boiling lodge: a low birch bark lodge, rolls of bark on a pole frame, a dark door */
            B.add('stone', 0xe2dccb, x, y + 0.2, z, 3.0, 2.4, 2.6); B.add('cyl12', 0x6a5236, x, y + 0.02, z, 3.05, 0.04, 2.65);
            for (let k = 0; k < 4; k++) B.add('box', 0x3a3a3a, x - 1.05 + k * 0.7, y + 0.9 + (k % 2) * 0.25, z + 1.1 - Math.abs(k - 1.5) * 0.2, 0.2, 0.02, 0.02);
            B.add('box', 0x1a140e, x, y + 0.55, z + 1.25, 0.7, 1.1, 0.06);
            break;
          }
          case 'fishrack': {   /* two crossed-pole ends and a rail, fish split and hung to dry over a smudge */
            for (const e of [-0.9, 0.9]) { B.add('box', 0x5a4430, x + e, y + 0.7, z - 0.18, 0.06, 1.5, 0.06, 0, 0.25, 0); B.add('box', 0x5a4430, x + e, y + 0.7, z + 0.18, 0.06, 1.5, 0.06, 0, -0.25, 0); }
            B.add('box', 0x5a4430, x, y + 1.3, z, 2.0, 0.05, 0.05);
            for (let k = 0; k < 7; k++) { const fx = x - 0.75 + k * 0.25; B.add('box', k % 2 ? 0xb8a890 : 0xc9b48a, fx, y + 1.08, z, 0.12, 0.42, 0.03); B.add('box', 0x8a3a2a, fx, y + 1.1, z + 0.016, 0.07, 0.32, 0.005); }
            break;
          }
          case 'rice': case 'reeds': {   /* manoomin (2026-10-07): thin grass out of the water, a slim drooping head like a wheat ear but dark burgundy; cattails at the edge */
            const r0 = hash2(o.x * 3, o.y * 5), n = 6, sf = surfOfMap(o.x, o.y);
            for (let k = 0; k < n; k++) {
              const a = k * 2.4 + r0 * 6, rr = 0.12 + 0.36 * hash2(o.x + k, o.y - k), sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr, hh = (o.k === 'rice' ? 0.75 : 1.3) + 0.35 * hash2(o.x - k, o.y + k);
              const lean = (hash2(o.x * k, o.y) - 0.5) * 0.3, base = o.k === 'rice' ? sf - 0.05 : Math.min(sf, y + 0.1);
              if (o.k === 'rice') {   /* its own instances, so the year can grow it (riceSeason) */
                RICEP.push({ x: sx, z: sz, base, hh, a, lean, dark: !(k % 3), h: hash2(o.x * 7 + k, o.y * 3 - k) });
                continue;
              }
              BF.add('box', 0x5f7a34, sx, base + hh / 2, sz, 0.018, hh, 0.018, a, lean, 0);   /* cattails die back in winter and grow again in spring, like the small flora (2026-10-08) */
              if (k % 2 === 0) BF.add('cyl6', 0x5a3a20, sx, base + hh - 0.1, sz, 0.06, 0.22, 0.06, a, lean, 0);
            }
            break;
          }
          case 'woodpile': for (let k = 0; k < 9; k++) { const row = k < 4 ? 0 : k < 7 ? 1 : 2, i = row === 0 ? k : row === 1 ? k - 4 : k - 7; B.add('cyl', k % 3 ? 0x7a5a3a : 0x8a6a46, x - 0.36 + i * 0.24 + row * 0.12, y + 0.1 + row * 0.19, z, 0.2, 0.9, 0.2, 0, Math.PI / 2, 0); } break;
          case 'basket': B.add('cyl', 0xd8c49a, x, y + 0.18, z, 0.4, 0.36, 0.4); B.add('cyl', 0x5a3a24, x, y + 0.35, z, 0.42, 0.04, 0.42); B.add('cyl', 0x3a2a1e, x, y + 0.2, z, 0.41, 0.03, 0.41); break;
          case 'ricebasket': B.add('cyl12', 0xd8c49a, x, y + 0.06, z, 1.0, 0.1, 0.8); B.add('cyl12', 0x6a5236, x, y + 0.115, z, 0.86, 0.02, 0.66); B.add('cyl12', 0x5a3a24, x, y + 0.11, z, 1.02, 0.03, 0.82); break;
          /* the Spider Cave (2026-10-07): the mouth up top, the ways out below, webs and glowing mushrooms inside */
          case 'cavemouth': case 'caveout': {   /* a rock outcrop with a cave opening in its south face (2026-10-07); caveout: the way out up top, not a way in */
            const RK = [[0, -0.6, 3.2, 2.6, 2.6, 0x6b675f], [-1.4, -0.2, 2.0, 2.0, 2.2, 0x75716a], [1.45, -0.1, 2.1, 1.8, 2.0, 0x625e57], [-0.6, -1.5, 2.4, 2.2, 2.2, 0x5d5a54],
                        [0.9, -1.4, 2.0, 2.4, 1.8, 0x6f6b64], [-2.1, 0.6, 1.3, 1.0, 1.3, 0x7a766e], [2.1, 0.7, 1.2, 0.9, 1.1, 0x6a665f], [0, -0.3, 1.6, 1.0, 1.4, 0x67635c]];
            for (const [dx, dz, sx, sy, sz, c] of RK) B.add('rock', c, x + dx, y + sy * 0.38, z + dz, sx, sy, sz, hash2(o.x + dx * 7, o.y + dz * 3) * 6);
            const dark = new THREE.MeshBasicMaterial({ color: 0x040302, side: THREE.DoubleSide });
            const hole = new THREE.Mesh(new THREE.CircleGeometry(0.75, 14, 0, Math.PI), dark); hole.scale.set(1, 1.25, 1); hole.position.set(x, y + 0.02, z + 0.62); group.add(hole);
            const deep = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.9), dark); deep.position.set(x, y + 0.5, z + 0.2); group.add(deep);
            B.add('rock', 0x5f5b55, x - 0.85, y + 0.55, z + 0.55, 0.7, 1.3, 0.8, 1.1); B.add('rock', 0x6a665f, x + 0.85, y + 0.5, z + 0.55, 0.7, 1.2, 0.8, 2.3); B.add('rock', 0x625e57, x, y + 1.35, z + 0.5, 1.7, 0.7, 0.9, 0.4);
            { const pk = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), new THREE.MeshBasicMaterial({ visible: false })); pk.position.set(x, y + 1.2, z - 0.4); pk.userData.pick = o.k === 'cavemouth' ? { kind: 'passage', x: o.x, y: o.y } : { kind: 'caveout', x: o.x, y: o.y }; group.add(pk); pickables.push(pk); }
            break;
          }
          case 'caveexit': {   /* underground: an opening in the rock with daylight beyond it - no ladder (2026-10-07) */
            B.add('rock', 0x4e4b46, x - 0.75, y + 0.9, z - 0.2, 0.7, 1.9, 0.9, 0.7); B.add('rock', 0x55524c, x + 0.75, y + 0.85, z - 0.2, 0.7, 1.8, 0.9, 2.1);
            B.add('rock', 0x4a4742, x, y + 1.85, z - 0.25, 2.2, 0.8, 1.0, 0.3);
            const day = new THREE.Mesh(new THREE.CircleGeometry(0.62, 14, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xfff1cc, side: THREE.DoubleSide }));
            day.scale.set(1, 1.6, 1); day.position.set(x, y + 0.05, z - 0.3); group.add(day);
            const glow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
            glow.rotation.x = Math.PI / 2; glow.position.set(x, y + 0.8, z + 0.9); group.add(glow);
            const pk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.2), new THREE.MeshBasicMaterial({ visible: false })); pk.position.set(x, y + 1.1, z); pk.userData.pick = { kind: 'passage', x: o.x, y: o.y }; group.add(pk); pickables.push(pk);
            break;
          }
          case 'web': {   /* spokes and rings of silk, hung upright */
            const P = [], R0 = 0.8, n = 8;
            for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; P.push(0, 0, 0, Math.cos(a) * R0, Math.sin(a) * R0, 0); }
            for (let r = 1; r <= 4; r++) { const rr = R0 * r / 4.4; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, b = (k + 1) / n * Math.PI * 2, sag = 0.9 + 0.1 * Math.sin(k * 3 + r); P.push(Math.cos(a) * rr * sag, Math.sin(a) * rr * sag, 0, Math.cos(b) * rr, Math.sin(b) * rr, 0); } }
            const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
            const w = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xe8eef0, transparent: true, opacity: 0.55 }));
            w.position.set(x, y + 1.05, z); w.rotation.y = hash2(o.x, o.y) * 6.28; group.add(w);
            break;
          }
          case 'shroom': {
            const r = hash2(o.x, o.y), gm = new THREE.MeshBasicMaterial({ color: r < 0.5 ? 0x63e6d0 : 0x9ad84a });
            for (let k = 0; k < 3; k++) { const a = k * 2.1 + r * 6, dx = Math.cos(a) * 0.22, dz = Math.sin(a) * 0.22, hh = 0.12 + 0.08 * k;
              B.add('box', 0xd8d0b8, x + dx, y + hh / 2, z + dz, 0.04, hh, 0.04); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07 + 0.02 * k, 7, 4, 0, 6.29, 0, 1.6), gm); cap.position.set(x + dx, y + hh, z + dz); group.add(cap); }
            break;
          }
          case 'anvil': B.add('box', 0x3a3a3e, x, y + 0.25, z, 0.3, 0.5, 0.3); B.add('box', 0x45454a, x, y + 0.55, z, 0.7, 0.16, 0.32); B.add('cone', 0x45454a, x + 0.42, y + 0.55, z, 0.14, 0.3, 0.14, 0, 0, Math.PI / 2); B.add('box', 0x5a3c24, x, y + 0.06, z, 0.6, 0.12, 0.5); break;
          case 'rack': y = floorY(o, y); B.add('box', 0x5a3c24, x - 0.4, y + 0.6, z, 0.08, 1.2, 0.08); B.add('box', 0x5a3c24, x + 0.4, y + 0.6, z, 0.08, 1.2, 0.08); B.add('box', 0x5a3c24, x, y + 1.1, z, 0.9, 0.08, 0.08);
            for (let k = 0; k < 3; k++) { B.add('box', [0xb8763b, 0x77777a, 0xc4c8cf][k], x - 0.25 + k * 0.25, y + 0.62, z + 0.05, 0.05, 0.85, 0.02); B.add('box', 0x3a2410, x - 0.25 + k * 0.25, y + 0.22, z + 0.05, 0.16, 0.04, 0.06); }
            break;
          case 'range': {
            B.add('box', 0x6e6a62, x, y + 0.4, z, 0.95, 0.8, 0.8); B.add('box', 0x2a2522, x, y + 0.35, z + 0.36, 0.5, 0.35, 0.1); B.add('box', 0x55504a, x, y + 0.82, z, 1.0, 0.06, 0.85);
            B.add('box', 0x6e6a62, x + 0.3, y + 1.2, z - 0.2, 0.22, 0.8, 0.22);
            const glow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xff7a20 })); glow.position.set(x, y + 0.3, z + 0.42); group.add(glow); torches.push({ f: glow, ph: 3, glow: true });
            const p = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), new THREE.MeshBasicMaterial({ visible: false })); p.position.set(x, y + 0.6, z); p.userData.pick = { kind: 'node', i: K(o.x, o.y) }; group.add(p); pickables.push(p);
            anim.push({ smoke: true, x: x + 0.3, y: y + 1.7, z: z - 0.2, parts: [] });
            break;
          }
          case 'altar': {   /* the church altar: pray at it to restore your Prayer points (world.js makes it a node).
               face = the front the congregation looks at. Default "n" (Saltmere). "w"/"e" for an altar on an east or west wall. */
            const fl = floorY(o, y), face = o.face || 'n', ew = face === 'e' || face === 'w';
            if (ew) {
              const fx = face === 'w' ? -1 : 1;
              B.add('box', 0x8a857a, x, fl + 0.45, z, 0.6, 0.9, 1.0); B.add('box', 0xa8a294, x, fl + 0.93, z, 0.7, 0.07, 1.12);
              B.add('box', 0xf2eee0, x, fl + 0.97, z, 0.62, 0.02, 1.0); B.add('box', 0x6a3a8a, x + fx * 0.31, fl + 0.7, z, 0.01, 0.5, 0.34);
              B.add('box', 0xe8c050, x + fx * -0.1, fl + 1.2, z, 0.05, 0.42, 0.05); B.add('box', 0xe8c050, x + fx * -0.1, fl + 1.3, z, 0.05, 0.05, 0.26);
              for (const sz of [-0.38, 0.38]) { B.add('cyl', 0xf4eccc, x + fx * -0.1, fl + 1.07, z + sz, 0.05, 0.18, 0.05); const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 5), new THREE.MeshBasicMaterial({ color: 0xffd060 })); f.position.set(x + fx * -0.1, fl + 1.2, z + sz); group.add(f); torches.push({ f, ph: sz * 7, x: x + fx * -0.1, y: fl + 1.2, z: z + sz }); }
              const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 1.1), new THREE.MeshBasicMaterial({ visible: false })); p.position.set(x, fl + 0.7, z); p.userData.pick = { kind: 'node', i: K(o.x, o.y) }; group.add(p); pickables.push(p);
            } else {
              const fz = face === 's' ? 1 : -1;
              B.add('box', 0x8a857a, x, fl + 0.45, z, 1.0, 0.9, 0.6); B.add('box', 0xa8a294, x, fl + 0.93, z, 1.12, 0.07, 0.7);
              B.add('box', 0xf2eee0, x, fl + 0.97, z, 1.0, 0.02, 0.62); B.add('box', 0x6a3a8a, x, fl + 0.7, z + fz * 0.31, 0.34, 0.5, 0.01);
              B.add('box', 0xe8c050, x, fl + 1.2, z + fz * -0.1, 0.05, 0.42, 0.05); B.add('box', 0xe8c050, x, fl + 1.3, z + fz * -0.1, 0.26, 0.05, 0.05);
              for (const sx of [-0.38, 0.38]) { B.add('cyl', 0xf4eccc, x + sx, fl + 1.07, z + fz * -0.1, 0.05, 0.18, 0.05); const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 5), new THREE.MeshBasicMaterial({ color: 0xffd060 })); f.position.set(x + sx, fl + 1.2, z + fz * -0.1); group.add(f); torches.push({ f, ph: sx * 7, x: x + sx, y: fl + 1.2, z: z + fz * -0.1 }); }
              const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.9), new THREE.MeshBasicMaterial({ visible: false })); p.position.set(x, fl + 0.7, z); p.userData.pick = { kind: 'node', i: K(o.x, o.y) }; group.add(p); pickables.push(p);
            }
            break;
          }
          case 'pew': {
            /* face = the way you sit (backrest opposite). Default "n": long seat along X, back on +z (Saltmere).
               "e"/"w": long seat along Z for a church whose altar is on the east or west wall. */
            const fl = floorY(o, y), face = o.face || 'n', ew = face === 'e' || face === 'w';
            const len = (ew ? (o.h || 1) : (o.w || 1)) - 0.1, d = 0.42;
            if (ew) {
              const bx = face === 'e' ? -1 : 1;   /* backrest on the side you are not facing */
              B.add('box', 0x6a4426, x + bx * 0.05, fl + 0.42, z, d, 0.07, len);
              B.add('box', 0x6a4426, x + bx * 0.25, fl + 0.72, z, 0.06, 0.55, len);
              for (const sz of [-1, 1]) B.add('box', 0x5a3a1e, x + bx * 0.05, fl + 0.4, z + sz * (len / 2 - 0.05), 0.5, 0.8, 0.07);
            } else {
              const bz = face === 's' ? -1 : 1;
              B.add('box', 0x6a4426, x, fl + 0.42, z + bz * 0.05, len, 0.07, d);
              B.add('box', 0x6a4426, x, fl + 0.72, z + bz * 0.25, len, 0.55, 0.06);
              for (const sx of [-1, 1]) B.add('box', 0x5a3a1e, x + sx * (len / 2 - 0.05), fl + 0.4, z + bz * 0.05, 0.07, 0.8, 0.5);
            }
            break;
          }
          case 'shelf': { const w = o.w || 1, d = o.h || 1, lng = w >= d, ex = lng ? w : d; const zb = lng ? o.y + 0.25 : z, xb = lng ? x : o.x + 0.25, fl = floorY(o, y);
            B.add('box', 0x6a4a2a, xb, fl + 0.75, zb, lng ? ex - 0.1 : 0.4, 1.5, lng ? 0.4 : ex - 0.1);
            for (let k = 0; k < 3; k++) for (let n = 0; n < ex * 3; n++) { const t = (n + 0.5) / (ex * 3) - 0.5, col = [0xd29a52, 0xc84040, 0x8a5aa0, 0x6aa0d0, 0xe0c060][(n + k * 2 + o.x) % 5]; B.add('box', col, xb + (lng ? t * (ex - 0.2) : 0.05), fl + 0.35 + k * 0.45, zb + (lng ? 0.05 : t * (ex - 0.2)), 0.16, 0.18, 0.16); }
            break; }
          case 'counter': { const fl = floorY(o, y); B.add('box', 0x7a5232, x, fl + 0.45, z, (o.w || 1) - 0.05, 0.9, (o.h || 1) - 0.25); B.add('box', 0xa07a48, x, fl + 0.92, z, (o.w || 1) + 0.05, 0.06, (o.h || 1) - 0.1); B.add('box', 0xd29a52, x - 0.3, fl + 1.02, z, 0.25, 0.12, 0.15); break; }
          case 'table': { const fl = floorY(o, y), w = (o.w || 1) - 0.2, d = (o.h || 1) - 0.2; B.add('box', 0x8a5a30, x, fl + 0.62, z, w, 0.07, d); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('box', 0x5a3a1e, x + sx * (w / 2 - 0.06), fl + 0.3, z + sz * (d / 2 - 0.06), 0.07, 0.6, 0.07); B.add('cyl', 0xd8d0b8, x + 0.1, fl + 0.7, z, 0.18, 0.06, 0.18); B.add('box', 0xf4eccc, x - 0.15, fl + 0.75, z - 0.1, 0.05, 0.16, 0.05); break; }
          case 'chair': { const fl = floorY(o, y); B.add('box', 0x7a4a26, x, fl + 0.36, z, 0.42, 0.06, 0.42); B.add('box', 0x7a4a26, x, fl + 0.65, z - 0.19, 0.42, 0.55, 0.05); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('box', 0x5a3a1e, x + sx * 0.17, fl + 0.18, z + sz * 0.17, 0.05, 0.36, 0.05); break; }
          case 'bed': { const fl = floorY(o, y), w = (o.w || 1) - 0.15, d = (o.h || 1) - 0.15; B.add('box', 0x6a4426, x, fl + 0.2, z, w, 0.4, d); B.add('box', [0xa03a3a, 0x3a6aa0, 0x6a8a3a][(o.x + o.y) % 3], x, fl + 0.43, z + 0.12, w - 0.06, 0.1, d - 0.4); B.add('box', 0xf0ead8, x, fl + 0.46, z - d / 2 + 0.25, w - 0.25, 0.12, 0.3); B.add('box', 0x5a3a1e, x, fl + 0.55, z - d / 2 + 0.04, w, 0.7, 0.08); break; }
          case 'fireplace': case 'furnace': {
            const fl = floorY(o, y), w = (o.w || 1), d = (o.h || 1), hgt = o.k === 'furnace' ? 1.4 : 1.1;
            B.add('box', 0x6e6a62, x, fl + hgt / 2, z, w - 0.1, hgt, d - 0.1); B.add('box', 0x55504a, x, fl + hgt + 0.05, z, w, 0.1, d);
            B.add('box', 0x6e6a62, x, fl + hgt + 0.7, z, 0.4, 1.3, 0.4);
            const fz = o.face === 'n' ? -1 : 1;   /* which side the hearth opens to (default south / +z) */
            const glow = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.05), new THREE.MeshBasicMaterial({ color: o.k === 'furnace' ? 0xff6a10 : 0xff9a30 })); glow.position.set(x, fl + 0.3, z + fz * (d / 2 - 0.03)); group.add(glow); torches.push({ f: glow, ph: o.x, glow: true });
            if (o.mount) {   /* a blade hung above the hearth on two pegs (Maren's late husband's sword); the engine hides it once given */
              const m = new THREE.Group(), zf = z + fz * 0.25, my = fl + hgt + 0.42, M3 = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
              const bx = (w2, h2, d2, c, px, py) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d2), M3(c)); q.position.set(px, py, 0); m.add(q); };
              bx(0.8, 0.1, 0.025, 0xd08a48, 0.12, 0); bx(0.8, 0.025, 0.03, 0xf0b070, 0.12, 0.012); bx(0.07, 0.3, 0.07, 0x9a6a34, -0.32, 0); bx(0.2, 0.06, 0.06, 0x5a3a20, -0.46, 0); bx(0.08, 0.08, 0.08, 0x9a6a34, -0.6, 0);
              bx(0.05, 0.05, 0.08, 0x3a2a1c, -0.1, -0.08); bx(0.05, 0.05, 0.08, 0x3a2a1c, 0.32, -0.08);
              m.position.set(x, my, zf); m.rotation.z = 0.06; group.add(m);
              mounts.push(Object.assign({ obj: m }, o.mount));
            }
            break; }
          case 'stall': {
            for (const sx of [-0.42, 0.42]) B.add('box', 0x5a3c24, x + sx, y + 0.75, z, 0.07, 1.5, 0.07);
            B.add('box', 0x5a3c24, x, y + 1.42, z, 0.95, 0.06, 0.06);
            [0xc84040, 0x3f5d8a, 0xc8a040, 0x4f6d3a, 0x5b3a7a].forEach((c, k) => B.add('box', c, x - 0.34 + k * 0.17, y + 1.08, z + (k % 2) * 0.04, 0.13, 0.62, 0.04));
            B.add('box', 0xa07a48, x, y + 0.25, z + 0.3, 0.8, 0.5, 0.35);
            break; }
          case 'barrel': y = floorY(o, y); B.add('cyl', 0x8a5a30, x, y + 0.4, z, 0.6, 0.8, 0.6); B.add('cyl', 0x3a3a3a, x, y + 0.2, z, 0.62, 0.06, 0.62); B.add('cyl', 0x3a3a3a, x, y + 0.6, z, 0.62, 0.06, 0.62); break;
          case 'crate': B.add('box', 0xa07a48, x, y + 0.32, z, 0.65, 0.65, 0.65, hash2(o.x, o.y)); B.add('box', 0x7a5a30, x, y + 0.66, z, 0.68, 0.04, 0.68, hash2(o.x, o.y)); break;
          case 'tent': { const t = mesh(new THREE.ConeGeometry(1.25, 1.6, 4), hash2(o.x, o.y) < 0.5 ? 0x8a7a50 : 0x6a7a40, x, y + 0.8, z); t.rotation.y = Math.PI / 4; group.add(t); B.add('box', 0x2a2015, x, y + 0.4, z + 0.86, 0.4, 0.8, 0.05); break; }
          case 'gate': {
            /* a closed gate in the palisade: posted leaves, iron bands, a latch. span "ns" = the fence runs
               north-south and you walk east through it; "ew" = the fence runs east-west and you walk north. */
            const ns = o.span === 'ns', POST = 0x3e2916, PLANK = 0x8d6234, WOOD = 0x6a4424, IRON = 0x2a2a2e, RAIL = 0x8a6a40;
            const post = (px, pz) => { B.add('box', POST, px, y + 1.22, pz, 0.2, 2.44, 0.2); B.add('pyr', POST, px, y + 2.56, pz, 0.3, 0.34, 0.3); };
            if (ns) {
              post(x, z - 0.46); post(x, z + 0.46);
              B.add('box', POST, x, y + 2.28, z, 0.16, 0.12, 1.12);
              for (const sz of [-0.30, -0.16, 0.02, 0.16, 0.30]) B.add('box', sz < 0 ? PLANK : WOOD, x, y + 1.08, z + sz, 0.07, 1.92, 0.12);
              B.add('box', 0x5c3c1e, x + 0.04, y + 1.08, z - 0.16, 0.03, 1.4, 0.045, 0, 0.55, 0);
              B.add('box', 0x5c3c1e, x + 0.04, y + 1.08, z + 0.16, 0.03, 1.4, 0.045, 0, -0.55, 0);
              for (const hy of [0.48, 1.12, 1.76]) B.add('box', IRON, x + 0.05, y + hy, z, 0.02, 0.04, 0.72);
              B.add('box', IRON, x + 0.07, y + 1.18, z, 0.04, 0.08, 0.18);
              for (const sz of [-0.4, 0.4]) for (const hy of [0.55, 1.72]) B.add('box', IRON, x, y + hy, z + sz, 0.1, 0.045, 0.08);
              for (const dir of [-1, 1]) for (const hy of [0.32, 0.62]) B.add('box', RAIL, x, y + hy, z + dir * 0.74, 0.05, 0.07, 0.48);
            } else {
              post(x - 0.46, z); post(x + 0.46, z);
              B.add('box', POST, x, y + 2.28, z, 1.12, 0.12, 0.16);
              for (const sx of [-0.30, -0.16, 0.02, 0.16, 0.30]) B.add('box', sx < 0 ? PLANK : WOOD, x + sx, y + 1.08, z, 0.12, 1.92, 0.07);
              B.add('box', 0x5c3c1e, x - 0.16, y + 1.08, z + 0.04, 0.045, 1.4, 0.03, 0.55, 0, 0);
              B.add('box', 0x5c3c1e, x + 0.16, y + 1.08, z + 0.04, 0.045, 1.4, 0.03, -0.55, 0, 0);
              for (const hy of [0.48, 1.12, 1.76]) B.add('box', IRON, x, y + hy, z + 0.05, 0.72, 0.04, 0.02);
              B.add('box', IRON, x, y + 1.18, z + 0.07, 0.18, 0.08, 0.04);
              for (const sx of [-0.4, 0.4]) for (const hy of [0.55, 1.72]) B.add('box', IRON, x + sx, y + hy, z, 0.08, 0.045, 0.1);
              for (const dir of [-1, 1]) for (const hy of [0.32, 0.62]) B.add('box', RAIL, x + dir * 0.74, y + hy, z, 0.48, 0.07, 0.05);
            }
            const pk = new THREE.Mesh(new THREE.BoxGeometry(ns ? 0.7 : 1.3, 2.4, ns ? 1.3 : 0.7), new THREE.MeshBasicMaterial({ visible: false }));
            pk.position.set(x, y + 1.15, z); pk.userData.pick = { kind: 'passage', x: o.x, y: o.y }; group.add(pk); pickables.push(pk);
            break;
          }
          case 'campfire': {
            for (let k = 0; k < 4; k++) B.add('box', 0x5a3c24, x, y + 0.08, z, 0.7, 0.1, 0.1, k * Math.PI / 4);
            for (let k = 0; k < 6; k++) B.add('box', 0x6a6a6a, x + Math.cos(k) * 0.45, y + 0.07, z + Math.sin(k) * 0.45, 0.16, 0.14, 0.16, k);
            if (o.smoke !== false) anim.push({ smoke: true, x, y: y + 0.8, z, parts: [] });   /* a camp's fire smokes */
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xff8a20 })); f.position.set(x, y + 0.35, z); group.add(f); torches.push({ f, ph: 1, x, y, z });
            if (map.nodes && map.nodes.get && map.nodes.get(K(o.x, o.y))) { const pk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.8, 8), new THREE.MeshBasicMaterial({ visible: false })); pk.position.set(x, y + 0.4, z); pk.userData.pick = { kind: 'node', i: K(o.x, o.y) }; group.add(pk); pickables.push(pk); }   /* a town's campfire: cook on it */
            break;
          }
        }
      }
      /* fences: a post on every F tile, rails to F neighbours east and south. A gate tile is the opening. */
      const gateTiles = new Set();
      for (const o of map.objects || []) if (o.k === 'gate') gateTiles.add(o.x + ',' + o.y);
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        if (at(x, y) !== 'F' || !mine(x, y) || gateTiles.has(x + ',' + y)) continue;
        const px = x + 0.5, pz = y + 0.5, py = heightAt(px, pz);
        B.add('box', 0x6a4a2a, px, py + 0.38, pz, 0.12, 0.76, 0.12);
        if (at(x + 1, y) === 'F' && !gateTiles.has((x + 1) + ',' + y)) for (const ry of [0.28, 0.58]) B.add('box', 0x8a6a40, px + 0.5, py + ry, pz, 1.0, 0.07, 0.05);
        if (at(x, y + 1) === 'F' && !gateTiles.has(x + ',' + (y + 1))) for (const ry of [0.28, 0.58]) B.add('box', 0x8a6a40, px, py + ry, pz + 0.5, 0.05, 0.07, 1.0);
      }
      /* flowers, grass tufts and ferns */
      const FL = [0xe04040, 0xf0d040, 0xf4f4f4, 0xb060d0, 0xff8a3a];
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        if (!mine(x, y)) continue;
        const c = at(x, y), r = hash2(x * 5 + 1, y * 7 + 2);
        if (c === 'K') { B.add('box', 0x8c897e, x + 0.5, heightAt(x + 0.5, y + 0.5) + 0.65, y + 0.5, 0.5, 1.3 + r * 0.9, 0.42, r * 6); continue; }   /* standing stones and ruin walls (seeded land) */
        if (c === 'c') {   /* cobbles laid by hand, not by a grid (2026-10-07: "too uniform ... use a seed to generate a random cobble
          pattern and a handful of random shapes"): from the tile's own seed, 9 to 12 stones scattered by dart-throwing (kept apart,
          spilling a little over the tile's edges), each one of a handful of shapes - five-, six- and seven-sided setts, a squared
          slab, a flattened knobbly stone - with its own size, stretch, turn and shade. The same seed lays the same road for everyone */
          const H = k => hash2(x * 7 + k * 131, y * 13 - k * 71), CS = [0x6e6a63, 0x7a766e, 0x858076, 0x8f8a80, 0x9a948a, 0x7f776a, 0x8a8478], SH = ['cyl5', 'cyl6', 'cyl7', 'box', 'stone', 'cyl6', 'stone'];
          const n = 9 + Math.floor(H(0) * 4), pts = [];
          for (let t = 1; pts.length < n && t < 80; t++) {
            const px = -0.06 + H(t) * 1.12, pz = -0.06 + H(t + 50) * 1.12;
            if (pts.every(q => (q[0] - px) ** 2 + (q[1] - pz) ** 2 > 0.05)) pts.push([px, pz, t]);
          }
          for (const [px, pz, t] of pts) {
            const r = H(t + 100), sh = SH[Math.floor(H(t + 200) * SH.length)], w = 0.27 + r * 0.14, st = 0.8 + H(t + 300) * 0.4, sx = x + px, sz = y + pz;
            const tall = sh === 'stone' ? 0.09 : 0.06;
            B.add(sh, CS[Math.floor(H(t + 400) * CS.length)], sx, heightAt(sx, sz) + tall * 0.35, sz, w * st, tall, w / st, H(t + 500) * 6.283, sh === 'stone' ? (H(t + 600) - 0.5) * 0.3 : 0);
          }
          continue;
        }
        if (c === '^' && map.underNear && map.underNear(x, y)) continue;   /* underground the rock is the raised ground itself */
        if (c === '^') { if (r < 0.4) B.add('pyr', 0x76736b, x + 0.5, heightAt(x + 0.5, y + 0.5) + 0.5, y + 0.5, 1.4, 1 + r * 2, 1.4, r * 6); continue; }   /* mountain rock */
        if (c === 'f') for (let k = 0; k < 5; k++) { const fx = x + 0.2 + hash2(x + k, y) * 0.6, fz = y + 0.2 + hash2(x, y + k) * 0.6, fy = heightAt(fx, fz); BF.add('box', 0x3a7a2a, fx, fy + 0.08, fz, 0.03, 0.16, 0.03); BF.add('box', FL[(x + y + k) % 5], fx, fy + 0.18, fz, 0.09, 0.07, 0.09); }
        else if ((c === '.' || c === ',') && r < 0.28) { const fx = x + 0.2 + hash2(x, y + 2) * 0.6, fz = y + 0.2 + hash2(x + 2, y) * 0.6; BF.add('cone', c === ',' ? 0x3a6a26 : 0x4a8a30, fx, heightAt(fx, fz) + 0.1, fz, 0.22, 0.22, 0.22, r * 9); }
        else if (c === ',' && r > 0.965) { const fx = x + 0.3 + hash2(x, y + 7) * 0.4, fz = y + 0.3 + hash2(x + 7, y) * 0.4, fy = heightAt(fx, fz); BF.add('cyl6', 0xe8e0c8, fx, fy + 0.05, fz, 0.05, 0.1, 0.05); BF.add('cone', 0xb83a2a, fx, fy + 0.12, fz, 0.14, 0.07, 0.14); }
      }
      B.finish();
      { const reg = { sets: BF.finish(), g: group }; FLORA_REG.push(reg); floraSeason(reg); }
      if (RICEP.length) {   /* the manoomin: stalk, a blade off it, and the head on top; tinted per plant by the season */
        const mk = () => { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), RICEP.length); im.castShadow = true; im.frustumCulled = false; im.setColorAt(0, new THREE.Color()); group.add(im); return im; };
        const reg = { plants: RICEP, stalk: mk(), blade: mk(), head: mk(), g: group }; RICE_REG.push(reg); riceSeason(reg);
      }
      /* fishing spots: rippling rings */
      const spots = [];
      for (const [i, n] of map.nodes) if (n.kind === 'fish' && inR(n.x, n.y) && mine(n.x, n.y)) {
        const g = new THREE.Group(); g.position.set(n.x + 0.5, wsurf(n.x, n.y) + 0.02, n.y + 0.5); group.add(g);   /* sit on the water's actual skin, sea or pond */
        const rings = [0, 1, 2].map(k => { const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.7, depthWrite: false })); g.add(r); return r; });
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8), new THREE.MeshBasicMaterial({ visible: false })); p.userData.pick = { kind: 'node', i }; g.add(p); pickables.push(p);
        spots.push({ rings, ph: hash2(n.x, n.y) * 3, x: n.x, y: n.y, g });
      }
      /* torch light: two warm lights at the village plaza (more would cost too much on phones) */
      const lights = [];
      for (const t of torches.filter(t => !t.glow && t.x != null).slice(0, 2)) { const L = new THREE.PointLight(0xffa050, 3, 6, 1.6); L.position.set(t.x, t.y + 1.5, t.z); group.add(L); lights.push(L); }

      const smokeGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12), smokeMat = new THREE.MeshLambertMaterial({ color: 0xc8c8c8, transparent: true, opacity: 0.35, depthWrite: false });
      return {
        group, heightAt, pickables, waterY: seeded ? map.waterH() - 0.05 : WATER_Y, terrain: terrainMesh, rect: RC, roofs, mounts,
        setView(px, pz, r) {   /* seeded chunks: show a quadrant's trees only while it is within r metres of the player */
          if (!chunk) return;
          for (let q = 0; q < 4; q++) {
            const qx = X0 + (q & 1) * 32, qz = Y0 + (q >> 1) * 32, dx = Math.max(qx - px, 0, px - qx - 32), dz = Math.max(qz - pz, 0, pz - qz - 32), on = dx * dx + dz * dz <= r * r;
            for (const m of quads[q]) m.visible = on;
          }
        },
        /* a region left behind goes for good (2026-10-08: the season lists kept every region ever built - its trees, plants and
           rice, with their meshes - so a long walk or a few trips to the Spider Cave filled an iPhone's memory until iOS closed
           the game; the instanced meshes also hold their per-instance buffers on the GPU until disposed) */
        dispose() {
          group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); const mt = o.material; if (mt && mt.map && mt.map.isCanvasTexture) { mt.map.dispose(); mt.dispose(); } });   /* painted signs are this region's own */
          for (const L of [TREE_REG, FLORA_REG, RICE_REG]) for (let i = L.length - 1; i >= 0; i--) if (L[i].g === group) L.splice(i, 1);
        },
        pickInfo(hit) {
          const u = hit.object.userData.pick; if (!u) return null;
          if (u.kind === 'tree') { const i = u.tiles[hit.instanceId]; return i >= 0 ? { kind: 'node', i } : { kind: 'ground', point: hit.point }; }
          if (u.kind === 'ground') return { kind: 'ground', point: hit.point };
          if (u.kind === 'deckpick') {   /* a castle wall, stair or tower top (src/castle.js): the tile tapped, on that structure */
            if (u.x != null) return { kind: 'ground', point: { x: u.x + 0.5, z: u.y + 0.5 } };
            if (u.along != null) return { kind: 'ground', point: u.along ? { x: hit.point.x, z: u.fixed + 0.5 } : { x: u.fixed + 0.5, z: hit.point.z } };
            return { kind: 'ground', point: hit.point };
          }
          return u;
        },
        setDepleted(i, on) {
          const t = treeAt.get(i);
          if (t) { t.felled = !!on; t.trunk.setMatrixAt(t.n, on ? ZERO : t.m); t.crown.setMatrixAt(t.n, on ? ZERO : t.m); if (t.reg) treeSeason(t.reg); t.trunk.instanceMatrix.needsUpdate = t.crown.instanceMatrix.needsUpdate = true; stumps.setMatrixAt(t.stump, on ? t.sm : ZERO); stumps.instanceMatrix.needsUpdate = true; if (stumps.computeBoundingSphere) stumps.computeBoundingSphere(); return; }
          const r = rockAt.get(i); if (r) r.ore.visible = !on;
        },
        update(dt, time) {
          for (const t of torches) {
            const s = 0.85 + 0.15 * Math.sin(time * 13 + t.ph) + 0.08 * Math.sin(time * 31 + t.ph * 2);
            if (t.tend) { const on = LAMPQ ? !!LAMPQ(t.tx, t.ty) : true; t.f.visible = on; if (t.f2) t.f2.visible = on; }
            else if (t.night) { const on = NIGHTK > 0.04; t.f.visible = on; if (t.f2) t.f2.visible = on; }
            t.f.scale.set(1, s, 1); if (t.f2) t.f2.scale.set(1, s, 1);
          }
          for (const L of street) { const on = LAMPQ ? !!LAMPQ(L.x, L.y) : NIGHTK > 0.04; L.mat.color.copy(LAMP_OFF).lerp(LAMP_ON, on ? 1 : 0); }
          for (const L of lights) L.intensity = 2.6 + Math.sin(time * 11 + L.position.x) * 0.4;
          for (const s of spots) { const ice = !!(map.iceAt && map.iceAt(s.x, s.y)); s.rings.forEach(r => { r.visible = !ice; }); }   /* a frozen pond does not ripple: you fish through the ice */
          for (const s of spots) if (s.rings[0].visible) s.rings.forEach((r, k) => { const p = ((time * 0.6 + s.ph + k / 3) % 1); r.scale.setScalar(0.6 + p * 2.2); r.material.opacity = 0.75 * (1 - p); });
          if (waterMesh) waterMesh.material.emissive.setHSL(0.58, 0.6, 0.08 + 0.02 * Math.sin(time * 1.5));
          if (waterMesh) waterMesh.position.y = Math.sin(time * 0.55) * 0.014;   /* the whole sheet rides a slow swell, some water sits on it */
          for (const a of anim) if (a.bob) a.bob.position.y = a.y0 + 0.12 * Math.sin(time * 2.6);
          for (const a of anim) if (a.smoke) {
            if (a.parts.length < 8 && Math.random() < dt * 3) { const m = new THREE.Mesh(smokeGeo, smokeMat); m.position.set(a.x, a.y, a.z); m.userData.t = 0; group.add(m); a.parts.push(m); }
            for (let k = a.parts.length - 1; k >= 0; k--) { const m = a.parts[k]; m.userData.t += dt; m.position.y += dt * 0.5; m.position.x += dt * 0.15; m.scale.setScalar(1 + m.userData.t * 0.8); m.rotation.y += dt; if (m.userData.t > 2.4) { group.remove(m); a.parts.splice(k, 1); } }
          }
        }
      };
    }
    function minimap(map, rect) {   /* the map as a picture, 4 px per tile: the whole old map, or rect [x0, y0, w, h] (seeded land: a window around you) */
      const RC = rect || [0, 0, map.W, map.H], X0 = RC[0], Y0 = RC[1], W = RC[2], H = RC[3], at = (x, y) => map.tileAt(x, y);
      const mm = document.createElement('canvas'); mm.width = W * 4; mm.height = H * 4;
      {
        const g = mm.getContext('2d'), MC = { '.': '#4e8a32', f: '#4e8a32', F: '#6a4a2a', ',': '#3e7428', p: '#a08458', c: '#8a857c', d: '#857254', B: '#6e4f2e', g: '#a99d58', q: '#9aa38d', v: '#3f7ab8', J: '#d4e6f0', s: '#c4b07a', '~': '#2f6aa8', H: '#8a6a50', X: '#7a6a5a', R: '#6a6a66', N: '#6a6a66', I: '#6a6a66', r: '#6a6a66', T: '#2a5a1e', P: '#22501e', O: '#2e5a1c', W: '#5d7f3a', M: '#8a5a26', E: '#7fa457', L: '#7a9a4a', Q: '#2f5a34', Y: '#1f4722', U: '#c4b07a', C: '#4a4a52', G: '#8a7a4a', A: '#6a7488', '^': '#77736a', K: '#8a877c' };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at(X0 + x, Y0 + y); g.fillStyle = MC[c] || '#4e8a32'; g.fillRect(x * 4, y * 4, 4, 4); if ('TPOMWYU'.indexOf(c) >= 0) { g.fillStyle = c === 'U' ? '#3f6a2a' : '#183a12'; g.fillRect(x * 4 + 1, y * 4 + 1, 2, 2); } }
        for (const o of map.objects) if (o.k === 'house' || o.k === 'shop' || o.k === 'smithy' || o.k === 'church') { const ox = o.x - X0, oy = o.y - Y0; g.fillStyle = '#b8a890'; g.fillRect(ox * 4, oy * 4, o.w * 4, o.h * 4); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.strokeRect(ox * 4 + 0.5, oy * 4 + 0.5, o.w * 4 - 1, o.h * 4 - 1); }
      }
      return mm;
    }
    return { api: 2, build, minimap, heights: map => heightsOf(map).heightAt, surface: map => heightsOf(map).surf, WATER_Y, see: SEE, lampGlow, lampQuery: fn => { LAMPQ = fn; }, canoeMesh, seasonApply, docks: () => { for (let i = DOCKS.length - 1; i >= 0; i--) if (!DOCKS[i].parent) DOCKS.splice(i, 1); return DOCKS; } };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('scene', { api: 2, v: 1, needs: { three: 160 } }, sceneFactory);
})(typeof globalThis !== 'undefined' ? globalThis : this);
