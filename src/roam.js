/* ASHVALE Atlas: ground view (module roam, api 1): you stand on the globe and walk it. three.js is passed in.
     const R = roam.createRoam({THREE, host, W, palette, chunk, shapes, fog, createModels, parts, quality})
   Streaming: the ground is 64 x 64 m chunks (atlas_chunk) in the plane of one ANCHOR face; chunks within Q.load metres
   exist, nearest first, built a few milliseconds per frame (Q.budget) so walking never waits; far ones are disposed.
   One draw call per chunk (terrain + props merged); chunks beyond Q.full draw only their LOD0 part; fog (src/fog.js
   ellipse shape) hides the edge. Nothing is allocated per frame in the steady state.
   Seams: the anchor plane is unfolded across face edges by worldgen, so the ground is continuous. When you are more than
   120 m inside another face, that face becomes the anchor: its chunks are built in the background and swapped in one
   frame (the view is the same land, rotated), so walking on never hits a wall of coordinates.
   World coordinates: three x = planar x - ox, z = -(planar y - oy), y = height. (ox, oy) = the frame origin.
   R: land(face, x, y), setActive(on), heightAt(px, py), pickGround(clientX, clientY) -> {x, y} | null, toWorld(px, py, v3),
      setLines(on), stats(), info(), frame {anchor, ox, oy}, player {x, y, yaw, h, anim}, onUpdate(fn) (the controller),
      readyAround(r) (chunks within r metres are built), canvas, camera, scene, renderer, Q */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1, needs: { three: 160 } };
  function createRoam(o) {
    const THREE = o.THREE, W = o.W, PAL = o.palette, host = o.host;
    const PHONE = o.quality === 'low';
    const Q = PHONE ? { load: 72, full: 24, fogN: 20, fogF: 50, budget: 5, ratio: 1.75, shadows: false }
      : { load: 92, full: 34, fogN: 26, fogF: 64, budget: 7, ratio: 2, shadows: true };
    if (o.q) Object.assign(Q, o.q);
    const shapes = o.shapes.create(PAL), B = o.chunk.create(W, shapes, PAL), SZ = B.SIZE;
    const col = h => new THREE.Color(h);

    /* ---- renderer, scene, light, water ---- */
    const renderer = new THREE.WebGLRenderer({ antialias: !PHONE || (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.ratio));
    renderer.shadowMap.enabled = Q.shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = renderer.domElement; canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    host.appendChild(canvas);
    const scene = new THREE.Scene(), SKY = col(PAL.sky);
    scene.background = SKY.clone(); scene.fog = new THREE.Fog(SKY.clone(), Q.fogN, Q.fogF);
    const fogShape = o.fog && o.fog.createFogShape ? o.fog.createFogShape(THREE) : null;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, Q.load + 80);
    scene.add(new THREE.HemisphereLight(0xe2efff, 0x4f5a34, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
    sun.castShadow = Q.shadows;
    if (Q.shadows) { sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 70; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; }
    scene.add(sun, sun.target);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(Q.load * 2.6, Q.load * 2.6).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: col(PAL.water), transparent: true, opacity: 0.82, emissive: col(PAL.waterEmissive), depthWrite: false }));
    water.position.y = W.WATER - 0.04; water.renderOrder = 1; water.receiveShadow = Q.shadows; scene.add(water);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), mats = [mat];
    const lineMat = new THREE.LineBasicMaterial({ color: col(PAL.border), transparent: true, opacity: 0.6, depthWrite: false });

    /* ---- the character: the game's model when the models module is there, else a stand-in ---- */
    const player = { x: 0, y: 0, yaw: 0, h: 0, anim: 'idle', obj: new THREE.Group(), H: null, height: 1.5 };
    try {
      if (o.createModels) {
        const M = o.createModels(THREE, { parts: o.parts || {}, onReject: (id, why) => console.warn('Atlas: part rejected ' + id + ' ' + why) });
        const pc = PAL.player, H = M.humanoid({ skin: pc.skin, hair: pc.hair, shirt: pc.shirt, pants: pc.pants, shoes: pc.shoes });
        H.object.scale.setScalar(0.8); H.object.traverse(m => { if (m.isMesh) m.castShadow = Q.shadows; });
        player.obj.add(H.object); player.H = H; player.height = H.height || 1.5;
      }
    } catch (e) { console.warn('Atlas: character model unavailable, using a stand-in', e && e.message); player.H = null; }
    if (!player.H) {
      const m2 = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 7), m2(0x3d6a9a)); body.position.y = 0.75;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), m2(0xe0b48c)); head.position.y = 1.32;
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.22), m2(0x5a4632)); legs.position.y = 0.19;
      player.obj.add(body, head, legs);
    }
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false }));
    blob.position.y = 0.03; blob.visible = !Q.shadows; player.obj.add(blob);
    scene.add(player.obj);

    /* ---- frames and chunks ---- */
    function newFrame(anchor, ox, oy) { const g = new THREE.Group(); scene.add(g); return { anchor, ox, oy, chunks: new Map(), group: g, lines: false }; }
    let F = newFrame(0, 0, 0), PF = null;
    const stat = { built: 0, msTotal: 0, msMax: 0, last: [], swaps: 0 };
    function chunkKey(cx, cy) { return cx * 100000 + cy; }
    function dropChunk(fr, k, c) {
      if (c.mesh) { fr.group.remove(c.mesh); c.mesh.geometry.dispose(); }
      if (c.line) { fr.group.remove(c.line); c.line.geometry.dispose(); }
      fr.chunks.delete(k);
    }
    function makeMesh(fr, c, out) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(out.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(out.col, 3, true));
      g.setIndex(new THREE.BufferAttribute(out.idx, 1));
      g.computeBoundingSphere();
      g.addGroup(0, out.far[4], 0);
      const m = new THREE.Mesh(g, mats);
      m.position.set(c.cx * SZ - fr.ox, 0, -(c.cy * SZ - fr.oy));
      m.castShadow = m.receiveShadow = Q.shadows; m.matrixAutoUpdate = false; m.updateMatrix();
      c.mesh = m; c.out = out; c.heights = out.heights; c.lod = -1;
      fr.group.add(m);
      if (fr.lines) addLines(fr, c);
    }
    function addLines(fr, c) {
      if (c.line || !c.out || !c.out.lines.length) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(c.out.lines, 3));
      const l = new THREE.LineSegments(g, lineMat); l.position.copy(c.mesh.position); l.matrixAutoUpdate = false; l.updateMatrix(); l.renderOrder = 2;
      c.line = l; fr.group.add(l);
    }
    /* chunks wanted around planar (px, py) of frame fr, nearest first; marks distances */
    const want = [];
    function plan(fr, px, py) {
      want.length = 0;
      const r = Q.load, cx0 = Math.floor((px - r) / SZ), cx1 = Math.floor((px + r) / SZ), cy0 = Math.floor((py - r) / SZ), cy1 = Math.floor((py + r) / SZ);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const dx = Math.max(cx * SZ - px, 0, px - (cx + 1) * SZ), dy = Math.max(cy * SZ - py, 0, py - (cy + 1) * SZ), d = Math.sqrt(dx * dx + dy * dy);
        if (d <= r) want.push(d * 1e7 + (cy - cy0) * 1000 + (cx - cx0), cx, cy);
      }
      return want;
    }
    /* LOD: terrain + LOD0 always; each 32 m quadrant's detail when that quadrant is within Q.full (one group per run) */
    function setLod(c, px, py) {
      let mask = 0;
      for (let q = 0; q < 4; q++) {
        const qx = c.cx * SZ + (q & 1) * 32, qy = c.cy * SZ + (q >> 1) * 32;
        const dx = Math.max(qx - px, 0, px - qx - 32), dy = Math.max(qy - py, 0, py - qy - 32);
        if (dx * dx + dy * dy < Q.full * Q.full) mask |= 1 << q;
      }
      if (mask === c.lod) return;
      c.lod = mask;
      const g = c.mesh.geometry, Qd = c.out.quad, Fd = c.out.far;
      g.clearGroups();
      let s0 = 0, e0 = c.out.nLod0;
      for (let k = 0; k < 8; k++) {
        const q = k & 3, near = (mask & (1 << q)) !== 0;
        if (k < 4 ? near : !near) continue;
        const a = k < 4 ? Fd[q] : Qd[q], b = k < 4 ? Fd[q + 1] : Qd[q + 1];
        if (a === b) continue;
        if (a === e0) e0 = b; else { g.addGroup(s0, e0 - s0, 0); s0 = a; e0 = b; }
      }
      g.addGroup(s0, e0 - s0, 0);
    }
    let job = null, jobFrame = null;
    function stream(budget, fr, px, py) {
      const t0 = performance.now();
      /* LOD and disposal for existing chunks */
      for (const [k, c] of fr.chunks) {
        const dx = Math.max(c.cx * SZ - px, 0, px - (c.cx + 1) * SZ), dy = Math.max(c.cy * SZ - py, 0, py - (c.cy + 1) * SZ), d = Math.sqrt(dx * dx + dy * dy);
        c.d = d;
        if (d > Q.load + 40) { if (job && jobFrame === fr && job.key === c.jobKey) job = null; dropChunk(fr, k, c); continue; }
        if (c.mesh) { setLod(c, px, py); c.mesh.visible = d < Q.fogF + 30; if (c.line) c.line.visible = c.mesh.visible && d < Q.fogF; }
      }
      while (performance.now() - t0 < budget) {
        if (!job) {
          const L = plan(fr, px, py); let best = -1, bk = 1e30;
          for (let i = 0; i < L.length; i += 3) { const k = chunkKey(L[i + 1], L[i + 2]); if (!fr.chunks.has(k) && L[i] < bk) { bk = L[i]; best = i; } }
          if (best < 0) return true;
          const cx = L[best + 1], cy = L[best + 2], c = { cx, cy, mesh: null, d: 0, jobKey: fr.anchor + ':' + cx + ':' + cy };
          fr.chunks.set(chunkKey(cx, cy), c); job = B.job(fr.anchor, cx, cy); job.c = c; jobFrame = fr;
        }
        const ts = performance.now(), fin = job.step(); job.cpu = (job.cpu || 0) + performance.now() - ts;
        if (fin) {
          const out = job.out, c = job.c; out.ms = +job.cpu.toFixed(1);
          if (jobFrame.chunks.get(chunkKey(c.cx, c.cy)) === c) makeMesh(jobFrame, c, out);
          stat.built++; stat.msTotal += out.ms; stat.msMax = Math.max(stat.msMax, out.ms); stat.last.push(out.ms); if (stat.last.length > 40) stat.last.shift();
          job = null;
        }
      }
      return false;
    }
    function readyAround(r, fr, px, py) {
      fr = fr || F; px = px == null ? player.x : px; py = py == null ? player.y : py;
      const L = plan(fr, px, py);
      for (let i = 0; i < L.length; i += 3) { if (L[i] / 1e7 > r) continue; const c = fr.chunks.get(chunkKey(L[i + 1], L[i + 2])); if (!c || !c.mesh) return false; }
      return true;
    }
    function heightAt(px, py) {
      const cx = Math.floor(px / SZ), cy = Math.floor(py / SZ), c = F.chunks.get(chunkKey(cx, cy));
      if (c && c.heights) return B.meshHeight(c.heights, px - cx * SZ, py - cy * SZ);
      return W.field(F.anchor, px, py)[0];
    }
    function toWorld(px, py, v) { v.set(px - F.ox, heightAt(px, py), -(py - F.oy)); return v; }
    function clearFrame(fr) { for (const [k, c] of fr.chunks) dropChunk(fr, k, c); scene.remove(fr.group); if (jobFrame === fr) job = null; }
    function land(face, x, y) {
      clearFrame(F); if (PF) { clearFrame(PF); PF = null; }
      F = newFrame(face, Math.round(x), Math.round(y)); F.lines = linesOn;
      player.x = x; player.y = y;
      /* the chunk under your feet right now, the rest streams */
      const cx = Math.floor(x / SZ), cy = Math.floor(y / SZ), c = { cx, cy, mesh: null, d: 0, jobKey: face + ':' + cx + ':' + cy };
      F.chunks.set(chunkKey(cx, cy), c); makeMesh(F, c, B.job(face, cx, cy).run());
      placePlayer();
    }
    /* frame change: build the new anchor's chunks hidden, then swap in one frame */
    let reT = 0;
    const FB3 = [0, 0, 0];
    function checkReanchor(dt) {
      reT += dt; if (reT < 0.5 && !PF) return; reT = 0;
      if (!PF) {
        const s = W.sample(F.anchor, player.x, player.y);
        if (s.face === F.anchor || s.seamD < 120) return;
        const xf = W.xform(F.anchor, s.face); if (!xf) return;
        W.fold(F.anchor, player.x, player.y, FB3);
        PF = newFrame(s.face, Math.round(FB3[1]), Math.round(FB3[2])); PF.xf = xf; PF.group.visible = false; PF.lines = linesOn;
      }
      const xf = PF.xf, nx = xf[0] * player.x - xf[1] * player.y + xf[2], ny = xf[1] * player.x + xf[0] * player.y + xf[3];
      if (!readyAround(Q.full + 20, PF, nx, ny)) return;
      /* swap */
      clearFrame(F); F = PF; PF = null; F.group.visible = true;
      const th = Math.atan2(xf[1], xf[0]);
      player.x = nx; player.y = ny; player.yaw += th;
      if (R.onReanchor) R.onReanchor(xf, th);
      stat.swaps++;
    }
    let linesOn = false;
    function setLines(on) {
      linesOn = !!on; F.lines = linesOn; if (PF) PF.lines = linesOn;
      for (const c of F.chunks.values()) { if (linesOn && c.mesh) addLines(F, c); if (c.line) c.line.visible = linesOn; }
      for (const c of F.chunks.values()) if (!linesOn && c.line) { F.group.remove(c.line); c.line.geometry.dispose(); c.line = null; }
    }
    const v3 = new THREE.Vector3();
    function placePlayer() {
      player.h = heightAt(player.x, player.y);
      player.obj.position.set(player.x - F.ox, player.h, -(player.y - F.oy));
      player.obj.rotation.y = player.yaw;
      water.position.x = Math.round(player.x - F.ox); water.position.z = Math.round(-(player.y - F.oy));
    }

    /* ---- picking: terrain only (the props are skipped by drawing range) ---- */
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), pickList = [];
    function pickGround(clientX, clientY) {
      const r = canvas.getBoundingClientRect(); ndc.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, camera);
      pickList.length = 0;
      for (const c of F.chunks.values()) if (c.mesh && c.mesh.visible) { c.mesh.geometry.setDrawRange(0, c.out.nTerrain); pickList.push(c.mesh); }
      const hit = ray.intersectObjects(pickList, false)[0];
      for (const c of F.chunks.values()) if (c.mesh) c.mesh.geometry.setDrawRange(0, Infinity);
      if (!hit) return null;
      return { x: hit.point.x + F.ox, y: -hit.point.z + F.oy };
    }

    /* ---- loop ---- */
    let active = false, raf = 0, last = 0, fps = 0, frames = 0, ctl = null, lastCalls = 0, lastTris = 0;
    function frame(now) {
      if (!active) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (now - (last || now)) / 1000)); last = now; frames++;
      if (dt > 0) fps = fps ? fps * 0.95 + 0.05 / dt : 1 / dt;
      tick(dt, R.boost ? 14 : Q.budget);
      renderer.render(scene, camera);
      lastCalls = renderer.info.render.calls; lastTris = renderer.info.render.triangles;
    }
    function tick(dt, budget) {
      if (ctl) ctl(dt);
      placePlayer();
      checkReanchor(dt);
      if (PF) { const xf = PF.xf; stream(budget * 0.5, PF, xf[0] * player.x - xf[1] * player.y + xf[2], xf[1] * player.x + xf[0] * player.y + xf[3]); }
      stream(PF ? budget * 0.5 : budget, F, player.x, player.y);
      sun.position.set(player.obj.position.x - 9, player.obj.position.y + 16, player.obj.position.z + 6); sun.target.position.copy(player.obj.position);
      if (fogShape) fogShape.focus(player.obj.position);
      if (player.H) player.H.update(dt);
    }
    function setActive(on) {
      if (on === active) return; active = on;
      if (on) { resize(); last = 0; raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
    }
    function resize() {
      const w = Math.max(1, host.clientWidth || innerWidth), h = Math.max(1, host.clientHeight || innerHeight);
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.2 ? 55 : 45; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    function info() {
      const s = W.sample(F.anchor, player.x, player.y), ll = W.toSphere(F.anchor, player.x, player.y);
      const cell = W.parcelAt(F.anchor, player.x, player.y), G = W.G;
      return { cell, cls: G.cls(cell), face: s.face, x: s.x, y: s.y, h: s.h, biome: W.BIOME[s.biome],
        lat: Math.asin(Math.max(-1, Math.min(1, ll[2]))) * 180 / Math.PI, lon: Math.atan2(ll[1], ll[0]) * 180 / Math.PI,
        tile: W.tileAt(s.face, Math.floor(s.x), Math.floor(-s.y)), anchor: F.anchor, seamD: s.seamD };
    }
    function stats() {
      let n = 0, vis = 0, tris = 0, mem = 0;
      for (const c of F.chunks.values()) if (c.mesh) { n++; if (c.mesh.visible) vis++; tris += c.out.tris; mem += c.out.pos.byteLength + c.out.col.byteLength + c.out.idx.byteLength; }
      return { calls: lastCalls, triangles: lastTris, fps: Math.round(fps), frames, chunks: n, chunksVisible: vis, chunksPending: F.chunks.size - n, trisLoaded: tris, memMB: +(mem / 1048576).toFixed(1),
        built: stat.built, msAvg: stat.built ? +(stat.msTotal / stat.built).toFixed(1) : 0, msMax: stat.msMax, msRecent: stat.last.slice(-10), swaps: stat.swaps, anchor: F.anchor, reanchoring: !!PF, Q };
    }
    const R = {
      api: 1, THREE, W, B, Q, PHONE, scene, camera, renderer, canvas, player, sun,
      get frame() { return F; }, land, setActive, heightAt, toWorld, pickGround, setLines, stats, info, readyAround, resize, tick,
      /* walkability on the anchor plane's 1 m cells (the same cells the path search uses; beyond a seam the neighbour's
         tile grid is turned, so its tiles are sampled at the anchor cells' centres) */
      walkable: (px, py) => W.walkable(F.anchor, Math.floor(px) + 0.5, Math.floor(py) + 0.5), tileAt: (px, py) => { W.fold(F.anchor, px, py, FB3); return W.tileAt(FB3[0], Math.floor(FB3[1]), Math.floor(-FB3[2])); },
      onUpdate(fn) { ctl = fn; }, setFog(n, f) { scene.fog.near = n; scene.fog.far = f; }, isActive: () => active,
      dispose() { setActive(false); clearFrame(F); if (PF) clearFrame(PF); renderer.dispose(); host.removeChild(canvas); window.removeEventListener('resize', resize); },
      v3
    };
    return R;
  }
  const api = { api: 1, createRoam };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('roam', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
