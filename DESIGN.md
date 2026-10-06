# ASHVALE 3D: design

A classic-RuneScape-style 3D browser RPG (three.js, low-poly) for DogecoinArcade. Requirements, stages and the
acceptance checklist live in **PLAN.md** (source of truth). This file says how the game is built and how to change it.
The old menu-based ASHVALE (~/ashvale) is only read for names, items and stats; nothing here writes to it.

## 1. Decisions

| Topic | Decision |
|---|---|
| Look | Flat-shaded low-poly, no textures (one canvas texture per shop sign). RuneScape-2-style terrain: per-tile colours blended at the corners. Fog, warm sun, hemisphere light. |
| Grid | 1 tile = 1 world unit. x = east, y (map) = z (world) = south. Characters are scaled 0.8 (about 1.5 tiles tall). |
| Ticks | 0.6 s game ticks (RuneScape). Walk 1 tile per tick, run 2 (run energy). Weapon speeds in ticks: sword 4, bow 4 (rapid 3), staff 5, unarmed 4. |
| Rules | Only in `core.js`: deterministic, seeded RNG with saveable state, integer maths, no Date/Math.random. The engine renders the core's state and events and never changes the rules. A referee can replay `core.log` (`AshCore.replay`). |
| Combat | RuneScape formulas. Attack roll = (level + style + 8) x (bonus + 64), defence roll = (def + 9 [+3 defensive]) x (bonus + 64); hit if rand(A+1) > rand(D+1); damage 0..max. Max hit = floor((effStr x (strBonus + 64) + 320) / 640). XP: 4 per damage in the style's skill (2+2 for shared styles), Hitpoints 4/3 per damage, magic +5.5 per cast. Combat level = RuneScape formula. |
| Styles | Melee: Accurate (Attack), Aggressive (Strength), Defensive (Defence). Bow: Accurate, Rapid (-1 tick), Longrange (+2 range, Ranged + Defence). Staff: Cast, Defensive cast. |
| Ranged | The bow is two-handed (the shield comes off). Arrows go in the ammo slot, one per shot; half of them drop under the target and can be picked up. Arrow tier gives ranged strength (bronze 7 ... adamant 31). |
| Magic | A staff auto-casts the best strike/bolt spell for your Magic level (Wind strike max 2 ... Water blast 14). No runes in stage 1. |
| Levels | XP curve = RuneScape's (data/rules.json `xp`, identical to the old world.json table), levels 1-99. Hitpoints starts at 10. |
| Death | 2026-10-01: everything you carry AND wear (pack included) drops on the death tile as ground items (stackables one stack each, tagged `from` = your id and `diedAt` = tick); you wake by the well with full HP and nothing. No keep-3. Piles last `rules.death.pileTicks` (1000 = 10 minutes). Anyone may take a pile immediately (no grace period); in this demo loot is per player, so only you can get yours back until shared loot (stage 3). The death message says where. |
| Weight | Every item has `weight` in integer GRAMS (items.json). Table, kg: GOLD 0.002 each, arrows 0.02, potion 0.3, bread 0.4, shrimp 0.1, trout 0.4, salmon 1.0, lobster 0.7 (raw/cooked/burnt alike), logs 3, oak 3.5, willow 3, maple 3.5, yew 4, ores and coal 2, pelt 1.5, hatchet 1.2, pickaxe 2.2, net 0.5, rod 0.4, lobster pot 1.5, dagger 0.4, sword 1.2, longsword 1.6, mace 1.8, bow 0.8, staff 1.5, kiteshield 4, helm 2, platebody 12, chainbody 9, platelegs 8, hats 0.2, capes 0.8, packs 0.8-3.5. Metal gear x tier: bronze 1.1, iron 1.0, steel 1.0, mithril 0.6, adamant 1.05. Worn gear counts. |
| Carrying | Capacity = 30 kg + 1 kg per Strength level + the worn pack's `carry` (rules.json `carry`). Over capacity = OVERBURDENED: no running, one step every other tick; above 150 % you cannot move until you drop something. You can always pick things up. Weight bar on the Inventory tab, chat warnings on every change. |
| Packs | Slot `pack` (on the back): Leather satchel +10 kg, Canvas pack +20, Reinforced pack +35, Frame pack +55, Enchanted pack +80 (`pack_t1..5`). Slots stay 28. Tam sells t1-t2, Garrick t3, t4-t5 only drop. No NFT key yet (the operator decides minting). |
| Starting points | The creator's step 2: a pool of 10 points, at most 5 in one of Attack, Strength, Defence, Ranged, Magic, Hitpoints, Dexterity, Speechcraft; each point is +1 starting level, granted as XP (skills keep growing by use). Core command `start{pts}`: once, only on a fresh character, validated (sum <= 10, each <= 5); recorded as `start` in the save, and an invalid record in a save is dropped. |
| Dexterity | XP: 1 per damage with bows and daggers, 0.4 per running tick. Effects: run drain -0.5 % per level (max -40 %), dodge chance floor(level/10) % that turns a monster's hit into 0 (seeded, deterministic), daggers and bows 1 tick faster at 50. |
| Speechcraft | XP: 0.1 per GOLD bought or sold, 25 per quest conversation that starts or advances a step. Effects: shop prices -0.4 % per level when buying (max -30 %), +0.4 % per level when selling (max +30 %), never above that shop's own price for the item; shown in the shop header. |
| Aggression | A monster with `aggro` > 0 attacks the nearest player within that many tiles whose combat level is at most twice its own (RuneScape rule). It targets whoever hurt it most recently (groups can tank). Animals (rat, wolf) step straight at you, so trees make safe spots. Humanoids have the behaviour layer below. Monsters never step onto a player; several melee attackers take the free tiles around a monster. |
| Humanoid AI | Goblins, bandits, the leader (monsters.json `ai`, host-only, deterministic): BFS paths around trees and through doorways (cached, depth 14-30, so the per-tick cost stays bounded); leash 12 tiles, then walk back to the post and patrol within 2 tiles; group aggro by faction when one is hurt (allies near it or posted near it, 6 tiles; 10 for the leader's guards); archers (zone spawn `carry` arrows) keep 4-6 tiles with line of sight, shoot visible arrows, back off when you close in, and draw the sword when cornered or out of arrows; goblins flee to camp below 25 % once and come back with friends; the leader drinks the potion he carries once below 30 % and raises his shield (25 % of attacks need twice the roll). What they carry drops when they die. |
| Respawn | No timer respawns. A dead monster stays dead while anyone is in its zone; the zone repopulates (all spawns, full HP, fresh carry) when a player enters it after it was empty for `rules.respawn.emptyTicks` (50 = 30 s): the operator's "leave the area and come back". |
| Walk / run | the operator: a single click or tap walks, a double-click or double-tap runs. Commands carry the mode (`walk{x, y, run}`, also `attack`/`take`/`npc`/`gather`), so it is recorded and replayed. The first tap starts walking at once; a second tap within 300 ms near the same spot re-sends the same move with `run`. No energy or overburdened: it walks (with a hint). The run orb only shows energy. |
| Loot | GOLD (item `coins`, shown as "GOLD") drops at the fixed amount from the old world (wolf 12) so chain GOLD pools stay valid. Item drops use the old one-in-N tables plus non-NFT extras (pelts, arrows, bread). Ground items last 3 minutes. |
| Items | 35 Armoury kinds (7 slots x 5 tiers, keys = NFT trait `Key`, e.g. `sword_t1`) + arrows, food, potion, tools, logs, ores, fish. T5 is **Adamant** (the inscribed NFT names), not rune. Value = slot base x tier factor (1, 3.5, 12, 40, 130). |
| Shops | General Store (Tam, inside, behind the counter): food, potions, tools; buys anything at 40%. Armoury (Garrick): tier 1-3 weapons, armour, bows, staffs, arrows; buys its own kinds at 60%. Tier 4-5 only drop (they are the rare NFTs). |
| Gathering | Woodcutting (trees, oaks at 15), Mining (copper, tin, iron at 15), Fishing (net shrimps at the lake), Cooking (the range by the plaza; burn chance falls with level). A roll every 4-5 ticks; trees fall to stumps, rocks empty, both grow back. |
| Buildings | Walk-in: floor tiles `i`, walls stand on tile **edges** (core `wall` bits N1 E2 S4 W8), the door edge is open. The roof hides while you are inside (RuneScape). Furniture blocks its tiles. Monsters never enter buildings. |
| Hats and capes | 6 hats (head slot, 0 defence) and 6 capes (cape slot) sold by Wren's Tailoring (15 to 1000 GOLD, a GOLD sink); worn ones override the outfit's hat/cape. |
| Outfits | Character creator at first start; Wren the tailor (outside the General Store) reopens the wardrobe. The look is cosmetic, saved in the player save and sent to other players; armour covers outfit parts. |
| Saves | localStorage `ashvale3d.save.v1` (the player export: name, look, xp in tenths, inventory, equipment, styles, quests). Settings in `ashvale3d.settings.v1`. Every access is in try/catch (private mode works, just without saves). |
| Phones | Touch: tap = act, drag = rotate, pinch = zoom (+ two-finger twist rotates), long-press = options menu. Pixel ratio capped at 1.75 on phones, shadows off by default on phones (blob shadows instead), WebGL context loss shows a reload message, `100dvh`, inputs 16 px (no iOS zoom). |

**HARD RULE: only @ashvale assets.** 2026-10-01: "only items that were inscribed and tokens created by @ashvale
should be allowed in the game". NFTs count only if their creator is @ashvale (`nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c`), and
tokens only if @ashvale issued them. Every code path that reads wallet items must filter through `allowedAsset()` (engine.js)
before anything reaches the game; trade.js offers only @ashvale NFTs. No exceptions, also for future modules.

**Drops (2026-10-01):** animals drop only their pelt (rat -> rat pelt, wolf -> wolf pelt), never weapons or GOLD;
pelts sell in town. Armed enemies (goblins, bandits, the leader) drop what they carry: their worn weapon and armour every
time, plus their purse and pocket items (make_data.py `INVENTORY`/`ANIMALS`).

## 2. Controls

| | Phone | Desktop |
|---|---|---|
| Walk / attack / take / talk / chop | tap | left click |
| More options (Walk here, Examine, ...) | press and hold | right click |
| Rotate camera | one-finger drag (or two-finger twist) | arrow keys, middle-drag or left-drag |
| Zoom | pinch | mouse wheel |
| Panels | tab buttons on the right | I inventory, E equipment, S skills, C combat, Q quests, R run, Esc close |
| Eat | tap food in the inventory, or tap the HP orb (eats the first food) | same |
| Run | tap the run orb | R |
| Walk far | tap the minimap | click the minimap |

## 3. Modules (each one is replaceable on its own, and is one future inscription)

| Module | File | Interface (api) | What it is |
|---|---|---|---|
| `three` | dist/modules/three.mjs | 160 | three.js r160, tree-shaken to the classes the game uses (`src/three_entry.js` is generated by build.py from actual `THREE.*` usage). |
| `core` | src/core.js | 1 | the rules (no three.js, runs in node and QuickJS). |
| `scene` | src/scene.js | 1 | builds one region of the world (terrain, water, trees, rocks, buildings, props) + the minimap picture. |
| `models` | src/models.js | 1 | every character, monster, NPC, item, projectile, icon, animation and outfit (owned by Claude main). `createModels(THREE)`. |
| `hud` | src/hud.js | 1 | all 2D interface (DOM). No three.js. |
| `net` | src/net.js | 1 | other players: `join(room) -> {online, room}`; arcade realtime SDK, else dev loopback (`?loopback`), else solo. |
| `engine` | src/engine.js | 1 | glue: renderer, camera, input, entities, ticks, sounds. `start(host, opts)`. |
| data | data/items, monsters, shops, quests, rules .json | 1 | pure data. |
| regions | data/zone.village.json, zone.whisperwood.json | 1 | one per region (see 5). |
| parts | data/parts/<id>.json (60 now: char.*, gear.*, cloth.*, item.*, body, palette) | 1 | model parts as pure JSON shapes (no code), validated by models.js; registry group `parts`, loader name `part.<id>`; generated by tools/make_parts.py (Claude main). A new hat/character = a new part file. |

`src/loader.js` is the only code baked into every page and never replaced: `ASH3D.define(name, {api, v, needs}, factory)`,
`ASH3D.defineData(json)`, `ASH3D.boot({baked, registryUrl})`.

### Registry (dist/registry.json)
```json
{"ashvale3d":"registry","version":1,"loader":1,
 "modules":{"three":{"id":"<inscription id>","v":"0.160.0","api":160,"kind":"esm","gz":true},
            "core":{"id":"..","v":"1","api":1,"kind":"js"}, "engine":{..}, "scene":{..}, "hud":{..}, "models":{..}, "net":{..},
            "data":{"items":{"id":"..","v":1,"api":1,"kind":"json"}, "monsters":{..}, "shops":{..}, "quests":{..}, "rules":{..}},
            "zones":{"village":{..},"whisperwood":{..}}, "parts":{"char.wolf":{..},"gear.sword":{..}, ...}}}
```
Boot: fetch the newest registry (fallback: the copy baked into the page); for each module use the page's own copy when
it has exactly that version, else fetch `/content/<id>` (gzip via `DecompressionStream` when `gz`; ESM via a `blob:`
import). Then every module's `needs` is checked against what loaded: an incompatible newer module falls back to the
page's baked copy; if nothing fits, the page says "Open the newest ASHVALE page" instead of breaking.

## 4. Upgrade recipe (replace one module)
1. Change the module's file. If its interface stays compatible, bump only its `v` (in its `define(...)` meta, or `"v"`
   in a data module). If you change what other modules can rely on, bump its `api` AND the `needs` of every module
   that uses it (they must be republished too).
2. `python3 build.py --three-esm` (writes dist/modules/*, dist/registry.json, the pages), `node tests/core_test.js`,
   `python3 tests/play_pw.py`, look at every screenshot.
3. The operator playtests the private build on his iPhone and says OK (PLAN.md release gate). Only then:
4. Inscribe the changed module(s), put the new ids in the registry, raise `version`, inscribe the registry.
   Every page ever published picks it up on its next load. Never rename or remove item keys, monster keys, skills or
   quest steps (saves, NFTs and referee replays depend on them): only add.
Upgrading three.js = change `THREE_V` + `tools/esb` package, rebuild, test, inscribe `three` + a registry whose
`three.api` matches what engine/scene/models `need` (bump those if three's API changed).

## 5. Regions (extending the world)
A region is one JSON module, `zone.<id>`, small (the two now are 3-4 KB; keep each well under 30 KB):
```json
{"ashvale3d":"module","name":"zone.village","api":1,"v":1,"data":{
  "name":"Ashvale village","origin":[0,40],"size":[48,24],
  "tiles":["<48 chars per row>", ...],
  "objects":[{"k":"shop","x":7,"y":42,"w":6,"h":5,"door":[10,46],"enter":true,"sign":"General Store","roof":"#7a3b2a","wall":"#d8c9a3"},
             {"k":"torch","x":22,"y":42,"w":1,"h":1}, ...],
  "npcs":[{"id":"tam","name":"Tam the grocer","look":"tam","x":9,"y":43,"shop":"general"}, ...],
  "spawns":[{"m":"wolf","x":19,"y":13}], "fishing":[{"x":37,"y":56,"fish":"shrimp_raw"}],
  "respawn":[22,52]}}
```
Coordinates are WORLD tiles. The core merges every region listed in the registry into one grid (one seamless open
world); the scene builds each region's meshes separately and the engine streams them in within 40 tiles of the player
and drops them beyond 70.

**Tile letters** (rules.json `tiles`): `.` grass, `,` forest floor, `p` path, `d` dirt, `s` sand, `f` flowers, `i` floor
inside a building, `~` water, `T`/`P`/`O` tree/pine/oak (choppable), `R`/`N`/`I` copper/tin/iron rock, `r` boulder,
`F` fence, `X` blocked prop, `H` solid building (not enterable). Blocking and line-of-sight letters are data.

**Object kinds** (scene): `house` `shop` `smithy` (with `enter:true`: walk-in), `well`, `torch`, `anvil`, `rack`,
`range` (cooking), `barrel`, `crate`, `tent`, `campfire`, `stall`, furniture `shelf` `counter` `table` `chair` `bed`
`fireplace` `furnace`. An unknown kind is simply not drawn (old pages keep working), so a new kind = a scene upgrade.

**Recipe: a new town / area**
1. Write the region in `tools/make_data.py` (or by hand): origin next to an existing region, tiles, objects, NPCs,
   spawns. Monsters must exist in data/monsters.json (add them there, and ask the models owner for a model).
2. Build, test (walk in from the neighbouring region), playtest, the operator's OK, inscribe the region + a new registry.

**Recipe: a building interior** Add an object with `enter:true`, a `door` tile on its edge, `i` floor tiles inside,
furniture objects inside. Roof hiding is automatic.

**Recipe: a cave or tunnel** (stage 2) Underground regions use an origin far from the surface map (for example y >= 1000)
so they never overlap. An entrance object (`k:"entrance"`, `to:[x,y]`) teleports the player in the core (a new
command, deterministic) and the scene shows the cave region; ladders work the same way. Caves use `X`/rock letters for
walls and darker ground colours (a `ground:"cave"` field picks the palette and fog).

**Recipe: new kinds of things** New NPC types, skills or object kinds are data first (rules.json `nodes`, `skills`,
items.json), plus a new module version where code must change (core for rules, scene for drawing, models for meshes,
hud for panels). Unknown fields are ignored by old modules, so adding never breaks old pages.

## 5a. v0.4: drag and drop, firemaking, abilities, weather, cross-border retaliation
- **Inventory drag and drop** (the operator): core command `move{from, to}` (swap or move into an empty slot; replayed). HUD:
  mouse drags after 6 px; on touch hold about 150 ms then move (a quick flick does nothing, a tap uses the item, holding
  still opens the options menu). A ghost icon follows the pointer. Drop on a slot = move or swap; on the Equipment tab
  or an equipment slot = wear; over the world = drop at your feet (shared ground in multiplayer); on other interface =
  nothing. The slot captures the pointer, so the camera never moves.
- **Firemaking** (the operator: "drop some wood, start a camp fire and cook"): skill `firemaking`, tool `tinderbox` (Tam, tool/
  tinderbox). Logs carry `Firemaking level`, `Burn ticks`, `Firemaking XP` traits (logs 1/100/40, oak 15/120/60, willow
  30/140/90, maple 45/170/135, yew 60/200/202). Tap logs (or "Light") with a tinderbox: a few tries (50 % + 2 % per level
  over the requirement), then a campfire on your tile, XP, and you step off it. Cook on a fire like on a range (+10 % burn,
  rules.nodes.fire). Fires are host-owned zone state (`S.fires`; replicas send `XF`, the host broadcasts `f`/`fo` events
  and includes fires in its full snapshot) and burn out.
- **Abilities as data** (the operator: "a staff that ... freezes the enemy"; "items that have new abilities"): an item's JSON
  attributes `Effect`, `Effect ticks`, `Effect chance` (%), `Effect damage` drive `core.EFFECTS`: freeze and stun (no
  moving or attacking), slow (acts every other tick), poison (damage every 3 ticks), burn (every 2 ticks). Rolled on a
  landed hit, so host-resolved; replicas get `x`/`xe` events. Unknown effects are ignored (older engines stay safe).
  The model gets a tint (`H.setTint`) and freezes its pose (`H.setFrozen`); a round effect splat shows (snowflake for
  freeze). First item: **Frost staff** (`staff_frost`, weapon/staff, tier 3, Magic 20, freeze 5 ticks at 25 %), sold by Garrick.
- **Weather** (the operator: "Any zone should be able to have weather like fog rain or snow"): zone JSON `weather {kinds:
  {kind: weight}, min, max}`; `rules.weather.kinds[kind]` holds generic multipliers the rules read: `sight` (monster aggro
  radius), `range` (bows and spells, players and monsters), `fireFail` (extra firemaking fail chance), `fireBurn` (campfire
  burn time), `run` (share of running ticks that cover two tiles). Effect = 1 + (mult - 1) x intensity (50-100 %). Rolled
  by the zone's host from the seeded RNG; replicas take it from the host (`w` event, `W` in the full snapshot). A chat line
  on change. Visuals: src/weather.js (own module) when present, else scene fog. Village mostly clear (rain, fog);
  Whisperwood more fog, a little snow.
- **Attackers can be attacked back across borders** (the operator: "If you can attack an attacker, the attacker should be able
  to attack you back even if you're not in its zone"): a monster hit in the last `rules.retaliate.ticks` (10) keeps its
  attacker as target past its zone and leash (up to `beyond` 12 tiles past the leash), steps out of its zone, shoots back
  when it has line of sight; normal leash and walk-home when the attacks stop. Shared world (since globe P2): everyone in the
  region is in one room, so the host of the monster's area resolves the fight; when nobody stands in that area, the players
  fighting there (state field `c` = the area you fight in) elect its host. The old "sit in the other zone's room" trick is gone.

## 5b. SHARED WORLD (v0.3)
The operator: "the enemies should be in the same location for all players. The players should share the same enemies."
- **Since globe P2 (2026-10-02): one room per REGION, one host per AREA** (the operator: "when players move from one zone to the
  other, they disappear to anyone in the other zone. If the zones are adjacent then the player should be visible"). Room id =
  `core.regionOf(x, y)` (512 m squares, `vale:face:rx:ry`; the village and Whisperwood share `vale:11:0:0`). Areas =
  `core.areaOf(x, y)` (a zone id inside a set piece, else a 128 m square `face:ax:ay`). Inside the room every area has its own
  host, elected among the members STANDING in it (rule below); an area nobody stands in gets its host from the members
  fighting there. Everything below "host" is now per area: a game applies monster rows, events, ground, fires and weather
  only from the current host of THAT area (engine `eventFromHost`), and intents (C claim, X drop, XF fire) are acted on by
  the host of the target's area. An area with no host (nobody there) runs in every game, as before. Hosts create ground
  items and fires in their own uid space (`core.uidSpace(salt)`: salt x 2^20 + n), so two hosts never clash. No arcade
  change: still /r/realtime.js rooms. **Neighbour regions (2026-10-04):** within 40 m of a region edge a client also joins
  the next region's room through the game-agnostic `net.neighbours({game, max, on})` (`update(near, keep)`, `rooms()`,
  `close()`; keep radius 56 m so a border walk does not flap) as a VIEWER: it draws that room's players and sends there only
  `nb:1` presence (position/look every 1.5 s, gear+name every 15 s), sharing the main room's 5/s send budget. Viewers are
  never puppets or hosts. Tests: tests/shared_pw.py `neighbours`.
  Tests: tests/shared_pw.py `adjacent` (A in the village and B in Whisperwood see each other and their moves, a host per
  area, A walks across and B sees A all the way, a cross-area bow fight).
- **One host per zone room** (v0.3 wording; read "area" for "zone room"): the earliest-joined signed-in member (guests only if no signed-in player is there), tie-break by id.
  Everyone sends its join time `j` in its state; a newcomer listens 2.5 s before deciding. Leave event or 12 s silence ->
  re-elect; the new host takes over from the state it already mirrors (monsters + ground items) and moves its uid counter on.
- **Core**: `setAuth(zone, on)`. A replica zone runs no monster AI and rolls nothing there; its monsters/ground come from the
  host (`applyMobs`, `groundAdd/Remove/Full`). Other players are **puppets** in every core (`addPuppet/setPuppet`: tile,
  HP, dead, levels, gear, styles, current attack target); the host rolls their attacks and the monsters' attacks on them.
  Each player stays the authority over their own HP, inventory and XP: `applyHit` (monster damage), `hitXp` (XP for their
  own damage), `creditKill` (quests), `grantItem` (a won pickup). A replica's pickup becomes a claim (first claim wins on the
  host); its drops (and death piles) are sent to the host (`xdrop` -> `hostDrop`).
- **Messages** (all <= 500 B): state `{s, p, f, a, j, hp, d}`; gear `{g, n, L: levels, st: styles}`; intents `{A: attack uid|0}`,
  `{C: ground uid}`, `{X: [item, n, x, y, life, from, diedAt]}`; host extras (merged into its own state every 400 ms):
  `M: [[uid, x, y, hp, dead]]` changed monsters, `E: [...]` events: `a` attack, `h` hit (src, dst, dmg, hp, class, flags
  blocked/dodged/dex), `k` kill (uid, killer), `s` spawn, `d` drop, `t` take (uid, who, item, n), `v` vanish, `n` stack count,
  `e` monster drinks. Full snapshot `{F, M}` + `{F, Gr, G}` every 5 s and when someone joins.
- **Send budget**: an outgoing queue never sends more than 5 messages in any second or 9 in any 2 s; a newer position state
  replaces a queued one. Measured: host ~2/s average.
- Tests: `tests/shared_pw.py` (loopback and the arcade mock): same monster positions on every client, A's fight seen by B,
  one pelt and only one taker, B's attacks resolved by the host with B's XP, host leaves mid-fight, repopulation, three
  players on the bandit leader (one kill, one drop, everyone's own XP), budget.

## 5c. ASHVALE ITEM SCHEMA v1 (items.json = the inscription JSON)
The operator: "utilizing the JSON string for item inscriptions and category and sub category for anything that is programmatic".
```json
{"name": "Bronze sword", "description": "...", "collection": "ASHVALE Armoury", "game": "ashvale",
 "category": "weapon", "subcategory": "sword", "tier": 1, "weight": 1320, "req": {"attack": 1}, "model": "gear.sword",
 "value": 30, "stackable": false,
 "attributes": [{"trait_type": "Attack", "value": 4}, {"trait_type": "Strength", "value": 3}, {"trait_type": "Speed", "value": 4}, {"trait_type": "Range", "value": 1}],
 "nft": {"key": "sword_t1", "copies": 25}}
```
- **category / subcategory**: weapon (sword dagger longsword mace bow staff), armour (helmet platebody chainbody platelegs
  kiteshield), tool (hatchet pickaxe net rod pot), pack (pack), cosmetic (hat cape), resource (logs ore coal bar pelt fish
  mushroom), food (bread fish mushroom), potion (healing), ammo (arrow), currency (gold). `weight` in grams, `value` in GOLD.
- **Traits** (attributes): Attack, Strength, Defence, Ranged, Magic, Ranged strength, Speed (ticks), Range (tiles), Carry
  (kg), Heal, Heal %, Cooks into, Burns into, Cooking level, Cooking XP.
- **Everything programmatic comes from these** through `rules.json` `items`: slot (`slots`: category or category/subcategory),
  weapon class/animation/two-handed (`weapons` by subcategory), gathering tool skill (`tools`), edible/drink (category),
  stacking (`stackable`), shop buying (shops list categories, e.g. Armoury buys weapon, armour, ammo, pack). `core.normItem`
  is the only place that reads the schema; no item id appears in any rule.
- `validItem(json, rules.items, {chain, creator})` checks shape, vocabulary, the @ashvale creator for chain items and stat
  ranges per tier; `clampItem` pulls numbers into range. `fromArmoury(nft)` maps the 462 inscribed Armoury NFTs (traits
  Key, Slot, Tier, Req, Attack..., Copy) to schema v1 (tested on real inscriptions from the arcade, tests/fixtures).
- **Stackables are @ashvale TOKENS** (Omni issuance fields: category, subcategory, name, url, data). Same vocabulary;
  `data` = `{"about", "icon": "<txid>", "ashvale": {id, tier, weight, req, attributes}}`. `data/tokens.json` is the
  issuance spec per stackable (33 now). Gear, packs and cosmetics are NFTs (category/subcategory inside the inscription JSON).
- **Wallet reads** (`ASH.wallet`, feature-detected): `/r/tokens?ids=` and `/r/balances/<addr>`; only issuer
  `nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c` counts. Legacy tokens with empty category (issued before the schema) use a table by
  property id, only when @ashvale issued them: #26 currency/gold (= item coins), #20-#25 xp/attack, strength, defence,
  ranged, magic, hitpoints.
- **Durability (later, compatible)**: item condition 0-100 per item INSTANCE with a `seq`, stored by the arcade's per-NFT game
  state (approved by the operator); the schema item stays the kind, condition is instance state.

## 6. Multiplayer (arcade demo) and the arcade page
**Contract (Arcade realtime, master 7e951fb):** `arcade.realtime.join(name, {game:'ashvale'})` -> Promise<Room>, never
rejects (`room.online === false` + `room.why`, e.g. in the feed embed: solo). `room.me = {id, address, tag, guest, node}`
(guests: id `guest-...`, tag ''). `on('join'|'leave', p)`, `on('message', (data, p))`, `on('closed', why)`;
`send(value)` -> Promise, rejects over 512 B UTF-8 / too fast (~5/s, burst 10) / not in room; `leave()` -> Promise.
No echo. `net.js` (api 2) wraps it into one normalized interface (`{from, data}` events, `send` never throws) shared with
the `?loopback` BroadcastChannel backend used by tests.
**What we send** (state, best-effort, unordered): position `{s, p:[x,z], f, a}` at 4 Hz (`s` = sender time, older states
are dropped), `{g:gear, n:name}` and `{o:outfit}` on join, on change and whenever someone new joins, chat `{t}`.
Remote players are keyed by `p.id` and labelled from the arcade-stamped tag: "Name (@tag)" or "Name (guest)"; the name
inside a message is only a display name. Drawn 150 ms + one send interval behind, interpolated.
**Chat:** the box under the chat log (Enter on desktop) sends to everyone in the same zone room; 120 chars, at most one
line per 1.2 s and 5 per 10 s locally; shown in the log and as a speech bubble for 4 s.
**Scope (honest):** monsters, loot and the rules run per player in this demo (no shared authority); the help card says
so. Zone change = `leave()` the old room, `join()` the new one. On `closed`, retry after 15 s.
**Saves on the arcade:** an inscribed page has no localStorage (it throws). `engine.openStore()` uses
`arcade.storage.ready` (`getItem`/`setItem`, async; rejects outside a viewer), else localStorage, else memory only;
reads are cached before `start()`, writes go through and never throw. The settings panel shows where saves go.
**Arcade page:** `python3 build.py --arcade` -> `dist/ashvale3d_arcade.html` (about 300 KB, 85 KB gzipped): loads
`/r/realtime.js` and `/r/storage.js`, inlines every game module, and imports three.js r160 from its inscription
(`/content/374cfd2b...9539`, the official `three.module.min.js`) in a module script that then boots. The registry's
`three` entry carries that id. Local test against a mock arcade: `python3 tests/arcade_pw.py` (tests/arcade_mock/).
`net.voice` is the hook for proximity voice (planned).

## 7. Data formats (short)
- `items.json` `items.<key>`: `name, kind, tier, eq (slot), req {skill: level}, attack/strength/defence/ranged/magic,
  rstr, speed, range, class, anim, twoHanded, stack, heal, healPct, tool, value, nft {key, copies}`.
- `monsters.json`: the old world's stats (`level hp att def attb defb max speed aggro respawn(ticks) gold drops`) + `anim, look`.
- `shops.json`: `shops.<id> {name, keeper (npc id), stock [item keys], buys ("any" | [kinds]), buyRate, sellRate, greet}`.
- `quests.json`: `quests.<id> {name, giver, steps [{zone, goal {kill, n}, reward (item key | "xp:skill:n"), talk []}]}`.
- `rules.json`: `xp` table, tile letters, gathering `nodes`, `skills`, `spells`, starting kit.
- Player save: `{v, pos, name, look, xp {skill: tenths}, inv [28 x {id, n} | null], eq {slot: {id, n}}, styles, run, retal, quests, hp, energy}`.
  v2 (globe P2): `pos = [face, x, y]` in face tiles (globecfg); loads standing there if walkable. v1 saves (v0.5 and older) have
  no position and start at the village well, as always (the village and Whisperwood keep their coordinates: vale frame =
  face tiles minus globecfg.origin).
- Commands (`core.cmd(pid, c)`): `walk{x,y} attack{uid} take{uid} npc{id} gather{x,y} use{slot} equip{slot}
  unequip{eq} eat{slot} drop{slot} buy{shop,item,n} sell{shop,slot,n} style{i} run{on} retal{on} close{} look{look,name}`.

## 8. Testing
- `node tests/core_test.js`: rules (shops, equip rules, combat, drops, bow, gathering, quest) + replay determinism.
- `python3 tests/play_pw.py` (needs `python3 -m http.server 8731` in this folder): headless Chromium with SwiftShader.
  Headless Firefox crashes on WebGL on this machine, so Chromium is used. Desktop 1280x800 + phone 844x390 with real
  touch (CDP): creator, walk, shop, equip, wolf fight (mid-swing shots), loot, bow + arrow in flight, sell, roof
  hiding, quest, the five tiers on the model, drag/pinch/long-press. Screenshots land in tests/shots/.
- `python3 tests/pw_smoke.py [query] [w] [h] [name] [js]`: one screenshot plus console errors.

## Trades (Arcade, branch claude/trade @730d365; not live until the operator's OK)
Load `/r/realtime.js` + `/r/swap.js`; both players must be in a joined realtime room together. Guests can't trade.
- SIDE = `{inscription: txid}` | `{token: pid, amount: 'decimal string'}` | `{coins: '1.5'}`; at least one side must be an NFT.
  GOLD = `{token: 26, amount: 'N'}`.
- `arcade.swap.trade({with: playerId, give, get})` → Promise {id} (an "Offer this trade?" card appears; rejects on cancel).
- `arcade.swap.answer(id, accept, why?)`, `arcade.swap.cancel(id)` (until broadcast).
- `arcade.swap.items()` → {address, inscriptions, balances} (raw /r/inscriptions + /r/balances shapes).
- `arcade.swap.onTrade(fn)` → fn({id, status, with, give, get, role, why, txid}); status proposed | incoming | accepted |
  signed | broadcast | settled | declined | cancelled | failed. "settled" = mined and the NFT really moved.
- Three cards in total (offer, accept, finish), then about 1 minute for the block. Both players need a published messaging key.
ASHVALE: src/trade.js (trade window module) + a "Trade" option on remote players.

## Refereed escrow (Arcade, branch claude/escrow @44030a0; not live until the operator's OK; guide arcade/web/docs/escrow.md)
Game JSON beside "game": "escrow": {"referee": {"pubkey": "02…", "node": "<url if not the player's arcade>"}, "judge": "<judge id>",
"params": {…}, "unlock_hours": 24}. unlock_hours is the MAX lock, 1..720; the page asks for fewer with open({hours}).
Judge: judge(seed, inputs, params) → {release: true} | {release: false, why} (optional `to` must equal the asked address);
params = our params + escrow:{address, owner, unlock, game, inscriptions, tokens} + to + items; inputs = the page's `replay`.
Page (/r/escrow.js): arcade.escrow.open({hours}) → {escrow, owner, owner_pubkey, unlock, referee, game};
deposit(escrow, [{inscription}|{token, amount}]) → {txids} (one card, one tx per item, 0.03 coin left per item for its move
out); status(escrow); release({escrow, owner, owner_pubkey, unlock, to, items, replay, coins?}) → {txids, verdict} (anyone
may call it; the judge decides); mine(). ASHVALE death drops: open+deposit when leaving the bank; on death share the facts
over realtime; the picker's page calls release({to: picker, items, replay}); the ASHVALE judge checks the pickup evidence.
After unlock the owner can always reclaim from the wallet.

## Per-NFT game state (Arcade, LIVE master c6bae48; guide /docs/game-state.md)
Game JSON beside "game" (with game.family): "state": {"publisher": "nYW2BPLENpu2nGa7WCExvzxD3hQYueULFa", "judge": "<judge id>",
"params": {…}, "show": {"c": "Condition"}}. Judge: judge(seed=family, inputs=replay, params + {family, items:[{piece,state}],
current:{piece:state|null}}) → {update: true} | {update: false, why}. Page: /r/state.js → arcade.state.get(piece[, family]),
arcade.state.update([{piece, state}], {replay}) → {txids, updates}. State ≤ 96 B JSON (e.g. {"c": 61}), ≤60 pieces per
announcement, visible after a block. Raw: GET /r/state/<piece>, /r/state/<family>/<piece>. A family belongs to the
first creator who declared it (@ashvale).
