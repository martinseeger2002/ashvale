/* ASHVALE: the twenty-one table (2026-10-20: one on each upper floor of the clubhouse; the 2026-10-18 simulation's half-moon
   table and the card-table room's own cards). Its own module so it can be updated alone. The scene builds it (case 'gametable');
   engtables.js seats players and lays the Bank's deal on it. Never name the game in public text: "the twenty-one table".
   Frame: the footprint's middle at the origin, floor y 0, the dealer's straight edge -z, the curve and the players +z. The six
   betting circles sit on the arc, each turned to its standing tile (kit.o.spots).
   build(THREE, kit) -> T: {group, body, hot: [felt], felt, show(view), update(dt, t), eyeY}
   view = {hand: {dealer: [card], spots: {s: {hands: [{cards, bet, res}], cur}}} | null, felt: {s: bet}, idx: {s: spot index 0-5}, turn: s} */
(function (G) {
  'use strict';
  /* 2026-10-20: "make the table a little bigger so it's proportional to a real blackjack table" (room for six spots, their
     splits and doubles) and "the cards should also be proportional to the table": a real table is ~90 inches across with 63 mm cards,
     so the card is 2.75% of the table's width */
  const S = 0.8, BED_Y = 0.78 * S, R = 1.3, OZ = -0.6, RAIL = 0.11, SPOT_R = 1.08, CARD_R = 0.88, CARD_FRAC = 0.0275;
  const RANKS = '23456789TJQKA', SUITS = 'SHDC';
  const cardId = c => c === '??' ? 63 : RANKS.indexOf(c[0]) * 4 + SUITS.indexOf(c[1]);
  function totalText(cards) {   /* 2026-10-21: "the hand totals should be displayed as well" - the face-up cards' total, '7 / 17' while an Ace counts either way */
    let t = 0, a = 0, n = 0; for (const c of cards || []) { if (!c || c === '??') continue; n++; const r = c[0]; t += r === 'A' ? 11 : 'TJQK'.includes(r) ? 10 : +r; if (r === 'A') a++; }
    while (t > 21 && a) { t -= 10; a--; }
    if (!n) return ''; if (t > 21) return 'Bust ' + t; if (n === 2 && t === 21 && (cards || []).length === 2) return '21!';
    return a && t !== 21 ? (t - 10) + ' / ' + t : String(t);
  }
  function build(THREE, kit) {
    const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const group = new THREE.Group(), table = new THREE.Group(); group.add(table);
    const o = kit.o || {}, cx0 = (o.x || 0) + (o.w || 1) / 2, cz0 = (o.y || 0) + (o.h || 1) / 2;
    /* 2026-10-20: "seven spots ... just like a regular blackjack game", "evenly spaced": the betting circles stand at equal
       angles on one arc near the rail, spot 1 at the dealer's left (+x, "first base") round to spot 7 at his right */
    const NS = (o.spots || []).length || 7, A0 = 18 * Math.PI / 180, A1 = 162 * Math.PI / 180;
    const ANG = Array.from({ length: NS }, (_, i) => A0 + (A1 - A0) * i / (NS - 1));
    const dirOf = th => [Math.cos(th), Math.sin(th)];
    /* ---- the felt: a half-moon, painted */
    const K = 400, cv = document.createElement('canvas'); cv.width = 2 * R * K; cv.height = R * K; const g = cv.getContext('2d');
    g.fillStyle = '#1f5a3a'; g.fillRect(0, 0, cv.width, cv.height);
    const px = x => (x + R) * K, pz = z => (z) * K;   /* felt-local: x across (a player facing the dealer has -x on the left), z from the straight edge */
    g.strokeStyle = '#efe2c4'; g.lineWidth = 3; g.fillStyle = '#efe2c4'; g.textAlign = 'center'; g.textBaseline = 'middle';
    /* words on an arc (centre the straight edge's middle, radius r), read from the players' side, centred on the table */
    function arcText(text, r, size) {
      g.save(); g.font = 'bold ' + size * K + 'px Georgia, serif';
      const w = g.measureText(text).width / K, span = w / r; let a = Math.PI / 2 + span / 2;
      for (const ch of text) { const cw = g.measureText(ch).width / K, aa = a - cw / r / 2; g.save(); g.translate(px(Math.cos(aa) * r), pz(Math.sin(aa) * r)); g.rotate(aa - Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); a -= cw / r; }
      g.restore();
    }
    const ring = r => { g.beginPath(); g.arc(px(0), pz(0), r * K, 0.06, Math.PI - 0.06); g.stroke(); };
    arcText('TWENTY-ONE PAYS 3 TO 2', 0.42, 0.07);
    arcText('Dealer must draw to 16 and hit soft 17', 0.55, 0.04);
    ring(0.64); ring(0.76); arcText('INSURANCE PAYS 2 TO 1', 0.70, 0.05);   /* the insurance band */
    ANG.forEach((th, i) => { const [dx, dz] = dirOf(th); g.beginPath(); g.arc(px(dx * SPOT_R), pz(dz * SPOT_R), 0.1 * K, 0, 7); g.stroke();
      g.beginPath(); g.arc(px(dx * SPOT_R), pz(dz * SPOT_R), 0.085 * K, 0, 7); g.stroke(); });   /* the betting circles, double lined */
    arcText('Even bets, 2 to 500 GOLD', 1.24, 0.035);
    const tex = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.CircleGeometry(R, 48, 0, Math.PI);   /* the upper half in its own plane: turned to lie on the table, the curve +z */
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + R) / (2 * R), 1 - pos.getY(i) / R);   /* the same way round as the canvas */
    const felt = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 })   /* lit from the lantern above, day or night */); felt.rotation.x = Math.PI / 2; felt.position.set(0, BED_Y + 0.001, OZ);   /* turned flat, the curve towards the players (+z) */
    felt.material.side = THREE.DoubleSide; table.add(felt); felt.userData.tb = { act: 'felt' };
    /* ---- the table: apron, padded rail round the curve, the dealer's straight edge, the shoe */
    const woodM = lam('#5a3620'), padM = lam('#2a1712');
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(R + RAIL, R + RAIL, 0.1, 40, 1, false, -Math.PI / 2, Math.PI), woodM); apron.position.set(0, BED_Y - 0.06, OZ); table.add(apron);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R + RAIL / 2, 0.04, 8, 40, Math.PI), padM); rail.rotation.x = -Math.PI / 2; rail.scale.z = 1; rail.rotation.z = Math.PI; rail.position.set(0, BED_Y + 0.02, OZ); table.add(rail);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2 * (R + RAIL), 0.05, 0.08), woodM); edge.position.set(0, BED_Y + 0.01, OZ - 0.04); table.add(edge);
    for (const sx of [-0.9, 0.9]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, BED_Y - 0.1, 0.09), woodM); leg.position.set(sx, (BED_Y - 0.1) / 2, OZ + 0.3); table.add(leg); }
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.12), lam('#3b2416')); tray.position.set(0, BED_Y + 0.015, OZ + 0.08); table.add(tray);
    const SHOE = new THREE.Vector3(1.13, BED_Y, OZ + 0.11);   /* the operator: in the dealer's left corner against the rail, clear of spot 1's cards */
    { const shoe = new THREE.Group(); shoe.position.copy(SHOE); shoe.rotation.y = -0.5; table.add(shoe);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.24), lam('#3b2416')); b.position.y = 0.045; shoe.add(b);
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.19), lam('#5a1c1c')); d.position.set(0, 0.06, -0.01); d.rotation.x = -0.35; shoe.add(d); }
    const body = new THREE.Mesh(new THREE.BoxGeometry(2 * (R + RAIL), BED_Y + 0.05, R + RAIL + 0.1), new THREE.MeshBasicMaterial({ visible: false })); body.position.set(0, (BED_Y + 0.05) / 2, OZ + (R + RAIL) / 2); group.add(body);

    { /* a lantern over the felt (the operator: the tables read at night too): its glass glows, no light of its own (cheap on phones) */
      const lan = new THREE.Group(); lan.name = 'lantern'; lan.position.set(0, 2.1, 0); table.add(lan);   /* (the scene hangs the room's light in it) */
      lan.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd28a })));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.09, 4), new THREE.MeshLambertMaterial({ color: 0x2a2016 })); cap.position.y = 0.14; cap.rotation.y = Math.PI / 4; lan.add(cap);
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x2a2016 })); ch.position.y = 0.43; lan.add(ch); }
    if (kit.wrap) kit.wrap(table);
    /* ---- cards: the card table room's atlas; each new card slides out of the shoe to its place */
    const cardMat = kit.cardMat ? kit.cardMat() : new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cards = new Map();   /* key -> {g, to: Vector3, yaw, id} */
    const W = kit.CARD_W || 0.15, H = kit.CARD_H || 0.212, CS = 2 * R * CARD_FRAC / W;   /* cards in proportion to the table (the operator) */
    function place(key, id, x, z, yaw, y) {
      let c = cards.get(key);
      if (!c) { const m = kit.cardMesh(cardMat, id); m.rotation.x = -Math.PI / 2; m.scale.setScalar(CS); const q = new THREE.Group(); q.add(m); q.position.copy(SHOE).add(new THREE.Vector3(0, 0.1, 0)); q.visible = false; table.add(q);
        const wait = Math.max(0, DEAL.next - DEAL.clk); DEAL.next = DEAL.clk + wait + DEAL.gap;   /* 2026-10-21: "Slow down the dealing animation. So it is kind of realistic" - one card at a time out of the shoe */
        c = { key0: key[0], g: q, m, id, t: 0, wait, from: q.position.clone(), yaw0: 0 }; cards.set(key, c); }
      if (c.id !== id) { if (c.id === 63 && cardCb) cardCb('flip', x, z, key[0] === 'd'); kit.cardFace(c.m, id); c.id = id; }
      c.to = new THREE.Vector3(x, BED_Y + 0.002 + (y || 0), z); c.yaw = yaw; c.seen = true;
    }
    let cardCb = null;   /* (kind 'deal' | 'flip', local x, z, dealer's own) - the dealer's hands follow the cards */
    const DEAL = { clk: 0, next: 0, gap: 0.55, fly: 0.45 };   /* seconds between cards, seconds a card takes from the shoe to its place */
    const landed = key => { const c = cards.get(key); return !c || (c.wait <= 0 && c.t >= 1); };
    function clearCards() { for (const [k, c] of cards) { table.remove(c.g); c.m.geometry.dispose(); } cards.clear(); }
    /* ---- GOLD in the betting circles */
    const coins = new THREE.Group(); table.add(coins);
    const nCoins = n => n <= 5 ? n : Math.round(5 + 2.4 * Math.sqrt(n - 5));
    function label(n, col) { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'rgba(43,29,20,.85)'; x.fillRect(6, 10, 116, 44);
      x.fillStyle = col || '#ffe08a'; x.font = 'bold 30px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 33);
      const t = new THREE.CanvasTexture(c); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); sp.scale.set(0.09, 0.045, 1); sp.renderOrder = 5; return sp; }
    const spotAt = (i, r) => { const [dx, dz] = dirOf(ANG[i]); return [dx * r, OZ + dz * r]; };
    function show(v) {
      for (const c of coins.children.slice()) { c.traverse(q => { if (q.isSprite) { q.material.map.dispose(); q.material.dispose(); } }); coins.remove(c); }
      for (const c of cards.values()) c.seen = false;
      const tag = (text, x, z, after) => { if (!text) return; const l = label(text, /^Bust/.test(text) ? '#ff8a7a' : text === '21!' ? '#9fe8a0' : '#f2ead8'); l.scale.set(0.11, 0.055, 1); l.position.set(x, BED_Y + 0.03, z); l.userData.after = after; l.visible = landed(after); coins.add(l); };   /* a total shows once its last card has landed */
      const pile = (n, x, z, seed, text) => { if (!(n > 0)) return; const grp = new THREE.Group(); grp.position.set(x, BED_Y, z); const k = nCoins(n); kit.coinPile(grp, k, 1, 0, 0, 0, seed);
        const l = label(text || n); l.position.y = Math.ceil(k / Math.ceil(k / 8)) * 0.0075 + 0.05; grp.add(l); coins.add(grp); };
      for (const s in (v.felt || {})) { const i = (v.idx || {})[s]; if (i == null) continue; const [x, z] = spotAt(i, SPOT_R); pile(v.felt[s], x, z, i); }
      const Hd = v.hand;
      if (Hd) {
        const CW = W * CS, CH = H * CS, IN = CW / 2.5 * 0.75, STEP = CW - IN, UP = CH - IN;   /* 2026-10-21: "the cards overlap is too much ... only like a three-quarter inch by three-quarter inch overlap": a 2.5 x 3.5 inch card, each next one up and across, covering only 3/4 x 3/4 inch of the last one's corner */
        const dn = (Hd.dealer || []).length, dx0 = -(dn - 1) / 2 * CW * 0.8;
        const Q = [];   /* every card's place, dealt in a real dealer's order: round by round from first base, the dealer last */
        (Hd.dealer || []).forEach((c, j) => Q.push([j, 99, 'd' + j, cardId(c), dx0 + j * CW * 0.8, OZ + 0.3, 0, j * 0.0012]));
        if (dn) tag(totalText(Hd.dealer), 0, OZ + 0.3 + CH * 0.5 + 0.07, 'd' + (dn - 1));
        for (const s in (Hd.spots || {})) {
          const i = (v.idx || {})[s]; if (i == null) continue; const sp = Hd.spots[s], th = ANG[i], [dx, dz] = dirOf(th), yaw = Math.PI / 2 - th, rx = Math.sin(th), rz = -Math.cos(th);
          const n = sp.hands.length;
          sp.hands.forEach((h, hi) => {
            const wide = CW + STEP * Math.max(1, ...sp.hands.map(q => q.cards.length - 1)), off = (hi - (n - 1) / 2) * (wide + 0.03), bx = dx * CARD_R + rx * off, bz = OZ + dz * CARD_R + rz * off;
            const k0 = -(h.cards.length - 1) / 2, nc = h.cards.length;   /* the hand climbs from your spot towards the dealer, each card across and up from the last */
            h.cards.forEach((c, j) => Q.push([j, i + hi * 0.1, s + ':' + hi + ':' + j, cardId(c), bx + rx * (k0 + j) * STEP - dx * j * UP, bz + rz * (k0 + j) * STEP - dz * j * UP, yaw, j * 0.0012]));
            if (nc) { const ti = (nc - 1) * UP + CH * 0.5 + 0.035, ta = -k0 * STEP; tag(totalText(h.cards), bx + rx * ta - dx * ti, bz + rz * ta - dz * ti, s + ':' + hi + ':' + (nc - 1)); }   /* the total just past the last card */
            const [x, z] = spotAt(i, SPOT_R); if (h.bet) pile(h.bet, x + rx * off, z + rz * off, i + hi, h.res === 'win' || h.res === 'bj' ? '+' + (h.res === 'bj' ? h.bet * 1.5 : h.bet) : h.bet);
          });
          if (sp.ins) { const [x, z] = spotAt(i, 0.5); pile(sp.ins, x, z, 9 + i); }
        }
        const fresh = Q.filter(q => !cards.has(q[2])).length;   /* the queue never runs ahead of the cards still to come (a table out of sight piled it up) */
        if (DEAL.next < DEAL.clk || DEAL.next - DEAL.clk > fresh * DEAL.gap) DEAL.next = DEAL.clk;
        Q.sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(q => place(...q.slice(2)));
      }
      for (const [k, c] of cards) if (!c.seen) { table.remove(c.g); c.m.geometry.dispose(); cards.delete(k); }
    }
    function update(dt) {
      DEAL.clk += dt; if (DEAL.next < DEAL.clk) DEAL.next = DEAL.clk;
      for (const c of cards.values()) {
        if (!c.to) continue;
        if (c.wait > 0) { c.wait -= dt; continue; }
        if (!c.g.visible && cardCb) cardCb('deal', c.to.x, c.to.z, c.key0 === 'd');
        c.g.visible = true;
        if (c.t < 1) {   /* out of the shoe: a low slide with a little lift, turning to face its player */
          c.t = Math.min(1, c.t + dt / DEAL.fly); const e = c.t * c.t * (3 - 2 * c.t);
          c.g.position.lerpVectors(c.from, c.to, e); c.g.position.y += Math.sin(Math.PI * c.t) * 0.04; c.g.rotation.y = c.yaw0 + (c.yaw - c.yaw0) * e;
        } else { c.g.position.lerp(c.to, Math.min(1, dt * 6)); c.g.rotation.y = c.yaw; }   /* moved along (a split) */
      }
      for (const l of coins.children) if (l.isSprite && l.userData.after && landed(l.userData.after)) { if (l.userData.vis0 !== undefined) l.userData.vis0 = true; else l.visible = true; }   /* on a storey the engine hides (vis0 kept): shown when it comes back */
    }
    return { group, body, hot: [felt], felt, show, update, dealerAt: [0, OZ - 0.08 - 0.15], cardHook: f => { cardCb = f; }, rail: (x, z) => { const dx = x, dz = Math.max(0.01, z - OZ), l = Math.hypot(dx, dz) || 1, Ro = R + RAIL / 2 + 0.045; return [dx / l * Ro, OZ + dz / l * Ro, dx / l, dz / l]; },   /* [Claude 2026-10-21] the curved rail's outside nearest a point: [x, z, outward n] */ _deal: () => ({ DEAL, cards: [...cards.values()].map(c => [c.wait, c.t, c.g.visible]) }), clearCards, eyeY: 1.5, bedY: BED_Y, game: 'twentyone', areaAt: () => null };
  }
  const API = { build, cardId, totalText, S, BED_Y };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('twentyonetable', { api: 1, v: 1, needs: {} }, () => API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
