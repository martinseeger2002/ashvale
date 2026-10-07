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
    const TILE_COL = { i: 0x8a7a5a, '.': 0x5f9e3f, f: 0x62a242, F: 0x5c9a3e, ',': 0x4a7f34, T: 0x40702c, P: 0x3e6c2c, O: 0x43732e, p: 0xa98a5a, d: 0x8f7b5e, B: 0x7a5a36, g: 0xb8ac62, q: 0xa9b29c, v: 0x6a8a75, J: 0xd9e9f2,
      s: 0xcdbb84, '~': 0x6a7a55, H: 0x8a7a5a, X: 0x7d8a52, R: 0x7e7a6a, N: 0x7e7a6a, I: 0x7e7a6a, r: 0x6f7a55,
      W: 0x4a7a3a, M: 0x4c7030, Y: 0x36612a, U: 0xc9b47c, C: 0x74716e, G: 0x7e7a6a, A: 0x767a82, '^': 0x74716a, K: 0x6f8f4a };
    const ORE = { R: 0xc8702c, N: 0xd8d8d0, I: 0x8a4632, C: 0x33333c, G: 0xd9a930, A: 0x6f86c8 };
    const WATER_Y = -0.16;
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
      const geos = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8), cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6), cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12), cyl32: new THREE.CylinderGeometry(0.5, 0.5, 1, 32), cone: new THREE.ConeGeometry(0.5, 1, 6), pyr: new THREE.ConeGeometry(0.5, 1, 4) };
      const sets = new Map();
      return {
        add(kind, color, x, y, z, sx, sy, sz, ry, rx, rz) {
          if (!geos[kind] && kind.indexOf('arc:') === 0) {   /* a curved stone face: one block of n round a tower of radius r (unit height, radius 1, centred on +x) */
            const [, n, r] = kind.split(':').map(Number), th = 2 * Math.PI / n - 0.05 / r;
            geos[kind] = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true, Math.PI / 2 - th / 2, th);
          }
          const k = kind + ':' + color; if (!sets.has(k)) sets.set(k, { kind, color, ms: [] }); const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new THREE.Vector3(sx, sy, sz)); sets.get(k).ms.push(m); },
        finish(shadow) { for (const s of sets.values()) { const im = new THREE.InstancedMesh(geos[s.kind], lam(s.color), s.ms.length); s.ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow !== false; im.receiveShadow = true; group.add(im); } }
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
        const z = zone(cx, cy);
        const flat = adj.some(c => 'pHXFfdi'.indexOf(c) >= 0) || (z === 'village' && adj.some(c => c === '.'));
        if (flat) h *= z === 'village' ? 0.12 : 0.45;
        if (adj.some(c => c === 'B')) return 0.06;   /* a pier or bridge deck: just above the water (which lies at -0.16) */
        const wet = adj.filter(c => c === '~').length;
        if (wet === 4) h = -0.75 + h * 0.1; else if (wet) h = Math.min(h * 0.2, -0.3);
        else if (adj.some(c => c === 's')) h = Math.min(h, 0.02) * 0.5;
        return h;
      }
      let corner, surfOf = () => WATER_Y;
      if (!seeded) {
        const hc = new Float32Array((W + 1) * (H + 1));
        for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) hc[cy * (W + 1) + cx] = own(cx, cy);
        corner = (cx, cy) => hc[Math.max(0, Math.min(H, cy)) * (W + 1) + Math.max(0, Math.min(W, cx))];
      } else {
        const P = map.inPiece, chunks = new Map();
        const depth = (cx, cy) => {   /* tiles from this corner to the nearest tile outside the set pieces (0 = on the edge, max 8) */
          for (let r = 1; r <= 8; r++) for (let y = cy - r; y < cy + r; y++) for (let x = cx - r; x < cx + r; x++) {
            if (y !== cy - r && y !== cy + r - 1 && x !== cx - r && x !== cx + r - 1) continue;
            if (!P(x, y)) return r - 1;
          }
          return 8;
        };
        const fade = (cx, cy) => {   /* the ground as it will be drawn: worldgen outside the set pieces, own() inside them, mixed by distance to the piece edge */
          const sh = map.groundH(cx, cy);
          if (!(P(cx - 1, cy - 1) || P(cx, cy - 1) || P(cx - 1, cy) || P(cx, cy))) return sh;
          const a0 = at(cx - 1, cy - 1), a1 = at(cx, cy - 1), a2 = at(cx - 1, cy), a3 = at(cx, cy);
          if (a0 === '~' || a1 === '~' || a2 === '~' || a3 === '~' || a0 === 'v' || a1 === 'v' || a2 === 'v' || a3 === 'v') return sh;   /* water beds follow the world itself, even inside a set piece: a parcel of a sea town must not flatten the sea floor into a shelf */
          const t = depth(cx, cy) / 8, w = t * t * (3 - 2 * t);
          return own(cx, cy) * w + sh * (1 - w);
        };
        const wLevel = map.waterH() - 0.05;
        surfOf = (tx, ty) => {   /* where the water's skin stands over this tile, the same curve build draws and rings ride */
          const bed = (fade(tx, ty) + fade(tx + 1, ty) + fade(tx, ty + 1) + fade(tx + 1, ty + 1)) / 4;
          const ws = map.waterSurf ? map.waterSurf(tx, ty) : null;   /* rivers and lakes stand at their own level, flat (2026-10-04: "the rivers are dry"; a hollow's water "follows the contour") */
          if (ws != null) return Math.max(wLevel, ws + 0.2);   /* one height for a whole lake: never the bed's */
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
      return (map._hgt = { corner, heightAt, floor, surf: (x, y) => surfOf(x, y) });
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
          for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { C.setHex(TILE_COL[at(cx + dx, cy + dy)] || 0x5f9e3f); acc.r += C.r / 4; acc.g += C.g / 4; acc.b += C.b / 4; }
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
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(ind); g.computeVertexNormals();
        const terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
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
            parts.push({ geo: new THREE.PlaneGeometry(n, 1).rotateX(-Math.PI / 2), m: M4((run.x0 + run.x1) / 2, run.yy, y + 0.5, 1), col: tint(run.yy, bed) });
            run = null;
          };
          for (let x = X0; x <= X1; x++) {
            const w = x < X1 && isWt[(y - Y0) * RW + (x - X0)], yy = w ? surfC[(y - Y0) * RW + (x - X0)] : 0;
            if (run && (!w || Math.abs(yy - run.yy) > 1e-6)) flush();
            if (w && !run) run = { x0: x, x1: x + 1, yy }; else if (w) run.x1 = x + 1;
          }
          flush();
        }
        const skirt = (xa, ya_, xb, yb_) => {   /* a vertical quad closing the step where two water heights meet side by side */
          const ja = (ya_ - Y0) * RW + (xa - X0), jb = (yb_ - Y0) * RW + (xb - X0);
          if (!isWt[ja] || !isWt[jb]) return;
          const sa = surfC[ja], sb = surfC[jb]; if (Math.abs(sa - sb) < 0.004) return;
          const bed = (gH(Math.min(xa, xb) + 0.5, Math.min(ya_, yb_) + 0.5) + gH(Math.max(xa, xb) + 0.5, Math.max(ya_, yb_) + 0.5)) / 2;
          const midY = (sa + sb) / 2;
          if (xb !== xa) parts.push({ geo: new THREE.PlaneGeometry(1, Math.abs(sb - sa)).rotateY(Math.PI / 2), m: M4(Math.max(xa, xb) + 1, midY, ya_ + 0.5, 1), col: tint(midY, bed) });
          else parts.push({ geo: new THREE.PlaneGeometry(1, Math.abs(sb - sa)), m: M4(xa + 0.5, midY, Math.max(ya_, yb_) + 1, 1), col: tint(midY, bed) });
        };
        for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1 - 1; x++) skirt(x, y, x + 1, y);
        for (let y = Y0; y < Y1 - 1; y++) for (let x = X0; x < X1; x++) skirt(x, y, x, y + 1);
        if (parts.length) {
          const wm = new THREE.Mesh(mergeGeos(parts), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86, emissive: 0x0a2a4a }));
          wm.receiveShadow = true; group.add(wm); var waterMesh = wm;
        }
      }
      /* ---------- trees (instanced) */
      const treeKinds = {
        T: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.09, 0.14, 1.0, 6), m: M4(0, 0.5, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.62, 0), m: M4(0, 1.3, 0, 1, 0.85, 1) }, { geo: new THREE.IcosahedronGeometry(0.42, 0), m: M4(0.25, 1.7, 0.1, 1) }]), tc: 0x6a4a2a, cc: 0x4f8f34 },
        P: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.07, 0.11, 0.8, 6), m: M4(0, 0.4, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.ConeGeometry(0.62, 0.95, 7), m: M4(0, 0.95, 0, 1) }, { geo: new THREE.ConeGeometry(0.48, 0.8, 7), m: M4(0, 1.45, 0, 1) }, { geo: new THREE.ConeGeometry(0.3, 0.6, 7), m: M4(0, 1.9, 0, 1) }]), tc: 0x5a3c22, cc: 0x2f6a3a },
        O: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.14, 0.22, 1.1, 7), m: M4(0, 0.55, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.75, 0), m: M4(0, 1.45, 0, 1, 0.8, 1) }, { geo: new THREE.IcosahedronGeometry(0.5, 0), m: M4(-0.4, 1.35, 0.25, 1) }, { geo: new THREE.IcosahedronGeometry(0.5, 0), m: M4(0.4, 1.55, -0.2, 1) }]), tc: 0x5a3e24, cc: 0x5a7f2a },
        /* willow: a broad flat crown with curtains of twig hanging off it. maple: round and orange. yew: a dark column. */
        W: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.1, 0.18, 1.15, 6), m: M4(0, 0.57, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.66, 0).scale(1.15, 0.55, 1.15), m: M4(0, 1.42, 0, 1) }].concat([[0.52, 0.16], [-0.5, 0.1], [0.14, -0.5], [-0.18, 0.48]].map(([dx, dz]) => ({ geo: new THREE.ConeGeometry(0.16, 0.62, 6).rotateX(Math.PI).translate(dx, 1.12, dz), m: M4(0, 0, 0, 1) })))), tc: 0x6b5a38, cc: 0x87a752 },
        M: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.1, 0.16, 1.05, 6), m: M4(0, 0.52, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.68, 0), m: M4(0, 1.32, 0, 1, 0.92, 1) }, { geo: new THREE.IcosahedronGeometry(0.4, 0), m: M4(-0.34, 1.74, 0.16, 1) }]), tc: 0x6a4526, cc: 0xb8722c },
        Y: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.12, 0.2, 1.35, 6), m: M4(0, 0.67, 0, 1) }]), crown: mergeGeos([{ geo: new THREE.CylinderGeometry(0.5, 0.62, 0.6, 7), m: M4(0, 1.05, 0, 1) }, { geo: new THREE.ConeGeometry(0.55, 1.15, 7), m: M4(0, 1.5, 0, 1) }, { geo: new THREE.ConeGeometry(0.4, 0.95, 7), m: M4(0, 2.15, 0, 1) }]), tc: 0x4a3826, cc: 0x27502e },
        /* a saguaro for the desert (2026-10-06: "in the desert, we need to have cactuses not pine trees"): a ribbed
           column with two arms that turn up; it blocks the way like a tree but nothing chops it */
        U: { trunk: mergeGeos([{ geo: new THREE.CylinderGeometry(0.2, 0.23, 0.5, 8), m: M4(0, 0.25, 0, 1) }]), crown: mergeGeos([
          { geo: new THREE.CylinderGeometry(0.17, 0.2, 1.55, 8), m: M4(0, 1.2, 0, 1) }, { geo: new THREE.SphereGeometry(0.17, 8, 5, 0, 6.29, 0, 1.6), m: M4(0, 1.97, 0, 1) },
          { geo: new THREE.CylinderGeometry(0.1, 0.1, 0.36, 7).rotateZ(1.5708), m: M4(0.3, 1.05, 0, 1) }, { geo: new THREE.CylinderGeometry(0.1, 0.11, 0.55, 7), m: M4(0.46, 1.3, 0, 1) }, { geo: new THREE.SphereGeometry(0.1, 7, 4, 0, 6.29, 0, 1.6), m: M4(0.46, 1.57, 0, 1) },
          { geo: new THREE.CylinderGeometry(0.09, 0.09, 0.3, 7).rotateZ(1.5708), m: M4(-0.27, 1.4, 0, 1) }, { geo: new THREE.CylinderGeometry(0.09, 0.1, 0.42, 7), m: M4(-0.4, 1.6, 0, 1) }, { geo: new THREE.SphereGeometry(0.09, 7, 4, 0, 6.29, 0, 1.6), m: M4(-0.4, 1.81, 0, 1) }]), tc: 0x4f7a34, cc: 0x5f8f40 },
      };
      const treeList = { T: [], P: [], O: [], W: [], M: [], Y: [], U: [] };
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const c = at(x, y); if (treeList[c] && mine(x, y)) treeList[c].push({ x, y, i: K(x, y) }); }
      if (!seeded) for (let y = -7; y < H + 7; y++) for (let x = -7; x < W + 7; x++) {   /* the wild woods beyond the map edge (belong to the nearest region); seeded land has real woods there */
        if (x >= 0 && y >= 0 && x < W && y < H) continue;
        if (!inR(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)))) continue;
        if (hash2(x * 3 + 11, y * 5 + 7) < 0.5) continue;
        treeList[hash2(x, y * 3) < 0.55 ? 'P' : 'T'].push({ x, y, i: -1 });
      }
      const stumpGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.28, 7).translate(0, 0.14, 0);
      const allTreeTiles = [].concat(treeList.T, treeList.P, treeList.O, treeList.W, treeList.M, treeList.Y, treeList.U).filter(t => t.i >= 0);
      const stumps = new THREE.InstancedMesh(stumpGeo, lam(0x7a5a36), Math.max(1, allTreeTiles.length)); stumps.castShadow = true;
      const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), treeAt = new Map(), C = new THREE.Color();
      allTreeTiles.forEach((t, k) => { stumps.setMatrixAt(k, ZERO); t.stump = k; });
      group.add(stumps);
      const treeMeshes = [], quads = [[], [], [], []];
      /* a seeded chunk keeps its trees in 4 quadrants (32 m), so the engine can hide the woods beyond the fog (setView) */
      const qOf = t => chunk ? Math.min(1, (t.x - X0) >> 5) + 2 * Math.min(1, (t.y - Y0) >> 5) : 0;
      for (const k in treeKinds) for (let q = 0; q < (chunk ? 4 : 1); q++) {
        const L = treeList[k].filter(t => qOf(t) === q), tk = treeKinds[k]; if (!L.length) continue;
        const trunk = new THREE.InstancedMesh(tk.trunk, lam(tk.tc), L.length), crown = new THREE.InstancedMesh(tk.crown, lam(0xffffff), L.length);
        const tiles = new Float64Array(L.length);
        L.forEach((t, n) => {
          const jx = (hash2(t.x, t.y) - 0.5) * 0.3, jz = (hash2(t.y, t.x + 3) - 0.5) * 0.3, s = 0.85 + hash2(t.x + 5, t.y + 9) * 0.35 + (t.i < 0 ? 0.25 : 0);
          const px = t.x + 0.5 + jx, pz = t.y + 0.5 + jz, py = heightAt(px, pz) - 0.05;
          const m = M4(px, py, pz, s, s * (0.9 + hash2(t.x, t.y + 1) * 0.3), s, hash2(t.x + 2, t.y) * 6.28);
          trunk.setMatrixAt(n, m); crown.setMatrixAt(n, m);
          C.setHex(tk.cc).offsetHSL((hash2(t.x + 9, t.y) - 0.5) * 0.04, 0, (hash2(t.x, t.y + 9) - 0.5) * 0.12);
          if (chunk && map.snowH < 1e8) { const sn = Math.min(1, Math.max(0, (py - map.snowH + 55) / 27)) * 0.6; if (sn > 0) C.lerp(SNOWC, sn); }   /* snow on the crowns higher up */
          crown.setColorAt(n, C);
          tiles[n] = t.i; t.m = m; t.k = k; t.n = n; t.trunk = trunk; t.crown = crown;
          if (t.i >= 0) { treeAt.set(t.i, t); stumps.setMatrixAt(t.stump, ZERO); t.sm = M4(px, py, pz, 1); }
        });
        trunk.castShadow = crown.castShadow = true; trunk.receiveShadow = crown.receiveShadow = true;
        trunk.userData.pick = crown.userData.pick = { kind: 'tree', tiles };
        group.add(trunk, crown); treeMeshes.push(trunk, crown); quads[q].push(trunk, crown);
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
      const B = Batcher(group), anim = [];
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
        else if (o.k !== 'house' || hash2(o.x, o.y) < 0.6) {
          const chx = cx + (along ? o.w * 0.28 : S * 0.18), chz = cz + (along ? -S * 0.14 : o.h * 0.28);
          rg.add(mesh(new THREE.BoxGeometry(0.38, 1.4, 0.38), 0x6a625a, chx, base + WH * FL + rh * 0.55 + 0.25, chz));
          if (o.k === 'smithy') anim.push({ smoke: true, x: chx, y: base + WH + rh * 0.55 + 1.0, z: chz, parts: [] });
        }
        roofs.push({ g: rg, x0: o.x, y0: o.y, x1: o.x + o.w - 1, y1: o.y + o.h - 1, storeys });
      }
      /* the castle kit lives in its own module (src/castle.js) so a castle change is a small inscription */
      let CK = null; try { const CM = G.ASH3D && G.ASH3D.get && G.ASH3D.get('castle'); if (CM && CM.create) CK = CM.create({ THREE, B, Batcher, KitBatch, kitData, heightAt, group, pickables }); } catch (e) { console.warn('castle module', e && e.message); }
      const mounts = [];   /* items hung on walls: {obj, item, quest, untilStep} */
      const torches = [];
      const floorY = (o, y) => { const f = floor[o.y * W + o.x]; return isNaN(f) ? y : f; };
      const siteObjs = chunk ? [].concat(...map.sitesIn(X0, Y0, X1 - 1, Y1 - 1).map(st => st.objects)) : [];   /* tents and campfires of seeded camps */
      const objs = (chunk ? siteObjs : map.objects.filter(o => inR(o.x, o.y))).sort((a, b) => (b.enter ? 1 : 0) - (a.enter ? 1 : 0));
      for (const o of objs) {
        const x = o.x + (o.w || 1) / 2, z = o.y + (o.h || 1) / 2; let y = heightAt(x, z);
        switch (o.k) {
          case 'house': case 'shop': case 'smithy': building(o); break;
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
            torches.push({ f, f2, ph: hash2(o.x, o.y) * 10, x, y, z });
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
          case 'campfire': {
            for (let k = 0; k < 4; k++) B.add('box', 0x5a3c24, x, y + 0.08, z, 0.7, 0.1, 0.1, k * Math.PI / 4);
            for (let k = 0; k < 6; k++) B.add('box', 0x6a6a6a, x + Math.cos(k) * 0.45, y + 0.07, z + Math.sin(k) * 0.45, 0.16, 0.14, 0.16, k);
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xff8a20 })); f.position.set(x, y + 0.35, z); group.add(f); torches.push({ f, ph: 1, x, y, z });
            break;
          }
        }
      }
      /* fences: a post on every F tile, rails to F neighbours east and south */
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        if (at(x, y) !== 'F' || !mine(x, y)) continue;
        const px = x + 0.5, pz = y + 0.5, py = heightAt(px, pz);
        B.add('box', 0x6a4a2a, px, py + 0.38, pz, 0.12, 0.76, 0.12);
        if (at(x + 1, y) === 'F') for (const ry of [0.28, 0.58]) B.add('box', 0x8a6a40, px + 0.5, py + ry, pz, 1.0, 0.07, 0.05);
        if (at(x, y + 1) === 'F') for (const ry of [0.28, 0.58]) B.add('box', 0x8a6a40, px, py + ry, pz + 0.5, 0.05, 0.07, 1.0);
      }
      /* flowers, grass tufts and ferns */
      const FL = [0xe04040, 0xf0d040, 0xf4f4f4, 0xb060d0, 0xff8a3a];
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        if (!mine(x, y)) continue;
        const c = at(x, y), r = hash2(x * 5 + 1, y * 7 + 2);
        if (c === 'K') { B.add('box', 0x8c897e, x + 0.5, heightAt(x + 0.5, y + 0.5) + 0.65, y + 0.5, 0.5, 1.3 + r * 0.9, 0.42, r * 6); continue; }   /* standing stones and ruin walls (seeded land) */
        if (c === '^') { if (r < 0.4) B.add('pyr', 0x76736b, x + 0.5, heightAt(x + 0.5, y + 0.5) + 0.5, y + 0.5, 1.4, 1 + r * 2, 1.4, r * 6); continue; }   /* mountain rock */
        if (c === 'f') for (let k = 0; k < 5; k++) { const fx = x + 0.2 + hash2(x + k, y) * 0.6, fz = y + 0.2 + hash2(x, y + k) * 0.6, fy = heightAt(fx, fz); B.add('box', 0x3a7a2a, fx, fy + 0.08, fz, 0.03, 0.16, 0.03); B.add('box', FL[(x + y + k) % 5], fx, fy + 0.18, fz, 0.09, 0.07, 0.09); }
        else if ((c === '.' || c === ',') && r < 0.28) { const fx = x + 0.2 + hash2(x, y + 2) * 0.6, fz = y + 0.2 + hash2(x + 2, y) * 0.6; B.add('cone', c === ',' ? 0x3a6a26 : 0x4a8a30, fx, heightAt(fx, fz) + 0.1, fz, 0.22, 0.22, 0.22, r * 9); }
        else if (c === ',' && r > 0.965) { const fx = x + 0.3 + hash2(x, y + 7) * 0.4, fz = y + 0.3 + hash2(x + 7, y) * 0.4, fy = heightAt(fx, fz); B.add('cyl6', 0xe8e0c8, fx, fy + 0.05, fz, 0.05, 0.1, 0.05); B.add('cone', 0xb83a2a, fx, fy + 0.12, fz, 0.14, 0.07, 0.14); }
      }
      B.finish();
      /* fishing spots: rippling rings */
      const spots = [];
      for (const [i, n] of map.nodes) if (n.kind === 'fish' && inR(n.x, n.y) && mine(n.x, n.y)) {
        const g = new THREE.Group(); g.position.set(n.x + 0.5, wsurf(n.x, n.y) + 0.02, n.y + 0.5); group.add(g);   /* sit on the water's actual skin, sea or pond */
        const rings = [0, 1, 2].map(k => { const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.7, depthWrite: false })); g.add(r); return r; });
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8), new THREE.MeshBasicMaterial({ visible: false })); p.userData.pick = { kind: 'node', i }; g.add(p); pickables.push(p);
        spots.push({ rings, ph: hash2(n.x, n.y) * 3 });
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
        dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); },
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
          if (t) { t.trunk.setMatrixAt(t.n, on ? ZERO : t.m); t.crown.setMatrixAt(t.n, on ? ZERO : t.m); t.trunk.instanceMatrix.needsUpdate = t.crown.instanceMatrix.needsUpdate = true; stumps.setMatrixAt(t.stump, on ? t.sm : ZERO); stumps.instanceMatrix.needsUpdate = true; return; }
          const r = rockAt.get(i); if (r) r.ore.visible = !on;
        },
        update(dt, time) {
          for (const t of torches) { const s = 0.85 + 0.15 * Math.sin(time * 13 + t.ph) + 0.08 * Math.sin(time * 31 + t.ph * 2); t.f.scale.set(1, s, 1); if (t.f2) t.f2.scale.set(1, s, 1); }
          for (const L of lights) L.intensity = 2.6 + Math.sin(time * 11 + L.position.x) * 0.4;
          for (const s of spots) s.rings.forEach((r, k) => { const p = ((time * 0.6 + s.ph + k / 3) % 1); r.scale.setScalar(0.6 + p * 2.2); r.material.opacity = 0.75 * (1 - p); });
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
        const g = mm.getContext('2d'), MC = { '.': '#4e8a32', f: '#4e8a32', F: '#6a4a2a', ',': '#3e7428', p: '#a08458', d: '#857254', B: '#6e4f2e', g: '#a99d58', q: '#9aa38d', v: '#3f7ab8', J: '#d4e6f0', s: '#c4b07a', '~': '#2f6aa8', H: '#8a6a50', X: '#7a6a5a', R: '#6a6a66', N: '#6a6a66', I: '#6a6a66', r: '#6a6a66', T: '#2a5a1e', P: '#22501e', O: '#2e5a1c', W: '#5d7f3a', M: '#8a5a26', Y: '#1f4722', U: '#c4b07a', C: '#4a4a52', G: '#8a7a4a', A: '#6a7488', '^': '#77736a', K: '#8a877c' };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at(X0 + x, Y0 + y); g.fillStyle = MC[c] || '#4e8a32'; g.fillRect(x * 4, y * 4, 4, 4); if ('TPOMWYU'.indexOf(c) >= 0) { g.fillStyle = c === 'U' ? '#3f6a2a' : '#183a12'; g.fillRect(x * 4 + 1, y * 4 + 1, 2, 2); } }
        for (const o of map.objects) if (o.k === 'house' || o.k === 'shop' || o.k === 'smithy') { const ox = o.x - X0, oy = o.y - Y0; g.fillStyle = '#b8a890'; g.fillRect(ox * 4, oy * 4, o.w * 4, o.h * 4); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.strokeRect(ox * 4 + 0.5, oy * 4 + 0.5, o.w * 4 - 1, o.h * 4 - 1); }
      }
      return mm;
    }
    return { api: 2, build, minimap, heights: map => heightsOf(map).heightAt, WATER_Y, see: SEE };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('scene', { api: 2, v: 1, needs: { three: 160 } }, sceneFactory);
})(typeof globalThis !== 'undefined' ? globalThis : this);
