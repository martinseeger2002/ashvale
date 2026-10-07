/* ASHVALE 3D HUD character creator and tailor's wardrobe, split out of hud.js (2026-10-02: "modularize the HUD").
   install(K) adds K.creator(o) and K.creatorOpen(). Hats, capes and the robe cut are Wren's shop NFTs (right-click Trade). */
(function (G) {
  'use strict';
  function install(K) {
    const { api, A } = K, esc = A.esc, cap = A.cap, SKI = A.SKI, START_SKILLS = A.START_SKILLS;
    const cc = K.ccEl;
    function creator(o) {
      const L = JSON.parse(JSON.stringify(o.look)), PA = o.palette;
      const ST = Object.assign({}, o.styles, {
        shirt: (o.styles.shirt || []).filter(s => s !== 'robe'),
        pants: (o.styles.pants || []).filter(s => s !== 'robe')
      });
      L.hat = null; L.cape = null;
      if (L.shirt && L.shirt.style === 'robe') L.shirt = Object.assign({}, L.shirt, { style: ST.shirt[0] || 'tunic' });
      if (L.pants && L.pants.style === 'robe') L.pants = Object.assign({}, L.pants, { style: ST.pants[0] || 'trousers' });
      let hairPicked = !o.first;
      if (!L.body) L.body = 'male';
      let name = o.name || '';
      const cycle = (k, list, d) => { const cur = typeof L[k] === 'object' && L[k] ? L[k].style : L[k]; let i = list.indexOf(cur == null ? null : cur); i = (i + d + list.length) % list.length; const v = list[i];
        if (k === 'shirt' || k === 'pants') L[k] = v == null ? null : Object.assign({ color: (L[k] && L[k].color) || PA.cloth[i % PA.cloth.length] }, L[k] || {}, { style: v }); else L[k] = v; };
      const nice = v => v == null ? 'none' : String(v);
      function draw() {
        const sty = k => { const v = L[k]; return nice(v && typeof v === 'object' ? v.style : v); };
        const sw = (k, list, isObj, allowNone) => (allowNone ? '<button class="sw none ' + (L[k] == null ? 'on' : '') + '" data-k="' + k + '" data-c=""></button>' : '') + list.map(c => '<button class="sw ' + ((isObj ? L[k] && L[k].color : L[k]) === c ? 'on' : '') + '" style="background:' + c + '" data-k="' + k + '" data-c="' + c + '" data-o="' + (isObj ? 1 : '') + '"></button>').join('');
        const cyc = (k, lab) => '<div class="row"><span class="lab">' + lab + '</span><button class="arr" data-cy="' + k + '" data-d="-1">&#9664;</button><span class="val">' + esc(sty(k)) + '</span><button class="arr" data-cy="' + k + '" data-d="1">&#9654;</button></div>';
        cc.innerHTML = '<h3>' + (o.first ? 'Create your adventurer' : esc(o.title || 'Wardrobe')) + '</h3>' +
          (o.first ? '<div class="row"><span class="lab">Name</span><input maxlength="12" value="' + esc(name) + '" placeholder="Your name"></div>' : '') +
          '<div class="row"><span class="lab">Body</span><button class="btn body ' + (L.body !== 'female' ? 'on' : '') + '" data-body="male" style="width:auto;flex:1;margin:0">Male</button><button class="btn body ' + (L.body === 'female' ? 'on' : '') + '" data-body="female" style="width:auto;flex:1;margin:0">Female</button></div>' +
          '<div class="row"><span class="lab">Skin</span>' + sw('skin', PA.skin) + '</div>' +
          cyc('hair', 'Hair') + '<div class="row"><span class="lab"></span>' + sw('hairColor', PA.hair) + '</div>' +
          cyc('beard', 'Beard') +
          cyc('shirt', 'Top') + '<div class="row"><span class="lab"></span>' + sw('shirt', PA.cloth, true) + '</div>' +
          cyc('pants', 'Legs') + '<div class="row"><span class="lab"></span>' + sw('pants', PA.cloth, true) + '</div>' +
          '<div class="row"><span class="lab">Boots</span>' + sw('boots', PA.cloth.slice(6).concat(PA.hair.slice(0, 3))) + '</div>' +
          '<div class="btns"><button class="btn" data-a="rand">Random</button><button class="btn on" data-a="done">' + (o.first ? (o.startPoints ? 'Next: skills' : 'Start adventure') : 'Done') + '</button></div>';
        for (const b of cc.querySelectorAll('[data-body]')) b.onclick = () => { L.body = b.dataset.body; if (!hairPicked) { L.hair = L.body === 'female' ? 'long' : 'short'; if (L.body === 'female') L.beard = null; } changed(); };
        for (const b of cc.querySelectorAll('[data-cy]')) b.onclick = () => { if (b.dataset.cy === 'hair') hairPicked = true; cycle(b.dataset.cy, ST[b.dataset.cy], +b.dataset.d); changed(); };
        for (const b of cc.querySelectorAll('.sw')) b.onclick = () => { const k = b.dataset.k, c = b.dataset.c || null; if (b.dataset.o) L[k] = Object.assign({}, L[k] || {}, { color: c }); else L[k] = c; changed(); };
        const inp = cc.querySelector('input'); if (inp) inp.oninput = () => { name = inp.value; };
        cc.querySelector('[data-a=rand]').onclick = () => { const pick = a => a[Math.floor(Math.random() * a.length)];
          L.body = Math.random() < 0.5 ? 'female' : 'male'; L.skin = pick(PA.skin); L.hair = pick(ST.hair); L.hairColor = pick(PA.hair); L.beard = L.body === 'female' ? null : pick(ST.beard); L.hat = null; L.cape = null;
          L.shirt = { style: pick(ST.shirt), color: pick(PA.cloth) }; L.pants = { style: pick(ST.pants), color: pick(PA.cloth) }; changed(); };
        cc.querySelector('[data-a=done]').onclick = () => { if (o.first && o.startPoints) drawSkills(); else { cc.style.display = 'none'; o.onDone(L, name, null); } };
      }
      function changed() { o.onChange(JSON.parse(JSON.stringify(L))); draw(); api.sfx && api.sfx('click'); }
      const pts = {}, POOL = o.startPoints || 0, MAXP = o.startMax || 5;
      const used = () => Object.values(pts).reduce((a, b) => a + b, 0);
      function drawSkills() {   /* step 2 of the creator: spend the starting points */
        let h = '<h3>Starting skills</h3><div class="pts">' + (POOL - used()) + ' of ' + POOL + ' points left</div><div style="font-size:11px;color:#c8b48a;margin-bottom:4px">Each point is +1 starting level (at most ' + MAXP + ' in one skill). Skills keep growing as you use them.</div>';
        for (const [k, why] of START_SKILLS) { const v = pts[k] || 0; h += '<div class="skl">' + SKI[k] + '<span class="nm">' + cap(k) + '</span><button class="arr" data-m="' + k + '">&minus;</button><span class="v">' + v + '</span><button class="arr" data-p="' + k + '">+</button><small>' + why + '</small></div>'; }
        h += '<div class="btns"><button class="btn" data-a="back">Back</button><button class="btn on" data-a="go">Start adventure</button></div>';
        cc.innerHTML = h;
        for (const b of cc.querySelectorAll('[data-p]')) b.onclick = () => { const k = b.dataset.p; if (used() < POOL && (pts[k] || 0) < MAXP) { pts[k] = (pts[k] || 0) + 1; api.sfx && api.sfx('click'); drawSkills(); } };
        for (const b of cc.querySelectorAll('[data-m]')) b.onclick = () => { const k = b.dataset.m; if (pts[k]) { pts[k]--; if (!pts[k]) delete pts[k]; drawSkills(); } };
        cc.querySelector('[data-a=back]').onclick = () => draw();
        cc.querySelector('[data-a=go]').onclick = () => { cc.style.display = 'none'; o.onDone(L, name, Object.assign({}, pts)); };
      }
      cc.style.display = 'block'; o.onChange(JSON.parse(JSON.stringify(L))); draw();
    }
    K.creator = creator; K.creatorOpen = () => cc.style.display === 'block';
  }
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudcreator', { api: 1, v: 1 }, () => ({ api: 1, install }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
