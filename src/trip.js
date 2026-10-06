/* ASHVALE 3D trip recorder (api 2): what the referee needs to verify play and pay for it (PLAN.md phases C/D, the operator
   2026-10-04: tradable NFTs as your inventory, tradable tokens as your Gold; the LIGHTER judge audits trips).
   TIME-BASED (2026-10-04: "everything just needs to be settled on a time base not on a location base because some
   people may not ever come back to town"): play is cut into windows of `ticks` game ticks (rules.trip.ticks, default
   1000 = 10 minutes at 0.6 s) wherever the player is. Each window asks the arcade viewer for a game seed when it opens
   ({arcade: 'seed', game: true}); a window without one is practice and can't be claimed. A window that closes with
   anything in it joins the claimable list. It records exactly what tools/judge3d_tail.js audits:
     {v: 1, ticks, food, kills: [[monsterKey, tick], ...], gathered: {itemId: n}}
     const T = ASH3D.get('trip').create({ core, pid, ticks, bridge(msg, kind, ms) -> Promise, onChange(state), keep })
     T.tick()          once per game tick (after core.tick)
     T.events(evs)     the core's events of that tick (kills by this player, successful gathers)
     T.close()         settle the open window now (leaving the page)
     T.claimed(i)      drop a settled window once its claim went through
     T.state()         {seed, rec, done: [{seed, rec, at}]}   (done = settled, claimable windows, oldest first)
   keep = {load() -> done list, save(list)}: unclaimed windows survive a reload. */
(function (G) {
  'use strict';
  const API = 2, MAX_DONE = 50;
  function create(o) {
    const core = o.core, pid = o.pid, onChange = o.onChange || (() => {}), keep = o.keep || null;
    const WIN = Math.max(100, (o.ticks | 0) || 1000);
    const bridge = o.bridge || (() => Promise.resolve({ error: 'no arcade viewer' }));
    let done = []; try { done = (keep && keep.load()) || []; } catch (e) { done = []; }
    const st = { seed: null, rec: null, t0: 0, note: '', done };
    const me = () => core.S.players[pid];
    function foodCount(p) { let n = 0; for (const it of p.inv || []) if (it) { const d = core.item(it.id); if (d && (d.category === 'food' || d.category === 'potion')) n += it.n || 1; } return n; }
    function open() {
      const p = me(); if (!p) return;
      st.t0 = core.S.t; st.seed = null; st.note = ''; st.facts = o.facts ? o.facts() : null;
      const rec = st.rec = { v: 1, ticks: 0, food: foodCount(p), kills: [], gathered: {} };
      bridge({ game: true }, 'seed', 8000).then(r => {
        if (st.rec !== rec) { if (r && r.seed) { for (const d of st.done) if (d.rec === rec && !d.seed) d.seed = String(r.seed); save(); } return; }
        st.seed = r && r.seed ? String(r.seed) : null; st.note = st.seed ? '' : 'practice: ' + ((r && r.error) || 'no seed'); onChange(st);
      });
    }
    function save() { try { if (keep) keep.save(st.done); } catch (e) { /* storage is optional */ } }
    function close() {
      const r = st.rec; if (!r) return;
      r.ticks = core.S.t - st.t0;
      if (r.kills.length || Object.keys(r.gathered).length) {
        st.done.push({ seed: st.seed, rec: r, at: Date.now(), facts: st.facts });
        while (st.done.length > MAX_DONE) st.done.shift();
        save();
      }
      st.rec = null; st.seed = null; onChange(st);
    }
    function tick() {
      const p = me(); if (!p) return;
      if (!st.rec) open();
      else if (core.S.t - st.t0 >= WIN) { close(); open(); }
    }
    function events(evs) {
      if (!st.rec) return;
      for (const e of evs || []) {
        if (e.e === 'die' && e.mob != null && e.killer === pid) { const m = core.mobByUid(e.mob); if (m && st.rec.kills.length < 200) st.rec.kills.push([m.key, core.S.t - st.t0]); }
        else if (e.e === 'gather' && e.p === pid && e.ok && e.item) st.rec.gathered[e.item] = (st.rec.gathered[e.item] || 0) + 1;
      }
    }
    function claimed(i) { if (i >= 0 && i < st.done.length) { st.done.splice(i, 1); save(); onChange(st); } }
    return { api: API, tick, events, close, claimed, window: WIN, state: () => st };
  }
  const Trip = { api: API, create };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('trip', { api: API, v: 2 }, () => Trip);
  if (typeof module !== 'undefined' && module.exports) module.exports = Trip;
})(typeof globalThis !== 'undefined' ? globalThis : this);
