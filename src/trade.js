/* ASHVALE 3D trade module: a trade window in the game's own style, on top of the arcade's game-agnostic arcade.swap.
   2026-10-04: "you should not see the other parties inventory. You should be able to offer something to them as a
   trade and then they can offer something out of their inventory back and then if you like it, you can accept it."
   So it is a negotiation between two games over the realtime room, and the arcade only settles the agreed deal:
     1. A asks B to trade; B accepts the request. Both windows open.
     2. Each side picks ONE thing from its OWN wallet: an NFT, or a GOLD amount (arcade.swap moves one leg each way, at
        least one of them an NFT). The other side's offer shows read-only. Any change clears both accepts.
     3. Both press Accept: A calls arcade.swap.trade with exactly the two offers; B's game answers yes to that swap because
        it matches what B accepted (the arcade's own consent card may still show in each wallet).
   Items show as the game items they are (opts.itemOf(piece) -> {key, name, icon}), never as inscription ids.
     const T = ASH3D.get('trade').create({ host, toast(text, kind), nameOf(playerId), itemOf(piece), send(playerId, obj),
                                           offerable() -> {kinds:[{key,name,icon,pieces:[id]}], gold}, onSettled(gave, got) })
   Only what you CARRY can be offered (2026-10-04: "You should only be able to trade things that are in your inventory").
     T.available()   T.open(player)   T.onMessage(fromPlayer, obj)   T.close()
   A player is {id, address, tag, guest}. */
(function (G) {
  'use strict';
  const GOLD = 26;   /* ASHVALE GOLD token property id (a parameter: arcade.swap knows nothing about ASHVALE) */
  /* 2026-10-01: "only items that were inscribed and tokens created by @ashvale should be allowed in the game" */
  const ISSUER = 'nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c';
  const EXTRA = new Set(['ns3A7VS6DDaCoBvNFnayHeS9pysgi7Ukrf']);
  function ashvaleFlag(j) {
    if (!j || typeof j !== 'object') return false;
    if (j.game === 'ashvale' || j.ashvale === true) return true;
    for (const t of (j.attributes || [])) {
      if (!t) continue;
      const k = String(t.trait_type || '').toLowerCase();
      if ((k === 'flag' || k === 'game') && String(t.value).toLowerCase() === 'ashvale') return true;
    }
    return false;
  }
  const ours = p => {
    if (!p) return false;
    if (p.creator === ISSUER) return true;
    if (!EXTRA.has(p.creator) || !ashvaleFlag(p.json)) return false;
    const ct = String(p.contenttype || p.content_type || '');
    return !ct || ct === 'application/json';
  };
  const CSS = '.ash-trade{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(10,8,5,.5);font:13px/1.35 system-ui,sans-serif;color:#f3e6c4}'
    + '.ash-trade[hidden]{display:none}'
    + '.ash-trade .w{width:min(640px,96vw);max-height:92vh;overflow:auto;background:linear-gradient(#3b3226,#2a231a);border:2px solid #8a7550;border-radius:8px;padding:12px 14px;box-shadow:0 12px 40px #000c}'
    + '.ash-trade .hd{display:flex;align-items:center;gap:8px;margin-bottom:8px}.ash-trade h3{flex:1;margin:0;color:#ffcf3f;font-size:16px;text-shadow:0 1px 0 #000}'
    + '.ash-trade .x{width:28px;height:28px;border-radius:5px;border:1px solid #8a7550;background:#4a3d2c;color:#ffcf3f;font-weight:700;cursor:pointer}'
    + '.ash-trade .deal{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media (max-width:560px){.ash-trade .deal{grid-template-columns:1fr}}'
    + '.ash-trade .side{background:#221b13;border:1px solid #5a4a34;border-radius:6px;padding:8px}.ash-trade .side h5{margin:0 0 6px;font-size:12px;color:#e8c070;text-transform:uppercase;letter-spacing:.06em}'
    + '.ash-trade .offer{display:flex;align-items:center;gap:10px;min-height:64px;background:#2c251c;border-radius:5px;box-shadow:inset 0 0 0 1px #4b4032;padding:6px 8px}'
    + '.ash-trade .offer img{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 2px #0008)}.ash-trade .offer b{color:#ffcf3f}.ash-trade .offer .none{color:#a8987a}'
    + '.ash-trade .ok{margin-top:6px;font-size:12px;color:#a8987a}.ash-trade .ok.on{color:#7ad06a;font-weight:700}'
    + '.ash-trade .bag{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:4px;margin-top:8px;max-height:200px;overflow:auto;padding:2px}'
    + '.ash-trade .slot{position:relative;aspect-ratio:1;border-radius:4px;background:#2c251c;box-shadow:inset 0 0 0 1px #4b4032;cursor:pointer;display:grid;place-items:center}'
    + '.ash-trade .slot img{width:82%;height:82%;object-fit:contain;filter:drop-shadow(0 1px 1px #0009)}.ash-trade .slot.sel{box-shadow:inset 0 0 0 2px #ffcf3f;background:#4a3d2c}'
    + '.ash-trade .slot .n{position:absolute;left:3px;top:1px;font:700 11px system-ui;color:#ffcf3f;text-shadow:0 1px 1px #000}'
    + '.ash-trade .gold{display:flex;gap:6px;align-items:center;margin-top:8px}.ash-trade input{flex:1;min-width:0;font-size:16px;padding:6px 8px;border-radius:5px;border:1px solid #6b5a40;background:#120d08;color:#f3e6c4}'
    + '.ash-trade .row{display:flex;gap:8px;margin-top:10px}.ash-trade button.b{flex:1;padding:10px;font:inherit;font-weight:700;border-radius:6px;border:1px solid #8a7550;background:linear-gradient(#5a4c3a,#433829);color:#ffcf3f;cursor:pointer}'
    + '.ash-trade button.b.go{background:linear-gradient(#6a8a3a,#4a6a29);color:#fff}.ash-trade button.b:disabled{opacity:.45;cursor:default}'
    + '.ash-trade .note{font-size:12px;color:#c9b48c;margin-top:8px;min-height:16px;text-align:center}';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const same = (a, b) => !!a && !!b && (a.inscription ? a.inscription === b.inscription : (+a.token === +b.token && String(a.amount) === String(b.amount)));

  function create(opts) {
    opts = opts || {};
    const S = () => G.arcade && G.arcade.swap;
    const toast = opts.toast || (() => {});
    const nameOf = opts.nameOf || (id => id);
    const itemOf = opts.itemOf || (() => null);
    const send = opts.send || (() => false);
    const onSettled = opts.onSettled || (() => {});
    if (!document.getElementById('ash-trade-css')) { const st = document.createElement('style'); st.id = 'ash-trade-css'; st.textContent = CSS; document.head.appendChild(st); }
    const box = document.createElement('div'); box.className = 'ash-trade'; box.hidden = true; (opts.host || document.body).appendChild(box);
    /* T: the one trade in progress {with: player, sid, starter, mine: {offer, ok}, theirs: {offer, ok}, wallet, swap} */
    let T = null;

    function available() { return !!(S() && typeof S().trade === 'function'); }
    const label = o => !o ? '' : o.inscription ? (o.name || 'an item') : o.amount + ' ' + (+o.token === GOLD ? 'GOLD' : (o.name || ''));
    const offerHtml = o => {
      if (!o) return '<div class="offer"><span class="none">Nothing yet</span></div>';
      if (o.inscription) return '<div class="offer">' + (o.icon ? '<img src="' + esc(o.icon) + '" alt="">' : '') + '<b>' + esc(o.name || 'an item') + '</b></div>';
      return '<div class="offer">' + (o.icon ? '<img src="' + esc(o.icon) + '" alt="">' : '') + '<b>' + esc(o.amount) + ' ' + esc(+o.token === GOLD ? 'GOLD' : (o.name || 'of a stack')) + '</b></div>';
    };
    /* your own wallet, grouped by game item: one slot per kind with a count; picking one offers the lowest-numbered piece */
    async function myWallet() {
      if (opts.offerable) return opts.offerable();   /* the game: only what you carry, and in your wallet */
      const r = await S().items();
      const kinds = new Map();
      for (const p of (r.inscriptions || [])) {
        if (p.held === false || !ours(p)) continue;
        const g = itemOf(p); if (!g) continue;
        const k = g.key || g.name; let e = kinds.get(k);
        if (!e) { e = { key: k, name: g.name, icon: g.icon, pieces: [] }; kinds.set(k, e); }
        e.pieces.push(p);
      }
      for (const e of kinds.values()) e.pieces.sort((a, b) => (a.number || 0) - (b.number || 0));
      const b = (r.balances || []), gold = (Array.isArray(b) ? b : Object.values(b)).find(x => +x.propertyid === GOLD || +x.id === GOLD || +x.property === GOLD);
      return { kinds: Array.from(kinds.values()), gold: gold ? +(gold.balance || gold.amount || gold.units || 0) : 0 };
    }
    const goldIcon = () => (itemOf({ creator: ISSUER, json: { key: 'coins' } }) || {}).icon || '';

    function draw() {
      if (!T) return;
      const W = T.wallet, them = nameOf(T.with.id), mine = T.mine.offer, theirs = T.theirs.offer;
      const bothOk = T.mine.ok && T.theirs.ok, valid = (mine || theirs) && !(mine && theirs && !mine.inscription && !theirs.inscription);   /* two stacks need the arcade's token-for-token fix (coming) */
      let h = '<div class="w"><div class="hd"><h3>Trading with ' + esc(them) + '</h3><button class="x" data-x>&#x2715;</button></div><div class="deal">';
      h += '<div class="side"><h5>Your offer</h5>' + offerHtml(mine) + '<div class="ok' + (T.mine.ok ? ' on' : '') + '">' + (T.mine.ok ? 'You accepted' : 'You have not accepted') + '</div>';
      if (W) {
        h += '<div class="bag">' + W.kinds.map(e => '<div class="slot' + (mine && mine.key === e.key ? ' sel' : '') + '" data-k="' + esc(e.key) + '" title="' + esc(e.name) + '">' + (e.icon ? '<img src="' + esc(e.icon) + '" alt="">' : esc(e.name)) + ((e.token ? e.max : e.pieces.length) > 1 ? '<span class="n">' + (e.token ? e.max : e.pieces.length) + '</span>' : '') + '</div>').join('') + '</div>';
        const sk = mine && mine.token && +mine.token !== GOLD ? W.kinds.find(q => q.key === mine.key) : null;
        if (sk) h += '<div class="gold">How many ' + esc(sk.name) + '? <input inputmode="numeric" data-n value="' + esc(mine.amount) + '"> of ' + sk.max + '</div>';   /* a stack: you choose how many (2026-10-04) */
        if (!W.kinds.length) h += '<div class="note">Nothing in your bag to trade yet (only things you carry, once they are in your wallet).</div>';
        h += '<div class="gold"><input inputmode="numeric" placeholder="or offer GOLD (you carry ' + W.gold.toLocaleString() + ')" data-g value="' + esc(mine && !mine.inscription ? mine.amount : '') + '"></div>';
      } else h += '<div class="note">Reading your wallet…</div>';
      h += '</div><div class="side"><h5>' + esc(them) + ' offers</h5>' + offerHtml(theirs) + '<div class="ok' + (T.theirs.ok ? ' on' : '') + '">' + (T.theirs.ok ? esc(them) + ' accepted' : esc(them) + ' has not accepted') + '</div></div></div>';
      h += '<div class="row"><button class="b" data-x>Decline</button><button class="b go" data-ok' + (valid && !T.mine.ok && !T.swap ? '' : ' disabled') + '>' + (T.swap ? 'Settling…' : T.mine.ok ? 'Waiting for ' + esc(them) : 'Accept') + '</button></div>';
      h += '<div class="note">' + esc(T.note || (valid ? 'One item each way, or an item for GOLD. It settles as one transaction: both move or neither does.' : 'Offer one item or some GOLD. At least one side must be an item.')) + '</div></div>';
      box.innerHTML = h; box.hidden = false;
      for (const b of box.querySelectorAll('[data-x]')) b.onclick = () => cancel(true);
      const okB = box.querySelector('[data-ok]'); if (okB) okB.onclick = accept;
      const ni = box.querySelector('[data-n]'); if (ni) ni.onchange = () => { const e = W.kinds.find(q => q.key === mine.key); const v = Math.max(1, Math.min(+ni.value.replace(/\D/g, '') || 1, e.max)); setMine({ token: e.token, amount: String(v), key: e.key, name: e.name, icon: e.icon }); };
      for (const s of box.querySelectorAll('.slot[data-k]')) s.onclick = () => { const e = W.kinds.find(q => q.key === s.dataset.k); if (!e) return; if (e.token) { setMine(mine && mine.key === e.key ? null : { token: e.token, amount: String(e.max), key: e.key, name: e.name, icon: e.icon }); return; } setMine(mine && mine.key === e.key ? null : { inscription: e.pieces[0].id || e.pieces[0], key: e.key, name: e.name, icon: e.icon }); };
      const gi = box.querySelector('[data-g]'); if (gi) gi.onchange = () => { const v = Math.min(+gi.value.replace(/\D/g, '') || 0, W.gold); setMine(v > 0 ? { token: GOLD, amount: String(v), key: 'coins', icon: goldIcon() } : null); };
    }
    function setMine(o) {
      if (!T || T.swap) return;
      T.mine.offer = o; T.mine.ok = false; T.theirs.ok = false; T.note = '';   /* any change clears both accepts */
      send(T.with.id, { k: 'offer', sid: T.sid, offer: o ? (o.inscription ? { inscription: o.inscription, key: o.key, name: o.name } : { token: +o.token, amount: o.amount, key: o.key || null }) : null });
      draw();
    }
    function accept() {
      if (!T || T.mine.ok) return; T.mine.ok = true; send(T.with.id, { k: 'accept', sid: T.sid, mine: T.mine.offer && strip(T.mine.offer), theirs: T.theirs.offer && strip(T.theirs.offer) }); draw(); settleIfReady();
    }
    const strip = o => o.inscription ? { inscription: o.inscription } : { token: +o.token, amount: String(o.amount) };
    async function settleIfReady() {
      if (!T || !T.mine.ok || !T.theirs.ok || T.swap || !T.starter) return;   /* the one who asked sends the swap; the other answers it */
      T.swap = 'sending'; T.note = 'Settling: check your arcade wallet if it asks you to confirm.'; draw();
      try { const give = T.mine.offer ? strip(T.mine.offer) : null, get = T.theirs.offer ? strip(T.theirs.offer) : null;
        const r = await S().trade({ with: T.with.id, give, get }); T.swapId = r && r.id; }
      catch (e) { T.swap = null; T.mine.ok = false; T.note = 'Not settled: ' + (e && e.message || e); send(T.with.id, { k: 'unaccept', sid: T.sid }); draw(); }
    }
    function cancel(tell) { if (T && tell) send(T.with.id, { k: 'cancel', sid: T.sid }); T = null; box.hidden = true; box.innerHTML = ''; }
    async function begin(player, sid, starter) {
      T = { with: player, sid, starter, mine: { offer: null, ok: false }, theirs: { offer: null, ok: false }, wallet: null, note: '' };
      draw();
      try { const W = await myWallet(); if (T && T.sid === sid) { T.wallet = W; draw(); } }
      catch (e) { if (T && T.sid === sid) { T.note = 'Could not read your wallet: ' + (e && e.message || e); draw(); } }
    }

    async function open(player) {
      if (!available()) { toast('Trading needs the arcade wallet: open ASHVALE from the arcade while signed in.', 'warn'); return; }
      if (!player || player.guest) { toast('Guests can\'t trade: they have no wallet.', 'warn'); return; }
      if (T) cancel(true);
      const sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (!send(player.id, { k: 'ask', sid })) { toast('Could not reach ' + nameOf(player.id) + '.', 'warn'); return; }
      T = { asking: true, with: player, sid, starter: true };
      box.hidden = false;   /* the window opens at once, so you know you are waiting (2026-10-04) */
      box.innerHTML = '<div class="w"><div class="hd"><h3>Trading with ' + esc(nameOf(player.id)) + '</h3><button class="x" data-x>&#x2715;</button></div><div class="note" style="font-size:14px;margin:18px 0">Waiting for ' + esc(nameOf(player.id)) + ' to accept the trade request…</div><div class="row"><button class="b" data-x>Cancel</button></div></div>';
      for (const b of box.querySelectorAll('[data-x]')) b.onclick = () => cancel(true);
      setTimeout(() => { if (T && T.asking && T.sid === sid) { cancel(true); toast(nameOf(player.id) + ' did not answer the trade request.', 'warn'); } }, 30000);
    }
    /* messages from the other player's game */
    function onMessage(from, m) {
      if (!m || !m.k || !from) return;
      if (m.k === 'ask') {
        if (T) { send(from.id, { k: 'busy', sid: m.sid }); return; }
        if (!available()) { send(from.id, { k: 'cannot', sid: m.sid }); return; }
        box.hidden = false;
        box.innerHTML = '<div class="w"><div class="hd"><h3>' + esc(nameOf(from.id)) + ' wants to trade</h3></div><div class="row"><button class="b" data-n>Decline</button><button class="b go" data-y>Trade</button></div></div>';
        box.querySelector('[data-n]').onclick = () => { send(from.id, { k: 'cancel', sid: m.sid }); box.hidden = true; box.innerHTML = ''; };
        box.querySelector('[data-y]').onclick = () => { send(from.id, { k: 'yes', sid: m.sid }); begin(from, m.sid, false); };
        return;
      }
      if (!T || m.sid !== T.sid || from.id !== T.with.id) return;
      if (m.k === 'yes' && T.asking) { T.asking = false; begin(T.with, T.sid, true); return; }
      if (m.k === 'busy' || m.k === 'cannot') { toast(nameOf(from.id) + (m.k === 'busy' ? ' is already trading.' : ' cannot trade right now.'), 'warn'); cancel(false); return; }
      if (m.k === 'cancel') { toast(nameOf(from.id) + ' declined the trade.', 'warn'); cancel(false); return; }
      if (m.k === 'offer') {
        const o = m.offer; let shown = null;
        if (o && o.inscription) { const g = itemOf({ creator: ISSUER, json: { key: o.key } }) || {}; shown = { inscription: String(o.inscription), key: o.key, name: g.name || o.name || 'an item', icon: g.icon || '' }; }
        else if (o && o.token != null && +o.amount > 0) { const g = +o.token === GOLD ? { name: 'GOLD', icon: goldIcon() } : (itemOf({ creator: ISSUER, json: { key: o.key } }) || {}); shown = { token: +o.token, amount: String(+o.amount), key: +o.token === GOLD ? 'coins' : o.key, name: g.name || 'a stack', icon: g.icon || '' }; }
        T.theirs.offer = shown; T.theirs.ok = false; T.mine.ok = false; T.note = ''; draw(); return;
      }
      if (m.k === 'accept') {   /* their accept counts only for exactly the deal on both screens */
        const agrees = (!m.mine ? !T.theirs.offer : same(m.mine, T.theirs.offer && strip(T.theirs.offer))) && (!m.theirs ? !T.mine.offer : same(m.theirs, T.mine.offer && strip(T.mine.offer)));
        if (agrees) { T.theirs.ok = true; draw(); settleIfReady(); }
        return;
      }
      if (m.k === 'unaccept') { T.theirs.ok = false; T.swap = null; draw(); }
    }

    /* the arcade's swap: the answering side says yes when it is exactly the deal both accepted */
    const SAY = { accepted: 'accepted', signed: 'signed', broadcast: 'sent to the chain, waiting for a block…', declined: 'declined', cancelled: 'cancelled', failed: 'failed' };
    function hook() {
      if (!available() || hook.done) return; hook.done = true;
      S().onTrade(t => {
        if (t.status === 'incoming') {
          const ok = T && !T.starter && T.mine.ok && T.theirs.ok && t.with && t.with.id === T.with.id &&
            (!t.give ? !T.mine.offer : same(t.give, T.mine.offer && strip(T.mine.offer))) && (!t.get ? !T.theirs.offer : same(t.get, T.theirs.offer && strip(T.theirs.offer)));
          if (ok) { T.swap = t.id; T.note = 'Settling: check your arcade wallet if it asks you to confirm.'; draw(); S().answer(t.id, true).catch(e => { if (T) { T.swap = null; T.mine.ok = false; T.note = 'Not settled: ' + (e && e.message || e); draw(); } }); }
          else S().answer(t.id, false, 'not the deal in the trade window').catch(() => {});
          return;
        }
        if (t.status === 'settled') { const got = T && T.theirs.offer; if (T) onSettled(T.mine.offer, T.theirs.offer); toast('Trade with ' + nameOf(t.with && t.with.id) + ' complete' + (got ? ': you got ' + label(got) + '.' : '.'), 'trade'); if (T) cancel(false); return; }
        const say = SAY[t.status]; if (say) { toast('Trade ' + say + (t.why ? ' (' + t.why + ')' : ''), t.status === 'failed' || t.status === 'declined' ? 'warn' : 'trade'); if (T && (t.status === 'failed' || t.status === 'declined' || t.status === 'cancelled')) { T.swap = null; T.mine.ok = false; T.theirs.ok = false; draw(); } }
      });
    }
    hook();
    return { available, open, close: () => cancel(true), onMessage, hook, GOLD };
  }
  const api = { api: 1, create, ISSUER };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('trade', { api: 1, v: 2 }, () => api);
  else G.ASHTrade = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
