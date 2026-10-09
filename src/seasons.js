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
  const DECIDUOUS = { T: 1, O: 1, W: 1, M: 1, E: 1 };   /* E: birch */
  const BUD = { W: 0, E: 0.008, T: 0.014, M: 0.019, O: 0.033 };   /* each kind's budding, in years after the snow goes (W ~day 0, E 3, T 5, M 7, O 12) */
  /* autumn colours per kind: broadleaf yellow-gold, oak russet, willow pale yellow, maple scarlet */
  const AUTUMN = { T: [0.86, 0.66, 0.16], O: [0.62, 0.34, 0.12], W: [0.82, 0.78, 0.32], M: [0.80, 0.18, 0.08], E: [0.96, 0.84, 0.22] };   /* birch: bright yellow */
  /* the real autumn range of a kind, one tree from the next (2026-10-08: "accurate to reality"): a sugar maple turns anything from
     yellow-orange through flaming orange to scarlet, a paper birch clear yellow to deep gold */
  const AUTUMN_RANGE = { M: [[0.97, 0.62, 0.10], [0.93, 0.40, 0.07], [0.80, 0.13, 0.07]], E: [[0.99, 0.88, 0.28], [0.93, 0.70, 0.12]] };
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
      /* every tree of a kind buds on the same day and grows at the same rate (2026-10-08: "in the real world, all the trees of
         the same type get their buds at the exact same time and grow at the exact same rate"): willow first, then birch, the
         broadleaf, maple, and oak last */
      const spring = (h, kind) => {
        if (leafy < 0.5 || p >= 0.4) return { bud: 1, swell: 1, crown: 1 };
        const L = melt + (BUD[kind] != null ? BUD[kind] : BUD.T);
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
      const RIPE0 = 0.403, RIPE1 = 0.551;   /* ricing: from ripe in mid August to early October (2026-10-08) */
      /* (2026-10-08) the rice sleeps as seed through the winter - nothing above the water; from mid July a bare stalk like a
         blade of grass, in early August the green rice heads, ripe by mid August; after the season the straw lies down and is gone
         by winter. The whole bed together, every plant on the same day. Local year: mid July 0.318, early August 0.37, mid August 0.403 */
      const riceAt = h => {
        if (leafy < 0.5) return { tall: 1, head: 1, ripe: 1, straw: 0, lie: 0 };
        const q = p;
        if (q < 0.318 || q > 0.68) return { tall: 0, head: 0, ripe: 0, straw: 0, lie: 0 };   /* seed on the lake bed (the straw is gone by the freeze) */
        return { tall: q < 0.6 ? smooth(0.318, 0.37, q) : 1 - smooth(0.63, 0.68, q), head: q < RIPE1 + 0.01 ? smooth(0.362, 0.38, q) : 1 - smooth(RIPE1 + 0.01, RIPE1 + 0.04, q),
          ripe: smooth(0.385, 0.403, q), straw: smooth(RIPE1, 0.59, q), lie: smooth(0.58, 0.65, q) };
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
      return { name, p, k, melt, cold, leafy, day: Math.floor(p * YEAR), leaf: { stage, colourT, crown, springT, bud, grow, dropped, spring }, litter, flora, riceAt, rice, ground, snow, frozen: snow > 0.5 };
    }
    function leafColour(kind, base, s, h) {
      if (kind === 'L') {   /* mashkiigwaatig (tamarack): a conifer that turns gold in autumn and stands needleless all winter */
        let c = base; if (s.leaf.springT > 0) c = mix(c, SPRING, 0.6 * s.leaf.springT * s.k);
        if (s.leaf.colourT > 0) c = mix(c, [0.90, 0.70, 0.18], s.leaf.colourT);
        if (s.leaf.stage === 'bare' || (s.leaf.stage === 'budding' && s.leaf.bud < 0.3)) c = mix(c, [0.46, 0.38, 0.30], s.k);
        return c;
      }
      if (!DECIDUOUS[kind]) return base;   /* pines, yews and cacti keep their colour */
      let c = base;
      if (s.leaf.springT > 0) c = mix(c, SPRING, 0.6 * s.leaf.springT * s.k);
      let A = AUTUMN[kind] || AUTUMN.T; const RG = AUTUMN_RANGE[kind];
      if (RG && h != null) { const u = Math.max(0, Math.min(0.999, h)) * (RG.length - 1), i = Math.floor(u); A = mix(RG[i], RG[i + 1], u - i); }   /* this tree's own shade */
      if (s.leaf.colourT > 0) c = mix(c, A, s.leaf.colourT);
      return c;
    }
    /* TEMPERATURE (2026-10-08: the sap runs only on a day that thaws after a night that froze). Degrees C, pure maths:
       a mean for the latitude and the time of year (27 at the equator; Ashvale at 60 N about 0 over the year, -18 at midwinter,
       +18 in summer), a day-night swing (coldest about 3 in the morning, warmest mid-afternoon), and a wobble from day to day
       (smooth noise over the days, the same in every game) so some spring days thaw and some do not. */
    const hashI = n => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    const dayNo = tms => Math.floor((tms / 1000 - epoch) / dayS);
    function wobble(day, latDeg) {   /* -1..1, smooth from one day to the next; a band of 10 degrees shares its weather */
      const band = Math.floor((latDeg + 90) / 10), t = day / 3, i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
      const a = hashI(i * 9176 + band * 131 + 7) * 2 - 1, b = hashI((i + 1) * 9176 + band * 131 + 7) * 2 - 1;
      return a + (b - a) * u;
    }
    function climate(latDeg, tms) {   /* {mean, swing} for the day holding tms */
      const S = at(latDeg, tms), al = Math.abs(latDeg);
      const ann = 27 - 0.56 * Math.max(0, al - 12), amp = 2 + 16 * S.k;
      const dn = dayNo(tms), clouds = hashI(dn * 7919 + Math.floor((latDeg + 90) / 10) * 104729 + 3);   /* a cloudy day swings less */
      return { mean: ann + amp * (1 - 2 * S.cold) + 8 * wobble(dn, latDeg), swing: (2 + 5 * S.k) * (0.45 + 0.55 * clouds), S };
    }
    /* the temperature now; lonDeg sets the local hour (the sun's day), 0 if not given */
    function temperature(latDeg, tms, lonDeg) {
      const C = climate(latDeg, tms), d = ((tms / 1000 - epoch) / dayS) + (lonDeg || 0) / 360, h = d - Math.floor(d);
      return C.mean + C.swing * Math.cos(2 * Math.PI * (h - 0.62));
    }
    /* the night before this day (its low) and this day (its high) */
    function dayRange(latDeg, tms) {
      const C = climate(latDeg, tms), P = climate(latDeg, tms - dayS * 1000);
      return { low: Math.min(P.mean, C.mean) - C.swing, high: C.mean + C.swing, mean: C.mean };
    }
    /* THE SAP RUN (ziinzibaakwadwaaboo): the 14 days before the first maple buds where you stand, on a day that warms above
       freezing after a night that froze. {season, day, low, high, left (days to the buds)} - day says whether it runs today */
    const SAP_DAYS = 14;
    function sap(latDeg, tms) {
      const S = at(latDeg, tms), w = SAP_DAYS / YEAR, R = dayRange(latDeg, tms);
      const bud = S.melt + BUD.M, season = S.leafy >= 0.5 && S.p >= bud - w && S.p < bud;   /* until the maples bud */
      return { season, day: season && R.low < 0 && R.high > 0, low: R.low, high: R.high, left: season ? Math.ceil((bud - S.p) * YEAR) : 0 };
    }
    return { api: 1, YEAR, TILT, FALL0, SAP_DAYS, temperature, dayRange, sap, LITTER: [AUTUMN.T, AUTUMN.O, AUTUMN.M], calendar, declination, at, leafColour, deciduous: k => !!DECIDUOUS[k] };
  }
  const api = { api: 1, create };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('seasons', { api: 1, v: 1, needs: {} }, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AshSeasons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
