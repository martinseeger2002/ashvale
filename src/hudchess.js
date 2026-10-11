/* ASHVALE 3D HUD: the chess park (2026-10-10, handoff/chess_park_plan.md). Seated at one of Saltmere's stone
   tables the Ashvale HUD steps aside (the chat stays) and this small slate panel takes over: who plays, whose move, the
   last moves, the selected piece and where it may go, a promotion picker, and the way up. The board itself is the 3D
   one on the table - taps on its squares reach the engine (chessTap), which calls chessUpdate here. Phase 1: no clocks,
   no stakes - standing up with a move played is resigning, and the button says so.
   install(K) adds K.chessOpen(view, cb), K.chessUpdate(view), K.chessClose(), K.chessPromo(go). */
(function (G) {
  'use strict';
  const CSS = `
.ash .lay.chess > .ui:not(.chessp):not(.chatw):not(.help){display:none !important}
.ash .lay.chess .hover{display:none !important}
.ash .lay.chess .chatw .chat{max-height:54px}
.ash .chessp{position:absolute;right:8px;top:8px;width:196px;opacity:.94;max-width:calc(100vw - 20px);padding:8px 10px;font-size:13px;line-height:1.35;color:#eee;background:linear-gradient(#3a3f45,#262a2f);border:2px solid #15181b;border-radius:6px;box-shadow:0 4px 14px #0008;pointer-events:auto}
.ash .chessp h3{margin:0 0 6px;font:bold 15px Georgia,serif;color:#e9e2cf;letter-spacing:.5px}
.ash .chessp .pl{display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-radius:4px;margin:2px 0;background:#0003}
.ash .chessp .pl.turn{background:#ffd23f22;box-shadow:inset 0 0 0 1px #ffd23f88}
.ash .chessp .pl i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px;border:1px solid #000}
.ash .chessp .pl i.w{background:#e9e2cf}.ash .chessp .pl i.b{background:#2b2118}
.ash .chessp .stt{margin:6px 0 4px;color:#ffd23f;font-weight:bold}
.ash .chessp .stt.over{color:#f0a0a0}
.ash .chessp .sel{color:#9fc3ff;min-height:16px}
.ash .chessp .mv{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#c8c3b4;max-height:84px;overflow:hidden;margin:4px 0;word-break:break-word}
.ash .chessp .btns{margin-top:6px;display:flex;gap:6px;flex-wrap:wrap}
.ash .chessp .btn{margin:0;padding:6px 10px}
.ash .chessp .promo{display:none;margin-top:6px;padding:6px;background:#0005;border-radius:4px}
.ash .chessp .promo.on{display:block}
.ash .chessp .promo .btn{min-width:38px;text-align:center;font-weight:bold}
@media (max-width:600px){.ash .chessp{right:6px;top:6px;width:170px;font-size:12px}.ash .chessp .mv{max-height:52px}}`;
  const PIECE = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  function install(K) {
    const { api, el, ui, A } = K, esc = A.esc;
    if (!document.getElementById('ash-chess-css')) { const st = document.createElement('style'); st.id = 'ash-chess-css'; st.textContent = CSS; document.head.appendChild(st); }
    let box = null, cb = null, view = null, promoGo = null;
    function movesText(st) {
      const m = st.moves || [], out = [];
      for (let i = Math.max(0, m.length - 12); i < m.length; i++) { if (i % 2 === 0) out.push((i / 2 + 1) + '.'); out.push(m[i]); }
      return (m.length > 12 ? '… ' : '') + out.join(' ');
    }
    function draw() {
      if (!box || !view) return;
      const st = view.st, me = view.me, you = (c) => st[c] === me, name = (c) => st[c] ? esc(st[c + 'n'] || 'someone') + (you(c) ? ' (you)' : '') : '<span style="color:#999">empty seat</span>';
      let status, cls = '';
      if (st.status === 'open') status = st.w && st.b ? 'Starting…' : 'Waiting for an opponent to sit down';
      else if (st.status === 'over') { cls = 'over'; status = 'Game over: ' + st.result + (st.why ? ' — ' + esc(st.why) : '') + (st.result === '1/2-1/2' ? '' : (st.result === '1-0') === (view.col === 'w') ? ' — you win' : view.col ? ' — you lose' : ''); }
      else status = view.mine ? 'Your move' + (view.inCheck ? ' — check!' : '') : (view.turn === 'w' ? 'White' : 'Black') + ' to move';
      const sel = view.sel ? 'Selected ' + view.sel + (view.targets.length ? ' → ' + view.targets.map(t => t.to).join(', ') : '') : (view.mine ? 'Tap a piece, then a square.' : '');
      const standTxt = st.status === 'playing' && (st.moves || []).length ? 'Resign & stand up' : 'Stand up';
      box.innerHTML = '<h3>Chess</h3>'
        + '<div class="pl' + (st.status === 'playing' && view.turn === 'w' ? ' turn' : '') + '"><span><i class="w"></i>White</span><span>' + name('w') + '</span></div>'
        + '<div class="pl' + (st.status === 'playing' && view.turn === 'b' ? ' turn' : '') + '"><span><i class="b"></i>Black</span><span>' + name('b') + '</span></div>'
        + '<div class="stt ' + cls + '">' + status + '</div><div class="sel">' + sel + '</div>'
        + '<div class="mv">' + esc(movesText(st)) + '</div>'
        + '<div class="promo" data-promo><div style="margin-bottom:4px">Promote to</div>' + ['q', 'r', 'b', 'n'].map(p => '<button class="btn" data-p="' + p + '" title="' + PIECE[p] + '">' + PIECE[p][0] + '</button>').join('') + '</div>'
        + '<div class="btns"><button class="btn" data-a="stand">' + standTxt + '</button></div>';
      box.querySelector('[data-a=stand]').onclick = () => { if (cb && cb.stand) cb.stand(); api.sfx && api.sfx('click'); };
      for (const b of box.querySelectorAll('[data-p]')) b.onclick = () => { const go = promoGo; promoGo = null; box.querySelector('[data-promo]').classList.remove('on'); if (go) go(b.dataset.p); };
      if (promoGo) box.querySelector('[data-promo]').classList.add('on');
    }
    function chessOpen(v, callbacks) { cb = callbacks || null; view = v; promoGo = null; if (!box) box = el('chessp stone ui', ui); ui.classList.add('chess'); draw(); }
    function chessUpdate(v) { if (!box) return; view = v; draw(); }
    function chessClose() { ui.classList.remove('chess'); if (box) { box.remove(); box = null; } view = null; cb = null; promoGo = null; }
    function chessPromo(go) { promoGo = go; draw(); }
    K.chessOpen = chessOpen; K.chessUpdate = chessUpdate; K.chessClose = chessClose; K.chessPromo = chessPromo;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudchess', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
