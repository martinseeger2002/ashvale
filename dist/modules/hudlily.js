/* ASHVALE 3D HUD: the Lily Run (2026-10-19). While your frog is on the board the Ashvale HUD steps aside (the chat
   stays) and an arcade bar takes over: the score, your best, the level, a frog for each life, the time left for this frog,
   four hop buttons (a cross, thumb-sized) and Quit. Big words flash in the middle (HOME!, SPLASH!, LEVEL 2). At the end a
   panel shows the score and offers another run. Buttons act on pointerdown, so a hop never waits for the click.
   install(K) adds K.lilyOpen(view, cb), K.lilyUpdate(view), K.lilyFlash(text, kind), K.lilyOver(o), K.lilyClose(). */
(function (G) {
  'use strict';
  const CSS = `
.ash .lay.lily > .ui:not(.lilyp):not(.chatw):not(.help){display:none !important}
.ash .lay.lily .hover{display:none !important}
.ash .lay.lily .chatw{top:var(--lilytop,96px);bottom:auto;left:50%;right:auto;transform:translateX(-50%);width:min(96vw,560px);pointer-events:none}   /* the operator: the chat covered the frog - up under the score bar while playing */
.ash .lay.lily .chatw .chat:not(.big){max-height:calc(2*1.3em + 8px);opacity:.92}
.ash .lay.lily .chatw .chatx,.ash .lay.lily .chatw .say,.ash .lay.lily .chatw input,.ash .lay.lily .chatw button{display:none !important}
.ash .lilyp{position:absolute;color:#f4f0dc;font-family:ui-monospace,Menlo,Consolas,monospace;pointer-events:auto;box-sizing:border-box}
.ash .lilyp.top{left:50%;transform:translateX(-50%);top:calc(6px + env(safe-area-inset-top,0px));width:min(96vw,560px);background:linear-gradient(#173226ee,#0f2219ee);border:2px solid #0a140f;border-radius:10px;box-shadow:0 4px 14px #0008;padding:6px 10px 8px}
.ash .lilyp .row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.ash .lilyp .k{font-size:10px;letter-spacing:1px;color:#8fc49a}
.ash .lilyp .v{font-size:18px;font-weight:bold;color:#fff6c8;font-variant-numeric:tabular-nums}
.ash .lilyp .ttl{font:bold 13px Georgia,serif;color:#b9e3a6;letter-spacing:1px}
.ash .lilyp .lives{display:flex;gap:4px;align-items:center;min-height:16px}
.ash .lilyp .life{width:14px;height:11px;border-radius:7px 7px 4px 4px;background:#5fbf4a;box-shadow:inset 0 -3px 0 #3b8a2c}
.ash .lilyp .time{height:7px;border-radius:4px;background:#0a140f;margin-top:6px;overflow:hidden}
.ash .lilyp .time i{display:block;height:100%;background:linear-gradient(90deg,#d64b3a,#e8c13a 35%,#5fbf4a 60%);transition:width .2s linear}
.ash .lilyp.pad{bottom:calc(10px + env(safe-area-inset-bottom,0px));right:calc(10px + env(safe-area-inset-right,0px));display:grid;grid-template-columns:repeat(3,64px);grid-template-rows:repeat(3,64px);gap:6px}
.ash .lilyp.pad button{border:2px solid #0a140f;border-radius:14px;background:linear-gradient(#2e5b3f,#1d3a28);color:#e9f6d8;font:bold 26px system-ui,sans-serif;touch-action:none;cursor:pointer;box-shadow:0 3px 8px #0007}
.ash .lilyp.pad button:active,.ash .lilyp.pad button.on{background:linear-gradient(#4f8f5f,#2e5b3f)}
.ash .lilyp.pad button:focus-visible{outline:2px solid #ffe08a;outline-offset:2px}
.ash .lilyp.pad .u{grid-column:2;grid-row:1}.ash .lilyp.pad .l{grid-column:1;grid-row:2}.ash .lilyp.pad .r{grid-column:3;grid-row:2}.ash .lilyp.pad .d{grid-column:2;grid-row:3}
.ash .lilyp.quit{bottom:calc(10px + env(safe-area-inset-bottom,0px));left:calc(10px + env(safe-area-inset-left,0px));border:2px solid #0a140f;border-radius:10px;background:linear-gradient(#5a2f2a,#3a1d19);color:#f6dcd4;font:bold 14px Georgia,serif;padding:10px 16px;cursor:pointer}
.ash .lilyp.keys{bottom:calc(64px + env(safe-area-inset-bottom,0px));left:calc(10px + env(safe-area-inset-left,0px));font-size:11px;color:#cfe7c4;background:#0f2219cc;border-radius:6px;padding:4px 8px}
.ash .lilyp.flash{left:50%;top:38%;transform:translate(-50%,-50%);font:bold 34px Georgia,serif;color:#fff6c8;text-shadow:0 3px 0 #0a140f,0 0 18px #000;pointer-events:none;white-space:nowrap;animation:lilyf 1.1s ease-out forwards}
.ash .lilyp.flash.bad{color:#ffb3a3}.ash .lilyp.flash.good{color:#c8f7a8}
@keyframes lilyf{0%{opacity:0;transform:translate(-50%,-40%) scale(.8)}15%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%)}}
@media (prefers-reduced-motion:reduce){.ash .lilyp.flash{animation-duration:1.6s}}
.ash .lilyp.over{left:50%;top:44%;transform:translate(-50%,-50%);width:min(92vw,340px);background:linear-gradient(#173226f4,#0f2219f4);border:2px solid #0a140f;border-radius:12px;padding:14px 16px;text-align:center;box-shadow:0 6px 18px #000a}
.ash .lilyp.over h3{margin:0 0 6px;font:bold 20px Georgia,serif;color:#b9e3a6}
.ash .lilyp.over .big{font-size:34px;font-weight:bold;color:#fff6c8;margin:4px 0}
.ash .lilyp.over p{margin:4px 0;font-size:13px;color:#d9ecd0;font-family:Georgia,serif}
.ash .lilyp.over .btns{display:flex;gap:8px;margin-top:12px}
.ash .lilyp.over .btn{flex:1;margin:0}
@media (max-width:520px){.ash .lilyp.pad{grid-template-columns:repeat(3,58px);grid-template-rows:repeat(3,58px)}.ash .lilyp .v{font-size:16px}.ash .lilyp.keys{display:none}}
`;
  function install(K) {
    const { el, ui, A } = K;
    if (!document.getElementById('ash-lily-css')) { const s = document.createElement('style'); s.id = 'ash-lily-css'; s.textContent = CSS; document.head.appendChild(s); }
    let top = null, pad = null, quit = null, keys = null, over = null, cb = null, lastTop = 0;
    const fmt = n => String(Math.max(0, n | 0)).padStart(5, '0');
    function lilyOpen(v, callbacks) {
      cb = callbacks || null; lilyClose(true);
      ui.classList.add('lily');
      top = el('lilyp top ui', ui);
      pad = el('lilyp pad ui', ui);
      pad.innerHTML = '<button class="u" data-d="u" aria-label="Hop forward">&#9650;</button><button class="l" data-d="l" aria-label="Hop left">&#9664;</button><button class="r" data-d="r" aria-label="Hop right">&#9654;</button><button class="d" data-d="d" aria-label="Hop back">&#9660;</button>';
      pad.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); e.stopPropagation(); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120); if (cb) cb.hop(b.dataset.d); });
      for (const t of ['pointerup', 'click', 'touchstart', 'touchend']) pad.addEventListener(t, e => { e.stopPropagation(); }, { passive: true });
      quit = el('lilyp quit ui', ui); quit.textContent = 'Quit'; quit.setAttribute('role', 'button'); quit.tabIndex = 0;
      quit.addEventListener('click', e => { e.stopPropagation(); if (cb) cb.quit(); });
      keys = el('lilyp keys ui', ui); keys.textContent = 'Arrow keys or W A S D to hop · Esc to quit';
      lilyUpdate(v);
    }
    function lilyUpdate(v) {
      if (!top || !v) return;
      const h = top.offsetTop + top.offsetHeight + 6; if (h > 20 && h !== lastTop) { lastTop = h; ui.style.setProperty('--lilytop', h + 'px'); }   /* the chat sits just under the bar */
      top.innerHTML = '<div class="row"><span class="ttl">THE LILY RUN</span><span><span class="k">LEVEL </span><span class="v">' + (v.level | 0) + '</span></span></div>'
        + '<div class="row"><span><span class="k">SCORE </span><span class="v">' + fmt(v.score) + '</span></span><span class="lives" aria-label="' + (v.lives | 0) + ' frogs left">' + '<i class="life"></i>'.repeat(Math.max(0, Math.min(8, v.lives | 0))) + '</span><span><span class="k">BEST </span><span class="v">' + fmt(v.best) + '</span></span></div>'
        + '<div class="time" aria-hidden="true"><i style="width:' + Math.round(Math.max(0, Math.min(1, v.timer)) * 100) + '%"></i></div>';
    }
    function lilyFlash(text, kind) {
      if (!ui.classList.contains('lily')) return;
      const f = el('lilyp flash ui' + (kind ? ' ' + kind : ''), ui); f.textContent = text; setTimeout(() => f.remove(), 1700);
    }
    /* the end of a run: o = {score, best, place, newBest}; buttons call cb.again() / cb.quit() */
    function lilyOver(o) {
      if (over) over.remove();
      over = el('lilyp over ui', ui);
      over.innerHTML = '<h3>The run is over</h3><div class="big">' + fmt(o.score) + '</div>'
        + '<p>' + (o.newBest ? 'A new best for you!' : 'Your best: ' + fmt(o.best)) + '</p>'
        + (o.place ? '<p>' + A.esc(o.place) + '</p>' : '')
        + '<div class="btns"><button class="btn" data-a="again">Run again</button><button class="btn" data-a="leave">Leave</button></div>';
      over.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !cb) return; e.stopPropagation(); over.remove(); over = null; if (b.dataset.a === 'again') cb.again(); else cb.quit(); });
      const first = over.querySelector('button'); if (first) first.focus();
    }
    function lilyClose(keepClass) {
      for (const n of [top, pad, quit, keys, over]) if (n) n.remove();
      top = pad = quit = keys = over = null;
      if (!keepClass) { ui.classList.remove('lily'); cb = null; }
    }
    K.lilyOpen = lilyOpen; K.lilyUpdate = lilyUpdate; K.lilyFlash = lilyFlash; K.lilyOver = lilyOver; K.lilyClose = () => lilyClose(false);
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudlily', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
