#!/usr/bin/env python3
"""qwen_decor.py - ask the local Qwen model to draft decor assets in the data/decor.json format (2026-10-18, the operator: "spend some
time building scenery and decorative assets that can be reusable in different terrains - use qwen as efficiently as possible").
One request per asset (small JSON, JSON mode), two hand-made examples in the prompt; drafts go to tools/decor/drafts/<kind>.json for a
person (or Claude) to look at in the game and correct before they go into data/decor.json. Prints the speed of each request.
    python3 tools/decor/qwen_decor.py [kind ...]
"""
import json, os, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'drafts'); os.makedirs(OUT, exist_ok=True)
SPEC = """You design low-poly 3D props for a cosy fantasy RPG (old-school RuneScape style) as JSON lists of primitive shapes.
Units are metres. The prop stands on the ground at y = 0, centred on x = 0, z = 0, and fits in about 2 x 2 m unless told otherwise.
Each part is an array: [shape, colour, x, y, z, sx, sy, sz, ry]
- shape: "box" (sx, sy, sz = width, height, depth), "cyl" (8-sided cylinder: sx = diameter, sy = height, sz = depth diameter),
  "cyl12" (smooth cylinder), "cone" (6-sided: sx = base diameter, sy = height), "pyr" (4-sided pyramid), "rock" (lumpy rock, sizes as box),
  "glow" (a small glowing light: sx = radius, the rest ignored).
- x, y, z is the CENTRE of the shape (so a box 0.6 tall resting on the ground has y = 0.3). ry = turn about the vertical axis in radians (optional, default 0).
- colour: a palette name - "stone", "darkstone", "wood", "darkwood", "cloth", "cloth2", "metal", "leaf", "moss", "accent", "paper" - or a "#rrggbb" hex.
  Use palette names for anything that should change with the terrain; use hex only for things that never change (a candle flame "#ffd27a").
Give 6 to 18 parts. Keep parts touching each other (no floating pieces). Also give "snow": 0 to 4 extra parts that sit on top surfaces as
white snow caps (colour "#f4f6f8", thin boxes or flattened shapes), used only on snowy ground.
Answer with JSON only: {"name": "...", "examine": "one dry, witty sentence a player reads when examining it", "parts": [...], "snow": [...]}"""
EXAMPLES = {
    "milestone": {"name": "Milestone", "examine": "Someone carved the distance to the castle into it, then the weather carved most of it back out.",
                  "parts": [["box", "darkstone", 0, 0.06, 0, 0.6, 0.12, 0.45], ["box", "stone", 0, 0.5, 0, 0.42, 0.8, 0.26], ["cyl", "stone", 0, 0.92, 0, 0.42, 0.16, 0.26],
                            ["box", "accent", 0, 0.62, 0.135, 0.3, 0.06, 0.01], ["box", "moss", 0.12, 0.14, 0.14, 0.18, 0.08, 0.04]],
                  "snow": [["cyl", "#f4f6f8", 0, 1.02, 0, 0.44, 0.05, 0.28]]},
    "lantern_post": {"name": "Stone lantern", "examine": "A lamp for travellers, lit by nobody you have ever seen.",
                     "parts": [["box", "darkstone", 0, 0.08, 0, 0.5, 0.16, 0.5], ["cyl", "stone", 0, 0.55, 0, 0.18, 0.8, 0.18], ["box", "stone", 0, 1.0, 0, 0.42, 0.1, 0.42],
                               ["box", "darkstone", 0, 1.2, 0, 0.32, 0.3, 0.32], ["glow", "#ffd27a", 0, 1.2, 0, 0.09, 0, 0], ["pyr", "stone", 0, 1.48, 0, 0.56, 0.26, 0.56, 0.785]],
                     "snow": [["pyr", "#f4f6f8", 0, 1.56, 0, 0.42, 0.14, 0.42, 0.785]]},
}
WANT = {   # kind: what it is (the brief Qwen gets)
    "wayshrine": "a small wayside shrine: a stone base, a little roofed wooden niche on a post holding a carved figure, a candle burning in front",
    "stone_bench": "a rough stone bench for travellers: two stone blocks and a slab across them, a tuft of moss",
    "fallen_log": "a fallen tree trunk lying on the ground (about 3 m long), a stump at one end, a couple of broken branches, moss",
    "boulders": "a cluster of three or four boulders of different sizes leaning together, a little moss",
    "prayer_flags": "two thin wooden poles about 2.4 m tall, 2.5 m apart, with a line between their tops hung with small square flags in cloth colours",
    "broken_cart": "an abandoned two-wheeled wooden cart tipped on its side, one wheel off and lying flat beside it",
    "ruin_pillar": "a broken stone column: a square plinth, a column snapped off at chest height, two fallen drum pieces lying beside it",
    "stump_axe": "a wide tree stump with an axe stuck in its top and a few split logs stacked beside it",
    "supply_cache": "a traveller's cache: two barrels and a crate under a sloping cloth tarp tied to a short post",
    "standing_stone": "a tall rough standing stone (menhir) about 2.4 m tall with a faintly glowing carved rune on its face and smaller stones around its foot",
    "dead_tree": "a bare dead tree: a crooked trunk about 3 m tall with four bare branches angled upwards, no leaves",
    "rail_fence": "a short rustic rail fence 3 m long: three posts and two horizontal rails, one rail sagging",
}

def ask(kind, brief):
    msgs = [{"role": "system", "content": SPEC}]
    for k, ex in EXAMPLES.items():
        msgs += [{"role": "user", "content": "Make: " + k.replace('_', ' ')}, {"role": "assistant", "content": json.dumps(ex)}]
    msgs.append({"role": "user", "content": "Make: " + brief})
    body = {"model": "qwen", "temperature": 0.35, "max_tokens": 1800, "chat_template_kwargs": {"enable_thinking": False}, "response_format": {"type": "json_object"}, "messages": msgs}
    t = time.time(); r = json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8033/v1/chat/completions', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=600))
    tm = r.get('timings', {}); txt = r['choices'][0]['message']['content']
    try: d = json.loads(txt); ok = isinstance(d.get('parts'), list)
    except Exception: d, ok = {"raw": txt}, False
    json.dump(d, open(os.path.join(OUT, kind + '.json'), 'w'), indent=1)
    print('%-15s %s  %3d parts  %4d tok  %.1f tok/s  %.1fs' % (kind, 'ok ' if ok else 'BAD', len(d.get('parts', [])) if ok else 0, tm.get('predicted_n', 0), tm.get('predicted_per_second', 0), time.time() - t))

if __name__ == '__main__':
    for k in (sys.argv[1:] or list(WANT)):
        ask(k, WANT[k])
    json.dump(EXAMPLES, open(os.path.join(OUT, '_examples.json'), 'w'), indent=1)
