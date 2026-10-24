/* ASHVALE 3D HUD: THE SALTMERE LINKS (2026-10-19: "a custom game hud that loads when you start a game of golf").
   While you play a round the Ashvale HUD steps aside (the chat stays, small, at the top) and the golf HUD takes over: the
   hole card (hole, par, yards, stroke, score, to the pin), the wind, the hole's mini map, the lie, the club card, aim and
   spin (or the short / long putt) buttons, and the swing meter: it runs right to left for the power (a gold MAX zone,
   wider with better clubs) and back for the strike (the green sweet spot on the line at the right). Big words flash in
   the middle (NICE SHOT, BIRDIE). The scorecard shows the whole group.
   install(K) adds K.golfOpen(cb) -> els, K.golfFlash(text, kind, ms), K.golfCard(html, buttons, pick), K.golfCardClose(),
   K.golfClose(). The engine part (engolf.js) fills the elements. */
(function (G) {
  'use strict';
  const CSS = `
.ash .lay.golf > .ui:not(.golfp):not(.chatw):not(.help){display:none !important}
.ash .lay.golf .hover{display:none !important}
.ash .lay.golf .chatw{top:calc(8px + env(safe-area-inset-top,0px));bottom:auto;left:50%;right:auto;transform:translateX(-50%);width:min(44vw,420px);pointer-events:none}
.ash .lay.golf .chatw .chat:not(.big){max-height:calc(3*1.3em + 8px);opacity:.92}
.ash .lay.golf .chatw .chatx,.ash .lay.golf .chatw .say,.ash .lay.golf .chatw input,.ash .lay.golf .chatw button{display:none !important}
.ash .golfp{position:absolute;color:#f4efdc;font-family:ui-monospace,Menlo,Consolas,monospace;background:#163024e6;border:2px solid #0a1610;border-radius:10px;box-shadow:0 4px 12px #0007;box-sizing:border-box;pointer-events:auto}
.ash .golfp.top{top:calc(8px + env(safe-area-inset-top,0px));left:calc(8px + env(safe-area-inset-left,0px));padding:6px 10px;font-size:12px;line-height:1.45;min-width:150px}
.ash .golfp.top b{color:#ffe08a;font-size:15px}.ash .golfp.top .hn b{font-size:22px}
.ash .golfp.wind{top:calc(8px + env(safe-area-inset-top,0px));right:calc(8px + env(safe-area-inset-right,0px));width:84px;padding:6px;text-align:center;font-size:11px}
.ash .golfp.wind .dial{width:44px;height:44px;margin:2px auto;border-radius:50%;border:2px solid #8fc49a;position:relative}
.ash .golfp.wind .arrow{position:absolute;left:50%;top:50%;width:0;height:0;margin:-15px 0 0 -7px;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:30px solid #ffe08a;transform-origin:7px 15px}
.ash .golfp.wind .ws{font-size:14px;color:#ffe08a;font-weight:bold}
.ash .golfp.map{top:calc(110px + env(safe-area-inset-top,0px));right:calc(8px + env(safe-area-inset-right,0px));width:84px;height:150px;padding:0;border-radius:8px;overflow:hidden}
.ash .golfp.map canvas{display:block;width:100%;height:100%}
.ash .golfp.tools{left:calc(8px + env(safe-area-inset-left,0px));top:calc(118px + env(safe-area-inset-top,0px));display:flex;gap:4px;padding:3px;background:transparent;border:0;box-shadow:none}
.ash .golfp button{border:2px solid #0a1610;border-radius:9px;background:linear-gradient(#2e5b3f,#1d3a28);color:#f4efdc;font:bold 15px system-ui,sans-serif;min-width:40px;min-height:40px;cursor:pointer;touch-action:none}
.ash .golfp.tools button{font-size:12px;min-height:34px;padding:0 10px}
.ash .golfp.lie{left:calc(8px + env(safe-area-inset-left,0px));bottom:calc(150px + env(safe-area-inset-bottom,0px));padding:4px 10px;font-size:12px;display:flex;gap:10px;align-items:baseline}
.ash .golfp.lie b{color:#ffe08a;font-size:16px}
.ash .golfp.club{left:calc(8px + env(safe-area-inset-left,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:4px;padding:4px}
.ash .golfp.club .cw{text-align:center;min-width:118px}
.ash .golfp.club .cn{font:bold 14px Georgia,serif;color:#cfe9c0}.ash .golfp.club .cd{font-size:15px;color:#ffe08a;font-weight:bold}
.ash .golfp.spin,.ash .golfp.putt{right:calc(8px + env(safe-area-inset-right,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));display:flex;gap:4px;padding:4px}
.ash .golfp.spin button,.ash .golfp.putt button{font-size:12px;min-width:48px}.ash .golfp.putt button{min-width:64px}.ash .golfp.swing.tapin .swingbtn{background:linear-gradient(#3f9a4a,#2f7a3a);color:#fff}
.ash .golfp button.on,.ash .golfp button:active{background:linear-gradient(#5d9a6a,#2e5b3f);color:#fff}
.ash .golfp.aim{right:calc(8px + env(safe-area-inset-right,0px));bottom:calc(146px + env(safe-area-inset-bottom,0px));display:flex;gap:4px;padding:4px}
.ash .golfp.aim button{min-width:52px;font-size:20px}
.ash .golfp.swing{left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom,0px));width:min(94vw,560px);padding:8px;display:flex;gap:8px;align-items:center}
.ash .golfp .meter{position:relative;flex:1;height:34px;border-radius:6px;background:linear-gradient(90deg,#0a1610,#14301f);border:2px solid #000;overflow:hidden;cursor:pointer;touch-action:none}
.ash .golfp .meter.live{outline:2px solid #ffe08a}
.ash .golfp .meter i{position:absolute;top:0;bottom:0;display:block}
.ash .golfp .meter .fill{background:linear-gradient(270deg,#e8c13a,#d64b3a)}
.ash .golfp .meter .sweet{background:#4fbf3acc;border-left:2px solid #b8f5a0;border-right:2px solid #b8f5a0;box-sizing:border-box;z-index:1}   /* over the power fill: the whole strike zone shows, its centre line in the middle */
.ash .golfp .meter .zero{width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 0 1px #0a1610;z-index:2}   /* the strike's centre line: on it the ball flies straight (the operator) */
/* gmark, never mark: hudart's .ash .mark (the hit markers) fades out in 0.45 s and took the meter's marker with it (the operator: no accuracy stroke) */
.ash .golfp .meter .gmark{top:0;bottom:0;width:6px;margin-left:-3px;background:#fff;border:1px solid #000;box-sizing:border-box;box-shadow:0 0 6px #fff;z-index:3}
.ash .golfp .meter .pow{width:3px;margin-left:-1px;background:#ff5a3a}
.ash .golfp .meter .max{background:#ffe08acc;box-shadow:0 0 5px #ffe08a;border-left:1px solid #fff6c8;border-right:1px solid #fff6c8;box-sizing:border-box}
.ash .golfp .meter .max::after{content:'MAX';position:absolute;top:1px;left:calc(100% + 3px);font-size:9px;color:#ffe08a;font-style:normal}
.ash .golfp .meter .pin{width:2px;margin-left:-1px;background:#ff4a3a}
.ash .golfp .meter .pin::before{content:'';position:absolute;top:0;left:2px;border-left:9px solid #ff4a3a;border-top:5px solid transparent;border-bottom:5px solid transparent}
.ash .golfp .meter .lab{position:absolute;left:42%;top:8px;font-size:11px;color:#fff9;text-shadow:0 1px 2px #000;font-style:normal}
.ash .golfp.swing.off,.ash .golfp.club.off,.ash .golfp.aim.off,.ash .golfp.spin.off,.ash .golfp.putt.off{opacity:.45}
.ash .golfp.waitm{left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));padding:5px 14px;font:bold 15px Georgia,serif;color:#ffe08a;white-space:nowrap;display:none;pointer-events:none}
.ash .golfp .swingbtn{min-width:96px;min-height:48px;border-radius:12px;background:linear-gradient(#e0b13a,#b07d1c);color:#21160a;font:bold 17px Georgia,serif}
.ash .golfp.flashes{left:50%;top:28%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;background:none;border:0;box-shadow:none}
.ash .golfp .flash{font:bold 34px Georgia,serif;color:#fff6c8;text-shadow:0 3px 0 #0a140f,0 0 18px #000;white-space:nowrap;animation:golff 1.2s ease-out}
.ash .golfp .flash.small{font-size:20px}.ash .golfp .flash.good{color:#c8f7a8}.ash .golfp .flash.bad{color:#ffb3a3}
@keyframes golff{0%{opacity:0;transform:scale(.8)}15%{opacity:1;transform:scale(1.06)}30%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.ash .golfp .flash{animation:none}}
.ash .golfp.card{left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,540px);padding:12px 14px;max-height:88vh;overflow:auto;z-index:5}
.ash .golfp.card h3{margin:0 0 8px;font:bold 20px Georgia,serif;color:#cfe9c0;text-align:center}
.ash .golfp.card p{margin:6px 0;font:14px Georgia,serif;color:#e4f0dc;text-align:center}
.ash .golfp.card table{border-collapse:collapse;width:100%;margin-bottom:8px;font-size:12px}
.ash .golfp.card td,.ash .golfp.card th{border:1px solid #2c4a37;text-align:center;padding:3px 0}.ash .golfp.card th{color:#8fc49a;max-width:70px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ash .golfp.card td.u{color:#c8f7a8;font-weight:bold}.ash .golfp.card td.o{color:#ffb3a3}
.ash .golfp.card .btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.ash .golfp.card .btns button{flex:1 1 40%;min-height:42px;font:bold 14px Georgia,serif}
@media (max-width:560px){.ash .golfp.club .cw{min-width:92px}.ash .golfp.club .cn{font-size:12px}.ash .golfp .flash{font-size:26px}.ash .golfp .swingbtn{min-width:76px}.ash .lay.golf .chatw{display:none}}
`;
  function install(K) {
    const { el, ui } = K;
    if (!document.getElementById('ash-golf-css')) { const s = document.createElement('style'); s.id = 'ash-golf-css'; s.textContent = CSS; document.head.appendChild(s); }
    let nodes = [], card = null, flashes = null;
    const stop = e => e.stopPropagation();
    function part(cls, html) { const n = el('golfp ' + cls + ' ui', ui); if (html) n.innerHTML = html; for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'wheel']) n.addEventListener(t, stop, { passive: true }); nodes.push(n); return n; }
    function golfOpen(cb) {
      golfClose(); ui.classList.add('golf');
      const E = {};
      E.top = part('top'); E.wind = part('wind', '<div>WIND</div><div class="dial"><div class="arrow"></div></div><div class="ws"></div>');
      E.mapBox = part('map', '<canvas width="84" height="150"></canvas>'); E.map = E.mapBox.querySelector('canvas');
      E.tools = part('tools', '<button data-a="card">Scorecard</button><button data-a="quit">Leave</button>');
      E.lie = part('lie'); E.club = part('club', '<button data-a="prev" aria-label="Longer club">&#9664;</button><div class="cw"><div class="cn"></div><div class="cd"></div></div><button data-a="next" aria-label="Shorter club">&#9654;</button>');
      E.aim = part('aim', '<button data-a="aimL" aria-label="Aim left">&#8630;</button><button data-a="aimR" aria-label="Aim right">&#8631;</button>');
      E.spin = part('spin', '<button data-s="top">Top</button><button data-s="none">None</button><button data-s="back">Back</button>');
      E.putt = part('putt', '<button data-r="short">Short</button><button data-r="long">Long</button>');
      E.swing = part('swing', '<div class="meter"><i class="sweet"></i><i class="fill"></i><i class="zero"></i><i class="max"></i><i class="pin"></i><i class="pow"></i><i class="gmark"></i><i class="lab"></i></div><button class="swingbtn">SWING</button>');
      E.waitMsg = part('waitm');   /* a group's turns: Waiting: <name> is playing */
      E.flashes = flashes = part('flashes');
      for (const k of ['sweet', 'fill', 'zero', 'max', 'pin', 'pow', 'mark', 'lab']) E[k] = E.swing.querySelector('.' + (k === 'mark' ? 'gmark' : k));
      E.meter = E.swing.querySelector('.meter'); E.swingBtn = E.swing.querySelector('.swingbtn');
      const down = (n, f) => n.addEventListener('pointerdown', e => { e.preventDefault(); f(e); });
      down(E.swingBtn, () => cb.press()); down(E.meter, () => cb.press());
      E.club.addEventListener('click', e => { const b = e.target.closest('button'); if (b) cb.club(b.dataset.a === 'prev' ? -1 : 1); });
      for (const b of E.aim.querySelectorAll('button')) {
        const d = b.dataset.a === 'aimL' ? -1 : 1;
        down(b, e => { cb.aimHold(d); try { b.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } });
        for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, () => cb.aimHold(0));
      }
      E.spin.addEventListener('click', e => { const b = e.target.closest('button'); if (b) cb.spin(b.dataset.s); });
      E.putt.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.r === 'tap') cb.tap(); else cb.range(b.dataset.r); });
      E.tools.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'card') cb.card(); else cb.quit(); });
      return E;
    }
    function golfFlash(text, kind, ms) {
      if (!flashes) return;
      const f = document.createElement('div'); f.className = 'flash ' + (kind || ''); f.textContent = text; flashes.appendChild(f); setTimeout(() => f.remove(), ms || 1300);
    }
    /* a card in the middle: the scorecard, the group's lobby, the end of the round. buttons [{id, label}] -> pick(id) */
    function golfCard(html, buttons, pick) {
      golfCardClose();
      card = el('golfp card ui', ui);
      for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend']) card.addEventListener(t, stop, { passive: true });
      card.innerHTML = html + '<div class="btns">' + (buttons || []).map(b => '<button data-id="' + b.id + '">' + b.label + '</button>').join('') + '</div>';
      card.addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (!b) return; const id = b.dataset.id; if (pick) pick(id); });
      const first = card.querySelector('button'); if (first) first.focus();
      return card;
    }
    function golfCardClose() { if (card) { card.remove(); card = null; } }
    function golfClose() {
      for (const n of nodes) n.remove(); nodes = []; flashes = null; golfCardClose();
      ui.classList.remove('golf');
    }
    Object.assign(K, { golfOpen, golfFlash, golfCard, golfCardClose, golfClose, golfCardOpen: () => !!card });
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudgolf', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
