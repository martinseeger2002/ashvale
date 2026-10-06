/* ASHVALE 3D audit (module 'audit', api 1): the LIGHTER judge's rules, shared by the referee and the page.
   The referee runs it in QuickJS as judge(seed, inputs, params) (tools/judge3d_build.py wraps it with world.js, core.js
   and the data); the page runs the SAME code with the same seed before it claims, so it only claims the pools the
   referee will pay (2026-10-04: claims happen automatically; the referee judges 3 a minute per wallet).
     const A = ASH3D.get('audit').create(AshCore, data)   data = {items, monsters, shops, quests, rules}
     A.audit(seed, inputs, params) -> {won, lost, xp: {skill: shown XP}, gold, drops: {item: n}, ticks}
     A.judge(seed, inputs, params) -> {won: bool, ...}     (exactly what the referee answers)
   See tools/judge3d_tail.js history in PLAN.md for the rules: kills re-fought in an arena with the claimer's real stats
   and gear; gathering bounded by node speed and level; pools in binary lots (unit << bit). */
(function (G) {
  'use strict';
  const API = 1;
  function create(AshCore, DATA) {
    function arenaData(monKey) {
      var D = DATA, row = '............';
      var arena = { id: 'arena', origin: [0, 0], size: [12, 12], ground: 'grass', tiles: [row, row, row, row, row, row, row, row, row, row, row, row],
                    spawns: [{ m: monKey, x: 7, y: 6 }], npcs: [], objects: [], respawn: [4, 6] };
      return { items: D.items, monsters: D.monsters, shops: D.shops, quests: D.quests, rules: D.rules, zones: [arena] };
    }
    /* what the claimer really is: levels from their XP tokens, gear from their @ashvale NFTs (best wearable per slot) */
    function loadoutFrom(params) {
      var f = params.facts || {}, T = params.xpTokens || {}, xp = {};
      /* one XP token unit = one XP point as the game SHOWS it; core.js keeps XP x10 (hudpanels shows p.xp / 10) */
      for (var sk in T) { var u = f.tokens && f.tokens[String(T[sk])]; if (u != null) { var n = Math.floor(+u || 0); if (n > 0) xp[sk] = n * 10; } }
      if (!xp.hitpoints) xp.hitpoints = DATA.rules.xp[10];
      var owned = [];
      (f.pieces || []).forEach(function (p) {
        if (!p || !p.json) return;
        var at = p.json.attributes || [], k = p.json.key || null;
        at.forEach(function (a) { if (String(a.trait_type).toLowerCase() === 'key') k = String(a.value); });
        if (k && DATA.items[k]) owned.push(k);
      });
      return { xp: xp, owned: owned };
    }
    function fight(seed, n, monKey, L, food) {
      var D = arenaData(monKey), c = AshCore.create(D, { seed: seed + ':' + n });
      var save = { v: 1, xp: L.xp, inv: [] };
      for (var i = 0; i < Math.min(food, 20); i++) save.inv.push({ id: 'bread', n: 1 });
      while (save.inv.length < 28) save.inv.push(null);
      var p = c.addPlayer('p1', save);
      /* wear the best piece owned for each slot it fits (the claimer's real gear) */
      L.owned.forEach(function (k) { var slot = p.inv.indexOf(null); if (slot < 0) return; p.inv[slot] = { id: k, n: 1 }; c.cmd('p1', { c: 'equip', slot: slot }); c.tick(); });
      var m = c.S.mobs[0]; if (!m) return null;
      var xp0 = JSON.stringify(p.xp);
      c.cmd('p1', { c: 'attack', uid: m.uid, run: true });
      var t = 0;
      while (t < 400 && !m.dead && !p.dead) {
        if (p.hp * 3 < c.lv(p, 'hitpoints')) { var b = p.inv.findIndex(function (it) { return it && it.id === 'bread'; }); if (b >= 0) c.cmd('p1', { c: 'eat', slot: b }); }
        c.tick(); t++;
      }
      if (m.dead && !p.dead) for (var w = 0; w < 4; w++) c.tick();   /* the loot falls two ticks after the kill (core.js killMob: dropAt) */
      var gained = {}; for (var s in p.xp) gained[s] = (p.xp[s] || 0) - ((JSON.parse(xp0)[s]) || 0);
      var ground = [], gold = 0;
      (c.S.ground || []).forEach(function (g) { if (g.id === 'coins') gold += g.n | 0; else ground.push(g.id); });
      return { won: !!m.dead && !p.dead, ticks: t, xp: gained, ground: ground, gold: gold };
    }
    let memo = null;   /* the page asks about many pools for one window: the fights run once (same seed, trip, loadout) */
    function audit(seed, inputs, params) {
      const key = seed + '|' + JSON.stringify(inputs) + '|' + JSON.stringify(params.facts || {}) + '|' + JSON.stringify(params.xpTokens || {});
      if (memo && memo.key === key) return memo.out;
      const out = audit0(seed, inputs, params); memo = { key, out }; return out;
    }
    function audit0(seed, inputs, params) {
      var L = loadoutFrom(params), kills = (inputs.kills || []).slice(0, 200), food = Math.max(0, inputs.food | 0);
      var out = { won: 0, lost: 0, xp: {}, gold: 0, drops: {}, ticks: 0 };
      for (var n = 0; n < kills.length; n++) {
        var k = kills[n][0]; if (!DATA.monsters[k]) { out.lost++; continue; }
        var r = fight(seed, n, k, L, food);
        if (!r || !r.won) { out.lost++; continue; }
        out.won++; out.ticks += r.ticks; out.gold += r.gold;
        for (var s in r.xp) out.xp[s] = (out.xp[s] || 0) + Math.floor(r.xp[s] / 10);   /* back to shown XP = token units */
        r.ground.forEach(function (id) { out.drops[id] = (out.drops[id] || 0) + 1; });
      }
      return out;
    }
    function judge(seed, inputs, params) {
      try {
        if (!inputs || inputs.v !== 1) return { won: false, why: 'not an ASHVALE 3D trip' };
        var A = audit(seed, inputs, params || {});
        if (A.ticks > (inputs.ticks | 0) + 50) return { won: false, why: 'the fights take longer than the trip', audit: A };
        var P = params || {};
        /* binary lots (like GOLD): a pool of `unit << bit` pays when that bit of (earned / unit) is set, so a set of pools
           bit 0..n pays any amount exactly, one claim per set bit; {min} alone keeps the old threshold form */
        var bitOf = function (v, Q) { return ((Math.floor(v / (Q.unit || 1)) >> (Q.bit | 0)) & 1) === 1; };
        if (P.kind === 'xp') { var got = A.xp[P.skill] || 0; return { won: P.bit != null ? bitOf(got, P) : got >= (P.min | 0), audit: A }; }
        if (P.kind === 'gold') { var g = Math.floor(A.gold / (P.unit || 10)); return { won: ((g >> (P.bit | 0)) & 1) === 1, audit: A }; }
        if (P.kind === 'drop') return { won: (A.drops[P.item] || 0) > 0, audit: A };
        if (P.kind === 'resource') {
          /* gathering cannot be re-fought, so it is BOUNDED: one item per `speed` ticks of the node that gives it, only at or
             above the node's level, and never more than the trip lasted */
          var L = loadoutFrom(P), node = null, N = DATA.rules.nodes || {};
          for (var nk in N) if (N[nk] && N[nk].item === P.item) { node = N[nk]; break; }
          var claimed = Math.max(0, ((inputs.gathered || {})[P.item]) | 0);
          if (!node) return { won: false, why: 'no node gives ' + P.item };
          var lvl = 1, xpv = L.xp[node.skill] || 0, T = DATA.rules.xp;
          for (var i = 1; i < T.length; i++) if (xpv >= T[i]) lvl = i;
          if (lvl < (node.req || 1)) return { won: false, why: 'needs ' + node.skill + ' ' + node.req, audit: { claimed: claimed, level: lvl } };
          var cap = Math.floor(Math.max(0, inputs.ticks | 0) / Math.max(1, node.speed || 4));
          var paid = Math.min(claimed, cap);
          return { won: P.bit != null ? bitOf(paid, P) : paid >= (P.min | 0) && paid > 0, paid: paid, audit: { claimed: claimed, cap: cap, level: lvl } };
        }
        return { won: false, why: 'unknown pool kind', audit: A };
      } catch (e) { return { won: false, why: 'judge error: ' + (e && e.message) }; }
    }
    return { api: API, audit, judge, loadoutFrom };
  }
  const Audit = { api: API, create };
  G.AshAudit = Audit;
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('audit', { api: API, v: 1 }, () => Audit);
  if (typeof module !== 'undefined' && module.exports) module.exports = Audit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
