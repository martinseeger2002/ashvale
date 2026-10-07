/* ASHVALE 3D engine: glues the modules together and runs the game in the browser.
   Rules come from `core` (deterministic, 0.6 s ticks); the engine only renders what the core says and turns taps, clicks
   and keys into core commands. Characters come from `models`, the world from `scene` (built region by region, streamed
   in and out by distance), the 2D interface from `hud`, other players from `net`.
   start(hostElement, opts) -> game   (window.ASH is the debug/test handle) */
(function (G) {
  'use strict';
  function engineFactory(deps) {
    const THREE = deps.three, AshCore = deps.core, net = deps.net, SCENE = deps.scene, HUD = deps.hud, DATA = deps.data;
    const TICK = 600, CHAR = 0.8, PI = Math.PI;
    /* HARD RULE (2026-10-01): "only items that were inscribed and tokens created by @ashvale should be allowed in
       the game". Anything read from a wallet (NFTs, tokens) must pass allowedAsset() before it reaches the game. */
    const ASHVALE_ADDR = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c';
    const YOURFIRST_ADDR = 'ns3A7VS6DDaCoBvNFnayHeS9pysgi7Ukrf';
    /* tokens issued before the schema (empty category/subcategory): classified by property id, only when @ashvale issued them */
    const LEGACY_TOKENS = { 26: ['currency', 'gold'], 20: ['xp', 'attack'], 21: ['xp', 'strength'], 22: ['xp', 'defence'], 23: ['xp', 'ranged'], 24: ['xp', 'magic'], 25: ['xp', 'hitpoints'] };
    function classifyToken(t, items) {   /* an arcade token row -> {propertyid, category, subcategory, item} or null */
      if (!t || (t.issuer !== ASHVALE_ADDR && t.issuer !== YOURFIRST_ADDR)) return null;
      let cat = t.category || '', sub = t.subcategory || '';
      if (!cat && LEGACY_TOKENS[t.propertyid]) [cat, sub] = LEGACY_TOKENS[t.propertyid];
      if (!cat) return null;
      const det = t.details && typeof t.details === 'object' ? t.details : null, id = det && det.ashvale && det.ashvale.id;
      let item = id && items[id] && items[id].category === cat && items[id].subcategory === sub ? id : null;
      if (!item && cat === 'currency' && sub === 'gold') item = 'coins';
      return { propertyid: t.propertyid, name: t.name, category: cat, subcategory: sub, item };
    }
    /* wallet reads (feature-detected: outside an arcade viewer these simply return nothing) */
    function walletApi(items) {
      const j = async (url) => { try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); } catch (e) { return null; } };
      return {
        async tokens(ids) { const rows = ids && ids.length ? await j('/r/tokens?ids=' + ids.slice(0, 100).join(',')) : []; return (Array.isArray(rows) ? rows : []).map(t => classifyToken(t, items)).filter(Boolean); },
        async balances(addr) {
          const rows = await j('/r/balances/' + encodeURIComponent(addr)); if (!Array.isArray(rows)) return [];
          const mine = rows.filter(r => r && (r.issuer === ASHVALE_ADDR || r.issuer === YOURFIRST_ADDR)), meta = await this.tokens(mine.map(r => r.propertyid));
          return mine.map(r => Object.assign({ balance: r.balance != null ? r.balance : r.amount }, meta.find(m => m.propertyid === r.propertyid) || {})).filter(x => x.category);
        },
        classifyToken: t => classifyToken(t, items)
      };
    }
    function ashvaleFlag(j) {
      if (!j || typeof j !== 'object') return false;
      if (j.game === 'ashvale' || j.ashvale === true) return true;
      for (const t of (j.attributes || [])) {
        if (!t) continue;
        const k = String(t.trait_type || '').toLowerCase();
        if ((k === 'flag' || k === 'game') && String(t.value).toLowerCase() === 'ashvale') return true;
      }
      return false;
    }
    function allowedAsset(a) {
      if (!a) return false;
      const by = a.creator || a.issuer || a.owner_at_creation || null, addr = by && typeof by === 'object' ? by.address || by.tag : by;
      if (addr === ASHVALE_ADDR || addr === '@ashvale' || addr === 'ashvale') return true;
      const also = (DATA.assets && DATA.assets.also) || [];
      const extra = addr === YOURFIRST_ADDR || addr === '@yourfirstname' || addr === 'yourfirstname' || also.indexOf(addr) >= 0;
      if (!extra || !ashvaleFlag(a.json || a)) return false;
      const ct = String(a.contenttype || a.content_type || '');
      return !ct || ct === 'application/json';
    }
    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
    const SPELL_COL = { Wind: '#e6f2ff', Water: '#3d8bff', Earth: '#7cc04a', Fire: '#ff6a1a' };

    /* ---------- saves: arcade.storage inside an arcade viewer (inscribed pages have NO localStorage, it throws),
       else this browser's localStorage, else memory only. Reads come from a cache filled before start(); writes go
       through and never throw (setItem rejects outside a viewer). */
    const STORE_KEYS = ['ashvale3d.save.v1', 'ashvale3d.settings.v1', 'ashvale3d.help'];
    function memoryStore(cache, backend, S) {
      cache = cache || {}; let warned = false;
      const warn = e => { if (!warned) { warned = true; console.warn('ASHVALE: saving failed (' + (e && e.message || e) + '); progress is kept until you close the page.'); } };
      return {
        backend: backend || 'memory',
        get: k => (Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null),
        set(k, v) { cache[k] = v; if (!S) return Promise.resolve(true); try { return Promise.resolve(S.setItem(k, v)).then(() => true, e => { warn(e); return false; }); } catch (e) { warn(e); return Promise.resolve(false); } }   /* true = kept, false = the store refused it */
      };
    }
    /* ask the wallet for this page's storage again (arcade.storage asks once and gives up after 5 s: a wallet that is
       still unlocking after a refresh answered too late, and the game used to start a blank character over the real
       save - 2026-10-05 "I lost my character again"). Same message protocol as /r/storage.js. */
    function loadAgain(A, ms) {
      const bootEl = G.document && G.document.getElementById('boot'), t0 = Date.now();
      return new Promise(resolve => {
        let done = false; const seq = 1e6 + Math.floor(Math.random() * 1e6);
        const on = e => { const m = e.data || {}; if (m.arcade !== 'storage' || m.seq !== seq || done) return; if (m.ok) { done = true; G.removeEventListener('message', on); clearInterval(iv); resolve({ items: m.items || {}, setItem: (k, v) => A.setItem(k, v) }); } };
        G.addEventListener('message', on);
        const ask = () => {
          if (done) return;
          if (Date.now() - t0 > ms) { done = true; G.removeEventListener('message', on); clearInterval(iv); resolve(null); return; }
          if (bootEl) bootEl.textContent = 'Waiting for your arcade wallet to open your character…';
          try { G.parent.postMessage({ arcade: 'storage', op: 'load', seq }, '*'); } catch (e) { /* no parent */ }
        };
        const iv = setInterval(ask, 3000); ask();
      });
    }
    /* ---------- area loading (handoff/area_loading.md, 2026-10-06: "only load assets from the parcel and the
       adjacent parcels"). Zone modules are in the registry's `lazy` section, which the launcher's loader never fetches;
       DATA.zoneindex says where every zone is. A zone is fetched when its rectangle touches the 3 x 3 block of 512 m
       regions around the player; pages without /content/ carry them in window.ASH3D_LAZY. LZ: the zones that arrived. */
    const LZ = {}, LZ_WAIT = {};
    const ZINDEX = DATA.zoneindex && DATA.zoneindex.zones ? DATA.zoneindex.zones : null;
    function zonesNear(x, y) {
      if (!ZINDEX) return [];
      const C = Object.assign({ origin: [-24, 164], grid: [-216, -28], region: 512 }, DATA.globecfg || {}), GX = C.origin[0] - C.grid[0], GY = C.origin[1] - C.grid[1], R = C.region;
      const rx = Math.floor((x + GX) / R), ry = Math.floor((y + GY) / R), x0 = (rx - 1) * R - GX, y0 = (ry - 1) * R - GY, x1 = x0 + 3 * R, y1 = y0 + 3 * R;
      return ZINDEX.filter(z => z.origin[0] < x1 && z.origin[0] + z.size[0] > x0 && z.origin[1] < y1 && z.origin[1] + z.size[1] > y0).map(z => z.id);
    }
    function fetchZone(id) {
      if (LZ[id]) return Promise.resolve(LZ[id]);
      if (LZ_WAIT[id]) return LZ_WAIT[id];
      const keep = (j) => { const d = j && j.ashvale3d === 'module' ? j.data : j; if (!d || !d.tiles) throw new Error('zone ' + id + ': not a zone module'); return (LZ[id] = Object.assign({ id }, d)); };
      const page = G.ASH3D_LAZY && G.ASH3D_LAZY['zone.' + id];
      if (page) { const ms = +G.ASH3D_LAZY_DELAY || 0; return ms ? (LZ_WAIT[id] = new Promise(r => setTimeout(() => { delete LZ_WAIT[id]; r(keep(page)); }, ms))) : Promise.resolve(keep(page)); }   /* a playtest page can slow the arrival down to show it */
      const reg = G.ASH3D && G.ASH3D._values && G.ASH3D._values.$registry, e = reg && reg.lazy && reg.lazy.zones && reg.lazy.zones[id];
      if (!e || !e.id) return Promise.reject(new Error('zone ' + id + ' is not in the registry'));
      const p = fetch('/content/' + e.id).then(r => { if (!r.ok) throw new Error('zone ' + id + ': HTTP ' + r.status); return r.json(); }).then(keep);
      LZ_WAIT[id] = p; p.catch(() => {}).then(() => { delete LZ_WAIT[id]; });
      return p;
    }
    /* before the world starts (behind the boot screen): the zones around where this character stands (a new one: the spawn) */
    async function preloadZones(st) {
      if (!ZINDEX) return;
      let at = (ZINDEX.find(z => z.respawn) || {}).respawn || [0, 0];
      try {
        const sv = JSON.parse(st.get('ashvale3d.save.v1') || 'null'), C = DATA.globecfg || {};
        if (sv && (sv.v | 0) >= 2 && Array.isArray(sv.pos) && C.origin) at = [sv.pos[1] - C.origin[0], sv.pos[2] - C.origin[1]];
        else if (sv && Number.isInteger(sv.x) && Number.isInteger(sv.y)) at = [sv.x, sv.y];
      } catch (e) { /* a new character */ }
      const bootEl = G.document && G.document.getElementById('boot'); if (bootEl) bootEl.textContent = 'Loading the land around you…';
      /* the zone you stand IN must be here before the core places you (on land without its town you could be "blocked" and put
         back at the spawn): that one is waited for, retried for as long as it takes; the rest of the ring may come later */
      const zin = (ZINDEX.find(z => at[0] >= z.origin[0] && at[1] >= z.origin[1] && at[0] < z.origin[0] + z.size[0] && at[1] < z.origin[1] + z.size[1]) || {}).id;
      const near = zonesNear(at[0], at[1]).filter(id => id !== zin).map(id => fetchZone(id).catch(e => console.warn('ASHVALE: ' + e.message)));
      for (let k = 0; zin && !LZ[zin]; k++) {
        try { await fetchZone(zin); } catch (e) { console.warn('ASHVALE: ' + e.message + ', trying again'); if (bootEl) bootEl.textContent = 'Still loading the land around you…'; await new Promise(r => setTimeout(r, Math.min(10000, 1000 * (k + 1)))); }
      }
      await Promise.race([Promise.all(near), new Promise(r => setTimeout(r, 15000))]);
    }
    async function openStore() {
      /* while the wallet opens the save (that can take seconds), the zones around the spawn are already on their way: most
         characters stand there, and for the rest it is a few KB that warm the cache */
      if (ZINDEX && !G.ASH3D_LAZY_DELAY) { const r0 = (ZINDEX.find(z => z.respawn) || {}).respawn; if (r0) for (const id of zonesNear(r0[0], r0[1])) fetchZone(id).catch(() => {}); }   /* (not on a playtest page that shows a slow arrival) */
      const st = await openStoreOnly(); try { await preloadZones(st); } catch (e) { console.warn('ASHVALE: zones', e && e.message); } return st;
    }
    async function openStoreOnly() {
      const A = G.arcade && G.arcade.storage, framed = !!(G.parent && G.parent !== G);
      if (A && A.ready) {
        let S = null;
        try { S = await Promise.race([A.ready, new Promise((res, rej) => setTimeout(() => rej(new Error('storage timeout')), 6000))]); }
        catch (e) { console.warn('ASHVALE: arcade storage slow (' + (e && e.message) + '), asking again'); }
        if (S) {
          const cache = {};
          for (const k of STORE_KEYS) { try { const v = await S.getItem(k); if (v != null) cache[k] = String(v); } catch (e) { /* missing */ } }
          return memoryStore(cache, 'arcade', S);
        }
        if (framed) {   /* inside the arcade: never start a blank character over a save we could not read */
          const L = await loadAgain(A, 60000);
          if (L) { const cache = {}; for (const k of STORE_KEYS) if (L.items[k] != null) cache[k] = String(L.items[k]); return memoryStore(cache, 'arcade', L); }
          throw new Error('your arcade wallet did not answer, so your character was not loaded (it is safe). Unlock the wallet, then reload this page.');
        }
      }
      try {
        const L = G.localStorage; L.setItem('ashvale3d.probe', '1'); L.removeItem('ashvale3d.probe');
        const cache = {}; for (const k of STORE_KEYS) { const v = L.getItem(k); if (v != null) cache[k] = v; }
        return memoryStore(cache, 'browser', { setItem: (k, v) => L.setItem(k, v) });
      } catch (e) { return memoryStore({}, 'memory'); }
    }

    function start(host, opts) {
      opts = opts || {};
      const q = new URLSearchParams(location.search);
      const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
      const isPhone = isTouch && Math.min(innerWidth, innerHeight) < 600;
      const store = opts.store || memoryStore();
      const SAVE = 'ashvale3d.save.v1', SET = 'ashvale3d.settings.v1';
      let save = null; try { save = JSON.parse(store.get(SAVE) || 'null'); } catch (e) { save = null; }
      if (opts.fresh || q.has('fresh')) save = null;
      let settings = { sound: true, shadows: !isPhone, runToggle: false }; try { Object.assign(settings, JSON.parse(store.get(SET) || '{}')); } catch (e) { /* defaults */ }

      /* ---------- data + rules */
      /* the zones here now: an eager registry's (DATA zone.*), and the ones area loading fetched before the start (LZ). With an
         index, more arrive while you play (lazyTick, core.addZone) */
      const zones = Object.keys(DATA).filter(k => k.indexOf('zone.') === 0).map(k => Object.assign({ id: k.slice(5) }, DATA[k]));
      if (ZINDEX) for (const z of ZINDEX) if (LZ[z.id] && !zones.some(q => q.id === z.id)) zones.push(Object.assign({}, LZ[z.id]));
      const D = { items: DATA.items.items, monsters: DATA.monsters.monsters, shops: DATA.shops, quests: DATA.quests, rules: DATA.rules, zones, globecfg: DATA.globecfg };
      if (ZINDEX) D.zoneIndex = DATA.zoneindex;
      const seed = opts.seed || q.get('seed') || ('ashvale-' + Date.now());
      /* globe P2: seeded land around the old map (worldgen + globe modules, when the registry has them; ?flat turns it off) */
      { const get = n => G.ASH3D && G.ASH3D.get ? G.ASH3D.get(n) : null, WGM = get('worldgen'), AG = get('globe'), AW = get('world') || G.AshWorld;
        if (WGM && AG && AW && AW.seededWorldgen && !q.has('flat')) { try { D.wg = AW.seededWorldgen(WGM, AG, D); } catch (er) { console.warn('worldgen', er && er.message); } } }
      const core = AshCore.create(D, { seed });
      const PID = 'me';
      const me = core.addPlayer(PID, save);
      function syncMounts() {   /* wall-hung quest rewards (Aldric's sword) stay on the wall until they're given */
        for (const r of regions) if (r.built && r.built.mounts) for (const m of r.built.mounts) { const q = me.quests && me.quests[m.quest]; m.obj.visible = !(q && q.step >= m.untilStep); }
      }
      const parts = {}; for (const k in DATA) if (k.indexOf('part.') === 0) parts[k.slice(5)] = DATA[k];
      const MOD = deps.models.createModels(THREE, { parts, onReject: (id, why) => console.warn('ASHVALE: model part rejected: ' + id + ' (' + why + ')') });

      /* ---------- renderer */
      const canvas = document.createElement('canvas'); canvas.className = 'gl'; host.appendChild(canvas);
      let renderer;
      const hud = HUD.create(host, hudApi());
      try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !isPhone || devicePixelRatio < 2, powerPreference: 'high-performance' }); }
      catch (e) { hud.fatal('ASHVALE needs WebGL, which this browser could not start. Try another browser or turn on hardware acceleration.'); return null; }
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isPhone ? 1.75 : 2));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); hud.fatal('The graphics were reset by the browser. Tap to reload.'); host.addEventListener('pointerup', () => location.reload(), { once: true }); });
      const scene = new THREE.Scene();
      const SKY = 0xa7c8e6; scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 24, 52);
      /* fog shape (src/fog.js, its own inscription): fog measured from the camera-player segment, so neither is ever fogged out.
         Installed before the first render (it patches the shader chunks the materials compile from). */
      let fogMod = null;
      try { const FM = G.ASH3D && G.ASH3D.get && G.ASH3D.get('fog'); if (FM && FM.createFogShape) fogMod = FM.createFogShape(THREE); } catch (er) { console.warn('fog module', er && er.message); }
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 90);
      const hemi = new THREE.HemisphereLight(0xe2efff, 0x4f5a34, 1.7); scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
      sun.castShadow = settings.shadows; sun.shadow.mapSize.set(isPhone ? 1024 : 2048, isPhone ? 1024 : 2048);
      const sc = sun.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
      scene.add(sun, sun.target);

      /* ---------- world regions (one per zone module), streamed in/out by distance; with seeded land also the 64 m
         chunks around you (globe P2), built with the same scene code so they look the same, at most one per tick unless
         it is close (the fog hides the far edge) */
      const regions = zones.map(z => ({ id: z.id, rect: [z.origin[0], z.origin[1], z.size[0], z.size[1]], built: null }));
      const LOAD_D = 40, DROP_D = 70, SEEDED = !!core.M.seeded, CH_LOAD = isPhone ? 52 : 60, CH_NEAR = 30, CH_DROP = 110, TREE_R = isPhone ? 46 : 54;   /* the fog ends at about 52 m */
      const heightAt = SCENE.heights ? SCENE.heights(core.M) : (x, z) => 0;
      const chunkRegs = new Map();
      function regionDist(r, x, y) { const dx = Math.max(r.rect[0] - x, 0, x - (r.rect[0] + r.rect[2])), dy = Math.max(r.rect[1] - y, 0, y - (r.rect[1] + r.rect[3])); return Math.max(dx, dy); }
      function addBuilt(r, opt) { r.built = SCENE.build(core.M, opt); scene.add(r.built.group); for (const k in core.S.dep) r.built.setDepleted(+k, true); }
      function streamRegions(force) {
        for (const r of regions) {
          if (r.chunk) continue;
          const d = regionDist(r, me.x, me.y);
          if (!r.built && (d <= LOAD_D || force)) { addBuilt(r, { rect: r.rect, outer: r === regions[0] }); syncMounts(); }
          else if (r.built && d > DROP_D) { scene.remove(r.built.group); r.built.dispose(); r.built = null; }
        }
        if (!SEEDED) return;
        const pcx = me.x >> 6, pcy = me.y >> 6; let built = 0;
        const want = [];
        for (let cy = pcy - 2; cy <= pcy + 2; cy++) for (let cx = pcx - 2; cx <= pcx + 2; cx++) {
          const k = cx + ',' + cy, rect = [cx * 64, cy * 64, 64, 64], d = regionDist({ rect }, me.x, me.y);
          if (d <= CH_LOAD && !chunkRegs.has(k)) want.push([d, k, rect]);
        }
        want.sort((a, b) => a[0] - b[0]);
        for (const [d, k, rect] of want) {
          if (!force && built && d > CH_NEAR) break;   /* one far chunk per call; anything close is built at once */
          const r = { id: 'c:' + k, rect, built: null, chunk: true }; addBuilt(r, { rect, chunk: true }); chunkRegs.set(k, r); regions.push(r); built++;
        }
        for (const [k, r] of chunkRegs) if (regionDist(r, me.x, me.y) > CH_DROP) { scene.remove(r.built.group); r.built.dispose(); chunkRegs.delete(k); regions.splice(regions.indexOf(r), 1); }
        for (const r of chunkRegs.values()) r.built.setView(me.x + 0.5, me.y + 0.5, TREE_R);
      }
      streamRegions();
      /* ---------- area loading while you play (handoff/area_loading.md): every few ticks, fetch the zones that now touch
         the 3 x 3 regions around you (the rest of the world stays unloaded). A zone arrives at least a region away, long
         before its town is in sight; a teleport into one that is not here yet waits behind the travel screen. */
      function lazyTick(force) {
        if (!ZINDEX || (!force && core.S.t % 8)) return;
        for (const id of zonesNear(me.x, me.y)) if (!core.hasZone(id) && !LZ_WAIT[id])
          fetchZone(id).then(z => { if (!core.hasZone(id)) coreCall(() => core.addZone(Object.assign({}, z))); }).catch(e => console.warn('ASHVALE: ' + e.message + ' (trying again soon)'));
      }
      function zoneAtIndex(x, y) { return ZINDEX ? ZINDEX.find(z => x >= z.origin[0] && y >= z.origin[1] && x < z.origin[0] + z.size[0] && y < z.origin[1] + z.size[1]) || null : null; }
      /* the portal swirl (2026-10-06): when you arrive (portal, runestone, waking after a death) in a town whose zone
         has not come yet, the screen stays on the swirl until it has, and at least TRAVEL_MS so it never just flickers */
      const TRAVEL_MS = 900, CAVE_MS = 1400; let travelling = null, TRAVEL_KIND = null;
      /* through a cave passage the screen is the cave's own (down into the dark, up into the daylight), every time - even when
         the area there is already loaded - for at least CAVE_MS */
      function caveTravel(kind, name) {
        TRAVEL_KIND = kind; hud.travel && hud.travel(true, name, 0.2, kind);
        const t0 = performance.now(), tick = () => { if (travelling) return; const f = (performance.now() - t0) / CAVE_MS; if (f >= 1) { TRAVEL_KIND = null; hud.travel && hud.travel(false); return; } hud.travel && hud.travel(true, name, 0.2 + 0.8 * f, kind); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }
      function arriveCheck() {
        if (!ZINDEX) return;
        const zi = zoneAtIndex(me.x, me.y); lazyTick(true);
        if (!zi || core.hasZone(zi.id) || travelling) return;
        const t0 = performance.now(), want = zi.id; travelling = want;
        hud.travel && hud.travel(true, zi.name || zi.id, 0, TRAVEL_KIND);
        let k = 0;
        const step = () => {
          if (core.hasZone(want)) { const left = Math.max(0, (TRAVEL_KIND ? CAVE_MS : TRAVEL_MS) - (performance.now() - t0)); setTimeout(() => { travelling = null; TRAVEL_KIND = null; streamRegions(true); cam.snap = true; hud.travel && hud.travel(false); }, left); return; }
          hud.travel && hud.travel(true, zi.name || zi.id, Math.min(0.9, (performance.now() - t0) / 4000), TRAVEL_KIND);
          fetchZone(want).then(z => { if (!core.hasZone(want)) coreCall(() => core.addZone(Object.assign({}, z))); step(); })
            .catch(e => { console.warn('ASHVALE: ' + e.message + ', trying again'); setTimeout(step, Math.min(8000, 800 * ++k)); });
        };
        step();
      }
      /* a zone arrived: its town joins the scene's regions, its people get models (fading in when they are in sight), the
         seeded-land meshes already built where it lies are dropped (they were drawn without the town) */
      function zoneArrived(e, now) {
        const z = (core.D.zones || []).find(q => q.id === e.zone); if (!z) return;
        const rect = [z.origin[0], z.origin[1], z.size[0], z.size[1]];
        if (core.M._hgt && core.M._hgt.forget) core.M._hgt.forget(rect[0], rect[1], rect[2], rect[3]);   /* its ground was worked out without it */
        for (const [k, r] of Array.from(chunkRegs)) {
          if (r.rect[0] < rect[0] + rect[2] + 2 && r.rect[0] + r.rect[2] > rect[0] - 2 && r.rect[1] < rect[1] + rect[3] + 2 && r.rect[1] + r.rect[3] > rect[1] - 2) {
            scene.remove(r.built.group); r.built.dispose(); chunkRegs.delete(k); regions.splice(regions.indexOf(r), 1);
          }
        }
        if (!regions.some(r => r.id === z.id)) regions.push({ id: z.id, rect, built: null });
        for (const id of e.npcs || []) {
          const n = core.M.npcs.find(q => q.id === id); if (!n || ents.has('n:' + id)) continue;
          const en = npcEnt(n), d = Math.max(Math.abs(n.x - me.x), Math.abs(n.y - me.y));
          if (d < 56 && en.H.setOpacity) { en.H.setOpacity(0); en.fadeIn = now; }
        }
        mmImg = null; minimapFor(); streamRegions(); syncMounts();
      }
      /* the minimap picture: the whole old map, or (seeded land) a 160 m window around you, redrawn when you near its edge */
      let mmImg = null, mmO = [0, 0];
      function minimapFor() {
        if (!SEEDED) { if (!mmImg) mmImg = SCENE.minimap(core.M); return; }
        if (mmImg && Math.abs(me.x - (mmO[0] + 80)) < 40 && Math.abs(me.y - (mmO[1] + 80)) < 40) return;
        mmO = [me.x - 80, me.y - 80]; mmImg = SCENE.minimap(core.M, [mmO[0], mmO[1], 160, 160]);
      }
      minimapFor();

      /* ---------- characters */
      const ents = new Map(), proxies = [];
      const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
      const blobGeo = new THREE.CircleGeometry(0.42, 12).rotateX(-PI / 2), blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
      function gearOf(p) { const g = {}; for (const k of ['head', 'cape', 'pack', 'body', 'legs', 'weapon', 'shield', 'ammo', 'ring']) g[k] = p.eq[k] ? p.eq[k].id : null; return g; }
      /* the hawk ring: an entity wearing it is drawn as a hawk HAWK_ALT m up, wings beating (the operator) */
      const HAWK_ALT = 14, ringHawk = (id) => !!(id && D.items[id] && (D.items[id].attributes || []).some(a => a.trait_type === 'Form' && a.value === 'hawk'));
      /* the hawk's height (2026-10-04): a dive down to its prey on every strike, perched in a tree on the side you
         tapped, standing on the ground (legs and shadow back) when it carries too much */
      const PERCH_H = 3.0, SIT_SCALE = 0.42;   /* perched or standing, the hawk is bird-sized next to a tree (it flies big to be seen from high up) */
      /* height above the ground for a floor: a building's storey is 1.8 m, a castle wall walk its own height (lh); an NPC
         posted up there (a watchman on the wall: lv, lh in the zone) stands on it too */
      function liftOf(e, a) {
        const c = e.key.charAt(0);
        let up = 0;
        if (c === 'p') { const p = core.S.players[e.key.slice(2)]; if (p && p.lv) { const B = p.bld >= 0 && core.M.buildings ? core.M.buildings[p.bld] : null; up = p.lv * (B && B.lh ? B.lh : 1.8); } }
        /* raised ground (a castle's stairs and wall walk): the height of the tiles you walk between, blended as you go - so you walk up the steps */
        if (core.M.lifts && (c === 'p' || c === 'n' || c === 'r' || c === 'm')) {
          const L = (v) => core.M.liftAt(Math.floor(v.x), Math.floor(v.z)), l0 = L(e.from), l1 = L(e.to), t = a == null ? 1 : Math.max(0, Math.min(1, a));
          up += l0 + (l1 - l0) * t;
        }
        return up;
      }
      function hawkAlt(e) {
        if (!e.hawk) return e.alt || 0;
        if (e === myEnt) {
          const grounded = (me.burden || 0) > 0, P = me.perch, perched = !!(P && me.x === P.x && me.y === P.y && !me.path.length);
          if (grounded !== e.hawkGround || perched !== e.hawkPerch) {
            e.hawkGround = grounded; e.hawkPerch = perched;
            if (e.hawk.flying) e.hawk.flying(!(grounded || perched));
            if (e.blob) e.blob.visible = grounded && !settings.shadows;
            e.hawk.play(grounded ? 'walk' : perched ? 'idle' : 'run', { loop: true });
          }
          e.hawk.object.scale.setScalar(grounded || perched ? SIT_SCALE : 1);
          if (grounded) return 0;
          if (perched) { e.hawk.object.position.set(0.45 * (P.sx || 0), 0, 0.45 * (P.sy || 0)); return PERCH_H; }
          e.hawk.object.position.set(0, 0, 0);
        }
        if (e.dive) { const t = (performance.now() - e.dive) / 900; if (t >= 1) e.dive = 0; else return HAWK_ALT * (1 - 0.92 * Math.sin(Math.PI * t)); }
        return e.alt || HAWK_ALT;
      }
      function hawkify(e, ring) {
        const on = ringHawk(ring); if (!!e.hawk === on) return;
        if (on) { e.hawk = MOD.monster('hawk'); if (e.hawk.flying) e.hawk.flying(); e.root.add(e.hawk.object); e.hawk.play('run', { loop: true }); e.H.object.visible = false; e.alt = HAWK_ALT; if (e.blob) e.blob.visible = false; }   /* no legs, no shadow (the operator) */
        else { e.root.remove(e.hawk.object); e.hawk = null; e.H.object.visible = true; e.alt = 0; if (e.blob) e.blob.visible = !settings.shadows; }
        if (e === myEnt) { cam.tdist = on ? 34 : 11; cam.tpitch = on ? 0.75 : 0.6; }
      }
      function makeEnt(key, H, pick, scale) {
        const e = { key, H, root: new THREE.Group(), from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: TICK, yaw: 0, tyaw: 0, loco: null, oneShot: false, dead: false, impacts: [], splats: [], hpT: 0, hp: 1, max: 1, running: false, skill: null, fade: 0, scale: scale || CHAR };
        H.object.scale.setScalar(e.scale); e.root.add(H.object); scene.add(e.root);
        const h = (H.height || 1.8) * 1.0;
        const px = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, Math.max(0.6, h * 0.95), 8), proxyMat); px.position.y = Math.max(0.3, h * 0.47); px.userData.pick = pick; px.userData.ent = e; e.root.add(px); e.proxy = px; proxies.push(px);
        e.blob = new THREE.Mesh(blobGeo, blobMat); e.blob.position.y = 0.03; e.blob.visible = !settings.shadows; e.root.add(e.blob);
        H.object.traverse(o => { if (o.isMesh) o.castShadow = true; });
        H.onEvent((type, name) => { if (type === 'impact') onImpact(e, name); else if (type === 'done' && name !== 'death') e.oneShot = false; });
        ents.set(key, e); return e;
      }
      function removeEnt(e) { if (e.bub) e.bub.el.remove(); scene.remove(e.root); const i = proxies.indexOf(e.proxy); if (i >= 0) proxies.splice(i, 1); e.H.dispose && e.H.dispose(); for (const s of e.splats) s.el.remove(); if (e.bar) e.bar.remove(); if (e.tag) e.tag.remove(); ents.delete(e.key); }
      function place(e, x, y) { const v = new THREE.Vector3(x + 0.5, 0, y + 0.5); v.y = heightAt(v.x, v.z); e.from.copy(v); e.to.copy(v); e.root.position.copy(v); e.tx = x; e.ty = y; }
      function moveTo(e, x, y, now) {
        if (e.tx === x && e.ty === y) return false;
        const steps = Math.max(Math.abs(x - e.tx), Math.abs(y - e.ty));
        e.from.copy(e.root.position); e.to.set(x + 0.5, 0, y + 0.5); e.t0 = now; e.dur = TICK;
        e.running = steps > 1; e.tx = x; e.ty = y; return true;
      }
      const faceYaw = f => Math.atan2(DIRS[f][0], DIRS[f][1]);
      function playOnce(e, name, speed) { e.oneShot = true; e.lastOne = name; e.oneT = performance.now(); e.H.play(name, { loop: false, speed: speed || 1 }); }

      const myEnt = makeEnt('p:' + PID, MOD.humanoid({ skin: '#e0b48c', hair: '#4a2c18', shirt: '#3d6a9a', pants: '#5a4632', shoes: '#3a2a1a' }), { kind: 'self' });
      myEnt.H.setGear(gearOf(me)); place(myEnt, me.x, me.y); setTimeout(() => hawkify(myEnt, me.eq.ring && me.eq.ring.id), 0);
      if (me.look && myEnt.H.setOutfit) myEnt.H.setOutfit(me.look);
      const NPCN = {};
      /* which way a person stands when nobody is talking to them (2026-10-06: "all of the NPC's are all facing the same
         direction"): the zone data can say (n.face, radians); otherwise they look out over the most open ground within 5 tiles -
         the street or the square rather than a wall - leaning toward paths, where people walk up to them. Indoors only the room
         counts. Ties break on the id, so neighbours do not all turn alike. */
      function homeYaw(n) {
        if (n.face != null) return n.face;
        const M = core.M, inside = !!(M.insideAt && M.insideAt(n.x, n.y)); let best = -1, yaw = PI, hv = 0;
        for (let i = 0; i < String(n.id).length; i++) hv = (hv * 31 + String(n.id).charCodeAt(i)) >>> 0;
        for (let d = 0; d < 8; d++) {
          const dx = [0, 1, 1, 1, 0, -1, -1, -1][d], dy = [1, 1, 0, -1, -1, -1, 0, 1][d];
          let sc = 0;
          for (let r = 1; r <= 5; r++) {
            const x = n.x + dx * r, y = n.y + dy * r;
            if (M.blocked(x, y) || (!!(M.insideAt && M.insideAt(x, y))) !== inside) break;
            sc += (6 - r) * (M.tileAt(x, y) === 'p' ? 1.5 : 1);
          }
          sc += ((hv >>> (d * 3)) & 7) * 0.05;
          if (sc > best) { best = sc; yaw = Math.atan2(dx, dy); }
        }
        return yaw;
      }
      function npcEnt(n) { const e = makeEnt('n:' + n.id, MOD.npc(n.look || n.id), { kind: 'npc', id: n.id }); place(e, n.x, n.y); e.homeYaw = homeYaw(n); e.yaw = e.tyaw = e.homeYaw; NPCN[n.id] = n; if (n.gear && e.H && e.H.setGear) e.H.setGear(n.gear); return e; }
      for (const n of core.M.npcs) npcEnt(n);   /* gear: what an NPC carries (the castle's watchmen hold bows) */
      /* monsters get a model while they are within MOB_NEAR tiles (seeded land wakes camps everywhere you have been) */
      const MOB_NEAR = 60, MOB_FAR = 90;
      function mobEnt(m) { const e = makeEnt('m:' + m.uid, MOD.monster((D.monsters[m.key] || {}).look || m.key), { kind: 'mob', uid: m.uid }); place(e, m.x, m.y); e.yaw = e.tyaw = faceYaw(m.face); e.max = D.monsters[m.key].hp; if (m.dead) { e.dead = true; e.root.visible = false; } return e; }
      function syncMobEnts() {
        for (const m of core.S.mobs) {
          const d = Math.max(Math.abs(m.x - me.x), Math.abs(m.y - me.y)), e = ents.get('m:' + m.uid);
          if (!e && d <= MOB_NEAR) mobEnt(m); else if (e && d > MOB_FAR) removeEnt(e);
        }
      }
      syncMobEnts();

      /* ---------- ground items */
      const gItems = new Map();
      function syncGround() {
        const seen = new Set(), perTile = {};
        for (const g of core.S.ground) {
          seen.add(g.uid); const k = g.x + ',' + g.y, n = perTile[k] = (perTile[k] || 0) + 1;
          if (gItems.has(g.uid)) continue;
          const o = new THREE.Group(), m = MOD.item(g.id); m.scale.setScalar(1.0); o.add(m);
          const a = (g.uid * 2.39996) % (2 * PI), r = n > 1 ? 0.22 : 0;
          o.position.set(g.x + 0.5 + Math.cos(a) * r, 0, g.y + 0.5 + Math.sin(a) * r); o.position.y = heightAt(o.position.x, o.position.z) + 0.02; o.rotation.y = a;
          m.traverse(c => { if (c.isMesh) c.castShadow = true; });
          const px = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.75), proxyMat); px.position.y = 0.2; px.userData.pick = { kind: 'item', uid: g.uid }; o.add(px); proxies.push(px);
          o.userData.px = px; o.userData.born = performance.now(); scene.add(o); gItems.set(g.uid, o);
        }
        for (const [uid, o] of gItems) if (!seen.has(uid)) { scene.remove(o); proxies.splice(proxies.indexOf(o.userData.px), 1); gItems.delete(uid); }
      }

      /* ---------- combat presentation: impacts, projectiles, splats */
      const projs = [];
      function entOf(id) { return typeof id === 'number' ? ents.get('m:' + id) : id === PID ? ents.get('p:' + id) : typeof id === 'string' && id.indexOf('n:') === 0 ? ents.get(id) : ents.get('r:' + id); }   /* n:<id> = an NPC fighting (the castle guard) */
      function onImpact(e, name) {
        if (/chop|mine|fish|cook/.test(name)) { sfx(name === 'mine' ? 'mine' : name === 'chop' ? 'chop' : name === 'fish' ? 'splash' : 'sizzle', e); return; }
        const rec = e.impacts.find(r => !r.fired); if (!rec) return;
        fireImpact(e, rec);
      }
      function fireImpact(e, rec) {
        rec.fired = true; e.impacts.splice(e.impacts.indexOf(rec), 1);
        if (rec.cls === 'melee') { if (rec.hit) showHit(rec.hit); return; }
        const tgt = entOf(rec.dst); if (!tgt) { if (rec.hit) showHit(rec.hit); return; }
        const wid = e === myEnt ? (me.eq.weapon && me.eq.weapon.id) : (e.H.gear && e.H.gear.weapon), wfx = wid && core.item(wid) ? core.item(wid).effect : null;
        const obj = rec.cls === 'ranged' ? MOD.projectile('arrow', rec.tier || 1) : MOD.projectile('spell', wfx === 'freeze' ? '#a8e4ff' : SPELL_COL[(rec.spell || 'Fire').split(' ')[0]] || '#ff6a1a');
        const from = e.H.muzzle ? e.H.muzzle(new THREE.Vector3()) : e.root.position.clone().add(new THREE.Vector3(0, 1, 0));
        obj.position.copy(from); obj.userData.isProjectile = true; scene.add(obj);
        const left = Math.max(0.28, rec.delay * TICK / 1000 - (performance.now() - rec.t) / 1000);
        projs.push({ obj, from, tgt, t: 0, dur: rec.hit ? 0.3 : left, hit: rec.hit, src: rec.src, dst: rec.dst, kind: rec.cls, arrived: false });
        sfx(rec.cls === 'ranged' ? 'bow' : 'cast', e);
      }
      function showHit(h) {
        const t = entOf(h.dst); if (!t) return;
        const el = hud.splat(h.dmg, h.cls); t.splats.push({ el, t: performance.now(), k: t.splats.length });
        t.hpT = performance.now(); t.hp = h.hp; t.max = h.max;
        if (!t.oneShot && !t.dead && h.hp > 0 && h.cls !== 'poison') { if (h.blocked) playOnce(t, 'block'); else if (h.dmg > 0) playOnce(t, 'hit'); }
        if (h.cls !== 'poison') sfx(h.dmg > 0 ? 'hit' : 'miss', t);
        if (h.dst === PID || h.src === PID) lastOpp = { uid: h.dst === PID ? h.src : h.dst, t: performance.now() };
        if (h.dst === PID) hud.refresh('orbs');
      }
      let lastOpp = null;

      /* ---------- the tick: run the rules, then present what happened */
      let lastTick = performance.now(), dirty = {};
      /* stepAt is the sim time at the END of the tick being run - the time the step it presents belongs to. Stamping
         the stride with the wall clock instead (what this did) means that in any frame that runs a tick the step is
         "just started", so a = (now - t0) / dur is about zero and the avatar does not move in that frame at all; it
         only advances on the frames that happen to contain no tick. On a machine that spends longer on a frame than a
         tick - any slow phone - the walk becomes a stall and a jump of up to four tiles, which is what the position
         check and the wire log both measured (movement between consecutive position messages: median 0.01 tile,
         p90 0.08, max 3.94). Stamped with the tick's own end time the step always has exactly the time in front of it
         that it was written for, however the frames fall, and the drawing sits one stride behind the rules - the same
         presentation the shared-world receiver already uses. Clamped to the wall clock for the tick that runs the
         moment lastTick is re-based (a hidden tab coming back), which has no future to animate into.
         (the operator's shared-world position check, 2026-10-02.) */
      function doTick(stepAt) {
        followTick();
        const evs = core.tick(), now = performance.now(), stamp = stepAt ? Math.min(stepAt, now) : now;
        /* positions */
        for (const pid of core.S.order) {
          const p = core.S.players[pid], e = ents.get('p:' + pid); if (!e) continue;
          if (p.dead) continue;
          const mv = moveTo(e, p.x, p.y, stamp);
          if (mv) e.tyaw = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); else e.tyaw = faceYaw(p.face);
          const sk = p.skilling, skAnim = sk === 'chop' ? 'chop' : sk === 'mine' ? 'mine' : sk === 'fish' ? 'fish' : sk === 'cook' || sk === 'light' ? 'cook' : null;
          const tl = skAnim === 'chop' || skAnim === 'mine' || skAnim === 'fish' ? p.toolId || (sk === 'chop' ? 'hatchet' : sk === 'mine' ? 'pickaxe' : 'net') : null;
          if (skAnim !== e.skill || tl !== e.toolId) { e.skill = skAnim; e.toolId = tl; e.H.setTool && e.H.setTool(tl); }
        }
        for (const n of core.M.npcs) if (n.patrol || n.guard) { const e = ents.get('n:' + n.id); if (e && moveTo(e, n.x, n.y, stamp)) e.tyaw = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); }   /* a watchman walking his round, a guard answering the call to arms */
        syncMobEnts();
        for (const m of core.S.mobs) {
          const e = ents.get('m:' + m.uid); if (!e || m.dead) continue;   /* (syncMobEnts runs right before) */
          const mv = moveTo(e, m.x, m.y, stamp);
          if (mv) e.tyaw = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); else if (m.tgt) e.tyaw = faceYaw(m.face);
          e.hp = m.hp;
        }
        syncGround();
        for (const ev of evs) { handle(ev, now); netEvent(ev); }
        if (TRIP) { TRIP.events(evs); TRIP.tick(); }
        netAct();
        if (dirty.inv || dirty.eq) { hud.refresh('all'); dirty = {}; } else hud.refresh('orbs');
        if (hud.tab === 'skills' || hud.tab === 'quest') hud.refresh(hud.tab);
        roofCheck(); showWeather();
        if (core.S.t % 25 === 0) persist();
        if ((SEEDED || core.S.t % 5 === 0) && !CAVE.hold) streamRegions();
        lazyTick();
        netWatch();
        if (core.S.t % 4 === 0) npcsTurnBack();
        netRoom();
      }
      function handle(e, now) {
        const mine = e.p === PID;
        if (e.e === 'drop' || e.e === 'xdrop' || e.e === 'take') chestEvent(e);
        if (mine && e.e === 'reward' && walletState.address) { const L = ledgerFor(walletState.address); L.rewards = L.rewards || {}; (L.rewards[e.id] = L.rewards[e.id] || []).push(e.collection); ledgerSave(); }   /* a quest reward: its own collection */
        if (mine && (e.e === 'take' || e.e === 'trade' || e.e === 'gather' || e.e === 'inv')) depositSoon();   /* into your wallet the moment it is in your bag (the operator: "as soon as you pick them up") */
        switch (e.e) {
          case 'attack': {
            if (e.cls === 'hawk') { const he = entOf(e.src); if (he && he.hawk) he.dive = performance.now(); }   /* the hawk dives to strike */
            const src = entOf(e.src), dst = entOf(e.dst); if (!src) break;
            if (dst) src.tyaw = Math.atan2(dst.to.x - src.to.x, dst.to.z - src.to.z);
            if (typeof e.src === 'number' && src.H.gear && src.H.setGear) {   /* archers: bow out to shoot, sword back for melee */
              if (src.w0 === undefined) src.w0 = src.H.gear.weapon || null;
              const want = e.cls === 'ranged' ? 'bow_t1' : src.w0;
              if (src.H.gear.weapon !== want) src.H.setGear(Object.assign({}, src.H.gear, { weapon: want }));
            }
            const wpn = e.src === PID ? (me.eq.weapon ? me.eq.weapon.id : null) : (src.H.gear ? src.H.gear.weapon : null);
            const anim = typeof e.src === 'number' ? (e.anim || 'slash') : (src.H.attackAnim ? src.H.attackAnim(wpn) : 'slash');
            const sp = Math.max(1, 0.75 / (TICK / 1000 * 1.0));
            playOnce(src, anim, e.cls === 'melee' ? 1.15 : 1);
            src.impacts.push({ dst: e.dst, src: e.src, cls: e.cls, tier: e.ammo ? +String(e.ammo).slice(-1) : 1, spell: e.spell, delay: e.delay, t: now, hit: null, fired: false });
            if (e.cls === 'melee') sfx('swing', src);
            void sp; break;
          }
          case 'hit': {
            noteCombat(e);
            const src = entOf(e.src);
            if (e.cls === 'melee') { const rec = src && src.impacts.find(r => r.dst === e.dst && !r.hit); if (rec) rec.hit = e; else showHit(e); }
            else {
              const pr = projs.find(p => p.dst === e.dst && p.src === e.src && !p.hit);
              if (pr) { if (pr.arrived) showHit(e); else pr.hit = e; }
              else { const rec = src && src.impacts.find(r => r.dst === e.dst && !r.hit); if (rec) rec.hit = e; else showHit(e); }
            }
            break;
          }
          case 'die': {
            const t = e.mob != null ? ents.get('m:' + e.mob) : ents.get('p:' + e.p); if (!t) break;
            t.dead = true; t.deadT = now; t.oneShot = true; t.H.play('death', { loop: false }); sfx(e.p === PID ? 'die' : 'mobdie', e.p === PID ? null : t);
            if (e.p === PID) setTimeout(() => hud.death(true), 700);
            break;
          }
          case 'respawn': { const t = ents.get('p:' + e.p); if (!t) break; t.dead = false; t.oneShot = false; t.loco = null; t.H.setOpacity && t.H.setOpacity(1); t.root.visible = true; const p = core.S.players[e.p]; place(t, p.x, p.y); t.H.play('idle', { loop: true }); if (e.p === PID) { hud.death(false); cam.snap = true; arriveCheck(); } break; }
          case 'gone': { const t = ents.get('m:' + e.mob); if (t) { t.dead = true; t.deadT = now - 5000; t.oneShot = true; t.root.visible = false; } break; }   /* the host says it is dead: hide it at once (2026-10-02: frozen monsters after re-entering a zone) */
          case 'spawn': { const m = core.mobByUid(e.mob), t = ents.get('m:' + e.mob); if (!t) break; t.dead = false; t.oneShot = false; t.loco = null; t.root.visible = true; t.H.setOpacity && t.H.setOpacity(1); place(t, m.x, m.y); t.H.play('idle', { loop: true }); t.spawnT = now; t.hp = m.hp; break; }
          case 'msg': if (mine) hud.chat(e.text, e.kind); break;
          case 'xp': if (mine) hud.xpDrop(e.skill, e.n); break;
          case 'level': if (mine) { hud.levelUp(e.skill, e.lvl); sfx('level'); burst(myEnt.root.position, 0xffd040); netGear(); } break;   /* others see the new total level */
          case 'equip': { const t = ents.get('p:' + e.p); if (t) { const g = gearOf(core.S.players[e.p]); t.H.setGear(g); hawkify(t, g.ring); } if (mine) { dirty.eq = 1; sfx('equip'); netGear(); } break; }
          case 'quest': if (mine) syncMounts();   /* falls through */
          case 'inv': case 'take': case 'trade': case 'eat': case 'style': case 'run': case 'burden': case 'start':
            if (mine) { dirty.inv = 1; if (e.e === 'take') sfx(e.id === 'coins' ? 'coins' : 'pickup'); if (e.e === 'eat') { sfx('eat'); playOnce(myEnt, 'eat'); } if (e.e === 'take') playOnce(myEnt, 'pickup', 1.6); }
            break;
          case 'shop': if (mine) { hud.openShop(e.shop); faceNpc(e.npc); } break;
          case 'portal': if (mine) {   /* the towns you have touched a portal in (2026-10-04) */
            const L = (e.to || []).map(P => ({ html: 'Travel to <span class="y">' + P.name + '</span>', fn: () => send({ c: 'portal', to: P.id }) }));
            if (!L.length) hud.chat('Touch the town portal in another town, and you can travel there from here.', 'sys');
            else { const r = host.getBoundingClientRect(); hud.menu(r.width / 2, r.height / 2, L); }
            if ((e.unknown || []).length) hud.chat('Not yet attuned: ' + e.unknown.join(', ') + '.', 'sys');
          } break;
          case 'angels': { const t = ents.get('p:' + e.p); if (t) { angelFlare(t.root.position); if (t.H && t.H.play) t.H.play('cast', { loop: false }); } if (mine) sfx('level'); break; }
          case 'teleport': if (mine) {
            if (e.to === 'cavemouth' || e.to === 'caveexit') {   /* the cave's own screen goes up FIRST and gets painted; the heavy part (building the cave or the land) follows behind it */
              const uz = core.M.underAt && core.M.underAt(e.x, e.y), zi2 = uz && ZINDEX && ZINDEX.find(z => z.id === uz);
              caveTravel(e.to === 'cavemouth' ? 'down' : 'up', zi2 ? zi2.name : (core.M.underAt && ZINDEX && (ZINDEX.find(z => z.under) || {}).name) || 'cave');
              CAVE.hold = true; requestAnimationFrame(() => setTimeout(() => { CAVE.hold = false; place(myEnt, e.x, e.y); cam.snap = true; streamRegions(); sfx('equip'); arriveCheck(); }, 30));
            } else { place(myEnt, e.x, e.y); cam.snap = true; streamRegions(); sfx('equip'); arriveCheck(); }
          } break;
          case 'zoneadd': zoneArrived(e, now); break;
          case 'chest': if (mine) { const c = ents.get('n:' + e.npc); if (c) c.H.play('open'); hud.openChest(); } break;   /* the town chest */
          case 'shopclose': if (mine) hud.closeShop(); break;
          case 'mobjump': { const t = ents.get('m:' + e.mob); if (t) { place(t, e.x, e.y); if (t.path) t.path = null; } break; }   /* came through a cave opening */
          case 'poison': if (mine) { hud.setPoison && hud.setPoison(e.on); if (e.on) sfx('miss'); } break;   /* the green Hitpoints orb (2026-10-07) */
          case 'mobeat': { const t = ents.get('m:' + e.mob); if (t && !t.dead) { playOnce(t, 'eat'); sfx('eat', t); } break; }
          case 'tailor': if (mine) { faceNpc(e.npc); openWardrobe(false); } break;
          case 'look': if (mine) { if (me.look && myEnt.H.setOutfit) myEnt.H.setOutfit(me.look); netGear(); } break;
          case 'dialog': if (mine) { hud.dialog(e.name, e.lines); faceNpc(e.npc); sfx('click'); } break;
          case 'weather': if (e.zone === core.weatherZone(zoneHere())) { if (e.say) hud.chat(e.say, 'sys'); showWeather(); } break;
          case 'fire': addFire(e.fire, e.x, e.y); if (e.p === PID || !e.p) sfx('sizzle', e.p === PID ? null : { x: e.x, y: e.y }); break;
          case 'fireout': removeFire(e.fire); break;
          case 'fx': { const t = ents.get('m:' + e.mob); if (!t) break; t.fx = t.fx || {}; t.fx[e.fx] = 1; applyTint(t); const el = hud.fxSplat(e.fx); if (el) t.splats.push({ el, t: performance.now(), k: t.splats.length }); if (e.fx === 'freeze') sfx('freeze', t); break; }
          case 'fxend': { const t = ents.get('m:' + e.mob); if (!t || !t.fx) break; delete t.fx[e.fx]; applyTint(t); break; }
          case 'deplete': for (const r of regions) if (r.built) r.built.setDepleted(e.node, true); if (e.forever && mine) fellTell(e.x, e.y); break;
          case 'regrow': for (const r of regions) if (r.built) r.built.setDepleted(e.node, false); break;
          case 'gather': if (mine && e.ok && e.item) dirty.inv = 1; if (mine && e.ok && !e.item) dirty.inv = 1; break;
          case 'drop': break;
        }
      }
      /* ---------- UNDERGROUND (2026-10-07: the Spider Cave, "dim with torches"): while you stand in an area flagged
         `under` the sky goes black, the fog closes in to ~13 tiles, the daylight dims to a cave's, a warm light goes with
         you and the three torches nearest you really light the rock (a small pool of point lights, moved every second). */
      const CAVE = { on: false, t: 0, me: null, pool: [], keep: null };
      function caveTick(now) {
        const inCave = !!(core.M && core.M.underAt && core.M.underAt(me.x, me.y) != null);
        if (inCave !== CAVE.on) {
          CAVE.on = inCave;
          if (inCave) {
            CAVE.keep = { bg: scene.background.getHex(), fc: scene.fog.color.getHex(), fn: scene.fog.near, ff: scene.fog.far, hemi: hemi.intensity, sun: sun.intensity };
            if (wxMod && wxMod.set) try { wxMod.set('clear', 0, { instant: true }); } catch (e) { /* weather module */ }
            scene.background.setHex(0x030303); scene.fog.color.setHex(0x030303); scene.fog.near = 5; scene.fog.far = 16; hemi.intensity = 0.14; sun.intensity = 0.04;
            /* no light of your own (2026-10-07: "The player should not give off any light. The only light should be coming from the torches") */
            if (!CAVE.pool.length) for (let k = 0; k < 4; k++) { const L = new THREE.PointLight(0xff9a3c, 0, 10, 1.2); scene.add(L); CAVE.pool.push(L); }
            for (const L of CAVE.pool) L.visible = true;
          } else {
            const K = CAVE.keep || {}; scene.background.setHex(K.bg != null ? K.bg : SKY); scene.fog.color.setHex(K.fc != null ? K.fc : SKY); scene.fog.near = K.fn || 24; scene.fog.far = K.ff || 52;
            hemi.intensity = K.hemi || 1.7; sun.intensity = K.sun || 2.3; for (const L of CAVE.pool) L.visible = false;
            wxShown = ''; showWeather(true);
          }
        }
        if (!inCave || !CAVE.pool.length) return;
        if (now - CAVE.t > 1000) {   /* the torches nearest you get the lights */
          CAVE.t = now;
          const near = (core.M.objects || []).filter(o => o.k === 'torch' && Math.abs(o.x - me.x) < 16 && Math.abs(o.y - me.y) < 16).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
          CAVE.pool.forEach((L, k) => { const o = near[k]; if (!o) { L.intensity = 0; return; } L.position.set(o.x + 0.5, heightAt(o.x + 0.5, o.y + 0.5) + 1.6, o.y + 0.5); L.intensity = 3.2; });
        }
        for (const L of CAVE.pool) if (L.intensity > 0) L.intensity = 3.0 + Math.sin(now * 0.013 + L.position.x) * 0.3 + Math.sin(now * 0.031 + L.position.z) * 0.18;   /* flicker */
      }
      /* ---------- DAY AND NIGHT (2026-10-07: "Add an orbiting sun that orbits the globe once every 24 hours make it dark
         ashvale as of one hour ago is sunset"; "Have the sun create the shadows on the ground"). The sun circles the planet's
         equator once a day of real time; at SUN_EPOCH it set over Ashvale (90 degrees west of it) and it moves west 360 degrees a
         day - the Atlas uses the same rule (src/earth.js). Where you stand: its height above your horizon sets the daylight,
         the sky and the light's colour, and the light (with the shadows) comes from its direction; under the horizon a faint
         bluish moon, opposite it, casts the shadows. */
      const SUN_EPOCH = 1791353761, DAY_S = 86400;
      const SUNL = { dir: [-0.45, 0.8, 0.3], key: '', b: null, lonA: null, base: new THREE.Color(SKY), col: new THREE.Color() };
      const NIGHT_SKY = new THREE.Color(0x0b1426), DUSK_SKY = new THREE.Color(0xd8865a), SUNC = new THREE.Color(0xfff0d6), DUSKC = new THREE.Color(0xffa060), MOONC = new THREE.Color(0x9fb4ff);
      function sphereAt(x, y) { const WG = D.wg, C = DATA.globecfg; if (!WG || !WG.toSphere || !C || !C.origin) return null; const fx = x + C.origin[0] + 0.5, fy = -(y + C.origin[1]) - 0.5; return [WG.toSphere(C.face, fx, fy), WG.toSphere(C.face, fx + 1, fy), WG.toSphere(C.face, fx, fy - 1)]; }
      function sunAt(tms) {   /* the sun's direction from the planet's centre */
        if (SUNL.lonA == null) { const a = sphereAt(22, 52); SUNL.lonA = a ? Math.atan2(a[0][1], a[0][0]) : 0; }   /* Ashvale's longitude (by the well) */
        const L = SUNL.lonA - Math.PI / 2 - 2 * Math.PI * ((tms / 1000 - SUN_EPOCH) / DAY_S);
        return [Math.cos(L), Math.sin(L), 0];
      }
      const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      function dayTick() {
        const key = (me.x >> 3) + ':' + (me.y >> 3);
        if (key !== SUNL.key) { const a = sphereAt(me.x, me.y); SUNL.key = key; SUNL.b = a ? { u: nrm3(a[0]), e: nrm3(sub3(a[1], a[0])), s: nrm3(sub3(a[2], a[0])) } : null; }   /* up, game east (+x), game south (+y) */
        const B = SUNL.b; if (!B) return;
        const s = sunAt(Date.now()), up = dot3(s, B.u), ex = dot3(s, B.e), so = dot3(s, B.s);
        const day = Math.min(1, Math.max(0, (up + 0.08) / 0.2)), dusk = Math.max(0, 1 - Math.abs(up) / 0.18);   /* 1 by day, 0 by night; dusk near the horizon */
        const lit = up > -0.02, d = lit ? [ex, Math.max(up, 0.06), so] : [-ex, Math.max(-up, 0.25), -so];        /* the moon: opposite the sun */
        const l = Math.hypot(d[0], d[1], d[2]); SUNL.dir = [d[0] / l, d[1] / l, d[2] / l];
        sun.intensity = lit ? 0.5 + 1.8 * day : 0.22; sun.color.copy(lit ? SUNC : MOONC); if (lit && dusk > 0) sun.color.lerp(DUSKC, dusk * 0.8);
        hemi.intensity = 0.13 + 1.57 * day;   /* dark at night (the operator: "make it dark"): torches and fires carry it */
        /* the sky: the weather's colour (the weather module repaints it every frame), toward dusk orange and the night's blue */
        const base = wxMod ? scene.background : SUNL.base;
        SUNL.col.copy(base).lerp(DUSK_SKY, dusk * 0.45 * day + dusk * 0.25).lerp(NIGHT_SKY, 1 - day);
        scene.background.copy(SUNL.col); scene.fog.color.copy(SUNL.col);
      }
      /* ---------- HAND TORCHES (2026-10-07: "a torch ... hold it at night and illuminate his surroundings"): whoever holds
         one (the off hand) carries a warm flickering light of its Light radius - you, and up to three players near you */
      const TORCH = { me: null, pool: [] };
      /* any item worn or held with a Light value lights round you - a torch, a glowing helmet, the Spider Queen's Crown (the operator
         2026-10-07: "Or other illuminating items ... the spider queen's crown should be illuminating"); the brightest counts */
      const LIGHTC = { torch: 0xffa040 }, lightOf = ids => { let best = 0, col = 0xffa040; for (const id of ids) { const d = id && core.item(id); if (d && d.light > best) { best = d.light; col = d.id === 'hat_spidercrown' ? 0xc89aff : LIGHTC[d.id] || 0xffc070; } } return [best, col]; };
      function torchTick(now) {
        if (!TORCH.me) { TORCH.me = new THREE.PointLight(0xffa040, 0, 8, 1.3); scene.add(TORCH.me); for (let k = 0; k < 3; k++) { const L = new THREE.PointLight(0xffa040, 0, 8, 1.3); scene.add(L); TORCH.pool.push(L); } }
        const flick = 1 + Math.sin(now * 0.017) * 0.08 + Math.sin(now * 0.041) * 0.05;
        const [r0, c0] = lightOf(Object.values(me.eq || {}).map(s => s && s.id)), P0 = myEnt.root.position;
        TORCH.me.intensity = r0 ? 2.8 * flick : 0; if (r0) { TORCH.me.distance = r0 + 1; TORCH.me.color.setHex(c0); TORCH.me.position.set(P0.x - 0.3, P0.y + 1.7, P0.z); }
        const near = []; for (const r of remotes.values()) { const g = r.e && r.e.H && r.e.H.gear; if (!g) continue; const [rr, cc] = lightOf(Object.values(g)); if (rr) near.push([r, rr, Math.hypot(r.e.root.position.x - P0.x, r.e.root.position.z - P0.z), cc]); }
        near.sort((a, b) => a[2] - b[2]);
        TORCH.pool.forEach((L, k) => { const n = near[k]; if (!n || n[2] > 30) { L.intensity = 0; return; } const q = n[0].e.root.position; L.position.set(q.x - 0.3, q.y + 1.7, q.z); L.distance = n[1] + 1; L.color.setHex(n[3]); L.intensity = 2.8 * flick; });
      }
      /* ---------- weather visuals: the weather module (src/weather.js, its own inscription) when it is loaded, else scene fog */
      let wxShown = '', wxMod = null;
      try { const W = G.ASH3D && G.ASH3D.get && G.ASH3D.get('weather'); if (W && W.createWeather) wxMod = W.createWeather(THREE, { scene, camera, quality: isPhone ? 'low' : 'high' }); } catch (er) { console.warn('weather module', er && er.message); }
      const WXLOOK = { clear: [SKY, 24, 52], fog: [0xb8bec4, 3, 16], rain: [0x7d8fa0, 14, 38], snow: [0xdfe6ec, 10, 30] };
      function showWeather(instant) {
        if (CAVE.on) return;   /* underground there is no weather (caveTick puts it back on the way out) */
        const w = core.weatherOf(zoneHere()) || { kind: 'clear', intensity: 0 }, key = w.kind + ':' + w.intensity; if (key === wxShown) return; wxShown = key;
        if (wxMod) { wxMod.set(w.kind, w.intensity / 100, { instant: !!instant }); return; }
        const L = WXLOOK[w.kind] || WXLOOK.clear, C = WXLOOK.clear, k = w.kind === 'clear' ? 0 : w.intensity / 100;
        const col = new THREE.Color(C[0]).lerp(new THREE.Color(L[0]), k);
        SUNL.base.copy(col); scene.fog.color.copy(col); scene.background.copy(col); scene.fog.near = C[1] + (L[1] - C[1]) * k; scene.fog.far = C[2] + (L[2] - C[2]) * k;
      }
      /* ---------- campfires (host-owned, shared) and status effects on monsters */
      const fires = new Map();
      function addFire(uid, x, y) {
        if (fires.has(uid)) return;
        const g = new THREE.Group(), gy = heightAt(x + 0.5, y + 0.5);
        const logM = new THREE.MeshLambertMaterial({ color: 0x5a3c24, flatShading: true }), stoneM = new THREE.MeshLambertMaterial({ color: 0x77736a, flatShading: true });
        for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.09), logM); l.rotation.y = k * PI / 4; l.position.y = 0.06; l.castShadow = true; g.add(l); }
        for (let k = 0; k < 7; k++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), stoneM); st.position.set(Math.cos(k * 0.9) * 0.36, 0.05, Math.sin(k * 0.9) * 0.36); g.add(st); }
        const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 6), new THREE.MeshBasicMaterial({ color: 0xff8a20 })); f1.position.y = 0.32; g.add(f1);
        const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a })); f2.position.y = 0.26; g.add(f2);
        const px = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 8), proxyMat); px.position.y = 0.3; px.userData.pick = { kind: 'node', i: core.idx(x, y) }; g.add(px); proxies.push(px);
        g.position.set(x + 0.5, gy, y + 0.5); g.userData = { f1, f2, px, ph: uid * 1.7 }; scene.add(g); fires.set(uid, g);
      }
      function removeFire(uid) { const g = fires.get(uid); if (!g) return; scene.remove(g); const i = proxies.indexOf(g.userData.px); if (i >= 0) proxies.splice(i, 1); fires.delete(uid); burstSmall(g.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x777777); }
      const TINT = { freeze: ['#9fd8ff', 0.55], stun: ['#fff3a0', 0.35], poison: ['#7fd36a', 0.35], burn: ['#ff8a3a', 0.35], slow: ['#b0b0ff', 0.25] };
      function applyTint(t) {
        const ks = Object.keys(t.fx || {}), k = ks.find(x => x === 'freeze') || ks[0], tc = k && TINT[k];
        if (t.H.setTint) t.H.setTint(tc ? tc[0] : null, tc ? tc[1] : 0);
        if (t.H.setFrozen) t.H.setFrozen(!!(t.fx && (t.fx.freeze || t.fx.stun)));
      }
      function faceNpc(id) { const n = ents.get('n:' + id); if (n) { n.tyaw = Math.atan2(myEnt.to.x - n.to.x, myEnt.to.z - n.to.z); n.facing = 1; } }
      function npcsTurnBack() { for (const n of core.M.npcs) { const e = ents.get('n:' + n.id); if (e && e.facing && e.homeYaw != null && !n.patrol && !n.guard && Math.max(Math.abs(n.x - me.x), Math.abs(n.y - me.y)) > 6) { e.facing = 0; e.tyaw = e.homeYaw; } } }   /* back to their own spot once you walk off */
      let insideRoof = false;
      /* the floor bar (the operator: "hard to find how to get back down"): while you are in a building with storeys, which floor
         you are on and a button each way; PageUp / PageDown do the same */
      const floorBar = document.createElement('div');
      floorBar.style.cssText = 'position:absolute;left:50%;top:12px;transform:translateX(-50%);display:none;gap:6px;align-items:center;padding:6px 8px;background:rgba(30,22,14,.88);border:1px solid #8a6a3a;border-radius:8px;color:#f0e2c0;font:600 13px system-ui,sans-serif;z-index:20';
      floorBar.innerHTML = '<span data-f></span><button data-d="-1" style="font:inherit;padding:4px 9px;border-radius:6px;border:1px solid #c08a3a;background:#5a3a1c;color:#ffe2a8;cursor:pointer">&#9660; Downstairs</button><button data-d="1" style="font:inherit;padding:4px 9px;border-radius:6px;border:1px solid #6a5a3a;background:#3a2c1c;color:#f0e2c0;cursor:pointer">&#9650; Upstairs</button>';
      host.appendChild(floorBar);
      let floorKey = '';
      function climbFromBar(dir) { const bi = core.M.buildingAt ? core.M.buildingAt(me.x, me.y) : -1; if (bi < 0) return; const B = core.M.buildings[bi], lv = me.lv || 0; if ((dir < 0 && lv <= 0) || (dir > 0 && lv >= B.floors - 1)) return; send({ c: 'climb', dir, x: B.stairs[0], y: B.stairs[1] }); }
      floorBar.querySelectorAll('[data-d]').forEach(b => { b.onclick = (e) => { e.stopPropagation(); climbFromBar(+b.dataset.d); }; b.onpointerdown = (e) => e.stopPropagation(); });
      window.addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'PageDown') { climbFromBar(-1); e.preventDefault(); } else if (e.key === 'PageUp') { climbFromBar(1); e.preventDefault(); } });
      function floorBarCheck() {
        const bi = core.M.buildingAt ? core.M.buildingAt(me.x, me.y) : -1, B = bi >= 0 ? core.M.buildings[bi] : null, lv = me.lv || 0;
        const key = B ? bi + ':' + lv : '';
        if (key === floorKey) return; floorKey = key;
        if (!B) { floorBar.style.display = 'none'; return; }
        floorBar.style.display = 'flex';
        if (B.deck && !deckHint) { deckHint = true; hud.chat('The castle walls can be walked: tap any flight of stone steps inside the walls (two are beside the gate) to climb up, or press Up. On the wall, tap where to go; tap the top of the steps to come down.', 'info'); }
        floorBar.querySelector('[data-f]').textContent = B.deck ? (lv === 0 ? 'Castle yard' : 'On the wall') : lv === 0 ? 'Ground floor (' + B.floors + ' floors)' : 'Floor ' + (lv + 1) + ' of ' + B.floors;
        floorBar.querySelector('[data-d="-1"]').style.display = lv > 0 ? '' : 'none';
        floorBar.querySelector('[data-d="1"]').style.display = lv < B.floors - 1 ? '' : 'none';
      }
      let stairHint = false, deckHint = false;
      function roofCheck() {
        floorBarCheck();
        if (!stairHint && (me.lv || 0) > 0 && !(me.bld >= 0 && core.M.buildings[me.bld] && core.M.buildings[me.bld].deck)) { stairHint = true; hud.chat('Upstairs. The way down is the opening in the floor with the amber arrow - click it, or press Downstairs / Page Down.', 'info'); }
        let inside = false;
        let inRf = null;
        for (const r of regions) if (r.built) for (const rf of r.built.roofs) if (me.x >= rf.x0 && me.x <= rf.x1 && me.y >= rf.y0 && me.y <= rf.y1) { inside = true; inRf = rf; }
        /* inside a building: the roof and every storey above your floor are see-through; your floor and those below stay */
        const lvNow = me.lv || 0, key = inside ? (inRf.x0 + ',' + inRf.y0 + ':' + lvNow) : '';
        if (key !== insideRoof) {
          insideRoof = key;
          for (const r of regions) if (r.built) for (const rf of r.built.roofs) {
            const here = rf === inRf;
            rf.g.visible = !here;
            if (rf.storeys) rf.storeys.forEach((sg, i) => { sg.visible = !here || i + 1 <= lvNow; });
          }
        }
      }

      /* ---------- little particle bursts (level up, respawn) */
      const bursts = [], burstGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07), wingGeo = new THREE.ConeGeometry(0.1, 0.62, 5);
      function angelFlare(pos) {
        burst(pos, 0xf4e4a8);
        for (const side of [-1, 1]) {
          const m = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({ color: 0xf7f4ee }));
          m.position.copy(pos).add(new THREE.Vector3(side * 0.28, 1.25, 0));
          m.rotation.z = side * -0.7;
          m.userData.v = new THREE.Vector3(side * 0.35, 1.5, 0);
          m.userData.t = 0; m.userData.life = 1.15;
          scene.add(m); bursts.push(m);
        }
      }
      function burst(pos, color) { for (let k = 0; k < 18; k++) { const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color })); m.position.copy(pos).add(new THREE.Vector3(0, 1.2, 0)); const a = k / 18 * 2 * PI; m.userData.v = new THREE.Vector3(Math.cos(a) * 1.6, 2 + (k % 3), Math.sin(a) * 1.6); m.userData.t = 0; scene.add(m); bursts.push(m); } }

      /* ---------- sound: tiny WebAudio synth (no files) */
      let ac = null;
      /* 2026-10-06: "Sounds should not be heard everywhere they should only be heard in the surrounding 15 tiles."
         A sound with a place (an entity, or a tile {x, y}) plays at full volume within HEAR_FULL tiles of you, fades out to
         silence at HEAR tiles and is not played beyond; your own sounds (no place) always play. */
      const HEAR = 15, HEAR_FULL = 8;
      function sfx(name, at) {
        if (!settings.sound) return;
        let vol = 1;
        if (at && myEnt) {
          const P0 = myEnt.root.position, px = at.root ? at.root.position.x : at.x + 0.5, pz = at.root ? at.root.position.z : at.y + 0.5;
          const d = Math.hypot(px - P0.x, pz - P0.z); if (d > HEAR) return;
          vol = d <= HEAR_FULL ? 1 : 1 - (d - HEAR_FULL) / (HEAR - HEAR_FULL);
        }
        try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { return; }
        const t = ac.currentTime, out = ac.createGain(); out.gain.value = 0.22 * vol; out.connect(ac.destination);
        const tone = (f, d, type, v, f2, at) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t + (at || 0)); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (at || 0) + d); g.gain.setValueAtTime(v || 0.5, t + (at || 0)); g.gain.exponentialRampToValueAtTime(0.001, t + (at || 0) + d); o.connect(g); g.connect(out); o.start(t + (at || 0)); o.stop(t + (at || 0) + d + 0.02); };
        const noise = (d, freq, v, q2) => { const n = ac.createBufferSource(), b = ac.createBuffer(1, Math.max(1, ac.sampleRate * d | 0), ac.sampleRate), a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; n.buffer = b; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q2 || 1; const g = ac.createGain(); g.gain.setValueAtTime(v || 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); n.connect(f); f.connect(g); g.connect(out); n.start(t); };
        switch (name) {
          case 'hit': noise(0.12, 900, 0.9); tone(140, 0.12, 'square', 0.25, 60); break;
          case 'miss': noise(0.08, 2400, 0.25, 2); break;
          case 'swing': noise(0.18, 1800, 0.25, 3); break;
          case 'bow': tone(420, 0.12, 'triangle', 0.4, 180); noise(0.2, 3000, 0.15, 4); break;
          case 'cast': tone(300, 0.3, 'sine', 0.35, 900); tone(600, 0.25, 'triangle', 0.12, 1500); break;
          case 'coins': tone(1500, 0.06, 'square', 0.12); tone(2000, 0.08, 'square', 0.12, 0, 0.07); break;
          case 'pickup': tone(500, 0.07, 'triangle', 0.3, 800); break;
          case 'level': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.35, 0, i * 0.12)); break;
          case 'chop': noise(0.07, 600, 0.8, 2); tone(220, 0.05, 'square', 0.15); break;
          case 'mine': tone(1800, 0.12, 'triangle', 0.3, 1500); noise(0.05, 4000, 0.3, 2); break;
          case 'splash': noise(0.3, 1200, 0.35, 0.7); break;
          case 'sizzle': noise(0.4, 5000, 0.12, 0.5); break;
          case 'eat': noise(0.06, 1500, 0.4, 3); noise(0.06, 1300, 0.3, 3); break;
          case 'equip': noise(0.08, 2600, 0.3, 6); tone(900, 0.05, 'square', 0.08); break;
          case 'die': tone(300, 0.9, 'sawtooth', 0.25, 60); break;
          case 'mobdie': tone(200, 0.4, 'square', 0.15, 70); break;
          case 'click': tone(1200, 0.03, 'square', 0.06); break;
          case 'freeze': tone(1800, 0.25, 'sine', 0.2, 2600); noise(0.3, 6000, 0.15, 3); break;
        }
      }

      /* ---------- camera (RuneScape-style orbit) */
      const cam = { yaw: PI * 0.12, pitch: 0.92, dist: isPhone ? 9 : 11, tyaw: PI * 0.12, tpitch: 0.92, tdist: isPhone ? 9 : 11, snap: true, keys: {} };
      const camT = new THREE.Vector3();
      function updateCamera(dt) {
        const k = cam.keys;
        if (k.ArrowLeft) cam.tyaw -= 2.2 * dt; if (k.ArrowRight) cam.tyaw += 2.2 * dt; if (k.ArrowUp) cam.tpitch += 1.2 * dt; if (k.ArrowDown) cam.tpitch -= 1.2 * dt;
        cam.tpitch = Math.max(myEnt.hawk ? 0.72 : 0.3, Math.min(1.42, cam.tpitch)); cam.tdist = Math.max(4.5, Math.min(myEnt.hawk ? 48 : 24, cam.tdist));   /* zoom vision while a hawk: twice as far out, looking down so the view stays on loaded land */
        const s = cam.snap ? 1 : Math.min(1, dt * 10);
        cam.yaw += (cam.tyaw - cam.yaw) * s; cam.pitch += (cam.tpitch - cam.pitch) * s; cam.dist += (cam.tdist - cam.dist) * s;
        const p = myEnt.root.position; const tg = new THREE.Vector3(p.x, p.y + 1.0, p.z);
        if (cam.mode === 'creator') {   /* close-up, the character turned to face the camera, a little right of centre */
          cam.tyaw = myEnt.yaw; cam.tpitch = 0.2; cam.tdist = isPhone ? 3.2 : 3.6; tg.y = p.y + 0.95;
          const side = host.clientWidth > 500 ? 0.55 : 0.4; tg.x -= Math.cos(cam.yaw) * side; tg.z += Math.sin(cam.yaw) * side;
        }
        if (cam.snap) camT.copy(tg); else camT.lerp(tg, Math.min(1, dt * 12));
        cam.snap = false;
        camera.position.set(camT.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, camT.y + Math.sin(cam.pitch) * cam.dist, camT.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
        const gy = heightAt(camera.position.x, camera.position.z) + 0.6; if (camera.position.y < gy) camera.position.y = gy;
        camera.lookAt(camT);
        sun.position.set(camT.x + SUNL.dir[0] * 20, camT.y + SUNL.dir[1] * 20, camT.z + SUNL.dir[2] * 20); sun.target.position.copy(camT);   /* from the real sun (or the moon) */
      }

      /* ---------- picking: what is under a screen point */
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      const _seeV = new THREE.Vector3(), _seeS = new THREE.Vector2();
      function targetsAt(cx, cy) {
        const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const objs = proxies.filter(px => { const e = px.userData.ent; return !e || (!e.dead && e.root.visible); });
        for (const r2 of regions) if (r2.built && regionDist(r2, me.x, me.y) <= 45) objs.push.apply(objs, r2.built.pickables);   /* only what is near (seeded chunks are many) */
        const hits = ray.intersectObjects(objs, false), out = [], seen = new Set();
        for (const h of hits) {
          let t = h.object.userData.pick; if (!t) continue;
          if (t.kind === 'tree' || t.kind === 'ground' || t.kind === 'deckpick') { const reg = regions.find(r2 => r2.built && (r2.built.pickables.indexOf(h.object) >= 0)); t = reg ? reg.built.pickInfo(h) : null; if (!t) continue; }
          if (t.kind === 'ground') { const x = Math.floor(t.point.x), y = Math.floor(t.point.z); t = { kind: 'ground', x, y }; }
          if (t.kind === 'self') continue;
          if (t.kind === 'node' && h.point) t = Object.assign({}, t, { hp: [h.point.x, h.point.z] });   /* where on the tree you tapped (a hawk perches on that side) */
          if (t.kind === 'remote' && !remotes.has(t.id)) continue;
          const k = t.kind + ':' + (t.uid || t.id || t.i || (t.x + ',' + t.y)); if (seen.has(k)) continue; seen.add(k); out.push(t);
          if (t.kind === 'ground') break;
        }
        /* upstairs (a storey, a castle wall walk): the tile you tap is on YOUR floor, not on the ground under it - the ray
           meets the plane you stand on (2026-10-05: the Saltmere stairs "very hard to navigate": a tap on the
           opening upstairs used to land on the ground tile a storey below, metres away) */
        if (((me.lv || 0) > 0 || (core.M.lifts && core.M.liftAt(me.x, me.y) > 0)) && myEnt) {
          const pt = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -myEnt.root.position.y), new THREE.Vector3());
          const gi = out.findIndex(t => t.kind === 'ground');
          if (pt) { const g = { kind: 'ground', x: Math.floor(pt.x), y: Math.floor(pt.z) }; if (gi >= 0) out[gi] = g; else out.push(g); }
        }
        /* characters and loot win over trees in front of them (a canopy should not eat the click) */
        const pri = t => t.kind === 'mob' || t.kind === 'npc' || t.kind === 'item' ? 0 : t.kind === 'node' || t.kind === 'remote' || t.kind === 'passage' || t.kind === 'caveout' ? 1 : 2;
        out.sort((a, b) => pri(a) - pri(b));
        /* phones: a tap close to a monster counts as tapping it */
        if (isTouch && !out.some(t => t.kind === 'mob' || t.kind === 'npc' || t.kind === 'item')) {
          let best = null, bd = 34;
          for (const m of core.S.mobs) { if (m.dead) continue; const e = ents.get('m:' + m.uid); if (!e) continue; const s = toScreen(e.root.position, (e.H.height || 1) * e.scale * 0.5); if (!s) continue; const d = Math.hypot(s.x - (cx - r.left), s.y - (cy - r.top)); if (d < bd) { bd = d; best = m; } }
          if (best) out.unshift({ kind: 'mob', uid: best.uid });
        }
        return out;
      }
      function lvColor(l) { const d = l - core.combatLevel(me); return d > 9 ? '#ff0000' : d > 6 ? '#ff3000' : d > 3 ? '#ff7000' : d > 0 ? '#ffb000' : d === 0 ? '#ffff00' : d > -4 ? '#c0ff00' : d > -7 ? '#80ff00' : '#40ff00'; }
      function optionsFor(t) {
        const esc = s => String(s).replace(/</g, '&lt;');
        if (t.kind === 'mob') { const m = core.mobByUid(t.uid), d = D.monsters[m.key], cb = core.mobCombat(d); const nm = '<span class="y">' + esc(d.name) + '</span> <span style="color:' + lvColor(cb) + '">(combat-' + cb + ')</span>'; return [{ html: 'Attack ' + nm, act: { c: 'attack', uid: t.uid }, red: 1 }, { html: 'Examine ' + nm, fn: () => hud.chat(d.name + ': combat ' + cb + ' (' + (cb > core.combatLevel(me) ? 'stronger than you' : cb === core.combatLevel(me) ? 'evenly matched' : 'weaker than you') + '), ' + d.hp + ' hitpoints, hits up to ' + d.max + '.' + (d.aggro ? ' Aggressive.' : ''), 'sys') }]; }
        if (t.kind === 'npc') { const n = NPCN[t.id], nm = '<span class="y">' + esc(n.name) + '</span>'; const o = []; if (n.tailor) { o.push({ html: 'Change-look ' + nm, act: { c: 'npc', id: n.id }, red: 1 }); o.push({ html: 'Trade ' + nm, act: { c: 'npc', id: n.id, trade: 1 }, red: 1 }); }
          else if (n.chest) o.push({ html: 'Open ' + nm, act: { c: 'npc', id: n.id }, red: 1 });
          else if (n.portal) o.push({ html: 'Use ' + nm, act: { c: 'npc', id: n.id }, red: 1 });
          else if (n.shop) o.push({ html: 'Trade ' + nm, act: { c: 'npc', id: n.id }, red: 1 }); else o.push({ html: 'Talk-to ' + nm, act: { c: 'npc', id: n.id }, red: 1 }); o.push({ html: 'Examine ' + nm, fn: () => hud.chat(n.shop ? n.name + ' runs the ' + core.shop(n.shop).name + '.' : (n.examine || n.name + ', the village elder.'), 'sys') }); return o; }
        if (t.kind === 'item') { const g = core.S.ground.find(q2 => q2.uid === t.uid); if (!g) return []; const d = core.item(g.id), nm = '<span class="o">' + esc(d.name) + (g.n > 1 ? ' (' + g.n + ')' : '') + '</span>'; return [{ html: 'Take ' + nm, act: { c: 'take', uid: g.uid }, red: 1 }, { html: 'Examine ' + nm, fn: () => hud.chat(hud.examine(g.id, g.n), 'sys') }]; }
        if (t.kind === 'node' && core.isHawk(me)) { const n = core.nodeAt(t.i); if (n && core.nodeDef(n).skill === 'woodcutting') {
          const hp = t.hp || [n.x + 0.5, n.y + 0.5], dx = hp[0] - (n.x + 0.5), dy = hp[1] - (n.y + 0.5), sx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, sy = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
          return [{ html: 'Perch in <span class="c">tree</span>', act: { c: 'perch', x: n.x, y: n.y, sx: sx || 1, sy } }]; } }
        if (t.kind === 'node') { const n = core.nodeAt(t.i); if (!n) return []; const nd = core.nodeDef(n), verb = n.kind === 'range' || n.kind === 'fire' ? 'Cook-at' : nd.skill === 'woodcutting' ? 'Chop down' : nd.skill === 'mining' ? 'Mine' : 'Net', nm = '<span class="c">' + nd.name + '</span>'; return [{ html: verb + ' ' + nm, act: { c: 'gather', x: n.x, y: n.y }, red: 1 }, { html: 'Examine ' + nm, fn: () => hud.chat(nd.name + (nd.req ? ': needs ' + nd.skill + ' level ' + nd.req + '.' : '.'), 'sys') }]; }
        if (t.kind === 'caveout') {   /* the cave's way out, up top: it only goes up (2026-10-07: "it should inform them in the chat that there is no way down") */
          const nm = '<span class="c">Cave opening</span>', say = () => hud.chat("The shaft drops away steep and narrow into the dark. There's no way down from here.", 'sys');
          return [{ html: 'Enter ' + nm, fn: say, act: null }, { html: 'Examine ' + nm, fn: () => hud.chat('A narrow opening in the rock. A cold draught breathes up out of it.', 'sys') }]; }
        if (t.kind === 'passage') { const o = core.passageAt(t.x, t.y); if (!o) return []; const nm = '<span class="c">' + esc(o.name || (o.k === 'cavemouth' ? 'Cave' : 'Way out')) + '</span>';
          return [{ html: esc(o.label || 'Go through'), act: { c: 'enter', x: o.x, y: o.y }, red: 1 },
                  { html: 'Examine ' + nm, fn: () => hud.chat(o.k === 'cavemouth' ? 'A dark opening in the rock. Webs hang just inside, and the air smells of damp and old fur.' : 'A ladder up to a shaft of daylight.', 'sys') }]; }
        if (t.kind === 'remote') {
          const r = remotes.get(t.id); if (!r) return [];
          /* the combat level next to the name, coloured like a monster's (2026-10-06) */
          const pp = core.S.players[t.id], cb = pp ? core.combatLevel(pp) : 0;
          const nm = '<span class="w">' + esc(label(r.name, r.from)) + '</span>' + (cb ? ' <span style="color:' + lvColor(cb) + '">(combat-' + cb + ')</span>' : ''), o = [];
          /* only in the long-press / right-click menu (2026-10-05: trading "you should have to long click or right click on
             them"; "another function of the long press on another player should be the ability to follow them") - a plain tap
             on a player walks there (tapAt skips players) */
          if (trade && trade.available() && room && !room.me.guest && !r.from.guest) o.push({ html: 'Trade with ' + nm, fn: () => trade.open(r.from) });
          o.push({ html: 'Follow ' + nm, fn: () => startFollow(t.id) });
          o.push({ html: 'View stats ' + nm, fn: () => hud.playerStats(label(r.name, r.from), r.skills || (pp ? Object.fromEntries(Object.keys(pp.xp).map(k => [k, core.lv(pp, k)])) : {}), cb) });
          o.push({ html: 'Examine ' + nm, fn: () => hud.chat(label(r.name, r.from) + ': another adventurer on the arcade.', 'sys') });
          return o;
        }
        if (t.kind === 'ground') {
          const out = [], bi = core.M.buildingAt ? core.M.buildingAt(t.x, t.y) : -1;
          if (bi >= 0) {   /* the stairs: Climb up / Climb down */
            const B = core.M.buildings[bi], lvM = me.lv || 0;
            if (B.deck) {   /* a castle wall walk (the operator: "still no way for me as a player to walk on the walls"): a tap ANYWHERE on a
                               flight of steps, or next to it, climbs up; on the wall a tap on or next to the top of a flight climbs down */
              const onFlight = q => { const x0 = Math.min(q[0], q[2]), x1 = Math.max(q[0], q[2]); return t.x >= x0 - 1 && t.x <= x1 + 1 && Math.abs(t.y - q[1]) <= 1; };
              const f = B.flights.find(q => lvM > 0 ? (Math.abs(t.x - q[2]) <= 1 && Math.abs(t.y - q[3]) <= 1) : onFlight(q));
              if (f) { out.push(lvM > 0 ? { html: 'Climb down <span class="c">Steps</span>', act: { c: 'climb', dir: -1, x: f[2], y: f[3] } } : { html: 'Climb up <span class="c">Wall steps</span>', act: { c: 'climb', dir: 1, x: f[0], y: f[1] } }); out.push({ html: 'Walk here', act: { c: 'walk', x: t.x, y: t.y } }); return out; }
            } else
            if (Math.abs(t.x - B.stairs[0]) <= 1 && Math.abs(t.y - B.stairs[1]) <= 1) {
              const up = lvM < B.floors - 1 ? { html: 'Climb up <span class="c">Stairs</span>', act: { c: 'climb', dir: 1, x: t.x, y: t.y } } : null;
              const down = lvM > 0 ? { html: 'Climb down <span class="c">Stairs</span>', act: { c: 'climb', dir: -1, x: t.x, y: t.y } } : null;
              /* only the stairs THEMSELVES climb on a left click (the operator: "if I accidentally move into a stair, it just brings
                 me up or down randomly"): the flight up says Climb up, the opening in the floor says Climb down; anywhere else
                 near them a click walks, and the climbs are in the right-click menu after Walk here */
              const hole = lvM > 0 && core.M.flightOf ? core.M.flightOf(bi, lvM - 1) : null, onHole = !!hole && t.x === hole[0] && t.y === hole[1];
              const flight = core.M.flightOf ? core.M.flightOf(bi, lvM) : B.stairs, onFlight = lvM < B.floors - 1 && t.x === flight[0] && t.y === flight[1];
              if (onHole && down) out.push(down); else if (onFlight && up) out.push(up);
              else { out.push({ html: 'Walk here', act: { c: 'walk', x: t.x, y: t.y } }); for (const o of [up, down]) if (o) out.push(o); return out; }
            }
          }
          out.push({ html: 'Walk here', act: { c: 'walk', x: t.x, y: t.y } });
          return out;
        }
        return [];
      }
      function doAct(o, sx, sy) { if (o.act) { send(o.act); if (sx != null) { const r = host.getBoundingClientRect(); hud.marker(sx - r.left, sy - r.top, o.red); } if (o.act.c === 'walk') flag = [o.act.x, o.act.y]; else flag = null; } else if (o.fn) o.fn(); }
      let flag = null;
      /* The operator: "a single click should make the character walk, a double click should make the character run". The first
         tap starts walking at once; a second tap within 300 ms near the same spot upgrades the same move to a run.
         @yourfirstname (AV16, via a tester 2026-10-03): "run as a toggle; holding shift does the opposite while held",
         so a plain click obeys the Run setting and a second click means run, and Shift flips whichever it was about to
         do. The toggle is a setting and defaults off, so the default stays exactly what it was: one click walks. */
      let lastTap = null, shiftHeld = false;
      const runFor = (base) => shiftHeld ? !base : base;   /* Shift inverts whatever the click would otherwise do */
      function tapAt(cx, cy) {
        const now = performance.now();
        if (lastTap && now - lastTap.t < 300 && Math.hypot(cx - lastTap.x, cy - lastTap.y) < 40 && lastTap.act) {
          const up = Object.assign({}, lastTap.act, { run: runFor(true) }); lastTap = null; send(up); hud.hideMenu(); return;
        }
        const ts = targetsAt(cx, cy).filter(t => t.kind !== 'remote'); if (!ts.length) { const g = groundAt(cx, cy); if (g) ts.push({ kind: 'ground', x: g.x, y: g.y }); else return; }
        const o = optionsFor(ts[0])[0];
        if (o) { if (o.act) o.act = Object.assign({}, o.act, { run: runFor(!!settings.runToggle) }); doAct(o, cx, cy); lastTap = { t: now, x: cx, y: cy, act: o.act || null }; }
        hud.hideMenu();
      }
      function menuAt(cx, cy) {
        const ts = targetsAt(cx, cy), list = [];
        for (const t of ts) for (const o of optionsFor(t)) list.push(o);
        if (!ts.some(t => t.kind === 'ground')) { const g = groundAt(cx, cy); if (g) list.push({ html: 'Walk here', act: { c: 'walk', x: g.x, y: g.y } }); }
        const r = host.getBoundingClientRect();
        hud.menu(cx - r.left, cy - r.top, list.map(o => ({ html: o.html, fn: () => doAct(o, cx, cy) })));
      }
      function groundAt(cx, cy) { for (const r2 of regions) if (r2.built) { const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); const h = ray.intersectObject(r2.built.terrain, false)[0]; if (h) return { x: Math.floor(h.point.x), y: Math.floor(h.point.z) }; } return null; }
      /* following another player: re-walk to where they stand whenever they move away; any action of your own stops it */
      let follow = null;
      function startFollow(id) { const r = remotes.get(id); if (!r) return; follow = { id, at: null }; hud.chat('You follow ' + label(r.name, r.from) + '. Tap anywhere to stop.', 'sys'); }
      function followTick() {
        if (!follow) return;
        const r = remotes.get(follow.id);
        if (!r || !r.buf.length || performance.now() - r.heard > 20000) { hud.chat('You lost sight of them.', 'sys'); follow = null; return; }
        const b = r.buf[r.buf.length - 1], tx = Math.floor(b.x), ty = Math.floor(b.z), d = Math.max(Math.abs(me.x - tx), Math.abs(me.y - ty));
        if (d > 2 && (!follow.at || follow.at[0] !== tx || follow.at[1] !== ty || !me.path.length)) { core.cmd(PID, { c: 'walk', x: tx, y: ty, run: d > 6 }); follow.at = [tx, ty]; }
      }
      function send(c) { if (follow) { follow = null; hud.chat('You stop following.', 'sys'); } core.cmd(PID, c); if (c.c === 'walk' || c.c === 'attack' || c.c === 'npc' || c.c === 'take' || c.c === 'gather') { hud.closeShop(); if (hud.closeChest) hud.closeChest(); } sfx('click'); }

      /* ---------- input: touch (tap / drag / pinch / long-press), mouse, wheel, keys */
      const ptrs = new Map(); let pinch = null, suppressTap = false, lpTimer = null, lpFired = false;
      canvas.addEventListener('contextmenu', e => { e.preventDefault(); menuAt(e.clientX, e.clientY); });
      canvas.addEventListener('pointerdown', e => {
        try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, b: e.button, type: e.pointerType });
        if (ptrs.size === 2) {
          const [a, b] = Array.from(ptrs.values()); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2, dist: cam.tdist, yaw: cam.tyaw, pitch: cam.tpitch }; suppressTap = true; clearTimeout(lpTimer);
        } else if (ptrs.size === 1) {
          suppressTap = false; lpFired = false; clearTimeout(lpTimer);
          if (e.pointerType !== 'mouse') lpTimer = setTimeout(() => { const p = ptrs.get(e.pointerId); if (p && p.moved < 10) { lpFired = true; menuAt(p.x, p.y); } }, 480);
        }
      });
      canvas.addEventListener('pointermove', e => {
        const p = ptrs.get(e.pointerId);
        if (!p) { if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY); return; }
        const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
        if (ptrs.size >= 2 && pinch) {
          const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
          cam.tdist = pinch.dist * pinch.d / Math.max(20, d); let da = ang - pinch.ang; if (da > PI) da -= 2 * PI; if (da < -PI) da += 2 * PI;
          cam.tyaw = pinch.yaw - da; cam.tpitch = pinch.pitch + (my - pinch.my) * 0.005; return;
        }
        const rotating = p.b === 1 || (p.moved > (p.type === 'mouse' ? 5 : 9));
        if (rotating) { clearTimeout(lpTimer); cam.tyaw -= dx * 0.0085; cam.tpitch += dy * 0.006; }
      });
      const endPtr = e => {
        const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); clearTimeout(lpTimer);
        if (ptrs.size < 2) pinch = null;
        if (!p || e.type === 'pointercancel') return;
        if (!suppressTap && !lpFired && p.moved < (p.type === 'mouse' ? 6 : 12) && p.b === 0 && ptrs.size === 0) tapAt(e.clientX, e.clientY);
        if (ptrs.size === 0) suppressTap = false;
      };
      canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
      canvas.addEventListener('wheel', e => { e.preventDefault(); cam.tdist *= e.deltaY > 0 ? 1.12 : 1 / 1.12; }, { passive: false });
      window.addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'Shift') shiftHeld = true; if (/^Arrow/.test(e.key)) { cam.keys[e.key] = true; e.preventDefault(); } });
      window.addEventListener('keyup', e => { cam.keys[e.key] = false; if (e.key === 'Shift') shiftHeld = false; });
      window.addEventListener('blur', () => { cam.keys = {}; shiftHeld = false; });
      let hoverT = 0;
      function hoverAt(cx, cy) {
        const now = performance.now(); if (now - hoverT < 70) return; hoverT = now;
        const ts = targetsAt(cx, cy); if (!ts.length) { hud.setHover(''); canvas.style.cursor = 'default'; return; }
        const all = []; for (const t of ts) for (const o of optionsFor(t)) if (o.act) all.push(o);
        const o = optionsFor(ts[0])[0];
        hud.setHover(o ? o.html + (all.length > 1 ? ' <span style="color:#fff">/ ' + (all.length - 1) + ' more options</span>' : '') : '');
        canvas.style.cursor = ts[0].kind === 'ground' ? 'default' : 'pointer';
      }

      /* ---------- other players: ONE ROOM PER REGION, A HOST PER AREA (2026-10-02: "when players move from one zone
         to the other, they disappear to anyone in the other zone. If the zones are adjacent then the player should be
         visible"; "I don't think anything in Dogecoin arcade needs to be changed"). The room is the region you stand in
         (core.regionOf: 512 m squares; the village and Whisperwood share one), so everyone nearby sees everyone, across
         zone borders. Inside the room each AREA (a zone, or a 128 m square of seeded land) has its own host, elected among
         the members standing in it; monsters, loot, fires and weather of an area come only from its host. Players near a
         region border also VIEW the neighbour region's room (net.neighbours, below). Avatars are drawn 150 ms behind, interpolated. */
      const remotes = new Map(); let room = null, roomZone = null, netT = 0, joining = false, retryAt = 0;
      /* CONNECTION WATCH (2026-10-06: "When a player loses connection to the server, they should be notified so they
         don't continue to play on a broken server"). A room can die without ever saying 'closed' (the arcade node restarts
         and the page's link to it never comes back): then you play on alone and nobody sees you. Signs, all from what the
         game already does: our own sends keep failing; or other players are in the room (every game sends at least a 1 Hz
         heartbeat) and none has been heard from for 45 s - that one first reconnects quietly, since a friend's tab in the
         background goes quiet too. A loud loss shows the HUD's connection banner (Reload) until the room is back. */
      const NW = { heard: 0, fails: 0, lost: false, was: false, quiet: 0, quietTry: false, tries: 0 };
      function netDrop(why, loud) {
        const old = room; room = null; dropRemotes(); hosts.clear(); passive = false; applyAuth(); hud.setOnline(false);
        if (old) { try { old.leave(); } catch (e) { /* gone already */ } }
        retryAt = 0; NW.fails = 0;
        if (loud) { NW.lost = true; NW.tries = 0; hud.netLost && hud.netLost(true, 'net', why); } else NW.quietTry = true;
      }
      function netWatch() {
        if (!room) return;
        const now = performance.now(), others = (room.members ? room.members().length : 1) > 1;
        if (NW.fails >= 6) netDrop('your messages are not getting through', true);
        else if (others && NW.heard && now - NW.heard > 45000 && now - NW.quiet > 180000) { NW.quiet = now; netDrop('', false); }
      }
      function zoneHere() { return core.zoneOf(me.x, me.y); }
      const label = (name, from) => name + ' (' + (from.tag ? '@' + from.tag : 'guest') + ')';   /* @tag = stamped by the arcade node */
      /* a player's total level above the name over their head (2026-10-05) */
      const setTag = (el, name, from, total) => { const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); el.innerHTML = (total ? '<span class="tl">Total level ' + total + '</span><br>' : '') + esc(label(name, from)); };
      /* A name is told once, in the gear message at a join or an equip. A remote that goes quiet for 12 s is dropped
         and built again from the next message about it, which is normally a bare position - and the rebuilt one came
         out wearing the default "Adventurer" for good, because nothing re-tells the name. The last name heard for an
         id is kept here so a rebuild starts from what was already learned about that player. */
      const knewName = new Map();
      function dropRemote(id) { const r = remotes.get(id); if (r) { if (r.name && r.name !== 'Adventurer') knewName.set(id, r.name); removeEnt(r.e); remotes.delete(id); } if (core.S.players[id] && core.S.players[id].puppet) core.removePlayer(id); }
      function dropRemotes() { for (const id of Array.from(remotes.keys())) dropRemote(id); }
      /* fighting a monster of another area (the operator: attackers can be attacked back across borders): we tell the room which
         area we are fighting in, so that area gets a host even when nobody stands in it; 6 s after the last blow it ends */
      let lastCombat = null;
      function combatZone() {
        const here = zoneHere();
        if (me.act && me.act.k === 'attack') { const m = core.mobByUid(me.act.uid); if (m && m.zone !== here && !m.dead) return m.zone; }
        if (lastCombat && performance.now() - lastCombat.t < 6000 && lastCombat.zone !== here && !me.dead) return lastCombat.zone;
        return null;
      }
      function noteCombat(e) {
        const mob = typeof e.src === 'number' && e.dst === PID ? e.src : e.src === PID && typeof e.dst === 'number' ? e.dst : null;
        if (mob == null) return; const m = core.mobByUid(mob); if (m) lastCombat = { zone: m.zone, t: performance.now() };
      }
      /* ONE DEVICE AT A TIME (2026-10-06: the same player on two devices showed one character jumping between two
         spots). Every game of a signed-in player also joins the room 'one.<address>'; the arcade stamps each sender's
         address, so only that player's own games can speak there. A game that opens says 'claim' with its session id:
         every OLDER game of that player that hears it stops (no saves, no network, a notice with Play here instead).
         Heartbeats every 15 s cover a lost claim: of two sessions that hear each other, the one that started later wins.
         Same-id messages are let through (two devices may share an id) and our own echo is told apart by the session. */
      const ONE = { sid: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), at: Date.now(), room: null, addr: null, t: 0, said: 0 };
      function evicted() {
        if (stopped) return;
        stopped = true; hud.showHelp && hud.showHelp(false); hud.hideMenu && hud.hideMenu(); hud.elsewhere && hud.elsewhere();
        const R = room; room = null; dropRemotes(); hud.setOnline(false); if (R) R.leave();
        if (nb) nb.update([], []);
        if (bank.room) { try { bank.room.leave(); } catch (e) { /* gone */ } bank.room = null; }
        if (ONE.room) { ONE.room.leave(); ONE.room = null; } clearInterval(ONE.t);
      }
      async function oneDevice(who) {
        if (!who || who.guest || !who.address || ONE.addr === who.address) return;
        ONE.addr = who.address;
        const res = await net.join('one.' + who.address, { game: 'ashvale', loopback: q.has('loopback') });
        if (!res || !res.online || stopped) return;
        const R = ONE.room = res.room;
        const say = claim => { if (ONE.room === R && !stopped) { ONE.said = Date.now(); R.send({ t: 'dev', s: ONE.sid, at: ONE.at, claim: !!claim }); } };
        R.on('message', ev => {
          const m = ev.data || {};
          if (!stopped && m.t === 'dm' && ev.from && ev.from.address && ev.from.address !== who.address && !ev.from.guest && typeof m.text === 'string') {   /* a direct message to us */
            hud.chat('From ' + (ev.from.tag ? '@' + ev.from.tag : ev.from.address.slice(0, 8) + '...') + ': ' + m.text.slice(0, 120), 'dm'); sfx('click'); return;
          }
          if (stopped || m.t !== 'dev' || m.s === ONE.sid || !ev.from || ev.from.address !== who.address) return;
          if (m.claim || m.at > ONE.at || (m.at === ONE.at && String(m.s) > ONE.sid)) evicted();
          else if (Date.now() - ONE.said > 3000) say(false);   /* the other is older: make sure it hears us */
        }, { self: true });
        R.on('join', () => say(false));
        say(true); ONE.t = setInterval(() => say(false), 15000);
      }
      /* NEW VERSION (2026-10-06): every 3 minutes look up the newest registry, by the launcher's own rule (newest
         @ashvale registry this loader can run). A newer one than ours: save now and tell the player to leave, refresh the
         Games tab and come back in. */
      const VER = { mine: ((G.ASH3D && G.ASH3D._values && G.ASH3D._values.$registry) || {}).version | 0, told: 0 };
      async function versionCheck() {
        if (stopped || !VER.mine || VER.told || !/^https?:/.test(location.protocol)) return;
        try {
          const L = await (await fetch('/r/inscriptions?creator=nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c&limit=10')).json();
          let v = 0; for (const x of L || []) { const j = x && x.json; if (j && j.ashvale3d === 'registry' && (j.loader || 1) <= (G.ASH3D.LOADER || 1)) v = Math.max(v, j.version | 0); }
          if (v > VER.mine) { VER.told = v; persist(); hud.newVersion && hud.newVersion(v); hud.chat('A new version of ASHVALE is out. Leave the game, refresh your Games tab and open ASHVALE again.', 'sys'); }
        } catch (e) { /* offline for now: the next check */ }
      }
      if (VER.mine) setInterval(versionCheck, 180000);
      async function netRoom() {
        const z = core.regionOf(me.x, me.y); if ((z === roomZone && (room || performance.now() < retryAt)) || joining) return;
        joining = true; roomZone = z;
        if (nb) { const ids = nb.rooms().map(R => R.id).filter(i => i !== z); nb.update([], ids); }   /* never in one room twice: the region we walk into stops being a neighbour */
        try {
          if (room) { const old = room; room = null; dropRemotes(); hosts.clear(); applyAuth(); await old.leave(); }
          hosts.clear(); electedOnce = false; myJoin = Date.now(); joinedAt = performance.now(); passive = true; applyAuth();   /* passive until the hosts are known */
          const res = await net.join(z, { game: 'ashvale', loopback: q.has('loopback') });
          hud.setOnline(!!(res && res.online));
          if (res && res.online) { NW.heard = performance.now(); NW.fails = 0; NW.was = true; NW.quietTry = false; if (NW.lost) { NW.lost = false; hud.netLost && hud.netLost(false); hud.chat('Back in touch with other players.', 'sys'); } }
          else if (NW.was && (NW.lost || NW.quietTry)) { NW.quietTry = false; NW.tries++; if (!NW.lost) NW.lost = true; hud.netLost && hud.netLost(true, 'net', 'the arcade is not answering' + (NW.tries > 2 ? ': reload the page' : ', still trying')); }
          if (res && res.online && core.regionOf(me.x, me.y) === z) {
            const R = res.room; room = R; myNetId = R.me.id; oneDevice(R.me); netStatus = res.backend + ' as ' + (R.me.tag ? '@' + R.me.tag : 'guest');
            { let h = 2166136261; for (let i = 0; i < myNetId.length; i++) h = Math.imul(h ^ myNetId.charCodeAt(i), 16777619) >>> 0; core.uidSpace(1 + h % 4095); }   /* my own uid space for things I create as a host */
            R.on('message', ev => { if (room === R) onNet(ev); });
            R.on('message', () => { if (room === R) NW.heard = performance.now(); }); R.on('join', () => { if (room === R) NW.heard = performance.now(); }); R.on('leave', () => { if (room === R) NW.heard = performance.now(); });
            R.on('leave', ev => { if (room !== R) return; dropRemote(ev.from.id); elect(); });
            R.on('join', () => { if (room !== R) return; clearTimeout(gearT); gearT = setTimeout(() => { netGear(); if (hosted.size) fullSnap(); }, 600); });   /* newcomers missed our gear/outfit/name: send it again (one resend for a burst of joins) */
            R.on('closed', why => { if (room !== R) return; room = null; dropRemotes(); hosts.clear(); passive = false; applyAuth(); hud.setOnline(false); NW.lost = true; NW.tries = 0; hud.netLost && hud.netLost(true, 'net', why || ''); hud.chat('Lost contact with other players' + (why ? ' (' + why + ')' : '') + '. Retrying soon.', 'sys'); retryAt = performance.now() + 15000; });
            netGear();
            if (R.me && !R.me.guest && R.me.address && R.me.address !== walletState.address) { walletState.address = R.me.address; walletRefresh(); }
            if (!trade && deps.trade) trade = deps.trade.create({ host, toast: (t, k) => hud.chat(t, k || 'trade'), send: (to, obj) => netSend({ tr: obj, to }), offerable: tradeOfferable, onSettled: tradeSettled, itemOf: p => { const j = p && p.json; if (!j || !allowedAsset(p)) return null; const k = j.key || ((j.attributes || []).find(a => a && a.trait_type === 'Key') || {}).value; const d = k && core.item(k); return d ? { key: k, name: d.name, icon: (() => { try { return MOD.icon(k, 64); } catch (e) { return null; } })() } : null; }, nameOf: id => { const r = remotes.get(id); return r ? label(r.name, r.from) : 'another player'; } });
          } else { netStatus = res && res.why ? 'solo (' + res.why + ')' : 'solo'; retryAt = performance.now() + 60000; passive = false; applyAuth(); }
        } catch (e) { console.warn('net', e && e.message); retryAt = performance.now() + 30000; passive = false; applyAuth(); }
        joining = false;
      }
      /* NEIGHBOUR REGIONS (2026-10-02: "If the zones are adjacent then the player should be visible"; 2026-10-04: game-
         agnostic, no Arcade change). Within NB_NEAR m of a region edge we also join the next region's room through the
         generic net.neighbours, as a VIEWER: we draw its players and send it a small presence (nb:1: position, look, name,
         every 1.5 s) and nothing else - no host election, no monsters, no intents. Viewers in OUR room are drawn the same
         way and never elected. NB_KEEP > NB_NEAR so walking along a border does not join and leave over and over. */
      const NB_NEAR = 40, NB_KEEP = 56;
      function regionsAround(x, y, d) {
        const s = new Set(); for (const o of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [d, -d], [-d, d], [-d, -d]]) s.add(core.regionOf(x + o[0], y + o[1]));
        s.delete(core.regionOf(x, y)); s.delete(roomZone); return Array.from(s);
      }
      let nbT = 0, nbPosT = 0, nbPosKey = '', nbGearT = 0, nbGearRefT = 0;
      const nb = net.neighbours && q.has('nb') ? net.neighbours({   /* off until it is proven next to the adjacent-zones test: ?nb turns it on */ game: 'ashvale', loopback: q.has('loopback'), max: 3, on: {
        message: (rid, ev) => onNet(ev, rid),
        join: (rid, ev) => { clearTimeout(nbGearT); nbGearT = setTimeout(nbGear, ev.self ? 0 : 600); },   /* we arrived, or somebody did: they need our look */
        leave: (rid, ev) => { const r = remotes.get(ev.from.id); if (r && r.via === rid) dropRemote(ev.from.id); },
        closed: (rid) => { for (const [id, r] of Array.from(remotes)) if (r.via === rid) dropRemote(id); }
      } }) : null;
      function netNeighbours(now) {
        if (!nb || joining || now - nbT < 1000) return; nbT = now;
        if (!room) { nb.update([], []); return; }
        nb.update(regionsAround(me.x, me.y, NB_NEAR), regionsAround(me.x, me.y, NB_KEEP));
        const rooms = nb.rooms(); if (!rooms.length) return;
        const p = myEnt.root.position, an = myEnt.oneShot ? myEnt.lastOne || 'idle' : myEnt.loco || 'idle', key = p.x.toFixed(1) + ',' + p.z.toFixed(1) + ',' + an;
        if (now - nbPosT >= (key === nbPosKey ? 4000 : 1500)) {   /* moving: every 1.5 s; standing: a 4 s heartbeat (remotes drop after 12 s of silence) */
          nbPosT = now; nbPosKey = key;
          const m = { s: Math.round(now), p: [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100], f: Math.round(myEnt.yaw * 100) / 100, a: an, k: myEnt.toolId || 0, nb: 1 };
          for (const R of rooms) netSend(m, R);
        }
        if (now - nbGearRefT > 15000) nbGear();
      }
      function nbGear() {
        if (!nb) return; nbGearRefT = performance.now();
        for (const R of nb.rooms()) { netSend({ g: gearOf(me), n: me.name, nb: 1 }, R); if (myEnt.H.outfit) netSend({ o: myEnt.H.outfit, nb: 1 }, R); }
      }
      let netStatus = 'connecting', gearT = 0, lastPosKey = '', trade = null;
      /* the wallet (2026-10-04: tradable NFTs as your inventory, tradable tokens as your Gold): read-only, from the
         arcade's public views of the signed-in player's address; guests and solo play have none */
      /* A page opened on this machine's preview (port 8098) reads the local arcade. The published
         game is served by the arcade itself, so it keeps the same-origin wallet and the signed-in player. */
      const localPreview = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.port === '8098';
      const arcadeBase = q.get('arcade') || (localPreview ? 'http://127.0.0.1:8420' : '');
      const hintedAddr = q.get('wallet') || '';
      const hintedTag = q.get('wallettag') || (localPreview ? 'yourfirstname' : '');
      const WAL = deps.wallet && DATA.assets ? deps.wallet.create({ assets: DATA.assets, base: arcadeBase }) : null;
      const walletState = { status: WAL ? 'signed-out' : 'off', data: null, address: hintedAddr || null, error: '' };
      /* trips (plan phase C): play settled in fixed time windows (the operator: time-based, not town-based), for the judge (tools/judge3d_tail.js).
         The seed comes from the arcade viewer this page runs in (the same parent bridge the 2D game uses). */
      function bridge(msg, kind, ms) { return new Promise(ok => { if (!G.parent || G.parent === G) { ok({ error: 'open this inside DogecoinArcade' }); return; }
        const seq = Date.now() + Math.random(); let done = false;
        const on = ev => { const m = ev.data || {}; if (m.arcade !== kind || m.seq !== seq || m.heard) return; done = true; removeEventListener('message', on); ok(m); };
        addEventListener('message', on); G.parent.postMessage(Object.assign({ arcade: kind, seq }, msg), '*');
        setTimeout(() => { if (!done) { removeEventListener('message', on); ok({ error: 'open this inside DogecoinArcade' }); } }, ms || 6000); }); }
      const TKEY = 'ashvale3d.trips', tripKeep = { load: () => { try { return JSON.parse(G.localStorage.getItem(TKEY) || '[]'); } catch (e) { return []; } },
        save: (L) => { try { G.localStorage.setItem(TKEY, JSON.stringify(L)); } catch (e) { /* private window */ } } };
      let tripSeen = 0;
      const TRIP = deps.trip ? deps.trip.create({ core, pid: PID, ticks: (D.rules.trip || {}).ticks, bridge, keep: tripKeep, facts: () => { const w = walletState.data; return w ? { tokens: Object.assign({}, w.raw || {}), pieces: (w.pieces || []).slice() } : null; }, onChange: (st) => {
        if (st.done.length > tripSeen) { const L = st.done[st.done.length - 1], k = L.rec.kills.length, g = Object.values(L.rec.gathered).reduce((a, b) => a + b, 0);
          void k; void g;   /* no chat line (2026-10-05: it said 'practice: no arcade seed', but rewards come from the @ashvale Bank as you play, not from these windows) */ }
        tripSeen = st.done.length;
      } }) : null;
      if (TRIP) { tripSeen = TRIP.state().done.length; addEventListener('pagehide', () => TRIP.close()); }
      /* AUTOMATIC claims (2026-10-04: "The game should never ask permission to transact in game assets. It should
         just happen automatically"): every settled window is sent to each pool it could win from (data module 'pools',
         plan phase D), one claim at a time, at most 3 a minute (the referee judges 3 replays per wallet a minute). No
         buttons. The pool's referee decides; a refused claim is simply dropped. A window is cleared once every pool
         answered. Until pools exist, settled windows wait in the list. */
      const POOLS = (DATA.pools && DATA.pools.pools) || [], XPT = (DATA.pools && DATA.pools.xpTokens) || {};
      const AUD = deps.audit ? deps.audit.create(AshCore, { items: D.items, monsters: D.monsters, shops: D.shops, quests: D.quests, rules: D.rules }) : null;
      /* the page runs the referee's own rules (src/audit.js) with the window's seed and the facts the referee holds for
         it, so it only claims pools it will be paid from - a window is a handful of claims, not one per pool */
      function mayWin(P, d) {
        if (!AUD || !d.facts) return P.kind === 'resource' ? ((d.rec.gathered || {})[P.item] | 0) > 0 : d.rec.kills.length > 0;
        try { return !!AUD.judge(d.seed, d.rec, Object.assign({}, P, { facts: d.facts, xpTokens: XPT })).won; } catch (e) { return false; }
      }
      let claiming = false;
      async function claimNext() {
        if (!TRIP || claiming || !POOLS.length) return;
        const L = TRIP.state().done; let i = -1, P = null;
        for (let k = 0; k < L.length && !P; k++) { const d = L[k]; if (!d.seed) continue; d.tried = d.tried || {};
          for (const q of POOLS) if (!d.tried[q.pool] && mayWin(q, d)) { i = k; P = q; break; }
          if (!P) { TRIP.claimed(k); return; } }
        if (!P) return;
        claiming = true;
        try {
          const d = L[i], r = await bridge({ secret: P.secret, pool: P.pool, replay: { seed: d.seed, inputs: d.rec } }, 'claim', 120000);
          d.tried[P.pool] = r && r.ok ? 'ok' : 'no'; tripKeep.save(L);
          if (r && r.ok) hud.chat('Earned: ' + (r.piece || P.label || 'a prize') + ' - on its way to your wallet.', 'info');
          if (r && r.ok && WAL) setTimeout(walletRefresh, 60000);
        } finally { claiming = false; }
      }
      if (TRIP && POOLS.length) setInterval(claimNext, 21000);
      async function walletRefresh() {
        if (!WAL) return walletState;
        let addr = (room && room.me && !room.me.guest && room.me.address) || hintedAddr || walletState.address;
        if (!addr && hintedTag) {
          try {
            const t = await fetch((arcadeBase || '') + '/r/tag/' + encodeURIComponent(hintedTag));
            const j = t.ok ? await t.json() : null;
            if (j && j.address) addr = j.address;
          } catch (e) { /* the tag view is optional */ }
        }
        if (!addr) { walletState.status = 'signed-out'; hud.refresh('wallet'); return walletState; }
        walletState.address = addr; walletState.status = 'loading'; hud.refresh('wallet');
        try { walletState.data = await WAL.load(addr); walletState.status = 'ready'; walletState.error = ''; ledgerFor(addr); }
        catch (e) { walletState.status = 'error'; walletState.error = String(e && e.message || e); }
        hud.refresh('wallet'); return walletState;
      }
      /* ---------- the town chest + the @ashvale Bank (handoff/bank_plan.md; 2026-10-04: bag and chest are one
         arcade wallet, "we just have to keep the game state"). The ledger, per wallet address, in this browser:
           bag[k]    delivered wallet units you carry     spent[k]   delivered units eaten/sold/dropped (not yet back with @ashvale)
           pend[k]   carried units the Bank has promised but not delivered yet     pspent[k]  promised units used up meanwhile
         chest = wallet - bag - spent; loose (carried, not in the wallet and not promised) = carried - bag - pend.
         Only delivered units can be stored; a promise is kept until the wallet shows it (2026-10-04: an item was
         duplicated and stored ones were lost while deliveries were still on their way). A deposit asks the Bank (realtime
         room 'bank', its sender proved by the mesh) to mint or grant the loose things to your own address. */
      const bank = { room: null, joining: null, sent: {}, busy: false, note: '', arriving: 0 };
      const CKEY = a => 'ashvale3d.chest.' + a;
      let ledger = null;
      const walCounts = () => { const D = walletState.data, o = {}; if (D) { for (const k in D.gear) o[k] = D.gear[k].length; for (const k in D.tokens) o[k] = (o[k] || 0) + D.tokens[k]; o.coins = D.gold || 0; } return o; };
      const carriedOf = k => core.invCount(me, k) + Object.values(me.eq || {}).filter(q => q && q.id === k).length;
      function ledgerFor(addr) {
        if (ledger && ledger.addr === addr) return ledger;
        let L = null; try { L = JSON.parse(G.localStorage.getItem(CKEY(addr)) || 'null'); } catch (e) { /* private window */ }
        if (!L) {   /* first time for this wallet: what you already carry and the wallet holds counts as from the wallet */
          const w = walCounts(); L = { bag: {}, spent: {} };
          for (const k in w) { const c = carriedOf(k); if (c && w[k]) L.bag[k] = Math.min(c, w[k]); }
        }
        L.bag = L.bag || {}; L.spent = L.spent || {}; L.pend = L.pend || {}; L.pspent = L.pspent || {}; L.gone = L.gone || {}; L.autoTake = L.autoTake || {}; L.pchest = L.pchest || {}; L.lchest = L.lchest || {};
        L.addr = addr; ledger = L; return L;
      }
      const ledgerSave = () => { if (!ledger) return; try { G.localStorage.setItem(CKEY(ledger.addr), JSON.stringify({ bag: ledger.bag, spent: ledger.spent, pend: ledger.pend, pspent: ledger.pspent, out: ledger.out || {}, gone: ledger.gone || {}, autoTake: ledger.autoTake || {}, pchest: ledger.pchest || {}, lchest: ledger.lchest || {} })); } catch (e) { /* private window */ } };
      function chestState() {
        if (!walletState.data || !walletState.address) return { chest: {}, loose: {}, bank, arriving: bank.arriving };
        const L = ledgerFor(walletState.address), w = walCounts(), keys = new Set(Object.keys(w).concat(Object.keys(L.bag), Object.keys(L.spent), Object.keys(L.pend), Object.keys(L.pspent), Object.keys(L.gone), Object.keys(L.autoTake), Object.keys(L.pchest), Object.keys(L.lchest)));
        for (const s of me.inv) if (s) keys.add(s.id);
        for (const q of Object.values(me.eq || {})) if (q) keys.add(q.id);
        const chest = {}, loose = {}, before = JSON.stringify([L.bag, L.spent, L.pend, L.pspent, L.gone, L.autoTake, L.pchest, L.lchest]); let arriving = 0;
        const g = (o, k) => o[k] || 0, put = (o, k, v) => { if (v > 0) o[k] = v; else delete o[k]; };
        for (const k of keys) {
          let c = carriedOf(k); const wk = w[k] || 0;
          let bag = g(L.bag, k), spent = g(L.spent, k), pend = g(L.pend, k), pspent = g(L.pspent, k), gone = g(L.gone, k), pch = g(L.pchest, k);
          /* 1. used up (eaten, sold, dropped): promised units first, then delivered ones */
          let x = bag + pend - c;
          if (x > 0) { const d = Math.min(x, pend); pend -= d; pspent += d; x -= d; const e = Math.min(x, bag); bag -= e; spent += e; }
          /* 1b. picked back up (your own death pile, something you dropped): a used-up unit whose NFT or token is still in
             your wallet, and not on its way back to @ashvale, is yours again - never a new deposit (2026-10-04) */
          if (x < 0) { const away = ((L.out && L.out[k]) || []).reduce((a, o) => a + o.n, 0), back = Math.min(-x, Math.max(0, spent - away)); spent -= back; bag += back; x += back;
            const bp = Math.min(-x, pspent); pspent -= bp; pend += bp; }
          /* 2. arrived: wallet units beyond what is counted turn promises into deliveries */
          let av = wk - bag - spent - gone;
          if (av > 0) { const d = Math.min(av, pend); pend -= d; bag += d; av -= d; const e = Math.min(av, pspent); pspent -= e; spent += e; const f = Math.min(av, pch); pch -= f; }   /* stored-while-arriving units land in the chest */
          /* 2b. only when the Bank said this count does not add up (a stale count, one per device): the wallet's unclaimed
             units stand for what you carry. New loot never eats your chest (the operator: a second steel helmet is a new one). */
          if (L.absorb && L.absorb[k] && av > 0 && c - bag - pend > 0) { const d = Math.min(av, c - bag - pend); bag += d; av -= d; }
          if (L.absorb) delete L.absorb[k];
          /* 3. the wallet holds less (traded away, or spent units went back to @ashvale) */
          let over = bag + spent + gone - wk;
          if (over > 0) { const gd = Math.min(over, gone); gone -= gd; over -= gd; }   /* a trade settled on chain */
          if (over > 0) { const d = Math.min(over, spent); spent -= d; over -= d;
            if (over > 0 && bag > 0) { L.short = L.short || {}; const sh = L.short[k]; if (sh && sh.n === over && walletState.data.at - sh.at > 20000) { const m = Math.min(over, bag, core.invCount(me, k)); if (m > 0) { core.storeItem(PID, k, m); c -= m; hud.chat('Your ' + core.item(k).name + ' went to its new owner.', 'info'); } delete L.short[k]; bag -= Math.min(over, bag); } else if (!sh || sh.n !== over) L.short[k] = { n: over, at: walletState.data.at }; over = 0; }   /* a trade on the arcade: the item leaves your bag once two wallet reads agree */
            bag -= Math.min(over, bag);
            if (d && L.out && L.out[k]) { let r = d; L.out[k] = L.out[k].filter(o => { if (r > 0 && o.st === 'sent') { r -= o.n; return false; } return true; }); } }   /* a return landed */
          /* traded in: the piece goes into your bag as soon as your wallet shows it (the operator: trade from and into your inventory) */
          const at = L.autoTake[k]; if (at && at.n > 0) { if (Date.now() > at.until) delete L.autoTake[k]; else { const free = wk - bag - spent - gone; const m = Math.min(at.n, free); if (m > 0) { core.grantItem(PID, k, m); bag += m; c += m; at.n -= m; if (at.n <= 0) delete L.autoTake[k]; } } }
          put(L.bag, k, bag); put(L.spent, k, spent); put(L.pend, k, pend); put(L.pspent, k, pspent); put(L.gone, k, gone); put(L.pchest, k, pch);
          const lch = g(L.lchest, k), ch = wk - bag - spent - gone + pch + lch; if (ch > 0) chest[k] = ch;   /* + what you stored before it arrived, or before it was even deposited */
          if (lch > 0) loose[k] = (loose[k] || 0) + lch;   /* stored-but-new still goes to the Bank */
          const lo = c - bag - pend; if (lo > 0) loose[k] = (loose[k] || 0) + lo;
          arriving += pend + pspent + pch;
        }
        if (JSON.stringify([L.bag, L.spent, L.pend, L.pspent, L.gone, L.autoTake, L.pchest, L.lchest]) !== before) ledgerSave();
        bank.arriving = arriving;
        return { chest, loose, bank, arriving, bag: Object.assign({}, L.bag), pend: Object.assign({}, L.pend) };
      }
      /* ---------- returns: what you used up goes back to @ashvale (2026-10-04: a dropped Hawk ring stayed in his wallet
         while a friend carried it). A spent unit is sent to @ashvale with the arcade's creator allowance (testnet, no card,
         silent: a send that would need the player's say-so fails instead); whoever picks a drop up is paid that same piece
         from @ashvale's stock by the Bank. On unless rules.returns is false (the creator allowance is live since 2026-10-04 21:30;
         only @ashvale's own pieces and tokens to @ashvale are ever sent, so no card can appear).
         L.out[k] = [{id, n, piece, st: 'pending'|'sent', t}] - what is on its way back, so nothing is sent twice. */
      const RETURNS = !(D.rules && D.rules.returns === false);
      let returning = false;
      async function returnNext() {
        if (!RETURNS || returning || !walletState.data || !walletState.address) return;
        chestState();   /* count what was used up since the last look */
        const L = ledgerFor(walletState.address); L.out = L.out || {};
        const W = walletState.data, now = Date.now();
        for (const k of Object.keys(L.out)) L.out[k] = L.out[k].filter(o => !(o.st === 'sent' && now - o.t > 900000));   /* reflected long ago */
        let pick = null;
        for (const k in L.spent) {
          const away = (L.out[k] || []).reduce((a, o) => a + o.n, 0), n = (L.spent[k] || 0) - away - holdOf(L, k);   /* a fresh drop waits 90 s */
          if (n <= 0) continue;
          const homeOf = (maker) => (maker === YOURFIRST_ADDR || maker === '@yourfirstname' || maker === 'yourfirstname') ? '@yourfirstname' : '@ashvale';
          if (W.gear[k]) { const used = new Set((L.out[k] || []).map(o => o.piece)), dr = (L.dropped || []).filter(d => d.k === k && W.gear[k].indexOf(d.pc) >= 0 && (d.taken || Date.now() - d.t >= HOLD)).map(d => d.pc), pc = dr.find(x => !used.has(x)) || W.gear[k].find(x => !used.has(x)); if (pc) { pick = { k, n: 1, body: { kind: 'inscription', inscription: pc }, piece: pc, home: homeOf(W.makers && W.makers[pc]) }; break; } }
          else if (W.pids && W.pids[k]) { pick = { k, n, body: { kind: 'token', propertyid: W.pids[k], amount: String(n) }, home: homeOf(W.issuers && W.issuers[String(W.pids[k])]) }; break; }
        }
        if (!pick) return;
        returning = true;
        try {
          const r = await fetch('/r/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify(Object.assign({ to: pick.home, label: pick.home === '@yourfirstname' ? 'yourfirstname' : 'ASHVALE', note: pick.home === '@yourfirstname' ? 'Back to yourfirstname' : 'Back to Ashvale', silent: true }, pick.body)) });
          const j = await r.json().catch(() => ({}));
          if (r.status !== 202 || !j.id) { returnsOff = now + 600000; return; }   /* refused: try again in ten minutes */
          const o = { id: j.id, n: pick.n, piece: pick.piece || null, st: 'pending', t: now }; (L.out[pick.k] = L.out[pick.k] || []).push(o); ledgerSave();
          for (let i = 0; i < 240 && o.st === 'pending'; i++) {
            await new Promise(ok => setTimeout(ok, 3000));
            const s = await fetch('/r/send/' + encodeURIComponent(j.id), { credentials: 'same-origin' }).then(x => x.json()).catch(() => null);
            if (!s || s.status === 'pending') continue;
            if (s.status === 'sent') { o.st = 'sent'; o.t = Date.now(); setTimeout(walletRefresh, 60000); }
            else { L.out[pick.k] = L.out[pick.k].filter(q => q !== o); returnsOff = Date.now() + 600000; }
            ledgerSave();
          }
        } catch (e) { returnsOff = now + 600000; }
        finally { returning = false; }
      }
      let returnsOff = 0;
      if (RETURNS) setInterval(() => { if (Date.now() > returnsOff) returnNext(); }, 5000);
      /* ---------- exact NFTs through drops (2026-10-04: "if they drop an NFT and another player picks it up it should
         be the exact same NFT"): the item that falls carries the piece it was. Your own game notes which piece left your
         bag and where; the Bank keeps that piece for whoever picks it up there; your returns send exactly that piece. */
      /* ground holds (2026-10-04: "When an object changes its state from being in your inventory to on the ground or
         from on the ground to in your inventory wait 90 seconds before sending the transaction unless someone else picks it
         up then send it straight"): a drop is not sent back for HOLD ms (pick it up again and nothing is ever sent); a pickup
         is not deposited for HOLD ms; when another player takes your drop it goes at once */
      const HOLD = 90000;
      const holdOf = (L, k) => { const now = Date.now(); return (L.holds || []).filter(h => h.k === k && !h.taken && now - h.t < HOLD).reduce((a, h) => a + h.n, 0); };
      const pickHold = (L, k) => { const now = Date.now(); return (L.picks || []).filter(q => q.k === k && now - q.t < HOLD).reduce((a, q) => a + q.n, 0); };
      /* persisted drops and the @ashvale Bank, whether or not this game's wallet view has loaded yet (2026-10-06: a pickup
         made before it had was never reported, and the Bank kept showing - and would have paid again for - Gold already
         taken): a pickup of anything persisted is reported at once; a drop of a persisted TOKEN (Gold...) is reported by
         amount. A persisted NFT's drop needs its exact piece, so it stays with the wallet code below. */
      function persistTell(e) {
        if (!core.persists || e.x == null || !core.persists(e.id, e.n || 1)) return;
        const tell = o => bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send(o); });
        if (e.e === 'take' && e.p === PID) tell({ t: 'took', v: 1, id: e.id, n: e.n || 1, x: e.x, y: e.y });
        else if ((e.e === 'drop' || e.e === 'xdrop') && (e.owner === PID || e.from === PID) && core.item(e.id) && core.item(e.id).stack) tell({ t: 'drop', v: 3, items: [[e.id, '', e.n || 1]], x: e.x, y: e.y });
      }
      function chestEvent(e) {
        persistTell(e);
        if (!walletState.data || !walletState.address) return;
        const L = ledgerFor(walletState.address), now = Date.now(); L.dropped = L.dropped || []; L.picks = L.picks || []; L.holds = L.holds || [];
        if (e.e === 'take' && e.p !== PID && e.x != null) {   /* someone else took one of your drops: it goes now */
          const h = L.holds.find(q => q.k === e.id && !q.taken && Math.abs(q.x - e.x) <= 2 && Math.abs(q.y - e.y) <= 2 && now - q.t < HOLD);
          if (h) { h.taken = true; const d = L.dropped.find(q => q.k === e.id && !q.taken && Math.abs(q.x - e.x) <= 2 && Math.abs(q.y - e.y) <= 2); if (d) d.taken = true; ledgerSave(); returnsOff = 0; setTimeout(returnNext, 500); }
          return;
        }
        if ((e.e === 'drop' || e.e === 'xdrop') && (e.owner === PID || e.from === PID)) {
          const backedAll = Math.max(0, (L.bag[e.id] || 0) - carriedOf(e.id));
          if (backedAll > 0) { L.holds.push({ k: e.id, n: Math.min(e.n || 1, backedAll), x: e.x, y: e.y, t: now }); L.holds = L.holds.filter(h => now - h.t < 7200000).slice(-100); ledgerSave(); setTimeout(returnNext, HOLD + 1000); }
          /* persisted (2026-10-06: Gold, stones, magical things, anything worth 100+ GOLD stay where they fell until
             somebody picks them up, held by the @ashvale Bank): the Bank is told what lies where, so every player sees it */
          const keep = core.persists && core.persists(e.id, e.n || 1), W = walletState.data, have = W.gear[e.id];
          if (!have || !have.length) return;   /* only NFTs have an identity; tokens are just amounts (persisted ones: persistTell) */
          const out = Object.values(L.out || {}).flat().map(o => o.piece), held = new Set(L.dropped.filter(d => now - d.t < 7200000).map(d => d.pc).concat(out));
          const backed = Math.max(0, (L.bag[e.id] || 0) - carriedOf(e.id)), items = [];
          for (const pc of have) { if (items.length >= Math.min(e.n || 1, backed)) break; if (!held.has(pc)) { items.push([e.id, pc]); L.dropped.push({ k: e.id, pc, x: e.x, y: e.y, t: now }); } }
          if (!items.length) return;
          L.dropped = L.dropped.filter(d => now - d.t < 7200000).slice(-100); ledgerSave();
          bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'drop', v: keep ? 3 : 2, items: keep ? items.map(it => [it[0], it[1], 1]) : items, x: e.x, y: e.y }); });
        } else if (e.e === 'take' && e.p === PID && e.x != null) {
          L.picks.push({ k: e.id, n: e.n || 1, x: e.x, y: e.y, t: now }); L.picks = L.picks.filter(q => now - q.t < 7200000).slice(-100); ledgerSave();
          L.holds = L.holds.filter(h => !(h.k === e.id && !h.taken && Math.abs(h.x - e.x) <= 2 && Math.abs(h.y - e.y) <= 2));   /* your own drop back in your bag: nothing to send */
          setTimeout(depositSoon, HOLD + 1000);
        }
      }
      /* deposits happen by themselves (the operator: "remove that 'put in my wallet' option ... they could cause duplications"):
         whatever you carry that the wallet does not hold yet goes to the Bank within seconds; a kind the Bank refused waits ten minutes */
      let depT = 0;
      function depositSoon() { if (!WAL || depT) return; depT = setTimeout(() => { depT = 0; if (bank.busy || !walletState.data || !walletState.address) return; const C = chestState(); if (Object.keys(C.loose).length) chestDeposit(); }, 2000); }
      setInterval(() => {
        if (!WAL || bank.busy || !walletState.data || !walletState.address) return;
        const C = chestState(); if (Object.keys(C.loose).length) chestDeposit();
      }, 15000);
      setInterval(() => { if (WAL && walletState.address && !document.hidden) walletRefresh(); }, 60000);   /* the chest follows trades and deliveries */
      /* the trade window offers only what you CARRY that your wallet holds (2026-10-04) */
      async function tradeOfferable() {
        if (!walletState.data) await walletRefresh();
        const W = walletState.data, kinds = []; if (!W || !walletState.address) return { kinds, gold: 0 };
        chestState(); const L = ledgerFor(walletState.address);
        const busy = new Set(Object.values(L.out || {}).flat().map(o => o.piece));
        for (const k in L.bag) {
          if (!W.gear[k] || !(L.bag[k] > 0) || !core.invCount(me, k)) continue;   /* in the bag (not worn), delivered */
          const pieces = W.gear[k].filter(pc => !busy.has(pc)).slice(0, Math.min(L.bag[k], core.invCount(me, k))); if (!pieces.length) continue;
          const d = core.item(k); let icon = null; try { icon = MOD.icon(k, 64); } catch (e) { /* none */ }
          kinds.push({ key: k, name: d.name, icon, pieces });
        }
        for (const k in L.bag) {   /* stacks (logs, ore, meat...): any number of them, up to what you carry (2026-10-04) */
          if (k === 'coins' || W.gear[k] || !(W.pids && W.pids[k]) || !(L.bag[k] > 0)) continue;
          const max = Math.min(L.bag[k], core.invCount(me, k)); if (max <= 0) continue;
          const d = core.item(k); let icon = null; try { icon = MOD.icon(k, 64); } catch (e) { /* none */ }
          kinds.push({ key: k, name: d.name, icon, token: W.pids[k], max, pieces: [] });
        }
        return { kinds, gold: Math.min(core.invCount(me, 'coins'), L.bag.coins || 0) };
      }
      function tradeSettled(gave, got) {
        if (!walletState.address) return;
        const L = ledgerFor(walletState.address);
        if (gave) { const k = gave.key || 'coins', n = gave.inscription ? 1 : +gave.amount;
          if (k) { const m = core.storeItem(PID, k, n); L.bag[k] = Math.max(0, (L.bag[k] || 0) - m); L.gone[k] = (L.gone[k] || 0) + m; } }   /* it left your bag */
        if (got) { const k = got.key || 'coins', n = got.inscription ? 1 : +got.amount;
          if (k) L.autoTake[k] = { n: ((L.autoTake[k] || {}).n || 0) + n, until: Date.now() + 1800000 }; }   /* into your bag when it lands */
        ledgerSave(); hud.refresh('all'); for (const t of [20000, 60000, 120000]) setTimeout(walletRefresh, t);
      }
      function chestTake(k, n) {
        const C = chestState(); n = Math.min(n, C.chest[k] || 0); if (n <= 0) return;
        const d = core.item(k), free = me.inv.filter(s => !s).length, room0 = d.stack ? (core.invCount(me, k) || free ? n : 0) : Math.min(n, free);
        if (room0 <= 0) { hud.chat('Your bag is full.', 'warn'); return; }
        core.grantItem(PID, k, room0); const L = ledgerFor(walletState.address), real = Math.max(0, (C.chest[k] || 0) - (L.pchest[k] || 0) - (L.lchest[k] || 0)), fromReal = Math.min(room0, real), fromP = Math.min(room0 - fromReal, L.pchest[k] || 0), fromL = room0 - fromReal - fromP;
        L.bag[k] = (L.bag[k] || 0) + fromReal; L.pchest[k] = (L.pchest[k] || 0) - fromP; L.pend[k] = (L.pend[k] || 0) + fromP; L.lchest[k] = Math.max(0, (L.lchest[k] || 0) - fromL); ledgerSave();
        hud.chat('You take ' + (room0 > 1 ? room0 + ' x ' : '') + d.name + ' from your chest.', 'info'); hud.refresh('all');
      }
      function chestStore(k, n) {
        chestState(); const L = ledgerFor(walletState.address), have = core.invCount(me, k);
        const fromBag = Math.min(n, L.bag[k] || 0, have), fromPend = Math.min(n - fromBag, L.pend[k] || 0, have - fromBag), fromNew = Math.min(n - fromBag - fromPend, have - fromBag - fromPend), m = fromBag + fromPend + fromNew;   /* settled or not, it can go in the chest (2026-10-05) */
        if (m <= 0) return;
        core.storeItem(PID, k, m); L.bag[k] = (L.bag[k] || 0) - fromBag; L.pend[k] = (L.pend[k] || 0) - fromPend; L.pchest[k] = (L.pchest[k] || 0) + fromPend; L.lchest[k] = (L.lchest[k] || 0) + fromNew; ledgerSave();
        hud.chat('You put ' + (m > 1 ? m + ' x ' : '') + core.item(k).name + ' in your chest.', 'info'); hud.refresh('all');
      }
      /* felled trees, shared by every player for ever (2026-10-05): you tell the @ashvale Bank when you fell one, and
         ask it which trees round you are already down whenever you arrive somewhere new (and every few minutes) */
      function fellTell(x, y) { bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'fell', v: 1, x, y }); }); }
      let fellAt = null, fellT = 0;
      function felledAsk(force) {
        const k = Math.floor(me.x / 48) + ',' + Math.floor(me.y / 48); if (!force && k === fellAt && performance.now() - fellT < 240000) return;
        fellAt = k; fellT = performance.now();
        bankRoom().then(R => { if (R && R.me) R.send({ t: 'felled?', v: 1, x0: me.x - 80, y0: me.y - 80, x1: me.x + 80, y1: me.y + 80 }); });
      }
      setInterval(() => felledAsk(false), 15000); setTimeout(() => felledAsk(true), 8000);
      /* persisted drops near you, from the @ashvale Bank: asked when you arrive somewhere new and every minute (the operator
         2026-10-06: dropped Gold and valuables "should persist ... in the exact same location until a player picks them up") */
      let gAt = null, gT = 0, gSeq = 0; const gGot = {};
      function groundAsk(force) {
        const k = Math.floor(me.x / 48) + ',' + Math.floor(me.y / 48); if (!force && k === gAt && performance.now() - gT < 60000) return;
        gAt = k; gT = performance.now(); const q = 'g' + (++gSeq);
        bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'ground?', v: 1, q, x0: me.x - 80, y0: me.y - 80, x1: me.x + 80, y1: me.y + 80 }); });
      }
      function groundHeard(d) {   /* the Bank's answer comes in chunks of 10: put them down once all are in */
        const q = String(d.q || ''); const G = gGot[q] = gGot[q] || { items: [], n: 0 };
        G.items.push(...(d.items || [])); G.n++;
        if (G.n >= (d.of | 0)) { delete gGot[q]; coreCall(() => core.bankGround && core.bankGround(d.box, G.items)); }
      }
      setInterval(() => groundAsk(false), 10000); setTimeout(() => groundAsk(true), 9000);
      function bankRoom() {
        if (bank.room) return Promise.resolve(bank.room); if (bank.joining) return bank.joining;
        bank.joining = net.join('bank', { game: 'ashvale' }).then(res => {
          bank.joining = null;
          if (!res || !res.online) { bank.note = 'The @ashvale Bank cannot be reached from here' + (res && res.why ? ' (' + res.why + ')' : '') + '.'; return null; }
          const R = res.room; bank.room = R;
          /* a room the arcade has dropped us from answers every send with "not in that room any more" (seen 2026-10-06 after
             a node restart): then every deposit, drop and question to the Bank failed in silence. A failed send leaves that
             room (the SDK would hand the same dead one back), joins again and sends it once more */
          const send0 = R.send.bind(R);
          R.send = o => send0(o).then(ok => {
            if (ok || bank.room !== R) return ok;
            bank.room = null; try { R.leave(); } catch (e) { /* gone */ }
            return bankRoom().then(R2 => R2 && R2 !== R ? R2.send(o) : false);
          });
          R.on('closed', () => { if (bank.room === R) bank.room = null; });
          R.on('message', ({ from, data }) => {
            const bankFrom = from && (from.address === DATA.assets.issuer || from.address === YOURFIRST_ADDR || from.tag === 'yourfirstname');
            if (data && data.t === 'felled' && bankFrom && R.me && data.to === R.me.address) { core.setFelled(data.cells || []); return; }   /* trees others felled */
            if (data && data.t === 'ground' && bankFrom && R.me && data.to === R.me.address) { groundHeard(data); return; }   /* persisted drops near me */
            if (!data || data.t !== 'dep' || !bankFrom || !R.me || data.to !== R.me.address) return;   /* only @ashvale or @yourfirstname answers, only to me */
            const q = bank.sent[data.id]; if (!q) return; delete bank.sent[data.id]; clearTimeout(q.timer);
            if (data.ok) {
              const L = ledgerFor(walletState.address || R.me.address);
              for (const k in (data.paid || {})) { const toChest = Math.min(data.paid[k], L.lchest[k] || 0); L.lchest[k] = (L.lchest[k] || 0) - toChest; L.pchest[k] = (L.pchest[k] || 0) + toChest; L.pend[k] = (L.pend[k] || 0) + data.paid[k] - toChest; }   /* promised: on its way until the wallet shows it (in the chest if you stored it already) */
              L.refused = L.refused || {}; for (const k of (data.refused || [])) L.refused[k] = Date.now() + 600000;
              L.absorb = L.absorb || {}; for (const k of (data.absorb || [])) L.absorb[k] = 1;
              if (L.rewards) for (const k in (data.paid || {})) if (L.rewards[k] && L.rewards[k].length && (data.paid[k] > 0)) L.rewards[k].shift();
              if (L.picks) for (const k in (data.paid || {})) { let n = data.paid[k]; L.picks = L.picks.filter(q => !(q.k === k && n-- > 0)); }
              ledgerSave(); bank.note = data.note || 'On its way to your wallet.';
              for (const t of [30000, 90000, 180000, 400000]) setTimeout(walletRefresh, t);
            } else { bank.note = data.note || 'The bank did not take that.'; const L = ledgerFor(walletState.address || R.me.address); L.refused = L.refused || {}; L.absorb = L.absorb || {}; for (const k of (data.absorb || [])) L.absorb[k] = 1; for (const k of (data.refused || [])) L.refused[k] = Date.now() + 600000; if (!(data.absorb || []).length && !(data.refused || []).length) for (const k of Object.keys(q.items)) L.refused[k] = Date.now() + 600000; ledgerSave(); }
            bank.busy = Object.keys(bank.sent).length > 0; hud.refresh('wallet');
          });
          return R;
        });
        return bank.joining;
      }
      async function chestDeposit() {
        if (bank.busy) return;
        const C = chestState(), L0 = ledgerFor(walletState.address), now0 = Date.now(); L0.refused = L0.refused || {};
        const ready = {}; for (const k in C.loose) { const r = C.loose[k] - pickHold(L0, k); if (r > 0) ready[k] = r; }   /* picked up in the last 90 s: wait */
        const keys = Object.keys(ready).filter(k => !(L0.refused[k] > now0)); if (!keys.length) { bank.busy = false; return; }
        C.loose = ready;
        const fromOf = k => { const P = (L0.picks || []).filter(q => q.k === k).slice(-C.loose[k]); return P.length ? P.map(q => [q.x, q.y]) : null; };   /* where you picked them up: a drop there is that exact piece */
        bank.busy = true; bank.note = 'Asking the @ashvale Bank…'; hud.refresh('wallet');
        const R = await bankRoom();
        if (!R || !R.me || R.me.guest || !R.me.address) { bank.busy = false; if (R) bank.note = 'Guests have no wallet: sign in to DogecoinArcade first.'; hud.refresh('wallet'); return; }
        /* each chunk carries, for its items, what this game already counts as on its way, so the Bank pays only the new
           part and re-confirms promises a game lost track of (never paying twice); a mesh message is 512 bytes */
        const pendOf = ks => { const o = {}; for (const k of ks) if (C.pend[k]) o[k] = C.pend[k]; return o; };
        const fromAll = ks => { const o = {}; for (const k of ks) { const f = walletState.data.gear[k] !== undefined || (core.item(k) && !core.item(k).stack) ? fromOf(k) : null;   /* every NFT kind (D.items was the module, not the table: the spot was never sent) */ if (f) o[k] = f; } return o; };
        const size = c => JSON.stringify([c, c, c, c, pendOf(Object.keys(c)), fromAll(Object.keys(c))]).length + 60;
        const chunks = [{}]; for (const k of keys) { const c = chunks[chunks.length - 1]; c[k] = C.loose[k]; if (size(c) > 420) { delete c[k]; chunks.push({ [k]: C.loose[k] }); } }
        chunks.forEach((items, i) => {
          const id = Date.now().toString(36) + '-' + i;
          bank.sent[id] = { items, timer: setTimeout(() => { if (!bank.sent[id]) return; delete bank.sent[id]; bank.busy = Object.keys(bank.sent).length > 0; bank.note = 'No answer from the @ashvale Bank yet. Try again in a minute.'; hud.refresh('wallet'); }, 90000) };
          const carried = {}, chest = {}, spent = {}; for (const k in items) { carried[k] = carriedOf(k); if (C.chest[k]) chest[k] = C.chest[k]; if (L0.spent[k]) spent[k] = L0.spent[k]; }   /* the Bank checks the sum against the chain */
          const reward = {}; for (const k in items) if (L0.rewards && L0.rewards[k] && L0.rewards[k].length) reward[k] = L0.rewards[k][0];
          R.send({ t: 'dep', v: 3, id, items, carried, chest, spent, reward, pend: pendOf(Object.keys(items)), from: fromAll(Object.keys(items)) });
        });
      }
      const netStats = { sent: 0, dropped: 0, t0: performance.now(), times: [], max1s: 0, max2s: 0 };
      window.addEventListener('pagehide', () => { if (nb) nb.close(); if (room) { const r = room; room = null; r.leave(); } });
      let lastSend = 0;
      /* outgoing queue: never more than 5 messages in any second or 9 in any 2 s (the mesh allows ~5/s, burst 10);
         a newer pure position state replaces a queued older one */
      const outQ = [];
      const pureState = o => o.p && !o.M && !o.E && !o.F && !o.G && o.A === undefined && o.C === undefined && !o.X && !o.g && !o.o && !o.t;
      function netSend(o, R) {   /* R: a neighbour room (viewer presence); default the main room. One budget for both */
        if (!room) return false; R = R || null;
        try { if (new TextEncoder().encode(JSON.stringify(o)).length > 500) return false; } catch (e) { return false; }
        if (pureState(o)) { const i = outQ.findIndex(w => w.R === R && pureState(w.o)); if (i >= 0) { outQ[i].o = o; return true; } }
        outQ.push({ o, R }); flushNet(); return true;
      }
      function flushNet() {
        if (!room) { outQ.length = 0; return; }
        const now = performance.now(), T = netStats.times;
        while (T.length && now - T[0] > 2000) T.shift();
        while (outQ.length && T.filter(t => now - t <= 1000).length < 5 && T.length < 9) {
          const w = outQ.shift(); T.push(now); if (!w.R) lastSend = now; netStats.sent++;
          netStats.max2s = Math.max(netStats.max2s, T.length); netStats.max1s = Math.max(netStats.max1s, T.filter(t => now - t <= 1000).length);
          (w.R || room).send(w.o).then(ok => { if (!ok) netStats.dropped++; if (!w.R) NW.fails = ok ? 0 : NW.fails + 1; }, () => { netStats.dropped++; if (!w.R) NW.fails++; });
        }
        netStats.queued = outQ.length;
      }
      const totalLevel = p => (D.rules.skills || []).reduce((a, k) => a + core.lv(p, k), 0);   /* the Skills tab's Total level */
      function netGear() { netSend({ g: gearOf(me), n: me.name, T: totalLevel(me), SK: Object.fromEntries(Object.keys(me.xp).map(k => [k, core.lv(me, k)])), L: ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'dexterity'].map(k => core.lv(me, k)), st: me.styles }); netOutfit(); }
      function netOutfit() { if (myEnt.H.outfit) netSend({ o: myEnt.H.outfit }); }
      /* chat: what you type goes to everyone in the same zone room; rate-limited here (the mesh limits ~5 msgs/s) */
      const sayTimes = [];
      function say(text) {
        text = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120); if (!text) return;
        const now = performance.now(); while (sayTimes.length && now - sayTimes[0] > 10000) sayTimes.shift();
        if (sayTimes.length >= 5 || (sayTimes.length && now - sayTimes[sayTimes.length - 1] < 1200)) { hud.chat("You're talking too fast.", 'warn'); return; }
        sayTimes.push(now);
        const dmTo = /^\/@([A-Za-z0-9_]{1,32})\s+(\S.*)$/.exec(text);   /* "/@tag message": a direct message, no distance limit */
        if (dmTo) { sendDm(dmTo[1], dmTo[2]); return; }
        if (text.startsWith('/@')) { hud.chat('To send a direct message: /@name your message', 'sys'); return; }
        hud.chat(me.name + ': ' + text, 'player'); speak(myEnt, text);
        if (!room) hud.chat('(Nobody else can hear you: you are playing solo.)', 'sys'); else netSend({ t: text });
      }
      /* DIRECT MESSAGES (2026-10-07: "If you /@<tag> a direct message should be sent to them in game chat no distance
         limit"): into the recipient's own room 'one.<address>' - every signed-in game sits in it (the one-device rule) - so
         it reaches them wherever they are. The arcade stamps the sender, so nobody can write as someone else. */
      const DM = { addr: new Map(), rooms: new Map() };
      async function sendDm(tag, text) {
        tag = tag.toLowerCase();
        if (!walletState.address && !(room && room.me && !room.me.guest)) { hud.chat('Sign in to the arcade to send direct messages.', 'warn'); return; }
        let addr = DM.addr.get(tag);
        if (!addr) { try { const j = await (await fetch('/r/tag/' + encodeURIComponent(tag))).json(); addr = j && j.address; } catch (e) { addr = null; } if (addr) DM.addr.set(tag, addr); }
        if (!addr) { hud.chat('There is no @' + tag + ' on the arcade.', 'warn'); return; }
        let R = DM.rooms.get(addr);
        if (!R || !R.room) { const res = await net.join('one.' + addr, { game: 'ashvale', loopback: q.has('loopback') }); if (!res || !res.online) { hud.chat('Direct messages need the arcade connection, and it is not answering.', 'warn'); return; } R = { room: res.room, t: 0 }; DM.rooms.set(addr, R); await new Promise(ok => setTimeout(ok, 600)); }
        R.t = Date.now(); setTimeout(() => { const r = DM.rooms.get(addr); if (r && Date.now() - r.t >= 290000) { DM.rooms.delete(addr); try { r.room.leave(); } catch (e) { /* gone */ } } }, 300000);
        const here = (R.room.members ? R.room.members() : []).some(m => m.address === addr);
        if (!here) { hud.chat('@' + tag + " isn't playing right now.", 'sys'); return; }
        R.room.send({ t: 'dm', v: 1, text: String(text).slice(0, 120) });
        hud.chat('To @' + tag + ': ' + String(text).slice(0, 120), 'dm');
      }
      function speak(e, text) { if (e.bub) e.bub.el.remove(); e.bub = { el: hud.bubble(text), t: performance.now() }; }
      const cleanName = n => String(n || '').replace(/[^\w -]/g, '').trim().slice(0, 12) || 'Adventurer';
      function netPos(now) {
        if (!room) return;
        if (hosted.size && room) { hostSend(now); return; }
        if (now - netT < 250 || now - lastSend < 200) return;
        const p = myEnt.root.position, an = myEnt.oneShot ? myEnt.lastOne || 'idle' : myEnt.loco || 'idle', key = p.x.toFixed(2) + ',' + p.z.toFixed(2) + ',' + myEnt.yaw.toFixed(2) + ',' + an;
        if (key === lastPosKey && now - netT < 1000) return;   /* standing still: a 1 Hz heartbeat is enough */
        lastPosKey = key; netT = now;
        netSend(stateMsg(now));
      }
      let gearRefT = 0;
      function stateMsg(now) {
        const p = myEnt.root.position;
        const m = { s: Math.round(now), p: [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100], f: Math.round(myEnt.yaw * 100) / 100, a: myEnt.oneShot ? myEnt.lastOne || 'idle' : myEnt.loco || 'idle', j: myJoin, hp: me.hp, d: me.dead ? 1 : 0, k: myEnt.toolId || 0 };
        const cz = combatZone(); if (cz) m.c = cz;   /* the area I am fighting in, when it is not the one I stand in */
        if (now - gearRefT > 10000) { gearRefT = now; netSend({ g: gearOf(me), n: me.name }); if (myEnt.H.outfit) netSend({ o: myEnt.H.outfit }); }   /* a missed gear message left others drawn wrong, and a missed name left them called Adventurer: refresh both every 10 s, as their own small messages */
        return m;
      }
      const setKey = o => JSON.stringify(Object.keys(o || {}).filter(k => o[k] != null && o[k] !== '').sort().map(k => [k, o[k]]));
      const sameSet = (a, b) => setKey(a) === setKey(b);
      function onNet(ev, via) {   /* via: the neighbour room it came through, if any */
        const from = ev.from, id = from.id, d = ev.data && typeof ev.data === 'object' ? ev.data : {}; let r = remotes.get(id);
        if (id === myNetId) return;   /* ourselves, heard through another room */
        if (d.tr) { if (d.to === myNetId && trade && !via) trade.onMessage(from, d.tr); return; }   /* a trade window message, for us only */
        if (!r && !d.p && !d.g && !d.n && !d.M && !d.E && !d.F) { /* first contact carries state soon */ }
        if (r) r.heard = performance.now();
        if (!r) { const e = makeEnt('r:' + id, MOD.humanoid({}), { kind: 'remote', id }); const nm = knewName.get(id) || 'Adventurer'; e.tag = hud.tag(label(nm, from)); r = { e, buf: [], anim: 'idle', name: nm, from, lastS: -1, heard: performance.now(), fullT: 0 }; remotes.set(id, r); e.root.visible = false; }
        /* a VIEWER (neighbour region): drawn, never a puppet or a host. A full member of our room wins for 3 s after its last word */
        const view = !!via || d.nb === 1;
        if (!view) { r.fullT = r.heard; r.via = null; } else if (via && !r.via && performance.now() - r.fullT > 3000) r.via = via;
        r.viewOnly = performance.now() - r.fullT > 3000;
        /* compare with what is DRAWN, not with the last message: each setGear rebuilds the model, and a model that went
           wrong (a missed message) must be corrected by the 10 s refresh */
        if (d.g && typeof d.g === 'object' && sameSet(d.g, r.e.H.gear) === false) r.e.H.setGear(d.g);
        if (d.g && typeof d.g === 'object') hawkify(r.e, d.g.ring);   /* another player's hawk ring */
        if (d.o && typeof d.o === 'object' && r.e.H.setOutfit && sameSet(d.o, r.e.H.outfit || {}) === false) r.e.H.setOutfit(d.o);
        if ('k' in d) { const tl = typeof d.k === 'string' && /^[a-z0-9_]{1,24}$/.test(d.k) ? d.k : null; if (tl !== r.tool) { r.tool = tl; r.e.H.setTool && r.e.H.setTool(tl); } }
        if (d.T != null) r.total = Math.max(0, Math.min(9999, d.T | 0));
        if (d.n || d.T != null) { if (d.n) r.name = cleanName(d.n); if (r.e.tag) setTag(r.e.tag, r.name, from, r.total); }
        if (typeof d.t === 'string' && d.t.trim()) {
          /* chat is heard only near the speaker (2026-10-06: "only visible to players within a certain radius of each
             other ... doesn't reach all the way from Saltmere to Ashvale"): rules.chat.radius tiles, default 40 */
          const lp = Array.isArray(d.p) && isFinite(d.p[0]) ? { x: +d.p[0], z: +d.p[1] } : r.buf[r.buf.length - 1], CR = (DATA.rules && DATA.rules.chat && DATA.rules.chat.radius) || 40;
          if (lp && Math.max(Math.abs(Math.floor(lp.x) - me.x), Math.abs(Math.floor(lp.z) - me.y)) <= CR) { const t = d.t.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120); hud.chat(label(r.name, from) + ': ' + t, 'player'); speak(r.e, t); }
        }
        if (!r.viewOnly) shared(id, r, d);
        if (Array.isArray(d.p) && d.p.length === 2 && isFinite(d.p[0]) && isFinite(d.p[1])) {
          if (typeof d.s === 'number') { if (d.s <= r.lastS && d.s > r.lastS - 60000) return; r.lastS = d.s; }   /* unordered delivery: drop older states */
          if (core.S.players[id]) core.setPuppet(id, { x: Math.floor(+d.p[0]), y: Math.floor(+d.p[1]) });
          r.area = core.areaOf(Math.floor(+d.p[0]), Math.floor(+d.p[1])); r.carea = typeof d.c === 'string' ? d.c.slice(0, 40) : null;
          r.e.root.visible = true; r.buf.push({ t: performance.now(), x: +d.p[0], z: +d.p[1], f: +d.f || 0, a: typeof d.a === 'string' ? d.a.slice(0, 12) : 'idle' }); if (r.buf.length > 20) r.buf.shift();
        }
      }
      /* ---------- SHARED WORLD: a host per AREA simulates that area's monsters and loot; everyone else follows it.
         Host of an area = among the room members standing in it, the earliest-joined signed-in one (guests only when no
         signed-in player is there), tie-break by id; an area nobody stands in gets a host from the members fighting there.
         A host -> room: its state + changed monsters [uid,x,y,hp,dead] + events of the areas it hosts, every 400 ms; a full
         snapshot every 5 s and whenever someone joins. Everyone -> room: intents A (attack uid / 0), C (claim ground uid),
         X (drop to the ground), XF (light a fire): the host of the target's area acts on them. A receiver takes monster
         rows and events only from the current host of their area. Each player stays the authority over their own HP,
         inventory and XP (applied from the host's events). An area without a host (nobody there) runs in every game. */
      let myJoin = Date.now(), joinedAt = 0, hostQ = [], hostT = 0, fullT = 0, lastAct = '', mobSig = new Map(), electT = 0, electedOnce = false, passive = false;
      const hosts = new Map(), hosted = new Set();
      const myNetIdOf = () => room && room.me ? room.me.id : PID;
      let myNetId = PID;
      const toNet = x => x === PID ? myNetId : x, fromNet = x => x === myNetId ? PID : x;
      const CLS = { m: 'melee', r: 'ranged', g: 'magic' };
      const areaAt = (x, y) => core.areaOf(x | 0, y | 0);
      const hostOf = a => hosts.get(a) || null;
      const iHost = a => hosted.has(a);
      const iHostAt = (x, y) => hosted.has(areaAt(x, y));
      const mobArea = u => { const m = core.mobByUid(u); return m ? m.zone : null; };
      const fromHostOf = (id, a) => a != null && hosts.get(a) === id;
      function areasInPlay() {
        const s = new Set(hosts.keys()); for (const m of core.S.mobs) s.add(m.zone); for (const p of core.M.pieces) s.add(p.id);
        for (const z in core.S.noAuth) s.add(z); s.add(zoneHere()); return s;
      }
      function applyAuth() {   /* authority per area: mine when I host it, or when nobody does; passive while just joined */
        for (const a of areasInPlay()) {
          const want = !room && !passive ? true : passive ? false : (!hosts.has(a) || hosts.get(a) === myNetId);
          if (core.isAuth(a) !== want) core.setAuth(a, want);
        }
      }
      function elect() {
        if (!room) return;
        myNetId = myNetIdOf();
        let mem; try { mem = room.members(); } catch (e) { mem = [room.me]; }
        const now = performance.now(), cand = [];
        let unknown = false;
        for (const m of mem) {
          if (m.id === myNetId) { cand.push({ id: m.id, guest: !!room.me.guest, j: myJoin, a: zoneHere(), c: combatZone() }); continue; }
          const r = remotes.get(m.id);
          if (r && r.viewOnly) continue;   /* a viewer from a neighbour region: never a host here */
          if (!r || r.j == null || r.area == null) { unknown = true; continue; }
          cand.push({ id: m.id, guest: !!r.from.guest, j: r.j, a: r.area, c: r.carea || null });
        }
        if (unknown && now - joinedAt < 2500 && !electedOnce) return;   /* just joined: listen first */
        electedOnce = true; passive = false;
        const stand = new Map(), fight = new Map(), add = (M, a, c) => { if (!M.has(a)) M.set(a, []); M.get(a).push(c); };
        for (const c of cand) {
          if (c.a) add(stand, c.a, c); if (c.c && c.c !== c.a) add(fight, c.c, c);
          const wz = c.a && core.weatherZone(c.a); if (wz && wz !== c.a && wz !== c.c) add(fight, wz, c);   /* seeded land shows a set piece's weather: someone must roll it */
        }
        const next = new Map();
        for (const a of new Set([...stand.keys(), ...fight.keys()])) {
          const all = stand.get(a) || fight.get(a), signed = all.filter(c => !c.guest), pool = signed.length ? signed : all;
          pool.sort((x, y) => x.j - y.j || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
          next.set(a, pool[0].id);
        }
        const here = zoneHere();
        for (const [a, h] of next) if (h === myNetId && !hosted.has(a)) {   /* I just took this area over */
          hosted.add(a); fullT = 0; for (const m of core.S.mobs) if (m.zone === a) mobSig.delete(m.uid);
          const was = hosts.get(a); if (was && was !== myNetId && a === here && !mem.some(m => m.id === was)) hud.chat('You are now keeping this area in sync for everyone (the previous player left).', 'sys');
        }
        for (const a of Array.from(hosted)) if (next.get(a) !== myNetId) hosted.delete(a);
        hosts.clear(); for (const [a, h] of next) hosts.set(a, h);
        applyAuth();
      }
      function netEvent(e) {   /* local core events that the room needs */
        if (!room) return;
        if (e.e === 'claim' && e.p === PID) { netSend({ C: e.g }); return; }
        if (e.e === 'xfire') { if (iHostAt(e.x, e.y)) core.hostFire(e.x, e.y, e.ticks, e.log); else netSend({ XF: [e.x, e.y, e.ticks, e.log] }); return; }
        if (e.e === 'xdrop') { if (iHostAt(e.x, e.y)) core.hostDrop(e); else netSend({ X: [e.id, e.n, e.x, e.y, e.life || 300, e.from ? toNet(e.from) : 0, e.diedAt || 0] }); return; }
        if (!hosted.size) return;
        const mobIn = u => iHost(mobArea(u)), fight = () => typeof e.src === 'number' ? mobIn(e.src) : typeof e.dst === 'number' ? mobIn(e.dst) : false;
        switch (e.e) {
          case 'attack': if (fight()) hostQ.push(['a', toNet(e.src), toNet(e.dst), e.anim || '', (e.cls || 'm')[0] === 'm' ? 'm' : e.cls === 'ranged' ? 'r' : 'g', e.delay || 0, e.ammo ? +String(e.ammo).slice(-1) : 0, e.spell || 0]); break;
          case 'hit': if (fight()) hostQ.push(['h', toNet(e.src), toNet(e.dst), e.dmg, e.hp, (e.cls || 'm')[0] === 'm' ? 'm' : e.cls === 'ranged' ? 'r' : 'g', (e.blocked ? 1 : 0) | (e.dodged ? 2 : 0) | (e.dex ? 4 : 0)]); break;
          case 'die': if (e.mob != null && mobIn(e.mob)) hostQ.push(['k', e.mob, e.killer ? toNet(e.killer) : 0]); break;
          case 'spawn': { const m = core.mobByUid(e.mob); if (m && iHost(m.zone)) hostQ.push(['s', m.uid, m.x, m.y, m.hp]); break; }
          case 'drop': if (iHostAt(e.x, e.y)) hostQ.push(['d', e.g, e.id, e.n, e.x, e.y, e.from ? toNet(e.from) : 0]); break;
          case 'take': if (iHostAt(e.x, e.y)) hostQ.push(['t', e.g, toNet(e.p), e.id, e.n, e.x, e.y]); break;
          case 'vanish': if (iHostAt(e.x, e.y)) hostQ.push(['v', e.g, e.x, e.y]); break;
          case 'ground': if (iHostAt(e.x, e.y)) hostQ.push(['n', e.g, e.n, e.x, e.y]); break;
          case 'mobeat': if (mobIn(e.mob)) hostQ.push(['e', e.mob]); break;
          case 'fire': if (iHostAt(e.x, e.y)) hostQ.push(['f', e.fire, e.x, e.y, e.ticks, e.log]); break;
          case 'fireout': if (iHostAt(e.x, e.y)) hostQ.push(['fo', e.fire, e.x, e.y]); break;
          case 'weather': if (iHost(e.zone)) hostQ.push(['w', e.zone, e.kind, e.intensity, e.ticks]); break;
          case 'fx': if (mobIn(e.mob)) hostQ.push(['x', e.mob, e.fx, e.ticks]); break;
          case 'fxend': if (mobIn(e.mob)) hostQ.push(['xe', e.mob, e.fx]); break;
        }
      }
      function netAct() {   /* my current attack target, so the host (and any future host) knows what I'm doing */
        if (!room) return;
        const a = me.act && me.act.k === 'attack' ? me.act.uid : 0, sig = a + '';
        if (sig !== lastAct) { lastAct = sig; netSend({ A: a }); }
      }
      function mobRows(all) {
        const rows = [];
        for (const m of core.S.mobs) {
          if (!hosted.has(m.zone)) continue;
          const row = [m.uid, m.x, m.y, m.hp, m.dead ? 1 : 0], sig = row.join(',');
          if (all || mobSig.get(m.uid) !== sig) { rows.push(row); mobSig.set(m.uid, sig); }
        }
        return rows;
      }
      const sizeOf = o => new TextEncoder().encode(JSON.stringify(o)).length;
      function packSend(base, key, rows, max) {   /* fill messages up to ~470 B */
        let cur = Object.assign({}, base), list = [], sent = 0;
        for (const r of rows) {
          list.push(r); cur[key] = list;
          if (sizeOf(cur) > (max || 470)) { list.pop(); cur[key] = list; if (list.length) { netSend(cur); sent++; } cur = {}; list = [r]; cur[key] = list; }
        }
        if (list.length || Object.keys(base).length) { if (!list.length) delete cur[key]; netSend(cur); sent++; }
        return sent;
      }
      function hostSend(now) {
        if (now - hostT < 400) return;
        const rows = mobRows(false), evs = hostQ.splice(0);
        const st = stateMsg(now), key = st.p.join(',') + st.a;
        if (!rows.length && !evs.length && key === lastPosKey && now - hostT < 1000) return;
        hostT = now; lastPosKey = key; netT = now;
        const msg = Object.assign(st, rows.length ? { M: rows } : {}, evs.length ? { E: evs } : {});
        if (sizeOf(msg) <= 480) netSend(msg);
        else { if (rows.length) packSend(st, 'M', rows); else netSend(st); if (evs.length) packSend({}, 'E', evs); }
        if (now - fullT > 5000) fullSnap();
      }
      function fullSnap() {   /* everything of the areas I host */
        if (!room || !hosted.size) return;
        fullT = performance.now(); const seq = Math.round(fullT);
        packSend({ F: seq }, 'M', mobRows(true));
        for (const a of hosted) {
          const G = core.S.ground.filter(g => areaAt(g.x, g.y) === a).map(g => [g.uid, g.id, g.n, g.x, g.y, g.from ? toNet(g.from) : 0]);
          packSend({ F: seq, Gr: a }, 'G', G);
          const wz = core.weatherOf(a); if (wz) netSend({ F: seq, W: [a, wz.kind, wz.intensity, Math.max(1, wz.until - core.S.t)] });
        }
        const Fi = core.S.fires.filter(f => iHostAt(f.x, f.y)).map(f => [f.uid, f.x, f.y, f.until - core.S.t, f.log]);
        if (Fi.length) packSend({ F: seq }, 'Fi', Fi);
      }
      function coreCall(fn) {   /* run a core change outside the tick and present its events */
        const keep = core.S.ev; core.S.ev = []; fn(); const evs = core.S.ev; core.S.ev = keep;
        const now = performance.now(); for (const e of evs) { handle(e, now); netEvent(e); }
        syncGround(); if (dirty.inv || dirty.eq) { hud.refresh('all'); dirty = {}; } else hud.refresh('orbs');
      }
      function shared(id, r, d) {
        if (d.j != null) { const nj = +d.j; if (r.j !== nj) { r.j = nj; elect(); } }
        if (!core.S.players[id]) core.addPuppet(id, {});
        const pst = {};
        if (Number.isInteger(d.hp)) { pst.hp = d.hp; r.hp = d.hp; }
        if (d.d != null) pst.dead = !!d.d;
        if (d.g && typeof d.g === 'object') pst.g = d.g;
        if (Array.isArray(d.L)) { pst.L = d.L; r.maxHp = d.L[3] | 0; }
        if (d.SK && typeof d.SK === 'object') { const sk = {}; for (const k in d.SK) if (/^[a-z]{1,20}$/.test(k)) { const L = d.SK[k] | 0; if (L >= 1 && L <= 99) sk[k] = L; } r.skills = sk; }
        if (d.st && typeof d.st === 'object') pst.st = d.st;
        if (d.A !== undefined) pst.act = d.A ? { k: 'attack', uid: +d.A } : null;
        if (Object.keys(pst).length) core.setPuppet(id, pst);
        if (d.C != null) { const g = core.S.ground.find(q => q.uid === +d.C); if (g && iHostAt(g.x, g.y)) coreCall(() => core.claim(id, +d.C)); }
        if (Array.isArray(d.XF)) { const f = d.XF; if (iHostAt(f[0], f[1])) coreCall(() => core.hostFire(f[0] | 0, f[1] | 0, f[2] | 0, String(f[3] || 'logs'))); }
        if (Array.isArray(d.X)) { const x = d.X; if (core.item(x[0]) && iHostAt(x[2], x[3])) coreCall(() => core.hostDrop({ id: x[0], n: Math.max(1, x[1] | 0), x: x[2] | 0, y: x[3] | 0, life: x[4] | 0, from: x[5] ? fromNet(x[5]) : null, diedAt: x[6] | 0 })); }
        /* below: only the word of the host of the area concerned counts */
        if (Array.isArray(d.M)) { const rows = d.M.filter(w => Array.isArray(w) && fromHostOf(id, mobArea(w[0]))); if (rows.length) coreCall(() => core.applyMobs(rows)); }
        if (Array.isArray(d.W) && fromHostOf(id, d.W[0])) coreCall(() => core.setWeather(d.W[0], String(d.W[1]), d.W[2] | 0, d.W[3] | 0));
        if (Array.isArray(d.Fi)) coreCall(() => { for (const f of d.Fi) if (fromHostOf(id, areaAt(f[1], f[2]))) core.fireAdd(f[0], f[1], f[2], f[3], f[4]); });
        if (Array.isArray(d.G)) coreCall(() => { if (d.Gr) { if (fromHostOf(id, d.Gr)) core.groundFull(d.Gr, d.G); } else for (const g of d.G) if (fromHostOf(id, areaAt(g[3], g[4]))) core.groundAdd(g[0], g[1], g[2], g[3], g[4], g[5] ? fromNet(g[5]) : null); });
        if (Array.isArray(d.E)) coreCall(() => { for (const a of d.E) if (Array.isArray(a) && eventFromHost(id, a)) applyEvent(a); });
      }
      function eventFromHost(id, a) {   /* is the sender the host of the area this event is about? */
        switch (a[0]) {
          case 'a': case 'h': return fromHostOf(id, mobArea(typeof a[1] === 'number' ? a[1] : a[2]));
          case 'k': case 's': case 'e': case 'x': case 'xe': return fromHostOf(id, mobArea(a[1]));
          case 'd': return fromHostOf(id, areaAt(a[4], a[5]));
          case 't': case 'v': case 'n': { const g = core.S.ground.find(q => q.uid === a[1]), xy = g ? [g.x, g.y] : a[0] === 't' ? [a[5], a[6]] : a[0] === 'v' ? [a[2], a[3]] : [a[3], a[4]]; return xy[0] != null && fromHostOf(id, areaAt(xy[0], xy[1])); }
          case 'f': return fromHostOf(id, areaAt(a[2], a[3]));
          case 'fo': { const f = core.S.fires.find(q => q.uid === a[1]); return f ? fromHostOf(id, areaAt(f.x, f.y)) : a[2] != null && fromHostOf(id, areaAt(a[2], a[3])); }
          case 'w': return fromHostOf(id, a[1]);
        }
        return false;
      }
      function applyEvent(a) {
        const now = performance.now(), maxOf = id => typeof id === 'number' ? (D.monsters[(core.mobByUid(id) || {}).key] || { hp: 1 }).hp : id === PID ? core.maxHp(me) : ((remotes.get(id) || {}).maxHp || 10);
        switch (a[0]) {
          case 'a': handle({ e: 'attack', src: fromNet(a[1]), dst: fromNet(a[2]), anim: a[3], cls: CLS[a[4]] || 'melee', delay: a[5] || 0, ammo: a[6] ? 'arrows_t' + a[6] : null, spell: a[7] || null }, now); break;
          case 'h': {
            const src = fromNet(a[1]), dst = fromNet(a[2]), dmg = a[3] | 0; let hp = a[4];
            if (dst === PID) { core.applyHit(PID, dmg); hp = me.hp; }
            else if (typeof dst === 'number') { const m = core.mobByUid(dst); if (m && !core.isAuth(m.zone)) m.hp = Math.max(0, hp); }
            if (src === PID) core.hitXp(PID, CLS[a[5]] || 'melee', dmg, !!(a[6] & 4));
            handle({ e: 'hit', src, dst, dmg, hp, max: maxOf(dst), cls: CLS[a[5]] || 'melee', blocked: !!(a[6] & 1), dodged: !!(a[6] & 2) }, now);
            break;
          }
          case 'k': { const m = core.mobByUid(a[1]); if (!m) break; core.applyMobs([[m.uid, m.x, m.y, 0, 1]]); if (fromNet(a[2]) === PID) core.creditKill(PID, m.key); for (const pid of core.S.order) { const o = core.S.players[pid]; if (o.act && o.act.k === 'attack' && o.act.uid === m.uid) o.act = null; } handle({ e: 'die', mob: m.uid }, now); break; }
          case 's': core.applyMobs([[a[1], a[2], a[3], a[4], 0]]); break;
          case 'd': core.groundAdd(a[1], a[2], a[3], a[4], a[5], a[6] ? fromNet(a[6]) : null); break;
          case 't': core.groundRemove(a[1]); if (fromNet(a[2]) === PID) { core.grantItem(PID, a[3], a[4]); persistTell({ e: 'take', p: PID, id: a[3], n: a[4], x: a[5], y: a[6] }); } break;   /* the host gave it to us: tell the Bank too */
          case 'v': core.groundRemove(a[1]); break;
          case 'n': { const g = core.S.ground.find(q => q.uid === a[1]); if (g) g.n = a[2]; break; }
          case 'e': handle({ e: 'mobeat', mob: a[1] }, now); break;
          case 'f': core.fireAdd(a[1], a[2], a[3], a[4], a[5]); break;
          case 'fo': core.fireOut(a[1]); break;
          case 'w': core.setWeather(a[1], String(a[2]), a[3] | 0, a[4] | 0); break;
          case 'x': core.applyFx(a[1], a[2], a[3]); break;
          case 'xe': { const m = core.mobByUid(a[1]); if (m && m.fx) delete m.fx[a[2]]; handle({ e: 'fxend', mob: a[1], fx: a[2] }, now); break; }
        }
      }
      function updateRemotes(now, dt) {
        if (room && now - electT > 500) { electT = now; elect(); }
        const rt = now - 150 - 250;   /* render one send-interval + 150 ms behind */
        for (const [id, r] of remotes) {
          if (now - r.heard > 12000) { dropRemote(id); elect(); continue; }   /* silent for 12 s: gone (the node drops them after ~10 s) */
          const b = r.buf; if (!b.length) continue;
          let i = b.length - 1; while (i > 0 && b[i - 1].t > rt) i--;
          const A = b[Math.max(0, i - 1)], Bs = b[i];
          /* The two samples are stamped with when THEY ARRIVED, so on a machine that receives in bursts their gap can
             be seconds wide even though nothing was lost - and blending across that hole at full length draws a
             straight line across country to where the player now is, several metres off any path they walked. Cap the
             blend at one rules step: the remote holds at the last place it was seen and then walks to the new one at
             the speed the game actually allows. A healthy stream (samples every ~400 ms) is unchanged.
             (the operator's shared-world position check, 2026-10-02.) */
          const span = Math.max(1, Math.min(Bs.t - A.t, TICK));
          const k = Math.max(0, Math.min(1, (rt - A.t) / span));
          const x = A.x + (Bs.x - A.x) * k, z = A.z + (Bs.z - A.z) * k;
          r.e.root.position.set(x, heightAt(x, z) + (r.e.alt || 0), z); r.e.tyaw = Bs.f;
          const an = Bs.a; if (an !== r.anim) { r.anim = an; r.e.H.play(an, { loop: /idle|walk|run|chop|mine|fish|cook/.test(an) }); }
          r.e.yaw += (((r.e.tyaw - r.e.yaw + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI) * Math.min(1, dt * 10); r.e.root.rotation.y = r.e.yaw;
          r.e.H.update(dt); if (r.e.hawk) r.e.hawk.update(dt);
        }
      }

      /* ---------- per frame */
      const tmpV = new THREE.Vector3();
      function toScreen(pos, up) { tmpV.set(pos.x, pos.y + (up || 0), pos.z).project(camera); if (tmpV.z > 1) return null; const w = host.clientWidth, h = host.clientHeight; return { x: (tmpV.x + 1) / 2 * w, y: (1 - tmpV.y) / 2 * h }; }
      let last = performance.now(), frames = 0, mmT = 0;
      function frame(rafNow) {
        if (stopped) return;
        requestAnimationFrame(frame);
        caveTick(performance.now()); torchTick(performance.now());
        /* One clock. The tick loop keeps lastTick on performance.now() and stamps each stride with the tick's own
           time (see doTick), but the rAF argument is the frame's START time, which trails performance.now() by
           however long the callback waits - on a
           machine that spends 300 ms a frame that made (now - e.t0) / e.dur come out NEGATIVE, and lerpVectors with a
           negative k walks the avatar BACKWARDS along its step. The drawn position of a player was up to 9 m the wrong
           way off where the rules put them, which is also what the other client then drew and sent on. (the operator's
           shared-world position check, 2026-10-02.) */
        const now = performance.now();
        const gap = (now - last) / 1000, dt = Math.max(0, Math.min(0.1, gap)), elapsed = Math.max(0, Math.min(2, gap));   /* dt: physics never takes a giant step. elapsed: what a fade or an ease is actually owed - dt alone runs everything at a third speed on a machine that spends 300 ms a frame. */
        last = Math.max(last, now); frames++;   /* the first rAF time can be older than start() */
        let n = 0; while (now - lastTick >= TICK && n < 8) { lastTick += TICK; doTick(lastTick); n++; }   /* every tick is stamped with its own time, never with the moment the machine got to it */
        if (now - lastTick > TICK * 4) lastTick = now;
        const tSec = now / 1000;
        for (const e of ents.values()) {
          if (e.fadeIn) { const k = (now - e.fadeIn) / 500; if (k >= 1) { e.H.setOpacity(1); e.fadeIn = 0; } else e.H.setOpacity(Math.max(0.02, k)); }   /* a person whose zone just arrived */
          if (e.key.charAt(0) === 'r') continue;
          const a = Math.min(1, (now - e.t0) / e.dur);
          if (!e.dead || a < 1) { e.root.position.lerpVectors(e.from, e.to, a); e.root.position.y = heightAt(e.root.position.x, e.root.position.z) + liftOf(e, a) + hawkAlt(e); }   /* on an upper floor; a hawk over the trees */
          let d = e.tyaw - e.yaw; d = ((d + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; e.yaw += d * Math.min(1, dt * 12); e.root.rotation.y = e.yaw;
          const moving = a < 1 && e.from.distanceToSquared(e.to) > 1e-4;
          if (!e.dead && !e.oneShot) { const want = moving ? (e.running ? 'run' : 'walk') : (e.skill || 'idle'); if (want !== e.loco) { e.loco = want; e.H.play(want, { loop: true }); } }
          if (e.oneShot && e.oneT && now - e.oneT > 2500 && !e.dead) e.oneShot = false;
          for (const rec of e.impacts) if (!rec.fired && now - rec.t > 850) { fireImpact(e, rec); break; }
          if (e.dead && e.key.charAt(0) === 'm') { const k = (now - e.deadT) / 1000; if (k > 1.3 && k < 2.2 && e.H.setOpacity) e.H.setOpacity(Math.max(0, 1 - (k - 1.3) / 0.8)); if (k >= 2.2) e.root.visible = false; }
          if (e.spawnT) { const k = Math.min(1, (now - e.spawnT) / 400); e.H.object.scale.setScalar(e.scale * (0.3 + 0.7 * k)); if (k >= 1) e.spawnT = 0; }
          if (e.root.visible) { e.H.update(dt); if (e.hawk) e.hawk.update(dt); }
        }
        for (const g of fires.values()) { const u = g.userData, sc = 0.8 + 0.25 * Math.sin(now / 70 + u.ph) + 0.1 * Math.sin(now / 23 + u.ph); u.f1.scale.set(1, sc, 1); u.f2.scale.set(1, 1.1 * sc, 1); }
        if (wxMod && wxMod.update && !CAVE.on) wxMod.update(elapsed);
        if (!CAVE.on) dayTick();   /* day and night on top of the weather's sky */   /* underground the cave sets the fog and the sky */
        updateRemotes(now, dt);
        for (let i = projs.length - 1; i >= 0; i--) {
          const p = projs[i]; p.t += dt; const k = Math.min(1, p.t / p.dur);
          const to = p.tgt.root.position.clone(); to.y += (p.tgt.H.height || 1.2) * p.tgt.scale * 0.55;
          const pos = p.from.clone().lerp(to, k); if (p.kind === 'ranged') pos.y += Math.sin(k * PI) * 0.25 * p.from.distanceTo(to) / 6;
          p.obj.lookAt(pos.x + (to.x - p.from.x), pos.y + (to.y - p.from.y) * 0.1, pos.z + (to.z - p.from.z)); p.obj.position.copy(pos);
          if (p.kind !== 'ranged') p.obj.rotation.z += dt * 8;
          if (k >= 1) { scene.remove(p.obj); projs.splice(i, 1); if (p.hit) showHit(p.hit); else { p.arrived = true; projs.push(Object.assign(p, { done: true })); projs.splice(projs.length - 1, 1); arrivedProjs.push(p); } if (p.kind !== 'ranged') burstSmall(to, 0xffaa55); }
        }
        for (let i = arrivedProjs.length - 1; i >= 0; i--) if (now - (arrivedProjs[i].tA || (arrivedProjs[i].tA = now)) > 1500) arrivedProjs.splice(i, 1);
        for (let i = bursts.length - 1; i >= 0; i--) { const m = bursts[i]; m.userData.t += dt; m.userData.v.y -= 6 * dt; m.position.addScaledVector(m.userData.v, dt); if (m.userData.t > (m.userData.life || 1.2)) { scene.remove(m); bursts.splice(i, 1); } }
        for (const r of regions) if (r.built) r.built.update(dt, tSec);
        if (PAD) PAD.poll(now, dt);
        updateCamera(dt);
        /* overlays: splats, HP bars, name tags */
        const tagSpots = [];
        for (const e of ents.values()) {
          const top = (e.H.height || 1.6) * e.scale;
          if (e.splats.length) {
            const s0 = e.root.visible ? toScreen(e.root.position, top * 0.55) : null;
            for (let i = e.splats.length - 1; i >= 0; i--) {
              const s = e.splats[i], age = now - s.t;
              if (age > 1100 || !s0) { s.el.remove(); e.splats.splice(i, 1); continue; }
              const off = [[0, 0], [-16, -10], [16, -10], [0, -20]][i % 4];
              s.el.style.left = (s0.x + off[0]) + 'px'; s.el.style.top = (s0.y + off[1] - age / 90) + 'px'; s.el.style.opacity = age > 850 ? String(1 - (age - 850) / 250) : '1';
            }
          }
          const showBar = e.hpT && now - e.hpT < 6000 && e.root.visible && !(e.dead && now - e.deadT > 900);
          if (showBar) {
            const s = toScreen(e.root.position, top + 0.25);
            if (!e.bar) e.bar = hud.hpBar();
            if (s) { e.bar.style.display = 'block'; e.bar.style.left = s.x + 'px'; e.bar.style.top = s.y + 'px'; e.bar.firstChild.style.width = Math.max(0, Math.min(100, 100 * e.hp / Math.max(1, e.max))) + '%'; } else e.bar.style.display = 'none';
          } else if (e.bar) { e.bar.remove(); e.bar = null; }
          if (e.kind === 'mob' && !e.dead) {   /* plates for the monsters near you - models exist up to MOB_NEAR tiles out, so not for all of them */
            const m = core.mobByUid(e.uid), md = m && D.monsters[m.key];
            const near = md && Math.max(Math.abs(m.x - me.x), Math.abs(m.y - me.y)) < (e.tag ? 16 : 11);
            if (near && !e.tag) e.tag = hud.tag(md.name + ' (combat ' + core.mobCombat(md) + ')');
            else if (!near && e.tag) { e.tag.remove(); e.tag = null; }
          }
          if (e.tag) {
            const s = e.root.visible ? toScreen(e.root.position, top + 0.45) : null; e.tag.style.display = s ? 'block' : 'none';
            if (s) { let y = s.y; for (let k = 0; k < 8 && tagSpots.some(q => Math.abs(q[0] - s.x) < 90 && Math.abs(q[1] - y) < 13); k++) y -= 14; tagSpots.push([s.x, y]); e.tag.style.left = s.x + 'px'; e.tag.style.top = y + 'px'; }   /* players on one tile: stack their name tags */
          }
          if (e.bub) { const s = now - e.bub.t < 4000 && e.root.visible ? toScreen(e.root.position, top + (e.tag ? 0.85 : 0.5)) : null; if (now - e.bub.t >= 4000) { e.bub.el.remove(); e.bub = null; } else { e.bub.el.style.display = s ? 'block' : 'none'; if (s) { e.bub.el.style.left = s.x + 'px'; e.bub.el.style.top = s.y + 'px'; } } }
        }
        /* opponent box */
        if (lastOpp && now - lastOpp.t < 6000) { const m = typeof lastOpp.uid === 'number' ? core.mobByUid(lastOpp.uid) : null; if (m) hud.setOpp({ name: D.monsters[m.key].name, hp: m.hp, max: D.monsters[m.key].hp }); else hud.setOpp(null); } else hud.setOpp(null);
        if (now - mmT > 66) { mmT = now; drawMinimap(); }
        hud.setPos(me.x, me.y);
        netPos(now); netNeighbours(now); flushNet();
        if (fogMod && myEnt) fogMod.focus(myEnt.root.position);
        if (SCENE.see && myEnt) {   /* see-through: a circle round the avatar's chest on screen, for anything 2 m or more in front of it */
          const S = SCENE.see, hp = _seeV.copy(myEnt.root.position); hp.y += 1.0;
          const d = camera.position.distanceTo(hp); hp.project(camera);
          const sz = renderer.getDrawingBufferSize(_seeS);
          if (hp.z > -1 && hp.z < 1 && settings.seeThrough !== false) { S.uSeeP.value.set((hp.x + 1) / 2 * sz.x, (hp.y + 1) / 2 * sz.y); S.uSeeR.value = sz.y * 0.13; S.uSeeD.value = d - 2.0; if (S.uSeeY) S.uSeeY.value = myEnt.root.position.y + 0.25; } else S.uSeeR.value = 0;
        }
        renderer.render(scene, camera);
      }
      const arrivedProjs = [];
      function burstSmall(pos, color) { for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color })); m.position.copy(pos); const a = k / 8 * 2 * PI; m.userData.v = new THREE.Vector3(Math.cos(a) * 1.2, 1 + (k % 2), Math.sin(a) * 1.2); m.userData.t = 0; m.userData.life = 0.45; scene.add(m); bursts.push(m); } }
      /* late hits: a projectile that already landed shows the splat when the hit event arrives */
      const _handle = handle;
      function drawMinimap() {
        const p = myEnt.root.position, dots = [];
        for (const m of core.S.mobs) if (!m.dead) { const e = ents.get('m:' + m.uid); if (e) dots.push({ x: e.root.position.x, y: e.root.position.z, c: '#ffff00' }); }
        for (const n of core.M.npcs) dots.push({ x: n.x + 0.5, y: n.y + 0.5, c: '#ffff00' });
        for (const g of core.S.ground) dots.push({ x: g.x + 0.5, y: g.y + 0.5, c: '#ff2020' });
        for (const r of remotes.values()) dots.push({ x: r.e.root.position.x, y: r.e.root.position.z, c: '#ffffff' });
        if (flag && me.x === flag[0] && me.y === flag[1]) flag = null;
        minimapFor();
        if (mmO[0] || mmO[1]) for (const d of dots) { d.x -= mmO[0]; d.y -= mmO[1]; }
        hud.drawMinimap(mmImg, { x: p.x - mmO[0], y: p.z - mmO[1], yaw: cam.yaw, north: trueNorth(me.x, me.y), dots, flag: flag ? [flag[0] + 0.5 - mmO[0], flag[1] + 0.5 - mmO[1]] : null });
      }
      /* TRUE NORTH (2026-10-06: the compass is a dot on the minimap's rim that always points north, and "make sure
         that north in the game matches in the Atlas" - the planet's north pole). The game's grid is laid on a face of the
         globe, so map-up is not north: near Ashvale the pole lies ~42 degrees left of it. From the worldgen projection: the
         pole's direction on the ground where you stand, as a game vector [x east, y south]. Recomputed every 16 tiles. */
      const TN = { key: '', v: [0, -1] };
      function trueNorth(x, y) {
        const WG = D.wg, C = DATA.globecfg; if (!WG || !WG.toSphere || !C || !C.origin) return TN.v;
        const key = (x >> 4) + ':' + (y >> 4); if (key === TN.key) return TN.v; TN.key = key;
        const fx = x + C.origin[0] + 0.5, fy = -(y + C.origin[1]) - 0.5, u = WG.toSphere(C.face, fx, fy), un = WG.toSphere(C.face, fx, fy + 1), ue = WG.toSphere(C.face, fx + 1, fy);
        const d = [un[0] - u[0], un[1] - u[1], un[2] - u[2]], e = [ue[0] - u[0], ue[1] - u[1], ue[2] - u[2]], N = [-u[0] * u[2], -u[1] * u[2], 1 - u[2] * u[2]];
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], dd = dot(d, d), de = dot(d, e), ee = dot(e, e), nd = dot(N, d), ne = dot(N, e), det = dd * ee - de * de;
        if (!(Math.abs(det) > 0)) return TN.v;
        const a = (nd * ee - ne * de) / det, b = (dd * ne - de * nd) / det, gx = b, gy = -a, l = Math.hypot(gx, gy) || 1;   /* N = a*(game north) + b*(game east) */
        TN.v = [gx / l, gy / l]; return TN.v;
      }
      function resize() { const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.2 ? 55 : 45; camera.updateProjectionMatrix(); }
      if (window.ResizeObserver) new ResizeObserver(resize).observe(host); window.addEventListener('resize', resize); resize();
      let saveFails = 0;
      /* where you stand, for the Atlas's "you are here" (2026-10-06): the @ashvale Bank keeps each player's last spot
         and tells the Atlas (Games tab) when it asks. Said as we save, when we moved 6+ tiles or 2 minutes went by, and as
         we leave; only a signed-in player (the mesh stamps the address, so nobody can move someone else's dot). */
      const HERE = { x: null, y: null, t: 0 };
      function tellHere(force) {
        if (!walletState.address && !hintedAddr) return;
        const now = Date.now(), moved = HERE.x == null || Math.abs(me.x - HERE.x) + Math.abs(me.y - HERE.y) >= 6;
        if (!force && !moved && now - HERE.t < 120000) return;
        HERE.x = me.x; HERE.y = me.y; HERE.t = now;
        let at = [me.x, me.y];   /* underground (the Spider Cave): the Atlas shows you at the cave mouth up top */
        const uz = core.M.underAt && core.M.underAt(me.x, me.y), ue = uz && ZINDEX && ZINDEX.find(z => z.id === uz);
        if (ue && ue.surfaceOffset) at = [me.x + ue.surfaceOffset[0], me.y + ue.surfaceOffset[1]];   /* the land right above you (the cave lies under it tile for tile) */
        else if (ue && ue.surface) at = ue.surface;
        bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'here', v: 1, x: at[0], y: at[1] }); });
      }
      /* CONTACTS ON THE ATLAS (2026-10-07; mutual contacts only): tell the @ashvale Bank who is in this player's
         arcade address book (arcade.contacts - the arcade asks the player first, and remembers the answer), a few at a
         time. The Bank keeps these links in memory only and lets them lapse unless we say them again while we play. */
      async function reportBook() {
        if (!(G.parent && G.parent !== G) || !/^https?:/.test(location.protocol) || stopped) return;
        if (!(G.arcade && G.arcade.contacts)) await new Promise(ok => { const s = G.document.createElement('script'); s.src = '/r/contacts.js'; s.onload = s.onerror = () => ok(); G.document.head.appendChild(s); setTimeout(ok, 8000); });
        if (!(G.arcade && G.arcade.contacts)) return;
        let L = []; try { L = await G.arcade.contacts.list(); } catch (e) { return; }
        const addrs = (Array.isArray(L) ? L : []).map(c => c && c.address).filter(a => typeof a === 'string' && a.length >= 25);
        if (!addrs.length) return;
        const R = await bankRoom(); if (!R || !R.me || R.me.guest) return;
        for (let i = 0; i < addrs.length; i += 10) { R.send({ t: 'book', v: 1, a: addrs.slice(i, i + 10) }); await new Promise(ok => setTimeout(ok, 400)); }
      }
      setTimeout(() => { reportBook().catch(() => {}); setInterval(() => reportBook().catch(() => {}), 600000); }, 15000);
      function persist(leaving) {
        if (stopped) return;
        try { tellHere(leaving === true); } catch (e) { /* the Bank is out of reach: the next save */ }
        Promise.resolve(store.set(SAVE, JSON.stringify(core.exportPlayer(PID)))).then(ok => {   /* false: the arcade did not take it */
          if (ok === false) { if (++saveFails === 2) hud.netLost && hud.netLost(true, 'save'); }
          else { if (saveFails >= 2) { hud.netLost && hud.netLost(false, 'save'); hud.chat('Your progress is saving again.', 'sys'); } saveFails = 0; }
        });
      }   /* stopped: New character cleared the save; the reload's visibilitychange must not write the old one back */
      document.addEventListener('visibilitychange', () => { if (document.hidden) persist(true); else { lastTick = performance.now(); } });
      window.addEventListener('pagehide', () => persist(true));

      function hudApi() {
        return {
          core, pid: PID, isPhone, isTouch,
          walletState: () => walletState, walletRefresh: () => walletRefresh(), pid: PID,
          chestState, chestTake, chestStore, chestDeposit,
          walletTake: (id) => chestTake(id, 1),   /* the same ledger as the chest (it bypassed it and could duplicate an NFT) */
          icon: id => { try { return MOD.icon(id, 64); } catch (e) { return null; } },
          cmd: c => { send(c); },
          say: t => say(t),
          sfx: n => sfx(n),
          settings: () => settings,
          toggle: k => { settings[k] = !settings[k]; store.set(SET, JSON.stringify(settings)); if (k === 'shadows') { sun.castShadow = settings.shadows; for (const e of ents.values()) e.blob.visible = !settings.shadows && !e.hawk; renderer.shadowMap.needsUpdate = true; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); } },
          resetCamera: () => { cam.tyaw = PI * 0.12; cam.tpitch = 0.92; cam.tdist = isPhone ? 9 : 11; },
          faceNorth: () => { const v = trueNorth(me.x, me.y), want = -PI / 2 - Math.atan2(v[1], v[0]); cam.tyaw = want + Math.round((cam.tyaw - want) / (2 * PI)) * 2 * PI; },   /* true north up, the short way round */
          newGame: () => { stopped = true; store.set(SAVE, '').then(() => location.reload(), () => location.reload()); },
          helpSeen: () => store.set('ashvale3d.help', '1'),
          savesHere: () => store.backend,
          modulesText: () => 'Players: ' + netStatus + '. Saves: ' + ({ arcade: 'on the arcade', browser: 'in this browser', memory: 'not saved (this session only)' }[store.backend] || store.backend) + '. Modules: ' + (opts.report || []).map(r => r[0] + ' v' + r[1]).join(', '),
          minimapTap: (dx, dy, k) => { const c = Math.cos(-cam.yaw), s = Math.sin(-cam.yaw); const tx = Math.floor(myEnt.root.position.x + (dx * c - dy * s) / k), ty = Math.floor(myEnt.root.position.z + (dx * s + dy * c) / k); send({ c: 'walk', x: tx, y: ty }); flag = [tx, ty]; }
        };
      }
      let stopped = false;
      /* ---------- character creator (first start) and the tailor's wardrobe */
      function openWardrobe(first) {
        if (!myEnt.H.setOutfit || !MOD.outfitStyles) return;
        const before = myEnt.H.outfit;
        cam.mode = 'creator'; cam.save = { yaw: cam.tyaw, pitch: cam.tpitch, dist: cam.tdist };
        hud.creator({ first, title: 'Wren the tailor', look: before, startPoints: first && core.START ? core.START.points : 0, startMax: core.START ? core.START.max : 5, name: first ? '' : me.name, styles: MOD.outfitStyles, palette: MOD.palette,
          onChange: look => myEnt.H.setOutfit(look),
          onDone: (look, name, start) => { send({ c: 'look', look, name }); if (start && Object.keys(start).length) send({ c: 'start', pts: start }); cam.mode = null; cam.tyaw = cam.save.yaw; cam.tpitch = cam.save.pitch; cam.tdist = cam.save.dist; if (first) { hud.showHelp(true); } } });
      }
      hud.chat('Welcome to Ashvale.', 'sys');
      if (!save) hud.chat('Elder Maren waits by the well. Tap her to talk.', 'sys');
      if (!save && MOD.outfitStyles && !q.has('nocreator')) { myEnt.yaw = myEnt.tyaw = cam.yaw = cam.tyaw; openWardrobe(true); }
      else if (!store.get('ashvale3d.help') || !save) hud.showHelp(true);
      hud.refresh('all');
      /* playtest only (the operator tests new places on his own screen first, e.g. the Spider Cave): ?go=x,y starts you there.
         Never inside the arcade (a framed page), so the live game is unaffected. */
      /* playtest only, like ?go: ?lv=attack:14,strength:12,defence:22,hitpoints:26 starts you at those levels (the operator tests
         the Spider Cave at his own levels); ?kit=1 adds a staff, armour and food. Never inside the arcade. */
      if (!(G.parent && G.parent !== G) && q.get('lv')) { for (const kv of q.get('lv').split(',')) { const [k, v] = kv.split(':'); if (me.xp[k] != null && +v > 0) me.xp[k] = core.xpFor(+v) * 10; } me.hp = core.lv(me, 'hitpoints'); hud.refresh('all'); }
      if (!(G.parent && G.parent !== G) && q.get('kit')) setTimeout(() => { for (const [id, n] of [['staff_t3', 1], ['body_t2', 1], ['helmet_t2', 1], ['salmon', 8], ['potion', 2], ['antidote', 2]]) if (core.item(id)) game.give(id, n); hud.refresh('all'); }, 900);
      if (q.get('go') && !(G.parent && G.parent !== G)) { const gg = q.get('go').split(',').map(Number); if (gg.length === 2 && gg.every(Number.isFinite)) setTimeout(() => game.teleport(gg[0], gg[1]), 800); }
      netRoom();
      if (hintedAddr || hintedTag) walletRefresh().then(() => { if (q.has('chest')) hud.openChest(); });
      /* controller (src/gamepad.js): stick walks, A = the left-click option of the target near you, X attack, Y bag */
      const PAD = deps.gamepad ? deps.gamepad.create({ core, pid: PID, hud, host, cam, settings: () => settings, toggle: k => hudApi().toggle(k), send, doAct, optionsFor, sfx, facing: () => myEnt.yaw, screenOf: (k, id) => game.screenOf(k, id) }) : null;
      requestAnimationFrame(frame);

      /* ---------- debug / test handle */
      const game = {
        core, pid: PID, me, camera, cam, scene, ents, hud, regions, settings,
        screenOf(kind, id) { let pos, up = 0.8; if (kind === 'mob') { const e = ents.get('m:' + id); pos = e.root.position; up = (e.H.height || 1) * e.scale * 0.5; } else if (kind === 'npc') { const e = ents.get('n:' + id); pos = e.root.position; } else if (kind === 'item') { const o = gItems.get(id); pos = o.position; up = 0.08; } else if (kind === 'tile') { pos = new THREE.Vector3(id[0] + 0.5, heightAt(id[0] + 0.5, id[1] + 0.5), id[1] + 0.5); up = 0; } else if (kind === 'me') { pos = myEnt.root.position; } else if (kind === 'remote') { const e = ents.get('r:' + id); if (!e || !e.root.visible) return null; pos = e.root.position; up = (e.H.height || 1.6) * e.scale * 0.5; } const s = toScreen(pos, up); if (!s) return null; const r = host.getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; },
        give(id, n) { const p = me; for (let k = 0; k < (core.item(id).stack ? 1 : n || 1); k++) { const f = p.inv.indexOf(null); if (core.item(id).stack) { const i = p.inv.findIndex(s => s && s.id === id); if (i >= 0) { p.inv[i].n += n || 1; break; } } if (f < 0) break; p.inv[f] = { id, n: core.item(id).stack ? n || 1 : 1 }; } hud.refresh('all'); },
        setLevel(skill, L) { me.xp[skill] = core.xpFor(L) * 10; if (skill === 'hitpoints') me.hp = L; hud.refresh('all'); },
        teleport(x, y) { me.x = x; me.y = y; me.path = []; place(myEnt, x, y); cam.snap = true; streamRegions(); arriveCheck(); },
        netHealth: () => ({ online: !!room, lost: NW.lost, heardAgo: NW.heard ? Math.round(performance.now() - NW.heard) : null, fails: NW.fails, saveFails }), _netBreak: () => { if (room) { const R = room; R.send = () => Promise.resolve(false); } },
        zones: () => ({ loaded: (core.D.zones || []).map(z => z.id), index: ZINDEX ? ZINDEX.map(z => z.id) : null, waiting: Object.keys(LZ_WAIT), travelling }),
        tap: tapAt, menuAt, targetsAt, pad: () => PAD && PAD.state(), fps: () => frames, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }), setCam(y, p, d) { if (y != null) cam.tyaw = cam.yaw = y; if (p != null) cam.tpitch = cam.pitch = p; if (d != null) cam.tdist = cam.dist = d; },
        net: () => ({ host: hostOf(zoneHere()), amHost: !!room && hostOf(zoneHere()) === myNetId, hosts: Object.fromEntries(hosts), hosted: Array.from(hosted), area: zoneHere(), region: roomZone, myId: myNetId, ids: Array.from(remotes.keys()), room: room && room.id, me: room && room.me, neighbours: nb ? nb.rooms().map(R => R.id) : [], viewers: Array.from(remotes).filter(e => e[1].viewOnly).map(e => e[0]), status: netStatus, stats: Object.assign({ perSec: +(netStats.sent / Math.max(1, (performance.now() - netStats.t0) / 1000)).toFixed(2) }, netStats, { times: undefined }), gear: Array.from(remotes.values()).map(r => [r.name, r.e.H.gear || null]), remotes: Array.from(remotes.keys()), names: Array.from(remotes.values()).map(r => r.e.tag && r.e.tag.textContent) }),
        weather: (kind, intensity, ticks) => coreCall(() => core.setWeather(zoneHere(), kind, intensity == null ? 80 : intensity, ticks || 500)),
        say, store, models: MOD, allowedAsset, wallet: walletApi(DATA.items.items), walletState: () => walletState, walletRefresh,
        chestEventForTest: chestEvent,
        chest: { state: chestState, take: chestTake, store: chestStore, promise: paid => { const L = ledgerFor(walletState.address); for (const k in paid) L.pend[k] = (L.pend[k] || 0) + paid[k]; ledgerSave(); },
          paidForTest: paid => { const L = ledgerFor(walletState.address); for (const k in paid) { const toChest = Math.min(paid[k], L.lchest[k] || 0); L.lchest[k] -= toChest; L.pchest[k] = (L.pchest[k] || 0) + toChest; L.pend[k] = (L.pend[k] || 0) + paid[k] - toChest; } ledgerSave(); } },   /* tests */ trip: () => TRIP && TRIP.state(), trade: () => trade, peers: () => Array.from(remotes.values()).map(r => r.from), _remIds: () => Array.from(remotes.keys()), optionsAt: (cx, cy) => { const L = []; for (const t of targetsAt(cx, cy)) for (const o of optionsFor(t)) L.push(o.html.replace(/<[^>]+>/g, '')); return L; }, _remAnim: () => JSON.stringify(Array.from(remotes.values()).map(r => [r.anim, r.buf.length, r.buf.length && r.buf[r.buf.length - 1].a])),
        stop() { stopped = true; },
        sfxAt: (n, at) => sfx(n, at), sky: () => { const B = SUNL.b, s = sunAt(Date.now()); return B ? { up: dot3(s, B.u), dir: SUNL.dir, sun: sun.intensity, hemi: hemi.intensity } : null; },
        versionCheck, oneDevice: () => ({ sid: ONE.sid, at: ONE.at, room: !!ONE.room, addr: ONE.addr, stopped, version: VER.mine, told: VER.told })
      };
      void _handle;
      return game;
    }
    return { api: 1, start, openStore };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engine', { api: 1, v: 2, needs: { three: 160, core: 2, models: 1, scene: 2, hud: 1, net: 2, trade: 1, wallet: 1, trip: 2, audit: 1, gamepad: 1, data: 1 } }, engineFactory);
})(typeof globalThis !== 'undefined' ? globalThis : this);
