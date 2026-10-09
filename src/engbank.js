/* ASHVALE 3D engine part: THE TOWN CHEST AND THE @ashvale BANK (split out of engine.js, 2026-10-08). The chest ledger, returns,
   ground holds and persisted drops, deposits, the trade window's offer, landed canoes, felled trees, sugar bush marks, the
   eclipse and nature talk round Ziibiing's fire, and the Bank room itself. install(K) gets what it needs (getters for K.CLOUD
   and K.save, which change) and returns what the engine uses. */
(function (G) {
  'use strict';
  function install(K) {
    const { DATA, SCENE, THREE, YOURFIRST_ADDR, net, netGear, palsHeard, D, DAY_S, MOD, PID, SEASON, SEASONS, SKYM, SUNL, SUN_EPOCH, TL, WAL, carriedHeard, core, coreCall, evicted, hud, me, proxies, proxyMat, q, scene, skyNow, sunTime, walletRefresh, walletState, waterY } = K;
      /* ---------- the town chest + the @ashvale Bank (handoff/bank_plan.md; 2026-10-04: bag and chest are one
         arcade wallet, "we just have to keep the game state"). The ledger, per wallet address, in this browser:
           bag[k]    delivered wallet units you carry     spent[k]   delivered units eaten/sold/dropped (not yet back with @ashvale)
           pend[k]   carried units the Bank has promised but not delivered yet     pspent[k]  promised units used up meanwhile
         chest = wallet - bag - spent; loose (carried, not in the wallet and not promised) = carried - bag - pend.
         Only delivered units can be stored; a promise is kept until the wallet shows it (2026-10-04: an item was
         duplicated and stored ones were lost while deliveries were still on their way). A deposit asks the Bank (realtime
         room 'bank', its sender proved by the mesh) to mint or grant the loose things to your own address. */
      const bank = { room: null, joining: null, sent: {}, busy: false, note: '', arriving: 0 };
      const CKEY = a => 'ashvale3d.chest.' + a + (K.HOME ? '#' + K.HOME : '');   /* each character's own ledger (a second home on the wallet) */
      let ledger = null;
      /* ONE CHEST, TWO BAGS (handoff/ziibiing_start_plan.md step 4): a wallet may have a character in each home, each with its own bag
         and ledger. Every save also tells the Bank, in the open, what this character carries of the wallet ('hold' {k: n}); 'holds?'
         answers what the OTHER characters carry, and this character's chest leaves that out - neither can take what the other holds.
         Asked when the chest opens, every minute, and again just before a take. */
      const HOLDS = { o: {}, at: 0, wait: [], multi: false, sent: '' };   /* multi: the Bank knows another character on this wallet */
      function holdsHeard(d) { HOLDS.o = d.o && typeof d.o === 'object' ? d.o : {}; HOLDS.multi = !!d.multi; HOLDS.at = Date.now(); const w = HOLDS.wait; HOLDS.wait = []; for (const f of w) f(); hud.refresh && hud.refresh('chest'); }
      function holdsAsk() { return new Promise(res => { HOLDS.wait.push(res); setTimeout(res, 3000); bankRoom().then(R => R && R.send(K.withHome({ t: 'holds?' }))).catch(() => res()); }); }
      function holdSend() { if (!ledger || !walletState.address) return; const b = {}; for (const k in ledger.bag) if (ledger.bag[k] > 0) b[k] = ledger.bag[k]; for (const k in ledger.pend) if (ledger.pend[k] > 0) b[k] = (b[k] || 0) + ledger.pend[k];
        const j = JSON.stringify(b); if (j === HOLDS.sent) return; HOLDS.sent = j;   /* only when what is carried changed: saves go out often (the mesh allows ~5 messages a second) */
        bankRoom().then(R => R && R.send(K.withHome({ t: 'hold', b }))).catch(() => { HOLDS.sent = ''; }); }
      setInterval(() => { if (walletState.address) holdsAsk(); }, 60000);
      const walCounts = () => { const D = walletState.data, o = {}; if (D) { for (const k in D.gear) o[k] = D.gear[k].length; for (const k in D.tokens) o[k] = (o[k] || 0) + D.tokens[k]; o.coins = D.gold || 0; } return o; };
      const carriedOf = k => core.invCount(me, k) + Object.values(me.eq || {}).filter(q => q && q.id === k).length;
      function ledgerFor(addr) {
        if (ledger && ledger.addr === addr) return ledger;
        /* the ledger travels IN THE SAVE (2026-10-07, @cinderwalker's GOLD 251 -> 2708): the bag is saved with the arcade and
           follows you to any browser, but this ledger lived only in this browser's storage - so a fresh browser, another device or
           cleared site data forgot what was spent and the chest offered it all again. The save's copy goes with the bag it was
           saved with, so it wins; this browser's copy is only for a save from before this change */
        let L = K.save && K.save.chestLedger && K.save.chestLedger.addr === addr ? JSON.parse(JSON.stringify(K.save.chestLedger)) : null;
        if (!L) try { L = JSON.parse(G.localStorage.getItem(CKEY(addr)) || 'null'); } catch (e) { /* private window */ }
        if (!L) {   /* first time for this wallet: what you already carry and the wallet holds counts as from the wallet */
          const w = walCounts(); L = { bag: {}, spent: {} };
          for (const k in w) { const c = carriedOf(k); if (c && w[k]) L.bag[k] = Math.min(c, w[k]); }
        }
        L.bag = L.bag || {}; L.spent = L.spent || {}; L.pend = L.pend || {}; L.pspent = L.pspent || {}; L.gone = L.gone || {}; L.autoTake = L.autoTake || {}; L.pchest = L.pchest || {}; L.lchest = L.lchest || {};
        L.addr = addr; ledger = L; return L;
      }
      const ledgerDrop = () => { ledger = null; };   /* the tests' lost count */
      const ledgerSnap = () => ledger && { addr: ledger.addr, bag: ledger.bag, spent: ledger.spent, pend: ledger.pend, pspent: ledger.pspent, out: ledger.out || {}, gone: ledger.gone || {}, autoTake: ledger.autoTake || {}, pchest: ledger.pchest || {}, lchest: ledger.lchest || {} };
      const ledgerSave = () => { if (!ledger) return; try { G.localStorage.setItem(CKEY(ledger.addr), JSON.stringify(ledgerSnap())); } catch (e) { /* private window */ } };
      function chestState() {
        if (!walletState.data || !walletState.address) return { chest: {}, loose: {}, bank, arriving: bank.arriving };
        const L = ledgerFor(walletState.address), w = walCounts(), keys = new Set(Object.keys(w).concat(Object.keys(L.bag), Object.keys(L.spent), Object.keys(L.pend), Object.keys(L.pspent), Object.keys(L.gone), Object.keys(L.autoTake), Object.keys(L.pchest), Object.keys(L.lchest)));
        for (const s of me.inv) if (s) keys.add(s.id);
        for (const q of Object.values(me.eq || {})) if (q) keys.add(q.id);
        const chest = {}, loose = {}, before = JSON.stringify([L.bag, L.spent, L.pend, L.pspent, L.gone, L.autoTake, L.pchest, L.lchest]); let arriving = 0;
        const g = (o, k) => o[k] || 0, put = (o, k, v) => { if (v > 0) o[k] = v; else delete o[k]; };
        for (const k of keys) {
          let c = carriedOf(k); const wk = w[k] || 0;
          let bag = g(L.bag, k), spent = g(L.spent, k), pend = g(L.pend, k), pspent = g(L.pspent, k), gone = g(L.gone, k), pch = g(L.pchest, k);
          /* 1. used up (eaten, sold, dropped): promised units first, then delivered ones */
          let x = bag + pend - c;
          if (x > 0) { const d = Math.min(x, pend); pend -= d; pspent += d; x -= d; const e = Math.min(x, bag); bag -= e; spent += e; }
          /* 1b. picked back up (your own death pile, something you dropped): a used-up unit whose NFT or token is still in
             your wallet, and not on its way back to @ashvale, is yours again - never a new deposit (2026-10-04) */
          if (x < 0) { const away = ((L.out && L.out[k]) || []).reduce((a, o) => a + o.n, 0), back = Math.min(-x, Math.max(0, spent - away)); spent -= back; bag += back; x += back;
            const bp = Math.min(-x, pspent); pspent -= bp; pend += bp; }
          /* 2. arrived: wallet units beyond what is counted turn promises into deliveries */
          let av = wk - bag - spent - gone;
          if (av > 0) { const d = Math.min(av, pend); pend -= d; bag += d; av -= d; const e = Math.min(av, pspent); pspent -= e; spent += e; const f = Math.min(av, pch); pch -= f; }   /* stored-while-arriving units land in the chest */
          /* 2b. only when the Bank said this count does not add up (a stale count, one per device): the wallet's unclaimed
             units stand for what you carry. New loot never eats your chest (the operator: a second steel helmet is a new one). */
          if (L.absorb && L.absorb[k] && av > 0 && c - bag - pend > 0) { const d = Math.min(av, c - bag - pend); bag += d; av -= d; }
          if (L.absorb) delete L.absorb[k];
          /* 3. the wallet holds less (traded away, or spent units went back to @ashvale) */
          let over = bag + spent + gone - wk;
          if (over > 0) { const gd = Math.min(over, gone); gone -= gd; over -= gd; }   /* a trade settled on chain */
          if (over > 0) { const d = Math.min(over, spent); spent -= d; over -= d;
            if (over > 0 && bag > 0) { L.short = L.short || {}; const sh = L.short[k]; if (sh && sh.n === over && walletState.data.at - sh.at > 20000) { const m = Math.min(over, bag, core.invCount(me, k)); if (m > 0) { core.storeItem(PID, k, m); c -= m; hud.chat('Your ' + core.item(k).name + ' went to its new owner.', 'info'); } delete L.short[k]; bag -= Math.min(over, bag); } else if (!sh || sh.n !== over) L.short[k] = { n: over, at: walletState.data.at }; over = 0; }   /* a trade on the arcade: the item leaves your bag once two wallet reads agree */
            bag -= Math.min(over, bag);
            if (d && L.out && L.out[k]) { let r = d; L.out[k] = L.out[k].filter(o => { if (r > 0 && o.st === 'sent') { r -= o.n; return false; } return true; }); } }   /* a return landed */
          /* traded in: the piece goes into your bag as soon as your wallet shows it (the operator: trade from and into your inventory) */
          const at = L.autoTake[k]; if (at && at.n > 0) { if (Date.now() > at.until) delete L.autoTake[k]; else { const free = wk - bag - spent - gone; const m = Math.min(at.n, free); if (m > 0) { core.grantItem(PID, k, m); bag += m; c += m; at.n -= m; if (at.n <= 0) delete L.autoTake[k]; } } }
          put(L.bag, k, bag); put(L.spent, k, spent); put(L.pend, k, pend); put(L.pspent, k, pspent); put(L.gone, k, gone); put(L.pchest, k, pch);
          /* what you dropped and is still lying on the ground is not in the chest, whatever the count says (2026-10-07: everything
             he dropped "showed up in his chest" too) */
          const onGround = core.S.ground.reduce((a, q) => a + (q.id === k && q.from === PID ? q.n : 0), 0);
          const lch = g(L.lchest, k), ch = wk - bag - spent - gone + pch + lch - onGround - Math.max(0, +HOLDS.o[k] || 0); if (ch > 0) chest[k] = ch;   /* less what the wallet's other character carries */   /* + what you stored before it arrived, or before it was even deposited */
          if (lch > 0) loose[k] = (loose[k] || 0) + lch;   /* stored-but-new still goes to the Bank */
          const ownBack = (L.picks || []).reduce((a, q) => a + (q.own && q.k === k && Date.now() - q.t < 7200000 ? q.n : 0), 0);   /* picked up from your own drop in the last two hours: never new */
          const lo = Math.min(c - bag - pend, c - ownBack - pend); if (lo > 0) loose[k] = (loose[k] || 0) + lo;
          arriving += pend + pspent + pch;
        }
        if (JSON.stringify([L.bag, L.spent, L.pend, L.pspent, L.gone, L.autoTake, L.pchest, L.lchest]) !== before) ledgerSave();
        bank.arriving = arriving;
        return { chest, loose, bank, arriving, bag: Object.assign({}, L.bag), pend: Object.assign({}, L.pend) };
      }
      /* ---------- returns: what you used up goes back to @ashvale (2026-10-04: a dropped Hawk ring stayed in his wallet
         while a friend carried it). A spent unit is sent to @ashvale with the arcade's creator allowance (testnet, no card,
         silent: a send that would need the player's say-so fails instead); whoever picks a drop up is paid that same piece
         from @ashvale's stock by the Bank. On unless rules.returns is false (the creator allowance is live since 2026-10-04 21:30;
         only @ashvale's own pieces and tokens to @ashvale are ever sent, so no card can appear).
         L.out[k] = [{id, n, piece, st: 'pending'|'sent', t}] - what is on its way back, so nothing is sent twice. */
      const RETURNS = !(D.rules && D.rules.returns === false);
      let returning = false;
      async function returnNext() {
        if (!RETURNS || returning || !walletState.data || !walletState.address) return;
        chestState();   /* count what was used up since the last look */
        const L = ledgerFor(walletState.address); L.out = L.out || {};
        const W = walletState.data, now = Date.now();
        for (const k of Object.keys(L.out)) L.out[k] = L.out[k].filter(o => !(o.st === 'sent' && now - o.t > 900000));   /* reflected long ago */
        let pick = null;
        for (const k in L.spent) {
          const away = (L.out[k] || []).reduce((a, o) => a + o.n, 0), n = (L.spent[k] || 0) - away - holdOf(L, k);   /* a fresh drop waits 90 s */
          if (n <= 0) continue;
          const homeOf = (maker) => (maker === YOURFIRST_ADDR || maker === '@yourfirstname' || maker === 'yourfirstname') ? '@yourfirstname' : '@ashvale';
          if (W.gear[k]) { const used = new Set((L.out[k] || []).map(o => o.piece)), dr = (L.dropped || []).filter(d => d.k === k && W.gear[k].indexOf(d.pc) >= 0 && (d.taken || Date.now() - d.t >= HOLD)).map(d => d.pc), pc = dr.find(x => !used.has(x)) || W.gear[k].find(x => !used.has(x)); if (pc) { pick = { k, n: 1, body: { kind: 'inscription', inscription: pc }, piece: pc, home: homeOf(W.makers && W.makers[pc]) }; break; } }
          else if (W.pids && W.pids[k]) { pick = { k, n, body: { kind: 'token', propertyid: W.pids[k], amount: String(n) }, home: homeOf(W.issuers && W.issuers[String(W.pids[k])]) }; break; }
        }
        if (!pick) return;
        returning = true;
        try {
          const r = await fetch('/r/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify(Object.assign({ to: pick.home, label: pick.home === '@yourfirstname' ? 'yourfirstname' : 'ASHVALE', note: pick.home === '@yourfirstname' ? 'Back to yourfirstname' : 'Back to Ashvale', silent: true }, pick.body)) });
          const j = await r.json().catch(() => ({}));
          if (r.status !== 202 || !j.id) { returnsOff = now + 600000; return; }   /* refused: try again in ten minutes */
          const o = { id: j.id, n: pick.n, piece: pick.piece || null, st: 'pending', t: now }; (L.out[pick.k] = L.out[pick.k] || []).push(o); ledgerSave();
          for (let i = 0; i < 240 && o.st === 'pending'; i++) {
            await new Promise(ok => setTimeout(ok, 3000));
            const s = await fetch('/r/send/' + encodeURIComponent(j.id), { credentials: 'same-origin' }).then(x => x.json()).catch(() => null);
            if (!s || s.status === 'pending') continue;
            if (s.status === 'sent') { o.st = 'sent'; o.t = Date.now(); setTimeout(walletRefresh, 60000); }
            else { L.out[pick.k] = L.out[pick.k].filter(q => q !== o); returnsOff = Date.now() + 600000; }
            ledgerSave();
          }
        } catch (e) { returnsOff = now + 600000; }
        finally { returning = false; }
      }
      let returnsOff = 0;
      if (RETURNS) setInterval(() => { if (Date.now() > returnsOff) returnNext(); }, 5000);
      /* ---------- exact NFTs through drops (2026-10-04: "if they drop an NFT and another player picks it up it should
         be the exact same NFT"): the item that falls carries the piece it was. Your own game notes which piece left your
         bag and where; the Bank keeps that piece for whoever picks it up there; your returns send exactly that piece. */
      /* ground holds (2026-10-04: "When an object changes its state from being in your inventory to on the ground or
         from on the ground to in your inventory wait 90 seconds before sending the transaction unless someone else picks it
         up then send it straight"): a drop is not sent back for HOLD ms (pick it up again and nothing is ever sent); a pickup
         is not deposited for HOLD ms; when another player takes your drop it goes at once */
      const HOLD = 90000;
      const holdOf = (L, k) => { const now = Date.now(); return (L.holds || []).filter(h => h.k === k && !h.taken && now - h.t < HOLD).reduce((a, h) => a + h.n, 0); };
      const pickHold = (L, k) => { const now = Date.now(); return (L.picks || []).filter(q => q.k === k && now - q.t < HOLD).reduce((a, q) => a + q.n, 0); };
      /* persisted drops and the @ashvale Bank, whether or not this game's wallet view has loaded yet (2026-10-06: a pickup
         made before it had was never reported, and the Bank kept showing - and would have paid again for - Gold already
         taken): a pickup of anything persisted is reported at once; a drop of a persisted TOKEN (Gold...) is reported by
         amount. A persisted NFT's drop needs its exact piece, so it stays with the wallet code below. */
      function persistTell(e) {
        if (!core.persists || e.x == null || !core.persists(e.id, e.n || 1)) return;
        const tell = o => bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send(o); });
        if (e.e === 'take' && e.p === PID) tell({ t: 'took', v: 1, id: e.id, n: e.n || 1, x: e.x, y: e.y });
        else if ((e.e === 'drop' || e.e === 'xdrop') && (e.owner === PID || e.from === PID)) {
          const d = core.item(e.id); if (!d) return;
          const pieces = walletState.data && walletState.data.gear && walletState.data.gear[e.id];
          if (pieces && pieces.length) return;   /* an inscribed piece is named below, so the Bank keeps that exact one */
          tell({ t: 'drop', v: 3, items: [[e.id, '', e.n || 1]], x: e.x, y: e.y, sunk: e.sunk || undefined });   /* Gold, and a town stone: it does not stack, and it still has to lie there until someone takes it */
        }
      }
      function chestEvent(e) {
        persistTell(e);
        if (!walletState.data || !walletState.address) return;
        const L = ledgerFor(walletState.address), now = Date.now(); L.dropped = L.dropped || []; L.picks = L.picks || []; L.holds = L.holds || [];
        if (e.e === 'take' && e.p !== PID && e.x != null) {   /* someone else took one of your drops: it goes now */
          const h = L.holds.find(q => q.k === e.id && !q.taken && Math.abs(q.x - e.x) <= 2 && Math.abs(q.y - e.y) <= 2 && now - q.t < HOLD);
          if (h) { h.taken = true; const d = L.dropped.find(q => q.k === e.id && !q.taken && Math.abs(q.x - e.x) <= 2 && Math.abs(q.y - e.y) <= 2); if (d) d.taken = true; ledgerSave(); returnsOff = 0; setTimeout(returnNext, 500); }
          return;
        }
        if ((e.e === 'drop' || e.e === 'xdrop') && (e.owner === PID || e.from === PID)) {
          const backedAll = Math.max(0, (L.bag[e.id] || 0) - carriedOf(e.id));
          if (backedAll > 0) { L.holds.push({ k: e.id, n: Math.min(e.n || 1, backedAll), x: e.x, y: e.y, t: now }); L.holds = L.holds.filter(h => now - h.t < 7200000).slice(-100); ledgerSave(); setTimeout(returnNext, HOLD + 1000); }
          /* persisted (2026-10-06: Gold, stones, magical things, anything worth 100+ GOLD stay where they fell until
             somebody picks them up, held by the @ashvale Bank): the Bank is told what lies where, so every player sees it */
          const keep = core.persists && core.persists(e.id, e.n || 1), W = walletState.data, have = W.gear[e.id];
          if (!have || !have.length) return;   /* only NFTs have an identity; tokens are just amounts (persisted ones: persistTell) */
          const out = Object.values(L.out || {}).flat().map(o => o.piece), held = new Set(L.dropped.filter(d => now - d.t < 7200000).map(d => d.pc).concat(out));
          const backed = Math.max(0, (L.bag[e.id] || 0) - carriedOf(e.id)), items = [];
          for (const pc of have) { if (items.length >= Math.min(e.n || 1, backed)) break; if (!held.has(pc)) { items.push([e.id, pc]); L.dropped.push({ k: e.id, pc, x: e.x, y: e.y, t: now }); } }
          if (!items.length) return;
          L.dropped = L.dropped.filter(d => now - d.t < 7200000).slice(-100); ledgerSave();
          bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'drop', v: keep || e.sunk ? 3 : 2, items: keep || e.sunk ? items.map(it => [it[0], it[1], 1]) : items, x: e.x, y: e.y, sunk: e.sunk || undefined }); });
        } else if (e.e === 'take' && e.p === PID && e.x != null) {
          L.picks.push({ k: e.id, n: e.n || 1, x: e.x, y: e.y, t: now, own: e.own ? 1 : 0 }); L.picks = L.picks.filter(q => now - q.t < 7200000).slice(-100);
          /* YOUR OWN DROP, BACK IN YOUR BAG (2026-10-07, @tbuuol died, picked his things up and ended with two of everything):
             what it had counted as used up is yours again at once - never left to a later guess, never loose, never a deposit */
          if (e.own) { const m = Math.min(e.n || 1, L.spent[e.id] || 0); if (m > 0) { L.spent[e.id] -= m; if (!L.spent[e.id]) delete L.spent[e.id]; L.bag[e.id] = (L.bag[e.id] || 0) + m; } }
          ledgerSave();
          L.holds = L.holds.filter(h => !(h.k === e.id && !h.taken && Math.abs(h.x - e.x) <= 2 && Math.abs(h.y - e.y) <= 2));   /* your own drop back in your bag: nothing to send */
          setTimeout(depositSoon, HOLD + 1000);
        }
      }
      /* deposits happen by themselves (the operator: "remove that 'put in my wallet' option ... they could cause duplications"):
         whatever you carry that the wallet does not hold yet goes to the Bank within seconds; a kind the Bank refused waits ten minutes */
      let depT = 0;
      function depositSoon() { if (!WAL || depT) return; depT = setTimeout(() => { depT = 0; if (bank.busy || !walletState.data || !walletState.address) return; const C = chestState(); if (Object.keys(C.loose).length) chestDeposit(); }, 2000); }
      setInterval(() => {
        if (!WAL || bank.busy || !walletState.data || !walletState.address) return;
        const C = chestState(); if (Object.keys(C.loose).length) chestDeposit();
      }, 15000);
      setInterval(() => { if (WAL && walletState.address && !document.hidden) walletRefresh(); }, 60000);   /* the chest follows trades and deliveries */
      /* the trade window offers only what you CARRY that your wallet holds (2026-10-04) */
      async function tradeOfferable() {
        if (!walletState.data) await walletRefresh();
        const W = walletState.data, kinds = []; if (!W || !walletState.address) return { kinds, gold: 0 };
        chestState(); const L = ledgerFor(walletState.address);
        const busy = new Set(Object.values(L.out || {}).flat().map(o => o.piece));
        for (const k in L.bag) {
          if (!W.gear[k] || !(L.bag[k] > 0) || !core.invCount(me, k)) continue;   /* in the bag (not worn), delivered */
          const pieces = W.gear[k].filter(pc => !busy.has(pc)).slice(0, Math.min(L.bag[k], core.invCount(me, k))); if (!pieces.length) continue;
          const d = core.item(k); let icon = null; try { icon = MOD.icon(k, 64); } catch (e) { /* none */ }
          kinds.push({ key: k, name: d.name, icon, pieces });
        }
        for (const k in L.bag) {   /* stacks (logs, ore, meat...): any number of them, up to what you carry (2026-10-04) */
          if (k === 'coins' || W.gear[k] || !(W.pids && W.pids[k]) || !(L.bag[k] > 0)) continue;
          const max = Math.min(L.bag[k], core.invCount(me, k)); if (max <= 0) continue;
          const d = core.item(k); let icon = null; try { icon = MOD.icon(k, 64); } catch (e) { /* none */ }
          kinds.push({ key: k, name: d.name, icon, token: W.pids[k], max, pieces: [] });
        }
        return { kinds, gold: Math.min(core.invCount(me, 'coins'), L.bag.coins || 0) };
      }
      function tradeSettled(gave, got) {
        if (!walletState.address) return;
        const L = ledgerFor(walletState.address);
        if (gave) { const k = gave.key || 'coins', n = gave.inscription ? 1 : +gave.amount;
          if (k) { const m = core.storeItem(PID, k, n); L.bag[k] = Math.max(0, (L.bag[k] || 0) - m); L.gone[k] = (L.gone[k] || 0) + m; } }   /* it left your bag */
        if (got) { const k = got.key || 'coins', n = got.inscription ? 1 : +got.amount;   /* into your bag at once, counted as arriving (a
             promise, like a Bank delivery) until your wallet shows it (2026-10-08: "as soon as the trade transaction hits the mempool") */
          if (k && n > 0) { core.grantItem(PID, k, n); L.pend[k] = (L.pend[k] || 0) + n; } }
        ledgerSave(); hud.refresh('all'); for (const t of [20000, 60000, 120000, 300000]) setTimeout(walletRefresh, t);
      }
      function tradeUndone(gave, got) {   /* the chain refused a swap the game had already applied: each side gets its own back */
        if (!walletState.address) return;
        const L = ledgerFor(walletState.address);
        if (gave) { const k = gave.key || 'coins', n = gave.inscription ? 1 : +gave.amount;
          if (k && n > 0) { core.grantItem(PID, k, n); const back = Math.min(n, L.gone[k] || 0); L.gone[k] = (L.gone[k] || 0) - back; L.bag[k] = (L.bag[k] || 0) + back; } }
        if (got) { const k = got.key || 'coins', n = got.inscription ? 1 : +got.amount;
          if (k && n > 0) { const m = core.storeItem(PID, k, n); L.pend[k] = Math.max(0, (L.pend[k] || 0) - m); } }
        ledgerSave(); hud.refresh('all'); hud.chat('The trade did not go through: your things are back where they were.', 'warn');
      }
      function chestTake(k, n) { if (HOLDS.multi && Date.now() - HOLDS.at > 5000) holdsAsk().then(() => chestTake0(k, n)); else chestTake0(k, n); }   /* with a second character on the wallet, ask the Bank first: it may have just taken it */
      function chestTake0(k, n, quiet) {
        const C = chestState(); n = Math.min(n, C.chest[k] || 0); if (n <= 0) return 0;
        const d = core.item(k), free = me.inv.filter(s => !s).length, room0 = d.stack ? (core.invCount(me, k) || free ? n : 0) : Math.min(n, free);
        if (room0 <= 0) { if (!quiet) hud.chat('Your bag is full.', 'warn'); return 0; }
        core.grantItem(PID, k, room0); const L = ledgerFor(walletState.address), real = Math.max(0, (C.chest[k] || 0) - (L.pchest[k] || 0) - (L.lchest[k] || 0)), fromReal = Math.min(room0, real), fromP = Math.min(room0 - fromReal, L.pchest[k] || 0), fromL = room0 - fromReal - fromP;
        L.bag[k] = (L.bag[k] || 0) + fromReal; L.pchest[k] = (L.pchest[k] || 0) - fromP; L.pend[k] = (L.pend[k] || 0) + fromP; L.lchest[k] = Math.max(0, (L.lchest[k] || 0) - fromL); ledgerSave();
        if (!quiet) hud.chat('You take ' + (room0 > 1 ? room0 + ' x ' : '') + d.name + ' from your chest.', 'info'); hud.refresh('all');
        return room0;
      }
      function withdrawAll() {   /* the chest's Withdraw all (sadfrogltc 2026-10-09); with a second character, the Bank's count first */
        if (!walletState.address) { hud.chat('Sign in to use the chest.', 'warn'); return; }
        const go = () => {
          const C = chestState(); let n = 0;
          for (const k of Object.keys(C.chest)) n += chestTake0(k, C.chest[k] || 0, true);
          if (n) hud.chat('You take what you can carry from your chest.', 'info');
          else if (Object.keys(C.chest).length) hud.chat('Your bag is full.', 'warn');
          hud.refresh('all');
        };
        if (HOLDS.multi && Date.now() - HOLDS.at > 5000) holdsAsk().then(go); else go();
      }
      function chestStore(k, n, quiet) {
        chestState(); const L = ledgerFor(walletState.address), have = core.invCount(me, k);
        const fromBag = Math.min(n, L.bag[k] || 0, have), fromPend = Math.min(n - fromBag, L.pend[k] || 0, have - fromBag), fromNew = Math.min(n - fromBag - fromPend, have - fromBag - fromPend), m = fromBag + fromPend + fromNew;   /* settled or not, it can go in the chest (2026-10-05) */
        if (m <= 0) return 0;
        core.storeItem(PID, k, m); L.bag[k] = (L.bag[k] || 0) - fromBag; L.pend[k] = (L.pend[k] || 0) - fromPend; L.pchest[k] = (L.pchest[k] || 0) + fromPend; L.lchest[k] = (L.lchest[k] || 0) + fromNew; ledgerSave();
        if (!quiet) hud.chat('You put ' + (m > 1 ? m + ' x ' : '') + core.item(k).name + ' in your chest.', 'info'); hud.refresh('all');
        return m;
      }
      /* the chest's two buttons (sadfrogltc 2026-10-08): everything in the bag, or everything worn, into the chest */
      function depositInv() {
        const counts = {}; for (const s of me.inv) if (s) counts[s.id] = (counts[s.id] || 0) + s.n;
        let n = 0; for (const k in counts) n += chestStore(k, counts[k], true);
        if (n) hud.chat('You put your inventory in your chest.', 'info');
        hud.refresh('all');
      }
      function depositWorn() {
        if (!walletState.address) { hud.chat('Sign in to use the chest.', 'warn'); return; }
        chestState(); const L = ledgerFor(walletState.address); let n = 0;
        for (const slot of Object.keys(me.eq || {})) {
          const e = core.takeOff && core.takeOff(PID, slot); if (!e) continue;
          /* the same three counts as chestStore: settled, still arriving (stays a promise, now in the chest), or new */
          const fromBag = Math.min(e.n, L.bag[e.id] || 0), fromPend = Math.min(e.n - fromBag, L.pend[e.id] || 0), rest = e.n - fromBag - fromPend;
          L.bag[e.id] = (L.bag[e.id] || 0) - fromBag; if (!L.bag[e.id]) delete L.bag[e.id];
          if (fromPend) { L.pend[e.id] -= fromPend; if (!L.pend[e.id]) delete L.pend[e.id]; L.pchest[e.id] = (L.pchest[e.id] || 0) + fromPend; }
          if (rest) L.lchest[e.id] = (L.lchest[e.id] || 0) + rest;
          n++;
        }
        ledgerSave(); if (n) { hud.chat('You put your worn equipment in your chest.', 'info'); netGear(); }
        hud.refresh('all');
      }
      /* felled trees, shared by every player for ever (2026-10-05): you tell the @ashvale Bank when you fell one, and
         ask it which trees round you are already down whenever you arrive somewhere new (and every few minutes) */
      /* LANDED CANOES (2026-10-07): the core keeps them, the @ashvale Bank keeps them a game year for everyone, and here
         each is a canoe afloat at the bank you can tap to get in */
      const BOATM = new Map(), DIR8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
      function boatShow(x, y, face) {
        const k = x + ',' + y; if (BOATM.has(k) || !SCENE.canoeMesh) return;
        const c = SCENE.canoeMesh(), d = DIR8[face | 0] || DIR8[2]; c.position.set(x + 0.5, waterY(x + 0.5, y + 0.5) - 0.02, y + 0.5); c.rotation.y = Math.atan2(d[0], d[1]); scene.add(c);
        const pk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 4.4), proxyMat); pk.position.copy(c.position); pk.rotation.y = c.rotation.y; pk.userData.pick = { kind: 'canoe', x, y }; scene.add(pk); proxies.push(pk);
        BOATM.set(k, { c, pk });
      }
      /* the landing's canoe: not there while you sit in it, nor while three or more are left at the banks nearby (core.dockFull) */
      /* THE NEXT ECLIPSES, as the people round Ziibiing's fire tell them (2026-10-07): the next eclipse of the sun and of the moon
         that can be seen from where you stand (the sun or the moon up then), worked out from the sky module once a game day */
      const SKYT = { day: -1, text: null };
      function skyTell() {
        if (!SKYM || !SUNL.b) return null;
        const now = sunTime(SUNL.b), day = Math.floor((now / 1000 - SUN_EPOCH) / DAY_S); if (day === SKYT.day && SKYT.text) return SKYT.text;
        const up = SUNL.b.u, d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; let sol = null, lun = null;
        for (const e of SKYM.next(now, SUNL.lonA, 365 * 8)) {
          if (e.kind === 'solar' && !sol) { for (let t = e.t - DAY_S * 600; t <= e.t + DAY_S * 600 && !sol; t += 20000) { const st = SKYM.at(t, SUNL.lonA); if (d3(st.sun, up) > 0.03 && SKYM.solarCover(st, up) > 0.05) sol = t; } }
          if (e.kind === 'lunar' && !lun && (e.umbra || 0) > 0) { const st = SKYM.at(e.t, SUNL.lonA); if (d3(st.moon, up) > 0.03) lun = e.t; }
          if (sol && lun) break;
        }
        const when = t => { const d = (t / 1000 - SUN_EPOCH) / DAY_S, y = Math.floor(d / 365) + 1, dd = Math.floor(d % 365) + 1, gd = Math.max(0, Math.round((t - now) / 1000 / DAY_S)), rh = (t - now) / TL.n / 3600000;
          return 'on day ' + dd + ' of year ' + y + ', ' + (gd ? gd + ' days from now' : 'this very day') + ' (' + (rh < 48 ? Math.max(1, Math.round(rh)) + ' hours' : Math.round(rh / 24) + ' days') + ' as you count them)'; };
        SKYT.day = day;
        SKYT.text = 'And watch the sky. ' + (sol ? 'Giizis, the sun, will be eaten by the moon ' + when(sol) + '. ' : 'The sun will not be eaten here for many winters. ') + (lun ? 'Dibiki-giizis, the night sun, the moon, will turn red ' + when(lun) + '.' : 'The moon will not turn red here for many winters.');
        return SKYT.text;
      }
      if (core.setSkyTell) core.setSkyTell(() => skyTell());
      /* THE PEOPLE WHO WATCH THE WORLD (2026-10-08: "hyper aware of the seasons, the stars, the planets, the sun, the moon,
         and nature"; each one watches one thing and ends with it). Worked out from the same seasons, temperature and sky every game
         uses where you stand. Ojibwe nouns from the Ojibwe People's Dictionary. */
      /* THIRTEEN MOONS (2026-10-08: "there should be 13 months because there are 13 moons"; the 13th, miini-giizis, his
         choice): each moon is named as it comes in the real sky - by where its full moon falls in the year, so a year with only twelve
         new moons skips one name, as on Earth */
      const MOONS = [['gichi-manidoo-giizis', 'the great spirit moon'], ['namebini-giizis', 'the sucker moon'], ['onaabani-giizis', 'the moon of the crust on the snow'],
        ['iskigamizige-giizis', 'the sugar-making moon'], ['zaagibagaa-giizis', 'the budding moon'], ["ode'imini-giizis", 'the strawberry moon'],
        ['aabita-niibino-giizis', 'the midsummer moon'], ['miini-giizis', 'the berry moon'], ['manoominike-giizis', 'the ricing moon'], ['waatebagaa-giizis', 'the moon the leaves turn'],
        ['binaakwe-giizis', 'the falling-leaves moon'], ['gashkadino-giizis', 'the freezing moon'], ['manidoo-giizisoons', 'the little spirit moon']];
      function natureTell(kind) {
        if (!SEASONS || SEASON.lat == null) return null;
        const now = skyNow(), lat = SEASON.lat, S = SEASONS.at(lat, now), sp = SEASONS.sap(lat, now), T = SEASONS.temperature(lat, now, SEASON.lon);
        const deg = v => Math.round(v) + ' degrees';
        if (kind === 'weather') {   /* Animikii: last night, today, the sap, the ice */
          const R = SEASONS.dayRange(lat, now), night = R.low < -8 ? 'froze hard' : R.low < 0 ? 'froze' : 'stayed above freezing';
          let t = 'Last night it ' + night + ', ' + deg(R.low) + '. Today it will reach ' + deg(R.high) + ', and it is ' + deg(T) + ' now.';
          if (sp.season) t += (sp.day ? ' A night that froze and a day that thaws: the ziinzibaakwadwaaboo (maple sap) is running. Go to the trees.' : R.high <= 0 ? ' Too cold to thaw today. The sap stays in the tree.' : ' The night did not freeze. The sap will not run today.') + ' The maples bud in ' + sp.left + ' days.';
          else if (S.frozen) t += ' The mikwam (ice) is thick on the lakes. Walk on it while you can.';
          else if (S.snow > 0.2) t += ' The goon (snow) is going soft. The sap will run soon.';
          else if (S.name === 'summer') t += ' In this heat the animikiig, the thunderers, will come out of the west.';
          return t;
        }
        if (kind === 'plants') {   /* Ziigwan: the trees, the rice, the birds */
          const st = S.leaf.stage, rice = S.riceAt ? S.riceAt(0.5) : null;
          const tree = S.snow > 0.3 || st === 'bare' ? 'The ininaatig (maple) and the wiigwaasaatig (birch) are sleeping, bare.' : st === 'budding' ? (S.leaf.bud < 0.05 ? 'The buds on the ininaatig (maple) are still tight.' : 'The buds are opening at the tips of the branches.') :
            st === 'turning' ? 'The ininaatig (maple) is turning red and the wiigwaasaatig (birch) gold.' : st === 'falling' ? 'The leaves are coming down this week.' : 'The trees are in full leaf.';
          const ricing = S.rice ? ' The manoomin (wild rice) is ripe. Go ricing.' : rice && rice.tall > 0.1 && !rice.ripe ? ' The manoomin (wild rice) is growing tall on the lake.' : '';
          const bird = S.snow > 0.3 ? ' Only the gijigijigaaneshiinh (chickadee) and the aandeg (crow) stay with us now.' : S.name === 'spring' ? ' The nika (Canada goose) is flying north, and the opichi (robin) is back.' :
            S.name === 'summer' ? ' The maang (loon) is calling on the lake at night.' : S.name === 'autumn' ? ' The nika (Canada goose) is going south again.' : '';
          return tree + ricing + bird;
        }
        if (kind === 'moon') {   /* Waabigwan: the moon, its phase and its name */
          const SK = SKYM && SUNL.lonA != null ? SKYM.at(now, SUNL.lonA) : null; if (!SK) return null;
          const ph = SK.phase, toFull = Math.round(((0.5 - ph + 1) % 1) * 29.53), toNew = Math.round(((1 - ph) % 1) * 29.53);
          const look = ph < 0.03 || ph > 0.97 ? 'There is no moon tonight. It is new, and the stars have the sky.' : Math.abs(ph - 0.5) < 0.03 ? 'Dibiki-giizis (the moon) is full tonight.' :
            ph < 0.5 ? 'Dibiki-giizis (the moon) is growing, ' + (Math.abs(ph - 0.25) < 0.03 ? 'half full' : ph < 0.1 ? 'a thin sliver' : ph < 0.25 ? 'a crescent' : 'more than half') + '. It will be full in ' + toFull + ' days.' :
            'Dibiki-giizis (the moon) is getting smaller, ' + (Math.abs(ph - 0.75) < 0.03 ? 'half again' : ph > 0.9 ? 'a thin sliver' : ph > 0.75 ? 'a crescent' : 'more than half') + '. It will be new in ' + toNew + ' days.';
          const tFull = now + (0.5 - ph) * 29.530588853 * DAY_S * 1000, doy = ((SEASONS.at(lat, tFull).p * 365 + 79) % 365 + 365) % 365, M13 = MOONS[Math.min(12, Math.floor(doy * 13 / 365))];
          return look + ' This is ' + M13[0] + ', ' + M13[1] + '.';
        }
        if (kind === 'sky') {   /* Makwa: the sun's day, and the planets and stars tonight */
          if (!SKYM || !SUNL.b) return null;
          const B = SUNL.b, d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], t0 = now - (((now / 1000 - SUN_EPOCH) / DAY_S) % 1) * DAY_S * 1000;
          let rise = null, set = null, prev = null;
          for (let k = 0; k <= 96; k++) { const t = t0 + k * DAY_S * 1000 / 96, up = d3(SKYM.at(t, SUNL.lonA).sun, B.u); if (prev != null) { if (prev < 0 && up >= 0 && rise == null) rise = k; if (prev >= 0 && up < 0 && set == null) set = k; } prev = up; }
          const hh = k => { const h = ((k / 96 + (SEASON.lon || 0) / 360) % 1 + 1) % 1 * 24; return Math.floor(h) + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'); };   /* local time: noon is the sun's highest */
          let t = rise == null && set == null ? (prev >= 0 ? 'Giizis (the sun) does not set at all now.' : 'Giizis (the sun) does not rise at all now. This is the long dark.') : 'Giizis (the sun) rises at ' + (rise != null ? hh(rise) : '-') + ' and sets at ' + (set != null ? hh(set) : '-') + ' today.';
          const mid = t0 + DAY_S * 1000 * (((set != null ? set : 72) / 96 + 0.5 * (1 - (set != null ? set : 72) / 96))), PL = SKYM.planets ? SKYM.planets(mid, SUNL.lonA) : [];
          const vis = PL.filter(P => d3(P.dir, B.u) > 0.1 && P.mag < 3).sort((a, b) => a.mag - b.mag).map(P => P.name);
          t += vis.length ? ' Tonight ' + vis.slice(0, 3).join(' and ') + (vis.length > 1 ? ' are' : ' is') + ' up among the anangoog (stars).' : ' Tonight no wandering star is up, only the anangoog (stars).';
          return t;
        }
        return null;
      }
      if (core.setNatureTell) core.setNatureTell((kind) => natureTell(kind));
      function docksShow() { if (!SCENE.docks) return; const mb = core.S.players[PID] && core.S.players[PID].boat; for (const c of SCENE.docks()) c.visible = !mb && !(core.dockFull && c.userData.dock && core.dockFull(c.userData.dock[0], c.userData.dock[1])); }
      function boatHide(x, y) { const k = x + ',' + y, b = BOATM.get(k); if (!b) return; scene.remove(b.c); scene.remove(b.pk); const i = proxies.indexOf(b.pk); if (i >= 0) proxies.splice(i, 1); BOATM.delete(k); }
      function boatTell(o) { bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send(o); }); setTimeout(() => boatsAsk(true), 3000); }
      let boatsT = 0; const boatsGot = {};
      function boatsAsk(force) { if (!force && performance.now() - boatsT < 10000) return; boatsT = performance.now(); bankRoom().then(R => { if (R && R.me) R.send({ t: 'boats?', v: 1, x0: me.x - 80, y0: me.y - 80, x1: me.x + 80, y1: me.y + 80 }); }); }
      function boatsHeard(d) { const k = (d.box || []).join(','), G = boatsGot[k] = boatsGot[k] || { items: [], n: 0 }; G.items.push(...(d.items || [])); G.n++; if (G.n >= (d.of | 0)) { delete boatsGot[k]; coreCall(() => core.setBoats && core.setBoats(d.box, G.items)); } }
      setInterval(() => boatsAsk(false), 10000); setTimeout(() => boatsAsk(true), 7000);
      function fellTell(x, y) { bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'fell', v: 1, x, y }); }); }
      let fellAt = null, fellT = 0;
      function felledAsk(force) {
        const k = Math.floor(me.x / 48) + ',' + Math.floor(me.y / 48); if (!force && k === fellAt && performance.now() - fellT < 240000) return;
        fellAt = k; fellT = performance.now();
        bankRoom().then(R => { if (R && R.me) R.send({ t: 'felled?', v: 1, x0: me.x - 80, y0: me.y - 80, x1: me.x + 80, y1: me.y + 80 }); });
      }
      setInterval(() => felledAsk(false), 15000); setTimeout(() => felledAsk(true), 8000);
      /* the sugar bush marks (2026-10-08): a maple gives sap once a game day and a birch its bark once a year, to whoever comes first */
      function markTell(e) { bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'mark', v: 1, k: e.k, x: e.x, y: e.y, p: e.v }); }); }
      let markAt = null, markT = 0;
      function marksAsk(force) {
        const k = Math.floor(me.x / 48) + ',' + Math.floor(me.y / 48); if (!force && k === markAt && performance.now() - markT < 120000) return;
        markAt = k; markT = performance.now();
        bankRoom().then(R => { if (R && R.me) for (const kind of ['sap', 'bark']) R.send({ t: 'marks?', v: 1, k: kind, x0: me.x - 80, y0: me.y - 80, x1: me.x + 80, y1: me.y + 80 }); });
      }
      setInterval(() => marksAsk(false), 15000); setTimeout(() => marksAsk(true), 9000);
      /* persisted drops near you, from the @ashvale Bank: asked when you arrive somewhere new and every minute (the operator
         2026-10-06: dropped Gold and valuables "should persist ... in the exact same location until a player picks them up") */
      let gAt = null, gT = 0, gSeq = 0; const gGot = {};
      function groundAsk(force) {
        const k = Math.floor(me.x / 48) + ',' + Math.floor(me.y / 48); if (!force && k === gAt && performance.now() - gT < 60000) return;
        gAt = k; gT = performance.now(); const q = 'g' + (++gSeq);
        bankRoom().then(R => { if (R && R.me && !R.me.guest) R.send({ t: 'ground?', v: 1, q, x0: me.x - 80, y0: me.y - 80, x1: me.x + 80, y1: me.y + 80 }); });
      }
      function groundHeard(d) {   /* the Bank's answer comes in chunks of 10: put them down once all are in */
        const q = String(d.q || ''); const G = gGot[q] = gGot[q] || { items: [], n: 0 };
        G.items.push(...(d.items || [])); G.n++;
        if (G.n >= (d.of | 0)) { delete gGot[q]; coreCall(() => core.bankGround && core.bankGround(d.box, G.items)); }
      }
      setInterval(() => groundAsk(false), 10000); setTimeout(() => groundAsk(true), 9000);
      function bankRoom() {
        if (bank.room) return Promise.resolve(bank.room); if (bank.joining) return bank.joining;
        const kept = K.BANK_LOAD_ROOM; K.BANK_LOAD_ROOM = null;
        bank.joining = (kept ? Promise.resolve({ online: true, room: kept }) : net.join('bank', { game: 'ashvale' })).then(res => {
          bank.joining = null;
          if (!res || !res.online) { bank.note = 'The @ashvale Bank cannot be reached from here' + (res && res.why ? ' (' + res.why + ')' : '') + '.'; return null; }
          const R = res.room; bank.room = R;
          /* a room the arcade has dropped us from answers every send with "not in that room any more" (seen 2026-10-06 after
             a node restart): then every deposit, drop and question to the Bank failed in silence. A failed send leaves that
             room (the SDK would hand the same dead one back), joins again and sends it once more */
          const send0 = R.send.bind(R);
          R.send = o => send0(o).then(ok => {
            if (ok || bank.room !== R) return ok;
            bank.room = null; try { R.leave(); } catch (e) { /* gone */ }
            return bankRoom().then(R2 => R2 && R2 !== R ? R2.send(o) : false);
          });
          R.on('closed', () => { if (bank.room === R) bank.room = null; });
          R.on('message', ({ from, data }) => {
            const bankFrom = from && (from.address === DATA.assets.issuer || from.address === YOURFIRST_ADDR || from.tag === 'yourfirstname');
            if (data && data.t === 'boats' && bankFrom && R.me && data.to === R.me.address) { boatsHeard(data); return; }
            if (data && data.t === 'svok' && bankFrom && R.me && data.to === R.me.address && K.homeIs(data)) { K.CLOUD.base = +data.id; return; }   /* the Bank took our save: the next continues it */
            if (data && data.t === 'svx' && bankFrom && R.me && data.to === R.me.address && K.homeIs(data)) { console.info('ASHVALE: another device has played since this game loaded: stopping'); evicted(); return; }   /* canoes left at the bank near me */
            if (data && data.t === 'holds' && bankFrom && R.me && data.to === R.me.address && K.homeIs(data)) { holdsHeard(data); return; }   /* what the wallet's other characters carry */
            if (data && data.t === 'felled' && bankFrom && R.me && data.to === R.me.address) { core.setFelled(data.cells || []); return; }
            if (data && data.t === 'carried' && bankFrom && R.me && data.to === R.me.address) { carriedHeard(data); return; }   /* carried in someone's canoe while away */
            if (data && data.t === 'marks' && bankFrom && R.me && data.to === R.me.address) { if (core.setMarks) core.setMarks(data.k, data.cells || []); return; }   /* maples tapped today, birches peeled this year */   /* trees others felled */
            if (data && data.t === 'ground' && bankFrom && R.me && data.to === R.me.address) { groundHeard(data); return; }   /* persisted drops near me */
            if (data && data.t === 'pals' && bankFrom && R.me && data.to === R.me.address) { palsHeard(data); return; }   /* the friends list */
            if (!data || data.t !== 'dep' || !bankFrom || !R.me || data.to !== R.me.address) return;   /* only @ashvale or @yourfirstname answers, only to me */
            const q = bank.sent[data.id]; if (!q) return; delete bank.sent[data.id]; clearTimeout(q.timer);
            if (data.ok) {
              const L = ledgerFor(walletState.address || R.me.address);
              for (const k in (data.paid || {})) { const toChest = Math.min(data.paid[k], L.lchest[k] || 0); L.lchest[k] = (L.lchest[k] || 0) - toChest; L.pchest[k] = (L.pchest[k] || 0) + toChest; L.pend[k] = (L.pend[k] || 0) + data.paid[k] - toChest; }   /* promised: on its way until the wallet shows it (in the chest if you stored it already) */
              L.refused = L.refused || {}; for (const k of (data.refused || [])) L.refused[k] = Date.now() + 600000;
              L.absorb = L.absorb || {}; for (const k of (data.absorb || [])) L.absorb[k] = 1;
              if (L.rewards) for (const k in (data.paid || {})) if (L.rewards[k] && L.rewards[k].length && (data.paid[k] > 0)) L.rewards[k].shift();
              if (L.picks) for (const k in (data.paid || {})) { let n = data.paid[k]; L.picks = L.picks.filter(q => !(q.k === k && n-- > 0)); }
              ledgerSave(); bank.note = data.note || 'On its way to your wallet.';
              for (const t of [30000, 90000, 180000, 400000]) setTimeout(walletRefresh, t);
            } else { bank.note = data.note || 'The bank did not take that.'; const L = ledgerFor(walletState.address || R.me.address); L.refused = L.refused || {}; L.absorb = L.absorb || {}; for (const k of (data.absorb || [])) L.absorb[k] = 1; for (const k of (data.refused || [])) L.refused[k] = Date.now() + 600000; if (!(data.absorb || []).length && !(data.refused || []).length) for (const k of Object.keys(q.items)) L.refused[k] = Date.now() + 600000; ledgerSave(); }
            bank.busy = Object.keys(bank.sent).length > 0; hud.refresh('wallet');
          });
          return R;
        });
        return bank.joining;
      }
      async function chestDeposit() {
        if (bank.busy) return;
        const C = chestState(), L0 = ledgerFor(walletState.address), now0 = Date.now(); L0.refused = L0.refused || {};
        const ready = {}; for (const k in C.loose) { const r = C.loose[k] - pickHold(L0, k); if (r > 0) ready[k] = r; }   /* picked up in the last 90 s: wait */
        const keys = Object.keys(ready).filter(k => !(L0.refused[k] > now0)); if (!keys.length) { bank.busy = false; return; }
        C.loose = ready;
        const fromOf = k => { const P = (L0.picks || []).filter(q => q.k === k).slice(-C.loose[k]); return P.length ? P.map(q => [q.x, q.y]) : null; };   /* where you picked them up: a drop there is that exact piece */
        bank.busy = true; bank.note = 'Asking the @ashvale Bank…'; hud.refresh('wallet');
        const R = await bankRoom();
        if (!R || !R.me || R.me.guest || !R.me.address) { bank.busy = false; if (R) bank.note = 'Guests have no wallet: sign in to DogecoinArcade first.'; hud.refresh('wallet'); return; }
        /* each chunk carries, for its items, what this game already counts as on its way, so the Bank pays only the new
           part and re-confirms promises a game lost track of (never paying twice); a mesh message is 512 bytes */
        const pendOf = ks => { const o = {}; for (const k of ks) if (C.pend[k]) o[k] = C.pend[k]; return o; };
        const fromAll = ks => { const o = {}; for (const k of ks) { const f = walletState.data.gear[k] !== undefined || (core.item(k) && !core.item(k).stack) ? fromOf(k) : null;   /* every NFT kind (D.items was the module, not the table: the spot was never sent) */ if (f) o[k] = f; } return o; };
        const size = c => JSON.stringify([c, c, c, c, pendOf(Object.keys(c)), fromAll(Object.keys(c))]).length + 60;
        const chunks = [{}]; for (const k of keys) { const c = chunks[chunks.length - 1]; c[k] = C.loose[k]; if (size(c) > 420) { delete c[k]; chunks.push({ [k]: C.loose[k] }); } }
        chunks.forEach((items, i) => {
          const id = Date.now().toString(36) + '-' + i;
          bank.sent[id] = { items, timer: setTimeout(() => { if (!bank.sent[id]) return; delete bank.sent[id]; bank.busy = Object.keys(bank.sent).length > 0; bank.note = 'No answer from the @ashvale Bank yet. Try again in a minute.'; hud.refresh('wallet'); }, 90000) };
          const carried = {}, chest = {}, spent = {}; for (const k in items) { carried[k] = carriedOf(k); if (C.chest[k]) chest[k] = C.chest[k]; if (L0.spent[k]) spent[k] = L0.spent[k]; }   /* the Bank checks the sum against the chain */
          const reward = {}; for (const k in items) if (L0.rewards && L0.rewards[k] && L0.rewards[k].length) reward[k] = L0.rewards[k][0];
          R.send({ t: 'dep', v: 3, id, items, carried, chest, spent, reward, pend: pendOf(Object.keys(items)), from: fromAll(Object.keys(items)) });
        });
      }
    return { CKEY, holdsAsk, holdSend, bank, bankRoom, boatHide, boatShow, boatTell, chestDeposit, chestEvent, chestState, chestStore, chestTake, depositInv, depositWorn, withdrawAll, depositSoon, docksShow, fellTell, ledgerDrop, ledgerFor, ledgerSave, ledgerSnap, markTell, persistTell, tradeOfferable, tradeSettled, tradeUndone };
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('engbank', { api: 1, v: 1, needs: {} }, () => ({ api: 1, install }));
  if (typeof module !== 'undefined' && module.exports) module.exports = { install };
})(typeof globalThis !== 'undefined' ? globalThis : this);
