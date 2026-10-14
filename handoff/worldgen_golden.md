# worldgen_test.js: the set-piece golden is red since the globe position moved

`node tests/worldgen_test.js` (node 22) on 2026-10-02 at 06:30:

```
ok   golden: 80 x 80 core tiles unchanged
FAIL golden: set-piece surroundings unchanged
ok   golden: sites around the core unchanged
1 FAILED
```

Every other worldgen check passes, and the core tiles are bit-identical, so the land the village stands on has not
moved — only what the set pieces are surrounded by.

Not from the drag fix I am releasing today: this test loads `src/globe.js`, `src/worldgen.js`, `src/atlas_shapes.js`
and `data/atlas/atlas_palette.json` directly and never reads `dist/`.

What moved: `data/globecfg.json` is 03:16, `tests/worldgen_golden.json` was cut at 02:57, `src/worldgen.js` at
02:27. The golden check is `g.pieces.tilesFnv === golden.pieces.tilesFnv && g.pieces.hb === golden.pieces.hb`
(`tests/worldgen_test.js:184`) — a hash of the tile band around each set piece and the pieces' shared base height.
Moving where ASHVALE sits on the globe re-derives exactly that band from the seeded land, so the number changes
with the coordinates and nothing else.

So this is the golden doing its job, not a bug: the surroundings of the village and Whisperwood did change, and the
file's own header says `--write-golden` is for doing that "ONLY on purpose". Whoever owns the globe position
should either re-cut it with a line saying the position moved (`node tests/worldgen_test.js --write-golden`) or
bump `V` — `worldgen.js:41` still says `API = 1, V = 1`, and the header's rule is that a new worldgen version bumps
`V` and keeps v1 reproducible. I have not touched either.

**Re-cut 2026-10-14 (Claude, the operator: "figure out and fix whatever is failing").** `--write-golden` changed only `pieces.tilesFnv`
(3751478473 -> 2763952155); `pieces.hb`, the samples, the core tiles and the sites were already identical. The world has shipped
at the moved globe position in every release since 2026-10-02, so the golden now records that world.
