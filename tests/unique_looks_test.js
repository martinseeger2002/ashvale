/* unique_looks_test.js - every person in the world has a look of their own (2026-10-06: "Fenn the tanner is the
   same body as Pip... make sure that characters aren't being used more than once"). Shared on purpose: the town chests,
   and a squad of identical guards (SQUAD below). Every look must also exist as a char part. */
const fs = require('fs'), path = require('path');
const DD = path.join(__dirname, '..', 'data');
const SHARED = new Set(['chest']), SQUAD = new Set(['ash_knight', 'town_guard']);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const used = new Map();
for (const f of fs.readdirSync(DD).filter(f => /^zone\..*\.json$/.test(f))) {
  for (const n of JSON.parse(fs.readFileSync(path.join(DD, f), 'utf8')).data.npcs || []) {
    const look = n.look || n.id; if (SHARED.has(look)) continue;
    if (!used.has(look)) used.set(look, []); used.get(look).push(f.slice(5, -5) + ':' + n.id);
  }
}
for (const [look, who] of used) {
  if (!SQUAD.has(look)) ok(who.length === 1, look + ' used once' + (who.length > 1 ? ' (used by ' + who.join(', ') + ')' : ''));
  ok(fs.existsSync(path.join(DD, 'parts', 'char.' + look + '.json')), look + ' has a char part');
}
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
