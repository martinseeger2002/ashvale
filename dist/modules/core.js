/* ASHVALE 3D rules core: the rules of the world and nothing else (no screen, no sound, no clock).
   Deterministic: fixed 0.6 s ticks, a seeded random with a saveable state, integer maths for every rule, no Date and no
   Math.random. The same data modules + seed + recorded commands replay to the same state (the arcade's referee can judge a
   session later), exactly like RACE CONDITION's core.js.

   const core = AshCore.create(DATA, {seed}) where DATA = {items, monsters, shops, quests, rules, zones: [zone, ...]}
   core.addPlayer(id, save?)      a player (several may share the world: stage 3 adds remote players the same way)
   core.cmd(id, c)                queue a command; it is applied at the start of the next tick and recorded in core.log
   core.tick()                    advance one tick; returns this tick's events (also core.S.ev)
   Commands (c.c): walk{x,y} attack{uid} take{uid} npc{id} gather{x,y} use{slot} equip{slot} unequip{eq} eat{slot}
                   drop{slot} buy{shop,item,n} sell{shop,slot,n} style{i} run{on} retal{on} close{}
   XP is stored in TENTHS (like RuneScape's internal XP), levels come from DATA.rules.xp. */
(function (root) {
  'use strict';
  const API = 2;   /* 2 (globe P2): core.M is the chunked world (accessors), no more W x H arrays */

  function hashStr(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function Rng(seed) {
    let s = (typeof seed === 'number' ? seed : hashStr(seed)) >>> 0;
    const R = {
      next() { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
      int(n) { return Math.floor(R.next() * n); },
      get state() { return s; }, set state(v) { s = v >>> 0; }
    };
    return R;
  }

  const EQ_SLOTS = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring', 'pack'];
  const STYLES = {
    melee: [{ name: 'Accurate', xp: ['attack'], att: 3 }, { name: 'Aggressive', xp: ['strength'], str: 3 }, { name: 'Defensive', xp: ['defence'], def: 3 }],
    ranged: [{ name: 'Accurate', xp: ['ranged'], att: 3 }, { name: 'Rapid', xp: ['ranged'], spd: -1 }, { name: 'Longrange', xp: ['ranged', 'defence'], def: 3, rng: 2 }],
    magic: [{ name: 'Cast', xp: ['magic'] }, { name: 'Defensive cast', xp: ['magic', 'defence'], def: 3 }]
  };
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

  /* the map: a sparse chunk store with accessors (module `world`, src/world.js, GLOBE.md P2). The core keeps the rules. */
  let WORLD = null;
  function worldMod() { return WORLD || root.AshWorld || (typeof require === 'function' ? require('./world.js') : null); }

  /* ---------------- ASHVALE ITEM SCHEMA v1 ---------------- */
  function normItem(id, j, RI) {
    if (!j || !j.category || !RI) return j;   /* pre-schema data (old saves/pages): already in the internal shape */
    const cs = j.category + '/' + j.subcategory;
    const d = { id, name: j.name, category: j.category, subcategory: j.subcategory, kind: j.subcategory, tier: j.tier || 0, weight: j.weight | 0,
      value: j.value | 0, req: j.req || {}, stack: !!j.stackable, model: j.model, nft: j.nft || null };
    d.eq = RI.slots[cs] || RI.slots[j.category] || null;
    if (j.category === 'weapon') Object.assign(d, RI.weapons[j.subcategory] || {});
    if (j.category === 'tool') d.tool = RI.tools[j.subcategory] || null;
    d.edible = RI.edible.indexOf(j.category) >= 0; d.drink = RI.drink.indexOf(j.category) >= 0;
    for (const a of j.attributes || []) { const t = RI.traits[a.trait_type]; if (!t) continue; if (Array.isArray(t)) d[t[0]] = Math.round(a.value * t[1]); else d[t] = a.value; }
    return d;
  }
  /* validItem(json, {chain:true, creator}) -> {ok, errors}: shape, vocabulary, @ashvale creator for chain items,
     stat ranges per tier. clampItem(json) -> a copy with every number pulled into range. */
  function validItem(j, RI, o) {
    o = o || {}; const errs = [];
    if (!j || typeof j !== 'object') return { ok: false, errors: ['not an object'] };
    if (typeof j.name !== 'string' || !j.name || j.name.length > 60) errs.push('name');
    if (j.game !== 'ashvale') errs.push('game must be "ashvale"');
    const subs = RI.categories[j.category]; if (!subs) errs.push('unknown category ' + j.category); else if (subs.indexOf(j.subcategory) < 0) errs.push('unknown subcategory ' + j.category + '/' + j.subcategory);
    const L = RI.limits;
    if (!Number.isInteger(j.weight) || j.weight < L.weight[0] || j.weight > L.weight[1]) errs.push('weight');
    if (j.tier != null && (!Number.isInteger(j.tier) || j.tier < L.tier[0] || j.tier > L.tier[1])) errs.push('tier');
    for (const k in j.req || {}) if (!Number.isInteger(j.req[k]) || j.req[k] < 1 || j.req[k] > 99) errs.push('req ' + k);
    if (!Array.isArray(j.attributes)) errs.push('attributes');
    else for (const a of j.attributes) {
      if (!a || typeof a.trait_type !== 'string' || !(a.trait_type in RI.traits)) { errs.push('unknown trait ' + (a && a.trait_type)); continue; }
      const per = L.perTier[a.trait_type], flat = L.flat[a.trait_type];
      if (per != null && (typeof a.value !== 'number' || a.value < 0 || a.value > per * Math.max(1, j.tier || 1) + 4)) errs.push(a.trait_type + ' out of range for tier ' + (j.tier || 1));
      if (flat && (typeof a.value !== 'number' || a.value < flat[0] || a.value > flat[1])) errs.push(a.trait_type + ' out of range');
    }
    const also = RI.also || ['ns3A7VS6DDaCoBvNFnayHeS9pysgi7Ukrf', '@yourfirstname', 'yourfirstname'];
    if (o.chain && o.creator !== RI.creator && o.creator !== '@ashvale' && also.indexOf(o.creator) < 0) errs.push('not created by @ashvale or @yourfirstname');
    return { ok: !errs.length, errors: errs };
  }
  function clampItem(j, RI) {
    const c = JSON.parse(JSON.stringify(j)), L = RI.limits, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    if (c.tier != null) c.tier = cl(c.tier | 0, L.tier[0], L.tier[1]);
    c.weight = cl(c.weight | 0, L.weight[0], L.weight[1]);
    for (const a of c.attributes || []) { const per = L.perTier[a.trait_type], flat = L.flat[a.trait_type]; if (typeof a.value !== 'number') continue; if (per != null) a.value = cl(a.value, 0, per * Math.max(1, c.tier || 1) + 4); if (flat) a.value = cl(a.value, flat[0], flat[1]); }
    return c;
  }
  /* the inscribed ASHVALE Armoury NFTs (traits Key, Slot, Tier, Req, Attack, Strength, Defence, Ranged, Magic, Copy)
     -> schema v1, so wallet pieces are read the same way as items.json */
  function fromArmoury(nft, RI, items) {
    const at = {}; for (const a of nft.attributes || []) at[a.trait_type] = a.value;
    const key = at.Key, base = items && items[key];
    const cs = (RI.armouryMap[at.Slot] || '').split('/'); if (!cs[0]) return null;
    const req = {}; if (at.Req) { const m = /^(\w+)\s+(\d+)$/.exec(String(at.Req)); if (m) req[m[1]] = +m[2]; }
    const attrs = []; for (const t of ['Attack', 'Strength', 'Defence', 'Ranged', 'Magic']) if (+at[t]) attrs.push({ trait_type: t, value: +at[t] });
    if (base) for (const a of base.attributes || []) if (a.trait_type === 'Speed' || a.trait_type === 'Range') attrs.push(a);
    return { name: String(nft.name || '').replace(/\s*#\d+$/, ''), description: nft.description || '', collection: nft.collection || 'ASHVALE Armoury', game: 'ashvale',
      category: cs[0], subcategory: cs[1], tier: +at.Tier || 1, weight: base ? base.weight : 1000, req, model: base ? base.model : 'gear.' + cs[1], value: base ? base.value : 0,
      attributes: attrs, nft: { key, copy: at.Copy || null, edition: nft.edition != null ? nft.edition : null } };
  }

  function create(D, opts) {
    opts = opts || {};
    const MON = D.monsters, RU = D.rules, XP = RU.xp, SK = RU.skills;
    /* items arrive in ASHVALE ITEM SCHEMA v1 (the inscription JSON); everything the rules need is derived here from
       category/subcategory + attributes through the tables in rules.json "items" (no per-item code anywhere) */
    const IT = {}; for (const k in D.items) IT[k] = normItem(k, D.items[k], RU.items);
    /* town portals (2026-10-04): rules.portals, one standing-stone ring per town; use one to travel to another */
    const PORTALS = (RU.portals || []).filter(P => P && P.id && Array.isArray(P.to));
    const portalOf = id => PORTALS.find(P => P.id === id) || null;
    /* where you wake after dying (2026-10-05: "instead of spawning in the spawn spot they should be brought to the town
       portal of the town that they were most recently in"): each portal's town is the zone it stands in; p.town = the last
       town zone you were in; the wake-up spot is that town's portal, else the old spawn (the Ashvale well) */
    /* area loading (handoff/area_loading.md): with a zone index only the zones near the players are loaded (D.zones grows
       through addZone); what must be known about every zone - where it is, its respawn spot, its ground - comes from the
       index. Without one (tests, the referee's arena) every zone is given and nothing changes. */
    const LAZY = !!(D.zoneIndex && D.zoneIndex.zones), ZINDEX = LAZY ? D.zoneIndex.zones : D.zones;
    const zoneRectAt = (x, y) => { for (const z of ZINDEX) if (x >= z.origin[0] && y >= z.origin[1] && x < z.origin[0] + z.size[0] && y < z.origin[1] + z.size[1]) return z.id; return null; };
    let PORTAL_ZONE = null;   /* built on first use: the world (M) is made further down */
    const RESPAWN0 = () => (LAZY && (ZINDEX.find(z => z.respawn) || {}).respawn) || M.respawn;
    function wakeSpot(p) { const P = p.town ? portalOf(p.town) : null; return P ? { at: P.to, name: P.name } : { at: RESPAWN0(), name: null }; }
    function townCheck(p) {
      if (!M.zoneAt || (S.t + String(p.id).length) % 5) return;
      if (!PORTAL_ZONE) { PORTAL_ZONE = {}; for (const P of PORTALS) { const z = LAZY ? zoneRectAt(P.x, P.y) : M.zoneAt(P.x, P.y); if (z) PORTAL_ZONE[z] = P.id; } }
      const z = M.zoneAt(p.x, p.y), id = z && PORTAL_ZONE[z]; if (id && p.town !== id) p.town = id;
    }
    const M = worldMod().createWorld(D, opts.world);
    for (const P of PORTALS) if (!M.npcs.some(n => n.id === 'portal_' + P.id))
      M.npcs.push({ id: 'portal_' + P.id, name: 'Town portal', look: 'portal', x: P.x, y: P.y, portal: P.id, examine: 'A ring of standing stones, humming softly. Step through to travel to another town.' });
    const R = Rng(opts.seed == null ? 'ashvale3d' : opts.seed);
    const S = { t: 0, uid: 1, players: {}, order: [], mobs: [], ground: [], dep: {}, pending: [], ev: [], noAuth: {}, seen: {}, fires: [], weather: {}, salt: 0, dyn: 0 };
    const queue = [], log = [];
    const idx = M.key, kx = M.kx, ky = M.ky, inMap = M.inWorld;
    const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    const ev = (o) => { S.ev.push(o); return o; };
    const msg = (p, text, kind) => ev({ e: 'msg', p: p.id, text, kind: kind || '' });

    const MIX = new Map();   /* uid -> monster (monsters are only ever added) */
    /* a zone's monsters. Lazily loaded zones arrive in any order, so their monsters get FIXED uids (the worldgen camps'
       hash, siteUid below) from the zone and their place in its list - every game agrees on them whatever it loaded first.
       Eager games (no index) count 1, 2, 3 as before, which keeps every test and replay hash. */
    const ZN = {};
    function spawnMobs(list, announce) {
      for (const sp of list) {
        const m = MON[sp.m], zid = sp.zone || ''; const i = ZN[zid] = (ZN[zid] || 0) + 1; if (!m) continue;
        const uid = LAZY ? siteUid('z:' + zid + ':' + (i - 1)) : S.uid++; if (MIX.has(uid)) continue;
        const mob = { uid, key: sp.m, x: sp.x, y: sp.y, sx: sp.x, sy: sp.y, hp: m.hp, tgt: 0, atk: 0, dead: 0, back: 0, face: 2, step: 0, zone: M.zoneAt(sp.x, sp.y),
          carry0: sp.carry || null, carry: sp.carry ? Object.assign({}, sp.carry) : null };
        S.mobs.push(mob); if (LAZY) MIX.set(uid, mob);
        if (announce) ev({ e: 'mobadd', mob: uid });
      }
    }
    spawnMobs(M.spawns, false);
    /* ---------------- SHARED WORLD (v0.3): one game per zone room is the HOST (authority) for that zone's monsters and
       ground items; everyone else is a REPLICA for that zone: no monster AI and no rolls there, state comes from the host.
       Solo = authority everywhere (the default). Every player stays the authority over their own HP, XP and inventory. */
    const zoneOf = M.zoneAt;
    const isAuth = (z) => !S.noAuth[z];
    function setAuth(z, on) {
      if (on) { delete S.noAuth[z]; let mx = S.uid; for (const g of S.ground) if (g.uid < UID_SPAN) mx = Math.max(mx, g.uid + 1); for (const m of S.mobs) mx = Math.max(mx, m.uid + 1); S.uid = mx; S.seen[z] = S.t; }
      else S.noAuth[z] = 1;
    }
    /* several hosts share one room now (a host per area, 2026-10-02), so the things a host creates at run time
       (ground items, campfires) take uids from that game's own space: salt * 2^20 + n. Solo (salt 0) counts as before. */
    const UID_SPAN = 1048576;
    function nuid() { return S.salt ? S.salt * UID_SPAN + (S.dyn++ % UID_SPAN) : S.uid++; }
    function uidSpace(salt) { S.salt = Math.max(0, Math.min(4095, salt | 0)); }
    const EMPTY_TICKS = (RU.respawn && RU.respawn.emptyTicks) || 50;
    const DEAD_TICKS = (RU.respawn && RU.respawn.deadTicks) || 2000;   /* 2026-10-05: monsters should eventually come back even while players stay (several players hunting one field) */
    /* ---------------- WEATHER (the operator: "Any zone should be able to have weather like fog rain or snow"): zone JSON
       "weather" {kinds: {kind: weight}, min, max}; rules.weather.kinds[kind] = generic multipliers that the rules read
       (sight, range, fireFail, fireBurn, run). Rolled from the seeded RNG by the zone's host; replicas take it from the host. */
    const WX = RU.weather || { kinds: {}, intensity: [50, 100] };
    const ZW = {}; for (const z of ZINDEX) if (z.weather) ZW[z.id] = z.weather;
    /* 2026-10-03: the weather follows the world's climate. On seeded land every area and every set piece belongs
       to the weather region of its climate zone ('cz<n>', tables in rules.weather.climate), and coasts are a little
       foggier; each region rolls like a zone does, so everyone in it agrees */
    const WC = (RU.weather && RU.weather.climate) || null, CLIMW = !!(WC && M.seeded && M.climateAt && M.climateAt(0, 0) >= 0);
    if (CLIMW) for (const z of ZINDEX) delete ZW[z.id];   /* the towns take their region's weather too */
    if (CLIMW) for (const k in WC) if (/^\d+$/.test(k)) { ZW['cz' + k] = WC[k]; ZW['czc' + k] = Object.assign({}, WC[k], { kinds: Object.assign({}, WC[k].kinds, { fog: (WC[k].kinds.fog || 0) + (WC.coastFog || 0) }) }); }
    for (const z in ZW) S.weather[z] = { kind: 'clear', intensity: 0, until: (ZW[z].min || 300) };   /* every zone starts clear */
    /* seeded land has no weather table of its own: an area takes the weather of the set piece of its kind (woods take
       Whisperwood's, open land the village's), so everyone agrees without another host or roll (globe P2) */
    const WZ = {}, ZFOREST = (ZINDEX.find(z => z.ground === 'forest') || ZINDEX[0] || {}).id, ZOPEN = (ZINDEX.find(z => z.respawn) || ZINDEX[0] || {}).id;
    function weatherZone(z) {
      if (z == null) return z;
      if (CLIMW && String(z).indexOf('cz') === 0) return z;
      if (!CLIMW && (ZW[z] || !M.seeded)) return z;
      let w = WZ[z]; if (w) return w;
      let cx, cy;
      const pc = M.pieces && M.pieces.find && M.pieces.find(q => q.id === z);
      if (pc) { cx = (pc.x0 + pc.x1) >> 1; cy = (pc.y0 + pc.y1) >> 1; }
      else { const p = String(z).split(':'), C = M.cfg, ax = +p[1], ay = +p[2]; cx = ax * C.area + (C.area >> 1) - (C.origin[0] - C.grid[0]); cy = ay * C.area + (C.area >> 1) - (C.origin[1] - C.grid[1]); }
      if (CLIMW) { const cz = M.climateAt(cx, cy), coast = M.coastAt(cx, cy) > 0.05; return (WZ[z] = (coast ? 'czc' : 'cz') + Math.max(0, cz)); }
      return (WZ[z] = M.forestAt(cx, cy) > 0.3 ? ZFOREST : ZOPEN);
    }
    function wx(z, key) {
      z = weatherZone(z);
      const w = S.weather[z]; if (!w) return key === 'fireFail' ? 0 : 1;
      const k = (WX.kinds[w.kind] || {})[key];
      if (key === 'fireFail') return (k || 0) * w.intensity / 100;
      return k == null ? 1 : 1 + (k - 1) * w.intensity / 100;
    }
    function weatherTick() {
      for (const z in ZW) {
        const w = S.weather[z]; if (!isAuth(z) || S.t < w.until) continue;
        const ks = Object.keys(ZW[z].kinds), tot = ks.reduce((a, k) => a + ZW[z].kinds[k], 0); let r = R.int(tot), kind = ks[0];
        for (const k of ks) { if (r < ZW[z].kinds[k]) { kind = k; break; } r -= ZW[z].kinds[k]; }
        const I = kind === 'clear' ? 0 : WX.intensity[0] + R.int(WX.intensity[1] - WX.intensity[0] + 1);
        const len = ZW[z].min + R.int(Math.max(1, ZW[z].max - ZW[z].min + 1));
        const was = w.kind; S.weather[z] = { kind, intensity: I, until: S.t + len };
        if (kind !== was) ev({ e: 'weather', zone: z, kind, intensity: I, ticks: len, say: (WX.say || {})[kind] || '' });
      }
    }
    function setWeather(z, kind, intensity, ticks) {   /* the host's word (replicas) or a test */
      z = weatherZone(z);
      if (!ZW[z] && !S.weather[z]) return;
      const was = S.weather[z] && S.weather[z].kind; S.weather[z] = { kind: String(kind), intensity: Math.max(0, Math.min(100, intensity | 0)), until: S.t + Math.max(1, ticks | 0) };
      if (was !== kind) ev({ e: 'weather', zone: z, kind, intensity: S.weather[z].intensity, ticks, say: (WX.say || {})[kind] || '' });
    }
    function repopulate(z) {   /* the operator: monsters come back only when you leave the area and come back */
      for (const m of S.mobs) {
        if (m.zone !== z) continue;
        const md = MON[m.key];
        if (m.dead) { m.dead = 0; m.dropAt = 0; m.x = m.sx; m.y = m.sy; ev({ e: 'spawn', mob: m.uid }); }
        m.hp = md.hp; m.tgt = 0; m.back = 0; m.atk = 0; m.hurt = null; m.flight = null; m.homeAt = 0; if (m.home) { m.sx = m.home[0]; m.sy = m.home[1]; m.home = null; } m.carry = m.carry0 ? Object.assign({}, m.carry0) : null; m.fx = null; m.drank = 0; m.fled = 0; m.fleeing = 0; m.path = null;
      }
      ev({ e: 'repop', zone: z });
    }

    // ---------------- levels, bonuses
    function lvlOf(xp10) { const xp = Math.floor(xp10 / 10); let L = 1; while (L < 99 && XP[L + 1] <= xp) L++; return L; }
    function lv(p, s) { return lvlOf(p.xp[s] || 0); }
    function maxHp(p) { return lv(p, 'hitpoints'); }
    function combatLevel(p) {
      const base = 250 * (lv(p, 'defence') + lv(p, 'hitpoints') + Math.floor(lv(p, 'prayer') / 2));
      const mel = 325 * (lv(p, 'attack') + lv(p, 'strength')), rng = 325 * Math.floor(3 * lv(p, 'ranged') / 2), mag = 325 * Math.floor(3 * lv(p, 'magic') / 2);
      return Math.floor((base + Math.max(mel, rng, mag)) / 1000);
    }
    // A monster's standing on the same scale as combatLevel(p), and it is the number acquire() below
    // turns a monster away on - so it is also the number the game has to show for that monster.
    function mobCombat(md) { return md.level * 2; }
    /* ---------------- prayer (2026-10-07, after Old School RuneScape): points = Prayer level, drained while prayers are
       on (each tick the active prayers' drain is added to a counter; every `resist` of it costs a point), restored at an
       altar and on respawn. Bones are buried for XP. rules.prayer.list is the whole book; `soon` ones are shown, not usable. */
    const PRAY = RU.prayer || { resist: 60, buryTicks: 2, list: [] }, PRAYERS = {};
    /* account flags (rules "flags"): blessings a quest leaves on the character, e.g. the Gift of Angels */
    const FLAGS = RU.flags || {};
    function hasFlag(p, k) { return !!(p && p.flags && p.flags[k]); }
    for (const q of PRAY.list || []) PRAYERS[q.id] = q;
    function maxPp(p) { return lv(p, 'prayer'); }
    function prayersOff(p, text) {
      if (!p.pray || !Object.keys(p.pray).length) return;
      p.pray = {}; ev({ e: 'pray', p: p.id }); if (text) msg(p, text, 'warn');
    }
    function protects(p, cls) { for (const id in p.pray || {}) { const q = PRAYERS[id]; if (q && q.protect === cls) return true; } return false; }
    function overhead(p) { for (const id in p.pray || {}) { const q = PRAYERS[id]; if (q && q.g === 'head') return id; } return null; }
    function boostOf(p, stat) { let k = 0; for (const id in p.pray || {}) { const q = PRAYERS[id]; if (q && q.boost && q.boost[stat]) k = Math.max(k, q.boost[stat]); } return k; }
    function eff(p, stat) { const L = lv(p, stat), k = boostOf(p, stat); return k ? Math.floor(L * (1000 + k) / 1000) : L; }
    /* what a monster's spell does to you besides its damage (2026-10-07): 'bind' holds you where you stand for some
       ticks. Protect from Magic stops them landing, and switching it on breaks the ones already on you. */
    function magicFx(p, fx, ticks, by) {
      if (protects(p, 'magic')) return;
      p.pfx = p.pfx || {}; p.pfx[fx] = S.t + ticks; if (fx === 'bind') p.path = [];
      ev({ e: 'pfx', p: p.id, fx, on: 1 }); msg(p, fx === 'bind' ? 'The ' + (by || 'spell').toLowerCase() + "'s shadow bolt binds your feet!" : 'You are hit by ' + fx + '.', 'warn');
    }
    function clearMagicFx(p, text) {
      if (!p.pfx) return; const had = Object.keys(p.pfx); p.pfx = null;
      for (const fx of had) ev({ e: 'pfx', p: p.id, fx, on: 0 });
      if (had.length && text) msg(p, text);
    }
    function fxTick(p) { if (!p.pfx) return; for (const fx in p.pfx) if (p.pfx[fx] <= S.t) { delete p.pfx[fx]; ev({ e: 'pfx', p: p.id, fx, on: 0 }); } if (!Object.keys(p.pfx).length) p.pfx = null; }
    function setPrayer(p, id, on) {
      const q = PRAYERS[id]; if (!q) return;
      p.pray = p.pray || {};
      if (!on) { if (p.pray[id]) { delete p.pray[id]; ev({ e: 'pray', p: p.id, id, on: 0 }); } return; }
      if (q.soon) { msg(p, q.name + ' is coming soon.', 'warn'); return; }
      if (lv(p, 'prayer') < q.level) { msg(p, 'You need a Prayer level of ' + q.level + ' to use ' + q.name + '.', 'warn'); return; }
      if ((p.pp | 0) <= 0) { msg(p, 'You need to recharge your Prayer at an altar.', 'warn'); return; }
      for (const a in p.pray) { const o = PRAYERS[a]; if (!o || (q.x || []).indexOf(o.g) >= 0) delete p.pray[a]; }
      p.pray[id] = 1; ev({ e: 'pray', p: p.id, id, on: 1 });
      if (q.protect === 'magic') clearMagicFx(p, 'The prayer breaks the shadow magic on you.');
    }
    function prayerTick(p) {
      let d = 0; for (const id in p.pray || {}) d += (PRAYERS[id] && PRAYERS[id].drain) || 0;
      if (!d) return;
      p.pd = (p.pd | 0) + d; const rs = resist(p);
      while (p.pd > rs && p.pp > 0) { p.pd -= rs; p.pp--; }
      if (p.pp <= 0) { p.pp = 0; p.pd = 0; prayersOff(p, 'You have run out of Prayer points. You can recharge them at the altar in the church.'); }
    }
    function bury(p, slot) {
      const s = p.inv[slot], d = s && IT[s.id]; if (!d || !d.buryXp) return;
      if (S.t < (p.buryT || 0)) return;
      p.buryT = S.t + (PRAY.buryTicks || 2); p.act = null; p.path = []; p.skilling = null;
      if (s.n > 1) s.n--; else p.inv[slot] = null;
      msg(p, 'You bury the ' + d.name.toLowerCase() + '.');
      ev({ e: 'bury', p: p.id, id: s.id }); ev({ e: 'inv', p: p.id });
      addXp(p, 'prayer', d.buryXp);
    }
    function bonuses(p) {
      const b = { attack: 0, strength: 0, defence: 0, ranged: 0, rstr: 0, magic: 0, prayer: 0 };
      for (const s of EQ_SLOTS) { const e = p.eq[s]; if (!e) continue; const d = IT[e.id]; for (const k in b) b[k] += d[k] || 0; }
      return b;
    }
    /* drain needed per point: each point of Prayer bonus from gear makes prayers last longer (OSRS: 60 + 2 x bonus) */
    function resist(p) { return PRAY.resist + 2 * Math.max(0, bonuses(p).prayer); }
    function weaponOf(p) { const w = p.eq.weapon; return w ? IT[w.id] : null; }
    function wclass(p) { const w = weaponOf(p); return w ? w.class : 'melee'; }
    function style(p) { const c = wclass(p), L = STYLES[c]; return L[Math.min(p.styles[c] || 0, L.length - 1)]; }
    function attackRange(p) { if (isHawk(p)) return 1; const w = weaponOf(p), st = style(p), r = (w ? w.range : 1) + (st.rng || 0); return r > 1 ? Math.max(1, Math.floor(r * wx(zoneOf(p.x, p.y), 'range'))) : r; }   /* fog shortens bows and spells */
    function attackSpeed(p) { if (isHawk(p)) return HK.strike;   /* one strike takes three ticks (the operator) */ const w = weaponOf(p), st = style(p); const fast = w && (DEX.fastKinds || []).indexOf(w.subcategory || w.kind) >= 0 && lv(p, 'dexterity') >= (DEX.fastAt || 50) ? 1 : 0; return Math.max(2, (w ? w.speed : 4) + (st.spd || 0) - fast); }
    function spell(p) { const L = lv(p, 'magic'); let s = RU.spells[0]; for (const sp of RU.spells) if (L >= sp[0]) s = sp; return s; }
    function maxHit(p) {
      const c = wclass(p), st = style(p), b = bonuses(p);
      if (c === 'magic') return spell(p)[1];
      if (c === 'ranged') { const e = eff(p, 'ranged') + (st.att || 0) + 8; return Math.floor((e * (b.rstr + 64) + 320) / 640); }
      const e = eff(p, 'strength') + (st.str || 0) + 8; return Math.floor((e * (b.strength + 64) + 320) / 640);
    }

    /* ---------------- weight (integer grams) and carrying (2026-10-01) */
    const CARRY = RU.carry || { base: 30000, perStrength: 1000, frozenPct: 150 }, DEX = RU.dexterity || {}, SPEECH = RU.speechcraft || {};
    const START = RU.start || {}, DEATH = RU.death || { pileTicks: 1000 };
    function carried(p) {
      let g = 0;
      for (const s of p.inv) if (s) g += (IT[s.id].weight || 0) * s.n;
      for (const k in p.eq) { const e = p.eq[k]; if (e) g += (IT[e.id].weight || 0) * e.n; }
      return g;
    }
    function capacity(p) { const pk = p.eq.pack ? IT[p.eq.pack.id].carry || 0 : 0, c = CARRY.base + CARRY.perStrength * lv(p, 'strength') + pk; return isHawk(p) ? Math.floor(c * HK.carry) : c; }   /* a hawk carries a third */
    function burden(p) { const w = carried(p), c = capacity(p); return w * 100 > c * (CARRY.frozenPct || 150) ? 2 : w > c ? 1 : 0; }   /* 0 ok, 1 overburdened, 2 too heavy to move */
    function burdenCheck(p) {
      const b = burden(p); if (b === (p.burden || 0)) return;
      const was = p.burden || 0; p.burden = b; ev({ e: 'burden', p: p.id, b });
      if (b === 2) msg(p, "You are carrying far too much to move. Drop something (or put on a bigger pack).", 'warn');
      else if (b === 1) msg(p, was === 2 ? 'You can move again, slowly: you are still overburdened.' : "You are overburdened: you can't run and you walk at half speed.", 'warn');
      else msg(p, 'You are no longer overburdened.');
    }
    function speechPermille(p) { return Math.min(SPEECH.maxPermille || 300, (SPEECH.pctPerLevelPermille || 4) * lv(p, 'speechcraft')); }
    function priceBuy(shopId, id, p) { const sh = shopOf(shopId), base = Math.floor(IT[id].value * sh.sellRate / 100); if (!p || !base) return base; return Math.max(1, Math.floor(base * (1000 - speechPermille(p)) / 1000)); }
    function priceSell(shopId, id, p) {
      const sh = shopOf(shopId), d = IT[id]; if (!shopBuys(sh, d)) return -1;
      let v = Math.floor(d.value * sh.buyRate / 100); if (p) v = Math.floor(d.value * sh.buyRate * (1000 + speechPermille(p)) / 100000);
      if (p && sh.stock.indexOf(id) >= 0) v = Math.min(v, priceBuy(shopId, id, p) - 1);   /* never sell for more than it costs here */
      return Math.max(0, v);
    }

    // ---------------- inventory
    function invFree(p) { let n = 0; const L = slotLimit(p); for (let i = 0; i < L; i++) if (!p.inv[i]) n++; return n; }
    function firstFree(p) { const L = slotLimit(p); for (let i = 0; i < L; i++) if (!p.inv[i]) return i; return -1; }
    function invCount(p, id) { let n = 0; for (const s of p.inv) if (s && s.id === id) n += s.n; return n; }
    function invFind(p, id) { return p.inv.findIndex(s => s && s.id === id); }
    function canAdd(p, id, n) { if (IT[id].stack && invFind(p, id) >= 0) return true; return invFree(p) >= (IT[id].stack ? 1 : n); }
    function addItem(p, id, n) {
      n = n || 1;
      if (IT[id].stack) { const i = invFind(p, id); if (i >= 0) { p.inv[i].n += n; return 0; } const f = firstFree(p); if (f < 0) return n; p.inv[f] = { id, n }; return 0; }
      while (n > 0) { const f = firstFree(p); if (f < 0) break; p.inv[f] = { id, n: 1 }; n--; }
      return n;
    }
    function removeItem(p, id, n) {
      for (let i = 0; i < p.inv.length && n > 0; i++) { const s = p.inv[i]; if (!s || s.id !== id) continue; const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) p.inv[i] = null; }
    }

    // ---------------- XP
    function addXp(p, skill, x10) {
      if (!x10) return;
      const before = lv(p, skill); p.xp[skill] = (p.xp[skill] || 0) + x10; const after = lv(p, skill);
      ev({ e: 'xp', p: p.id, skill, n: x10 });
      if (after > before) {
        if (skill === 'hitpoints') p.hp += after - before;
        if (skill === 'prayer') p.pp = (p.pp | 0) + after - before;
        ev({ e: 'level', p: p.id, skill, lvl: after });
        msg(p, 'Congratulations, you just advanced a ' + cap(skill) + ' level. Your ' + cap(skill) + ' level is now ' + after + '.', 'level');
      }
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // ---------------- players
    function newPlayer(id, save) {
      const R0 = RESPAWN0(), p = { id, name: 'Adventurer', kind: 'p', x: R0[0], y: R0[1], path: [], act: null, hp: 10, xp: {}, inv: new Array(28).fill(null), eq: {},
        styles: { melee: 0, ranged: 0, magic: 0 }, look: null, run: true, energy: 10000, retal: true, atk: 0, dead: 0, face: 2, quests: {}, kills: {}, skilling: null, gT: 0, shop: null, moved: 0, spawnT: 0 };
      for (const s of SK) p.xp[s] = 0;
      p.xp.hitpoints = XP[RU.start.hitpoints] * 10;
      for (const [id2, n] of RU.start.inv) addItem(p, id2, n);
      if (save) importInto(p, save);
      if (save) placeFrom(p, save);
      p.hp = Math.min(p.hp, maxHp(p)); if (p.hp <= 0) p.hp = maxHp(p);
      p.pray = {}; p.pd = 0; p.pp = save && Number.isInteger(save.pp) ? Math.max(0, Math.min(maxPp(p), save.pp)) : maxPp(p);
      return p;
    }
    function importInto(p, s) {
      if (typeof s.name === 'string') p.name = cleanName(s.name) || p.name;
      if (s.look) p.look = cleanLook(s.look);
      if (s.start) p.start = validStart(s.start);   /* an invalid record is dropped, never trusted */
      if (s.xp) for (const k of SK) if (Number.isInteger(s.xp[k]) && s.xp[k] >= 0) p.xp[k] = s.xp[k];
      if (Array.isArray(s.inv)) for (let i = 0; i < 28; i++) { const it = s.inv[i]; p.inv[i] = it && IT[it.id] && it.n > 0 ? { id: it.id, n: it.n | 0 } : null; }
      if (s.eq) for (const k of EQ_SLOTS) { const it = s.eq[k]; if (it && IT[it.id] && IT[it.id].eq === k) p.eq[k] = { id: it.id, n: Math.max(1, it.n | 0) }; }
      if (s.styles) for (const k in p.styles) if (Number.isInteger(s.styles[k])) p.styles[k] = s.styles[k];
      if (typeof s.run === 'boolean') p.run = s.run;
      if (typeof s.retal === 'boolean') p.retal = s.retal;
      if (s.quests) p.quests = JSON.parse(JSON.stringify(s.quests));
      if (s.gifts) p.gifts = JSON.parse(JSON.stringify(s.gifts));
      if (s.flags && typeof s.flags === 'object') { p.flags = {}; for (const k in s.flags) if (FLAGS[k] && Number.isInteger(s.flags[k])) p.flags[k] = s.flags[k]; }
      for (const k in FLAGS) {   /* characters who finished the quest before blessings were flags (it used to be an item) */
        const F = FLAGS[k], Q = F.quest && D.quests.quests[F.quest], q = Q && p.quests[F.quest];
        if (q && q.step > Q.steps.length && !(p.flags && p.flags[k])) { p.flags = p.flags || {}; p.flags[k] = 1; }
      }
      if (s.attuned) p.attuned = JSON.parse(JSON.stringify(s.attuned));
      if (typeof s.town === 'string') p.town = s.town;
      if (s.hawkHp != null) p.hawkHp = s.hawkHp | 0;
      if (s.cd) { p.cd = {}; for (const k in s.cd) p.cd[k] = S.t + (s.cd[k] | 0); }   /* cooldowns are saved as ticks left */
      if (Number.isInteger(s.hp)) p.hp = s.hp;
      if (Number.isInteger(s.energy)) p.energy = Math.max(0, Math.min(10000, s.energy));
    }
    /* the look (outfit) is cosmetic: never part of the rules or the replay hash, only checked for shape and size */
    const LOOK_KEYS = ['body', 'skin', 'hair', 'hairColor', 'beard', 'eyes', 'hat', 'shirt', 'pants', 'boots', 'gloves', 'belt', 'cape', 'apron'];
    function cleanVal(v) { return v == null ? null : typeof v === 'string' && /^[#\w -]{0,24}$/.test(v) ? v : undefined; }
    function cleanLook(l) {
      if (!l || typeof l !== 'object') return null; const o = {};
      for (const k of LOOK_KEYS) { if (!(k in l)) continue; const v = l[k];
        if (k === 'body') { if (v === 'male' || v === 'female') o.body = v; continue; }   /* the operator: male or female */
        if (v && typeof v === 'object') { const st = cleanVal(v.style), co = cleanVal(v.color); if (st !== undefined && co !== undefined) o[k] = { style: st, color: co }; }
        else { const c = cleanVal(v); if (c !== undefined) o[k] = c; } }
      return o;
    }
    function cleanName(n) { n = String(n || '').replace(/[^\w -]/g, '').trim().slice(0, 12); return n.length >= 2 ? n : null; }
    /* starting points (the operator: "spend starting points"): once, on a fresh character; each point = +1 starting level */
    function validStart(pts) {
      if (!pts || typeof pts !== 'object') return null; const o = {}; let sum = 0;
      for (const k in pts) { const v = pts[k]; if ((START.skills || []).indexOf(k) < 0 || !Number.isInteger(v) || v < 0 || v > (START.maxPerSkill || 5)) return null; if (v) { o[k] = v; sum += v; } }
      return sum <= (START.points || 10) ? o : null;
    }
    function freshXp(p) { for (const s of SK) if ((p.xp[s] || 0) !== (s === 'hitpoints' ? XP[START.hitpoints || 10] * 10 : 0)) return false; return true; }
    function startPoints(p, pts) {
      if (p.start) { msg(p, 'Your starting skills are already chosen.', 'warn'); return; }
      const v = validStart(pts); if (!v) { msg(p, 'Those starting points are not allowed.', 'warn'); return; }
      if (!freshXp(p)) { msg(p, 'Starting points can only be spent on a new character.', 'warn'); return; }
      for (const k in v) { const base = k === 'hitpoints' ? (START.hitpoints || 10) : 1; p.xp[k] = XP[Math.min(99, base + v[k])] * 10; }
      p.start = v; p.hp = maxHp(p); ev({ e: 'start', p: p.id }); ev({ e: 'inv', p: p.id });
    }
    /* SAVE VERSIONS. v2 (globe, P2) stores where you stand as a globe position pos = [face, x, y] (face tiles), so a
       character comes back where it was, kilometres out if need be. v1 (v0.5 and older) stored no position: those load at
       the village well as they always did; a v1 save that carries old map x, y keeps them (the old map is the vale frame:
       the village and Whisperwood keep their coordinates through the fixed globecfg origin). */
    function placeFrom(p, s) {
      let xy = null;
      if ((s.v | 0) >= 2 && Array.isArray(s.pos) && s.pos.length === 3) xy = M.fromFace(s.pos[0] | 0, s.pos[1] | 0, s.pos[2] | 0);
      else if ((s.v | 0) <= 1 && Number.isInteger(s.x) && Number.isInteger(s.y)) xy = [s.x, s.y];
      if (!xy || !inMap(xy[0], xy[1])) return;   /* outside the world: the spawn */
      /* 2026-10-06: "I flew over the ocean and the game lost track of my position ... My position should be kept no
         matter where on the globe I am." A hawk (the ring is restored before this) keeps its exact spot over sea, lake or
         woods; anyone else on a tile they cannot stand on goes to the nearest open ground, not back to the village. */
      if (!M.blocked(xy[0], xy[1]) || isHawk(p)) { p.x = xy[0]; p.y = xy[1]; return; }
      for (let r = 1; r <= 400; r++) {   /* ring by ring outward; in a ring, the closest open tile */
        let best = null, bd = 1e18;
        for (let k = -r; k <= r; k++) for (const [x, y] of [[xy[0] + k, xy[1] - r], [xy[0] + k, xy[1] + r], [xy[0] - r, xy[1] + k], [xy[0] + r, xy[1] + k]]) {
          const d = (x - xy[0]) * (x - xy[0]) + (y - xy[1]) * (y - xy[1]); if (d < bd && inMap(x, y) && !M.blocked(x, y)) { bd = d; best = [x, y]; }
        }
        if (best) { p.x = best[0]; p.y = best[1]; return; }
      }
      p.x = xy[0]; p.y = xy[1];   /* no ground for 400 tiles: keep the spot itself (a portal stone still takes you home) */
    }
    function exportPlayer(id) {
      const p = S.players[id]; if (!p) return null;
      const at = p.dead ? wakeSpot(p).at : [p.x, p.y];
      return JSON.parse(JSON.stringify({ v: 2, pos: M.toFace(at[0], at[1]), name: p.name, look: p.look, start: p.start || null, xp: p.xp, inv: p.inv, eq: p.eq, styles: p.styles, run: p.run, retal: p.retal, quests: p.quests, hp: p.hp, energy: p.energy, pp: p.pp | 0, lv: p.lv || 0, gifts: p.gifts || {}, flags: p.flags || {}, attuned: p.attuned || {}, town: p.town || null, hawkHp: p.hawkHp == null ? null : p.hawkHp, cd: Object.fromEntries(Object.entries(p.cd || {}).map(([k, u]) => [k, Math.max(0, u - S.t)]).filter(e => e[1] > 0)) }));
    }

    // ---------------- pathfinding: BFS over the tile grid, 8 directions, no corner cutting (RuneScape-style)
    function edgeOpen(x, y, dx, dy) {   /* orthogonal step: no wall on this tile's side or the neighbour's facing side */
      const b = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : 1, ob = dx === 1 ? 8 : dx === -1 ? 2 : dy === 1 ? 1 : 4;
      return !(M.wallAt(x, y) & b) && !(M.wallAt(x + dx, y + dy) & ob);
    }
    function stepClear(x, y, dx, dy) {   /* walls and corner-cutting only (the target tile itself may be occupied) */
      const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) return false;
      if (!dx || !dy) return edgeOpen(x, y, dx, dy);
      if (M.blocked(x + dx, y) || M.blocked(x, y + dy)) return false;
      return edgeOpen(x, y, dx, 0) && edgeOpen(x + dx, y, 0, dy) && edgeOpen(x, y, 0, dy) && edgeOpen(x, y + dy, dx, 0);
    }
    let LV_LIMIT = -1;
    const LIFT_STEP = 2.3;   /* the most you can step up or down between two tiles of raised ground (stairs are 0.6 m a tile) */   /* while a player on an upper floor moves, the building they are in (they cannot step out of it) */
    let FLY = false;   /* while a hawk moves: every step is open (the operator's hawk ring) */
    /* the hawk (2026-10-04): its own stats. hp 4; a strike every `strike` ticks with a hitPct % chance of hitDmg; a
       strike costs `energy` run energy (Dexterity) and leaves it open to a hit for those ticks; a third of the carrying
       capacity and `slots` bag slots; overburdened it lands and walks one step every groundEvery ticks */
    const HK = Object.assign({ hp: 4, slots: 9, carry: 0.34, strike: 3, exposed: 1, hitPct: 25, hitDmg: 4, energy: 250, groundEvery: 4, regenEvery: 50 }, RU.hawk || {});   /* exposed: ticks it is down within reach */
    const slotLimit = (p) => isHawk(p) ? Math.min(HK.slots, p.inv.length) : p.inv.length;
    const airborne = (p) => isHawk(p) && !(p.burden > 0) && !(p.striking > S.t);   /* in the air: no land animal can touch it */
    const isHawk = (p) => !!(p && p.eq && p.eq.ring && IT[p.eq.ring.id] && IT[p.eq.ring.id].form === 'hawk');
    function canStep(x, y, dx, dy) {
      const nx = x + dx, ny = y + dy;
      if (FLY) return inMap(nx, ny);   /* a hawk flies over trees, walls and water */
      if (M.lifts && LV_LIMIT < 0) {   /* raised ground (a castle's stairs and wall walk): heights decide, not the wall tiles */
        const la = M.liftAt(x, y), lb = M.liftAt(nx, ny);
        if (la || lb) {
          const ok1 = (ax, ay) => { const l = M.liftAt(ax, ay); return Math.abs(l - la) <= LIFT_STEP && (l > 0 || (inMap(ax, ay) && !M.blocked(ax, ay))); };
          if (!inMap(nx, ny) || !ok1(nx, ny)) return false;
          return !dx || !dy || (ok1(x + dx, y) && ok1(x, y + dy));
        }
      }
      if (!inMap(nx, ny) || M.blocked(nx, ny)) return false;
      if (LV_LIMIT >= 0 && M.buildingAt(nx, ny) !== LV_LIMIT) return false;
      return stepClear(x, y, dx, dy);
    }
    /* goal(x,y) -> true when standing there satisfies the action. If nothing satisfies it, walk to the reachable tile
       closest to (ax,ay) (what RuneScape does when you click a blocked tile). */
    /* BFS in a window around the start (the map has no edge any more): (2L+5)^2 cells for a depth limit L, buffers kept
       and stamped per search, so a search costs what it visits. Same order and ties as the old whole-map BFS. */
    let PB = null, PGEN = 0;
    function findPath(sx, sy, goal, ax, ay, limit) {
      if (goal(sx, sy)) return [];
      const L = limit || 120, R2 = L + 2, S2 = 2 * R2 + 1, N = S2 * S2, X0 = sx - R2, Y0 = sy - R2;
      if (!PB || PB.n < N) PB = { n: N, prev: new Int32Array(N), dist: new Int32Array(N), q: new Int32Array(N), st: new Uint32Array(N) };
      if (++PGEN > 4294967000) { PB.st.fill(0); PGEN = 1; }
      const prev = PB.prev, dist = PB.dist, q = PB.q, st = PB.st, gen = PGEN;
      let qh = 0, qt = 0; const s0 = R2 * S2 + R2; q[qt++] = s0; dist[s0] = 0; prev[s0] = s0; st[s0] = gen;
      let best = -1, bestD = 1e9, bestG = 1e9, found = -1;
      while (qh < qt) {
        const c = q[qh++], cx = X0 + c % S2, cy = Y0 + ((c / S2) | 0);
        if (dist[c] > L) break;
        if (c !== s0 && goal(cx, cy)) { found = c; break; }
        if (ax != null) { const d = (cx - ax) * (cx - ax) + (cy - ay) * (cy - ay); if (d < bestD || (d === bestD && dist[c] < bestG)) { bestD = d; bestG = dist[c]; best = c; } }
        for (let k = 0; k < 8; k++) {
          const dx = DIRS[k][0], dy = DIRS[k][1];
          if (!canStep(cx, cy, dx, dy)) continue;
          const n = c + dy * S2 + dx; if (st[n] === gen) continue;
          st[n] = gen; dist[n] = dist[c] + 1; prev[n] = c; q[qt++] = n;
        }
      }
      let end = found >= 0 ? found : best; if (end < 0 || end === s0) return [];
      const path = []; while (end !== s0) { path.push(idx(X0 + end % S2, Y0 + ((end / S2) | 0))); end = prev[end]; }
      return path.reverse();
    }
    function lineOfSight(ax, ay, bx, by) {
      let x = ax, y = ay; const dx = Math.abs(bx - ax), dy = Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1; let err = dx - dy;
      while (!(x === bx && y === by)) {
        const px = x, py = y;
        const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; }
        const mx = x - px, my = y - py;
        if (mx && my ? !((edgeOpen(px, py, mx, 0) && edgeOpen(px + mx, py, 0, my)) || (edgeOpen(px, py, 0, my) && edgeOpen(px, py + my, mx, 0))) : !edgeOpen(px, py, mx, my)) return false;
        if (x === bx && y === by) break;
        if (M.losAt(x, y)) return false;
      }
      return true;
    }
    function inReach(ax, ay, bx, by, range) {
      const d = cheb(ax, ay, bx, by); if (d === 0 || d > range) return false;
      if (range === 1) return stepClear(ax, ay, bx - ax, by - ay);
      return lineOfSight(ax, ay, bx, by);
    }

    // ---------------- ground items
    /* what lies where it fell until someone takes it (rules.persist). 2026-10-06: Gold and valuable things (minValue
       GOLD or more, value x how many) persist, and every teleport or rune stone always does; magical items always did. Old
       rules (cats: categories) still read the same way. */
    const PR = D.rules.persist || {}, PERSIST = new Set(PR.cats || PR.always || ['weapon', 'armour', 'cosmetic', 'jewellery', 'pack', 'tool', 'currency']);
    const perishable = (id, n) => {
      const d = IT[id]; if (!d || d.form) return false;
      if (PERSIST.has(d.category) || PERSIST.has(d.category + '/' + d.subcategory)) return false;
      if (PR.teleport && d.teleport) return false;
      if (PR.minValue != null && (d.value || 0) * Math.max(1, n || 1) >= PR.minValue) return false;
      return true;
    };
    function dropGround(id, n, x, y, owner, life, extra) {
      if (!isAuth(zoneOf(x, y))) { ev(Object.assign({ e: 'xdrop', id, n, x, y, life: life || 300, owner: owner || null }, extra || {})); return null; }
      const g = S.ground.find(q => q.x === x && q.y === y && q.id === id && IT[id].stack);
      const keep = !perishable(id, g ? g.n + n : n);   /* gear, tools and Gold (rules.persist) and every magical item lie where they fell until someone takes them; the rest despawns (2026-10-04) */
      if (g) { g.n += n; g.until = keep ? 1e15 : S.t + (life || 300); ev({ e: 'ground', g: g.uid, n: g.n, x, y }); return g; }
      const ng = { uid: nuid(), id, n, x, y, owner: owner || null, until: keep ? 1e15 : S.t + (life || 300) };
      if (extra) Object.assign(ng, extra);
      S.ground.push(ng); ev({ e: 'drop', g: ng.uid, id, n, x, y, from: ng.from || null, owner: owner || null }); return ng;   /* owner: who let it fall (the chest's exact-NFT drops) */
    }

    // ---------------- commands
    function cmd(pid, c) { if (!c || typeof c.c !== 'string') return; queue.push([pid, c]); log.push([S.t, pid, c]); }
    function apply(p, c) { LV_LIMIT = p.lv > 0 && M.buildingAt ? p.bld : -1; FLY = isHawk(p) && !(p.burden > 0); try { apply0(p, c); } finally { LV_LIMIT = -1; FLY = false; } }
    function apply0(p, c) {
      if (p.dead && c.c !== 'style' && c.c !== 'run' && c.c !== 'retal' && c.c !== 'look') return;
      if (isHawk(p) && ['npc', 'light', 'climb', 'buy', 'sell', 'trade', 'eat', 'use'].indexOf(c.c) >= 0 && !(c.c === 'use' && p.inv[c.slot | 0] && IT[p.inv[c.slot | 0].id].teleport)) { msg(p, 'A hawk can only fly, strike, fish and carry. Take off the ring over open ground to land.', 'warn'); return; }
      if (isHawk(p) && c.c === 'gather') { const n = nodeAt(idx(c.x | 0, c.y | 0)); if (n && nodeDef(n).skill !== 'fishing') { msg(p, 'A hawk catches fish; it cannot chop or mine.', 'warn'); return; } }
      if (c.c !== 'perch') p.perch = null;
      if (c.c === 'walk' || c.c === 'attack' || c.c === 'take' || c.c === 'npc' || c.c === 'gather') { p.runNow = !!c.run; p._spread = 0; }   /* the operator: click = walk, double-click = run */
      switch (c.c) {
        case 'walk': if (inMap(c.x | 0, c.y | 0)) { p.act = null; p.skilling = null; closeShop(p); p.path = findPath(p.x, p.y, (x, y) => x === (c.x | 0) && y === (c.y | 0), c.x | 0, c.y | 0); } break;
        case 'climb': {   /* the stairs of a multi-storey building: one floor up or down (the operator); walk there first if need be */
          const bi = M.buildingAt ? M.buildingAt(c.x != null ? c.x | 0 : p.x, c.y != null ? c.y | 0 : p.y) : -1, B = bi >= 0 ? M.buildings[bi] : null;
          if (!B) { msg(p, 'There are no stairs here.', 'warn'); break; }
          closeShop(p); p.skilling = null;
          if (B.deck) {   /* a wall walk: the nearest flight, its foot from the yard, its top from the wall */
            const pts = deckEnds(B, p);
            if (pts.some(q => cheb(p.x, p.y, q[0], q[1]) <= 1)) climbNow(p, bi, c.dir);
            else { const t = pts.reduce((a, q) => cheb(p.x, p.y, q[0], q[1]) < cheb(p.x, p.y, a[0], a[1]) ? q : a); p.act = { k: 'climb', bi, dir: c.dir > 0 ? 1 : -1 }; p.path = findPath(p.x, p.y, (x, y) => pts.some(q => cheb(x, y, q[0], q[1]) <= 1), t[0], t[1]); }
            break;
          }
          if (cheb(p.x, p.y, B.stairs[0], B.stairs[1]) <= 1 || (B.alt && cheb(p.x, p.y, B.alt[0], B.alt[1]) <= 1)) climbNow(p, bi, c.dir);
          else { p.act = { k: 'climb', bi, dir: c.dir > 0 ? 1 : -1 }; p.path = findPath(p.x, p.y, (x, y) => cheb(x, y, B.stairs[0], B.stairs[1]) <= 1, B.stairs[0], B.stairs[1]); }
          break;
        }
        case 'attack': { if (p.lv > 0) { msg(p, "You can't reach that from up here.", 'warn'); break; } const m = mobByUid(c.uid); if (m && !m.dead) { p.act = { k: 'attack', uid: m.uid }; p.skilling = null; p._stall = 0; closeShop(p); } break; }
        case 'take': { const g = S.ground.find(q => q.uid === c.uid); if (g) { p.act = { k: 'take', uid: g.uid }; p.skilling = null; closeShop(p); } break; }
        case 'enter': { const o = passageAt(c.x, c.y); if (o && !p.dead) { p.act = { k: 'enter', x: o.x, y: o.y }; p.skilling = null; closeShop(p); } break; }   /* a cave mouth, a way out */
        case 'npc': { const n = M.npcs.find(q => q.id === c.id); if (n) { p._trade = !!c.trade; p.act = { k: 'npc', id: n.id }; p.skilling = null; closeShop(p); } break; }
        case 'move': moveSlot(p, c.from | 0, c.to | 0); break;
        case 'light': { const s0 = p.inv[c.slot | 0]; if (s0 && IT[s0.id].burnTicks) { p.act = { k: 'light', slot: c.slot | 0, id: s0.id }; p.gT = 0; p.path = []; p.skilling = null; closeShop(p); } break; }
        case 'gather': { const n = nodeAt(idx(c.x | 0, c.y | 0)); if (n) { p.act = { k: 'gather', i: idx(n.x, n.y) }; p.skilling = null; closeShop(p); p.gT = 0; } break; }
        case 'use': useItem(p, c.slot | 0); break;
        case 'arms': { const has = p.inv.concat(Object.values(p.eq || {})).some(s => s && IT[s.id] && IT[s.id].arms); if (!has) { msg(p, 'You need the Lake Castle stone to call the guard.', 'warn'); break; } callToArms(p, !!c.on); break; }
        case 'equip': equip(p, c.slot | 0); break;
        case 'unequip': unequip(p, c.eq); break;
        case 'eat': eat(p, c.slot | 0); break;
        case 'portal': { const P = portalOf(c.to), here = M.npcs.find(n => n.portal && cheb(p.x, p.y, n.x, n.y) <= 2); if (P && here && here.portal !== P.id && !p.dead && p.attuned && p.attuned[P.id] && p.attuned[here.portal]) teleport(p, P, 'You step through the portal to ' + P.name + '.'); break; }
        case 'perch': {   /* a hawk perches in a tree, on the side you tapped */
          if (!airborne(p)) break; const n = nodeAt(idx(c.x | 0, c.y | 0)); if (!n || nodeDef(n).skill !== 'woodcutting') break;
          p.path = findPath(p.x, p.y, (x, y) => x === n.x && y === n.y, n.x, n.y, 80); p.act = null; p.skilling = null;
          p.perch = { x: n.x, y: n.y, sx: Math.sign(c.sx | 0), sy: Math.sign(c.sy | 0) }; ev({ e: 'perch', p: p.id, x: n.x, y: n.y }); break; }
        case 'drop': { const s = p.inv[c.slot | 0]; if (s) { p.inv[c.slot | 0] = null; dropGround(s.id, s.n, p.x, p.y, p.id, 300); ev({ e: 'inv', p: p.id }); } break; }
        case 'buy': buy(p, c.shop, c.item, Math.max(1, Math.min(1000, c.n | 0))); break;
        case 'sell': sell(p, c.shop, c.slot | 0, Math.max(1, c.n | 0)); break;
        case 'style': { const cl = wclass(p); p.styles[cl] = Math.max(0, Math.min(STYLES[cl].length - 1, c.i | 0)); ev({ e: 'style', p: p.id }); break; }
        case 'run': break;   /* old saves/commands: running is now per click (double-click / double-tap) */
        case 'retal': p.retal = !!c.on; break;
        /* "Remove from quest log" (2026-10-06): hides the quest in the log, keeps every bit of its progress; speaking
           to the one who gave it puts it back where you left off (talk() below) */
        case 'qhide': { const q = p.quests[c.id]; if (q && D.quests.quests[c.id]) { q.hid = 1; ev({ e: 'quest', p: p.id, q: c.id, step: q.step }); } break; }
        case 'pray': setPrayer(p, String(c.id || ''), !!c.on); break;
        case 'close': closeShop(p); break;
        case 'start': startPoints(p, c.pts); break;
        case 'look': if (c.look) p.look = cleanLook(c.look); if (c.name) p.name = cleanName(c.name) || p.name; ev({ e: 'look', p: p.id }); break;
      }
    }
    /* inventory drag and drop (the operator): move into an empty slot or swap two slots; deterministic and replayed */
    function moveSlot(p, from, to) {
      if (to >= slotLimit(p) || from >= slotLimit(p)) return;   /* a hawk has only its first slots */
      if (from === to || from < 0 || to < 0 || from >= p.inv.length || to >= p.inv.length || !p.inv[from]) return;
      const a = p.inv[from]; p.inv[from] = p.inv[to]; p.inv[to] = a; ev({ e: 'inv', p: p.id });
    }
    /* static nodes (trees, rocks, fishing spots, ranges) plus the campfires burning right now */
    function nodeAt(i) {
      const n = M.nodeAt(i); if (n) return n;
      const f = S.fires.find(q => idx(q.x, q.y) === i); return f ? { kind: 'fire', x: f.x, y: f.y, fire: f.uid } : null;
    }
    function mobByUid(u) { let m = MIX.get(u); if (m) return m; for (const q of S.mobs) if (q.uid === u) { MIX.set(u, q); return q; } return null; }
    function closeShop(p) { if (p.shop) { p.shop = null; ev({ e: 'shopclose', p: p.id }); } }

    function useItem(p, slot) {
      const s = p.inv[slot]; if (!s) return; const d = IT[s.id];
      if (d.buryXp) { bury(p, slot); return; }
      if (d.eq) { equip(p, slot); return; }   /* a click wears gear; a ring's teleport fires only when its effect triggers */
      if (d.teleport) {   /* a town stone: home, as often as you like, once its cooldown has passed (30 minutes) */
        const P = portalOf(d.teleport); if (!P) { msg(p, 'Nothing happens.'); return; }
        p.cd = p.cd || {}; const left = (p.cd[s.id] || 0) - S.t;
        if (left > 0) { msg(p, 'The stone is still cold. It wakes again in ' + Math.ceil(left * 0.6 / 60) + ' minute' + (Math.ceil(left * 0.6 / 60) === 1 ? '' : 's') + '.', 'warn'); return; }
        p.cd[s.id] = S.t + (d.cooldown || 0); teleport(p, P, 'The stone warms in your hand, and ' + P.name + ' rises around you.'); return;
      }
      if (d.eq) equip(p, slot); else if (d.edible) eat(p, slot);
      else if (d.burnTicks) { p.act = { k: 'light', slot, id: s.id }; p.gT = 0; p.path = []; p.skilling = null; }   /* tap logs = light them (needs a tinderbox) */
      else msg(p, d.tool ? 'Use it on a ' + (d.tool === 'woodcutting' ? 'tree' : d.tool === 'mining' ? 'rock' : 'fishing spot') + ': just tap one while you carry it.' : 'Nothing interesting happens.');
    }
    /* PASSAGES (2026-10-07, the Spider Cave): any object with a `to` [x, y] is a way through - a cave mouth up top, a
       way out below. Use it from beside it and you are there (the engine shows the travel swirl while that area loads). */
    function followThrough(m) {   /* out of the opening, onto the nearest free tile round where its target came out */
      const F = m.follow; m.follow = null;
      for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = F.x + dx, y = F.y + dy; if (!inMap(x, y) || M.blocked(x, y) || occupied(x, y, m)) continue;
        m.x = x; m.y = y; m.path = null; m.step = 0; ev({ e: 'mobjump', mob: m.uid, x, y }); return;
      }
    }
    function passageAt(x, y) { for (const o of M.objects) if (o.to && o.x === x && o.y === y) return o; return null; }
    function teleport(p, P, text) {
      const ox = p.x, oy = p.y, passage = P.id === 'cavemouth' || P.id === 'caveexit';
      p.x = P.to[0]; p.y = P.to[1]; p.path = []; p.act = null; p.skilling = null; p.lv = 0; p.bld = -1; closeShop(p);
      let k = 0;
      for (const m of S.mobs) if (m.tgt === p.id) {
        /* through a cave opening, the relentless ones close behind you come too, a few ticks apart (the operator: "Follow you up") */
        if (passage && !m.dead && MON[m.key].relentless && cheb(m.x, m.y, ox, oy) <= 12) { m.follow = { x: P.to[0], y: P.to[1], at: S.t + 4 + 2 * k++ }; continue; }
        m.tgt = 0; m.back = 1;
      }
      ev({ e: 'teleport', p: p.id, x: p.x, y: p.y, to: P.id }); if (text) msg(p, text, 'info');
    }
    function reqFail(p, d) {
      for (const k in d.req || {}) if (lv(p, k) < d.req[k]) return 'You need ' + cap(k) + ' level ' + d.req[k] + ' to ' + (d.eq === 'weapon' ? 'wield' : 'wear') + ' that.';
      return null;
    }
    function equip(p, slot) {
      const s = p.inv[slot]; if (!s) return; const d = IT[s.id]; if (!d.eq) return;
      const f = reqFail(p, d); if (f) { msg(p, f, 'warn'); return; }
      if (d.form === 'hawk' && (p.lv > 0 || M.insideAt(p.x, p.y))) { msg(p, 'You need open sky to take flight. Go outside first.', 'warn'); return; }
      if (d.stack && p.eq[d.eq] && p.eq[d.eq].id === s.id) { p.eq[d.eq].n += s.n; p.inv[slot] = null; ev({ e: 'equip', p: p.id, id: s.id }); return; }
      const out = [];   /* what has to come off */
      if (p.eq[d.eq]) out.push(d.eq);
      if (d.twoHanded && p.eq.shield) out.push('shield');
      if (d.eq === 'shield' && p.eq.weapon && IT[p.eq.weapon.id].twoHanded) out.push('weapon');
      if (out.length - 1 > invFree(p)) { msg(p, 'Not enough space in your inventory.', 'warn'); return; }
      const removed = out.map(k => { const o = p.eq[k]; delete p.eq[k]; return o; });
      p.inv[slot] = null;
      p.eq[d.eq] = { id: s.id, n: s.n };
      removed.forEach((o, j) => { if (j === 0 && !(IT[o.id].stack && invFind(p, o.id) >= 0)) p.inv[slot] = o; else addItem(p, o.id, o.n); });
      if (d.form === 'hawk') {   /* you become a hawk: what is in the lower slots falls where you stand */
        let fell = 0; for (let i = HK.slots; i < p.inv.length; i++) { const q = p.inv[i]; if (q) { p.inv[i] = null; dropGround(q.id, q.n, p.x, p.y, p.id, 300); fell++; } }
        if (p.hawkHp == null || p.hawkHp <= 0) p.hawkHp = HK.hp;
        if (fell) msg(p, 'A hawk carries little: ' + fell + ' thing' + (fell === 1 ? '' : 's') + ' from your lower slots fell to the ground.', 'warn');
        ev({ e: 'inv', p: p.id }); burdenCheck(p);
      }
      ev({ e: 'equip', p: p.id, id: s.id });
    }
    function unequip(p, k) {
      const e = p.eq[k]; if (!e) return;
      if (!canAdd(p, e.id, 1)) { msg(p, 'Not enough space in your inventory.', 'warn'); return; }
      if (IT[e.id] && IT[e.id].form === 'hawk' && (M.blocked(p.x, p.y) || M.insideAt(p.x, p.y))) { msg(p, 'Fly to open ground first: there is nowhere to land here.', 'warn'); return; }
      delete p.eq[k]; addItem(p, e.id, e.n); ev({ e: 'equip', p: p.id }); burdenCheck(p);
    }
    function eat(p, slot) {
      const s = p.inv[slot]; if (!s) return; const d = IT[s.id]; if (!d.edible) return;
      const mx = maxHp(p), heal = d.healPct ? Math.floor(mx * d.healPct / 100) : d.heal;
      removeItem(p, s.id, 1);
      const before = p.hp; p.hp = Math.min(mx, p.hp + heal);
      p.atk = Math.max(p.atk, 0) + 3;
      msg(p, (d.drink ? 'You drink the ' : 'You eat the ') + d.name.toLowerCase() + '.' + (p.hp > before ? ' It heals some health.' : ''));
      ev({ e: 'eat', p: p.id, id: s.id, heal: p.hp - before });
      if (p.poison) curePoison(p, d.cures === 'poison' ? 'The antidote burns going down. The poison is gone.' : 'That settles your stomach. The poison fades.');
    }
    function shopOf(id) { return D.shops.shops[id]; }
    function nearKeeper(p, sh) { const n = M.npcs.find(q => q.id === sh.keeper); return n && cheb(p.x, p.y, n.x, n.y) <= 2; }
    function buy(p, shopId, item, n) {
      const sh = shopOf(shopId); if (!sh || p.shop !== shopId || !nearKeeper(p, sh) || sh.stock.indexOf(item) < 0) return;
      const d = IT[item], price = priceBuy(shopId, item, p);
      let bought = 0;
      for (let k = 0; k < n; k++) {
        if (invCount(p, 'coins') < price) { if (!bought) msg(p, "You don't have enough GOLD.", 'warn'); break; }
        const coinsSlot = invFind(p, 'coins'), lastCoins = p.inv[coinsSlot] && p.inv[coinsSlot].n === price;
        if (!canAdd(p, item, 1) && !(lastCoins && !d.stack)) { msg(p, 'You have no room for that.', 'warn'); break; }
        removeItem(p, 'coins', price); addItem(p, item, 1); bought++;
      }
      if (bought) { msg(p, 'You buy ' + (bought > 1 ? bought + ' x ' : '') + d.name + ' for ' + bought * price + ' GOLD.', 'trade'); ev({ e: 'trade', p: p.id, buy: item, n: bought }); addXp(p, 'speechcraft', (SPEECH.xpPerGold || 1) * bought * price); burdenCheck(p); }
    }
    function shopBuys(sh, d) { return d.category !== 'currency' && !d.edition &&   /* a one-of-one (Edition) is never sold to a shop: it would be gone for good */ (sh.buys === 'any' || sh.buys.indexOf(d.category) >= 0 || sh.buys.indexOf(d.category + '/' + d.subcategory) >= 0); }
    function sell(p, shopId, slot, n) {
      const sh = shopOf(shopId); if (!sh || p.shop !== shopId || !nearKeeper(p, sh)) return;
      const s = p.inv[slot]; if (!s) return; const d = IT[s.id];
      if (!shopBuys(sh, d)) { msg(p, "The shopkeeper isn't interested in that.", 'warn'); return; }
      const each = priceSell(shopId, s.id, p), id = s.id;
      const have = invCount(p, id); n = Math.min(n, have);
      if (each > 0 && !canAdd(p, 'coins', 1) && !(s.n === n || !d.stack)) { msg(p, 'You have no room for the GOLD.', 'warn'); return; }
      removeItem(p, id, n); if (each * n > 0) addItem(p, 'coins', each * n);
      msg(p, 'You sell ' + (n > 1 ? n + ' x ' : '') + d.name + ' for ' + each * n + ' GOLD.', 'trade');
      ev({ e: 'trade', p: p.id, sell: id, n }); addXp(p, 'speechcraft', (SPEECH.xpPerGold || 1) * each * n); burdenCheck(p);
    }

    // ---------------- combat
    function rollAttack(A, Dr) { return R.int(A + 1) > R.int(Dr + 1); }
    function hawkStrike(p, m) {   /* the hawk dives: hitPct % for hitDmg, Dexterity spent, open to a hit while it is down */
      if ((p.energy || 0) < HK.energy) { msg(p, 'Your wings are too tired to strike. Rest a moment.', 'warn'); p.act = null; return false; }
      p.energy -= HK.energy; p.striking = S.t + HK.exposed;
      const hit = R.int(100) < HK.hitPct, dmg = hit ? HK.hitDmg : 0;
      ev({ e: 'attack', src: p.id, dst: m.uid, anim: 'dive', delay: 1, cls: 'hawk' });
      S.pending.push({ at: S.t + 1, src: p.id, dst: m.uid, dmg, cls: 'melee', xp: ['dexterity'], dex: true });
      if (!m.tgt && !MON[m.key].fleeHit) { m.tgt = p.id; m.atk = Math.max(m.atk, 1); }
      if (MON[m.key].fleeHit) stampede(m, p);
      return true;
    }
    function playerAttack(p, m) {
      if (isHawk(p)) return hawkStrike(p, m);
      const c = wclass(p), st = style(p), b = bonuses(p), md = MON[m.key];
      const w = weaponOf(p);
      let A, max = maxHit(p), ammoId = null;
      if (c === 'ranged') {
        const ammo = p.eq.ammo; if (!ammo) { msg(p, 'There is no ammo left in your quiver.', 'warn'); p.act = null; return false; }
        const ad = IT[ammo.id]; if (lv(p, 'ranged') < (ad.req ? ad.req.ranged || 1 : 1)) { msg(p, 'You need Ranged level ' + ad.req.ranged + ' to fire ' + ad.name.toLowerCase() + '.', 'warn'); p.act = null; return false; }
        ammoId = ammo.id; ammo.n--; if (ammo.n <= 0) delete p.eq.ammo;
        A = (eff(p, 'ranged') + (st.att || 0) + 8) * (b.ranged + 64);
        if (R.int(2) === 0) p._arrowDrop = { id: ammo.id, x: m.x, y: m.y };
      } else if (c === 'magic') A = (eff(p, 'magic') + 8) * (b.magic + 64);
      else A = (eff(p, 'attack') + (st.att || 0) + 8) * (b.attack + 64);
      let Dr = (md.def + 9) * (md.defb + 64), blocked = false;
      if (md.ai && md.ai.blockPct && R.int(100) < md.ai.blockPct) { Dr *= 2; blocked = true; }   /* shield up: harder to land a hit */
      const hit = rollAttack(A, Dr), dmg = hit ? R.int(max + 1) : 0;
      const dist = cheb(p.x, p.y, m.x, m.y);
      const delay = c === 'ranged' ? 1 + Math.floor((3 + dist) / 6) : c === 'magic' ? 1 + Math.floor((1 + dist) / 3) : 0;
      const anim = w ? w.anim : 'punch';
      ev({ e: 'attack', src: p.id, dst: m.uid, anim, delay, cls: c, ammo: ammoId, spell: c === 'magic' ? spell(p)[2] : null, tier: w ? w.tier : 0 });
      S.pending.push({ at: S.t + delay, src: p.id, dst: m.uid, dmg, cls: c, xp: st.xp, blocked: blocked && !hit, dex: c === 'ranged' || (w && w.subcategory === 'dagger'), splash: c === 'magic' && !hit, arrow: p._arrowDrop || null });
      p._arrowDrop = null;
      if (!m.tgt && !MON[m.key].fleeHit) { m.tgt = p.id; m.atk = Math.max(m.atk, 1); }   /* a timid animal never squares up to you */
      if (MON[m.key].fleeHit) stampede(m, p);   /* ...and its whole herd bolts */
      return true;
    }
    function landOnMob(h) {
      const m = mobByUid(h.dst), p = S.players[h.src]; if (!m || m.dead) return;
      const dmg = Math.min(h.dmg, m.hp); m.hp -= dmg;
      ev({ e: 'hit', dst: m.uid, src: h.src, dmg, max: MON[m.key].hp, hp: m.hp, cls: h.cls, dex: !!h.dex, blocked: !!h.blocked });
      if (h.arrow) dropGround(h.arrow.id, 1, h.arrow.x, h.arrow.y, h.src, 200);
      if (p && !p.puppet) hitXp(p, h.cls, dmg, h.xp, h.dex);
      if (p && h.dmg >= 0 && !h.splash) { const w = weaponOf(p); if (w && w.effect && m.hp > 0) applyEffect(m, w, p.id); }
      if (p) {
        m.hurt = p.id; m.hurtT = S.t; m.tgt = MON[m.key].fleeHit ? 0 : p.id; m.back = 0;   /* targets whoever hurt it most recently, so groups can tank; a timid animal runs instead */
        const ai = MON[m.key].ai; if (ai) rally(m, p.id, ai.defended ? 10 : ai.rally || 6);
      }
      if (m.hp <= 0) killMob(m, p);
    }
    function hitXp(p, cls, dmg, xpList, dex) {
      xpList = xpList || style(p).xp;
      if (cls === 'magic') addXp(p, 'magic', 55);
      if (dmg > 0) {
        if (xpList.length === 2) { addXp(p, xpList[0], 20 * dmg); addXp(p, xpList[1], 20 * dmg); }
        else addXp(p, xpList[0], (cls === 'magic' ? 20 : 40) * dmg);
        addXp(p, 'hitpoints', Math.floor(40 * dmg / 3));
        if (dex) addXp(p, 'dexterity', (DEX.xpPerDamage || 10) * dmg);
      }
    }
    function creditKill(p, key) {
      const md = MON[key]; if (!md) return;
      p.kills[key] = (p.kills[key] || 0) + 1;
      for (const qid in p.quests) { const q = p.quests[qid]; const st = D.quests.quests[qid].steps[q.step - 1]; if (st && st.goal.kill === key && q.n < (st.goal.n == null ? 1 : st.goal.n)) { q.n++; msg(p, D.quests.quests[qid].name + ': ' + q.n + ' / ' + (st.goal.n || 1) + ' ' + md.name.toLowerCase() + ((st.goal.n || 1) > 1 ? 's' : '') + ' slain.', 'quest'); } }
    }
    function creditCook(p, item) {
      if (!IT[item]) return;
      for (const qid in p.quests) {
        const q = p.quests[qid], Q = D.quests.quests[qid], st = Q && Q.steps[q.step - 1];
        if (st && st.goal.cook === item && q.n < (st.goal.n == null ? 1 : st.goal.n)) { q.n++; msg(p, Q.name + ': ' + q.n + ' / ' + (st.goal.n || 1) + ' ' + IT[item].name.toLowerCase() + ' cooked.', 'quest'); }
      }
    }
    function killMob(m, p) {
      const md = MON[m.key];
      m.dead = S.t; m.tgt = 0; m.dropAt = S.t + 2; m.killer = p ? p.id : null;
      ev({ e: 'die', mob: m.uid, killer: p ? p.id : null }); void md;
      if (p && !p.puppet) creditKill(p, m.key);
      for (const pid of S.order) { const o = S.players[pid]; if (o.act && o.act.k === 'attack' && o.act.uid === m.uid) o.act = null; }
    }
    function mobDrops(m) {
      const md = MON[m.key], owner = m.killer;
      if (md.gold) dropGround('coins', md.gold, m.x, m.y, owner, 300);
      const bn = md.bones === undefined ? PRAY.bones : md.bones; if (bn && IT[bn]) dropGround(bn, 1, m.x, m.y, owner, 300);   /* every monster leaves bones (2026-10-07) */
      for (const k in m.carry || {}) if (m.carry[k] > 0 && IT[k]) dropGround(k, m.carry[k], m.x, m.y, owner, 300);
      for (const d of md.drops) if (!(m.carry0 && d.item in m.carry0) && R.int(d.one_in) === 0) { const n = d.n ? d.n[0] + R.int(d.n[1] - d.n[0] + 1) : 1; dropGround(d.item, n, m.x, m.y, owner, 300); }
    }
    function mobAttack(m, p, mode) {
      const md = MON[m.key], b = bonuses(p), st = style(p), magic = mode === 'magic', ranged = !!mode && !magic, cls = magic ? 'magic' : ranged ? 'ranged' : 'melee', C = magic ? md.cast || {} : null;
      if (ranged) { const ak = Object.keys(m.carry || {}).find(k => /^arrows_/.test(k) && m.carry[k] > 0); if (!ak) return; m.carry[ak]--; m._ammo = ak; }
      /* a spell is rolled against magic defence as in RuneScape: 70% Magic, 30% Defence */
      const A = magic ? ((C.att || md.att) + 9) * ((C.attb || md.attb) + 64) : (md.att + 9) * (md.attb + 64);
      const Dr = magic ? (Math.floor(eff(p, 'magic') * 0.7 + eff(p, 'defence') * 0.3) + 9) * (b.defence + 64) : (eff(p, 'defence') + (st.def || 0) + 9) * (b.defence + 64);
      if (airborne(p)) return;   /* a hawk in the air: no land animal can touch it */
      const hk = isHawk(p), hit = rollAttack(A, Dr); let dmg = hit ? Math.min(R.int((magic && C.max != null ? C.max : md.max) + 1), hk ? p.hawkHp : p.hp) : 0, dodged = false;
      if (dmg > 0 && R.int(100) < Math.floor(lv(p, 'dexterity') / 10) * (DEX.dodgePerTenLevels || 1)) { dmg = 0; dodged = true; }   /* Dexterity: a dodge turns a hit into a 0 */
      /* an overhead protection prayer stops a monster's blows of its kind entirely, as in RuneScape; against a spell it
         also stops what the spell would do to you. `raw` is the roll before the prayer, so a player whose prayer went out
         between the host's roll and the hit still takes it (applyHit). */
      const raw = dmg, prot = protects(p, cls); if (prot) dmg = 0;
      const fx = magic && hit && C.fx && !prot && !hk && (!C.fxChance || R.int(C.fxChance) === 0) ? C.fx : null;
      ev({ e: 'attack', src: m.uid, dst: p.id, anim: ranged ? 'bow' : magic ? 'cast' : md.anim, delay: ranged || magic ? 1 : 0, cls, ammo: ranged ? m._ammo : null, spell: magic ? C.name || 'Shadow bolt' : null });
      if (!p.puppet) { if (hk) p.hawkHp -= dmg; else p.hp -= dmg; }
      ev({ e: 'hit', dst: p.id, src: m.uid, dmg, max: hk ? HK.hp : maxHp(p), hp: hk ? p.hawkHp : p.puppet ? Math.max(0, p.hp - dmg) : p.hp, hawk: hk ? 1 : 0, cls, blocked: !hit && !!p.eq.shield, dodged, prot: prot ? 1 : 0, raw, fx, fxt: fx ? C.fxTicks || 5 : 0 });
      if (p.puppet) return;
      if (fx) magicFx(p, fx, C.fxTicks || 5, md.name);
      if (dodged) msg(p, 'You dodge the ' + md.name.toLowerCase() + "'s attack.");
      if (dmg > 0 && !hk && md.venom && p.hp > 0 && R.int(100) < (md.venom.chance | 0)) poisonPlayer(p, md.venom, md.name);
      if (p.retal && !p.act && !p.path.length) p.act = { k: 'attack', uid: m.uid };
      if (hk && p.hawkHp <= 0) hawkFalls(p);
      else if (angelSave(p)) { /* the ring carried them home */ }
      else if (p.hp <= 0) killPlayer(p);
    }
    function angelRest(p, d) {   /* an hour until Iria's second quest is done, then the Gift of Angels shortens it */
      const base = d.cooldown || 6000;
      const g = FLAGS.gift_of_angels;
      return hasFlag(p, 'gift_of_angels') && g && g.ringCooldown ? g.ringCooldown : base;
    }
    function angelSave(p) {
      if (!p || p.dead || p.puppet || isHawk(p)) return false;
      const ring = p.eq && p.eq.ring;
      if (!ring) return false;
      const d = IT[ring.id];
      if (!d || d.form !== 'angels') return false;
      const mx = maxHp(p);
      if (!(mx > 0) || p.hp >= mx / 5) return false;
      const P = portalOf((d.teleport) || 'ashvale');
      if (!P) return false;
      const until = (p.cd && p.cd[ring.id]) || 0;
      if (S.t < until) {
        const mins = Math.max(1, Math.ceil((until - S.t) * 0.6 / 60));
        msg(p, 'The Ring of Angels is still resting. It can carry you home again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.', 'warn');
        return false;
      }
      const rest = angelRest(p, d);
      p.cd = p.cd || {}; p.cd[ring.id] = S.t + rest;
      if (p.hp < 1) p.hp = 1;
      const home = p.x + ',' + p.y;
      const mins = Math.max(1, Math.round(rest * 0.6 / 60));
      teleport(p, P, 'The Ring of Angels flares, and Ashvale rises around you. It rests for ' + mins + ' minutes.');
      ev({ e: 'angels', p: p.id, x: p.x, y: p.y, from: home });
      return true;
    }
    function hawkFalls(p) {   /* hawk HP gone: you tumble out of the sky as yourself; the ring comes off (your own HP is untouched) */
      const r = p.eq.ring; if (!r) return; p.hawkHp = 0; delete p.eq.ring; p.perch = null; p.striking = 0;
      if (addItem(p, r.id, r.n)) dropGround(r.id, r.n, p.x, p.y, p.id, 300);
      if (M.blocked(p.x, p.y)) { const sp = findPath(p.x, p.y, (x, y) => !M.blocked(x, y), p.x, p.y, 40); if (sp.length) { const t = sp[sp.length - 1]; p.x = kx(t); p.y = ky(t); } }
      msg(p, 'You are hurt too badly to fly: you tumble out of the sky and land as yourself.', 'warn');
      ev({ e: 'equip', p: p.id }); ev({ e: 'inv', p: p.id }); burdenCheck(p);
    }
    /* PLAYER POISON (2026-10-07, the Spider Cave: spiders poison; "there needs to be an indication to the player that
       they are poisoned other than just their health going down"): v.dmg every POISON_EVERY ticks for v.ticks ticks. A new
       bite while poisoned keeps the stronger dose and the later end. Food or an antidote cures it; death clears it. The
       engine shows it (event 'poison': the green Hitpoints orb and badge, green splats from cls 'poison' hits). */
    const POISON_EVERY = 3;
    function poisonPlayer(p, v, by) {
      const was = !!p.poison, until = S.t + (v.ticks | 0), dmg = Math.max(1, v.dmg | 0);
      if (was) { p.poison.until = Math.max(p.poison.until, until); p.poison.dmg = Math.max(p.poison.dmg, dmg); return; }
      p.poison = { until, dmg, next: S.t + POISON_EVERY };
      msg(p, 'You have been poisoned' + (by ? ' by the ' + String(by).toLowerCase() : '') + '! Eat something or drink an antidote.', 'warn');
      ev({ e: 'poison', p: p.id, on: true });
    }
    function curePoison(p, text) {
      if (!p.poison) return false;
      delete p.poison; if (text) msg(p, text, 'info'); ev({ e: 'poison', p: p.id, on: false }); return true;
    }
    function poisonTick(p) {
      const P = p.poison; if (!P || p.dead) return;
      if (S.t >= P.until) { curePoison(p, 'The poison wears off.'); return; }
      if (S.t < P.next) return;
      P.next = S.t + POISON_EVERY;
      const dmg = Math.min(P.dmg, p.hp); p.hp -= dmg;
      ev({ e: 'hit', dst: p.id, src: null, dmg, max: maxHp(p), hp: p.hp, cls: 'poison' });
      if (angelSave(p)) { /* the ring carried them home - still poisoned */ }
      else if (p.hp <= 0) killPlayer(p);
    }
    function killPlayer(p) {
      if (p.poison) { delete p.poison; ev({ e: 'poison', p: p.id, on: false }); }
      p.dead = S.t; p.act = null; p.path = []; p.skilling = null; closeShop(p); prayersOff(p); p.pfx = null;
      ev({ e: 'die', p: p.id });
      msg(p, 'Oh dear, you are dead!', 'warn');
      /* 2026-10-01: everything you carry and wear drops where you die; anyone may take it (no grace period) */
      const pile = [];
      for (let i = 0; i < p.inv.length; i++) { const s = p.inv[i]; if (s) { pile.push(s); p.inv[i] = null; } }
      for (const k of EQ_SLOTS) { const e = p.eq[k]; if (e) { pile.push(e); delete p.eq[k]; } }
      for (const it of pile) dropGround(it.id, it.n, p.x, p.y, null, DEATH.pileTicks || 1000, { from: p.id, diedAt: S.t });
      if (pile.length) {
        const z = M.zoneAt(p.x, p.y);
        msg(p, 'Your belongings lie where you fell (' + (z || 'the wild') + ', ' + p.x + ',' + p.y + ') for ' + Math.round((DEATH.pileTicks || 1000) * 0.6 / 60) + ' minutes. Others will be able to take them once shared loot arrives.', 'warn');
        p.deathPile = { x: p.x, y: p.y, t: S.t };
        ev({ e: 'inv', p: p.id }); ev({ e: 'equip', p: p.id });
      }
      for (const m of S.mobs) if (m.tgt === p.id) { m.tgt = 0; m.back = 1; }
    }

    // ---------------- NPCs and quests
    function talk(p, n) {
      if (n.chest) { ev({ e: 'chest', p: p.id, npc: n.id }); return; }
      if (n.portal) {   /* touching a portal attunes you to it; you can travel to any portal you have touched (2026-10-04) */
        p.attuned = p.attuned || {}; const fresh = !p.attuned[n.portal]; p.attuned[n.portal] = 1; const P0 = portalOf(n.portal);
        if (fresh) msg(p, 'The stones hum as you touch them: you will always find your way back to ' + (P0 ? P0.name : 'here') + ' through any town portal.', 'info');
        ev({ e: 'portal', p: p.id, npc: n.id, here: n.portal, to: PORTALS.filter(P => P.id !== n.portal && p.attuned[P.id]).map(P => ({ id: P.id, name: P.name })), unknown: PORTALS.filter(P => !p.attuned[P.id]).map(P => P.name) }); return; }
      const ga = n.giftAfter, giftOk = !ga || ((p.quests[ga.quest] || {}).step || 0) > ga.step;   /* a gift can wait for a quest step (the Ashvale stone: after the Goblin Chief) */
      /* a "go and speak to so-and-so" step is met by speaking to them, wherever they happen to stand (the operator
         2026-10-05: quest goals are data, not code). Checked before their shop or their own lines, so an errand
         registers whether or not the errand ends at a counter. */
      let said = null, ends = null;
      for (const qid in p.quests) {
        const q = p.quests[qid], Q2 = D.quests.quests[qid], s2 = Q2 && Q2.steps[q.step - 1];
        if (s2 && s2.goal.talk === n.id && !q.n) { q.n = 1; msg(p, Q2.name + ': you have said your piece to ' + n.name + '.', 'quest'); if (s2.say && s2.say.length && !s2.ends) said = s2.say; }
        if (s2 && s2.ends === n.id && !ends) ends = qid;
      }
      /* "say": what the errand's NPC tells you about it, instead of their usual lines. "ends": the step is handed in to
         that NPC, not to the giver (the Wayside Prayer ends at the Saltmere chapel) */
      if (said && !ends) { ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: said.map(l => String(l).replace(/\{name\}/g, p.name || 'traveller')) }); return; }
      if (n.gift && giftOk && IT[n.gift] && !(p.gifts && p.gifts[n.gift])) {   /* a gift, once per character (Elder Maren's Ashvale stone) */
        if (addItem(p, n.gift, 1)) { msg(p, 'Your bag is full: make room for what ' + n.name + ' wants to give you.', 'warn'); return; }
        p.gifts = p.gifts || {}; p.gifts[n.gift] = S.t; ev({ e: 'inv', p: p.id }); ev({ e: 'take', p: p.id, id: n.gift, n: 1 });
        msg(p, n.name + ': ' + String(n.giftLine || 'Take this.').replace('{name}', p.name || 'traveller'), 'npc'); msg(p, n.name + ' gives you ' + IT[n.gift].name + '.', 'info');
      }   /* the town chest: the engine opens the wallet view (2026-10-04) */
      if (n.tailor && !(p._trade) && !ends) { ev({ e: 'tailor', p: p.id, npc: n.id }); msg(p, n.name + ': ' + (n.greet || 'Fancy a new look? Pick anything you like.'), 'npc'); return; }
      if (n.shop && !ends) { const sh = shopOf(n.shop); p.shop = n.shop; ev({ e: 'shop', p: p.id, shop: n.shop, npc: n.id }); msg(p, n.name + ': ' + sh.greet, 'npc'); return; }
      if (n.lines && !ends) { ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: n.lines }); return; }   /* dialogue straight off the zone data, checked after shop and quest */
      /* an NPC may offer the next quest only after the one before it is finished (Iria's supper, then the Gift of Angels) */
      let qid = ends || n.quest;
      if (!ends && n.quests && n.quests.length) {
        qid = n.quests[n.quests.length - 1];
        for (const id of n.quests) {
          const Q0 = D.quests.quests[id], q0 = p.quests[id];
          if (Q0 && (!q0 || q0.step <= Q0.steps.length)) { qid = id; break; }
        }
      }
      if (qid && D.quests.quests[qid]) {
        const Q = D.quests.quests[qid]; let q = p.quests[qid]; let lines;
        if (q && q.hid) delete q.hid;   /* back in the log, at the step it was left on */
        /* goal kinds, all data: {"kill":key,"n":n} counted by creditKill, {"cook":item,"n":n} by a successful cook,
           {"bring":item,"n":n} counted in your bag, {"talk":npc} by the loop above. A step may ask for a kill and a
           bring together, and a bring may also require "with". n defaults to 1. */
        const need = (st) => st.goal.n == null ? 1 : st.goal.n;
        const bringN = (st) => st.goal.bn == null ? need(st) : st.goal.bn;
        const withN = (st) => st.goal.wn == null ? 1 : st.goal.wn;
        const counted = (st) => (st.goal.kill || st.goal.cook || st.goal.talk) ? (q.n | 0) : (st.goal.bring && IT[st.goal.bring] ? invCount(p, st.goal.bring) : (q.n | 0));
        const met = (st) => {
          const g = st.goal;
          if ((g.kill || g.cook || g.talk) && (q.n | 0) < need(st)) return false;
          if (g.bring && (!IT[g.bring] || invCount(p, g.bring) < bringN(st))) return false;
          if (g.with && (!IT[g.with] || invCount(p, g.with) < withN(st))) return false;
          return !!(g.kill || g.cook || g.talk || g.bring);
        };
        const fill = (L, st) => L.map(l => String(l).replace(/\{(n|goal|left|name)\}/g, (m, k) => k === 'name' ? (p.name || 'traveller') : !st ? '' : k === 'n' ? counted(st) : k === 'goal' ? need(st) : Math.max(0, need(st) - counted(st))));
        const open = (st) => st && ZINDEX.some(z => z.id === st.zone);   /* a step opens when its zone EXISTS (it may not be loaded yet) */
        if (!q) { q = p.quests[qid] = { step: 1, n: 0 }; lines = fill(Q.steps[0].talk, Q.steps[0]); ev({ e: 'quest', p: p.id, q: qid, step: 1 }); addXp(p, 'speechcraft', SPEECH.xpQuestTalk || 250); }
        else {
          const st = Q.steps[q.step - 1];
          if (!st) lines = fill(Q.done, null);
          else if (!open(st)) { const prev = Q.steps[q.step - 2]; lines = prev && prev.locked && prev.locked.length ? fill(prev.locked, st) : ['The road to that place is not open yet. Come back another day.']; }
          else if (met(st) && (!st.ends || st.ends === n.id)) {
            if (st.goal.bring) {   /* the goods change hands here, and only here: a step cannot be handed in twice */
              removeItem(p, st.goal.bring, bringN(st));
              msg(p, 'You hand over ' + bringN(st) + ' x ' + IT[st.goal.bring].name + '.', 'quest');
            }
            if (st.goal.with) { removeItem(p, st.goal.with, withN(st)); msg(p, 'You hand over ' + withN(st) + ' x ' + IT[st.goal.with].name + '.', 'quest'); }
            if (st.goal.bring || st.goal.with) ev({ e: 'inv', p: p.id });
            const done = st.complete && st.complete.length ? fill(st.complete, st) : ['Well done, traveller. Take this, you have earned it.'];
            giveReward(p, st.reward, n.name, Q.name);
            q.step++; q.n = 0;
            const nx = Q.steps[q.step - 1];
            if (!nx) lines = done.concat(fill(Q.done, null));
            else if (!open(nx)) { lines = done.concat(st.locked && st.locked.length ? fill(st.locked, nx) : ['Rest now. When the road to ' + nx.zone + ' opens, come and see me again.']); q.wait = 1; }
            else lines = done.concat(fill(nx.talk, nx));
            ev({ e: 'quest', p: p.id, q: qid, step: q.step }); addXp(p, 'speechcraft', SPEECH.xpQuestTalk || 250);
          } else lines = st.progress && st.progress.length ? fill(st.progress, st) : [st.talk[0], 'So far: ' + counted(st) + ' of ' + need(st) + '.'];
        }
        ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines });
      }
    }
    function giveReward(p, r, giver, quest) {
      if (!r) return;
      if (r.indexOf('flag:') === 0) {   /* a blessing on the character, not an item: nothing to carry, trade or mint */
        const k = r.slice(5), F = FLAGS[k]; if (!F) return;
        p.flags = p.flags || {}; if (!p.flags[k]) p.flags[k] = S.t || 1;
        msg(p, 'You receive ' + F.name + '.' + (F.desc ? ' ' + F.desc : ''), 'quest'); ev({ e: 'flag', p: p.id, flag: k }); return;
      }
      /* 2026-10-04: "anytime an item is awarded after a quest, it should be its own collection" - the engine passes this
         on with the deposit and the Bank mints the reward into the collection named after the quest */
      if (IT[r] && quest) ev({ e: 'reward', p: p.id, id: r, collection: 'ASHVALE ' + quest });
      if (r.indexOf('xp:') === 0) { const [, sk, n] = r.split(':'); addXp(p, sk, (+n) * 10); msg(p, 'You gain ' + n + ' ' + cap(sk) + ' XP.', 'quest'); return; }
      if (IT[r]) { if (addItem(p, r, 1)) dropGround(r, 1, p.x, p.y, p.id, 600); msg(p, (giver || 'You are given') + ' gives you: ' + IT[r].name + '.', 'quest'); ev({ e: 'inv', p: p.id }); }
    }

    // ---------------- gathering
    function nodeDef(n) { return RU.nodes[n.kind]; }
    const FOREVER = 1e15;
    function setFelled(cells) {   /* trees other players felled, from the @ashvale Bank's shared list: down for good here too */
      let n = 0; for (const c of cells || []) { const x = c[0] | 0, y = c[1] | 0; if (!inMap(x, y)) continue; const i = idx(x, y), nd = nodeAt(i); if (!nd || !RU.nodes[nd.kind] || RU.nodes[nd.kind].skill !== 'woodcutting' || S.dep[i] >= FOREVER) continue; S.dep[i] = FOREVER; ev({ e: 'deplete', node: i }); n++; }
      return n;
    }
    function gatherTick(p, n) {
      const nd = nodeDef(n), i = idx(n.x, n.y);
      if (S.dep[i]) { p.act = null; p.skilling = null; return; }
      if (n.kind === 'altar') {
        p.face = faceTo(p.x, p.y, n.x, n.y); p.act = null; p.skilling = null;
        if ((p.pp | 0) >= maxPp(p)) { msg(p, 'You already have full Prayer points.'); return; }
        p.pp = maxPp(p); p.pd = 0; msg(p, 'You kneel and pray at the altar. Your Prayer points are restored.');
        ev({ e: 'pray', p: p.id, altar: 1, x: n.x, y: n.y }); return;
      }
      if (n.kind === 'range' || n.kind === 'fire') {
        const raw = p.inv.findIndex(s => s && IT[s.id].cooks);
        if (raw < 0) { msg(p, 'You have nothing to cook. Raw fish come from the fishing spots by the lake.'); p.act = null; p.skilling = null; return; }
        p.skilling = 'cook'; p.face = faceTo(p.x, p.y, n.x, n.y);
        if (!p.gT) { p.gT = S.t + nd.speed; return; }
        if (S.t < p.gT) return;
        p.gT = S.t + nd.speed;
        const rd = IT[p.inv[raw].id]; p.inv[raw] = null;
        const burnPct = Math.max(0, 40 - 4 * (lv(p, 'cooking') - rd.cookReq)) + (nd.burnBonus || 0);   /* an open fire burns a little more often */
        if (R.int(100) < burnPct) { addItem(p, rd.burns, 1); msg(p, 'You accidentally burn the ' + IT[rd.cooks].name.toLowerCase() + '.'); }
        else { addItem(p, rd.cooks, 1); addXp(p, 'cooking', rd.cookXp * 10); msg(p, 'You cook the ' + IT[rd.cooks].name.toLowerCase() + '.'); creditCook(p, rd.cooks); }
        ev({ e: 'gather', p: p.id, node: i, ok: true });
        return;
      }
      const skill = nd.skill, L = lv(p, skill), req = n.req == null ? nd.req : n.req, want = n.tool || null;
      if (L < req) { msg(p, 'You need a ' + cap(skill) + ' level of ' + req + ' to do that.', 'warn'); p.act = null; return; }
      const toolSlot = p.inv.find(s => s && IT[s.id].tool === skill && (!want || s.id === want)), tool = !!toolSlot || (isHawk(p) && skill === 'fishing');   /* a hawk swoops for fish, no tool */
      p.toolId = toolSlot ? toolSlot.id : null;   /* what is in the hand while skilling (rod, pot, net...): drawn by the engine */
      if (!tool) { msg(p, want ? 'You need a ' + IT[want].name.toLowerCase() + ' for this spot. The General Store sells them.' : skill === 'woodcutting' ? 'You need a hatchet to chop this tree. The General Store sells them.' : skill === 'mining' ? 'You need a pickaxe to mine this rock. The General Store sells them.' : 'You need a small fishing net. The General Store sells them.', 'warn'); p.act = null; return; }
      if (!canAdd(p, n.item, 1)) { msg(p, 'Your inventory is too full to hold any more.', 'warn'); p.act = null; p.skilling = null; return; }
      p.skilling = skill === 'woodcutting' ? 'chop' : skill === 'mining' ? 'mine' : 'fish';
      p.face = faceTo(p.x, p.y, n.x, n.y);
      if (!p.gT) { p.gT = S.t + nd.speed; msg(p, skill === 'woodcutting' ? 'You swing your hatchet at the tree.' : skill === 'mining' ? 'You swing your pickaxe at the rock.' : want === 'lobster_pot' ? 'You bait the pot and drop it in.' : want ? 'You cast your line out and wait.' : 'You cast out your net...'); return; }
      if (S.t < p.gT) return;
      p.gT = S.t + nd.speed;
      const pct = Math.max(8, Math.min(92, 30 + 2 * (L - req)));
      if (R.int(100) >= pct) { ev({ e: 'gather', p: p.id, node: i, ok: false }); return; }
      addItem(p, n.item, 1); addXp(p, skill, n.xp || nd.xp);
      msg(p, skill === 'woodcutting' ? 'You get some ' + IT[n.item].name.toLowerCase() + '.' : skill === 'mining' ? 'You manage to mine some ' + IT[n.item].name.split(' ')[0].toLowerCase() + '.' : 'You catch some ' + IT[n.item].name.toLowerCase().replace('raw ', '') + '.');
      ev({ e: 'gather', p: p.id, node: i, ok: true, item: n.item });
      if (nd.deplete && R.int(nd.deplete) === 0) { S.dep[i] = nd.regrow < 0 ? FOREVER : S.t + nd.regrow; ev({ e: 'deplete', node: i, p: p.id, x: n.x, y: n.y, forever: nd.regrow < 0 ? 1 : 0 }); p.act = null; p.skilling = null; }   /* regrow < 0: felled for good (2026-10-05) */
    }
    /* ---------------- firemaking (the operator: "drop some wood, start a camp fire and cook") ---------------- */
    const FIRE = RU.fires || { lightTicks: 3, basePct: 50, pctPerLevel: 2, maxPct: 95 };
    function lightTick(p, a) {
      const s0 = p.inv[a.slot];
      if (!s0 || s0.id !== a.id) { p.act = null; return; }
      const d = IT[s0.id];
      if (!p.inv.some(q => q && IT[q.id].tool === 'firemaking')) { msg(p, 'You need a tinderbox to light a fire. Tam sells them.', 'warn'); p.act = null; return; }
      if (lv(p, 'firemaking') < d.fireReq) { msg(p, 'You need a Firemaking level of ' + d.fireReq + ' to burn ' + d.name.toLowerCase() + '.', 'warn'); p.act = null; return; }
      if (S.fires.some(f => f.x === p.x && f.y === p.y) || M.insideAt(p.x, p.y)) { msg(p, "You can't light a fire here.", 'warn'); p.act = null; return; }
      p.skilling = 'light';
      if (!p.gT) { p.gT = S.t + FIRE.lightTicks; msg(p, 'You strike your tinderbox...'); return; }
      if (S.t < p.gT) return;
      p.gT = S.t + FIRE.lightTicks;
      const pct = Math.min(FIRE.maxPct, FIRE.basePct + FIRE.pctPerLevel * (lv(p, 'firemaking') - d.fireReq)) - Math.round(100 * wx(zoneOf(p.x, p.y), 'fireFail'));   /* rain */
      if (R.int(100) >= pct) { ev({ e: 'gather', p: p.id, ok: false }); return; }
      p.inv[a.slot] = null; p.act = null; p.skilling = null;
      addXp(p, 'firemaking', (d.fireXp || 0) * 10);
      msg(p, 'The fire catches and the ' + d.name.toLowerCase() + ' begin to burn.');
      const at = { x: p.x, y: p.y };
      if (isAuth(zoneOf(at.x, at.y))) hostFire(at.x, at.y, d.burnTicks, s0.id); else ev({ e: 'xfire', x: at.x, y: at.y, ticks: d.burnTicks, log: s0.id });
      ev({ e: 'inv', p: p.id });
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) if (canStep(p.x, p.y, dx, dy)) { p.path = [idx(p.x + dx, p.y + dy)]; break; }   /* step off the flames */
    }
    function hostFire(x, y, ticks, log) {
      if (!isAuth(zoneOf(x, y)) || S.fires.some(f => f.x === x && f.y === y)) return null;
      const f = { uid: nuid(), x, y, until: S.t + Math.max(10, Math.min(600, Math.round((ticks | 0) * wx(zoneOf(x, y), 'fireBurn')))), log: log || 'logs' };
      S.fires.push(f); ev({ e: 'fire', fire: f.uid, x, y, ticks: f.until - S.t, log: f.log }); return f;
    }
    function fireAdd(uid, x, y, ticks, log) { if (isAuth(zoneOf(x, y)) || S.fires.some(f => f.uid === uid)) return; S.fires.push({ uid, x, y, until: S.t + ticks, log }); ev({ e: 'fire', fire: uid, x, y, ticks, log }); }
    function fireOut(uid) { const i = S.fires.findIndex(f => f.uid === uid); if (i >= 0) { const f = S.fires[i]; S.fires.splice(i, 1); ev({ e: 'fireout', fire: uid, x: f.x, y: f.y }); } }

    /* ---------------- ABILITIES AS DATA (the operator: "a staff that ... freezes the enemy"; "items that have new abilities")
       An item carries {Effect, Effect ticks, Effect chance, Effect damage} in its JSON attributes; this library knows
       what each effect does. An unknown effect is ignored, so older engines stay safe. Host-resolved (it rides on hits). */
    const EFFECTS = {
      freeze: { hold: true, tint: 'freeze' },          /* can't move or attack */
      stun: { hold: true, tint: 'stun' },
      slow: { slow: true, tint: 'slow' },              /* moves and attacks every other tick */
      poison: { dot: 3, tint: 'poison' },              /* damage every 3 ticks */
      burn: { dot: 2, tint: 'burn' }                   /* damage every 2 ticks */
    };
    function applyEffect(m, w, src) {
      const L = EFFECTS[w.effect]; if (!L || !w.effectTicks) return;
      if (R.int(100) >= (w.effectChance == null ? 100 : w.effectChance)) return;
      m.fx = m.fx || {}; m.fx[w.effect] = { until: S.t + w.effectTicks, dmg: w.effectDamage | 0, src, next: S.t + (L.dot || 1) };
      ev({ e: 'fx', mob: m.uid, fx: w.effect, ticks: w.effectTicks, src });
    }
    function fxActive(m, kind) { const f = m.fx && m.fx[kind]; return f && f.until > S.t ? f : null; }
    function fxTick(m) {   /* returns true when the monster may not act this tick */
      if (!m.fx) return false;
      let hold = false;
      for (const k in m.fx) {
        const f = m.fx[k], L = EFFECTS[k];
        if (!L || f.until <= S.t) { delete m.fx[k]; ev({ e: 'fxend', mob: m.uid, fx: k }); continue; }
        if (L.hold) hold = true;
        if (L.slow && (S.t & 1)) hold = true;
        if (L.dot && f.dmg && S.t >= f.next) { f.next = S.t + L.dot; const dmg = Math.min(f.dmg, m.hp); m.hp -= dmg; ev({ e: 'hit', dst: m.uid, src: f.src, dmg, max: MON[m.key].hp, hp: m.hp, cls: k }); if (m.hp <= 0) { killMob(m, S.players[f.src] || null); return true; } }
      }
      return hold;
    }
    function faceTo(ax, ay, bx, by) { const dx = Math.sign(bx - ax), dy = Math.sign(by - ay); for (let k = 0; k < 8; k++) if (DIRS[k][0] === dx && DIRS[k][1] === dy) return k; return 2; }

    // ---------------- per-tick: players
    function stepPath(p) {
      if (!p.path.length) { p.moved = 0; return; }
      if (p.pfx && p.pfx.bind > S.t) { p.moved = 0; if (!p._bindMsg || S.t - p._bindMsg > 4) { p._bindMsg = S.t; msg(p, 'Shadowy chains hold your feet!', 'warn'); } return; }
      const bd = p.burden || 0;
      if (bd === 2) { p.moved = 0; if (!p._frozeMsg || S.t - p._frozeMsg > 8) { p._frozeMsg = S.t; msg(p, "You can't move: you are carrying far too much. Drop something.", 'warn'); } return; }
      if (bd === 1 && (S.t & 1)) { p.moved = 0; return; }   /* overburdened: a step every other tick, no running */
      if (bd === 1 && isHawk(p) && S.t % HK.groundEvery) { p.moved = 0; return; }   /* an overburdened hawk walks: half as fast again */
      if (p.runNow && p.path.length > 1 && (bd || !p.energy)) { p.runNow = false; msg(p, bd ? 'You are carrying too much to run.' : 'You are out of run energy: walking.', 'warn'); }
      let steps = FLY ? Math.min(4, p.path.length) : p.runNow && p.energy > 0 && p.path.length > 1 ? 2 : 1;   /* a hawk flies twice as fast as a run, for free (2026-10-04) */
      if (steps === 2) { const rf = wx(zoneOf(p.x, p.y), 'run'); if (rf < 1) { p.runAcc = (p.runAcc || 0) + Math.round(rf * 1000); if (p.runAcc >= 1000) p.runAcc -= 1000; else steps = 1; } }   /* snow: deep going */
      let moved = 0;
      for (let s = 0; s < steps && p.path.length; s++) {
        const n = p.path[0], nx = kx(n), ny = ky(n);
        if (!canStep(p.x, p.y, nx - p.x, ny - p.y)) { p.path = []; break; }
        p.face = faceTo(p.x, p.y, nx, ny); p.x = nx; p.y = ny; p.path.shift(); moved++;
      }
      p.moved = moved;
      if (moved === 2 && !FLY) { addXp(p, 'dexterity', 2 * (DEX.xpPerRunTile || 2)); p.energy = Math.max(0, p.energy - Math.floor(60 * (1000 - Math.min(DEX.drainMaxPermille || 400, (DEX.drainPerLevelPermille || 5) * lv(p, 'dexterity'))) / 1000)); if (!p.energy) { p.run = false; msg(p, 'You are out of run energy.', 'warn'); ev({ e: 'run', p: p.id }); } }
    }
    function playerAt(x, y, self) { for (const pid of S.order) { const o = S.players[pid]; if (o !== self && !o.dead && o.x === x && o.y === y) return true; } return false; }
    function puppetTick(p) {   /* another player's character in this game: position comes from the network, never stepped here */
      if (p.dead) return;
      if (p.atk > 0) p.atk--;
      const a = p.act;
      if (a && a.k === 'attack') {
        const m = mobByUid(a.uid);
        if (!m || m.dead) { p.act = null; return; }
        if (!isAuth(m.zone)) return;
        const rng = attackRange(p);
        if (inReach(p.x, p.y, m.x, m.y, rng)) { p.face = faceTo(p.x, p.y, m.x, m.y); if (p.atk <= 0) { if (p.eq.ammo) p.eq.ammo.n = 9999; if (playerAttack(p, m)) p.atk = attackSpeed(p); } }
      }
    }
    function deckEnds(B, p) { return B.flights.map(f => (p.lv || 0) > 0 ? [f[2], f[3]] : [f[0], f[1]]); }
    function climbNow(p, bi, dir) {
      const B = M.buildings[bi], nl = (p.lv || 0) + (dir > 0 ? 1 : -1);
      p.act = null; p.path = [];
      if (nl < 0 || nl >= B.floors) { msg(p, nl < 0 ? 'You are on the ground floor.' : 'This is the top floor.', 'warn'); return; }
      if (B.deck) {   /* up the nearest flight onto the wall, or down it into the yard */
        const f = B.flights.reduce((a, q) => { const e = nl > 0 ? [q[0], q[1]] : [q[2], q[3]], ea = nl > 0 ? [a[0], a[1]] : [a[2], a[3]]; return cheb(p.x, p.y, e[0], e[1]) < cheb(p.x, p.y, ea[0], ea[1]) ? q : a; });
        p.lv = nl; p.bld = nl > 0 ? bi : -1; p.x = nl > 0 ? f[2] : f[0]; p.y = nl > 0 ? f[3] : f[1];
        msg(p, nl > 0 ? 'You climb the steps onto the wall.' : 'You climb down into the yard.'); ev({ e: 'climb', p: p.id, lv: nl }); return;
      }
      const at = M.flightOf ? M.flightOf(bi, dir > 0 ? nl - 1 : nl) : B.stairs;   /* up: out of the opening; down: at the foot of the flight */
      p.lv = nl; p.bld = nl > 0 ? bi : -1; p.x = at[0]; p.y = at[1];
      msg(p, dir > 0 ? 'You climb up the stairs.' : 'You climb down the stairs.'); ev({ e: 'climb', p: p.id, lv: nl });
    }
    /* NPCs with a round (o.patrol: tiles in order, e.g. a watchman on the wall walk): one tile every 3 ticks, there and back */
    function patrolTick() {
      if (S.t % 3) return;
      for (const n of M.npcs) {
        const R = n.patrol; if (!R || R.length < 2 || n.escort) continue;
        if (n.pi == null) { n.pi = 0; n.pd = 1; }
        let k = n.pi + n.pd; if (k < 0 || k >= R.length) { n.pd = -n.pd; k = n.pi + n.pd; }
        n.pi = k; n.x = R[k][0]; n.y = R[k][1];
      }
    }
    /* the call to arms (the Lake Castle stone, 2026-10-05): the castle's guards (npc.guard) come to the player - over
       the stairs and walls inside the castle, through the town portals from anywhere else - keep round them without
       treading on each other, and fight what attacks them; "stand down" sends them home. One player's guards at a time. */
    function guards() { return M.npcs.filter(n => n.guard); }
    function callToArms(p, on) {
      const G = guards(); if (!G.length) { msg(p, 'Nobody answers.', 'warn'); return; }
      if (!on) { for (const n of G) if (n.escort) { n.escort = null; n.x = n.hx; n.y = n.hy; n.pi = 0; n.pd = 1; n.atkT = 0; } msg(p, 'The castle guard stands down and goes back to its posts.'); ev({ e: 'arms', p: p.id, on: false }); return; }
      const far = M.zoneAt ? M.zoneAt(p.x, p.y) !== M.zoneAt(G[0].hx != null ? G[0].hx : G[0].x, G[0].hy != null ? G[0].hy : G[0].y) : true;
      const used = new Set();
      G.forEach((n, i) => {
        if (n.hx == null) { n.hx = n.x; n.hy = n.y; }
        n.escort = p.id; n.slot = i; n.path = null; n.atkT = 0;
        if (far) { const s = guardSlot(p, i, used); n.x = s[0]; n.y = s[1]; used.add(s.join(',')); }   /* through the portals: they arrive at your side */
      });
      msg(p, far ? 'The castle guard comes through the portal to your side.' : 'The castle guard comes running.'); ev({ e: 'arms', p: p.id, on: true });
    }
    function guardSlot(p, i, used) {   /* each guard its own place in a ring round the player, so they do not tread on each other */
      const free = (x, y) => inMap(x, y) && !M.blocked(x, y) && !(x === p.x && y === p.y) && !(used && used.has(x + ',' + y));
      const k = i % 8, ring = 2 + Math.floor(i / 8), a = k / 8 * 2 * Math.PI;
      const x = p.x + Math.round(Math.cos(a) * ring), y = p.y + Math.round(Math.sin(a) * ring);
      if (free(x, y)) return [x, y];
      for (let r = 1; r <= 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(p.x + dx, p.y + dy)) return [p.x + dx, p.y + dy];
      return [p.x, p.y];
    }
    function guardTick() {
      for (const n of M.npcs) {
        if (!n.escort) continue;
        const p = S.players[n.escort]; if (!p) { n.escort = null; continue; }
        if (p.dead) continue;
        /* a threat: whatever is after the player, or anything hostile close by */
        let foe = null, fd = 1e9;
        for (const m of S.mobs) { if (m.dead) continue; const d = cheb(m.x, m.y, p.x, p.y); if ((m.tgt === p.id && d <= 12) || (MON[m.key].aggro && d <= 6)) { const dd = cheb(m.x, m.y, n.x, n.y); if (dd < fd) { fd = dd; foe = m; } } }
        const reach = n.gear && /bow/.test(n.gear.weapon || '') ? 6 : 1;
        if (foe && fd <= reach) {
          if (S.t >= (n.atkT || 0)) {
            n.atkT = S.t + 4;
            const md = MON[foe.key], dmg = Math.min(foe.hp, R.int((n.maxHit || 7) + 1)), cls = reach > 1 ? 'ranged' : 'melee';
            ev({ e: 'attack', src: 'n:' + n.id, dst: foe.uid, anim: reach > 1 ? 'bow' : 'slash', cls, delay: reach > 1 ? 1 : 0 });
            foe.hp -= dmg; ev({ e: 'hit', dst: foe.uid, src: 'n:' + n.id, dmg, max: md.hp, hp: foe.hp, cls });
            if (foe.hp <= 0) { killMob(foe, null); foe.killer = p.id; }   /* the player keeps the loot; the kill (and its quest credit) is the guard's */
          }
          continue;
        }
        const goal = foe ? [foe.x, foe.y] : guardSlot(p, n.slot | 0), gd = cheb(n.x, n.y, goal[0], goal[1]);
        if (gd <= (foe ? reach : 0)) continue;
        if (gd > 30) { const used = new Set(M.npcs.filter(o => o !== n && o.escort).map(o => o.x + ',' + o.y)), s = guardSlot(p, n.slot | 0, used); n.x = s[0]; n.y = s[1]; n.path = null; continue; }   /* fell far behind (a portal, a stone): catch up */
        if (!n.path || !n.path.length || S.t % 4 === 0) n.path = findPath(n.x, n.y, (x, y) => cheb(x, y, goal[0], goal[1]) <= (foe ? reach : 0) && !M.npcs.some(o => o !== n && o.escort && o.x === x && o.y === y), goal[0], goal[1], 40);
        const nx = n.path && n.path.shift();
        if (nx != null) { const x = kx(nx), y = ky(nx); if (!M.npcs.some(o => o !== n && o.escort && o.x === x && o.y === y)) { n.x = x; n.y = y; } }
      }
    }
    function playerTick(p) { LV_LIMIT = p.lv > 0 && M.buildingAt ? p.bld : -1; FLY = isHawk(p) && !(p.burden > 0); try { playerTick0(p); } finally { LV_LIMIT = -1; FLY = false; } }
    function playerTick0(p) {
      if (!p.dead) townCheck(p);
      if (p.poison) poisonTick(p);
      if (p.puppet) return puppetTick(p);
      if (p.dead) {
        if (S.t - p.dead >= 4) {
          const W0 = wakeSpot(p);
          p.dead = 0; p.hp = maxHp(p); p.pp = maxPp(p); p.pd = 0; p.x = W0.at[0]; p.y = W0.at[1]; p.lv = 0; p.bld = -1; p.path = []; p.atk = 0; p.spawnT = S.t;
          ev({ e: 'respawn', p: p.id }); msg(p, W0.name ? 'You wake up by the town portal in ' + W0.name + '.' : 'You wake up by the well in Ashvale village.'); burdenCheck(p);
        }
        return;
      }
      if (p.atk > 0) p.atk--;
      prayerTick(p); fxTick(p);
      if (p.hawkHp != null && p.hawkHp < HK.hp && S.t % HK.regenEvery === 0) p.hawkHp++;   /* a hawk's wounds mend slowly */
      const a = p.act;
      if (a && a.k === 'light') { lightTick(p, a); }
      else if (a && a.k === 'climb') { const B = M.buildings[a.bi]; if (B && B.deck) { if (deckEnds(B, p).some(q => cheb(p.x, p.y, q[0], q[1]) <= 1)) climbNow(p, a.bi, a.dir); else if (p.path.length) stepPath(p); else p.act = null; } else if (B && (cheb(p.x, p.y, B.stairs[0], B.stairs[1]) <= 1 || (B.alt && cheb(p.x, p.y, B.alt[0], B.alt[1]) <= 1))) climbNow(p, a.bi, a.dir); else if (p.path.length) stepPath(p); else p.act = null; }
      else if (a && a.k === 'attack') {
        const m = mobByUid(a.uid);
        if (!m || m.dead) { p.act = null; }
        else {
          const rng = attackRange(p);
          if (!inReach(p.x, p.y, m.x, m.y, rng) || (rng === 1 && playerAt(p.x, p.y, p) && !p.path.length)) {
            /* several attackers: melee players take the free tiles around the monster instead of stacking */
            p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, m.x, m.y, rng) && (rng > 1 || !playerAt(x, y, p)), m.x, m.y, 60);
            if (!p.path.length) p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, m.x, m.y, rng), m.x, m.y, 60);
            if (!p.path.length) { msg(p, "I can't reach that!", 'warn'); mobCome(m, p.id); p.act = null; return; }
            stepPath(p);
          } else { p.path = []; p.moved = 0; }
          if (inReach(p.x, p.y, m.x, m.y, rng)) {
            p._stall = 0; p._best = 0; p._still = 0;
            p.face = faceTo(p.x, p.y, m.x, m.y);
            if (isAuth(m.zone)) { if (p.atk <= 0) { if (playerAttack(p, m)) p.atk = attackSpeed(p); } }   /* replica: the host rolls our attacks */
          } else {
            /* AV11 (a tester, 2026-10-04): "sometimes a mob cannot be attacked, no visible reason". A click on a target
               the pather can only half-solve kept re-pathing every tick - no swing, no message, p.act still set. Give up
               out loud: ten ticks with no step at all, or 24 s with the mob no closer than the best it has been while we
               chase it. A mob that walks away is still fine - every new record resets the clock and leashed mobs stop at
               home; being unable to move at all is already covered by the burden message above. */
            const dn = cheb(p.x, p.y, m.x, m.y);
            if (!p._best || dn < p._best) { p._best = dn; p._still = 0; } else p._still = (p._still || 0) + 1;
            p._stall = p.moved ? 0 : (p._stall || 0) + 1;
            if (p.burden !== 2 && (p._still >= 40 || p._stall >= 10)) {
              msg(p, "You can't reach that from here.", 'warn'); mobCome(m, p.id); p.act = null; p.path = []; p._best = 0; p._still = 0; p._stall = 0;
            }
          }
        }
      } else if (a && a.k === 'take') {
        const g = S.ground.find(q => q.uid === a.uid);
        if (!g) p.act = null;
        else {
          if (p.x !== g.x || p.y !== g.y) { p.path = findPath(p.x, p.y, (x, y) => x === g.x && y === g.y, g.x, g.y); stepPath(p); if (!p.path.length && (p.x !== g.x || p.y !== g.y)) p.act = null; }
          if (p.act && p.x === g.x && p.y === g.y && !isAuth(zoneOf(g.x, g.y)) && g.bank == null) {   /* replica: ask the host; first claim wins (a persisted drop is the @ashvale Bank's: its 'took' decides, taken here) */
            if (!canAdd(p, g.id, g.n)) msg(p, "You don't have enough inventory space to hold that item.", 'warn'); else ev({ e: 'claim', p: p.id, g: g.uid });
            p.act = null;
          }
          if (p.act && p.x === g.x && p.y === g.y) {
            if (!canAdd(p, g.id, g.n)) msg(p, "You don't have enough inventory space to hold that item.", 'warn');
            else { const left = addItem(p, g.id, g.n); ev({ e: 'take', p: p.id, g: g.uid, id: g.id, n: g.n - left, x: g.x, y: g.y }); if (left) g.n = left; else { S.ground.splice(S.ground.indexOf(g), 1); if (g.bank != null) BANK_GONE.add(g.bank); } }   /* a persisted drop taken here: no host's copy brings it back (2026-10-06: the same 200 Gold, picked up again and again) */
            p.act = null;
          }
        }
      } else if (a && a.k === 'enter') {   /* walk up to a passage and go through: it takes you to its `to` */
        const o = passageAt(a.x, a.y);
        if (!o) p.act = null;
        else if (inReach(p.x, p.y, o.x, o.y, 1)) { teleport(p, { to: o.to, id: o.k }, o.say || (o.k === 'cavemouth' ? 'You climb down into the dark. Something skitters ahead.' : 'You climb back up into the daylight.')); }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, o.x, o.y, 1), o.x, o.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, o.x, o.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else if (a && a.k === 'npc') {
        const n = M.npcs.find(q => q.id === a.id);
        if (inReach(p.x, p.y, n.x, n.y, 1)) { p.face = faceTo(p.x, p.y, n.x, n.y); p.act = null; p.path = []; talk(p, n); ev({ e: 'face', npc: n.id, x: p.x, y: p.y }); }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, n.x, n.y, 1), n.x, n.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, n.x, n.y, 1)) p.act = null; }
      } else if (a && a.k === 'gather') {
        const n = nodeAt(a.i);
        if (!n) { p.act = null; p.skilling = null; }
        else if (inReach(p.x, p.y, n.x, n.y, 1) || (n.kind === 'fire' && p.x === n.x && p.y === n.y)) { p.path = []; p.moved = 0; gatherTick(p, n); }
        else { p.skilling = null; p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, n.x, n.y, 1), n.x, n.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, n.x, n.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else stepPath(p);
      if (p.shop) { const sh = shopOf(p.shop); if (!nearKeeper(p, sh)) closeShop(p); }
      burdenCheck(p);
      if (!p.moved || !p.run) p.energy = Math.min(10000, p.energy + 15);
      if (S.t % (p.pray && p.pray.rapid_heal ? 50 : 100) === 0 && p.hp < maxHp(p)) p.hp++;
    }

    // ---------------- per-tick: monsters (RuneScape-style dumb pathing: step straight at the target, get stuck on trees)
    function occupied(x, y, self) { for (const m of S.mobs) if (m !== self && !m.dead && m.x === x && m.y === y) return true; return playerAt(x, y, null); }   /* monsters never step onto a player */
    function mobStepToward(m, tx, ty) {
      const dx = Math.sign(tx - m.x), dy = Math.sign(ty - m.y);
      const tries = dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : dx ? [[dx, 0], [dx, 1], [dx, -1]] : [[0, dy], [1, dy], [-1, dy]];
      for (const [sx, sy] of tries) {
        if (!sx && !sy) continue;
        if (canStep(m.x, m.y, sx, sy) && !M.insideAt(m.x + sx, m.y + sy) && !occupied(m.x + sx, m.y + sy, m) && (m.crossing || M.zoneAt(m.x + sx, m.y + sy) === M.zoneAt(m.sx, m.sy))) { m.face = faceTo(m.x, m.y, m.x + sx, m.y + sy); m.x += sx; m.y += sy; m.step = 1; return true; }
      }
      return false;
    }
    /* ---------------- humanoid behaviour (goblins, bandits): host-only, deterministic, bounded per tick ----------------
       BFS paths (cached, depth-limited) around trees and through doors; group aggro by faction; archers keep 4-6 tiles,
       shoot, back off, and draw their sword when cornered or out of arrows; goblins flee below 25 % and come back with
       friends; the leader drinks his potion once and raises his shield; leash, walk home, patrol around the post. */
    /* 2026-10-01: "If you can attack an attacker, the attacker should be able to attack you back even if you're not in
       its zone". A monster hit by a player in the last RETALIATE.ticks keeps that player as its target past its zone and leash
       (up to RETALIATE.beyond tiles beyond the leash), steps out of its zone to reach them and shoots back if it can. When the
       attacks stop, or the player dies or goes too far, the normal leash and walk-home logic takes over again. */
    const RETALIATE = RU.retaliate || { ticks: 10, beyond: 12 };
    function retaliating(m, leash) {
      if (!m.hurt || S.t - (m.hurtT || -1e9) > RETALIATE.ticks) return false;
      const p = S.players[m.hurt]; if (!p || p.dead) return false;
      if (cheb(p.x, p.y, m.sx, m.sy) > leash + RETALIATE.beyond) return false;
      m.tgt = p.id; m.back = 0; return true;
    }
    function sightOf(m, md) { return md.aggro > 0 ? Math.max(1, Math.round(md.aggro * wx(m.zone, 'sight'))) : 0; }
    function mobAt(x, y, self) { for (const o of S.mobs) if (o !== self && !o.dead && o.x === x && o.y === y) return true; return false; }
    /* "I can't reach that" is the player's side of a fact that belongs to the monster: it is standing where melee can
       never land. a tester lost the back half of two hunt runs to one rat like that (2026-10-04) - 75 s of swings at
       distance 1-3 for zero damage - and @apple confirmed it in-world twice ("there is no way to get to that rat").
       Measured on the shipped spawn posts, 3 of 29 sit where nothing can reach them (whisperwood rats at 32,33 and
       15,36, a goblin at 41,20). The operator's rule is that mobs are meant to reach you (PLAN.md, and safespots were
       refused for exactly that reason), so when a player's pather proves the target is unreachable, the monster is
       told to come here. It is not made to fight - no target, no attack, and a timid one stays timid - it just walks
       toward the player who is trying to hit it, which is the one thing that gets it out of a corner. */
    function mobCome(m, pid) { m.come = { by: pid, t: S.t }; }
    function comeStep(m) {   /* the nudge is being served: one step toward the player who could not reach us */
      if (!m.come || S.t - m.come.t > 20) { m.come = null; return false; }
      const q = S.players[m.come.by];
      if (!q || q.dead || cheb(q.x, q.y, m.x, m.y) > 25) { m.come = null; return false; }
      if (inReach(m.x, m.y, q.x, q.y, 1)) return false;   /* we are hittable again: go back to whatever we were doing */
      /* the walkable way out of a pocket is usually not the direction of the player - the whisperwood rats at 15,36
         and 16,35 sit diagonally to each other with walls on both orthogonal sides, so every step that shortens the
         distance is blocked and a greedy step never moves them. Ask the pather, the same way a humanoid does. */
      if (mobPathStep(m, (x, y) => inReach(x, y, q.x, q.y, 1) && !playerAt(x, y, null) && !mobAt(x, y, m), q.x, q.y, 14)) return true;
      if (!mobStepToward(m, q.x, q.y)) { m.come = null; return false; }   /* nowhere to go: give the nudge up */
      return true;
    }
    function rally(m, pid, radius) {
      const ai = MON[m.key].ai; if (!ai) return;
      for (const o of S.mobs) {
        if (o === m || o.dead || o.tgt || o.zone !== m.zone) continue;
        const oa = MON[o.key].ai; if (!oa || oa.faction !== ai.faction) continue;
        if (cheb(o.x, o.y, m.x, m.y) <= radius || cheb(o.sx, o.sy, m.sx, m.sy) <= radius) { o.tgt = pid; o.back = 0; o.path = null; }   /* near it now, or posted near it */
      }
    }
    function mobPathStep(m, goal, ax, ay, depth) {
      const key = ax + ',' + ay;
      if (!m.path || !m.path.length || m.pathKey !== key || S.t - (m.pathT || 0) > 4) { m.path = findPath(m.x, m.y, goal, ax, ay, depth || 16); m.pathKey = key; m.pathT = S.t; }
      if (!m.path.length) return false;
      const n = m.path[0], nx = kx(n), ny = ky(n);
      if (!canStep(m.x, m.y, nx - m.x, ny - m.y) || occupied(nx, ny, m) || M.insideAt(nx, ny) || (!m.crossing && M.zoneAt(nx, ny) !== m.zone)) { m.path = null; return false; }
      m.face = faceTo(m.x, m.y, nx, ny); m.x = nx; m.y = ny; m.path.shift(); m.step = 1; return true;
    }
    /* STAMPEDE (2026-10-06: "I want game animals to all run if you attack one of the herd ... They all should run in the
       same direction"). The first attack on a timid animal (hit or miss) sets off its whole herd - the animals of its worldgen
       herd (m.site), or for those without one (yard birds) its own kind within 8 tiles - in ONE direction: away from the
       attacker, measured from the herd's middle. Each runs about STAMPEDE.dist tiles that way, two steps a tick, round what is
       in the way; where it stops it grazes (its new post); STAMPEDE.drift ticks later it walks back home. */
    const STAMPEDE = Object.assign({ dist: 25, ticks: 30, drift: 300 }, RU.stampede || {});
    function stampede(m, p) {
      if (!p || m.dead || (m.flight && m.flight.run)) return;   /* already running */
      const herd = S.mobs.filter(q => !q.dead && MON[q.key].fleeHit && q.zone === m.zone &&
        (m.site ? q.site === m.site : (q.key === m.key && !q.site && cheb(q.x, q.y, m.x, m.y) <= 8)));
      if (!herd.length) return;
      const cx = herd.reduce((a, q) => a + q.x, 0) / herd.length, cy = herd.reduce((a, q) => a + q.y, 0) / herd.length;
      let dx = cx - p.x, dy = cy - p.y; if (!dx && !dy) { dx = m.x - p.x; dy = m.y - p.y; } if (!dx && !dy) dx = 1;
      const L = Math.sqrt(dx * dx + dy * dy); dx /= L; dy /= L;
      for (const q of herd) {
        if (!q.home) q.home = [q.sx, q.sy];
        q.flight = { tx: q.x + Math.round(dx * STAMPEDE.dist), ty: q.y + Math.round(dy * STAMPEDE.dist), until: S.t + STAMPEDE.ticks, run: 1 };
        q.tgt = 0; q.wx = null; q.path = null; q.homeAt = 0;
      }
      ev({ e: 'stampede', mob: m.uid, n: herd.length, dir: [Math.round(dx * 100) / 100, Math.round(dy * 100) / 100] });
    }
    /* one tick of a run (or of the walk home): up to 2 steps (1 walking) toward the target, round anything in the way, never
       indoors, never out of its area. Arrived, out of time or stuck: it stops, and that spot is its post */
    function flightTick(m) {
      const F = m.flight;
      for (let k = 0; k < (F.run ? 2 : 1); k++) {
        const d0 = cheb(m.x, m.y, F.tx, F.ty); if (d0 === 0) break;
        let best = null, bd = 1e9;
        for (const [dx, dy] of DIRS) {
          const nx = m.x + dx, ny = m.y + dy;
          if (!canStep(m.x, m.y, dx, dy) || occupied(nx, ny, m) || M.insideAt(nx, ny) || M.zoneAt(nx, ny) !== m.zone) continue;
          const d = Math.abs(nx - F.tx) + Math.abs(ny - F.ty); if (d < bd) { bd = d; best = [dx, dy]; }
        }
        if (!best || bd >= Math.abs(m.x - F.tx) + Math.abs(m.y - F.ty) + 1) break;   /* nowhere closer: it stops here */
        m.face = faceTo(m.x, m.y, m.x + best[0], m.y + best[1]); m.x += best[0]; m.y += best[1]; m.step = 1;
      }
      const done = (m.x === F.tx && m.y === F.ty) || S.t >= F.until || (F.lx === m.x && F.ly === m.y);
      F.lx = m.x; F.ly = m.y;
      if (!done) return true;
      m.flight = null; m.sx = m.x; m.sy = m.y;   /* where it stopped is where it grazes */
      if (F.run) m.homeAt = S.t + STAMPEDE.drift;
      else if (m.home && m.x === m.home[0] && m.y === m.home[1]) { m.home = null; m.homeAt = 0; }
      return true;
    }
    function stepAway(m, p, leash) {   /* the first of the 8 directions that increases the distance and stays near the post */
      const d0 = cheb(m.x, m.y, p.x, p.y); let best = null, bd = d0;
      for (const [dx, dy] of DIRS) {
        const nx = m.x + dx, ny = m.y + dy;
        if (!canStep(m.x, m.y, dx, dy) || occupied(nx, ny, m) || M.insideAt(nx, ny) || (!m.crossing && M.zoneAt(nx, ny) !== m.zone) || cheb(nx, ny, m.sx, m.sy) > leash + (m.crossing ? RETALIATE.beyond : 0)) continue;
        const d = cheb(nx, ny, p.x, p.y); if (d > bd) { bd = d; best = [dx, dy]; }
      }
      if (!best) return false;
      m.face = faceTo(m.x, m.y, p.x, p.y); m.x += best[0]; m.y += best[1]; m.step = 1; m.path = null; return true;
    }
    function acquire(m, md) {   /* the nearest player it is willing to attack */
      let best = null, bd = 99;
      for (const pid of S.order) {
        const q = S.players[pid];
        if (q.dead || q.lv > 0 || airborne(q) || S.t - q.spawnT <= 8 || combatLevel(q) > mobCombat(md) || M.zoneAt(q.x, q.y) !== m.zone) continue;   /* monsters keep to the ground floor, and cannot reach a hawk */
        const d = cheb(q.x, q.y, m.x, m.y); if (d <= sightOf(m, md) && d < bd) { bd = d; best = q; }
      }
      if (best) { m.tgt = best.id; m.back = 0; m.path = null; }
      return best;
    }
    function humanoidTick(m, md) {
      const ai = md.ai;
      if (m.atk > 0) m.atk--;
      if (ai.potionPct && !m.drank && m.carry && m.carry.potion > 0 && m.hp * 100 < md.hp * ai.potionPct) {
        m.drank = 1; m.carry.potion--; m.hp = Math.min(md.hp, m.hp + Math.floor(md.hp / 2)); m.atk = Math.max(m.atk, 2);
        ev({ e: 'mobeat', mob: m.uid }); return;
      }
      let p = m.tgt ? S.players[m.tgt] : null;
      m.crossing = retaliating(m, ai.leash);
      if (p && !(m.crossing && p.id === m.hurt) && (p.dead || cheb(m.x, m.y, m.sx, m.sy) > ai.leash || cheb(p.x, p.y, m.sx, m.sy) > ai.leash + 4 || M.zoneAt(p.x, p.y) !== m.zone)) { m.tgt = 0; m.back = 1; m.path = null; p = null; m.fleeing = 0; }
      if (p && ai.fleePct && !m.fled && m.hp * 100 < md.hp * ai.fleePct) { m.fled = 1; m.fleeing = S.t; m.path = null; ev({ e: 'mobflee', mob: m.uid }); }
      if (m.fleeing) {
        if (S.t - m.fleeing > 12 || (m.x === m.sx && m.y === m.sy)) { m.fleeing = 0; if (m.tgt) rally(m, m.tgt, 8); }   /* regrouped: back into the fight with friends */
        else { if (!mobPathStep(m, (x, y) => x === m.sx && y === m.sy, m.sx, m.sy, 24) && p) stepAway(m, p, ai.leash); return; }
      }
      if (!p && !m.back && md.aggro > 0) p = acquire(m, md);
      if (comeStep(m)) { if (m.hp < md.hp && S.t % 10 === 0) m.hp++; return; }   /* someone is trying to hit us and cannot: come out to them, without attacking */
      if (p) {
        const d = cheb(m.x, m.y, p.x, p.y), archer = m.carry && Object.keys(m.carry).some(k => /^arrows_/.test(k) && m.carry[k] > 0);
        if (archer) {
          const rf = wx(m.zone, 'range'), keep = [Math.max(2, Math.round((ai.keep || [4, 6])[0] * rf)), Math.max(2, Math.round((ai.keep || [4, 6])[1] * rf))];
          if (d <= 2 && stepAway(m, p, ai.leash)) return;   /* backs off when you close in ... */
          if (d > 2 || !archer) {
            if (d <= keep[1] + 1 && lineOfSight(m.x, m.y, p.x, p.y)) { m.face = faceTo(m.x, m.y, p.x, p.y); if (m.atk <= 0) { mobAttack(m, p, true); m.atk = md.speed; } return; }
            if (mobPathStep(m, (x, y) => { const dd = cheb(x, y, p.x, p.y); return dd >= keep[0] && dd <= keep[1] && lineOfSight(x, y, p.x, p.y); }, p.x, p.y, 14)) return;
          }
          /* ... and draws the sword when cornered */
        }
        if (m.x === p.x && m.y === p.y) { stepAway(m, p, ai.leash + 2); return; }
        if (md.cast) {   /* a caster (2026-10-07, the wraith): spells from up to cast.range tiles away, wherever it can see you */
          const rng = md.cast.range || 5;
          if (d <= rng && lineOfSight(m.x, m.y, p.x, p.y)) { m.face = faceTo(m.x, m.y, p.x, p.y); if (m.atk <= 0) { mobAttack(m, p, 'magic'); m.atk = md.speed; } return; }
          if (mobPathStep(m, (x, y) => cheb(x, y, p.x, p.y) <= rng && lineOfSight(x, y, p.x, p.y) && !playerAt(x, y, null) && !mobAt(x, y, m), p.x, p.y, 18)) return;
        }
        if (inReach(m.x, m.y, p.x, p.y, 1)) { m.face = faceTo(m.x, m.y, p.x, p.y); if (m.atk <= 0) { mobAttack(m, p); m.atk = md.speed; } return; }
        if (!mobPathStep(m, (x, y) => inReach(x, y, p.x, p.y, 1) && !playerAt(x, y, null) && !mobAt(x, y, m), p.x, p.y, 18)) mobStepToward(m, p.x, p.y);
        return;
      }
      if (m.back) {
        if (m.x === m.sx && m.y === m.sy) { m.back = 0; m.stuck = 0; }
        else if (!mobPathStep(m, (x, y) => x === m.sx && y === m.sy, m.sx, m.sy, 30)) { m.stuck = (m.stuck || 0) + 1; if (m.stuck > 8 && !occupied(m.sx, m.sy, m)) { m.x = m.sx; m.y = m.sy; m.back = 0; m.stuck = 0; } }
        if (m.hp < md.hp && S.t % 5 === 0) m.hp++;
        return;
      }
      if (R.int(12) === 0) { m.wx = m.sx + R.int(5) - 2; m.wy = m.sy + R.int(5) - 2; }   /* patrol a little around the post */
      if (m.wx != null && !(m.x === m.wx && m.y === m.wy)) { if (!mobStepToward(m, m.wx, m.wy)) m.wx = null; }
      if (m.hp < md.hp && S.t % 10 === 0) m.hp++;
    }
    function mobTick(m) {
      const md = MON[m.key];
      m.step = 0;
      if (!isAuth(m.zone)) return;
      if (m.dead) {   /* stays dead a while: back when the area empties (repopulate), or after DEAD_TICKS at its post when nobody stands near it */
        if (m.dropAt && S.t >= m.dropAt) { m.dropAt = 0; mobDrops(m); }
        if (S.t - m.dead >= DEAD_TICKS && !m.dropAt && (S.t + m.uid) % 10 === 0) {
          /* back after DEAD_TICKS even with players about (2026-10-06: "even with multiple players present they should
             eventually respawn"): at its post if nobody stands within 8 tiles, else on open ground 6-12 tiles from it with
             nobody within 5, and after twice as long at the post whatever */
          const near = (x, y, r) => Object.values(S.players).some(q => q && !q.dead && cheb(q.x, q.y, x, y) <= r);
          let at = !near(m.sx, m.sy, 8) && !occupied(m.sx, m.sy, m) ? [m.sx, m.sy] : null;
          if (!at) for (let r = 6; r <= 12 && !at; r += 2) for (let k = 0; k < 16 && !at; k++) {
            const a = (k / 16 + (m.uid % 7) / 7) * 2 * Math.PI, x = m.sx + Math.round(Math.cos(a) * r), y = m.sy + Math.round(Math.sin(a) * r);
            if (inMap(x, y) && !M.blocked(x, y) && !near(x, y, 5) && !occupied(x, y, m) && (!M.zoneAt || M.zoneAt(x, y) === M.zoneAt(m.sx, m.sy))) at = [x, y];
          }
          if (!at && S.t - m.dead >= 2 * DEAD_TICKS && !occupied(m.sx, m.sy, m)) at = [m.sx, m.sy];
          if (!at) return;
          m.dead = 0; m.x = at[0]; m.y = at[1]; m.hp = md.hp; m.tgt = 0; m.back = 0; m.atk = 0; m.hurt = null; m.flight = null; m.homeAt = 0; if (m.home) { m.sx = m.home[0]; m.sy = m.home[1]; m.home = null; } m.carry = m.carry0 ? Object.assign({}, m.carry0) : null; m.fx = null; m.drank = 0; m.fled = 0; m.fleeing = 0; m.path = null;
          ev({ e: 'spawn', mob: m.uid });
        }
        return;
      }
      if (fxTick(m)) { if (m.dead) return; if (m.atk > 0) m.atk--; return; }   /* frozen / stunned / slowed this tick */
      if (m.dead) return;
      if (md.ai && md.ai.kind === 'humanoid') return humanoidTick(m, md);
      if (m.atk > 0) m.atk--;
      if (m.flight) { flightTick(m); return; }   /* stampeding with its herd (or walking home after) */
      if (m.home && m.homeAt && S.t >= m.homeAt && !m.tgt) { m.flight = { tx: m.home[0], ty: m.home[1], until: S.t + 400, run: 0 }; m.homeAt = 0; }
      /* a timid animal that is hit runs from whoever hit it, two steps a tick, instead of fighting back (the operator) */
      if (md.fleeHit && m.hurt && S.t - (m.hurtT || -1e9) <= 14) { const q = S.players[m.hurt]; if (q && !q.dead) { m.tgt = 0; m.wx = null; if (stepAway(m, q, 10)) stepAway(m, q, 10); return; } }
      if (comeStep(m)) { if (m.hp < md.hp && S.t % 10 === 0) m.hp++; return; }   /* someone is trying to hit us and cannot: come out to them, without attacking */
      if (m.follow) { if (S.t < m.follow.at) return; followThrough(m); }   /* coming up (or down) through a cave opening after its target */
      let p = m.tgt ? S.players[m.tgt] : null;
      /* RELENTLESS (2026-10-07, the Spider Cave: "they should follow you out of their spawn zone indefinitely"): once it
         has you it ignores its area and its leash, and only stops when you die (or leave the game) */
      if (md.relentless) { m.crossing = !!p; if (p && p.dead) { m.tgt = 0; m.back = 1; p = null; } }
      else {
        m.crossing = retaliating(m, 10);
        if (p && !(m.crossing && p.id === m.hurt) && (p.dead || cheb(m.x, m.y, m.sx, m.sy) > 10 || cheb(p.x, p.y, m.sx, m.sy) > 14)) { m.tgt = 0; m.back = 1; p = null; }
      }
      if (!p && !m.back && md.aggro > 0) {
        for (const pid of S.order) { const q = S.players[pid]; if (!q.dead && !airborne(q) && S.t - q.spawnT > 8 && cheb(q.x, q.y, m.x, m.y) <= sightOf(m, md) && (md.hunter || combatLevel(q) <= mobCombat(md)) && M.zoneAt(q.x, q.y) === M.zoneAt(m.sx, m.sy)) { m.tgt = q.id; p = q; break; } }   /* hunters (timber wolves) take on anyone */
      }
      /* shy animals (2026-10-04: chickens scatter, deer flee when you come close): within md.shy tiles of a
         player they run, two steps a tick, away from the nearest one and back toward home after. Hit one and it is
         a fight like any other (retaliation above keeps its attacker as the target). */
      if (!p && md.shy) {
        let q = null, qd = md.shy + 1;
        for (const pid of S.order) { const o = S.players[pid]; if (o.dead || o.lv > 0 || airborne(o)) continue; const d = cheb(o.x, o.y, m.x, m.y); if (d < qd) { qd = d; q = o; } }
        if (q) { m.wx = null; if (stepAway(m, q, 10)) stepAway(m, q, 10); if (m.hp < md.hp && S.t % 10 === 0) m.hp++; return; }
      }
      if (p) {
        if (m.x === p.x && m.y === p.y) { for (const [dx, dy] of DIRS.slice(0, 4)) if (canStep(m.x, m.y, dx, dy) && !occupied(m.x + dx, m.y + dy, m)) { m.x += dx; m.y += dy; m.step = 1; break; } return; }
        if (md.cast) {
          const rng = md.cast.range || 5, d = cheb(m.x, m.y, p.x, p.y);
          if (d <= rng && lineOfSight(m.x, m.y, p.x, p.y)) { m.face = faceTo(m.x, m.y, p.x, p.y); if (m.atk <= 0) { mobAttack(m, p, 'magic'); m.atk = md.speed; } return; }
          if (mobPathStep(m, (x, y) => cheb(x, y, p.x, p.y) <= rng && lineOfSight(x, y, p.x, p.y) && !playerAt(x, y, null) && !mobAt(x, y, m), p.x, p.y, 18)) return;
        }
        if (inReach(m.x, m.y, p.x, p.y, 1)) { m.face = faceTo(m.x, m.y, p.x, p.y); if (m.atk <= 0) { mobAttack(m, p); m.atk = md.speed; } }
        else mobStepToward(m, p.x, p.y);
        return;
      }
      if (m.back) { if (m.x === m.sx && m.y === m.sy) m.back = 0; else if (!mobStepToward(m, m.sx, m.sy)) { m.x = m.sx; m.y = m.sy; m.back = 0; } if (m.hp < md.hp && S.t % 5 === 0) m.hp++; return; }
      if (md.ownDice) {   /* wildlife wanders on its own dice (uid + tick), so a hen in a yard never shifts the fight rolls */
        const h = Math.imul((m.uid % 2147483647) ^ Math.imul(S.t, 0x9e3779b1), 0x85ebca6b) >>> 0, r = md.roam || 3;
        if (h % (md.roamEvery || 10) === 0) { m.wx = m.sx + ((h >>> 8) % (2 * r + 1)) - r; m.wy = m.sy + ((h >>> 16) % (2 * r + 1)) - r; }   /* roamEvery: birds potter about */
      } else if (R.int(10) === 0) { const tx = m.sx + R.int(7) - 3, ty = m.sy + R.int(7) - 3; m.wx = tx; m.wy = ty; }
      if (m.wx != null && !(m.x === m.wx && m.y === m.wy)) { if (!mobStepToward(m, m.wx, m.wy)) m.wx = null; }
      if (m.hp < md.hp && S.t % 10 === 0) m.hp++;
    }

    /* ---------------- seeded land (globe P2 step B): the monster camps of worldgen's sites come to life when a player
       comes within two chunks (128 m) of them. Their uids come from the site ids (every game agrees) and waking depends
       only on where players have been, so replays hold. Leash, retaliation and the humanoid AI work as for any monster. */
    const siteOn = new Set();
    function siteUid(s) { let a = 2166136261, b = 5381; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = (Math.imul(b, 33) + c) >>> 0; } return 17179869184 + a * 256 + (b & 255); }
    function wake(p) {
      const ck = (p.x >> 6) + ',' + (p.y >> 6); if (p._wake === ck) return; p._wake = ck;
      const x0 = ((p.x >> 6) - 2) << 6, y0 = ((p.y >> 6) - 2) << 6;
      for (const st of M.sitesIn(x0, y0, x0 + 319, y0 + 319)) {
        if (!st.spawns.length || siteOn.has(st.id)) continue; siteOn.add(st.id);
        for (const sp of st.spawns) {
          const md = MON[sp.m], uid = siteUid(sp.uid); if (!md || MIX.has(uid)) continue;
          const m = { uid, key: sp.m, x: sp.x, y: sp.y, sx: sp.x, sy: sp.y, hp: md.hp, tgt: 0, atk: 0, dead: 0, back: 0, face: 2, step: 0, zone: M.zoneAt(sp.x, sp.y),
            carry0: sp.carry || null, carry: sp.carry ? Object.assign({}, sp.carry) : null, site: st.id };
          S.mobs.push(m); MIX.set(uid, m); ev({ e: 'mobadd', mob: uid });
        }
      }
    }
    // ---------------- the tick
    function tick() {
      S.t++; S.ev = [];
      while (queue.length) { const [pid, c] = queue.shift(); const p = S.players[pid]; if (p) apply(p, c); }
      for (const pid of S.order) playerTick(S.players[pid]);
      if (M.seeded) for (const pid of S.order) wake(S.players[pid]);
      for (const m of S.mobs) mobTick(m);
      patrolTick(); guardTick();
      for (let i = 0; i < S.pending.length;) { const h = S.pending[i]; if (h.at <= S.t) { S.pending.splice(i, 1); landOnMob(h); } else i++; }
      for (let i = 0; i < S.ground.length;) { const g = S.ground[i]; if (g.until <= S.t && isAuth(zoneOf(g.x, g.y))) { S.ground.splice(i, 1); ev({ e: 'vanish', g: g.uid, x: g.x, y: g.y }); } else i++; }
      const occ = {};
      for (const pid of S.order) { const p = S.players[pid]; if (!p.dead) occ[zoneOf(p.x, p.y)] = 1; }
      for (const z in occ) { if (S.seen[z] != null && S.t - S.seen[z] > EMPTY_TICKS && isAuth(z)) repopulate(z); S.seen[z] = S.t; }
      for (const k in S.dep) if (S.dep[k] <= S.t) { delete S.dep[k]; ev({ e: 'regrow', node: +k }); }
      for (const f of S.fires.slice()) if (f.until <= S.t && isAuth(zoneOf(f.x, f.y))) fireOut(f.uid);
      weatherTick();
      return S.ev;
    }
    /* ---------------- network API (engine): host side */
    function addPuppet(id, st) { const p = newPlayer(id, null); p.puppet = true; p.inv = new Array(28).fill(null); S.players[id] = p; if (S.order.indexOf(id) < 0) S.order.push(id); p.spawnT = S.t - 100; setPuppet(id, st || {}); return p; }
    const PUP_SKILLS = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'dexterity'];
    function setPuppet(id, st) {
      const p = S.players[id]; if (!p || !p.puppet) return;
      if (Number.isInteger(st.x) && Number.isInteger(st.y) && inMap(st.x, st.y)) { p.x = st.x; p.y = st.y; }
      if (Number.isInteger(st.hp)) p.hp = st.hp;
      if (st.dead != null) { const was = p.dead; p.dead = st.dead ? (p.dead || S.t) : 0; if (st.dead && !was) { p.act = null; for (const m of S.mobs) if (m.tgt === id) { m.tgt = 0; m.back = 1; } } }
      if (Array.isArray(st.L)) PUP_SKILLS.forEach((k, i) => { const L = st.L[i] | 0; if (L >= 1 && L <= 99) p.xp[k] = XP[L] * 10; });
      if (st.g && typeof st.g === 'object') { p.eq = {}; for (const k of EQ_SLOTS) { const v = st.g[k]; if (v && IT[v] && IT[v].eq === k) p.eq[k] = { id: v, n: IT[v].stack ? 9999 : 1 }; } }
      if (st.st && typeof st.st === 'object') for (const k in p.styles) if (Number.isInteger(st.st[k])) p.styles[k] = st.st[k];
      if (st.pr !== undefined) p.pray = st.pr && PRAYERS[st.pr] && PRAYERS[st.pr].g === 'head' ? { [st.pr]: 1 } : {};
      if (st.act !== undefined) p.act = st.act && st.act.k === 'attack' && mobByUid(st.act.uid) ? { k: 'attack', uid: st.act.uid } : null;
    }
    function claim(pid, uid) {   /* first claim wins; the picker's own game adds the item when it hears the 'take' */
      const g = S.ground.find(q => q.uid === uid), p = S.players[pid];
      if (!g || !p || !isAuth(zoneOf(g.x, g.y)) || cheb(p.x, p.y, g.x, g.y) > 3) return false;
      S.ground.splice(S.ground.indexOf(g), 1); ev({ e: 'take', p: pid, g: g.uid, id: g.id, n: g.n, remote: 1, x: g.x, y: g.y }); return true;
    }
    function hostDrop(o) { return dropGround(o.id, o.n, o.x, o.y, null, o.life || 300, o.from ? { from: o.from, diedAt: o.diedAt || S.t } : null); }
    /* replica side: take the host's state */
    function applyMobs(list) {
      for (const r of list) {
        const m = mobByUid(r[0]); if (!m || isAuth(m.zone)) continue;
        m.x = r[1]; m.y = r[2]; m.hp = r[3];
        if (r[4] && !m.dead) { m.dead = S.t; m.tgt = 0; ev({ e: 'gone', mob: m.uid }); }   /* dead on the host (e.g. our own copy respawned it while we were away): take it off the screen, no death scene */
        else if (!r[4] && m.dead) { m.dead = 0; ev({ e: 'spawn', mob: m.uid }); }
      }
    }
    function groundAdd(uid, id, n, x, y, from) {
      if (!IT[id] || isAuth(zoneOf(x, y))) return;
      const did = uid >= BANK_UID ? uid - BANK_UID : null;   /* a persisted drop (its uid says so), even from a host too old to say */
      if (did != null && BANK_GONE.has(did)) return;         /* the Bank already told us somebody took it: an old host's copy stays gone */
      const g = S.ground.find(q => q.uid === uid); if (g) { g.n = n; return; }
      S.ground.push({ uid, id, n, x, y, owner: null, until: S.t + 1e9, from: from || null, bank: did }); ev({ e: 'drop', g: uid, id, n, x, y });
    }
    function groundRemove(uid) { if (uid >= BANK_UID) BANK_GONE.add(uid - BANK_UID); const i = S.ground.findIndex(q => q.uid === uid); if (i >= 0 && !isAuth(zoneOf(S.ground[i].x, S.ground[i].y))) { S.ground.splice(i, 1); ev({ e: 'vanish', g: uid }); } }
    /* PERSISTED DROPS (2026-10-06): what the @ashvale Bank holds on the ground (Gold, stones, magical things, anything
       worth 100+ GOLD that a player dropped), listed for a rectangle. Every game puts them down itself - the area's host may be
       an older game - each with a uid from its drop id (2^42 + n), so every game agrees on it; one already lying there (the
       fresh drop itself) is linked, not doubled. A host's ground snapshot leaves them alone, and taking one needs no host:
       the Bank's 'took' decides who has it. Those the Bank no longer lists in the rectangle (somebody took them) go. */
    const BANK_UID = 4398046511104, BANK_GONE = new Set();
    function bankGround(box, items) {
      const want = new Set();
      for (const r of items || []) {
        const did = r[0] | 0, id = String(r[1]), n = Math.max(1, r[2] | 0), x = r[3] | 0, y = r[4] | 0;
        if (!IT[id] || !inMap(x, y)) continue;   /* every game puts them down (the area's host may be an older game): same uid everywhere */
        want.add(did); const uid = BANK_UID + did;
        const g = S.ground.find(q => q.uid === uid || q.bank === did);
        if (g) { g.n = n; g.until = 1e15; continue; }
        const live = S.ground.find(q => q.bank == null && q.id === id && q.x === x && q.y === y);
        if (live) { live.bank = did; live.until = 1e15; continue; }
        S.ground.push({ uid, id, n, x, y, owner: null, until: 1e15, bank: did }); ev({ e: 'drop', g: uid, id, n, x, y, bank: 1 });
      }
      const [x0, y0, x1, y1] = box || [0, 0, -1, -1];
      for (let i = 0; i < S.ground.length;) {
        const g = S.ground[i];
        if (g.bank != null && !want.has(g.bank) && g.x >= x0 && g.x <= x1 && g.y >= y0 && g.y <= y1) { BANK_GONE.add(g.bank); S.ground.splice(i, 1); ev({ e: 'vanish', g: g.uid, x: g.x, y: g.y }); }
        else i++;
      }
      return want.size;
    }
    function groundFull(zone, list) { S.ground = S.ground.filter(g => zoneOf(g.x, g.y) !== zone || isAuth(zone) || g.bank != null);   /* the Bank's persisted drops stay: the Bank, not the host, says when they go */ for (const r of list) groundAdd(r[0], r[1], r[2], r[3], r[4], r[5]); }
    /* owner side: what the host resolved about OUR player */
    function applyHit(pid, dmg, cls, fromMob, fx, fxt) { const p = S.players[pid]; if (!p || p.puppet || p.dead) return; if (fromMob && cls && protects(p, cls)) dmg = 0; else if (fromMob && fx) magicFx(p, fx, fxt || 5); p.hp -= Math.min(dmg, p.hp); if (angelSave(p)) return; if (p.retal && !p.act && !p.path.length) { } if (p.hp <= 0) killPlayer(p); }
    function storeItem(pid, id, n) { const p = S.players[pid]; if (!p || !IT[id]) return 0; const had = invCount(p, id); removeItem(p, id, Math.min(n, had)); ev({ e: 'inv', p: pid }); return Math.min(n, had); }   /* into the town chest: it stays in the wallet, only out of the bag */
    function grantItem(pid, id, n) { const p = S.players[pid]; if (!p || !IT[id]) return; const left = addItem(p, id, n); if (left) dropGround(id, left, p.x, p.y, null, 300); ev({ e: 'take', p: pid, id, n: n - left }); }
    function addPlayer(id, save) {
      const p = newPlayer(id, save);
      /* a saved upper floor holds only if that building still has it */
      p.lv = 0; p.bld = -1;
      if (save && save.lv > 0 && M.buildingAt) { const bi = M.buildingAt(p.x, p.y); if (bi >= 0 && save.lv < M.buildings[bi].floors) { p.lv = save.lv | 0; p.bld = bi; } } S.players[id] = p; if (S.order.indexOf(id) < 0) S.order.push(id); p.spawnT = S.t;
      ev({ e: 'join', p: id }); return p;
    }
    function removePlayer(id) { delete S.players[id]; S.order = S.order.filter(q => q !== id); for (const m of S.mobs) if (m.tgt === id) { m.tgt = 0; m.back = 1; } }
    function hash() {
      let h = 2166136261 >>> 0; const mix = (v) => { h ^= v >>> 0; h = Math.imul(h, 16777619) >>> 0; };
      mix(S.t); mix(R.state); for (const z in S.weather) { mix(hashStr(S.weather[z].kind)); mix(S.weather[z].intensity); }
      for (const pid of S.order) { const p = S.players[pid]; mix(p.x); mix(p.y); mix(p.hp); mix(p.pp | 0); mix(p.lv || 0); for (const s of SK) mix(p.xp[s]); for (const it of p.inv) mix(it ? hashStr(it.id) + it.n : 7); }
      for (const m of S.mobs) { mix(m.x); mix(m.y); mix(m.hp); mix(m.dead); }
      for (const g of S.ground) { mix(g.x); mix(g.y); mix(g.n); mix(hashStr(g.id)); }
      return h >>> 0;
    }
    /* area loading: a zone arrives (the engine fetched it near a player). The map takes it (M.addZone), worldgen swaps the
       town's stub for its real inside, and its monsters appear ('mobadd'); 'zoneadd' tells the engine to draw it. */
    function addZone(z) {
      if (!z || !M.addZone || M.hasZone(z.id)) return false;
      const zz = Object.assign({ id: z.id }, z);
      if (D.wg) worldMod().arriveWorldgen(D.wg, D, zz);
      const got = M.addZone(zz); if (!got) return false;
      if (Array.isArray(D.zones) && !D.zones.some(q => q.id === zz.id)) D.zones.push(zz);
      if (!CLIMW && zz.weather && !ZW[zz.id]) { ZW[zz.id] = zz.weather; S.weather[zz.id] = { kind: 'clear', intensity: 0, until: S.t + (zz.weather.min || 300) }; }
      spawnMobs(got.spawns, true);
      ev({ e: 'zoneadd', zone: zz.id, npcs: got.npcs.map(n => n.id) });
      return true;
    }
    return {
      API, S, M, D, log, cmd, tick, addPlayer, removePlayer, exportPlayer, hash, addZone, bankGround, persists: (id, n) => !perishable(id, n), lazy: LAZY, zoneIndex: () => ZINDEX, hasZone: (id) => !!(M.hasZone && M.hasZone(id)),
      get rngState() { return R.state; },
      prayers: () => PRAY.list || [], prayer: (id) => PRAYERS[id] || null, maxPp, overhead, protects, boostOf,
      /* ticks the points last: with what is on now (null when nothing drains), or from `pts` points at `drain` per tick */
      prayTicks(p, pts, drain) { let d = drain; if (d == null) { d = 0; for (const id in p.pray || {}) d += (PRAYERS[id] && PRAYERS[id].drain) || 0; } if (!d) return null; const n = pts == null ? (p.pp | 0) : pts, rs = resist(p); return n <= 0 ? 0 : Math.ceil(((n - 1) * rs + rs + 1 - (pts == null ? (p.pd | 0) : 0)) / d); },
      isHawk, passageAt, airborne, hasFlag, flag: (k) => FLAGS[k] || null, hawkMax: () => HK.hp, slotLimit, lv, maxHp, combatLevel, mobCombat, bonuses, wclass, style, styles: (p) => STYLES[wclass(p)], maxHit, attackSpeed, attackRange, spell, invCount, lvlOf,
      xpFor: (L) => XP[Math.max(1, Math.min(99, L))], item: (id) => IT[id], node: (i) => M.nodeAt(i), nodeDef, shop: shopOf, mobByUid,
      priceBuy, priceSell, carried, capacity, burden, speechPct: (p) => speechPermille(p) / 10, START: { points: START.points || 10, max: START.maxPerSkill || 5, skills: START.skills || [] }, validStart,
      reqFail, EQ_SLOTS, idx, inReach,
      setAuth, isAuth, zoneOf, areaOf: zoneOf, regionOf: M.regionOf, uidSpace, setWeather, weatherOf: (z) => S.weather[weatherZone(z)] || null, weatherZone, wx, hostFire, fireAdd, fireOut, nodeAt, EFFECTS: Object.keys(EFFECTS),
      applyFx: (uid, kind, ticks) => { const m = mobByUid(uid); if (!m || isAuth(m.zone) || !EFFECTS[kind]) return; m.fx = m.fx || {}; m.fx[kind] = { until: S.t + ticks, dmg: 0, src: null, next: 1e12 }; ev({ e: 'fx', mob: uid, fx: kind, ticks }); }, addPuppet, setPuppet, claim, hostDrop, applyMobs, groundAdd, groundRemove, groundFull, applyHit, grantItem, storeItem, setFelled,
      hitXp: (pid, cls, dmg, dex) => { const p = S.players[pid]; if (p && !p.puppet) hitXp(p, cls, dmg, null, dex); },
      creditKill: (pid, key) => { const p = S.players[pid]; if (p && !p.puppet) creditKill(p, key); }
    };
  }

  /* replay(DATA, seed, saves, log, ticks) -> hash: what a referee runs. saves = {pid: save}, log = core.log entries. */
  function replay(D, seed, saves, cmds, ticks) {
    const c = create(D, { seed }); for (const pid in saves) c.addPlayer(pid, saves[pid]);
    let k = 0; const L = cmds.slice().sort((a, b) => a[0] - b[0]);
    for (let t = 0; t < ticks; t++) { while (k < L.length && L[k][0] <= c.S.t) { c.cmd(L[k][1], L[k][2]); k++; } c.tick(); }
    return c.hash();
  }

  const AshCore = { API, create, replay, Rng, STYLES, normItem, validItem, clampItem, fromArmoury };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('core', { api: API, v: 1, needs: { world: 1 } }, (deps) => { if (deps && deps.world) WORLD = deps.world; return AshCore; });
  if (typeof module !== 'undefined' && module.exports) module.exports = AshCore;
  root.AshCore = AshCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
