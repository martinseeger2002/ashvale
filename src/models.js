/* ASHVALE 3D models: every character, monster, NPC, item, projectile and inventory icon, built in code from flat-shaded
   low-poly shapes in the classic RuneScape (2004) style. No textures, no files: small to inscribe and always consistent.
   Gear is made of swappable parts on a jointed rig, so whatever a player wears shows on the 3D character, tier by tier.

   The SHAPES of everything live in data/parts/*.json (one file per character, gear type and clothing piece; pure data, see
   tools/make_parts.py for the format). This module is the rig, the animations and the assembler that builds parts.
   Module contract (one export, no imports, no top-level side effects; three.js is passed in so it can be upgraded alone):
     const M = createModels(THREE, {parts: {id: partJson}, onReject(id, why)})   parts from anyone are validated first
     M.addPart(json) / M.validate(json) / M.parts / M.items
     M.tiers                       {metal, wood, cloth}: colours for tiers 1-5 (items.json tierNames: Bronze..Adamant etc.)
     M.humanoid({build, skin, hair, shirt, pants, shoes, robe, apron, beard, hood})  -> H   build: normal | small | big
     M.monster(key)                rat | wolf | goblin | bandit | bandit_leader | chicken | boar | deer | ... (any char part)  -> H (same interface)
     M.npc(key)                    maren | tam | garrick  -> H
     char parts may also set: vars {..} (body expression flags, e.g. goblin, skull), hide [segment names], gearTint
                                   {slot: colour}, op (0.15-1 see-through), float (metres hovering)
     M.item(id)                    ground-loot model of any items.json id (Object3D, rests on y = 0)
     M.projectile(kind, tierOrColor)   'arrow' (tier 1-5) | 'spell' (tier or '#rrggbb'); points along +Z
     M.icon(id, size)              dataURL of the item rendered for an inventory slot (null without WebGL)
   H (a character):
     H.object                      THREE.Group, origin at the feet, facing +Z; scale it freely (nothing assumes world size)
     H.height                      head-top height in the object's parent space (includes H.object.scale)
                                   H.setGear({head, body, legs, weapon, shield, ammo, cape, pack, feet})   item ids or null; the bow is two-handed (hides the shield);
                                   head may be a helmet OR a hat item (hat_cap...), cape a cape item (cape_red...),
                                   body a plate OR a cosmetic robe (robe_red...) that paints the shirt and pants as a robe
     H.setTool(id|null)            hatchet | pickaxe | net shown in hand instead of the weapon while skilling
     H.setOutfit(patch)            change or add outfit parts (hair, beard, hat, shirt, pants, boots, gloves, belt, cape...);
                                   H.outfit reads it back (save it with the player). M.outfitStyles / M.palette list choices
     H.play(name, {loop, speed})   idle walk run slash stab crush block hit death bow cast chop mine fish cook pickup eat
                                   golfaddress golfswing golffinish puttaddress putt
                                   (animals map slash/stab/crush/bite to a bite). Loops keep running; a one-shot plays and
                                   returns to the last loop, except death, which holds its last frame.
     H.attackAnim(itemId)          the attack anim for a weapon (sword slash, bow, staff cast, unarmed crush)
     H.update(dt)                  advance animation, seconds
     H.onEvent(fn)                 fn(type, animName): 'impact' at the hit frame of attacks/bites/skilling swings, 'done' at
                                   the end of a one-shot
     H.muzzle(v?)                  world position where a projectile leaves (bow nock, staff orb, else the hand)
     H.setOpacity(a)               fade (death); H.dispose() frees geometry and own materials
    H.setTint(color|null, s)      status colour wash 0..1 (frozen '#9fd8ff' .55, poison, burn); survives gear/outfit rebuilds
    H.setFrozen(on)               hold the current pose (animation time stops) */
export function createModels(THREE, opts) {
  opts = opts || {};
  const TAU = Math.PI * 2;
  const MATS = new Map();
  function mat(color, extra) {
    const key = color + (extra ? JSON.stringify(extra) : '');
    let m = MATS.get(key);
    if (!m) { m = new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra || {})); MATS.set(key, m); }
    return m;
  }
  const glowMat = c => mat(c, { emissive: c, emissiveIntensity: 0.6 });
  function mesh(geo, c, x, y, z) {
    const m = new THREE.Mesh(geo, typeof c === 'string' ? mat(c) : c);
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = false; return m;
  }
  const box = (w, h, d, c, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z);
  const cyl = (rt, rb, h, c, x, y, z, seg) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 7), c, x, y, z);
  const cone = (r, h, c, x, y, z, seg) => mesh(new THREE.ConeGeometry(r, h, seg || 6), c, x, y, z);
  const ball = (r, c, x, y, z, d) => mesh(new THREE.IcosahedronGeometry(r, d || 0), c, x, y, z);
  const group = (x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); return g; };
  function shade(hex, f) {   /* darker (f < 1) or lighter (f > 1) version of a colour */
    const c = new THREE.Color(hex); c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f);
    return '#' + c.getHexString();
  }
  const LEATHER = '#6b4a2b', DARK = '#1c1a1e';

  /* ---------- parts: expressions, colours, shapes ---------- */
  const PARTS = {}, ITEMS = {};   /* ITEMS: item id -> {part, t, c} */
  const LIMITS = { shapes: 400, size: 4, depth: 4 };
  const TYPES = new Set(['box', 'cyl', 'cone', 'sphere', 'ico', 'capsule', 'tube', 'kite', 'torus', 'disc', 'group']);
  function validate(pt) {   /* a part from anyone: known kinds and shape types only, bounded sizes and counts; returns a reason or null */
    if (!pt || pt.ashvale3d !== 'part' || typeof pt.id !== 'string' || !/^[a-z0-9_.]+$/.test(pt.id)) return 'not an ASHVALE part';
    let n = 0;
    const walk = (list, d) => {
      if (!Array.isArray(list)) return null;
      if (d > LIMITS.depth) return 'nested too deep';
      for (const s of list) {
        if (!s || !TYPES.has(s.t)) return 'unknown shape ' + (s && s.t);
        if (++n > LIMITS.shapes) return 'too many shapes';
        for (const v of (s.s || [])) if (typeof v === 'number' && Math.abs(v) > LIMITS.size) return 'shape too big';
        if (s.children) { const e = walk(s.children, d + 1); if (e) return e; }
      }
      return null;
    };
    for (const k of ['shapes', 'groundShapes', 'segments', 'face', 'projectile']) { const e = walk(pt[k], 0); if (e) return e; }
    return null;
  }
  function addPart(pt) {
    const why = validate(pt); if (why) { if (opts.onReject) opts.onReject(pt && pt.id, why); return false; }
    PARTS[pt.id] = pt;
    const it = pt.items;
    const put = (id, rec) => { const prev = ITEMS[id]; if (prev && prev.part && prev.part.kind === 'gear' && pt.kind !== 'gear') return; ITEMS[id] = rec; };   /* a worn model wins over an icon of the same item */
    if (typeof it === 'string' && pt.tiers) for (let t = pt.tiers[0]; t <= pt.tiers[1]; t++) put(it.replace('{t}', t), { part: pt, t });
    else if (Array.isArray(it)) for (const id of it) put(id, { part: pt, t: 0 });
    else if (it && typeof it === 'object') for (const id in it) put(id, { part: pt, t: 0, c: it[id] });
    return true;
  }
  for (const id in (opts.parts || {})) { const p = opts.parts[id]; addPart(p && p.data && p.ashvale3d === 'module' ? p.data : p); }
  const PAL = PARTS.palette || { tiers: { metal: [], wood: [], cloth: [] }, named: {}, creator: { skin: [], hair: [], cloth: [] }, defaultOutfit: {} };
  const TIERS = PAL.tiers;
  const GOLD = PAL.named.gold || '#d9a930';

  /* tiny safe expression evaluator: numbers, variables, + - * / ( ), comparisons, && || !, ?: */
  function ev(v, V) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return v == null ? 0 : +v || 0;
    const tk = v.match(/\d*\.?\d+(?:e-?\d+)?|[A-Za-z_]\w*|&&|\|\||==|!=|>=|<=|[-+*/()<>!?:]/g) || []; let i = 0;
    const peek = () => tk[i], next = () => tk[i++];
    function prim() {
      const t = next();
      if (t === '(') { const x = tern(); next(); return x; }
      if (t === '-') return -prim();
      if (t === '!') return prim() ? 0 : 1;
      if (/^[A-Za-z_]/.test(t)) return +(V[t] || 0);
      return parseFloat(t) || 0;
    }
    function mul() { let x = prim(); while (peek() === '*' || peek() === '/') { const o = next(), y = prim(); x = o === '*' ? x * y : x / (y || 1); } return x; }
    function add() { let x = mul(); while (peek() === '+' || peek() === '-') { const o = next(), y = mul(); x = o === '+' ? x + y : x - y; } return x; }
    function cmp() { let x = add(); while (/^(==|!=|>=|<=|<|>)$/.test(peek() || '')) { const o = next(), y = add(); x = { '==': x === y, '!=': x !== y, '>=': x >= y, '<=': x <= y, '<': x < y, '>': x > y }[o] ? 1 : 0; } return x; }
    function and() { let x = cmp(); while (peek() === '&&') { next(); const y = cmp(); x = x && y ? 1 : 0; } return x; }
    function or() { let x = and(); while (peek() === '||') { next(); const y = and(); x = x || y ? 1 : 0; } return x; }
    function tern() { const c = or(); if (peek() === '?') { next(); const a = tern(); next(); const b = tern(); return c ? a : b; } return c; }
    try { const r = tern(); return isFinite(r) ? r : 0; } catch (e) { return 0; }
  }
  const evs = (a, V) => (a || []).map(x => ev(x, V));
  function colour(tok, C) {   /* C: {t, family, c, skin, hair, beard, eyes, brow} */
    if (typeof tok !== 'string') return '#ff00ff';
    if (tok[0] === '#') return tok;
    const [name, f] = tok.slice(1).split(':');
    let base;
    if (name === 'tier') base = C.tint || (TIERS[C.family || 'metal'] || [])[C.t || 1];
    else if (/^metal\d$/.test(name)) base = TIERS.metal[+name.slice(5)];
    else if (name in C && typeof C[name] === 'string') base = C[name];
    else base = PAL.named[name];
    base = base || '#ff00ff';
    return f ? shade(base, +f) : base;
  }
  function kiteGeo(s, depth) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.3 * s); sh.lineTo(0.18 * s, 0.14 * s); sh.lineTo(0.12 * s, -0.12 * s); sh.lineTo(0, -0.34 * s);
    sh.lineTo(-0.12 * s, -0.12 * s); sh.lineTo(-0.18 * s, 0.14 * s); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  }
  function shapeObj(sh, C, V, flip) {   /* one shape -> Object3D (or null when its "if" is false); flip mirrors it to the left */
    if (sh.if != null && !ev(sh.if, V)) return null;
    const s = evs(sh.s, V), p = evs(sh.p || [0, 0, 0], V), r = evs(sh.r || [0, 0, 0], V), k = evs(sh.k || [1, 1, 1], V);
    let o;
    if (sh.t === 'group') {
      o = new THREE.Group();
      for (const ch of sh.children || []) { const c = shapeObj(ch, C, V, false); if (c) o.add(c); }
    } else {
      let geo;
      const seg = sh.seg;
      switch (sh.t) {
        case 'box': geo = new THREE.BoxGeometry(s[0], s[1], s[2]); break;
        case 'cyl': geo = sh.open ? new THREE.CylinderGeometry(s[0], s[1], s[2], seg || 7, 1, true, Math.PI * ((sh.theta || [0, 2])[0]), Math.PI * ((sh.theta || [0, 2])[1])) : new THREE.CylinderGeometry(s[0], s[1], s[2], seg || 7); break;
        case 'cone': geo = new THREE.ConeGeometry(s[0], s[1], seg || 6); break;
        case 'sphere': geo = new THREE.SphereGeometry(s[0], (seg || [10, 7])[0], (seg || [10, 7])[1], 0, Math.PI * 2, 0, Math.PI * (sh.th || 1)); break;
        case 'ico': geo = new THREE.IcosahedronGeometry(s[0], sh.d || 0); break;
        case 'capsule': geo = new THREE.CapsuleGeometry(s[0], s[1], 2, 7); break;
        case 'tube': { const P = (sh.pts || []).map(q => new THREE.Vector3(...evs(q, V))); geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(P[0], P[1], P[2]), 10, s[0], 5, false); break; }
        case 'kite': geo = kiteGeo(s[0], s[1]); break;
        case 'torus': geo = new THREE.TorusGeometry(s[0], s[1], (seg || [4, 8])[0], (seg || [4, 8])[1], Math.PI * (sh.arc || 2)); break;
        case 'disc': geo = new THREE.CircleGeometry(s[0], seg || 10); break;
      }
      const c = colour(sh.c, C), ex = {};
      if (sh.glow) { ex.emissive = c; ex.emissiveIntensity = 0.6; }
      if (sh.op != null) { ex.transparent = true; ex.opacity = sh.op; }
      if (sh.ds) ex.side = THREE.DoubleSide;
      o = new THREE.Mesh(geo, mat(c, Object.keys(ex).length ? ex : null));
      o.castShadow = sh.shadow !== false;
    }
    o.position.set(flip ? -p[0] : p[0], p[1], p[2]);
    o.rotation.set(r[0], flip ? -r[1] : r[1], flip ? -r[2] : r[2]);
    o.scale.set(k[0], k[1], k[2]);
    if (sh.name) o.name = sh.name;
    if (sh.tag) o.userData.tag = sh.tag;
    return o;
  }
  function build(list, C, V, place, hidden) {   /* place(jointName, side) -> parent Object3D or null; returns created objects */
    const out = [];
    for (const sh of list || []) {
      if (hidden && sh.tag && hidden.has(sh.tag)) continue;
      const j = sh.j || null, star = j && j.endsWith('*');
      const sides = star ? [[j.slice(0, -1) + 'R', false], [j.slice(0, -1) + 'L', true]] : [[j, false]];
      for (const [jn, flip] of sides) {
        const parent = place(jn); if (!parent) continue;
        for (const f of sh.mirror ? [false, true] : [false]) { const o = shapeObj(sh, C, V, flip !== f); if (o) { parent.add(o); out.push(o); } }
      }
    }
    return out;
  }
  const styleOf = slot => Object.values(PARTS).filter(p => p.kind === 'cloth' && p.slot === slot && !p.homes).map(p => p.style);   /* a part with homes is offered only by those homes' creators */
  const clothPart = (slot, style) => (slot === 'boots' && style && PARTS['cloth.boots_' + style]) || PARTS['cloth.' + (['boots', 'gloves', 'belt', 'cape', 'apron'].includes(slot) ? slot : slot + '_' + style)];   /* boots may have a cut (look.feet, e.g. moccasins) */
  function info(id) {
    const e = ITEMS[id]; if (!e) return { kind: id, tier: 0 };
    const p = e.part, kind = p.kind === 'cloth' ? p.slot : (p.items && typeof p.items === 'string' ? p.items.split('_')[0] : p.slot);
    return { kind, tier: e.t, family: p.family, part: p, color: e.c != null ? e.c : p.family ? TIERS[p.family][e.t] : p.color, slot: p.slot };
  }
  const OUTFIT_STYLES = { hair: styleOf('hair'), beard: [null].concat(styleOf('beard')), hat: [null].concat(styleOf('hat')), shirt: styleOf('shirt'), pants: styleOf('pants'), feet: styleOf('boots') };
  const PALETTE = PAL.creator;
  const DEFAULT_OUTFIT = PAL.defaultOutfit;

  /* ---------- humanoid: body part + outfit (cloth parts) + gear parts ---------- */
  function humanoid(o) {
    o = o || {};
    const body = PARTS[o.body || 'body.human'];
    const build_ = o.build || 'normal', big = build_ === 'big', small = build_ === 'small';
    const V0 = Object.assign({ W: big ? 1.16 : 1, small: small ? 1 : 0, big: big ? 1 : 0 }, o.vars || {});   /* char vars, e.g. {goblin:1, skull:1} */
    const RS = { v: 1 };   /* the body's own root scale, so a body change can keep the size the engine set on top of it */
    const HIDE = new Set(o.hide || []), TINT = o.gearTint || {};   /* char: body segments to leave out (a legless wraith), gear recolours by slot */
    const outfit = JSON.parse(JSON.stringify(DEFAULT_OUTFIT));
    /* old-style options (colours) still work */
    if (o.skin) outfit.skin = o.skin;
    if (o.hair === null) outfit.hair = 'bald'; else if (typeof o.hair === 'string' && o.hair[0] === '#') outfit.hairColor = o.hair; else if (o.hair) outfit.hair = o.hair;
    if (typeof o.shirt === 'string') outfit.shirt = { style: 'tunic', color: o.shirt };
    if (typeof o.pants === 'string') outfit.pants = { style: 'trousers', color: o.pants };
    if (o.robe) { outfit.shirt = { style: 'robe', color: o.robe }; outfit.pants = { style: 'robe', color: o.robe }; }
    if (o.shoes) outfit.boots = o.shoes;
    if (o.apron) outfit.apron = o.apron;
    if (o.hood) outfit.hat = { style: 'hood', color: o.hood };
    if (o.beard) { if (o.beard[0] === '#') { outfit.beard = 'full'; outfit.beardColor = o.beard; } else outfit.beard = o.beard; }
    if (o.outfit) for (const k in o.outfit) outfit[k] = o.outfit[k];

    V0.fem = outfit.body === 'female' ? 1 : 0;   /* 2026-10-01: male or female; body.human's expressions read `fem` */
    const root = new THREE.Group(), J = {};
    for (const name in body.joints) { const g = new THREE.Group(); g.name = name; J[name] = g; }
    function placeJoints() { for (const name in body.joints) { const q = evs(body.joints[name][1], V0); J[name].position.set(q[0], q[1], q[2]); } }
    placeJoints();
    for (const name in body.joints) { const par = body.joints[name][0]; (par ? J[par] : root).add(J[name]); }
    if (J.hipL && J.hipR) J.hipL.rotation.order = J.hipR.rotation.order = 'YXZ';   /* a hip's y undoes the pelvis turn after its swing (golf: the feet stay planted); with y = 0, as in every other animation, nothing changes */
    J.head.scale.setScalar(ev(body.headScale || 1, V0));
    const rot = obj => ({ kind: 'rot', o: obj, r0: [obj.rotation.x, obj.rotation.y, obj.rotation.z] });
    const joints = {
      torso: rot(J.torso), neck: rot(J.neck), shL: rot(J.shL), elL: rot(J.elL), shR: rot(J.shR), elR: rot(J.elR),
      hipL: rot(J.hipL), kneeL: rot(J.kneeL), hipR: rot(J.hipR), kneeR: rot(J.kneeR), cape: rot(J.cape),
      pelvis: rot(J.hips),   /* the hips' turn (golf); every other animation leaves it at 0 */
      lift: { kind: 'y', o: J.hips, p0: J.hips.position.y }, fall: { kind: 'rx', o: J.body },
      club: { kind: 'val', v: [0, 0, 0] }   /* golf: [wrist hinge of the club (radians toward the target), how much the head sits at the ball], read by the engine */
    };
    const H = character(root, joints, HUMAN);
    H.clubHinge = () => joints.club.v[0];
    H.clubToBall = () => joints.club.v[1];   /* 1 = the clubhead sits at the ball (address, impact, putting) */
    const gear = { head: null, body: null, legs: null, weapon: null, shield: null, ammo: null, cape: null, pack: null, feet: null, ring: null };
    let tool = null, tip = null, made = [];
    const place = jn => jn ? J[jn] || null : root;

    function rebuild() {
      for (const m of made) { if (m.parent) m.parent.remove(m); m.traverse(x => { if (x.isMesh) x.geometry.dispose(); }); }
      made = []; tip = null; H.carry = {};
      const fem = outfit.body === 'female' ? 1 : 0;
      if (fem !== V0.fem) { const k = root.scale.x / (RS.v || 1); V0.fem = fem; placeJoints(); RS.v = ev(body.rootScale || 1, V0); root.scale.setScalar(RS.v * k); joints.lift.p0 = J.hips.position.y; }   /* keep the size the engine gave the figure (2026-10-09: Random in the creator flipped the body and the character doubled in size) */
      const O = Object.assign({}, outfit);
      const hatI = info(gear.head), capeI = info(gear.cape), bodyI = info(gear.body), legsI = info(gear.legs);
      if (hatI.slot === 'hat') O.hat = { style: hatI.part.style, color: hatI.color };
      if (capeI.slot === 'cape') O.cape = capeI.color;
      V0.dragon = gear.cape === 'dragon_cape' ? 1 : 0;   /* white dragon mark on the orange cape's back */
      /* [Claude 2026-10-20] worn clothes (the operator: golf clothing at the Saltmere Links): a cosmetic shirt on the body or trousers on the
         legs is drawn as your shirt or trousers, cut and colour from its part (tools/golf/make_golfwear.py) */
      if (bodyI.slot === 'shirt') O.shirt = { style: bodyI.part.style, color: bodyI.color };
      if (legsI.slot === 'pants') O.pants = { style: legsI.part.style, color: legsI.color };
      if (bodyI.slot === 'robe') {
        O.shirt = { style: 'robe', color: bodyI.color }; O.pants = { style: 'robe', color: bodyI.color };
        if (gear.body === 'vorthan_robe') O.hat = { style: 'hood', color: bodyI.color };
      }
      const C = { skin: O.skin, hair: O.hairColor, beard: O.beardColor || O.hairColor, eyes: O.eyes, brow: O.hair === 'bald' ? shade(O.skin, 0.75) : O.hairColor };
      /* what's worn decides what's hidden */
      const pieces = [];   /* [part, colour] */
      const sh = O.shirt && clothPart('shirt', O.shirt.style), pa = O.pants && clothPart('pants', O.pants.style);
      if (pa) pieces.push([pa, O.pants.color]);
      if (sh) pieces.push([sh, O.shirt.color]);
      for (const sl of ['boots', 'gloves', 'belt', 'apron', 'cape']) if (O[sl] && !(sl === 'boots' && gear.feet)) pieces.push([clothPart(sl, sl === 'boots' ? O.feet : null), O[sl]]);
      const hairP = clothPart('hair', O.hair || 'short'), beardP = O.beard ? clothPart('beard', O.beard) : null, hatP = O.hat ? clothPart('hat', O.hat.style) : null;
      const gearParts = [];
      const add = (id, slot) => { const I = info(id); if (I.part && I.part.kind === 'gear') gearParts.push({ I, slot }); };
      for (const sl of ['head', 'body', 'legs', 'shield', 'ammo', 'pack', 'feet', 'ring']) if (gear[sl]) add(gear[sl], sl);
      if (tool) add(tool, 'weapon'); else if (gear.weapon) add(gear.weapon, 'weapon');
      const twoHanded = gearParts.some(g => g.slot === 'weapon' && g.I.part.twoHanded);
      const hidden = new Set(), tags = new Set();
      for (const [p] of pieces) for (const t of p.tags || []) tags.add(t);
      for (const g of gearParts) {
        for (const h of g.I.part.hides || []) hidden.add(h);
        for (const cond in g.I.part.hidesIf || {}) if (ev(cond, { t: g.I.tier })) for (const h of g.I.part.hidesIf[cond]) hidden.add(h);
      }
      if (hatP && !hidden.has('hat')) for (const h of hatP.hides || []) hidden.add(h);
      /* body segments, painted by clothing */
      const paint = {};
      for (const [p, col] of pieces) for (const seg in p.paint || {}) paint[seg] = colour(p.paint[seg], Object.assign({ c: col }, C));
      for (const seg of body.segments) {
        if (HIDE.has(seg.name)) continue;
        const s2 = paint[seg.name] ? Object.assign({}, seg, { c: paint[seg.name] }) : seg;
        made.push(...build([s2], C, V0, place));
      }
      made.push(...build(body.face, C, V0, () => J.head));
      for (const [p, col] of pieces) { if (p.unless && tags.has(p.unless)) continue; made.push(...build(p.shapes, Object.assign({ c: col }, C), V0, place)); }
      if (!hidden.has('hair') && hairP) made.push(...build(hairP.shapes, C, V0, place, hidden));
      if (!hidden.has('beard') && beardP) made.push(...build(beardP.shapes, C, V0, place));
      if (!hidden.has('hat') && hatP) made.push(...build(hatP.shapes, Object.assign({ c: O.hat.color || hatP.color }, C), V0, place));
      for (const g of gearParts) {
        const P = g.I.part, Cg = Object.assign({ t: g.I.tier, family: P.family, c: TINT[g.slot] || g.I.color, tint: TINT[g.slot] || null }, C), V = Object.assign({ t: g.I.tier }, V0);
        if (g.slot === 'shield' && twoHanded) continue;
        if (P.mount) {
          const m = new THREE.Group(), mp = evs(P.mount.p || [0, 0, 0], V), mr = evs(P.mount.r || [0, 0, 0], V);
          m.position.set(mp[0], mp[1], mp[2]); m.rotation.set(mr[0], mr[1], mr[2]);
          (J[P.mount.j] || root).add(m); made.push(m);
          build(P.shapes, Cg, V, () => m);
          const t = m.getObjectByName('tip'); if (t && g.slot === 'weapon') tip = t;
        } else made.push(...build(P.shapes, Cg, V, place));
        if (g.slot === 'weapon' && P.carry) H.carry = JSON.parse(JSON.stringify(P.carry));
      }
    }
    H.setGear = function (g) { for (const k in gear) gear[k] = g && g[k] != null ? g[k] : null; rebuild(); return H; };
    H.setTool = function (id) { tool = id && ITEMS[id] && ITEMS[id].part.tool ? id : null; rebuild(); return H; };
    Object.defineProperty(H, 'tool', { get: () => tool });
    H.setOutfit = function (patch) {
      for (const k in patch || {}) {
        const v = patch[k];
        if ((k === 'shirt' || k === 'pants' || k === 'hat') && v && typeof v === 'object') outfit[k] = Object.assign({}, outfit[k] || {}, v);
        else outfit[k] = v;
      }
      rebuild(); return H;
    };
    Object.defineProperty(H, 'outfit', { get: () => JSON.parse(JSON.stringify(outfit)) });
    Object.defineProperty(H, 'gear', { get: () => Object.assign({}, gear) });
    H.attackAnim = function (id) { const I = info(id || gear.weapon); return (I.part && I.part.attack) || 'crush'; };
    H.muzzle = function (out) { out = out || new THREE.Vector3(); (tip || J.handR).getWorldPosition(out); return out; };
    Object.defineProperty(H, 'height', { get: () => (body.height || 1.86) * root.scale.y });
    RS.v = ev(body.rootScale || 1, V0); root.scale.setScalar(RS.v);
    H._parts = { head: J.head, torso: J.torso, handL: J.handL, handR: J.handR, shL: J.shL, shR: J.shR };   /* hands and shoulders: golf draws the club from them */
    rebuild();
    H.play('idle'); H.update(0);
    return H;
  }

  function fromChar(key) {
    const c = PARTS['char.' + key];
    if (!c) return null;
    if (c.body === 'beast') return beast(c.beast || {});
    if (c.body === 'quadruped') return quadruped(c.quadruped || {});   /* cats first (2026-10-19), any supple four-legged thing after */
    if (c.body === 'bird') return bird(c.bird || {});
    if (c.body === 'spider') return spider(c.spider || {});
    if (c.body === 'chest') return chest(c.chest || {});
    if (c.body === 'wagon') return wagon(c.wagon || {});
    if (c.body === 'portal') return portal(c.portal || {});
    const H = humanoid({ build: c.build, outfit: c.outfit, vars: c.vars, hide: c.hide, gearTint: c.gearTint });
    if (c.gear) H.setGear(c.gear);
    if (c.op != null) H.setOpacity(Math.max(0.15, Math.min(1, +c.op)));   /* see-through (ghosts, spirits) */
    if (c.float) {   /* hover and bob gently (wraiths): offset the whole body above its feet */
      const lift = Math.max(0, Math.min(1, +c.float)); let t = 0; const up = H.update, bodyJ = H.object.children[0];
      H.update = function (dt) { up(dt); t += dt > 0 && dt < 1 ? dt : 0; if (bodyJ) bodyJ.position.y = lift + 0.04 * Math.sin(t * 2.2); };
    }
    return H;
  }

  /* ---------- poses: keyframes of joint rotations, interpolated with smoothstep ---------- */
  const ease = t => t * t * (3 - 2 * t);
  const vec = v => v == null ? null : (typeof v === 'number' ? [v, 0, 0] : [v[0] || 0, v[1] || 0, v[2] || 0]);
  function keyed(keys) {   /* -> fn(t, base) giving the pose; joints missing from a key use base (the carry pose) */
    return function (t, base) {
      let i = 0; while (i < keys.length - 2 && t > keys[i + 1].t) i++;
      const a = keys[i], b = keys[i + 1], f = ease(Math.min(1, Math.max(0, (t - a.t) / ((b.t - a.t) || 1))));
      const out = {}, names = new Set([...Object.keys(a.p), ...Object.keys(b.p), ...Object.keys(base)]);
      for (const n of names) {
        const va = vec(a.p[n]) || vec(base[n]) || [0, 0, 0], vb = vec(b.p[n]) || vec(base[n]) || [0, 0, 0];
        out[n] = [va[0] + (vb[0] - va[0]) * f, va[1] + (vb[1] - va[1]) * f, va[2] + (vb[2] - va[2]) * f];
      }
      return out;
    };
  }
  const K = (...pairs) => { const keys = []; for (let i = 0; i < pairs.length; i += 2) keys.push({ t: pairs[i], p: pairs[i + 1] }); return keyed(keys); };
  function withBase(base, p) { const o = {}; for (const n in base) o[n] = vec(base[n]); for (const n in p) o[n] = vec(p[n]); return o; }

  /* golf (2026-10-19, the Saltmere Links). The ball lies in front of the feet, the target to the golfer's left (+x).
     The operator: the first swing looked floppy - it stopped at every key and only the arms moved. This one follows a real swing:
     the hips turn about half as far as the shoulders (pelvis), the spine keeps its tilt to impact, the left arm stays
     straight, the right elbow folds, the wrists cock on the way back and hold their angle into the downswing (the lag),
     release at the ball, then the body stands up into a full finish facing the target, right heel up. The tempo is slow
     back, quicker down: the keys are passed through on a smooth curve (no stop at each key). club: [wrist hinge toward the
     target, how much the head sits at the ball] - the engine draws the club from the hands. */
  const plant = (pel, o) => Object.assign({ pelvis: [0, pel, 0] }, o, { hipL: [(o.hipL || [-0.3])[0], -pel, (o.hipL || [0, 0, 0.08])[2] || 0.08], hipR: [(o.hipR || [-0.3])[0], -pel, (o.hipR || [0, 0, -0.08])[2] || -0.08] });   /* feet stay put while the pelvis turns */
  const G_ADDR = plant(0, { torso: [0.62, 0, 0], neck: [-0.45, 0, 0], kneeL: [0.38], kneeR: [0.38], lift: [-0.07],
    shL: [-0.42, 0, -0.3], elL: [-0.04], shR: [-0.38, 0, 0.34], elR: [-0.22], club: [0.12, 1] });
  const G_TAKE = plant(-0.12, { torso: [0.62, -0.3, 0], neck: [-0.45, 0.38, 0], kneeL: [0.4], kneeR: [0.36], lift: [-0.07],
    shL: [-0.6, 0, -0.44], elL: [-0.02], shR: [-0.52, 0, 0.26], elR: [-0.3], club: [0.25, 0.55] });
  const G_HALF = plant(-0.35, { torso: [0.6, -0.6, 0], neck: [-0.43, 0.8, 0], kneeL: [0.45], kneeR: [0.33], lift: [-0.07],
    shL: [-1.05, 0, -0.62], elL: [0], shR: [-0.95, 0, 0.12], elR: [-0.85], club: [1.05, 0] });
  const G_TOP = plant(-0.6, { torso: [0.56, -0.8, 0], neck: [-0.4, 1.25, 0], kneeL: [0.5], kneeR: [0.3], lift: [-0.07],
    shL: [-1.85, 0, -0.85], elL: [-0.04], shR: [-1.6, 0, -0.05], elR: [-1.75], club: [2.05, 0] });
  const G_TRANS = plant(-0.35, { torso: [0.58, -0.82, 0], neck: [-0.42, 1.08, 0], kneeL: [0.42], kneeR: [0.34], lift: [-0.075],
    shL: [-1.7, 0, -0.8], elL: [-0.03], shR: [-1.5, 0, 0], elR: [-1.7], club: [2.15, 0] });
  const G_DOWN = plant(0.1, { torso: [0.62, -0.5, 0], neck: [-0.45, 0.4, 0], kneeL: [0.3], kneeR: [0.42], lift: [-0.075],
    shL: [-0.95, 0, -0.55], elL: [0], shR: [-0.85, 0, 0.22], elR: [-1.0], club: [1.45, 0.15] });
  const G_HIT = plant(0.5, { torso: [0.6, -0.42, 0], neck: [-0.45, -0.08, 0], kneeL: [0.2], kneeR: [0.48], lift: [-0.07],
    shL: [-0.45, 0, -0.3], elL: [0], shR: [-0.42, 0, 0.36], elR: [-0.12], club: [0, 1] });
  const G_REL = plant(0.75, { torso: [0.55, -0.15, 0], neck: [-0.42, -0.45, 0], kneeL: [0.14], kneeR: [0.55], lift: [-0.06],
    shL: [-0.8, 0, -0.1], elL: [-0.15], shR: [-0.85, 0, 0.5], elR: [0], club: [-0.6, 0.2] });
  const G_THRU = plant(1.05, { torso: [0.38, 0.15, 0], neck: [-0.3, -0.9, 0], kneeL: [0.08], kneeR: [0.65], lift: [-0.04],
    shL: [-1.7, 0, 0.15], elL: [-0.9], shR: [-1.75, 0, 0.6], elR: [-0.15], club: [-1.4, 0] });
  const G_FIN = plant(1.3, { torso: [0.12, 0.35, 0], neck: [-0.12, -1.1, 0], kneeL: [0.05], kneeR: [0.75], hipR: [-0.35, 0, -0.04], lift: [-0.03],
    shL: [-2.65, 0, 0.3], elL: [-1.6], shR: [-2.75, 0, 0.6], elR: [-1.0], club: [-2.3, 0] });
  const PUTT_ADDR = sw => ({ club: [0, 1], torso: [0.7, sw * 0.08, 0], neck: [-0.55, -sw * 0.08, 0], hipL: [-0.15, 0, 0.05], hipR: [-0.15, 0, -0.05], kneeL: [0.18], kneeR: [0.18], lift: [-0.04],
    shL: [-0.45 - Math.max(0, sw) * 0.2, 0, -0.32 + sw * 0.5], elL: [-0.35], shR: [-0.42 - Math.max(0, -sw) * 0.2, 0, 0.34 + sw * 0.5], elR: [-0.45] });
  /* keys passed through on a Catmull-Rom curve: the motion flows through each key instead of easing to a stop at it */
  function smoothKeyed(keys) {
    return function (t, base) {
      let i = 0; while (i < keys.length - 2 && t > keys[i + 1].t) i++;
      const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
      const u = Math.min(1, Math.max(0, (t - k1.t) / ((k2.t - k1.t) || 1))), u2 = u * u, u3 = u2 * u;
      const out = {}, names = new Set([...Object.keys(k1.p), ...Object.keys(k2.p), ...Object.keys(base)]);
      const val = (k, n) => vec(k.p[n]) || vec(base[n]) || [0, 0, 0];
      for (const n of names) {
        const a = val(k0, n), b = val(k1, n), c = val(k2, n), d = val(k3, n), o = [0, 0, 0];
        for (let q = 0; q < 3; q++) o[q] = 0.5 * (2 * b[q] + (c[q] - a[q]) * u + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * u2 + (3 * b[q] - a[q] - 3 * c[q] + d[q]) * u3);
        out[n] = o;
      }
      return out;
    };
  }
  const D_IDLE = { torso: [0.2], neck: [0.08], shL: [-0.62, 0, 0.14], shR: [-0.62, 0, -0.14], elL: [-0.8], elR: [-0.8] };   /* a dealer's hands resting on the table edge */
  const KS = (...pairs) => { const keys = []; for (let i = 0; i < pairs.length; i += 2) keys.push({ t: pairs[i], p: pairs[i + 1] }); return smoothKeyed(keys); };
  const HUMAN = {
    idle: { loop: true, dur: 3, fn: (t, b) => { const s = Math.sin(TAU * t); return withBase(b, { torso: [0.02 * s, 0, 0], shL: b.shL || [0.04, 0, 0.09], shR: b.shR || [0.04, 0, -0.09], elL: b.elL || [-0.15], elR: b.elR || [-0.15], neck: [0.02 * s, 0, 0], cape: [0.05 + 0.02 * s] }); } },
    walk: { loop: true, dur: 0.9, fn: (t, b) => { const s = Math.sin(TAU * t), c = Math.cos(TAU * t);
      return withBase(b, { hipL: [-0.55 * s], hipR: [0.55 * s], kneeL: [0.12 + 0.6 * Math.max(0, c)], kneeR: [0.12 + 0.6 * Math.max(0, -c)],
        shL: b.shL || [0.45 * s, 0, 0.06], shR: b.shR || [-0.45 * s, 0, -0.06], elL: b.elL || [-0.35], elR: b.elR || [-0.35], torso: [0.05, 0.06 * s, 0], lift: [0.03 * Math.abs(c)], cape: [0.3 + 0.06 * s] }); } },
    run: { loop: true, dur: 0.58, fn: (t, b) => { const s = Math.sin(TAU * t), c = Math.cos(TAU * t);
      return withBase(b, { hipL: [-0.95 * s], hipR: [0.95 * s], kneeL: [0.25 + 1.1 * Math.max(0, c)], kneeR: [0.25 + 1.1 * Math.max(0, -c)],
        shL: b.shL || [0.8 * s, 0, 0.08], shR: b.shR || [-0.8 * s, 0, -0.08], elL: b.elL || [-1.25], elR: b.elR || [-1.25], torso: [0.22, 0.1 * s, 0], lift: [0.06 * Math.abs(c)], cape: [0.75 + 0.1 * s] }); } },
    slash: { dur: 0.9, impact: 0.5, fn: K(0, {}, 0.35, { shR: [-2.6, 0, -0.35], elR: [-0.7], torso: [0, 0.45, 0], shL: [-0.3, 0, 0.2], hipL: [-0.15], kneeL: [0.15] },
      0.55, { shR: [-0.6, 0, 0.1], elR: [-0.1], torso: [0.12, -0.45, 0], shL: [0.3, 0, 0.15], hipL: [-0.35], kneeL: [0.35] }, 1, {}) },
    stab: { dur: 0.8, impact: 0.5, fn: K(0, {}, 0.35, { shR: [0.5, 0, -0.1], elR: [-1.6], torso: [0, 0.3, 0] },
      0.52, { shR: [-1.5, 0, 0], elR: [0], torso: [0.15, -0.2, 0], hipL: [-0.35], kneeL: [0.35] }, 1, {}) },
    crush: { dur: 1, impact: 0.58, fn: K(0, {}, 0.4, { shR: [-3, 0, -0.1], elR: [-0.9], shL: [-3, 0, 0.1], elL: [-0.9], torso: [-0.15] },
      0.6, { shR: [-0.9], elR: [-0.2], shL: [-0.9], elL: [-0.2], torso: [0.3], hipL: [-0.3], kneeL: [0.3] }, 1, {}) },
    block: { dur: 0.6, fn: K(0, {}, 0.3, { shL: [-1.3, 0, -0.2], elL: [-0.9], torso: [-0.08], hipL: [-0.2], kneeL: [0.2] }, 0.7, { shL: [-1.3, 0, -0.2], elL: [-0.9], torso: [-0.08], hipL: [-0.2], kneeL: [0.2] }, 1, {}) },
    hit: { dur: 0.4, fn: K(0, {}, 0.3, { torso: [-0.25], neck: [-0.3], shL: [-0.3, 0, 0.4], shR: [-0.3, 0, -0.4] }, 1, {}) },
    death: { dur: 1.1, hold: true, fn: K(0, {}, 0.25, { torso: [-0.3], neck: [-0.3], shL: [-0.5, 0, 0.5], shR: [-0.5, 0, -0.5], kneeL: [0.6], kneeR: [0.6], hipL: [-0.4], hipR: [-0.4] },
      1, { fall: [-1.5], torso: [-0.1], neck: [0.2], shL: [-2.6, 0, 0.6], shR: [-2.6, 0, -0.6], hipL: [-0.25], hipR: [0.1], kneeL: [0.1], kneeR: [0.2], elL: [-0.3], elR: [-0.3] }) },
    /* already dead: arms flung, one knee bent, head lolling. The engine tips the whole rig onto the floor. */
    sprawl: { dur: 0.01, hold: true, fn: (t, b) => withBase(b, {
      neck: [0.55, 0.75, 0.25], torso: [0.04, 0, 0.16],
      shL: [0.2, 0.15, 1.5], shR: [-0.25, -0.1, -1.6], elL: [-0.2], elR: [-1.2],
      hipL: [0.15, 0, 0.55], hipR: [-0.1, 0, -0.42], kneeL: [0.15], kneeR: [0.9]
    }) },
    balance: { loop: true, dur: 2.6, fn: (t, b) => { const s = Math.sin(TAU * t); return withBase(b, {
      shL: [0.2, 0, 1.4], shR: [0.2, 0, -1.4], elL: [-0.2], elR: [-0.15],
      torso: [0.06, 0, 0.1 * s], neck: [-0.05, 0.15 * s, -0.08 * s],
      hipL: [0.08, 0, 0.12], hipR: [-0.06, 0, -0.1], kneeL: [0.18], kneeR: [0.28]
    }); } },
    /* sitting on a rope (Vael): hips on the line, legs hanging, looking up as if a hawk decided the field */
    perch: { loop: true, dur: 3.2, fn: (t, b) => { const s = Math.sin(TAU * t); return withBase(b, {
      lift: [-0.9], hipL: [-1.15, 0, 0.12], hipR: [-1.1, 0, -0.12], kneeL: [0.55], kneeR: [0.65],
      torso: [0.16 + 0.02 * s, 0, 0], neck: [-0.38, 0.06 * s, 0],
      shL: [-0.55, 0, 0.72], elL: [-0.7], shR: [-0.55, 0, -0.72], elR: [-0.7]
    }); } },
    bow: { dur: 1, impact: 0.62, fn: K(0, {}, 0.35, { shL: [-1.55, 0.1, 0], elL: [0], shR: [-1.55, -0.15, 0], elR: [-0.4], torso: [0, 0.5, 0], neck: [0, -0.5, 0] },
      0.6, { shL: [-1.55, 0.1, 0], elL: [0], shR: [-1.45, -0.55, -0.25], elR: [-2.4], torso: [0, 0.6, 0], neck: [0, -0.6, 0] },
      0.68, { shL: [-1.55, 0.1, 0], elL: [0], shR: [-1.3, -0.3, -0.7], elR: [-1], torso: [0, 0.6, 0], neck: [0, -0.6, 0] }, 1, {}) },
    cast: { dur: 1, impact: 0.56, fn: K(0, {}, 0.4, { shR: [-1, 0, -0.2], elR: [-0.6], shL: [-1.2, 0, 0.3], elL: [-0.8], torso: [-0.1] },
      0.58, { shR: [-1.8, 0, 0], elR: [-0.1], shL: [-1.6, 0, 0.2], elL: [-0.2], torso: [0.15] }, 1, {}) },
    chop: { loop: true, dur: 1.2, impact: 0.58, fn: K(0, {}, 0.4, { shR: [-1.6, -0.8, -0.3], elR: [-0.8], shL: [-1.2, 0.6, 0.2], elL: [-0.9], torso: [0, 0.6, 0] },
      0.6, { shR: [-1.1, 0.5, 0], elR: [-0.3], shL: [-1, -0.2, 0.1], elL: [-0.5], torso: [0.1, -0.3, 0] }, 1, {}) },
    /* mining (2026-10-01: "only move their arm that is holding the pickaxe"): the right arm swings, the left hangs */
    mine: { loop: true, dur: 1.2, impact: 0.6, fn: K(0, { shL: [0.05, 0, 0.12], elL: [-0.25] }, 0.4, { shR: [-2.9, 0, -0.1], elR: [-0.8], shL: [0.05, 0, 0.12], elL: [-0.25], torso: [-0.08, 0.15, 0] },
      0.62, { shR: [-0.6, 0, 0], elR: [-0.15], shL: [0.05, 0, 0.12], elL: [-0.25], torso: [0.25, -0.1, 0], hipL: [-0.25], kneeL: [0.25] }, 1, { shL: [0.05, 0, 0.12], elL: [-0.25] }) },
    /* fishing (2026-10-01: "the net should actually go into the water"): crouched at the bank, lift the net, sweep it
       down and forward so the hoop goes under the surface, drag it, lift it out */
    fish: { loop: true, dur: 2.6, impact: 0.55, fn: (() => {
      const crouch = { lift: [-0.2], hipL: [-1], hipR: [-0.9], kneeL: [1.45], kneeR: [1.35], neck: [0.2], shL: [-0.55, 0, 0.25], elL: [-1.1] };
      const k = p => Object.assign({}, crouch, p);
      return K(0, k({ torso: [0.35], shR: [-1.75, 0, -0.1], elR: [-0.5] }), 0.3, k({ torso: [0.85], shR: [-0.65, 0, -0.05], elR: [0], lift: [-0.26] }),
        0.62, k({ torso: [0.9, -0.2, 0], shR: [-0.5, 0.3, -0.05], elR: [0], lift: [-0.26] }), 0.85, k({ torso: [0.45], shR: [-1.6, 0, -0.1], elR: [-0.4] }), 1, k({ torso: [0.35], shR: [-1.75, 0, -0.1], elR: [-0.5] }));
    })() },
    /* in a canoe (2026-10-07): sitting low, legs forward; paddling swaps the stroke from side to side */
    sit: { loop: true, dur: 3, fn: (t, b) => { const s = Math.sin(TAU * t);
      return withBase(b, { lift: [-0.62], hipL: [-1.45], hipR: [-1.45], kneeL: [0.35], kneeR: [0.35], torso: [0.08 + 0.02 * s], shR: [-0.5, 0, -0.15], elR: [-0.9], shL: [-0.5, 0, 0.15], elL: [-0.9] }); } },
    /* sitting on the floor cross-legged (the elder in his lodge, and you when you sit to listen to him) */
    crosslegged: { loop: true, dur: 4, fn: (t, b) => { const s = Math.sin(TAU * t);
      return withBase(b, { lift: [-0.74], hipL: [-1.35, 0, 0.75], hipR: [-1.35, 0, -0.75], kneeL: [2.35, 0, 0], kneeR: [2.35, 0, 0], torso: [0.04 + 0.015 * s], neck: [0.04],
        shL: [-0.55, 0, 0.12], elL: [-0.95], shR: [-0.55, 0, -0.12], elR: [-0.95] }); } },
    /* ricing (2026-10-07): the poler stands in the stern pushing the canoe on the pole; the knocker sits forward, one stick
       bending the stalks in over the canoe, the other knocking the rice off them */
    pole: { loop: true, dur: 2.2, fn: (t, b) => { const s = Math.sin(TAU * t), c = Math.cos(TAU * t);
      return withBase(b, { hipL: [-0.2, 0, 0], hipR: [0.15], kneeL: [0.3], kneeR: [0.2], torso: [0.18 + 0.2 * Math.max(0, s)], shR: [-2.3 + 0.9 * Math.max(0, s), 0, -0.15], elR: [-0.35], shL: [-2.0 + 0.8 * Math.max(0, s), 0, 0.2], elL: [-0.5] }); } },
    knock: { loop: true, dur: 1.1, fn: (t, b) => { const s = Math.sin(TAU * t), c = Math.cos(TAU * t);
      return withBase(b, { lift: [-0.62], hipL: [-1.45], hipR: [-1.45], kneeL: [0.35], kneeR: [0.35], torso: [0.15 + 0.06 * s], shL: [-1.3 + 0.35 * c, 0, 0.55], elL: [-0.4], shR: [-1.6 + 0.8 * Math.max(0, s), 0, -0.35], elR: [-0.6 - 0.4 * Math.max(0, s)] }); } },
    paddle: { loop: true, dur: 1.4, fn: (t, b) => { const s = Math.sin(TAU * t), c = Math.cos(TAU * t);
      return withBase(b, { lift: [-0.62], hipL: [-1.45], hipR: [-1.45], kneeL: [0.35], kneeR: [0.35], torso: [0.12 + 0.08 * Math.max(0, s), 0.35 * c, 0],
        shR: [-0.9 + 0.7 * s, 0, -0.25], elR: [-0.5], shL: [-1.3 - 0.4 * s, 0, 0.3], elL: [-0.7] }); } },
    cook: { loop: true, dur: 1.6, impact: 0.5, fn: (t, b) => { const s = Math.sin(TAU * t);
      return withBase(b, { lift: [-0.2], hipL: [-1], hipR: [-0.9], kneeL: [1.45], kneeR: [1.35], torso: [0.35], shR: [-1 + 0.1 * s, 0.15 * s, -0.1], elR: [-0.6], shL: [-0.9, 0, 0.15], elL: [-0.7] }); } },
    /* golf (2026-10-19, the Saltmere Links): the ball lies in front of the feet, the target to the golfer's left (+x).
       golfaddress holds the stance; golfswing goes back (torso turned away, hands over the right shoulder), down through the
       ball ('impact' event) and up into the finish, then golffinish holds that pose while the ball flies. The engine draws
       the club from the hands. putt is a short pendulum from the shoulders. */
    golfaddress: { loop: true, dur: 3, fn: (t, b) => { const s = Math.sin(TAU * t); return withBase(b, Object.assign({}, G_ADDR, { torso: [0.62 + 0.004 * s, 0, 0] })); } },
    golfswing: { dur: 1.7, impact: 0.69, fn: KS(0, G_ADDR, 0.16, G_TAKE, 0.33, G_HALF, 0.5, G_TOP, 0.56, G_TRANS, 0.64, G_DOWN, 0.69, G_HIT, 0.74, G_REL, 0.84, G_THRU, 1, G_FIN) },
    golffinish: { loop: true, dur: 3, fn: (t, b) => withBase(b, G_FIN) },
    puttaddress: { loop: true, dur: 3, fn: (t, b) => withBase(b, PUTT_ADDR(0)) },
    putt: { dur: 1.2, impact: 0.55, fn: KS(0, PUTT_ADDR(0), 0.42, PUTT_ADDR(-0.3), 0.55, PUTT_ADDR(0), 0.78, PUTT_ADDR(0.28), 1, PUTT_ADDR(0.3)) },
    pickup: { dur: 0.6, impact: 0.5, fn: K(0, {}, 0.5, { torso: [0.9], neck: [0.2], shR: [-1, 0, -0.1], elR: [-0.2], hipL: [-0.4], hipR: [-0.4], kneeL: [0.6], kneeR: [0.6], lift: [-0.12] }, 1, {}) },
    eat: { dur: 0.9, impact: 0.5, fn: K(0, {}, 0.45, { shR: [-2.1, 0.4, 0], elR: [-2.3], neck: [0.1] }, 0.7, { shR: [-2.1, 0.4, 0], elR: [-2.3], neck: [0.1] }, 1, {}) },
    /* [Claude 2026-10-21] reactions any game can play (the operator: "animations for when they lose win or get excited. These animations should carry
       over to player avatars in the actual game"): the clubhouse tables play them from each result, and anyone can /cheer /fistpump /clap
       /excited /slump in the chat; one-shot, back to what you were doing after */
    cheer: { dur: 1.7, fn: KS(0, {}, 0.18, { shL: [-2.6, 0, 0.5], shR: [-2.6, 0, -0.5], elL: [-0.5], elR: [-0.5], kneeL: [0.35], kneeR: [0.35], lift: [-0.05], torso: [-0.05] },
      0.34, { shL: [-3.0, 0, 0.35], shR: [-3.0, 0, -0.35], elL: [-0.1], elR: [-0.1], lift: [0.07], neck: [-0.35], torso: [-0.12] },
      0.5, { shL: [-2.9, 0, 0.45], shR: [-2.9, 0, -0.45], elL: [-0.2], elR: [-0.2], kneeL: [0.25], kneeR: [0.25], lift: [-0.03], neck: [-0.25] },
      0.66, { shL: [-3.0, 0, 0.35], shR: [-3.0, 0, -0.35], elL: [-0.1], elR: [-0.1], lift: [0.05], neck: [-0.3] }, 0.84, { shL: [-2.4, 0, 0.4], shR: [-2.4, 0, -0.4], elL: [-0.6], elR: [-0.6] }, 1, {}) },
    fistpump: { dur: 1.5, fn: KS(0, {}, 0.2, { shR: [-1.2, 0, -0.35], elR: [-2.3], torso: [0.08, -0.15, 0], kneeL: [0.15], kneeR: [0.15] },
      0.38, { shR: [-0.35, 0, -0.25], elR: [-2.4], torso: [0.22, -0.2, 0], neck: [0.1], kneeL: [0.25], kneeR: [0.25], lift: [-0.03] },
      0.55, { shR: [-1.3, 0, -0.35], elR: [-2.3], torso: [0.05, -0.15, 0] }, 0.72, { shR: [-0.35, 0, -0.25], elR: [-2.4], torso: [0.22, -0.2, 0], neck: [0.1], lift: [-0.03] }, 1, {}) },
    clap: { dur: 1.6, fn: (t, b) => { const e = Math.min(1, t / 0.15, (1 - t) / 0.15), c = Math.max(0, Math.sin(TAU * t * 4));   /* four claps, the hands meeting in front of the chest */
      return withBase(b, { shL: [-1.25 * e, 0, (0.1 - 0.42 * c) * e], shR: [-1.25 * e, 0, (-0.1 + 0.42 * c) * e], elL: [-1.05 * e], elR: [-1.05 * e], neck: [-0.12 * e], torso: [-0.04 * e] }); } },
    excited: { dur: 1.8, fn: (t, b) => { const e = Math.min(1, t / 0.12, (1 - t) / 0.15), h = Math.max(0, Math.sin(TAU * t * 3)), c = Math.max(0, Math.sin(TAU * t * 6));   /* hopping and clapping above the head */
      return withBase(b, { shL: [-2.7 * e, 0, (0.15 - 0.3 * c) * e], shR: [-2.7 * e, 0, (-0.15 + 0.3 * c) * e], elL: [-0.7 * e], elR: [-0.7 * e], lift: [0.08 * h * e - 0.03 * (1 - h) * e],
        kneeL: [0.3 * (1 - h) * e], kneeR: [0.3 * (1 - h) * e], hipL: [-0.15 * (1 - h) * e], hipR: [-0.15 * (1 - h) * e], neck: [-0.3 * e] }); } },
    slump: { dur: 2.4, fn: KS(0, {}, 0.18, { torso: [0.32], neck: [0.5], shL: [-0.25, 0, 0.1], shR: [-0.25, 0, -0.1], elL: [-0.2], elR: [-0.2], kneeL: [0.12], kneeR: [0.12] },
      0.4, { torso: [0.38], neck: [0.55], shL: [-2.05, 0, -0.2], shR: [-2.05, 0, 0.2], elL: [-2.35], elR: [-2.35], kneeL: [0.12], kneeR: [0.12] },
      0.72, { torso: [0.4, 0.06, 0], neck: [0.55, -0.1, 0], shL: [-2.05, 0, -0.2], shR: [-2.05, 0, 0.2], elL: [-2.35], elR: [-2.35], kneeL: [0.12], kneeR: [0.12] },
      0.88, { torso: [0.25], neck: [0.35], shL: [-0.2, 0, 0.1], shR: [-0.2, 0, -0.1] }, 1, {}) },
    /* EMOTES (2026-10-25, the operator: "an emotes menu ... make the emotes actually move the character appropriately"): one-shots any player
       plays from the Emotes tab (or /wave, /bow ...), seen by everyone near through the position messages; `politebow` because `bow` is the
       archery draw. env eases each in and out so it starts and ends on the pose you had */
    wave: { dur: 2.0, fn: (t, b) => { const e = Math.min(1, t / 0.15, (1 - t) / 0.15), s = Math.sin(TAU * t * 3);   /* the right hand up, waving */
      return withBase(b, { shR: [-2.75 * e, 0, (-0.3 - 0.32 * s) * e], elR: [(-0.45 - 0.3 * s) * e], neck: [-0.08 * e, 0.12 * e, 0], torso: [0, 0.08 * e, -0.04 * e] }); } },
    politebow: { dur: 1.9, fn: KS(0, {}, 0.3, { torso: [0.78], neck: [0.3], shR: [-0.75, 0, -0.15], elR: [-1.75], shL: [0.18, 0, 0.12], elL: [-0.1], hipL: [-0.12], hipR: [-0.12] },
      0.68, { torso: [0.78], neck: [0.3], shR: [-0.75, 0, -0.15], elR: [-1.75], shL: [0.18, 0, 0.12], elL: [-0.1], hipL: [-0.12], hipR: [-0.12] }, 1, {}) },   /* a hand to the chest, a deep bow */
    dance: { dur: 2.6, fn: (t, b) => { const e = Math.min(1, t / 0.1, (1 - t) / 0.1), s = Math.sin(TAU * t * 4), w = Math.sin(TAU * t * 2);   /* a step from foot to foot, arms pumping */
      return withBase(b, { lift: [0.05 * Math.abs(s) * e], kneeL: [0.45 * Math.max(0, s) * e], kneeR: [0.45 * Math.max(0, -s) * e], hipL: [-0.3 * Math.max(0, s) * e], hipR: [-0.3 * Math.max(0, -s) * e],
        torso: [0.05 * e, 0.35 * w * e, 0.08 * s * e], shL: [(-1.3 + 0.55 * s) * e, 0, 0.55 * e], shR: [(-1.3 - 0.55 * s) * e, 0, -0.55 * e], elL: [-1.3 * e], elR: [-1.3 * e], neck: [0, -0.25 * w * e, 0.1 * s * e] }); } },
    laugh: { dur: 1.8, fn: (t, b) => { const e = Math.min(1, t / 0.12, (1 - t) / 0.15), q = Math.sin(TAU * t * 9);   /* head back, hands on the belly, shaking */
      return withBase(b, { torso: [(-0.26 + 0.07 * q) * e, 0, 0.04 * q * e], neck: [(-0.55 + 0.06 * q) * e], shL: [-0.7 * e, 0, 0.28 * e], shR: [-0.7 * e, 0, -0.28 * e], elL: [-1.75 * e], elR: [-1.75 * e],
        kneeL: [0.12 * e], kneeR: [0.12 * e], lift: [(0.03 * q - 0.02) * e] }); } },
    shrug: { dur: 1.5, fn: KS(0, {}, 0.3, { shL: [-0.25, 0, 0.6], shR: [-0.25, 0, -0.6], elL: [-1.55], elR: [-1.55], neck: [-0.05, 0, 0.22], lift: [0.03] },
      0.7, { shL: [-0.25, 0, 0.6], shR: [-0.25, 0, -0.6], elL: [-1.55], elR: [-1.55], neck: [-0.05, 0, 0.22], lift: [0.03] }, 1, {}) },   /* forearms up, palms out, head tilted */
    salute: { dur: 1.7, fn: KS(0, {}, 0.25, { shR: [-1.45, 0.25, -1.05], elR: [-2.45], neck: [-0.06], torso: [-0.04] },
      0.78, { shR: [-1.45, 0.25, -1.05], elR: [-2.45], neck: [-0.06], torso: [-0.04] }, 1, {}) },   /* the right hand to the brow, standing straight */
    think: { dur: 2.4, fn: KS(0, {}, 0.25, { shR: [-1.0, 0, -0.15], elR: [-2.55], shL: [-0.55, 0, 0.35], elL: [-1.65], neck: [0.18, 0.25, 0] },
      0.82, { shR: [-1.0, 0, -0.15], elR: [-2.55], shL: [-0.55, 0, 0.35], elL: [-1.65], neck: [0.18, 0.25, 0] }, 1, {}) },   /* a hand at the chin, the other arm across */
    point: { dur: 1.5, fn: KS(0, {}, 0.22, { shR: [-1.6, 0, -0.05], elR: [-0.05], torso: [0, -0.12, 0], neck: [0, -0.1, 0] },
      0.75, { shR: [-1.6, 0, -0.05], elR: [-0.05], torso: [0, -0.12, 0], neck: [0, -0.1, 0] }, 1, {}) },   /* the right arm straight out ahead */
    /* [Claude 2026-10-21] a dealer at a table (the operator: "Also belly up the dealers and give them animations"): dealeridle leans on the
       table edge, hands resting on it, the weight shifting; deal flicks a card off the right hand, flip turns one over, sweep draws the
       lost bets in, pay pushes GOLD out, spin sets a wheel going and sends the ball, nomore waves over the layout, point shows the dice,
       push slides the dice to the shooter - one-shot, back to dealeridle. Reusable at any game table. */
    dealeridle: { loop: true, dur: 5, fn: (t, b) => { const s = Math.sin(TAU * t), c = Math.sin(TAU * t * 2);
      return withBase(b, Object.assign({}, D_IDLE, { torso: [0.2 + 0.015 * c, 0.05 * s, 0.025 * s], hipL: [0.04 * s], hipR: [-0.04 * s], kneeL: [0.05 + 0.05 * Math.max(0, s)], kneeR: [0.05 + 0.05 * Math.max(0, -s)] })); } },
    deal: { dur: 0.5, fn: KS(0, D_IDLE, 0.3, Object.assign({}, D_IDLE, { torso: [0.3], shR: [-1.3, 0, -0.08], elR: [-0.15] }), 0.55, Object.assign({}, D_IDLE, { torso: [0.32], shR: [-1.45, 0, -0.02], elR: [-0.02] }), 1, D_IDLE) },
    flip: { dur: 0.75, fn: KS(0, D_IDLE, 0.35, Object.assign({}, D_IDLE, { torso: [0.3], shR: [-1.15, 0, 0.12], elR: [-0.45] }), 0.6, Object.assign({}, D_IDLE, { torso: [0.3], shR: [-1.35, 0.7, 0.12], elR: [-0.7] }), 1, D_IDLE) },
    sweep: { dur: 1.3, fn: KS(0, D_IDLE, 0.25, { torso: [0.42], neck: [-0.1], shR: [-1.35, 0, -0.6], elR: [-0.15], shL: [-0.75, 0, 0.12], elL: [-0.7] },
      0.7, { torso: [0.4], neck: [-0.1], shR: [-1.3, 0, 0.3], elR: [-0.45], shL: [-0.75, 0, 0.12], elL: [-0.7] }, 1, D_IDLE) },
    pay: { dur: 1.0, fn: KS(0, D_IDLE, 0.4, { torso: [0.38], neck: [-0.12], shR: [-1.45, 0, -0.1], elR: [-0.05], shL: [-1.1, 0, 0.12], elL: [-0.5] },
      0.65, { torso: [0.38], neck: [-0.12], shR: [-1.45, 0, -0.1], elR: [-0.05], shL: [-1.1, 0, 0.12], elL: [-0.5] }, 1, D_IDLE) },
    spin: { dur: 1.3, fn: KS(0, D_IDLE, 0.25, { torso: [0.3], shR: [-0.95, 0, -0.45], elR: [-0.65], shL: D_IDLE.shL, elL: D_IDLE.elL }, 0.45, { torso: [0.3], shR: [-1.05, 0, 0.1], elR: [-0.35], shL: D_IDLE.shL, elL: D_IDLE.elL },
      0.62, { torso: [0.28], shR: [-1.5, 0, -0.35], elR: [-0.1], shL: D_IDLE.shL, elL: D_IDLE.elL }, 1, D_IDLE) },
    nomore: { dur: 1.3, fn: (t, b) => { const e = Math.min(1, t / 0.2, (1 - t) / 0.2), w = Math.sin(TAU * t * 2);
      return withBase(b, { torso: [0.2 + 0.08 * e], neck: [-0.05], shL: D_IDLE.shL, elL: D_IDLE.elL, shR: [D_IDLE.shR[0] + (-1.4 - D_IDLE.shR[0]) * e, 0, -0.12 + 0.32 * w * e], elR: [D_IDLE.elR[0] + (-0.12 - D_IDLE.elR[0]) * e] }); } },
    point: { dur: 1.0, fn: KS(0, D_IDLE, 0.3, Object.assign({}, D_IDLE, { torso: [0.26], shR: [-1.55, 0, -0.05], elR: [0] }), 0.75, Object.assign({}, D_IDLE, { torso: [0.26], shR: [-1.55, 0, -0.05], elR: [0] }), 1, D_IDLE) },
    push: { dur: 1.2, fn: KS(0, D_IDLE, 0.3, { torso: [0.35], shR: [-1.1, 0, -0.05], elR: [-0.7], shL: [-1.1, 0, 0.05], elL: [-0.7] },
      0.75, { torso: [0.48], shR: [-1.5, 0, -0.05], elR: [-0.05], shL: [-1.5, 0, 0.05], elL: [-0.05] }, 1, D_IDLE) },
    /* a bet put down (2026-10-21: "can we have the avatars placement of bets be an animated?"): lean in, the right hand out over the felt and back */
    reach: { dur: 1.0, fn: KS(0, {}, 0.3, { torso: [0.42], neck: [-0.15], shR: [-1.15, 0, -0.08], elR: [-0.35], hipL: [-0.12], hipR: [-0.12] },
      0.5, { torso: [0.5], neck: [-0.22], shR: [-1.4, 0, -0.04], elR: [-0.05], hipL: [-0.15], hipR: [-0.15] }, 0.62, { torso: [0.48], neck: [-0.2], shR: [-1.3, 0, -0.06], elR: [-0.2], hipL: [-0.14], hipR: [-0.14] }, 1, {}) }
  };
  const BEAST = {
    idle: { loop: true, dur: 2, fn: t => ({ tail: [0.3, 0.35 * Math.sin(TAU * t), 0], neck: [0.04 * Math.sin(TAU * t)] }) },
    walk: { loop: true, dur: 0.8, fn: (t, _, H) => { const s = Math.sin(TAU * t), hip = (H && H._hipY) || 0.32; return { legFL: [0.5 * s], legBR: [0.5 * s], legFR: [-0.5 * s], legBL: [-0.5 * s], tail: [0.3, 0.2 * s, 0], lift: [hip * (1 - Math.cos(0.5 * s))] }; } },
    run: { loop: true, dur: 0.5, fn: (t, _, H) => { const s = Math.sin(TAU * t), hip = (H && H._hipY) || 0.32; return { legFL: [0.9 * s], legFR: [0.8 * s], legBL: [-0.9 * s], legBR: [-0.8 * s], pitch: [0.12 * s], tail: [0.6, 0, 0], lift: [hip * (1 - Math.cos(0.85 * s))] }; } },
    bite: { dur: 0.7, impact: 0.55, fn: K(0, {}, 0.4, { neck: [0.35], legFL: [0.3], legFR: [0.3], legBL: [-0.2], legBR: [-0.2], dz: [-0.06] }, 0.55, { neck: [-0.45], dz: [0.14], legFL: [-0.5], legFR: [-0.5], pitch: [-0.1] }, 1, {}) },
    /* a chained dragon's tells: the whole body, held until the blow. A bite rears. Dragonfire opens the wings and the jaw. */
    rear: { loop: true, dur: 0.7, fn: t => { const s = Math.sin(TAU * t); return { lift: [1.15 + 0.12 * s], pitch: [-1.05], neck: [-1.45 + 0.12 * s], jaw: [0.35], legFL: [-1.5], legFR: [-1.5], legBL: [0.55], legBR: [0.55], wingL: [0, 0, 0.7], wingR: [0, 0, -0.7], tail: [-0.6] }; } },
    breath: { loop: true, dur: 0.45, fn: t => { const s = Math.sin(TAU * t); return { lift: [0.18], pitch: [0.35], neck: [0.15], jaw: [1.15 + 0.15 * s], wingL: [0, 0, 1.15 + 0.2 * s], wingR: [0, 0, -1.15 - 0.2 * s], tail: [0.15, 0.55 * s, 0] }; } },
    hit: { dur: 0.4, fn: K(0, {}, 0.3, { neck: [-0.4], dz: [-0.06], pitch: [0.1] }, 1, {}) },
    death: { dur: 1, hold: true, fn: K(0, {}, 0.3, { neck: [-0.3], legFL: [-0.4], legFR: [0.4] }, 1, { roll: [1.5], lift: [0.02], legFL: [-0.7], legFR: [-0.4], legBL: [0.6], legBR: [0.3], neck: [0.3], tail: [0, 0, 0] }) }
  };
  BEAST.slash = BEAST.stab = BEAST.crush = BEAST.bite;
  /* the QUADRUPED's poses (a cat first): sitting is pitch up, hips down, the hind legs folded under (thigh forward, hock back), the front
     legs kept upright, the head levelled and the tail wrapped round to the side; H._sit carries the body's own numbers */
  const qsit = (H) => { const q = (H && H._sit) || { pitch: -0.5, drop: 0.07 }; return { pitch: [q.pitch], lift: [-q.drop], legFL: [-q.pitch], legFR: [-q.pitch], legBL: [-1.15], legBR: [-1.15], shinBL: [1.6], shinBR: [1.6], neck: [0.32] }; };
  const QDEATH = new Map(), qdeath = hip => { let f = QDEATH.get(hip); if (!f) QDEATH.set(hip, f = K(0, {}, 0.3, { neck: [-0.3] }, 1, { roll: [1.45], lift: [-hip * 0.62], legFL: [-0.5], legFR: [-0.3], legBL: [0.6], legBR: [0.4], neck: [0.2], tail: [-1.2, 0.4, 0] })); return f; };   /* lies down on its side */
  const ping = (t, k) => Math.pow(Math.max(0, Math.sin(TAU * t * k)), 12);   /* a short twitch now and then */
  const QUAD = Object.assign({}, BEAST, {
    idle: { loop: true, dur: 4, fn: (t, _, H) => {
      const s = Math.sin(TAU * t), e = ping(t, 1), f = ping(t + 0.37, 1);
      const ear = { earL: [0, 0, 0.5 * e], earR: [0, 0, -0.5 * f] };
      if (H && H._idle === 'stand') return Object.assign({ tail: [0, 0.35 * s, 0], tail3: [0.2 * s, 0.3 * s, 0], neck: [0.04 * s], head: [0, 0.3 * Math.sin(TAU * t * 0.5), 0] }, ear);
      return Object.assign(qsit(H), { tail: [-1.75, 0.55, 0], tail2: [0, 0.55 + 0.08 * s, 0], tail3: [0.05, 0.5 + 0.35 * s, 0], head: [0, 0.35 * Math.sin(TAU * t * 0.5), 0.06 * s] }, ear);
    } },
    sit: { loop: true, dur: 4, fn: (t, c, H) => QUAD.idle.fn(t, c, Object.assign({}, H, { _idle: 'sit', _sit: H && H._sit })) },
    walk: { loop: true, dur: 0.9, fn: (t, _, H) => { const s = Math.sin(TAU * t), s2 = Math.sin(TAU * t * 2), S = (H && H._S) || 1;
      return { legFL: [0.45 * s], legBR: [0.45 * s], legFR: [-0.45 * s], legBL: [-0.45 * s], shinBL: [0.35 * Math.max(0, -s)], shinBR: [0.35 * Math.max(0, s)],
        tail: [0.1, 0.12 * s, 0], tail3: [0.15, 0.2 * s, 0], neck: [0.05 * s2], lift: [0.006 * S * s2], roll: [0.03 * s] }; } },
    run: { loop: true, dur: 0.42, fn: (t, _, H) => { const s = Math.sin(TAU * t), S = (H && H._S) || 1;   /* a bound: the front pair together, the hind pair together, the spine flexing */
      return { legFL: [0.95 * s], legFR: [0.85 * s], legBL: [-0.95 * s], legBR: [-0.85 * s], shinBL: [0.5 * Math.max(0, s)], shinBR: [0.5 * Math.max(0, s)],
        pitch: [0.14 * s], lift: [0.03 * S * Math.abs(Math.cos(TAU * t))], tail: [-0.55 - 0.2 * s, 0, 0], tail3: [0.3, 0, 0], neck: [-0.1 * s], earL: [0, 0, 0.35], earR: [0, 0, -0.35] }; } },
    bite: { dur: 0.6, impact: 0.5, fn: K(0, {}, 0.35, { neck: [0.2], legFR: [-0.35], pitch: [-0.12], earL: [0, 0, 0.7], earR: [0, 0, -0.7] }, 0.5, { neck: [-0.15], legFR: [-1.5], dz: [0.04], pitch: [-0.2], earL: [0, 0, 0.7], earR: [0, 0, -0.7] }, 1, {}) },   /* a swipe of the paw */
    hit: { dur: 0.4, fn: K(0, {}, 0.3, { neck: [-0.3], dz: [-0.04], pitch: [0.1], earL: [0, 0, 0.8], earR: [0, 0, -0.8], tail: [0.4, 0, 0] }, 1, {}) },
    death: { dur: 1, hold: true, fn: (t, c, H) => qdeath((H && H._hipY) || 0.22)(t, c || {}) },
  });
  QUAD.slash = QUAD.stab = QUAD.crush = QUAD.bite; QUAD.sprawl = QUAD.death;

  /* ---------- the animated character (shared by humanoids and beasts) ---------- */
  function character(root, joints, poses, extra) {
    const H = Object.assign({ object: root }, extra || {});
    const listeners = [];
    let cur = null, lastLoop = { name: 'idle', speed: 1 }, from = null, blend = 1, own;
    H.carry = {};   /* pose overlay for what's in the hands (bow carry etc.) */
    function poseNow() {
      if (!cur) return {};
      const P = poses[cur.name], t = P.loop ? (cur.t / P.dur) % 1 : Math.min(1, cur.t / P.dur);
      return P.fn(t, H.carry, H);
    }
    function apply(p) {
      for (const n in joints) {
        const j = joints[n]; if (!j) continue;
        const q = p[n], v = q ? [q[0] || 0, q[1] || 0, q[2] || 0] : [0, 0, 0];
        if (j.kind === 'rot') j.o.rotation.set(j.r0[0] + v[0], j.r0[1] + v[1], j.r0[2] + v[2]);
        else if (j.kind === 'y') j.o.position.y = j.p0 + v[0];
        else if (j.kind === 'z') j.o.position.z = j.p0 + v[0];
        else if (j.kind === 'rx') j.o.rotation.x = v[0];
        else if (j.kind === 'rz') j.o.rotation.z = v[0];
        else if (j.kind === 'val') j.v = v;
      }
    }
    H.play = function (name, o) {
      o = o || {};
      if (!poses[name]) name = poses.slash && /slash|stab|crush|bite/.test(name) ? 'slash' : 'idle';
      const P = poses[name], loop = o.loop != null ? o.loop : !!P.loop;
      if (cur && cur.name === name && loop && cur.loop) { cur.speed = o.speed || 1; return; }
      from = poseNow(); blend = 0;
      cur = { name, t: 0, speed: o.speed || 1, loop, fired: false };
      if (loop) lastLoop = { name, speed: cur.speed };
    };
    H.update = function (dt) {
      dt = dt > 0 && dt < 1 ? dt : dt >= 1 ? 1 : 0;   /* a negative or huge frame time (first frame, tab switch) would extrapolate poses */
      if (!cur) H.play('idle');
      const P = poses[cur.name], before = cur.t;
      cur.t += dt * cur.speed;
      if (P.impact != null) {
        const a = P.loop ? (before / P.dur) % 1 : before / P.dur, b = P.loop ? (cur.t / P.dur) % 1 : cur.t / P.dur;
        if ((P.loop && (b >= P.impact && (a < P.impact || b < a))) || (!P.loop && a < P.impact && b >= P.impact)) emit('impact', cur.name);
      }
      if (!cur.loop && cur.t >= P.dur && !cur.ended) {
        cur.ended = true; emit('done', cur.name);
        if (P.hold) cur.t = P.dur; else H.play(lastLoop.name, { loop: true, speed: lastLoop.speed });
      } else if (cur.ended && P.hold) cur.t = P.dur;
      let p = poseNow();
      if (blend < 1 && from) {
        blend = Math.max(0, Math.min(1, blend + dt / 0.14));
        const f = ease(blend), q = {};
        for (const n of new Set([...Object.keys(p), ...Object.keys(from)])) {
          const a = from[n] || [0, 0, 0], b = p[n] || [0, 0, 0];
          q[n] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        }
        p = q;
      }
      apply(p);
      if (H.add) for (const n in H.add) {   /* [Claude 2026-10-21] a turn laid over whatever is playing (a head following the dice, the body turned to the wheel) */
        const j = joints[n], a = H.add[n]; if (!j || !a) continue;
        if (j.kind === 'rot') { j.o.rotation.x += a[0] || 0; j.o.rotation.y += a[1] || 0; j.o.rotation.z += a[2] || 0; }
      }
    };
    function emit(type, name) { for (const f of listeners) { try { f(type, name); } catch (e) { /* listener errors stay out of the animation */ } } }
    H.onEvent = fn => { listeners.push(fn); return H; };
    Object.defineProperty(H, 'animation', { get: () => cur && cur.name });
    /* setOpacity (death fade) and setTint (status effects) both need per-character materials: materials are shared between
       characters, so a mesh gets a private clone the first time either touches it (`own` frees them on dispose). */
    own = new Set();
    let alpha = 1, tint = null, tintS = 0, tintKey = '', frozen = false;
    const TC = new THREE.Color();
    function priv(o) {
      if (o.userData.priv !== H) { o.material = o.material.clone(); o.userData.priv = H; own.add(o.material); o.userData.c0 = o.material.color.clone(); o.userData.e0 = o.material.emissive ? o.material.emissive.clone() : null; o.userData.op0 = o.material.opacity; o.userData.cs0 = o.castShadow; }
      return o.material;
    }
    function paint(o) {
      if (!o.isMesh || !o.material || !o.material.color) return;
      const key = alpha + '|' + tintKey;
      if (o.userData.paintKey === key || (o.userData.priv !== H && alpha >= 1 && !tint)) return;
      const m = priv(o);
      m.transparent = alpha < 1 || o.userData.op0 < 1; m.opacity = Math.min(alpha, o.userData.op0);
      m.depthWrite = alpha >= 1 && !(o.userData.op0 < 1); o.castShadow = alpha > 0.5 && o.userData.cs0 !== false;
      m.color.copy(o.userData.c0); if (tint) m.color.lerp(TC, tintS);
      if (o.userData.e0) { m.emissive.copy(o.userData.e0); if (tint) m.emissive.lerp(TC, tintS * 0.35); }
      o.userData.paintKey = key;
    }
    H.setOpacity = function (a) { alpha = Math.max(0, Math.min(1, +a)); root.traverse(paint); };
    /* status-effect colour wash (frozen '#9fd8ff' .55, poison, burn...); null clears. Kept across setGear/setOutfit rebuilds:
       update() paints any new mesh while a tint or fade is on. */
    H.setTint = function (color, strength) {
      tint = color == null ? null : color; tintS = Math.max(0, Math.min(1, strength == null ? 0.5 : +strength));
      if (tint) { TC.set(tint); tintKey = TC.getHexString() + ':' + tintS; } else tintKey = '';
      root.traverse(paint); return H;
    };
    H.setFrozen = function (on) { frozen = !!on; return H; };
    const upd = H.update;
    H.update = function (dt) {
      if (!frozen) upd(dt);
      if (tint || alpha < 1) root.traverse(paint);
    };
    H.dispose = function () {
      root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of own) m.dispose();
      if (root.parent) root.parent.remove(root);
    };
    return H;
  }

  /* ---------- quadrupeds ---------- */
  function beast(o) {
    const root = group(), body = group(), roll = group(); root.add(roll); roll.add(body);
    const S = o.size, c = o.color, dk = shade(c, 0.75);
    const hipY = 0.32 * S * (o.legLen || 1); body.position.y = hipY;   /* legLen: deer stand tall, boars low */
    const trunk = group(); body.add(trunk);
    trunk.add(box(0.32 * S, 0.28 * S, 0.7 * S, c, 0, 0.02 * S, 0));
    if (o.wool) {   /* a fleece (the Lake Castle's sheep, 2026-10-17: "make the sheep look like sheep"): rounded tufts over the back and flanks, standing proud of the body */
      for (const zz of [-0.24, -0.08, 0.08, 0.22]) for (const xx of [-0.13, 0, 0.13]) trunk.add(ball((xx ? 0.12 : 0.14) * S, o.wool, xx * S, (xx ? 0.03 : 0.12) * S, zz * S, 1));
      for (const zz of [-0.16, 0, 0.16]) for (const sd of [-1, 1]) trunk.add(ball(0.11 * S, shade(o.wool, 0.94), sd * 0.16 * S, -0.06 * S, zz * S, 1));
      trunk.add(ball(0.12 * S, o.wool, 0, 0.0, -0.3 * S, 1));   /* the rump */
    }
    if (o.mane) trunk.add(box(0.36 * S, 0.3 * S, 0.24 * S, dk, 0, 0.06 * S, 0.22 * S));
    /* a mountain goat (2026-10-18, the operator: "make mountain goats look like mountain goats"): a shaggy white coat - a hump over the
       shoulders, a fringe hanging under the belly, 'pantaloons' on the upper legs (leg() below) - a beard, black hooves, and short black
       horns that sweep back (o.goatHorns, by the ears) */
    if (o.hump) trunk.add(ball(0.17 * S, o.shag || c, 0, 0.13 * S, 0.2 * S, 1));
    if (o.shag) for (const zz of [-0.24, -0.12, 0, 0.12, 0.24]) for (const sd of [-1, 1]) trunk.add(box(0.06 * S, 0.12 * S, 0.11 * S, shade(o.shag, zz % 0.24 ? 0.96 : 1), sd * 0.13 * S, -0.15 * S, zz * S));
    const neck = group(0, 0.1 * S, 0.34 * S); trunk.add(neck);
    neck.add(box(0.24 * S, 0.22 * S, 0.24 * S, o.face || c, 0, 0.04 * S, 0.1 * S));   /* face: a head of its own colour (a sheep's dark face) */
    if (o.wool) neck.add(ball(0.09 * S, o.wool, 0, 0.17 * S, 0.06 * S, 1));   /* the topknot */
    neck.add(box(0.13 * S, 0.11 * S, 0.2 * S, o.snout || dk, 0, -0.01 * S, 0.29 * S));
    neck.add(box(0.06 * S, 0.04 * S, 0.04 * S, DARK, 0, 0.02 * S, 0.4 * S));
    neck.add(box(0.035 * S, 0.035 * S, 0.01 * S, o.eyes || '#e8d040', -0.07 * S, 0.09 * S, 0.221 * S), box(0.035 * S, 0.035 * S, 0.01 * S, o.eyes || '#e8d040', 0.07 * S, 0.09 * S, 0.221 * S));
    if (o.beard) neck.add(box(0.07 * S, 0.14 * S, 0.06 * S, o.beard, 0, -0.1 * S, 0.3 * S), box(0.05 * S, 0.06 * S, 0.05 * S, shade(o.beard, 0.94), 0, -0.19 * S, 0.29 * S));
    if (o.goatHorns) for (const sd of [-1, 1]) {   /* up from the brow, then back over the neck: two cones, the second bent further */
      const hg = group(sd * 0.06 * S, 0.15 * S, 0.12 * S); neck.add(hg); hg.rotation.x = -0.45; hg.rotation.z = -sd * 0.12;
      hg.add(cone(0.032 * S, 0.13 * S, o.goatHorns, 0, 0.065 * S, 0, 6));
      const tip = group(0, 0.11 * S, 0); hg.add(tip); tip.rotation.x = -0.75; tip.add(cone(0.02 * S, 0.1 * S, o.goatHorns, 0, 0.05 * S, 0, 6));
    }
    if (o.tusks) { neck.add(cone(0.018 * S, 0.09 * S, o.tusks, -0.06 * S, -0.02 * S, 0.36 * S, 4)); neck.add(cone(0.018 * S, 0.09 * S, o.tusks, 0.06 * S, -0.02 * S, 0.36 * S, 4)); }
    if (o.antlers) for (const sd of [-1, 1]) {   /* a beam up and back with two tines */
      const ab = group(sd * 0.07 * S, 0.2 * S, 0.04 * S); neck.add(ab); ab.rotation.z = -sd * 0.35; ab.rotation.x = -0.3;
      ab.add(box(0.025 * S, 0.3 * S, 0.025 * S, o.antlers, 0, 0.15 * S, 0));
      ab.add(box(0.02 * S, 0.12 * S, 0.02 * S, o.antlers, 0, 0.14 * S, 0.05 * S), box(0.02 * S, 0.1 * S, 0.02 * S, o.antlers, 0, 0.26 * S, -0.04 * S));
    }
    if (o.ears === 'side') for (const sd of [-1, 1]) { const ea = box(0.12 * S, 0.035 * S, 0.06 * S, o.face || dk, sd * 0.17 * S, 0.1 * S, 0.08 * S); ea.rotation.z = sd * -0.25; neck.add(ea); }   /* ears out to the side, a little drooped */
    else if (o.ears === 'round') { neck.add(ball(0.05 * S, o.inner || dk, -0.1 * S, 0.17 * S, 0.06 * S)); neck.add(ball(0.05 * S, o.inner || dk, 0.1 * S, 0.17 * S, 0.06 * S)); }
    else if (o.ears !== 'none') { neck.add(cone(0.05 * S, 0.12 * S, dk, -0.08 * S, 0.21 * S, 0.06 * S, 4)); neck.add(cone(0.05 * S, 0.12 * S, dk, 0.08 * S, 0.21 * S, 0.06 * S, 4)); }
    if (o.horns) for (const sd of [-1, 1]) { const hn = cone(0.045 * S, 0.28 * S, o.horns, sd * 0.08 * S, 0.22 * S, 0.02 * S, 5); hn.rotation.z = -sd * 0.35; hn.rotation.x = -0.4; neck.add(hn); }
    if (o.sad) neck.rotation.x = 0.42;   /* head hung, the chain has been on a long time */
    let jaw = null;
    if (o.wings) { jaw = group(0, -0.05 * S, 0.26 * S); neck.add(jaw); jaw.add(box(0.15 * S, 0.04 * S, 0.2 * S, o.snout || dk, 0, -0.02 * S, 0.08 * S)); }
    const tail = group(0, 0.08 * S, -0.35 * S); trunk.add(tail);
    const tl = o.tailLen || 0.32, h = tl * S, col = o.tail || c;
    const tb = o.tailBase != null ? o.tailBase : (o.tailW || 0.09 * S);
    const tt = o.tailTip != null ? o.tailTip : tb * (o.wings ? 0.2 : 0.55);
    /* a dragon's tail is thick at the hips and tapers to a point; other beasts get a milder cone */
    if (o.wings) {
      const h0 = h * 0.42, h1 = h - h0, mid = tb * 0.48;
      const a = cyl(mid, tb, h0, col, 0, 0, -h0 / 2, 7); a.rotation.x = Math.PI / 2; tail.add(a);
      const b = cyl(tt, mid, h1, col, 0, 0, -(h0 + h1 / 2), 7); b.rotation.x = Math.PI / 2; tail.add(b);
    } else {
      const tm = cyl(tt, tb, h, col, 0, 0, -h / 2, 7); tm.rotation.x = Math.PI / 2; tail.add(tm);
    }
    function leg(x, z) {
      const g = group(x * S, -0.08 * S, z * S); trunk.add(g);
      const fh = 0.04 * S, joint = hipY - 0.08 * S, shinH = Math.max(0.08 * S, joint - fh);
      g.add(box(0.09 * S, shinH, 0.1 * S, o.legs || dk, 0, -shinH / 2, 0));
      if (o.shag) g.add(box(0.13 * S, shinH * 0.45, 0.14 * S, o.shag, 0, -shinH * 0.22, 0));   /* the goat's shaggy 'pantaloons' */
      g.add(box(0.1 * S, fh * (o.hooves ? 2 : 1), 0.12 * S, o.hooves || shade(o.legs || c, 0.55), 0, fh * (o.hooves ? 1 : 0.5) - joint, 0.01 * S));   /* soles on the ground, not through it */
      return g;
    }
    const FL = leg(-0.11, 0.25), FR = leg(0.11, 0.25), BL = leg(-0.11, -0.25), BR = leg(0.11, -0.25);
    let wingL = null, wingR = null;
    if (o.wings) {
      const wing = (sd) => {
        const g = group(sd * 0.16 * S, 0.1 * S, 0); trunk.add(g); g.rotation.z = sd * 1.05;
        g.add(box(0.62 * S, 0.025 * S, 0.42 * S, o.wings, sd * 0.32 * S, 0, -0.02 * S));
        g.add(box(0.38 * S, 0.02 * S, 0.22 * S, shade(o.wings, 0.8), sd * 0.2 * S, 0, 0.16 * S));
        return g;
      };
      wingL = wing(-1); wingR = wing(1);
    }
    let maw = null, flame = null, plume = null, ring = null, glowMat = null, owned = null;
    if (o.wings) {
      glowMat = new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0, depthWrite: false });
      maw = new THREE.Mesh(new THREE.SphereGeometry(0.11 * S, 8, 6), glowMat); maw.position.set(0, -0.02 * S, 0.34 * S); jaw.add(maw);
      flame = new THREE.Mesh(new THREE.ConeGeometry(0.12 * S, 1.1 * S, 7), glowMat); flame.position.set(0, -0.06 * S, 0.9 * S); flame.rotation.x = Math.PI / 2; jaw.add(flame);
      plume = new THREE.Mesh(new THREE.ConeGeometry(0.28 * S, 2.1 * S, 8), glowMat); plume.position.set(0, 1.5 * S, 0.15 * S); body.add(plume);
      ring = new THREE.Mesh(new THREE.TorusGeometry(0.72 * S, 0.07 * S, 6, 12), glowMat); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.15 * S, 0); body.add(ring);
      owned = [];
      root.traverse(m => { if (m.isMesh && m.material && m.material.emissive && m.material !== glowMat) { m.material = m.material.clone(); owned.push(m.material); } });
    }
    root.traverse(m => { if (m.isMesh) m.castShadow = m !== maw && m !== flame && m !== plume && m !== ring; });
    const rot = obj => ({ kind: 'rot', o: obj, r0: [obj.rotation.x, obj.rotation.y, obj.rotation.z] });
    const joints = {
      neck: rot(neck), tail: rot(tail), legFL: rot(FL), legFR: rot(FR), legBL: rot(BL), legBR: rot(BR),
      lift: { kind: 'y', o: body, p0: hipY }, dz: { kind: 'z', o: trunk, p0: 0 }, pitch: { kind: 'rx', o: trunk }, roll: { kind: 'rz', o: roll }
    };
    if (wingL) { joints.wingL = rot(wingL); joints.wingR = rot(wingR); }
    if (jaw) joints.jaw = rot(jaw);
    const H = character(root, joints, BEAST);
    H._hipY = hipY;
    H.setGear = () => H; H.setTool = () => H; H.attackAnim = () => 'bite';
    if (glowMat) {
      let tell = null, tt = 0; const up = H.update;
      const paint = (hex, inten) => { for (const m of owned) { m.emissive.setHex(hex); m.emissiveIntensity = inten; } };
      H.tell = (mode) => { tell = mode || null; tt = 0; if (!tell) { glowMat.opacity = 0; flame.scale.set(0.01, 0.01, 0.01); plume.scale.set(0.01, 0.01, 0.01); ring.scale.set(0.01, 0.01, 0.01); paint(0, 0); } };
      H.update = function (dt) {
        up(dt);
        if (!tell) return;
        tt += dt; const p = 0.4 + 0.6 * Math.abs(Math.sin(tt * 9));
        if (tell === 'magic') {
          glowMat.color.setHex(0x3ec0ff); glowMat.opacity = 0.95; paint(0x1a6ae0, 0.7);
          flame.scale.set(0.8 + p, 0.7 + p * 1.4, 0.8 + p); plume.scale.set(0.85 + 0.3 * p, 0.75 + 0.55 * p, 0.85 + 0.3 * p); ring.scale.set(0.01, 0.01, 0.01); maw.scale.setScalar(1.2 + 0.5 * p);
        } else {
          glowMat.color.setHex(0xffc24a); glowMat.opacity = 0.95 * p; paint(0xc45a10, 0.65 * p);
          flame.scale.set(0.2, 0.15, 0.2); plume.scale.set(0.01, 0.01, 0.01); ring.scale.set(1, 1 + 0.35 * p, 1); maw.scale.setScalar(0.85 + 0.4 * p);
        }
      };
    }
    H.muzzle = out => (out = out || new THREE.Vector3(), neck.getWorldPosition(out));
    Object.defineProperty(H, 'height', { get: () => (hipY + 0.42 * S) * root.scale.y });
    H.play('idle'); H.update(0);
    return H;
  }

  /* ---------- QUADRUPED (2026-10-19, the operator: "make a new base model for cats - that can be adapted for other assets later"): a supple
     four-legged animal - a rounded body (chest and haunch), two-part legs with paws (the hind legs bent at the hock), a tail of segments
     that curls, a rounded head with a muzzle, slit-pupilled eyes, whiskers and ears. Every proportion and the coat are parameters, so the
     cat is one preset and a lynx, a fox, a hound or a lion is another (QUAD_PRESETS) or a part's own numbers (o.preset, then o over it):
       size (1 = a house cat, ~0.25 m at the shoulder), len, girth, legLen, head, snout (0 flat .. 1 long), ears 'point'|'round'|'floppy'|
       'none', earSize, earTufts, tailLen, tailThick, tailFluff, tailUp (the carriage, radians), tailCurl, color, belly, pattern 'solid'|
       'tabby'|'tuxedo'|'points'|'calico'|'spots', mark (the pattern's colour), patch (calico's third), socks, eyes, pupil 'slit'|'round',
       nose, inner (inside the ears), whiskers (a colour, or false), mane, ruff (cheek tufts), idle 'sit'|'stand'.
     Joints as the beasts' (neck, tail, legFL..legBR, lift, dz, pitch, roll) and tail2, tail3, head, earL, earR, shinBL, shinBR; poses QUAD
     (BEAST's for anything QUAD lacks): it sits when it stops, walks in a diagonal gait with its tail up, bounds when it runs, swipes a paw. */
  const QUAD_PRESETS = {
    cat: { size: 1, len: 1, girth: 1, legLen: 1, head: 1, snout: 0.3, ears: 'point', earSize: 1, tailLen: 1, tailThick: 1, tailFluff: 0, tailUp: 1.05, tailCurl: 0.14,
      color: '#8a7a68', pattern: 'tabby', mark: '#4a3e34', eyes: '#c8cc48', pupil: 'slit', nose: '#c87a7a', inner: '#d89a94', whiskers: '#eeeae2', idle: 'sit' },
  };
  const ell = (rx, ry, rz, c, x, y, z) => { const m = ball(1, c, x, y, z, 1); m.scale.set(rx, ry, rz); return m; };
  function quadruped(o0) {
    const o = Object.assign({}, QUAD_PRESETS.cat, QUAD_PRESETS[o0.preset] || {}, o0);
    const S = o.size, c = o.color, mk = o.mark || shade(c, 0.55), belly = o.belly || shade(c, 1.25), socks = o.socks || null;
    const pt = o.pattern, pts = pt === 'points', tux = pt === 'tuxedo';
    const L = 0.46 * o.len * S, Gh = 0.15 * o.girth * S, Gw = 0.13 * o.girth * S, legH = 0.22 * o.legLen * S, R = 0.075 * o.head * S;
    const hipY = legH; const root = group(), roll = group(), body = group(); root.add(roll); roll.add(body); body.position.y = hipY;
    const trunk = group(); body.add(trunk);
    const torso = pts ? (o.belly || shade(c, 1.1)) : c;
    trunk.add(ell(Gw * 0.53, Gh * 0.52, L * 0.33, torso, 0, Gh * 0.06, L * 0.18));   /* the chest */
    trunk.add(ell(Gw * 0.5, Gh * 0.5, L * 0.32, torso, 0, Gh * 0.02, -L * 0.2));   /* the haunch */
    trunk.add(ell(Gw * 0.4, Gh * 0.3, L * 0.42, tux || pts ? '#f2efe8' : belly, 0, -Gh * 0.24, 0));   /* the belly */
    if (tux) trunk.add(ell(Gw * 0.36, Gh * 0.36, L * 0.12, '#f2efe8', 0, -Gh * 0.02, L * 0.42));   /* a white bib */
    /* the body's cross-section at z (the bigger of chest and haunch): centre height and half-width / half-height there */
    const xsec = z => { let best = { cy: 0, rx: 0, ry: 0 }; for (const [zc, rz, cy, rx, ry] of [[L * 0.18, L * 0.33, Gh * 0.06, Gw * 0.53, Gh * 0.52], [-L * 0.2, L * 0.32, Gh * 0.02, Gw * 0.5, Gh * 0.5]]) {
      const k2 = 1 - Math.pow((z - zc) / rz, 2); if (k2 > 0 && Math.sqrt(k2) * ry > best.ry) best = { cy, rx: Math.sqrt(k2) * rx, ry: Math.sqrt(k2) * ry }; } return best; };
    const onSkin = (z, th, r, col) => { const q = xsec(z); if (!q.ry) return; const R2 = Math.min(r, 0.55 * Math.min(q.rx, q.ry));   /* a patch: a cap sunk into the body at angle th from the top */
      const m = ell(R2, R2 * 0.6, R2 * 1.3, col, Math.sin(th) * q.rx * 0.8, q.cy + Math.cos(th) * q.ry * 0.8, z); m.rotation.z = -th; trunk.add(m); };
    if (pt === 'tabby') for (const f of [-0.44, -0.32, -0.2, -0.08, 0.04, 0.16, 0.28]) {   /* bands round the body, thin as paint */
      const z = f * L, q = xsec(z); if (q.ry) trunk.add(ell(q.rx * 1.03, q.ry * 1.03, 0.012 * S, mk, 0, q.cy, z));
    }
    if (pt === 'calico') for (const [f, th, r, col] of [[-0.26, 0.5, 0.06, mk], [0.12, -0.6, 0.055, o.patch || '#2a2420'], [0.34, 0.3, 0.05, mk], [-0.02, -0.1, 0.045, o.patch || '#2a2420'], [-0.36, -0.9, 0.04, mk]]) onSkin(f * L, th, r * S * o.girth, col);
    if (pt === 'spots') for (let i = 0; i < 16; i++) onSkin((-0.42 + 0.056 * i) * L, (i % 2 ? 1 : -1) * (0.35 + 0.35 * ((i * 7) % 3) / 2), 0.016 * S, mk);
    /* the head: a neck at the chest's front, the head on it (neck nods the lot, head turns and tilts) */
    const neck = group(0, Gh * 0.32, L * 0.4); trunk.add(neck);
    neck.add(ell(Gw * 0.34, Gh * 0.36, L * 0.13, pts ? torso : c, 0, Gh * 0.08, L * 0.04));
    const head = group(0, Gh * 0.42, L * 0.12); neck.add(head);
    const face = pts ? mk : c;
    head.add(ell(R, R * 0.86, R * 0.92, c, 0, 0, 0));   /* the skull */
    if (pts) head.add(ell(R * 0.82, R * 0.7, R * 0.6, mk, 0, -R * 0.12, R * 0.42));   /* the dark mask */
    const mzL = R * (0.26 + 0.6 * o.snout), mzC = tux ? '#f2efe8' : face;
    head.add(ell(R * 0.5, R * 0.34, mzL, mzC, 0, -R * 0.3, R * 0.62 + mzL * 0.4));   /* the muzzle */
    head.add(ell(R * 0.3, R * 0.2, R * 0.2, tux ? '#f2efe8' : shade(face, 1.15), 0, -R * 0.5, R * 0.6 + mzL * 0.3));   /* the chin */
    const tipZ = R * 0.62 + mzL * 1.35;
    head.add(box(R * 0.2, R * 0.12, R * 0.08, o.nose, 0, -R * 0.2, tipZ));   /* the nose */
    for (const sd of [-1, 1]) {
      const ey = group(sd * R * 0.4, R * 0.12, R * 0.78); head.add(ey); ey.rotation.y = sd * 0.35;
      ey.add(box(R * 0.26, R * 0.2, R * 0.04, o.eyes, 0, 0, 0));
      ey.add(box(o.pupil === 'round' ? R * 0.1 : R * 0.05, o.pupil === 'round' ? R * 0.1 : R * 0.19, R * 0.02, DARK, 0, 0, R * 0.025));
      if (o.whiskers) for (const [a, dy] of [[0.18, 0], [0, -0.06], [-0.18, -0.12]]) {
        const w = box(R * 0.9, 0.003 * S, 0.003 * S, o.whiskers, sd * R * 0.62, -R * 0.36 + dy * R, tipZ - R * 0.25); w.rotation.z = sd * a; w.rotation.y = -sd * 0.25; head.add(w);
      }
    }
    if (pt === 'tabby') for (const x of [-0.22, 0, 0.22]) { const st = box(R * 0.08, R * 0.02, R * 0.36, mk, x * R, R * 0.84, R * 0.2); st.rotation.y = x * 1.6; head.add(st); }   /* the M on the brow */
    const ears = [];
    for (const sd of [-1, 1]) {
      const eg = group(sd * R * 0.5, R * 0.58, -R * 0.05); head.add(eg); eg.rotation.z = -sd * 0.28; ears.push(eg);
      const es = o.earSize, ec = pts ? mk : c;
      if (o.ears === 'point') { eg.add(cone(R * 0.36 * es, R * 0.62 * es, ec, 0, R * 0.28 * es, 0, 3)); eg.add(cone(R * 0.22 * es, R * 0.42 * es, o.inner, 0, R * 0.22 * es, R * 0.07 * es, 3)); }
      else if (o.ears === 'round') eg.add(ell(R * 0.26 * es, R * 0.26 * es, R * 0.1 * es, ec, 0, R * 0.12 * es, 0));
      else if (o.ears === 'floppy') { const f = box(R * 0.32 * es, R * 0.7 * es, R * 0.08 * es, shade(ec, 0.85), sd * R * 0.12, -R * 0.28 * es, 0); f.rotation.z = sd * 0.5; eg.add(f); }
      if (o.earTufts && o.ears === 'point') eg.add(cone(R * 0.05, R * 0.3, o.earTufts === true ? DARK : o.earTufts, 0, R * 0.7 * es, 0, 4));
      if (o.ruff) { const rf = cone(R * 0.28, R * 0.6, o.ruff === true ? shade(c, 1.2) : o.ruff, sd * R * 0.75, -R * 0.45, R * 0.15, 4); rf.rotation.z = sd * 2.4; head.add(rf); }
    }
    if (o.mane) { neck.add(ell(Gw * 0.75, Gh * 0.8, L * 0.2, o.mane, 0, Gh * 0.35, L * 0.08)); head.add(ell(R * 1.35, R * 1.3, R * 0.7, o.mane, 0, 0, -R * 0.3)); }
    /* the legs: shoulder / hip joint, upper leg, knee (the hind ones a hock, bent back), lower leg, paw */
    const pawH = 0.024 * S, up = legH * 0.48;
    function leg(x, z, hind) {
      const g = group(x, -Gh * 0.08, z); trunk.add(g);
      const a1 = hind ? -0.3 : 0, a2 = hind ? 0.55 : 0; g.rotation.x = a1;
      const lc = socks || (pts ? mk : c);
      g.add(hind ? ell(0.038 * S * o.girth, up * 0.6, 0.05 * S * o.girth, c, 0, -up * 0.45, 0) : cyl(0.026 * S, 0.022 * S, up, c, 0, -up / 2, 0, 7));
      const knee = group(0, -up, 0); g.add(knee); knee.rotation.x = a2;
      const lo = Math.max(0.03 * S, (legH - pawH - up * Math.cos(a1)) / Math.cos(a1 + a2));
      knee.add(cyl(0.02 * S, 0.018 * S, lo, hind ? lc : lc, 0, -lo / 2, 0, 7));
      const paw = group(0, -lo, 0); knee.add(paw); paw.rotation.x = -(a1 + a2);
      paw.add(ell(0.026 * S, pawH * 0.6, 0.034 * S, socks || (pts ? mk : (tux ? '#f2efe8' : c)), 0, pawH * 0.35, 0.01 * S));
      if (pt === 'tabby') g.add(box(0.05 * S, 0.008 * S, 0.012 * S, mk, 0, -up * 0.7, 0.02 * S));
      return { g, knee };
    }
    const FL = leg(-Gw * 0.3, L * 0.3, false), FR = leg(Gw * 0.3, L * 0.3, false), BL = leg(-Gw * 0.32, -L * 0.3, true), BR = leg(Gw * 0.32, -L * 0.3, true);
    /* the tail: N segments from the rump, each turned a little more (the curl); tail, tail2, tail3 are its 1st, 3rd and 5th */
    const N = 6, segL = 0.38 * o.tailLen * S / N, t0 = 0.022 * o.tailThick * S, segs = [];
    let parent = group(0, Gh * 0.22, -L * 0.48); trunk.add(parent); const tailRoot = parent;
    for (let i = 0; i < N; i++) {
      const sg = group(0, 0, i ? -segL : 0); parent.add(sg); sg.rotation.x = i ? o.tailCurl : o.tailUp; segs.push(sg);
      const fl = 1 + o.tailFluff * Math.sin(Math.PI * (i + 0.5) / N), r0 = t0 * (1 - 0.45 * i / N) * fl, r1 = t0 * (1 - 0.45 * (i + 1) / N) * fl;
      const dark = (pt === 'tabby' && i % 2) || (pts) || (i === N - 1 && (pt === 'tabby' || o.tailTip));
      const m = cyl(r1, r0, segL * 1.08, dark ? (o.tailTip || mk) : c, 0, 0, -segL / 2, 7); m.rotation.x = -Math.PI / 2; sg.add(m);
      parent = sg;
    }
    const rot = obj => ({ kind: 'rot', o: obj, r0: [obj.rotation.x, obj.rotation.y, obj.rotation.z] });
    const joints = {
      neck: rot(neck), head: rot(head), earL: rot(ears[0]), earR: rot(ears[1]), tail: rot(segs[0]), tail2: rot(segs[2]), tail3: rot(segs[4]),
      legFL: rot(FL.g), legFR: rot(FR.g), legBL: rot(BL.g), legBR: rot(BR.g), shinBL: rot(BL.knee), shinBR: rot(BR.knee),
      lift: { kind: 'y', o: body, p0: hipY }, dz: { kind: 'z', o: trunk, p0: 0 }, pitch: { kind: 'rx', o: trunk }, roll: { kind: 'rz', o: roll }
    };
    void tailRoot;
    const H = character(root, joints, QUAD);
    H._hipY = hipY; H._S = S; H._sit = { pitch: -0.5, drop: L * 0.3 * Math.sin(0.5) }; H._idle = o.idle;
    H.setGear = () => H; H.setTool = () => H; H.attackAnim = () => 'bite';
    H.muzzle = out => (out = out || new THREE.Vector3(), head.getWorldPosition(out));
    Object.defineProperty(H, 'height', { get: () => (hipY + Gh * 0.8 + R * 1.6) * root.scale.y });
    H.play('idle'); H.update(0);
    return H;
  }

  /* ---------- spiders (2026-10-07, the Spider Cave): a round abdomen behind a small head, eight jointed legs that
     move in two alternating sets of four, fangs; the Queen wears a little crown. o: {size, color, belly, mark, eyes, crown} */
  const SPIDER_A = [0, 3, 4, 7], SPIDER_B = [1, 2, 5, 6];   /* L1 R2 L3 R4 / R1 L2 R3 L4 */
  const legs = (va, vb, lift) => { const o = {}, sd = i => (i % 2 ? 1 : -1);   /* swing (y) mirrored per side; a lifted leg rises (z, by side) */
    for (const i of SPIDER_A) o['l' + i] = [0, -va * sd(i), lift ? sd(i) * lift * Math.max(0, va) : 0]; for (const i of SPIDER_B) o['l' + i] = [0, -vb * sd(i), lift ? sd(i) * lift * Math.max(0, vb) : 0]; return o; };
  const SPIDER = {
    idle: { loop: true, dur: 2.4, fn: t => Object.assign(legs(0.05 * Math.sin(TAU * t), -0.05 * Math.sin(TAU * t)), { lift: [0.01 * Math.sin(TAU * t)], abd: [0.06 * Math.sin(TAU * t)] }) },
    walk: { loop: true, dur: 0.55, fn: t => { const s = Math.sin(TAU * t); return Object.assign(legs(0.35 * s, -0.35 * s, 0.6), { lift: [0.02 * Math.abs(s)] }); } },
    run: { loop: true, dur: 0.32, fn: t => { const s = Math.sin(TAU * t); return Object.assign(legs(0.5 * s, -0.5 * s, 0.8), { lift: [0.03 * Math.abs(s)], pitch: [0.05 * s] }); } },
    bite: { dur: 0.6, impact: 0.45, fn: K(0, {}, 0.3, Object.assign(legs(0, 0), { pitch: [0.25], dz: [-0.05], fangs: [0.5] }), 0.45, { pitch: [-0.2], dz: [0.16], fangs: [-0.3] }, 1, {}) },
    hit: { dur: 0.4, fn: K(0, {}, 0.3, { pitch: [0.2], dz: [-0.06] }, 1, {}) },
    death: { dur: 1, hold: true, fn: K(0, {}, 0.4, { lift: [0.1] }, 1, Object.assign({ roll: [3.0], lift: [0.04] }, (() => { const o = {}; for (let i = 0; i < 8; i++) o['l' + i] = [0, 0, (i % 2 ? -1 : 1) * 0.9]; return o; })())) }
  };
  SPIDER.slash = SPIDER.stab = SPIDER.crush = SPIDER.bite;
  function spider(o) {
    const S = o.size || 1, c = o.color || '#3a2f2a', dk = shade(c, 0.7), lg = shade(c, 0.85);
    const root = group(), roll = group(), body = group(); root.add(roll); roll.add(body);
    const hipY = 0.22 * S; body.position.y = hipY;
    const trunk = group(); body.add(trunk);
    trunk.add(ball(0.16 * S, c, 0, 0, 0.06 * S, 1));                                   /* the head and thorax */
    const abd = group(0, 0.05 * S, -0.12 * S); trunk.add(abd);
    const ab = ball(0.27 * S, dk, 0, 0.06 * S, -0.18 * S, 1); ab.scale.set(1, 0.85, 1.15); abd.add(ab);
    if (o.mark) { const mk = ball(0.11 * S, o.mark, 0, 0.27 * S, -0.2 * S, 1); mk.scale.set(1, 0.3, 1.3); abd.add(mk); }
    if (o.belly) { const bl = ball(0.18 * S, o.belly, 0, -0.06 * S, -0.16 * S, 1); bl.scale.set(1, 0.5, 1.1); abd.add(bl); }
    for (const [x, y] of [[-0.05, 0.08], [0.05, 0.08], [-0.09, 0.05], [0.09, 0.05], [-0.03, 0.12], [0.03, 0.12]]) trunk.add(ball(0.022 * S, o.eyes || '#d02020', x * S, y * S, 0.2 * S));
    const fangs = group(0, -0.04 * S, 0.2 * S); trunk.add(fangs);
    fangs.add(cone(0.025 * S, 0.1 * S, '#d8d0b0', -0.04 * S, -0.04 * S, 0, 4), cone(0.025 * S, 0.1 * S, '#d8d0b0', 0.04 * S, -0.04 * S, 0, 4));
    fangs.children.forEach(m => { m.rotation.x = Math.PI; });
    if (o.crown) { const cr = group(0, 0.15 * S, 0.06 * S); trunk.add(cr); cr.add(box(0.2 * S, 0.04 * S, 0.16 * S, o.crown, 0, 0, 0)); for (let k = 0; k < 5; k++) cr.add(cone(0.025 * S, 0.08 * S, o.crown, (-0.08 + k * 0.04) * S, 0.06 * S, 0.06 * S, 4)); }
    const LEGS = [];
    for (let i = 0; i < 8; i++) {   /* 4 a side, front to back; each a hip (swings) with an upper and a lower segment */
      const sd = i % 2 ? 1 : -1, row = i >> 1, z = (0.12 - row * 0.08) * S, a = (row - 1.5) * 0.45;
      const hip = group(sd * 0.1 * S, 0, z); trunk.add(hip); hip.rotation.y = sd > 0 ? -a : a;
      const up = group(); hip.add(up); up.rotation.z = sd * 0.75;                         /* the upper leg rises out to the side */
      up.add(box(0.3 * S, 0.035 * S, 0.035 * S, lg, sd * 0.15 * S, 0, 0));
      const knee = group(sd * 0.3 * S, 0, 0); up.add(knee); knee.rotation.z = -sd * 1.9;  /* and bends down at the knee */
      knee.add(box(0.34 * S, 0.03 * S, 0.03 * S, dk, sd * 0.17 * S, 0, 0));
      LEGS.push(hip);
    }
    root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    const rot = obj => ({ kind: 'rot', o: obj, r0: [obj.rotation.x, obj.rotation.y, obj.rotation.z] });
    const joints = { abd: rot(abd), fangs: rot(fangs), lift: { kind: 'y', o: body, p0: hipY }, dz: { kind: 'z', o: trunk, p0: 0 }, pitch: { kind: 'rx', o: trunk }, roll: { kind: 'rz', o: roll } };
    LEGS.forEach((h, i) => { joints['l' + i] = rot(h); });
    const H = character(root, joints, SPIDER);
    H.setGear = () => H; H.setTool = () => H; H.attackAnim = () => 'bite';
    H.muzzle = out => (out = out || new THREE.Vector3(), fangs.getWorldPosition(out));
    Object.defineProperty(H, 'height', { get: () => (hipY + 0.35 * S) * root.scale.y });
    H.play('idle'); H.update(0);
    return H;
  }

  /* ---------- birds (chickens): they peck, strut, and flap up off the ground when they scatter ---------- */
  const BIRD = {
    idle: { loop: true, dur: 1.8, fn: t => { const pk = (a) => t > a && t < a + 0.16 ? Math.sin((t - a) / 0.16 * Math.PI) : 0, k = Math.max(pk(0.2), pk(0.42), pk(0.78)); return { neck: [1.45 * k], pitch: [0.35 * k], tail: [0.1 * Math.sin(TAU * t) - 0.2 * k] }; } },   /* pecking at the ground (the operator): three quick pecks a loop, head right down */
    walk: { loop: true, dur: 0.5, fn: t => { const s = Math.sin(TAU * t); return { legL: [0.6 * s], legR: [-0.6 * s], neck: [0.25 * Math.max(0, s)], lift: [0.01 * Math.abs(s)] }; } },
    run: { loop: true, dur: 0.22, fn: t => { const s = Math.sin(TAU * t); return { legL: [0.3], legR: [0.3], wingL: [0, 0, -0.2 - 1.1 * Math.abs(s)], wingR: [0, 0, 0.2 + 1.1 * Math.abs(s)], lift: [0.35 + 0.08 * s], pitch: [-0.15] }; } },   /* flapping up */
    bite: { dur: 0.5, impact: 0.4, fn: K(0, {}, 0.4, { neck: [1.0] }, 1, {}) },
    hit: { dur: 0.4, fn: K(0, {}, 0.3, { wingL: [0, 0, -1], wingR: [0, 0, 1], lift: [0.15] }, 1, {}) },
    death: { dur: 0.8, hold: true, fn: K(0, {}, 1, { roll: [1.5], lift: [0.02], legL: [0.8], legR: [0.6] }) }
  };
  BIRD.slash = BIRD.stab = BIRD.crush = BIRD.bite;
  /* the town portal (2026-10-04): a ring of standing stones round a slow, turning glow */
  const PORTAL = { idle: { loop: true, dur: 6, fn: t => ({ glow: [0, TAU * t, 0], glow2: [0, -TAU * t * 1.5, 0] }) } };
  PORTAL.walk = PORTAL.run = PORTAL.open = PORTAL.idle;
  function portal(o) {
    const S = o.size || 1, stone = o.stone || '#8a8780', glowC = o.glow || '#8fd8ff';
    const root = group(), body = group(); root.add(body);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, h = (1.1 + 0.25 * ((i * 37) % 3)) * S;
      const st = box(0.22 * S, h, 0.16 * S, i % 2 ? shade(stone, 0.9) : stone, Math.cos(a) * 0.75 * S, h / 2, Math.sin(a) * 0.75 * S); st.rotation.y = -a; body.add(st); }
    body.add(cyl(0.95 * S, 1.0 * S, 0.06 * S, shade(stone, 0.75), 0, 0.03 * S, 0, 14));
    const g1 = group(0, 0.75 * S, 0), g2 = group(0, 0.75 * S, 0); body.add(g1, g2);
    const glowMat = () => new THREE.MeshBasicMaterial({ color: glowC, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.42 * S, 0.035 * S, 6, 24), glowMat()); r1.rotation.x = Math.PI / 2.4; g1.add(r1);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.3 * S, 0.03 * S, 6, 20), glowMat()); r2.rotation.x = -Math.PI / 2.6; g2.add(r2);
    const core0 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 * S, 1), glowMat()); g1.add(core0);
    root.traverse(m => { if (m.isMesh && m.material && !m.material.transparent) { m.castShadow = true; m.receiveShadow = true; } });
    const joints = { glow: { kind: 'rot', o: g1, r0: [0, 0, 0] }, glow2: { kind: 'rot', o: g2, r0: [0, 0, 0] } };
    const H = character(root, joints, PORTAL);
    H.setGear = () => H; H.setTool = () => H; H.attackAnim = () => 'idle';
    H.muzzle = out => (out = out || new THREE.Vector3(), g1.getWorldPosition(out));
    Object.defineProperty(H, 'height', { get: () => 1.4 * S * root.scale.y });
    H.play('idle', { loop: true }); H.update(0);
    return H;
  }
  /* the town chest (2026-10-04: "a chest in town" that holds your wallet): wood, iron bands, a lid that lifts */
  const CHEST = { idle: { loop: true, dur: 2, fn: () => ({}) }, open: { dur: 0.6, hold: true, fn: K(0, {}, 0.5, { lid: [-1.1] }) } };
  CHEST.walk = CHEST.run = CHEST.idle;
  function chest(o) {
    const S = o.size || 1, wood = o.color || '#7a4a24', band = o.band || '#3a3a40', gold = o.lock || '#d8b040';
    const root = group(), body = group(); root.add(body);
    if (o.style === 'makak') {   /* the Ojibwe chest of Ziibiing (2026-10-07): a birch bark makak, stitched with spruce root, quill flowers on its side */
      const bark = '#e2d3ae', dark = '#3a2a1e', root2 = '#8a6a3e', F = ['#d8344a', '#f2c641', '#f4f1ea', '#e87ab0', '#3f9a4a'];
      body.add(box(0.9 * S, 0.5 * S, 0.6 * S, bark, 0, 0.25 * S, 0));
      for (const y of [0.04, 0.47]) body.add(box(0.92 * S, 0.04 * S, 0.62 * S, root2, 0, y * S, 0));
      for (const x of [-0.45, 0.45]) body.add(box(0.03 * S, 0.5 * S, 0.62 * S, dark, x * S, 0.25 * S, 0));
      for (const fx of [-0.22, 0.22]) {   /* a flower each side of the front: petals round a centre, a stem */
        body.add(box(0.05 * S, 0.05 * S, 0.02 * S, F[1], fx * S, 0.3 * S, 0.305 * S));
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; body.add(box(0.045 * S, 0.045 * S, 0.02 * S, fx < 0 ? F[0] : F[3], (fx + Math.cos(a) * 0.06) * S, (0.3 + Math.sin(a) * 0.06) * S, 0.304 * S)); }
        body.add(box(0.02 * S, 0.14 * S, 0.02 * S, F[4], fx * S, 0.16 * S, 0.304 * S));
      }
      const lid = group(0, 0.5 * S, -0.3 * S); body.add(lid);
      lid.add(box(0.95 * S, 0.1 * S, 0.65 * S, '#d6c69f', 0, 0.05 * S, 0.3 * S));
      lid.add(box(0.97 * S, 0.03 * S, 0.67 * S, root2, 0, 0.0, 0.3 * S));
      lid.add(box(0.3 * S, 0.04 * S, 0.06 * S, dark, 0, 0.12 * S, 0.3 * S));   /* the handle */
      root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const H = character(root, { lid: { kind: 'rot', o: lid, r0: [0, 0, 0] } }, CHEST);
      H.setGear = () => H; H.setTool = () => H; H.attackAnim = () => 'idle';
      H.muzzle = out => (out = out || new THREE.Vector3(), lid.getWorldPosition(out));
      Object.defineProperty(H, 'height', { get: () => 0.62 * S * root.scale.y });
      H.play('idle'); H.update(0);
      return H;
    }
    body.add(box(0.9 * S, 0.5 * S, 0.6 * S, wood, 0, 0.25 * S, 0));
    for (const x of [-0.32, 0.32]) body.add(box(0.06 * S, 0.52 * S, 0.62 * S, band, x * S, 0.25 * S, 0));
    const lid = group(0, 0.5 * S, -0.3 * S); body.add(lid);
    lid.add(box(0.92 * S, 0.16 * S, 0.62 * S, shade(wood, 1.1), 0, 0.08 * S, 0.3 * S));
    for (const x of [-0.32, 0.32]) lid.add(box(0.07 * S, 0.17 * S, 0.63 * S, band, x * S, 0.08 * S, 0.3 * S));
    body.add(box(0.12 * S, 0.14 * S, 0.04 * S, gold, 0, 0.44 * S, 0.31 * S));
    root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const joints = { lid: { kind: 'rot', o: lid, r0: [0, 0, 0] } };
    const H = character(root, joints, CHEST);
    H.setGear = () => H; H.setTool = () => H; H.attackAnim = () => 'idle';
    H.muzzle = out => (out = out || new THREE.Vector3(), lid.getWorldPosition(out));
    Object.defineProperty(H, 'height', { get: () => 0.7 * S * root.scale.y });
    H.play('idle'); H.update(0);
    return H;
  }
  /* a merchant's wagon gone over on the road (the Wayside Prayer): tipped bed, a wheel off, the load in the grass */
  const WAGON = { idle: { loop: true, dur: 2, fn: () => ({}) } };
  WAGON.walk = WAGON.run = WAGON.open = WAGON.idle;
  function wagon(o) {
    const S = o.size || 1, wood = o.color || '#8a5a30', dark = shade(wood, 0.7), iron = o.iron || '#3a3a40', cloth = o.cloth || '#d8cfb4';
    const root = group(), body = group(); root.add(body);
    const bed = group(0, 0.42 * S, 0); bed.rotation.z = 0.32; bed.rotation.y = 0.15; body.add(bed);
    bed.add(box(1.5 * S, 0.08 * S, 0.9 * S, wood, 0, 0, 0));
    for (const z of [-0.43, 0.43]) bed.add(box(1.5 * S, 0.3 * S, 0.05 * S, dark, 0, 0.18 * S, z * S));
    bed.add(box(0.05 * S, 0.3 * S, 0.9 * S, dark, 0.73 * S, 0.18 * S, 0));
    for (const x of [-0.5, 0, 0.5]) bed.add(box(0.05 * S, 0.34 * S, 0.94 * S, dark, x * S, 0.2 * S, 0));
    for (const x of [-0.4, 0.35]) { const h = mesh(new THREE.TorusGeometry(0.45 * S, 0.025 * S, 4, 10, Math.PI), wood, x * S, 0.3 * S, 0); h.rotation.y = Math.PI / 2; bed.add(h); }
    const cover = mesh(new THREE.CylinderGeometry(0.44 * S, 0.44 * S, 0.8 * S, 10, 1, true, 0, Math.PI), mat(cloth, { side: THREE.DoubleSide }), -0.02 * S, 0.3 * S, 0); cover.rotation.z = Math.PI / 2; bed.add(cover);
    const wheel = (x, y, z, rx, rz, broken) => {
      const w = group(x * S, y * S, z * S); w.rotation.set(rx, 0, rz); body.add(w);
      w.add(mesh(new THREE.TorusGeometry(0.36 * S, 0.04 * S, 4, 12, broken ? Math.PI * 1.4 : Math.PI * 2), iron));
      w.add(cyl(0.07 * S, 0.07 * S, 0.12 * S, dark, 0, 0, 0, 8).rotateX(Math.PI / 2));
      for (let i = 0; i < (broken ? 4 : 6); i++) { const sp = box(0.03 * S, 0.66 * S, 0.03 * S, wood, 0, 0, 0); sp.rotation.z = i * Math.PI / 6; w.add(sp); }
    };
    wheel(-0.55, 0.36, 0.52, 0, 0.1, false);
    wheel(0.45, 0.36, 0.52, 0, -0.2, false);
    wheel(0.55, 0.04, -0.95, Math.PI / 2, 0, true);
    const axle = box(0.08 * S, 0.08 * S, 1.1 * S, iron, -0.55 * S, 0.2 * S, -0.05 * S); axle.rotation.x = -0.3; body.add(axle);
    const shaft = box(1.2 * S, 0.06 * S, 0.06 * S, wood, 1.3 * S, 0.05 * S, 0.25 * S); shaft.rotation.y = 0.4; body.add(shaft);
    const crate = box(0.32 * S, 0.28 * S, 0.32 * S, shade(wood, 1.15), -1.05 * S, 0.14 * S, -0.55 * S); crate.rotation.y = 0.6; body.add(crate);
    const crate2 = box(0.26 * S, 0.24 * S, 0.26 * S, shade(wood, 1.05), -1.25 * S, 0.12 * S, 0.1 * S); crate2.rotation.set(0.2, -0.3, 0.9); body.add(crate2);
    body.add(ball(0.18 * S, '#c8b080', -0.7 * S, 0.12 * S, -0.95 * S, 1));
    for (let i = 0; i < 5; i++) { const c = cyl(0.03 * S, 0.03 * S, 0.2 * S, '#f2ecd8', (-0.9 + i * 0.12) * S, 0.03 * S, (-1.1 + (i % 2) * 0.1) * S, 6); c.rotation.z = Math.PI / 2; c.rotation.y = i * 0.7; body.add(c); }
    root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const H = character(root, {}, WAGON);
    H.setGear = () => H; H.setTool = () => H; H.attackAnim = () => 'idle';
    H.muzzle = out => (out = out || new THREE.Vector3(), bed.getWorldPosition(out));
    Object.defineProperty(H, 'height', { get: () => 1.0 * S * root.scale.y });
    H.play('idle'); H.update(0);
    return H;
  }
  function bird(o) {
    const root = group(), roll = group(), body = group(); root.add(roll); roll.add(body);
    const S = o.size || 0.4, c = o.color || '#f2efe6', dk = shade(c, 0.8), legC = o.legs || '#e0a030';
    const hipY = 0.28 * S; body.position.y = hipY;
    const trunk = group(); body.add(trunk);
    trunk.add(ball(0.22 * S, c, 0, 0.12 * S, 0));
    const tail = group(0, 0.2 * S, -0.18 * S); trunk.add(tail); tail.add(box(0.06 * S, 0.22 * S, 0.12 * S, o.tail || dk, 0, 0.08 * S, -0.02 * S));
    const neck = group(0, 0.24 * S, 0.14 * S); trunk.add(neck);
    neck.add(ball(0.11 * S, c, 0, 0.1 * S, 0.04 * S));
    neck.add(cone(0.035 * S, 0.09 * S, legC, 0, 0.09 * S, 0.17 * S, 4).rotateX(Math.PI / 2));
    if (o.comb) neck.add(box(0.03 * S, 0.07 * S, 0.1 * S, o.comb, 0, 0.21 * S, 0.04 * S), box(0.025 * S, 0.06 * S, 0.03 * S, o.comb, 0, 0.03 * S, 0.14 * S));
    neck.add(box(0.025 * S, 0.025 * S, 0.01 * S, DARK, -0.07 * S, 0.13 * S, 0.1 * S), box(0.025 * S, 0.025 * S, 0.01 * S, DARK, 0.07 * S, 0.13 * S, 0.1 * S));
    function wing(sd) { const g = group(sd * 0.2 * S, 0.16 * S, 0); trunk.add(g); g.add(box(0.03 * S, 0.14 * S, 0.24 * S, dk, sd * 0.01 * S, -0.04 * S, -0.02 * S)); return g; }
    const WL = wing(-1), WR = wing(1);
    function leg(x) { const g = group(x * S, -0.02 * S, 0.02 * S); trunk.add(g); g.add(box(0.025 * S, hipY, 0.025 * S, legC, 0, -hipY / 2, 0)); g.add(box(0.08 * S, 0.015 * S, 0.1 * S, legC, 0, -hipY + 0.01 * S, 0.03 * S)); return g; }
    const LL = leg(-0.07), LR = leg(0.07);
    root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    const rot = obj => ({ kind: 'rot', o: obj, r0: [obj.rotation.x, obj.rotation.y, obj.rotation.z] });
    const joints = { neck: rot(neck), tail: rot(tail), wingL: rot(WL), wingR: rot(WR), legL: rot(LL), legR: rot(LR), lift: { kind: 'y', o: body, p0: hipY }, pitch: { kind: 'rx', o: trunk }, roll: { kind: 'rz', o: roll } };
    const H = character(root, joints, BIRD);
    H.setGear = () => H; H.setTool = () => H; H.attackAnim = () => 'bite';
    H.muzzle = out => (out = out || new THREE.Vector3(), neck.getWorldPosition(out));
    H.flying = (on) => { const up = on !== false; LL.visible = LR.visible = !up; root.traverse(m => { if (m.isMesh) m.castShadow = !up; }); return H; };   /* in the air: legs tucked, no shadow; flying(false): standing */
    Object.defineProperty(H, 'height', { get: () => (hipY + 0.4 * S) * root.scale.y });
    H.play('idle'); H.update(0);
    return H;
  }

  /* ---------- ground items (any part that lists the id) ---------- */
  function item(id) {
    const g = new THREE.Group(), e = ITEMS[id];
    if (!e) { g.add(box(0.15, 0.15, 0.15, '#aa44aa', 0, 0.075, 0)); return g; }   /* unknown id: visible, never invisible */
    const P = e.part, V = { t: e.t, W: 1, small: 0, big: 0, dragon: id === 'dragon_cape' ? 1 : 0 }, I = info(id);
    const C = { t: e.t, family: P.family, c: I.color, skin: DEFAULT_OUTFIT.skin, hair: DEFAULT_OUTFIT.hairColor, beard: DEFAULT_OUTFIT.hairColor, eyes: DEFAULT_OUTFIT.eyes, brow: DEFAULT_OUTFIT.hairColor };
    const inner = new THREE.Group(); g.add(inner);
    if (P.groundShapes) build(P.groundShapes, C, V, () => inner);
    else build(P.shapes, C, V, () => inner);   /* joints ignored on the ground: the shapes keep their local positions */
    const gt = P.ground || {}, p = evs(gt.p || [0, 0, 0], V), r = evs(gt.r || [0, 0, 0], V);
    inner.position.set(p[0], p[1], p[2]); inner.rotation.set(r[0], r[1], r[2]);
    return g;
  }
  let glowTex = null;
  function glowTexture() {
    if (glowTex || typeof document === 'undefined') return glowTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(cv); return glowTex;
  }
  function projectile(kind, tc) {
    if (kind === 'arrow') {
      const P = PARTS['gear.arrows'], g = new THREE.Group(), t = typeof tc === 'number' ? tc : 1;
      if (P && P.projectile) build(P.projectile, { t, family: 'metal' }, { t }, () => g);
      return g;
    }
    const c = typeof tc === 'string' ? tc : (TIERS.cloth || [])[tc || 3] || '#6688ff', g = new THREE.Group();
    g.add(mesh(new THREE.IcosahedronGeometry(0.09, 1), mat(c, { emissive: c, emissiveIntensity: 1 })));
    const tex = glowTexture();
    if (tex) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(0.55); g.add(s); }
    return g;
  }

  /* ---------- inventory icons ---------- */
  let iconR = null; const ICONS = new Map();
  function icon(id, size) {
    size = size || 64; const key = id + '@' + size;
    if (ICONS.has(key)) return ICONS.get(key);
    try {
      if (!iconR) { iconR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); iconR.setClearColor(0x000000, 0); }
      iconR.setSize(size, size, false);
      const sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xffffff, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 4, 3); sc.add(dl);
      const obj = item(id); sc.add(obj);
      const I = info(id), ir = I.part && I.part.iconRot;   /* iconRot: a part's own turn for its icon (golfwear laid flat faces you) */
      if (ir) obj.rotation.set(ir[0], ir[1], ir[2]); else if (I.kind === 'helmet') obj.rotation.y = 0.6; else obj.rotation.y = -0.7;
      const bb = new THREE.Box3().setFromObject(obj), ctr = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3()).length() / 2 || 0.2;
      const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
      cam.position.copy(ctr).add(new THREE.Vector3(0, 1.1, 1).normalize().multiplyScalar(r / Math.sin(15 * Math.PI / 180) * 0.92)); cam.lookAt(ctr);
      iconR.render(sc, cam);
      const url = iconR.domElement.toDataURL('image/png');
      obj.traverse(m => { if (m.isMesh) m.geometry.dispose(); });
      ICONS.set(key, url); return url;
    } catch (e) { ICONS.set(key, null); return null; }
  }

  return {
    tiers: TIERS, info, outfitStyles: OUTFIT_STYLES, palette: PALETTE, defaultOutfit: () => JSON.parse(JSON.stringify(DEFAULT_OUTFIT)),
    humanoid,
    monster: key => fromChar(key) || fromChar('bandit') || humanoid(),
    npc: key => fromChar(key) || fromChar('tam') || humanoid(),
    item, projectile, icon,
    parts: PARTS, items: ITEMS, addPart, validate,
    names: { monsters: Object.values(PARTS).filter(p => p.kind === 'char' && p.role === 'monster').map(p => p.id.slice(5)), npcs: Object.values(PARTS).filter(p => p.kind === 'char' && p.role === 'npc').map(p => p.id.slice(5)) }
  };
}
