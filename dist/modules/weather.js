/* ASHVALE 3D weather: what the weather core.js rolled for a zone LOOKS like - fog that closes in, driven rain,
   drifting snow. What weather DOES (to sight, range, fires, running) is rules.json "weather".kinds, read by core.js;
   this module only draws, and only what it is told to draw.
   Module contract (no imports, no top-level side effects beyond the one define call; three.js is passed in so it can
   be upgraded alone, and it registers itself the way scene.js does, so build.py can inline it as a plain script):
     const W = createWeather(THREE, {scene, camera, quality})     quality 'low' on phones: fewer particles
     W.set(kind, intensity, {instant})   kind: 'clear' | 'fog' | 'rain' | 'snow' (anything unknown = clear),
                                         intensity 0..1; it cross-fades to the new look over ~4 s unless {instant: true}
                                         strength shows as how much of the particle sheet is in the air, and as the fog
                                         and sky that come with it - not as translucent particles
     W.update(dt)                        once a frame, after the camera has settled: moves the particles, fades, re-anchors
     W.focus(vector3)                    the player's feet, every frame: the fog sheets lie at heights above it
     W.state() / W.dispose()             what it is showing now / take back every object the module added
   The KIND table is plain data: everything a kind looks like (sky colour, fog distance, how many particles, how fast
   they fall, the wind, the bank of weather ahead of the player) sits in its own lines, so a new kind (sandstorm, ash
   fall) is a table entry that reuses the streak system (rain) or the soft-flake system (snow). Nothing else is code.
   Cost: one draw call for the rain, one for the snow, one more while a bank is up. No per-frame allocations, and no
   texture from anywhere - the flake sprite is painted on a canvas here. */
(function (G) {
  'use strict';
  function createWeather(THREE, opts) {
    const O = opts || {}, scene = O.scene, camera = O.camera;
    if (!scene || !camera) throw new Error('weather: createWeather(THREE, {scene, camera, quality}) needs a scene and a camera');
    const LOW = O.quality === 'low';                       /* the phone budget: fewer particles, a smaller box */
    const SIZE = LOW ? 0.8 : 1;

    /* ---- the KIND table: the whole look of a kind of weather in one entry. The fog numbers are the ones engine.js
       already uses when this module is not loaded, so wiring the module in must not change how fog looks.
       bank = [colour, metres, opacity] of the soft bank of weather that hangs on the horizon ahead of the player:
       the storm cloud, the fog wall, the snow haze. It is one quad, so it costs one draw call and no geometry. */
    const KIND = {
      clear: { sky: '#a7c8e6', near: 24, far: 52, rain: 0, snow: 0, bank: ['#a7c8e6', 0, 0] },
      /* fog is sheets (2026-10-07: "Fog should be like sheets of fog parallel with the ground at a few different
         levels. Just giant ovals of transparent fog"): the air between them stays fairly clear, so the sheets read */
      fog: { sky: '#b8bec4', near: 9, far: 34, rain: 0, snow: 0, sheets: 1, bank: ['#b8bec4', 54, 0.35] },
      rain: {
        sky: '#7d8fa0', near: 14, far: 38, rain: 1, snow: 0, bank: ['#66727d', 40, 0.5],
        drops: LOW ? 600 : 1450, fall: 26, wind: [4.3, 1.4], len: [0.5, 1.15], colour: '#c3d4e4', alpha: 0.55
      },
      snow: {
        sky: '#dfe6ec', near: 10, far: 30, rain: 0, snow: 1, bank: ['#eef4f9', 40, 0.5],
        flakes: LOW ? 520 : 1150, fall: [0.55, 1.6], wind: [0.8, 0.3], sway: 0.85, size: 0.115, colour: '#ffffff', alpha: 0.85
      }
    };
    const FADE = 4;                                        /* seconds to reach a new look, unless instant */
    const AHEAD = 0.7;                                     /* of the box's own radius, how far in front of the camera the weather sits */
    const RAINR = LOW ? 8 : 12, RAINTOP = LOW ? 13 : 16;   /* metres out from the player, metres of falling room */
    const SNOWR = LOW ? 8.5 : 12, SNOWTOP = LOW ? 15 : 19;
    const FLOOR = 0.75;                                    /* metres above the floor of the box at which a drop has gone
                                                              under the ground out of sight, and starts again up top */
    const DYNUSE = THREE.DynamicDrawUsage != null ? THREE.DynamicDrawUsage : 35048;   /* 35048 = gl.DYNAMIC_DRAW, for the
                                                              case where build.py has not put the name in three_entry.js */
    const FIELDS = ['sr', 'sg', 'sb', 'near', 'far', 'rain', 'snow', 'sheets', 'br', 'bg', 'bb', 'bsize', 'balpha'];

    const SKYC = {}, BANKC = {};
    for (const k in KIND) { SKYC[k] = new THREE.Color(KIND[k].sky); BANKC[k] = new THREE.Color(KIND[k].bank[0]); }

    /* the look the scene had before this module touched it, so dispose() can hand it back exactly */
    const base = { near: scene.fog ? scene.fog.near : 24, far: scene.fog ? scene.fog.far : 52, fogColor: null, sky: null };
    if (scene.fog && scene.fog.color) base.fogColor = scene.fog.color.clone();
    if (scene.background && scene.background.isColor) base.sky = scene.background.clone();
    const baseSky = scene.fog && scene.fog.color ? scene.fog.color.clone() : base.sky ? base.sky.clone() : new THREE.Color(KIND.clear.sky);
    let madeFog = false;
    if (!scene.fog) { scene.fog = new THREE.Fog(baseSky.getHex(), base.near, base.far); madeFog = true; }

    let kind = 'clear', intensity = 0, p = 1;               /* what was asked for, and how far the fade has got (1 = there) */
    const cur = sample('clear', 0), from = sample('clear', 0), tgt = sample('clear', 0);

    /* one frame of numbers for "this kind at this strength", always measured from the clear day the scene started with */
    function sample(name, i) {
      const key = KIND[name] ? name : 'clear', K = KIND[key], clear = key === 'clear';
      const s = clear ? baseSky : SKYC[key], b = clear ? baseSky : BANKC[key];
      return {
        sr: baseSky.r + (s.r - baseSky.r) * i, sg: baseSky.g + (s.g - baseSky.g) * i, sb: baseSky.b + (s.b - baseSky.b) * i,
        near: base.near + ((clear ? base.near : K.near) - base.near) * i,
        far: base.far + ((clear ? base.far : K.far) - base.far) * i,
        rain: (K.rain || 0) * i, snow: (K.snow || 0) * i, sheets: (K.sheets || 0) * i,
        br: baseSky.r + (b.r - baseSky.r) * i, bg: baseSky.g + (b.g - baseSky.g) * i, bb: baseSky.b + (b.b - baseSky.b) * i,
        bsize: K.bank[1] * SIZE * i, balpha: K.bank[2] * i
      };
    }

    /* ---------------- rain: one LineSegments. Each drop is one line from its bottom end up the slant, so the streak
       is the motion itself; only the bottom end is moved and the top is written from it. Vertex colours make the
       bottom of a streak fainter than the top, which is what stops 1,450 lines reading as a wall of noise. */
    const RK = KIND.rain.drops | 0, SK = KIND.snow.flakes | 0;
    const rainPos = new Float32Array(RK * 6), rainCol = new Float32Array(RK * 6), rainDrop = new Float32Array(RK * 4);
    let rain = null;
    if (RK > 0) {
      const c = new THREE.Color(KIND.rain.colour), lo = KIND.rain.len[0], hi = KIND.rain.len[1];
      for (let k = 0; k < RK; k++) {
        const o = k * 6, st = k * 4;
        rainDrop[st] = lo + Math.random() * (hi - lo);                  /* length of this drop's streak, m */
        rainDrop[st + 1] = 0.75 + Math.random() * 0.5;                  /* and how much faster than the rest it falls */
        const l = rainDrop[st], j = 1 - 0.55 * Math.random();
        rainPos[o] = rainPos[o + 3] = (Math.random() * 2 - 1) * RAINR;
        rainPos[o + 2] = rainPos[o + 5] = (Math.random() * 2 - 1) * RAINR;
        rainPos[o + 1] = FLOOR + Math.random() * RAINTOP * 2;
        rainPos[o + 4] = rainPos[o + 1] + l;
        rainCol[o] = c.r * 0.55; rainCol[o + 1] = c.g * 0.55; rainCol[o + 2] = c.b * 0.6;      /* faint at the bottom */
        rainCol[o + 3] = c.r * j; rainCol[o + 4] = c.g * j; rainCol[o + 5] = c.b * j;          /* brightest at the top */
      }
      const g = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(rainPos, 3), ca = new THREE.BufferAttribute(rainCol, 3);
      pa.setUsage(DYNUSE);
      g.setAttribute('position', pa); g.setAttribute('color', ca);
      rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
        color: 0xffffff, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: true
      }));
      rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 2;   /* the box follows the camera: culling is pointless */
    }

    /* ---------------- snow: one Points, one round sprite painted here. Slow fall, per-flake speed and phase, so the
       sheet never sways in step. */
    const snowPos = new Float32Array(SK * 3), snowFlake = new Float32Array(SK * 4);
    let snow = null, flakeTex = null;
    if (SK > 0) {
      const lo = KIND.snow.fall[0], span = Math.max(0.01, KIND.snow.fall[1] - KIND.snow.fall[0]);
      for (let k = 0; k < SK; k++) {
        const o = k * 3, st = k * 4;
        snowPos[o] = (Math.random() * 2 - 1) * SNOWR; snowPos[o + 1] = FLOOR + Math.random() * SNOWTOP * 2;
        snowPos[o + 2] = (Math.random() * 2 - 1) * SNOWR;
        snowFlake[st] = lo + Math.random() * span;                      /* fall speed, m/s */
        snowFlake[st + 1] = 0.5 + Math.random() * 1.3;                  /* how hard and how fast it drifts about */
        snowFlake[st + 2] = Math.random() * 6.283;                      /* phase */
      }
      const g = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(snowPos, 3);
      pa.setUsage(DYNUSE);
      g.setAttribute('position', pa);
      flakeTex = paintFlake(THREE);
      snow = new THREE.Points(g, new THREE.PointsMaterial({
        color: new THREE.Color(KIND.snow.colour), map: flakeTex, size: KIND.snow.size, sizeAttenuation: true,
        transparent: true, opacity: 0, depthWrite: false, fog: true
      }));
      snow.frustumCulled = false; snow.visible = false; snow.renderOrder = 3;
    }

    /* ---------------- the bank: one soft quad on the horizon ahead of the player. Fog and cloud are volumes, and two
       draw calls of particles cannot give one; this is the cheap trick that makes fog have depth. Its material
       ignores the scene fog on purpose - that is what lets a fog bank show inside fog you can only see 16 m into. */
    const bankMat = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(KIND.fog.bank[0]) }, alpha: { value: 0 } },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      /* The alpha is a soft band whose widest line is the horizon (uv.y 0.5 is the eye-level plane, because the quad is
         centred on the camera height), so it whitens the ground beyond the fog and the storm darkens the distance - with
         no edge anywhere, which a flat quad always shows if you only fade it top and bottom.
         The colourspace line is not optional: this is the one material in the game that writes the framebuffer by hand,
         and the framebuffer is sRGB, so a linear colour straight out of THREE.Color comes out far too dark. It has to sit
         on a line of its own: three only resolves #include at the start of a line. */
      fragmentShader: 'uniform vec3 tint; uniform float alpha; varying vec2 vUv;\nvoid main() {\n  float a = 1.0 - smoothstep(0.22, 1.0, length(vec2((vUv.x - 0.5) * 1.6, (vUv.y - 0.5) * 3.2)));\n  gl_FragColor = vec4(tint, a * alpha);\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bankMat);
    bank.frustumCulled = false; bank.visible = false; bank.renderOrder = 1;

    /* ---------------- fog sheets: giant flat ovals of thin fog lying parallel with the ground at a few levels (ankle,
       waist, over the head, up in the trees). They sit still in the world and drift slowly with the wind, so you walk
       through and under them; one wraps round to the far side when you leave it behind. One InstancedMesh: one draw
       call. A sheet fades out within a few metres of the lens, so passing through one never shows a hard line. */
    const SHN = LOW ? 10 : 18, SHR = LOW ? 28 : 38, LEVELS = [0.5, 1.4, 2.8, 4.6];
    const sheetMat = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(KIND.fog.sky) }, alpha: { value: 0 }, t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; varying float vSeed;\nvoid main() {\n  vUv = uv;\n  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);\n  vW = w.xyz; vSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;\n  gl_Position = projectionMatrix * viewMatrix * w;\n}',
      /* a soft oval whose rim wanders (two slow sines round the edge), thinner in wisps across it, and gone near the lens */
      fragmentShader: 'uniform vec3 tint; uniform float alpha; uniform float t; varying vec2 vUv; varying vec3 vW; varying float vSeed;\nvoid main() {\n  vec2 q = (vUv - 0.5) * 2.0; float ang = atan(q.y, q.x);\n  float rim = 0.78 + 0.12 * sin(ang * 3.0 + vSeed) + 0.08 * sin(ang * 5.0 - vSeed * 1.7 + t * 0.05);\n  float a = 1.0 - smoothstep(0.15 * rim, rim, length(q));\n  a *= 0.62 + 0.38 * sin(vW.x * 0.21 + vW.z * 0.13 + t * 0.07 + vSeed) * sin(vW.z * 0.17 - vW.x * 0.09 + vSeed * 2.0);\n  a *= smoothstep(1.5, 7.0, distance(vW, cameraPosition));\n  gl_FragColor = vec4(tint, clamp(a, 0.0, 1.0) * alpha);\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    const sheetGeo = new THREE.PlaneGeometry(1, 1); sheetGeo.rotateX(-Math.PI / 2);
    const sheets = new THREE.InstancedMesh(sheetGeo, sheetMat, SHN);
    sheets.frustumCulled = false; sheets.visible = false; sheets.renderOrder = 1;
    if (DYNUSE && sheets.instanceMatrix.setUsage) sheets.instanceMatrix.setUsage(DYNUSE);
    const SH = [], feet = new THREE.Vector3(camera.position.x, camera.position.y - 9, camera.position.z);
    let feetSet = false;
    const shM = new THREE.Matrix4(), shQ = new THREE.Quaternion(), shS = new THREE.Vector3(), shP = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
    function placeSheet(o, anywhere) {
      const a = Math.random() * 6.283, r = anywhere ? Math.sqrt(Math.random()) * SHR : SHR * (0.8 + Math.random() * 0.2);
      o.x = feet.x + Math.cos(a) * r; o.z = feet.z + Math.sin(a) * r;
      o.lv = LEVELS[Math.floor(Math.random() * LEVELS.length)] * (0.85 + Math.random() * 0.3); o.y = feet.y + o.lv;
      o.w = 16 + Math.random() * 30; o.d = o.w * (0.35 + Math.random() * 0.35); o.rot = Math.random() * 3.1416;
    }
    for (let k = 0; k < SHN; k++) SH.push({});
    function stepSheets(d) {
      const K = KIND.rain.wind, vx = K[0] * 0.08, vz = K[1] * 0.08;      /* the fog creeps with the same wind, slowly */
      for (let k = 0; k < SHN; k++) {
        const o = SH[k];
        if (o.x == null) placeSheet(o, true);
        o.x += vx * d; o.z += vz * d;
        const dx = o.x - feet.x, dz = o.z - feet.z;
        if (dx * dx + dz * dz > SHR * SHR * 1.3 || Math.abs(o.y - feet.y - o.lv) > 10) placeSheet(o, false);   /* left behind */
        shP.set(o.x, o.y, o.z); shQ.setFromAxisAngle(UPV, o.rot); shS.set(o.w, 1, o.d);
        shM.compose(shP, shQ, shS); sheets.setMatrixAt(k, shM);
      }
      sheets.instanceMatrix.needsUpdate = true;
    }
    function focus(v) { if (v) { feet.set(v.x, v.y, v.z); if (!feetSet) { feetSet = true; for (const o of SH) o.x = null; } } }

    const box = new THREE.Group();
    box.add(bank);
    if (rain) box.add(rain);
    if (snow) box.add(snow);
    scene.add(box);
    scene.add(sheets);
    const fwd = new THREE.Vector3(), skyNow = new THREE.Color();
    const aim = new THREE.Vector3(), centre = new THREE.Vector3(camera.position.x, camera.position.y + 1.5, camera.position.z);
    let t = 0, gone = false;

    function paintFlake(T) {                                /* a small round sprite, painted on a canvas: no files, no network */
      if (typeof document === 'undefined' || !document.createElement) return null;      /* node: no canvas, plain squares */
      const cv = document.createElement('canvas'); cv.width = cv.height = 32;
      const c = cv.getContext('2d'); if (!c) return null;
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 15);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(16, 16, 15, 0, 6.2832); c.fill();
      const tex = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    /* ---------------- per frame */
    function update(dt) {
      if (gone) return;
      const raw = (typeof dt === 'number' && isFinite(dt)) ? Math.max(0, dt) : 0;
      const d = Math.min(0.1, raw);                        /* particles: a stalled frame must not teleport them */
      t += d;
      /* The cross-fade counts the TIME that passed, not the frames that were drawn. Counting frames made "4 s" mean
         12 s on a machine that spends 300 ms a frame and 4 s on one that spends 16 ms, so weather arrived at three
         different speeds on three different phones (handoff/fog_fade_slow_frames.md, the operator's fog check, 2026-10-02).
         The catch-up is capped at one whole fade: back from a hidden tab you land on the new look, you don't replay it. */
      if (p < 1) p = Math.min(1, p + Math.min(raw, FADE) / FADE);
      const s = p * p * (3 - 2 * p);                        /* smoothstep, so it eases in and settles */
      for (let k = 0; k < FIELDS.length; k++) { const f = FIELDS[k]; cur[f] = from[f] + (tgt[f] - from[f]) * s; }

      /* the box that carries the particles hangs on the camera: its floor is under the ground in front of the
         player, its roof a little over their head, so they are always inside the weather. It is centred a little way
         ahead of the lens rather than on it, because in this game the camera floats 9-12 m behind the player and a box
         centred on the lens leaves most of the weather behind them - which is exactly where the picture is not. The
         centre trails that aim with a short time constant, so turning the camera quickly drags the weather along
         instead of sweeping a thousand drops sideways across the screen. */
      const tall = cur.snow > cur.rain ? SNOWTOP : RAINTOP, rad = cur.snow > cur.rain ? SNOWR : RAINR;
      const H = Math.min(tall * 1.5, Math.max(tall, camera.position.y + 2));
      fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
      aim.set(camera.position.x + fwd.x * rad * AHEAD, camera.position.y + 1.5 - H, camera.position.z + fwd.z * rad * AHEAD);
      centre.lerp(aim, 1 - Math.exp(-d / 0.35));
      box.position.copy(centre);
      if (rain && rain.visible) stepRain(d, H, rad);
      if (snow && snow.visible) stepSnow(d, H, rad);
      if (!feetSet) feet.set(camera.position.x, camera.position.y - 9, camera.position.z);
      sheets.visible = cur.sheets > 0.02;
      if (sheets.visible) { sheetMat.uniforms.alpha.value = 0.62 * cur.sheets; sheetMat.uniforms.t.value = t; sheetMat.uniforms.tint.value.setRGB(cur.sr, cur.sg, cur.sb); stepSheets(d); }

      skyNow.setRGB(cur.sr, cur.sg, cur.sb);
      if (scene.fog) { scene.fog.color.copy(skyNow); scene.fog.near = cur.near; scene.fog.far = cur.far; }
      if (scene.background && scene.background.isColor) scene.background.copy(skyNow);
      if (rain) { rain.visible = cur.rain > 0.02; if (rain.visible) rain.material.opacity = KIND.rain.alpha || 0.55; }
      if (snow) { snow.visible = cur.snow > 0.02; if (snow.visible) snow.material.opacity = KIND.snow.alpha || 0.85; }
      bank.visible = cur.balpha > 0.02 && cur.bsize > 0.6;
      if (bank.visible) {
        bankMat.uniforms.tint.value.setRGB(cur.br, cur.bg, cur.bb);
        bankMat.uniforms.alpha.value = cur.balpha;
        bank.scale.set(cur.bsize, cur.bsize * 0.9, 1);
        bank.rotation.y = Math.atan2(fwd.x, fwd.z);
        /* the bank belongs to the camera, not to the particle box: it stays 0.55 of its own size ahead of the lens no
           matter where the box has drifted to. It is a child of the box, so that world point is written in local terms. */
        bank.position.set(camera.position.x + fwd.x * cur.bsize * 0.55 - box.position.x,
                          camera.position.y - box.position.y,
                          camera.position.z + fwd.z * cur.bsize * 0.55 - box.position.z);
      }
    }

    function stepRain(d, H, R) {
      const K = KIND.rain, wx = K.wind[0], wz = K.wind[1], sx = wx / K.fall, sz = wz / K.fall;   /* sx/sz: the slant */
      const live = Math.min(RK, Math.round(RK * cur.rain));    /* how much of the sheet is in the air. Strength is the
         fraction of drops falling, not how faint they are: half rain is half as many streaks at full brightness, which
         reads as a lighter shower, whereas dimming the whole sheet reads as a screen filter and vanishes on a phone. */
      const pos = rain.geometry.attributes.position.array;
      for (let k = 0; k < RK; k++) {
        const o = k * 6, st = k * 4;
        let x = pos[o], y = pos[o + 1], z = pos[o + 2];
        if (k >= live) {                                   /* more than this weather holds: wait under the ground,
                                                            clamped so the wind cannot walk them off, and rejoin up
                                                            top if the weather thickens again */
          x = Math.max(-R, Math.min(R, x)); z = Math.max(-R, Math.min(R, z)); y = -9;
        } else {
          y -= K.fall * rainDrop[st + 1] * d; x += wx * d; z += wz * d;
          if (y < FLOOR || x > R || x < -R || z > R || z < -R) {      /* landed, or blew out of the box: a new drop up top */
            x = (Math.random() * 2 - 1) * R * 0.92; z = (Math.random() * 2 - 1) * R * 0.92;
            y = H + Math.random() * 2;
          }
        }
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x + sx * rainDrop[st]; pos[o + 4] = y + rainDrop[st]; pos[o + 5] = z + sz * rainDrop[st];
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }

    function stepSnow(d, H, R) {
      const K = KIND.snow, wx = K.wind[0], wz = K.wind[1];
      const live = Math.min(SK, Math.round(SK * cur.snow));    /* the same rule as the rain: strength is how much of the
         sheet is falling, so half snow is half as many flakes in the air, not the same flakes drawn fainter. */
      const pos = snow.geometry.attributes.position.array;
      for (let k = 0; k < SK; k++) {
        const o = k * 3, st = k * 4, ph = snowFlake[st + 2] + t * (0.5 + snowFlake[st + 1] * 0.35);
        let x = pos[o], y = pos[o + 1], z = pos[o + 2];
        if (k >= live) {                                   /* the same waiting place as the rain */
          x = Math.max(-R, Math.min(R, x)); z = Math.max(-R, Math.min(R, z)); y = -9;
        } else {
          x += (wx + Math.sin(ph) * snowFlake[st + 1] * K.sway + Math.sin(ph * 0.37) * 0.25) * d;
          z += (wz + Math.cos(ph * 0.83) * snowFlake[st + 1] * K.sway) * d;
          y -= snowFlake[st] * d;
          if (y < FLOOR || x > R || x < -R || z > R || z < -R) {
            x = (Math.random() * 2 - 1) * R * 0.92; z = (Math.random() * 2 - 1) * R * 0.92;
            y = H + Math.random() * 2;
          }
        }
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }

    function set(k, i, o) {
      if (gone) return;
      const name = (typeof k === 'string' && KIND[k]) ? k : 'clear';    /* anything the table does not know is a clear day */
      let n = Number(i);
      if (!isFinite(n)) n = name === 'clear' ? 0 : 1;
      n = Math.max(0, Math.min(1, n));
      const v = sample(name, n);
      if (o && o.instant) {
        kind = name; intensity = n; p = 1;
        for (let f = 0; f < FIELDS.length; f++) { const y = FIELDS[f]; cur[y] = from[y] = tgt[y] = v[y]; }
        p = 1; update(0); return;
      }
      if (name === kind && n === intensity && p === 1) return;
      for (let f = 0; f < FIELDS.length; f++) { const y = FIELDS[f]; from[y] = cur[y]; tgt[y] = v[y]; }
      kind = name; intensity = n; p = 0;
    }

    function state() {
      return {
        kind: kind, intensity: intensity, fade: p, gone: gone,
        fog: { near: cur.near, far: cur.far, sky: '#' + skyNow.getHexString() },
        amounts: { rain: cur.rain, snow: cur.snow, bank: cur.balpha },
        /* in the air, which below full strength is fewer than the cloud holds - the rest wait under the ground */
        parts: { rain: rain && rain.visible ? Math.min(RK, Math.round(RK * cur.rain)) : 0,
                 snow: snow && snow.visible ? Math.min(SK, Math.round(SK * cur.snow)) : 0 },
        draws: (rain && rain.visible ? 1 : 0) + (snow && snow.visible ? 1 : 0) + (bank.visible ? 1 : 0) + (sheets.visible ? 1 : 0),
        sheets: sheets.visible ? SHN : 0
      };
    }

    function dispose() {
      if (gone) return;
      gone = true;
      const at = scene.children.indexOf(box);
      if (box.parent === scene && at >= 0) scene.children.splice(at, 1);   /* out the way it came in, keeping the order */
      if (madeFog && scene.fog) scene.fog = null;
      else if (scene.fog) {
        if (base.fogColor) scene.fog.color.copy(base.fogColor);
        scene.fog.near = base.near; scene.fog.far = base.far;
      }
      if (scene.background && scene.background.isColor && base.sky) scene.background.copy(base.sky);
      if (rain) { rain.geometry.dispose(); rain.material.dispose(); }
      if (snow) { snow.geometry.dispose(); snow.material.dispose(); }
      if (flakeTex) flakeTex.dispose();
      bank.geometry.dispose(); bankMat.dispose();
      if (sheets.parent) sheets.parent.remove(sheets); sheetGeo.dispose(); sheetMat.dispose();
      box.clear();
    }

    set('clear', 0, { instant: true });
    return { api: 1, KIND: KIND, set: set, update: update, state: state, dispose: dispose, focus: focus };
  }


  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('weather', { api: 1, v: 1, needs: { three: 160 } }, function () { return { api: 1, createWeather: createWeather }; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
