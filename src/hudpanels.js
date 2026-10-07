/* ASHVALE 3D HUD side panels, split out of hud.js (2026-10-02: "modularize the HUD"): inventory, worn equipment,
   skills, combat styles, quests and settings, plus the weight bar. install(K) sets K.refresh(which). */
(function (G) {
  'use strict';
  function install(K) {
    const { api, core, P, A, panel } = K, ST = K.st;
    function refresh(which) {
      const p = P(); if (!p) return;
      K.updateOrbs();
      if (!which || which === 'all') which = ST.tab;
      if (which !== ST.tab && which !== 'shop') { if (ST.shopId && (which === 'inv' || which === 'all')) K.drawShop(); return; }
      if (ST.shopId) K.drawShop();
      if (!ST.tab) return;
      if (ST.tab === 'inv') {
        panel.innerHTML = weightBar(p) + '<div class="inv"></div>'; const g = panel.querySelector('.inv');
        p.inv.forEach((it, i) => { const s = K.el('slot', g, K.slotHtml(it)); s.dataset.i = i; if (it) K.invPointer(s, i); });
      } else if (ST.tab === 'equip') {
        let h = '<h4>Worn Equipment</h4><div class="equip">';
        for (const k of A.EQ_LAYOUT) h += k ? '<div class="slot ' + (p.eq[k] ? '' : 'empty ') + (A.EQ_ACTIVE[k] ? '' : 'off') + '" data-k="' + k + '" data-l="' + k + '">' + K.slotHtml(p.eq[k]) + '</div>' : '<div></div>';
        const b = core.bonuses(p);
        h += '</div><div class="bon">' + [['Attack', b.attack], ['Strength', b.strength], ['Defence', b.defence], ['Ranged', b.ranged], ['Ranged str', b.rstr], ['Magic', b.magic], ['Prayer', b.prayer]].map(([k, v]) => k + '<b>' + (v >= 0 ? '+' : '') + v + '</b>').join('') + '</div><div class="info">' + (core.capacity ? 'Carrying ' + (core.carried(p) / 1000).toFixed(1) + ' / ' + (core.capacity(p) / 1000).toFixed(0) + ' kg<br>' : '') + 'Max hit ' + core.maxHit(p) + ' · ' + (core.attackSpeed(p) * 0.6).toFixed(1) + 's per attack</div>';
        panel.innerHTML = h;
        for (const s of panel.querySelectorAll('.equip .slot[data-k]')) { const k = s.dataset.k; if (p.eq[k]) K.longPress(s, () => api.cmd({ c: 'unequip', eq: k }), (x, y) => K.menu(x, y, [{ html: 'Remove <span class="o">' + A.esc(core.item(p.eq[k].id).name) + '</span>', fn: () => api.cmd({ c: 'unequip', eq: k }) }, { html: 'Examine <span class="o">' + A.esc(core.item(p.eq[k].id).name) + '</span>', fn: () => K.chatLine(K.examine(p.eq[k].id, p.eq[k].n), 'sys') }])); }
      } else if (ST.tab === 'wallet') {
        /* the arcade wallet (2026-10-04): gear NFTs, resource tokens and GOLD made by @ashvale - what you can trade */
        const W = api.walletState ? api.walletState() : { status: 'off' }, D = W.data;
        let h = '<h4>Wallet</h4>';
        if (W.status === 'off') h += '<div class="info">This copy of the game has no wallet view.</div>';
        else if (W.status === 'signed-out') h += '<div class="info">Sign in to DogecoinArcade and play from the Games tab to see what your wallet holds.</div>';
        else if (W.status === 'loading' && !D) h += '<div class="info">Reading your wallet…</div>';
        else if (W.status === 'error' && !D) h += '<div class="info">Could not read your wallet: ' + A.esc(W.error) + '</div>';
        if (D) {
          h += '<div class="info" style="text-align:center;margin:0 0 6px"><span class="o">GOLD</span> ' + (D.gold || 0).toLocaleString('en-US') + '</div>';
          const gear = Object.keys(D.gear), toks = Object.keys(D.tokens).filter(k => D.tokens[k] > 0);
          h += '<div class="inv">';
          for (const k of gear) h += '<div class="slot" title="' + A.esc((core.item(k) || {}).name || k) + ' (NFT)">' + K.slotHtml({ id: k, n: D.gear[k].length > 1 ? D.gear[k].length : 1 }) + '</div>';
          for (const k of toks) h += '<div class="slot" title="' + A.esc((core.item(k) || {}).name || k) + ' (token)">' + K.slotHtml({ id: k, n: D.tokens[k] }) + '</div>';
          h += '</div>';
          /* gear NFTs you own but do not carry or wear yet: take one into your bag (the hawk rings, 2026-10-04) */
          const held = (k) => (me.inv || []).filter(q => q && q.id === k).length + Object.values(me.eq || {}).filter(q => q && q.id === k).length, me = core.S.players[api.pid] || {};
          const CS = api.chestState ? api.chestState().chest : {};   /* what is in the chest, by the same ledger */
          for (const k of gear) if ((CS[k] || 0) > 0 && D.gear[k].length > held(k)) h += '<button class="btn" data-take="' + A.esc(k) + '">Take ' + A.esc((core.item(k) || {}).name || k) + ' into your bag</button>';
          if (!gear.length && !toks.length) h += '<div class="info">No ASHVALE gear or resources in this wallet yet.</div>';
          h += '<div class="info">Gear here is NFTs and resources are tokens: you can trade them with other players or on the arcade.</div>';
        }
        if (W.status !== 'off' && W.status !== 'signed-out') h += '<button class="btn" data-wr="1">' + (W.status === 'loading' ? 'Reading…' : 'Refresh') + '</button>';
        panel.innerHTML = h;
        const rb = panel.querySelector('[data-wr]'); if (rb) rb.onclick = () => api.walletRefresh && api.walletRefresh();
        panel.querySelectorAll('[data-take]').forEach(b => b.onclick = () => api.walletTake && api.walletTake(b.dataset.take));
      } else if (ST.tab === 'skills') {
        let tot = 0; let h = '<h4>Skills</h4><div class="skills">';
        for (const s of A.SKILL_ORDER) { const L = core.lv(p, s); tot += L; h += '<div class="sk" data-s="' + s + '">' + A.SKI[s] + A.cap(s).slice(0, 9) + '<span>' + (s === 'hitpoints' ? p.hp + '/' : '') + L + '</span></div>'; }
        h += '</div><div class="info">Total level: ' + tot + ' · Combat: ' + core.combatLevel(p) + '<br>';
        if (ST.skillSel) { const L = core.lv(p, ST.skillSel), xp = Math.floor(p.xp[ST.skillSel] / 10), nx = core.xpFor(L + 1); h += '<span class="w" style="font-weight:400">' + A.esc(A.SKILL_INFO[ST.skillSel] || '') + '</span><br><span class="o">' + A.cap(ST.skillSel) + '</span> XP: ' + xp.toLocaleString() + (L < 99 ? '<br>Next level at: ' + nx.toLocaleString() + ' (' + (nx - xp).toLocaleString() + ' to go)' : ''); }
        else h += 'Tap a skill to see what it does. <span class="o">Defence</span> makes you harder to hit.';
        panel.innerHTML = h + '</div>';
        for (const s of panel.querySelectorAll('.sk')) s.onclick = () => { ST.skillSel = s.dataset.s; refresh('skills'); };
      } else if (ST.tab === 'combat') {
        const w = p.eq.weapon ? core.item(p.eq.weapon.id) : null, st = core.styles(p), cur = p.styles[core.wclass(p)] || 0;
        let h = '<h4>' + A.esc(w ? w.name : 'Unarmed') + '</h4><div class="info" style="text-align:center;margin:0 0 6px">Combat level ' + core.combatLevel(p) + '</div>';
        st.forEach((s, i) => { h += '<button class="btn ' + (i === cur ? 'on' : '') + '" data-i="' + i + '">' + s.name + '<small>' + s.xp.map(A.cap).join(' + ') + ' XP' + (s.spd ? ', faster' : '') + (s.rng ? ', +2 range' : '') + '</small></button>'; });
        h += '<button class="btn ' + (p.retal ? 'on' : '') + '" data-r="1">Auto Retaliate: ' + (p.retal ? 'On' : 'Off') + '</button>';
        if (core.wclass(p) === 'magic') h += '<div class="info">Casting: ' + core.spell(p)[2] + ' (max hit ' + core.spell(p)[1] + ')</div>';
        panel.innerHTML = h;
        for (const b of panel.querySelectorAll('.btn[data-i]')) b.onclick = () => api.cmd({ c: 'style', i: +b.dataset.i });
        panel.querySelector('[data-r]').onclick = () => api.cmd({ c: 'retal', on: !p.retal });
      } else if (ST.tab === 'quest') {
        let h = '<h4>Quests</h4>';
        const Q = core.D.quests.quests;
        const NM = {}; for (const z of (core.zoneIndex ? core.zoneIndex() : core.D.zones) || []) for (const n of z.npcs || []) if (!(n.id in NM)) NM[n.id] = n.name;   /* every zone's people, loaded or not (zoneindex) */
        /* @cinderwalker 2026-10-05: the panel said "slay 8 undefineds" for a quest that wants logs, and sent everyone to
           Elder Maren whatever quest they held. Every goal kind and every giver now says what it actually is - and
           running that wording over every goal in the data found a second one: "Logs" and "Oak logs" are already
           plural, so a name whose last word ends in s takes no ending at all ("bring 8 logs", not "logses"), and a
           deer or a trout is a deer or a trout at any number. */
        const IRREG = { deer: 1, trout: 1, salmon: 1, fish: 1, cod: 1, plaice: 1, bream: 1, sheep: 1 };
        const many = (w, n) => {
          if (n <= 1) return w;
          const last = w.slice(w.lastIndexOf(' ') + 1);
          if (IRREG[last]) return w;
          if (/s$/.test(last)) return w;
          return /f$/.test(last) ? w.slice(0, -1) + 'ves' : (/(x|z|ch|sh)$/.test(last) ? w + 'es' : w + 's');
        };
        const who = (id) => A.esc(NM[id] || id || 'the one who gave it');
        for (const id in Q) {
          const q = p.quests[id], st = q ? Q[id].steps[q.step - 1] : null;
          if (q && q.hid) continue;   /* removed from the log; the progress is still there */
          const col = !q ? 'r' : !st ? 'g' : 'y';
          /* a quest you have started opens its story (2026-10-06: "each one of the quests should be clickable") */
          h += '<div class="qrow"' + (q ? ' data-q="' + A.esc(id) + '" style="cursor:pointer"' : '') + '><div class="' + col + '" style="margin-bottom:4px">' + A.esc(Q[id].name) + (q ? ' <span style="opacity:.6">&#9656;</span>' : '') + '</div><div class="info" style="margin:0 0 8px">';
          const held = (iid) => { let c = 0; for (const s of p.inv || []) if (s && s.id === iid) c += s.n; return c; };
          const g = st && st.goal, need = g ? (g.n == null ? 1 : g.n) : 1;
          const ready = !!(st && g && (!((g.kill || g.cook || g.talk) && (q.n | 0) < need)) && !(g.bring && held(g.bring) < (g.bn == null ? need : g.bn)) && !(g.with && held(g.with) < (g.wn == null ? 1 : g.wn)));
          if (!q) h += 'Speak to ' + who(Q[id].giver) + '.';
          else if (!st) { h += 'Completed!'; const FL = (core.D.rules && core.D.rules.flags) || {}; for (const k in FL) if (FL[k].quest === id && core.hasFlag(p, k)) h += '<br><span class="g">' + A.esc(A.cap(FL[k].name)) + '</span> is on you.' + (FL[k].desc ? ' ' + A.esc(FL[k].desc.replace(/^[^:]*: /, '')).replace(/^./, c => c.toUpperCase()) : ''); }
          else if (ready) h += 'Return to ' + who(st.ends || Q[id].giver) + '.';
          else {
            const have = q.n | 0;
            const iname = (iid) => { const it = core.item ? core.item(iid) : (core.D.items || {})[iid]; return A.esc((it && it.name ? it.name : iid).toLowerCase()); };
            if (g.kill && g.bring) {
              const m = core.D.monsters[g.kill], bn = g.bn == null ? need : g.bn;
              h += 'Step ' + q.step + ': slay ' + many(A.esc((m ? m.name : g.kill).toLowerCase()), need) + ' (' + have + '/' + need + ') and bring ' + many(iname(g.bring), bn) + ' (' + held(g.bring) + '/' + bn + ').';
            }
            else if (g.kill) { const m = core.D.monsters[g.kill]; h += 'Step ' + q.step + ': slay ' + many(A.esc((m ? m.name : g.kill).toLowerCase()), need) + ' (' + have + '/' + need + ').'; }
            else if (g.cook) h += 'Step ' + q.step + ': cook ' + many(iname(g.cook), need) + ' (' + have + '/' + need + ').';
            else if (g.bring) {
              const bn = g.bn == null ? need : g.bn;
              h += 'Step ' + q.step + ': bring ' + many(iname(g.bring), bn) + ' (' + held(g.bring) + '/' + bn + ')' + (g.with ? ' and ' + many(iname(g.with), g.wn == null ? 1 : g.wn) + ' (' + held(g.with) + '/' + (g.wn == null ? 1 : g.wn) + ')' : '') + '.';
            }
            else if (g.talk) h += 'Step ' + q.step + ': talk to ' + who(g.talk) + (need > 1 ? ' ' + need + ' times' : '') + '.';
            else h += 'Step ' + q.step + ': ask ' + who(Q[id].giver) + ' what is left to do (' + have + '/' + need + ').';
          }
          h += '</div></div>';
        }
        panel.innerHTML = h;
        for (const el of panel.querySelectorAll('[data-q]')) el.onclick = () => K.questStory(el.dataset.q, who);
      } else if (ST.tab === 'prayer') {
        /* the prayer book (2026-10-07): every prayer from RuneScape's standard book in level order; the overhead protections
           work now, the rest are shown greyed as "coming soon". Tap one to switch it on or off. */
        const L = core.lv(p, 'prayer'), mx = core.maxPp(p), pv = p.pp | 0;
        let h = '<h4>Prayer</h4><div class="info" style="text-align:center;margin:0">Prayer points <span class="y">' + pv + ' / ' + mx + '</span></div><div class="ppbar"><i style="width:' + (100 * pv / Math.max(1, mx)) + '%"></i></div><div class="prayers">';
        for (const q of core.prayers()) {
          const on = !!(p.pray && p.pray[q.id]);
          h += '<div class="pry' + (on ? ' on' : '') + (q.soon ? ' soon' : L < q.level ? ' low' : '') + (ST.praySel === q.id ? ' sel' : '') + '" data-p="' + q.id + '" title="' + A.esc(q.name) + '">' + A.prayIcon(q) + '<span class="lv">' + q.level + '</span></div>';
        }
        const sq = ST.praySel && core.prayer(ST.praySel);
        const secs = (t) => { const v = Math.round(t * 0.6); return v >= 60 ? Math.floor(v / 60) + 'm ' + String(v % 60).padStart(2, '0') + 's' : v + 's'; };
        const left = core.prayTicks(p), full = core.prayTicks(p, mx, 12);
        h += '</div><div class="info" style="text-align:center">' + (left != null ? 'Time left: <span class="y">' + secs(left) + '</span><br>' : '') + 'Prayer ' + L + ': a full bar holds a protection prayer for ' + secs(full) + '. Each level adds about 3s.' + (core.bonuses(p).prayer ? ' Prayer bonus <span class="g">+' + core.bonuses(p).prayer + '</span> from your gear makes it last longer.' : '') + '</div>';
        h += '<div class="info">' + (sq ? '<span class="o">' + A.esc(sq.name) + '</span> (level ' + sq.level + ')' + (sq.soon ? ' <span class="r">coming soon</span>' : '') + '<br>' + A.esc(sq.desc || '') : 'Tap a prayer to switch it on. Points drain while it is on; recharge at the altar in the church.') + '</div>';
        panel.innerHTML = h;
        for (const b of panel.querySelectorAll('[data-p]')) b.onclick = () => {
          const id = b.dataset.p, q = core.prayer(id); ST.praySel = id;
          if (q && !q.soon) api.cmd({ c: 'pray', id, on: !(p.pray && p.pray[id]) });
          else if (q) K.chatLine(q.name + ' is coming soon.', 'sys');
          refresh('prayer');
        };
      } else if (ST.tab === 'magic') {
        panel.innerHTML = '<h4>Magic</h4><div class="soonbox">' + A.ICON.magic.replace('<svg ', '<svg style="width:42px;height:42px;display:block;margin:0 auto 8px" ') + 'Available soon<small>Spellbooks are on their way. Until then, a staff in hand casts its own spell (see Combat).</small></div>';
      } else if (ST.tab === 'settings') {
        const S = api.settings();
        panel.innerHTML = '<h4>Settings</h4>' +
          '<div class="info" style="margin:0 0 4px">Walk: tap or click. Run: double-tap or double-click.</div>' +
          '<button class="btn ' + (S.runToggle ? 'on' : '') + '" data-a="runtoggle">Run: ' + (S.runToggle ? 'always (hold Shift to walk)' : 'only on double-click') + '</button>' +
          '<button class="btn ' + (S.sound ? 'on' : '') + '" data-a="sound">Sound: ' + (S.sound ? 'On' : 'Off') + '</button>' +
          '<button class="btn ' + (S.shadows ? 'on' : '') + '" data-a="shadows">Shadows: ' + (S.shadows ? 'On' : 'Off') + '</button>' +
          '<button class="btn" data-a="cam">Reset camera</button><button class="btn" data-a="help">Controls &amp; help</button>' +
          '<button class="btn" data-a="new">' + (ST.newGameArm ? 'Tap again: start over' : 'New character') + '</button>' +
          '<div class="info" style="font-size:10px;color:#c8b48a">' + A.esc(api.modulesText()) + '</div>';
        for (const b of panel.querySelectorAll('.btn')) b.onclick = () => {
          const a = b.dataset.a;
          if (a === 'run') api.cmd({ c: 'run', on: !p.run }); else if (a === 'runtoggle') api.toggle('runToggle'); else if (a === 'sound') api.toggle('sound'); else if (a === 'shadows') api.toggle('shadows');
          else if (a === 'cam') api.resetCamera(); else if (a === 'help') K.showHelp(true);
          else if (a === 'new') { if (ST.newGameArm) api.newGame(); else { ST.newGameArm = 1; setTimeout(() => { ST.newGameArm = 0; refresh('settings'); }, 3000); } }
          setTimeout(() => refresh('settings'), 50);
        };
      }
    }
    function weightBar(p) {
      if (!core.carried || !core.capacity) return '';
      const w = core.carried(p) / 1000, c = core.capacity(p) / 1000, b = core.burden ? core.burden(p) : (w > c ? 1 : 0);
      return '<div class="wbar' + (b ? ' heavy' : '') + '" title="Carried (inventory + worn) / capacity"><i style="width:' + Math.min(100, 100 * w / c) + '%"></i><span>' + w.toFixed(1) + ' / ' + c.toFixed(0) + ' kg</span></div>' +
        (b ? '<div class="wtag">' + (b === 2 ? 'TOO HEAVY TO MOVE' : 'OVERBURDENED') + '</div>' : '');
    }
    K.refresh = refresh;
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudpanels', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
