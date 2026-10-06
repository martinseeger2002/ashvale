"""Hawk rings (2026-10-04: "put two magical rings in the game. When they are in the inventory, they do nothing, but
when they are worn by the user, they should turn the user character into a hawk flying above the tree line. With zoom
vision." Two @ashvale NFTs, one each to @apple and @yourfirstname).
  data (tools/make_data.py, make_parts.py, make_assets.py): item ring_hawk (jewellery/ring -> the ring slot, trait
        Form = hawk, an NFT with 2 copies), the ring's ground model, the hawk's model (char.hawk, a bird body)
  core  wearing a Form-hawk ring: you fly - every step is open (trees, walls, water, rock), two a tick, no run energy;
        monsters and shy animals pay a hawk no mind; a hawk cannot fight, gather, trade, take, cook, climb or talk.
        Put it on only out in the open (not upstairs or indoors); take it off only over open ground (you land there).
  engine the hawk is drawn instead of the person, 14 m up (over the tree line), wings beating; other players see it
        too (the ring rides in the gear message); the camera can pull out to 48 m, looking down (zoom vision) while you fly."""
import os, sys
H = sys.argv[1] if len(sys.argv) > 1 else '/home/you/ashvale3d'
def edit(p, a, b):
    p = os.path.join(H, p); s = open(p).read()
    if b in s: return
    assert s.count(a) == 1, (p, a[:100], s.count(a)); open(p, 'w').write(s.replace(a, b))

# ---------------------------------------------------------------- data generators
edit('tools/make_data.py', '''    # meat (2026-10-04: chickens and hens "should drop meat that can be cooked"): cooks like a shrimp''',
     '''    # the hawk ring (2026-10-04): worn, it turns you into a hawk flying over the tree line (src/core.js isHawk)
    "ring_hawk": {"name": "Hawk ring", "kind": "ring", "value": 500, "form": "hawk", "nft": {"copies": 2, "key": "ring_hawk"}},
    # meat (2026-10-04: chickens and hens "should drop meat that can be cooked"): cooks like a shrimp''')
edit('tools/make_data.py', '''    "pack": ("pack", "pack")}''', '''    "pack": ("pack", "pack"), "ring": ("jewellery", "ring")}''')
edit('tools/make_data.py', '''           "body": 12, "chainbody": 9, "legs": 8, "hat": 0.2, "cape": 0.8, "coins": 0.002, "arrows": 0.02}''',
     '''           "body": 12, "chainbody": 9, "legs": 8, "hat": 0.2, "cape": 0.8, "coins": 0.002, "arrows": 0.02, "ring": 0.01}''')
edit('tools/make_data.py', '''         "potion": lambda sub, k: "item.potion",''', '''         "potion": lambda sub, k: "item.potion", "jewellery": lambda sub, k: "item.ring",''')
edit('tools/make_data.py', '''         ("effect", "Effect", None),''', '''         ("form", "Form", None), ("effect", "Effect", None),''')
edit('tools/make_data.py', '''                       "ammo": ["arrow"], "currency": ["gold"]},''', '''                       "ammo": ["arrow"], "currency": ["gold"], "jewellery": ["ring"]},''')
edit('tools/make_data.py', '''                  "armour/kiteshield": "shield", "ammo": "ammo", "pack": "pack", "cosmetic/hat": "head", "cosmetic/cape": "cape"},''',
     '''                  "armour/kiteshield": "shield", "ammo": "ammo", "pack": "pack", "cosmetic/hat": "head", "cosmetic/cape": "cape", "jewellery/ring": "ring"},''')
edit('tools/make_data.py', '''        "traits": {"Attack": "attack",''', '''        "traits": {"Form": "form", "Attack": "attack",''')
edit('tools/make_parts.py', "\nif __name__ == '__main__':", '''
# the hawk ring and the hawk it makes of you (2026-10-04)
part('item.ring', 'item', items={"ring_hawk": "#d9b040"}, shapes=[S('torus', [0.05, 0.012], "$c", [0, 0.012, 0], seg=[6, 16], r=[PI / 2, 0, 0]), sph(0.02, "#7a3a2a", 0, 0.06, 0, 6, 4)])
part('char.hawk', 'char', role='monster', name='Hawk', body='bird', bird={"size": 3.2, "color": "#7a5634", "tail": "#4a3420", "legs": "#d8b040"})

if __name__ == '__main__':''')
edit('tools/make_assets.py', "GEAR = ('weapon', 'armour', 'tool', 'pack', 'cosmetic')", "GEAR = ('weapon', 'armour', 'tool', 'pack', 'cosmetic', 'jewellery')   # jewellery: the hawk ring (2026-10-04)")

# ---------------------------------------------------------------- core rules
edit('src/core.js', "    let LV_LIMIT = -1;   /* while a player on an upper floor moves, the building they are in (they cannot step out of it) */",
     "    let LV_LIMIT = -1;   /* while a player on an upper floor moves, the building they are in (they cannot step out of it) */\n"
     "    let FLY = false;   /* while a hawk moves: every step is open (the operator's hawk ring) */\n"
     "    const isHawk = (p) => !!(p && p.eq && p.eq.ring && IT[p.eq.ring.id] && IT[p.eq.ring.id].form === 'hawk');")
edit('src/core.js', "      const nx = x + dx, ny = y + dy;\n      if (!inMap(nx, ny) || M.blocked(nx, ny)) return false;",
     "      const nx = x + dx, ny = y + dy;\n      if (FLY) return inMap(nx, ny);   /* a hawk flies over trees, walls and water */\n      if (!inMap(nx, ny) || M.blocked(nx, ny)) return false;")
edit('src/core.js', "    function apply(p, c) { LV_LIMIT = p.lv > 0 && M.buildingAt ? p.bld : -1; try { apply0(p, c); } finally { LV_LIMIT = -1; } }",
     "    function apply(p, c) { LV_LIMIT = p.lv > 0 && M.buildingAt ? p.bld : -1; FLY = isHawk(p); try { apply0(p, c); } finally { LV_LIMIT = -1; FLY = false; } }")
edit('src/core.js', "    function playerTick(p) { LV_LIMIT = p.lv > 0 && M.buildingAt ? p.bld : -1; try { playerTick0(p); } finally { LV_LIMIT = -1; } }",
     "    function playerTick(p) { LV_LIMIT = p.lv > 0 && M.buildingAt ? p.bld : -1; FLY = isHawk(p); try { playerTick0(p); } finally { LV_LIMIT = -1; FLY = false; } }")
edit('src/core.js', "      if (c.c === 'walk' || c.c === 'attack' || c.c === 'take' || c.c === 'npc' || c.c === 'gather') { p.runNow = !!c.run; p._spread = 0; }",
     "      if (FLY && ['attack', 'take', 'npc', 'gather', 'light', 'climb', 'buy', 'sell', 'trade'].indexOf(c.c) >= 0) { msg(p, 'A hawk can only fly. Take off the ring over open ground to land.', 'warn'); return; }\n"
     "      if (c.c === 'walk' || c.c === 'attack' || c.c === 'take' || c.c === 'npc' || c.c === 'gather') { p.runNow = !!c.run; p._spread = 0; }")
edit('src/core.js', "      let steps = p.runNow && p.energy > 0 && p.path.length > 1 ? 2 : 1;",
     "      let steps = FLY ? (p.path.length > 1 ? 2 : 1) : p.runNow && p.energy > 0 && p.path.length > 1 ? 2 : 1;   /* a hawk always flies fast, for free */")
edit('src/core.js', "      if (moved === 2) { addXp(p, 'dexterity',", "      if (moved === 2 && !FLY) { addXp(p, 'dexterity',")
edit('src/core.js', "      const s = p.inv[slot]; if (!s) return; const d = IT[s.id]; if (!d.eq) return;\n      const f = reqFail(p, d); if (f) { msg(p, f, 'warn'); return; }",
     "      const s = p.inv[slot]; if (!s) return; const d = IT[s.id]; if (!d.eq) return;\n      const f = reqFail(p, d); if (f) { msg(p, f, 'warn'); return; }\n"
     "      if (d.form === 'hawk' && (p.lv > 0 || M.insideAt(p.x, p.y))) { msg(p, 'You need open sky to take flight. Go outside first.', 'warn'); return; }")
edit('src/core.js', "      const e = p.eq[k]; if (!e) return;\n      if (!canAdd(p, e.id, 1)) { msg(p, 'Not enough space in your inventory.', 'warn'); return; }",
     "      const e = p.eq[k]; if (!e) return;\n      if (!canAdd(p, e.id, 1)) { msg(p, 'Not enough space in your inventory.', 'warn'); return; }\n"
     "      if (IT[e.id] && IT[e.id].form === 'hawk' && (M.blocked(p.x, p.y) || M.insideAt(p.x, p.y))) { msg(p, 'Fly to open ground first: there is nowhere to land here.', 'warn'); return; }")
# monsters and shy animals ignore a hawk
edit('src/core.js', "        if (q.dead || q.lv > 0 || S.t - q.spawnT <= 8 || combatLevel(q) > md.level * 2 || M.zoneAt(q.x, q.y) !== m.zone) continue;   /* monsters keep to the ground floor */",
     "        if (q.dead || q.lv > 0 || isHawk(q) || S.t - q.spawnT <= 8 || combatLevel(q) > md.level * 2 || M.zoneAt(q.x, q.y) !== m.zone) continue;   /* monsters keep to the ground floor, and cannot reach a hawk */")
edit('src/core.js', "        for (const pid of S.order) { const q = S.players[pid]; if (!q.dead && S.t - q.spawnT > 8 && cheb(q.x, q.y, m.x, m.y) <= sightOf(m, md)",
     "        for (const pid of S.order) { const q = S.players[pid]; if (!q.dead && !isHawk(q) && S.t - q.spawnT > 8 && cheb(q.x, q.y, m.x, m.y) <= sightOf(m, md)")
edit('src/core.js', "        for (const pid of S.order) { const o = S.players[pid]; if (o.dead || o.lv > 0) continue; const d = cheb(o.x, o.y, m.x, m.y); if (d < qd) { qd = d; q = o; } }",
     "        for (const pid of S.order) { const o = S.players[pid]; if (o.dead || o.lv > 0 || isHawk(o)) continue; const d = cheb(o.x, o.y, m.x, m.y); if (d < qd) { qd = d; q = o; } }")
edit('src/core.js', "      lv, maxHp, combatLevel,", "      isHawk, lv, maxHp, combatLevel,")

# ---------------------------------------------------------------- engine: the hawk, its height, the zoom
edit('src/engine.js', "      function gearOf(p) { const g = {}; for (const k of ['head', 'cape', 'pack', 'body', 'legs', 'weapon', 'shield', 'ammo']) g[k] = p.eq[k] ? p.eq[k].id : null; return g; }",
     "      function gearOf(p) { const g = {}; for (const k of ['head', 'cape', 'pack', 'body', 'legs', 'weapon', 'shield', 'ammo', 'ring']) g[k] = p.eq[k] ? p.eq[k].id : null; return g; }\n"
     "      /* the hawk ring: an entity wearing it is drawn as a hawk HAWK_ALT m up, wings beating (the operator) */\n"
     "      const HAWK_ALT = 14, ringHawk = (id) => !!(id && D.items[id] && (D.items[id].attributes || []).some(a => a.trait_type === 'Form' && a.value === 'hawk'));\n"
     "      function hawkify(e, ring) {\n"
     "        const on = ringHawk(ring); if (!!e.hawk === on) return;\n"
     "        if (on) { e.hawk = MOD.monster('hawk'); e.root.add(e.hawk.object); e.hawk.play('run', { loop: true }); e.H.object.visible = false; e.alt = HAWK_ALT; }\n"
     "        else { e.root.remove(e.hawk.object); e.hawk = null; e.H.object.visible = true; e.alt = 0; }\n"
     "        if (e === myEnt) { cam.tdist = on ? 34 : 11; cam.tpitch = on ? 0.75 : 0.6; }\n"
     "      }")
edit('src/engine.js', "          case 'equip': { const t = ents.get('p:' + e.p); if (t) t.H.setGear(gearOf(core.S.players[e.p]));",
     "          case 'equip': { const t = ents.get('p:' + e.p); if (t) { const g = gearOf(core.S.players[e.p]); t.H.setGear(g); hawkify(t, g.ring); }")
edit('src/engine.js', "        if (d.g && typeof d.g === 'object' && sameSet(d.g, r.e.H.gear) === false) r.e.H.setGear(d.g);",
     "        if (d.g && typeof d.g === 'object' && sameSet(d.g, r.e.H.gear) === false) r.e.H.setGear(d.g);\n"
     "        if (d.g && typeof d.g === 'object') hawkify(r.e, d.g.ring);   /* another player's hawk ring */")
edit('src/engine.js', "      myEnt.H.setGear(gearOf(me)); place(myEnt, me.x, me.y);", "      myEnt.H.setGear(gearOf(me)); place(myEnt, me.x, me.y); setTimeout(() => hawkify(myEnt, me.eq.ring && me.eq.ring.id), 0);")
edit('src/engine.js', "e.root.position.y = heightAt(e.root.position.x, e.root.position.z) + (e.key.charAt(0) === 'p' ? ((core.S.players[e.key.slice(2)] || {}).lv || 0) * 1.8 : 0); }   /* on an upper floor */",
     "e.root.position.y = heightAt(e.root.position.x, e.root.position.z) + (e.key.charAt(0) === 'p' ? ((core.S.players[e.key.slice(2)] || {}).lv || 0) * 1.8 : 0) + (e.alt || 0); }   /* on an upper floor; a hawk over the trees */")
edit('src/engine.js', "          r.e.root.position.set(x, heightAt(x, z), z); r.e.tyaw = Bs.f;", "          r.e.root.position.set(x, heightAt(x, z) + (r.e.alt || 0), z); r.e.tyaw = Bs.f;")
edit('src/engine.js', "        cam.tpitch = Math.max(0.3, Math.min(1.42, cam.tpitch)); cam.tdist = Math.max(4.5, Math.min(24, cam.tdist));",
     "        cam.tpitch = Math.max(myEnt.hawk ? 0.72 : 0.3, Math.min(1.42, cam.tpitch)); cam.tdist = Math.max(4.5, Math.min(myEnt.hawk ? 48 : 24, cam.tdist));   /* zoom vision while a hawk: twice as far out, looking down so the view stays on loaded land */")
edit('src/engine.js', "          r.e.H.update(dt);", "          r.e.H.update(dt); if (r.e.hawk) r.e.hawk.update(dt);")
edit('src/engine.js', "          if (e.root.visible) e.H.update(dt);", "          if (e.root.visible) { e.H.update(dt); if (e.hawk) e.hawk.update(dt); }")
# ---------------------------------------------------------------- the wallet tab: bring an owned gear NFT into the game
edit('src/hudpanels.js', """          if (!gear.length && !toks.length) h += '<div class="info">No ASHVALE gear or resources in this wallet yet.</div>';""",
     """          /* gear NFTs you own but do not carry or wear yet: take one into your bag (the hawk rings, 2026-10-04) */
          const held = (k) => (me.inv || []).filter(q => q && q.id === k).length + Object.values(me.eq || {}).filter(q => q && q.id === k).length, me = core.S.players[api.pid] || {};
          for (const k of gear) if (D.gear[k].length > held(k)) h += '<button class="btn" data-take="' + A.esc(k) + '">Take ' + A.esc((core.item(k) || {}).name || k) + ' into your bag</button>';
          if (!gear.length && !toks.length) h += '<div class="info">No ASHVALE gear or resources in this wallet yet.</div>';""")
edit('src/hudpanels.js', """        const rb = panel.querySelector('[data-wr]'); if (rb) rb.onclick = () => api.walletRefresh && api.walletRefresh();""",
     """        const rb = panel.querySelector('[data-wr]'); if (rb) rb.onclick = () => api.walletRefresh && api.walletRefresh();
        panel.querySelectorAll('[data-take]').forEach(b => b.onclick = () => api.walletTake && api.walletTake(b.dataset.take));""")
edit('src/engine.js', "          walletState: () => walletState, walletRefresh: () => walletRefresh(),",
     "          walletState: () => walletState, walletRefresh: () => walletRefresh(), pid: PID,\n"
     "          walletTake: (id) => { const W = walletState.data, n = W && W.gear[id] ? W.gear[id].length : 0, have = me.inv.filter(q => q && q.id === id).length + Object.values(me.eq).filter(q => q && q.id === id).length;\n"
     "            if (n > have) { core.grantItem(PID, id, 1); hud.chat('You take your ' + (core.item(id) || {}).name + ' from your wallet.', 'info'); hud.refresh('all'); } },   /* one in the game per NFT you hold */")
print('rings patch applied to', H)
