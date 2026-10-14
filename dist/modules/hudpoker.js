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
.ash .lay.poker .chatw{top:calc(6px + env(safe-area-inset-top,0px));bottom:auto;left:8px;right:8px;width:auto;max-width:560px}
.ash .lay.poker .chatw .chat:not(.big){max-height:calc(3*1.3em + 10px)}
.ash .lay.poker .chatw .chatx{top:auto;bottom:-24px;border-radius:0 0 6px 6px}
.ash .pokerp{position:absolute;color:#eee;font-size:13px;line-height:1.35;background:linear-gradient(#2b3a33f0,#1b241ff0);border:2px solid #12181a;border-radius:8px;box-shadow:0 4px 14px #0008;pointer-events:auto;box-sizing:border-box}
.ash .pokerp.bar{display:flex;flex-direction:column;left:50%;transform:translateX(-50%);bottom:0;width:min(100vw,680px);border-radius:10px 10px 0 0;border-bottom:0;padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px));max-height:62vh;overflow-y:auto;touch-action:pan-y}
.ash .pokerp.hole,.ash .pokerp.board{transform:translate(-50%,-50%);padding:5px 7px;white-space:nowrap;text-align:center;opacity:.97}
.ash .pokerp.board{white-space:normal;width:max-content;max-width:min(92vw,420px)}
.ash .pokerp.board .brd,.ash .pokerp.hole .cards{white-space:nowrap}   /* [Claude 2026-10-14] five cards in one row: a box placed by its centre was only given the width to the screen's edge (the operator: the river dropped below) */
.ash .pokerp .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.ash .pokerp .stt{color:#ffd23f;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ash .pokerp .stt.wait{color:#9fc3ff}
.ash .pokerp .pot{color:#c8c3b4;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;white-space:nowrap}
.ash .pokerp .pls{display:flex;flex-shrink:0;gap:4px;overflow-x:auto;margin:4px 0 0;scrollbar-width:none}
.ash .pokerp .pl{flex:0 0 auto;display:flex;gap:5px;align-items:center;padding:2px 7px;border-radius:12px;background:#0004;font-size:12px}
.ash .pokerp .pl.turn{background:#ffd23f22;box-shadow:inset 0 0 0 1px #ffd23f88}
.ash .pokerp .pl.out{opacity:.45}
.ash .pokerp .pl b{font-weight:normal;color:#cbd6cd}
.ash .pokerp .pl .ch{font-family:ui-monospace,Menlo,Consolas,monospace;color:#e8e2d0}
.ash .pokerp .pl .bt{color:#ffd23f}
.ash .pokerp .pl .d{display:inline-block;width:13px;height:13px;border-radius:50%;background:#f2eee0;color:#26302a;font-size:9px;font-weight:bold;text-align:center;line-height:13px}
.ash .pokerp .cd{display:inline-block;min-width:22px;padding:2px 4px;margin:0 2px;background:#f4f1e8;color:#20202a;border-radius:4px;box-shadow:0 1px 2px #0007;font-size:16px;font-weight:bold;text-align:center}
.ash .pokerp .cd.r{color:#b23a30}
.ash .pokerp .cd.b{background:repeating-linear-gradient(45deg,#3a5f86,#3a5f86 3px,#2b4a6b 3px,#2b4a6b 6px);color:transparent}
.ash .pokerp.hole .cd{font-size:22px;min-width:30px;padding:4px 6px}
.ash .pokerp .lab{font-size:10px;color:#9aa79c;letter-spacing:.5px}
.ash .pokerp .btns{display:flex;gap:6px;margin-bottom:4px}
.ash .pokerp.bar > .rz{order:0}.ash .pokerp.bar > .btns{order:1}.ash .pokerp.bar > .top{order:2}.ash .pokerp.bar > .pls{order:3}.ash .pokerp.bar > .away{order:4}   /* [Claude 2026-10-14] the operator: the buttons on top, the reading of the table under them */
.ash .pokerp .btns .btn{flex:1 1 0;width:auto;margin:0;padding:9px 4px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ash .pokerp .btns .btn.sm{flex:0 0 auto;padding:9px 10px;opacity:.85}
.ash .pokerp .rz{display:none;margin-bottom:4px;padding:6px;background:#0005;border-radius:6px}
.ash .pokerp .rz.on{display:block}
.ash .pokerp .win{margin:2px 0;color:#ffe9a0;font:bold 14px Georgia,serif;line-height:1.3}
.ash .pokerp .sd{margin:3px 0;font-size:12px;color:#d9d3c2}
.ash .pokerp .sd .cd{font-size:13px;min-width:18px}
.ash .pokerp .sd b{color:#ffd23f;font-weight:normal}
.ash .pokerp .away{color:#9fc3ff;font-size:12px;margin-top:3px}
.ash .pokerp .rz .amt{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#ffd23f}
.ash .pokerp .rz input[type=range]{width:100%;margin:4px 0;accent-color:#ffd23f}
.ash .pokerp .rz .qk{display:flex;gap:4px;flex-wrap:wrap}
.ash .pokerp .rz .qk .btn{width:auto;padding:6px 8px;font-size:13px;margin:0}
@media (pointer:coarse),(max-width:600px){.ash .pokerp{font-size:14px}.ash .pokerp .btns .btn{padding:12px 4px;font-size:15px}.ash .pokerp .btns .btn.sm{padding:12px 10px}.ash .pokerp .pl{font-size:13px}}
@media (max-height:520px){.ash .pokerp .rz.on{display:flex;align-items:center;gap:8px;padding:4px 6px}.ash .pokerp .rz .amt{margin:0;gap:6px;white-space:nowrap}.ash .pokerp .rz input[type=range]{flex:1;min-width:80px;margin:0}.ash .pokerp .rz .qk{flex-wrap:nowrap}.ash .pokerp .rz .qk .btn[data-to]{margin-left:4px !important}.ash .pokerp.bar{padding-top:4px;max-height:70vh}.ash .pokerp .pls{margin:2px 0}.ash .pokerp .btns .btn{padding:8px 4px}.ash .pokerp.hole .cd{font-size:18px;min-width:24px;padding:2px 4px}.ash .lay.poker .chatw{right:auto;width:min(46vw,420px)}.ash .lay.poker .chatw .chat:not(.big){max-height:calc(2*1.3em + 10px)}}`;
/* [Claude 2026-10-11] a slider from the least raise to all-in; the showdown shows every hand face up with its name and says
   plainly who won what with which hand.
   [Claude 2026-10-14] the operator, on a phone: "I have to scroll down to use [the controls]", and in landscape they could not be
   reached at all. Now three pieces: the betting bar along the bottom (status, players, buttons - never scrolled to), your two
   cards in a small box over where they lie on the felt (on the felt they stay face down), and the board in a box over the
   middle of the felt; the chat moves to the top. The engine hands the felt's screen spots every frame (pokerAnchor). */
  const RANK = '23456789TJQKA', SUIT = ['♣', '♦', '♥', '♠'], RED = [0, 1, 1, 0];
  const STREET = { none: 'between hands', preflop: 'the first round', flop: 'the flop', turn: 'the turn', river: 'the river' };
  function cardTxt(id) { return id == null ? '<span class="cd b">•</span>' : '<span class="cd' + (RED[id & 3] ? ' r' : '') + '">' + RANK[(id >> 2) % 13] + SUIT[id & 3] + '</span>'; }
  function install(K) {
    const { api, el, ui, A } = K, esc = A.esc;
    if (!document.getElementById('ash-poker-css')) { const st = document.createElement('style'); st.id = 'ash-poker-css'; st.textContent = CSS; document.head.appendChild(st); }
    let box = null, cb = null, view = null, raise = false, raiseTo = null;
    function statusOf(v) {
      if (v.open) return { cls: 'wait', text: v.seats.length > 1 ? 'The table is dealing the next hand' : 'Waiting for players to take chairs' };
      const t = v.seats.find(s => s.ref === v.turn);
      if (v.myTurn && v.pending) return { cls: 'wait', text: 'Sent - waiting for the table…' };   /* [Claude 2026-10-13] */
      if (v.myTurn) return { text: 'Your turn' + (v.call > 0 ? ' — call ' + Math.min(v.call, v.stack) + (v.call > v.stack ? ' (all-in)' : '') : ' — check') };
      if (v.inHand && v.call > 0 && t) return { cls: 'wait', text: esc(t.name) + (t.allin ? ' is all-in' : ' bets ' + v.bet) };
      if (t) return { cls: 'wait', text: esc(t.name) + ' to act' };
      return { cls: 'wait', text: (STREET[v.street] || v.street || '') + (v.hand ? ' — hand ' + v.hand : '') };
    }
    function handName(v, ref) { const h = (v.shown || []).find(x => x.ref === ref); return h ? h.name : ''; }
    function winTxt(v) {
      if (!v.result || !(v.result.p || []).length) return '';
      const bits = [];
      for (const q of v.result.p) {
        const ws = v.seats.filter(s => (q[1] || []).indexOf(s.ref) >= 0), ns = ws.map(s => esc(s.name)); if (!ns.length) continue;
        const hn = ws.length ? handName(v, ws[0].ref) : '';
        bits.push(ns.join(' & ') + (ns.length > 1 ? ' split ' : ' win' + (ns.length > 1 ? '' : 's') + ' ') + q[0] + ' GOLD' + (hn ? ' with ' + esc(hn) : v.result.c ? '' : ' — everyone else folded'));
      }
      return bits.join('. ');
    }
    function showdownHtml(v) {
      if (!v.shown || !v.shown.length) return '';
      const wins = v.winners || [];
      return v.shown.map(h => { const s = v.seats.find(x => x.ref === h.ref); return '<div class="sd">' + (wins.indexOf(h.ref) >= 0 ? '&#9733; ' : '') + esc(s ? s.name : 'seat ' + (h.ref + 1)) + ': ' + cardTxt(h.c[0]) + cardTxt(h.c[1]) + ' <b>' + esc(h.name) + '</b></div>'; }).join('');
    }
    let hbox = null, bbox = null, anchor = null;
    function draw() {
      if (!box || !view) return;
      const v = view, you = (s) => s.id === v.me, pot = v.pot, st = statusOf(v);
      const mine = v.seats.filter(s => you(s))[0] || null;
      const hi = v.bet + (mine ? mine.chips : 0), lo = Math.min(Math.max(v.min || (v.bet ? v.bet * 2 : 100), v.bet + 1), hi), potR = Math.min(hi, Math.max(lo, v.bet + pot));
      const canRaise = hi > v.bet && lo <= hi, amounts = canRaise ? [lo] : [];
      if (raiseTo == null || raiseTo < lo || raiseTo > hi) raiseTo = lo;
      const act = v.myTurn && !v.pending;
      if (!act) raise = false;
      box.innerHTML = '<div class="top"><span class="stt ' + (st.cls || '') + '">' + st.text + '</span>'
        + '<span class="pot">' + (v.buy ? v.buy.toLocaleString() + ' buy-in · ' : 'free chips · ') + 'pot ' + pot + (v.inHand && v.call > 0 ? ' · owe ' + Math.min(v.call, v.stack) : '') + '</span></div>'
        + '<div class="pls">' + v.seats.map(s => '<div class="pl' + (v.turn === s.ref && !v.open ? ' turn' : '') + (((s.folded || !s.dealt) && !v.open) ? ' out' : '') + '">'
          + (v.dealer === s.ref ? '<i class="d">D</i>' : '') + '<b>' + esc(s.name) + (you(s) ? ' <span style="color:#9fc3ff">(you)</span>' : '') + (s.away ? ' <span style="color:#9aa79c">(away)</span>' : '') + '</b>'
          + '<span class="ch">' + s.chips + '</span>' + (s.bet ? '<span class="bt">' + s.bet + '</span>' : '') + '</div>').join('') + '</div>'
        + (v.away ? '<div class="away">You are dealt out (a minute on your hand). Tap I\'m back.</div>' : '')
        + '<div class="rz' + (raise && amounts.length ? ' on' : '') + '" data-rz><div class="amt"><span>raise to</span><span data-amt>' + raiseTo + '</span></div>'
        + '<input type="range" min="' + lo + '" max="' + hi + '" step="1" value="' + raiseTo + '" data-sl>'
        + '<div class="qk"><button class="btn" data-q="' + lo + '">min ' + lo + '</button>' + (potR > lo && potR < hi ? '<button class="btn" data-q="' + potR + '">pot ' + potR + '</button>' : '') + '<button class="btn" data-q="' + hi + '">all-in ' + hi + '</button>'
        + '<button class="btn" data-to style="margin-left:auto;background:#5a4a1c;color:#ffe2a8">Raise to <span data-amt2>' + raiseTo + '</span></button></div></div>'
        + '<div class="btns">' + (v.away ? '<button class="btn" data-a="back">I\'m back</button>' : '') + (act ? '<button class="btn" data-a="fold">Fold</button>'
          + '<button class="btn" data-a="' + (v.call > 0 ? 'call' : 'check') + '">' + (v.call > 0 ? (v.call >= v.stack ? 'Call all-in ' + v.stack : 'Call ' + v.call) : 'Check') + '</button>'
          + (amounts.length ? '<button class="btn" data-r>' + (raise ? 'Cancel' : 'Raise') + '</button>' : '') : '')   /* [Claude 2026-10-14] no All-in here (the operator): slide to all-in, or its quick button, then the raise button */
        + '<button class="btn' + (act || v.away ? ' sm' : '') + '" data-a="stand">' + (act || v.away ? 'Stand' : v.inHand && !v.open ? 'Fold & stand up' : 'Stand up') + '</button></div>';
      for (const b of box.querySelectorAll('[data-a]')) b.onclick = () => { const a = b.dataset.a; raise = false; if (a === 'stand') { if (cb && cb.stand) cb.stand(); } else if (cb && cb.act) cb.act(a); api.sfx && api.sfx('click'); };
      const r = box.querySelector('[data-r]'); if (r) r.onclick = () => { raise = !raise; draw(); };
      const sl = box.querySelector('[data-sl]'), amt = box.querySelector('[data-amt]'), amt2 = box.querySelector('[data-amt2]');
      if (sl) { sl.oninput = () => { raiseTo = sl.value | 0; if (amt) amt.textContent = raiseTo; if (amt2) amt2.textContent = raiseTo; }; sl.onpointerdown = (e) => e.stopPropagation(); }
      for (const b of box.querySelectorAll('[data-q]')) b.onclick = () => { raiseTo = b.dataset.q | 0; if (sl) sl.value = raiseTo; if (amt) amt.textContent = raiseTo; if (amt2) amt2.textContent = raiseTo; };
      const goTxt = () => (raiseTo | 0) >= hi ? 'All-in ' + hi : 'Raise to ' + raiseTo, go = box.querySelector('[data-to]');
      const syncGo = () => { if (go) go.textContent = goTxt(); };
      if (sl) sl.addEventListener('input', syncGo); for (const b of box.querySelectorAll('[data-q]')) b.addEventListener('click', syncGo); syncGo();
      if (go) go.onclick = () => { raise = false; const all = (raiseTo | 0) >= hi; if (cb && cb.act) { if (all) cb.act('allin'); else cb.act('raise', raiseTo | 0); } api.sfx && api.sfx('click'); };   /* the slider at its end is all-in */
      /* your two cards, over where they lie on the felt; the board (and between hands, who won) over the middle */
      const holeHtml = v.hole ? '<div class="cards">' + cardTxt(v.hole[0]) + cardTxt(v.hole[1]) + '</div>' : '';
      if (holeHtml) { if (!hbox) hbox = el('pokerp hole ui', ui); if (hbox.innerHTML !== holeHtml) hbox.innerHTML = holeHtml; } else if (hbox) { hbox.remove(); hbox = null; }
      const w = v.open ? winTxt(v) : '';   /* a result only between hands: once the next hand is dealt it is gone (2026-10-14) */
      const boardHtml = (v.board.length ? '<div class="brd">' + v.board.map(cardTxt).join('') + '</div>' : '') + (w ? '<div class="win">' + w + '</div>' + showdownHtml(v) : '');
      if (boardHtml) { if (!bbox) bbox = el('pokerp board ui', ui); if (bbox.innerHTML !== boardHtml) bbox.innerHTML = boardHtml; } else if (bbox) { bbox.remove(); bbox = null; }
      place();
    }
    /* keep a floating box at its felt spot, inside the screen and clear of the chat (top) and the bar (bottom) */
    function put(b, at, fx, fy) {
      if (!b) return;
      const W = ui.clientWidth || innerWidth, H = ui.clientHeight || innerHeight, bw = b.offsetWidth, bh = b.offsetHeight;
      const ch = document.querySelector('.ash .lay.poker .chatw'), topMin = ch ? ch.getBoundingClientRect().bottom - ui.getBoundingClientRect().top + 4 : 0;
      const botMax = box ? H - box.offsetHeight - 4 : H;
      let x = at ? at.x : W * fx, y = at ? at.y : H * fy;
      x = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, x));
      y = Math.max(topMin + bh / 2, Math.min(botMax - bh / 2, y));
      const L = Math.round(x) + 'px', T = Math.round(y) + 'px';
      if (b.style.left !== L) b.style.left = L; if (b.style.top !== T) b.style.top = T;
    }
    function place() {
      put(hbox, anchor && anchor.hole, 0.5, 0.7); put(bbox, anchor && anchor.board, 0.5, 0.45);
      if (hbox && bbox) {   /* a low screen (landscape) squeezes the two together: the board goes up off your cards */
        const ht = hbox.offsetTop - hbox.offsetHeight / 2, bb = bbox.offsetTop + bbox.offsetHeight / 2;
        if (bb > ht - 4 && Math.abs(hbox.offsetLeft - bbox.offsetLeft) < (hbox.offsetWidth + bbox.offsetWidth) / 2) put(bbox, { x: bbox.offsetLeft, y: ht - 4 - bbox.offsetHeight / 2 }, 0.5, 0.45);
      }
    }
    function pokerAnchor(a) { anchor = a || null; if (box) place(); }
    function pokerOpen(v, callbacks) { cb = callbacks || null; view = v; raise = false; if (!box) box = el('pokerp bar ui', ui); ui.classList.add('poker'); draw(); }
    function pokerUpdate(v) { if (!box) return; view = v; draw(); }
    function pokerClose() { ui.classList.remove('poker'); for (const b of [box, hbox, bbox]) if (b) b.remove(); box = hbox = bbox = null; view = null; cb = null; raise = false; anchor = null; }
    K.pokerOpen = pokerOpen; K.pokerUpdate = pokerUpdate; K.pokerClose = pokerClose; K.pokerAnchor = pokerAnchor;
    /* [Claude 2026-10-13] SOLITAIRE at the card table (the operator: "if you right click or long tap on the table you should also have
       the option to play Solitaire"). Klondike, draw one, as many passes through the stock as you like; the cards are the
       felt's own (the scene's card atlas). One tap plays a card where it fits best - up to its foundation if it can go,
       else onto the first column that takes it (with the cards on top of it) - so it plays well on a phone; tap the stock to
       turn a card, tap an empty stock to turn the waste back over. Undo, a new deal, and Finish once every card is face up.
       Pure fun: no GOLD, nothing sent anywhere. */
    const SOL_CSS = `
.ash .solp{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,96vw);max-height:94vh;overflow:auto;z-index:30;padding:10px;border-radius:12px;background:radial-gradient(ellipse at center,#2f6a3f,#1c4128);box-shadow:0 0 0 3px #5b3a1e,0 10px 40px #000c;color:#f2ead2;font:13px system-ui,sans-serif;touch-action:manipulation;user-select:none}
.ash .solp .top{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.ash .solp .top h3{margin:0;font:bold 16px Georgia,serif;flex:1;color:#f4e5b8}
.ash .solp .top .btn{padding:4px 10px;width:auto;margin:0}
.ash .solp .row{position:relative}
.ash .solp .cardx{position:absolute;border-radius:5px;box-shadow:0 1px 3px #0009;background-repeat:no-repeat;cursor:pointer}
.ash .solp .slot{position:absolute;border-radius:5px;border:2px dashed #ffffff40;box-sizing:border-box}
.ash .solp .sel{box-shadow:0 0 0 3px #ffd23f,0 1px 3px #0009}
.ash .solp .msg{text-align:center;margin-top:6px;color:#ffe9a8;min-height:18px}
`;
    if (!document.getElementById('ash-sol-css')) { const st = document.createElement('style'); st.id = 'ash-sol-css'; st.textContent = SOL_CSS; document.head.appendChild(st); }
    const SV = c => { const r = c >> 2; return r === 12 ? 1 : r + 2; }, RD = c => RED[c & 3] === 1;
    let sbox = null, S = null, undo = [], atlas = null, sfx = null, selK = null;
    function solDeal() {
      const d = []; for (let i = 0; i < 52; i++) d.push(i);
      for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
      S = { stock: [], waste: [], found: [[], [], [], []], tab: [], moves: 0, t0: Date.now(), won: false };
      for (let i = 0; i < 7; i++) { S.tab.push([]); for (let k = 0; k <= i; k++) S.tab[i].push({ c: d.pop(), up: k === i }); }
      S.stock = d.map(c => ({ c, up: false })); undo = []; selK = null;
    }
    const snap = () => JSON.stringify(S);
    function push() { undo.push(snap()); if (undo.length > 200) undo.shift(); }
    function canFound(c, f) { const t = f[f.length - 1]; return t ? ((t.c & 3) === (c & 3) && SV(c) === SV(t.c) + 1) : SV(c) === 1; }
    function canTab(c, col) { const t = col[col.length - 1]; return t ? (t.up && RD(t.c) !== RD(c) && SV(c) === SV(t.c) - 1) : SV(c) === 13; }
    function moveCards(from, n, to) { const cs = from.splice(from.length - n, n); to.push(...cs); const f = from[from.length - 1]; if (f && !f.up && from !== S.waste) f.up = true; S.moves++; }
    function play(src, idx) {   /* the one-tap rule: foundation first (a top card), else the first column that takes the run */
      const pile = src === 'w' ? S.waste : src[0] === 't' ? S.tab[+src.slice(1)] : S.found[+src.slice(1)];
      const n = pile.length - idx; if (n <= 0) return false; const c = pile[idx].c;
      if (!pile[idx].up) return false;
      if (n === 1 && src[0] !== 'f') for (const f of S.found) if (canFound(c, f)) { push(); moveCards(pile, 1, f); return true; }
      for (let i = 0; i < 7; i++) { const col = S.tab[i]; if (col === pile) continue; if (canTab(c, col) && !(SV(c) === 13 && idx === 0 && src[0] === 't')) { push(); moveCards(pile, n, col); return true; } }
      return false;
    }
    function finishable() { return !S.stock.length && !S.waste.length && S.tab.every(col => col.every(x => x.up)); }
    function autoFinish() { let go = true; while (go) { go = false; for (const src of ['w', 't0', 't1', 't2', 't3', 't4', 't5', 't6']) { const p = src === 'w' ? S.waste : S.tab[+src.slice(1)]; if (p.length) { const c = p[p.length - 1].c; for (const f of S.found) if (canFound(c, f)) { moveCards(p, 1, f); go = true; break; } } } } }
    function checkWin() { if (!S.won && S.found.every(f => f.length === 13)) { S.won = true; sfx && sfx('level'); } }
    function drawSol() {
      if (!sbox) return;
      const W = Math.min(560, window.innerWidth * 0.96) - 20, gap = Math.max(4, W * 0.012), cw = Math.floor((W - gap * 6) / 7), ch = Math.round(cw * 1.5), fan = Math.round(ch * 0.26), fanD = Math.round(ch * 0.12);
      const bg = c => 'background-image:url(' + atlas + ');background-size:' + (cw * 8) + 'px ' + (ch * 8) + 'px;background-position:-' + ((c % 8) * cw) + 'px -' + (((c / 8) | 0) * ch) + 'px;';
      const card = (c, up, x, y, key, sel) => '<div class="cardx' + (sel ? ' sel' : '') + '" data-k="' + key + '" style="left:' + x + 'px;top:' + y + 'px;width:' + cw + 'px;height:' + ch + 'px;' + bg(up ? c : 63) + '"></div>';
      const slot = (x, y, key, lab) => '<div class="slot" data-k="' + key + '" style="left:' + x + 'px;top:' + y + 'px;width:' + cw + 'px;height:' + ch + 'px;display:flex;align-items:center;justify-content:center;color:#ffffff60;font-size:' + Math.round(cw * 0.35) + 'px">' + (lab || '') + '</div>';
      let h = '', X = i => i * (cw + gap);
      h += S.stock.length ? card(0, false, X(0), 0, 's') : slot(X(0), 0, 's', '&#8635;');
      h += S.waste.length ? card(S.waste[S.waste.length - 1].c, true, X(1), 0, 'w:' + (S.waste.length - 1), selK === 'w:' + (S.waste.length - 1)) : slot(X(1), 0, 'w');
      for (let f = 0; f < 4; f++) { const F = S.found[f]; h += F.length ? card(F[F.length - 1].c, true, X(3 + f), 0, 'f' + f + ':' + (F.length - 1)) : slot(X(3 + f), 0, 'f' + f, SUIT[f]); }
      let maxY = ch;
      for (let i = 0; i < 7; i++) {
        const col = S.tab[i], y0 = ch + gap * 2; let y = y0;
        if (!col.length) h += slot(X(i), y0, 't' + i, 'K');
        col.forEach((x, k) => { h += card(x.c, x.up, X(i), y, 't' + i + ':' + k, selK === 't' + i + ':' + k); y += x.up ? fan : fanD; });
        maxY = Math.max(maxY, y + ch);
      }
      const secs = ((Date.now() - S.t0) / 1000) | 0;
      sbox.innerHTML = '<div class="top"><h3>Solitaire</h3><button class="btn" data-u>Undo</button><button class="btn" data-n>New deal</button>' + (finishable() && !S.won ? '<button class="btn" data-f>Finish</button>' : '') + '<button class="btn" data-x>Close</button></div>'
        + '<div class="row" style="height:' + (maxY + 4) + 'px">' + h + '</div>'
        + '<div class="msg">' + (S.won ? 'You win! ' + S.moves + ' moves in ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') + '. Deal again?' : 'Tap a card to play it where it fits. Tap the deck to turn a card.') + '</div>';
      sbox.querySelector('[data-u]').onclick = () => { if (undo.length) { S = JSON.parse(undo.pop()); selK = null; drawSol(); } };
      sbox.querySelector('[data-n]').onclick = () => { solDeal(); drawSol(); };
      sbox.querySelector('[data-x]').onclick = () => solitaireClose();
      const fb = sbox.querySelector('[data-f]'); if (fb) fb.onclick = () => { push(); autoFinish(); checkWin(); drawSol(); };
      for (const e of sbox.querySelectorAll('[data-k]')) e.onclick = (ev) => { ev.stopPropagation(); tapSol(e.dataset.k); };
    }
    function tapSol(k) {
      if (S.won) return;
      if (k === 's') { push(); if (S.stock.length) { const x = S.stock.pop(); x.up = true; S.waste.push(x); } else { S.stock = S.waste.reverse().map(x => ({ c: x.c, up: false })); S.waste = []; } S.moves++; sfx && sfx('click'); drawSol(); return; }
      const [src, ix] = k.split(':'); if (ix == null) return;
      const pile = src === 'w' ? S.waste : src[0] === 't' ? S.tab[+src.slice(1)] : S.found[+src.slice(1)];
      const i = +ix, x = pile[i];
      if (src[0] === 't' && !x.up && i === pile.length - 1) { push(); x.up = true; drawSol(); return; }
      if (play(src, i)) { sfx && sfx('click'); checkWin(); } else sfx && sfx('miss');
      drawSol();
    }
    function solitaireOpen(o) { atlas = (o && o.atlas) || atlas; sfx = (o && o.sfx) || null; if (!S || S.won) solDeal(); if (!sbox) sbox = el('solp ui', ui); drawSol(); }
    function solitaireClose() { if (sbox) { sbox.remove(); sbox = null; } }
    K.solitaireOpen = solitaireOpen; K.solitaireClose = solitaireClose; K.solitaireOpenNow = () => !!sbox; K._sol = () => S;

  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudpoker', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
