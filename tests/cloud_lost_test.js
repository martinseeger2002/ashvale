/* [Claude 2026-11-01] a player's saves and a Bank that drops words (the operator: a player "had to recomplete half" of Tutorial Island after the Bank's room
   dropped): the real save code from src/engine.js against the Bank's rule (bank.py handle_save), with words lost, whole outages and a lost svok. The
   Bank must end up with the newest save, nothing may be refused as "another device", and a reload on this device must keep its own copy.
   node tests/cloud_lost_test.js */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');
const piece = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error('not found: ' + from); return src.slice(a, b); };
const CODE = piece('function cloudSend(w, closing)', 'const SAVEZ = {');
const WINS = src.match(/const savedWithBank = l => [^\n]*;/)[0] + '\n' + src.match(/const cloudWins = \(local, at\) => [\s\S]*?at !== \+local\.mine;/)[0];
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
function world(seed, lossy) {
  let x = seed; const rnd = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
  const B = { row: null, parts: null, refused: 0, up: true, loss: lossy, resets: 0 }, later = []; let clock = 1000, tick = null, wallAt = 1e12;
  const toGame = []; let took = null;
  const room = { send(m) {   /* a word to the Bank, handle_save's rule */
    if (!B.up || rnd() < B.loss) return Promise.resolve(false);
    let c = B.parts; if (!c || c.id !== m.id || c.n !== m.n) c = B.parts = { id: m.id, n: m.n, parts: {}, base: m.base, mine: m.mine };
    c.parts[m.i] = m.d; if (Object.keys(c.parts).length < m.n) return Promise.resolve(true);
    B.parts = null; const blob = Object.keys(c.parts).sort((a, b) => a - b).map(k => c.parts[k]).join(''), old = B.row;
    if (old && c.base != null) { const base = +c.base, mine = c.mine != null ? +c.mine : null;
      if (base !== old.id && old.id !== m.id && mine === old.id) { /* continues its own */ }
      else if (base !== old.id && old.id !== m.id) { B.refused++; return Promise.resolve(true); } }
    else if (old && old.id >= m.id) return Promise.resolve(true);
    B.row = { id: m.id, blob }; if (B.up && rnd() >= B.loss) toGame.push(m.id); return Promise.resolve(true); } };
  const env = { G: { arcade: {} }, CLOUD_OK: true, CHUNK: 340, CLOUD: { last: null, at: 0, sent: '', t: -1e9, mine: null, base: null }, stopped: false, ENGBANK: { bankReset() { B.resets++; } },
    hud: { chat() {} }, withHome: o => o, holdSend() {}, bankRoom: () => Promise.resolve(room), packSave: j => Promise.resolve('z' + j), performance: { now: () => clock }, console: { warn() {} },
    setInterval: f => { tick = f; }, setTimeout: (f, ms) => later.push([clock + ms, f]) };
  const fn = new Function(...Object.keys(env), CODE + '\nreturn { cloudPush, cloudTook };')(...Object.values(env));
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const step = async ms => { clock += ms; wallAt += ms; for (const l of later.splice(0)) { if (l[0] <= clock) l[1](); else later.push(l); } await flush(); while (toGame.length) fn.cloudTook(toGame.shift()); if (tick) tick(); await flush(); };
  return { B, env, fn, step, flush, save(n) { const C = env.CLOUD, json = 'save' + n + '-'.repeat(400 + (n % 7) * 200); C.at = wallAt + n; C.last = json; return json; }, snap() { const C = env.CLOUD; return { at: C.at, base: C.base, mine: C.mine, was: C.was }; } };
}
const cloudWins = new Function(WINS + '\nreturn cloudWins;')();
(async () => {
  let refused = 0, stale = 0, overrode = 0, runs = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const W = world(seed * 7919, [0, 0.1, 0.3, 0.5][seed % 4]); let last = '';
    for (let n = 1; n <= 40; n++) {
      if (n % 13 === 5) W.B.up = false; if (n % 13 === 8) W.B.up = true;
      last = W.save(n); const leave = n % 9 === 0; W.fn.cloudPush(last, leave, n % 18 === 0); await W.flush(); await W.step(leave ? 300 : 6000);
      const L = W.snap(); if (W.B.row && cloudWins(L, W.B.row.id)) overrode++;   /* a reload here, now: must keep this device's own */
    }
    W.B.up = true; W.B.loss = 0; for (let i = 0; i < 12; i++) { W.fn.cloudPush(last, true); await W.flush(); await W.step(7000); }
    refused += W.B.refused; if (!W.B.row || W.B.row.blob !== 'z' + last) stale++; runs++;
  }
  ok(refused === 0, runs + ' runs with words lost and outages: no save refused as another device (' + refused + ')');
  ok(stale === 0, 'once the Bank answers again it holds the newest save (' + stale + ' stale)');
  ok(overrode === 0, 'a reload at any moment keeps this device\'s newer copy (' + overrode + ' overridden)');
  { const W = world(5, 0); W.B.up = false; const j = W.save(1); W.fn.cloudPush(j, true); await W.flush(); for (let i = 0; i < 30; i++) await W.step(2000); ok(W.B.resets > 0, 'a Bank that stays silent: the room is left and joined again (' + W.B.resets + ')'); W.B.up = true; await W.step(7000); await W.step(100); ok(W.B.row && W.B.row.blob === 'z' + j, 'and the save goes through when it is back'); }
  console.log(fails ? 'FAILED ' + fails : 'all passed'); process.exit(fails ? 1 : 0);
})();
