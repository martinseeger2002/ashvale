/* ASHVALE 3D castle module ('castle', api 1): the castle kit, split out of scene.js (Martin 2026-10-05: "make sure whatever
   we're doing gets modularized so that in future releases we don't have to inscribe huge files") - a castle change is
   one small inscription. The scene hands it its batcher and helpers per region build:
     const C = ASH3D.get('castle').create({ THREE, B, KitBatch, kitData, heightAt, group })
     C.wall(o) C.tower(o) C.gate(o) C.keep(o) C.steps(o)      object kinds cwall ctower cgate ckeep csteps (data/zone.castle.json,
     made by tools/castle/make_castle.js; cpad and cdeck are terrain / walking data and draw nothing) */
(function (G) {
  'use strict';
  const API = 1;
  function create(ctx) {
    const THREE = ctx.THREE; let B = ctx.B; ctx.useB = b => { B = b; }; const _unused = 0, KitBatch = ctx.KitBatch, kitData = ctx.kitData, heightAt = ctx.heightAt, group = ctx.group, pickables = ctx.pickables || [];
    /* tap targets: an invisible box over a wall, stair or tower top; a tap on it walks you to that tile (over the stairs) */
    const PICKMAT = new THREE.MeshBasicMaterial({ visible: false });
    function pickBox(x, y, z, sx, sy, sz, info) { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), PICKMAT); m.position.set(x, y, z); m.userData.pick = Object.assign({ kind: 'deckpick' }, info); group.add(m); pickables.push(m); }
  /* ---------- the castle kit (Martin 2026-10-05: "build a castle kit", the lake castle, data/zone.castle.json from
     tools/castle/make_castle.js): flat-colour stone like the house kit - curtain walls with a plinth, mortar courses,
     a walkway and battlements; round towers with a corbel ring, arrow slits and the kit's conical tower roof; the
     gatehouse with its portcullis; the keep with glazed windows, corner turrets and battlements. Instanced boxes and
     cylinders (Batcher) plus kit pieces, so a whole castle is a few dozen draws. */
  const STONE = 0xa59f92, COURSE = 0x8b8579, CAP = 0xb8b2a4, SLIT = 0x26221e, OAK = 0x5a3c24, IRON2 = 0x2e2a26, BANNER = 0x8c2a24;
  const TOWER_TINT = kitData() ? { [kitData().tile]: '#8c3f2e' } : null;
  const hMin = pts => Math.min(...pts.map(([x, z]) => heightAt(x, z)));
  /* battlements as real castle walls have them (Martin: "look at the top of actual castle walls"): on the OUTER side a
     parapet that steps out over the face on a row of corbels, waist high, with merlons on it - each capped by a
     coping stone, every other one pierced by an arrow slit - and open crenels between; on the inner side a low
     parapet with a coping. out = +1/-1 along the wall's normal axis; 0 = an inner wall (low parapets both sides). */
  function battlements(cx, cz, along, len, y, T, out) {
    const put = (n, off, w, h, d, col, yy) => B.add('box', col, cx + (along ? off : n), yy, cz + (along ? n : off), along ? w : d, h, along ? d : w);
    const sides = out ? [out, -out] : [1, -1];
    for (const sd of sides) {
      const outer = out !== 0 && sd === out;
      if (outer) {
        const PH = 0.95, PT = 0.42, n0 = sd * (T / 2 - PT / 2 + 0.22);   /* the parapet steps 0.22 m out */
        put(n0, 0, len, PH, PT, MORTAR, y + PH / 2);
        blocksFlat(cx + (along ? 0 : n0 + sd * PT / 2), cz + (along ? n0 + sd * PT / 2 : 0), along, len, y, PH, sd, null);
        const nc = Math.max(1, Math.floor(len / 0.7));
        for (let k = 0; k < nc; k++) { const t = -len / 2 + (k + 0.5) * len / nc; put(sd * (T / 2 + 0.1), t, 0.26, 0.34, 0.22, CAP, y - 0.2); }   /* corbels */
        put(sd * (T / 2 + 0.02), 0, len, 0.12, 0.08, COURSE, y - 0.42);
        const pitch = 1.3, nm = Math.max(1, Math.floor(len / pitch));
        for (let k = 0; k < nm; k++) {
          const t = -len / 2 + (k + 0.5) * len / nm, MW = Math.min(0.78, len / nm - 0.5);
          put(n0, t, MW, 0.85, PT, SHADES[k % 4], y + PH + 0.425);
          put(n0, t, MW + 0.08, 0.08, PT + 0.08, CAP, y + PH + 0.89);
          if (k % 2 === 0) put(n0 + sd * (PT / 2 + 0.005), t, 0.08, 0.42, 0.02, SLIT, y + PH + 0.42);
        }
        put(n0, 0, len, 0.06, PT + 0.06, CAP, y + PH + 0.03);   /* coping in the crenels */
      } else {
        const PH = out ? 0.55 : 0.95, PT = 0.3, n0 = sd * (T / 2 - PT / 2);
        put(n0, 0, len, PH, PT, SHADES[1], y + PH / 2);
        put(n0, 0, len, 0.07, PT + 0.06, CAP, y + PH + 0.035);
      }
    }
  }
  function merlons(cx, cz, along, len, y, offs) {   /* battlements along a run: 0.6 m merlons, 0.5 m crenels */
    const n = Math.max(1, Math.floor(len / 1.1));
    for (let k = 0; k < n; k++) { const t = -len / 2 + (k + 0.5) * len / n; for (const o of offs) B.add('box', STONE, cx + (along ? t : o), y + 0.38, cz + (along ? o : t), along ? 0.6 : 0.32, 0.76, along ? 0.32 : 0.6); }
  }
  /* masonry (Martin: "the castles should look as real as the houses"): dressed blocks in four shades, staggered course
     by course, standing 2.5 cm proud of darker mortar - instanced, so thousands cost a few draws */
  const MORTAR = 0x837d71, SHADES = [0xa8a295, 0x9e978a, 0xb2ac9e, 0x938d81];
  const RH = 0.46;
  function blocksFlat(cx, cz, along, len, y0, h, nOut, skip) {   /* one face: nOut = which side (+1/-1) of the face plane the blocks stand on */
    const rows = Math.floor(h / RH); let seed = Math.round(cx * 13 + cz * 7);
    for (let r = 0; r < rows; r++) {
      let t = -len / 2 + (r % 2 ? 0.45 : 0);
      while (t < len / 2 - 0.05) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff; const bl = 0.7 + (seed % 50) / 100, t1 = Math.min(len / 2, t + bl), w = t1 - Math.max(-len / 2, t), mid = (Math.max(-len / 2, t) + t1) / 2, y = y0 + (r + 0.5) * RH;
        if (w > 0.12 && !(skip && skip(mid, y))) B.add('box', SHADES[seed % 4], cx + (along ? mid : nOut * 0.012), y, cz + (along ? nOut * 0.012 : mid), along ? w - 0.04 : 0.05, RH - 0.045, along ? 0.05 : w - 0.04);
        t = t1;
      }
    }
  }
  function blocksRound(cx, cz, y0, r, h, from) {   /* round a tower: each block's face curves with the tower (Martin: "fix those tower bricks so they're rounded") */
    const rows = Math.floor(h / RH), n = Math.max(8, Math.round(2 * Math.PI * r / 0.95)), R = r + 0.03, kind = 'arc:' + n + ':' + R.toFixed(2);
    for (let rr = (from || 0); rr < rows; rr++) for (let k = 0; k < n; k++) {
      const a = (k + (rr % 2 ? 0.5 : 0)) / n * 2 * Math.PI, sh = SHADES[(k * 7 + rr * 3) % 4];
      B.add(kind, sh, cx, y0 + (rr + 0.5) * RH, cz, R, RH - 0.045, R, -a);
    }
  }
  function stoneBox(cx, cz, y0, wx, h, wz, courses, skipFace) {   /* a stone mass: mortar core, plinth, dressed blocks on all four faces */
    B.add('box', MORTAR, cx, y0 + h / 2, cz, wx, h, wz);
    B.add('box', COURSE, cx, y0 + 0.4, cz, wx + 0.3, 0.8, wz + 0.3);
    if (courses) {
      blocksFlat(cx, cz + wz / 2, true, wx, y0 + 0.8, h - 0.8, 1, skipFace && skipFace('s')); blocksFlat(cx, cz - wz / 2, true, wx, y0 + 0.8, h - 0.8, -1, skipFace && skipFace('n'));
      blocksFlat(cx + wx / 2, cz, false, wz, y0 + 0.8, h - 0.8, 1, skipFace && skipFace('e')); blocksFlat(cx - wx / 2, cz, false, wz, y0 + 0.8, h - 0.8, -1, skipFace && skipFace('w'));
    }
  }
  function castleWall(o) {
    const along = o.y === o.y2, a = Math.min(along ? o.x : o.y, along ? o.x2 : o.y2), b = Math.max(along ? o.x : o.y, along ? o.x2 : o.y2) + 1;
    const fixed = (along ? o.y : o.x) + 0.5, WHc = 4.6, T = 1.5, OUT = o.out ? (along ? o.out[1] : o.out[0]) : 0;
    const cuts = (o.gaps || []).map(([gx, gy]) => (along ? gx : gy) + 0.5).sort((p, q) => p - q);
    let segs = [[a, b]];
    for (const g of cuts) segs = [].concat(...segs.map(([l0, l1]) => g > l0 && g < l1 ? [[l0, g - 1.5], [g + 1.5, l1]] : [[l0, l1]]));
    for (const [l0, l1] of segs) {
      const len = l1 - l0; if (len < 0.3) continue; const mid = (l0 + l1) / 2, cx = along ? mid : fixed, cz = along ? fixed : mid;
      const y0 = hMin(along ? [[l0, fixed], [mid, fixed], [l1, fixed]] : [[fixed, l0], [fixed, mid], [fixed, l1]]) - 0.4;
      stoneBox(cx, cz, y0, along ? len : T, WHc, along ? T : len, true);
      B.add('box', CAP, cx, y0 + WHc + 0.03, cz, along ? len : T, 0.06, along ? T : len);   /* the paved walk */
      battlements(cx, cz, along, len, y0 + WHc, T, OUT);
      pickBox(cx, y0 + WHc / 2 + 0.3, cz, along ? len : 1.0, WHc + 0.6, along ? 1.0 : len, { along, fixed: along ? o.y : o.x });
      if (OUT && len > 12) for (let t = -len / 2 + 7; t < len / 2 - 5; t += 13) {   /* long banners down the outer face between the towers */
        const n = OUT * (T / 2 + 0.47), bx = cx + (along ? t : n), bz = cz + (along ? n : t);
        B.add('box', BANNER, bx, y0 + WHc - 1.55, bz, along ? 1.2 : 0.04, 2.9, along ? 0.04 : 1.2);
        B.add('box', 0xd8b04a, bx + (along ? 0 : OUT * 0.01), y0 + WHc - 1.2, bz + (along ? OUT * 0.01 : 0), along ? 0.55 : 0.04, 0.55, along ? 0.04 : 0.55);
        B.add('box', IRON2, bx, y0 + WHc - 0.08, bz, along ? 1.4 : 0.07, 0.07, along ? 0.07 : 1.4);
      }
    }
  }
  function towerRoof(cx, y, cz, r) { const kb = KitBatch(group); if (kb.add('Roof_Tower_RoundTiles', cx, y, cz, 0, (r + 0.35) / 2.75, (r + 0.35) / 2.75 * 0.85, (r + 0.35) / 2.75, TOWER_TINT)) kb.flush(); else B.add('cone', 0x8c3f2e, cx, y + r * 1.2, cz, 2 * r + 0.7, r * 2.4, 2 * r + 0.7); }
  function banner(x, y, z, ry) { B.add('cyl', IRON2, x, y + 1.3, z, 0.07, 2.6, 0.07); B.add('box', BANNER, x + Math.cos(ry) * 0.55, y + 2.1, z - Math.sin(ry) * 0.55, 1.0, 0.7, 0.04, ry); }
  function castleTower(o) {   /* a drum tower level with the wall walk (you walk round its top), a roofed turret rising from the middle */
    const cx = o.x + 0.5, cz = o.y + 0.5, r = o.r || 2.5, h = o.h || 8, rt = o.turret || Math.max(1.1, r - 1.2), WT = 4.6;
    const y0 = hMin([[cx - r, cz], [cx + r, cz], [cx, cz - r], [cx, cz + r], [cx, cz]]) - 0.4;
    B.add('cyl32', MORTAR, cx, y0 + WT / 2, cz, 2 * r, WT, 2 * r);
    B.add('cyl32', COURSE, cx, y0 + 0.5, cz, 2 * r + 0.5, 1.0, 2 * r + 0.5);
    blocksRound(cx, cz, y0, r, WT, 2);
    B.add('cyl32', CAP, cx, y0 + WT + 0.04, cz, 2 * r + 0.25, 0.08, 2 * r + 0.25);
    const rp = r + 0.2, ns = Math.max(24, Math.round(2 * Math.PI * rp / 0.36)), sw = 2 * Math.PI * rp / ns;
    for (let k = 0; k < ns; k++) {   /* the parapet ring stepping out on corbels, merlons with coping on every other stone, slits in some */
      const a = (k + 0.5) / ns * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      B.add('box', MORTAR, cx + ca * rp, y0 + WT + 0.47, cz + sa * rp, 0.4, 0.95, sw + 0.02, -a);
      B.add('box', CAP, cx + ca * (r + 0.12), y0 + WT - 0.2, cz + sa * (r + 0.12), 0.26, 0.32, 0.22, -a);
      if (k % 4 < 2) { B.add('box', SHADES[(k >> 2) % 4], cx + ca * rp, y0 + WT + 1.37, cz + sa * rp, 0.4, 0.85, sw + 0.03, -a); B.add('box', CAP, cx + ca * rp, y0 + WT + 1.83, cz + sa * rp, 0.48, 0.08, sw + 0.06, -a);
        if (k % 8 === 0) B.add('box', SLIT, cx + ca * (rp + 0.205), y0 + WT + 1.35, cz + sa * (rp + 0.205), 0.02, 0.42, 0.08, -a); }
      else B.add('box', CAP, cx + ca * rp, y0 + WT + 0.98, cz + sa * rp, 0.46, 0.06, sw + 0.04, -a);
    }
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.4; B.add('box', SLIT, cx + Math.cos(a) * (r - 0.0), y0 + 2.4, cz + Math.sin(a) * (r - 0.0), 0.1, 0.75, 0.14, -a); }
    const TH = Math.max(3, h - WT);   /* the turret */
    B.add('cyl32', MORTAR, cx, y0 + WT + TH / 2, cz, 2 * rt, TH, 2 * rt);
    blocksRound(cx, cz, y0 + WT, rt, TH, 0);
    B.add('cyl32', CAP, cx, y0 + WT + TH + 0.15, cz, 2 * rt + 0.5, 0.3, 2 * rt + 0.5);
    for (const da of [0.8, 0.8 + Math.PI]) {   /* its doors onto the walk: oak in a stone frame, both ways round */
      B.add('box', CAP, cx + Math.cos(da) * (rt + 0.02), y0 + WT + 1.0, cz + Math.sin(da) * (rt + 0.02), 0.08, 2.0, 1.05, -da);
      B.add('box', OAK, cx + Math.cos(da) * (rt + 0.07), y0 + WT + 0.92, cz + Math.sin(da) * (rt + 0.07), 0.06, 1.7, 0.8, -da);
    }
    towerRoof(cx, y0 + WT + TH + 0.3, cz, rt);
    pickBox(cx, y0 + WT / 2 + 0.3, cz, 2 * r, WT + 0.6, 2 * r, {});
    if (o.door) {   /* the door into the tower at the foot, on the yard side, standing open; tap it to go up through the tower onto the wall */
      const a = o.dtile ? Math.atan2(o.dtile[1] + 0.5 - cz, o.dtile[0] + 0.5 - cx) : Math.atan2(o.door[1], o.door[0]), ca = Math.cos(a), sa = Math.sin(a);
      B.add('box', CAP, cx + ca * (r + 0.03), y0 + 1.45, cz + sa * (r + 0.03), 0.1, 2.3, 1.45, -a);
      B.add('box', SLIT, cx + ca * (r + 0.06), y0 + 1.35, cz + sa * (r + 0.06), 0.04, 2.0, 1.1, -a);
      B.add('box', OAK, cx + ca * (r + 0.1), y0 + 1.3, cz + sa * (r + 0.1), 0.05, 1.9, 0.5, -a + 0.9);
      B.add('cyl12', CAP, cx + ca * (r + 0.05), y0 + 2.6, cz + sa * (r + 0.05), 1.45, 0.1, 1.45, -a, Math.PI / 2);
      if (o.ttile) pickBox(cx + ca * (r + 0.2), y0 + 1.4, cz + sa * (r + 0.2), 1.4, 2.6, 1.4, { x: o.ttile[0], y: o.ttile[1] });
    }
    if (h >= 9) banner(cx, y0 + WT + TH + 0.3 + (rt + 0.35) / 2.75 * 0.85 * 6.6, cz, 0.6);
  }
  function castleStair(o) {   /* a broad stone staircase you walk up: each tile a solid block at its height, capped, a parapet on the open side */
    for (const [x, y, lift, edge] of o.cells) {
      const cx = x + 0.5, cz = y + 0.5, yb = heightAt(cx, cz) - 0.15, h = lift + 0.15;
      B.add('box', (x + y) % 2 ? SHADES[0] : SHADES[2], cx, yb + h / 2, cz, 1.0, h, 1.0);
      B.add('box', CAP, cx, yb + h + 0.035, cz, 1.04, 0.07, 1.04);
      if (edge) { const ox = o.px * 0.42, oz = o.py * 0.42; B.add('box', MORTAR, cx + ox, yb + h + 0.42, cz + oz, o.px ? 0.16 : 1.0, 0.84, o.px ? 1.0 : 0.16); B.add('box', CAP, cx + ox, yb + h + 0.86, cz + oz, o.px ? 0.24 : 1.04, 0.06, o.px ? 1.04 : 0.24); }
      pickBox(cx, yb + h / 2 + 0.2, cz, 1.0, h + 0.4, 1.0, { x, y });
    }
  }
  function castleSteps(o) {   /* a flight up the inside of a wall: 8 solid steps over 3 tiles, from the foot tile to the wall top */
    const fz = o.y + 0.5, wallFace = o.wy > o.y ? o.y + 1 : o.y, rowZ = (o.y + 0.5 + wallFace) / 2 + (o.wy > o.y ? 0.0 : 0.0);
    const yb = heightAt(o.x + 0.5, fz) - 0.1, rise = 4.2 + 0.1;
    for (let k = 0; k < 8; k++) {
      const x = o.x + 0.5 + o.dx * (0.69 + k * 0.33), hk = (k + 1) * rise / 8;
      B.add('box', k % 2 ? SHADES[1] : SHADES[0], x, yb + hk / 2, fz, 0.34, hk, 0.95);
    }
  }
  function castleGate(o) {
    const along = o.dir === 'n' || o.dir === 's';   /* the wall runs along x for a north/south gate */
    const cx = o.x + 0.5, cz = o.y + 0.5, small = !!o.small, Wd = small ? 3.6 : 5.2, D = small ? 1.3 : 3.2, H = small ? 5.0 : 6.8, OP = small ? 1.7 : 1.9, OH = small ? 2.6 : 3.0;
    const y0 = hMin([[cx - 1, cz - 1], [cx + 1, cz + 1]]) - 0.4;
    const pier = (Wd - OP) / 2;
    for (const sgn of [-1, 1]) { const off = sgn * (OP / 2 + pier / 2); stoneBox(cx + (along ? off : 0), cz + (along ? 0 : off), y0, along ? pier : D, H, along ? D : pier, true); }
    B.add('box', STONE, cx, y0 + OH + (H - OH) / 2, cz, along ? OP : D, H - OH, along ? D : OP);
    B.add('box', CAP, cx, y0 + H + 0.04, cz, along ? Wd : D + 0.12, 0.08, along ? D + 0.12 : Wd);
    battlements(cx, cz, along, Wd, y0 + H, D, o.dir === 'n' || o.dir === 'w' ? -1 : 1);
    if (!small) for (const sgn of [-1, 1]) { const n = sgn * (D / 2 + 0.02); B.add('box', BANNER, cx + (along ? 0 : n), y0 + OH + 1.6, cz + (along ? n : 0), along ? 1.1 : 0.04, 2.0, along ? 0.04 : 1.1); B.add('box', 0xd8b04a, cx + (along ? 0 : n * 1.01), y0 + OH + 1.7, cz + (along ? n * 1.01 : 0), along ? 0.5 : 0.04, 0.5, along ? 0.04 : 0.5); }   /* banners over the arch, both faces */
    /* the portcullis, half raised, on the outer face, and the oak gates standing open inward */
    const out = o.dir === 'w' || o.dir === 'n' ? -1 : 1, face = out * (D / 2 - 0.12);
    for (let k = 0; k <= 4; k++) { const t = -OP / 2 + 0.1 + k * (OP - 0.2) / 4; B.add('box', IRON2, cx + (along ? t : face), y0 + OH - 0.18, cz + (along ? face : t), 0.06, 0.36, 0.06); }   /* the portcullis is up: only its spikes show under the arch */
    B.add('box', IRON2, cx + (along ? 0 : face), y0 + OH - 0.06, cz + (along ? face : 0), along ? OP - 0.1 : 0.06, 0.06, along ? 0.06 : OP - 0.1);
    for (const sgn of [-1, 1]) B.add('box', OAK, cx + (along ? sgn * (OP / 2 - 0.05) : -face * 0.6), y0 + OH / 2, cz + (along ? -face * 0.6 : sgn * (OP / 2 - 0.05)), along ? 0.08 : OP / 2, OH - 0.1, along ? OP / 2 : 0.08);
    if (!small) for (const sgn of [-1, 1]) { const off = sgn * (Wd / 2 - 0.2); banner(cx + (along ? off : -out * 0.2), y0 + H + 0.1, cz + (along ? -out * 0.2 : off), along ? 0 : Math.PI / 2); }
  }
  /* the walk-in keep (Martin: "the door on the keep is closed so I can't go inside of it"): scene.js building() lays the floors,
     the stairs between them and hides what is above you; this draws one storey's stone walls (windows both faces, the door
     gap on the ground floor) into that storey's group, and the keep's top into the roof group */
  function keepStorey(target, o, yb, H, f, door) {
    const Bk = ctx.Batcher(target), T = 0.8, x0 = o.x, z0 = o.y, x1 = o.x + o.w, z1 = o.y + o.h;
    const sides = [[x0, z0, x1, z0, 'n'], [x0, z1, x1, z1, 's'], [x0, z0, x0, z1, 'w'], [x1, z0, x1, z1, 'e']];
    const holes = { n: [], s: [], e: [], w: [] };   /* openings per face: [t0, t1, y0, y1] relative to the face's middle, kept clear of masonry */
    const kb = KitBatch(target);
    for (const [ax, az, bx, bz, sd] of sides) {
      const horiz = az === bz, L0 = horiz ? ax : az, L1 = horiz ? bx : bz, out = sd === 's' || sd === 'e' ? 1 : -1, fixed = horiz ? az : ax;
      const dpos = door && f === 0 && door.side === sd ? door.at : null;
      const segs = dpos != null ? [[L0, dpos - 0.9], [dpos + 0.9, L1]] : [[L0, L1]];
      for (const [l0, l1] of segs) {
        const len = l1 - l0; if (len < 0.1) continue; const mid = (l0 + l1) / 2, cx = horiz ? mid : fixed - out * T / 2, cz = horiz ? fixed - out * T / 2 : mid;
        Bk.add('box', MORTAR, cx, yb + H / 2, cz, horiz ? len + T : T, H, horiz ? T : len + T);
      }
      if (dpos != null) {   /* the door: a stone frame, the oak door standing open inward, three steps out to the yard */
        const cx = horiz ? dpos : fixed - out * T / 2, cz = horiz ? fixed - out * T / 2 : dpos, fx = horiz ? 0 : out, fz = horiz ? out : 0;
        Bk.add('box', MORTAR, cx, yb + 2.6 + (H - 2.6) / 2, cz, horiz ? 1.8 : T, H - 2.6, horiz ? T : 1.8);
        Bk.add('box', CAP, cx + fx * 0.06, yb + 2.7, cz + fz * 0.06, horiz ? 2.3 : T + 0.14, 0.24, horiz ? T + 0.14 : 2.3);
        for (const sg of [-1, 1]) Bk.add('box', CAP, (horiz ? dpos + sg * 1.0 : cx + fx * 0.06), yb + 1.3, (horiz ? cz + fz * 0.06 : dpos + sg * 1.0), horiz ? 0.22 : T + 0.14, 2.6, horiz ? T + 0.14 : 0.22);
        Bk.add('box', OAK, (horiz ? dpos - 0.75 : cx - fx * (T / 2 + 0.45)), yb + 1.2, (horiz ? cz - fz * (T / 2 + 0.45) : dpos - 0.75), horiz ? 0.08 : 0.9, 2.3, horiz ? 0.9 : 0.08);
        for (let k = 0; k < 3; k++) Bk.add('box', COURSE, cx + fx * (T / 2 + 0.3 + (2 - k) * 0.3), yb - 0.35 + k * 0.17, cz + fz * (T / 2 + 0.3 + (2 - k) * 0.3), horiz ? 2.4 : 0.3 + (2 - k) * 0.6, 0.3, horiz ? 0.3 + (2 - k) * 0.6 : 2.4);
        holes[sd].push([dpos - 1.15 - (L0 + L1) / 2, dpos + 1.15 - (L0 + L1) / 2, yb - 1, yb + 2.85]);
      }
      /* windows: frame and glass on both faces, a dark reveal between */
      const n = Math.max(1, Math.floor((L1 - L0 - 3) / 2.4)), ry = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[sd], nx = Math.sin(ry), nz = Math.cos(ry);
      for (let k = 0; k < n; k++) {
        const t = L0 + 1.5 + (k + 0.5) * (L1 - L0 - 3) / n; if (dpos != null && Math.abs(t - dpos) < 1.6) continue;
        const px = horiz ? t : fixed, pz = horiz ? fixed : t, fy = yb + (f === 0 ? 0.6 : 0.3), S6 = 0.62;
        holes[sd].push([t - (L0 + L1) / 2 - 0.5, t - (L0 + L1) / 2 + 0.5, fy + S6 * 0.95, fy + S6 * 2.8]);
        Bk.add('box', SLIT, px - nx * T / 2, fy + S6 * 1.62, pz - nz * T / 2, horiz ? S6 * 1.1 : T + 0.02, S6 * 1.2, horiz ? T + 0.02 : S6 * 1.1);
        kb.add('Window_Wide_Round1', px + nx * 0.07, fy, pz + nz * 0.07, ry, S6, S6, S6, null);
        kb.add('Window_Wide_Round1', px - nx * (T + 0.07), fy, pz - nz * (T + 0.07), ry + Math.PI, S6, S6, S6, null);
      }
    }
    /* masonry on the outer faces of this storey */
    const cxk = x0 + o.w / 2, czk = z0 + o.h / 2;
    const B0 = B; ctx.useB(Bk);
    const sk = sd => (t, y) => holes[sd].some(([a, b, c, d]) => t > a && t < b && y > c && y < d);
    blocksFlat(cxk, z1, true, o.w, yb, H, 1, sk('s')); blocksFlat(cxk, z0, true, o.w, yb, H, -1, sk('n')); blocksFlat(x1, czk, false, o.h, yb, H, 1, sk('e')); blocksFlat(x0, czk, false, o.h, yb, H, -1, sk('w'));
    ctx.useB(B0);
    Bk.finish(); kb.flush();
  }
  function keepTop(target, o, ytop) {   /* everything above the top storey: battlements, corner turrets, banners, the donjon */
    const Bk = ctx.Batcher(target), B0 = B; ctx.useB(Bk);
    const x0 = o.x, z0 = o.y, cx = x0 + o.w / 2, cz = z0 + o.h / 2, H = ytop - o._y0;
    B.add('box', CAP, cx, ytop + 0.05, cz, o.w + 0.25, 0.1, o.h + 0.25);
    keepCrown(o, x0, z0, cx, cz, o._y0, H);
    ctx.useB(B0); Bk.finish();
    keepTurrets(o, x0, z0, o._y0, H);   /* the turrets with the castle: seen from inside too */
  }
  function keepCrown(o, x0, z0, cx, cz, y0, H) {   /* the keep's top: battlements over corbels, hanging banners, the donjon (or a banner) */
    for (const [len, along, ox, oz, out] of [[o.w, true, 0, -o.h / 2, -1], [o.w, true, 0, o.h / 2, 1], [o.h, false, -o.w / 2, 0, -1], [o.h, false, o.w / 2, 0, 1]]) {
      battlements(cx + ox - (along ? 0 : out * 0.3), cz + oz - (along ? out * 0.3 : 0), along, len - 2.6, y0 + H, 0.6, out);   /* the keep's own battlements over corbels */
      /* long hanging banners, red with a gold charge, between the windows */
      for (const t of [-len / 4, len / 4]) { const bx = cx + ox + (along ? t : out * 0.06), bz = cz + oz + (along ? out * 0.06 : t); B.add('box', BANNER, bx, y0 + H - 2.2, bz, along ? 1.3 : 0.04, 4.0, along ? 0.04 : 1.3); B.add('box', 0xd8b04a, bx + (along ? 0 : out * 0.01), y0 + H - 1.6, bz + (along ? out * 0.01 : 0), along ? 0.6 : 0.04, 0.6, along ? 0.04 : 0.6); B.add('box', IRON2, bx, y0 + H - 0.15, bz, along ? 1.5 : 0.08, 0.08, along ? 0.08 : 1.5); }
    }
    if (o.donjon) {   /* the great donjon rising out of the keep's roof: dressed stone on corbels, a ring of battlements, a great conical roof */
      const r = o.donjon.r, h = o.donjon.h, yb = y0 + H;
      B.add('cyl32', MORTAR, cx, yb + h / 2, cz, 2 * r, h, 2 * r); blocksRound(cx, cz, yb, r, h, 0);
      B.add('cyl32', CAP, cx, yb + h + 0.04, cz, 2 * r + 0.3, 0.08, 2 * r + 0.3);
      const rp = r + 0.25, ns = Math.round(2 * Math.PI * rp / 0.36), sw = 2 * Math.PI * rp / ns;
      for (let k = 0; k < ns; k++) { const a = (k + 0.5) / ns * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
        B.add('box', MORTAR, cx + ca * rp, yb + h + 0.47, cz + sa * rp, 0.4, 0.95, sw + 0.02, -a);
        B.add('box', CAP, cx + ca * (r + 0.14), yb + h - 0.2, cz + sa * (r + 0.14), 0.28, 0.34, 0.22, -a);
        if (k % 4 < 2) { B.add('box', SHADES[(k >> 2) % 4], cx + ca * rp, yb + h + 1.37, cz + sa * rp, 0.4, 0.85, sw + 0.03, -a); B.add('box', CAP, cx + ca * rp, yb + h + 1.83, cz + sa * rp, 0.48, 0.08, sw + 0.06, -a); }
        if (k % 6 === 0) { B.add('box', SLIT, cx + ca * (r + 0.01), yb + h * 0.55, cz + sa * (r + 0.01), 0.04, 1.1, 0.16, -a); } }
      const rt2 = r - 1.0;
      B.add('cyl32', MORTAR, cx, yb + h + 2.0, cz, 2 * rt2, 4.0, 2 * rt2); blocksRound(cx, cz, yb + h, rt2, 4.0, 0);
      B.add('cyl32', CAP, cx, yb + h + 4.15, cz, 2 * rt2 + 0.5, 0.3, 2 * rt2 + 0.5);
      towerRoof(cx, yb + h + 4.3, cz, rt2 + 0.3);
      banner(cx, yb + h + 4.3 + (rt2 + 0.65) / 2.75 * 0.85 * 6.6, cz, 0.3);
    } else banner(cx, y0 + H + 0.1, cz, 0.3);
  }
  function keepTurrets(o, x0, z0, y0, H) {   /* the corner turrets, from the ground to above the battlements */
    /* corner turrets rising above the roof, each with the tower roof */
    for (const [tx, tz] of [[x0, z0], [x0 + o.w, z0], [x0, z0 + o.h], [x0 + o.w, z0 + o.h]]) {
      B.add('cyl32', STONE, tx, y0 + (H + 2.4) / 2, tz, 2.6, H + 2.4, 2.6);
      for (let hh = 1.6; hh < H + 2; hh += 1.2) B.add('cyl32', COURSE, tx, y0 + hh, tz, 2.65, 0.07, 2.65);
      B.add('cyl32', CAP, tx, y0 + H + 2.6, tz, 3.1, 0.35, 3.1);
      towerRoof(tx, y0 + H + 2.75, tz, 1.3);
    }
  }
  function castleKeep(o) {
    const x0 = o.x, z0 = o.y, cx = x0 + o.w / 2, cz = z0 + o.h / 2, FLc = o.floors || 3, H = FLc * 3.2;
    const y0 = hMin([[x0, z0], [x0 + o.w, z0], [x0, z0 + o.h], [x0 + o.w, z0 + o.h], [cx, cz]]) - 0.4;
    stoneBox(cx, cz, y0, o.w, H, o.h, true);
    B.add('box', CAP, cx, y0 + H + 0.05, cz, o.w + 0.25, 0.1, o.h + 0.25);
    keepCrown(o, x0, z0, cx, cz, y0, H);
    /* windows on every floor: a dark recess with the kit's frame and glass */
    const kb = KitBatch(group);
    for (const [len, ry, fx, fz] of [[o.w, Math.PI, 0, -o.h / 2], [o.w, 0, 0, o.h / 2], [o.h, -Math.PI / 2, -o.w / 2, 0], [o.h, Math.PI / 2, o.w / 2, 0]]) {
      const n = Math.max(1, Math.floor((len - 3) / 2.4)), horiz = fx === 0, nx = Math.sin(ry), nz = Math.cos(ry);
      for (let f = 0; f < FLc; f++) for (let k = 0; k < n; k++) {
        const t = -len / 2 + 1.5 + (k + 0.5) * (len - 3) / n, px = cx + fx + (horiz ? t : 0), pz = cz + fz + (horiz ? 0 : t), py = y0 + f * 3.2 + (f === 0 ? 0.8 : 0.4);
        if (f === 0 && o.door && Math.abs((horiz ? px : pz) - (horiz ? o.door[0] + 0.5 : -1e9)) < 1.5 && Math.abs(pz - (o.door[1] === o.y ? z0 : z0 + o.h)) < 0.6) continue;   /* the door's place */
        /* the opening behind the frame: Window_Wide_Round1's glass is 1.1 x 1.2 kit units with a round head of radius 0.55 at 2.2; at 0.62 scale */
        const fy = py - 0.15, S6 = 0.62;
        B.add('box', SLIT, px + nx * 0.04, fy + S6 * 1.62, pz + nz * 0.04, horiz ? S6 * 1.1 : 0.04, S6 * 1.2, horiz ? 0.04 : S6 * 1.1);
        B.add('cyl32', SLIT, px + nx * 0.04, fy + S6 * 2.2, pz + nz * 0.04, S6 * 1.1, 0.04, S6 * 1.1, ry, Math.PI / 2);
        kb.add('Window_Wide_Round1', px + nx * 0.07, fy, pz + nz * 0.07, ry, S6, S6, S6, null);
      }
    }
    kb.flush();
    keepTurrets(o, x0, z0, y0, H);
    /* the door: an oak door in a stone frame on the north face, steps up to it */
    const south = o.door && o.door[1] === o.y + o.h - 1, sg = south ? 1 : -1, dx = o.door ? o.door[0] + 0.5 : cx, dz = south ? z0 + o.h : z0;
    B.add('box', SLIT, dx, y0 + 1.75, dz + sg * 0.03, 1.7, 2.5, 0.08); B.add('box', OAK, dx, y0 + 1.6, dz + sg * 0.07, 1.4, 2.2, 0.06); B.add('box', CAP, dx, y0 + 3.05, dz + sg * 0.1, 2.1, 0.3, 0.2);
    for (let k = 0; k < 3; k++) B.add('box', COURSE, dx, y0 + 0.15 + k * 0.17, dz + sg * (0.35 + (2 - k) * 0.3), 2.4, 0.3, 0.3 + (2 - k) * 0.6);
  }
    return { wall: castleWall, tower: castleTower, gate: castleGate, keep: castleKeep, steps: castleSteps, stair: castleStair, keepStorey, keepTop };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('castle', { api: API, v: 1 }, () => ({ api: API, create }));
  if (typeof module !== 'undefined' && module.exports) module.exports = { api: API, create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
