/* ASHVALE: THE LILY RUN - the rules (2026-10-19: a mini game on the trail into Saltmere where your Doginal Frog
   crosses a road and a river to the lily-pad homes; a leaderboard of scores). Pure logic, no drawing, no clock of its own:
   the engine part (englily.js) feeds it time and hops, and draws what it says. Everything a lane holds is a function of the
   time since its level began, so anyone watching draws the very same carts, logs and turtles from {lv, lt0}.
   Board: 13 columns x 13 rows, one hop a cell. Row 0 the start bank, 1-5 road, 6 the grass strip, 7-11 river, 12 the homes. */
(function (G) {
  'use strict';
  const COLS = 13, ROWS = 13, HOMES = [1, 4, 6, 8, 11], TIME = 30, LIVES = 3, HOP = 0.2;
  /* what can hit what, in cells, matched to what is drawn (the operator: a cart that had already gone by still ran his frog over):
     a cart's body is 86% of its length, centred; the frog is about 0.4 of a cell wide. A piece spans cells [x, x + len); the frog in
     column c is drawn at the MIDDLE of its cell, c + 0.5 (the operator again 2026-10-19: comparing c itself put every cart half a cell early) */
  const BODY = 0.86, FROG = 0.2;
  /* lanes, bottom to top: dir (+1 = to the right), cells a second at level 1, the period the pattern repeats over, and its
     pieces [start, length] (a cart or a log; turtles are groups that sometimes dive) */
  const LANES = {
    1: { k: 'cart', dir: -1, v: 1.1, P: 16, at: [[0, 1], [5, 1], [10, 1]], look: 0 },
    2: { k: 'cart', dir: 1, v: 0.9, P: 15, at: [[1, 1], [6, 1], [11, 1]], look: 1 },
    3: { k: 'cart', dir: -1, v: 1.9, P: 18, at: [[2, 1], [11, 1]], look: 2 },
    4: { k: 'cart', dir: 1, v: 1.3, P: 16, at: [[0, 1], [8, 1]], look: 3 },
    5: { k: 'wagon', dir: -1, v: 0.8, P: 18, at: [[1, 2], [8, 2], [14, 2]], look: 4 },
    7: { k: 'turtle', dir: -1, v: 1.0, P: 16, at: [[0, 3], [5, 3], [10, 3]], dive: [1] },
    8: { k: 'log', dir: 1, v: 0.7, P: 17, at: [[0, 3], [6, 3], [12, 3]] },
    9: { k: 'log', dir: 1, v: 1.5, P: 20, at: [[0, 6], [10, 6]] },
    10: { k: 'turtle', dir: -1, v: 1.2, P: 15, at: [[0, 2], [5, 2], [10, 2]], dive: [2] },
    11: { k: 'log', dir: 1, v: 1.0, P: 18, at: [[0, 4], [8, 4], [14, 3]] }
  };
  const ROAD = r => r >= 1 && r <= 5, RIVER = r => r >= 7 && r <= 11;
  const speed = lv => 1 + 0.15 * (Math.max(1, lv) - 1);
  const mod = (a, n) => ((a % n) + n) % n;
  /* where each piece of a lane is at t seconds into level lv: [{x (left edge, cells), len, sunk}] - x may run off either side */
  function pieces(row, t, lv) {
    const L = LANES[row]; if (!L) return [];
    const shift = L.dir * L.v * speed(lv) * t, out = [];
    for (let i = 0; i < L.at.length; i++) {
      const [s, len] = L.at[i]; let x = mod(s + shift, L.P); if (x > COLS) x -= L.P;   /* a piece wraps through the hidden part of the period */
      let sunk = 0;
      if (L.dive && L.dive.indexOf(i) >= 0) { const c = mod(t + i * 1.7, 7); sunk = c < 4.5 ? 0 : c < 5 ? (c - 4.5) / 0.5 : c < 6.3 ? 1 : 1 - (c - 6.3) / 0.7; }   /* a diving group: under for about 1.3 s of every 7 */
      out.push({ x, len, sunk, i });
    }
    return out;
  }
  const laneV = (row, lv) => { const L = LANES[row]; return L ? L.dir * L.v * speed(lv) : 0; };
  /* a new game: the state the engine keeps and sends (small) */
  function newGame(now) { return { c: 6, r: 0, lv: 1, lt0: now, s: 0, l: LIVES, h: 0, best: 0, timer: TIME, dead: 0, deadKind: '', hop: null, over: false, t0: now, extra: false, homesTotal: 0 }; }
  function respawn(g, now) { g.c = 6; g.r = 0; g.best = 0; g.timer = TIME; g.dead = 0; g.deadKind = ''; g.hop = null; }
  /* a hop: dc/dr of -1/0/+1; refused while hopping or dead; the frog stays on the board */
  function hop(g, dc, dr) {
    if (g.over || g.dead || g.hop) return false;
    const c = Math.round(g.c * 4) / 4, nc = c + dc, nr = g.r + dr;
    if (nr < 0 || nr > ROWS - 1 || nc < 0 || nc > COLS - 1) return false;
    g.hop = { fc: g.c, fr: g.r, tc: nc, tr: nr, u: 0 };
    return true;
  }
  /* advance by dt at wall time now (ms); returns the events of this step: hop, land, ride, score, home, die, level, over */
  function step(g, dt, now) {
    const ev = [];
    if (g.over) return ev;
    const t = (now - g.lt0) / 1000;
    if (g.dead) { g.dead -= dt; if (g.dead <= 0) { if (g.l <= 0) { g.over = true; ev.push({ e: 'over', s: g.s }); } else { respawn(g, now); ev.push({ e: 'respawn' }); } } return ev; }
    g.timer -= dt;
    if (g.timer <= 0) return die(g, 'time', ev);
    if (g.hop) {
      const H = g.hop; H.u = Math.min(1, H.u + dt / HOP);
      g.c = H.fc + (H.tc - H.fc) * H.u; g.r = H.u < 1 ? H.fr : H.tr;
      if (RIVER(H.fr) && H.u < 1) { H.fc += laneV(H.fr, g.lv) * dt; H.tc += laneV(H.fr, g.lv) * dt; }   /* leaving a log, it carries you a little */
      if (H.u >= 1) {
        g.hop = null; g.c = H.tc; g.r = H.tr; ev.push({ e: 'land', c: g.c, r: g.r });
        if (g.r > g.best) { g.s += 10 * (g.r - g.best); g.best = g.r; ev.push({ e: 'score', n: 10 }); }
        if (g.r === ROWS - 1) return reachHome(g, ev, now);
      }
    }
    const row = g.hop ? Math.round(g.hop.fr + (g.hop.tr - g.hop.fr) * g.hop.u) : g.r;   /* the row the frog is over now, mid-hop too */
    if (ROAD(row)) { for (const p of pieces(row, t, g.lv)) { const a = p.x + p.len * (1 - BODY) / 2, b = p.x + p.len * (1 + BODY) / 2; if (g.c + 0.5 + FROG > a && g.c + 0.5 - FROG < b) return die(g, 'squash', ev, row); } }
    if (!g.hop || g.hop.u > 0.5) {
      if (ROAD(g.r)) { /* carts: checked above, every frame */ }
      else if (RIVER(g.r) && !g.hop) {
        let on = null; for (const p of pieces(g.r, t, g.lv)) if (p.sunk < 0.6 && g.c + 0.5 + 0.2 > p.x && g.c + 0.5 - 0.2 < p.x + p.len) { on = p; break; }
        if (!on) return die(g, 'splash', ev);
        g.c += laneV(g.r, g.lv) * dt;   /* riding */
        if (g.c < -0.4 || g.c > COLS - 0.6) return die(g, 'swept', ev);
      }
    }
    return ev;
  }
  function reachHome(g, ev, now) {
    const c = Math.round(g.c); let k = -1;
    for (let i = 0; i < HOMES.length; i++) if (Math.abs(g.c - HOMES[i]) < 0.45) k = i;
    if (k < 0 || (g.h & (1 << k))) return die(g, k < 0 ? 'bank' : 'taken', ev);
    g.h |= 1 << k; g.homesTotal++;
    const bonus = 50 + 10 * Math.floor(Math.max(0, g.timer) * 2);
    g.s += bonus; ev.push({ e: 'home', k, n: bonus });
    if (!g.extra && g.s >= 10000) { g.extra = true; g.l++; ev.push({ e: 'life' }); }
    if (g.h === 31) { g.s += 1000; g.lv++; g.h = 0; g.lt0 = now; ev.push({ e: 'level', lv: g.lv, n: 1000 }); }
    respawn(g, now);
    return ev;
  }
  function die(g, kind, ev, row) {
    ev.push({ e: 'die', kind, l: g.l - 1, r: row == null ? g.r : row, c: g.c });   /* where it happened (before the hop is forgotten) */
    g.l--; g.dead = 1.3; g.deadKind = kind; g.hop = null;
    return ev;
  }
  /* the most a run of this length could score (the Bank refuses anything above it): every home at full time on every level */
  const maxFor = ms => Math.floor(2000 + (ms / 1000) * 450);   /* ~770 a home at most, and no home takes under 2 s of hops */
  const API = { COLS, ROWS, HOMES, TIME, LIVES, HOP, BODY, FROG, LANES, ROAD, RIVER, pieces, laneV, newGame, hop, step, maxFor, speed };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('lilyrules', { api: 1, v: 1, needs: {} }, () => API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
