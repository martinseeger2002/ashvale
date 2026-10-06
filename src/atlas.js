/* ASHVALE Atlas: the app shell (module atlas, api 1). 2026-10-02: "a Google Earth type view where I can just
   explore the world", a standalone app, inscribed, as modular as possible. The planet (globeview) and the ground
   (roam + roam_ctl + roamhud, land from worldgen) are separate modules; this one only ties them together:
     planet: tap a parcel -> "Walk here" (or Random / Walk the core) -> the camera dives to the parcel, a short fade,
             and you stand on the ground of that parcel (the nearest walkable spot: shores for sea, the foot of a peak)
     ground: "Fly up" -> the camera climbs, fade, and the planet turns to where you were
   const app = atlas.start(host, {seed, n, quality, cell})     URL: ?seed= ?n= ?low ?nopieces ?cell=<id>
   Debug / test handle: window.ATLAS = {V, W, R, C, hud, land(cell | 'core' | {face, x, y}, instant, exact), flyUp(), state(), stats(), mode()}.
   Set pieces: the game's zone modules (zone.whisperwood, zone.village) are placed at the core centre as a PREVIEW of
   what the game will do (the game agent decides the final spot). */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1, needs: { three: 160, globe: 1, globeview: 1, worldgen: 1, atlas_chunk: 1, atlas_shapes: 1, roam: 1, roam_ctl: 1, roamhud: 1, fog: 1, models: 1, data: 1 } };
  function factory(deps) {
    function start(host, opts) {
      const O = opts || {}, q = new URLSearchParams(location.search), THREE = deps.three, DATA = deps.data || {};
      const quality = q.has('low') ? 'low' : O.quality || (/iPhone|iPad|Android|Mobile/i.test(navigator.userAgent) || Math.min(innerWidth, innerHeight) < 600 ? 'low' : null);
      const seed = q.get('seed') || O.seed || 'ashvale';
      host.style.position = host.style.position || 'fixed';
      const gHost = document.createElement('div'), rHost = document.createElement('div');
      gHost.style.cssText = rHost.style.cssText = 'position:absolute;inset:0;touch-action:none;overflow:hidden';
      rHost.style.display = 'none';
      host.appendChild(gHost); host.appendChild(rHost);
      let mode = 'planet', W0 = null;
      const V = deps.globeview.createGlobeView(THREE, deps.globe, { host: gHost, n: +q.get('n') || O.n || 128, seed, quality,
        title: 'ASHVALE Atlas', subtitle: 'tap a parcel, then Walk here',
        relief: (G0) => { W0 = deps.worldgen.createWorldgen(G0, { seed: q.get('wgseed') || seed }); return (c) => { const p = G0.planar(c), sm = W0.sample(p.face, p.x, p.y); return { h: sm.h, rock: sm.peakS }; }; },
        actions: [{ id: 'walk', label: 'Walk here' }], buttons: [{ id: 'random', label: 'Random' }, { id: 'landcore', label: 'Walk the core' }],
        onAction: (id, cell) => { if (mode !== 'planet') return; if (id === 'walk' && cell >= 0) land(cell); else if (id === 'random') land(randomCell()); else if (id === 'landcore') land('core'); } });
      const G = V.G, CL = G.classes();
      const W = W0 || deps.worldgen.createWorldgen(G, { seed: q.get('wgseed') || seed });
      let start0 = null;
      const zones = Object.keys(DATA).filter(k => k.indexOf('zone.') === 0).map(k => Object.assign({ id: k.slice(5) }, DATA[k]));
      if (zones.length && !q.has('nopieces')) {
        const sp = W.coreSpawn(), maxX = Math.max(...zones.map(z => z.origin[0] + z.size[0])), maxY = Math.max(...zones.map(z => z.origin[1] + z.size[1]));
        const gx = Math.floor(sp.x) - (maxX >> 1), gy = Math.floor(-sp.y) - (maxY >> 1);
        W.setSetPieces(W.piecesFromZones(zones, sp.face, gx, gy, { belt: { whisperwood: 90, village: 30 } }));
        const vz = zones.find(z => z.start); if (vz) start0 = { face: sp.face, x: gx + vz.start[0] + 0.5, y: -(gy + vz.start[1]) - 0.5 };
      }
      const parts = {}; for (const k in DATA) if (k.indexOf('part.') === 0) parts[k.slice(5)] = DATA[k];
      const R = deps.roam.createRoam({ THREE, host: rHost, W, palette: DATA.atlas_palette, chunk: deps.atlas_chunk, shapes: deps.atlas_shapes, fog: deps.fog,
        createModels: deps.models && deps.models.createModels, parts, quality });
      R.camera.far = R.Q.load + 220; R.camera.updateProjectionMatrix();
      const hud = deps.roamhud.create(rHost, { onAction: groundAction });
      let infoT = 0;
      const C = deps.roam_ctl.create(R, { toast: hud.toast, marker: hud.marker,
        examine: g => { W.fold(R.frame.anchor, g.x, g.y, F3); const L = W.tileAt(F3[0], Math.floor(F3[1]), Math.floor(-F3[2])); hud.toast('Tile ' + L + ' (' + W.BIOME[W.sample(F3[0], F3[1], F3[2]).biome] + ')'); },
        onMove: dt => { infoT += dt; if (infoT > 0.2) { infoT = 0; hud.setInfo(R.info()); } } });
      const fade = deps.roamhud.fader(host), F3 = [0, 0, 0];

      function randomCell() { for (;;) { const c = Math.floor(Math.random() * G.count); if (G.cls(c) !== 'peak') return c; } }
      /* the nearest spot a person can stand on: coarse rings first, then the tile itself must be open with open tiles around */
      function findSpot(face, x, y) {
        const ok = (px, py) => { if (!W.walkable(face, px, py)) return false; for (let k = 0; k < 8; k++) if (!W.walkable(face, px + Math.cos(k * 0.785) * 1.2, py + Math.sin(k * 0.785) * 1.2)) return false; return true; };
        if (ok(x, y)) return { face, x, y };
        for (let r = 4; r < 3000; r += r < 60 ? 3 : 10) {
          const n = Math.max(8, Math.floor(2 * Math.PI * r / (r < 60 ? 3 : 10)));
          for (let k = 0; k < n; k++) { const a = k / n * 2 * Math.PI, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return { face, x: px, y: py }; }
        }
        return { face, x, y };
      }
      function spotFor(target) {
        if (target === 'core') return start0 || (() => { const p = G.planar(CL.coreCenter); return findSpot(p.face, p.x, p.y); })();
        if (typeof target === 'number') { const p = G.planar(target); return findSpot(p.face, p.x, p.y); }
        return findSpot(target.face, target.x, target.y);
      }
      function cellOf(t) { if (t === 'core') return CL.coreCenter; if (typeof t === 'number') return t; W.fold(t.face, t.x, t.y, F3); return W.parcelAt(F3[0], F3[1], F3[2]); }
      function anim(sec, fn, done) { const t0 = performance.now(); (function step() { const u = Math.min(1, (performance.now() - t0) / (sec * 1000)); fn(u * u * (3 - 2 * u)); if (u < 1) requestAnimationFrame(step); else if (done) done(); })(); }
      /* planet -> ground */
      function land(target, instant, exact) {
        if (mode === 'flying') return;
        const cell = cellOf(target), spot = exact && typeof target === 'object' ? target : spotFor(target), ll = G.latlon(cell);
        const go = () => {
          gHost.style.visibility = 'hidden'; rHost.style.display = '';
          R.land(spot.face, spot.x, spot.y); R.setActive(true); C.stop(); C.snap();
          hud.setInfo(R.info()); mode = 'ground';
          if (instant) { C.cam.dist = C.cam.tdist = R.PHONE ? 9 : 11; return; }
          R.boost = true; C.fly(150, R.PHONE ? 9 : 11, 1.38, 0.92, 1.7, () => { R.boost = false; });
          fade(0, 0.5);
        };
        if (instant) { go(); return; }
        if (mode === 'ground') { mode = 'flying'; fade(1, 0.25, () => { go(); }); return; }
        mode = 'flying';
        const c = V.cam, lat0 = c.lat, lon0 = c.lon, d0 = c.dist;
        let dl = ll[1] - lon0; dl = ((dl + 540) % 360) - 180;
        V.select(cell);
        anim(1.1, e => { c.lat = lat0 + (ll[0] - lat0) * e; c.lon = lon0 + dl * e; c.dist = d0 + (1.012 - d0) * e; c.vlat = c.vlon = 0; V.render(); }, () => fade(1, 0.3, go));
      }
      /* ground -> planet */
      function flyUp(instant) {
        if (mode !== 'ground') return;
        const info = R.info(), cell = info.cell, ll = [info.lat, info.lon];
        const done = () => {
          R.setActive(false); rHost.style.display = 'none'; gHost.style.visibility = '';
          const c = V.cam; c.lat = ll[0]; c.lon = ll[1]; c.dist = 1.012; c.vlat = c.vlon = 0; V.select(cell); V.render();
          mode = 'planet';
          if (instant) { c.dist = 1.3; V.render(); return; }
          fade(0, 0.4);
          anim(1.2, e => { c.dist = 1.012 + (1.3 - 1.012) * e; V.render(); });
        };
        if (instant) { done(); return; }
        mode = 'flying';
        C.fly(C.cam.dist, 150, C.cam.pitch, 1.38, 1.1, () => fade(1, 0.3, done));
      }
      let lines = false, run = false;
      function groundAction(id) {
        if (id === 'fly') flyUp();
        else if (id === 'lines') { lines = !lines; R.setLines(lines); hud.setButton('lines', 'Parcels: ' + (lines ? 'on' : 'off'), lines); }
        else if (id === 'run') { run = !run; C.setRun(run); hud.setButton('run', run ? 'Running' : 'Run', run); }
        else if (id === 'random') land(randomCell());
        else if (id === 'core') land('core');
      }
      const app = { api: 1, V, W, R, C, hud, land, flyUp, findSpot, mode: () => mode,
        state() { const i = R.info(), s = C.state(); return Object.assign({ mode, px: R.player.x, py: R.player.y, anchor: R.frame.anchor, yaw: R.player.yaw }, i, s); },
        stats() { return Object.assign({ mode }, R.stats(), { globe: V.stats() }); } };
      root.ATLAS = app;
      const qc = q.get('cell'); if (qc != null && qc !== '') setTimeout(() => land(qc === 'core' ? 'core' : +qc, true), 50);
      return app;
    }
    return { api: 1, start };
  }
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('atlas', META, factory);
})(typeof globalThis !== 'undefined' ? globalThis : this);
