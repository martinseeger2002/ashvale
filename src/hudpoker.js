/* ASHVALE 3D HUD: the poker table in the Saltmere tap room (handoff/poker_plan.md). Seated at the felt the Ashvale HUD
   steps aside (the chat stays) and this small panel takes over: who is sitting, their chips and their bet, the pot and
   the bet to answer, the board, your own two cards, the last words the table said, and your answer to the bet - fold,
   check, call, raise, all-in - with the way up. The cards themselves lie on the 3D felt (scene.js pokerShow); this is
   the reading of the table's row. The table's own rules (holdemlib) answer whether a button was a legal one.
   install(K) adds K.pokerOpen(view, cb), K.pokerUpdate(view), K.pokerClose(). */
(function (G) {
  'use strict';
  const CSS = `
.ash .lay.poker > .ui:not(.pokerp):not(.chatw):not(.help){display:none !important}
.ash .lay.poker .hover{display:none !important}
.ash .lay.poker .chatw .chat{max-height:54px}
.ash .pokerp{position:absolute;right:8px;top:8px;width:216px;opacity:.94;max-width:calc(100vw - 20px);padding:8px 10px;font-size:13px;line-height:1.35;color:#eee;background:linear-gradient(#2b3a33,#1b241f);border:2px solid #12181a;border-radius:6px;box-shadow:0 4px 14px #0008;pointer-events:auto}
.ash .pokerp h3{margin:0 0 6px;font:bold 15px Georgia,serif;color:#e9e2cf;letter-spacing:.5px}
.ash .pokerp .pl{display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-radius:4px;margin:2px 0;background:#0003}
.ash .pokerp .pl.turn{background:#ffd23f22;box-shadow:inset 0 0 0 1px #ffd23f88}
.ash .pokerp .pl.out{opacity:.45}
.ash .pokerp .pl b{font-weight:normal;color:#cbd6cd}
.ash .pokerp .pl .ch{font-family:ui-monospace,Menlo,Consolas,monospace;color:#e8e2d0}
.ash .pokerp .pl .bt{color:#ffd23f;margin-left:6px}
.ash .pokerp .pl .d{display:inline-block;width:13px;height:13px;border-radius:50%;background:#f2eee0;color:#26302a;font-size:9px;font-weight:bold;text-align:center;line-height:13px;margin-right:5px;vertical-align:-1px}
.ash .pokerp .stt{margin:7px 0 3px;color:#ffd23f;font-weight:bold}
.ash .pokerp .stt.wait{color:#9fc3ff}
.ash .pokerp .cards{margin:2px 0 5px;font-size:17px;letter-spacing:1px;min-height:20px}
.ash .pokerp .cd{display:inline-block;min-width:20px;padding:1px 3px;margin-right:3px;background:#f4f1e8;color:#20202a;border-radius:3px;box-shadow:0 1px 2px #0007;font-size:14px;text-align:center}
.ash .pokerp .cd.r{color:#b23a30}
.ash .pokerp .cd.b{background:repeating-linear-gradient(45deg,#3a5f86,#3a5f86 3px,#2b4a6b 3px,#2b4a6b 6px);color:transparent}
.ash .pokerp .pot{color:#c8c3b4;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
.ash .pokerp .lg{font-size:11px;color:#a9b3a6;max-height:30px;overflow:hidden;margin:4px 0}
.ash .pokerp .btns{margin-top:6px;display:flex;gap:6px;flex-wrap:wrap}
.ash .pokerp .btn{margin:0;padding:6px 9px}
.ash .pokerp .rz{display:none;margin-top:6px;padding:6px;background:#0005;border-radius:4px}
.ash .pokerp .rz.on{display:block}
@media (max-width:600px){.ash .pokerp{right:6px;top:6px;width:180px;font-size:12px}.ash .pokerp .lg{max-height:20px}}`;
  const RANK = '23456789TJQKA', SUIT = ['♣', '♦', '♥', '♠'], RED = [0, 1, 1, 0];
  const STREET = { none: 'between hands', preflop: 'the first round', flop: 'the flop', turn: 'the turn', river: 'the river' };
  function cardTxt(id) { return id == null ? '<span class="cd b">•</span>' : '<span class="cd' + (RED[id & 3] ? ' r' : '') + '">' + RANK[(id >> 2) % 13] + SUIT[id & 3] + '</span>'; }
  function install(K) {
    const { api, el, ui, A } = K, esc = A.esc;
    if (!document.getElementById('ash-poker-css')) { const st = document.createElement('style'); st.id = 'ash-poker-css'; st.textContent = CSS; document.head.appendChild(st); }
    let box = null, cb = null, view = null, raise = false;
    function statusOf(v) {
      if (v.open) return { cls: 'wait', text: v.seats.length > 1 ? 'The table is dealing the next hand' : 'Waiting for players to take chairs' };
      const t = v.seats.find(s => s.ref === v.turn);
      if (v.myTurn) return { text: 'Your turn' + (v.call > 0 ? ' — call ' + v.call : ' — check') };
      if (v.inHand && v.call > 0 && t) return { cls: 'wait', text: esc(t.name) + (t.allin ? ' is all-in' : ' bets ' + v.bet) };
      if (t) return { cls: 'wait', text: esc(t.name) + ' to act' };
      return { cls: 'wait', text: (STREET[v.street] || v.street || '') + (v.hand ? ' — hand ' + v.hand : '') };
    }
    function winTxt(v) {
      if (!v.result || !(v.result.p || []).length) return '';
      const bits = [];
      for (const q of v.result.p) { const ns = v.seats.filter(s => (q[1] || []).indexOf(s.ref) >= 0).map(s => s.name); if (ns.length) bits.push(ns.join(' & ') + ' take' + (ns.length > 1 ? '' : 's') + ' ' + q[0]); }
      return bits.join('; ');
    }
    function draw() {
      if (!box || !view) return;
      const v = view, you = (s) => s.id === v.me, pot = v.pot, st = statusOf(v);
      const mine = v.seats.filter(s => you(s))[0] || null;
      const lo = v.bet ? v.bet * 2 : 100, hi = v.bet + (mine ? mine.chips : 0), potR = v.bet + pot;
      const amounts = [];
      if (hi > Math.max(v.bet, lo - 1)) { amounts.push(Math.min(Math.max(lo, v.bet + 1), hi)); if (potR > amounts[0] && potR < hi) amounts.push(potR); if (hi > amounts[amounts.length - 1]) amounts.push(hi); }
      box.innerHTML = '<h3>Poker</h3>'
        + v.seats.map(s => '<div class="pl' + (v.turn === s.ref && !v.open ? ' turn' : '') + (((s.folded || !s.dealt) && !v.open) ? ' out' : '') + '">'
          + '<span>' + (v.dealer === s.ref ? '<i class="d">D</i>' : '') + '<b>' + esc(s.name) + (you(s) ? ' <span style="color:#9fc3ff">(you)</span>' : '') + '</b></span>'
          + '<span><span class="ch">' + s.chips + '</span>' + (s.bet ? '<span class="bt">' + s.bet + '</span>' : '') + '</span></div>').join('')
        + '<div class="stt ' + (st.cls || '') + '">' + st.text + '</div>'
        + '<div class="cards">' + (v.hole ? cardTxt(v.hole[0]) + cardTxt(v.hole[1]) : (v.inHand ? cardTxt(null) + cardTxt(null) : '<span style="font-size:12px;color:#9aa79c">not in this hand</span>'))
        + (v.board.length ? '<span style="margin:0 4px;color:#8fa08c">|</span>' + v.board.map(cardTxt).join('') : '') + '</div>'
        + '<div class="pot">pot ' + pot + (v.bet ? ' · to call ' + v.bet : ' · nobody to beat') + (mine ? ' · your chips ' + mine.chips : '') + '</div>'
        + (winTxt(v) ? '<div class="pot" style="color:#ffd23f">' + winTxt(v) + '</div>' : '')
        + '<div class="lg">' + v.log.map(esc).join('<br>') + '</div>'
        + '<div class="btns">' + (v.myTurn ? '<button class="btn" data-a="fold">Fold</button>'
          + '<button class="btn" data-a="' + (v.call > 0 ? 'call' : 'check') + '">' + (v.call > 0 ? 'Call ' + v.call : 'Check') + '</button>'
          + (amounts.length ? '<button class="btn" data-r>Raise</button><button class="btn" data-a="allin">All-in</button>' : '') : '')
        + '<button class="btn" data-a="stand">' + (v.inHand && !v.open ? 'Fold & stand' : 'Stand up') + '</button></div>'
        + '<div class="rz' + (raise ? ' on' : '') + '" data-rz>' + amounts.map(n => '<button class="btn" data-to="' + n + '">' + n + '</button>').join(' ') + '</div>';
      for (const b of box.querySelectorAll('[data-a]')) b.onclick = () => { const a = b.dataset.a; raise = false; if (a === 'stand') { if (cb && cb.stand) cb.stand(); } else if (cb && cb.act) cb.act(a); api.sfx && api.sfx('click'); };
      const r = box.querySelector('[data-r]'); if (r) r.onclick = () => { raise = !raise; draw(); };
      for (const b of box.querySelectorAll('[data-to]')) b.onclick = () => { raise = false; if (cb && cb.act) cb.act('raise', b.dataset.to | 0); api.sfx && api.sfx('click'); };
    }
    function pokerOpen(v, callbacks) { cb = callbacks || null; view = v; raise = false; if (!box) box = el('pokerp felt ui', ui); ui.classList.add('poker'); draw(); }
    function pokerUpdate(v) { if (!box) return; view = v; draw(); }
    function pokerClose() { ui.classList.remove('poker'); if (box) { box.remove(); box = null; } view = null; cb = null; raise = false; }
    K.pokerOpen = pokerOpen; K.pokerUpdate = pokerUpdate; K.pokerClose = pokerClose;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudpoker', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
