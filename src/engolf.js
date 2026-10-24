/* ASHVALE 3D engine part: THE SALTMERE LINKS (2026-10-19). An 18-hole course on the coast north-east of Saltmere
   (zone 'golf', its path 'golfpath'; the holes, ponds and the burn from the operator's map, tools/make_golf.py). Fergus the starter
   in the clubhouse sends you out, alone or with a group of up to four; Isla's pro shop sells the club sets (you need one to
   play; the best you own is used). While you play the golf HUD takes over (hudgolf.js), taps no longer walk, and the camera
   stands behind your ball. The swing: press to start, press to set the power (the MAX zone), press on the line to strike (a putt: press to start, press for its strength).
   The rules are src/golfrules.js: a shot is a pure function of the swing, so the others draw your flight from your swing
   and your ball's resting place (which your game decides, and sends with it).
   A group may play for GOLF (the operator): "winner takes the pot" (equal stakes, the lowest total wins, ties split) or "per
   stroke" (an agreed amount a stroke, paid by each player to everyone who beat them, at most 20 strokes a pair; each stake
   covers the most a player can lose, the rest comes back). A player who leaves mid-round forfeits (the operator): their stake stays
   in the pot / they count as 20 strokes behind everyone. The stakes go to @ashvale and the Bank pays the round out only when
   the players' games agree on the result - the card table's path (pkbuy / pkout / pkcash, seats 'golf:<round>:<n>').
   install(K) -> { frame(now, dt), camera(cam3, dt), talk(), tap(), playing(), net(id, d), drop(id), event(e) } */
(function (G) {
  'use strict';
  const FERGUS = 'Fergus the starter';
  const SETS = [['golf_master', 'master'], ['golf_pro', 'pro'], ['golf_standard', 'standard'], ['golf_starter', 'starter']];
  const BALL_R = 0.035, LINE = 86;
  const FMT = { free: 'a friendly round', pot: 'winner takes the pot', stroke: 'per stroke' };
  function install(K) {
    const THREE = K.THREE, R = K.rules, C = R.makeCourse(K.course), D = C.data, YD = C.yd;
    const [BX0, BY0, BX1, BY1] = D.box;
    const yd = m => Math.round(m * YD), ft = m => Math.round(m * YD * 3);
    const ME = () => String(K.netId ? K.netId() : K.PID);   /* who I am to the others (the room's id; the game's own player id is the same 'me' everywhere) */
    /* 2026-10-20 ("weird grass that covers your ball near one of the greens"): a green's tilt dips up to ~10 cm below the
       world's ground on its low side, and there the world's own grass drew over the course and the ball. Drawn, each green is
       lifted by its deepest dip, fading out with the tilt (the rules' heights are untouched: every game plays the same shots) */
    const smoothT = t => t * t * (3 - 2 * t);
    const LIFT = C.holes.map(h => { let lo = 0;
      for (let dx = -10; dx <= 10; dx += 0.25) for (let dy = -10; dy <= 10; dy += 0.25) { const r = Math.hypot(dx, dy); if (r > 10) continue;
        lo = Math.min(lo, h.slope[0] * dx + h.slope[1] * dy + h.swell * Math.cos(Math.min(1, r / 7.6) * Math.PI / 2) ** 2 - 0.006); }
      return -lo + 0.005; });
    const lift = (x, z) => { for (let i = 0; i < C.holes.length; i++) { const g = C.holes[i].green, r = Math.hypot(x - g[0], z - g[1]); if (r > 10) continue; return LIFT[i] * (r < 7.6 ? 1 : 1 - smoothT((r - 7.6) / 2.4)); } return 0; };
    const gY = (x, z) => K.heightAt(x, z) + C.height(x, z) + lift(x, z);   /* where the course is drawn: the world's ground plus the greens' tilt, never under the ground */
    const nearCourse = (x, y) => x > BX0 - 80 && x < BX1 + 80 && y > BY0 - 80 && y < BY1 + 120;
    let built = null;
    /* ---------- the course drawn on the ground: fairways, greens, tees, bunkers, rough (the world's own trees and water around) */
    const COL = { t: '#8ccc5e', f: '#86c45a', e: '#7cbd56', g: '#95d769', r: '#6aa548', s: '#e6d6a0' };
    function overlayTexture() {
      const Q = D.q, W = D.rows[0].length, H = D.rows.length, P = 3, cv = document.createElement('canvas');
      cv.width = W * P; cv.height = H * P; const g = cv.getContext('2d');
      for (let j = 0; j < H; j++) {
        const row = D.rows[j];
        for (let i = 0; i < W; i++) {
          const s = row[i]; let c = COL[s]; if (!c) continue;   /* off the course, the water, the path, the clubhouse: the world shows */
          if (s === 'f' && Math.floor((i + j) / (4 * Q)) % 2) c = '#7dba52';     /* mown stripes */
          if (s === 'g' && Math.floor(i / (2 * Q)) % 2) c = '#8ed062';
          g.fillStyle = c; g.fillRect(i * P, j * P, P, P);
        }
      }
      const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
      for (let k = 0; k < d.length; k += 4) if (d[k + 3]) { const n = ((k * 2654435761) >>> 24) / 255 * 12 - 6; d[k] += n; d[k + 1] += n; d[k + 2] += n * 0.5; }
      g.putImageData(im, 0, 0);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      return t;
    }
    function build() {
      const grp = new THREE.Group(), W = BX1 - BX0, H = BY1 - BY0, nx = W + 1, nz = H + 1;
      const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = BX0 + i, z = BY0 + j, k = j * nx + i;
        pos.set([x, gY(x, z) + 0.035, z], k * 3); uv.set([i / (nx - 1), 1 - j / (nz - 1)], k * 2);
        if (i < nx - 1 && j < nz - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ map: overlayTexture(), transparent: false, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; grp.add(m);
      const flags = C.holes.map(h => { const f = flagModel(h.n); f.position.set(h.pin[0], gY(h.pin[0], h.pin[1]), h.pin[1]); grp.add(f); return f; });
      for (const h of C.holes) {   /* the tee markers */
        const a = Math.atan2(h.pts[1][1] - h.pts[0][1], h.pts[1][0] - h.pts[0][0]);
        for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0x2b5fb8 })); const x = h.pts[0][0] - Math.sin(a) * 2.2 * s + Math.cos(a) * 0.6, z = h.pts[0][1] + Math.cos(a) * 2.2 * s + Math.sin(a) * 0.6; t.position.set(x, gY(x, z) + 0.1, z); grp.add(t); }
      }
      K.scene.add(grp);
      return { grp, flags };
    }
    function flagModel(n) {
      const f = new THREE.Group(), stick = new THREE.Group(); f.add(stick); f.userData.stick = stick;
      for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xc8281f : 0xf7f5ee })); seg.position.y = 0.2 + k * 0.4; stick.add(seg); }
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf2c230 })); knob.position.y = 2.42; stick.add(knob);
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 84; const g = cv.getContext('2d');
      g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 84); g.fillStyle = '#c8281f'; g.fillRect(0, 0, 128, 7); g.fillRect(0, 77, 128, 7);
      g.fillStyle = '#1d1a14'; g.font = 'bold 60px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 46);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const cg = new THREE.PlaneGeometry(0.62, 0.4, 10, 1); cg.translate(0.31, 0, 0);
      const cloth = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); cloth.position.set(0.01, 2.17, 0); stick.add(cloth);
      cloth.userData.base = Float32Array.from(cg.attributes.position.array); f.userData.cloth = cloth;
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 24), new THREE.MeshBasicMaterial({ color: 0xffffff })); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.05; f.add(rim);
      const cup = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), new THREE.MeshBasicMaterial({ color: 0x111111 })); cup.rotation.x = -Math.PI / 2; cup.position.y = 0.048; f.add(cup);
      /* The operator ("when putting from a distance the hole is not visible", "I want the little black hole to be visible"): the cup
         and its lip sat 5 cm over the green, under the course's offset surface at a low look, so they are drawn over the grass */
      for (const m of [rim, cup]) m.renderOrder = 4;   /* drawn over the grass only at the hole you putt at (frame): elsewhere a hill still hides it */
      f.userData.lip = [rim, cup];
      return f;
    }
    function waveFlags(now, wind) {
      if (!built) return; const w = Math.hypot(wind[0], wind[1]);
      for (const f of built.flags) {
        const cl = f.userData.cloth, p = cl.geometry.attributes.position, b = cl.userData.base;
        for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.array[i * 3 + 2] = Math.sin(x * 9 - now / 140 * (0.6 + w / 6)) * x * (0.06 + w * 0.012); }
        p.needsUpdate = true; cl.rotation.y = -Math.atan2(wind[1], wind[0]) + (w < 0.3 ? 1.2 : 0);
      }
    }
    /* ---------- a golfer's things: the ball, its shadow and flight trail, the club drawn from the avatar's hands ---------- */
    const CUT = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    function kit() {
      const ballMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 14, 10), ballMat); ball.renderOrder = 6;   /* after the cup, which is drawn over the grass while you putt */
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.2, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })); shadow.rotation.x = -Math.PI / 2;
      const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })); trail.visible = false;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.006, 1, 6), new THREE.MeshLambertMaterial({ color: 0xc9cbd0 }));
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.26, 6), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.05), new THREE.MeshLambertMaterial({ color: 0x5a5d63 }));
      for (const m of [ball, shadow, trail, shaft, grip, head]) K.scene.add(m);
      return { ball, shadow, trail, shaft, grip, head, stand: 0.8, fly: null, flyT: 0, cut: CUT.clone() };
    }
    function dropKit(k) { if (!k) return; for (const m of [k.ball, k.shadow, k.trail, k.shaft, k.grip, k.head]) { K.scene.remove(m); if (m.geometry) m.geometry.dispose(); } }
    /* 2026-10-20 ("the ball sometimes looks like it's sunken into the ground. It should never look like it's sunken"): the
       turf is drawn 0.035 m over gY on a 1 m grid of flat triangles, so a ball sat on gY had its lower half under the grass (more
       where the grid cuts across a hump). The ball's foot goes on top of whatever is drawn there: the turf's own triangle (the
       same split as build()), or the world's ground off the course, and a hair over it so the turf's depth offset never bites. */
    const TURF = 0.035, CLEAR = 0.012;
    function turfY(x, z) {
      const gy = gY(x, z);
      if (x < BX0 || x >= BX1 || z < BY0 || z >= BY1 || !COL[C.surf(x, z)]) return gy;
      const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, A = gY(i, j), B = gY(i + 1, j), Cc = gY(i, j + 1);
      const m = fx + fz <= 1 ? A + fx * (B - A) + fz * (Cc - A) : (() => { const Dd = gY(i + 1, j + 1); return Dd + (1 - fx) * (Cc - Dd) + (1 - fz) * (B - Dd); })();
      return Math.max(gy, m) + TURF;
    }
    function placeBall(k, x, z, y, pin, wy) {   /* wy: the ball's foot in world y (a flight, pathY), else from the ground */
      const gy = gY(x, z), up = y != null && y < C.height(x, z) ? 0 : turfY(x, z) - gy + CLEAR;   /* down the cup: as the cup is drawn */
      k.ball.position.set(x, (wy != null ? wy : y == null ? gy : gY(x, z) - C.height(x, z) + y) + up + BALL_R, z); k.shadow.position.set(x, gy + 0.05, z);
      const inCup = pin && Math.hypot(x - pin[0], z - pin[1]) < 0.1 && y != null && y < C.height(x, z);
      k.ball.material.clippingPlanes = inCup ? [k.cut] : null; k.cut.constant = -(gY(pin ? pin[0] : x, pin ? pin[1] : z) + 0.046); k.shadow.visible = !inCup;
    }
    /* 2026-10-20 ("the flight path ... drops down following the contour of the river bed ... should be a smooth parabola"):
       in the air the ball's ground is a straight line from where it left the ground to where it first comes down, the arc on it;
       from that first landing on (bounces, the roll) it follows the ground. World y of the ball's foot at each point of a path. */
    /* 2026-10-20 ("even when it hits the ground, it should bounce off the ground hard"): a shot comes down and hops before it
       rolls - each hop a smaller copy of the flight (height e^2n, time e^n, e by the ground it lands on; sand and water take it),
       laid over the roll that follows, so where the ball comes to rest (the rules, every game's agreement) is untouched. */
    const BOUNCE = { t: 0.45, f: 0.45, e: 0.4, g: 0.35, r: 0.3, x: 0.3, h: 0.2 };
    function pathY(path) {
      const air = p => p[2] - C.height(p[0], p[1]); let L = path.length - 1;
      for (let k = 1; k < path.length; k++) if (air(path[k]) < 0.02) { L = k; break; }
      const p0 = path[0], pL = path[L], g0 = gY(p0[0], p0[1]), gL = gY(pL[0], pL[1]), tL = pL[3] - p0[3];
      let Hm = 0; for (let k = 0; k <= L; k++) Hm = Math.max(Hm, air(path[k]));
      const e = Hm > 1 ? BOUNCE[C.surf(pL[0], pL[1])] || 0 : 0, room = path[path.length - 1][3] - pL[3] - 0.3, hops = [];
      for (let n = 1, s0 = 0; e && n <= 3; n++) { const d0 = tL * e ** n, d = Math.min(d0, room - s0), h = Hm * e ** (2 * n) * d / d0; if (h < 0.05 || d < 0.2) break; hops.push([s0, d, h]); s0 += d; }   /* a short roll (a wedge onto a green): quicker, lower hops */
      const hop = t => { for (const [s0, d, h] of hops) if (t >= s0 && t < s0 + d) { const w = (t - s0) / d; return 4 * h * w * (1 - w); } return 0; };
      return path.map((p, k) => k <= L ? g0 + (gL - g0) * (tL > 0 ? (p[3] - p0[3]) / tL : 1) + air(p) : gY(p[0], p[1]) - C.height(p[0], p[1]) + p[2] + hop(p[3] - pL[3]));
    }
    function trailOf(k, path) {
      const Y = pathY(path), pos = []; path.forEach((p, i) => pos.push(p[0], Y[i] + BALL_R, p[1]));
      k.trail.geometry.dispose(); k.trail.geometry = new THREE.BufferGeometry(); k.trail.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); k.trail.geometry.setDrawRange(0, 0);
    }
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
    const clubLen = id => id === 'PT' ? 0.86 : id === '1W' || id === '3W' ? 1.12 : id === 'SW' || id === 'PW' ? 0.9 : 0.96;
    /* the club in the avatar's hands; at address the golfer steps in or back until the head meets the ball */
    function drawClub(k, H, root, ballAt, aim, club, adjust) {
      const P = H && H._parts; if (!P || !P.handL) { k.shaft.visible = k.grip.visible = k.head.visible = false; return; }
      k.shaft.visible = k.grip.visible = k.head.visible = true;
      root.updateMatrixWorld(true);
      P.handL.getWorldPosition(_a); P.handR.getWorldPosition(_b); _m.addVectors(_a, _b).multiplyScalar(0.5);
      P.shL.getWorldPosition(_a); P.shR.getWorldPosition(_b); _s.addVectors(_a, _b).multiplyScalar(0.5);
      _d.subVectors(_m, _s).normalize();
      const h = H.clubHinge ? H.clubHinge() : 0; if (h) _d.applyAxisAngle(_a.set(-Math.sin(aim), 0, Math.cos(aim)), -h);
      const w = H.clubToBall ? H.clubToBall() : 0; let Lb = 0;
      if (w > 0 && ballAt) { _a.set(ballAt[0] - Math.cos(aim) * 0.03, gY(ballAt[0], ballAt[1]) + 0.03, ballAt[1] - Math.sin(aim) * 0.03).sub(_m); Lb = _a.length(); _d.lerp(_a.normalize(), w).normalize(); }
      const L = clubLen(club);
      if (adjust && w > 0.95 && Lb > 0) k.stand = Math.max(0.45, Math.min(1.3, k.stand - (Lb - L) * 0.5));
      _q.setFromUnitVectors(_up, _b.copy(_d).negate());
      k.shaft.quaternion.copy(_q); k.grip.quaternion.copy(_q);
      k.shaft.position.copy(_m).addScaledVector(_d, L / 2 - 0.05); k.shaft.scale.set(1, L, 1);
      k.grip.position.copy(_m).addScaledVector(_d, 0.06);
      k.head.position.copy(_m).addScaledVector(_d, L - 0.05); k.head.quaternion.setFromAxisAngle(_up, -aim);
    }
    function standAt(e, k, ballAt, aim) {   /* the golfer across the ball from the line, facing it, the target to its left */
      if (!e || !e.root) return;
      const tw = [-Math.sin(aim), Math.cos(aim)], x = ballAt[0] - tw[0] * k.stand, z = ballAt[1] - tw[1] * k.stand;
      e.root.position.set(x, turfY(x, z), z); e.root.rotation.y = -aim; e.yaw = e.tyaw = -aim;   /* 2026-10-20 ("avatar's feet are sunken into the ground"): on the drawn turf and the greens' lift, not the bare world ground */
    }
    /* 2026-10-20: "make the avatars stand around the one who is playing as if they are watching him play until it
       is their turn". A waiting golfer stands across the ball from the player and behind it (never ahead of the ball or
       under the flight), the group spread in tee order (the j-th waiting one a little further back and out), facing the
       player, idle and without a club. Every game places them the same way from the same shared facts as the turn. */
    function watchSpot(sn) {
      if (!ST || ST.m.length < 2 || ST.done || ST.quit[sn]) return null;
      const t = ST.turn; if (t == null || t === sn) return null;
      const P = pinfo(t), h = hole(), b = P.n === ST.hole && P.b ? P.b : h.pts[0];
      const a = t === ST.sn ? +ST.aim.toFixed(3) : +((ST.st[t] || {}).a) || 0;
      const j = Math.max(0, teeOrder(ST.hole).filter(s => s !== t).indexOf(sn));
      const f = [Math.cos(a), Math.sin(a)], tw = [-Math.sin(a), Math.cos(a)], back = 2.6 + 0.9 * j, side = 2.4 + 0.5 * j;
      const x = b[0] - f[0] * back + tw[0] * side, z = b[1] - f[1] * back + tw[1] * side;
      const dx = b[0] - x, dz = b[1] - z;
      return { x, z, yaw: -Math.atan2(-dx, dz), sn: t };
    }
    function remoteOf(id) { const re = K.remoteEnt && K.remoteEnt(id); return re ? (re.root ? { e: re } : re) : null; }   /* {e: their ent} */
    function watchAt(e, k, w) {
      e.root.position.set(w.x, turfY(w.x, w.z), w.z); e.root.rotation.y = w.yaw; e.yaw = e.tyaw = w.yaw;
      e.restPose = 'idle'; if (e.H && !e.oneShot && e.H.animation !== 'idle') e.H.play('idle', { loop: true });
      if (k) k.shaft.visible = k.grip.visible = k.head.visible = false;
    }
    /* ---------- my round ---------- */
    let ST = null, MEK = null, aimHold = 0, E = null;
    const OPEN = new Map();   /* groups others have opened nearby: g -> {g, host, hn, f, a, m, at} */
    let LOBBY = null;         /* the group I opened or joined: {g, host, f, a, m: [[pid, name, addr]], at} */
    const RM = new Map();     /* other golfers on the course: pid -> {g: their last state, k: kit, at} */
    const myName = () => (K.boardWho && K.boardWho()) || (K.me && K.me.name) || 'Golfer';
    function bestSet() { for (const [id, s] of SETS) if (K.owns(id)) return s; return null; }
    const hole = () => C.holes[ST.hole];
    const clubObj = () => R.CLUBS.find(c => c.id === ST.club);
    function reachNow() { const c = clubObj(), set = R.SETS[ST.set]; return c.id === 'PT' ? R.PUTT[ST.range] : c.carry * set.dist * R.lieOf(C.surf(ST.ball.x, ST.ball.y), c); }
    function buyIn(f, a, n) { return f === 'pot' ? a : f === 'stroke' ? 20 * a * Math.max(1, n - 1) : 0; }
    function begin(o, re) {   /* o: {rid, f, a, m: [[pid, name, addr, sn]]}; re: a kept round to carry on (rejoin, below: no green fee, no stake - they were paid) */
      const set = re ? re.set : bestSet(); if (!set || !R.SETS[set]) { K.hud.chat('You need a set of clubs: Isla sells them in the clubhouse.', 'warn'); return; }
      const mine = re ? o.m.find(x => x[3] === re.sn) : o.m.find(x => String(x[0]) === ME()); if (!mine) return;
      if (re) mine[0] = ME();   /* my new room id */
      const nine = nineOf(o.nine), fee = feeOf(nine);
      if (!re && K.coins() < fee) { K.hud.chat('The green fee for ' + NINES[nine][3] + ' is ' + fee + ' GOLD - you have not got it in your pack.', 'warn'); return; }
      ST = { rid: o.rid, f: o.f, a: o.a | 0, m: o.m, sn: mine[3], set, nine, h0: NINES[nine][0], h1: NINES[nine][1], hole: 0, strokes: 0, card: [], ball: null, aim: 0, club: '1W', spin: 'none', range: 'long', phase: 'aim',
        meter: 0, power: 0, stop: 0, impact: 0, fly: null, flyT: 0, wait: 0, camYaw: 0, wind: [0, 0], sw: 0, shot: null, cards: {}, quit: {}, heard: {}, t0: Date.now(), settled: false, done: false,
        k: 0, st: {}, turn: null, doneAt: 0, advAt: 0, fallAt: 0, toldAim: 0, toldClub: '' };   /* k: my shots on this hole; st: the others' last 'st' by seat; turn: whose shot it is (a seat) */
      for (const x of o.m) { ST.cards[x[3]] = []; ST.heard[x[3]] = Date.now(); }
      ST.buy = buyIn(ST.f, ST.a, o.m.length);
      ST.tk = re ? String(re.tk || '') : Math.random().toString(36).slice(2, 10); ST.tok = {}; ST.away = {};   /* [Claude 2026-10-22] tk: my round token (the others know me by it after a reload); tok: theirs, as heard; away: seat -> when it lost connection */
      if (re) { for (const k of ['hole', 'strokes', 'k', 'card', 'cards', 'quit', 'ball', 'sw', 'shot', 'tok', 'buy', 't0', 'done', 'settled', 'st']) if (re[k] != null) ST[k] = re[k]; ST.cards[ST.sn] = ST.card; }
      else {
        RESUME = null;   /* a new round: an older kept one is over */
        K.send({ c: 'golffee', n: fee });
        if (ST.buy > 0) K.send({ c: 'golfstake', s: seat(ST.sn), n: ST.buy });
      }
      MEK = MEK || kit();
      K.cam.save = { yaw: K.cam.yaw, pitch: K.cam.pitch, dist: K.cam.dist }; K.cam.mode = 'golf';
      E = K.hud.golfOpen({ press, club: cycleClub, aimHold: d => { aimHold = d; }, spin: s => { if (canAim()) { ST.spin = s; hudAll(); } }, range: r => { if (canAim()) { ST.range = r; hudAll(); } }, tap: tapIn, card: () => showCard(), quit: () => askQuit() });
      if (K.PET && K.PET.away) K.PET.away(true);
      if (re) resumeAt(re); else startHole(ST.h0);
      keepRound(true);
    }
    const seat = sn => 'golf:' + ST.rid + ':' + sn;
    function startHole(i) {
      ST.hole = i; ST.strokes = 0; ST.k = 0; ST.advAt = 0; const h = hole(); ST.ball = { x: h.pts[0][0], y: h.pts[0][1] };
      ST.wind = R.windFor(ST.rid, h.n); setupShot(true); goTo(ST.ball);
      K.hud.golfFlash('HOLE ' + h.n + ' · PAR ' + h.par, '', 1600); K.hud.golfFlash(h.yd + ' yards', 'small', 1400);
      tell(true);
    }
    function goTo(b) {   /* the avatar walks the course with its ball: the game moves it to the ball's tile (everyone sees it there) */
      const P = K.core.S.players[K.PID]; const x = Math.floor(b.x), y = Math.floor(b.y);
      if (P && (P.x !== x || P.y !== y)) K.send({ c: 'golfgo', x, y });
    }
    function setupShot(first) {
      const h = hole(); ST.phase = 'aim'; ST.meter = 0;
      ST.club = R.pickClub(C, ST.ball, h.pin, ST.set);
      ST.aim = Math.atan2(h.pin[1] - ST.ball.y, h.pin[0] - ST.ball.x);   /* the operator: every stroke starts facing the pin (the dogleg turn it used to pick could point back at the tee) */
      ST.spin = 'none'; ST.tap = 0; ST.range = R.puttRange(C, ST.ball, h.pin); if (first) ST.camYaw = ST.aim;
      placeBall(MEK, ST.ball.x, ST.ball.y, null, h.pin); MEK.trail.visible = false; hudAll();
    }
    function setPower(m) {
      ST.stop = m;
      if (clubObj().id === 'PT') { ST.power = Math.max(0.02, m / 100); return; }
      const tol = R.SETS[ST.set].line;
      if (Math.abs(m - LINE) <= tol) { ST.power = R.POWER_BONUS; K.hud.golfFlash('POWER!', 'good', 900); }
      else if (m < LINE) ST.power = Math.max(0.02, m / LINE);
      else { ST.power = 1 - 0.15 * (m - LINE - tol) / (100 - LINE - tol); K.hud.golfFlash('OVERSWING', 'bad', 900); }
    }
    const WIN = () => R.SETS[ST.set].window;
    /* 2026-10-20 ("you just get a power stroke and you don't get an accuracy stroke"): on a phone one touch could
       reach here twice, so the second press struck the ball at once. A press within 250 ms of the last one counts for
       nothing, and the strike only once the marker has been on its way back for 120 ms. */
    let lastPress = -1e9, presses = 0;
    function press() {
      if (!ST || K.hud.golfCardOpen()) return;
      const t = performance.now(); if (t - lastPress < 250) return;
      if (ST.phase === 'aim' && tapNow()) { lastPress = t; presses++; tapIn(); return; }   /* 2026-10-20: inside 10 ft the swing button IS the tap-in, one press */
      if (ST.phase === 'aim') { if (!myTurn()) return; ST.phase = 'rise'; ST.meter = 0; lastPress = t; presses++; return; }
      if (ST.phase === 'rise' && clubObj().id === 'PT') { setPower(ST.meter); ST.impact = 0; lastPress = t; presses++; goSwing(); return; }   /* 2026-10-20 ("hard to click three times for a short putt"): a putt is two taps, start and strength; it rolls along the aim */
      if (ST.phase === 'rise') { setPower(ST.meter); ST.phase = 'fall'; ST.fallAt = t; lastPress = t; presses++; return; }
      if (ST.phase === 'fall') { if (t - ST.fallAt < 120) return; lastPress = t; presses++; ST.impact = -ST.meter / WIN(); goSwing(); }
    }
    /* 2026-10-20 ("instead of adding a third option of tap in ... turn the swing button into a tapping button so that it is
       automatic. Make sure the power of the tapping doesn't over exceed the power needed to get to the hole"): no Tap in button by
       Short/Long; with the putter inside 10 ft the swing button reads TAP IN and one press knocks it in at just the pace to drop
       (golfrules tapIn: it eases to the cup, never past it) */
    const tapNow = () => !!ST && clubObj().id === 'PT' && R.canTap(C, ST.ball, hole().pin);
    function tapIn() {   /* within 10 ft (golfrules canTap/tapIn), one stroke */
      if (!ST || ST.phase !== 'aim' || !myTurn() || K.hud.golfCardOpen() || !R.canTap(C, ST.ball, hole().pin)) return;
      ST.club = 'PT'; ST.tap = 1; ST.power = 0.3; ST.impact = 0; ST.stop = 30; ST.aim = Math.atan2(hole().pin[1] - ST.ball.y, hole().pin[0] - ST.ball.x); goSwing();
    }
    function goSwing() { ST.phase = 'go'; ST.goAt = performance.now(); if (K.playOnce) K.playOnce(K.myEnt, clubObj().id === 'PT' ? 'putt' : 'golfswing'); }
    function stepMeter(dt) {
      const sweep = R.SETS[ST.set].sweep;
      if (ST.phase === 'rise') { ST.meter += dt * 100 / sweep * 1.6; if (ST.meter >= 100) { ST.meter = 100; setPower(100); if (clubObj().id === 'PT') { ST.impact = 0; goSwing(); } else { ST.phase = 'fall'; ST.fallAt = performance.now(); } } }
      else if (ST.phase === 'fall') { ST.meter -= dt * 100 / sweep * 1.2; if (ST.meter <= -14) { ST.impact = 14 / WIN(); K.hud.golfFlash('MISHIT', 'bad', 900); goSwing(); } }
      else if (ST.phase === 'go' && performance.now() - ST.goAt > 3000) swing();   /* the impact frame never came (a hidden tab): hit anyway */
    }
    function swing() {
      if (!ST || ST.phase !== 'go') return;
      const h = hole(), c = clubObj();
      const inp = { club: ST.club, aim: +ST.aim.toFixed(5), power: +ST.power.toFixed(5), impact: +ST.impact.toFixed(5), spin: ST.spin, range: ST.range, set: ST.set };
      if (ST.tap) inp.tap = 1;
      const res = R.shot(C, ST.ball, Object.assign({ wind: c.id === 'PT' ? [0, 0] : ST.wind, pin: h.pin }, inp));
      ST.strokes += 1; ST.fly = res; ST.flyT = 0; ST.phase = 'fly'; ST.from = { x: ST.ball.x, y: ST.ball.y };
      ST.sw++; ST.shot = { fr: [+ST.from.x.toFixed(3), +ST.from.y.toFixed(3)], i: inp, at: [+res.at[0].toFixed(3), +res.at[1].toFixed(3)], ho: res.holed ? 1 : 0, n: ST.hole };
      trailOf(MEK, res.path); MEK.trail.visible = c.id !== 'PT';
      if (c.id !== 'PT' && Math.abs(ST.impact) < 0.25 && ST.power > 0.9) K.hud.golfFlash('NICE SHOT', 'good', 1100);
      tell(true);
    }
    function landed() {
      const r = ST.fly, h = hole(), fromGreen = 'ge'.includes(C.surf(ST.from.x, ST.from.y));
      ST.k += 1;   /* the shot is over: the others count it, with my ball's new place, from the 'st' that goes out at once */
      if (r.holed) {
        if (ST.strokes > 1 && !fromGreen) K.hud.golfFlash('CHIP-IN!', 'good', 1300);
        K.hud.golfFlash(R.scoreName(ST.strokes, h.par), ST.strokes <= h.par ? 'good' : '', 2200);
        holeDone(ST.strokes); return;
      }
      if (r.kind === 'water') K.hud.golfFlash('WATER HAZARD  +1', 'bad', 1600);
      else if (r.kind === 'oob') K.hud.golfFlash('OUT OF BOUNDS  +1', 'bad', 1600);
      else if (r.kind === 'tree') K.hud.golfFlash('TREE!', 'bad', 1000);
      else if (r.lip) K.hud.golfFlash('LIPPED OUT', 'bad', 1200);
      else if (r.surf === 's') K.hud.golfFlash('BUNKER', 'bad', 1000);
      ST.strokes += r.penalty; ST.ball = { x: r.at[0], y: r.at[1] };
      if (ST.strokes >= R.MAX_STROKES) { K.hud.golfFlash('PICKED UP', 'bad', 1500); holeDone(R.MAX_STROKES); return; }
      setupShot(false); goTo(ST.ball); tell(true);
    }
    function holeDone(n) {
      ST.card[ST.hole] = n; ST.cards[ST.sn] = ST.card.slice(); ST.phase = 'done'; ST.doneAt = Date.now(); hudAll(); tell(true);
      if (ST.m.length > 1) return;   /* a group goes on together: frame() moves everyone to the next hole once all are in */
      setTimeout(() => { if (!ST) return; if (ST.hole < ST.h1 - 1) showCard('next'); else finishRound(); }, 2300);
    }
    function finishRound() {
      ST.done = true; tell(true);
      const tot = ST.card.reduce((s, v) => s + v, 0), nm = K.boardWho && K.boardWho();
      if (nm && K.bestTell && tot >= 18 && ST.nine === 'full') K.bestTell('golf_round', nm, tot, Date.now() - ST.t0, 18);   /* the best rounds are eighteen holes */
      showCard('end');
    }
    /* ---------- the group's result: once every player has finished or left, each game works out the payouts the same way,
       tells the Bank every seat's share (the dealer's word) and claims its own (its coins back in the bag) ---------- */
    function totals() {
      const out = {};
      for (const x of ST.m) { const c = ST.cards[x[3]] || []; out[x[3]] = played(c) === ST.h1 - ST.h0 ? c.reduce((s, v) => s + (v || 0), 0) : null; }
      return out;   /* sn -> the round's total (its nine or eighteen), or null (left before the end) */
    }
    function payouts() {
      const T = totals(), sns = ST.m.map(x => x[3]), N = sns.length, buy = ST.buy, out = {};
      const fin = sns.filter(s => T[s] != null);
      if (!fin.length) { for (const s of sns) out[s] = buy; return out; }   /* everyone gone: every stake comes back */
      if (ST.f === 'pot') {
        const low = Math.min(...fin.map(s => T[s])), win = fin.filter(s => T[s] === low), each = Math.floor(buy * N / win.length);
        for (const s of sns) out[s] = win.indexOf(s) >= 0 ? each : 0; return out;
      }
      for (const i of sns) {
        let v = buy;
        for (const j of sns) {
          if (i === j) continue;
          const d = T[i] == null && T[j] == null ? 0 : T[i] == null ? -20 : T[j] == null ? 20 : Math.max(-20, Math.min(20, T[j] - T[i]));
          v += ST.a * d;
        }
        out[i] = Math.max(0, v);
      }
      return out;
    }
    function played(c) { let n = 0; for (let i = ST.h0; i < ST.h1; i++) if (c[i] > 0) n++; return n; }
    function allIn() { return ST.m.every(x => ST.quit[x[3]] || played(ST.cards[x[3]] || []) === ST.h1 - ST.h0); }
    function settle() {
      if (!ST || ST.settled || !ST.done || ST.buy <= 0 || !allIn()) return;
      ST.settled = true;
      const o = payouts(), addr = {}; for (const x of ST.m) addr[x[0]] = x[2];
      for (const x of ST.m) if (K.pkEvent) K.pkEvent({ e: 'pkout', p: x[0], s: seat(x[3]), n: o[x[3]] | 0 }, pid => addr[pid] || null);
      K.send({ c: 'golfcash', s: seat(ST.sn), n: o[ST.sn] | 0 });
      const mineN = o[ST.sn] | 0;
      K.hud.chat(mineN > ST.buy ? 'You win ' + (mineN - ST.buy) + ' GOLD on the round! The Bank pays it to your wallet.' : mineN === ST.buy ? 'Your stake of ' + ST.buy + ' GOLD comes back to you.' : mineN > 0 ? 'You get ' + mineN + ' GOLD of your ' + ST.buy + ' back.' : 'You lose your stake of ' + ST.buy + ' GOLD on the round.', 'trade');
    }
    function quitRound(silent) {
      if (!ST) return; clearKept();
      if (!ST.done && ST.buy > 0) K.send({ c: 'golfforfeit', s: seat(ST.sn) });   /* the operator: a player who leaves forfeits */
      if (K.netSend) K.netSend({ gf: { t: 'st', rid: ST.rid, sn: ST.sn, q: 1 } });
      endView(); ST = null; toClubhouse();
      if (!silent) K.hud.chat('You leave the round and walk back into the clubhouse.', 'sys');
    }
    function endView() {
      K.hud.golfClose(); E = null;
      const s = K.cam.save; K.cam.mode = null; if (s) { K.cam.yaw = K.cam.tyaw = s.yaw; K.cam.pitch = K.cam.tpitch = s.pitch; K.cam.dist = K.cam.tdist = s.dist; }
      if (K.camera) { K.camera.fov = 45; K.camera.updateProjectionMatrix(); }
      if (K.myEnt) { K.myEnt.restPose = null; }
      dropKit(MEK); MEK = null;
      if (K.PET && K.PET.away) K.PET.away(false);
    }
    function askQuit() {
      if (!ST) return;
      if (ST.done) { quitRound(true); return; }
      K.hud.golfCard('<h3>Leave the round?</h3><p>' + (ST.buy > 0 ? 'You have ' + ST.buy + ' GOLD on this round. If you leave now you forfeit it.' : 'Your card for this round will not count.') + '</p>',
        [{ id: 'leave', label: 'Leave' }, { id: 'stay', label: 'Keep playing' }], id => { K.hud.golfCardClose(); if (id === 'leave') quitRound(); });
    }
    /* ---------- [Claude 2026-10-22] REJOINING A ROUND. The operator: "If you're disconnected from a golf game, you should have 120 seconds to
       reconnect ... Like if you accidentally close the application while playing a round of golf, you should be able to rejoin that game."
       The round in progress is kept in the game's store (K.keep, with the time it was last alive) at every shot and every few seconds; a page
       opened within 2 min carries on the same round - hole, strokes, ball, card, group and stakes (no second green fee or stake: p.gf is in
       the save). The room id (K.netId) changes with a reload, so the others know a golfer by the round token every 'st' carries (tk; or the
       wallet address said at the starter): an 'st' for that seat with that token from a new id is that golfer back, under the new id. While a
       golfer is gone (their presence dropped, or 15 s without a word) the others hold the seat for 2 min, then treat them as having left (as
       the Leave button: the stake forfeits). A golfer back too late is told by the others' 'st' (x: the seats that left) and leaves too. ---------- */
    const REJOIN = () => +G.ASH_GOLF_REJOIN_MS > 0 ? +G.ASH_GOLF_REJOIN_MS : 120000, LOST = 15000;   /* (window.ASH_GOLF_REJOIN_MS: tests shorten the 2 min) */
    const GKEY = () => String(G.ASH_GOLF_KEY || 'ashvale3d.golf.v1');   /* (window.ASH_GOLF_KEY: tests give each page its own, as pages of one browser share its storage) */
    const BOOT = Date.now(), upTo = () => REJOIN() % 60000 ? Math.round(REJOIN() / 1000) + ' s' : REJOIN() / 60000 + ' min';
    const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
    let keptAt = 0, RESUME;   /* RESUME: the kept round read at the start (undefined: not read yet; null: none) */
    function keepRound(force, gone) {
      if (!K.keep) return;
      if (!ST || (ST.done && (ST.buy <= 0 || ST.settled))) { if (keptAt) clearKept(); return; }   /* nothing left to come back to */
      if (!force && Date.now() - keptAt < 4000) return; keptAt = Date.now();
      const r = { ph: ST.phase === 'fly' || ST.phase === 'done' ? ST.phase : 'aim', aim: +ST.aim.toFixed(4) };   /* a swing not yet struck ('go', a meter running) starts again from the address */
      for (const k of ['rid', 'f', 'a', 'm', 'sn', 'set', 'nine', 'hole', 'strokes', 'k', 'card', 'cards', 'quit', 'ball', 'sw', 'shot', 'tk', 'tok', 'buy', 't0', 'done', 'settled', 'st']) r[k] = ST[k];
      try { K.keep.set(GKEY(), JSON.stringify({ v: 1, at: Date.now(), gone: gone ? 1 : 0, ad: K.myAddr() || '', r })); } catch (e) { /* the store refused it: no rejoin */ }
    }
    function kept() { try { const o = JSON.parse((K.keep && K.keep.get(GKEY())) || 'null'); return o && o.v === 1 && o.r && typeof o.r.rid === 'string' && Array.isArray(o.r.m) && o.r.m.some(x => x[3] === o.r.sn) ? o : null; } catch (e) { return null; } }
    function clearKept() { keptAt = 0; if (K.keep) try { K.keep.set(GKEY(), ''); } catch (e) { /* none */ } }
    function tryResume() {   /* every frame while I have no round, until the kept one is taken up, gone stale or found not mine */
      if (RESUME === undefined) RESUME = kept(); if (!RESUME || LOBBY) return;
      const o = RESUME, r = o.r, age = Date.now() - o.at, ad = K.myAddr();
      if (o.ad && ad && o.ad !== ad) { RESUME = null; return; }   /* another wallet's round, left in this browser */
      if (age > REJOIN()) {   /* back too late: the round has gone on without me - as if I had left it */
        RESUME = null; clearKept();
        if (!r.done && r.buy > 0) K.send({ c: 'golfforfeit', s: 'golf:' + r.rid + ':' + r.sn });
        K.hud.chat('You were away from your round on the Saltmere Links for more than ' + upTo() + ', so it went on without you' + (!r.done && r.buy > 0 ? ' and your stake is forfeit.' : '.'), 'sys'); return;
      }
      if (!o.gone && age < 8000) return;   /* it may still be playing in another tab of this browser: only once that page went, or has been quiet 8 s */
      if (r.m.length > 1 && K.netId && String(K.netId()) === String(K.PID) && Date.now() - BOOT < 20000) return;   /* a group: wait for the room (the others know me again by my new room id) */
      RESUME = null;
      begin({ rid: r.rid, f: FMT[r.f] ? r.f : 'free', a: r.a | 0, m: r.m, nine: nineOf(r.nine) }, r);
    }
    function resumeAt(re) {
      const h = hole(); ST.wind = R.windFor(ST.rid, h.n); ST.rjAt = Date.now();
      setupShot(true); if (re.aim != null && !(ST.card[ST.hole] > 0)) ST.aim = ST.camYaw = +re.aim || ST.aim;
      const sh = ST.shot;
      if (re.ph === 'fly' && sh && (sh.n | 0) === ST.hole && Array.isArray(sh.fr) && sh.i) {   /* the shot I struck as the page went: it lands now (the others replayed it from the same swing) */
        try { const res = R.shot(C, { x: +sh.fr[0], y: +sh.fr[1] }, Object.assign({}, sh.i, { wind: sh.i.club === 'PT' ? [0, 0] : ST.wind, pin: h.pin }));
          ST.fly = res; ST.from = { x: +sh.fr[0], y: +sh.fr[1] }; ST.club = sh.i.club; ST.phase = 'fly'; ST.flyT = res.path.length ? res.path[res.path.length - 1][3] : 0; ST.wait = 0; } catch (err) { ST.phase = 'aim'; }
      } else if (re.ph === 'done' || ST.card[ST.hole] > 0 || ST.done) {
        ST.phase = 'done'; ST.doneAt = Date.now(); hudAll();
        if (ST.done) showCard('end'); else if (ST.m.length === 1) setTimeout(() => { if (!ST || ST.phase !== 'done') return; if (ST.hole < ST.h1 - 1) showCard('next'); else finishRound(); }, 1500);
      }
      goTo(ST.ball);
      K.hud.golfFlash('HOLE ' + h.n + ' · BACK IN THE ROUND', '', 1800);
      K.hud.chat('You are back in your round: hole ' + h.n + ', ' + (ST.phase === 'done' ? 'holed out.' : 'stroke ' + (ST.strokes + 1) + '.'), 'sys');
      tell(true);
    }
    function lost(sn, at) {   /* a golfer of my group has gone (presence dropped, or quiet): their seat is held */
      if (!ST || sn === ST.sn || ST.quit[sn] || ST.away[sn] || played(ST.cards[sn] || []) === ST.h1 - ST.h0) return;   /* (finished: nothing to wait for) */
      ST.away[sn] = at; K.hud.chat(nameOf(sn) + ' lost connection - waiting up to ' + upTo() + '.', 'sys');
    }
    function rejoin(id, g) {   /* an 'st' for a seat of my round: the same golfer under a new room id (a reload, a new connection)? */
      const m = ST.m.find(x => x[3] === g.sn); if (!m || ST.quit[g.sn]) return;
      const tk = typeof g.tk === 'string' ? g.tk.slice(0, 16) : '';
      if (String(m[0]) === String(id)) { if (tk && !ST.tok[g.sn]) ST.tok[g.sn] = tk; return; }
      const ok = ST.tok[g.sn] ? tk === ST.tok[g.sn] : !!(m[2] && g.ad && String(g.ad) === m[2]) || !!(tk && ST.away[g.sn]);
      if (!ok) return;
      const old = m[0], ox = RM.get(old); m[0] = id; if (ox) { dropKit(ox.k); RM.delete(old); }
      if (tk) ST.tok[g.sn] = tk;
      if (!RM.has(id) && g.sw != null) RM.set(id, { at: 0, sw: g.sw });   /* their last swing has been seen: not replayed */
      delete ST.away[g.sn]; ST.heard[g.sn] = Date.now(); K.hud.chat(m[1] + ' is back in the round.', 'sys'); keepRound(true);
    }
    /* ---------- telling the others (and hearing them) ---------- */
    let lastTell = 0;
    function tell(now) {
      if (!ST || !K.netSend) return;
      const quick = ST.m.length > 1 && (Math.abs(ST.aim - ST.toldAim) > 0.01 || ST.club !== ST.toldClub);   /* in a group the others' cameras stand behind my aim */
      if (!now && Date.now() - lastTell < (quick ? 400 : 2500)) return; lastTell = Date.now(); ST.toldAim = ST.aim; ST.toldClub = ST.club;
      K.netSend({ gf: { t: 'st', rid: ST.rid, sn: ST.sn, n: ST.hole, s: ST.strokes, k: ST.k, c: ST.card.join('.'), b: [+ST.ball.x.toFixed(2), +ST.ball.y.toFixed(2)], a: +ST.aim.toFixed(3), cl: ST.club, ph: ST.phase, sw: ST.sw, sh: ST.shot, d: ST.done ? 1 : 0, go: ST.go && Date.now() - ST.t0 < 20000 ? ST.go : undefined,
        tk: ST.tk, x: Object.keys(ST.quit).length ? Object.keys(ST.quit).map(Number) : undefined, ad: ST.rjAt && Date.now() - ST.rjAt < 30000 ? K.myAddr() || undefined : undefined } });   /* [Claude 2026-10-22] tk: who I am after a reload; x: the seats that left (one back too late hears it); ad: my wallet, just after a rejoin */
      if (now) keepRound(true);
    }
    function heard(id, g) {
      if (!g || typeof g !== 'object') return;
      if (g.t === 'grp') {   /* someone's group, open at the starter */
        if (typeof g.g !== 'string' || !Array.isArray(g.m)) return;
        if (g.x) { OPEN.delete(g.g); if (LOBBY && LOBBY.g === g.g && String(LOBBY.host) !== ME()) { LOBBY = null; K.hud.golfCardClose(); K.hud.chat('The group was called off.', 'sys'); } return; }
        OPEN.set(g.g, { g: g.g, host: id, hn: String(g.h || '').slice(0, 20), f: FMT[g.f] ? g.f : 'free', a: Math.max(0, Math.min(100000, g.a | 0)), nine: nineOf(g.nine), m: g.m.slice(0, 4), at: Date.now() });
        if (LOBBY && LOBBY.g === g.g && String(LOBBY.host) !== ME()) {
          /* 2026-10-20 ("party mode is not cycling"): the host says the group every 2 s; one said before my join reached the host
             does not list me yet - that is not "full". Not listed: ask again (my join may be lost); only a group of four for a while,
             or no answer in 15 s, sends me away (it dropped a third golfer, who then never teed off) */
          const listed = g.m.some(x => String(x[0]) === ME()), wait = Date.now() - (LOBBY.at || 0);
          if (listed) { LOBBY.m = g.m.slice(0, 4); lobbyCard(); }
          else if ((g.m.length >= 4 && wait > 6000) || wait > 15000) { LOBBY = null; K.hud.golfCardClose(); K.hud.chat(g.m.length >= 4 ? 'The group is full.' : 'The group did not hear you join - try again.', 'sys'); }
          else if (K.netSend && Date.now() - (LOBBY.asked || 0) > 1500) { LOBBY.asked = Date.now(); K.netSend({ gf: { t: 'join', g: LOBBY.g, nm: myName(), ad: K.myAddr() || '' } }); }
        }
        return;
      }
      if (g.t === 'join' && LOBBY && String(LOBBY.host) === ME() && g.g === LOBBY.g) {
        if (!LOBBY.m.some(x => String(x[0]) === String(id)) && LOBBY.m.length < 4) { LOBBY.m.push([id, String(g.nm || 'Golfer').slice(0, 20), String(g.ad || '').slice(0, 64)]); K.hud.chat(String(g.nm || 'A golfer') + ' joins your group.', 'sys'); }
        grpTell(); lobbyCard(); return;
      }
      if (g.t === 'leave' && LOBBY && String(LOBBY.host) === ME() && g.g === LOBBY.g) { LOBBY.m = LOBBY.m.filter(x => String(x[0]) !== String(id)); grpTell(); lobbyCard(); return; }
      if (g.t === 'go') { teeOff(g); return; }
      if (g.t === 'st') {
        if (g.go && typeof g.go === 'object') teeOff(g.go);   /* the host's first 'st's repeat the 'go' (a lost 'go' never leaves a member behind) */
        if (ST && g.rid === ST.rid && g.sn !== ST.sn) rejoin(id, g);   /* [Claude 2026-10-22] a golfer back under a new room id */
        const x = RM.get(id) || { at: 0 }; if (!x.at && x.sw == null && g.sw != null && g.ph !== 'go' && g.ph !== 'fly') x.sw = g.sw;   /* first heard with the ball at rest: its last swing is not replayed */
        x.g = g; x.at = Date.now(); RM.set(id, x);
        if (g.sh && g.sw != null && (!x.rest || x.rest.sw !== g.sw)) {   /* a new swing: where it comes to rest and when (pinfo: a golfer gone quiet after it has still landed) - worked out as it is heard, not as it is drawn (a hidden game draws nothing) */
          const sh = g.sh, inp = sh.i || {}, h2 = C.holes[Math.max(0, Math.min(17, sh.n | 0))]; let T = 0;
          try { const res = R.shot(C, { x: +sh.fr[0], y: +sh.fr[1] }, Object.assign({}, inp, { wind: inp.club === 'PT' ? [0, 0] : R.windFor(g.rid, h2.n), pin: h2.pin })); T = res.path.length ? res.path[res.path.length - 1][3] : 0; } catch (err) { T = 6; }
          if (Array.isArray(sh.at)) { x.rest = { sw: g.sw, n: sh.n | 0, b: sh.at, ho: !!sh.ho, at: Date.now() + (T / (inp.club === 'PT' ? 1 : 1.25) + 1.2) * 1000 };
            if (ST && g.rid === ST.rid) (ST.rest = ST.rest || {})[g.sn] = x.rest; }   /* kept with the round: a golfer's presence can come and go (a hidden tab, a phone asleep) and take its entry with it */
        }
        if (ST && g.rid === ST.rid && ST.m.some(m => m[3] === g.sn && String(m[0]) === String(id))) {
          ST.heard[g.sn] = Date.now(); ST.st[g.sn] = g;
          if (ST.away[g.sn]) { delete ST.away[g.sn]; if (!g.q) K.hud.chat(nameOf(g.sn) + ' is back in the round.', 'sys'); }
          if (Array.isArray(g.x) && g.x.indexOf(ST.sn) >= 0 && !ST.done && !ST.quit[g.sn]) {   /* [Claude 2026-10-22] they hold me as gone: I was away too long */
            K.hud.chat('You were away for more than ' + upTo() + ', so the round went on without you' + (ST.buy > 0 ? ' and your stake is forfeit.' : '.'), 'sys'); quitRound(true); return;
          }
          if (g.q) { ST.quit[g.sn] = 1; K.hud.chat(nameOf(g.sn) + ' leaves the round.', 'sys'); }
          else if (typeof g.c === 'string') ST.cards[g.sn] = g.c.split('.').map(v => Math.max(0, v | 0)).slice(0, 18);   /* by the hole: a back nine's card starts with nine empty holes */
          settle();
        }
      }
    }
    function teeOff(g) {   /* the host sent the group out: a round for everyone in it */
      if (typeof g.g !== 'string') return; OPEN.delete(g.g);
      if (!ST && LOBBY && g.g === LOBBY.g && Array.isArray(g.m) && g.m.some(x => String(x[0]) === ME())) {
        LOBBY = null; K.hud.golfCardClose(); begin({ rid: String(g.rid).slice(0, 40), f: FMT[g.f] ? g.f : 'free', a: g.a | 0, m: g.m, nine: nineOf(g.nine) });
      }
    }
    const nameOf = sn => { const m = ST && ST.m.find(x => x[3] === sn); return m ? m[1] : 'A golfer'; };
    /* ---------- turns (2026-10-20: "they need to take turns ... the farther alternate"). Every game works out whose
       shot it is from the same shared facts - each player's hole, shots this hole (k), ball (to the cm, as sent), card and
       whether their ball is moving - so all games agree without asking anyone. On a tee: hole 1 in group order, later
       holes the lowest score on the hole before first (ties keep the order). Once all have teed off: the ball farthest
       from the pin; holed (or picked-up) players are out of it; a player whose ball is in the air keeps the turn until
       their game sends where it came to rest (with k one up). ---------- */
    function pinfo(sn) {
      if (sn === ST.sn) return { n: ST.hole, k: ST.k, b: [+ST.ball.x.toFixed(2), +ST.ball.y.toFixed(2)], ph: ST.phase, c: ST.card };
      const g = ST.st[sn] || {};
      /* 2026-10-20 ("party mode is not cycling through the players"): a golfer whose game goes quiet after a swing (a phone
         locked, another app) never sends the 'st' that says the ball came to rest, and the group waited on a ball "in the air" for
         ever. The swing itself says where it comes to rest (sh.at, sh.ho, replayed here): once its flight is over, it has landed */
      if ((g.ph === 'go' || g.ph === 'fly') && g.sw != null) {
        const R0 = ST.rest && ST.rest[sn]; if (R0 && R0.sw === g.sw && Date.now() >= R0.at) {
        const c = (ST.cards[sn] || []).slice(); if (R0.ho && !(c[R0.n] > 0)) c[R0.n] = g.s | 0;
        return { n: g.n | 0, k: (g.k | 0) + 1, b: [+R0.b[0], +R0.b[1]], ph: R0.ho ? 'done' : 'aim', c }; }
      }
      return { n: g.n | 0, k: g.k | 0, b: Array.isArray(g.b) ? [+g.b[0], +g.b[1]] : null, ph: g.ph, c: ST.cards[sn] || [] };
    }
    function teeOrder(i) {
      let ord = ST.m.map(x => x[3]).sort((a, b) => a - b);
      const P = {}; for (const s of ord) P[s] = pinfo(s);
      for (let j = 0; j < i; j++) { const sc = s => P[s].c[j] > 0 ? P[s].c[j] : 99; ord = ord.map((s, ix) => [s, ix]).sort((p, q) => sc(p[0]) - sc(q[0]) || p[1] - q[1]).map(p => p[0]); }
      return ord.filter(s => !ST.quit[s]);
    }
    function turnOf(i) {   /* the seat whose shot it is on hole i, or null when everyone is in */
      const ord = teeOrder(i), h = C.holes[i], P = {}; for (const s of ord) P[s] = pinfo(s);
      for (const s of ord) if (P[s].n === i && (P[s].ph === 'go' || P[s].ph === 'fly')) return s;
      const left = ord.filter(s => !(P[s].c[i] > 0)); if (!left.length) return null;
      const t = left.find(s => (P[s].n === i ? P[s].k : 0) === 0); if (t != null) return t;
      let best = null, bd = -1;
      for (const s of left) { const b = P[s].n === i && P[s].b ? P[s].b : h.pts[0], d = Math.hypot(h.pin[0] - b[0], h.pin[1] - b[1]); if (d > bd + 1e-9) { bd = d; best = s; } }
      return best;
    }
    const myTurn = () => !!ST && turnOf(ST.hole) === ST.sn;
    const canAim = () => !!ST && ST.phase === 'aim' && myTurn();   /* my controls work only on my turn */
    /* ---------- the starter ---------- */
    /* 2026-10-20 ("a price per game and a selection for front nine or back nine in both the solo player or group player golf
       rounds, charge 25 gold each player for the front nine or the back nine or 50 gold each per player for the full 18"): the green
       fee goes to the club (core golffee), paid by every player as the round starts; cards stay indexed by the hole (0-17) */
    const NINES = { front: [0, 9, 25, 'the front nine'], back: [9, 18, 25, 'the back nine'], full: [0, 18, 50, 'all eighteen'] };
    const nineOf = v => NINES[v] ? v : 'full', feeOf = v => NINES[nineOf(v)][2];
    const nineOpts = [{ id: 'front', label: 'The front nine (holes 1-9) - 25 GOLD' }, { id: 'back', label: 'The back nine (holes 10-18) - 25 GOLD' }, { id: 'full', label: 'All eighteen - 50 GOLD' }, { id: 'no', label: 'Never mind' }];
    let talking = false;
    function grpTell(off) { if (LOBBY && K.netSend) K.netSend({ gf: { t: 'grp', g: LOBBY.g, h: myName(), f: LOBBY.f, a: LOBBY.a, nine: LOBBY.nine, m: LOBBY.m, x: off ? 1 : 0 } }); }
    function lobbyCard() {
      if (!LOBBY) return;
      const host = String(LOBBY.host) === ME(), b = buyIn(LOBBY.f, LOBBY.a, Math.max(2, LOBBY.m.length));
      const rows = LOBBY.m.map((x, i) => '<p>' + (i + 1) + '. ' + K.esc(x[1]) + (String(x[0]) === String(LOBBY.host) ? ' (opened the group)' : '') + '</p>').join('');
      const stake = LOBBY.f === 'free' ? 'A friendly round - no GOLD on it.' : LOBBY.f === 'pot' ? 'Winner takes the pot: ' + LOBBY.a.toLocaleString() + ' GOLD each.' : 'Per stroke: ' + LOBBY.a.toLocaleString() + ' GOLD a stroke (stake ' + b.toLocaleString() + ' GOLD each with ' + Math.max(2, LOBBY.m.length) + ' players; what you do not lose comes back).';
      K.hud.golfCard('<h3>Your group</h3><p>' + K.esc(NINES[nineOf(LOBBY.nine)][3][0].toUpperCase() + NINES[nineOf(LOBBY.nine)][3].slice(1)) + ' · green fee ' + feeOf(LOBBY.nine) + ' GOLD each.</p><p>' + stake + '</p>' + rows + '<p>' + (host ? 'Tee off when everyone is here (up to four).' : 'Waiting for the group to tee off.') + '</p>',
        host ? [{ id: 'go', label: 'Tee off' }, { id: 'off', label: 'Call it off' }] : [{ id: 'leave', label: 'Leave the group' }],
        id => {
          if (id === 'go') {
            if (LOBBY.f !== 'free' && LOBBY.m.length < 2) { K.hud.chat('A round for GOLF needs at least two players.', 'warn'); return; }
            const rid = ME().slice(-6) + Date.now().toString(36), m = LOBBY.m.map((x, i) => [x[0], x[1], x[2], i + 1]);
            const o = { rid, f: LOBBY.f, a: LOBBY.a, m, nine: nineOf(LOBBY.nine) };
            const go = Object.assign({ g: LOBBY.g }, o);
            if (K.netSend) K.netSend({ gf: Object.assign({ t: 'go' }, go) });
            LOBBY = null; K.hud.golfCardClose(); begin(o); if (ST) ST.go = go;   /* (no 'grp' closing message after it: the game's net keeps only the newest 'gf' message in its queue, so one sent next could drop the 'go' - the 'go' itself closes the group, and my first 'st's repeat it) */
          } else if (id === 'off') { grpTell(true); LOBBY = null; K.hud.golfCardClose(); }
          else { if (K.netSend) K.netSend({ gf: { t: 'leave', g: LOBBY.g } }); LOBBY = null; K.hud.golfCardClose(); }
        });
    }
    function openGroup(f, a, nine) {
      LOBBY = { g: ME().slice(-6) + Date.now().toString(36), host: ME(), f, a, nine: nineOf(nine), m: [[ME(), myName(), K.myAddr() || '']], at: Date.now() };
      grpTell(); lobbyCard();
    }
    function talk() {
      if (ST || talking) return; talking = true;
      const done = () => { talking = false; };
      const set = bestSet(), coins = K.coins();
      const intro = ['Welcome to the Saltmere Links! Eighteen holes along the coast, with the sea wind for company.', 'Press once to start your swing, again to set the power - the gold MAX mark is a full shot, right on it a little extra - and a third time when the marker is back on the line.'];
      if (!set) { K.hud.dialog(FERGUS, intro.concat(['You will need a set of clubs first. Isla sells them over at the counter - a Starter set is 500 GOLD.']), done); return; }
      const open = Array.from(OPEN.values()).filter(o => Date.now() - o.at < 8000 && o.m.length < 4 && String(o.host) !== ME());
      const opts = [{ id: 'solo', label: 'Play a round on my own' }, { id: 'group', label: 'Open a group' }];
      for (const o of open.slice(0, 3)) opts.push({ id: 'join:' + o.g, label: 'Join ' + K.esc(o.hn) + '\'s group (' + FMT[o.f] + (o.f !== 'free' ? ', ' + o.a.toLocaleString() + ' GOLD' + (o.f === 'stroke' ? ' a stroke' : '') : '') + ', ' + NINES[nineOf(o.nine)][3] + ')' });
      opts.push({ id: 'board', label: 'Best rounds' }, { id: 'no', label: 'Not now' });
      const ask = () => K.hud.dialog(FERGUS, ['Your ' + R.SETS[set].name + ' is ready. What will it be?'], pick => {
        if (pick === 'solo') K.hud.dialog(FERGUS, ['Which holes will you play? The green fee is paid as you tee off.'], nine => { done(); if (!NINES[nine]) return;
          if (coins < feeOf(nine)) { K.hud.chat('The green fee is ' + feeOf(nine) + ' GOLD - you need it in your pack.', 'warn'); return; }
          begin({ rid: ME().slice(-6) + Date.now().toString(36), f: 'free', a: 0, m: [[ME(), myName(), K.myAddr() || '', 1]], nine }); }, nineOpts);
        else if (pick === 'group') K.hud.dialog(FERGUS, ['Which holes will the group play? Everyone pays the green fee as you tee off.'], nine => { if (!NINES[nine]) { done(); return; }
          if (coins < feeOf(nine)) { done(); K.hud.chat('The green fee is ' + feeOf(nine) + ' GOLD - you need it in your pack.', 'warn'); return; }
          K.hud.dialog(FERGUS, ['A group of up to four. Do you play for GOLF?'], f => {
          if (f === 'free') { done(); openGroup('free', 0, nine); return; }
          if (f !== 'pot' && f !== 'stroke') { done(); return; }
          const amts = f === 'pot' ? [100, 1000, 10000] : [10, 100, 1000];
          K.hud.dialog(FERGUS, [f === 'pot' ? 'Everyone puts up the same stake; the lowest score takes the lot (a tie splits it). How much?' : 'Each player pays everyone who beats them this much for every stroke between them - at most 20 strokes a pair. Your stake covers the most you could lose; what you do not lose comes back. How much a stroke?'], a => {
            done(); const n = +a; if (!(n > 0)) return;
            const need = buyIn(f, n, 2) + feeOf(nine); if (coins < need) { K.hud.chat('You need at least ' + need.toLocaleString() + ' GOLD in your pack for that (the stake and the green fee).', 'warn'); return; }
            openGroup(f, n, nine);
          }, amts.map(n => ({ id: String(n), label: n.toLocaleString() + ' GOLD' + (f === 'stroke' ? ' a stroke' : '') })).concat([{ id: 'no', label: 'Never mind' }]));
        }, [{ id: 'free', label: 'Just for fun' }, { id: 'pot', label: 'Winner takes the pot' }, { id: 'stroke', label: 'Per stroke' }, { id: 'no', label: 'Never mind' }]); }, nineOpts);
        else if (String(pick).startsWith('join:')) {
          done(); const o = OPEN.get(pick.slice(5)); if (!o) { K.hud.chat('That group has gone.', 'sys'); return; }
          const need = buyIn(o.f, o.a, Math.min(4, o.m.length + 1)) + feeOf(o.nine); if (o.f === 'stroke' ? coins < 20 * o.a * 3 + feeOf(o.nine) && coins < need : coins < need) { K.hud.chat('You need ' + need.toLocaleString() + ' GOLD in your pack to join that group.', 'warn'); return; }
          LOBBY = { g: o.g, host: o.host, f: o.f, a: o.a, nine: o.nine, m: o.m.concat([[ME(), myName(), K.myAddr() || '']]), at: Date.now() };
          if (K.netSend) K.netSend({ gf: { t: 'join', g: o.g, nm: myName(), ad: K.myAddr() || '' } }); lobbyCard();
        }
        else if (pick === 'board') { if (K.scoresAsk) K.scoresAsk(true); K.hud.dialog(FERGUS, K.core.scoreRead('golf_round'), () => ask()); }
        else done();
      }, opts);
      K.hud.dialog(FERGUS, intro, () => ask());
    }
    /* ---------- the scorecard ---------- */
    function showCard(mode) {
      if (!ST) return;
      const rows = [0, 9].filter(o => o >= ST.h0 && o < ST.h1).map(o => C.holes.slice(o, o + 9)), who = ST.m.map(x => [x[3], x[1]]);
      let html = '<h3>The Saltmere Links</h3>';
      for (const part of rows) {
        html += '<table><tr><th>' + (part[0].n > 9 ? 'IN' : 'OUT') + '</th>' + part.map(h => '<td>' + h.n + '</td>').join('') + '<td>Σ</td></tr><tr><th>Par</th>' + part.map(h => '<td>' + h.par + '</td>').join('') + '<td>' + part.reduce((s, h) => s + h.par, 0) + '</td></tr>';
        for (const [sn, nm] of who) {
          const c = sn === ST.sn ? ST.card : ST.cards[sn] || [];
          html += '<tr><th>' + K.esc(nm) + (ST.quit[sn] ? ' ✕' : '') + '</th>' + part.map(h => { const v = c[h.n - 1]; return '<td class="' + (v ? (v < h.par ? 'u' : v > h.par ? 'o' : '') : '') + '">' + (v || '') + '</td>'; }).join('') + '<td>' + (part.reduce((s, h) => s + (c[h.n - 1] || 0), 0) || '') + '</td></tr>';
        }
        html += '</table>';
      }
      const tot = ST.card.reduce((s, v) => s + (v || 0), 0), par = ST.card.reduce((s, v, i) => s + (v ? C.holes[i].par : 0), 0), tv = tot - par;
      html += '<p>You: <b>' + tot + '</b> (' + (tv === 0 ? 'even' : (tv > 0 ? '+' : '') + tv) + ')' + (ST.buy > 0 ? ' · ' + FMT[ST.f] + ', ' + ST.a.toLocaleString() + ' GOLD' + (ST.f === 'stroke' ? ' a stroke' : '') : '') + '</p>';
      if (mode === 'end' && ST.buy > 0 && !allIn()) html += '<p>Waiting for the others to finish before the stakes are paid out.</p>';
      if (mode === 'group') html += '<p>' + (ST.hole < ST.h1 - 1 ? 'Everyone is in. On to hole ' + (ST.hole + 2) + '...' : 'Everyone is in.') + '</p>';
      const btns = mode === 'group' ? [] : mode === 'next' ?[{ id: 'next', label: 'Next hole' }, { id: 'look', label: 'Look' }] : mode === 'end' ? [{ id: 'end', label: 'Back to the clubhouse' }] : [{ id: 'close', label: 'Close' }];
      K.hud.golfCard(html, btns, id => {
        K.hud.golfCardClose();
        if (id === 'next' && ST) startHole(ST.hole + 1);
        else if (id === 'look' && ST) setTimeout(() => { if (ST && ST.phase === 'done') showCard('next'); }, 4000);
        else if (id === 'end' && ST) { const keep = ST.buy > 0 && !ST.settled; if (keep) { K.hud.chat('The stakes are paid when the others finish - stay in sight of the course, or come back later.', 'sys'); } finishLeave(); }
      });
    }
    /* 2026-10-20 ("if somebody leaves the game, they should be transported back into the clubhouse"): leaving a round - the
       Leave button or the card at the end - puts you inside the clubhouse (zone.golf returnTo, where a save made on the course loads),
       never out on the course behind the railing */
    const CLUBHOUSE = [635, -118];
    const toClubhouse = () => K.send({ c: 'golfgo', x: CLUBHOUSE[0], y: CLUBHOUSE[1] });
    function finishLeave() { const P = ST; clearKept(); endView(); PENDING = P && P.buy > 0 && !P.settled ? P : null; ST = null; toClubhouse(); }
    let PENDING = null;   /* a finished round whose stakes wait for the others: settled in the background */
    /* ---------- the HUD's numbers ---------- */
    function hudAll() {
      if (!E || !ST) return;
      const h = hole(), d = Math.hypot(h.pin[0] - ST.ball.x, h.pin[1] - ST.ball.y);
      const tot = ST.card.reduce((s, v) => s + (v || 0), 0), par = ST.card.reduce((s, v, i) => s + (v ? C.holes[i].par : 0), 0), tv = tot - par;
      E.top.innerHTML = '<div class="hn">HOLE <b>' + h.n + '</b></div><div>PAR <b>' + h.par + '</b> · ' + h.yd + ' yd</div><div>STROKE <b>' + (ST.strokes + 1) + '</b> · ' + (tv === 0 ? 'E' : (tv > 0 ? '+' : '') + tv) + '</div><div>TO PIN <b>' + (d < 8 && 'ge'.includes(C.surf(ST.ball.x, ST.ball.y)) ? ft(d) + ' ft' : yd(d) + ' yd') + '</b></div>';
      const c = clubObj(), surf = C.surf(ST.ball.x, ST.ball.y);
      E.club.querySelector('.cn').textContent = c.id === 'PT' ? (ST.range === 'short' ? 'Putter · short' : 'Putter · long') : c.name;
      E.club.querySelector('.cd').textContent = c.id === 'PT' ? 'up to ' + ft(R.PUTT[ST.range]) + ' ft' : yd(reachNow()) + ' yd';
      E.lie.innerHTML = '<span>' + ({ t: 'Tee', f: 'Fairway', e: 'Fringe', g: 'Green', r: 'Rough', h: 'Heavy rough', s: 'Bunker', x: 'Path' }[surf] || '') + '</span><b>' + Math.round(R.lieOf(surf, c) * 100) + '%</b>';
      for (const b of E.spin.querySelectorAll('button')) b.classList.toggle('on', b.dataset.s === ST.spin);
      for (const b of E.putt.querySelectorAll('button')) b.classList.toggle('on', b.dataset.r === ST.range);
      E.spin.style.display = c.id === 'PT' ? 'none' : ''; E.putt.style.display = c.id === 'PT' ? '' : 'none';
      E.lab.textContent = c.id === 'PT' ? ft(R.PUTT[ST.range]) + ' ft' : yd(reachNow()) + ' yd';
      drawMap();
    }
    function hudLive() {
      if (!E || !ST) return;
      const w = ST.wind, sp = Math.hypot(w[0], w[1]), a = Math.atan2(w[1], w[0]) - ST.camYaw;
      const ar = E.wind.querySelector('.arrow'); ar.style.transform = 'rotate(' + (a * 180 / Math.PI + 90) + 'deg)'; ar.style.opacity = sp < 0.3 ? 0.25 : 1;
      E.wind.querySelector('.ws').textContent = Math.round(sp * 2.237) + ' mph';
      const toX = v => 100 - (v + 14) / 114 * 100, pct = v => v + '%';
      E.mark.style.left = pct(toX(ST.meter));
      const top = ST.phase === 'rise' ? ST.meter : ST.phase === 'aim' ? 0 : ST.stop;
      E.fill.style.left = pct(toX(top)); E.fill.style.width = pct(toX(0) - toX(top));
      E.pow.style.display = ST.phase === 'fall' || ST.phase === 'go' ? 'block' : 'none'; E.pow.style.left = pct(toX(ST.stop));
      const h = hole(), d = Math.hypot(h.pin[0] - ST.ball.x, h.pin[1] - ST.ball.y), pt = clubObj().id === 'PT', v = pt ? d / reachNow() * 100 : d / reachNow() * LINE;
      E.pin.style.display = v > 1 && v <= 100 ? 'block' : 'none'; E.pin.style.left = pct(toX(v));
      const tol = R.SETS[ST.set].line; E.max.style.display = pt ? 'none' : 'block'; E.max.style.left = pct(toX(LINE + tol)); E.max.style.width = pct(toX(LINE - tol) - toX(LINE + tol));
      E.zero.style.left = pct(toX(0)); E.sweet.style.left = pct(toX(WIN())); E.sweet.style.width = pct(toX(-WIN()) - toX(WIN()));
      E.meter.classList.toggle('live', ST.phase === 'rise' || ST.phase === 'fall');
      const wait = ST.m.length > 1 && ST.turn != null && ST.turn !== ST.sn;   /* someone else's shot: my meter and buttons rest */
      const bt = wait ? 'WAIT' : ST.phase === 'aim' ? (tapNow() ? 'TAP IN' : clubObj().id === 'PT' ? 'PUTT' : 'SWING') : ST.phase === 'rise' ? (clubObj().id === 'PT' ? 'HIT' : 'POWER') : ST.phase === 'fall' ? 'HIT' : '…';
      if (E.swingBtn.textContent !== bt) E.swingBtn.textContent = bt;   /* only when it changes: a node rewritten every frame under the finger can swallow a tap on a phone */
      if (E.swing) { E.swing.classList.toggle('off', wait); E.swing.classList.toggle('tapin', !wait && ST.phase === 'aim' && tapNow()); }
      for (const n of [E.club, E.aim, E.spin, E.putt]) if (n) n.classList.toggle('off', wait || ST.phase !== 'aim');
      if (E.waitMsg) { const aw = wait && ST.away[ST.turn], txt = !wait ? '' : aw ? nameOf(ST.turn) + ' lost connection - waiting up to ' + mmss(REJOIN() - (Date.now() - aw)) : 'Waiting: ' + nameOf(ST.turn) + ' is playing'; if (E.waitMsg.textContent !== txt) E.waitMsg.textContent = txt; E.waitMsg.style.display = wait ? 'block' : 'none'; }
    }
    const MAPC = { t: '#8ccc5e', f: '#86c45a', e: '#7cbd56', g: '#a7e57a', r: '#5f9a40', h: '#3f6b2c', s: '#e6d6a0', w: '#3f7fbf', o: '#2f6aa6', x: '#a98a5a', c: '#8a7a5a' };
    let mapCache = null;
    function drawMap() {
      if (!E) return;
      const cv = E.map, g = cv.getContext('2d'), h = hole(), W = cv.width, H = cv.height;
      const xs = h.pts.map(p => p[0]).concat([h.pin[0]]), zs = h.pts.map(p => p[1]).concat([h.pin[1]]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      const up = Math.atan2(h.pin[1] - h.pts[0][1], h.pin[0] - h.pts[0][0]), span = Math.max(40, Math.hypot(h.pin[0] - h.pts[0][0], h.pin[1] - h.pts[0][1]) + 28), sc = H / span;
      const rot = -Math.PI / 2 - up, cr = Math.cos(rot), sr = Math.sin(rot);
      const P = (x, z) => [W / 2 + ((x - cx) * cr - (z - cz) * sr) * sc, H / 2 + ((x - cx) * sr + (z - cz) * cr) * sc];
      if (!mapCache || mapCache.key !== h.n) {
        const im = g.createImageData(W, H);
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
          const u = (i - W / 2) / sc, v = (j - H / 2) / sc, x = cx + u * cr + v * sr, z = cz - u * sr + v * cr, c = MAPC[C.surf(x, z)] || '#3f6b2c', k = (j * W + i) * 4;
          im.data[k] = parseInt(c.slice(1, 3), 16); im.data[k + 1] = parseInt(c.slice(3, 5), 16); im.data[k + 2] = parseInt(c.slice(5, 7), 16); im.data[k + 3] = 255;
        }
        mapCache = { key: h.n, im };
      }
      g.putImageData(mapCache.im, 0, 0);
      const b = P(ST.ball.x, ST.ball.y), reach = reachNow(), t = P(ST.ball.x + Math.cos(ST.aim) * reach, ST.ball.y + Math.sin(ST.aim) * reach), p = P(h.pin[0], h.pin[1]);
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.setLineDash([3, 3]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(t[0], t[1]); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#ffe25a'; g.lineWidth = 2; g.beginPath(); g.arc(t[0], t[1], 4, 0, 7); g.stroke();
      g.fillStyle = '#d8312a'; g.fillRect(p[0] - 1, p[1] - 9, 2, 9); g.beginPath(); g.moveTo(p[0] + 1, p[1] - 9); g.lineTo(p[0] + 7, p[1] - 7); g.lineTo(p[0] + 1, p[1] - 5); g.fill();
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(b[0], b[1], 3, 0, 7); g.fill(); g.stroke();
    }
    /* ---------- aim marks, the putting grid ---------- */
    let marks = null;
    function aimMarks() {
      if (marks) return marks;
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 32), new THREE.MeshBasicMaterial({ color: 0xffe25a, transparent: true, opacity: 0.85, depthTest: false })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 5;
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.8, depthTest: false })); line.renderOrder = 4;
      const grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
      const dotPos = new Float32Array(260 * 3), dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xfff6a8, size: 0.045 })); dots.geometry.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
      for (const m of [ring, line, grid, dots]) K.scene.add(m);
      marks = { ring, line, grid, dots, dotPos, seed: [], gridFor: 0 }; return marks;
    }
    function hideMarks() { if (marks) for (const k of ['ring', 'line', 'grid', 'dots']) marks[k].visible = false; }
    function newDot(h) { for (let t = 0; t < 30; t++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 8, x = h.green[0] + Math.cos(a) * r, z = h.green[1] + Math.sin(a) * r; if (C.surf(x, z) === 'g') return { x, z, life: 1 + Math.random() * 2 }; } return { x: h.green[0], z: h.green[1], life: 0 }; }
    function drawMarks(dt) {
      const M = aimMarks(), h = hole(), c = clubObj(), aiming = ST.phase !== 'fly' && ST.phase !== 'done' && ST.phase !== 'go' && ST.turn === ST.sn;
      M.ring.visible = M.line.visible = aiming;
      if (aiming) {
        const reach = reachNow(), tx = ST.ball.x + Math.cos(ST.aim) * reach, tz = ST.ball.y + Math.sin(ST.aim) * reach;
        M.ring.position.set(tx, gY(tx, tz) + 0.08, tz); M.ring.scale.setScalar(c.id === 'PT' ? 0.3 : 1 + reach / 60);
        const gY0 = gY(ST.ball.x, ST.ball.y), gY1 = gY(tx, tz), pts = []; for (let k = 0; k <= 30; k++) { const u = k / 30, x = ST.ball.x + (tx - ST.ball.x) * u, z = ST.ball.y + (tz - ST.ball.y) * u, arc = c.id === 'PT' ? 0 : Math.sin(u * Math.PI) * reach * 0.05; pts.push(new THREE.Vector3(x, (c.id === 'PT' ? gY(x, z) : gY0 + (gY1 - gY0) * u) + 0.09 + arc, z)); }   /* in the air a smooth arc, not the ground's contour (a putt hugs the green) */
        M.line.geometry.dispose(); M.line.geometry = new THREE.BufferGeometry().setFromPoints(pts); M.line.computeLineDistances();
      }
      const putting = aiming && c.id === 'PT' && 'ge'.includes(C.surf(ST.ball.x, ST.ball.y));
      M.grid.visible = M.dots.visible = putting; if (!putting) return;
      if (M.gridFor !== h.n) {
        M.gridFor = h.n; const [gx, gz] = h.green, P = [];
        for (let a = -9; a <= 9; a += 0.75) for (let b = -9; b < 9; b += 0.25) for (const [x1, z1, x2, z2] of [[gx + a, gz + b, gx + a, gz + b + 0.25], [gx + b, gz + a, gx + b + 0.25, gz + a]]) {
          if (!'ge'.includes(C.surf(x1, z1)) || !'ge'.includes(C.surf(x2, z2))) continue; P.push(x1, gY(x1, z1) + 0.05, z1, x2, gY(x2, z2) + 0.05, z2);
        }
        M.grid.geometry.dispose(); M.grid.geometry = new THREE.BufferGeometry(); M.grid.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
        M.seed = []; for (let k = 0; k < 260; k++) M.seed.push(newDot(h));
      }
      M.seed.forEach((d, k) => { const g = C.grad(d.x, d.z); d.x -= g[0] * dt * 40; d.z -= g[1] * dt * 40; d.life -= dt; if (d.life <= 0 || C.surf(d.x, d.z) !== 'g') Object.assign(d, newDot(h)); M.dotPos.set([d.x, gY(d.x, d.z) + 0.07, d.z], k * 3); });
      M.dots.geometry.attributes.position.needsUpdate = true;
    }
    /* ---------- input while playing ---------- */
    const keys = {};
    function cycleClub(d) {
      if (!canAim()) return;
      const list = R.CLUBS.filter(c => c.id !== '1W' || C.surf(ST.ball.x, ST.ball.y) === 't'), i = list.findIndex(c => c.id === ST.club);
      ST.club = list[(i + d + list.length) % list.length].id; ST.range = R.puttRange(C, ST.ball, hole().pin); hudAll();
    }
    if (typeof window !== 'undefined') {
      /* The operator's phone (2026-10-20 recording): after SWING, the POWER and HIT taps never arrived - the meter ran to the end
         (OVERSWING) and back (MISHIT). While the meter runs, a touch ANYWHERE on the screen is the next press (any game's own
         way: press A anywhere), heard first, before the page or the HUD can eat it; the 250 ms guard in press() keeps one touch
         from counting twice (touchstart and pointerdown both arrive) */
      const anyTap = e => { if (!ST || !E || (ST.phase !== 'rise' && ST.phase !== 'fall')) return; if (e.cancelable) e.preventDefault(); e.stopPropagation(); press(); };
      window.addEventListener('touchstart', anyTap, { capture: true, passive: false });
      window.addEventListener('pointerdown', anyTap, true);
      window.addEventListener('keydown', e => {
        if (!ST || !E) return; const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
        const k = e.code; let used = true;
        if (k === 'Space' || k === 'Enter') { if (!e.repeat) press(); }
        else if (k === 'KeyQ' || k === 'ArrowUp') cycleClub(-1);
        else if (k === 'KeyE' || k === 'ArrowDown') cycleClub(1);
        else if (k === 'ArrowLeft' || k === 'KeyA') keys.l = 1;
        else if (k === 'ArrowRight' || k === 'KeyD') keys.r = 1;
        else if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') { if (canAim()) { if (clubObj().id === 'PT') ST.range = k === 'Digit1' ? 'short' : 'long'; else ST.spin = k === 'Digit1' ? 'top' : k === 'Digit2' ? 'none' : 'back'; hudAll(); } }
        else if (k === 'KeyC') showCard();
        else if (k === 'Escape') { if (K.hud.golfCardOpen()) K.hud.golfCardClose(); else askQuit(); }
        else used = false;
        if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      /* [Claude 2026-10-22] the round is kept as the page goes (gone: a reload or a reopened app may take it up at once) */
      window.addEventListener('pagehide', () => keepRound(true, true));
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) keepRound(true); });
      window.addEventListener('keyup', e => { if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = 0; if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = 0; }, true);
    }
    let drag = null;
    function dragStart(x) { if (canAim()) drag = { x, a: ST.aim }; }
    function dragMove(x) { if (drag && canAim()) { ST.aim = drag.a + (x - drag.x) * (clubObj().id === 'PT' ? 0.0015 : 0.004); } }
    if (K.renderer && K.renderer.domElement) {
      const cv = K.renderer.domElement;
      cv.addEventListener('pointerdown', e => { if (ST) dragStart(e.clientX); });
      cv.addEventListener('pointermove', e => { if (ST) dragMove(e.clientX); });
      for (const t of ['pointerup', 'pointercancel']) cv.addEventListener(t, () => { drag = null; });
    }
    /* ---------- every frame ---------- */
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
    let rmT = 0;
    function frame(nowMs, dt) {
      const P = K.core.S.players[K.PID]; if (!P) return;
      if (!built) { if (nearCourse(P.x, P.y) && K.heightAt) built = build(); else if (!ST) return; }
      if (!ST) tryResume();   /* [Claude 2026-10-22] a round kept by the page before this one */
      for (const [g, o] of OPEN) if (Date.now() - o.at > 15000) OPEN.delete(g);
      if (LOBBY && String(LOBBY.host) === ME() && Date.now() - (LOBBY.told || 0) > 2000) { LOBBY.told = Date.now(); grpTell(); }
      if (PENDING) { ST = PENDING; settle(); if (ST.settled) PENDING = null; ST = null; }
      waveFlags(nowMs, ST ? ST.wind : [2, 1]);
      drawRemotes(dt);
      if (!ST) { hideMarks(); if (built) for (const f of built.flags) { f.userData.stick.visible = true; for (const m of f.userData.lip) { m.scale.setScalar(1); m.material.depthTest = true; } } return; }
      if (ST.buy > 0 && ST.done) settle();
      ST.m.find(x => x[3] === ST.sn)[0] = ME();   /* [Claude 2026-10-22] my room id, which a new connection changes */
      /* [Claude 2026-10-22] the operator: "you should have 120 seconds to reconnect": a golfer gone (presence dropped, or 15 s quiet) keeps the seat
         2 min - play waits on them when it is their shot - then they leave the round as with Leave (the operator: leaving or dropping forfeits) */
      for (const x of ST.m) { const s = x[3]; if (s === ST.sn || ST.quit[s]) continue;
        if (!ST.away[s] && Date.now() - (ST.heard[s] || 0) > LOST) lost(s, ST.heard[s] || Date.now());
        if (ST.away[s] && Date.now() - ST.away[s] > REJOIN()) { delete ST.away[s]; ST.quit[s] = 1; K.hud.chat(x[1] + ' did not come back within ' + upTo() + ', so they leave the round' + (ST.buy > 0 ? ' and forfeit.' : '.'), 'sys'); settle(); keepRound(true); }
      }
      ST.turn = turnOf(ST.hole);
      if (ST.rjAt && Date.now() - ST.rjAt < 20000 && ST.phase === 'aim' && Date.now() - (ST.goAt2 || 0) > 2000) { ST.goAt2 = Date.now(); goTo(ST.ball); }   /* just back: out to my ball (a golfgo sent before the world was ready goes again) */
      if (ST.m.length > 1 && ST.phase === 'done' && !ST.done && ST.turn == null && Date.now() - ST.doneAt > 2300) {   /* the whole group is in: the card for a moment, then on together */
        if (!ST.advAt) { ST.advAt = Date.now() + 4000; showCard('group'); }
        else if (Date.now() >= ST.advAt) { ST.advAt = 0; K.hud.golfCardClose(); if (ST.hole < ST.h1 - 1) startHole(ST.hole + 1); else finishRound(); }
      }
      if (aimHold) turn(aimHold, dt); if (keys.l) turn(-1, dt); if (keys.r) turn(1, dt);
      stepMeter(dt);
      const c = clubObj(), h = hole();
      if (ST.phase === 'fly') {
        const r = ST.fly, PP = r.path, speed = c.id === 'PT' ? 1 : 1.25; ST.flyT += dt * speed;
        let k = 0; while (k < PP.length - 1 && PP[k + 1][3] <= ST.flyT) k++;
        const a = PP[k], b = PP[Math.min(PP.length - 1, k + 1)], u = b[3] > a[3] ? Math.min(1, (ST.flyT - a[3]) / (b[3] - a[3])) : 1;
        const FY = r.fy || (r.fy = pathY(PP));
        placeBall(MEK, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, h.pin, FY[k] + (FY[Math.min(PP.length - 1, k + 1)] - FY[k]) * u); MEK.trail.geometry.setDrawRange(0, k + 1);
        if (ST.flyT >= PP[PP.length - 1][3]) { ST.wait += dt; if (ST.wait > (c.id === 'PT' ? 0.5 : 0.9)) { ST.wait = 0; landed(); } }
      }
      /* my avatar at the ball (the game's tile is the ball's tile; here it stands where a golfer stands) */
      const e = K.myEnt, gb = ST.phase === 'fly' || ST.phase === 'done' ? (ST.from || ST.ball) : ST.ball;
      const ws = ST.phase === 'go' || ST.phase === 'fly' ? null : watchSpot(ST.sn);
      if (e && e.root && ws) watchAt(e, MEK, ws);
      else if (e && e.root) {
        standAt(e, MEK, [gb.x, gb.y], ST.aim);
        if (ST.phase === 'aim' || ST.phase === 'rise' || ST.phase === 'fall') e.restPose = c.id === 'PT' ? 'puttaddress' : 'golfaddress';
        else if (ST.phase === 'fly' || ST.phase === 'done') e.restPose = c.id === 'PT' ? 'puttaddress' : 'golffinish';
        drawClub(MEK, e.H, e.root, [gb.x, gb.y], ST.aim, ST.club, ST.phase === 'aim');
      }
      drawMarks(dt);
      if (built) for (const f of built.flags) {
        const out = f === built.flags[ST.hole] && (C.surf(gb.x, gb.y) === 'g' || c.id === 'PT'); f.userData.stick.visible = !out;   /* the operator: the flag comes out while you putt */
        let sc = 1; if (out) { const d = Math.hypot(h.pin[0] - gb.x, h.pin[1] - gb.y); sc = Math.min(3, Math.max(1, d / 5)); }   /* a long putt: the hole a touch bigger so it reads from the ball */
        for (const m of f.userData.lip) { m.scale.setScalar(sc); m.material.depthTest = !out; }
      }
      hudLive(); if (ST.phase === 'aim') drawMap();
      tell(false); keepRound(false);
    }
    function turn(d, dt) { if (canAim()) ST.aim += d * dt * (clubObj().id === 'PT' ? 0.25 : 0.5); }
    /* the other golfers on the course: their ball, its flight from their swing, their avatar at their ball, swinging */
    function drawRemotes(dt) {
      for (const [id, x] of RM) {
        const g = x.g, live = g && !g.q && !g.d && Date.now() - x.at < 15000;
        const r = remoteOf(id);   /* (K.remoteEnt gives the ent itself: r.e was always undefined, so the others never stood at their balls) */
        if (!live || !Array.isArray(g.b)) { if (x.k) { dropKit(x.k); x.k = null; if (r) r.restPose = null; } if (Date.now() - x.at > 60000) RM.delete(id); continue; }
        if (!x.k) x.k = kit();
        const hl = C.holes[Math.max(0, Math.min(17, g.n | 0))];
        if (g.sh && g.sw !== x.sw) {   /* a new swing: replay its flight from the swing, to where their game says it came to rest */
          x.sw = g.sw; const s = g.sh, inp = s.i || {}, h2 = C.holes[Math.max(0, Math.min(17, s.n | 0))];
          try { const res = R.shot(C, { x: +s.fr[0], y: +s.fr[1] }, Object.assign({}, inp, { wind: inp.club === 'PT' ? [0, 0] : R.windFor(g.rid, h2.n), pin: h2.pin })); x.fly = res.path; x.flyT = 0; x.from = s.fr; x.flyEnd = s.at; trailOf(x.k, res.path); x.k.trail.visible = inp.club !== 'PT';
            if (r && r.e && K.playOnce) K.playOnce(r.e, inp.club === 'PT' ? 'putt' : 'golfswing'); } catch (err) { x.fly = null; }
        }
        let bx = +g.b[0], bz = +g.b[1];
        if (x.fly) {
          x.flyT += dt * (g.cl === 'PT' ? 1 : 1.25); const PP = x.fly; let k = 0; while (k < PP.length - 1 && PP[k + 1][3] <= x.flyT) k++;
          const a = PP[k], b = PP[Math.min(PP.length - 1, k + 1)], u = b[3] > a[3] ? Math.min(1, (x.flyT - a[3]) / (b[3] - a[3])) : 1;
          const FY = x.fy && x.fyOf === PP ? x.fy : (x.fyOf = PP, x.fy = pathY(PP));
          placeBall(x.k, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, hl.pin, FY[k] + (FY[Math.min(PP.length - 1, k + 1)] - FY[k]) * u); x.k.trail.geometry.setDrawRange(0, k + 1);
          if (x.flyT > PP[PP.length - 1][3] + 1) { x.fly = null; x.k.trail.visible = false; }
        } else placeBall(x.k, bx, bz, null, hl.pin);
        x.k.ball.visible = !(g.ph === 'done' && !x.fly); if (!x.k.ball.visible) x.k.shadow.visible = false;   /* holed out: the ball is in the cup */
        const mm = !x.fly && ST && g.rid === ST.rid && ST.m.find(m => String(m[0]) === String(id)), ws = mm ? watchSpot(mm[3]) : null;
        if (r && r.e && r.e.root && ws) watchAt(r.e, x.k, ws);
        else if (r && r.e && r.e.root) {
          const at = x.fly ? x.from : [bx, bz]; standAt(r.e, x.k, at, +g.a || 0);
          r.e.restPose = g.cl === 'PT' ? 'puttaddress' : x.fly ? 'golffinish' : 'golfaddress';
          if (r.e.H && !r.e.oneShot && r.e.H.animation !== r.e.restPose) r.e.H.play(r.e.restPose, { loop: true });
          drawClub(x.k, r.e.H, r.e.root, at, +g.a || 0, g.cl, !x.fly);
        }
      }
    }
    /* ---------- the camera: behind the ball down the aim line; it follows the ball in flight ---------- */
    /* what the camera watches (2026-10-20: "all players should view ... the active player's shot"): a group
       member's ball whose flight is being replayed, else the ball of the player whose turn it is, else my own */
    function rmOf(pid) { for (const [id, x] of RM) if (String(id) === String(pid)) return x; return null; }
    function camTarget() {
      const mine = { sn: ST.sn, bp: MEK.ball.position, aim: ST.aim, fly: ST.phase === 'fly', putt: clubObj().id === 'PT' && ST.phase !== 'fly' };
      if (ST.m.length < 2 || ST.phase === 'go' || ST.phase === 'fly') return mine;
      const of = m => { const x = rmOf(m[0]); return x && x.k && x.g && x.g.rid === ST.rid && !ST.quit[m[3]] ? { sn: m[3], bp: x.k.ball.position, aim: +x.g.a || 0, fly: !!x.fly, putt: x.g.cl === 'PT' && !x.fly } : null; };
      for (const m of ST.m) if (m[3] !== ST.sn) { const t = of(m); if (t && t.fly) return t; }
      if (ST.turn != null && ST.turn !== ST.sn) { const m = ST.m.find(x => x[3] === ST.turn), t = m && of(m); if (t) return t; }
      return mine;
    }
    function camera(cam3, dt) {
      if (!ST) return false;
      const T = camTarget(), fly = T.fly, bp = T.bp, putting = T.putt;
      if (T.sn !== ST.camSn) { ST.camSn = T.sn; if (!fly) ST.camYaw = T.aim; }
      let want = T.aim; if (fly) want = ST.camYaw;
      let dy = want - ST.camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); ST.camYaw += dy * Math.min(1, dt * 6);
      const fx = Math.cos(ST.camYaw), fz = Math.sin(ST.camYaw);
      const tall = cam3.aspect < 1, gy = gY(bp.x, bp.z);
      const back = (putting ? 3.6 : fly ? 7 : 6.2) * (tall ? 1.35 : 1), hgt = (putting ? 1.9 : fly ? 2.6 + (bp.y - gy) * 0.55 : 2.9) * (tall ? 1.45 : 1);
      const side = fly ? 0 : putting ? 0.5 : 0.9;
      tmp.set(bp.x - fx * back - fz * side, gy + hgt, bp.z - fz * back + fx * side);
      if (camPos.lengthSq() === 0 || camPos.distanceTo(tmp) > 120) camPos.copy(tmp); else camPos.lerp(tmp, Math.min(1, dt * (fly ? 3.2 : 8)));
      const ahead = (putting ? 4 : 14) * (tall ? 0.7 : 1), look = fly ? bp : tmp.set(bp.x + fx * ahead, gy + (putting || tall ? 0 : 1), bp.z + fz * ahead);
      if (camLook.lengthSq() === 0) camLook.copy(look); else camLook.lerp(look, Math.min(1, dt * (fly ? 6 : 8)));
      ST.camAt = { sn: T.sn, fly, x: +bp.x.toFixed(2), z: +bp.z.toFixed(2) };
      cam3.position.copy(camPos); cam3.lookAt(camLook);
      if (cam3.fov !== 55) { cam3.fov = 55; cam3.updateProjectionMatrix(); }
      if (K.see) K.see(bp, Math.max(0, camPos.distanceTo(bp) - 2));   /* the world's see-through: trees between the camera and the ball dissolve */
      return true;
    }
    return {
      frame, camera, talk,
      tap: () => !!ST,                         /* taps never walk during a round (they aim) */
      playing: () => !!ST,
      impact(e, name) { if (ST && e === K.myEnt && ST.phase === 'go' && (name === 'golfswing' || name === 'putt')) swing(); },   /* the club meets the ball on the swing's impact frame */
      event(e) { if (e && e.e === 'golfshort' && ST && e.s === seat(ST.sn)) { K.hud.chat('You cannot cover the stake, so you leave the round.', 'warn'); quitRound(true); } },
      net(id, d) { if (d == null) { this.drop(id); return; } heard(id, d); },
      drop(id) { const x = RM.get(id); if (x) { dropKit(x.k); RM.delete(id); }
        const m = ST && ST.m.find(v => String(v[0]) === String(id) && v[3] !== ST.sn); if (m) lost(m[3], Date.now()); },   /* [Claude 2026-10-22] their presence went: the seat is held 2 min */
      _state: () => ST && { st: ST.st, rests: Array.from(RM.values()).map(x => ({ sn: x.g && x.g.sn, sw: x.g && x.g.sw, ph: x.g && x.g.ph, rest: x.rest || null, now: Date.now() })), phase: ST.phase, hole: ST.hole, strokes: ST.strokes, card: ST.card.slice(), ball: ST.ball, aim: ST.aim, club: ST.club, set: ST.set, buy: ST.buy, f: ST.f, settled: ST.settled, m: ST.m, cards: ST.cards, quit: ST.quit, away: ST.away, tok: ST.tok, tk: ST.tk, sn: ST.sn, rid: ST.rid, k: ST.k, turn: turnOf(ST.hole), order: teeOrder(ST.hole), pin: hole().pin, meter: ST.meter },   /* tests */
      _ballY: () => MEK && MEK.ball ? [+MEK.ball.position.x.toFixed(2), +MEK.ball.position.y.toFixed(3), +MEK.ball.position.z.toFixed(2)] : null,   /* tests: where my ball is drawn */
      _meSeen() { const e = K.myEnt; if (!e || !e.root) return { e: false }; let o = e.root, vis = true, top = null; while (o) { if (!o.visible) vis = false; top = o; o = o.parent; }
        return { e: true, vis, inScene: top === K.scene, x: +e.root.position.x.toFixed(2), y: +e.root.position.y.toFixed(2), z: +e.root.position.z.toFixed(2) }; },   /* tests: is my avatar drawn */
      _avatarOf(sn) { if (!ST) return null; const m = ST.m.find(x => x[3] === sn); if (!m) return null; const r = sn === ST.sn ? { e: K.myEnt } : remoteOf(m[0]), e = r && r.e; return e && e.root ? { x: +e.root.position.x.toFixed(2), z: +e.root.position.z.toFixed(2), pose: e.restPose || null } : null; },
      _camTarget: () => ST && ST.camAt ? Object.assign({}, ST.camAt) : null, _presses: () => presses,
      _shoot(o) { if (!canAim()) return false; o = o || {}; if (o.club) ST.club = o.club; if (o.range) ST.range = o.range; if (o.aim != null) ST.aim = o.aim; else if (o.atPin) { const p = hole().pin; ST.aim = Math.atan2(p[1] - ST.ball.y, p[0] - ST.ball.x); } ST.power = o.power == null ? 1 : o.power; ST.impact = o.impact || 0; goSwing(); return true; },   /* tests: a swing with these inputs, only on my turn */
      _lobby: () => LOBBY && JSON.parse(JSON.stringify(LOBBY)), _open: () => Array.from(OPEN.values()), _remotes: () => Array.from(RM.keys()),
      _press: press, _put(x, y) { if (ST) { ST.ball = { x, y }; setupShot(false); goTo(ST.ball); tell(true); } }, _payouts: () => ST && payouts(),
      _begin: o => begin(o), _openGroup: (f, a, nine) => openGroup(f, a, nine), _join(g) { const o = OPEN.get(g); if (!o) return false; LOBBY = { g: o.g, host: o.host, f: o.f, a: o.a, nine: o.nine, m: o.m.concat([[ME(), myName(), K.myAddr() || '']]), at: Date.now() }; if (K.netSend) K.netSend({ gf: { t: 'join', g: o.g, nm: myName(), ad: K.myAddr() || '' } }); lobbyCard(); return true; },
      _hole(i, n) { if (ST) { ST.card[ST.hole] = n; ST.cards[ST.sn] = ST.card.slice(); if (i < ST.h1) startHole(i); else { ST.hole = ST.h1 - 1; finishRound(); } } },   /* tests: write a hole's score and go on */
      _quit: () => quitRound(true), _me: ME, _kept: () => kept(), _keep: () => keepRound(true)
    };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engolf', { api: 1, v: 1, needs: {} }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
