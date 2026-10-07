/* wraiths never near a town (2026-10-07: "Wraiths should not spawn anywhere next to the town. They should be at least a
   quarter mile away"): every wraith spawn above ground stands 400+ tiles (metres) from every town, and the seeded wilds never pick one */
'use strict';
const fs = require('fs'), path = require('path');
const DD = path.join(__dirname, '..', 'data'), mod = n => JSON.parse(fs.readFileSync(path.join(DD, n + '.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const QUARTER_MILE = 400;
const towns = ['village', 'saltmere'].map(id => { const z = mod('zone.' + id); return { id, x: z.origin[0] + z.size[0] / 2, y: z.origin[1] + z.size[1] / 2 }; });
const zones = fs.readdirSync(DD).filter(f => /^zone\..+\.json$/.test(f)).map(f => Object.assign({ id: f.slice(5, -5) }, mod(f.slice(0, -5))));
let n = 0;
for (const z of zones) {
  if (z.under) continue;   /* underground: the Spider Cave's wraiths are below the rock, not near a town */
  for (const s of z.spawns || []) {
    if (s.m !== 'wraith') continue; n++;
    const near = towns.map(t => [t.id, Math.hypot(s.x - t.x, s.y - t.y)]).sort((a, b) => a[1] - b[1])[0];
    ok(near[1] >= QUARTER_MILE, 'the wraith in ' + z.id + ' at ' + s.x + ',' + s.y + ' is ' + Math.round(near[1]) + ' m from ' + near[0]);
  }
}
ok(true, n + ' wraith(s) above ground checked');
ok(!JSON.stringify(mod('globecfg')).includes('"wraith"'), 'the seeded wilds never place a wraith');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
