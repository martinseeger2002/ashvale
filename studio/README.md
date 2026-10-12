# ASHVALE design studio

A browser workshop for **items, NPCs and buildings** that already speak the game's part format
(`data/parts/*.json`) and the GitHub suggestion pipeline.

The world editor (`editor/`) paints tiles and towns. This studio designs the **things** that go in them:
rings, necklaces, wolves, churches, and the rest of the class list.

## Run

From the repo root (do not point this at the live arcade):

```
python3 studio/server.py
```

Then open the URL it prints, usually `http://127.0.0.1:8760/`. It only binds localhost.

## Classes

Pick a class, then remix an existing game asset or start from a template. For items, **add shapes together** (primitives, or copy the pieces of a live part) and **reorient** each one — position, size, rotation — so an artist proposal is a new composition, not a recolour.

- Click a shape in the list or on the preview to select it (it glows).
- Shift-drag moves the selected piece; Alt-drag turns it. The number fields do the same in exact steps.
- **Add those shapes** copies every primitive from another `data/parts` item or gear onto the current design so you can combine a blade, a gem, a ring, and so on.

| Class | What you get | Lands in the game as |
|---|---|---|
| `item:ring`, `item:necklace`, `item:charm`, hats, capes, weapons… | a part + an items.json row | `data/parts/` + `data/extra/items.json` |
| `npc:wolf`, other beasts, `npc:human` | a char part (outfit or beast colours) | `data/parts/char.<id>.json` |
| `building:church`, house, shop, smithy | a placeable object (`k`, size, roof, sign) | suggestion for a zone object |

The game is **flat-shaded, no textures**. Imported PNGs become a colour palette you paint onto shapes. Imported JSON must be an ASHVALE part (`"ashvale3d":"part"`).

## Save and GitHub

- **Save draft** writes `studio/drafts/<id>.json` on this machine (ignored by git).
- **Suggest to GitHub** copies the design onto a clean branch of `origin/main` and opens a pull request titled `Suggestion: …`. Maintainers review it; nothing is inscribed until it is merged and released.

A suggestion never force-pushes and never touches `git config`.
