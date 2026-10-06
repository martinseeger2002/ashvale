# ASHVALE: fix, test, release (for the local agent)

2026-10-02: "Give the local agent clear instructions on how to continue to build, test and release so that as
it fixes bugs, it can publish them without you." This is the whole loop. Follow it in order, every time.

## What you may publish on your own, and what needs the operator
- **Bug fixes**: you fix, test and release them yourself once every suite is green. No need to ask. Examples: something
  that renders wrong, a broken button, a sync bug, a crash, wrong text.
- **Ask the operator first** (in your chat) before releasing anything that changes how the game plays or looks on purpose:
  new features, balance numbers (damage, XP, prices, drop rates), new items, new areas, removing anything. Show him a
  playtest page (below) and wait for his OK.
- **Never**, without the operator saying so explicitly: inscribe a new launcher, change chain/modules.json by hand, inscribe
  the globe's grid spec, mint parcels, spend or move GOLD or other tokens, or post anything except the release note
  (step 7).

## 1. Understand the bug
- Read the report: the operator's words, `handoff/player_reports.md` (players' bugs, collected daily by @ashvale), or a test
  failure.
- **Reproduce it before fixing it.** Best of all, write the test first: `tests/core_test.js` for rules,
  `tests/play_pw.py` for one player in a browser, `tests/shared_pw.py` for two or more players. Watch the new check
  FAIL on the current code. Example: `return_after_away` in `tests/shared_pw.py` (the operator's frozen-monsters report)
  failed first, then passed after the fix.

## 2. Fix it in the right place
Each module is its own inscription, so keep a fix inside as few modules as possible. Smaller modules are cheaper.

| What | Where (edit this) | Inscribed as |
|---|---|---|
| Rules (combat, skills, items, monsters AI, drops, shared world logic) | `src/core.js` | core (~70 KB, about 10 pieces) |
| The map the rules walk on: chunk store, areas, regions, globe frame | `src/world.js` | world (~11 KB) |
| Gluing, camera, input, network | `src/engine.js` | engine (~75 KB) |
| Interface frame, chat, menus, minimap | `src/hud.js` | hud (~17 KB) |
| Interface styles and icons | `src/hudart.js` | hudart (~19 KB) |
| Side panels (inventory, equipment, skills, combat, quests, settings) | `src/hudpanels.js` | hudpanels (~8 KB) |
| Shop window | `src/hudshop.js` | hudshop (~4 KB) |
| Inventory drag and drop | `src/huddrag.js` | huddrag (~4 KB) |
| Character creator / wardrobe | `src/hudcreator.js` | hudcreator (~7 KB) |
| Characters, gear, animations | `src/models.js` | models |
| World drawing | `src/scene.js` | scene |
| Weather look / fog shape | `src/weather.js` / `src/fog.js` | weather / fog |
| Items, monsters, shops, quests, rules, zones (DATA) | `tools/make_data.py`, then run it | data/* (small JSON) |
| Where ASHVALE sits on the globe (seed, face, origin, area/region grid) | `tools/make_data.py` (globecfg), then run it | globecfg |
| Shapes of characters and gear | `tools/make_parts.py`, then run it | parts/* (tiny JSON each) |

- **Never edit `data/*.json` or `data/parts/*.json` directly**: they are generated. Edit the generator and run
  `python3 tools/make_data.py` / `python3 tools/make_parts.py`.
- In JS, **never put a `// comment` after code on the same line** (`build.py` refuses). Use `/* ... */`.
- Match the style around you: same naming, a short comment saying WHY (with the operator's words and the date when it came
  from him).
- Public text (anything a player can read, item descriptions, posts) never names other games.
- Only items inscribed by @ashvale and tokens issued by @ashvale count in the game.

## 3. Test (all of it, every time)
A local web server must be running in `~/ashvale3d` on port 8731. Check with `ss -ltnp | grep 8731`. If none:
`cd ~/ashvale3d && python3 -m http.server 8731 --bind 127.0.0.1 &`. Note the PID; if you ever stop it, kill that exact
PID (**never `pkill -f`**).

```
cd ~/ashvale3d
node tests/core_test.js                       # rules + deterministic replay      -> ALL OK
node tools/test_models.mjs                    # every model part builds           -> ok N checks ... status tint ok
node tests/globe_test.js                      # the globe grid (must never change) -> ALL OK
python3 build.py --arcade --three-esm         # builds dist/ (what gets inscribed) and playtest/
python3 tests/play_pw.py all                  # one player, desktop + phone, ~20 min -> ALL OK
python3 tests/arcade_pw.py                    # the arcade build (modules by id)    -> ALL OK
python3 tests/shared_pw.py all                # 2-4 players sharing a world, ~25 min -> ALL OK
python3 tools/check_gather_reach_pw.py        # a gather the character cannot walk to says "I can't reach that!" -> OK
```
- Browser tests need `PLAYWRIGHT_BROWSERS_PATH=/home/you/.cache/ms-playwright` if a browser is "not found".
- **Look at the screenshots** in `tests/shots/` that relate to your change. A green test is not enough.
- **Flaky checks:** when the machine is busy (load average 6+, check with `uptime`), the drag-and-drop checks
  in play_pw sometimes fail. Rerun just that part (`python3 tests/play_pw.py v04` or `desktop`). If it passes on a
  rerun it was timing; if it fails twice it's real.
- Do not release with a real failure. Ever.

## 4. (Features only) playtest page for the operator
`python3 build.py` writes `playtest/ashvale3d_playtest.html` (one self-contained file). Tell the operator the path and what
changed; he can open it from his machine. Wait for his OK.

## 5. Release (the modular way)
```
cd ~/ashvale3d
/home/you/cartoon-toolkit/ghost-devs/tools/venv/bin/python tools/release_modular.py --dry          # what will be inscribed
echo "=== vX.Y (what) $(date '+%F %T')" >> chain/release_modular.log
nohup /home/you/cartoon-toolkit/ghost-devs/tools/venv/bin/python tools/release_modular.py >> chain/release_modular.log 2>&1 < /dev/null &
```
- It runs `build.py --arcade` itself, inscribes ONLY the modules whose content changed (as @ashvale), then a new
  REGISTRY (with its JSON beside the file, which is how the launcher finds it). The launcher never changes.
  Everyone who opens ASHVALE gets the new version on their next load, with their progress kept.
- Use `--no-build` only if `src/` has unrelated unfinished work in it and `dist/` is exactly the build you just tested.
- **Shipping only your own modules** (`src/` holds another lane's unplaytested work): `tools/hold_live.py --drop <never-inscribed>`
  rewrites `dist/` so every module except yours matches what is already on chain, then `release_modular.py --no-build`
  inscribes just yours + the new registry. Two things that bite: run it **after** the last `build.py`, because a build
  overwrites what it held - and do not list a module you actually changed, or it silently reverts yours to live bytes.
  Copying the held bytes back into `src/` so the inlined page agrees does not work for `models.js`: the live copy
  predates the `export function createModels` shape `build.py` asserts, so keep `models` held and leave the repo's
  `src/models.js` in place.
- **Watch it:** `grep -v "HTTP Request" chain/release_modular.log | tail`. Normal lines are `sent <module>`, then
  `N/N modules on chain`, then `REGISTRY vN <id>`, then `DONE`. Time: a few minutes per small module; big modules go
  out in pieces (a split transaction, then all pieces a block later).
- **It's resumable.** If it stops (machine restart, a crash), run the same command again. It picks up what's already
  on chain by content hash.
- **If it seems stuck** (no new line for 20+ minutes): check the account's unfinished jobs (signed-in browser as
  @ashvale: `GET https://app.dogecoinarcade.com/account/inscribe/unfinished`; `/r/blockheight` shows the chain is
  moving). The script already gives up stale jobs and retries. If a job is stuck at "N of M pieces", stop the script
  (kill its exact PID and its geckodriver/firefox children) and run it again. The arcade node now waits out its own
  restarts. If it keeps failing, write what you saw in `handoff/arcade_issues.md` and tell the operator.
- **Daily limit:** about 250 KB per account per day. A full core+engine release is ~150 KB; plan big releases.
- Don't run `build.py` while a release is running (it would change the files being sent).

## 6. Check it's really live
```
PLAYWRIGHT_BROWSERS_PATH=/home/you/.cache/ms-playwright python3 tests/live/check_live.py      # registry vN loaded? exit 0
python3 tests/live/two_players_live.py $(python3 -c "import json;print(json.load(open('chain/modules.json'))['launcher'])")   # 2 players see each other
```
If two_players_live shows nobody seeing anybody once, run it again (joining can take a moment); twice = investigate.

## 7. Tell people
1. Update `tools/ashvale_facts.md` (what @ashvale tells players): the current version and what changed, in plain words.
   No unannounced plans (the globe is not public yet).
2. New Games-tab card, so the label matches. Copy the newest `listing_vNN/` folder to a new one, change `version` in
   its `game.json` (keep `play` = the launcher id, keep the cover id), then:
   `/home/you/cartoon-toolkit/ghost-devs/tools/venv/bin/python /home/you/cartoon-toolkit/ghost-devs/tools/list_game.py ashvale /dev/null listing_vNN/game.json`
   The newest card replaces the old one on the Games tab automatically.
3. Release note as @ashvale: write `chain/post_vNN.txt` (paragraphs separated by a blank line, each ≤ 280 characters,
   plain words, what players will notice; no other games named), then
   `/home/you/cartoon-toolkit/ghost-devs/tools/venv/bin/python tools/ashvale_daily.py --post chain/post_vNN.txt`.
   Small fixes can share one note.
4. Write a short entry in `handoff/releases.md`: date, version, modules, registry id, what it fixed, tests run.

## Everyday duties already automated
- @ashvale reads and answers its notifications and messages daily at 18:00 (`ashvale-daily.timer`, script
  `tools/ashvale_daily.py`). It logs player bug reports and wishes to `handoff/player_reports.md`. Read that file,
  fix the bugs, and bring the wishes to the operator.

## Where things are
- `PLAN.md`: every the operator requirement, word for word. Read it before changing behaviour.
- `DESIGN.md`: the contracts (items, trades, escrow, game state, shared world).
- `GLOBE.md`: the round-world plan (phases P0-P4; P0 is done).
- `chain/modules.json`: what's on chain (written ONLY by release_modular.py). `chain/release_modular.log`: release logs.
- Arcade protocol features (trades, escrow, realtime rooms, game state, inscribing) belong to the arcade, not this
  game. If the game needs something there, write it in `handoff/arcade_issues.md` and tell the operator.

## ASHVALE Atlas (the world explorer app)
- Build and test: `python3 tools/globe_roam.py`, `node tests/worldgen_test.js`, `tests/globe_roam_pw.py`, plus
  `node tests/globe_test.js` (`handoff/globe_roam.md` has the details). The playtest page is `playtest/globe_roam.html`.
- Release (only after the operator's OK on the playtest; the Atlas has NOT been released yet):
  `/home/you/cartoon-toolkit/ghost-devs/tools/venv/bin/python tools/release_atlas.py --dry`, then without `--dry`.
  It reuses every module already on chain (the same content as the game's), inscribes only new ones, then an atlas
  registry, and on the first run the Atlas launcher. State lives in `chain/atlas.json`.
- **The Atlas registry is tagged `"ashvale3d":"atlas-registry"`, never `"registry"`.** The game's launcher takes the
  newest @ashvale `{"ashvale3d":"registry"}` and would otherwise load the Atlas instead of the game.
- Worldgen is shared with the game. Changing land numbers changes everyone's land, so bump the worldgen version
  instead of editing v1 once players have built on it.
