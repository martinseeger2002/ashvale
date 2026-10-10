/* ASHVALE 3D engine part: THE SKY (split out of engine.js, 2026-10-08, the operator: "can it be modularized?" - the engine was 307 KB and
   re-inscribed in 61 of 96 releases). Day and night, the year, the moon, the stars and the real sky, the sun and moon discs, the
   eclipse / hawk / sugar bush showings, the season tick and the time-lapse clock. install(K) gets what it needs from the engine
   (plain values, and getters for the few that change: K.cam, K.wxMod, K.wxShown) and returns what the engine uses back. */
(function (G) {
  'use strict';
  function install(K) {
    const { THREE, DATA, PI, SCENE, CAVE, D, PID, SKY, camera, core, coreCall, hemi, hud, isPhone, me, myEnt, q, say, scene, send, showWeather, sun, zoneHere } = K;
        /* ---------- DAY AND NIGHT (2026-10-07: "Add an orbiting sun that orbits the globe once every 24 hours make it dark
           ashvale as of one hour ago is sunset"; "Have the sun create the shadows on the ground"). The sun circles the planet's
           equator once every two hours of real time; at SUN_EPOCH it set over Ashvale (90 degrees west of it) and it moves west 360 degrees a
           day - the Atlas uses the same rule (src/earth.js). Where you stand: its height above your horizon sets the daylight,
           the sky and the light's colour, and the light (with the shadows) comes from its direction; under the horizon a faint
           bluish moon, opposite it, casts the shadows. */
        const SUN_EPOCH = 1791353761, DAY_S = 7200;
        /* THE YEAR (2026-10-07): 365 game days from year 1, day 1 at SUN_EPOCH; the axis leans, so the sun climbs and sinks
           through the year and the hemispheres take turns at summer (the maths: the seasons module, its own inscription) */
        const SKYM = (() => { try { const SM = G.ASH3D && G.ASH3D.get && G.ASH3D.get('sky'); return SM && SM.create ? SM.create({ epoch: SUN_EPOCH, dayS: DAY_S, north: (DATA.globecfg || {}).north }) : null; } catch (e) { return null; } })();   /* sun, moon, eclipses (src/sky.js) */
        const NS = (DATA.globecfg || {}).north === -1 ? -1 : 1;   /* the world's north: the globe's -z (2026-10-07: the northern hemisphere) */
        const SEASONS = (() => { try { const SM = G.ASH3D && G.ASH3D.get && G.ASH3D.get('seasons'); return SM && SM.create ? SM.create({ epoch: SUN_EPOCH, dayS: DAY_S }) : null; } catch (e) { return null; } })();
        const SUNL = { dark: 0, dir: [-0.45, 0.8, 0.3], key: '', b: null, lonA: null, base: new THREE.Color(SKY), col: new THREE.Color(), night: new THREE.Color(), phase: null };
        if (SCENE.lampQuery) SCENE.lampQuery((x, y) => core.lampLit ? core.lampLit(x, y) : true);
        const NEW_SKY = new THREE.Color(0x1a2434), NIGHT_SKY = new THREE.Color(0x2a3a52), DUSK_SKY = new THREE.Color(0xd8865a), SUNC = new THREE.Color(0xfff0d6), DUSKC = new THREE.Color(0xffa060), MOONC = new THREE.Color(0x9fb4ff);
        function sphereAt(x, y) { const S0 = core.M.sphereAt; if (!S0) return null; const u = S0(x + 0.5, y + 0.5); if (!u) return null; return [u, S0(x + 1.5, y + 0.5), S0(x + 0.5, y + 1.5)]; }   /* any face of the open globe (world.js sphereAt goes through the net) */
        function sunAt(tms) {   /* the sun's direction from the planet's centre */
          if (SUNL.lonA == null) { const a = sphereAt(22, 52); SUNL.lonA = a ? Math.atan2(a[0][1], a[0][0]) : 0; }   /* Ashvale's longitude (by the well) */
          const L = SUNL.lonA - Math.PI / 2 - 2 * Math.PI * ((tms / 1000 - SUN_EPOCH) / DAY_S);
          const dl = SEASONS ? SEASONS.declination(tms) : 0, cd = Math.cos(dl);   /* north or south of the equator by the time of year */
          return [Math.cos(L) * cd, Math.sin(L) * cd, Math.sin(dl)];
        }
        /* THE MOON KEEPS GAME TIME (2026-10-07: "the moon cycle ... should operate on game time"): new to new in 29.53 GAME days -
           the Earth's month, scaled like the day - about 12.4 moons a game year; a new moon on day 1 of year 1 (SUN_EPOCH) */
        const MOON_P = 29.530588853;
        function moonAt(tms, s) {   /* {v: its direction, lit: 0 at new moon .. 1 at full} */
          let ph = (((tms / 1000 - SUN_EPOCH) / DAY_S) % MOON_P) / MOON_P; if (ph < 0) ph += 1; const a = 2 * Math.PI * ph, c = Math.cos(a), si = Math.sin(a);
          return { v: [s[0] * c - s[1] * si, s[0] * si + s[1] * c, s[2]], lit: (1 - c) / 2, phase: ph };   /* s turned east by the phase */
        }
        const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
        /* THE STARS: a fixed sky of 1600 points round the camera, shown at night - brightest on a clear moonless night, faint under a
           full moon, gone by day, underground and under cloud */
        const STARS = { pts: null };
        const SKYV = { v: null, basis: new THREE.Matrix4(), rot: new THREE.Matrix4(), m: new THREE.Matrix4(), flipM: new THREE.Matrix4() };
        /* THE SUN AND THE MOON in the sky (2026-10-07: "Just like the stars are visible in the clear sky at night, so should the
           sun be and the moon, in their position from the Atlas"): two discs far out round the camera in the very directions that
           light the world (the Atlas's sun, the real moon's phase); the moon is drawn lit on its sun side, faint by day, and both
           hide under thick weather and underground */
        const BODIES = { sun: null, moon: null, mph: -1, cv: null };
        function bodyTex(draw) { const cv = document.createElement('canvas'); cv.width = cv.height = 96; draw(cv.getContext('2d'), cv); const t = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return { t, cv }; }
        /* the moon lit by the sun, truly (2026-10-07: the lit side faced away from the sun): drawn with the sunlight coming from the
           disc's +x side at the real angle between them in the sky (e: 0 = new, the sun behind it; pi = full), and the disc is turned
           every frame so that +x points at the sun on the screen */
        /* THE MOON'S FACE (2026-10-07: "the moon should have some sort of moon like texture"): the near side as we know it - the dark
           maria where they are on our moon (Procellarum, Imbrium, Serenitatis, Tranquillitatis, Crisium ...) and the bright young
           craters with Tycho's rays - drawn from their selenographic places, north up; no picture to fetch */
        const MARIA = [[-57, 18, 24], [-16, 33, 15], [18, 28, 9], [31, 8, 11], [59, 17, 6], [51, -8, 9], [35, -15, 5.5], [-17, -21, 9], [-39, -24, 5], [-30, 57, 6], [0, 56, 6], [30, 57, 6], [4, 13, 4], [-5, -4, 3.5], [-60, -2, 7], [-43, 4, 6]];
        const CRATERS = [[-11, -43, 1.6, 1], [-20, 9.6, 1.7, 0.75], [-38, 8, 1, 0.6], [-47.5, 23.7, 0.8, 0.9], [-9, -39, 0, 0], [26, -11, 1, 0.4]];
        function moonAlbedo(sx, sy) {   /* sx, sy: on the disc, north up, -1..1 */
          const lat = Math.asin(Math.max(-1, Math.min(1, sy))), cl = Math.cos(lat), lon = cl > 1e-4 ? Math.asin(Math.max(-1, Math.min(1, sx / cl))) : 0, R2D = 180 / Math.PI;
          const la = lat * R2D, lo = lon * R2D;
          let a = 0.8 + 0.06 * Math.sin(lo * 0.31 + la * 0.17) * Math.sin(la * 0.23 - lo * 0.11) + 0.04 * Math.sin(lo * 1.3) * Math.cos(la * 1.1);
          for (const m of MARIA) { const d = Math.hypot((lo - m[0]) * Math.cos(la / R2D), la - m[1]); if (d < m[2] * 1.25) a -= 0.3 * Math.min(1, (m[2] * 1.25 - d) / (m[2] * 0.45)); }
          a = Math.max(0.42, a);
          for (const c of CRATERS) { if (!c[2]) continue; const d = Math.hypot((lo - c[0]) * Math.cos(la / R2D), la - c[1]); if (d < c[2]) a += 0.28 * c[3] * (1 - d / c[2]); }
          { const d = Math.hypot((lo + 11) * Math.cos(la / R2D), la + 43), ang = Math.atan2(la + 43, lo + 11); if (d > 1.6 && d < 38) a += 0.07 * Math.max(0, Math.cos(ang * 9)) * (1 - d / 38); }   /* Tycho's rays */
          return Math.min(1.05, a);
        }
        /* lit from the side toward the sun (the disc's +x, turned to the sun on the screen by the sprite's rotation rot), the face kept
           north-up on the sky; in front of the sun its unlit side is a black disc exactly where it covers the sun's disc, and only
           there - the moon leaves the sun and is gone again (2026-10-07) */
        function drawMoon(e, rot, sunD, sunR) {
          const c = BODIES.cv.getContext('2d'), N = 96, R = 40, img = c.createImageData(N, N), Lx = Math.sin(e), Lz = -Math.cos(e), cr = Math.cos(rot), sr = Math.sin(rot);
          for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const nx = (x - N / 2 + 0.5) / R, ny = (y - N / 2 + 0.5) / R, r2 = nx * nx + ny * ny, o = (y * N + x) * 4; if (r2 > 1) continue;
            const nz = Math.sqrt(1 - r2), l = nx * Lx + nz * Lz, edge = Math.min(1, (1 - Math.sqrt(r2)) * R / 1.5);
            const qx = nx * cr + ny * sr, qy = -(-nx * sr + ny * cr);   /* this pixel on the sky, north up */
            const alb = moonAlbedo(qx, qy), lit = Math.max(0, Math.min(1, l * 6 + 0.5));
            const sh = lit + (1 - lit) * 0.05;
            const inSun = sunD != null ? Math.max(0, Math.min(1, (sunR - Math.hypot(nx - sunD, ny)) * R / 1.5)) : 0;   /* over the sun's disc: black */
            img.data[o] = 238 * alb * sh; img.data[o + 1] = 232 * alb * sh; img.data[o + 2] = 214 * alb * (sh + (1 - lit) * 0.04); img.data[o + 3] = 255 * edge * Math.max(inSun, 0.04 + 0.96 * lit);
          }
          c.putImageData(img, 0, 0); BODIES.moon.material.map.needsUpdate = true;
        }
        function skyBodies(sv, mv, day, M) {
          if (!BODIES.sun) {
            const sun = bodyTex(c => { const g = c.createRadialGradient(48, 48, 0, 48, 48, 48); g.addColorStop(0, 'rgba(255,255,244,1)'); g.addColorStop(0.28, 'rgba(255,246,200,1)'); g.addColorStop(0.36, 'rgba(255,214,120,0.55)'); g.addColorStop(1, 'rgba(255,190,90,0)'); c.fillStyle = g; c.fillRect(0, 0, 96, 96); });
            const moon = bodyTex(() => {}); BODIES.cv = moon.cv;
            const mk = t => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); sp.renderOrder = -1; sp.frustumCulled = false; scene.add(sp); return sp; };
            BODIES.sun = mk(sun.t); BODIES.moon = mk(moon.t);
          }
          const w = core.weatherOf(zoneHere()), clear = !w || w.kind === 'clear' ? 1 : Math.max(0, 1 - w.intensity / 70), D = Math.max(60, camera.far * 0.85), P = camera.position;
          const put = (sp, v, size, alpha) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; sp.position.set(P.x + v[0] / l * D, P.y + v[1] / l * D, P.z + v[2] / l * D); sp.scale.setScalar(D * size); sp.material.opacity = alpha; sp.visible = alpha > 0.01 && !CAVE.on; };
          const sUp = sv[1] / (Math.hypot(sv[0], sv[1], sv[2]) || 1), mUp = mv[1] / (Math.hypot(mv[0], mv[1], mv[2]) || 1);
          /* true sizes (2026-10-07: "the same scale as our planet is to the Earth"): each disc half a degree across, as ours are; the sun's
             glare round it is wider (the disc itself is 0.28 of its sprite) */
          put(BODIES.sun, sv, 0.00930 / 0.28, Math.max(0, Math.min(1, (sUp + 0.04) / 0.06)) * clear);
          const sl = Math.hypot(sv[0], sv[1], sv[2]) || 1, ml = Math.hypot(mv[0], mv[1], mv[2]) || 1, sn = [sv[0] / sl, sv[1] / sl, sv[2] / sl], mn = [mv[0] / ml, mv[1] / ml, mv[2] / ml];
          const cosE = Math.max(-1, Math.min(1, sn[0] * mn[0] + sn[1] * mn[1] + sn[2] * mn[2])), E = Math.acos(cosE);
          /* which way is the sun from the moon, on the screen: the sky's path from the moon toward the sun, in the camera's frame; and
             which way is north (up the sky) at the moon, to keep its face north up */
          const tg = [sn[0] - mn[0] * cosE, sn[1] - mn[1] * cosE, sn[2] - mn[2] * cosE];
          let rot = BODIES.moon.material.rotation || 0;
          if (Math.hypot(tg[0], tg[1], tg[2]) > 1e-6) { BODIES.v3 = BODIES.v3 || new THREE.Vector3(); BODIES.v3.set(tg[0], tg[1], tg[2]).transformDirection(camera.matrixWorldInverse); rot = Math.atan2(BODIES.v3.y, BODIES.v3.x); }
          BODIES.moon.material.rotation = rot;
          BODIES.nv = BODIES.nv || new THREE.Vector3(); BODIES.nv.set(-mn[0] * mn[1], 1 - mn[1] * mn[1], -mn[2] * mn[1]).transformDirection(camera.matrixWorldInverse);   /* up the sky from the moon */
          const face = rot - (Math.atan2(BODIES.nv.y, BODIES.nv.x) - Math.PI / 2);   /* the disc's +x against the sky's east-west */
          const mR = 0.00905 / 2, near = E < 0.012, sunD = near ? E / mR : null, sunR = near ? (0.0093 / 2) / mR : 0;   /* in moon radii */
          if (near || Math.abs(E - BODIES.mph) > 0.01 || Math.abs(face - (BODIES.face || 0)) > 0.04 || BODIES.near !== near) { BODIES.mph = E; BODIES.face = face; BODIES.near = near; drawMoon(E, face, sunD, sunR); }
          put(BODIES.moon, mv, 0.00905 / 0.833, Math.max(0, Math.min(1, (mUp + 0.03) / 0.06)) * clear * (0.35 + 0.65 * (1 - day)));
          /* a lunar eclipse: the moon in the planet's shadow goes dark copper */
          BODIES.moon.material.color.setRGB(1 - 0.45 * SUNL.lunar, 1 - 0.8 * SUNL.lunar, 1 - 0.88 * SUNL.lunar);
          BODIES.sun.renderOrder = -2; BODIES.moon.renderOrder = -1;   /* the moon passes in front of the sun */
        }
        /* THE REAL SKY (2026-10-07: "actual constellations in the sky ... And the Milky Way"): the stars to magnitude 5.5 in their
           true places, brightness and colour, and the Milky Way's glow, from d3-celestial (BSD-3, data/starmap.json), turned with the
           planet: the sky module's sid sets it, so the constellations rise and set with the game's day and the sun walks the zodiac
           through the year */
        const SM = DATA.starmap && DATA.starmap.stars ? DATA.starmap : null;
        function bvRGB(bv) {   /* a star's colour index to a tint: blue-white to orange */
          const t = Math.max(-0.4, Math.min(2, bv));
          return t < 0.4 ? [0.72 + 0.7 * (t + 0.4) * 0.35, 0.82 + 0.15 * (t + 0.4) / 0.8, 1] : [1, 1 - 0.32 * (t - 0.4) / 1.6, 1 - 0.65 * (t - 0.4) / 1.6];
        }
        function realSky() {
          const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.renderOrder = -3;
          const dirOf = (ra, dec) => { const a = ra * Math.PI / 180, d = dec * Math.PI / 180; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
          for (const [lo, hi, size] of [[-3, 2.0, isPhone ? 3.2 : 3.6], [2.0, 3.6, isPhone ? 2.2 : 2.5], [3.6, 9, isPhone ? 1.4 : 1.6]]) {
            const L = SM.stars.filter(r => r[2] / 10 >= lo && r[2] / 10 < hi), pos = new Float32Array(L.length * 3), col = new Float32Array(L.length * 3);
            L.forEach((r, i) => { const v = dirOf(r[0] / 10, r[1] / 10), m = r[2] / 10, b = Math.max(0.28, Math.min(1, 1.25 - 0.17 * m)), c = bvRGB(r[3] / 10); pos.set(v, i * 3); col.set([c[0] * b, c[1] * b, c[2] * b], i * 3); });
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
            pts.frustumCulled = false; pts.renderOrder = -3; grp.add(pts);
          }
          /* the Milky Way: its outline (five levels of brightness) painted soft onto a sky-sized sphere in the same frame */
          let mwMesh = null;
          if (typeof document !== 'undefined' && SM.mw && SM.mw.length) {
            const W = 2048, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
            if ('filter' in c) c.filter = 'blur(7px)';
            for (const [lvl, flat] of SM.mw) {
              const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] / 10, flat[i + 1] / 10]);
              for (let i = 1; i < pts.length; i++) { while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360; while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360; }   /* unwrapped across 0h */
              c.fillStyle = 'rgba(205,215,255,' + (0.045 + 0.012 * lvl) + ')';
              for (const sh of [-360, 0, 360]) { c.beginPath(); pts.forEach((p, i) => { const x = (p[0] + sh) / 360 * W, y = (1 - (p[1] + 90) / 180) * H; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.fill(); }
            }
            const tex = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
            const NA = 96, ND = 48, pos = [], uv = [], ind = [];
            for (let j = 0; j <= ND; j++) for (let i = 0; i <= NA; i++) { const ra = i / NA * 360, dec = -90 + j / ND * 180; pos.push(...dirOf(ra, dec)); uv.push(i / NA, j / ND); }
            for (let j = 0; j < ND; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, d = a + NA + 1, e = d + 1; ind.push(a, d, b, b, d, e); }
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind);
            mwMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
            mwMesh.frustumCulled = false; mwMesh.renderOrder = -4; grp.add(mwMesh);
          }
          scene.add(grp); return { grp, mw: mwMesh, rot: new THREE.Matrix4(), basis: new THREE.Matrix4(), sc: new THREE.Matrix4() };
        }
        function starsAt(night, moonK, SK, B) {
          if (SM && SK && B) {
            if (!STARS.real) STARS.real = realSky();
            const R = STARS.real, w = core.weatherOf(zoneHere()), clear = (TL.n > 1 || DEMO) ? 1 : !w || w.kind === 'clear' ? 1 : Math.max(0, 1 - w.intensity / 60);
            const o = Math.max(0, Math.min(1, (night - 0.5) / 0.4)) * (1 - 0.75 * moonK) * clear;
            R.grp.visible = o > 0.01 && !CAVE.on; if (!R.grp.visible) return;
            for (const ch of R.grp.children) ch.material.opacity = ch === R.mw ? o * 0.55 : o;
            R.basis.set(B.e[0], B.e[1], B.e[2], 0, B.u[0], B.u[1], B.u[2], 0, B.s[0], B.s[1], B.s[2], 0, 0, 0, 0, 1);   /* planet frame -> this place's (east, up, south) */
            R.rot.makeRotationZ(SK.sid); const D = Math.max(60, camera.far * 0.9);
            R.grp.matrix.makeTranslation(camera.position.x, camera.position.y, camera.position.z).multiply(R.sc.makeScale(D, D, D)).multiply(R.basis).multiply(R.rot);
            R.grp.matrixWorldNeedsUpdate = true;
            return;
          }
          if (!STARS.pts) {
            const n = 1600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let h = 2166136261;
            const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
            for (let i = 0; i < n; i++) {
              const y = 0.03 + 0.97 * rnd(), a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y), b = 0.55 + 0.45 * rnd(), warm = rnd();
              pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
              col[i * 3] = b * (warm > 0.8 ? 1 : 0.85); col[i * 3 + 1] = b * 0.9; col[i * 3 + 2] = b * (warm > 0.8 ? 0.75 : 1);
            }
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            STARS.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: isPhone ? 1.6 : 1.9, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
            STARS.pts.frustumCulled = false; STARS.pts.renderOrder = -1; scene.add(STARS.pts);
          }
          const w = core.weatherOf(zoneHere()), clear = !w || w.kind === 'clear' ? 1 : Math.max(0, 1 - w.intensity / 60);
          const o = Math.max(0, Math.min(1, (night - 0.5) / 0.4)) * (1 - 0.75 * moonK) * clear;
          STARS.pts.material.opacity = o; STARS.pts.visible = o > 0.01 && !CAVE.on;
          STARS.pts.position.copy(camera.position); STARS.pts.scale.setScalar(Math.max(60, camera.far * 0.9));
        }
        /* the season where you stand, every few seconds: the woods, the ground and the lakes follow it; the lakes freeze by their
           own latitude (core.M.setIce), refreshed each minute */
        const SEASON = { t: 0, key: '', ice: 0, name: '' };
        /* through the ice (2026-10-07): standing on a frozen lake when it thaws is a fall into it - a death, and what you carry sinks */
        const ICEWALK = { on: false };
        setInterval(() => {
          if (!me || me.dead || me.boat || !core.M.iceAt) return;
          const t = core.M.tileAt(me.x, me.y), wet = t === '~' || t === 'v';
          if (wet && core.M.iceAt(me.x, me.y)) { ICEWALK.on = true; return; }
          if (ICEWALK.on && wet && core.M.blocked(me.x, me.y)) { ICEWALK.on = false; coreCall(() => core.fallThrough && core.fallThrough(PID)); return; }
          if (!wet) ICEWALK.on = false;
        }, 400);
        /* the sky's clock: real time, unless a viewer asks for a time-lapse (?timelapse=N runs the sun, moon and seasons N
           times faster from now, ?skyday=D starts D game days on). Only this viewer's sky moves; nothing is sent */
        const TL = { n: Math.max(1, +q.get('timelapse') || 1), t0: Date.now(), off: (+q.get('skyday') || 0) * DAY_S * 1000 };
        const skyNow = () => TL.t0 + TL.off + (Date.now() - TL.t0) * TL.n;
        /* ?demo=eclipse (a showing for 2026-10-07; nothing else uses it): the sky jumps to a solar eclipse seen from Ashvale,
           the camera tilts from behind you into your eyes and up to the sun while the moon crosses it, then to a total lunar eclipse
           the same way, and round again. Only this viewer's sky and camera; nothing is sent. */
        const DEMO = q.get('demo') === 'eclipse' ? { i: -1, t: 0, list: [   /* the days: what Ashvale (60 N since the north was turned) can see */
          { day: 531.470, n: 6, dur: 104000, at: 'sun', zoom: 4.8, say: 'A solar eclipse over Ashvale (game day 531): the moon slides in across the sun from the side and away again.' },
          { day: 369.050, n: 17, dur: 104000, at: 'moon', zoom: 4.8, say: 'A total lunar eclipse (game day 369): the moon passes through the planet\'s shadow and turns copper.' },
          { day: 530.105, n: 4, dur: 42000, at: 'sun', zoom: 9.5, say: 'Sunset (game day 530).' },
          { day: 372.052, n: 4, dur: 42000, at: 'moon', zoom: 9.5, say: 'Moonrise (game day 372), just past full.' }] } : null;
        /* ?demo=hawk (a showing for 2026-10-08; never on the arcade, where it would hand out a ring): a hawk ring on, and a flight
           along the new road from Eastend to Saltmere and back, seen through the hawk's eyes looking ahead and a little down */
        const HDEMO = q.get('demo') === 'hawk' && !G.arcade ? { i: 0, ring: false, way: [] } : null;
        if (HDEMO) { for (let k = 0; k <= 10; k++) HDEMO.way.push([Math.round(74 + (378 - 74) * k / 10), Math.round(50 + (24 - 50) * k / 10)]); HDEMO.way = HDEMO.way.concat(HDEMO.way.slice(0, -1).reverse()); }
        /* ?demo=sugar (a showing for 2026-10-08; not on the arcade): the sugar bush, start to finish - peel wiigwaas off two
           birches, trade a deer hide to Ma'iingan for ojiitad, Migizi folds a biskitenaagan (the clock steps a day), tap two maples on
           sap days, Nookomis's quest at the sugar camp: sap, boil to syrup, boil to candy, the Quillwork makak */
        const SDEMO = q.get('demo') === 'sugar' && !G.arcade ? { on: 0 } : null;
        async function sugarDemo() {
          const wait = ms => new Promise(ok => setTimeout(ok, ms)), say = t => hud.chat(t, 'sys'), cheb = (x, y) => Math.max(Math.abs(me.x - x), Math.abs(me.y - y));
          const follow = (d, p) => { K.cam.tdist = d || 8; K.cam.tpitch = p || 0.5; };
          const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await wait(200); return f(); };
          const walk = async (x, y, r) => { send({ c: 'walk', x, y, run: true }); await until(() => cheb(x, y) <= (r || 1) || !me.path.length && cheb(x, y) <= 2, 45000); await wait(400); };
          const nb = (x, y) => { for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (!core.M.blocked(x + dx, y + dy)) return [x + dx, y + dy]; return [x, y]; };
          const work = async (x, y, extra) => { const s0 = nb(x, y); await walk(s0[0], s0[1], 0); send(Object.assign({ c: 'gather', x, y }, extra || {})); await wait(800); await until(() => !me.act, 9000); await wait(900); };
          const talk = async (id) => { const n = core.M.npcs.find(o => o.id === id); const s0 = nb(n.x, n.y); await walk(s0[0], s0[1], 0); send({ c: 'npc', id }); await wait(6500); hud.closeAll && hud.closeAll(); await wait(400); };
          const sapDays = () => { const now = skyNow(); for (let d = 0; d < 400; d++) { const t = now + d * DAY_S * 1000; if ([0, 1, 2, 3].every(k => SEASONS.sap(SEASON.lat, t + k * DAY_S * 1000).day)) return t; } return now; };
          const goto = (t) => { TL.t0 = Date.now(); TL.off = t - TL.t0; SEASON.key = ''; SEASON.t = 0; };
          const nextDay = () => goto(skyNow() + DAY_S * 1000);
          const trees = (k) => { const out = []; for (let y = 530; y < 560; y++) for (let x = 78; x < 106; x++) if (core.M.tileAt(x, y) === k && core.nodeAt(core.M.key(x, y)) && nb(x, y)[0] !== x + 0.5) { const o = nb(x, y); if (o[0] !== x || o[1] !== y) out.push([x, y]); } out.sort((a, b) => Math.hypot(a[0] - 92, a[1] - 545) - Math.hypot(b[0] - 92, b[1] - 545)); return out; };
          hud.showHelp && hud.showHelp(false); if (core.setWeather) coreCall(() => core.setWeather(zoneHere(), 'clear', 0, 100000));
          goto(sapDays()); await wait(3000); follow(9, 0.55);
          coreCall(() => { core.grantItem(PID, 'deer_hide', 1); core.grantItem(PID, 'pail', 1); core.grantItem(PID, 'tomahawk', 1); });   /* the bark wants a blade (2026-10-09) */
          say('The sugar bush, start to finish. A thaw after a frost: the sap is running.'); await wait(3500);
          const E = trees('E'), Mp = trees('M');
          say('A long press on a wiigwaasaatig (birch): Peel bark. Each birch gives once a year.');
          await work(E[0][0], E[0][1], { peel: 1 }); await work(E[1][0], E[1][1], { peel: 1 });
          say("Down to Ziibiing. Ma'iingan trades ojiitad (sinew) for a waawaashkeshiwayaan (deer hide).");
          await talk('maiingan');
          say('Migizi folds a biskitenaagan (birch bark sap bucket) from two wiigwaas and an ojiitad. It dries a day in its folds.');
          await talk('migizi');
          say('...the next day.'); nextDay(); await wait(2500);
          await talk('migizi');
          say('Up to the iskigamizigan (sugar camp). Nookomis is here while the sap runs.'); await walk(95, 548, 1);
          await talk('nookomis');
          say('A long press on an ininaatig (maple): Collect sap. One bucket per tree a day, one sap per bucket.');
          await work(Mp[0][0], Mp[0][1], { tap: 1 }); await work(Mp[1][0], Mp[1][1], { tap: 1 });
          say('One bucket of ziinzibaakwadwaaboo (maple sap) to Nookomis. She gives the bucket back.'); await talk('nookomis');
          const F = { x: 92, y: 543 };
          say('Boil the other at the fire: zhiiwaagamizigan (maple syrup), in the same bucket.'); await work(F.x, F.y);
          await talk('nookomis');
          say('Another day, another bucket of sap.'); nextDay(); await wait(2500); await work(Mp[2][0], Mp[2][1], { tap: 1 });
          say('Boil it twice: syrup, then ziinzibaakwadoons (candy). The bucket comes back empty.'); await work(F.x, F.y); await work(F.x, F.y);
          await talk('nookomis');
          const sl = me.inv.findIndex(x => x && x.id === 'quill_makak'); if (sl >= 0) { send({ c: 'equip', slot: sl }); await wait(1500); }
          follow(4, 0.3); say('The Quillwork makak, worn on the back. It carries more than any pack. Miigwech!');
        }
        function hawkDemoTick() {
          if (!HDEMO) return;
          if (!HDEMO.ring) {
            HDEMO.ring = true; coreCall(() => core.grantItem && core.grantItem(PID, 'ring_hawk', 1));
            setTimeout(() => { const slot = me.inv.findIndex(sl => sl && sl.id === 'ring_hawk'); if (slot >= 0) send({ c: 'equip', slot }); if (core.setWeather) coreCall(() => core.setWeather(zoneHere(), 'clear', 0, 100000)); hud.chat('A hawk flight over the new road, West End to Saltmere and back.', 'sys'); }, 1500);
            return;
          }
          if (!myEnt.hawk) return;
          const W = HDEMO.way[HDEMO.i % HDEMO.way.length];
          if (Math.max(Math.abs(me.x - W[0]), Math.abs(me.y - W[1])) <= 2 || !me.path.length) {
            if (Math.max(Math.abs(me.x - W[0]), Math.abs(me.y - W[1])) <= 2) HDEMO.i++;
            const N = HDEMO.way[HDEMO.i % HDEMO.way.length]; if (!me.path.length || HDEMO.sent !== HDEMO.i) { HDEMO.sent = HDEMO.i; send({ c: 'walk', x: N[0], y: N[1] }); }
          }
          const N = HDEMO.way[HDEMO.i % HDEMO.way.length], dx = N[0] + 0.5 - myEnt.root.position.x, dz = N[1] + 0.5 - myEnt.root.position.z;
          if (Math.hypot(dx, dz) > 0.5) { const want = Math.atan2(-dx, -dz); K.cam.tyaw = want + Math.round((K.cam.yaw - want) / (2 * PI)) * 2 * PI; }
          K.cam.tpitch = 0.45; K.cam.tdist = 11;
        }
        function demoTick(now) {
          if (!DEMO || !SUNL.sv) return;
          const cur = DEMO.list[DEMO.i];
          if (DEMO.i < 0 || now - DEMO.t > (cur ? cur.dur || 36000 : 0)) {
            DEMO.i = (DEMO.i + 1) % DEMO.list.length; DEMO.t = now; const L = DEMO.list[DEMO.i];
            TL.t0 = Date.now(); TL.off = (SUN_EPOCH + L.day * DAY_S) * 1000 - TL.t0; TL.n = L.n; SEASON.key = ''; SEASON.t = 0; hud.chat(L.say, 'sys');
            if (core.setWeather) coreCall(() => core.setWeather(zoneHere(), 'clear', 0, 100000));
            return;
          }
          const v = cur.at === 'sun' ? SUNL.sv : SUNL.mv, l = Math.hypot(v[0], v[1], v[2]) || 1, el = Math.asin(Math.max(-1, Math.min(1, v[1] / l))), yaw = Math.atan2(-v[0], -v[2]);
          const k = Math.min(1, (now - DEMO.t) / 9000), want = 0.1 - Math.max(0.05, el) / 1.07;   /* behind you, then up into your eyes, then up to it */
          const z = Math.min(1, Math.max(0, (now - DEMO.t - 9000) / 4000));
          K.cam.tyaw = K.cam.yaw = yaw; K.cam.tdist = K.cam.dist = 11 - (11 - (cur.zoom || 4.8)) * z * z * (3 - 2 * z); K.cam.tpitch = K.cam.pitch = 0.6 + (want - 0.6) * (k * k * (3 - 2 * k));   /* then the binoculars: zoom in on it */
        }
        /* a fast time-lapse (N of 2000 and up) holds the sun at noon where you stand, so the seasons run without day and night strobing */
        TL.noon = null;
        function sunTime(B) {
          const t = skyNow(); if (TL.n < 2000 || !B) return t;
          const DMS = DAY_S * 1000;
          if (TL.noon == null) { let best = -2; for (let k = 0; k < 96; k++) { const tt = t + k * DMS / 96, v = dot3(sunAt(tt), B.u); if (v > best) { best = v; TL.noon = tt; } } }
          return TL.noon + Math.floor((t - TL.noon) / DMS) * DMS;
        }
        function seasonTick(B) {
          if (!SEASONS) return;
          const real = Date.now(); if (real - SEASON.t < (TL.n > 1 ? 250 : 3000)) return; SEASON.t = real; const now = skyNow();
          const lat = NS * Math.asin(Math.max(-1, Math.min(1, B.u[2]))) * 180 / Math.PI, S = SEASONS.at(lat, now);
          const key = [S.name, S.day, Math.round(S.leaf.bud * 20), Math.round(S.leaf.grow * 20), Math.round(S.leaf.colourT * 20), Math.round(S.leaf.springT * 10), Math.round(S.snow * 20), S.frozen].join(':');   /* every game day: in the leaf fall each tree has its own day */
          if (key !== SEASON.key) { SEASON.key = key; const ta = performance.now(); if (SCENE.seasonApply) SCENE.seasonApply(S, SEASONS); SEASON.applyMs = performance.now() - ta; SEASON.applies = (SEASON.applies || 0) + 1; SEASON.snowy = S.name === 'winter' && S.snow > 0.3;   /* it snows only in winter (2026-10-07: "It shouldn't be snowing in the spring time") */ K.wxShown = ''; if (core.setSeason) core.setSeason({ snowy: SEASON.snowy, rice: !!S.rice, riceLate: S.p > 0.551 && S.p < 0.95 }); if (K.pineSnow) K.pineSnow(); showWeather(); }
          if (S.name !== SEASON.name) { if (SEASON.name) { const C = SEASONS.calendar(now); hud.chat(S.name.charAt(0).toUpperCase() + S.name.slice(1) + ' has come: year ' + C.year + ', day ' + C.day + '.', 'sys'); } SEASON.name = S.name; }
          /* a time-lapse runs the weather fast too: every few seconds each region this viewer hosts rolls again (for its season) */
          /* local time from the sun itself (2026-10-08): noon is when the sun stands highest here. SEASON.lon is the shift, in degrees,
             that the seasons module's clock wants (it reads the hour as the game day's fraction + lon / 360) */
          const gday = Math.floor((now / 1000 - SUN_EPOCH) / DAY_S);
          if (SKYM && SUNL.lonA != null && SEASON.noonDay !== gday) {
            const t0 = (SUN_EPOCH + gday * DAY_S) * 1000; let best = -2, bk = 48;
            for (let k = 0; k < 96; k++) { const v = SKYM.at(t0 + k * DAY_S * 1000 / 96, SUNL.lonA).sun, up = v[0] * B.u[0] + v[1] * B.u[1] + v[2] * B.u[2]; if (up > best) { best = up; bk = k; } }
            SEASON.noonDay = gday; SEASON.noon = bk / 96;
          }
          SEASON.lat = lat; SEASON.lon = SEASON.noon != null ? (0.5 - SEASON.noon) * 360 : Math.atan2(B.u[1], B.u[0]) * 180 / Math.PI;
          if (core.setNature && SEASONS.sap) { const C = SEASONS.calendar(now); core.setNature({ day: Math.floor((now / 1000 - SUN_EPOCH) / DAY_S), hours: 24 * (now / 1000 - SUN_EPOCH) / DAY_S, year: C.year, sap: SEASONS.sap(lat, now) }); }   /* the sugar bush rules: which day and year it is, and whether the sap runs */
          if (TL.n > 1 && SEASONS.temperature) {   /* a time-lapse shows the date, the temperature and the sap run (2026-10-08) */
            let el = document.getElementById('tl-clock');
            if (!el) { el = document.createElement('div'); el.id = 'tl-clock'; el.style.cssText = 'position:fixed;left:12px;top:12px;z-index:50;padding:6px 10px;border-radius:6px;background:rgba(10,14,20,.72);color:#f2ead8;font:600 15px/1.35 system-ui,sans-serif;pointer-events:none;white-space:pre'; document.body.appendChild(el); }
            const C = SEASONS.calendar(now), T = SEASONS.temperature(lat, now, SEASON.lon), sp = SEASONS.sap(lat, now), hr = ((C.dayFrac + SEASON.lon / 360) % 1 + 1) % 1;
            el.textContent = 'Year ' + C.year + ', day ' + C.day + '  ' + String(Math.floor(hr * 24)).padStart(2, '0') + ':' + String(Math.floor(hr * 1440) % 60).padStart(2, '0') + '  ' + S.name + '\n' + T.toFixed(1) + ' \u00b0C   night ' + sp.low.toFixed(0) + ' / day ' + sp.high.toFixed(0) + '\n' +
              (sp.season ? (sp.day ? 'The sap is running' : 'Sap season - no run today') + ' (' + sp.left + ' days to the buds)' : (S.snow > 0.3 ? 'snow on the ground' : 'leaves: ' + ({ budding: 'buds opening', bare: 'bare', falling: 'falling', turning: 'turning' }[S.leaf.stage] || S.leaf.stage)));
          }
          if (core.M.setIce && real - SEASON.ice > (TL.n > 1 ? 2000 : 60000)) { SEASON.ice = real; core.M.setIce(la => SEASONS.at(la, skyNow()).frozen); }
        }
        function dayTick() {
          const key = (me.x >> 3) + ':' + (me.y >> 3);
          if (key !== SUNL.key) { const a = sphereAt(me.x, me.y); SUNL.key = key; SUNL.b = a ? { u: nrm3(a[0]), e: nrm3(sub3(a[1], a[0])), s: nrm3(sub3(a[2], a[0])) } : null; }   /* up, game east (+x), game south (+y) */
          const B = SUNL.b; if (!B) return;
          seasonTick(B);
          demoTick(performance.now()); hawkDemoTick(); if (SDEMO && !SDEMO.on && SEASON.lat != null) { SDEMO.on = 1; sugarDemo().catch(e => hud.chat('Demo stopped: ' + e.message, 'sys')); }
          const now = sunTime(B);
          /* the sun and the moon from the sky module (true sizes and distances, eclipses); without it the old rule */
          const SK = SKYM ? (SUNL.lonA == null && sunAt(now), SKYM.at(now, SUNL.lonA)) : null;
          const s = SK ? SK.sun : sunAt(now), up = dot3(s, B.u), ex = dot3(s, B.e), so = dot3(s, B.s);
          /* a solar eclipse where you stand: the moon covers that much of the sun, and the day goes that much dark (2026-10-07) */
          const ecl = SK ? SKYM.solarCover(SK, B.u) : 0; SUNL.eclipse = ecl; SUNL.lunar = SK && SK.lunar ? SK.lunar.umbra : 0;
          const day = Math.min(1, Math.max(0, (up + 0.08) / 0.2)) * (1 - 0.96 * ecl * ecl), dusk = Math.max(0, 1 - Math.abs(up) / 0.18);   /* 1 by day, 0 by night; dusk near the horizon */
          /* the moon follows the real cycle and adds light when it is up. A moonless night is starlight (2026-10-07: "add stars
             to moonless [nights] so that it is at least navigable, but just barely"): a sky full of stars, and only just enough
             light to make out the ground */
          const M = SK ? { v: SKYM.moonFrom(SK, B.u), lit: (1 - Math.cos(SK.elong)) / 2, phase: SK.phase } : moonAt(now, s), mup = dot3(M.v, B.u), moonK = M.lit * Math.min(1, Math.max(0, (mup + 0.03) / 0.15)) * (1 - 0.85 * SUNL.lunar);   /* in the planet's shadow the moon gives little light */
          const lit = up > -0.02, d = lit ? [ex, Math.max(up, 0.06), so] : [dot3(M.v, B.e), Math.max(mup, 0.2), dot3(M.v, B.s)];
          const l = Math.hypot(d[0], d[1], d[2]); SUNL.dir = [d[0] / l, d[1] / l, d[2] / l];
          sun.intensity = lit ? 0.5 + 1.8 * day : 0.04 + 0.22 * moonK; sun.color.copy(lit ? SUNC : MOONC); if (lit && dusk > 0) sun.color.lerp(DUSKC, dusk * 0.8);
          hemi.intensity = 1.7 * day + (0.08 + 0.13 * moonK) * (1 - day); SUNL.dark = 1 - day;
          SUNL.sv = [ex, up, so]; SUNL.mv = [dot3(M.v, B.e), mup, dot3(M.v, B.s)];
          const nightK = Math.max(1 - day, ecl > 0.9 ? (ecl - 0.9) * 10 : 0);
          if (!SKYV.v && SKYV.v !== false) { try { const SVM = G.ASH3D && G.ASH3D.get && G.ASH3D.get('skyview'); SKYV.v = SVM && SVM.createSkyView && SK ? SVM.createSkyView(THREE, { starmap: SM, phone: isPhone }) : false; } catch (er) { console.warn('skyview', er && er.message); SKYV.v = false; } }
          if (SKYV.v && SK) {   /* the sky as its own little 3D scene (src/skyview.js): the sun, the moon lit by it, the stars */
            const w = core.weatherOf(zoneHere()), clear = (TL.n > 1 || DEMO) ? 1 : !w || w.kind === 'clear' ? 1 : Math.max(0, 1 - w.intensity / 60);
            SKYV.basis.set(B.e[0], B.e[1], B.e[2], 0, B.u[0], B.u[1], B.u[2], 0, B.s[0], B.s[1], B.s[2], 0, 0, 0, 0, 1); SKYV.rot.makeRotationZ(SK.sid); SKYV.m.copy(SKYV.basis).multiply(SKYV.flipM.makeScale(1, NS, NS)).multiply(SKYV.rot);
            const PLN = SKYM.planets ? SKYM.planets(now, SUNL.lonA).map(P => ({ name: P.name, mag: P.mag, color: P.color, dir: [dot3(P.dir, B.e), dot3(P.dir, B.u), dot3(P.dir, B.s)] })) : null; SKYV.pl = PLN;
            SKYV.v.update({ planets: PLN, bg: scene.background && scene.background.isColor ? scene.background : null, sun: SUNL.sv, moon: SUNL.mv, north: [NS * B.e[2], NS * B.u[2], NS * B.s[2]], starsM: SKYV.m, night: nightK, moonK, cover: ecl, lunar: SUNL.lunar, clear, under: CAVE.on });
            if (BODIES.sun) { BODIES.sun.visible = BODIES.moon.visible = false; } if (STARS.real) STARS.real.grp.visible = false; if (STARS.pts) STARS.pts.visible = false;
          } else {
            starsAt(nightK, moonK, SK, B);
            skyBodies(SUNL.sv, SUNL.mv, day, M);
          }
          if (SCENE.lampGlow) SCENE.lampGlow((SUNL.dark - 0.3) / 0.4);   /* glass warms with the dark; each lamp still waits for its guard */
          if (core.watchPhase) { const night = SUNL.dark >= 0.5; if (SUNL.phase == null) { SUNL.phase = night; core.watchPhase(night, true); } else if (SUNL.phase !== night) { SUNL.phase = night; core.watchPhase(night, false); } }
          /* the sky: the weather's colour (the weather module repaints it every frame), toward dusk orange and the night's blue
             (a moonlit night's deep blue, a moonless one near black) */
          const base = K.wxMod ? scene.background : SUNL.base;
          SUNL.night.copy(NEW_SKY).lerp(NIGHT_SKY, moonK);
          SUNL.col.copy(base).lerp(DUSK_SKY, dusk * 0.45 * day + dusk * 0.25).lerp(SUNL.night, 1 - day);
          scene.background.copy(SUNL.col); scene.fog.color.copy(SUNL.col);
        }
    return { DAY_S, DEMO, NS, SEASON, SEASONS, SKYM, SKYV, STARS, SUNL, SUN_EPOCH, TL, dayTick, dot3, moonAt, skyNow, sunAt, sunTime };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engsky', { api: 1, v: 1, needs: {} }, () => ({ api: 1, install }));
  if (typeof module !== 'undefined' && module.exports) module.exports = { install };
})(typeof globalThis !== 'undefined' ? globalThis : this);
