"""Stairs you can find your way down (2026-10-04: "The stairs in the buildings work for going up, but it's hard to
find how to get back down ... add some details to make it more intuitive"). Apply AFTER the v0.8.4 release.
  world.js  each storeyed building gets `alt`, the tile beside its stairs: flights alternate st / alt floor by floor
            (a switchback), so on a middle floor the way down and the way up are side by side, not on top of each other
  scene.js  every upper floor has an opening where the flight from below arrives (the top steps show through it), a
            railing on three sides and a bobbing amber arrow over it; the flight up starts beside it
  core.js   climbing puts you where that flight arrives (the opening going up, the foot of the flight going down)
  engine.js a click on the opening says Climb down first, on the flight up Climb up first; a floor bar ("Floor 2 of 3 ·
            Downstairs · Upstairs") while you are in a storeyed building, PageUp/PageDown, and a one-time hint"""
import os, sys
H = sys.argv[1] if len(sys.argv) > 1 else '/home/you/ashvale3d'
def edit(p, a, b, n=1):
    p = os.path.join(H, p); s = open(p).read()
    assert s.count(a) == n, (p, a[:90], s.count(a)); open(p, 'w').write(s.replace(a, b))

# ---- world: the alternate flight tile
edit('src/world.js', "      STOREYED.push({ x: o.x, y: o.y, w: o.w, h: o.h, floors: o.floors | 0, stairs: st });",
     "      const alt = [st[0] - 1 > o.x ? st[0] - 1 : st[0] + 1, st[1]];   /* the flights alternate st / alt floor by floor (a switchback) */\n"
     "      STOREYED.push({ x: o.x, y: o.y, w: o.w, h: o.h, floors: o.floors | 0, stairs: st, alt });")
edit('src/world.js', "      buildings: STOREYED, buildingAt, stairsOf: (i) => STOREYED[i] ? STOREYED[i].stairs : null,",
     "      buildings: STOREYED, buildingAt, stairsOf: (i) => STOREYED[i] ? STOREYED[i].stairs : null,\n"
     "      flightOf: (i, f) => { const b = STOREYED[i]; return !b ? null : (f % 2 && b.alt) ? b.alt : b.stairs; },   /* the tile of the flight from floor f up */")

# ---- core: arrive where the flight does
edit('src/core.js', "      p.lv = nl; p.bld = nl > 0 ? bi : -1; p.x = B.stairs[0]; p.y = B.stairs[1];",
     "      const at = M.flightOf ? M.flightOf(bi, dir > 0 ? nl - 1 : nl) : B.stairs;   /* up: out of the opening; down: at the foot of the flight */\n"
     "      p.lv = nl; p.bld = nl > 0 ? bi : -1; p.x = at[0]; p.y = at[1];")
edit('src/core.js', "          if (cheb(p.x, p.y, B.stairs[0], B.stairs[1]) <= 1) climbNow(p, bi, c.dir);",
     "          if (cheb(p.x, p.y, B.stairs[0], B.stairs[1]) <= 1 || (B.alt && cheb(p.x, p.y, B.alt[0], B.alt[1]) <= 1)) climbNow(p, bi, c.dir);")
edit('src/core.js', "      else if (a && a.k === 'climb') { const B = M.buildings[a.bi]; if (B && cheb(p.x, p.y, B.stairs[0], B.stairs[1]) <= 1) climbNow(p, a.bi, a.dir);",
     "      else if (a && a.k === 'climb') { const B = M.buildings[a.bi]; if (B && (cheb(p.x, p.y, B.stairs[0], B.stairs[1]) <= 1 || (B.alt && cheb(p.x, p.y, B.alt[0], B.alt[1]) <= 1))) climbNow(p, a.bi, a.dir);")

# ---- scene: openings, railings, arrows, alternating flights
edit('src/scene.js', "          const stairs = (into, y0) => { for (let k = 0; k < 6; k++) into.add(mesh(new THREE.BoxGeometry(0.9, (k + 1) * WH / 6, 0.16), 0x6a4a2a, st[0] + 0.5, y0 + (k + 1) * WH / 12, st[1] + 0.92 - k * 0.16)); };\n"
     "          if (o.enter) stairs(g, base);",
     "          const alt = [st[0] - 1 > o.x ? st[0] - 1 : st[0] + 1, st[1]], P = f => f % 2 ? alt : st;   /* = world.js flightOf: a switchback */\n"
     "          const stairs = (into, y0, at) => { for (let k = 0; k < 6; k++) into.add(mesh(new THREE.BoxGeometry(0.9, (k + 1) * WH / 6, 0.16), 0x6a4a2a, at[0] + 0.5, y0 + (k + 1) * WH / 12, at[1] + 0.92 - k * 0.16)); };\n"
     "          /* an upper floor: the slab round an opening where the flight from below arrives, a railing on three sides (you\n"
     "             step off at the north end) and a bobbing amber arrow over it - the way down is never hidden (the operator) */\n"
     "          const slab = (into, yb, hole) => {\n"
     "            const X0 = o.x, X1 = o.x + o.w, Z0 = o.y, Z1 = o.y + o.h, hx = hole ? hole[0] : 0, hz = hole ? hole[1] : 0;\n"
     "            const box = (x0, x1, z0, z1) => { if (x1 - x0 > 0.01 && z1 - z0 > 0.01) into.add(mesh(new THREE.BoxGeometry(x1 - x0 + 0.06, 0.12, z1 - z0 + 0.06), 0x9a7046, (x0 + x1) / 2, yb - 0.04, (z0 + z1) / 2)); };\n"
     "            if (!hole) return box(X0, X1, Z0, Z1);\n"
     "            box(X0, X1, Z0, hz); box(X0, X1, hz + 1, Z1); box(X0, hx, hz, hz + 1); box(hx + 1, X1, hz, hz + 1);\n"
     "            const rail = 0x4e3420;\n"
     "            for (const [x, z] of [[hx, hz], [hx + 1, hz], [hx, hz + 1], [hx + 1, hz + 1]]) into.add(mesh(new THREE.BoxGeometry(0.07, 0.95, 0.07), rail, x, yb + 0.47, z));\n"
     "            into.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 1), rail, hx, yb + 0.92, hz + 0.5), mesh(new THREE.BoxGeometry(0.06, 0.06, 1), rail, hx + 1, yb + 0.92, hz + 0.5), mesh(new THREE.BoxGeometry(1, 0.06, 0.06), rail, hx + 0.5, yb + 0.92, hz + 1));\n"
     "            const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), new THREE.MeshBasicMaterial({ color: 0xffc040 })); arrow.rotation.x = Math.PI; arrow.position.set(hx + 0.5, yb + 1.55, hz + 0.5); into.add(arrow);\n"
     "            anim.push({ bob: arrow, y0: yb + 1.55 });\n"
     "          };\n"
     "          if (o.enter) stairs(g, base, P(0));")
edit('src/scene.js', "            sg.add(mesh(new THREE.BoxGeometry(o.w + 0.06, 0.12, o.h + 0.06), 0x9a7046, cx, yb - 0.04, cz));",
     "            slab(sg, yb, o.enter ? P(f - 1) : null);")
edit('src/scene.js', "            if (o.enter && f < FL - 1) stairs(sg, yb);",
     "            if (o.enter && f < FL - 1) stairs(sg, yb, P(f));")
edit('src/scene.js', "          for (const a of anim) if (a.smoke) {",
     "          for (const a of anim) if (a.bob) a.bob.position.y = a.y0 + 0.12 * Math.sin(time * 2.6);\n"
     "          for (const a of anim) if (a.smoke) {")

# ---- engine: the click order, the floor bar, keys, a hint
edit('src/engine.js', """              if (lvM < B.floors - 1) out.push({ html: 'Climb up <span class="c">Stairs</span>', act: { c: 'climb', dir: 1, x: t.x, y: t.y } });
              if (lvM > 0) out.push({ html: 'Climb down <span class="c">Stairs</span>', act: { c: 'climb', dir: -1, x: t.x, y: t.y } });""",
"""              const up = lvM < B.floors - 1 ? { html: 'Climb up <span class="c">Stairs</span>', act: { c: 'climb', dir: 1, x: t.x, y: t.y } } : null;
              const down = lvM > 0 ? { html: 'Climb down <span class="c">Stairs</span>', act: { c: 'climb', dir: -1, x: t.x, y: t.y } } : null;
              /* only the stairs THEMSELVES climb on a left click (the operator: "if I accidentally move into a stair, it just brings
                 me up or down randomly"): the flight up says Climb up, the opening in the floor says Climb down; anywhere else
                 near them a click walks, and the climbs are in the right-click menu after Walk here */
              const hole = lvM > 0 && core.M.flightOf ? core.M.flightOf(bi, lvM - 1) : null, onHole = !!hole && t.x === hole[0] && t.y === hole[1];
              const flight = core.M.flightOf ? core.M.flightOf(bi, lvM) : B.stairs, onFlight = lvM < B.floors - 1 && t.x === flight[0] && t.y === flight[1];
              if (onHole && down) out.push(down); else if (onFlight && up) out.push(up);
              else { out.push({ html: 'Walk here', act: { c: 'walk', x: t.x, y: t.y } }); for (const o of [up, down]) if (o) out.push(o); return out; }""")
edit('src/engine.js', "      function roofCheck() {",
"""      /* the floor bar (the operator: "hard to find how to get back down"): while you are in a building with storeys, which floor
         you are on and a button each way; PageUp / PageDown do the same */
      const floorBar = document.createElement('div');
      floorBar.style.cssText = 'position:absolute;left:50%;top:12px;transform:translateX(-50%);display:none;gap:6px;align-items:center;padding:6px 8px;background:rgba(30,22,14,.88);border:1px solid #8a6a3a;border-radius:8px;color:#f0e2c0;font:600 13px system-ui,sans-serif;z-index:20';
      floorBar.innerHTML = '<span data-f></span><button data-d="-1" style="font:inherit;padding:4px 9px;border-radius:6px;border:1px solid #c08a3a;background:#5a3a1c;color:#ffe2a8;cursor:pointer">&#9660; Downstairs</button><button data-d="1" style="font:inherit;padding:4px 9px;border-radius:6px;border:1px solid #6a5a3a;background:#3a2c1c;color:#f0e2c0;cursor:pointer">&#9650; Upstairs</button>';
      host.appendChild(floorBar);
      let floorKey = '';
      function climbFromBar(dir) { const bi = core.M.buildingAt ? core.M.buildingAt(me.x, me.y) : -1; if (bi < 0) return; const B = core.M.buildings[bi], lv = me.lv || 0; if ((dir < 0 && lv <= 0) || (dir > 0 && lv >= B.floors - 1)) return; send({ c: 'climb', dir, x: B.stairs[0], y: B.stairs[1] }); }
      floorBar.querySelectorAll('[data-d]').forEach(b => { b.onclick = (e) => { e.stopPropagation(); climbFromBar(+b.dataset.d); }; b.onpointerdown = (e) => e.stopPropagation(); });
      window.addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'PageDown') { climbFromBar(-1); e.preventDefault(); } else if (e.key === 'PageUp') { climbFromBar(1); e.preventDefault(); } });
      function floorBarCheck() {
        const bi = core.M.buildingAt ? core.M.buildingAt(me.x, me.y) : -1, B = bi >= 0 ? core.M.buildings[bi] : null, lv = me.lv || 0;
        const key = B ? bi + ':' + lv : '';
        if (key === floorKey) return; floorKey = key;
        if (!B) { floorBar.style.display = 'none'; return; }
        floorBar.style.display = 'flex';
        floorBar.querySelector('[data-f]').textContent = lv === 0 ? 'Ground floor (' + B.floors + ' floors)' : 'Floor ' + (lv + 1) + ' of ' + B.floors;
        floorBar.querySelector('[data-d="-1"]').style.display = lv > 0 ? '' : 'none';
        floorBar.querySelector('[data-d="1"]').style.display = lv < B.floors - 1 ? '' : 'none';
      }
      let stairHint = false;
      function roofCheck() {
        floorBarCheck();
        if (!stairHint && (me.lv || 0) > 0) { stairHint = true; hud.chat('Upstairs. The way down is the opening in the floor with the amber arrow - click it, or press Downstairs / Page Down.', 'info'); }""")
print('patched', H)
