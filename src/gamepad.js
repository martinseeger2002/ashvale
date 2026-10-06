/* ASHVALE 3D gamepad module (api 1): play with a controller (2026-10-04: "Add game pad support to gameplay").
   Standard Gamepad API layout. Polled from the engine's render loop; with no pad present it costs one cheap check a
   second and nothing else (navigator.getGamepads is only read every frame once a pad has shown up).
     const P = ASH3D.get('gamepad').create({ core, pid, hud, host, cam, settings() -> settings, toggle(k), send(cmd),
                                             doAct(option), optionsFor(target), screenOf(kind, id) -> {x, y} client px })
     P.poll(now, dt)   once per frame (before the camera update)
     P.state()         {pad, target, ui, walk}  (tests / debug)
   Mapping (world):
     left stick   walk that way, relative to the camera (8 directions); pushed past 0.9 = run (also: Run setting, L3)
     right stick  orbit the camera; LT / RT zoom out / in
     A            the default option of the selected target (talk, trade, attack, take, chop/mine/fish, climb stairs) -
                  exactly what a left-click on it does; the target is the best one near you and in front of you
     LB / RB      cycle the targets near you (the selected one gets a yellow ring and its option in the hover text)
     X            attack the nearest monster      B  cancel: close a menu / dialogue / shop / panel, else stop
     Y            inventory on / off              Start  help card      Back  Run setting on / off      L3  sprint latch
     D-pad        left / right switch side panels; up / down step into the open panel (an item's A = its options menu)
   Mapping (a menu, dialogue, shop, help card, character creator or panel is focused): D-pad moves a yellow outline
   between its buttons and slots (by screen position), A presses it, B backs out. Walking with the stick leaves a panel.
   Moves are commands to the core like clicks: a held stick keeps one walk target 3 tiles ahead (4 running) and re-issues it as you
   near it or turn, never one command per frame; the target is the farthest open tile on that line (walls, blocked
   tiles, no corner cutting), sliding 45 degrees along a wall when straight ahead is shut. */
(function (G) {
  'use strict';
  const API = 1, DEAD = 0.18, RUN_AT = 0.9, NEAR_R = 9, BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const DIR8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];   /* index = round(angle / 45deg), angle from -y (north) clockwise */
  function create(o) {
    const core = o.core, pid = o.pid, hud = o.hud, host = o.host, cam = o.cam, me = () => core.S.players[pid];
    const nav = G.navigator || {}, has = typeof nav.getGamepads === 'function';
    const st = { pad: null, armed: false, scanT: 0, prev: [], target: null, list: [], listT: 0, ui: null, uiIdx: 0, uiKey: null, uiMem: {}, panelFocus: false, walk: null, sprint: false, usedT: 0, hover: '' };
    let ring = null, toastEl = null, css = false;
    const q = s => host.querySelector(s), shown = e => !!e && e.style.display !== 'none' && e.getClientRects().length > 0;
    function dz(v) { v = +v || 0; return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); }
    function btn(p, i) { const b = p.buttons[i]; return !!b && (typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5); }
    function val(p, i) { const b = p.buttons[i]; return !b ? 0 : typeof b === 'object' ? +b.value || (b.pressed ? 1 : 0) : +b; }
    function toast(t) { if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'gptoast'; toastEl.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);background:#000c;color:#ffe9a8;border:1px solid #8a7650;border-radius:4px;padding:6px 12px;font:600 13px sans-serif;z-index:20;pointer-events:none;transition:opacity .4s'; host.appendChild(toastEl); } toastEl.textContent = t; toastEl.style.opacity = '1'; clearTimeout(toastEl._t); toastEl._t = setTimeout(() => { toastEl.style.opacity = '0'; }, 4000); }
    function ensureCss() { if (css) return; css = true; const s = document.createElement('style'); s.textContent = '.ash .gpf{outline:2px solid #ff0 !important;outline-offset:-2px}.ash .ctx div.opt.gpf{background:#7a6c58}.ash .gpring{position:absolute;width:34px;height:14px;margin:-7px 0 0 -17px;border:2px solid #ff0;border-radius:50%;pointer-events:none;box-shadow:0 0 6px #ff0a;display:none}'; document.head.appendChild(s); }
    function findPad() { let L; try { L = nav.getGamepads(); } catch (e) { return null; } if (!L) return null; for (const p of L) if (p && p.connected !== false && p.buttons && p.buttons.length && p.axes && p.axes.length >= 2) return p; return null; }
    if (has && G.addEventListener) { G.addEventListener('gamepadconnected', () => { st.armed = true; }); G.addEventListener('gamepaddisconnected', () => { st.armed = true; }); }

    /* ---------- walking: the farthest open tile up to AHEAD steps along a direction */
    const M = core.M;
    function stepOk(x, y, dx, dy) {
      const nx = x + dx, ny = y + dy; if (M.inWorld && !M.inWorld(nx, ny)) return false; if (M.blocked(nx, ny)) return false;
      const W = M.wallAt ? (a, b) => M.wallAt(a, b) | 0 : () => 0, edge = (a, b, ex, ey) => { const s = ex === 1 ? 2 : ex === -1 ? 8 : ey === 1 ? 4 : 1, t = ex === 1 ? 8 : ex === -1 ? 2 : ey === 1 ? 1 : 4; return !(W(a, b) & s) && !(W(a + ex, b + ey) & t); };
      if (!dx || !dy) return edge(x, y, dx, dy);
      if (M.blocked(x + dx, y) || M.blocked(x, y + dy)) return false;
      return edge(x, y, dx, 0) && edge(x + dx, y, 0, dy) && edge(x, y, 0, dy) && edge(x, y + dy, dx, 0);
    }
    function reach(x, y, d, ahead) { const [dx, dy] = DIR8[d]; let n = 0; while (n < ahead && stepOk(x + dx * n, y + dy * n, dx, dy)) n++; return n ? [x + dx * n, y + dy * n, n] : null; }
    function walkTo(d, run) {
      const p = me(), w = st.walk, now = performance.now();
      for (const k of [0, 1, -1]) { const t = reach(p.x, p.y, (d + k + 8) % 8, run ? 4 : 3);   /* running covers 2 tiles a tick: aim further */ if (!t) continue;
        if (!(w && !w.stuck && w.x === t[0] && w.y === t[1] && w.run === run && p.path && p.path.length)) core.cmd(pid, { c: 'walk', x: t[0], y: t[1], run });   /* same target, still walking: no new command */
        st.walk = { d, x: t[0], y: t[1], run, t: now }; return; }
      st.walk = { d, x: p.x, y: p.y, run, t: now, stuck: 1 };   /* shut in that way: try again in a moment */
    }
    function stick(ax, ay, now) {
      const p = me(); if (!p) return;
      const m = Math.min(1, Math.hypot(ax, ay));
      if (!m) { if (st.walk) { if (!st.walk.stuck && p.path && p.path.length > 1) core.cmd(pid, { c: 'walk', x: p.x, y: p.y }); st.walk = null; st.sprint = false; } return; }   /* let go: stop on the tile you are on */
      /* camera-relative: the camera sits at +(sin yaw, cos yaw) from you, so "up" on the stick is -(sin yaw, cos yaw) */
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), wx = -sy * -ay + cy * ax, wy = -cy * -ay - sy * ax;
      let ang = Math.atan2(wx, -wy) / (Math.PI / 4); const d0 = ((Math.round(ang) % 8) + 8) % 8;
      let d = d0; if (st.walk) { let diff = ang - st.walk.d; diff = ((diff + 4) % 8 + 8) % 8 - 4; if (Math.abs(diff) < 0.7) d = st.walk.d; }   /* hysteresis: no flicker between two directions */
      const run = m > RUN_AT || st.sprint || !!(o.settings && o.settings().runToggle);
      const w = st.walk, left = w ? Math.max(Math.abs(w.x - p.x), Math.abs(w.y - p.y)) : 0;
      if (!w || w.d !== d || w.run !== run || (now - w.t > (w.stuck ? 300 : 120) && (w.stuck || left <= (run ? 2 : 1) || !p.path || !p.path.length))) walkTo(d, run);
      if (st.panelFocus) { st.panelFocus = false; }
    }

    /* ---------- targets near you (what A acts on; LB/RB cycle them) */
    function nearTargets() {
      const p = me(), out = [], yaw = o.facing ? o.facing() : cam.yaw + Math.PI, fx = Math.sin(yaw), fy = Math.cos(yaw);
      const add = (t, x, y) => { const dx = x + 0.5 - (p.x + 0.5), dy = y + 0.5 - (p.y + 0.5), d = Math.hypot(dx, dy); if (d > NEAR_R) return; const c = d ? (dx * fx + dy * fy) / d : 1; t.x0 = x; t.y0 = y; t.score = d * (1 + 0.25 * (1 - c)) + (t.kind === 'node' ? 0.5 : 0);   /* nearest first; behind you counts 1.5x as far */ out.push(t); };
      for (const m of core.S.mobs) if (!m.dead) add({ kind: 'mob', uid: m.uid }, m.x, m.y);
      for (const n of M.npcs || []) add({ kind: 'npc', id: n.id }, n.x, n.y);
      for (const g of core.S.ground) add({ kind: 'item', uid: g.uid }, g.x, g.y);
      const R = 6, dep = core.S.dep || {};
      for (let y = p.y - R; y <= p.y + R; y++) for (let x = p.x - R; x <= p.x + R; x++) { let n = null; try { n = core.nodeAt(core.idx(x, y)); } catch (e) { n = null; } if (n && n.x === x && n.y === y && !dep[core.idx(x, y)]) add({ kind: 'node', i: core.idx(x, y) }, x, y); }
      if (M.buildingAt) { const bi = M.buildingAt(p.x, p.y); if (bi >= 0) { const B = M.buildings[bi]; if (B && B.stairs) add({ kind: 'ground', x: B.stairs[0], y: B.stairs[1], stairs: 1 }, B.stairs[0], B.stairs[1]); } }
      return out.filter(t => { const op = o.optionsFor(t)[0]; return op && (op.act || t.kind !== 'ground') && !(t.kind === 'ground' && !/Climb/.test(op.html)); }).sort((a, b) => a.score - b.score);
    }
    const tkey = t => t ? t.kind + ':' + (t.uid != null ? t.uid : t.id != null ? t.id : t.i != null ? t.i : t.x + ',' + t.y) : '';
    function refreshTargets(now, force) {
      if (!force && now - st.listT < 250) return; st.listT = now; st.list = nearTargets();
      if (st.target && !st.list.some(t => tkey(t) === tkey(st.target))) st.target = null;
      if (st.target && now - st.target.pinT > 8000) st.target = null;   /* a picked target goes back to "best" after a while */
    }
    const current = () => st.target || st.list[0] || null;
    function cycle(k) { if (!st.list.length) return; const i = st.list.findIndex(t => tkey(t) === tkey(current())); const t = st.list[((i < 0 ? 0 : i) + k + st.list.length) % st.list.length]; st.target = Object.assign({}, t, { pinT: performance.now() }); o.sfx && o.sfx('click'); }
    function interact() {
      refreshTargets(performance.now(), true); const t = current(); if (!t) return false;
      const op = o.optionsFor(t)[0]; if (!op) return false;
      const run = !!(o.settings && o.settings().runToggle) || st.sprint;
      if (op.act) op.act = Object.assign({}, op.act, { run }); o.doAct(op); st.target = null; return true;
    }
    function attackNearest() {
      const p = me(); let best = null, bd = 1e9;
      for (const m of core.S.mobs) { if (m.dead) continue; const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd && d <= NEAR_R + 3) { bd = d; best = m; } }
      if (!best) { hud.chat && hud.chat('There is nothing to attack nearby.', 'sys'); return false; }
      o.send({ c: 'attack', uid: best.uid, run: !!(o.settings && o.settings().runToggle) || st.sprint }); return true;
    }
    function drawRing(now) {
      const t = now - st.usedT < 15000 ? current() : null;
      if (!ring) { ensureCss(); ring = document.createElement('div'); ring.className = 'gpring'; (hud.layer || host).appendChild(ring); }
      let s = null; if (t) { try { s = t.kind === 'mob' || t.kind === 'npc' || t.kind === 'item' ? o.screenOf(t.kind, t.kind === 'npc' ? t.id : t.uid) : o.screenOf('tile', [t.x0, t.y0]); } catch (e) { s = null; } }
      if (!s) { ring.style.display = 'none'; if (st.hover) { st.hover = ''; hud.setHover(''); } return; }
      const r = host.getBoundingClientRect(); ring.style.display = 'block'; ring.style.left = (s.x - r.left) + 'px'; ring.style.top = (s.y - r.top + 6) + 'px';
      const op = o.optionsFor(t)[0], h = op ? '<span style="color:#ff0">(A)</span> ' + op.html : ''; if (h !== st.hover) { st.hover = h; hud.setHover(h); }
    }

    /* ---------- UI focus: the topmost open menu / dialogue / help / creator / shop / focused panel */
    function uiScope() {
      const ctx = q('.ctx'); if (ctx && ctx.style.display === 'block') return { key: 'ctx', el: ctx, items: Array.from(ctx.querySelectorAll('.opt')), stamp: ctx.firstChild };
      const dlg = q('.dlg'); if (shown(dlg) && dlg.style.display === 'block') return { key: 'dlg', el: dlg, items: [dlg] };
      const help = q('.help'); if (help && help.style.display === 'block') return { key: 'help', el: help, items: Array.from(help.querySelectorAll('button')) };
      if (hud.creatorOpen) { const cc = q('.cc'); if (cc) return { key: 'cc', el: cc, items: Array.from(cc.querySelectorAll('button')).filter(shown) }; }
      const shop = q('.shop'); if (hud.shopOpen && shown(shop)) return { key: 'shop', el: shop, items: Array.from(shop.querySelectorAll('.slot, button, .x')).filter(shown) };
      if (st.panelFocus && hud.tab) { const pn = q('.panel'); if (pn) return { key: 'panel:' + hud.tab, el: pn, items: Array.from(pn.querySelectorAll('.slot, button, [data-s], .sk')).filter(e => shown(e) && !(e.classList.contains('slot') && e.parentNode.classList.contains('equip') && !e.dataset.k)) }; }
      return null;
    }
    function markUi(sc) {
      for (const e of host.querySelectorAll('.gpf')) if (!sc || sc.items[st.uiIdx] !== e) e.classList.remove('gpf');
      if (sc && sc.items[st.uiIdx]) { ensureCss(); sc.items[st.uiIdx].classList.add('gpf'); }
    }
    function moveUi(sc, dx, dy) {   /* spatial: the nearest item whose centre lies that way */
      const cur = sc.items[st.uiIdx]; if (!cur) { st.uiIdx = 0; return; }
      const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2; let best = -1, bs = 1e9;
      sc.items.forEach((e, i) => { if (e === cur) return; const r = e.getBoundingClientRect(), ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy, along = ex * dx + ey * dy, side = Math.abs(ex * dy - ey * dx); if (along < 2) return; const s = along + side * 2.5; if (s < bs) { bs = s; best = i; } });
      if (best >= 0) st.uiIdx = best; else if (sc.key === 'ctx' && dy) st.uiIdx = (st.uiIdx + dy + sc.items.length) % sc.items.length;   /* menus wrap */
    }
    function pressUi(sc) {
      const e = sc.items[st.uiIdx]; if (!e) return;
      if (sc.key === 'ctx') { e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return; }
      if (e.dataset && e.dataset.i != null && e.closest('.inv')) { const i = +e.dataset.i, p = me(); if (!p.inv[i]) return; const r = e.getBoundingClientRect(), h = host.getBoundingClientRect(); hud.menu(r.left + r.width / 2 - h.left, r.top + r.height / 2 - h.top, hud.itemOptions(i)); return; }
      if (e.closest('.equip')) { e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); return; }
      e.click();
    }
    function escape() { G.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }
    function tabs() { return Array.from(host.querySelectorAll('.tabs .tab')).map(b => b.dataset.k); }
    function switchTab(k) { const T = tabs(); if (!T.length) return; const i = T.indexOf(hud.tab); hud.setTab(T[i < 0 ? (k > 0 ? 0 : T.length - 1) : (i + k + T.length) % T.length]); st.panelFocus = false; o.sfx && o.sfx('click'); }

    /* ---------- once per frame */
    function poll(now, dt) {
      if (!has) return;
      if (!st.armed && !st.pad) { if (now - st.scanT < 1000) return; st.scanT = now; }   /* no pad yet: look once a second */
      const p = findPad();
      if (!p) { if (st.pad) { st.pad = null; st.prev = []; st.walk = null; toast('Controller disconnected'); if (ring) ring.style.display = 'none'; markUi(null); } st.armed = false; return; }
      if (!st.pad) { st.pad = p.id || 'pad'; toast('Controller connected - A interact, X attack, Y bag'); hud.chat && hud.chat('Controller: left stick walk, right stick camera, A interact, X attack, B back, Y bag, LB/RB pick target, D-pad panels, Start help.', 'sys'); }
      const down = [], hit = i => down[i] && !st.prev[i];
      for (let i = 0; i < Math.max(16, p.buttons.length); i++) down[i] = btn(p, i);
      const lx = dz(p.axes[0]), ly = dz(p.axes[1]), rx = dz(p.axes[2]), ry = dz(p.axes[3]), lt = val(p, BTN.LT), rt = val(p, BTN.RT);
      if (lx || ly || rx || ry || lt > 0.1 || rt > 0.1 || down.some(Boolean)) st.usedT = now;
      /* camera, always (it is never in the way) */
      if (rx || ry) { cam.tyaw += rx * 2.4 * dt; cam.tpitch -= ry * 1.3 * dt; }
      if (lt > 0.05 || rt > 0.05) cam.tdist *= 1 + (lt - rt) * 1.6 * dt;
      const sc = uiScope();
      if (sc) {
        const key = sc.key + (sc.stamp ? ':' + (sc.stamp.__gp || (sc.stamp.__gp = Math.random())) : '');
        if (key !== st.uiKey) { if (st.uiKey && st.uiKey.indexOf("ctx")) st.uiMem[st.uiKey] = st.uiIdx; st.uiKey = key; st.uiIdx = st.uiMem[key] || 0; if (st.uiMem[key] == null && (sc.key === 'shop' || sc.key.indexOf('panel') === 0)) { const f = sc.items.findIndex(e => e.classList.contains('slot') && e.innerHTML); if (f >= 0) st.uiIdx = f; } }
        if (st.uiIdx >= sc.items.length) st.uiIdx = Math.max(0, sc.items.length - 1);
        if (hit(BTN.UP)) moveUi(sc, 0, -1); if (hit(BTN.DOWN)) moveUi(sc, 0, 1); if (hit(BTN.LEFT)) moveUi(sc, -1, 0); if (hit(BTN.RIGHT)) moveUi(sc, 1, 0);
        if (hit(BTN.A)) pressUi(sc);
        if (hit(BTN.B)) { if (sc.key === 'ctx') hud.hideMenu(); else if (sc.key.indexOf('panel') === 0) st.panelFocus = false; else if (sc.key !== 'cc') escape(); }
        if (sc.key === 'help' && hit(BTN.START)) hud.showHelp(false);
        if (sc.key.indexOf('panel') === 0 && hit(BTN.Y)) { hud.setTab(null); st.panelFocus = false; }
        markUi(uiScope());
        if (sc.key !== 'cc' && sc.key !== 'dlg' && sc.key !== 'help') stick(lx, ly, now); else if (st.walk) stick(0, 0, now);
        if (ring) ring.style.display = 'none';
        st.prev = down; return;
      }
      if (st.uiKey) { st.uiKey = null; markUi(null); }
      stick(lx, ly, now);
      refreshTargets(now);
      if (hit(BTN.L3)) { st.sprint = !st.sprint; }
      if (hit(BTN.BACK)) { o.toggle && o.toggle('runToggle'); hud.chat && hud.chat('Run: ' + (o.settings().runToggle ? 'on' : 'off') + '.', 'sys'); hud.refresh && hud.refresh('settings'); }
      if (hit(BTN.LB)) cycle(-1); if (hit(BTN.RB)) cycle(1);
      if (hit(BTN.A)) interact();
      if (hit(BTN.X)) attackNearest();
      if (hit(BTN.Y)) { hud.setTab(hud.tab === 'inv' ? null : 'inv'); o.sfx && o.sfx('click'); }
      if (hit(BTN.START)) hud.showHelp(true);
      if (hit(BTN.LEFT)) switchTab(-1); if (hit(BTN.RIGHT)) switchTab(1);
      if (hit(BTN.UP) || hit(BTN.DOWN)) { if (!hud.tab) hud.setTab('inv'); st.panelFocus = true; st.uiKey = null; }
      if (hit(BTN.B)) { if (st.target) st.target = null; else if (hud.tab) hud.setTab(null); else { const P = me(); st.walk = null; core.cmd(pid, { c: 'walk', x: P.x, y: P.y }); } }
      drawRing(now);
      st.prev = down;
    }
    return { api: API, poll, state: () => ({ pad: st.pad, target: current(), list: st.list.map(tkey), ui: st.uiKey, uiIdx: st.uiIdx, panelFocus: st.panelFocus, walk: st.walk, sprint: st.sprint }) };
  }
  const Gamepad = { api: API, create };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('gamepad', { api: API, v: 1 }, () => Gamepad);
  if (typeof module !== 'undefined' && module.exports) module.exports = Gamepad;
})(typeof globalThis !== 'undefined' ? globalThis : this);
