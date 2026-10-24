/* netretry.js - loaded FIRST (build.py JS_MODULES[0]): makes every later download retry. Phones on mobile data drop the
   odd request out of the ~150 module downloads, and the original launcher (whose loader cannot change: the arcade keeps
   every player's save under the launcher's inscription id, so the launcher is never re-inscribed) gave up on the first
   failure ("Module part.char.maren is missing", the operator's friend on Android 2026-10-05). The loader fetches with the
   global fetch, so wrapping it here covers every module after this one. */
(function (G) {
  'use strict';
  const API = 1;
  if (G.fetch && !G.fetch.__ashRetry) {
    const raw = G.fetch.bind(G);
    const wrapped = async function (url, opts) {
      let err;
      for (let k = 0; k < 6; k++) {
        if (k) await new Promise(r => setTimeout(r, 400 * k * k));
        try {
          const r = await raw(url, k ? Object.assign({}, opts || {}, { cache: 'reload' }) : opts);
          if (r.ok || r.status < 500 && r.status !== 408 && r.status !== 429) return r;
          err = new Error('HTTP ' + r.status);
        } catch (e) { err = e; }
      }
      throw err;
    };
    wrapped.__ashRetry = true; G.fetch = wrapped;
  }

  /* Parallel downloads (2026-10-06). The launcher's loader asks for the ~230 modules strictly one after another and
     waits for each, so a first load was ~230 round trips: 27 s on a desktop, 40 s on a low-end phone on slow 4G,
     and almost all of it waiting (measured). Here we look up the same newest registry the launcher picked (same
     lookup, same rule) and start every module still to come, PREFETCH_N at a time, in the order the loader will
     want them; when the loader asks, it gets the download already in flight or done. Anything that goes wrong here
     only means the loader fetches that file itself, exactly as before. */
  const PREFETCH_N = 16, CREATOR = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c', early = new Map(), asked = new Set();
  const abs = u => { try { return new URL(String(u), G.location.href).href; } catch (e) { return String(u); } };
  const stats = { started: 0, used: 0, failed: 0, ms: 0 };
  if (G.fetch && G.fetch.__ashRetry && !G.fetch.__ashEarly && G.ASH3D && G.ASH3D._defs && G.location && /^https?:/.test(G.location.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(G.location.hostname)) {   /* wherever the game is served from an arcade: /r/ and /content/ (2026-10-22: it asked for dogecoinarcade.com, so on pages.pepecoinarcade.com - and so ashvale.party - the ~450 files came one at a time, 140 s; a host without them only costs the one failed lookup) */
    const retrying = G.fetch;
    const early_fetch = function (url, opts) {
      if (!opts && typeof url === 'string') {
        const k = abs(url), pend = early.get(k); asked.add(k);   /* asked before we got to it: we will not fetch it twice */
        if (pend) { early.delete(k); stats.used++; return pend.then(r => r && r.ok ? r : retrying(url, opts), () => retrying(url, opts)); }
      }
      return retrying(url, opts);
    };
    early_fetch.__ashRetry = true; early_fetch.__ashEarly = true; G.fetch = early_fetch;
    const t0 = Date.now();
    (async () => {
      /* the list is newest first and a release's registry is its last inscription, so the newest registry is nearly always
         in the first few: ask for 10 (~1/20 of the bytes of the launcher's 300, which on slow 4G held the downloads back
         ~1.5 s), and only if none of them is a registry ask for the 300 the launcher saw */
      const pick = (L) => { let reg = null; for (const q of L || []) { const j = q && q.json; if (j && j.ashvale3d === 'registry' && (j.loader || 1) <= (G.ASH3D.LOADER || 1) && (!reg || j.version > reg.version)) reg = j; } return reg; };
      let reg = pick(await (await retrying('/r/inscriptions?creator=' + CREATOR + '&limit=10')).json());
      if (!reg) reg = pick(await (await retrying('/r/inscriptions?creator=' + CREATOR + '&limit=300')).json());
      if (!reg || !reg.modules) return;
      const defs = G.ASH3D._defs, todo = [];
      for (const k in reg.modules) {   /* the loader's own flatten(): data, zones and parts are groups */
        const grp = k === 'data' || k === 'zones' || k === 'parts';
        const items = grp ? Object.keys(reg.modules[k]).map(j => [k === 'zones' ? 'zone.' + j : k === 'parts' ? 'part.' + j : j, reg.modules[k][j]]) : [[k, reg.modules[k]]];
        for (const [name, e] of items) {
          const have = defs[name];
          if (!e || !e.id || have && String(have.meta.v) === String(e.v)) continue;   /* already here: the loader will not ask */
          todo.push(abs('/content/' + e.id));
        }
      }
      let i = 0;
      const lane = async () => {
        while (i < todo.length) {
          const u = todo[i++]; if (early.has(u) || asked.has(u)) continue;
          let done; const p = new Promise(r => { done = r; }); early.set(u, p); stats.started++;
          try { done(await retrying(u)); } catch (e) { stats.failed++; done(null); }
        }
      };
      await Promise.all(Array.from({ length: PREFETCH_N }, lane));
      stats.ms = Date.now() - t0;
    })().catch(e => { console.warn('ASHVALE: parallel downloads off (' + (e && e.message || e) + '), loading one by one'); });
  }

  /* [Claude 2026-10-13] THE LOADING SCREEN (the operator: "Make sure the loading Ashvale and loading Ziibiing screen are displayed
     until the game loads and add a progress bar"). The launcher (never re-inscribed) drops its "Loading Ashvale..." text the
     moment the code is in - before the save is opened and the land around you is loaded - so a black screen sat there.
     This module is the first the loader runs, so it puts up its own screen (#ashload, which the launcher does not know):
     the game's name, a bar and a line of what is happening. The download moves the bar to 70% (every /content/ answer
     counted against the modules still to come); the game then calls ASH_LOAD.set(frac, text) for the save and the land,
     and ASH_LOAD.done() once the world has been drawn. A start that fails shows its reason here. */
  if (G.document && !G.ASH_LOAD) {
    const D = G.document, home = typeof G.ASH3D_HOME === 'string' && /^[a-z]{2,16}$/.test(G.ASH3D_HOME) && G.ASH3D_HOME !== 'ashvale' ? G.ASH3D_HOME : 'ashvale';
    const title = home.charAt(0).toUpperCase() + home.slice(1);
    const css = D.createElement('style');
    css.textContent = '#ashload{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0b0906;color:#e8b54a;font:16px system-ui,sans-serif;transition:opacity .5s}' +
      '#ashload h1{margin:0;font:600 30px Georgia,serif;letter-spacing:4px;color:#f3d08a;text-transform:uppercase}' +
      '#ashload .bar{width:min(320px,72vw);height:10px;border-radius:6px;background:#2a2116;box-shadow:inset 0 0 0 1px #5b4526;overflow:hidden}' +
      '#ashload .fill{height:100%;width:0;background:linear-gradient(90deg,#b8862d,#f3d08a);transition:width .3s}' +
      '#ashload .say{font-size:13px;color:#cbb791;min-height:18px;text-align:center;padding:0 16px}#boot{visibility:hidden}';
    const root = D.createElement('div'); root.id = 'ashload';
    root.innerHTML = '<h1>' + title + '</h1><div class="bar"><div class="fill"></div></div><div class="say">Loading ' + title + '\u2026</div>';
    const put = () => { if (!D.body) return setTimeout(put, 20); D.head.appendChild(css); D.body.appendChild(root); };
    put();
    const fill = root.querySelector('.fill'), say = root.querySelector('.say');
    let frac = 0, gone = false;
    const L = G.ASH_LOAD = {
      set(f, text) { if (gone) return; if (typeof f === 'number' && f > frac) { frac = Math.min(1, f); fill.style.width = (frac * 100).toFixed(1) + '%'; } if (text) say.textContent = text; },
      done() { if (gone) return; L.set(1, 'Welcome to ' + title + '.'); gone = true; root.style.pointerEvents = 'none'; setTimeout(() => { root.style.opacity = '0'; setTimeout(() => root.remove(), 600); }, 250); },
      shown: () => !gone
    };
    L.set(0.03);
    /* a page that loads these modules but is not the game (the Atlas) never starts it: if nothing claims the screen
       (engine.start sets ASH_LOAD.claimed) within 3 s of the modules being in, it goes */
    let inAt = 0; const lone = setInterval(() => {
      if (gone || L.claimed) { clearInterval(lone); return; }
      if (G.ASH3D && G.ASH3D._values) { if (!inAt) inAt = Date.now(); else if (Date.now() - inAt > 3000) { clearInterval(lone); L.done(); } }
    }, 250);
    /* the download: count /content/ answers against the modules the registry still has to bring */
    let want = 0, got = 0;
    const cnt = G.fetch;
    if (cnt) {
      const counting = function (url, opts) {
        const p = cnt(url, opts);
        if (typeof url === 'string' && url.indexOf('/content/') >= 0) p.then(() => { got++; if (want) L.set(0.05 + 0.65 * Math.min(1, got / want), 'Loading ' + title + '\u2026 ' + Math.min(got, want) + ' of ' + want); }, () => {});
        return p;
      };
      for (const k of ['__ashRetry', '__ashEarly']) if (cnt[k]) counting[k] = cnt[k];
      G.fetch = counting;
    }
    (async () => {
      try {
        const r = await cnt('/r/inscriptions?creator=' + CREATOR + '&limit=10'); const Li = await r.json(); let reg = null;
        for (const q of Li || []) { const j = q && q.json; if (j && j.ashvale3d === 'registry' && (!reg || j.version > reg.version)) reg = j; }
        if (reg && reg.modules) { let n = 0; const defs = (G.ASH3D && G.ASH3D._defs) || {}; for (const k in reg.modules) { const grp = k === 'data' || k === 'zones' || k === 'parts'; const items = grp ? Object.values(reg.modules[k]) : [reg.modules[k]]; for (const e of items) if (e && e.id) n++; } want = Math.max(1, n); }
      } catch (e) { /* no count: the bar moves with the game's own steps */ }
    })();
    /* a start that fails: the launcher writes the reason into #boot - show it here */
    const watch = () => { const b = D.getElementById('boot'); if (!b) return; const ob = new MutationObserver(() => { if (/could not/i.test(b.textContent || '')) { say.textContent = b.textContent; say.style.color = '#ff8a7a'; } }); ob.observe(b, { childList: true, characterData: true, subtree: true }); };
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', watch); else watch();
  }
  /* [Claude 2026-10-23] GZIPPED MODULES (the operator: "Everything should be gzipped that is changed", after @liteworldsquest's "3x smaller on
     chain"): a release inscribes each changed module gzipped (application/gzip, no base64). The launcher (never re-inscribed) unpacks only
     what its registry entry marks gz, and reads data, zones and parts as plain JSON - so the outermost fetch here unpacks every /content/
     file that starts with gzip's two bytes (1f 8b) and hands the launcher and the engine the plain file, exactly as before. This module
     itself is the one the launcher unpacks (its entry carries gz). A file served already unpacked passes through untouched. */
  const gzStats = { files: 0, packed: 0, plain: 0 };
  if (G.fetch && !G.fetch.__ashGz && typeof G.DecompressionStream === 'function' && typeof G.Response === 'function') {
    const inner = G.fetch;
    const gz_fetch = async function (url, opts) {
      const r = await inner(url, opts);
      const u = typeof url === 'string' ? url : (url && url.url) || '';
      if (!r || !r.ok || !/\/content\/[0-9a-f]{64}/.test(u)) return r;
      const buf = new Uint8Array(await r.arrayBuffer());
      gzStats.files++;
      if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        gzStats.packed += buf.length;
        const plain = await new Response(new Blob([buf]).stream().pipeThrough(new G.DecompressionStream('gzip'))).arrayBuffer();
        return new Response(plain, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
      }
      gzStats.plain += buf.length;
      return new Response(buf, { status: r.status, statusText: r.statusText, headers: r.headers });
    };
    gz_fetch.__ashRetry = true; gz_fetch.__ashEarly = !!inner.__ashEarly; gz_fetch.__ashGz = true; G.fetch = gz_fetch;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('netretry', { api: API, v: 6 }, () => ({ on: !!(G.fetch && G.fetch.__ashRetry), early: stats, gz: gzStats }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
