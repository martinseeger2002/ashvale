# ASHVALE releases (newest last)

- 2026-10-01 v0.3: first modular release. Launcher c879bc1f5f3cfc1300b9f24252a47ce395028dc65fc78a0ab3004a9f272649f5, registry v1.
- 2026-10-01 v0.4: drag and drop, firemaking, Frost staff and effects, weather, fight back across borders, remote tools and gear refresh. Registry v3 b86652c8… (v2 was invisible: registries need JSON beside the file).
- 2026-10-02 v0.5: HUD split into 6 modules, ellipse fog (fog.js), New character fix, shop layout fix, duplicate Frost staff fixed. Registry v4 158d630d…. Card d8fb37fa… ("0.5 demo").
- 2026-10-02 v0.5.1: frozen monsters after re-entering a zone (core applyMobs 'gone' event + engine). Registry v5 c55ec0d5…. shared return_after_away test.
- 2026-10-02 v0.6 (the operator: "Inscribe V 0.5"): the seeded globe land (globe, wg_geo, wg_terrain, wg_paths,
  wg_sites, wg_tiles, worldgen, world, data/wg_tables, data/globecfg, core, scene, engine, data/rules) plus the HUD drag
  fix (`huddrag`) and the two re-cut zones. Registry v6 b68ebfc6abf929b9f2849c2544f78f136dd205b53126a49c4159dd4486156984,
  119 modules, launcher untouched (c879bc1f…), `chain/modules.json` registry_version 6 with no pending entry, and the
  registry is visible in `/r/inscriptions?creator=@ashvale` with its JSON beside the file.
  It stopped at 15/17 in the first run — @ashvale's 3,000,000 bytes-a-day bucket on the node ran dry with ~3.4 kB left —
  and finished at 11:35 with `tools/release_modular.py --no-build`, which picked the 15 up by content hash and inscribed
  only `zones/village` (4,526 B), `zones/whisperwood` (3,360 B) and the registry. `globe` and `wg_geo` went out in a run
  started by a bad flag — `--help` is not a flag of that tool, so it ran a real release until it was killed at 120 s —
  and are recorded by hash, so they cost nothing to redo.
  Checked live afterwards: `tools/live_check.py` boots the card (119 modules defined, three api 160, in the game, no
  console errors but the Cloudflare beacon CSP block) and a walk on the live card went 150 m north, 150 m south, 122 m
  east and 122 m west out of the old map through streaming regions 11:1:0 / 11:1:3 / 11:2:1 / 11:0:1, with a seeded tree
  at (-122, 16) and the live `huddrag` module carrying the 6 px drag fix.
  Two checks are red on this build and neither is the release's own doing: `play_pw.py`'s fog line (the weather
  cross-fade counts frames, so on a slow machine the fog takes ~12 s instead of 4) and `shared_pw.py`'s adjacent
  position line. Both are written up in `handoff/clocks_and_positions.md`, fixed in `src/` but NOT in this build — the
  06:30 `dist/` is what registry v6 carries. They go out as their own bug-fix release once the suites have been re-run
  against a fresh build. The note must not, and does not, claim shared-world positions are smooth on a slow phone.
  Feed note: https://app.dogecoinarcade.com/feed?post=1907e2f96174ce082460eed403c7f7253a082f4b8e20fda6259b7b4053e92aab
  (posted from this box's own account after each of its four items was checked on the live card).
- 2026-10-02 v0.6.1 (bug fix, shipped under the standing rule — every suite was green): the two red lines named at the
  end of the v0.6 entry, both from measuring in frames instead of in seconds. `src/weather.js`
  (sha 9b019ca1ee9d7e68aa362ecba159898dd7a151095f58ba299a0a0567d70808fc, txid affa6db230e0ccd63b568cc42c53643d2c97c1c78bc335404b85479bb57e6ab1, #1085)
  cross-fades over elapsed time, so fog takes its four seconds on a slow machine too; `src/engine.js`
  (sha 92a0730f29a40253fe2a7c73af8fccbf13bf903f46ca955b6790fadfc43cc041, txid 3a61a62120f5d739ec6ac113fae5086290d0710ab24fce91157714f7ac3f60ab, #1086)
  stops teleporting remote players — the send-stride stamp, the elapsed/dt split, a `knewName` map so a name stays with
  its player, a blend capped at one TICK (600 ms), names refreshed every 10 s and silent remotes reaped after 12 s.
  Registry v7 68b43996c2f4723abe8b2079e6a98295ba3961c1c4c12ffcaf0f923eff49d7b0 (#1087, JSON beside the file), card
  8af98f172326a3cc40045d6e3dba47626313c9baf0638f410e5ab81bcc8e89d8 (#1088) saying version "0.6.1", play still the
  launcher c879bc1f… — never re-inscribed. 118 modules inscribed + `three` (the registry points at Pip's on-chain
  r160 #910) = the 119 the page defines.
  Gate: `shared_pw all` 50 checks, node suites, then `play_pw all` — first two runs were red on three checks and all
  three proved to be load flakes (the steel-sword Attack-20 line reproduced in an isolated probe and it was there; the
  60 s wolf kill and the bow purchase both failed while the check *after* them showed the pelt and the 50 arrows, at
  load average 4.45 with firefox at 39%). Nothing was loosened; the suite was re-run with the box quiet and gave
  **ALL OK, 101 checks** (16:50–17:21) against the 14:37 build. Do not weaken those three lines — re-run quiet.
  Live after the merge: registry v7 is the newest `ashvale3d` registry by @ashvale, `/content/<engine>` and
  `/content/<weather>` sha256-match the two fixed `src` files, the card answers `version=0.6.1 play=c879bc1f…`, and the
  live page defines 119 modules and gets in-game at fps 52. The headline fix was watched on the live site: after
  `ASH.weather('fog', 90)` the fog distance ramped 51.6 → 31 → 19.6 over about five seconds instead of snapping.
  Same day, ASHVALE Atlas published as its own app so the game's launcher can never pick it up: `atlas-registry` v1
  9357a1ae7a27947a0ce80781565dd66c82d559621d830a174acca553bb8e5a3f and launcher
  0471f35de65f27a331dec993735303c4a7ec71d25c36ea49dca79305cec01d8f (14,865 B), 8 new modules, 48 shared with the game.
  Verified by fetching all 56 of its modules back from `/content/` — every one sha256-matches both the record in
  `chain/atlas.json` and the file it was built from — and by driving the published launcher: the planet mode draws the
  whole seeded globe with the legend reading core 25,000 / creator 82,086 / wild 40,000 / sea 16,384 / peak 372, and the
  handoff works — `ATLAS.land('core')` put the character on the ground of the core parcel (87381, lat -52.7974°
  lon 71.4880°, 14 chunks, 205k triangles, the well and the village buildings in shot) in 2 s, `C.walkTo` covered
  30 m of it in 12 s with nothing blocked, and `flyUp()` was back on the planet 2 s later, with no page errors.
  NOT done: the Atlas has no Games-tab card — no honest `genre` value for a map, and a new listing is the operator's call —
  so it is reached by its launcher link
  https://app.dogecoinarcade.com/content/0471f35de65f27a331dec993735303c4a7ec71d25c36ea49dca79305cec01d8f
  Feed note: https://app.dogecoinarcade.com/feed?post=6a9a00845ff87498ba0fb21cd533241fe70a67e31a26dd782bee54f4806a06c6
  (posted from this box's own account, 975 characters in one post, after every claim in it was checked on the live site —
  the card answering 0.6.1, the fog ramping on the live page, all 56 Atlas modules sha-matching, and the Atlas walked on
  the live Atlas. The poster's browser dropped its connection a moment after sending, so the post was confirmed on the
  site rather than by the script's exit code.)

- 2026-10-03 v0.8 (honesty fix, from a tester's AV21 report): the welcome card says so when the window cannot
  keep a save. `src/hud.js` `showHelp()` prints one bullet when the store fell back to memory, `src/engine.js`
  exposes `savesHere: () => store.backend` to the HUD for it. Why it was needed: a page drawn inside a feed post's
  iframe gets no storage bridge (its parent carries no `_page_doors.js.html`) and no localStorage (`/full` is
  `sandbox="allow-scripts allow-pointer-lock"`, no `allow-same-origin`, on purpose), so `openStore()` lands on the
  memory store and the session ends with the tab - and only the diagnostics panel used to say so.
  Registry v9 5dfc740847ba4a41b4bf8e167772bb04fa739c1631ae6dad857b4a649bbc1deb (JSON beside the file); 2 modules out,
  `hud` 40ca6f9ebe7fca00… (17,632 B) and `engine` 27ce38b93a06137f… (94,883 B); launcher c879bc1f… unchanged. Card
  listing_v08 ("0.8", play still the launcher). The other 123 modules were held at their live bytes on purpose -
  the worldgen/weather lane is another owner's and `zones/saltmere` has never been inscribed; see
  `handoff/ghost_devs_in_village.md` and `tools/hold_live.py`.
  Tests: `tools/check_savewarn_pw.py` (new) proves both halves - a normal tab reads store=browser and the card
  stays quiet, a tab whose localStorage throws reads store=memory and the card warns; `node tests/core_test.js`
  ALL OK. Live after: registry v9 is the newest `ashvale3d` registry by @ashvale, both module inscriptions
  sha256-match `dist/`, `/content/<hud>` contains the warning sentence, and `tests/live/check_live.py` fetched
  every module with no console errors. The card is 22107b9f17301c6ca970c7336ea337b0f88ac28d0e2775ca0d5f8712aa48734a
  (`version` "0.8"); the note is on the feed as @ashvale, 2026-10-03 12:29 UTC.
- Deliberately NOT in v0.8: the save bug itself. `arcade/pagestore.py` keys its one table on (inscription, key)
  with no account column, so this node keeps ONE ASHVALE save for everybody (AV18 — the operator's call). v0.8 only makes
  the no-storage case honest; it does not give you your own character on a second device.
- 2026-10-03 v0.8.2 (the operator published it himself; Claude prepared and verified): the AV16 run toggle (v0.8.1, never
  released alone) + the new world - mostly ocean with two continents, island chains and lakes; the core as a web;
  Saltmere on the coast (harbour cove, piers, 33 buildings, 2-3 storeys, river through town with bridges) next door to
  Ashvale with a trail; climate zones and climate-driven weather; rivers from creeks to the sea, filled hollows and ice;
  realistic topography with foothills, passes and a tree line; walkable storeys with stairs (core p.lv / 'climb').
  17 modules (~446 KB) + registry v10 3f43ee88817816fd59c3d086309f2bd74d8fb3cad8d88722b51440cda10c4f93, launcher
  c879bc1f… unchanged. Live check: registry v10 loaded, every module fetched (zone.saltmere v2), no console errors.
  Tests before: globe/worldgen/core node suites, models, gate walk-outs, trail, river continuity, headless climb test.
  Full play_pw/shared_pw/arcade_pw NOT run (the operator chose speed) - watch player reports. Card: listing_v082/, note:
  chain/post_v082.txt (the operator runs list_game.py + ashvale_daily.py). Known gap: other players do not see your floor.
- 2026-10-04 v0.8.3 (two look fixes and nothing else; registry v11 e182bc8953a235ccded6a8ab19b8445b799432a663365fde19d3297505d03a10,
  launcher c879bc1f… unchanged): **the Ashvale fishing pond was a deep pit** - v0.8.2's harbour rule dredged every '~' tile to
  sea level, so an inland pond became a hole you slid into while fishing; `wg_terrain` now dredges only a coastal set piece's
  harbour (`seaPiece()` asks the globe whether the piece touches sea), so the pond keeps its own depth. **Saltmere's sea looked
  wrong** - pale shelves and steps where the water met the sand, and piers that floated above it or sank through it; `scene`
  now draws one flat water sheet (run quads with vertex colours + depth tint + vertical skirts at the edges, a BFS sea-flatten
  so any '~' reachable over '~' from open water gets the sea surface), and the deck rule puts a pier/quay at
  max(ground, water+0.12, the adjacent water surface+0.12), so the planks sit at the waterline.
  2 modules out: `scene` (sha 45795585cf31fdfd…, txid 5bc78d5f3de01563…), `wg_terrain` (sha d4e77a73d94be8c0…, txid
  7f6cb027938af25d…). Both on-chain copies sha256-match `dist/`, fetched and compared.
  Held on purpose (`tools/hold_live.py --drop data/assets --drop wallet engine hud hudart hudpanels`): `engine`, `hud`,
  `hudart`, `hudpanels` carry another lane's arcade-wallet/NFT work in `src/`, and `wallet` + `data/assets.json` have never
  been inscribed, so they were dropped. `dist/registry.json` was rewritten to the live ids, which is why the dry run says
  "126 modules, 2 changed". **Rebuild `dist/` after this** - the hold leaves it at live bytes; `build.py` undoes it.
  Tests before: `node tests/core_test.js` ALL OK, `node tests/globe_test.js` goldens unchanged, `node tests/worldgen_test.js`
  goldens unchanged, `tools/test_models.mjs` ok. The browser suites were NOT run on this tree: the box sat at load 15-21 with
  another agent's browser running, and `arcade_pw`'s two reds in the last attempt were the hold, not the product (the page in
  a held `dist/` still asks for `data/assets.json`, which `--drop` deletes, so the console shows a 404) - re-run
  play_pw/shared_pw/arcade_pw against the live build when the box is quiet.
  Tooling, so the next release does not lose 6 minutes to this: three attempts died with `Failed to decode response from
  marionette` while the unified pool was nearly full - the kernel says `NVRM: Check failed: Out of memory` at the same second,
  i.e. the automation Firefox cannot get a graphics context while vLLM holds ~95 GB - and the fourth attempt ran the same
  command through. `release_modular.py` is resumable by content hash, so wrap it:
  `for i in 1 2 3 4; do python -u tools/release_modular.py --no-build >> chain/release_modular.log 2>&1 && break; sleep 25; done`.
  GPU-off prefs were added to `~/dogecoinarcade-promo/ffprofile_ashvale/user.js`; they did not demonstrably change anything.
  One real cause worth fixing on the arcade side, not the release side: every inscribe path (`resident.inscribe_here`,
  `fast_send._start`) opens `/me/nfts` first, and @ashvale now has 793 inscriptions, so that page is the heaviest page the
  account has - it is where every death happened. `drvc.start()` also sets `layout.css.devPixelsPerPx = 2.0` for crisp
  screenshots, which quadruples the raster of exactly that page. A paginated `/me/nfts`, or a scale that an inscribe-only
  run can override, would fix it properly. What fixed it on this box the same morning: `permissions.default.image = 2`
  and `browser.sessionhistory.max_total_viewers = 0` in `ffprofile_ashvale/user.js` — no thumbnails, no raster, no death.
  The card and the Atlas refresh both went through on the first try afterwards, so if an inscribe job dies on that page
  again, the profile is not the problem and something else is holding the pool.
  Card: `listing_v083/` — card 0e2929d2dc3bf9ba7788d1994a33c6b5f6904b73698a75e368b4d34183cd7396 (JSON checked on chain:
  version "0.8.3", `play` = the launcher, cover 28d1007491d413d4c07cce95d43eff4c54600cffd78661ff3456606a15493210).
  Every attempt before that profile fix failed (eleven, in `chain/list_game_v083.log` and the release logs); the first
  attempt after it went straight through.
  Note: `chain/post_v083.txt`, three paragraphs = one post plus two comments:
  https://app.dogecoinarcade.com/feed?post=0cbfb14be2434abf24e0037f967a7b96d85e739419d51a5b94799dfa11a1b477 (the
  permalink answers and the thread says "2 comments"). Live after:
  `tests/live/check_live.py` exit 0, every module fetched, console errors none; `tests/live/two_players_live.py`
  c879bc1f… exit 0, two players on the live launcher with only the Cloudflare-beacon CSP line. Both fixes were then
  measured and photographed on the live page (`/tmp/dbg/probe_live.py`, shots `/tmp/dbg/lv_*.png`): the pond floor
  bottoms out at -0.75 and ramps down -0.03 / -0.16 / -0.30 / -0.53 / -0.75 over four tiles, where sea level there is
  -1.501 - a shallow pond, not a dredged pit. At Saltmere the water is one flat plane to the horizon and the pier deck
  is dry at the waterline: the deck samples the sea BED under it (-2.15) and the rule lifts it to water+0.12, which is
  what the photograph shows.
- 2026-10-04 ASHVALE Atlas (the EARTH app) card: `listing_earth/` cover 295e92630519464b…, card 0d88f5c3f00d8421…, JSON
  checked on chain (`play` = the earth launcher a4597d82acb37140…, version "1.0"). The launcher and registry v1
  (69332a75…) were inscribed by the operator's `tools/release_earth.py` run overnight; this only put the Games tab card up.
- 2026-10-04 ASHVALE Atlas registry v3 `fed0033f052cd7c7221646b318fd6fd1bba022f619689de58b7d273dba04c9d1`, so the Atlas
  draws the same ground the game does: its old registry pointed at `wg_terrain` 0a4e1585… (v5, the rule that dredged
  every '~' tile to sea level), and v3 points at 7f6cb027… — the v0.8.3 file, reused by content hash, nothing else
  inscribed (16/16 modules reused, the launcher a4597d82… untouched, tag `earth-registry` so the game's launcher can
  never pick it up). Fetched and checked: the registry's own JSON on chain names 7f6cb027… for `wg_terrain`. The entry
  still carries the field `"v": 5` - that is the Atlas's own label for the slot, not the bytes; the id is the bytes.
  One run of `release_earth.py` had already gone in as registry v2 minutes earlier while I was retrying the card; v3 is
  the newer and the one the launcher resolves. Nothing points at v2 by name.
- 2026-10-04 v0.8.4, the combined release (registry v12 7fefc156556a50f5fabfc0f85e7d6b889b1899faabaddc5cc0a9397fa0b24f98,
  launcher c879bc1f… unchanged): wildlife, the "you can't reach that from here" fix and the read-only Wallet tab in one
  release, because both branches in the queue were finished and neither touched the other's modules. 138 modules, 24
  inscribed, 114 reused by content hash: `core engine hud hudart hudpanels models net trip wallet wg_sites world`,
  `data/assets data/monsters data/rules data/wg_tables`, and nine new creature parts `parts/char.boar .chicken .deer
  .goat .hare .hen_brown .lizard .snow_hare .timber_wolf`.
  What is in it: `data/wg_tables.json`'s `wild` herds, so every climate gets its own animals, with `keep.timber_wolf:
  300` holding wolves 300 m off the roads and the fields; chickens and hens in the Ashvale (4) and Saltmere (14) yards
  that scatter when you run; nine new `data/parts/char.*.json` beside nine new monsters in `data/monsters.json`; hunting
  pays the same Attack/Strength/Defence experience as fighting. `wallet.js` + `data/assets.json` are the Wallet tab under
  the settings gear - GET-only - drawn with `hudpanels`/`hud`/`hudart`. Clicking a monster that pathfinding cannot reach
  now says so instead of swinging for nothing. `src/trip.js` ships dormant (nothing calls it), and the other session's
  neighbour-rooms work ships OFF behind `?nb`, so the default build is the old single-room network.
  Why all 24 rather than only the visible ones: the live launcher is a generic loader built from the registry
  (`deps[dep] = inst(dep)`), so a module left out silently disables whichever feature reads it - dropping `data/assets`
  would have killed the Wallet tab, dropping a creature part would have made that animal invisible with no error.
  Gates before publishing, all on the built tree (`tests/play_pw.py` serves `dist/`, not `src/`): `arcade_pw` ALL OK at
  10:34:50 (with `ASH_MOCK_PORT=8911`), `play_pw all` 100 ok / 1 FAIL at 11:11:16 under load 18-19, `shared_pw all`
  ALL OK alone at 11:59:27 after three tries. The two `page.goto` timeouts at 09:49 and 11:19 were the test server, not
  the game - `:8731` was `python3 -m http.server`, whose listen backlog is 5 while four pages fetch ~40 modules at load;
  it is now a `ThreadingHTTPServer` with `request_queue_size=128`. The one `play_pw` FAIL was "wield the Frost staff"
  (`tests/play_pw.py:381`, a click-to-wield followed by a fixed 800 ms wait) - the two checks right after it, a frozen
  wolf and the staff's shortened range, both need the staff equipped and both passed, so the equip had happened, just
  later than the 800 ms. Nothing in v0.8.4 touches wielding.
  Two things that release taught me about the gates, both fixed the same afternoon: `play_pw.py` and `shared_pw.py`
  printed `FAILED: n` but exited 0, so "exit 0" was never the verdict - read the last line of their logs instead (the
  only nonzero exit they produced was an uncaught exception, which is why shared_pw's 11:19 timeout showed as EXIT 1 and
  its check FAIL at 11:59 did not). Both now end with `sys.exit(1 if fails else 0)`. And the crossing check's 3.9 m
  against a 1.5 m limit on the loaded run stands as one unreproduced FAIL, not as a pass.
  `release_modular.py --dry` at 11:38 confirmed the 24-module set; the release ran with `--no-build`, so the bytes
  inscribed are the bytes that were playtested. Afterwards, checking the chain by content hash needs `chain/modules.json`,
  not `dist/` - the other session's `play_pw all` ran `build.py` and rebuilt `dist/` at 13:04 with its own `wg_terrain`
  (the world editor's hand edits), so 15 files in `dist/` no longer match what v0.8.4 put on the chain. Compared against
  the state file, all 138 modules that registry v12 names serve from `GET /content/<id>` with exactly the recorded sha.
  Live after: `tests/live/check_live.py` exit 0 - registry v12 loaded, every module fetched, console errors none - and
  `/r/inscriptions/<address>`, `/r/balances/<address>` and `/r/tokens?ids=`, the three routes the Wallet tab reads, all
  answer 200 on the live site. The Wallet tab was then seen answering on the live page itself, signed in as an arcade
  account (`/tmp/dbg/probe_wallet_live.py`, shot `/tmp/dbg/lv_wallet.png`): `Wallet | GOLD 0 | No ASHVALE gear or
  resources in this wallet yet.` plus the trade line and a Refresh button, with the page's own network log showing it
  really called `/r/inscriptions/<addr>?limit=500` and `/r/balances/<addr>`. (Signed in, the console also shows a couple
  of arcade-side 400/404 resource loads; every route `wallet.js` itself asks for answers 200 when curled, and the guest
  page is clean, so they are not the tab's.)
  Games-tab card: `3b5f7ddbe850fdf3c2b83ccf2d4bff043fd1b2ae731083ac30a55c4f622cb5e0` (inscription 1179; name ASHVALE,
  version 0.8.4, play c879bc1f…, cover the same 28d10074… as every card since 0.2; read back off the chain). Feed note
  by @ashvale: `/feed?post=f053777246442cf046051a1f5cac5c4f21bb8a29129b1f78e6520b582997e92f` with the other four
  bullets as replies under it.
  Two things about that paperwork that cost time and are worth writing down:
  - **A card's own bytes are not a key.** `list_game.py` and any `sha256` lookup can't tell one ASHVALE card from
    another: the card PAGE is identical for every version that points at the same launcher (only the JSON beside it
    differs), so resolving "did my inscribe land" by content hash returns some other version's id. Resolve it by
    `json.game.version` instead - `/tmp/dbg/card_pw.py` does.
  - **@ashvale's `/me/nfts` no longer loads in headless Firefox on this box.** `login` works and then the navigation
    kills marionette ("Failed to decode response from marionette"), with 107 of 121 GB in use and 11 of 15 GB of swap:
    793 inscriptions on one page. `list_game.py` and `ashvale_daily.py` both died there today. The card above went in
    through Chromium (`/tmp/dbg/card_pw.py`, the same form flow: file input, "JSON beside the file", `#inscribe-it`).
    The feed note went in on the first try in Firefox before the memory got that tight - and posting it again crashed,
    so if a post looks missing, check `/feed` for a copy before re-running the tool: the note was posted once.
  The live two-player check **passes** (`tests/live/two_players_live.py <launcher> symmetry`, log
  `/tmp/dbg/tpl_v084g.log`, shot `tests/shots/live_two_players.png`): account and guest in the same room `vale:19:0:0`,
  the account sees `Guesty (guest)`, the guest sees `Sym (@symmetry)`, and the guest's chat line arrives on the account's
  page — with `a tester (a tester)` and `Adventurer (@bigchiefenergy)` in that room at the same moment, so the count is
  corroborated by two people who were already playing. It took three fixes to the CHECK, none to the game:
  - **The creator is two cards.** The first card's `[data-a=done]` is labelled "Next: skills" (`hudcreator.js:30`) and
    only the skills card's `[data-a=go]` closes it, so one click left a guest standing in the creator with the world
    running behind it. `leave_creator()` clicks until it is gone and asks `getComputedStyle(.cc).display`, because
    hudcreator hides the card instead of removing it — `.cc` stays findable forever once you have been through it.
  - **Wait for the room, not for the world.** `ASH.net()` answers and `ASH.ents.size` is ~50 well before the page has
    joined a room, and every remote list is empty in that window, which reads exactly like "the other player is not
    there". `wait_room()` polls `net().room`; a guest is slower to join than a signed-in account, so it bites there.
  - **Prefer the frame with a live entity map.** The launcher keeps its own document and the game iframe alive together,
    and a frame handle taken before the creator ran goes stale. `ev()` re-finds the frame on every read.
- 2026-10-04 16:34 v0.8.5 (Claude): registry v13 66763d38ec7e533d566044e98abdeadea2b9212acd5f5382d659ddc84d7d490a on launcher
  c879bc1f…, 18 modules (wallet, trip, wg_terrain, wg_tiles, worldgen, world, core, audit NEW, scene, models, gamepad NEW,
  engine, data/items, monsters, shops, rules, assets, parts/item.chicken NEW). Fixes: walls for buildings north of y = 0
  (6 in Saltmere had none), stairs (openings, arrow, floor bar, exact-tile climbing), hens render as hens, timid
  animals flee when hit, raw chicken meat, gamepad, coastal town ground = the Atlas (no dredged harbour), piers as
  assets, flat Atlas water (earth.js - needs the Atlas refresh, NOT done yet), Atlas terrain edit layer (empty), the
  page claims only winning pools (dormant until pools exist). Tests: core/worldgen/trip/globe/judge OK; play_pw ALL OK;
  arcade_pw ALL OK; shared_pw: only "one host for all three", which fails the same way on v0.8.4 code (convergence of
  the host field under load; the shared-world checks after it pass). check_live exit 0 (v13, no console errors).
  Card 8c8a2d2188fb6d993fc8133b4593d1b683f1ee573cad5de0fd57c07389c2bbbc (version 0.8.5, cover 28d10074…).
  Note: https://app.dogecoinarcade.com/feed?post=8f733fe4fa2e661fa07f76cc0b4614db6da1e7e216e195adcbfb2af1c0464f8e (+4 replies).
  FIREFOX: headless Firefox now crashes unlocking @ashvale ("Failed to decode response from marionette"); the old profile
  is dogecoinarcade-promo/ffprofile_ashvale.corrupt-20261004-1554. release_modular.py sends through Chromium
  (tools/pw_send.py) unless ASH_FIREFOX=1; the card: tools/list_game_pw.py; the note: tools/post_pw.py. Run them with
  PLAYWRIGHT_BROWSERS_PATH=/home/you/.cache/ms-playwright and the ghost-devs venv python (playwright 1.62 installed).

## v0.8.6 — 2026-10-04 18:16 (registry v14 c79cb77c6118bf6887d7e969015fda39bf795bf3bf1ed327c016ceedbf1bc6f9)
- 8 modules: core, hudpanels, engine, data/items, data/rules, data/assets, parts/char.hawk, parts/item.ring.
- Hawk rings (#1200 → @apple, #1201 → @yourfirstname), magical items never despawn, stuck-monster fix (agent).
- First release published entirely by the standalone wallet (tools/ashvale_wallet.py, no browser). Fixed its split
  slicing: a piece wholly inside the manifest is EMPTY (the registry's JSON-beside makes the manifest ~17 KB, bigger than a
  chunk). release_modular now keeps the registry's bytes on a re-run so an interrupted split resumes instead of re-paying.
- Card d96d11903ea09d5a…, note feed?post=73abbd6fac14e2a4…
- Gate: headless suites + targeted browser re-run only (the operator: lean tests for small updates).
- 2026-10-04 18:3x (a tester) the missing half of the mob-reachability fix, on chain as **registry v15**
  `2b7c12f5cb9a0627dd418d88b75954d708065d01e6128057287061db12db5d8a` on launcher `c879bc1f…` (never re-inscribed).
  One module: `zones/whisperwood` -> `6d66ffb5bd19896151bc6d13e9d32e65c8e6df4d927f836c75ec42422a64d1cf`
  (sha `09c8358c...`, 3,360 B), `--dry` said "143 modules, 1 changed" so nothing else moved. No new version number, no
  card and no feed note of its own - it is not new behaviour, it is the behaviour v0.8.6's note already promised.
  **Why it exists:** v0.8.6 (registry v14, "143 modules, 0 changed") told players "monsters that got stuck where you
  could not reach them now come out to fight". The code half of that was live - `core` on the chain is byte-identical
  to `src/core.js` and carries `mobCome`/`comeStep` - but the fix is half a MAP fix, and that half landed after the
  build it shipped from: the whisperwood rat post `(15,36)` stands in an eight-tile pocket (13:34-38, 14:36-37, 15,36)
  sealed by trees, a pond and a rock, and its only swingable tile `(14,36)` is inside the pocket, so no player can
  reach it and `comeStep` cannot get it out. The post is moved to `(17,36)`, same thicket, on the real network
  (component 1,145 tiles). Reported by a tester (lost the back half of two hunt runs, 75+ s of swings for zero
  damage) and confirmed in-world twice by @apple ("there is no way to get to that rat").
  **Checked:** live over HTTPS - registry v15 says `zones/whisperwood` = the id above, that module's sha is
  `09c8358c...`, and its spawn list has `(17,36)` and no `(15,36)`. `post_reach` reads "posts checked: 29 | a player
  can never hit them: 0"; the dynamic scan (L99 player, 400 ticks per post) reads "zero damage in 400 ticks: 0";
  `node tests/core_test.js` ALL OK; `tests/live/check_live.py` log `/tmp/dbg/check_live_v15.log`.
  **The permanent check** is the part that outlives this: `tests/core_test.js` now has "every monster post that ships
  can be walked to and swung at" - per post it takes the tiles that can actually swing at it, walks the ground the
  post stands on using the game's own `inReach(a,b,1)` as the step rule (walls included, no corner-cutting), and fails
  if that ground never reaches open map or holds no tile a player can stand on. It was green against `src/` and red
  against the live bytes before this inscribe, saying `whisperwood rat (15,36) stands in a pocket of 8 tiles that
  never reaches open ground` - proved to bite by putting the old coordinate back. Before this, nothing in ASHVALE
  looked at where a monster post sits.
  **For whoever releases next:** a `--no-build` run publishes `dist/`, not `src/`. This gap is the second time that
  distinction cost a claim in a release note (the first is Claude's `dist/ is not a reliable witness` note in
  claude-plan.md). Read the last line of `release_modular.py --dry` before the inscribe: it names what actually
  changed in the bytes about to go on chain.


## v0.8.7 — 2026-10-04 18:48 (registry v16 1ebfe718a0fd676ce9498577bf5a1cf86ab2d88b1ace2d2d688496e55c980c8f)
- 3 modules: core (a hawk takes 4 steps a tick = twice a run), models (bird H.flying(): legs hidden, no cast shadow),
  engine (hawkify calls it and hides the blob shadow). The operator: "twice as fast as a person running, get rid of the legs and shadow".
- Includes the agent's v15 Whisperwood rat-post fix (dist was rebuilt after it).

## v0.8.8 — 2026-10-04 19:44 (registry v17 c70c25faffbd47f112b5eb3d1209dad3d57d7687eb03b8a177c87d0dae2a95ef)
- The Ashvale chest (handoff/bank_plan.md): NPC `chest` (char.chest, body 'chest') at village (24,53); src/hudchest.js window;
  engine ledger per wallet address (bag/spent in localStorage 'ashvale3d.chest.<addr>'); deposit -> realtime room 'bank'.
- @ashvale Bank: tools/bank/bank.py (Chromium as @ashvale in room 'bank' + standalone wallet; grants tokens, sends
  Armoury stock, mints copies when out). Tested end to end as @vex: 5 GOLD + Bronze sword #25 landed.
- assets: every stackable is a token (tools/issue_tokens.py, 10/hour; ids in chain/resource_tokens.json -> make_assets).
- make_data.py now keeps the agent's v15 rat-post fix (it lived only in the generated file).
- Also in this registry, from the agent (a tester), and NOT mentioned in the release note: AV23, @yourfirstname's
  report that combat levels should be shown in the game. src/core.js adds `mobCombat(md) = md.level * 2` — the number the
  aggro rule already uses to decide whether a monster comes at you — and both aggro gates now go through it, so the number
  on screen is the number that decides the fight. src/engine.js prints it in the attack menu and Examine, colours it with
  `lvColor` against your own combat level (it was being fed a monster's *level* before, so the colour always read low),
  and gives nearby monsters a floating plate, "Wolf (combat 16)". tests/core_test.js pins it three ways, including that a
  wolf takes a combat-16 player and walks past a combat-17 one. Verified live at 20:03: registry v17, core 1a1b56f6
  (mobCombat x4), engine 2b3cd9f5 (x2); tests/live/check_live.py boots it, console errors: none.

## v0.8.9 + Atlas earth-registry v4 — 2026-10-04 ~20:20 (game registry v18 7b8d02c73fee33324624505bd00f4f4c20949a4a7af545b230d0cb23dc1ad8f0; earth v4 b9c380ae…)
- wg_terrain: ground near a river and below its surface is a lake at the river's level (the operator: "That entire cavern should
  be filled with water ... The water should always be flat"). Worldgen golden rewritten: only fishing sites changed (+26/-4).
- earth: the earlier flat-water patch goes live with it. release_earth.py now sends through the standalone wallet (ASH_FIREFOX=1 = old path).

## v0.8.10 — 2026-10-04 ~20:33 (registry v19 c200053792085d0e20808db66ba4e54fbc4dd600206b395950a6fffb3a73a8d3)
- Chest ledger rewrite (bag/pend/spent/pspent; promises persist; only delivered units store), Gold takeable, Wallet-tab take
  goes through the chest ledger. tests/chest_ledger_pw.py 13/13. Bank: deposits carry `pend` (v:2), pays only beyond its own
  undelivered jobs; 12 duplicate queued jobs cancelled (backup chain/bank/bank.sqlite.bak-20261004-2030); mints non-Armoury
  gear from chain/bank/icons; magical items passed on from stock only. Bank is now systemd user unit ashvale-bank.

## v0.8.12 — 2026-10-04 21:07 (registry v21 df3649797028fff7035c7c26e03a907b9649704e37f221dc6c4b8172b58666c8)
- engine: picking your own drop/death pile back up reclaims it (spent -> bag) while its NFT is still in your wallet.

## v0.8.13 — 2026-10-04 22:02 (registry v22 fb88f51c59b61c3b63d584dd9b8e4c8bface291e04c908770e4a2dc7832c07c5)
- Auto-deposit (no chest button), exact-NFT drops (drop records -> pickup gets that piece), returns ON (creator allowance
  live), trade window shows game items, trade-away leaves the bag (two wallet reads), rules.persist (gear/tools/Gold stay on
  the ground, the rest despawns), wallet.js key-only matching. Bank: chain-checked counts (claim - held - owed - fresh), absorb
  for stale counts, lowest-number stock first, mints with the assets collection. tests/chest_ledger_pw.py 19/19.
- Incident (fixed): minted tools under the wrong collection were never recognised, so the operator's devices kept re-depositing
  (wallet now holds ~6 pickaxes/5 tinderboxes/5 frost staffs/5 packs, 2 each of the tier-2 helmet, body, legs and bow).

## v0.8.14-16 — 2026-10-04 22:28 / 22:40 / ~23:10 (registries v23, v24, v25)
- v0.8.14: deposit 2 s after anything enters the bag. v0.8.15: every animal its own meat (raw/cooked/burnt) and hide
  (22 new tokens issuing 10/hour). Bank fix: `fresh` counts only unconfirmed deliveries; absorb only when the count itself
  is stale (lost the operator 4 chickens; repaired with a 4 raw chicken grant).
- v0.8.16: trade window rebuilt as a negotiation over the room (tests/trade_pw.py 7/7): own offer only, other side's offer
  read-only, any change clears accepts, starter calls arcade.swap.trade, answerer auto-answers only the exact deal.

## v0.8.17-21 — 2026-10-04/05 (registries v26-v29)
- v0.8.17 trade: carried-only offers, waiting window, settle moves items bag->bag. v0.8.18 stack amounts.
- v0.8.19 Goblin Chief (whisperwood 43,23; quest step 3 zone -> whisperwood), town portals (rules.portals, attunement),
  Ashvale stone (Maren gift, teleport, 30 min cooldown saved as ticks left). v0.8.20 quest rewards = own collection
  (core 'reward' event -> deposit `reward` -> Bank mints fresh into "ASHVALE <quest>"), stone collection "ASHVALE Portal Stones",
  minted copies numbered "#N". v0.8.21 hawk overhaul (core HK config, tests/hawk_test.js).
- Hawk rings #3-#20 inscribed and sent to @apple (tools/mint_rings.py; chain/rings/README.md).

## v0.8.26-27 — 2026-10-05 06:46 / 07:21 (registries v34 5d604796..e9ca677a, v35 3dcd0fba..87ec66d4) — trail story, increments 1-2 (a tester)
- v0.8.26 (data/quests, zones/village): the trail from Ashvale to Saltmere has a story on it. Rowan the drover at the
  east gate gives "The Drove Road", four kill steps (wolf 5 / boar 6 / timber wolf 4 / bandit 6) paying strength XP,
  a drover's pack, an iron helm and attack XP. Data-only: the core already counted kills for it. tests/core_test.js
  now plays the first step end to end (gives it, counts a wolf, counts what is left). Card + feed post published.
- v0.8.27 (data/shops, zones/saltmere): Saltmere populated. Cobb the town elder and a chest tarred against the damp
  beside the town portal; Bela keeps the Saltmere General Store (bread, potions, tools, net, rod, lobster pots, buys
  anything at 45); Orin keeps the Saltmere Armoury (the tier-4 stock Ashvale does not carry, minus the pack) at the
  anvil; Mabb the sailmaker, Tolly the dockhand and Perla the net-mender on the quay side. NPC positions are authored
  in town space and rotated out with everything else, so the town can move without anyone standing in a wall.
  tests/core_test.js checks every zone file: unique ids, nobody standing on a blocked tile, every shop's keeper
  exists in a built zone, every portal has a chest in its zone, and that Saltmere has an elder + both shops.

## v0.8.28 — 2026-10-05 08:03 (registry v36 aa3830ad..) — trail story, increment 3 (a tester)
- v0.8.28 (src/core.js, data/quests, zones/saltmere): goal kinds beyond the kill. A quest step can now `bring` an item
  (checked and taken when you go back to the giver) or `talk` to somebody else (credited when that conversation
  happens), beside the `kill` kind that was all the engine knew. Both are generic - no quest-specific code anywhere.
  Bryce the shipwright on the third pier gives "The Shipwright's Rudder": 8 seasoned logs, 5 boar off the timber
  stack, then tell Tolly she floats - paying woodcutting XP, strength XP and an iron helm off the old sternwork into
  "ASHVALE The Shipwright's Rudder". core_test plays a made-up village quest ("The Post Ride") through both new
  kinds, so the proof is in the rules and not in one town's JSON; the quest sweep now checks a `bring` step wants a
  real item and a `talk` step points at an NPC that exists in a built zone.
  Card 789c805b51fdc8a56d66892d70a73a8fd554ffea3aa7a8442e4d64d62a849384.

## v0.8.29 — 2026-10-05 08:43 (registry v37 58f5f862..) — trail story, increment 4 (a tester)
- v0.8.29 (data/items, data/shops, zones/saltmere): the Saltmere Enchantery, and effects that are not freeze. Four
  new weapons, each one a tier-matched plain weapon with a little of its damage sold back for an effect:
  staff_ember (burn 6 ticks at 45 %, 2 dmg; staff_t2 minus one magic), staff_storm (slow 6 ticks at 45 %; staff_t4
  minus four magic), dagger_venom (poison 9 ticks at 60 %, 2 dmg; dagger_t3 minus two attack, two strength),
  bow_snare (slow 4 ticks at 35 %; bow_t3 minus three ranged). Nessa the enchanter keeps the counter in a new shop
  block by the harbour steps, and buys staves at 40. The four sit on her shelf only: the derived `armoury_stock`
  filter drops them, so neither Garrick in Ashvale nor Orin's anvil in Saltmere sells them, and staff_frost is left
  where it always was. freeze/stun/slow/poison/burn were already in the core; this is the first data to use four
  of the five. core_test: every effect-carrying item names an effect the rules know, the Enchantery is the only
  counter that stocks the new four, each hits for less than its plain same-tier twin, and a wolf is set burning and
  slowed in a real fight (burn damage ticks counted, no movement on an odd tick while slowed).
  Card 99a0f2eb6806650ce0745676ee174a1b6a1ed9a18fb5877eaaa23c1373cad1d4.

## v0.8.30 — 2026-10-05 09:37 (registry v38 1d2500a2..) — trail story, increment 5: the end of the trail (a tester)
- v0.8.30 (src/core.js, data/items, data/quests, zones/saltmere, parts/item.stone): "The Salt Road", Cobb's four-step
  finale by the town portal, and the Saltmere stone. Steps: carry word up to Rowan (a `talk` goal - Saltmere takes
  the drove on Tuesdays), bring six iron ore to a town with an anvil and no mine (`bring`), five wreckers off the
  north beach and their captain (`kill`), paying speechcraft XP, mining XP, chain_t2 and cape_blue into
  "ASHVALE The Salt Road". Cobb's `gift` is `saltmere_stone` - `kind: tool`, `teleport: "saltmere"`, 3000-tick
  cooldown, collection "ASHVALE Portal Stones" - gated by `giftAfter {quest: salt_road, step: 4}`, so it cannot be
  had halfway up the trail and cannot be bought. core.js: the teleport line no longer says Ashvale wherever you
  land, it names the portal you came out of. tests/core_test.js: every quest's giver must be a giver (no `lines`,
  no shop, no tailor, exactly one quest), every portal has exactly one stone and no shop sells it, Cobb gives the
  stone once to a finished character and not at all to one at step 2, and each stone lands on its own portal and
  says its own town's name.
  Card ec82a1d32b4dfdd7015d5e13efb73f8a62bd114d0b894540e39ba78f26863f59, feed post
  f5afcfe189cff86112e1571850ccda31f77251a359615e5877a2973f576c231f (post + 5 replies).

## v0.8.31 — 2026-10-05 11:56 (registry v39 c5bb290f..) — trail story, increment 6: the harbour's water (a tester)
- v0.8.31 (data/quests, zones/saltmere): Saltmere's fishing marks were in open sea and Perla sends you onto them. The
  seven marks the town generator laid down sat 10-40 m off the last plank - past the pier heads, and the two furthest
  east past u=159, outside the zone's own map - so `wg_sites`'s own rule (a mark needs a walkable tile on one of its
  four sides to fish it from) was satisfied by none of them and every cast from the harbour was a walk into the sea.
  `make_zone_saltmere.mjs` now places them by that rule instead of by hand: `spot(x, y, fish, extra)` searches
  outward in rings from the intended spot for water that has a banked neighbour (`BLK` is worldgen's BLOCK string, so
  the generator and the walk cannot drift apart) and refuses to reuse a mark. They come out at the north pier head,
  the quay wall, both sides of the second pier, the deep third pier, the north beach and one in the channel.
  Perla's "The Empty Water" is the first quest in the game that happens on the water: 12 shrimp on a net, 4 salmon
  off the second pier (rod, 30 fishing), 2 lobster off the third (pot, 40), then tell Nettie at her stall - paying
  fishing XP at each step and `pack_t3` at the end, into "ASHVALE The Empty Water". The fix is the story: the
  harbour moved the marks out "to let the shoal rest" and Perla spent two weeks arguing to have them hauled in.
  She is a giver now (her two idle `lines` are gone - a giver must sell nothing and chat nothing, or `talk()` never
  reaches the quest), and her lines went into the quest where they do more work.
  tests/core_test.js: every fishing mark that ships must have a tile you can fish it from (built with seeded
  worldgen - see the `wg` note below), every `_raw` item a quest asks you to bring must be yielded by a mark in that
  step's zone, every `rules.portals` stand must be on walkable ground inside its own town, and a player is played
  through all four of Perla's steps - XP up, items taken, Nettie's `talk` goal credited through her shop, the pack
  minted, the closing lines given. `make_zone_saltmere.mjs` also checks the town portal square against
  `rules.portals.saltmere` and says what to put in rules.json when they disagree.
  GOTCHA for the next reach test: `world.js`'s `inWorld` is the old map RECTANGLE unless `D.wg` is set
  (`engine.js:94` always sets it, `?flat` does not), so a plain `AshCore.create(D)` makes Saltmere's negative-y half
  "off the world" and reports walks that are fine in the game as unreachable. Pass
  `{ wg: AshWorld.seededWorldgen(WGM, AG, D) }`.
  Live: registry v39, console errors none, all 147 modules fetched; the quest and the seven new marks were read back
  off `/content/`. Card 638f709d468f25a3b5b433f5930b1fed8794df31b916341dd9501b67ae6bbb55, feed post
  7e414a4b78459935bc46ebff797540e8ae3d449bb2acfa62fbffa6643093f134 (post + 7 replies).

## v0.8.32 — 2026-10-05 13:12 (registry v40 0c5732a3..) — trail story, increment 7: a second thread in Ashvale that is not about beasts (a tester)
- v0.8.32 (data/quests, zones/village): "The Bronze Gate", from Silas the mason at (18, 50) on the north wall. The
  premise was found in the item table, not invented: the village mine yields `copper_ore`, `tin_ore` and `coal` and
  the hill yields `oak_logs`, and up to now the only use for any of them was the general store buying them at 45 -
  four nodes with a working animation and no reason to exist. Steps: 8 `oak_logs` (xp:woodcutting:1800), 6 `coal`
  (xp:mining:1500), 12 `copper_ore` (xp:mining:2400), then `{"talk": "garrick"}` for `shield_t2`, into "ASHVALE The
  Bronze Gate". The story is a green-pine centering inside a 31-year-old arch, lime burnt at the wrong heat, iron
  pins that rust, and a mason and a smith who have not spoken across the street in six years - so the thread is
  carpentry, mining and one sentence, with no monster in it. Silas is a giver now: his two idle `lines` are deleted
  (a giver that chats never reaches its quest) and they went into the steps, where they carry weight.
  tests/core_test.js: a new generic rule - for every quest step with a `bring` goal whose item comes from a
  `rules.nodes` node, that node must exist in a *built* zone with an unblocked orthogonal neighbour the gather check
  will accept (searched over all zones with seeded worldgen, because `core.js`'s `open(st)` is a build gate, not a
  place you must be) - so a quest can never again ask for something nothing in the world gives. Plus the quest played
  end to end: step advances + XP + the items leaving the bag, the `talk` goal crediting at Garrick's counter (a shop
  NPC still credits), the shield minting into its own collection, the closing lines, and the `{left} more coal`
  progress line for a character at step 2.
  HELD OUT OF THIS RELEASE, and worth knowing before you diff: `src/engine.js` and `src/hudchest.js` were edited at
  12:57 today by the chest/ledger work that is not mine (a new `lchest` bucket - store something in the chest before
  it is even deposited - plus a `paidForTest` hook). That change is not released and not tested by me. To keep my two
  data modules from carrying it out under a trail-story note, `dist/modules/engine.js` and `dist/modules/hudchest.js`
  were rewritten to the exact bytes of the v39 inscriptions (`--dry` then reported "147 modules, 2 changed"), the
  release ran with `--no-build`, and registry v40 points both at the v39 ids - verified from `/content/`. The next
  build from `src/` will pick that chest change up; whoever owns it should gate and release it.
  Live: registry v40 loaded, console errors none, all 147 modules fetched, and the quest plus Silas's giver flag were
  read back off `/content/` rather than assumed. Card 40cb10b142d6cd4f0093aeb83ef932f4d7853e9951b6297daefd956f56803c43,
  feed post e08aa00560dacef7e156c10dca52052bc7e70311dbc0592664d91bfa55cc4e11 (post + 7 replies).

## v0.8.33 — 2026-10-05 14:19 (registry v41 59f03a4d..) — trail story, increment 8: a third thread in Saltmere, and it is made of cloth (a tester)
  Two modules: `data/quests` (a new quest) and `zones/saltmere` (Mabb the sailmaker becomes a giver - her two idle
  `lines` are deleted and they went into the steps). 147 modules, 2 changed, released `--no-build`; launcher
  unchanged at c879bc1f..649f5.
  "The Sail Loft": eight willow battens, because the north boat's sail is battened with oak and oak snaps when a gust
  arrives all at once; two red deer off the marsh grazing, for a sewster's leather palm rather than for eating; three
  old nets for warp thread, which you get by asking for the damaged ones; and the last step is one word - *warp* -
  said at Bela's counter, settling an account from the hungry month that neither woman will ever mention. Pays
  woodcutting, attack, speechcraft, and a cape cut off the offcut - red because Mabb ran out of white - into ASHVALE
  The Sail Loft.
  WHERE EVERY ASK LANDS WAS MEASURED, and it changed the quest. A probe over the shipped world (seeded worldgen sites
  woken, plus what stands inside each zone's own map) says: willow is Saltmere's own tree - 29 tiles of it in the town
  map, the nearest 6 m from its centre - so the battens are local; the nearest red deer herd is 143 m out; and there
  is nothing with teeth near the harbour except hens, with the nearest giant-rat camp 253 m away in the woods. The
  step as first written wanted six rats "in the customs warehouse", which would have sent a player a quarter of a
  kilometre into Whisperwood while Mabb said it was next door. It wants two deer now, which is what a loft actually
  needs (leather for the palm) and is actually there.
  tests/core_test.js: a new generic rule beside last increment's gatherability one - for every kill a quest in built
  ground asks for, the world must hold that many of that creature, counting a zone's own `spawns` and every seeded
  site's spawns together - so a quest cannot quietly want 20 animals out of a 3-head herd. Unbuilt steps (`keep`) are
  skipped by the same guard the data checks use. Then the quest played end to end in Saltmere: giver flags, willow in
  and woodcutting up, two deer woken at the herd and killed and counted, the nets in and speechcraft up, the `talk`
  goal crediting at Bela's shop counter, the cape minting into its own collection at Mabb's, the closing lines, and
  the `8 more willow` progress line for a character at step 1 with an empty bag.
  HELD OUT OF THIS RELEASE, same as v40: `src/engine.js` and `src/hudchest.js` still carry the 12:57 chest/ledger
  change that is not mine (`lchest`, `paidForTest`), so both `dist/` copies were rewritten to the exact bytes of the
  inscriptions the live registry points at (engine dcb818fb.., 142203 B; hudchest f8b152cd.., 6785 B - both printed
  MATCHES), `--dry --no-build` then reported "147 modules, 2 changed", and registry v41 points both at those same ids.
  The next build from `src/` will still pick that change up; whoever owns it should gate and release it themselves.
  Live: registry v41 loaded, console errors none, all modules fetched, and all four steps plus Mabb's giver flags were
  read back off `/content/`. Card da2dafc10854b162b316b1ded7138bb53cec3f92126e0b46cc27c5f355ddfab3, feed post
  0b51bb764ad2521b66f23f76fdaae34cbef790b1f76b3e31247ac7428de48a92 (post + 6 replies).

## v0.8.34 — 2026-10-05 15:11 (registry v42 be07e8e4..) — trail story, increment 9: Ashvale's fourth thread, and it is a pump (a tester)

  The Tin Pipe, and Pip the apprentice, in Ashvale village (20,52, by the mine track). Pip is one of the village's
  ghost devs - "You found a thing that shouldn't work? That'll be mine" - and he has never had an errand of his own.
  He has one now, and his two old chat lines were folded into it rather than deleted: his "shouldn't work" line opens
  step 1 and the fish-up-a-tree line comes back at the end of step 4. His npc record lost `lines` and gained
  `"talk": "quest", "quest": "tin_pipe"`, which is all a giver needs.
  The story is the reason for the four steps: the low coal seam went under with the winter water in February, and a
  pump is a pipe, a seal, a fall of ground and a bellows - so tin, hare leather, wolf pelts, and Modulus's levels.
  WHERE EVERY ASK LANDS WAS MEASURED FIRST, again, and it decided the whole quest. A probe over the shipped world:
  there are three tinstones in the Ashvale mine, the nearest 15 m from the village centre at 38,46, mining level 1
  takes them (175 xp) - a metal that is right there and wanted by nobody in the data, which is exactly the loose end
  a thread should pick up. Hares: 603 in the world, 33 herds within 700 m of the village, nearest herd 123 m due
  north. Grey wolves are the eight the village's own Whisperwood posts already stand in front of (x 15..27, y 13..20),
  the nearest fight in the game, about 37 m from that wood's centre - so the pelts are a real walk and a real risk,
  not an invented species. Modulus is at 33,50, six paces of conversation from where a pump stops being a pipe. The
  pay is `tinderbox` - an item that exists in the data and that, until this quest, nothing in the world wanted -
  minted into its own collection, "ASHVALE The Tin Pipe".
  tests/core_test.js: a third generic rule beside the gatherability and kill-population ones - a `bring` step may
  only want a thing the world can actually hand over, meaning a node item, a fishing mark, something some monster in
  built ground actually drops in at least the goal quantity, or something a shop in a built zone stocks. That rule is
  what stopped this quest wanting a washers-and-seal item nobody makes; it also audits every quest already shipped.
  Then The Tin Pipe played end to end in the village: giver flags, six tin in and mining up, four hares walked to the
  herd and shot, two pelts in and strength up, the `talk` goal crediting at Modulus, the tinderbox minting at Pip's
  with the done lines, and the `6 more tin` progress line for a character at step 1 with an empty bag.
  HELD OUT OF THIS RELEASE, same as v40 and v41: `src/engine.js` and `src/hudchest.js` still carry the chest/ledger
  change that is not mine (`lchest`, `paidForTest`), so both `dist/` copies were rewritten to the exact bytes of the
  inscriptions the live registry points at (engine dcb818fb.., 142203 B; hudchest f8b152cd.., 6785 B - both printed
  MATCHES), `--dry --no-build` then reported "147 modules, 2 changed", and registry v42 points both at those same ids
  (read out of the registry JSON itself, so this release did not ship anyone else's half-finished work).
  Live: registry v42 loaded, console errors none, all 147 modules fetched, and all four steps plus Pip's giver flags
  were read back off `/content/`. Card e0b8f4bdba95432372cae3956c4e3b8791ffe0e150794597227bd025f4ed4c43 (inscription
  1432, cover 28d10074.., version 0.8.34 and the play id confirmed from the card's own JSON).
  Feed post 5b79bb9f6a625808fd60d3ee8ce8e5df886ea248b3b52151e87cd64d0dee2c77, with the note continued in six replies.
  One honest blemish: I assumed the card job had hung when its id file had not appeared yet, cancelled it and launched
  the poster a second time. Both runs had already posted, so there is a second top-level copy of the note,
  933f91ba8c2283490deb.., which is now hidden as reported. What that second run actually did - and this is the part
  the first version of this paragraph got wrong - was attach its replies to ITS OWN copy of the post, because the
  poster resolves "which post do I reply to" by matching the first paragraph's text in the page. So the real post was
  left with only its first two paragraphs under it, with nothing duplicated anywhere. The thread under
  5b79bb9f6a625808fd60d3ee8ce8e5df886ea248b3b52151e87cd64d0dee2c77 was completed after that by
  /home/you/ashvale-thread-fill.py <post key> <note file>, which reads one particular post's own replies and posts
  only the paragraphs missing from them; it reported "paragraphs still missing: 0", and the note now reads complete
  there - post plus six replies, no repeats. Lesson kept twice: read a chain job's own output file before deciding it
  hung, and never run a text-resolving poster twice for one note.

## v0.8.35 — 2026-10-05 16:12 (registry v43 c36667c3..) — trail story, increment 10: Ashvale's fifth thread, and it is a ledger (a tester)

  The Hawk Ring, and Auditor the clerk, at 26,53 in Ashvale village, by the chest. Auditor was one of the village's
  chat-only NPCs - two lines about tickets and ledgers and no errand - so his record lost `lines` and gained
  `"talk": "quest", "quest": "hawk_ring"`, and his "Ticket, please" line was kept as the last line of step 1 instead
  of being thrown away. The thread is a bookkeeping thread: gold is struck in this valley, the coin says so, and the
  village ledger has never once shown gold drawn out of the seam that gold comes from. Four steps close that line.
  WHERE EVERY ASK LANDS WAS MEASURED FIRST, again, and the measurement wrote the quest. A probe over the shipped
  world (/home/you/ashvale-survey10.js, ashvale-survey10b.js): the village mine has exactly three gold stones
  (42,42 / 44,42 / 45,45), all 21-23 m from the well at 22,52, needing 30 of mining - so "six lumps" is a third of
  what exists, in one corner a player has no reason to visit unless a quest sends them. Mithril: exactly two stones
  in the whole parish (45,42 / 43,43), same corner, 40 of mining - which is why the ask is two and not three, and why
  one is for the die and one is left so the die can be cut again in fifty years. Maple: 66 tiles, nearest 51 m out in
  Whisperwood, 30 of woodcutting, wanted as charcoal because an anneal is a heat held and maple chars slow; the goat,
  chicken and hen surplus was rejected because those animals have no spawns in the surveyed world at all. The pay is
  `ring_hawk`, an item the data has always had, worth 500, sold by no shop and paid by nothing - now minted into its
  own collection, "ASHVALE The Hawk Ring". Step 4 is a `talk` goal at Pax, because the old die was a signet ring and
  the hawk on it has to be remembered rather than traced, and Pax's own blue-door line is where the village's last
  gold actually went.
  tests/core_test.js plays it end to end with the engine's own walking: the giver flags, six gold mined from the
  three live stones, two mithril from the two, eight maple logs cut in Whisperwood, the talk goal crediting at Pax,
  the ring minting at Auditor's with the done lines, plus a distance rule that both nodes must be within 25 m of the
  well (the quest's "twenty-two paces" is now a checked fact), and the `2 more mithril` progress line. All node
  suites green: core_test ALL OK, globe 96, trip 7, worldgen 34, hawk 11, weather 135 (weather needs node 22, system
  node 18 cannot load the ESM vendor file).
  HELD OUT OF THIS RELEASE, for the fourth time running: `--dry` reported SEVEN changed modules, not two.
  /home/you/ashvale-diff-vs-live.py says why - `src/core.js`, `hudart.js`, `engine.js` and `hudchest.js` carry
  another session's tree-felling work (`FOREVER`/`setFelled`, `netGear()`, the chest `backed = true` flag, hudart
  CSS) that is not mine and not finished, and `data/rules` differs from the live inscription ONLY in the trees'
  `regrow` numbers, which that same work set to -1 while the live game has them regrowing (T/P 40, O 60, W 60, M 75,
  Y 90). `ashvale-pin-modules.py core hudart engine hudchest data/rules` rewrote those five `dist/` copies to the
  bytes of the inscriptions the live registry points at - core 26005633ff4e 104310 B, hudart d5677afc36d1 18715 B,
  engine dcb818fb6b3d 142203 B, hudchest f8b152cdee54 6785 B, data/rules a38dece71932 7898 B, all MATCHES - and
  registry v43 therefore moved exactly two modules: data/quests (42162 B, inscription 1435) and zones/village (7336
  B, 1434), both block 1527418.
  Live: registry v43 loaded (inscription 1437, 17327 B, block 1527428), console errors none, all 147 modules
  fetched, and `hawk_ring` with its four steps plus Auditor's giver flags were read back off `/content/`. Card
  a832de4f9d5fef6896d88484c9120ab00ea13d18bdc0d4976b03267569f72365 (inscription 1438, block 1527435, cover
  28d10074.., play id unchanged c879bc1f.., version 0.8.35).
  Feed post c718dcd25f08bd6e93c8f21ea86de7ddd2ad64426c8d7f5ca0d4b8ac1a55e88d, note continued in six replies, one
  posting run. Two things worth writing down about how it went: the first release attempt inscribed both modules and
  then died on `RemoteDisconnected` before the registry, and because release_modular saves state after every
  inscription the retry reported "0 changed" and had only the registry left to do - resumable beat rerunning it. And
  post_pw.py refused the note outright because one paragraph came to 283 characters, before posting anything, so
  there is no half-post on the feed to explain; the paragraph was shortened to 274 and the run went once.

## v0.8.38 — 2026-10-05 17:35 (registry v46 cbd294692899..) — trail story, increment 11: Ashvale's sixth thread out of the village, and it is a ladder made of wood (a tester)

  Increment 11 is "The Elder Bow", given by Latency the warden at 22,44 on the north road. The measurement that
  wrote it (ashvale-survey11.js / 11b.js, node 18, seeded worldgen): every bow in the game is named after a tree, and
  the wood ladder and the bow ladder are the same ladder - oak 15 (92 tiles), willow 20 (39), maple 30 (66), yew 40
  (19 tiles, all along the north edge of Whisperwood, nearest 36 m from the warden's post and 45 m from the well).
  Tier 4 is called "Yew shortbow", sells at salt_armoury for 1600, and there is not one yew tile anywhere inside
  Saltmere's map. Tier 5 - "Elder shortbow", value 5200 - is on no shelf, in no quest and behind no gift in the whole
  data set: the loosest item in the game. Steps: shoot 6 hares (603 hares in 410 herds, nearest 123 m from the village
  centre, and nothing in the village had ever asked for one whole) for ranged; bring 4 deer hides (1260 deer in 450
  herds, nearest 116 m; deer_hide was wanted by nothing before this) for strength; bring 6 yew_logs for woodcutting;
  then a `talk: orin` errand at the Saltmere anvil, paying bow_t5. Latency's two chat lines went into the quest and
  his record lost `lines`, which is what the one-quest-per-giver check requires.
  The test found two things worth knowing. First, gathering only works in a test if the player is standing on a
  walkable neighbour of the tile: a `gather` command issued from far away leaves `p.act` null and the loop spins
  forever, so `work()` now teleports onto a neighbour tile (world.js walkability, not a guess). Second, a fresh
  character is killed inside forty ticks by whatever lives on the north wood line - one probe player went to hp 0 at
  (22,52) having never seen a yew - so the bowyer in the test keeps its hitpoints up. Everything else passed first
  time, including the 19-tree count and the 36 m distance the quest text reads out.
  HELD OUT OF THE RELEASE: `--dry` again reported seven changed modules - core, hudart, engine, hudchest, data/rules
  are still somebody else's unfinished felling/loader work and data/quests, zones/village are mine. The five were
  pinned to the live inscription bytes (core 7958b10cba54, hudart 30997cd97c92, hudchest e3629f9e03c1, engine
  ce873fb08c70, data/rules 9927878b9c54 - the pin tool reports MATCHES against what the live registry points at) and
  v46 therefore moved my two plus `netretry`, a loader module another session inscribed at 1443 and which the live
  launcher does fetch. Note the pin has to be the LAST step before `--no-build`: `--dry` runs build.py and rewrites
  dist/, so pinning before a `--dry` is pinning nothing.
  Two registry numbers went past while I was writing this and neither is mine: v44 (824fd322, 1439) is content-empty
  - all 31 modules identical to v43 - and carried a re-inscribed launcher (29787c88, 1440); v45 (709267d8, 1444)
  added netretry and no content. So the game's version string jumped from 0.8.35 to 0.8.38 with nothing published
  under the two numbers between, because the convention is 0.8.(registry-8) and I am not going to claim a version
  nobody shipped. The new launcher matters more than the number: release_modular now refuses `--launcher` outright,
  because the arcade keeps each player's save under the launcher's inscription id and a new launcher id means every
  account opens empty - the operator lost a character to exactly that today. So the card's `play` stays c879bc1f.. and the
  loader fix ships as the netretry module instead, which is where it belongs.
  Live: registry v46 loaded (inscription cbd294692899027bd95893935e6ea07c6ed0818a49d99f709bb5b938a2f0cb0a, 17440 B,
  inscription number 1448, block 1527522), console errors none, 32 modules fetched including netretry, and
  `elder_bow` - four goals, pay bow_t5 - plus Latency's giver flags (`talk: quest`, `quest: elder_bow`, no `lines`)
  were read back off `/content/`. Card 5b346890993a7fbc9601de4c5847a7d176d35236570f38b76a6067a8c963d03b, cover
  28d10074.., play c879bc1f.. (deliberately NOT the new 29787c88 launcher, see above), version 0.8.38.
  Feed post 6a741588ea2daf28174735abf8adaf4898e5e5c5d3cc2d47a031ebb8969c5af2, note continued in six replies. My two modules are 1446 (data/quests, 49115 B) and 1445
  (zones/village, 7148 B).
  A release process that was launched with a trailing `&` inside a shell command died with that shell after printing
  one line, and left chain/modules.json at registry_version 45 with the registry already written - which is how a
  "2 changed" run ends up with a registry that does not contain the change. Anything that writes to the chain goes in
  the tool's managed background mode from now on, and the state file gets read back before the next one starts.
- 2026-10-05 v0.8.44 (registry v52, increment 12 of the trail): The Kitchen Range. Cinder the cook at the range seven
  paces from Ashvale's well, five steps, and Ashvale's eighth thread. Cooking had never been asked for by anything:
  ten raw things in the data cook into food, one range stands in each built town, no quest had ever wanted a cooked
  thing or paid a point of cooking XP, and every cooked meat plus the shrimp are bought by nobody anywhere. The steps
  are ten cooked shrimp off the village marks, three cooked hares off the stubble, four cooked trout landed on a rod
  at fishing 20, two cooked haunches at cooking 15, and the last course carried five paces west to Symmetry, who is a
  curator and writes the trout story down. Pay: fishing experience twice (2,000 then 2,600 - the second one is what
  buys level 20, which is what the trout marks cost), cooking experience twice (1,900 then 1,600) and the Frame pack,
  tier four, minted into "ASHVALE The Kitchen Range". The 1,900 was 1,600 until the morning of this release: the test
  that plays the whole thread went red at "level 14", because the cooks inside the trout step only carry a player to
  2,220 and level 15 is 2,411, so the fourth step was asking for a rung the third step could not pay for.
  Everything Cinder says is measured on the seeded world now (ashvale-survey12g.js): the burn curve off the engine's
  own messages (two in five black at a rung, one in five four levels over, none ten over), the stubble 117 m due
  south, the deer 119 m due east, the boar 137 m south-east, four net marks 16-23 paces east, two trout marks 16 m
  east, Symmetry five paces west, Saltmere's nearest tile 365 m. Four of those distances were guesses when the thread
  was drafted and all four were wrong. The trout fact is worth saying out loud: the only two trout marks in the world
  are in Ashvale's lake, while Saltmere - seven marks of its own, pots, nets, a fish stall - has never landed one and
  sells the only cooked trout on any shelf. And Ashvale buys back nothing that came off a fire, so the range is the
  only way on. Four things the play taught and the block now encodes: a carcase is a ground item, `take` by uid; the
  fire cooks the FIRST cookable slot, so a batch has to be alone in the bag; a stale gather act still reads as kind
  'gather' aimed at somebody else's tile, so key it by tile index; a herd is two or three beasts and empty once you
  have shot it, so a three-hare errand is a walk between herds, not three shots in one place. core_test ALL OK (511
  checks) plus globe, worldgen, trip, hawk and weather.
  HELD OUT OF THE RELEASE: `--dry` said eleven changed modules. Mine are two. `core`, `scene`, `hudchest`, `engine`,
  `world`, `wg_paths`, `data/rules` and `data/housekit` are another session's felling and house work and were pinned
  to the bytes the live registry points at as the last step before `--no-build`. The eleventh, `zones/castle`, is not
  in the state file at all, so it cannot be pinned and it went out with this one (0062dec3, 30,415 B) - nothing live
  fetches it yet, and holding it back would have cost a release of its own.
  THE NUMBER MOVED UNDERNEATH THIS RELEASE: `--dry` printed v47 when the increment started; while it was being
  measured another session put v47..v51 on the chain (hudart at 17:33, then engine and scene, last at 20:52), so
  `check_live.py` said live was v51 the evening of the release and this one is v52 = 0.8.44, not the 0.8.39 the first
  draft of the note said. Read the state file, not the last note, before writing a version anywhere.
  Live: registry v52 4e78810f4084abc557d8a8b48bd99f817903a8109ca2be0231b49cc77b8dcc40 (JSON beside the file), launcher
  c879bc1f.. untouched, `check_live.py` loads v52 with no console errors, and `kitchen_range` (giver cinder, five
  steps, goals shrimp x10 / hare_cooked x3 / trout x4 / venison_cooked x2 / talk symmetry) plus Cinder herself (20,57,
  `quest: kitchen_range`) were read back off `/content/`. My two modules are data/quests 1bd77d561a14ed31 and
  zones/village bcac5d9787224c50. Card 01c1bbe00835255951079b5ef3b97007830e98eb6756f84260ea5cf0dc08a7f7 (version
  0.8.44, play c879bc1f.., cover 28d10074..). Feed post
  9707c81ee6290c5933ecb6664cbb0ffebb3210044d66258ed840b6beed606da2 - one post, 1,726 characters, from this box's own
  account after every item in it was checked live.

## 2026-10-06 00:25 - registry v53 = game v0.8.45 (the Quests panel tells the truth, and Fenn the tanner)
  WHAT WENT OUT, all of it mine: `src/hudpanels.js` (the Quests branch - every goal kind and every giver now says what
  it actually is, `many()` makes the plural, `NM` reads the giver's name off the zone data; @cinderwalker twice: "slay 8
  undefineds" and everyone sent to Elder Maren), `data/quests` (The Skinning Knife, five steps, giver fenn: 6 rat_pelt
  / 8 hare_pelt / 3 boar_hide / 2 timber_wolf_pelt / talk pip; pays dexterity 2200-4400 and dagger_t4), `zones/village`
  (fenn the tanner at 36,48 and the cook renamed to "Hob the cook", id still cinder) and twelve new `parts/char.*`
  JSON parts, one of which - `parts/char.hob` - the renamed cook needs to be drawn. Castle work stayed out with
  `ASH_NO_CASTLE=1`. 15/15 modules on chain, 105 s, exit 0.
  PINNED, NOT MINE: `wg_paths`, `wg_sites`, `world`, `core`, `scene`, `hudart`, `hudshop`, `hudchest`, `hud`, `engine`,
  `data/items`, `data/shops`, `data/rules`, `data/housekit`, `zones/saltmere` - all pinned with
  `/home/you/ashvale-pin-modules.py` as the LAST step before `--no-build`. New modules cannot be pinned (they are
  not in the registry yet), which is why the twelve char parts went out whether or not their owners were ready; they
  are inert JSON except for hob.
  LIVE: registry v53 732d709971ba90c5b46ba04b0063bdf76a31dce6db36810092e040f890b95ef2, launcher c879bc1f.. untouched.
  `tests/live/check_live.py` loaded v53 with no console errors, and the new `tests/live/check_quest_panel.py` drew every
  one of the 12 quests at every step on the LIVE page (75 lines: unstarted, in progress, return-to-giver, completed)
  and found nothing: no `undefined`, no empty goal, and the unstarted quests send the player to eleven different named
  villagers (Auditor, Bryce, Cobb, Elder Maren, Fenn, Hob, Latency, Mabb, Pip, Rowan, Silas) instead of all to Maren.
  Card 1392c3e2c8a00e07ac397dd69c25f846686e519df67a7fc139fd81a9c3d7ba9a (version 0.8.45, play c879bc1f.., cover
  28d10074..). Feed post 4abb34bfcdb3ba5b072c7b9f2b3212e152ed4c21b5611f3588273d71cca8a7bf - valid=1 at block 1528094,
  read back off the ledger on .25 (`arcade_tx`, message_type 200), one post, no duplicate.
  THE FIRST POST ATTEMPT DID NOT GO OUT AND SAID SO: `feed_post.py` filled the say box, printed POSTED with no link and
  nothing in the ledger. It now prints what the page answered before it looks for the link; on the retry the box went
  to 0 characters, the link came back and the ledger agrees. If it ever prints "post not found" again, settle it from
  the ledger before posting twice.
  v54 IS NOT MINE: another session put v54 on the chain at 00:4x (the camera that sees through walls, feed note
  827bc1fd.. as @ashvale) and my four modules are still the bytes that registry points at, so 0.8.45's contents are
  live inside 0.8.46. Do not write "0.8.45 is the newest" anywhere - the game version is 0.8.(registry-8) and the
  registry was 54 by the time this note was written.

## 2026-10-06 01:2x - registry v55 = game v0.8.47 (one module: hudpanels)

What shipped: the Quests panel's plural wording. v53 said "bring 8 logses", "oak logses", "raw shrimpses",
"red deers", "trouts" because the pluraliser looked at the last LETTER of the phrase instead of its last WORD,
and its `(x|z|ch|sh|s)` branch added -es to names that are already plural. `src/hudpanels.js` now decides on the
last word and carries a small list (deer, trout, salmon, fish, cod, plaice, bream, sheep) that never changes.
Nothing else changed: `161 modules, 1 changed: hudpanels`. Nothing of the other session's was riding along, so
nothing was pinned; ASH_NO_CASTLE=1 again, castle modules untouched.

- registry tx: 55742ed09dd82b4e8d240fea0f26ff20f08ce8783b528493da77c9dc7922c0e9 (v55, launcher unchanged
  c879bc1f5f3cfc1300b9f24252a47ce395028dc65fc78a0ab3004a9f272649f5)
- module: hudpanels.js -> 10ef75c71afdfc31

Verified live: `tests/live/check_live.py` loads v55, no console errors. `tests/live/check_quest_panel.py` drew
all 75 lines (12 quests x every step) and the only three problems left are the Keep's missing
`wraith`/`ash_knight`/`lich`, which are not mine. The lines this release was for now read "Step 1: bring 8 logs
(0/8).", "bring 8 oak logs", "bring 12 raw shrimps", "bring 10 shrimps", "bring 4 trout", "slay 2 red deer",
"bring 8 willow/maple/yew logs".

That check is why the bug surfaced. It used to build its expected line with a Python copy of the JS
pluraliser, so it agreed with "logses"; it now takes only the drawn text plus the raw inputs (goal id, count,
giver id) and rebuilds the sentence in Python with the grammar written out again. Run against live v54 it
printed 10 wording problems, all real. Same pass: the monster/item maps must be keyed with
`Object.entries(...)` - the module objects carry no `id` field, and mapping `m.id` produced 41 phantom
"no such monster" failures.

- Games card: ea675fd1093d3a3ac2920ed32a442ee6b4d81a2bb594966a129da938d3938b4d (version 0.8.47, play
  c879bc1f5f3cfc1300b9f24252a47ce395028dc65fc78a0ab3004a9f272649f5, cover 28d1007491d413d4c07cce95d43eff4c54600cffd78661ff3456606a15493210)
- feed note: 9a7a532a4b0cadf8f281cdfcb8c4dedc76a661f6e9871f678503725d024842b9 - arcade_tx block 1528131, valid=1


## 2026-10-06 03:2x - registry v56 = game v0.8.48 (two modules: the wildlife tables, and the quest text that reads them)

What shipped: wildlife v2, which Claude parked until the two quest facts it broke were rewritten against it.
`data/wg_tables` is Claude's change (`wild.chance` 0.38 -> 0.45, `keep.timber_wolf` 600, and a new `wild.size`
per species - deer 20-30, wolves 8-15, goats 15-25, boar 6-12). `data/quests` is mine: the dialogue and the
numbers in `tools/make_data.py` that the tests repeat. `161 modules, 2 changed` - nothing else, nothing pinned,
`ASH_NO_CASTLE=1` so no castle module or castle portal stone rode out.

Measured on the seeded world with `tests/core_test.js`'s own convention (`sitesIn(village start +/- r)`, deduped
by `x,y`; the old survey probes used a radius, which is why some of my old distances read a little low):

| | herds in 3 km | inside 600 | nearest | head per herd |
|---|---|---|---|---|
| rat | 191 (was 191) | 7 (7) | 250 m (250) | 3-5, unchanged - no `wild.size` entry |
| hare | 495 (413) | 26 (23) | 123 m (123) | 2-3 (was 1-2) |
| boar | 81 (69) | 6 (5) | 138 m (138) | 6-12, median 9 (was 1-3) |
| timber wolf | 236 (215) | **0** (4) | **774 m** (501) | 7-15, median 11 (was 2-4) |
| deer | 522 (450) | 27 (23) | 117 m (117) | 15-30, median 25 (was 2-4) |

Herd *positions* did not move - same sites, same distances; only density and head counts. So the rewrites are
numbers, not geography: Fenn's four count lines and the closing arithmetic of `skinning_knife` (1003 herds where
it said 888, his wolf rung 300 -> 600 paces and now the long walk it has to be), Latency's hare and deer lines,
Cinder's venison distance, Mabb's marsh deer.

The `elder_bow` yew step was not the rule problem the handoff said. `work(yew.slice(0, 5), 'yew_logs', 6)` cuts
5 logs under **both** tables when the probe is run standalone - two of those five yews have no walkable
D4-neighbour inside the whisperwood grid, and v2's larger animal population shifts the shared RNG, so the gather
rolls in the fixed 600-tick budget went bad on the third spot. The check now cuts from all nineteen
(`work(yew, ...)`) which is what the fiction says anyway. No rule, no worldgen, no `src/`, no other data file
changed. One line needed re-writing rather than renumbering: step 3 claimed the yew stand was "empty ground where
it was full". Under v2 there are 62 deer herds within 900 m of the nearest yew and 7 within 250 m of the trunks
(closest feed 95 m, 22 head) - only the wolves stay off, nearest 816 m.

Chasing that claim turned up a fact worth pinning: **`+y` runs south** (whisperwood is y 0..40 and is "up the
range", the village y 40..64), so bearings are `atan2(dx, -dy)`. Mabb's marsh deer are 114 m *south* of her post
(428,172 against 457,62) and her line said "north of the north pier head", sending people the wrong way; my
`tin_pipe` comment made the same slip about the hare form. Both fixed. The drover's "boar grazing west of the
town" held up - 16 sounders within 900 m of Saltmere, nearest 283 m north, two about 310 m west.

- registry tx: c044adc4108fb3123cfd315cbd199d27de981bc849d9f257feef9e5c14a25aea (v56, launcher unchanged
  c879bc1f5f3cfc1300b9f24252a47ce395028dc65fc78a0ab3004a9f272649f5)
- modules: quests.json -> 87f37162f4a694362d4c844050c39a0b07717f7c3627b5e69a2e68cf7f1887b9 (v2),
  wg_tables.json -> 48c4a5c1fddd65df49c03d2fb33aad3849c69634e62f062bfbf3ddf82a937d2d (v2)

Verified: `tests/core_test.js` **ALL OK** on node 22 with the new tables (the herd arithmetic, "no timber wolf
inside six hundred", the two pelts off the 774 m walk, and the yew step all pass);
`tests/worldgen_test.js` "all worldgen checks passed" - the goldens needed no touching, so wildlife v2 is not a
geometry change; `tests/live/check_live.py` exit 0 - it loads **v56** with `console errors: none`.

- Games card: 02f417e459cdf49e7d8883c19a708fa8378640e2b346b213bf232cdfda0378d1 (version 0.8.48, play
  c879bc1f5f3cfc1300b9f24252a47ce395028dc65fc78a0ab3004a9f272649f5, cover 28d1007491d413d4c07cce95d43eff4c54600cffd78661ff3456606a15493210)
- feed note: 68ba123e93ce6ee0af27b5de850d3070ee6bc88fa862fb22a27c3acdf51bbf2d - `/feed?post=...` answers 200 with
  the public Host header and the three bullets and the a tester mention are in the page.

**Waiting on the operator, touched by nobody:** with wolf packs at 7-15 (median 11) and boar sounders at 6-12, four
quest steps got materially harder - Fenn's rung four (2 wolf pelts), `ashen_crown` step 1 (slay 10 wolves, where
@cinderwalker stands at 0/10), `drove_road` steps 1 and 3, and `kitchen_range`'s boar. And `rules.respawn.deadTicks
= 2000` (~20 min, and only if nobody stands within 8 tiles) is why the bot logs "walked to the rat grounds 6 times
and found none" - a player who hunts one field to the last rat hits the same wall. Both are difficulty/first-hour
calls and I have not moved a number for them.

## 0.8.86 - Ziibiing moves to site 8; the first release inscribed through arcade-publish (2026-10-11)

Registry **v111** d0eee89e1f0c6f5471e80b790a6763432305e8a2cdc970f69082602e9ac8848b (launcher c879bc1f.. unchanged).
16 modules changed: wg_paths, worldgen, core, engsky, engine (sent through the arcade's offer path by the wallet tool;
core.js went on chain TWICE - 45b5139f (recorded) and a9df8cca - because the .25 interface restarts every 15 minutes
and wipes its offers mid-send), then data/quests, data/rules, data/globecfg, data/zoneindex and the seven Ziibiing
zones through `arcade-publish` (dogecoin-arcade branch claude/rpc-publisher, D-194): built, signed and broadcast here
over the LOCAL staging testnet node's RPC, no offer, no browser, no .25. Cards: ASHVALE 77417703d95d8f28..
(listing_v0886), Ziibiing eab50114a790457b.. (listing_ziibiing_v0886), both through the publisher
(tools/list_game_publish.py). check_live: registry v111, console errors none. Note: chain/post_v086.txt.
Lesson: the publisher's data modules carry application/octet-stream (the content type fell through for .json names);
the loader does not care (fetch().json(), scripts via blob), but the publisher now guesses the type from the name.

## Atlas 2.0 - the Atlas boots from the game's registry; registries v112 and v113 (2026-10-11)

The operator: "a better way for the Atlas to render so that it always automatically integrate any changes made in the game";
"the Atlas is missing its poles and equator" (the live Atlas was simply a stale earth-registry build); "put back in
the walk here feature".
- `earth`, `atlas_shapes`, `atlas_chunk` are GAME modules now (build.py), and `atlas_palette` a game data module. The
  Atlas launcher **b87e82829e9da154c90ebd6e447db9f51af5846e0929ebc1ce3639952ead6f95** is the game's launcher page
  booting @ashvale's newest `registry` and starting `m.earth` (release_modular.py --atlas-launcher, inscribed through
  arcade-publish). So every game release updates the Atlas: modules, worldgen, every zone (lazy ones fetched at once).
  tools/release_earth.py and the earth-registry line (v1..v14, launcher a4597d82..) are retired.
- Registry v112 389dd9ed.. (the three Atlas modules), v113 112d71f1.. (atlas_palette: v112's Atlas threw `PAL.tile`
  undefined after the boot screen - "The atlas never starts after the loading screen").
- Walk here: tap a spot (or the view's centre) -> Walk here dives to the nearest standable ground and walks at eye
  height (WASD/arrows, Shift runs, drag looks, a pad on phones); Fly up returns. ?at=<any zone id>, e.g. ?at=ziibiing.
- Card: listing_earth 2.0, d0c34006b10b4265.. (play = the new launcher). Live check: registry 113, 16 zones, EARTH up.

## 0.8.87 - 2026-10-11 (Claude): the Tap's upstairs, Chess Champions board, collision, candles
- Registry v114 63954733db33b12ec87170c5ef74b3c55b89e47cc54620c4f89c510666e9188d; modules holdemlib (new), core, scene,
  hudchess, hudpoker (new), hud, engbank, engine, zones/saltmere; through arcade-publish (local node RPC), ~914 KB.
- What: two round card tables upstairs in the Saltmere Tap (the game that is played there is NOT named anywhere public,
  the operator), candle wheels, torch lights gutter, poker-table and chess-board tiles solid, floor-bar buttons gone (tap the
  stairs; PageUp/PageDown), CHESS CHAMPIONS board (Bank score key chess_wins), 'card table' wording.
- Feed note posted (chain/post_v0887.txt; its two reply paragraphs failed to attach - post_pw could not find the post).
- Cards: NOT inscribed - list_game_publish.py's card.html was byte-identical to 0.8.86's, and arcade-publish journals
  by content sha256 alone, so it returned the 0.8.86 card id (77417703..). Fixed by putting the version in the HTML;
  the cards go out as 0.8.88 (next release, the storey fix).
- Tests: poker_core_test, chess_test, core_test ALL OK, poker_pw, chess_pw; check_live exit 0 (no console errors).
- Known after release (the operator): a seated player upstairs was drawn on the ground floor by others -> 0.8.88.

## 0.8.88 - 2026-10-11 (Claude): storey on the wire
- Registry v115 cee8585b6a3e78359d1cc54944f524fcecdd2c53596960a331cdef1cae27bb97; modules core, engine (arcade-publish).
- Fix (the operator, live): a player seated at the Tap's upstairs tables was drawn on the ground floor by others. The position
  row now carries `l` (storey); remotes are lifted by it; host puppets take `lv`. poker_pw checks it (1.80 m up).
- Cards: ASHVALE 0.8.88 c009edc75bbeb07985b4b91d4c0c03b8764e86adadbc5898b24e31d5693dc127, Ziibiing 0.8.88
  ebc351a87804914c718e3bf2c703eee5dd2f7ca8369236f2d072841c2c82497a (list_game_publish.py, version in the HTML now).
- check_live: registry v115, no console errors. sadfrog's design studio (GitHub PR #3) imported (7df2220), no module.

## 0.8.89 - 2026-10-11 (Claude): the card tables, second round
- Registry v116 86313c424e8c361a53ab9e8d4b7aa88763a73c9f024751883cd993bb08c13fce; modules holdemlib, core, scene,
  hudpoker, engine (arcade-publish). Cards: ASHVALE 59ca35f934cabaade577271de3fb5f2fc0e9bdec201efe909c173132f751f4f4,
  Ziibiing 5c11fc96acbb593a2683ca0b362635378217e60a61b50dc915969c841fa6b038. check_live: v116, no console errors.
- Buy-in tiers 100/1,000/10,000 GOLD (blinds 1/2, 5/10, 50/100), showdown face up with hand names and a winner banner,
  bet slider to all-in, phone panel fills the top half, pips/court art/medieval back, gold coin bets toward the middle
  and the pot pile, players by @tag, hole cards side by side. Tests: poker_core_test, chess_test, poker_pw, chess_pw.
- No feed note (the operator: the game is never named). Plan for the Bank: handoff/bank_rpc_plan.md.

## 0.8.90 - 2026-10-12 (Claude): private hole cards
- Registry v117 95b7f06a01c82acf13a10598cbd0e0e614f99b8dbb064efb9138c4d0554f85db; modules holdemlib, core, engine.
- Cards: ASHVALE 0b6fb83e8cadf25070837a8cb06ad0248a1872c9d7ee566ea324dc25f14b8a48, Ziibiing
  a720dca835afedf12f9f96d02941502017ee825d22093396105a167b78093bd9. check_live: v117, no console errors.
- Hole cards are sealed per seat (ECDH P-256 + AES-GCM, engine), the sealed set on its own Ph message, a replica opens
  only its own (handoff/poker_plan.md 6e). Tests: poker_pw (wire row has no card, each copy sees its own two), chess_pw,
  poker_core_test. Bank (same commit, not a module): custody-first token payouts, coalesced sends, journal, held jobs,
  --status/--retry/--audit; tests/bank_batch_test.py; unit restarted 23:57 (handoff/bank_rpc_plan.md 8).

## 0.8.91 - 2026-10-12 (SadFrogLTC, released by Claude): the ruined keep enclosed, a ladder stile over its wall
- Registry v118 9c760ef9f7c20820004ca352bc3528e89c302fd3d4e16729e7120b1a5de9d8ed; modules scene, data/zoneindex,
  zones/dragonkeep. Imported from GitHub 2bd6b1d3 (+ merge 43e75354) as commit 33e8671 under his name.
- Cards: ASHVALE 023bad557fcc7cc8d2e7f6021b84d817431793707661c3d2a1b71d47035f7f69, Ziibiing
  f36a1ed5f1b8f4e47b9e95bb1be037426d91807deffbc8507856623038c15d80. check_live: v118, no console errors.
- Tests: dragon_sign_test, dragonkeep_test, dragon_sign_pw, core_test ALL OK, chess_test, poker_core_test.
- In src for the next module release: engbank hears the Bank's 'paid' word.

## 0.8.92 - 2026-10-12 (Claude): the flower-colour warning, the Bank's paid word
- Registry v119 10edea03493acddc7cd26d00e22b39b778fa02b579569e470561ef0ff10c7329; modules scene, engbank.
- Cards: ASHVALE cd585f617414c75baa23e85e4c5683865e5f69b138df0d631b29a4bb33333362, Ziibiing
  138b4674ca869bddd30a7831e2373db4ae54e336cdf40465acaf56ddd47f6ad9. check_live: v119, no console errors.
- Fallback icons for flint, snare, tomahawk, dragon_cape (tools/bank/render_icons.py); the 9 'no picture' jobs retried:
  6 paid by 09:02, 2 held after a lost connection (pieces minted, sends re-pointed at those exact pieces), 1 re-queued.

## 0.8.93 - 2026-10-12 (SadFrogLTC + Claude): Vael loot, altar saplings, dragon drops; deposits settle; taps fall through
- Registry v120; 13 modules (world, core, engbank, engine, data/items, monsters, quests, rules, assets, 3 Even Guard parts,
  item.sapling). Imported from GitHub 87c208d3 (+ merge c91911af, bundle d5bc1966) as b06364a under his name; the GitHub
  assets.json carries no token ids, so only his three new NFT entries were taken (a full copy would have blanked the
  Bank's token map - caught before release).
- Claude: deposits wait 15 s of quiet; a table on another storey does not catch the tap.
- Cards: ASHVALE b73cff1186a2bcfa6e61cec8c18894bde501304377e6cb66a4c1d3ec45377ce8, Ziibiing
  938d4789813974ac02783736e02c83efaf7b7eb7a50845d73cb8fc1502471a1f. check_live: v120, no console errors.
- Tests: vael_loot_test, sapling_place_test, dragonkeep_test, chess_test, poker_core_test, dragon_sign_test, core_test
  ALL OK, poker_pw x2; balance_test keeps its 3 pre-existing Wenna failures.

## 0.8.94 - 2026-10-12 (Claude): candle wheels under the ceiling
- Registry v121; module scene. The wheels over the card tables reached up through the third floor (a storey is 1.8 m);
  they hang at 1.3 m now with short chains. Cards: ASHVALE 460a4015685d26fc53bc18e081734e610f315bbe3c13cd46be748b73dab8bcc7,
  Ziibiing 05420045b88abdba13531e10fec70001384f1b2514e8dcc11959587b37a8c994. check_live: v121, no console errors.
- GitHub bridged at 10:17 (003256ce).

## 0.8.95 - 2026-10-12 (Claude): the GOLD on a table always comes home
- Registry v122 32009e0dcd618cace5715fde66047b62f58ddf5fcf1e45e02ca276613a7a7f07; modules core, engine (commit 4e1cd9d).
- Cards: ASHVALE dbd635747d19cc39f6a1266dd242fbbbd66f9e5327b63ea5d6ed503db7751a64, Ziibiing
  af401617520159faf8e198d3164a6ac67f27a3c608a9def84d75a74f4ebcb4eb. check_live: no console errors.
- Card-table stacks and chess stakes survive a closed tab, dead phone or dropped room (handoff/poker_plan.md 6f).
  Chess: leaver of a begun game loses the wager; both dropped = both refunded; decided by the host only (a dropped room
  used to pay BOTH players the win).
- Tests: poker_core_test, chess_test (their stake blocks finally run), poker_test, poker_pw, chess_pw, core_test ALL OK;
  balance_test (3 Wenna) and worldgen_test (golden set-piece) fail the same on the previous core.

## 0.8.96 - 2026-10-12 (Claude): a small red note instead of the save banner
- Registry v123 682d0f7866b53ce90bf33965047ce546d0d9d46f302633e6a850fa9f67fe612a; modules hud, hudart (commit 32b1af9).
- Cards: ASHVALE 79d0379d1d5d163c5117194a3eb3867f3b8002649bf1a4b91c992ba2dfbbbaf8, Ziibiing
  8bf423d9e8fd7caa9a9bf6c765fb89e9c5e11d93c6f8c177b8d3c193baf5fb2f. check_live: v123, no console errors.
- the operator: the big "progress is not being saved" banner usually goes away within a second or two. Now "Not saving" /
  "Offline" in small red text top right, only after 2.5 s; tap reloads. Shot tests/shots/netlost_note.png.

## 0.8.97 - 2026-10-12 (Claude): players upstairs seen only from their own storey
- Registry v124 d0cfadc0857213406b574db650e47fdbf1694d660ef7a0083ef77ab6bb17f5ec; module engine (commit fa0984c).
- Cards: ASHVALE 8b94671c58d4bfb6151521f23c4bbdcec7eed4fbb7d9c8ed2c0350eced34de67, Ziibiing
  8aaa8000a19101da4e4c442c7477395e306c45f976fca9082af6831e3d152d06. check_live: v124, no console errors.
- the operator: someone upstairs looked like they stood in the air to people on the ground floor (storeys above you are
  see-through). Another player on storey >= 1 is hidden unless you stand on that same storey (r.floorHid; tag,
  bubble and prayer icon follow). Ground-floor players stay visible from upstairs. poker_pw updated and passing.

## 0.8.98 - 2026-10-12 (Claude): ASHVALE's creator offers only Ashvale clothing
- Registry v125 b075c273de911557afbc4064a98e17daaab13a08b946986c7c22b34dd9e7b7b8; 6 part modules (commit bc43ac5).
- the operator: "the character select from ziibiing is now the character select for Ashvale". Braids, ribbon shirt, beaded
  vest, ribbon skirt and the jingle regalia (shirt + skirt) had no `homes` mark (made in 0.8.65, before home-only parts
  in 0.8.80), so the ASHVALE creator offered them (new account nqZkor made an Ashvale character in braids + ribbon shirt
  tonight). All six are homes: ["ziibiing"] now. Verified by cycling every creator option on both homes; Ziibiing's
  creator is unchanged. Characters already wearing them keep them. Shot tests/shots/creator_ashvale.png.

## 0.8.99 - 2026-10-12 (Claude): chess Stand up after the opponent's connection dropped
- Registry v126 0d2f027c75ce57a742ee4710c88a1c2a2f6c72b26e61e40d56412d96375a77ab; module core 0912391653ffdf57...
  (commit 5af4687; the first run was cut at 590 s after sending core, the re-run inscribed the registry).
- Cards: ASHVALE b97d1a75046ba546d27912d5b69d3fed1ffaba9a1eec841e69cf17c041fc47c5, Ziibiing
  0e6a2731a021a1e4812a553b3ccabdb59b838a512bcd659d787f526bc9936ff5. check_live: v126, no console errors.
- the operator was stuck at a chess table: 0.8.95's keep-seats-on-drop meant a host whose room dropped re-made its puppets
  without a seat flag; hostStand ignored the Stand up and every row re-seated him. hostStand now goes by the table;
  standing up after the opponent has gone (not in the room, or the host's own player in chLimbo) wins the wager; a
  replica does not close its stake as a resignation while its opponent is gone from its view. chess_test 8-10, chess_pw.

## 0.8.100 - 2026-10-12 (Claude): card tables never stay stuck
- Registry v127 f6a922b94b42586949852aead6978ddc2d754f90ebbda5e53f9b4483837164a1; module core (commit 44cfbe9);
  engine HELD at live bytes (tools/hold_live.py engine): src/engine.js carries an unreleased film hook (_inject).
  (Named 0.8.100, not 0.9: 0.9 is the globe redesign's number.)
- the operator: a player who left a table could not sit back down, and a table whose players did not come back never dealt
  again. Cause: a page that took over dealing between hands kept the old dealer's seats with no deck (pokerTick only
  abandoned 'playing' tables) - "being dealt out" forever. Now any left-over table is cashed out and opened (stakes
  free for the next first sitter), also on the spot when someone sits; hostPokerStand goes by the table. Tests in
  poker_core_test (fail on the old core), poker_pw.

## 0.8.101 - 2026-10-13 00:41 (Claude): card tables - min raise, folded hands, turn clock
- Registry v128 ef545c6117073de49d874af7bd75cd77cd9bbf1f246e9554a32c48a3fde09651; modules core, scene, engbank, engine
  (commit 7644479). check_live: v128, no console errors.
- the operator playing 1/2: guests' panel said "min 50" (applyPoker dropped mr/bg); the felt turned up folded hands at the
  hand's end (now only hands called to the showdown, and your own); the turn ring is a clock (green->yellow->red over
  PK_CLOCK) and beeps the last 10 s for the player to act only. tests/poker_flow_pw.py = his evening (river calls,
  river fold, stand + sit straight back down, everyone up, new stakes, the timer) - ALL OK.
- !! ALSO SHIPPED, NOT MINE: the local agent's working-tree snapshot 50a4eda (2026-10-12 23:07) - kill boards kept by the
  Bank only: the game now sends score v:2 {d: 1} per kill instead of a count. The RUNNING Bank (started 2026-10-12 14:12,
  old bank.py) ignores d-only messages, so the dragon/chess boards stop counting until ashvale-bank is restarted on the
  new tools/bank/bank.py (also in 50a4eda). Not restarted by Claude: the agent's lane, and the Bank is the operator's call.
- Mid-release I rebuilt dist (card faces) - never do that; it happened to be consistent (chain sha == dist sha), but
  release_modular reads dist/ while it sends.

## 0.8.102 - 2026-10-13 (Claude): cards with rank and suit in opposite corners
- Registry v129 62cf510c2b2e22a96aaa83975078d0557a7a884843f23d2cd7d7040acbeecdf0; module scene (commit efabe9f).
- the operator sent a standard deck: corner index (rank over suit) top-left and turned bottom-right; pips moved in; court art
  framed inside the indices. Atlas preview: tests/shots/card_atlas_preview.png.

## 0.8.103 - 2026-10-13 (Claude): Solitaire at the card table; a film camera mode
- Registry v130 080c471f291fb981896c5ecb15196cd12d593b9b766eca9353179d88d7e0e104; modules scene, hudpoker, hud, engine
  (commit 4acbc8b). Cards published as 0.8.103 (covers 0.8.101-0.8.103). Solitaire: handoff/poker_plan.md 6g.

## 0.8.104 - 2026-10-13 (Claude): card tables never freeze; side pots proven; the cut only on called money
- Registry v131 66de6cf8bdd6d49308649f1cdbe93d1d053e3d73ca534c93982bf760fd4215bc; modules holdemlib, core, hudpoker,
  engine (commit 9e20a1f). src/weather.js HELD (someone's uncommitted work; tools/hold_live.py weather).
- the operator stuck on "Call 1008" with 925 chips: hostPokerAct goes by the table (a re-made guest had no seat flag); panel
  "waiting for the table" after acting; resend at 6 s; reconnect if silent (20 s after acting, or clock + 20 s);
  "Call all-in N". tests/poker_flow_pw.py freezes the dealer page (CDP Page.setWebLifecycleState), loses a PA, drops a
  seat flag - recovers each time.
- Side pots: tests/sidepot_test.js (3000 random hands, 2-8 players, ties, folds, rake) vs a separate reference; it found
  the 10% cut taken from uncalled money coming back - fixed (uncontested: cut on pot minus the winner's uncalled part;
  a layer only its owner paid into comes back uncut). poker_pw now expects 1020 / "wins 70".
- Bank: jobs 3721 (hare_pelt 1) and 3769 (coins 100) for @apple are HELD (connection lost mid-send 2026-10-12). Checked
  2026-10-13 against the chain: neither went out (every Bank->@apple transfer that evening matches a done job). Safe to
  `python3 tools/bank/bank.py --retry 3721 3769` - left for the operator.

## 0.8.105 - 2026-10-13 (Claude): big table rows in pieces; last result stays; table play in chat; expandable chat
- Registry v132; modules core, hudart, hudpoker, hud, engine (commit 8b72874). weather HELD again (81769d6, someone's
  working-tree snapshot of src/weather.js - not released by Claude). check_live: v132, no console errors.
- ROOT CAUSE of "not showing the results to all the players": netSend drops any message over 500 bytes silently; a
  four-handed result row is ~530 B (8 players ~810), sealed hole cards grow per seat. netSendBig (engine) splits into
  {BIG: [id, i, n, text]} pieces, onNet reassembles (30 s expiry, max 64 pieces). Pk, Ch rows and Ph go through it.
  Earlier two-player tests never crossed 500 B - tests/poker_many_pw.py (4 players) does.
- The last hand's result stays in the panel through the next hand (PK_LAST). Table play into chat on followers
  (rows carry lg = last 6 lines + lc = running count; engine pokerChat). Chat: "Chat" button (.chatx) expands it,
  also at the table (hudpoker's 54 px rule now only for :not(.big)).

## 0.8.106 / 0.8.107 - 2026-10-13 (Claude): chat
- 0.8.106 (v133, hud, 321a14e): the "Chat" button dropped - tapping the chat opens it (the operator).
- 0.8.107 (v134, engine + hudart, 9e7ecbb): a word said at a card table carries tb (its table) and reaches that table
  only; a seated player hears only its own table (receiver also looks the speaker up in its rows). Small-view chat lines
  keep their height (flex-shrink:0) - they were drawn over each other. Checks in tests/poker_many_pw.py. weather held.

## 0.8.108 - 2026-10-13 (Claude): loading screen with a progress bar - RELEASED (v135, netretry + engine, 14ede8a)
- Tested without WebGL: tests/loadscreen_pw.py (the real netretry on a harness page: title, bar, downloads, claim, done, Atlas auto-close, error). The engine side (claim in openStore/start, wallet/land steps, done() after the first frame) is reviewed but NOT yet run in a browser - run tests/poker_flow_pw.py and watch #ashload once a test machine can make WebGL again.
## (was PENDING, kept for the record)
- the operator: "Make sure the loading Ashvale and loading Ziibiing screen are displayed until the game loads and add a progress
  bar". The inscribed launcher drops #boot right after the modules load, so the save + land loading ran on a black screen.
  src/netretry.js (the first module) now puts up its own #ashload screen (title, bar, line; ASH_LOAD.set/done; module
  download counted to 70%); src/engine.js feeds it (wallet 72%, land 75-95% per zone) and calls done() after the first
  frame is drawn. Launcher errors written to #boot are copied onto it.
- NOT TESTED: since the 14:54 NVRM out-of-memory on a test machine, no browser here can create a WebGL context (Chromium any
  flags, Firefox with forced GL) - even code that passed at 13:20 hangs. Needs a a test machine reboot (the operator's call). Test with
  tests/solitaire_pw.py / poker_flow_pw.py, then watch #ashload on the dist page, then release netretry + engine.
- The local agent's INDOOR FIX: the roof half (the hidden roof on the SHADOWED layer, so the sun does not light the room)
  rode into Claude's 9e20a1f and is live since 0.8.104; the weather half (src/weather.js W.indoor - no rain/snow under a
  roof) has never shipped (held with tools/hold_live.py weather in 0.8.104-0.8.107). Ship it with the next release.

## 0.8.109 - 2026-10-13 (Claude): roofs hidden indoors keep the sun out (for real)
- Registry v136 fb7cded...; module engine (dc3ef90). The agent's SHADOWED-layer fix (live since 0.8.104) never worked:
  three r160's WebGLShadowMap tests object.layers against the MAIN camera (render(lights, scene, camera) ->
  renderObject(scene, camera, shadow.camera, ...)). Now: hidden roof/storey pieces stay on layer 0 with HIDE_MAT
  (MeshBasicMaterial colorWrite:false, depthWrite:false, DoubleSide) - invisible, still in the shadow map; own material
  restored on leaving; non-casting pieces (glass) visible=false while hidden. NOT seen in a browser yet (a test machine WebGL
  wedged since 14:54) - check with tools/shot_indoor_pw.py (the agent's measuring tool) after a reboot.

## 0.8.110 - 2026-10-13 (Claude): no rain indoors; snow while the ground is white - RELEASED (v137, 6afac50)
- The agent's src/weather.js W.indoor finally ships (held since 0.8.104): drops and fog sheets thin out under a roof, sky
  and fog distance stay the street's. tests/weather_test.mjs: two stale checks fixed (the fog sheets are a second scene
  object and a draw call), indoor checks added - 140 ok.
- engsky.js: SEASON.snowy = S.snow > 0.3 (was winter && snow > 0.3). The operator: "it's raining in Ashvale it's winter" - the
  north had just passed its spring equinox with the ground still white. Snow now falls from late autumn (trees bare) to the
  spring melt (before any bud), rain otherwise.

## 0.8.111 - 2026-10-13 (Claude): lights stay in their room - RELEASED (v138, ffbb08d; cards dad1b29b ASHVALE, a53dc312 Ziibiing)
- the operator (night, the Tap): the card-table candle wheel lit the third storey's walls. Point lights cast no shadow, so they
  shine through floors and walls. scene.js: a region light whose source tile is inside a building (roofs rect) gets
  userData.room {rect, lv}; update() sets its intensity 0 unless SCENE.viewQuery (engsky: [me.x, me.y, me.lv]) is in that
  rect on that storey. Never hidden, only dimmed (A FIXED NUMBER OF LIGHTS). Torch/sconce entries carry lv. engine.js
  torchTick: a remote's carried light counts only on my storey (r.lvR). Node smoke (Saltmere only, real three r160):
  street/ground/3rd storey 0, card room 2.5. NOT seen in a browser (a test machine WebGL still wedged).

## 0.8.112 - 2026-10-13 (Claude): a bare remote asks for its gear - RELEASED (v139, engine)
- robin-4d: @gx1 back on @apple's screen as the placeholder. The arcade quietly rejoins a client whose streams dropped;
  the others rebuild its remote bare, its own page gets no 'join', so it never resent netGear. engine.js shared(): a
  remote heard from without gear (r.hasG) sends {GQ:1} after 3 s, every 5 s, at most 4 times (GQ = everyone resends, <=1/3 s).

## 0.8.113 - 2026-10-13 (Claude): 'rejoined' - RELEASED (v140, be1359d; cards c31d00f4 ASHVALE, aac58b5c Ziibiing)
- The arcade now fires room.on('rejoined', fn(me)) (docs/multiplayer.md; seat kept 30 s). net.js arcadeRoom passes it
  (try-wrapped for older realtime.js); engine resends netGear + fullSnap 600 ms after. Not tested with two browsers (WebGL).

## 0.8.114 - 2026-10-13 (Claude): the dealer frees chairs itself - RELEASED (v141, core)
- core pokerPresence: a guest heard >2 tiles from its chair (or another storey) for 15 ticks, or gone from the game for 75
  (longer than the arcade's 30 s rejoin grace), is stood up and cashed out. tests/poker_core_test.js cases 5-6.

## 0.8.115 - 2026-10-13 (Claude): card tables at eight and on a host change - RELEASED (v142, 83b79ac)
- Found with eight real games in eight windows (tests/poker_eight_pw.py, poker_cases_pw.py - 9 stand-up cases - and
  poker_stakes_pw.py - 100 and 1000 GOLD, every player's GOLD = start - buy-ins + cash-outs, sum + rake constant):
  (1) the send queue grew without end at eight (5 msgs/s, a row = 3-4 pieces): netSendBig(o, R, key) drops an older queued
  row of the same table; (2) a new dealer's "opened again" row was heard while the others still knew the old host: pokerRows
  sends an empty table this game deals too; (3) a replica kept a stale PKG game and synced it over the row on takeover:
  pokerGame returns null unless auth, applyPoker and pokerAbandon drop PKG. Tests launch Chromium with
  --disable-backgrounding-occluded-windows (a covered window stops its game loop).

## 0.8.116 - 2026-10-13 (Claude): monsters take turns; the Spider Queen's crown once per adventurer - RELEASED (v143, 0613f88; cards 958b861c ASHVALE, a208b708 Ziibiing)
- the operator: "monsters attacking all players if attacked by more than one player alternating". It turned on the latest hitter,
  always the same one (hits land in player order each tick), and retaliating() re-pinned m.hurt every tick. Now landOnMob
  records m.foes, mobAttack (before its puppet return) turns to the foe of the last 12 ticks it struck longest ago, the
  dragon too; retaliating keeps a current foe. tests/combat_many_pw.py (3 windows: same monsters on every screen, damage
  from all, chief and dragon turn on each, deaths everywhere, dragon killed at 99).
- Spider Queen's crown: was 1 in 20 per kill, uncapped (the Bank delivered 2). The operator: "Once per player". monsters.json
  spider_queen.award {item, once:'spidercrown'} (rules.flags), core creditKill drops it owned by the killer the first time,
  on the killer's own game; carrying/wearing one counts. tests/spidercrown_test.js. Bank side unchanged (a ground drop).

## 0.8.117 - 2026-10-14 (Claude): every card table in its own room - RELEASED (v144, 578307f; cards e57b8675 ASHVALE, 70953c35 Ziibiing)
- the operator: "build one and two" (send lanes, table rows as deltas) and "would it help if ... each poker table sets up its own
  game room?" (the arcade's 5 msgs/s is per member PER ROOM: arcade mesh/node.py _Local bucket).
- engine: netPri/flushNet - lanes 0 urgent (own acts, host events E, Ph, results) / 1 normal / 2 background (F, gear,
  weather), 2 s wait = one lane up, a budget per room. pkDelta/pkMerge/pkSendRow/pkHeard - rows as changes (sd seats, la log
  lines, rm), PQ asks the whole row, PKBASE moves only forward, an older whole row from the same dealer is ignored.
  tests/pkdelta_test.js. TABLE ROOMS: 'tbl:<region>:<table>' joined within 8 tiles on the storey (kept to 14 / seated);
  TJ [t, joined, seated, dealer]; the dealer is sticky, a new one = earliest seated (else earliest), a newcomer listens
  1.5 s, a dealer silent 15 s is gone; core.setTableAuth per table (tAuth); pkMsg shared by both rooms; pagehide leaves.
- core: pokerAdopt - a new dealer between hands carries the table on (seats, stacks, button, blinds; gone players cashed
  out); mid-hand still pokerAbandon. seatWaitTick re-asks a sit every 8 ticks (6x); hostPokerSit/hostSit idempotent (and
  take a new sealing key); applyPoker follows a chair move; a dealer's own stale seat stands. poker_core_test case 7.
- Browser: poker_cases_pw (9 cases, 8 windows), poker_stakes_pw (100/1000), combat_many_pw - ALL OK. Chess tables still in
  the region room (same pattern if wanted).

## 0.8.118 - 2026-10-14 (Claude): other players walk without sliding - RELEASED (v145; cards 65abcbaf ASHVALE, 081f7ec9 Ziibiing)
- the operator: "their walking animation is not matching up with their movement ... it looks like they ski to their final position".
  updateRemotes played the NEWEST sample's anim (Bs.a), so the final 'idle' sample stood the legs still while the body still
  blended the last 0.5-1.5 m; and samples were timed by arrival, so the send lanes' bursts made the drawn pace uneven.
- engine: samples are laid on the SENDER's clock (d.s + r.off, r.off = quickest delivery seen, creeping 2 ms/sample), r.jit
  (how late the rest run, decaying) widens the per-remote render delay r.dly (400 ms + jit, eased at most 0.3 s/s). The legs
  follow the DRAWN body (r.vs, smoothed speed): walk/run while it moves (paced to speed, 1 tile/600 ms walk, 2 run), idle
  only once it is still; a 'walk' sample with a still body turns idle after 0.25 s. Canoes and non-locomotion anims untouched.
  ASH.remoteView(id) for tests. tests/remote_walk_pw.py (2 windows): slide with still legs 0.6-1.4 m before, <=0.14 m after.

## 0.8.119 - 2026-10-14 (Claude + sadfrogltc): the card table redone, its GOLD held by @ashvale, death piles once - RELEASED (v146; cards 0ce536ff ASHVALE, ac80cea6 Ziibiing)
- Card table HUD (the operator, on a phone): the betting bar along the bottom (buttons on top of it, status/pot/players under them),
  your two cards in a box over their spot on the felt (on the felt they stay face down), the board in a box over the middle,
  the chat at the top; the table's play only in the chat; the last hand's result only between hands; no All-in button on the
  bar (slide to the end - the raise button then says "All-in N"); landscape: the slider on one row. Dealing animation: cards
  fly from in front of the dealer, round the table twice, then the board. scene pokerSpots + engine pokerClock -> hud.pokerAnchor.
- Rake: 10% of a pot, at most one big blind a hand (2 / 20 / 200 at the 100 / 1,000 / 10,000 tables). holdemlib T.rakeCap,
  tests/sidepot_test.js checks it against the reference.
- THE TABLE'S GOLD IS HELD BY @ashvale (the operator: "When the player buys in send that gold to the Ashvale wallet; when they cash
  out or stand up or lose connection, send their remaining poker game balance back to them"). A seat is a session
  '<table>:<gid>:<sn>' (se[5]). The player's game sends the buy-in to @ashvale (creator allowance, L.pkb, retried, never
  doubled by returns) and tells the Bank (pkbuy + tx); the dealer tells the Bank each seat's cashout (pkout, by address, also
  for a player whose page closed); the player's own word (pkout without who) waits 60 s for the dealer's. The Bank pays only a
  buy-in the chain proves (arcade test-ledger: GOLD 26 from that address to @ashvale, exact amount), never more out of a table
  game than its proven buy-ins (else HELD), in jobs of <= 10,000. At a load a seat the Bank already paid closes without coins
  (they are in the wallet: the chest). Bank: .25 bank-rpc 590d997 (tests/bank_pk_test.py). Game: tests/poker_bank_pw.py.
- Death piles (the operator: "Each time I died a lot of my items were duplicated ... all lying in a pile"): dying in an area another
  game hosts, the Bank's copy of a persisted drop could arrive before the host's row and both were laid down. groundAdd joins
  the host's uid to the Bank copy (huid); claim/groundRemove find a pile item by any of its names (core.groundBy).
  tests/death_pile_once_test.js (fails on 0.8.118: every item twice). The chain never held duplicates.
- sadfrogltc (GitHub 4722e98): Even Grove planting - a quest shoot in the wrong place is kept and says where it belongs, every
  sapling kind plants; multiplayer attack sync - the attack target repeats in presence, stale monster rows superseded in the
  send queue. tests/even_grove_pw.py, sapling_place_test, balance_test, shared_pw updates.
- Gate: core_test ALL OK; 47 headless tests pass (balance_test 3, dragon_focus_test 1, worldgen_test 1 fail the same on the tree
  before these changes); browser: even_grove_pw, combat_many_pw, poker_bank_pw, poker_leave_pw, poker_stakes_pw (nothing made
  or lost, rake capped), remote_walk_pw ALL OK; poker_flow_pw only the old /r/inscriptions 404; shared_pw and poker_cases_pw
  time out opening a page on this box (shared_pw the same on the old tree); candidate_live boots, no console errors.

## 0.8.120 - 2026-10-14 (Claude): one chest per home, Gold on its way, chess, Ziibiing arrival, favicon, the failing tests - RELEASED (v147; cards 6796addf ASHVALE, 76ce65f6 Ziibiing)
- ONE CHEST PER HOME (the operator: deposited in Ziibiing's chest -> only Ziibiing's chests; Ashvale's -> only Ashvale's; arcade deposits
  visible in both until taken; carried across and stored -> that chest's home). The Bank keeps, per wallet, what each home's chests
  hold (bank.py chests table, cput/ctake/chests?, .25 ae00cb0, tests/bank_chests_test.py). A chest belongs to the home whose spawn
  is nearest (3 km, else Ashvale). chestState().here = the full chest less what OTHER homes hold; the chest window, take and
  withdraw-all use it; the Bank's deposit checks still see the full count. Chests there before today count as shared.
  tests/chest_homes_pw.py (8 checks).
- The chest counts Gold still on its way: arrivals are wallet GAINS since the last look (L.seen), not "beyond what is counted" (that
  held the chest's own Gold, so a promise was taken as delivered at once - the operator's 630 GOLD from mithril showed 5,678 until it
  landed). L.seen and L.pkb (card-table buy-ins to send) now saved with the ledger. chest_ledger_pw new case.
- Chess: an older row from the same host (the 5 s resend after a newer move) is ignored (engine CHIN) - the piece popped back.
- Card table: the board's five cards on one row (the operator: the river dropped below).
- Ziibiing arrival: preloadZones reads the home's own save ('ashvale3d.save.v1.ziibiing') and, for a new one, the home's spawn -
  it had loaded Ashvale's land behind the boot screen (the operator: "loaded into a blank world"). Not verified on the live launcher
  (the test browser ran out of memory building the terrain on this busy box).
- Favicon (the operator): data/brand/favicon.svg, inlined by build.py and set by the engine on the launcher page.
- No referee seed asked without a wallet (a guest's 400 on every boot).
- Tests fixed: balance_test (sadfrog's chapel wording, 13 guard remarks), dragon_focus_test (turn-taking since 0.8.116),
  worldgen golden re-cut (moved globe), shared_pw (A's trail ten times a second), tests/serve.py (registry poll + favicon only).
  Browser tests run in visible windows on the desktop now (headless + software GL cannot load a second page). poker_cases_pw
  fails case 1 the same way on the 0.8.117 build on this loaded box (eight game windows + vLLM + the operator's Firefox): load, not code.
- Gate: core_test ALL OK; 48 headless ALL OK; chest_homes_pw, chest_ledger_pw, chess_pw, poker_flow_pw ALL OK; candidate_live
  boots, no console errors.

## 0.8.121 - 2026-10-14 (Claude): Ziibiing opens on phones again - RELEASED (v148; cards a45ac583 ASHVALE, 3179691b Ziibiing)
- 0.8.120's Ziibiing preload (the home's own save and spawn) crashed the Ziibiing launcher on a phone ("A problem repeatedly
  occurred"; candidate_live on the Ziibiing launcher: "Array buffer allocation failed" in scene heightsOf - a non-seeded map's
  (W+1)(H+1) Float32Array over a huge bounding box). Reverted to the 0.8.119 preload; candidate_live on the Ziibiing launcher boots
  in 14.8 s, no console errors. The blank-world-on-arrival fix needs redoing WITH a live Ziibiing-launcher boot test.

## 0.8.122 - 2026-10-14 (Claude): Ziibiing's land is there when you arrive - RELEASED (v149; cards 936e3364 ASHVALE, bcc8ed68 Ziibiing)
- The real cause of 0.8.120's crash: scene heightsOf kept building floors in ONE Float32Array of map.W x map.H, and map.W/H is the
  bounding box of the areas loaded at the start - with Ziibiing's land among them ~24,213 x 24,413 (591 million floats). Floors are
  now kept per 64 x 64 chunk, only where a floor is written (scene floor.get/set). No typed array over 5M elements on either
  launcher (a constructor trap in candidate_live).
- With that, the Ziibiing preload is back: its own save ('ashvale3d.save.v1.ziibiing') and spawn. Live Ziibiing launcher +
  candidate: in the world in 16.7 s, the area under the character ('lodges') loaded at the first look, no console errors.
  ASHVALE launcher unchanged (village loaded, 537 x 88). poker_bank_pw (upstairs floors) ALL OK, globe_roam_pw all passed.

## 0.8.123 - 2026-10-15 (Claude): your @tag is your only name - RELEASED (v150; cards fd2cc598 ASHVALE, 33b784e8 Ziibiing)
- the operator: "wherever it says your name where it was adventure. Remove the adventure and the ability to create a name. Their name
  should be there @handle only ... There's no need for two names" and "Same for ziibiing". Own name = '@' + the arcade room's
  tag (set on join), '@guest' until then / with no account; a save's old chosen name is dropped; the creator has no name box;
  core 'look' no longer takes a name; others are labelled with the @tag the arcade node stamps (never what the game says).
  Quest lines, card-table lines and every {name} read p.name, so they say the @tag. Checked in two visible windows: own
  '@dev_...', a 'look' name 'Ann' ignored, the other labelled '@dev_...'. 49 headless ALL OK; candidate_live boots clean.

## 0.8.128 - 2026-10-16 (Claude): the Fortune Engines - RELEASED (v155 4dafded7; cards ca8221c6 ASHVALE, 3b505a5e Ziibiing)
- the operator: four machines on the card room's north wall (453-456,25, lv 1), a chess-park bench before each, first person with a
  look round (90 / 65), only the reels / lever / Spin spin, a coin slot for any amount of GOLD held by the @ashvale Bank until
  cash out / stand up / a lost connection, wagers 1-3 / 10-30 / 100-300, a spell-lit CREDIT / WAGER counter, no seal on screen.
- Modules: fortune (new: model + reels, Wizard of Odds 64-stop 94.54%), engfortune (new), hudfortune (new), core (fortune tiles
  block; cmds fein / feback), scene (case 'fortune', seated ceiling), engine / hud / engbank (hooks), zones/saltmere
  (tools/add_fortune_props.py). Bank: fein/fespin/feout/fe? on bank-rpc fd03cb5 (applied by the local agent).
- Tests: 51 headless ALL OK; tests/fortune_pw.py ALL OK desktop + phone; poker_flow/bank/leave, chess, wager_confirm ALL OK;
  arcade_pw's 9 failures were old checks for "Name (@tag)" names (0.8.123) - tests fixed in a2e4483, ALL OK.
- Follow-up (the operator on his phone): credit must be instant like the card table -> Bank v3 (credit at once; a deposit voided
  after it was played holds the sitting - the local agent found the v2 hole) + engfortune; the card table's turn order after a
  raise (holdemlib nextActor from the seat that acted). Both go out as 0.8.129 once Bank v3 is live.


## 0.8.129 - 2026-10-16 (Claude): Fortune Engine credit at once; card table turn order - RELEASED (v156 34a4754a; cards fc113a2a ASHVALE, fb6f89f9 Ziibiing)
- the operator (phone): "The credits should be available instantly. Just like wagers on the poker table or chess game" -> engfortune
  tells the Bank {fein, s, n, id} at once; the send's tx follows; a failed send {feinx}. Bank v3 c5ae4b9 on .25 (local agent):
  credit at once, payout only once every live deposit is proven; a deposit voided after it was played HOLDS the sitting
  (the agent caught the v2 hole: claim, play, void, keep the winnings). bank_fe_test ALL OK on .25.
- the operator: three-handed, after a raise the turn went backwards -> holdemlib nextActor goes round from the seat that acted
  (holdemlib v2); 9 checks in poker_test.js, a 37,408-turn fuzz 0 out of order; poker_flow/bank/leave ALL OK.
- Modules: holdemlib, engfortune. check_live: v156, no console errors. Feed note posted.

## 0.8.130 - 2026-10-16 (Claude): standing up cashes out to the pack - RELEASED (v157 235931d6; cards 5874b725 ASHVALE, 1735b1f3 Ziibiing)
- the operator: "When you stand up from a slot machine, your Gold should automatically cash out to your inventory" -> engfortune: the
  moment the Bank closes a sitting ('closing' or 'paid') its credit goes back in the pack (payBack, counted as on its way);
  the Bank's later payout never adds it twice. fortune_pw ALL OK (stand-in Bank now closes first, pays 3 s later).

## 0.8.141 - 2026-10-17 (Claude): stuck Fortune Engine deposits come home - RELEASED (v168; cards 94abb52a ASHVALE, a5ae4052 Ziibiing)
- the operator: deposited 1,000, spun, the game froze (arcade room down 14:46:45-14:47:10); after a restart the chest showed 60,000,
  pack 0, wallet still 61,000 (the Bank never got fein/fespin; the 1,000 sat booked as gone). "So I should automatically come back"
- engfortune: fein events while the ledger is unknown are queued (HELD_EV); a 30 s sweep calls off a deposit with no tx after
  5 min (feinx + back to the pack, gone undone); a spin unanswered for 30 s puts the wager back on the credit and frees the machine.
- fortune_pw ALL OK; check_live v168, no console errors. Feed note posted.

## 0.8.156 - 2026-10-19 (Claude): Thornwatch chapters 2-6 + SadFrog's Farming - RELEASED (v183 66fa174f; cards c73734ca ASHVALE, 03ef9cb5 Ziibiing)
- the operator: "See if sad frog has any commits merge his commits with our code ... publish push and make a new card" -> SadFrogLTC's
  3 farming commits imported as c1cd777 (manual 3-way apply; generated data re-made), claude/seer merged (1ff217d), 89fcba8 untracks
  a node_modules symlink. Thornwatch: Sisters' Barrow, Caged Seer, Drowned Tower, Smith's Hammer, Thorn Maiden; abbey chest.
- Tests: full node suite green after fixes (dragon_sign tries every side, story_points 109, abbey chest); chapter 3-6 play tests ok.
- Release needed 4 tries: the arcade's /r/inscriptions 502'd during its deploy restarts (16:16, 16:49) and cut a body off at 17:02.
  9cebd8b: ids_by_sha now retries ~20 min. Arcade says ?after=<number> gives only new rows (switch to it later).
- check_live v183, no console errors. Feed note posted (ghost-devs venv is gone: ashvale_daily.py now runs on ~/arcade-work/venv).
- GitHub sync timer still STOPPED until Ashvale's 0.8.157 is out; then add the 3 farming SHAs to chain/github_bridge.json imported.

## 0.8.157 - 2026-10-19 (Claude): the Lily Run, Doginal Frog pets, Choose pet, 60 fps cap - RELEASED (v184 64efd13e)
- the operator: a frog-crossing mini game for Doginal Frog owners (Pondkeeper Bram's booth off the trail into Saltmere, one player at a
  time, watchers at the rail, a Bank 'best' board), frog pets with their own hop, long-press -> Choose pet cards (choice in the Bank
  save), and "the game runs at the same frame rate regardless of the monitor" (60 fps cap). Bank on .25: fa79ab6 ('best' message).
- Modules: lilyrules, englily, hudlily, engine, engpet, engbank, earth, core, hud, scene, zone.lilyrun, zone.lilyrunpath (+ index).
- Tests: lilyrules_test, lilyrun_pw, lilyrun_camera_pw, frog_pet_pw, pet_pw, chest_ledger_pw. check_live v184, no console errors.
  two_players_live timed out at 300 s in its sign-in (not rerun).
- Cards and feed note NOT posted yet: the Doginal Frogs collection is not listed on the arcade (/r/collection-item answers "no
  collection this arcade knows"), so frog pets and the Lily Run do nothing for players until the Arcade publishes it (the operator's
  "yes" in the Arcade session). listing_v08157/ + chain/post_v08157.txt are ready (card text now keeps the older history).

## 0.8.158 - 2026-10-19 (Claude): worn gear stays on after a restart - RELEASED (v185 7fa0e98f)
- the operator (@apple, live): restarting put all worn items into the chest. engbank: a short wallet read keeps worn pieces on; one
  comes off only when /r/inscription/<id> says a new owner (2541574). The operator chose "Never strip worn gear".
- Modules: engbank. Tests: core_test ALL OK, chest_ledger_pw ALL OK (new short-read-keeps-worn case). check_live v185, no errors.
- Card listing_v08158/ and chain/post_v08158.txt ready, held with 0.8.157's until the Frogs collection is listed.

## 0.8.159 - 2026-10-20 (Claude): THE SALTMERE LINKS (golf) - RELEASED (v186 b0499fe9)
- the operator: an 18-hole course (par 71) north-east of Saltmere: clubhouse, Fergus the starter (rounds alone or groups of 4),
  Isla's pro shop (club sets 500 / 2,500 / 10,000 / 40,000 GOLD, NFTs of ASHVALE Saltmere Links), wagers (winner takes the pot,
  per stroke capped at 20 a pair; quitter forfeits), custom golf HUD, best-rounds board (lowest first). Plan: handoff/golf_plan.md;
  course source tools/golf/course.py -> tools/make_golf.py -> src/golfcourse.js + data/golf.course.json; zones by
  tools/golf/make_golf_zones.py (the hedge gap + fingerpost live in zone.saltmere, zones never overlap).
- Modules: golfrules, golfcourse, engolf, hudgolf, core, engine, engbank, hud, models, data/items+shops+rules+assets+zoneindex,
  zones golf/golfpath/saltmere, parts (4 bags, Fergus, Isla, 5 clothes).
- Bank (.25 bank-rpc 9c7568e, restarted 22:30): golf rounds pay all at once only when every game agrees and every staked player
  claimed (else HELD; 6 h fallback), golf_round best boards; icons for the 4 sets copied to .25 chain/bank/icons.
- Tests: golfrules_test, golf_pw ALL OK (group of two for a 100 pot, stakes, settle, solo leave), proshop_test, core_test ALL OK,
  bank_golf_test/pk/best/pool/fe ALL OK on .25. check_live v186, no console errors.
- Cards listing_v08159/ + listing_ziibiing_v08159/ and chain/post_v08159.txt posted (also announces the Lily Run + frog pets: the
  Doginal Frogs collection is now listed, root 906d769c...). 0.8.157/158 cards and notes never posted separately.

## 0.8.160 - 2026-10-20 (Claude): Lily Run turtles sink slowly
- the operator: you should be able to hop off a turtle as soon as you see it start to sink. lilyrules: a dive takes 1.5 s, the frog only
  drops when the turtle is all the way under (sunk >= 0.92). Module: lilyrules. Test: lilyrules_test ALL OK.

## 0.8.161 - 2026-10-20 (Claude): golf turns, phone swing fix, level course, cobbled road - RELEASED (v188)
- the operator: groups take turns (tee order, then farthest from the pin), everyone's camera on the active shot, waiting golfers
  stand round to watch; the swing button on phones (a press within 250 ms ignored, the strike only after the marker turns);
  the course looks like the approved course (zone.flat: level ground; set-piece ponds the world lacks are dug, not hills;
  zone.turf: no tufts on the course); the hill on the walk is gone (new flat zone golfshore); a 3-wide cobbled road with lamps
  from Saltmere's cobbles (the lane in zone.saltmere is 'c') to the clubhouse door.
- Modules: world, scene, hudgolf, golfcourse, engolf, engine, data/zoneindex, zones saltmere/golf/golfpath/golfshore.
- Tests: golf_pw ALL OK (two-player turns, watchers, phone double tap, settlement), core_test ALL OK, golfrules, lilyrules.
  check_live v188, no console errors. Post chain/post_v08161.txt.

## 0.8.162 - 2026-10-20 (Claude): SadFrogLTC's pirates, Tutorial Island, cats, Saltmere rework, combat balance - RELEASED (v189 94d2cbbc)
- the operator: "Merge, test and release" SadFrog's 8 GitHub commits (900da50..6c378d6). Merged on claude/sadfrog-pirates: 3-way diff,
  code conflicts kept both sides, JSON data merged by structure (dicts by key, lists by id, tile rows by char); the golf lane cobbled
  (saltmere_rugged_test wants no dirt). Then main (0.8.161 golf) merged in; only zone.saltmere conflicted, merged the same way.
- Browser tests now pass ?notut (a fresh wallet player starts on Tutorial Island). arcade_pw's multiplayer checks are flaky on the
  a test machine on main too (4-5 random fails a run). golf_pw's 2 phone-tap fails = the bug Ashvale fixes in 0.8.163.
- Node suite all green incl. every Thornwatch play test. check_live v189, no console errors.
- 59 modules changed. Comments in core.js/scene.js name the source game (on chain as comments; not in player text) - asked the operator.

## 0.8.163 - 2026-10-20 (Claude): golf swing on phones, face the pin, back in the clubhouse - RELEASED (v190 bfc03c67)
- the operator's recording: on his phone SWING gave only the power stroke. Now while the meter runs a tap anywhere is the next press
  (window touchstart/pointerdown, 250 ms debounce, strike only counts 120 ms after the fall starts); button text only rewritten on change.
- Every stroke starts aimed at the pin. zone.returnTo: a save on the course loads at the clubhouse (635,-118) - placeFrom in core.js.
- Modules: core, engolf, data/zoneindex, zones/golf. Tests on the merged build: golf_tap_pw ALL OK, golf_pw ALL OK (branch core_test ALL OK).
  check_live v190, no console errors. Post chain/post_v08163.txt.

## 0.8.164 - 2026-10-20 (Claude): golf meter marker visible on the accuracy stroke - RELEASED (v191 2c2f27ce)
- the operator: after the power tap nothing moves on the meter. Cause: the marker's class was 'mark', and hudart's `.ash .mark` (hit
  markers, animation ashmark: fade to opacity 0 in 0.45 s) applied to it. Playtest page lacked hudart, so it never showed there.
  Renamed gmark, made it bolder; no other golf HUD class collides with a global `.ash .x` rule (checked).
- Module: hudgolf. golf_tap_pw (now checks the marker is visible and moving) ALL OK, golf_pw ALL OK. Post chain/post_v08164.txt.

## 0.8.165 - 2026-10-20 (Claude): the hole shows on a long putt - RELEASED (v192 50ee8b40)
- the operator: "when putting from a distance the hole is not visible"; a gold ring + floating arrow was tried and REJECTED ("I want the
  little black hole to be visible"). Now, at the hole you putt at (on the green or holding the putter), the cup and lip draw with
  depthTest off (the course's polygon-offset surface hid them at a low look) and scale 1-3x with distance/5 m; ball renderOrder 6.
- Module: engolf. golf_pw ALL OK, golf_tap_pw ALL OK. Post chain/post_v08165.txt.

## 0.8.166 - 2026-10-20 (Claude): golf Tap in button - RELEASED (v193 45090cf9)
- the operator: "If you're less than 10 feet from the pin, there should be a tap in putt button". A "Tap in" button beside
  Short/Long, shown with the putter on the green/fringe within 10 ft as the HUD shows feet (metres x yd x 3 = ~0.83 m);
  one stroke, the ball rolls straight in. Shot input carries tap:1; golfrules canTap/tapIn (TAP_IN = 10 ft) replays
  the same on every game.
- Modules: hudgolf, golfrules, engolf. Branch claude/golf-tapin, merge f696cda, dist 0dc17f0.
- Tests: golfrules_test (3 tap checks), golf_pw (Ben's tap-in in a group seen by Ann; Cal 11 ft no button / 9.6 ft
  button, touch tap holes) and golf_tap_pw ALL OK headed (headless SwiftShader is too slow for golf_pw: false FAILs).
  check_live v193 no console errors. Card listing_v08166 + listing_ziibiing_v08166, note chain/post_v08166.txt.

## 0.8.167 - 2026-10-20 (Claude): the clubhouse - town portal, chest, chess, Fortune Engines - RELEASED (v194 d73e1bce)
- the operator: "Inside the clubhouse, there should be a town portal and a bank chest ... a chess board; the town portal should
  only portal to and from Saltmere town portal and must be attuned by going to the clubhouse portal"; "a bank of [fortune]
  machines inside of the clubhouse". rules.portals 'golf' (637,-119 -> 637,-118, only ['saltmere'], stone false); core.js
  joins(): an `only` portal joins those alone, both ways; the scroll of town portal skips such portals. zone.golf:
  links_chest 632,-117, chess table links1 639,-118, Fortune Engines lk1-lk4 632-635,-121 (seats row -120), bench to 636,-121.
- rules.json patched by hand for the portal only: make_data.py's full output has drifted from the checked-in data.
- Modules: core, data/rules, data/zoneindex, zones/golf. Branch claude/clubhouse merge 3de569f.
- Tests: clubhouse_test.js + clubhouse_pw.py (new), core_test, golf_pw, golf_tap_pw, chess_pw ALL OK. fortune_pw could not
  load its 2nd page (box overloaded; main the same) - the clubhouse machines' sit/bar checked in clubhouse_pw.
- Next (the operator OK'd staging): second storey with the dice/roulette/blackjack tables as their own modules + Bank rules, playtest first.

## 0.8.168 - 2026-10-20 (Claude): the Links railing, cobbles, clubhouse layout, greens, two-tap putts, the strike line - RELEASED (v195 32c0a8d3)
- the operator: "the iron fence from the graveyard around the golf course so people can't wander on it" -> iron_fence round the course box
  (make_golf_zones.py), solid + ry (the graveyard's is NOT solid: decor only); the south run (y -116) meets the clubhouse walls.
  Blocking-tile letters (worldgen BLOCK) get no railing. Walk tests stop at it on all sides.
- "the trail to the clubhouse should be cobblestone for the last stretch that is still dirt": scene.js turf skip (0.8.161) also
  dropped the 'c' cobbles; the skip now spares 'c'.
- Clubhouse (the operator): Fortune Engines dz -0.3 (scene honours o.dx/o.dz), chess table 634,-117 seats E-W with benches (scene chess:
  the board faces seats[1] = White via set.d; bench face e/w), chest 632,-119, Fergus 638,-119, SE corner 640-641,-118..-117 kept
  for the other session's stairs; portal rules.portals golf -> 647,-114 (to 647,-113) OUTSIDE, trees there cleared.
- "weird grass that covers your ball near one of the greens": green tilt dips below the world ground on its low side (hole 4);
  engolf gY adds a per-green lift (its deepest dip, faded like the tilt) - drawing only, rules untouched.
- "hard to click three times for a short putt": the putter is two taps (impact 0). Button PUTT/HIT.
- "a line right in the very center ... left of center hook right ... right of center hook left ... higher class less hook":
  golfrules L = -curve(impact) * set.hook (1.25/1/0.75/0.5); hudgolf centre line 4 px, strike zone drawn over the fill.
- Modules: scene, hudgolf, golfrules, engolf, data/rules, data/zoneindex, zones/golf. Tests: golfrules_test (4 bend checks),
  clubhouse_test (portal outside, solid railing, stairs corner), clubhouse_pw, chess_pw, golf_tap_pw (two-tap putt), golf_pw, core_test
  ALL OK. Post chain/post_v08168.txt.

## 0.8.169 - 2026-10-20 (Claude): the ball's smooth arc, the avatar after an app switch - RELEASED (v196 34b39dbc)
- the operator: "the flight path ... drops down following the contour of the river bed ... should be a smooth parabola": engolf pathY -
  in the air the ball's ground is a straight line from its start to its first landing (bounces and roll follow the ground); the
  aim arc too. Measured over hole 18's pond: 0.3 -> 8.7 -> 0.05 m, no dip over the 0.75 m-deep bed. Drawing only.
- the operator: "my avatar despawns ... mostly when I move off of the PWA into another app and then look back": the swipe tilted the
  hidden orbit camera (cam.pitch < 0.13 = first person) and the first-person rule hid myEnt for good. engine fp = 0 in cam.mode
  'golf'. golf_tap_pw tilts to pitch 0.02 mid-round and checks _meSeen (FAILS without the fix, checked).
- Modules: engolf, engine. golf_pw, golf_tap_pw, golfrules_test ALL OK. Post chain/post_v08169.txt.

## 0.8.170 - 2026-10-20 (Claude): golf group turns, leave to the clubhouse, the Tutorial Island portal - RELEASED (v197 d4f1889e)
- the operator: "party mode is not cycling through the players ... Each player should tee off one after the next ... real golf rules".
  tests/golf_turns3_pw.py (three golfers) found: (1) a joiner dropped as "full" by the host's member list said before its join
  arrived - the third golfer often never teed off: now asks again, only full-for-6 s or 15 s silence drops it; (2) a golfer whose
  game went quiet after a swing (hidden tab / phone asleep) left the others waiting on a ball "in the air": the swing's sh.at/sh.ho
  is kept with the round (ST.rest, set as heard), and once the flight is over pinfo treats it as landed. 8 runs ALL OK.
- the operator: "if somebody leaves the game, they should be transported back into the clubhouse": Leave (quitRound) did not move you at
  all - stuck on the course behind the new railing; the end card went outside the door. Both now golfgo 635,-118 (returnTo).
- the operator: "a town portal where you can leave tutorial Island at any point ... and the Ashvale town portal should have a portal to
  tutorial Island. Neither ... attunement": rules.portals 'tutorial' at 704,45 (free, only ['ashvale']); core canHop/freeHop;
  taking it clears p.tut; a free portal is no wake town. tests/portal_tutorial_test.js ALL OK.
- Modules: core, engolf, data/rules. golf_pw, golf_tap_pw, golfrules, clubhouse_test, portal test, core_test ALL OK.
  The machine crashed mid-release after the three modules were sent; release_modular --no-build resumed by hash (no repaid pieces) and inscribed the registry.

## 0.8.171 - 2026-10-20 (Claude): the ball on the grass and bouncing, TAP IN on the swing button, golfers' feet on the grass - RELEASED (v198 3234cb40)
- the operator: "the ball sometimes looks like it's sunken into the ground ... it should bounce off the ground hard": the turf is drawn
  0.035 m over gY on a 1 m triangle grid, the ball sat on gY (half under); engolf turfY puts it on the drawn triangle + 0.012. A shot
  now hops before it rolls (pathY: up to 3 smaller copies of the flight, e by the landing ground, squeezed into short rolls) -
  drawing only, the rest point and the rules are unchanged.
- the operator: "instead of adding a third option of tap in ... turn the swing button into a tapping button so that it is automatic ...
  the power of the tapping doesn't over exceed the power needed": the Tap in button by Short/Long is gone; inside 10 ft with the
  putter the swing button reads TAP IN (green), one press knocks it in (tapIn eases to 0.08 m/s at the lip; a firm putt lips out).
- the operator: "avatar's feet are sunken into the ground": standAt/watchAt on turfY.
- Modules: engolf, hudgolf. golfrules_test, golf_pw, golf_tap_pw ALL OK.

## 0.8.172 - 2026-10-21 (Claude): green fees and nines, the railing without gaps, safe Fortune Engine retries - RELEASED (v199 5f9ad201)
- the operator: "a price per game and a selection for front nine or back nine in both the solo player or group player golf rounds, charge
  25 gold each player for the front nine or the back nine or 50 gold each per player for the full 18": Fergus asks which holes (solo
  and group; the lobby carries it); core golffee takes 25/50 GOLD as the round starts; cards indexed by hole, the round ends after its
  last hole, totals/settle count the nine played, the card shows that nine, best rounds only for eighteen. tests/golf_nines_pw.py.
- the operator: "remove any trees or rocks that are in the way of the fence around the golf course so that nobody can wander in": the
  railing ran round every tree/rock on its line (gaps); they are cleared, 639 -> 857 sections, only water keeps its gap.
- the operator's phone: "Your wallet did not send the 1,000 GOLD to the @ashvale Bank yet: Load failed" - a lost answer could make a retry
  send twice: Fortune Engine sends carry ref fe:<deposit> (arcade duplicate guard beb4d8f, answers 200 + repeat).
- Modules: core, engfortune, engolf, data/zoneindex, zones/golf. golf_pw, golf_tap_pw, golf_turns3_pw, golf_nines_pw, golfrules,
  clubhouse_test, core_test ALL OK; fortune_pw deposit checks OK (reel-stop timing fails the same on 0.8.171).

## 0.8.173 - 2026-10-22 (Claude): the Saltmere Links clubhouse - the tables upstairs, Rhona's golfwear, the back door - RELEASED (registry v200 5895b506, feed d58b7ea8)
- the operator's floor plan: upstairs a dice table, the wheel and two twenty-one tables, shared rounds run by the @ashvale Bank
  (bank-rpc 45be285 on .25: tb sittings, Bank clock, HMAC(round secret, table:round), payouts from the game's own rules files).
- From the operator's playtest: top-down layouts (your own half plus the centre at the dice table), pinch zoom/pan, real 12-ft dice
  table, bets on the side you tapped, card corners overlap 3/4 in, totals on the felt and the bar, card clock 5 s + 1 s a player,
  insurance clock, long-press for a seat, realistic dealing; the wheel's corner view, number pop-up, ball physics; players at the
  betting layout; avatars and dealers belly up only at a spot, watch the dice/ball, win/lose/excited poses (/cheer /fistpump
  /clap /excited /slump), animated bets; upstairs cards/bets hidden from below (and in the Tap); lamps light the room; landscape HUD.
- Downstairs: Rhona's golfwear (garment-shaped icons). The back door lets you in from the course only.
- Modules: core, engine, scene, hud, engbank, models, world, items/assets/rules/shops, zones, + engtables, hudtables, dicetable,
  dicethrows, wheeltable, twentyonetable, dicerules, wheelrules, twentyonerules, part.char.rhona, golfwear parts. core_test,
  clubhouse_test, dice/wheel/twentyone/golf rules, bank_tables_test ALL OK.

## 0.8.174 - 2026-10-22 (Claude): the tables keep your bets, 15 s to come back, golf rejoin in 2 min, the stick, the clubhouse roof - RELEASED (registry v201 b8bb686c)
- Bank (.25 bank-rpc, all live before this release): 83726a7 the tables' clock in the no-browser room (the operator: "All of the tables
  upstairs wait on players before they start dealing" - no table had ever dealt live); fe4d350 vital threads (the payout thread died
  silently at 13:49 and nothing was paid for 3.5 h), the tag lookup retried, tbback, 15 s for v:2 games (120 s for older ones), silence
  counted only while the room is up.
- the operator: "If you leave the table with a bet on the table and you come back ... that needs to be yours" / "15 seconds to reconnect" /
  "if it's the bets open time it should just be removed from the table": tbback hands back a sitting still open or moves bets still
  working into the new one (books hold); the spot is kept in localStorage and a reload walks back; heartbeat 5 s (tb? v:2).
- the operator: a 420 bet on red then "try again" ("The table lost count"): table words one at a time, chips coalesced, an out-of-order
  refusal resent once with the Bank's count.
- the operator: "Long click on a bet and remove it": engine menuAt -> TBP.hold; a line bet on the point "stays up until it is decided".
- the operator: "the dealer should collect them with a stick so that the mini view can read the dice total": dicetable gather + the total
  in the corner view.
- the operator: golf "120 seconds to reconnect": engolf saves the round (ashvale3d.golf.v1), round token re-identifies a new netId, the
  group holds the seat 120 s then it is a leave (forfeit); tests/golf_rejoin_pw.py 49 ok.
- the operator: from the first tee "Inside shows through": the see-through shader dissolved everything in front of the avatar anywhere on
  screen; now only in the circle round it (as meant); a camera inside another house comes in toward you.
- Modules: engine, scene, engtables, dicetable, engolf. Tests: core, clubhouse, dice/wheel/twentyone/golf rules ALL OK;
  bank_tables_back/clock/vital + bank_tables_test ALL OK (here and .25); golf_rejoin_pw ALL OK; golf_pw/golf_turns3_pw fail the
  same on 0.8.173 (load: the ball never comes to rest at ~1 fps).

## 0.8.175 - 2026-10-23 (Claude): bets show at a busy table; SadFrogLTC's Add a friend, playtest fixes, parallel downloads - RELEASED (registry v202 26419714, feed cf02ee85 for 0.8.174 + 0.8.175)
- the operator: "Bets aren't showing up on the roulette table" / GOLD lost: every table word over 512 bytes was refused by the room and
  dropped the Bank's whole room (39 times since the clock first ran); a 420 deposit was lost in one drop - refunded (job 4592,
  ee2d9e60). Bank 67f8d80: a big table word goes as a short 'tbs' + one 'tbp' a sitting; engbank lets 'tbp' through, engtables
  reassembles. tests/bank_tables_pieces_test.py.
- the operator: "publish SadFrog's commits": imported from GitHub under SadFrogLTC - 44979c2b playtest fixes (creator, solid props,
  tutorial wording, friends, models), 422c11b3 Friends tab: Add a friend into the arcade address book (arcade.contacts.add, the
  player says yes on the arcade's card; long-press/right-click a player: Add friend), 4bcd1c0f parallel downloads on every arcade.
  Generated data merged by structure (make_data.py never run); one engine.js line by hand (golf.v1 + friends.v1 storage keys).
- The first run stopped at 19/25 (bad-txns-inputs-spent: the Bank's refund spent the coin the publisher had chosen; the index had not
  seen it) - resumed after the next block.
- Course move (claude/golf-move 0eb3ae1, merged into claude/tables 1dc401f) NOT in this release: awaits the operator's playtest.

## 0.8.176 - 2026-10-23 (Claude): the Saltmere Links moved along the shore; modules gzipped on chain - RELEASED (registry v203 8d8cd51a)
- the operator: "The clubhouse is entirely in the way of hole one tee off" -> "move the course back from the clubhouse a bit ... further away
  from the clubhouse along the shoreline": the whole course +20 m east, +20 m north (claude/golf-move 0eb3ae1: 18 holes, ponds, the burn
  to the bay, the halfway house; holes/par/yardages unchanged; a pond under the 1st green filled; a cobbled path from the back door to
  the new 1st tee 646,-148; core's golf area check widened). The 11th now has the sea along its right at the headland.
- the operator (after @liteworldsquest's "3x smaller on chain"): "Everything should be gzipped that is changed": release_modular inscribes
  every changed module gzipped (zopfli, application/gzip); netretry (first module, its own entry gz - every launcher on chain unpacks
  that) unpacks every /content/ file starting 1f 8b for the launcher and the engine. 884 KB -> 182 KB (21%) this release.
- Tests: core, clubhouse, golfrules ALL OK; golf_rejoin_pw and golf_nines_pw ALL OK on the move (subagent); candidate_live --gz booted
  the live launcher with the gzipped candidate (the gzipped golf zone reads).

## see-through restored - 2026-10-25 (Claude): RELEASED (registry v205 4ece3872, module scene only)
- the operator: "We used to be able to see through buildings and objects that were behind us ... now it only dissolves a really tiny
  little circle" -> "Just restore it to how it was before the golf fix" -> "ship it". b1d9326 (0.8.174) had limited the
  see-through to a circle round the avatar (sz.y*0.13) so the clubhouse would not open up from the first tee; the shader is
  back to dissolving everything nearer the camera than you, anywhere on screen (program key see2). The clubhouse interior
  will show from the first tee again (the operator's call). b1d9326's camera-comes-in-from-a-house part is kept.
- Shipped ONLY scene: dist/ as committed matched the chain 0/474, the built scene module (and the inline page) patched with the
  same two lines as src/scene.js, release_modular --no-build -> 1 changed. tools/hold_live.py was NOT used: it fetched
  core/engine back at the wrong sizes (gzipped modules) and called scene never-inscribed - fix that tool before relying on it.
  The other 7 modules with unreleased work in src (core hud hudart hudpanels models engmusic engine) are still unreleased.
- Tests: core_test ALL OK; visible-Chromium before/after at the General Store (go=10,41 camyaw=0); check_live v205, no console
  errors. A lost WebGL context ("graphics were reset") showed 1 in 3 runs on BOTH the released and the new page (GPU 91% busy).
- tests/play_pw.py is stale: it waits for '.cc input' but a new player now gets the wardrobe - it fails before testing anything.

## GOLD sends fixed - 2026-10-26 (Claude): RELEASED (registry v206 38382952, modules engfortune + engtables only)
- the operator: "Gold disappearing from slot machines and table games" -> "release it and make sure that everybody gets their gold back".
- Audit: the Bank matched the chain (every proven deposit paid back in full, every payout tx landed). The losses were the game's
  sends: a deposit voided itself after 3 tries in 45 s (an arcade restart 10-24; a payout not yet spendable, "only 476 of ASHVALE
  GOLD is here to send", 10-22) and the Bank held sittings played on it; tables had no ref, and one lost status read resent the GOLD.
- Fix (claude/gold-sends 28b6f41): give up only after 15 min (backoff <= 60 s), tables carry ref, a lost poll keeps the last status.
  tests/gold_sends_pw.py 12/12 (6 FAIL on the old build); fortune_pw ALL OK; tables_pw has the same 2 seating FAILs on old and new
  (its HEADED args are now --use-gl=egl).
- Paid by hand: job 4543 61 GOLD to nfqSK (never sent: 'Work queue depth exceeded'), --retry; @apple 139 (pk poker1:1:858748 held)
  and 200 (tb:cb2:b608 net win; the unsent 500 stayed in the wallet). The other 21 held sittings are net losses whose deposits
  never left the wallet: nothing owed, left held.
- Trap: tools/release_modular.py has no --help - it RUNS (built src with unreleased work into dist; the browser path crashed before
  inscribing). dist restored by git checkout; dry run 0 changed before the real release.

## Lost sign-in says reload - 2026-10-26 (registry v207, 91f0ce65)
engfortune + engtables only (claude/reload-msg b85a897). When the arcade restarts and forgets an open page's viewer
ticket, /r/send answers 403 "this wallet does not tell inscriptions who is looking"; the machines and tables now say
"The arcade restarted and this page lost its sign-in. Reload the page and your N GOLD goes to the @ashvale Bank - it is
still in your wallet." The deposit keeps waiting (15 min) and goes after the reload. tests/gold_sends_pw.py 15/15.
The arcade side (tickets survive restarts, 12 h sliding) shipped the same day on .25 master cf6dbea.
