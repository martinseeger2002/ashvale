/* ASHVALE Atlas: ground-level HUD (module roamhud, api 1). DOM only, no three.js; the game's stone-panel look.
     const H = roamhud.create(host, {onAction(id)})
     H.setInfo({cell, cls, biome, face, x, y, lat, lon, tile, h})   the readout (parcel id, class, face, lat/lon, planar x/y)
     H.toast(text)  H.marker(x, y)  H.setButton(id, label)  H.show(on)  H.fade(opacity, seconds, done)  H.el
   Buttons send their ids to onAction: fly (Fly up), lines (Parcels: on/off), run (Run), random (Random parcel), core. */
(function (root) {
  'use strict';
  const META = { api: 1, v: 1 };
  const C = { gold: '#ffcf3f', orange: '#ff981f', stone1: '#4a4034', stone2: '#3a3127', edge: '#1b1610', rim: '#6b5d48' };
  function create(host, opts) {
    const O = opts || {};
    if (!document.getElementById('atlas-hud-css')) {
      const css = document.createElement('style'); css.id = 'atlas-hud-css';
      css.textContent =
        '.ah{position:absolute;inset:0;pointer-events:none;font:600 13px/1.3 "Trebuchet MS",Verdana,system-ui,sans-serif;color:' + C.gold + ';-webkit-user-select:none;user-select:none}' +
        '.ah .stone{background:linear-gradient(' + C.stone1 + ',' + C.stone2 + ');border:2px solid ' + C.edge + ';box-shadow:inset 0 0 0 1px ' + C.rim + ',0 2px 6px #0008;border-radius:6px;pointer-events:auto}' +
        '.ah .title{position:absolute;left:12px;top:max(10px,env(safe-area-inset-top));padding:6px 10px;font:700 15px Georgia,serif;color:' + C.orange + '}' +
        '.ah .title small{display:block;font:600 11px "Trebuchet MS",Verdana,sans-serif;color:#c8b48a}' +
        '.ah .info{position:absolute;left:12px;top:calc(max(10px,env(safe-area-inset-top)) + 52px);padding:6px 9px;font-weight:400;color:#f3e6c4;min-width:170px}' +
        '.ah .info dl{display:grid;grid-template-columns:auto 1fr;gap:1px 9px;margin:0}.ah .info dt{color:#c8b48a}.ah .info dd{margin:0;color:' + C.gold + ';white-space:nowrap}' +
        '.ah .btns{position:absolute;right:12px;bottom:max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;align-items:stretch}' +
        '.ah .btn{min-width:44px;min-height:40px;padding:6px 10px;background:linear-gradient(#5a4c3a,#433829);border:1px solid ' + C.edge + ';box-shadow:inset 0 0 0 1px #7b6b52;border-radius:5px;color:' + C.gold + ';font:inherit;cursor:pointer;pointer-events:auto}' +
        '.ah .btn:active{background:linear-gradient(#7a3a22,#5a2a18)}.ah .btn.on{color:#fff;box-shadow:inset 0 0 0 1px ' + C.orange + '}' +
        '.ah .toast{position:absolute;left:50%;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 4px);transform:translateX(-50%);padding:6px 12px;max-width:min(70vw,420px);text-align:center;opacity:0;transition:opacity .3s;color:#f3e6c4}' +
        '.ah .mark{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #ffde4a;border-radius:50%;opacity:0;transition:opacity .5s, transform .5s}' +
        '.ah .fade{position:absolute;inset:0;background:#a7c8e6;opacity:0;pointer-events:none}' +
        '@media (max-width:520px){.ah .info{font-size:12px;min-width:0}.ah .btn{min-height:38px;padding:5px 8px}}';
      document.head.appendChild(css);
    }
    const el = document.createElement('div'); el.className = 'ah'; host.appendChild(el);
    el.innerHTML = '<div class="title stone">ASHVALE Atlas<small>walking the globe</small></div><div class="info stone"></div>' +
      '<div class="btns"><button class="btn" data-a="fly">Fly up</button><button class="btn" data-a="lines">Parcels: off</button><button class="btn" data-a="run">Run</button>' +
      '<button class="btn" data-a="random">Random</button><button class="btn" data-a="core">Core</button></div><div class="toast stone"></div><div class="mark"></div>';
    const info = el.querySelector('.info'), tst = el.querySelector('.toast'), mk = el.querySelector('.mark');
    el.querySelector('.btns').addEventListener('click', e => { const a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (a && O.onAction) O.onAction(a); });
    const f2 = (v, n) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(n);
    let lastHtml = '';
    function setInfo(s) {
      const html = '<dl><dt>parcel</dt><dd>' + s.cell + ' &middot; ' + s.cls + '</dd><dt>ground</dt><dd>' + s.biome + ' &middot; ' + s.tile + '</dd>' +
        '<dt>face</dt><dd>' + s.face + '</dd><dt>lat / lon</dt><dd>' + f2(s.lat, 4) + '&deg;, ' + f2(s.lon, 4) + '&deg;</dd>' +
        '<dt>planar</dt><dd>' + f2(s.x, 1) + ', ' + f2(s.y, 1) + ' m</dd><dt>height</dt><dd>' + f2(s.h, 1) + ' m</dd></dl>';
      if (html !== lastHtml) { info.innerHTML = html; lastHtml = html; }
    }
    let tT = 0;
    function toast(t) { tst.textContent = t; tst.style.opacity = '1'; clearTimeout(tT); tT = setTimeout(() => { tst.style.opacity = '0'; }, 2200); }
    function marker(x, y) { const r = host.getBoundingClientRect(); mk.style.left = (x - r.left) + 'px'; mk.style.top = (y - r.top) + 'px'; mk.style.transition = 'none'; mk.style.opacity = '1'; mk.style.transform = 'scale(1)'; void mk.offsetWidth; mk.style.transition = ''; mk.style.opacity = '0'; mk.style.transform = 'scale(1.8)'; }
    function setButton(id, label, on) { const b = el.querySelector('[data-a="' + id + '"]'); if (b) { b.textContent = label; b.classList.toggle('on', !!on); } }
    function show(on) { el.style.display = on ? '' : 'none'; }
    return { api: 1, el, setInfo, toast, marker, setButton, show };
  }
  /* a full-window fade used by the Atlas shell for the planet <-> ground transition */
  function fader(host) {
    const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0;background:#a7c8e6;opacity:0;pointer-events:none;z-index:20;transition:none'; host.appendChild(d);
    return function fade(op, sec, done) { d.style.transition = 'opacity ' + sec + 's linear'; void d.offsetWidth; d.style.opacity = String(op); setTimeout(() => { if (done) done(); }, sec * 1000 + 30); };
  }
  const api = { api: 1, create, fader };
  if (root.ASH3D && root.ASH3D.define) root.ASH3D.define('roamhud', META, () => api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
