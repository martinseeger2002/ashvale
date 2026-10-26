/* ASHVALE 3D engine part: THE CLUBHOUSE TABLES (2026-10-20: "the craps table, the roulette table and the blackjack table",
   upstairs in the Saltmere Links clubhouse, each "their own modules"; SHARED ROUNDS - one roll / spin / dealer hand for everyone at a
   table, the @ashvale Bank runs the clock and decides every outcome, tools/bank/tables.py). Never name the games in public text: the
   dice table, the wheel, the twenty-one table.
   Found by name by the engine (one hook, so a new table game needs no engine change). Generic over the games: each game brings its
   rules (<game>rules.js, the same files the Bank runs) and its table (<game>table.js: the model, the felt's bet areas, the dice / the
   ball / the cards); this part walks you to a free standing spot, looks through your eyes at the rail (drag to look round), puts GOLD
   in as credit and back out exactly as the Fortune Engines do (engfortune.js: the same ledger rules, keyed 'tb:'), sends your bets
   and moves, and plays the Bank's results on the table. A sitting: s = 'tb:<table>:<hex>'.
   install(K) -> { menu(t), tap(cx, cy), look(dx, dy), camera(camera, dt), target(tg), frame(now, dt), event(e), net(id, a),
   seated(), standUp(), _view(), _bank(fn) (tests) } */
(function (G) {
  'use strict';
  const NAMES = { dice: 'the dice table', wheel: 'the wheel', twentyone: 'the twenty-one table' };
  const TITLE = { dice: 'Dice table', wheel: 'The wheel', twentyone: 'Twenty-one' };
  function install(K) {
    const { SCENE, core, hud, PID, ENGBANK } = K, THREE = K.THREE;
    const fmt = n => (Math.round(n) || 0).toLocaleString('en-US');
    const enc = new TextEncoder(), hex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
    const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
    const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
    const objOf = id => (core.M.objects || []).find(o => o.k === 'gametable' && o.id === id) || null;
    const tableOf = id => (SCENE.gameTableAt ? SCENE.gameTableAt(id) : null);
    const rulesOf = g => (G.ASH3D && G.ASH3D.get && G.ASH3D.get(g + 'rules')) || null;
    const ledger = () => (K.walletState.address ? ENGBANK.ledgerFor(K.walletState.address) : null);
    const me = () => K.me;
    const packGold = () => { let n = 0; for (const s of (me().inv || [])) if (s && s.id === 'coins') n += s.n; return n; };

    /* ---------- the Bank's words: each sent again until it is answered */
    const Q = new Map(); let SENDTO = null;
    const toBank = o => { if (SENDTO) { SENDTO(o); return; } ENGBANK.bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send(o); }).catch(() => {}); };
    function bankSend(key, o, every) { Q.set(key, { o, at: 0, n: 0, every: every || 6000 }); flush(); }
    function flush() { const now = Date.now(); for (const [k, q] of Q) { if (now - q.at < q.every) continue; if (++q.n > 60) { Q.delete(k); continue; } q.at = now; toBank(q.o); } }
    setInterval(flush, 1500);
    const TBS = new Map();   /* table -> its latest state from the Bank (everyone in the bank room hears every table) */
    let TV = null, pend = null;
    const DEALERS = new Map();   /* table -> {H, T} the dealer standing behind it */

    function heard(d) {
      if (!d) return;
      if (d.t === 'tbs') { if (d.pc > 0) assemble(d); else tableHeard(d); return; }
      if (d.t === 'tbp') { piece(d); return; }
      const s = String(d.s || ''); if (!s) return;
      if (d.id) { Q.delete(s + '|in|' + d.id); Q.delete(s + '|x|' + d.id); if (d.tx) Q.delete(s + '|tx|' + d.id); }
      if (d.q) Q.delete(s + '|q|' + d.q);
      Q.delete(s + '|back'); if (d.for) Q.delete(d.for + '|back');   /* the Bank answered the coming back */
      if (d.st === 'paid' || d.st === 'held' || d.st === 'none') Q.delete(s + '|out');
      if (d.st === 'paid') payBack(s, d.paid | 0);
      else if (d.st === 'closing') payBack(s, (d.paid | 0) + (d.credit | 0));
      if (d.st === 'held') hud.chat('The @ashvale Bank is holding a table sitting for a person to check: a deposit never showed on the chain.', 'warn');
      if (d.for && TV && TV.s === d.for && s !== d.for) { TV.s = s; TV.back = true; TV.q = d.q | 0; }   /* [Claude 2026-10-22] back at a sitting still open (a reload, a lost connection): it is yours again as it was */
      if (TV && TV.s === s) seatedHeard(d);
    }
    if (ENGBANK.tbHear) ENGBANK.tbHear(heard);

    /* ---------- GOLD in and out: the Fortune Engines' ledger rules (engfortune.js), keyed 'tb:' (L.tbb deposits, L.tbs sittings) */
    const TBB_LOCAL = new Set();
    function refund(b) {
      const L = ledger(); if (!L || b.refunded) return;
      const cashed = L.tbs && L.tbs[b.s] && (L.tbs[b.s].back | 0) > 0 && !L.tbs[b.s].early;
      b.refunded = true;
      if (b.gone && !cashed) { L.gone = L.gone || {}; L.bag = L.bag || {}; const d = Math.min(b.n, L.gone.coins | 0); L.gone.coins = (L.gone.coins | 0) - d; L.bag.coins = (L.bag.coins | 0) + d; }
      ENGBANK.ledgerSave(); if (cashed) return;
      TBB_LOCAL.add(b.s + ':' + b.id); K.send({ c: 'feback', s: b.s, n: b.n, local: b.id });
      hud.chat('The ' + fmt(b.n) + ' GOLD that never left your wallet is back in your pack.', 'sys');
    }
    setTimeout(function back() { const L = ledger(); if (!L) { setTimeout(back, 5000); return; } for (const b of (L.tbb || [])) if (b.failed && !b.refunded) refund(b); }, 9000);
    function payBack(s, paid) {
      const L = ledger(); if (!L) return; L.tbs = L.tbs || {}; const rec = L.tbs[s]; if (!rec) return;
      const n = paid - (rec.back | 0); if (n <= 0) return;
      rec.back = paid; rec.done = Date.now(); ENGBANK.ledgerSave();
      K.send({ c: 'feback', s, n });
    }
    const BIG = 20000;   /* as the Fortune Engines: the first 20,000 to the pack, the rest to the chest */
    function storeBig(s, n) {
      const L = ledger(); if (!L || !ENGBANK.chestStore) return;
      L.tbs = L.tbs || {}; const rec = L.tbs[s]; if (rec && rec.stored) return;
      const m = ENGBANK.chestStore('coins', Math.min(n - BIG, packGold()), true);
      if (rec) { rec.stored = true; ENGBANK.ledgerSave(); }
      if (m > 0) hud.chat(fmt(m) + ' GOLD from the table goes straight to your chest; ' + fmt(BIG) + ' stays in your pack.', 'sys');
    }
    let askT = 0;
    setInterval(() => {   /* a sitting of ours not yet home: ask about it now and then */
      const L = ledger(); if (!L || !L.tbs) return;
      const A = atGet();
      for (const s in L.tbs) { if (L.tbs[s].done || (TV && TV.s === s) || (A && A.s === s)) continue; if (Date.now() - askT > 60000) { askT = Date.now(); bankSend(s + '|out', { t: 'tbout', v: 1, s }, 20000); } }
      const old = Date.now() - 7 * 86400000; for (const s in L.tbs) if ((L.tbs[s].at || 0) < old) delete L.tbs[s];
    }, 15000);
    let paying = false;
    /* [Claude 2026-10-26] as the Fortune Engines: a deposit gives up only after GIVE_UP (it used to void after three tries in 45 s,
       and a played-on sitting was held for good), every retry is the same send (ref), and one lost status read no longer counts as a
       failed send - before, it sent the same GOLD again */
    const GIVE_UP = 15 * 60000, ARRIVING = /only [0-9,]+ of .* is here to send/i,
      SIGNED_OUT = /who is looking|nobody signed in/i;   /* [Claude 2026-10-26] the arcade restarted and forgot this page's sign-in: only a reload brings it back */
    async function payNext() {
      const L = ledger(); if (!L || paying) return; L.tbb = L.tbb || [];
      const b = L.tbb.find(x => !x.tx && !x.failed && Date.now() >= (x.next || 0)); if (!b) return;
      const W = K.walletState.data, pid = W && W.pids && W.pids.coins; if (!pid) return;
      paying = true; L.out = L.out || {};
      const id = 'tb:' + b.id;
      if (!(L.out.coins || []).some(x => x.id === id)) { (L.out.coins = L.out.coins || []).push({ id, n: b.n, piece: null, st: 'pending', t: Date.now() }); ENGBANK.ledgerSave(); }
      const oo = (L.out.coins || []).find(x => x.id === id);
      const fail = why => {
        b.tries = (b.tries | 0) + 1; b.next = Date.now() + Math.min(60000, 15000 * b.tries);
        if (why) console.warn('ASHVALE: the table send to @ashvale failed:', why);
        if (why && b.tries === 1) hud.chat(ARRIVING.test(String(why)) ? 'Your ' + fmt(b.n) + ' GOLD goes to the @ashvale Bank as soon as your last payout lands in your wallet.' : SIGNED_OUT.test(String(why)) ? 'The arcade restarted and this page lost its sign-in. Reload the page and your ' + fmt(b.n) + ' GOLD goes to the @ashvale Bank - it is still in your wallet.' : 'Your wallet did not send the ' + fmt(b.n) + ' GOLD to the @ashvale Bank yet: ' + String(why).slice(0, 120), 'warn');
        if (Date.now() - (b.at || 0) > GIVE_UP) { b.failed = true; L.out.coins = (L.out.coins || []).filter(x => x.id !== id); bankSend(b.s + '|x|' + b.id, { t: 'tbinx', v: 1, s: b.s, id: b.id }); refund(b); }
        ENGBANK.ledgerSave();
      };
      try {
        const r = await fetch('/r/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ to: '@ashvale', label: 'ASHVALE', note: 'Clubhouse table', silent: true, kind: 'token', propertyid: pid, amount: String(b.n), ref: id + (b.rf ? ':' + b.rf : '') }) });
        const j = await r.json().catch(() => ({}));
        if (!(r.status === 202 || (r.status === 200 && j.repeat)) || !j.id || j.status === 'failed' || j.status === 'expired') { if (j.id) b.rf = (b.rf | 0) + 1; fail(j.error || j.status || ('the arcade said ' + r.status)); return; }
        let st = j;
        for (let i = 0; i < 200 && st && st.status !== 'sent' && st.status !== 'failed'; i++) { await new Promise(ok => setTimeout(ok, 3000)); st = await fetch('/r/send/' + encodeURIComponent(j.id), { credentials: 'same-origin' }).then(x => x.json()).catch(() => null) || st; }
        if (!st || st.status !== 'sent' || !st.txid) { if (st && (st.status === 'failed' || st.status === 'expired')) b.rf = (b.rf | 0) + 1; fail((st && (st.error || st.status)) || 'no answer from the wallet'); return; }
        b.tx = st.txid; b.sentAt = Date.now(); if (oo) { oo.st = 'sent'; oo.t = Date.now(); } ENGBANK.ledgerSave(); setTimeout(K.walletRefresh, 60000);
        bankSend(b.s + '|tx|' + b.id, { t: 'tbin', v: 1, s: b.s, n: b.n, id: b.id, tx: b.tx });
        L.tbb = L.tbb.filter(x => !((x.tx || x.failed) && Date.now() - (x.at || 0) > 7 * 86400000));
      } catch (e) { fail(e && e.message); }
      finally { paying = false; setTimeout(payNext, 500); }
    }
    setInterval(payNext, 4000);
    const HELD_EV = [];
    setInterval(() => {   /* a deposit whose send has not gone in 20 minutes is called off: the GOLD (still in the wallet) back in the pack */
      const L = ledger(); if (!L) return;
      while (HELD_EV.length) event(HELD_EV.shift());
      if (paying) return;
      for (const b of (L.tbb || [])) if (!b.tx && !b.failed && !b.refunded && Date.now() - (b.at || 0) > GIVE_UP + 300000) {   /* payNext never got to it */
        b.failed = true; L.out = L.out || {}; L.out.coins = (L.out.coins || []).filter(x => x.id !== 'tb:' + b.id);
        bankSend(b.s + '|x|' + b.id, { t: 'tbinx', v: 1, s: b.s, id: b.id }); refund(b); ENGBANK.ledgerSave();
      }
    }, 30000);
    async function settleGone() {
      const L = ledger(); if (!L || !L.tbb) return; let ch = false;
      for (const b of L.tbb) {
        if (!b.gone || !b.tx || b.goneOff) continue;
        if (!b.conf) { const t = await fetch('/r/tx/' + b.tx, { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null);
          if (t && (t.confirmations | 0) >= 1) { b.conf = Date.now(); ch = true; if (K.walletRefresh) K.walletRefresh(); } else if (Date.now() - (b.sentAt || b.at || 0) > 3600000) { b.conf = Date.now(); ch = true; } continue; }
        const at = K.walletState.data && K.walletState.data.at;
        if (at && at > b.conf) { L.gone = L.gone || {}; L.gone.coins = Math.max(0, (L.gone.coins | 0) - b.n); if (!L.gone.coins) delete L.gone.coins; b.goneOff = true; ch = true; }
      }
      if (ch) { ENGBANK.ledgerSave(); if (hud.refresh) hud.refresh('all'); }
    }
    setInterval(settleGone, 5000);
    function event(e) {
      if (e.p !== PID || !/^tb:/.test(String(e.s || ''))) return;
      const L = ledger();
      if (e.e === 'fein') {
        if (!L) { HELD_EV.push(e); return; }
        L.tbb = L.tbb || []; L.tbs = L.tbs || {};
        const id = Date.now().toString(36) + randHex(2);
        { const n = e.n | 0; L.bag = L.bag || {}; L.pend = L.pend || {}; L.gone = L.gone || {};
          const fb = Math.min(n, L.bag.coins | 0), fp = Math.min(n - fb, L.pend.coins | 0);
          L.bag.coins = (L.bag.coins | 0) - fb; L.pend.coins = (L.pend.coins | 0) - fp; L.gone.coins = (L.gone.coins | 0) + fb + fp; }
        L.tbb.push({ s: e.s, n: e.n | 0, id, at: Date.now(), gone: true });
        if (!L.tbs[e.s]) L.tbs[e.s] = { at: Date.now(), m: e.m, back: 0 };
        ENGBANK.ledgerSave();
        bankSend(e.s + '|in|' + id, { t: 'tbin', v: 1, s: e.s, n: e.n | 0, id }, 4000);
        if (TV && TV.s === e.s) { TV.busy = false; TV.ins = (TV.ins || 0) + 1; TV.credit += e.n | 0; say(fmt(e.n) + ' GOLD in.'); }
        setTimeout(payNext, 200); return;
      }
      if (e.e === 'feback') {
        const key = Array.from(TBB_LOCAL).find(k => k.startsWith(e.s + ':'));
        if (key) { TBB_LOCAL.delete(key); return; }
        if (L && e.n > 0) { L.pend = L.pend || {}; L.pend.coins = (L.pend.coins || 0) + (e.n | 0); ENGBANK.ledgerSave(); }
        if ((e.n | 0) > BIG) storeBig(e.s, e.n | 0);
        draw();
      }
    }

    /* ---------- the tables' state from the Bank, and what it shows on each table */
    const spotIdx = st => { const m = {}; for (const p in (st && st.seats) || {}) m[st.seats[p].s] = (p | 0) - 1; return m; };
    /* a tile's middle in a table's own frame (the table may be turned: the operator's floor plan) */
    function localOf(T, tile) { T.group.updateMatrixWorld(true); const w = T.group.getWorldPosition(new THREE.Vector3()); return T.group.worldToLocal(new THREE.Vector3(tile[0] + 0.5, w.y, tile[1] + 0.5)); }
    function localX(o, tile) { const T = tableOf(o.id); return T ? localOf(T, tile).x : tile[0] + 0.5 - (o.x + (o.w || 1) / 2); }
    function viewOf(st, o) {
      const idx = spotIdx(st), spots = {}; for (const s in idx) spots[s] = localX(o, o.spots[idx[s]]);
      const sides = TV && TV.tbl === o.id && TV.sideOf ? { [TV.s]: TV.sideOf } : {};   /* your bets lie at the end of the felt you tapped (2026-10-21) */
      return { point: st.point, sides, felt: st.felt || {}, spots, idx, hand: st.hand || null, turn: st.hand && st.hand.turn };
    }
    const shown = new Map();   /* table -> the round whose result was last played */
    /* [Claude 2026-10-22] a table too big for the room's 512 bytes comes as a short 'tbs' (pc pieces follow) and one 'tbp' a sitting (the operator: "Bets
       aren't showing up on the roulette table" - the whole word was refused): put back together, then heard as one; a piece lost, it goes on without it */
    const PEND = new Map();
    function assemble(d) {
      const old = PEND.get(d.tbl); if (old) flushP(d.tbl, old);
      const D = Object.assign({}, d, { seats: {}, felt: {} }); if (d.last) D.last = Object.assign({}, d.last, { lines: {}, pay: {} }); if (d.hand) D.hand = Object.assign({}, d.hand, { spots: {} });
      const P = { d: D, need: d.pc | 0, got: 0 }; PEND.set(d.tbl, P); P.timer = setTimeout(() => flushP(d.tbl, P), 700);
    }
    function piece(q) {
      const P = PEND.get(q.tbl); if (!P || P.d.seq !== q.seq || P.d.r !== q.r) return; const D = P.d;
      if (q.p != null && q.seat) D.seats[q.p] = q.seat;
      if (q.felt !== undefined) D.felt[q.s] = q.felt;
      if (q.hand && D.hand) D.hand.spots[q.s] = q.hand;
      if (q.pay !== undefined && D.last) D.last.pay[q.s] = q.pay;
      if (q.lines && D.last) D.last.lines[q.s] = q.lines;
      if (++P.got >= P.need) flushP(q.tbl, P);
    }
    function flushP(tbl, P) { if (PEND.get(tbl) !== P) return; PEND.delete(tbl); clearTimeout(P.timer); delete P.d.pc; tableHeard(P.d); }
    function tableHeard(d) {
      const tbl = String(d.tbl || ''), o = objOf(tbl); if (!o) { TBS.set(tbl, d); return; }
      const prev = TBS.get(tbl); if (prev && (d.seq | 0) < (prev.seq | 0) && (d.r | 0) <= (prev.r | 0)) return;   /* an older word */
      TBS.set(tbl, d);
      const T = tableOf(tbl); if (!T) return;
      betsGrew(tbl, d, prev);
      const v = viewOf(d, o);
      if (d.ph === 'show' && d.last && shown.get(tbl) !== d.last.r) {
        shown.set(tbl, d.last.r);
        let after = () => { T.show(viewOf(TBS.get(tbl) || d, o)); if (K.reShade) K.reShade(); if (TV && TV.tbl === tbl) resultSay(d); react(tbl, d, prev); };
        const after0 = after; after = () => { after0(); dealerRound(tbl, T, o, d, prev, 'result'); };
        if (o.game !== 'twentyone') dealerRound(tbl, T, o, d, prev, 'close');
        if (o.game === 'dice' && T.roll) { T.roll(d.last.dice, d.last.r, after); return; }
        if (o.game === 'wheel' && T.spin) { T.spin(d.last.n, after, n => { if (TV && TV.tbl === tbl) popNumber(n); }); return; }
        after(); return;
      }
      if (TV && TV.tbl === tbl && !TV.inflight && !(TV.ins > 0)) { const me0 = (d.seats || {})[String(TV.spot + 1)]; if (me0 && me0.s === TV.s && me0.credit != null) TV.credit = me0.credit | 0; }   /* the Bank's count, once nothing of ours is on its way */
      if (o.game === 'dice' && d.ph === 'bet' && T.rest && (!prev || prev.ph !== 'bet')) T.rest();
      if (d.ph === 'bet' && prev && prev.ph !== 'bet') dealerRound(tbl, T, o, d, prev, 'open');
      T.show(v); if (K.reShade) K.reShade();   /* what was just put on a storey you are below hides at once (2026-10-21) */
      if (TV && TV.tbl === tbl) draw();
    }
    /* 2026-10-21: "When I'm playing roulette the final number should pop up": as the ball drops, the number in its colour, big over the
       felt for a few seconds */
    let popEl = null, popT = 0;
    function popNumber(n) {
      const R = rulesOf('wheel'), red = R && R.REDS && R.REDS.indexOf(n) >= 0, col = n === 0 ? '#1d7a40' : red ? '#b3242c' : '#17140f';
      if (!popEl) { popEl = document.createElement('div'); popEl.style.cssText = 'position:absolute;left:50%;top:22%;transform:translate(-50%,-50%) scale(.6);opacity:0;pointer-events:none;z-index:6;text-align:center;transition:transform .35s cubic-bezier(.2,1.6,.4,1),opacity .35s;font-family:Georgia,serif'; K.host.appendChild(popEl); }
      popEl.innerHTML = '<div style="width:112px;height:112px;margin:0 auto;border-radius:50%;background:' + col + ';border:5px solid #e8c25a;box-shadow:0 4px 18px rgba(0,0,0,.6);color:#fff;font:bold 58px/104px Georgia,serif">' + n + '</div>'
        + '<div style="margin-top:6px;color:#ffe08a;font:bold 20px Georgia,serif;text-shadow:0 2px 4px #000;letter-spacing:2px">' + (n === 0 ? 'ZERO' : (red ? 'RED' : 'BLACK') + ' · ' + (n % 2 ? 'ODD' : 'EVEN')) + '</div>';
      const side = TOPM.side || 0; popEl.style.left = 'calc(50% - ' + side / 2 + 'px)';
      requestAnimationFrame(() => { popEl.style.opacity = '1'; popEl.style.transform = 'translate(-50%,-50%) scale(1)'; });
      clearTimeout(popT); popT = setTimeout(() => { if (popEl) { popEl.style.opacity = '0'; popEl.style.transform = 'translate(-50%,-50%) scale(.6)'; } }, 4200);
    }
    function resultSay(d) {
      const L = d.last || {}, mine = TV && (L.lines || {})[TV.s] || [], pay = TV && (L.pay || {})[TV.s] || 0;
      let head = '';
      if (TV.game === 'dice') head = 'Rolled ' + L.dice[0] + ' and ' + L.dice[1] + '. ' + (L.call || '');
      else if (TV.game === 'wheel') head = L.n + (L.n ? ' ' + L.colour : ', zero') + '.';
      else head = 'The dealer has ' + (L.bj ? 'twenty-one in two cards' : L.total > 21 ? L.total + ': bust' : L.total) + '.';
      TV.lines = mine; say(head + (pay ? '  You get ' + fmt(pay) + ' GOLD back.' : mine.length ? '  Nothing back this time.' : ''), pay > 0);
      if (TV) TV.credit = ((d.seats || {})[String(TV.spot + 1)] || {}).credit != null ? (d.seats[String(TV.spot + 1)].credit | 0) : TV.credit;
      draw();
    }
    /* ---------- the dealers: an ASHVALE character behind each table (models.js), waistcoat and white sleeves */
    function dealerFor(tbl, T, o) {
      let D = DEALERS.get(tbl); if (D && D.T === T) return D;
      if (!K.MOD || !K.MOD.humanoid || !o.dealer) return null;
      const H = K.MOD.humanoid({});
      try { H.setOutfit({ body: (tbl.charCodeAt(2) % 2) ? 'female' : 'male', skin: ['#c9946a', '#8d5a3b', '#e0b48c', '#6b4429'][(tbl.charCodeAt(1) + tbl.charCodeAt(2)) % 4], hair: 'short', hairColor: '#2a1d14', shirt: { style: 'vest', color: '#7a1e22' }, pants: { style: 'trousers', color: '#1d1a20' }, boots: '#141014' }); } catch (e) { /* an older models.js */ }
      /* 2026-10-21: "Also belly up the dealers and give them animations": each table names where its dealer stands (dealerAt, up
         against its pit side); the dealer leans on the edge (dealeridle) and plays the round - deals, flips, sweeps, pays, spins, waves
         off the bets, points at the dice, pushes them to the shooter - from the table's own state, the same on every screen */
      const dl = localOf(T, o.dealer), at = T.dealerAt || [dl.x, dl.z]; H.object.scale.setScalar(0.8); H.object.position.set(at[0], 0, at[1]); H.object.rotation.y = 0;   /* facing the felt (+z in the table's frame) */
      T.group.add(H.object); H.play('dealeridle', { loop: true });
      D = { H, T, o, tbl, x: at[0], z: at[1], q: [], tx: null, tz: 0, idle: 0, lk: { y: 0, p: 0 }, add: { torso: [0, 0, 0], neck: [0, 0, 0] } }; DEALERS.set(tbl, D);
      if (T.cardHook) T.cardHook((kind, x, z, own) => dealerDo(D, kind === 'flip' ? 'flip' : 'deal', x, z));
      return D;
    }
    function dealerDo(D, a, x, z) { if (!D) return; if (D.q.length > 5) D.q.shift(); D.q.push([a, x, z]); }   /* x, z: where it happens, the table's own metres */
    const _dl = new THREE.Vector3();
    function dealerTick(D, dt) {
      const H = D.H, busy = H.animation && H.animation !== 'dealeridle';
      if (!busy && D.q.length) { const [a, x, z] = D.q.shift(); D.tx = x; D.tz = z; H.play(a, { loop: false }); D.idle = 1.2; }
      else if (!busy) { D.idle -= dt; if (D.idle <= 0) {   /* between rounds: now and then a look at someone at the table, or straight ahead */
        D.idle = 2.5 + Math.random() * 3; const es = [...SPOTENT.entries()].filter(([k, e]) => k.indexOf(D.tbl + ':') === 0 && e && e.root && e._tb === D.tbl);
        if (es.length && Math.random() < 0.75) { const e = es[(Math.random() * es.length) | 0][1]; D.T.group.worldToLocal(_dl.copy(e.root.position)); D.tx = _dl.x; D.tz = _dl.z; } else D.tx = null; } }
      let wy = 0, wp = 0;
      if (D.tx != null) { const dx = D.tx - D.x, dz = D.tz - D.z; wy = Math.max(-1.2, Math.min(1.2, Math.atan2(dx, dz))); wp = Math.max(-0.1, Math.min(0.5, Math.atan2(0.75, Math.hypot(dx, dz) + 0.01) - 0.4)); }
      const k = Math.min(1, dt * 6); D.lk.y += (wy - D.lk.y) * k; D.lk.p += (wp - D.lk.p) * k;
      D.add.torso[1] = D.lk.y * 0.45; D.add.neck[1] = D.lk.y * 0.5; D.add.neck[0] = D.lk.p; H.add = D.add;
    }
    function dealerRound(tbl, T, o, d, prev, phase) {   /* the round, as the table's state shows it */
      const D = DEALERS.get(tbl); if (!D || D.T !== T) return;
      if (phase === 'open') { if (o.game === 'dice') dealerDo(D, 'push', 0.9, 0.25); return; }
      if (phase === 'close') {   /* the wheel: the ball sent round, then "no more bets" waved over the layout; the dice: waved off, then thrown */
        if (o.game === 'wheel') { dealerDo(D, 'spin', D.x - 0.45, -0.03); dealerDo(D, 'nomore', 0.3, 0.05); } else if (o.game === 'dice') dealerDo(D, 'nomore', 0, 0.1); return; }
      if (phase === 'result') {
        if (o.game === 'dice') { const f = T.focus ? T.focus(0) : null; if (f) { T.group.worldToLocal(_dl.copy(f.p)); dealerDo(D, 'push', _dl.x, _dl.z); dealerDo(D, 'sweep', 0, -0.3); } }   /* [Claude 2026-10-22] the stick out to the dice, then drawn in (dicetable gather) */
        if (o.game === 'wheel') dealerDo(D, 'point', 0.3, 0.05);
        const pay = (d.last && d.last.pay) || {}, won = Object.values(pay).some(v => v > 0);
        dealerDo(D, 'sweep', 0.2, 0.35); if (won) dealerDo(D, 'pay', 0.2, 0.45);
      }
    }
    /* ---------- standing at a table */
    function takenSpots(tbl, o) {
      const st = TBS.get(tbl), mine = K.walletState.address, seats = (st && st.seats) || {};
      const taken = new Set(Object.keys(seats).filter(p => !(mine && seats[p] && seats[p].a === mine)).map(p => (p | 0) - 1));   /* [Claude 2026-10-22] a spot held by your own sitting is yours to come back to */
      o.spots.forEach((t, i) => { for (const id in core.S.players) { const q = core.S.players[id]; if (id !== PID && q && q.x === t[0] && q.y === t[1] && (q.lv | 0) === (o.lv | 0)) taken.add(i); } });   /* someone already stands there */
      return taken;
    }
    function freeSpot(tbl, o, skip) {
      const taken = takenSpots(tbl, o);
      if (skip != null) taken.add(skip);
      const p = me(); let best = -1, bd = 1e9;
      o.spots.forEach((t, i) => { if (taken.has(i)) return; const d = Math.abs(t[0] - p.x) + Math.abs(t[1] - p.y); if (d < bd) { bd = d; best = i; } });
      return best;
    }
    function standAt(tbl, pick) {   /* pick: the spot chosen from the long-press menu (else the nearest free one) */
      const o = objOf(tbl); if (!o) return;
      if (!K.walletState.address) { hud.chat('Sign in to your wallet to play at the tables for GOLD.', 'sys'); return; }
      if (pick != null && takenSpots(tbl, o).has(pick)) { hud.chat('Someone has just taken that spot. Pick another.', 'sys'); return; }
      const i = pick != null ? pick : freeSpot(tbl, o); if (i < 0) { hud.chat('Every spot at ' + NAMES[o.game] + ' is taken. Wait for one to come free.', 'sys'); return; }
      pend = { tbl, i, at: performance.now() }; K.send({ c: 'walk', x: o.spots[i][0], y: o.spots[i][1] });
      if (!TBS.get(tbl)) toBank({ t: 'tb?', v: 1, tbl });
    }

    /* ---------- [Claude 2026-10-21] BODIES AT THE TABLES (the operator: "the avatars should be standing belly up to the table"; "they could watch and turn
       their body and lean over the craps table like they're watching the dice roll ... the roulette game the avatars should look towards the spinning
       wheel"; "animations for when they lose win or get excited"; "can we have the avatars placement of bets be an animated?"; "minimize collision
       with the tables and rails"). Drawing only: core stays tile by tile. Anyone - you, other players, the playtest's bots - standing on a table's
       spot is drawn up against its rail (the table's rail(x, z): the outside edge nearest, with its outward normal), facing the felt; the head and a
       little of the body follow the dice or the wheel while they run, at twenty-one their own cards and then the dealer; results play a reaction on
       whoever stands at that seat's spot, and a new bet a reach over the felt. Every player's game works these out from the same table words, so
       nothing extra goes over the net. */
    const STAND = 0.17, NEAR = 0.5, SPOTENT = new Map(), _q = new THREE.Vector3(), _w = new THREE.Vector3();
    let tblsAt = { t: -1, lv: null, L: [] };
    function tablesOn(lv) {   /* the tables on this storey (looked up again every half second) */
      const now = performance.now(); if (tblsAt.lv === lv && now - tblsAt.t < 500) return tblsAt.L;
      tblsAt = { t: now, lv, L: (core.M.objects || []).filter(o => o.k === 'gametable' && (o.lv | 0) === lv).map(o => [o, tableOf(o.id)]).filter(x => x[1] && x[1].rail) }; return tblsAt.L;
    }
    function railSpots(T, o) {   /* each spot: where its player stands (the offset from the tile's middle) and which way they face */
      if (T._rs) return T._rs;
      T.group.updateMatrixWorld(true);
      T._rs = o.spots.map((tile, i) => {
        const lp = localOf(T, tile), r = T.rail(lp.x, lp.z), st = new THREE.Vector3(r[0] + r[2] * STAND, lp.y, r[1] + r[3] * STAND);
        const w = T.group.localToWorld(st), n = new THREE.Vector3(r[2], 0, r[3]).transformDirection(T.group.matrixWorld);
        const felt = T.group.localToWorld(new THREE.Vector3(r[0] - r[2] * 0.45, T.bedY || 0.62, r[1] - r[3] * 0.45));   /* the felt in front of them */
        return { i, tile, dx: w.x - (tile[0] + 0.5), dz: w.z - (tile[1] + 0.5), yaw: Math.atan2(-n.x, -n.z), felt };
      });
      return T._rs;
    }
    const wrapA = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    function lookAt(e, Q, lean, dt) {   /* the head (and some of the body) turned to world point Q; null: straight ahead */
      const L = e._look || (e._look = { y: 0, p: 0, l: 0 });
      let wy = 0, wp = 0;
      if (Q) {
        const P = e.root.position, dx = Q.x - P.x, dz = Q.z - P.z, hz = Math.hypot(dx, dz) || 0.01, eye = P.y + (e.H.height || 1.45) * (e.scale || 1) * 0.92;
        wy = Math.max(-1.4, Math.min(1.4, wrapA(Math.atan2(dx, dz) - e.yaw))); wp = Math.max(-0.2, Math.min(0.9, Math.atan2(eye - Q.y, hz)));
      }
      const k = Math.min(1, dt * 5); L.y += (wy - L.y) * k; L.p += (wp - L.p) * k; L.l += ((lean || 0) - L.l) * Math.min(1, dt * 3);
      const ty = L.y * 0.38, ny = L.y - ty, tx = L.l;
      e.H.add = { torso: [tx, ty, 0], neck: [Math.max(-0.2, Math.min(0.8, L.p * 0.8 - tx * 0.6)), ny, 0] };
    }
    function pose(e, lv, dt) {
      if (!e || !e.root || e.dead || !e.H) return;
      const P = e.root.position; let hit = null;
      for (const [o, T] of tablesOn(lv)) {
        const ox = (o.x || 0), oy = (o.y || 0); if (P.x < ox - 2 || P.z < oy - 2 || P.x > ox + (o.w || 1) + 2 || P.z > oy + (o.h || 1) + 2) continue;
        /* 2026-10-21: "The only time an avatar should belly up to the table is when they are on a spot at the table": you only at your
           own spot while seated; anyone else only at a spot the table has someone sitting at - never just walking past */
        const seats = (TBS.get(o.id) || {}).seats || {};
        for (const sp of railSpots(T, o)) {
          if (e === K.myEnt ? !(TV && TV.tbl === o.id && TV.spot === sp.i) : !seats[String(sp.i + 1)]) continue;
          const d = Math.hypot(P.x - (sp.tile[0] + 0.5), P.z - (sp.tile[1] + 0.5)); if (d < NEAR && (!hit || d < hit.d)) hit = { o, T, sp, d }; }
      }
      if (!hit) { if (e._tb) { e._tb = null; e.H.add = null; e._look = null; } return; }
      const { o, T, sp } = hit, w = Math.min(1, (1 - hit.d / NEAR) * 1.6), ease = w * w * (3 - 2 * w);
      P.x += sp.dx * ease; P.z += sp.dz * ease;
      if (w > 0.55) e.tyaw = sp.yaw;
      e._tb = o.id; e._spot = sp.i; SPOTENT.set(o.id + ':' + sp.i, e);
      if (e._reach && performance.now() < e._reach.until) { lookAt(e, e._reach.at, 0, dt); return; }
      /* what they watch */
      const st = TBS.get(o.id) || {}; let Q = sp.felt, lean = 0;
      const f = T.focus ? T.focus(0) : null;
      if (f && o.game === 'dice') { Q = f.p; lean = 0.22; }
      else if (f && o.game === 'wheel') { Q = f.p; lean = 0.12; }
      else if (o.game === 'twentyone' && st.hand) {
        if (st.hand.ph === 'dealer' || st.hand.ph === 'done') Q = T.group.localToWorld(_w.set(0, T.bedY || 0.62, -0.3)).clone();
        else Q = sp.felt;
      }
      if (T === (TV && tableOf(TV.tbl)) && TOP[TV.game] && e === K.myEnt) Q = null;   /* (your own body is not drawn from above) */
      lookAt(e, Q, lean, dt);
    }
    function tagHidden(e) {   /* from above at the dice table or the wheel: no names over the felt */
      return !!(TV && TOP[TV.game]);   /* every name: from straight above, the people at the next table stand in view too */
    }
    function reachFor(tbl, i, at) {   /* a bet put down from spot i, at world point at (or the felt in front of them) */
      const e = SPOTENT.get(tbl + ':' + i); if (!e || e._tb !== tbl || e._spot !== i || !e.H) return;
      const o = objOf(tbl), T = tableOf(tbl); if (!o || !T) return;
      e._reach = { at: at || railSpots(T, o)[i].felt, until: performance.now() + 1000 }; e.H.play('reach', { loop: false });
    }
    function feelOf(lines, extra) {   /* a result's lines -> 'excited' | 'win' | 'lose' | null */
      let W = 0, Lo = 0, big = !!extra;
      for (const [t, k] of lines || []) { const n = +((/(\d+)/.exec(String(t)) || [])[1] || 0); if (k === 'win') { W += n; if (/BLACKJACK|35 to 1|30 TO 1|30 to 1/.test(t)) big = true; } else if (k === 'lose') Lo += n; }
      if (W > Lo) return big || W >= 100 || (Lo === 0 && W >= 5 * 10) ? 'excited' : 'win';
      if (Lo > W) return 'lose';
      return null;
    }
    function react(tbl, d, prev) {   /* everyone at the table reacts to their own result */
      const last = d.last; if (!last || !last.lines) return;
      const st = prev && prev.seats ? prev : d, idx = spotIdx(d), idx0 = spotIdx(st), made = d.game === 'dice' && /winner: the point is made/i.test(String(last.call || ''));   /* the point made: the pass line jumps */
      for (const s in last.lines) {
        const i = idx[s] != null ? idx[s] : idx0[s]; if (i == null) continue;
        const e = SPOTENT.get(tbl + ':' + i); if (!e || e._tb !== tbl || !e.H) continue;
        let k = feelOf(last.lines[s], made && last.lines[s].some(l => l[1] === 'win' && /pass/i.test(l[0])));
        if (!k) continue;
        const name = k === 'excited' ? 'excited' : k === 'lose' ? 'slump' : Math.random() < 0.5 ? 'cheer' : 'fistpump';
        setTimeout(() => { if (e.H && e._tb === tbl) e.H.play(name, { loop: false }); }, 150 + Math.random() * 500);
      }
    }
    function betsGrew(tbl, d, prev) {   /* someone's felt grew while bets are open: their arm goes out (yours went on the tap) */
      if (!prev || d.ph !== 'bet') return;
      for (const p in d.seats || {}) {
        const a = d.seats[p], b = (prev.seats || {})[p]; if (!a || !b || a.s !== b.s || (a.felt | 0) <= (b.felt | 0)) continue;
        if (TV && TV.tbl === tbl && a.s === TV.s) continue;
        reachFor(tbl, (p | 0) - 1, null);
      }
    }
    const LOOK = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 };
    /* 2026-10-21: "add pinch Zoom pan controls" - pinch (or the mouse wheel) zooms in up to 4x; zoomed in at the dice table or the wheel,
       a drag slides the view over the felt (a tap still bets); at twenty-one a drag turns your head as before */
    const ZM = { s: 1, px: 0, py: 0, m: 0, ax: 1, ay: 1 };
    function zoom(f) { if (!TV) return false; ZM.s = Math.max(1, Math.min(4, ZM.s * f)); clampPan(); return true; }
    function clampPan() { const sl = 0.3, kx = ZM.ax / 2 * (1 - 1 / ZM.s) + ZM.ax * sl, ky = ZM.ay / 2 * (1 - 1 / ZM.s) + ZM.ay * sl;   /* 2026-10-21: "You should be able to pan around the roulette table" - a drag slides the view at any zoom */ ZM.px = Math.max(-kx, Math.min(kx, ZM.px)); ZM.py = Math.max(-ky, Math.min(ky, ZM.py)); }
    function pan(dx, dy) { if (!TV) return; ZM.px -= dx * ZM.m; ZM.py += dy * ZM.m; clampPan(); }
    function pinch(f, dx, dy) { if (!TV) return false; zoom(f); if (TOP[TV.game]) pan(dx, dy); return true; }
    function enter(tbl, i) {
      const o = objOf(tbl); if (!o) return; pend = null;
      TV = { tbl, o, game: o.game, spot: i, tile: o.spots[i], s: 'tb:' + tbl + ':' + randHex(8), credit: 0, q: 0, coin: o.game === 'twentyone' ? 10 : 5, msg: 'Put GOLD in to play.', big: false, lines: [], busy: false, sat: false, hb: 0, bet21: 10 };
      const cam = K.cam; if (cam.mode !== 'tables') cam.save = { yaw: cam.tyaw, pitch: cam.tpitch, dist: cam.tdist };
      cam.mode = 'tables'; LOOK.yaw = LOOK.pitch = LOOK.tyaw = LOOK.tpitch = 0; ZM.s = 1; ZM.px = ZM.py = 0;
      hud.tablesOpen(view(), { deposit, coin: c => { if (TV) { TV.coin = c; draw(); } }, clear, cash: () => leave(false), leave: () => leave(true), bet21, act, ins, odds: () => tapKey('odds') });
      if (!TBS.get(tbl)) toBank({ t: 'tb?', v: 1, tbl });
      bankSend(TV.s + '|back', { t: 'tbback', v: 1, s: TV.s, tbl, p: i + 1 }, 5000);   /* [Claude 2026-10-22] the operator: "If you leave the table with a bet on the table and you come back to the table that needs to be yours" */
      atSave(); draw(); hud.tablesDeposit(packGold());
    }
    /* [Claude 2026-10-22] the operator: "If you're disconnected from one of the tables you should have 15 seconds to reconnect": where you sit is kept here
       (every heartbeat); after a reload the game walks you back to that spot and the Bank hands you the same sitting (tbback) */
    const AT_KEY = 'ashvale3d.tablesAt', AT_MS = 60000;
    function atSave() { try { if (TV) localStorage.setItem(AT_KEY, JSON.stringify({ s: TV.s, tbl: TV.tbl, spot: TV.spot, at: Date.now() })); } catch (e) {} }
    function atClear() { try { localStorage.removeItem(AT_KEY); } catch (e) {} }
    function atGet() { try { const a = JSON.parse(localStorage.getItem(AT_KEY) || 'null'); return a && Date.now() - (a.at || 0) < AT_MS ? a : null; } catch (e) { return null; } }
    let atTried = false;
    setInterval(() => {   /* once, after a reload: back to the table you were at */
      if (atTried || TV || pend || !K.walletState.address || !core.S || !core.S.players || !core.S.players[PID]) return;
      const a = atGet(); if (!a) { atTried = true; return; } const o = objOf(a.tbl), p = me(); if (!o) { atTried = true; return; }
      if ((p.lv | 0) !== (o.lv | 0) || Math.abs(o.spots[a.spot][0] - p.x) + Math.abs(o.spots[a.spot][1] - p.y) > 12) return;   /* not up there yet: tried again each second while the 60 s last */
      atTried = true; hud.chat('Back to ' + NAMES[o.game] + ': your spot is kept for you.', 'sys'); standAt(a.tbl, a.spot);
    }, 1000);
    function leaveView() {
      const cam = K.cam;
      if (IFOC.box) IFOC.box.style.display = 'none';
      if (cam.mode === 'tables') { cam.mode = null; if (cam.save) { cam.tyaw = cam.save.yaw; cam.tpitch = cam.save.pitch; cam.tdist = cam.save.dist; cam.save = null; } }
      if (K.camera.fov !== 45 || K.camera.near !== 0.1) { K.camera.fov = 45; K.camera.near = 0.1; K.camera.updateProjectionMatrix(); }
      hud.tablesClose();
    }
    function say(t, big) { if (!TV) return; TV.msg = t; TV.big = !!big; draw(); }
    function myFelt() { const st = TBS.get(TV.tbl); if (!st) return 0; const x = (st.seats || {})[String(TV.spot + 1)]; return x && x.s === TV.s ? x.felt | 0 : 0; }
    function view() {
      const st = TBS.get(TV.tbl) || {}, left = Math.max(0, Math.round(((st.left | 0) - (Date.now() - (st.heardAt || Date.now()))) / 1000));
      const v = { title: TITLE[TV.game], game: TV.game, credit: TV.credit, felt: myFelt(), coin: TV.coin, msg: TV.msg, big: TV.big, lines: TV.lines, pack: packGold(), sat: TV.sat,
        phase: st.ph || 'idle', left, point: st.point || 0, round: st.r | 0, bet21: TV.bet21 };
      if (TV.game === 'twentyone' && st.hand) {
        const H = st.hand, mine = H.spots && H.spots[TV.s], R = rulesOf('twentyone');
        v.hand = { ph: H.ph, myTurn: H.turn === TV.s && H.ph === 'play', insurance: H.ph === 'insurance' && mine && mine.ins == null, inHand: !!mine };
        const TT = G.ASH3D && G.ASH3D.get && G.ASH3D.get('twentyonetable'), tt = TT && TT.totalText;   /* the hand totals in the bar too (2026-10-21) */
        if (tt) { const d = tt(H.dealer), m = mine ? mine.hands.map(h => tt(h.cards)).filter(Boolean) : []; v.hand.totals = (d ? 'Dealer ' + d : '') + (m.length ? (d ? ' · ' : '') + 'You ' + m.join(', ') : ''); }
        if (v.hand.myTurn && R) v.hand.acts = R.legalActs({ phase: 'play', turn: TV.s, spots: { [TV.s]: { hands: mine.hands, cur: mine.cur } } }, TV.s, TV.credit);
      }
      return v;
    }
    let drawT = 0;
    function draw() { if (!TV) return; hud.tablesUpdate(view()); drawT = Date.now(); }
    /* ---------- play: every word to the Bank carries the sitting's own count (q) and the round it is meant for */
    /* [Claude 2026-10-22] one word at a time (the operator: a 420 bet on red, then betting again "said to try again" - "The table lost count"): each chip
       was its own word at once, the room's rate limit dropped one, and every later word came in out of order and was refused. Now a word waits
       for the Bank's answer to the last (a lost one is sent again every 5 s), and chips tapped meanwhile on the same spot go as one bet. */
    function word(t, extra) {
      if (!TV) return; const st = TBS.get(TV.tbl); if (!st) { say('The table is not ready yet.'); return; }
      const w = Object.assign({ t, r: st.r | 0 }, extra || {}); TV.wq = TV.wq || [];
      if (TV.inflight > 0) {
        const last = TV.wq[TV.wq.length - 1];
        if (t === 'tbbet' && last && last.t === 'tbbet' && last.k === w.k && last.r === w.r) last.n += w.n; else TV.wq.push(w);
        return;
      }
      sendWord(w);
    }
    function sendWord(w) {
      const q = ++TV.q, o = Object.assign({ v: 1, s: TV.s, q }, w);
      TV.inflight = 1; TV.wordAt = Date.now(); TV.lastW = w; bankSend(TV.s + '|q|' + q, o, 5000);
    }
    function nextWord() {   /* after an answer: the next word waiting, if its round is still the table's */
      const F = TV; if (!F || F.inflight > 0 || !F.wq || !F.wq.length) return;
      const st = TBS.get(F.tbl) || {}, w = F.wq.shift();
      if (w.r !== (st.r | 0) && w.t !== 'tbact' && w.t !== 'tbins') { F.wq.length = 0; say('That was for the last round; bet again.'); return; }
      sendWord(w);
    }
    function bet(k, n) {
      if (!TV || !TV.sat) { say('Put GOLD in first.'); return; }
      const st = TBS.get(TV.tbl); if (!st || st.ph !== 'bet') { say('Wait for the dealer: bets are closed.'); return; }
      if (n > TV.credit) { say('Not enough credit for that bet.'); return; }
      word('tbbet', { k, n });
    }
    function tapKey(k) {
      if (!TV) return; const st = TBS.get(TV.tbl) || {};
      if (TV.game === 'dice') {
        const seat = (st.felt || {})[TV.s] || { bets: {}, come: [] };
        if (k === 'pass' && st.point && seat.bets && seat.bets.pass) k = 'odds';   /* behind the line once the point is on */
        if (/^place/.test(k) && (seat.come || []).some(c => 'place' + c.n === k)) k = 'codds' + k.slice(5);   /* on your come bet's number: its odds */
      }
      bet(k, TV.coin);
    }
    function clear() { if (!TV) return; const st = TBS.get(TV.tbl); if (!st || st.ph !== 'bet') { say('Bets are closed.'); return; } word('tbclear'); }
    function bet21(n) { if (!TV) return; TV.bet21 = n; bet('main', n); reachFor(TV.tbl, TV.spot, null); }
    function act(a) { word('tbact', { a }); }
    function ins(y) { word('tbins', { y: y ? 1 : 0 }); }
    function deposit(n) {
      if (!TV) return; n = Math.floor(n);
      if (!K.walletState.address) { say('Sign in to your wallet to put GOLD in.'); return; }
      if (!(n > 0) || n > packGold()) { say('You have ' + fmt(packGold()) + ' GOLD in your pack.'); return; }
      TV.busy = true; say('Putting ' + fmt(n) + ' GOLD in…');
      K.send({ c: 'fein', m: TV.tbl, n, s: TV.s });
    }
    function seatedHeard(d) {
      const F = TV;
      if (d.q && F.inflight) { F.inflight--; setTimeout(nextWord, 0); }
      if (d.err) {
        const E = { closed: 'This sitting is closed. Stand at the table again to play.', spot: 'Take a spot first.', order: 'The table lost count; try again.', round: 'That was for the last round; try again.', 'closed for bets': 'Bets are closed.', taken: 'Someone else took that spot.', seated: '' };
        if (d.err === 'order' && d.q != null) {   /* out of count: the Bank's count wins, the refused word goes again once with it */
          for (const k of Array.from(Q.keys())) if (k.startsWith(F.s + '|q|')) Q.delete(k);
          F.q = d.q | 0; F.inflight = 0; const w = F.lastW; F.lastW = null; const st = TBS.get(F.tbl) || {};
          if (w && !w.again && (w.r === (st.r | 0) || w.t === 'tbact' || w.t === 'tbins')) { w.again = 1; sendWord(w); draw(); return; }
          setTimeout(nextWord, 0);
        }
        if (d.err === 'taken') {   /* someone was quicker: the next free spot, the credit stays with you */
          const i = freeSpot(F.tbl, F.o, F.spot); if (i < 0) { say('Every spot is taken.'); standUp(); return; }
          F.spot = i; F.tile = F.o.spots[i]; F.moving = performance.now(); K.send({ c: 'walk', x: F.tile[0], y: F.tile[1] }); say(E.taken + ' Moving along the rail.'); draw(); return; }
        if (E[d.err] !== '') say(E[d.err] || d.err);
      }
      if (d.st === 'open' && !(F.ins > 0 && !d.id)) F.credit = d.credit | 0;
      if (d.id && F.ins > 0 && !d.tx) F.ins--;
      if (d.st === 'open' && !(ledger() && ledger().tbs && ledger().tbs[F.s])) { const L = ledger(); if (L) { L.tbs = L.tbs || {}; L.tbs[F.s] = { at: Date.now(), m: F.tbl, back: 0 }; ENGBANK.ledgerSave(); } }   /* bets moved back to you: this sitting's GOLD comes home through the ledger too */
      if (d.note && d.st !== 'closing') say(d.note);
      if (d.st === 'open' && d.spot != null && d.spot !== F.spot + 1 && !F.moving) { F.spot = d.spot - 1; F.tile = F.o.spots[F.spot]; F.moving = performance.now(); K.send({ c: 'walk', x: F.tile[0], y: F.tile[1] }); atSave(); draw(); return; }   /* your sitting's own spot */
      if (d.st === 'open' && d.credit > 0 && !F.sat && d.spot == null) { toBank({ t: 'tbsit', v: 1, s: F.s, p: F.spot + 1 }); }
      if (d.spot != null && d.spot === F.spot + 1 && !F.sat) { F.sat = true; say(F.game === 'twentyone' ? 'Place your bet with the buttons.' : 'Tap the felt to bet ' + fmt(F.coin) + ' GOLD.'); }
      if (d.st === 'closing' || d.st === 'paid') { if (F.leaving) { TV = null; leaveView(); } }
      draw();
    }
    function leave(stand) {
      if (!TV) return; const F = TV;
      if (!F.sat && !(ledger() && ledger().tbs && ledger().tbs[F.s])) { TV = null; leaveView(); return; }
      F.leaving = true; atClear(); bankSend(F.s + '|out', { t: 'tbout', v: 1, s: F.s }, 8000);
      hud.chat('You step away from ' + NAMES[F.game] + '. What is left of your credit comes back to your pack' + (myFelt() ? ' once the bets still working are settled.' : '.'), 'sys');
      TV = null; leaveView();
      if (stand === false) { /* cash out keeps nobody at the table either */ }
    }
    function standUp() { leave(true); }
    /* ---------- the engine's hooks */
    function menu(t) {
      const o = objOf(t.id); if (!o) return [];
      const nm = NAMES[o.game] || 'the table', ex = { html: 'Examine <span class="c">' + (TITLE[o.game] || 'Table') + '</span>', fn: () => hud.chat({ dice: 'Twelve feet of green felt, padded rails and a dealer with a stick. One roll for everyone at the table.', wheel: 'A single-zero wheel in a polished bowl. One spin for everyone at the table.', twentyone: 'A half-moon of felt and a six-deck shoe. The dealer hits soft 17; twenty-one in two cards pays 3 to 2.' }[o.game] || 'A table.', 'sys') };
      if ((o.lv | 0) !== (me().lv | 0)) return [{ html: (TITLE[o.game] || 'Table') + ' <span class="c">(' + ((o.lv | 0) > (me().lv | 0) ? 'up the stairs' : 'downstairs') + ')</span>', fn: () => hud.chat(nm.charAt(0).toUpperCase() + nm.slice(1) + ' is ' + ((o.lv | 0) > (me().lv | 0) ? 'up the stairs.' : 'downstairs.'), 'sys') }, ex];
      if (TV && TV.tbl === t.id) return [];
      /* 2026-10-21: "You should be able to Long click on any of the tables to choose your seat from the open seats" */
      if (!TBS.get(t.id)) toBank({ t: 'tb?', v: 1, tbl: t.id });
      const taken = takenSpots(t.id, o), n = o.spots.length, seats = [];
      o.spots.forEach((tile, i) => { if (taken.has(i)) return;
        const where = o.game === 'twentyone' ? (i === 0 ? ' (first base)' : i === n - 1 ? ' (third base)' : '') : o.game === 'dice' ? (localX(o, tile) < 0 ? ' (left end)' : ' (right end)') : '';
        seats.push({ html: 'Sit at <span class="c">spot ' + (i + 1) + where + '</span>', fn: () => standAt(t.id, i) }); });
      return [{ html: 'Play at <span class="c">' + (TITLE[o.game] || 'the table') + '</span>', fn: () => standAt(t.id), red: 1 }].concat(seats.length ? seats : [{ html: 'Every spot is taken', fn: () => hud.chat('Every spot at ' + NAMES[o.game] + ' is taken. Wait for one to come free.', 'sys') }], [ex]);
    }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _p = new THREE.Vector3();
    function tap(cx, cy) {
      if (!TV) return false;
      const T = tableOf(TV.tbl); if (!T) return true;
      const r = K.canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, K.camera);
      const h = ray.intersectObjects(T.hot || [], false)[0]; if (!h) return true;
      _p.copy(h.point); T.group.worldToLocal(_p);
      const k = T.areaAt ? T.areaAt(_p.x, _p.z) : null; if (k) { TV.sideOf = TV.sideOf || {}; TV.sideOf[k] = _p.x; tapKey(k); reachFor(TV.tbl, TV.spot, h.point.clone()); }
      return true;
    }
    /* [Claude 2026-10-22] the operator: "Should be able to Long click on a bet and remove it from the table" - a long-press (right-click) on your own bet
       takes it down while bets are open; a bet the rules keep up (a line bet once the point is on) says so */
    function hold(cx, cy) {
      if (!TV) return false;
      const st = TBS.get(TV.tbl) || {}, T = tableOf(TV.tbl); if (!T) return true;
      if (TV.game === 'twentyone') { if (!myFelt()) say('You have no bet out.'); else if (st.ph !== 'bet') say('Bets are closed.'); else { clear(); say('Your bet comes back.'); } return true; }
      const r = K.canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, K.camera);
      const h = ray.intersectObjects(T.hot || [], false)[0]; if (!h) return true;
      _p.copy(h.point); T.group.worldToLocal(_p); const k = T.areaAt ? T.areaAt(_p.x, _p.z) : null; if (!k) return true;
      return holdKey(k);
    }
    function holdKey(k) {
      const st = TBS.get(TV.tbl) || {};
      if (st.ph !== 'bet') { say('Bets are closed: wait for the next round to take a bet down.'); return true; }
      const R = rulesOf(TV.game);
      if (TV.game === 'dice') {
        const seat = (st.felt || {})[TV.s] || { bets: {}, come: [] }, bets = seat.bets || {};
        if (k === 'pass' && bets.odds) k = 'odds';   /* the odds come down first */
        else if (/^place/.test(k) && (seat.come || []).some(c => 'place' + c.n === k && c.odds)) k = 'codds' + k.slice(5);
        const nm = R ? R.NAME(k) : k, have = /^codds/.test(k) ? 1 : bets[k];
        if (!have) { say('You have no bet on ' + nm + '.'); return true; }
        if (R && !R.removable(Object.assign({ come: [] }, seat), st.point | 0, k)) { say(nm.charAt(0).toUpperCase() + nm.slice(1) + ' stays up until it is decided.'); return true; }
        word('tbtake', { k }); say('Taking ' + nm + ' down…'); return true;
      }
      const mine = (st.felt || {})[TV.s] || {}, nm = R && R.nameOf ? R.nameOf(k) : k;
      if (!mine[k]) { say('You have no bet on ' + nm + '.'); return true; }
      word('tbtake', { k }); say('Taking ' + fmt(mine[k]) + ' off ' + nm + '…'); return true;
    }
    function look(dx, dy) { if (!TV) return false; if (TOP[TV.game]) { pan(dx, dy); return true; }   /* from above: a drag slides the zoomed view */
      LOOK.tyaw = Math.max(-1.4, Math.min(1.4, LOOK.tyaw - dx * 0.0055)); LOOK.tpitch = Math.max(-0.9, Math.min(0.7, LOOK.tpitch - dy * 0.0055)); return true; }
    function target(tg) { if (!TV) return; const T = tableOf(TV.tbl); if (T) { const p = T.group.getWorldPosition(new THREE.Vector3()); tg.set(p.x, p.y + 1, p.z); } }
    const _e = new THREE.Vector3(), _l = new THREE.Vector3(), _eu = new THREE.Euler(0, 0, 0, 'YXZ');
    const TOP = { dice: 1, wheel: 1 }, TOPM = { at: 0, bot: 166, top: 70 }, _m = new THREE.Matrix4(), _up = new THREE.Vector3(), _b = new THREE.Box3();
    function feltRect(T) {   /* the felt's rectangle in the table's own frame: [x0, x1, z0, z1] */
      if (T.feltRect) return T.feltRect;
      T.group.updateMatrixWorld(true); _b.setFromObject(T.felt); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const x of [_b.min.x, _b.max.x]) for (const z of [_b.min.z, _b.max.z]) { const q = T.group.worldToLocal(new THREE.Vector3(x, _b.min.y, z)); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
      return (T.feltRect = [x0, x1, z0, z1]);
    }
    function topDown(cam3, T) {   /* 2026-10-21: "at the dice or the wheel tables, a top down view where you can see all the places where you can bet" -
         straight down on the whole felt, fitted between the chat at the top and the bar at the bottom; on a tall screen the felt's long side
         runs up the screen (your end at the bottom), on a wide one across it (the dealer's side at the top) */
      const host = K.host, w = host.clientWidth || 1, h = host.clientHeight || 1, A = w / h, tall = A < 1;
      const now = performance.now(); if (!TOPM.at || now - TOPM.at > 700) {   /* the bar's and the chat's heights, measured now and then (a layout read every frame is dear on phones) */
        const bar = document.querySelector('.ash .tabp.bar'), chat = document.querySelector('.ash .lay.tables .chatw');
        TOPM.at = now; TOPM.top = chat ? chat.offsetHeight + 10 : 70;
        /* a phone held sideways: the bar is a column down the right edge (hudtables) - the felt fits the rest of the screen, beside it */
        TOPM.side = bar && bar.offsetHeight > h * 0.6 && bar.offsetWidth < w * 0.45 ? bar.offsetWidth + 4 : 0;
        TOPM.bot = TOPM.side ? 6 : (bar ? bar.offsetHeight : 160) + 6;
        if (TOPM.side && chat) TOPM.top = Math.min(TOPM.top, 6);   /* (the chat sits over the felt's top-left corner, small) */ }
      const side = TOPM.side || 0, bot = TOPM.bot, top = Math.min(h * 0.3, TOPM.top), u = Math.max(0.3, (h - bot - top) / h), Af = (w - side) / h;
      const lp = localOf(T, TV.tile); let [x0, x1, z0, z1] = feltRect(T); const mid = (x0 + x1) / 2, right = lp.x > mid;
      if (T.half) { if (right) x0 = Math.max(x0, mid - T.half); else x1 = Math.min(x1, mid + T.half); }   /* 2026-10-21: "the table has two sides that are identical ... zoomed in on the layout for the player on the side of the table that their avatar is seated" */
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, LX = (x1 - x0) * 1.06, LZ = (z1 - z0) * 1.1;
      let ux = 0, uz = -1, across = LX, upDown = LZ;   /* the screen's up in the table's frame, and the felt's size across and up the screen */
      if (tall) { ux = right ? -1 : 1; uz = 0; across = LZ; upDown = LX; }
      const fov = tall ? 60 : 50, t2 = 2 * Math.tan(fov * Math.PI / 360), H = Math.max(upDown / u, across / (Af * 0.97)), d = H / t2;
      const sh = (bot - top) / h * H / 2, sr = side / 2 / h * H;   /* the felt's middle in the middle of the free band (and left of a side column) */
      ZM.ax = across; ZM.ay = upDown; ZM.m = H / ZM.s / h;   /* pan limits and metres per pixel at this zoom */
      const ox = cx - ux * sh + (-uz) * (ZM.px + sr) + ux * ZM.py, oz = cz - uz * sh + ux * (ZM.px + sr) + uz * ZM.py, dz = d / ZM.s;
      _e.set(ox, (T.bedY || 0.62) + dz, oz); _l.set(ox, T.bedY || 0.62, oz);
      T.group.localToWorld(_e); T.group.localToWorld(_l);
      _up.set(ux, 0, uz).transformDirection(T.group.matrixWorld);
      cam3.position.copy(_e); _m.lookAt(_e, _l, _up); cam3.quaternion.setFromRotationMatrix(_m);
      const near = Math.max(0.05, dz - 1.05);   /* the lantern and above are not drawn; everyone round the table whole, heads and all (2026-10-21: "all the heads of all the avatars are cut off") */
      if (Math.abs(cam3.fov - fov) > 0.01 || Math.abs(cam3.near - near) > 0.01) { cam3.fov = fov; cam3.near = near; cam3.updateProjectionMatrix(); }
      const my = K.myEnt; if (my.root.visible) { my.root.visible = false; K.FPV.hid = true; }
      return true;
    }
    /* THE CORNER VIEW (2026-10-21: "a mini view isometric view of both the dice rolling, and the ball on the wheel"): while the dice roll
       or the ball runs, a small square in the top right corner shows them from above at 45 degrees, following the dice */
    const ICAM = new THREE.PerspectiveCamera(32, 1, 0.05, 30), IFOC = { p: new THREE.Vector3(), on: false, box: null };
    function inset(renderer, scene) {
      const T = TV && TOP[TV.game] ? tableOf(TV.tbl) : null, f = T && T.focus ? T.focus(1 / 60) : null;
      if (!f) { if (IFOC.box) IFOC.box.style.display = 'none'; IFOC.on = false; return; }
      if (!IFOC.on) IFOC.p.copy(f.p); else IFOC.p.lerp(f.p, 0.3); IFOC.on = true;
      const w = K.host.clientWidth || 1, h = K.host.clientHeight || 1, sz = Math.round(Math.min(w, h) * (w < h ? 0.42 : 0.3)), x = w - (TOPM.side || 0) - sz - 8, top = TOPM.side ? 8 : Math.min(h * 0.3, TOPM.top);   /* (left of a side column) */
      if (!IFOC.box) { IFOC.box = document.createElement('div'); IFOC.box.style.cssText = 'position:absolute;pointer-events:none;border:2px solid #c9a24a;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.5);z-index:5'; K.host.appendChild(IFOC.box); }
      Object.assign(IFOC.box.style, { display: 'block', left: x - 2 + 'px', top: top - 2 + 'px', width: sz + 'px', height: sz + 'px' });
      if (!IFOC.lab) { IFOC.lab = document.createElement('div'); IFOC.lab.style.cssText = 'position:absolute;left:0;right:0;bottom:6px;text-align:center;font:700 28px/1 Georgia,serif;color:#fff3d0;text-shadow:0 2px 6px #000,0 0 2px #000'; IFOC.box.appendChild(IFOC.lab); }
      IFOC.lab.textContent = f.label || '';   /* [Claude 2026-10-22] the dice drawn in by the stick: their total under them */
      const d = f.r / Math.tan(16 * Math.PI / 180), dir = new THREE.Vector3(0.62, 0.78, 0.62).normalize();
      if (T.group) dir.applyQuaternion(T.group.getWorldQuaternion(new THREE.Quaternion()));
      ICAM.position.copy(IFOC.p).addScaledVector(dir, d); ICAM.lookAt(IFOC.p); ICAM.near = Math.max(0.05, d - 1.2); ICAM.updateProjectionMatrix();
      const yb = h - top - sz, hid = K.myEnt.root.visible;
      renderer.setScissorTest(true); renderer.setScissor(x, yb, sz, sz); renderer.setViewport(x, yb, sz, sz);
      renderer.render(scene, ICAM);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
    }
    function camera(cam3, dt) {   /* first person at the rail, looking at the felt; the head turned by a drag (the dice table and the wheel: from above) */
      if (!TV) return false; const T = tableOf(TV.tbl); if (!T) return false;
      if (TOP[TV.game] && T.felt) return topDown(cam3, T);
      if (cam3.near !== 0.1) { cam3.near = 0.1; cam3.updateProjectionMatrix(); }
      const o = TV.o, host = K.host, tall = (host.clientWidth || 1) < (host.clientHeight || 1);
      /* the eye: over your spot, leaning in over the rail (the simulations' view), looking at the felt's near half */
      const lp = localOf(T, TV.tile), sx = lp.x, sz = lp.z, d = Math.hypot(sx, sz) || 1, lean = Math.min(0.5, d * 0.3);
      _e.set(sx - sx / d * lean, T.eyeY || 1.35, sz - sz / d * lean); T.group.localToWorld(_e);
      _l.set(sx * 0.15, (T.bedY || 0.62), TV.game === 'twentyone' ? sz * 0.1 - 0.2 : sz * 0.15);
      { const z = 1 - 1 / ZM.s; _l.x += (sx * 0.5 - _l.x) * z; _l.z += (sz * 0.5 - _l.z) * z; }   /* zooming in closes on your own cards */
      T.group.localToWorld(_l);
      cam3.position.copy(_e); cam3.lookAt(_l);
      const k = Math.min(1, dt * 12); LOOK.yaw += (LOOK.tyaw - LOOK.yaw) * k; LOOK.pitch += (LOOK.tpitch - LOOK.pitch) * k;
      _eu.setFromQuaternion(cam3.quaternion, 'YXZ'); cam3.rotation.set(Math.max(-1.5, Math.min(1.5, _eu.x + LOOK.pitch)), _eu.y + LOOK.yaw, 0, 'YXZ');
      const fov = (tall ? 72 : 55) / ZM.s; if (Math.abs(cam3.fov - fov) > 0.01) { cam3.fov = fov; cam3.updateProjectionMatrix(); }
      const my = K.myEnt; if (my.root.visible) { my.root.visible = false; K.FPV.hid = true; }
      return true;
    }
    let lastFrame = 0;
    function frame(now, dt) {
      const p = me();
      for (const [tbl, T] of Object.entries(Object.fromEntries((core.M.objects || []).filter(o => o.k === 'gametable').map(o => [o.id, tableOf(o.id)])))) {
        if (!T) continue; const o = objOf(tbl), D = dealerFor(tbl, T, o);
        if (!T._tick) { const u = T.update; T._tick = 1; T.update = (d, t) => { T._at = performance.now(); return u(d, t); }; }
        if (performance.now() - (T._at || 0) > 60) T.update(Math.min(0.25, dt || 0.016));   /* a table the scene's own clock leaves (a lazy zone's): its cards, dice and ball still move, for players watching too (2026-10-21) */
        if (D) { let v = true; for (let q = T.felt; q && v; q = q.parent) v = q.visible; D.H.object.visible = v; if (v) { dealerTick(D, dt || 0.016); D.H.update(dt || 0.016); } }   /* the storeys above you are hidden: so is their dealer */
        if (!T.shownOnce && TBS.get(tbl)) { T.shownOnce = true; T.show(viewOf(TBS.get(tbl), o)); }
      }
      if (pend) {
        const o = objOf(pend.tbl), P = core.S.players[PID], t = o && o.spots[pend.i];
        if (!o || p.dead) pend = null;
        else if (p.x === t[0] && p.y === t[1] && (p.lv | 0) === (o.lv | 0) && !(P && P.path && P.path.length)) enter(pend.tbl, pend.i);
        else if (now - pend.at > 800 && !(P && P.path && P.path.length)) pend = null;
      }
      if (TV) {
        const t = TV.tile, o = TV.o;
        if (TV.moving) {   /* walking to another spot along the rail */
          const P = core.S.players[PID];
          if (p.x === t[0] && p.y === t[1] && !(P && P.path && P.path.length)) { TV.moving = 0; toBank({ t: 'tbsit', v: 1, s: TV.s, p: TV.spot + 1 }); }
          else if (now - TV.moving > 15000) { TV.moving = 0; standUp(); return; }
        } else if (p.dead || p.x !== t[0] || p.y !== t[1] || (p.lv | 0) !== (o.lv | 0)) { standUp(); return; }
        if (TV.inflight > 0 && Date.now() - (TV.wordAt || 0) > 30000) { TV.inflight = 0; nextWord(); }   /* never answered: the queue moves on */
        if (now - TV.hb > 5000) { TV.hb = now; toBank({ t: 'tb?', v: 2, s: TV.s }); atSave(); }   /* [Claude 2026-10-22] every 5 s: the Bank stands you up after 15 s without a word (was 20 s / 120 s) */
        if (Date.now() - drawT > 500) draw();   /* the clock */
      }
    }
    /* the table states: when each was heard (its clock counts from there) */
    const heard0 = heard; heard = function (d) { if (d && d.t === 'tbs') d.heardAt = Date.now(); return heard0(d); };
    if (ENGBANK.tbHear) ENGBANK.tbHear(heard);
    function net() { }
    return { menu, tap, hold, look, zoom, pinch, inset, pose, tagHidden, camera, target, frame, event, net, seated: () => !!TV, standUp,
      _T: tbl => tableOf(tbl), _atRail: () => [...SPOTENT].map(([k, e]) => [k, +e.yaw.toFixed(2), +e.tyaw.toFixed(2), +e.root.position.x.toFixed(2), +e.root.position.z.toFixed(2), e._tb, e.H.animation]), _view: () => TV && view(), _tbs: () => TBS, _bank: (fn, addr) => { SENDTO = fn; if (addr) { K.walletState.address = addr; K.walletState.data = K.walletState.data || {}; K.walletState.data.pids = Object.assign({ coins: 26 }, K.walletState.data.pids || {}); } return heard; }, _hear: d => heard(d), _bet: tapKey, _holdKey: k => TV && holdKey(k), _tv: () => TV, _drop: () => { TV = null; leaveView(); atTried = false; }, _enter: (tbl, i) => enter(tbl, i), _deposit: deposit, _act: act, _ins: ins, _bet21: bet21, _clear: clear, _leave: () => leave(true), _standAt: standAt };
  }
  const API = { install };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engtables', { api: 1, v: 1, needs: {} }, () => API);
})(typeof globalThis !== 'undefined' ? globalThis : this);
