/* ASHVALE 3D HUD inventory pointer handling, split out of hud.js (2026-10-02: "modularize the HUD").
   Drag and drop (the operator): drag to another slot = move/swap; drop over the world = drop it at your feet; drop on the
   Equipment tab (or an equipment slot) = wear it. Mouse: drag after 6 px. Touch: hold ~150 ms, then move. A quick tap =
   use; holding still = the options menu. The slot captures the pointer, so the camera never pans.
   install(K) adds K.invPointer(node, slotIndex). */
(function (G) {
  'use strict';
  function install(K) {
    const { api, core, P, host, ui, panel } = K;
    let ghost = null;
    function startGhost(i, x, y) {
      const it = P().inv[i]; if (!it) return;
      ghost = K.el('dragicon', host, K.slotHtml(it)); ghost.style.left = x + 'px'; ghost.style.top = y + 'px';   /* class not 'ghost': that one dims shop slots, and absolute positioning pulled them out of the grid */
      const src = panel.querySelector('.inv .slot[data-i="' + i + '"]'); if (src) src.classList.add('dragsrc');
    }
    function moveGhost(x, y) { if (!ghost) return; const r = host.getBoundingClientRect(); ghost.style.left = (x - r.left) + 'px'; ghost.style.top = (y - r.top) + 'px'; }
    function endGhost() { if (ghost) { ghost.remove(); ghost = null; } for (const n of panel.querySelectorAll('.dragsrc')) n.classList.remove('dragsrc'); }
    function dropAt(i, x, y) {
      endGhost();
      const t = document.elementFromPoint(x, y);
      const slot = t && t.closest && t.closest('.inv .slot'), eqs = t && t.closest && t.closest('.equip .slot, .tab[data-k="equip"]');
      if (slot && panel.contains(slot)) { const j = +slot.dataset.i; if (j !== i) { api.cmd({ c: 'move', from: i, to: j }); api.sfx && api.sfx('click'); } return 'move'; }
      if (eqs) { const d = core.item(P().inv[i].id); if (d.eq) api.cmd({ c: 'equip', slot: i }); return 'equip'; }
      if (t && ui.contains(t) && !t.classList.contains('lay')) return 'none';   /* dropped on some other piece of interface: nothing */
      api.cmd({ c: 'drop', slot: i }); return 'drop';
    }
    function invPointer(node, i) {
      let st = null;
      node.addEventListener('pointerdown', e => {
        if (e.button === 2) return;
        e.stopPropagation();
        st = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), drag: false, menu: false, type: e.pointerType };
        try { node.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
        st.lp = setTimeout(() => { if (st && !st.drag) { st.menu = true; K.menu(st.x, st.y, K.itemOptions(i)); } }, 480);
      });
      node.addEventListener('pointermove', e => {
        if (!st || e.pointerId !== st.id) return;
        e.stopPropagation();
        const d = Math.hypot(e.clientX - st.x, e.clientY - st.y), held = performance.now() - st.t;
        if (!st.drag && !st.cancel) {
          if (d > (st.type === 'mouse' ? 6 : 8)) {
            /* The hand was already moving; the frame just took longer than the long press. Drop the menu and drag,
               otherwise a slow device (or a 3 fps test renderer) can never start a drag at all. */
            if (st.menu) { K.hideMenu(); st.menu = false; }
            if (st.type === 'mouse' || held >= 150) { st.drag = true; clearTimeout(st.lp); const r = host.getBoundingClientRect(); startGhost(i, e.clientX - r.left, e.clientY - r.top); }
            else { st.cancel = true; clearTimeout(st.lp); }   /* a quick flick on a phone: not a drag, not a tap */
          }
        }
        if (st.drag) moveGhost(e.clientX, e.clientY);
      });
      node.addEventListener('pointerup', e => {
        if (!st) return; e.stopPropagation(); clearTimeout(st.lp); const s0 = st; st = null;
        if (s0.drag) dropAt(i, e.clientX, e.clientY);
        else if (!s0.menu && !s0.cancel) {
          if (K.st.chest && api.chestStore) { const it = P().inv[i]; if (it) api.chestStore(it.id, 1); }
          else api.cmd({ c: 'use', slot: i });
        }
      });
      node.addEventListener('pointercancel', () => { if (st) { clearTimeout(st.lp); if (st.drag) endGhost(); st = null; } });
      node.addEventListener('contextmenu', e => { e.preventDefault(); if (st) { clearTimeout(st.lp); st = null; } K.menu(e.clientX, e.clientY, K.itemOptions(i)); });
    }
    K.invPointer = invPointer;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('huddrag', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
