/* ASHVALE worldgen part: sites (module wg_sites, api 1): stone circles, ruins, standing stones, rock outcrops, monster
   camps, ore and fishing spots. Pure and deterministic; numbers in wg_tables (sites, camps, ore, fish).
   One candidate per T.sites.cell (112 m) square of a face's plane, kept T.sites.inset (70 m) inside the face and away
   from set pieces; the cell CLASS at the candidate picks the type (cumulative chances per class). Camps are levelled by
   the distance from the core centre (T.camps.ladder: rats near the vale, bandits far out; wild land counts as further).
   attach(ctx) adds:
     siteOf(f, sx, sy)                  the site record of site square (sx, sy) of face f, or null (cached)
     sites(face, gx0, gy0, gx1, gy1)    game records of every site whose centre tile is in the rect (see worldgen.js)
   A site's footprint is a map of game tiles to letters (K stones, r rocks, ore letters, X tents, d dirt) that the tile
   rules read first. Ids are stable: 'w1:<face>:<cell>:<sx>.<sy>' (fishing 'w1:<face>:f<qx>.<qy>'), monster uid = id:k. */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1, needs: { wg_geo: 1 } };
  const CLS = ['creator', 'core', 'wild', 'sea', 'peak'];
  function attach(ctx) {
    const g = ctx.geo, T = ctx.T, ST = T.sites, CA = T.camps, SITE = ST.cell, u01 = g.u01, mix32 = g.mix32, hash3 = g.hash3;
    const cache = new Map();
    const SB = new Float64Array(6), SU = new Float64Array(3), tmp = ctx.newSample();
    const tkey = (gx, gy) => (gx + 1048576) * 2097152 + (gy + 1048576);
    ctx.tkey = tkey;
    function pick(ladder, d, roll) { for (const e of ladder) if (d < e[0]) return e.length > 2 ? e[1 + Math.floor(roll * (e.length - 1))] : e[1]; return ladder[ladder.length - 1][1]; }
    function siteOf(f, gx, gy) {
      const key = (f * 4096 + (gx & 4095)) * 4096 + (gy & 4095);
      const hit = cache.get(key); if (hit !== undefined) return hit;
      let res = null;
      const hv = hash3(gx, gy, (f * 7919) ^ ctx.S.st);
      const px = (gx + 0.2 + 0.6 * ((hv & 0xffff) / 65536)) * SITE, py = (gy + 0.2 + 0.6 * ((hv >>> 16) / 65536)) * SITE;
      ctx.foldInto(f, px, py, SB);
      let near = false;
      for (const pc of ctx.PIECES) if (pc.face === f && ctx.pieceDist(pc, px, py) < ST.keepFromPieces) near = true;
      const inset = ST.inset / ctx.HGT;
      if (!near && SB[0] === f && SB[3] > inset && SB[4] > inset && SB[5] > inset) {
        ctx.bary2sphere(f, SB[3], SB[4], SB[5], SU);
        const c = ctx.nearest(SU[0], SU[1], SU[2]), cl = ctx.CODES[c];
        const roll = u01(mix32(hv ^ 0x5bd1e995)), r3 = u01(mix32(hv ^ 0x2545f491));
        ctx.landInto(f, px, py, SB, tmp, true);
        const dk = ctx.coreDistU(SU[0], SU[1], SU[2]);
        let type = '';
        for (const e of (ST[CLS[cl]] || [])) if (roll < e[1]) { if (!(e[2] === 'hills' && tmp.hills <= e[3])) type = e[0]; break; }
        if (type && tmp.h > ctx.WATER + 0.45 && tmp.peakS < 0.01 && tmp.pond < 0.01 && tmp.piece === 0) {
          res = { id: 'w1:' + f + ':' + c + ':' + gx + '.' + gy, face: f, type, x: px, y: py, base: tmp.h, r: type === 'standing_stone' ? 5 : 12, cls: cl, cell: c, dk, foot: new Map(), objects: [], nodes: [], level: 0 };
          build(res, hv, r3);
        }
      }
      if (cache.size > 4096) cache.clear();
      cache.set(key, res);
      return res;
    }
    function build(res, hv, r3) {
      const px = res.x, py = res.y, foot = res.foot, type = res.type;
      const put = (x, y, L) => { foot.set(tkey(Math.floor(x), Math.floor(-y)), L); };
      const dirt = r => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) put(px + dx, py + dy, 'd'); };
      if (type === 'stones') {
        const n = 7 + (hv % 4), rad = 6 + (hv >>> 8) % 3;
        for (let k = 0; k < n; k++) { const a = k / n; if (u01(mix32(hv + k)) >= 0.12) put(px + g.ccos(a) * rad, py + g.csin(a) * rad, 'K'); }
        put(px, py, 'K');
      } else if (type === 'ruin') {
        const L = 5 + (hv % 4), W = 4 + ((hv >>> 4) % 3), rot = ((hv >>> 9) % 4) / 4, cr = g.ccos(rot), sr = g.csin(rot);
        const wall = (lx, ly, k) => { if (u01(mix32(hv ^ (k * 977))) >= 0.3) put(px + cr * lx - sr * ly, py + sr * lx + cr * ly, 'K'); };
        for (let k = 0; k <= L; k++) wall(-L / 2 + k, -W / 2, k);
        for (let k = 1; k <= W; k++) wall(-L / 2, -W / 2 + k, 100 + k);
        for (let k = 1; k <= L / 2; k++) wall(-L / 2 + k, W / 2, 200 + k);
      } else if (type === 'standing_stone') put(px, py, 'K');
      else if (type === 'outcrop') { for (let k = 0; k < 6; k++) { const a = k / 6 + r3 * 0.1, rr = 1 + 2.5 * u01(mix32(hv ^ (k * 4099))); put(px + g.ccos(a) * rr, py + g.csin(a) * rr, 'r'); } put(px, py, 'r'); }
      else if (type === 'ore') {
        dirt(4);
        let set = 'RN', lv = 1; for (const e of T.ore) if (res.dk < e[0]) { set = e[1]; lv = e[2]; break; }
        const n = 3 + (hv % 4);
        for (let k = 0; k < n; k++) {
          const a = k / n + r3 * 0.2, rr = 1.6 + 1.8 * u01(mix32(hv ^ (k * 6007))), L = set[(hv >>> (k + 3)) % set.length], x = px + g.ccos(a) * rr, y = py + g.csin(a) * rr;
          put(x, y, L); res.nodes.push({ x: Math.floor(x), y: Math.floor(-y), t: L });
        }
        res.level = lv;
      } else if (type === 'camp') {
        const d = res.dk + (res.cls === 2 ? CA.wildShift : 0), m = pick(CA.ladder, d, r3);
        res.monster = m; res.level = CA.level[m] || 1;
        const sz = CA.size[m] || [3, 2];
        res.spawnN = sz[0] + (hv % sz[1]);
        res.spawnCand = [];
        for (let k = 0; k < 16; k++) { const a = k / 16 + r3 * 0.05, rr = 2.5 + 2.5 * u01(mix32(hv ^ (k * 911))); res.spawnCand.push([px + g.ccos(a) * rr, py + g.csin(a) * rr]); }
        if (CA.tents.indexOf(m) >= 0) {
          dirt(3);
          const nt = 2 + (hv % 2);
          for (let k = 0; k < nt; k++) {
            const a = k / nt + 0.1 + r3 * 0.2, tx = Math.floor(px + g.ccos(a) * 5.5), ty = Math.floor(-(py + g.csin(a) * 5.5));
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) foot.set(tkey(tx + dx, ty + dy), 'X');
            res.objects.push({ k: 'tent', x: tx, y: ty, w: 2, h: 2 });
          }
          res.objects.push({ k: 'campfire', x: Math.floor(px), y: Math.floor(-py), w: 1, h: 1 });
          if (m === 'bandit' && res.dk > CA.leaderFrom && r3 < CA.leaderChance) res.leader = true;
        } else if (m === 'wolf') { put(px + 1.5, py + 0.5, 'r'); put(px - 1, py - 1.5, 'r'); }
      }
    }
    function record(st) {
      const out = { id: st.id, face: st.face, kind: st.type, x: Math.floor(st.x), y: Math.floor(-st.y), level: st.level, cls: CLS[st.cls], spawns: [], objects: st.objects.slice(), nodes: st.nodes.slice(), fishing: [] };
      if (st.type === 'camp') {
        out.monster = st.monster;
        let k = 0;
        for (const [x, y] of st.spawnCand) {
          if (out.spawns.length >= st.spawnN + (st.leader ? 1 : 0)) break;
          const gx = Math.floor(x), gy = Math.floor(-y);
          if (ctx.BLOCK.indexOf(ctx.tileTrue(st.face, gx, gy)) >= 0 || out.spawns.some(s => s.x === gx && s.y === gy)) continue;
          const m = st.leader && out.spawns.length === 0 ? 'bandit_leader' : st.monster, sp = { m, x: gx, y: gy, uid: st.id + ':' + k };
          if (m === 'bandit' && u01(mix32(hash3(gx, gy, 77))) < CA.archerChance) sp.carry = { arrows_t1: 10 + (k % 3) };
          if (m === 'bandit_leader') sp.carry = { potion: 1 };
          out.spawns.push(sp); k++;
        }
      }
      return out;
    }
    function fishFor(dk, sea, r) {
      for (const e of (sea ? T.fish.sea : T.fish.fresh)) if (dk > e[0] && r < e[1]) return e[2];
      return T.fish.default;
    }
    function sites(face, gx0, gy0, gx1, gy1) {
      const list = [], x0 = gx0, x1 = gx1 + 1, y0 = -gy1 - 1, y1 = -gy0, FI = T.fish.cell;
      for (let sy = Math.floor(y0 / SITE); sy <= Math.floor(y1 / SITE); sy++) for (let sx = Math.floor(x0 / SITE); sx <= Math.floor(x1 / SITE); sx++) {
        const st = siteOf(face, sx, sy); if (!st) continue;
        const tx = Math.floor(st.x), ty = Math.floor(-st.y);
        if (tx >= gx0 && tx <= gx1 && ty >= gy0 && ty <= gy1) list.push(record(st));
      }
      for (let qy = Math.floor(y0 / FI); qy <= Math.floor(y1 / FI); qy++) for (let qx = Math.floor(x0 / FI); qx <= Math.floor(x1 / FI); qx++) {
        const hv = hash3(qx, qy, (face * 31) ^ ctx.S.fi);
        if (u01(hv) > T.fish.chance) continue;
        const gx = Math.floor((qx + 0.15 + 0.7 * ((hv & 0xffff) / 65536)) * FI), gy = Math.floor(-(qy + 0.15 + 0.7 * ((hv >>> 16) / 65536)) * FI);
        if (gx < gx0 || gx > gx1 || gy < gy0 || gy > gy1) continue;
        ctx.foldInto(face, gx + 0.5, -gy - 0.5, SB); if (SB[0] !== face) continue;
        if (ctx.tileTrue(face, gx, gy) !== '~') continue;
        let land = false;
        for (let k = 0; k < 4; k++) { const L = ctx.tileTrue(face, gx + (k === 0 ? 1 : k === 1 ? -1 : 0), gy + (k === 2 ? 1 : k === 3 ? -1 : 0)); if (L !== '~' && ctx.BLOCK.indexOf(L) < 0) land = true; }
        if (!land) continue;
        const s = ctx.landInto(face, gx + 0.5, -gy - 0.5, SB, tmp, ctx.PIECES.length > 0);
        const fr = fishFor(ctx.coreDistU(s.ux, s.uy, s.uz), s.w[3] > 0.3, u01(mix32(hv ^ 99)));
        list.push({ id: 'w1:' + face + ':f' + qx + '.' + qy, face, kind: 'fishing', x: gx, y: gy, level: fr.req || 1, cls: CLS[s.cls], spawns: [], objects: [], nodes: [], fishing: [Object.assign({ x: gx, y: gy }, fr)] });
      }
      return list;
    }
    Object.assign(ctx, { siteOf, sites, clearSites: () => cache.clear() });
    return ctx;
  }
  const api = { api: 1, attach };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('wg_sites', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
