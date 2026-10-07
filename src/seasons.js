/* ASHVALE seasons (module `seasons`, api 1) - 2026-10-07: "There should be a 365 day precession of the globe that causes
   spring, summer, fall and winter to occur in the hemispheres. 365 day year in game days starting on year one. ... deciduous
   trees to turn colors in the fall, lose their leaves in the winter, grow back in the spring. ... different ground cover during
   the different seasons ... Ashvale is pretty close to the pole, its lakes should freeze over in the winter, but the closer you
   are to the equator, the more stable the climate is."

   Pure maths and colours: no three.js, no DOM, no clock of its own (the caller passes the time), so every game, the Atlas and
   the tests agree to the tick. Its own module so the seasons can be tuned in a small inscription.

     const S = AshSeasons.create({ epoch: 1791353761, dayS: 7200 })
     S.calendar(tms)            {year, day (1..365), frac (0..1 of the year), dayFrac}
     S.declination(tms)         the sun's tilt north (+) or south (-) of the equator, radians (the axis leans 23.44 degrees)
     S.at(latDeg, tms)          the season where you stand:
        {name: 'spring'|'summer'|'autumn'|'winter', p (0..1 through the local year, 0 = spring equinox), k (how strong seasons
         are here: 0 at the equator, 1 from 60 degrees), leaf: {stage, colourT, crown}, ground: [r,g,b tint], snow (0..1),
         frozen (still water frozen hard enough to walk on)}
     S.leafColour(kind, base, season) -> [r, g, b]   kind: the tree letter (T O W M deciduous; P Y U evergreen)
*/
(function (root) {
  'use strict';
  const TILT = 23.44 * Math.PI / 180, YEAR = 365, EQUINOX = 79;   /* day 80 of the year: the northern spring equinox */
  const DECIDUOUS = { T: 1, O: 1, W: 1, M: 1 };
  /* autumn colours per kind: broadleaf yellow-gold, oak russet, willow pale yellow, maple scarlet */
  const AUTUMN = { T: [0.86, 0.66, 0.16], O: [0.62, 0.34, 0.12], W: [0.82, 0.78, 0.32], M: [0.80, 0.18, 0.08] };
  const SPRING = [0.62, 0.82, 0.36];   /* new leaves: light, yellowish green */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function create(opts) {
    const o = opts || {}, epoch = o.epoch || 1791353761, dayS = o.dayS || 7200;
    function calendar(tms) {
      const days = Math.max(0, (tms / 1000 - epoch) / dayS), whole = Math.floor(days);
      return { year: Math.floor(whole / YEAR) + 1, day: (whole % YEAR) + 1, frac: (days % YEAR) / YEAR, dayFrac: days - whole };
    }
    const angle = tms => 2 * Math.PI * (((tms / 1000 - epoch) / dayS - EQUINOX) / YEAR);   /* 0 at the northern spring equinox */
    const declination = tms => TILT * Math.sin(angle(tms));
    function at(latDeg, tms) {
      /* p: 0..1 through the LOCAL year from its spring equinox (the south is half a year on from the north) */
      let p = (angle(tms) / (2 * Math.PI)) % 1; if (p < 0) p += 1;
      if (latDeg < 0) p = (p + 0.5) % 1;
      const k = smooth(12, 58, Math.abs(latDeg));   /* the equator barely changes; toward the pole the full swing */
      const name = p < 0.25 ? 'spring' : p < 0.5 ? 'summer' : p < 0.75 ? 'autumn' : 'winter';
      /* winterness: 0 in high summer, 1 at midwinter (p 0.875), a cosine round the year */
      const cold = (1 - Math.cos(2 * Math.PI * (p - 0.375))) / 2;
      /* leaves: bud through spring, full in summer, turn from early autumn, fall late in autumn, bare through winter - all
         toward plain summer green where the seasons are weak */
      let colourT = 0, crown = 1, stage = 'summer';
      if (p < 0.18) { crown = smooth(0.06, 0.18, p); stage = 'budding'; }
      else if (p < 0.25) { stage = 'spring'; }
      else if (p < 0.5) { stage = 'summer'; }
      else if (p < 0.66) { colourT = smooth(0.5, 0.64, p); stage = 'turning'; }
      else if (p < 0.75) { colourT = 1; crown = 1 - smooth(0.66, 0.75, p); stage = 'falling'; }
      else { colourT = 1; crown = 0; stage = 'bare'; }
      const springT = p < 0.3 ? 1 - smooth(0.18, 0.3, p) : 0;
      /* the leaves follow the season only as far as it reaches here: in the tropics they stay on and green */
      crown = 1 - (1 - crown) * smooth(0.25, 0.6, k); colourT *= smooth(0.15, 0.5, k);
      /* ground: fresh in spring, plain in summer, golden in autumn, dull in winter (before any snow) */
      const g = p < 0.25 ? mix([1.06, 1.1, 0.86], [1, 1, 1], p / 0.25) : p < 0.5 ? [1, 1, 1] : p < 0.75 ? mix([1, 1, 1], [1.22, 1.0, 0.62], (p - 0.5) / 0.25) : [0.9, 0.86, 0.74];
      const ground = mix([1, 1, 1], g, k);
      /* snow lies where the winter is hard: Ashvale (60 S) gets a white midwinter, the tropics none; still water freezes in the deep of it */
      const snow = clamp((cold * k - 0.5) / 0.3, 0, 1);
      return { name, p, k, leaf: { stage, colourT, crown, springT }, ground, snow, frozen: snow > 0.5 };
    }
    function leafColour(kind, base, s) {
      if (!DECIDUOUS[kind]) return base;   /* pines, yews and cacti keep their colour */
      let c = base;
      if (s.leaf.springT > 0) c = mix(c, SPRING, 0.6 * s.leaf.springT * s.k);
      if (s.leaf.colourT > 0) c = mix(c, AUTUMN[kind] || AUTUMN.T, s.leaf.colourT);
      return c;
    }
    return { api: 1, YEAR, TILT, calendar, declination, at, leafColour, deciduous: k => !!DECIDUOUS[k] };
  }
  const api = { api: 1, create };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('seasons', { api: 1, v: 1, needs: {} }, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AshSeasons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
