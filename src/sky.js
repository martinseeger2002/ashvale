/* ASHVALE sky (module `sky`, api 1) - 2026-10-07: "There should be times when there are lunar and solar eclipses, due to the
   mechanics of the shadows of the Earth and moon ... The moon should cast a shadow on the planet if it is in between the sun and the
   planet ... it should show up in the Atlas ... our planet is the size of the earth moon so the moon and sun in this solar system
   should be scaled in the same way."

   The Sun-Earth-Moon system scaled to the planet: lengths in planet radii, so the sun and the moon look exactly as big in the sky
   as ours do (both about half a degree). Time is game time: a day is DAY_S seconds, the year 365 game days (seasons.js), the
   moon's month 29.53 game days, its orbit tilted 5.145 degrees to the sun's path and the crossing points (nodes) going round
   backwards in 6798 game days - so eclipses come in seasons, a few a year, as here.

   Pure maths, no three.js, no clock of its own; the game and the Atlas both use it, so they agree:
     const K = AshSky.create({ epoch, dayS })
     K.at(tms, lonA)   lonA: the planet-fixed longitude the day starts from (the game: Ashvale's) ->
       { sid: the stars' turn (a star at right ascension a is at planet longitude a + sid)   sun: [x, y, z]  unit, planet-fixed      moon: unit, from the planet's centre      moonDist (radii)
         elong (rad, 0 new .. pi full)            lunar: {umbra, penumbra} 0..1 of the moon in the planet's shadow
         shadow: null | {at: unit point under the moon's shadow, pen: penumbra radius (rad on the planet), umbra: (rad, < 0 annular)} }
     K.solarCover(state, up)   how much of the sun the moon hides seen from there (0..1); up = unit, planet-fixed
     K.moonFrom(state, up)     the moon's direction seen from there (parallax: it is close)
     K.next(tms, lonA, days)   the eclipses in the coming days: [{t, kind: 'solar'|'lunar', depth}]
*/
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  const TILT = 23.44 * D2R, INC = 5.145 * D2R, SYN = 29.530588853, NODE = 6798.38, YEAR = 365, EQUINOX = 79;
  /* the moon's distance (2026-10-07: "at the distance it needs to be so that when it goes in front of the sun, it appears to be the same
     size as the sun"): seen from the ground under it, its disc exactly the sun's */
  const MOON_R = 0.2727, SUN_D = 23455, SUN_R = 109.2, MOON_D = 1 + MOON_R * SUN_D / SUN_R;
  /* the node's place at day 0: set so year 1 has an eclipse season round its second new moon (a solar eclipse that day and a
     partial lunar one at the full moon before it) - a fixed constant, like the date of a new moon */
  const OMEGA0 = (2 * Math.PI * (SYN - EQUINOX) / YEAR) - 8 * D2R + 2 * Math.PI * SYN / NODE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  /* ecliptic (lambda, beta) -> right ascension and declination */
  function eq(lam, beta) {
    const x = Math.cos(beta) * Math.cos(lam), y = Math.cos(beta) * Math.sin(lam), z = Math.sin(beta);
    const y2 = y * Math.cos(TILT) - z * Math.sin(TILT), z2 = y * Math.sin(TILT) + z * Math.cos(TILT);
    return [Math.atan2(y2, x), Math.asin(clamp(z2, -1, 1))];
  }
  /* overlap of two discs (angular radii a, b, centres c apart) as a share of the first's area */
  function cover(a, b, c) {
    if (c >= a + b) return 0;
    if (c <= Math.abs(b - a)) return b >= a ? 1 : (b * b) / (a * a);
    const a2 = a * a, b2 = b * b, c2 = c * c;
    const A = a2 * Math.acos(clamp((c2 + a2 - b2) / (2 * c * a), -1, 1)) + b2 * Math.acos(clamp((c2 + b2 - a2) / (2 * c * b), -1, 1))
      - 0.5 * Math.sqrt(Math.max(0, (-c + a + b) * (c + a - b) * (c - a + b) * (c + a + b)));
    return clamp(A / (Math.PI * a2), 0, 1);
  }
  function create(opts) {
    const o = opts || {}, epoch = o.epoch || 1791353761, dayS = o.dayS || 7200;
    /* north: -1 when the world's north is the globe's -z (2026-10-07: "flip the globe so that north is south ... so that we're
       on the northern hemisphere"): everything here works with north up, and goes in and out turned half round the x axis */
    const NS = o.north === -1 ? -1 : 1, fl = v => NS > 0 ? v : [v[0], -v[1], -v[2]];
    function at(tms, lonA) {
      const days = (tms / 1000 - epoch) / dayS;
      const lamS = 2 * Math.PI * (days - EQUINOX) / YEAR, lamM = lamS + 2 * Math.PI * (days / SYN);
      const om = OMEGA0 - 2 * Math.PI * days / NODE, betaM = Math.asin(Math.sin(INC) * Math.sin(lamM - om));
      const [raS, decS] = eq(lamS, 0), [raM, decM] = eq(lamM, betaM);
      const L = NS * (lonA || 0) - Math.PI / 2 - 2 * Math.PI * days;   /* the sun's planet-fixed longitude (the game's rule since 0.8.58) */
      const Lm = L + (raM - raS);
      const sun = [Math.cos(L) * Math.cos(decS), Math.sin(L) * Math.cos(decS), Math.sin(decS)];
      const moon = [Math.cos(Lm) * Math.cos(decM), Math.sin(Lm) * Math.cos(decM), Math.sin(decM)];
      const ce = clamp(dot(sun, moon), -1, 1), elong = Math.acos(ce);
      /* the planet's shadow at the moon's distance: umbra and penumbra radii (in planet radii) against the moon's distance from
         the shadow's axis (the line away from the sun) */
      const Ru = 1 - MOON_D * (SUN_R - 1) / SUN_D, Rp = 1 + MOON_D * (SUN_R + 1) / SUN_D;
      const off = MOON_D * Math.sin(Math.PI - elong), back = ce < 0;
      const lunar = back ? { umbra: clamp((Ru + MOON_R - off) / (2 * MOON_R), 0, 1), penumbra: clamp((Rp + MOON_R - off) / (2 * MOON_R), 0, 1) } : { umbra: 0, penumbra: 0 };
      /* the moon's shadow on the planet: its axis runs from the moon away from the sun; where it comes nearest the planet's centre */
      let shadow = null;
      if (ce > 0) {
        const M = [moon[0] * MOON_D, moon[1] * MOON_D, moon[2] * MOON_D], k = dot(M, sun);   /* the axis: M - s*sun */
        const C = [M[0] - k * sun[0], M[1] - k * sun[1], M[2] - k * sun[2]], miss = Math.hypot(C[0], C[1], C[2]);
        const dist = k, pen = MOON_R + dist * (SUN_R + MOON_R) / SUN_D, umb = MOON_R - dist * (SUN_R - MOON_R) / SUN_D;
        if (miss < 1 + pen) shadow = { at: norm(miss > 1e-9 ? C : sun), pen: pen, umbra: umb, miss };   /* radii in planet radii ~ radians on the planet */
      }
      /* sid: the turn from the sky's frame (equator, the March point) to the planet's: a star at right ascension a sits at planet
         longitude a + sid */
      if (shadow) shadow.at = fl(shadow.at);
      return { days, sid: L - raS, flip: NS, sun: fl(sun), moon: fl(moon), moonDist: MOON_D, elong, phase: ((days / SYN) % 1 + 1) % 1, lunar, shadow };
    }
    /* THE PLANETS (2026-10-07: "add the other visible planets"): Mercury, Venus, Mars, Jupiter and Saturn on their real orbits
       (Keplerian elements and rates, J2000, from JPL's "Approximate Positions of the Planets"), game day 0 = J2000 and one game day
       a day of their motion, seen from this planet, which goes round the sun as our sun-rule says. Each -> {name, dir (planet-fixed,
       unit), mag (how bright, as astronomers count), color} */
    const PL = [
      ['Mercury', [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], -0.42, [1, 0.93, 0.85]],
      ['Venus', [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418], -4.40, [1, 0.98, 0.9]],
      ['Mars', [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], -1.52, [1, 0.62, 0.42]],
      ['Jupiter', [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], -9.40, [1, 0.94, 0.82]],
      ['Saturn', [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], -8.88, [1, 0.9, 0.66]]];
    function helio(el, rt, T) {   /* heliocentric ecliptic position (AU) */
      const k = i => el[i] + rt[i] * T, a = k(0), e = k(1), I = k(2) * D2R, L = k(3) * D2R, w = k(4) * D2R, N = k(5) * D2R;
      const M = ((L - w) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI, om = w - N; let E = M + e * Math.sin(M);
      for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E), co = Math.cos(om), so = Math.sin(om), cN = Math.cos(N), sN = Math.sin(N), cI = Math.cos(I), sI = Math.sin(I);
      return [(co * cN - so * sN * cI) * xp + (-so * cN - co * sN * cI) * yp, (co * sN + so * cN * cI) * xp + (-so * sN + co * cN * cI) * yp, so * sI * xp + co * sI * yp];
    }
    function planets(tms, lonA) {
      const days = (tms / 1000 - epoch) / dayS, T = days / 36525 * (365.25 / YEAR), lamS = 2 * Math.PI * (days - EQUINOX) / YEAR;
      const earth = [-Math.cos(lamS), -Math.sin(lamS), 0];   /* this planet, opposite its sun */
      const [raS] = eq(lamS, 0), L = NS * (lonA || 0) - Math.PI / 2 - 2 * Math.PI * days;
      return PL.map(([name, el, rt, H, color]) => {
        const p = helio(el, rt, T), g = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]], dist = Math.hypot(g[0], g[1], g[2]), r = Math.hypot(p[0], p[1], p[2]);
        const lam = Math.atan2(g[1], g[0]), bet = Math.asin(g[2] / dist), [ra, dec] = eq(lam, bet), lon = L + (ra - raS);
        const ph = Math.acos(clamp((r * r + dist * dist - 1) / (2 * r * dist), -1, 1));   /* the sun-planet-us angle: an inner planet dims toward its crescent */
        const mag = H + 5 * Math.log10(r * dist) + (name === 'Mercury' || name === 'Venus' ? 0.02 * ph / D2R : 0);
        return { name, dir: fl([Math.cos(lon) * Math.cos(dec), Math.sin(lon) * Math.cos(dec), Math.sin(dec)]), mag: Math.max(-4.9, Math.min(2, mag)), color };
      });
    }
    function moonFrom(st, up) { return norm([st.moon[0] * MOON_D - up[0], st.moon[1] * MOON_D - up[1], st.moon[2] * MOON_D - up[2]]); }
    function solarCover(st, up) {
      if (dot(st.sun, st.moon) < 0.9) return 0;
      const m = moonFrom(st, up), c = Math.acos(clamp(dot(m, st.sun), -1, 1));
      const dm = Math.hypot(st.moon[0] * MOON_D - up[0], st.moon[1] * MOON_D - up[1], st.moon[2] * MOON_D - up[2]);
      return cover(SUN_R / SUN_D, Math.asin(MOON_R / dm), c);
    }
    function next(tms, lonA, days) {   /* scan new and full moons: the deepest moment near each */
      const out = [], d0 = (tms / 1000 - epoch) / dayS, step = dayS * 1000 / 96;
      const k0 = Math.floor(d0 / SYN * 2);
      for (let k = k0; k * SYN / 2 <= d0 + (days || 365); k++) {
        const dc = k * SYN / 2, kind = k % 2 ? 'lunar' : 'solar'; let best = null;
        for (let t = (epoch + (dc - 1) * dayS) * 1000; t <= (epoch + (dc + 1) * dayS) * 1000; t += step) {
          const s = at(t, lonA);
          const depth = kind === 'lunar' ? Math.max(s.lunar.umbra, s.lunar.penumbra * 0.3) : (s.shadow ? clamp(1 - s.shadow.miss / (1 + s.shadow.pen), 0, 1) : 0);
          if (depth > 0 && (!best || depth > best.depth)) best = { t: Math.round(t), kind, depth: +depth.toFixed(3), umbra: kind === 'lunar' ? +s.lunar.umbra.toFixed(3) : undefined };
        }
        if (best && best.t >= tms) out.push(best);
      }
      return out;
    }
    return { api: 1, MOON_D, MOON_R, SUN_D, SUN_R, at, solarCover, moonFrom, next, cover, planets };
  }
  const api = { api: 1, create };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('sky', { api: 1, v: 1, needs: {} }, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AshSky = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
