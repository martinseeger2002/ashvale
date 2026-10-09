/* ASHVALE 3D HUD: the town chest (2026-10-04: "We need a chest in town"; "The bank will be your own NFTs and
   tokens, but just not the ones that you have in your inventory, which are also your own NFTs and tokens, they share
   the same wallet. We just have to keep the game state."). Everything you own is in your arcade wallet. The chest is
   the part of it you are not carrying: wallet holdings minus your bag and worn gear. Take and Store only change what
   you carry. Things you carry that the wallet does not hold yet (loot from before, or just picked up) go to the
   @ashvale Bank by themselves (no button), which hands out a recycled copy or mints one, to your own address.
   install(K) adds K.openChest, K.closeChest, K.drawChest; it shares the shop window (K.shopEl). */
(function (G) {
  'use strict';
  function install(K) {
    const { api, core, P, A } = K, esc = A.esc, win = K.shopEl, st = K.st;
    function openChest() { if (st.shopId) K.closeShop(); st.chest = true; st.chestHtml = null; st.chestSel = null; win.classList.add('chest'); win.style.display = 'flex'; api.walletRefresh && api.walletRefresh(); drawChest(); }
    function closeChest() { st.chest = false; win.classList.remove('chest'); win.style.display = 'none'; npClose(); if (K.onChestClose) K.onChestClose(); }
    function counts() {   /* the engine keeps the ledger (bag vs chest vs spent) per wallet address: api.chestState() */
      const p = P(), W = api.walletState ? api.walletState() : { status: 'off' }, C = api.chestState ? api.chestState() : { chest: {}, loose: {}, bank: {} };
      return { p, W, D: W.data, B: C.bank || {}, chest: C.chest || {}, loose: C.loose || {}, arriving: C.arriving || 0, bag: C.bag || {}, pend: C.pend || {} };
    }
    /* 2026-10-06: a tap moves a thing between the chest and the bag straight away - a token (a stack: logs, fish,
       GOLD) asks how many on the number pad, an NFT moves one; long-press or right-click: Move 1, Move N (the number
       pad), Examine. */
    const GEAR = ['weapon', 'armour', 'tool', 'pack', 'cosmetic', 'jewellery'];   /* NFTs, as tools/make_assets.py decides; everything else is a token */
    const isToken = k => { const d = core.item(k); return !!d && GEAR.indexOf(d.category) < 0; };
    const fits = k => { const d = core.item(k), p = P(), free = p.inv.filter(s => !s).length; return d.stack ? (p.inv.some(s => s && s.id === k) || free ? Infinity : 0) : free; };   /* how many more the bag takes */
    const nm = k => '<span class="o">' + esc(core.item(k).name) + '</span>';
    const inChest = k => (counts().chest[k] || 0);
    const inBag = k => P().inv.reduce((a, s) => a + (s && s.id === k ? s.n : 0), 0);
    const take = (k, n) => { if (n > 0) { api.chestTake && api.chestTake(k, n); drawChest(); } };
    const store = (k, n) => { if (n > 0) { api.chestStore && api.chestStore(k, n); drawChest(); } };
    function tapTake(k) { const n = inChest(k); if (!n) return; if (isToken(k)) numpad('Take ' + core.item(k).name, n, m => take(k, m), fits(k)); else take(k, 1); }
    function tapStore(i) { const it = P().inv[i]; if (!it) return; if (isToken(it.id)) numpad('Store ' + core.item(it.id).name, inBag(it.id), m => store(it.id, m)); else store(it.id, 1); }
    function menuTake(k, x, y) {
      const n = inChest(k); if (!n) return;
      const o = [{ html: 'Take 1 ' + nm(k), fn: () => take(k, 1) }];
      if (n > 1) o.push({ html: 'Take N ' + nm(k), fn: () => numpad('Take ' + core.item(k).name, n, m => take(k, m), fits(k)) });
      o.push({ html: 'Examine ' + nm(k), fn: () => K.chatLine(K.examine(k, n), 'sys') });
      K.menu(x, y, o);
    }
    function menuStore(i, x, y) {
      const it = P().inv[i]; if (!it) return; const k = it.id, n = inBag(k);
      const o = [{ html: 'Store 1 ' + nm(k), fn: () => store(k, 1) }];
      if (n > 1) o.push({ html: 'Store N ' + nm(k), fn: () => numpad('Store ' + core.item(k).name, n, m => store(k, m)) });
      o.push({ html: 'Examine ' + nm(k), fn: () => K.chatLine(K.examine(k, it.n), 'sys') });
      K.menu(x, y, o);
    }
    /* the number pad: the game's own keys on screen (no phone keyboard), a screen with the amount, Max, OK */
    const pad = K.el('numpad ui', K.ui);
    pad.innerHTML = '<div class="np stone"><div class="t"></div><div class="scr"><span class="v">0</span><small></small></div><div class="keys">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'max', '0', 'del'].map(k => '<button class="btn" data-k="' + k + '">' + (k === 'del' ? '&#x232B;' : k === 'max' ? 'Max' : k) + '</button>').join('') +
      '</div><div class="row"><button class="btn" data-k="cancel">Cancel</button><button class="btn ok" data-k="ok">OK</button></div></div>';
    const NP = { v: '', max: 0, fn: null };
    function npShow() { const n = Math.min(+NP.v || 0, NP.max); pad.querySelector('.v').textContent = (NP.v ? n : 0).toLocaleString(); pad.querySelector('.ok').disabled = !n; }
    function npKey(k) {
      if (k === 'cancel') return npClose();
      if (k === 'ok') { const n = Math.min(+NP.v || 0, NP.max), fn = NP.fn; npClose(); if (n > 0 && fn) fn(n); return; }
      if (k === 'del') NP.v = NP.v.slice(0, -1); else if (k === 'max') NP.v = String(NP.max); else if (/^[0-9]$/.test(k)) { NP.v = String(Math.min(+(NP.v + k), NP.max)); if (NP.v === '0') NP.v = ''; }
      npShow();
    }
    function numpad(title, have, fn, room) {   /* room: how many the bag can take (Max stops there) */
      K.hideMenu && K.hideMenu();
      const max = Math.min(have, room == null ? Infinity : room);
      if (max <= 0) { K.chatLine && K.chatLine('Your bag is full.', 'warn'); return; }
      NP.v = ''; NP.max = max; NP.fn = fn; pad.querySelector('.t').textContent = title;
      pad.querySelector('small').textContent = 'of ' + have.toLocaleString() + (max < have ? ' \u00b7 ' + max + ' fit in your bag' : ''); pad.style.display = 'flex'; npShow();
    }
    function npClose() { pad.style.display = 'none'; NP.fn = null; }
    for (const b of pad.querySelectorAll('[data-k]')) b.onclick = e => { e.stopPropagation(); npKey(b.dataset.k); };
    pad.addEventListener('pointerdown', e => { if (e.target === pad) npClose(); });
    G.addEventListener('keydown', e => {   /* on a computer the number keys work too */
      if (pad.style.display !== 'flex') return;
      const k = e.key === 'Enter' ? 'ok' : e.key === 'Escape' ? 'cancel' : e.key === 'Backspace' ? 'del' : /^[0-9]$/.test(e.key) ? e.key : null;
      if (k) { e.preventDefault(); e.stopPropagation(); npKey(k); }
    }, true);
    function drawChest() {
      if (!st.chest) return;
      const { p, W, D, B, chest, loose, arriving, bag, pend } = counts(), sel = st.chestSel;
      let h = '<div class="hd"><span>Ashvale chest</span><span class="gold">' + ((chest.coins || 0).toLocaleString()) + ' GOLD in the chest</span><div class="x">&#x2715;</div></div>';
      if (W.status === 'off' || W.status === 'signed-out') {
        win.innerHTML = h + '<div class="sel"><span>The chest is your arcade wallet. Sign in to DogecoinArcade and play from the Games tab to open it.</span></div>';
        win.querySelector('.x').onclick = closeChest; return;
      }
      h += '<div class="cols"><div class="col"><h5>In your chest (tap to take)</h5><div class="grid">';
      const ck = Object.keys(chest);   /* GOLD too: it can be taken out like anything else (the operator: "no way to withdraw it") */
      for (const k of ck) h += '<div class="slot ' + (sel && sel.take === k ? 'sel' : '') + '" data-t="' + esc(k) + '">' + K.slotHtml({ id: k, n: chest[k] }) + '</div>';
      if (!ck.length) h += '<div class="info" style="grid-column:1/-1">' + (D ? 'Nothing else in your wallet.' : 'Reading your wallet…') + '</div>';
      h += '</div></div></div><div class="sel">';
      h += '<button class="btn" data-dep="inv">Deposit inventory</button><button class="btn" data-dep="worn">Deposit worn equipment</button>';
      const nLoose = Object.values(loose).reduce((a, b) => a + b, 0), nArr = arriving;
      h += '<span style="color:#c8b48a">Your bag is the inventory beside this. Click an item to put one in the chest. Right-click for All, or to wear it.</span>';
      h += '</div><div class="sel">';
      /* no deposit button (2026-10-04: "I don't want anything extra, they could cause duplications"): new things go to
         your wallet by themselves; this line only says how far along that is */
      if (nLoose) h += '<span>' + nLoose.toLocaleString() + ' new thing' + (nLoose === 1 ? '' : 's') + ' going to your wallet' + (B.busy ? '…' : ' shortly') + '.</span>';
      else if (nArr) h += '<span>' + nArr.toLocaleString() + ' on the way to your wallet (they show here once the block lands).</span>';
      else h += '<span style="color:#c8b48a">Everything you carry is in your wallet.</span>';
      if (B.note) h += '<small style="color:#c8b48a;display:block">' + esc(B.note) + '</small>';
      h += '</div>'; if (h === st.chestHtml && win.style.display === 'flex') return;   /* the HUD refreshes every tick: repaint only on change */
      st.chestHtml = h; win.innerHTML = h;
      win.querySelector('.x').onclick = closeChest;
      const depI = win.querySelector('[data-dep=inv]'), depW = win.querySelector('[data-dep=worn]');
      if (depI) depI.onclick = () => api.depositInv && api.depositInv();
      if (depW) depW.onclick = () => api.depositWorn && api.depositWorn();
      for (const s of win.querySelectorAll('[data-t]')) { const k = s.dataset.t; K.longPress(s, () => tapTake(k), (x, y) => menuTake(k, x, y)); }
    }
    K.openChest = openChest; K.closeChest = closeChest; K.drawChest = drawChest;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudchest', { api: 1, v: 2 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
