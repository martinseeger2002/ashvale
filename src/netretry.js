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
  const PREFETCH_N = 8, CREATOR = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c', early = new Map(), asked = new Set();
  const abs = u => { try { return new URL(String(u), G.location.href).href; } catch (e) { return String(u); } };
  const stats = { started: 0, used: 0, failed: 0, ms: 0 };
  if (G.fetch && G.fetch.__ashRetry && !G.fetch.__ashEarly && G.ASH3D && G.ASH3D._defs && G.location && /^https?:/.test(G.location.protocol) && /(^|\.)dogecoinarcade\.com$/.test(G.location.hostname)) {   /* only where /r/ and /content/ exist */
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
      const L = await (await retrying('/r/inscriptions?creator=' + CREATOR + '&limit=300')).json();
      let reg = null;
      for (const q of L || []) { const j = q && q.json; if (j && j.ashvale3d === 'registry' && (j.loader || 1) <= (G.ASH3D.LOADER || 1) && (!reg || j.version > reg.version)) reg = j; }
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
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('netretry', { api: API, v: 2 }, () => ({ on: !!(G.fetch && G.fetch.__ashRetry), early: stats }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
