/* ASHVALE 3D HUD shop window, split out of hud.js (2026-10-02: "modularize the HUD"): buy from a shop keeper,
   sell from your pack. install(K) gets the HUD kit from hud.js and adds K.openShop, K.closeShop, K.drawShop. */
(function (G) {
  'use strict';
  function install(K) {
    const { api, core, P, A } = K, esc = A.esc, shop = K.shopEl, st = K.st;
    let lastH = '';   /* the window is rebuilt only when what it shows changes: rebuilding it every refresh ate taps on the Buy buttons (2026-10-05) */
    function openShop(id) { st.chest = false; st.shopId = id; st.shopSel = null; shop.style.display = 'flex'; lastH = ''; drawShop(); }
    function closeShop() { st.shopId = null; shop.style.display = 'none'; }
    function drawShop() {
      const shopId = st.shopId, shopSel = st.shopSel; if (!shopId) return;
      const p = P(), sh = core.shop(shopId), gold = core.invCount(p, 'coins');
      let h = '<div class="hd"><span>' + esc(sh.name) + '</span><span class="gold">' + gold.toLocaleString() + ' GOLD' + (core.speechPct && core.speechPct(p) ? ' <small style="color:#c8b48a">Speechcraft: buy -' + core.speechPct(p).toFixed(1) + '%, sell +' + core.speechPct(p).toFixed(1) + '%</small>' : '') + '</span><div class="x">&#x2715;</div></div><div class="cols"><div class="col"><h5>For sale</h5><div class="grid st">';
      sh.stock.forEach(id => { const pr = core.priceBuy(shopId, id, p); h += '<div class="slot ' + (shopSel && shopSel.buy === id ? 'sel' : '') + (pr > gold ? ' ghost' : '') + '" data-b="' + id + '">' + K.slotHtml({ id, n: 1 }) + '<span class="p">' + pr + '</span></div>'; });
      h += '</div></div><div class="col"><h5>Your pack (tap to sell)</h5><div class="grid iv">';
      p.inv.forEach((it, i) => { const v = it ? core.priceSell(shopId, it.id, p) : -1; h += '<div class="slot ' + (shopSel && shopSel.slot === i ? 'sel' : '') + (it && v < 0 ? ' ghost' : '') + '" data-s="' + i + '">' + K.slotHtml(it) + (it ? '<span class="p">' + (v < 0 ? '-' : v) + '</span>' : '') + '</div>'; });
      h += '</div></div></div><div class="sel">';
      if (shopSel && shopSel.buy) {
        const d = core.item(shopSel.buy), pr = core.priceBuy(shopId, shopSel.buy, p), f = core.reqFail(p, d);
        h += '<span><span class="o">' + esc(d.name) + '</span> · ' + pr + ' GOLD' + (f ? ' · <span class="r">' + esc(f.replace('You need ', 'Needs ').replace(' to wield that.', '').replace(' to wear that.', '')) + '</span>' : '') + '<br><small style="color:#c8b48a">' + esc(K.examine(shopSel.buy, 1).replace(/^[^:]*: /, '')) + '</small></span>';
        for (const n of d.stack ? [1, 10, 50] : [1, 5]) h += '<button class="btn" data-buy="' + n + '">Buy ' + n + '</button>';
      } else if (shopSel && shopSel.slot != null && p.inv[shopSel.slot]) {
        const it = p.inv[shopSel.slot], d = core.item(it.id), v = core.priceSell(shopId, it.id, p);
        if (v < 0) h += '<span>' + esc(sh.name) + ' does not buy ' + esc(d.name) + '.</span>';
        else { h += '<span><span class="o">' + esc(d.name) + '</span> · sells for ' + v + ' GOLD each</span>'; for (const n of [1, 5, 'All']) h += '<button class="btn" data-sell="' + n + '">Sell ' + n + '</button>'; }
      } else h += '<span style="color:#c8b48a">Tap an item to buy it, or something in your pack to sell it.</span>';
      if (h === lastH) return; lastH = h;
      shop.innerHTML = h + '</div>';
      shop.querySelector('.x').onclick = () => { api.cmd({ c: 'close' }); closeShop(); };
      for (const s of shop.querySelectorAll('[data-b]')) s.onclick = () => { st.shopSel = { buy: s.dataset.b }; drawShop(); };
      for (const s of shop.querySelectorAll('[data-s]')) s.onclick = () => { if (P().inv[+s.dataset.s]) { st.shopSel = { slot: +s.dataset.s }; drawShop(); } };
      for (const b of shop.querySelectorAll('[data-buy]')) b.onclick = () => { api.cmd({ c: 'buy', shop: st.shopId, item: st.shopSel.buy, n: +b.dataset.buy }); api.sfx && api.sfx('coins'); };
      for (const b of shop.querySelectorAll('[data-sell]')) b.onclick = () => { const it = P().inv[st.shopSel.slot]; if (!it) return; api.cmd({ c: 'sell', shop: st.shopId, slot: st.shopSel.slot, n: b.dataset.sell === 'All' ? 1e9 : +b.dataset.sell }); api.sfx && api.sfx('coins'); };
    }
    K.openShop = openShop; K.closeShop = closeShop; K.drawShop = drawShop;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudshop', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
