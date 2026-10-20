/* ASHVALE: THE SALTMERE LINKS - the rules (2026-10-19: an 18-hole course north-east of Saltmere with a clubhouse,
   rounds for several players, club sets from the pro shop and wagers). Pure logic, no drawing and no clock: the engine part
   gives it the course, the ball and the swing, and draws the path it returns. A shot is a pure function of its inputs, so
   every player and watcher who gets the same swing draws the very same flight, bounce and roll.
   Units: metres (1 tile = 1 m); the HUD shows yards as metres x course.yd (4), so the course reads like a full-size one.
   Course ground letters (data/golf.course.json, half-metre cells): t tee, f fairway, e fringe, g green, r rough,
   h heavy rough, s sand, w water, o out of bounds. */
(function (G) {
  'use strict';
  /* clubs: carry at full power with the Standard set (m), loft (deg) and how far it runs after landing (share of the carry) */
  const CLUBS = [
    { id: '1W', name: 'Driver', carry: 57.5, loft: 11, roll: 0.24 },
    { id: '3W', name: '3 Wood', carry: 52.5, loft: 15, roll: 0.2 },
    { id: '3I', name: '3 Iron', carry: 47.5, loft: 21, roll: 0.15 },
    { id: '5I', name: '5 Iron', carry: 42.5, loft: 27, roll: 0.12 },
    { id: '7I', name: '7 Iron', carry: 37.5, loft: 34, roll: 0.09 },
    { id: '9I', name: '9 Iron', carry: 32.5, loft: 42, roll: 0.07 },
    { id: 'PW', name: 'Pitching Wedge', carry: 27.5, loft: 48, roll: 0.05 },
    { id: 'SW', name: 'Sand Wedge', carry: 20, loft: 58, roll: 0.03 },
    { id: 'PT', name: 'Putter', carry: 0, loft: 0, roll: 0 }
  ];
  /* the four sets of the pro shop (the operator: 500 / 2,500 / 10,000 / 40,000 GOLD). dist scales every carry; sweep is the
     seconds the swing meter takes to fill (slower = easier to stop where you want; 2026-10-19: the first cut was too fast); window is how wide the sweet spot is
     (meter units either side of the line); line is how wide the MAX power zone is (meter units either side of it; the operator:
     better clubs widen both zones and drive further); spin scales top- and backspin */
  const SETS = {
    starter: { name: 'Starter Set', price: 500, dist: 0.88, sweep: 1.45, window: 4, line: 1, spin: 0.8 },
    standard: { name: 'Standard Set', price: 2500, dist: 1, sweep: 1.65, window: 5, line: 1.6, spin: 1 },
    pro: { name: 'Pro Set', price: 10000, dist: 1.09, sweep: 1.85, window: 6, line: 2.3, spin: 1.2 },
    master: { name: 'Master Set', price: 40000, dist: 1.18, sweep: 2.05, window: 7, line: 3, spin: 1.45 }
  };
  /* the lie: how much of a full shot a ground lets you make (shown as a % on the HUD) */
  const LIE = { t: 1, f: 1, e: 0.95, g: 0.9, r: 0.8, h: 0.62, s: 0.6, x: 0.8 };   /* x: the path to the clubhouse, played as rough */
  const SAND_WEDGE_LIE = 0.85;
  /* rolling: slowing in m/s per second on each ground; greens are quick */
  const DECEL = { t: 1.1, f: 1.1, e: 1.5, g: 0.62, r: 2.8, h: 4.2, x: 2.8 };
  const GRAV = 9.8 * 0.6;          /* how hard a slope pulls a rolling ball */
  const CUP = 0.11, CUP_FAST = 1.45;  /* holed within CUP of the pin when slower than CUP_FAST m/s; faster lips out */
  const PUTT_MAX = 22;             /* a full putt runs this far on a flat green */
  const PUTT = { short: 6, long: PUTT_MAX };   /* the operator: two putting settings - the short one gives the meter a fine touch near the hole */
  const POWER_BONUS = 1.08;        /* a press right on the meter's MAX line hits 8% past a full shot (the operator) */
  const MAX_STROKES = 10;          /* pick up after ten */
  const STEP = 1 / 60;

  /* the course: ground letter at a point, height (greens tilt and swell; everything else is flat), trees, holes */
  function makeCourse(d) {
    if (!d.rows && d.rle) d = Object.assign({}, d, { rows: d.rle.map(r => r.replace(/(\D)(\d+)/g, (m, c, n) => c.repeat(+n))) });   /* the game module's run-length rows */
    const [X0, Y0, X1, Y1] = d.box, Q = d.q, W = (X1 - X0) * Q, H = (Y1 - Y0) * Q;
    const trees = new Map();
    for (const t of d.trees) { const k = Math.floor(t[0] / 4) + ',' + Math.floor(t[1] / 4); if (!trees.has(k)) trees.set(k, []); trees.get(k).push(t); }
    function surf(x, y) {
      const i = Math.floor((x - X0) * Q), j = Math.floor((y - Y0) * Q);
      if (i < 0 || j < 0 || i >= W || j >= H) return 'o';
      return d.rows[j][i];
    }
    /* the green of hole n: a plane tilted by slope, a swell around its middle, fading to flat between 7.6 and 10 m out */
    function height(x, y, n) {
      let best = 0;
      for (const h of d.holes) {
        if (n && h.n !== n) continue;
        const dx = x - h.green[0], dy = y - h.green[1], r = Math.hypot(dx, dy);
        if (r > 10) continue;
        const fade = r < 7.6 ? 1 : 1 - smooth((r - 7.6) / 2.4);
        const v = (h.slope[0] * dx + h.slope[1] * dy + h.swell * Math.cos(Math.min(1, r / 7.6) * Math.PI / 2) ** 2 + 0.006 * Math.sin(dx * 0.9 + h.n) * Math.cos(dy * 0.8)) * fade;
        best = v; break;
      }
      return best;
    }
    function grad(x, y) { const e = 0.05; return [(height(x + e, y) - height(x - e, y)) / (2 * e), (height(x, y + e) - height(x, y - e)) / (2 * e)]; }
    function treesNear(x, y) {
      const out = [], i = Math.floor(x / 4), j = Math.floor(y / 4);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = trees.get((i + a) + ',' + (j + b)); if (l) out.push(...l); }
      return out;
    }
    return { data: d, X0, Y0, X1, Y1, surf, height, grad, treesNear, holes: d.holes, yd: d.yd || 4 };
  }
  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  /* a tree: canopy radius and height (deterministic from where it stands); rocks are low */
  function treeShape(t) { return t[2] ? { r: 0.8, h: 1.2 } : { r: 1.3, h: 6 + ((Math.abs(t[0] * 7.3 + t[1] * 3.1) % 1) * 3) }; }

  function lieOf(surf, club) { if (surf === 's') return club && club.id === 'SW' ? SAND_WEDGE_LIE : LIE.s; return LIE[surf] == null ? 1 : LIE[surf]; }
  /* the impact: how far from the sweet spot the third press landed, in units of the set's window (0 = perfect, 1 = the
     edge of the window, more = a mishit). Off-centre curves the ball (+ right, - left) and costs distance */
  /* the hook (-) or slice (+) as a share of the carry: gentle inside the sweet spot (up to 3%), then growing (the operator:
     the first cut hooked far too much - 16% of the carry at the edge of the window) */
  function curve(imp) { const a = Math.abs(imp), c = a <= 1 ? 0.03 * a : Math.min(0.16, 0.03 + 0.06 * (a - 1)); return Math.sign(imp) * c; }
  function impactLoss(imp) { const a = Math.abs(imp); return 1 - 0.12 * Math.min(1, a) ** 2 - 0.25 * Math.max(0, Math.min(2, a - 1)); }

  /* a full shot. b = {x, y}; s = {club (id), aim (radians, map angle), power 0..1, impact, spin 'top'|'none'|'back',
     set (id), wind [wx, wy] m/s, n (hole), pin [x, y]}. Returns {path: [[x, y, z, t]...], end: [x, y], surf, kind, drop,
     penalty, holed, carry, total, lip} */
  function shot(C, b, s) {
    const club = CLUBS.find(c => c.id === s.club) || CLUBS[0], set = SETS[s.set] || SETS.standard;
    if (club.id === 'PT') return putt(C, b, s);
    const surf0 = C.surf(b.x, b.y);
    const D = club.carry * set.dist * Math.max(0, Math.min(POWER_BONUS, s.power)) * lieOf(surf0, club) * impactLoss(s.impact || 0);
    const dx = Math.cos(s.aim), dy = Math.sin(s.aim), rx = -dy, ry = dx;
    const L = curve(s.impact || 0) * D;                          /* the hook or slice at landing, metres */
    const T = Math.max(0.6, (1.6 + club.loft / 18) * Math.sqrt(Math.max(0.05, D / club.carry)));   /* time in the air */
    const W = s.wind || [0, 0], drift = 0.3 * T;
    const Hm = Math.max(1.2, D * (0.08 + club.loft / 250));
    const path = []; let hit = null, kind = null;
    const N = Math.max(12, Math.ceil(D / 0.4));
    const at = u => [b.x + dx * D * u + rx * L * u * u + W[0] * drift * u ** 1.5, b.y + dy * D * u + ry * L * u * u + W[1] * drift * u ** 1.5, 4 * Hm * u * (1 - u)];
    for (let k = 0; k <= N; k++) {
      const u = k / N, p = at(u);
      path.push([p[0], p[1], p[2] + C.height(p[0], p[1]), u * T]);
      if (k && p[2] < 9) for (const t of C.treesNear(p[0], p[1])) {
        const sh = treeShape(t);
        if (p[2] < sh.h && Math.hypot(p[0] - t[0], p[1] - t[1]) < sh.r) { hit = p; break; }
      }
      if (hit) break;
    }
    let pos, vel, t0 = T;
    if (hit) {   /* into a tree: it drops straight down there and stays */
      kind = 'tree'; const last = path[path.length - 1]; t0 = last[3];
      path.push([hit[0], hit[1], C.height(hit[0], hit[1]), t0 + 0.6]);
      pos = [hit[0], hit[1]]; vel = [0, 0]; t0 += 0.6;
    } else {
      const e = at(1), pre = at(0.92), l = Math.hypot(e[0] - pre[0], e[1] - pre[1]) || 1, ux = (e[0] - pre[0]) / l, uy = (e[1] - pre[1]) / l;
      pos = [e[0], e[1]];
      const ls = C.surf(pos[0], pos[1]);
      let R = D * club.roll * (s.spin === 'top' ? 1 + 0.9 * set.spin : s.spin === 'back' ? Math.max(0, 1 - 0.85 * set.spin) : 1);
      if (s.spin === 'back' && club.loft >= 40) R = -D * 0.05 * set.spin;   /* a wedge with backspin checks and spins back */
      const damp = { r: 0.55, h: 0.35, s: 0, w: 0, o: 0 }[ls]; const v0 = Math.sqrt(2 * DECEL.f * Math.abs(R)) * (damp == null ? 1 : damp);
      vel = [ux * v0 * Math.sign(R || 1), uy * v0 * Math.sign(R || 1)];
    }
    const r = roll(C, pos, vel, s.pin, path, t0);
    return finish(C, b, r, path, D, s);
  }
  /* 2026-10-20 ("If you're less than 10 feet from the pin, there should be a tap in putt button"): inside TAP_IN
     (the feet the HUD shows: metres x course.yd x 3) on the green or the fringe a tap-in rolls straight in and drops;
     anything farther is an ordinary putt */
  const TAP_IN = 10;   /* feet */
  function canTap(C, b, pin) { return !!pin && Math.hypot(pin[0] - b.x, pin[1] - b.y) * (C.yd || 4) * 3 <= TAP_IN && 'ge'.includes(C.surf(b.x, b.y)); }
  function tapIn(C, b, s) {
    const pin = s.pin, d = Math.hypot(pin[0] - b.x, pin[1] - b.y), T = 0.5 + d * 0.6, path = [];
    for (let k = 0; k <= 10; k++) { const u = k / 10, e = u * (2 - u), x = b.x + (pin[0] - b.x) * e, y = b.y + (pin[1] - b.y) * e; path.push([x, y, C.height(x, y), u * T]); }
    const h0 = C.height(pin[0], pin[1]); path.push([pin[0], pin[1], h0 - 0.05, T + 0.1], [pin[0], pin[1], h0 - 0.1, T + 0.22]);
    return finish(C, b, { x: pin[0], y: pin[1], kind: null, holed: true, lip: false, dry: [pin[0], pin[1]] }, path, 0, s);
  }
  function putt(C, b, s) {
    if (s.tap && canTap(C, b, s.pin)) return tapIn(C, b, s);
    const a = s.aim + (s.impact || 0) * 0.045, set = SETS[s.set] || SETS.standard;
    const v0 = Math.sqrt(2 * DECEL.g * (PUTT[s.range] || PUTT_MAX) * Math.max(0, Math.min(1, s.power))) * (1 - 0.06 * Math.min(2, Math.abs(s.impact || 0))) * (set.dist ** 0.15);
    const path = [[b.x, b.y, C.height(b.x, b.y), 0]];
    const r = roll(C, [b.x, b.y], [Math.cos(a) * v0, Math.sin(a) * v0], s.pin, path, 0);
    return finish(C, b, r, path, 0, s);
  }
  /* the roll, shared by shots and putts: slows per ground, slopes pull, the cup takes a slow ball, a fast one lips out;
     water and out of bounds end it */
  function roll(C, p, v, pin, path, t) {
    let x = p[0], y = p[1], vx = v[0], vy = v[1], kind = null, holed = false, lip = false, dry = [x, y];
    for (let k = 0; k < 25 / STEP; k++) {
      const s = C.surf(x, y);
      if (s === 'w' || s === 'o' || s === 'c') { kind = s === 'w' ? 'water' : 'oob'; break; }   /* c: the clubhouse is out of bounds */
      dry = [x, y];
      if (s === 's') { vx = vy = 0; break; }
      const g = (s === 'g' || s === 'e') ? C.grad(x, y) : [0, 0], ax = -GRAV * g[0], ay = -GRAV * g[1];
      const sp = Math.hypot(vx, vy), dec = DECEL[s] || 2;
      if (pin) {
        const dp = Math.hypot(x - pin[0], y - pin[1]);
        if (dp < CUP) {
          if (sp < CUP_FAST) {   /* the operator: the ball drops into the hole - over the lip to the middle, then down the cup */
            holed = true; const h0 = C.height(pin[0], pin[1]), mx = (x + pin[0]) / 2, my = (y + pin[1]) / 2;
            path.push([x, y, C.height(x, y), t], [mx, my, h0 - 0.012, t + 0.06], [pin[0], pin[1], h0 - 0.05, t + 0.14], [pin[0], pin[1], h0 - 0.1, t + 0.26]);
            x = pin[0]; y = pin[1]; vx = vy = 0; t += 0.26; break;
          }
          if (!lip) { lip = true; const q = (k % 2 ? 1 : -1) * 0.45, c = Math.cos(q), si = Math.sin(q); [vx, vy] = [(vx * c - vy * si) * 0.6, (vx * si + vy * c) * 0.6]; }
        }
      }
      if (sp < 0.04) { if (Math.hypot(ax, ay) < dec * 0.9) { vx = vy = 0; break; } }
      const ns = Math.max(0, sp - dec * STEP);
      if (sp > 0) { vx *= ns / sp; vy *= ns / sp; }
      vx += ax * STEP; vy += ay * STEP;
      x += vx * STEP; y += vy * STEP; t += STEP;
      if (k % 3 === 0) path.push([x, y, C.height(x, y), t]);
      if (sp < 0.04 && Math.hypot(vx, vy) < 0.04 && Math.hypot(ax, ay) < dec * 0.9) break;
    }
    if (!holed) path.push([x, y, C.height(x, y), t]);   /* a holed ball's last point is already at the bottom of the cup */
    return { x, y, kind, holed, lip, dry };
  }
  /* water: drop on the dry ground where it went in, a metre back toward where it was played from; out of bounds: replay */
  function finish(C, b, r, path, D, s) {
    let end = [r.x, r.y], drop = null, penalty = 0;
    if (r.kind === 'water') {
      const back = Math.atan2(b.y - r.dry[1], b.x - r.dry[0]); let q = [r.dry[0], r.dry[1]];
      for (let k = 0; k < 120; k++) { const n = [q[0] + Math.cos(back) * 0.5, q[1] + Math.sin(back) * 0.5]; const ss = C.surf(n[0], n[1]); q = n; if (ss !== 'w' && ss !== 'o' && k > 1) break; }
      drop = q; penalty = 1;
    } else if (r.kind === 'oob') { drop = [b.x, b.y]; penalty = 1; }
    const fin = drop || end;
    return { path, end, surf: C.surf(fin[0], fin[1]), kind: r.kind || (path.kind || null), drop, penalty, holed: r.holed, lip: r.lip, carry: D,
      total: Math.hypot(end[0] - b.x, end[1] - b.y), at: fin };
  }

  /* wind for hole n of a round (seeded): [wx, wy] m/s, up to 7 */
  function windFor(seed, n) {
    let h = 2166136261; for (const c of String(seed) + ':' + n) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2, sp = (((h >>> 12) % 1000) / 1000) ** 1.3 * 7;
    return [Math.cos(a) * sp, Math.sin(a) * sp];
  }
  /* the club to start with: the putter on the green, else the shortest club that reaches the target */
  function pickClub(C, b, target, setId) {
    const s = C.surf(b.x, b.y); if (s === 'g') return 'PT';
    const d = Math.hypot(target[0] - b.x, target[1] - b.y), set = SETS[setId] || SETS.standard;
    if (s === 'e' && d < 9) return 'PT';
    if (s === 's' && d < 25) return 'SW';
    const tee = s === 't', ok = CLUBS.filter(c => c.id !== 'PT' && (tee || c.id !== '1W'));   /* the driver only off the tee */
    let best = ok[0].id;
    for (const c of ok) if (c.carry * set.dist * lieOf(s, c) >= d * 0.9) best = c.id;
    return best;
  }
  /* where to aim: the pin when a full shot reaches it, else the farthest turn of the hole within reach */
  function aimPoint(C, b, hole, clubId, setId) {
    const club = CLUBS.find(c => c.id === clubId) || CLUBS[0], set = SETS[setId] || SETS.standard;
    const reach = (club.id === 'PT' ? PUTT_MAX : club.carry * set.dist * lieOf(C.surf(b.x, b.y), club)) * 1.05;
    if (Math.hypot(hole.pin[0] - b.x, hole.pin[1] - b.y) <= reach) return hole.pin;
    let best = null, bi = 0, bd = 1e9;
    hole.pts.forEach((p, i) => { const d = Math.hypot(p[0] - b.x, p[1] - b.y); if (d < bd) { bd = d; bi = i; } });
    for (let i = bi; i < hole.pts.length; i++) { const p = i === hole.pts.length - 1 ? hole.pin : hole.pts[i], d = Math.hypot(p[0] - b.x, p[1] - b.y); if (d > 3 && d <= reach) best = p; }
    return best || hole.pts[Math.min(bi + 1, hole.pts.length - 1)];
  }
  /* the putting setting to start with: short within 4.5 m of the pin */
  function puttRange(C, b, pin) { return Math.hypot(pin[0] - b.x, pin[1] - b.y) < 4.5 ? 'short' : 'long'; }
  function scoreName(strokes, par) {
    if (strokes === 1) return 'HOLE IN ONE';
    const d = strokes - par;
    return { '-3': 'ALBATROSS', '-2': 'EAGLE', '-1': 'BIRDIE', 0: 'PAR', 1: 'BOGEY', 2: 'DOUBLE BOGEY', 3: 'TRIPLE BOGEY' }[d] || (d > 0 ? '+' + d : String(d));
  }

  const API = { CLUBS, SETS, LIE, DECEL, CUP, PUTT_MAX, PUTT, POWER_BONUS, puttRange, TAP_IN, canTap, MAX_STROKES, makeCourse, shot, lieOf, windFor, pickClub, aimPoint, scoreName, treeShape };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('golfrules', { api: 1, v: 1, needs: {} }, () => API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
