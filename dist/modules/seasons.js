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
  const TILT = 23.44 * Math.PI / 180, YEAR = 365, EQUINOX = 79;
  const FALL0 = 0.588, FALLW = 2.2 / 365;   /* the leaves come down in late October, every tree within about two days */   /* day 80 of the year: the northern spring equinox */
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
      /* leaves (2026-10-07): in spring they grow out from the ends of the branches - little clusters at each tip first
         (bud), then the whole crown fills in (grow); full through summer; they turn through early autumn at FULL size, and
         then each tree drops all of its leaves on one day of its own, every tree within a couple of days of the others, in
         "late October" (FALL0, the local year's 0.588: 33 days after the autumn equinox); bare until spring. Where the seasons
         are weak (the tropics) the trees keep their leaves, green. */
      const leafy = smooth(0.25, 0.6, k);
      const melt = k > 0.5 ? Math.max(0.03, Math.acos(1 - 1 / k) / (2 * Math.PI) - 0.125) : 0.03;   /* where the snow is gone in spring (snow > 0 while cold * k > 0.5) */
      /* spring, one tree (h its own hash): after the snow, leaf clusters sprout at the branch tips (bud), swell (swell), and the
         crown grows from its own centre among them until it is whole (crown); each tree a few days apart from the next */
      const spring = h => {
        if (leafy < 0.5 || p >= 0.4) return { bud: 1, swell: 1, crown: 1 };
        const L = melt + 0.035 * h;
        return { bud: smooth(L, L + 0.035, p), swell: smooth(L + 0.025, L + 0.085, p), crown: smooth(L + 0.06, L + 0.12, p) };
      };
      let colourT = 0, bud = 1, grow = 1, stage = 'summer';
      if (p < melt + 0.16) { bud = smooth(melt, melt + 0.07, p); grow = smooth(melt + 0.06, melt + 0.155, p); stage = 'budding'; }
      else if (p < 0.25) { stage = 'spring'; }
      else if (p < 0.5) { stage = 'summer'; }
      else if (p < FALL0) { colourT = smooth(0.5, FALL0 - 0.01, p); stage = 'turning'; }
      else if (p < FALL0 + FALLW) { colourT = 1; stage = 'falling'; }
      else { colourT = 1; stage = 'bare'; }
      const springT = p < 0.3 ? 1 - smooth(0.18, 0.3, p) : 0;
      colourT *= smooth(0.15, 0.5, k);
      if (leafy < 0.5) { bud = grow = 1; stage = 'summer'; }   /* no winter worth the name: the leaves stay */
      /* this tree's day to drop its leaves: h (0..1, the tree's own hash) spreads the trees over the FALLW window */
      const dropped = h => leafy >= 0.5 && p >= FALL0 + FALLW * h;
      const crown = leafy < 0.5 ? 1 : p >= FALL0 + FALLW ? 0 : p < 0.18 ? grow : 1;   /* the woods as a whole (for callers that want one number) */
      /* the fallen leaves lie on the ground in their colours from the fall until the grass comes through in spring */
      const hardWinter = k > 0.65;   /* still water freezes here at midwinter (snow > 0.5 at cold 1, see below) */
      let litter = leafy < 0.5 ? 0 : (p >= FALL0 ? smooth(FALL0, FALL0 + FALLW + 0.004, p) : p < 0.14 ? 1 - smooth(0.03, 0.14, p) : 0) * leafy;
      /* the small flora dies back with the leaf fall and comes back in spring, each plant on its own day (h), growing up from nothing */
      /* manoomin (wild rice): {tall, head, ripe, straw, lie} for one plant (h), and whether it is ricing season (late August to
         early October: 0.433..0.551 of the local year). Where there is no real winter it keeps its summer look. */
      const RIPE0 = 0.433, RIPE1 = 0.551;
      const riceAt = h => {
        if (leafy < 0.5) return { tall: 1, head: 1, ripe: 1, straw: 0, lie: 0 };
        const o = 0.02 * h, q = p - o;
        if (q < melt) return { tall: 0, head: 0, ripe: 0, straw: 0, lie: 0 };
        return { tall: q < 0.42 ? smooth(melt, 0.34, q) : q < 0.62 ? 1 : 1 - smooth(0.62, 0.72, q), head: q < 0.42 ? smooth(0.33, 0.38, q) : q < RIPE1 + 0.01 ? 1 : 1 - smooth(RIPE1 + 0.01, RIPE1 + 0.04, q),
          ripe: smooth(0.38, RIPE0, q), straw: smooth(RIPE1, 0.6, q), lie: smooth(0.58, 0.7, q) };
      };
      const rice = leafy < 0.5 || (p >= RIPE0 && p <= RIPE1);
      const flora = h => leafy < 0.5 ? 1 : p >= FALL0 + FALLW * h ? 0 : p < 0.3 ? smooth(melt + 0.1 * h, melt + 0.04 + 0.1 * h, p) : 1;
      /* ground: fresh in spring, plain in summer, golden in autumn, dull in winter (before any snow) */
      const g = p < 0.25 ? mix([1.06, 1.1, 0.86], [1, 1, 1], p / 0.25) : p < 0.5 ? [1, 1, 1] : p < 0.75 ? mix([1, 1, 1], [1.1, 1.0, 0.78], (p - 0.5) / 0.25) : [0.9, 0.86, 0.74];
      const ground = mix([1, 1, 1], g, k);
      /* snow lies where the winter is hard: Ashvale (60 S) gets a white midwinter, the tropics none; still water freezes in the deep of it */
      const snow = clamp((cold * k - 0.5) / 0.3, 0, 1);
      /* the coloured leaves on the ground go as soon as the water freezes (2026-10-07), and where it froze they do not come back in spring */
      if (snow > 0.5 || (hardWinter && p < 0.25)) litter = 0;
      return { name, p, k, day: Math.floor(p * YEAR), leaf: { stage, colourT, crown, springT, bud, grow, dropped, spring }, litter, flora, riceAt, rice, ground, snow, frozen: snow > 0.5 };
    }
    function leafColour(kind, base, s) {
      if (!DECIDUOUS[kind]) return base;   /* pines, yews and cacti keep their colour */
      let c = base;
      if (s.leaf.springT > 0) c = mix(c, SPRING, 0.6 * s.leaf.springT * s.k);
      if (s.leaf.colourT > 0) c = mix(c, AUTUMN[kind] || AUTUMN.T, s.leaf.colourT);
      return c;
    }
    return { api: 1, YEAR, TILT, FALL0, LITTER: [AUTUMN.T, AUTUMN.O, AUTUMN.M], calendar, declination, at, leafColour, deciduous: k => !!DECIDUOUS[k] };
  }
  const api = { api: 1, create };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('seasons', { api: 1, v: 1, needs: {} }, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AshSeasons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
