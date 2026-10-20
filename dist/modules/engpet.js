/* ASHVALE 3D engine part: pets from Doginals (2026-10-17). A player whose Dogecoin wallet (the same key as their arcade
   account) holds a Doginal Dog or an Anti Doginal Dog gets a pet dog drawn in that dog's style, at their left heel: it trots,
   gallops when they run, sits when they stop, and other players see it.
   - The dog: low-poly boxes like the game's beasts, every trait of the collection a part (17 furs, 17 coat patterns, 31 heads,
     14 eyes, 14 clothes, 6 mouth items, 6 accessories); colours measured from the inscriptions' own pixels. An ADD is the same
     dog colour-inverted and mirrored, as the ADD inscriptions draw it. ADD #n draws Doginal Dog #n, so both collections need
     only the number: DATA holds the ORIGINAL Doginal Dog traits for all 10,000 (doggy.market, audited; #3079 is the dog doggy
     labels as a second "#3099").
   - What the wallet holds: GET /r/doginals/<address> (the arcade's collection registry: items {collection{name}, number}).
     ?pet=add:165,dd:2608 gives test pets. The choice is kept on the device (localStorage ashvale.pet).
   - Doginal Frogs (2026-10-19): a frog in the wallet is a pet too (buildFrog): its own frog body and hops, wearing the
     dog's parts recoloured to its traits. The arcade names it from the Doginal Frogs collection JSON; nothing per frog is stored.
   - Network: our pet goes out as {pt: {k: 'dd'|'add'|'frog', n}} with the gear; another player's {pt} draws theirs (a number with no
     traits draws nothing).
   install(K) -> { frame(now, dt), net(id, pt, ent), drop(id), desc(), owned(), choose(d) } */
(function (G) {
  'use strict';
  /* ---------- the dog (same idiom as models.js: flat-shaded Lambert boxes, facing +z, ~0.56 m at the ears before CHAR) ---------- */
  /* the builders' toolkit: flat-shaded Lambert parts, a material per colour, a seeded random (made: every mesh, for a recolour) */
  function kit(THREE, seed, made) {
    const MATS = new Map();
    const mat = (c, glow) => { const k = c + (glow || ''); let m = MATS.get(k);
      if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); if (glow) { m.emissive = new THREE.Color(c); m.emissiveIntensity = glow; } MATS.set(k, m); } return m; };
    const add = (p, geo, c, x, y, z, glow) => { const m = new THREE.Mesh(geo, typeof c === 'string' ? mat(c, glow) : c); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; p.add(m); if (made) made.push(m); return m; };
    const box = (p, w, h, d, c, x, y, z, g) => add(p, new THREE.BoxGeometry(w, h, d), c, x, y, z, g);
    const cyl = (p, rt, rb, h, c, x, y, z, seg, g) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg || 8), c, x, y, z, g);
    const cone = (p, r, h, c, x, y, z, seg, g) => add(p, new THREE.ConeGeometry(r, h, seg || 6), c, x, y, z, g);
    const ball = (p, r, c, x, y, z, d, g) => add(p, new THREE.IcosahedronGeometry(r, d || 0), c, x, y, z, g);
    const dome = (p, r, c, x, y, z, g) => add(p, new THREE.SphereGeometry(r, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), c, x, y, z, g);
    const ring = (p, r, t, c, x, y, z, g) => add(p, new THREE.TorusGeometry(r, t, 5, 12), c, x, y, z, g);
    /* a box rounded along its length (2026-10-18: "make the body less square"): the cross-section's corners [tl, tr, br, bl] in x-y */
    const rbox = (p, w, h, d, rr, c, x, y, z, g) => { const [a, b2, e, f] = rr, hw = w / 2, hh = h / 2, S = new THREE.Shape();
      S.moveTo(-hw + f, -hh); S.lineTo(hw - e, -hh); if (e) S.absarc(hw - e, -hh + e, e, -Math.PI / 2, 0, false); S.lineTo(hw, hh - b2); if (b2) S.absarc(hw - b2, hh - b2, b2, 0, Math.PI / 2, false);
      S.lineTo(-hw + a, hh); if (a) S.absarc(-hw + a, hh - a, a, Math.PI / 2, Math.PI, false); S.lineTo(-hw, -hh + f); if (f) S.absarc(-hw + f, -hh + f, f, Math.PI, Math.PI * 1.5, false);
      const geo = new THREE.ExtrudeGeometry(S, { depth: d, bevelEnabled: false, curveSegments: 3, steps: Math.max(1, Math.round(d / 0.03)) }); geo.translate(0, 0, -d / 2); return add(p, geo, c, x, y, z, g); };
    const grp = (p, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); p.add(g); return g; };
    const col = h => new THREE.Color(h);
    const mix = (a, b, f) => '#' + col(a).lerp(col(b), f).getHexString();
    const shade = (h, f) => { const c = col(h); c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f); return '#' + c.getHexString(); };
    let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    return { mat, add, box, cyl, cone, ball, dome, ring, rbox, grp, col, mix, shade, rnd };
  }
  /* what a pet wears, shared by the dog and the frog: eyes and eyewear, head wear, clothes, a chain, the mouth item, the accessory.
     Head frame: a 0.24 x 0.22 x 0.22 box, front at z 0.11, top at y 0.11; trunk frame: 0.24 x 0.22 x 0.46 along z.
     X.on(section) is told as each part starts (a frog recolours them); X.eye, X.noBrow, X.gems, X.tie, X.chain, X.rainbow are a frog's. */
  function dress(X) {
    const { THREE, head, neck, trunk, A, R, HEAD, BR, snL, rnd, add, box, cyl, cone, ball, dome, ring, rbox, grp, mix, shade } = X;
    const mat = X.mat;
    const K = '#262626', GOLD = '#e3b53a', SILVER = '#c9cdd3';
    X.on && X.on('eyes');
    /* eyes, as the pixel art draws them: each eye two pixels, [dark or coloured][white] left to right, a darker 2-pixel brow above */
    const P = 0.024, EZ = 0.112, EY = 0.03, EX = 0.055;
    const glass = (cc, op) => new THREE.MeshLambertMaterial({ color: cc, transparent: true, opacity: op, depthWrite: false, flatShading: true });
    const px = (x, cc, dz) => box(head, P, 0.026, 0.008, cc, x, EY, EZ + (dz || 0));
    const eye = X.eye || ((x, iris, white) => { px(x - P / 2, iris || K); px(x + P / 2, white || '#ffffff'); });   /* a frog draws its own eyes under the same eyewear */
    const browC = shade(R.face || R.main, 0.72), brow = (x, dy) => box(head, 0.052, 0.016, 0.01, browC, x, EY + 0.028 + (dy || 0), EZ);
    const IRIS = { Red: '#ff1a1a', Pink: '#ff7ac0', Yellow: '#ffe04a', Blue: '#00e1ff', Green: '#4fe07a' };
    const E = A['Eyes'];
    if (E !== 'Visor' && E !== 'Sunglasses' && !R.brow && !X.noBrow) { brow(-EX); brow(EX); }
    if (IRIS[E]) { eye(-EX, IRIS[E]); eye(EX, IRIS[E]); }
    else if (E === 'Mixed') { eye(-EX); eye(EX, '#ff7ac0'); }
    else if (E === 'Sleepy') for (const x of [-EX, EX]) { eye(x, K, '#ff9ad0'); box(head, 0.05, 0.013, 0.012, browC, x, EY + 0.008, EZ + 0.002); }   /* lids half down */
    else if (E === 'Eyepatch') { eye(EX); box(head, 0.056, 0.05, 0.014, '#5e2a2a', -EX, EY + 0.002, EZ + 0.003); box(head, 0.024, 0.024, 0.016, '#713636', -EX - 0.012, EY + 0.012, EZ + 0.003);
      const st = box(head, 0.252, 0.012, 0.232, K, 0, EY + 0.035, 0); st.rotation.z = -0.3; }
    else if (E === 'Monocle') { eye(-EX); eye(EX); add(head, new THREE.BoxGeometry(0.05, 0.05, 0.004), glass('#7d8fa8', 0.55), -EX, EY, EZ + 0.012); ring(head, 0.032, 0.006, GOLD, -EX, EY, EZ + 0.012);
      for (let i = 0; i < 5; i++) box(head, 0.006, 0.014, 0.006, GOLD, -EX - 0.03 - i * 0.006, EY - 0.04 - i * 0.016, EZ + 0.008); }
    else if (E === 'Sunglasses') {   /* the "cool" pixel shades: a thick black bar wider than the head, stepped lenses, two white glints each */
      box(head, 0.32, 0.024, 0.018, K, 0, EY + 0.03, EZ + 0.01);
      for (const x of [-EX, EX]) { box(head, 0.085, 0.034, 0.018, K, x, EY + 0.006, EZ + 0.01); box(head, 0.06, 0.018, 0.018, K, x - 0.012, EY - 0.018, EZ + 0.01);
        box(head, 0.013, 0.013, 0.004, '#ffffff', x + 0.006, EY - 0.002, EZ + 0.02); box(head, 0.013, 0.013, 0.004, '#ffffff', x + 0.02, EY + 0.011, EZ + 0.02); }
      for (const sd of [-1, 1]) box(head, 0.01, 0.018, 0.12, K, sd * 0.125, EY + 0.03, 0.05); }
    else if (E === 'Visor') {   /* as the pixels draw it: a wraparound band across both eyes - black rim, bright green lens with lighter
                                   green and white glints, a grey strap piece at each side */
    eye(-EX); eye(EX);
    box(head, 0.25, 0.064, 0.016, K, 0, EY + 0.002, EZ + 0.01);                        /* the black rim */
    const lens = A._visor || '#00e000', lit = mix(lens, '#ffffff', 0.5);   /* each dog's own lens colour, read from its pixels */
    if (X.rainbow) X.rainbow.forEach((rc, i, a) => box(head, 0.226 / a.length, 0.044, 0.006, rc, -0.113 + 0.226 / a.length * (i + 0.5), EY + 0.002, EZ + 0.02, 0.25));   /* a rainbow lens */
    else box(head, 0.226, 0.044, 0.006, lens, 0, EY + 0.002, EZ + 0.02, 0.25);
    for (const [x, y, c] of [[-0.075, EY + 0.012, lit], [0.035, EY + 0.012, lit], [-0.03, EY - 0.008, lit], [0.08, EY - 0.008, lit], [-0.1, EY + 0.012, '#dde2e2'], [0.1, EY - 0.008, '#dde2e2']])
      box(head, 0.024, 0.02, 0.004, c, x, y, EZ + 0.024);
    for (const sd of [-1, 1]) box(head, 0.014, 0.05, 0.13, '#555b60', sd * 0.126, EY + 0.002, 0.05);   /* the strap pieces */
  }
  else if (E === 'Round Glasses') { eye(-EX); eye(EX); for (const x of [-EX, EX]) { ring(head, 0.033, 0.007, '#e6dfcf', x, EY, EZ + 0.012); const l = add(head, new THREE.CylinderGeometry(0.03, 0.03, 0.003, 10), glass('#8a8a8a', 0.35), x, EY, EZ + 0.012); l.rotation.x = Math.PI / 2; }
      box(head, 0.04, 0.008, 0.008, '#e6dfcf', 0, EY + 0.012, EZ + 0.012); for (const sd of [-1, 1]) box(head, 0.008, 0.008, 0.12, '#e6dfcf', sd * 0.124, EY + 0.012, 0.05); }
    else if (E === 'Square Glasses') { eye(-EX, '#246a6a', '#b8ecf0'); eye(EX, '#246a6a', '#b8ecf0'); box(head, 0.30, 0.016, 0.014, K, 0, EY + 0.034, EZ + 0.012);
      for (const x of [-EX, EX]) { add(head, new THREE.BoxGeometry(0.066, 0.056, 0.004), glass('#a8d8a0', 0.5), x, EY, EZ + 0.012); box(head, 0.066, 0.008, 0.01, '#8cc48a', x, EY - 0.028, EZ + 0.012); box(head, 0.008, 0.056, 0.01, '#8cc48a', x - 0.033, EY, EZ + 0.012); box(head, 0.008, 0.056, 0.01, '#8cc48a', x + 0.033, EY, EZ + 0.012); } }
    else { eye(-EX); eye(EX); }
  
    /* head wear: y 0 = top of the head (0.11) */
    X.on && X.on('hat');
    const hat = grp(head, 0, 0.11, 0);
    let prop = null;
    const cap = (cc, brim) => { dome(hat, 0.128, cc, 0, -0.02, 0); const b = box(hat, 0.16, 0.012, 0.12, brim || cc, 0, -0.005, 0.15); b.rotation.x = 0.12; };
    switch (HEAD) {
      case 'Cowboy': { const b = cyl(hat, 0.21, 0.21, 0.014, '#5c2626', 0, 0.005, 0, 10); b.scale.z = 0.85;
        for (const sd of [-1, 1]) { const r = box(hat, 0.05, 0.04, 0.24, '#5c2626', sd * 0.19, 0.025, 0); r.rotation.z = sd * 0.6; }
        box(hat, 0.17, 0.1, 0.15, '#6a2c2c', 0, 0.06, 0); box(hat, 0.172, 0.022, 0.152, '#3a1414', 0, 0.025, 0); box(hat, 0.04, 0.02, 0.155, '#5c2626', 0, 0.11, 0); box(hat, 0.03, 0.03, 0.01, GOLD, 0, 0.07, 0.077, 0.3); break; }
      case 'Sombrero': cyl(hat, 0.3, 0.3, 0.014, '#d9b860', 0, 0.005, 0, 12); { const r = ring(hat, 0.29, 0.016, '#c9a24a', 0, 0.02, 0); r.rotation.x = Math.PI / 2; }
        cyl(hat, 0.05, 0.11, 0.17, '#d9b860', 0, 0.09, 0, 10); cyl(hat, 0.1, 0.106, 0.03, '#c8342e', 0, 0.035, 0, 10);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(hat, 0.03, 0.006, 0.03, i % 2 ? '#2f9a58' : '#c8342e', Math.cos(a) * 0.22, 0.014, Math.sin(a) * 0.22); } break;
      case 'Builder': dome(hat, 0.138, '#f08a1c', 0, -0.02, 0); cyl(hat, 0.16, 0.16, 0.012, '#d8740e', 0, -0.012, 0.01, 10); box(hat, 0.03, 0.03, 0.22, '#f8a848', 0, 0.11, 0); break;
      case 'Beanie': dome(hat, 0.13, '#1fa83a', 0, -0.02, 0).scale.y = 0.95; cyl(hat, 0.133, 0.133, 0.045, '#15802a', 0, -0.005, 0, 10); ball(hat, 0.035, '#f2efe8', 0, 0.115, 0, 1); break;
      case 'Snapback': cap('#2ec04a', '#2ec04a'); box(hat, 0.04, 0.03, 0.01, '#1c8a32', 0, 0.05, 0.12); break;
      case 'Painter': { const b = cyl(hat, 0.15, 0.13, 0.045, '#f4d75a', 0.01, 0.02, 0.02, 10); b.rotation.x = 0.15; box(hat, 0.14, 0.012, 0.05, '#e6c240', 0, 0.0, 0.14); box(hat, 0.012, 0.025, 0.012, '#e6c240', 0, 0.05, 0.02); break; }
      case 'Crown': { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8, 1, true), mat(GOLD, 0.25)); m.material.side = THREE.DoubleSide; m.position.y = 0.025; m.castShadow = true; hat.add(m);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cone(hat, 0.022, 0.05, GOLD, Math.sin(a) * 0.1, 0.075, Math.cos(a) * 0.1, 4, 0.25); }
        const gem = X.gems || ['#d4202a', '#2d5bd0', '#2fb860']; box(hat, 0.025, 0.025, 0.012, gem[0], 0, 0.025, 0.1, 0.4); box(hat, 0.02, 0.02, 0.012, gem[1], -0.05, 0.025, 0.088, 0.4); box(hat, 0.02, 0.02, 0.012, gem[2], 0.05, 0.025, 0.088, 0.4); break; }
      case 'Beret': { const b = cyl(hat, 0.15, 0.13, 0.035, '#2a2a2e', 0.03, 0.015, -0.01, 10); b.rotation.z = -0.25; box(hat, 0.012, 0.025, 0.012, '#1a1a1e', 0.04, 0.045, -0.01); box(hat, 0.02, 0.03, 0.01, GOLD, 0.05, 0.03, 0.13, 0.3); break; }
      case 'Bandana': dome(hat, 0.128, '#c92a2a', 0, -0.03, 0).scale.y = 0.75; box(hat, 0.05, 0.04, 0.04, '#a52020', 0, 0.0, -0.13); for (const sd of [-1, 1]) { const t = box(hat, 0.03, 0.09, 0.012, '#c92a2a', sd * 0.025, -0.05, -0.15); t.rotation.z = sd * 0.3; }
        for (let i = 0; i < 9; i++) if ((i + (i / 3 | 0)) % 2 === 0) box(hat, 0.018, 0.018, 0.01, '#f2efe8', -0.018 + (i % 3) * 0.018, 0.035 - (i / 3 | 0) * 0.018, 0.123); break;   /* the white checker patch on the front */
      case 'Wizard': cyl(hat, 0.19, 0.19, 0.012, '#c86a2c', 0, 0.004, 0, 12); cyl(hat, 0.065, 0.11, 0.18, '#c86a2c', 0, 0.095, 0, 9); cyl(hat, 0.108, 0.111, 0.025, '#7a3a14', 0, 0.02, 0, 9);
        { const tip = grp(hat, 0, 0.185, 0); tip.rotation.x = -0.55; cone(tip, 0.065, 0.16, '#c86a2c', 0, 0.08, 0, 9); }
        for (const [x, y, z] of [[0.05, 0.08, 0.085], [-0.06, 0.12, 0.05], [0.0, 0.16, 0.06], [-0.03, 0.05, 0.1]]) { const st = box(hat, 0.02, 0.02, 0.008, GOLD, x, y, z, 0.6); st.rotation.z = Math.PI / 4; } break;
      case 'Firefighter': dome(hat, 0.138, '#c1121f', 0, -0.02, 0); { const b = box(hat, 0.24, 0.012, 0.13, '#a50f1a', 0, -0.01, -0.13); b.rotation.x = -0.25; }
        box(hat, 0.022, 0.035, 0.26, '#a50f1a', 0, 0.115, 0); box(hat, 0.07, 0.08, 0.012, GOLD, 0, 0.07, 0.12, 0.3); break;
      case 'Top Hat': case 'Tophat': cyl(hat, 0.16, 0.16, 0.012, '#18171b', 0, 0.004, 0, 12); cyl(hat, 0.095, 0.09, 0.2, '#18171b', 0, 0.105, 0, 10); cyl(hat, 0.097, 0.096, 0.03, HEAD === 'Tophat' ? '#6b2fb3' : '#b3202a', 0, 0.03, 0, 10); break;
      case 'Pirate': dome(hat, 0.13, '#1b1a1e', 0, -0.02, 0); cyl(hat, 0.17, 0.17, 0.012, '#1b1a1e', 0, 0.0, 0, 12);
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, f = grp(hat, Math.sin(a) * 0.14, 0.035, Math.cos(a) * 0.14); f.rotation.y = a; f.rotation.x = -0.45; box(f, 0.24, 0.075, 0.012, '#1b1a1e', 0, 0, 0); box(f, 0.24, 0.01, 0.014, GOLD, 0, 0.04, 0); }
        box(hat, 0.04, 0.035, 0.01, '#f2efe8', 0, 0.06, 0.178); box(hat, 0.01, 0.01, 0.006, K, -0.009, 0.064, 0.184); box(hat, 0.01, 0.01, 0.006, K, 0.009, 0.064, 0.184); break;
      case 'Rasta': cyl(hat, 0.135, 0.132, 0.045, '#2f9a58', 0, 0.0, 0, 10); cyl(hat, 0.14, 0.135, 0.045, '#e8c23a', 0, 0.045, -0.01, 10); cyl(hat, 0.145, 0.14, 0.045, '#c8342e', 0, 0.09, -0.02, 10);
        dome(hat, 0.145, '#1b1a1e', 0, 0.112, -0.03).scale.y = 0.6; for (let i = 0; i < 5; i++) box(hat, 0.025, 0.12, 0.025, '#2a1d14', -0.08 + i * 0.04, -0.06, -0.12); break;
      case 'Bear': dome(hat, 0.14, '#62d25a', 0, -0.03, 0); for (const sd of [-1, 1]) { ball(hat, 0.045, '#62d25a', sd * 0.1, 0.09, -0.01, 1); ball(hat, 0.025, '#3fa83a', sd * 0.1, 0.09, 0.025, 1); } box(hat, 0.2, 0.03, 0.02, '#62d25a', 0, -0.015, 0.12); for (const sd of [-1, 1]) box(hat, 0.04, 0.12, 0.2, '#62d25a', sd * 0.13, -0.06, -0.01); break;
      case 'Chef': { /* a tall white chef's hat with grey pleats, leaning over, as the art draws it */
        cyl(hat, 0.124, 0.124, 0.05, '#f6f4ee', 0, 0.015, 0, 10); const p = grp(hat, -0.01, 0.04, 0); p.rotation.z = 0.28;
        box(p, 0.22, 0.1, 0.2, '#f6f4ee', 0, 0.05, 0); box(p, 0.25, 0.05, 0.22, '#f6f4ee', -0.012, 0.115, 0);
        for (const x of [0.02, 0.055, 0.09]) box(p, 0.012, 0.08, 0.205, '#b8b8bc', x, 0.05, 0); break; }
      case 'Gameday': dome(hat, 0.145, '#f6f4ee', 0, -0.04, 0); for (const sd of [-1, 1]) box(hat, 0.03, 0.12, 0.16, '#1e5bb8', sd * 0.135, -0.04, -0.01); box(hat, 0.03, 0.03, 0.27, '#d8342a', 0, 0.105, 0); box(hat, 0.2, 0.014, 0.06, '#d8342a', 0, -0.02, 0.15); break;
      case 'Jester': dome(hat, 0.13, '#7a2fb3', 0, -0.02, 0);
        for (const [a, jc] of [[-1, '#c8342e'], [0, '#2f9a58'], [1, '#e8c23a']]) { const p = grp(hat, a * 0.06, 0.08, a === 0 ? -0.04 : 0); p.rotation.z = -a * 0.9; p.rotation.x = a === 0 ? -0.8 : 0;
          cone(p, 0.045, 0.16, jc, 0, 0.08, 0, 6); ball(p, 0.022, GOLD, 0, 0.165, 0, 1, 0.3); } break;
      case 'Captain': cyl(hat, 0.122, 0.122, 0.045, '#18171b', 0, 0.015, 0, 10); { const t = cyl(hat, 0.16, 0.135, 0.05, '#f6f4ee', 0, 0.065, -0.01, 12); t.scale.z = 1.05; box(hat, 0.05, 0.04, 0.01, '#3ac8e0', 0, 0.065, 0.165); }
        { const b = box(hat, 0.16, 0.012, 0.08, '#18171b', 0, 0.0, 0.14); b.rotation.x = 0.25; } box(hat, 0.13, 0.008, 0.01, GOLD, 0, 0.022, 0.123, 0.3); box(hat, 0.04, 0.035, 0.01, GOLD, 0, 0.05, 0.13, 0.4); break;
      case 'Helmet': { const d = dome(hat, 0.17, '#1e1e22', 0, -0.06, -0.01); d.scale.set(1, 1.05, 1); for (const sd of [-1, 1]) box(hat, 0.03, 0.17, 0.22, '#1e1e22', sd * 0.14, -0.12, -0.02); box(hat, 0.2, 0.02, 0.03, '#2e2e34', 0, -0.035, 0.15); break; }
      case 'Birthday': { const p = grp(hat, 0.02, 0, 0); p.rotation.z = -0.15; const RB = ['#e8342a', '#f5a623', '#f5e04a', '#3fbf4a', '#2d8ae8']; for (let i = 0; i < 5; i++) cyl(p, 0.065 - (i + 1) * 0.0125, 0.065 - i * 0.0125, 0.036, RB[i], 0, 0.018 + i * 0.036, 0, 9);   /* rainbow-striped */
      for (let i = 0; i < 4; i++) box(p, 0.016, 0.016, 0.016, i % 2 ? K : '#f2efe8', (i % 2 - 0.5) * 0.016, 0.2 + (i / 2 | 0) * 0.016, 0); break; }
      case 'Helicopter': { const d = dome(hat, 0.13, '#2d5bd0', 0, -0.02, 0); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; box(hat, 0.02, 0.1, 0.09, ['#c8342e', '#f0c020', '#2f9a58', '#2d5bd0'][i], Math.sin(a) * 0.09, 0.03, Math.cos(a) * 0.09).rotation.y = a; }
        box(hat, 0.15, 0.01, 0.07, '#e8c23a', 0, -0.005, 0.14); cyl(hat, 0.008, 0.008, 0.06, K, 0, 0.13, 0); prop = grp(hat, 0, 0.16, 0); box(prop, 0.3, 0.008, 0.03, '#c8342e', 0, 0, 0); box(prop, 0.03, 0.008, 0.3, '#f0c020', 0, 0, 0); break; }
      case 'Afro': { /* the art's afro: a wide, low mound striped red, yellow, teal and blue, wider than the head */
        const RB = ['#e8342a', '#f5d23a', '#3ec8c0', '#2d6ae8', '#e8342a', '#f5d23a', '#3ec8c0'];
        for (let i = 0; i < 7; i++) { const r = 0.21 * Math.sqrt(1 - Math.pow(i / 7, 2)); cyl(hat, r - 0.004, r, 0.032, RB[i], 0, -0.04 + i * 0.03, -0.005, 12); }
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ball(hat, 0.045, RB[i % 4], Math.sin(a) * 0.19, 0.0 + (i % 2) * 0.03, Math.cos(a) * 0.19 - 0.005, 0); } break; }   /* the scalloped edge */
      case 'Dad Hat': cap('#d43a2a'); box(hat, 0.05, 0.025, 0.01, '#8a5a32', 0, 0.05, 0.12); break;
      case 'Army': { const d = dome(hat, 0.15, '#6a8a3a', 0, -0.03, 0); d.scale.y = 0.85; cyl(hat, 0.16, 0.16, 0.014, '#4f6a2a', 0, -0.025, 0, 12);   /* camouflage patches */
      for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, e2 = rnd() * 1.1, r = 0.152; box(hat, 0.045, 0.012, 0.045, i % 2 ? '#3f5524' : '#8fa65a', Math.sin(a) * Math.cos(e2) * r, -0.02 + Math.sin(e2) * r * 0.85, Math.cos(a) * Math.cos(e2) * r).lookAt(0, -0.02, 0); } break; }
      case 'Trucker': cap('#f08a1c', '#f08a1c'); box(hat, 0.17, 0.085, 0.02, '#f6f4ee', 0, 0.045, 0.108); break;
      case 'Bandit': dome(hat, 0.13, '#1b1a1e', 0, -0.03, 0).scale.y = 0.8; box(hat, 0.05, 0.04, 0.04, '#1b1a1e', 0, -0.0, -0.13); for (const sd of [-1, 1]) { const t = box(hat, 0.03, 0.09, 0.012, '#1b1a1e', sd * 0.025, -0.05, -0.15); t.rotation.z = sd * 0.3; }
        box(hat, 0.05, 0.04, 0.012, '#f2efe8', 0, 0.05, 0.1); box(hat, 0.012, 0.012, 0.006, K, -0.012, 0.055, 0.107); box(hat, 0.012, 0.012, 0.006, K, 0.012, 0.055, 0.107); for (const sd of [-1, 1]) { const x = box(hat, 0.07, 0.01, 0.006, '#f2efe8', 0, 0.02, 0.1); x.rotation.z = sd * 0.6; } break;
    }
  
    /* clothes on the trunk */
    X.on && X.on('clothes');
    const CL = A['Clothes'];
    function chain(nm) { const mc = nm[0] === 'G' ? GOLD : SILVER; for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2.4; ball(neck, 0.014, mc, Math.sin(a) * 0.1, -0.03 - Math.cos(a) * 0.02, 0.06 + Math.cos(a) * 0.06, 0, 0.3); }
      const med = cyl(neck, 0.03, 0.03, 0.01, mc, 0, -0.08, 0.13, 8, 0.4); med.rotation.x = Math.PI / 2 - 0.2; }
    const shell = (cc, len, y0) => rbox(trunk, 0.258, 0.232, len, [BR + 0.009, BR + 0.009, BR + 0.009, BR + 0.009], cc, 0, 0.04, 0.236 - len / 2);   /* clothes follow the rounded body */
    const hood = cc => { box(neck, 0.2, 0.1, 0.08, cc, 0, 0.1, -0.06); };
    switch (CL) {
      case 'Collar': box(neck, 0.172, 0.035, 0.132, '#f26b8a', 0, 0.02, 0.03); { const t = cyl(neck, 0.02, 0.02, 0.006, GOLD, 0, -0.01, 0.1, 8, 0.3); t.rotation.x = Math.PI / 2; } break;
      case 'Sport Hoodie': shell('#3ad0d8', 0.3); hood('#3ad0d8'); for (const sd of [-1, 1]) box(trunk, 0.006, 0.03, 0.3, '#1e2a30', sd * 0.13, 0.08, 0.086); box(trunk, 0.12, 0.05, 0.008, '#26a8b0', 0, -0.02, 0.24); break;
      case 'Scarf': box(neck, 0.176, 0.05, 0.14, '#2d5bd0', 0, 0.02, 0.03); box(neck, 0.178, 0.015, 0.142, '#1d3f9a', 0, 0.02, 0.03); box(neck, 0.05, 0.14, 0.016, '#2d5bd0', 0.05, -0.06, 0.1); box(neck, 0.052, 0.015, 0.018, '#1d3f9a', 0.05, -0.08, 0.1); break;
      case 'Shirt': shell('#f07aa0', 0.26); box(neck, 0.172, 0.03, 0.132, '#f2efe8', 0, 0.0, 0.03); break;
      case 'Classic Hoodie': shell('#f5d23a', 0.32); hood('#f5d23a'); for (let i = 0; i < 6; i++) rbox(trunk, 0.264, 0.03, 0.03, [0.008, 0.008, 0.008, 0.008], '#f06a9a', 0, -0.03 + (i % 3) * 0.07, 0.2 - Math.floor(i / 3) * 0.12); box(trunk, 0.006, 0.08, 0.006, '#f2efe8', -0.03, -0.01, 0.24); box(trunk, 0.006, 0.08, 0.006, '#f2efe8', 0.03, -0.01, 0.24); break;
      case 'Suspenders': shell('#c4b2ec', 0.3); for (let i = 0; i < 4; i++) box(trunk, 0.264, 0.236, 0.012, '#9a78d8', 0, 0.04, 0.2 - i * 0.07); for (const sd of [-1, 1]) { box(trunk, 0.025, 0.006, 0.47, '#5a3aa8', sd * 0.06, 0.153, 0); box(trunk, 0.025, 0.2, 0.006, '#5a3aa8', sd * 0.06, 0.05, 0.24); box(trunk, 0.016, 0.016, 0.008, GOLD, sd * 0.06, -0.03, 0.238); } break;
      case 'Tracksuit': shell('#1d2c6b', 0.4); for (const sd of [-1, 1]) { box(trunk, 0.006, 0.02, 0.4, '#f2efe8', sd * 0.13, 0.05, 0.036); box(trunk, 0.006, 0.02, 0.4, '#f2efe8', sd * 0.13, 0.08, 0.036); } box(trunk, 0.008, 0.2, 0.008, '#c9cdd3', 0, 0.04, 0.242); break;
      case 'Lumberjack': shell('#b22222', 0.34); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) { rbox(trunk, 0.264, 0.05, 0.05, [0.012, 0.012, 0.012, 0.012], '#1b1a1e', 0, -0.03 + j * 0.07, 0.2 - i * 0.08); } break;
      case 'Gold Chain': case 'Silver Chain': chain(CL); break;
      case 'Turtleneck': shell('#2c2c34', 0.3); box(neck, 0.18, 0.12, 0.14, '#2c2c34', 0, 0.03, 0.03); break;
      case 'Poncho': rbox(trunk, 0.32, 0.16, 0.34, [0.08, 0.08, 0.02, 0.02], '#e6c46a', 0, 0.09, 0.06); for (let i = 0; i < 3; i++) rbox(trunk, 0.324, 0.02, 0.344, [0.004, 0.004, 0.004, 0.004], ['#c8342e', '#e8c23a', '#2f9a58'][i], 0, 0.04 + i * 0.04, 0.06); for (let i = 0; i < 8; i++) box(trunk, 0.012, 0.03, 0.012, '#e8c23a', -0.15 + i * 0.043, -0.005, 0.23); break;
      case 'Suit': shell('#1b1b22', 0.34); box(trunk, 0.09, 0.16, 0.01, '#f2efe8', 0, 0.05, 0.24); box(trunk, 0.03, 0.12, 0.012, X.tie || '#b3202a', 0, 0.04, 0.244); for (const sd of [-1, 1]) { const l = box(trunk, 0.03, 0.12, 0.012, '#2a2a34', sd * 0.05, 0.08, 0.244); l.rotation.z = sd * 0.35; } break;
    }
  
    if (X.chain) { X.on && X.on('chain'); chain(X.chain); }   /* a chain worn over the clothes */

    /* in the mouth (front of the snout) */
    X.on && X.on('mouth');
    const MZ = 0.11 + snL, MO = A['Mouth'];
    if (MO === 'Ball') { ball(head, 0.045, '#e03a2a', 0, -0.09, MZ + 0.01, 1); box(head, 0.092, 0.014, 0.05, '#f5d23a', 0, -0.09, MZ + 0.01); }
    else if (MO === 'Bone') { const b = cyl(head, 0.014, 0.014, 0.2, '#e0342a', 0, -0.09, MZ - 0.02, 6); b.rotation.z = Math.PI / 2; for (const sd of [-1, 1]) for (const dz of [-0.016, 0.016]) ball(head, 0.022, '#e0342a', sd * 0.1, -0.09, MZ - 0.02 + dz, 0); }
    else if (MO === 'Chicken') { const g = grp(head, 0.03, -0.09, MZ); g.rotation.y = 0.9; ball(g, 0.045, '#b7712e', 0, 0, 0.03, 1).scale.set(1, 0.85, 1.3); cyl(g, 0.01, 0.01, 0.09, '#efe8d6', 0, 0, -0.06, 6).rotation.x = Math.PI / 2; ball(g, 0.016, '#efe8d6', 0, 0, -0.105, 0); }
    else if (MO === 'Steak') { const g = grp(head, 0.03, -0.09, MZ); g.rotation.y = 0.4; box(g, 0.12, 0.025, 0.07, '#d8505a', 0, 0, 0.02); box(g, 0.122, 0.027, 0.014, '#f6d6d0', 0, 0, 0.055); box(g, 0.012, 0.03, 0.05, '#f6efe0', 0.03, 0, 0.015); }
    else if (MO === 'Pizza') { const sh = new THREE.Shape(); sh.moveTo(-0.07, 0); sh.lineTo(0.07, 0); sh.lineTo(0, 0.15); sh.lineTo(-0.07, 0);
      const g = grp(head, 0, -0.095, MZ - 0.02); g.rotation.x = Math.PI / 2;
      add(g, new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }), '#f0c24a', 0, 0, 0); box(g, 0.15, 0.022, 0.02, '#c98a3a', 0, 0, 0.006);
      for (const [x, y] of [[-0.025, 0.03], [0.022, 0.05], [0, 0.09]]) cyl(g, 0.013, 0.013, 0.006, '#b3242a', x, y, -0.002).rotation.x = Math.PI / 2; }
  
    /* accessory */
    X.on && X.on('acc');
    const AC = A['Accessory'], top = (HEAD.indexOf('Ears') >= 0) ? 0.11 : 0.15;
    if (AC === 'Bow') { const g = grp(head, 0, top + 0.01, 0.02); for (const sd of [-1, 1]) cone(g, 0.035, 0.06, '#e0343a', sd * 0.032, 0, 0, 4).rotation.z = sd * Math.PI / 2; ball(g, 0.018, '#a8202a', 0, 0, 0, 0); }
    else if (AC === 'Mohawk') for (let i = 0; i < 5; i++) box(head, 0.03, 0.05 + (i === 1 || i === 2 ? 0.03 : 0), 0.035, i % 2 ? '#f5a623' : '#f5d23a', 0, top + 0.02 + (i === 1 || i === 2 ? 0.015 : 0), 0.08 - i * 0.045);
    else if (AC === 'Bone') { const g = grp(head, 0, top + 0.01, 0.0);   /* a big gold bone across the head, ear to ear */ cyl(g, 0.016, 0.016, 0.3, '#f5c542', 0, 0, 0, 6).rotation.z = Math.PI / 2; for (const sd of [-1, 1]) for (const dy of [-0.02, 0.02]) ball(g, 0.026, '#f5c542', sd * 0.15, dy, 0, 0); }
    else if (AC === 'Flower Headband' || AC === 'Gold Headband') { const hb = AC[0] === 'G' ? GOLD : '#3f8a3a', gl = AC[0] === 'G' ? 0.3 : 0;
      box(head, 0.25, 0.022, 0.012, hb, 0, 0.065, 0.114, gl); box(head, 0.25, 0.022, 0.012, hb, 0, 0.065, -0.114, gl); box(head, 0.012, 0.022, 0.24, hb, -0.124, 0.065, 0, gl); box(head, 0.012, 0.022, 0.24, hb, 0.124, 0.065, 0, gl);
      if (AC[0] === 'G') box(head, 0.03, 0.03, 0.012, '#d4202a', 0, 0.065, 0.12, 0.4);
      else for (const [x, fc] of [[-0.07, '#ee7fb5'], [0, '#f2efe8'], [0.07, '#f0cf3a']]) { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ball(head, 0.013, fc, x + Math.cos(a) * 0.016, 0.07 + Math.sin(a) * 0.016, 0.122, 0); } ball(head, 0.011, '#e8a020', x, 0.07, 0.126, 0); } }
  
    return { prop };
  }
  function buildDog(THREE, A, seed, look) {   /* look: 'dog' = the original Doginal Dog colours, 'add' = every colour inverted + mirrored, as the ADD inscriptions draw them */
    const { mat, add, box, cyl, cone, ball, dome, ring, rbox, grp, col, mix, shade, rnd } = kit(THREE, seed);
  
    /* original Doginal Dog fur colours (doggy.market trait names), measured from the inscriptions' pixels */
    const FUR = { White: '#ffffff', Black: '#262626', Gray: '#9b9b9b', Brown: '#8d6a49', Orange: '#ed9749', Yellow: '#ffd83d', Tan: '#e9be83',
      Green: '#00da3e', Beige: '#d3bb8f', Purple: '#9948f3', Blue: '#00acc6', Pink: '#fa48a5', Silver: '#b3b3b3', Diamond: '#72f7ff', Bronze: '#ff9b60', 'Rose Gold': '#f0b6b0', Gold: '#fde358' };
    /* the shiny coats' checker uses each metal's own dark and light pixels */
    const METAL = { Silver: ['#7f7f7f', '#c5c5c5'], Diamond: ['#4fbcc2', '#b2fcff'], Bronze: ['#bf6846', '#fbb997'], 'Rose Gold': ['#b48583', '#f7d4d1'], Gold: ['#ffc34c', '#fff1a4'] };
    const K = '#262626', W = '#ffffff', TANM = '#e9be83', TAND = '#a3845c', CHEST = '#b2b2b2', SABLE = '#c8743c', NOSE = '#151316', GOLD = '#e3b53a', SILVER = '#c9cdd3';
    const c = FUR[A['Fur Color']] || '#9b9b9b', D = shade(c, 0.55), pat = A['Fur Pattern'];
    const lum = h => { const q = col(h); return 0.3 * q.r + 0.59 * q.g + 0.11 * q.b; }, dark = lum(c) < 0.25, white = lum(c) > 0.9;
    const pick = a => a[Math.floor(rnd() * a.length)];
  
    /* regions a coat pattern can recolour, as the pixel portraits paint them */
    const R = { main: c, belly: c, chest: shade(c, 0.8), muzzle: c, face: null, crown: null, saddle: null, ears: c, earL: null, earR: null, legs: c, paws: c, tail: c, tip: null, brow: null, ruff: null };
    const SP = [];      /* spots: [colour, size, 'body' | 'head'] */
    const EP = [];      /* patches round an eye: [x, colour] */
    const SIDE = [];    /* shoulder patches: [side, colour] */
    let stripes = null, split = null, zombie = false, shiny = false, curl = false, shortSnout = false;
    switch (pat) {
      case 'Classic': {   /* the muzzle colour the pixel art pairs with each fur; the bright furs carry it on the ears too */
        const acc = { Yellow: '#9948f3', Green: '#ffd83d', Purple: '#ffd83d', Pink: '#a0ff91', Blue: '#b0ffff' }[A['Fur Color']];
        if (dark) Object.assign(R, { muzzle: TANM, chest: TAND, brow: TANM, paws: TANM });
        else if (acc) Object.assign(R, { muzzle: acc, ears: acc, chest: shade(c, 0.8) });
        else Object.assign(R, { muzzle: W, chest: CHEST }); break; }
      case 'Solid': break;
      case 'Tiger': stripes = D; break;
      case 'Spotted': { const sc = A._accent || (white ? pick(['#8d6a49', '#5a5a5a', SABLE]) : dark ? TANM : D); if (white) R.muzzle = TANM; for (let i = 0; i < 14; i++) SP.push([sc, 0.025 + rnd() * 0.02, i < 4 ? 'head' : 'body']); break; }
      case 'Dalmatian': { const sc = A._accent || pick(['#ffd83d', '#00da3e', K, '#8d6a49', '#fa48a5', '#00acc6']); R.chest = CHEST; for (let i = 0; i < 22; i++) SP.push([A._accent || (white ? sc : (dark ? W : K)), 0.025 + rnd() * 0.02, i < 6 ? 'head' : 'body']); break; }
      case 'Husky': Object.assign(R, { main: W, belly: W, chest: CHEST, muzzle: W, legs: W, paws: W, face: W, saddle: c, crown: c, ears: c, tail: c, tip: W }); break;
      case 'Zombie': zombie = true; { const z = A['Fur Color'] === 'Green' ? '#56803e' : mix(c, '#6f6f78', 0.3), zd = shade(z, 0.7);   /* the dog's own colour gone dull, darker patches, red wounds */
        Object.assign(R, { main: z, belly: z, chest: zd, muzzle: z, legs: z, paws: zd, ears: z, earR: '#e04a55', tail: z }); for (let i = 0; i < 10; i++) SP.push([i % 3 ? zd : '#e04a55', 0.05 + rnd() * 0.035, i < 3 ? 'head' : 'body']); SIDE.push([-1, '#e04a55']); } break;
      case 'Blotted': { const bc = A._accent || pick([K, SABLE]); EP.push([rnd() < 0.5 ? -0.055 : 0.055, bc]); R[rnd() < 0.5 ? 'earL' : 'earR'] = bc; SIDE.push([rnd() < 0.5 ? -1 : 1, bc]); R.chest = CHEST; break; }
      case 'Collie': { const pc = A._accent || (white ? SABLE : c); Object.assign(R, { main: W, belly: W, chest: CHEST, muzzle: W, legs: W, paws: W, ears: pc, tail: pc, tip: W }); EP.push([-0.055, pc], [0.055, pc]); SIDE.push([-1, pc], [1, pc]); break; }
      case 'Shiny': shiny = true; break;
      case 'Split': split = 'left'; Object.assign(R, { muzzle: TANM, chest: shade(c, 0.8), earL: K }); break;
      case 'Bernard': Object.assign(R, { main: W, belly: W, chest: CHEST, muzzle: W, legs: W, paws: W, earL: SABLE, earR: '#3a3a3a', tail: SABLE, tip: W }); EP.push([-0.055, '#3a3a3a'], [0.055, '#3a3a3a']); SIDE.push([-1, SABLE], [1, '#3a3a3a']); break;
      case 'Grey': Object.assign(R, { muzzle: TANM, chest: TAND }); break;
      case 'Sheppard': Object.assign(R, { saddle: K, muzzle: K, ears: K, tail: K, chest: shade(c, 0.8) }); break;
      case 'Shiba': curl = true; Object.assign(R, { muzzle: W, chest: W, belly: W, paws: W, brow: W, tip: W }); break;
      case 'Pug': shortSnout = true; Object.assign(R, { muzzle: '#5a5a5a', ears: '#5a5a5a' }); break;
      case 'Boxer': Object.assign(R, { muzzle: K, chest: W, paws: W }); break;
    }
    /* colours read from the dog's own picture, by place (A._reg: head, crown, each ear, round each eye, lower face, chest,
       body, a body patch): the markings land on the side the art has them, not where a pattern rule guesses */
    const REG = A._reg || null, HM = (REG && REG.head) || null;
    if (REG) {
      EP.length = 0; SIDE.length = 0; R.earL = R.earR = null;
      if (REG.body) Object.assign(R, { main: REG.body, legs: REG.body, tail: REG.body, belly: REG.body });
      if (REG.chest) R.chest = REG.chest;
      if (REG.muzzle) R.muzzle = REG.muzzle;
      if (REG.crown && REG.crown !== HM) R.crown = REG.crown; else R.crown = null;
      if (REG.earL) R.earL = REG.earL; if (REG.earR) R.earR = REG.earR;
      if (REG.eyeL && REG.eyeL !== HM) EP.push([-0.055, REG.eyeL]); if (REG.eyeR && REG.eyeR !== HM) EP.push([0.055, REG.eyeR]);
      if (REG.patch) SIDE.push([-1, REG.patch]);
      R.face = null; R.saddle = R.saddle && REG.body ? null : R.saddle;
    }
    const metal = shiny ? 0.18 : 0;
  
    const root = new THREE.Group(), body = grp(root), trunk = grp(body);
    const hipY = 0.22; body.position.y = hipY;   /* a stocky dog: short legs under the big head */
    /* trunk: 0.24 wide, 0.22 tall (y -0.07..0.15), 0.46 long (z -0.23..0.23); -x is the viewer's left */
    const BR = 0.05;   /* the body's rounded long edges; the flat of each side is y 0..0.10, the flat of the top x -0.07..0.07 */
    if (split) { rbox(trunk, 0.12, 0.22, 0.46, [BR, 0, 0, BR], K, -0.06, 0.04, 0); rbox(trunk, 0.12, 0.22, 0.46, [0, BR, BR, 0], R.main, 0.06, 0.04, 0); }
    else rbox(trunk, 0.24, 0.22, 0.46, [BR, BR, BR, BR], R.main, 0, 0.04, 0, metal);
    if (R.belly !== R.main) rbox(trunk, 0.246, 0.06, 0.38, [0, 0, BR + 0.003, BR + 0.003], R.belly, 0, -0.043, 0);
    if (R.chest !== R.main) box(trunk, 0.17, 0.15, 0.02, R.chest, 0, 0.02, 0.226);
    if (R.saddle) rbox(trunk, 0.252, 0.1, 0.4, [BR + 0.006, BR + 0.006, 0, 0], R.saddle, 0, 0.105, -0.02);
    if (stripes) for (let i = 0; i < 6; i++) { const w = 0.02 + rnd() * 0.02, h = 0.12 + rnd() * 0.07; rbox(trunk, 0.252, h, w, [BR + 0.006, BR + 0.006, 0, 0], stripes, 0, 0.156 - h / 2, -0.19 + i * 0.075); }
    for (const [sd, pc] of SIDE) box(trunk, 0.006, 0.095, 0.13, pc, sd * 0.122, 0.05, 0.13);
    if (shiny) {   /* the shiny coats are a sparkle checker of lighter and darker squares */
      const [dk, lt] = METAL[A['Fur Color']] || [shade(c, 0.75), mix(c, '#ffffff', 0.55)];
      for (let i = 0; i < 40; i++) { const sd = rnd() < 0.5 ? -1 : 1, top = rnd() < 0.3, sz = 0.03, cc = rnd() < 0.5 ? lt : dk;
        if (top) box(trunk, sz, 0.006, sz, cc, (rnd() - 0.5) * 0.11, 0.152, (rnd() - 0.5) * 0.42, metal);
        else box(trunk, 0.006, sz, sz, cc, sd * 0.122, 0.015 + rnd() * 0.07, (rnd() - 0.5) * 0.42, metal); } }   /* on the flats, clear of the rounded edges */
    for (const [sc, sz, where] of SP) if (where === 'body') {   /* a spot sits on the top or one side */
      const side = rnd() < 0.3 ? 0 : (rnd() < 0.5 ? -1 : 1), z = (rnd() - 0.5) * 0.4;
      if (side === 0) box(trunk, sz, 0.008, sz, sc, (rnd() - 0.5) * Math.max(0, 0.14 - sz), 0.152, z);
      else box(trunk, 0.008, sz, sz, sc, side * 0.122, 0.05 + (rnd() - 0.5) * Math.max(0, 0.1 - sz), z);
    }
    /* a dog's shape along its length: deep chest, tucked waist, rounded ends; every coat piece on the trunk bends with it */
    const shapeAt = t => { const g = (m, w) => Math.exp(-(((t - m) / w) ** 2));
      return { sx: 0.9 - 0.07 * g(0.4, 0.2) + 0.1 * g(0.8, 0.18), tuck: 0.045 * g(0.35, 0.24) + 0.012 * (1 - t), end: 1 - 0.14 * (g(0, 0.06) + g(1, 0.06)), up: 0.012 * g(0.8, 0.2) }; };
    const bend = () => { for (const m of trunk.children) { if (!m.isMesh || m.userData.bent) continue; m.userData.bent = true; const P = m.geometry.attributes.position, o = m.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i) + o.x, y = P.getY(i) + o.y, z = P.getZ(i) + o.z, t = Math.min(1, Math.max(0, (z + 0.23) / 0.46)), F = shapeAt(t), cy = 0.04;
        let nx = x * F.sx * F.end, ny = cy + (y - cy) * F.end + F.up; if (y < cy) ny += F.tuck * (cy - y) / 0.11;
        P.setXYZ(i, nx - o.x, ny - o.y, z - o.z); }
      P.needsUpdate = true; m.geometry.computeVertexNormals(); } };
    if (zombie) { box(trunk, 0.006, 0.006, 0.12, K, 0.122, 0.09, 0.02); for (let i = 0; i < 4; i++) box(trunk, 0.008, 0.02, 0.006, K, 0.122, 0.09, -0.03 + i * 0.03); box(trunk, 0.008, 0.04, 0.04, '#ff8a8a', -0.123, 0.04, 0.09); }
  
    bend();
    /* neck + head */
    const neck = grp(trunk, 0, 0.1, 0.2);
    box(neck, 0.16, 0.14, 0.12, R.ruff || R.main, 0, 0.05, 0.03);
    if (R.ruff) box(neck, 0.26, 0.12, 0.08, R.ruff, 0, 0.01, 0.02);
    const HS = 1.38 * 0.6;   /* 2026-10-18: the head 40% smaller (it hid the collar, scarf and chains); the pivot below follows it */
    const head = grp(neck, 0, 0.12 + 0.06 * HS / 1.38, 0.03 + 0.04 * HS / 1.38); head.scale.setScalar(HS);   /* seated on the neck: the pivot comes down with the size */
    if (split) { box(head, 0.12, 0.22, 0.22, K, -0.06, 0, 0); box(head, 0.12, 0.22, 0.22, R.main, 0.06, 0, 0); }
    else box(head, 0.24, 0.22, 0.22, HM || R.main, 0, 0, 0, metal);
    if (R.face) box(head, 0.2, 0.12, 0.012, R.face, 0, -0.03, 0.111);
    if (R.crown) box(head, 0.246, 0.06, 0.226, R.crown, 0, 0.083, 0);
    if (pat === 'Husky') box(head, 0.04, 0.12, 0.014, c, 0, 0.05, 0.112);
    for (const [x, pc] of EP) box(head, 0.075, 0.065, 0.004, pc, x, 0.035, 0.1115);
    if (R.brow) { box(head, 0.035, 0.016, 0.01, R.brow, -0.055, 0.06, 0.112); box(head, 0.035, 0.016, 0.01, R.brow, 0.055, 0.06, 0.112); }
    if (stripes) { for (let i = -1; i <= 1; i++) box(head, 0.02, 0.05, 0.01, stripes, i * 0.04, 0.08, 0.112); for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) box(head, 0.006, 0.02, 0.06, stripes, sd * 0.122, 0.04 - i * 0.05, -0.02); }
    if (shiny) { const [dk, lt] = METAL[A['Fur Color']] || [shade(c, 0.75), mix(c, '#ffffff', 0.55)]; for (let i = 0; i < 14; i++) { const sd = rnd() < 0.5 ? -1 : 1; box(head, 0.006, 0.026, 0.026, rnd() < 0.5 ? lt : dk, sd * 0.122, (rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.18, metal); } }
    for (const [sc, sz, where] of SP) if (where === 'head') { const sd = rnd() < 0.5 ? -1 : 1; if (rnd() < 0.5) box(head, sz, 0.008, sz, sc, (rnd() - 0.5) * 0.18, 0.112, (rnd() - 0.5) * 0.18); else box(head, 0.008, sz, sz, sc, sd * 0.122, (rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.16); }
    const snL = shortSnout ? 0.045 : 0.075;   /* the portraits' muzzle is short and wide */
    if (R.muzzle !== R.main) box(head, 0.22, 0.075, 0.006, R.muzzle, 0, -0.07, 0.1115);   /* the lower face in the muzzle colour */
    box(head, 0.15, 0.09, snL, R.muzzle, 0, -0.06, 0.11 + snL / 2);
    if (split) box(head, 0.066, 0.102, snL + 0.002, TANM, 0.032, -0.055, 0.11 + snL / 2);
    box(head, 0.06, 0.045, 0.03, NOSE, 0, -0.02, 0.11 + snL);
    box(head, 0.09, 0.01, 0.01, shade(R.muzzle, 0.5), 0, -0.085, 0.112 + snL);
    if (shortSnout) for (let i = 0; i < 2; i++) box(head, 0.12, 0.008, 0.01, shade(c, 0.6), 0, 0.075 + i * 0.022, 0.112);
  
    /* ears */
    const HEAD = A['Head'], earsKind = HEAD === 'Big Ears' ? 'big' : HEAD === 'Small Ears' ? 'small' : 'floppy';
    const ears = [];
    for (const sd of [-1, 1]) {
      const e = grp(head, sd * 0.115, 0.095, -0.03); ears.push(e);
      const ec = (sd < 0 ? R.earL : R.earR) || R.ears;
      if (earsKind === 'floppy') { const m = box(e, 0.08, 0.075, 0.05, ec, sd * 0.03, 0.02, 0); e.rotation.z = -sd * 0.45; if (zombie && sd > 0) m.scale.y = 0.7; }   /* rounded ears at the head's top corners, folded out */
      else if (earsKind === 'small') { const m = cone(e, 0.04, 0.07, ec, -sd * 0.03, 0.04, 0, 4); m.rotation.y = Math.PI / 4; }
      else { const m = cone(e, 0.065, 0.16, ec, -sd * 0.02, 0.08, 0, 4); m.rotation.y = Math.PI / 4; e.rotation.z = -sd * 0.18;
        const inn = cone(e, 0.04, 0.1, mix(ec, '#e9a3a8', 0.5), -sd * 0.02, 0.07, 0.022, 4); inn.rotation.y = Math.PI / 4; }
    }
  
    const { prop } = dress({ THREE, mat, head, neck, trunk, A, R, HEAD, BR, snL, rnd, add, box, cyl, cone, ball, dome, ring, rbox, grp, mix, shade });
    const CL = A['Clothes'];
    /* legs + tail */
    const legs = [];
    const joint = hipY - 0.04, shinH = joint - 0.03;
    for (const [x, z] of [[-0.08, 0.16], [0.08, 0.16], [-0.08, -0.16], [0.08, -0.16]]) {
      const g = grp(trunk, x, -0.04, z); legs.push(g);
      box(g, 0.07, shinH, 0.07, split && x < 0 ? K : R.legs, 0, -shinH / 2, 0);
      box(g, 0.08, 0.03, 0.09, R.paws, 0, -joint + 0.015, 0.012);
      if (CL === 'Tracksuit' && z > 0) box(g, 0.08, 0.08, 0.08, '#1d2c6b', 0, -0.04, 0);
    }
    const tail = grp(trunk, 0, 0.11, -0.23), tailUp = grp(tail); tailUp.rotation.x = curl ? -2.0 : -0.75;
    box(tailUp, 0.05, 0.05, 0.16, R.tail, 0, 0, -0.08);
    if (R.tip) box(tailUp, 0.054, 0.054, 0.05, R.tip, 0, 0, -0.15);
  
    root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    if (look === 'add') {   /* the ADD html: imgElement.style.filter = invert(100%), transform = scaleX(-1) */
      /* invert in sRGB: three r152+ keeps colours linear inside, and the pixels the ADD inverts are sRGB */
      const CS = THREE.SRGBColorSpace, inv = c => { if (CS) { const o = {}; c.getRGB(o, CS); c.setRGB(1 - o.r, 1 - o.g, 1 - o.b, CS); } else c.setRGB(1 - c.r, 1 - c.g, 1 - c.b); }, done = new Set();
      root.traverse(m => { if (m.isMesh && !m.userData.noInvert && !done.has(m.material)) { done.add(m.material); inv(m.material.color); if (m.material.emissive && m.material.emissive.getHex() !== 0) inv(m.material.emissive); } });
      root.scale.x = -1;
    }
  
    /* poses: idle (stand, breathe, wag, look round), walk (diagonal leg pairs), sit (hind legs folded) */
    let pose = 'idle', w = 0, gal = 0, ph = 0, ly = 0, sn = 0, happy = 0;   /* w: 0 stand -> 1 sit, ly: lying down, sn: nose to the ground, eased */
    const lerp = (a, b, f) => a + (b - a) * f;
    bend();   /* the clothes and anything else put on the trunk after the coat bend too */
    return {
      root, height: 0.56,
      setPose(p) { pose = p; },
      setHappy(sec) { happy = Math.max(happy, sec); },   /* being petted: a fast, wide wag and ears back */
      update(dt, t, v) {   /* v: ground speed in m/s; the feet are driven by distance covered, so they never skate */
        v = v || 0;
        w = lerp(w, pose === 'sit' ? 1 : 0, Math.min(1, dt * 6)); ly = lerp(ly, pose === 'lie' ? 1 : 0, Math.min(1, dt * 4)); sn = lerp(sn, pose === 'sniff' ? 1 : 0, Math.min(1, dt * 4)); happy = Math.max(0, happy - dt);
        gal = lerp(gal, pose === 'run' ? 1 : 0, Math.min(1, dt * 5));
        const moving = pose === 'walk' || pose === 'run';
        if (moving) ph += dt * Math.max(v, 0.35) * Math.PI * 2 / (0.4 + 0.5 * gal);   /* stride: a trot ~0.4 m, a gallop ~0.9 m */
        const s0 = moving ? Math.sin(ph) : 0, sH = moving ? Math.sin(ph + Math.PI) : 0, amp = 0.5 + 0.45 * gal;
        /* trot: diagonal pairs (front-left with back-right); gallop: the fronts reach nearly together, the hinds drive together half a stride later */
        const tr = [s0, -s0, -s0, s0];
        const ga = [s0, moving ? Math.sin(ph - 0.4) : 0, sH, moving ? Math.sin(ph + Math.PI - 0.4) : 0];
        const L = tr.map((x, k) => (x * (1 - gal) + ga[k] * gal) * amp);
        const rock = moving ? Math.sin(ph + Math.PI / 2) : 0;
        trunk.rotation.x = -0.5 * w + 0.16 * rock * gal;
        body.position.y = hipY - 0.05 * w - (hipY - 0.07) * ly + (moving ? Math.abs(s0) * 0.012 * (1 - gal) + Math.max(0, rock) * 0.045 * gal : Math.sin(t * 2.2) * 0.003);
        trunk.position.z = -0.06 * w;
        legs[0].rotation.x = 0.5 * w - 1.35 * ly + L[0]; legs[1].rotation.x = 0.5 * w - 1.35 * ly + L[1];   /* lying: front paws stretched out ahead */
        legs[2].rotation.x = -1.25 * w + 1.3 * ly + L[2]; legs[3].rotation.x = -1.25 * w + 1.3 * ly + L[3];   /* ...hind legs folded back */
        legs[2].position.y = legs[3].position.y = -0.04 + 0.03 * w;
        neck.rotation.x = 0.45 * w + 0.15 * ly + 0.75 * sn + (moving ? Math.sin(ph * 2) * 0.04 * (1 - gal) : 0) + gal * (0.22 - 0.1 * rock);   /* galloping: head low and forward */
        neck.rotation.y = moving ? 0 : sn > 0.5 ? Math.sin(t * 2.3) * 0.4 : Math.sin(t * 0.7) * 0.35 * (1 - 0.5 * w);   /* sniffing: the nose sweeps the ground */
        head.rotation.z = moving ? 0 : Math.sin(t * 0.45 + 1) * 0.12;
        tail.rotation.y = happy > 0 ? Math.sin(t * 22) * 0.9 : Math.sin(t * (moving ? 12 : 8)) * (w > 0.5 ? 0.6 : 0.45) * (1 - 0.8 * gal) * (1 - 0.6 * ly);
        tail.rotation.x = 0.9 * w + 0.55 * gal;   /* streams out behind at a run */
        for (const [i, e] of ears.entries()) e.rotation.x = Math.sin(t * 3 + i) * 0.05 + (moving ? Math.sin(ph * 2) * 0.08 * (1 - gal) : 0) - 0.55 * gal - (happy > 0 ? 0.5 : 0);
        if (prop) prop.rotation.y = t * 14;
      }
    };
  }

  /* ---------- the frog (2026-10-19): a Doginal Frog, the Pepe of the inscriptions, in the dog's idiom. The body and how it
     moves are its own (it sits like a frog, hops, leaps at a run, flicks its tongue); everything it wears is the dog's own parts
     (dress), each recoloured to the frog trait's colour, measured from the frogs' pixels. ---------- */
  const FROG_BODY = { Pepe: ['#789038', '#687830'], 'Zombie Pepe': ['#708838', '#607828'], 'Orange Pepe': ['#c86000', '#b04800'], 'Yellow Pepe': ['#e0b058', '#c09048'],
    'Brown Pepe': ['#602810', '#501808'], 'White Pepe': ['#f8f0f0', '#d0c0c8'], 'Blue Pepe': ['#001890', '#001078'], 'Zombie Pepe (Yellow)': ['#e8b858', '#d0a848'],
    'Light Blue Pepe': ['#70d0e8', '#68a8c0'], 'Gold Pepe': ['#f0d850', '#f0b848'], 'Rose Gold Pepe': ['#f0b0b0', '#b08080'], 'Purple Pepe': ['#9800b8', '#800098'],
    'Black Pepe': ['#282028', '#201018'], 'Pink Pepe': ['#f8a0c8', '#d880a0'], 'Red Pepe': ['#e00000', '#c00000'], 'Silver Pepe': ['#b0b0b0', '#787878'],
    'Bronze Pepe': ['#f09058', '#b86038'], 'Zombie Pepe (Purple)': ['#9800c0', '#8800a8'], 'Diamond Pepe': ['#70e8f0', '#50b0b8'] };
  const FROG_METAL = { 'Gold Pepe': ['#f0b848', '#f8e098'], 'Silver Pepe': ['#787878', '#e0e0e0'], 'Bronze Pepe': ['#b86038', '#f0c8b8'], 'Rose Gold Pepe': ['#b08080', '#f8d0d0'], 'Diamond Pepe': ['#50b0b8', '#c0f0f0'] };
  /* a frog trait -> the dog part that draws it, and the colour it is recoloured to (null: the dog part's own colours) */
  const FROG_HEAD = { Beanie: 'Beanie', Beret: 'Beret', Builder: 'Builder', Cap: 'Dad Hat', Convict: 'Dad Hat', Filfy: 'Bear', Painter: 'Painter', Raider: 'Bandana',
    Sherrif: 'Cowboy', Snapback: 'Snapback', 'Trucker Hat': 'Trucker', Wizzie: 'Wizard', 'Top Hat': 'Top Hat', Firefighter: 'Firefighter', Sombrero: 'Sombrero',
    Pirate: 'Pirate', Rasta: 'Rasta', Chef: 'Chef', Gameday: 'Gameday', Jester: 'Jester', Sailor: 'Captain', Spinner: 'Helicopter', Party: 'Birthday', Clown: 'Afro', Crown: 'Crown' };
  const FROG_TINT = {
    'Beanie (Green)': '#00a000', 'Beanie (Orange)': '#c06000', 'Beanie (Pink)': '#e05078', 'Beanie (Purple)': '#b840c8', 'Beanie (Red)': '#d80000', 'Beanie (Yellow)': '#f0f000',
    'Beret (Black)': '#303030', 'Beret (Blue)': '#1840b8', 'Beret (Green)': '#507820', 'Beret (Red)': '#c02818',
    'Bow (Blue)': '#8ee8f0', 'Bow (Green)': '#a0f890', 'Bow (Pink)': '#e87098', 'Bow (Yellow)': '#f8e050',
    'Builder (Orange)': '#f88818', 'Builder (Yellow)': '#f8d800', 'Cap (Green)': '#20d028', Convict: '#e87020',
    'Filfy (Blue)': '#40c8d0', 'Filfy (Brown)': '#a85030', 'Filfy (Green)': '#58e058', 'Filfy (Pink)': '#e06890', 'Filfy (Yellow)': '#f8d838',
    'Painter (Black)': '#202020', 'Painter (Blue)': '#48d0d8', 'Painter (Pink)': '#e87098', 'Painter (Yellow)': '#f8e050', 'Painter(Black)': '#60f060',   /* the collection's "Painter(Black)" is a green cap */
    Raider: '#202020', 'Raider (Blue)': '#1840b8', 'Raider (Green)': '#38f800', 'Raider (Orange)': '#f89010', 'Raider (Pink)': '#c82870', 'Raider (Purple)': '#9800c8', 'Raider (Red)': '#c02818',
    'Sherrif (Black)': '#303030', 'Sherrif (Blue)': '#185880', 'Sherrif (Green)': '#606020', 'Sherrif (Grey)': '#c8c8c8', 'Sherrif (Red)': '#782030',
    'Snapback (Blue)': '#00a0b0', 'Snapback (Green)': '#20d028', 'Snapback (Orange)': '#f8a828', 'Snapback (Pink)': '#b02890', 'Snapback (Purple)': '#7018b8', 'Snapback (Red)': '#c02818', 'Snapback (Yellow)': '#f0d018',
    'Trucker Hat (Green)': '#20d028', 'Trucker Hat (Pink)': '#f840a0', 'Trucker Hat (Purple)': '#7018b8', 'Trucker Hat (Red)': '#c02818', 'Trucker Hat (Yellow)': '#e8c800',
    'Wizzie (Black)': '#2c3c34', 'Wizzie (Blue)': '#0000a0', 'Wizzie (Brown)': '#702810', 'Wizzie (Green)': '#98c040', 'Wizzie (Orange)': '#d87038', 'Wizzie (Pink)': '#c858b0',
    'Wizzie (Purple)': '#7850c8', 'Wizzie (Red)': '#b80018', 'Wizzie (White)': '#d0d8d8', 'Wizzie (Yellow)': '#f0e830',
    'Glasses (Pink)': '#f8b0c8', 'Glasses (Blue)': '#40b8f0',
    'Lumberjack (Black)': '#303030', 'Lumberjack (Blue)': '#0098a0', 'Lumberjack (Green)': '#60a038', 'Lumberjack (Grey)': '#c0c0c0', 'Lumberjack (Purple)': '#a04870', 'Lumberjack (Red)': '#a81818', 'Lumberjack (Yellow)': '#a08828',
    'Suspenders (Black)': '#909090', 'Suspenders (Blue)': '#98c0d8', 'Suspenders (Green)': '#b0d8a0', 'Suspenders (Pink)': '#e0a0c8', 'Suspenders (Purple)': '#b8a8e0', 'Suspenders (White)': '#e8e8e8',
    'Shirt (Black)': '#181818', 'Shirt (Blue)': '#48d0d8', 'Shirt (Green)': '#60f060', 'Shirt (Pink)': '#e87098', 'Shirt (Purple)': '#a870e0', 'Shirt (White)': '#f8f8f8', 'Shirt (Yellow)': '#e8e050',
    'Classic Hoodie (Aqua)': '#007070', 'Classic Hoodie (Blue)': '#283888', 'Classic Hoodie (Green)': '#308028', 'Classic Hoodie (Purple)': '#803880', 'Classic Hoodie(Red)': '#782820',
    'Hoodie (Black)': '#282828', 'Hoodie (White)': '#f8f8f8',
    'Sport Hoodie (Blue)': '#00a0e0', 'Sport Hoodie (Green)': '#60f060', 'Sport Hoodie (Pink)': '#e87098', 'Sport Hoodie (Purple)': '#282070', 'Sport Hoodie (Yellow)': '#e8e050',
    'Turtleneck (Black)': '#303030', 'Turtleneck (Grey)': '#c8c8c8', 'Turtleneck (Red)': '#904040',
    'Scarf (Black)': '#202020', 'Scarf (Blue)': '#1860a8', 'Scarf (Green)': '#00a038', 'Scarf (Red)': '#c02818', 'Scarf (White)': '#e8e8e8', 'Scarf (Yellow)': '#f8c048',
    'Collar (Black)': '#303030', 'Collar (Blue)': '#3078c0', 'Collar (Brown)': '#703830', 'Collar (Green)': '#409040', 'Collar (Pink)': '#f888a8', 'Collar (Yellow)': '#f8d800' };
  const FROG_CLOTHES = { Lumberjack: 'Lumberjack', Suspenders: 'Suspenders', Shirt: 'Shirt', 'Classic Hoodie': 'Classic Hoodie', Hoodie: 'Classic Hoodie', 'Sport Hoodie': 'Sport Hoodie',
    CEO: 'Suit', Turtleneck: 'Turtleneck', Scarf: 'Scarf', Collar: 'Collar', Convict: 'Tracksuit' };
  const FROG_VISOR = { Blue: '#00a8f8', Bronze: '#c8704c', Gold: '#c8b048', Green: '#00e000', 'Night Vision': '#20a820', Pink: '#f800c0', Red: '#f80000', Yellow: '#f8d800' };
  const FROG_TIE = { Blue: '#0078f8', Green: '#38f800', Orange: '#f89010', Pink: '#d02870', Purple: '#9800c8', Red: '#f80040', Yellow: '#f8d000' };
  const FROG_GEMS = { Blue: '#2d5bd0', Green: '#2fb860', Pink: '#f070b0', Purple: '#9b30d8' };
  const FROG_SIZE = 0.6;   /* a frog beside the dog (0.56 m at the ears): about a third of its height */
  const frogBase = v => { const m = /^(.*?)\s*\((.*)\)$/.exec(String(v || '')); return m ? [m[1].trim(), m[2].trim()] : [String(v || 'None'), '']; };
  /* the frog's traits in the dog parts' words: { D: what dress draws, X: the frog's extras, tint: section -> colour } */
  function frogWear(A) {
    const D = { Head: 'None', Eyes: 'None', Clothes: 'None', Mouth: A.Mouth === 'Pizza' ? 'Pizza' : 'None', Accessory: 'None' }, X = {}, tint = {};
    const [hb, hc] = frogBase(A.Head);
    if (hb === 'Bow') { D.Accessory = 'Bow'; tint.acc = FROG_TINT[A.Head]; }
    else if (FROG_HEAD[hb]) { D.Head = FROG_HEAD[hb]; tint.hat = FROG_TINT[A.Head] || null; if (hb === 'Crown' && FROG_GEMS[hc]) X.gems = [FROG_GEMS[hc], FROG_GEMS[hc], FROG_GEMS[hc]]; }
    const [eb, ec] = frogBase(A.Eyes);
    if (eb === 'Visor') { D.Eyes = 'Visor'; if (ec === 'Rainbow') X.rainbow = ['#f80000', '#f8a000', '#f8f000', '#00e000', '#00a0f8', '#a000f8']; else D._visor = FROG_VISOR[ec] || '#00e000'; }
    else if (eb === 'Anon Visor') { D.Eyes = 'Visor'; D._visor = '#a000d0'; }
    else if (eb === 'Dark Anon Visor') { D.Eyes = 'Visor'; D._visor = '#4a0070'; }
    else if (eb === 'Sun Glasses' || eb === 'Convict') D.Eyes = 'Sunglasses';
    else if (eb === 'Glasses') { D.Eyes = 'Round Glasses'; tint.eyes = FROG_TINT[A.Eyes]; }
    else if (eb === 'Eye Patch') D.Eyes = 'Eyepatch';
    else if (eb === 'Monocle') D.Eyes = 'Monocle';
    const [cb, cc] = frogBase(A.Clothes);
    const cbase = cb.replace(/\(.*$/, '').trim();   /* "Classic Hoodie(Red)" has no space */
    if (FROG_CLOTHES[cbase]) { D.Clothes = FROG_CLOTHES[cbase]; tint.clothes = cbase === 'Convict' ? '#e87020' : cbase === 'CEO' ? null : FROG_TINT[A.Clothes] || null; if (cbase === 'CEO') X.tie = FROG_TIE[cc] || '#b3202a'; }
    if (A.Accessory === 'Gold Chain' || A.Accessory === 'Silver Chain') X.chain = A.Accessory;
    return { D, X, tint };
  }
  /* recolour the meshes one part made: those of its main colour's hue (or, a grey part, its greys) take the new colour at the same
     relative lightness; gold trims (they glow), whites, blacks and other colours stay */
  function recolour(THREE, mat, meshes, to) {
    if (!to || !meshes.length) return;
    const CS = THREE.SRGBColorSpace, hsl = c => { const o = {}; c.getHSL(o, CS); const r = {}; c.getRGB(r, CS); o.ch = Math.max(r.r, r.g, r.b) - Math.min(r.r, r.g, r.b); return o; }, w = new Map();   /* as the eye sees it (sRGB), chroma for 'coloured' */
    for (const m of meshes) { if (!m.material || !m.material.color || (m.material.emissive && m.material.emissive.getHex())) continue; const h = '#' + m.material.color.getHexString();
      const p = m.geometry && m.geometry.attributes.position; w.set(h, (w.get(h) || 0) + (p ? p.count : 1)); }
    let main = null, best = -1;   /* its colour: the most-used coloured one; a part all in greys takes its most-used grey */
    for (const grey of [false, true]) { for (const [h, n] of w) { const q = hsl(new THREE.Color(h)); if (q.l > 0.9 || q.l < 0.06 || (q.ch < 0.15) !== grey) continue; if (n > best) { best = n; main = h; } } if (main) break; }
    if (!main) return;
    const M = hsl(new THREE.Color(main)), T = hsl(new THREE.Color(to)), grey = M.ch < 0.15;
    for (const m of meshes) { if (!m.material || !m.material.color || (m.material.emissive && m.material.emissive.getHex())) continue;
      const q = hsl(m.material.color); let dh = Math.abs(q.h - M.h); dh = Math.min(dh, 1 - dh);
      const same = grey ? q.ch < 0.15 && Math.abs(q.l - M.l) < 0.25 : q.ch >= 0.15 && dh < 0.06 && q.l > 0.06 && q.l < 0.9;
      if (!same) continue;
      const c = new THREE.Color(); c.setHSL(T.h, T.s, Math.max(0, Math.min(1, T.l * (q.l / Math.max(0.01, M.l)))), CS);
      m.material = mat('#' + c.getHexString(CS)); }
  }
  function buildFrog(THREE, A, seed) {
    const made = [], { mat, add, box, cyl, cone, ball, dome, ring, rbox, grp, col, mix, shade, rnd } = kit(THREE, seed, made);
    const [c, D] = FROG_BODY[A.Body] || FROG_BODY.Pepe, metal = FROG_METAL[A.Body] ? 0.18 : 0, zombie = /^Zombie/.test(A.Body || '');
    const K = '#262626', LIP = /^(Pepe|Zombie Pepe)$/.test(A.Body) ? '#d05050' : '#c03048', LIPD = shade(LIP, 0.7), W = { D: null };
    const root = new THREE.Group(), body = grp(root), tilt = grp(body), trunk = grp(tilt);   /* tilt turns; trunk only squashes (a turn under a squash shears: the operator saw the head morph) */
    const hipY = 0.1; body.position.y = hipY;
    /* trunk: the dog's frame (0.24 x 0.22 x 0.46 along z, rounded) made squat and wide, pear-shaped (wide haunches, narrow
       shoulders), tipped nose-up as a frog sits; the dog's clothes fit it as they fit the dog */
    const BR = 0.06;
    trunk.scale.set(1.38, 0.82, 0.55); trunk.position.set(0, 0.02, 0);
    rbox(trunk, 0.24, 0.22, 0.46, [BR, BR, BR, BR], c, 0, 0.04, 0, metal);
    rbox(trunk, 0.246, 0.07, 0.4, [0, 0, BR + 0.003, BR + 0.003], D, 0, -0.04, 0);   /* a darker underside */
    if (metal) { const [dk, lt] = FROG_METAL[A.Body]; for (let i = 0; i < 34; i++) { const sd = rnd() < 0.5 ? -1 : 1, top = rnd() < 0.3, cc = rnd() < 0.5 ? lt : dk;
      if (top) box(trunk, 0.03, 0.006, 0.03, cc, (rnd() - 0.5) * 0.11, 0.152, (rnd() - 0.5) * 0.4, metal); else box(trunk, 0.006, 0.03, 0.03, cc, sd * 0.122, 0.015 + rnd() * 0.07, (rnd() - 0.5) * 0.4, metal); } }
    if (zombie) for (let i = 0; i < 7; i++) { const sd = rnd() < 0.5 ? -1 : 1; box(trunk, 0.007, 0.03 + rnd() * 0.03, 0.03 + rnd() * 0.04, i % 3 ? shade(c, 0.75) : '#d83038', sd * 0.123, 0.02 + rnd() * 0.07, (rnd() - 0.5) * 0.38); }
    const shapeAt = t => ({ sx: 1.08 - 0.22 * t, end: 1 - 0.18 * (Math.exp(-((t / 0.08) ** 2)) + Math.exp(-(((t - 1) / 0.08) ** 2))) });
    const bend = () => { for (const m of trunk.children) { if (!m.isMesh || m.userData.bent) continue; m.userData.bent = true; const P = m.geometry.attributes.position, o = m.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i) + o.x, y = P.getY(i) + o.y, z = P.getZ(i) + o.z, t = Math.min(1, Math.max(0, (z + 0.23) / 0.46)), F = shapeAt(t), cy = 0.04;
        P.setXYZ(i, x * F.sx * F.end - o.x, cy + (y - cy) * F.end - o.y, z - o.z); }
      P.needsUpdate = true; m.geometry.computeVertexNormals(); } };
    bend();
    /* neck + the big Pepe head: the dog's head frame (front z 0.11, top y 0.11) stretched wide, so its hats and eyewear fit */
    const neck = grp(tilt, 0, 0.02 + 0.1 * 0.82, 0.2 * 0.55); neck.scale.set(1.3, 1, 0.8);   /* its own scale sits under its own turn: no shear */
    box(neck, 0.16, 0.14, 0.12, c, 0, 0.05, 0.03);
    const head = grp(neck, 0, 0.1, 0.04); head.scale.set(1.24 * 1.2 / 1.3, 0.95, 0.95 / 0.8);   /* the dog head's frame, wide (the neck's scale undone) */
    rbox(head, 0.24, 0.22, 0.22, [0.05, 0.05, 0.03, 0.03], c, 0, 0, 0, metal);
    box(head, 0.236, 0.04, 0.2, D, 0, -0.09, -0.005);                                     /* the jaw's shade */
    if (metal) { const [dk, lt] = FROG_METAL[A.Body]; for (let i = 0; i < 12; i++) { const sd = rnd() < 0.5 ? -1 : 1; box(head, 0.006, 0.024, 0.024, rnd() < 0.5 ? lt : dk, sd * 0.122, (rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.16, metal); } }
    /* the mouth: Pepe's long red lips across the front, the upper lip lighter, a pink cheek at the viewer's left */
    const snL = 0.035;
    rbox(head, 0.226, 0.08, snL, [0.015, 0.015, 0.02, 0.02], c, 0, -0.058, 0.11 + snL / 2, metal);
    box(head, 0.214, 0.02, 0.008, LIP, 0, -0.05, 0.11 + snL + 0.002);
    box(head, 0.19, 0.016, 0.008, LIPD, 0, -0.068, 0.11 + snL + 0.002);
    for (const sd of [-1, 1]) box(head, 0.008, 0.02, snL * 0.8, LIP, sd * 0.11, -0.053, 0.11 + snL * 0.55);   /* the lips wrap the corners */
    box(head, 0.03, 0.024, 0.006, mix(LIP, '#ffffff', 0.15), -0.085, -0.02, 0.113);                        /* the cheek */
    const throat = box(head, 0.16, 0.03, 0.12, shade(c, 0.9), 0, -0.11, 0.02);
    const tongue = box(head, 0.03, 0.012, 0.1, '#f06a8a', 0, -0.062, 0.11 + snL + 0.05); tongue.scale.z = 0.01; tongue.visible = false;
    if (zombie) { box(head, 0.006, 0.06, 0.07, '#d83038', -0.123, 0.03, 0.02); box(head, 0.006, 0.03, 0.03, '#f09898', -0.124, 0.02, 0.01); box(head, 0.05, 0.006, 0.04, '#d83038', -0.05, 0.112, -0.03); }
    /* the eye bumps on top (under a hat, the hat stands in for them) */
    const wear = frogWear(A);
    if (wear.D.Head === 'None') for (const sd of [-1, 1]) { dome(head, 0.058, c, sd * 0.062, 0.098, 0.035, metal).scale.set(1, 0.8, 0.9); }
    /* the eyes as the frogs' pixels draw them: white, then the black pupil, a heavy lid over the top half */
    const lids = [];
    const eye = (x, iris, white) => { const P = 0.024, EY = 0.03, EZ = 0.112;
      box(head, P, 0.026, 0.008, white || '#ffffff', x - P / 2, EY, EZ); box(head, P, 0.026, 0.008, iris && iris !== K ? iris : '#101010', x + P / 2, EY, EZ);
      const lid = box(head, 0.056, 0.016, 0.012, D, x, EY + 0.016, EZ + 0.002); lids.push(lid); };
    /* dress: the dog's parts, each recoloured to the frog trait's colour */
    const marks = []; let cur = null;
    const X = Object.assign({ THREE, mat, head, neck, trunk, A: Object.assign({}, wear.D), R: { main: c, face: null, brow: null }, HEAD: wear.D.Head, BR, snL, rnd, add, box, cyl, cone, ball, dome, ring, rbox, grp, mix, shade,
      eye, noBrow: true, on: s => { cur = { s, from: made.length }; marks.push(cur); } }, wear.X);
    const { prop } = dress(X);
    marks.forEach((m, i) => { m.to = i + 1 < marks.length ? marks[i + 1].from : made.length; });
    for (const m of marks) if (wear.tint[m.s]) recolour(THREE, mat, made.slice(m.from, m.to), wear.tint[m.s]);
    if (A.Accessory === 'CRIME') {   /* the one CRIME tag: a sign hung round the neck */
      for (const sd of [-1, 1]) { const s = box(neck, 0.006, 0.12, 0.006, K, sd * 0.05, -0.03, 0.12); s.rotation.z = -sd * 0.35; }
      const sign = box(neck, 0.16, 0.07, 0.012, '#f0d858', 0, -0.1, 0.14);
      if (typeof document !== 'undefined') { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 56; const g = cv.getContext('2d'); g.fillStyle = '#f0d858'; g.fillRect(0, 0, 128, 56);
        g.fillStyle = '#c82020'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CRIME', 64, 30);
        const t = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; add(neck, new THREE.PlaneGeometry(0.15, 0.062), new THREE.MeshLambertMaterial({ map: t }), 0, -0.1, 0.1465); } }
    /* legs: thin front legs straight down, webbed feet; big hind legs folded at the sides (hip -> knee forward, shin back, foot forward) */
    const toes = (p, cc, len) => { for (const a of [-0.45, 0, 0.45]) { const g = grp(p, 0, 0, 0); g.rotation.y = a; box(g, 0.018, 0.012, len, cc, 0, 0, len / 2); ball(g, 0.012, cc, 0, 0.002, len, 0); } };
    const fronts = [], hinds = [];
    for (const sd of [-1, 1]) {
      const f = grp(body, sd * 0.1, 0.0, 0.1); fronts.push(f);
      box(f, 0.032, 0.1, 0.032, c, 0, -0.05, 0); const fp = grp(f, 0, -0.098, 0.005); fp.rotation.y = sd * 0.5; toes(fp, D, 0.04); f.userData.fp = fp;
      const hip = grp(body, sd * 0.175, 0.02, -0.08); hinds.push(hip);
      rbox(hip, 0.08, 0.1, 0.2, [0.035, 0.035, 0.035, 0.035], c, 0, 0, 0.09, metal);   /* the big thigh along the side */
      const knee = grp(hip, 0, -0.01, 0.18); box(knee, 0.05, 0.05, 0.16, D, 0, 0, -0.075);
      const ankle = grp(knee, 0, 0, -0.15); box(ankle, 0.045, 0.016, 0.08, D, 0, 0, 0.035); const tp = grp(ankle, 0, 0, 0.07); toes(tp, D, 0.055);
      Object.assign(hip.userData, { knee, ankle });
    }
    root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    root.scale.setScalar(FROG_SIZE);   /* the operator: "frogs are smaller than dogs" */
    /* 2026-10-19: "make sure his legs are not going through the floor". Each frame, after the pose is made, the lowest
       corner of every part (in the frog's own frame, y 0 = the ground) is put on the ground; a hop's arc and a petted bounce
       are added after, so nothing ever goes below it. Corners: each part's bounding box, read once. */
    const CORN = [], inv = new THREE.Matrix4(), mm = new THREE.Matrix4(), cv = new THREE.Vector3();
    root.traverse(m => { if (!m.isMesh || m === tongue) return; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      const pts = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z)); CORN.push([m, pts]); });
    const plant = () => {
      root.updateMatrixWorld(true); inv.copy(root.matrixWorld).invert(); let lo = Infinity;
      for (const [m, pts] of CORN) { if (!m.visible) continue; mm.multiplyMatrices(inv, m.matrixWorld); for (const p of pts) { const y = cv.copy(p).applyMatrix4(mm).y; if (y < lo) lo = y; } }
      if (lo !== Infinity) body.position.y -= lo;
    };
    /* poses: idle (sit up, breathe through the throat, blink, look round), walk (short hops), run (long leaps), sit (settled
       low), lie (flat, legs out), sniff (head down, the tongue flicks) */
    let hold = null;   /* the Lily Run poses a hop itself: {u: 0..1 through one hop, big} */
    let pose = 'idle', ph = 0, gal = 0, mv = 0, w = 0, ly = 0, sn = 0, happy = 0, blink = 2 + rnd() * 3, tng = 0;
    const lerp = (a, b, f) => a + (b - a) * f;
    const FOLD = [0.35, -0.95, 0.6], STRETCH = [2.75, -2.95, 3.2], LIE = [0.1, -0.05, 0.0, 0, 0];   /* LIE (a frog at rest, the operator: not sprawled): hip x, knee, ankle - folded tight - hip roll, hip turn */   /* hip, knee, ankle: crouched -> kicked out behind */
    bend();
    return {
      root, height: 0.42 * FROG_SIZE,
      setPose(p) { pose = p; },
      setHappy(sec) { happy = Math.max(happy, sec); },
      _phase(p) { ph = p; },   /* tests and the preview: a hop frozen at a point */
      hopAt(u, big) { hold = u == null ? null : { u: Math.max(0, Math.min(1, u)), big: !!big }; },   /* a mini game drives one hop (u null: back to its own motion) */
      update(dt, t, v) {
        v = v || 0;
        w = lerp(w, pose === 'sit' ? 1 : 0, Math.min(1, dt * 6)); ly = lerp(ly, pose === 'lie' ? 1 : 0, Math.min(1, dt * 4)); sn = lerp(sn, pose === 'sniff' ? 1 : 0, Math.min(1, dt * 4)); happy = Math.max(0, happy - dt);
        gal = lerp(gal, pose === 'run' ? 1 : 0, Math.min(1, dt * 5));
        const moving = pose === 'walk' || pose === 'run';
        /* HOP (walking) and LEAP (running) are two moves (2026-10-19: "hopping and leaping look too similar"):
           hop  - one per avatar step (0.75 m), low, the legs only half out, the body stays sitting up, a beat on the ground between hops;
           leap - one per running stride (1.93 m), high, the body stretched flat, the legs straight out behind, the arms reaching to land */
        /* smooth (the operator: "so it doesn't look like the frog is just glitching"): every part follows one continuous cycle - the tilt, the arms
           and the head swing on c (-1 at take-off, +1 at landing, back to -1 by the next take-off, flat at both turns), the legs kick on a
           smooth bump that is back to 0 before landing - and mv fades the whole move in and out, so starting and stopping never jump */
        if (hold) { pose = hold.big ? 'run' : 'walk'; mv = 1; gal = hold.big ? 1 : 0; }
        mv = hold ? 1 : lerp(mv, moving ? 1 : 0, Math.min(1, dt * 5));
        const hop = lerp(0.75, 1.93, gal), airF = 0.66;   /* in step with its owner (the operator): a hop per avatar step walking (1.5 m a stride / 2), a leap per running stride (3.33 m/s x 0.58 s) - distance-driven like the avatar's own cycle, so they stay in time at any speed */   /* one air share for both: a share that moved with the blend flipped a frog between ground and air mid-switch */   
        if (hold) ph = Math.floor(ph) + hold.u * 0.66; else if (mv > 0.01) ph += dt * Math.max(v, 0.35, moving ? 0 : 0.8) / hop;   /* stopping: the hop under way finishes as the move fades */
        const s = ph % 1, air = s < airF, u = air ? s / airF : 0, gr = air ? 0 : (s - airF) / (1 - airF);
        const c = air ? -Math.cos(Math.PI * u) : Math.cos(Math.PI * gr);
        const kick = (air ? Math.pow(Math.sin(Math.PI * Math.min(1, u / 0.85)), 2) : 0) * mv;   /* legs shoot out at take-off, tucked again before landing */
        const bounce = happy > 0 ? Math.abs(Math.sin(t * 11)) * 0.05 : 0;
        const H = lerp(0.07, 0.36, gal) * (air ? Math.sin(Math.PI * u) : 0) * mv;   /* the arc */
        body.position.y = hipY; const lift = H + bounce;   /* the height is set by plant() once the pose is made: the lowest point on the ground, then the hop's arc on top */
        body.rotation.x = lerp(0.07, 0.3, gal) * c * mv;                   /* nose up leaving, nose down landing */
        const flat = kick * gal;                                            /* only a leap stretches the body out */
        /* lying down (the operator: "he should just look like a frog who is resting on the ground"): the sitting fold laid level - thigh
           forward, shin back, foot forward, folded tight at the knee, the hips as far out as sitting (the operator: "the same distance out from the center, just bent more"), the head level, the front legs out in front with the hands flat, eyes open */
        tilt.rotation.x = -0.32 * (1 - flat) * (1 - ly) + 0.1 * w + 0.05 * ly + 0.2 * sn;   /* a frog sits nose-up */
        neck.rotation.x = 0.22 - 0.05 * w - 0.27 * ly + 0.45 * sn + 0.12 * gal * c * mv;
        neck.rotation.y = Math.sin(t * 0.6) * 0.3 * (1 - ly) * (1 - mv);
        for (const [i, hip] of hinds.entries()) {
          const sd = i ? 1 : -1, e = kick * lerp(0.45, 1, gal), { knee, ankle } = hip.userData;
          hip.rotation.x = lerp(lerp(FOLD[0], STRETCH[0], e), LIE[0], ly); knee.rotation.x = lerp(lerp(FOLD[1], STRETCH[1], e) + 0.2 * w, LIE[1], ly); ankle.rotation.x = lerp(lerp(FOLD[2], STRETCH[2], e), LIE[2], ly);
          hip.rotation.z = -sd * lerp(0.15, LIE[3], ly); hip.rotation.y = sd * lerp(0.12, LIE[4], ly); hip.position.y = 0.02 - 0.04 * ly;   /* lying: the hips stay as far out as sitting (the operator), only the legs fold tighter */
        }
        for (const [i, f] of fronts.entries()) { const sd = i ? 1 : -1;
          const fx = -0.05 + 0.1 * w + mv * (-0.3 * gal - lerp(0.2, 0.95, gal) * c);   /* a hop: the hands barely leave the ground; a leap: arms back, then reaching out to land */
          f.rotation.x = lerp(fx, -0.55, ly); f.rotation.z = -sd * lerp(0.08, 0.12, ly); f.userData.fp.rotation.x = 0.55 * ly; }   /* lying: still joined at the shoulder (the operator: they came apart), reaching forward and down to flat hands */   /* lying: arms forward, the hands flat on the ground in front of the chest (the operator: front legs visible) */
        throat.scale.y = 1 + Math.max(0, Math.sin(t * 3.1)) * 0.9 * (1 - mv);   /* breathing through the throat */
        blink -= dt; const shut = blink < 0.12; if (blink < 0) blink = 2.5 + Math.random() * 4;
        const doze = shut ? 1 : 0;   /* the operator: resting, the eyes stay open (it still blinks) */
        for (const l of lids) { l.scale.y = 1 + doze; l.position.y = 0.03 + lerp(0.016, 0.003, doze); }
        tng = (sn > 0.5 || happy > 0) ? (tng + dt) % 1.4 : 0;            /* sniffing (or petted): the tongue flicks out and back */
        const tz = tng > 0 && tng < 0.25 ? Math.sin(Math.PI * tng / 0.25) : 0; tongue.visible = tz > 0.02; tongue.scale.z = Math.max(0.01, tz * (happy > 0 ? 0.8 : 1.4)); tongue.position.z = 0.11 + snL + 0.05 * tongue.scale.z;
        plant(); body.position.y += lift;
        if (prop) prop.rotation.y = t * 14;
      }
    };
  }

  const ADD_NAMES = {"Background":{"Purple":"Green","Pink":"Cyan","Aqua":"Fuchsia","Tan":"Blue","Green":"Magenta","Blue":"Yellow","Rose":"Cyan","Yellow":"Blue","Red":"Cyan"},"Fur Color":{"Black":"White","Brown":"Cyan","White":"Black","Yellow":"Blue","Beige":"Navy","Orange":"Blue","Gray":"Gray","Purple":"Green","Pink":"Cyan","Diamond":"Black","Tan":"Blue","Green":"Magenta","Bronze":"Cyan","Blue":"Yellow","Rose Gold":"Cyan","Silver":"Black","Gold":"Blue"},"Fur Pattern":{"Spotted":"Spotted","Husky":"Husky","Classic":"Classic","Tiger":"Tiger","Split":"Split","Zombie":"Zombie","Dalmatian":"Dalmatian","Solid":"Solid","Shiny":"Shiny","Collie":"Collie","Blotted":"Blotted","Bernard":"Bernard","Grey":"Grey","Pug":"Pug","Boxer":"Boxer","Shiba":"Shiba","Sheppard":"Sheppard"},"Head":{"Snapback":"Snapback","Small Ears":"Small Ears","Floppy Ears":"Floppy Ears","Big Ears":"Big Ears","Jester":"Jester","Builder":"Builder","Painter":"Painter","Beanie":"Beanie","Bandit":"Bandit","Bear":"Bear","Pirate":"Pirate","Cowboy":"Cowboy","Wizard":"Wizard","Afro":"Afro","Gameday":"Gameday","Sombrero":"Sombrero","Helmet":"Helmet","Top Hat":"Top Hat","Bandana":"Bandana","Dad Hat":"Dad Hat","Chef":"Chef","Birthday":"Birthday","Rasta":"Rasta","Beret":"Beret","Helicopter":"Helicopter","Captain":"Captain","Crown":"Crown","Firefighter":"Firefighter","Trucker":"Trucker","Army":"Army","Tophat":"Tophat"},"Clothes":{"None":"None","Collar":"Collar","Turtleneck":"Turtleneck","Sport Hoodie":"Sport Hoodie","Suit":"Suit","Classic Hoodie":"Classic Hoodie","Shirt":"Shirt","Scarf":"Scarf","Tracksuit":"Tracksuit","Lumberjack":"Lumberjack","Suspenders":"Suspenders","Gold Chain":"Gold Chain","Silver Chain":"Silver Chain","Poncho":"Poncho"},"Mouth":{"None":"None","Bone":"Bone","Ball":"Ball","Chicken":"Chicken","Steak":"Steak","Pizza":"Pizza"},"Eyes":{"Black":"Black","Square Glasses":"Square Glasses","Red":"Red","Sleepy":"Sleepy","Green":"Green","Pink":"Pink","Mixed":"Mixed","Round Glasses":"Round Glasses","Blue":"Blue","Visor":"Visor","Monocle":"Monocle","Yellow":"Yellow","Eyepatch":"Eyepatch","Sunglasses":"Sunglasses"},"Accessory":{"None":"None","Bow":"Bow","Mohawk":"Mohawk","Bone":"Bone","Gold Headband":"Gold Headband","Flower Headband":"Flower Headband"}};   /* ADD renamed the colours (an original Black dog is an ADD 'White'): what its inspect window says */
  /* ---------- the pet controller ---------- */
  const KINDS = { dd: 'Doginal Dog', add: 'Anti Doginal Dog', frog: 'Doginal Frog' };
  const MAXN = { dd: 10000, add: 10000, frog: 10069 };   /* the frogs: 10,000 + the Cult of 69 */
  const COLL = { dd: 'Doginal Dogs', add: 'Doginal Dogs', frog: 'Doginal Frogs' };   /* the collection the arcade must name for the piece the pet is read from (an ADD draws its Doginal Dog) */
  const AL = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  /* ---------- reading a dog from the chain (2026-10-18: "we only need each of the traits and marking once") ----------
     Nothing per dog is stored here. A dog is read when it is needed: its traits from the arcade's collection registry
     (/r/collection-item/doge/<inscription>), its markings from its own picture (/content/<id>: 1000 px, a 25x25 grid of 40 px
     squares, one template for all 10,000 portraits). An ADD's HTML names its base Doginal Dog (<input id="txid">). */
  const KEYS = ['Background', 'Fur Color', 'Fur Pattern', 'Head', 'Clothes', 'Mouth', 'Eyes', 'Accessory'];
  const FROG_KEYS = ['Body', 'Head', 'Eyes', 'Mouth', 'Clothes', 'Accessory', 'Background', 'Special'];
  const keysOf = k => k === 'frog' ? FROG_KEYS : KEYS;
  const ID_RE = /^[0-9a-f]{64}i\d+$/;
  const valid = d => !!d && typeof d === 'object' && Object.prototype.hasOwnProperty.call(KINDS, d.k) && Number.isInteger(d.n) && d.n >= 1 && d.n <= MAXN[d.k] && ID_RE.test(String(d.i || ''));
  const FUR_RGB = { White: [255, 255, 255], Black: [33, 33, 33], Gray: [155, 155, 155], Brown: [141, 106, 73], Orange: [237, 151, 73], Yellow: [255, 216, 61], Tan: [233, 190, 131], Green: [0, 218, 62], Beige: [211, 187, 143], Purple: [153, 72, 243], Blue: [0, 172, 198], Pink: [250, 72, 165] };
  const LENS = { '#ff00bf': [255, 0, 191], '#ff0000': [255, 0, 0], '#00ffff': [0, 255, 255], '#00e000': [0, 224, 0], '#ffde00': [255, 222, 0], '#00a2ff': [0, 162, 255] };
  const hexOf = p => '#' + p.map(v => v.toString(16).padStart(2, '0')).join('');
  const near = (a, b, lim) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < lim;
  /* the colours by place, the spot colour and the visor colour, read from the 25x25 pixels (an array of [r,g,b]) */
  function readMarks(px, A) {
    const at = (x, y) => px[y * 25 + x], bg = at(0, 0), BK = [0, 0, 0], key = p => p.join(',');
    const EYE = new Set(['11,13', '12,13', '15,13', '16,13', '11,12', '12,12', '15,12', '16,12']);
    const win = (x0, y0, x1, y1, skip) => { const o = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!skip || !skip.has(x + ',' + y)) o.push(at(x, y)); return o; };
    const tally = (pts, bad) => { const c = new Map(); for (const p of pts) { if (bad(p)) continue; const k = key(p); c.set(k, (c.get(k) || [p, 0])); c.get(k)[1]++; } return [...c.values()].sort((a, b) => b[1] - a[1]); };
    const plain = p => key(p) === key(bg) || key(p) === key(BK);
    const top = (pts, bad) => { const t = tally(pts, bad || plain); return t.length ? hexOf(t[0][0]) : null; };
    const R = {};
    R.head = top(win(9, 10, 15, 10).concat(win(13, 11, 14, 13), win(8, 14, 17, 14)));
    R.crown = top(win(9, 10, 15, 10));
    if (/Ears$/.test(A.Head)) {
      const W2 = { 'Floppy Ears': [[6, 9, 9, 11], [16, 9, 18, 11]], 'Big Ears': [[8, 7, 9, 9], [15, 7, 16, 9]], 'Small Ears': [[9, 7, 9, 8], [15, 7, 15, 8]] }[A.Head];
      if (W2) { R.earL = top(win(...W2[0])); R.earR = top(win(...W2[1])); }
    }
    if (['Black', 'Blue', 'Green', 'Red', 'Pink', 'Yellow', 'Mixed', 'Sleepy'].includes(A.Eyes)) for (const [k, w] of [['eyeL', [9, 11, 13, 14]], ['eyeR', [14, 11, 17, 14]]]) {
      const t = tally(win(...w, EYE), p => plain(p) || hexOf(p) === R.head); R[k] = t.length && t[0][1] >= 3 ? hexOf(t[0][0]) : R.head;   /* a patch: another colour filling 3+ pixels round the eye */
    }
    if (A.Mouth === 'None') R.muzzle = top(win(8, 15, 17, 17, new Set(['14,15', '15,15'])));
    if (A.Clothes === 'None') {
      R.chest = top(win(10, 19, 14, 22));
      const t = tally(win(5, 19, 9, 24), plain); if (t.length) { R.body = hexOf(t[0][0]); if (t[1] && t[1][1] >= 3) R.patch = hexOf(t[1][0]); }
    }
    for (const k in R) if (!R[k]) delete R[k];
    const out = { _reg: R }, fur = FUR_RGB[A['Fur Color']];
    if (['Dalmatian', 'Spotted', 'Blotted', 'Collie'].includes(A['Fur Pattern'])) {   /* the spot / patch colour */
      const skip = new Set(['0,0,0', '255,255,255', '178,178,178', '33,33,33', '58,58,58']), pts = [];
      for (let y = 5; y < 25; y++) for (let x = 4; x < 22; x++) pts.push(at(x, y));
      const t = tally(pts, p => skip.has(key(p)) || near(p, bg, 60) || (fur && near(p, fur, 60))); if (t.length) out._accent = hexOf(t[0][0]);
    }
    if (A.Eyes === 'Visor') {   /* the lens colour, snapped to the six the collection uses */
      const t = tally(win(5, 9, 19, 14), p => Math.max(...p) - Math.min(...p) < 40 || near(p, bg, 70) || (fur && near(p, fur, 70)));
      if (t.length) { const c = t[0][0]; let best = null, bd = 1e9; for (const [h, v] of Object.entries(LENS)) { const d = Math.abs(v[0] - c[0]) + Math.abs(v[1] - c[1]) + Math.abs(v[2] - c[2]); if (d < bd) { bd = d; best = h; } } if (bd < 160) out._visor = best; }
    }
    return out;
  }
  const kindOf = name => /anti/i.test(String(name || '')) ? 'add' : /doginal\s*dog/i.test(String(name || '')) ? 'dd' : /doginal\s*frog/i.test(String(name || '')) ? 'frog' : null;

  function install(K) {
    const THREE = K.THREE, scene = K.scene, CH = K.CHAR || 0.8;
    const PETS = new Map();          /* owner key -> {d, dog, ent, v, run, still, px} ; 'me' for ours */
    const BASE = K.base || '', DOGS = new Map();   /* kind + base inscription -> Promise of {n, A} (traits + marks), read once */
    const getJ = async u => { const r = await fetch(BASE + u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
    async function pixels(id) {   /* the dog's picture as 25x25 [r,g,b] */
      const r = await fetch(BASE + '/content/' + id); if (!r.ok) throw new Error('content ' + r.status);
      const bmp = await createImageBitmap(await r.blob()), c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(25, 25) : Object.assign(document.createElement('canvas'), { width: 25, height: 25 });
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(bmp, 0, 0, 25, 25); const d = x.getImageData(0, 0, 25, 25).data, o = [];
      for (let i = 0; i < 625; i++) o.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]); return o;
    }
    function readDog(id, n, k) {   /* a pet by its inscription: the registry must say it is that collection's #n (a frog: Doginal Frogs) */
      const key = (k === 'frog' ? 'frog:' : 'dog:') + id;
      if (!DOGS.has(key)) DOGS.set(key, (async () => {
        const it = await getJ('/r/collection-item/doge/' + id), cn = COLL[k] || COLL.dd;
        if (!it || !it.collection || it.collection.name !== cn || +it.number !== n) throw new Error('not ' + cn + ' #' + n);
        const A = {}; for (const q of keysOf(k)) A[q] = String((it.traits || {})[q] || 'None');
        if (k === 'frog') return { n, A, px: null };   /* a frog is drawn from its traits alone */
        let px = null, marks = {}; try { px = await pixels(id); marks = readMarks(px, A); } catch (e) { px = null; /* no picture: the traits alone draw it */ }
        return { n, A: Object.assign(A, marks), px };
      })());
      return DOGS.get(key);
    }
    async function baseOf(item) {   /* the Doginal Dog an owned piece shows: itself, or the one an ADD's HTML names */
      if (item.k === 'dd' || item.k === 'frog') return item.ins;
      const r = await fetch(BASE + '/content/' + item.ins); const h = await r.text(), m = /id="txid" value="([0-9a-f]{64}i\d+)"/.exec(h); if (!m) throw new Error('no base'); return m[1];
    }
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });
    const shown = () => !K.settings || K.settings.showPet !== false;   /* Settings: Pet shown / hidden (hidden: nobody sees it) */
    let mine = null, owned = [], loadedFor = null, loadedAt = 0, modeMine = 'heel';
    try { if (localStorage.getItem('ashvale.petmode') === 'play') modeMine = 'play'; } catch (e) {}
    let awayNow = false;   /* on the Lily Run board: no pet at the heel */
    const descMine = () => (mine && shown() && !awayNow ? Object.assign({}, mine, { m: modeMine === 'play' ? 'p' : 'h' }) : null);   /* {k, n, i, m}: who it is and its mode; everyone reads its picture from Dogecoin Arcade (2026-10-18) */
    const ang = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * f; };
    function make(key, d, ent) {   /* read the dog (once), then draw it at its owner's heel */
      drop(key);
      if (!valid(d)) return null;
      const token = {}; PETS.set(key, { pending: token, d, ent });
      readDog(d.i, d.n, d.k).then(r => { const Q = PETS.get(key); if (Q && Q.pending === token) { if (r.n !== d.n) { PETS.delete(key); return; } build(key, d, ent, Object.assign({}, r.A)); } }   /* the read is cached by inscription: a second claim of another number for it draws nothing */, () => { const Q = PETS.get(key); if (Q && Q.pending === token) PETS.delete(key); });
      return null;
    }
    function build(key, d, ent, A) {
      const dog = d.k === 'frog' ? buildFrog(THREE, A, d.n * 7919) : buildDog(THREE, A, d.n * 7919, d.k === 'add' ? 'add' : 'dog');
      dog.root.scale.multiplyScalar(CH); if (d.k === 'add') dog.root.scale.x = -CH;   /* the game draws people at CHAR scale */
      dog.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      const p = ent.root.position; dog.root.position.copy(p);
      scene.add(dog.root);
      const px = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.7, 6), pickMat); px.position.y = 0.35; px.userData.pick = { kind: 'pet', id: key }; dog.root.add(px);   /* long-press / right-click target */
      const P = { d, dog, A, ent, v: 0, run: false, still: 0, last: p.clone(), sp: 0, px, mode: key === 'me' ? modeMine : (d.m === 'p' ? 'play' : 'heel') };
      PETS.set(key, P); return P;
    }
    function drop(key) { const P = PETS.get(key); if (!P) return; if (!P.dog) { PETS.delete(key); return; } scene.remove(P.dog.root); P.dog.root.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); PETS.delete(key); }
    async function choose(d, byHand) {   /* our pet: one the wallet holds (or a test pick). Picked by hand, it is saved with the game (K.petChosen): the next session, on any device, starts with it */
      if (d && !d.i && d.ins) { try { d.i = await baseOf(d); } catch (e) { d = null; } }
      mine = d && valid(d) ? { k: d.k, n: d.n, i: d.i } : null;
      try { localStorage.setItem('ashvale.pet', mine ? mine.k + ':' + mine.n : ''); } catch (e) {}
      if (byHand && mine && K.petChosen) K.petChosen(mine.k + ':' + mine.n);
      if (mine && K.myEnt && shown() && !awayNow) make('me', mine, K.myEnt); else drop('me');
      if (K.netSend) K.netSend({ pt: descMine() });
    }
    /* what the wallet holds: the arcade's read of the account's Dogecoin Doginals in known collections */
    async function load(address) {
      if (!address) return; loadedFor = address; loadedAt = Date.now();
      let list = [];
      try {
        const r = await fetch((K.base || '') + '/r/doginals/' + address);
        if (r.ok) { const j = await r.json(); list = (Array.isArray(j) ? j : (j.items || j.data || [])).map(x => ({ k: kindOf((x.collection && x.collection.name) || x.collection || x.name), n: +(x.number != null ? x.number : x.n), ins: String(x.inscription || '') })).filter(x => x.k && x.n >= 1 && ID_RE.test(x.ins)); }
      } catch (e) {}
      const test = (() => { try { return (new URLSearchParams(location.search + (typeof globalThis.ASH_QS === 'string' ? '&' + globalThis.ASH_QS : '')).get('pet') || '').split(',').map(q => /^(dd|add|frog):(\d{1,5}):([0-9a-f]{64}i\d+)$/.exec(q)).filter(Boolean).map(m => ({ k: m[1], n: +m[2], i: m[3] })); } catch (e) { return []; } })();   /* ?pet=add:165:<base id>,... (playtests) */
      owned = test.concat(list);
      let keep = null; const want = s => { const v = String(s || '').split(':'); return owned.find(o => o.k === v[0] && o.n === +v[1]) || null; };
      keep = want(K.savedPet && K.savedPet());   /* the save's choice first (it follows the account), then this device's */
      if (!keep) try { keep = want(localStorage.getItem('ashvale.pet')); } catch (e) {}
      choose(keep || owned[0] || null);
    }
    /* WHAT A PET DOES (2026-10-18): long-press / right-click your dog for Heel, Play or Pet.
       - Heel: it keeps to a ring round its owner - never closer than R0, never further than R1; walking, it follows the owner's
         footsteps (the doors they used, the stairs they climbed); standing, it settles where it is in the ring and sits.
       - Play: a wider circle (RP): it wanders, trots or runs to a spot, sits, lies down or sniffs; two dogs in Play near each
         other play together (they chase and circle each other); if the owner walks off it catches up.
       - Pet: it comes to its owner, sits, wags hard and hearts rise; the owner bends down to it. Everyone sees it.
       Pets walk through walls in Play (they are not in the game's world); Heel is the safe way through a house. */
    const SC = CH / 0.8, R0 = 0.6 * SC, R1 = 1.6 * SC, RP = 5 * SC;
    const rnd = () => Math.random();
    const okAt = (P, x, z) => !K.canStand || K.canStand(x, z, P.ent);   /* the engine says where its owner could stand: no walls, no thin air (2026-10-18) */
    const yAt = (P, x, z, fy) => K.groundY ? K.groundY(x, z, P.ent, fy) : fy;   /* the ground under the pet itself, not under its owner (a slope sank it, 2026-10-18) */
    function step(P, gx, gz, gy, cap, dt) {   /* walk / trot / run toward a point; returns the distance left */
      const r = P.dog.root, dx = gx - r.position.x, dz = gz - r.position.z, dist = Math.hypot(dx, dz);
      if (dist > 0.1) {
        const want = Math.min(cap, dist * 2.2 + 0.4); P.v += (want - P.v) * Math.min(1, dt * 4);
        const f = Math.min(P.v * dt, dist) / dist, nx = r.position.x + dx * f, nz = r.position.z + dz * f;
        if (okAt(P, nx, nz)) { r.position.x = nx; r.position.z = nz; P.stuck = 0; }
        else if (okAt(P, nx, r.position.z)) r.position.x = nx;   /* slide along the wall */
        else if (okAt(P, r.position.x, nz)) r.position.z = nz;
        else { P.v = 0; P.stuck = (P.stuck || 0) + dt; }
        r.rotation.y = ang(r.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
        P.run = P.run ? P.v > 1.9 : P.v > 2.4; P.dog.setPose(P.run ? 'run' : P.v > 0.2 ? 'walk' : 'idle');
      } else P.v *= Math.max(0, 1 - dt * 6);
      r.position.y += (yAt(P, r.position.x, r.position.z, gy) - r.position.y) * Math.min(1, dt * 6);
      return dist;
    }
    function face(P, x, z, dt) { const r = P.dog.root; r.rotation.y = ang(r.rotation.y, Math.atan2(x - r.position.x, z - r.position.z), Math.min(1, dt * 4)); }
    function ringPoint(o, from, rad) { let dx = from.x - o.x, dz = from.z - o.z, d = Math.hypot(dx, dz); if (d < 1e-3) { dx = -1; dz = 0; d = 1; } return [o.x + dx / d * rad, o.z + dz / d * rad]; }
    function follow(P, dt, T) {
      const e = P.ent, o = e.root.position, dog = P.dog, r = dog.root;
      const hide = !e.root.visible || e.dead || e.canoe || e.boatRole || e.held || (e.H && e.H.object && !e.H.object.visible);
      r.visible = !hide; if (hide) { r.position.copy(o); P.v = 0; P.trail = [o.clone()]; P.act = null; return; }
      const tr = P.trail || (P.trail = [o.clone()]), head = tr[tr.length - 1];
      if (head.distanceTo(o) > 0.2) { tr.push(o.clone()); if (tr.length > 80) tr.shift(); }
      const moved = Math.hypot(o.x - P.last.x, o.z - P.last.z); P.last.copy(o);
      if (dt > 0) P.sp += (moved / dt - P.sp) * Math.min(1, dt * 6);        /* the owner's ground speed */
      const d0 = Math.hypot(r.position.x - o.x, r.position.z - o.z);
      if (d0 > 12 || Math.abs(o.y - r.position.y) > 3 || !okAt(P, r.position.x, r.position.z)) { let [x, z] = ringPoint(o, r.position, (R0 + R1) / 2); if (!okAt(P, x, z)) { x = o.x; z = o.z; } r.position.set(x, o.y, z); P.v = 0; P.act = null; return; }   /* a teleport, a portal */
      let dist = 0;
      if (P.petUntil && T < P.petUntil) {   /* PET: to the owner, sit, wag */
        const yaw = e.yaw || 0; let gx = o.x + Math.sin(yaw) * (R0 + 0.12), gz = o.z + Math.cos(yaw) * (R0 + 0.12);
        if (!okAt(P, gx, gz) || (P.stuck || 0) > 0.4) [gx, gz] = ringPoint(o, r.position, R0 + 0.12);   /* in front of its owner is a fence or a wall: the near side will do */
        dist = step(P, gx, gz, o.y, 3, dt);
        if (dist < 0.15) { face(P, o.x, o.z, dt); dog.setPose('sit'); dog.setHappy(0.5);
          if (!P.petShown) { P.petShown = true; if (K.playOnce && (P.sp || 0) < 0.3) K.playOnce(e, 'pickup');   /* never e.H.play: that left the owner stuck bent over (2026-10-18) */ hearts(r.position); } }
      } else if (P.mode === 'play') {   /* PLAY: a wide circle, its own ideas, a friend if there is one */
        const a = P.act;
        if (d0 > RP + 1) P.act = { k: 'run', x: 0, z: 0, until: T + 6, home: true };
        if (!P.act || T > P.act.until) P.act = pickPlay(P, o, T);
        const A = P.act;
        if (A.home) { const [x, z] = ringPoint(o, r.position, RP * 0.55); A.x = x; A.z = z; }
        if (A.k === 'chase' && A.with && PETS.get(A.with) && PETS.get(A.with).dog) { const F = PETS.get(A.with).dog.root.position, k = T * 2.2 + (A.side || 0); A.x = F.x + Math.cos(k) * 0.9; A.z = F.z + Math.sin(k) * 0.9; if (Math.hypot(A.x - o.x, A.z - o.z) < R0 + 0.25) [A.x, A.z] = ringPoint(o, { x: A.x, z: A.z }, R0 + 0.3); }   /* the chase goes round its owner, not through */
        if (A.k === 'walk' || A.k === 'run' || A.k === 'chase') {
          dist = step(P, A.x, A.z, o.y, A.k === 'walk' ? 1.1 : 4.2, dt);
          if (P.stuck > 0.6 && A.k !== 'chase') { P.act = null; P.stuck = 0; }   /* a wall in the way: think of something else */
          if (dist < 0.15 && A.k !== 'chase') P.act = { k: rnd() < 0.5 ? 'sniff' : 'stand', until: T + 1 + rnd() * 2 };
        } else { P.v *= Math.max(0, 1 - dt * 6); r.position.y += (yAt(P, r.position.x, r.position.z, o.y) - r.position.y) * Math.min(1, dt * 6); dog.setPose(A.k === 'stand' ? 'idle' : A.k); }
        if (d0 < R0) { const [x, z] = ringPoint(o, r.position, R0 + 0.2); dist = step(P, x, z, o.y, 2, dt); }   /* never on top of its owner */
      } else {   /* HEEL: the ring round its owner */
        if (P.sp > 0.3) {   /* walking: in the owner's footsteps, a pace behind */
          const back = (P.sp > 2.4 ? 1.35 : 1.0) * SC; let g = o.clone(), left = back;
          for (let k = tr.length - 1; k >= 0 && left > 0; k--) { const a = k === tr.length - 1 ? o : tr[k + 1], b = tr[k], dd = a.distanceTo(b); if (dd >= left) { g = a.clone().lerp(b, left / dd); left = 0; } else { g = b.clone(); left -= dd; } }
          if (tr.length > 2) { let best = 0, bd = 1e9; for (let k = 0; k < tr.length - 1; k++) { const dd = tr[k].distanceTo(r.position); if (dd < bd) { bd = dd; best = k; } } if (best > 0) tr.splice(0, best); }
          dist = step(P, g.x, g.z, g.y, 7, dt); P.still = 0;
        } else {   /* standing: stay in the ring - out of the middle, back in from the edge, otherwise where it is */
          let gx = r.position.x, gz = r.position.z;
          if (d0 < R0) [gx, gz] = ringPoint(o, r.position, R0 + 0.2); else if (d0 > R1) [gx, gz] = ringPoint(o, r.position, R1 - 0.2);
          dist = step(P, gx, gz, o.y, 2.5, dt);
          if (dist < 0.15) { face(P, o.x, o.z, dt * 0.6); P.still = (P.still || 0) + dt; dog.setPose(P.still > 25 ? 'lie' : P.still > 0.8 ? 'sit' : 'idle'); }
        }
      }
      dog.update(dt, T, dist > 0.1 ? P.v : 0);
    }
    function pickPlay(P, o, T) {   /* what to do next in Play */
      const me = P.dog.root.position;
      for (const [k, Q] of PETS) if (Q !== P && Q.dog && Q.mode === 'play' && Q.dog.root.visible && Q.dog.root.position.distanceTo(me) < RP * 2 && rnd() < 0.6) {
        const side = rnd() * 6.28; if (!Q.act || Q.act.k !== 'chase') Q.act = { k: 'chase', with: keyOf(P), side: side + 3.14, until: T + 6 }; return { k: 'chase', with: k, side, until: T + 6 };
      }
      const x = rnd(), at = () => { for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, rr = R0 + 0.4 + rnd() * (RP - R0 - 0.4) * (i < 6 ? 1 : 0.4), px = o.x + Math.cos(a) * rr, pz = o.z + Math.sin(a) * rr; if (okAt(P, px, pz)) return [px, pz]; } return [P.dog.root.position.x, P.dog.root.position.z]; };   /* somewhere it can stand (indoors: inside the room) */
      if (x < 0.35) { const [px, pz] = at(); return { k: 'walk', x: px, z: pz, until: T + 12 }; }
      if (x < 0.5) { const [px, pz] = at(); return { k: 'run', x: px, z: pz, until: T + 8 }; }
      if (x < 0.7) return { k: 'sit', until: T + 3 + rnd() * 4 };
      if (x < 0.85) return { k: 'lie', until: T + 6 + rnd() * 8 };
      return { k: 'sniff', until: T + 2 + rnd() * 3 };
    }
    const keyOf = P => { for (const [k, Q] of PETS) if (Q === P) return k; return null; };
    /* hearts over a petted dog */
    const HEARTS = []; let heartTex = null;
    function hearts(at) {
      if (!heartTex && typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#e8344a'; x.beginPath(); x.moveTo(16, 28); x.bezierCurveTo(2, 18, 2, 6, 10, 6); x.bezierCurveTo(14, 6, 16, 9, 16, 11); x.bezierCurveTo(16, 9, 18, 6, 22, 6); x.bezierCurveTo(30, 6, 30, 18, 16, 28); x.fill(); heartTex = new THREE.CanvasTexture(c); }
      if (!heartTex) return;
      for (let i = 0; i < 4; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); sp.scale.setScalar(0.18 * SC); sp.position.set(at.x + (rnd() - 0.5) * 0.3, at.y + 0.55 * SC, at.z + (rnd() - 0.5) * 0.3); scene.add(sp); HEARTS.push({ sp, t: -i * 0.25 }); }
    }
    function petNow(key) { const P = PETS.get(key); if (!P || !P.dog) return; P.petUntil = T + 3.2; P.petShown = false; P.act = null; }
    function setMode(m) { modeMine = m === 'play' ? 'play' : 'heel'; try { localStorage.setItem('ashvale.petmode', modeMine); } catch (e) {} const P = PETS.get('me'); if (P) { P.mode = modeMine; P.act = null; } if (K.netSend) K.netSend({ pt: descMine() }); }
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const title = d => KINDS[d.k] + ' #' + d.n;
    function inspect(d, whose, t) {   /* the collection, the number and every trait, as that collection names them */
      if (!t || !K.hud) return;
      const nm = k => d.k === 'add' ? ((ADD_NAMES[k] || {})[t[k]] || t[k]) : t[k];
      K.hud.dialog(title(d), [(whose ? whose + "'s pet. " : 'Your pet. ') + keysOf(d.k).filter(k => d.k !== 'frog' || t[k] !== 'None').map(k => k + ': ' + nm(k)).join('; ') + '.'], null, null, ID_RE.test(String(d.i || '')) ? { img: { src: BASE + '/content/' + d.i, flip: d.k === 'add' } } : null);   /* its own picture from Dogecoin Arcade (an ADD draws it inverted + mirrored) */
    }
    const COLL_NAME = { dd: 'Doginal Dogs', add: 'Anti Doginal Dogs', frog: 'Doginal Frogs' };
    async function chooser() {   /* every pet inscription the wallet holds, each on its card with its own artwork (an ADD's: its dog, inverted + mirrored) */
      const list = owned.slice();
      await Promise.all(list.map(async d => { if (!d.i && d.ins) { try { d.i = await baseOf(d); } catch (e) { /* no picture: the card still chooses it */ } } }));
      K.hud.cards('Choose pet', list.map(d => ({ label: title(d), sub: COLL_NAME[d.k], img: ID_RE.test(String(d.i || '')) ? { src: BASE + '/content/' + d.i, flip: d.k === 'add' } : null,
        cur: !!mine && mine.k === d.k && mine.n === d.n })), i => { if (list[i]) choose(list[i], true); }, list.length + ' pets in your wallet. Pick the one that walks with you.');
    }
    function menu(t) {   /* long-press / right-click on a pet */
      const P = PETS.get(t.id); if (!P || !P.dog) return [];
      const nm = '<span class="c">' + esc(title(P.d)) + '</span>', o = [];
      if (t.id === 'me') {
        o.push(P.mode === 'play' ? { html: 'Heel ' + nm, fn: () => setMode('heel') } : { html: 'Play ' + nm, fn: () => setMode('play') });
        o.push({ html: 'Pet ' + nm, fn: () => { petNow('me'); if (K.netSend) K.netSend({ ptp: 1 }); } });
        if (owned.length > 1) {
          if (K.hud && K.hud.cards) o.push({ html: 'Choose pet', fn: () => chooser() });   /* 2026-10-19: one option, a card per pet inscription */
          else for (const d of owned) if (d.k !== P.d.k || d.n !== P.d.n) o.push({ html: 'Show ' + '<span class="c">' + esc(title(d)) + '</span>', fn: () => choose(d, true) });
        }
        o.push({ html: 'Inspect ' + nm, fn: () => inspect(P.d, '', P.A) });
      } else o.push({ html: 'Inspect ' + nm, fn: () => inspect(P.d, K.ownerName ? K.ownerName(t.id.slice(2)) : '', P.A) });
      return o;
    }
    const TEST_PETS = (() => { try { return /(^|&)pet=/.test(location.search.slice(1) + '&' + (typeof globalThis.ASH_QS === 'string' ? globalThis.ASH_QS : '')); } catch (e) { return false; } })();
    let T = 0, lastNow = 0;
    return {
      frame(now, dt) {   /* real elapsed time, not the engine's capped dt: on a slow machine the pet must still keep pace */
        dt = lastNow ? Math.max(0, Math.min(0.5, (now - lastNow) / 1000)) : dt; lastNow = now; T += dt;
        const A = (K.walletState && K.walletState.address) || (TEST_PETS ? 'test' : null);   /* a playtest page's pets need no wallet */   /* a new wallet: read it; nothing found yet: ask again every 5 minutes */
        if (A && (loadedFor !== A || (!owned.length && Date.now() - loadedAt > 300000))) load(A);
        for (const P of PETS.values()) if (P.dog) follow(P, dt, T);   /* one still being read has no model yet */
        for (let i = HEARTS.length - 1; i >= 0; i--) { const h = HEARTS[i]; h.t += dt; if (h.t < 0) { h.sp.visible = false; continue; } h.sp.visible = true; h.sp.position.y += dt * 0.35; h.sp.material.opacity = Math.max(0, 1 - h.t / 1.4); if (h.t > 1.4) { scene.remove(h.sp); h.sp.material.dispose(); HEARTS.splice(i, 1); } }
      },
      net(id, d, ent) {   /* another player's {pt}: their pet (null: none) */
        const key = 'r:' + id, P = PETS.get(key);
        if (!valid(d)) { drop(key); return; }
        if (!P || P.d.k !== d.k || P.d.n !== d.n || P.d.i !== d.i || P.ent !== ent) make(key, { k: d.k, n: d.n, i: d.i, m: d.m }, ent);
        else { const m = d.m === 'p' ? 'play' : 'heel'; if (P.mode !== m) { P.mode = m; P.act = null; } }
      },
      drop: id => drop('r:' + id),
      desc: descMine,
      petted: id => petNow('r:' + id),   /* another player pets their dog: we see it too */
      setMode, petNow: () => petNow('me'), mode: () => modeMine,
      shown: () => choose(mine),   /* the Settings toggle changed: draw or hide ours, and tell the room */
      pickables: () => Array.from(PETS.values()).filter(P => P.dog && P.dog.root.visible).map(P => P.px),
      menu,
      chooser,
      /* [Claude 2026-10-19] for the Lily Run: the frog to play with (the walking pet if it is a frog, else the wallet's first),
         read with its traits; setting the pet down on the board takes it from the heel; another player's frog's traits */
      async frogOf() { const d = mine && mine.k === 'frog' ? mine : owned.find(o => o.k === 'frog'); if (!d) return null; if (!d.i && d.ins) d.i = d.ins;
        try { const r = await readDog(d.i, d.n, 'frog'); return { d: { k: 'frog', n: d.n, i: d.i }, A: Object.assign({}, r.A) }; } catch (e) { return null; } },
      away(on) { awayNow = !!on; if (awayNow) drop('me'); else if (mine && K.myEnt && shown()) make('me', mine, K.myEnt); if (K.netSend) K.netSend({ pt: descMine() }); },
      traitsOf: id => { const P = PETS.get('r:' + id); return P && P.d && P.d.k === 'frog' ? P.A : null; },
      buildFrog,
      owned: () => owned.slice(),
      choose,
      _load: a => { loadedFor = null; return load(a); },
      _pets: () => Array.from(PETS).filter(([k, P]) => P.dog).map(([k, P]) => ({ k, d: P.d, mode: P.mode, act: P.act && P.act.k, vis: P.dog.root.visible, x: P.dog.root.position.x, z: P.dog.root.position.z, y: P.dog.root.position.y, gy: yAt(P, P.dog.root.position.x, P.dog.root.position.z, P.ent.root.position.y), gap: Math.hypot(P.dog.root.position.x - P.ent.root.position.x, P.dog.root.position.z - P.ent.root.position.z) }))   /* tests */
    };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engpet', { api: 1, v: 2, needs: {} }, () => ({ api: 1, install, KINDS, buildDog, buildFrog }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
