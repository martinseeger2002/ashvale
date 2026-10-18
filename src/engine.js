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
    /* THIS GAME'S HOME (handoff/ziibiing_start_plan.md): the Ziibiing card's launcher sets ASH3D_HOME before boot; on a page of its
       own (never framed in the arcade) ?home= does it. null = Ashvale, every save from before homes. A second character on the same
       wallet: its own save here (key suffix) and at the Bank (sv/ld? carry h), its own one-device room message (dev h). */
    const HOME = (() => { const h = G.ASH3D_HOME || (!(G.parent && G.parent !== G) && G.location && new URLSearchParams(G.location.search).get('home')); return h && h !== 'ashvale' && /^[a-z]{2,16}$/.test(h) ? h : null; })();
    const withHome = o => HOME ? Object.assign(o, { h: HOME }) : o, homeIs = d => (d && d.h || null) === HOME;   /* replies for the other character are not ours */
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
      return !ct || ct === 'application/json' || ct === 'image/png';
    }
    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
    const SPELL_COL = { Wind: '#e6f2ff', Water: '#3d8bff', Earth: '#7cc04a', Fire: '#ff6a1a', Shadow: '#8a3ad0' };

    /* ---------- saves: arcade.storage inside an arcade viewer (inscribed pages have NO localStorage, it throws),
       else this browser's localStorage, else memory only. Reads come from a cache filled before start(); writes go
       through and never throw (setItem rejects outside a viewer). */
    const STORE_KEYS = ['ashvale3d.save.v1', 'ashvale3d.settings.v1', 'ashvale3d.help', 'ashvale3d.music.v1'];   /* music.v1 (src/engmusic.js: on/off, volume, mode, unlocked tracks): it was written but never read back, so every visit began with the music on at 60% (2026-10-18) */
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
          if (G.ASH_LOAD) G.ASH_LOAD.set(0.72, 'Waiting for your arcade wallet to open your character…'); else if (bootEl) bootEl.textContent = 'Waiting for your arcade wallet to open your character…';
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
      /* [Claude 2026-10-14] the character of THIS home (the operator: "In ziibiing the character loads into the world before the assets ... a
         blank world"): its own save ('ashvale3d.save.v1.ziibiing') and, for a new one, its home's spawn - the Ashvale save and spawn
         loaded Ashvale's land behind the boot screen and Ziibiing's only after the world showed. (0.8.120 shipped this and crashed
         phones: scene's building floors were one array over the bounding box of the loaded areas - now kept per chunk.) */
      const homeSpawn = HOME && DATA.rules && DATA.rules.homes && DATA.rules.homes[HOME] && DATA.rules.homes[HOME].spawn;
      let at = (Array.isArray(homeSpawn) && homeSpawn) || (ZINDEX.find(z => z.respawn) || {}).respawn || [0, 0];
      try {
        const sv = JSON.parse(st.get('ashvale3d.save.v1' + (HOME ? '.' + HOME : '')) || 'null'), C = DATA.globecfg || {};
        if (sv && (sv.v | 0) >= 2 && Array.isArray(sv.pos) && C.origin) at = [sv.pos[1] - C.origin[0], sv.pos[2] - C.origin[1]];
        else if (sv && Number.isInteger(sv.x) && Number.isInteger(sv.y)) at = [sv.x, sv.y];
        for (const r of [[-200, 16100, -80, 16184, 24200, 7900], [40, 16300, 253, 16313, 23960, 8100]]) if (at[0] >= r[0] && at[0] < r[2] && at[1] >= r[1] && at[1] < r[3]) { at = [at[0] + r[4], at[1] + r[5]]; break; }   /* the underground moved (core.underMove) */
      } catch (e) { /* a new character */ }
      const bootEl = G.document && G.document.getElementById('boot'); if (G.ASH_LOAD) G.ASH_LOAD.set(0.75, 'Loading the land around you…'); else if (bootEl) bootEl.textContent = 'Loading the land around you…';
      /* the zone you stand IN must be here before the core places you (on land without its town you could be "blocked" and put
         back at the spawn): that one is waited for, retried for as long as it takes; the rest of the ring may come later */
      const zin = (ZINDEX.find(z => at[0] >= z.origin[0] && at[1] >= z.origin[1] && at[0] < z.origin[0] + z.size[0] && at[1] < z.origin[1] + z.size[1]) || {}).id;
      const nearIds = zonesNear(at[0], at[1]).filter(id => id !== zin); let landGot = 0;
      const landStep = () => { landGot++; if (G.ASH_LOAD) G.ASH_LOAD.set(0.75 + 0.2 * landGot / (nearIds.length + 1), 'Loading the land around you… ' + landGot + ' of ' + (nearIds.length + 1)); };   /* [Claude 2026-10-13] the bar follows the land */
      const near = nearIds.map(id => fetchZone(id).then(z => { landStep(); return z; }).catch(e => console.warn('ASHVALE: ' + e.message)));
      for (let k = 0; zin && !LZ[zin]; k++) {
        try { await fetchZone(zin); landStep(); } catch (e) { console.warn('ASHVALE: ' + e.message + ', trying again'); if (G.ASH_LOAD) G.ASH_LOAD.set(0, 'Still loading the land around you…'); else if (bootEl) bootEl.textContent = 'Still loading the land around you…'; await new Promise(r => setTimeout(r, Math.min(10000, 1000 * (k + 1)))); }
      }
      await Promise.race([Promise.all(near), new Promise(r => setTimeout(r, 15000))]);
    }
    async function openStore() {
      if (G.ASH_LOAD) { G.ASH_LOAD.claimed = true; G.ASH_LOAD.set(0.71, 'Opening your character…'); }   /* [Claude 2026-10-13] the launcher opens the save before it starts the game: the screen is the game's from here */
      /* while the wallet opens the save (that can take seconds), the zones around the spawn are already on their way: most
         characters stand there, and for the rest it is a few KB that warm the cache */
      if (ZINDEX && !G.ASH3D_LAZY_DELAY) { const hs = HOME && DATA.rules && DATA.rules.homes && DATA.rules.homes[HOME] && DATA.rules.homes[HOME].spawn, r0 = (Array.isArray(hs) && hs) || (ZINDEX.find(z => z.respawn) || {}).respawn;   /* this home's spawn */ if (r0) for (const id of zonesNear(r0[0], r0[1])) fetchZone(id).catch(() => {}); }   /* (not on a playtest page that shows a slow arrival) */
      const st = await openStoreOnly();
      try { await cloudLoad(st); } catch (e) { console.warn('ASHVALE: cloud save', e && e.message); }
      try { await preloadZones(st); } catch (e) { console.warn('ASHVALE: zones', e && e.message); } return st;
    }
    /* ---------- THE SAVE LIVES WITH THE BANK (2026-10-07: "the ashvale bank should hold game states instead of local storage
       ... and stats and the rest of the game state. That way, anyone can login on their account from any device and being the
       exact same game state. Make sure the game state save file is as lightweight as it can possibly be"). The whole save - bag,
       worn gear, stats, quests, place, the chest ledger - is packed (empty fields dropped, deflated, base64) to about 1 KB and kept
       by the @ashvale Bank under your wallet address, in pieces small enough for a room message. Starting, the game asks the Bank
       first and takes its copy when it is newer than this device's; playing, it hands the Bank each new save (at most every 20 s,
       and as you leave). The Bank keeps the newest per address and never reads inside it. */
    /* [Claude 2026-10-14] the operator: "we don't have a favicon, add one" - the launcher page is fixed on chain, so the game puts its icon
       on whatever page it runs in (data/brand/favicon.svg; build.py also inlines it into the page head) */
    try { if (typeof document !== 'undefined' && !document.querySelector('link[rel~="icon"]')) { const ic = document.createElement('link'); ic.rel = 'icon'; ic.type = 'image/svg+xml';
      ic.href = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1b241f"/><path d="M32 6 L54 14 V30 C54 44 44 53 32 58 C20 53 10 44 10 30 V14 Z" fill="#c9962e" stroke="#ffd23f" stroke-width="3"/><path d="M32 13 L47 18.5 V30 C47 40 40 47 32 51 C24 47 17 40 17 30 V18.5 Z" fill="#7a1f1f"/><rect x="29.5" y="16" width="5" height="26" rx="1.5" fill="#e8e6df"/><rect x="23" y="38" width="18" height="4" rx="2" fill="#ffd23f"/><rect x="30" y="42" width="4" height="7" rx="1" fill="#6b4a1e"/></svg>'); document.head.appendChild(ic); } } catch (e) { /* no document */ }
    const SAVE_KEY = 'ashvale3d.save.v1' + (HOME ? '.' + HOME : ''), CHUNK = 340;
    const slim = v => {   /* drop what a save does not need to say: nulls and empty objects (every value kept exactly) */
      if (Array.isArray(v)) return v.map(slim);
      if (v && typeof v === 'object') { const o = {}; for (const k in v) { const x = slim(v[k]); if (x == null || (typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length)) continue; o[k] = x; } return o; }
      return v;
    };
    async function packSave(json) {
      const raw = new TextEncoder().encode(JSON.stringify(slim(JSON.parse(json))));
      if (typeof CompressionStream === 'undefined') return 'j' + btoa(String.fromCharCode(...raw));
      const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      let b = ''; for (let i = 0; i < z.length; i += 4096) b += String.fromCharCode.apply(null, z.subarray(i, i + 4096)); return 'z' + btoa(b);
    }
    async function unpackSave(s) {
      const bin = Uint8Array.from(atob(s.slice(1)), ch => ch.charCodeAt(0));
      if (s[0] === 'j') return new TextDecoder().decode(bin);
      return new TextDecoder().decode(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    let CLOUD_OK = false;   /* the Bank answered at the start: only then may this game hand it saves (a stale device must never overwrite a newer one) */
    const bankSays = from => from && (from.address === DATA.assets.issuer || from.address === YOURFIRST_ADDR || from.tag === 'yourfirstname');
    /* the 'bank' room the save was loaded through stays joined and is handed to bankRoom() (2026-10-08): leaving it and joining
       again could hand back the room just left, which still sends but no longer hears - so the Bank's replies (svok, ground,
       felled, boats) almost never arrived */
    let BANK_LOAD_ROOM = null;
    function cloudLoad(st) {
      if (!G.arcade || !net || !net.join) return Promise.resolve();
      let local = null; try { local = JSON.parse(st.get(SAVE_KEY) || 'null'); } catch (e) { local = null; }
      return new Promise(done => {
        let R = null, fin = false; const parts = {};
        const end = () => { if (fin) return; fin = true; clearTimeout(tm); if (R) BANK_LOAD_ROOM = R; done(); };
        const tm = setTimeout(end, local ? 8000 : 20000);   /* no Bank in time: this device's save. With no save here (a new device) it waits longer - a cold sign-in takes the realtime room 10 s and more, and giving up would start a new character */
        net.join('bank', { game: 'ashvale' }).then(res => {
          if (fin || !res || !res.online) return end();
          R = res.room; const me = R.me && R.me.address; if (!me) return end();
          R.on('message', ({ from, data }) => {
            if (fin || !data || data.t !== 'ld' || data.to !== me || !bankSays(from) || !homeIs(data)) return;
            if (!data.n) { CLOUD_OK = true; return end(); }   /* the Bank holds no save for this address */
            parts[data.i] = data.d;
            if (Object.keys(parts).length < data.n) return;
            const blob = Array.from({ length: data.n }, (_, i) => parts[i] || '').join('');
            (blob ? unpackSave(blob) : Promise.resolve('')).then(json => {
              const cloud = json ? JSON.parse(json) : null, at = +data.id || 0;
              /* which to play (2026-10-07: gear changed on another device was gone back on this one): the Bank's, whenever it is not
                 the very save this device last synced with ('base') - some other device has played since; this device's own, when it
                 is (it may hold play the Bank has not had yet). A save from before 'base' existed: the newer by its time, as before. */
              const takeCloud = local && local.base != null ? at !== +local.base && !(local.mine != null && at === +local.mine) : at > ((local && local.at) || 0);   /* the Bank holding this device's own last save (its 'svok' lost on the way): this device's copy is as new or newer */
              if (!takeCloud && local && at) return st.set(SAVE_KEY, JSON.stringify(Object.assign(local, { base: at })));   /* ours goes on from the Bank's current one */
              if (takeCloud) {   /* play the Bank's ('' = a New character was made) */
                console.info('ASHVALE: the save from the Bank (' + new Date(at).toISOString() + ') is newer than this device\'s');
                return st.set(SAVE_KEY, cloud ? JSON.stringify(Object.assign(cloud, { at, base: at, mine: undefined })) : '');   /* another device's 'mine' is not ours */
              }
            }).then(() => { CLOUD_OK = true; }, e => console.warn('ASHVALE: cloud save unreadable', e && e.message)).then(end);
          });
          /* ask again every 2.5 s until the Bank answers: on a cold start the first question, sent the moment the room opens,
             is often lost (live test 2026-10-07: joined at 6.7 s, the Bank never heard it) */
          const ask = () => { if (fin || Object.keys(parts).length) return; R.send(withHome({ t: 'ld?' })); setTimeout(ask, 2500); }; ask();
        }, end);
      });
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
      if (G.ASH_LOAD) G.ASH_LOAD.claimed = true;   /* [Claude 2026-10-13] the game holds the loading screen until its first frame */
      opts = opts || {};
      const q = new URLSearchParams(location.search);
      const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
      const isPhone = isTouch && Math.min(innerWidth, innerHeight) < 600;
      const store = opts.store || memoryStore();
      const SAVE = SAVE_KEY, SET = 'ashvale3d.settings.v1';
      let save = null; try { save = JSON.parse(store.get(SAVE) || 'null'); } catch (e) { save = null; }
      if (opts.fresh || q.has('fresh') || q.has('dragonheart')) save = null;
      let settings = { sound: true, shadows: !isPhone, runToggle: false, showPet: true }; try { Object.assign(settings, JSON.parse(store.get(SET) || '{}')); } catch (e) { /* defaults */ }

      /* ---------- data + rules */
      /* the zones here now: an eager registry's (DATA zone.*), and the ones area loading fetched before the start (LZ). With an
         index, more arrive while you play (lazyTick, core.addZone) */
      const zones = Object.keys(DATA).filter(k => k.indexOf('zone.') === 0).map(k => Object.assign({ id: k.slice(5) }, DATA[k]));
      if (ZINDEX) for (const z of ZINDEX) if (LZ[z.id] && !zones.some(q => q.id === z.id)) zones.push(Object.assign({}, LZ[z.id]));
      const D = { items: DATA.items.items, monsters: DATA.monsters.monsters, shops: DATA.shops, quests: DATA.quests, rules: DATA.rules, zones, globecfg: DATA.globecfg, decor: DATA.decor };   /* decor: solid scenery stands in the way (world.js stampDecor) */
      if (ZINDEX) D.zoneIndex = DATA.zoneindex;
      const seed = opts.seed || q.get('seed') || ('ashvale-' + Date.now());
      /* globe P2: seeded land around the old map (worldgen + globe modules, when the registry has them; ?flat turns it off) */
      { const get = n => G.ASH3D && G.ASH3D.get ? G.ASH3D.get(n) : null, WGM = get('worldgen'), AG = get('globe'), AW = get('world') || G.AshWorld;
        if (WGM && AG && AW && AW.seededWorldgen && !q.has('flat')) { try { D.wg = AW.seededWorldgen(WGM, AG, D); } catch (er) { console.warn('worldgen', er && er.message); } } }
      const core = AshCore.create(D, { seed });
      const PID = 'me';
      /* where a new character is born (handoff/ziibiing_start_plan.md): the Ziibiing card's launcher sets ASH3D_HOME; on this machine's
         preview ?home=ziibiing does the same */
      if (HOME && core.setNewHome) core.setNewHome(HOME);
      const me = core.addPlayer(PID, save);
      let FE = null;   /* [Claude 2026-10-16] the Fortune Engines' part (engfortune.js), installed with the Bank client below */
      let PET = null;  /* [Claude 2026-10-17] pets from Doginals (engpet.js): a Doginal Dog or an Anti Doginal Dog in the wallet walks at your heel */
      if (!/^@/.test(String(me.name || ''))) me.name = '@guest';   /* [Claude 2026-10-15] no chosen names any more: '@guest' until the arcade says your @tag (the operator: "There's no need for two names") */
      /* Purpose-built local playtest for The Heart Below. It never runs in the framed arcade and always starts from a fresh,
         disposable character: all combat and dungeon-check skills at 99, prerequisite stories complete, and top-tier kit. */
      if (q.has('dragonheart') && !(G.parent && G.parent !== G)) {
        for (const sk of D.rules.skills || []) me.xp[sk] = core.xpFor(99) * 10;
        for (const id of ['wayside_prayer', 'red_pyre', 'even_grove', 'even_guard', 'foolhardy_hero']) {
          const Q = D.quests.quests[id]; if (Q) me.quests[id] = { step: Q.steps.length + 1, n: 0 };
        }
        me.name = '@heart_tester'; me.x = -10; me.y = -78; me.hp = core.maxHp(me); me.pp = core.maxPp(me);
        me.inv = new Array(28).fill(null);
        [['bow_t5', 1], ['staff_t5', 1], ['arrows_t5', 500], ['pickaxe', 1], ['tinderbox', 1], ['potion', 8], ['prayer_potion', 8], ['antidote', 4], ['lobster', 10]].forEach(([id, n], i) => { if (core.item(id)) me.inv[i] = { id, n }; });
        me.eq = {};
        for (const [slot, id, n] of [['head', 'helmet_t5', 1], ['cape', 'dragon_cape', 1], ['body', 'body_t5', 1], ['legs', 'legs_t5', 1], ['feet', 'fighter_boots', 1], ['weapon', 'sword_t5', 1], ['shield', 'shield_t5', 1], ['ammo', 'arrows_t5', 500]]) if (core.item(id)) me.eq[slot] = { id, n };
        if (q.has('dungeon')) {
          const floor = Math.max(-4, Math.min(-1, parseInt(q.get('dungeon') || '-1', 10) || -1));
          me.quests.dragon_heart = { step: 3, n: 0, kn: {} };
          if (!me.inv.some(s => s && s.id === 'dragonheart_key')) me.inv[me.inv.findIndex(s => !s)] = { id: 'dragonheart_key', n: 1 };
          me.x = floor === -1 ? -57 : floor === -2 ? -59 : -60; me.y = floor === -1 ? -101 : floor === -2 ? -104 : -105;
          me.lv = floor; me.bld = core.M.buildingAt(me.x, me.y, floor); me.path = []; me.act = null;
          me.flags = me.flags || {};
          if (floor <= -2) me.flags.heart_iron_tuned = 1;
          if (floor <= -3) me.flags.heart_echo_cleared = 1;
          if (floor <= -4) Object.assign(me.flags, { heart_prayer_melee: 1, heart_prayer_ranged: 1, heart_prayer_magic: 1, heart_balance_tuned: 1 });
        }
      }
      /* [Claude 2026-10-12] PRIVATE HOLE CARDS (the operator). The mesh is broadcast-only, so secrecy is made here: every game holds an
         ECDH P-256 key for the session; a sitter's public key rides with the sit (cmd pk -> PS) and lives on the dealer's seat;
         the dealer seals each seat's two cards with AES-GCM under ECDH(dealer, seat) and puts only the sealed blobs in the row
         (hk = the dealer's public key); a replica opens its own and hands the two numbers to its core (pokerOpen). A seat without
         a key (no WebCrypto) gets its cards plain, as before - only that seat's. The showdown is public (r.sd), as it should be. */
      const CRY = (typeof globalThis !== 'undefined' && globalThis.crypto) || null, SUBTLE = CRY && CRY.subtle ? CRY.subtle : null;
      const B64 = { enc: b => btoa(String.fromCharCode.apply(null, new Uint8Array(b))), dec: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)) };
      let MYKEY = null, MYPK = '';
      /* P-256 points travel compressed (33 bytes, 44 chars): the room's messages are 512 B, a dealer's row cannot carry 65-byte keys */
      const P256 = { p: (1n << 256n) - (1n << 224n) + (1n << 192n) + (1n << 96n) - 1n, b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn };
      const bnOf = u8 => { let n = 0n; for (const b of u8) n = (n << 8n) | BigInt(b); return n; }, u8Of = (n, len) => { const o = new Uint8Array(len); for (let i = len - 1; i >= 0; i--) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
      const modPow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
      const compress = raw => { const u = new Uint8Array(raw); const o = new Uint8Array(33); o[0] = 2 + (u[64] & 1); o.set(u.slice(1, 33), 1); return B64.enc(o); };
      const decompress = s => { const c = B64.dec(s); if (c.length === 65) return c; const x = bnOf(c.slice(1)), p = P256.p; let y = modPow((x * x * x - 3n * x + P256.b) % p, (p + 1n) / 4n, p); if ((y & 1n) !== BigInt(c[0] & 1)) y = p - y; const o = new Uint8Array(65); o[0] = 4; o.set(u8Of(x, 32), 1); o.set(u8Of(y, 32), 33); return o; };
      if (SUBTLE) SUBTLE.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']).then(async k => { MYKEY = k; MYPK = compress(await SUBTLE.exportKey('raw', k.publicKey)); }).catch(() => { MYKEY = null; MYPK = ''; });
      const AESK = new Map(), SEALED = new Map(), OPENED = new Map(), SEALING = new Set();
      async function aesFor(peerPk) {
        if (AESK.has(peerPk)) return AESK.get(peerPk);
        const pub = await SUBTLE.importKey('raw', decompress(peerPk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        const bits = await SUBTLE.deriveBits({ name: 'ECDH', public: pub }, MYKEY.privateKey, 256);
        const key = await SUBTLE.importKey('raw', await SUBTLE.digest('SHA-256', bits), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        AESK.set(peerPk, key); return key;
      }
      const sealTag = (t, h, ref) => new TextEncoder().encode(String(t) + '|' + (h | 0) + '|' + (ref | 0));
      /* the nonce is the tag's hash: one (table, hand, seat) is sealed once under one pair key, so it never repeats; 18-byte blobs */
      const ivOf = async (t, h, ref) => new Uint8Array(await SUBTLE.digest('SHA-256', sealTag(t, h, ref))).slice(0, 12);
      async function sealCards(t, h, ref, c1, c2, peerPk) {
        const key = await aesFor(peerPk), iv = await ivOf(t, h, ref);
        return B64.enc(new Uint8Array(await SUBTLE.encrypt({ name: 'AES-GCM', iv, additionalData: sealTag(t, h, ref) }, key, new Uint8Array([c1 & 255, c2 & 255]))));
      }
      async function openCards(t, h, ref, blob, hostPk) {
        const key = await aesFor(hostPk), iv = await ivOf(t, h, ref);
        const pt = new Uint8Array(await SUBTLE.decrypt({ name: 'AES-GCM', iv, additionalData: sealTag(t, h, ref) }, key, B64.dec(blob)));
        return [pt[0], pt[1]];
      }
      const PH = {}, PH_SENT = {};   /* the dealer's sealed set per table: {h, items: [[ref, blob]...]} - sent on its own small message (Ph) */
      function phSend(t, force) { const P = PH[t]; if (!P || !P.done) return; const now = performance.now(); if (!force && now - (PH_SENT[t] || 0) < 3000) return; PH_SENT[t] = now; netSendBig({ Ph: [t, P.h, MYPK, P.items] }, tRoom(t)); }
      const bounded = (m, n) => { while (m.size > n) m.delete(m.keys().next().value); };
      const SCORE_KEYS = ['chain_dragon', 'chess_wins'], SCORE_BOARD = { chain_dragon: 'dragon', chess_wins: 'chess' };   /* [Claude 2026-10-11] score key -> the sign it paints */
      /* 2026-10-12 (the operator: "the bank is the only thing that stores the high score and it doesn't get the high score from
         the clients"): what a sign shows comes only from the Bank's answer. Nothing is read from this device's storage and
         nothing from the character's own kill counts - either would repaint a board the Bank has cleared. */
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
      /* SHADOWED is the layer of what the player must not see but the sun must still be blocked by - the roof that is
         taken away while you are inside (roofCheck). No camera is given this layer, the sun's shadow camera is, so the
         pieces draw nowhere and fall into the shadow map exactly as if they were on screen. */
      const SHADOWED = 1; sc.layers.enable(SHADOWED);
      scene.add(sun, sun.target);

      /* ---------- world regions (one per zone module), streamed in/out by distance; with seeded land also the 64 m
         chunks around you (globe P2), built with the same scene code so they look the same, at most one per tick unless
         it is close (the fog hides the far edge) */
      const regions = zones.map(z => ({ id: z.id, rect: [z.origin[0], z.origin[1], z.size[0], z.size[1]], built: null }));
      /* how far you see and what is built for it (2026-10-07: "stuff isn't loading out far enough so you can see it loading
         when you're moving. It should be loaded before you get there"): the fog is measured from YOU, not from the camera (see
         FOGV in frame()), it ends VIEW m out (a hawk sees HAWK_VIEW times as far), and towns, chunks and trees are built a margin
         beyond it, so nothing is ever made where you can see it */
      const VIEW = 52, HAWK_VIEW = 1.8, VIEWS = { me: null }, viewR = () => VIEW * (VIEWS.me && VIEWS.me.hawk ? HAWK_VIEW : 1);
      const SEEDED = !!core.M.seeded, CH_NEAR = 30;
      let LOAD_D = 0, DROP_D = 0, CH_LOAD = 0, CH_DROP = 0, TREE_R = 0;
      function setReach() { const v = viewR(); LOAD_D = v + 24; DROP_D = v + 60; CH_LOAD = v + 24; CH_DROP = v + 80; TREE_R = v + 12; }
      setReach();
      const heightAt = SCENE.heights ? SCENE.heights(core.M) : (x, z) => 0;
      const chunkRegs = new Map();
      function regionDist(r, x, y) { const dx = Math.max(r.rect[0] - x, 0, x - (r.rect[0] + r.rect[2])), dy = Math.max(r.rect[1] - y, 0, y - (r.rect[1] + r.rect[3])); return Math.max(dx, dy); }
      function paintScores() { if (SCENE.boardPaint) for (const k of SCORE_KEYS) SCENE.boardPaint(SCORE_BOARD[k], core.scoreBoard(k)); }
      let scoreTell = () => {}, scoresAsk = () => {};
      function addBuilt(r, opt) { r.built = SCENE.build(core.M, opt); scene.add(r.built.group); for (const k in core.S.dep) r.built.setDepleted(+k, true); paintScores(); }
      function streamRegions(force) {
        setReach();
        for (const r of regions) {
          if (r.chunk) continue;
          const d = regionDist(r, me.x, me.y);
          if (!r.built && (d <= LOAD_D || force)) { addBuilt(r, { rect: r.rect, outer: r === regions[0] }); syncMounts(); }
          else if (r.built && d > DROP_D) { scene.remove(r.built.group); r.built.dispose(); r.built = null; }
        }
        if (!SEEDED) return;
        const pcx = me.x >> 6, pcy = me.y >> 6, CR = Math.ceil(CH_LOAD / 64) + 1; let built = 0;
        const want = [];
        for (let cy = pcy - CR; cy <= pcy + CR; cy++) for (let cx = pcx - CR; cx <= pcx + CR; cx++) {
          const k = cx + ',' + cy, rect = [cx * 64, cy * 64, 64, 64], d = regionDist({ rect }, me.x, me.y);
          if (d <= CH_LOAD && !chunkRegs.has(k)) want.push([d, k, rect]);
        }
        want.sort((a, b) => a[0] - b[0]);
        for (const [d, k, rect] of want) {
          if (!force && built >= 2 && d > Math.max(CH_NEAR, viewR())) break;   /* two far chunks per call; anything you could see is built at once */
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
      /* 2026-10-07: "The loading screens need to come up as soon as a player clicks on a portal or the cave or a wigwam":
         travelScreen goes up the moment you choose to go (and again, unchanged, when the jump itself comes), stays at least
         CAVE_MS, and while a jump is still due (TRAVEL.due) or the area there is loading (arriveCheck's travelling) it waits.
         A jump that never comes (refused, out of reach) lets it go after TRAVEL_GIVEUP. */
      const TRAVEL = { t0: 0, kind: null, name: '', due: 0, on: false, hold: false, warm: true }, TRAVEL_GIVEUP = 8000;
      function travelScreen(kind, name, due) {
        const now = performance.now();
        if (!TRAVEL.on || TRAVEL.kind !== kind) TRAVEL.t0 = now;
        TRAVEL.warm = false;
        TRAVEL.kind = kind; TRAVEL.name = name || TRAVEL.name; TRAVEL.due = due ? now + TRAVEL_GIVEUP : 0; TRAVEL_KIND = kind;
        hud.travel && hud.travel(true, TRAVEL.name, 0.15, kind);
        if (TRAVEL.on) return; TRAVEL.on = true;
        const tick = () => {
          const n = performance.now(), f = (n - TRAVEL.t0) / CAVE_MS;
          if (travelling) { TRAVEL.on = false; return; }   /* arriveCheck holds the screen from here and lets it go */
          if (f >= 1 && !TRAVEL.hold && !(TRAVEL.due && n < TRAVEL.due)) { TRAVEL.on = false; TRAVEL_KIND = null; hud.travel && hud.travel(false); return; }
          hud.travel && hud.travel(true, TRAVEL.name, Math.min(0.95, 0.15 + 0.8 * Math.min(1, f)), TRAVEL.kind); requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      const caveTravel = (kind, name) => travelScreen(kind, name, false);
      const PASSK = { cavemouth: 'down', caveexit: 'up', hatch: 'down', heartladder: 'up', wigwamdoor: 'lodge', wigwamout: 'lodgeout' };
      /* the moment you choose a passage or a portal: up goes the screen (when you are already beside it), and the area on
         the far side starts loading now rather than when you arrive */
      function travelSoon(kind, name, tx, ty, near) {
        if (ZINDEX && tx != null) { const zi = zoneAtIndex(tx, ty); if (zi && !core.hasZone(zi.id)) fetchZone(zi.id).then(z => { if (!core.hasZone(zi.id)) coreCall(() => core.addZone(Object.assign({}, z))); }).catch(() => {}); }
        if (near) travelScreen(kind, name, true);
      }
      function arriveCheck() {
        if (!ZINDEX) return;
        const zi = zoneAtIndex(me.x, me.y); lazyTick(true);
        if (!zi || core.hasZone(zi.id) || travelling) return;
        const t0 = performance.now(), want = zi.id; travelling = want;
        hud.travel && hud.travel(true, zi.name || zi.id, 0, TRAVEL_KIND);
        let k = 0;
        const step = () => {
          if (core.hasZone(want)) { const left = Math.max(0, (TRAVEL_KIND ? CAVE_MS : TRAVEL_MS) - (performance.now() - Math.min(t0, TRAVEL.t0 || t0))); setTimeout(() => { travelling = null; TRAVEL_KIND = null; TRAVEL.due = 0; streamRegions(true); cam.snap = true; hud.travel && hud.travel(false); }, left); return; }
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
      function gearOf(p) { const g = {}; for (const k of ['head', 'cape', 'pack', 'body', 'legs', 'weapon', 'shield', 'ammo', 'feet', 'ring']) g[k] = p.eq[k] ? p.eq[k].id : null; return g; }
      /* the hawk ring: an entity wearing it is drawn as a hawk HAWK_ALT m up, wings beating (the operator) */
      const HAWK_ALT = 28 /* doubled (2026-10-08) */, ringHawk = (id) => !!(id && D.items[id] && (D.items[id].attributes || []).some(a => a.trait_type === 'Form' && a.value === 'hawk'));
      /* the hawk's height (2026-10-04): a dive down to its prey on every strike, perched in a tree on the side you
         tapped, standing on the ground (legs and shadow back) when it carries too much */
      const PERCH_H = 1.75, PERCH_OUT = 0.55, SIT_SCALE = 0.42;   /* perched IN the tree (2026-10-07: it stood above the crown): on a branch among the leaves, on the side you chose */   /* perched or standing, the hawk is bird-sized next to a tree (it flies big to be seen from high up) */
      /* height above the ground for a floor: a building's storey is 1.8 m, a castle wall walk its own height (lh); an NPC
         posted up there (a watchman on the wall: lv, lh in the zone) stands on it too */
      function liftOf(e, a) {
        const c = e.key.charAt(0);
        let up = 0;
        if (c === 'p') { const p = core.S.players[e.key.slice(2)]; if (p && p.lv) { const B = p.bld >= 0 && core.M.buildings ? core.M.buildings[p.bld] : null; up = p.lv * (B && B.lh ? B.lh : 1.8); } }
        else if (c === 'm') { const m = core.mobByUid(+e.key.slice(2)); if (m && m.lv) { const bi = core.M.buildingAt ? core.M.buildingAt(Math.floor(e.to.x), Math.floor(e.to.z), m.lv | 0) : -1, B = bi >= 0 && core.M.buildings ? core.M.buildings[bi] : null; up = m.lv * (B && B.lh ? B.lh : 1.8); } }
        else if (c === 'n') { const n = core.M.npcs.find(q => 'n:' + q.id === e.key); if (n && n.lv && !n.lh) { const bi = core.M.buildingAt ? core.M.buildingAt(n.x, n.y, n.lv | 0) : -1, B = bi >= 0 && core.M.buildings ? core.M.buildings[bi] : null; up = n.lv * (B && B.lh ? B.lh : 1.8); } }   /* an NPC upstairs in a building (the Frostspire's Archmage, 2026-10-18); one with its own lh stands on a castle wall (lifts below) */
        else if (c === 'r') {   /* [Claude 2026-10-11] another player on a storey: their last row says which (l), the building under them says how tall */
          const r = remotes.get(e.key.slice(2)), b = r && r.buf.length ? r.buf[r.buf.length - 1] : null;
          if (b && b.l) { const bi = core.M.buildingAt ? core.M.buildingAt(Math.floor(e.to.x), Math.floor(e.to.z)) : -1, B = bi >= 0 && core.M.buildings ? core.M.buildings[bi] : null; up = b.l * (B && B.lh ? B.lh : 1.8); }
        }
        /* raised ground (a castle's stairs and wall walk): the height of the tiles you walk between, blended as you go - so you walk up the steps */
        if (core.M.lifts && (c === 'p' || c === 'n' || c === 'r' || c === 'm')) {
          const L = (v) => core.M.liftAt(Math.floor(v.x), Math.floor(v.z)), l0 = L(e.from), l1 = L(e.to), t = a == null ? 1 : Math.max(0, Math.min(1, a));
          up += l0 + (l1 - l0) * t;
        }
        return up;
      }
      /* THE CANOE (2026-10-07, Ziibiing): whoever sits in one rides the water's skin in a birch bark canoe, paddle in hand */
      const SURF = SCENE.surface ? SCENE.surface(core.M) : null;
      /* where feet stand: the ground, or on a frozen lake the ice (2026-10-07: walk ON the ice, not along the lake bed) */
      function footY(x, z) { const h = heightAt(x, z); if (!(core.M.iceAt && core.M.iceAt(Math.floor(x), Math.floor(z)))) return h; const w = SURF ? SURF(Math.floor(x), Math.floor(z)) : null; return w != null && w > h ? w + 0.03 : h; }
      const waterY = (x, z) => { const h = heightAt(x, z); if (!SURF) return h; const s = SURF(Math.floor(x), Math.floor(z)); return s != null && s > h ? s : h; };
      /* two in one canoe (ricing): the knocker sits in the bow, the canoe's length ahead of the poler, facing the way it goes */
      function bowSeat(e, T, knocking) { const f = knocking ? 1.4 : 1.95;   /* knocking rice, the bow person sits in nearer the middle */   /* the bow seat: the stern paddler is 0.95 behind the canoe's middle, the bow one 1.0 ahead of it */ e.root.position.set(T.root.position.x + Math.sin(T.yaw) * f, T.root.position.y - 0.14, T.root.position.z + Math.cos(T.yaw) * f); e.yaw = e.tyaw = T.yaw; e.root.rotation.y = T.yaw; }
      /* PADDLES OR POLE (2026-10-07: "a single person or two people should be able to navigate using the canoe as well just
         using paddles"): a canoe is paddled, by one or by two; it is poled only for ricing - someone knocking in the bow and the
         rice standing round the canoe - and then the one in the stern stands with the push pole */
      const RICEQ = { t: 0, on: false };
      function ricingNow() {
        const now = performance.now(); if (now - RICEQ.t < 500) return RICEQ.on; RICEQ.t = now;
        const rider = me.boat === 1 && me.inv.some(sl => sl && sl.id === 'push_pole') && [...remotes.values()].some(r => r.boat === 2 && r.ride === myNetId && r.knock);   /* ricing: my pole, their knockers */
        RICEQ.on = !!rider && (core.M.objects || []).some(o => o.k === 'rice' && Math.max(Math.abs(o.x - me.x), Math.abs(o.y - me.y)) <= 3);
        return RICEQ.on;
      }
      function boatLook(e, on) {
        if (!!e.canoe === on || !SCENE.canoeMesh) return;
        if (on) { e.canoe = SCENE.canoeMesh(); e.canoe.position.y = 0.0; e.canoe.position.z = 0.95;   /* you sit in the stern: the canoe reaches ahead of you to the bow */ e.root.add(e.canoe); if (e.blob) e.blob.visible = false; }
        else { e.root.remove(e.canoe); e.canoe = null; if (e.blob) e.blob.visible = !settings.shadows; }
      }
      /* the head turned up or down to where they look: up to 40 degrees each way, eased */
      function headLook(e, el, dt) { const hd = e.H && e.H._parts && e.H._parts.head; if (!hd) return; const want = -Math.max(-0.7, Math.min(0.7, el)); e.hlR = (e.hlR || 0) + (want - (e.hlR || 0)) * Math.min(1, dt * 8); hd.rotation.x = e.hlR; }
      function hawkAlt(e) {
        if (!e.hawk) return e.alt || 0;
        if (e === myEnt) {
          const grounded = (me.burden || 0) > 0, P = me.perch, perched = !!(P && me.x === P.x && me.y === P.y && !me.path.length);
          if (grounded !== e.hawkGround || perched !== e.hawkPerch) {
            e.hawkGround = grounded; e.hawkPerch = perched;
            if (e.hawk.flying) e.hawk.flying(!(grounded || perched));
            if (e.blob) e.blob.visible = grounded && !settings.shadows;
            e.hawk.play(grounded ? 'walk' : perched ? 'idle' : 'run', { loop: true, speed: perched ? 1e-6 : 1 });   /* perched: still as a stone (no pecking) */
          }
          e.hawk.object.scale.setScalar(grounded || perched ? SIT_SCALE : 1);
          if (grounded) return 0;
          if (perched) { e.hawk.object.position.set(PERCH_OUT * (P.sx || 0), 0, PERCH_OUT * (P.sy || 0)); return PERCH_H; }
          e.hawk.object.position.set(0, 0, 0);
        }
        if (e.dive) { const t = (performance.now() - e.dive) / 900; if (t >= 1) e.dive = 0; else return HAWK_ALT * (1 - 0.96 * Math.sin(Math.PI * t)); }   /* the dive still bottoms out ~1 m over the prey */
        return e.alt || HAWK_ALT;
      }
      function hawkify(e, ring) {
        const on = ringHawk(ring); if (!!e.hawk === on) return;
        if (on) { e.hawk = MOD.monster('hawk'); if (e.hawk.flying) e.hawk.flying(); e.root.add(e.hawk.object); e.hawk.play('run', { loop: true }); e.H.object.visible = false; e.alt = HAWK_ALT; if (e.blob) e.blob.visible = false; }   /* no legs, no shadow (the operator) */
        else { e.root.remove(e.hawk.object); e.hawk = null; e.H.object.visible = true; e.alt = 0; if (e.blob) e.blob.visible = !settings.shadows; }
        if (e === myEnt) { cam.tdist = 11; cam.tpitch = on ? 0.5 : 0.6; }   /* the hawk sees through its own eyes (FPV below), looking a little down */
      }
      function makeEnt(key, H, pick, scale) {
        const e = { key, H, root: new THREE.Group(), from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: TICK, yaw: 0, tyaw: 0, loco: null, oneShot: false, dead: false, impacts: [], splats: [], hpT: 0, hp: 1, max: 1, running: false, skill: null, fade: 0, scale: scale || CHAR };
        H.object.scale.setScalar(e.scale); e.root.add(H.object); scene.add(e.root);
        const h = (H.height || 1.8) * 1.0;
        const px = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, Math.max(0.6, h * 0.95), 8), proxyMat); px.position.y = Math.max(0.3, h * 0.47); px.userData.pick = pick; px.userData.ent = e; e.root.add(px); e.proxy = px; proxies.push(px);
        e.blob = new THREE.Mesh(blobGeo, blobMat); e.blob.position.y = 0.03; e.blob.visible = !settings.shadows; e.root.add(e.blob);
        H.object.traverse(o => { if (o.isMesh) o.castShadow = true; });
        H.onEvent((type, name) => { if (type === 'impact') onImpact(e, name); else if (type === 'done' && name !== 'death' && name !== 'sprawl') e.oneShot = false; });
        ents.set(key, e); return e;
      }
      function removeEnt(e) { if (e.bub) e.bub.el.remove(); scene.remove(e.root); const i = proxies.indexOf(e.proxy); if (i >= 0) proxies.splice(i, 1); e.H.dispose && e.H.dispose(); for (const s of e.splats) s.el.remove(); if (e.chain) for (const lk of e.chain.links) scene.remove(lk); if (e.bar) e.bar.remove(); if (e.tag) e.tag.remove(); if (e.ohd) e.ohd.remove(); ents.delete(e.key); }
      function place(e, x, y) { e.trail = null; const v = new THREE.Vector3(x + 0.5, 0, y + 0.5); v.y = footY(v.x, v.z); e.from.copy(v); e.to.copy(v); e.root.position.copy(v); e.tx = x; e.ty = y; }
      function moveTo(e, x, y, now) {
        if (e.tx === x && e.ty === y) return false;
        const steps = Math.max(Math.abs(x - e.tx), Math.abs(y - e.ty));
        e.from.copy(e.root.position); e.to.set(x + 0.5, 0, y + 0.5); e.t0 = now; e.dur = TICK;
        e.running = steps > 1;
        /* face the way you are going over the last few steps, not each tile's own step (no 45-degree snap at every tile) */
        e.trail = (e.trail || []); e.trail.push([x, y]); if (e.trail.length > 3) e.trail.shift();   /* the last two steps' way: a diagonal and a straight step make one heading between them */
        const t0 = e.trail[0]; e.headYaw = (t0[0] !== x || t0[1] !== y) && steps <= 2 ? Math.atan2(x - t0[0], y - t0[1]) : null;
        e.tx = x; e.ty = y; return true;
      }
      const faceYaw = f => Math.atan2(DIRS[f][0], DIRS[f][1]);
      function playOnce(e, name, speed) { e.oneShot = true; e.lastOne = name; e.oneT = performance.now(); e.H.play(name, { loop: false, speed: speed || 1 }); }

      const myEnt = makeEnt('p:' + PID, MOD.humanoid({ skin: '#e0b48c', hair: '#4a2c18', shirt: '#3d6a9a', pants: '#5a4632', shoes: '#3a2a1a' }), { kind: 'self' });
      VIEWS.me = myEnt;
      myEnt.H.setGear(gearOf(me)); place(myEnt, me.x, me.y); setTimeout(() => hawkify(myEnt, me.eq.ring && me.eq.ring.id), 0);
      /* a character with no look of its own yet wears its HOME's creator defaults, never the town's stand-in (2026-10-09:
         "No ziibiing born should ever look like the villager placeholder") */
      const homeLook = h => { const HC = ((D.rules.homes || {})[h || 'ashvale'] || {}).creator; return HC && HC.defaults ? HC.defaults : null; };
      { const L0 = me.look || homeLook(core.homeOf(me)); if (L0 && myEnt.H.setOutfit) myEnt.H.setOutfit(L0); }
      const NPCN = {};
      /* which way a person stands when nobody is talking to them (2026-10-06: "all of the NPC's are all facing the same
         direction"): the zone data can say (n.face, radians); otherwise they look out over the most open ground within 5 tiles -
         the street or the square rather than a wall - leaning toward paths, where people walk up to them. Indoors only the room
         counts. Ties break on the id, so neighbours do not all turn alike. */
      function homeYaw(n) {
        if (n.face != null) return typeof n.face === 'string' ? ({ n: PI, e: PI / 2, s: 0, w: -PI / 2 })[n.face] || 0 : n.face;   /* a compass letter (Mishoomis 'e') was NaN and drew him faint (found by the Ziibiing session, 2026-10-09) */
        const M = core.M, inside = !!(M.insideAt && M.insideAt(n.x, n.y)); let best = -1, yaw = PI, hv = 0;
        for (let i = 0; i < String(n.id).length; i++) hv = (hv * 31 + String(n.id).charCodeAt(i)) >>> 0;
        for (let d = 0; d < 8; d++) {
          const dx = [0, 1, 1, 1, 0, -1, -1, -1][d], dy = [1, 1, 0, -1, -1, -1, 0, 1][d];
          let sc = 0;
          for (let r = 1; r <= 5; r++) {
            const x = n.x + dx * r, y = n.y + dy * r;
            if (M.blocked(x, y) || (!!(M.insideAt && M.insideAt(x, y))) !== inside) break;
            sc += (6 - r) * ('pc'.indexOf(M.tileAt(x, y)) >= 0 ? 1.5 : 1);
          }
          sc += ((hv >>> (d * 3)) & 7) * 0.05;
          if (sc > best) { best = sc; yaw = Math.atan2(dx, dy); }
        }
        return yaw;
      }
      function npcShown(n) {
        if (n.goneFlag && core.hasFlag(me, n.goneFlag)) return false;
        return !n.hideFlag || core.hasFlag(me, n.hideFlag);
      }
      /* a corpse: splay the limbs, then tip the rig onto its back so the body rests on the floor */
      function layDead(e) {
        e.prone = true; e.oneShot = true; e.loco = 'sprawl';
        if (e.H && e.H.play) { e.H.play('sprawl'); e.H.update(1); }
        e.H.object.rotation.x = -Math.PI / 2;
        e.H.object.position.set(0, 0.16, 0.55);
        if (e.proxy) { e.proxy.position.set(0, 0.22, 0.05); e.proxy.scale.set(1.5, 0.22, 1.15); }
      }
      function npcEnt(n) { const e = makeEnt('n:' + n.id, MOD.npc(n.look || n.id), { kind: 'npc', id: n.id }); place(e, n.x, n.y); e.homeYaw = homeYaw(n); e.yaw = e.tyaw = e.homeYaw; NPCN[n.id] = n; if (n.gear && e.H && e.H.setGear) e.H.setGear(n.gear); if (n.lie) layDead(e); else if (n.rope) { e.alt = +n.rope || 1.5; e.held = true; if (e.blob) e.blob.visible = false; if (e.H && e.H.play) e.H.play(n.pose || 'perch', { loop: true }); } else if (n.pose) e.skill = n.pose; e.root.visible = npcShown(n); return e; }   /* pose: an elder who sits cross-legged by his fire */
      for (const n of core.M.npcs) npcEnt(n);   /* gear: what an NPC carries (the castle's watchmen hold bows) */
      /* monsters get a model while they are within MOB_NEAR tiles (seeded land wakes camps everywhere you have been) */
      const MOB_NEAR = 60, MOB_FAR = 90;
      const CHAIN_GEO = new THREE.TorusGeometry(0.11, 0.028, 5, 8), CHAIN_MAT = new THREE.MeshLambertMaterial({ color: 0x3a3e44 });
      function mobEnt(m) {
        const e = makeEnt('m:' + m.uid, MOD.monster((D.monsters[m.key] || {}).look || m.key), { kind: 'mob', uid: m.uid }); place(e, m.x, m.y); e.yaw = e.tyaw = faceYaw(m.face); e.max = D.monsters[m.key].hp; if (m.dead) { e.dead = true; e.root.visible = false; }
        if (D.monsters[m.key] && D.monsters[m.key].chain) {
          const links = [];
          for (let i = 0; i < 10; i++) { const lk = new THREE.Mesh(CHAIN_GEO, CHAIN_MAT); scene.add(lk); links.push(lk); }   /* one shared ring for every link: nothing to free when the beast goes out of sight */
          e.chain = { ax: m.sx + 0.5, az: m.sy + 0.5, links };
        }
        return e;
      }
      function syncMobEnts() {
        for (const m of core.S.mobs) {
          const d = Math.max(Math.abs(m.x - me.x), Math.abs(m.y - me.y)), e = ents.get('m:' + m.uid);
          const sameFloor = (m.lv | 0) === (me.lv | 0);
          if (!e && sameFloor && d <= MOB_NEAR) mobEnt(m); else if (e && (!sameFloor || d > MOB_FAR)) removeEnt(e);
        }
      }
      syncMobEnts();

      /* ---------- ground items */
      const gItems = new Map(), gFlames = [];
      /* a dropped torch is stuck in the ground, upright and burning, the same as the torches set about the world (the operator
         2026-10-07); the light pool (caveTick) lights round it */
      function standingTorch() {
        const t = new THREE.Group(), lm = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), lm(0x4a3220)); post.position.y = 0.6; t.add(post);
        const cup = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), lm(0x2a2a2a)); cup.position.y = 1.22; t.add(cup);
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 5), new THREE.MeshBasicMaterial({ color: 0xffa030 })); f.position.y = 1.42; t.add(f);
        const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 5), new THREE.MeshBasicMaterial({ color: 0xfff0a0 })); f2.position.y = 1.36; t.add(f2);
        t.userData.flame = { f, f2, ph: Math.random() * 10 }; gFlames.push(t.userData.flame);
        return t;
      }
      function syncGround() {
        const seen = new Set(), perTile = {};
        for (const g of core.S.ground) {
          if (g.sunk || (g.lv | 0) !== (me.lv | 0)) continue;   /* another floor is another room, even at the same x/y */
          seen.add(g.uid); const k = g.x + ',' + g.y, n = perTile[k] = (perTile[k] || 0) + 1;
          if (gItems.has(g.uid)) continue;
          const o = new THREE.Group(), m = g.id === 'torch' ? standingTorch() : MOD.item(g.id); if (g.id !== 'torch') m.scale.setScalar(1.0); o.add(m);
          const a = (g.uid * 2.39996) % (2 * PI), r = n > 1 ? 0.22 : 0;
          o.position.set(g.x + 0.5 + Math.cos(a) * r, 0, g.y + 0.5 + Math.sin(a) * r); o.position.y = heightAt(o.position.x, o.position.z) + (g.lv | 0) * 3.2 + 0.02; o.rotation.y = a;
          m.traverse(c => { if (c.isMesh) c.castShadow = true; });
          const px = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.75), proxyMat); px.position.y = 0.2; px.userData.pick = { kind: 'item', uid: g.uid, lv: g.lv | 0 }; o.add(px); proxies.push(px);
          o.userData.px = px; o.userData.born = performance.now(); scene.add(o); gItems.set(g.uid, o);
        }
        for (const [uid, o] of gItems) if (!seen.has(uid)) { const fl = o.children[0] && o.children[0].userData.flame; if (fl) gFlames.splice(gFlames.indexOf(fl), 1); scene.remove(o); proxies.splice(proxies.indexOf(o.userData.px), 1); gItems.delete(uid); }
      }

      /* your snares where you set them (core setTrap; 2026-10-09): only yours are drawn, a nagwaagan on the ground */
      const gTraps = new Map();
      function syncTraps() {
        const L = (me && me.traps) || [], seen = new Set();
        for (const t of L) {
          const k = t.x + ',' + t.y; seen.add(k); if (gTraps.has(k)) continue;
          const o = new THREE.Group(), m = MOD.item(t.id); o.add(m);
          o.position.set(t.x + 0.5, 0, t.y + 0.5); o.position.y = heightAt(o.position.x, o.position.z) + 0.02;
          m.traverse(c => { if (c.isMesh) c.castShadow = true; });
          const px = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.75), proxyMat); px.position.y = 0.2; px.userData.pick = { kind: 'trap', x: t.x, y: t.y }; o.add(px); proxies.push(px);
          o.userData.px = px; scene.add(o); gTraps.set(k, o);
        }
        for (const [k, o] of gTraps) if (!seen.has(k)) { scene.remove(o); proxies.splice(proxies.indexOf(o.userData.px), 1); gTraps.delete(k); }
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
      /* FLUID TRAVEL (2026-10-08: "make it so our path of travel is more fluid, no matter whether we are in a boat or walking or
         any other mode of conveyance"): the rules step tile to tile in eight directions; what is drawn glides after them - eased
         toward the stepped position, so every corner is a curve and the facing follows the curve. A jump (portal, a seam, a fall)
         snaps. Drawing only: the rules, the network and the camera's target tile are unchanged. */
      const GLIDE = 9;
      function smoothPos(e, dt, moving) {
        const P = e.root.position, sm = e.sm;
        if (!sm || Math.abs(sm.x - P.x) + Math.abs(sm.z - P.z) > 6) { e.sm = { x: P.x, z: P.z }; return; }
        const k = 1 - Math.exp(-Math.max(0, dt) * GLIDE * (e.canoe ? 0.8 : 1)), nx = sm.x + (P.x - sm.x) * k, nz = sm.z + (P.z - sm.z) * k, vx = nx - sm.x, vz = nz - sm.z;
        if (moving && vx * vx + vz * vz > 1e-6 && !e.held && !(e.boatRole === 2)) e.tyaw = Math.atan2(vx, vz);   /* face the way the curve goes */
        sm.x = nx; sm.z = nz; P.x = nx; P.z = nz;
      }
      function doTick(stepAt) {
        followTick();
        const evs = core.tick(), now = performance.now(), stamp = stepAt ? Math.min(stepAt, now) : now;
        /* positions */
        for (const pid of core.S.order) {
          const p = core.S.players[pid], e = ents.get('p:' + pid); if (!e) continue;
          if (e !== myEnt) e.root.visible = (p.lv | 0) === (me.lv | 0);
          if (p.dead) continue;
          const mv = moveTo(e, p.x, p.y, stamp);
          if (mv && !p.boat) e.tyaw = e.headYaw != null ? e.headYaw : Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); else e.tyaw = faceYaw(p.face);   /* a canoe faces its heading, even backing up */
          const sk = p.skilling, skAnim = sk === 'chop' ? 'chop' : sk === 'mine' ? 'mine' : sk === 'fish' ? 'fish' : sk === 'cook' || sk === 'light' ? 'cook' : null;
          const ric = e === myEnt ? ricingNow() : false; e.ricing = ric;
          const tl = p.boat === 1 ? (ric ? 'push_pole' : 'paddle') : p.boat === 2 ? (p.knocking ? 'ricing_sticks' : 'paddle') : skAnim === 'chop' || skAnim === 'mine' || skAnim === 'fish' ? p.toolId || null : null;   /* only a tool you really carry (2026-10-09: no pickaxe in the hand of someone who has none - flint is pried out by hand) */
          boatLook(e, p.boat === 1); e.boatRole = p.boat | 0; e.rideOf = p.boat === 2 ? p.ride : null; e.knocking = !!p.knocking;
          if (p.path && p.path.length && e.restPose) e.restPose = null;   /* up off the floor once you walk */
          if (e === myEnt) docksShow();   /* the landing's canoe is the one you are sitting in */
          if (skAnim !== e.skill || tl !== e.toolId) { e.skill = skAnim; e.toolId = tl; e.H.setTool && e.H.setTool(tl); }
        }
        for (const n of core.M.npcs) {
          const e = ents.get('n:' + n.id); if (!e) continue;
          e.root.visible = (me.lv | 0) === (n.lv | 0) && npcShown(n) && !(e.dead && e.deadT && now - e.deadT >= 2200);   /* a fallen guard, faded out (the frame loop below) */
          if (n.patrol || n.guard || n.watch || n.sapAt || n.sapDay) { if (moveTo(e, n.x, n.y, stamp)) e.tyaw = e.headYaw != null ? e.headYaw : Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); else if (n.wface != null) e.tyaw = faceYaw(n.wface); }   /* a watchman walking his round, a guard answering the call to arms, the village at the sugar bush; standing still at a job, they face the maple or the akik (core says which way) */
          if (n.sapDay) { const sk = n.work ? 'cook' : null; if (sk !== e.skill) e.skill = sk; }   /* hands at the work: the spile at a maple, a bucket tipped at the akik. Their buckets are not items, so nothing goes in them but the pose */
        }   /* hidden NPCs stay unseen until their flag */
        syncMobEnts();
        for (const m of core.S.mobs) {
          const e = ents.get('m:' + m.uid); if (!e || m.dead) continue;   /* (syncMobEnts runs right before) */
          e.root.visible = (m.lv | 0) === (me.lv | 0);
          const mv = moveTo(e, m.x, m.y, stamp);
          if (mv) e.tyaw = e.headYaw != null ? e.headYaw : Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z); else if (m.tgt) e.tyaw = faceYaw(m.face);
          e.hp = m.hp;
        }
        syncGround(); syncTraps();
        for (const ev of evs) { handle(ev, now); netEvent(ev); }
        if (TRIP) { TRIP.events(evs); TRIP.tick(); }
        netAct();
        if (dirty.inv || dirty.eq) { hud.refresh('all'); dirty = {}; } else hud.refresh('orbs');
        if (hud.tab === 'skills' || hud.tab === 'quest') hud.refresh(hud.tab);
        roofCheck(); showWeather();
        /* SAVE OFTEN (2026-10-08: iOS closed the game for memory in the Spider Cave and the reload put the operator back at its mouth, in
           older gear): a crash never says goodbye, so this device's copy is kept every 10 ticks (6 s), and the moments that matter -
           gear changed, a teleport or a portal, into or out of an area - go to the Bank at once as well */
        { const pl = core.S.players[PID], zn = pl ? core.zoneOf(pl.x, pl.y) : null, big = evs.some(ev => ev.p === PID && (ev.e === 'equip' || ev.e === 'teleport' || ev.e === 'portal' || ev.e === 'cross' || ev.e === 'chest' || ev.e === 'boat')) || zn !== SAVEZ.zone;
          SAVEZ.zone = zn;
          if (big && performance.now() - SAVEZ.t > 3000) { SAVEZ.t = performance.now(); persist(true); }
          else if (core.S.t % 10 === 0) persist(); }
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
          case 'tell': {
            const te = ents.get('m:' + e.mob);
            if (te && !te.dead) {
              const name = e.mode === 'magic' ? 'breath' : 'rear';
              te.oneShot = true; te.lastOne = name; te.oneT = performance.now(); te.tellUntil = performance.now() + 2600; te.loco = name;
              te.H.play(name, { loop: true }); if (te.H.tell) te.H.tell(e.mode);
            }
            if (e.dst === PID) hud.chat(e.mode === 'magic' ? 'The chained dragon draws a long breath. Blue fire gathers in its jaws.' : 'The chained dragon rears, the chain clinking, and swings its head to bite.', 'warn');
            break;
          }
          case 'attack': {
            if (e.cls === 'hawk') { const he = entOf(e.src); if (he && he.hawk) he.dive = performance.now(); }   /* the hawk dives to strike */
            const src = entOf(e.src), dst = entOf(e.dst); if (!src) break;
            if (src.H && src.H.tell) { src.H.tell(null); src.tellUntil = 0; }
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
          case 'trialshot': {
            const tgt = entOf(e.p); if (!tgt) break;
            const kind = e.cls === 'ranged' ? 'arrow' : e.cls === 'magic' ? 'spell' : 'rock';
            const obj = kind === 'arrow' ? MOD.projectile('arrow', 2) : kind === 'spell' ? MOD.projectile('spell', '#58a8ff') : new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: 0x77736a, flatShading: true }));
            const tx = e.x + 0.5, tz = e.y + 0.5, dx = tx < -54 ? -4 : tx > -54 ? 4 : 0, dz = tz < -99 ? -4 : tz > -99 ? 4 : 0;
            const from = new THREE.Vector3(tx + dx, tgt.root.position.y + 1.15, tz + dz); obj.position.copy(from); obj.userData.isProjectile = true; scene.add(obj);
            projs.push({ obj, from, tgt, t: 0, dur: 0.42, hit: null, src: null, dst: e.p, kind: e.cls, arrived: false });
            sfx(e.cls === 'ranged' ? 'bow' : e.cls === 'magic' ? 'cast' : 'swing');
            break;
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
          case 'sit': if (mine) chessEnter(e.t); break;
          case 'stand': if (mine) chessLeave(e.t); break;
          case 'chess': {   /* a table changed: lay the pieces out for everyone near, tell the seated player's board, and (as host) tell the room */
            if (SCENE.chessApply) SCENE.chessApply(e.t, e.fen, e.move || null);
            if (me.seat && me.seat.t === e.t) { if (e.move) sfx('click'); if (e.move) CHESS_SEL = null; markBoard(e.t); if (hud.chessUpdate) hud.chessUpdate(chessView(e.t)); }   /* [Claude] the opponent's pick lights here too */
            const T = core.tableById(e.t); if (T && iHostAt(T.x, T.y)) netSendBig({ Ch: [netRow(core.chessRow(e.t))] });
            break;
          }
          case 'xsit': netSend({ CS: [e.t, e.s | 0, e.stake | 0] }); break;   /* [Claude] the stake the first sitter sets rides along */
          case 'xstand': netSend({ CT: [e.t] }); break;
          case 'xcmove': netSend({ CM: [e.t, e.from, e.to, e.promo || 0] }); break;
          case 'xcsel': netSend({ CX: [e.t, e.sq || ''] }); break;   /* [Claude] a replica's pick, asked of the host */
          /* THE POKER TABLE (handoff/poker_plan.md): psit/pstand is "you are (no longer) in a chair at the felt", said
             the same way whether the table seated you or a host's row did; poker is the felt changing - cards, chips,
             the button, whose turn. The row itself carries everything the page draws. */
          case 'fein': case 'feback': if (FE) FE.event(e); break;   /* [Claude 2026-10-16] a Fortune Engine's GOLD in and back */
          case 'psit': if (mine) pokerEnter(e.t); break;
          case 'pstand': if (mine) pokerLeave(e.t); break;
          case 'pkbuy': case 'pkout': case 'pkcash': if (Array.isArray(G.__pkEv)) G.__pkEv.push(Object.assign({}, e));   /* a test watches these */
            ENGBANK.pkEvent(e, pid => pid === PID ? (walletState.address || null) : (((remotes.get(pid) || {}).from || {}).address || PK_ADDR.get(pid) || null)); break;   /* [Claude 2026-10-14] the card table's GOLD through @ashvale */
          case 'poker': {
            if (SCENE.pokerShow) SCENE.pokerShow(e.t, pokerModel(e.t));
            pokerChat(e.t);
            if (me.seat && me.seat.t === e.t && me.seat.k === 'pk') { pokerFx(e.t, e); if (hud.pokerUpdate) hud.pokerUpdate(pokerView(e.t)); }
            const T = core.pokerTableById(e.t); if (T && iDeal(T)) pkSendRow(e.t);   /* [Claude 2026-10-13] a delta when it pays */
            break;
          }
          case 'xpsit': netSend({ PS: [e.t, e.s | 0, e.stake | 0, e.pk || ''] }, tRoom(e.t)); break;   /* [Claude] the buy-in the first sitter sets rides along */
          case 'xpstand': netSend({ PT: [e.t] }, tRoom(e.t)); break;
          case 'xpact': netSend({ PA: [e.t, e.a, e.to | 0] }, tRoom(e.t)); break;
          case 'respawn': { const t = ents.get('p:' + e.p); if (!t) break; t.dead = false; t.oneShot = false; t.loco = null; t.H.setOpacity && t.H.setOpacity(1); t.root.visible = true; const p = core.S.players[e.p]; place(t, p.x, p.y); t.H.play('idle', { loop: true }); if (e.p === PID) { hud.death(false); cam.snap = true; arriveCheck(); } break; }
          case 'gone': { const t = ents.get('m:' + e.mob); if (t) { t.dead = true; t.deadT = now - 5000; t.oneShot = true; t.root.visible = false; } break; }   /* the host says it is dead: hide it at once (2026-10-02: frozen monsters after re-entering a zone) */
          case 'spawn': { const m = core.mobByUid(e.mob), t = ents.get('m:' + e.mob); if (!t) break; t.dead = false; t.oneShot = false; t.loco = null; t.root.visible = true; t.H.setOpacity && t.H.setOpacity(1); place(t, m.x, m.y); t.H.play('idle', { loop: true }); t.spawnT = now; t.hp = m.hp; break; }
          case 'guard': { const t = ents.get('n:' + e.id); if (!t) break; if (e.up) { t.dead = false; t.deadT = 0; t.oneShot = false; t.root.visible = true; t.H.setOpacity && t.H.setOpacity(1); t.H.play('idle', { loop: true }); } else { t.dead = true; t.deadT = now; t.oneShot = true; t.H.play('death', { loop: false }); sfx('mobdie', t); } break; }   /* a fallen guard fades like a monster's corpse and comes back at his post */
          case 'msg': if (mine) hud.chat(e.text, e.kind); break;
          case 'xp': if (mine) hud.xpDrop(e.skill, e.n); break;
          case 'level': if (mine) { hud.levelUp(e.skill, e.lvl); sfx('level'); burst(myEnt.root.position, 0xffd040); netGear(); } break;   /* others see the new total level */
          case 'equip': { const t = ents.get('p:' + e.p); if (t) { const g = gearOf(core.S.players[e.p]); t.H.setGear(g); hawkify(t, g.ring); } if (mine) { dirty.eq = 1; sfx('equip'); netGear(); } break; }
          case 'quest': if (mine) syncMounts();   /* falls through */
          case 'using':
          case 'inv': case 'take': case 'trade': case 'eat': case 'style': case 'run': case 'burden': case 'start':
            if (mine) { dirty.inv = 1; if (e.e === 'take') sfx(e.id === 'coins' ? 'coins' : 'pickup'); if (e.e === 'eat') { sfx('eat'); playOnce(myEnt, 'eat'); } if (e.e === 'take') playOnce(myEnt, 'pickup', 1.6); }
            break;
          case 'shop': if (mine) { hud.openShop(e.shop); faceNpc(e.npc); } break;
          case 'portal': if (mine) {   /* the towns you have touched a portal in (2026-10-04) */
            const L = (e.to || []).map(P => ({ html: 'Travel to <span class="y">' + P.name + '</span>', fn: () => { send({ c: 'portal', to: P.id }); const T = (D.rules.portals || []).find(q => q.id === P.id); travelSoon(null, P.name, T && T.to[0], T && T.to[1], true); } }));
            if (!L.length) hud.chat('Touch the town portal in another town, and you can travel there from here.', 'sys');
            else { const r = host.getBoundingClientRect(); hud.menu(r.width / 2, r.height / 2, L); }
            if ((e.unknown || []).length) hud.chat('Not yet attuned: ' + e.unknown.join(', ') + '.', 'sys');
          } break;
          case 'angels': { const t = ents.get('p:' + e.p); if (t) { angelFlare(t.root.position); if (t.H && t.H.play) t.H.play('cast', { loop: false }); } if (mine) sfx('level'); break; }
          case 'teleport': if (mine) {
            if (e.to !== 'gate') {   /* the screen goes up FIRST and gets painted; the heavy part (building the cave, the wigwam or the land) follows behind it */
              const uz = core.M.underAt && core.M.underAt(e.x, e.y), zi2 = (uz && ZINDEX && ZINDEX.find(z => z.id === uz)) || zoneAtIndex(e.x, e.y);
              travelScreen(PASSK[e.to] || null, zi2 ? zi2.name : PASSK[e.to] === 'down' ? 'cave' : '', false);
              CAVE.hold = true; TRAVEL.hold = true; requestAnimationFrame(() => setTimeout(() => { CAVE.hold = false; place(myEnt, e.x, e.y); cam.snap = true; streamRegions(true); sfx('equip'); arriveCheck(); TRAVEL.warm = true; let k = 0; const settle = () => { if (++k < 3) requestAnimationFrame(settle); else TRAVEL.hold = false; }; requestAnimationFrame(settle); }, 30));   /* and it stays until the new place has been built and drawn a few frames (the first draw compiles its materials) */
            } else { place(myEnt, e.x, e.y); cam.snap = true; streamRegions(); sfx('equip'); arriveCheck(); }
          } break;
          case 'zoneadd': zoneArrived(e, now); break;
          case 'boatland': boatShow(e.x, e.y, e.face); docksShow(); if (e.by === PID) { boatTell({ t: 'boat', v: 1, x: e.x, y: e.y, face: e.face, on: 0 }); } break;
          case 'cross': if (e.p === PID) { place(myEnt, e.x, e.y); cam.yaw += e.turn || 0; cam.tyaw += e.turn || 0; cam.snap = true; streamRegions(); TN.key = ''; } break;   /* over a cut edge of the net: the same ground, new map coordinates, the view turned with them */
          case 'boatgone': boatHide(e.x, e.y); docksShow(); if (e.by === PID) boatTell({ t: 'boat', v: 1, x: e.x, y: e.y, on: 1 }); break;
          case 'chest': if (mine) { const c = ents.get('n:' + e.npc); if (c) c.H.play('open');
            /* [Claude 2026-10-14] whose chest this is: the home whose spawn is nearest (within 3 km; otherwise Ashvale's) - one chest per home */
            const nn = core.M.npcs.find(q => q.id === e.npc), HS = D.rules.homes || {}; let ch = 'ashvale', bd = 3000;
            if (nn) for (const h in HS) { const sp = HS[h] && HS[h].spawn; if (Array.isArray(sp)) { const d = Math.max(Math.abs(sp[0] - nn.x), Math.abs(sp[1] - nn.y)); if (d < bd) { bd = d; ch = h; } } }
            ENGBANK.setChestHome(ch); hud.openChest(); holdsAsk(); } break;   /* the town chest */
          case 'shopclose': if (mine) hud.closeShop(); break;
          case 'mobjump': { const t = ents.get('m:' + e.mob); if (t) { place(t, e.x, e.y); if (t.path) t.path = null; } break; }   /* came through a cave opening */
          case 'poison': if (mine) { hud.setPoison && hud.setPoison(e.on); if (e.on) sfx('miss'); } break;   /* the green Hitpoints orb (2026-10-07) */
          case 'mobeat': { const t = ents.get('m:' + e.mob); if (t && !t.dead) { playOnce(t, 'eat'); sfx('eat', t); } break; }
          case 'tailor': if (mine) { faceNpc(e.npc); openWardrobe(false, (NPCN[e.npc] || {}).name); } break;
          case 'look': if (mine) { if (me.look && myEnt.H.setOutfit) myEnt.H.setOutfit(me.look); netGear(); } break;
          case 'dialog': if (mine) {
            const n = e.npc && NPCN[e.npc];
            const after = (n && n.vanish) || e.axe ? () => {
              if (n && n.vanish) {
                if (n.goneFlag) { me.flags = me.flags || {}; if (!me.flags[n.goneFlag]) me.flags[n.goneFlag] = (core.S && core.S.t) || 1; }
                const t = ents.get('n:' + n.id); if (t) t.root.visible = false;
              }
              if (e.axe) hud.confirm('An axe', 'Vael asks if you need an axe. Take the bronze hatchet?', 'Take it', 'I have one', () => send({ c: 'takeaxe' }));
            } : null;
            const choices = (e.offer || e.recall) ? [
              { id: 'yes', label: e.warn ? 'I understand. Call them.' : 'Yes. I will do it.' },
              { id: 'no', label: 'Not now.' }
            ] : e.make ? e.make.map(m => ({ id: 'make' + m.i, label: m.label })).concat([{ id: 'no', label: 'Nothing for now.' }]) : null;   /* which thing to make (core orderCraft) */
            hud.dialog(e.name, e.lines, (pick) => {
              if (pick === 'no' || pick === 'dismiss') return;
              if (typeof pick === 'string' && pick.indexOf('make') === 0) { send({ c: 'craft', npc: e.npc, i: +pick.slice(4) }); return; }
              if (pick === 'yes') send({ c: 'acceptq', q: e.offer || e.recall, recall: e.recall ? 1 : 0, replay: e.replay ? 1 : 0 });
              if (after) after();
            }, choices);
            faceNpc(e.npc); sfx(e.unlock ? 'unlock' : 'click');
            if (n && n.pose) myEnt.restPose = n.pose;   /* sit down with him the same way (2026-10-07) */
          } break;
          case 'unhide': { const t = ents.get('n:' + e.npc); if (t) t.root.visible = true; break; }
          case 'weather': if (e.zone === core.weatherZone(zoneHere()) && !(TL.n > 1 || DEMO)) { const k = seasonal({ kind: e.kind }).kind, say = k === e.kind ? e.say : (((D.rules || {}).weather || {}).say || {})[k] || e.say; if (say && k + ':' + e.intensity !== wxShown) hud.chat(say, 'sys'); showWeather(); } break;
          case 'fire': addFire(e.fire, e.x, e.y); if (e.p === PID || !e.p) sfx('sizzle', e.p === PID ? null : { x: e.x, y: e.y }); break;
          case 'fireout': removeFire(e.fire); break;
          case 'fx': { const t = ents.get('m:' + e.mob); if (!t) break; t.fx = t.fx || {}; t.fx[e.fx] = 1; applyTint(t); const el = hud.fxSplat(e.fx); if (el) t.splats.push({ el, t: performance.now(), k: t.splats.length }); if (e.fx === 'freeze') sfx('freeze', t); break; }
          case 'fxend': { const t = ents.get('m:' + e.mob); if (!t || !t.fx) break; delete t.fx[e.fx]; applyTint(t); break; }
          case 'score': if (e.p === PID || (e.key === 'chain_dragon' && hosted.has('dragonkeep'))) scoreTell(e); break;   /* the Bank keeps the board: one game tells it per kill - the page that owns the player who did it, or the keep's host - and its answer repaints the sign */
          case 'mark': if (e.p === PID) markTell(e); break;   /* a maple tapped or a birch peeled: the Bank keeps it for everyone */
          case 'deplete': {
            for (const r of regions) if (r.built) r.built.setDepleted(e.node, true);
            let x = e.x, y = e.y;
            if (x == null && e.node != null && core.M.kx) { x = core.M.kx(e.node); y = core.M.ky(e.node); }
            if (x != null) removeGrown(x, y);
            const nd = e.node != null && core.nodeAt(e.node);
            if (nd && core.nodeDef(nd).skill === 'woodcutting') addStump(nd.x, nd.y);
            if (e.forever && mine) fellTell(x, y);
            break;
          }
          case 'regrow': {
            for (const r of regions) if (r.built) r.built.setDepleted(e.node, false);
            if (e.x != null) removeStump(e.x, e.y);
            else if (e.node != null && core.M.kx) removeStump(core.M.kx(e.node), core.M.ky(e.node));
            break;
          }
          case 'clear': removeStump(e.x, e.y); addGrass(e.x, e.y); break;
          case 'plant': addSprout(e.x, e.y, e.tree); break;
          case 'unplant': removeSprout(e.x, e.y); break;
          case 'grow': removeGrass(e.x, e.y); addGrown(e.x, e.y, e.tree); break;
          case 'gather': if (mine && e.ok && e.item) dirty.inv = 1; if (mine && e.ok && !e.item) dirty.inv = 1; break;
          case 'drop': break;
          case 'pfx': { const t = ents.get('p:' + e.p); if (t && e.on) { const el = hud.fxSplat(e.fx); if (el) t.splats.push({ el, t: performance.now(), k: t.splats.length }); } if (mine && e.on) sfx('freeze'); break; }
          case 'pray': if (mine) { lastPosKey = ''; hud.refresh('prayer'); if (e.altar) { sfx('altar'); playOnce(myEnt, 'cast'); burst(myEnt.root.position, 0x8fd8ff); } else sfx(e.on ? 'pray' : 'prayoff'); } break;
          case 'knock': if (mine) { dirty.inv = 1; sfx('splash', myEnt); } break;   /* a handful of manoomin into the canoe */
          case 'bury': if (mine) { dirty.inv = 1; sfx('bury'); playOnce(myEnt, 'pickup', 1.6); } break;
        }
      }
      /* ---------- UNDERGROUND (2026-10-07: the Spider Cave, "dim with torches"): while you stand in an area flagged
         `under` the sky goes black, the fog closes in to ~13 tiles, the daylight dims to a cave's, a warm light goes with
         you and the three torches nearest you really light the rock (a small pool of point lights, moved every second). */
      /* GLOW: a soft pool of light on the ground under each lamp, torch and fire beyond the few real lights - one instanced
         draw, so a whole lit road shows from far off at night without the cost of a light each (2026-10-07) */
      const GLOW = { mesh: null, max: 96 };
      function glowAt(list) {
        if (!GLOW.mesh) {
          const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
          g.addColorStop(0, 'rgba(255,255,255,0.38)'); g.addColorStop(0.35, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
          const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
          GLOW.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }), GLOW.max);
          GLOW.mesh.frustumCulled = false; GLOW.mesh.renderOrder = 2; scene.add(GLOW.mesh); GLOW.m = new THREE.Matrix4(); GLOW.c = new THREE.Color();
        }
        const n = Math.min(list.length, GLOW.max);
        for (let k = 0; k < n; k++) {
          const o = list[k], sz = o[4] ? 13 : 10, x = o[0] + 0.5, z = o[1] + 0.5;
          GLOW.m.makeScale(sz, 1, sz).setPosition(x, heightAt(x, z) + 0.08 + (o[5] || 0), z); GLOW.mesh.setMatrixAt(k, GLOW.m); GLOW.mesh.setColorAt(k, GLOW.c.setHex(o[3]));
        }
        GLOW.mesh.count = n; GLOW.mesh.instanceMatrix.needsUpdate = true; if (GLOW.mesh.instanceColor) GLOW.mesh.instanceColor.needsUpdate = true;
      }
      const CAVE = { on: false, t: 0, me: null, pool: [], keep: null };
      /* A FIXED NUMBER OF LIGHTS. three.js builds every material's shader for the number of lights in the scene; one light more
         or fewer and every material in sight is compiled again (52 programs - that was most of the wait going into the cave or
         a wigwam, and a stall each time a town's area loaded). So the lights are all there from the start and are only ever
         dimmed (intensity 0), never added, removed or hidden; the towns' own plaza lights come and go with their areas, and a
         pad of dark spare lights makes up the difference (lightBudget). */
      for (let k = 0; k < (isPhone ? 4 : 6); k++) { const L = new THREE.PointLight(0xff9a3c, 0, 10, 1.2); scene.add(L); CAVE.pool.push(L); }
      const LBUD = { n: 8, pad: [], key: -1 };
      for (let k = 0; k < LBUD.n; k++) { const L = new THREE.PointLight(0xffa050, 0, 1, 2); L.position.set(0, -500, 0); scene.add(L); LBUD.pad.push(L); }
      function lightBudget() {
        let n = 0, sum = 0;
        for (const r of regions) { const b = r.built; if (!b) continue; if (b._pl == null) { b._pl = []; b.group.traverse(o => { if (o.isPointLight) b._pl.push(o); }); } sum += b._pl.length; }
        if (sum === LBUD.key) return; LBUD.key = sum;
        for (const r of regions) { const b = r.built; if (!b) continue; for (const L of b._pl) { L.visible = n < LBUD.n; if (L.visible) n++; } }
        LBUD.pad.forEach((L, k) => { L.visible = k < LBUD.n - n; });
      }
      function caveTick(now) {
        const inCave = (me.lv | 0) < 0 || !!(core.M && core.M.underAt && core.M.underAt(me.x, me.y) != null);
        const fullDungeon = (me.lv | 0) < 0 && (core.M.objects || []).some(o => o.k === 'dungeonroom' && (o.lv | 0) === (me.lv | 0) && me.x >= o.x && me.y >= o.y && me.x < o.x + (o.w || 8) && me.y < o.y + (o.h || 8));
        if (inCave !== CAVE.on) {
          CAVE.on = inCave;
          if (inCave) {
            CAVE.keep = { bg: scene.background.getHex(), fc: scene.fog.color.getHex(), fn: scene.fog.near, ff: scene.fog.far, hemi: hemi.intensity, sun: sun.intensity };
            if (wxMod && wxMod.set) try { wxMod.set('clear', 0, { instant: true }); } catch (e) { /* weather module */ }
            scene.background.setHex(0x030303); scene.fog.color.setHex(0x030303); scene.fog.near = fullDungeon ? 28 : 5; scene.fog.far = fullDungeon ? 44 : 16; hemi.intensity = 0.14; sun.intensity = 0.04;
            /* no light of your own (2026-10-07: "The player should not give off any light. The only light should be coming from the torches") */
          } else {
            const K = CAVE.keep || {}; scene.background.setHex(K.bg != null ? K.bg : SKY); scene.fog.color.setHex(K.fc != null ? K.fc : SKY); scene.fog.near = K.fn || 24; scene.fog.far = K.ff || 52;
            hemi.intensity = K.hemi || 1.7; sun.intensity = K.sun || 2.3; for (const L of CAVE.pool) L.intensity = 0;
            wxShown = ''; showWeather(true);
          }
        }
        if (inCave) { scene.fog.near = fullDungeon ? 28 : 5; scene.fog.far = fullDungeon ? 44 : 16; }
        /* the nearest torches, ranges and campfires really light their surroundings - underground always, up top while
           it is dark (a moonless night has no other light: 2026-10-07) */
        const darkUp = !inCave && SUNL.dark > 0.3;
        if (GLOW.mesh) { GLOW.mesh.visible = inCave || darkUp; GLOW.mesh.material.opacity = inCave ? 1 : Math.min(1, Math.max(0, (SUNL.dark - 0.3) / 0.4)); }
        if ((!inCave && !darkUp) || !CAVE.pool.length) { if (!inCave) for (const L of CAVE.pool) L.intensity = 0; return; }
        if (now - CAVE.t > 1000) {
          CAVE.t = now;
          /* [x, y, height of the flame, colour, steady]: torches, the cave's wall torches, gas street lamps (in towns and along the
             trails between them, sadfrog 2026-10-07), ranges, campfires, and torches dropped on the ground (2026-10-07) */
          /* every light out to the edge of what you can see (2026-10-07: "The light from the illumination should load
             farther out"): the nearest few are real lights, every one of them gets a pool of light on the ground (GLOW) */
          const R = inCave ? 24 : Math.min(viewR(), 90), LT = { torch: 1.6, sconce: 1.5, lamp: 2.6, range: 0.9, campfire: 0.9 }, near = [], add = o => { if ((o.lv | 0) !== (me.lv | 0) || !LT[o.k] || Math.abs(o.x - me.x) >= R || Math.abs(o.y - me.y) >= R) return; if (core.lampLit && !core.lampLit(o.x, o.y)) return; if (o.litIn && core.fireLit && !core.fireLit(o.x, o.y)) return;   /* a fire that lights only in one season (zone data `litIn`): out of it, the ring is cold, and cold stones light nothing */ near.push([o.x, o.y, LT[o.k], o.k === 'lamp' ? 0xffd27a : 0xff9a3c, o.k === 'lamp']); };
          for (const o of core.M.objects || []) {
            if (o.k !== 'dungeonroom' || (o.lv | 0) !== (me.lv | 0)) { add(o); continue; }
            const w = o.w || 8, h = o.h || 8, lv = o.lv | 0;
            const lamps = [[1, 1], [w / 2, 1], [w - 1, 1], [w - 1, h / 2], [w - 1, h - 1], [w / 2, h - 1], [1, h - 1], [1, h / 2]];
            for (const a of lamps) {
              const lx = o.x + a[0], ly = o.y + a[1];
              if (Math.abs(lx - me.x) < R && Math.abs(ly - me.y) < R) near.push([lx, ly, 1.55 + lv * 3.2, lv === -4 ? 0xb06cff : 0xff9a3c, false, lv * 3.2]);
            }
          }
          if (!inCave && core.M.roadTorchesIn) for (const o of core.M.roadTorchesIn(me.x - R, me.y - R, me.x + R, me.y + R)) add(o);
          for (const f of fires.values()) { const q = f.position; if (Math.abs(q.x - me.x) < R && Math.abs(q.z - me.y) < R) near.push([q.x - 0.5, q.z - 0.5, 0.8, 0xff9a3c]); }
          for (const g of core.S.ground) if (g.id === 'torch' && Math.abs(g.x - me.x) < R && Math.abs(g.y - me.y) < R) near.push([g.x, g.y, 1.6, 0xff9a3c]);
          near.sort((a, b) => Math.hypot(a[0] - me.x, a[1] - me.y) - Math.hypot(b[0] - me.x, b[1] - me.y));
          /* no hard swap between far and near (2026-10-07, via the Arcade session: the light "visibly changes as you
             approach"): every light keeps its ground pool at any distance, and the few real lights stay on the same source while
             it is among the nearest, easing in from 24 tiles to full at 12 and easing out when handed on - never popping */
          glowAt(near);
          const want = new Map(near.slice(0, CAVE.pool.length).map(o => [o[0] + ',' + o[1], o]));
          for (const L of CAVE.pool) { const u = L.userData; if (!u.key) continue; if (want.has(u.key)) { want.delete(u.key); u.out = false; } else u.out = true; }   /* kept, or easing out */
          for (const [key, o] of want) {
            const L = CAVE.pool.find(L => !L.userData.key) || CAVE.pool.find(L => L.userData.out && L.intensity < 0.05); if (!L) break;
            Object.assign(L.userData, { key, out: false, steady: !!o[4], x: o[0] + 0.5, y: o[1] + 0.5 }); L.intensity = 0; L.visible = true;
            L.position.set(o[0] + 0.5, heightAt(o[0] + 0.5, o[1] + 0.5) + o[2], o[1] + 0.5); L.color.setHex(o[3]); L.distance = o[4] ? 12 : 10;
          }
        }
        const RN = 12, RF = 24, ease = 0.08;
        for (const L of CAVE.pool) {
          const u = L.userData; if (!u.key) { L.intensity = 0; continue; }
          const d = Math.hypot(u.x - me.x - 0.5, u.y - me.y - 0.5), near1 = u.out ? 0 : Math.min(1, Math.max(0, (RF - d) / (RF - RN)));
          const base = (u.steady ? 2.6 : 2.4 + Math.sin(now * 0.013 + L.position.x) * 0.25 + Math.sin(now * 0.031 + L.position.z) * 0.15) * near1;   /* flames flicker, gas burns steady */
          L.intensity += (base - L.intensity) * ease;
          if (u.out && L.intensity < 0.05) { u.key = null; u.out = false; L.intensity = 0; }
        }
      }
      /* THE SKY lives in its own module (src/engsky.js, 2026-10-08): what it needs goes in, what the engine uses comes back */
      /* THE SOUNDTRACK (src/engmusic.js, 2026-10-18): area tracks that unlock as you travel, and the Music tab */
      const MUSIC = deps.engmusic ? deps.engmusic.install({ DATA, core, store, hud: () => hud }) : null;
      const ENGSKY = deps.engsky.install({ THREE, DATA, PI, SCENE, CAVE, D, PID, SKY, camera, core, coreCall, hemi, hud, isPhone, me, myEnt, q, say, scene, send, showWeather, sun, zoneHere,
        pineSnow, get cam() { return cam; }, get wxMod() { return wxMod; }, get wxShown() { return wxShown; }, set wxShown(v) { wxShown = v; } });
      const { DAY_S, DEMO, NS, SEASON, SEASONS, SKYM, SKYV, STARS, SUNL, SUN_EPOCH, TL, dayTick, underSeason, dot3, moonAt, skyNow, sunAt, sunTime } = ENGSKY;
      /* ---------- HAND TORCHES (2026-10-07: "a torch ... hold it at night and illuminate his surroundings"): whoever holds
         one (the off hand) carries a warm flickering light of its Light radius - you, and up to three players near you */
      const TORCH = { me: new THREE.PointLight(0xffa040, 0, 8, 1.3), pool: [] };   /* made now, not on first use: see A FIXED NUMBER OF LIGHTS */
      scene.add(TORCH.me); for (let k = 0; k < 3; k++) { const L = new THREE.PointLight(0xffa040, 0, 8, 1.3); scene.add(L); TORCH.pool.push(L); }
      /* any item worn or held with a Light value lights round you - a torch, a glowing helmet, the Spider Queen's Crown (the operator
         2026-10-07: "Or other illuminating items ... the spider queen's crown should be illuminating"); the brightest counts */
      const LIGHTC = { torch: 0xffa040 }, lightOf = ids => { let best = 0, col = 0xffa040; for (const id of ids) { const d = id && core.item(id); if (d && d.light > best) { best = d.light; col = d.id === 'hat_spidercrown' ? 0xc89aff : LIGHTC[d.id] || 0xffc070; } } return [best, col]; };
      function torchTick(now) {
        if (!TORCH.me) { TORCH.me = new THREE.PointLight(0xffa040, 0, 8, 1.3); scene.add(TORCH.me); for (let k = 0; k < 3; k++) { const L = new THREE.PointLight(0xffa040, 0, 8, 1.3); scene.add(L); TORCH.pool.push(L); } }
        const flick = 1 + Math.sin(now * 0.017) * 0.08 + Math.sin(now * 0.041) * 0.05;
        const [r0, c0] = lightOf(Object.values(me.eq || {}).map(s => s && s.id)), P0 = myEnt.root.position;
        TORCH.me.intensity = r0 ? 2.8 * flick : 0; if (r0) { TORCH.me.distance = r0 + 1; TORCH.me.color.setHex(c0); TORCH.me.position.set(P0.x - 0.3, P0.y + 1.7, P0.z); }
        const near = []; for (const r of remotes.values()) { const g = r.e && r.e.H && r.e.H.gear; if (!g || (r.lvR | 0) !== (me.lv | 0)) continue; const [rr, cc] = lightOf(Object.values(g)); if (rr) near.push([r, rr, Math.hypot(r.e.root.position.x - P0.x, r.e.root.position.z - P0.z), cc]); }
        near.sort((a, b) => a[2] - b[2]);
        TORCH.pool.forEach((L, k) => { const n = near[k]; if (!n || n[2] > 30) { L.intensity = 0; return; } const q = n[0].e.root.position; L.position.set(q.x - 0.3, q.y + 1.7, q.z); L.distance = n[1] + 1; L.color.setHex(n[3]); L.intensity = 2.8 * flick; });
      }
      /* ---------- weather visuals: the weather module (src/weather.js, its own inscription) when it is loaded, else scene fog */
      let wxShown = '', wxMod = null;
      try { const W = G.ASH3D && G.ASH3D.get && G.ASH3D.get('weather'); if (W && W.createWeather) wxMod = W.createWeather(THREE, { scene, camera, quality: isPhone ? 'low' : 'high' }); } catch (er) { console.warn('weather module', er && er.message); }
      /* what falls where you stand keeps your season, whatever the region's roll was (a region can span latitudes): in a
         snowy winter rain and fog come down as snow; anywhere else snow comes down as rain */
      function seasonal(w) {
        if (TL.n > 1 || DEMO) return { kind: 'clear', intensity: 0 };   /* no weather in a time-lapse or a showing (2026-10-07) */
        if (SEASON.snowy == null || !w) return w;
        if (SEASON.snowy && (w.kind === 'rain' || w.kind === 'fog')) return Object.assign({}, w, { kind: 'snow' });
        if (!SEASON.snowy && w.kind === 'snow') return Object.assign({}, w, { kind: 'rain' });
        return w;
      }
      const WXLOOK = { clear: [SKY, 24, 52], fog: [0xb8bec4, 3, 16], rain: [0x7d8fa0, 14, 38], snow: [0xdfe6ec, 10, 30] };
      function showWeather(instant) {
        if (CAVE.on) return;   /* underground there is no weather (caveTick puts it back on the way out) */
        const w = seasonal(core.weatherOf(zoneHere()) || { kind: 'clear', intensity: 0 }), key = w.kind + ':' + w.intensity; if (key === wxShown) return; wxShown = key;
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
      const grassTiles = new Map();
      function addGrass(x, y) {
        const k = x + ',' + y; if (grassTiles.has(k)) return;
        const gy = heightAt(x + 0.5, y + 0.5);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.06, 0.98), new THREE.MeshLambertMaterial({ color: 0x5f9e3f }));
        m.position.set(x + 0.5, gy + 0.03, y + 0.5); m.receiveShadow = true; scene.add(m); grassTiles.set(k, m);
      }
      function removeGrass(x, y) {
        const k = x + ',' + y, m = grassTiles.get(k); if (!m) return;
        scene.remove(m); grassTiles.delete(k);
      }
      const felledStumps = new Map();
      function addStump(x, y) {
        const k = x + ',' + y; if (felledStumps.has(k)) return;
        const g = new THREE.Group(), gy = heightAt(x + 0.5, y + 0.5);
        const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.46, 8), new THREE.MeshLambertMaterial({ color: 0x7a5a36, flatShading: true }));
        wood.position.y = 0.22; wood.castShadow = true; g.add(wood);
        const px = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 8), proxyMat); px.position.y = 0.4; px.userData.pick = { kind: 'stump', x, y }; g.add(px); g.userData.px = px; proxies.push(px);
        g.position.set(x + 0.5, gy, y + 0.5); scene.add(g); felledStumps.set(k, g);
      }
      function removeStump(x, y) {
        const k = x + ',' + y, g = felledStumps.get(k); if (!g) return;
        scene.remove(g); const i = proxies.indexOf(g.userData.px); if (i >= 0) proxies.splice(i, 1); felledStumps.delete(k);
      }
      const sprouts = new Map();
      /* the same pine as the woods (scene.js kind P): a slim trunk and three cones of needles */
      const PINE_TRUNK = new THREE.CylinderGeometry(0.07, 0.11, 0.8, 6); PINE_TRUNK.translate(0, 0.4, 0);
      const PINE_CROWN = [ [0.62, 0.95, 0.95], [0.48, 0.8, 1.45], [0.3, 0.6, 1.9] ].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y, 0); return g; });
      const PINE_BARK = new THREE.MeshLambertMaterial({ color: 0x5a3c22, flatShading: true });
      const PINE_NEEDLE = new THREE.MeshLambertMaterial({ color: 0x2f6a3a, flatShading: true });
      const PINE_GROWN = new THREE.MeshLambertMaterial({ color: 0x3a8f4a, flatShading: true });
      const YEW_NEEDLE = new THREE.MeshLambertMaterial({ color: 0x1f5f3b, flatShading: true });
      const OAK_LEAF = new THREE.MeshLambertMaterial({ color: 0x68963c, flatShading: true });
      const PINE_SNOW = new THREE.Color(0xe7eef2);
      function pineSnow() {
        const w = SEASON.snowy ? 1 : 0;
        PINE_NEEDLE.color.setHex(0x2f6a3a).lerp(PINE_SNOW, w * 0.35);
        PINE_GROWN.color.setHex(0x3a8f4a).lerp(PINE_SNOW, w * 0.22);
      }
      function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
      function grownLook(x, y, kind) {
        const used = [];
        for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
          if (!dx && !dy) continue;
          const nd = core.nodeAt(core.idx(x + dx, y + dy));
          if (!nd || nd.kind !== (kind || 'P')) continue;
          used.push(0.85 + hash2(nd.x + 5, nd.y + 9) * 0.35);
        }
        let s = 1.48 + hash2(x + 3, y + 11) * 0.22, guard = 0;
        while (used.some(u => Math.abs(u - s) < 0.08) && guard++ < 8) s += 0.07;
        return { s, lean: (hash2(x + 9, y + 2) - 0.5) * 0.22, yaw: hash2(x + 2, y) * 6.28 };
      }
      function addPine(x, y, young, kind) {
        kind = kind || 'P';
        const g = new THREE.Group(), gy = heightAt(x + 0.5, y + 0.5);
        const bark = new THREE.Mesh(PINE_TRUNK, PINE_BARK); bark.castShadow = true; g.add(bark);
        if (kind === 'O') {
          const leaf = OAK_LEAF, crowns = [[0, 1.42, 0.42], [-0.35, 1.25, 0.32], [0.34, 1.28, 0.34]];
          for (const [dx, py, r] of crowns) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf); m.position.set(dx, py, 0); m.castShadow = true; g.add(m); }
        } else {
          const needles = kind === 'Y' ? YEW_NEEDLE : (young ? PINE_NEEDLE : PINE_GROWN);
          for (const geo of PINE_CROWN) { const m = new THREE.Mesh(geo, needles); m.castShadow = true; g.add(m); }
        }
        const look = young ? { s: 0.5, lean: 0, yaw: hash2(x, y) * 6.28 } : grownLook(x, y, kind);
        g.scale.set(look.s, look.s, look.s); g.rotation.y = look.yaw; g.rotation.z = look.lean;
        const px = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, young ? 1.2 : 3.2, 6), proxyMat);
        px.position.y = young ? 0.7 : 1.5; px.userData.pick = young ? { kind: 'plant', x, y } : { kind: 'node', i: core.idx(x, y) };
        g.add(px); g.userData.px = px; g.userData.pine = kind; g.userData.young = young ? 1 : 0; g.userData.scale = look.s; proxies.push(px);
        g.position.set(x + 0.5, gy, y + 0.5); scene.add(g); return g;
      }
      function addSprout(x, y, kind) {
        const k = x + ',' + y; if (sprouts.has(k)) return;
        sprouts.set(k, addPine(x, y, true, kind));
      }
      function removeSprout(x, y) {
        const k = x + ',' + y, g = sprouts.get(k); if (!g) return;
        scene.remove(g); const i = proxies.indexOf(g.userData.px); if (i >= 0) proxies.splice(i, 1); sprouts.delete(k);
      }
      const grownTrees = new Map();
      function addGrown(x, y, kind) {
        removeSprout(x, y);
        const k = x + ',' + y; if (grownTrees.has(k)) return;
        grownTrees.set(k, addPine(x, y, false, kind));
      }
      function removeGrown(x, y) {
        const k = x + ',' + y, g = grownTrees.get(k); if (!g) return;
        scene.remove(g); const i = proxies.indexOf(g.userData.px); if (i >= 0) proxies.splice(i, 1); grownTrees.delete(k);
      }
      const TINT = { freeze: ['#9fd8ff', 0.55], stun: ['#fff3a0', 0.35], poison: ['#7fd36a', 0.35], burn: ['#ff8a3a', 0.35], slow: ['#b0b0ff', 0.25] };
      function applyTint(t) {
        const ks = Object.keys(t.fx || {}), k = ks.find(x => x === 'freeze') || ks[0], tc = k && TINT[k];
        if (t.H.setTint) t.H.setTint(tc ? tc[0] : null, tc ? tc[1] : 0);
        if (t.H.setFrozen) t.H.setFrozen(!!(t.fx && (t.fx.freeze || t.fx.stun)));
      }
      function faceNpc(id) { const nd = NPCN[id]; if (nd && nd.still) return;   /* a wreck or a body does not turn to look at you (2026-10-07) */
        const n = ents.get('n:' + id); if (n) { n.tyaw = Math.atan2(myEnt.to.x - n.to.x, myEnt.to.z - n.to.z); n.facing = 1; } }
      function npcsTurnBack() { for (const n of core.M.npcs) { const e = ents.get('n:' + n.id); if (e && e.facing && e.homeYaw != null && !n.patrol && !n.guard && Math.max(Math.abs(n.x - me.x), Math.abs(n.y - me.y)) > 6) { e.facing = 0; e.tyaw = e.homeYaw; } } }   /* back to their own spot once you walk off */
      let indoors = false;
      /* [Claude 2026-10-11] the floor bar (Downstairs / Upstairs buttons) is gone (the operator: "Remove the upstairs downstairs
         hud buttons completely the stairs work fine"): you climb by tapping the stairs. PageUp / PageDown still climb, for keyboards. */
      let floorKey = '';
      function climbKey(dir) { const bi = core.M.buildingAt ? core.M.buildingAt(me.x, me.y) : -1; if (bi < 0) return; const B = core.M.buildings[bi], lv = me.lv || 0; if ((dir < 0 && lv <= 0) || (dir > 0 && lv >= B.floors - 1)) return; send({ c: 'climb', dir, x: B.stairs[0], y: B.stairs[1] }); }
      window.addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'Escape' && me.using) { send({ c: 'unuse' }); e.preventDefault(); } else if (e.key === 'PageDown') { climbKey(-1); e.preventDefault(); } else if (e.key === 'PageUp') { climbKey(1); e.preventDefault(); } });
      function floorBarCheck() {   /* only the castle-wall hint is left of it */
        const bi = core.M.buildingAt ? core.M.buildingAt(me.x, me.y) : -1, B = bi >= 0 ? core.M.buildings[bi] : null, lv = me.lv || 0;
        const key = B ? bi + ':' + lv : '';
        if (key === floorKey) return; floorKey = key;
        if (B && B.deck && !deckHint) { deckHint = true; hud.chat('The castle walls can be walked: tap any flight of stone steps inside the walls (two are beside the gate) to climb up. On the wall, tap where to go; tap the top of the steps to come down.', 'info'); }
      }
      let stairHint = false, deckHint = false;
      /* A roof taken away while you are inside must still keep the sun out (2026-10-13: "when the roof is removed
         because the player walks in then the sun shines through the opening where the roof was"). visible = false would
         also take it out of the shadow map, so the hidden pieces go to the SHADOWED layer instead: no camera draws that
         layer, the sun's shadow camera does. The room keeps the shade it has with the roof on, and the strip of roof
         shadow beside the house stops appearing and vanishing as you walk in and out. Nothing extra is drawn and no
         material is touched, so scene.js's shared materials still compile once. */
      /* [Claude 2026-10-13] The SHADOWED layer did not work (the operator, still: "continue the roof fix to block sunlight. It's
         annoying"): this three.js tests an object's layers against the MAIN camera in its shadow pass too
         (WebGLShadowMap renderObject: object.layers.test(camera.layers)), so a roof moved off layer 0 left the shadow map
         exactly as visible = false had. So the hidden pieces stay on layer 0 and borrow HIDE_MAT instead: it writes no
         colour and no depth - nothing of it on screen, nothing hidden behind it - while the shadow pass draws its shape
         from the geometry (DoubleSide, so a one-sided roof plane still blocks the sun from above). The own material is
         kept on the piece and put back when you walk out. A piece that casts no shadow (glass) is simply not drawn. */
      const HIDE_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
      function shadeGroup(g, hide) {
        if (!g || !!g.userData.shut === hide) return;
        g.userData.shut = hide;
        g.traverse(o => {
          if (o.layers.mask !== 1) o.layers.set(0);   /* pieces the old fix left on SHADOWED come back */
          if (!o.isMesh) return;
          const u = o.userData;
          if (hide) {
            if (!o.castShadow) { if (u.vis0 === undefined) { u.vis0 = o.visible; o.visible = false; } return; }
            if (u.mat0 === undefined) { u.mat0 = o.material; o.material = Array.isArray(o.material) ? o.material.map(() => HIDE_MAT) : HIDE_MAT; }
          } else {
            if (u.mat0 !== undefined) { o.material = u.mat0; delete u.mat0; }
            if (u.vis0 !== undefined) { o.visible = u.vis0; delete u.vis0; }
          }
        });
      }
      function roofCheck() {
        floorBarCheck();
        if (!stairHint && (me.lv || 0) > 0 && !(me.bld >= 0 && core.M.buildings[me.bld] && core.M.buildings[me.bld].deck)) { stairHint = true; hud.chat('Upstairs. The way down is the opening in the floor with the amber arrow - tap it.', 'info'); }
        let inside = false;
        let inRf = null;
        for (const r of regions) if (r.built) for (const rf of r.built.roofs) if (me.x >= rf.x0 && me.x <= rf.x1 && me.y >= rf.y0 && me.y <= rf.y1) { inside = true; inRf = rf; }
        /* inside a building: the roof and every storey above your floor are see-through; your floor and those below stay.
           shadeGroup is self-healing - if a chunk is rebuilt under a building we are standing in, its fresh groups carry
           no shut flag, so this same call puts them back on the SHADOWED layer a frame later. */
        const lvNow = me.lv || 0;
        for (const r of regions) if (r.built) for (const rf of r.built.roofs) {
          const here = rf === inRf;
          shadeGroup(rf.g, here);
          const ss = rf.storeys;
          for (let i = 0; ss && i < ss.length; i++) shadeGroup(ss[i], here && i + 1 > lvNow);
        }
        inside = inside || (me.lv | 0) < 0;
        if (inside !== indoors) { indoors = inside; if (wxMod && wxMod.indoor) wxMod.indoor(inside); }   /* no rain on your head indoors */
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
          case 'unlock': noise(0.32, 520, 0.45, 2); tone(115, 0.34, 'square', 0.28, 82); tone(740, 0.42, 'triangle', 0.22, 1180, 0.2); break;
          case 'freeze': tone(1800, 0.25, 'sine', 0.2, 2600); noise(0.3, 6000, 0.15, 3); break;
          case 'beep': tone(1250, 0.09, 'square', 0.11, 1250); break;   /* [Claude 2026-10-12] the card table's last ten seconds, your turn only */
          case 'pray': tone(660, 0.35, 'sine', 0.25, 990); tone(990, 0.3, 'sine', 0.12, 0, 0.08); break;
          case 'prayoff': tone(700, 0.25, 'sine', 0.2, 350); break;
          case 'altar': [392, 523, 659, 784].forEach((f, i) => tone(f, 0.6, 'sine', 0.22, 0, i * 0.1)); break;
          case 'bury': noise(0.12, 500, 0.6, 1.5); noise(0.1, 350, 0.4, 1.5); break;
        }
      }

      /* ---------- camera (RuneScape-style orbit) */
      const FPV = { v: new THREE.Vector3(), t: new THREE.Vector3(), fw: new THREE.Vector3(), hid: false };
      const cam = { yaw: PI * 0.12, pitch: 0.92, dist: isPhone ? 9 : 11, tyaw: PI * 0.12, tpitch: 0.92, tdist: isPhone ? 9 : 11, snap: true, keys: {} };
      { const cy = +q.get('camyaw'), cp = +q.get('campitch'); if (q.has('camyaw') && isFinite(cy)) cam.yaw = cam.tyaw = cy; if (q.has('campitch') && isFinite(cp)) cam.pitch = cam.tpitch = cp; }   /* a playtest or time-lapse can set the view */
      const camT = new THREE.Vector3();
      function updateCamera(dt) {
        const k = cam.keys;
        if (k.ArrowLeft) cam.tyaw -= 2.2 * dt; if (k.ArrowRight) cam.tyaw += 2.2 * dt; if (k.ArrowUp) cam.tpitch += 1.2 * dt; if (k.ArrowDown) cam.tpitch -= 1.2 * dt;
        const hawkEye = !!myEnt.hawk && !((me.burden || 0) > 0);   /* flying or perched: the hawk's own eyes (2026-10-07); grounded under a load: behind it as usual */
        if (!cam.film) { cam.tpitch = Math.max(hawkEye || !myEnt.hawk ? -1.3 : 0.3, Math.min(1.42, cam.tpitch)); cam.tdist = Math.max(4.5, Math.min(hawkEye ? 11 : 24, cam.tdist)); }   /* cam.film [Claude 2026-10-13]: a film sets the camera exactly, every frame (the clamp and the easing made close shots jitter) */   /* below 0.3 a walker's camera goes into the eyes and looks up; zoom by distance */
        const s = cam.snap || cam.film ? 1 : Math.min(1, dt * 10);
        cam.yaw += (cam.tyaw - cam.yaw) * s; cam.pitch += (cam.tpitch - cam.pitch) * s; cam.dist += (cam.tdist - cam.dist) * s;
        const p = myEnt.root.position; const tg = new THREE.Vector3(p.x, p.y + 1.0, p.z);
        if (cam.mode === 'creator') {   /* close-up, the character turned to face the camera, a little right of centre */
          cam.tyaw = myEnt.yaw; cam.tpitch = 0.2; cam.tdist = isPhone ? 3.2 : 3.6; tg.y = p.y + 0.95;
          const side = host.clientWidth > 500 ? 0.55 : 0.4; tg.x -= Math.cos(cam.yaw) * side; tg.z += Math.sin(cam.yaw) * side;
        }
        if (cam.mode === 'chess' && CHESSV) { tg.set(CHESSV.x, CHESSV.y, CHESSV.z); cam.tyaw = CHESSV.yaw + CHESS_TURN; cam.tpitch = isPhone ? 1.32 : 1.22; cam.tdist = isPhone ? 1.9 : 1.55; }   /* seated at a chess table: close over the board, your side nearest */
        if (cam.mode === 'fortune' && FE) FE.target(tg);   /* [Claude 2026-10-16] */
        if (cam.mode === 'poker' && POKERV) { tg.set(POKERV.x, POKERV.y, POKERV.z); cam.tyaw = POKERV.yaw; cam.tpitch = 1.2; cam.tdist = 1.4; }   /* seated at the felt: the light centre is the middle of the table */
        if (cam.snap || cam.film) camT.copy(tg); else camT.lerp(tg, Math.min(1, dt * 12));
        cam.snap = false;
        const cp = Math.max(0.3, cam.pitch);
        camera.position.set(camT.x + Math.sin(cam.yaw) * Math.cos(cp) * cam.dist, camT.y + Math.sin(cp) * cam.dist, camT.z + Math.cos(cam.yaw) * Math.cos(cp) * cam.dist);
        const gy = heightAt(camera.position.x, camera.position.z) + 0.6; if (camera.position.y < gy) camera.position.y = gy;
        /* and the ground between: on a cliff (the great mountain's ledges, 2026-10-18) the slope between the camera and you would fill the
           view, so the camera rises until its line down to you clears the ground at a quarter, half and three-quarters of the way */
        if (!cam.film && cam.mode !== 'chess' && cam.mode !== 'poker') for (const t of [0.25, 0.5, 0.75]) {
          const lx = camT.x + (camera.position.x - camT.x) * t, lz = camT.z + (camera.position.z - camT.z) * t, need = heightAt(lx, lz) + 0.8;
          const ly = camT.y + (camera.position.y - camT.y) * t; if (ly < need) camera.position.y = camT.y + (need - camT.y) / t;
        }
        /* LOOK UP AT THE SKY (2026-10-07: "look up past the point where it is currently limited to slide the camera into first person
           view"): tilting on past the lowest view slides the camera forward into your character's eyes, and from there you look up -
           to the sun, the moon, the stars, straight overhead. Tilt back down and it slides out again. */
        const hawkFP = !!myEnt.hawk && !((me.burden || 0) > 0) && cam.mode !== 'creator';
        const fp = cam.mode === 'creator' || (myEnt.hawk && !hawkFP) ? 0 : hawkFP ? 1 : Math.min(1, Math.max(0, (0.3 - cam.pitch) / 0.2)), fpEl = hawkFP ? Math.max(-1.45, Math.min(1.5, (0.1 - cam.pitch) * 1.07)) : Math.min(1.5, Math.max(0, 0.1 - cam.pitch) * 1.07);   /* the hawk looks down at the ground as well as up */
        /* looking up, the zoom is a pair of binoculars: the view narrows down to a few degrees, and the sun and the moon (half a degree
           each, as ours) fill it */
        if (FPV.fov0 == null) FPV.fov0 = camera.fov;
        const fovW = fp > 0 ? FPV.fov0 + (FPV.fov0 * Math.max(0.25, Math.min(1, (cam.dist - 4.5) / 6.5)) - FPV.fov0) * fp : FPV.fov0;
        if (Math.abs(camera.fov - fovW) > 0.01) { camera.fov = fovW; camera.updateProjectionMatrix(); }
        /* FOLLOW WHAT YOU ZOOMED IN ON (2026-10-07): looking up and zoomed in, the sun, the moon or a planet near the middle of the view
           is followed across the sky - the view turns with it - until you drag the view away */
        if (fp > 0.95 && cam.dist < 8 && !ptrs.size && !(cam.keys.ArrowLeft || cam.keys.ArrowRight || cam.keys.ArrowUp || cam.keys.ArrowDown)) {
          const fw = FPV.fw.set(0, 0, -1).applyQuaternion(camera.quaternion), lim = Math.max(0.05, camera.fov * Math.PI / 180 * 0.35);
          let best = null, bd = lim;
          for (const v of [SUNL.sv, SUNL.mv].concat((SKYV.pl || []).map(P => P.dir))) {
            if (!v) continue; const l = Math.hypot(v[0], v[1], v[2]) || 1, a = Math.acos(Math.max(-1, Math.min(1, (v[0] * fw.x + v[1] * fw.y + v[2] * fw.z) / l)));
            if (a < bd && v[1] / l > -0.02) { bd = a; best = [v[0] / l, v[1] / l, v[2] / l]; }
          }
          if (best) { const el = Math.asin(best[1]); cam.tyaw = Math.atan2(-best[0], -best[2]) + Math.round((cam.tyaw - Math.atan2(-best[0], -best[2])) / (2 * PI)) * 2 * PI; cam.tpitch = 0.1 - Math.max(0, el) / 1.07; }
        }
        if (fp > 0) {
          const ex = p.x, ey = p.y + (hawkFP ? 0.3 : 1.62), ez = p.z, fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
          camera.position.lerp(FPV.v.set(ex - fx * 0.05, ey, ez - fz * 0.05), fp);
          FPV.t.set(ex + fx * Math.cos(fpEl) * 10, ey + Math.sin(fpEl) * 10, ez + fz * Math.cos(fpEl) * 10);
          camera.lookAt(FPV.t.lerp(camT, 1 - fp));
        } else camera.lookAt(camT);
        /* LOOKING AROUND IN FIRST PERSON (2026-10-07): your character turns the way you look, and its head tilts up (or down) to where
           you are looking - others see it (the state's f and hl) */
        if (fp > 0.5 && !myEnt.hawk) { myEnt.tyaw = cam.yaw + PI; myEnt.hl = fpEl; } else myEnt.hl = 0;
        if (fp > 0.85 && myEnt.root.visible) { myEnt.root.visible = false; FPV.hid = true; }   /* your own head would fill the view */
        else if (fp <= 0.85 && FPV.hid) { myEnt.root.visible = true; FPV.hid = false; }
        if (cam.mode === 'chess' && CHESSV && CHESSV.eye) {   /* THE CHESS PARK: first person over the board, the board filling the screen */
          const tc = Math.cos(CHESS_TURN), tsn = Math.sin(CHESS_TURN), turn = (P) => ({ x: CHESSV.x + (P.x - CHESSV.x) * tc - (P.z - CHESSV.z) * tsn, y: P.y, z: CHESSV.z + (P.x - CHESSV.x) * tsn + (P.z - CHESSV.z) * tc });   /* [Claude] the eye and the look swung round the board's centre */
          const E = turn(CHESSV.eye), L = turn(CHESSV.look); camera.position.set(E.x, E.y, E.z); camera.lookAt(L.x, L.y, L.z);
          const aspect = (host.clientWidth || 1) / (host.clientHeight || 1), d = Math.hypot(L.x - E.x, L.y - E.y, L.z - E.z), half = 0.6;
          let fov = 2 * Math.atan((aspect < 1 ? half / aspect : half) / d) * 180 / Math.PI * 1.22;   /* portrait: the board has to fit the width; the margin keeps the near rank above the chat */
          fov = Math.max(42, Math.min(100, fov));
          if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
          if (myEnt.root.visible) { myEnt.root.visible = false; FPV.hid = true; }   /* your own head would fill the view */
        }
        if (cam.mode === 'fortune' && FE) FE.camera(camera, dt);   /* [Claude 2026-10-16] THE FORTUNE ENGINE: first person on the bench, the head turned by a drag */
        if (cam.mode === 'poker' && POKERV && POKERV.eye) {   /* THE POKER TABLE: first person at the felt, leaning a little over your own side of it */
          const E = POKERV.eye, L = POKERV.look; camera.position.set(E.x, E.y, E.z); camera.lookAt(L.x, L.y, L.z);
          const aspect = (host.clientWidth || 1) / (host.clientHeight || 1), d = Math.hypot(L.x - E.x, L.y - E.y, L.z - E.z), half = 0.66;
          let fov = 2 * Math.atan((aspect < 1 ? half / aspect : half) / d) * 180 / Math.PI * 1.18;   /* portrait: the whole width of the felt has to fit */
          fov = Math.max(45, Math.min(95, fov));
          if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
          if (myEnt.root.visible) { myEnt.root.visible = false; FPV.hid = true; }   /* your own body would sit in the middle of your own cards */
        }
        sun.position.set(camT.x + SUNL.dir[0] * 20, camT.y + SUNL.dir[1] * 20, camT.z + SUNL.dir[2] * 20); sun.target.position.copy(camT);   /* from the real sun (or the moon) */
      }

      /* ---------- picking: what is under a screen point */
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      const _seeV = new THREE.Vector3(), _seeS = new THREE.Vector2();
      const WPOS = new THREE.Vector3();
      function targetsAt(cx, cy) {
        const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const objs = proxies.filter(px => { const e = px.userData.ent; return !e || (!e.dead && e.root.visible); });
        if (PET) objs.push.apply(objs, PET.pickables());   /* [Claude 2026-10-17] pets: long-press / right-click */
        for (const r2 of regions) if (r2.built && regionDist(r2, me.x, me.y) <= 45) objs.push.apply(objs, r2.built.pickables);   /* only what is near (seeded chunks are many) */
        const hits = ray.intersectObjects(objs, false), out = [], seen = new Set();
        for (const h of hits) {
          let t = h.object.userData.pick; if (!t) continue;
          /* a castle wall's face is not a way up it (2026-10-17, the operator: "I'm trying to click on the ground I can see - it tries to walk my
             character up those walls"): standing on the ground, a tap counts on a wall, tower or stair only on its walkway, the top 0.9 m of
             its pick box; lower down, the tap goes on through to what lies behind it. Up on the walls, every tap counts as before. */
          if (t.kind === 'deckpick' && (me.lv | 0) === 0 && !(core.M.lifts && core.M.liftAt(me.x, me.y) > 0)) {
            const gp = h.object.geometry && h.object.geometry.parameters; WPOS.setFromMatrixPosition(h.object.matrixWorld);
            if (gp && gp.height && h.point.y < WPOS.y + gp.height / 2 - 0.9) continue;
          }
          if (t.kind === 'tree' || t.kind === 'ground' || t.kind === 'deckpick') { const reg = regions.find(r2 => r2.built && (r2.built.pickables.indexOf(h.object) >= 0)); t = reg ? reg.built.pickInfo(h) : null; if (!t) continue; }
          if (t.kind === 'ground') { const x = Math.floor(t.point.x), y = Math.floor(t.point.z); t = { kind: 'ground', x, y }; }
          if (t.kind === 'self') continue;
          if (t.lv != null && (t.lv | 0) !== (me.lv | 0)) continue;
          if ((me.lv | 0) < 0 && t.lv == null && (t.kind === 'ground' || t.kind === 'node' || t.kind === 'passage' || t.kind === 'mechanism' || t.kind === 'sign' || t.kind === 'crate')) continue;
          if ((t.kind === 'pokertable' || t.kind === 'chesstable') && (t.lv | 0) !== (me.lv | 0)) continue;   /* [Claude 2026-10-12] a table on another storey is not under your finger: the tap falls through to the floor (the operator: tapping the Tap's ground floor under the tables only said they were upstairs) */
          if (t.kind === 'node' && h.point) t = Object.assign({}, t, { hp: [h.point.x, h.point.z] });   /* where on the tree you tapped (a hawk perches on that side) */
          if (t.kind === 'square' && h.point) t = Object.assign({}, t, { pt: { x: h.point.x, z: h.point.z } });   /* which square of a chess board */
          if (t.kind === 'remote' && !remotes.has(t.id)) continue;
          const k = t.kind + ':' + (t.uid || t.id || t.i || (t.x + ',' + t.y)); if (seen.has(k)) continue; seen.add(k); out.push(t);
          if (t.kind === 'ground') break;
        }
        /* upstairs (a storey, a castle wall walk): the tile you tap is on YOUR floor, not on the ground under it - the ray
           meets the plane you stand on (2026-10-05: the Saltmere stairs "very hard to navigate": a tap on the
           opening upstairs used to land on the ground tile a storey below, metres away) */
        if (((me.lv || 0) !== 0 || (core.M.lifts && core.M.liftAt(me.x, me.y) > 0)) && myEnt) {
          const pt = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -myEnt.root.position.y), new THREE.Vector3());
          const gi = out.findIndex(t => t.kind === 'ground');
          if (pt) { const g = { kind: 'ground', x: Math.floor(pt.x), y: Math.floor(pt.z) }; if (gi >= 0) out[gi] = g; else out.push(g); }
        }
        /* characters and loot win over trees in front of them (a canopy should not eat the click) */
        const pri = t => t.kind === 'mob' || t.kind === 'npc' || t.kind === 'item' || t.kind === 'crate' || t.kind === 'sign' ? 0 : t.kind === 'node' || t.kind === 'remote' || t.kind === 'passage' || t.kind === 'caveout' || t.kind === 'canoe' ? 1 : 2;
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
      function optionsForRaw(t) {
        const esc = s => String(s).replace(/</g, '&lt;');
        if (t.kind === 'mob') { const m = core.mobByUid(t.uid), d = D.monsters[m.key], cb = core.mobCombat(d); const nm = '<span class="y">' + esc(d.name) + '</span> <span style="color:' + lvColor(cb) + '">(combat-' + cb + ')</span>'; /* a monster that talks offers Talk-to first (and as the default click), so nobody starts a fight with the dragon by accident */ const atk = { html: 'Attack ' + nm, act: { c: 'attack', uid: t.uid }, red: d.lines ? 0 : 1 }; const o = d.lines ? [{ html: 'Talk-to ' + nm, act: { c: 'mobtalk', uid: t.uid }, red: 1 }, atk] : [atk]; o.push({ html: 'Examine ' + nm, fn: () => hud.chat(d.name + ': combat ' + cb + ' (' + (cb > core.combatLevel(me) ? 'stronger than you' : cb === core.combatLevel(me) ? 'evenly matched' : 'weaker than you') + '), ' + d.hp + ' hitpoints, hits up to ' + d.max + '.' + (d.aggro ? ' Aggressive.' : '') + (d.cast ? ' It breathes fire as well as biting.' : '') + (d.hint ? ' ' + d.hint : ''), 'sys') }); return o; }
        if (t.kind === 'npc') { const n = NPCN[t.id]; if (!n || !npcShown(n)) return []; const cb = n.watch ? (core.guardCb || 33) : 0; const nm = '<span class="y">' + esc(n.name) + '</span>' + (cb ? ' <span style="color:' + lvColor(cb) + '">(combat-' + cb + ')</span>' : ''); const o = []; if (n.tailor) { o.push({ html: 'Change-look ' + nm, act: { c: 'npc', id: n.id }, red: 1 }); if (n.shop) o.push({ html: 'Trade ' + nm, act: { c: 'npc', id: n.id, trade: 1 }, red: 1 }); }
          else if (n.chest) o.push({ html: 'Open ' + nm, act: { c: 'npc', id: n.id }, red: 1 });
          else if (n.portal) o.push({ html: 'Use ' + nm, act: { c: 'npc', id: n.id }, red: 1 });
          else if (n.shop) o.push({ html: 'Trade ' + nm, act: { c: 'npc', id: n.id }, red: 1 });
          else o.push({ html: (n.verb || 'Talk-to') + ' ' + nm, act: { c: 'npc', id: n.id }, red: 1 });
          if (n.watch) o.push({ html: 'Attack ' + nm, act: { c: 'attack', id: n.id } });
          if (n.escape && core.searchOpen(me, n)) o.push({ html: 'Escape cave', fn: () => hud.confirm('Leave the cave?', 'Climb back out to the mouth of the Spider Cave?', 'Leave', 'Stay', () => send({ c: 'escape', id: n.id })) });
          o.push({ html: 'Examine ' + nm, fn: () => {
            if (n.search && !core.searchOpen(me, n)) hud.chat('We should probably leave him alone.', 'sys');
            else { const nn = core.npcFor ? core.npcFor(me, n) : n; hud.chat(nn.shop ? nn.name + ' runs the ' + core.shop(nn.shop).name + '.' : (nn.examine || nn.name + ', the village elder.'), 'sys'); }
          } }); return o; }
        if (t.kind === 'item') {
          const g = core.S.ground.find(q2 => q2.uid === t.uid); if (!g) return [];
          const here = core.S.ground.filter(q => q.x === g.x && q.y === g.y && !q.sunk);
          const o = here.map(q => { const d = core.item(q.id), nm = '<span class="o">' + esc(d.name) + (q.n > 1 ? ' (' + q.n + ')' : '') + '</span>'; return { html: 'Take ' + nm, act: { c: 'take', uid: q.uid }, red: q.uid === g.uid ? 1 : 0 }; });
          const d0 = core.item(g.id); o.push({ html: 'Examine <span class="o">' + esc(d0.name) + '</span>', fn: () => hud.chat(hud.examine(g.id, g.n), 'sys') });
          return o;
        }
        if (t.kind === 'node' && core.isHawk(me)) { const n = core.nodeAt(t.i); if (n && core.nodeDef(n).skill === 'woodcutting') {
          const hp = t.hp || [n.x + 0.5, n.y + 0.5], dx = hp[0] - (n.x + 0.5), dy = hp[1] - (n.y + 0.5), sx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, sy = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
          return [{ html: 'Perch in <span class="c">tree</span>', act: { c: 'perch', x: n.x, y: n.y, sx: sx || 1, sy } }]; } }
        if (t.kind === 'node') {
          const n = core.nodeAt(t.i); if (!n) return [];
          const nd = core.nodeDef(n), verb = n.kind === 'altar' ? 'Pray-at' : n.kind === 'range' || n.kind === 'fire' ? 'Cook-at' : nd.skill === 'woodcutting' ? 'Chop down' : nd.skill === 'mining' ? 'Mine' : 'Net', nm = '<span class="c">' + nd.name + '</span>';
          const o = [nd.peelOnly ? null : { html: verb + ' ' + nm, act: { c: 'gather', x: n.x, y: n.y }, red: 1 }, { html: 'Examine ' + nm, fn: () => hud.chat(nd.name + (nd.req ? ': needs ' + nd.skill + ' level ' + nd.req + '.' : '.'), 'sys') }];
          /* the sugar bush (2026-10-08): peel a birch's bark, tap a maple for sap - first in the list, before chopping */
          if (!o[0]) o.shift();   /* a shrub that only gives bark: no "Chop down" */
          if (nd.peel) o.unshift({ html: (nd.peel.verb || 'Peel') + ' ' + nm, act: { c: 'gather', x: n.x, y: n.y, peel: 1 }, red: 1 });
          if (nd.tap) o.unshift({ html: (nd.tap.verb || 'Tap') + ' ' + nm, act: { c: 'gather', x: n.x, y: n.y, tap: 1 }, red: 1 });
          if (n.chapel === 'ancient') {
            const q = me.quests && me.quests.even_grove, Q = D.quests && D.quests.quests.even_grove;
            if (q && Q && q.step > Q.steps.length) o.push({ html: 'Offer <span class="c">logs and bones</span>', act: { c: 'offer', x: n.x, y: n.y } });
          }
          return o;
        }
        if (t.kind === 'caveout') {   /* the cave's way out, up top: it only goes up (2026-10-07: "it should inform them in the chat that there is no way down") */
          const nm = '<span class="c">Cave opening</span>', say = () => hud.chat("The shaft drops away steep and narrow into the dark. There's no way down from here.", 'sys');
          return [{ html: 'Enter ' + nm, fn: say, act: null }, { html: 'Examine ' + nm, fn: () => hud.chat('A narrow opening in the rock. A cold draught breathes up out of it.', 'sys') }]; }
        if (t.kind === 'trap') { const nm = '<span class="c">Nagwaagan (snare)</span>';
          return [{ html: 'Check ' + nm, act: { c: 'trap', x: t.x, y: t.y }, red: 1 }, { html: 'Take up ' + nm, act: { c: 'trap', x: t.x, y: t.y, up: 1 } },
                  { html: 'Examine ' + nm, fn: () => hud.chat('Your nagwaagan (snare): a noose of sinew across a waabooz (rabbit) run, tied to a bent sapling.', 'sys') }]; }
        if (t.kind === 'canoe') { const nm = '<span class="c">Birch bark canoe</span>';
          return [{ html: 'Get into the ' + nm, act: { c: 'board', x: t.x, y: t.y }, red: 1 },
                  { html: 'Examine ' + nm, fn: () => hud.chat('A canoe of birch bark over cedar ribs, sewn with spruce root and sealed with pitch. It floats light as a leaf.', 'sys') }]; }
        if (t.kind === 'decor') {   /* scenery (data/decor.json, 2026-10-18: "they should all have examine text as well") */
          const K = DATA.decor && DATA.decor.kinds && DATA.decor.kinds[t.k]; if (!K) return [];
          return [{ html: 'Examine <span class="c">' + esc(K.name) + '</span>', fn: () => hud.chat(K.examine, 'sys') }];
        }
        if (t.kind === 'sign') {
          const o = core.signAt(t.x, t.y); if (!o) return [];
          const nm = '<span class="c">' + (o.board === 'chess' ? 'Champions board' : 'Wooden sign') + '</span>', sk = o.board === 'chess' ? 'chess_wins' : 'chain_dragon';
          return [{ html: 'Read ' + nm, fn: () => { scoresAsk(true); core.scoreRead(sk).forEach(l => hud.chat(l, 'sys')); }, red: 1 },
                  { html: 'Examine ' + nm, fn: () => hud.chat(o.board === 'chess' ? 'An oak board on two posts by the tables. The names of those who have won games here are chalked on it, most wins first.' : 'A weathered oak board nailed to the ruin wall. Names of those who have slain the chained dragon are carved into it.', 'sys') }];
        }
        /* [Claude 2026-10-15] A GOLD wager asks first (the operator: "There should be a confirmation button when joining a game
           that has a gold wager"): joining a staked chess game or a card table with a buy-in, or sitting first and setting
           the stake, opens a Yes/No box saying what it costs; only Yes sits. A friendly table sits straight away. */
        const wagerSit = (line, act, gold, game) => gold > 0 ? { html: line, fn: () => hud.confirm('Play for ' + gold.toLocaleString() + ' GOLD?',
            game === 'pk' ? 'This card table plays for real GOLD: sitting down buys in for ' + gold.toLocaleString() + ' GOLD from your pack. You keep what is in front of you when you stand up.'
                          : 'This chess game is played for a stake of ' + gold.toLocaleString() + ' GOLD each: it comes out of your pack when you sit. The winner takes both stakes; a draw gives each their own back; standing up after a move has been played loses it.',
            'Sit down', 'Not now', () => send(Object.assign({}, act, { run: !!settings.runToggle }))) } : { html: line, act };
        if (t.kind === 'chesstable' || t.kind === 'square') {   /* THE CHESS PARK (2026-10-10): a bench each side; seated, the board itself takes the taps */
          const T = core.tableById(t.id); if (!T) return [];
          if (t.kind === 'square' && me.seat && me.seat.t === t.id) { const sq = SCENE.chessSquare ? SCENE.chessSquare(t.id, t.pt) : null; return sq ? [{ html: 'Square ' + sq, fn: () => chessTap(sq) }] : []; }
          const st = core.chessOf(t.id), out = [], taken = [];
          if (me.seat && me.seat.t === t.id) return MENU_MODE ? [{ html: 'Stand up', fn: () => { if (CHESS_ASK) CHESS_ASK(); } }] : [];   /* [Claude] seated: a tap on the table's edge does nothing (the operator: only the button, and it asks first) */
          else {   /* the free bench first (a plain tap takes the first line), the one that is taken as a note */
            const wFree = !st.w || st.w === PID, bFree = !st.b || st.b === PID, empty = !st.w && !st.b, stake = st.stake | 0;
            /* [Claude 2026-10-11] STAKES: at an empty table the first to sit sets them (the operator); at a table with someone the
               line says what the game is played for, and sitting is agreeing to it */
            const note = empty ? '' : stake ? ' <span class="y">(stake ' + stake.toLocaleString() + ' GOLD)</span>' : ' <span class="c">(friendly)</span>';
            if (wFree) out.push({ ...wagerSit('Sit down as White <span class="c">(south bench)</span>' + note, { c: 'sit', table: t.id, seat: 1, stake: 0 }, empty ? 0 : stake, 'ch'), red: 1 }); else taken.push({ html: 'White: <span class="y">' + esc(st.wn || 'someone') + '</span>', fn: () => hud.chat(esc(st.wn) + ' is playing White here.', 'sys') });
            if (bFree) out.push({ ...wagerSit('Sit down as Black <span class="c">(north bench)</span>' + note, { c: 'sit', table: t.id, seat: 0, stake: 0 }, empty ? 0 : stake, 'ch'), red: out.length ? 0 : 1 });
            if (empty) for (const n of [100, 500, 1000]) out.push(wagerSit('Sit as White for a stake of <span class="y">' + n.toLocaleString() + ' GOLD</span>', { c: 'sit', table: t.id, seat: 1, stake: n }, n, 'ch')); else taken.push({ html: 'Black: <span class="y">' + esc(st.bn || 'someone') + '</span>', fn: () => hud.chat(esc(st.bn) + ' is playing Black here.', 'sys') });
          }
          out.push(...taken, { html: 'Examine <span class="c">Chess table</span>', fn: () => hud.chat(chessExamine(st), 'sys') });
          return out;
        }
        if (t.kind === 'pet') return PET ? PET.menu(t) : [];   /* [Claude 2026-10-17] a pet: choose yours / inspect */
        if ((t.kind === 'fortune' || t.kind === 'fehot') && FE) return FE.menu(t);   /* [Claude 2026-10-16] a Fortune Engine */
        if (t.kind === 'pokertable') {   /* THE POKER TABLE: six chairs round one felt in the Saltmere tap room; once you are sitting, the panel in front of you does the talking */
          const T = core.pokerTableById(t.id); if (!T) return [];
          if ((T.lv | 0) !== (me.lv | 0)) return [{ html: 'Card table <span class="c">(' + ((T.lv | 0) > (me.lv | 0) ? 'up the stairs' : 'downstairs') + ')</span>', fn: () => hud.chat('The poker table is ' + ((T.lv | 0) > (me.lv | 0) ? 'up the tavern stairs.' : 'downstairs.'), 'sys') }];   /* [Claude] */
          const st = core.pokerOf(t.id), out = [], taken = [], at = {};
          for (const s of st.se || []) at[s[0] | 0] = s[1];
          const pkEmpty = !(st.se || []).length, buy = st.buy | 0;   /* [Claude 2026-10-11] BUY-INS in GOLD: the first to sit sets the buy-in (the operator) */
          const pkNote = pkEmpty ? '' : buy ? ' <span class="y">(buy-in ' + buy.toLocaleString() + ' GOLD)</span>' : ' <span class="c">(free chips)</span>';
          if (me.seat && me.seat.t === t.id && me.seat.k === 'pk') return MENU_MODE ? [{ html: 'Stand up', fn: () => { if (POKER_ASK) POKER_ASK(); } }] : [];   /* [Claude] seated: the same rule at the felt */
          else (T.seats || []).forEach((s, i) => {
            const who = at[i];
            if (who && who !== PID) taken.push({ html: 'Chair ' + (i + 1) + ': <span class="y">' + pokerWho(who) + '</span>', fn: () => hud.chat(pokerWho(who) + ' is sitting there.', 'sys') });
            else out.push({ ...wagerSit('Sit down <span class="c">(chair ' + (i + 1) + ')</span>' + pkNote, { c: 'sit', table: t.id, seat: i, buy: 0 }, pkEmpty ? 0 : buy, 'pk'), red: out.length ? 0 : 1 });
          });
          if (pkEmpty && !(me.seat && me.seat.t === t.id)) { const free = (T.seats || []).findIndex((s, i) => !at[i]); if (free >= 0) for (const n of [100, 1000, 10000]) out.push(wagerSit('Buy in for <span class="y">' + n.toLocaleString() + ' GOLD</span> <span class="c">(chair ' + (free + 1) + ', sets the table\'s stakes)</span>', { c: 'sit', table: t.id, seat: free, buy: n }, n, 'pk')); }
          out.push(...taken, { html: 'Play <span class="y">Solitaire</span>', fn: openSolitaire }, { html: 'Examine <span class="c">Card table</span>', fn: () => hud.chat(pokerExamine(st), 'sys') });   /* Solitaire [Claude 2026-10-13]: the operator */
          return out;
        }
        if (t.kind === 'crate') {
          const o = core.crateAt(t.x, t.y); if (!o) return [];
          const nm = '<span class="c">Crate</span>';
          return [{ html: 'Search ' + nm, act: { c: 'crate', x: o.x, y: o.y }, red: 1 }, { html: 'Examine ' + nm, fn: () => hud.chat(o.examine || 'A wooden crate.', 'sys') }];
        }
        if (t.kind === 'mechanism') { const o = core.mechanismAt(t.x, t.y, me.lv); if (!o) return []; const nm = '<span class="c">' + esc(o.name || 'Ancient mechanism') + '</span>';
          return [{ html: esc(o.label || o.verb || 'Use') + ' ' + nm, act: { c: 'mechanism', x: o.x, y: o.y }, red: 1 },
                  { html: 'Examine ' + nm, fn: () => hud.chat(o.examine || 'A mechanism built into the foundations of the ruined keep.', 'sys') }]; }
        if (t.kind === 'passage') { const o = core.passageAt(t.x, t.y, me.lv); if (!o) return []; const nm = '<span class="c">' + esc(o.name || (o.k === 'cavemouth' ? 'Cave' : o.k === 'gate' ? 'Gate' : o.k === 'hatch' ? 'Iron hatch' : 'Way out')) + '</span>';
          return [{ html: esc(o.label || 'Go through'), act: { c: 'enter', x: o.x, y: o.y }, red: 1, then: () => { if (o.k !== 'gate' && o.to) travelSoon(PASSK[o.k] || null, (zoneAtIndex(o.to[0], o.to[1]) || {}).name || '', o.to[0], o.to[1], Math.max(Math.abs(me.x - o.x), Math.abs(me.y - o.y)) <= 1); } },
                  { html: 'Examine ' + nm, fn: () => hud.chat(o.examine || (o.k === 'cavemouth' ? 'A dark opening in the rock. Webs hang just inside, and the air smells of damp and old fur.' : o.k === 'gate' ? 'A barred gate. Its lock is tied to a nearby seal.' : o.k === 'hatch' ? 'An iron hatch set into the old paving. Its keyhole is shaped like a flame around a heart.' : 'A ladder up through the foundations.'), 'sys') }]; }
        if (t.kind === 'remote') {
          const r = remotes.get(t.id); if (!r) return [];
          if (r.boat === 1 && !me.boat && !Object.values(core.S.players).some(q => q.boat === 2 && q.ride === t.id))   /* two in the canoe: with their push pole and my knockers, ricing; else paddling together (2026-10-08) */
            return [r.pole && me.inv.some(sl => sl && sl.id === 'knockers') ? { html: 'Climb in to knock rice <span class="c">(bawa\'iganaakoog)</span>', act: { c: 'ride', pid: t.id }, red: 1 } : { html: 'Get into the <span class="c">canoe</span>', act: { c: 'ride', pid: t.id }, red: 1 }];
          /* the combat level next to the name, coloured like a monster's (2026-10-06) */
          const pp = core.S.players[t.id], cb = pp ? core.combatLevel(pp) : 0;
          const nm = '<span class="w">' + esc(label(r.name, r.from)) + '</span>' + (cb ? ' <span style="color:' + lvColor(cb) + '">(combat-' + cb + ')</span>' : ''), o = [];
          /* only in the long-press / right-click menu (2026-10-05: trading "you should have to long click or right click on
             them"; "another function of the long press on another player should be the ability to follow them") - a plain tap
             on a player walks there (tapAt skips players) */
          if (trade && trade.available() && room && !room.me.guest && !r.from.guest) o.push({ html: 'Trade with ' + nm, fn: () => trade.open(r.from) });
          o.push({ html: 'Follow ' + nm, fn: () => startFollow(t.id) });
          /* their own levels as their game sent them; not here yet (2026-10-07: a first look showed every skill at 1, a blank copy):
             ask their game for them and open the panel when they come */
          o.push({ html: 'View stats ' + nm, fn: () => { if (r.skills) { hud.playerStats(label(r.name, r.from), r.skills, cb, r.story); return; } hud.chat('Asking ' + label(r.name, r.from) + ' for their stats\u2026', 'sys'); r.wantStats = { at: Date.now(), name: label(r.name, r.from), cb }; netSend({ GQ: 1 }); } });
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
        if (t.kind === 'stump') {
          const young = core.plantYoung && core.plantYoung(t.x, t.y);
          if (young) return [{ html: 'Pick up <span class="c">sapling</span>', act: { c: 'unplant', x: t.x, y: t.y }, red: 1 }, { html: 'Examine <span class="c">stump</span>', fn: () => hud.chat('A sapling set in a stump. You can take it back for an hour. After that, the tree stands again.', 'sys') }];
          if (core.canPlant(me, t.x, t.y)) return [{ html: 'Plant <span class="c">sapling</span>', act: { c: 'plant', x: t.x, y: t.y }, red: 1 }, { html: 'Examine <span class="c">stump</span>', fn: () => hud.chat('A felled tree. A sapling set here grows back into the tree.', 'sys') }];
          return [{ html: 'Examine <span class="c">stump</span>', fn: () => hud.chat('A felled tree.', 'sys') }];
        }
        if (t.kind === 'plant') {
          const young = core.plantYoung && core.plantYoung(t.x, t.y);
          if (young) return [{ html: 'Pick up <span class="c">sapling</span>', act: { c: 'unplant', x: t.x, y: t.y }, red: 1 }, { html: 'Examine <span class="c">sapling</span>', fn: () => hud.chat('A sapling, not yet rooted. You can pick it up for an hour. In grass, after that, it grows into a tree and stays.', 'sys') }];
          return [{ html: 'Examine <span class="c">sapling</span>', fn: () => hud.chat('The shoot has rooted.', 'sys') }];
        }
        return [];
      }
      function aimAct(t) {
        const u = me.using, it = u && me.inv[u.slot];
        if (!it || it.id !== u.id) return null;
        const d = core.item(it.id), esc = s => String(s).replace(/</g, '&lt;');
        let x = null, y = null;
        if (t.kind === 'ground' || t.kind === 'plant' || t.kind === 'passage' || t.kind === 'stump') { x = t.x; y = t.y; }
        else if (t.kind === 'node') { const n = core.nodeAt(t.i); if (n) { x = n.x; y = n.y; } }
        else if (t.kind === 'npc') { const n = NPCN[t.id]; if (n) { x = n.x; y = n.y; } }
        else if (t.kind === 'mob') { const m = core.mobByUid(t.uid); if (m) { x = m.x; y = m.y; } }
        else if (t.kind === 'item') { const g = core.S.ground.find(q => q.uid === t.uid); if (g) { x = g.x; y = g.y; } }
        if (x == null) return null;
        if (core.isSapling && core.isSapling(it.id)) {
          if (core.plantYoung && core.plantYoung(x, y)) return { html: 'Pick up <span class="c">sapling</span>', act: { c: 'unplant', x, y }, red: 1 };
          return { html: 'Plant <span class="c">' + esc(d.name.toLowerCase()) + '</span>', act: { c: 'plant', x, y }, red: 1 };
        }
        if (d.tool && t.kind === 'node') return { html: 'Use <span class="o">' + esc(d.name) + '</span>', act: { c: 'gather', x, y }, red: 1 };
        return { html: 'Use <span class="o">' + esc(d.name) + '</span>', act: { c: 'useon', x, y }, red: 1 };
      }
      function optionsFor(t) {
        const opts = optionsForRaw(t), a = aimAct(t);
        if (!a) return opts;
        return [a].concat(opts.filter(o => !o.act || (o.act.c !== 'plant' && o.act.c !== 'unplant' && o.act.c !== a.act.c)));
      }
      function doAct(o, sx, sy) { if (o.act) { send(o.act); if (o.then) o.then(); if (sx != null) { const r = host.getBoundingClientRect(); hud.marker(sx - r.left, sy - r.top, o.red); } if (o.act.c === 'walk') flag = [o.act.x, o.act.y]; else flag = null; } else if (o.fn) o.fn(); }
      let flag = null;
      /* The operator: "a single click should make the character walk, a double click should make the character run". The first
         tap starts walking at once; a second tap within 300 ms near the same spot upgrades the same move to a run.
         @yourfirstname (AV16, via a tester 2026-10-03): "run as a toggle; holding shift does the opposite while held",
         so a plain click obeys the Run setting and a second click means run, and Shift flips whichever it was about to
         do. The toggle is a setting and defaults off, so the default stays exactly what it was: one click walks. */
      let lastTap = null, shiftHeld = false;
      const runFor = (base) => shiftHeld ? !base : base;   /* Shift inverts whatever the click would otherwise do */
      function tapAt(cx, cy) {
        if (FE && FE.tap(cx, cy)) return;   /* [Claude 2026-10-16] seated at a Fortune Engine: only its reels, lever, slot and knobs */
        const now = performance.now();
        if (lastTap && now - lastTap.t < 300 && Math.hypot(cx - lastTap.x, cy - lastTap.y) < 40 && lastTap.act) {
          const up = Object.assign({}, lastTap.act, { run: runFor(true) }); lastTap = null; send(up); hud.hideMenu(); return;
        }
        const ts = targetsAt(cx, cy).filter(t => t.kind !== 'remote' && t.kind !== 'pet' && t.kind !== 'decor'); if (!ts.length) {   /* scenery is examined from the menu; a click on it walks you there; a pet only in the long-press menu */ const g = groundAt(cx, cy); if (g) ts.push({ kind: 'ground', x: g.x, y: g.y }); else return; }
        const o = optionsFor(ts[0])[0];
        if (o) { if (o.act) o.act = Object.assign({}, o.act, { run: runFor(!!settings.runToggle) }); doAct(o, cx, cy); lastTap = { t: now, x: cx, y: cy, act: o.act || null }; }
        hud.hideMenu();
      }
      function menuAt(cx, cy) {
        const ts = targetsAt(cx, cy), list = [];
        MENU_MODE = true; try { for (const t of ts) for (const o of optionsFor(t)) list.push(o); } finally { MENU_MODE = false; }
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
      function send(c) { if (c && c.c === 'sit' && MYPK) c.pk = MYPK; if (follow) { follow = null; hud.chat('You stop following.', 'sys'); } core.cmd(PID, c); if (c.c === 'walk' || c.c === 'attack' || c.c === 'npc' || c.c === 'take' || c.c === 'gather') { hud.closeShop(); if (hud.closeChest) hud.closeChest(); } sfx('click'); }

      /* ---------- input: touch (tap / drag / pinch / long-press), mouse, wheel, keys */
      const ptrs = new Map(); let pinch = null, suppressTap = false, lpTimer = null, lpFired = false;
      canvas.addEventListener('contextmenu', e => { e.preventDefault(); menuAt(e.clientX, e.clientY); });
      /* a long press ANYWHERE in the game is ours (2026-10-08: on Android it opened the browser's own page menu - Back, Reload,
         Share - when it landed on a HUD layer over the view): the browser menu only in a text box */
      document.addEventListener('contextmenu', e => { const t = e.target; if (!(t && /^(INPUT|TEXTAREA)$/.test(t.tagName))) e.preventDefault(); }, true);
      { const st = document.createElement('style'); st.textContent = 'html,body,#ash{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}input,textarea{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}'; document.head.appendChild(st); }   /* no callout or text selection on a long press (the launcher's page is fixed, so this comes with the engine) */
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
        if (rotating) { clearTimeout(lpTimer); if (cam.mode === 'fortune' && FE && FE.look(dx, dy)) { /* [Claude 2026-10-16] seated at a Fortune Engine: the head turns */ } else if (cam.mode === 'chess' && CHESSV) CHESS_TURN = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, CHESS_TURN - dx * 0.006));   /* [Claude] seated at chess: press and drag turns the view round the board, a quarter turn each way (the operator) */
          else { cam.tyaw -= dx * 0.0085; cam.tpitch += dy * 0.006; } }
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
      const remotes = new Map(), PK_ADDR = new Map(); let room = null, roomZone = null, netT = 0, joining = false, retryAt = 0;
      /* CONNECTION WATCH (2026-10-06: "When a player loses connection to the server, they should be notified so they
         don't continue to play on a broken server"). A room can die without ever saying 'closed' (the arcade node restarts
         and the page's link to it never comes back): then you play on alone and nobody sees you. Signs, all from what the
         game already does: our own sends keep failing; or other players are in the room (every game sends at least a 1 Hz
         heartbeat) and none has been heard from for 45 s - that one first reconnects quietly, since a friend's tab in the
         background goes quiet too. A loud loss shows the HUD's connection banner (Reload) until the room is back. */
      const NW = { heard: 0, fails: 0, lost: false, was: false, quiet: 0, quietTry: false, tries: 0 };
      function netDrop(why, loud) {
        const old = room; room = null; core.setOnline(false); coreCall(() => core.chessLimbo(PID)); dropRemotes(true); hosts.clear(); passive = false; applyAuth(); hud.setOnline(false);
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
      const label = (name, from) => from && from.tag ? '@' + from.tag : (/^@/.test(String(name || '')) ? name : '@guest');   /* [Claude 2026-10-15] the operator: "Their name should be there @handle only ... There's no need for two names" - the @tag the arcade node stamps */
      /* a player's total level above the name over their head (2026-10-05) */
      const setTag = (el, name, from, total) => { const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); el.innerHTML = (total ? '<span class="tl">Total level ' + total + '</span><br>' : '') + esc(label(name, from)); };
      /* A name is told once, in the gear message at a join or an equip. A remote that goes quiet for 12 s is dropped
         and built again from the next message about it, which is normally a bare position - and the rebuilt one came
         out wearing the default "Adventurer" for good, because nothing re-tells the name. The last name heard for an
         id is kept here so a rebuild starts from what was already learned about that player. */
      const knewName = new Map();
      /* A PARTNER WHO DROPS OUT OF A SHARED CANOE (2026-10-08: "their avatar should continue to travel with the canoe ... if
         somebody goes off-line on accident while traveling with another player, they don't get lost"): they stay seated in the bow
         and travel on; if it was the one steering, the other takes the stern. This game tells the @ashvale Bank where it carries
         them (and where it puts them ashore), so when they come back they are in the canoe - or on the bank where it landed. */
      const CARRIED = { by: null, x: 0, y: 0 };   /* set when the Bank says another player's canoe carried you while you were away */
      function carriedAsk() { bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'carried?', v: 1 }); }); }
      setTimeout(carriedAsk, 9000);
      const ghostable = (r, id) => (r.boat === 2 && r.ride === myNetId && me.boat === 1) || (me.boat === 2 && me.ride === id && r.boat === 1);
      function carryTell(r, on) { const who = r.from && r.from.address; if (!who) return; bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'carry', v: 1, who, x: me.x, y: me.y, on: on ? 1 : 0 }); }); }
      function carriedHeard(d) {   /* newer than this game's save: you went on in a friend's canoe after you dropped out */
        const at = (+d.at || 0) * 1000, mine = (save && save.at) || 0; if (d.none || !(at > mine) || Date.now() - at > 7 * 24 * 3600 * 1000) return;
        const x = d.x | 0, y = d.y | 0;
        if (d.on && d.by) { CARRIED.by = d.by; CARRIED.x = x; CARRIED.y = y; setTimeout(() => { if (CARRIED.by) { CARRIED.by = null; landNear(x, y); } }, 60000); hud.chat('You dropped out while out in a canoe. Looking for it...', 'sys'); }   /* in the canoe: rejoin it if it is near, else ashore */
        else landNear(x, y);
      }
      function landNear(x, y) {   /* the nearest ground you can stand on (the bank where the canoe put you ashore) */
        for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const tx = x + dx, ty = y + dy;
          if (core.M.inWorld && !core.M.inWorld(tx, ty)) continue; if (!core.M.blocked(tx, ty) && !/[~vJB]/.test(core.M.tileAt(tx, ty))) { me.x = tx; me.y = ty; me.path = []; place(myEnt, tx, ty); cam.snap = true; streamRegions(); hud.chat('You are on the bank where the canoe put you ashore.', 'sys'); return; } }
      }
      function makeGhost(id, r) {
        r.offline = { told: performance.now() }; const nm = r.name || 'Your partner';
        if (me.boat === 2) { coreCall(() => { me.boat = 1; me.ride = null; me.knock = false; me.path = []; }); hud.chat(nm + ' has dropped out of the game. You take the stern and steer; they ride on with you.', 'sys'); }
        else hud.chat(nm + ' has dropped out of the game. They stay in the bow and travel on with you.', 'sys');
        r.boat = 2; r.ride = myNetId; r.knock = false; r.anim = 'sit'; r.e.H.play('sit', { loop: true });
        if (core.S.players[id] && core.S.players[id].puppet) coreCall(() => core.removePlayer(id));   /* [Claude 2026-10-14] through coreCall: a seat it stands up tells the Bank */
        carryTell(r, 1);
      }
      function ghostTick(id, r, now) {
        if (me.boat !== 1) { carryTell(r, 0); hud.chat((r.name || 'Your partner') + ' is left on the bank here until they come back.', 'sys'); dropRemote(id, true); return; }   /* ashore: they wait on the bank */
        if (now - r.offline.told > 15000) { r.offline.told = now; carryTell(r, 1); }
      }
      function dropRemote(id, hard, keep) { const r = remotes.get(id); if (PET) PET.drop(id);
        if (!hard && r && !r.offline && ghostable(r, id)) { makeGhost(id, r); return; } if (r) { if (r.name && r.name !== 'Adventurer') knewName.set(id, r.name); removeEnt(r.e); remotes.delete(id); } if (core.S.players[id] && core.S.players[id].puppet) coreCall(() => core.removePlayer(id, keep)); }   /* [Claude 2026-10-14] coreCall: its events (a card-table cashout to the Bank) are handled, not lost */
      function dropRemotes(keep) { for (const id of Array.from(remotes.keys())) dropRemote(id, false, keep); }   /* keep [Claude 2026-10-12]: OUR room dropped - their chess seats wait for the host's word */
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
        const R = room; room = null; core.setOnline(false); coreCall(() => core.chessLimbo(PID)); dropRemotes(true); hud.setOnline(false); if (R) R.leave();
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
        const say = claim => { if (ONE.room === R && !stopped) { ONE.said = Date.now(); R.send(withHome({ t: 'dev', s: ONE.sid, at: ONE.at, claim: !!claim })); } };
        R.on('message', ev => {
          const m = ev.data || {};
          if (!stopped && m.t === 'dm' && ev.from && ev.from.address && ev.from.address !== who.address && !ev.from.guest && typeof m.text === 'string') {   /* a direct message to us */
            hud.chat('From ' + (ev.from.tag ? '@' + ev.from.tag : ev.from.address.slice(0, 8) + '...') + ': ' + m.text.slice(0, 120), 'dm'); sfx('click'); return;
          }
          if (stopped || m.t !== 'dev' || m.s === ONE.sid || !ev.from || ev.from.address !== who.address || !homeIs(m)) return;   /* the other character on this wallet is not another device */
          /* the newest session wins on its start time alone (2026-10-08): a 'claim' only says "I just opened" - a stale one (a
             replay, a game that opened before us) must not stop a newer game, which is what kept stopping @cinderwalker */
          if (m.at > ONE.at || (m.at === ONE.at && String(m.s) > ONE.sid)) { G.__evictedBy = { s: m.s, at: m.at, claim: !!m.claim, ours: ONE.at, from: ev.from && (ev.from.id || ev.from.address) }; try { console.warn('ASHVALE: stopped by a newer session', JSON.stringify(G.__evictedBy)); } catch (e) { /* no console */ } evicted(); }
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
        if (stopped || !VER.mine || VER.told || !/^https?:/.test(location.protocol) || !(G.arcade || G.ASH3D_VERCHECK)) return;   /* only on the arcade, which has /r/inscriptions (a page served elsewhere got a 404 every 3 min); tests set ASH3D_VERCHECK */
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
          if (room) { const old = room; room = null; try { const st = stateMsg(performance.now()); st.p = [me.x + 0.5, me.y + 0.5]; old.send(st); } catch (e) { /* gone */ } dropRemotes(true); hosts.clear(); applyAuth(); await old.leave(); }   /* a last word where I am now: whoever rides in my canoe follows me across
          hosts.clear(); electedOnce = false; myJoin = Date.now(); joinedAt = performance.now(); passive = true; applyAuth();   /* passive until the hosts are known */
          const res = await net.join(z, { game: 'ashvale', loopback: q.has('loopback') });
          hud.setOnline(!!(res && res.online));
          if (res && res.online) { NW.heard = performance.now(); NW.fails = 0; NW.was = true; NW.quietTry = false; if (NW.lost) { NW.lost = false; hud.netLost && hud.netLost(false); hud.chat('Back in touch with other players.', 'sys'); } }
          else if (NW.was && (NW.lost || NW.quietTry)) { NW.quietTry = false; NW.tries++; if (!NW.lost) NW.lost = true; hud.netLost && hud.netLost(true, 'net', 'the arcade is not answering' + (NW.tries > 2 ? ': reload the page' : ', still trying')); }
          if (res && res.online && core.regionOf(me.x, me.y) === z) {
            const R = res.room; room = R; myNetId = R.me.id; core.setOnline(true); oneDevice(R.me); netStatus = res.backend + ' as ' + (R.me.tag ? '@' + R.me.tag : 'guest');
            boardTag();
            { let h = 2166136261; for (let i = 0; i < myNetId.length; i++) h = Math.imul(h ^ myNetId.charCodeAt(i), 16777619) >>> 0; core.uidSpace(1 + h % 4095); }   /* my own uid space for things I create as a host */
            R.on('message', ev => { if (room === R) onNet(ev); });
            R.on('message', () => { if (room === R) NW.heard = performance.now(); }); R.on('join', () => { if (room === R) NW.heard = performance.now(); }); R.on('leave', () => { if (room === R) NW.heard = performance.now(); });
            R.on('leave', ev => { if (room !== R) return; dropRemote(ev.from.id); elect(); });
            R.on('join', () => { if (room !== R) return; clearTimeout(gearT); gearT = setTimeout(() => { netGear(); if (hosted.size) fullSnap(); }, 600); });   /* newcomers missed our gear/outfit/name: send it again (one resend for a burst of joins) */
            R.on('rejoined', () => { if (room !== R) return; NW.heard = performance.now(); clearTimeout(gearT); gearT = setTimeout(() => { netGear(); if (hosted.size) fullSnap(); }, 600); });   /* [Claude 2026-10-13] the arcade seated us again after a drop: the others rebuilt us bare, so send our gear/outfit/name (and what we host) again */
            R.on('closed', why => { if (room !== R) return; room = null; core.setOnline(false); coreCall(() => core.chessLimbo(PID)); dropRemotes(true); hosts.clear(); passive = false; applyAuth(); hud.setOnline(false); NW.lost = true; NW.tries = 0; hud.netLost && hud.netLost(true, 'net', why || ''); hud.chat('Lost contact with other players' + (why ? ' (' + why + ')' : '') + '. Retrying soon.', 'sys'); retryAt = performance.now() + 15000; });
            if (R.me && R.me.tag && me.name !== '@' + R.me.tag) { me.name = '@' + R.me.tag; hud.refresh('all'); }   /* [Claude 2026-10-15] your name is your @tag (the operator) */
            netGear();
            if (R.me && !R.me.guest && R.me.address && R.me.address !== walletState.address) { walletState.address = R.me.address; walletRefresh(); }
            if (!trade && deps.trade) trade = deps.trade.create({ host, toast: (t, k) => hud.chat(t, k || 'trade'), send: (to, obj) => netSend({ tr: obj, to }), offerable: tradeOfferable, onSettled: tradeSettled, onUndone: tradeUndone, onOffer: tellOffer, itemOf: p => { const j = p && p.json; if (!j || !allowedAsset(p)) return null; const k = j.key || ((j.attributes || []).find(a => a && a.trait_type === 'Key') || {}).value; const d = k && core.item(k); return d ? { key: k, name: d.name, icon: (() => { try { return MOD.icon(k, 64); } catch (e) { return null; } })() } : null; }, nameOf: id => { const r = remotes.get(id); return r ? label(r.name, r.from) : 'another player'; } });
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
      /* THE SEAMS OF THE OPEN GLOBE (2026-10-08: "can you fix those 11 seams?"): across a cut edge of the flat net the same ground
         lies far away in map coordinates, in another region's room. Near one, we also join the room of the ground across it (as a
         viewer, like a region border) and draw its players at their true places beside us (core.M.netNear) */
      const SEAM_NEAR = 160;
      function seamRegions(x, y) {
        if (!core.M.netAcross || !core.M.netGap) return [];
        const out = new Set();
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]]) {
          const px = Math.round(x + dx * SEAM_NEAR), py = Math.round(y + dy * SEAM_NEAR); if (core.M.netGap(px, py) <= 0) continue;
          const a = core.M.netAcross(px, py); if (a) out.add(core.regionOf(a.x, a.y));
        }
        out.delete(core.regionOf(x, y)); out.delete(roomZone); return Array.from(out);
      }
      let nbT = 0, nbPosT = 0, nbPosKey = '', nbGearT = 0, nbGearRefT = 0;
      const nb = net.neighbours ? net.neighbours({   /* region borders only with ?nb (not yet proven next to the adjacent-zones test); always the far side of a seam of the open globe */ game: 'ashvale', loopback: q.has('loopback'), max: 3, on: {
        message: (rid, ev) => onNet(ev, rid),
        join: (rid, ev) => { clearTimeout(nbGearT); nbGearT = setTimeout(nbGear, ev.self ? 0 : 600); },   /* we arrived, or somebody did: they need our look */
        leave: (rid, ev) => { const r = remotes.get(ev.from.id); if (r && r.via === rid) dropRemote(ev.from.id); },
        closed: (rid) => { for (const [id, r] of Array.from(remotes)) if (r.via === rid) dropRemote(id); }
      } }) : null;
      /* [Claude 2026-10-13] A CARD TABLE'S OWN ROOM (the operator: "would it help if we set it up so each poker table sets up its own game
         room?" - "Yup"). The arcade counts five messages a second per player PER ROOM, so a table in its own room has a budget of
         its own and its traffic reaches only those at it. A player within 8 tiles on its storey (or sitting at it) joins
         'tbl:<region>:<table>' and stays in it out to 14 tiles. Everyone in the room says when they came in (TJ); the earliest
         deals, and the core is told per table (setTableAuth) - so the dealer is whoever has been at the table longest, not the
         area's host, and a player not in the room never deals it. The rows, the sealed cards and the sit/stand/act/whole-row
         asks go through the room; a screen not in it (an older page) still uses the region room as before. Every 5 s the
         dealer sends the whole row again, with the sealed cards. Solo (no region room): the table deals at home, as before. */
      const TBL = { mem: {}, deal: {}, tj: {}, rid: {}, byRid: {}, wait: {}, ms: {}, heard: {}, tjAt: {}, t: 0, snap: 0, hi: 0 };
      const tblMem = t => TBL.mem[t] || (TBL.mem[t] = new Map());
      const tblRid = T => 'tbl:' + core.regionOf(T.x, T.y) + ':' + T.id;
      const tblSeated = t => (me.seat && me.seat.k === 'pk' && me.seat.t === t) ? 1 : 0;
      /* [Claude 2026-10-13] the dealer KEEPS the table while it is in the room (sitting down or standing up never moves the dealing);
         when it leaves, the earliest-come SEATED player takes it, else the earliest-come watcher. Everyone says whom it follows
         (TJ's 4th field), so a newcomer follows the table's dealer at once, and two who each think they deal settle on the one
         who has been in the room longest. A newcomer listens 1.5 s before it would deal itself. */
      function tblElect(t) {
        if (!TBL.tj[t]) { TBL.deal[t] = null; if (core.setTableAuth) core.setTableAuth(t, room ? false : null); return; }
        const M = tblMem(t); M.set(myNetId, { j: TBL.tj[t], s: tblSeated(t), d: TBL.deal[t] || null });
        let cur = TBL.deal[t]; if (cur && !M.has(cur)) cur = null;   /* the dealer has left the room */
        if (cur && cur !== myNetId && performance.now() - ((TBL.heard[t] || {})[cur] || TBL.tjAt[t] || 0) > 15000) { M.delete(cur); cur = null; }   /* or gone silent (a page that died: the arcade drops it only after 30 s) */
        for (const [, m] of M) if (m.d && M.has(m.d) && m.d !== cur && (!cur || M.get(m.d).j < M.get(cur).j)) cur = m.d;   /* follow the table's dealer; a clash: the longest here */
        if (!cur) {
          const R = tRoom(t), n = R && R.members ? R.members().length : M.size;
          if (performance.now() < (TBL.wait[t] || 0) && M.size < n) { TBL.deal[t] = null; if (core.setTableAuth) coreCall(() => core.setTableAuth(t, false)); return; }   /* just came in: hear the room first */
          let best = null; for (const [id, m] of M) { if (!best || (m.s > best[1].s) || (m.s === best[1].s && (m.j < best[1].j || (m.j === best[1].j && id < best[0])))) best = [id, m]; }
          cur = best ? best[0] : myNetId;
        }
        const was = TBL.deal[t]; TBL.deal[t] = cur; M.get(myNetId).d = cur;
        if (core.setTableAuth) coreCall(() => core.setTableAuth(t, cur === myNetId));
        if (was !== cur) {
          if (cur === myNetId) PKBASE[t] = null;   /* a new dealer starts its rows whole */
          else if (was && tblSeated(t) && me.seat) netSend({ PS: [t, me.seat.s | 0, 0, MYPK || ''] }, tRoom(t), 0);   /* my sealing key, for the new dealer */
          tblHello(t);
        }
      }
      const tRoom = t => { if (!TBL.tj[t] || !tbl) return null; const rid = TBL.rid[t]; return tbl.rooms().find(R => R.id === rid) || null; };
      function iDeal(T) { if (!T) return false; if (!room) return true; if (!tbl) return iHostAt(T.x, T.y); return !!TBL.tj[T.id] && TBL.deal[T.id] === myNetId; }
      function fromDealer(id, T) { if (tbl && TBL.tj[T.id]) return TBL.deal[T.id] === id; return fromHostOf(id, areaAt(T.x, T.y)); }
      function tblHello(t) { const R = tRoom(t); if (R && TBL.tj[t]) netSend({ TJ: [t, TBL.tj[t], tblSeated(t), TBL.deal[t] || null] }, R, 0); TBL.ms[t] = tblSeated(t); }
      function tblHeard(rid, ev) {
        const t = TBL.byRid[rid], from = ev.from, id = from && from.id; if (!t || !id || id === myNetId) return;
        let d = ev.data && typeof ev.data === 'object' ? ev.data : {};
        if (Array.isArray(d.BIG) && d.BIG.length === 4) {   /* a big row in pieces, put together as onNet does */
          const [bid, bi, bn, bc] = d.BIG, k = 't:' + id + ':' + bid, now = performance.now();
          if (!(bn > 0 && bn <= 64 && bi >= 0 && bi < bn && typeof bc === 'string')) return;
          for (const [kk, B] of BIGIN) if (now - B.t > 30000) BIGIN.delete(kk);
          const B = BIGIN.get(k) || { n: bn, parts: {}, t: now }; B.parts[bi] = bc; BIGIN.set(k, B);
          if (Object.keys(B.parts).length < B.n) return;
          BIGIN.delete(k); try { d = JSON.parse(Array.from({ length: B.n }, (_, j) => B.parts[j]).join('')); } catch (e) { return; }
          if (!d || typeof d !== 'object' || d.BIG) return;
        }
        (TBL.heard[t] || (TBL.heard[t] = {}))[id] = performance.now();   /* the dealer's rows and hellos keep it alive */
        if (Array.isArray(d.TJ) && String(d.TJ[0]) === t) { const j = +d.TJ[1]; if (j > 0) { const M = tblMem(t), had = M.has(id); M.set(id, { j, s: d.TJ[2] ? 1 : 0, d: typeof d.TJ[3] === 'string' ? d.TJ[3] : null }); tblElect(t); if (!had) tblHello(t); } }
        pkMsg(id, d);
      }
      const tbl = net.neighbours ? net.neighbours({ game: 'ashvale', loopback: q.has('loopback'), max: 2, on: {
        message: (rid, ev) => tblHeard(rid, ev),
        join: (rid, ev) => { const t = TBL.byRid[rid]; if (!t) return; if (ev.self) { TBL.tj[t] = Date.now(); TBL.tjAt[t] = performance.now(); TBL.wait[t] = performance.now() + 1500; tblMem(t).clear(); TBL.deal[t] = null; } tblHello(t); tblElect(t); },
        leave: (rid, ev) => { const t = TBL.byRid[rid]; if (!t || !ev.from) return; tblMem(t).delete(ev.from.id); tblElect(t); },
        closed: (rid) => { const t = TBL.byRid[rid]; if (!t) return; delete TBL.tj[t]; delete TBL.mem[t]; PKIN[t] = null; tblElect(t); }
      } }) : null;
      function tblTick(now) {
        if (!tbl || now - TBL.t < 1000) return; TBL.t = now;
        if (!room) { tbl.update([], []); for (const T of pkTablesCached()) if (core.setTableAuth) core.setTableAuth(T.id, null); return; }
        const near = [], keep = [];
        for (const T of pkTablesCached()) {
          const rid = tblRid(T); TBL.rid[T.id] = rid; TBL.byRid[rid] = T.id;
          const d = Math.max(Math.abs(T.x - me.x), Math.abs(T.y - me.y)), mine = me.seat && me.seat.t === T.id, same = (T.lv | 0) === (me.lv | 0);
          if (mine || (same && d <= 8)) near.push(rid);
          if (mine || (same && d <= 14)) keep.push(rid);
          if (!TBL.tj[T.id]) tblElect(T.id); else { tblElect(T.id); if (TBL.ms[T.id] !== tblSeated(T.id)) tblHello(T.id); }   /* re-elect (the wait ends), and say when I sit or stand */
        }
        tbl.update(near, keep);
        if (now - TBL.hi > 10000) { TBL.hi = now; for (const t in TBL.tj) if (TBL.tj[t]) { tblHello(t); if (tblSeated(t) && TBL.deal[t] && TBL.deal[t] !== myNetId && me.seat) netSend({ PS: [t, me.seat.s | 0, 0, MYPK || ''] }, tRoom(t), 2); } }   /* a late joiner hears who came in when; the dealer keeps my sealing key */
        if (now - TBL.snap > 5000) { TBL.snap = now; const seq = Math.round(now); for (const T of pkTablesCached()) if (iDeal(T) && core.pokerRow) { const st = core.pokerOf(T.id); if (st && (st.se && st.se.length || st.mine === 1)) { pkSendRow(T.id, seq); phSend(T.id, false); } } }
      }
      function netNeighbours(now) {
        if (!nb || joining || now - nbT < 1000) return; nbT = now;
        if (!room) { nb.update([], []); return; }
        const seams = seamRegions(me.x, me.y);
        nb.update((q.has('nb') ? regionsAround(me.x, me.y, NB_NEAR) : []).concat(seams), (q.has('nb') ? regionsAround(me.x, me.y, NB_KEEP) : []).concat(seams));
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
      /* [Claude 2026-10-14] a referee seed is asked for only with a wallet: a guest's ask came back 400 from /account/referee/seed
         (a console error on every guest's boot - check_live). Waits up to 10 s for the wallet to be known; without one, practice. */
      const tripBridge = (msg, kind, ms) => kind !== 'seed' ? bridge(msg, kind, ms) : new Promise(ok => {
        const t0 = Date.now(), look = () => { if (walletState.address) ok(bridge(msg, kind, ms)); else if ((room && room.me && room.me.guest) || Date.now() - t0 > 10000) ok({ error: 'no wallet: practice' }); else setTimeout(look, 500); }; look(); });
      const TRIP = deps.trip ? deps.trip.create({ core, pid: PID, ticks: (D.rules.trip || {}).ticks, bridge: tripBridge, keep: tripKeep, facts: () => { const w = walletState.data; return w ? { tokens: Object.assign({}, w.raw || {}), pieces: (w.pieces || []).slice() } : null; }, onChange: (st) => {
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
      /* ASHVALE 3D engine part: THE TOWN CHEST AND THE @ashvale BANK (split out of engine.js, 2026-10-08). The chest ledger, returns, - in its own module (src/engbank.js, 2026-10-08) */
      const ENGBANK = deps.engbank.install({ get BANK_LOAD_ROOM() { return BANK_LOAD_ROOM; }, set BANK_LOAD_ROOM(v) { BANK_LOAD_ROOM = v; }, DATA, SCENE, THREE, YOURFIRST_ADDR, net, netGear, palsHeard, D, DAY_S, MOD, PID, SEASON, SEASONS, SKYM, SUNL, SUN_EPOCH, TL, WAL, carriedHeard, core, coreCall, evicted, hud, me, proxies, proxyMat, q, scene, skyNow, sunTime, walletRefresh, walletState, waterY,
        get CLOUD() { return CLOUD; }, HOME, withHome, homeIs, get trade() { return trade; },
        get save() { return save; }, paintScores });
      const { CKEY, holdsAsk, holdSend, bank, bankRoom, boatHide, boatShow, boatTell, chestDeposit, chestEvent, chestState, chestStore, chestTake, depositInv, depositWorn, withdrawAll, depositSoon, docksShow, fellTell, ledgerDrop, ledgerFor, ledgerSave, ledgerSnap, markTell, persistTell, tradeOfferable, tradeSettled, tradeUndone, tellOffer } = ENGBANK;
      scoreTell = ENGBANK.scoreTell; scoresAsk = ENGBANK.scoresAsk;
      /* [Claude 2026-10-16] THE FORTUNE ENGINES (src/engfortune.js): seat, first-person view, the machine's taps and the Bank's words */
      FE = deps.engfortune ? deps.engfortune.install({ THREE, SCENE, core, hud, PID, ENGBANK, cam, camera, canvas, host, FPV, myEnt, send, netSend, walletRefresh, walletState, get me() { return me; }, get settings() { return settings; } }) : null;
      PET = deps.engpet ? deps.engpet.install({ THREE, scene, CHAR, footY, myEnt, netSend: o => netSendBig(o, null, 'pt' in o ? 'pet' : null),
        playOnce: (e, name) => { if (!e.dead && !e.oneShot && !e.prone && !e.held && !e.canoe) playOnce(e, name); },   /* [Claude 2026-10-18] petting: the engine's own one-shot, so the walk/idle loop comes back after it */
        groundY: (x, z, e, fy) => {   /* [Claude 2026-10-18] the pet's own ground (the operator: on a slope it sank into it); upstairs its owner's floor, a big step (a wall walk) its owner's height */
          const rr = e === myEnt ? null : remotes.get(String(e.key || '').slice(2)), lv = e === myEnt ? (me.lv | 0) : rr ? (rr.lvR | 0) : 0;
          if (lv) return fy; const h = footY(x, z); return Number.isFinite(h) && Math.abs(h - fy) < 1.5 ? h : fy;
        },
        canStand: (x, z, e) => {   /* [Claude 2026-10-18] where a pet may go: on an upper floor only inside its owner's building (the operator: it walked out through the Tap's wall and floated), on the ground nothing blocked */
          const tx = Math.floor(x), ty = Math.floor(z), o = e.root.position, rr = e === myEnt ? null : remotes.get(String(e.key || '').slice(2));
          const lv = e === myEnt ? (me.lv | 0) : rr ? (rr.lvR | 0) : 0;
          if (core.M.inWorld && !core.M.inWorld(tx, ty)) return false;
          if (lv) { const b = core.M.buildingAt ? core.M.buildingAt(Math.floor(o.x), Math.floor(o.z), lv) : -1; return b >= 0 && core.M.buildingAt(tx, ty, lv) === b; }
          return !core.M.blocked(tx, ty) || (core.M.liftAt && core.M.liftAt(tx, ty) > 0);
        },   /* [Claude 2026-10-18] a pet message carries its picture (~900 bytes): split, the newest replacing a queued one */ walletState, hud, base: arcadeBase, get settings() { return settings; }, ownerName: id => { const r = remotes.get(id); return r ? label(r.name, r.from) : ''; } }) : null;
      function boardWho() {   /* the keep board is the arcade @tag, not the default Adventurer (2026-10-10) */
        const t = (room && room.me && room.me.tag) || hintedTag || me.tag;
        if (t) { const h = String(t).replace(/^@/, '').replace(/[^\w]/g, '').slice(0, 16); if (h.length >= 2 && !/^adventurer$/i.test(h)) return '@' + h; }
        const n = String(me.name || '').replace(/[^\w -]/g, '').trim().slice(0, 12);
        return n.length >= 2 && n !== 'Adventurer' ? n : null;
      }
      function boardTag() {   /* the boards name a player by their arcade @tag (2026-10-10). The counts are the Bank's, so
         a game that loads tells the Bank nothing about itself (2026-10-12): a cleared board stays cleared. */
        const who = boardWho();
        if (who && who.charAt(0) === '@') me.tag = who.slice(1);
      }
      boardTag();
      const netStats = { sent: 0, dropped: 0, t0: performance.now(), times: [], max1s: 0, max2s: 0 };
      window.addEventListener('pagehide', () => { if (nb) nb.close(); if (tbl) tbl.close(); if (room) { const r = room; room = null; r.leave(); } });   /* [Claude 2026-10-13] the card tables' rooms too: the others elect a new dealer at once */
      let lastSend = 0;
      /* outgoing queue: never more than 5 messages in any second or 9 in any 2 s (the mesh allows ~5/s, burst 10);
         a newer pure position state replaces a queued older one */
      const outQ = [];
      /* A current attack target is part of presence, not a fire-and-forget command.  The small {A: uid} message from
         netAct still makes a click responsive, but a mesh/backend refusal used to lose that one message forever: the
         replica kept showing the player fighting while the area's host never rolled a blow.  Presence repeats A (and
         A:0) until both games agree.  It is still a replaceable state row so a busy client cannot grow the send queue. */
      const pureState = o => o.p && !o.M && !o.E && !o.F && !o.G && o.C === undefined && !o.X && !o.g && !o.o && !o.t;
      let DROP_NEXT = null;   /* tests: lose the next message carrying this key (a lost packet) */
      /* [Claude 2026-10-13] A ROOM MESSAGE IS AT MOST 500 BYTES and netSend drops a bigger one without a word. A card table's
         row grows with its players (4 players: 553, 8: 808 - the result of a hand the biggest of all) and the sealed hole
         cards with every seat, so at a full table the result never reached anyone but the dealer (the operator: "it is still
         sometimes freezing up and not showing the results of the hand to all the players"). netSendBig sends a message that
         fits as it is, and a bigger one as numbered pieces {BIG: [id, i, n, text]} that onNet puts back together. */
      let bigSeq = Math.floor(Math.random() * 1e6);
      const utf8 = s => { try { return new TextEncoder().encode(s).length; } catch (e) { return s.length * 3; } };
      /* [Claude 2026-10-13] key: a message that a newer one with the same key makes worthless (a card table's row). Before it is
         queued, whatever of an older one is still waiting is taken out of the queue - at eight players every action is a row
         of three or four pieces and the room takes five messages a second, so the queue grew without end and the other screens
         fell minutes behind the dealer: the turn sat on a player whose screen still showed someone else to act (8-window test) */
      /* [Claude 2026-10-13] THREE LANES (the operator: "Can we split it up so certain things are sent more often than others?"). The room
         takes about five messages a second from each player in it, so what goes first matters more than how much there is:
           0 urgent     what a player is waiting on: my own act (attack, pick up, sit, stand, bet, a chess move, a trade), the
                        host's events (hits, deaths, spawns, drops), a hand's sealed cards and its result
           1 normal     where everyone is: positions, monsters' places, card-table rows, chat
           2 background what is only said again: full snapshots, gear and outfit, weather
         flushNet sends the lowest lane first; whatever has waited two seconds moves up a lane, so nothing starves. */
      function netPri(o) {
        if (!o || typeof o !== 'object') return 1;
        if (o.F !== undefined || o.W || o.g || o.o || o.GQ) return 2;
        if ((o.A !== undefined && !o.p) || o.C !== undefined || o.X || o.XP || o.XF || o.XU || o.PT || o.PS || o.PA || o.PQ || o.CX || o.CT || o.CS || o.CM || o.tr || o.E || o.Ph || o.Ch) return 0;
        if (o.Pk && o.Pk.some(r => r && r.st === 'none' && r.r)) return 0;   /* a hand's result */
        return 1;
      }
      function netSendBig(o, R, key, meta) {
        let s; try { s = JSON.stringify(o); } catch (e) { return false; }
        if (key) for (let i = outQ.length - 1; i >= 0; i--) if (outQ[i].key === key) outQ.splice(i, 1);
        const pri = netPri(o);
        if (utf8(s) <= 490) { const ok = netSend(o, R, pri); if (ok && outQ.length && outQ[outQ.length - 1].o === o) { const w = outQ[outQ.length - 1]; if (key) w.key = key; if (meta) w.meta = meta; } else if (ok && meta && meta.sent) meta.sent(); return ok; }
        const id = bigSeq = (bigSeq + 1) % 1e9, parts = [];
        for (let i = 0; i < s.length;) {
          let n = Math.min(360, s.length - i);
          while (n > 20 && utf8(JSON.stringify({ BIG: [id, 999, 999, s.slice(i, i + n)] })) > 490) n -= 30;
          parts.push(s.slice(i, i + n)); i += n;
        }
        for (let i = 0; i < parts.length; i++) { const m = { BIG: [id, i, parts.length, parts[i]] }; netSend(m, R, pri); const w = outQ.find(q => q.o === m); if (w) { if (key) w.key = key; if (meta && i === parts.length - 1) w.meta = meta; } else if (meta && i === parts.length - 1 && meta.sent) meta.sent(); }
        return true;
      }
      /* A busy hosted area can change more monster rows than the room's five-message budget can drain.  Keeping every
         intermediate position made the queue minutes stale: a follower still saw a wolf at its spawn after the host had
         moved it beside the player, so the follower's pathing abandoned an otherwise valid attack.  A monster row is
         state, not an event; keep only its newest queued value.  Event fields on the same packet remain untouched. */
      function supersedeMobRows(o, R) {
        if (!o || !Array.isArray(o.M) || !o.M.length) return;
        const fresh = new Set(o.M.filter(Array.isArray).map(r => r[0]));
        for (let i = outQ.length - 1; i >= 0; i--) {
          const q = outQ[i];
          if (q.R !== R || !q.o || !Array.isArray(q.o.M)) continue;
          q.o.M = q.o.M.filter(r => !Array.isArray(r) || !fresh.has(r[0]));
          if (q.o.M.length) continue;
          delete q.o.M;
          if (pureState(q.o) || (q.o.F !== undefined && Object.keys(q.o).length === 1)) outQ.splice(i, 1);
        }
      }
      function netSend(o, R, pri) {   /* R: a neighbour room (viewer presence); default the main room. One budget for both. pri: the lane (netPri) */
        if (DROP_NEXT && o && o[DROP_NEXT] !== undefined) { DROP_NEXT = null; return; }
        if (!room) return false; R = R || null;
        try { if (new TextEncoder().encode(JSON.stringify(o)).length > 500) return false; } catch (e) { return false; }
        supersedeMobRows(o, R);
        if (pureState(o)) { const i = outQ.findIndex(w => w.R === R && pureState(w.o)); if (i >= 0) { outQ[i].o = o; return true; } }
        outQ.push({ o, R, pri: pri == null ? netPri(o) : pri, at: performance.now() }); flushNet(); return true;
      }
      function flushNet() {
        if (!room) { outQ.length = 0; return; }
        /* [Claude 2026-10-13] a budget per room (the arcade counts each room apart): five a second, nine in two, in each */
        const now = performance.now(), ok = new Map();
        const times = R => R ? (R.__t || (R.__t = [])) : netStats.times;
        const free = R => { if (ok.has(R)) return ok.get(R); const T = times(R); while (T.length && now - T[0] > 2000) T.shift(); const v = T.filter(t => now - t <= 1000).length < 5 && T.length < 9; ok.set(R, v); return v; };
        for (;;) {
          let bi = -1, bp = Infinity;   /* the lowest lane first, oldest first within it; two seconds' wait moves a message up a lane */
          for (let i = 0; i < outQ.length; i++) { const q = outQ[i]; if (!free(q.R || null)) continue; const ep = (q.pri == null ? 1 : q.pri) - Math.floor((now - (q.at || now)) / 2000); if (ep < bp) { bp = ep; bi = i; } }
          if (bi < 0) break;
          const w = outQ.splice(bi, 1)[0], T = times(w.R || null); T.push(now); ok.delete(w.R || null); if (!w.R) lastSend = now; netStats.sent++;
          if (w.meta && w.meta.sent) w.meta.sent();
          netStats.max2s = Math.max(netStats.max2s, netStats.times.length); netStats.max1s = Math.max(netStats.max1s, netStats.times.filter(t => now - t <= 1000).length);
          (w.R || room).send(w.o).then(ok2 => { if (!ok2) netStats.dropped++; if (!w.R) NW.fails = ok2 ? 0 : NW.fails + 1; }, () => { netStats.dropped++; if (!w.R) NW.fails++; });
        }
        netStats.queued = outQ.length;
      }
      const totalLevel = p => (D.rules.skills || []).reduce((a, k) => a + core.lv(p, k), 0);   /* the Skills tab's Total level */
      const NETGQ = { t: 0 };
      function netGear() { netSend({ g: gearOf(me), n: me.name, T: totalLevel(me), SK: Object.fromEntries(Object.keys(me.xp).map(k => [k, core.lv(me, k)])), ST: core.storyPoints(me), L: ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'dexterity'].map(k => core.lv(me, k)), st: me.styles }); if (PET) netSendBig({ pt: PET.desc() }, null, 'pet'); netOutfit(); }   /* [Claude 2026-10-18] the pet apart: with its picture it passed the 500-byte cap and took the whole gear message down with it */
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
        if (!room) hud.chat('(Nobody else can hear you: you are playing solo.)', 'sys'); else netSend(Object.assign({ t: text }, me.seat && me.seat.k === 'pk' ? { tb: me.seat.t } : {}));   /* tb [Claude 2026-10-13]: said at a card table - for that table only */
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
      const cleanName = n => String(n || '').replace(/[^\w@ -]/g, '').trim().slice(0, 17) || '@guest';
      function netPos(now) {
        if (!room) return;
        if (hosted.size && room) { hostSend(now); return; }
        if (now - netT < 250 || now - lastSend < 200) return;
        const p = myEnt.root.position, an = myEnt.oneShot ? myEnt.lastOne || 'idle' : myEnt.loco || 'idle', key = p.x.toFixed(2) + ',' + p.z.toFixed(2) + ',' + myEnt.yaw.toFixed(2) + ',' + an;
        if (key === lastPosKey && now - netT < 1000) return;   /* standing still: a 1 Hz heartbeat is enough */
        lastPosKey = key; netT = now;
        netSend(stateMsg(now));
      }
      let gearRefT = 0, lastPr = 0;
      function stateMsg(now) {
        const p = myEnt.root.position;
        const m = { s: Math.round(now), p: [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100], f: Math.round(myEnt.yaw * 100) / 100, a: myEnt.oneShot ? myEnt.lastOne || 'idle' : myEnt.loco || 'idle', j: myJoin, hp: me.hp, d: me.dead ? 1 : 0, k: myEnt.toolId || 0 };
        m.A = me.act && me.act.k === 'attack' ? me.act.uid : 0;   /* repeat combat intent: packet loss must not make a visible monster unattackable */
        if (HOME) m.h = HOME;   /* where I was born: until my outfit message arrives others draw me in my home's defaults */
        if (me.lv) m.l = me.lv | 0;   /* the vertical floor I stand on, including a basement below level zero */
        if (myEnt.hl) m.hl = Math.round(myEnt.hl * 100) / 100;   /* where your head is looking, up or down (first person) */
        if (me.boat) { m.bt = me.boat; if (me.boat === 2) m.rd = me.ride; if (me.boat === 1 && me.inv.some(sl => sl && sl.id === 'push_pole')) m.pl = 1; if (me.boat === 2 && me.knock) m.kn = 1; }   /* pl: a push pole aboard; kn: knocking rice in the bow */   /* in a canoe: 1 poling it, 2 riding in someone's bow (rd: whose) */
        const oh = core.overhead(me) || 0; if (oh || lastPr) { m.pr = oh; lastPr = oh; }   /* the overhead prayer, so hosts' monsters respect it and others see it */
        const cz = combatZone(); if (cz) m.c = cz;   /* the area I am fighting in, when it is not the one I stand in */
        if (now - gearRefT > 10000) { gearRefT = now; netSend({ g: gearOf(me), n: me.name }); if (myEnt.H.outfit) netSend({ o: myEnt.H.outfit }); }   /* a missed gear message left others drawn wrong, and a missed name left them called Adventurer: refresh both every 10 s, as their own small messages */
        return m;
      }
      const setKey = o => JSON.stringify(Object.keys(o || {}).filter(k => o[k] != null && o[k] !== '').sort().map(k => [k, o[k]]));
      const sameSet = (a, b) => setKey(a) === setKey(b);
      const BIGIN = new Map();
      function onNet(ev, via) {   /* via: the neighbour room it came through, if any */
        const from = ev.from, id = from.id, d = ev.data && typeof ev.data === 'object' ? ev.data : {}; let r = remotes.get(id);
        if (Array.isArray(d.BIG) && d.BIG.length === 4) {   /* [Claude 2026-10-13] a piece of a big message (netSendBig): whole, it is heard as itself */
          const [bid, bi, bn, bc] = d.BIG, k = id + ':' + bid, now = performance.now();
          if (!(bn > 0 && bn <= 64 && bi >= 0 && bi < bn && typeof bc === 'string')) return;
          for (const [kk, B] of BIGIN) if (now - B.t > 30000) BIGIN.delete(kk);
          const B = BIGIN.get(k) || { n: bn, parts: {}, t: now }; B.parts[bi] = bc; BIGIN.set(k, B);
          if (Object.keys(B.parts).length < B.n) return;
          BIGIN.delete(k); let o; try { o = JSON.parse(Array.from({ length: B.n }, (_, j) => B.parts[j]).join('')); } catch (e) { return; }
          if (o && typeof o === 'object' && !o.BIG) onNet({ from, data: o }, via);
          return;
        }
        if (id === myNetId) return;   /* ourselves, heard through another room */
        if (d.tr) { if (d.to === myNetId && trade && !via) trade.onMessage(from, d.tr); return; }   /* a trade window message, for us only */
        if (!r && !d.p && !d.g && !d.n && !d.M && !d.E && !d.F) { /* first contact carries state soon */ }
        if (r) { r.heard = performance.now(); if (r.offline) { r.offline = null; hud.chat((r.name || 'Your partner') + ' is back.', 'sys'); } }
        if (from && from.address && !from.guest) { PK_ADDR.set(id, from.address); if (PK_ADDR.size > 200) PK_ADDR.delete(PK_ADDR.keys().next().value); }   /* [Claude 2026-10-14] kept after they leave: the dealer still names a gone player's seat to the Bank */
        if (!r) { const e = makeEnt('r:' + id, MOD.humanoid({}), { kind: 'remote', id }); const nm = (from && from.tag ? '@' + from.tag : null) || knewName.get(id) || '@guest'; e.tag = hud.tag(label(nm, from)); r = { e, buf: [], anim: 'idle', name: nm, from, lastS: -1, heard: performance.now(), fullT: 0 }; remotes.set(id, r); e.root.visible = false; }
        /* a VIEWER (neighbour region): drawn, never a puppet or a host. A full member of our room wins for 3 s after its last word */
        const view = !!via || d.nb === 1;
        if (!view) { r.fullT = r.heard; r.via = null; } else if (via && !r.via && performance.now() - r.fullT > 3000) r.via = via;
        r.viewOnly = performance.now() - r.fullT > 3000;
        /* compare with what is DRAWN, not with the last message: each setGear rebuilds the model, and a model that went
           wrong (a missed message) must be corrected by the 10 s refresh */
        if (d.g && typeof d.g === 'object' && sameSet(d.g, r.e.H.gear) === false) r.e.H.setGear(d.g);
        if (d.g && typeof d.g === 'object') hawkify(r.e, d.g.ring);   /* another player's hawk ring */
        if ('pt' in d && PET) PET.net(id, d.pt, r.e);   /* [Claude 2026-10-17] their pet dog */
        if (d.ptp && PET && PET.petted) PET.petted(id);   /* [Claude 2026-10-18] they petted their dog: hearts over it here too */
        if (d.o && typeof d.o === 'object' && r.e.H.setOutfit && sameSet(d.o, r.e.H.outfit || {}) === false) { r.e.H.setOutfit(d.o); r.dressed = 1; }
        else if (!r.dressed && typeof d.h === 'string' && d.h !== r.home && r.e.H.setOutfit) { r.home = d.h; const L = homeLook(d.h); if (L) r.e.H.setOutfit(L); }   /* no outfit heard yet: their home's defaults */
        if (Array.isArray(d.p) && typeof d.a === 'string') { r.boat = d.bt | 0; r.ride = d.rd || null; r.pole = !!d.pl; r.knock = !!d.kn; r.hl = isFinite(+d.hl) ? Math.max(-1.5, Math.min(1.5, +d.hl)) : 0; }
        if ('k' in d) { const tl = typeof d.k === 'string' && /^[a-z0-9_]{1,24}$/.test(d.k) ? d.k : null; if (tl !== r.tool) { r.tool = tl; r.e.H.setTool && r.e.H.setTool(tl); } }
        if (d.T != null) r.total = Math.max(0, Math.min(9999, d.T | 0));
        if (d.n || d.T != null) { if (d.n) { r.name = from && from.tag ? '@' + from.tag : cleanName(d.n);   /* the arcade's stamp, not what the game says */ if (core.S.players[id]) core.setPuppet(id, { n: r.name }); } if (r.e.tag) setTag(r.e.tag, r.name, from, r.total); }
        /* [Claude 2026-10-13] the operator: "when sitting at a poker table chat should be visible between those players at the table
           only. Not the whole town or next table": a word said at a card table reaches that table only, and a player sitting
           at one hears only it. The speaker's table is its own word (tb), or else where this game's rows seat it. */
        const tbOf = () => { if (typeof d.tb === 'string') return d.tb; for (const T of core.pokerTables()) { const st = core.S.poker[T.id]; if (st && (st.se || []).some(x => x[1] === id)) return T.id; } return null; };
        const myTb = me.seat && me.seat.k === 'pk' ? me.seat.t : null;
        if (typeof d.t === 'string' && d.t.trim() && (myTb || typeof d.tb === 'string' || tbOf()) && tbOf() !== myTb) { /* not for this table: unheard */ }
        else if (typeof d.t === 'string' && d.t.trim()) {
          /* chat is heard only near the speaker (2026-10-06: "only visible to players within a certain radius of each
             other ... doesn't reach all the way from Saltmere to Ashvale"): rules.chat.radius tiles, default 40 */
          const lp = Array.isArray(d.p) && isFinite(d.p[0]) ? { x: +d.p[0], z: +d.p[1] } : r.buf[r.buf.length - 1], CR = (DATA.rules && DATA.rules.chat && DATA.rules.chat.radius) || 40;
          if (lp && Math.max(Math.abs(Math.floor(lp.x) - me.x), Math.abs(Math.floor(lp.z) - me.y)) <= CR) { const t = d.t.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120); hud.chat(label(r.name, from) + ': ' + t, 'player'); speak(r.e, t); }
        }
        if (!r.viewOnly) shared(id, r, d);
        if (Array.isArray(d.p) && d.p.length === 2 && isFinite(d.p[0]) && isFinite(d.p[1])) {
          if (typeof d.s === 'number') { if (d.s <= r.lastS && d.s > r.lastS - 60000) return; r.lastS = d.s; }   /* unordered delivery: drop older states */
          if (core.S.players[id]) core.setPuppet(id, Object.assign({ x: Math.floor(+d.p[0]), y: Math.floor(+d.p[1]), lv: d.l | 0 }, typeof d.a === 'string' ? { bt: d.bt | 0, rd: d.rd || null, pl: d.pl ? 1 : 0, kn: d.kn ? 1 : 0 } : {}));   /* only a full state says whether they are in a canoe */
          r.area = core.areaOf(Math.floor(+d.p[0]), Math.floor(+d.p[1])); r.carea = typeof d.c === 'string' ? d.c.slice(0, 40) : null;
          if (r.buf.length) { const lb = r.buf[r.buf.length - 1]; if (Math.abs(lb.x - +d.p[0]) + Math.abs(lb.z - +d.p[1]) > 60) r.buf.length = 0; }   /* they crossed a cut edge of the net (or a portal): no sliding across the map */
          if (!r.floorHid) r.e.root.visible = true; const arr = performance.now();
          /* [Claude 2026-10-14] the operator: "their walking animation is not matching up with their movement ... it looks like they ski to
             their final position". Samples were laid out by when they ARRIVED, and the send lanes deliver in bursts, so the drawn
             path sped up and stalled. Lay them out by when the sender SENT them (d.s, its own clock) shifted onto ours by the
             quickest delivery seen (r.off); r.jit (how late the rest run) widens the render delay so a burst is ridden out. */
          let tt = arr;
          if (typeof d.s === 'number' && isFinite(d.s)) { const est = arr - d.s; if (r.off == null || Math.abs(est - r.off) > 5000) { r.off = est; r.jit = 0; } else r.off = Math.min(est, r.off + 2); r.jit = Math.max((r.jit || 0) * 0.98, est - r.off); tt = d.s + r.off; }
          r.buf.push({ t: tt, x: +d.p[0], z: +d.p[1], f: +d.f || 0, a: typeof d.a === 'string' ? d.a.slice(0, 12) : 'idle', l: d.l | 0 }); if (r.buf.length > 20) r.buf.shift();
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
      const netRow = r => Object.assign({}, r, { w: r.w ? toNet(r.w) : null, b: r.b ? toNet(r.b) : null, paid: r.paid ? Object.fromEntries(Object.entries(r.paid).map(([k, v]) => [toNet(k), v])) : null, co: (r.co || []).map(c => [toNet(c[0]), c[1], c[2]]) });   /* a chess row with the room's ids for the players (and who is owed the stake [Claude]) */
      /* A poker row names its players in one place, the seat rows [ref, id, chips, bet, flags]. The cards beside them
         (hc) are references into those rows, not ids, so they need nothing. */
      const pkNet = r => {   /* the dealer's row for the wire: ids as the room knows them; a keyed seat's cards are NOT here (they go sealed, by Ph) */
        const keys = core.pokerSeatKeys ? core.pokerSeatKeys(r.t) : {}, hc = [], want = [];
        for (const h of r.hc || []) {
          const ref = h[0] | 0, pk = keys[ref];
          if (!pk || !SUBTLE || !MYKEY || typeof h[1] !== 'number') { hc.push(h); continue; }   /* no key: plain, as before, this seat only */
          hc.push([ref, null, null]); want.push([ref, h[1], h[2], pk]);
        }
        if (want.length) {   /* the sealed set for this hand, built once; when every seat is in, Ph goes out */
          const P = PH[r.t] && PH[r.t].h === (r.h | 0) && PH[r.t].sig === want.map(w => w[0] + ':' + w[3].slice(0, 8)).join(',') ? PH[r.t] : (PH[r.t] = { h: r.h | 0, sig: want.map(w => w[0] + ':' + w[3].slice(0, 8)).join(','), items: [], done: false });
          for (const [ref, c1, c2, pk] of want) {
            if (P.items.some(i => i[0] === ref)) continue;
            const k = r.t + '|' + (r.h | 0) + '|' + ref;
            if (!SEALING.has(k)) { SEALING.add(k); sealCards(r.t, r.h | 0, ref, c1, c2, pk).then(b => { if (PH[r.t] === P && !P.items.some(i => i[0] === ref)) { P.items.push([ref, b]); if (P.items.length >= want.length) { P.done = true; phSend(r.t, true); } } }).catch(e => console.warn('seal', e)).finally(() => SEALING.delete(k)); }
          }
        } else delete PH[r.t];
        return Object.assign({}, r, { se: (r.se || []).map(s => [s[0], toNet(s[1]), s[2], s[3], s[4], s[5] | 0]), co: (r.co || []).map(c => [toNet(c[0]), c[1], c[2]]), hc: r.hc ? hc : r.hc });
      };
      /* [Claude 2026-10-13] A TABLE ROW AS CHANGES (the operator: build "two" - fit more into each message). At eight players a full row is
         ~800 bytes, three or four pieces for every bet. The dealer now sends what changed since the row it last put on the wire
         (PKBASE): the fields that differ, the seats whose stack/bet/flags moved (sd), the new log lines only (la). A delta says
         which version it is built on (pv); a screen holding that version merges it (PKIN), any other asks for the whole row
         (PQ) and waits - the whole row also goes out every five seconds with the snapshot, and whenever a delta would not be
         much smaller. */
      const PKBASE = {}, PKIN = {}, PKQ = {};
      const CHIN = {};   /* [Claude 2026-10-14] per chess table: who sent the newest row and its v */
      function pkDelta(base, full) {
        if (!base || base.t !== full.t || (base.gid | 0) !== (full.gid | 0) || base.v == null) return null;
        const d = { t: full.t, v: full.v, pv: base.v, D: 1 }, rm = [];
        for (const k in full) {
          if (k === 't' || k === 'v') continue;
          if (JSON.stringify(full[k]) === JSON.stringify(base[k])) continue;
          if (k === 'se' && Array.isArray(base.se) && Array.isArray(full.se) && base.se.length === full.se.length && full.se.every((x, i) => x[0] === base.se[i][0] && x[1] === base.se[i][1] && (x[5] | 0) === (base.se[i][5] | 0))) {
            d.sd = []; full.se.forEach((x, i) => { if (JSON.stringify(x) !== JSON.stringify(base.se[i])) d.sd.push([i, x[2], x[3], x[4]]); }); continue;
          }
          if (k === 'lg' && Array.isArray(base.lg) && Array.isArray(full.lg) && (full.lc | 0) > (base.lc | 0)) {
            const n = (full.lc | 0) - (base.lc | 0), keep = full.lg.length - n;
            if (n <= full.lg.length && keep <= base.lg.length && JSON.stringify(full.lg.slice(0, keep)) === JSON.stringify(base.lg.slice(base.lg.length - keep))) { d.la = full.lg.slice(keep); d.ln = full.lg.length; continue; }
          }
          d[k] = full[k];
        }
        for (const k in base) if (!(k in full)) rm.push(k);
        if (rm.length) d.rm = rm;
        return d;
      }
      function pkMerge(base, d) {
        const r = Object.assign({}, base);
        for (const k in d) if (!['D', 'pv', 'sd', 'la', 'ln', 'rm'].includes(k)) r[k] = d[k];
        if (d.sd) { r.se = (base.se || []).map(x => x.slice()); for (const [i, c, b, f] of d.sd) if (r.se[i]) { r.se[i][2] = c; r.se[i][3] = b; r.se[i][4] = f; } }
        if (d.la) r.lg = (base.lg || []).concat(d.la).slice(-(d.ln || 6));
        for (const k of d.rm || []) delete r[k];
        return r;
      }
      function pkSendRow(t, F, whole) {   /* the dealer's row for table t: a delta when it pays, else whole. F: the snapshot's seq (whole, background) */
        const full = pkNet(core.pokerRow(t)), sizeF = utf8(JSON.stringify(full)), meta = { sent: () => { const b = PKBASE[t]; if (!b || (b.gid | 0) !== (full.gid | 0) || (full.v | 0) >= (b.v | 0)) PKBASE[t] = full; } };   /* never back to an older row (the lanes can send a resend after a newer delta) */
        if (F != null) return netSendBig({ F, Pk: [full] }, tRoom(t), 'pkF:' + t, meta);
        const d = pkDelta(PKBASE[t], full), res = full.st === 'none' && full.r;
        const msg = !whole && d && utf8(JSON.stringify(d)) < sizeF * 0.8 ? d : full;
        return netSendBig({ Pk: [msg] }, tRoom(t), res ? null : 'pk:' + t, meta);   /* a hand's result is never dropped for a newer row */
      }
      function pkHeard(id, rows) {   /* rows from the dealer, in wire form: deltas merged onto what this screen holds */
        const out = [];
        for (let r of rows) {
          if (r.D) {
            const b = PKIN[r.t];
            if (!b || b.v !== r.pv) { const now = performance.now(); if (now - (PKQ[r.t] || 0) > 2000) { PKQ[r.t] = now; netSend({ PQ: r.t }, tRoom(r.t)); } continue; }   /* missed one: ask for the whole row */
            r = pkMerge(b, r); delete r.D;
          }
          const h = PKIN[r.t];   /* [Claude 2026-10-13] an older whole row from the same dealer (the 5 s resend waits in the background lane and can land after newer deltas): not a step back */
          if (!r.D && h && h.from === id && (h.gid | 0) === (r.gid | 0) && (r.v | 0) < (h.v | 0)) continue;
          r.from = id; PKIN[r.t] = r; out.push(Object.assign({}, r, { from: undefined }));
        }
        return out;
      }
      function pkMsg(id, d) {   /* a card table's words, from the region room or the table's own room */
        if (Array.isArray(d.PS)) { const T = core.pokerTableById(String(d.PS[0])); if (T && iDeal(T)) coreCall(() => core.hostPokerSit(id, T.id, d.PS[1] | 0, d.PS[2] | 0, typeof d.PS[3] === 'string' ? d.PS[3].slice(0, 160) : '')); }
        if (Array.isArray(d.PT)) { const T = core.pokerTableById(String(d.PT[0])); if (T && iDeal(T)) coreCall(() => core.hostPokerStand(id, T.id)); }
        if (Array.isArray(d.PA)) { const T = core.pokerTableById(String(d.PA[0])); if (T && iDeal(T)) coreCall(() => core.hostPokerAct(id, T.id, String(d.PA[1] || ''), d.PA[2] | 0)); }
        if (Array.isArray(d.Ph) && d.Ph.length === 4) { const T = core.pokerTableById(String(d.Ph[0])); if (T && fromDealer(id, T)) phHeard(T.id, d.Ph[1] | 0, d.Ph[2], d.Ph[3]); }   /* [Claude 2026-10-12] the sealed hole cards */
        if (Array.isArray(d.Pk)) { const rows = d.Pk.filter(r => r && r.t).filter(r => { const T = core.pokerTableById(String(r.t)); return T && fromDealer(id, T); }); const rows2 = pkHeard(id, rows).map(pkLocal); if (rows2.length) coreCall(() => core.applyPoker(rows2)); }
        if (d.PQ != null) { const T = core.pokerTableById(String(d.PQ)); if (T && iDeal(T)) pkSendRow(T.id, null, true); }   /* [Claude 2026-10-13] a screen missed a delta: the whole row */
      }
      const OPENED2 = new Map();   /* my own two, opened, by table|hand|seat */
      function openOwn(r, h) { const ref = h[0] | 0; if (typeof h[1] === 'number') return h; const o = OPENED2.get(r.t + '|' + (r.h | 0) + '|' + ref); return o ? [ref, o[0], o[1]] : [ref, null, null]; }
      function phHeard(t, h, hk, items) {   /* the dealer's sealed set: open mine, hand it to the core */
        if (!SUBTLE || !MYKEY || !(me.seat && me.seat.k === 'pk' && me.seat.t === t)) return;
        const ref = me.seat.s | 0, it = (items || []).find(i => (i[0] | 0) === ref); if (!it || typeof it[1] !== 'string') return;
        const k = t + '|' + (h | 0) + '|' + ref; if (OPENED2.has(k) || SEALING.has(k)) return;
        SEALING.add(k); openCards(t, h | 0, ref, it[1], String(hk)).then(c => { OPENED2.set(k, c); bounded(OPENED2, 64); if (core.pokerOpen) coreCall(() => core.pokerOpen(t, ref, c[0], c[1])); }).catch(e => console.warn('open', e)).finally(() => SEALING.delete(k));
      }
      const pkLocal = r => {   /* the room hears everything, so a hole card is dropped here, on the way in: a replica
                                  keeps faces only for its own seat, and a shown-down hand is public anyway. It says
                                  nothing about the wire - see handoff/poker_plan.md decision 4. */
        const se = (r.se || []).map(s => [s[0], fromNet(s[1]), s[2], s[3], s[4], s[5] | 0]), co = (r.co || []).map(c => [fromNet(c[0]), c[1], c[2]]);   /* [Claude] the cashouts name players as this page knows them */
        const mine = {};   /* my chair at that table, as the row names it - a room can hold two players both called "me" */
        for (const s of se) if (s[1] === PID || (me.seat && me.seat.k === 'pk' && me.seat.t === r.t && (s[0] | 0) === (me.seat.s | 0))) mine[s[0] | 0] = 1;
        return Object.assign({}, r, { se, co, hc: r.hc ? r.hc.map(h => mine[h[0] | 0] ? openOwn(r, h) : [h[0] | 0, null, null]) : r.hc });   /* [Claude 2026-10-12] mine opened, the rest were never readable */
      };
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
        if (e.e === 'xdrop') { if (iHostAt(e.x, e.y)) core.hostDrop(e); else netSend({ X: [e.id, e.n, e.x, e.y, e.life || 300, e.from ? toNet(e.from) : 0, e.diedAt || 0, e.lv | 0] }); return; }
        if (e.e === 'xplant') { if (iHostAt(e.x, e.y)) core.hostPlant(e.x, e.y, e.p, e.sapling); else netSend({ XP: [e.x, e.y, e.p ? toNet(e.p) : 0, e.sapling || 'sapling'] }); return; }
        if (e.e === 'xunplant') { if (iHostAt(e.x, e.y)) core.hostUnplant(e.x, e.y); else netSend({ XU: [e.x, e.y] }); return; }
        if (!hosted.size) return;
        const mobIn = u => iHost(mobArea(u)), fight = () => typeof e.src === 'number' ? mobIn(e.src) : typeof e.dst === 'number' ? mobIn(e.dst) : false;
        switch (e.e) {
          case 'attack': if (fight()) hostQ.push(['a', toNet(e.src), toNet(e.dst), e.anim || '', (e.cls || 'm')[0] === 'm' ? 'm' : e.cls === 'ranged' ? 'r' : 'g', e.delay || 0, e.ammo ? +String(e.ammo).slice(-1) : 0, e.spell || 0]); break;
          case 'hit': if (fight()) hostQ.push(['h', toNet(e.src), toNet(e.dst), e.dmg, e.hp, (e.cls || 'm')[0] === 'm' ? 'm' : e.cls === 'ranged' ? 'r' : 'g', (e.blocked ? 1 : 0) | (e.dodged ? 2 : 0) | (e.dex ? 4 : 0) | (e.prot ? 8 : 0), e.prot ? e.raw | 0 : 0, e.fx || 0, e.fxt | 0]); break;
          case 'die': if (e.mob != null && mobIn(e.mob)) hostQ.push(['k', e.mob, e.killer ? toNet(e.killer) : 0]); break;
          case 'spawn': { const m = core.mobByUid(e.mob); if (m && iHost(m.zone)) hostQ.push(['s', m.uid, m.x, m.y, m.hp]); break; }
          case 'drop': if (iHostAt(e.x, e.y)) hostQ.push(['d', e.g, e.id, e.n, e.x, e.y, e.from ? toNet(e.from) : 0, e.sunk || 0, e.lv | 0]); break;
          case 'take': if (iHostAt(e.x, e.y)) hostQ.push(['t', e.g, toNet(e.p), e.id, e.n, e.x, e.y]); break;
          case 'vanish': if (iHostAt(e.x, e.y)) hostQ.push(['v', e.g, e.x, e.y]); break;
          case 'ground': if (iHostAt(e.x, e.y)) hostQ.push(['n', e.g, e.n, e.x, e.y]); break;
          case 'mobeat': if (mobIn(e.mob)) hostQ.push(['e', e.mob]); break;
          case 'fire': if (iHostAt(e.x, e.y)) hostQ.push(['f', e.fire, e.x, e.y, e.ticks, e.log]); break;
          case 'fireout': if (iHostAt(e.x, e.y)) hostQ.push(['fo', e.fire, e.x, e.y]); break;
          case 'weather': if (iHost(e.zone)) hostQ.push(['w', e.zone, e.kind, e.intensity, e.ticks]); break;
          case 'fx': if (mobIn(e.mob)) hostQ.push(['x', e.mob, e.fx, e.ticks]); break;
          case 'fxend': if (mobIn(e.mob)) hostQ.push(['xe', e.mob, e.fx]); break;
          case 'plant': if (iHostAt(e.x, e.y)) hostQ.push(['pl', e.x, e.y, e.sapling || 'sapling']); break;
          case 'unplant': if (iHostAt(e.x, e.y)) hostQ.push(['pu', e.x, e.y]); break;
          case 'grow': if (iHostAt(e.x, e.y)) hostQ.push(['pg', e.x, e.y, e.sapling || 'sapling']); break;
        }
      }
      function netAct() {   /* my current attack target, so the host (and any future host) knows what I'm doing */
        if (!room) return;
        const a = me.act && me.act.k === 'attack' ? me.act.uid : 0, sig = a + '';
        if (sig !== lastAct) { lastAct = sig; netSend({ A: a, s: Math.round(performance.now()) }); }
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
      const gSnap = new Map();   /* a host's ground list arriving in pieces (sadfrogltc 2026-10-09: 'Gend' marks the last) */
      function packSend(base, key, rows, max, endFlag) {   /* fill messages up to ~470 B. endFlag marks the last piece, so a ground list is not applied until every piece has arrived */
        let cur = Object.assign({}, base), list = [], sent = 0;
        const more = () => { const n = Object.assign({}, base); if (endFlag) n[endFlag] = 0; return n; };
        for (const r of rows) {
          list.push(r); cur[key] = list;
          if (sizeOf(cur) > (max || 470)) { list.pop(); cur[key] = list; if (list.length) { if (endFlag) cur[endFlag] = 0; netSend(cur); sent++; } cur = more(); list = [r]; cur[key] = list; }
        }
        if (list.length || Object.keys(base).length) { if (!list.length) delete cur[key]; if (endFlag) cur[endFlag] = 1; netSend(cur); sent++; }
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
          const G = core.S.ground.filter(g => areaAt(g.x, g.y) === a).map(g => [g.uid, g.id, g.n, g.x, g.y, g.from ? toNet(g.from) : 0, g.sunk || 0, g.lv | 0]);
          packSend({ F: seq, Gr: a }, 'G', G, 470, 'Gend');
          const wz = core.weatherOf(a); if (wz) netSend({ F: seq, W: [a, wz.kind, wz.intensity, Math.max(1, wz.until - core.S.t)] });
        }
        const Fi = core.S.fires.filter(f => iHostAt(f.x, f.y)).map(f => [f.uid, f.x, f.y, f.until - core.S.t, f.log]);
        if (Fi.length) packSend({ F: seq }, 'Fi', Fi);
        const Ch = core.chessRows((x, y) => iHostAt(x, y)).map(netRow); for (const r of Ch) netSendBig({ F: seq, Ch: [r] });   /* the chess park's tables this game hosts */
        const Pk = [];   /* [Claude 2026-10-13] the card tables go out from tblTick, by whoever deals each in its own room */   /* one row a message, split if it is big (packSend could not split one row) */   /* and the felt in the tap room */
        for (const r of Pk) phSend(r.t, false);   /* [Claude 2026-10-12] the sealed hole cards again, every few seconds, for whoever just joined */
        const Pl = [];
        for (const a of hosted) for (const r of core.plantSnap(a)) Pl.push(r);
        if (Pl.length) packSend({ F: seq }, 'Pl', Pl);
      }
      /* The keep's board used to be relayed by whoever hosted dragonkeep (HS/Hn messages), which kept a second copy of
         the board on that player's device and painted it long after the Bank's board was cleared. Gone (2026-10-12):
         the Bank answers 'scores?' to everyone in its room, guests included. */
      function coreCall(fn) {   /* run a core change outside the tick and present its events */
        const keep = core.S.ev; core.S.ev = []; fn(); const evs = core.S.ev; core.S.ev = keep;
        const now = performance.now(); for (const e of evs) { handle(e, now); netEvent(e); }
        syncGround(); syncTraps(); if (dirty.inv || dirty.eq) { hud.refresh('all'); dirty = {}; } else hud.refresh('orbs');
      }
      /* [Claude 2026-10-12] THE CHIPS ALWAYS COME HOME (core pokerSettle/pokerReclaim): an open card-table seat this game paid a
         buy-in for is watched. Seated: nothing to do. Not seated and the dealer's cashout has not come: when this game deals the
         table itself, 5 s; otherwise 20 s while the room is plainly alive (heard in the last 5 s) - then the last stack the dealer
         showed comes back. Offline time never counts: the dealer may still be holding the seat. The room id is handed to the core
         so a cashout written under it is still collected after a reload or a new connection. */
      let pkAway = 0, pkAsked = 0;
      setInterval(() => {
        const P = core.S.players[PID]; if (!P || (!P.pk && !P.ch)) { pkAway = 0; return; }
        if (room && myNetId) { core.pokerNetId(PID, myNetId); core.chessNetId(PID, myNetId); }   /* the chess stake too (the operator: "make sure we don't have the same problem with the chess game") */
        const K = P.pk ? { t: P.pk.t, pk: true } : { t: P.ch.t, pk: false };
        if (P.seat && P.seat.t === K.t && (P.seat.k === 'pk') === K.pk) { pkAway = 0; return; }
        if (!room || core.seatHeld(PID)) { pkAway = 0; return; }   /* a row still seats us under an old id: the host decides first */
        const now = performance.now(), T = K.pk ? core.pokerTableById(K.t) : core.tableById(K.t), mineToDeal = !!(T && (K.pk ? iDeal(T) : iHostAt(T.x, T.y)));
        if (!mineToDeal && now - NW.heard > 5000) { pkAway = 0; return; }
        if (!pkAway) { pkAway = now; return; }
        if (now - pkAway < (mineToDeal ? 5000 : 20000)) return;
        if (K.pk && P.pk.sn && !pkAsked) { pkAsked = now; ENGBANK.pkAsk(); return; }   /* [Claude 2026-10-14] a Bank-held seat: the Bank may already have paid it home */
        if (pkAsked && now - pkAsked < 4000) return;
        if (!core.S.players[PID].pk) { pkAway = pkAsked = 0; return; }
        pkAway = 0; pkAsked = 0; let n = 0; coreCall(() => { n = K.pk ? core.pokerReclaim(PID) : core.chessReclaim(PID); }); persist('now');   /* saved at once: a page that died before saving would pay the same chips back twice */
      }, 2000);
      function shared(id, r, d) {
        if (d.j != null) { const nj = +d.j; if (r.j !== nj) { r.j = nj; elect(); } }
        if (!core.S.players[id]) core.addPuppet(id, {});
        const pst = {};
        if (Number.isInteger(d.hp)) { pst.hp = d.hp; r.hp = d.hp; }
        if (d.d != null) pst.dead = !!d.d;
        if (d.g && typeof d.g === 'object') { pst.g = d.g; r.hasG = 1; }
        /* [Claude 2026-10-13] a player we hear from but never got gear from (robin-4d: the arcade quietly rejoins a client whose
           streams dropped - the others build it a fresh remote, its own page gets no 'join', so it never resends: @gx1 stood on
           @apple's screen in the plain placeholder) - ask for it: GQ makes everyone resend (each at most every 3 s). Not before
           3 s, the newcomer's own resend comes 600 ms after it joins; then at most every 5 s until the gear comes */
        else if (!r.hasG) { const t = Date.now(); if (!r.seenAt) r.seenAt = t; else if (t - r.seenAt > 3000 && t - (r.gqAt || 0) > 5000 && (r.gqN || 0) < 4) { r.gqAt = t; r.gqN = (r.gqN || 0) + 1; netSend({ GQ: 1 }); } }   /* four asks, then it is left to the next join */
        if (Array.isArray(d.L)) { pst.L = d.L; r.maxHp = d.L[3] | 0; }
        if (Number.isInteger(d.ST) && d.ST >= 0 && d.ST <= 999) r.story = d.ST;
        if (d.SK && typeof d.SK === 'object') { const sk = {}; for (const k in d.SK) if (/^[a-z]{1,20}$/.test(k)) { const L = d.SK[k] | 0; if (L >= 1 && L <= 99) sk[k] = L; } r.skills = sk; if (r.wantStats && Date.now() - r.wantStats.at < 15000) hud.playerStats(r.wantStats.name, sk, r.wantStats.cb, r.story); r.wantStats = null; }
        if (d.GQ && Date.now() - (NETGQ.t || 0) > 3000) { NETGQ.t = Date.now(); netGear(); }   /* someone asked for our stats: send them again (at most every 3 s) */
        if (d.st && typeof d.st === 'object') pst.st = d.st;
        if (d.pr !== undefined) pst.pr = typeof d.pr === 'string' ? d.pr : 0;
        /* Immediate target intents and repeated presence share the sender's monotonic stamp.  Events/state are applied
           before the position row's general stale-message guard (an older packet can still carry a unique hit), so A
           needs its own guard or an out-of-order active row can undo a newer A:0 and leave a ghost attack on the host. */
        if (d.A !== undefined && (!Number.isFinite(+d.s) || r.lastA == null || +d.s > r.lastA)) {
          pst.act = d.A ? { k: 'attack', uid: +d.A } : null;
          if (Number.isFinite(+d.s)) r.lastA = +d.s;
        }
        if (Object.keys(pst).length) core.setPuppet(id, pst);
        if (d.C != null) { const g = core.groundBy ? core.groundBy(+d.C) : core.S.ground.find(q => q.uid === +d.C); if (g && iHostAt(g.x, g.y)) coreCall(() => core.claim(id, +d.C)); }   /* groundBy [Claude 2026-10-14]: a guest may name a Bank copy by the Bank's uid */
        if (Array.isArray(d.XF)) { const f = d.XF; if (iHostAt(f[0], f[1])) coreCall(() => core.hostFire(f[0] | 0, f[1] | 0, f[2] | 0, String(f[3] || 'logs'))); }
        /* the chess park: a replica asks the host of the table's area to seat it, stand it up or play its move; the host answers in Ch rows */
        if (Array.isArray(d.CS)) { const T = core.tableById(String(d.CS[0])); if (T && iHostAt(T.x, T.y)) coreCall(() => core.hostSit(id, T.id, d.CS[1] | 0, d.CS[2] | 0)); }
        if (Array.isArray(d.CT)) { const T = core.tableById(String(d.CT[0])); if (T && iHostAt(T.x, T.y)) coreCall(() => core.hostStand(id, T.id)); }
        if (Array.isArray(d.CX)) { const T = core.tableById(String(d.CX[0])); if (T && iHostAt(T.x, T.y)) coreCall(() => core.hostSel(id, T.id, String(d.CX[1] || ''))); }   /* [Claude] */
        if (Array.isArray(d.CM)) { const T = core.tableById(String(d.CM[0])); if (T && iHostAt(T.x, T.y)) coreCall(() => core.hostMove(id, T.id, String(d.CM[1] || ''), String(d.CM[2] || ''), d.CM[3] ? String(d.CM[3]) : null)); }
        if (Array.isArray(d.Ch)) { const rows = d.Ch.filter(r => r && r.t).filter(r => { const T = core.tableById(String(r.t)); return T && fromHostOf(id, areaAt(T.x, T.y)); }).filter(r => { const h = CHIN[r.t]; if (h && h.from === id && (r.v | 0) < h.v) return false; CHIN[r.t] = { from: id, v: r.v | 0 }; return true; })   /* [Claude 2026-10-14] an OLDER row from the same host (the 5 s resend can land after a newer move) is not a step back (the operator: the piece popped back, then moved again) */.map(r => Object.assign({}, r, { w: r.w ? fromNet(r.w) : null, b: r.b ? fromNet(r.b) : null, paid: r.paid ? Object.fromEntries(Object.entries(r.paid).map(([k, v]) => [fromNet(k), v])) : null, co: Array.isArray(r.co) ? r.co.map(c => [fromNet(c[0]), c[1], c[2]]) : [] })); if (rows.length) coreCall(() => core.applyChess(rows)); }   /* [Claude] who is owed the stake, named as this page knows them */
        /* the felt: a chair asked for, a player getting up, an action, or the host's word on a table. Same rules as the
           chess park: only the host of the area the table stands in answers, and a row only counts from that host. */
        pkMsg(id, d);   /* [Claude 2026-10-13] the card-table words (also heard in a table's own room: tblHeard) */
        if (FE && Array.isArray(d.FE)) FE.net(id, d.FE);   /* [Claude 2026-10-16] a Fortune Engine's counter and spins */
        if (Array.isArray(d.X)) { const x = d.X; if (core.item(x[0]) && iHostAt(x[2], x[3])) coreCall(() => core.hostDrop({ id: x[0], n: Math.max(1, x[1] | 0), x: x[2] | 0, y: x[3] | 0, life: x[4] | 0, from: x[5] ? fromNet(x[5]) : null, diedAt: x[6] | 0, lv: x[7] | 0 })); }
        /* below: only the word of the host of the area concerned counts */
        if (Array.isArray(d.M)) { const rows = d.M.filter(w => Array.isArray(w) && fromHostOf(id, mobArea(w[0]))); if (rows.length) coreCall(() => core.applyMobs(rows)); }
        if (Array.isArray(d.W) && fromHostOf(id, d.W[0])) coreCall(() => core.setWeather(d.W[0], String(d.W[1]), d.W[2] | 0, d.W[3] | 0));
        if (Array.isArray(d.Fi)) coreCall(() => { for (const f of d.Fi) if (fromHostOf(id, areaAt(f[1], f[2]))) core.fireAdd(f[0], f[1], f[2], f[3], f[4]); });
        if (Array.isArray(d.XP) && iHostAt(d.XP[0], d.XP[1])) coreCall(() => core.hostPlant(d.XP[0] | 0, d.XP[1] | 0, fromNet(d.XP[2]), d.XP[3]));
        if (Array.isArray(d.XU) && iHostAt(d.XU[0], d.XU[1])) coreCall(() => core.hostUnplant(d.XU[0] | 0, d.XU[1] | 0));
        if (Array.isArray(d.Pl)) coreCall(() => { for (const r of d.Pl) if (fromHostOf(id, areaAt(r[0], r[1]))) core.acceptPlant(r[0] | 0, r[1] | 0, r[2] | 0, r[3] | 0, r[4]); });
        if (Array.isArray(d.G)) coreCall(() => {
          if (d.Gr && fromHostOf(id, d.Gr)) {
            if (d.Gend == null) core.groundFull(d.Gr, d.G);   /* a host from before the pile was sent in pieces */
            else {
              const key = id + '|' + (d.F || 0) + '|' + d.Gr, buf = gSnap.get(key) || [];
              buf.push.apply(buf, d.G);
              if (d.Gend === 1) { gSnap.delete(key); core.groundFull(d.Gr, buf); } else gSnap.set(key, buf);
            }
          } else if (!d.Gr) for (const g of d.G) if (fromHostOf(id, areaAt(g[3], g[4]))) core.groundAdd(g[0], g[1], g[2], g[3], g[4], g[5] ? fromNet(g[5]) : null, g[6] || 0, g[7] | 0);
        });
        if (Array.isArray(d.E)) coreCall(() => { for (const a of d.E) if (Array.isArray(a) && eventFromHost(id, a)) applyEvent(a); });
      }
      function eventFromHost(id, a) {   /* is the sender the host of the area this event is about? */
        switch (a[0]) {
          case 'a': case 'h': return fromHostOf(id, mobArea(typeof a[1] === 'number' ? a[1] : a[2]));
          case 'k': case 's': case 'e': case 'x': case 'xe': return fromHostOf(id, mobArea(a[1]));
          case 'd': return fromHostOf(id, areaAt(a[4], a[5]));
          case 't': case 'v': case 'n': { const g = core.S.ground.find(q => q.uid === a[1]), xy = g ? [g.x, g.y] : a[0] === 't' ? [a[5], a[6]] : a[0] === 'v' ? [a[2], a[3]] : [a[3], a[4]]; return xy[0] != null && fromHostOf(id, areaAt(xy[0], xy[1])); }
          case 'f': return fromHostOf(id, areaAt(a[2], a[3]));
          case 'pl': case 'pu': case 'pg': return fromHostOf(id, areaAt(a[1], a[2]));
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
            if (dst === PID) { core.applyHit(PID, (a[6] & 8) ? a[7] | 0 : dmg, CLS[a[5]] || 'melee', typeof src === 'number', typeof a[8] === 'string' ? a[8] : null, a[9] | 0); hp = me.hp; }   /* the host's roll before my prayer: if it went out meanwhile, the blow lands */
            else if (typeof dst === 'number') { const m = core.mobByUid(dst); if (m && !core.isAuth(m.zone)) m.hp = Math.max(0, hp); }
            if (src === PID) core.hitXp(PID, CLS[a[5]] || 'melee', dmg, !!(a[6] & 4));
            handle({ e: 'hit', src, dst, dmg, hp, max: maxOf(dst), cls: CLS[a[5]] || 'melee', blocked: !!(a[6] & 1), dodged: !!(a[6] & 2), prot: !!(a[6] & 8) }, now);
            break;
          }
          case 'k': { const m = core.mobByUid(a[1]); if (!m) break; core.applyMobs([[m.uid, m.x, m.y, 0, 1]]); if (fromNet(a[2]) === PID) core.creditKill(PID, m.key, m.x, m.y); for (const pid of core.S.order) { const o = core.S.players[pid]; if (o.act && o.act.k === 'attack' && o.act.uid === m.uid) o.act = null; } handle({ e: 'die', mob: m.uid }, now); break; }
          case 's': core.applyMobs([[a[1], a[2], a[3], a[4], 0]]); break;
          case 'd': core.groundAdd(a[1], a[2], a[3], a[4], a[5], a[6] ? fromNet(a[6]) : null, a[7] || 0, a[8] | 0); break;
          case 't': core.groundRemove(a[1]); if (fromNet(a[2]) === PID && !core.S.took.has(a[1])) { core.grantItem(PID, a[3], a[4], a[1]); persistTell({ e: 'take', p: PID, id: a[3], n: a[4], x: a[5], y: a[6] }); } break;   /* Report the host's award to the Bank once, even if the packet repeats. */
          case 'v': core.groundRemove(a[1]); break;
          case 'n': { const g = core.S.ground.find(q => q.uid === a[1]); if (g) g.n = a[2]; break; }
          case 'e': handle({ e: 'mobeat', mob: a[1] }, now); break;
          case 'f': core.fireAdd(a[1], a[2], a[3], a[4], a[5]); break;
          case 'pl': core.acceptPlant(a[1] | 0, a[2] | 0, 0, 0, a[3]); break;
          case 'pu': core.acceptUnplant(a[1] | 0, a[2] | 0); break;
          case 'pg': core.acceptPlant(a[1] | 0, a[2] | 0, core.plantHour, 1, a[3]); break;
          case 'fo': core.fireOut(a[1]); break;
          case 'w': core.setWeather(a[1], String(a[2]), a[3] | 0, a[4] | 0); break;
          case 'x': core.applyFx(a[1], a[2], a[3]); break;
          case 'xe': { const m = core.mobByUid(a[1]); if (m && m.fx) delete m.fx[a[2]]; handle({ e: 'fxend', mob: a[1], fx: a[2] }, now); break; }
        }
      }
      function updateRemotes(now, dt) {
        if (room && now - electT > 500) { electT = now; elect(); }
        for (const [id, r] of remotes) {
          const want = 400 + Math.min(1200, r.jit || 0); r.dly = r.dly == null ? want : r.dly + Math.max(-0.3 * dt * 1000, Math.min(0.3 * dt * 1000, want - r.dly));   /* eased, never more than 0.3 s per second, so their clock never runs backwards */
          const rt = now - r.dly;   /* one send-interval + 150 ms behind, plus how late their messages run */
          if (r.offline) ghostTick(id, r, now);   /* a partner gone offline, riding on in the bow */
          else if (now - r.heard > 12000) { dropRemote(id); elect(); if (!remotes.has(id) || !remotes.get(id).offline) continue; }   /* silent for 12 s: gone (the node drops them after ~10 s) */
          if (!remotes.has(id)) continue;
          if (CARRIED.by && r.from && r.from.address === CARRIED.by && r.boat === 1 && !me.boat && !r.offline && Math.max(Math.abs(Math.floor(r.buf.length ? r.buf[r.buf.length - 1].x : 0) - CARRIED.x), Math.abs(Math.floor(r.buf.length ? r.buf[r.buf.length - 1].z : 0) - CARRIED.y)) <= 40) { const b = r.buf[r.buf.length - 1]; CARRIED.by = null; me.x = Math.floor(b.x); me.y = Math.floor(b.z); place(myEnt, me.x, me.y); send({ c: 'ride', pid: id }); hud.chat('You are back in the canoe with ' + (r.name || 'your partner') + '.', 'sys'); }   /* back in the canoe that carried you */
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
          let x = A.x + (Bs.x - A.x) * k, z = A.z + (Bs.z - A.z) * k, turnS = 0;
          if (core.M.netNear && Math.abs(x - me.x) + Math.abs(z - me.y) > 400) { const q = core.M.netNear(x, z, me.x + 0.5, me.y + 0.5); if (q && Math.abs(q[0] - me.x) + Math.abs(q[1] - me.y) < 400) { x = q[0]; z = q[1]; turnS = q[2]; } }   /* across a seam: at their true place beside us */
          boatLook(r.e, r.boat === 1);
          r.e.root.position.set(x, 0, z); smoothPos(r.e, dt, false); x = r.e.root.position.x; z = r.e.root.position.z;   /* fluid travel: other players glide too */
          const lvR = Bs.l | 0, bR = lvR && core.M.buildingAt ? core.M.buildingAt(Math.floor(x), Math.floor(z)) : -1, upR = bR >= 0 ? lvR * (core.M.buildings[bR] && core.M.buildings[bR].lh ? core.M.buildings[bR].lh : 1.8) : 0;   /* positive storeys and negative basement floors share the same vertical scale */
          /* [Claude 2026-10-12] the operator: "When someone is on one of the upper floors of one of the buildings, they should only be
             visible to people on the same floor" - from below, the storeys above are see-through and they stood in the air. */
          r.lvR = lvR;   /* torchTick: a torch carried on another storey does not light this one */
          const offFloor = lvR !== (me.lv | 0);
          if (offFloor) { if (r.e.root.visible) { r.e.root.visible = false; r.floorHid = true; } }
          else if (r.floorHid) { r.e.root.visible = true; r.floorHid = false; }
          r.e.root.position.set(x, (r.e.canoe ? waterY(x, z) + (r.anim === 'pole' || r.anim === 'idle' ? 0.14 : 0) : heightAt(x, z) + seatLift(r.e) + upR) + (r.e.alt || 0), z); r.e.tyaw = Bs.f + turnS;   /* a chess player sits on the bench */
          /* [Claude 2026-10-14] the feet follow the body actually drawn, not the newest message: their last sample says 'idle' at the
             spot they stopped, and playing it at once slid the avatar the last stretch standing still. While the drawn body moves,
             walk (or run), at a pace matched to how fast it goes; stand only once it has come to rest. */
          const sp = dt > 0 && r.px != null ? Math.hypot(x - r.px, z - r.pz) / dt : 0; r.px = x; r.pz = z;
          r.vs = (r.vs || 0) + (sp - (r.vs || 0)) * Math.min(1, dt * 8);
          let an = Bs.a, aspd = 1; const loco = a => a === 'walk' || a === 'run' || a === 'idle';
          if (!r.e.canoe && !r.boat && loco(an)) {
            if (r.vs > 0.5) { an = an === 'run' || (A.a === 'run' && an === 'idle') ? 'run' : 'walk'; aspd = Math.max(0.6, Math.min(1.6, r.vs / (an === 'run' ? 2 * 1000 / TICK : 1000 / TICK))); r.stillT = 0; }
            else if (an !== 'idle' && (r.stillT = (r.stillT || 0) + dt) > 0.25) an = 'idle';   /* a message says walking but the body has stood still a while */
            else if (an !== 'idle') aspd = Math.max(0.6, r.vs / (1000 / TICK));
          }
          if (an !== r.anim) { r.anim = an; r.e.H.play(an, { loop: /idle|walk|run|chop|mine|fish|cook|sit|paddle|pole|knock|crosslegged/.test(an), speed: aspd }); }
          else if (an === 'walk' || an === 'run') r.e.H.play(an, { loop: true, speed: aspd });   /* same loop: only its pace changes */
          r.e.yaw += (((r.e.tyaw - r.e.yaw + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI) * Math.min(1, dt * 10); r.e.root.rotation.y = r.e.yaw;
          if (r.boat === 2) { const T = r.ride === myNetId ? myEnt : (remotes.get(r.ride) || {}).e; if (T) { bowSeat(r.e, T, r.anim === 'knock'); } }
          r.e.H.update(dt); if (r.e.hawk) r.e.hawk.update(dt);
          headLook(r.e, r.hl || 0, dt);
        }
      }

      /* ---------- per frame */
      const tmpV = new THREE.Vector3();
      function toScreen(pos, up) { tmpV.set(pos.x, pos.y + (up || 0), pos.z).project(camera); if (tmpV.z > 1) return null; const w = host.clientWidth, h = host.clientHeight; return { x: (tmpV.x + 1) / 2 * w, y: (1 - tmpV.y) / 2 * h }; }
      let last = performance.now(), frames = 0, mmT = 0;
      let FIRST_DRAWN = false;
      function frame(rafNow) {
        if (stopped) return;
        requestAnimationFrame(frame);
        for (const r of regions) if (r.built && r.built.setFloor) r.built.setFloor(me.lv | 0);
        caveTick(performance.now()); torchTick(performance.now());
        if (MUSIC) MUSIC.frame(me.x, me.y, zoneHere, () => !!core.S.night);   /* the soundtrack follows the area, and the night (it looks every 20 frames) */
        for (const t of gFlames) { const q = performance.now() / 1000, k = 0.85 + 0.15 * Math.sin(q * 13 + t.ph) + 0.08 * Math.sin(q * 31 + t.ph * 2); t.f.scale.set(1, k, 1); t.f2.scale.set(1, k, 1); }
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
          if (!e.dead || a < 1) { e.root.position.lerpVectors(e.from, e.to, a); smoothPos(e, elapsed, a < 1); e.root.position.y = (e.canoe ? waterY(e.root.position.x, e.root.position.z) + (e.ricing ? 0.14 : 0) : footY(e.root.position.x, e.root.position.z) + liftOf(e, a) + seatLift(e)) + hawkAlt(e); }   /* the poler stands on the canoe's floor; a chess player sits on the bench */   /* on an upper floor; a hawk over the trees */
          let d = e.tyaw - e.yaw; d = ((d + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; e.yaw += d * Math.min(1, dt * 12); e.root.rotation.y = e.yaw + (e === myEnt && cam.mode === 'creator' ? cam.spin || 0 : 0);   /* the creator's Turn spins only the model; the camera stays (walls) */
          const moving = a < 1 && e.from.distanceToSquared(e.to) > 1e-4;
          if (!e.dead && !e.oneShot && !e.prone && !e.held) { const want = e.boatRole === 2 ? (e.knocking ? 'knock' : moving ? 'paddle' : 'sit') : e.canoe ? (e.ricing ? (moving ? 'pole' : 'idle') : moving ? 'paddle' : 'sit') : moving ? (e.running ? 'run' : 'walk') : (e.restPose || e.skill || 'idle'); if (want !== e.loco) { e.loco = want; e.H.play(want, { loop: true }); } }
          if (e.boatRole === 2 && e.rideOf != null) { const T = (remotes.get(e.rideOf) || {}).e; if (T) bowSeat(e, T, e.knocking); }
          if (e.tellUntil && now >= e.tellUntil) { e.tellUntil = 0; e.oneShot = false; if (e.H.tell) e.H.tell(null); }
          if (e.oneShot && e.oneT && now - e.oneT > 2500 && !e.dead && !(e.tellUntil && now < e.tellUntil)) e.oneShot = false;
          for (const rec of e.impacts) if (!rec.fired && now - rec.t > 850) { fireImpact(e, rec); break; }
          if (e.dead && (e.key.charAt(0) === 'm' || (e.key.charAt(0) === 'n' && e.deadT))) { const k = (now - e.deadT) / 1000; if (k > 1.3 && k < 2.2 && e.H.setOpacity) e.H.setOpacity(Math.max(0, 1 - (k - 1.3) / 0.8)); if (k >= 2.2) e.root.visible = false; }
          if (e.spawnT) { const k = Math.min(1, (now - e.spawnT) / 400); e.H.object.scale.setScalar(e.scale * (0.3 + 0.7 * k)); if (k >= 1) e.spawnT = 0; }
          if (e.root.visible) { e.H.update(dt); if (e.hawk) e.hawk.update(dt); }
          if (e.chain && e.root.visible) {
            const ax = e.chain.ax, az = e.chain.az, ay = heightAt(ax, az) + 3.5, bx = e.root.position.x, by = e.root.position.y + 1.15, bz = e.root.position.z;
            e.chain.links.forEach((lk, i) => { const t = (i + 1) / (e.chain.links.length + 1), sag = Math.sin(Math.PI * t) * 0.85; lk.position.set(ax + (bx - ax) * t, ay + (by - ay) * t - sag, az + (bz - az) * t); lk.rotation.y = Math.atan2(bx - ax, bz - az); lk.visible = true; });
          }
          if (e === myEnt) headLook(e, myEnt.hl || 0, dt);
        }
        for (const g of fires.values()) { const u = g.userData, sc = 0.8 + 0.25 * Math.sin(now / 70 + u.ph) + 0.1 * Math.sin(now / 23 + u.ph); u.f1.scale.set(1, sc, 1); u.f2.scale.set(1, 1.1 * sc, 1); }
        if (wxMod && wxMod.update && !CAVE.on) wxMod.update(elapsed);
        if (!CAVE.on) dayTick(); else { if (STARS.pts) STARS.pts.visible = false; underSeason(); }   /* day and night on top of the weather's sky */   /* underground the cave sets the fog and the sky */
        updateRemotes(now, dt); pokerClock(now); if (FE) FE.frame(now, dt); if (PET) PET.frame(now, dt);
        for (let i = projs.length - 1; i >= 0; i--) {
          const p = projs[i]; p.t += dt; const k = Math.min(1, p.t / p.dur);
          const to = p.tgt.root.position.clone(); to.y += p.tgt.hawk ? 0.25 : (p.tgt.H.height || 1.2) * p.tgt.scale * 0.55;   /* up at the hawk itself in the sky */
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
          const ok = e.proxy && e.proxy.userData.pick, opl = ok && ok.kind === 'self' ? me : ok && ok.kind === 'remote' ? core.S.players[ok.id] : null, oid = opl && !opl.dead && e.root.visible ? core.overhead(opl) : null;   /* the overhead prayer icon (2026-10-07) */
          if (oid !== (e.ohId || null)) { if (e.ohd) { e.ohd.remove(); e.ohd = null; } e.ohId = oid; if (oid) e.ohd = hud.overhead(core.prayer(oid)); }
          if (e.ohd) { const s = e.root.visible ? toScreen(e.root.position, top + (e.tag ? 0.75 : 0.62)) : null; e.ohd.style.display = s ? 'block' : 'none'; if (s) { e.ohd.style.left = s.x + 'px'; e.ohd.style.top = (e.tag ? Math.min(s.y, parseFloat(e.tag.style.top) - 12) : s.y) + 'px'; } }
          if (e.bub) { const s = now - e.bub.t < 4000 && e.root.visible ? toScreen(e.root.position, top + (e.tag ? 0.85 : 0.5)) : null; if (now - e.bub.t >= 4000) { e.bub.el.remove(); e.bub = null; } else { e.bub.el.style.display = s ? 'block' : 'none'; if (s) { e.bub.el.style.left = s.x + 'px'; e.bub.el.style.top = s.y + 'px'; } } }
        }
        /* opponent box */
        if (lastOpp && now - lastOpp.t < 6000) { const m = typeof lastOpp.uid === 'number' ? core.mobByUid(lastOpp.uid) : null; if (m) hud.setOpp({ name: D.monsters[m.key].name, hp: m.hp, max: D.monsters[m.key].hp }); else hud.setOpp(null); } else hud.setOpp(null);
        if (now - mmT > 66) { mmT = now; drawMinimap(); }
        hud.setPos(me.x, me.y);
        netPos(now); netNeighbours(now); tblTick(now); flushNet();
        if (fogMod && myEnt) fogMod.focus(myEnt.root.position);
        if (wxMod && wxMod.focus && myEnt) wxMod.focus(myEnt.root.position);
        if (SCENE.see && myEnt) {   /* see-through: a circle round the avatar's chest on screen, for anything 2 m or more in front of it */
          const S = SCENE.see, hp = _seeV.copy(myEnt.root.position); hp.y += 1.0;
          const d = camera.position.distanceTo(hp); hp.project(camera);
          const sz = renderer.getDrawingBufferSize(_seeS);
          if (hp.z > -1 && hp.z < 1 && settings.seeThrough !== false) { S.uSeeP.value.set((hp.x + 1) / 2 * sz.x, (hp.y + 1) / 2 * sz.y); S.uSeeR.value = CAVE.on ? Math.hypot(sz.x, sz.y) : sz.y * 0.13; S.uSeeD.value = d - (CAVE.on ? 0.35 : 2.0); if (S.uSeeY) S.uSeeY.value = myEnt.root.position.y + (CAVE.on ? -0.04 : 0.25); } else S.uSeeR.value = 0;
        }
        /* FOGV: the fog's distances are meant from the player; three measures them from the camera, which stands cam.dist
           behind - so they are pushed out by that much for the draw (and a hawk sees further), then put back for whoever
           set them (the weather module, the cave, the plain fog) */
        const fn0 = scene.fog.near, ff0 = scene.fog.far, fk = CAVE.on ? 1 : viewR() / VIEW, back = cam.dist;
        scene.fog.near = fn0 * fk + back; scene.fog.far = ff0 * fk + back;
        { const cf = Math.max(90, scene.fog.far + 8); if (Math.abs(camera.far - cf) > 2) { camera.far = cf; camera.updateProjectionMatrix(); } }
        lightBudget();
        if (!((TRAVEL.on || travelling) && !TRAVEL.warm)) {
          const bg = scene.background;
          if (SKYV.v && !CAVE.on && SKYV.v.render(renderer, camera, bg)) {   /* the sky first, then the world over it without clearing */
            renderer.autoClear = false; renderer.clearDepth(); scene.background = null;
            renderer.render(scene, camera);
            scene.background = bg; renderer.autoClear = true;
          } else renderer.render(scene, camera);
          if (!FIRST_DRAWN) { FIRST_DRAWN = true; if (G.ASH_LOAD) setTimeout(() => G.ASH_LOAD.done(), 120); }   /* [Claude 2026-10-13] the world is on screen: the loading screen goes */
        }   /* behind a loading screen nothing is drawn: the frame time goes to building the place you are going to */
        scene.fog.near = fn0; scene.fog.far = ff0;
      }
      const arrivedProjs = [];
      function burstSmall(pos, color) { for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color })); m.position.copy(pos); const a = k / 8 * 2 * PI; m.userData.v = new THREE.Vector3(Math.cos(a) * 1.2, 1 + (k % 2), Math.sin(a) * 1.2); m.userData.t = 0; m.userData.life = 0.45; scene.add(m); bursts.push(m); } }
      /* late hits: a projectile that already landed shows the splat when the hit event arrives */
      const _handle = handle;
      /* QUEST BEACONS: a tall gold light over each place an open quest step names (its `at`), seen from up to 120 tiles - from the
         river you can steer for it - with a slowly turning diamond on top */
      const QB = new Map(), QB_GEO = [new THREE.CylinderGeometry(0.35, 0.6, 18, 10, 1, true), new THREE.OctahedronGeometry(0.5)];
      const QB_MAT = [new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color: 0xffe08a })];
      function questBeacons(list) {
        const want = new Set();
        for (const m of list) {
          if (Math.max(Math.abs(m.x - me.x), Math.abs(m.y - me.y)) > 120) continue;
          const k = m.x + ',' + m.y; want.add(k); let b = QB.get(k);
          if (!b) { b = new THREE.Group(); const col = new THREE.Mesh(QB_GEO[0], QB_MAT[0]), gem = new THREE.Mesh(QB_GEO[1], QB_MAT[1]); col.position.y = 8; gem.position.y = 3; b.add(col, gem); b.gem = gem;
            b.position.set(m.x + 0.5, footY(m.x + 0.5, m.y + 0.5), m.y + 0.5); scene.add(b); QB.set(k, b); }
          const t = performance.now() / 1000; b.gem.rotation.y = t; b.gem.position.y = 3 + 0.25 * Math.sin(t * 2);
        }
        for (const [k, b] of QB) if (!want.has(k)) { scene.remove(b); QB.delete(k); }
      }
      function drawMinimap() {
        const p = myEnt.root.position, dots = [];
        for (const m of core.S.mobs) if (!m.dead) { const e = ents.get('m:' + m.uid); if (e) dots.push({ x: e.root.position.x, y: e.root.position.z, c: '#ffff00' }); }
        for (const n of core.M.npcs) dots.push({ x: n.x + 0.5, y: n.y + 0.5, c: '#ffff00' });
        for (const g of core.S.ground) if (!g.sunk) dots.push({ x: g.x + 0.5, y: g.y + 0.5, c: '#ff2020' });
        for (const r of remotes.values()) dots.push({ x: r.e.root.position.x, y: r.e.root.position.z, c: '#ffffff' });
        if (flag && me.x === flag[0] && me.y === flag[1]) flag = null;
        minimapFor();
        if (mmO[0] || mmO[1]) for (const d of dots) { d.x -= mmO[0]; d.y -= mmO[1]; }
        const qm = core.questMarks ? core.questMarks(me) : []; questBeacons(qm);
        const marks = qm.map(m => ({ x: m.x + 0.5 - mmO[0], y: m.y + 0.5 - mmO[1] }));
        hud.drawMinimap(mmImg, { x: p.x - mmO[0], y: p.z - mmO[1], yaw: cam.yaw, north: trueNorth(me.x, me.y), dots, marks, flag: flag ? [flag[0] + 0.5 - mmO[0], flag[1] + 0.5 - mmO[1]] : null });
      }
      /* TRUE NORTH (2026-10-06: the compass is a dot on the minimap's rim that always points north, and "make sure
         that north in the game matches in the Atlas" - the planet's north pole). The game's grid is laid on a face of the
         globe, so map-up is not north: near Ashvale the pole lies ~42 degrees left of it. From the worldgen projection: the
         pole's direction on the ground where you stand, as a game vector [x east, y south]. Recomputed every 16 tiles. */
      const TN = { key: '', v: [0, -1] };
      function trueNorth(x, y) {
        const S0 = core.M.sphereAt; if (!S0 || !S0(x + 0.5, y + 0.5)) return TN.v;
        const key = (x >> 4) + ':' + (y >> 4); if (key === TN.key) return TN.v; TN.key = key;
        const u = S0(x + 0.5, y + 0.5), un = S0(x + 0.5, y - 0.5), ue = S0(x + 1.5, y + 0.5);   /* through the net: right on every face */
        const d = [un[0] - u[0], un[1] - u[1], un[2] - u[2]], e = [ue[0] - u[0], ue[1] - u[1], ue[2] - u[2]], N = [-NS * u[0] * u[2], -NS * u[1] * u[2], NS * (1 - u[2] * u[2])];   /* toward the world's north */
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
      /* FRIENDS LIST: wallet contacts who also have an Ashvale save. Green when their game said where they stand
         recently; red otherwise. Clicking a name fills /@tag in the chat box. */
      const PALS = { tags: new Map(), on: new Map(), rows: [], note: '', q: 0, wait: 0 };
      function palsHeard(d) {
        if (String(d.q || '') !== String(PALS.q)) return;
        for (const row of d.p || []) if (row && PALS.tags.has(row[0])) PALS.on.set(row[0], !!row[1]);
        PALS.wait--; if (PALS.wait > 0) return;
        const rows = [];
        for (const [a, tag] of PALS.tags) if (PALS.on.has(a)) rows.push({ tag, online: PALS.on.get(a) });
        rows.sort((a, b) => (b.online - a.online) || a.tag.localeCompare(b.tag));
        PALS.rows = rows; PALS.note = rows.length ? '' : 'None of your contacts have an Ashvale save yet.';
        if (hud.tab === 'friends') hud.refresh('friends');
      }
      async function loadPals() {
        if (!(G.parent && G.parent !== G) || !/^https?:/.test(location.protocol)) { PALS.note = 'Sign in on the arcade to see your contacts.'; PALS.rows = []; return; }
        if (!(G.arcade && G.arcade.contacts)) await new Promise(ok => { const s = G.document.createElement('script'); s.src = '/r/contacts.js'; s.onload = s.onerror = () => ok(); G.document.head.appendChild(s); setTimeout(ok, 8000); });
        if (!(G.arcade && G.arcade.contacts)) { PALS.note = 'Sign in on the arcade to see your contacts.'; PALS.rows = []; return; }
        let L = []; try { L = await G.arcade.contacts.list(); } catch (e) { PALS.note = 'Could not read your contacts.'; PALS.rows = []; return; }
        PALS.tags = new Map(); PALS.on = new Map();
        for (const c of Array.isArray(L) ? L : []) if (c && typeof c.address === 'string' && c.address.length >= 25 && c.tag) PALS.tags.set(c.address, String(c.tag).replace(/^@/, ''));
        if (!PALS.tags.size) { PALS.rows = []; PALS.note = 'Your address book is empty.'; if (hud.tab === 'friends') hud.refresh('friends'); return; }
        const R = await bankRoom(); if (!R || !R.me || R.me.guest) { PALS.note = 'Sign in to see which contacts play Ashvale.'; PALS.rows = []; return; }
        await reportBook().catch(() => {});
        const all = Array.from(PALS.tags.keys()); PALS.q = (PALS.q + 1) % 100000; PALS.wait = Math.ceil(all.length / 8);
        for (let i = 0; i < all.length; i += 8) R.send({ t: 'pals?', v: 1, q: PALS.q, a: all.slice(i, i + 8) });
      }
      setTimeout(() => { reportBook().catch(() => {}); setInterval(() => reportBook().catch(() => {}), 600000); }, 15000);
      /* the save to the Bank (cloudLoad above): only when it changed, at most every 20 s, at once when you leave */
      const CLOUD = { last: null, at: (save && save.at) || 0, sent: '', t: 0, mine: save && save.mine != null ? +save.mine : null, base: save && save.base != null ? +save.base : null };   /* base: the Bank's save this game continues */
      function cloudPush(json, now) {
        if (!G.arcade || !CLOUD_OK || !json || json === CLOUD.sent || (!now && performance.now() - CLOUD.t < 20000)) return;
        CLOUD.t = performance.now(); const at = CLOUD.at;
        packSave(json).then(b => bankRoom().then(R => {
          if (!R) return; const n = Math.max(1, Math.ceil(b.length / CHUNK));
          if (n > 40) { console.warn('ASHVALE: the save is too big for the Bank (' + b.length + ' B)'); return; }
          /* mine: the last save THIS game sent - if the Bank's 'svok' for it never reached us, the Bank still knows no other device
             came between (2026-10-08: a lost svok left base one save behind and the next save was refused as another device's) */
          const mine = CLOUD.mine; CLOUD.sent = json; CLOUD.mine = at; for (let i = 0; i < n; i++) R.send(Object.assign(withHome({ t: 'sv', id: at, i, n, d: b.slice(i * CHUNK, (i + 1) * CHUNK) }), CLOUD.base != null ? { base: CLOUD.base } : {}, mine != null ? { mine } : {})); holdSend();
        })).catch(e => console.warn('ASHVALE: cloud save', e && e.message));
      }
      const SAVEZ = { zone: undefined, t: 0 };
      function persist(leaving) {
        if (stopped) return;
        try { tellHere(leaving === true); } catch (e) { /* the Bank is out of reach: the next save */ }
        const P = core.exportPlayer(PID), LS = ledgerSnap(); if (P && LS) P.chestLedger = LS;   /* the chest ledger saves with the bag it describes */
        const json = JSON.stringify(P); if (json !== CLOUD.last) { CLOUD.at = Date.now(); CLOUD.last = json; } if (P) { P.at = CLOUD.at; if (CLOUD.base != null) P.base = CLOUD.base; if (CLOUD.mine != null) P.mine = CLOUD.mine; }
        cloudPush(json, leaving === true || leaving === 'now');   /* 'now' [Claude 2026-10-12]: straight to the Bank, not after the 20 s wait */
        Promise.resolve(store.set(SAVE, JSON.stringify(P))).then(ok => {   /* false: the arcade did not take it */
          if (ok === false) { if (++saveFails === 2) hud.netLost && hud.netLost(true, 'save'); }
          else { if (saveFails >= 2) { hud.netLost && hud.netLost(false, 'save'); hud.chat('Your progress is saving again.', 'sys'); } saveFails = 0; }
        });
      }   /* stopped: New character cleared the save; the reload's visibilitychange must not write the old one back */
      document.addEventListener('visibilitychange', () => { if (document.hidden) persist(true); else { lastTick = performance.now(); } });
      window.addEventListener('pagehide', () => persist(true));

      function hudApi() {
        return {
          core, pid: PID, isPhone, isTouch, theme: () => ((D.rules.homes || {})[core.homeOf(me)] || {}).hud || null,
          walletState: () => walletState, walletRefresh: () => walletRefresh(), pid: PID,
          chestState: (...a) => { const C = chestState(...a); return C && C.here ? Object.assign({}, C, { chest: C.here }) : C; },   /* [Claude 2026-10-14] the chest window shows this home's chest */ chestTake: (...a) => chestTake(...a), chestStore: (...a) => chestStore(...a), chestDeposit: (...a) => chestDeposit(...a), depositInv: () => depositInv(), depositWorn: () => depositWorn(), withdrawAll: () => withdrawAll(),   /* the Bank part installs after the HUD is made */
          friends: () => ({ rows: PALS.rows.slice(), note: PALS.note }),
          friendsRefresh: () => { loadPals().then(() => { if (hud.tab === 'friends') hud.refresh('friends'); }); },
          walletTake: (id) => chestTake(id, 1),   /* the same ledger as the chest (it bypassed it and could duplicate an NFT) */
          icon: id => { try { return MOD.icon(id, 64); } catch (e) { return null; } },
          cmd: c => { send(c); },
          say: t => say(t),
          sfx: n => sfx(n),
          settings: () => settings,
          musicPanel: (el, redraw) => { if (MUSIC) MUSIC.panel(el, redraw); },   /* the Music tab (src/engmusic.js) */
          toggle: k => { settings[k] = !settings[k]; store.set(SET, JSON.stringify(settings)); if (k === 'shadows') { sun.castShadow = settings.shadows; for (const e of ents.values()) e.blob.visible = !settings.shadows && !e.hawk; renderer.shadowMap.needsUpdate = true; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); } if (k === 'showPet' && PET) PET.shown(); },
          resetCamera: () => { cam.tyaw = PI * 0.12; cam.tpitch = 0.92; cam.tdist = isPhone ? 9 : 11; },
          faceNorth: () => { const v = trueNorth(me.x, me.y), want = -PI / 2 - Math.atan2(v[1], v[0]); cam.tyaw = want + Math.round((cam.tyaw - want) / (2 * PI)) * 2 * PI; },   /* true north up, the short way round */
          newGame: () => { stopped = true; const at = Date.now(); (CLOUD_OK ? bankRoom() : Promise.resolve(null)).then(R => R && R.send(Object.assign(withHome({ t: 'sv', id: at, i: 0, n: 1 }), { d: '' }, CLOUD.base != null ? { base: CLOUD.base } : {}))).catch(() => {}).then(() => store.set(SAVE, '')).then(() => location.reload(), () => location.reload()); },   /* the Bank's copy goes too: an empty save, newer than any */
          helpSeen: () => store.set('ashvale3d.help', '1'),
          savesHere: () => store.backend,
          home: () => { const HD = (D.rules.homes || {})[core.homeOf(me)]; return HD && HD.help ? HD : null; },
          modulesText: () => 'Players: ' + netStatus + '. Saves: ' + ({ arcade: 'on the arcade', browser: 'in this browser', memory: 'not saved (this session only)' }[store.backend] || store.backend) + '. Modules: ' + (opts.report || []).map(r => r[0] + ' v' + r[1]).join(', '),
          minimapTap: (dx, dy, k, run) => { const c = Math.cos(-cam.yaw), s = Math.sin(-cam.yaw); const tx = Math.floor(myEnt.root.position.x + (dx * c - dy * s) / k), ty = Math.floor(myEnt.root.position.z + (dx * s + dy * c) / k); send({ c: 'walk', x: tx, y: ty, run: runFor(run ? true : !!settings.runToggle) }); flag = [tx, ty]; }
        };
      }
      let stopped = false;
      /* ---------- character creator (first start) and the tailor's wardrobe */
      /* ---------------- THE CHESS PARK: sitting down swings the camera over the board and swaps the HUD for the chess one */
      const BENCH_SEAT = 0.42;   /* the plank's height in scene.js 'bench' */
      const CHAIR_SEAT = 0.39;   /* the seat top in scene.js 'chair' - the poker table's chairs */
      let TABLES_CACHE = { n: -1, list: [] };   /* core.tables() filters every loaded object: once per area change, not per remote per frame */
      function tablesCached() { const O = core.M.objects || []; if (O.length !== TABLES_CACHE.n) TABLES_CACHE = { n: O.length, list: core.tables() }; return TABLES_CACHE.list; }
      let PKTABLES_CACHE = { n: -1, list: [] };
      function pkTablesCached() { const O = core.M.objects || []; if (O.length !== PKTABLES_CACHE.n) PKTABLES_CACHE = { n: O.length, list: core.pokerTables() }; return PKTABLES_CACHE.list; }
      function seatLift(e) {   /* a seated player sits on the bench or the chair, not on the ground: you by your seat, a remote by the table rows */
        if (FE) { const l = FE.lift(e); if (l != null) return l; }   /* [Claude 2026-10-16] a Fortune Engine's bench */
        if (e === myEnt) return me.seat ? (me.seat.k === 'pk' ? CHAIR_SEAT : BENCH_SEAT) : 0;
        if (!e.key || e.key.charCodeAt(0) !== 114) return 0;   /* 'r:' remotes: seated when a table's row names them (their anim lives on the remote record, not here) */
        const id = e.key.slice(2);
        for (const T of tablesCached()) { const st = core.S.chess[T.id]; if (st && (st.w === id || st.b === id)) return BENCH_SEAT; }
        for (const T of pkTablesCached()) { const st = core.S.poker[T.id]; if (st && (st.se || []).some(s => s[1] === id)) return CHAIR_SEAT; }
        return 0;
      }
      let CHESSV = null, CHESS_SEL = null, CHESS_TURN = 0, CHESS_ASK = null, POKER_ASK = null, MENU_MODE = false;   /* [Claude 2026-10-11] CHESS_TURN: the view turned round the board by a drag (up to a quarter turn each way); *_ASK: the Stand up confirms; MENU_MODE: a long press / right-click, where Stand up may be offered */
      function chessView(t) {
        const st = core.chessOf(t), col = st.w === PID ? 'w' : st.b === PID ? 'b' : null, turn = core.chessTurn(t);
        const g = core.chessGame(t);
        return { t, st, col, turn, mine: !!col && st.status === 'playing' && turn === col, inCheck: !!(g && g.inCheck()), sel: CHESS_SEL, targets: CHESS_SEL ? core.chessMoves(t, CHESS_SEL) : [], me: PID };
      }
      function chessEnter(t) {
        const at = SCENE.chessAt ? SCENE.chessAt(t) : null, st = core.chessOf(t), col = st.w === PID ? 'w' : 'b';
        CHESS_SEL = null; CHESS_TURN = 0;
        if (at) {   /* from your own eyes (the operator: first person, the board dominating the screen): leaning over your edge of the board */
          if (cam.mode !== 'chess') cam.save = { yaw: cam.tyaw, pitch: cam.tpitch, dist: cam.tdist };
          const s = col === 'w' ? 1 : -1;
          CHESSV = { x: at.x, y: at.y, z: at.z, yaw: col === 'w' ? 0 : Math.PI, eye: { x: at.x, y: at.y + 0.9, z: at.z + s * 0.68 }, look: { x: at.x, y: at.y, z: at.z + s * 0.1 } };   /* look a shade towards your own edge: the near rank clears the chat box */
          cam.mode = 'chess';
        }
        myEnt.restPose = 'sit';
        const askStand = () => { const st0 = core.chessOf(t), resigning = st0.status === 'playing' && (st0.moves || []).length > 0;
          hud.confirm(resigning ? 'Resign and stand up?' : 'Stand up?', resigning ? 'A move has been played: standing up now resigns the game' + ' and loses any stake on it.' : 'Leave the chess table?', resigning ? 'Resign' : 'Stand up', 'Stay', () => send({ c: 'stand' })); };
        CHESS_ASK = askStand;
        if (hud.chessOpen) hud.chessOpen(chessView(t), { tap: chessTap, stand: askStand });
      }
      function chessLeave(t) {
        if (cam.mode === 'chess') { cam.mode = null; if (cam.save) { cam.tyaw = cam.save.yaw; cam.tpitch = cam.save.pitch; cam.tdist = cam.save.dist; cam.save = null; } }
        CHESSV = null; CHESS_SEL = null; CHESS_TURN = 0; CHESS_ASK = null; myEnt.restPose = null;
        if (SCENE.chessMark) SCENE.chessMark(t, null, [], null, []);
        if (hud.chessClose) hud.chessClose();
      }
      function chessTap(sq) {
        if (!me.seat) return;
        const t = me.seat.t, v = chessView(t);
        if (!v.mine) { hud.chat(v.st.status === 'open' ? 'Waiting for an opponent to sit down.' : v.st.status === 'over' ? 'The game is over. Stand up to leave the table.' : 'It is not your move.', 'sys'); return; }
        if (CHESS_SEL && v.targets.some(m => m.to === sq)) {
          const promo = v.targets.some(m => m.to === sq && m.promotion);
          const go = (pr) => { send({ c: 'cmove', from: CHESS_SEL, to: sq, promo: pr || undefined }); CHESS_SEL = null; markBoard(t); if (hud.chessUpdate) hud.chessUpdate(chessView(t)); };
          if (promo && hud.chessPromo) hud.chessPromo(go); else go(null);
          return;
        }
        const own = core.chessMoves(t, sq);
        CHESS_SEL = own.length ? sq : null;
        send({ c: 'csel', sq: CHESS_SEL || '' });   /* [Claude] the table hears what you picked up, so the opponent's board lights it too */
        markBoard(t);
        if (hud.chessUpdate) hud.chessUpdate(chessView(t));
      }
      function markBoard(t) {   /* [Claude 2026-10-11] my pick in full, the opponent's at half strength, on the same board */
        if (!SCENE.chessMark) return;
        const st = core.chessOf(t), col = st.w === PID ? 'w' : st.b === PID ? 'b' : null, osq = col ? (col === 'w' ? st.sb : st.sw) : null;
        const lit = (sq) => sq ? core.chessMoves(t, sq).map(m => ({ to: m.to, capture: /[ce]/.test(m.flags || '') })) : [];
        SCENE.chessMark(t, CHESS_SEL, lit(CHESS_SEL), osq && osq !== CHESS_SEL ? osq : null, osq && osq !== CHESS_SEL ? lit(osq) : []);
      }
      function chessExamine(st) {
        if (st.status === 'playing') return esc(st.wn) + ' (White) and ' + esc(st.bn) + ' (Black) are playing: ' + st.moves.length + ' moves so far.';
        if (st.status === 'over') return 'The last game ended ' + st.result + ' (' + st.why + ').';
        if (st.w || st.b) return esc(st.wn || st.bn) + ' is waiting for an opponent.';
        return 'A stone chess table: slate and sandstone squares, a driftwood set against a whalebone one. Sit on a bench to play.';
      }
      /* ---------------- THE POKER TABLE (handoff/poker_plan.md): the same sitting and the same swap of camera and HUD as
         the chess park, with a felt instead of a board. Everything the page draws comes from the table's row - see
         core.js's poker block for what travels and for why the hole cards travel with it. */
      let POKERV = null;
      const PK_FX = {};   /* per table, what the felt last looked like to you - so a card going out is one sound, not five */
      const PKF = core.pokerSeatFlags ? core.pokerSeatFlags() : [1, 2, 4, 8, 16];   /* in the hand, folded, all-in, dealt in, has answered */
      const pkEsc = s => String(s == null ? '' : s).replace(/</g, '&lt;');   /* the names in the panel and the log; esc() below is only ever local to the tap menu */
      function pokerWho(pid) {   /* [Claude 2026-10-11] the operator: the player list goes by arcade @tag, the game name only for a guest without one */
        if (pid === PID) { const w = boardWho(); if (w && w.charAt(0) === '@') return w; }
        else { const r = remotes.get(pid); if (r && r.from && r.from.tag) return '@' + String(r.from.tag).replace(/^@/, '').slice(0, 16); }
        const p = core.S.players[pid]; return p && p.name ? pkEsc(p.name) : 'someone';
      }
      function pokerSeatOf(st, ref) { return (st.se || []).find(s => (s[0] | 0) === (ref | 0)) || null; }
      function pokerModel(t) {   /* what lies on the felt: the board, each chair's two cards - face down unless they are yours, or the hand has been shown - the bets, the button, whose turn */
        const st = core.pokerOf(t), show = st.o === 'playing' && st.st === 'none', hands = [], bets = {};
        const ms = me.seat && me.seat.k === 'pk' && me.seat.t === t ? me.seat.s | 0 : -1;   /* whose cards are yours is your chair at this table, not the id beside it: in a room both games call their own player "me" */
        for (const s of st.se || []) {
          const ref = s[0] | 0, f = s[4] | 0, h = (st.hc || []).find(x => (x[0] | 0) === ref);
          if (!h) continue;   /* nothing in front of that chair - sitting it out, or the hand is folded and mucked */
          if (f & PKF[1]) continue;   /* [Claude 2026-10-12] a folded hand is mucked, face down and gone - never shown (the operator: "it shows the cards of people who folded") */
          const sd = show && st.r && st.r.sd ? st.r.sd.find(x => (x[0] | 0) === ref) : null;   /* [Claude 2026-10-11] at the showdown every shown hand lies face up, on every copy */
          const c = sd ? [sd[1] | 0, sd[2] | 0] : typeof h[1] === 'number' ? [h[1] | 0, h[2] | 0] : null, up = !!c && !!sd;   /* face up: only a hand called to the showdown - not every hand this copy happens to know (the dealer knows them all); [Claude 2026-10-14] your own stay face down on the felt too, the HUD's box over them shows them to you (the operator) */
          hands.push({ ref, c: up ? c : null, down: up ? 0 : 1, tilt: up ? 1 : 0 });
          bets[ref] = s[3] | 0;
        }
        return { board: (st.bo || []).slice(), hands, bets, pot: st.p | 0, big: st.bg | 0, dealer: st.d >= 0 ? st.d : null, turn: st.a >= 0 && st.o === 'playing' && st.st !== 'none' ? st.a : null };
      }
      /* [Claude 2026-10-13] the operator: "Add the poker game history to the chat box". The dealer's own game already hears the table
         (its core tells the players in the room); every other copy reads the row's last lines (lg) and their running count
         (lc) and writes the ones it has not written yet - for a player at that table, or anyone standing on its floor. */
      const PK_LC = {};
      function pokerChat(t) {
        const st = core.pokerOf(t), lc = st.lc | 0, lg = st.lg || [];
        if (st.mine === 1 || !lc) { PK_LC[t] = lc; return; }
        const T = core.pokerTableById(t), near = (me.seat && me.seat.t === t) || (T && (T.lv | 0) === (me.lv | 0) && Math.max(Math.abs(T.x - me.x), Math.abs(T.y - me.y)) < 12);
        const seen = PK_LC[t]; PK_LC[t] = lc;
        if (!near || seen == null || lc <= seen) return;
        for (const line of lg.slice(Math.max(0, lg.length - Math.min(lg.length, lc - seen)))) hud.chat(line, 'table');
      }
      function pokerView(t) {   /* the panel's view of the table, all of it out of the row it was sent */
        const st = core.pokerOf(t), s = me.seat && me.seat.t === t ? me.seat.s | 0 : -1, mine = pokerSeatOf(st, s);
        const f = mine ? mine[4] | 0 : 0, dealt = !!((f & PKF[3]) && !(f & PKF[1])), call = Math.max(0, (st.b | 0) - ((mine && mine[3]) | 0));
        const live = st.o === 'playing' && st.st !== 'none', hh = (st.hc || []).find(x => (x[0] | 0) === s);
        const v = {
          t, seat: s, me: PID, hand: st.h | 0, street: st.st, open: !live, pot: st.p | 0, bet: st.b | 0, dealer: st.d, turn: st.a, buy: st.buy | 0,   /* [Claude] the buy-in, for the panel */
          seats: (st.se || []).map(x => ({ ref: x[0] | 0, id: x[1], name: pokerWho(x[1]), chips: x[2] | 0, bet: x[3] | 0, folded: !!((x[4] | 0) & PKF[1]), allin: !!((x[4] | 0) & PKF[2]), dealt: !!((x[4] | 0) & PKF[3]), away: !!((x[4] | 0) & (PKF[5] || 32)) })),
          away: !!(mine && ((mine[4] | 0) & (PKF[5] || 32))),   /* [Claude] dealt out for sitting on a hand: the panel offers the way back */
          board: (st.bo || []).slice(), hole: hh && typeof hh[1] === 'number' ? [hh[1] | 0, hh[2] | 0] : null,
          log: (st.lg || []).slice(), result: st.r, inHand: dealt, myTurn: live && dealt && (st.a | 0) === s, call, stack: (mine && mine[2]) | 0, pending: !!PK_PEND[t],
          winners: st.r ? st.r.p.map(q => q[1]).reduce((a, b) => a.concat(b), []) : [],
          shown: st.r && st.r.sd ? st.r.sd.map(x => ({ ref: x[0] | 0, c: [x[1] | 0, x[2] | 0], name: String(x[3] || '') })) : [],   /* [Claude 2026-10-11] the showdown */
          min: Math.min((st.b | 0) + (st.mr | 0 || st.bg | 0 || 50), (st.b | 0) + ((mine && mine[2]) | 0)), big: st.bg | 0
        };
        return v;
      }
      function pokerFx(t, row) {   /* the small sound of the felt changing under your hands: a card going out, a new street */
        const sig = ((row.bo || []).length) + ':' + row.st;
        if (PK_FX[t] !== sig) { PK_FX[t] = sig; sfx('click'); }
      }
      function pokerEnter(t) {
        const at = SCENE.pokerAt ? SCENE.pokerAt(t) : null, T = core.pokerTableById(t), s = me.seat && me.seat.t === t ? me.seat.s | 0 : -1;
        if (at && T && T.seats[s]) {   /* from your own eyes at the felt: leaning a little over your own side of it, the whole table in front of you */
          if (cam.mode !== 'poker') cam.save = { yaw: cam.tyaw, pitch: cam.tpitch, dist: cam.tdist };
          const seat = T.seats[s], dx = seat[0] + 0.5 - at.x, dz = seat[1] + 0.5 - at.z, L = Math.hypot(dx, dz) || 1;
          POKERV = { x: at.x, y: at.y + 0.55, z: at.z, yaw: Math.atan2(-dx, -dz), eye: { x: at.x + dx / L * (L + 0.45), y: at.y + 0.92, z: at.z + dz / L * (L + 0.45) }, look: { x: at.x - dx / L * 0.55, y: at.y - 0.02, z: at.z - dz / L * 0.55 } };   /* your own cards lie 0.60 out and lean up; at 1.30 they sat against the bottom edge of the frame, so an eye a little further back and a look a little higher - they sit just inside it now, with the far chair and the room over the rail */
          cam.mode = 'poker';
        }
        myEnt.restPose = 'sit';
        const askStand = () => { const st = core.pokerOf(t), inHand = (st.se || []).some(x => x[1] === PID && ((x[4] | 0) & PKF[3]) && !((x[4] | 0) & PKF[1])) && st.st !== 'none';
          hud.confirm(inHand ? 'Fold and stand up?' : 'Stand up?', inHand ? 'You are in a hand: standing up now folds it and leaves the chips already in the pot.' : 'Leave the card table?', inHand ? 'Fold and stand' : 'Stand up', 'Stay', () => send({ c: 'stand' })); };
        POKER_ASK = askStand;
        if (hud.pokerOpen) hud.pokerOpen(pokerView(t), { act: (a, to) => pokerAct(t, a, to), stand: askStand });
      }
      function pokerLeave(t) {
        if (cam.mode === 'poker') { cam.mode = null; if (cam.save) { cam.tyaw = cam.save.yaw; cam.tpitch = cam.save.pitch; cam.tdist = cam.save.dist; cam.save = null; } }
        POKERV = null; myEnt.restPose = null; delete PK_FX[t];
        if (hud.pokerClose) hud.pokerClose();
      }
      function pokerAct(t, a, to) {   /* the panel's buttons: the table's own rules answer whether it was a legal one */
        if (!me.seat || me.seat.k !== 'pk' || me.seat.t !== t) return;
        const st = core.pokerOf(t), mine = pokerSeatOf(st, me.seat.s);
        if (a === 'back') { send({ c: 'pact', a: 'back' }); return; }   /* [Claude] dealt out: come back for the next hand */
        if (!mine || !((mine[4] | 0) & PKF[3]) || (mine[4] | 0) & PKF[1]) { hud.chat('You are not in this hand.', 'sys'); return; }
        if (st.o !== 'playing' || st.st === 'none') { hud.chat('Nothing is on the felt at the moment.', 'sys'); return; }
        if ((st.a | 0) !== (me.seat.s | 0)) { hud.chat('It is not your turn yet.', 'sys'); return; }
        send({ c: 'pact', a: String(a), to: to == null ? undefined : to | 0 });
        if (a !== 'back') { const now = performance.now(); PK_PEND[t] = { a: String(a), to: to == null ? undefined : to | 0, key: pkKey(st), at: now, first: now, tries: 0 }; }
        if (hud.pokerUpdate) hud.pokerUpdate(pokerView(t));
      }
      /* [Claude 2026-10-12] the operator: the turn ring "should also be a visual timer for that player's turn to act ... like a clock
         changing colors around the ring, and it should start beeping when the player only has 10 seconds, but only audible
         to the player whose turn it is". Each copy times the turn from the moment it sees it change (the dealer folds a seat
         after the table's clock, PK_CLOCK ticks); the beep is a local sound, once a second, for the one whose turn it is. */
      const PKT = {}, PK_SECS = ((core.pokerClockTicks ? core.pokerClockTicks() : 100) * 600) / 1000;
      /* [Claude 2026-10-13] the operator: "it stayed on the call raise fold menu and never switched over to showing the results ...
         even when the timer ran out it still stayed stuck". After you act the panel waits ("waiting for the table") instead
         of offering the same buttons; the action is sent again if the table has not moved in 6 s (a lost message), and if
         the table stays silent - your action unanswered for 20 s, or nobody's turn moving for the table's whole clock and
         20 s more - this page reconnects to the room, which hands it the table as it really is (or, if the dealer is gone,
         a fresh table with your stack cashed out). */
      const PK_PEND = {}, PK_STALE = {};
      const pkKey = st => (st.h | 0) + ':' + st.st + ':' + st.a + ':' + (st.b | 0) + ':' + (st.p | 0) + ':' + (st.se || []).map(x => x[0] + '.' + x[2] + '.' + x[3]).join(',');
      function pkRescue(t, why) {
        delete PK_PEND[t]; PK_STALE[t] = 1;
        hud.chat('The card table stopped answering (' + why + ') - reconnecting to the room.', 'sys');
        if (room) netDrop('the card table stopped answering', false);
      }
      function pokerClock(now) {
        if (me.seat && me.seat.k === 'pk' && SCENE.pokerSpots && hud.pokerAnchor) {   /* [Claude 2026-10-14] the HUD's card boxes ride over their spots on the felt */
          const sp = SCENE.pokerSpots(me.seat.t, me.seat.s | 0);
          hud.pokerAnchor(sp ? { board: toScreen(sp.board, 0), hole: sp.hole ? toScreen(sp.hole, 0) : null } : null);
        }
        if (!SCENE.pokerTimer) return;
        for (const T of core.pokerTables()) {
          const st = core.S.poker[T.id];
          const pend = PK_PEND[T.id];
          if (pend && st && pkKey(st) !== pend.key) { delete PK_PEND[T.id]; if (hud.pokerUpdate && me.seat && me.seat.t === T.id) hud.pokerUpdate(pokerView(T.id)); }
          else if (pend && now - pend.first > 20000) pkRescue(T.id, 'your ' + pend.a + ' was never answered');
          else if (pend && now - pend.at > 6000 && pend.tries < 2) { pend.tries++; pend.at = now; send({ c: 'pact', a: pend.a, to: pend.to }); }
          if (!st || st.o !== 'playing' || st.st === 'none' || !(st.a >= 0)) { delete PKT[T.id]; continue; }
          const key = (st.h | 0) + ':' + st.st + ':' + st.a + ':' + (st.b | 0) + ':' + (st.p | 0);
          let k = PKT[T.id]; if (!k || k.key !== key) k = PKT[T.id] = { key, t0: now, beeped: 99 };
          const left = Math.max(0, PK_SECS - (now - k.t0) / 1000);
          SCENE.pokerTimer(T.id, left / PK_SECS);
          const seatedHere = me.seat && me.seat.k === 'pk' && me.seat.t === T.id;
          if (seatedHere && st.mine !== 1 && !PK_STALE[T.id + ':' + k.key] && now - k.t0 > (PK_SECS + 20) * 1000) { PK_STALE[T.id + ':' + k.key] = 1; pkRescue(T.id, 'the turn never moved'); }
          const mine = me.seat && me.seat.k === 'pk' && me.seat.t === T.id && (st.a | 0) === (me.seat.s | 0);
          if (mine && left > 0 && left <= 10) { const sec = Math.ceil(left); if (sec < k.beeped) { k.beeped = sec; sfx('beep'); } }
        }
      }
      let SOL_ATLAS = null;
      function openSolitaire() { if (!SOL_ATLAS && SCENE.cardAtlas) SOL_ATLAS = SCENE.cardAtlas(); if (hud.solitaireOpen) hud.solitaireOpen({ atlas: SOL_ATLAS, sfx }); }
      function pokerExamine(st) {
        const inhand = (st.se || []).filter(s => (s[4] | 0) & PKF[3]).map(s => pokerWho(s[1]));
        if (st.o === 'playing' && st.st !== 'none') return 'A hand is on the felt: ' + (st.p | 0) + ' in the pot, ' + inhand.length + ' in it' + (st.bo.length ? ', ' + st.bo.length + ' cards on the board.' : ', nothing on the board yet.') + ' Sit in a free chair and it will deal you in.';
        if ((st.se || []).length) return 'A round felt table for eight, with ' + (st.se || []).map(s => pokerWho(s[1])).join(', ') + ' sitting. ' + (st.o === 'playing' ? 'They are between hands.' : 'Waiting for players.');
        return 'A round felt table for eight under a wheel of candles, its rail turned dark. Sit in a chair to play: the table deals itself.';
      }
      function openWardrobe(first, who) {
        if (!myEnt.H.setOutfit || !MOD.outfitStyles) return;
        const before = myEnt.H.outfit;
        cam.mode = 'creator'; cam.save = { yaw: cam.tyaw, pitch: cam.tpitch, dist: cam.tdist };
        const HC = ((D.rules.homes || {})[core.homeOf(me)] || {}).creator || null;   /* the home's own creator: styles, labels, defaults */
        hud.creator({ first, home: HC, title: who || 'Wardrobe', look: before, startPoints: first && core.START ? core.START.points : 0, startMax: core.START ? core.START.max : 5, name: first ? '' : me.name, styles: MOD.outfitStyles, palette: MOD.palette,
          onChange: look => myEnt.H.setOutfit(look), onTurn: () => { cam.spin = ((cam.spin || 0) + Math.PI / 2) % (2 * Math.PI); },   /* see the back of your hair and clothes */
          onDone: (look, name, start) => { cam.spin = 0; send({ c: 'look', look });   /* no name: the @tag is the name (2026-10-15) */ if (start && Object.keys(start).length) send({ c: 'start', pts: start }); cam.mode = null; cam.tyaw = cam.save.yaw; cam.tpitch = cam.save.pitch; cam.tdist = cam.save.dist; if (first) { hud.showHelp(true); } } });
      }
      { const HD = (D.rules.homes || {})[core.homeOf(me)] || {};
        hud.chat('Welcome to ' + (HD.name || 'Ashvale') + '.', 'sys');
        if (!save) hud.chat(HD.first || 'Elder Maren waits by the well. Tap her to talk.', 'sys'); }
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
        screenOf(kind, id) { let pos, up = 0.8; if (kind === 'mob') { const e = ents.get('m:' + id); pos = e.root.position; up = (e.H.height || 1) * e.scale * 0.5; } else if (kind === 'npc') { const e = ents.get('n:' + id); pos = e.root.position; } else if (kind === 'item') { const o = gItems.get(id); pos = o.position; up = 0.08; } else if (kind === 'tile') { pos = new THREE.Vector3(id[0] + 0.5, heightAt(id[0] + 0.5, id[1] + 0.5) + 1.8 * (me.lv | 0), id[1] + 0.5); up = 0; }   /* [Claude 2026-10-11] on an upper storey the tile is the floor you stand on, not the ground under the house */ else if (kind === 'world') { pos = new THREE.Vector3(id[0], id[1], id[2]); up = 0; } else if (kind === 'square') { const a = SCENE.chessAt && SCENE.chessAt(id[0]); if (!a) return null; const f = id[1].charCodeAt(0) - 97, r = +id[1][1] - 1; pos = new THREE.Vector3(a.x - 3.5 * 0.12 + f * 0.12, a.y, a.z + 3.5 * 0.12 - r * 0.12); up = 0.01; } else if (kind === 'me') { pos = myEnt.root.position; } else if (kind === 'remote') { const e = ents.get('r:' + id); if (!e || !e.root.visible) return null; pos = e.root.position; up = (e.H.height || 1.6) * e.scale * 0.5; } const s = toScreen(pos, up); if (!s) return null; const r = host.getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; },
        give(id, n) { const p = me; for (let k = 0; k < (core.item(id).stack ? 1 : n || 1); k++) { const f = p.inv.indexOf(null); if (core.item(id).stack) { const i = p.inv.findIndex(s => s && s.id === id); if (i >= 0) { p.inv[i].n += n || 1; break; } } if (f < 0) break; p.inv[f] = { id, n: core.item(id).stack ? n || 1 : 1 }; } hud.refresh('all'); },
        setLevel(skill, L) { me.xp[skill] = core.xpFor(L) * 10; if (skill === 'hitpoints') me.hp = L; hud.refresh('all'); },
        teleport(x, y) { me.x = x; me.y = y; me.path = []; place(myEnt, x, y); cam.snap = true; streamRegions(); arriveCheck(); },
        paintScores,
        netHealth: () => ({ online: !!room, lost: NW.lost, heardAgo: NW.heard ? Math.round(performance.now() - NW.heard) : null, fails: NW.fails, saveFails }), _netBreak: () => { if (room) { const R = room; R.send = () => Promise.resolve(false); } },
        zones: () => ({ loaded: (core.D.zones || []).map(z => z.id), index: ZINDEX ? ZINDEX.map(z => z.id) : null, waiting: Object.keys(LZ_WAIT), travelling }),
        _ent: k => ents.get(k), _traps: () => [...gTraps.keys()],
        _inject: (id, data, keep) => { onNet({ from: { id: String(id) }, data }); const r = remotes.get(String(id)); if (keep && r) r.heard = 1e15; },   /* keep: a film's scripted player is never 'silent' (a frozen clock) */   /* [Claude 2026-10-12] tests and films: a room message from a scripted player, as if heard */   /* tests: an entity by key ('n:<npc id>', 'm:<uid>') */
        tap: tapAt, menuAt, targetsAt, pad: () => PAD && PAD.state(), fps: () => frames, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }), setCam(y, p, d) { if (y != null) cam.tyaw = cam.yaw = y; if (p != null) cam.tpitch = cam.pitch = p; if (d != null) cam.tdist = cam.dist = d; },
        myPos: () => [myEnt.root.position.x, myEnt.root.position.z, myEnt.yaw],   /* tests: where I am drawn (fluid travel) */
        remotesInfo: () => Array.from(remotes).map(([id, r]) => ({ id, boat: r.boat, ride: r.ride, offline: !!r.offline, name: r.name, via: r.via || null, at: [Math.round(r.e.root.position.x), Math.round(r.e.root.position.z)] })),   /* tests: who rides with whom, and who is a dropped-out partner */
        tables: () => ({ deal: Object.assign({}, TBL.deal), tj: Object.assign({}, TBL.tj), rooms: tbl ? tbl.rooms().map(R => R.id) : [], mem: Object.fromEntries(Object.entries(TBL.mem).map(([k, M]) => [k, Array.from(M).map(([id, m]) => [id, m.j, m.s, m.d])])) }),
        remoteView: id => { const r = remotes.get(id); return r ? { x: r.e.root.position.x, z: r.e.root.position.z, anim: r.anim, vs: r.vs || 0, dly: r.dly || 0 } : null; },   /* tests: how another player is drawn here */
        net: () => ({ host: hostOf(zoneHere()), amHost: !!room && hostOf(zoneHere()) === myNetId, hosts: Object.fromEntries(hosts), hosted: Array.from(hosted), area: zoneHere(), region: roomZone, myId: myNetId, ids: Array.from(remotes.keys()), room: room && room.id, me: room && room.me, neighbours: nb ? nb.rooms().map(R => R.id) : [], viewers: Array.from(remotes).filter(e => e[1].viewOnly).map(e => e[0]), status: netStatus, stats: Object.assign({ perSec: +(netStats.sent / Math.max(1, (performance.now() - netStats.t0) / 1000)).toFixed(2) }, netStats, { times: undefined }), gear: Array.from(remotes.values()).map(r => [r.name, r.e.H.gear || null]), remotes: Array.from(remotes.keys()), names: Array.from(remotes.values()).map(r => r.e.tag && r.e.tag.textContent.replace(/^Total level \d+/, '')) }),   /* the name itself, without the level line above it */
        weather: (kind, intensity, ticks) => coreCall(() => core.setWeather(zoneHere(), kind, intensity == null ? 80 : intensity, ticks || 500)),
        skyDirs: () => ({ north: trueNorth(me.x, me.y), season: SEASON.name, sun: SUNL.sv, moon: SUNL.mv, info: { eclipse: +(SUNL.eclipse || 0).toFixed(3), lunar: +(SUNL.lunar || 0).toFixed(3) } }),   /* a test aims the camera at the sun or the moon */
        wx: () => Object.assign({ season: SEASON.name, snowy: SEASON.snowy }, wxMod && wxMod.state ? wxMod.state() : {}),
        progInfo: () => { const P = renderer.info.programs || [], I = renderer.info; return { n: P.length, calls: I.render.calls, tris: I.render.triangles, geos: I.memory.geometries, tex: I.memory.textures, applyMs: SEASON.applyMs, applies: SEASON.applies }; },
        tapTarget: (t) => { const o = optionsFor(t)[0]; if (o) doAct(o); return o ? o.html : null; },
        fortune: () => FE,   /* [Claude 2026-10-16] tests: the Fortune Engines' part */
        pet: () => PET, petToggle: () => hudApi().toggle('showPet'),   /* [Claude 2026-10-17] tests: the pets part, the Settings toggle */
        pokerNetRow: t => pkNet(core.pokerRow(t)), _pokerModel: t => pokerModel(t), _pokerView: t => pokerView(t), _pokerClock: () => JSON.parse(JSON.stringify(PKT)), solitaire: () => openSolitaire(), _dropNext: k => { DROP_NEXT = k; }, pokerKey: () => MYPK, pokerSealed: t => PH[t] || null,   /* [Claude 2026-10-12] tests: the row as it leaves this dealer */   /* a test taps a thing as a player would (first option) */
        travelShown: () => { const el = host.querySelector('.travel'); return el && el.style.display !== 'none' ? el.className + ' | ' + el.querySelector('.tt').textContent : null; },
        say, store, models: MOD, allowedAsset, wallet: walletApi(DATA.items.items), walletState: () => walletState, walletRefresh,
        chestEventForTest: chestEvent,
        renderInfo: () => { let meshes = 0; scene.traverse(o => { if (o.isMesh) meshes++; }); return { geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, meshes, programs: (renderer.info.programs || []).length }; },   /* memory probes (2026-10-08: iPhone out-of-memory crashes) */
        showPals(rows, note) { PALS.rows = (rows || []).map(r => ({ tag: String(r.tag || '').replace(/^@/, ''), online: !!r.online })); PALS.note = note || ''; if (hud.tab === 'friends') hud.refresh('friends'); },
        chest: { home: h => ENGBANK.setChestHome(h), homes: () => ENGBANK.chestHomes(), heard: rows => ENGBANK.chestsHeard({ q: 't', of: 1, rows }), state: chestState, take: chestTake, store: chestStore, promise: paid => { const L = ledgerFor(walletState.address); for (const k in paid) L.pend[k] = (L.pend[k] || 0) + paid[k]; ledgerSave(); },
          resetLedgerForTest: () => { if (!walletState.address) return; ledgerDrop(); save = null; try { G.localStorage.removeItem(CKEY(walletState.address)); } catch (e) { /* none */ } ledgerFor(walletState.address); },   /* a lost count: the tests' worst case */
          paidForTest: paid => { const L = ledgerFor(walletState.address); for (const k in paid) { const toChest = Math.min(paid[k], L.lchest[k] || 0); L.lchest[k] -= toChest; L.pchest[k] = (L.pchest[k] || 0) + toChest; L.pend[k] = (L.pend[k] || 0) + paid[k] - toChest; } ledgerSave(); } },   /* tests */ trip: () => TRIP && TRIP.state(), trade: () => trade, peers: () => Array.from(remotes.values()).map(r => r.from), _remIds: () => Array.from(remotes.keys()), optionsAt: (cx, cy) => { const L = []; for (const t of targetsAt(cx, cy)) for (const o of optionsFor(t)) L.push(o.html.replace(/<[^>]+>/g, '')); return L; }, _remAnim: () => JSON.stringify(Array.from(remotes.values()).map(r => [r.anim, r.buf.length, r.buf.length && r.buf[r.buf.length - 1].a])),
        stop() { stopped = true; },
        sfxAt: (n, at) => sfx(n, at), sky: () => { const B = SUNL.b, s = sunAt(Date.now()), M = moonAt(Date.now(), s); return B ? { up: dot3(s, B.u), moonUp: dot3(M.v, B.u), moonLit: M.lit, dir: SUNL.dir, sun: sun.intensity, hemi: hemi.intensity } : null; },
        versionCheck, oneDevice: () => ({ sid: ONE.sid, at: ONE.at, room: !!ONE.room, addr: ONE.addr, stopped, version: VER.mine, told: VER.told })
      };
      void _handle;
      return game;
    }
    return { api: 1, start, openStore };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engine', { api: 1, v: 2, needs: { three: 160, core: 2, models: 1, scene: 2, hud: 1, net: 2, trade: 1, wallet: 1, trip: 2, audit: 1, gamepad: 1, data: 1, engsky: 1, engbank: 1, engfortune: 1, engpet: 1, engmusic: 1 } }, engineFactory);
})(typeof globalThis !== 'undefined' ? globalThis : this);
