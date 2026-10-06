"""Chickens and hens done right (2026-10-04: "The brown hen in the game renders as a man with the sword ... both the
brown hen and the chicken should run from you when you try to fight them and both should drop meat that can be cooked";
"Make the hen and chicken move around and peck").
  engine.js  a monster's model is its `look` (the hen's id is 'hen', its look 'hen_brown': it fell back to the bandit)
  core.js    md.fleeHit: hit, it runs from whoever hit it (two steps a tick) instead of fighting back; md.roamEvery: how
             often it picks a new spot (birds every ~3 ticks, others ~10)
  models.js  birds peck: the head goes right down to the ground, twice a loop, the body tips forward with it
The meat (chicken_raw / chicken_cooked / chicken_burnt) and the drops are data: tools/make_data.py + tools/make_parts.py."""
import os, sys
H = sys.argv[1] if len(sys.argv) > 1 else '/home/you/ashvale3d'
def edit(p, a, b):
    p = os.path.join(H, p); s = open(p).read()
    if b in s: return
    assert s.count(a) == 1, (p, a[:90], s.count(a)); open(p, 'w').write(s.replace(a, b))
edit('src/engine.js', "function mobEnt(m) { const e = makeEnt('m:' + m.uid, MOD.monster(m.key),",
     "function mobEnt(m) { const e = makeEnt('m:' + m.uid, MOD.monster((D.monsters[m.key] || {}).look || m.key),")
edit('src/core.js', """      if (md.ai && md.ai.kind === 'humanoid') return humanoidTick(m, md);
      if (m.atk > 0) m.atk--;""", """      if (md.ai && md.ai.kind === 'humanoid') return humanoidTick(m, md);
      if (m.atk > 0) m.atk--;
      /* a timid animal that is hit runs from whoever hit it, two steps a tick, instead of fighting back (the operator) */
      if (md.fleeHit && m.hurt && S.t - (m.hurtT || -1e9) <= 14) { const q = S.players[m.hurt]; if (q && !q.dead) { m.tgt = 0; m.wx = null; if (stepAway(m, q, 10)) stepAway(m, q, 10); return; } }""")
edit('src/core.js', "        if (h % 10 === 0) { m.wx = m.sx + ((h >>> 8) % (2 * r + 1)) - r; m.wy = m.sy + ((h >>> 16) % (2 * r + 1)) - r; }",
     "        if (h % (md.roamEvery || 10) === 0) { m.wx = m.sx + ((h >>> 8) % (2 * r + 1)) - r; m.wy = m.sy + ((h >>> 16) % (2 * r + 1)) - r; }   /* roamEvery: birds potter about */")
edit('src/models.js', "    idle: { loop: true, dur: 2.4, fn: t => { const k = t > 0.55 && t < 0.75 ? Math.sin((t - 0.55) / 0.2 * Math.PI) : 0; return { neck: [0.9 * k], tail: [0.1 * Math.sin(TAU * t)] }; } },   /* a peck now and then */",
     "    idle: { loop: true, dur: 1.8, fn: t => { const pk = (a) => t > a && t < a + 0.16 ? Math.sin((t - a) / 0.16 * Math.PI) : 0, k = Math.max(pk(0.2), pk(0.42), pk(0.78)); return { neck: [1.45 * k], pitch: [0.35 * k], tail: [0.1 * Math.sin(TAU * t) - 0.2 * k] }; } },   /* pecking at the ground (the operator): three quick pecks a loop, head right down */")
edit('src/core.js', "      if (!m.tgt) { m.tgt = p.id; m.atk = Math.max(m.atk, 1); }\n      return true;",
     "      if (!m.tgt && !MON[m.key].fleeHit) { m.tgt = p.id; m.atk = Math.max(m.atk, 1); }   /* a timid animal never squares up to you */\n      return true;")
edit('src/core.js', "        m.hurt = p.id; m.hurtT = S.t; m.tgt = p.id; m.back = 0;   /* targets whoever hurt it most recently, so groups can tank */",
     "        m.hurt = p.id; m.hurtT = S.t; m.tgt = MON[m.key].fleeHit ? 0 : p.id; m.back = 0;   /* targets whoever hurt it most recently, so groups can tank; a timid animal runs instead */")
print('animals patch applied to', H)
