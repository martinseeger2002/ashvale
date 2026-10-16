/* ASHVALE 3D engine part: the Fortune Engines in the Saltmere Tap (2026-10-16). The scene draws the four machines
   (src/fortune.js); this part seats you on a machine's bench, looks through your own eyes (drag to look round, up to 90 degrees
   left and right and 65 up and down), takes the taps on the reels, the lever, the coin slot and the stake knobs (nothing else on
   the cabinet), and talks to the @ashvale Bank, which holds the credit and decides every spin:
   - Put in GOLD (the slot, "any amount"): core 'fein' takes it out of the pack; it is sent to @ashvale (/r/send, as a card
     table's buy-in) and the Bank hears {fein, s, n, tx}. The credit shows once the Bank has counted it.
   - Spin: {fespin, s, q, w, cs}. The Bank's answer has the stops, the win and the new credit; the reels turn to its stops. The
     seal (the secret's hash before, the secret after) is checked here, quietly (the operator: "The game should not display the seal").
   - Cash out, stand up, or a lost connection (the Bank cashes out a sitting it has not heard from for two minutes): what is left
     goes home as GOLD; the Bank's word 'paid' puts it back in the pack (core 'feback') and counts it as on its way to the wallet.
   - Everyone near sees each machine's counter (CREDIT, WAGER) and its spins: the seated player says {FE: [id, credit, wager,
     stops, 1]} in the room. A sitting is s = 'fe:<machine>:<hex>'.
   install(K) -> { menu(t), tap(cx, cy), look(dx, dy), camera(camera, dt), target(tg), frame(now, dt), event(e), net(id, a),
   lift(e), seated(), standUp() } */
(function (G) {
  'use strict';
  function install(K) {
    const { SCENE, core, hud, PID, ENGBANK } = K, THREE = K.THREE;
    const LIB = () => (SCENE.fortuneLib ? SCENE.fortuneLib() : null);
    const fmt = n => (Math.round(n) || 0).toLocaleString('en-US');
    const OCC = new Map(), SEEN = new Map();   /* who sits at which machine (by net id) / the last counter and stops heard for it */
    const FEB_LOCAL = new Set();               /* sittings whose GOLD came back because the send to @ashvale failed: not "on its way" */
    let pend = null, FEV = null;
    const LOOK = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 }, MAXY = Math.PI / 2, MAXP = 65 * Math.PI / 180;
    const enc = new TextEncoder(), hex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
    const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
    const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
    async function stopsOf(sec, cs, q) {
      const L = LIB(), key = await crypto.subtle.importKey('raw', enc.encode(sec), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(cs + ':' + q)));
      return [0, 1, 2].map(r => L.V2P[r][mac[r] & 63]);
    }
    const objOf = id => (core.M.objects || []).find(o => o.k === 'fortune' && o.id === id) || null;
    const machine = id => (SCENE.fortuneAt ? SCENE.fortuneAt(id) : null);
    const ledger = () => (K.walletState.address ? ENGBANK.ledgerFor(K.walletState.address) : null);
    const me = () => K.me;

    /* ---------- sound, made live like engine.js sfx() */
    let ac = null;
    function audio() { if (!K.settings.sound) return null; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; } return ac; }
    function noise(dur, freq, vol) { const a = audio(); if (!a) return; const b = a.createBuffer(1, Math.max(1, a.sampleRate * dur | 0), a.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 3; g.gain.value = vol; s.connect(f).connect(g).connect(a.destination); s.start(); }
    function tone(freq, t, dur, vol, type) { const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(vol, a.currentTime + t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + dur);
      o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + dur + 0.05); }
    const SND = {
      tick: () => noise(0.012, 3000, 0.08), clunk: () => { noise(0.07, 380, 0.45); tone(70, 0, 0.18, 0.22, 'triangle'); },
      ratchet: () => { for (let i = 0; i < 6; i++) setTimeout(() => noise(0.015, 2400, 0.22), i * 45); },
      clink: () => { tone(2400 + Math.random() * 500, 0, 0.1, 0.06); },
      coins: n => { for (let i = 0; i < Math.min(n, 14); i++) setTimeout(() => { tone(2200 + Math.random() * 600, 0, 0.12, 0.06); noise(0.01, 5000, 0.06); }, 120 + i * 70); },
      chime: big => { (big ? [523, 659, 784, 1047, 1319] : [784, 1047]).forEach((f, i) => { tone(f, i * 0.11, 0.9, 0.16); tone(f * 2.76, i * 0.11, 0.4, 0.035); }); } };

    /* ---------- the Bank's words: each sent again until it is answered (a spin after 8 s; the Bank answers the same spin the same) */
    const Q = new Map(); let SENDTO = null;   /* SENDTO: a test's stand-in Bank */
    const toBank = o => { if (SENDTO) { SENDTO(o); return; } ENGBANK.bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send(o); }).catch(() => {}); };
    function bankSend(key, o, every) { Q.set(key, { o, at: 0, n: 0, every: every || 8000 }); flush(); }
    function flush() {
      const now = Date.now();
      for (const [k, q] of Q) {
        if (now - q.at < q.every) continue;
        if (++q.n > 90) { Q.delete(k); console.warn('ASHVALE: the Bank never answered', k); continue; }
        q.at = now; toBank(q.o);
      }
    }
    setInterval(flush, 2000);
    function heard(d) {
      if (!d) return;
      if (d.t === 'fes') { recover(d.rows || []); return; }
      const s = String(d.s || ''); if (!s) return;
      if (d.id) { Q.delete(s + '|in|' + d.id); Q.delete(s + '|x|' + d.id); if (d.tx) Q.delete(s + '|tx|' + d.id); }
      if (d.pos || d.err) for (const k of Array.from(Q.keys())) if (k.startsWith(s + '|spin|')) Q.delete(k);
      if (d.st === 'paid' || d.st === 'held' || d.st === 'none') Q.delete(s + '|out');
      if (d.st === 'paid') payBack(s, d.paid | 0);
      if (d.st === 'held') hud.chat('The @ashvale Bank is holding a Fortune Engine sitting for a person to check: a deposit never showed on the chain.', 'warn');
      if (FEV && FEV.s === s) seatedHeard(d);
    }
    if (ENGBANK.feHear) ENGBANK.feHear(heard);
    /* the Bank paid a sitting home: that GOLD back in the pack (once per sitting and amount; the wallet catches up) */
    function payBack(s, paid) {
      const L = ledger(); if (!L) return; L.fes = L.fes || {}; const rec = L.fes[s]; if (!rec) return;
      const n = paid - (rec.back | 0); if (n <= 0) return;
      rec.back = paid; rec.done = Date.now(); ENGBANK.ledgerSave();
      K.send({ c: 'feback', s, n });
    }
    /* at a load, and now and then: sittings this device started that are still open (not seated at them: cash them out) or
       paid but not back in the pack */
    function recover(rows) {
      const L = ledger(); if (!L || !L.fes) return;
      for (const r of rows) {
        const s = String(r[0] || ''), st = r[1], paid = r[3] | 0, rec = L.fes[s]; if (!rec || (FEV && FEV.s === s)) continue;
        if (st === 'open' || st === 'closing') bankSend(s + '|out', { t: 'feout', v: 1, s }, 15000);
        else if (st === 'paid') payBack(s, paid);
      }
      const old = Date.now() - 7 * 86400000; for (const s in L.fes) if ((L.fes[s].at || 0) < old) delete L.fes[s];
    }
    let askT = 0;
    setInterval(() => {   /* a sitting of ours not yet home: ask about our sittings every minute (and once soon after a load) */
      const L = ledger(); if (!L || !L.fes) return;
      const open = Object.keys(L.fes).some(s => !(L.fes[s].done) && !(FEV && FEV.s === s));
      if ((open && Date.now() - askT > 60000) || !askT) { askT = Date.now(); toBank({ t: 'fe?', v: 1 }); }
    }, 10000);

    /* ---------- the deposit: out of the pack (core), to @ashvale (/r/send, counted in L.out so the wallet's own returns never send it
       again), then the Bank's word; three failed sends give it back to the pack */
    let paying = false;
    async function payNext() {
      const L = ledger(); if (!L || paying) return; L.feb = L.feb || [];
      const b = L.feb.find(x => !x.tx && !x.failed && Date.now() >= (x.next || 0)); if (!b) return;
      const W = K.walletState.data, pid = W && W.pids && W.pids.coins; if (!pid) return;
      paying = true; L.out = L.out || {};
      const id = 'fe:' + b.id;
      if (!(L.out.coins || []).some(x => x.id === id)) { (L.out.coins = L.out.coins || []).push({ id, n: b.n, piece: null, st: 'pending', t: Date.now() }); ENGBANK.ledgerSave(); }
      const oo = (L.out.coins || []).find(x => x.id === id);
      const fail = () => {
        b.tries = (b.tries | 0) + 1; b.next = Date.now() + 15000 * b.tries;
        if (b.tries >= 3) {   /* it never left the wallet: back in the pack, and nothing on its way */
          b.failed = true; L.out.coins = (L.out.coins || []).filter(x => x.id !== id); FEB_LOCAL.add(b.s + ':' + b.id);
          K.send({ c: 'feback', s: b.s, n: b.n, local: b.id });
          bankSend(b.s + '|x|' + b.id, { t: 'feinx', v: 1, s: b.s, id: b.id });   /* and the Bank takes that credit back */
          if (FEV && FEV.s === b.s) { FEV.busy = false; say('The GOLD could not be sent to the Bank. It is back in your pack.'); }
        }
        ENGBANK.ledgerSave();
      };
      try {
        const r = await fetch('/r/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ to: '@ashvale', label: 'ASHVALE', note: 'Fortune Engine', silent: true, kind: 'token', propertyid: pid, amount: String(b.n) }) });
        const j = await r.json().catch(() => ({}));
        if (r.status !== 202 || !j.id || j.status === 'failed') { fail(); return; }
        let st = j;
        for (let i = 0; i < 200 && st && st.status !== 'sent' && st.status !== 'failed'; i++) { await new Promise(ok => setTimeout(ok, 3000)); st = await fetch('/r/send/' + encodeURIComponent(j.id), { credentials: 'same-origin' }).then(x => x.json()).catch(() => null) || st; }
        if (!st || st.status !== 'sent' || !st.txid) { fail(); return; }
        b.tx = st.txid; if (oo) { oo.st = 'sent'; oo.t = Date.now(); } ENGBANK.ledgerSave(); setTimeout(K.walletRefresh, 60000);
        bankSend(b.s + '|tx|' + b.id, { t: 'fein', v: 1, s: b.s, n: b.n, id: b.id, tx: b.tx });   /* the proof of a deposit the Bank already credited */
        L.feb = L.feb.filter(x => !((x.tx || x.failed) && Date.now() - (x.at || 0) > 7 * 86400000));
      } catch (e) { fail(); }
      finally { paying = false; setTimeout(payNext, 500); }
    }
    setInterval(payNext, 4000);

    /* ---------- seated */
    const stake = () => FEV ? FEV.tier * FEV.k : 1;
    const packGold = () => { let n = 0; for (const s of (me().inv || [])) if (s && s.id === 'coins') n += s.n; return n; };
    function say(t, big) { if (!FEV) return; FEV.msg = t; FEV.big = !!big; draw(); }
    function view() { return { credit: FEV.credit, tier: FEV.tier, k: FEV.k, msg: FEV.msg, big: FEV.big, busy: FEV.busy, pack: packGold() }; }
    function draw() {
      if (!FEV) return; hud.fortuneUpdate(view());
      const m = machine(FEV.id); if (m) { m.show(FEV.credit, stake()); m.knobs(FEV.k); }
      tell();
    }
    let toldT = 0, told = '';
    function tell(stops) {   /* the counter (and a spin) for everyone near */
      if (!FEV) return; const row = [FEV.id, Math.max(0, FEV.credit | 0), stake(), stops || 0, 1], key = row.join(',');
      if (!stops && key === told && Date.now() - toldT < 4000) return; told = key; toldT = Date.now();
      if (K.netSend) K.netSend({ FE: row });
    }
    function sitAt(id) {
      const o = objOf(id); if (!o || !o.seat) return;
      pend = { id, at: performance.now() };
      K.send({ c: 'walk', x: o.seat[0], y: o.seat[1] });
    }
    function enter(id) {
      const o = objOf(id), m = machine(id); if (!o) return;
      pend = null;
      FEV = { id, o, s: 'fe:' + id + ':' + randHex(8), credit: 0, tier: 1, k: 1, q: 0, h: null, busy: false, msg: 'Tap the coin slot to put in GOLD', big: false, hb: 0 };
      const cam = K.cam; if (cam.mode !== 'fortune') cam.save = { yaw: cam.tyaw, pitch: cam.tpitch, dist: cam.tdist };
      cam.mode = 'fortune'; LOOK.yaw = LOOK.pitch = LOOK.tyaw = LOOK.tpitch = 0;
      const my = K.myEnt; my.restPose = 'sit'; my.tyaw = ({ s: 0, n: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 })[o.face || 's'] || 0;
      if (m) { if (m.ceil) m.ceil.visible = true; m.mood({ mine: true, win: false }); m.onTick = SND.tick; m.onClunk = SND.clunk; m.onClink = SND.clink; }
      hud.fortuneOpen(view(), { spin, stake: k => { if (!FEV || FEV.busy) return; FEV.k = k; draw(); }, tier: t => { if (!FEV || FEV.busy) return; FEV.tier = t; draw(); },
        deposit, cash: () => cashOut(false), pays, stand: () => standUp() });
      draw();
    }
    function leaveView() {
      const cam = K.cam;
      if (cam.mode === 'fortune') { cam.mode = null; if (cam.save) { cam.tyaw = cam.save.yaw; cam.tpitch = cam.save.pitch; cam.tdist = cam.save.dist; cam.save = null; } }
      if (K.camera.fov !== 45) { K.camera.fov = 45; K.camera.updateProjectionMatrix(); }
      K.myEnt.restPose = null; hud.fortuneClose();
    }
    /* stand up (the button, walking off, a fall): what is on the machine goes home; the view comes back at once */
    function standUp() {
      if (!FEV) return; const F = FEV, m = machine(F.id);
      if (F.credit > 0 || (ledger() && ledger().fes && ledger().fes[F.s] && !ledger().fes[F.s].done)) bankSend(F.s + '|out', { t: 'feout', v: 1, s: F.s }, 15000);
      if (F.credit > 0) hud.chat('You stand up from the Fortune Engine. The Bank sends your ' + fmt(F.credit) + ' GOLD credit back to you.', 'sys');
      if (m) { if (m.ceil) m.ceil.visible = false; m.mood({ mine: false, win: false, low: false }); m.show(0, stake()); m.knobs(0); }
      if (K.netSend) K.netSend({ FE: [F.id, 0, stake(), 0, 0] });
      FEV = null; leaveView();
    }
    function deposit(n) {
      if (!FEV || FEV.busy) return; n = Math.floor(n);
      if (!K.walletState.address) { say('Sign in to your wallet to put GOLD in.'); return; }
      if (!(n > 0) || n > packGold()) { say('You have ' + fmt(packGold()) + ' GOLD in your pack.'); return; }
      FEV.busy = true; FEV.waitIn = Date.now(); say('Putting ' + fmt(n) + ' GOLD in…'); audio();
      K.send({ c: 'fein', m: FEV.id, n, s: FEV.s });
      setTimeout(() => { if (FEV && FEV.waitIn && Date.now() - FEV.waitIn >= 1400 && !FEV.inFlight) { FEV.busy = false; FEV.waitIn = 0; draw(); } }, 1500);   /* the pack said no (the chat says why) */
    }
    async function spin() {
      if (!FEV || FEV.busy) return; const w = stake();
      if (FEV.credit < w) { say(FEV.credit > 0 ? 'Not enough credit for this wager' : 'Tap the coin slot to put in GOLD'); return; }
      if (!FEV.h) { say('The Bank has not opened this machine for you yet. Put in GOLD first.'); return; }
      const m = machine(FEV.id); audio();
      FEV.busy = true; FEV.pendSpin = { q: FEV.q + 1, cs: randHex(8), h: FEV.h, w, at: Date.now() }; FEV.credit -= w;
      if (m) { m.clearCoins(); m.mood({ win: false }); m.pullLever(); } SND.ratchet(); LOOK.tyaw = LOOK.tpitch = 0;
      say('The engine turns…');
      bankSend(FEV.s + '|spin|' + FEV.pendSpin.q, { t: 'fespin', v: 1, s: FEV.s, q: FEV.pendSpin.q, w, cs: FEV.pendSpin.cs });
    }
    function cashOut(quiet) {
      if (!FEV || FEV.busy) return; if (FEV.credit <= 0) { say('Nothing to cash out.'); return; }
      FEV.busy = true; FEV.cashing = true; say('The Bank is paying out…');
      bankSend(FEV.s + '|out', { t: 'feout', v: 1, s: FEV.s }, 15000);
    }
    function newSitting() { FEV.s = 'fe:' + FEV.id + ':' + randHex(8); FEV.credit = 0; FEV.q = 0; FEV.h = null; }
    async function seatedHeard(d) {
      const F = FEV;
      if (d.pos && F.pendSpin && d.q === F.pendSpin.q) {
        const P = F.pendSpin; F.pendSpin = null; F.q = d.q; F.h = d.h || null;
        try { const ok = (await sha256(String(d.sec || ''))) === P.h && (await stopsOf(String(d.sec), P.cs, P.q)).every((p, r) => p === d.pos[r]);
          if (!ok) console.warn('ASHVALE: a Fortune Engine spin did not match its seal', d.s, d.q); } catch (e) { console.warn('ASHVALE: the seal check failed', e && e.message); }
        const m = machine(F.id), L = LIB(), done = () => {
          if (FEV !== F) return;
          F.credit = d.credit | 0; F.busy = false;
          if (d.pay > 0) {
            const r = L.payOf.apply(null, d.pos.map(p => L.STRIP[p])), name = { 'three-crown': 'Three Crowns', 'three-ruby': 'Three Rubies', 'three-dragon': 'Three Dragons', 'three-sword': 'Three Swords', 'three-shield': 'Three Shields', 'three-fish': 'Three Fish', 'two-ruby': 'Two Rubies', 'one-ruby': 'One Ruby' }[r[1]] || 'A win';
            say(name + '! ' + fmt(d.pay) + ' GOLD', true); SND.chime(d.pay >= 50 * (d.w | 0));
            const n = Math.min(40, Math.max(2, Math.round(Math.log2(d.pay / Math.max(1, F.tier) + 1) * 3)));
            if (machine(F.id)) { machine(F.id).mood({ win: true }); machine(F.id).dropCoins(n); } SND.coins(n);
          } else say(F.credit >= stake() ? 'No luck this time' : F.credit > 0 ? 'No luck. Your credit is below this wager' : 'No luck. Put in more GOLD to keep playing');
          draw();
        };
        tell(d.pos);
        if (m) m.spinTo(d.pos, done); else done();
        return;
      }
      if (d.err) {
        if (F.pendSpin) { F.credit += F.pendSpin.w; F.pendSpin = null; }
        F.busy = false;
        if (d.err === 'closed') { say('The Bank closed this sitting (it had not heard from the machine). Put in GOLD to play again.'); newSitting(); }
        else if (d.err === 'order') { F.q = d.q | 0; F.h = d.h || F.h; say('The machine lost its count; it is back in step. Spin again.'); }
        else if (d.err === 'credit') { F.credit = d.credit | 0; say('Not enough credit for this wager.'); }
        else say('The Bank refused that spin. Try again.');
        draw(); return;
      }
      if (d.id && !d.err && !d.pos) { const mine = F.pendIn === d.id; if (mine) { F.pendIn = null; F.inFlight = false; F.busy = false; }
        if (!F.pendSpin) { F.credit = d.credit | 0; F.h = d.h || F.h; F.q = d.q | 0; }
        if (mine) say(fmt(d.credit) + ' GOLD of credit. Pick a wager and spin.'); else draw(); return; }
      if (d.st === 'paid' && F.cashing) { F.cashing = false; F.busy = false; newSitting(); say('Cashed out. The GOLD is back in your pack.'); return; }
      if (d.st === 'closing' && F.cashing) { F.cashing = false; F.busy = false; newSitting(); say('Cashed out. It comes back to you once the chain shows your deposit (about a minute).'); return; }
      if (d.st === 'open' && !F.pendSpin && !F.busy) { F.credit = d.credit | 0; F.h = d.h || F.h; F.q = d.q | 0; draw(); }
    }
    function pays() {
      const L = LIB(); if (!L) return; const ex = L.exact, ic = L.icons();
      const rows = [['crown'], ['ruby'], ['dragon'], ['sword'], ['shield'], ['fish']].map(([s]) => ({ icons: [s, s, s], pays: L.THREE_OF[s], odds: Math.round(ex.tot / ex.lines['three-' + s]) }))
        .concat([{ icons: ['ruby', 'ruby'], pays: 10, odds: Math.round(ex.tot / ex.lines['two-ruby']) }, { icons: ['ruby'], pays: 2, odds: Math.round(ex.tot / ex.lines['one-ruby']) }]);
      hud.fortunePays({ rows, icon: ic, rtp: (ex.rtp * 100).toFixed(2) + '%', hit: (ex.hit / ex.tot * 100).toFixed(1) + '%' });
    }

    /* ---------- the engine's hooks */
    function menu(t) {
      const o = objOf(t.id); if (!o) return [];
      const ex = { html: 'Examine <span class="c">Fortune Engine</span>', fn: () => hud.chat('A steel cabinet with three painted reels behind glass, worked by brass gears and a wizard\'s charm. Put GOLD in the slot, pick a wager and pull the lever. Three Crowns pay 5,000 times the wager.', 'sys') };
      if ((o.lv | 0) !== (me().lv | 0)) return [{ html: 'Fortune Engine <span class="c">(' + ((o.lv | 0) > (me().lv | 0) ? 'up the stairs' : 'downstairs') + ')</span>', fn: () => hud.chat('The Fortune Engines are ' + ((o.lv | 0) > (me().lv | 0) ? 'up the tavern stairs.' : 'downstairs.'), 'sys') }];
      if (FEV && FEV.id === t.id) return [];
      const occ = OCC.get(t.id);
      if (occ && Date.now() - occ.t < 12000) return [{ html: 'Someone is playing this <span class="c">Fortune Engine</span>', fn: () => hud.chat('Someone is sitting at that Fortune Engine.', 'sys') }, ex];
      if (!K.walletState.address) return [{ html: 'Sit down at <span class="c">Fortune Engine</span>', fn: () => hud.chat('Sign in to your wallet to play the Fortune Engine for GOLD.', 'sys'), red: 1 }, ex];
      return [{ html: 'Sit down at <span class="c">Fortune Engine</span>', fn: () => sitAt(t.id), red: 1 }, ex];
    }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function tap(cx, cy) {   /* seated: only the reels and the lever spin, the slot takes GOLD, a knob picks the stake (the operator) */
      if (!FEV) return false;
      const m = machine(FEV.id); if (!m) return true;
      const r = K.canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, K.camera);
      const h = ray.intersectObjects(m.hot, false)[0], a = h && h.object.userData.fe;
      if (a && a.act === 'spin') spin(); else if (a && a.act === 'slot') { if (!FEV.busy) hud.fortuneDeposit(); } else if (a && a.act === 'stake' && !FEV.busy) { FEV.k = a.i + 1; draw(); }
      return true;
    }
    function look(dx, dy) { if (!FEV) return false; LOOK.tyaw = Math.max(-MAXY, Math.min(MAXY, LOOK.tyaw - dx * 0.0055)); LOOK.tpitch = Math.max(-MAXP, Math.min(MAXP, LOOK.tpitch - dy * 0.0055)); return true; }
    function target(tg) { if (!FEV) return; const m = machine(FEV.id); if (m) { const p = m.group.getWorldPosition(new THREE.Vector3()); tg.set(p.x, p.y + 1, p.z); } }
    const _e = new THREE.Vector3(), _l = new THREE.Vector3(), _eu = new THREE.Euler(0, 0, 0, 'YXZ');
    function camera(cam3, dt) {   /* first person on the bench, the head turned by LOOK */
      if (!FEV) return false; const m = machine(FEV.id); if (!m) return false;
      const host = K.host, tall = (host.clientWidth || 1) < (host.clientHeight || 1), v = m.eye(tall);
      _e.set(v.eye.x, v.eye.y, v.eye.z); m.group.localToWorld(_e); _l.set(v.look.x, v.look.y, v.look.z); m.group.localToWorld(_l);
      cam3.position.copy(_e); cam3.lookAt(_l);
      const k = Math.min(1, dt * 12); LOOK.yaw += (LOOK.tyaw - LOOK.yaw) * k; LOOK.pitch += (LOOK.tpitch - LOOK.pitch) * k;
      _eu.setFromQuaternion(cam3.quaternion, 'YXZ'); cam3.rotation.set(Math.max(-1.5, Math.min(1.5, _eu.x + LOOK.pitch)), _eu.y + LOOK.yaw, 0, 'YXZ');
      const fov = tall ? 72 : 50; if (Math.abs(cam3.fov - fov) > 0.01) { cam3.fov = fov; cam3.updateProjectionMatrix(); }
      const my = K.myEnt; if (my.root.visible) { my.root.visible = false; K.FPV.hid = true; }
      return true;
    }
    function frame(now) {
      const p = me();
      if (pend) {
        const o = objOf(pend.id), P = core.S.players[PID];
        if (!o || p.dead) pend = null;
        else if (p.x === o.seat[0] && p.y === o.seat[1] && (p.lv | 0) === (o.lv | 0) && !(P && P.path && P.path.length)) enter(pend.id);
        else if (now - pend.at > 600 && !(P && P.path && P.path.length)) pend = null;   /* stopped somewhere else */
      }
      if (FEV) {
        const o = FEV.o;
        if (p.dead || p.x !== o.seat[0] || p.y !== o.seat[1] || (p.lv | 0) !== (o.lv | 0)) standUp();
        else {
          const m = machine(FEV.id);
          if (m && m !== FEV.m) { FEV.m = m; if (m.ceil) m.ceil.visible = true; m.mood({ mine: true }); m.onTick = SND.tick; m.onClunk = SND.clunk; m.onClink = SND.clink; draw(); }   /* the region was built again */
          if (m) m.mood({ low: !FEV.busy && FEV.credit < stake() });
          const L = ledger();
          if (L && L.fes && L.fes[FEV.s] && now - FEV.hb > 20000) { FEV.hb = now; toBank({ t: 'fe?', v: 1, s: FEV.s }); }
          tell();
        }
      }
      for (const [id, o] of OCC) if (Date.now() - o.t > 12000) { OCC.delete(id); const m = machine(id); if (m && !(FEV && FEV.id === id)) m.show(0, (SEEN.get(id) || {}).w || 1); }
      for (const [id, s] of SEEN) { const m = machine(id); if (m && m !== s.m && !(FEV && FEV.id === id)) { s.m = m; m.show(s.c, s.w); } }
    }
    function event(e) {
      if (e.p !== PID) return;
      const L = ledger();
      if (e.e === 'fein') {
        if (!L) return; L.feb = L.feb || []; L.fes = L.fes || {};
        const id = Date.now().toString(36) + randHex(2);
        L.feb.push({ s: e.s, n: e.n | 0, id, at: Date.now() });
        if (!L.fes[e.s]) L.fes[e.s] = { at: Date.now(), m: e.m, back: 0 };
        ENGBANK.ledgerSave();
        /* [Claude 2026-10-16] the operator: "The credits should be available instantly. Just like wagers on the poker table or chess game" -
           the Bank credits the deposit at once; the send to @ashvale follows (payNext) and proves it before anything goes home */
        bankSend(e.s + '|in|' + id, { t: 'fein', v: 1, s: e.s, n: e.n | 0, id }, 4000);
        if (FEV && FEV.s === e.s) { FEV.inFlight = true; FEV.pendIn = id; FEV.waitIn = 0; const m = machine(FEV.id); if (m) m.feed(); say('Putting ' + fmt(e.n) + ' GOLD in…');
          const F = FEV; setTimeout(() => { if (FEV === F && F.pendIn === id) { F.busy = false; F.inFlight = false; say('The Bank is slow to answer; your GOLD shows as soon as it does.'); } }, 15000); }
        setTimeout(payNext, 200); return;
      }
      if (e.e === 'feback') {
        const key = Array.from(FEB_LOCAL).find(k => k.startsWith(e.s + ':'));
        if (key) { FEB_LOCAL.delete(key); return; }   /* a send that never left: nothing on its way */
        if (L && e.n > 0) { L.pend = L.pend || {}; L.pend.coins = (L.pend.coins || 0) + (e.n | 0); ENGBANK.ledgerSave(); }   /* paid by the Bank: on its way to the wallet */
        if (FEV) draw();
      }
    }
    function net(id, a) {   /* {FE: [machine, credit, wager, stops|0, seated]} from a player near */
      if (!Array.isArray(a)) return; const mid = String(a[0] || ''), o = objOf(mid); if (!o || (FEV && FEV.id === mid)) return;
      const L0 = LIB(), c = Math.max(0, Math.min(1e8, +a[1] || 0)), w = L0 && L0.STAKES.indexOf(a[2] | 0) >= 0 ? a[2] | 0 : 1;
      if (a[4]) OCC.set(mid, { nid: id, t: Date.now() }); else if ((OCC.get(mid) || {}).nid === id) OCC.delete(mid);
      SEEN.set(mid, { c, w, m: null });
      const m = machine(mid); if (!m) return;
      const st = Array.isArray(a[3]) && a[3].length === 3 && a[3].every(p => (p | 0) === p && p >= 0 && p < 22) ? a[3] : null;
      if (st && !m.spinning) { m.pullLever(); m.spinTo(st, () => m.show(c, w)); } else if (!m.spinning) m.show(c, w);
      SEEN.get(mid).m = m;
    }
    function lift(e) {   /* on the bench: you while seated, a remote while its machine says so */
      if (e === K.myEnt) return FEV ? 0.42 : null;
      if (!e.key || e.key.charCodeAt(0) !== 114) return null;
      const nid = e.key.slice(2); for (const o of OCC.values()) if (String(o.nid) === nid && Date.now() - o.t < 12000) return 0.42;
      return null;
    }
    return { menu, tap, look, camera, target, frame, event, net, lift, seated: () => !!FEV, standUp,
      _project: p => { const m = FEV && machine(FEV.id); if (!m) return null; const v = new THREE.Vector3(p[0], p[1], p[2]); m.group.localToWorld(v); v.project(K.camera); const r = K.canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },   /* tests only */
      _machine: id => machine(id), _seen: () => Array.from(OCC.keys()),   /* tests only */
      _bank: (fn, addr) => { SENDTO = fn; if (addr) { K.walletState.address = addr; K.walletState.data = K.walletState.data || {}; K.walletState.data.pids = Object.assign({ coins: 26 }, K.walletState.data.pids || {}); } return heard; },   /* tests only */ _state: () => FEV && Object.assign({}, FEV, { o: undefined, m: undefined }) };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engfortune', { api: 1, v: 1, needs: {} }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
