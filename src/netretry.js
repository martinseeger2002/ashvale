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
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('netretry', { api: API, v: 1 }, () => ({ on: !!(G.fetch && G.fetch.__ashRetry) }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
