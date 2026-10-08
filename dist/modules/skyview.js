/* ASHVALE sky view (module `skyview`, api 1) - 2026-10-07: "Can't three js map out three celestial bodies? ... One of the
   celestial bodies just happens to be a light source ... a lightweight background task."

   The sky as a small scene of its own, drawn first each frame behind the world: the sun a glowing sphere, the moon a real
   sphere lit by a light from the sun (so its phases, its terminator and an eclipse come from the geometry, not from drawing),
   the stars and the Milky Way. Its camera turns with the game camera and stands at the centre; the bodies sit in their true
   directions at their true angular sizes (sky.js: half a degree each), the moon nearer than the sun, so the moon passing
   over the sun hides it - a solar eclipse is just the moon in front.

   The moon is drawn twice: first as a depth-only disc (it blocks the sun and the stars behind it, and shows nothing), then
   its lit side added onto the sky - so its unlit side is invisible by day, as ours is, and black only in front of the sun.

     const SV = createSkyView(THREE, { starmap, phone })
     SV.update({ sun, moon, north, starsM, night, moonK, cover, lunar, clear, under })   all vectors in the game's scene frame
     SV.render(renderer, camera, background)   draws the sky (clearing to the background colour); then draw the world without clearing
*/
(function (root) {
  'use strict';
  function createSkyView(THREE, opts) {
    const O = opts || {}, SM = O.starmap && O.starmap.stars ? O.starmap : null, phone = !!O.phone;
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.5, 6000);
    const SUN_D = 3000, MOON_D = 400, SUN_A = 109.2 / 23455, MOON_A = SUN_A;   /* angular radii, radians (sky.js scale: the moon's orbit is set so the two match) */
    /* the moon's face: the near side as we know it (maria and bright craters at their selenographic places), painted once */
    const MARIA = [[-57, 18, 24], [-16, 33, 15], [18, 28, 9], [31, 8, 11], [59, 17, 6], [51, -8, 9], [35, -15, 5.5], [-17, -21, 9], [-39, -24, 5], [-30, 57, 6], [0, 56, 6], [30, 57, 6], [4, 13, 4], [-5, -4, 3.5], [-60, -2, 7], [-43, 4, 6]];
    const CRATERS = [[-11, -43, 1.6, 1], [-20, 9.6, 1.7, 0.75], [-38, 8, 1, 0.6], [-47.5, 23.7, 0.8, 0.9], [26, -11, 1, 0.4]];
    function albedo(lo, la) {
      let a = 0.8 + 0.06 * Math.sin(lo * 0.31 + la * 0.17) * Math.sin(la * 0.23 - lo * 0.11) + 0.04 * Math.sin(lo * 1.3) * Math.cos(la * 1.1);
      const cl = Math.cos(la * Math.PI / 180);
      for (const m of MARIA) { const d = Math.hypot((lo - m[0]) * cl, la - m[1]); if (d < m[2] * 1.25) a -= 0.3 * Math.min(1, (m[2] * 1.25 - d) / (m[2] * 0.45)); }
      a = Math.max(0.42, a);
      for (const c of CRATERS) { const d = Math.hypot((lo - c[0]) * cl, la - c[1]); if (d < c[2]) a += 0.28 * c[3] * (1 - d / c[2]); }
      { const d = Math.hypot((lo + 11) * cl, la + 43), ang = Math.atan2(la + 43, lo + 11); if (d > 1.6 && d < 38) a += 0.07 * Math.max(0, Math.cos(ang * 9)) * (1 - d / 38); }   /* Tycho's rays */
      return Math.min(1.05, a);
    }
    let moonTex = null;
    if (typeof document !== 'undefined') {
      const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), img = c.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const lo = (x + 0.5) / W * 360 - 180, la = 90 - (y + 0.5) / H * 180, a = Math.abs(lo) <= 95 ? albedo(lo, la) : 0.78 + 0.05 * Math.sin(lo * 0.4) * Math.sin(la * 0.3), o = (y * W + x) * 4;
        img.data[o] = 236 * a; img.data[o + 1] = 230 * a; img.data[o + 2] = 214 * a; img.data[o + 3] = 255;
      }
      c.putImageData(img, 0, 0); moonTex = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) moonTex.colorSpace = THREE.SRGBColorSpace;
    }
    /* sphere UVs put longitude 0 on +x; turned so the near side (longitude 0) looks along +z, the way lookAt points a mesh */
    const moonGeo = new THREE.SphereGeometry(MOON_D * Math.tan(MOON_A), 48, 32); moonGeo.rotateY(-Math.PI / 2);
    /* the moon's silhouette on the sun (2026-10-07: "the moon seems to pop into existence only when it is fully in front of the sun, it
       doesn't slide in from the side"): the sun's disc marks its pixels in the stencil as it is drawn; the moon's disc then darkens only
       marked pixels - so its edge slides across the sun, and off the sun the moon's unlit side stays invisible */
    const blockMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, fog: false, depthTest: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp }), moonBlock = new THREE.Mesh(moonGeo, blockMat);
    const moonMat = new THREE.MeshLambertMaterial({ map: moonTex, color: 0xffffff, emissive: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthFunc: THREE.LessEqualDepth, fog: false });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moonBlock.renderOrder = 3.5; moon.renderOrder = 5;
    const moonLight = new THREE.DirectionalLight(0xffffff, 2.6), shine = new THREE.AmbientLight(0x6070a0, 0.02);   /* the sun on the moon; earthshine */
    scene.add(moonBlock, moon, moonLight, moonLight.target, shine);
    /* the sun: a white-hot disc and a soft glare round it, drawn after the moon's block so the moon covers both */
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(SUN_D * Math.tan(SUN_A), 32, 16), new THREE.MeshBasicMaterial({ color: 0xfffbea, fog: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
    const glareTex = (() => { if (typeof document === 'undefined') return null; const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,246,215,0.32)'); g.addColorStop(0.1, 'rgba(255,236,180,0.22)'); g.addColorStop(0.35, 'rgba(255,214,140,0.08)'); g.addColorStop(1, 'rgba(255,200,120,0)');   /* soft: the sun's own edge stays sharp inside it */ c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glareTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));   /* the glare is light in the air, in front of the moon too */
    glare.scale.setScalar(SUN_D * Math.tan(SUN_A) * 22);
    sunDisc.renderOrder = 3; glare.renderOrder = 3.2; scene.add(sunDisc, glare);   /* the glare first, then the moon's silhouette over it (3.5) */
    /* the stars and the Milky Way, in the sky's own frame (right ascension / declination), turned by starsM */
    const stars = new THREE.Group(); stars.matrixAutoUpdate = false; scene.add(stars);
    const dirOf = (ra, dec) => { const a = ra * Math.PI / 180, d = dec * Math.PI / 180; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
    const bvRGB = bv => { const t = Math.max(-0.4, Math.min(2, bv)); return t < 0.4 ? [0.72 + 0.245 * (t + 0.4), 0.82 + 0.19 * (t + 0.4), 1] : [1, 1 - 0.32 * (t - 0.4) / 1.6, 1 - 0.65 * (t - 0.4) / 1.6]; };
    const starMats = []; let mwMat = null;
    if (SM) {
      for (const [lo, hi, size] of [[-3, 2.0, phone ? 3.2 : 3.6], [2.0, 3.6, phone ? 2.2 : 2.5], [3.6, 9, phone ? 1.4 : 1.6]]) {
        const L = SM.stars.filter(r => r[2] / 10 >= lo && r[2] / 10 < hi), pos = new Float32Array(L.length * 3), col = new Float32Array(L.length * 3);
        L.forEach((r, i) => { const v = dirOf(r[0] / 10, r[1] / 10), m = r[2] / 10, b = Math.max(0.28, Math.min(1, 1.25 - 0.17 * m)), c = bvRGB(r[3] / 10); pos.set([v[0] * 5000, v[1] * 5000, v[2] * 5000], i * 3); col.set([c[0] * b, c[1] * b, c[2] * b], i * 3); });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
        const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 2; stars.add(p); starMats.push(m);
      }
      if (typeof document !== 'undefined' && SM.mw && SM.mw.length) {
        const W = 2048, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
        if ('filter' in c) c.filter = 'blur(7px)';
        for (const [lvl, flat] of SM.mw) {
          const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] / 10, flat[i + 1] / 10]);
          for (let i = 1; i < pts.length; i++) { while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360; while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360; }
          c.fillStyle = 'rgba(205,215,255,' + (0.045 + 0.012 * lvl) + ')';
          for (const sh of [-360, 0, 360]) { c.beginPath(); pts.forEach((p, i) => { const x = (p[0] + sh) / 360 * W, y = (1 - (p[1] + 90) / 180) * H; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.fill(); }
        }
        const tex = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        const NA = 96, ND = 48, pos = [], uv = [], ind = [];
        for (let j = 0; j <= ND; j++) for (let i = 0; i <= NA; i++) { const v = dirOf(i / NA * 360, -90 + j / ND * 180); pos.push(v[0] * 5200, v[1] * 5200, v[2] * 5200); uv.push(i / NA, j / ND); }
        for (let j = 0; j < ND; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, d = a + NA + 1, e = d + 1; ind.push(a, d, b, b, d, e); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind);
        mwMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        const mw = new THREE.Mesh(g, mwMat); mw.frustumCulled = false; mw.renderOrder = 0; stars.add(mw);
      }
    }
    /* the planets: one bright point each (Venus the brightest thing after the moon), coloured as they look - Mars red, Saturn gold */
    const planetPts = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const mt = new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
      const p = new THREE.Points(g, mt); p.frustumCulled = false; p.renderOrder = 2; scene.add(p); planetPts.push(p);
    }
    const V2 = new THREE.Vector3(), V = new THREE.Vector3(), SUNC = new THREE.Color(0xfffbea), LOWC = new THREE.Color(0xffa860), COPPER = new THREE.Color(0xff6a3a);
    let on = true;
    function update(s) {
      on = !s.under;
      const sun = new THREE.Vector3(s.sun[0], s.sun[1], s.sun[2]).normalize(), sunUp = sun.y;
      sunDisc.position.copy(sun).multiplyScalar(SUN_D); glare.position.copy(sunDisc.position);
      const sunVis = Math.max(0, Math.min(1, (sunUp + 0.03) / 0.04)) * s.clear;
      sunDisc.visible = glare.visible = sunVis > 0.01;
      sunDisc.material.color.copy(SUNC).lerp(LOWC, Math.max(0, Math.min(1, 1 - sunUp / 0.12)) * 0.75);   /* low in the sky, the sun reddens */
      glare.material.opacity = sunVis * (1 - 0.85 * (s.cover || 0)); glare.material.color.copy(sunDisc.material.color);
      moonLight.position.copy(sun).multiplyScalar(1000); moonLight.target.position.set(0, 0, 0);
      const m = V.set(s.moon[0], s.moon[1], s.moon[2]).normalize();
      moon.position.copy(m).multiplyScalar(MOON_D); moonBlock.position.copy(moon.position);
      moon.up.set(s.north[0], s.north[1], s.north[2]); moon.lookAt(0, 0, 0); moonBlock.quaternion.copy(moon.quaternion);   /* its near side to us, north up the sky */
      /* touching the sun, the moon's unlit side is a black disc against it (2026-10-07: "it looks like the moon is somewhat
         transparent"); anywhere else it stays invisible on the sky, as ours does */
      if (s.bg) blockMat.color.copy(s.bg).multiplyScalar(0.12); else blockMat.color.setRGB(0.02, 0.02, 0.03);
      const mUp = m.y, mVis = Math.max(0, Math.min(1, (mUp + 0.02) / 0.04)) * s.clear;
      moon.visible = moonBlock.visible = mVis > 0.01;
      const u = s.lunar || 0;   /* in the planet's shadow: little light, and that little red (every sunset round the planet) */
      moonLight.intensity = 2.6 * (1 - 0.97 * u) * mVis; moonLight.color.setRGB(1, 1 - 0.55 * u, 1 - 0.75 * u);
      moonMat.emissive.copy(COPPER).multiplyScalar(0.16 * u * mVis);
      const night = s.night;
      const so = Math.max(0, Math.min(1, (night - 0.5) / 0.4)) * (1 - 0.75 * (s.moonK || 0)) * s.clear;
      for (const mt of starMats) mt.opacity = so; if (mwMat) mwMat.opacity = so * 0.55;
      stars.visible = so > 0.01; if (s.starsM) stars.matrix.copy(s.starsM);
      (s.planets || []).forEach((P, i) => {
        const pt = planetPts[i]; if (!pt) return;
        const pa = pt.geometry.attributes.position; pa.array[0] = P.dir[0] * 4800; pa.array[1] = P.dir[1] * 4800; pa.array[2] = P.dir[2] * 4800; pa.needsUpdate = true;
        const b = Math.max(0.35, Math.min(1, 0.85 - 0.18 * P.mag)), tw = Math.max(0, Math.min(1, (night - (P.mag < -3 ? 0.25 : 0.4)) / 0.35));   /* the brightest show first in the dusk */
        pt.material.size = (phone ? 2.4 : 2.8) + Math.max(0, -P.mag) * (phone ? 0.5 : 0.6); pt.material.color.setRGB(P.color[0] * b, P.color[1] * b, P.color[2] * b);
        pt.material.opacity = tw * s.clear * (P.dir[1] > -0.02 ? 1 : 0); pt.visible = pt.material.opacity > 0.01;
      });
    }
    function render(renderer, camera, background) {
      if (!on) return false;
      cam.fov = camera.fov; cam.aspect = camera.aspect; cam.quaternion.copy(camera.quaternion); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      scene.background = background || null;
      renderer.render(scene, cam);
      return true;
    }
    return { api: 1, scene, update, render };
  }
  const api = { api: 1, createSkyView };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('skyview', { api: 1, v: 1, needs: { three: 160 } }, () => api);
  root.AshSkyView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
