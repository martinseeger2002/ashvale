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
    function openChest() { if (st.shopId) K.closeShop(); st.chest = true; st.chestHtml = null; st.chestSel = null; win.style.display = 'flex'; api.walletRefresh && api.walletRefresh(); drawChest(); }
    function closeChest() { st.chest = false; win.style.display = 'none'; }
    function counts() {   /* the engine keeps the ledger (bag vs chest vs spent) per wallet address: api.chestState() */
      const p = P(), W = api.walletState ? api.walletState() : { status: 'off' }, C = api.chestState ? api.chestState() : { chest: {}, loose: {}, bank: {} };
      return { p, W, D: W.data, B: C.bank || {}, chest: C.chest || {}, loose: C.loose || {}, arriving: C.arriving || 0, bag: C.bag || {}, pend: C.pend || {} };
    }
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
      h += '</div></div><div class="col"><h5>Your bag (tap to store)</h5><div class="grid iv">';
      const lo = Object.assign({}, loose);
      p.inv.forEach((it, i) => {
        let mark = '';
        if (it && lo[it.id] > 0) { lo[it.id] -= Math.min(lo[it.id], it.n); mark = ' ghost'; }
        h += '<div class="slot ' + (sel && sel.slot === i ? 'sel' : '') + mark + '" data-s="' + i + '"' + (mark ? ' title="Not in your wallet yet"' : '') + '>' + K.slotHtml(it) + '</div>';
      });
      h += '</div></div></div><div class="sel">';
      const nLoose = Object.values(loose).reduce((a, b) => a + b, 0), nArr = arriving;
      if (sel && sel.take && chest[sel.take]) {
        const d = core.item(sel.take), n = chest[sel.take];
        h += '<span><span class="o">' + esc(d.name) + '</span> · ' + n.toLocaleString() + ' in your chest</span>';
        for (const m of sel.take === 'coins' ? [10, 100, 1000, 'All'] : d.stack ? [1, 10, 'All'] : [1, 5, 'All']) h += '<button class="btn" data-take="' + m + '">Take ' + m + '</button>';
      } else if (sel && sel.slot != null && p.inv[sel.slot]) {
        const it = p.inv[sel.slot], d = core.item(it.id), backed = true;   /* anything in your bag can go in the chest, settled or not (2026-10-05) */
        if (backed) { h += '<span><span class="o">' + esc(d.name) + '</span> · put it back in your chest</span>'; for (const m of [1, 'All']) h += '<button class="btn" data-store="' + m + '">Store ' + m + '</button>'; }
        else if (pend[it.id]) h += '<span><span class="o">' + esc(d.name) + '</span> is on its way to your wallet. You can store it once it arrives.</span>';
        else h += '<span><span class="o">' + esc(d.name) + '</span> is not in your wallet yet. Put it there first (below).</span>';
      } else h += '<span style="color:#c8b48a">Your chest and your bag are one arcade wallet: anything in either can be traded. Take what you need for the road.</span>';
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
      for (const s of win.querySelectorAll('[data-t]')) s.onclick = () => { st.chestSel = { take: s.dataset.t }; drawChest(); };
      for (const s of win.querySelectorAll('[data-s]')) s.onclick = () => { if (P().inv[+s.dataset.s]) { st.chestSel = { slot: +s.dataset.s }; drawChest(); } };
      for (const b of win.querySelectorAll('[data-take]')) b.onclick = () => { const k = st.chestSel.take, n = b.dataset.take === 'All' ? chest[k] : Math.min(+b.dataset.take, chest[k]); api.chestTake && api.chestTake(k, n); drawChest(); };
      for (const b of win.querySelectorAll('[data-store]')) b.onclick = () => { const it = P().inv[st.chestSel.slot]; if (!it) return; api.chestStore && api.chestStore(it.id, b.dataset.store === 'All' ? 1e9 : 1); st.chestSel = null; drawChest(); };
    }
    K.openChest = openChest; K.closeChest = closeChest; K.drawChest = drawChest;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudchest', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
