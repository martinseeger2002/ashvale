/* ASHVALE 3D HUD module: every piece of 2D interface: minimap + orbs, side tabs, chat box, NPC dialogue, the options menu
   (right-click / long-press), hover text, opponent box, hit splats and HP bars layer, XP drops, level-up banner, death
   screen, help card. Since 2026-10-02 (the operator: "modularize the HUD") the big pieces are their own modules, so a fix to
   one is one small inscription: hudart (CSS, icons, tables), hudpanels (the side panels), hudshop, huddrag (inventory
   drag and drop), hudcreator (character creator / wardrobe). This core builds the frame and hands each part a kit.
   No three.js here: the engine passes an `api` object (core, player id, icon(id), cmd(c), actions) and calls refresh().
   create(host, api) -> hud (same interface as before the split) */
(function (G) {
  'use strict';
  let A = null, PARTS = [];
  function create(host, api) {
    const core = api.core, P = () => core.S.players[api.pid];
    if (!document.getElementById('ash-css')) { const st = document.createElement('style'); st.id = 'ash-css'; st.textContent = A.CSS; document.head.appendChild(st); }
    host.classList.add('ash');
    const el = (cls, parent, html, tag) => { const e = document.createElement(tag || 'div'); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || host).appendChild(e); return e; };
    const layer = el('lay'), ui = el('lay');
    const hover = el('hover t', ui), opp = el('opp stone ui', ui), xy = el('xy', ui, '');
    let xyKey = '';
    function setPos(x, y) { const k = x + ', ' + y; if (k === xyKey) return; xyKey = k; xy.textContent = k; }
    const mmBox = el('mm ui', ui), mmCanvas = el('', mmBox, null, 'canvas'); mmCanvas.width = mmCanvas.height = 300;
    const compass = el('compass ui', ui, '<div class="face"><b>N</b><b>E</b><b>S</b><b>W</b><i></i></div>'); compass.title = 'North. Tap to face north.';   /* a rose beside the minimap; N follows true north */
    const orbs = el('orbs ui', ui), hpOrb = el('orb hp', orbs, '<i></i><b></b>'), runOrb = el('orb run', orbs, '<i></i><b></b>'), prayOrb = el('orb pray', orbs, '<i></i><b></b>');
    const tabs = el('tabs ui', ui), panel = el('panel stone ui', ui);
    const chatw = el('chatw ui', ui), chat = el('chat', chatw), sayRow = el('say', chatw, '<input maxlength="120" enterkeyhint="send" placeholder="Say something to players here"><button>Say</button>'), sayIn = sayRow.firstChild;
    const doSay = () => { const t = sayIn.value; sayIn.value = ''; if (t.trim()) api.say(t); };
    sayIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { doSay(); if (!api.isTouch) sayIn.blur(); } else if (e.key === 'Escape') sayIn.blur(); });
    /* on a phone the text box rides above the keyboard while it is open and goes back down when it closes (the operator
       2026-10-06). The game runs inside the arcade's page, so the keyboard may or may not shrink what this page sees:
       when the visible area shrinks, the box sits just above it; when nothing changes (an iframe the keyboard covers
       without telling it), it goes to the top of the screen, which the keyboard never covers. The keyboard closing
       (the visible area growing back) puts it down again, as does leaving the box. */
    const KB = { on: false, base: 0, seen: false, t: 0 };
    const vvBottom = () => { const v = G.visualViewport; return v ? v.height + v.offsetTop : G.innerHeight; };
    function kbPlace() {
      if (!KB.on) return;
      const lift = KB.base - vvBottom(), cover = G.innerHeight - vvBottom();
      if (lift > 80) { KB.seen = true; sayRow.classList.add('kb'); sayRow.style.top = 'auto'; sayRow.style.bottom = Math.max(6, cover + 6) + 'px'; }
      else if (KB.seen) { sayIn.blur(); }   /* it was open and closed again: down it goes */
      else if (performance.now() - KB.t > 650) { sayRow.classList.add('kb'); sayRow.style.bottom = 'auto'; sayRow.style.top = 'max(8px, env(safe-area-inset-top))'; }
    }
    function kbDown() { KB.on = false; KB.seen = false; sayRow.classList.remove('kb'); sayRow.style.top = sayRow.style.bottom = ''; }
    if (api.isTouch) {
      sayIn.addEventListener('focus', () => { KB.on = true; KB.seen = false; KB.base = Math.max(G.innerHeight, vvBottom()); KB.t = performance.now(); for (const ms of [120, 350, 700, 1000]) setTimeout(kbPlace, ms); });
      sayIn.addEventListener('blur', kbDown);
      if (G.visualViewport) { G.visualViewport.addEventListener('resize', kbPlace); G.visualViewport.addEventListener('scroll', kbPlace); }
      G.addEventListener('resize', kbPlace);
    }
    sayRow.lastChild.onclick = doSay;
    const xpd = el('xpd', ui), banner = el('banner stone t', ui), dead = el('dead', ui, 'Oh dear, you are dead!');
    const dlg = el('dlg stone ui', ui), ctx = el('ctx ui', ui), shopEl = el('shop stone ui', ui), help = el('help stone ui', ui), err = el('err ui', ui);
    const st = { tab: api.isPhone ? null : 'inv', shopId: null, shopSel: null, skillSel: null, newGameArm: 0 };   /* shared with the hud parts */
    let lines = [], dlgQ = null;
    const TABS = [['combat', 'Combat'], ['skills', 'Skills'], ['quest', 'Quests'], ['inv', 'Inventory'], ['equip', 'Equipment'], ['prayer', 'Prayer'], ['magic', 'Magic'], ['settings', 'Settings']];   /* no Wallet tab (2026-10-05: the chest shows your wallet) */
    for (const [k, title] of TABS) { const b = el('tab stone', tabs, A.ICON[k], 'button'); b.title = title; b.dataset.k = k; b.onclick = () => { setTab(st.tab === k ? null : k); api.sfx && api.sfx('click'); }; }
    function setTab(k) { st.tab = k; for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === k); panel.classList.toggle('open', !!k); K.refresh(k); }

    /* ---------- item icons */
    function slotHtml(it, extra) {
      if (!it) return '';
      const d = core.item(it.id), url = api.icon(it.id);
      let h = url ? '<img src="' + url + '" alt="">' : '<div class="fb" style="background:' + (api.fallbackColor ? api.fallbackColor(it.id) : '#665') + '">' + A.esc(d.name.split(' ').map(w => w[0]).join('').slice(0, 3)) + '</div>';
      if (d.stack || it.n > 1) { const [s, c] = A.fmtN(it.n); h += '<span class="n ' + c + '">' + s + '</span>'; }
      return h + (extra || '');
    }
    function longPress(node, onTap, onMenu) {
      let timer = null, fired = false, sx = 0, sy = 0;
      node.addEventListener('pointerdown', e => { if (e.button === 2) return; fired = false; sx = e.clientX; sy = e.clientY; clearTimeout(timer); timer = setTimeout(() => { fired = true; onMenu(sx, sy); }, 480); });
      node.addEventListener('pointermove', e => { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) clearTimeout(timer); });
      node.addEventListener('pointerup', e => { clearTimeout(timer); if (e.button === 2) return; if (!fired) onTap(); });
      node.addEventListener('pointercancel', () => clearTimeout(timer));
      node.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(timer); onMenu(e.clientX, e.clientY); });
    }
    function itemOptions(slot) {
      const p = P(), it = p.inv[slot]; if (!it) return [];
      const d = core.item(it.id), nm = '<span class="o">' + A.esc(d.name) + '</span>', o = [];
      if (d.eq) o.push({ html: (d.eq === 'weapon' ? 'Wield ' : 'Wear ') + nm, fn: () => api.cmd({ c: 'equip', slot }) });
      if (d.edible) o.push({ html: (d.drink ? 'Drink ' : 'Eat ') + nm, fn: () => api.cmd({ c: 'eat', slot }) });
      if (d.buryXp) o.push({ html: 'Bury ' + nm, fn: () => api.cmd({ c: 'use', slot }) });
      else if (d.burnTicks) o.push({ html: 'Light ' + nm, fn: () => api.cmd({ c: 'use', slot }) });
      else if (d.teleport && d.eq !== 'ring') o.push({ html: 'Use ' + nm, fn: () => api.cmd({ c: 'use', slot }) });
      else if (!d.eq && !d.edible) o.push({ html: 'Use ' + nm, fn: () => api.cmd({ c: 'use', slot }) });
      if (d.arms) { o.push({ html: 'Call to arms <span class="c">castle guard</span>', fn: () => api.cmd({ c: 'arms', on: true }) }); o.push({ html: 'Stand down <span class="c">castle guard</span>', fn: () => api.cmd({ c: 'arms', on: false }) }); }   /* the Lake Castle stone (2026-10-05) */
      o.push({ html: 'Drop ' + nm, fn: () => api.cmd({ c: 'drop', slot }) });
      o.push({ html: 'Examine ' + nm, fn: () => chatLine(examine(it.id, it.n), 'sys') });
      return o;
    }
    function examine(id, n) {
      const d = core.item(id), b = [];
      for (const k of ['attack', 'strength', 'defence', 'ranged', 'magic']) if (d[k]) b.push(A.cap(k) + ' +' + d[k]);
      if (d.rstr) b.push('Ranged strength +' + d.rstr);
      if (d.prayer) b.push('Prayer +' + d.prayer);
      if (d.prayerSec) b.push('+' + d.prayerSec + 's per prayer point');
      if (d.ppHold) b.push('+' + d.ppHold + 's before each point, for every Prayer point you still hold');
      if (d.heal) b.push('Heals ' + d.heal); if (d.healPct) b.push('Heals ' + d.healPct + '% of your hitpoints');
      const req = d.req ? Object.keys(d.req).filter(k => d.req[k] > 1).map(k => A.cap(k) + ' ' + d.req[k]).join(', ') : '';
      if (d.weight) b.push((d.weight * Math.max(1, n || 1) / 1000).toFixed(d.weight * (n || 1) < 1000 ? 2 : 1) + ' kg');
      if (d.carry) b.push('Carry +' + (d.carry / 1000) + ' kg');
      return d.name + (n > 1 ? ' x ' + n.toLocaleString() : '') + ': ' + (b.length ? b.join(', ') + '. ' : '') + (req ? 'Requires ' + req + '. ' : '') + 'Value ' + d.value + ' GOLD.' + (d.nft ? ' (ASHVALE Armoury: ' + d.nft.copies + ' NFT copies)' : '');
    }

    function updateOrbs() {
      const p = P(); if (!p) return;
      const hk = core.isHawk && core.isHawk(p), mx = hk ? core.hawkMax() : core.maxHp(p), hv = hk ? (p.hawkHp == null ? mx : p.hawkHp) : p.hp;   /* a hawk has its own HP (2026-10-04) */
      hpOrb.firstChild.style.height = (100 * hv / mx) + '%'; hpOrb.lastChild.textContent = hv; hpOrb.title = hpOrb.dataset.poison ? 'Poisoned! Eat something or drink an antidote.' : (hk ? 'Hawk HP ' : 'Hitpoints ') + hv + '/' + mx; hpOrb.classList.toggle('hawk', !!hk);
      const e = Math.floor(p.energy / 100); runOrb.firstChild.style.height = e + '%'; runOrb.lastChild.textContent = e; runOrb.classList.toggle('off', !p.runNow); runOrb.title = 'Run energy. Double-tap (or double-click) where you want to go to run there.';
      const pm = core.maxPp ? core.maxPp(p) : 1, pv = p.pp | 0, on = !!(p.pray && Object.keys(p.pray).length), oh = core.overhead && core.overhead(p), q = oh && core.prayer(oh);
      const pk = pv + '|' + pm + '|' + (oh || on);
      if (prayOrb.dataset.k !== pk) { prayOrb.dataset.k = pk; prayOrb.firstChild.style.height = Math.min(100, 100 * pv / Math.max(1, pm)) + '%'; prayOrb.lastChild.innerHTML = (q ? A.prayIcon(q) : '') + pv; prayOrb.classList.toggle('on', on); if (st.tab === 'prayer') K.refresh('prayer'); prayOrb.title = 'Prayer points ' + pv + '/' + pm + (on ? '. Tap to switch your prayers off.' : '. Tap to open your prayers.'); }
    }
    runOrb.onclick = () => chatLine(api.isTouch ? 'To run, double-tap where you want to go. Running uses this energy.' : 'To run, double-click where you want to go. Running uses this energy.', 'sys');
    hpOrb.onclick = () => { const p = P(); const i = p.inv.findIndex(s => s && core.item(s.id).edible); if (i >= 0) api.cmd({ c: 'eat', slot: i }); else chatLine('You have no food. The General Store sells bread.', 'warn'); };
    prayOrb.onclick = () => { const p = P(); if (p.pray && Object.keys(p.pray).length) { for (const id in p.pray) api.cmd({ c: 'pray', id, on: false }); } else setTab('prayer'); };
    compass.onclick = () => api.faceNorth();

    /* ---------- chat */
    function chatLine(text, kind) {
      lines.push([text, kind || '']); if (lines.length > 60) lines.shift();
      const d = document.createElement('div'); d.className = kind || ''; d.textContent = text; chat.appendChild(d);
      while (chat.children.length > 60) chat.removeChild(chat.firstChild);
      if (chat.classList.contains('big')) chat.scrollTop = chat.scrollHeight;
    }
    chat.onclick = () => { chat.classList.toggle('big'); chat.scrollTop = chat.scrollHeight; };

    /* ---------- options menu */
    function menu(x, y, opts) {
      if (!opts.length) return;
      ctx.innerHTML = '<div class="h">Choose Option</div>';
      for (const o of opts.concat([{ html: 'Cancel', fn: () => { } }])) { const d = el('opt', ctx, o.html); d.onpointerup = (e) => { e.stopPropagation(); hideMenu(); o.fn(); }; }
      ctx.style.display = 'block';
      const W = host.clientWidth, H = host.clientHeight, w = ctx.offsetWidth, h = ctx.offsetHeight;
      ctx.style.left = Math.max(4, Math.min(W - w - 4, x - w / 2)) + 'px'; ctx.style.top = Math.max(4, Math.min(H - h - 4, y - 10)) + 'px';
      menuOpenT = performance.now();
    }
    let menuOpenT = 0;
    function hideMenu() { ctx.style.display = 'none'; }
    host.addEventListener('pointerdown', e => { if (ctx.style.display === 'block' && !ctx.contains(e.target) && performance.now() - menuOpenT > 200) hideMenu(); }, true);

    /* ---------- NPC dialogue */
    function dialog(name, linesIn, onClose) {
      if (dlgQ && dlgQ.onClose) { const prev = dlgQ.onClose; dlgQ.onClose = null; prev(); }
      dlgQ = { name, lines: (linesIn || []).slice(), i: 0, onClose: onClose || null }; drawDlg();
    }
    function drawDlg() {
      if (!dlgQ || dlgQ.i >= dlgQ.lines.length) {
        const done = dlgQ && dlgQ.onClose; dlg.style.display = 'none'; dlgQ = null; if (done) done(); return;
      }
      dlg.style.display = 'block'; dlg.innerHTML = '<div class="nm">' + A.esc(dlgQ.name) + '</div><div class="ln">' + A.esc(dlgQ.lines[dlgQ.i]) + '</div><div class="go">' + (dlgQ.i < dlgQ.lines.length - 1 ? 'Tap here to continue' : 'Tap here to close') + '</div>';
    }
    dlg.onclick = () => { if (dlgQ) { dlgQ.i++; drawDlg(); K.refresh('quest'); } };

    /* ---------- another player's stats (long-press / right-click > View stats): their own levels as their game sent them */
    function confirm(title, body, yesLabel, noLabel, onYes) {
      help.innerHTML = '<h3>' + A.esc(title) + '</h3><p style="margin:0 0 10px;line-height:1.45">' + A.esc(body) + '</p>' +
        '<button class="btn" data-a="yes">' + A.esc(yesLabel || 'Yes') + '</button>' +
        '<button class="btn" data-a="no">' + A.esc(noLabel || 'No') + '</button>';
      help.style.display = 'block';
      help.querySelector('[data-a=yes]').onclick = () => { help.style.display = 'none'; onYes && onYes(); };
      help.querySelector('[data-a=no]').onclick = () => { help.style.display = 'none'; };
    }
    function playerStats(name, sk, cb) {
      let tot = 0, h = '<h3>' + A.esc(name) + '</h3><div class="skills">';
      for (const s of A.SKILL_ORDER) { const L = sk[s] | 0 || 1; tot += L; h += '<div class="sk">' + A.SKI[s] + A.cap(s) + '<span>' + L + '</span></div>'; }
      help.innerHTML = h + '</div><div class="info" style="margin-top:6px">Total level: ' + tot + ' · Combat: ' + cb + '</div><button class="btn">Close</button>';
      help.style.display = 'block'; help.querySelector('.btn').onclick = () => { help.style.display = 'none'; };
    }

    /* ---------- help card */
    function showHelp(on) {
      help.style.display = on ? 'block' : 'none'; if (!on) return;
      /* The store falls to memory when there is no arcade storage bridge and no localStorage, which is
         what a page drawn inside a feed post's sandboxed iframe gets. Only the diagnostics panel said
         so, so a whole session off a feed card could be played and lost without a word about it. */
      help.innerHTML = '<h3>Welcome to Ashvale</h3>' +
        (api.savesHere && api.savesHere() === 'memory' ? '<ul><li><span class="y">This window cannot keep your progress</span> - it ends when you close it. Open ASHVALE from the Games tab and press <b>Play</b> there to keep your character.</li></ul>' : '') +
        (api.isTouch ? '<ul><li><b>Tap</b> to walk, <b>double-tap</b> to run. Tap the ground to walk there, a monster to fight it, an item to pick it up, a person to talk or trade.</li><li><b>Drag</b> to turn the camera, <b>pinch</b> to zoom.</li><li><b>Press and hold</b> anything for more options.</li></ul>'
          : '<ul><li><b>Click</b> to walk, <b>double-click</b> to run. Click the ground to walk there, a monster to fight, loot to pick it up, a person to talk or trade.</li><li><b>Right-click</b> for more options. <b>Arrow keys</b> or <b>middle-drag</b> (or left-drag) turn the camera, the <b>wheel</b> zooms.</li><li>Hold <b>Shift</b> while you click for the opposite of that click - walk with Run switched on, run with it off. Settings can keep running on so you do not have to double-click.</li><li>Keys: I inventory, E equipment, S skills, C combat, Q quests, P prayer, M magic, Esc close.</li></ul>') +
        '<ul><li>Other players you see are real people on the arcade. Monsters are your own for now.' + (api.isTouch ? '' : ' Press <b>Enter</b> to talk to them.') + '</li><li>Talk to <span class="y">Elder Maren</span> by the well: wolves are taking the flock.</li><li>Buy weapons and armour from <span class="y">Garrick</span> (Armoury, north-east), food and tools from <span class="y">Tam</span> (General Store, north-west).</li><li>Seven others here built this village and never left it: <span class="y">Silas</span> by the well, <span class="y">Pip</span> on the street, <span class="y">Latency</span> at the north gate, the rest about the roads. Right-click one and talk.</li><li>Giant rats lurk where the path enters Whisperwood, wolves further north. Eat when your hitpoints run low.</li></ul>' +
        '<button class="btn">Play</button>';
      help.querySelector('.btn').onclick = () => { showHelp(false); api.helpSeen && api.helpSeen(); };
    }

    const ccEl = el('cc stone ui', ui);   /* character creator / wardrobe (hudcreator) */

    /* ---------- in-world bits (positions come from the engine every frame) */
    const FX_ICON = { freeze: ['#dff6ff', '#4aa8e0', '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke-width="2.4" fill="none"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2M3 10l3 1-1 3M21 14l-3-1 1-3M3 14l3-1-1-3M21 10l-3 1 1 3" stroke-width="1.6" fill="none"/>'],
      poison: ['#cff5c0', '#3a8a2a', '<circle cx="12" cy="13" r="6"/>'], burn: ['#ffe2c0', '#d0501a', '<path d="M12 3c3 4 6 6 6 10a6 6 0 01-12 0c0-3 3-6 6-10z"/>'],
      bind: ['#e8d8ff', '#6a2aa8', '<path d="M4 9a3 3 0 016 0v6a3 3 0 01-6 0zM14 9a3 3 0 016 0v6a3 3 0 01-6 0zM8 12h8" stroke-width="2" fill="none"/>'],
      slow: ['#e0e0ff', '#6060c0', '<path d="M5 12h14M12 5v14"/>'], stun: ['#fff8c0', '#c0a020', '<path d="M12 3l2 6h6l-5 4 2 7-5-4-5 4 2-7-5-4h6z"/>'] };
    function fxSplat(kind) {
      const f = FX_ICON[kind]; if (!f) return null;
      const s = el('splat fx', layer, ''); s.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="' + f[0] + '" stroke="' + f[1] + '" stroke-width="1.5"/><g stroke="' + f[1] + '" fill="' + f[1] + '">' + f[2] + '</g></svg>') + '")'; return s;
    }
    function splat(dmg, kind) { const s = el('splat' + (dmg ? '' : ' miss') + (kind === 'poison' ? ' poison' : ''), layer, String(dmg)); s.style.backgroundImage = kind === 'poison' ? 'none' : 'url("' + (dmg ? A.SPLAT_RED : A.SPLAT_BLUE) + '")'; return s; }
    /* poisoned (2026-10-07: "there needs to be an indication to the player that they are poisoned"): the Hitpoints orb goes green
       with a drop badge, and its title says so */
    function setPoison(on) { hpOrb.classList.toggle('poison', !!on); hpOrb.dataset.poison = on ? '1' : ''; if (on) hpOrb.title = 'Poisoned! Eat something or drink an antidote.'; }
    function hpBar() { return el('hpb', layer, '<i></i>'); }
    function bubble(text) { return el('bub', layer, A.esc(text)); }
    function tag(text) { return el('tag', layer, A.esc(text)); }
    function overhead(q) { const d = el('ohd', layer, ''); if (q) d.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(A.prayIcon(q).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')) + '")'; return d; }
    function marker(x, y, red) { const m = el('mark', layer, '&#x2715;'); m.style.left = x + 'px'; m.style.top = y + 'px'; m.style.color = red ? '#f22' : '#ff0'; setTimeout(() => m.remove(), 460); }
    function xpDrop(skill, n) { const d = el('', xpd, '+' + Math.floor(n / 10 * 10) / 10 + ' ' + A.cap(skill)); setTimeout(() => d.remove(), 1650); }
    let bannerT = 0;
    function levelUp(skill, lvl) { banner.innerHTML = 'Congratulations!<small>' + A.cap(skill) + ' level ' + lvl + '</small>'; banner.style.display = 'block'; clearTimeout(bannerT); bannerT = setTimeout(() => banner.style.display = 'none', 2600); }
    function death(on) { dead.style.display = on ? 'flex' : 'none'; }
    /* the connection banner (2026-10-06: a player who lost the server is told, so they don't play on a broken one):
       kind 'net' = the shared world is not reachable (others can't see you; the game reconnects by itself), 'save' = progress
       is not being saved. Stays until the engine says it's back; Reload is always there. */
    const nl = el('netlost ui', ui), NL = { net: null, save: null };
    function netLost(on, kind, why) {
      kind = kind || 'net'; NL[kind] = on ? (why || '') : null;
      const k = NL.save != null ? 'save' : NL.net != null ? 'net' : null;
      if (!k) { nl.style.display = 'none'; return; }
      nl.innerHTML = '<div><b>' + (k === 'save' ? 'Your progress is not being saved.' : 'Connection lost.') + '</b> ' +
        (k === 'save' ? 'The arcade is not answering. Reload before you play on, or what you do now may be lost.'
                      : 'Other players can\'t see you and the shared world isn\'t updating' + (NL.net ? ' (' + A.esc(NL.net) + ')' : '') + '. Reconnecting\u2026') +
        '</div><button class="btn">Reload</button>';
      nl.style.display = 'flex'; nl.querySelector('.btn').onclick = () => location.reload();
    }
    /* a new release is out (2026-10-06: players are told to leave, refresh their Games tab and come back in).
       The engine has saved before this shows; it stays up, the game keeps running until they go. */
    const nv = el('newver', ui);
    function newVersion(v) {
      nv.innerHTML = '<b>A new version of ASHVALE is out' + (v ? ' (v' + A.esc(String(v)) + ')' : '') + '.</b> Your progress is saved. ' +
        'Leave the game, refresh your Games tab and open ASHVALE again to play the new version.';
      nv.style.display = 'block';
    }
    /* this character was opened on another device (2026-10-06: one device at a time). The newest game wins;
       this one has stopped (no saves, no network). Play here reloads, which makes this the newest. */
    const ew = el('elsewhere ui', ui);
    function elsewhere() {
      ew.innerHTML = '<div><b>ASHVALE is open on another device</b>Your character can only be in one place, so the game has stopped here. ' +
        'Your progress is kept by the game you opened last.<button class="btn">Play here instead</button></div>';
      ew.style.display = 'flex'; ew.querySelector('.btn').onclick = () => location.reload();
    }
    /* the portal swirl (2026-10-06): shown while the town you are travelling to is still loading (engine arriveCheck) */
    const trav = el('travel', ui); trav.innerHTML = '<div class="sw"></div><div class="sw2"></div><div class="tt"></div><div class="pb"><i></i></div>';
    /* kind: undefined = the portal swirl; 'lodge' / 'lodgeout' = into a wigwam (birch bark walls, ironwood ribs up to the smoke
       hole, the fire's glow) and back out through its doorway; 'down' = climbing into a cave (dark stone, a torch's flicker, grit falling), 'up' = out
       into the daylight (2026-10-07: "Make the loading screen for entering a cave different than the town portal") */
    function travel(on, name, frac, kind) {
      trav.style.display = on ? 'flex' : 'none'; if (!on) return;
      trav.className = 'travel ui' + (kind ? ' ' + kind : '');
      trav.querySelector('.tt').textContent = kind === 'down' ? 'Climbing down into the ' + (name || 'cave') + '\u2026' : kind === 'up' ? 'Climbing out into the daylight\u2026' : kind === 'lodge' ? 'Ducking into the wigwam\u2026' : kind === 'lodgeout' ? 'Stepping out through the doorway\u2026' : 'Travelling to ' + (name || 'another town') + '\u2026';
      trav.querySelector('.pb i').style.width = Math.round(Math.max(0.08, Math.min(1, frac || 0)) * 100) + '%';
    }
    function setOpp(o) { if (!o) { opp.style.display = 'none'; return; } opp.style.display = 'block'; opp.innerHTML = '<div class="y t">' + A.esc(o.name) + '</div><div class="bar"><i style="width:' + Math.max(0, Math.min(100, 100 * o.hp / o.max)) + '%"></i></div>'; }
    function setHover(html) { hover.innerHTML = html || ''; }
    function fatal(msg) { err.style.display = 'flex'; err.textContent = msg; }
    function drawMinimap(img, st) {
      const c = mmCanvas, g = c.getContext('2d'), S = c.width, sc = 300 / 112 * 1.15;  /* ~26 tiles across */
      g.fillStyle = '#0a1408'; g.fillRect(0, 0, S, S);
      g.save(); g.translate(S / 2, S / 2); g.rotate(st.yaw); g.scale(sc, sc);
      g.drawImage(img, -st.x * 4, -st.y * 4);
      for (const d of st.dots) { g.fillStyle = d.c; g.fillRect((d.x - st.x) * 4 - 2.4, (d.y - st.y) * 4 - 2.4, 4.8, 4.8); }
      if (st.flag) { g.fillStyle = '#f22'; g.fillRect((st.flag[0] - st.x) * 4 - 1, (st.flag[1] - st.y) * 4 - 6, 2, 8); g.fillRect((st.flag[0] - st.x) * 4, (st.flag[1] - st.y) * 4 - 6, 5, 3); }
      g.restore();
      g.fillStyle = '#fff'; g.fillRect(S / 2 - 4, S / 2 - 4, 8, 8);
      const nv = st.north || [0, -1], sx = nv[0] * Math.cos(st.yaw) - nv[1] * Math.sin(st.yaw), sy = nv[0] * Math.sin(st.yaw) + nv[1] * Math.cos(st.yaw);   /* the map turns by yaw: so does north */
      compass.style.transform = 'rotate(' + Math.atan2(sx, -sy) + 'rad)';
    }
    mmBox.addEventListener('pointerup', e => {
      const r = mmBox.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / r.width * 300, dy = (e.clientY - r.top - r.height / 2) / r.height * 300;
      api.minimapTap(dx, dy, 300 / 112 * 1.15 * 4);
    });
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase(), m = { i: 'inv', e: 'equip', s: 'skills', c: 'combat', q: 'quest', p: 'prayer', m: 'magic' };
      if (e.key === 'Enter' && sayRow.classList.contains('on')) { e.preventDefault(); sayIn.focus(); return; }
      if (m[k]) setTab(st.tab === m[k] ? null : m[k]);
      else if (k === 'r') chatLine('To run, double-click where you want to go.', 'sys');
      else if (k === 'escape') { hideMenu(); if (st.shopId) { api.cmd({ c: 'close' }); K.closeShop(); } if (st.chest) K.closeChest(); showHelp(false); if (dlgQ) { dlgQ = null; drawDlg(); } }
    });

    /* ---------- the parts (each its own module/inscription): they get this kit and add their functions to it */
    const K = { host, api, core, P, A, el, ui, layer, panel, st, shopEl, ccEl, slotHtml, longPress, menu, hideMenu, chatLine, examine, itemOptions, updateOrbs, showHelp,
      refresh() { }, drawShop() { }, openShop() { }, closeShop() { }, openChest() { }, closeChest() { }, drawChest() { }, invPointer() { }, creator() { }, creatorOpen: () => false };
    for (const part of PARTS) part.install(K);
    /* a quest's story so far, in the words of the one who gave it (2026-10-06): every step you finished - what they
       asked and what they said when you came back - then what they asked you last, or their farewell once it is all done.
       Nothing from a step you have not reached. "Remove from quest log" hides it and keeps the progress (core 'qhide'). */
    K.questStory = (id, who) => {
      const p = K.P(), Q = core.D.quests.quests[id], q = p && p.quests[id]; if (!Q || !q) return;
      const fill = (L, st) => (L || []).map(l => String(l).replace(/\{(n|goal|left|name)\}/g, (m, k) => k === 'name' ? (p.name || 'traveller') : !st ? '' : k === 'goal' ? (st.goal.n || 1) : k === 'n' ? (q.n | 0) : Math.max(0, (st.goal.n || 1) - (q.n | 0))));
      let h = '<h3>' + A.esc(Q.name) + '</h3><div class="info" style="margin:0 0 8px">As told by <span class="y">' + who(Q.giver) + '</span></div>';
      const para = (L) => { for (const l of L) h += '<p style="margin:0 0 8px;line-height:1.45">' + A.esc(l) + '</p>'; };
      for (let i = 0; i < Q.steps.length && i < q.step; i++) {
        const st = Q.steps[i]; if (i > 0) h += '<div style="opacity:.5;text-align:center;margin:4px 0 8px">&#10022;</div>';
        para(fill(st.talk, st)); if (i < q.step - 1) para(fill(st.complete, st));
      }
      if (q.step > Q.steps.length) para(fill(Q.done, null));
      help.innerHTML = h + '<button class="btn" data-a="hide">Remove from quest log</button><button class="btn" data-a="close">Close</button>' +
        '<div class="info" style="margin-top:6px;opacity:.75">Removing keeps your progress. Speak to ' + who(Q.giver) + ' again to pick it back up where you left off.</div>';
      help.style.display = 'block'; help.scrollTop = 0;
      help.querySelector('[data-a=close]').onclick = () => { help.style.display = 'none'; };
      help.querySelector('[data-a=hide]').onclick = () => { help.style.display = 'none'; api.cmd({ c: 'qhide', id }); chatLine(Q.name + ' is off your quest log. Speak to ' + (who(Q.giver).replace(/<[^>]+>/g, '')) + ' to take it up again.', 'sys'); };
    };
    { const r0 = K.refresh; K.refresh = w => { r0(w); if (st.chest) K.drawChest(); }; }   /* the chest window follows the bag and the wallet */
    setTab(st.tab);
    return {
      layer, refresh: w => K.refresh(w), chat: chatLine, bubble, fxSplat, setOnline(on) { sayRow.classList.toggle('on', !!on); }, menu, hideMenu, dialog, confirm, playerStats, travel, netLost, newVersion, elsewhere, overhead, setPos, setPoison, openShop: id => K.openShop(id), closeShop: () => K.closeShop(), openChest: () => K.openChest(), closeChest: () => K.closeChest(), drawChest: () => K.drawChest(), get shopOpen() { return st.shopId; }, showHelp, splat, hpBar, tag, marker, xpDrop, levelUp, death, setOpp, setHover, fatal,
      drawMinimap, setTab, creator: o => K.creator(o), get creatorOpen() { return K.creatorOpen(); }, get tab() { return st.tab; }, examine, itemOptions,
      isUI(t) { return t && t !== host && !t.classList.contains('gl') && ui.contains(t); }
    };
  }

  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hud', { api: 1, v: 2, needs: { hudart: 1, hudpanels: 1, hudshop: 1, huddrag: 1, hudcreator: 1, hudchest: 1 } },
    deps => { A = deps.hudart; PARTS = [deps.hudpanels, deps.hudshop, deps.huddrag, deps.hudcreator, deps.hudchest]; return { api: 1, create }; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
