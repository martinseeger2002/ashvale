/* ASHVALE 3D HUD: the Fortune Engine (2026-10-16). Seated on the bench in front of one of the Saltmere Tap's four
   machines the Ashvale HUD steps aside (the chat stays) and this bar takes over, the card table's look: what the machine says,
   the credit, the wager (1·2·3, 10·20·30, 100·200·300 GOLD: the operator), Spin, Put in GOLD, Cash out, Pays, Stand up, and the GOLD
   in your pack. The coin slot opens the deposit box ("any amount of gold"). No seal on screen (the operator: "The game should not
   display the seal") - the engine checks it quietly. Taps on the reels, the lever, the slot and the knobs reach the engine.
   install(K) adds K.fortuneOpen(view, cb), K.fortuneUpdate(view), K.fortuneClose(), K.fortuneDeposit(), K.fortunePays(rows). */
(function (G) {
  'use strict';
  const CSS = `
.ash .lay.fortune > .ui:not(.fortp):not(.chatw):not(.help){display:none !important}
.ash .lay.fortune .hover{display:none !important}
.ash .lay.fortune .chatw{top:calc(6px + env(safe-area-inset-top,0px));bottom:auto;left:8px;right:8px;width:auto;max-width:560px}
.ash .lay.fortune .chatw .chat:not(.big){max-height:calc(3*1.3em + 10px)}
.ash .lay.fortune .chatw .chatx{top:auto;bottom:-24px;border-radius:0 0 6px 6px}
.ash .fortp{position:absolute;color:#eee;font-size:13px;line-height:1.35;background:linear-gradient(#2b3a33f0,#1b241ff0);border:2px solid #12181a;border-radius:8px;box-shadow:0 4px 14px #0008;pointer-events:auto;box-sizing:border-box}
.ash .fortp.bar{display:flex;flex-direction:column;gap:5px;left:50%;transform:translateX(-50%);bottom:0;width:min(100vw,680px);border-radius:10px 10px 0 0;border-bottom:0;padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px));max-height:62vh;overflow-y:auto;touch-action:pan-y}
.ash .fortp .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.ash .fortp .stt{color:#ffd23f;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ash .fortp .stt.big{color:#ffe9a0;font:bold 15px Georgia,serif}
.ash .fortp .pot{color:#c8c3b4;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;white-space:nowrap}
.ash .fortp .pot b{color:#e8e2d0}
.ash .fortp .lab{font-size:10px;color:#9aa79c;letter-spacing:.5px;text-transform:uppercase}
.ash .fortp .btns{display:flex;gap:6px;align-items:center}
.ash .fortp .btns .btn{flex:1 1 0;width:auto;margin:0;padding:9px 4px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ash .fortp .btns .btn.sm{flex:0 0 auto;padding:9px 10px}
.ash .fortp .btns .btn.tier{flex:0 0 auto;padding:6px 8px;font-size:12px}
.ash .fortp .btn.on{background:linear-gradient(#8a6d2c,#5e4a1c);color:#fff3c4}
.ash .fortp .btn.spin{font:bold 14px Georgia,serif}
.ash .fortp .btn:disabled{opacity:.45;cursor:default}
.ash .fortp.dep,.ash .fortp.pays{left:50%;top:42%;transform:translate(-50%,-50%);width:min(94vw,380px);padding:10px 12px;display:flex;flex-direction:column;gap:8px;max-height:72vh;overflow:auto}
.ash .fortp h3{margin:0;font:bold 15px Georgia,serif;color:#ffe9a0}
.ash .fortp p{margin:0;color:#c8c3b4;font-size:12px}
.ash .fortp input{font:inherit;font-size:16px;width:8.5em;padding:6px 8px;background:#0006;border:1px solid #ffffff2a;border-radius:4px;color:#fff}
.ash .fortp .err{color:#e0705f;min-height:1em}
.ash .fortp table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.ash .fortp td,.ash .fortp th{padding:3px 4px;text-align:right;border-bottom:1px solid #ffffff14;white-space:nowrap}
.ash .fortp th{font-size:10px;color:#9aa79c;font-weight:normal;text-transform:uppercase;letter-spacing:.5px}
.ash .fortp td:first-child,.ash .fortp th:first-child{text-align:left}
.ash .fortp td img{width:22px;height:11px;vertical-align:middle;margin-right:1px;border-radius:2px}
.ash .fortp .g{color:#ffd23f;font-weight:bold}
`;
  function install(K) {
    const { el, ui, A } = K, esc = A.esc, fmt = n => (n | 0).toLocaleString('en-US');
    if (!document.getElementById('ash-fortune-css')) { const st = document.createElement('style'); st.id = 'ash-fortune-css'; st.textContent = CSS; document.head.appendChild(st); }
    let box = null, dep = null, pays = null, cb = null, view = null;
    function draw() {
      if (!box || !view) return; const v = view;
      const tiers = [1, 10, 100].map(t => '<button class="btn tier' + (v.tier === t ? ' on' : '') + '" data-t="' + t + '"' + (v.busy ? ' disabled' : '') + '>' + [1, 2, 3].map(k => fmt(k * t)).join('·') + '</button>').join('');
      const stakes = [1, 2, 3].map(k => '<button class="btn sm' + (v.k === k ? ' on' : '') + '" data-k="' + k + '"' + (v.busy ? ' disabled' : '') + '>' + fmt(k * v.tier) + '</button>').join('');
      const w = v.tier * v.k, spinTxt = v.credit >= w ? 'Spin ' + fmt(w) : v.credit > 0 ? 'Credit too low' : 'Put in GOLD first';
      box.innerHTML = '<div class="top"><span class="stt' + (v.big ? ' big' : '') + '">' + esc(v.msg || '') + '</span><span class="pot">Credit <b>' + fmt(v.credit) + '</b> GOLD</span></div>'
        + '<div class="btns"><span class="lab">Wager</span>' + tiers + '</div>'
        + '<div class="btns">' + stakes + '<button class="btn spin" data-a="spin"' + (v.busy || v.credit < w ? ' disabled' : '') + '>' + spinTxt + '</button></div>'
        + '<div class="btns"><button class="btn" data-a="dep"' + (v.busy ? ' disabled' : '') + '>Add GOLD</button><button class="btn" data-a="cash"' + (v.busy || v.credit <= 0 ? ' disabled' : '') + '>Cash out</button>'
        + '<button class="btn" data-a="pays">Pays</button><button class="btn" data-a="stand"' + (v.busy ? ' disabled' : '') + '>Stand up</button></div>'
        + '<div class="pot">In your pack <b>' + fmt(v.pack) + '</b> GOLD</div>';
    }
    function click(e) {
      const b = e.target.closest('button'); if (!b || b.disabled || !cb) return;
      if (b.dataset.t) cb.tier(+b.dataset.t); else if (b.dataset.k) cb.stake(+b.dataset.k);
      else if (b.dataset.a === 'spin') cb.spin(); else if (b.dataset.a === 'dep') fortuneDeposit(); else if (b.dataset.a === 'cash') cb.cash();
      else if (b.dataset.a === 'pays') { if (pays) closePays(); else cb.pays(); } else if (b.dataset.a === 'stand') cb.stand();
    }
    function fortuneOpen(v, callbacks) { cb = callbacks || null; view = v; if (!box) { box = el('fortp bar ui', ui); box.addEventListener('click', click); } ui.classList.add('fortune'); draw(); }
    function fortuneUpdate(v) { if (!box) return; view = v; draw(); if (dep) { const w = dep.querySelector('.wal'); if (w) w.textContent = fmt(v.pack); } }
    function closeDep() { if (dep) dep.remove(); dep = null; }
    function closePays() { if (pays) pays.remove(); pays = null; }
    function fortuneClose() { ui.classList.remove('fortune'); closeDep(); closePays(); if (box) box.remove(); box = null; view = null; cb = null; }
    /* the coin slot: "Any amount of gold" (the operator) from your pack, to the @ashvale Bank as the machine's credit */
    function fortuneDeposit() {
      if (!view || !cb || view.busy) return; closePays(); closeDep();
      dep = el('fortp dep ui', ui);
      const pack = view.pack | 0;
      dep.innerHTML = '<h3>Put GOLD in the machine</h3><p>Your GOLD goes to the @ashvale Bank and shows on the machine as credit. Whatever is left comes back to you when you cash out, stand up or lose your connection.</p>'
        + '<div class="btns"><input type="number" min="1" step="1" inputmode="numeric" value="' + Math.min(500, pack) + '" aria-label="GOLD to put in"><span class="pot">of <b class="wal">' + fmt(pack) + '</b> in your pack</span></div>'
        + '<div class="btns"><button class="btn" data-q="100">100</button><button class="btn" data-q="1000">1,000</button><button class="btn" data-q="10000">10,000</button><button class="btn" data-q="all">All</button></div>'
        + '<div class="btns"><button class="btn spin" data-a="go">Put in</button><button class="btn" data-a="x">Cancel</button></div><div class="err"></div>';
      const inp = dep.querySelector('input'), err = dep.querySelector('.err');
      const go = () => { const n = Number(inp.value), have = view ? view.pack | 0 : 0;
        if (!Number.isInteger(n) || n < 1) { err.textContent = 'Enter a whole number of GOLD, 1 or more.'; return; }
        if (n > have) { err.textContent = 'You have ' + fmt(have) + ' GOLD in your pack.'; return; }
        closeDep(); if (cb) cb.deposit(n); };
      dep.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.q) inp.value = b.dataset.q === 'all' ? (view ? view.pack | 0 : 0) : b.dataset.q; else if (b.dataset.a === 'go') go(); else if (b.dataset.a === 'x') closeDep(); });
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); if (e.key === 'Escape') closeDep(); });
    }
    /* the pay table, worked out exactly from the reels (rows from the engine: icons, pays, odds) */
    function fortunePays(o) {
      closeDep(); closePays(); pays = el('fortp pays ui', ui);
      pays.innerHTML = '<h3>The Fortune Engine pays</h3><table><thead><tr><th>Line</th><th>× wager</th><th>Odds</th></tr></thead><tbody>'
        + o.rows.map(r => '<tr><td>' + r.icons.map(s => '<img src="' + o.icon[s] + '" alt="' + esc(s) + '">').join('') + (r.icons.length < 3 ? ' <span class="lab">any</span>' : '') + '</td><td class="g">' + fmt(r.pays) + '</td><td>1 in ' + fmt(r.odds) + '</td></tr>').join('')
        + '</tbody></table><p>Returns <b class="g">' + esc(o.rtp) + '</b> of what is wagered over the long run; ' + esc(o.hit) + ' of spins win something. A Ruby anywhere on the line pays.</p>'
        + '<div class="btns"><button class="btn">Close</button></div>';
      pays.querySelector('button').addEventListener('click', closePays);
    }
    K.fortuneOpen = fortuneOpen; K.fortuneUpdate = fortuneUpdate; K.fortuneClose = fortuneClose; K.fortuneDeposit = fortuneDeposit; K.fortunePays = fortunePays;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudfortune', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
