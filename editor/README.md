# ASHVALE world editor

2026-10-04: "Build me a world editor so that I can go into the Atlas, zoom down on one of the tiles and then
edit that tile. Open it in Saltmere ... move buildings, NPCs, add trees and forests and make trails and all of that."

## Running
- It runs as user services on boxa: `ashvale-editor.service` (editor/server.py on port 8750) and
  `ashvale-editor-tunnel.service` (a reverse SSH tunnel, so on the operator's .25 screen it is `http://127.0.0.1:8750`).
- The link needs the key: `http://127.0.0.1:8750/?k=$(cat ~/ashvale3d/chain/editor/.key)&zone=saltmere`.
- Restart: `systemctl --user restart ashvale-editor ashvale-editor-tunnel`.

## What it does
- **Areas:** the game's set pieces (Saltmere, Ashvale village, Whisperwood), plus new areas made from the Atlas.
- **Tools:**
  - Move (V): drag buildings, NPCs, animals, furniture and fishing spots. A building carries its floor, door, furniture and the people inside.
  - Paint (B): ground, single trees and ore.
  - Forest (F): mixed woods at a chosen density; Shift clears.
  - Trail (T): click points, double-click to lay it; bridges over water.
  - Building (H): drag a rectangle; then set the door side, floors, sign and colours.
  - NPC (N): name, look and shop.
  - Animal (A): any monster or animal.
  - Erase (E).
- Undo and redo (Ctrl+Z / Ctrl+Y).
- **🌍 Atlas:** fly the planet. "Edit here" opens the area under the middle of the view. "New area here" makes a 48–128 m area from the generated land at that spot, and the Area box names it (Town = safe, gets yard birds; or Wild).
- **Terrain in the Atlas** (the operator: "edit the terrain raising and lowering and region type"): the bar at the bottom of the Atlas has Look, Raise, Lower, Flatten and Region type, with Size and Strength. Drag on the planet; it updates live. Strokes are stored on the sphere in `chain/editor/terrain_edits.json`. **Apply terrain to game** writes them into `data/atlas/wg_tables.json` `edits`, which both the game and the Atlas read, so the next release carries them. Needs the terrain patch in the game code (src/wg_terrain.js edit layer, worldgen `setEdits`, earth `pick`/`setEdits`).
- **▶ Walk it in 3D:** a preview build with your edits (chain/editor/preview/, about 0.4 s) at the spot you were looking at.

## Where edits go
- Every change is saved to a working copy, `chain/editor/zone.<id>.json`. The game is untouched.
- **Apply to game** copies it into `data/zone.<id>.json` (version +1; the old file goes to chain/editor/backups/). For a new area, it also adds the id to the `ZONES` lists in `build.py` and `tools/earth_page.py`. It's refused while `release_modular.py` or `release_earth.py` is running. The next release carries applied areas, like any other module.
- **Revert** throws the working copy away (it's backed up first).

## Not yet (WC3-editor style layers the operator may want next)
- cliffs and ramps (heights are in: raise / lower / flatten)
- an object editor for monsters, items and shops
- regions for spawns, weather and music
- triggers for quests and events
- editing the seeded land outside an area: make a "New area here" over it instead
