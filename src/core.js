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
      value: j.value | 0, req: j.req || {}, stack: !!j.stackable, model: j.model, nft: j.nft || null, ward: j.ward || null };
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
    /* HOMES (2026-10-08, handoff/ziibiing_start_plan.md): a character is born somewhere - Ashvale (every save before this)
       or Ziibiing (its own game card). The home sets where a new character opens its eyes, what it carries, and where it wakes */
    const HOMES = RU.homes || {}; let NEWHOME = 'ashvale';
    /* whose quest it is (2026-10-09: "we shouldn't see quests from a character made in Ashvale in our fresh character on
       Ziibiing"): a quest's `homes`, or else rules.questHomes (the town's quests carry no list of their own) */
    /* where your open quest steps want you (a step's `at` [x, y] and `mark` label, data): the engine marks them on the minimap and
       with a beacon in the world (2026-10-09: "I can't find the flint from the first quest... it needs a better marker") */
    function questMarks(p) {
      const out = [];
      for (const id in (p && p.quests) || {}) { const q = p.quests[id], Q = D.quests.quests[id], st = Q && Q.steps[q.step - 1];
        if (st && Array.isArray(st.at) && !q.hid) out.push({ x: st.at[0], y: st.at[1], label: st.mark || Q.name, q: id }); }
      return out;
    }
    const questForHome = (Q, p) => (Q.homes || RU.questHomes || ['ashvale']).indexOf((p && p.home) || 'ashvale') >= 0;
    const homeOf = p => HOMES[(p && p.home) || 'ashvale'] || null;
    const spawnOf = p => { const H = homeOf(p); return (H && H.spawn) || RESPAWN0(); };
    function wakeSpot(p) { const P = p.town && !(homeOf(p) && homeOf(p).wake === 'home') ? portalOf(p.town) : null; return P ? { at: P.to, name: P.name } : { at: spawnOf(p), name: null }; }   /* a home with wake: 'home' always wakes you there (Ziibiing: your mother's wigwam) */
    function townCheck(p) {
      if (!M.zoneAt || (S.t + String(p.id).length) % 5) return;
      if (!PORTAL_ZONE) { PORTAL_ZONE = {}; for (const P of PORTALS) { const z = LAZY ? zoneRectAt(P.x, P.y) : M.zoneAt(P.x, P.y); if (z) PORTAL_ZONE[z] = P.id; } }
      const z = M.zoneAt(p.x, p.y), id = z && PORTAL_ZONE[z]; if (id && p.town !== id) p.town = id;
    }
    const M = worldMod().createWorld(D, opts.world);
    for (const P of PORTALS) if (!M.npcs.some(n => n.id === 'portal_' + P.id))
      M.npcs.push({ id: 'portal_' + P.id, name: 'Town portal', look: 'portal', x: P.x, y: P.y, portal: P.id, examine: 'A ring of standing stones, humming softly. Step through to travel to another town.' });
    const R = Rng(opts.seed == null ? 'ashvale3d' : opts.seed);
    const S = { t: 0, uid: 1, players: {}, order: [], mobs: [], ground: [], dep: {}, fell: {}, cleared: {}, plants: {}, lit: {}, night: false, pending: [], ev: [], noAuth: {}, seen: {}, fires: [], weather: {}, salt: 0, dyn: 0, took: new Set() };
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
    const ZW = {}; for (const z of ZINDEX) if (z.weather && z.weather.kinds) ZW[z.id] = z.weather;   /* a cave's {none: true}: no weather at all */
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
    /* THE WEATHER KEEPS THE SEASON (2026-10-07: "It should only snow in the winter at the latitude that it should snow. It's
       not rain or be foggy in the winter. It should not snow where it is not winter"): the engine tells the core whether it is a
       snowy winter where the roller stands (setSeason); in one, rain and fog become snow (or clear); anywhere else snow becomes
       rain. Weather that no longer fits the season ends at once and is rolled again. */
    let SEASONW = null;
    const wrongFor = k => SEASONW && (SEASONW.snowy ? (k === 'rain' || k === 'fog') : k === 'snow');
    function setSeason(st) { SEASONW = st || null; for (const z in S.weather) { const w = S.weather[z]; if (w && wrongFor(w.kind)) w.until = S.t; } }
    function seasonKinds(K) {
      if (!SEASONW) return K;
      const o = Object.assign({}, K);
      if (SEASONW.snowy) { o.snow = (o.snow || 0) + (o.rain || 0) + (o.fog || 0); delete o.rain; delete o.fog; if (!o.snow) o.snow = 1; }
      else { o.rain = (o.rain || 0) + (o.snow || 0); delete o.snow; if (!o.rain) delete o.rain; }
      return o;
    }
    function weatherTick() {
      for (const z in ZW) {
        const w = S.weather[z]; if (!isAuth(z) || S.t < w.until) continue;
        const KK = seasonKinds(ZW[z].kinds || {}), ks = Object.keys(KK), tot = ks.reduce((a, k) => a + KK[k], 0); let r = R.int(Math.max(1, tot)), kind = ks[0] || 'clear';
        for (const k of ks) { if (r < KK[k]) { kind = k; break; } r -= KK[k]; }
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
        if (m.zone !== z || m.summon) continue;   /* a called fighter stays gone until the caller asks for them again */
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
       altar and on respawn. Bones are buried for XP. rules.prayer.list is the three overhead protections. */
    const PRAY = RU.prayer || { resist: 100, buryTicks: 2, list: [] }, PRAYERS = {};
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
      p.pd = (p.pd | 0) + d; const rs = resist(p, d);
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
      const b = { attack: 0, strength: 0, defence: 0, ranged: 0, rstr: 0, magic: 0, prayer: 0, prayerSec: 0, ppHold: 0 };
      for (const s of EQ_SLOTS) { const e = p.eq[s]; if (!e) continue; const d = IT[e.id]; for (const k in b) b[k] += d[k] || 0; }
      return b;
    }
    /* one protection (drain 12) spends a point every 5 s. Prayer bonus from gear still lengthens that (OSRS: +2 resist
       per bonus). Prayer seconds (the Monk's robe) add a full second per point on top, at whatever drain is running. */
    function resist(p, drain) {
      const b = bonuses(p), d = drain || 12;
      return PRAY.resist + 2 * Math.max(0, b.prayer) + (Math.max(0, b.prayerSec) + Math.max(0, b.ppHold) * Math.max(0, p.pp | 0)) * d / 0.6;
    }
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
      const home = (save && typeof save.home === 'string' && HOMES[save.home]) ? save.home : (save ? 'ashvale' : NEWHOME), R0 = spawnOf({ home }), p = { id, home, name: 'Adventurer', kind: 'p', x: R0[0], y: R0[1], path: [], act: null, hp: 10, xp: {}, inv: new Array(28).fill(null), eq: {},
        styles: { melee: 0, ranged: 0, magic: 0 }, look: null, run: true, energy: 10000, retal: true, atk: 0, dead: 0, face: 2, quests: {}, kills: {}, skilling: null, gT: 0, shop: null, moved: 0, spawnT: 0, using: null };
      for (const s of SK) p.xp[s] = 0;
      p.xp.hitpoints = XP[RU.start.hitpoints] * 10;
      for (const [id2, n] of ((homeOf(p) || {}).inv || RU.start.inv)) addItem(p, id2, n);
      if (save) importInto(p, save);
      if (save) placeFrom(p, save);
      p.hp = Math.min(p.hp, maxHp(p)); if (!(p.hp > 0)) p.hp = maxHp(p);   /* also a save that kept NaN (stored as null) */
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
      if (s.orders && typeof s.orders === 'object') p.orders = JSON.parse(JSON.stringify(s.orders));   /* what the people are making for you (a canoe takes two days) */
      if (Array.isArray(s.bless)) p.bless = s.bless.filter(b => b && Number.isInteger(b.x) && Number.isInteger(b.y)).slice(-12).map(b => ({ x: b.x, y: b.y, day: b.day | 0, r: Math.min(30, b.r | 0) }));
      if (Array.isArray(s.traps)) p.traps = s.traps.filter(t => t && IT[t.id] && trapOf(IT[t.id]) && Number.isInteger(t.x) && Number.isInteger(t.y)).slice(0, 8).map(t => ({ id: t.id, x: t.x, y: t.y, prey: String(t.prey || ''), ready: +t.ready || 0 }));
      if (typeof s.town === 'string') p.town = s.town;
      if (s.hawkHp != null) p.hawkHp = s.hawkHp | 0;
      if (s.cd) { p.cd = {}; for (const k in s.cd) p.cd[k] = S.t + (s.cd[k] | 0); }   /* cooldowns are saved as ticks left */
      if (s.kills && typeof s.kills === 'object') { p.kills = {}; for (const k in s.kills) if (/^[a-z_]{1,32}$/.test(k) && (s.kills[k] | 0) > 0) p.kills[k] = s.kills[k] | 0; }
      if (Number.isInteger(s.hp)) p.hp = s.hp;
      if (Number.isInteger(s.energy)) p.energy = Math.max(0, Math.min(10000, s.energy));
    }
    /* the look (outfit) is cosmetic: never part of the rules or the replay hash, only checked for shape and size */
    const LOOK_KEYS = ['body', 'skin', 'hair', 'hairColor', 'beard', 'eyes', 'hat', 'shirt', 'pants', 'boots', 'feet', 'gloves', 'belt', 'cape', 'apron'];   /* feet: the cut of the boots (moccasins) */
    function cleanVal(v) { return v == null ? null : typeof v === 'string' && /^[#\w -]{0,24}$/.test(v) ? v : undefined; }
    function cleanLook(l) {
      if (!l || typeof l !== 'object') return null; const o = {};
      for (const k of LOOK_KEYS) { if (!(k in l)) continue; const v = l[k];
        if (k === 'body') { if (v === 'male' || v === 'female') o.body = v; continue; }   /* the operator: male or female */
        if (k === 'hat' || k === 'cape') continue;   /* hats and capes are worn items from Wren's shop, not a free look */
        if (v && typeof v === 'object') { let st = cleanVal(v.style), co = cleanVal(v.color); if ((k === 'shirt' || k === 'pants') && st === 'robe') st = k === 'shirt' ? 'tunic' : 'trousers'; if (st !== undefined && co !== undefined) o[k] = { style: st, color: co }; }
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
    /* THE UNDERGROUND MOVED (2026-10-08): when the globe opened, the Spider Cave and the wigwam rooms of Ziibiing left their old spots
       (now open sea) for the empty space of the flat net. A position saved inside an old spot is carried along. */
    const UNDER_MOVES = [[-200, 16100, -80, 16184, 24200, 7900], [40, 16300, 253, 16313, 23960, 8100]];
    function underMove(x, y) { for (const r of UNDER_MOVES) if (x >= r[0] && x < r[2] && y >= r[1] && y < r[3]) return [x + r[4], y + r[5]]; return [x, y]; }
    function placeFrom(p, s) {
      let xy = null;
      if ((s.v | 0) >= 2 && Array.isArray(s.pos) && s.pos.length === 3) xy = M.fromFace(s.pos[0] | 0, s.pos[1] | 0, s.pos[2] | 0);
      else if ((s.v | 0) <= 1 && Number.isInteger(s.x) && Number.isInteger(s.y)) xy = [s.x, s.y];
      if (xy) xy = underMove(xy[0], xy[1]);   /* saved inside the Spider Cave or a wigwam before they moved */
      if (!xy || !inMap(xy[0], xy[1])) return;   /* outside the world: the spawn */
      /* in your canoe when you left (2026-10-07: "if you're in a canoe that needs to save ... so when you reload the game, you're not on
         the shore without your canoe"): you come back sitting in it, on the water where you were */
      if (s.boat === 1 && !isHawk(p) && isWet(xy[0], xy[1])) { p.x = xy[0]; p.y = xy[1]; p.boat = 1; p.face = s.face | 0; ev({ e: 'boat', p: p.id, on: 1 }); return; }
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
      return JSON.parse(JSON.stringify({ v: 2, pos: M.toFace(at[0], at[1]), home: p.home && p.home !== 'ashvale' ? p.home : undefined, name: p.name, look: p.look, start: p.start || null, xp: p.xp, inv: p.inv, eq: p.eq, styles: p.styles, run: p.run, retal: p.retal, quests: p.quests, hp: p.hp, energy: p.energy, pp: p.pp | 0, lv: p.lv || 0, gifts: p.gifts || {}, flags: p.flags || {}, attuned: p.attuned || {}, orders: p.orders || {}, traps: p.traps || [], bless: p.bless || [], town: p.town || null, boat: p.boat === 1 && !p.dead ? 1 : 0, face: p.face | 0, hawkHp: p.hawkHp == null ? null : p.hawkHp, kills: p.kills || {}, cd: Object.fromEntries(Object.entries(p.cd || {}).map(([k, u]) => [k, Math.max(0, u - S.t)]).filter(e => e[1] > 0)) }));
    }

    // ---------------- pathfinding: BFS over the tile grid, 8 directions, no corner cutting (RuneScape-style)
    function edgeOpen(x, y, dx, dy) {   /* orthogonal step: no wall on this tile's side or the neighbour's facing side */
      const b = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : 1, ob = dx === 1 ? 8 : dx === -1 ? 2 : dy === 1 ? 1 : 4;
      return !(M.wallAt(x, y) & b) && !(M.wallAt(x + dx, y + dy) & ob);
    }
    function stepClear(x, y, dx, dy) {   /* walls and corner-cutting only (the target tile itself may be occupied) */
      const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) return false;
      if (!dx || !dy) return edgeOpen(x, y, dx, dy);
      if ((M.blocked(x + dx, y) && !gateOpen(x + dx, y)) || (M.blocked(x, y + dy) && !gateOpen(x, y + dy))) return false;
      return edgeOpen(x, y, dx, 0) && edgeOpen(x + dx, y, 0, dy) && edgeOpen(x, y, 0, dy) && edgeOpen(x, y + dy, dx, 0);
    }
    let LV_LIMIT = -1;
    const LIFT_STEP = 2.3;   /* the most you can step up or down between two tiles of raised ground (stairs are 0.6 m a tile) */   /* while a player on an upper floor moves, the building they are in (they cannot step out of it) */
    const NOFLY = (RU.tiles && RU.tiles.noFly) || '';
    let FLY = false;   /* while a hawk moves: every step is open (the operator's hawk ring) */
    /* THE CANOE (2026-10-07, Ziibiing): while you sit in one, only water is open - rivers, lakes, the shallows, under a
       bridge - and never across a corner of land */
    let BOAT = false;
    let GATE_P = null;   /* while a player paths: an open gate (need flag met) is walkable even though its tile is F */
    const isWet = (x, y) => { const t = M.tileAt(x, y); return (t === '~' || t === 'v' || t === 'B') && !(M.iceAt && M.iceAt(x, y)); };   /* a frozen lake is no water for a canoe */
    /* the hawk (2026-10-04): its own stats. hp 4; a strike every `strike` ticks with a hitPct % chance of hitDmg; a
       strike costs `energy` run energy (Dexterity) and leaves it open to a hit for those ticks; a third of the carrying
       capacity and `slots` bag slots; overburdened it lands and walks one step every groundEvery ticks */
    const HK = Object.assign({ hp: 4, slots: 9, carry: 0.34, strike: 3, exposed: 1, hitPct: 25, hitDmg: 4, energy: 250, groundEvery: 4, regenEvery: 50 }, RU.hawk || {});   /* exposed: ticks it is down within reach */
    const slotLimit = (p) => isHawk(p) ? Math.min(HK.slots, p.inv.length) : p.inv.length;
    const airborne = (p) => isHawk(p) && !(p.burden > 0) && !(p.striking > S.t);   /* in the air: no land animal can touch it */
    const shooter = (m, md) => !!(md.cast || (m.carry && Object.keys(m.carry).some(k => /^arrows_/.test(k) && m.carry[k] > 0)));   /* can reach a hawk in the sky */
    const isHawk = (p) => !!(p && p.eq && p.eq.ring && IT[p.eq.ring.id] && IT[p.eq.ring.id].form === 'hawk');
    function gateOpen(x, y) {
      if (!GATE_P) return false;
      const o = passageAt(x, y); if (!o || o.k !== 'gate') return false;
      return !o.need || hasFlag(GATE_P, o.need);
    }
    function canStep(x, y, dx, dy) {
      const nx = x + dx, ny = y + dy;
      if (FLY) return inMap(nx, ny) && (!NOFLY || NOFLY.indexOf(M.tileAt(nx, ny)) < 0);   /* a hawk flies over trees, walls and water - but not the old woods' wall (rules.tiles.noFly, 2026-10-09: a hawk crossed it to a lake inside and died there) */
      if (BOAT) return inMap(nx, ny) && isWet(nx, ny) && (!dx || !dy || (isWet(x + dx, y) && isWet(x, y + dy)));
      if (M.lifts && LV_LIMIT < 0) {   /* raised ground (a castle's stairs and wall walk): heights decide, not the wall tiles */
        const la = M.liftAt(x, y), lb = M.liftAt(nx, ny);
        if (la || lb) {
          const ok1 = (ax, ay) => { const l = M.liftAt(ax, ay); return Math.abs(l - la) <= LIFT_STEP && (l > 0 || (inMap(ax, ay) && !M.blocked(ax, ay)) || gateOpen(ax, ay)); };
          if (!inMap(nx, ny) || !ok1(nx, ny)) return false;
          return !dx || !dy || (ok1(x + dx, y) && ok1(x, y + dy));
        }
      }
      if (!inMap(nx, ny) || (M.blocked(nx, ny) && !gateOpen(nx, ny))) return false;
      if (LV_LIMIT >= 0 && M.buildingAt(nx, ny) !== LV_LIMIT) return false;
      return stepClear(x, y, dx, dy);
    }
    /* goal(x,y) -> true when standing there satisfies the action. If nothing satisfies it, walk to the reachable tile
       closest to (ax,ay) (what RuneScape does when you click a blocked tile). */
    /* BFS in a window around the start (the map has no edge any more): (2L+5)^2 cells for a depth limit L, buffers kept
       and stamped per search, so a search costs what it visits. Same order and ties as the old whole-map BFS. */
    let PB = null, PGEN = 0;
    /* A CANOE KEEPS TO THE RIVER (2026-10-07: "When I'm traveling in the canoe and I click down the river, it tries to go diagonal
       to the shore. It should just travel down the river"): its own search, by cost - water beside the bank costs more, so the
       way runs down the middle of the river and comes in to the bank only at the end; a diagonal costs its length. */
    function boatPath(sx, sy, goal, ax, ay, limit) {
      const L = limit || 400, near = new Map(), shoreCost = (x, y) => { const k = x * 65536 + y; let c = near.get(k); if (c != null) return c; c = 0;
        for (let r = 1; r <= 2 && !c; r++) for (let dy = -r; dy <= r && !c; dy++) for (let dx = -r; dx <= r; dx++) if (!isWet(x + dx, y + dy)) { c = r === 1 ? 2.5 : 0.8; break; }
        near.set(k, c); return c; };
      const key = (x, y) => (x + 32768) * 65536 + (y + 32768), dist = new Map(), prev = new Map(), H = [];   /* binary heap of [cost, x, y] */
      const push = (c, x, y) => { H.push([c, x, y]); let i = H.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (H[j][0] <= H[i][0]) break; [H[i], H[j]] = [H[j], H[i]]; i = j; } };
      const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[i], H[m]] = [H[m], H[i]]; i = m; } } return top; };
      dist.set(key(sx, sy), 0); push(0, sx, sy); let found = null, best = null, bestD = 1e18, n = 0;
      while (H.length && n++ < 30000) {
        const [c, x, y] = pop(), k = key(x, y); if (c > dist.get(k)) continue;
        if ((x !== sx || y !== sy) && goal(x, y)) { found = k; break; }
        if (ax != null) { const d = (x - ax) * (x - ax) + (y - ay) * (y - ay); if (d < bestD) { bestD = d; best = k; } }
        if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) >= L) continue;
        for (let q = 0; q < 8; q++) {
          const dx = DIRS[q][0], dy = DIRS[q][1]; if (!canStep(x, y, dx, dy)) continue;
          const nx = x + dx, ny = y + dy, nk = key(nx, ny), nc = c + (dx && dy ? 1.42 : 1) + shoreCost(nx, ny) + (prev.has(k) && prev.get(k)[2] !== q ? 0.15 : 0);   /* a small cost to change course: straight runs, not a zigzag */
          if (nc < (dist.has(nk) ? dist.get(nk) : 1e18)) { dist.set(nk, nc); prev.set(nk, [x, y, q]); push(nc, nx, ny); }
        }
      }
      let end = found != null ? found : best; if (end == null || end === key(sx, sy)) return [];
      const path = []; while (end !== key(sx, sy)) { const pv = prev.get(end); const ex = Math.floor(end / 65536) - 32768, ey = (end % 65536) - 32768; path.push(idx(ex, ey)); end = key(pv[0], pv[1]); }
      return path.reverse();
    }
    function findPath(sx, sy, goal, ax, ay, limit) {
      if (goal(sx, sy)) return [];
      if (BOAT && !FLY) return boatPath(sx, sy, goal, ax, ay, Math.min(limit || 400, 400));
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
      return straightPath(sx, sy, path.reverse());
    }
    /* WALK STRAIGHT (2026-10-08: "fix the character movement so the character doesn't jog back-and-forth so much"): the search
       finds a shortest way, but among the many equally short ones it takes the first, which bunches its diagonal steps and turns
       at every chance. The way is redrawn as straight lines wherever every step of the line can be taken, the diagonals spread
       evenly along each line - never longer than before, and only through tiles a step may enter anyway. */
    function lineSteps(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, n = Math.max(Math.abs(dx), Math.abs(dy)), out = [];
      for (let k = 1; k <= n; k++) out.push([ax + Math.round(dx * k / n), ay + Math.round(dy * k / n)]);
      return out;
    }
    function lineOk(ax, ay, steps) { let px = ax, py = ay; for (const [x, y] of steps) { if (!canStep(px, py, x - px, y - py)) return false; px = x; py = y; } return true; }
    function straightPath(sx, sy, path) {
      if (path.length < 3) return path;
      const pts = [[sx, sy]].concat(path.map(k => [kx(k), ky(k)])), out = [];
      let i = 0;
      while (i < pts.length - 1) {
        let j = Math.min(pts.length - 1, i + 48), seg = null;
        for (; j > i + 1; j--) { const st = lineSteps(pts[i][0], pts[i][1], pts[j][0], pts[j][1]); if (st.length <= j - i && lineOk(pts[i][0], pts[i][1], st)) { seg = st; break; } }
        if (!seg) { seg = [pts[i + 1]]; j = i + 1; }
        for (const [x, y] of seg) out.push(idx(x, y));
        i = j;
      }
      return out.length <= path.length ? out : path;
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
      const sunk = extra && extra.sunk || 0;
      const g = S.ground.find(q => q.x === x && q.y === y && q.id === id && IT[id].stack && (q.sunk || 0) === sunk);
      const keep = sunk || !perishable(id, g ? g.n + n : n);   /* what lies at the bottom of a lake stays there until it is fished up */   /* gear, tools and Gold (rules.persist) and every magical item lie where they fell until someone takes them; the rest despawns (2026-10-04) */
      if (g) { g.n += n; g.until = keep ? 1e15 : S.t + (life || 300); ev({ e: 'ground', g: g.uid, n: g.n, x, y }); return g; }
      const ng = { uid: nuid(), id, n, x, y, owner: owner || null, until: keep ? 1e15 : S.t + (life || 300) };
      if (extra) Object.assign(ng, extra);
      S.ground.push(ng); ev({ e: 'drop', g: ng.uid, id, n, x, y, from: ng.from || null, owner: owner || null, sunk: ng.sunk || 0 }); return ng;   /* owner: who let it fall (the chest's exact-NFT drops) */
    }

    // ---------------- commands
    function cmd(pid, c) { if (!c || typeof c.c !== 'string') return; queue.push([pid, c]); log.push([S.t, pid, c]); }
    function apply(p, c) { LV_LIMIT = p.lv > 0 && M.buildingAt ? p.bld : -1; FLY = isHawk(p) && !(p.burden > 0); BOAT = !!p.boat && !FLY; GATE_P = p; try { apply0(p, c); } finally { LV_LIMIT = -1; FLY = false; BOAT = false; GATE_P = null; } }
    function apply0(p, c) {
      if (p.dead && c.c !== 'style' && c.c !== 'run' && c.c !== 'retal' && c.c !== 'look') return;
      if (isHawk(p) && ['npc', 'light', 'climb', 'buy', 'sell', 'trade', 'eat', 'use'].indexOf(c.c) >= 0 && !(c.c === 'use' && p.inv[c.slot | 0] && IT[p.inv[c.slot | 0].id].teleport)) { msg(p, 'A hawk can only fly, strike, fish and carry. Take off the ring over open ground to land.', 'warn'); return; }
      if (isHawk(p) && c.c === 'gather') { const n = nodeAt(idx(c.x | 0, c.y | 0)); if (n && nodeDef(n).skill !== 'fishing') { msg(p, 'A hawk catches fish; it cannot chop or mine.', 'warn'); return; } }
      if (c.c !== 'perch') p.perch = null;
      if (c.c === 'walk' || c.c === 'attack' || c.c === 'take' || c.c === 'npc' || c.c === 'gather') { p.runNow = !!c.run; p._spread = 0; }   /* the operator: click = walk, double-click = run */
      switch (c.c) {
        case 'walk': if (inMap(c.x | 0, c.y | 0)) {
          p.act = null; p.skilling = null; closeShop(p);
          const tx = c.x | 0, ty = c.y | 0;
          if (p.boat === 2) {   /* riding: your partner steers; pointing at the shore beside the canoe gets you out */
            if (!isWet(tx, ty) && cheb(p.x, p.y, tx, ty) <= 2 && !M.blocked(tx, ty)) { leaveRide(p, [tx, ty]); break; }
            msg(p, p.knock ? "Your partner steers the jiimaan (canoe) with the gaandakii'iganaak (push pole). You knock the manoomin (wild rice) as you pass it - or point at the shore beside you to get out." : 'Your partner steers the jiimaan (canoe). Point at the shore beside you to get out.', 'info'); break;
          }
          /* in a canoe: water - paddle there; land - paddle to the water nearest it, step out, walk on to it (2026-10-07) */
          p.land = p.boat && !isWet(tx, ty) ? [tx, ty] : null;
          p.path = findPath(p.x, p.y, (x, y) => x === tx && y === ty, tx, ty, p.boat ? 400 : undefined);
          if (p.land && !p.path.length) disembark(p);
        } break;
        case 'ride': {   /* climb into a friend's canoe to knock rice (2026-10-07: "two people in the canoe, one with a push pole and one with a set of rice knockers") */
          const t = S.players[c.pid];
          if (!t || t === p || t.boat !== 1 || t.dead || p.boat || isHawk(p)) { msg(p, "There's no canoe to climb into there.", 'warn'); break; }
          if (Object.values(S.players).some(q => q !== p && q.boat === 2 && q.ride === c.pid)) { msg(p, 'That canoe already has two in it.', 'warn'); break; }
          p.act = { k: 'ride', pid: c.pid }; p.skilling = null; closeShop(p); break;
        }
        case 'board': {   /* get into a canoe at the landing */
          const o = M.objects.find(q => q.k === 'canoe' && q.x === (c.x | 0) && q.y === (c.y | 0)) || BOATS.get((c.x | 0) + ',' + (c.y | 0));
          if (o && !p.dead && !p.boat && !isHawk(p) && p.lv === 0) { p.act = { k: 'board', x: o.x, y: o.y }; p.skilling = null; closeShop(p); }
          break;
        }
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
        case 'attack': {
          if (p.lv > 0) { msg(p, "You can't reach that from up here.", 'warn'); break; }
          if (c.id) { const n = M.npcs.find(q => q.id === c.id); if (n && n.watch && !n.down) { p.act = { k: 'attackn', id: n.id }; p.skilling = null; p._stall = 0; closeShop(p); } break; }
          const m = mobByUid(c.uid); if (m && !m.dead) { if (coverBlocks(p, m)) { msg(p, 'You dare not strike. One blow here would unmask you both.', 'warn'); break; } p.act = { k: 'attack', uid: m.uid }; p.skilling = null; p._stall = 0; closeShop(p); } break;
        }
        case 'escape': {
          const n = M.npcs.find(q => q.id === c.id);
          if (!n || !n.escape || p.dead) break;
          if (!inReach(p.x, p.y, n.x, n.y, 2)) break;
          if (!searchOpen(p, n)) { msg(p, 'We should probably leave him alone.'); break; }
          teleport(p, { to: n.escape, id: 'caveexit' }, n.escapeSay || 'You climb back up into the daylight.');
          break;
        }
        case 'take': { const g = S.ground.find(q => q.uid === c.uid); if (g) { p.act = { k: 'take', uid: g.uid }; p.skilling = null; closeShop(p); } break; }
        case 'enter': { const o = passageAt(c.x, c.y); if (o && !p.dead) { p.act = { k: 'enter', x: o.x, y: o.y }; p.skilling = null; closeShop(p); } break; }   /* a cave mouth, a way out */
        case 'crate': { const o = crateAt(c.x | 0, c.y | 0); if (o && !p.dead) { p.act = { k: 'crate', x: o.x, y: o.y }; p.skilling = null; closeShop(p); } break; }
        case 'npc': { const n = M.npcs.find(q => q.id === c.id); if (n) { p._trade = !!c.trade; p.act = { k: 'npc', id: n.id }; p.skilling = null; closeShop(p); } break; }
        case 'acceptq': {   /* yes on a starting dialogue, or yes when Vael asks before calling the three again */
          const qid = String(c.q || ''), Q = D.quests.quests[qid];
          if (!Q || !prereqDone(Q, p)) { msg(p, 'That is not yours to begin.', 'warn'); break; }
          const bout = (Q.steps || []).find(s => s.summon);
          if (c.recall) {
            if (!bout || !p.quests[qid]) { msg(p, 'Begin it before you ask for them again.', 'warn'); break; }
            p.summonBye = 0;
            summonFor(p, p.quests[qid], bout, { replay: !!c.replay || p.quests[qid].step > Q.steps.length });
            break;
          }
          if (p.quests[qid]) break;
          if (Q.ask && !askHas(p, Q.ask)) { msg(p, Q.askLack || 'Bring what you need to ask with, then ask again.', 'warn'); break; }   /* an elder is asked with asemaa (tobacco) */
          if (Q.ask) askTake(p, Q.ask);
          const q = p.quests[qid] = { step: 1, n: 0 };
          ev({ e: 'quest', p: p.id, q: qid, step: 1 }); addXp(p, 'speechcraft', SPEECH.xpQuestTalk || 250);
          openStep(p, q, Q.steps[0]);
          if (Q.steps[0] && Q.steps[0].summon) summonFor(p, q, Q.steps[0], {});
          msg(p, Q.name + ': you take it on.', 'quest');
          break;
        }
        case 'move': moveSlot(p, c.from | 0, c.to | 0); break;
        case 'light': { const s0 = p.inv[c.slot | 0]; if (s0 && IT[s0.id].burnTicks) { p.act = { k: 'light', slot: c.slot | 0, id: s0.id }; p.gT = 0; p.path = []; p.skilling = null; closeShop(p); } break; }
        case 'gather': { const n = nodeAt(idx(c.x | 0, c.y | 0)); if (n) { p.act = { k: 'gather', i: idx(n.x, n.y), peel: c.peel ? 1 : 0, tap: c.tap ? 1 : 0 }; p.skilling = null; closeShop(p); p.gT = 0; } clearUsing(p); break; }
        case 'plant': p.act = { k: 'plant', x: c.x | 0, y: c.y | 0 }; p.skilling = null; p.path = []; closeShop(p); clearUsing(p); break;
        case 'unplant': p.act = { k: 'unplant', x: c.x | 0, y: c.y | 0 }; p.skilling = null; p.path = []; closeShop(p); clearUsing(p); break;
        case 'unuse': if (p.using) { p.using = null; ev({ e: 'using', p: p.id }); } break;
        case 'takeaxe': {
          const job = plantJob(p), id = job && job.st.axe;
          if (!id || !IT[id]) { msg(p, 'Vael is not offering an axe.'); break; }
          if (hasWoodTool(p)) { msg(p, 'You already have an axe.'); break; }
          if (addItem(p, id, 1)) { msg(p, 'Your bag is full.'); break; }
          msg(p, 'Vael gives you a bronze hatchet.'); ev({ e: 'inv', p: p.id }); break;
        }
        case 'offer': {
          const x = c.x | 0, y = c.y | 0, n = nodeAt(idx(x, y));
          if (!n || n.kind !== 'altar' || n.chapel !== 'ancient') { msg(p, 'There is no altar here.'); break; }
          if (!inReach(p.x, p.y, x, y, 1)) { msg(p, "I can't reach that!", 'warn'); break; }
          if (!questFinished(p, 'even_grove')) { msg(p, 'The altar will not trade until the grove is planted.', 'warn'); break; }
          if (invCount(p, 'logs') < 1 || invCount(p, 'bones') < 1) { msg(p, 'The altar wants one log and some bones.', 'warn'); break; }
          removeItem(p, 'logs', 1); removeItem(p, 'bones', 1);
          if (addItem(p, 'sapling', 1)) dropGround('sapling', 1, p.x, p.y, p.id, 600);
          addXp(p, 'prayer', 150);
          msg(p, 'The altar takes the log and the bones. You receive a sapling.', 'quest');
          msg(p, 'You gain 15 Prayer XP.', 'quest');
          ev({ e: 'inv', p: p.id });
          break;
        }
        case 'useon': {
          const u = p.using, it = u && p.inv[u.slot];
          if (!u || !it || it.id !== u.id) { clearUsing(p); break; }
          const d = IT[it.id];
          if (it.id === 'sapling') { p.act = { k: 'plant', x: c.x | 0, y: c.y | 0 }; p.skilling = null; p.path = []; closeShop(p); clearUsing(p); break; }
          if (d.tool) { msg(p, 'Use it on a ' + (d.tool === 'woodcutting' ? 'tree' : d.tool === 'mining' ? 'rock' : 'fishing spot') + '.'); clearUsing(p); break; }
          msg(p, 'Nothing interesting happens.'); clearUsing(p); break;
        }
        case 'use': useItem(p, c.slot | 0); break;
        case 'craft': { const n = M.npcs.find(q => q.id === c.npc), L = n && (Array.isArray(n.craft) ? n.craft : n.craft ? [n.craft] : []), k = L && L[c.i | 0];
          if (k && !p.dead && cheb(p.x, p.y, n.x, n.y) <= 3 && (!k.after || questFinished(p, k.after))) orderCraft(p, n, k); break; }
        case 'trap': { const t = (p.traps || []).find(q => q.x === (c.x | 0) && q.y === (c.y | 0)); if (t && !p.dead) { p.act = { k: 'trap', x: t.x, y: t.y, up: c.up ? 1 : 0 }; p.skilling = null; closeShop(p); } break; }
        case 'arms': { const has = p.inv.concat(Object.values(p.eq || {})).some(s => s && IT[s.id] && IT[s.id].arms); if (!has) { msg(p, 'You need the Lake Castle stone to call the guard.', 'warn'); break; } callToArms(p, !!c.on); break; }
        case 'equip': equip(p, c.slot | 0); break;
        case 'unequip': unequip(p, c.eq); break;
        case 'eat': eat(p, c.slot | 0); break;
        case 'portal': { const P = portalOf(c.to), here = M.npcs.find(n => n.portal && cheb(p.x, p.y, n.x, n.y) <= 2); if (P && here && here.portal !== P.id && !p.dead && p.attuned && p.attuned[P.id] && p.attuned[here.portal]) teleport(p, P, 'You step through the portal to ' + P.name + '.'); break; }
        case 'perch': {   /* a hawk perches in a tree, on the side you tapped */
          if (!airborne(p)) break; const n = nodeAt(idx(c.x | 0, c.y | 0)); if (!n || nodeDef(n).skill !== 'woodcutting') break;
          p.path = findPath(p.x, p.y, (x, y) => x === n.x && y === n.y, n.x, n.y, 80); p.act = null; p.skilling = null;
          p.perch = { x: n.x, y: n.y, sx: Math.sign(c.sx | 0), sy: Math.sign(c.sy | 0) }; ev({ e: 'perch', p: p.id, x: n.x, y: n.y }); break; }
        case 'drop': { const s = p.inv[c.slot | 0]; if (s && IT[s.id] && IT[s.id].bound) { msg(p, IT[s.id].name + ' was made for you. You keep it.', 'warn'); break; } if (s) { p.inv[c.slot | 0] = null; dropGround(s.id, s.n, p.x, p.y, p.id, 300); ev({ e: 'inv', p: p.id }); } break; }
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

    function clearUsing(p) { if (!p.using) return; p.using = null; ev({ e: 'using', p: p.id }); }
    function useItem(p, slot) {
      const s = p.inv[slot]; if (!s) return; const d = IT[s.id];
      if (d.buryXp) { bury(p, slot); return; }
      if (trapOf(d)) { setTrap(p, slot); return; }
      if (offerOf(d)) { offerTobacco(p, slot); return; }
      /* rings wear on click (their teleport is a trigger, e.g. the Ring of Angels). Charms and stones with a Teleport
         trait Use to travel; Wear still equips a charm that also has an eq slot (Vorth's rosary in the shield hand). */
      if (d.eq && (d.eq === 'ring' || d.teleport == null)) { equip(p, slot); return; }
      if (d.teleport) {   /* a town stone: home, as often as you like, once its cooldown has passed (30 minutes) */
        if (d.teleFrom) {   /* "questId:step" — beads stay cold until that quest step (or the quest is finished) */
          const parts = String(d.teleFrom).split(':'), qid = parts[0], need = Math.max(1, parts[1] | 0);
          const q = p.quests && p.quests[qid];
          if (!(questFinished(p, qid) || (q && q.step >= need))) {
            msg(p, 'The beads are cold. They will not carry you until Mother Wenna has sent you for them.', 'warn');
            return;
          }
        }
        const P = portalOf(d.teleport); if (!P) { msg(p, 'Nothing happens.'); return; }
        p.cd = p.cd || {}; const left = (p.cd[s.id] || 0) - S.t;
        if (left > 0) { msg(p, 'The stone is still cold. It wakes again in ' + Math.ceil(left * 0.6 / 60) + ' minute' + (Math.ceil(left * 0.6 / 60) === 1 ? '' : 's') + '.', 'warn'); return; }
        p.cd[s.id] = S.t + (d.cooldown || 0); teleport(p, P, 'The stone warms in your hand, and ' + P.name + ' rises around you.'); return;
      }
      if (d.eq) { equip(p, slot); return; }
      if (d.edible) { eat(p, slot); return; }
      if (d.burnTicks) { p.act = { k: 'light', slot, id: s.id }; p.gT = 0; p.path = []; p.skilling = null; return; }   /* tap logs = light them (needs a tinderbox) */
      if (p.using && p.using.slot === slot && p.using.id === s.id) {
        p.using = null; msg(p, 'You put the ' + d.name.toLowerCase() + ' away.'); ev({ e: 'using', p: p.id }); return;
      }
      p.using = { slot, id: s.id }; ev({ e: 'using', p: p.id });
      if (s.id === 'sapling') msg(p, 'The sapling is outlined. Click grass to plant it. You can pick it up for one hour; after that, grass grows a tree that stays. Not on a path, not inside a town, and not within ten tiles of a person or an entrance.');
      else if (d.tool) msg(p, 'The ' + d.name.toLowerCase() + ' is outlined. Click a ' + (d.tool === 'woodcutting' ? 'tree' : d.tool === 'mining' ? 'rock' : 'fishing spot') + ' to use it.');
      else msg(p, 'The ' + d.name.toLowerCase() + ' is outlined. Click what you want to use it on.');
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
      p.x = P.to[0]; p.y = P.to[1]; p.path = []; p.act = null; p.skilling = null; p.lv = 0; p.bld = -1; closeShop(p); if (p.boat === 1) landBoat(ox, oy, p.face, p.id); if (p.boat) { p.boat = 0; p.land = null; p.ride = null; ev({ e: 'boat', p: p.id, on: 0 }); }
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
    function takeOff(p, k) {   /* into the chest, not the bag: the piece leaves what you wear */
      const e = p.eq[k]; if (!e) return null;
      if (IT[e.id] && IT[e.id].form === 'hawk' && (M.blocked(p.x, p.y) || M.insideAt(p.x, p.y))) { msg(p, 'Fly to open ground first: there is nowhere to land here.', 'warn'); return null; }
      delete p.eq[k]; ev({ e: 'equip', p: p.id }); burdenCheck(p); return { id: e.id, n: e.n };
    }
    function unequip(p, k) {
      const e = p.eq[k]; if (!e) return;
      if (!canAdd(p, e.id, 1)) { msg(p, 'Not enough space in your inventory.', 'warn'); return; }
      if (IT[e.id] && IT[e.id].form === 'hawk' && (M.blocked(p.x, p.y) || M.insideAt(p.x, p.y))) { msg(p, 'Fly to open ground first: there is nowhere to land here.', 'warn'); return; }
      delete p.eq[k]; addItem(p, e.id, e.n); ev({ e: 'equip', p: p.id }); burdenCheck(p);
    }
    function eat(p, slot) {
      const s = p.inv[slot]; if (!s) return; const d = IT[s.id]; if (!d.edible) return;
      const mx = maxHp(p), heal = d.healPct ? Math.floor(mx * d.healPct / 100) : (d.heal | 0);   /* an antidote heals nothing: 0, never undefined (it made hitpoints NaN, 2026-10-07) */
      removeItem(p, s.id, 1);
      const before = p.hp; p.hp = Math.min(mx, p.hp + heal);
      const beforeP = p.pp | 0;
      if (d.prayPct) { const gain = Math.floor(maxPp(p) * d.prayPct / 100), cap = Math.max(maxPp(p), beforeP); p.pp = Math.min(cap, beforeP + gain); }
      if (d.energy) p.energy = Math.min(10000, (p.energy || 0) + d.energy);   /* maple candy: a run's worth of energy */
      p.atk = Math.max(p.atk, 0) + 3;
      msg(p, (d.drink ? 'You drink the ' : 'You eat the ') + d.name.toLowerCase() + '.' + (p.hp > before ? ' It heals some health.' : '') + ((p.pp | 0) > beforeP ? ' It restores some Prayer.' : ''));
      ev({ e: 'eat', p: p.id, id: s.id, heal: p.hp - before });
      if (d.cures === 'poison') {
        p.cd = p.cd || {}; p.cd.antidote = S.t + ANTIDOTE_TICKS;   /* three minutes, saved with the other cooldowns */
        if (p.poison) curePoison(p, 'The antidote burns going down. The poison is gone, and it will not take for three minutes.');
        else msg(p, 'The antidote will keep poison off you for three minutes.', 'info');
      } else if (p.poison) curePoison(p, 'That settles your stomach. The poison fades.');
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
      if (!shopBuys(sh, d) || d.bound) { msg(p, d.bound ? d.name + ' was made for you. It is not for sale.' : "The shopkeeper isn't interested in that.", 'warn'); return; }
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
      if (coverBlocks(p, m)) { msg(p, 'You dare not strike. One blow here would unmask you both.', 'warn'); p.act = null; return false; }
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
      let hit = rollAttack(A, Dr), dmg = hit ? R.int(max + 1) : 0, xd = null;
      /* a hunted animal (monster `hunt`, 2026-10-09: the deer): an arrow that hits brings it down in `hits[arrow]` hits,
         whatever the roll; the hit itself is about half at Ranged 1 and certain from `sure` on; the XP is paid as for an
         ordinary roll (xd), so hunting is no shortcut to Ranged */
      const HU = c === 'ranged' && md.hunt, hh = HU && HU.hits && ammoId ? HU.hits[ammoId] : 0;
      if (hh) {
        const L = lv(p, 'ranged'), sure = HU.sure || 10, pct = L >= sure ? 100 : Math.round(50 + 50 * (L - 1) / Math.max(1, sure - 1));
        hit = R.int(100) < pct; xd = hit ? R.int(max + 1) : 0; dmg = hit ? Math.ceil(md.hp / hh) : 0; blocked = false;
      }
      const dist = cheb(p.x, p.y, m.x, m.y);
      const delay = c === 'ranged' ? 1 + Math.floor((3 + dist) / 6) : c === 'magic' ? 1 + Math.floor((1 + dist) / 3) : 0;
      const anim = w ? w.anim : 'punch';
      ev({ e: 'attack', src: p.id, dst: m.uid, anim, delay, cls: c, ammo: ammoId, spell: c === 'magic' ? spell(p)[2] : null, tier: w ? w.tier : 0 });
      S.pending.push({ at: S.t + delay, src: p.id, dst: m.uid, dmg, xd, cls: c, xp: st.xp, blocked: blocked && !hit, dex: c === 'ranged' || (w && w.subcategory === 'dagger'), splash: c === 'magic' && !hit, arrow: p._arrowDrop || null });
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
      if (p && !p.puppet) hitXp(p, h.cls, h.xd != null ? Math.min(h.xd, dmg) : dmg, h.xp, h.dex);   /* a hunted animal: XP from the ordinary roll */
      if (p && h.dmg >= 0 && !h.splash) { const w = weaponOf(p); if (w && w.effect && m.hp > 0) applyEffect(m, w, p.id); }
      if (p) {
        m.hurt = p.id; m.hurtT = S.t; m.back = 0;
        /* a chained / windup beast (the dragon) keeps the one it already has, so two rangers cannot bounce it
           between them and cancel every blow. Other monsters still switch to the latest hitter so a group can tank. */
        if (MON[m.key].fleeHit) m.tgt = 0;
        else if (!(MON[m.key].windup || MON[m.key].chain) || !tgtOk(m)) m.tgt = p.id;
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
    /* public kill boards (the ruined keep's wooden sign): a G-counter per character name. The @ashvale Bank holds the
       global counts; two games merging take the higher count for each name and the painted total is the Bank's (or the
       sum of names, if that is higher). */
    const SCORES = {}, SCORE_N = {};
    function scoreName(n) { return cleanName(n) || 'Adventurer'; }
    function mergeScores(key, names) {
      if (!/^[a-z_]{1,32}$/.test(String(key)) || !names || typeof names !== 'object') return 0;
      const m = SCORES[key] = SCORES[key] || {}; let n = 0;
      for (const raw in names) { const nm = cleanName(raw), v = names[raw] | 0; if (!nm || v <= 0 || v >= 1e9 || (m[nm] | 0) >= v) continue; m[nm] = v; n++; }
      return n;
    }
    function setScoreTotal(key, n) {
      if (!/^[a-z_]{1,32}$/.test(String(key))) return 0;
      n = n | 0; if (n < 0 || n >= 1e9) return 0;
      SCORE_N[key] = Math.max(SCORE_N[key] | 0, n); return SCORE_N[key];
    }
    function scoreKill(key, name) {
      if (!/^[a-z_]{1,32}$/.test(String(key))) return 0;
      const nm = scoreName(name), m = SCORES[key] = SCORES[key] || {};
      m[nm] = (m[nm] | 0) + 1;
      SCORE_N[key] = Math.max(SCORE_N[key] | 0, 0) + 1;
      ev({ e: 'score', key, name: nm, n: m[nm], names: Object.assign({}, m) });
      return m[nm];
    }
    function scoresOf(key) {
      const m = SCORES[key] || {}; let sum = 0; const top = [];
      for (const nm in m) { sum += m[nm] | 0; top.push([nm, m[nm] | 0]); }
      top.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      return { total: Math.max(SCORE_N[key] | 0, sum), top: top.slice(0, 10), names: m };
    }
    function scoreBoard(key) {
      const s = scoresOf(key), L = ['DRAGON KILLERS', 'Slain ' + s.total + (s.total === 1 ? ' time' : ' times')];
      if (!s.top.length) L.push('', 'None yet.');
      else s.top.forEach((r, i) => L.push((i + 1) + '. ' + r[0] + '  ' + r[1]));
      return L;
    }
    function scoreRead(key) {
      const s = scoresOf(key), L = ['The chained dragon has been slain ' + s.total + ' time' + (s.total === 1 ? '' : 's') + '.'];
      if (!s.top.length) L.push('No names are carved here yet.');
      else { L.push('The names of its slayers, by how many times:'); s.top.forEach((r, i) => L.push((i + 1) + '. ' + r[0] + ' — ' + r[1])); }
      return L;
    }
    function signAt(x, y) { return (M.objects || []).find(o => o.k === 'wsign' && o.x === (x | 0) && o.y === (y | 0)) || null; }
    function creditKill(p, key) {
      const md = MON[key]; if (!md) return;
      p.kills[key] = (p.kills[key] || 0) + 1;
      for (const qid in p.quests) {
        const q = p.quests[qid], Q = D.quests.quests[qid], st = Q && Q.steps[q.step - 1]; if (!st) continue;
        if (st.goal.kill === key && q.n < (st.goal.n == null ? 1 : st.goal.n)) { q.n++; msg(p, Q.name + ': ' + q.n + ' / ' + (st.goal.n || 1) + ' ' + md.name.toLowerCase() + ((st.goal.n || 1) > 1 ? 's' : '') + ' slain.', 'quest'); }
        if (st.goal.kills && st.goal.kills[key] != null) {
          q.kn = q.kn || {}; const capn = st.goal.kills[key];
          if ((q.kn[key] | 0) < capn) { q.kn[key] = (q.kn[key] | 0) + 1; q.n = 0; for (const k in st.goal.kills) q.n += Math.min(st.goal.kills[k], q.kn[k] | 0); msg(p, Q.name + ': ' + md.name + ' falls. ' + q.n + ' / ' + (st.goal.n || 1) + '.', 'quest'); }
        }
      }
    }
    function creditLight(p, log) {
      for (const qid in p.quests) {
        const q = p.quests[qid], Q = D.quests.quests[qid], st = Q && Q.steps[q.step - 1], g = st && st.goal;
        if (g && g.light && (g.light === '*' || g.light === log) && q.n < (g.n == null ? 1 : g.n)) { q.n++; msg(p, Q.name + ': ' + q.n + ' / ' + (g.n || 1) + ' fire' + ((g.n || 1) > 1 ? 's' : '') + ' lit.', 'quest'); }
      }
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
      if (p && m.key === 'chain_dragon') scoreKill(m.key, p.name);
      for (const pid of S.order) { const o = S.players[pid]; if (o.act && o.act.k === 'attack' && o.act.uid === m.uid) o.act = null; }
    }
    function mobDrops(m) {
      if (m.summon) return;   /* a summoned fight leaves nothing on the ground */
      const md = MON[m.key], owner = m.killer;
      if (md.gold) dropGround('coins', md.gold, m.x, m.y, owner, 300);
      const bn = md.bones === undefined ? PRAY.bones : md.bones; if (bn && IT[bn]) dropGround(bn, 1, m.x, m.y, owner, 300);   /* every monster leaves bones (2026-10-07) */
      for (const k in m.carry || {}) if (m.carry[k] > 0 && IT[k]) dropGround(k, m.carry[k], m.x, m.y, owner, 300);
      for (const d of md.drops) if (!(m.carry0 && d.item && (d.item in m.carry0)) && R.int(d.one_in) === 0) {
        const id = d.any && d.any.length ? d.any[R.int(d.any.length)] : d.item;
        if (!id || !IT[id]) continue;
        const n = d.n ? d.n[0] + R.int(d.n[1] - d.n[0] + 1) : 1; dropGround(id, n, m.x, m.y, owner, 300);
      }
    }
    function mobAttack(m, p, mode) {
      const md = MON[m.key], b = bonuses(p), st = style(p), magic = mode === 'magic', ranged = !!mode && !magic, cls = magic ? 'magic' : ranged ? 'ranged' : 'melee', C = magic ? md.cast || {} : null;
      if (ranged) { const ak = Object.keys(m.carry || {}).find(k => /^arrows_/.test(k) && m.carry[k] > 0); if (!ak) return; m.carry[ak]--; m._ammo = ak; }
      /* a spell is rolled against magic defence as in RuneScape: 70% Magic, 30% Defence */
      const A = magic ? ((C.att || md.att) + 9) * ((C.attb || md.attb) + 64) : (md.att + 9) * (md.attb + 64);
      const Dr = magic ? (Math.floor(eff(p, 'magic') * 0.7 + eff(p, 'defence') * 0.3) + 9) * (b.defence + 64) : (eff(p, 'defence') + (st.def || 0) + 9) * (b.defence + 64);
      if (airborne(p) && !mode) return;   /* a hawk in the air: no blow can reach it - only an arrow or a spell, shot up at it (2026-10-08) */
      const hk = isHawk(p), hit = rollAttack(A, Dr); let dmg = hit ? Math.min(R.int((magic && C.max != null ? C.max : md.max) + 1), hk ? p.hawkHp : p.hp) : 0, dodged = false;
      if (dmg > 0 && R.int(100) < Math.floor(lv(p, 'dexterity') / 10) * (DEX.dodgePerTenLevels || 1)) { dmg = 0; dodged = true; }   /* Dexterity: a dodge turns a hit into a 0 */
      /* an overhead protection prayer stops a monster's blows of its kind entirely, as in RuneScape; against a spell it
         also stops what the spell would do to you. `raw` is the roll before the prayer, so a player whose prayer went out
         between the host's roll and the hit still takes it (applyHit). */
      if (dmg > 0 && md.miss && R.int(100) < md.miss) dmg = 0;   /* a swing that forgets itself (Bramble) */
      const raw = dmg, prot = protects(p, cls), ward = magic && p.eq && p.eq.cape && IT[p.eq.cape.id] && IT[p.eq.cape.id].ward === m.key;
      if (prot || ward) dmg = 0;
      const fx = magic && hit && C.fx && !prot && !ward && !hk && (!C.fxChance || R.int(C.fxChance) === 0) ? C.fx : null;
      ev({ e: 'attack', src: m.uid, dst: p.id, anim: ranged ? 'bow' : magic ? 'cast' : md.anim, delay: ranged || magic ? 1 : 0, cls, ammo: ranged ? m._ammo : null, spell: magic ? C.name || 'Shadow bolt' : null });
      if (!p.puppet) { if (hk) p.hawkHp -= dmg; else p.hp -= dmg; }
      ev({ e: 'hit', dst: p.id, src: m.uid, dmg, max: hk ? HK.hp : maxHp(p), hp: hk ? p.hawkHp : p.puppet ? Math.max(0, p.hp - dmg) : p.hp, hawk: hk ? 1 : 0, cls, blocked: !hit && !!p.eq.shield, dodged, prot: prot || ward ? 1 : 0, raw, fx, fxt: fx ? C.fxTicks || 5 : 0 });
      if (p.puppet) return;
      if (ward && raw > 0 && !p.puppet) msg(p, 'The dragonfire breaks on your cape.');
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
    const POISON_EVERY = 3, ANTIDOTE_TICKS = 300;   /* 300 ticks is three minutes (a tick is 0.6 s) */
    function poisonPlayer(p, v, by) {
      if (p.cd && p.cd.antidote > S.t) { msg(p, 'The antidote is still in you. The poison does not take.', 'info'); return; }
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
    /* LAKES (2026-10-07): a lake is one body of still water; its key is its lowest tile index, found once by a flood fill
       and kept for every tile of it. Things that sink in it lie on its bottom (ground items with .sunk = the key), unseen,
       until somebody fishing anywhere on that lake hooks one. */
    const LAKE = new Map();
    function lakeKey(x, y) {
      const k0 = idx(x, y); if (LAKE.has(k0)) return LAKE.get(k0);
      const wet = (a, b) => { const t = M.tileAt(a, b); return t === '~' || t === 'v'; };
      if (!wet(x, y) || (M.waterKind && M.waterKind(x, y) !== 'lake')) { LAKE.set(k0, 0); return 0; }
      const seen = [], q = [[x, y]], vis = new Set([k0]); let lo = k0;
      while (q.length && seen.length < 8000) {
        const [a, b] = q.pop(); seen.push(idx(a, b)); lo = Math.min(lo, idx(a, b));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = a + dx, ny = b + dy, ki = idx(nx, ny); if (!vis.has(ki) && wet(nx, ny)) { vis.add(ki); q.push([nx, ny]); } }
      }
      const key = 'L' + lo; for (const ki of seen) LAKE.set(ki, key); return key;
    }
    /* THROUGH THE ICE (2026-10-07: "If you're walking on the ice during spring thaw and it melts and you fall through the lake,
       you should respawn at the nearest town portal as if you died. All of your items should be lost in the bottom of the lake"):
       a death, but what you carried and wore sinks into that lake instead of lying in a pile */
    function fallThrough(pid) {
      const p = S.players[pid]; if (!p || p.dead || p.boat) return false;
      const key = lakeKey(p.x, p.y) || 'L' + idx(p.x, p.y);
      msg(p, 'The ice cracks under your feet and gives way! You plunge into the freezing water.', 'warn');
      killPlayer(p, key);
      return true;
    }
    function sunkIn(key) { let n = 0; for (const g of S.ground) if (g.sunk === key) n++; return n; }
    function killPlayer(p, sunkKey) {
      if (p.poison) { delete p.poison; ev({ e: 'poison', p: p.id, on: false }); }
      p.dead = S.t; p.act = null; p.path = []; p.skilling = null; closeShop(p); prayersOff(p); p.pfx = null;
      ev({ e: 'die', p: p.id });
      msg(p, 'Oh dear, you are dead!', 'warn');
      /* 2026-10-01: everything you carry and wear drops where you die; anyone may take it (no grace period) */
      const pile = [];
      for (let i = 0; i < p.inv.length; i++) { const s = p.inv[i]; if (s && !IT[s.id].bound) { pile.push(s); p.inv[i] = null; } }   /* what was made for you (bound) stays with you */
      for (const k of EQ_SLOTS) { const e = p.eq[k]; if (e && !IT[e.id].bound) { pile.push(e); delete p.eq[k]; } }
      for (const it of pile) dropGround(it.id, it.n, p.x, p.y, null, DEATH.pileTicks || 1000, sunkKey ? { from: p.id, diedAt: S.t, sunk: sunkKey } : { from: p.id, diedAt: S.t });
      if (pile.length && sunkKey) { msg(p, 'Everything you carried sinks to the bottom of the lake. Someone fishing here might hook it one day.', 'warn'); ev({ e: 'inv', p: p.id }); ev({ e: 'equip', p: p.id }); }
      else if (pile.length) {
        const z = M.zoneAt(p.x, p.y);
        msg(p, 'Your belongings lie where you fell (' + (z || 'the wild') + ', ' + p.x + ',' + p.y + ') for ' + Math.round((DEATH.pileTicks || 1000) * 0.6 / 60) + ' minutes. Others will be able to take them once shared loot arrives.', 'warn');
        p.deathPile = { x: p.x, y: p.y, t: S.t };
        ev({ e: 'inv', p: p.id }); ev({ e: 'equip', p: p.id });
      }
      for (const m of S.mobs) if (m.tgt === p.id) loseTarget(m);
    }

    // ---------------- NPCs and quests
    function questFinished(p, id) {
      const Q = D.quests.quests[id], q = p.quests[id];
      return !!(Q && q && q.step > Q.steps.length);
    }
    function prereqDone(Q, p) {
      if (!Q) return true;
      if (!questForHome(Q, p)) return false;   /* a quest for those born in one home only (2026-10-09: the Ziibiing beginning quests) */
      if (Q.after && !questFinished(p, Q.after)) return false;
      for (const id of Q.needs ? [].concat(Q.needs) : []) if (!questFinished(p, id)) return false;
      return true;
    }
    function nextOffered(n, p) {
      const ids = n.quests && n.quests.length ? n.quests.slice() : (n.quest ? [n.quest] : []);
      for (const id of ids) { const Q = D.quests.quests[id], q = p.quests[id]; if (Q && q && q.step <= Q.steps.length) return id; }   /* one under way comes before a new offer (Mishoomis: the wild rice you began, then the flint) */
      let shut = null;   /* a quest out of its season waits behind one that can be started now (it is still named, to say when) */
      for (const id of ids) {
        const Q = D.quests.quests[id]; if (!Q || !prereqDone(Q, p)) continue;
        const q = p.quests[id];
        if (!q || q.step <= Q.steps.length) { if (!q && !inSeason(Q)) { shut = shut || id; continue; } return id; }
      }
      return shut;
    }
    function npcIdleLines(n, p) {
      if (n.reqAfter && !questFinished(p, n.reqAfter)) return n.lines;
      if (n.openFlag && hasFlag(p, n.openFlag) && n.linesOpen) return n.linesOpen;
      if (n.linesReady) return n.linesReady;
      return n.lines;
    }
    function crateAt(x, y) { return (M.objects || []).find(o => o.k === 'crate' && o.loot && o.x === x && o.y === y) || null; }
    function openCrate(p, o) {
      const flag = o.once || ('crate_' + o.x + '_' + o.y);
      if (hasFlag(p, flag)) { msg(p, 'The crate is empty. You already took what was hidden in it.', 'info'); return; }
      if (!IT[o.loot]) return;
      if (addItem(p, o.loot, o.n || 1)) { msg(p, 'Your bag is full. Make room before you take what is in the crate.', 'warn'); return; }
      p.flags = p.flags || {}; p.flags[flag] = S.t || 1;
      ev({ e: 'inv', p: p.id }); ev({ e: 'flag', p: p.id, flag: flag });
      msg(p, 'Under the straw you find ' + IT[o.loot].name + '.', 'info');
    }
    function searchOpen(p, n) {
      const s = n && n.search; if (!s) return false;
      const q = p.quests && p.quests[s.quest]; if (!q) return false;
      if (q.step > s.step) return true;
      if (q.step === s.step && (q.n | 0) >= 1) return true;
      return false;   /* a quest item from someone else does not open the search */
    }
    function coverBlocks(p, m) {
      const md = MON[m.key]; if (!md || !md.cover) return false;
      const C = md.cover, q = p.quests && p.quests[C.quest];
      return !(q && q.step >= (C.step || 1));
    }
    /* ---------------- THE SUGAR BUSH (2026-10-08, handoff/sugarbush_plan.md) ----------------
       NATURE: the engine's word on the season where the player stands ({day, year, sap: {season, day, low, high, left}}), as it
       has the sky and the clock; NATTELL(kind, p): a line on the weather, the plants and birds, the moon, or the sun, stars and
       planets, for the people who watch them. MARKS: which maples gave sap (on which game day) and which birches gave bark (in
       which year), shared with everyone through the @ashvale Bank: a maple gives sap once a day and a birch its bark once a year,
       to whoever comes first. */
    let NATURE = null, NATTELL = null;
    function setNature(o) { NATURE = o || null; }
    function setNatureTell(fn) { NATTELL = typeof fn === 'function' ? fn : null; }
    const MARKS = {};   /* mark kind -> Map(tile -> period) */
    function setMarks(k, cells) { if (!/^[a-z]{1,12}$/.test(String(k))) return 0; const m = MARKS[k] = MARKS[k] || new Map(); let n = 0; for (const c of cells || []) { const i = idx(c[0] | 0, c[1] | 0), v = c[2] | 0; if (!(m.get(i) >= v)) { m.set(i, v); n++; } } return n; }
    /* a tree's extra yield, all data (rules.nodes.<kind>.peel / .tap; 2026-10-08: the rules ride in the JSON): peel takes an
       item off the tree, tap fills an empty bucket (an item with "Fills into"); each tree once per `per` (day | year) for anyone,
       `season` must be on (sap: the run, from NATURE), and the words come with it */
    const emptyBucket = (p) => p.inv.findIndex(sl => sl && IT[sl.id] && IT[sl.id].fills && IT[IT[sl.id].fills]);
    function natureDay() { return NATURE && NATURE.day != null ? NATURE.day : Math.floor(S.t / 12000); }
    /* game hours (fractional): from the engine's sky clock when it has one (NATURE.hours), else from the tick count (a game day is
       12000 ticks, so an hour is 500). Mitigwaabiike's bow takes two of them (2026-10-09) */
    function natureHours() { return NATURE && NATURE.hours != null ? NATURE.hours : S.t / 500; }
    /* SEASONAL QUESTS (2026-10-09): a quest with a `season` ('rice', 'sap', 'spring', ...) is offered only in it. The engine
       works out each kind once a game day where you stand (NATURE.seasons[kind] = {open, days until it opens}); with no word from
       a sky (a test, a headless host) every season is open, as before */
    function seasonOf(Q) { return Q && Q.season && NATURE && NATURE.seasons && NATURE.seasons[Q.season] || null; }
    function inSeason(Q) { const s = seasonOf(Q); return !s || !!s.open; }
    function whenText(days) { return days == null ? 'next year' : days <= 1 ? 'tomorrow' : days <= 6 ? 'in ' + days + ' days' : 'in about ' + days + ' days'; }
    function realText(days) { const h = (days || 0) * 2; return h < 48 ? 'about ' + h + ' hours' : 'about ' + Math.round(h / 24) + ' days'; }   /* a game day is two real hours */
    function natureYear() { return NATURE && NATURE.year != null ? NATURE.year : 1 + Math.floor(S.t / (12000 * 365)); }
    const period = (per) => per === 'year' ? natureYear() : natureDay();
    function yieldTick(p, n, i, Y, how) {
      p.face = faceTo(p.x, p.y, n.x, n.y);
      const stop = (t) => { if (t) msg(p, t, 'warn'); p.act = null; p.skilling = null; };
      const b = how === 'tap' ? emptyBucket(p) : -1;
      if (how === 'tap' && b < 0) return stop(Y.none);
      if (Y.season) {
        const sp = NATURE && NATURE[Y.season];
        if (!sp || !sp.season) return stop(Y.off);
        if (!sp.day) return stop(sp.high <= 0 ? Y.cold : Y.warm);
      }
      const M0 = MARKS[Y.mark] = MARKS[Y.mark] || new Map();
      if (M0.get(i) === period(Y.per)) return stop(Y.again);
      if (how === 'peel' && !canAdd(p, Y.item, 1)) return stop('Your bag is full.');
      p.skilling = 'chop';
      if (!p.gT) { harvestHint(p, n.x, n.y); p.gT = S.t + (Y.ticks || 4); return; }
      if (S.t < p.gT) return;
      p.gT = 0; p.act = null; p.skilling = null;
      let got = Y.item, was = null;
      if (how === 'tap') { was = p.inv[b].id; got = IT[was].fills; removeItem(p, was, 1); }
      addItem(p, got, 1); addXp(p, 'woodcutting', (Y.xp || 0) | 0);
      if (how === 'peel' && blessExtra(p, n.x, n.y) && canAdd(p, got, 1)) { addItem(p, got, 1); msg(p, 'The birch gives a second sheet, as if it wanted to.'); }   /* blessed ground: more bark */
      M0.set(i, period(Y.per)); ev({ e: 'mark', p: p.id, k: Y.mark, x: n.x, y: n.y, v: period(Y.per) });
      if (Y.say) msg(p, String(Y.say).replace('{bucket}', was ? IT[was].name.toLowerCase() : ''));
      ev({ e: 'gather', p: p.id, node: i, ok: true, item: got }); ev({ e: 'inv', p: p.id });
    }
    /* TRADES AND CRAFTS by the people (data on the NPC): trade {take: {id: n}, give: {id: n}, say, lack} at once; craft {take,
       give, days, say, wait, ready, lack} - made for you and ready to collect after `days` game days (Migizi's biskitenaagan), or
       after `hours` game hours; `n` of them at once (fifteen bikwak); `after`: only once that quest is finished */
    /* SNARES (2026-10-09: Ma'iingan lends a snare; "set it, come back"): an item with `trap` {prey: [monster keys], near:
       tiles, hours: [min, max], xp: {skill: n}, max: how many one may set} is set where you stand, on open ground with its prey
       about. Some game hours later (deterministic, from the seeded roll) it holds one: the whole animal, one of each thing it can
       drop (a hare: meat and pelt). Going back hands you the catch and the snare, ready to set again. Your snares are yours alone and are saved with you. */
    /* ASEMAA (tobacco) (2026-10-09; OPD: asemaa (na) tobacco, biindaakoojige (vai) makes an offering of tobacco): an item whose
       subcategory is in rules.items.offers is offered from the bag: one is spent, Prayer XP as for burying the item named in `xpAs`
       (bones), and the ground within `radius` is blessed for you for the rest of the game day - `bonus` % better harvests there.
       A home with `offerHint` (Ziibiing) reminds its people, once per place and day, the first time they start a harvest on
       unblessed ground; it never stops the harvest. */
    function offerOf(d) { return d && ((RU.items || {}).offers || {})[d.subcategory] || null; }
    function offerRule() { const O = (RU.items || {}).offers || {}; return O[Object.keys(O)[0]] || null; }
    function blessed(p, x, y) { const day = natureDay(); return (p.bless || []).some(b => b.day === day && cheb(b.x, b.y, x, y) <= b.r); }
    function blessRoll(p, x, y, pct) { const O = offerRule(); return O && blessed(p, x, y) ? Math.min(98, Math.round(pct * (100 + (O.bonus || 25)) / 100)) : pct; }   /* a success chance, better on blessed ground */
    function blessExtra(p, x, y) { const O = offerRule(); return !!(O && blessed(p, x, y) && R.int(100) < (O.bonus || 25)); }   /* an extra catch on blessed ground */
    function offerTobacco(p, slot) {
      const s = p.inv[slot], d = s && IT[s.id], O = offerOf(d); if (!O) return;
      if (p.dead || p.boat) { msg(p, 'Not here.', 'warn'); return; }
      if (s.n > 1) s.n--; else p.inv[slot] = null;
      const day = natureDay(), r = O.radius || 12; p.bless = (p.bless || []).filter(b => b.day === day); p.bless.push({ x: p.x, y: p.y, day, r });
      const xp = O.xpAs && IT[O.xpAs] ? IT[O.xpAs].buryXp | 0 : (O.xp | 0); if (xp) addXp(p, 'prayer', xp);
      ev({ e: 'inv', p: p.id }); ev({ e: 'offer', p: p.id, x: p.x, y: p.y }); msg(p, O.say || 'You make an offering.', 'info');
    }
    /* what an elder is asked with: an offering item (asemaa) or anything offered the same way (apaakozigan, kinnikinnick, the operator
       2026-10-09); the mixture is given first, the plain tobacco kept */
    function askIds(k) { const O = offerOf(IT[k]); return O ? Object.keys(IT).filter(id => offerOf(IT[id]) === O).sort((a, b) => (a === k) - (b === k)) : [k]; }
    function askHas(p, ask) { return Object.keys(ask).every(k => askIds(k).reduce((a, id) => a + invCount(p, id), 0) >= ask[k]); }
    function askTake(p, ask) {
      const gave = [];
      for (const k in ask) { let left = ask[k]; for (const id of askIds(k)) { const t = Math.min(left, invCount(p, id)); if (t > 0) { removeItem(p, id, t); left -= t; gave.push(t + ' x ' + IT[id].name + (IT[id].english ? ' (' + IT[id].english + ')' : '')); } } }
      ev({ e: 'inv', p: p.id }); msg(p, 'You offer ' + gave.join(' and ') + ' as you ask.', 'quest');
    }
    function harvestHint(p, x, y) {
      const H = (homeOf(p) || {}).offerHint, O = offerRule(); if (!H || !O || blessed(p, x, y)) return;
      const day = natureDay(); if (!p.hints || p.hints.day !== day) p.hints = { day, at: [] };
      if (p.hints.at.some(([hx, hy]) => cheb(hx, hy, x, y) <= (O.radius || 12))) return;
      p.hints.at.push([x, y]); msg(p, H, 'quest');
    }
    function trapOf(d) { return d && (d.trap || ((RU.items || {}).traps || {})[d.subcategory]) || null; }   /* rules.items.traps by subcategory */
    function trapsMsg(p) { ev({ e: 'traps', p: p.id, traps: (p.traps || []).map(t => ({ x: t.x, y: t.y, id: t.id, ready: natureHours() >= t.ready ? 1 : 0 })) }); }
    function setTrap(p, slot) {
      const s = p.inv[slot], d = s && IT[s.id], T = trapOf(d); if (!T) return;
      if (p.boat || p.lv !== 0 || p.dead || (M.insideAt && M.insideAt(p.x, p.y)) || isWet(p.x, p.y)) { msg(p, 'You can only set a ' + d.name.toLowerCase() + ' on open ground outdoors.', 'warn'); return; }
      p.traps = p.traps || [];
      if (p.traps.some(t => t.x === p.x && t.y === p.y)) { msg(p, 'You already have a snare set here.', 'warn'); return; }
      if (p.traps.length >= (T.max || 3)) { msg(p, 'You have as many snares out as you can watch. Go and look in one first.', 'warn'); return; }
      const prey = T.prey || [], near = T.near || 10;
      const by = S.mobs.find(m => !m.dead && !m.gone && prey.indexOf(m.key) >= 0 && cheb(m.x, m.y, p.x, p.y) <= near);
      if (!by) { msg(p, T.none || 'There are no tracks here. Set it where the animals run.', 'warn'); return; }
      const h = T.hours || [1, 2], ready = natureHours() + h[0] + (h[1] - h[0]) * R.int(101) / 100;
      if (s.n > 1) s.n--; else p.inv[slot] = null;
      harvestHint(p, p.x, p.y);
      p.traps.push({ id: s.id, x: p.x, y: p.y, prey: by.key, ready: Math.round(ready * 1000) / 1000 });
      ev({ e: 'inv', p: p.id }); trapsMsg(p); msg(p, T.say || 'You set the snare.');
    }
    function checkTrap(p, x, y, up) {
      const i = (p.traps || []).findIndex(t => t.x === x && t.y === y); if (i < 0) return;
      const t = p.traps[i], T = trapOf(IT[t.id]) || {}, caught = !up && natureHours() >= t.ready;
      if (!caught && !up) { msg(p, T.empty || 'Nothing yet. Leave it a while and come back.'); return; }
      const got = caught ? ((MON[t.prey] && MON[t.prey].drops) || []).filter(dr => IT[dr.item]).map(dr => [dr.item, 1])   /* the whole animal: each thing it can drop, once */ : [];
      const all = got.concat(caught && blessExtra(p, t.x, t.y) ? got : []).concat([[t.id, 1]]);   /* blessed ground: two in the snare */
      if (all.some(([id, k]) => !canAdd(p, id, k)) && invFree(p) < all.length) { msg(p, "You don't have enough inventory space to hold that.", 'warn'); return; }
      p.traps.splice(i, 1);
      for (const [id, k] of all) { const left = addItem(p, id, k); if (left) dropGround(id, left, p.x, p.y, p.id, 600); }
      if (caught) { for (const sk in T.xp || {}) addXp(p, sk, T.xp[sk]); msg(p, String(T.caught || 'There is a {prey} in your snare.').replace('{prey}', (MON[t.prey] ? MON[t.prey].name : 'catch').toLowerCase()), 'info'); }
      else msg(p, 'You take up your snare.');
      ev({ e: 'inv', p: p.id }); trapsMsg(p);
    }
    /* hand over what a craft takes and put the order in (its key as tradeTalk keeps it); `craft` command: the choice made */
    function orderCraft(p, n, c) {
      const C = n.craft, key = (Array.isArray(C) && C.length > 1) ? n.id + ':' + (c.give || 'boat') : n.id;
      p.orders = p.orders || {}; if (p.orders[key] || !Object.keys(c.take || {}).every(k => invCount(p, k) >= c.take[k])) return false;
      for (const k in c.take) removeItem(p, k, c.take[k]); ev({ e: 'inv', p: p.id });
      p.orders[key] = c.hours != null ? { readyH: natureHours() + c.hours } : { ready: natureDay() + (c.days || 1) };
      msg(p, 'You hand ' + n.name + ' ' + Object.keys(c.take).map(k => c.take[k] + ' x ' + IT[k].name).join(' and ') + '.', 'info');
      ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: (c.say || []).map(l => String(l).replace(/\{name\}/g, p.name || 'traveller')) });
      return true;
    }
    function tradeTalk(p, n) {
      const T = n.trade, C = n.craft, f = (L) => (L || []).map(l => String(l).replace(/\{name\}/g, p.name || 'traveller'));
      const has = (take) => Object.keys(take || {}).every(k => invCount(p, k) >= take[k]);
      const say = (L) => { ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: f(L) }); return true; };
      if (C) {   /* one craft, or a list (Ziigwan carves the push pole and the knockers); an order is kept per thing made */
        p.orders = p.orders || {}; const L0 = (Array.isArray(C) ? C : [C]).filter(c => !c.after || questFinished(p, c.after)), key = (c) => (Array.isArray(C) && C.length > 1) ? n.id + ':' + (c.give || 'boat') : n.id;
        if (Array.isArray(C) && C.length > 1 && p.orders[n.id]) { p.orders[n.id + ':' + (C[0].give || 'boat')] = p.orders[n.id]; delete p.orders[n.id]; }   /* an order made when they made one thing (Migizi's bucket, before his canoes) */
        const isReady = (o) => o.readyH != null ? natureHours() >= o.readyH : natureDay() >= o.ready;
        for (const c of L0) { const o = p.orders[key(c)]; if (!o || !isReady(o)) continue;
          if (c.boat) {   /* a canoe: set in the water at the landing when it is ready (Migizi, 2026-10-09); anyone may paddle it, and it
                             lasts like any canoe left at a bank (a game year after you step out) */
            const spot = c.boat.find(b => !BOATS.has(b[0] + ',' + b[1]));
            if (!spot) { msg(p, 'Every place at the landing has a canoe in it already. Take one of those, or come back when one is free.', 'warn'); return true; }
            delete p.orders[key(c)]; landBoat(spot[0], spot[1], spot[2] | 0, p.id);   /* told to the Bank like a canoe you step out of */ msg(p, n.name + ' sets your ' + (c.name || 'canoe') + ' in the water at the landing.', 'info');
            return say(c.ready); }
          if (!canAdd(p, c.give, c.n || 1)) { msg(p, 'Your bag is full: make room for what ' + n.name + ' made you.', 'warn'); return true; }
          delete p.orders[key(c)]; addItem(p, c.give, c.n || 1); ev({ e: 'inv', p: p.id }); msg(p, n.name + ' gives you ' + (c.n > 1 ? c.n + ' x ' : '') + IT[c.give].name + '.', 'info');
          return say(c.ready); }
        const can0 = L0.filter(c => !p.orders[key(c)] && has(c.take));
        const can = can0.filter(c => c === can0[0] || Object.keys(c.take).some(k => can0[0].take[k] != null));   /* only things made from the same goods compete */
        if (can.length > 1) {   /* you could pay for more than one from the same goods: they ask which (Migizi: a bucket or a canoe, both bark and sinew) */
          ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: f([n.choose || 'What shall I make for you, {name}?']), make: can.map(c => ({ i: (Array.isArray(C) ? C : [C]).indexOf(c), label: c.label || (c.boat ? 'A ' + (c.name || 'canoe') : IT[c.give].name) })) });
          return true; }
        if (can.length) return orderCraft(p, n, can[0]);
        const w = L0.find(c => p.orders[key(c)]); if (w) return say(w.wait);
        const part = L0.find(c => c.hint && Object.keys(c.take).some(k => invCount(p, k) > 0)); if (part) return say(part.lack);
      }
      const T1 = (Array.isArray(T) ? T : T ? [T] : []).find(t => has(t.take));   /* one trade, or a list (Ma'iingan: ojiitad for a deer hide or for three hare pelts) */
      if (T1) { const T = T1;
        for (const k in T.give) if (!canAdd(p, k, T.give[k])) { msg(p, 'Your bag is full.', 'warn'); return true; }
        for (const k in T.take) removeItem(p, k, T.take[k]); for (const k in T.give) addItem(p, k, T.give[k]); ev({ e: 'inv', p: p.id });
        msg(p, 'You trade ' + Object.keys(T.take).map(k => IT[k].name).join(', ') + ' for ' + Object.keys(T.give).map(k => IT[k].name).join(', ') + '.', 'info');
        return say(T.say);
      }
      return false;
    }
    let SKYTELL = null;   /* the engine's word on the next eclipses (it has the sky); NPCs marked `sky` end with it */
    function setSkyTell(fn) { SKYTELL = typeof fn === 'function' ? fn : null; }
    /* an NPC as this player meets it: its `from: {<home>: {lines, examine, greet, ...}}` replaces its own words for a character
       born in that home (2026-10-09: a Ziibiing-born is spoken to as one of the village, never about the town) */
    /* a line of dialogue may be one text, or texts by home ({"ziibiing": "...", "*": "..."}); null = not said to that home */
    function lineFor(p, l) { if (!l || typeof l !== 'object') return l; const h = (p && p.home) || 'ashvale'; return h in l ? l[h] : l['*']; }
    const linesFor = (p, L) => (L || []).map(l => lineFor(p, l)).filter(l => l != null);
    function npcFor(p, n) { const o = n && n.from && n.from[(p && p.home) || 'ashvale']; return o ? Object.assign({}, n, o) : n; }
    function talk(p, n) {
      /* a step's kit is never lost for good (the Arcade session 2026-10-07: The Even Grove soft-locked when its three saplings were
         sold): talking to the quest's giver while the step is open hands back what is missing of it, as logging in already did */
      for (const qid in p.quests || {}) { const q = p.quests[qid], Q = D.quests.quests[qid], st = Q && Q.giver === n.id && Q.steps[q.step - 1]; if (st && st.kit && !questFinished(p, qid)) topUp(p, q, st); }
      if (n.hideFlag && !hasFlag(p, n.hideFlag)) return;
      if (n.search) {
        if (!searchOpen(p, n)) {
          ev({ e: 'dialog', p: p.id, npc: n.id, name: p.name || 'You', lines: ['We should probably leave him alone.'] });
          return;
        }
        const fl = n.search.flag;
        if (fl && !hasFlag(p, fl)) {
          for (const id of n.search.items || []) {
            if (!IT[id]) continue;
            if (addItem(p, id, 1)) { msg(p, 'Your bag is full: make room before you search that.', 'warn'); return; }
          }
          p.flags = p.flags || {}; p.flags[fl] = S.t || 1;
          ev({ e: 'inv', p: p.id }); ev({ e: 'flag', p: p.id, flag: fl });
          const found = (n.search.items || []).filter(id => IT[id]).map(id => IT[id].name);
          if (found.length) msg(p, 'You find ' + found.join(' and ') + '.', 'info');
          const g = n.search.ghost && M.npcs.find(q => q.id === n.search.ghost);
          if (g) ev({ e: 'unhide', npc: g.id, p: p.id });
          const who = (g && g.lines && g.lines.length) ? g : n;
          const lines = (who === g) ? g.lines : ((n.search.say && n.search.say.length) ? n.search.say : ['You search the bag.']);
          ev({ e: 'dialog', p: p.id, npc: who.id, name: who.name, lines: lines.map(l => String(l).replace(/\{name\}/g, p.name || 'traveller')) });
          return;
        }
        ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: ['The bag is empty. The bones have nothing more to give.'] });
        return;
      }
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
        if (s2 && s2.goal.talk === n.id && !q.n) {
          q.n = 1; msg(p, Q2.name + ': you have said your piece to ' + n.name + '.', 'quest');
          if (s2.flag) { p.flags = p.flags || {}; if (!p.flags[s2.flag] && FLAGS[s2.flag]) { p.flags[s2.flag] = S.t || 1; ev({ e: 'flag', p: p.id, flag: s2.flag }); } }
          if (s2.say && s2.say.length && !s2.ends && !s2.fold) said = s2.say;
        }
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
      if ((n.trade || n.craft) && !ends && !nextOffered(n, p) && tradeTalk(p, n)) return;   /* a quest of theirs comes first (Ma'iingan's deer hunt before his sinew trade) */
      const idle = npcIdleLines(n, p), offered = nextOffered(n, p);
      const hadQuest = (n.quests || []).concat(n.quest ? [n.quest] : []).some(id => p.quests[id]);
      if (n.watch && !ends && !offered && !hadQuest) { ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: watchSay(p) }); return; }
      if (idle && idle.length && !ends && !offered && !hadQuest) { let tell = null; if (n.sky && SKYTELL) try { tell = SKYTELL(p); } catch (e) { tell = null; } let nat = null; if (n.nature && NATTELL) try { nat = NATTELL(n.nature, p); } catch (e) { nat = null; } ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: idle.concat(nat ? [nat] : [], tell ? [tell] : []) }); return; }   /* the sky-watchers end with the next eclipses */   /* dialogue straight off the zone data, checked after shop and quest */
      /* an NPC may offer the next quest only after the one before it is finished (Iria's supper, then the Gift of Angels) */
      let qid = ends || offered || n.quest;
      if (!qid && n.quests && n.quests.length) {
        for (let i = n.quests.length - 1; i >= 0; i--) if (p.quests[n.quests[i]]) { qid = n.quests[i]; break; }
      }
      if (qid && D.quests.quests[qid]) {
        const Q = D.quests.quests[qid]; let q = p.quests[qid]; let lines;
        if (q && Q.repeat && q.step > Q.steps.length && NATURE && (seasonOf(Q) ? inSeason(Q) : Q.repeat === 'spring' && NATURE.sap && NATURE.sap.season) && natureYear() > (q.yr | 0)) {
          if (Q.ask && !askHas(p, Q.ask)) { ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: linesFor(p, Q.askLackTalk || [Q.askLack]).map(l => String(l).replace(/\{name\}/g, p.name || 'traveller')) }); return; }
          if (Q.ask) askTake(p, Q.ask);   /* Nookomis asks again every spring (2026-10-08) */
          q = p.quests[qid] = { step: 1, n: 0, again: 1, yr: q.yr }; lines = linesFor(p, Q.again || Q.steps[0].talk).map(l => String(l).replace(/\{name\}/g, p.name || 'traveller')); ev({ e: 'quest', p: p.id, q: qid, step: 1 }); openStep(p, q, Q.steps[0]);
          ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines }); return;
        }
        if (q && q.hid) delete q.hid;   /* back in the log, at the step it was left on */
        /* goal kinds, all data: {"kill":key,"n":n} counted by creditKill, {"cook":item,"n":n} by a successful cook,
           {"bring":item,"n":n} counted in your bag, {"talk":npc} by the loop above, {"light":"*"|log,"n":n} by a fire you light,
           {"wait":hours} met once that many game hours have passed since the step opened (the giver is making something). A step
           may ask for a kill and a bring together, and a bring may also require "with". n defaults to 1. */
        const need = (st) => st.goal.n == null ? 1 : st.goal.n;
        const bringN = (st) => st.goal.bn == null ? need(st) : st.goal.bn;
        const withN = (st) => st.goal.wn == null ? 1 : st.goal.wn;
        const withs = (st) => !st.goal.with ? [] : typeof st.goal.with === 'string' ? [[st.goal.with, withN(st)]] : Object.entries(st.goal.with);   /* "with": one item (wn of it) or {id: n} */
        const bids = (g) => (Array.isArray(g.bring) ? g.bring : [g.bring]).filter(id => IT[id]);   /* bring: one item, or a list where any will do */
        const bringHave = (g) => bids(g).reduce((a, id) => a + Math.max(0, invCount(p, id) - ((q.pre && q.pre[id]) | 0)), 0);
        const counted = (st) => {
          if (st.goal.kills) { let n = 0; for (const k in st.goal.kills) n += Math.min(st.goal.kills[k], (q.kn && q.kn[k]) | 0); return n; }
          return (st.goal.kill || st.goal.cook || st.goal.talk || st.goal.plant || st.goal.light) ? (q.n | 0) : (st.goal.bring && bids(st.goal).length ? bringHave(st.goal) : (q.n | 0));
        };
        const killsMet = (st) => { const K = st.goal.kills; if (!K) return true; for (const k in K) if (((q.kn && q.kn[k]) | 0) < K[k]) return false; return true; };
        const met = (st) => {
          const g = st.goal;
          if ((g.kill || g.cook || g.talk || g.plant || g.light) && (q.n | 0) < need(st)) return false;
          if (g.wait != null && !(natureHours() >= (q.t0 == null ? Infinity : q.t0) + g.wait)) return false;
          if (g.kills && !killsMet(st)) return false;
          if (g.bring && (!bids(g).length || bringHave(g) < bringN(st))) return false;
          if (withs(st).some(([id, k]) => !IT[id] || invCount(p, id) < k)) return false;
          return !!(g.kill || g.cook || g.talk || g.bring || g.plant || g.kills || g.light || g.wait != null);
        };
        const fill = (L, st) => linesFor(p, L).map(l => String(l).replace(/\{(n|goal|left|name)\}/g, (m, k) => k === 'name' ? (p.name || 'traveller') : !st ? '' : k === 'n' ? counted(st) : k === 'goal' ? need(st) : Math.max(0, need(st) - counted(st))));
        const open = (st) => st && ZINDEX.some(z => z.id === st.zone);   /* a step opens when its zone EXISTS (it may not be loaded yet) */
        if (!q && !inSeason(Q)) {   /* out of its season: when it opens, not the errand */
          const sn = seasonOf(Q), when = whenText(sn.days);
          lines = linesFor(p, Q.notYet || ['Not yet, {name}. Come back {when}.']).map(l => String(l).replace(/\{name\}/g, p.name || 'traveller').replace(/\{when\}/g, when).replace(/\{days\}/g, sn.days == null ? '' : sn.days));
          ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines });
          msg(p, Q.name + ' opens ' + when + (sn.days ? ' (' + realText(sn.days) + ' of real time).' : '.'), 'quest');
          return;
        }
        const askHave = !Q.ask || askHas(p, Q.ask);
        if (!q && !askHave) {   /* an elder is asked with asemaa (tobacco): with none, they say so kindly (2026-10-09) */
          ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines: fill(Q.askLackTalk || [Q.askLack || 'Come back when you have something to ask with.'], null) }); return;
        }
        if (!q) {   /* a quest begins only when the player says yes; the first talk is the offer */
          lines = fill(Q.steps[0].talk, Q.steps[0]).concat(Q.ask ? fill([Q.askSay || 'You will offer what you ask with when you say yes.'], null) : []);
          ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines, offer: qid, warn: Q.steps[0] && Q.steps[0].summon ? 1 : 0 });
          return;
        }
        else {
          const st = Q.steps[q.step - 1];
          if (!st) lines = fill(Q.done, null);
          else if (!open(st)) { const prev = Q.steps[q.step - 2]; lines = prev && prev.locked && prev.locked.length ? fill(prev.locked, st) : ['The road to that place is not open yet. Come back another day.']; }
          else if (met(st) && (!st.ends || st.ends === n.id)) {
            if (st.goal.bring) {   /* the goods change hands here, and only here: a step cannot be handed in twice */
              let left = bringN(st); for (const id of bids(st.goal)) { const k = Math.min(left, invCount(p, id)); if (k > 0) { removeItem(p, id, k); left -= k; msg(p, 'You hand over ' + k + ' x ' + IT[id].name + '.', 'quest'); if (IT[id].vessel && IT[IT[id].vessel]) { if (addItem(p, IT[id].vessel, k)) dropGround(IT[id].vessel, k, p.x, p.y, p.id, 600); msg(p, 'You get your ' + IT[IT[id].vessel].name.toLowerCase() + ' back, empty.', 'quest'); } } }   /* she keeps the sap, not your bucket */
            }
            for (const [id, k] of withs(st)) { removeItem(p, id, k); msg(p, 'You hand over ' + k + ' x ' + IT[id].name + '.', 'quest'); }
            if (st.goal.bring || st.goal.with) ev({ e: 'inv', p: p.id });
            let done = st.complete && st.complete.length ? fill(st.complete, st) : (st.fold ? [] : ['Well done, traveller. Take this, you have earned it.']);
            if (st.fold && st.say && st.say.length) done = fill(st.say, st).concat(done);
            giveReward(p, q.again && st.againReward ? st.againReward : st.reward, n.name, Q.name);
            q.step++; q.n = 0; if (q.step > Q.steps.length && Q.repeat) q.yr = natureYear();
            const nx = Q.steps[q.step - 1];
            openStep(p, q, nx);
            if (!nx) {
              const pts = Q.story | 0;
              if (pts) { msg(p, 'You have earned ' + pts + ' Story point' + (pts === 1 ? '' : 's') + '.', 'quest'); ev({ e: 'story', p: p.id, q: qid, n: pts, total: storyPoints(p) }); }
              lines = done.concat(fill(Q.done, null));
            }
            else if (!open(nx)) { lines = done.concat(st.locked && st.locked.length ? fill(st.locked, nx) : ['Rest now. When the road to ' + nx.zone + ' opens, come and see me again.']); q.wait = 1; }
            else lines = done.concat(fill(nx.talk, nx));
            ev({ e: 'quest', p: p.id, q: qid, step: q.step }); addXp(p, 'speechcraft', SPEECH.xpQuestTalk || 250);
          } else { ensureStep(p, q, st); lines = st.progress && st.progress.length ? fill(st.progress, st) : [fill(st.talk, st)[0], 'So far: ' + counted(st) + ' of ' + need(st) + '.']; }
        }
        const cur = Q.steps[q.step - 1];
        let axe = null;
        if (cur && cur.axe && lines) {
          if (hasWoodTool(p)) lines = lines.concat(['You already carry an axe. Keep it, and cut the two pines with that.']);
          else axe = cur.axe;
        }
        let recall = 0, replay = 0;
        const bout = (Q.steps || []).find(s => s.summon);
        if (bout) {
          const live = S.mobs.some(m => m.summon && m.owner === p.id && !m.gone && !m.dead);
          const done = q.step > Q.steps.length;
          const here = cur && cur.summon;
          if ((done || here) && !live) { recall = 1; replay = done ? 1 : 0; }
        }
        ev({ e: 'dialog', p: p.id, npc: n.id, name: n.name, lines, axe, recall: recall ? qid : 0, replay, warn: recall ? 1 : 0 });
      }
    }
    function storyPoints(p) {
      let n = 0; const Qs = D.quests.quests || {};
      for (const id in Qs) { const Q = Qs[id], q = p && p.quests && p.quests[id]; if (q && q.step > (Q.steps || []).length) n += Q.story | 0; }
      return n;
    }
    function storyMax() {
      let n = 0; const Qs = D.quests.quests || {};
      for (const id in Qs) n += Qs[id].story | 0;
      return n;
    }
    function giveReward(p, r, giver, quest) {
      if (!r) return;
      if (Array.isArray(r)) { for (const x of r) giveReward(p, x, giver, quest); return; }   /* several things at once */
      { const m = /^([a-z0-9_]+):(\d+)$/.exec(r); if (m && IT[m[1]]) {   /* "id:n": n of one thing (fifteen bikwak) */
        const id = m[1], k = +m[2]; if (addItem(p, id, k)) dropGround(id, k, p.x, p.y, p.id, 600);   /* what does not fit lies at your feet */
        msg(p, (giver || 'You are given') + ' gives you: ' + k + ' x ' + IT[id].name + '.', 'quest'); ev({ e: 'inv', p: p.id }); return; } }
      if (r.indexOf('flag:') === 0) {   /* a blessing on the character, not an item: nothing to carry, trade or mint */
        const k = r.slice(5), F = FLAGS[k]; if (!F) return;
        p.flags = p.flags || {}; if (!p.flags[k]) p.flags[k] = S.t || 1;
        msg(p, 'You receive ' + F.name + '.' + (F.desc ? ' ' + F.desc : ''), 'quest'); ev({ e: 'flag', p: p.id, flag: k }); return;
      }
      /* 2026-10-04: "anytime an item is awarded after a quest, it should be its own collection" - the engine passes this
         on with the deposit and the Bank mints the reward into the collection named after the quest */
      if (IT[r] && quest && !IT[r].bound) ev({ e: 'reward', p: p.id, id: r, collection: 'ASHVALE ' + quest });   /* a bound thing is never minted */
      if (r.indexOf('xp:') === 0) { const [, sk, n] = r.split(':'); addXp(p, sk, (+n) * 10); msg(p, 'You gain ' + n + ' ' + cap(sk) + ' XP.', 'quest'); return; }
      if (IT[r]) { if (addItem(p, r, 1)) dropGround(r, 1, p.x, p.y, p.id, 600); msg(p, (giver || 'You are given') + ' gives you: ' + IT[r].name + '.', 'quest'); ev({ e: 'inv', p: p.id }); }
    }
    function topUp(p, q, st) {
      if (!st || !st.kit) return;
      const left = Math.max(0, (st.goal.n == null ? 1 : st.goal.n) - (q.n | 0));
      for (const id in st.kit) {
        if (!IT[id]) continue;
        const want = Math.min(st.kit[id] | 0, left);
        const have = invCount(p, id);
        if (have < want) addItem(p, id, want - have);
      }
      ev({ e: 'inv', p: p.id });
    }
    function hasWoodTool(p) {
      return p.inv.concat(Object.values(p.eq || {})).some(s => s && IT[s.id] && IT[s.id].tool === 'woodcutting');
    }
    function fellStumps(q, st) {
      if (!st || !st.stumps || st.chop) return;
      const sown = q.sown || [];
      for (const c of st.stumps) {
        const x = c[0] | 0, y = c[1] | 0;
        if (sown.some(s => s[0] === x && s[1] === y)) continue;
        const i = idx(x, y), nd = nodeAt(i);
        if (!nd || !RU.nodes[nd.kind] || RU.nodes[nd.kind].skill !== 'woodcutting' || S.dep[i]) continue;
        S.dep[i] = FOREVER; ev({ e: 'deplete', node: i, x, y, forever: 1 });
      }
    }
    function summonFor(p, q, st, opts) {
      if (!st || !st.summon) return 0;
      opts = opts || {};
      if (st.pray && lv(p, 'prayer') < st.pray) { msg(p, 'Your Prayer is not high enough for what he would call. It must be at least ' + st.pray + '.', 'warn'); return 0; }
      const home = (st.home || [p.x, p.y, 50]).slice();
      if (!home[2]) home[2] = 50;
      let n = 0;
      for (const sp of st.summon) {
        const need = (st.goal.kills && st.goal.kills[sp.m]) || 1;
        if (!opts.replay && ((q.kn && q.kn[sp.m]) | 0) >= need) continue;
        for (let i = S.mobs.length - 1; i >= 0; i--) { const old = S.mobs[i]; if (old.summon && old.owner === p.id && old.key === sp.m && (old.gone || old.dead)) S.mobs.splice(i, 1); }
        if (S.mobs.some(m => m.summon && m.owner === p.id && m.key === sp.m && !m.gone && !m.dead)) continue;
        const md = MON[sp.m]; if (!md) continue;
        const uid = S.uid++;
        const mob = { uid, key: sp.m, x: sp.x, y: sp.y, sx: sp.x, sy: sp.y, hp: md.hp, tgt: p.id, atk: 0, dead: 0, back: 0, face: 2, step: 0, zone: M.zoneAt(sp.x, sp.y),
          carry0: sp.carry || null, carry: sp.carry ? Object.assign({}, sp.carry) : null, summon: 1, owner: p.id, home: home };
        S.mobs.push(mob); ev({ e: 'mobadd', mob: uid }); n++;
      }
      if (n) msg(p, 'They step out of the wind. Stay within fifty tiles of the rope, and do not fall.', 'warn');
      return n;
    }
    function dismissSummon(m) {
      if (m.gone) return;
      m.gone = 1; m.dead = S.t || 1; m.hp = 0; m.dropAt = 0; m.tgt = 0;
      ev({ e: 'gone', mob: m.uid });
      const own = S.players[m.owner];
      if (own && !own.summonBye) { own.summonBye = 1; msg(own, 'They vanish. A death, or fifty tiles from the rope, undoes the call. Ask again if you want them back.', 'warn'); }
    }
    function broughtBySearch(p, id) {
      for (const n of M.npcs) {
        const s = n && n.search;
        if (!s || !s.flag || !hasFlag(p, s.flag)) continue;
        const items = Array.isArray(s.items) ? s.items : [];
        if (items.some(it => (it && (it.id || it)) === id)) return true;
      }
      return false;
    }
    function stampBring(p, q, st) {
      q.pre = {};
      if (!st || !st.goal || st.goal.bring == null) return;
      const ids = (Array.isArray(st.goal.bring) ? st.goal.bring : [st.goal.bring]).filter(id => IT[id]);
      for (const id of ids) q.pre[id] = broughtBySearch(p, id) ? 0 : invCount(p, id);
    }
    function openStep(p, q, st) { if (!st || !q) return; if (st.goal && st.goal.wait != null && q.tw !== q.step) { q.t0 = natureHours(); q.tw = q.step; } topUp(p, q, st); fellStumps(q, st); learnFlag(p, st); stampBring(p, q, st); }   /* a wait starts the clock when its step opens */
    function learnFlag(p, st) {
      const k = st && st.flag;
      if (!k || !FLAGS[k] || hasFlag(p, k)) return;
      p.flags = p.flags || {}; p.flags[k] = S.t || 1;
      ev({ e: 'flag', p: p.id, flag: k });
      msg(p, 'You learn ' + FLAGS[k].name + '.' + (FLAGS[k].desc ? ' ' + FLAGS[k].desc : ''), 'quest');
    }
    function ensureStep(p, q, st) { if (!st || !q) return; topUp(p, q, st); fellStumps(q, st); learnFlag(p, st); }
    function isStump(x, y) { const i = idx(x, y); return isWood(x, y) && !!S.dep[i]; }
    const TOWN = {}; for (const z of ZINDEX) if (z.level === 'safe') TOWN[z.id] = 1;
    const GATES = [];
    for (const o of M.objects || []) {
      if (o.k === 'iwall') continue;
      if (o.door) GATES.push(o.door);
      else if (o.to) GATES.push([o.x, o.y]);
    }
    for (const z of ZINDEX) if (Array.isArray(z.surface)) GATES.push(z.surface);
    function plantBan(x, y) {
      const t = M.tileAt(x, y);
      if (t === 'p' || t === 'c') return 'A sapling will not take on a path.';
      const zid = M.zoneAt ? M.zoneAt(x, y) : null;
      if (zid && TOWN[zid]) return 'A sapling will not take inside a town.';
      for (const n of M.npcs) if (n.x != null && cheb(x, y, n.x | 0, n.y | 0) <= 10) return 'A sapling will not take within ten tiles of ' + (n.name || 'someone') + '.';
      for (const g of GATES) if (cheb(x, y, g[0], g[1]) <= 10) return 'A sapling will not take within ten tiles of an entrance.';
      return null;
    }
    function plantWhy(x, y) {
      if (M.insideAt && M.insideAt(x, y)) return 'Not indoors.';
      const t = M.tileAt(x, y);
      if (t === '~' || t === 'v' || t === 'B') return 'A sapling will not take in the water.';
      const i = idx(x, y);
      if (isStump(x, y)) return S.plants[i] ? 'Something is already planted there.' : plantBan(x, y);
      if (M.blocked(x, y) || nodeAt(i)) return 'That ground will not take a shoot.';
      if (S.plants[i]) return 'Something is already planted there.';
      return plantBan(x, y);
    }
    function plantJob(p) {
      for (const qid in p.quests) {
        const q = p.quests[qid], Q = D.quests.quests[qid], st = Q && Q.steps[q.step - 1];
        if (st && st.goal && st.goal.plant && (q.n | 0) < (st.goal.n == null ? 1 : st.goal.n)) return { q, Q, st, qid };
      }
      return null;
    }
    function isWood(x, y) {
      const nd = nodeAt(idx(x, y));
      return !!(nd && RU.nodes[nd.kind] && RU.nodes[nd.kind].skill === 'woodcutting');
    }
    function canReplant(p) {
      if (hasFlag(p, 'replant')) return true;
      const job = plantJob(p);
      return !!(job && job.st.goal && job.st.goal.plant === 'stump');
    }
    function isCleared(x, y) { return !!S.cleared[idx(x, y)]; }
    function stumpWhy(p, x, y) {
      if (!canReplant(p)) return null;
      if (S.plants[idx(x, y)]) return 'Something is already planted there.';
      return null;
    }
    function canPlant(p, x, y) {
      if (invCount(p, 'sapling') < 1) return false;
      const i = idx(x, y);
      if (S.plants[i]) return false;
      if (isWood(x, y) && !S.dep[i]) return false;
      if (isStump(x, y) || isCleared(x, y)) return canReplant(p) && !plantWhy(x, y);
      if (plantWhy(x, y)) return false;
      return true;
    }
    function takeSapling(p) {
      let slot = p.using && p.inv[p.using.slot] && p.inv[p.using.slot].id === 'sapling' ? p.using.slot : -1;
      if (slot < 0) for (let k = 0; k < p.inv.length; k++) if (p.inv[k] && p.inv[k].id === 'sapling') { slot = k; break; }
      if (slot < 0) return false;
      const s = p.inv[slot]; if (s.n > 1) s.n--; else p.inv[slot] = null;
      if (p.using && p.using.slot === slot && !p.inv[slot]) { p.using = null; ev({ e: 'using', p: p.id }); }
      return true;
    }
    function plantAt(p, x, y) {
      if (!canPlant(p, x, y)) { msg(p, (isWood(x, y) && !canReplant(p) ? 'You have not learned to set a shoot in a stump.' : null) || stumpWhy(p, x, y) || plantWhy(x, y) || 'That ground will not take a shoot.', 'warn'); return; }
      const job = plantJob(p), i = idx(x, y);
      const wasStump = isStump(x, y);
      if (wasStump) {
        if (M.clearTree) M.clearTree(x, y);
        delete S.dep[i]; delete S.fell[i];
        S.cleared[i] = 1;
        ev({ e: 'clear', x, y, node: i });
      }
      const cleared = isCleared(x, y);
      const onStump = wasStump || cleared;
      const near = job && job.st.near;
      const inGrove = !near || cheb(x, y, near[0], near[1]) <= (near[2] == null ? 16 : near[2]);
      const count = !!(job && ((job.st.goal.plant === 'stump' && onStump) || (job.st.goal.plant === 'open' && !onStump && inGrove)));
      if (!takeSapling(p)) return;
      const rec = { x, y, at: S.t, tile: M.tileAt(x, y), stump: 0, owner: p.id, grown: 0 };
      if (count) { rec.qid = job.qid; rec.step = job.q.step; rec.counted = 1; }
      S.plants[i] = rec;
      ev({ e: 'plant', x, y, p: p.id });
      if (!isAuth(zoneOf(x, y))) ev({ e: 'xplant', x, y, p: p.id });
      if (cleared) msg(p, 'You plant the sapling in the new grass. You can pick it up for one hour. After that, it grows into a tree and stays.');
      else msg(p, 'You plant the sapling in the grass. You can pick it up for one hour. After that, it grows into a tree and stays.');
      if (job && rec.counted) {
        job.q.n = (job.q.n | 0) + 1;
        msg(p, job.Q.name + ': ' + job.q.n + ' / ' + (job.st.goal.n || 1) + ' planted.', 'quest');
      }
      ev({ e: 'inv', p: p.id });
    }
    function unplantAt(p, x, y) {
      const i = idx(x, y), pl = S.plants[i];
      if (!pl || pl.grown || S.t - pl.at >= 6000) { msg(p, 'The roots have taken. It will not come back up.', 'warn'); return; }
      delete S.plants[i];
      addItem(p, 'sapling', 1);
      if (pl.qid && p.quests[pl.qid]) {
        const q = p.quests[pl.qid], Q = D.quests.quests[pl.qid], st = Q && Q.steps[q.step - 1];
        if (pl.counted && q.step === pl.step && st && st.goal && st.goal.plant && (q.n | 0) > 0) q.n--;
        if (pl.stump && q.sown) q.sown = q.sown.filter(s => s[0] !== x || s[1] !== y);
      }
      ev({ e: 'unplant', x, y, p: p.id }); ev({ e: 'inv', p: p.id });
      if (!isAuth(zoneOf(x, y))) ev({ e: 'xunplant', x, y, p: p.id });
      msg(p, 'You pick the sapling back up.');
    }
    function hostPlant(x, y, pid) {
      if (!inMap(x, y) || !isAuth(zoneOf(x, y))) return;
      const i = idx(x, y);
      if (S.plants[i] || plantWhy(x, y)) return;
      if (isWood(x, y) && !S.dep[i]) return;
      S.plants[i] = { x, y, at: S.t, tile: M.tileAt(x, y), stump: 0, owner: pid || 0, grown: 0 };
      ev({ e: 'plant', x, y, p: pid || 0 });
    }
    function hostUnplant(x, y) {
      if (!inMap(x, y) || !isAuth(zoneOf(x, y))) return;
      const i = idx(x, y), pl = S.plants[i];
      if (!pl || pl.grown || S.t - pl.at >= PLANT_HOUR) return;
      delete S.plants[i];
      ev({ e: 'unplant', x, y });
    }
    function plantSnap(area) {
      const rows = [];
      for (const k in S.plants) {
        const pl = S.plants[k];
        if (!pl || (area && zoneOf(pl.x, pl.y) !== area)) continue;
        rows.push([pl.x, pl.y, Math.max(0, S.t - pl.at), pl.grown ? 1 : 0]);
      }
      return rows;
    }
    function acceptPlant(x, y, age, grown) {
      if (!inMap(x, y) || isAuth(zoneOf(x, y))) return;
      const i = idx(x, y);
      if (grown) {
        if (S.plants[i] && S.plants[i].grown) return;
        if (M.growTree) M.growTree(x, y);
        S.plants[i] = { x, y, at: S.t - (age | 0), tile: '.', stump: 0, owner: 0, grown: 1 };
        ev({ e: 'grow', x, y, node: i });
        return;
      }
      if (S.plants[i]) return;
      S.plants[i] = { x, y, at: S.t - (age | 0), tile: M.tileAt(x, y), stump: 0, owner: 0, grown: 0 };
      ev({ e: 'plant', x, y });
    }
    function acceptUnplant(x, y) {
      if (!inMap(x, y) || isAuth(zoneOf(x, y))) return;
      const i = idx(x, y);
      if (!S.plants[i] || S.plants[i].grown) return;
      delete S.plants[i];
      ev({ e: 'unplant', x, y });
    }

    // ---------------- gathering
    function nodeDef(n) { return RU.nodes[n.kind]; }
    const FOREVER = 1e15, PLANT_HOUR = 6000;   /* one hour: 6000 ticks of 0.6 s */
    function setFelled(cells) {   /* trees other players felled, from the @ashvale Bank's shared list: down for good here too */
      let n = 0; for (const c of cells || []) { const x = c[0] | 0, y = c[1] | 0; if (!inMap(x, y)) continue; const i = idx(x, y), nd = nodeAt(i); if (!nd || !RU.nodes[nd.kind] || RU.nodes[nd.kind].skill !== 'woodcutting' || S.dep[i] >= FOREVER) continue; S.dep[i] = FOREVER; ev({ e: 'deplete', node: i }); n++; }
      return n;
    }
    function gatherTick(p, n) {
      const nd = nodeDef(n), i = idx(n.x, n.y);
      if (S.dep[i]) { p.act = null; p.skilling = null; return; }
      if (n.kind === 'altar') {
        p.face = faceTo(p.x, p.y, n.x, n.y); p.act = null; p.skilling = null;
        if (n.chapel === 'ancient') {
          if (questFinished(p, 'even_guard')) {
            const full = Math.round(maxPp(p) * 1.2);
            if ((p.pp | 0) >= full) { msg(p, 'The altar has nothing more to give.'); return; }
            p.pp = full; p.pd = 0;
            msg(p, 'You kneel at the Ancient Chapel. Prayer fills past what you can hold: ' + p.pp + '.');
            ev({ e: 'pray', p: p.id, altar: 1, x: n.x, y: n.y }); return;
          }
          const lines = [
            'A mighty headache. It sits behind the eyes and will not blink.',
            'When it eases, a path is carved there. Forty-nine paces south. Thirty-eight paces west. The tile reads 197, -51.',
            'The altar will not have you. You are out of balance.'
          ];
          if (questFinished(p, 'even_grove')) lines.push('The carving is still there. When the Red Pyre is known, the one on the rope will teach the harder balance.');
          if (!p.quests.even_grove && D.quests.quests.even_grove) {
            ev({ e: 'dialog', p: p.id, name: 'You', lines: lines, offer: 'even_grove' });
            return;
          }
          ev({ e: 'dialog', p: p.id, name: 'You', lines: lines });
          return;
        }
        if ((p.pp | 0) >= maxPp(p)) { msg(p, 'You already have full Prayer points.'); return; }
        p.pp = maxPp(p); p.pd = 0; msg(p, 'You kneel and pray at the altar. Your Prayer points are restored.');
        ev({ e: 'pray', p: p.id, altar: 1, x: n.x, y: n.y }); return;
      }
      if (n.kind === 'range' || n.kind === 'fire') {
        /* FIRE MIXES (rules.items.fireMix, 2026-10-09): what is made at a fire from several things at once, before any
           cooking - apaakozigan (kinnikinnick): two red willow bark and one asemaa (tobacco) make three */
        const mix = ((RU.items || {}).fireMix || []).find(m => Object.keys(m.take).every(k => invCount(p, k) >= m.take[k]) && Object.keys(m.give).every(k => canAdd(p, k, m.give[k])));
        if (mix) {
          p.skilling = 'cook'; p.face = faceTo(p.x, p.y, n.x, n.y);
          if (!p.gT) { p.gT = S.t + nd.speed; return; }
          if (S.t < p.gT) return;
          p.gT = 0; p.act = null; p.skilling = null;
          for (const k in mix.take) removeItem(p, k, mix.take[k]); for (const k in mix.give) addItem(p, k, mix.give[k]);
          for (const k in mix.xp || {}) addXp(p, k, mix.xp[k]);
          msg(p, mix.say || 'You make ' + Object.keys(mix.give).map(k => mix.give[k] + ' x ' + IT[k].name).join(' and ') + '.');
          ev({ e: 'inv', p: p.id }); ev({ e: 'gather', p: p.id, node: i, ok: true }); return;
        }
        const raw = p.inv.findIndex(s => s && IT[s.id].cooks);
        if (raw < 0) { msg(p, 'You have nothing to cook. Raw fish come from the fishing spots by the lake.'); p.act = null; p.skilling = null; return; }
        p.skilling = 'cook'; p.face = faceTo(p.x, p.y, n.x, n.y);
        if (!p.gT) { p.gT = S.t + nd.speed; return; }
        if (S.t < p.gT) return;
        p.gT = S.t + nd.speed;
        const rd = IT[p.inv[raw].id]; p.inv[raw] = null;
        const burnPct = rd.burns === rd.cooks ? 0 : Math.max(0, 40 - 4 * (lv(p, 'cooking') - rd.cookReq)) + (nd.burnBonus || 0);   /* an open fire burns a little more often; sap only boils down */
        const back = rd.vessel && IT[rd.vessel] && !(IT[rd.cooks] && IT[rd.cooks].vessel) ? rd.vessel : null;   /* the bucket comes back when what is made is not in it (syrup boiled to candy) */
        if (back) addItem(p, back, 1);
        if (R.int(100) < burnPct) { addItem(p, rd.burns, 1); msg(p, 'You accidentally burn the ' + IT[rd.cooks].name.toLowerCase() + '.'); }
        else { addItem(p, rd.cooks, 1); addXp(p, 'cooking', rd.cookXp * 10); msg(p, (rd.burns === rd.cooks ? 'You boil it down: ' + IT[rd.cooks].name + '.' : 'You cook the ' + IT[rd.cooks].name.toLowerCase() + '.') + (back ? ' Your ' + IT[back].name.toLowerCase() + ' is empty again.' : '')); creditCook(p, rd.cooks); }
        if (rd.burns === rd.cooks) { p.act = null; p.skilling = null; }   /* sap and syrup: one boil a click, so the syrup is not boiled on into candy */
        ev({ e: 'gather', p: p.id, node: i, ok: true });
        return;
      }
      /* a birch: peel its bark when asked, or always without an axe; a maple: tap it when asked, or without an axe but with an
         empty bucket (2026-10-08). A yield may want a tool in the pack (`tool`: the bark wants a blade - a tomahawk or any
         axe, 2026-10-09) */
      if (nd.peel && (nd.peelOnly || p.act && p.act.peel || !hasWoodTool(p))) {   /* peelOnly: a shrub that only gives bark (miskwaabiimizh, red willow) */
        if (nd.peel.tool && !p.inv.concat(Object.values(p.eq || {})).some(s => s && IT[s.id] && IT[s.id].tool === nd.peel.tool)) { msg(p, nd.peel.noTool || 'You need a tool for that.', 'warn'); p.act = null; p.skilling = null; return; }
        return yieldTick(p, n, i, nd.peel, 'peel');
      }
      if (nd.tap && (p.act && p.act.tap || !hasWoodTool(p))) return yieldTick(p, n, i, nd.tap, 'tap');
      const skill = nd.skill, L = lv(p, skill), req = n.req == null ? nd.req : n.req, want = n.tool || null;
      if (L < req) { msg(p, 'You need a ' + cap(skill) + ' level of ' + req + ' to do that.', 'warn'); p.act = null; return; }
      const toolSlot = p.inv.concat(Object.values(p.eq || {})).find(s => s && IT[s.id].tool === skill && (!want || s.id === want)), tool = !!toolSlot || (isHawk(p) && skill === 'fishing') || !!nd.bare;   /* a hawk swoops for fish, no tool; a wielded tomahawk chops; `bare`: by hand (flint, obsidian) */
      p.toolId = toolSlot ? toolSlot.id : null;   /* what is in the hand while skilling (rod, pot, net...): drawn by the engine */
      if (!tool) { msg(p, want ? 'You need a ' + IT[want].name.toLowerCase() + ' for this spot. The General Store sells them.' : skill === 'woodcutting' ? 'You need a hatchet to chop this tree. The General Store sells them.' : skill === 'mining' ? 'You need a pickaxe to mine this rock. The General Store sells them.' : 'You need a small fishing net. The General Store sells them.', 'warn'); p.act = null; return; }
      if (!canAdd(p, n.item, 1)) { msg(p, 'Your inventory is too full to hold any more.', 'warn'); p.act = null; p.skilling = null; return; }
      p.skilling = skill === 'woodcutting' ? 'chop' : skill === 'mining' ? 'mine' : 'fish';
      p.face = faceTo(p.x, p.y, n.x, n.y);
      if (!p.gT) harvestHint(p, n.x, n.y);
      if (!p.gT) { p.gT = S.t + nd.speed; msg(p, skill === 'woodcutting' ? 'You swing your ' + (toolSlot ? IT[toolSlot.id].name.toLowerCase() : 'hatchet') + ' at the tree.' : skill === 'mining' ? (nd.bare ? 'You work at the bank with your hands.' : 'You swing your pickaxe at the rock.') : want === 'lobster_pot' ? 'You bait the pot and drop it in.' : want ? 'You cast your line out and wait.' : 'You cast out your net...'); return; }
      if (S.t < p.gT) return;
      p.gT = S.t + nd.speed;
      const pct = Math.max(8, Math.min(92, 30 + 2 * (L - Math.max(req, nd.hard || 0))));   /* hard: a tree anyone may cut that bites like a harder one (a maple) */
      if (R.int(100) >= blessRoll(p, n.x, n.y, pct)) { ev({ e: 'gather', p: p.id, node: i, ok: false }); return; }
      /* a lake gives back what sank in it (2026-10-07): the more lies on its bottom, the likelier a cast brings one up
         instead of a fish - 3 % for one thing, 2 % more for each other, at most 40 % */
      if (skill === 'fishing') {
        const lk = lakeKey(n.x, n.y) || [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => lakeKey(n.x + dx, n.y + dy)).find(Boolean), cnt = lk ? sunkIn(lk) : 0;
        if (cnt && R.int(100) < Math.min(40, 1 + 2 * cnt)) {
          const pool = S.ground.filter(q => q.sunk === lk && (isAuth(zoneOf(q.x, q.y)) || q.bank != null)), g = pool.length ? pool[R.int(pool.length)] : null;
          if (g && canAdd(p, g.id, g.n)) {
            const left = addItem(p, g.id, g.n); addXp(p, skill, n.xp || nd.xp);
            ev({ e: 'take', p: p.id, g: g.uid, id: g.id, n: g.n - left, x: g.x, y: g.y, own: g.from === p.id ? 1 : 0, fished: 1 });
            if (left) g.n = left; else { S.ground.splice(S.ground.indexOf(g), 1); if (g.bank != null) BANK_GONE.add(g.bank); ev({ e: 'vanish', g: g.uid, x: g.x, y: g.y }); }
            msg(p, 'Something heavy on the line... you haul up ' + (g.n - left > 1 ? (g.n - left) + ' x ' : '') + IT[g.id].name + ' from the bottom of the lake!', 'quest');
            ev({ e: 'gather', p: p.id, node: i, ok: true, item: g.id });
            return;
          }
        }
      }
      addItem(p, n.item, 1); addXp(p, skill, n.xp || nd.xp);
      msg(p, nd.say ? nd.say : skill === 'woodcutting' ? 'You get some ' + IT[n.item].name.toLowerCase() + '.' : skill === 'mining' ? 'You manage to mine some ' + IT[n.item].name.split(' ')[0].toLowerCase() + '.' : 'You catch some ' + IT[n.item].name.toLowerCase().replace('raw ', '') + '.');
      ev({ e: 'gather', p: p.id, node: i, ok: true, item: n.item });
      if (nd.deplete && R.int(nd.deplete) === 0) {
        S.dep[i] = nd.regrow < 0 ? FOREVER : S.t + nd.regrow;
        if (nd.skill === 'woodcutting') S.fell[i] = S.t;
        ev({ e: 'deplete', node: i, p: p.id, x: n.x, y: n.y, forever: nd.regrow < 0 ? 1 : 0 });
        if (nd.skill === 'woodcutting' && canReplant(p)) msg(p, 'A stump is left. A sapling can go there.', 'quest');
        p.act = null; p.skilling = null;
      }   /* regrow < 0: felled for good (2026-10-05) */
    }
    /* ---------------- firemaking (the operator: "drop some wood, start a camp fire and cook") ---------------- */
    const FIRE = RU.fires || { lightTicks: 3, basePct: 50, pctPerLevel: 2, maxPct: 95 };
    function lightTick(p, a) {
      const s0 = p.inv[a.slot];
      if (!s0 || s0.id !== a.id) { p.act = null; return; }
      const d = IT[s0.id];
      const fm = p.inv.find(q => q && IT[q.id].tool === 'firemaking');   /* a tinderbox, or biiwaanag (flint): never used up */
      if (!fm) { msg(p, (homeOf(p) || {}).noFire || 'You need a tinderbox to light a fire. Tam sells them.', 'warn'); p.act = null; return; }
      if (lv(p, 'firemaking') < d.fireReq) { msg(p, 'You need a Firemaking level of ' + d.fireReq + ' to burn ' + d.name.toLowerCase() + '.', 'warn'); p.act = null; return; }
      if (S.fires.some(f => f.x === p.x && f.y === p.y) || M.insideAt(p.x, p.y)) { msg(p, "You can't light a fire here.", 'warn'); p.act = null; return; }
      p.skilling = 'light';
      if (!p.gT) { p.gT = S.t + FIRE.lightTicks; msg(p, 'You strike your ' + IT[fm.id].name.toLowerCase() + (IT[fm.id].english ? ' (' + IT[fm.id].english + ')' : '') + '...'); return; }
      if (S.t < p.gT) return;
      p.gT = S.t + FIRE.lightTicks;
      const pct = Math.min(FIRE.maxPct, FIRE.basePct + FIRE.pctPerLevel * (lv(p, 'firemaking') - d.fireReq)) - Math.round(100 * wx(zoneOf(p.x, p.y), 'fireFail'));   /* rain */
      if (R.int(100) >= pct) { ev({ e: 'gather', p: p.id, ok: false }); return; }
      p.inv[a.slot] = null; p.act = null; p.skilling = null;
      addXp(p, 'firemaking', (d.fireXp || 0) * 10); creditLight(p, s0.id);
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
    /* RICING (2026-10-07): the knocker rides where the poler takes the canoe; every few ticks, from a clump of manoomin
       within reach that has not been knocked lately, a handful of rice drops in. A clump rests a while once it is knocked. */
    const RICE_CD = 300, RICED = {};
    function rideTick(p) {
      const t = S.players[p.ride];
      if (!t || t.boat !== 1 || t.dead) { if (++p.rideMiss < 30) return; leaveRide(p, null); msg(p, 'Your partner has left the canoe, so you climb out onto the bank.', 'info'); return; }   /* a few ticks' grace: a late message is not a landing */
      p.rideMiss = 0;
      p.x = t.x; p.y = t.y; p.path = []; p.act = null;
      if (!p.knock) { p.knocking = false; return; }   /* paddling along: rice only with the knockers in the bow and the push pole in the stern */
      if (S.t % 3) return;
      let got = null;
      for (const o of M.objects) if (o.k === 'rice' && cheb(o.x, o.y, p.x, p.y) <= 2 && !(RICED[o.x + ',' + o.y] > S.t)) { got = o; break; }
      /* ricing only in its season (2026-10-07: "only harvestable in late August to early October"): out of it the sticks
         knock nothing loose */
      if (got && SEASONW && SEASONW.rice === false) {
        p.knocking = false;
        if (!(p.riceSaid > S.t)) { p.riceSaid = S.t + 200; msg(p, SEASONW.riceLate ? 'The manoomin has already dropped its grain. Ricing time is mid August to early October.' : 'The manoomin is not ripe yet. Ricing time is mid August to early October.', 'info'); }
        return;
      }
      p.knocking = !!got;
      if (!got) return;
      RICED[got.x + ',' + got.y] = S.t + RICE_CD;
      harvestHint(p, p.x, p.y);
      if (blessExtra(p, p.x, p.y)) addItem(p, 'wild_rice', 1);   /* blessed water: an extra handful */
      if (addItem(p, 'wild_rice', 1)) { msg(p, 'Your pack is full: no room for more manoomin (wild rice).', 'warn'); return; }
      ev({ e: 'knock', p: p.id }); p.dirtyInv = 1;
    }
    function leaveRide(p, at) {   /* out of the bow onto the bank: where pointed, else the nearest dry ground */
      p.boat = 0; p.ride = null; p.knocking = false; p.knock = false; ev({ e: 'boat', p: p.id, on: 0 });
      if (at) { p.x = at[0]; p.y = at[1]; return; }
      for (let r = 1; r <= 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = p.x + dx, y = p.y + dy; if (inMap(x, y) && !isWet(x, y) && !M.blocked(x, y)) { p.x = x; p.y = y; return; }
      }
    }
    /* out of the canoe at the shore: onto the dry tile next to it that is nearest where you pointed, then walk on there */
    /* LANDED CANOES (2026-10-07: "the canoe despawns when the player gets out ... it leaves the player stranded. Landed canoes
       should persist for one game year"): where you step out, the canoe stays, afloat at the bank, for anyone to take again. The
       engine tells the @ashvale Bank (it keeps them a game year) and puts down the ones the Bank lists near you (setBoats). */
    const BOATS = new Map();   /* 'x,y' -> {x, y, face} */
    /* a canoe left at the bank lies along it (2026-10-07: "parked parallel with the river bank automatically"): the bank's line is
       across the way the land lies from it; of the eight headings, the one nearest that line, the end nearest the way it was going */
    function bankFace(x, y, face) {
      let nx = 0, ny = 0; for (let k = 0; k < 8; k++) { const [dx, dy] = DIRS[k]; if (!isWet(x + dx, y + dy)) { const l = Math.hypot(dx, dy); nx += dx / l; ny += dy / l; } }
      if (!nx && !ny) return face | 0;
      const tx = -ny, ty = nx, [hx, hy] = DIRS[face | 0] || DIRS[0], sg = tx * hx + ty * hy < 0 ? -1 : 1; let best = face | 0, bd = -2;
      for (let k = 0; k < 8; k++) { const [dx, dy] = DIRS[k], l = Math.hypot(dx, dy), d = (dx * tx + dy * ty) * sg / (l * Math.hypot(tx, ty)); if (d > bd) { bd = d; best = k; } }
      return best;
    }
    function landBoat(x, y, face, by) { const k = x + ',' + y; if (BOATS.has(k)) return; const f = by ? bankFace(x, y, face) : face | 0; BOATS.set(k, { x, y, face: f }); ev({ e: 'boatland', x, y, face: f, by: by || null }); }
    /* the landing gives no new canoe while three or more are left at the banks within 500 feet of it (2026-10-07) */
    const DOCK_R = 152, DOCK_MAX = 3;
    function dockFull(x, y) { let n = 0; for (const b of BOATS.values()) if (Math.hypot(b.x - x, b.y - y) <= DOCK_R && ++n >= DOCK_MAX) return true; return false; }
    function takeBoat(x, y, by) { const k = x + ',' + y; if (!BOATS.has(k)) return false; BOATS.delete(k); ev({ e: 'boatgone', x, y, by: by || null }); return true; }
    function setBoats(box, list) {   /* the Bank's word for a rectangle: these lie there, the rest in it are gone */
      const want = new Set();
      for (const r of list || []) { const x = r[0] | 0, y = r[1] | 0; want.add(x + ',' + y); if (!BOATS.has(x + ',' + y) && inMap(x, y)) landBoat(x, y, r[2] | 0, null); }
      const [x0, y0, x1, y1] = box || [0, 0, -1, -1];
      for (const b of Array.from(BOATS.values())) if (b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1 && !want.has(b.x + ',' + b.y)) takeBoat(b.x, b.y, null);
    }
    function disembark(p) {
      const T = p.land; let best = null, bd = 1e9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx, y = p.y + dy; if ((!dx && !dy) || !inMap(x, y) || isWet(x, y) || M.blocked(x, y)) continue;
        const d = (x - T[0]) ** 2 + (y - T[1]) ** 2; if (d < bd) { bd = d; best = [x, y]; }
      }
      if (!best) { if (p.land) msg(p, "There's no place to land here.", 'warn'); p.land = null; return; }
      landBoat(p.x, p.y, p.face, p.id);   /* the canoe stays where you left it */
      p.boat = 0; p.land = null; p.x = best[0]; p.y = best[1]; p.moved = 1;
      ev({ e: 'boat', p: p.id, on: 0 }); msg(p, 'You step out of the canoe onto the bank. It will wait for you here.');
      if (best[0] !== T[0] || best[1] !== T[1]) { BOAT = false; p.path = findPath(p.x, p.y, (x, y) => x === T[0] && y === T[1], T[0], T[1]); }
    }
    /* A CANOE DOES NOT SPIN (2026-10-07: "It should have to travel forward and backward in arcs to turn around"): it keeps a
       heading (p.face). A step within an eighth of a turn of it is taken going forward, turning that eighth; a step straight
       behind is taken in reverse, the heading kept; anything sharper is an arc - turn an eighth while moving forward (or, with
       no water ahead, back), then find the way on from there. After a few arcs in a tight spot it may pivot once. */
    const OCT = [0, 2, 4, 6, 1, 3, 5, 7], OCT_D = [0, 4, 1, 5, 2, 6, 3, 7];   /* DIRS index -> eighths clockwise from north, and back */
    function canoeStep(p, nx, ny) {
      const want = faceTo(p.x, p.y, nx, ny), h = OCT[p.face | 0], w = OCT[want], d = ((w - h + 12) % 8) - 4;
      if (Math.abs(d) <= 1) { p.face = want; p.x = nx; p.y = ny; p.path.shift(); p.arcs = 0; return true; }
      if (Math.abs(d) === 4) { p.x = nx; p.y = ny; p.path.shift(); return true; }   /* straight back: in reverse */
      const goal = p.path[p.path.length - 1], gx = kx(goal), gy = ky(goal);
      if ((p.arcs | 0) >= 6) { p.face = want; p.x = nx; p.y = ny; p.path.shift(); p.arcs = 0; return true; }   /* boxed in: pivot once */
      const nh = OCT_D[(h + Math.sign(d) + 8) % 8], [fx, fy] = DIRS[nh], [bx, by] = DIRS[OCT_D[(h - Math.sign(d) + 12) % 8]];
      p.arcs = (p.arcs | 0) + 1;
      if (canStep(p.x, p.y, fx, fy)) { p.face = nh; p.x += fx; p.y += fy; }               /* arc forward, turning toward it */
      else if (canStep(p.x, p.y, -bx, -by)) { p.face = OCT_D[(h - Math.sign(d) + 8) % 8]; p.x -= bx; p.y -= by; }   /* no room ahead: back up, the stern swinging the other way */
      else { p.face = want; p.x = nx; p.y = ny; p.path.shift(); return true; }
      p.path = findPath(p.x, p.y, (x, y) => x === gx && y === gy, gx, gy, 400);
      return true;
    }
    function stepPath(p) {
      if (!p.path.length) { p.moved = 0; return; }
      if (p.pfx && p.pfx.bind > S.t) { p.moved = 0; if (!p._bindMsg || S.t - p._bindMsg > 4) { p._bindMsg = S.t; msg(p, 'Shadowy chains hold your feet!', 'warn'); } return; }
      const bd = p.burden || 0;
      if (bd === 2) { p.moved = 0; if (!p._frozeMsg || S.t - p._frozeMsg > 8) { p._frozeMsg = S.t; msg(p, "You can't move: you are carrying far too much. Drop something.", 'warn'); } return; }
      if (bd === 1 && (S.t & 1)) { p.moved = 0; return; }   /* overburdened: a step every other tick, no running */
      if (bd === 1 && isHawk(p) && S.t % HK.groundEvery) { p.moved = 0; return; }   /* an overburdened hawk walks: half as fast again */
      if (p.runNow && p.path.length > 1 && (bd || !p.energy)) { p.runNow = false; msg(p, bd ? 'You are carrying too much to run.' : 'You are out of run energy: walking.', 'warn'); }
      const crew = p.boat === 1 && BOAT && Object.values(S.players).some(q => q.boat === 2 && q.ride === p.id && !q.dead);   /* two paddling */
      let steps = FLY ? Math.min(4, p.path.length) : p.boat === 1 && BOAT ? Math.min(p.energy > 0 ? (crew ? 8 : 6) : 2, p.path.length) : p.runNow && p.energy > 0 && p.path.length > 1 ? 2 : 1;   /* a canoe goes three times as fast as a run (2026-10-07), for free */   /* a hawk flies twice as fast as a run, for free (2026-10-04) */
      if (steps === 2) { const rf = wx(zoneOf(p.x, p.y), 'run'); if (rf < 1) { p.runAcc = (p.runAcc || 0) + Math.round(rf * 1000); if (p.runAcc >= 1000) p.runAcc -= 1000; else steps = 1; } }   /* snow: deep going */
      let moved = 0;
      for (let s = 0; s < steps && p.path.length; s++) {
        const n = p.path[0], nx = kx(n), ny = ky(n);
        if (!canStep(p.x, p.y, nx - p.x, ny - p.y)) { p.path = []; break; }
        if (p.boat === 1 && BOAT) { if (canoeStep(p, nx, ny)) moved++; else break; continue; }
        p.face = faceTo(p.x, p.y, nx, ny); p.x = nx; p.y = ny; p.path.shift(); moved++;
      }
      p.moved = moved;
      /* PADDLING (2026-10-07): three times a run alone, four times with a second paddler, and two share the work - half the
         run energy each tick; out of energy, the canoe goes at a run */
      if (p.boat === 1 && moved > 2 && !FLY) { addXp(p, 'dexterity', 2 * (DEX.xpPerRunTile || 2)); p.energy = Math.max(0, p.energy - Math.floor((crew ? 0.5 : 1) * 60 * (1000 - Math.min(DEX.drainMaxPermille || 400, (DEX.drainPerLevelPermille || 5) * lv(p, 'dexterity'))) / 1000)); if (!p.energy) msg(p, 'Your arms are spent: the canoe slows to an easy pace.', 'warn'); }
      if (moved === 2 && !FLY && !p.boat) { addXp(p, 'dexterity', 2 * (DEX.xpPerRunTile || 2)); p.energy = Math.max(0, p.energy - Math.floor(60 * (1000 - Math.min(DEX.drainMaxPermille || 400, (DEX.drainPerLevelPermille || 5) * lv(p, 'dexterity'))) / 1000)); if (!p.energy) { p.run = false; msg(p, 'You are out of run energy.', 'warn'); ev({ e: 'run', p: p.id }); } }
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
    /* town guards (2026-10-07): combat 33, they do not start a fight. Hit one and every guard of that
       watch draws steel. At dusk they walk the town lamps and torches alight; at dawn they put the lamps out.
       One guard walks the cobbles from Ashvale to Saltmere and tends the lamps along that road.
       Talk is the ordinary greeting. The same handful of remarks comes round again, guard after guard. */
    const WATCH_SAY = [
      ['We keep the peace. When the day goes we light the lamps and the torches. When it comes back we put the lamps out.', 'Walk easy after dark. The lamps are ours to tend.'],
      ['Strike one of us and the whole watch answers. That is the only warning I give.', 'The square is for walking, not for swords.'],
      ['Tam has bread if you are empty. Garrick has steel if you are not.', 'I do not sell either. I stand here.'],
      ['The wolves in Whisperwood come down tidy, one lamb at a time. Maren does not like tidy wolves.', 'If you go, go with a hatchet and a reason.'],
      ['Rain gets in at the collar. It always has.', 'A dry watch is a story the older men tell.'],
      ['The well is Maren\'s. The lamps are ours. Try not to confuse the two after dark.', 'People do.'],
      ['There is a dog that belongs to nobody and sleeps by the armoury.', 'He is not on the watch. He just looks it.'],
      ['The cobbles run out to Saltmere. One of us walks them and lights those lamps.', 'The rest of us keep the towns.'],
      ['The portal stones hum if you lay a hand on them. I have never liked it.', 'A road you can see is enough road for me.'],
      ['Night watch is long and mostly nothing. Then it is not.', 'That is the whole of the job.'],
      ['My boots are older than your sword, whatever sword that is.', 'They still get me to the next lamp.'],
      ['A castle stands a long way off, past any road I walk.', 'People who have never been there call it Lake Castle. I could not tell you the lake, or who keeps it. That story is not ours yet.']
    ];
    function watchSay(p) {
      const i = (p.watchAt | 0) % WATCH_SAY.length;
      p.watchAt = i + 1;
      return WATCH_SAY[i].map(l => String(l).replace(/\{name\}/g, p.name || 'traveller'));
    }
    const GSTAT = { hp: 40, att: 16, def: 16, attb: 12, defb: 12, max: 7, cb: 33 };
    function isTended(o) {
      if (!o) return false;
      if (o.k === 'lamp') return true;
      return (o.zone === 'village' || o.zone === 'saltmere') && (o.k === 'torch' || o.k === 'sconce');
    }
    function roadLamps() {
      if (!M.roadTorchesIn) return [];
      return M.roadTorchesIn(48, 10, 380, 70).filter(o => o.k === 'lamp').sort((a, b) => a.x - b.x || a.y - b.y);
    }
    let TEND = null;
    function tendKeys() {
      if (TEND) return TEND;
      TEND = new Set();
      for (const o of M.objects || []) if (isTended(o)) TEND.add(o.x + ',' + o.y);
      for (const o of roadLamps()) TEND.add(o.x + ',' + o.y);
      return TEND;
    }
    function lampLit(x, y) { const k = Math.floor(x) + ',' + Math.floor(y); return tendKeys().has(k) ? !!S.lit[k] : true; }
    function townLights(zone) {
      return (M.objects || []).filter(o => o.zone === zone && isTended(o)).map(o => ({ x: o.x, y: o.y })).sort((a, b) => a.x - b.x || a.y - b.y);
    }
    function stepNpc(n, tx, ty, reach) {
      if (cheb(n.x, n.y, tx, ty) <= reach) return true;
      if (!n.path || !n.path.length || S.t % 4 === 0) n.path = findPath(n.x, n.y, (x, y) => cheb(x, y, tx, ty) <= reach, tx, ty, 80);
      const nx = n.path && n.path.shift(); if (nx == null) return false;
      const x = kx(nx), y = ky(nx);
      if (M.npcs.some(o => o !== n && !o.down && o.x === x && o.y === y)) { n.path = null; return false; }
      n.x = x; n.y = y; return cheb(n.x, n.y, tx, ty) <= reach;
    }
    function rallyWatch(n, p) {
      let first = true;
      for (const g of M.npcs) if (g.watch === n.watch) { if (g.foe === p.id) first = false; g.foe = p.id; g.duty = null; }
      if (first) msg(p, n.watch === 'road' ? 'The road guard draws his sword.' : 'The town guard draws steel. The whole watch comes for you.', 'warn');
    }
    function playerAttackGuard(p, n) {
      if (n.hp == null) n.hp = GSTAT.hp;
      const c = wclass(p), st = style(p), b = bonuses(p), w = weaponOf(p);
      let A, max = maxHit(p), ammoId = null;
      if (c === 'ranged') {
        const ammo = p.eq.ammo; if (!ammo) { msg(p, 'There is no ammo left in your quiver.', 'warn'); p.act = null; return false; }
        const ad = IT[ammo.id]; if (lv(p, 'ranged') < (ad.req ? ad.req.ranged || 1 : 1)) { msg(p, 'You need Ranged level ' + ad.req.ranged + ' to fire ' + ad.name.toLowerCase() + '.', 'warn'); p.act = null; return false; }
        ammoId = ammo.id; ammo.n--; if (ammo.n <= 0) delete p.eq.ammo;
        A = (eff(p, 'ranged') + (st.att || 0) + 8) * (b.ranged + 64);
      } else if (c === 'magic') A = (eff(p, 'magic') + 8) * (b.magic + 64);
      else A = (eff(p, 'attack') + (st.att || 0) + 8) * (b.attack + 64);
      const Dr = (GSTAT.def + 9) * (GSTAT.defb + 64), hit = rollAttack(A, Dr), dmg = hit ? R.int(max + 1) : 0;
      const dist = cheb(p.x, p.y, n.x, n.y), delay = c === 'ranged' ? 1 + Math.floor((3 + dist) / 6) : c === 'magic' ? 1 + Math.floor((1 + dist) / 3) : 0;
      ev({ e: 'attack', src: p.id, dst: 'n:' + n.id, anim: w ? w.anim : 'punch', delay, cls: c, ammo: ammoId, spell: c === 'magic' ? spell(p)[2] : null, tier: w ? w.tier : 0 });
      S.pending.push({ at: S.t + delay, src: p.id, guard: n.id, dmg, cls: c, xp: st.xp });
      rallyWatch(n, p);
      return true;
    }
    function landOnGuard(h) {
      const n = M.npcs.find(q => q.id === h.guard), p = S.players[h.src]; if (!n || n.down) return;
      if (n.hp == null) n.hp = GSTAT.hp;
      const dmg = Math.min(h.dmg, n.hp); n.hp -= dmg;
      ev({ e: 'hit', dst: 'n:' + n.id, src: h.src, dmg, max: GSTAT.hp, hp: n.hp, cls: h.cls });
      if (p && !p.puppet) hitXp(p, h.cls, dmg, h.xp, false);
      if (p) rallyWatch(n, p);
      if (n.hp <= 0) {
        n.down = S.t + 80; n.hp = 0; n.path = null; n.duty = null;
        ev({ e: 'guard', id: n.id, up: false });
        if (p) msg(p, 'The town guard falls. The rest of the watch does not.', 'warn');
      }
    }
    function guardStrike(n, p) {
      const b = bonuses(p), st = style(p);
      const A = (GSTAT.att + 9) * (GSTAT.attb + 64), Dr = (eff(p, 'defence') + (st.def || 0) + 9) * (b.defence + 64);
      if (airborne(p)) return;
      const hit = rollAttack(A, Dr); let dmg = hit ? Math.min(R.int(GSTAT.max + 1), p.hp) : 0;
      const prot = protects(p, 'melee'); if (prot) dmg = 0;
      ev({ e: 'attack', src: 'n:' + n.id, dst: p.id, anim: 'slash', delay: 0, cls: 'melee' });
      if (!p.puppet) p.hp -= dmg;
      ev({ e: 'hit', dst: p.id, src: 'n:' + n.id, dmg, max: maxHp(p), hp: p.hp, cls: 'melee', blocked: !hit && !!p.eq.shield, prot: prot ? 1 : 0, raw: dmg });
      if (p.retal && !p.act) p.act = { k: 'attackn', id: n.id };
      if (!p.puppet && p.hp <= 0 && !angelSave(p)) killPlayer(p);
    }
    function setLit(x, y, on) {
      const k = x + ',' + y; if (on) S.lit[k] = 1; else delete S.lit[k];
      ev({ e: 'lamp', x, y, on: on ? 1 : 0 });
    }
    function watchPhase(night, boot) {
      night = !!night; tendKeys();
      if (boot) {
        S.night = night;
        if (night) for (const k of tendKeys()) S.lit[k] = 1;
        return;
      }
      if (night === !!S.night) return;
      S.night = night;
      const groups = {};
      for (const n of M.npcs) if (n.watch && !n.road) (groups[n.watch] = groups[n.watch] || []).push(n);
      for (const zone in groups) {
        const lights = townLights(zone), gs = groups[zone];
        gs.forEach((n, i) => {
          const mine = lights.filter((_, k) => k % gs.length === i);
          if (n.hx == null) { n.hx = n.x; n.hy = n.y; }
          n.duty = mine.length ? { on: night, i: 0, lamps: mine, home: false } : null;
          n.path = null;
        });
      }
    }
    function watchTick() {
      for (const n of M.npcs) {
        if (n.sapAt) {   /* Nookomis walks up to the sugar camp while the sap runs, and home again after (2026-10-08) */
          if (n.hx == null) { n.hx = n.x; n.hy = n.y; }
          const w = NATURE && NATURE.sap && NATURE.sap.season ? n.sapAt : [n.hx, n.hy];
          if (n.x !== w[0] || n.y !== w[1]) { const x0 = n.x, y0 = n.y; stepNpc(n, w[0], w[1], 0); n.stuck = n.x === x0 && n.y === y0 ? (n.stuck | 0) + 1 : 0; if (n.stuck > 30) { n.x = w[0]; n.y = w[1]; n.stuck = 0; n.path = null; } }   /* no way through: she is there all the same */
          continue;
        }
        if (!n.watch) continue;
        if (n.hx == null) { n.hx = n.x; n.hy = n.y; }
        if (n.down) {
          if (S.t >= n.down) { n.down = 0; n.hp = GSTAT.hp; n.x = n.hx; n.y = n.hy; ev({ e: 'guard', id: n.id, up: true }); }
          continue;
        }
        if (n.foe) {
          const p = S.players[n.foe];
          const gone = !p || p.dead || (n.watch !== 'road' && M.zoneAt && M.zoneAt(p.x, p.y) !== n.zone && cheb(p.x, p.y, n.x, n.y) > 18) || (n.watch === 'road' && cheb(p.x, p.y, n.x, n.y) > 18);
          if (gone) { n.foe = null; n.path = null; continue; }
          if (inReach(n.x, n.y, p.x, p.y, 1)) { if (S.t >= (n.atkT || 0)) { n.atkT = S.t + 4; guardStrike(n, p); } continue; }
          stepNpc(n, p.x, p.y, 1); continue;
        }
        if (n.road) {
          if (!n.route || !n.route.length) { n.route = roadLamps(); n.ri = 0; n.rd = 1; if (!n.route.length) continue; }
          const L = n.route[n.ri]; if (!L) { n.ri = 0; continue; }
          if (stepNpc(n, L.x, L.y, 1)) { setLit(L.x, L.y, !!S.night); let k = n.ri + n.rd; if (k < 0 || k >= n.route.length) { n.rd = -n.rd; k = n.ri + n.rd; } n.ri = k; n.path = null; }
          continue;
        }
        if (n.duty) {
          const L = n.duty.lamps[n.duty.i];
          if (!L) {
            if (n.x === n.hx && n.y === n.hy) n.duty = null;
            else stepNpc(n, n.hx, n.hy, 0);
            continue;
          }
          if (stepNpc(n, L.x, L.y, 1)) { setLit(L.x, L.y, !!n.duty.on); n.duty.i++; n.path = null; }
          continue;
        }
        if (n.x !== n.hx || n.y !== n.hy) stepNpc(n, n.hx, n.hy, 0);
      }
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
    function playerTick(p) { LV_LIMIT = p.lv > 0 && M.buildingAt ? p.bld : -1; FLY = isHawk(p) && !(p.burden > 0); BOAT = !!p.boat && !FLY; GATE_P = p; try { playerTick0(p); } finally { LV_LIMIT = -1; FLY = false; BOAT = false; GATE_P = null; } }
    function playerTick0(p) {
      if (!(p.hp >= 0)) p.hp = maxHp(p);
      if (p.boat === 2 && !p.dead && !p.puppet) rideTick(p);   /* hitpoints that are not a number (the antidote bug, 2026-10-07): back to full */
      if (!p.dead) townCheck(p);
      if (p.poison) poisonTick(p);
      if (p.puppet) return puppetTick(p);
      if (p.dead) {
        if (S.t - p.dead >= 4) {
          const W0 = wakeSpot(p);
          p.dead = 0; p.hp = maxHp(p); p.pp = maxPp(p); p.pd = 0; p.x = W0.at[0]; p.y = W0.at[1]; p.lv = 0; p.bld = -1; p.path = []; p.atk = 0; p.spawnT = S.t; p.boat = 0; p.land = null; p.ride = null;
          ev({ e: 'respawn', p: p.id }); msg(p, W0.name ? 'You wake up by the town portal in ' + W0.name + '.' : ((homeOf(p) || {}).wakeSay || 'You wake up by the well in Ashvale village.')); burdenCheck(p);
        }
        return;
      }
      if (p.atk > 0) p.atk--;
      prayerTick(p); fxTick(p);
      if (p.hawkHp != null && p.hawkHp < HK.hp && S.t % HK.regenEvery === 0) p.hawkHp++;   /* a hawk's wounds mend slowly */
      const a = p.act;
      if (a && a.k === 'light') { lightTick(p, a); }
      else if (a && a.k === 'climb') { const B = M.buildings[a.bi]; if (B && B.deck) { if (deckEnds(B, p).some(q => cheb(p.x, p.y, q[0], q[1]) <= 1)) climbNow(p, a.bi, a.dir); else if (p.path.length) stepPath(p); else p.act = null; } else if (B && (cheb(p.x, p.y, B.stairs[0], B.stairs[1]) <= 1 || (B.alt && cheb(p.x, p.y, B.alt[0], B.alt[1]) <= 1))) climbNow(p, a.bi, a.dir); else if (p.path.length) stepPath(p); else p.act = null; }
      else if (a && a.k === 'attackn') {
        const n = M.npcs.find(q => q.id === a.id);
        if (!n || n.down) { p.act = null; }
        else if (!inReach(p.x, p.y, n.x, n.y, 1)) {
          p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, n.x, n.y, 1), n.x, n.y, 60);
          if (!p.path.length) { msg(p, "I can't reach that!", 'warn'); p.act = null; }
          else stepPath(p);
        } else { p.path = []; p.face = faceTo(p.x, p.y, n.x, n.y); if (p.atk <= 0) { if (playerAttackGuard(p, n)) p.atk = attackSpeed(p); } }
      }
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
            if (coverBlocks(p, m)) { msg(p, 'You dare not strike. One blow here would unmask you both.', 'warn'); p.act = null; return; }
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
          if (p.act && p.x === g.x && p.y === g.y && !isAuth(zoneOf(g.x, g.y))) {   /* replica: ask the host; first claim wins. Bank-persisted drops used to be taken here as well, then the host's 't' granted them again (a death pile came back as two of everything). */
            if (!canAdd(p, g.id, g.n)) msg(p, "You don't have enough inventory space to hold that item.", 'warn'); else ev({ e: 'claim', p: p.id, g: g.uid });
            p.act = null;
          }
          if (p.act && p.x === g.x && p.y === g.y) {
            /* a pile that does not stack (spider silk (10), and any drop like it) fills the free slots and leaves the rest (2026-10-08) */
            if (S.took.has(g.uid)) { p.act = null; }
            else {
            const room = (g.bank != null || IT[g.id].stack) ? (canAdd(p, g.id, g.n) ? g.n : 0) : Math.min(g.n, invFree(p));
            if (!room) msg(p, "You don't have enough inventory space to hold that item.", 'warn');
            else {
              const left = addItem(p, g.id, room), got = room - left;
              S.took.add(g.uid);
              ev({ e: 'take', p: p.id, g: g.uid, id: g.id, n: got, x: g.x, y: g.y, own: g.from === p.id ? 1 : 0 });
              g.n -= got;
              if (g.n > 0) ev({ e: 'ground', g: g.uid, n: g.n, x: g.x, y: g.y });
              else { S.ground.splice(S.ground.indexOf(g), 1); if (g.bank != null) BANK_GONE.add(g.bank); }   /* a persisted drop taken here: no host's copy brings it back (2026-10-06: the same 200 Gold, picked up again and again) */
            }
            p.act = null;
            }
          }
        }
      } else if (a && a.k === 'ride') {   /* step from the shore into the bow of a friend's canoe */
        const t = S.players[a.pid];
        if (!t || t.boat !== 1) { p.act = null; }
        else if (cheb(p.x, p.y, t.x, t.y) <= 2) { p.act = null; p.path = []; p.boat = 2; p.ride = a.pid; p.knock = invCount(p, 'knockers') > 0 && (t.pole || invCount(t, 'push_pole') > 0); p.rideMiss = 0; p.x = t.x; p.y = t.y; ev({ e: 'boat', p: p.id, on: 2 }); msg(p, p.knock ? "You climb into the bow with a paddle, and the bawa'iganaakoog (ricing sticks) at your feet. In the manoomin (wild rice) your partner stands with the gaandakii'iganaak (push pole) and you knock the rice in." : 'You climb into the bow with a paddle. Two paddling go faster and tire less. Point at the shore beside you to get out.'); }
        else { p.path = findPath(p.x, p.y, (x, y) => cheb(x, y, t.x, t.y) <= 2, t.x, t.y); stepPath(p); if (!p.path.length && cheb(p.x, p.y, t.x, t.y) > 2) { msg(p, "I can't reach that canoe from here.", 'warn'); p.act = null; } }
      } else if (a && a.k === 'trap') {   /* walk to your snare, then look in it (or take it up) */
        if (inReach(p.x, p.y, a.x, a.y, 1)) { p.act = null; p.path = []; checkTrap(p, a.x, a.y, a.up); }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, a.x, a.y, 1), a.x, a.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, a.x, a.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else if (a && a.k === 'board') {   /* walk to the canoe, sit down in it: it floats where it lay */
        if (inReach(p.x, p.y, a.x, a.y, 1)) { const lb = BOATS.get(a.x + ',' + a.y); if (!lb && dockFull(a.x, a.y)) { msg(p, 'There is no canoe at the landing: three are already left at the banks nearby. Take one of those.', 'warn'); p.act = null; return; } if (lb) { p.face = lb.face; takeBoat(a.x, a.y, p.id); } p.act = null; p.path = []; p.boat = 1; p.x = a.x; p.y = a.y; p.land = null; ev({ e: 'boat', p: p.id, on: 1 }); msg(p, 'You sit down in the canoe and take up the paddle. Point at the water to paddle there, or at the shore to land.'); }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, a.x, a.y, 1), a.x, a.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, a.x, a.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else if (a && a.k === 'crate') {
        const o = crateAt(a.x, a.y);
        if (!o) p.act = null;
        else if (inReach(p.x, p.y, o.x, o.y, 1)) { p.face = faceTo(p.x, p.y, o.x, o.y); p.act = null; p.path = []; openCrate(p, o); }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, o.x, o.y, 1), o.x, o.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, o.x, o.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else if (a && a.k === 'enter') {   /* walk up to a passage and go through: it takes you to its `to` */
        const o = passageAt(a.x, a.y);
        if (!o) p.act = null;
        else if (inReach(p.x, p.y, o.x, o.y, 1)) {
          if (o.need && !hasFlag(p, o.need)) { msg(p, o.shut || 'It will not open.', 'warn'); p.act = null; }
          else {
            const dest = o.out && p.x > o.x ? o.out : o.to;
            teleport(p, { to: dest, id: o.k }, o.say || (o.k === 'cavemouth' ? 'You climb down into the dark. Something skitters ahead.' : o.k === 'gate' ? 'You slip through the gate.' : 'You climb back up into the daylight.'));
          }
        }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, o.x, o.y, 1), o.x, o.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, o.x, o.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else if (a && a.k === 'npc') {
        const n = M.npcs.find(q => q.id === a.id);
        if (inReach(p.x, p.y, n.x, n.y, 1)) { p.face = faceTo(p.x, p.y, n.x, n.y); p.act = null; p.path = []; talk(p, npcFor(p, n)); ev({ e: 'face', npc: n.id, x: p.x, y: p.y }); }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, n.x, n.y, 1), n.x, n.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, n.x, n.y, 1)) p.act = null; }
      } else if (a && a.k === 'plant') {
        if (inReach(p.x, p.y, a.x, a.y, 1)) { p.path = []; p.act = null; plantAt(p, a.x, a.y); }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, a.x, a.y, 1), a.x, a.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, a.x, a.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else if (a && a.k === 'unplant') {
        if (inReach(p.x, p.y, a.x, a.y, 1)) { p.path = []; p.act = null; unplantAt(p, a.x, a.y); }
        else { p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, a.x, a.y, 1), a.x, a.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, a.x, a.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else if (a && a.k === 'gather') {
        const n = nodeAt(a.i);
        if (!n) { p.act = null; p.skilling = null; }
        else if (inReach(p.x, p.y, n.x, n.y, 1) || (n.kind === 'fire' && p.x === n.x && p.y === n.y)) { p.path = []; p.moved = 0; gatherTick(p, n); }
        else { p.skilling = null; p.path = findPath(p.x, p.y, (x, y) => inReach(x, y, n.x, n.y, 1), n.x, n.y); stepPath(p); if (!p.path.length && !inReach(p.x, p.y, n.x, n.y, 1)) { msg(p, "I can't reach that!", 'warn'); p.act = null; } }
      } else { stepPath(p); if (p.boat && p.land && !p.path.length) disembark(p); }
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
        if (MON[m.key].chain && cheb(m.x + sx, m.y + sy, m.sx, m.sy) > MON[m.key].chain) continue;   /* a chained beast stays on its pole */
        if (canStep(m.x, m.y, sx, sy) && !M.insideAt(m.x + sx, m.y + sy) && !occupied(m.x + sx, m.y + sy, m) && (m.crossing || m.summon || M.zoneAt(m.x + sx, m.y + sy) === M.zoneAt(m.sx, m.sy))) { m.face = faceTo(m.x, m.y, m.x + sx, m.y + sy); m.x += sx; m.y += sy; m.step = 1; return true; }
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
    function tgtOk(m) { const p = m.tgt && S.players[m.tgt]; return !!(p && !p.dead); }
    function otherFighter(m, except) {
      for (const pid of S.order) {
        if (pid === except) continue;
        const q = S.players[pid];
        if (q && !q.dead && q.act && q.act.k === 'attack' && q.act.uid === m.uid) return q;
      }
      return null;
    }
    function loseTarget(m) {   /* the one it had died or ran: keep fighting whoever is still swinging at it */
      const nxt = otherFighter(m, m.tgt);
      if (nxt) { m.tgt = nxt.id; m.back = 0; m.path = null; return nxt; }
      m.tgt = 0; m.back = 1; m.path = null; return null;
    }
    function busyFight(m) {   /* a living player is still in this fight: do not heal the wound away under them */
      if (m.hurt && S.t - (m.hurtT || 0) < 80) return true;
      for (const pid of S.order) {
        const q = S.players[pid];
        if (!q || q.dead) continue;
        if (m.zone && M.zoneAt(q.x, q.y) === m.zone) return true;
        if (q.act && q.act.k === 'attack' && q.act.uid === m.uid) return true;
      }
      return false;
    }
    function mobHeal(m, md, every) { if (m.hp < md.hp && S.t % every === 0 && !busyFight(m)) m.hp++; }
    function retaliating(m, leash) {
      const lock = (MON[m.key].windup || MON[m.key].chain) && tgtOk(m);
      const p = lock ? S.players[m.tgt] : (m.hurt && S.players[m.hurt]);
      if (!lock && (!m.hurt || S.t - (m.hurtT || -1e9) > RETALIATE.ticks)) return false;
      if (!p || p.dead) return false;
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
      if (!canStep(m.x, m.y, nx - m.x, ny - m.y) || occupied(nx, ny, m) || M.insideAt(nx, ny) || (!m.crossing && !m.summon && M.zoneAt(nx, ny) !== m.zone)) { m.path = null; return false; }
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
        if (q.dead || q.lv > 0 || (airborne(q) && !shooter(m, md)) || S.t - q.spawnT <= 8 || combatLevel(q) > mobCombat(md) || M.zoneAt(q.x, q.y) !== m.zone) continue;   /* monsters keep to the ground floor, and cannot reach a hawk */
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
      if (p && !(m.crossing && p.id === m.hurt) && (p.dead || cheb(m.x, m.y, m.sx, m.sy) > (m.summon && m.home ? m.home[2] : ai.leash) || cheb(p.x, p.y, m.sx, m.sy) > (m.summon && m.home ? m.home[2] : ai.leash) + 4 || (!m.summon && M.zoneAt(p.x, p.y) !== m.zone))) { p = loseTarget(m); m.fleeing = 0; }
      if (p && ai.fleePct && !m.fled && m.hp * 100 < md.hp * ai.fleePct) { m.fled = 1; m.fleeing = S.t; m.path = null; ev({ e: 'mobflee', mob: m.uid }); }
      if (m.fleeing) {
        if (S.t - m.fleeing > 12 || (m.x === m.sx && m.y === m.sy)) { m.fleeing = 0; if (m.tgt) rally(m, m.tgt, 8); }   /* regrouped: back into the fight with friends */
        else { if (!mobPathStep(m, (x, y) => x === m.sx && y === m.sy, m.sx, m.sy, 24) && p) stepAway(m, p, ai.leash); return; }
      }
      if (p && airborne(p) && !shooter(m, md)) { m.tgt = 0; m.back = 1; m.path = null; p = null; }   /* the hawk flew off: no sword reaches it (2026-10-08) */
      if (!p && !m.back && md.aggro > 0) p = acquire(m, md);
      if (comeStep(m)) { mobHeal(m, md, 10); return; }   /* someone is trying to hit us and cannot: come out to them, without attacking */
      if (p) {
        const d = cheb(m.x, m.y, p.x, p.y), archer = m.carry && Object.keys(m.carry).some(k => /^arrows_/.test(k) && m.carry[k] > 0);
        if (archer) {
          const rf = wx(m.zone, 'range'), keep = [Math.max(2, Math.round((ai.keep || [4, 6])[0] * rf)), Math.max(2, Math.round((ai.keep || [4, 6])[1] * rf))];
          if (d <= 2 && !airborne(p) && stepAway(m, p, ai.leash)) return;   /* backs off when you close in ... (a hawk overhead it just shoots) */
          if (d > 2 || airborne(p)) {   /* a hawk overhead is shot at however close */
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
        mobHeal(m, md, 5);
        return;
      }
      if (R.int(12) === 0) { m.wx = m.sx + R.int(5) - 2; m.wy = m.sy + R.int(5) - 2; }   /* patrol a little around the post */
      if (m.wx != null && !(m.x === m.wx && m.y === m.wy)) { if (!mobStepToward(m, m.wx, m.wy)) m.wx = null; }
      mobHeal(m, md, 10);
    }
    function mobTick(m) {
      const md = MON[m.key];
      m.step = 0;
      if (m.summon) {   /* death or fifty tiles from the rope ends the call, whether or not this zone is the one being stepped */
        const own = S.players[m.owner], home = m.home || [m.sx, m.sy, 50];
        const left = !own || !!own.dead || cheb(own.x, own.y, home[0], home[1]) > (home[2] || 50);
        if (left || m.gone) { if (!m.gone) dismissSummon(m); return; }
        if (m.dead) return;
        m.tgt = own.id; m.back = 0;
      }
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
      if (comeStep(m)) { mobHeal(m, md, 10); return; }   /* someone is trying to hit us and cannot: come out to them, without attacking */
      if (m.follow) { if (S.t < m.follow.at) return; followThrough(m); }   /* coming up (or down) through a cave opening after its target */
      let p = m.tgt ? S.players[m.tgt] : null;
      /* RELENTLESS (2026-10-07, the Spider Cave: "they should follow you out of their spawn zone indefinitely"): once it
         has you it ignores its area and its leash, and only stops when you die (or leave the game) */
      if (md.relentless) { m.crossing = !!p; if (p && p.dead) p = loseTarget(m); }
      else {
        const leash = md.chain || 10;
        m.crossing = retaliating(m, leash);
        if (p && !(m.crossing && p.id === m.hurt) && (p.dead || cheb(m.x, m.y, m.sx, m.sy) > leash || cheb(p.x, p.y, m.sx, m.sy) > leash + 4)) p = loseTarget(m);
      }
      if (p && airborne(p) && !shooter(m, md)) { m.tgt = 0; m.back = 1; p = null; }   /* the hawk flew off: no bite or blow reaches it (2026-10-08) */
      if (!p && !m.back && md.aggro > 0) {
        for (const pid of S.order) { const q = S.players[pid]; if (!q.dead && !(airborne(q) && !shooter(m, md)) && S.t - q.spawnT > 8 && cheb(q.x, q.y, m.x, m.y) <= sightOf(m, md) && (md.hunter || combatLevel(q) <= mobCombat(md)) && M.zoneAt(q.x, q.y) === M.zoneAt(m.sx, m.sy)) { m.tgt = q.id; p = q; break; } }   /* hunters (timber wolves) take on anyone */
      }
      /* shy animals (2026-10-04: chickens scatter, deer flee when you come close): within md.shy tiles of a
         player they run, two steps a tick, away from the nearest one and back toward home after. Hit one and it is
         a fight like any other (retaliation above keeps its attacker as the target). */
      if (!p && md.shy) {
        let q = null, qd = md.shy + 1;
        for (const pid of S.order) { const o = S.players[pid]; if (o.dead || o.lv > 0 || airborne(o)) continue; const d = cheb(o.x, o.y, m.x, m.y); if (d < qd) { qd = d; q = o; } }
        if (q) { m.wx = null; if (stepAway(m, q, 10)) stepAway(m, q, 10); mobHeal(m, md, 10); return; }
      }
      if (p) {
        if (m.x === p.x && m.y === p.y) { for (const [dx, dy] of DIRS.slice(0, 4)) if (canStep(m.x, m.y, dx, dy) && !occupied(m.x + dx, m.y + dy, m) && !(md.chain && cheb(m.x + dx, m.y + dy, m.sx, m.sy) > md.chain)) { m.x += dx; m.y += dy; m.step = 1; break; } return; }
        if (m.wind) {   /* the blow was shown already; it lands when the windup ends, and only if you are still where that style can reach */
          m.face = faceTo(m.x, m.y, p.x, p.y);
          if (S.t < m.wind.at) return;
          const mode = m.wind.mode; m.wind = null; m.form = (m.form | 0) + 1;
          const rng = (md.cast && md.cast.range) || 5, d = cheb(m.x, m.y, p.x, p.y);
          const ok = !p.dead && (mode === 'magic' ? d <= rng && lineOfSight(m.x, m.y, p.x, p.y) : inReach(m.x, m.y, p.x, p.y, 1));
          if (ok) { mobAttack(m, p, mode === 'magic' ? 'magic' : null); m.atk = md.speed; }
          return;
        }
        if (md.windup) {   /* bite and dragonfire take turns, and each is plain to see before it lands */
          const rng = (md.cast && md.cast.range) || 5, d = cheb(m.x, m.y, p.x, p.y), odd = (m.form | 0) % 2 === 1;
          const seen = md.cast && d <= rng && lineOfSight(m.x, m.y, p.x, p.y), close = inReach(m.x, m.y, p.x, p.y, 1);
          const mode = close && !odd ? 'melee' : seen ? 'magic' : close ? 'melee' : null;
          if (mode && m.atk <= 0) { m.wind = { mode, at: S.t + md.windup }; m.face = faceTo(m.x, m.y, p.x, p.y); ev({ e: 'tell', mob: m.uid, mode, dst: p.id }); return; }
          if (!(md.chain && cheb(m.x, m.y, m.sx, m.sy) >= md.chain && cheb(p.x, p.y, m.sx, m.sy) > cheb(m.x, m.y, m.sx, m.sy))) mobStepToward(m, p.x, p.y);
          return;
        }
        if (md.cast) {
          const rng = md.cast.range || 5, d = cheb(m.x, m.y, p.x, p.y);
          if (d <= rng && lineOfSight(m.x, m.y, p.x, p.y)) { m.face = faceTo(m.x, m.y, p.x, p.y); if (m.atk <= 0) { mobAttack(m, p, 'magic'); m.atk = md.speed; } return; }
          if (mobPathStep(m, (x, y) => cheb(x, y, p.x, p.y) <= rng && lineOfSight(x, y, p.x, p.y) && !playerAt(x, y, null) && !mobAt(x, y, m), p.x, p.y, 18)) return;
        }
        if (inReach(m.x, m.y, p.x, p.y, 1)) { m.face = faceTo(m.x, m.y, p.x, p.y); if (m.atk <= 0) { mobAttack(m, p); m.atk = md.speed; } }
        else mobStepToward(m, p.x, p.y);
        return;
      }
      if (m.back) { if (m.x === m.sx && m.y === m.sy) m.back = 0; else if (!mobStepToward(m, m.sx, m.sy)) { m.x = m.sx; m.y = m.sy; m.back = 0; } mobHeal(m, md, 5); return; }
      if (md.ownDice) {   /* wildlife wanders on its own dice (uid + tick), so a hen in a yard never shifts the fight rolls */
        const h = Math.imul((m.uid % 2147483647) ^ Math.imul(S.t, 0x9e3779b1), 0x85ebca6b) >>> 0, r = md.roam || 3;
        if (h % (md.roamEvery || 10) === 0) { m.wx = m.sx + ((h >>> 8) % (2 * r + 1)) - r; m.wy = m.sy + ((h >>> 16) % (2 * r + 1)) - r; }   /* roamEvery: birds potter about */
      } else if (md.chain) { if (R.int(8) === 0) { const r = md.chain; m.wx = m.sx + R.int(r * 2 + 1) - r; m.wy = m.sy + R.int(r * 2 + 1) - r; } }
      else if (R.int(10) === 0) { const tx = m.sx + R.int(7) - 3, ty = m.sy + R.int(7) - 3; m.wx = tx; m.wy = ty; }
      if (m.wx != null && !(m.x === m.wx && m.y === m.wy)) { if (!mobStepToward(m, m.wx, m.wy)) m.wx = null; }
      mobHeal(m, md, 10);
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
    function ageStumps() {
      for (const k in S.fell) {
        if (S.t - S.fell[k] < PLANT_HOUR) continue;
        if (S.plants[k] && S.plants[k].stump) continue;
        const x = M.kx(+k), y = M.ky(+k);
        delete S.fell[k]; delete S.dep[k];
        if (M.clearTree) M.clearTree(x, y);
        S.cleared[k] = 1;
        ev({ e: 'clear', x, y, node: +k });
        for (const pid of S.order) { const p = S.players[pid]; if (p && cheb(p.x, p.y, x, y) <= 16) msg(p, 'The stump crumbles. The ground is clear grass.', 'info'); }
      }
    }
    function plantYoung(x, y) { const pl = S.plants[idx(x, y)]; return !!(pl && !pl.grown && S.t - pl.at < PLANT_HOUR); }
    function agePlants() {
      for (const k in S.plants) {
        const pl = S.plants[k];
        if (!pl || pl.grown) continue;
        if (!isAuth(zoneOf(pl.x, pl.y))) continue;
        if (S.t - pl.at < PLANT_HOUR) continue;
        const owner = S.players[pl.owner];
        if (pl.stump) {
          delete S.dep[k]; delete S.plants[k];
          ev({ e: 'regrow', node: +k, x: pl.x, y: pl.y });
          ev({ e: 'unplant', x: pl.x, y: pl.y });
          if (owner) msg(owner, 'The stump has grown back into a tree.', 'info');
        } else if (pl.tile === '.') {
          if (S.cleared[k] && M.growTree) { delete S.cleared[k]; }
          if (M.growTree) M.growTree(pl.x, pl.y);
          pl.grown = 1;
          ev({ e: 'grow', x: pl.x, y: pl.y, node: +k });
          if (owner) msg(owner, 'The sapling has grown into a tree. It stands there for good.', 'info');
        } else { pl.grown = 1; if (owner) msg(owner, 'The shoot has rooted. It will not come back out of the ground.', 'info'); }
      }
    }
    /* CROSSING A CUT EDGE OF THE NET (handoff/globe_net.md): the ground past it is drawn as its own continuation; CROSS metres in, the
       player (and a canoe partner, and a hawk) is moved to where that same ground lies natively in the net - the land around them is
       the same, only the map coordinates jump and the heading turns with the placement */
    const CROSS = 24;
    function netCross(p) {
      if (!p || p.puppet || p.dead || p.lv > 0 || p.boat === 2) return;   /* a rider goes with the canoe */
      if (!(S.t % 2) || M.netGap(p.x, p.y) < CROSS || (M.underAt && M.underAt(p.x, p.y))) return;   /* underground lies in the net's empty space on purpose */
      const a = M.netAcross(p.x, p.y); if (!a) return;
      let to = [a.x, a.y];
      const ok = (x, y) => p.boat ? isWet(x, y) : (isHawk(p) || !M.blocked(x, y));
      if (!ok(to[0], to[1])) { let best = null; for (let r = 1; r <= 4 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) if (ok(a.x + dx, a.y + dy)) { best = [a.x + dx, a.y + dy]; break; } if (best) to = best; }
      const from = [p.x, p.y]; p.x = to[0]; p.y = to[1]; p.path = []; p.land = null;
      for (const q of Object.values(S.players)) if (q.boat === 2 && q.ride === p.id) { q.x = p.x; q.y = p.y; }
      ev({ e: 'cross', p: p.id, x: p.x, y: p.y, fx: from[0], fy: from[1], turn: a.turn });
    }
    // ---------------- the tick
    function tick() {
      S.t++; S.ev = [];
      while (queue.length) { const [pid, c] = queue.shift(); const p = S.players[pid]; if (p) apply(p, c); }
      for (const pid of S.order) playerTick(S.players[pid]);
      if (M.netGap) for (const pid of S.order) netCross(S.players[pid]);   /* the open globe: past a cut edge of the net, carried to where that ground lies */
      if (M.seeded) for (const pid of S.order) wake(S.players[pid]);
      for (const m of S.mobs) mobTick(m);
      patrolTick(); guardTick(); watchTick();
      for (let i = 0; i < S.pending.length;) { const h = S.pending[i]; if (h.at <= S.t) { S.pending.splice(i, 1); if (h.guard) landOnGuard(h); else landOnMob(h); } else i++; }
      for (let i = 0; i < S.ground.length;) { const g = S.ground[i]; if (g.until <= S.t && isAuth(zoneOf(g.x, g.y))) { S.ground.splice(i, 1); ev({ e: 'vanish', g: g.uid, x: g.x, y: g.y }); } else i++; }
      const occ = {};
      for (const pid of S.order) { const p = S.players[pid]; if (!p.dead) occ[zoneOf(p.x, p.y)] = 1; }
      for (const z in occ) { if (S.seen[z] != null && S.t - S.seen[z] > EMPTY_TICKS && isAuth(z)) repopulate(z); S.seen[z] = S.t; }
      agePlants();
      ageStumps();
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
      if (Number.isInteger(st.x) && Number.isInteger(st.y) && inMap(st.x, st.y)) {
        p.x = st.x; p.y = st.y;
        for (const q of Object.values(S.players)) if (q.boat === 2 && q.ride === id && !q.puppet) { q.x = p.x; q.y = p.y; }   /* whoever rides in this canoe moves with it at once - even on the last word before it crosses into the next region */
      }
      if (Number.isInteger(st.hp)) p.hp = st.hp;
      if (st.dead != null) { const was = p.dead; p.dead = st.dead ? (p.dead || S.t) : 0; if (st.dead && !was) { p.act = null; for (const m of S.mobs) if (m.tgt === id) loseTarget(m); } }
      if (Array.isArray(st.L)) PUP_SKILLS.forEach((k, i) => { const L = st.L[i] | 0; if (L >= 1 && L <= 99) p.xp[k] = XP[L] * 10; });
      if (st.g && typeof st.g === 'object') { p.eq = {}; for (const k of EQ_SLOTS) { const v = st.g[k]; if (v && IT[v] && IT[v].eq === k) p.eq[k] = { id: v, n: IT[v].stack ? 9999 : 1 }; } }
      if (st.st && typeof st.st === 'object') for (const k in p.styles) if (Number.isInteger(st.st[k])) p.styles[k] = st.st[k];
      if (st.bt !== undefined) p.boat = st.bt | 0;   /* in a canoe: 1 poles it, 2 rides in it knocking rice */
      if (st.rd !== undefined) p.ride = st.rd || null;
      if (st.pl !== undefined) p.pole = !!st.pl;
      if (st.kn !== undefined) p.knock = !!st.kn;
      if (st.pr !== undefined) p.pray = st.pr && PRAYERS[st.pr] && PRAYERS[st.pr].g === 'head' ? { [st.pr]: 1 } : {};
      if (typeof st.n === 'string') { const nm = cleanName(st.n); if (nm) p.name = nm; }
      if (st.act !== undefined) p.act = st.act && st.act.k === 'attack' && mobByUid(st.act.uid) ? { k: 'attack', uid: st.act.uid } : null;
    }
    function claim(pid, uid) {   /* first claim wins; the picker's own game adds the item when it hears the 'take' */
      const g = S.ground.find(q => q.uid === uid), p = S.players[pid];
      if (!g || !p || !isAuth(zoneOf(g.x, g.y)) || cheb(p.x, p.y, g.x, g.y) > 3) return false;
      if (g.bank != null) BANK_GONE.add(g.bank);
      if (g.uid >= BANK_UID) BANK_GONE.add(g.uid - BANK_UID);
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
    function groundAdd(uid, id, n, x, y, from, sunk) {
      if (!IT[id] || isAuth(zoneOf(x, y))) return;
      if (S.took.has(uid)) return;   /* already in our bag: a host snapshot must not lay the same pile down again */
      const did = uid >= BANK_UID ? uid - BANK_UID : null;   /* a persisted drop (its uid says so), even from a host too old to say */
      if (did != null && BANK_GONE.has(did)) return;         /* the Bank already told us somebody took it: an old host's copy stays gone */
      const g = S.ground.find(q => q.uid === uid); if (g) { g.n = n; return; }
      S.ground.push({ uid, id, n, x, y, owner: null, until: S.t + 1e9, from: from || null, bank: did, sunk: sunk || 0 }); ev({ e: 'drop', g: uid, id, n, x, y, sunk: sunk || 0 });
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
        const did = r[0] | 0, id = String(r[1]), n = Math.max(1, r[2] | 0), x = r[3] | 0, y = r[4] | 0, sunk = r[5] ? String(r[5]) : 0;
        if (!IT[id] || !inMap(x, y)) continue;   /* every game puts them down (the area's host may be an older game): same uid everywhere */
        want.add(did); const uid = BANK_UID + did;
        const g = S.ground.find(q => q.uid === uid || q.bank === did);
        if (g) { g.n = n; g.until = 1e15; if (sunk) g.sunk = sunk; continue; }
        const live = S.ground.find(q => q.bank == null && q.id === id && q.x === x && q.y === y);
        if (live) { live.bank = did; live.until = 1e15; if (sunk) live.sunk = sunk; continue; }
        S.ground.push({ uid, id, n, x, y, owner: null, until: 1e15, bank: did, sunk }); ev({ e: 'drop', g: uid, id, n, x, y, bank: 1, sunk });
      }
      const [x0, y0, x1, y1] = box || [0, 0, -1, -1];
      for (let i = 0; i < S.ground.length;) {
        const g = S.ground[i];
        if (g.bank != null && !want.has(g.bank) && g.x >= x0 && g.x <= x1 && g.y >= y0 && g.y <= y1) { BANK_GONE.add(g.bank); S.ground.splice(i, 1); ev({ e: 'vanish', g: g.uid, x: g.x, y: g.y }); }
        else i++;
      }
      return want.size;
    }
    function groundFull(zone, list) { S.ground = S.ground.filter(g => zoneOf(g.x, g.y) !== zone || isAuth(zone) || g.bank != null);   /* the Bank's persisted drops stay: the Bank, not the host, says when they go */ for (const r of list) groundAdd(r[0], r[1], r[2], r[3], r[4], r[5], r[6]); }
    /* owner side: what the host resolved about OUR player */
    function applyHit(pid, dmg, cls, fromMob, fx, fxt) { const p = S.players[pid]; if (!p || p.puppet || p.dead) return; if (fromMob && cls && protects(p, cls)) dmg = 0; else if (fromMob && fx) magicFx(p, fx, fxt || 5); p.hp -= Math.min(dmg, p.hp); if (angelSave(p)) return; if (p.retal && !p.act && !p.path.length) { } if (p.hp <= 0) killPlayer(p); }
    function storeItem(pid, id, n) {
      const p = S.players[pid]; if (!p || !IT[id] || n <= 0) return 0;
      const had = invCount(p, id); const fromBag = Math.min(n, had); if (fromBag) removeItem(p, id, fromBag);
      let left = n - fromBag;
      if (left > 0) for (const k of EQ_SLOTS) {   /* a live arcade offer of a worn piece: it has to come off or the Bank mints another */
        if (left <= 0) break;
        const e = p.eq[k]; if (!e || e.id !== id) continue;
        delete p.eq[k]; left -= 1; ev({ e: 'equip', p: pid });
      }
      if (fromBag || left < n) { ev({ e: 'inv', p: pid }); burdenCheck(p); }
      return n - left;
    }
    function grantItem(pid, id, n, gUid) {
      const p = S.players[pid]; if (!p || !IT[id]) return;
      if (gUid != null) { if (S.took.has(gUid)) return; S.took.add(gUid); }   /* the same death-pile uid must not land twice (host 't' after a local take, 2026-10-09) */
      const left = addItem(p, id, n); if (left) dropGround(id, left, p.x, p.y, null, 300); ev({ e: 'take', p: pid, id, n: n - left });
    }
    function addPlayer(id, save) {
      const p = newPlayer(id, save);
      /* a saved upper floor holds only if that building still has it */
      p.lv = 0; p.bld = -1;
      if (save && save.lv > 0 && M.buildingAt) { const bi = M.buildingAt(p.x, p.y); if (bi >= 0 && save.lv < M.buildings[bi].floors) { p.lv = save.lv | 0; p.bld = bi; } } S.players[id] = p; if (S.order.indexOf(id) < 0) S.order.push(id); p.spawnT = S.t;
      for (const qid in p.quests || {}) { const q = p.quests[qid], Q = D.quests.quests[qid], st = Q && Q.steps[q.step - 1]; if (st && st.kit) topUp(p, q, st); if (st && st.stumps) fellStumps(q, st); if (st) learnFlag(p, st); for (const s of (Q && Q.steps) || []) if (s.flag && q.step > s.id) learnFlag(p, s); }
      ev({ e: 'join', p: id }); return p;
    }
    function removePlayer(id) { delete S.players[id]; S.order = S.order.filter(q => q !== id); for (const m of S.mobs) if (m.tgt === id) loseTarget(m); }
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
      setNewHome: h => { if (HOMES[h]) NEWHOME = h; }, homeOf: p => (p && p.home) || 'ashvale', npcFor, lineFor, questForHome, questMarks,
      API, S, M, D, log, cmd, tick, addPlayer, removePlayer, exportPlayer, hash, addZone, bankGround, persists: (id, n) => !perishable(id, n), setBoats, dockFull, underMove, setSkyTell, trapOf, offerOf, isBlessed: (pid, x, y) => !!(S.players[pid] && blessed(S.players[pid], x, y)), setNature, natureHours, setNatureTell, setMarks, natureMarks: () => MARKS, boats: () => Array.from(BOATS.values()), fallThrough, lakeKey, sunkIn, lazy: LAZY, zoneIndex: () => ZINDEX, hasZone: (id) => !!(M.hasZone && M.hasZone(id)),
      get rngState() { return R.state; },
      prayers: () => PRAY.list || [], prayer: (id) => PRAYERS[id] || null, maxPp, overhead, protects, boostOf,
      /* ticks the points last: with what is on now (null when nothing drains), or from `pts` points at `drain` per tick */
      prayTicks(p, pts, drain) { let d = drain; if (d == null) { d = 0; for (const id in p.pray || {}) d += (PRAYERS[id] && PRAYERS[id].drain) || 0; } if (!d) return null; const n = pts == null ? (p.pp | 0) : pts, rs = resist(p, d); return n <= 0 ? 0 : Math.ceil(((n - 1) * rs + rs + 1 - (pts == null ? (p.pd | 0) : 0)) / d); },
      isHawk, passageAt, crateAt, signAt, airborne, hasFlag, flag: (k) => FLAGS[k] || null, searchOpen, coverBlocks, hawkMax: () => HK.hp, slotLimit, lv, maxHp, combatLevel, mobCombat, bonuses, wclass, style, styles: (p) => STYLES[wclass(p)], maxHit, attackSpeed, attackRange, spell, invCount, lvlOf, storyPoints, storyMax, scoreKill, mergeScores, setScoreTotal, scoresOf, scoreBoard, scoreRead,
      xpFor: (L) => XP[Math.max(1, Math.min(99, L))], item: (id) => IT[id], node: (i) => M.nodeAt(i), nodeDef, shop: shopOf, mobByUid,
      priceBuy, priceSell, carried, capacity, burden, speechPct: (p) => speechPermille(p) / 10, START: { points: START.points || 10, max: START.maxPerSkill || 5, skills: START.skills || [] }, validStart,
      reqFail, EQ_SLOTS, idx, inReach,
      setAuth, isAuth, zoneOf, areaOf: zoneOf, regionOf: M.regionOf, uidSpace, setWeather, setSeason, weatherOf: (z) => S.weather[weatherZone(z)] || null, weatherZone, wx, hostFire, fireAdd, fireOut, nodeAt, canPlant, plantYoung, plantHour: PLANT_HOUR, plantSnap, acceptPlant, acceptUnplant, hostPlant, hostUnplant, EFFECTS: Object.keys(EFFECTS), watchPhase, lampLit, guardCb: GSTAT.cb,
      applyFx: (uid, kind, ticks) => { const m = mobByUid(uid); if (!m || isAuth(m.zone) || !EFFECTS[kind]) return; m.fx = m.fx || {}; m.fx[kind] = { until: S.t + ticks, dmg: 0, src: null, next: 1e12 }; ev({ e: 'fx', mob: uid, fx: kind, ticks }); }, addPuppet, setPuppet, claim, hostDrop, applyMobs, groundAdd, groundRemove, groundFull, applyHit, grantItem, storeItem, takeOff: (pid, k) => { const p = S.players[pid]; return p ? takeOff(p, k) : null; }, setFelled,
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
