/* ASHVALE 3D HUD: the clubhouse tables (2026-10-20: the dice table, the wheel, the twenty-one tables upstairs; shared rounds run by
   the @ashvale Bank). At a table the Ashvale HUD steps aside (the chat stays) and this bar takes over, the Fortune Engine's look: what
   the dealer says, your credit and what you have on the felt, the round's clock, the coin you bet with (dice table, wheel: tap the felt)
   or the bet and the moves (twenty-one), Add GOLD and Leave table. Found by name by hud.js, shared by every table game.
   install(K) adds K.tablesOpen(view, cb), K.tablesUpdate(view), K.tablesClose(), K.tablesDeposit(pack). */
(function (G) {
  'use strict';
  const CSS = `
.ash .lay.tables > .ui:not(.tabp):not(.chatw):not(.help){display:none !important}
.ash .lay.tables .hover{display:none !important}
.ash .lay.tables .chatw{top:calc(6px + env(safe-area-inset-top,0px));bottom:auto;left:8px;right:8px;width:auto;max-width:560px}
.ash .lay.tables .chatw .chat:not(.big){max-height:calc(3*1.3em + 10px)}
.ash .tabp{position:absolute;color:#eee;font-size:13px;line-height:1.35;background:linear-gradient(#2b3a33f0,#1b241ff0);border:2px solid #12181a;border-radius:8px;box-shadow:0 4px 14px #0008;pointer-events:auto}
.ash .tabp.bar{display:flex;flex-direction:column;gap:5px;left:50%;transform:translateX(-50%);bottom:0;width:min(100vw,680px);border-radius:10px 10px 0 0;border-bottom:0;padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px))}
.ash .tabp .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.ash .tabp .stt{color:#ffd23f;font-weight:bold;min-width:0;overflow:hidden;text-overflow:ellipsis}
.ash .tabp .stt.big{color:#ffe9a0;font:bold 15px Georgia,serif}
.ash .tabp .pot{color:#c8c3b4;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;white-space:nowrap}
.ash .tabp .pot b{color:#e8e2d0}
.ash .tabp .clk{color:#9fd8a8;font-size:12px}
.ash .tabp .clk.shut{color:#e0a05f}
.ash .tabp .lab{font-size:10px;color:#9aa79c;letter-spacing:.5px;text-transform:uppercase}
.ash .tabp .btns{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ash .tabp .btns .btn{flex:1 1 0;width:auto;margin:0;padding:9px 4px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ash .tabp .btns .btn.sm{flex:0 0 auto;padding:7px 10px}
.ash .tabp .btn.on{background:linear-gradient(#8a6d2c,#5e4a1c);color:#fff3c4}
.ash .tabp .btn.go{font:bold 14px Georgia,serif}
.ash .tabp .btn:disabled{opacity:.45;cursor:default}
.ash .tabp .lines{font-size:11px;color:#c8c3b4;max-height:3.6em;overflow:auto}
.ash .tabp .lines .win{color:#9fe0a0}.ash .tabp .lines .lose{color:#e0a090}
.ash .tabp.dep{left:50%;top:42%;transform:translate(-50%,-50%);width:min(94vw,380px);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.ash .tabp h3{margin:0;font:bold 15px Georgia,serif;color:#ffe9a0}
.ash .tabp p{margin:0;color:#c8c3b4;font-size:12px}
.ash .tabp input{font:inherit;font-size:16px;width:8.5em;padding:6px 8px;background:#0006;border:1px solid #ffffff2a;border-radius:4px;color:#fff}
.ash .tabp .err{color:#e0705f;min-height:1em}
/* [Claude 2026-10-21] a phone held sideways (the operator: "Landscape view on the iPhone the hud is really big and blocks the table and it doesn't
   look very good in general"): the bar becomes a slim column down the right edge, the felt gets the rest of the screen (engtables fits it
   beside the column), chips are round chips, the chat is two short lines left of the column, the coordinates go */
@media (orientation:landscape) and (max-height:520px){
.ash .lay.tables .xy{display:none !important}
.ash .lay.tables .chatw{left:calc(6px + env(safe-area-inset-left,0px));right:auto;width:min(46vw,360px);top:calc(4px + env(safe-area-inset-top,0px));opacity:.88}
.ash .lay.tables .chatw .chat:not(.big){max-height:calc(2*1.25em + 8px);font-size:11px}
.ash .lay.tables .chatw input,.ash .lay.tables .chatw .say{font-size:12px}
.ash .tabp.bar{left:auto;right:0;top:0;bottom:0;transform:none;width:calc(212px + env(safe-area-inset-right,0px));border-radius:12px 0 0 12px;border:2px solid #12181a;border-right:0;
  padding:calc(6px + env(safe-area-inset-top,0px)) calc(8px + env(safe-area-inset-right,0px)) calc(6px + env(safe-area-inset-bottom,0px)) 8px;gap:5px;overflow-y:auto;overscroll-behavior:contain;
  background:linear-gradient(90deg,#1b241fe8,#2b3a33f4 14px,#22302af4);box-shadow:-4px 0 16px #0009}
.ash .tabp .top{flex-wrap:wrap;gap:2px 8px}
.ash .tabp .hd .stt{flex:1 1 100%;white-space:nowrap;font-size:12px}
.ash .tabp .hd .stt.big{font-size:13px}
.ash .tabp .hd .pot{font-size:11px}
.ash .tabp .sub{font-size:12px;border-bottom:1px solid #ffffff18;padding-bottom:4px}
.ash .tabp .sub .ttl{flex:1 1 100%;line-height:1.3}
.ash .tabp .clk{font-size:11px}
.ash .tabp .lab{flex:1 1 100%;font-size:9px}
.ash .tabp .btns.chips{gap:4px;justify-content:space-between}
.ash .tabp .btns.chips .chip{flex:0 0 36px;width:36px;height:36px;padding:0;border-radius:50%;font:bold 11px Georgia,serif;color:#fff;text-shadow:0 1px 1px #000a;
  border:3px dashed #ffffffb0;box-shadow:0 2px 3px #0008,inset 0 0 0 2px #0003;background:#7a7a7a}
.ash .tabp .btns.chips .chip.k1,.ash .tabp .btns.chips .chip.k2{background:#e8e2d0;color:#3a2a1a;text-shadow:none;border-color:#3a6aa8b0}
.ash .tabp .btns.chips .chip.k5,.ash .tabp .btns.chips .chip.k10{background:#a8262e}
.ash .tabp .btns.chips .chip.k25,.ash .tabp .btns.chips .chip.k50{background:#2f7a3a}
.ash .tabp .btns.chips .chip.k100{background:#1c1c1c}
.ash .tabp .btns.chips .chip.k500{background:#6a3a8a}
.ash .tabp .btns.chips .chip.on{outline:3px solid #ffd23f;outline-offset:1px;transform:translateY(-2px)}
.ash .tabp .btns.chips .btn:not(.chip){flex:1 1 40%;padding:7px 4px;font-size:12px}
.ash .tabp .btns.acts{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.ash .tabp .btns.acts .btn{min-height:42px;padding:6px 4px;font-size:13px}
.ash .tabp .btns.acts .btn.go{font:bold 15px Georgia,serif;min-height:46px}
.ash .tabp .btns.acts .btn[data-x=surrender]{grid-column:1 / -1;min-height:36px}
.ash .tabp .btns.ins{display:grid;grid-template-columns:1fr;gap:5px}
.ash .tabp .btns.ins .btn{min-height:42px}
.ash .tabp .lines{font-size:10.5px;max-height:4.2em;background:#0003;border-radius:4px;padding:2px 5px}
.ash .tabp .btns.ft{margin-top:auto;gap:5px}
.ash .tabp .btns.ft .btn{padding:6px 2px;font-size:11.5px}
.ash .tabp .pk{font-size:10.5px;text-align:center}
.ash .tabp.dep{top:50%;max-height:calc(100% - 12px);overflow-y:auto;width:min(70vw,380px);padding:8px 10px;gap:6px}
.ash .tabp.dep p{font-size:11px}
}
`;
  function install(K) {
    const { el, ui, A } = K, esc = A.esc, fmt = n => (Math.round(n) || 0).toLocaleString('en-US');
    if (!document.getElementById('ash-tables-css')) { const st = document.createElement('style'); st.id = 'ash-tables-css'; st.textContent = CSS; document.head.appendChild(st); }
    let box = null, dep = null, cb = null, view = null, last = '';
    const COINS = [1, 5, 25, 100, 500], BET21 = [2, 10, 50, 100];
    function clock(v) {
      if (v.phase === 'bet') return '<span class="clk">Bets close in ' + v.left + ' s</span>';
      if (v.phase === 'show') return '<span class="clk shut">No more bets</span>';
      if (v.phase === 'insurance') return '<span class="clk">Insurance closes in ' + v.left + ' s</span>';   /* 2026-10-21: "Add a countdown timer for insurance" */
      if (v.phase === 'play') return '<span class="clk shut">' + (v.hand && v.hand.myTurn ? 'Your turn: ' + v.left + ' s' : 'Hands in play') + '</span>';
      return '<span class="clk">Waiting for players</span>';
    }
    function draw() {
      if (!box || !view) return; const v = view, open = v.phase === 'bet' && v.sat;
      let mid = '';
      if (v.game === 'twentyone') {
        const H = v.hand || {};
        if (H.insurance) mid = '<div class="btns ins"><span class="lab">The dealer shows an Ace · ' + v.left + ' s</span><button class="btn go" data-i="1">Insure (half your bet)</button><button class="btn" data-i="0">No insurance</button></div>';
        else if (H.myTurn) { const a = H.acts || {}; mid = '<div class="btns acts">' + [['hit', 'Hit'], ['stand', 'Stand'], ['double', 'Double'], ['split', 'Split'], ['surrender', 'Surrender']].map(([k, t]) => '<button class="btn' + (k === 'hit' || k === 'stand' ? ' go' : '') + '" data-x="' + k + '"' + (a[k] ? '' : ' disabled') + '>' + t + '</button>').join('') + '</div>'; }
        else mid = '<div class="btns chips"><span class="lab">Bet</span>' + BET21.map(n => '<button class="btn sm chip k' + n + '" data-b="' + n + '"' + (open && v.credit >= n ? '' : ' disabled') + '>+' + n + '</button>').join('') + '<button class="btn sm" data-a="clear"' + (open && v.felt ? '' : ' disabled') + '>Take back</button></div>';
      } else {
        mid = '<div class="btns chips"><span class="lab">Tap the felt with</span>' + COINS.map(n => '<button class="btn sm chip k' + n + (v.coin === n ? ' on' : '') + '" data-c="' + n + '">' + fmt(n) + '</button>').join('')
          + (v.game === 'dice' && v.point ? '<button class="btn sm" data-a="odds"' + (open ? '' : ' disabled') + '>Odds</button>' : '')
          + '<button class="btn sm" data-a="clear"' + (open && v.felt ? '' : ' disabled') + '>Take back</button></div>';
      }
      const html = '<div class="top hd"><span class="stt' + (v.big ? ' big' : '') + '">' + esc(v.msg || '') + '</span><span class="pot">Credit <b>' + fmt(v.credit) + '</b> · on the felt <b>' + fmt(v.felt) + '</b></span></div>'
        + '<div class="top sub"><span class="ttl"><b>' + esc(v.title) + '</b>' + (v.game === 'dice' ? ' · point ' + (v.point ? '<b>' + v.point + '</b>' : 'off') : '') + (v.hand && v.hand.totals ? ' · <b>' + esc(v.hand.totals) + '</b>' : '') + '</span>' + clock(v) + '</div>'
        + mid
        + ((v.lines || []).length ? '<div class="lines">' + v.lines.map(l => '<div class="' + (l[1] || '') + '">' + esc(l[0]) + '</div>').join('') + '</div>' : '')
        + '<div class="btns ft"><button class="btn" data-a="dep">Add GOLD</button><button class="btn" data-a="leave">Leave table</button></div>'
        + '<div class="pot pk">In your pack <b>' + fmt(v.pack) + '</b> GOLD</div>';
      if (html !== last) { box.innerHTML = html; last = html; }   /* only when it changes: a node rewritten under the finger can swallow a tap */
    }
    function click(e) {
      const b = e.target.closest('button'); if (!b || b.disabled || !cb) return;
      if (b.dataset.c) cb.coin(+b.dataset.c); else if (b.dataset.b) cb.bet21(+b.dataset.b); else if (b.dataset.x) cb.act(b.dataset.x); else if (b.dataset.i) cb.ins(b.dataset.i === '1');
      else if (b.dataset.a === 'clear') cb.clear(); else if (b.dataset.a === 'odds') cb.odds(); else if (b.dataset.a === 'dep') tablesDeposit(); else if (b.dataset.a === 'leave') cb.leave();
    }
    function tablesOpen(v, callbacks) { cb = callbacks || null; view = v; last = ''; if (!box) { box = el('tabp bar ui', ui); box.addEventListener('click', click); } ui.classList.add('tables'); draw(); }
    function tablesUpdate(v) { if (!box) return; view = v; draw(); if (dep) { const w = dep.querySelector('.wal'); if (w) w.textContent = fmt(v.pack); } }
    function closeDep() { if (dep) dep.remove(); dep = null; }
    function tablesClose() { ui.classList.remove('tables'); closeDep(); if (box) box.remove(); box = null; view = null; cb = null; }
    function tablesDeposit() {
      if (!view || !cb) return; closeDep();
      dep = el('tabp dep ui', ui);
      const pack = view.pack | 0;
      dep.innerHTML = '<h3>Put GOLD on the table</h3><p>Your GOLD goes to the @ashvale Bank as your credit at this table. Bets come out of it and winnings go back into it. Whatever is left comes back to you when you leave the table.</p>'
        + '<div class="btns"><input type="number" min="1" step="1" inputmode="numeric" value="' + Math.min(500, pack) + '" aria-label="GOLD to put in"><span class="pot">of <b class="wal">' + fmt(pack) + '</b> in your pack</span></div>'
        + '<div class="btns"><button class="btn" data-q="100">100</button><button class="btn" data-q="1000">1,000</button><button class="btn" data-q="10000">10,000</button><button class="btn" data-q="all">All</button></div>'
        + '<div class="btns"><button class="btn go" data-a="go">Put in</button><button class="btn" data-a="x">Cancel</button></div><div class="err"></div>';
      const inp = dep.querySelector('input'), err = dep.querySelector('.err');
      const go = () => { const n = Number(inp.value), have = view ? view.pack | 0 : 0;
        if (!Number.isInteger(n) || n < 1) { err.textContent = 'Enter a whole number of GOLD, 1 or more.'; return; }
        if (n > have) { err.textContent = 'You have ' + fmt(have) + ' GOLD in your pack.'; return; }
        closeDep(); if (cb) cb.deposit(n); };
      dep.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.q) inp.value = b.dataset.q === 'all' ? (view ? view.pack | 0 : 0) : b.dataset.q; else if (b.dataset.a === 'go') go(); else if (b.dataset.a === 'x') closeDep(); });
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); if (e.key === 'Escape') closeDep(); });
    }
    K.tablesOpen = tablesOpen; K.tablesUpdate = tablesUpdate; K.tablesClose = tablesClose; K.tablesDeposit = tablesDeposit;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudtables', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
