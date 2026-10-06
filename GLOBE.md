# ASHVALE Globe: round world, parcel NFTs, Genie

Design for moving ASHVALE onto a round, modular world made of hexagon parcels (a Goldberg polyhedron, the same
family as the truncated icosahedron), where every parcel is an NFT. Written 2026-10-02 from the operator's brief, adapted to
the DogecoinArcade rules we already run on.

The operator's decisions (2026-10-02):
- **Scale:** the full 1,500-4,000 km² base region exists from day one. It is **generated from a seed** in the game's
  style, so every player sees the same land and nothing is stored for it. Hand-made places are inscribed modules
  dropped into chosen spots. Only changes get inscribed.
- **Parcel NFTs:** **minted when claimed.** One small @ashvale inscription defines the whole grid. Each parcel's NFT is
  inscribed by @ashvale only when someone claims or buys it; the first valid one per cell counts. Unclaimed parcels
  exist in the world, owned by nobody.
- **Creators:** "The creator gets to give the genie a text prompt and then my local model builds their parcel with
  continuity." The Genie is the creator tool. Everything it makes is inscribed by @ashvale, so the
  only-@ashvale-assets rule holds.
- **Genie review:** **automatic checks**. A build goes live when it passes every check; failed builds retry, then
  refund. The operator can roll any parcel back.

Arcade rules that shape all of it:
- Nothing here is EVM. NFTs are arcade inscriptions; ownership is the arcade's owner field. Only items inscribed by
  @ashvale and tokens issued by @ashvale count.
- Everything protocol-level stays **game-agnostic** and is built by Arcade. ASHVALE only *suggests* features. The
  asks are listed in section 9.
- **Modular:** every piece is a small module in the registry, so a fix is one or two inscriptions. The launcher never
  changes. Saves carry over.
- Public text never names other games. This document is internal.

## 1. The shape of the world

**Grid:** class-I Goldberg polyhedron GP(n,0) on an icosahedron. Cells = 10n² + 2: twelve pentagons, the rest
hexagons. It is the hexagon-and-pentagon tiling of the truncated icosahedron, refined.

**The key simplification: gameplay happens on flat faces.**
- The planet is an icosahedron of 20 flat triangles. On a flat triangle the hexagon grid is perfect, and the
  game's square tiles fit with no distortion.
- Crossing an edge to the next face means unfolding that face into the same plane, which is exact. The only places
  that cannot be flattened are the 12 corners, where 5 faces meet.
- **The 12 corners become impassable peaks** (the 12 pentagon parcels plus a ring around each). Nobody walks over a
  point that can't be flattened.
- The globe view projects the faces onto a sphere, so the planet looks round from above.
- **At ground level curvature is invisible.** On the recommended planet the ground drops 3.5 cm over 50 m, and the
  fog already ends at about 52 m.

**Cell index (stable forever):**
- The 20 triangles pair into 10 diamonds. Each diamond is an n×n grid of cells (i, j); the 2 poles are extra.
  `cell = d·n² + i·n + j` for d = 0..9; `north = 10n²`, `south = 10n² + 1`.
- Pentagons: the 2 poles plus (i=0, j=0) of each diamond.
- **Neighbours:** inside a diamond, the six axial steps (±1,0), (0,±1), (+1,−1), (−1,+1). Across a diamond edge, a
  fixed 10×4 edge table maps (d, edge, offset) to (d', i', j'). Pentagons have 5 neighbours.
- Lat/lon, sphere position and face-planar centre all come from the index by pure maths, so nothing about the grid
  is stored. One tiny **grid spec** inscription pins `{n, radius, seed, version}`.
- **n is never changed after launch**: changing it would renumber every parcel. Finer detail lives inside a parcel
  (section 8).

**Inside a parcel:**
- The game's existing square tiles, 1 m each, in face-planar coordinates.
- Square tiles can't line up across a face edge (the next face is turned 60°). So each of the 30 face edges is a
  **seam strip**: a river, ridge or cliff two tiles wide, crossed only at ports (bridges, fords, passes).
- A port joins a tile on one face to a tile on the other, as one extra pathfinding edge. Walking over it turns your
  heading by the fold.
- Rendering is free-form: you see across the seam normally. Only the tile grid has to respect it.

## 2. World size

The parcel is the unit a creator owns and the Genie builds. I fix it at **0.1 km²**: a hexagon about 340 m across,
about 100,000 tiles. That's a village with its woods, buildable from one prompt. The candidates differ in the number
of cells.

| | A: n = 64 | **B: n = 128 (recommended)** | C: n = 256 |
|---|---|---|---|
| Parcels | 40,962 | **163,842** | 655,362 |
| Planet radius | 18 km | **36 km** | 72 km |
| Surface | 4,096 km² | **16,384 km²** | 65,536 km² |
| Base region (2,500 km²) | 61% of the planet | **15%** | 4% |
| Parcels left for creators | about 10,000 | **about 82,000** | 400,000+ |
| Globe view at cell detail | 0.25 M triangles: one mesh | **1 M: chunked LOD** | 4 M: deep LOD |
| Parcel table in memory | 0.7 MB | **2.6 MB** | 10.5 MB |
| Ground drop at 50 m | 7 cm | **3.5 cm** | 1.7 cm |
| Face edge | 20 km | **40 km** | 80 km |

**Recommendation: B.**
- The base region is a real continent (15%), with about 82,000 creator parcels around it.
- Memory and LOD stay comfortable on a phone.
- Indexing and arcade queries stay in the hundreds of thousands, not millions.
- A is too small for creators. C is mostly empty land that costs indexing and LOD work for nothing.

**Land use on B (163,842 cells):**

| Class | Cells | Area | Who |
|---|---|---|---|
| `core`: the reserved web | 15,000 | 1,500 km² | @ashvale only; a network of hubs and roads over both continents (Ashvale, Saltmere, outposts) |
| `creator`: claimable parcels | 32,345 | 3,235 km² | minted to whoever claims; built by the Genie |
| `wild`: seeded, reserved | 10,000 | 1,000 km² | @ashvale; future expansions and events |
| `sea` | 106,497 | 10,650 km² | nobody; oceans, lakes, and the 12 pentagons (small water patches, no corner peaks) |

**Changed 2026-10-03 (the operator):** a mostly-ocean world (65 % sea) with two big continents, island chains and inland
lakes; the core is a web, not a blob; Ashvale ~1 km inland and Saltmere on the coast ~1.6 km away (a 2 km walk);
mountain ranges are long non-crossing ridge lines with parallel ridges, valleys and passes, a tree line (~85 m) with
snow on the trees above ~55 m, bare alpine rock above ~88 m and patchy snow above ~110 m. No corner peaks.

The class of every cell comes from the grid spec plus the seed, by rule, so the map of classes is never stored.

## 3. The base region (Ashvale)

- **Size:** 2,500 km² (the middle of the 1,500-4,000 brief), 25,000 contiguous core cells.
- **Where:** centred on one icosahedron face and reaching across its three edges into the neighbouring faces. Three
  of the corner peaks form its mountain rim. A vale ringed by peaks, with the three edge seams as its great rivers
  (bridges are the ports).
- **Distortion:** none in gameplay, because every face is flat. The seams are the only fold, and they are rivers.
  The globe view shows the continent slightly curved; that's projection, not gameplay.
- **Filling it:**
  - **Seeded land.** A `worldgen` module turns (seed, face-planar x, y) into height, biome, trees, rocks, fishing
    spots and monster camps, in the same style and numbers as today's village and Whisperwood. It's
    deterministic, so every player gets identical land, and the shared world still agrees.
  - **Set pieces.** The existing village and Whisperwood zones are inscribed modules placed at fixed coordinates
    near the centre (spawn). A set piece wins over the seed inside its footprint; heights blend over a 16 m margin.
    Every future hand-made town or dungeon is one more set piece.
  - **Content density.** Seeded land must stay sparse enough to be fun, with real places every few hundred metres.
    worldgen places "sites" (camps, ruins, ponds, mines) on a seeded poisson grid. Travel aids are planned:
    run, carts or boats along rivers, and teleport stones at set pieces.
- **Marking:** core cells have class `core` in the grid rule. Their builds are @ashvale's own, and nothing in a core
  cell can be claimed.

## 4. Parcels as arcade NFTs

**Grid spec (one inscription by @ashvale, never changes):**
```
{"ashvale":"grid","v":1,"n":128,"radius_m":36110,"seed":"<hex>","classes":"<rule id>","worldgen":"<module id>"}
```

**Parcel NFT (inscribed by @ashvale when claimed):** a small picture of the parcel (seen from above, rendered by
the game) with this JSON beside it:
```
{"ashvale":"parcel","grid":"<grid spec id>","cell":91234,"d":5,"i":73,"j":101,
 "lat":12.41,"lon":-48.07,"class":"creator","biome":"forest","name":"Parcel 91234"}
```
- **Location:** cell, diamond coordinates and lat/lon, all re-checkable from the grid maths.
- **Ownership:** the arcade's owner field. It moves with trades, escrow and gifts, exactly like the Armoury NFTs.
- **Valid** when the creator is @ashvale, the grid id matches, the cell's class is `creator`, and it's the **first**
  @ashvale parcel inscription for that cell (lowest inscription number). Any later duplicate is ignored. The game
  checks this, so a mistake can't create two owners.
- **Claiming:** the buyer pays @ashvale (price and currency still to decide: see the end). The claim service
  inscribes the parcel NFT and sends it to the buyer. That's the existing inscribe-and-send flow; the arcade's
  escrow can hold the payment until the NFT lands.
- **Rights:** the owner may request Genie builds for that parcel, name it, and trade it. Owning a parcel never
  changes game rules, items or stats.

**Chain to game sync:**
1. The client reads the grid spec once and computes the whole grid locally.
2. Parcels near the player (the current one and two rings out) are fetched by cell from @ashvale's parcel
   inscriptions (needs Arcade ask 9.1). Builds and owners are cached in memory.
3. Owners refresh on entering a parcel and every 5 minutes. Builds refresh when a newer @ashvale build for that cell
   appears.
4. The globe view only needs claimed parcels, fetched page by page.
5. **Eventual consistency is fine.** A trade takes a block or two to show, and the game never blocks play on it.
   Building and ownership checks always re-read the chain before acting.

## 5. Three.js and the client

New modules, each separate in the registry:
- `globe`: pure maths, no three.js. Index to centre, neighbours, lat/lon, face, planar coordinates, seam ports and
  class rule. Golden-file tests (cell count, 12 pentagons, neighbour symmetry, stable ids).
- `worldgen`: seed plus planar coordinates to terrain, biome and sites. Pure and deterministic, so it runs inside the
  core and the referee too.
- `globeview`: the planet from space, for the map, parcel picking and the claiming UI:
  - Each of the 10 diamonds is a quadtree of chunks (16×16 cells at the finest level).
  - Far chunks are coarse meshes with vertex colours baked from class and biome. Near chunks show cell borders and
    owner tint.
  - Frustum and horizon culling per chunk, and one draw call per chunk.
  - About 1 M cell triangles in total, of which only a few tens of thousands are drawn at once.
- The **ground level** keeps today's scene, engine, models and hud:
  - The world streams as 64×64 m terrain chunks, built from worldgen plus any set piece or build covering them.
  - Chunks within about 120 m are loaded, and the fog hides the edge.
  - Chunks unload behind you. A chunk is a pure function of (seed, chunk coordinates, the builds that cover it), so
    it's cheap to rebuild and nothing is downloaded except builds.
- **Parcel data streaming:** the current parcel plus two rings (19 parcels) of metadata. Builds are fetched only for
  parcels whose chunks are actually loading.

## 6. Migration from today's ASHVALE (same game, now on a globe)

**Unchanged:** the deterministic core rules, combat, skills, items, the parts and models system, the hud, trades,
escrow, GOLD, the save format and the modular launcher.

**Refactored, in this order:**
1. **Coordinates.** Positions become (face, x, y) in face-planar metres, with integer tiles as now. The core keeps
   working in a local window: a few hundred metres of tiles anchored at an origin, re-anchored as players travel
   (the re-anchor is a logged command, so replays stay exact). Pathfinding is unchanged inside the window, plus
   port edges at seams.
2. **Zones become chunks.** Today's `zoneAt` map becomes a chunk map that is filled as chunks stream. The village
   and Whisperwood become the first two set pieces at fixed coordinates.
3. **Rooms.** One shared-world room per parcel, with the host per parcel as now. Players near a border also listen
   to the neighbour's room (Arcade ask 9.2), the same multi-room need the cross-border fights already have.
4. **Saves.** A save migration maps today's (zone, x, y) to the new coordinates of the set piece. Levels, items and
   quests carry over, as promised.
5. **Respawn rule** ("only after the area was empty") becomes per chunk.

## 7. The Genie (creator builds)

**Flow:**
1. The owner stands on their parcel, opens the Genie, writes a prompt (up to 500 characters) and pays GOLD. The
   payment is held by the arcade's escrow or an inscription request (Arcade's `/r/referee/attest` flow, now live).
2. The **Genie service** on the operator's machine (the local model, the same box as the local agent) takes requests one
   at a time and builds:
   - **Inputs:** the prompt, the parcel's seeded land, the neighbours' builds (their border strips, roads and
     biome), the style guide and the parts library.
   - **Output:** a **build recipe** (JSON, schema-constrained), plus any new parts in the existing parts language.
3. **Automatic checks**, all of which must pass:
   - schema, plus every part through the models validator;
   - budgets: parts count, triangles, bytes ≤ 20 KB;
   - the game's palette;
   - the **border margin** (16 m) left as seeded except at road ports, and roads meeting the neighbours' ports;
   - walkable: every port is reachable and no area is sealed;
   - a **model judge** comparing headless screenshots against the neighbours and the style references.
4. A passing build is inscribed by @ashvale, with its JSON beside it so the game can find it (the registry lesson).
   A failing build is retried a few times, and then the GOLD is refunded.
5. The operator can roll back any parcel: a new build that points to an older one.

**Build recipe (one per parcel version):**
```
{"ashvale":"build","v":1,"grid":"<id>","cell":91234,"parcel":"<parcel NFT id>","seq":3,"base":"<previous build id>",
 "worldgen":"<module id pinned>","request":"<request id>",
 "terrain":[{"op":"flatten","at":[x,y],"r":30,"h":2.0},{"op":"pond","at":[x,y],"r":12}],
 "structures":[{"part":"<part id>","at":[x,y],"rot":90,"s":1}],
 "paths":[{"pts":[[x,y],[x,y]],"kind":"dirt"}],
 "props":[{"part":"tree_oak","scatter":{"area":[[x,y],[x,y]],"n":40}}],
 "npcs":[{"role":"shopkeeper","shop":"general"}],
 "parts":["<new part ids inscribed with this build>"]}
```
- **Current build of a cell:** the newest valid @ashvale build for that cell (highest `seq` whose `base` chain is
  intact).
- **Aesthetics are enforced by data:** new parts must use the same shape grammar and palette, and NPC roles, shops
  and monsters come only from @ashvale's lists. A build can change how a parcel looks and what's on it, never the
  game's rules.
- The Genie never touches the grid or other parcels, and the planet is never rebuilt.

## 8. Scaling and evolution

- **Layers, never rebuilds:**
  - L0 grid (immutable)
  - L1 worldgen (a versioned module; each build pins the version it was made on)
  - L2 set pieces and builds
  - L3 live state (owners, game state)
  - A new worldgen version only changes land that has no build, and is released like any module.
- **Finer detail:** inside a parcel, as tiles and sub-lots (`cell·64 + lot`), never by changing n.
- **New layers:**
  - Interiors and dungeons are instanced spaces keyed by (cell, layer).
  - A second world is a new grid spec with its own id.
- **Many owners:** ownership lives on chain. The game caches only what's near, and the globe view pages claimed
  parcels.
- **Many builds:** each one is ≤ 20 KB, fetched only when its chunks load. @ashvale's daily inscription budget limits
  Genie throughput (about 10-12 builds a day per account), so the queue is first come, first served. Extra builders
  are possible later as additional approved @ashvale-controlled accounts.

## 9. Asks for Arcade (all game-agnostic)

1. **Query inscriptions by JSON field:** `/r/inscriptions?creator=X&json.k=v&json.cell=N`, with paging and an
   optional "first per key / newest per key". Every game with lots of data inscriptions needs this.
2. **Multi-room membership** in the realtime mesh (listen to neighbour rooms, keep the per-player send budget).
3. Optional: a compact **owners-of-collection** endpoint (id to owner pairs, paged and compressed), for map views.

## 10. Phases

- **P0, globe foundation (no gameplay change):**
  - `globe` module and tests;
  - the grid spec inscription;
  - `globeview`, a private playtest page: spin the planet, tap a cell, see its class and info.
- **P1, parcel NFTs:**
  - claim service, parcel picture renderer, validity rules;
  - the Arcade query ask;
  - owner tints on the globe;
  - the first claims done by hand.
- **P2, base region:**
  - `worldgen` in the game's style;
  - the core window and chunk refactor;
  - village and Whisperwood placed as set pieces;
  - save migration;
  - the full suites and the operator's playtest before release.
- **P3, Genie v1:**
  - request flow and GOLD escrow;
  - the build recipe;
  - the automatic checks and judge;
  - first creator parcels go live.
- **P4, scale:** Arcade asks 2 and 3, more set pieces, travel aids, worldgen v2.

The local agent will be running this after 2026-10-15, so each phase ships with its own tests, docs and a handoff
note.

## Still to decide (the operator)

- Parcel price, and in what (coins or GOLD).
- Genie price per build in GOLD, and how many revisions a payment covers.
- Whether only the owner can request a Genie build (assumed yes).

## P0 status (2026-10-02)

Built, tested, not inscribed or published. Details and open points: `handoff/globe_p0.md`.
- `src/globe.js`: the grid as pure maths (node + ASH3D module). n = 128: 163,842 cells, built in about 20-40 ms in
  node, 7.8 MB of typed arrays (centres + neighbours + classes).
- **One correction to section 1:** inside a diamond the diagonal neighbour steps are **(+1,+1) and (-1,-1)**, not
  (+1,-1)/(-1,+1). Only with this orientation can (0,0) of every diamond be a pentagon and own its two edges. The
  index formula, the poles and the pentagon rule are exactly as written.
- Projection: barycentric weights `b - 0.25 b^3`, then normalize. Hexagon area spread max/min **1.176** (1.376 with the
  pentagons, which are 0.78 of a mean cell). Only + - * / sqrt are used for the grid and the class rule, so they are
  bit-identical in every engine.
- Classes for seed "ashvale": core 25,000 (one piece, on face 11, reaching faces 10, 13, 18, 19), creator 82,086,
  wild 40,000, sea 16,384, peak 372 (12 pentagons + 3 rings).
- Planar coordinates: the flat icosahedron is scaled to the sphere's area, so the face edge is 43.5 km and the cell
  spacing 339.8 m (about 0.1 km² per cell, as in section 2).
- `tests/globe_test.js` + `tests/globe_golden.json` (162 sampled cells pinned), all green.
- `src/globeview.js` + `tools/globe_view.py` give `playtest/globe_view.html` (524 KB, self-contained). On screen:
  about 9-11 draw calls and 74k triangles for the whole planet, about 15-30 draw calls and 10-40k triangles zoomed
  in. `tests/globe_pw.py` passes on desktop and on a phone with touch (tap, drag, pinch).
- Still open from P0: the grid spec inscription. It waits for the operator to choose the seed, and is never made before
  his OK.

## Explorer status: ASHVALE Atlas (2026-10-02)

Built and tested, not inscribed or published. Details, API and open points: `handoff/globe_roam.md`.
- **The app:** `playtest/globe_roam.html` (783 KB, one file, no network), built FROM MODULES by `tools/globe_roam.py`,
  which also writes `playtest/atlas/modules/*` (the exact inscription payloads) and `playtest/atlas/registry.json`.
  Planet: tap a parcel, then "Walk here" (or Random / Walk the core). The camera dives, and you stand on the ground.
  Ground: the game's controls (tap walks, double tap runs, drag turns, pinch or wheel zooms, arrow keys turn, WASD
  walk), the game's character model, a readout (parcel, class, ground, face, lat/lon, planar x/y), "Parcels: on/off",
  Run, Random, Core, and "Fly up" back to the planet.
- **worldgen v1** (pure, no three.js or DOM, bit-identical everywhere) speaks the game's tile language, so the core can
  build walk and sight maps from it. It has sites (camps levelled by distance from the core, ore, fishing, ruins,
  stones) with stable ids, and set pieces whose edges meet the seeded land with no seam: shared base height, a 20 m
  height blend, woods continuing at the edge density and mix, and paths and streams continuing past the edge. It is
  split into wg_geo, wg_terrain, wg_paths, wg_sites, wg_tiles and worldgen, with its numbers in data/atlas/wg_tables.json.
  Golden file: `tests/worldgen_golden.json`.
- **Seams** are continuous: the anchor face is unfolded across edges, and beyond 120 m into another face the ground
  re-anchors with no visible jump. Boundary stones mark each seam every 12 m. The 12 corner peaks are impassable cliffs
  and mountains. Deep sea blocks; you stand on the shore.
- **Numbers** (SwiftShader proxy, WebGL draw calls per frame, shadows included):
  - phone: village 123k triangles / 47 calls, deep woods 145k / 46;
  - desktop: village 386k / 93, deep woods 341k / 92, meadow 119k, peak 114k.
  - For comparison, the game draws about 139k / 206 on a phone in Whisperwood.
  - A chunk takes 8-16 ms of CPU to build, sliced into steps of a few ms per frame. A fresh 64 x 64 chunk of tiles
    takes about 5 ms.
- **New tile letters for the game:** `^` (mountain rock) and `K` (standing stone / ruin wall / seam stone). Both block
  walking and sight. They still need adding to rules.json and scene.js when the game adopts worldgen.
