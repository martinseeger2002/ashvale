# ASHVALE 3D (for the local agent maintaining this after 2026-10-15)

A RuneScape-style 3D browser RPG. Read **RELEASE.md** first (the fix-test-release loop), **PLAN.md** (what the operator wants, stages, release gate) and **DESIGN.md**
(how it works, module/registry format, upgrade and extend recipes) before changing anything.

## Files
- `src/core.js`: game rules. Deterministic. Change rules only here; run `node tests/core_test.js` after every change.
- `src/engine.js`: rendering, camera, input, sounds. `src/scene.js`: the world's meshes. `src/hud.js`: all UI.
- `src/models.js`: characters, monsters, items, animations, outfits (built in code).
- `src/net.js`: other players (stub until the arcade realtime SDK exists). `src/loader.js`: module loader/registry.
- `tools/make_data.py`: writes `data/*.json` (items, monsters, shops, quests, rules, regions) from ~/ashvale/world.json
  plus the village layout. Edit the generator, not the JSON, then rerun it.
- `build.py`: writes `dist/ashvale3d.html` (full page), `playtest/ashvale3d_playtest.html` (Artifact fragment),
  `dist/modules/*` (one file per module) and `dist/registry.json`. `--three-esm` also writes the tree-shaken three.js ESM bundle.

## Everyday loop
```
python3 tools/make_data.py        # only if data changed
node tests/core_test.js           # rules + deterministic replay
python3 build.py
python3 -m http.server 8731 --bind 127.0.0.1 &   # note the PID; kill it by that PID afterwards
python3 tests/play_pw.py          # scripted desktop + phone session; screenshots in tests/shots/
```
python3 build.py --arcade         # the arcade demo page (three.js from its inscription); test: python3 tests/arcade_pw.py
Look at every screenshot in tests/shots/ (do not trust a green test alone). Headless Firefox crashes on WebGL on this
machine; the tests use Playwright Chromium with SwiftShader.

## Rules that bite
- Never put `// comment` after code on the same line in JS (build.py refuses it). Use `/* */`.
- Kill processes by exact PID, never `pkill -f`.
- Never rename or remove item keys (`sword_t1` = the NFT trait Key), monster keys, skills or quest steps: only add.
- Nothing is inscribed or published until the operator has played the private build on his iPhone and said OK.
- Debug handle in the browser console: `ASH` (`ASH.give('coins', 500)`, `ASH.setLevel('attack', 20)`, `ASH.teleport(x, y)`,
  `ASH.core.S` = the whole game state).

## Tooling notes (2026-10-01)
- Screenshots: run `tools/shot_models_pw.py` directly (its shebang is the pyenv Python, the one that has Playwright;
  `/usr/bin/python3` doesn't). Headless Firefox crashes on WebGL on this box; use Playwright Chromium.
- Node: `src/models.js` is an ES module. Use the nvm Node 22 (`~/.nvm/versions/node/v22.23.2/bin/node`), or Node 18 with
  `--experimental-default-type=module`, for `node tools/test_models.mjs`.

## Releasing (modular)
1. All tests green (core_test, test_models, play_pw all, arcade_pw, shared_pw).
2. `python3 tools/release_modular.py --local && python3 tests/launcher_local_test.py` (boots the launcher from fake ids).
3. `~/cartoon-toolkit/ghost-devs/tools/venv/bin/python tools/release_modular.py` (as @ashvale): only CHANGED modules are
   inscribed, then a new registry. The launcher (chain/modules.json "launcher") never changes after the first release.
4. Live test: `tests/live/two_players_live.py <launcher id>`. The Games card's `play` already points at the launcher, so
   no new card is needed unless the description changes.

## Contributing

This repository is a public copy of the game. Changes pushed here are brought into the game by an hourly sync; plain data changes are released automatically after the tests pass, everything else is reviewed first.
