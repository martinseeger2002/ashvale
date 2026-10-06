/* ASHVALE 3D module loader (the only code that is not a replaceable module: it is baked into every page).
   Every part of the game is a module with a stable interface: three, net, core, models, engine and the data modules
   (items, monsters, shops, quests, rules, zone.<id>). A REGISTRY lists the current id + version + interface (api) of each:
     {"ashvale3d":"registry","version":N,"loader":1,"modules":{
        "three":{"id":..,"v":"0.160.0","api":160,"kind":"esm"}, "engine":{"id":..,"v":1,"api":1,"kind":"js"}, ...,
        "data":{"items":{..},...}, "zones":{"village":{..},"whisperwood":{..}}}}
   boot(): load the newest registry (fallback: the copy baked into the page), take each module from the page if the page
   carries that exact version, else fetch it by id; check every module's declared needs ({dep: api}) against what is loaded;
   an incompatible newer module falls back to the baked copy, and if nothing fits we stop with a clear message.
   Module code registers itself: ASH3D.define(name, {api, v, needs}, factory(deps)) for scripts, a JSON module is
   {"ashvale3d":"module","name","api","v","data"}, an ES module (kind "esm") exports its interface (+ optional `meta`). */
(function (G) {
  'use strict';
  const A = G.ASH3D = G.ASH3D || {};
  const defs = A._defs = A._defs || {};
  A.LOADER = 1;
  A.define = function (name, meta, factory) { defs[name] = { meta: meta || {}, factory, src: A._src || 'page' }; };
  A.defineData = function (j) { if (!j || j.ashvale3d !== 'module') throw new Error('not an ashvale3d data module'); defs[j.name] = { meta: { api: j.api, v: j.v, data: true }, factory: () => j.data, src: A._src || 'page' }; };
  A.get = function (name) { return A._values ? A._values[name] : undefined; };   /* an instantiated module, after boot */
  A.defineValue = function (name, meta, value) { defs[name] = { meta: meta || {}, factory: () => value, src: A._src || 'page' }; };

  /* registry -> flat list [{name, entry}] ; zones.X -> "zone.X", data.X -> "X" */
  function flatten(reg) {
    const out = [], M = reg.modules || {};
    for (const k in M) {
      if (k === 'data' || k === 'zones' || k === 'parts') { for (const j in M[k]) out.push({ name: k === 'zones' ? 'zone.' + j : k === 'parts' ? 'part.' + j : j, group: k, entry: M[k][j] }); }
      else out.push({ name: k, group: '', entry: M[k] });
    }
    return out;
  }
  /* phones on mobile data drop the odd request out of ~150: retry each one before giving up */
  async function fetchRetry(url, name) {
    let err;
    for (let k = 0; k < 6; k++) {
      if (k) await new Promise(r => setTimeout(r, 400 * k * k));
      try { const r = await fetch(url, k ? { cache: 'reload' } : undefined); if (r.ok) return r; err = new Error(name + ': HTTP ' + r.status); if (r.status === 404) break; }
      catch (e) { err = e; }
    }
    throw err;
  }
  async function fetchModule(name, e, base) {
    const url = (base || '/content/') + e.id;
    const r = await fetchRetry(url, name);
    if (e.kind === 'json') { const j = await r.json(); A._src = 'remote'; A.defineData(j); A._src = null; return; }
    const blob = await r.blob();
    let text;
    if (e.gz) text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text(); else text = await blob.text();
    const bu = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    if (e.kind === 'esm') {
      const ns = await import(bu);
      defs[name] = { meta: Object.assign({ api: e.api, v: e.v }, ns.meta || {}), factory: () => ns, src: 'remote' };
    } else {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = bu; s.onload = res; s.onerror = () => rej(new Error(name + ': script failed')); A._src = 'remote'; document.head.appendChild(s); });
      A._src = null;
    }
  }
  function compatible(have, needApi) { return have && (have.meta.api === needApi || String(have.meta.api) === String(needApi)); }

  A.boot = async function (opts) {
    opts = opts || {};
    let reg = opts.baked, regSrc = 'baked';
    if (opts.registryUrl) {
      try {
        const r = await fetch(opts.registryUrl); const j = await r.json();
        if (j && j.ashvale3d === 'registry' && (j.loader || 1) <= A.LOADER && j.version >= reg.version) { reg = j; regSrc = 'remote'; }
      } catch (e) { console.warn('ASH3D: registry fetch failed, using the baked copy', e && e.message); }
    }
    const list = flatten(reg), baked = Object.assign({}, defs), report = [];
    for (const { name, entry } of list) {
      const have = defs[name];
      if (have && String(have.meta.v) === String(entry.v)) { report.push([name, entry.v, 'page']); continue; }
      if (entry.id && opts.content !== false) {
        try { await fetchModule(name, entry, opts.contentBase); report.push([name, entry.v, 'fetched']); continue; }
        catch (e) { console.warn('ASH3D: could not fetch ' + name + ', using the baked copy', e.message); }
      }
      if (have) report.push([name, have.meta.v, 'page (fallback)']); else throw new Error('Module "' + name + '" is missing and could not be loaded.');
    }
    /* interface check: every module's needs. "data" means every data/zone module. */
    const names = list.map(l => l.name), dataNames = list.filter(l => l.group === 'data' || l.group === 'zones' || l.group === 'parts').map(l => l.name);
    for (const n of names) {
      const d = defs[n], needs = d.meta.needs || {};
      for (const dep in needs) {
        const targets = dep === 'data' ? dataNames : [dep];
        for (const t of targets) {
          if (compatible(defs[t], needs[dep])) continue;
          if (compatible(baked[t], needs[dep])) { console.warn('ASH3D: ' + t + ' v' + defs[t].meta.v + ' does not fit ' + n + ', using the baked v' + baked[t].meta.v); defs[t] = baked[t]; continue; }
          throw new Error('This page needs ' + t + ' interface ' + needs[dep] + ' (for ' + n + ') but found ' + (defs[t] ? defs[t].meta.api : 'none') + '. Open the newest ASHVALE page.');
        }
      }
    }
    const values = {};
    function inst(n, stack) {
      if (n in values) return values[n];
      if (stack.indexOf(n) >= 0) throw new Error('module cycle: ' + stack.concat(n).join(' > '));
      const d = defs[n]; if (!d) throw new Error('missing module ' + n);
      const deps = {};
      for (const dep in (d.meta.needs || {})) {
        if (dep === 'data') { deps.data = {}; for (const t of dataNames) deps.data[t] = inst(t, stack.concat(n)); }
        else deps[dep] = inst(dep, stack.concat(n));
      }
      return (values[n] = d.factory(deps));
    }
    for (const n of names) inst(n, []);
    A._values = values;
    values.$registry = reg; values.$registrySource = regSrc; values.$report = report;
    return values;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
